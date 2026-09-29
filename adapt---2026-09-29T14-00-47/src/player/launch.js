// ---------------------------------------------------------------------------
// Part 14 of the `player.js` split: THE LAUNCH PAD.
//
// Moved here from player.js:
//   - `launchArc` — the pad's arc SEARCH. It is a free function because a body
//     the player throws onto the plate has to be fired off the same pad by the
//     same solver (`Enemy.padLaunch` in enemies.js), so player.js re-exports it
//     for that caller.
//   - the `Player` methods `solveLaunchArc` and `startLaunch` (the launch-pad
//     block), installed onto the prototype by `installLaunch`.
//
// Deps: `P` from ./config.js, and `this.setState`/`this.sfx`/`this.events` on
// the body. Nothing here touches THREE.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { approach } from "./math.js";
import { LAND_POSE_TIME, LAUNCH_POSE_FADE } from "./pose.js";

// ---------------------------------------------------------------------------
// THE PAD'S ARC (see the launch-pad block in `P`, and `Player.solveLaunchArc`).
//
// It lived on `Player` alone until session 174, when the user asked for *"the dummy get launched
// from the jump pad normaly like a player"*: a body thrown onto the plate has to be fired exactly
// as he is, and a second copy of this search in enemies.js would be a second answer to the same
// question. So it is a plain function of the two endpoints and the tower's box, and both callers
// hand it their own — `Player.solveLaunchArc` for the player, `Enemy.padLaunch` for a body.
//
// `from` and `to` are the BODY'S CENTRE, which is the point the clearance test below measures
// against the roof with `P.HY`. The player's `pos` already is its centre; an enemy's `pos` is its
// FEET (see the note in enemies.js), so that caller adds `P.HY` on the way in and takes it back
// off on the way out.
// ---------------------------------------------------------------------------
export function launchArc(from, to, tower) {
  const G = P.GRAVITY;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dy = to.y - from.y;
  const dh = Math.hypot(dx, dz);
  const rad = P.HX + P.LAUNCH_CLEAR;
  for (let D = P.LAUNCH_MIN; D <= P.LAUNCH_MAX + 1e-6; D += P.LAUNCH_STEP) {
    const vy = dy / D + 0.5 * G * D;
    // Sampled at a fixed TIME step, not a fixed count: the flight time varies a lot with where
    // you are standing, and a fixed count would step straight over the one moment that matters
    // (the crossing of the tower's edge) on the long arcs. Measured: a coarse count let a
    // marginal arc through, and the body shaved the roof lip by half a unit.
    const steps = Math.max(24, Math.ceil(D / 0.025));
    let clear = true;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * D;
      // The last 3% is the arrival itself, which is *supposed* to be on the roof.
      if (t > D * 0.97) break;
      const px = from.x + (dx * t) / D;
      const pz = from.z + (dz * t) / D;
      const py = from.y + vy * t - 0.5 * G * t * t;
      if (py - P.HY > tower.roofY + 0.05) continue;      // above the roof: always fine
      if (px < tower.minX - rad || px > tower.maxX + rad) continue;
      if (pz < tower.minZ - rad || pz > tower.maxZ + rad) continue;
      clear = false;                                    // over the tower and below its roof
      break;
    }
    if (!clear) continue;
    return { D, vy, dx, dz, dh, from, to };
  }
  // Nothing in range cleared the tower — which the pad's own geometry makes unreachable (the
  // solver only has to reach ~4.2 s from anywhere you can stand on it), so this is a safety
  // net rather than a code path: fly the longest arc the search considered. It still lands on
  // the roof; if it shaved the corner on the way it is only ever a visual nick, because the
  // launch does not collide (see `update`).
  const D = P.LAUNCH_MAX;
  return { D, vy: dy / D + 0.5 * G * D, dx, dz, dh, from, to };
}

