// ---------------------------------------------------------------------------
// THE WISH (part 49 of the player.js split).
//
// How the frame's STICK becomes a world-space line: the camera's own basis (sin/cos of
// `camYaw`), the two touch/key axes into it, the dead zone and the normalisation — plus
// `wishX`/`wishZ` left on the body for the things that fire outside the input frame (the
// dash reads them). `update` calls it once, near the top, and destructures the five readings
// out: `const { sin, cos, wx, wz, hasWish } = this.tickWish(inp);` — they are the frame's own
// wish and the camera basis half the state machine is built on. No deps at all (a true leaf):
// it reads `camYaw` and the input object, and nothing else.
// ---------------------------------------------------------------------------
const wishMethods = {

  tickWish(inp) {
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    let wx = -sin * inp.moveZ + cos * inp.moveX;
    let wz = -cos * inp.moveZ - sin * inp.moveX;
    const wl = Math.hypot(wx, wz);
    const hasWish = wl > 0.02;
    if (hasWish) {
      wx /= wl;
      wz /= wl;
    } else {
      wx = 0;
      wz = 0;
    }
    // ...left where the movement put it, because a skill press arrives outside the input frame (the
    // dash fires along this — see `dash`).
    this.wishX = wx;
    this.wishZ = wz;

    return { sin, cos, wx, wz, hasWish };
  },
};

export function installWish(Player) {
  Object.assign(Player.prototype, wishMethods);
}
