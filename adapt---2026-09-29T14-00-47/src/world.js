import * as THREE from "./three.js";
import { rngFor, randInt, pick, chance, pickWeighted, fbm2, hashInt } from "./rng.js";
import { buildBoxGeometry, buildGroundGrid } from "./geom.js";
import { createMaterial, createGroundTexture, createGrassTexture, settings } from "./ps1.js";
import { cellOf, cellSlot, cellTotal, gridOf, pieceOf, slotOf } from "./voxel.js";
import { buildYard, YARD_CLEAR } from "./yard.js";

export const CHUNK = 32;
// The ground is a regular grid of this many cells per chunk, so its cell size is CHUNK/this and
// its vertices land on integer world coordinates. `Destruction.groundHeightAt` reproduces the
// mesh's own linear interpolation from these two numbers, which is how a decal can be laid on
// the ground the player actually sees instead of on the smooth height field behind it.
export const GROUND_CELLS = 32;
const CELL = 8;
const CELLS = CHUNK / CELL;
const MAXH = 30;
const SEED = 20260920;
// Ground tessellation, in cells per chunk. Coarse (8 -> 4-unit cells, the original) is cheap
// but cannot show a crater: a hit lands between vertices and nothing moves. 32 puts a vertex
// every unit, which is what lets the destruction pass sink a bowl you can see the inside of —
// the crater is a genuine hole in the geometry, not a dark decal, and 1-unit vertices are still
// chunky enough for the PS1 look. (Measured: a chunk rebuild is ~2.5 ms at this density.)
// (GROUND_CELLS itself is declared above, next to CHUNK, because destruction.js needs it too.)

const BIOMES = [
  {
    name: "MEADOW",
    density: 0.3,
    fogNear: 50,
    fogFar: 124,
    ground: [0.53, 0.6, 0.4],
    sky: [0.42, 0.6, 0.85],
    horizon: [0.8, 0.83, 0.72],
    fog: [0.78, 0.82, 0.71],
    palette: [
      [0.62, 0.64, 0.58], [0.7, 0.66, 0.54],
      [0.55, 0.6, 0.5], [0.66, 0.58, 0.48],
    ],
    weights: { pillars: 3, blocks: 4, slabRun: 2, terraces: 1, tower: 1, wallLedge: 1, stairs: 1, arch: 1, bigWall: 4 },
  },
  {
    name: "CITY",
    density: 0.52,
    fogNear: 38,
    fogFar: 108,
    ground: [0.42, 0.44, 0.5],
    sky: [0.29, 0.33, 0.5],
    horizon: [0.62, 0.58, 0.64],
    fog: [0.58, 0.56, 0.62],
    palette: [
      [0.55, 0.56, 0.62], [0.47, 0.5, 0.58],
      [0.63, 0.59, 0.53], [0.4, 0.42, 0.49],
    ],
    weights: { tower: 5, wallCorridor: 3, wallLedge: 2, terraces: 2, arch: 2, blocks: 1, bigWall: 5 },
  },
  {
    name: "CANYON",
    density: 0.42,
    fogNear: 55,
    fogFar: 138,
    ground: [0.68, 0.52, 0.36],
    sky: [0.3, 0.46, 0.72],
    horizon: [0.9, 0.74, 0.53],
    fog: [0.87, 0.72, 0.53],
    palette: [
      [0.74, 0.49, 0.33], [0.66, 0.42, 0.29],
      [0.8, 0.6, 0.39], [0.58, 0.38, 0.27],
    ],
    weights: { pillars: 5, spire: 2, stairs: 2, wallCorridor: 2, slabRun: 2, blocks: 1, bigWall: 4 },
  },
  {
    name: "FROST",
    density: 0.36,
    fogNear: 36,
    fogFar: 112,
    ground: [0.72, 0.78, 0.84],
    sky: [0.55, 0.68, 0.88],
    horizon: [0.88, 0.92, 0.96],
    fog: [0.87, 0.92, 0.96],
    palette: [
      [0.72, 0.78, 0.86], [0.62, 0.7, 0.8],
      [0.8, 0.84, 0.89], [0.55, 0.62, 0.74],
    ],
    weights: { pillars: 2, slabRun: 4, wallCorridor: 3, spire: 2, terraces: 2, blocks: 2, bigWall: 3 },
  },
  {
    name: "RUINS",
    density: 0.46,
    fogNear: 44,
    fogFar: 122,
    ground: [0.48, 0.5, 0.44],
    sky: [0.4, 0.44, 0.6],
    horizon: [0.71, 0.71, 0.63],
    fog: [0.67, 0.68, 0.61],
    palette: [
      [0.57, 0.55, 0.49], [0.63, 0.59, 0.51],
      [0.46, 0.49, 0.45], [0.67, 0.61, 0.49],
    ],
    weights: { blocks: 4, arch: 3, wallLedge: 3, terraces: 2, tower: 2, stairs: 2, bigWall: 4 },
  },
];

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const BS = 300;
const BIOME_OFF_X = -31;
const BIOME_OFF_Z = -7;

function biomeCellIndex(cx, cz) {
  return hashInt(cx + BIOME_OFF_X, cz + BIOME_OFF_Z, 4231) % BIOMES.length;
}

function biomeCorners(x, z) {
  const fx = x / BS - 0.5;
  const fz = z / BS - 0.5;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = fx - x0;
  const tz = fz - z0;
  const u = tx * tx * (3 - 2 * tx);
  const v = tz * tz * (3 - 2 * tz);
  const i00 = biomeCellIndex(x0, z0);
  const i10 = biomeCellIndex(x0 + 1, z0);
  const i01 = biomeCellIndex(x0, z0 + 1);
  const i11 = biomeCellIndex(x0 + 1, z0 + 1);
  const w00 = (1 - u) * (1 - v);
  const w10 = u * (1 - v);
  const w01 = (1 - u) * v;
  const w11 = u * v;
  let bi = 0;
  let bw = -1;
  const cand = [i00, i10, i01, i11];
  const wts = [w00, w10, w01, w11];
  for (let i = 0; i < 4; i++) {
    if (wts[i] > bw) {
      bw = wts[i];
      bi = cand[i];
    }
  }
  return { cand, wts, dominant: bi };
}

function blendBiomeField(x, z, key) {
  const c = biomeCorners(x, z);
  let out = null;
  for (let i = 0; i < 4; i++) {
    const w = c.wts[i];
    if (w <= 0.0001) continue;
    const v = BIOMES[c.cand[i]][key];
    if (!out) out = [v[0] * w, v[1] * w, v[2] * w];
    else {
      out[0] += v[0] * w;
      out[1] += v[1] * w;
      out[2] += v[2] * w;
    }
  }
  return out || [0.5, 0.5, 0.5];
}

function blendBiomeNum(x, z, key) {
  const c = biomeCorners(x, z);
  let s = 0;
  let n = 0;
  for (let i = 0; i < 4; i++) {
    const w = c.wts[i];
    if (w <= 0.0001) continue;
    s += BIOMES[c.cand[i]][key] * w;
    n += w;
  }
  return n ? s / n : 0;
}

export function biomeAtPoint(x, z) {
  // The hills world is ONE look from edge to edge rather than a rolling mix of the five biome
  // entries, so it answers with a constant (see BLISS below) instead of sampling the field —
  // and so does the skatepark (see PARK_LOOK), for the same reason.
  if (settings.world === "hills") return BLISS;
  if (settings.world === "park") return PARK_LOOK;
  const c = biomeCorners(x, z);
  return {
    name: BIOMES[c.dominant].name,
    fogNear: blendBiomeNum(x, z, "fogNear"),
    fogFar: blendBiomeNum(x, z, "fogFar"),
    fog: blendBiomeField(x, z, "fog"),
    sky: blendBiomeField(x, z, "sky"),
    horizon: blendBiomeField(x, z, "horizon"),
  };
}

export function biomeDominant(x, z) {
  return BIOMES[biomeCorners(x, z).dominant];
}

// ---------------------------------------------------------------------------
// THE HILLS — the "BLISS" world (selected by `settings.world`, see "THE HILLS" in README.md)
//
// The user's brief: *"add a new map that looks like windows xp background all of it is smooth
// terrain and stuff and add moveable grass and make sure it doesnt kill performance and make the
// player spawn on a high hill"*. So this map has no structures in it at all. It is a single
// smooth height field, green to the haze, and the SPAWN is its summit.
//
// ...and since session 132 it has no SCENERY either (the user's *"remove the trees and rock and
// bushes in the bliss hills map and add more grass i want the entire feild to be grass"*): the
// generator writes nothing onto the box list at all, so every chunk of this map outside the camp
// below is the height field and the grass standing on it. See "THE HILLS HAS NO SCENERY AT ALL",
// further down, and "THE SLOPE" in README.md for what the body does with a map that is all slope.
//
// THE SUMMIT IS THE CAMP. Everything the other two worlds guarantee about the spawn — the whole
// training ground, the arena's wall and rails, the landmark monolith and its launch pad — is
// authored at y = 0, so the one piece of the map that has to stay flat is the patch the camp
// stands on. Making that patch the TOP of the hill costs nothing and buys the brief exactly:
// `groundBaseAt` is 0 across it, the field falls away from its edge, and the body therefore
// starts on the highest point of its own map with every other hill below it.
//
// So the shape is one radial shoulder: the distance out of a squashed circle around the camp,
// through a smoothstep (so the flat top meets the slope with no crease at all), plus an fbm field
// faded IN by that same blend — the summit is dead level and the undulation only ever belongs to
// the flanks and the valleys. That one multiply is the whole difference between a hilltop and a
// landscape.
export const HILLS = {
  coreX: -4,           // the flat top's centre: the middle of the camp's own bounding box...
  coreZ: -3,           // ...(the yard reaches x 22 / z 24, the monolith x -30 / z -30)
  core: 44,            // ...and its radius — big enough that every authored box is level ground
  fall: 48,            // world units of run-off before the field is at its own base level
  depth: 18,           // how far the valley floor sits below the summit
  noiseScale: 1 / 48,  // the undulation's wavelength
  noiseAmp: 11,        // ...and how far it can swing the flanks
  seed: 5150,
};

// The one biome this world wears: the Windows XP frame. It is deliberately NOT an entry in
// `BIOMES` — that table is blended across the whole map, and this world is one look everywhere.
// `fog` and `horizon` are the same pale blue on purpose: only `viewDistance` chunks of ground are
// ever streamed, so the last of the terrain has to dissolve into exactly the colour the sky's own
// horizon wears or the rim of the map reads as a seam. Measured at the summit: the drawn ground
// runs to 128 units and the haze is total at 120.
const BLISS = {
  name: "BLISS",
  fogNear: 58,
  fogFar: 120,
  ground: [0.40, 0.62, 0.44],
  sky: [0.20, 0.44, 0.94],
  horizon: [0.70, 0.85, 1.0],
  fog: [0.72, 0.85, 0.98],
};

// How far the field has fallen from the summit at a point: 0 on the flat top, 1 once the noise has
// it completely. A squashed CIRCLE rather than a rectangle, so the shoulder curves all the way
// round instead of leaving four straight creases running down the hill.
function hillFalloff(x, z) {
  const dx = (x - HILLS.coreX) / HILLS.core;
  const dz = (z - HILLS.coreZ) / HILLS.core;
  const s = Math.hypot(dx, dz);
  if (s <= 1) return 0;
  const t = Math.min(1, ((s - 1) * HILLS.core) / HILLS.fall);
  return t * t * (3 - 2 * t);
}

// THE GROUND'S OWN HEIGHT in this world, and the only definition of it: the drawn mesh
// (`buildGroundGrid`), the body's floor (`World.terrainHeight`) and the craters dug into it all
// read this one function, so they cannot disagree about where the deck is. It is exactly 0 in the
// other two worlds, which is why nothing else in the game has to know this one exists.
//
// ...AND SINCE SESSION 206 IT IS THE SWITCH FOR THE THIRD ONE TOO: the SKATEPARK is the other map
// that is a real landscape rather than a plane with things standing on it, so it is asked here
// exactly the way the hills is (see "THE SKATEPARK" below for what it answers).
export function groundBaseAt(x, z) {
  if (settings.world === "hills") return hillsBase(x, z);
  if (settings.world === "park") return parkBase(x, z);
  return 0;
}

function hillsBase(x, z) {
  const b = hillFalloff(x, z);
  if (b <= 0) return 0;
  const n = (fbm2(x * HILLS.noiseScale, z * HILLS.noiseScale, HILLS.seed, 4) - 0.5) * 2;
  return b * (-HILLS.depth + n * HILLS.noiseAmp);
}

// The lawn. Two fbm samples at two scales: the fine one is the mower's own texture and the coarse
// one is the patches of sun and shade a field this size actually has, so the green is never one
// flat tile of paint however far you run. The pair spans a yellow-green in full sun to a deeper
// blue-green in the hollows — the two greens the wallpaper's own field is made of.
function blissGroundColor(x, z) {
  const fine = fbm2(x * 0.075, z * 0.075, HILLS.seed + 5, 3) - 0.5;
  const broad = fbm2(x * 0.019, z * 0.019, HILLS.seed + 17, 2) - 0.5;
  let t = 0.5 + fine * 1.1 + broad * 1.6;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [0.285 + 0.13 * t, 0.545 + 0.095 * t, 0.15 + 0.075 * t];
}

function groundColorAt(x, z) {
  if (settings.world === "hills") return blissGroundColor(x, z);
  if (settings.world === "park") return parkGroundColor(x, z);
  return blendBiomeField(x, z, "ground");
}

// The colour of exposed earth (a crater floor, or the underside of a broken plate of ground):
// the biome's own ground colour dropped toward a dark soil brown, so a hole in the ground looks
// like the ground's own dirt rather than a generic grey.
export function groundDebrisColorAt(x, z) {
  const c = groundColorAt(x, z);
  return [c[0] * 0.42 + 0.1, c[1] * 0.34 + 0.07, c[2] * 0.26 + 0.05];
}

export { groundColorAt };

// ---------------------------------------------------------------------------
// THE SKATEPARK (session 206)
//
// The user's brief: *"make me a new skateboard map and exaggrate it and make it with slopes and all
// kinds of stuff"*. Two things are in that sentence and this world is both of them, in the order
// the sentence puts them:
//
//   1. SLOPES — and it is a SLOPE FIELD, not a plane with ramps standing on it. Every ramp in the
//      park is the ground itself, because the ground is what the body already answers to: the
//      board reads its deck's gradient (`readSlope`), gains speed down one flank and spends it up
//      the next (`slopePull` / `slopeGate`), and the drawn mesh is the same function the floor is
//      (see `groundBaseAt`), so a transition you can SEE is a transition you can RIDE by
//      construction. A ramp made of boxes would be a staircase; a ramp made of terrain is a ramp.
//
//   2. ALL KINDS OF STUFF — the stuff is a second layer: real park furniture on the flat decks
//      (rails, ledges, funboxes, pyramids, hubbas, stair sets) built as ordinary destructible
//      boxes, plus three authored SET PIECES the field itself is sculpted into: a round BOWL, a
//      long HALF-PIPE pool, and a big SPINE (see `PARK_FEATURES`).
//
// THE SHAPE IS A LATTICE OF PLAZAS. `PARK.pad` apart there is a dead-flat DECK at its own height
// (a whole riser of `PARK.lift` above or below its neighbours'), and the ground between two decks
// is the transition: an S-curve that stands `PARK.face` of the cell flat at each end and puts the
// whole height change in the middle. One `power`-shaped multiply, and the whole park falls out of
// it: flat plazas to stand and place furniture on, hips and spines wherever three decks meet,
// banks and roll-ins everywhere else, and a run that is nothing but the ramps between them. The
// heights are quantized to risers on purpose — a plaza you can see from the next one, and a
// transition whose grade is the same whatever the two decks are (measured: 31° where the decks
// differ by one riser and up to 68° where they differ by four, and 44% of neighbouring pairs are
// dead level, so the park is plazas with ramps between them rather than either one alone — every
// ramp is past `SLOPE_HOLD_TAN` on purpose: at a walk a bank
// refuses you and the deck pulls you back down it, and at speed — the board's whole game, and the
// reason `SLOPE_CLIMB_ENERGY` exists — you carry up it and launch off the top).
//
// ...AND THE CAMP IS STILL THE CAMP. The same disc the hills keeps level (`PARK.core`, the camp's
// own bounding box plus a margin) is dead flat at y = 0 here, because everything authored about
// the spawn — the yard, the arena and its wall and rails, the monolith and its launch pad — is
// built at y = 0 in every world, and a spawn on a slope is a body that slides off its own camp.
export const PARK = {
  coreX: -4,        // the camp's flat disc: the centre of its own bounding box...
  coreZ: -3,        // ...(the yard reaches x 22 / z 24, the monolith x -30 / z -30)
  core: 44,         // ...and its radius — the same one the hills keeps level, on purpose
  fall: 46,         // world units of run-off before the park itself takes over
  pad: 64,          // the plaza lattice's spacing: a flat DECK every 64 units...
  face: 0.54,       // ...the share of that cell that is dead flat (the rest is the transition, so a
                    // transition runs 29.4 units for a rise of one to four risers — measured on the
                    // drawn field at 31, 51, 61 and 68 degrees, tan 0.61 to 2.45, which is the
                    // "exaggerated" in the brief: even the shortest pair is past `SLOPE_HOLD_TAN`
                    // and the tallest are past anything a walk can touch)
  lift: 12,         // one riser: the height a deck stands at, in units
  levels: 3,        // ...and the tallest deck is ±3 risers = ±36 u
  bands: 6,         // painted bands across a transition (see `parkGroundColor`)
  apron: 22,        // the flat skirt around a set piece, so a pool sits in a plaza
  lane: 46,         // ...and the clear runway past its rim, where no furniture may stand (see
                    // `buildParkChunk`): a landmark you cannot roll at is not a landmark
  seed: 6401,
};

