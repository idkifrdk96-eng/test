import * as THREE from "./three.js";
import { rngFor } from "./rng.js";
import { CHUNK, GROUND_CELLS, groundBaseAt, groundColorAt, groundDebrisColorAt } from "./world.js";
import { NO_COLOR, cellAt, cellOf, cellSlot, cellTotal, defOfSlot, gridOf, interiorOf, isCuttable, pieceOf, slotOf, topCellAt } from "./voxel.js";
import { buildShardGeometry } from "./geom.js";
import { createMaterial, shared } from "./ps1.js";

// Destruction: what happens to the world when you keep putting your boot into the same square
// of it.
//
// The design rule is that nothing here knows what it is breaking. Damage is addressed to the
// two things every surface in this game already is — a *collider* (a piece of a chunk's own,
// deterministic box list, addressed by a slot) or the *ground plane* under a point — so every
// structure that exists now, and every structure someone adds to `STRUCTURES` later, is
// destructible for free. There is no biome table, no material list and no per-structure special
// case in this file.
//
// ONE PRIMITIVE, EVERY ATTACK (see `strike`): the entry point used to be the ground slam's own
// (`impact`, still here and still the ground address), and a slam is still the thing this file
// was built around. But a blow into a WALL is the same blow at the same contact — the same
// arithmetic, the same crack, the same break, the same shards — and the only thing that differs
// is which FACE of which solid it is addressed to and where the crack web is therefore drawn. So
// a strike carries the surface it is addressed to ("ground" or "wall", read off the blow's own
// direction when the attack does not say), and every verb in the game — the slam, the wall
// kick, the clinch's smash, the whirl's slam, a thrown body meeting a face — feeds the one call.
// A new attack gets the whole system by saying which surface it lands on.
//
// A surface takes damage in three visible stages:
//   1. CRACK   — a web of cracks opens on the face, keyed to where you actually hit it: dirt
//                under the break, a dark core, and a chipped edge on the lightward side (see
//                the crack geometry section — the look is built in, not textured on)
//   2. HEAVY   — the web grows branches and thickens (and the ground starts to give)
//   3. BREAK   — it unstitches: a block leaves the chunk's geometry AND its colliders and
//                bursts into loose polygonal prisms; the ground sinks into a crater (which
//                the player's floor follows, because `World.terrainHeight` is the same
//                function the drawn ground is built from).
//
// A BREAK TAKES A PART OF A BIG OBJECT, NOT THE OBJECT. What the third stage actually removes
// is a cell of the box you are standing on (see voxel.js): a box with no inside worth cutting —
// a 2-unit cube, a kerb, a window pane — still goes whole, and a box big enough to be cut (a
// 30-unit wall face, a storey of the monolith, a terrace slab) loses the cell under the boot
// and keeps the rest. That is the difference between one slam deleting a wall and one slam
// putting a hole in it: keep working the same spot and the hole deepens into a pit, walks
// sideways as the cells around it crack, and finally cuts the object in two — which is what
// "the object is destructible" has to mean for an object that is forty times the size of the
// player. The rule needs nothing new in here, because a slot is a slot (a cell is addressed by
// `cellSlot(idx, cell)` and a whole box by `slotOf(idx)`), so a bit taken out of a wall is hit,
// cracked, spread into and forgotten exactly like a pebble is.
//
// State is keyed by (chunk, slot) / (patch of ground), never by the live mesh, so a chunk that
// streams out and back in comes back exactly as broken as you left it.
//
// How much damage: `power` is the slam's own 0..1 (drop height, see player.js), hardness grows
// with the cube root of a block's volume, and a full-power slam is worth 0.75 "units". So a
// pebble goes in two boots, a mid block in three or four, and a 20-unit wall in about six.
//
// The GROUND is a much tougher customer than any structure standing on it. Dirt does not shear
// off in blocks the way a wall does: it deforms, and a hole in it is a hole you *dig*. So the
// ground runs on its own hardness multiplier (`GROUND_HARD`), which is what makes a full-power
// slam good for about a sixth of a patch and a crater something you stand there and work for
// rather than something that happens on the second boot. Every ground number below is stated in
// boots-of-a-full-power-slam so it can be re-tuned without re-deriving the arithmetic:
//
//   force        = 0.3 + power * 0.65            (0.3 .. 0.95)
//   dmg per hit  = force / GROUND_HARD           (0.06 .. 0.19 at GROUND_HARD 5)
//   first cracks = CRACK / dmg                   (2 hits at full power, 3 typical, 6 weak)
//   crater       = BREAK / dmg                   (6 at full power, 8 typical, 11 weak)

const PATCH = 2; // world units of the ground-damage grid
const CRACK = 0.34; // damage at which the first cracks show
const BREAK = 1.0; // ...and at which the surface comes apart
const SPREAD = 0.62; // fraction of a ground hit that bleeds into the patches around it
const SPREAD_CAP = 0.82; // a patch only ever splashed can crack, never unstitch on its own
const GROUND_HARD = 5.0;
const BLOCK_SPREAD = 0.62; // fraction of a break that bleeds into the blocks touching it (the
// ground's own SPREAD: the two are the same idea, measured against the same thresholds — a break
// cracks the blocks against it and is gone by the one after that)
const BLOCK_SPREAD_CAP = 0.82; // a block only ever splashed can crack, never come apart on its own
const MAX_SHARDS = 76;
const SHARD_G = 30;
const CRATER_DEPTH_MAX = 3.4;
const CRATER_R_MAX = 4.6;
const TAU = Math.PI * 2;

const tmpCol = [0, 0, 0];
// The empty options bag of a ground strike (`impact`). A shared frozen-shape stand-in rather
// than a literal, because `strike` is on the per-frame path of every attack in the game.
const NONE = {};
function debrisOnGround(x, z) {
  const c = groundDebrisColorAt(x, z);
  tmpCol[0] = c[0];
  tmpCol[1] = c[1];
  tmpCol[2] = c[2];
  return tmpCol;
}

// ---------------------------------------------------------------------------
// THE SURFACE PALETTE
//
// A break is only ever drawn in the colours of the thing it is a break in. That pair — the
// surface's own colour and the material its inside is made of — is what every tone in the crack
// section is derived from, and it is module state (`surfTop` / `surfDirt`) rather than an
// argument because `crackTones` bakes the whole tone set once per damaged surface and the
// ribbons then read it: one surface's palette can never leak onto another surface's face.
//
// There are two of them, and they differ on purpose:
//
//   * the GROUND's comes from the biome (`groundColorAt` / `groundDebrisColorAt`) — soil goes
//     brown, so a crack in the meadow is meadow dirt and one in the dunes is dune dirt;
//   * a BLOCK's comes from the block itself (`box.c`, the very colour `buildBoxGeometry` paints
//     its vertices with), because a painted box's inside is the same paint taken down, not
//     turned to soil. A red crate's break is dark red; the ground's version of red would be
//     brown, and a crack drawn in another material's colour is the one thing that gives the
//     whole effect away as a decal laid on top rather than a hole in the thing.
const surfTop = [0, 0, 0];
const surfDirt = [0, 0, 0];

function surfaceOfGround(x, z) {
  const g = groundColorAt(x, z);
  const d = groundDebrisColorAt(x, z);
  surfTop[0] = g[0];
  surfTop[1] = g[1];
  surfTop[2] = g[2];
  surfDirt[0] = d[0];
  surfDirt[1] = d[1];
  surfDirt[2] = d[2];
}

// The inside of a block (`interiorOf`, voxel.js): the same hue taken down hard, hue preserved,
// because a painted box's inside is the same paint taken down and not turned to soil. It is
// shared with the voxel model — the cells that live inside a cut box are painted with it, so
// the inside of a bite is the inside of the thing the bite came out of.
function surfaceOfBox(c) {
  surfTop[0] = c[0];
  surfTop[1] = c[1];
  surfTop[2] = c[2];
  interiorOf(c, surfDirt);
}

// What a break throws up, as the colour the caller's dust should be. This is the material's own
// colour lifted toward white: far enough off the bulk that it reads as fines rather than as a
// smear of the surface, and — the reason for the lift at all — a dark block's dust has to be
// visible (plain `SKY_CORE` at 0.075 would throw a black puff nobody can see).
const DUST_LIFT = 0.42;

function dustOf(c) {
  return [
    clamp(c[0] * (1 - DUST_LIFT) + DUST_LIFT, 0, 1.3),
    clamp(c[1] * (1 - DUST_LIFT) + DUST_LIFT, 0, 1.3),
    clamp(c[2] * (1 - DUST_LIFT) + DUST_LIFT, 0, 1.3),
  ];
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// An irregular convex ring, used as a shard's cross-section. Radii are jittered per point and
// the whole ring is lumpy, so no two prisms read as the same chunk of anything.
function polyRing(rng, rx, rz, n) {
  const pts = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rng() - 0.5) * (TAU / n) * 0.65;
    const r = 0.58 + rng() * 0.42;
    pts[i] = [Math.cos(a) * rx * r, Math.sin(a) * rz * r];
  }
  return pts;
}

