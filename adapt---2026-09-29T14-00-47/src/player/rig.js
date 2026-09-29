// ---------------------------------------------------------------------------
// THE RIG'S BODY ANGLES (part 78 of the player.js split).
//
// The front half of `updateVisual`: how the whole RIG is turned and squashed
// before any shape is worn. It reads the state and writes three numbers —
//
//   pitch  the rig's forward lean about the hips (the state's own body angle:
//          the slam's meteor tilt, the macaco's whole turn, the dive's
//          speed-read, the skyfall/plunge cross-fade, the clash's drive, the
//          flips and the kicks),
//   sy/sxz the vertical / lateral SCALE (the squash-and-stretch the same
//          states ask for), applied to `inner.scale` after the body's own
//          `squash` channel is spent on top,
//
// ...plus the rig's own TURNS: the `spinX` tumble (the roll, the double jump's
// revolution, the kick-flip, and the tidy-up that winds a leftover partial turn
// on to the next whole revolution), the `dashSpinY` step spiral, and the whole
// `inner.rotation.y` chain (the smash's hammer, the whirl's whip, the sweep's
// spin, the step's spiral, the flash grab's 360, and the settle that squares
// whatever is left). It also ticks the plunge's cross-fade and spends the
// macaco's deck lift, because both are read by this frame's angle AND pose.
//
// `pitch` is RETURNED, not applied: the caller still needs it (the lunge's ball
// placement, the skyfall's brace, and the limb stretch all add to it), so this
// method solves the number and hands it back with `spinExtra` — the tumble
// alone, which the first-person camera reads through `bodySpin`.
//
// Part 81 adds THE FINAL RIG WRITE, `solveFinalRig(dt, speed, pitch, ud)`: the tail of
// `updateVisual`'s rig work — squaring up any leftover whole-rig turn, writing
// the final forward pitch (the state lean + the tumble/dash/grab-flip/vault
// turns + the ground's speed lean), then spending the limb stretch and the
// neck split.
//
// A LEAF with respect to player.js: it imports `P` (player/config.js),
// `TAU` + `approach` (player/math.js), `vaultLift` (player/vault.js) and the
// three dive/fall constants (player/pose.js). `installRig(Player)` copies BOTH
// methods onto `Player.prototype`.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { TAU, approach } from "./math.js";
import { vaultLift } from "./vault.js";
import { DIVE_LEAN_BASE, DIVE_LEAN_SPEED, FALL_POSE_FADE } from "./pose.js";