// The one look this world wears: a bright, hard, half-cloudy day over pale concrete. `fog` and
// `horizon` are the same pale blue-grey as the hills' pair and for the same reason — the streamed
// ground has to dissolve into exactly the colour the sky's own horizon wears or the rim of the map
// reads as a seam. Nearer than the hills' (62/150): a park is meant to be READ, and the far haze
// was hiding the set pieces from the spawn.
const PARK_LOOK = {
  name: "SKATEPARK",
  fogNear: 62,
  fogFar: 150,
  ground: [0.55, 0.56, 0.58],
  sky: [0.20, 0.46, 0.94],
  horizon: [0.76, 0.87, 0.99],
  fog: [0.74, 0.85, 0.97],
};

// The FIVE set pieces, authored (not rolled): the things a park is famous for. `base` is filled in
// at the bottom of this section — it is the lattice's own height under the piece's centre, which is
// the level its plaza is flattened to (see `parkBase`).
//
//   * THE BOWL is the round one: `2 · depth / rx` = tan 1.04, so its walls are **46 degrees** and
//     its floor is dead flat — a body can walk in it, carve it at speed, and pump the walls.
//   * THE PIPE is the long one, and its cross-section is the same curve: `2 · 16 / 20` = tan 1.6,
//     **58 degrees** at the lips, with 124 units of wall to carve between them.
//   * THE SPINE is the odd one out and it is BUILT UP instead of dug in: `h · (1 − q)²` is a ridge
//     whose faces are concave and whose steepest point is the TOP — two quarter pipes back to back,
//     2 · 20 / 11 = tan 3.64, **75 degrees** at the crest, softening to flat at the foot. It is the
//     park's own launch: you need tan 3.64 of climb, which `SLOPE_CLIMB_ENERGY` 0.045 buys at a
//     carried **8.3 u/s**, and the drop you take off it is 20 units of concave wall.
//   * THE DEEP END (session 207) is the tight one: the same paraboloid as the bowl at `2 · 18 / 20`
//     = tan 1.8 — **61 degrees** — in a pool half the width, so it is a place to be spat out of its
//     OWN rim rather than a place to walk around in.
//   * THE VOLCANO (session 207) is the second BUILD-UP and the only piece that is BOTH: `h · (1 −
//     q²)` is a dome — the bowl's curve upside down — and `crater` of its radius is cut back out of
//     the middle by `depth · (1 − (q/crater)²)`. So it is a 12.6-unit ring of mound around a 3-unit
//     pit: you run up the outside (measured 41 degrees at the foot, flattening as it climbs, which
//     is what makes it runnable all the way over), and the inside is a pool whose walls measure tan
//     2.23 — **66 degrees**, steeper than the bowl, and the one place in the park where the thing
//     you drop into is not the thing you ran up.
const PARK_FEATURES = [
  { kind: "bowl", x: 122, z: -48, rx: 27, rz: 27, depth: 14 },
  { kind: "pipe", x: -118, z: 78, rx: 62, rz: 20, depth: 16 },
  { kind: "spine", x: 30, z: -152, rx: 43, rz: 11, h: 20 },
  { kind: "bowl", x: -128, z: -128, rx: 20, rz: 20, depth: 18 },
  { kind: "volcano", x: 192, z: 128, rx: 34, rz: 34, h: 15, depth: 18, crater: 0.40 },
  { kind: "ring", x: -300, z: -60, rx: 40, rz: 40, h: 11 },
  { kind: "bowl", x: 300, z: -260, rx: 44, rz: 44, depth: 26 },
  { kind: "pipe", x: -80, z: 320, rx: 90, rz: 26, depth: 22 },
];
const PARK_SAT_SEED = 7717;
{
  let satCount = 0;
  for (let gi = -9; gi <= 9 && satCount < 100; gi++) {
    for (let gj = -9; gj <= 9 && satCount < 100; gj++) {
      const roll = hashInt(gi, gj, PARK_SAT_SEED + 2) % 10;
      const sz = (salt, lo, hi) => lo + ((hashInt(gi, gj, salt) >>> 0) % 1000) / 1000 * (hi - lo);
      const px = (gi + 0.5) * PARK.pad + ((hashInt(gi, gj, PARK_SAT_SEED) % 33) - 16);
      const pz = (gj + 0.5) * PARK.pad + ((hashInt(gi, gj, PARK_SAT_SEED + 1) % 33) - 16);
      if (parkFall(px, pz) < 0.9) continue;
      let cand = null;
      if (roll <= 2) cand = { kind: "bowl", rx: sz(11, 12, 22), rz: sz(12, 12, 22), depth: sz(13, 8, 20) };
      else if (roll === 3) cand = { kind: "pipe", rx: sz(14, 28, 40), rz: sz(15, 12, 17), depth: sz(16, 10, 18) };
      else if (roll === 4) cand = { kind: "spine", rx: sz(17, 20, 36), rz: sz(18, 8, 12), h: sz(19, 10, 22) };
      else if (roll === 5) cand = { kind: "volcano", rx: sz(20, 16, 28), rz: sz(21, 16, 28), h: sz(22, 8, 16), depth: sz(23, 10, 20), crater: sz(24, 0.35, 0.5) };
      else if (roll <= 7) cand = { kind: "ring", rx: sz(25, 16, 28), rz: sz(26, 16, 28), h: sz(27, 6, 12) };
      else cand = { kind: "whoops", rx: sz(28, 20, 32), rz: sz(29, 20, 32), h: sz(30, 1.8, 3.2) };
      const rad = Math.max(cand.rx, cand.rz || cand.rx);
      let clear = true;
      for (let k = 0; k < PARK_FEATURES.length; k++) {
        const e = PARK_FEATURES[k];
        if (Math.hypot(px - e.x, pz - e.z) < (Math.max(e.rx, e.rz) + rad) * 0.6 + 16) { clear = false; break; }
      }
      if (!clear) continue;
      cand.x = px; cand.z = pz;
      PARK_FEATURES.push(cand);
      satCount++;
    }
  }
}
// ...and the level each of them sits at, read off the lattice ONCE (both are pure functions of the
// seed, so this is a constant): the plaza the piece was dropped on is flattened to it.
for (const f of PARK_FEATURES) {
  f.base = parkLattice(f.x, f.z);
  f.skirt = 1 + PARK.apron / Math.min(f.rx, f.rz);
}
// ...and published on `PARK` as well, because `main.js` re-exports that whole object on
// `window.GAME` for the debug API and the assistant panel: the pieces are the map's landmarks, and
// a landmark you cannot ask about by name is one nobody can verify.
PARK.features = PARK_FEATURES;

function smooth01(t) {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return k * k * (3 - 2 * k);
}

// HOW FAR INTO THE PARK A POINT IS: 0 across the camp's own disc, 1 once the field is at full
// voice. Exactly the hills' tail (see `hillFalloff`), and here for the same reason — the flat top
// has to meet the first transition with no crease at all.
function parkFall(x, z) {
  const dx = x - PARK.coreX;
  const dz = z - PARK.coreZ;
  const d = Math.hypot(dx, dz);
  if (d <= PARK.core) return 0;
  return smooth01((d - PARK.core) / PARK.fall);
}

// ONE AXIS OF A PLAZA. `f` is the fraction across a cell (0 at one deck, 1 at the next): the first
// and last `face/2` of it are the decks themselves, and the whole of the height change happens
// between them, on an S-curve — so a deck is genuinely flat (furniture stands on it) and a
// transition genuinely starts and ends level (nothing kinks at the foot of a ramp).
function parkBlend(f) {
  const e = PARK.face * 0.5;
  if (f <= e) return 0;
  if (f >= 1 - e) return 1;
  return smooth01((f - e) / (1 - 2 * e));
}

// THE HEIGHT OF THE DECK AT A LATTICE POINT, in units: a smooth field over the *lattice* (so
// neighbouring plazas tend to agree, and the park has runs and ridges rather than noise) rounded to
// whole risers. 0.40 of a lattice point is a feature about two and a half plazas across — short
// enough that the deck changes from plaza to plaza (measured: 43% of neighbouring pairs differ by
// one riser, 9% by two and 1% by three, so the field is a run of ramps with real plazas between
// them, not one hill).
function parkDeck(u, v) {
  const n = (fbm2(u * 0.40, v * 0.40, PARK.seed, 2) - 0.5) * 2.6;
  const t = n < -1 ? -1 : n > 1 ? 1 : n;
  return Math.round(t * PARK.levels) * PARK.lift;
}

// The plaza lattice itself: a plain bilinear blend of the four decks around the point, with the
// S-curve above applied to each axis first. This is the whole of the park's ground.
function parkLattice(x, z) {
  const s = 1 / PARK.pad;
  const u = Math.floor(x * s);
  const v = Math.floor(z * s);
  const tx = parkBlend(x * s - u);
  const tz = parkBlend(z * s - v);
  const h00 = parkDeck(u, v);
  const h10 = parkDeck(u + 1, v);
  const h01 = parkDeck(u, v + 1);
  const h11 = parkDeck(u + 1, v + 1);
  const a = h00 + (h10 - h00) * tx;
  const b = h01 + (h11 - h01) * tx;
  return a + (b - a) * tz;
}

// THE PARK'S OWN GROUND, and the only definition of it (`groundBaseAt` asks this one). Three
// things, in one pass over the set pieces: the lattice, flattened to the piece's own plaza level
// wherever the piece reaches (so a pool is sunk in a real deck rather than in whatever grade the
// lattice happened to be at), and then the piece's own displacement — a paraboloid dug in
// (`−depth · (1 − q²)`, which is a parabola in every direction: flat in the middle, and its steepest
// at the rim, which is what makes a bowl a bowl) or a ridge built up (`h · (1 − q)²`, the same
// curve upside down, whose steepest point is the CREST and whose foot is flat).
function parkBase(x, z) {
  const b = parkFall(x, z);
  if (b <= 0) return 0;
  let lat = parkLattice(x, z);
  let y = 0;
  for (let i = 0; i < PARK_FEATURES.length; i++) {
    const f = PARK_FEATURES[i];
    const dx = x - f.x;
    const dz = z - f.z;
    const qx = dx / f.rx;
    const qz = dz / f.rz;
    const q2 = qx * qx + qz * qz;
    // THE SKIRT: the lattice is flattened to the piece's own plaza level, ALL the way across the
    // piece and out to `apron` units past its rim (measured on the short axis, so a long pool gets a
    // long flat run-up at each end — which is what a pool has, and what makes the roll-in work). It
    // has to be COMPLETE at the rim and not before: a partial flattening there would leave the rim
    // riding up and down with the lattice, and a pool whose coping is not level is a pool whose
    // walls are not a shape.
    const q = Math.sqrt(q2);
    if (q < f.skirt) {
      const k = 1 - smooth01((q - 1) / (f.skirt - 1));
      lat = lat + (f.base - lat) * k;
    }
    if (q2 >= 1) continue;
    if (f.kind === "spine") {
      // ...and the ridge runs OUT at its ends rather than stopping: `1 − qx²` is the taper, so the
      // last few units of it slope back down to the deck instead of leaving a wall in the field.
      const k = 1 - qx * qx;
      const r = 1 - Math.abs(qz);
      y += f.h * r * r * k;
    } else if (f.kind === "volcano") {
      // THE MOUND IS THE BOWL UPSIDE DOWN, and the crater is a bowl cut back into it. Both terms are
      // the same paraboloid the pools use, so the two curves meet at the crater's own rim with the
      // slope DISCONTINUOUS — which is the point: the ring's crest is a lip you can be thrown off
      // (coming over the top) and the crater's rim is a lip you can be thrown off (coming up out of
      // the pit), and a curve that met smoothly would have neither.
      y += f.h * (1 - q2);
      const qi = q / f.crater;
      if (qi < 1) y -= f.depth * (1 - qi * qi);
    } else if (f.kind === "ring") {
      const qr = (q - 0.72) / 0.14;
      y += f.h * Math.exp(-qr * qr);
    } else if (f.kind === "whoops") {
      y += f.h * (0.5 + 0.5 * Math.sin(dx * 0.55)) * (0.5 + 0.5 * Math.sin(dz * 0.63 + 1.7)) * (1 - q2);
    } else {
      y -= f.depth * (1 - q2);
    }
  }
  return b * (lat + y);
}

// THE PAINT. A skatepark's floor is not one grey: it is pale concrete on the decks, painted
// transitions between them, a joint line where the two meet, and a lined pool at the bottom of a
// bowl. All of it is read off the same two numbers the height field is built from (`parkBlend`'s
// pair, and the set pieces' own q), so a band of paint can never land anywhere a ramp is not.
const PARK_DECK_LOW = [0.52, 0.53, 0.56];
const PARK_DECK_HI = [0.68, 0.69, 0.71];
const PARK_JOINT = [0.33, 0.34, 0.38];
const PARK_PAINT = [
  [0.19, 0.55, 0.61],   // teal
  [0.86, 0.45, 0.19],   // orange
  [0.90, 0.79, 0.26],   // yellow
  [0.55, 0.57, 0.60],   // ...and one band of the concrete itself, so the paint reads as stripes
];
const PARK_LINER = [0.15, 0.34, 0.45];
const PARK_RING = [0.85, 0.38, 0.14];
const PARK_VOLC = [0.44, 0.31, 0.26];
const PARK_VOLC_D = [0.23, 0.13, 0.12];