// ---- crack geometry -------------------------------------------------------------------
// A crack is a break in a surface, and a flat decal only reads as one because of three things,
// each of which is built in here rather than hoped for:
//
//   1. THE CROSS-SECTION IS A GROOVE, NOT A LINE. A hard dark line on pale ground reads as a pen
//      mark no matter how thin it is. Every run is drawn as three ribbons side by side: a narrow
//      dark core, and a pair of dirt-coloured flanks either side of it whose *normals lean in
//      toward the crack*. That lean is the whole trick — the shader lights the two flanks
//      differently, one catching the sun and one falling into shade, so the strip reads as a
//      trench with two walls instead of a stroke. Because it comes from the normal, it also
//      keeps working as the sun moves, and it costs one extra quad per side.
//      (The previous version faked this with a bright highlight strip along one edge. Do not go
//      back to that: a flat bright strip on a flat dark strip is a raised plank with a lit edge,
//      and that is exactly how it read.)
//   2. IT TAPERS, AND IT FADES. Constant width in a constant colour is the other thing that gives
//      a decal away. A run thins toward its tip *and* loses contrast toward it (see `crackStrips`)
//      — the width taper is what the eye reads close up, and the contrast taper is what stops the
//      fine ends from being a hairline of the same black. Without the second one every tip is
//      still a hard stroke a fifth of a unit wide, and a whole web reads as ink.
//   3. IT BRANCHES LIKE A BREAK. This used to throw 3-7 straight spokes out of the hit point,
//      which is an asterisk, and it read as one. A real crack runs, turns as it goes, and throws
//      a wide Y off its own side part-way along. So the web is seeded from one or two hubs
//      (offset from the hit, never all sharing a vertex) and every run branches as it walks.
//
// The ribbons are laid as continuous mitred strips rather than as one quad per segment: laying a
// separate quad per segment leaves every corner as two overlapping rectangles, and at these
// widths that reads as planks of a different colour laid on the ground.
//
// Colours are the surface's own, taken down — not black, and not a generic brown. The core is
// the ground colour mixed hard toward the biome's exposed earth (the same `groundDebrisColorAt`
// a crater floor and the underside of a broken plate use), the flanks are the ground colour
// dirtied, so a crack in the meadow is meadow dirt and one in the dunes is dune dirt. A crack
// drawn in black on a lit surface is a decal; a crack drawn in the colour of the stuff the
// surface is made of is a hole in it.
//
// `yAt` is the *surface* height (a block's top face, or the terrain inside a crater bowl): the
// ribbons add their own lift, so a crack laid on the inside of a bowl follows the bowl. The old
// version offset by a flat +0.055 in world y, which floats off a slope one way and buries itself
// the other.
const LIFT = 0.052;        // how far a ribbon floats above the surface it is laid on
const CORE_DIP = 0.034;    // how far the crack's centreline drops below its shoulders (the V)
const CORE_LEAN = 0.85;    // and how far the two halves' normals lean in
const FLANK_TILT = 0.7;    // how far a wall's normal leans in toward the crack (tan of the angle)
// A run's far end does NOT taper to a point, and that is deliberate: a crack's last tenth of a unit
// is thinner than a pixel of this game's own render target, so a taper to nothing buys nothing
// visible and costs a crawling sub-pixel edge as the player walks. The width taper stops here and
// the *contrast* taper carries it the rest of the way (see `crackStrips`), which fades smoothly at
// any resolution because it is a colour, not a silhouette.
const CRACK_TIP = 0.34;
const BRANCH_MAX = 2;      // generations of side branch (a branch of a branch)
const CRACK_SEG_MAX = 90;  // nodes in one web
// ...and nodes of crack geometry drawn per chunk, across every patch and crater in it. This is a
// hard ceiling on the worst case, and it needs to be: the ground-damage grid is 2 units and a
// chunk is 32, so one chunk can hold 256 damaged patches, and at nine ribbons a node that is
// millions of triangles and seconds of rebuild in a single frame. Patches are drawn in order of
// damage, so what survives the budget is the worst-broken ground; a patch that gets dropped is
// one whose neighbours (and the crater it will eventually be) are already carrying the look.
const CRACK_NODE_BUDGET = 520;

// The cross-section, from the break outward: [outer edge, shade, lean] — the chipped lip, the wall
// falling into the break, and the shoulder of crushed ground, before untouched surface. The sizes
// are multiples of a node's own half-width and the shades are multiples of the ground's colour, so
// the whole section scales with the damage and follows the biome.
//
// Two things here are load-bearing:
//
//   * The FALLOFF is what reads as depth. A single dark band has two hard edges and reads as a
//     stroke no matter how carefully it is coloured; a dark core inside a dirtied shoulder reads
//     as something that has sunk into the ground, because that is the shading a depression has.
//     Keep the first step down the biggest (0.36 -> 0.68) and the rest small.
//   * The LIP leans the opposite way to everything else. Its normal tips *outward*, away from the
//     break, so on the side the sun is on it catches the light and becomes the bright chipped edge
//     of the break, while its opposite falls dark. Every other ribbon leans in. That is the only
//     thing in the section that gives the break a top edge, and because it is a normal and not a
//     baked colour, it comes out on the correct side by itself as the sun goes round — instead of
//     being a highlight painted on the wrong side for half the day.
const SECTION = [
  [1.5, 1.06, -0.5],  // the chipped lip
  [2.4, 0.64, 0.7],   // the wall going down into it
  [4.0, 0.78, 0.24],  // the shoulder of crushed ground
  [5.6, 0.90, 0.1],   // ...and the last of the falloff, out at the dirtied fringe
];

const toneSection = SECTION.map(() => [0, 0, 0]);
const toneCore = [0, 0, 0];
const toneGround = [0, 0, 0];
const nodeTone = [0, 0, 0];
const lightXZ = [0.79, 0.61];

// Every colour a crack is drawn in, all of them out of the surface it opens — see THE SURFACE
// PALETTE for what `surfTop`/`surfDirt` are. The core is the surface mixed toward the material
// its inside is made of (soil for the ground, the same paint taken down for a block) and then
// darkened hard; every ring outside it is the surface's own colour, only dirtied. A crack drawn
// in black on a lit surface is always a decal; a crack drawn in the colour of the stuff the
// surface is made of, and darker the deeper it goes, is a hole in it.
function crackTones(shade) {
  const g = surfTop;
  const d = surfDirt;
  // The unbroken surface's own colour, for a thin run to fade back into (see `crackStrips`).
  // 0.95 and not 1: that is the factor `buildGroundGrid` bakes into the ground's own vertices.
  toneGround[0] = g[0] * 0.95;
  toneGround[1] = g[1] * 0.95;
  toneGround[2] = g[2] * 0.95;
  // 0.4 rather than lower: the core has to be clearly the darkest thing on the surface, but the
  // game runs at 224p with no antialiasing, and a near-black line on pale ground shimmers like a
  // strobe as soon as the player walks. This is as much contrast as the look wants and as little
  // as the picture tolerates.
  toneCore[0] = (g[0] * 0.65 + d[0] * 0.35) * 0.4 * shade;
  toneCore[1] = (g[1] * 0.65 + d[1] * 0.35) * 0.4 * shade;
  toneCore[2] = (g[2] * 0.65 + d[2] * 0.35) * 0.4 * shade;
  for (let k = 0; k < SECTION.length; k++) {
    const s = SECTION[k][1] * shade;
    toneSection[k][0] = g[0] * s;
    toneSection[k][1] = g[1] * s;
    toneSection[k][2] = g[2] * s;
  }
}

// Which way the light is coming from, in the ground plane. Read when the crack is baked — the
// ribbons' own normals do the shading from then on, so this only has to be right at that moment.
function aimLight() {
  const L = shared.uLightDir.value;
  const l = Math.hypot(L.x, L.z) || 1;
  lightXZ[0] = L.x / l;
  lightXZ[1] = L.z / l;
}

// The mitre vector at each node of a polyline: the offset that keeps a ribbon the same width
// through a corner, and makes the two segments meet edge to edge instead of overlapping. For a
// straight run it is just the perpendicular; through a turn it is perpendicular to the bisector
// and `1 / cos(half the turn)` longer, which is the exact amount the shared edge has to stretch.
// (One shared vertex per node, so a run is a single strip.)
//
// That length goes to infinity as a turn approaches a hairpin, and there are hairpins in here — a
// short branch off a short branch can double back on itself, and two nodes close enough together
// make the direction between them pure noise. Unclamped, one such node throws a vertex half a unit
// out and the run becomes a long stretched black tongue instead of a crack. So the mitre is capped:
// a sharp corner gets a small notch instead of a spike.
const MITRE_MAX = 1.8;
function mitreVectors(pts) {
  const n = pts.length;
  const out = new Array(n);
  const perp = (ax, az) => {
    const l = Math.hypot(ax, az) || 1;
    return [-az / l, ax / l];
  };
  for (let i = 0; i < n; i++) {
    const inP = perp(pts[i].x - pts[Math.max(0, i - 1)].x, pts[i].z - pts[Math.max(0, i - 1)].z);
    const outP = perp(pts[Math.min(n - 1, i + 1)].x - pts[i].x, pts[Math.min(n - 1, i + 1)].z - pts[i].z);
    const dot = inP[0] * outP[0] + inP[1] * outP[1];
    const k = 1 + dot;
    let mx;
    let mz;
    if (k < 1e-3) {
      mx = inP[0];
      mz = inP[1];
    } else {
      mx = (inP[0] + outP[0]) / k;
      mz = (inP[1] + outP[1]) / k;
    }
    const ml = Math.hypot(mx, mz);
    if (ml > MITRE_MAX) {
      mx = (mx / ml) * MITRE_MAX;
      mz = (mz / ml) * MITRE_MAX;
    }
    out[i] = [mx, mz];
  }
  return out;
}

