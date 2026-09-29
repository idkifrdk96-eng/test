// ---------------------------------------------------------------------------
// THE LOCOMOTION BASE (part 79 of the player.js split).
//
// The run cycle and the IDLE it fades into — the layer every other pose is worn
// over, and the reason the legs never skate:
//
//   * `wantRun` fades the run in on a timer as speed builds and out as it drops,
//     and the phase advances off the speed actually carried; a locked BACKPEDAL
//     runs the cycle the other way. The BLOCK and the staff's two ground moves
//     (the strike and the throw) are in the list too, so the guard and a carried
//     staff keep a live stride underneath them rather than falling back to REST.
//   * `wantIdle` cross-fades the resting stand in over whatever the run left.
//   * the idle's FEET are sampled against the deck per boot (only while the idle
//     is actually on the rig), so the stand sits on the ground it is standing on.
//
// Reads the frame's travel split (`runFwd`/`runLat`, in the body's own frame)
// and the lock's own trunk roll, all solved just above in `updateVisual`. It
// RETURNS the `userData` handle, because the pose layers that follow all take it.
//
// A LEAF with respect to player.js: `P` + `RUN_STRIDE` (player/config.js),
// `approach` (player/math.js) and the run/idle constants (player/pose.js).
// `installBase(Player)` copies the method onto `Player.prototype`.
// ---------------------------------------------------------------------------
import { P, RUN_STRIDE } from "./config.js";
import { approach } from "./math.js";
import { RUN_PERIOD_MIN, RUN_FADE_IN, RUN_FADE_OUT, IDLE_POSE_FADE, IDLE_FOOT_UP, IDLE_FOOT_DOWN, IDLE_FOOT_HI, IDLE_FOOT_LO, IDLE_FOOT_FADE, IDLE_FOOT_TMP } from "./pose.js";

