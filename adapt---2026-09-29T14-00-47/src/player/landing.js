// ---------------------------------------------------------------------------
// THE LANDING (part 43 of the player.js split).
//
// The whole of `update`'s `// ---- landing ----` block: what happens on the frame the
// feet find the deck again — the impact read off the fall's own peak (`fallPeakY` ->
// `velYBefore`), the kind of landing (`impactFromDrop`), the brace and the pose's clock
// (`LAND_POSE_TIME`), the stanima/landing-beat jolt, and the GROUND SLAM's own shockwave
// (`dropBlast`) when the landing came out of a slam.
//
// It reads the frame's `dt`, `inp`, the pre-frame vertical speed (`velYBefore`) and the
// wish (`wx`/`wz` + `hasWish`), so those are its arguments. Deps: `P` (./config.js),
// `impactFromDrop` (./fall.js) and `LAND_POSE_TIME` (./pose.js).
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { approach } from "./math.js";
import { impactFromDrop } from "./fall.js";
import { LAND_POSE_TIME, LAND_POSE_FADE } from "./pose.js";

const landingMethods = {

  tickLanding(dt, inp, velYBefore, hasWish, wx, wz) {
    // ---- landing ----
    const landed = this.grounded && !this.prevGrounded;
    if (landed) {
      this.airFromJump = false;
      const impact = -velYBefore;
      const drop = Math.max(0, this.fallPeakY - this.pos.y);
      const wasSlam = this.state === "slam";
      // "Did that hurt?" is a question about the fall, not the frame: `landImpact` comes from
      // the height lost since the top of the airtime instead of the speed of the last frame,
      // so a step-down, a hop and a slam pressed an inch off the deck land *soft* (the ramp is
      // exactly 0 below DROP_IMPACT_MIN) while a real plunge lands hard. The old speed ramp
      // (`(impact - 5) / 16`) fired a thud, a squash and a camera shake off anything past a
      // kerb, which is what made small drops so noisy.
      this.landImpact = impactFromDrop(drop);
      this.landTimer = 0;
      if (wasSlam) {
        const power = Math.max(0.12, Math.min(1, this.slamHeight / P.SLAM_HEIGHT_MAX));
        this.slamPower = power;
        // The slam lands on both FISTS and holds them in the deck for a beat (see `poseSlamLand`
        // in streetwear.js — it replaces the generic absorb for as long as it is live).
        this.slamLandT = P.SLAM_LAND_TIME;
        this.slamLandPower = power;
        // A slam only *lands* like one if there was a drop behind it: close to the ground
        // there is no shockwave, no thud and no shake — the exit below (bounce / slide-out /
        // stand) still happens, the impact has to be earned.
        if (drop >= P.DROP_IMPACT_MIN) {
          this.lastSlam = { x: this.pos.x, y: this.pos.y - P.HY, z: this.pos.z, power };
          this.events.push("slamimpact");
          this.squash = 0.95;
          if (this.sfx) this.sfx.slamImpact(power);
        } else {
          this.squash = Math.max(this.squash, 0.22);
        }
        // A JUMP still wins the landing: a bounce out of a slam is the player asking for something
        // else. (What the landing can turn into is not decided here any more — the HAMMER is
        // entered by hand, during the beat the fists are in the deck; see the door in `update`.)
        if (this.jumpBuffer > 0) {
          const steer = Math.max(Math.hypot(this.vel.x, this.vel.z), P.SLAM_LAND_SPEED * 1.3);
          this.jumpBuffer = 0;
          this.vel.y = P.SLAM_BOUNCE_V * (0.86 + power * 0.5);
          if (hasWish) {
            this.vel.x = wx * steer;
            this.vel.z = wz * steer;
          } else if (Math.hypot(this.vel.x, this.vel.z) > 0.5) {
            const l = Math.hypot(this.vel.x, this.vel.z);
            this.vel.x = (this.vel.x / l) * steer;
            this.vel.z = (this.vel.z / l) * steer;
          }
          this.jumpsLeft = P.AIR_JUMPS;
          this.grounded = false;
          this.setState("air");
          this.squash = -0.85;
          this.events.push("slambounce");
        } else if (hasWish) {
          this.vel.x = wx * P.SLAM_LAND_SPEED;
          this.vel.z = wz * P.SLAM_LAND_SPEED;
          this.setState("ground");
        } else if (Math.hypot(this.vel.x, this.vel.z) > 3) {
          this.startSlide();
        } else {
          this.setState("ground");
        }
      } else {
        // Every landing gets an absorb, and a hard one folds him onto his heels — the pose
        // carries the depth now, so the whole-body squash is dialled back to a rumour of one.
        // The BACKSTEP is the exception: the landing it takes inside its own clock is a whole
        // authored beat (`poseBackdash`'s hero landing), and `poseLand` is layered over every pose
        // at 0.85, so handing it one too would wash the kneel out of the shape he just arrived in.
        // The impact still thuds and still squashes him — that is the beat the fist lands on.
        //
        // ...AND THE FREE FALL'S ROLL-OUT IS THE BIGGEST EXCEPTION OF ALL (session 194 — see
        // `startFreeRoll`). A skyfall that arrives hard does not catch itself on its heels: it rolls,
        // and the "start up" the user is rejecting (*"dont make have a start up like it is now just
        // make it i land and i do a little parkour roll then get on my feet"*) IS this absorb — a
        // catch, weight onto the heels with both arms out. So the whole of it stands down for the
        // roll: the brace, the pose's clock AND the whole-rig squash, because the ball the roll is
        // placed on is a MEASURED shape (see `startLunge`: a 0.30 squash sank the tuck 0.138 under
        // the deck). The thud, the dust and the `land` event all still fire — a body that rolls
        // instead of catching still HITS the deck, and that impact is exactly the beat the landing is.
        // A held SHIFT still wins (a slide is the player's own answer to a fast landing), and the
        // slide branch below is kept off a roll by the state the roll leaves behind: it wants "air".
        const roll = (this.skyfall || this.landedSkyfall) && this.landImpact >= P.FREE_ROLL_MIN_IMPACT &&
          !(inp.slideHeld || this.slideBuffer > 0) && this.state !== "lunge";
        if (this.state !== "dash" && !roll) {
          this.landT = LAND_POSE_TIME;
          this.landPose = 0.85;
        }
        this.landPower = Math.max(0.12, this.landImpact);
        // ...and the lunge is the exception on BOTH of these, and for the same reason it carries no
        // entry squash of its own (see `startLunge`): `squash` is a whole-rig SCALE and `poseLand` a
        // whole-body layer, and the ball its two rolls are placed on is a MEASURED shape. The pounce
        // lands straight into the roll, so the absorb would land on the one body in the game that
        // must keep the shape it was measured in. The thud, the dust and the event all still fire.
        if (this.landImpact > 0.05) {
          if (this.state !== "lunge" && !roll) this.squash = this.landImpact * 0.45;
          if (this.sfx) this.sfx.land(this.landImpact);
          this.events.push("land");
        }
        // ...and the roll itself, thrown LAST so the thud above has already been spent on the frame
        // the feet found the deck. `setState("lunge")` inside it is what the slide branch below then
        // reads — and what keeps a roll from being turned into a slide on the same frame.
        if (roll) this.startFreeRoll();
      }
      if (!wasSlam && this.state === "air" && (inp.slideHeld || this.slideBuffer > 0) && impact > 8) {
        this.slideBuffer = 0;
        this.startSlide();
      }
      // ...and the part of the landing that happens to everybody standing near it (see
      // `dropBlast`). It is the GROUND SLAM's own shockwave and nothing else's — the user's "the
      // drop has to be ground slam not any drop for it to make a blast" — so the slam is the only
      // landing that reaches it, whatever the height that landing came from. It is read off `drop`
      // (the height actually fallen) rather than off `landImpact`, because the blast's own range —
      // a roof, not a kerb — is wider than the thud's and the two ramps are deliberately not the
      // same one.
      if (wasSlam) this.dropBlast(drop);
    }
  },

  // THE LANDING ABSORB AND THE SLAM'S OWN LANDING (lifted out of `updateVisual`). Both are one-shots
  // unwound on their own timers; the slam's REPLACES the absorb for the beat the fists are in the deck
  // (the absorb throws both arms out for balance and the slam drives them straight down, so the two on
  // one frame average into mud), and the absorb itself stands down for a lunge.
  solveLandPose(dt, ud) {
    // The landing absorb: one shot, set at the moment of touchdown and unwound on its own timer.
    if (this.landT > 0) this.landT = Math.max(0, this.landT - dt);
    this.landPose = approach(this.landPose, this.landT > 0 ? this.landT / LAND_POSE_TIME : 0, dt / LAND_POSE_FADE);
    // ...and the SCISSOR's WHIFF is the second exception (session 191 — see `SCISSOR_MISS_DOWN`):
    // the frame it "lands" is the frame the somersault puts it on its BACK, and the absorb is a
    // standing body's shape (weight onto the heels, both arms out) — on a body that is already flat
    // on the pavement it would wash the knock-down out for a third of a second. The thud, the dust
    // and the camera shake still fire: a back slamming the deck SHOULD be heard, it just must not be
    // drawn as a catch.
    const scissorWhiff = this.state === "scissor" && this.scissorMiss;
    if (ud && ud.poseLand && this.landPose > 0.002 && this.slamLandT <= 0 && this.state !== "lunge" && !scissorWhiff) {
      ud.poseLand(this.landPose, this.landPower);
    }

    // ...and the SLAM's own landing (`poseSlamLand`), which REPLACES the absorb above for the beat
    // the fists are in the deck: the absorb throws both arms out for balance and this drives them
    // straight down, so the two on one frame average into mud. It is the same shape the hammer is
    // built from, at a depth the slam's own power decides.
    if (this.slamLandT > 0) this.slamLandT = Math.max(0, this.slamLandT - dt);
    this.slamLandPose = approach(this.slamLandPose, this.slamLandT > 0 ? this.slamLandT / P.SLAM_LAND_TIME : 0, dt / P.SLAM_LAND_FADE);
    if (ud && ud.poseSlamLand && this.slamLandPose > 0.002) ud.poseSlamLand(this.slamLandPose, this.slamLandPower);
  },
};

export function installLanding(Player) {
  Object.assign(Player.prototype, landingMethods);
}
