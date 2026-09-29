// ---------------------------------------------------------------------------
// SHARED MATH (part of the player.js split).
//
// `approach` — the rate-limited step toward a target — is used on essentially every
// blended weight in player.js, `TAU` beside it, and `wrapPi` wherever a heading is
// wrapped into (-PI, PI]. They live here rather than in player.js so a piece split
// OUT of player.js (player/pole.js, player/grab.js) can import them without a
// circular import back into the class file.
// ---------------------------------------------------------------------------
export const TAU = Math.PI * 2;

export function approach(cur, want, maxStep) {
  const d = want - cur;
  if (d > maxStep) return cur + maxStep;
  if (d < -maxStep) return cur - maxStep;
  return want;
}

// Loop-free angle wrap. The old code used `while (diff > PI) diff -= TAU`, which never
// terminates if `diff` is ever non-finite, and visibly stalls on absurd values.
export function wrapPi(a) {
  return a - TAU * Math.floor((a + Math.PI) / TAU);
}

// smoothstep, locally: `player.js` owns the RIG's own curves (the pose file has its own `poseEase`).
export function smooth01(k) {
  const t = k <= 0 ? 0 : k >= 1 ? 1 : k;
  return t * t * (3 - 2 * t);
}

// Swing a LINE (a unit x/z heading) toward the heading `atan2(tx, tz)` at `rate` rad/s, and hand
// the result back on a shared scratch (so the per-frame call allocates nothing). This is the turn
// a slide makes and the one the backdash makes (see `SLIDE_TURN` / `P.BACK_STEER`): the caller
// keeps its own speed and only the heading is re-aimed, which is why a steered line can never
// out-earn the speed cap — direction is what steering changes, and nothing else.
const _swing = { x: 0, z: 0 };
export function swingTowards(x, z, tx, tz, rate, dt) {
  const cur = Math.atan2(x, z);
  const tgt = Math.atan2(tx, tz);
  const yaw = cur + wrapPi(tgt - cur) * Math.min(1, rate * dt);
  _swing.x = Math.sin(yaw);
  _swing.z = Math.cos(yaw);
  return _swing;
}
