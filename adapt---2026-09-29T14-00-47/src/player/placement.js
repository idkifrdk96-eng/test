// ---------------------------------------------------------------------------
// THE RIG'S PLACEMENT (part 77 of the player.js split).
//
// The head of `updateVisual`: where the GROUP is put before any shape is worn —
// the wall press (`hug`), the deck FOLLOW (the y-follow, with its airborne /
// scissor / balance whole-take and the slope feed-forward), the staff strike's
// own whole-body turn, and the SLOPE lean (the rig laid onto its deck, about the
// feet). It writes only placement: `hug`, the group's position and rotation.y,
// and `slopeBlend` / `tiltPitch` / `tiltRoll` / `tiltG`.
//
// Part 80 adds the RIG'S LEAN, `solveRigLean(dt, speed, pitch)`, which runs just
// after the body angles: the wall bank, the capoeira's roll, the lock's trunk
// lean, and the hip-pivot PLACEMENT (the wall run's bank and the lunge's own
// ball). It also solves the run's travel split (`runFwd`/`runLat`) and the lock's
// trunk roll, which the locomotion base consumes.
//
// Part 83 adds `solveDeckClamps()` — the TRUE-VERTEX deck clamps at the very tail
// of `updateVisual`: when the rig's placement is a BLEND of two exact shapes (the
// lunge's miss-roll handover and the scissor's whiff), the drawn body can dip under
// the deck, so each clamp sweeps the drawn vertices once and lifts the rig.
//
// A LEAF with respect to player.js: it imports `P` (player/config.js),
// `approach` (player/math.js) and the tilt scratch objects + `WALL_BANK_FADE`
// (player/pose.js). `installPlacement(Player)` copies BOTH methods onto
// `Player.prototype`.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { approach } from "./math.js";
import { _tiltM, _tiltE, _tiltFoot, _tiltOut, WALL_BANK_FADE } from "./pose.js";