function parkGroundColor(x, z) {
  const s = 1 / PARK.pad;
  const u = Math.floor(x * s);
  const v = Math.floor(z * s);
  const fx = x * s - u;
  const fz = z * s - v;
  const bx = parkBlend(fx);
  const bz = parkBlend(fz);
  const e = PARK.face * 0.5;
  const rampX = bx > 0 && bx < 1;
  const rampZ = bz > 0 && bz < 1;
  let c;
  if (rampX || rampZ) {
    // WHICH WAY THE TRANSITION RUNS, and how far along it this point stands: a ramp that changes
    // the deck under x is banded along x, and the bands are the paint.
    const t = rampX && rampZ ? (bx > bz ? bx : bz) : rampX ? bx : bz;
    const band = PARK_PAINT[Math.floor(t * PARK.bands) % PARK_PAINT.length];
    c = [band[0], band[1], band[2]];
    // ...and the JOINT where the transition meets a deck: the painted line at the foot of a ramp,
    // which is also what makes a deck read as a slab rather than as a lighter patch of the same ramp.
    const fx2 = bx <= 0 || bx >= 1 ? 1 : Math.min(fx - e, 1 - e - fx);
    const fz2 = bz <= 0 || bz >= 1 ? 1 : Math.min(fz - e, 1 - e - fz);
    if (Math.min(fx2, fz2) < 0.012) c = PARK_JOINT;
  } else {
    // A DECK: pale concrete, with its own shade off the pad's hash so two plazas never read as one
    // sheet (the same trick `shadeCol` plays on the field's structures, at a third of the size).
    const k = ((hashInt(u * 7 + 1, v * 13 + 3, PARK.seed) >>> 0) % 1000) / 1000;
    const m = 0.55 + 0.45 * k;
    c = [
      PARK_DECK_LOW[0] + (PARK_DECK_HI[0] - PARK_DECK_LOW[0]) * m,
      PARK_DECK_LOW[1] + (PARK_DECK_HI[1] - PARK_DECK_LOW[1]) * m,
      PARK_DECK_LOW[2] + (PARK_DECK_HI[2] - PARK_DECK_LOW[2]) * m,
    ];
  }
  // ...and the POOLS: the liner darkens and blues with depth, so the deep end of a bowl is the one
  // place in the world that is genuinely a different colour, and you can read the wall of a pool
  // from the coping. (Outside a piece's rim this is skipped entirely, which is the common case.)
  // The VOLCANO (session 207) wears a colour of its own for the same reason — it is the one piece
  // whose two halves are two different surfaces, and a mound you cannot tell from a plaza at a
  // distance is a mound nobody rides at: rust stone on the mound, darkening all the way down the
  // crater, so the pit reads as a pit from the far side of its own ring.
  for (let i = 0; i < PARK_FEATURES.length; i++) {
    const f = PARK_FEATURES[i];
    if (f.kind === "spine") continue;
    const qx = (x - f.x) / f.rx;
    const qz = (z - f.z) / f.rz;
    const q2 = qx * qx + qz * qz;
    if (q2 >= 1) continue;
    if (f.kind === "whoops") continue;
    if (f.kind === "ring") {
      const qr = (Math.sqrt(q2) - 0.72) / 0.14;
      const kc = Math.exp(-qr * qr) * 0.85;
      c = [c[0] + (PARK_RING[0] - c[0]) * kc, c[1] + (PARK_RING[1] - c[1]) * kc, c[2] + (PARK_RING[2] - c[2]) * kc];
      continue;
    }
    if (f.kind === "volcano") {
      // The mound reads as RUST STONE all the way over its ring (the lattice's own paint only shows
      // through near the foot, which is what ties it to the plaza it stands in) and the crater
      // darkens to near-black at the bottom — the one piece in the park you can name from across two
      // plazas by its colour alone.
      const km = (1 - smooth01(q2)) * 0.85;
      c = [c[0] + (PARK_VOLC[0] - c[0]) * km, c[1] + (PARK_VOLC[1] - c[1]) * km, c[2] + (PARK_VOLC[2] - c[2]) * km];
      const qi = Math.sqrt(q2) / f.crater;
      if (qi < 1) {
        const kd = (1 - smooth01(qi)) * 0.9;
        c = [c[0] + (PARK_VOLC_D[0] - c[0]) * kd, c[1] + (PARK_VOLC_D[1] - c[1]) * kd, c[2] + (PARK_VOLC_D[2] - c[2]) * kd];
      }
      continue;
    }
    // ...and it is DEEPEST AT THE BOTTOM. The blend is `0.6 + 0.4 · (1 − q²)` — full liner at the
    // floor of the pool and 0.6 of it at the coping — because the whole point of lining a pool is
    // that the deepest water is the colour you cannot see the concrete through, and a bowl whose
    // colour did the opposite (pale floor, dark ring at the lip) read as a painted stripe rather
    // than as a pool. Session 206 wrote the ramp inverted (`1 − smooth01(1 − q²)`) despite its own
    // comment saying otherwise; this is that comment made true.
    const k = 0.6 + 0.4 * (1 - smooth01(q2));
    c = [c[0] + (PARK_LINER[0] - c[0]) * k, c[1] + (PARK_LINER[1] - c[1]) * k, c[2] + (PARK_LINER[2] - c[2]) * k];
  }
  return c;
}

function box(x, y, z, w, h, d, c, glow, noCol) {
  return { x, y, z, w, h, d, c, glow: glow ? 1 : 0, noCol: noCol ? 1 : 0 };
}

// ---------------------------------------------------------------------------
// THE SKY CUBE
//
// One landmark, planted at a fixed chunk next to the spawn: a 20 x 20 monolith that stands
// `height` units tall with a neon ring at every storey, and a LAUNCH PAD on the ground beside
// it that fires whoever steps on it onto the roof (see `Player.startLaunch` in player.js for
// the arc itself).
//
// It is placed BY CHUNK rather than rolled out of `STRUCTURES`, because it is a *place* and
// not scenery. Two things need that: it has to be somewhere you can actually find (a rolled
// structure would be one roll in a few hundred chunks), and the pad has to know how high its
// own roof is, which means the pad and the tower have to be authored together. `buildChunk`
// reserves the cells it stands on so nothing else grows through it — and it lives in its own
// chunk, so the reserved cells are the whole price of admission.
// ---------------------------------------------------------------------------

const SKYCUBE = {
  cx: -1,
  cz: -1,
  x: -30,               // min corner, world
  z: -30,
  w: 16,
  d: 16,
  height: 120,          // the roof slab's underside (the platform sits on top of it)
  seg: 15,              // one storey
  band: 0.8,            // the neon ring between storeys
  pad: { x: -5, z: -5, size: 5 },
};

// The monolith's own palette. It is deliberately not taken from the biome: it has to read the
// same in a green meadow and a white frostfield, and the dark body is what the neon rings and
// the player's own aura are read AGAINST.
//
// There are TWO body tones, and that is load-bearing rather than decorative. Measured on the
// running tower: the ±x and ±z faces of a single dark box came out at RGB (29,35,49) and
// (32,38,53) — a 9% difference, i.e. nothing, because most of a dark surface's light here is
// the ambient floor, which is the same on every face. A monolith whose faces are all one value
// reads as a flat black WALL, and every vision check said so. So the two axes are baked
// apart (the ±x faces darker), the way a PS1 generator would have shaded them into the vertices,
// and a corner now always shows a light face against a dark one whatever the sun is doing.
const SKY_BODY = [0.20, 0.225, 0.275];    // the ±z faces
const SKY_BODY_X = [0.092, 0.104, 0.142]; // the ±x faces
const SKY_CORE = [0.075, 0.088, 0.126];   // the interior, and the roof platform
const SKY_RIB = [0.26, 0.285, 0.335];     // the corner ribs, so the silhouette has edges
const SKY_NEON = [0.18, 0.98, 1.18];
const SKY_WARM = [1.15, 0.42, 0.95];
const SKY_PAD = [0.52, 0.55, 0.63];
const SKY_RIB_W = 1.3;
const SKY_RIB_OUT = 0.35;

// The roof, in world y: the crown slab's top face, which is what the launch arc has to clear
// and what the player lands on. Kept as a function so the pad and the geometry cannot drift
// apart (the pad's launch target is read off it).
function skyCubeRoofY(L = SKYCUBE) {
  return L.height + 1.2 + 0.25;
}

function buildSkyCube(L, out) {
  const { x, z, w, d, height, seg, band } = L;
  const slab = seg - band;
  const n = Math.round(height / seg);
  const t = 0.5;
  for (let i = 0; i < n; i++) {
    const y = i * seg;
    const h = i < n - 1 ? slab : seg;
    // One storey is five boxes: a full-depth core, the two ±x walls in the darker tone and the
    // two ±z walls in the lighter one. The walls interlock at the corners (the x-walls run the
    // full depth, the z-walls only the middle), so there is no overlap and no coplanar face.
    out.push(box(x + t, y, z + t, w - 2 * t, h, d - 2 * t, SKY_CORE));
    out.push(box(x, y, z, t, h, d, SKY_BODY_X));
    out.push(box(x + w - t, y, z, t, h, d, SKY_BODY_X));
    out.push(box(x + t, y, z, w - 2 * t, h, t, SKY_BODY));
    out.push(box(x + t, y, z + d - t, w - 2 * t, h, t, SKY_BODY));
    // The ring is the same footprint as the body, so the face stays dead flat: a band that
    // stuck out would be a lip to trip on, and the tower's faces are wall-run and wall-climb
    // surfaces — anything proud of them is a run that stops dead at every storey.
    if (i < n - 1) out.push(box(x, y + slab, z, w, band, d, SKY_NEON, 1));
  }
  // The corner ribs: the only thing on the tower that is proud of the face, and the reason it
  // is worth the lip is that a 121-unit silhouette with no vertical edge in it has nothing for
  // the eye to measure. They run the full height, so a wall run along a face simply ends at one.
  const rw = SKY_RIB_W;
  const ro = SKY_RIB_OUT;
  out.push(box(x - ro, 0, z - ro, rw, height, rw, SKY_RIB));
  out.push(box(x + w + ro - rw, 0, z - ro, rw, height, rw, SKY_RIB));
  out.push(box(x - ro, 0, z + d + ro - rw, rw, height, rw, SKY_RIB));
  out.push(box(x + w + ro - rw, 0, z + d + ro - rw, rw, height, rw, SKY_RIB));
  // The roof. The glowing slab is the crown itself and the dark one is a platform laid inside
  // it, so what shows from below is a ring of light under the roof — which is the thing that
  // makes the tower readable from the ground on a dark night.
  out.push(box(x - 0.8, height, z - 0.8, w + 1.6, 1.2, d + 1.6, SKY_NEON, 1));
  out.push(box(x + 0.4, height, z + 0.4, w - 0.8, 1.45, d - 0.8, SKY_CORE));
  addSkyWindows(L, out);
}

// A deterministic 0..1 hash, so the tower's windows are the SAME tower every time you walk back
// to it — a lit grid that re-rolled itself on every chunk rebuild would flicker as you approach.
function skyHash(i) {
  let h = Math.imul(i ^ 0x9e3779b9, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// THE WINDOW GRID. Measured problem: from the ground, a 16 x 121 dark prism seen from 35 units
// away is nothing but a flat black quadrilateral with a few glowing stripes across it, and a
// flat black quadrilateral reads as a WALL — there is nothing inside it for the eye to size it
// by. The lit grid is the standard fix (it is what makes a block of flats read as a block of
// flats) and it is the only part of the tower that gives away how tall it actually is: eight
// storeys of windows is a countable number, and the count keeps going past the top of the frame.
//
// They are 6 cm proud of the face and marked `noCol` (see `fillChunk`) — proud enough to catch
// the sun and to sit outside the prism, too shallow to be a ledge, and never solid.
const SKY_WIN = [
  [0.30, 0.95, 1.15],   // cyan
  [0.86, 0.46, 1.10],   // violet
  [1.15, 0.74, 0.36],   // amber
  [0.52, 1.10, 0.88],   // mint
];
const SKY_WIN_DARK = [0.075, 0.085, 0.125];

function addSkyWindows(L, out) {
  const { x, z, w, d, seg } = L;
  const rows = 2;
  const cols = 5;
  const winW = 1.7;
  const winH = 2.0;
  // Windows start clear of the corner ribs (which reach `SKY_RIB_W` in from each edge).
  const pad = SKY_RIB_W + 0.7;
  const pitch = (w - 2 * pad - winW) / (cols - 1);
  const n = Math.round(L.height / seg);
  const t = 0.06;
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let r = 0; r < rows; r++) {
      const y = i * seg + 2.6 + r * 5.4;
      for (let c = 0; c < cols; c++) {
        const off = pad + c * pitch;
        for (let f = 0; f < 4; f++) {
          k++;
          const h = skyHash(k);
          const lit = h < 0.46;
          const col = lit ? SKY_WIN[(k * 7) % SKY_WIN.length] : SKY_WIN_DARK;
          if (f === 0) out.push(box(x + w, y, z + off, t, winH, winW, col, lit, 1));
          else if (f === 1) out.push(box(x - t, y, z + off, t, winH, winW, col, lit, 1));
          else if (f === 2) out.push(box(x + off, y, z + d, winW, winH, t, col, lit, 1));
          else out.push(box(x + off, y, z - t, winW, winH, t, col, lit, 1));
        }
      }
    }
  }
}

// The pad: a dark kerb with a lit deck sunk flush into it (flat, so it is something you can
// walk onto rather than a step), and a lit landing zone marked on the ground around it.
function buildLaunchPad(L, out) {
  const p = L.pad;
  const s = p.size;
  const x = p.x - s / 2;
  const z = p.z - s / 2;
  const kerb = 0.8;
  const h = 0.64;
  out.push(box(x, 0, z, s, h, kerb, SKY_PAD));
  out.push(box(x, 0, z + s - kerb, s, h, kerb, SKY_PAD));
  out.push(box(x, 0, z + kerb, kerb, h, s - 2 * kerb, SKY_PAD));
  out.push(box(x + s - kerb, 0, z + kerb, kerb, h, s - 2 * kerb, SKY_PAD));
  out.push(box(x + kerb, 0, z + kerb, s - 2 * kerb, h, s - 2 * kerb, SKY_NEON, 1));
  const m = 1.3;
  const t = 0.5;
  const long = s + 2 * m;
  out.push(box(x - m, 0, z - m, long, 0.1, t, SKY_WARM, 1));
  out.push(box(x - m, 0, z + s + m - t, long, 0.1, t, SKY_WARM, 1));
  out.push(box(x - m, 0, z - m + t, t, 0.1, long - 2 * t, SKY_WARM, 1));
  out.push(box(x + s + m - t, 0, z - m + t, t, 0.1, long - 2 * t, SKY_WARM, 1));
}

// Where the pad throws you, and what the arc has to get over. The landing spot is on the roof
// `inset` units in from the edge nearest the pad, so the arc arrives over the lip and drops —
// it is never a flat approach onto a roof edge, which is the one shape that clips the wall.
function skyCubePad(L) {
  const p = L.pad;
  const roofY = skyCubeRoofY(L);
  const cx = L.x + L.w / 2;
  const cz = L.z + L.d / 2;
  let ux = cx - p.x;
  let uz = cz - p.z;
  const ul = Math.hypot(ux, uz) || 1;
  ux /= ul;
  uz /= ul;
  const inset = 4;
  const reach = (L.w - 0.8) / 2 - inset;
  const s = p.size;
  return {
    // The plate the player actually stands on (what `World.padAt` hands back)...
    minX: p.x - s / 2,
    maxX: p.x + s / 2,
    minZ: p.z - s / 2,
    maxZ: p.z + s / 2,
    topY: 0.64,
    // ...and the tower the arc has to clear, as one box. The monolith IS one box in plan, so a
    // single AABB is exact here — no need for a list of colliders.
    tower: {
      minX: L.x - 0.8,
      maxX: L.x + L.w + 0.8,
      minZ: L.z - 0.8,
      maxZ: L.z + L.d + 0.8,
      roofY,
    },
    // `ux`/`uz` run from the pad toward the tower, so the landing spot is the centre stepped
    // BACK along that line — i.e. on the side of the roof the pad is on, `reach` in from the
    // edge. Arriving over the lip and dropping is the one approach that cannot clip the wall.
    launch: { x: cx - ux * reach, y: roofY, z: cz - uz * reach },
  };
}

