// ---------------------------------------------------------------------------
// THE BODY AGAINST THE WALL (part 13 of the player.js split).
//
// The collision core the rest of the movement is built on: the sweep-and-resolve
// that walks a frame in sub-steps (`moveAndCollide`), the one-axis resolve it
// calls (`moveAxis`) and the stair-step it offers a low obstacle (`tryStep`) —
// three methods, verbatim, in a table `installMove` copies onto
// `Player.prototype`. `tryStep` and `moveAxis` both read `this.overlaps` and
// `this.hx`/`this.hz`, which live in `player/physics.js` and on the class, so
// nothing here imports back.
//
// The 1.5 mm separation `EPS` moved with them (it was only ever read by
// `moveAxis`) — the world is a heap of boxes and every resolve has to leave the
// body OUTSIDE the one it just hit.
//
// A LEAF with respect to player.js: it imports `P` (player/config.js). No scratch,
// no three.js.
// ---------------------------------------------------------------------------
import { P } from "./config.js";

const EPS = 0.0015;

const moveMethods = {

  tryStep(c) {
    const lift = c.maxY - (this.pos.y - P.HY);
    if (lift <= 0.02 || lift > P.STEP) return false;
    const oldY = this.pos.y;
    this.pos.y = c.maxY + P.HY + 0.002;
    if (this.pos.y - P.HY < -0.001) {
      this.pos.y = oldY;
      return false;
    }
    for (let i = 0; i < this.colliders.length; i++) {
      const o = this.colliders[i];
      if (o === c) continue;
      if (this.overlaps(o)) {
        this.pos.y = oldY;
        return false;
      }
    }
    return true;
  },

  moveAxis(axis, d) {
    if (d === 0) return;
    this.pos[axis] += d;
    const cols = this.colliders;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!this.overlaps(c)) continue;
      if (axis === "y") {
        if (d > 0) {
          this.pos.y = c.minY - P.HY - EPS;
          if (this.vel.y > 0) this.vel.y = 0;
        } else {
          this.pos.y = c.maxY + P.HY + EPS;
          if (this.vel.y < 0) this.vel.y = 0;
          this.grounded = true;
        }
        continue;
      }
      if (this.prevGrounded && d !== 0 && this.tryStep(c)) continue;
      if (axis === "x") {
        this.pos.x = d > 0 ? c.minX - this.hx - EPS : c.maxX + this.hx + EPS;
        this.vel.x = 0;
      } else {
        this.pos.z = d > 0 ? c.minZ - this.hz - EPS : c.maxZ + this.hz + EPS;
        this.vel.z = 0;
      }
    }
    if (axis === "y") {
      // The floor is not the flat plane at 0 any more: it is whatever the ground has been
      // beaten down to here (see destruction.js). Everywhere else `terrainHeight` is 0, which
      // is exactly the old clamp.
      const floor = this.world && this.world.terrainHeight ? this.world.terrainHeight(this.pos.x, this.pos.z) : 0;
      if (this.pos.y - P.HY < floor) {
        this.pos.y = floor + P.HY;
        if (this.vel.y < 0) this.vel.y = 0;
        this.grounded = true;
      }
    }
  },

  moveAndCollide(dt) {
    this.grounded = false;
    const dx = this.vel.x * dt;
    const dy = this.vel.y * dt;
    const dz = this.vel.z * dt;
    const maxComp = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const n = Math.min(12, Math.max(1, Math.ceil(maxComp / 0.2)));
    const sx = dx / n;
    const sy = dy / n;
    const sz = dz / n;
    for (let i = 0; i < n; i++) {
      this.moveAxis("x", sx);
      this.moveAxis("z", sz);
      this.moveAxis("y", sy);
    }
    // ---- THE GROUND STICK (see "THE SLOPE") ----
    // A body following a slope DOWNWARD is airborne for a frame: the deck falls away faster than
    // gravity can pull the feet into it, so the floor test finds nothing under them and `grounded`
    // goes false — and the state machine reads that as a body that has left the ground, which is
    // what cancelled the slide the instant it met a hill (*"every time i slide on a slope it gets
    // cancelled instantly"*). So a body that WAS on the deck last frame, is not falling fast, and
    // has the deck within the drop the slope owes at the speed it is carrying is put back on it.
    // The allowance is the slope's own drop per frame plus a foot's grace, so a sprint down a 44
    // degree flank sticks exactly as well as a walk does, a step-down still steps, and walking off
    // anything taller still falls.
    if (!this.grounded && this.prevGrounded && this.vel.y <= 0.35) {
      const floor = this.world && this.world.terrainHeight ? this.world.terrainHeight(this.pos.x, this.pos.z) : 0;
      const gap = this.pos.y - P.HY - floor;
      const snap = P.SLOPE_SNAP_BASE + (this.board ? P.BOARD_STICK : 0) +
        Math.hypot(this.vel.x, this.vel.z) * dt * this.slopeTan;
      if (gap > 0 && gap <= snap) {
        this.pos.y = floor + P.HY;
        if (this.vel.y < 0) this.vel.y = 0;
        this.grounded = true;
      }
    }
  },
};

export function installMove(Player) {
  Object.assign(Player.prototype, moveMethods);
}