const placementMethods = {

  // PUT THE RIG WHERE THE BODY IS, before the shape goes on: the wall press, the deck follow (with
  // the slope feed-forward), the strike's spin, and the slope lean about the feet.
  solvePlacement(dt) {
    const g = this.group;
    // Press the mesh into the wall while it rides one. The run and the climb only need the
    // small closing press that hides the gap the lean opens at the contact edge, but the
    // slide braces off the face — its contacts are the soles and the palms — so it presses
    // in far enough for the limbs to reach at all. `hug` holds the offset itself, so a mode
    // change eases the body in or out instead of snapping.
    const ledging = this.state === "ledge" && this.wall;
    const onWall = (this.wallSliding || this.climbing || this.wallRunning) && this.wall;
    const hugWant = ledging
      ? P.LEDGE_HUG
      : onWall
        ? (this.wallSliding ? P.WALL_SLIDE_HUG : this.climbing ? P.WALL_CLIMB_HUG : P.WALL_VIS_HUG)
        : 0;
    this.hug += (hugWant - this.hug) * Math.min(1, dt * 8);
    g.position.x = this.pos.x - this.wallNx * this.hug;
    g.position.z = this.pos.z - this.wallNz * this.hug;
    // ...AND THE BOARD'S OWN HEIGHT (session 200 — see the `BOARD_LIFT` note in player/config.js).
    // While the feet are on a deck the rig is RAISED by the board's height: the capsule's underside is
    // the DECK'S TOP FACE and one board below that is where the wheels are, which is the road. So the
    // deck's plane is lifted clear of the ground it rolls on and the shoes stand on the deck instead of
    // through it. It goes in the TARGET rather than being added to the result, and that is not a
    // detail: `dy` is `targetY - g.position.y`, so a lift added afterwards is subtracted back out on
    // the next frame's `dy` and the follower AMPLIFIES it — measured on the live rig with the lift
    // added after, the body settled at **1.58×** the board's height (0.24 u instead of 0.15) and read
    // as riding a box. It is a ramp rather than a flag (`boardLift`), which is what makes a dismount
    // put the feet back down over a few frames instead of dropping them 15 cm.
    const targetY = this.pos.y + (this.boardLift > 0.001 ? this.boardLift * P.BOARD_LIFT : 0);
    const dy = targetY - g.position.y;
    // The whole SCISSOR takes the follow WHOLE — never eased. It is the one move whose shape is a
    // set of CONTACTS (the guard's and the landing's feet on the deck, the clamp's legs on the
    // opponent's neck, placed by `scissorAnchor`), and a contact that lags the anchor it was solved
    // against is the sole through the deck or the ankle off the neck by however far the body's own
    // y-follow had fallen behind. Measured on the leap's take-off with the easing left on: the
    // drawn body sat 0.09 u low for two frames and the shoe's lowest vertex went 0.067 under the
    // deck.
    //
    // The follow takes the whole gap whenever the body is AIRBORNE, and eases it only on the deck.
    // That split is the whole fix for a bug that cost a session: the ease is for a STEP — the blocky
    // terrain's own height jumps under a running body, which arrive with no vertical velocity behind
    // them — and there is nothing to smooth in the air, where `pos.y` is an integration and already
    // continuous. Easing it there made the drawn shell fall behind a real fall by `vel.y / 22`, which
    // at the skyfall's terminal 26 u/s is **1.18 u**; the moment that lag passed the 0.6 threshold the
    // old rule took the WHOLE gap in one frame, the lag rebuilt, and took it whole again — a two-frame
    // limit cycle. Measured on the live rig during a fall (the drawn body's world y against the
    // capsule's): the shell alternated between `pos.y - 0.16` and `pos.y + 0.11` on alternating frames,
    // i.e. **0.27 u of vertical jitter at up to 30 Hz**, which on screen was the character vibrating
    // ~4 px up and down at frame rate. The user's *"when the player is falling down from a high place
    // he starts shaking super fast"* was exactly this. Airborne it is now exact — which also means a
    // landing puts the drawn feet on the deck on the frame they arrive instead of easing down through
    // the last third of a metre.
    // ...and THE VAULT takes the whole gap with them: the flip is holding him off a stick he is
    // driving into the deck, so the body is being placed by the move rather than following a deck —
    // the same reason the scissor does (its contacts are placed too, see `scissorAnchor`). (He is
    // airborne for the whole of it, so `!grounded` would already cover it; the state is named
    // anyway, the way the scissor is, because a vault a hair above the deck must not be eased.)
    const whole = !this.grounded || this.state === "scissor" || this.state === "polevlt";
    // ...AND THE DECK'S OWN MOTION IS NOT A STEP (session 160 — the user's *"when im sliding and i go
    // down a slope my character shakes it does like a weird glitch"*).
    //
    // Everything above is about a STEP. The ease is a first-order follower: it closes `dt*22` of the
    // gap it is handed each frame (36.7 % at 60 fps), so a gap that KEEPS OPENING at a steady rate
    // settles at a steady lag of `1.72 × that frame's own drop`, and any drop big enough to put that
    // lag past the 0.6 whole-take is a limit cycle by construction — the rule takes the WHOLE gap in
    // one frame, the lag rebuilds, and it crosses again. Sliding down a flank is exactly that gap:
    // the deck falls away under a slide at `speed · slopeTan` a frame, and a slide carries 13-27 u/s
    // on the field's flanks (measured: 13 in, 21.5 down this one), so the deck drops 0.18-0.37 u a
    // frame — a steady lag of 0.31-0.64 u, either side of the threshold — and 0.55 u a frame (0.94 u
    // of lag) at the ceiling (`MAX_SPEED` 36) on the field's steepest line (tan 0.91). *Measured on the live page, the field's 36-degree flank (tan 0.81)
    // entered at 13 u/s and slid down the fall line:* the drawn rig's origin sat **0.37 u above
    // `pos.y`** through the whole slide, and the one frame the gap crossed 0.6 the follow took it
    // WHOLE — a **0.61 u** drop against the deck's own 0.24, i.e. the body slapping down onto the deck
    // and drifting off it again. Entered at 30-36 u/s it crosses **7-9 times in 220 frames** (a 3.7 s
    // slide), the largest a **0.79 u** single-frame step. That is the read the user is describing.
    //
    // The gap the follower is chasing is not a step at all here: it is the DECK, moving under the
    // feet at a rate the body already knows — the ground's own gradient (`slopeGx`/`slopeGz`, read
    // once a frame by `readSlope`) along the body's own travel. So that motion is fed FORWARD and only
    // what is left is eased, which is the part that really is a discontinuity (a box lip, a crater
    // rim, a respawn). On a steady flank the residual is zero and the drawn body tracks `pos.y`
    // exactly — the same thing the airborne branch above does, for the same reason: a body being
    // PLACED by the deck should be placed, and only a step should be smoothed. Off-slope `readSlope`
    // zeroes the gradient, so the feed-forward is 0 and the follow is bit-for-bit what it always was.
    const deckStep = whole ? 0 : (this.slopeGx * this.vel.x + this.slopeGz * this.vel.z) * dt;
    const step = dy - deckStep;
    g.position.y += whole || Math.abs(step) > 0.6 ? dy : deckStep + step * Math.min(1, dt * 22);
    // THE STRIKE's own whole-body turn is added here (see `poleStrike` / `updatePoleStrike`): it is
    // ONE WHOLE REVOLUTION of the flurry, and it is finished on exactly 1.0 so it lands back on the
    // identity and can be dropped the moment the move ends without the body jumping (2π IS 0). It
    // rides on top of `facing` rather than through it, so the aim — which every hitbox reads off
    // `facing` — is untouched by the spin even at the moment the body is sideways to it.
    g.rotation.y = this.facing + this.poleAtkSpin;

    // ---- THE SLOPE (see `readSlope` / "THE SLOPE" in README.md) ----
    // The rig LIES DOWN onto the deck it is standing on. That lean is the GROUND's rotation and not
    // the pose's, so it is written on its own layer between the body's position and its shape — and
    // it is the FEET the turn is about. `+rotation.x` tips the head forward and under and
    // `+rotation.z` lifts the left side (both measured; see the wall bank), so the deck's own forward
    // and left gradients go straight in: a ground that rises ahead leans him back, one that rises to
    // his left lifts his left. Both fade over `SLOPE_TILT_BLEND` so stepping onto a flank lays him
    // over rather than snapping him, and a body on a BOX reads flat (`onSlope` is false there).
    //
    // The origin correction is the whole reason this is its own layer: `tiltG`'s origin is the body's
    // CENTRE, and a lean about the centre swings the feet off the deck by `HY·sin(theta)` — 0.38 u at
    // the field's steepest, which is the body standing beside its own footprint. Turning about the
    // FEET instead is `T = p - R·p` with `p` the foot point, the same correction the wall bank's hip
    // pivot uses, and it puts the transform exactly on the soles.
    // ...and the two DECK MOVES wear it too (session 157 — the user's *"make the player slide stick
    // to the slopes like turn its angles depending on the slope"*). A slide is the move the whole
    // slope system exists for (it is the one state that BUILDS speed downhill — see `slopePull`),
    // and it was the one deck state that did NOT lie on the deck: `wantSlope` was ground/block only,
    // so the moment SHIFT went down on a flank the lean the body already had faded out over
    // `SLOPE_TILT_BLEND` and went level, and the body slid DOWN the hill with its own up still on
    // the WORLD's up. *Measured on the field's 39-degree flank (tan 0.83), sliding the fall line at
    // 13 u/s entered:* the body's up was **39.9 degrees off the deck's own normal** (`up·n` 0.77)
    // through the whole slide, and the lean arrived only when the slide ENDED and the state handed
    // back to `ground` (`up·n` 1.00, 0.14 s later). A body sliding in a plane its feet are not in is
    // the read the user is describing: it floats off the uphill edge and cuts into the downhill one.
    //
    // A slide's pose DOES solve contacts (the planted palm, the boot), which is why it is worth
    // saying why this layer is safe for it: this rotation is the GROUND's, taken about the FEET, and
    // the pose inside it keeps solving in the body's own frame — the plane the palm is solved onto
    // is the tangent plane the feet are on, so the contact follows the deck by construction. (The
    // note in the slide's own branch of `updateVisual` — that pitching the body drives the palm
    // through the deck — is about `inner.rotation.x`, which turns the body about its CENTRE; that is
    // the body's shape and it is still zero here.)
    // ...and the three RIDE states wear it too: the deck is parented into `tiltG` (see `mountBoard`),
    // so the board, the shoes and the ground's lean are one thing — but only while this gate lets
    // the lean on. Without it the rider stays world-upright on a flank while the deck he is
    // standing on is not.
    const wantSlope = this.onSlope && this.grounded &&
      (this.state === "ground" || this.state === "block" || this.state === "slide" || this.state === "dash" ||
        this.state === "ride" || this.state === "bslide" || this.state === "bbomb") ? 1 : 0;
    this.slopeBlend = approach(this.slopeBlend, wantSlope, dt / P.SLOPE_TILT_BLEND);
    if (this.onSlope && this.slopeBlend > 0.002) {
      const sf = Math.sin(this.facing);
      const cf = Math.cos(this.facing);
      const gf = this.slopeGx * sf + this.slopeGz * cf; // the deck's rise per unit FORWARD
      const gl = this.slopeGx * cf - this.slopeGz * sf; // ...and per unit LEFT
      this.tiltPitch = approach(this.tiltPitch, -Math.atan(gf), dt / P.SLOPE_TILT_BLEND);
      this.tiltRoll = approach(this.tiltRoll, Math.atan(gl), dt / P.SLOPE_TILT_BLEND);
    } else {
      this.tiltPitch = approach(this.tiltPitch, 0, dt / P.SLOPE_TILT_BLEND);
      this.tiltRoll = approach(this.tiltRoll, 0, dt / P.SLOPE_TILT_BLEND);
    }
    const tp = this.tiltPitch * this.slopeBlend;
    const tr = this.tiltRoll * this.slopeBlend;
    if (tp !== 0 || tr !== 0) {
      this.tiltG.rotation.set(tp, 0, tr);
      _tiltFoot.set(0, -P.HY, 0);
      _tiltM.makeRotationFromEuler(_tiltE.set(tp, 0, tr));
      _tiltOut.copy(_tiltFoot).applyMatrix4(_tiltM);
      this.tiltG.position.copy(_tiltFoot).sub(_tiltOut);
    } else if (this.tiltG.rotation.x !== 0 || this.tiltG.rotation.z !== 0 || this.tiltG.position.y !== 0) {
      this.tiltG.rotation.set(0, 0, 0);
      this.tiltG.position.set(0, 0, 0);
    }
  },

  // Put the RIG where the world says: the wall bank, the capoeira's roll, the lock's trunk lean, and the
  // hip-pivot PLACEMENT of the rig (the wall run's bank and the lunge's own ball). Also solves the run's
  // travel split (runFwd/runLat) and the lock's trunk roll, which the locomotion base below consumes.
  solveRigLean(dt, speed, pitch) {
    const inner = this.inner;
    let strafe = 0;
    if (this.grounded && this.state === "ground") {
      const rx = Math.cos(this.camYaw);
      const rz = -Math.sin(this.camYaw);
      strafe = (this.vel.x * rx + this.vel.z * rz) / Math.max(1, speed);
    }
    // SHIFT LOCK's own blend (see `P.LOCK_*`): the camera's look and the body's bank both ride it,
    // so turning the lock on and off is a fade rather than a jump. It is read here rather than in
    // `CameraRig` so the two halves of the lock agree on one number.
    this.lockBlend = approach(this.lockBlend, this.shiftLock ? 1 : 0, dt / P.LOCK_BLEND);
    // ...and WHICH WAY the ground is going under him, in the BODY's own frame — the run cycle's own
    // two arguments (see `poseRun`), and the bank below. A body running where it looks is `fwd` 1,
    // `lat` 0 and gets exactly the cycle it always had; a strafe is `fwd` 0 with `lat` at ±1, and a
    // backpedal is `fwd` −1 — and each of those is a different set of legs rather than the same
    // stride pointed the wrong way, which is what makes the strafe read as a step sideways instead
    // of a skate (the user's "make the animation fluent"). It is read off the VELOCITY rather than
    // the input so the transition into and out of a strafe is the same smooth pan the movement
    // itself is, and so a dash keeps whatever line its own move was thrown on.
    //
    // `lat` is also gated on the LOCK's own blend (below), because a body that is free to turn
    // never travels sideways for long — its facing chases the travel, so the sideways part of the
    // velocity is always transient — and a `lat` read raw would then quietly re-time the run cycle
    // of every ordinary turn in the game. Only the lock holds a body off its own line, so only the
    // lock gets the sideways legs; the blend means the strafe fades in with the lock, not after it.
    const hsF = Math.hypot(this.vel.x, this.vel.z);
    let runFwd = 1;
    let runLat = 0;
    if (hsF > 0.5) {
      const fxB = Math.sin(this.facing);
      const fzB = Math.cos(this.facing);
      runFwd = (this.vel.x * fxB + this.vel.z * fzB) / hsF;
      // `lat` is positive toward the character's own LEFT (the rig's local +X) — the side the
      // abduction's sign is written on in `poseRun`.
      runLat = (this.vel.x * fzB - this.vel.z * fxB) / hsF;
    }
    // Bank on the wall you're riding (or hanging from), which is what sells the wall-run.
    let leanTarget = 0;
    if ((this.wallSliding || this.climbing || this.wallRunning) && this.wall) {
      // `side` is how far the wall sits on the player's own right — the outward face normal
      // read against the right-hand axis — so its sign is the one thing that decides which
      // way the body rolls. Held sticky, because a squared-up slide or climb has the wall in
      // *front* of you, where `side` collapses to ~0 and the sign would jitter.
      const side = -Math.cos(this.facing) * this.wall.nx + Math.sin(this.facing) * this.wall.nz;
      if (Math.abs(side) > 0.35) this.wallSide = side;
      // The wall side goes *under* you, not over you: the top of the body leans away from the
      // face while the feet swing toward it, so you read as riding the wall rather than
      // toppling into it. And since `+rotation.z` lifts the player's left side (measured), a
      // wall on the right has to pull *negative* — hence `+side`, not `-side`. The camera
      // rolls the same way (`CameraRig.follow`), so horizon and body agree on screen.
      leanTarget =
        side * (this.wallRunning ? P.WALLRUN_BANK : this.wallSliding ? P.WALL_SLIDE_BANK : P.WALL_CLIMB_BANK);
    }
    // THE CAPOEIRA's roll, which is not a bank but the same channel: the body goes over the planted
    // hand, so the whole rig rolls about the hips by the pose's own curve (`capoBank` — the same
    // number the pose tilts its hips and trunk with, so the two can never disagree). It is applied
    // BEFORE the smoothing below, so a move started out of a wall run unwinds one roll into the
    // other rather than snapping between them.
    if (this.state === "capo" && this.charMesh && this.charMesh.userData.capoBank) {
      const cp = this.capoPhase();
      if (cp >= 0) {
        const cb = this.capoBeat(cp);
        leanTarget = this.charMesh.userData.capoBank(cp, cb.ph);
      }
    }
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 9);
    // ...and the LOCK's own lean, which is the same channel read off the travel instead of off a
    // wall: the body leans into the side-step and into the backpedal. Both that and the steering
    // roll above move to the TRUNK while the lock is on (`poseRun`'s `bank`), fading across on the
    // lock's own blend: a roll of the whole rig turns a lateral offset into a height, so a locked
    // strafe — which carries a FULL `-strafe` for as long as it is held — would sit its soles a
    // centimetre and a half into the deck on the steering term alone, and four on the bank. Written
    // at the waist instead, the same lean costs the feet nothing, and the container's roll (which
    // is what the wall bank and the capoeira's roll ride) is left exactly as it was.
    const lockBank = -runLat * P.LOCK_BANK * this.lockBlend;
    const steerRoll = -strafe * 0.07;
    const trunkRoll = lockBank + steerRoll * this.lockBlend;
    inner.rotation.z = steerRoll * (1 - this.lockBlend) + this.lean + this.vaultRoll;

    // ...but a roll about the group's own origin pivots at the FEET, which are the one thing
    // that must not move: the whole body just tips off the wall and the soles stay in the air
    // a capsule-half away from the face. So the wall run's bank pivots about the HIPS instead.
    // Rotating about the origin and then adding back `P - R*P` (P the hip, R the bank) is the
    // same transform as rotating about the hip line, and the difference is exactly the swing
    // that carries the feet out to the wall: a hip-height pivot at 0.34 rad moves them
    // ~0.45 toward the face, which is the gap the run has to close.
    this.wallBank = approach(this.wallBank, this.wallRunning ? 1 : 0, dt / WALL_BANK_FADE);
    const pivotY = P.WALLRUN_PIVOT_Y * this.wallBank;
    if (this.state === "lunge") {
      // THE LUNGE PLACES THE RIG ON ITS OWN BALL (see `LUNGE_BALL_*`). Both bodies of the clinch
      // roll turn about the TUCK'S OWN CENTROID rather than about the hips, because a body turned
      // about its hips swings its extremities through the deck (a hip pivot is a semicircle under
      // the feet). Rotating about a point `P` is the same as rotating about the origin and then
      // adding `P - R·P` — the wall bank's own trick, one axis over — so the placement is exact and
      // the ball's centre holds its height for the whole revolution instead of pumping.
      //
      // The weight (`lungeBall`) is what keeps the pounce honest: the pounce is a LEAP, and a body
      // placed on a ball while it is still in the air would be a body running on the spot 0.4 u
      // below where it is. It is eased in as the roll starts and out again for the leap-off.
      const a = pitch + this.grabFlip;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const py = P.LUNGE_BALL_PY;
      const pz = P.LUNGE_BALL_PZ;
      const b = this.lungeBall;
      inner.position.x = 0;
      inner.position.y = b * ((this.lungeDeckY + P.LUNGE_BALL_R + P.LUNGE_BALL_CLEAR) - this.pos.y - (ca * py - sa * pz));
      inner.position.z = b * -(sa * py + ca * pz);
    } else {
      inner.position.x = pivotY * Math.sin(this.lean);
      // ...and the macaco's lift rides on top of the bank's own offset: that one lifts the body off
      // the wall's pivot, this one off the deck (see `MACACO_LIFT`). The HAMMER's hop is scaled by
      // its own pose weight, so a flurry that is CUT — the deck going out from under it (see the
      // plunge check in `update`) — takes its hop away over the same handful of frames the shape
      // fades rather than dropping the body by up to `hammerHop` in a single frame.
      inner.position.y = pivotY * (1 - Math.cos(this.lean)) + this.macacoLift + this.hammerLift * this.hammerPose;
      inner.position.z = 0;
    }
    return { runFwd, runLat, trunkRoll };
  },

  // The TRUE-VERTEX deck clamps, run at the very tail of `updateVisual`: when the rig's placement is a BLEND of
  // two shapes that are each exact (the lunge's miss-roll handover, and the scissor's whiff), the drawn body can
  // dip under the deck for a few frames. Each clamp sweeps the drawn vertices once (shifting `inner` in y is a
  // pure translation, so one pass is exact) and lifts whatever is under the deck by the deficit.
  solveDeckClamps(dt) {
    // ---- THE MISS ROLL'S HANDOVER CLAMP (see `LUNGE_BALL_*` at the head of `P`) ----
    // The ball is EXACT for the tuck and `inner.position = 0` is exact for the REST pose, but the
    // miss roll's last 28% is a BLEND of the two (`lungeBall` fades as the fold opens out onto the
    // feet — see `updateLunge`): a body that is halfway between those shapes is exactly on neither
    // placement. Measured over whole rolls at 60 Hz, the ball phase rides **0.046–0.263 u** clear and
    // the handover alone dips to **-0.058** — the feet, still short of the REST fold, dragging under
    // a deck they are on their way up out of. So the handover places the rig by the SHAPE instead of
    // by a pivot: one `updateWorldMatrix` and a sweep of the drawn vertices — the same true-vertex
    // measure the ball itself was solved with — then whatever is under `lungeDeckY` is lifted by the
    // deficit. Shifting `inner` in y is a pure translation of every vertex under it, so ONE pass is
    // exact, and it costs ~11 frames of one beat, which is why the rest of the roll keeps the ball.
    if (
      this.state === "lunge" &&
      this.lungePhase === 1 &&
      this.lungeBall < 0.999 &&
      this.lungeT > P.LUNGE_ROLL_T * this.lungeRiseAt
    ) {
      if (this._skinMeshSrc !== this.charMesh) {
        this._skinMeshSrc = this.charMesh;
        this._skinMeshes = [];
        this.inner.traverse((o) => {
          if (o.isMesh && o.visible && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
            this._skinMeshes.push(o);
          }
        });
      }
      this.group.updateWorldMatrix(true, true);
      let low = Infinity;
      for (const o of this._skinMeshes) {
        const pa = o.geometry.attributes.position;
        // Only the WORLD Y of each vertex is needed, so this pulls the matrix's own y-row out and
        // multiplies it out by hand: `fromBufferAttribute(...).applyMatrix4(...)` gives the same
        // answer for ~4x the cost, and this runs 25k times a frame (66 meshes) for those 11 frames.
        const e = o.matrixWorld.elements;
        const e1 = e[1], e5 = e[5], e9 = e[9], e13 = e[13];
        const count = pa.count;
        if (!pa.isInterleavedBufferAttribute && pa.itemSize === 3) {
          const a = pa.array;
          for (let i = 0, b = 0; i < count; i++, b += 3) {
            const wy = e1 * a[b] + e5 * a[b + 1] + e9 * a[b + 2] + e13;
            if (wy < low) low = wy;
          }
        } else {
          for (let i = 0; i < count; i++) {
            const wy = e1 * pa.getX(i) + e5 * pa.getY(i) + e9 * pa.getZ(i) + e13;
            if (wy < low) low = wy;
          }
        }
      }
      if (low < this.lungeDeckY) this.inner.position.y += this.lungeDeckY - low;
    }
    // ---- ...AND THE SCISSOR'S WHIFF (session 152, extended session 191) ----
    // Two solves under one state. The AIR half's whiff (a body pitched forward with its feet SOLVED
    // onto the deck for the last few frames before it is handed to the lie) needs only the LUNGE's
    // net one state over: a rotation about the body's centre carries a solved foot forward of the
    // hips down through the floor — measured **0.13 u of boot under the ground** for two frames —
    // and the lift below is the rest. It fires only while he is on the deck with a pitch still on,
    // so it is inert for the whole of the air half and for the landed scissor. One
    // `updateWorldMatrix` and a sweep of the drawn vertices is exact — shifting `inner` in y is a
    // pure translation of every vertex under it.
    //
    // ...and THE MISS'S OWN TAIL IS A BED, not a net (session 191 — see `SCISSOR_MISS_DOWN`): a body
    // lying on the pavement cannot be placed by `pos`, because `pos` is his STANDING body. What is
    // wanted is the solve the enemies' own lies use (`restOnDeck`): the rig placed by whatever part
    // of it is lowest. It is written as an EASED correction rather than an instant one
    // ...and the MISS'S OWN TAIL IS A BED, not a net (session 191 — see `SCISSOR_MISS_DOWN`): a body
    // lying on the pavement cannot be placed by `pos`, because `pos` is his STANDING body. What is
    // wanted is the solve the enemies' own lies use (`restOnDeck`): the rig placed by whatever part
    // of it is lowest. It is written as an EASED correction rather than an instant one
    // (`SCISSOR_MISS_REST_T`, a tenth of a second), because the frame the air half hands over is the
    // frame the man is still coming down onto his back — easing the correction IS the flop.
    const scissorDown = this.state === "scissor" && this.scissorMiss && this.grounded &&
      this.scissorMissPhase > 0;
    const scissorSink = scissorDown || (this.state === "scissor" && this.scissorMiss && this.grounded &&
      this.scissorPitch > 0.004);
    if (scissorSink) {
      if (this._skinMeshSrc !== this.charMesh) {
        this._skinMeshSrc = this.charMesh;
        this._skinMeshes = [];
        this.inner.traverse((o) => {
          if (o.isMesh && o.visible && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
            this._skinMeshes.push(o);
          }
        });
      }
      this.group.updateWorldMatrix(true, true);
      let low = Infinity;
      for (const o of this._skinMeshes) {
        const pa = o.geometry.attributes.position;
        const e = o.matrixWorld.elements;
        const e1 = e[1], e5 = e[5], e9 = e[9], e13 = e[13];
        const count = pa.count;
        if (!pa.isInterleavedBufferAttribute && pa.itemSize === 3) {
          const a = pa.array;
          for (let i = 0, b = 0; i < count; i++, b += 3) {
            const wy = e1 * a[b] + e5 * a[b + 1] + e9 * a[b + 2] + e13;
            if (wy < low) low = wy;
          }
        } else {
          for (let i = 0; i < count; i++) {
            const wy = e1 * pa.getX(i) + e5 * pa.getY(i) + e9 * pa.getZ(i) + e13;
            if (wy < low) low = wy;
          }
        }
      }
      const deckY = this.pos.y - P.HY;
      if (scissorDown) {
        // ...the bed: the rig's own lowest vertex placed ON the deck, eased on (see above).
        this.scissorRest = approach(this.scissorRest, deckY - low, dt / Math.max(1e-3, P.SCISSOR_MISS_REST_T));
        this.inner.position.y += this.scissorRest;
      } else if (low < deckY) {
        // ...and the net: a body still on its feet is only ever LIFTED, never dropped.
        this.inner.position.y += deckY - low;
      }
    }
  },
};

export function installPlacement(Player) {
  Object.assign(Player.prototype, placementMethods);
}