// ---------------------------------------------------------------------------
// THE ARENA WALL
//
// The spawn used to sit on a painted pad — an 8 x 8 slab with a kerb, an inner plate and four
// posts, planted in chunk `0,0` so the ground under the player's feet was flat and obviously
// "the start". It read as a piece of interface lying in the world, and it is gone.
//
// What stands there instead is the thing the fight actually wants: a WALL behind the dummy.
// The dummy is spawned down the CAMERA's own forward (see `Enemies.spawn`), so a wall placed in
// the WORLD only lines up with it if the camera's opening yaw is fixed — which is what the
// negated `E.SPAWN_SPREAD` in `beginPlay` (main.js) is for. That stands the body dead ahead on
// the -Z axis, square across this wall. It is done that way round on purpose: a wall built out
// of axis-aligned pieces cannot be TURNED to face a body that spawns at an arbitrary angle, so
// the angle is taken out of the spawn instead of being put into the wall.
//
// It is placed BY CHUNK, like the monolith, so it goes down before the roll and `ARENA.clear`
// keeps scenery off the ground it and the fight stand on. That clearing covers the old spawn
// pad's four cells exactly, so nothing about where scenery is allowed to grow has changed.
//
// The numbers, all in world space, with the player's own start at (5, 5):
//   * the dummy stands `E.SPAWN_DIST` (6) down the -Z axis, at (5, -1);
//   * the wall spans x 0.5 … 9.5 (centred on that line) and z -6.0 … -4.8, so its face is 3.8
//     units behind the dummy — close enough that a body thrown at it arrives, far enough that
//     the dummy's own reach and the player's swings all happen in front of it;
//   * it is 5.4 tall, which is over three times the body and well past `E.WALL_MIN_H`, so it is
//     a splat surface and not a kerb to be stepped over.
// ---------------------------------------------------------------------------
export const ARENA = {
  cx: 0, cz: -1,                                     // the chunk the wall stands in
  wall: { x: 0.5, z: -6.0, w: 9, h: 5.4, d: 1.2 },   // XZ min corner, then size
  clear: { minX: 0, minZ: -8, maxX: 11, maxZ: 13 },  // no scenery inside this rectangle
  // THE VAULT RAILS (see `P`'s `VAULT_*` block and `vaultTarget` in player.js). A parkour move needs
  // something to vault, and this clearing is the one piece of ground the world GUARANTEES is open —
  // so the props the RUNNING VAULT is for live here, a few metres off the fight's line: chest-high
  // rails (all just over `P.STEP` (1.05), so they cannot be walked up — you vault or you climb),
  // each with a clean run-up and clear air over the far side, and a crate beside them. They are
  // planted with the wall, before the roll, and inside the clearing, so no structure can grow
  // through them. This is CONTENT for the move, not the move: the vault works on any low box.
  rails: [
    // The long pair leaves a corridor down the spawn's own line (the player and the camera both
    // stand near x = 5 at spawn, and a rail across that line would sit in the near foreground and
    // eat the character's legs on the first frame) — so they are split around it.
    { x: 1.0, z: 7.5, w: 3.0, h: 1.15, d: 0.6 },
    { x: 6.6, z: 7.5, w: 4.0, h: 1.15, d: 0.6 },
    { x: 1.0, z: 11.6, w: 3.0, h: 1.15, d: 0.6 },
    { x: 9.6, z: 10.8, w: 1.4, h: 1.25, d: 1.4 },
    // ...and one INSIDE the spawn's own opening view (the player starts at (5, 5) looking -Z down
    // the fight's line, so this one is off to their side and visible on the first frame): the
    // mechanic should be something you can see and try, not something you have to go looking for.
    { x: 8.6, z: 0.4, w: 2.4, h: 1.15, d: 0.6 },
  ],
};
const ARENA_COL = [0.52, 0.535, 0.575];
const ARENA_RAIL_COL = [0.46, 0.47, 0.50];

function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function shadeCol(c, rng, amt) {
  const f = 1 + (rng() - 0.5) * amt;
  return [c[0] * f, c[1] * f, c[2] * f];
}

const STRUCTURES = {
  pillars: {
    big: false,
    build(rng, x, z, w, d, col) {
      const out = [];
      const nx = randInt(rng, 2, 3);
      const nz = randInt(rng, 2, 3);
      const bw = 2;
      const bd = 2;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          if (chance(rng, 0.18)) continue;
          const px = x + Math.round((i * (w - bw)) / Math.max(1, nx - 1));
          const pz = z + Math.round((j * (d - bd)) / Math.max(1, nz - 1));
          const h = chance(rng, 0.2) ? randInt(rng, 8, 13) : randInt(rng, 1, 7);
          out.push(box(px, 0, pz, bw, h, bd, shadeCol(col, rng, 0.12)));
          if (chance(rng, 0.35)) out.push(box(px - 0.5, h, pz - 0.5, 3, 1, 3, shadeCol(col, rng, 0.18)));
        }
      }
      return out;
    },
  },

  // The one structure whose entire job is a long, clean, vertical face: the wall-run wall.
  // `span` lets it be laid down as a strip up to four cells long instead of a square, so a
  // run has real distance in it; without the roll (or when the strip will not fit) it still
  // builds a shorter wall in its own cell.
  bigWall: {
    span: [4, 1],
    spanChance: 0.55,
    big: true,
    build(rng, x, z, w, d, col) {
      const out = [];
      const alongX = w >= d;
      const len = alongX ? w : d;
      const cross = alongX ? d : w;
      const t = Math.max(1, Math.min(3, Math.round(cross * 0.26)));
      const h = randInt(rng, 11, 22);
      const off = Math.max(0, Math.floor((cross - t) / 2));
      const c1 = shadeCol(col, rng, 0.08);
      const c2 = shadeCol(col, rng, 0.16);
      const seg = (along, alen, across, cwid, y, sh, c) => {
        if (alongX) out.push(box(x + along, y, z + across, alen, sh, cwid, c));
        else out.push(box(x + across, y, z + along, cwid, sh, alen, c));
      };
      // The face itself, flat from end to end.
      seg(0, len, off, t, 0, h, c1);
      // A buttress at one end, taller than the wall: a landmark, and something to vault when
      // the run reaches it. It is kept the SAME thickness as the wall and flush with both of
      // its faces — anything that bulges into the run face is a wall you cannot run past.
      const bw = Math.min(len, Math.max(2, Math.round(len * 0.14)));
      const bh = Math.min(26, h + randInt(rng, 2, 5));
      seg(chance(rng, 0.5) ? 0 : len - bw, bw, off, t, 0, bh, c2);
      // A shelf part-way along the far side — a landing, or something to mantle mid-run.
      const ll = randInt(rng, 2, 4);
      const la = randInt(rng, 0, Math.max(0, len - ll));
      seg(la, ll, off + t, Math.max(1, Math.min(3, cross - off - t)), randInt(rng, 3, 6), 1, shadeCol(col, rng, 0.2));
      // A coping along the top, a little wider than the wall.
      seg(0, len, Math.max(0, off - 1), Math.min(cross, t + 2), h, 1, c2);
      return out;
    },
  },

  wallCorridor: {
    big: true,
    build(rng, x, z, w, d, col) {
      const out = [];
      const alongX = w >= d;
      const len = alongX ? w : d;
      const cross = alongX ? d : w;
      const t = chance(rng, 0.4) ? 2 : 1;
      const gap = Math.min(cross - 2 * t, randInt(rng, 3, 5));
      if (gap < 2) return out;
      const off = Math.floor((cross - (gap + 2 * t)) / 2);
      const h = randInt(rng, 5, 10);
      const c1 = shadeCol(col, rng, 0.1);
      const c2 = shadeCol(col, rng, 0.1);
      if (alongX) {
        out.push(box(x, 0, z + off, len, h, t, c1));
        out.push(box(x, 0, z + off + t + gap, len, h, t, c2));
      } else {
        out.push(box(x + off, 0, z, t, h, len, c1));
        out.push(box(x + off + t + gap, 0, z, t, h, len, c2));
      }
      if (chance(rng, 0.6)) {
        const bh = h + randInt(rng, 1, 2);
        if (alongX) out.push(box(x + Math.floor(len / 2) - 1, 0, z, 2, bh, cross, shadeCol(col, rng, 0.16)));
        else out.push(box(x, 0, z + Math.floor(len / 2) - 1, cross, bh, 2, shadeCol(col, rng, 0.16)));
      }
      return out;
    },
  },

  wallLedge: {
    big: true,
    build(rng, x, z, w, d, col) {
      const out = [];
      const alongX = w >= d;
      const len = alongX ? w : d;
      const cross = alongX ? d : w;
      const t = Math.min(cross, randInt(rng, 1, 2));
      const h = randInt(rng, 4, 8);
      const off = Math.floor((cross - t) / 2);
      const c1 = shadeCol(col, rng, 0.1);
      if (alongX) out.push(box(x, 0, z + off, len, h, t, c1));
      else out.push(box(x + off, 0, z, t, h, len, c1));
      const n = randInt(rng, 2, 4);
      for (let i = 0; i < n; i++) {
        const s = Math.floor((i + 0.5) * (len / n));
        const side = chance(rng, 0.5) ? 1 : -1;
        const sz = randInt(rng, 2, 3);
        const sh = randInt(rng, 1, 3);
        if (alongX) {
          out.push(box(x + s, h, z + off + (side > 0 ? t : -sz), sz, sh, sz, shadeCol(col, rng, 0.16)));
        } else {
          out.push(box(x + off + (side > 0 ? t : -sz), h, z + s, sz, sh, sz, shadeCol(col, rng, 0.16)));
        }
      }
      return out;
    },
  },

  tower: {
    big: false,
    build(rng, x, z, w, d, col) {
      const out = [];
      const bs = Math.min(w, d, randInt(rng, 2, 3));
      const h = randInt(rng, 4, 9);
      const bx = x + Math.floor((w - bs) / 2);
      const bz = z + Math.floor((d - bs) / 2);
      out.push(box(bx, 0, bz, bs, h, bs, shadeCol(col, rng, 0.08)));
      let y = h;
      const n = randInt(rng, 2, 5);
      let side = randInt(rng, 0, 3);
      for (let i = 0; i < n; i++) {
        const s = randInt(rng, 2, 3);
        const lh = randInt(rng, 1, 2);
        const c = shadeCol(col, rng, 0.18);
        if (side === 0) out.push(box(bx - s, y, bz + (bs - s) / 2, s, lh, s, c));
        else if (side === 1) out.push(box(bx + bs, y, bz + (bs - s) / 2, s, lh, s, c));
        else if (side === 2) out.push(box(bx + (bs - s) / 2, y, bz - s, s, lh, s, c));
        else out.push(box(bx + (bs - s) / 2, y, bz + bs, s, lh, s, c));
        y += randInt(rng, 2, 3);
        side = (side + (chance(rng, 0.75) ? 1 : 3)) % 4;
      }
      return out;
    },
  },

  spire: {
    big: false,
    build(rng, x, z, w, d, col) {
      const out = [];
      const h = randInt(rng, 10, 20);
      const bx = x + Math.floor(w / 2) - 1;
      const bz = z + Math.floor(d / 2) - 1;
      out.push(box(bx, 0, bz, 2, h, 2, shadeCol(col, rng, 0.08)));
      let side = randInt(rng, 0, 3);
      for (let y = 3; y < h; y += 3) {
        const c = shadeCol(col, rng, 0.2);
        if (side === 0) out.push(box(bx - 1, y, bz, 1, 1, 2, c));
        else if (side === 1) out.push(box(bx + 2, y, bz, 1, 1, 2, c));
        else if (side === 2) out.push(box(bx, y, bz - 1, 2, 1, 1, c));
        else out.push(box(bx, y, bz + 2, 2, 1, 1, c));
        side = (side + 1) % 4;
      }
      out.push(box(bx - 1, h, bz - 1, 4, 1, 4, shadeCol(col, rng, 0.2)));
      return out;
    },
  },

  terraces: {
    big: true,
    build(rng, x, z, w, d, col) {
      const out = [];
      const n = randInt(rng, 3, 4);
      let size = Math.min(w, d);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const s = Math.max(3, size - i * 2);
        const px = x + Math.floor((w - s) / 2) + (chance(rng, 0.5) ? 1 : -1) * Math.min(i, 2);
        const pz = z + Math.floor((d - s) / 2) + (chance(rng, 0.5) ? 1 : -1) * Math.min(i, 2);
        out.push(box(px, y, pz, s, 1, s, shadeCol(col, rng, 0.14)));
        if (chance(rng, 0.5)) out.push(box(px + Math.floor(s / 2) - 1, 0, pz + Math.floor(s / 2) - 1, 2, y, 2, shadeCol(col, rng, 0.05)));
        y += randInt(rng, 2, 3);
      }
      return out;
    },
  },

  slabRun: {
    big: true,
    build(rng, x, z, w, d, col) {
      const out = [];
      const n = randInt(rng, 3, 5);
      for (let i = 0; i < n; i++) {
        const s = randInt(rng, 3, 5);
        const px = x + randInt(rng, 0, Math.max(0, w - s));
        const pz = z + randInt(rng, 0, Math.max(0, d - s));
        const y = randInt(rng, 2, 14);
        out.push(box(px, y, pz, s, randInt(rng, 1, 2), s, shadeCol(col, rng, 0.16)));
        if (chance(rng, 0.4)) out.push(box(px + s - 1, y - randInt(rng, 1, 3), pz + s - 1, 2, 1, 2, shadeCol(col, rng, 0.2)));
      }
      return out;
    },
  },

  stairs: {
    big: false,
    build(rng, x, z, w, d, col) {
      const out = [];
      const steps = randInt(rng, 4, 7);
      const sw = Math.min(w, randInt(rng, 2, 3));
      const horizontal = chance(rng, 0.5);
      const span = horizontal ? w : d;
      const px = x + (horizontal ? 0 : Math.floor((w - sw) / 2));
      const pz = z + (horizontal ? Math.floor((d - sw) / 2) : 0);
      for (let i = 0; i < steps; i++) {
        const off = Math.floor((i * (span - 1)) / steps);
        if (horizontal) out.push(box(px + off, 0, pz, Math.ceil(span / steps) + 1, i + 1, sw, shadeCol(col, rng, 0.1)));
        else out.push(box(px, 0, pz + off, sw, i + 1, Math.ceil(span / steps) + 1, shadeCol(col, rng, 0.1)));
      }
      const ty = steps;
      out.push(box(px + (horizontal ? 0 : 0), ty, pz, Math.min(w, 4), 1, Math.min(d, 4), shadeCol(col, rng, 0.18)));
      return out;
    },
  },

  blocks: {
    big: false,
    build(rng, x, z, w, d, col) {
      const out = [];
      const n = randInt(rng, 3, 8);
      for (let i = 0; i < n; i++) {
        const s = randInt(rng, 1, 3);
        const px = x + randInt(rng, 0, Math.max(0, w - s));
        const pz = z + randInt(rng, 0, Math.max(0, d - s));
        const h = randInt(rng, 1, 4);
        out.push(box(px, 0, pz, s, h, s, shadeCol(col, rng, 0.14)));
        if (chance(rng, 0.3)) {
          const s2 = randInt(rng, 1, 2);
          out.push(box(px + randInt(rng, -1, 1), h, pz + randInt(rng, -1, 1), s2, s2, s2, shadeCol(col, rng, 0.22)));
        }
      }
      return out;
    },
  },

  arch: {
    big: false,
    build(rng, x, z, w, d, col) {
      const out = [];
      const h = randInt(rng, 4, 7);
      const gap = randInt(rng, 3, 4);
      const t = 2;
      const alongX = w >= d;
      const c = shadeCol(col, rng, 0.12);
      const px0 = Math.min(x + Math.floor((w - (alongX ? gap + 2 * t : t)) / 2), x + Math.max(0, w - (alongX ? gap + 2 * t : t)));
      const pz0 = Math.min(z + Math.floor((d - (alongX ? t : gap + 2 * t)) / 2), z + Math.max(0, d - (alongX ? t : gap + 2 * t)));
      const px = Math.max(x, px0);
      const pz = Math.max(z, pz0);
      if (alongX) {
        out.push(box(px, 0, pz, t, h, t, c));
        out.push(box(px + t + gap, 0, pz, t, h, t, shadeCol(col, rng, 0.12)));
        out.push(box(px, h, pz, gap + 2 * t, 2, t, shadeCol(col, rng, 0.2)));
      } else {
        out.push(box(px, 0, pz, t, h, t, c));
        out.push(box(px, 0, pz + t + gap, t, h, t, shadeCol(col, rng, 0.12)));
        out.push(box(px, h, pz, t, 2, gap + 2 * t, shadeCol(col, rng, 0.2)));
      }
      return out;
    },
  },
};

