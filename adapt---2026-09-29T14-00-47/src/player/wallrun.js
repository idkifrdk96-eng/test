// ---------------------------------------------------------------------------
// THE WALL RUN AND THE WALL KICK (part 10 of the player.js split).
//
// The two moves that use a face beside you instead of in front of you: the run
// that sticks to it (`tryWallRun` / `endWallRun`) and the kick that leaves it
// (`findKickWall` / `tryWallKick`), plus the kick's own variant picker
// (`nextKickVariant`) — four methods and one function, in a table
// `installWallrun` copies onto `Player.prototype`.
//
// A LEAF with respect to player.js: it imports `P` (player/config.js) and
// `approach` (player/math.js). `nextKickVariant` moved with it (only the wall
// kick used it); its sibling `nextJumpVariant` stayed behind — the jump code in
// `update` still calls that one.
// ---------------------------------------------------------------------------
import * as THREE from "../three.js";
import { P } from "./config.js";
import { approach } from "./math.js";
import { WALL_POSE_FADE } from "./pose.js";

// The same idea for the wall kick (see `KICK_VARIANTS` in streetwear.js): one of four shapes
// per kick, never the one the last kick used, so booting off three walls in a row does not
// play the same frame three times. Counted here rather than read off the rig because a kick
// can be asked for before the mesh has finished building.
function nextKickVariant(cur) {
  const v = (Math.random() * 4) | 0;
  if (v === cur) return (v + 1 + ((Math.random() * 3) | 0)) % 4;
  return v;
}