// One vertex of a crack: position, normal, vertex colour, and the UV that ties it into the same
// ground texture the surface under it wears. That last part matters more than it sounds — a crack
// laid down in flat, untextured colour is the strongest "untextured placeholder geometry" tell
// there is, and it is what made these read as decals however good the shape got. Sharing the
// ground's own map means the break is grained like the ground, wobbles with it under the PS1
// affine warp, and shows the same tile seams.
function vert(a, x, y, z, nx, ny, nz, col) {
  a.pos.push(x, y, z);
  a.nrm.push(nx, ny, nz);
  a.col.push(col[0], col[1], col[2]);
  a.uv.push(x * 0.5, z * 0.5);
}

// One ribbon along a polyline, sitting between two signed multiples of each node's own half-width
// (`r0` to `r1`, so the core's right half is 0 to +1 and its mirror is -1 to 0). `lean` tilts the
// normal in toward the crack's centreline, which is what gives the section its differently-lit
// sides — the wall on the sun's side falls into shade and its opposite catches the light. Because
// that shading comes from the normal, it also keeps working as the sun moves.
//
// `lift0`/`lift1` are the two edges' heights, and that is what makes the core a genuine V rather
// than a flat strip with a tilted normal: its centreline sits lower than its shoulders, so the
// break is a step *down* in the geometry that reads at a glancing angle and from above alike. A
// flat ribbon with a leaning normal only ever fakes it, and at this size fakes it badly.
function crackRibbon(a, rng, pts, r0, r1, col, lean, lift0, lift1, isCore, yAt) {
  const n = pts.length;
  const m = mitreVectors(pts);
  const first = a.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const mx = m[i][0];
    const mz = m[i][1];
    let nx = 0;
    let nz = 0;
    if (lean !== 0) {
      // lean the section's normal toward the centreline: -sign(r) is the inward direction
      const l = Math.hypot(mx, mz) || 1;
      const s = r0 >= 0 ? -1 : 1;
      nx = (s * mx / l) * lean;
      nz = (s * mz / l) * lean;
    }
    const nl = Math.hypot(nx, 1, nz);
    // How much of the full tone this node gets: 1 on a thick run, falling toward 0 as the break
    // thins (see `crackStrips`). A crack is deep where it is wide and shallow where it is fine, so
    // a hairline tip has to be a *fainter* line and not the same black at a quarter of the width —
    // otherwise every taper still ends in the same hard stroke, and the eye reads the whole web as
    // drawn rather than broken. The colour is mixed back toward the intact surface, which is also
    // what lets the fine ends of a web dissolve into the ground at a distance instead of shimmering.
    //
    // The core's own colour wanders a little node to node on top of that: a break is filled with
    // dirt and grit unevenly, and a line of one constant colour down its whole length is a drawn
    // line.
    let k = p.str === undefined ? 1 : p.str;
    if (isCore) k *= 0.78 + rng() * 0.5;
    nodeTone[0] = toneGround[0] + (col[0] - toneGround[0]) * k;
    nodeTone[1] = toneGround[1] + (col[1] - toneGround[1]) * k;
    nodeTone[2] = toneGround[2] + (col[2] - toneGround[2]) * k;
    const c = nodeTone;
    // Each vertex takes its height from the surface under *it*, not from the node's centreline:
    // the outer rings of the section sit up to a quarter of a unit off the line, which on the
    // flank of a crater lip is a third of a unit of height, and a strip of flat ribbon painted
    // across a slope sinks in on one side and hangs in the air on the other.
    const ax = p.x + mx * r0 * p.w;
    const az = p.z + mz * r0 * p.w;
    const bx = p.x + mx * r1 * p.w;
    const bz = p.z + mz * r1 * p.w;
    const ay = (yAt ? yAt(ax, az) : p.y) + lift0;
    const by = (yAt ? yAt(bx, bz) : p.y) + lift1;
    vert(a, ax, ay, az, nx / nl, 1 / nl, nz / nl, c);
    vert(a, bx, by, bz, nx / nl, 1 / nl, nz / nl, c);
  }
  for (let i = 0; i < n - 1; i++) {
    const p = first + i * 2;
    const q = p + 2;
    a.idx.push(p, p + 1, q + 1, p, q + 1, q);
  }
}

// Lay down one run of crack: a polyline of `{x, y, z, w}` nodes, thinned as it goes. Every node's
// width gets its own jitter first, so the break's two edges are ragged against each other instead
// of running as a pair of parallel curves — which is the other thing that makes a stroke look
// drawn rather than broken. The jitter is applied to the node and not to a ribbon, so the core and
// every ring outside it stay watertight against each other.
//
// Each node also gets a `str` — how much of the full crack tone it is worth, from the node's width
// against `ref`, the run's starting half-width. That is the depth cue that width alone cannot give:
// a run thins to a third of its width by its tip (and a branch starts at well under its parent's),
// and without this they would thin to a third-width *black* line and a weak branch would still read
// as ink. At `str` 1 it is the full break; at 0.4 a fine end is three parts intact surface to two
// parts crack, and fades out.
function crackStrips(a, rng, pts, yAt, ref) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    p.w *= 0.8 + rng() * 0.4;
    p.str = ref ? 0.15 + 0.85 * Math.min(1, p.w / ref) : 1;
  }
  // The core, as two halves that meet lower than they start: the shoulders of the break sit at
  // LIFT and the centreline dips to LIFT - CORE_DIP, so the cross-section is a real V and there is
  // a genuine step down into the crack instead of a painted line at ground level.
  crackRibbon(a, rng, pts, 0, 1, toneCore, CORE_LEAN, LIFT - CORE_DIP, LIFT, true, yAt);
  crackRibbon(a, rng, pts, -1, 0, toneCore, CORE_LEAN, LIFT, LIFT - CORE_DIP, true, yAt);
  let inner = 1;
  for (let k = 0; k < SECTION.length; k++) {
    const outer = SECTION[k][0];
    // Both sides go in as increasing signed multiples (-outer then -inner on the far side) so the
    // winding of every ribbon matches and none of them ends up back-facing.
    crackRibbon(a, rng, pts, inner, outer, toneSection[k], SECTION[k][2], LIFT, LIFT, false, yAt);
    crackRibbon(a, rng, pts, -outer, -inner, toneSection[k], SECTION[k][2], LIFT, LIFT, false, yAt);
    inner = outer;
  }
  // No loose chips: the surface is a decal lying on the ground, so anything laid on top of it
  // floats in the open, and a speck with clear ground all around it reads as debris from nowhere.
  // The break's own cross-section does the work instead.
}

