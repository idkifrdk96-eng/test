// ---------------------------------------------------------------------------
// THE GEAR POSE LAYERS (part 69 of the player.js split).
//
// The three poses the body wears for the thing it is holding: the CARRY (one
// arm busy, riding the run's stride), the BALL ACTIONS (the shoot and the
// throw, one shape over whatever the body is already doing) and the TOTE (a
// duffel in both hands, the arms belonging to it until it leaves them).
//
// These are LAYERS, not states: the legs keep solving whatever the state is
// doing, which is what lets a man carry a bag at a run, off a ledge or through
// a slide without a second locomotion system. They are written together, in
// order, and only here — so they can all live in one module.
//
// A LEAF with respect to player.js: it imports `approach` (player/math.js) and
// the two fades (player/pose.js). `installItems(Player)` copies the method onto
// `Player.prototype`.
// ---------------------------------------------------------------------------
import { approach } from "./math.js";
import { TOTE_POSE_FADE, BALL_POSE_FADE } from "./pose.js";

const itemMethods = {

  // All three gear layers, written in the order they must be applied: the carry (one arm), then the
  // ball action (one shape over everything), then the tote (both arms, last so nothing below can put
  // an arm back).
  solveItemPoses(dt, ud) {
    // THE HANDS (see `poseCarry` in streetwear.js): the same bargain as the tote block just below —
    // a LAYER over whatever state the body is in, not a state of its own. One arm belongs to the
    // carried thing and the legs keep solving the deck; written just before the tote so that a
    // duffel in both arms (which cannot coexist with a full hand — see `canTote`) would still win.
    this.carryPose = approach(this.carryPose, this.carrying ? 1 : 0, dt / TOTE_POSE_FADE);
    if (ud && ud.poseCarry && this.carryPose > 0.002) {
      // ...and the run's own phase is handed in with it (session 180): the carrying arm rides the
      // stride instead of being parked on a moving body — see the note on `CARRY` in streetwear.js.
      ud.poseCarry(this.carryPose, this.carryT || 0, this.runPhase, this.runBlend);
    }

    // THE BALL ACTIONS (see `poseBallAction` in streetwear.js, and "THE BALL ACTIONS" in
    // inventory.js): the shoot and the throw, written LAST of every pose layer — one shape over
    // whatever the body is already doing, so at full weight the body IS the clip. It is here, after
    // the tote, because it is the only layer that can legitimately be asked for while a duffel is in
    // both arms and neither can happen in practice (the throw needs a free hand, the shoot needs one
    // empty) — so the order is a deliberate belt-and-braces rather than a live case.
    //
    // The weight's own fade is quick (0.08 s): a strike has to be ON the man on the frame he presses
    // it, and the shapes' own first keys are close enough to the body under them that a fast fade
    // reads as a step into the move rather than a cut. The fade-OUT rides `ballLast` at the phase the
    // shape ACTUALLY ENDED ON — 1 for a shape that played out (so it is left in its follow-through
    // while it dissolves rather than snapping back to its wind-up) and 0 for a wind-up that was
    // CANCELLED (the shoot's, session 198 — see `tickShoot`; the table's first row is the rest pose,
    // so there is nothing to cover). It used to be hardcoded at 1, which is the same thing for every
    // shape that had no other way to end.
    if (this.ballKind) this.ballLast = this.ballKind;
    this.ballPose = approach(this.ballPose, this.ballKind ? 1 : 0, dt / BALL_POSE_FADE);
    if (ud && ud.poseBall && this.ballPose > 0.002) {
      // The sixth argument is the SHOOT's own lower-body weight (`ballLower`, session 198): a charge
      // taken at a run cannot wear a planted coil, so while the wind-up is live at speed the hips and
      // both legs are left to the run and the shape keeps the trunk, the head and the arms — see
      // `poseShoot`. The throw and the slam write no leg and ignore it.
      ud.poseBall(this.ballPose, this.ballKind || this.ballLast, this.ballPhase || 0,
        this.ballCharge || 0, this.ballT || 0, this.ballLower);
    }

    // THE TOTE, written last of the pose layers (see `poseTote` in streetwear.js). It is the one
    // layer that is not a state: the gear takes the duffel in both hands and, from then until it
    // leaves them, the ARMS belong to it — the legs keep solving whatever the state is doing, which
    // is what lets a man carry a bag at a run, off a ledge or through a slide without a second
    // locomotion system. It sits here, at the end, so nothing below it can put an arm back.
    this.totePose = approach(this.totePose, this.toting ? 1 : 0, dt / TOTE_POSE_FADE);
    if (ud && ud.poseTote && this.totePose > 0.002) {
      ud.poseTote(this.totePose, this.toteKind || "hold", this.toteT || 0);
    }
  },
};

export function installItems(Player) {
  Object.assign(Player.prototype, itemMethods);
}
