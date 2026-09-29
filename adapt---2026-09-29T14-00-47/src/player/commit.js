// ---------------------------------------------------------------------------
// Part 18 of the `player.js` split: THE COMMITTED MOVES' ENTRIES.
//
// Moved here from player.js:
//   - the five state entries: `startHammer` (the slam's flurry), `startDive`,
//     `startSlam`, `startSlide` and `startDash` (the Q dash).
//   - the dash's two rig readers, `qdashTime` and `backdashBeats`.
//   - `hammerTotal`, moved with `startHammer` and re-exported, because `update` and
//     `updateVisual` still read it (they cannot import it back from player.js).
//
// Deps: `P` from ./config.js, and the body's own fields/methods. No module-scope
// scratch, and nothing here touches THREE.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { TAU, approach } from "./math.js";
import { HAMMER_POSE_FADE, DIVE_POSE_FADE, SLAM_POSE_FADE } from "./pose.js";
import { accelerate } from "./physics.js";

// How long the hammer runs, off its own beat table (`P.HAMMER`, which owns the clock: the impacts
// are fired at `raise + strike` through every cycle, and `poseSmash` builds the shape on the same
// numbers). One expression, so the pose and the hits can never drift apart.
export function hammerTotal(H) {
  return H.cycle * H.hits + H.exit;
}

