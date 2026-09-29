// ---------------------------------------------------------------------------
// Part 21 of the `player.js` split: THE PER-FRAME TRANSIENT RESET.
//
// Lifted out of the top of `Player.update` — the block that clears last frame's climb and
// wall-run flags before the wish is read and the state machine runs: `climbing`,
// `wallSliding`, the climb's two speeds and the pull's own held state, then the wall-run
// latch. Called back in the same position:
//
//   this.resetTransients(dt);
//
// It reads nothing but `dt` and writes only the body's own fields, so nothing had to be
// handed in. The comments moved with their code (they explain why each flag is cleared).
//
// Deps: `P` from ./config.js and `approach` from ./math.js.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { approach } from "./math.js";

const transientsMethods = {
  resetTransients(dt) {
    this.climbing = false;
    this.wallSliding = false;
    // ...and THE CLIMB'S TWO SPEEDS (see the `CLIMB_PULL_DEPTH` block in `P`): zeroed here, every frame,
    // and written again by the climb's own branch below if he is on a face. `climbUp` / `climbSide`
    // are what the push is pulling FOR (the phase clock's input), `climbPull` is the stroke the body
    // is actually wearing; a frame that is not a climb must leave all three neutral, because the
    // phase block in `updateVisual` reads them whenever `climbing` is set.
    this.climbUp = 0;
    this.climbSide = 0;
    this.climbPull = 1;
    // ...AND THE PULL'S OWN STATE (see the `CLIMB_LOAD_` / `CLIMB_SKIP_` blocks in `P`), for the same
    // reason and with the same reading: `onClimbFace` is LAST frame's attachment, so on the frame the
    // climb starts this clears nothing that matters and on the frame it ends (a wall jump off the
    // face, a slip, letting go) the coil is spent there and then instead of freezing on the rig — the
    // pose layer would otherwise wear a load that no longer exists. The two WEIGHTS are eased rather
    // than zeroed, so the stance sinks back out of the body over `CLIMB_FIRE_OUT` as the wall pose
    // itself is fading. The rest stance's idle clock is deliberately left alone: it is a clock, not a
    // weight, and a body that re-takes the stone should breathe on the beat it left.
    const onClimbFace = this.attached && this.attachMode === "climb";
    if (!onClimbFace) {
      this.climbLoadT = 0;
      this.climbCharge = 0;
      this.climbFireT = 0;
      this.climbBurst = 0;
      this.climbRiseU = 0;
      // ...and the holds are back ON: a body that has left the face (a slip, a wall jump, the wall
      // running out) wears no flight at all, and the overlay is not posed while it is off the face in
      // any case (`pullInfo` needs an attached climb), so this only matters on a re-grab — where a
      // leftover `rel` would put the hands back on the stone already reaching.
      this.climbRel = 0;
      // ...and the leap's own shape with it (session 177): a body that has left the face wears no
      // launch overlay either, and a leftover weight would snap one on the next skip's first frame.
      this.climbFly = 0;
      this.climbSink = approach(this.climbSink, 0, dt / P.CLIMB_LOAD_SINK_T);
      this.climbLoad = approach(this.climbLoad, 0, dt / P.CLIMB_FIRE_OUT);
    }
    this.prevWallRun = this.wallRunning;
    this.wallRunning = false;
  },
};

export function installTransients(Player) {
  Object.assign(Player.prototype, transientsMethods);
}
