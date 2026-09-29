// ---------------------------------------------------------------------------
// THE BODY AGAINST THE WORLD (part 12 of the player.js split).
//
// Everything the capsule READS about its surroundings, and everything the deck
// does to it: the overlap test, the wall sense and pick, the wall-jump normal,
// `spaceFree`, the slope reads (`readSlope`/`slopeGate`/`slopePull`), the deck's
// own grip (`deckGrip`) and the slide's tuck and squeeze (`updateBox`/`fitScale`/
// `squeezeAt`/`updateSqueeze`) — 13 methods, verbatim, in a table
// `installPhysics` copies onto `Player.prototype`. The three MOTION helpers they
// share (`accelerate` / `applyFriction` / `bleedSpeed`) move here with them and
// are re-exported, because `update` still calls all three.
//
// The collision box's own `get hx()` / `get hz()` STAYED in `player.js`: an
// accessor cannot ride an `Object.assign` table (the assign would read it once
// and copy the value), and they are the box's own definition anyway.
//
// A LEAF with respect to player.js: it imports `P` (player/config.js). No scratch,
// no three.js.
// ---------------------------------------------------------------------------
import { P } from "./config.js";

function accelerate(vel, wx, wz, wishSpeed, accel, dt) {
  const current = vel.x * wx + vel.z * wz;
  const add = wishSpeed - current;
  if (add <= 0) return;
  let accelSpeed = accel * wishSpeed * dt;
  if (accelSpeed > add) accelSpeed = add;
  vel.x += wx * accelSpeed;
  vel.z += wz * accelSpeed;
}

function applyFriction(vel, amount, dt) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 0.05) {
    vel.x = 0;
    vel.z = 0;
    return;
  }
  const control = Math.max(speed, 3.5);
  const drop = control * amount * dt;
  const scale = Math.max(0, speed - drop) / speed;
  vel.x *= scale;
  vel.z *= scale;
}

// ...AND THE OTHER KIND OF FRICTION: a fixed AMOUNT OFF THE SPEED, whatever the speed is. That is
// what a body sliding on real ground does — the retarding force is the weight times a coefficient
// and neither of those knows how fast the body is going, so the SPEED falls on a straight line and
// the STOP is somewhere you can see coming. `applyFriction` above is the opposite animal: it takes
// a SHARE of the speed, so the same coefficient bites harder the faster you are going (that is what
// a fast run through air wants, and it is what the slide's tail must not be — see the `SLIDE_DRAIN_`
// block in `P`). `decel` is in u/s², and a slide already slower than one step's worth of it is put
// down rather than creeping.
function bleedSpeed(vel, decel, dt) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 1e-4) {
    vel.x = 0;
    vel.z = 0;
    return;
  }
  const scale = Math.max(0, speed - decel * dt) / speed;
  vel.x *= scale;
  vel.z *= scale;
}

export { accelerate, applyFriction, bleedSpeed };

