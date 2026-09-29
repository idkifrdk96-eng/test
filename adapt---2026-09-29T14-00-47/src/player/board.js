// ---------------------------------------------------------------------------
// THE SKATEBOARD — the body's half (session 200).
//
// The brief, verbatim: *"add skateboard and make me able to get on it and do flips with it and stuff
// u can take animations from the marketplace if you have to but make the slide mech and dive and all
// the stuff unqiue for it not the same make able to get on it by pressing E"*.
//
// `inventory.js` owns the PROP: where the board lies, the mount and the dismount, the mesh that is
// PARENTED INTO `tiltG` while riding (so the deck is the body's own floor and its facing, its height
// and the ground's lean all move it for free) and the drop it is handed back as. This file owns what
// the BODY does on one, and it is three STATES rather than three modifiers, because the *"make the
// slide mech and dive and all the stuff unqiue for it not the same"* is a statement about the
// MECHANICS and not about the animations:
//
//   `ride`    the mode itself. The deck is the floor: the wish CARVES the line and never accelerates
//             (the push is a cadence — see `tickRideState`), the rolling drag is the only thing
//             bleeding speed, and the run's own `MAX_SPEED` cap is lifted for the whole of it. A
//             board is fast because a hill can take it faster than a man can run, which is the whole
//             reason to be on one.
//   `bslide`  THE POWERSLIDE (SHIFT) — and it shares nothing with the on-foot slide but the word.
//             That one HOLDS its speed, has no friction at all for its first half-second and ends
//             when you let go; this one is a BRAKE: the deck is put sideways to its own line, the
//             scrub is a constant deceleration that grows with speed, and the angle itself can be
//             steered while it runs. It is the only way to stop on a board, which is why it is not a
//             flourish.
//   `bbomb`   THE BOMB (F) — and it shares nothing with the flying dive but the key. The dive is a
//             head-first glide the camera steers; this one is thrown AT the deck under the steepest
//             gravity in the game, with the travel GROWN rather than spent, and it is the one landing
//             that keeps its speed (a bomb that scrubbed off on arrival would not be one).
//
// ...AND M1 IS THE TRICK. The spin, the clock and the pop are all read off the RIG (`boardTrick` —
// see the `BOARD_TRICKS` table in streetwear.js), so the deck that is drawn and the airtime the pop
// bought are one decision and cannot drift apart. SPACE is the OLLIE (the same pop with no spin at
// all) and M2 is the MANUAL, which is the only one of the five that is a HOLD.
//
// A LEAF with respect to player.js: `P` (./config.js), `approach`/`wrapPi` (./math.js),
// `bleedSpeed` (./physics.js) and the two pose fades (./pose.js). `installBoard(Player)` copies the
// methods onto `Player.prototype`.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { approach, wrapPi } from "./math.js";
import { bleedSpeed } from "./physics.js";
import { BOARD_POSE_FADE, BSLIDE_POSE_FADE, BBOMB_POSE_FADE } from "./pose.js";

// The three states a ride can be in. Read by `riding`/`aboard` and by the tidy-up at the end of
// `update` (a ride that a LAUNCH PAD, a wall or a respawn has taken the body out of hands the deck
// back rather than leaving it parented to a body that is no longer on it).
const RIDE_STATES = { ride: 1, bslide: 1, bbomb: 1 };

// The trick's own spin curve: fast off the flick and squared up by the end, which is what a flip
// does — it is thrown, not turned. `s(0) = 0` and `s(1) = 1` exactly, so the deck lands SQUARE (an
// absolute function of the phase, so it cannot accumulate drift either).
function flipCurve(x) {
  const t = x <= 0 ? 0 : x >= 1 ? 1 : x;
  return 1 - (1 - t) * (1 - t);
}