// Walk one run of crack out from a point. It turns as it goes (a crack follows the surface's own
// weakness, so it wanders rather than zig-zagging), thins toward its tip, and throws side
// branches at a wide angle — which is the thing that turns a starburst into a web.
//
// `bounds` (a rectangle in the x/z plane) is what keeps a web on a BLOCK: a crack on the ground
// can wander as far as it likes, because the ground goes on, but a block's top face ends. Without
// it a two-unit pillar's web throws branches a metre and a half out past its own edge and hangs
// them in mid-air, which is the loudest "this is a decal" tell there is. A run that walks out of
// its face is cut there, and the cut ends look right: a break that reaches the edge of the thing
// is a break that is about to take the edge with it.
function inBounds(b, x, z) {
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

function crackRun(a, rng, x, y, z, ang, len, hw, yAt, amount, depth, budget, bounds) {
  const segs = 4 + Math.round(rng() * 2 + amount * 2.5);
  const pts = [{ x, y, z, w: hw }];
  const step = len / segs;
  for (let s = 1; s <= segs; s++) {
    ang += (rng() - 0.5) * 0.52;
    const nx = pts[s - 1].x + Math.cos(ang) * step * (0.72 + rng() * 0.56);
    const nz = pts[s - 1].z + Math.sin(ang) * step * (0.72 + rng() * 0.56);
    if (bounds && !inBounds(bounds, nx, nz)) break;
    pts.push({ x: nx, y: yAt ? yAt(nx, nz) : y, z: nz, w: hw * (1 - (s / segs) * (1 - CRACK_TIP)) });
  }
  if (pts.length < 2) return;
  crackStrips(a, rng, pts, yAt, hw);
  budget.n += pts.length;
  if (budget.n > budget.max || depth >= BRANCH_MAX) return;
  for (let i = 1; i < pts.length - 1; i++) {
    if (rng() > 0.45 + amount * 0.3) continue;
    const p = pts[i];
    const dir = Math.atan2(pts[i + 1].z - pts[i - 1].z, pts[i + 1].x - pts[i - 1].x);
    const side = rng() < 0.5 ? 1 : -1;
    crackRun(
      a, rng, p.x, p.y, p.z,
      dir + side * (0.55 + rng() * 0.6),
      len * (0.36 + rng() * 0.34), p.w * 0.62,
      yAt, amount, depth + 1, budget, bounds
    );
  }
}

// `pal` is the surface being opened: an array is a BLOCK's own colour (see `surfaceOfBox`), and
// `null` means the ground under (x, z).
function addCrackWeb(a, rng, cx, cy, cz, radius, amount, yAt, shade, pal, bounds) {
  const at = yAt || null;
  if (pal) surfaceOfBox(pal);
  else surfaceOfGround(cx, cz);
  crackTones(shade);
  aimLight();
  const budget = { n: 0, max: CRACK_SEG_MAX };
  // Damage does not only scale the web, it changes its character: a light hit is one hub with a
  // few spokes, a heavy one is two hubs with long runs that cross and re-cross each other, which
  // is the difference between a lighting-bolt shape and broken ground.
  const hw = 0.019 + amount * 0.028;
  const y0 = at ? at(cx, cz) : cy;
  // One hub, or two once it has really started to break up: the second hub is offset from the hit,
  // which is what stops the whole web from being spokes out of a single vertex.
  const hubs = [0];
  if (amount > 0.3) hubs.push(1 + Math.round(rng() * 2));
  for (let h = 0; h < hubs.length; h++) {
    const spread = h === 0 ? 0 : radius * (0.16 + rng() * 0.2);
    const ha = rng() * TAU;
    const hx = cx + Math.cos(ha) * spread;
    const hz = cz + Math.sin(ha) * spread;
    const hy = at ? at(hx, hz) : cy;
    if (bounds && !inBounds(bounds, hx, hz)) continue;
    const spokes = 2 + Math.round(amount * 2);
    for (let b = 0; b < spokes; b++) {
      // random directions, but nudged apart, and lengths that vary a lot — an evenly-spaced fan
      // of equal-length spokes is the asterisk this is trying not to be
      const ang = rng() * TAU + (b / spokes) * 0.8;
      crackRun(
        a, rng, hx, hy, hz, ang,
        radius * (0.6 + rng() * 0.9), hw * (0.7 + rng() * 0.6),
        at, amount, 0, budget, bounds
      );
    }
  }
  return budget.n;
}

// ---------------------------------------------------------------------------------------------
// THE PLANE A WEB LIVES IN — and why a crack on a wall is the SAME crack as one on the ground.
//
// A crack is a 2D thing: a web of runs laid on a surface. `addCrackWeb` and everything under it
// work in a flat LOCAL plane — that is what lets `crackRun` wander in (x, z) and `crackStrips`
// lay a cross-section out of the local y — and the surface it opens on does not have to be
// horizontal. So a web on a wall is generated by the SAME code, in the same local coordinates,
// and then PLACED: the local x axis becomes the face's own U, the local z its V, and the local y
// — the axis the section's lift and its core dip come off — becomes the face's OUTWARD NORMAL.
//
// Placing rather than generating is the whole point: not one line of the shape code has to know
// that a vertical surface exists. The frame handed to `addFaceWeb` is the one built in
// `buildDecalGeometry` off the solid's own face, and it is a proper rotation (U = N x V), so the
// geometry's winding — and therefore which side of the face it is visible from — comes out
// exactly as it does on a top face.
const WEB_BUF = { pos: [], nrm: [], col: [], uv: [], idx: [] };

function addFaceWeb(a, rng, o, u, v, n, su, sv, radius, amount, shade, pal, bounds) {
  const w = WEB_BUF;
  w.pos.length = 0;
  w.nrm.length = 0;
  w.col.length = 0;
  w.uv.length = 0;
  w.idx.length = 0;
  addCrackWeb(w, rng, su, 0, sv, radius, amount, null, shade, pal, bounds);
  const base = a.pos.length / 3;
  for (let i = 0; i < w.pos.length; i += 3) {
    const lx = w.pos[i];
    const ly = w.pos[i + 1];
    const lz = w.pos[i + 2];
    a.pos.push(
      o[0] + u[0] * lx + n[0] * ly + v[0] * lz,
      o[1] + u[1] * lx + n[1] * ly + v[1] * lz,
      o[2] + u[2] * lx + n[2] * ly + v[2] * lz
    );
  }
  for (let i = 0; i < w.nrm.length; i += 3) {
    const lx = w.nrm[i];
    const ly = w.nrm[i + 1];
    const lz = w.nrm[i + 2];
    a.nrm.push(
      u[0] * lx + n[0] * ly + v[0] * lz,
      u[1] * lx + n[1] * ly + v[1] * lz,
      u[2] * lx + n[2] * ly + v[2] * lz
    );
  }
  for (let i = 0; i < w.col.length; i++) a.col.push(w.col[i]);
  for (let i = 0; i < w.uv.length; i++) a.uv.push(w.uv[i]);
  for (let i = 0; i < w.idx.length; i++) a.idx.push(base + w.idx[i]);
}

// The ring of cracks standing around a crater: the same ribbons, walked round the lobed rim and
// then branched *outward*. The ground around a hole is the most broken part of it, and the
// radial branches are what carry the eye from the bowl out across the intact surface.
function addCrackRing(a, rng, c, yAt, shade) {
  surfaceOfGround(c.x, c.z);
  crackTones(shade);
  aimLight();
  const budget = { n: 0, max: CRACK_SEG_MAX };
  const n = 10 + Math.round(rng() * 4);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const ang = (i / n) * TAU + (rng() - 0.5) * 0.34;
    const r = c.r * (0.86 + rng() * 0.18);
    const x = c.x + Math.cos(ang) * r;
    const z = c.z + Math.sin(ang) * r;
    pts.push({ x, y: yAt(x, z), z, w: 0.04 + rng() * 0.025 });
  }
  crackStrips(a, rng, pts, yAt);
  for (let i = 0; i < n; i++) {
    if (rng() > 0.6) continue;
    const p = pts[i];
    const ang = Math.atan2(p.z - c.z, p.x - c.x) + (rng() - 0.5) * 0.7;
    crackRun(a, rng, p.x, p.y, p.z, ang, c.r * (0.45 + rng() * 0.5), p.w * 0.7, yAt, 0.55, 0, budget, null);
  }
  return budget.n;
}

export class Destruction {
  constructor(world) {
    this.world = world;
    this.material = createMaterial({});
    // Cracks get their own material for two reasons. `minLight`: they are dark, and without a
    // floor on the lighting they would vanish into the ground at dusk — the floor is low, because
    // they are drawn in the surface's own dirt colour and so already start far darker than the
    // ground; a high floor made them glow against a night-time ground. And the map: they wear the
    // SAME ground texture as the surface they open (the very same texture object, so the grain
    // and the tile seams line up). `depthWrite` off, so a decal never occludes anything — it is
    // drawn after the opaque pass, lifted a few centimetres above the surface it sits on.
    const groundMap = world.groundMaterial ? world.groundMaterial.uniforms.uMap.value : null;
    this.crackMaterial = createMaterial({ map: groundMap, minLight: 0.24, depthWrite: false });
    this.chunks = new Map(); // "cx,cz" -> {dmg:Map<slot,number>, hit:Map<slot,{x,z}>, dead:Set<slot>, carve:Map<idx,Set<cell>>}
    this.patches = new Map(); // "cx,cz" -> Map<"px,pz", patch>   (ground damage, owned by chunk)
    this.craters = new Map(); // "cx,cz" -> crater[]              (owned by chunk, 3x3 lookup)
    this.shards = [];
    this.events = [];
    this.dirty = new Set();
    this.buf = [];
    // A second scratch list for the collider query `spreadBreak` runs. It cannot be `buf`:
    // `impact` is walking `buf`'s candidates when a block comes apart, and a break that spread
    // into the list being iterated would corrupt the slam it came from.
    this.nbuf = [];
    // Corner heights of the ground-grid cells sampled during one decal build (see
    // `groundHeightAt`). Dropped at the start of every build, because a new crater changes the
    // height field itself.
    this.cellCache = new Map();
    this.stats = { broken: 0, craters: 0, shards: 0 };
  }

  key(cx, cz) {
    return cx + "," + cz;
  }

  chunkState(cx, cz) {
    const k = this.key(cx, cz);
    let st = this.chunks.get(k);
    if (!st) {
      st = { dmg: new Map(), hit: new Map(), dead: new Set(), carve: new Map() };
      this.chunks.set(k, st);
    }
    return st;
  }

  // ---- the ground ------------------------------------------------------------------------
  patchAt(x, z) {
    const px = Math.floor(x / PATCH);
    const pz = Math.floor(z / PATCH);
    const cx = Math.floor(((px + 0.5) * PATCH) / CHUNK);
    const cz = Math.floor(((pz + 0.5) * PATCH) / CHUNK);
    const k = this.key(cx, cz);
    let m = this.patches.get(k);
    if (!m) {
      m = new Map();
      this.patches.set(k, m);
    }
    const pk = px + "," + pz;
    let p = m.get(pk);
    if (!p) {
      // The hit is recorded so the cracks are drawn where you actually put your boot, not at
      // the centre of a grid cell. `px`/`pz` are kept too: they seed this patch's own crack
      // geometry, which is what lets a patch's web be a pure function of the patch rather than of
      // the order the patches happen to be walked in (see buildDecalGeometry).
      p = { px, pz, x: (px + 0.5) * PATCH, z: (pz + 0.5) * PATCH, dmg: 0, hitX: 0, hitZ: 0, hit: false };
      m.set(pk, p);
    }
    return p;
  }