const launchMethods = {
  // ------------------------------------------------------------------
  // THE LAUNCH PAD
  //
  // The pad does not shove the player: it solves a ballistic arc that lands them on the roof
  // and then flies it. The reason is that a shove cannot work here — the tower is eighty-odd
  // units deep in the direction of travel, so any single impulse that is flat enough to arrive
  // over the middle is also too flat to have cleared the wall by then, and any impulse steep
  // enough to clear the wall comes straight back down where it started. The arc has to be
  // *timed*, and once it is timed the flight time is the free parameter:
  //
  //   for a flight of D seconds,  vy = dy/D + g*D/2   and   vh = dh/D
  //
  // which lands exactly on the target at t = D. Larger D is a slower horizontal and therefore a
  // steeper climb, so the search below is just "the shortest flight whose whole path is above
  // the roof whenever it is over the tower" — sampled rather than solved, because the tower's
  // footprint is a box and a sample test cannot get the corner wrong.
  //
  // The arc is flown with real gravity but WITHOUT collision (see `update`): a launch that
  // clipped a face would stop dead halfway up the wall, and the whole point of the move is that
  // it always arrives.
  //
  // ...and the SEARCH itself is `launchArc` in `./player/launch.js`, not a method: a body the
  // player throws onto the plate is fired off the same pad by the same solver (session 174 — see
  // `Enemy.padLaunch` in enemies.js).
  // ------------------------------------------------------------------

  solveLaunchArc(pad) {
    return launchArc(
      { x: this.pos.x, y: this.pos.y, z: this.pos.z },
      { x: pad.launch.x, y: pad.launch.y + P.HY, z: pad.launch.z },
      pad.tower
    );
  },

  startLaunch(pad) {
    const arc = this.solveLaunchArc(pad);
    if (!arc) return false;
    this.setState("launch");
    this.launch = arc;
    this.launchT = 0;
    this.launchCd = P.LAUNCH_CD;
    this.attached = false;
    this.attachMode = null;
    this.wall = null;
    this.wallSliding = false;
    this.climbing = false;
    this.wallRunning = false;
    this.wallStick = 0;
    this.wallLock = P.WALL_LOCK;
    this.grounded = false;
    this.prevGrounded = false;
    this.jumpsLeft = P.AIR_JUMPS;
    this.fallPeakY = this.pos.y;
    this.squash = -0.7;
    this.facing = Math.atan2(arc.dx, arc.dz);
    this.vel.set(arc.dx / arc.D, arc.vy, arc.dz / arc.D);
    if (this.sfx) this.sfx.launch();
    this.events.push("launch");
    return true;
  },

  // ---- launch pad ----
  // Checked before the state entries, because the pad beats everything else the moment you
  // are standing on it: nothing you can press should be able to cancel a launch, and the
  // move owns the body from the first frame. It only reads the world while the feet are
  // down, so the query never runs mid-air.
  tickLaunchPad(grounded) {
    // ...and a RIDE keeps its own feet (session 200): a pad under a board would take the body and
    // leave the deck in the road, and a ride is the one state whose whole point is the deck.
    if (this.board) return;
    if (grounded && this.launchCd <= 0 && this.state !== "launch" && this.state !== "clash" && this.state !== "macaco" && this.state !== "smash" && this.state !== "wallbeat") {
      const pad = this.world.padAt ? this.world.padAt(this.pos.x, this.pos.y - P.HY, this.pos.z) : null;
      if (pad) this.startLaunch(pad);
    }
  },

  // The pad's flight. The arc is solved once (`startLaunch`) and then flown here: the
  // position is the ballistic curve itself and `vel` is its derivative, so the camera,
  // the speed FX and the pose all read a real velocity — but the arc does not collide
  // (see `update`), because arriving is the entire promise of the move.
  tickLaunchState(dt) {
        this.launchT += dt;
        const a = this.launch;
        if (!a) {
          this.setState("air");
          return;
        }
        const t = Math.min(this.launchT, a.D);
        this.pos.x = a.from.x + (a.dx * t) / a.D;
        this.pos.z = a.from.z + (a.dz * t) / a.D;
        this.pos.y = a.from.y + a.vy * t - 0.5 * P.GRAVITY * t * t;
        this.vel.x = a.dx / a.D;
        this.vel.z = a.dz / a.D;
        this.vel.y = a.vy - P.GRAVITY * t;
        this.grounded = false;
        if (this.launchT >= a.D) {
          this.pos.x = a.to.x;
          this.pos.y = a.to.y;
          this.pos.z = a.to.z;
          this.vel.set(0, 0, 0);
          this.fallPeakY = this.pos.y;
          this.grounded = true;
          this.prevGrounded = true;
          this.setState("ground");
          this.jumpsLeft = P.AIR_JUMPS;
          this.squash = 0.9;
          this.landT = LAND_POSE_TIME;
          this.landPower = 1;
          this.landImpact = 1;
          this.landPose = 0.85;
          this.chain = 0;
          if (this.sfx) this.sfx.land(1);
          this.events.push("launchland");
          this.launch = null;
        }
        return;
  },

  // THE LAUNCH PAD'S OWN POSE LAYER (lifted out of `updateVisual`). A launch is an absolute pose on
  // its own fade; the only channel it is handed is the body's own vertical speed, normalised — so
  // the shape can be built around the ride.
  solveLaunchPose(dt, ud) {
    this.launchPose = approach(this.launchPose, this.state === "launch" ? 1 : 0, dt / LAUNCH_POSE_FADE);
    if (ud && ud.poseLaunch && this.launchPose > 0.002) {
      ud.poseLaunch(this.launchPose, Math.max(-1, Math.min(1, this.vel.y / 70)));
    }
  },
};

export function installLaunch(Player) {
  Object.assign(Player.prototype, launchMethods);
}
