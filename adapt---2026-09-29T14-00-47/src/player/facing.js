// ---------------------------------------------------------------------------
// THE FACING (part 44 of the player.js split).
//
// The whole of `update`'s `// ---- facing / visual ----` block: the step sound, and
// then the long chain that decides which way the body's own line points this frame —
// the clash's rotation lock, the launch's own line, the mantle's turn onto its face,
// the vault's held line, the skills' own aim (whirl / scissor / capo / knee / grab /
// lunge), the staff's, the guard's, the climb's and the wall slide's, the first-person
// and SHIFT-LOCK cases, the dash's own line and, last, the run's turn onto its travel.
//
// Verified reading `hsAfter` (the caller needs it for `updateVisual`), so `tickFacing`
// COMPUTES it and RETURNS it: `const hsAfter = this.tickFacing(dt, hasWish, wx, wz, sin,
// cos);` — the wish and the camera basis are its args because the run's own aim and the
// carry's line are read off them. Deps: `P` (./config.js) and `wrapPi` (./math.js).
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { wrapPi } from "./math.js";

const facingMethods = {

  tickFacing(dt, hasWish, wx, wz, sin, cos) {
    const hsAfter = Math.hypot(this.vel.x, this.vel.z);
    if ((this.state === "ground" || (this.state === "block" && this.guardCharging)) && this.grounded && hsAfter > 1.5) {
      this.stepT -= dt * (0.55 + hsAfter * 0.11);
      if (this.stepT <= 0) {
        this.stepT = 1;
        if (this.sfx) this.sfx.step(hsAfter > P.SPRINT * 0.8);
      }
    }
    if (this.state === "clash") {
      // THE M1 CLASH locks the body's ROTATION (the user's "only add player rotation lock when m1
      // clashing"). `updateClash` has already written this body's line onto the opponent, and
      // nothing below may take it back while the two fists are locked — not the lock's
      // mouse-driven turn, not the wish, not the run's turn-onto-travel. So the shoving match
      // cannot be steered out of and turning the look cannot whip the body off the one line the
      // lock is read from: the pair stay square on each other until the race is decided.
    } else if (this.state === "launch") {
      // The pad's flight faces its own line and nothing else. The arc was aimed at the roof when
      // it was solved, and the aim is the whole ride — steering the body mid-flight would swing
      // the character (and the camera behind it) off the line it is actually travelling.
      if (this.launch) this.facing = Math.atan2(this.launch.dx, this.launch.dz);
    } else if (this.state === "mantle" && this.mantleTo) {
      const targetYaw = Math.atan2(-this.mantleTo.nx, -this.mantleTo.nz);
      const diff = wrapPi(targetYaw - this.facing);
      this.facing += diff * Math.min(1, dt * 14);
    } else if (this.state === "vault") {
      // ...and a vault holds the line it crossed on. It is set exactly when the move opens, and
      // kept here because the body is placed rather than driven (`vel` is zero for the crossing),
      // so nothing else in this chain has anything to say about where it points.
      const targetYaw = Math.atan2(this.vaultTo.x - this.vaultFrom.x, this.vaultTo.z - this.vaultFrom.z);
      const diff = wrapPi(targetYaw - this.facing);
      this.facing += diff * Math.min(1, dt * 20);
    } else if (this.state === "dive") {
      const targetYaw = Math.atan2(-sin, -cos);
      const diff = wrapPi(targetYaw - this.facing);
      this.facing += diff * Math.min(1, dt * 18);
    } else if (this.state === "whirl" || this.state === "scissor" || this.state === "capo") {
      // ...and a SKILL is aimed with the camera too — but by PAN, not by snap: the run is locked
      // for the whole of a skill (no stick, no jump; see the jump block and `updateWhirl`), so the
      // camera is the ONLY thing that can aim one, and this is what aims it. The pan is the same
      // `camYaw` line the dive rides (`camYaw + PI`, which is `(-sin, -cos)`: the camera's own
      // forward), just slower — the user's *"the player pans his rotation to the camera angel but
      // dont make it an instant"* — so a move pressed on a stale aim turns onto the camera over the
      // opening of it rather than teleporting there. `P.SKILL_TURN` is the whole tuning.
      //
      // ...AND THE STICK AIMS IT TOO — the user's *"dont make it lock player rotation"* (and its
      // twin, *"theres a bug where it forces the skill to be 2d i dont want that"*): a direction
      // held through the move turns the body onto it, exactly as it does for a run, so the whirl
      // can be CURVED by hand and does not have to be run down one line. It is the whirl alone —
      // the scissor and the capo keep the camera's aim, because neither of them is driven along its
      // own facing the way a running whirl is.
      if (this.state === "whirl" && hasWish) {
        const targetYaw = Math.atan2(this.wishX, this.wishZ);
        const diff = wrapPi(targetYaw - this.facing);
        this.facing += diff * Math.min(1, dt * P.SKILL_STICK_TURN);
      } else {
        const targetYaw = Math.atan2(-sin, -cos);
        const diff = wrapPi(targetYaw - this.facing);
        this.facing += diff * Math.min(1, dt * P.SKILL_TURN);
      }
    } else if (this.state === "knee") {
      // THE FLYING KNEE AIMS ITSELF (see `knee` / `updateKnee`). Every other skill keeps the
      // CAMERA's line, because every other skill is aimed by the player; this one is a chase — the
      // run-up exists to close on a body and the leap is solved onto that body's HEAD — so what the
      // body turns onto is the TARGET, not the crosshair, and it does it at `KNEE_TURN` (fast: the
      // run-up is 20 u/s and a chase that turned slowly would run past what it is chasing). The
      // head is re-aimed every frame of both live phases, so a body that steps aside is still
      // followed, and once the contact has landed (or with nothing to chase) the aim is left where
      // the leap put it — the last thing the body was pointed at.
      const e = this.kneeTarget;
      const want = (!this.kneeHit && e && e.built)
        ? Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z)
        : this.kneeAimZero;
      const diff = wrapPi(want - this.facing);
      this.facing += diff * Math.min(1, dt * P.KNEE_TURN);
    } else if (this.state === "grab") {
      // THE GRAB AIMS ITSELF (see `grab` / `updateGrab`). Like the knee, this one is aimed by what
      // it is TAKING rather than by the crosshair: all three kinds are about where the body is, and
      // the hands are solved onto that body's own bones, so the rig has to be turned onto it or the
      // arms would be reaching round the side of its own chest. The turn is a rate rather than a
      // snap (`GRAB_TURN`) because the body walking into the move is a step, not a turntable — and
      // a whiff keeps the line it was pressed on (`grabAimZero`), so the chest shape still plays
      // out along the direction the player was facing.
      const e = this.grabTarget;
      const want = (e && e.built && !this.grabReleased)
        ? Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z)
        : this.grabAimZero;
      const diff = wrapPi(want - this.facing);
      this.facing += diff * Math.min(1, dt * P.GRAB_TURN);
    } else if (this.state === "lunge") {
      // ...and THE LUNGE HOLDS ITS OWN LINE, and is the one move in the game that is set on the
      // frame it opens and never touched again (see `startLunge`): the pounce, both rolls and the
      // leap-off all run down the line the RUN was on, and both bodies are placed against it. A
      // wish held through it must not swing the roll (`hsAfter > 1.2 && hasWish` below would, and
      // a forward roll that arced would be a different move), and it is not the camera's either —
      // a pounce is thrown, and a throw that could be re-aimed mid-air is not committed to
      // anything. This branch is the whole of the read: nothing to do, and it must be HERE rather
      // than left to the chain below.
    } else if (this.state === "poleatk") {
      // THE STRIKE'S OWN AIM (see `poleStrike` / `updatePoleStrike`). The flurry is thrown down the
      // BODY's line — every beat's hitbox reads `facing`, and the forward carry pushes along it —
      // so a string that could not be turned would be a string thrown at wherever the last press
      // happened to leave the body. What this owns, then, is the CARVE: a wish held through the move
      // swings the whole three-beat flurry round onto it at `POLE_ATK_SPIN`, which is what lets a
      // player walk the string onto a body that is circling him. With NO wish held the line is left
      // exactly where the press put it — a strike is a throw, and a throw that drifted off its line
      // on its own would be one the player cannot aim.
      //
      // The body's whole yaw through the move is `facing + poleAtkSpin` (see `updateVisual`), so the
      // revolution the shape is authored on rides round with the aim rather than fighting it, and
      // the carve therefore reads as the body leaning into the turn.
      if (hasWish) {
        const want = Math.atan2(wx, wz);
        const diff = wrapPi(want - this.facing);
        this.facing += diff * Math.min(1, dt * P.POLE_ATK_SPIN);
      }
    } else if (this.state === "polethr" || this.state === "polevlt") {
      // ...AND THE THROW AND THE VAULT LOOK WHERE THE CAMERA DOES, at the guard's own `SKILL_TURN`
      // — the rate the dash and the step moves aim at (`SKILL_TURN` 12 closes ~90% of the gap in
      // 0.2 s, see its note): both are moves the player is aiming rather than moves that aim
      // themselves. The THROW is the clearest case: the staff leaves on the body's line (and
      // `poleThrowRelease` snaps it onto the nearest body inside a narrow cone of it), so the
      // wind-up is exactly where the line is chosen and the body has to come onto the look before
      // the release fires. The VAULT is the same read one move on — the launch is thrown down
      // `facing`, so the flip's own clock is the last chance to point it (and it is aimed at
      // `SKILL_TURN` for the whole of it, which handily also turns the flip onto the look).
      const want = Math.atan2(-sin, -cos);
      const diff = wrapPi(want - this.facing);
      this.facing += diff * Math.min(1, dt * P.SKILL_TURN);
    } else if (this.state === "block") {
      // THE BLOCK's own aim. The GUARD keeps its eyes on the CAMERA's line — the same pan the shift
      // lock and the dash use, at `BLOCK_TURN` — because the guard is a stance whose movement is
      // camera-relative: turning the look turns the body with it, and A/D are strafes taken under
      // the raised hands rather than a turn onto the direction of travel. The CHARGE, on the other
      // hand, faces the LINE IT IS TRAVELLING, which is the only line there is (the wish no longer
      // moves the body directly — it swings that line, see the `block` case); it comes round onto it
      // at `BLOCK_RUSH_TURN`, slowly, so a charge carved round reads as a body leaning into a turn
      // rather than as a turntable.
      const want = this.guardCharging
        ? Math.atan2(this.guardDirX, this.guardDirZ)
        : Math.atan2(-sin, -cos);
      const diff = wrapPi(want - this.facing);
      this.facing += diff * Math.min(1, dt * (this.guardCharging ? P.BLOCK_RUSH_TURN : P.BLOCK_TURN));
    } else if (this.board) {
      // THE DECK'S OWN LINE (session 200 — see player/board.js). The rig faces the way the deck is
      // TRAVELLING: the deck IS the travel, so any other line is a body riding sideways. This sits
      // ABOVE the first-person and SHIFT-LOCK cases on purpose — the lock holds a body on the CAMERA's
      // line so that A/D become strafes, and there is no walking on a deck to strafe; and a rig the
      // board's carve cannot be read off is not a rig riding a board.
      //
      // ...AND THE MANUAL PIVOT (see `tickRideState`): at a standstill — or nose-to-a-wall, where the
      // collision eats the velocity every frame — the facing is turned straight onto the stick, so the
      // deck can be spun to any angle in place and the next kick leaves along it. It sits above the
      // travel-follow so a slow creep into the wall cannot drag the aim back off the stick.
      if (this.grounded && this.trickKind < 0 && this.boardManual > 0.3 && hasWish && hsAfter < 1.0) {
        const diff = wrapPi(Math.atan2(wx, wz) - this.facing);
        const rate = P.BOARD_TURN * P.BOARD_MANUAL_TURN;
        const turn = Math.max(-rate * dt, Math.min(rate * dt, diff));
        if (turn !== 0) this.facing = wrapPi(this.facing + turn);
      } else if (hsAfter > 0.6) {
        const targetYaw = Math.atan2(this.vel.x, this.vel.z);
        const diff = wrapPi(targetYaw - this.facing);
        this.facing += diff * Math.min(1, dt * 16);
      }
    } else if (this.climbing && this.wall) {
      // Square up to the wall while climbing: a climb is a face-on move.
      const targetYaw = Math.atan2(-this.wall.nx, -this.wall.nz);
      const diff = wrapPi(targetYaw - this.facing);
      this.facing += diff * Math.min(1, dt * 16);
    } else if (this.wallSliding && this.wall) {
      // A slide is a BRACE against the face, and the pose solves a foot and a palm onto that
      // face — so the wall has to stay BESIDE the character rather than in front of it, or the
      // brace ends up reaching backwards. So the facing is held on the wall's own tangent,
      // taking whichever of the two directions is closer to the way the body is already turned.
      //
      // This rate is the HOLD, not the way in: the attach has already squared the body onto the
      // tangent, in the same frame it took the wall (see the slide's attach site, and *"the arm is
      // not there"* in session 144's note). Easing onto the tangent from a head-on approach instead
      // is what dragged the brace arm through the stone for the slide's first ~10 frames — measured
      // 0.35 u deep — because the arm is authored to brace on a face that is already BESIDE the body.
      // Nothing about a slide in progress changed; this just no longer has to turn one in.
      const tx = -this.wall.nz;
      const tz = this.wall.nx;
      const sgn = Math.sin(this.facing) * tx + Math.cos(this.facing) * tz >= 0 ? 1 : -1;
      const targetYaw = Math.atan2(tx * sgn, tz * sgn);
      const diff = wrapPi(targetYaw - this.facing);
      this.facing += diff * Math.min(1, dt * 12);
    } else if (this.firstPerson) {
      // FIRST PERSON (V). The eye is the head, so the body has to be the camera's mount: the facing
      // comes round onto the camera's own forward (`camYaw + PI`, the same line the lock and the
      // skills use) at `FP_TURN`. It sits ABOVE the branches below on purpose — a run's turn-onto-
      // travel and a step's pan would both have the body chasing whatever it happens to be moving
      // at, which is what left the view spinning inside a body that never turned. Holds that own
      // their own aim (a grab, a vault, a launch) keep theirs, because their branches are above
      // this one, and `camera.js` turns the LOOK onto them instead (see `FP_BODY_AIM`).
      const targetYaw = Math.atan2(-sin, -cos);
      const diff = wrapPi(targetYaw - this.facing);
      this.facing += diff * Math.min(1, dt * P.FP_TURN);
    } else if (this.shiftLock) {
      // THE LOCK (see `P.LOCK_*`). The body is held on the CAMERA's line and nothing else — which
      // is the whole of the difference from the branch below it: there the facing chases whatever
      // body is running at, so a held A or D becomes a U-turn within a couple of frames. Here the
      // line is the crosshair's, so A/D are a strafe and S is a backpedal and he keeps looking where
      // he is aiming — the user's *"u walk left or right while my head is still looking at the
      // crosshair ... and if i press S i walk backward while still looking at the cross hair
      // direction"*. The rate is deliberately not infinite: `LOCK_TURN` closes 95% of the gap in
      // about 0.09 s, so turning the mouse is still a smooth pan of the body rather than a snap.
      const targetYaw = Math.atan2(-sin, -cos);
      const diff = wrapPi(targetYaw - this.facing);
      this.facing += diff * Math.min(1, dt * P.LOCK_TURN);
    } else if (this.state === "dash") {
      // A STEP IS NOT AIMED — it is only kept from being LOCKED. The user's own words: *"all the
      // dashes the camera and the player can be turned around they dont have a player rotation
      // lock"*. So nothing here may take the CAMERA away from the body while a step is on (which is
      // what the empty branch that used to sit here did: it froze the facing on the line the step
      // opened on for the whole of it), and the line the step TRAVELS is untouched either way —
      // that was settled when it opened. What the body FACES is the camera's own line, on the
      // skills' own pan: turn the look mid-step and the body turns with it. (With the shift lock on
      // the branch above already owns this, at the lock's own snappier rate, so the step feels the
      // same as every other move does under the lock.) A sidestep or a backstep depends on it: a
      // step is a shape thrown out of the body's own frame, so a body left facing its line of
      // travel would play the sidestep's pose straight down it.
      const targetYaw = Math.atan2(-sin, -cos);
      const diff = wrapPi(targetYaw - this.facing);
      this.facing += diff * Math.min(1, dt * P.SKILL_TURN);
    } else if (hsAfter > 1.2 && hasWish) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      const diff = wrapPi(targetYaw - this.facing);
      this.facing += diff * Math.min(1, dt * 20);
    }

    return hsAfter;
  },
};

export function installFacing(Player) {
  Object.assign(Player.prototype, facingMethods);
}