const commitMethods = {
  // -------------------------------------------------------------------------
  // THE HAMMER (see `P.HAMMER`, and "The ground slam" in README.md).
  //
  // The flurry the slam's landing can turn into — BY HAND: it is not the third slam into a spot any
  // more, it is one more press of the slam button while the fists are still in the deck (see the
  // door in `update`). It comes out of the crouch into six overhead smashes, each one a shape of
  // its own and each one an impact of its own. Nothing about the world side of it is new — every
  // fist that goes in is an ordinary `slamimpact`, so it cracks the deck and throws the same ring
  // and the same shake the slam that started it did, which is exactly what this game already means
  // by hammering one place. What is new is only the body: it is COMMITTED for the whole sequence
  // (the same way the slam it grew out of is), and it BOUNCES — every beat is a hop off the deck,
  // a coil at the top and a drive back down onto the impact.
  //
  // The clock is `hammerT` counting down from `hammerTotal(P.HAMMER)`, the hits are fired where
  // `poseSmash` puts the fists in the deck (`raise + strike` of every cycle, which is also where
  // the bounce comes back down — see `hammerHop`), and the six shapes live in `HAMMER_BEATS`.
  startHammer() {
    this.setState("smash");
    this.hammerT = hammerTotal(P.HAMMER);
    this.hammerHit = 0;
    this.hammerPose = 0;
    this.hammerAir = 0;
    this.hammerLift = 0;
    this.hammerSpin = 0;
    this.hammerFlip = 0;
    this.squash = 0.5;
    this.vel.x *= 0.1;
    this.vel.z *= 0.1;
    this.jumpBuffer = 0;
    this.slideBuffer = 0;
    if (this.sfx) this.sfx.slam();
    this.events.push("hammer");
  },

  // THE DIVE (F) and THE GROUND SLAM (X) — the two COMMIT moves, pulled out of the standing press
  // chain so a FREE FALL can reach them too (the user's *"make me able to dive and slam in free
  // fall"*). Both used to be inline in that chain, which is itself refused for the whole of a
  // skyfall (see the press block in `update`), so a body that fell off something tall could do
  // exactly one thing on the way down — the held plunge. Now the fall offers the same pair the air
  // does: F throws the forward dive (the dive's own physics then own the descent, which is a much
  // slower, gliding fall than the skyfall's terminal), and X throws the slam (horizontal killed,
  // straight down at `SLAM_V` and faster). Both stand the skyfall down on the way in.
  startDive() {
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    this.diveBuffer = 0;
    this.setState("dive");
    this.diveCd = 0.6;
    // A new dive is a new tackle, so the bodies the last one arrived on are forgotten and the
    // handover read is cleared (see `diveContact`).
    this.diveHits.clear();
    this.diveArrive = false;
    // Keep every bit of speed you entered with (never less than DIVE_SPEED) — the dive then ramps
    // it up while the state's own swing rotates it onto the camera axis.
    const diveSp = Math.hypot(this.vel.x, this.vel.z);
    this.diveSpeed = Math.min(P.MAX_SPEED, Math.max(diveSp, P.DIVE_SPEED));
    this.vel.y = Math.max(this.vel.y, -3) * 0.45;
    this.facing = Math.atan2(-sin, -cos);
    if (this.sfx) this.sfx.dive();
    this.events.push("dive");
    this.squash = -0.5;
  },

  startSlam(hasWish, wx, wz) {
    this.slamBuffer = 0;
    this.setState("slam");
    this.slamCd = 0.45;
    this.slamStartY = this.pos.y;
    this.slamHeight = 0;
    this.vel.x *= 0.16;
    this.vel.z *= 0.16;
    this.vel.y = Math.min(this.vel.y, -P.SLAM_V);
    if (hasWish) this.facing = Math.atan2(wx, wz);
    this.squash = -0.35;
    if (this.sfx) this.sfx.slam();
    this.events.push("slam");
  },

  startSlide() {
    this.setState("slide");
    // A new slide is a new sweep, so every body gets its two takes back (see `slideContact`).
    this.slideHits.clear();
    const sp = Math.hypot(this.vel.x, this.vel.z);
    // A slide CARRIES the momentum you enter it with. The old `SLIDE_MAX` ceiling clamped a
    // 30 u/s dive or a chained bhop down to 21 the moment SHIFT went down — the slide was
    // actively taking speed off you, which is the one thing it must never do. `MAX_SPEED` is
    // the only ceiling left, and `SLIDE_BOOST` still rewards entering fast.
    const boost = Math.min(P.MAX_SPEED, Math.max(sp * P.SLIDE_BOOST, 9.5));
    if (sp > 0.3) {
      const k = boost / sp;
      this.vel.x *= k;
      this.vel.z *= k;
    } else {
      this.vel.x = Math.sin(this.facing) * boost;
      this.vel.z = Math.cos(this.facing) * boost;
    }
    this.slideCd = 0.55;
    if (this.sfx) this.sfx.slide();
    this.events.push("slide");
  },

  // The Q DASH — the four-direction step. `dx, dz` is the wish (world, camera-relative), and
  // which of the three it is comes out of the BODY's own frame: how much of the wish lies along
  // his facing (front or back) against how much lies across it (a sidestep). That is also why the
  // direction is NOT simply handed to `facing` for two of them — a dodge that turns the body onto
  // the line it is leaving is just a run (see `poseDash`).
  startDash(dx, dz) {
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const f = this.facing;
    const fwd = dx * Math.sin(f) + dz * Math.cos(f);
    // ...and the cross component: the player's own RIGHT is `(-cos, sin)` of the facing (the rig's
    // `+X` is his LEFT — see `RK` and the note in the README's "Sign bugs"), so this is positive
    // when the step goes to his right.
    const rgt = -dx * Math.cos(f) + dz * Math.sin(f);
    const kind = Math.abs(fwd) >= Math.abs(rgt) ? (fwd >= 0 ? 0 : 2) : 1;
    const side = kind === 1 ? (rgt > 0 ? 1 : -1) : 0;
    const mul = kind === 0 ? P.QDASH_FRONT : kind === 1 ? P.QDASH_SIDE : P.QDASH_BACK;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    // A lunge keeps the run it was thrown out of (it is the one step that is a run aimed
    // forward); the other two take half of it and leave the rest behind, because leaving that line
    // is what they are for.
    const speed = Math.min(P.DASH_MAX, kind === 0
      ? Math.max(P.QDASH_SPEED * P.QDASH_FRONT, sp * P.QDASH_KEEP)
      : Math.max(P.QDASH_SPEED * mul, sp * P.QDASH_CARRY));
    this.setState("dash");
    this.dashKind = kind;
    this.dashSide = side;
    this.dashDirX = dx;
    this.dashDirZ = dz;
    // A new step is a new hitbox: every body the last lunge touched is forgotten (see
    // `dashContact`). Only the LUNGE has one, but clearing it here is what makes it per-step.
    this.dashHits.clear();
    this.dashHitTarget = null;
    this.vel.x = dx * speed;
    this.vel.z = dz * speed;
    // ...and TWO of the three steps LEAVE THE GROUND: the backstep (a twisting backflip — see
    // `QDASH_BACK_HOP`) and, since session 87, the front step, whose whole shape is a boxcutter
    // (`QDASH_FRONT_HOP`). Both are PERFORMANCES rather than placements, and both are therefore
    // held for their full clock whatever the ground does — see the exit in `update`. The sidestep
    // is the only one of the three that is a step and stays on the deck.
    if (kind === 2) this.vel.y = Math.max(this.vel.y, P.QDASH_BACK_HOP);
    else if (kind === 0) this.vel.y = Math.max(this.vel.y, P.QDASH_FRONT_HOP);
    // Only the LUNGE faces its own line: a sidestep and a backstep keep the eyes where they were.
    if (kind === 0) this.facing = Math.atan2(dx, dz);
    this.dashCd = P.QDASH_CD;
    this.dashBuffer = 0;
    this.spinX = 0;
    this.dashSpinY = 0;
    // ...and the step's own pose clock back to its start, with no rush armed (see `dashPoseT`).
    this.dashPoseT = 0;
    this.dashRushAt = -1;
    this.dashRushK = 1;
    this.dashPendingHits = null;
    this.dashKickLanded = false;
    // ...and the backstep's own landing beat, armed for the one `dashland` it fires (see the `dash`
    // case in `update`).
    this.backdashLanded = false;
    // ...and the front step's own (its landing is a plain one, not the backstep's hero landing —
    // see the `dash` case in `update`).
    this.boxLanded = false;
    this.squash = 0.24;
    if (this.sfx) this.sfx.dash();
    this.events.push("dash");
    return true;
  },

  // How long the step in hand lasts — its own clock, off `P.QDASH_T` (see the note there): the
  // lunge is the long one, the sidestep is a step, and the backstep is the whole performance.
  qdashTime(kind) {
    const k = kind == null ? this.dashKind : kind;
    return P.QDASH_T[Math.max(0, Math.min(2, k | 0))];
  },

  // The BACKDASH's own BEAT TABLE, read off the rig (`streetwear.js`'s `BACKDASH`, published as
  // `userData.backdashBeats`) so the pose that is drawn and the travel that is simulated are the
  // same decision. The fallback is only for the corner where the rig is not built yet.
  backdashBeats() {
    const bt = this.charMesh && this.charMesh.userData;
    return (bt && bt.backdashBeats) || { coil: 0.06, lock: 0.3333, turn: 0.44, land: 0.50, hold: 0.54, slide: 0.80 };
  },

  // ---- the hammer's door [see `startHammer`] ----
  // The flurry is MANUAL. The way in is the slam's own LANDING BEAT: a slam puts both fists in the
  // deck and holds them there for `SLAM_LAND_TIME`, and one more press of the slam button inside
  // that window takes the body into the flurry instead of standing it back up. The press arrives
  // in `slamBuffer` (the same buffer the air slam uses), so a mash that lands a frame early is
  // still a mash. Nothing says so anywhere — the hint line and the help grid never mention it.
  tickHammerDoor() {
    if (this.state === "ground" && this.slamLandT > 0 && this.slamBuffer > 0) {
      this.slamBuffer = 0;
      this.startHammer();
    }
  },

  // ---- the hammer [see `startHammer`] ----
  // The clock and the impacts live here, with the other state exits, because they are the same
  // question: what is this state doing this frame. Every fist that goes in is the ordinary
  // `slamimpact` — the cracks, the ring, the shake and the sound are all the slam's own — so the
  // only thing the hammer does to the world is keep hitting it.
  tickHammer(dt) {
    if (this.state === "smash") {
      const H = P.HAMMER;
      const total = hammerTotal(H);
      this.hammerT = Math.max(0, this.hammerT - dt);
      const T = total - this.hammerT;
      const { k, ph } = hammerBeat(H, T);
      // THE BOUNCE. Every beat is a hop: the body leaves the deck at phase 0, coils at the top and
      // comes back down onto the impact. It is a VISUAL lift rather than a real one (`hammerLift`
      // is added to the rig's own y in `updateVisual`) because the flurry is a planted move: the
      // capsule stays where it landed, nothing here can walk it off its spot, and the fists still
      // meet the deck at the body's own floor (the lift is exactly zero on the impact). The pose is
      // handed the same number (`hammerAir`) and coils and tucks its legs with it.
      this.hammerAir = hammerAirAt(H, ph);
      const hops = H.hops || [];
      this.hammerLift = hammerHop(H) * (hops[k % hops.length] === undefined ? 1 : hops[k % hops.length]) * this.hammerAir;
      // ...and the TURN. Whole turns per beat, spread across the drive (so the body is square again
      // on the impact — see `P.HAMMER.turns`), computed from the clock rather than accumulated, so
      // there is nothing to wind back when the flurry ends.
      const turns = H.turns || [];
      let before = 0;
      for (let i = 0; i < k; i++) before += turns[i % turns.length];
      const turn = turns[k % turns.length] || 0;
      const spinHit = Math.max(1e-4, H.raise + H.strike);
      this.hammerSpin = TAU * (before + turn * Math.min(1, ph / spinHit));
      // ...and the FLIP, for the one beat that goes over instead of round: a whole forward pitch,
      // finished on the impact like the turns are (see `P.HAMMER.flips`). It is added to the body's
      // own pitch in `updateVisual`, so the pose is still written in the body's frame and rides it.
      const flips = H.flips || [];
      this.hammerFlip = TAU * (flips[k % flips.length] || 0) * Math.min(1, ph / spinHit);
      while (this.hammerHit < H.hits) {
        if (T < H.cycle * (this.hammerHit + H.raise + H.strike)) break;
        const beat = this.hammerHit;
        this.hammerHit++;
        // The six are not the same weight: the first is a light tap by the standard of what comes
        // after it and the last lands at nearly a full slam (see `HAMMER_POWER_RAMP`), which is
        // what makes the flurry build instead of being six identical thuds.
        const ramp = H.hits > 1 ? beat / (H.hits - 1) : 0;
        const power = P.HAMMER_POWER * (1 + P.HAMMER_POWER_RAMP * ramp);
        this.lastSlam = { x: this.pos.x, y: this.pos.y - P.HY, z: this.pos.z, power };
        this.events.push("slamimpact");
        this.squash = Math.max(this.squash, 0.42);
        if (this.sfx) this.sfx.slamImpact(power);
      }
      // The flurry is a GROUND move, so a flurry that runs its clock out ON the deck hands the body
      // back to "ground" and lets the state machine's own check (`ground && !grounded -> air`) deal
      // with anything unusual — which is exactly what every other ground move does, and it keeps a
      // one-frame "air" out of the handover (the body never left the deck, and the hint text
      // flickered with it). A flurry whose deck has GONE never gets here: the plunge check after the
      // move has already handed the body to the air (see the `smash` case).
      if (this.hammerT <= 0) this.setState("ground");
    } else if (this.hammerLift !== 0 || this.hammerAir !== 0) {
      this.hammerLift = 0;
      this.hammerAir = 0;
      this.hammerFlip = 0;
    }
  },

  tickDiveState(dt, sin, cos) {
        this.vel.y -= P.GRAVITY * 0.55 * dt;
        if (this.vel.y < -15) this.vel.y = -15;
        // The dive is locked to where the camera looks, and it BUILDS momentum: the target
        // speed ramps up toward DIVE_MAX while diving, and the velocity is swung onto the
        // camera's horizontal forward axis at that target (never dropping below DIVE_SPEED).
        if (this.diveSpeed < P.DIVE_MAX) {
          this.diveSpeed = Math.min(P.DIVE_MAX, this.diveSpeed + P.DIVE_ACCEL * dt);
        }
        // A fresh wall kick overrides the camera line with the line the boot sent you on
        // (straight off the face). The camera has already snapped onto exactly that line
        // (main.js turns the rig onto `kickDir`, in one frame), so this fades from the same
        // direction it hands back to — it is what keeps the shove pointing off the face for
        // the beat the boot is committed, not a correction.
        const kk = this.kickT > 0 ? this.kickT / P.KICK_POSE : 0;
        let aimX = -sin;
        let aimZ = -cos;
        if (kk > 0) {
          aimX += (this.kickDirX - aimX) * kk;
          aimZ += (this.kickDirZ - aimZ) * kk;
          const al = Math.hypot(aimX, aimZ) || 1;
          aimX /= al;
          aimZ /= al;
        }
        const k = Math.min(1, dt * 10);
        this.vel.x += (aimX * this.diveSpeed - this.vel.x) * k;
        this.vel.z += (aimZ * this.diveSpeed - this.vel.z) * k;
        return;
  },

  tickSlamState(dt, wx, wz, hasWish) {
        this.vel.y -= P.GRAVITY * P.SLAM_FALL * dt;
        if (this.vel.y < -P.SLAM_MAX_V) this.vel.y = -P.SLAM_MAX_V;
        if (hasWish) accelerate(this.vel, wx, wz, 2.6, 1.1, dt);
        const ssp = Math.hypot(this.vel.x, this.vel.z);
        if (ssp > 0.01) {
          const drop = Math.min(ssp, P.SLAM_DRAG * dt);
          const k = (ssp - drop) / ssp;
          this.vel.x *= k;
          this.vel.z *= k;
        }
        this.slamHeight = Math.max(this.slamHeight, this.slamStartY - this.pos.y);
        return;
  },

  // PLANTED — horizontally. The flurry is six impacts into one spot, so the body does not
  // travel: what it arrived with is shed in a couple of frames and nothing can add to it — the
  // ground state's own accelerate/grip is never reached, so no input can walk the flurry off
  // its spot. What it DOES do is BOUNCE: the hop between the beats is a lift on the rig rather
  // than on the capsule (`hammerLift`), which is what keeps the deck under the fists exactly
  // where the impacts are fired. And the pose owns everything above the deck (see `poseSmash`).
  //
  // ...BUT THE DECK IS NOT A GUARANTEE. This used to say "gravity is the ground's business:
  // the body is standing on the deck the whole time", and that was true right up until the
  // move started beating the deck it is standing ON into a hole. With no gravity term the
  // capsule simply HANGS at the height it arrived at while the stone under the fists falls
  // away: the user's *"when i do the hammer move and break the stuff under me and the animtion
  // is still playing i float in the air"*. So the state now falls like every other ground
  // state does — gravity into `vel`, and the world's own floor check (`moveAndCollide`) stands
  // the body back down on whatever deck is left. On an intact deck this is INVISIBLE: the
  // frame's little drop is clamped straight back out (measured 9 mm at 60 fps against the
  // 1.5 mm `EPS`, so the clamp runs every frame) and the hop stays a `hammerLift` on the rig.
  // On a deck that is going away it is the whole fix: the body goes DOWN with the stone it was
  // hitting. Nothing else changes here — it is still planted horizontally, and the fall it
  // takes when the floor goes ends the flurry (see the plunge check after the move, below).
  tickSmashState(dt) {
        this.vel.y -= P.GRAVITY * dt;
        const sspS = Math.hypot(this.vel.x, this.vel.z);
        if (sspS > 0.01) {
          const k = Math.max(0, 1 - 9 * dt);
          this.vel.x *= k;
          this.vel.z *= k;
        }
        return;
  },

  // THE HAMMER'S OWN POSE LAYER (lifted out of `updateVisual`). It is an absolute pose like the
  // chain's — it owns the body for the whole sequence — and the only thing handed to it is the
  // clock: the pose computes the phase of its own cycle from `P.HAMMER`, which is the same table
  // `update` fires the impacts off, so a fist can never land on a frame the body is not driving it
  // into the deck.
  solveSmashPose(dt, ud) {
    this.hammerPose = approach(this.hammerPose, this.state === "smash" ? 1 : 0, dt / HAMMER_POSE_FADE);
    if (ud && ud.poseSmash && this.hammerPose > 0.002) {
      ud.poseSmash(this.hammerPose, hammerTotal(P.HAMMER) - this.hammerT, P.HAMMER, this.hammerAir);
    }
  },

  // THE DIVE AND THE SLAM'S OWN POSE LAYERS (lifted out of `updateVisual`). Both are absolute poses
  // like the hammer's, each on its own fade.
  solveDiveSlamPose(dt, ud, speed) {
    this.divePose = approach(this.divePose, this.state === "dive" ? 1 : 0, dt / DIVE_POSE_FADE);
    // It is a still too (see `poseDive`): the only thing the dive's own speed does to the
    // shape is widen the legs, and the speed is bought with the body's forward lean below and
    // the wind streaks off the flanks (`effects.diveTrail`, emitted from main.js).
    if (ud && ud.poseDive && this.divePose > 0.002) {
      ud.poseDive(this.divePose, Math.min(1, speed / P.DIVE_MAX));
    }
    this.slamPose = approach(this.slamPose, this.state === "slam" ? 1 : 0, dt / SLAM_POSE_FADE);
    if (ud && ud.poseSlam && this.slamPose > 0.002) ud.poseSlam(this.slamPose);
  },
};