// ---------------------------------------------------------------------------
// THE SKATEPARK'S FURNITURE (session 206 — see "THE SKATEPARK" above for the ground it stands on)
//
// The second half of the brief's *"all kinds of stuff"*: the SLOPES are the field, and this is what
// stands on it. Every prop is ordinary destructible boxes on a chunk's own box list — the same mesh,
// the same colliders, the same occluder grid, the same voxel damage as the field's structures — and
// every one of them is sized to fit inside ONE 8-unit cell (`PARK_PROPS`' own `half`), because
// `buildParkChunk` plants them at cell centres and a prop that crossed a chunk boundary would be
// filed under one chunk while standing in two (see the note on the arena's rails in `buildChunk`:
// a box registered to the wrong chunk is a box no query will ever find).
//
// They are the real vocabulary of a street plaza rather than a set of abstract blocks: a FLAT BAR,
// a LEDGE with a coping, a FUNBOX with a bar over it, a PYRAMID of three tiers, a HUBBA (a long
// two-high ledge with a rail beside it), a STAIR SET (five steps, each under the board's own wheel
// — see `PARK.step`) and a plain BLOCK to hop.
//
// ...AND THE SECOND PASS (session 207, the user's *"add more stuff to the skate board map"*). Seven
// props is a scattering rather than a park, and the one thing the terrain cannot give a deck is a
// LAUNCH — a plaza's ramps are all S-curves that roll you over the top. So the bag is seventeen now,
// and the new ten are: two real ramps you can be thrown off (**KICKER** for height, **BANK** for a
// wide roll-in — stacked boxes, every rise under the board's own wheel so the deck rolls over them
// instead of stopping at them), a **HUMP** (a low two-sided spine in a box, for plazas with no
// feature on them), a **MANUAL** pad, a **BARRIER** to ride along, and the street furniture a real
// plaza is full of — **KERB** (three parking blocks in a row), **PLANTER**, **BENCH**, **CONE** and
// **CAN**. A prop's `w` is what it is worth against every other prop in the bag — 1 unless it says
// otherwise (see `pickParkProp`) — so the ramps and the street furniture are the common case and a
// six-unit hubba stays a find.
const PARK_CONC = [0.60, 0.61, 0.64];
const PARK_CONC_D = [0.40, 0.41, 0.45];
const PARK_STEEL = [0.62, 0.65, 0.70];
const PARK_ORANGE = [0.85, 0.42, 0.17];
const PARK_MINT = [0.24, 0.66, 0.60];
const PARK_YELLOW = [0.88, 0.77, 0.25];
const PARK_WOOD = [0.46, 0.31, 0.19];
const PARK_DARK = [0.28, 0.30, 0.31];
const PARK_LEAF = [0.20, 0.44, 0.24];

const PARK_PROPS = [
  // A FLAT BAR: the simplest thing in the park and the one everything else is measured against —
  // 0.92 up, so it is a hop rather than a step, with the posts out at the ends where nothing slides
  // along it.
  {
    name: "rail",
    half: 3.2,
    build(rng, x, z, y) {
      const c = chance(rng, 0.5) ? PARK_STEEL : PARK_ORANGE;
      const L = 6.2;
      return [
        box(x - L / 2, y + 0.92, z - 0.10, L, 0.20, 0.20, c),
        box(x - L / 2 + 0.18, y, z - 0.12, 0.24, 0.92, 0.24, shadeCol(c, rng, 0.14)),
        box(x + L / 2 - 0.42, y, z - 0.12, 0.24, 0.92, 0.24, shadeCol(c, rng, 0.14)),
      ];
    },
  },
  // A LEDGE: 0.62 of concrete with a darker coping laid along the top edge, which is the whole
  // difference between a ledge and a low wall.
  {
    name: "ledge",
    half: 3.2,
    build(rng, x, z, y) {
      const L = 6.4;
      return [
        box(x - L / 2, y, z - 0.62, L, 0.62, 1.24, shadeCol(PARK_CONC, rng, 0.08)),
        box(x - L / 2, y + 0.62, z - 0.66, L, 0.10, 1.32, PARK_CONC_D),
      ];
    },
  },
  // A FUNBOX: a box with a bar across it at 1.72, and the posts set OUTSIDE the box's own footprint
  // so the bar has something to stand on that is not the thing you are trying to ride over.
  {
    name: "funbox",
    half: 3.2,
    build(rng, x, z, y) {
      const c = shadeCol(PARK_CONC, rng, 0.08);
      const out = [
        box(x - 1.6, y, z - 1.8, 3.2, 1.05, 3.6, c),
        box(x - 1.6, y + 1.05, z - 1.84, 3.2, 0.10, 3.68, PARK_CONC_D),
        box(x - 3.1, y + 1.62, z - 0.10, 6.2, 0.20, 0.20, PARK_STEEL),
      ];
      out.push(box(x - 3.02, y, z - 0.12, 0.24, 1.62, 0.24, PARK_CONC_D));
      out.push(box(x + 2.78, y, z - 0.12, 0.24, 1.62, 0.24, PARK_CONC_D));
      return out;
    },
  },
  // A PYRAMID: three tiers, each one riser, with a brighter cap on the top — a thing to run up one
  // side of and launch off the other.
  {
    name: "pyramid",
    half: 3.2,
    build(rng, x, z, y) {
      const c = shadeCol(PARK_CONC, rng, 0.10);
      return [
        box(x - 3.2, y, z - 3.2, 6.4, 1.15, 6.4, c),
        box(x - 2.1, y + 1.15, z - 2.1, 4.2, 1.15, 4.2, shadeCol(c, rng, 0.06)),
        box(x - 1.0, y + 2.30, z - 1.0, 2.0, 1.15, 2.0, chance(rng, 0.5) ? PARK_MINT : PARK_ORANGE),
      ];
    },
  },
  // A HUBBA: the long two-high ledge (1.9) with a bar running beside it at 1.15 — the classic
  // pairing, and the two heights are far enough apart to be two different moves.
  {
    name: "hubba",
    half: 3.2,
    build(rng, x, z, y) {
      const L = 6.4;
      const out = [
        box(x - L / 2, y, z - 1.55, L, 1.90, 1.60, shadeCol(PARK_CONC, rng, 0.08)),
        box(x - L / 2, y + 1.90, z - 1.60, L, 0.10, 1.70, PARK_CONC_D),
      ];
      out.push(box(x - L / 2, y + 1.02, z + 0.72, L, 0.20, 0.20, PARK_ORANGE));
      out.push(box(x - L / 2 + 0.2, y, z + 0.70, 0.24, 1.02, 0.24, PARK_CONC_D));
      out.push(box(x + L / 2 - 0.44, y, z + 0.70, 0.24, 1.02, 0.24, PARK_CONC_D));
      return out;
    },
  },
  // A STAIR SET: five steps and the deck they lead to. Each step is 0.42 — under the board's own
  // wheel and under a walk's step-up, so a set of them is a run you can ride down rather than a
  // wall, which is exactly what the field's own `stairs` (steps a whole unit tall) is not. The
  // landing is what is LEFT of the cell after the five runs: session 206 wrote its depth as
  // `3.2 − n·sd` (3.2 − 5.9 = **−2.7**, a box with its far face behind its near one — a negative
  // AABB, measured in the live chunk list), which is not a landing but a hole in the occluder grid.
  {
    name: "stairs",
    half: 3.2,
    build(rng, x, z, y) {
      const n = 5, sh = 0.42, sd = 1.18, sw = 3.4;
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push(box(x - sw / 2, y, z - 3.05 + i * sd, sw, (i + 1) * sh, sd + 0.02, shadeCol(PARK_CONC, rng, 0.06)));
      }
      out.push(box(x - sw / 2, y, z - 3.05 + n * sd, sw, (n + 1) * sh, 3.2 - (n * sd - 3.05),
        shadeCol(PARK_CONC, rng, 0.12)));
      return out;
    },
  },
  // ...and a BLOCK: one plain concrete cube, hip high, which is the one prop here that is not a
  // trick in itself.
  {
    name: "block",
    half: 2.2,
    build(rng, x, z, y) {
      return [box(x - 2.1, y, z - 2.1, 4.2, 1.5, 4.2, shadeCol(PARK_CONC, rng, 0.14))];
    },
  },

  // ---- SESSION 207: THE SECOND PASS -----------------------------------------------------------
  // A BANK: the wide shallow one, 4.8 across and 0.85 up over 3.6 of run — a roll-in rather than a
  // launch, and the prop that makes a plaza's own lip. `n` steps of 0.6 with the last 0.14 of the
  // height in each, so the DRAWN top is a staircase of 0.14 units and the board (whose wheel is
  // `P.BOARD_R` 0.42) rides it as a ramp. The yellow cap is the paint on the lip, which is what
  // makes it read as a ramp from across the plaza rather than as a lump of concrete.
  {
    name: "bank", w: 1.3, half: 2.4,
    build(rng, x, z, y) {
      const n = 6, d = 0.6, w = 4.8, top = 0.85;
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push(box(x - w / 2, y, z - 3.0 + i * d, w, top * (i + 1) / n, d + 0.02,
          shadeCol(PARK_CONC, rng, 0.05)));
      }
      out.push(box(x - w / 2, y + top, z - 3.0 + (n - 1) * d, w, 0.10, d + 0.02, PARK_YELLOW));
      return out;
    },
  },
  // ...a KICKER: the same six steps in a TALLER, NARROWER shape (1.16 up in 3.3 of run, tan 0.35 of
  // average grade but 0.21 of rise on the last step alone) — a thing to be thrown off rather than
  // rolled over. It is the only prop in the bag with a lip the board can launch from in the flat.
  {
    name: "kicker", w: 1.2, half: 1.9,
    build(rng, x, z, y) {
      const n = 6, d = 0.55, w = 3.4, top = 1.16;
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push(box(x - w / 2, y, z - 2.6 + i * d, w, top * (i + 1) / n, d + 0.02,
          shadeCol(PARK_CONC, rng, 0.05)));
      }
      out.push(box(x - w / 2, y + top, z - 2.6 + (n - 1) * d, w, 0.10, d + 0.02, PARK_ORANGE));
      return out;
    },
  },
  // ...a HUMP: a low two-sided spine in a box (five steps up, five down, 0.62 at the crest), for the
  // plazas that have no feature of their own — the smallest thing in the park you can pump both ways.
  {
    name: "hump", w: 1.1, half: 1.8,
    build(rng, x, z, y) {
      const n = 5, d = 0.5, w = 3.6, top = 0.62;
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push(box(x - w / 2, y, z - 1.3 + i * d, w, top * (i + 1) / n, d + 0.02,
          shadeCol(PARK_CONC, rng, 0.05)));
      }
      for (let i = 0; i < n; i++) {
        out.push(box(x - w / 2, y, z + 1.2 + i * d, w, top * (n - i) / n, d + 0.02,
          shadeCol(PARK_CONC, rng, 0.05)));
      }
      return out;
    },
  },
  // ...a MANUAL pad: a long 0.34 kerb with a dark coping, which is a thing to balance across rather
  // than to clear. 0.34 is under the walk's own step-up, so it is a surface and not an obstacle.
  {
    name: "manual", w: 1.0, half: 3.2,
    build(rng, x, z, y) {
      const L = 6.4;
      return [
        box(x - L / 2, y, z - 0.9, L, 0.34, 1.8, shadeCol(PARK_CONC, rng, 0.06)),
        box(x - L / 2, y + 0.34, z - 0.94, L, 0.09, 1.88, PARK_CONC_D),
      ];
    },
  },
  // ...a BARRIER: 6.2 of wall 1.72 high with a painted top. The park has no other tall, thin thing
  // in it, and a wall you can put your shoulder to is half of what a street spot is.
  {
    name: "barrier", w: 0.9, half: 3.1,
    build(rng, x, z, y) {
      const L = 6.2;
      return [
        box(x - L / 2, y, z - 0.34, L, 1.72, 0.68, shadeCol(PARK_CONC, rng, 0.10)),
        box(x - L / 2, y + 1.72, z - 0.40, L, 0.12, 0.80, PARK_ORANGE),
      ];
    },
  },
  // ---- ...and the street furniture. These are the props that make a plaza read as a PLACE: a row
  // of three parking blocks, a planter with something growing in it, a bench, a cone and a can.
  {
    name: "kerb", w: 1.5, half: 2.6,
    build(rng, x, z, y) {
      const out = [];
      for (let i = 0; i < 3; i++) {
        out.push(box(x - 0.62, y, z - 2.4 + i * 1.9, 1.24, 0.32, 0.55, shadeCol(PARK_CONC, rng, 0.12)));
      }
      return out;
    },
  },
  {
    name: "planter", w: 1.3, half: 1.4,
    build(rng, x, z, y) {
      const out = [
        box(x - 1.3, y, z - 1.3, 2.6, 0.62, 2.6, shadeCol(PARK_CONC, rng, 0.10)),
        box(x - 1.12, y + 0.62, z - 1.12, 2.24, 0.10, 2.24, PARK_CONC_D),
      ];
      out.push(box(x - 0.80, y + 0.72, z - 0.80, 1.60, 0.40, 1.60, shadeCol(PARK_LEAF, rng, 0.12)));
      out.push(box(x - 0.50, y + 1.12, z - 0.50, 1.00, 0.30, 1.00, shadeCol(PARK_LEAF, rng, 0.20)));
      return out;
    },
  },
  {
    name: "bench", w: 1.4, half: 1.9,
    build(rng, x, z, y) {
      const L = 3.6;
      return [
        box(x - L / 2, y + 0.32, z - 0.44, L, 0.14, 0.88, PARK_WOOD),
        box(x - L / 2 + 0.34, y, z - 0.42, 0.26, 0.32, 0.84, shadeCol(PARK_CONC_D, rng, 0.06)),
        box(x + L / 2 - 0.60, y, z - 0.42, 0.26, 0.32, 0.84, shadeCol(PARK_CONC_D, rng, 0.06)),
      ];
    },
  },
  {
    name: "cone", w: 1.6, half: 0.5,
    build(rng, x, z, y) {
      return [
        box(x - 0.34, y, z - 0.34, 0.68, 0.10, 0.68, PARK_ORANGE),
        box(x - 0.20, y + 0.10, z - 0.20, 0.40, 0.36, 0.40, PARK_ORANGE),
        box(x - 0.10, y + 0.46, z - 0.10, 0.20, 0.30, 0.20, PARK_ORANGE),
      ];
    },
  },
  {
    name: "can", w: 1.5, half: 0.5,
    build(rng, x, z, y) {
      return [box(x - 0.40, y, z - 0.40, 0.80, 1.10, 0.80, shadeCol(PARK_DARK, rng, 0.10))];
    },
  },
];

// ONE PROP, by weight: `pick` is a plain uniform draw, and a bag of seventeen with one of each would
// make a six-unit hubba exactly as likely as a cone — so the props that carry a `w` are drawn by it
// (1 unless a prop says otherwise) and the bag stays a park rather than a museum of its own rarest
// pieces.
function pickParkProp(rng) {
  let total = 0;
  for (let i = 0; i < PARK_PROPS.length; i++) total += PARK_PROPS[i].w || 1;
  let r = rng() * total;
  for (let i = 0; i < PARK_PROPS.length; i++) {
    r -= PARK_PROPS[i].w || 1;
    if (r <= 0) return PARK_PROPS[i];
  }
  return PARK_PROPS[0];
}

// ...and the furniture is published on `PARK` alongside the set pieces (session 207), for the same
// reason they are: `main.js` re-exports that object on `window.GAME`, and `PARK.props.length` /
// `PARK.props[i].name` are how a console (or the verification script for this map) asks what can
// stand on a deck without re-deriving the table by hand.
PARK.props = PARK_PROPS;