const wallrunMethods = {

  // A wall run wants the wall *beside* you, and it does not care what you are holding: a
  // running jump that clips a wall with your shoulder is enough. That is the whole point of
  // it — it is the one wall move that never asks you to steer into anything.
  tryWallRun() {
    if (this.wallRunCd > 0) return;
    // It has to have come off a real jump (or be a run already under way), so stepping off a
    // ledge next to a wall does not silently turn into one.
    if (!this.airFromJump && !this.prevWallRun) return;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs < P.WALLRUN_SPEED) return;
    if (this.vel.y < -P.WALLRUN_MAX_FALL) return;
    const dirX = this.vel.x / hs;
    const dirZ = this.vel.z / hs;
    // The player's right-hand axis, so "beside" is measured against how you are travelling.
    const rightX = -dirZ;
    const rightZ = dirX;
    const feet = this.pos.y - P.HY;
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      if (w.topY - feet < P.WALLRUN_TOP) continue;
      const side = rightX * w.nx + rightZ * w.nz;
      const face = dirX * w.nx + dirZ * w.nz;
      // Beside, not ahead or behind: the face normal has to sit near your left/right axis.
      if (Math.abs(side) < 0.6 || Math.abs(face) > 0.55) continue;
      const score = Math.abs(side) - Math.max(0, w.gap) * 2;
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    }
    if (!best) return;
    if (!this.prevWallRun) this.wallRunT = P.WALLRUN_TIME;
    this.wall = best;
    this.wallNx = best.nx;
    this.wallNz = best.nz;
    this.wallCoyote = P.WALL_COYOTE;
    this.attached = true;
    this.attachMode = "run";
    this.wallRunning = true;
    if (!this.prevWallRun) {
      const k = Math.min(P.MAX_SPEED / hs, P.WALLRUN_KICK);
      this.vel.x *= k;
      this.vel.z *= k;
      this.vel.y = Math.max(this.vel.y, P.WALLRUN_LIFT);
      this.grip = Math.min(P.GRIP_MAX, this.grip + 0.25);
    }
  },

  // The wall a dive could boot off: somewhere ahead of your line of travel, close enough to
  // reach, and tall enough to push against. Shared by the kick itself and the HUD hint, so
  // the prompt can never advertise a wall the move would refuse.
  //
  // It looks in two places. First the sensed faces (contact range, which knows the exact gap
  // and the top of the wall), then — because "easier to land" means a tap that lands a moment
  // early has to count — a short ray straight down your line of travel, out to arm's length
  // plus KICK_PAD. The ray also finds walls at an angle the box-distance test reads as
  // "beside you", which is exactly the glancing approach that used to pancake.
  findKickWall() {
    // YOU HAVE TO BE MOVING. Checked first of all, before even the wall you are riding, because
    // the gate is about the body and not the face: under `KICK_MIN_SPEED` (18) a wall run, a
    // slide, a climb and a stand-off all stop answering, so there is nothing for a press, for
    // `kickMem` (which is only ever filled by a frame that got past this line) or for the HUD to
    // find. The line of travel below is a real one for the same reason — there is no need for the
    // old camera-forward fallback once a body this slow has been turned away.
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs <= P.KICK_MIN_SPEED) return null;
    const feet = this.pos.y - P.HY;
    // ...but a wall you are RIDING is the kick's wall by definition, whatever your line of travel
    // along it: the boot goes into the face you are braced off, and "head-on" has no meaning for
    // a face that is beside you by construction. Without this a run, a slide and a climb could
    // not be kicked off at all (the wall is beside you, so `dir · n` is ~0 and the test below
    // refused it) — which is why the kick's poses only ever showed up out of a dive.
    //
    // `attached`/`wall` still hold the PREVIOUS frame's attachment here (this runs before the
    // attach block refreshes them), which is the one frame of grace a press made just as the
    // wall ends up wanting anyway.
    if (this.attached && this.wall && this.wall.topY - feet >= P.KICK_TOPS) return this.wall;
    const dirX = this.vel.x / hs;
    const dirZ = this.vel.z / hs;
    let best = null;
    let bestScore = -1e9;
    // n points away from the face, so a wall dead ahead scores -1 and one beside you 0.
    const consider = (nx, nz, gap, topY) => {
      if (topY - feet < P.KICK_TOPS) return;
      const head = dirX * nx + dirZ * nz;
      if (head > -P.KICK_AHEAD) return;
      const score = -head * 2 - Math.max(0, gap) * 2;
      if (score > bestScore) {
        bestScore = score;
        best = { nx, nz, gap, topY };
      }
    };
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      if (w.gap > P.KICK_PAD) continue;
      consider(w.nx, w.nz, w.gap, w.topY);
    }
    if (this.world && this.world.raycast) {
      const arm = Math.max(P.HX, P.HZ);
      const hit = this.world.raycast(this.pos.x, this.pos.y, this.pos.z, dirX, 0, dirZ, arm + P.KICK_PAD);
      if (hit && (hit.nx || hit.nz)) consider(hit.nx, hit.nz, Math.max(0, hit.t - arm), hit.box.maxY);
    }
    return best;
  },

  // Hitting M1 at a wall you can boot off: the boot goes into the face and you come out of
  // it turned around. The turn itself belongs to the camera (main.js turns the rig onto
  // `kickDir` on the "wallkick" event, in one frame) — the dive is locked to the camera's
  // forward, so turning the view *is* turning the dive, and the muzzle keeps building speed
  // the whole way through. All this does is sell the contact: the shove, the lift, the pose.
  tryWallKick(w) {
    w = w || this.findKickWall();
    if (!w) return false;
    const n = this.wallJumpNormal(w);
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    this.kickWall = w;
    this.wall = w;
    this.wallNx = n.nx;
    this.wallNz = n.nz;
    // Kick with the boot on the wall's side. n points away from the wall, so n along the
    // camera's right axis means the face itself is off to the camera's LEFT — and the
    // model's left leg is the one drawn on the camera's right.
    const rx = cos;
    const rz = -sin;
    this.kickSide = n.nx * rx + n.nz * rz > 0 ? 1 : -1;
    // Which of the four shapes this one is (see `KICK_VARIANTS` in streetwear.js). One variant
    // owns the body for longer than the rest — the flip spins for `KICK_FLIP_TIME` rather than
    // `KICK_POSE` — so its own clock is armed here, and how many turns it wants is read off the
    // rig's table rather than duplicated in this file. A kick fired mid-flip drops the old turn
    // on the floor, and the spin chain below winds whatever is left on to the nearest whole one.
    this.kickVariant = nextKickVariant(this.kickVariant);
    const turns = this.charMesh && this.charMesh.userData.kickSpinTurns
      ? this.charMesh.userData.kickSpinTurns(this.kickVariant)
      : 0;
    this.kickSpinTurns = turns;
    this.kickSpinT = turns ? P.KICK_FLIP_TIME : 0;
    this.kickT = P.KICK_POSE;
    this.kickCd = P.KICK_CD;
    // The kick's own line: along the face normal, which is where a boot into a wall
    // actually sends you. The dive is held on this line while the kick is fresh and
    // hands over to the camera as it fades (see the dive case in `update`).
    this.kickDirX = n.nx;
    this.kickDirZ = n.nz;
    // Out of a kick you are quicker than you arrived. A kick off a dive is measured from
    // DIVE_MAX rather than from the speed that dive happens to be at, so it is felt as a
    // step up rather than absorbed by the dive's own ramp — that is the launch the dive is
    // for. A kick out of a plain jump starts from the speed you actually brought to the
    // wall (never under DIVE_SPEED), so the dive keeps its place at the top of the ladder:
    // a running jump at a wall gets you going, a dive at a wall gets you going fastest.
    const entry =
      this.state === "dive"
        ? Math.max(this.diveSpeed, P.DIVE_MAX)
        : Math.max(Math.hypot(this.vel.x, this.vel.z), P.DIVE_SPEED);
    this.diveSpeed = Math.min(P.MAX_SPEED, entry * P.KICK_BOOST);
    this.vel.x += n.nx * P.KICK_PUSH;
    this.vel.z += n.nz * P.KICK_PUSH;
    this.vel.y = Math.max(this.vel.y, P.KICK_LIFT);
    this.wallLock = P.WALL_LOCK;
    this.wallStick = 0;
    this.attached = false;
    this.attachMode = null;
    this.wallSliding = false;
    this.climbing = false;
    this.wallRunning = false;
    this.jumpsLeft = P.AIR_JUMPS;
    this.airFromJump = true;
    this.squash = -0.45;
    // A fresh dive line: the kick spends the old one, so the dive gets its time back and
    // the lunge pose re-ramps, which is what makes the kick read as a new commitment —
    // and a kick from anything other than a dive is a way *into* one, so the boot always
    // leaves you travelling along the face normal at dive speed.
    if (this.state !== "dive") this.setState("dive");
    this.stateTime = 0;
    if (this.sfx) this.sfx.wallKick();
    // ...and the BOOT's own address on the face (see the wall strike in main.js). `n` points AWAY
    // from the wall, so the blow travelled -n and the face is `half + gap` out along n from the
    // body's centre; the last tenth of a unit is spent INSIDE the stone on purpose, because a
    // boot that lands exactly on the plane is a boot that only just touched it. Boot height, not
    // chest height: this is the one attack in the game whose contact is a foot.
    this.lastWallKick = {
      x: this.pos.x - n.nx * (this.hx + (w.gap || 0) + 0.1),
      y: this.pos.y - P.HY + 0.38,
      z: this.pos.z - n.nz * (this.hz + (w.gap || 0) + 0.1),
      nx: n.nx,
      nz: n.nz,
      speed: Math.hypot(this.vel.x, this.vel.z),
    };
    this.events.push("wallkick");
    // ...and the boot is the WALL CLINCH's first door (see `feedWallChain`): a kick thrown at a wall
    // is "spamming the wall", and five of them is the move.
    this.feedWallChain();
    return true;
  },

  endWallRun(push) {
    if (!this.wallRunning) return;
    this.wallRunning = false;
    this.attached = false;
    this.attachMode = null;
    this.wallRunCd = P.WALLRUN_CD;
    this.wallRunT = 0;
    if (push && (this.wallNx || this.wallNz)) {
      this.vel.x += this.wallNx * P.WALLRUN_END_PUSH;
      this.vel.z += this.wallNz * P.WALLRUN_END_PUSH;
    }
  },

  // ---- wall kick ----
  // Checked here, ahead of the state entries, so the dive's own F press can never read
  // as a kick: on the frame you start diving you are not in "dive" yet.
  // Any airborne state will do — a dive is the fastest way to arrive at a wall, not the
  // price of admission. A vault, a slam and the hammer flurry are mid-commitment, so those are
  // left alone.
  //
  // `kickCandidate` is the kick's reach *this* frame: a wall in range now, or the one you
  // were in range of a blink ago (KICK_COYOTE), which is what makes a press that lands just
  // after the face has already stopped you still count. `kickBuffer` rides a press forward
  // over the same blink, so early counts too.
  readKickReach(dt) {
    const kickLive = this.findKickWall();
    if (kickLive) {
      this.kickMem = kickLive;
      this.kickMemT = P.KICK_COYOTE;
    } else if (this.kickMemT > 0) {
      this.kickMemT = Math.max(0, this.kickMemT - dt);
    }
    this.kickCandidate = kickLive || (this.kickMemT > 0 ? this.kickMem : null);
  },
  // THE KICK'S PRESS (lifted from the middle of `update` — it is the wall kick's own way in, so it
  // belongs beside `tryWallKick`): the kick buffer, with every state that refuses the boot spelled
  // out (a free fall, the mantle, the vault, the dash, the slam, the hammer, the wall beat, the
  // launch, and a climb face, where M1 is the pull). Reads the frame's `grounded` reading and
  // nothing else, which is why that is its whole argument list.
  tickKickPress(grounded) {
    if (
      this.kickBuffer > 0 &&
      this.kickCd <= 0 &&
      !grounded &&
      // ...and a FREE FALL has nothing to boot: the M1 that used to be the wall kick is the plunge
      // up there (see the block in `update`), and the buffer is dropped for the whole of the fall.
      !this.skyfall &&
      this.state !== "mantle" &&
      this.state !== "vault" &&
      this.state !== "dash" &&
      this.state !== "slam" &&
      // ...and the HAMMER with them: the flurry can now be momentarily off the deck on its way into
      // the hole it made (see the plunge check after the move), and a committed flurry must not be
      // kickable out of the one or two frames the fall takes to be admitted.
      this.state !== "smash" &&
      this.state !== "wallbeat" &&
      this.state !== "launch" &&
      // ...and THE BOARD (session 200): a wall kick is a body's own leap off a face and a rider has no
      // foot free to make it — F is the board's own dive (see `startBBomb`) and that belongs to the
      // ride.
      !this.board &&
      // ...and a CLIMB FACE has no kick at all (session 164): M1 is the PULL up there, and a buffer
      // left over from a press made a moment before the grab must not fire into the stone under a
      // body that is loading a skip (see the `CLIMB_LOAD_` block in `P`).
      !(this.attached && this.attachMode === "climb")
    ) {
      if (this.tryWallKick(this.kickCandidate)) this.kickBuffer = 0;
    }
  },
  // THE WALL POSE AND THE CLIMB'S OWN CLOCKS (lifted whole out of `updateVisual`): the layer weight
  // (`wallPose`), the climb's phase and its REST stance's clock, the wall slide's scrape phase, and
  // then the big pose solve — the wall's own frame off `wallRunFrame`, the climb's PULL reading
  // (`climbRiseU`, the hold/release decision) and `poseWall`, `poseClimbPull` and `poseClimbFly`.
  // Reads the frame's `dt`, `inp` and the rig's `userData`, so those are its arguments.
  solveWallPose(dt, inp, ud) {
    this.wallPose = approach(this.wallPose, this.attached ? 1 : 0, dt / WALL_POSE_FADE);
    if (this.attached && this.climbing) {
      // SESSION 156 — THE IDLE SHUFFLE FADES, because with a CLIP it is not a taste choice but a
      // SLIDE. A clip's hands hold the stone only while its playback is EXACTLY proportional to how
      // fast the body is moving past its holds (`vel.y / CLIMB_CYCLE`, `CLIMB_CYCLE` being the travel
      // the clip's own contacts cover in one cycle) — so the old additive `+ CLIMB_CYCLE_IDLE` slid
      // every hold down the stone at `CLIMB_CYCLE_IDLE * CLIMB_CYCLE` u/s whatever the climb was
      // doing (measured before this fade: 0.354 u/s, a palm sweeping 21 cm through a single hold —
      // exactly the swim the 0.59 u/s clock exists to remove). So the shuffle now belongs to a body
      // that is HANGING: it fades out over the first `CLIMB_IDLE_FADE` of vertical speed, and while
      // it is on it is slow enough to read as a settle.
      //
      // ...AND IT IS HOW FAST HE IS MOVING ON THE STONE, NOT HIS RISE (session 161 — the user's *"make
      // the climbing animation speed match the speed of how fast im going"*). It was the vertical
      // velocity ALONE. That is the right clock for the contacts, and it is still exactly the number
      // when he climbs up or down (the traverse is zero then — the grip's no-slip bound is read off
      // this same phase, so straight-up is untouched), but a body working ACROSS the face has
      // `vel.y === 0` and was therefore playing a FROZEN clip — the one reading that is plainly not
      // "the animation matches how fast I am going". The drive is the speed ALONG THE FACE now: the
      // rise and the traverse together (`hypot`), so the walk of the cycle is the same number going
      // straight up and is the traverse's own speed when he is working sideways. Measured: a lateral
      // traverse at `CLIMB_SIDE` 1.6 u/s drove the clip **0.00 cycles/s** before (frozen) and
      // **1.36** after — the same rate a vertical climb of the same speed has always had.
      //
      // ...AND SESSION 162 TAKES THE STROKE OUT OF THE CLOCK (see the `CLIMB_PULL_DEPTH` block in `P`).
      // The climb's vertical speed is now the clip's own stroke profile, so feeding the clock the
      // speed the body is DOING would make the clip stroke with it and the two would chase each
      // other — the palm would slide by `v * (1 - pull)`, up to half the climb at a haul, which is
      // exactly the swim session 156 measured away. So the clock reads what the climb is PULLING
      // FOR instead: `climbUp` / `climbSide`, the push and the momentum before the stroke. The clip
      // then plays at one steady tempo and the body travels exactly what the clip's holds say it may
      // at every phase, so the surge is entirely the animation's and the palm still does not slide.
      // `faceSpd` — what the body is actually doing — is kept, because it is what the idle shuffle
      // fades against and what the rest stance below is gated on.
      const wl = this.wall;
      const vt = wl ? this.vel.x * wl.nz - this.vel.z * wl.nx : 0;
      const faceSpd = Math.hypot(this.vel.y, vt);
      // ...AND IT IS IN THE RIG'S OWN UNITS, which is the thing this clock had been forgetting.
      // `CLIMB_CYCLE` is measured ON THE RIG — `bake.js` rebuilds every key in the rig's own frame
      // and reports the contacts there, 1.18 rig units of wall a cycle — while `climbUp` /
      // `climbSide` are WORLD speeds. The character is drawn at `charMesh.scale` **1.351**, so one
      // rig unit is 1.351 world ones, and feeding a world speed against a rig travel ran the clock
      // **35% fast**: the body rose **1.18 world u a cycle** where the clip's own holds give up
      // 1.594. That is the whole of the user's *"if the character pulls the wall with his hands it
      // pulls him up"* — the body out-ran its own grip, so a planted palm was dragged down the stone
      // at 35% of the climb instead of holding it. MEASURED on the live rig, BEFORE: the body rose
      // **1.1675-1.1869 u a cycle** and a planted palm crept **0.10-0.22 u through one hold, 29-31%
      // of the climb**. AFTER: **1.5839-1.5985 u** against the clip's own 1.5942, and **0.025-0.029 u
      // through a hold — 6-8% of it.** (See "The climb is the clip" in src/README.md: that section's
      // 2.7x playback figure was this same slip, and the honest number is 2.0x at the base 1.6 u/s.)
      // WHETHER THE BODY IS HANGING, read here because the CLIP'S OWN PHASE depends on it (below) and
      // because the rest stance is chosen from it. It is the READ of the input and the speed — the
      // stances' own weights (`climbLoad`, `climbFireT`) are folded in just after.
      const wantRest = Math.max(0, inp.moveZ) < 0.01 && faceSpd < P.CLIMB_REST_SPEED ? 1 : 0;
      const resting = wantRest && this.climbLoad <= 0.02 && this.climbFireT <= 0;
      const rigScale = this.charMesh && this.charMesh.scale.y ? this.charMesh.scale.y : 1.351;
      const driveSpd = Math.hypot(this.climbUp, this.climbSide) / rigScale;
      // ...and THE CLIP DOES NOT CREEP WHILE THE BODY IS PARKED. The idle shuffle (`CLIMB_CYCLE_IDLE`)
      // exists to keep a hanging body alive, but it walks the clip under a hand that is supposed to be
      // ON a hold — and the whole read of a hang is whether the holds are held (see `poseClimbPark`,
      // which solves the parked contacts back onto the plate). So the shuffle stands down for the whole
      // of a park and the clip holds the frame it stopped on; the first hand of movement starts it
      // again. (`idleHold` is 0 only once the stance is actually on the rig, so the fade in is not
      // frozen mid-way through.)
      const idleHold = resting && this.climbRest > 0.5 ? 0 : 1;
      const glide = idleHold ? 1 - Math.min(1, faceSpd / P.CLIMB_IDLE_FADE) : 0;
      this.climbPhase = (this.climbPhase + dt * (P.CLIMB_CYCLE_IDLE * glide + driveSpd / P.CLIMB_CYCLE)) % 1;
      // ...AND THE HANDS HAVE A BEAT (session 181 — the user's *"fix the wall climb sfx"*). The climb
      // has been silent past its first grab: `climbTick` — a short, dry palm-on-stone scrape — has sat
      // in `audio.js` unused since it was written, and this is the thing it was written for. The clip
      // plants four contacts a cycle (two hands, two feet), so the beat is a quarter of the phase and
      // it is read off the PHASE rather than run on a timer, which is what keeps it the sound of what
      // the animation is doing rather than a click track laid under it. It stands down for a hang (a
      // body that is not moving is not re-gripping), for the load and for the flight, and the first
      // frame of a climb only ARMS it — the grab's own sound is `wallGrab`, fired by `attach.js`.
      //
      // ...and SESSION 199 MADE IT THE ONLY DOOR (the user's *"just change the sound sfx for the
      // climb"*). The climb branch in `tickAirState` had ALSO been ticking `wallScrapeT` down to 0.24
      // and firing the same `climbTick` — a leftover from the first cut of the sound — so the wall
      // was hearing two clocks of the same hiss at once. MEASURED on the live page by call site: 29
      // ticks from HERE and 20 from the timer in five seconds, **9.8 ticks/s of doubling**, which is
      // the static the user was hearing. The timer is deleted; the tick is the clip's own beat, and
      // the beat INDEX travels with it (`climbTick(beat)`), so a hand and a foot are different
      // sounds. See the grip note in `audio.js`.
      const quiet = resting || this.climbLoad > 0.02 || this.climbFireT > 0;
      const beat = Math.floor(this.climbPhase * P.CLIMB_BEATS);
      if (beat !== this.climbBeat) {
        if (this.climbBeat >= 0 && !quiet && this.sfx && this.sfx.climbTick) this.sfx.climbTick(beat);
        this.climbBeat = beat;
      }
      // ...and the CLIP'S OWN STROKE is read off that phase (see the `CLIMB_PULL_DEPTH` block in `P`),
      // so a pull in the limbs and a surge in the speed are one event.
      //
      // ...and HANGING IS NOT A STROKE (see `poseClimbPark` / the `CLIMB_REST_` block in `P` — the
      // user's *\"make the idle climb animation like the guy image i sent\"*, rebuilt from scratch in
      // session 199). The clip has no frame that IS a body parked on its holds — it is a stroke, four
      // limbs consumed a cycle — so a hang settles into a park of its own, solved onto the four
      // contacts the clip's own settling frame is measured to hold, and the first hand of movement
      // takes it away again. `inp.moveZ` is read up where the phase is, because the clip's own shuffle
      // depends on it too, and a body that is holding a direction down the face is not parked either;
      // a loading body is not parked (it is the opposite of it — session 164's pull) and a firing one
      // is off its holds entirely, so the three stances can never be on the rig together. This is the
      // only place the stance's WEIGHT moves.
      this.climbRest = approach(this.climbRest, resting ? 1 : 0, dt / (resting ? P.CLIMB_REST_IN : P.CLIMB_REST_OUT));
      // ...and THE PARK'S OWN CLOCK, which is what makes the parked body breathe, shift and look
      // around instead of holding a still frame (see `poseClimbPark`). It is a plain clock on the
      // climb's own time, so nothing about it restarts when the park does.
      this.climbRestT += dt;
    }
    // The wall slide scrapes on the same phase, driven by how fast it is actually sliding: the
    // planted feet re-set and the free arm sweeps with it, so a slow brake and a full-speed
    // drop do not play the same loop.
    else if (this.attached && this.wallSliding) {
      this.climbPhase = (this.climbPhase + dt * (0.35 + Math.min(1.3, Math.abs(this.vel.y) / P.WALL_SLIDE))) % 1;
      this.climbRest = approach(this.climbRest, 0, dt / P.CLIMB_REST_OUT);
    }
    else this.climbRest = approach(this.climbRest, 0, dt / P.CLIMB_REST_OUT);
    if (ud && ud.poseWall && this.wallPose > 0.002) {
      // The run and the slide are the two wall modes whose limbs are SOLVED onto the face, so
      // they are the two that need the wall's frame (see `wallRunFrame`). The run's phase is the
      // run cycle's own, so the planted leg and the free one stride together.
      const framed = (this.wallRunning || this.wallSliding || this.climbing) && this.wall;
      const frame = framed
        ? this.climbing
          // Face-on: the facing is the wall's own normal, so the climb's `T` is handed the world
          // direction of the rig's own +x — across the face, so `along` is measured sideways off
          // the midline (see `wallRunFrame`).
          ? wallRunFrame(this, this.wallFrame, -this.wallNz, this.wallNx)
          : wallRunFrame(this, this.wallFrame)
        : null;
      // THE PULL'S OWN READING, built once here and handed to the pose (see `poseClimbPull`): how much
      // of the load stance is on, how deep the coil has wound, how far past the haul the body has
      // actually risen (which is what takes the hands off the stone), and how far into the fire it is.
      // The rise is handed in RIG units along the wall's own up axis, because that is the frame the
      // contact plans live in and the pose cannot know the rig's scale.
      let pullInfo = null;
      if (this.climbLoad > 0.002 && this.attached && this.attachMode === "climb") {
        const fireS = this.climbFireT > 0 ? 1 - this.climbFireT / P.CLIMB_SKIP_TIME : -1;
        // HOW FAR THE BODY HAS ACTUALLY COME, in rig units along the wall's own up axis. Read off
        // `pos.y` rather than integrated, so the pose's contact compensation and the render cannot
        // drift — whatever a step-up, a ceiling or a collision did to the travel, the holds are placed
        // against the body that actually exists, and the frame is the one THIS frame's pose is about
        // to be written in (`U[1]` is the wall's up against the rig's, 1 on every vertical face).
        const rigScale = this.charMesh && this.charMesh.scale.y ? this.charMesh.scale.y : 1.351;
        // ...and while the fire is over it is NOT zeroed here — `update` unwinds it at
        // `CLIMB_HAUL_UNWIND` so the limbs settle instead of snapping home (a straight zero on this
        // line would overwrite that decay every frame, since `update` runs first).
        if (frame && this.climbFireT > 0) {
          this.climbRiseU = (this.pos.y - this.climbFireY) * frame.U[1] / rigScale;
        }
        // WHETHER THE BODY IS STILL ON ITS HOLDS OR OFF THEM (see the `CLIMB_HAUL_RELEASE` block in
        // `P`): the rise's own threshold decides WHICH state, but the rate is a clock in each
        // direction — off the stone quickly on the leap, back onto it more slowly on the settle — so
        // the handover between the holds and the flight is a movement whether it is the fire tearing
        // the limbs off the face or the body closing them on it again a fifth of a second later.
        const wantRel = this.climbRiseU > P.CLIMB_HAUL_RISE ? 1 : 0;
        this.climbRel = approach(this.climbRel, wantRel, dt * (wantRel ? P.CLIMB_HAUL_RELEASE : P.CLIMB_HAUL_REGRIP));
        pullInfo = {
          load: this.climbLoad,
          sink: this.climbSink,
          charge: this.climbCharge,
          rise: this.climbRiseU,
          fire: fireS,
          t: this.climbRestT,
          rel: this.climbRel,
          // ...and the rig's own scale, because the pull's contacts are the only ones in this pose
          // that are aimed from the WORLD (see the aim note in `poseClimbPull`): the palm and the ankle
          // are read back off the live bones and re-expressed in the rig units every plan in
          // streetwear.js is written in.
          scale: rigScale,
        };
      }
      ud.poseWall(
        this.wallPose,
        this.attachMode || "slide",
        this.wallRunning ? this.runPhase : this.climbPhase,
        this.wallSide,
        frame,
        this.climbRest,
        pullInfo,
        this.climbRestT
      );
      // ...and THE LEAP'S OWN SHAPE on top of it (session 177): while the limbs are off the stone the
      // body wears the pad's own soar (see `poseClimbFly`), so a skip reads as the launch it is rather
      // than as the climb clip reaching. `climbFly` is zero on every frame the body is on its holds.
      if (ud.poseClimbFly && this.climbing && this.climbFly > 0.002) ud.poseClimbFly(this.climbFly);
    }
  },

  // THE WALL KICK'S OWN LAYER (lifted out of `updateVisual`). It is an absolute pose like the
  // dive — it owns the body while it lasts — so it is applied last and with the whole of whatever
  // envelope it is on: `KICK_POSE` normally, but the flip rides its own longer `KICK_FLIP_TIME`
  // so the tuck lasts as long as the turn does.
  solveKickPose(ud) {
    if (ud && ud.poseKick && (this.kickT > 0 || this.kickSpinT > 0)) {
      const spinning = this.kickSpinT > 0;
      const u = spinning ? 1 - this.kickSpinT / P.KICK_FLIP_TIME : 1 - this.kickT / P.KICK_POSE;
      ud.poseKick(u, this.kickSide, this.kickVariant);
    }
  },
};