export function installCommit(Player) {
  Object.assign(Player.prototype, commitMethods);
}

// ---------------------------------------------------------------------------
// Part 24 of the split: THE HAMMER'S THREE BEAT HELPERS — `hammerHop`,
// `hammerAirAt` and `hammerBeat`. They belong with `startHammer` (above), and
// `update`/`updateVisual` import them back from here.
// ---------------------------------------------------------------------------
// ...and how high the bounce goes. The body is thrown off the deck at phase 0 and caught by gravity
// on the impact, so the top of the hop is just the apex of that arc: `g t²/8` for the airtime the
// beat table asks for. Derived rather than authored, so stretching the cycle stretches the hop with
// it — and the coil the pose strikes at the top is always at the top of the arc that put it there.
export function hammerHop(H) {
  const t = H.cycle * (H.raise + H.strike);
  return P.GRAVITY * t * t / 8;
}

// The bounce's own curve: 0 with the fists in the deck, 1 at the apex. It is the height of a body
// that was actually thrown, which is what the hammer's pose comes on with — the coil's shape and
// its tucked legs are the hop, read back, rather than a second curve keyed to look like it.
export function hammerAirAt(H, ph) {
  const hit = H.raise + H.strike;
  if (ph <= 0 || ph >= hit) return 0;
  const u = ph / hit;
  return 4 * u * (1 - u);
}




// Which beat of the flurry `T` seconds in is, and how far into it (0..1). The same two numbers the
// pose computes for itself, so the impacts, the bounce and the shape are one read of the clock.
export function hammerBeat(H, T) {
  const c = Math.max(1e-4, H.cycle);
  const k = Math.max(0, Math.min(H.hits - 1, Math.floor(T / c)));
  const ph = Math.max(0, Math.min(1, T / c - k));
  return { k, ph };
}