  // How far a crater has beaten the ground down at a point, measured off the world's own BASE
  // height field (0 everywhere but the hills — see `groundBaseAt` in world.js): the shape of the
  // hole is the only thing defined here, and `World.terrainHeight` adds the two together to get the
  // deck the player actually stands on. The rim is lobed rather than a clean circle
  // (two sine harmonics off the crater's own seed) because that is what broken ground looks
  // like — and because a perfect circle reads as a texture rather than a hole.
  terrainHeight(x, z) {
    if (!this.craters.size) return 0;
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    let h = 0;
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const list = this.craters.get(this.key(cx + a, cz + b));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          const dx = x - c.x;
          const dz = z - c.z;
          const d = Math.hypot(dx, dz);
          if (d >= c.r * 1.35) continue;
          const ang = Math.atan2(dz, dx);
          const wob = 1 + 0.15 * Math.sin(ang * 3 + c.w1) + 0.09 * Math.sin(ang * 5 + c.w2);
          const r = c.r * wob;
          if (d >= r) continue;
          const t = d / r;
          const k = 1 - t * t;
          h -= c.depth * k * k;
          // A lip of displaced earth around the rim. Besides being what an impact actually
          // leaves, it is the strongest depth cue there is: a raised ring with a hole inside
          // reads as a hole from any camera angle, where a pure bowl can flatten out to a
          // dark smudge when you are looking at it from a distance.
          h += c.lip * Math.max(0, 1 - Math.abs(t - 0.9) / 0.3);
        }
      }
    }
    return h;
  }

  // The drawable ground is `terrainHeight` sampled on the ground grid's own vertices and then
  // linearly interpolated across each cell (see `buildGroundGrid`). A decal laid straight on
  // `terrainHeight` therefore misses the mesh wherever the field curves — over the raised lip of
  // a crater the linear skin cuts *below* the smooth field, so a crack there hangs in the air,
  // and over a bowl the skin cuts above it, so the crack sinks into the ground and disappears.
  // Sampling the interpolation instead puts every decal vertex on the surface the player is
  // actually looking at, for the cost of four field evaluations.
  groundHeightAt(x, z) {
    // The base field carries the hills (it is 0 in the other worlds), so it is read at the point
    // whether or not there is a crater here.
    const base = groundBaseAt(x, z);
    if (!this.craters.size) return base;
    const step = CHUNK / GROUND_CELLS;
    const gx = Math.floor(x / step) * step;
    const gz = Math.floor(z / step) * step;
    // Corner heights come from a per-build cell cache. A web's vertices crawl along polylines in
    // sub-unit steps, so they ask for the same handful of cells over and over; without the cache
    // every one of those asks would pay four `terrainHeight` walks.
    const ck = (gx + 32768) * 65536 + (gz + 32768);
    let c = this.cellCache.get(ck);
    if (c === undefined) {
      // Each corner is the FULL deck height — the base field plus the crater dug into it — so the
      // interpolation matches the mesh, which is built from `World.terrainHeight` at the same
      // vertices.
      c = [
        groundBaseAt(gx, gz) + this.terrainHeight(gx, gz),
        groundBaseAt(gx + step, gz) + this.terrainHeight(gx + step, gz),
        groundBaseAt(gx, gz + step) + this.terrainHeight(gx, gz + step),
        groundBaseAt(gx + step, gz + step) + this.terrainHeight(gx + step, gz + step),
      ];
      this.cellCache.set(ck, c);
    }
    const fx = (x - gx) / step;
    const fz = (z - gz) / step;
    // The cell is cut by its (0,0)-(1,1) diagonal into two triangles (see `buildGroundGrid`), so
    // which plane a point lies on depends on which side of that diagonal it falls.
    if (fx >= fz) return c[0] + (c[1] - c[0]) * fx + (c[3] - c[1]) * fz;
    return c[0] + (c[3] - c[2]) * fx + (c[2] - c[0]) * fz;
  }

  terrainDark(x, z) {
    const h = this.terrainHeight(x, z);
    return Math.min(1.14, 1 + h * 0.24);
  }

  craterNear(x, z, r) {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const list = this.craters.get(this.key(cx + a, cz + b));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (Math.hypot(c.x - x, c.z - z) < Math.max(r, c.r * 0.7)) return c;
        }
      }
    }
    return null;
  }

  craterAt(x, z, power, rng) {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const k = this.key(cx, cz);
    // The height field has just changed, so any cached cell heights are stale.
    this.cellCache.clear();
    let list = this.craters.get(k);
    if (!list) {
      list = [];
      this.craters.set(k, list);
    }
    let c = this.craterNear(x, z, 0.1);
    if (c) {
      // Slamming the same hole again deepens it instead of stamping a second bowl on top.
      c.hits++;
      c.depth = Math.min(CRATER_DEPTH_MAX, c.depth + 0.26 + power * 0.46);
      c.r = Math.min(CRATER_R_MAX, c.r + 0.12 + power * 0.24);
      c.lip = Math.min(0.85, c.lip + 0.05);
    } else {
      c = {
        x, z,
        r: 1.85 + power * 1.25,
        depth: 1.05 + power * 1.55,
        lip: 0.26 + power * 0.38,
        hits: 1,
        seed: Math.floor(rng() * 1e9),
        w1: rng() * TAU,
        w2: rng() * TAU,
      };
      list.push(c);
      this.stats.craters++;
    }
    this.spawnGroundShards(c, power, rng);
    this.events.push({ type: "unstitch", x, y: groundBaseAt(x, z) + 0.1, z, power, r: c.r, depth: c.depth, hits: c.hits });
    // The bowl reaches into neighbouring chunks; rebuild every chunk its rim touches.
    const x0 = Math.floor((c.x - c.r) / CHUNK);
    const x1 = Math.floor((c.x + c.r) / CHUNK);
    const z0 = Math.floor((c.z - c.r) / CHUNK);
    const z1 = Math.floor((c.z + c.r) / CHUNK);
    for (let ax = x0; ax <= x1; ax++) {
      for (let az = z0; az <= z1; az++) {
        // Only chunks that are actually built need rebuilding: one that is not loaded will
        // come back in already craters, because the height field is a function of the world
        // position rather than of the chunk.
        if (this.world.chunks.has(this.key(ax, az))) this.dirty.add(this.key(ax, az));
      }
    }
    return c;
  }

  // ---- the hit --------------------------------------------------------------------------
  // `power` is the slam's 0..1 (see player.js: slamHeight / SLAM_HEIGHT_MAX).
  //
  // Damage is addressed to PIECES (voxel.js): what the boot lands on is the solid under it,
  // which is a whole box on untouched ground and a single CELL of one once that box has been
  // bitten into. Everything below is size-agnostic because of it — the hardness comes off the
  // piece's own rectangle, and a 2-unit cube and one 4-unit bite out of a monolith are the same
  // kind of thing to hit.
  impact(x, y, z, power) {
    return this.strike(x, y, z, power, NONE);
  }

  // THE STRIKE — one primitive, fed by every attack in the game (see the note in main.js).
  //
  // `opts.surface` decides which KIND of surface the blow is addressed to, and that is the
  // attack's own business rather than something guessed in here:
  //
  //   * "ground" — a boot coming down on the deck. The solid addressed is the one whose TOP face
  //     is at the blow (the original slam address), and with nothing solid under it the blow is
  //     addressed to the ground plane itself, which is what digs a crater.
  //   * "wall" — a blow driven INTO a face. `opts.dir` is the direction the blow travelled, so
  //     the horizontal axis it is mostly along IS the face's outward normal, and the solid
  //     addressed is the one whose SIDE is against the contact. The blow lands wherever on that
  //     face the contact is, at whatever height — which is why a hole punched in a tower opens
  //     on the storey the fist arrived on rather than at its roofline (see `cellAt`).
  //   * "auto" — read it off the direction: a blow travelling mostly downward is a ground strike,
  //     a horizontal one is a wall strike. For the one weapon in the game whose strike point
  //     genuinely does not know what it is about to meet (the staff's tip).
  //
  // Everything downstream is shared — the arithmetic, the crack, the break, the spread, the
  // shards, the events — because a hole in a wall and a hole in the ground are the same hole.
  // Only WHERE the crack web is drawn differs, and that travels on the hit record (see `st.hit`
  // and `buildDecalGeometry`).
  strike(x, y, z, power, opts) {
    const o = opts || NONE;
    let mode = o.surface || "ground";
    const dir = o.dir;
    if (mode === "auto") {
      const vy = dir ? Math.abs(dir[1] || 0) : 1;
      const vh = dir ? Math.hypot(dir[0] || 0, dir[2] || 0) : 0;
      mode = vy >= vh ? "ground" : "wall";
    }
    power = clamp(power, 0.05, 1);
    const force = 0.3 + power * 0.65;
    const rng = rngFor(Math.floor(x * 3.7), Math.floor(z * 3.7), Math.floor(power * 1000) ^ 7331);

    const cols = this.buf;
    const cand = [];
    // The face a wall strike is addressed to: the horizontal axis of `dir` it is mostly along,
    // and which way round. That is ALL the hit record has to carry — the plane itself belongs to
    // the solid the blow lands in (its own two dimensions and its own corner), not to the blow.
    // `dir` points the way the blow TRAVELLED, so the face it is driven into has the OPPOSITE
    // outward normal.
    let face = null;
    let radius;
    if (mode === "wall") {
      const dx = dir ? dir[0] || 0 : 0;
      const dz = dir ? dir[2] || 0 : 0;
      const ax = Math.abs(dx) >= Math.abs(dz) ? "x" : "z";
      const d = ax === "x" ? (dx < 0 ? -1 : 1) : (dz < 0 ? -1 : 1);
      face = { ax, s: -d };
      radius = 0.9 + power * 1.5;
      this.world.queryXZ(x - radius - 0.6, z - radius - 0.6, x + radius + 0.6, z + radius + 0.6, cols);
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        // The contact has to be ON the face VERTICALLY as well as in plan: a fist at chest height
        // does not put a hole in the kerb it happens to be standing beside, and a staff swung
        // over the top of a wall goes over it.
        if (y < c.minY - 0.3 || y > c.maxY + 0.3) continue;
        // `lat` is how far the contact is off the face sideways; `depth` is how far the FACE is
        // on the far side of the contact along the blow. A little of the second being negative is
        // fine (a fist ends up in the stone); a solid whose face is behind the contact by more
        // than the blow's own reach is not what was hit.
        let lat;
        let depth;
        if (ax === "x") {
          lat = Math.max(c.minZ - z, 0, z - c.maxZ);
          depth = face.s < 0 ? c.minX - x : x - c.maxX;
        } else {
          lat = Math.max(c.minX - x, 0, x - c.maxX);
          depth = face.s < 0 ? c.minZ - z : z - c.maxZ;
        }
        if (depth < -0.35 || depth > radius) continue;
        if (lat > radius) continue;
        cand.push({ c, d: Math.hypot(Math.max(0, depth), lat) });
      }
    } else {
      radius = 1.5 + power * 2.4;
      this.world.queryXZ(x - radius - 2, z - radius - 2, x + radius + 2, z + radius + 2, cols);
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        // The surface you actually landed on: its top face has to be at (or just under) your
        // feet. A wall you landed *beside* is left alone.
        if (y < c.maxY - 0.45 || y > c.maxY + 1.9) continue;
        const dx = Math.max(c.minX - x, 0, x - c.maxX);
        const dz = Math.max(c.minZ - z, 0, z - c.maxZ);
        const d = Math.hypot(dx, dz);
        if (d > radius) continue;
        cand.push({ c, d });
      }
    }
    cand.sort((a, b) => a.d - b.d);

    let broke = 0;
    let cracked = 0;
    // The colour a break in whatever the blow just landed on should throw (see `dustOf`).
    // `null` means it was the ground, and the caller falls back to the biome's own dust.
    let dust = null;
    const strikeY = mode === "wall" ? y : null;
    for (let i = 0; i < cand.length; i++) {
      const c = cand[i].c;
      const st = this.chunkState(c.cx, c.cz);
      if (st.dead.has(c.slot)) continue;
      if (!dust) dust = dustOf(c.c || NO_COLOR);
      const falloff = 1 - Math.min(1, cand[i].d / (radius + 0.001)) * 0.7;
      const hard = 0.7 + Math.cbrt(Math.max(1, c.w * c.h * c.d)) * 0.26;
      const before = st.dmg.get(c.slot) || 0;
      const after = before + (force * falloff) / hard;
      st.dmg.set(c.slot, after);
      // The hit record is the crack's SEED (see `buildDecalGeometry`): where on the surface the
      // blow landed, and — for a wall — which of the solid's faces the web belongs on. A ground
      // record carries no height because its web is drawn on the solid's TOP face whatever the
      // boot's own height was.
      if (face) st.hit.set(c.slot, { x, y, z, f: face });
      else st.hit.set(c.slot, { x, z });
      if (before < CRACK && after >= CRACK) cracked++;
      // Two solids at most per hit: a blow that shatters a whole pile at once reads as a
      // scripted event instead of an impact, and it keeps the chunk rebuilds this frame cheap.
      if (after >= BREAK && broke < 2) {
        this.destroyPiece(c, st, x, z, power, rng, strikeY, face);
        broke++;
      }
      // Below CRACK nothing has been drawn yet, so there is nothing to rebuild for.
      if (after >= CRACK) this.dirty.add(this.key(c.cx, c.cz));
    }

    // Nothing solid under the boot: this was the ground itself. A WALL strike has no such
    // fallback — a blow driven at a face that found no face hit nothing at all, which is the
    // right answer for a staff swung through empty air.
    if (mode !== "wall" && !cand.length && y < groundBaseAt(x, z) + 1.0) {
      const p = this.patchAt(x, z);
      const before = p.dmg;
      p.dmg = Math.min(1.2, p.dmg + force / GROUND_HARD);
      p.hitX = x;
      p.hitZ = z;
      p.hit = true;
      if (before < CRACK && p.dmg >= CRACK) cracked++;
      // Bleed into the ring around the hit so cracks radiate out of the spot you keep pounding.
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          if (!a && !b) continue;
          const n = this.patchAt(x + a * PATCH, z + b * PATCH);
          const amount = force * SPREAD * (a && b ? 0.5 : 0.8);
          n.dmg = Math.max(n.dmg, Math.min(SPREAD_CAP, n.dmg + amount / GROUND_HARD));
          if (!n.hit) {
            n.hit = true;
            n.hitX = n.x;
            n.hitZ = n.z;
          }
        }
      }
      const cx = Math.floor(x / CHUNK);
      const cz = Math.floor(z / CHUNK);
      this.dirty.add(this.key(cx, cz));
      if (p.dmg >= BREAK) this.craterAt(x, z, power, rng);
    }

    if (cracked && !broke) {
      this.events.push({ type: "crack", x, y: mode === "wall" ? y : y + 0.05, z, big: false, dust, wall: mode === "wall" });
    }
    return { blocks: cand.length, broke, cracked, dust, surface: mode };
  }

  // ---- taking a piece apart ---------------------------------------------------------------
  // WHAT BREAKS, AND HOW MUCH OF IT. `c` is the piece the boot was standing on. Two cases:
  //
  //   * `c.cell >= 0` — it is already a cell of a box that has been bitten into, so it comes out
  //     on its own (and if it was the last cell left, the object itself is finally gone).
  //   * `c.cell < 0` — it is a whole box. If the box is big enough to have an inside
  //     (`isCuttable`), the box is FIRST cut into its grid and then the one cell under the blow
  //     is taken out of it: a bite, not a demolition. Otherwise it is a block — a 2-unit cube, a
  //     kerb, a window pane, a step — and a block goes whole, exactly as it always has.
  //
  // `hy` is the blow's own height, and it is the whole difference between the two addresses: a
  // ground strike takes the cell in the box's TOP layer (`topCellAt` — the only layer a boot can
  // reach), a wall strike takes the cell the blow landed IN (`cellAt`), so the hole appears on
  // the storey it was punched. `face` rides along for the crack web (see `spreadBreak`).
  destroyPiece(c, st, x, z, power, rng, hy, face) {
    if (c.cell < 0) {
      const chunk = this.world.chunks.get(this.key(c.cx, c.cz));
      const box = chunk ? chunk.boxDefs[c.idx] : null;
      if (box && isCuttable(box)) {
        const grid = gridOf(box);
        const cell = hy == null ? topCellAt(box, grid, x, z) : cellAt(box, grid, x, hy, z);
        // The box's own damage has just been spent: it has been cut up, and from here on the
        // damage is addressed to the cells. Carrying the whole-box entry over would leave a web
        // of cracks drawn across the top of an object that no longer has a top there.
        st.dmg.delete(c.slot);
        st.hit.delete(c.slot);
        this.removeCell(pieceOf(cellOf(box, grid, cell), c.idx, c.cx, c.cz, cellSlot(c.idx, cell), cell), st, x, z, power, rng, hy, face);
        return;
      }
      st.dead.add(c.slot);
      st.dmg.delete(c.slot);
      st.hit.delete(c.slot);
      this.afterBreak(c, st, x, z, power, rng, hy, face);
      return;
    }
    this.removeCell(c, st, x, z, power, rng, hy, face);
  }

  // Take one cell out of its box. The cell has been a solid in its own right since the box was
  // first bitten (see `fillChunk`), so this is just "it is gone" plus the bookkeeping: the
  // carve set it belongs to gains it, and when the set has every cell in it the box itself is
  // dead and the carve record can go — the object is finally, completely, gone.
  removeCell(part, st, x, z, power, rng, hy, face) {
    let gone = st.carve.get(part.idx);
    if (!gone) {
      gone = new Set();
      st.carve.set(part.idx, gone);
    }
    gone.add(part.cell);
    st.dmg.delete(part.slot);
    st.hit.delete(part.slot);
    const chunk = this.world.chunks.get(this.key(part.cx, part.cz));
    const box = chunk ? chunk.boxDefs[part.idx] : null;
    if (box && gone.size >= cellTotal(gridOf(box))) {
      st.dead.add(slotOf(part.idx));
      st.carve.delete(part.idx);
    }
    this.afterBreak(part, st, x, z, power, rng, hy, face);
  }

  // What every break does, whichever of the three ways above it happened: the chunk is dirty,
  // the piece comes apart into prisms of its own colour, the solids against it take a share of
  // the hit, and the event tells main.js what to throw and how much to shake.
  afterBreak(part, st, x, z, power, rng, hy, face) {
    this.dirty.add(this.key(part.cx, part.cz));
    this.stats.broken++;
    this.spawnBlockShards(part, x, z, power, rng);
    this.spreadBreak(part, x, z, power, hy, face);
    this.events.push({
      type: "destroy",
      x,
      // A WALL break is announced at the HEIGHT the blow landed (the hole is where the fist
      // was), a ground break at the height of the piece that came out of the deck.
      y: hy != null ? hy : part.y + part.h * 0.5,
      z,
      power,
      w: part.w,
      h: part.h,
      d: part.d,
      color: part.c,
      wall: !!face,
      // The FX this event drives (see main.js) are drawn in this, not in the biome's fog.
      dust: dustOf(part.c || NO_COLOR),
    });
  }

  // ---- what a break does to its neighbours -------------------------------------------------
  // A break does not stop at the piece it happened in. The solids touching it take a share of
  // the hit — the same bargain the ground makes, whose slams bleed into a ring of patches around
  // them (see SPREAD) — so pounding one stone of a wall leaves cracked masonry around the hole
  // and the hole walks outward as you work it, instead of being a clean drilled tunnel through
  // an otherwise perfect wall. A neighbour's share is scaled by how close the boot was to its
  // face and by its own hardness, and it is capped at BLOCK_SPREAD_CAP: a solid that is only
  // ever splashed can crack but never come apart on somebody else's break. At most eight
  // neighbours are touched, nearest first, so a break in a crowded corner cannot cascade a
  // rebuild storm.
  //
  // Once a box has been cut, this is also what cracks the cells AROUND a bite: they are the
  // stone the bite is in, so a hole in a wall appears with cracked masonry already around it,
  // and the next slam near it breaks into that. Its own cell is the only thing skipped.
  //
  // `hy`/`face` carry the parent blow's own address down to the neighbours: a wall break cracks
  // the stone BESIDE the hole (in the same face, at the same height) rather than scribbling on
  // the roof of every block near it, which is what a hit record with no face would do.
  spreadBreak(part, hitX, hitZ, power, hy, face) {
    const m = 0.34; // how far off the face a solid still counts as touching
    const force = 0.3 + power * 0.65;
    const out = this.nbuf;
    out.length = 0;
    this.world.queryXZ(part.minX - m, part.minZ - m, part.maxX + m, part.maxZ + m, out);
    const near = [];
    for (let i = 0; i < out.length; i++) {
      const q = out[i];
      if (q.slot === part.slot) continue;
      // A solid only counts if it really is against it, on all three axes.
      if (q.maxX <= part.minX - m || q.minX >= part.maxX + m) continue;
      if (q.maxZ <= part.minZ - m || q.minZ >= part.maxZ + m) continue;
      if (q.maxY <= part.minY - m || q.minY >= part.maxY + m) continue;
      const qst = this.chunkState(q.cx, q.cz);
      if (qst.dead.has(q.slot)) continue;
      // ...and a solid that CONTAINS the piece is not beside it. When a bite is taken out of a big
      // box, the box's own slot is still in the chunk's collider list at this instant (the rebuild
      // happens later in the frame) and it is *around* the cell rather than against it. Left in, it
      // would collect spread damage as a phantom for the rest of the session — the entry outlives
      // the collider — and keep a crack web drawn on a face that has been cut away.
      if (
        q.cell < 0 &&
        q.minX <= part.minX && q.maxX >= part.maxX &&
        q.minZ <= part.minZ && q.maxZ >= part.maxZ &&
        q.minY <= part.minY && q.maxY >= part.maxY
      ) continue;
      const dx = Math.max(q.minX - hitX, 0, hitX - q.maxX);
      const dz = Math.max(q.minZ - hitZ, 0, hitZ - q.maxZ);
      near.push({ q, qst, d: Math.hypot(dx, dz) });
    }
    near.sort((a, b) => a.d - b.d);
    for (let i = 0; i < near.length && i < 8; i++) {
      const n = near[i];
      const q = n.q;
      const falloff = 1 / (1 + n.d * 0.8);
      const hard = 0.7 + Math.cbrt(Math.max(1, q.w * q.h * q.d)) * 0.26;
      const before = n.qst.dmg.get(q.slot) || 0;
      const after = Math.max(before, Math.min(BLOCK_SPREAD_CAP, before + (force * BLOCK_SPREAD * falloff) / hard));
      n.qst.dmg.set(q.slot, after);
      // The neighbour's web opens where the break that reached it happened, so the cracks in a
      // wall read as coming out of the hole rather than as a fresh hit of its own.
      if (face && hy != null) n.qst.hit.set(q.slot, { x: hitX, y: hy, z: hitZ, f: face });
      else n.qst.hit.set(q.slot, { x: hitX, z: hitZ });
      this.dirty.add(this.key(q.cx, q.cz));
      if (before < CRACK && after >= CRACK) {
        this.events.push({
          type: "crack",
          x: hitX,
          y: face && hy != null ? hy : q.maxY + 0.05,
          z: hitZ,
          big: false,
          wall: !!(face && hy != null),
          dust: dustOf(q.c || NO_COLOR),
        });
      }
    }
  }

  // ---- debris ----------------------------------------------------------------------------
  spawnShards(defs) {
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      if (this.shards.length >= MAX_SHARDS) this.killShard(0);
      const geo = buildShardGeometry(d.poly, d.thickness, d.color, { shade: d.shade || 1 });
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.position.set(d.x, d.y, d.z);
      mesh.rotation.set(d.rx, d.ry, d.rz);
      this.world.scene.add(mesh);
      this.shards.push({
        mesh,
        vx: d.vx,
        vy: d.vy,
        vz: d.vz,
        wx: d.wx,
        wy: d.wy,
        wz: d.wz,
        age: 0,
        rest: 0,
      });
      this.stats.shards++;
    }
  }

  spawnBlockShards(box, hitX, hitZ, power, rng) {
    const vol = Math.max(0.6, box.w * box.h * box.d);
    const n = clamp(Math.round(Math.cbrt(vol) * 1.9), 6, 14);
    const unit = clamp(Math.cbrt(vol) * 0.33, 0.3, 1.0);
    const c = box.c || NO_COLOR;
    // A block's chunks are the BLOCK's colour, with the block's own inside mixed into some of
    // them: the same bargain the ground plates make (grass on top, soil underneath), so a chunk
    // lying flipped reads as the break it came out of rather than as a floating brick. The colour
    // is `box.c` itself — the very value `buildBoxGeometry` paints that box's vertices with — so
    // the debris cannot drift from the thing it came off.
    const dirt = interiorOf(c, [0, 0, 0]);
    const defs = [];
    for (let i = 0; i < n; i++) {
      const bx = box.x + rng() * box.w;
      const bz = box.z + rng() * box.d;
      const by = box.y + box.h * (0.3 + rng() * 0.72);
      const px = bx + (hitX - bx) * 0.35;
      const pz = bz + (hitZ - bz) * 0.35;
      const s = unit * (0.6 + rng() * 0.75);
      let dx = px - hitX;
      let dz = pz - hitZ;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl;
      dz /= dl;
      const v = 1.6 + power * 4.6;
      const jr = () => 0.86 + rng() * 0.28;
      const mix = rng() * 0.5;
      const jc = [jr(), jr(), jr()];
      defs.push({
        poly: polyRing(rng, s, s * (0.65 + rng() * 0.6), rng() < 0.45 ? 5 : 4),
        thickness: s * (0.32 + rng() * 0.42),
        color: [
          clamp(c[0] * jc[0] * (1 - mix) + dirt[0] * mix, 0, 1),
          clamp(c[1] * jc[1] * (1 - mix) + dirt[1] * mix, 0, 1),
          clamp(c[2] * jc[2] * (1 - mix) + dirt[2] * mix, 0, 1),
        ],
        shade: 0.9 + rng() * 0.2,
        x: px,
        y: by,
        z: pz,
        rx: rng() * TAU,
        ry: rng() * TAU,
        rz: rng() * TAU,
        vx: dx * v * (0.4 + rng() * 0.9) + (rng() - 0.5) * 2.6,
        vy: 4.2 + power * 6 + rng() * 2.6,
        vz: dz * v * (0.4 + rng() * 0.9) + (rng() - 0.5) * 2.6,
        wx: (rng() - 0.5) * 9,
        wy: (rng() - 0.5) * 9,
        wz: (rng() - 0.5) * 9,
      });
    }
    this.spawnShards(defs);
  }

  spawnGroundShards(c, power, rng) {
    const n = clamp(Math.round(4 + c.r * 2.4), 5, 13);
    const defs = [];
    for (let i = 0; i < n; i++) {
      const ang = rng() * TAU;
      const rr = c.r * (0.15 + rng() * 0.75);
      const px = c.x + Math.cos(ang) * rr;
      const pz = c.z + Math.sin(ang) * rr;
      const s = 0.42 + rng() * 0.62;
      const dirt = debrisOnGround(px, pz);
      const top = groundColorAt(px, pz);
      const mix = 0.4 + rng() * 0.5;
      defs.push({
        poly: polyRing(rng, s, s * (0.6 + rng() * 0.7), rng() < 0.4 ? 5 : 4),
        thickness: s * (0.24 + rng() * 0.3),
        // The plates are ground on top and raw dirt underneath, so a flipped one reads as one.
        color: [
          clamp(top[0] * (1 - mix) + dirt[0] * mix, 0, 1),
          clamp(top[1] * (1 - mix) + dirt[1] * mix, 0, 1),
          clamp(top[2] * (1 - mix) + dirt[2] * mix, 0, 1),
        ],
        shade: 0.85 + rng() * 0.25,
        x: px,
        y: groundBaseAt(px, pz) + 0.02 + rng() * 0.2,
        z: pz,
        rx: (rng() - 0.5) * 0.7,
        ry: rng() * TAU,
        rz: (rng() - 0.5) * 0.7,
        vx: Math.cos(ang) * (1.2 + rng() * 2.8),
        vy: 3.6 + power * 6 + rng() * 2.4,
        vz: Math.sin(ang) * (1.2 + rng() * 2.8),
        wx: (rng() - 0.5) * 11,
        wy: (rng() - 0.5) * 7,
        wz: (rng() - 0.5) * 11,
      });
    }
    this.spawnShards(defs);
  }

  killShard(i) {
    const s = this.shards[i];
    if (!s) return;
    this.shards.splice(i, 1);
    this.world.scene.remove(s.mesh);
    s.mesh.geometry.dispose();
  }

  // ---- cracks on the world ---------------------------------------------------------------
  buildDecalGeometry(chunk) {
    const k = this.key(chunk.cx, chunk.cz);
    this.cellCache.clear();
    const st = this.chunks.get(k);
    const patches = this.patches.get(k);
    const craters = this.craters.get(k);
    const hasBlocks = st && st.dmg.size;
    if (!hasBlocks && (!patches || !patches.size) && (!craters || !craters.length)) return null;

    const a = { pos: [], nrm: [], col: [], uv: [], idx: [] };
    const rng = rngFor(chunk.cx * 7 + 1, chunk.cz * 13 + 3, 90210);
    let used = 0;

    if (hasBlocks) {
      // Worst damaged first, for the same reason the ground patches are (below): under budget
      // pressure — and a wall that has been worked over has a LOT of damaged cells in it — what
      // survives is the break being worked on rather than a corner that was splashed an hour ago.
      const hurt = [];
      for (const [slot, dmg] of st.dmg) if (dmg >= CRACK && !st.dead.has(slot)) hurt.push({ slot, dmg });
      hurt.sort((q, r) => r.dmg - q.dmg);
      for (const h of hurt) {
        if (used >= CRACK_NODE_BUDGET) break;
        const slot = h.slot;
        const dmg = h.dmg;
        // The solid this damage is in: a whole box, or one cell of a box that has been bitten
        // into (`defOfSlot`). A cell is a surface with edges exactly like a box is, so its web is
        // drawn and clipped the same way, in the same colour — only smaller.
        const box = defOfSlot(chunk.boxDefs, slot);
        if (!box) continue;
        const amount = Math.min(1, (dmg - CRACK) / (BREAK - CRACK));
        const hit = st.hit.get(slot);
        if (hit && hit.f) {
          // A WALL WEB (see THE PLANE A WEB LIVES IN, above): the web belongs on the face the blow
          // was driven into, not on the solid's top. The frame comes off the solid's own face —
          // `f.ax` is which axis, `f.s` that face's outward normal — and the seed is the blow's
          // own contact point PROJECTED onto the face plane, so a fist that ended up inside the
          // stone still opens its web exactly where the fist was.
          const f = hit.f;
          let o;
          let u;
          let v;
          let n;
          let fu;
          let fv;
          if (f.ax === "x") {
            const px = f.s < 0 ? box.x : box.x + box.w;
            o = f.s < 0 ? [px, box.y, box.z] : [px, box.y + box.h, box.z];
            n = [f.s, 0, 0];
            u = [0, -f.s, 0]; // U = N x V, so the frame is a rotation and the winding survives it
            v = [0, 0, 1];
            fu = box.h;
            fv = box.d;
          } else {
            const pz = f.s < 0 ? box.z : box.z + box.d;
            o = f.s < 0 ? [box.x, box.y + box.h, pz] : [box.x, box.y, pz];
            n = [0, 0, f.s];
            u = [0, f.s, 0];
            v = [1, 0, 0];
            fu = box.h;
            fv = box.w;
          }
          const ix = Math.min(0.5, fu * 0.5);
          const iz = Math.min(0.5, fv * 0.5);
          const su = clamp((hit.x - o[0]) * u[0] + (hit.y - o[1]) * u[1] + (hit.z - o[2]) * u[2], ix, fu - ix);
          const sv = clamp((hit.x - o[0]) * v[0] + (hit.y - o[1]) * v[1] + (hit.z - o[2]) * v[2], iz, fv - iz);
          const rad = Math.min(Math.min(fu, fv) * 0.5 + 0.3, 0.7 + amount * 2.1);
          const inset = Math.min(0.22, Math.min(fu, fv) * 0.16);
          used += addFaceWeb(a, rng, o, u, v, n, su, sv, rad, amount, 1, box.c || NO_COLOR, {
            x0: inset,
            x1: fu - inset,
            z0: inset,
            z1: fv - inset,
          });
        } else {
          // Where on the face the web is seeded, and the rectangle it has to stay inside: a block
          // is a surface with EDGES, and its web is clipped to them (see `crackRun`). The inset
          // leaves room for the section's own width, which sits up to about a quarter of a unit
          // off the centreline, and scales down with the block so a small box still gets a web
          // rather than a dot.
          const ix = Math.min(0.5, box.w * 0.5);
          const iz = Math.min(0.5, box.d * 0.5);
          const hx = clamp(hit ? hit.x : box.x + box.w * 0.5, box.x + ix, box.x + box.w - ix);
          const hz = clamp(hit ? hit.z : box.z + box.d * 0.5, box.z + iz, box.z + box.d - iz);
          const rad = Math.min(Math.min(box.w, box.d) * 0.5 + 0.3, 0.7 + amount * 2.1);
          const inset = Math.min(0.22, Math.min(box.w, box.d) * 0.16);
          // The web is drawn in the BLOCK's colours (`box.c`), not the biome's ground colours: the
          // thing that is cracking is the block (see THE SURFACE PALETTE).
          used += addCrackWeb(a, rng, hx, box.y + box.h, hz, rad, amount, null, 1, box.c || NO_COLOR, {
            x0: box.x + inset,
            x1: box.x + box.w - inset,
            z0: box.z + inset,
            z1: box.z + box.d - inset,
          });
        }
      }
    }

    if (patches) {
      const yAt = (x, z) => this.groundHeightAt(x, z);
      // Most damaged first, so if the chunk runs out of budget it is the barely-cracked patches
      // that go without, not the ones being worked on. Each patch's geometry comes off its own
      // seed, so re-ordering them here cannot change what any of them looks like.
      const live = [];
      for (const p of patches.values()) if (p.dmg >= CRACK) live.push(p);
      live.sort((q, r) => r.dmg - q.dmg);
      for (const p of live) {
        if (used >= CRACK_NODE_BUDGET) break;
        const amount = Math.min(1, (p.dmg - CRACK) / (BREAK - CRACK));
        const x = p.hit ? p.hitX : p.x;
        const z = p.hit ? p.hitZ : p.z;
        // The web has to reach past its own patch to meet the next one, or every hit is an island
        // of cracks on otherwise perfect ground and the surface never reads as broken up.
        used += addCrackWeb(a, rngFor(p.px * 31 + 7, p.pz * 17 + 3, 4711), x, 0, z, 1.0 + amount * 1.4, amount, yAt, 0.92, null, null);
      }
    }

    if (craters) {
      const yAt = (x, z) => this.groundHeightAt(x, z);
      // Newest first: a crater is the most broken ground there is, so it gets the budget first.
      for (let i = craters.length - 1; i >= 0 && used < CRACK_NODE_BUDGET; i--) {
        used += addCrackRing(a, rngFor(craters[i].seed, 13, 771), craters[i], yAt, 0.8);
      }
    }

    if (!a.idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(a.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(a.nrm, 3));
    geo.setAttribute("aColor", new THREE.Float32BufferAttribute(a.col, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(a.uv, 2));
    geo.setIndex(a.idx);
    geo.computeBoundingSphere();
    return geo;
  }

  // ---- per-frame -------------------------------------------------------------------------
  update(dt) {
    // Rebuild the chunks the damage landed in. Capped per frame because one slam can dirty a
    // few (a crater's rim can span a chunk border), and a rebuild is a real mesh rebuild.
    if (this.dirty.size) {
      let n = 0;
      for (const k of this.dirty) {
        this.dirty.delete(k);
        const comma = k.indexOf(",");
        this.world.refreshChunk(Number(k.slice(0, comma)), Number(k.slice(comma + 1)));
        if (++n >= 3) break;
      }
    }

    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.age += dt;
      s.vy -= SHARD_G * dt;
      const drag = Math.max(0, 1 - 0.35 * dt);
      s.vx *= drag;
      s.vz *= drag;
      const m = s.mesh;
      m.position.x += s.vx * dt;
      m.position.y += s.vy * dt;
      m.position.z += s.vz * dt;
      m.rotation.x += s.wx * dt;
      m.rotation.y += s.wy * dt;
      m.rotation.z += s.wz * dt;

      if (s.vy < 0.02 && s.rest < 0.5) {
        const g = this.world.topBelow(m.position.x, m.position.z, m.position.y + 0.45, 8);
        if (m.position.y <= g + 0.05) {
          m.position.y = g + 0.05;
          if (s.vy < -1.4) {
            const hit = Math.min(1, -s.vy / 14);
            this.events.push({ type: "shardhit", x: m.position.x, y: g, z: m.position.z, power: hit });
            s.vy = -s.vy * 0.26;
            s.vx *= 0.62;
            s.vz *= 0.62;
            s.wx *= 0.5;
            s.wy *= 0.5;
            s.wz *= 0.5;
          } else {
            s.vy = 0;
            s.vx *= 0.7;
            s.vz *= 0.7;
            s.wx *= 0.55;
            s.wy *= 0.55;
            s.wz *= 0.55;
            s.rest += dt;
          }
        }
      }

      // Settled debris sinks into the ground and is gone: the world is endless, so it gets to
      // forget. The plate is still there under your feet for these few seconds, which is what
      // sells the moment.
      if (s.age > 3.4) {
        m.position.y -= 0.85 * dt * (1 + (s.age - 3.4));
        s.vx *= 0.9;
        s.vz *= 0.9;
      }
      if (s.age > 4.4) this.killShard(i);
    }
  }

  clear() {
    for (let i = this.shards.length - 1; i >= 0; i--) this.killShard(i);
    this.dirty.clear();
    this.events.length = 0;
  }

  // Forget EVERYTHING the field carried: every chunk's damage, every crater, every patch of
  // cracked ground and every shard of everything that has been broken. Damage is addressed by
  // chunk and box index, and the same index is a different box under the other world generator, so
  // a world switch has to drop the lot or the new maze would come in with the old field's holes in
  // it (see `setWorld` in main.js).
  reset() {
    this.chunks.clear();
    this.patches.clear();
    this.craters.clear();
    this.cellCache.clear();
    this.clear();
  }
}