// ONE CHUNK OF THE PARK. Two passes and nothing else:
//
//   1. THE FURNITURE. One prop per 8-unit cell, and only where the ground under that cell is a
//      DECK: the field is sampled at the four corners of the prop's own footprint and the cell is
//      skipped if it bends more than 0.22 across them. That test IS the placement rule — there is
//      no list of "where the plazas are" to keep in step with the height field, because the ground
//      the body rides and the ground a prop stands on are the same function.
//   2. THE COPING. A dashed ring of small no-collision boxes along the rim of every pool (see
//      `PARK_FEATURES`), which is the park's own landmark from a distance and the line you pop off
//      when you come up a wall. They are filed by the chunk their own centre falls in, the rule the
//      arena's rails obey, and they are `noCol` because a lip you can catch on is a lip that ruins
//      the trick it is drawn for.
// The furniture pass is OFF: the park rides clean (decks, ramps, bowls, coping) with no
// street furniture standing on the lines. Flip it back on to bring the props back.
const PARK_FURNITURE_ON = false;
function buildParkChunk(ox, oz, boxes, used) {
  const cx = ox / CHUNK;
  const cz = oz / CHUNK;
  for (let i = 0; i < CELLS; i++) {
    for (let j = 0; j < CELLS; j++) {
      if (!PARK_FURNITURE_ON) continue;
      if (used[j * CELLS + i]) continue;
      const x = ox + (i + 0.5) * CELL;
      const z = oz + (j + 0.5) * CELL;
      if (Math.hypot(x - PARK.coreX, z - PARK.coreZ) < PARK.core + 12) continue;
      // ...AND THE RUN-UPS STAY CLEAR. A set piece's apron is not only the flat plaza the pool is
      // sunk in, it is the RUNWAY you have to be able to roll at it from — and the terrain there is
      // flattened, so it passes the deck test below and furniture lands on it by default. Measured
      // with a prop in that lane: a 14 u/s run at the spine stopped DEAD 45 units short of the
      // ridge, on a prop planted on flat apron, which is a landmark that cannot be ridden.
      //
      // The lane is TWO shapes, because a piece needs both: the apron itself (the flattening's own
      // reach, `1 + apron / min(rx, rz)` in the piece's own q — which for the pipe is a long slab
      // past each end, its roll-in) and a CAPSULE of `PARK.lane` around the ellipse's rim (whose
      // radius is the short axis, so a pool gets a ring and a ridge a wide berth across its own
      // flip line — the approach the apron does NOT cover, since the lattice deck out there is flat
      // for its own reasons and the deck test is happy to build on it).
      let lane = false;
      for (let t = 0; t < PARK_FEATURES.length && !lane; t++) {
        const f = PARK_FEATURES[t];
        const qx = (x - f.x) / f.rx;
        const qz = (z - f.z) / f.rz;
        if (Math.sqrt(qx * qx + qz * qz) < 1 + PARK.apron / Math.min(f.rx, f.rz)) { lane = true; break; }
        const ax = Math.max(0, f.rx - f.rz);
        const ex = Math.max(0, Math.abs(x - f.x) - ax);
        if (Math.hypot(ex, z - f.z) < Math.min(f.rx, f.rz) + PARK.lane) { lane = true; break; }
      }
      if (lane) continue;
      const r = CELL * 0.5 - 1.0;
      const h00 = parkBase(x - r, z - r);
      const h10 = parkBase(x + r, z - r);
      const h01 = parkBase(x - r, z + r);
      const h11 = parkBase(x + r, z + r);
      const hi = Math.max(h00, h10, h01, h11);
      const lo = Math.min(h00, h10, h01, h11);
      if (hi - lo > 0.22) continue;
      const cr = rngFor(cx * CELLS + i, cz * CELLS + j, PARK.seed + 7);
      if (!chance(cr, 0.72)) continue;
      const def = pickParkProp(cr);
      if (def.half > CELL * 0.5 - 0.7) continue;
      const made = def.build(cr, x, z, (hi + lo) * 0.5 - 0.06);
      for (let k = 0; k < made.length; k++) boxes.push(made[k]);
    }
  }
  for (let t = 0; t < PARK_FEATURES.length; t++) {
    const f = PARK_FEATURES[t];
    if (f.kind === "spine") continue;
    const step = 1.15 / Math.max(f.rx, f.rz);
    for (let a = 0; a < Math.PI * 2 - 1e-6; a += step) {
      const px = f.x + f.rx * Math.cos(a);
      const pz = f.z + f.rz * Math.sin(a);
      if (Math.floor(px / CHUNK) !== cx || Math.floor(pz / CHUNK) !== cz) continue;
      boxes.push(box(px - 0.72, f.base - 0.16, pz - 0.72, 1.44, 0.30, 1.44,
        t === 0 ? PARK_MINT : PARK_YELLOW, 0, 1));
    }
  }
}

// ---------------------------------------------------------------------------
// THE MAZE
//
// `settings.world` picks which generator fills the field: "field" is the biome roll the world has
// always been (everything above), "maze" is this, and "park" is the one above it. (The fourth,
// "hills", is at the bottom of this file — see "THE HILLS".) The maze is a SECOND GENERATOR, not
// a variation on the first — it ignores `STRUCTURES` and the biome weights entirely and lays down
// one building material of its own — but it is plugged into the same machinery: it emits plain
// boxes onto the chunk's own list, so walls get the same mesh, the same colliders, the same
// occluder grid and the same destruction as everything else in the world, and `queryXZ`,
// `topBelow`, the blob shadow, wall-running and the wall climb all work on them for free.
//
// THE LATTICE. An infinite grid of 8-unit cells, exactly on `CELL`, so the maze lands on the same
// lattice as every structure the field generator plants and a chunk is always a whole number of
// cells. Cells come in three kinds:
//
//   * a ROOM   — both coordinates even — is always open. Rooms are the 8 x 8 floors you walk on,
//                and the spawn (5, 5) sits dead in the middle of room (0, 0).
//   * a POST   — both odd — is always solid. Where four rooms meet.
//   * a PASSAGE — exactly one coordinate even — is the wall between two rooms, and is open or
//                solid depending on the maze rule. Walls are 8 wide and 8 thick, so a corridor is
//                a room wide and a wall is a room thick, which is what makes the tops worth having.
//
// WHY THE PLANE IS BLOCKS OF ROOMS. A maze that fills the plane has to be generated chunk by chunk
// with nothing but the cell's own coordinates to go on, and the classic locally-computable maze —
// the binary tree, where every room carves one passage to its north or its west neighbour — is a
// perfect maze only on a FINITE grid: on the infinite plane each room's chain of carves runs off
// toward the corner at infinity and what is left behind fragments. (Measured on a 260 x 260
// pinboard: the bounded rule gives 1 component for all 67600 rooms; the unbounded one splits into
// 1605 pieces whose largest is 263 rooms, i.e. you would be sealed in a box within sight of the
// spawn.) So the plane is divided into blocks of `MAZE.block` rooms square, each block runs its own
// BOUNDED binary tree — which makes every block a perfect maze, no islands and no loops inside it —
// and the blocks are joined by forcing one doorway open on every shared border, hashed so two
// neighbours never pick the same one. Every block is therefore reachable from its neighbours and
// the whole plane is one connected maze, however far you walk.
//
// The block's own corner is hashed as well (any of the four), which is the whole reason the maze
// does not read as a repeating tile: the L-shaped spine the binary tree funnels into — a clean open
// corridor along two edges of the block, which is also the landmark you navigate a block BY — faces
// a different way in every block, and the "grain" of the tree turns with it.
//
// WALL HEIGHT, which is the other half of the brief: *"the father i get from spawn the walls of the
// maze get taller"*. Height rises linearly with distance from the spawn, so the corridors deepen as
// you run. Two things follow from how that is built, and both are deliberate:
//
//   * the TOP of every wall is a flat 8-unit slab exactly `h` above the floor, and `h` only gains
//     0.4 units per cell of travel (under the body's own `STEP`, 1.05), so a run of wall tops is a
//     PLATEAU you can simply run along, and it climbs 0.8 units a room under you as you go. The tops
//     are not one continuous plane — the maze's own corridors are the gaps between the plateaus —
//     but the plateaus are large: measured over a 512-unit window, 99.4% of wall cells stand on a
//     plateau of eight cells or more, the median plateau is 56 cells and the biggest is 319, so
//     there are real rooftops up there with the canyon slots as the channels between them. That is
//     the high road, and it is why the tops are worth climbing at the spawn, where the walls are
//     still low: at `MAZE.base` (2.8) the first climb is a short one, and after it the map opens up
//     above you.
//   * the maze is therefore TWO MAPS AT ONCE, which is the point: at the spawn you can be up on the
//     roofs within a few seconds and the far maze is a view you look out over from a rim; walk deep
//     instead and the backs of those same roofs are 80 units over your head and the maze is a
//     stone slot you are down inside, with the daylight a line at the top of the frame.
// ---------------------------------------------------------------------------

export const MAZE = {
  cell: CELL,          // one maze cell: the world's own 8, so walls land on the existing lattice
  block: 8,            // rooms per side of one binary-tree block
  base: 2.8,           // wall height at the spawn, in world units
  slope: 0.05,         // ...and what one world unit of distance from the spawn adds to it
  min: 2.6,            // floor on the height, so nothing anywhere is a kerb to be stepped over
  max: 80,             // ...and a ceiling, so the far field stays a canyon and not a black slot
  spawnX: 5,           // the player's own start (see `Player.respawn`) — the centre of the bowl
  spawnZ: 5,
  noiseScale: 1 / 46,  // the undulation's wavelength, in world units (~5.5 cells across)
  noiseAmp: 6,         // how far the undulation can move a wall, at full strength
  cap: 0.9,            // the coping along the top of every wall, in world units
  seed: 7717,
};

// The four directions a room can carve, plus "none" for the one room per block that is the corner
// the whole block funnels into. `a` is the room's x index and `b` its z index.
const C_NONE = 0;
const C_PX = 1;
const C_NX = 2;
const C_PZ = 3;
const C_NZ = 4;

// Which local corner of its block a block's spine runs to. 0 is the low/low corner, 1 high-x/low-z,
// 2 high/high, 3 low/high — four rotations of the same L, one per block, so the maze's grain does
// not line up across a border.
function mazeCorner(i, j) {
  return hashInt(i, j, MAZE.seed + 7) & 3;
}

// The ONE neighbour room (a, b) carves a passage to. A room on the spine's column walks along the
// spine's row, a room on the spine's row walks along the spine's column, an interior room picks an
// axis by hash, and the corner room carves nothing. Every room therefore has a chain of carves
// that strictly shortens its distance to the corner, which is what makes the block a tree.
function mazeCarve(a, b) {
  const B = MAZE.block;
  const i = Math.floor(a / B);
  const j = Math.floor(b / B);
  const la = a - i * B;
  const lb = b - j * B;
  const r = mazeCorner(i, j);
  const caLo = r === 0 || r === 3;      // r 0/3 -> the spine's column is la 0, else la B-1
  const cbLo = r === 0 || r === 1;      // r 0/1 -> the spine's row is lb 0, else lb B-1
  const laC = caLo ? 0 : B - 1;
  const lbC = cbLo ? 0 : B - 1;
  if (la === laC && lb === lbC) return C_NONE;
  const dc = caLo ? -1 : 1;
  const dr = cbLo ? -1 : 1;
  if (la === laC) return dr > 0 ? C_PZ : C_NZ;
  if (lb === lbC) return dc > 0 ? C_PX : C_NX;
  return (hashInt(a, b, MAZE.seed + 11) & 1) === 0
    ? (dc > 0 ? C_PX : C_NX)
    : (dr > 0 ? C_PZ : C_NZ);
}

// Is the wall between room (a, b) and the neighbour at (da, db) open? Either room carving into the
// other opens it, and nothing else does — so a room's one carve is the whole of its right-of-way,
// and its other three walls are walls unless a neighbour carves through them.
function mazeEdgeOpen(a, b, da, db) {
  const c1 = mazeCarve(a, b);
  if (da > 0 ? c1 === C_PX : da < 0 ? c1 === C_NX : db > 0 ? c1 === C_PZ : c1 === C_NZ) return true;
  const c2 = mazeCarve(a + da, b + db);
  if (da > 0 ? c2 === C_NX : da < 0 ? c2 === C_PX : db > 0 ? c2 === C_NZ : c2 === C_PZ) return true;
  return false;
}

// Is the cell at (u, v) solid? `u`/`v` are GLOBAL cell coordinates — the world's own `x / CELL` and
// `z / CELL` — which is the only address the generator has and all it needs.
function mazeCellSolid(u, v) {
  const uo = u & 1;
  const vo = v & 1;
  if (!uo && !vo) return false;                 // a room
  if (uo && vo) return true;                    // a post
  const B = MAZE.block;
  if (uo) {
    // The wall between rooms (aL, b) and (aL + 1, b).
    const aL = (u - 1) >> 1;
    const b = v >> 1;
    if (mazeEdgeOpen(aL, b, 1, 0)) return false;
    // ...and when that pair straddles a BLOCK border, its own forced doorway. Exactly one cell
    // along every shared border is open, so the two blocks cannot be sealed off from each other.
    const iR = (aL + 1) / B;
    if (iR === Math.floor(iR)) {
      const j = Math.floor(b / B);
      if (b - j * B === hashInt(iR - 1, j, MAZE.seed + 31) % B) return false;
    }
    return true;
  }
  // The wall between rooms (a, bN) and (a, bN + 1).
  const a = u >> 1;
  const bN = (v - 1) >> 1;
  if (mazeEdgeOpen(a, bN, 0, 1)) return false;
  const jS = (bN + 1) / B;
  if (jS === Math.floor(jS)) {
    const i = Math.floor(a / B);
    if (a - i * B === hashInt(i, jS - 1, MAZE.seed + 41) % B) return false;
  }
  return true;
}

// How tall the wall over a point is. Linear in the distance from the spawn, undulated so the bowl
// is a landscape rather than a bullseye, and held between `min` and `max`.
export function mazeWallHeight(x, z) {
  const dx = x - MAZE.spawnX;
  const dz = z - MAZE.spawnZ;
  const d = Math.sqrt(dx * dx + dz * dz);
  let h = MAZE.base + MAZE.slope * d;
  // The undulation is nearly nothing at the spawn and opens out with distance, because a field
  // near the camp has to stay level to be run through and the same field 600 units out has room
  // for hills.
  const n = fbm2(x * MAZE.noiseScale, z * MAZE.noiseScale, MAZE.seed, 3) - 0.5;
  h += n * MAZE.noiseAmp * Math.min(1, 0.15 + d / 260);
  if (h < MAZE.min) h = MAZE.min;
  else if (h > MAZE.max) h = MAZE.max;
  return h;
}

// THE WALL'S OWN VERTICAL BAKE. A canyon reads as deep because its walls are dark at the base and
// lit at the crown, and the world's own shading cannot say that here: the occluder grid stops at
// `MAXH` and a wall's faces only sample the air beside them, so a 70-unit wall would be one flat
// value from the floor to the sky and read as a painted stripe. So the colour is taken down at the
// base and lifted at the top — with the DEPTH OF THE BAKE ITSELF scaled by the wall's height, so a
// 3-unit kerb by the spawn (under `h` = 5 the bake is exactly nothing) is at its own material's
// colour from the floor up, while the foot of a wall 47 units or taller stands at 0.48 of the stone
// above it: the deep canyons are a little over twice as dark at the foot as at the rim, and the
// shallow ones are not darkened at all.
function mazeWallShade(y, h) {
  const depth = 0.52 * Math.min(1, Math.max(0, (h - 5) / 42));
  const t = h > 0 ? y / h : 0;
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - depth * Math.pow(1 - u, 1.3);
}

// A wall's own colour: the local biome's palette, so the maze is built out of the ground it stands
// on, with a per-wall shade so two walls of the same palette colour are never quite the same
// stone. Picked by cell, not by chunk, so a two-colour border between two biomes runs through the
// maze as a seam rather than jumping at a chunk line.
function mazeWallColor(u, v) {
  const S = MAZE.cell;
  const b = biomeDominant(u * S + S * 0.5, v * S + S * 0.5);
  const c = b.palette[hashInt(u, v, MAZE.seed + 21) % b.palette.length];
  const f = 1 + ((hashInt(u, v, MAZE.seed + 23) % 1000) / 1000 - 0.5) * 0.15;
  return [c[0] * f, c[1] * f, c[2] * f];
}

// One wall cell's boxes. The body is cut into ~10-unit courses so the vertical bake has somewhere
// to land (and so a break bites the top of a tall wall instead of deleting the whole storey), and
// the last `cap` units are a LIT COPING: the same stone, lifted and a little de-saturated, which is
// what gives every corridor a readable rim and every terrace a visible edge. The coping is FLUSH
// with both faces — nothing proud of them — because these faces are wall-run and wall-climb
// surfaces, and a lip is a run that stops dead at every wall.
function pushMazeWall(u, v, out) {
  const S = MAZE.cell;
  const x = u * S;
  const z = v * S;
  const h = mazeWallHeight(x + S * 0.5, z + S * 0.5);
  const c = mazeWallColor(u, v);
  const cap = Math.min(MAZE.cap, h * 0.34);
  const bodyH = h - cap;
  const n = Math.max(1, Math.round(bodyH / 10));
  const segH = bodyH / n;
  for (let k = 0; k < n; k++) {
    const y = k * segH;
    const m = mazeWallShade(y + segH * 0.5, h);
    out.push(box(x, y, z, S, segH, S, [c[0] * m, c[1] * m, c[2] * m]));
  }
  out.push(box(x, bodyH, z, S, cap, S, [c[0] * 0.74 + 0.17, c[1] * 0.74 + 0.17, c[2] * 0.72 + 0.15]));
}