const boardMethods = {

  // ---- is the body on a deck? -------------------------------------------------------------------
  // `riding` is the fact the GEAR wrote (`player.board`, see `mountBoard`), `aboard` is the fact the
  // STATE MACHINE is wearing — they are two different questions and both are asked: the first is what
  // gates every other verb in the game, the second is what gates the ride's own ticks.
  riding() {
    return !!this.board;
  },
  aboard() {
    return !!RIDE_STATES[this.state];
  },

  // ---- MOUNT / DISMOUNT (called by inventory.js's `mountBoard` / `dismountBoard`) ---------------
  // Everything the ride owns, put back on the frame the feet land on the deck: the shape's own
  // weight at zero (so it fades in over `BOARD_POSE_FADE` rather than popping on), the line's own
  // bookkeeping, and the pose's clock. The DECK is not touched here — it was already parented and
  // given its height by the caller.
  startRide() {
    this.setState("ride");
    this.rideT = 0;
    this.ridePose = 0;
    this.boardLift = 0;
    this.boardCarve = 0;
    this.boardManual = 0;
    this.boardPushT = 0;
    this.boardPushPh = -1;
    this.trickKind = -1;
    this.trickT = 0;
    this.trickDur = 0.5;
    this.trickCd = 0;
    this.trickCycle = 0;
    this.trickSpins = false;
    this.trickFlip = 0;
    this.trickPop = 0;
    this.trickTurns = 1;
    this.trickSpinDir = 1;
    this.spinLoops = 0;
    this.flipUnwind = 0;
    this.trickSpd0 = 0;
    this.boardMissT = 0;
    this.bslideT = 0;
    this.bslideAngle = 0;
    this.bslideSide = 0;
    this.boardTuck = 0;
    this.ollieCharging = false;
    this.ollieCharge = 0;
    this.olliePopK = 1;
    this.airCycle = -1;
    this.trickIsAir = false;
    this.trickAirIdx = -1;
    this.trickAirN = 0;
    this.boardScore = this.boardScore || 0;
    this.trickUnwind = 0;
    this.bbombT = 0;
    this.bbombCd = 0;
    this.boardSpinY = 0;
    // The buffered presses belong to the body that was walking: a SLIDE held down as he stepped on
    // (SHIFT is also the run's crouch) must not open a powerslide on the mount frame.
    this.slideBuffer = 0;
    this.jumpBuffer = 0;
    this.diveBuffer = 0;
    this.slamBuffer = 0;
    this.attackBuf = 0;
    this.crouching = false;
    if (this.sfx && this.sfx.boardMount) this.sfx.boardMount();
    this.events.push("boardmount");
  },

  // ...and the other end. `dismountBoard` has already taken the mesh out of the rig and given it back
  // to the world at its world transform, so all that is left is the body: back to the deck it is
  // standing on (or the air it is falling through), walking away with a share of the speed (see
  // `P.BOARD_DISMOUNT_V` — a step-off at 30 u/s is a body that stumbles to a walk, not one that
  // teleports to 30; the BOARD keeps all of it and rolls on, which is the honest read of the pair).
  endRide() {
    if (RIDE_STATES[this.state]) this.setState(this.grounded ? "ground" : "air");
    this.trickKind = -1;
    this.trickT = 0;
    this.trickUnwind = 0;
    this.trickSpins = false;
    this.trickFlip = 0;
    this.trickPop = 0;
    this.trickTurns = 1;
    this.trickSpinDir = 1;
    this.spinLoops = 0;
    this.flipUnwind = 0;
    this.boardPushPh = -1;
    this.boardPushT = 0;
    this.bslideAngle = 0;
    this.bbombT = 0;
    this.boardTuck = 0;
    this.ollieCharging = false;
    this.trickAirN = 0;
    this.boardSpinY = 0;
    const k = P.BOARD_DISMOUNT_V;
    this.vel.x *= k;
    this.vel.z *= k;
  },

  // ---- THE RIDE ----------------------------------------------------------------------------------
  // The `ride` case of `tickStateMachine`. Five things, in order: the clocks, the OLLIE and the
  // TRICK press, the LINE (the carve and the push), the deck's own pull, and the way out.
  tickRideState(dt, inp, hasWish, wx, wz, grounded) {
    this.rideT += dt;
    if (this.trickCd > 0) this.trickCd = Math.max(0, this.trickCd - dt);
    if (this.boardMissT > 0) this.boardMissT = Math.max(0, this.boardMissT - dt);
    if (this.bbombCd > 0) this.bbombCd = Math.max(0, this.bbombCd - dt);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.tickTrick(dt, grounded, inp.kickHeld);
    // ---- the presses the board owns ---------------------------------------------------------------
    // M1 is the next FLIP in the cycle (deterministic rather than random, so a player can learn what
    // the button does — the HUD names the one that just landed), SPACE is the OLLIE, and both are the
    // same machinery: `startTrick(0)` is the ollie's row. A power-trick in the AIR is allowed and is
    // how a flip is actually thrown here (ollie, then M1); what an airborne trick does NOT get is the
    // pop — there is no tail to snap in the air, and a mid-air `max` on `vel.y` would be a second
    // jump.
    const ud = this.charMesh && this.charMesh.userData;
    const flips = (ud && ud.boardFlipCount) || 5;
    const airs = (ud && ud.boardAirCount) || 5;
    // M1 chains in the air: a live airborne trick does not block the next one, it is REPLACED by
    // it (only the trick that touches down pays out — the stack counts them all). That is the
    // whole of an ollie-then-M1 line: the ollie opens the airtime, the grabs spend it.
    const airChain = !grounded && this.trickKind >= 0;
    if ((this.trickKind < 0 || airChain) && this.trickCd <= 0) {
      if (inp.jumpPressed) {
        this.jumpBuffer = 0;
        // THE CHARGED OLLIE (the Tony Hawk bargain): a grounded press starts a crouch and the
        // RELEASE pops, higher the longer the hold — an airborne press is a flip at once, as before.
        if (grounded) {
          this.ollieCharging = true;
          this.ollieCharge = 0;
        } else {
          this.startTrick(0, grounded, hasWish, wx, wz);
        }
      } else if (inp.kickPressed) {
        // GROUND tricks on the deck, AIR tricks upstairs: one button, two cycles, and which one it
        // is is decided by where the wheels are.
        if (grounded) {
          this.trickCycle = (this.trickCycle + 1) % Math.max(1, flips);
          this.startTrick(this.trickCycle + 1, grounded, hasWish, wx, wz, false);
        } else {
          const n = Math.max(1, airs);
          let idx = 0;
          if (n <= 1) {
            idx = 0;
          } else if (!this.trickIsAir || this.airCycle < 0) {
            idx = (Math.random() * n) | 0;
          } else {
            do {
              idx = (Math.random() * n) | 0;
            } while (idx === this.airCycle);
          }
          this.airCycle = idx;
          this.startTrick(this.airCycle, grounded, hasWish, wx, wz, true);
        }
      }
    }
    // ...charging the ollie: the hold crouches, the RELEASE pops with height by hold time —
    // a tap hops, a full hold boosts a little past a plain ollie, and holding longer never adds
    // more. Riding off the deck unpopped, or starting anything else, cancels.
    if (this.ollieCharging) {
      if (this.trickKind >= 0) {
        this.ollieCharging = false;
      } else if (!grounded) {
        // ...rode off the deck mid-charge: the lip ollie. A press a frame before a ledge still
        // jumps — it pops with whatever the hold had earned, passed as grounded so the pop spends.
        this.ollieCharging = false;
        this.olliePopK = P.OLLIE_POP_MIN + (P.OLLIE_POP_MAX - P.OLLIE_POP_MIN) *
          Math.min(1, this.ollieCharge / P.OLLIE_CHARGE_MAX);
        this.startTrick(0, true, hasWish, wx, wz);
        this.olliePopK = 1;
      } else {
        this.ollieCharge += dt;
        if (!inp.jumpHeld) {
          this.ollieCharging = false;
          this.olliePopK = P.OLLIE_POP_MIN + (P.OLLIE_POP_MAX - P.OLLIE_POP_MIN) *
            Math.min(1, this.ollieCharge / P.OLLIE_CHARGE_MAX);
          this.startTrick(0, grounded, hasWish, wx, wz);
          this.olliePopK = 1;
        }
      }
    }
    // ...and the MANUAL. M2 is the right button, and on a deck it is a HOLD rather than the grab:    // every other verb in the game that answers to that button is refused for the whole ride (see
    // the gate in `grab`). It is only a manual on the DECK — a body holding the nose up in mid-air
    // would be holding the deck against nothing.
    if (!grounded && !this.ollieCharging && inp.divePressed && sp > P.BBOMB_ENTER_V && this.bbombCd <= 0) this.startBBomb(true);
    const manualWant = grounded && this.trickKind < 0 && inp.grabHeld ? 1 : 0;
    this.boardManual = approach(this.boardManual, manualWant, dt / 0.14);
    // THE LINE. A carve bends the direction of the velocity and NEVER its magnitude — the slide's own
    // bargain (see `tickSlideState`), one number off it — and the rate falls off with speed, which is
    // the difference between a carve and a skid. `hasWish` is the whole of the input: a stick held
    // anywhere swings the line onto it, so the lane is steered exactly as a run is.
    let carveWant = 0;
    if (hasWish && sp > 0.25) {
      const rate = (sp >= P.BOARD_TURN_FULL
        ? P.BOARD_TURN_FAST
        : P.BOARD_TURN + (P.BOARD_TURN_FAST - P.BOARD_TURN) * (sp / P.BOARD_TURN_FULL)) *
        // ...AND THE MANUAL PIVOTS: nose up, the deck turns on the tail, so the line comes
        // round faster — blended on the manual's own fade, so it eases in with the nose.
        (1 + (P.BOARD_MANUAL_TURN - 1) * this.boardManual);
      const diff = wrapPi(Math.atan2(wx, wz) - Math.atan2(this.vel.x, this.vel.z));
      const turn = Math.max(-rate * dt, Math.min(rate * dt, diff));
      if (turn !== 0) {
        const yaw = Math.atan2(this.vel.x, this.vel.z) + turn;
        this.vel.x = Math.sin(yaw) * sp;
        this.vel.z = Math.cos(yaw) * sp;
      }
      // ...and what the BODY reads off it: how hard the line is being bent, in -1..1, which is the
      // lean over the deck's edge (see `poseRide`). Zero on a straight line, so the stance comes back
      // level the moment the stick is let go.
      carveWant = Math.max(-1, Math.min(1, diff / 0.8));
    } else if (grounded && hasWish && this.trickKind < 0 && this.boardManual > 0.3) {
      // THE MANUAL PIVOT. A carve bends the VELOCITY, so at a standstill — or nose-to-a-wall, where
      // the collision zeroes it every frame — there is nothing to bend and the deck cannot be turned
      // at all. But a manual stands on the TAIL, so the deck is turned, not the travel: the actual
      // turn of `facing` is owned by `tickFacing` (single source, so the rate stays exact) — here the
      // lean is read off the same gap, so the body banks into the pivot it is about to make.
      const diff = wrapPi(Math.atan2(wx, wz) - this.facing);
      carveWant = Math.max(-1, Math.min(1, diff / 0.8));
    }
    this.boardCarve = approach(this.boardCarve, carveWant, dt / 0.18);
    // ---- THE PUSH ---------------------------------------------------------------------------------
    // A board has no throttle, so the way it goes faster is the way a real one does: the back foot
    // goes down and kicks. Holding the FORWARD is the whole of the input (there is no button left —
    // the five the deck has are all spoken for), one kick every `BOARD_PUSH_CAD`, each worth
    // `BOARD_PUSH_V` up to `BOARD_PUSH_TOP`; above that the feet stay on the deck and the hill does
    // the rest. The CYCLE runs to its own end even when the key is let go, so the foot always comes
    // back down onto the deck instead of being left in the air. No kick while the nose is up
    // (a manual) or while an ollie is being charged — both feet are spoken for.
    const pushing = grounded && this.trickKind < 0 && hasWish && inp.moveZ > 0.30 &&
      sp < P.BOARD_PUSH_TOP && this.boardManual < 0.5 && !this.ollieCharging;
    if (pushing) {
      const before = this.boardPushT / P.BOARD_PUSH_CAD;
      this.boardPushT += dt;
      const after = this.boardPushT / P.BOARD_PUSH_CAD;
      if (before < 0.35 && after >= 0.35) this.boardKick();
      if (this.boardPushT >= P.BOARD_PUSH_CAD) this.boardPushT -= P.BOARD_PUSH_CAD;
    } else if (this.boardPushT > 0) {
      this.boardPushT += dt;
      if (this.boardPushT >= P.BOARD_PUSH_CAD) this.boardPushT = 0;
    }
    this.boardPushPh = (pushing || this.boardPushT > 0) ? this.boardPushT / P.BOARD_PUSH_CAD : -1;
    // ---- the deck's own pull, and the wheels ------------------------------------------------------
    // THE DECK DOES THE REST. The rolling drag is the only thing taking speed off on the flat, and it
    // is deliberately light at a crawl and heavy at speed (see the `BOARD_DRAG` block in `P`), so a
    // pushed board settles in the low teens and a flank can take it well past anything a run can do.
    // In the air there is no rolling at all, so a trick keeps everything it was thrown with.
    // THE SPEED TUCK. Past `BOARD_TUCK_LO` he folds down over the deck, fully down by
    // `BOARD_TUCK_HI` — the hips drop and the chest comes forward over the nose (see `poseRide`).
    // Off the deck or mid-trick it unwinds, so an ollie always leaves from the stance.
    const tuckWant = grounded && this.trickKind < 0
      ? Math.min(1, Math.max(0, (sp - P.BOARD_TUCK_LO) / (P.BOARD_TUCK_HI - P.BOARD_TUCK_LO))) : 0;
    this.boardTuck = approach(this.boardTuck, tuckWant, dt / 0.25);
    if (grounded && sp > 0.01) {
      bleedSpeed(this.vel, P.BOARD_DRAG + P.BOARD_DRAG_SPD * sp, dt);
    }
    this.slopePull(dt);
    this.slopeGate();
    this.vel.y -= P.GRAVITY * dt;
    // ---- the way out ------------------------------------------------------------------------------
    // SHIFT and F are the two mechanics that are NOT a ride, so they open by HELD key (a press is not
    // needed: there is nothing to buffer against, and a brake you have to press twice is not a brake)
    // — and only off a clean ride: a trick's own clock owns the body until it lands, and the deck is
    // under the wheels for the whole of either.
    if (this.trickKind < 0 && grounded) {
      // Touchdown with nothing live: the airtime's stack is spent (the landing above already paid
      // it out), so the next trick starts a new one.
      this.trickAirN = 0;
      if (inp.slideHeld && sp > P.BSLIDE_ENTER_V) this.startBSlide(sp);
      else if (inp.diveHeld && sp > P.BBOMB_ENTER_V && this.bbombCd <= 0) this.startBBomb();
    }
  },

  // ONE KICK. Along the deck's own line (the travel if he is barely moving — a kick from a standstill
  // is how a board is started at all), worth `BOARD_PUSH_V` up to the top of the push band.
  boardKick() {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const gain = Math.min(P.BOARD_PUSH_V, P.BOARD_PUSH_TOP - sp);
    if (gain <= 0.01) return;
    const dx = sp > 0.25 ? this.vel.x / sp : Math.sin(this.facing);
    const dz = sp > 0.25 ? this.vel.z / sp : Math.cos(this.facing);
    this.vel.x += dx * gain;
    this.vel.z += dz * gain;
    if (this.sfx && this.sfx.boardPush) this.sfx.boardPush();
    this.events.push("boardpush");
  },

  // ---- THE TRICK --------------------------------------------------------------------------------
  // One entry for the ollie and the five flips: `kind` indexes `BOARD_TRICKS` on the rig, and the
  // table's own `roll`/`yaw`/`bodyTurn`/`dur`/`pop` drive the deck's spin, the body's turn, the clock
  // the airtime is matched to and the pop the tail gives (see `solveRidePose` for where each is
  // spent). The POP is only spent off the deck — in the air the press is a flip and nothing else.
  startTrick(kind, grounded, hasWish, wx, wz, isAir) {
    const ud = this.charMesh && this.charMesh.userData;
    const tr = ud && (isAir
      ? (ud.boardAirTrick ? ud.boardAirTrick(kind) : null)
      : (ud.boardTrick ? ud.boardTrick(kind) : null));
    this.ollieCharging = false;
    if (!tr) return false;
    // Ground and air rows share the one live slot: air rows ride at `+100`, so the pose, the deck
    // spin and the HUD all read one number (see `boardRowAt` in streetwear.js).
    this.trickKind = isAir ? 100 + kind : kind;
    this.trickIsAir = !!isAir;
    this.trickAirIdx = kind;
    this.trickAirN = (this.trickAirN || 0) + 1;
    this.trickT = 0;
    this.trickDur = tr.dur;
    this.trickRoll = tr.roll;
    this.trickYaw = tr.yaw;
    this.trickBody = tr.bodyTurn;
    this.trickFlip = tr.flip || 0;
    this.trickPop = tr.pop || 0;
    this.trickTurns = tr.turns || 1;
    this.trickSpinDir = tr.spinDir || 1;
    this.spinLoops = 0;
    // WHAT THE TRICK IS, kept for the landing (`tickTrick`): whether there is a SPIN to mistime at
    // all, and the speed it was thrown at. Both exist so that the MISS below can be a question about
    // the DECK rather than about the number on the speedometer — see the note there.
    this.trickSpins = !!(tr.roll || tr.yaw || tr.bodyTurn || tr.flip);
    this.trickSpd0 = Math.hypot(this.vel.x, this.vel.z);
    this.trickCd = P.BOARD_TRICK_CD + tr.dur * 0.35;
    this.trickName = tr.name;
    if (grounded && tr.pop > 0) {
      // ...and THE DECK HE IS LEAVING IS A SLOPE (see "THE SLOPE" in jump.js): a body riding up a
      // flank is carried up it by the deck, so the ollie is measured FROM the deck's own rise —
      // the vertical speed the ground is already giving him — or every pop uphill is swallowed.
      // Downhill `rise` is negative and is not added.
      const rise = this.onSlope ? this.vel.x * this.slopeGx + this.vel.z * this.slopeGz : 0;
      this.vel.y = Math.max(this.vel.y, P.BOARD_POP * tr.pop * (this.olliePopK || 1) + Math.max(0, rise));
      this.grounded = false;
      this.jumpsLeft = 0;
      this.airFromJump = true;
    }
    if (this.sfx && this.sfx.boardPop) this.sfx.boardPop();
    this.events.push("trick");
  },

  // The trick's own clock, ticked ONCE a frame from the ride (see `tickRideState`) so the shape, the
  // spin and the landing are one read of one number. A trick holds its last frame in the air if the
  // clock runs out first — the deck is still under the feet and still mid-spin, and it is the GROUND
  // that decides when it is over, not the clock.
  tickTrick(dt, grounded, m1Held) {
    if (this.trickKind < 0) return;
    this.trickT += dt;
    const dur = Math.max(0.12, this.trickDur);
    if (this.trickT < dur) return;
    if (!grounded && m1Held && this.trickIsAir) {
      const ud = this.charMesh && this.charMesh.userData;
      const n = (ud && ud.boardAirCount) || 5;
      const prev = this.airCycle;
      let idx = 0;
      if (n <= 1) {
        idx = 0;
      } else {
        do {
          idx = (Math.random() * n) | 0;
        } while (idx === prev);
      }
      const tr = ud && ud.boardAirTrick ? ud.boardAirTrick(idx) : null;
      this.trickAirN = (this.trickAirN || 0) + 1;
      this.spinLoops = (this.spinLoops || 0) + 1;
      if (tr) {
        this.airCycle = idx;
        this.trickKind = 100 + idx;
        this.trickIsAir = true;
        this.trickAirIdx = idx;
        this.trickT = 0;
        this.trickDur = tr.dur;
        this.trickRoll = tr.roll;
        this.trickYaw = tr.yaw;
        this.trickBody = tr.bodyTurn;
        this.trickFlip = tr.flip || 0;
        this.trickPop = tr.pop || 0;
        this.trickTurns = tr.turns || 1;
        this.trickSpinDir = tr.spinDir || 1;
        this.trickSpins = !!(tr.roll || tr.yaw || tr.bodyTurn || tr.flip);
        this.trickSpd0 = Math.hypot(this.vel.x, this.vel.z);
        this.trickName = tr.name;
      } else {
        this.trickT = 0;
      }
      this.events.push("spinloop");
      return;
    }
    this.trickT = dur;
    if (!grounded) return;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.trickKind = -1;
    this.trickT = 0;
    this.spinLoops = 0;
    // THE MISS, and it is a question about the DECK rather than about the speedometer. `sp` alone
    // cannot be the test, because the obvious thing to do on a board is to ollie from a STANDSTILL
    // and a standstill is `sp` 0 — the first version bailed every trick thrown under
    // `BOARD_MISS_SPEED`, which (measured) shot the board out from under a rider who pressed SPACE
    // standing still on flat ground. Two things make it the deck's own question instead: an OLLIE
    // cannot miss (there is no spin to mistime — `trickSpins`), and a trick thrown from near a
    // standstill cannot either (the deck has no speed to leave with — `trickSpd0`). What is left is
    // the one that should: a SPIN thrown at real speed that arrives almost stopped.
    const thrown = this.trickSpd0 > P.BOARD_MISS_SPEED * 0.6;
    const arrived = sp < Math.min(P.BOARD_MISS_SPEED, this.trickSpd0 * 0.4);
    if (this.trickSpins && thrown && arrived) {
      this.bailBoard();
    } else {
      // THE CATCH. A deck that came round under the feet is a landing like any other — a thud, a
      // little absorb, and the ride carries on with the speed it had.
      this.squash = 0.20;
      if (this.sfx && this.sfx.boardLand) this.sfx.boardLand(0.4);
      // ...AND THE LANDING PAYS. Every trick down since touchdown stacks +0.25 u/s along the
      // travel — one move is a push, a whole airtime is a launch — and scores its row's points
      // times its place in the stack. The ride's own ceiling still caps it all.
      const stack = Math.max(1, this.trickAirN || 0);
      const kick = P.TRICK_BOOST * stack;
      const chSp = Math.hypot(this.vel.x, this.vel.z);
      if (kick > 0 && chSp > 0.01) {
        const want = Math.min(P.BOARD_TOP_SPEED, chSp + kick) / chSp;
        this.vel.x *= want;
        this.vel.z *= want;
      }
      this.events.push("trickland");
    }
  },

  // THE BAIL: the deck shoots out from under him. The rider's own rule for it is the speed he arrived
  // at (`BOARD_MISS_SPEED` — landing a trick slow and the board keeps going without you), the deck
  // leaves with the speed it was carrying, the body keeps a quarter of it, and the board refuses to
  // be re-mounted for `BOARD_MISS_LOCK` (so a mash on E cannot pick the moment back up).
  bailBoard() {
    this.boardMissT = P.BOARD_MISS_LOCK;
    this.squash = 0.55;
    this.trickAirN = 0;
    this.events.push("boardbail");
    if (this.sfx && this.sfx.boardBail) this.sfx.boardBail();
    const gear = this.gear;
    if (gear && gear.ride && gear.dismountBoard) {
      gear.dismountBoard(0.25);
      this.vel.x *= 0.25;
      this.vel.z *= 0.25;
    }
  },

  // ---- THE POWERSLIDE (SHIFT) -------------------------------------------------------------------
  // `startBSlide` opens it and `tickBSlideState` is its own case of the state machine. THE SHAPE is
  // the deck put SIDEWAYS, and the side it is put to is the side the wish is already pushing — a
  // powerslide is thrown into the corner it is braking for. The BODY turns with the deck (it is
  // standing on it), which is why the deck's own angle is handed to the pose: the pelvis keeps its
  // stance RELATIVE to the deck and the deck is off the line.
  startBSlide(sp) {
    this.setState("bslide");
    this.ollieCharging = false;
    this.bslideT = 0;
    this.bslideSide = this.bslideSide || 1;
    // The angle comes on at its own size for this speed rather than easing up from nothing: the deck
    // is already sideways on the frame the wheels break loose (a slide that span up over 0.12 s would
    // read as a wobble).
    this.bslideAngle = (P.BSLIDE_ANG_MIN + (P.BSLIDE_ANG - P.BSLIDE_ANG_MIN) *
      Math.min(1, sp / P.BSLIDE_FULL)) * this.bslideSide;
    if (this.sfx && this.sfx.boardSlide) this.sfx.boardSlide();
    this.events.push("bslide");
  },

  tickBSlideState(dt, inp, hasWish, wx, wz, grounded) {
    this.bslideT += dt;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    // THE ANGLE. It grows with the speed (a slow powerslide is barely off its line, a fast one is
    // almost a hockey stop) and the WISH points it while it runs — the steering the mechanic has,
    // which is what makes it a carve as well as a brake.
    const full = P.BSLIDE_ANG_MIN + (P.BSLIDE_ANG - P.BSLIDE_ANG_MIN) *
      Math.min(1, sp / P.BSLIDE_FULL);
    let want = full * this.bslideSide;
    if (hasWish && sp > 0.5) {
      // the wish's own side, in the body's frame: the deck is thrown to the side the stick is on
      const fx = Math.sin(this.facing);
      const fz = Math.cos(this.facing);
      const cross = fx * wz - fz * wx;
      this.bslideSide = cross >= 0 ? 1 : -1;
      want = full * this.bslideSide;
    }
    this.bslideAngle = approach(this.bslideAngle, want, dt / 0.12);
    // ...AND THE BRAKE. A constant deceleration off the speed (see `bleedSpeed` and the `BSLIDE_*`
    // block in `P`), ramped up with how fast the slide is going, so a fast one is a hard one and a
    // slow one lets him keep rolling — and it is spent ALONG the velocity, so the slide cannot bend
    // the line it is scrubbing (the wish above does that, at its own rate).
    const decel = P.BSLIDE_DECEL + (P.BSLIDE_DECEL_HI - P.BSLIDE_DECEL) *
      Math.min(1, sp / P.BSLIDE_FULL);
    bleedSpeed(this.vel, decel, dt);
    // ...and the body still CARVES while it brakes: the wish bends the line at a low rate, which is
    // the whole of how a powerslide is aimed.
    if (hasWish && sp > 0.3) {
      const diff = wrapPi(Math.atan2(wx, wz) - Math.atan2(this.vel.x, this.vel.z));
      const turn = Math.max(-P.BSLIDE_TURN * dt, Math.min(P.BSLIDE_TURN * dt, diff));
      if (turn !== 0) {
        const yaw = Math.atan2(this.vel.x, this.vel.z) + turn;
        this.vel.x = Math.sin(yaw) * sp;
        this.vel.z = Math.cos(yaw) * sp;
      }
    }
    this.slopePull(dt);
    this.vel.y -= P.GRAVITY * dt;
    // OUT: the key, the ground, or the speed. Letting go of SHIFT ends it wherever it is (it is a
    // HOLD, like the guard), losing the wheels ends it, and `BSLIDE_MIN_SPEED` is the speed at which
    // there is no longer anything to scrub — which is also what stops a powerslide from being a way
    // to stand still on a board forever.
    const now = Math.hypot(this.vel.x, this.vel.z);
    if (!grounded || !inp.slideHeld || now < P.BSLIDE_MIN_SPEED) this.setState("ride");
  },

  // ---- THE BOMB (F) -----------------------------------------------------------------------------
  // It opens on a small leap (a dive has to have somewhere to dive FROM), and from there the deck
  // rides a body thrown flat at the road: `BBOMB_GRAV` times gravity — the steepest fall in the game
  // — with the travel GROWN by `BBOMB_DRIVE` rather than spent, and a terminal of `BBOMB_V`. The
  // shape is `poseBBomb`'s: prone over the deck with the knees under the chest and the arms swept
  // back, which is nothing like `poseDive`'s head-first glide.
  startBBomb(fromAir) {
    if (this.bbombCd > 0) return false;
    this.setState("bbomb");
    this.ollieCharging = false;
    this.bbombT = 0;
    this.bbombCd = P.BBOMB_CD;
    if (fromAir) {
      if (this.trickKind >= 0) {
        const dur = Math.max(0.12, this.trickDur);
        this.trickUnwind = flipCurve(Math.min(1, this.trickT / dur));
        this.flipUnwind = this.trickFlip || 0;
        this.trickKind = -1;
        this.trickT = 0;
        this.trickName = "";
        this.trickAirN = Math.max(0, (this.trickAirN || 0) - 1);
      }
      this.vel.y = Math.min(this.vel.y, -P.BBOMB_AIR_DROP);
      this.events.push("bombair");
    } else {
      this.vel.y = Math.max(this.vel.y, P.BBOMB_LAUNCH);
      this.grounded = false;
      this.jumpsLeft = 0;
      this.events.push("bomb");
    }
    if (this.sfx && this.sfx.bomb) this.sfx.bomb();
  },

  tickBBombState(dt, grounded) {
    this.bbombT += dt;
    // The drive: a bomb is thrown FORWARD, so the line it was travelling is kept and grown.
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.4 && sp < P.BBOMB_V) {
      const k = Math.min(P.BBOMB_V, sp + P.BBOMB_DRIVE * dt) / sp;
      this.vel.x *= k;
      this.vel.z *= k;
    }
    this.vel.y -= P.GRAVITY * P.BBOMB_GRAV * dt;
    if (this.vel.y < -P.BBOMB_V) this.vel.y = -P.BBOMB_V;
    this.slopePull(dt);
    if (grounded) {
      // THE ARRIVAL. The deck finds the road and the ride carries on — with almost all of the speed
      // it arrived with (`BBOMB_LAND_KEEP`), which is what makes the move worth the commitment.
      const k = P.BBOMB_LAND_KEEP;
      this.vel.x *= k;
      this.vel.z *= k;
      this.squash = 0.35;
      if (this.sfx && this.sfx.boardLand) this.sfx.boardLand(0.9);
      this.events.push("boardland");
      this.setState("ride");
    }
  },

  // ---- THE PRESS THAT M1 BELONGS TO ------------------------------------------------------------
  // M1 while riding is the TRICK and not one press of the melee chain, and this is the one place the
  // ride claims it. Called from `tickChainPress` (combat.js) IN PLACE of everything below it — the
  // chain, the uppercut, the wall chain and the dive/slam/slide/dash fallbacks are all one button
  // family and none of them exists on a deck — so the body's own ride tick has already read the
  // press by the time this is reached... which means this exists only to make the claim explicit and
  // to stop the press falling through to the chain on any path that reaches here first. (The read
  // itself is in `tickRideState`, where the state machine's own clock is.)
  tickBoardPress() {
    return false;
  },

  // ---- THE BOARD'S OWN TRANSFORM -----------------------------------------------------------------
  // The one thing the ride writes on the DECK: its spin. The base transform costs nothing and is
  // never touched (the mesh is a child of `tiltG` at `-HY`, so the facing, the ground's lean and the
  // body's height all move it for free) — what is left is the deck's OWN motion, and there are three
  // of them: WHAT THE RIDER IS DOING WITH IT.
  //
  //   * THE CARVE: the deck lays over onto the edge it is turning into (`P.BOARD_LEAN`). Decorative
  //     (the steering is the heading's), and deliberately small — the feet do not roll with it, so a
  //     big lean would stand the shoes off a 0.26-wide deck.
  //   * THE MANUAL: the nose held up, PITCHED ABOUT THE BACK AXLE rather than about the deck's
  //     middle (`pz` below) — a pitch about the middle would drive the tail through the road, which
  //     is exactly what a manual does not do.
  //   * THE TRICK: the whole spin, as an absolute function of the phase (see `flipCurve`), so it
  //     lands square by construction. The BODY VARIAL is the same number on the RIG's own yaw
  //     (`boardSpinY`, read by rig.js) because the board cannot turn the rider by itself.
  //
  // Written here rather than in the tick because it is a POSE (it has to keep running for the fade
  // after the ride ends, and it reads the trick's clock), and this is the ride's pose layer.
  solveRidePose(dt, ud) {
    const want = this.board ? 1 : 0;
    this.ridePose = approach(this.ridePose, want, dt / BOARD_POSE_FADE);
    this.boardLift = approach(this.boardLift, want, dt / BOARD_POSE_FADE);
    const bslide = this.state === "bslide";
    const bbomb = this.state === "bbomb";
    this.bslidePose = approach(this.bslidePose, bslide ? 1 : 0, dt / BSLIDE_POSE_FADE);
    this.bbombPose = approach(this.bbombPose, bbomb ? 1 : 0, dt / BBOMB_POSE_FADE);
    // The trick's own phase, held at its end while the deck is still under a body that is still in
    // the air (see `tickTrick`), and folded to zero the moment it is over — the spin is a whole
    // number of turns, so a completed one unwinds onto the IDENTITY and cannot be seen going home.
    const dur = Math.max(0.12, this.trickDur);
    const live = this.trickKind >= 0;
    const ph = live ? Math.min(1, this.trickT / dur) : 0;
    if (!live && this.trickUnwind > 0) this.trickUnwind = approach(this.trickUnwind, 0, dt / 0.22);
    if (!live && (this.trickUnwind || 0) <= 0) { this.flipUnwind = 0; this.spinLoops = 0; }
    const spin = live ? flipCurve(ph) : (this.trickUnwind || 0);
    const flipTurns = live ? (this.trickFlip || 0) : (this.flipUnwind || 0);
    const flipA = -flipTurns * spin * Math.PI * 2;
    if (this.ridePose > 0.002) this.spinX = flipA;
    const loopTurns = ((live || (this.trickUnwind || 0) > 0) && this.trickIsAir) ? (this.spinLoops || 0) + (this.trickTurns || 1) * spin * (this.trickSpinDir || 1) : 0;
    const loopAng = loopTurns * Math.PI * 2;
    const mesh = this.boardRig;
    if (mesh) {
      // ---- the deck's own angles ----------------------------------------------------------------
      const carveLean = this.boardCarve * P.BOARD_LEAN;
      const manualAng = this.boardManual * 0.42;
      // The OLLIE's nose-lift: the deck's nose comes up off the tail through the pop and levels as
      // the airtime runs out (nothing to do with the MANUAL, which is the same pitch held by hand).
      const popLift = live && this.trickPop ? (this.trickRoll ? 0.10 : 0.42) * Math.sin(Math.PI * Math.min(1, ph / 0.6)) : 0;
      const bombPitch = this.bbombPose * (0.30 + 0.22 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / P.BBOMB_V));
      const bx = -manualAng - popLift + bombPitch;
      // ...pitched about the axle at the end of the deck the pitch is standing on
      const pz = bx >= 0 ? 0.30 : -0.30;
      mesh.position.set(0, -P.HY + pz * Math.sin(bx), pz * (1 - Math.cos(bx)));
      // The deck's own yaw: the POWERSLIDE's angle (a whole `2π` of it is a full turn of the deck
      // relative to the line the body is still travelling on) plus the trick's spins.
      mesh.rotation.set(bx, this.bslideAngle * this.bslidePose + this.trickYaw * spin * Math.PI * 2 + loopAng,
        carveLean + this.trickRoll * spin * Math.PI * 2);
      if (flipA !== 0) {
        const c = Math.cos(flipA);
        const s = Math.sin(flipA);
        const ip = this.inner ? this.inner.position : null;
        const iy = ip ? ip.y : 0;
        const iz = ip ? ip.z : 0;
        const oy = -P.HY - iy;
        const oz = -iz;
        mesh.position.set(0, iy + (oy * c - oz * s), iz + (oy * s + oz * c));
        mesh.rotation.x = flipA;
      }
      // ---- and the body's own turn: the BODY VARIAL ------------------------------------------
      this.boardSpinY = this.trickBody * spin * Math.PI * 2 + loopAng;
    } else {
      this.boardSpinY = 0;
    }
    if (!ud || !ud.poseRide || this.ridePose <= 0.002) return;
    // ---- THE SHAPE -----------------------------------------------------------------------------
    // Three shapes on the same fade: the ride (the stance plus everything a ride can be wearing),
    // the powerslide, and the bomb. They are mutually exclusive states, so only one is ever at full
    // weight — the fades are what cross them.
    const miss = this.boardMissT > 0 ? Math.min(1, this.boardMissT / (P.BOARD_MISS_LOCK * 0.6)) : 0;
    const air = this.grounded ? 0 : 1;
    if (this.bslidePose > 0.002) {
      ud.poseBSlide(this.bslidePose, this.rideT, this.bslideAngle < 0 ? -this.bslideAngle : this.bslideAngle,
        Math.min(1, Math.hypot(this.vel.x, this.vel.z) / P.BSLIDE_FULL), this.boardCarve);
      return;
    }
    if (this.bbombPose > 0.002) {
      ud.poseBBomb(this.bbombPose, this.rideT, Math.min(1, -this.vel.y / P.BBOMB_V));
      return;
    }
    ud.poseRide(this.ridePose, this.rideT, this.boardCarve, this.boardManual, this.boardPushPh,
      this.trickKind, ph, miss, air, this.boardTuck || 0,
      this.ollieCharging ? Math.min(1, this.ollieCharge / P.OLLIE_CHARGE_MAX) : 0);
  },
};

export function installBoard(Player) {
  Object.assign(Player.prototype, boardMethods);
}