export function installWallrun(Player) {
  Object.assign(Player.prototype, wallrunMethods);
}

// ---------------------------------------------------------------------------
// Part 24 of the split: THE WALL FRAME AND THE JUMP VARIANTS.
//   - the `_wf*` scratch and `wallRunFrame` — the orthonormal basis the wall-run
//     leg solve works in (both `updateVisual` and the climb ask for it), with its
//     scratch moving because nothing else in player.js touched it;
//   - `nextJumpVariant` — the jump's shape picker, joining its kick sibling
//     `nextKickVariant` here.
// ---------------------------------------------------------------------------
// Scratch for the wall frame below. Module-level so the per-frame solve allocates nothing.
const _wfM4 = new THREE.Matrix4();
const _wfM4i = new THREE.Matrix4();
const _wfM3i = new THREE.Matrix3();
const _wfM3 = new THREE.Matrix3();
const _wfN = new THREE.Vector3();
const _wfNc = new THREE.Vector3();
const _wfT = new THREE.Vector3();
const _wfU = new THREE.Vector3();
const _wfA = new THREE.Vector3();
const _wfB = new THREE.Vector3();
const _wfC = new THREE.Vector3();
const _wfV = new THREE.Vector3();

// The frame the wall-run leg solve works in.
//
// `ax`/`az` is the WORLD direction the `T` axis is measured from, and it is the one thing the
// three wall moves disagree about. The run and the slide pass nothing: their `T` is the FACING —
// the body travels along the face, and its plan is written fore-and-aft along that line. The
// CLIMB is face-on, where the facing IS the wall's own normal and has no along-the-face component
// left to square (the projection collapses to nothing and the basis cannot be built at all), so
// it passes the horizontal ACROSS the face instead and its plan is written up-and-across.
//
// The pose functions work in the character rig's own frame, and the rig is banked, pitched and
// pressed by the time they run — so "out to the face" is NOT the rig's -x axis, and a pose that
// assumed it was would plant the foot on the wall only for one bank angle. The player owns both
// halves of the problem (the transform and the capsule's known gap to the wall), so it is the
// only place that can say where the face is in the rig's coordinates. It hands the pose an
// orthonormal basis there — `N` away from the face, `T` along the run line, `U` up it, all unit
// and all in the rig's own units, so the leg IK can use them directly — plus `dFace`, how far
// the hips sit off the face along `N`. With that, a limb plan is written in wall terms
// ("0.2 along the face, 0.6 below the hip, pressed to the plate") and comes out right whatever
// the bank is doing.
//
// Two of those axes are not the same vector, and that is the point of the pair. `N` is the
// stand-off axis: the local direction whose IMAGE runs along the face normal, so a plan's
// stand-off and the sole turned onto it scale into the world together. But the face is a PLANE,
// and a plane's normal pulls back by the inverse TRANSPOSE — which the rig's little non-uniform
// squash (the inner scale, under the bank) separates from `N` by a few degrees. `T` and `U` are
// squared against that one, because they are how far the foot travels ALONG the face: the drop
// is a long lever, and a few degrees of leak down it buries the sole centimetres into the wall.
export function wallRunFrame(pl, out, ax, az) {
  const bones = pl.charMesh.userData.bones;
  pl.group.updateMatrix();
  pl.inner.updateMatrix();
  pl.charCtn.updateMatrix();
  pl.charMesh.updateMatrix();
  _wfM4.copy(pl.group.matrix)
    .multiply(pl.inner.matrix)
    .multiply(pl.charCtn.matrix)
    .multiply(pl.charMesh.matrix);
  _wfM4i.copy(_wfM4).invert();
  _wfM3i.setFromMatrix4(_wfM4i);
  _wfM3.setFromMatrix4(_wfM4).transpose();
  const nx = pl.wallNx;
  const nz = pl.wallNz;
  _wfN.set(nx, 0, nz).applyMatrix3(_wfM3i).normalize();
  _wfNc.set(nx, 0, nz).applyMatrix3(_wfM3).normalize();
  _wfT.set(ax === undefined ? Math.sin(pl.facing) : ax, 0, az === undefined ? Math.cos(pl.facing) : az).applyMatrix3(_wfM3i);
  _wfT.addScaledVector(_wfNc, -_wfT.dot(_wfNc)).normalize();
  // Up from the other two rather than transformed, so the basis stays exactly orthogonal under
  // the rig's small non-uniform squash. The bank can tip it either way, so take the up one.
  _wfU.crossVectors(_wfT, _wfNc).normalize();
  if (_wfU.y < 0) _wfU.negate();
  // The face itself, as the capsule's own contact point in the WORLD, where the distance to a
  // plane is the plain thing it sounds like — then read back along the stand-off axis in rig
  // units, so the plan's own arithmetic stays in one system.
  const half = Math.abs(nx) * P.HX + Math.abs(nz) * P.HZ;
  const reach = half + (pl.wall && pl.wall.gap > 0 ? pl.wall.gap : 0);
  _wfA.set(pl.pos.x - nx * reach, pl.pos.y, pl.pos.z - nz * reach);
  _wfB.set(0, bones.hips.position.y, 0).applyMatrix4(_wfM4);
  _wfC.subVectors(_wfB, _wfA);
  const eN = 1 / (_wfV.set(nx, 0, nz).applyMatrix3(_wfM3i).length() || 1);
  out.dFace = (_wfC.x * nx + _wfC.z * nz) / eN;
  _wfN.toArray(out.N);
  _wfT.toArray(out.T);
  _wfU.toArray(out.U);
  return out;
}

// The next airborne shape (see `poseAir` in streetwear.js): a fresh pick each jump, but never
// the one the previous jump used, so a bunny-hop chain never settles into a two-frame loop.
export function nextJumpVariant(cur) {
  const v = (Math.random() * 3) | 0;
  if (v === cur) return (v + 1 + ((Math.random() * 2) | 0)) % 3;
  return v;
}