const rigMethods = {

  // Turn and squash the whole rig for this frame, and hand back the pitch it solved (see the header).
  solveRigAngles(dt, speed) {
    const inner = this.inner;
    let pitch = 0;
    let sy = 1;
    let sxz = 1;
    // ---- THE STAFF'S TWO GROUND MOVES ARE NOT FALLING (session 151) ------------------------
    //
    // The strike and the throw are authored as GROUND moves: `poleStrike`'s own gate fires them
    // from a foot on the deck, and the strike then carries the body forward at `POLE_ATK_V` 17 u/s
    // as a floor (see the note in the `POLE_*` block). What the world makes of that is a body
    // moving 0.28 u a frame, and the floor test reads it as *airborne* on alternate frames — the
    // same reading that left the legs frozen (see `poleFlow` in the leg block below) and that this
    // branch was quietly eating a second way.
    //
    // The `!this.grounded` branch below is a FALLING body's posture: a lean into the dive and a
    // squash down the axis of the fall. On a body that is running along the deck it is pure
    // fiction, and at 17 u/s it is 28 degrees of it — `pitch = Math.min(0.5, speed * 0.035)` is
    // saturated, so the whole rig (LEGS INCLUDED, this is `inner.rotation.x` and not the torso's
    // own lean) lay down onto the front foot for the entire flurry. Measured through the real
    // pipeline: `inner.rotation.x` sat at **0.500 rad** from t 0.35 to the end of the clock, while
    // the shape's own authored `lean` asks for 0.02 … 0.34 — i.e. the pose's own weight shift was
    // buried under a 29-degree forward pitch it never asked for, and the flurry read as a man
    // diving face-first with a stick. It is the same reading, and the same fix, as `poleFlow`:
    // both moves are fired from the deck by construction, so both are decked here too. The two air
    // windows that stand the gate down are excluded, because a flurry thrown off a ledge IS air.
    //
    // The lean the charge deserves is not lost with it: it belongs to the TORSO, where the run
    // cycle puts its own (poseRun's `lean`, up to 0.68 at a sprint) and where the shape authors it
    // per beat — which is the whole difference between a running body and a tipping one.
    //
    // The predicate is deliberately the same one the LEGS use (`poleFlow`, below) and not a narrower
    // one: a flurry fired off a ledge is excluded by the two air windows, but an ordinary M1 pressed
    // in the middle of an ordinary jump is not, and it must not be — the legs are already reading the
    // ground for that frame (`poleFlow` is what lets them run at all), and a body whose trunk believes
    // one story and whose legs believe another is the exact class of bug this file has spent sessions
    // removing. A ground move on a ground body is the whole of what this says.
    const poleDriven = (this.state === "poleatk" || this.state === "polethr") &&
      this.airComboT <= 0 && this.airFinisherT <= 0;
    // The macaco's lift off the deck, spent with the bank below (see the macaco branch).
    this.macacoLift = 0;
    // The tumble alone — the roll's spin and the double jump's revolution, with none of the
    // *aimed* body lean — handed to the first-person camera at the end of this method.
    let spinExtra = 0;

    // THE PLUNGE's own cross-fade (see the `plunge` block in `update`, and the skyfall branch
    // below): whether M1 has the fall held into its downward dive. Ticked here, at the top of the
    // angle chain, because it is read by the angle AND the pose's shape on this same frame.
    this.plungePose = approach(this.plungePose, this.plunge ? 1 : 0, dt / FALL_POSE_FADE);

    if (this.state === "slam") {
      // The drop's own lean. It used to be nearly flat (1.42 rad — a nose-down drill), which is the
      // shape of a CANNONBALL. The drop is a METEOR now (see `poseSlam`): both fists CLOSED and over
      // the head, knees tucked, trunk arched. A body laid that far over reads a shape that lives
      // along its own axis as a shank from the chase camera (measured on the pose sheet), so the
      // lean is a steep forward tilt instead — the fists and the tuck stay legible for the whole of
      // the fall, and the landing (fists into the deck) picks the shape up from there.
      const t = Math.min(1, this.stateTime / 0.12);
      pitch = 0.72 * t;
      sy = 1.06;
      sxz = 0.94;
    } else if (this.state === "macaco") {
      // THE MACACO's turn (see `startMacaco` and streetwear.js's `MACACO_TURN`): the whole body
      // comes over the hand it planted, so the rotation belongs to the RIG and not to a set of
      // limb angles — a cartwheel is one turn of the body about the hips. It is a FORWARD turn
      // (+rotation.x is the head going down and under, the same way the roll winds), and the curve
      // finishes on exactly one whole turn, so the handover back to the ground states is a no-op
      // rather than a spin back. The lift over the top is its own curve, spent below.
      const mc = this.charMesh && this.charMesh.userData.macacoCurves;
      const u = Math.min(1, this.macacoT / P.MACACO_T);
      pitch = mc ? mc.turn(u) * Math.PI * 2 : 0;
      this.macacoLift = mc ? P.HY * mc.lift(u) : 0;
    } else if (this.state === "slide") {
      // No squash here on purpose: a slide is a pose (see `poseSlide` in streetwear.js), not a
      // squeezed body. Scaling to 58% height was what made it read as being crushed.
      //
      // And no body pitch either: the slide's pose is a solved CONTACT (the planted palm sits
      // exactly on the deck, see the slide note in README.md), so rotating the whole body about
      // the hips drives that hand through the ground. The lean a slide needs is in the trunk.
      pitch = 0;
    } else if (this.state === "dive") {
      const t = Math.min(1, this.stateTime / 0.16);
      // The lean IS the dive's read, and it is the speed: a slow dive is a fall, a fast one is
      // a body flat over the air it is covering. The direction is the rig's own — +rotation.x
      // tips the head forward and under (the same way the roll and the flip wind), so the pitch
      // climbs with `speed` from `DIVE_LEAN_BASE` at a standstill to `DIVE_LEAN_BASE +
      // DIVE_LEAN_SPEED` at `DIVE_MAX`, all of it still behind the entry ramp `t`.
      const sp = Math.min(1, speed / P.DIVE_MAX);
      pitch = (DIVE_LEAN_BASE + DIVE_LEAN_SPEED * sp) * t;
      sy = 1 - 0.12 * t;
      sxz = 1 + 0.1 * t;
    } else if (this.state === "mantle") {
      const t = Math.min(1, this.mantleT / this.mantleDur);
      // ...and THE LEDGE PULL-UP CARRIES NO WHOLE-RIG PITCH AND NO SQUASH AT ALL (session 159). Its
      // palms are a solved CONTACT on the lip, and `poseLedgeGrip` solves them in the rig's own
      // frame — so any rotation or scale ABOVE them in the stack swings them off the stone by
      // exactly what the rig is turned or shortened by. MEASURED on the live rig (a 2.5 u lip, a
      // full dead hang, the palms tracked against the world lip every frame): with the pitch and
      // the bow left on, the palms fell **0.148 u below** the lip and **0.144 u through** the face
      // at the middle of the pull-up; with the two taken out of the SAME frames — nothing else
      // changed — they hold it to **0.003 u**. The fold a pull-up needs is in the trunk
      // (`LEDGE_PULL.lean`, which folds to 0.62), and the solve already accounts for that one
      // because the torso is BELOW the hips it is measured from; a whole-rig lean on top of it was
      // also the double-count that made the move read as a heave — the user's *"make it less
      // heavy"* — so removing it is worth more than it costs in silhouette.
      if (this.mantleFromLedge) {
        pitch = 0;
        sy = 1;
        sxz = 1;
      } else {
        // Vaulting off a CLIMB: pitch forward over the lip, then come upright as the feet take the
        // weight. A body coming off a crawl is already leaning, so this path keeps its fold.
        pitch = 0.70 * (1 - t * t * (3 - 2 * t));
        const bow = Math.sin(Math.PI * t);
        sy = 1 - 0.16 * bow;
        sxz = 1 + 0.11 * bow;
      }
    } else if (this.state === "vault") {
      // THE PLANT. A vault folds the trunk over the hand planted on the box and UNFOLDS off it as
      // the legs swing through, so the body pitch follows the crossing's own vertical profile —
      // deepest over the box, upright by the time the feet take the deck. The squash follows it,
      // so the body reads as compressed over the obstacle and stretched at the reach either side.
      const t = Math.min(1, this.vaultT / this.vaultDur);
      const bow = vaultLift(t);
      // LIGHTER (session 159 — the user's *"make it feel easy and fast ... as well as the vault"*):
      // the fold over the planted hand IS the vault's read, but 0.62 of whole-rig lean on top of a
      // pose that already folds the trunk, with a 0.14 squash under it, read as a body being HURLED
      // over the rail rather than one stepping over it. 0.46/0.08 is the same shape carried lighter.
      pitch = 0.46 * bow;
      sy = 1 - 0.08 * bow;
      sxz = 1 + 0.06 * bow;
    } else if (this.state === "ledge") {
      // Hanging: NO body pitch and NO squash, for the same reason the slide has none — the hands
      // are a solved CONTACT on the lip, and pitching or scaling the whole body about the origin
      // (which sits at the hips) swings them straight off it. The hang's own lean lives in the
      // trunk, where the grip height already accounts for it (see `poseHang`).
      pitch = 0;
    } else if (this.wallRunning) {
      // A wall run leans into its own line, but only slightly: the lean that sells it is the
      // bank, and a big body pitch would swing the planted leg's reach around with it (the
      // solve in `poseWall` is exact, but the *plan* is written per bank angle).
      pitch = 0.12;
      sy = 1.0;
      sxz = 1.0;
    } else if (this.climbing) {
      // The crawl solves all four of its contacts onto the face off the HIPS (see `poseWall`), so
      // the body does not pitch or stretch off the group's own origin here. A pitch pivots about
      // the feet line a body and a half below the hands, and would carry the whole plan through
      // the face; the lean a crawl wants is in the trunk, where the pose owns it.
      pitch = 0;
      sy = 1;
      sxz = 1;
    } else if (this.wallSliding) {
      // Only a touch of body pitch: the slide keeps the wall BESIDE it (see the facing rule) and
      // presses in hard, so a body-wide pitch here would drive the head through the wall. The
      // press that sells it lives in the pose (the trunk lean, off the hips) and in the wall
      // contact offset.
      pitch = 0.10;
      sy = 1.02;
      sxz = 0.99;
    } else if (this.state === "launch") {
      // A launch is a RIDE, not a jump: the body's angle is the arc's own slope on top of a base
      // lean, so it is arched back all the way up and tips forward over the top as the arc turns.
      // The base term matters — `r` passes through zero at the apex, and a lean built only from
      // `r` would sit bolt upright at the one moment the pose should read strongest.
      // It is also the only state that stretches: `squash` is set negative at the pad, and the
      // body eases out of the compression it launches with.
      const r = Math.max(-1, Math.min(1, this.vel.y / 70));
      pitch = -0.10 - 0.36 * r;
      sy = 1.05;
      sxz = 0.98;
    } else if (this.skyfall && !this.attached) {
      // THE FALL'S ANGLE IS THE SHAPE. Each of the FALL kinds carries its own rig lean
      // (streetwear.js's `fallLean`: the torpedo is past flat, the feet-first drop is upright),
      // blended into the brace as the deck comes up — so the body and the pose are one decision
      // rather than a fixed tilt the limbs happen to be drawn around. On top of it the body
      // STRETCHES with the descent, the way a fast fall does: taller and thinner the harder it
      // is coming down.
      //
      // ...and THE PLUNGE (see the block in `update`) is the same read of the same family, one
      // shape over: M1 puts the fall into its downward dive, which is a seventh kind with its own
      // lean (`FALL_KINDS.plunge`, 2.92 rad — the crown of the head on the deck). The two angles
      // CROSS on `plungePose` rather than switching, because a fall that changes its lean in one
      // frame reads as a teleport: the same weight drives the shape in the pose call below, so the
      // angle and the shape can never disagree about how much of the dive is on.
      const v = Math.min(1, -this.vel.y / 24);
      const fum = this.charMesh && this.charMesh.userData;
      if (fum && fum.fallLean) {
        const cruise = fum.fallLean(this.fallKind, speed, this.fallBrace);
        const down = fum.fallLean("plunge", speed, this.fallBrace);
        pitch = cruise + (down - cruise) * this.plungePose;
      } else {
        pitch = 1.45 + (2.92 - 1.45) * this.plungePose;
      }
      sy = 1 + 0.20 * v;
      sxz = 1 - 0.10 * v;
      // ...and the lean is REMEMBERED for the handover: a dive or a slam thrown out of this fall
      // (see `startDive` / `startSlam`) blends from here rather than snapping the body upright.
      this.fallPitch = pitch;
    } else if (this.state === "capo") {
      // The capoeira's own shape lives in the POSE, not on the rig: the coil, the rising kick, the
      // hang of the carry and the bank are all `poseCapo`'s (see the `CAPO` table), so the group
      // itself must not pitch — a rig tilt would tip the SOLES the carry is solved onto (the body's
      // face is placed on the world position of the two feet, read off the rig every frame), and the
      // step-forward the carry stands on would tilt out from under it. The lean that sells the move
      // is the ROLL, and it lives in `inner.rotation.z` (see the bank below), where the live target
      // is divided back out of it.
      pitch = 0;
    } else if (this.state === "scissor") {
      // ...and the scissor's is a contact on a NECK, with its whole turn done by the rig's own
      // tumble (`spinX`, wound through exactly one revolution across the clamp — see
      // `updateScissor`). A body pitch here would be a second turn fighting the first.
      //
      // ...UNLESS IT MISSED (session 152; the somersault is session 191 — see
      // `SCISSOR_MISS_FLIP`). A whiff has no neck, so there is no turn for a pitch to fight, and
      // the one thing a miss is is the body going all the way OVER — a whole front somersault,
      // which is a body pitch and nothing else. It rides its own channel (`scissorPitch`) rather
      // than `spinX` on purpose: `spinX` is the number the "finish the tumble" tidy-up below winds
      // on to the next WHOLE revolution (a partial spin left on it would be spun up into an extra
      // somersault the moment the state ended), and `spinX` also rides into the first-person view
      // as `bodySpin` — and the miss's own turn is already a whole revolution solved over the
      // leap's airtime (`tickMissFlip`), so it wants neither a second writer nor a camera roll.
      pitch = this.scissorMiss ? this.scissorPitch : 0;
    } else if (this.state === "lunge") {
      // ...and THE LUNGE: the POUNCE lays out over the arc and the three rolls are the rig's own
      // turn (`grabFlip`, below) with no lean at all.
      //
      // The pounce's lean is read off the ARC rather than off the beat's clock — the body lays out
      // as the paws leave the deck and comes back up as they come down, so a pounce thrown off a
      // ledge that falls further than the beat is still a pounce, and it is square for the roll it
      // lands in either way. The vertical velocity IS the arc (it is a plain integration of the
      // same launch), so the two can never disagree: `u` is 0 at the launch, 0.5 at the apex and 1
      // at the moment the paws touch, and the sine makes the lay-out and the recovery symmetric.
      if (this.lungePhase === 0) {
        const u = Math.max(0, Math.min(1, (P.LUNGE_POP - this.vel.y) / (2 * P.LUNGE_POP)));
        // The 0.55 power is what makes it a PANTHER and not a swallow: a plain sine reaches the
        // lay-out and is already leaving it again, so the body flicks through the flat of the leap;
        // flattened like this it HOLDS the stretch through the middle of the flight. Still exactly
        // zero at both ends, so the launch and the landing are both square.
        pitch = P.LUNGE_LEAN * Math.pow(Math.sin(Math.PI * u), 0.55);
      } else {
        pitch = 0;
      }
      sy = 1;
      sxz = 1;
    } else if (!this.grounded && !poleDriven) {
      const v = Math.max(-1, Math.min(1, this.vel.y / 12));
      sy = 1 + 0.16 * Math.abs(v) * (v < 0 ? 1 : 0.7);
      sxz = 1 - 0.09 * Math.abs(v);
      pitch = Math.min(0.5, speed * 0.035);
    } else if (this.state === "block") {
      // The block's whole-body lean belongs to the CHARGE: the guard stands up (its shape is all in
      // the pose — a boxing block is a stance, and a body-wide tilt on it would only sit the
      // stagger's rear heel a hair off its own solve), and the charge folds forward over the drive
      // the way the brief's arm-over-the-eyes run does. It rides the same blend the pose does, so
      // the two can never disagree about how much of the charge is on.
      pitch = 0.16 * this.guardRush;
      sy = 1;
      sxz = 1;
    } else if (this.crouching) {
      // The crouch's own shape is the rig pose; the body only leans a hair into it.
      pitch = 0.06;
    } else {
      const bob = Math.sin(performance.now() * 0.012) * 0.02 * Math.min(1, speed / 6) * (1 - this.runBlend);
      sy = 1 + bob;
    }

    // THE CLASH's lean (see `startClash`): the body's weight going into the lock, by how much of
    // the race it has won, plus the spike of the last press. It is a whole-rig rotation about the
    // hips — the same pivot the bank and the macaco use — so it reads as pushing rather than nodding.
    if (this.state === "clash" && this.clash) {
      const lm = P.CLASH_LEAN_MOVE[this.clash.move] || 1;
      pitch = P.CLASH_LEAN * lm * (0.35 + 0.65 * this.clashDrive) + 0.05 * this.clash.jolt;
    }

    if (this.state === "smash") pitch += this.hammerFlip;
    // ...and THE DOWN SLAM's front flip (see `P.DSLAM_*` / `attackFlip`): one whole forward
    // revolution through the tuck, on the same channel the double jump's own revolution rides (the
    // line below), so both are read by the camera's barrel roll the same way. It finishes on 2π —
    // a whole turn is visually nothing — so the frame the move hands over is square.
    if (this.state === "attack" && this.attackSlam) pitch += this.attackFlip;
    if (this.flipT > 0) {
      const f = 1 - this.flipT / P.FLIP_TIME;
      pitch += -Math.PI * 2 * (1 - (1 - f) * (1 - f));
      spinExtra += -Math.PI * 2 * (1 - (1 - f) * (1 - f));
      sy = 0.86;
      sxz = 1.12;
    }
    // ...and THE VAULT'S OWN REVOLUTION (session 185 — see `poleVault`), which is the same whole turn
    // wound the OTHER WAY: the double jump's line above is a BACKFLIP (-2π — the head comes up and
    // over the shoulders), and the staff's double jump is a FRONT flip, so it is +2π on the same
    // channel. It has a clock of its own (`poleFlipT`, ticked in `clocks.js`) and it is read through
    // `poleFlipAngle` rather than solved here, because the STAFF has to know the same angle: the wood
    // is mounted in the rig's frame, so a staff left alone would simply go round with the body (a
    // stick on a Catherine wheel) — the vault's shape counter-rotates by exactly this number so the
    // wood holds its own aim in the world while the body goes over it (see `poleHoldVault`). One
    // function, so the body that turns and the wood that does not can never disagree about where in
    // the turn the frame is. No squash here either — the vault's tuck is AUTHORED in its own pose
    // (`poleHoldVault`'s legs), not bought with the rig's stretch, so the two cannot fight over the
    // body.
    const vaultFlip = this.poleFlipAngle();
    if (vaultFlip > 0) {
      pitch += vaultFlip;
      spinExtra += vaultFlip;
    }
    if (this.kickT > 0) {
      // The body curls in behind the boot and stretches down the kick line.
      const pulse = Math.sin(Math.PI * (1 - this.kickT / P.KICK_POSE));
      pitch += 0.2 * pulse;
      sy *= 1 + 0.05 * pulse;
      sxz *= 1 - 0.04 * pulse;
    }
    if (this.state === "dash" && (this.dashKind === 2 || this.dashKind === 0)) {
      // THE STEP's own turn, and it is read rather than integrated: `streetwear.js`'s
      // `backdashTurn` holds the whole table — the backflip's -2 PI and the spiral's +2 PI, BOTH run
      // together across the one window (the user's *"make it do the backflip and spiral at the same
      // time"*) — and the pose that is worn for those same beats is authored off the same numbers,
      // so the tuck is released on exactly the frame the two revolutions finish and the rig is
      // square on the landing. Reading it (rather than stepping a rate) is also what lets it be a
      // pure function of the clock: a dropped frame cannot leave the turn behind the shape.
      //
      // ...and the FRONT step's turn is the SAME channel, one beamed off the other end of the same
      // rig (`boxcutterTurn`): the boxcutter's TWO revolutions of yaw with a cork's backflip laid on
      // top of them, whose three-quarters mark is the beat the blade is thrown out on. Unlike the
      // backstep's, its `x` is not a window of its own — the flip opens on the foot leaving the deck
      // and is done by the time the feet come back to it, so the body is always upright under a
      // solved sole (see `BOXCUT.flipKeys`).
      //
      // Both read the STEP'S OWN POSE CLOCK (`dashPoseT`) rather than `stateTime / qdashTime()`, so
      // a step that has RUSHED onto its kick (see `dashContact`) turns with it: the rig and the leg
      // are on one clock or the kick would arrive at the wrong angle in the world.
      const bt = this.charMesh && this.charMesh.userData;
      const turn = bt && bt.dashTurn ? bt.dashTurn(this.dashPoseT, this.dashKind) : null;
      this.spinX = turn ? turn.x : 0;
      this.dashSpinY = turn ? turn.y : 0;
    } else if (this.kickSpinT > 0) {
      // The flip variant's turn. Same axis as the backflip, wound the other way: the kick throws
      // you off the face, so the body goes over BACKWARDS — -rotation.x is the head coming up
      // and over the shoulders, which is what a backflip off a wall does. It runs on its own
      // clock (`KICK_FLIP_TIME`), not the pose's, because a whole turn does not fit in
      // `KICK_POSE`: the tuck is held for the whole spin and released with it.
      this.kickSpinT = Math.max(0, this.kickSpinT - dt);
      this.spinX -= (Math.PI * 2 * this.kickSpinTurns / P.KICK_FLIP_TIME) * dt;
      if (this.kickSpinT <= 0) this.spinX = -Math.PI * 2 * this.kickSpinTurns;
    } else if (this.spinX !== 0 && this.state !== "scissor") {
      // finish the tumble rather than snapping: wind on to the next whole turn, then zero it
      // (the 0.03-turn tolerance stops a partial final frame from adding a whole extra turn).
      // Sign-aware, because the flip's turn is negative: `ceil` alone would unwind a backwards
      // tumble straight back to zero instead of completing it.
      //
      // ...and NEVER for the scissor: its clamp is already winding `spinX` on its own clock (see
      // `scissorAnchor`), and this branch was the second writer that broke it. The two ran away
      // from each other — this one easing the turn on toward the next whole revolution at
      // `dt * 10`, the clamp pushing past it, the two together snapping the rig back to zero
      // twice inside one clamp. Measured before the guard, on a dummy planted in front at 60 fps:
      // `spinX` over the clamp read 1.30 → 3.30 → 4.68 → 5.64 → **0** → 2.39 → … → **1.30** → …,
      // i.e. three revolutions in 0.34 s — and because it also left the turn mid-revolution when
      // the phase changed, the landing planted an upside-down body 0.42 u through the deck.
      const twoPi = Math.PI * 2;
      const target = this.spinX < 0
        ? twoPi * Math.floor(this.spinX / twoPi + 0.03)
        : twoPi * Math.ceil(this.spinX / twoPi - 0.03);
      this.spinX += (target - this.spinX) * Math.min(1, dt * 10);
      if (Math.abs(target - this.spinX) < 0.03) this.spinX = 0;
    }
    if (this.state === "smash") {
      // The hammer's own turn: whole turns per beat, each of them finished on the impact that ends
      // it (see `P.HAMMER.turns` and the block in `update`). It is square to where the flurry began
      // when it ends, so the unwind below has nothing to wind back.
      inner.rotation.y = this.hammerSpin;
    } else if (this.state === "whirl") {
      // THE WHIRL's own turn (see `updateWhirl` / `poseWhirl`): the rig whips round the vertical
      // axis through the body for the whole of the whirlwind — `WHIRL_TURNS` WHOLE revolutions,
      // finished on a whole one so the aim and the arm are square again when the slam comes down —
      // and the pose is written in the BODY's frame, so the arm, the lariat and the body in his
      // hand all ride the turn with it. The aim is untouched by it (the lunge took the facing), and
      // the body he is whirling is placed on the SAME angle (`carryOrbit`), so the two never split.
      inner.rotation.y = this.whirlSpin;
    } else if (this.state === "attack" && this.attackSpinning) {
      // The sweep's own turn: the rig whips round the vertical axis through the body, on the
      // move's clock (`poseSpin`), and comes back to square as the pose sits back up. It is the
      // RIG that turns rather than `facing`, so the aim, the target and the hit wedge are all
      // unaffected — the move lands where it was aimed no matter where the spin is.
      inner.rotation.y = this.attackSpin;
    } else if (this.state === "dash" && (this.dashKind === 2 || this.dashKind === 0)) {
      // ...and the STEP's own spiral is the same channel (`dashSpinY`, settled in the spin chain
      // above): the rig is whipped round the vertical axis through the body, so the aim, the target
      // and the hit wedge are all untouched by it — the turn is a shape, not a heading. It is the
      // backstep's leap-turn and the front step's spin kick, off `spinKickTurn`/`backdashTurn`.
      inner.rotation.y = this.dashSpinY;
    } else if (this.state === "grab" && this.grabKind === 0) {
      // THE FLASH GRAB's 360 (`grabSpinY`, see `updateGrabSpin`): the rig whips one whole turn
      // round the vertical axis while the body dangles off the throat. It finishes on a WHOLE
      // turn by construction, so the aim is square again when the crash comes down — and the
      // settle chain above squares any remnant the same way it does every other spin.
      inner.rotation.y = this.grabSpinY;
    } else if (this.board) {
      // ...AND THE BODY VARIAL (session 200 — see `solveRidePose` in player/board.js). The deck can
      // spin under the feet on its own — a kickflip, a shuvit, a varial are all the BOARD's turns —
      // but it cannot turn the RIDER, so the one trick that turns the body (BIGSPIN) writes its
      // revolution on the rig's own vertical. The aim and the travel are untouched by it (this is the
      // same channel the sweep and the backstep spin use), and `flipCurve` lands it on exactly one
      // whole turn, so it is square by construction.
      inner.rotation.y = this.boardSpinY;
    } else if (inner.rotation.y !== 0) {
      const full = Math.round(inner.rotation.y / (Math.PI * 2)) * Math.PI * 2;
      inner.rotation.y += (full - inner.rotation.y) * Math.min(1, dt * 12);
      if (Math.abs(inner.rotation.y - full) < 0.02) inner.rotation.y = full % (Math.PI * 2);
    }

    if (this.squash > 0.001 || this.squash < -0.001) {
      sy *= 1 - 0.34 * this.squash;
      sxz *= 1 + 0.24 * this.squash;
      this.squash *= Math.max(0, 1 - dt * 7);
      if (Math.abs(this.squash) < 0.01) this.squash = 0;
    }

    inner.rotation.x = pitch;
    inner.rotation.z = 0;
    const lerp = Math.min(1, dt * 16);
    inner.scale.x += (sxz - inner.scale.x) * lerp;
    inner.scale.y += (sy - inner.scale.y) * lerp;
    inner.scale.z += (sxz - inner.scale.z) * lerp;
    return { pitch, spinExtra };
  },

  // The LAST write of the rig: square up any leftover whole-rig turn, set the final forward pitch (the state's
  // own lean plus the tumble, dash, grab-flip and vault turns), then spend the limb stretch and the neck split.
  solveFinalRig(dt, speed, pitch, ud) {
    const inner = this.inner;
    // ...and the ONE leftover a whole-rig turn can leave behind (see `grabFlip`): it is spent by the
    // ankle slam and by the lunge's own rolls, both of which finish on a WHOLE revolution by
    // construction — but the lunge's last wind-up can be interrupted (a double jump off the spread
    // leap), and a body left parked at half a turn stays parked for the rest of the page. A whole
    // turn is the same pose, so squaring the remnant up to the nearest one is free and cannot pop.
    if (this.state !== "lunge" && this.state !== "grab" && this.grabFlip !== 0) {
      const full = Math.round(this.grabFlip / TAU) * TAU;
      this.grabFlip += (full - this.grabFlip) * Math.min(1, dt * 12);
      if (Math.abs(this.grabFlip - full) < 0.02) this.grabFlip = 0;
    }

    inner.rotation.x =
      pitch +
      this.spinX +
      this.dashPitch +
      this.grabFlip +
      this.vaultFlip +
      (this.state === "ground" ? Math.min(0.16, speed * 0.012) * (1 - this.runBlend * 0.85) : 0);
    // THE LIMB STRETCH, spent last (see `poseStretch` / `poseStretchApply` in streetwear.js).
    // Every pose above has already ASKED for whatever it wanted this frame, and this is the one
    // place that writes the answer: one pass over the four limb chains, easing toward what was
    // asked and back to the rest length when nothing asked. Being the only writer is what makes
    // it impossible for a pose to be left wearing another pose's stretch.
    if (ud && ud.stretchApply) ud.stretchApply(Math.min(1, dt * 15));
    // ...AND THE NECK'S SHARE (see `poseNeckSplit` in streetwear.js — the user's *"add neck wrest
    // bone for the player animations"*, session 155). The rig has a real neck joint between the
    // chest and the head and this hands it its slice of whatever head rotation the stack above just
    // settled on. It runs HERE, on the last line of the dispatch, for exactly the reason the stretch
    // does: every pose layer writes the head through the shared `poseRot`/`raw` helpers, so the only
    // place the split can be spent is after all of them — no pose has to know the neck exists.
    if (ud && ud.neckApply) ud.neckApply();
  },
};

export function installRig(Player) {
  Object.assign(Player.prototype, rigMethods);
}