const physicsMethods = {

  overlaps(c) {
    const hx = this.hx;
    const hz = this.hz;
    return (
      this.pos.x + hx > c.minX &&
      this.pos.x - hx < c.maxX &&
      this.pos.y + P.HY > c.minY &&
      this.pos.y - P.HY < c.maxY &&
      this.pos.z + hz > c.minZ &&
      this.pos.z - hz < c.maxZ
    );
  },

  // Real wall faces from the real colliders: the normal comes from whichever axis face you
  // are actually closest to, and the exact gap/top are recorded so sliding can hug the wall
  // and climbing can find the ledge. The old version fired 8 directional probes that guessed
  // a normal from the probe direction (a diagonal probe claimed a 45-degree face) and knew
  // nothing about distance, height or which collider it belonged to.
  senseWalls() {
    this.walls.length = 0;
    const cols = this.colliders;
    const minY = this.pos.y - P.HY + 0.14;
    const maxY = this.pos.y + P.HY - 0.14;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (maxY <= c.minY || minY >= c.maxY) continue;
      const cx = (c.minX + c.maxX) * 0.5;
      const cz = (c.minZ + c.maxZ) * 0.5;
      const chx = (c.maxX - c.minX) * 0.5;
      const chz = (c.maxZ - c.minZ) * 0.5;
      const sx = Math.abs(this.pos.x - cx) - (this.hx + chx);
      const sz = Math.abs(this.pos.z - cz) - (this.hz + chz);
      let nx = 0;
      let nz = 0;
      let gap = 0;
      if (sx >= sz) {
        if (sx > P.WALL_PAD || sx < -0.25) continue;
        if (this.hz + chz - Math.abs(this.pos.z - cz) <= 0.02) continue;
        nx = this.pos.x > cx ? 1 : -1;
        gap = sx;
      } else {
        if (sz > P.WALL_PAD || sz < -0.25) continue;
        if (this.hx + chx - Math.abs(this.pos.x - cx) <= 0.02) continue;
        nz = this.pos.z > cz ? 1 : -1;
        gap = sz;
      }
      this.walls.push({ nx, nz, gap, topY: c.maxY, botY: c.minY, c });
    }
  },

  // Pick the wall you are actually working with: the one most opposed to how you are moving
  // (or steering), with closeness as the tie-breaker.
  pickWall(dirX, dirZ) {
    if (!this.walls.length) return null;
    let best = null;
    let bestScore = -1e9;
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      const score = -(dirX * w.nx + dirZ * w.nz) * 2 - Math.max(0, w.gap) * 3;
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    }
    return best;
  },

  wallJumpNormal(from = this.wall) {
    const w = from;
    if (!w) {
      if (this.wallNx || this.wallNz) return { nx: this.wallNx, nz: this.wallNz };
      return null;
    }
    let nx = w.nx;
    let nz = w.nz;
    // Inside corners (a perpendicular face belonging to a *different* collider) bisect the
    // launch so you pop out of the corner instead of straight into the other wall. Faces of
    // the same block are a convex edge, so those keep the single face normal.
    for (let i = 0; i < this.walls.length; i++) {
      const o = this.walls[i];
      if (o === w || o.c === w.c || o.gap > 0.24) continue;
      const d = o.nx * w.nx + o.nz * w.nz;
      if (d < 0.6 && d > -0.6) {
        nx += o.nx;
        nz += o.nz;
      }
    }
    const l = Math.hypot(nx, nz);
    if (l < 0.001) return { nx: w.nx, nz: w.nz };
    return { nx: nx / l, nz: nz / l };
  },

  // Would the player fit (with headroom) with its box centred here?
  spaceFree(x, y, z) {
    const floor = this.world && this.world.terrainHeight ? this.world.terrainHeight(x, z) : 0;
    if (y - P.HY < floor - 0.001) return false;
    const minY = y - P.HY;
    const maxY = y + P.HY + 0.5;
    const cols = this.colliders;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (x + P.HX <= c.minX || x - P.HX >= c.maxX) continue;
      if (maxY <= c.minY || minY >= c.maxY) continue;
      if (z + P.HZ <= c.minZ || z - P.HZ >= c.maxZ) continue;
      return false;
    }
    return true;
  },

  // ------------------------------------------------------------------
  // THE SLIDE'S TUCK, AND WHAT A SQUEEZE IS WORTH
  //
  // Pressing SHIFT into a gap has to be able to FIT, and then it has to be worth something. So a
  // slide does two things the rest of the moves do not: it thins the collision box (the `hx`/`hz`
  // getters, driven here), and it measures the corridor it is threading and feeds the slide its
  // speed (see `squeezeAt` / `updateSqueeze`, and the squeeze block in the slide case of `update`).
  // ------------------------------------------------------------------

  // How wide the body is this frame, as a fraction of its standing width. The tuck comes IN on its
  // own fast timer (you press SHIFT *at* the gap, so it cannot take a fifth of a second to arrive)
  // and eases back OUT only as far as the standing body actually FITS where it is — which is what
  // stops a slide that ends still inside a tight place from growing the box into the walls holding
  // it. `fitScale` is the constraint; the tuck itself is never limited by it, only the way out.
  // -------------------------------------------------------------------------
  // THE SLOPE (see "THE SLOPE" in README.md)
  //
  // The hills is a height field rather than a plane, and these three functions are the whole of what
  // the body knows about it: `readSlope` samples the field's gradient under the feet once a frame,
  // `slopeGate` spends it on what he is allowed to CLIMB, and `slopePull` spends it on what the deck
  // does to him when he is not climbing it. The gradient is a plain central difference of
  // `World.terrainHeight` — the same function the drawn deck and the body's own floor are built from
  // (see "THE HILLS" in world.js) — so the angle he leans at and the angle he is stopped by are the
  // angle of the ground he can see, by construction.
  //
  // Only the height field is read. A body standing on a BOX (a crate, the camp's own concrete, a
  // wall run's rock) is standing on something flat-topped, and the field under the box has nothing to
  // do with it: `feet - floor` is the test, and anything more than a foot's worth of clearance is a
  // body standing on authored geometry rather than on the deck.
  readSlope(dt) {
    const world = this.world;
    const x = this.pos.x;
    const z = this.pos.z;
    const feet = this.pos.y - P.HY;
    const floor = world && world.terrainHeight ? world.terrainHeight(x, z) : 0;
    if (Math.abs(feet - floor) > 0.35) {
      this.onSlope = false;
      this.slopeTan = 0;
      this.slopeGx = 0;
      this.slopeGz = 0;
      this.slopeCarry = Math.max(0, this.slopeCarry - P.SLOPE_CARRY_DECAY * dt);
      return;
    }
    const e = P.SLOPE_PROBE;
    const hR = world.terrainHeight(x + e, z);
    const hL = world.terrainHeight(x - e, z);
    const hU = world.terrainHeight(x, z + e);
    const hD = world.terrainHeight(x, z - e);
    const gx = (hR - hL) / (2 * e);
    const gz = (hU - hD) / (2 * e);
    this.slopeGx = gx;
    this.slopeGz = gz;
    this.slopeTan = Math.hypot(gx, gz);
    this.onSlope = true;
    // THE CARRIED SPEED. It is built on the ground he can RUN on and spent on the faces he can only
    // run UP. On walkable deck (below `SLOPE_HOLD_TAN`) it simply tracks the speed he is carrying; on
    // a steeper face it is NOT refreshed from the speed he manages while on it — that would make the
    // limit chase its own tail and let him crawl up any hill at the equilibrium — it only ticks down.
    // So the limit is a run-up: what you bring is what you get, and a couple of seconds of climbing
    // spends it.
    if (this.slopeTan <= P.SLOPE_HOLD_TAN) {
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > this.slopeCarry) this.slopeCarry = hs;
    }
    this.slopeCarry = Math.max(0, this.slopeCarry - P.SLOPE_CARRY_DECAY * dt);
  },

  // WHAT HE CAN CLIMB (the user's *"if hes running fast he can go to like the big 90 degree angel
  // slopes and above but if hes slow he cants"*). What is capped is the GRADE OF THE TRAVEL — the
  // height gained per unit travelled — and the cap is `SLOPE_HOLD_TAN + SLOPE_CLIMB_ENERGY * carry²`,
  // the flat 29 degrees a standing body already has (it can hold what it can stand on) up to the
  // vertical a sprint buys.
  //
  // It is solved in the slope's OWN basis rather than by shortening the velocity: with `a` the speed
  // along the uphill unit and `b` the speed along the contour, the grade is `a·t / √(a²+b²)`, and
  // shortening a velocity that is already straight up the gradient cannot change that ratio at all
  // (both scale) — which is exactly the trap that let a body with no momentum crawl up a 39-degree
  // face at the equilibrium. So `a` is the thing that is cut, to the largest value that satisfies the
  // cap: `a ≤ G·b / √(t²−G²)`. A body with ANY contour speed keeps it (it walks round the flank), and
  // a body pointed straight up the gradient has `b = 0`, so `a` is cut to nothing and it does not
  // move up the face at all.
  slopeGate() {
    if (!this.onSlope || this.slopeTan <= P.SLOPE_HOLD_TAN) return;
    const t = this.slopeTan;
    const G = P.SLOPE_HOLD_TAN + P.SLOPE_CLIMB_ENERGY * this.slopeCarry * this.slopeCarry;
    if (t <= G) return;
    const invT = 1 / t;
    const vx = this.vel.x;
    const vz = this.vel.z;
    const a = (vx * this.slopeGx + vz * this.slopeGz) * invT; // speed along the uphill unit
    if (a <= 0) return;
    const px = vx - a * this.slopeGx * invT; // ...and what is left on the contour
    const pz = vz - a * this.slopeGz * invT;
    const b = Math.hypot(px, pz);
    const aMax = (G * b) / Math.sqrt(t * t - G * G);
    if (a <= aMax) return;
    this.vel.x = px + aMax * this.slopeGx * invT;
    this.vel.z = pz + aMax * this.slopeGz * invT;
  },

  // ...and WHAT THE DECK DOES TO HIM. Past `SLOPE_HOLD_TAN` the ground is too steep to stand on, so
  // the HORIZONTAL part of gravity's along-slope pull is handed to the body, downhill:
  //
  //     a = g · sin(theta) · cos(theta)        (the horizontal component of g·sin(theta))
  //
  // which is why it is one force and not two. Climbing, it is the COST of the climb — it fights the
  // run's own 14 u/s² of drive, so 14 vs g·sin·cos decides what a body can walk up: they cross at
  // tan 0.55, i.e. the field's own 29 degrees, which is exactly `SLOPE_HOLD_TAN` (one number, because
  // the deck that cannot HOLD you is the deck you cannot WALK up). Standing, it is what slides him —
  // and what the surface can answer it with is a CEILING and not a wall (see `deckGrip`): past the
  // hold angle the two no longer cancel, so the body goes down the fall line, harder the steeper the
  // face is. Past that threshold, carrying speed up a hill is spending it
  // — which is the whole reason a run can take a flank a walk is stopped by, and the reason it does
  // not simply crawl up any of them at the equilibrium speed.
  slopePull(dt) {
    if (!this.onSlope || this.slopeTan <= P.SLOPE_HOLD_TAN) return;
    const t = this.slopeTan;
    const inv = 1 / Math.sqrt(1 + t * t);
    const sin = t * inv;
    const cos = inv;
    const a = P.GRAVITY * sin * cos * P.SLOPE_PULL * dt;
    const k = a / t;
    this.vel.x -= this.slopeGx * k;
    this.vel.z -= this.slopeGz * k;
  },

  // -------------------------------------------------------------------------
  // THE GRIP — what the surface under the feet can do to HOLD him (the user's *"didnt know the
  // player can stand on wall slopes (im being sarcastic) fix that please make it make sense"*).
  //
  // `slopePull` above is gravity, and gravity is not a brake: it is the same `g · sin(theta) ·
  // cos(theta)` whatever the deck is. What holds a standing body is FRICTION, and friction has a
  // ceiling — `mu · N`, with `mu` the world's own `SLOPE_HOLD_TAN` (that is what makes the hold
  // angle the hold angle: the grade where the pull first beats the grip is exactly `tan(theta) =
  // mu`). So the deck has exactly two things it can do to a body standing on it, and which one is
  // the deck's own grade and nothing else:
  //
  //   - IT CAN HOLD HIM (grade at or under the hold angle): the standing brake, whole — what
  //     `applyFriction` has always been, and `slopePull` returns before it has touched anything.
  //   - IT CANNOT (past it): the grip of a body already SLIDING — `SLOPE_HOLD_TAN · g · cos²(theta)`
  //     (u/s²), which is the horizontal part of mu·N on a slope, taken off the motion along the
  //     velocity and never past it.
  //
  // That pair is the whole fix, and it is a fix because of what the standing brake is: it is a
  // *static* friction with no idea a slope exists — a velocity brake with a floor (`applyFriction`
  // takes a share of the speed and is at least `3.5 u/s` of it, i.e. 33 u/s² at a standstill) that
  // answers any pull under 16.5 u/s² — and `g · sin · cos` peaks at 16.5 and only ever at 45
  // degrees. So the deck could hold a body on ANY grade the field could roll, and — this is the
  // part the user is looking at — the *steeper* the face, the more completely it held him: the
  // pull the face gave him falls away past 45 degrees while the brake does not, until on a
  // near-vertical wall there is nothing left but the brake. Measured on the live page, standing on
  // a synthetic constant flank with no input at all for 3 s (distance travelled / speed at the
  // end): **35 deg 0.78 u / 0.26 u/s, 45 deg 0.83 u / 0.275 u/s, 55 deg 0.78 u / 0.26, 63 deg
  // 0.66 u / 0.22, 72 deg 0.50 u / 0.165, 79 deg 0.32 u / 0.106, 84 deg 0.16 u / 0.054** — the
  // speed halves between 45 and 84 degrees, and on the running field's own steepest flank (the
  // BLISS shoulder at tan 0.99, 44.7 degrees) two seconds of standing moved him **0.55 u**, i.e.
  // 0.275 u/s, which on the HUD is a body standing still. On deck at or under the hold angle the
  // same test moved him exactly **0.000 u**, which is what the hold angle is FOR.
  //
  // ...and the deck's grip is the same number in both roles on purpose (one coefficient, one
  // friction angle): at the hold angle the two cancel to nothing, which is why nothing a body does
  // on walkable deck changes at all here, and above it the net is `g · cos(theta) · (sin(theta) −
  // mu · cos(theta))` — 0.33 u/s² at 29 degrees, 3.3 at 35, 7.3 at 45, 9.7 at 56 — so the deck
  // takes a body it cannot hold *gently* the moment he steps past the hold angle and harder the
  // steeper the face is, which is what a body on a hill actually does. `SLOPE_PULL` scales both
  // halves, so the tune still has one knob.
  //
  // Nothing else moves: the pull itself is untouched (so the cost of a climb, and the speed a slide
  // BUILDS down a flank, are exactly what they were — a slide is not asking this function for
  // anything), and the grip is applied where the *deck is being stood on* and not where a move is
  // driving the feet (a body driving up a face is pushing against the deck and the pull is its
  // price, already paid — see the ground and block cases of `update`).
  deckGrip(dt) {
    const t = this.onSlope ? this.slopeTan : 0;
    if (t <= P.SLOPE_HOLD_TAN) {
      applyFriction(this.vel, P.GROUND_FRICTION, dt);
      return;
    }
    const inv = 1 / Math.sqrt(1 + t * t);
    bleedSpeed(this.vel, P.SLOPE_HOLD_TAN * P.GRAVITY * inv * inv * P.SLOPE_PULL, dt);
  },

  updateBox(dt) {
    const tuck = 1 - P.SLIDE_SHRINK;
    if (this.state === "slide") {
      if (this.boxScale > tuck) {
        this.boxScale = Math.max(tuck, this.boxScale - (P.SLIDE_SHRINK * dt) / P.SLIDE_THIN_IN);
      }
    } else if (this.boxScale < 1) {
      const grow = this.boxScale + (P.SLIDE_SHRINK * dt) / P.SLIDE_THIN_OUT;
      this.boxScale = Math.min(1, this.fitScale(), grow);
    }
  },

  // The largest the body could be where it stands right now, as a fraction of the standing box
  // (1 when the standing box fits). Per collider it is the scale at which the box is exactly flush
  // with the nearer face, so the answer is the smallest of those. Read off the colliders this frame
  // — a frame stale at the top of `update`, which is all `updateBox` needs.
  fitScale() {
    const cols = this.colliders;
    const x = this.pos.x;
    const z = this.pos.z;
    const minY = this.pos.y - P.HY;
    const maxY = this.pos.y + P.HY;
    let s = 1;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (maxY <= c.minY || minY >= c.maxY) continue;
      const ex = Math.max((c.minX - x) / P.HX, (x - c.maxX) / P.HX);
      const ez = Math.max((c.minZ - z) / P.HZ, (z - c.maxZ) / P.HZ);
      const allow = ex > ez ? ex : ez;
      if (allow < s) s = allow;
    }
    return s < 0 ? 0 : s;
  },

  // How squeezed the body is, 0 (open ground) .. 1 (filling the gap), from the corridor across the
  // line of travel `(dx, dz)`: the nearest face on the left of the line plus the nearest on the
  // right — which IS the width of the corridor, and is only ever small when there is something
  // close on BOTH sides (a side with nothing within reach is open, so sliding along one wall in the
  // open never registers). Only faces BESIDE the line count: a wall dead ahead is one you are about
  // to hit, not a gap you are threading, so colliders that do not overlap the body along the line
  // of travel are skipped. The two contact points are left on `sqA`/`sqB` for the grit the squeeze
  // throws off the walls (see main.js); `act` is false for a side that is open.
  squeezeAt(dx, dz) {
    const px = -dz;
    const pz = dx;
    const x = this.pos.x;
    const z = this.pos.z;
    const pc = x * px + z * pz;
    const fc0 = x * dx + z * dz;
    const fwd = Math.abs(dx) * P.HX + Math.abs(dz) * P.HZ;
    const minY = this.pos.y - P.HY;
    const maxY = this.pos.y + P.HY;
    const cols = this.colliders;
    const A = this.sqA;
    const B = this.sqB;
    let a = Infinity;
    let b = Infinity;
    A.act = false;
    B.act = false;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (maxY <= c.minY || minY >= c.maxY) continue;
      const chx = (c.maxX - c.minX) * 0.5;
      const chz = (c.maxZ - c.minZ) * 0.5;
      const ccx = c.minX + chx;
      const ccz = c.minZ + chz;
      const fc = ccx * dx + ccz * dz - fc0;
      const fh = Math.abs(dx) * chx + Math.abs(dz) * chz;
      if (fc - fh >= fwd || fc + fh <= -fwd) continue;
      const qc = ccx * px + ccz * pz - pc;
      const qh = Math.abs(px) * chx + Math.abs(pz) * chz;
      const lo = qc - qh;
      const hi = qc + qh;
      if (hi <= 0) {
        if (-hi < a) {
          a = -hi;
          A.act = true;
          A.x = x + px * hi;
          A.y = this.pos.y - P.HY + 0.12;
          A.z = z + pz * hi;
        }
      } else if (lo >= 0) {
        if (lo < b) {
          b = lo;
          B.act = true;
          B.x = x + px * lo;
          B.y = this.pos.y - P.HY + 0.12;
          B.z = z + pz * lo;
        }
      } else {
        // The line of travel itself is inside something. That cannot happen to a body the world has
        // already resolved, so it is not a squeeze — refuse it rather than claim the tightest one.
        return 0;
      }
    }
    if (a === Infinity || b === Infinity) return 0;
    const t = (P.SLIDE_NARROW_W - (a + b)) / (P.SLIDE_NARROW_W - P.SLIDE_NARROW_TIGHT);
    return t < 0 ? 0 : t > 1 ? 1 : t;
  },

  // The squeeze's own frame: track the corridor (only while a slide is live — everywhere else the
  // body is not showing its thin side and the reading is not meaningful), and hand the body the
  // shove when it lets go. The steady payoff is NOT here: the slide case in `update` spends
  // `this.squeeze` as acceleration along its line, capped at MAX_SPEED like every other gain.
  updateSqueeze(dt) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const raw = this.state === "slide" && sp > 0.05 ? this.squeezeAt(this.vel.x / sp, this.vel.z / sp) : 0;
    this.squeeze += (raw - this.squeeze) * Math.min(1, dt / P.SLIDE_SQUEEZE_FADE);
    if (raw > 0.3) {
      if (!this.squeezing) {
        this.squeezing = true;
        if (this.sfx) this.sfx.squeeze();
        this.events.push("squeeze");
      }
      this.squeezeHold += dt;
    } else if (raw < 0.15) {
      this.squeezing = false;
      if (this.squeezeHold > P.SLIDE_SQUEEZE_HOLD) {
        // The gap let go, and the speed it built goes with you: a thread long enough to count ends
        // in a shove, so a tight place spits you out faster than you went in. Same ceiling as
        // everything else, so it cannot break MAX_SPEED.
        const s2 = Math.hypot(this.vel.x, this.vel.z);
        if (s2 > 0.05) {
          const target = Math.min(P.MAX_SPEED, s2 + P.SLIDE_SQUEEZE_ESCAPE * Math.min(1, this.squeezeHold / 0.5));
          const k = target / s2;
          this.vel.x *= k;
          this.vel.z *= k;
        }
        this.events.push("squeezeout");
      }
      this.squeezeHold = 0;
    }
  },
  // THE FRAME'S WORLD READ (lifted from the top of `update`): the body's own box for the frame
  // (`updateBox`, which needs the state as it stood last frame), the collider query around it, and
  // `this.colliders` pointing at that buffer — everything the rest of the frame's collision, wall,
  // slope and squeeze reads are made against.
  readWorld(dt) {
    const world = this.world;
    // The body's own width for this frame, before anything queries the world with it: a slide
    // tucks the box in, and a slide that has ended only grows back as far as it fits (see
    // `updateBox`). It reads `this.state`, which is still last frame's here, and the colliders the
    // last frame's query left behind — a frame of latency on a 60ms ramp, and it buys the box being
    // the same width for the query, the move and everything in between.
    this.updateBox(dt);
    this.qbuf.length = 0;
    world.queryXZ(
      this.pos.x - P.HX - 3,
      this.pos.z - P.HZ - 3,
      this.pos.x + P.HX + 3,
      this.pos.z + P.HZ + 3,
      this.qbuf
    );
    this.colliders = this.qbuf;
  },
};

export function installPhysics(Player) {
  Object.assign(Player.prototype, physicsMethods);
}
