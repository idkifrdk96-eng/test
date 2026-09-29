// ---------------------------------------------------------------------------
// Part 23 of the `player.js` split: THE FALL.
//
// The pure fall math, moved out of the top of `player.js`:
//   - `impactFromDrop` — how hard a landing reads (0..1) from the height fallen.
//   - `fallWeights` / `pickFallKind` — which fall shape the body wears: the SMART
//     weighting by the situation plus the RANDOM weighted roll, and never the same
//     shape twice in a row.
//
// These are plain FUNCTIONS (not `Player` methods), so they are exported directly and
// `player.js` imports them back — there is no `install*` here. `pickFallKind` calls
// `fallWeights` locally.
//
// Deps: `P` from ./config.js. Nothing else.
// ---------------------------------------------------------------------------
import { P } from "./config.js";

// How hard a landing reads, 0..1, from the height actually fallen (`drop`). Below
// DROP_IMPACT_MIN it is exactly 0 — that is the "close to the ground, so no impact" case,
// and it falls out of the same number rather than needing its own branch — and it reaches 1
// at DROP_IMPACT_MAX.
export function impactFromDrop(drop) {
  const t = (drop - P.DROP_IMPACT_MIN) / (P.DROP_IMPACT_MAX - P.DROP_IMPACT_MIN);
  return Math.max(0, Math.min(1, t));
}

// --------------------------------------------------------------------------------------------
// WHICH SHAPE A FALL WEARS (see `FALL_KINDS` in streetwear.js).
//
// The request was for a fall "like the films", with variants, "some random, some smart". So the
// pick is two things stacked, and the split is deliberate:
//
//   SMART — the WEIGHTS. Each shape is weighted by the situation the fall is happening in, and a
//   weight of 0 rules it out entirely. A fall you are STEERING, fast, down a long line is a
//   head-first dive, because the body follows the line it is flying (that is what makes a dive
//   read as intent rather than as falling over). A long fall with the hands off the sticks is an
//   arch or a star, because riding the air is what a body does when it is not aiming through it.
//   A drop off a low roof, or a fall being braked, is feet-first, because that is a descent you
//   are choosing. Nothing here is a coin toss dressed up as a decision: every weight is a
//   property of the fall itself, and the same fall twice gives the same set of candidates.
//
//   RANDOM — the ROLL. Among the candidates that earned a weight, the pick is a weighted roll of
//   the dice, so two identical falls still wear different shapes. The two flourishes (the
//   punch-down and the flail) are mostly in the pool for this: they are the shapes that make a
//   fall look alive rather than procedural, and they are weighted so a long fall can show off and
//   a short one does not.
//
// ...and the same shape never plays twice in a row (`prev`), the way the jump and kick variants
// already work. The whole thing is pure, so it can be swept from the live page.
// --------------------------------------------------------------------------------------------
export function fallWeights(c) {
  const big = c.drop > 40;      // "this is going to take a while"
  const mid = c.drop > 22;      // "roof, not kerb"
  const fast = c.spd > 9;       // carrying real horizontal speed
  const still = c.spd < 4;      // ...or dropping almost straight down
  const w = {};
  // Aiming through the air: fast and steered, or simply a very long way down.
  w.aim = (fast && c.steer ? 3.2 : 0.7) + (big ? 1.5 : 0) + (still ? -0.5 : 0);
  // Riding it: hands off, a long way down.
  w.arch = (c.steer ? 0.5 : big ? 3.2 : mid ? 1.6 : 0.6) + (c.brake ? 1.0 : 0);
  // The showier arch: dead flat, limbs wide, no steering, plenty of air.
  w.spread = big && !c.steer ? 1.9 : mid && !c.steer ? 0.9 : 0.3;
  // A descent you are choosing: a moderate drop, a slow drop, or one being braked into.
  w.upright = (mid && !big ? 2.6 : 0.5) + (c.brake ? 2.0 : 0) + (still ? 1.4 : 0);
  // The flourishes.
  w.hero = big ? 1.3 : 0.4;
  w.flail = c.drop > 16 && c.drop < 55 ? 1.0 : 0.2;
  return w;
}

export function pickFallKind(ctx, prev) {
  const w = fallWeights(ctx);
  if (prev && w[prev] !== undefined) w[prev] = 0;
  let total = 0;
  for (const k in w) if (w[k] > 0) total += w[k];
  // Nothing earned a weight (every candidate ruled out, which the numbers above do not actually
  // allow): fall back to the shape the situation most suggests rather than to nothing.
  if (total <= 0) return prev === "arch" ? "spread" : "arch";
  const r = Math.random() * total;
  let acc = 0;
  for (const k in w) {
    if (w[k] <= 0) continue;
    acc += w[k];
    if (r <= acc) return k;
  }
  return "arch";
}
