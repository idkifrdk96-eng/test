// ---------------------------------------------------------------------------
// Part 27 of the `player.js` split: THE FRAME GUARD.
//
// Moved here from the top of `Player.update`: the NaN / out-of-world safety net. It runs before any
// world query, and if the position or velocity has gone non-finite — or the body has been flung past
// a sane bound — it puts the body back on its spawn and reports `true` so `update` can bail out of the
// frame. A huge coordinate turns the chunk scans in world.js into effectively infinite loops, so this
// has to run before them.
//
// Deps: NOTHING — a true leaf.
// ---------------------------------------------------------------------------

const guardMethods = {
  // Safety net: never let a bad number escape into the world/collision queries, where a
  // huge coordinate turns the chunk scans in world.js into effectively infinite loops.
  // Returns `true` if it had to recover (and the caller must then `return`), else `false`.
  recoverGuard() {
    if (
      !isFinite(this.pos.x) ||
      !isFinite(this.pos.y) ||
      !isFinite(this.pos.z) ||
      !isFinite(this.vel.x) ||
      !isFinite(this.vel.y) ||
      !isFinite(this.vel.z) ||
      Math.abs(this.pos.x) > 1e6 ||
      Math.abs(this.pos.z) > 1e6 ||
      this.pos.y < -500 ||
      this.pos.y > 1e5
    ) {
      const wasBad = !isFinite(this.pos.x) || !isFinite(this.pos.y) || !isFinite(this.pos.z);
      this.pos.copy(this.spawn);
      this.pos.y = this.spawn.y + 1;
      this.vel.set(0, 0, 0);
      this.prevGrounded = false;
      this.grounded = false;
      this.state = "air";
      this.stateTime = 0;
      this.events.push(wasBad ? "recoverNaN" : "recoverFar");
      return true;
    }
    return false;
  },
};

export function installGuard(Player) {
  Object.assign(Player.prototype, guardMethods);
}