const baseMethods = {

  // Fade the run in/out off the speed carried, advance its phase, and cross-fade the idle over it.
  solveLocomotionBase(dt, speed, runFwd, runLat, trunkRoll) {
    // Run cycle. Faded in on a timer when you break into a run and out again when
    // you slow to a stop, driven by the speed you are actually carrying so the
    // legs do not skate, and frozen at the phase it reached when you stop.
    //
    // THE BLOCK IS IN HERE TOO (`state === "block"`): the guard no longer poses the body at all
    // (see "THE BLOCK" in streetwear.js — the brief's *"dont touch the rest of the body"*), so the
    // base layer has to keep running underneath it or the body would fall back to the REST pose the
    // moment the chord goes down. Standing still under the guard this is the IDLE (the same test
    // below), and walking under it is the run cycle at the speed the guard is actually making —
    // which is also the only thing that can keep the legs from skating at `BLOCK_WALK`'s 3.2.
    // ...AND THE STAFF'S TWO GROUND MOVES ARE IN HERE TOO (session 150). A carried staff rides the
    // rig, and the two moves that carry the body along the deck — the STRIKE (M1, `POLE_ATK_V` 17 u/s
    // of forward floor) and the THROW (M2, a stand-and-deliver off whatever he was already carrying)
    // — author the trunk, the arms and the shaft and leave the LEGS to this layer, exactly as the
    // carry does. They used to be left out of the list, and the cost was not a missing animation but
    // a FROZEN one: with `wantRun` and `wantIdle` both 0 for the whole move, NO pose wrote the legs,
    // so they kept whatever the last frame of the idle had left on them and the body skated its own
    // carry. Measured on the rig, a strike held in place: the thigh sat at **−0.56 / −0.29** and the
    // knee at **1.32** rad from t 0.15 through the end of the clock — 0.65 s of one deep crouch
    // stance, sliding **11.6 u** forward at 17 u/s. With them in the list the strike spends its
    // forward floor on a real stride (the leg angles sweep the run's own range) and the throw stands
    // on the idle when it is thrown from a standstill and runs when it is thrown at speed, which is
    // what each of the two moves is.
    //
    // `poleFlow` stands in for `grounded` for exactly these two, and it has to: at `POLE_ATK_V` the
    // body skips its own ground follow — measured, `grounded` (and `prevGrounded`) flip 0/1 on ALTERNATE
    // FRAMES all the way through a strike as the 0.28 u/frame of travel outruns the floor test — so a
    // gate on the flag alone lets the legs run for one frame in two and the blend never climbs (it
    // reached **0.27** over a whole 0.8 s strike, against **1.00** in 0.30 s for the same body at the
    // same speed on the ground). Both moves are fired from a foot on the deck by construction
    // (`poleStrike`'s own gate), so treating them as decked is what they are; the two air windows that
    // stand that gate down are excluded, because a flurry thrown off a ledge is not a body running.
    const poleFlow = (this.state === "poleatk" || this.state === "polethr") &&
      this.airComboT <= 0 && this.airFinisherT <= 0;
    const legDeck = this.grounded || poleFlow;
    const wantRun =
      this.wallRunning || (legDeck && (this.state === "ground" || this.state === "block" || poleFlow) && !this.crouching)
        ? Math.min(1, Math.max(0, (speed - 0.4) / 1.2))
        : 0;
    this.runBlend = approach(
      this.runBlend,
      wantRun,
      dt / (wantRun > this.runBlend ? RUN_FADE_IN : RUN_FADE_OUT)
    );
    if (this.runBlend > 0.002) {
      // A BACKPEDAL — the lock's own S (see `P.LOCK_*`) — runs the cycle the OTHER WAY: the legs
      // step backwards rather than the whole body moonwalking. The switch is on the sign of the
      // travel, so it is continuous in the phase — the pose at a given phase is the same whichever
      // way the clock is going, which is why a reversal cannot pop. It is the LOCK's, not the
      // velocity's: unlocked, a body is free to turn, so the brief moment of backwards travel while
      // it spins on the spot would otherwise flip the legs of an ordinary turn.
      const backing = this.shiftLock && runFwd < -0.25;
      const rate = Math.min(1 / RUN_PERIOD_MIN, speed / RUN_STRIDE) * (backing ? -1 : 1);
      this.runPhase = (this.runPhase + rate * dt) % 1;
    }
    const poseRun = this.charMesh && this.charMesh.userData.poseRun;
    // ...and the last argument is THE CHARGE'S RIGHT ARM, which the run does NOT wear: the block's
    // own arm is written by `poseBlock` (see the arms note there and the brief quoted in it), and
    // the run is then left with both arms pumping — the brief's *"if else make the player arm
    // normal next to him like the normal running animtion"*. It is passed explicitly (rather than
    // left off) because this is the one call site that used to ask for it, and the wall run is the
    // place a hand is solved onto a face instead (see `poseWall`).
    if (poseRun) poseRun(this.runPhase, this.runBlend, Math.min(1, speed / P.SPRINT), runFwd, runLat * this.lockBlend, trunkRoll, 0);
    // The idle cross-fades in over whatever the run blend left as you come to a stop: a
    // resting stand is its own pose (hands in the front pockets), and the run blend is
    // already out by the time it matters, so its own timer keeps a stop from snapping.
    // It rides the same speed curve as the run, so the two can never fight at a walk. Like the run
    // above, it stays live through the block, so a body standing under the guard is still standing.
    const wantIdle =
      legDeck && (this.state === "ground" || this.state === "block" || poleFlow) && !this.crouching
        ? Math.min(1, Math.max(0, (0.55 - speed) / 0.45)) * (1 - this.runBlend)
        : 0;
    this.idlePose = approach(this.idlePose, wantIdle, dt / IDLE_POSE_FADE);
    this.idleTime += dt;
    const ud = this.charMesh && this.charMesh.userData;
    // THE DASH'S LEG ORDER, put back every frame. A hip's abduction belongs OUTSIDE the leg's own
    // swing — the leg goes out to the side of the BODY, not of the thigh — and that is exactly what
    // the `ZYX` order on the thigh bones means: the z is applied last, in the hips' frame. On the
    // rig's usual `XYZ` the z goes on first, in the bone's own frame, and it swings the solved ankle
    // off the deck (measured: 3.7 cm low on the dash's bent, abducted lead leg — see `poseDash`).
    // Only the dash abducts hard enough to care, so they are reset here and `poseDash` raises them
    // again while it is on the rig.
    const legBones = this.charMesh && this.charMesh.userData.bones;
    if (legBones) {
      if (legBones.legUpperL.rotation.order !== "XYZ") legBones.legUpperL.rotation.order = "XYZ";
      if (legBones.legUpperR.rotation.order !== "XYZ") legBones.legUpperR.rotation.order = "XYZ";
    }
    // THE IDLE'S FEET (see the `IDLE_FOOT_*` constants). Only worth doing while the idle is actually
    // on the rig — anywhere else the offsets would be stale and the two world queries a frame would
    // buy nothing — and the boot's own world position is what is sampled, so the query lands under the
    // boot wherever the pose has put it rather than at a point derived from the body's centre. Reading
    // it needs current matrices, which is what the update is for: this runs before the frame's render,
    // so without it the sample would be taken under last frame's foot.
    if (this.idlePose > 0.002 && this.world && legBones && legBones.footL && legBones.footR) {
      this.charMesh.updateWorldMatrix(true, true);
      const deck = this.pos.y - P.HY;
      const rigScale = this.charMesh.scale.x || 1;
      const rate = Math.min(1, dt / IDLE_FOOT_FADE);
      for (let i = 0; i < 2; i++) {
        (i ? legBones.footR : legBones.footL).getWorldPosition(IDLE_FOOT_TMP);
        const g = this.world.topBelow(
          IDLE_FOOT_TMP.x, IDLE_FOOT_TMP.z,
          IDLE_FOOT_TMP.y + IDLE_FOOT_UP, IDLE_FOOT_UP + IDLE_FOOT_DOWN
        );
        const want = Math.max(IDLE_FOOT_LO, Math.min(IDLE_FOOT_HI, (g - deck) / rigScale));
        this.footGround[i] += (want - this.footGround[i]) * rate;
      }
    }
    if (ud && ud.poseIdle && this.idlePose > 0.002) ud.poseIdle(this.idlePose, this.idleTime, this.footGround);
    return ud;
  },
};

export function installBase(Player) {
  Object.assign(Player.prototype, baseMethods);
}