// One chunk of maze: walk its 4 x 4 cells in a fixed order (the box list's own order is the damage
// address, so it has to be the same list every time this chunk is built) and emit a wall for every
// solid cell the camp has not reserved. `used` is the same array the field generator's roll
// consults, so the landmark, the arena and the yard push the maze out of themselves exactly the way
// they push scenery out — which is what leaves the camp an open pocket with the maze around it.
function buildMazeChunk(ox, oz, out, used) {
  for (let i = 0; i < CELLS; i++) {
    for (let j = 0; j < CELLS; j++) {
      if (used[j * CELLS + i]) continue;
      const u = ox / CELL + i;
      const v = oz / CELL + j;
      if (!mazeCellSolid(u, v)) continue;
      pushMazeWall(u, v, out);
    }
  }
}

// ---------------------------------------------------------------------------
// THE HILLS HAS NO SCENERY AT ALL
//
// The map used to plant three things on its field — trees (a trunk to wall-run, a canopy to land
// on), rocks (chest-high things to vault) and bushes — because at the time "an empty field is a
// plane". The user's later brief took that back in one line: *"remove the trees and rock and
// bushes in the bliss hills map and add more grass i want the entire feild to be grass"*. So the
// hills generator now writes NOTHING onto the box list: every chunk of it is the height field and
// the grass that grows on it, and nothing else. The camp (the yard, the arena and the monolith,
// planted below in `buildChunk` before the world roll) is untouched — it is common to all three
// worlds and is the one place the map is authored rather than generated.
//
// Removing them costs the hills the only verticality it had, and that is the point: the map is now
// a pure SLOPE field to run down and up, which is what the slope work below is built for. It also
// makes the chunk cheaper — the box list is empty, so `buildBoxGeometry` has nothing to build and
// no collider is ever queried on the flanks.
//
// Is this a spot grass may grow? Everything the camp authored is a hard surface laid on the flat
// top — `YARD_CLEAR`'s concrete and lane paint, the arena and its rails, the monolith's plinth and
// its launch pad — so the grass keeps off it, with a metre of margin, because a tuft leaning out
// through the edge of a slab reads as a bug rather than as trim. (Read by grass.js.)
export function grassAllowedAt(x, z) {
  for (const c of [ARENA.clear, YARD_CLEAR]) {
    if (x > c.minX - 1 && x < c.maxX + 1 && z > c.minZ - 1 && z < c.maxZ + 1) return false;
  }
  if (x > SKYCUBE.x - 2 && x < SKYCUBE.x + SKYCUBE.w + 2 && z > SKYCUBE.z - 2 && z < SKYCUBE.z + SKYCUBE.d + 2) return false;
  const p = SKYCUBE.pad;
  if (x > p.x - 3 && x < p.x + p.size + 3 && z > p.z - 3 && z < p.z + p.size + 3) return false;
  return true;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.structMaterial = createMaterial({});
    // The landmark's lit trim: the same vertex-coloured world shader with an emissive floor, so
    // the neon rings are lit even at midnight. `vColor` is what the emissive is multiplied by
    // (see FRAG in ps1.js), which is why anything on this material has to carry its own colour —
    // the rings do, and nothing else in the world is ever routed here.
    this.glowMaterial = createMaterial({ emissive: 0xd9d9d9 });
    this.groundMaterial = createMaterial({ map: createGroundTexture() });
    // ...and the hills' own deck material (see "THE HILLS"): the same shader with the LAWN branch
    // switched on (see `createMaterial` in ps1.js), reading `createGrassTexture` at two scales so
    // the ground is grass at every distance rather than only where a tuft happens to stand. One
    // extra material for the whole game, chosen per chunk by `fillChunk`.
    this.grassGroundMaterial = createMaterial({ map: createGrassTexture(), lawn: true });
    this.queue = [];
    this.lastCX = 1e9;
    this.lastCZ = 1e9;
    this.queryBuf = [];
    // A second scratch list for `surfaceColorAt`, which is asked once or twice a frame while the
    // body is in contact with something. It cannot be `queryBuf`: `topBelow` is called from the
    // same frames (the blob shadow, the shard settle) and the two would overwrite each other.
    this.colorBuf = [];
    this.stats = { chunks: 0, boxes: 0 };
    // Set by main.js to the Destruction system (see destruction.js). Null means the world is
    // indestructible and the ground is the plain flat plane it always was.
    this.damage = null;
  }

  key(cx, cz) {
    return cx + "," + cz;
  }

  biomeAt(x, z) {
    return biomeAtPoint(x, z);
  }

  // Throw the whole field away — every chunk's geometry and colliders and the queue that was going
  // to build more. The box lists are all derived from `settings.world`, so this is the other half
  // of changing it: drop what is standing and stream the new generator in (see `setWorld` in
  // main.js, which is the only caller). Materials are shared and are not touched.
  clearAll() {
    for (const ch of this.chunks.values()) {
      if (!ch.group) continue;
      this.scene.remove(ch.group);
      for (let i = 0; i < ch.meshes.length; i++) ch.meshes[i].geometry.dispose();
    }
    this.chunks.clear();
    this.queue.length = 0;
    this.lastCX = 1e9;
    this.lastCZ = 1e9;
  }

  buildChunk(cx, cz) {
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;
    const rng = rngFor(cx, cz, SEED);
    const biome = biomeDominant(ox + CHUNK / 2, oz + CHUNK / 2);

    const boxes = [];
    const used = new Uint8Array(CELLS * CELLS);
    const anyUsed = (i, j, cw, cd) => {
      for (let a = i; a < i + cw; a++) {
        for (let b = j; b < j + cd; b++) if (used[b * CELLS + a]) return true;
      }
      return false;
    };

    // The landmark goes down before the roll, and its cells are marked used, so the grid
    // below never grows a structure through it.
    const landmark = cx === SKYCUBE.cx && cz === SKYCUBE.cz;
    if (landmark) {
      buildSkyCube(SKYCUBE, boxes);
      buildLaunchPad(SKYCUBE, boxes);
      const i0 = Math.max(0, Math.floor((SKYCUBE.x - ox) / CELL));
      const j0 = Math.max(0, Math.floor((SKYCUBE.z - oz) / CELL));
      const i1 = Math.min(CELLS - 1, Math.floor((SKYCUBE.x + SKYCUBE.w - 0.001 - ox) / CELL));
      const j1 = Math.min(CELLS - 1, Math.floor((SKYCUBE.z + SKYCUBE.d - 0.001 - oz) / CELL));
      for (let a = i0; a <= i1; a++) {
        for (let b = j0; b <= j1; b++) used[b * CELLS + a] = 1;
      }
      const pi = Math.min(CELLS - 1, Math.floor((SKYCUBE.pad.x - ox) / CELL));
      const pj = Math.min(CELLS - 1, Math.floor((SKYCUBE.pad.z - oz) / CELL));
      used[pj * CELLS + pi] = 1;
    }

    // The ARENA WALL (see `ARENA`), planted the same way: onto the box list before the roll, so
    // it cannot end up inside a structure. Its cells are covered by the clearing below.
    if (cx === ARENA.cx && cz === ARENA.cz) {
      const b = ARENA.wall;
      boxes.push(box(b.x, 0, b.z, b.w, b.h, b.d, ARENA_COL));
    }
    // ...and the vault rails (see `ARENA.rails`), planted the same way. NOTE they are emitted by the
    // chunk each one actually FALLS IN rather than by the arena's own chunk: the rails stand in the
    // clearing in front of the wall, which is a different chunk from the wall's, and a box filed
    // under the wrong chunk is a box no query will ever find.
    for (let r = 0; r < ARENA.rails.length; r++) {
      const q = ARENA.rails[r];
      if (Math.floor(q.x / CHUNK) !== cx || Math.floor(q.z / CHUNK) !== cz) continue;
      boxes.push(box(q.x, 0, q.z, q.w, q.h, q.d, shadeCol(ARENA_RAIL_COL, rng, 0.10)));
    }

    // ...and the training grounds themselves (see `yard.js`): the run wall and the chimney, the
    // tower with its ledge ladder, the vault bench, the slide gate and the floor paint. Planted the
    // same way the wall and the rails are — authored boxes onto the list before the roll — and
    // `YARD_CLEAR` below keeps the scenery out of the field and off every station's run-up.
    buildYard(cx, cz, boxes);

    // ...and nothing grows inside the arena's clearing — the wall, the ground the dummy stands on
    // and the spawn itself. This replaces the old hard-coded "keep chunk 0,0's first four cells
    // empty", which only ever existed to protect the spawn pad: the rectangle is authored to
    // intersect exactly those same four cells, so the rule is the same one, written down once.
    // (`YARD_CLEAR` is the second rectangle, and it is the bigger idea: the grounds are a PLACE, so
    // nothing at all grows inside the camp or on the run-ups its moves need.)
    for (const c of [ARENA.clear, YARD_CLEAR]) {
      for (let i = 0; i < CELLS; i++) {
        if (ox + i * CELL >= c.maxX || ox + (i + 1) * CELL <= c.minX) continue;
        for (let j = 0; j < CELLS; j++) {
          if (oz + j * CELL >= c.maxZ || oz + (j + 1) * CELL <= c.minZ) continue;
          used[j * CELLS + i] = 1;
        }
      }
    }

    // WHICH GENERATOR FILLS THE FIELD. `settings.world` is the switch; everything above this line
    // (the landmark, the arena and its rails, the yard, and the clearing that protects them) is
    // common to both worlds, so the camp is the same place in either and the maze starts at the
    // edge of it. The two branches below are the whole of the difference.
    if (settings.world === "maze") {
      buildMazeChunk(ox, oz, boxes, used);
    } else if (settings.world === "park") {
      // ...and the park is a height field AND a plaza's worth of furniture on it: the ramps are the
      // ground itself (`groundBaseAt`), and `buildParkChunk` plants the rails and ledges on the flat
      // decks the same field grows (see "THE SKATEPARK").
      buildParkChunk(ox, oz, boxes, used);
    } else if (settings.world === "hills") {
      // ...and the hills is a pure height field: no structures, no scenery, no boxes at all beyond
      // the camp `buildChunk` already planted above (see "THE HILLS HAS NO SCENERY AT ALL").
    } else {
      const grid = [];
      for (let i = 0; i < CELLS; i++) {
        for (let j = 0; j < CELLS; j++) grid.push([i, j]);
      }
      shuffle(rng, grid);
      for (let g = 0; g < grid.length; g++) {
        const i = grid[g][0];
        const j = grid[g][1];
        if (used[j * CELLS + i]) continue;
        if (!chance(rng, biome.density)) continue;
        const def = STRUCTURES[pickWeighted(rng, biome.weights)];
        if (!def) continue;
        let cw = 1;
        let cd = 1;
        if (def.big && chance(rng, 0.6)) {
          cw = 2;
          cd = 2;
        }
        // A `span` structure may also claim a long thin strip of cells instead of a square —
        // that is what lets a wall be 30 units long rather than 14. Either orientation.
        if (def.span && chance(rng, def.spanChance || 0.5)) {
          const flip = chance(rng, 0.5);
          cw = flip ? def.span[1] : def.span[0];
          cd = flip ? def.span[0] : def.span[1];
        }
        if (i + cw > CELLS || j + cd > CELLS) continue;
        if (anyUsed(i, j, cw, cd)) continue;
        const fx = ox + i * CELL + 1;
        const fz = oz + j * CELL + 1;
        const fw = cw * CELL - 2;
        const fd = cd * CELL - 2;
        const col = pick(rng, biome.palette);
        const made = def.build(rng, fx, fz, fw, fd, col);
        for (const b of made) boxes.push(b);
        for (let a = i; a < i + cw; a++) {
          for (let b2 = j; b2 < j + cd; b2++) used[b2 * CELLS + a] = 1;
        }
      }
    }

    const chunk = { cx, cz, group: null, meshes: [], colliders: [], pieces: null, boxDefs: boxes, pads: landmark ? [skyCubePad(SKYCUBE)] : null };
    this.chunks.set(this.key(cx, cz), chunk);
    this.fillChunk(chunk);
    return chunk;
  }

  // Build (or rebuild) one chunk's meshes and colliders out of its own box list. This is a
  // separate pass because a chunk is not immutable any more: a block that has been smashed
  // away has to leave the geometry AND the colliders, and the ground has to be re-laid over
  // any crater that has been punched into it (see destruction.js / `refreshChunk`). The box
  // list itself never changes — it is the deterministic output of the generator above — so
  // damage is addressed by slot (see voxel.js) and survives unload/reload.
  //
  // What this pass builds out of is not the box list but the PIECES: one per live box, or — for
  // a box that has had a bite taken out of it — one per surviving CELL of its own voxel grid,
  // with the whole box's own damage spent the moment it was cut. A piece carries its own
  // rectangle, colour and collider bounds and IS its own collider, so everything downstream
  // (the occluder grid, the meshes, the colliders, the UI's colour sample) is looking at the
  // same list of solids whether the chunk is whole or has been worked over.
  fillChunk(chunk) {
    const ox = chunk.cx * CHUNK;
    const oz = chunk.cz * CHUNK;
    const boxes = chunk.boxDefs;
    const damage = this.damage || null;
    const state = damage ? damage.chunkState(chunk.cx, chunk.cz) : null;
    const dead = state ? state.dead : null;
    // `carve`: box index -> the Set of cells that have been taken out of it (voxel.js). A box
    // with no entry here is whole, and costs exactly what it always did.
    const carve = state ? state.carve : null;
    const pieces = [];
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (dead && dead.has(slotOf(i))) continue;
      const gone = carve ? carve.get(i) : null;
      if (!gone) {
        pieces.push(pieceOf(b, i, chunk.cx, chunk.cz, slotOf(i)));
        continue;
      }
      const grid = gridOf(b);
      const total = cellTotal(grid);
      for (let cell = 0; cell < total; cell++) {
        if (gone.has(cell)) continue;
        pieces.push(pieceOf(cellOf(b, grid, cell), i, chunk.cx, chunk.cz, cellSlot(i, cell), cell));
      }
    }

    const occ = new Uint8Array(CHUNK * CHUNK * MAXH);
    const occSet = (wx, wy, wz) => {
      const ix = Math.floor(wx - ox);
      const iy = Math.floor(wy);
      const iz = Math.floor(wz - oz);
      if (ix < 0 || ix >= CHUNK || iz < 0 || iz >= CHUNK || iy < 0 || iy >= MAXH) return;
      occ[ix + iz * CHUNK + iy * CHUNK * CHUNK] = 1;
    };
    for (let k = 0; k < pieces.length; k++) {
      const b = pieces[k];
      for (let xx = Math.floor(b.x); xx < Math.ceil(b.x + b.w); xx++) {
        // The sweep stops at `MAXH`, the top of the occluder grid: `occSet` throws away anything
        // above it anyway, and without the clamp a maze wall that stands 80 units tall walks 50
        // columns of nothing per cell of its footprint (the tallest thing the field generator grows
        // is a 26-unit buttress, so this only costs anything in the maze).
        for (let yy = Math.floor(b.y); yy < Math.min(Math.ceil(b.y + b.h), MAXH); yy++) {
          for (let zz = Math.floor(b.z); zz < Math.ceil(b.z + b.d); zz++) occSet(xx, yy, zz);
        }
      }
    }
    const occluder = (x, y, z) => {
      const ix = Math.floor(x - ox);
      const iy = Math.floor(y);
      const iz = Math.floor(z - oz);
      if (ix < 0 || ix >= CHUNK || iz < 0 || iz >= CHUNK || iy < 0 || iy >= MAXH) return false;
      return occ[ix + iz * CHUNK + iy * CHUNK * CHUNK] === 1;
    };

    const shadow = new Float32Array(CHUNK * CHUNK);
    for (let ix = 0; ix < CHUNK; ix++) {
      for (let iz = 0; iz < CHUNK; iz++) {
        let c = 0;
        for (let y = 0; y < 5; y++) {
          if (occ[ix + iz * CHUNK + y * CHUNK * CHUNK]) c++;
        }
        shadow[ix + iz * CHUNK] = Math.min(1, c * 0.16);
      }
    }
    const blurred = new Float32Array(CHUNK * CHUNK);
    for (let ix = 0; ix < CHUNK; ix++) {
      for (let iz = 0; iz < CHUNK; iz++) {
        let s = 0;
        let n = 0;
        for (let a = -2; a <= 2; a++) {
          for (let b2 = -2; b2 <= 2; b2++) {
            const nx = ix + a;
            const nz = iz + b2;
            if (nx < 0 || nx >= CHUNK || nz < 0 || nz >= CHUNK) continue;
            s += shadow[nx + nz * CHUNK];
            n++;
          }
        }
        blurred[ix + iz * CHUNK] = n ? s / n : 0;
      }
    }
    const shadeAt = (wx, wz) => {
      const ix = Math.min(CHUNK - 1, Math.max(0, Math.floor(wx - ox)));
      const iz = Math.min(CHUNK - 1, Math.max(0, Math.floor(wz - oz)));
      return 1 - 0.62 * blurred[ix + iz * CHUNK];
    };

    const group = new THREE.Group();
    const groundGeo = buildGroundGrid(ox, oz, CHUNK, GROUND_CELLS, {
      uvScale: 2,
      light: 0.95,
      shadeAt,
      colorAt: groundColorAt,
      // The height field the deck is drawn from. It is `World.terrainHeight` — the base field of
      // the world (0 everywhere but the hills) plus whatever a crater has beaten out of it — which
      // is the same number the body's own floor reads, so the drawn deck and the floor agree by
      // construction. In the hills the base is non-zero and the ground is a real landscape; in the
      // other two worlds it is 0 and this is exactly the old crater-only pass.
      heightAt: damage || settings.world === "hills" || settings.world === "park"
        ? (x, z) => this.terrainHeight(x, z) : null,
      darkAt: damage ? (x, z) => damage.terrainDark(x, z) : null,
    });
    // ...and the deck's own map: the paving slab under the concrete world, the LAWN under the
    // grass (see `createGrassTexture` and "THE LAWN").
    const groundMesh = new THREE.Mesh(groundGeo, settings.world === "hills" ? this.grassGroundMaterial : this.groundMaterial);
    groundMesh.matrixAutoUpdate = false;
    group.add(groundMesh);

    const meshes = [groundMesh];
    const liveBoxes = [];
    const glowBoxes = [];
    for (let k = 0; k < pieces.length; k++) {
      const b = pieces[k];
      (b.glow ? glowBoxes : liveBoxes).push(b);
    }
    const boxOpts = {
      uvScale: 2,
      occluder,
      ambient: 0.46,
      diffuse: 0.5,
      hemi: 0.1,
    };
    if (liveBoxes.length) {
      const geo = buildBoxGeometry(liveBoxes, boxOpts);
      const mesh = new THREE.Mesh(geo, this.structMaterial);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      meshes.push(mesh);
    }
    if (glowBoxes.length) {
      const geo = buildBoxGeometry(glowBoxes, boxOpts);
      const mesh = new THREE.Mesh(geo, this.glowMaterial);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      meshes.push(mesh);
    }

    if (damage) {
      const decalGeo = damage.buildDecalGeometry(chunk);
      if (decalGeo) {
        const decalMesh = new THREE.Mesh(decalGeo, damage.crackMaterial);
        decalMesh.matrixAutoUpdate = false;
        decalMesh.renderOrder = 2;
        group.add(decalMesh);
        meshes.push(decalMesh);
      }
    }
    this.scene.add(group);

    const colliders = [];
    for (let k = 0; k < pieces.length; k++) {
      const b = pieces[k];
      // `noCol` boxes are drawn but never solid: the landmark's window grid is 6 cm proud of the
      // face, and 300-odd 6 cm colliders would be pure cost to every wall query near the tower
      // for a lip nobody can stand on.
      if (b.noCol) continue;
      // A piece already is its own collider: `minX`... `maxZ` came off the same rectangle the
      // geometry was built from, and `slot` is the address destruction hits it by.
      colliders.push(b);
    }

    chunk.group = group;
    chunk.meshes = meshes;
    chunk.colliders = colliders;
    chunk.pieces = pieces;
    chunk.live = pieces.length;
  }

  // Smash a hole in the world and put it back together: called by destruction.js when a block
  // is destroyed or the ground is cratered. The chunk's own box list is kept, so this is a
  // rebuild of derived geometry only.
  refreshChunk(cx, cz) {
    const ch = this.chunks.get(this.key(cx, cz));
    if (!ch) return null;
    if (ch.group) {
      this.scene.remove(ch.group);
      for (let i = 0; i < ch.meshes.length; i++) ch.meshes[i].geometry.dispose();
    }
    this.fillChunk(ch);
    return ch;
  }

  // Top of the ground at a point: the world's own base field (0 everywhere but the hills) with
  // whatever a crater has beaten into it subtracted. Pure function of world position, so the
  // player's floor and the drawn ground always agree.
  terrainHeight(x, z) {
    const base = groundBaseAt(x, z);
    return this.damage ? base + this.damage.terrainHeight(x, z) : base;
  }

  // The launch pad under a point, if there is one — the player asks this every frame its feet
  // are down. Only ever one chunk in the world carries a pad (`chunk.pads` is null everywhere
  // else), so the walk is a null check per loaded chunk and nothing more.
  padAt(x, footY, z) {
    for (const ch of this.chunks.values()) {
      const pads = ch.pads;
      if (!pads) continue;
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
        if (footY < p.topY - 0.5 || footY > p.topY + 0.45) continue;
        return p;
      }
    }
    return null;
  }

  // ...and the same pad seen from anywhere within `r` of it, which is what the HUD uses to
  // introduce the move before you are standing on it.
  nearPad(x, z, r) {
    const r2 = r * r;
    for (const ch of this.chunks.values()) {
      const pads = ch.pads;
      if (!pads) continue;
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        const cx = (p.minX + p.maxX) * 0.5;
        const cz = (p.minZ + p.maxZ) * 0.5;
        const dx = x - cx;
        const dz = z - cz;
        if (dx * dx + dz * dz <= r2) return p;
      }
    }
    return null;
  }

  rebuildQueue(ccx, ccz) {
    const R = settings.viewDistance;
    const list = [];
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > (R + 0.5) * (R + 0.5)) continue;
        const cx = ccx + dx;
        const cz = ccz + dz;
        if (this.chunks.has(this.key(cx, cz))) continue;
        list.push({ cx, cz, d2 });
      }
    }
    list.sort((a, b) => a.d2 - b.d2);
    this.queue = list;
  }

  // Build the first `count` chunks of the ring around a point, nearest first — the SYNCHRONOUS half of
  // the streamer, used by the boot and by a world swap so that there is terrain under the player from
  // the very first frame.
  //
  // ...and since session 142 it takes a TIME BUDGET as well as a count (`budgetMs`, 0 = none), because
  // the count on its own is the wrong unit. Measured on the live page: the whole of `viewDistance` 3 is
  // only **37 chunks**, at **~2.3 ms each**, so the boot's `primeChunks(px, pz, 30)` was **69 ms** of
  // main-thread work inside the module's own top-level — one long task on the critical path, before the
  // first frame had ever been drawn. A count cannot be tuned for that job: 30 chunks is a tenth of a
  // second on a fast desktop and considerably more on a phone, and the same number has to serve both.
  // The budget can. The leftover queue is not dropped, it is left for `update()`, which already streams
  // at `running ? 6 : 2` ms a frame — so the world still finishes filling in, just a few chunks a frame
  // instead of all at once, and at the title screen the camera is behind a translucent overlay anyway.
  // (The first chunk of the ring is always built whatever the clock says: it is the one the player is
  // standing on, at `d2 = 0`, and a boot with no ground under the body is not a saving.)
  primeChunks(px, pz, count, budgetMs = 0) {
    const ccx = Math.floor(px / CHUNK);
    const ccz = Math.floor(pz / CHUNK);
    this.rebuildQueue(ccx, ccz);
    const t0 = budgetMs > 0 ? performance.now() : 0;
    let n = 0;
    while (this.queue.length && n < count) {
      const c = this.queue.shift();
      this.buildChunk(c.cx, c.cz);
      n++;
      if (budgetMs > 0 && performance.now() - t0 >= budgetMs) break;
    }
  }

  update(px, pz, budgetMs = 6) {
    const ccx = Math.floor(px / CHUNK);
    const ccz = Math.floor(pz / CHUNK);
    if (ccx !== this.lastCX || ccz !== this.lastCZ) {
      this.lastCX = ccx;
      this.lastCZ = ccz;
      this.rebuildQueue(ccx, ccz);
      const R = settings.viewDistance + 1;
      for (const [k, ch] of this.chunks) {
        if (Math.abs(ch.cx - ccx) > R || Math.abs(ch.cz - ccz) > R) {
          this.scene.remove(ch.group);
          for (let i = 0; i < ch.meshes.length; i++) ch.meshes[i].geometry.dispose();
          this.chunks.delete(k);
        }
      }
    }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const c = this.queue.shift();
      if (!this.chunks.has(this.key(c.cx, c.cz))) this.buildChunk(c.cx, c.cz);
    }
  }

  queryXZ(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    const c0x = Math.floor(minX / CHUNK);
    const c1x = Math.floor(maxX / CHUNK);
    const c0z = Math.floor(minZ / CHUNK);
    const c1z = Math.floor(maxZ / CHUNK);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const ch = this.chunks.get(this.key(cx, cz));
        if (!ch) continue;
        for (let i = 0; i < ch.colliders.length; i++) out.push(ch.colliders[i]);
      }
    }
    return out;
  }

  // What the world looks like right here: the colour of every LIVE block within `radius` of a
  // point, averaged with a weight that rises with the block's size and falls with the square of
  // its distance, written into `out` (a 3-array). Returns the total weight, so a caller can
  // tell "surrounded by geometry" from "nothing for miles" — the UI's accent uses exactly that
  // (see adapt.js). Broken blocks are not in the list at all, so smashing a wall genuinely
  // changes what colour the interface takes from standing next to it.
  sampleAround(x, y, z, radius, out) {
    let r = 0;
    let g = 0;
    let b = 0;
    let w = 0;
    const c0x = Math.floor((x - radius) / CHUNK);
    const c1x = Math.floor((x + radius) / CHUNK);
    const c0z = Math.floor((z - radius) / CHUNK);
    const c1z = Math.floor((z + radius) / CHUNK);
    const r2 = radius * radius;
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const ch = this.chunks.get(this.key(cx, cz));
        if (!ch) continue;
        const boxes = ch.pieces;
        if (!boxes) continue;
        for (let i = 0; i < boxes.length; i++) {
          const bx = boxes[i];
          const dx = bx.x + bx.w * 0.5 - x;
          const dy = bx.y + bx.h * 0.5 - y;
          const dz = bx.z + bx.d * 0.5 - z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          // sqrt of the volume, so a 1x1x1 detail and a 12x4x1 slab are weighted by how much
          // of the view they actually take up rather than by their raw solid volume.
          const wi = Math.sqrt(bx.w * bx.h * bx.d) / (1 + d2 * 0.2);
          if (wi <= 0) continue;
          r += bx.c[0] * wi;
          g += bx.c[1] * wi;
          b += bx.c[2] * wi;
          w += wi;
        }
      }
    }
    if (w > 0) {
      out[0] = r / w;
      out[1] = g / w;
      out[2] = b / w;
    }
    return w;
  }

  // What is the body actually TOUCHING here, and what colour is it? The colour of the nearest
  // live collider within `reach` — its own `box.c`, the very value `buildBoxGeometry` paints that
  // box's vertices with — or the biome's ground colour when there is nothing solid within reach.
  //
  // This exists for the FX that are supposed to come off the surface the body is in contact with:
  // the grit a boot kicks off a wall, the spray and the skid a slide tears out of the deck. Those
  // used to be drawn in the biome's own fog dust wherever the player was, so skidding to a stop on
  // a painted slab threw meadow, and a wall kick off the landmark threw it too.
  //
  // `reach` is small on purpose — a contact, not a neighbourhood (for scale, the character is
  // about 1.8 units and its half-width `P.HX` is well under that). `floor` restricts the answer to
  // the surface UNDER the point (a collider whose top face is at or just below it): that is what
  // the deck under a sliding body is, and without it a wall the body is sliding past would win the
  // nearest-collider test and paint the skid with the wall's colour.
  surfaceColorAt(x, y, z, out, reach = 0.3, floor = false) {
    const cols = this.colorBuf;
    this.queryXZ(x - reach, z - reach, x + reach, z + reach, cols);
    let best = null;
    let bd = Infinity;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (floor && c.maxY > y + 0.12) continue; // a wall beside you is not the deck under you
      const dx = Math.max(c.minX - x, 0, x - c.maxX);
      const dy = Math.max(c.minY - y, 0, y - c.maxY);
      const dz = Math.max(c.minZ - z, 0, z - c.maxZ);
      const d = Math.hypot(dx, dy, dz);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best && bd <= reach && best.c) {
      out[0] = best.c[0];
      out[1] = best.c[1];
      out[2] = best.c[2];
      return out;
    }
    const g = groundColorAt(x, z);
    out[0] = g[0];
    out[1] = g[1];
    out[2] = g[2];
    return out;
  }

  topBelow(x, z, yStart, maxDrop) {
    const out = this.queryBuf;
    this.queryXZ(x - 0.01, z - 0.01, x + 0.01, z + 0.01, out);
    let best = 0;
    let found = false;
    for (let i = 0; i < out.length; i++) {
      const c = out[i];
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
      if (c.maxY > yStart) continue;
      if (c.maxY < yStart - maxDrop) continue;
      if (!found || c.maxY > best) {
        best = c.maxY;
        found = true;
      }
    }
    // Nothing solid under the point: the floor there is the ground itself, which is flat at
    // 0 unless a crater has been sunk into it. Without this the blob shadow would keep
    // hovering at the rim of a hole the player is standing in.
    return found ? best : this.terrainHeight(x, z);
  }

  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    const out = this.queryBuf;
    this.queryXZ(Math.min(ox, ex) - 1, Math.min(oz, ez) - 1, Math.max(ox, ex) + 1, Math.max(oz, ez) + 1, out);
    const o = [ox, oy, oz];
    const d = [dx, dy, dz];
    const lo = [0, 0, 0];
    const hi = [0, 0, 0];
    const bmin = [0, 0, 0];
    const bmax = [0, 0, 0];
    let bestT = maxDist;
    let hit = null;
    let hitAxis = -1;
    for (let i = 0; i < out.length; i++) {
      const c = out[i];
      bmin[0] = c.minX;
      bmin[1] = c.minY;
      bmin[2] = c.minZ;
      bmax[0] = c.maxX;
      bmax[1] = c.maxY;
      bmax[2] = c.maxZ;
      let t0 = 0;
      let t1 = bestT;
      let ok = true;
      let axis = -1;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-8) {
          if (o[a] < bmin[a] || o[a] > bmax[a]) {
            ok = false;
            break;
          }
          continue;
        }
        lo[a] = bmin[a] - o[a];
        hi[a] = bmax[a] - o[a];
        let ta = lo[a] / d[a];
        let tb = hi[a] / d[a];
        if (ta > tb) {
          const tmp = ta;
          ta = tb;
          tb = tmp;
        }
        if (ta > t0) {
          t0 = ta;
          axis = a;
        }
        if (tb < t1) t1 = tb;
        if (t0 > t1) {
          ok = false;
          break;
        }
      }
      if (ok && t0 > 0 && t0 < bestT) {
        bestT = t0;
        hit = c;
        hitAxis = axis;
      }
    }
    if (!hit) return null;
    // The face the ray came in through, so callers that need a normal (the wall kick's reach
    // probe) do not have to guess which side of the box they are looking at.
    const nx = hitAxis === 0 ? (d[0] > 0 ? -1 : 1) : 0;
    const ny = hitAxis === 1 ? (d[1] > 0 ? -1 : 1) : 0;
    const nz = hitAxis === 2 ? (d[2] > 0 ? -1 : 1) : 0;
    return { t: bestT, box: hit, nx, ny, nz };
  }
}

export { BIOMES };
