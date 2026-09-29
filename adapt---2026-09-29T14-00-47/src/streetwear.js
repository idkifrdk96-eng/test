import * as THREE from "./three.js";
import { createMaterial, attachOutline, settings } from "./ps1.js";
import { fitGroup } from "./geom.js";
import { POLE } from "./pole.js";

// ---------------------------------------------------------------------------
// Player character, modelled from the pixel-art sprite the user supplied.
//
// Flat-shaded, hard-edged low-poly in the same PS1 style as the rest of the
// game: a BLACK spiky low-poly hair mass built from chunky faceted locks, a
// short-sleeved tee with a collar rib and chest print, bare arms hanging
// straight at the sides, an enormous pair of bell-bottom pants and sneakers
// with a bright sole.
//
// NEON: the character carries no texture at all (the old multiply "detail
// atlas" is gone — see src/README.md). What used to be grit is now light: the
// palette below is saturated, and `characterMaterial` adds an emissive term, a
// Fresnel rim in the part's own colour, and hard cell-shaded diffuse bands, with
// an additive halo hull around the silhouette (`attachOutline`). The world is
// untouched — the player is the only thing in it that glows.
//
// FACELESS: the sprite draws no facial features, so the exposed face is bare
// skin — no eyes, nose or mouth. The fringe comes down to eye level and the
// skin shows from there to the chin.
//
// Everything is deliberately ANGULAR: straight segments with hard direction
// changes, chunky bevelled octagonal cross-sections, no smoothed curves.
//
// Authoring space: Y up, +Z = the character's forward, feet at y = 0, about
// 1.8 units tall. fitGroup() then scales it to CHAR_HEIGHT and stands it on the
// player's ground line (y = -0.45).
//
// How tall the runner is DRAWN: bigger than the collision cube it rides
// in, because the cube is hidden once a character loads and the character is what
// you actually look at all game. The feet stay pinned to the ground line, so the
// extra height grows upwards.
//
// These two are only the fallback for a caller that does not pass a size — in game the
// player passes `{ height: HY * BODY_RATIO, footY: -HY }` (see player.js), because the
// collision box is the authority on how big the character is. What is authored here is the
// RATIO: a body 2.6x the box half-height, feet on the box's bottom face.
const CHAR_HEIGHT = 1.17;
const CHAR_FOOT_Y = -0.45;
// ---------------------------------------------------------------------------

// The NEON palette.
//
// The world is still the muted PS1 city it always was; the PLAYER is the one thing in it with
// a plug in its back. Every cloth colour is a saturated, self-luminous hue, and the material
// adds its own Fresnel rim + emissive on top (see `characterMaterial`), so the character
// reads as painted in light rather than in fabric.
//
// The hair is the deliberate exception: it stays BLACK (see the `hair*` trio and the note on
// `hair()`), because a black silhouette is what the neon needs to sit against — and because
// that is the hairstyle the reference sheets show. Its values are the darkest thing on the
// model but NOT zero: the cel bands still have to be able to tell one facet from the next, so
// the top-lit crown facets land around #2e2e35 and the shadowed ones around #0d0d10.
const C = {
  skin: [0.960, 0.790, 0.735],
  skinLo: [0.800, 0.615, 0.600],
  hair: [0.070, 0.070, 0.082],
  hairHi: [0.132, 0.132, 0.152],
  hairLo: [0.026, 0.026, 0.032],
  shirt: [0.090, 0.800, 0.940],
  shirtHi: [0.360, 0.985, 1.000],
  shirtLo: [0.030, 0.500, 0.680],
  print: [0.960, 0.120, 0.620],
  pants: [0.360, 0.120, 0.860],
  pantsHi: [0.580, 0.280, 0.980],
  pantsLo: [0.180, 0.050, 0.500],
  shoe: [0.070, 0.075, 0.115],
  shoeHi: [0.230, 0.105, 0.430],
  shoeLo: [0.030, 0.030, 0.048],
  // The sole and the toe bumper go the other way: on a neon sneaker the bright line at the
  // bottom is the light source, not the shadow.
  white: [0.800, 1.000, 1.000],
  whiteLo: [0.560, 0.870, 0.960],
  trim: [0.980, 0.900, 0.200],
  trimLo: [0.900, 0.200, 0.650],
};

// --------------------------------------------------------------------------
// THE WARDROBE
//
// `C` above is not a constant — it is the character's live palette, and the wardrobe rewrites
// it IN PLACE. Two pieces of machinery make that work without touching a single authoring call:
//
//   * `CDEF` is the authored snapshot. A family's hi/lo pair is DERIVED from its base by the
//     HSL deltas measured off this snapshot, so picking one colour re-tones the whole family
//     (the cel bands keep their contrast at any hue) and picking the authored colour back
//     reproduces the authored pair bit-for-bit.
//
//   * Every colour that reaches `pushTri` is `mixc(a, b, t)` of two palette entries, and
//     `colSpec` — a WeakMap keyed on the colour ARRAY itself — remembers which two and how far
//     between. The build bakes that as a per-vertex (a, b, t) triple alongside the vertices,
//     so `repaintWardrobe` can recompute the entire model's colours from the palette in one
//     pass: no rebuild, no re-hierarchy, no shader change, and it is instant enough to drag a
//     colour picker against.
//
// Colours are exchanged with the UI as sRGB hex strings; the palette floats are the same
// numbers divided by 255, so the authored colour round-trips exactly through the picker.

// The palette keys in a fixed order — the wardrobe state stores vertex colours as indices into
// this list, not as names, because there is one triple per vertex.
const PKEYS = [
  "skin", "skinLo", "hair", "hairHi", "hairLo",
  "shirt", "shirtHi", "shirtLo", "print",
  "pants", "pantsHi", "pantsLo",
  "shoe", "shoeHi", "shoeLo",
  "white", "whiteLo", "trim", "trimLo",
];
const PINDEX = Object.create(null);
for (let i = 0; i < PKEYS.length; i++) PINDEX[PKEYS[i]] = i;

const CDEF = {};
for (const k of PKEYS) CDEF[k] = C[k].slice();

// colour array -> [indexA, indexB, t] (written by `mixc`, read by `pushTri`)
const colSpec = new WeakMap();
for (const k of PKEYS) colSpec.set(C[k], [PINDEX[k], PINDEX[k], 0]);

function hexOf(c) {
  const h = (v) => {
    const n = Math.max(0, Math.min(255, Math.round(v * 255)));
    return n.toString(16).padStart(2, "0");
  };
  return "#" + h(c[0]) + h(c[1]) + h(c[2]);
}

function rgbOf(hex) {
  const s = String(hex == null ? "" : hex).replace("#", "");
  const full = s.length === 3 ? s[0] + s[0] + s[1] + s[1] + s[2] + s[2] : s;
  const n = parseInt(full, 16);
  if (!isFinite(n) || full.length !== 6) return null;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function rgb2hsl(c) {
  const r = c[0];
  const g = c[1];
  const b = c[2];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = (g - b) / d / 6;
  else if (mx === g) h = (2 + (b - r) / d) / 6;
  else h = (4 + (r - g) / d) / 6;
  return [((h % 1) + 1) % 1, s, l];
}

function hsl2rgb(h, s, l) {
  if (s < 1e-6) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

// What the wardrobe lets you repaint. `hi`/`lo` are the family's cel-band partners; `print` is
// the one flat colour with no partners (the chest graphic).
const WARDROBE_FAMILIES = [
  { id: "shirt", name: "TOP", base: "shirt", hi: "shirtHi", lo: "shirtLo" },
  { id: "pants", name: "PANTS", base: "pants", hi: "pantsHi", lo: "pantsLo" },
  { id: "shoe", name: "SHOES", base: "shoe", hi: "shoeHi", lo: "shoeLo" },
  { id: "sole", name: "SOLES", base: "white", hi: null, lo: "whiteLo" },
  { id: "trim", name: "TRIM", base: "trim", hi: null, lo: "trimLo" },
  { id: "print", name: "PRINT", base: "print", hi: null, lo: null },
  { id: "hair", name: "HAIR", base: "hair", hi: "hairHi", lo: "hairLo" },
  { id: "skin", name: "SKIN", base: "skin", hi: null, lo: "skinLo" },
];

// The hi/lo recipe of each family, measured off the authored palette once.
const FAM = Object.create(null);
for (const f of WARDROBE_FAMILIES) {
  const b = rgb2hsl(CDEF[f.base]);
  const d = {};
  for (const lvl of ["hi", "lo"]) {
    if (!f[lvl]) continue;
    const v = rgb2hsl(CDEF[f[lvl]]);
    let dh = v[0] - b[0];
    if (dh > 0.5) dh -= 1;
    if (dh < -0.5) dh += 1;
    d[lvl] = [dh, v[1] - b[1], v[2] - b[2]];
  }
  FAM[f.id] = { f, d, def: hexOf(CDEF[f.base]) };
}

// A family picked by the player, as hex. Families with no entry are at their authored colour.
const WARDROBE = Object.create(null);

function setPal(key, rgb) {
  const a = C[key];
  a[0] = rgb[0];
  a[1] = rgb[1];
  a[2] = rgb[2];
}

// Re-derive one family from its base colour. The hue AND saturation shifts fade out together
// as the base loses saturation: a recipe measured off a saturated cyan is meaningless on a
// grey, and letting it through tints every neutral pick (measured: a #808080 tee came out with
// a red-warm hi/lo pair, because a pure grey reports hue 0 and then had saturation added to
// it). The lightness delta always applies — bands are bands at any colour.
function hslShift(base, d) {
  const hsl = rgb2hsl(base);
  const fade = Math.min(1, hsl[1] / 0.18);
  const h = hsl[0] + d[0] * fade;
  const s = Math.max(0, Math.min(1, hsl[1] + d[1] * fade));
  const l = Math.max(0, Math.min(1, hsl[2] + d[2]));
  return hsl2rgb(((h % 1) + 1) % 1, s, l);
}

function toneFamily(fid) {
  const F = FAM[fid];
  if (!F) return;
  const hex = WARDROBE[fid] || F.def;
  if (hex === F.def) {
    // The authored colour: restore the authored trio verbatim, so no HSL round-trip drift can
    // creep into the look the whole character was tuned around.
    setPal(F.f.base, CDEF[F.f.base]);
    if (F.f.hi) setPal(F.f.hi, CDEF[F.f.hi]);
    if (F.f.lo) setPal(F.f.lo, CDEF[F.f.lo]);
    return;
  }
  const rgb = rgbOf(hex);
  if (!rgb) return;
  setPal(F.f.base, rgb);
  if (F.f.hi) setPal(F.f.hi, hslShift(rgb, F.d.hi));
  if (F.f.lo) setPal(F.f.lo, hslShift(rgb, F.d.lo));
}

// Recompute every vertex colour of a built character from the current palette. Cheap: it is a
// lerp per vertex, and the attribute upload is the only real cost (a few hundred KB).
export function repaintWardrobe(root) {
  if (!root || !root.traverse) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline) return;
    const g = o.geometry;
    const pal = g && g.userData ? g.userData.pal : null;
    if (!pal) return;
    const attr = g.getAttribute("aColor");
    if (!attr) return;
    const arr = attr.array;
    for (let i = 0; i < arr.length; i += 3) {
      const ai = pal[i];
      if (ai < 0) continue;
      const A = C[PKEYS[ai]];
      const B = C[PKEYS[pal[i + 1]]];
      const t = pal[i + 2];
      arr[i] = A[0] + (B[0] - A[0]) * t;
      arr[i + 1] = A[1] + (B[1] - A[1]) * t;
      arr[i + 2] = A[2] + (B[2] - A[2]) * t;
      n++;
    }
    attr.needsUpdate = true;
  });
  return n;
}

export function wardrobeState() {
  return WARDROBE_FAMILIES.map((f) => ({ id: f.id, name: f.name, value: hexOf(C[f.base]) }));
}

export function wardrobeOverrides() {
  const o = {};
  for (const k in WARDROBE) o[k] = WARDROBE[k];
  return o;
}

// Paint one family AND everything built from it. The caller repaints the live rig.
export function setWardrobeColor(fid, hex) {
  if (!FAM[fid]) return;
  WARDROBE[fid] = hex;
  toneFamily(fid);
}

export function applyWardrobe(o) {
  for (const k in WARDROBE) delete WARDROBE[k];
  if (o) for (const k in o) if (FAM[k] && rgbOf(o[k])) WARDROBE[k] = String(o[k]);
  for (const f of WARDROBE_FAMILIES) toneFamily(f.id);
}

export function resetWardrobe() {
  applyWardrobe(null);
}

export function wardrobeHex(fid) {
  return FAM[fid] ? hexOf(C[FAM[fid].f.base]) : null;
}

// Whole outfits. A preset lists every family it cares about; anything it omits stays authored.
// NEON is the authored look with no overrides at all.
const OUTFITS = [
  { id: "neon", name: "NEON", colors: {} },
  {
    id: "mono",
    name: "MONO",
    colors: {
      shirt: "#e6e7ea", print: "#8b8f99", pants: "#26262c", shoe: "#101014",
      sole: "#f4f4f6", trim: "#9aa0ab", hair: "#131317", skin: "#e7cec1",
    },
  },
  {
    id: "blood",
    name: "BLOOD",
    colors: {
      shirt: "#c8181f", print: "#16161a", pants: "#2c0f14", shoe: "#190a0c",
      sole: "#f0d5d5", trim: "#ff5a3c", hair: "#150b0c", skin: "#e3b69c",
    },
  },
  {
    id: "ice",
    name: "ICE",
    colors: {
      shirt: "#7ee6ff", print: "#ffffff", pants: "#2a6ea9", shoe: "#dfe9f2",
      sole: "#ffffff", trim: "#4aa8ff", hair: "#1b2432", skin: "#e9d4c9",
    },
  },
  {
    id: "toxic",
    name: "TOXIC",
    colors: {
      shirt: "#c6ff2a", print: "#191a12", pants: "#1f2b18", shoe: "#131a12",
      sole: "#ecff9c", trim: "#7affc0", hair: "#10140e", skin: "#e4c6a6",
    },
  },
];

export function outfitList() {
  return OUTFITS.map((o) => ({
    id: o.id,
    name: o.name,
    chips: ["shirt", "pants", "shoe", "trim"].map((f) => o.colors[f] || FAM[f].def),
  }));
}

export function currentOutfit() {
  for (const o of OUTFITS) {
    let match = true;
    for (const f of WARDROBE_FAMILIES) {
      const want = o.colors[f.id] || FAM[f.id].def;
      if (wardrobeHex(f.id) !== want) {
        match = false;
        break;
      }
    }
    if (match) return o.id;
  }
  return "custom";
}

export function outfitName(id) {
  const o = OUTFITS.find((x) => x.id === id);
  return o ? o.name : "CUSTOM";
}

export function setOutfit(id) {
  const o = OUTFITS.find((x) => x.id === id);
  if (!o) return;
  applyWardrobe(o.colors);
}

export function nextOutfit() {
  const i = OUTFITS.findIndex((o) => o.id === currentOutfit());
  return OUTFITS[(i + 1 + OUTFITS.length) % OUTFITS.length].id;
}

// --------------------------------------------------------------------------
// Geometry accumulator. Triangles are wound automatically: each one is given a
// reference point known to lie inside the part, and the winding/normal is
// flipped if it would face inwards. That keeps the hand-built lofts consistent
// no matter how their rings are ordered.
// --------------------------------------------------------------------------

function makeAcc() {
  return { pos: [], nrm: [], col: [], pal: [] };
}

function pushTri(a, p, q, r, col, ref) {
  const ux = q[0] - p[0];
  const uy = q[1] - p[1];
  const uz = q[2] - p[2];
  const vx = r[0] - p[0];
  const vy = r[1] - p[1];
  const vz = r[2] - p[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len < 1e-9) return;
  nx /= len;
  ny /= len;
  nz /= len;
  const cx = (p[0] + q[0] + r[0]) / 3;
  const cy = (p[1] + q[1] + r[1]) / 3;
  const cz = (p[2] + q[2] + r[2]) / 3;
  let q2 = q;
  let r2 = r;
  if (nx * (cx - ref[0]) + ny * (cy - ref[1]) + nz * (cz - ref[2]) < 0) {
    q2 = r;
    r2 = q;
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  a.pos.push(p[0], p[1], p[2], q2[0], q2[1], q2[2], r2[0], r2[1], r2[2]);
  a.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  a.col.push(col[0], col[1], col[2], col[0], col[1], col[2], col[0], col[1], col[2]);
  // Which two palette entries this vertex's colour was mixed from, and how far between them —
  // the wardrobe's handle on it (see THE WARDROBE). -1 means "not a palette colour".
  const sp = colSpec.get(col);
  if (sp) a.pal.push(sp[0], sp[1], sp[2], sp[0], sp[1], sp[2], sp[0], sp[1], sp[2]);
  else a.pal.push(-1, -1, 0, -1, -1, 0, -1, -1, 0);
}

function pushQuad(a, p, q, r, s, col, ref) {
  pushTri(a, p, q, r, col, ref);
  pushTri(a, p, r, s, col, ref);
}

function centroid(pts) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = pts.length;
  return [x / n, y / n, z / n];
}

function pick(col, i) {
  return typeof col === "function" ? col(i) : col;
}

function mixc(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  const out = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  // Keep the mix's recipe with it so the wardrobe can re-derive it from a new palette.
  const sa = colSpec.get(a);
  const sb = colSpec.get(b);
  if (sa && sb) colSpec.set(out, [sa[0], sb[0], k]);
  return out;
}

// Per-band colour ramp used by the big lofts: dark at the hem, lighter as the
// surface rises, so stacked fabric reads as volume even without a texture.
function ramp(lo, hi, n) {
  return (i) => mixc(lo, hi, i / n);
}

// An 8-sided rounded-box cross-section in the XZ plane (the low-poly look).
function ring(cx, cy, cz, rx, rz, bev = 0.42) {
  const bx = rx * bev;
  const bz = rz * bev;
  return [
    [cx + rx, cy, cz - rz + bz],
    [cx + rx, cy, cz + rz - bz],
    [cx + rx - bx, cy, cz + rz],
    [cx - rx + bx, cy, cz + rz],
    [cx - rx, cy, cz + rz - bz],
    [cx - rx, cy, cz - rz + bz],
    [cx - rx + bx, cy, cz - rz],
    [cx + rx - bx, cy, cz - rz],
  ];
}

function hash1(n) {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

// A round cross-section with per-point radial/height jitter — used to give the
// hair mass an irregular, tousled silhouette instead of a smooth dome.
function ringN(n, cx, cy, cz, rx, rz, opts = {}) {
  const jr = opts.jr || 0;
  const jy = opts.jy || 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + (opts.phase || 0);
    const k = 1 + (hash1(i * 12.9898 + (opts.seed || 1) * 78.233) - 0.5) * 2 * jr;
    const dy = (hash1(i * 39.3467 + (opts.seed || 1) * 11.135) - 0.5) * 2 * jy;
    out.push([cx + Math.cos(ang) * rx * k, cy + dy, cz + Math.sin(ang) * rz * k]);
  }
  return out;
}

function rotY(pts, cx, cz, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return pts.map((p) => [
    cx + (p[0] - cx) * c + (p[2] - cz) * s,
    p[1],
    cz - (p[0] - cx) * s + (p[2] - cz) * c,
  ]);
}

function capRing(a, pts, col, up) {
  const c = centroid(pts);
  const ref = [c[0], c[1] - up * 0.05, c[2]];
  const n = pts.length;
  for (let j = 0; j < n; j++) pushTri(a, pts[j], pts[(j + 1) % n], c, col, ref);
}

// Stitch a stack of equal-length rings into a tube.
function loft(a, sections, col, opts = {}) {
  const cents = sections.map(centroid);
  const n = sections[0].length;
  for (let i = 0; i < sections.length - 1; i++) {
    const A = sections[i];
    const B = sections[i + 1];
    const ref = [
      (cents[i][0] + cents[i + 1][0]) / 2,
      (cents[i][1] + cents[i + 1][1]) / 2,
      (cents[i][2] + cents[i + 1][2]) / 2,
    ];
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      pushQuad(a, A[j], B[j], B[k], A[k], pick(col, i), ref);
    }
  }
  if (opts.capStart) capRing(a, sections[0], pick(col, -1), -1);
  if (opts.capEnd) capRing(a, sections[sections.length - 1], pick(col, sections.length), 1);
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function unit(a) {
  const l = Math.sqrt(dot(a, a)) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

// A "lock" — a tapered flat hank of hair running from `from` to `to`: wide
// across `side`, thin along `up`. Passing a radial `up` lays the lock flat
// against the skull, which is what makes low-poly hair read as clumps of hair
// rather than as spikes stuck into a ball. `bend` bows the hank out along `up`,
// and `wob`/`sway` add a second order of deviation so one lock can kink more
// than once instead of running straight.
function lock(a, o) {
  const from = o.from;
  const to = o.to;
  const d = sub(to, from);
  const len = Math.sqrt(dot(d, d));
  const fwd = unit(d);
  let up = o.up || [0, 1, 0];
  up = sub(up, [fwd[0] * dot(up, fwd), fwd[1] * dot(up, fwd), fwd[2] * dot(up, fwd)]);
  if (Math.sqrt(dot(up, up)) < 1e-5) up = [1, 0, 0];
  up = unit(up);
  const side = unit(cross(up, fwd));
  const segs = o.segs || 4;
  const bend = o.bend || 0;
  const wob = o.wob || 0;
  const wobPh = o.wobPh || 0;
  const sway = o.sway || 0;
  const swayPh = o.swayPh || 0;
  const sections = [];
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    const w = o.w0 + (o.w1 - o.w0) * s;
    const t = o.t0 + (o.t1 - o.t0) * s;
    const off = bend * Math.sin(Math.PI * s) + wob * Math.sin(2 * Math.PI * s + wobPh);
    const offS = sway * Math.sin(Math.PI * s) + sway * 0.6 * Math.sin(2 * Math.PI * s + swayPh);
    const bx = from[0] + fwd[0] * len * s + up[0] * off + side[0] * offS;
    const by = from[1] + fwd[1] * len * s + up[1] * off + side[1] * offS;
    const bz = from[2] + fwd[2] * len * s + up[2] * off + side[2] * offS;
    const p = (sw, st) => [
      bx + side[0] * sw + up[0] * st,
      by + side[1] * sw + up[1] * st,
      bz + side[2] * sw + up[2] * st,
    ];
    sections.push([p(w, t), p(-w, t), p(-w, -t), p(w, -t)]);
  }
  loft(a, sections, o.col, { capStart: o.capStart !== false, capEnd: o.capEnd !== false });
}

function boxAt(a, o) {
  const cx = o.c[0];
  const cy = o.c[1];
  const cz = o.c[2];
  const hx = o.s[0];
  const hy = o.s[1];
  const hz = o.s[2];
  const r = o.rot || [0, 0, 0];
  const cxe = Math.cos(r[0]);
  const sxe = Math.sin(r[0]);
  const cye = Math.cos(r[1]);
  const sye = Math.sin(r[1]);
  const cze = Math.cos(r[2]);
  const sze = Math.sin(r[2]);
  const rot = (p) => {
    let x = p[0];
    let y = p[1];
    let z = p[2];
    const y1 = y * cxe - z * sxe;
    const z1 = y * sxe + z * cxe;
    y = y1;
    z = z1;
    const x1 = x * cye + z * sye;
    const z2 = -x * sye + z * cye;
    x = x1;
    z = z2;
    const x2 = x * cze - y * sze;
    const y2 = x * sze + y * cze;
    return [x2 + cx, y2 + cy, z2 + cz];
  };
  const P = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ].map(rot);
  const ref = [cx, cy, cz];
  const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
  for (const f of faces) pushQuad(a, P[f[0]], P[f[1]], P[f[2]], P[f[3]], o.col, ref);
}

// A coarse 8-sided ellipsoid. Used only as a joint filler: buried inside the
// limb it is invisible in the rest pose, and when the joint hinges it plugs the
// wedge that opens on the outside of the bend.
function ballAt(a, cx, cy, cz, rx, ry, rz, col) {
  const N = 8;
  const M = 4;
  const rings = [];
  for (let j = 0; j <= M; j++) {
    const v = (j / M) * Math.PI;
    const f = Math.sin(v);
    const y = cy + Math.cos(v) * ry;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const u = (i / N) * Math.PI * 2;
      pts.push([cx + Math.cos(u) * rx * f, y, cz + Math.sin(u) * rz * f]);
    }
    rings.push(pts);
  }
  loft(a, rings, col);
}

// --------------------------------------------------------------------------
// Feet — chunky black sneakers with a fat white sole. In the sprite only the
// very bottom of the shoe shows, poking out from under the pant hem.
// --------------------------------------------------------------------------

function shoe(a, s) {
  const x = 0.205 * s;
  const ang = 0.11 * s;
  const cz = 0.030;
  const place = (pts) => rotY(pts, x, cz, ang);
  const put = (secs, col, opts) => loft(a, secs.map(place), col, opts);

  // White sole: the thin bright line the sprite shows at the very bottom.
  put([
    ring(x, 0.000, cz, 0.092, 0.148, 0.45),
    ring(x, 0.032, cz, 0.102, 0.160, 0.45),
    ring(x, 0.058, cz - 0.002, 0.100, 0.156, 0.45),
  ], C.white, { capStart: true });

  // Black upper, ramping up into the ankle.
  put([
    ring(x, 0.058, cz - 0.002, 0.100, 0.156, 0.40),
    ring(x, 0.108, cz - 0.008, 0.096, 0.148, 0.40),
    ring(x, 0.158, cz - 0.020, 0.091, 0.134, 0.40),
    ring(x, 0.200, cz - 0.036, 0.085, 0.116, 0.40),
    ring(x, 0.228, cz - 0.048, 0.079, 0.100, 0.40),
  ], ramp(C.shoeLo, C.shoeHi, 4), { capEnd: true });

  // Toe cap: a small white bumper at the front, like the sole wrapping up.
  put([
    ring(x, 0.052, cz + 0.112, 0.076, 0.044, 0.5),
    ring(x, 0.086, cz + 0.104, 0.070, 0.038, 0.5),
    ring(x, 0.110, cz + 0.092, 0.058, 0.028, 0.5),
  ], C.whiteLo, { capStart: true, capEnd: true });

  // Foxing line: a thin rubber lip where the sole meets the upper, standing slightly proud of
  // both so it reads as a real sneaker seam from any angle instead of a colour change.
  put([
    ring(x, 0.046, cz - 0.002, 0.106, 0.164, 0.42),
    ring(x, 0.062, cz - 0.004, 0.106, 0.163, 0.42),
  ], C.trimLo, { capStart: true, capEnd: true });

  // Laces: three bars across the instep plus the eyelet tabs they run between. They are the
  // detail that tells you which end of the shoe is the front when the camera is right down
  // on the deck, and they break up the otherwise plain upper.
  for (let i = 0; i < 3; i++) {
    const ly = 0.128 + i * 0.026;
    const lz = cz - 0.030 + i * 0.016;
    boxAt(a, { c: [x, ly, lz], s: [0.070 - i * 0.006, 0.009, 0.014], rot: [0.30 - i * 0.12, ang, 0], col: C.trim });
    for (const e of [-1, 1]) {
      boxAt(a, {
        c: [x + e * (0.062 - i * 0.006), ly + 0.004, lz],
        s: [0.012, 0.012, 0.012],
        rot: [0, ang, 0],
        col: C.trimLo,
      });
    }
  }
}

// --------------------------------------------------------------------------
// Legs — the dominant feature of the sprite: huge black bell-bottoms that flare
// out from the hips, merge into one mass in the middle and break over the
// sneakers at the ankle. Long straight facets, no smooth taper.
// --------------------------------------------------------------------------

const LEG_SECS = [
  [0.235, 0.194, 0.170, 0.168],
  [0.360, 0.190, 0.190, 0.186],
  [0.500, 0.166, 0.176, 0.176],
  [0.650, 0.140, 0.158, 0.164],
  [0.820, 0.096, 0.126, 0.140],
  [0.960, 0.089, 0.122, 0.136],
  [1.030, 0.086, 0.118, 0.132],
];

// --------------------------------------------------------------------------
// Skeleton. The character is built as a small hierarchy of rigid parts hinged
// at these joints, so `poseRun` (bottom of this file) can rotate it. Everything
// below the shoulder is authored in the same absolute space as before: each
// joint just names a point the rig is cut and hinged at, and the rest pose is
// bit-for-bit the old single-mesh model.
// --------------------------------------------------------------------------

const HIP_Y = 1.000;
const KNEE_Y = 0.560;
const ANKLE_Y = 0.225;
const ANKLE_X = 0.200;
const ANKLE_Z = 0.010;
const NECK_Y = 1.440;
// THE NECK JOINT (the user's *"add neck wrest bone for the player animations"* — session 155). The
// rig always had a HEAD bone (`NECK_Y`, where the skull hinges on the chest) but nothing between the
// chest and it, so a head turn was a hinge at the collar line: the whole head rotated as one block
// and the neck was only the funnel `neck()` draws inside the tee. The neck is now a real joint of
// its own, hung off the torso with the head hung off IT. `NECK_BASE_Y` is where it pivots: the
// drawn funnel runs 1.290-1.446 (see `neck()`), so this is a third of the way up it — the base of
// the cervical spine rather than the jaw. The head keeps its own pivot at `NECK_Y`, so at rest the
// rig is bit-for-bit what it was (`NECK_Y - NECK_BASE_Y` is the head's own offset up the neck); what
// the new joint buys is the SHARE of every head rotation it now takes — see `NECK_SPLIT`.
const NECK_BASE_Y = 1.330;
const SHOULDER_X = 0.215;
const SHOULDER_Y = 1.400;
const SHOULDER_Z = -0.004;
const ELBOW_X = 0.294;
const ELBOW_Y = 1.086;
const ELBOW_Z = -0.004;

// The sole, as an offset from the ankle pivot: a flat plate 0.225 below the
// joint, reaching `SOLE_TOE` forward and `SOLE_HEEL` back. `poseRun` plants
// whichever of those two points is lowest on the ground.
const SOLE_Y = -0.225;
const SOLE_TOE = 0.176;
const SOLE_HEEL = -0.128;

// The pant tube as [y, centreX, rx, rz, band], `band` being the position in the
// hem-to-waist colour ramp. Row 3 is the knee: interpolated off LEG_SECS so the
// cut between the two leg bones lands exactly on the joint.
const LEG_TUBE = [
  [0.235, 0.194, 0.170, 0.168, 0],
  [0.360, 0.190, 0.190, 0.186, 1],
  [0.500, 0.166, 0.176, 0.176, 2],
  [KNEE_Y, 0.1556, 0.1688, 0.1712, 2.4],
  [0.650, 0.140, 0.158, 0.164, 3],
  [0.820, 0.096, 0.126, 0.140, 4],
  [0.960, 0.089, 0.122, 0.136, 5],
  [1.030, 0.086, 0.118, 0.132, 6],
];
const LEG_KNEE_ROW = 3;

// Leg cross-section at a height, used to lay creases on the pant surface.
function legAt(y) {
  const S = LEG_SECS;
  if (y <= S[0][0]) return [S[0][1], S[0][2], S[0][3]];
  for (let i = 0; i < S.length - 1; i++) {
    if (y <= S[i + 1][0]) {
      const t = (y - S[i][0]) / (S[i + 1][0] - S[i][0]);
      return [
        S[i][1] + (S[i + 1][1] - S[i][1]) * t,
        S[i][2] + (S[i + 1][2] - S[i][2]) * t,
        S[i][3] + (S[i + 1][3] - S[i][3]) * t,
      ];
    }
  }
  const L = S[S.length - 1];
  return [L[1], L[2], L[3]];
}

// One half of the pant tube: rows run bottom-to-top, so `legHalf` always lofts
// upward and the two halves butt together at the knee ring.
// `lo`/`hi` are the pair the row ramp crosses. Defaulted (not baked) so the wardrobe's live
// palette is read at build time — an enemy is built with the SKIN family overridden to its own
// grey, and the naked leg has to pick that up the same way every other skin surface does.
function legHalf(a, s, rows, lo = C.pantsLo, hi = C.pantsHi) {
  const secs = rows.map((r) => ring(r[1] * s, r[0], 0.004, r[2], r[3], 0.40));
  const col = (i) => mixc(lo, hi, rows[Math.max(0, Math.min(rows.length - 1, i))][4] / 6);
  loft(a, secs, col, { capStart: true, capEnd: true });
}

function legUpper(a, s, naked) {
  if (naked) legHalf(a, s, NAKED_LEG.slice(LEG_KNEE_ROW), C.skinLo, C.skin);
  else {
    legHalf(a, s, LEG_TUBE.slice(LEG_KNEE_ROW));
    legCreases(a, s, 1.00, KNEE_Y);
  }
}

function legLower(a, s, naked) {
  if (naked) legHalf(a, s, NAKED_LEG.slice(0, LEG_KNEE_ROW + 1), C.skinLo, C.skin);
  else {
    legHalf(a, s, LEG_TUBE.slice(0, LEG_KNEE_ROW + 1));
    legCreases(a, s, KNEE_Y, 0.00);
  }
}

// Knee filler: a small ellipsoid buried inside the flare at the joint. Straight
// it is completely hidden (the pants are ~0.17 wide there, the ball 0.15); as
// soon as the knee bends it covers the wedge that opens behind the joint. The nude knee is
// the same ball shrunk onto the bare joint (the naked leg is 0.156 wide there).
function legKnee(a, s, naked) {
  if (naked) ballAt(a, 0.1556 * s, KNEE_Y, 0.004, 0.084, 0.080, 0.084, C.skin);
  else ballAt(a, 0.1556 * s, KNEE_Y, 0.004, 0.150, 0.088, 0.150, C.pantsLo);
}

// A hard vertical ridge down the outside/front of a leg, split at the knee so
// each bone carries its own half. Widths are read off the original uninterrupted
// crease, so the two halves line up exactly where they meet.
function legCreases(a, s, yTop, yBot) {
  for (const c of LEG_CREASES) {
    const ya = Math.min(c.y0, yTop);
    const yb = Math.max(c.y1, yBot);
    if (ya - yb < 0.02) continue;
    const frac = (y) => (c.y0 - y) / (c.y0 - c.y1);
    const wAt = (y) => [c.w * (1 + 0.15 * frac(y)), c.t * (1 + 0.2 * frac(y))];
    const [wa, ta] = wAt(ya);
    const [wb, tb] = wAt(yb);
    lock(a, {
      from: legSurf(s, ya, c.th * (1 - 0.14 * frac(ya))),
      to: legSurf(s, yb, c.th * (1 - 0.14 * frac(yb))),
      up: [Math.cos(c.th) * s, 0.1, Math.sin(c.th)],
      w0: wa,
      t0: ta,
      w1: wb,
      t1: tb,
      bend: 0.004,
      segs: 3,
      col: c.col,
    });
  }
}

const LEG_CREASES = [
  { th: 0.00, col: C.pantsLo, w: 0.030, t: 0.013, y0: 0.900, y1: 0.370 },
  { th: 0.95, col: C.pantsHi, w: 0.034, t: 0.012, y0: 0.900, y1: 0.370 },
  { th: -1.05, col: C.pantsLo, w: 0.028, t: 0.012, y0: 0.900, y1: 0.370 },
  { th: -0.50, col: C.pantsHi, w: 0.030, t: 0.012, y0: 0.880, y1: 0.420 },
  { th: -2.10, col: C.pantsLo, w: 0.032, t: 0.013, y0: 0.860, y1: 0.340 },
  { th: Math.PI, col: C.pantsLo, w: 0.046, t: 0.015, y0: 0.760, y1: 0.262 },
];

function legSurf(s, y, th) {
  const [cx, rx, rz] = legAt(y);
  return [cx * s + Math.cos(th) * rx * s, y, 0.004 + Math.sin(th) * rz];
}

// --------------------------------------------------------------------------
// Torso — light-grey short-sleeved tee: hem band, body, collar rib and a small
// dark chest print.
// --------------------------------------------------------------------------

function torso(a) {
  loft(a, [
    ring(0, 0.928, 0.000, 0.160, 0.121, 0.44),
    ring(0, 0.968, 0.000, 0.159, 0.120, 0.44),
    ring(0, 1.060, 0.000, 0.151, 0.114, 0.44),
    ring(0, 1.180, 0.000, 0.146, 0.110, 0.44),
    ring(0, 1.300, 0.000, 0.151, 0.111, 0.44),
    ring(0, 1.395, 0.000, 0.161, 0.113, 0.44),
    ring(0, 1.432, 0.000, 0.165, 0.114, 0.46),
    ring(0, 1.452, 0.000, 0.138, 0.099, 0.46),
  ], (i) => (i === 0 ? C.shirtLo : mixc(C.shirt, C.shirtHi, (i - 1) / 6)), {
    capStart: true,
    capEnd: true,
  });

  // Collar rib around the neck opening.
  loft(a, [
    ring(0, 1.442, 0.000, 0.112, 0.090, 0.46),
    ring(0, 1.470, 0.000, 0.104, 0.085, 0.46),
  ], C.shirtLo, { capEnd: true });

  // Chest print: three small diamonds stacked over a bar.
  for (let i = 0; i < 3; i++) {
    boxAt(a, {
      c: [0, 1.312 - i * 0.054, 0.114],
      s: [0.019, 0.019, 0.007],
      rot: [0, 0, Math.PI / 4],
      col: C.print,
    });
  }
  boxAt(a, { c: [0, 1.128, 0.113], s: [0.011, 0.045, 0.006], col: C.print });

  // Back print: a wide bar over two slashes, sitting proud of the tee. The sprite only ever
  // shows the front, so this is invented — but a blank back is the one place a low-poly
  // character reads as unfinished from the chase camera, which is where you look at it ALL
  // game. Kept in the same grey as the chest mark so it never fights the silhouette.
  boxAt(a, { c: [0, 1.300, -0.106], s: [0.062, 0.011, 0.009], col: C.print });
  for (const s of [-1, 1]) {
    boxAt(a, { c: [0.026 * s, 1.232, -0.106], s: [0.010, 0.048, 0.009], rot: [0, 0, -0.36 * s], col: C.print });
  }
  boxAt(a, { c: [0, 1.166, -0.108], s: [0.030, 0.008, 0.008], col: C.print });

  // Chest pocket: a small patch panel on the left of the tee.
  boxAt(a, { c: [0.072, 1.268, 0.104], s: [0.046, 0.050, 0.010], col: C.shirtLo });
  boxAt(a, { c: [0.072, 1.312, 0.106], s: [0.050, 0.010, 0.012], col: C.shirtHi });

  // Hem lip: the bottom of the tee stands a hair proud of the body, so the shirt has a
  // visible edge instead of fading into the trousers.
  loft(a, [
    ring(0, 0.926, 0.000, 0.166, 0.127, 0.44),
    ring(0, 0.944, 0.000, 0.168, 0.129, 0.44),
  ], C.shirtLo, { capStart: true, capEnd: true });

  // Drawstrings: two cords hanging out of the collar with little aglets on the ends.
  for (const s of [-1, 1]) {
    lock(a, {
      from: [0.030 * s, 1.438, 0.076],
      to: [0.038 * s, 1.322, 0.104],
      up: [0.2 * s, -1, 0.1],
      w0: 0.011, t0: 0.008, w1: 0.008, t1: 0.006,
      bend: -0.012, wob: 0.006, wobPh: 1.4 + s, segs: 3, col: C.shirtHi,
    });
    boxAt(a, { c: [0.039 * s, 1.312, 0.107], s: [0.009, 0.013, 0.009], col: C.trim });
  }

  // Hard folds down the front corners, so the tee is not a bare cylinder.
  for (const s of [-1, 1]) {
    lock(a, {
      from: [0.137 * s, 1.400, 0.059], to: [0.129 * s, 1.060, 0.060],
      up: [s, 0.05, 0.6], w0: 0.026, t0: 0.009, w1: 0.022, t1: 0.011, segs: 3, col: C.shirtLo,
    });
    lock(a, {
      from: [0.137 * s, 1.396, -0.055], to: [0.128 * s, 1.080, -0.056],
      up: [s, 0.05, -0.55], w0: 0.024, t0: 0.009, w1: 0.020, t1: 0.011, segs: 3, col: C.shirtLo,
    });
  }
}

// Short sleeves: fat tubes around the upper arm that flare off the shoulders,
// stopping well above the elbow exactly like the sprite.
//
// The first four rings are the SHOULDER WRAP, which carries the sleeve's mouth up
// over the deltoid and tucks its opening down inside the torso. Without it the
// sleeve is an open-topped tube, and a camera swung overhead looks straight down
// that tube onto the bare cap of the arm — bright skin showing through the shirt,
// which is what read as the shirt splitting open from above. Closing the mouth
// also makes the shoulder one rounded cloth surface instead of a cut-off cylinder.
function sleeve(a, s) {
  loft(a, [
    ring(0.104 * s, 1.442, -0.010, 0.028, 0.030, 0.40),
    ring(0.148 * s, 1.450, -0.008, 0.056, 0.058, 0.40),
    ring(0.188 * s, 1.446, -0.006, 0.073, 0.075, 0.40),
    ring(0.206 * s, 1.434, -0.006, 0.079, 0.081, 0.40),
    ring(0.240 * s, 1.392, -0.004, 0.092, 0.094, 0.40),
    ring(0.264 * s, 1.290, -0.004, 0.089, 0.091, 0.40),
    ring(0.286 * s, 1.180, -0.002, 0.082, 0.084, 0.40),
    ring(0.300 * s, 1.090, -0.002, 0.074, 0.076, 0.40),
    ring(0.304 * s, 1.058, -0.002, 0.069, 0.071, 0.40),
  ], (i) => (i >= 6 ? C.shirtLo : i >= 3 ? C.shirt : C.shirtHi), { capStart: true, capEnd: true });

  // Cuff: the sleeve's hem, standing proud of the arm so the short sleeve has a real edge.
  loft(a, [
    ring(0.303 * s, 1.046, -0.002, 0.077, 0.079, 0.40),
    ring(0.302 * s, 1.070, -0.002, 0.078, 0.080, 0.40),
  ], C.shirtLo, { capStart: true, capEnd: true });
}

// --------------------------------------------------------------------------
// Arms — bare skin below the sleeve. Dead straight, angled slightly outward.
// --------------------------------------------------------------------------

// The first ring is the shoulder stub: it starts well below the sleeve's mouth so
// it stays buried inside the sleeve's new shoulder wrap and can never poke through
// it (or be seen down it).
const ARM_PATH = [
  [0.247, 1.372, -0.004, 0.066, 0.068],
  [0.272, 1.238, -0.004, 0.052, 0.054],
  [0.294, 1.086, -0.004, 0.047, 0.049],
  [0.312, 0.940, -0.002, 0.043, 0.047],
  [0.328, 0.870, -0.002, 0.041, 0.045],
  [0.336, 0.830, -0.002, 0.038, 0.044],
];

// Upper arm: bare skin from the shoulder down to the elbow pivot. Split off from
// the forearm so the elbow can hinge; both stubs are capped and a skin ball sits
// on the joint, so a bent elbow shows no hole.
function armUpper(a, s) {
  loft(
    a,
    ARM_PATH.slice(0, 3).map((r) => ring(r[0] * s, r[1], r[2], r[3], r[4], 0.38)),
    C.skin,
    { capStart: true, capEnd: true }
  );
}

function armLower(a, s, naked) {
  loft(
    a,
    ARM_PATH.slice(2).map((r) => ring(r[0] * s, r[1], r[2], r[3], r[4], 0.38)),
    C.skin,
    { capStart: true, capEnd: true }
  );
  if (naked) return;
  // Wristband: a plain cloth cuff sitting just above the hand. It travels with the forearm,
  // so it never fights the fist as it closes, and it is the one piece of the outfit on the
  // bare arm — which is exactly what stops the arms reading as two tubes of skin.
  loft(
    a,
    [
      ring(0.3305 * s, 0.858, -0.002, 0.049, 0.053, 0.36),
      ring(0.328 * s, 0.878, -0.002, 0.0505, 0.0545, 0.36),
      ring(0.326 * s, 0.898, -0.002, 0.049, 0.053, 0.36),
    ],
    C.shirtLo,
    { capStart: true, capEnd: true }
  );
}

// --------------------------------------------------------------------------
// Hands — palm block plus four blocky fingers and a thumb. Angular two-segment
// digits, no smooth curls.
// --------------------------------------------------------------------------

const FINGERS = [
  { z: 0.044, y: 0.782, len: 0.070, spread: 0.010 },
  { z: 0.015, y: 0.780, len: 0.082, spread: 0.004 },
  { z: -0.014, y: 0.780, len: 0.078, spread: -0.004 },
  { z: -0.041, y: 0.784, len: 0.062, spread: -0.012 },
];

// The hand's own axis. It hangs at the sleeve's mouth with the palm facing the
// thigh, so the digits fan out fore-and-aft (Z) and close *inwards*, medially.
// That is what a fist rotates about: one Z hinge at each knuckle, another at the
// joint below it.
const HAND_X = 0.336;

// THE WRIST — where the forearm ends and the hand begins, in the rig's own absolute space. The
// hand (palm, digits and thumb) hangs off a `handL`/`handR` bone hinged HERE, so the hand can be
// broken at the wrist the way the elbow is broken at `armLower` (see `poseWrist`). At rest the
// bone is the identity, so the rig renders exactly the silhouette it always did.
//
// The joint sits a hair INSIDE the forearm's own tube (its last ring is at y 0.830): the palm's
// first ring then overlaps it, which is what keeps the seam shut when the arm's stretch channel
// draws the forearm long and pushes this joint down the (scaled) bone.
const WRIST_Y = 0.828;
const WRIST_Z = -0.002;

// Thumb: [y, z, rx, rz, dx], `dx` being the medial offset off the palm's face.
const THUMB = [
  [0.812, 0.050, 0.014, 0.014, -0.008],
  [0.784, 0.064, 0.012, 0.012, -0.013],
  [0.756, 0.076, 0.008, 0.008, -0.019],
];

// One digit's two straight segments, as three rings. The middle ring is shared
// by both segments, so the bend between them is a real joint.
function fingerRings(s, f) {
  const x = HAND_X * s;
  return [
    ring(x, f.y, f.z, 0.013, 0.0105, 0.30),
    ring(x, f.y - f.len * 0.52, f.z + f.spread * 0.5, 0.012, 0.0100, 0.30),
    ring(x, f.y - f.len, f.z + f.spread, 0.009, 0.0072, 0.30),
  ];
}

function thumbRings(s) {
  return THUMB.map((r) => ring(HAND_X * s + r[4] * s, r[0], r[1], r[2], r[3], 0.30));
}

// Palm, digits and thumb. The rig builds the digits and the thumb as separate
// hinged meshes instead (see `buildStreetCharacter`) and asks for the palm alone.
function hand(a, s, palmOnly = false) {
  const x = HAND_X * s;
  // Palm. The first ring is the WRIST CUFF: it lives inside the forearm's own tube (whose last
  // ring is at y 0.830, r 0.038/0.044) and never shows at rest — it is there so that the seam
  // stays closed when the arm's stretch channel draws the forearm long and the wrist joint
  // rides down inside it (see `WRIST_Y`).
  loft(a, [
    ring(x, 0.885, -0.002, 0.0365, 0.0415, 0.34),
    ring(x, 0.836, -0.002, 0.040, 0.054, 0.34),
    ring(x, 0.806, 0.000, 0.038, 0.060, 0.34),
    ring(x, 0.778, 0.002, 0.035, 0.062, 0.34),
  ], C.skin, { capStart: true, capEnd: true });
  if (palmOnly) return;

  // Fingers: two straight segments each, tapering and fanning slightly.
  for (const f of FINGERS) loft(a, fingerRings(s, f), C.skin, { capStart: true, capEnd: true });

  // Thumb, angled down and forward off the inner-front corner of the palm.
  loft(a, thumbRings(s), C.skin, { capStart: true, capEnd: true });
}

function neck(a) {
  loft(a, [
    ring(0, 1.290, 0.000, 0.082, 0.084, 0.42),
    ring(0, 1.380, 0.000, 0.078, 0.080, 0.42),
    ring(0, 1.446, 0.000, 0.074, 0.076, 0.42),
  ], (i) => (i === 0 ? C.skinLo : C.skin), { capEnd: true });
}

// --------------------------------------------------------------------------
// Head. No face at all — the sprite draws none, so this is a bare blocky skull
// (skin) with the hair mass sitting on top of it. The skull runs from the
// collar up, and its lower half stays exposed as bare skin down to the chin.
// --------------------------------------------------------------------------

const HEAD_SECS = [
  [1.400, 0.000, 0.078, 0.080],
  [1.452, 0.000, 0.086, 0.088],
  [1.484, 0.000, 0.114, 0.120],
  [1.524, 0.000, 0.132, 0.138],
  [1.566, 0.000, 0.141, 0.146],
  [1.606, 0.000, 0.142, 0.147],
  [1.646, 0.000, 0.135, 0.140],
  [1.684, 0.000, 0.116, 0.121],
  [1.714, 0.000, 0.086, 0.091],
  [1.732, 0.000, 0.040, 0.044],
];

// Skull cross-section at a given height, shared by the head mesh and by the
// hair, whose shell is an offset of this profile so no gap can open between the
// two. The sections are NOT evenly spaced in Y, so bracket by height — sampling
// by index instead overstates the radius near the crown and lets the skull poke
// through the hair.
function headAt(y) {
  const n = HEAD_SECS.length;
  const first = HEAD_SECS[0];
  if (y <= first[0]) return [first[2], first[3], first[1]];
  for (let i = 0; i < n - 1; i++) {
    const A = HEAD_SECS[i];
    const B = HEAD_SECS[i + 1];
    if (y <= B[0]) {
      const f = (y - A[0]) / (B[0] - A[0]);
      return [A[2] + (B[2] - A[2]) * f, A[3] + (B[3] - A[3]) * f, A[1] + (B[1] - A[1]) * f];
    }
  }
  const last = HEAD_SECS[n - 1];
  return [last[2], last[3], last[1]];
}

const HEAD_N = 10;

function head(a) {
  loft(
    a,
    HEAD_SECS.map((s) => ringN(HEAD_N, 0, s[0], s[1], s[2], s[3])),
    C.skin,
    { capStart: true, capEnd: true }
  );
}

// --------------------------------------------------------------------------
// Hair — a BLACK cap of chunky, faceted plates.
//
// This is the low-poly hairstyle the reference sheets the user supplied show,
// rebuilt: a hard faceted SHELL swept straight off `headAt` (so it is a faithful
// offset of the skull and can never dip inside it), carrying three rings of FAT,
// flat, sharply-pointed plates that lie against the dome and hang past the
// hairline, plus a handful of longer points, two lateral spikes per side, and a
// couple of little ahoge off the crown.
//
// Three rules keep it reading as HAIR instead of as a lump of black rock:
//
//   * every plate is WIDE and THIN (0.05 across, 0.024 off the dome) and its tip
//     narrows to a point, so the hem is a row of overlapping triangular blades —
//     which is the whole silhouette of the reference;
//   * every plate's colour RAMPS along its own length, and the ramps alternate
//     direction from one plate to the next (see `col` below). One flat colour per
//     plate is what made the old mass read as grey stubble: the eye needs the root
//     and the tip of each clump to disagree;
//   * the plates are ROOTED high and TIPPED low — they are combed down the dome,
//     not stuck into it — and each ring is phased against the one below so the
//     layers interleave the way layered hair does.
//
// The hairline rides high across the FRONT (~1.554, roughly eye level) so the
// bare faceless face shows below it, and sits low at the sides and nape. The
// deepest fringe point at the front centre reaches y 1.500, i.e. ~100 mm of face
// stays visible between it and the chin at 1.400. Verify that by measuring rather
// than by eye if this block is ever retuned — a small change here is very visible
// on the character's face.
// --------------------------------------------------------------------------

const SHELL_LIFT = 1.09;
// Height at which the shell stops following the hairline and starts using the
// skull's own section heights. Above this the hairline is always lower, so every
// angle can share the same ring heights — and that is what guarantees coverage.
const SHELL_CROWN = 1.684;
// Rings above the crown, as [y, rx, rz]. The first two sit exactly on the skull's
// own section heights (the only place the skull still has surface), and the last
// two taper the dome on to a near-point. The old version finished on a flat 42 mm
// disc, which faced straight up and therefore caught more light than anything else
// on the character — that bright disc was the "bald spot" you saw from above.
const SHELL_CROWN_Y = [
  [1.714, 0.086, 0.091],
  [1.732, 0.040, 0.044],
  [1.742, 0.026, 0.029],
  [1.749, 0.011, 0.013],
];
// The shell starts on the hairline itself; the plates hang past it, which is what
// gives the edge its strand-by-strand jagged outline.
const SHELL_EDGE = 0.000;

// Height of the hairline at a given angle — high at the front, low at the sides.
function hairlineY(th) {
  const front = Math.max(0, Math.sin(th));
  const back = Math.max(0, -Math.sin(th));
  const side = Math.abs(Math.cos(th));
  const i = Math.round((th / (Math.PI * 2)) * HEAD_N) % HEAD_N;
  const jag = (hash1(i * 17.13 + 4.3) - 0.5) * 2;
  return 1.438 + 0.116 * front + 0.034 * back + 0.004 * side + jag * 0.017 * front;
}

function hair(a) {
  // ---- the cap -----------------------------------------------------------
  // Below SHELL_CROWN the hairline moves with the angle, so the rings are split
  // by y-fraction between the hairline and the crown; above the crown the skull
  // flares out fast (0.116 -> 0.040 of radius over 48 mm), so up there every ring
  // sits exactly on one of the skull's own section heights. Either way the rings
  // read their radius off `headAt`, and neither half can cross the skull.
  //
  // Every ring is then jittered radially by a few percent. That is what turns the
  // dome from a smooth decagon into a heap of flat plates, and it is safe: the
  // smallest factor here (SHELL_LIFT * 0.957 = 1.043) still clears the skull.
  const STEPS = 12;
  const shellRings = [];
  for (let s = 0; s <= STEPS; s++) {
    const f = s / STEPS;
    const ring = [];
    for (let i = 0; i < HEAD_N; i++) {
      const th = (i / HEAD_N) * Math.PI * 2;
      const j = 1 + (hash1(i * 7.31 + s * 3.17) - 0.5) * 0.085;
      const y0 = hairlineY(th) - SHELL_EDGE;
      const y = y0 + (SHELL_CROWN - y0) * f;
      const hr = headAt(y);
      ring.push([Math.cos(th) * hr[0] * SHELL_LIFT * j, y, Math.sin(th) * hr[1] * SHELL_LIFT * j]);
    }
    shellRings.push(ring);
  }
  for (const [y, rx, rz] of SHELL_CROWN_Y) {
    const ring = [];
    for (let i = 0; i < HEAD_N; i++) {
      const th = (i / HEAD_N) * Math.PI * 2;
      const j = 1 + (hash1(i * 7.31 + 41.7) - 0.5) * 0.07;
      ring.push([Math.cos(th) * rx * SHELL_LIFT * j, y, Math.sin(th) * rz * SHELL_LIFT * j]);
    }
    shellRings.push(ring);
  }
  // The crown above the hairline's shoulder gets the lighter tone and the lowest
  // band the darkest: even at near-black, the cap has to have a top.
  loft(a, shellRings, (i) => (i < 3 ? C.hairLo : i < 11 ? C.hair : i < 13 ? C.hairHi : C.hair), { capEnd: true });

  // ---- the plate rings ---------------------------------------------------
  // `w` is a plate's width ACROSS the dome and `t` its thickness OFF the dome, so
  // a plate is a blade lying on the shell rather than a spike standing off it.
  // `edge` puts the whole lowest ring's tips on the hairline itself, so the hem
  // follows the head; the rings above hang to their own height instead but are
  // still clamped to the hairline, because a plate that went below it at the
  // front would cover the face.
  const plateRings = [
    { n: 14, bY: 1.600, tY: 1.552, ph: 0.00, w: 0.052, th: 0.026, tip: 0.014, edge: true },
    { n: 12, bY: 1.648, tY: 1.586, ph: 0.27, w: 0.048, th: 0.024, tip: 0.026 },
    { n: 9, bY: 1.690, tY: 1.626, ph: 0.61, w: 0.046, th: 0.022, tip: 0.022 },
  ];
  let k = 0;
  for (const st of plateRings) {
    for (let i = 0; i < st.n; i++) {
      const th = (i / st.n) * Math.PI * 2 + st.ph;
      const ct = Math.cos(th);
      const stn = Math.sin(th);
      const j1 = hash1(k * 3.11 + 1.7);
      const j2 = hash1(k * 5.77 + 3.3);
      const j3 = hash1(k * 8.19 + 6.1);
      const by = st.bY + (j1 - 0.5) * 0.024;
      const ty = st.edge
        ? hairlineY(th) - 0.008 - j3 * st.tip
        : Math.max(st.tY - j3 * st.tip, hairlineY(th) - 0.006);
      const br = headAt(by)[0] * SHELL_LIFT;
      const tr = headAt(ty)[0] * SHELL_LIFT + 0.006 + 0.007 * j2;
      // The root-to-tip ramp, direction alternating per plate (see the note at the
      // top of this block): a little over half the plates catch the light at the
      // tip and the rest at the root, so the mass never settles into one tone.
      const tipLit = j2 > 0.45;
      lock(a, {
        from: [ct * br, by, stn * br * 1.04],
        to: [ct * tr, ty, stn * tr * 1.04],
        up: [ct, 0.30, stn * 0.96],
        w0: st.w * (0.85 + 0.30 * j2),
        t0: st.th * (0.85 + 0.30 * j1),
        w1: 0.005,
        t1: 0.004,
        bend: 0.010 + 0.010 * j3,
        wob: (j2 - 0.5) * 0.014,
        wobPh: j3 * 6.28,
        sway: (j1 - 0.5) * 0.014,
        swayPh: j2 * 6.28,
        segs: 3,
        col: tipLit ? ramp(C.hair, C.hairHi, 3) : ramp(C.hairLo, C.hair, 3),
      });
      k++;
    }
  }

  // ---- the longer points ------------------------------------------------
  // Eight plates that hang well past the hem, spread across the FRONT half only —
  // the reference sheets show the fringe ending in a few deep points over the
  // brow while the nape stays cropped close. (They are also what would poke into
  // the collar if they were carried round the back.) They are the longest thing on
  // the head bar the ahoge, and they are what makes the hem read as STRANDS
  // rather than as a scalloped edge when the character is small on screen.
  const deepPoints = [0.26, 0.74, 1.18, 1.48, 1.72, 2.04, 2.46, 2.92];
  for (let i = 0; i < deepPoints.length; i++) {
    const th = deepPoints[i];
    const ct = Math.cos(th);
    const stn = Math.sin(th);
    const j = hash1(i * 5.53 + 2.9);
    const by = 1.592;
    const ty = hairlineY(th) - 0.036 - j * 0.028;
    const br = headAt(by)[0] * SHELL_LIFT;
    const tr = headAt(ty)[0] * SHELL_LIFT + 0.005;
    lock(a, {
      from: [ct * br, by, stn * br * 1.03],
      to: [ct * tr, ty, stn * tr * 1.03],
      up: [ct, 0.26, stn * 0.96],
      w0: 0.032,
      t0: 0.021,
      w1: 0.004,
      t1: 0.004,
      bend: 0.012,
      wob: (j - 0.5) * 0.012,
      wobPh: j * 6.28,
      segs: 3,
      col: ramp(C.hairLo, C.hairHi, 3),
    });
  }

  // ---- the lateral spikes ------------------------------------------------
  // Three per side, thrown outward and a little down off the temple. This is the
  // "two or three big triangular protrusions per side" of the reference, and it
  // is most of what breaks the black mass's outline up when the camera is behind
  // the character.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const th = s > 0 ? 0.12 + i * 0.34 : Math.PI - 0.12 - i * 0.34;
      const ct = Math.cos(th);
      const stn = Math.sin(th);
      const j = hash1(i * 6.77 + s * 3.31);
      const by = 1.650 - i * 0.042 + (j - 0.5) * 0.014;
      const ty = 1.542 - i * 0.036 - j * 0.016;
      const br = headAt(by)[0] * SHELL_LIFT;
      const tr = headAt(ty)[0] * SHELL_LIFT + 0.052 + i * 0.006 + j * 0.014;
      lock(a, {
        from: [ct * br, by, stn * br],
        to: [ct * tr, ty, stn * tr],
        up: [ct, 0.62, stn],
        w0: 0.040,
        t0: 0.024,
        w1: 0.004,
        t1: 0.004,
        bend: 0.010,
        wob: (j - 0.5) * 0.012,
        wobPh: j * 6.28,
        segs: 3,
        col: ramp(C.hairHi, C.hair, 3),
      });
    }
  }

  // ---- the crown sweep ---------------------------------------------------
  // Three long, FAT plates combed from the top of the dome down and round it.
  // They are deliberately few and wide, and every one turns the same way
  // (`spin`), so the crown reads as a couple of big sweeping planes with a clear
  // direction — a scatter of small tufts up here just looked like broken shards
  // from above. `apex` swaps the "flat blade on the side of the skull"
  // orientation for "flat sheet lying on top of the dome".
  for (let i = 0; i < 3; i++) {
    const th = (i / 3) * Math.PI * 2 + 0.42;
    const ct = Math.cos(th);
    const stn = Math.sin(th);
    const spin = th + 0.38;
    const ct2 = Math.cos(spin);
    const stn2 = Math.sin(spin);
    const j = hash1(i * 11.3 + 0.7);
    const by = 1.728;
    const ty = 1.660;
    const br = headAt(by)[0] * SHELL_LIFT * 1.01;
    const tr = headAt(ty)[0] * SHELL_LIFT + 0.016 * (0.7 + 0.6 * j);
    lock(a, {
      from: [ct * br, by, stn * br * 1.04],
      to: [ct2 * tr, ty, stn2 * tr * 1.04],
      up: [ct * 0.35, 1.0, stn * 0.35],
      w0: 0.062 * (0.88 + 0.24 * j),
      t0: 0.022,
      w1: 0.010,
      t1: 0.004,
      bend: 0.014,
      wob: 0.014 * (j - 0.5),
      wobPh: 1.4 + j * 3.1,
      sway: 0.004,
      swayPh: 2.3,
      segs: 4,
      col: ramp(C.hairHi, C.hairLo, 4),
    });
  }

  // ---- the ahoge ---------------------------------------------------------
  // The pair of small wedges standing off the crown that every low-poly hair
  // sheet has. They are the only part of the hairstyle above the shell, and
  // deliberately short: at five or six centimetres they read as cowlicks, any
  // longer and they read as antennae.
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    lock(a, {
      from: [0.022 * s, 1.740, -0.012],
      to: [0.056 * s, 1.806 - i * 0.016, -0.056],
      up: [0.34 * s, 0.86, -0.38],
      w0: 0.030,
      t0: 0.021,
      w1: 0.004,
      t1: 0.004,
      bend: 0.016,
      wob: 0.010 * s,
      wobPh: 1.4,
      segs: 3,
      col: ramp(C.hair, C.hairHi, 3),
    });
  }

  // ---- the bangs ---------------------------------------------------------
  // A short curtain of plates across the middle of the forehead, the middle one
  // hanging lowest so the fringe ends in a downward point rather than as a cut
  // line. They sit a layer in FRONT of the plate rings (larger radius) so the
  // brow reads as having hair over it when the camera is face-on.
  for (let i = 0; i < 5; i++) {
    const th = Math.PI * 0.5 + (i - 2) * 0.28;
    const ct = Math.cos(th);
    const stn = Math.sin(th);
    const j = hash1(i * 4.71 + 2.3);
    const j2 = hash1(i * 9.13 + 5.1);
    const centre = 1 - Math.abs(i - 2) / 2;
    const ty = 1.532 - centre * 0.032 - j * 0.010;
    lock(a, {
      from: [ct * 0.108, 1.694, stn * 0.112],
      to: [ct * 0.152, ty, stn * 0.156],
      up: [ct * 0.35, 0.30, stn],
      w0: 0.034 + 0.010 * centre,
      t0: 0.020,
      w1: 0.005,
      t1: 0.004,
      bend: 0.010 + 0.008 * j2,
      wob: (j2 - 0.5) * 0.012,
      wobPh: j * 6.28,
      sway: (j2 - 0.5) * 0.012,
      swayPh: j * 6.28,
      segs: 3,
      col: i === 2 ? ramp(C.hairLo, C.hairHi, 3) : ramp(C.hair, C.hairLo, 3),
    });
  }

  // ---- the sideburns -----------------------------------------------------
  // Three plates per side dropping in front of the ear and hugging the cheek to
  // jaw level, which is what closes the gap between the hair mass and the bare
  // face in profile.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const th = (i - 1) * 0.40;
      const j = hash1(i * 6.31 + s * 2.7);
      const j2 = hash1(i * 12.9 + s * 4.1);
      const ty = 1.424 - j * 0.014;
      const tr = headAt(ty)[0] * SHELL_LIFT + 0.008;
      lock(a, {
        from: [s * 0.140, 1.548, Math.sin(th) * 0.108],
        to: [s * tr, ty, Math.sin(th) * tr],
        up: [s, 0.18, Math.sin(th) * 0.7],
        w0: 0.030 + 0.010 * j,
        t0: 0.020,
        w1: 0.006,
        t1: 0.005,
        bend: 0.010 + 0.010 * j2,
        wob: (j2 - 0.5) * 0.014,
        wobPh: j * 6.28,
        segs: 3,
        col: ramp(C.hair, i === 1 ? C.hairHi : C.hairLo, 3),
      });
    }
  }
}

function toGeometry(a) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(a.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(a.nrm, 3));
  g.setAttribute("aColor", new THREE.Float32BufferAttribute(a.col, 3));
  // Plain arrays, not a GPU attribute: nothing reads it but `repaintWardrobe`.
  g.userData.pal = new Float32Array(a.pal);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// --------------------------------------------------------------------------
// Rig assembly.
//
// The model is a hierarchy of rigid parts hinged at the joints above. Every part
// is authored in the same absolute space as the old flat-merged mesh and then
// translated so the joint it hangs from sits at its local origin — so with every
// bone at rest the character renders exactly as it did before, and `fitGroup`
// measures the silhouette it always measured.
//
// hips          waistband; carries the whole body's vertical placement
//   torso       tee, collar, print, shoulder fillers (leans forward when running)
//     neck      the cervical joint — takes a share of every head rotation (see `poseNeckSplit`)
//       head    skull + hair
//     armUpperL/R   sleeve + upper arm + elbow filler
//       armLowerL/R forearm + hand
//   legUpperL/R  pant leg, hip to knee + knee filler
//     legLowerL/R pant leg, knee to ankle
//       footL/R     sneaker
// --------------------------------------------------------------------------

// Build the character. `size` ({ height, footY }) is how big to draw it — the caller (the
// player) derives it from the collision box; omit it for the authored default size.
//
// One material for every part of every build. It is CACHED because `loadCharacter` rebuilds
// the whole rig whenever the look is swapped, and a fresh ShaderMaterial per build would mean
// a fresh set of uniform uploads for no reason — and because the neon parameters below are a
// character-wide decision, not a per-part one.
let charMaterial = null;
export function characterMaterial() {
  if (!charMaterial) {
    charMaterial = createMaterial({
      minLight: 0.30,
      side: THREE.DoubleSide,
      // The three parts of the neon look, all of them opt-in in `createMaterial` so the world
      // keeps the plain PS1 ramp: hard diffuse steps, a self-lit term so the dark side of the
      // body still carries its own colour, and a Fresnel rim in that colour so the silhouette
      // catches light. No `map`.
      //
      // `minLight` is higher than the world's usual 0.30 on purpose: the character's bare
      // FACE is its one recognisably human feature and it sits in the darkest band of the
      // ramp (the head's front facets point away from the light), so at 0.30 the face came out
      // at roughly #4c3f44 — a shadowed void with no skin in it at all. Measured, not guessed:
      // see the face-tone note in src/README.md.
      cel: 1,
      celBands: 3,
      minLight: 0.36,
      emissive: 0.17,
      rim: 0.60,
      rimPow: 2.3,
    });
  }
  return charMaterial;
}

// --------------------------------------------------------------------------
// NAKED — the body under the outfit.
//
// The enemy wears this (the user's "make it a naked version of the player ... a version with no
// cloth and hair but make its entire skin whiteish grey"). It is the same RIG — same bones,
// same hinges, same pose library, same `fitGroup` — built out of bare anatomy instead of
// garments: the tee's own volume minus the shirt's ease is the torso (with a real waist, because
// a shirt hangs straight and a body does not), the pant tube minus its flare and creases is the
// leg, the sneaker is replaced by a bare foot, and the skull is built without the hair.
//
// Every naked silhouette is therefore a slightly shrunken copy of the clothed one, standing at
// the same height. That is the property that matters: the two bodies read as the same person,
// and a pose tuned on one is correct on the other.
//
// Colour: the whole body is built from the `skin`/`skinLo` pair only, so the wardrobe has exactly
// ONE handle on it (`ENEMY_PAINT` in enemies.js is what turns it the user's whitish grey), and
// there are no cloth vertex colours on the rig to collide with the player's own outfit.
// --------------------------------------------------------------------------

// The torso, tee off: the tee's rings with the shirt's ease taken out, pinched at the waist.
//          [y,     rx,    rz]
const NAKED_TORSO = [
  [0.930, 0.133, 0.103],
  [0.985, 0.127, 0.098],
  [1.070, 0.132, 0.101],
  [1.180, 0.140, 0.104],
  [1.300, 0.146, 0.106],
  [1.395, 0.152, 0.108],
  [1.432, 0.155, 0.109],
  [1.452, 0.132, 0.095],
];

function nakedTorso(a) {
  loft(
    a,
    NAKED_TORSO.map((r) => ring(0, r[0], 0.000, r[1], r[2], 0.44)),
    (i) => mixc(C.skinLo, C.skin, 0.25 + (i / 6) * 0.75),
    { capStart: true, capEnd: true }
  );
}

// The waist, trousers off: the two top rings of the pant tube, pulled in to the body's own
// width and split per side exactly like the pants are. The legs run up past it, so this only
// ever shows as the crotch.
//        [y,     rx,    rz]
const NAKED_HIPS = [
  [1.012, 0.118, 0.126],
  [1.048, 0.115, 0.122],
];

function nakedHips(a) {
  for (const s of [-1, 1]) {
    loft(a, NAKED_HIPS.map((r) => ring(0.086 * s, r[0], 0.004, r[1], r[2], 0.40)), C.skinLo, { capEnd: true });
  }
}

// The leg, trousers off: the same centreline as `LEG_TUBE` — so the knee lands on the knee
// joint and the ankle lands inside the bare foot below — with the trouser flare and the creases
// gone. Row 4 is the colour ramp position, matching `LEG_TUBE`'s, so the two builds ramp
// identically and `LEG_KNEE_ROW` cuts both at the same place.
//        [y,     x,      rx,    rz,   ramp]
const NAKED_LEG = [
  [0.225, 0.196, 0.048, 0.052, 0],     // the ankle, inside the foot's own collar — and a real
  [0.290, 0.191, 0.056, 0.062, 1],     // ankle is the NARROWEST part of a leg, which is what lets
                                       // the bare foot be a foot instead of a bootie: the old
                                       // 0.120 x 0.132 joint forced a collar wider than the ball of
                                       // the foot, so the whole thing read as a swollen sock
                                       // (the user's *"fix the dummy feet they look weird"*)
  [0.500, 0.166, 0.070, 0.076, 2],
  [KNEE_Y, 0.1556, 0.078, 0.082, 2.4], // the knee joint itself
  [0.650, 0.140, 0.086, 0.092, 3],
  [0.820, 0.096, 0.104, 0.116, 4],     // the thigh
  [0.960, 0.089, 0.112, 0.124, 5],
  [1.030, 0.086, 0.114, 0.128, 6],     // ...into the hip
];

// A bare foot: the sneaker's footprint and toe-out angle with the shoe taken off — a heel, an
// instep, four toes, and a short ankle collar that swallows the leg's bottom ring so the two can
// never part when the ankle hinges.
//
// Two things about the footprint are the RIG's, not a guess. `SOLE_HEEL` (-0.128) and `SOLE_TOE`
// (+0.176), both measured FROM THE ANKLE PIVOT, are what `poseRun` plants — so a bare foot has to
// reach exactly as far back and as far forward as the sneaker's sole or the IK plants a footprint
// the mesh does not have. It did not before: the old bare foot was a 0.20-long paddle against the
// shoe's 0.30, and the shoe's own outline is [-0.118, +0.178] off the same joint. A foot 3/4 the
// length of the shoe that fits it is a foot nobody has, which is most of why it read as a stub.
//
// The other half was the HEEL. The old rings walked their centres BACK as they climbed, which
// held the back edge out at -0.136 while the section shrank — a ball of heel bulging 0.044 past
// the sole at mid-height. Here the back edge starts on the sole's own -0.118, comes a hair proud
// at the heel pad and then only ever travels FORWARD, into the ankle column: which is the shape a
// foot actually has, because the achilles sits ahead of the heel.
function bareFoot(a, s) {
  const x = 0.205 * s;
  const xa = 0.198 * s;   // the ankle column sits on the LEG's own centreline, not the foot's: the
                          // leg's bottom ring is at 0.196, and the collar has to clear its INBOARD
                          // side as the ankle hinges (the old collar had 1 mm of margin there)
  const ang = 0.11 * s;
  const cz = 0.010;       // the joint's own z (ANKLE_Z) — the rotation centre for the toe-out, and
                          // the datum the rig's sole offsets are measured from
  const place = (pts) => rotY(pts, x, cz, ang);
  const put = (secs, col, opts) => loft(a, secs.map(place), col, opts);

  // The foot's silhouette, bottom-to-top, as `[y, zBack, zFront, rx, centreX]` — the back and front
  // edges are authored directly rather than as a centre plus a half-depth, so the profile can be
  // READ next to the shape it draws. The sole plate stops at +0.130 and the toes take it out to the
  // rig's own +0.178, so the footprint is exact at the toe end where `poseRun` plants.
  const PROFILE = [
    [0.000, -0.118, 0.130, 0.056, x],    // the sole plate
    [0.024, -0.122, 0.126, 0.061, x],    // the heel pad, and the ball at its widest
    [0.052, -0.120, 0.118, 0.062, x],
    [0.090, -0.112, 0.104, 0.061, x],    // the arch: the back edge starts walking forward here
    [0.130, -0.100, 0.082, 0.059, x],
    [0.170, -0.088, 0.064, 0.057, x],
    // The collar proper. It does NOT flare: its job is to keep clear of the leg's own ring while
    // the ankle swings, and the ankle only swings about X — so it is the leg's own width plus a few
    // millimetres, and the extra room is all in Z (0.027 above the joint, a 30° hinge carries the
    // collar 0.014 forward). A collar that flares instead is a lip, and a lip here is a sock cuff:
    // the first build of this had 13 mm of step per side and read as a bootie.
    [0.208, -0.078, 0.066, 0.056, xa],
    [0.234, -0.070, 0.072, 0.056, xa],
    [0.252, -0.066, 0.076, 0.057, xa],
  ];
  put(
    PROFILE.map(([y, zb, zf, rx, cx]) => ring(cx, y, (zb + zf) / 2, rx, (zf - zb) / 2, 0.46)),
    ramp(C.skinLo, C.skin, 8),
    { capStart: true, capEnd: true }
  );

  // Toes: four blunt pads that TOUCH each other across the front — inboard the big one, outboard the
  // little one, short. They are what tells you which way a bare foot points from the chase camera;
  // four rather than three keeps it from reading as a hoof, and four that touch keeps it from
  // reading as a claw (the old four were 25 mm pegs with gaps between them). `[offsetX, halfWidth,
  // zBack, zFront]`, all inside the sole's own 112 mm of width.
  const TOES = [
    [-0.040, 0.016, 0.118, 0.178],
    [-0.010, 0.0155, 0.122, 0.176],
    [0.017, 0.014, 0.118, 0.170],
    [0.041, 0.012, 0.114, 0.158],
  ];
  for (const [off, hw, zb, zf] of TOES) {
    const tx = x + off * s;
    put(
      [
        ring(tx, 0.003, (zb + zf) / 2, hw, (zf - zb) / 2, 0.55),
        ring(tx, 0.026, (zb + zf) / 2 - 0.005, hw * 0.86, ((zf - zb) / 2) * 0.86, 0.55),
      ],
      ramp(C.skinLo, C.skin, 3),
      { capStart: true, capEnd: true }
    );
  }
}

// The skull, hair off — plus the same two crown rings the hair's shell finishes on, so a bald
// head is a dome instead of the flat 40 mm disc the bare `HEAD_SECS` loft ends on.
function nakedHead(a) {
  const secs = HEAD_SECS.concat([
    [1.742, 0.000, 0.026, 0.029],
    [1.749, 0.000, 0.011, 0.013],
  ]);
  loft(a, secs.map((s) => ringN(HEAD_N, 0, s[0], s[1], s[2], s[3])), C.skin, { capStart: true, capEnd: true });
}

export function buildStreetCharacter(size = null, opts = null) {
  const naked = !!(opts && opts.naked);
  const mat = characterMaterial();
  const bones = {};
  const root = new THREE.Group();

  const hinge = (name, parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    bones[name] = g;
    return g;
  };
  // `outline` is how wide the ink hull around this part is, as a SHARE of the body's line
  // (`attachOutline`'s third argument): 1 for the body, `settings.outlineDigitScale` for the
  // digits — a finger is about a pixel wide at the baseline buffer, so it wants a much thinner
  // line than the torso (at the body's width the hull would swallow it whole) — and 0 for none.
  //
  // `renderOrder` 4 puts every body part AFTER the ink shells (3), so the body paints over
  // the ink that falls inside the silhouette (see `attachOutline` in ps1.js).
  const shell = (acc, parent, px, py, pz, outline = 1) => {
    const geo = toGeometry(acc);
    geo.translate(-px, -py, -pz);
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 4;
    parent.add(m);
    if (outline > 0) attachOutline(m, geo, outline);
    return m;
  };

  const gHips = hinge("hips", root, 0, HIP_Y, 0);
  const gTorso = hinge("torso", gHips, 0, 0, 0);
  // ...and the HEAD hangs off the NECK, not off the chest (see `NECK_BASE_Y`): `neck` takes its own
  // share of every head rotation on the way down (see `poseNeckSplit`), which is the whole of what
  // the joint is for. Both pivots are in the same absolute space every other joint is authored in,
  // so each bone's own local offset is the difference between them.
  const gNeck = hinge("neck", gTorso, 0, NECK_BASE_Y - HIP_Y, 0);
  const gHead = hinge("head", gNeck, 0, NECK_Y - NECK_BASE_Y, 0);

  // Every hinged digit in both hands, for `poseRun` to curl.
  const digits = [];

  const pelvis = makeAcc();
  if (naked) {
    nakedHips(pelvis);
  } else {
    for (const s of [-1, 1]) {
      loft(pelvis, [
        ring(0.086 * s, 1.010, 0.004, 0.126, 0.140, 0.40),
        ring(0.084 * s, 1.048, 0.004, 0.122, 0.136, 0.40),
      ], C.pantsLo, { capEnd: true });
    }
  }
  bones.pelvisMesh = shell(pelvis, gHips, 0, HIP_Y, 0);

  const chest = makeAcc();
  if (naked) nakedTorso(chest); else torso(chest);
  // Shoulder fillers: buried in the sleeve at rest, they plug the joint as the
  // arm swings so a raised sleeve can never open a hole onto the torso.
  for (const s of [-1, 1]) {
    ballAt(chest, SHOULDER_X * s, SHOULDER_Y, SHOULDER_Z, 0.085, 0.085, 0.085, naked ? C.skin : C.shirt);
  }
  // The neck funnel rides with the NECK BONE — the joint between the chest and the head (session
  // 155; see `NECK_BASE_Y` and `poseNeckSplit`). It used to be welded to the CHEST, and the note
  // that welded it there was right for the rig it was written on: with the head hinging directly on
  // the chest, the only other thing the funnel could have hung off was the HEAD, and the run tips
  // the head back ~0.62 rad relative to the leaning chest, which swung the funnel's bottom ring
  // 0.087 forward and straight out through the front of the shirt — a skin block under the collar on
  // every frame of a sprint. The neck joint does not have that problem, because it pivots at the
  // funnel's own BASE: the bottom ring (1.290 against a pivot at 1.330) moves by `0.04·sin(0.34·θ)`
  // — **0.008 rig** at a run's own tip, which is a fifth of a millimetre on screen — while the top
  // of the funnel follows the jaw properly. So the hem stays buried in the shirt it is inside and
  // the funnel BENDS at the collar, which is the whole difference between a neck and a rigid plug.
  const nkAcc = makeAcc();
  neck(nkAcc);
  shell(nkAcc, gNeck, 0, NECK_BASE_Y, 0);
  shell(chest, gTorso, 0, HIP_Y, 0);

  const skull = makeAcc();
  if (naked) nakedHead(skull);
  else {
    head(skull);
    hair(skull);
  }
  shell(skull, gHead, 0, NECK_Y, 0);

  for (const s of [-1, 1]) {
    const armU = hinge(s < 0 ? "armUpperL" : "armUpperR", gTorso, SHOULDER_X * s, SHOULDER_Y - HIP_Y, SHOULDER_Z);
    const armF = hinge(s < 0 ? "armLowerL" : "armLowerR", armU, (ELBOW_X - SHOULDER_X) * s, ELBOW_Y - SHOULDER_Y, ELBOW_Z - SHOULDER_Z);
    const up = makeAcc();
    // No sleeve on a naked body, so the shoulder carries its own cap instead: a deltoid ball in
    // the ARM's accumulator, which swings with the arm and so keeps the joint covered when the
    // arm comes up. (The clothed rig gets the same coverage from the sleeve's shoulder wrap.)
    if (naked) ballAt(up, SHOULDER_X * s, SHOULDER_Y - 0.030, SHOULDER_Z, 0.086, 0.106, 0.086, C.skin);
    else sleeve(up, s);
    armUpper(up, s);
    ballAt(up, ELBOW_X * s, ELBOW_Y, ELBOW_Z, 0.050, 0.050, 0.050, C.skin);
    shell(up, armU, SHOULDER_X * s, SHOULDER_Y, SHOULDER_Z);
    const lo = makeAcc();
    armLower(lo, s, naked);
    shell(lo, armF, ELBOW_X * s, ELBOW_Y, ELBOW_Z);
    // THE HAND, on the wrist bone instead of welded to the forearm (see `WRIST_Y` and
    // `poseWrist`). Everything below hangs off `handB`: the palm is baked about the WRIST, and
    // the digits and the thumb are re-parented onto it at the same absolute origins they had on
    // the forearm, so with the wrist at rest the rig is bit-for-bit what it was.
    const handB = hinge(s < 0 ? "handL" : "handR", armF, (HAND_X - ELBOW_X) * s, WRIST_Y - ELBOW_Y, WRIST_Z - ELBOW_Z);
    const palm = makeAcc();
    hand(palm, s, true);
    shell(palm, handB, HAND_X * s, WRIST_Y, WRIST_Z);

    // The digits and the thumb are hinged instead of fused, so the hand can
    // close into a fist while the character runs. Each digit hangs off a knuckle
    // group with a second group at its middle joint; the knuckle ball fills the
    // wedge that opens on the outside of the bend, exactly like the elbow's.
    for (const f of FINGERS) {
      const knuckle = new THREE.Group();
      knuckle.position.set(0, f.y - WRIST_Y, f.z - WRIST_Z);
      handB.add(knuckle);
      const midY = f.y - f.len * 0.52;
      const midZ = f.z + f.spread * 0.5;
      const mid = new THREE.Group();
      mid.position.set(0, midY - f.y, midZ - f.z);
      knuckle.add(mid);
      const rings = fingerRings(s, f);
      const prox = makeAcc();
      loft(prox, [rings[0], rings[1]], C.skin, { capStart: true, capEnd: true });
      ballAt(prox, HAND_X * s, midY, midZ, 0.0125, 0.0105, 0.0118, C.skin);
      shell(prox, knuckle, HAND_X * s, f.y, f.z, settings.outlineDigitScale);
      const dist = makeAcc();
      loft(dist, [rings[1], rings[2]], C.skin, { capStart: true, capEnd: true });
      shell(dist, mid, HAND_X * s, midY, midZ, settings.outlineDigitScale);
      digits.push({ side: s, knuckle, mid });
    }
    const thumb = new THREE.Group();
    thumb.position.set(0, THUMB[0][0] - WRIST_Y, THUMB[0][1] - WRIST_Z);
    handB.add(thumb);
    const thb = makeAcc();
    loft(thb, thumbRings(s), C.skin, { capStart: true, capEnd: true });
    shell(thb, thumb, HAND_X * s, THUMB[0][0], THUMB[0][1], settings.outlineDigitScale);
    digits.push({ side: s, knuckle: thumb, mid: null, thumb: true });

    const legU = hinge(s < 0 ? "legUpperL" : "legUpperR", gHips, 0, 0, 0);
    const legL = hinge(s < 0 ? "legLowerL" : "legLowerR", legU, 0, KNEE_Y - HIP_Y, 0.004);
    const foot = hinge(s < 0 ? "footL" : "footR", legL, ANKLE_X * s, ANKLE_Y - KNEE_Y, ANKLE_Z - 0.004);
    const thigh = makeAcc();
    legUpper(thigh, s, naked);
    legKnee(thigh, s, naked);
    shell(thigh, legU, 0, HIP_Y, 0);
    const shin = makeAcc();
    legLower(shin, s, naked);
    shell(shin, legL, 0, KNEE_Y, 0.004);
    const sneaker = makeAcc();
    if (naked) bareFoot(sneaker, s); else shoe(sneaker, s);
    shell(sneaker, foot, ANKLE_X * s, ANKLE_Y, ANKLE_Z);
  }

  const group = new THREE.Group();
  group.add(root);
  // Size the BODY (feet to the top of the skull) to CHAR_HEIGHT and stand it on
  // the player's ground line. The hair reaches a little higher than the body
  // measure, and letting it into the measurement would shrink the whole
  // character every time the hair got taller.
  const bodyTop = HEAD_SECS[HEAD_SECS.length - 1][0];
  fitGroup(group, {
    height: size && size.height ? size.height : CHAR_HEIGHT,
    footY: size && size.footY !== undefined ? size.footY : CHAR_FOOT_Y,
    top: bodyTop,
  });
  group.userData.bones = bones;
  bones.digits = digits;
  // --------------------------------------------------------------------------
  // SQUASH AND STRETCH — the LIMB channel (see `poseStretch` / `poseStretchApply`).
  //
  // A limb drawn LONGER than it is for the few frames a move is throwing it out: the oldest
  // trick in animation, and the one that turns an extension from a joint being carried from A
  // to B into a WHIP. The arm that punches, the legs that snap out of the launch — the frames
  // where the limb is at its most extended are the frames it should be at its longest.
  //
  // It is built out of the two halves of a bone that are separable on this rig, and
  // deliberately NOT out of `bone.scale`:
  //
  //   * a bone's MESH is baked in the bone's own frame about its JOINT (`shell()` above), so
  //     scaling that mesh stretches the limb away from the joint — in the bone's own length
  //     axis only, so the tube's cross-section is untouched and there is no squash across it;
  //   * the bone's own child JOINTS are pushed out by the same factor (`kid.o.position.y *
  //     s`), which is what keeps the chain connected: the knee rides down the thigh exactly as
  //     far as the thigh's own mesh now reaches.
  //
  // A non-uniform `scale` on the bone itself would do both of those in one line — and would
  // SHEAR every child under it the moment that child is rotated (a rotated child under a
  // non-uniformly scaled parent is a shear by definition), which is the whole reason the
  // mesh+joint form is the one that stays rigid.
  //
  // The rule that falls out of it: a chain a pose is SOLVING this frame must not be stretched
  // this frame. `poseLegIK` and `poseArmReach` answer with angles for the REST lengths, so a
  // stretched leg under a solved foot would put the sole through the deck. Contacts and
  // stretches hold the same chain only at DIFFERENT times in a move.
  //
  // Only the four limbs are in the table. The trunk and the head are left out on purpose: the
  // arm solve measures the shoulder as `SHOULDER_Y - HIP_Y` in the TORSO's frame (see
  // `poseArmReach`), so a stretched torso would move the shoulder on screen without moving it
  // in the solve, and the hands would miss their contacts.
  const stretch = {};
  const addStretch = (name, kids) => {
    const b = bones[name];
    if (!b) return;
    let mesh = null;
    for (const c of b.children) if (c.isMesh && !c.userData.isOutline) { mesh = c; break; }
    if (!mesh) return;
    const rec = { mesh, kids: [], s: 1, want: 1 };
    for (const k of kids) if (k) rec.kids.push({ o: k, y: k.position.y });
    stretch[name] = rec;
  };
  addStretch("legUpperL", [bones.legLowerL]);
  addStretch("legUpperR", [bones.legLowerR]);
  addStretch("legLowerL", [bones.footL]);
  addStretch("legLowerR", [bones.footR]);
  addStretch("armUpperL", [bones.armLowerL]);
  addStretch("armUpperR", [bones.armLowerR]);
  addStretch("armLowerL", [bones.handL]);
  addStretch("armLowerR", [bones.handR]);
  bones.stretch = stretch;
  bones.stretchNames = Object.keys(stretch);
  // Live-editable copies of the pose constants, so the poses can be swept against real
  // measurements in the running page (see the pose-tuning notes in src/README.md) instead
  // of by reloading a rebuilt rig for every candidate number. Same objects the functions
  // read, so writing to them retunes the pose on the very next call.
  group.userData.poseCfg = { SLIDE, DIVE, IDLE, CROUCH, SLAM, LAUNCH, AIR_LEG, AIR_ARM, WALL_SLIDE, WALL_HAND, CLIMB, CLIMB_PARK, CLIMB_COIL, CLIMB_BONES, CLIMB_TABLE: climbTable, KICK_VARIANTS, HANG, VAULT, FALL, FALL_KINDS, FALL_BRACE, CLASH_STANCE, CLASH_FIST, MACACO_TURN_KEYS, MACACO_LIFT_KEYS, CLINCH, CLINCHED, CLINCH_BEAT, CLINCH_HAND, WHIRL, SCISSOR, CAPO, DASH, BOXCUT, REST, FALLEN, DOWNED, DRAG_SHAPE, SKIM_SHAPE, HOIST_SHAPE, COIL_SHAPE, POLE: POLE_CFG, BLOCK, LUNGE, TOTE, TOTE_THROW, TOTE_SLAM, BOARD, BOARD_TRICKS, BALL: { THROW_SECONDS, THROW_RELEASE, SLAM_SECONDS: BALL_SLAM_SECONDS, SLAM_RELEASE: BALL_SLAM_RELEASE, SHOOT }, POSEX: () => POSEX };
  group.userData.poseRun = (phase, blend, speedFrac, fwd, lat, bank, chargeArm) => poseRun(bones, phase, blend, speedFrac, fwd, lat, bank, chargeArm);
  group.userData.poseKick = (u, side, variant) => poseKick(bones, u, side, variant);
  // The kick's own metadata, for `player.js`: how many shapes there are to pick from, the
  // turn a given one asks for, and its name (the HUD says which one just landed).
  group.userData.kickVariantCount = KICK_VARIANTS.length;
  group.userData.kickSpinTurns = (variant) => kickVariantAt(variant).spin;
  group.userData.kickVariantName = (variant) => kickVariantAt(variant).name;
  group.userData.poseSlide = (u, phase, move) => poseSlide(bones, u, phase, move);
  group.userData.poseIdle = (u, t, ground) => poseIdle(bones, u, t, ground);
  group.userData.poseCrouch = (u, walk, phase, t) => poseCrouch(bones, u, walk, phase, t);
  // THE SKATEBOARD (session 200 — see the block above). The board's three shapes, and each of these
  // arrows is a pose's WHOLE SIGNATURE: an argument left off one is silently dropped and the pose
  // falls back on its own default, so all of them are forwarded. `kind` is `-1` for no trick.
  group.userData.poseRide = (u, t, carve, manual, push, kind, ph, miss, air, tuck, chg) =>
    poseRide(bones, u, t, carve, manual, push, kind, ph, miss, air, tuck, chg);
  group.userData.poseBSlide = (u, t, ang, spd, carve) => poseBSlide(bones, u, t, ang, spd, carve);
  group.userData.poseBBomb = (u, t, spd) => poseBBomb(bones, u, t, spd);
  // ...and the flips' own metadata, exactly the way the kick and the fall families publish theirs:
  // how many rows there are, how many of them the M1 cycle holds (the OLLIE is row 0 and is the jump
  // key's), and what a given row IS — the spin it owes the deck, its clock and its pop. The caller
  // reads the spin off the rig rather than carrying its own copy, so the deck that is DRAWN and the
  // airtime the physics buys are one decision (see `startTrick`).
  group.userData.boardTrickCount = BOARD_TRICKS.length;
  group.userData.boardFlipCount = BOARD_FLIPS;
  group.userData.boardTrick = (i) => boardTrickAt(i);
  group.userData.boardAirTrick = (i) => boardAirTrickAt(i);
  group.userData.boardAirCount = BOARD_AIR_COUNT;
  group.userData.boardTrickName = (i) => boardTrickAt(i).name;
  // THE BLOCK (M1 + M2 — see `block` / `startBlock` in player.js, and `poseBlock` above). One pose
  // with both of its shapes in it: `rush` is the guard→charge blend, `hit` the absorb jolt, `walk`
  // how much of the shuffle is on, `phase` where in it the legs are — and the last TWO are the pair
  // of blends that pick the block's arms and its body (`moving` = the SPEED band, so a walk keeps
  // the boxer's two-armed guard; `bodyRun` = the run cycle's own blend, which is what stands the
  // block's body channel down — see the arms note in `poseBlock` and session 195 in SPEC.md).
  // Both MUST be forwarded: this arrow is the pose's whole signature, so an argument left off it is
  // silently dropped and `poseBlock` falls back to its own default.
  group.userData.poseBlock = (u, rush, hit, phase, walk, t, moving, bodyRun) => poseBlock(bones, u, rush, hit, phase, walk, t, moving, bodyRun);
  group.userData.poseAir = (u, rise, variant) => poseAir(bones, u, rise, variant);
  group.userData.poseDive = (u, phase, move) => poseDive(bones, u, phase, move);
  group.userData.poseSlam = (u) => poseSlam(bones, u);
  group.userData.poseFall = (u, kind, brace, t, move) => poseFall(bones, u, kind, brace, t, move);
  // The fall family's own metadata, for `player.js`: the shapes, their names (the HUD says
  // which one is playing) and the body pitch each one is held at.
  group.userData.fallKinds = Object.keys(FALL_KINDS);
  group.userData.fallKindName = (kind) => fallKindAt(kind).name;
  group.userData.fallLean = (kind, spd, brace) => fallLean(kind, spd, brace);
  group.userData.poseTuck = (u, tight) => poseTuck(bones, u, tight);
  group.userData.poseMantle = (u, k) => poseMantle(bones, u, k);
  // ...and the pull-up out of a LEDGE GRAB (see `poseLedgePull`): the same seam `poseMantle`
  // covers, but with the palms solved onto the lip the hang was holding rather than authored.
  group.userData.poseLedgePull = (u, k) => poseLedgePull(bones, u, k);
  // ...its grip's own contact weight for this frame (see `ledgePullPin`).
  group.userData.ledgePullPin = (k) => ledgePullPin(k);
  // ...and the SHARED grip itself, spent once after every layer has had its say (see
  // `poseLedgeGrip`): both the hang and the pull-up hold this one point.
  group.userData.poseLedgeGrip = (w, gx, gy, gz) => poseLedgeGrip(bones, w, gx, gy, gz, HANG.half);
  group.userData.poseVault = (u, k, side, kind, flip) => poseVault(bones, u, k, side, kind, flip);
  group.userData.vaultTurn = (kind, k, side) => vaultTurn(kind, k, side);
  group.userData.poseLaunch = (u, rise) => poseLaunch(bones, u, rise);
  group.userData.poseHang = (u, t, age) => poseHang(bones, u, t, age);
  // The hand's own point in the arm bone's frame, so the running page can ask where the
  // hand actually ended up (`bones.armLowerL.localToWorld(handLocal.L)`). The hang pose's
  // grip height and press (player.js `LEDGE_GRIP` / `LEDGE_HUG`) are read back off it —
  // the same measure-then-pin bargain the wall slide's solved contacts make.
  group.userData.handLocal = {
    L: new THREE.Vector3(-(HAND_X - ELBOW_X), HAND_MID_Y - ELBOW_Y, HAND_MID_Z - ELBOW_Z),
    R: new THREE.Vector3(HAND_X - ELBOW_X, HAND_MID_Y - ELBOW_Y, HAND_MID_Z - ELBOW_Z),
  };
  // ...and the same point in the WRIST bone's frame (see `WRIST_Y`). The hand hangs off its own
  // bone now, so a pose that breaks the wrist moves the palm off the point `handLocal` names —
  // measuring from here instead is what makes "where is his hand" right on those frames, and it
  // is identical to the number above on every frame the wrist is at rest.
  group.userData.handLocalW = {
    L: new THREE.Vector3(0, HAND_MID_Y - WRIST_Y, HAND_MID_Z - WRIST_Z),
    R: new THREE.Vector3(0, HAND_MID_Y - WRIST_Y, HAND_MID_Z - WRIST_Z),
  };
  // The clinch's live target (see `CLINCH_HEAD`): while the 2nd M1 is out, `player.js` writes the
  // head bone of the body it is holding into these, in the player's own frame, and clears it on
  // every frame the move is not up. The two hands are SOLVED onto that point, so the grab follows
  // the head for as long as the haul is still dragging it in.
  group.userData.setClinchHead = (x, y, z) => { CLINCH_HEAD.set(x, y, z); clinchHeadOk = true; };
  group.userData.clearClinchHead = () => { clinchHeadOk = false; };
  // ...and THE WALL CLINCH's own live target (see `WALLBEAT_HEAD` and "THE WALL CLINCH" in
  // README.md) — the same arrangement as the clinch's, because it is the same idea one verb over:
  // the player has the body's skull in both hands and pressed into a wall face, so the two hands
  // are SOLVED onto the head bone `player.js` writes here every frame. The pose is handed the
  // move's own phase and beat clock alongside it, so the shape and the physics cannot read
  // different moments of the move.
  group.userData.setWallBeatHead = (x, y, z) => { WALLBEAT_HEAD.set(x, y, z); wallBeatHeadOk = true; };
  group.userData.clearWallBeatHead = () => { wallBeatHeadOk = false; };
  // ...and the face's own normal, so the hands can be closed on the SKULL's sides rather than on
  // the world's x/z (see `WALLBEAT_NX` and the solve in `poseWallBeat`).
  group.userData.setWallBeatWall = (nx, nz) => { WALLBEAT_NX = nx; WALLBEAT_NZ = nz; };
  group.userData.poseWallBeat = (u, phase, pu, idx, side, blur, jolt) => poseWallBeat(bones, u, phase, pu, idx, side, blur, jolt);
  group.userData.poseWall = (u, mode, phase, sideSign, frame, rest, pull, idleT) => poseWall(bones, u, mode, phase, sideSign, frame, rest, pull, idleT);
  // ...and THE LEAP the skip's flight is drawn with (session 177 — see `poseClimbFly`). Posed on top
  // of `poseWall`, so a body that is off its holds wears the pad's soar over the climb it left.
  group.userData.poseClimbFly = (u) => poseClimbFly(bones, u);
  // ...and the clip's own STROKE PROFILE (`climbPull`, see `CLIMB_PULL` below), which is the one
  // part of the climb that is not a pose at all: how fast the stone is being consumed at this
  // phase, and therefore how fast the body is being hauled up it. `player.js` wears it as the
  // climb's speed — see the `CLIMB_PULL_DEPTH` block in its `P`.
  group.userData.climbPull = (phase) => climbPull(phase);
  group.userData.poseLand = (u, power) => poseLand(bones, u, power);
  group.userData.poseSlamLand = (u, power) => poseSlamLand(bones, u, power);
  // ...and THE TOTE — the duffel carried in both hands (see `poseTote`). `kind` is the cradle
  // ("hold") or one of its two throws, and `t` is that shape's own clock: 0..1 for a throw, a
  // running clock in seconds for the hold (the breath rides it).
  group.userData.poseTote = (u, kind, t) => poseTote(bones, u, kind, t);
  // ...and THE HANDS — the single item carried in one hand (see `poseCarry`). `t` is the carry's
  // running clock in seconds (the breath rides it), and `stride`/`strideAmt` are the run's own phase
  // and blend, so the arm rides the step (session 180 — see the note on `CARRY`).
  group.userData.poseCarry = (u, t, stride, strideAmt) => poseCarry(bones, u, t, stride, strideAmt);
  // ...and THE BALL ACTIONS — the throw, the slam and the shoot (session 180; see `poseBallAction`).
  // `kind` is "throw", "slam" or "shoot" and `t` is that shape's own phase, 0..1. `charge`/`clock`
  // are the shoot's own two (see the SHOOT block): how full the hold was, and the shape's running
  // seconds. The THREE shapes' own numbers travel WITH the table — the whole `SHOOT` object is on
  // `poseCfg` so its beats can be swept against real contact measurements in the running page,
  // exactly as the other pose constants can.
  group.userData.poseBall = (u, kind, t, charge, clock, lower) => poseBallAction(bones, u, kind, t, charge, clock, lower);
  group.userData.poseSmash = (u, T, H, air) => poseSmash(bones, u, T, H, air);
  // ...and the fist shape's own channels, on their own (see `poseFists`). The landing's depth and
  // the hammer's are both authored against a MEASUREMENT of where the fists end up, so the way to
  // re-take that measurement — or to answer "where would the fists be if…" — is to drive the shape
  // directly: `fistPose(hip, lean, head, ax, az, ae)`, in rig units, applied at full strength.
  group.userData.fistPose = (hip, lean, head, ax, az, ae, splay, z, extra) => poseFists(bones, 1, hip, lean, head, ax, az, ae, splay, z, extra);
  // The melee chain and the reactions the receiving body wears (see "Combat" above). The
  // timings ride `combatMoves` so `player.js` tests its contact windows against the same
  // numbers the poses were keyed to, and so the enemy manager can hold a stun for exactly as
  // long as the move that caused it says.
  group.userData.poseAttack = (u, move, t, slam, upper) => poseAttack(bones, u, move, t, slam, upper);
  group.userData.poseSpin = (move, t, upper, slam) => poseSpin(move, t, upper, slam);
  group.userData.combatMoves = COMBAT_MOVES;
  // ...and the finisher's SECOND shape, which is not a chain move (see `DOWNSLAM_MOVE`): the down
  // slam's descriptor and its revolution, read back by `player.js` when the 4th M1 is thrown off
  // the deck. Exported as their own pair rather than as a fifth row so nothing that counts the
  // chain — the cycle, the clash table, the enemy's own punch — can see them.
  group.userData.downSlamMove = DOWNSLAM_MOVE;
  // ...and the UPPERCUT's own descriptor, exported the same way and for the same reason (see
  // `UPPERCUT_MOVE` and `player.startUppercut`): a move that rides the finisher's slot without
  // being a row of the chain, so nothing that counts the chain can see it.
  group.userData.uppercutMove = UPPERCUT_MOVE;
  // ...in RADIANS of forward pitch — the same units `pitch` is written in (see `updateVisual`), so
  // `player.js` never has to know how many turns the move is worth.
  group.userData.downSlamTurn = (u) => DOWNSLAM_TURN(u) * Math.PI * 2;
  // The clash (see the block above): one pose for both bodies, and the live weapon point the
  // enemy's fist is solved onto — written by `enemies.js` in the ENEMY's own frame each frame a
  // clash is live, and cleared the moment one is not (a stale point would leave the fist reaching
  // at wherever the player's knee used to be).
  group.userData.poseClash = (role, variant, u, drive, jolt) => poseClash(bones, role, variant, u, drive, jolt);
  group.userData.setClashPoint = (x, y, z) => { CLASH_POINT.set(x, y, z); clashPointOk = true; };
  group.userData.clearClashPoint = () => { clashPointOk = false; };
  group.userData.poseMacaco = (u) => poseMacaco(bones, u, 1);
  group.userData.macacoCurves = { turn: MACACO_TURN, lift: MACACO_LIFT };
  // ...and THE RUNNING LUNGE (see `poseLunge`): one shape per beat, on the move's own phase, with
  // the beat's own progress and the two read-outs the shape needs (whether the clinch roll has
  // anybody in its arms, and how far through the roll the pair have come).
  group.userData.poseLunge = (e, phase, u, roll, take) => poseLunge(bones, e, phase, u, roll, take);
  // THE THREE SKILLS' own shapes (see the block above): the whirl with its live NECK hold
  // (written by `player.js` in the player's own frame, exactly like the clinch's head), the
  // scissor, and the LAUNCH with its live CARRY (the body it kicked is pinned by the face to the
  // world position of the two soles, which `player.js` writes every frame off the finished rig) —
  // plus the shared LIMB STRETCH channel every pose in this file
  // can ask for (see `poseStretch` below the helpers).
  group.userData.poseWhirl = (e, u, phase, ph, cycle, hold) => poseWhirl(bones, e, u, phase, ph, cycle, hold);
  group.userData.setWhirlNeck = (x, y, z) => { WHIRL_NECK.set(x, y, z); whirlNeckOk = true; };
  group.userData.clearWhirlNeck = () => { whirlNeckOk = false; };
  // ...and THE FLYING KNEE (skill 1 as it is now — see `knee` in player.js): the run-up's stride,
  // the leap's own clock and the landing's settle are all handed in, so the shape is the beat the
  // physics is in and nothing here has to know how long any of them are.
  group.userData.poseFlyingKnee = (e, phase, u, stride, hit) => poseFlyingKnee(bones, e, phase, u, stride, hit);
  // THE RIGHT-CLICK GRAB (see `poseGrab` / "THE RIGHT-CLICK GRAB"). One shape, three kinds — the
  // kind is picked by what the body in front of him is wearing (see `player.grabKind`), and the
  // LIVE CONTACT is the enemy's own chest / shoulders / shin, written into the player's frame every
  // frame by `player.js` while the hands are on it (`setGrabPoint`), and cleared the moment they
  // are not — a stale point would have the next grab's first frames reach for wherever the last
  // body was left.
  group.userData.poseGrab = (u, t, kind, grip, miss, rawT) => poseGrab(bones, t, u, kind, grip, miss, rawT);
  group.userData.setGrabPoint = (x, y, z) => { GRAB_POINT.set(x, y, z); grabPointOk = true; };
  group.userData.clearGrabPoint = () => { grabPointOk = false; };
  // THE POLE (see `posePole` and "THE POLE"): the staff you CARRY, and the four shapes it is held
  // in — the carry, the strike, the throw and the vault. `poleHold(mode, t, out)` is the
  // READ: the shaft's own path (where the grip is, which way the rod points, how far up it the hands
  // are, and how far the body has turned through it) plus the body posture that goes with it. The
  // mover calls it ONCE a frame and spends the answer twice — once to place the prop, once to solve
  // the body onto it — so the stick that is drawn and the stick the hands are on cannot disagree.
  group.userData.poleHold = (mode, t, out) => poleHold(mode, t, out);
  group.userData.posePole = (u, mode, t, m, A, body) => posePole(bones, u, mode, t, m, A, body);
  // ...and the carried staff's own frame (see `trunkDelta`): `player.js` puts the carry's shaft on
  // the trunk with it so the staff leans and bobs with the runner instead of being bolted upright
  // to the rig while the body pitches under it.
  group.userData.trunkDelta = (out, k) => trunkDelta(out, bones, k);
  // ...and the scissor's OWN live handover, exactly like the whirl's neck: `bite` is how far the
  // scissors have snapped shut, and `tgtY`/`tgtZ` are the point in this rig's frame that the
  // player's own body placement has put on the opponent's neck — the two ankles are solved onto it
  // (see `poseScissor`'s clamp branch), so the clip and the position are one read of one number.
  group.userData.poseScissor = (e, u, phase, ph, bite, tgtY, tgtZ, miss, post) => poseScissor(bones, e, u, phase, ph, bite, tgtY, tgtZ, miss, post);
  group.userData.poseCapo = (e, u, phase, ph) => poseCapo(bones, e, u, phase, ph);
  group.userData.capoBank = (phase, ph) => capoBankAt(phase, ph);
  // The stretch channel (see `poseStretch` / `poseStretchApply` above): a pose asks with
  // `poseStretch`, and `player.js` spends the whole frame's worth with `stretchApply` at the end
  // of the pose dispatch. `stretch` is exposed raw so the running page can measure a limb's live
  // draw-length instead of trusting it.
  group.userData.poseStretch = (kind, side, s) => poseStretchChain(bones, kind, side, s);
  group.userData.stretchApply = (e) => poseStretchApply(bones, e);
  group.userData.stretch = bones.stretch;
  // ...and THE NECK'S SHARE, spent in the same breath as the stretch and for the same reason: it is
  // a POST-PASS over a finished pose, so it has to run once, after every pose layer has written its
  // head rotation, and nowhere else (see `poseNeckSplit`). `player.js` and `enemies.js` each call
  // it on the last line of their pose dispatch.
  group.userData.neckApply = () => poseNeckSplit(bones);
  group.userData.neckSplit = NECK_SPLIT;
  group.userData.neckY = NECK_BASE_Y;
  // ...and the Q dash's three shapes (see `poseDash`): front / side / back, off one function.
  // `bodyPitch` is the rig's own pitch for this frame, which `player.js` has already settled: the
  // pose solves the soles against it, so it has to arrive with the call (see `step`).
  group.userData.poseDash = (e, u, kind, side, bodyPitch) => poseDash(bones, e, u, kind, side, bodyPitch);
  // ...and the STEP's own turn, in the same place the shapes are: `player.js` reads this and puts it
  // on the rig (`backdashTurn`'s backflip+spiral for the backstep, `boxcutterTurn`'s cork and hyper
  // for the front step), so the rotation and the pose cannot disagree.
  group.userData.dashTurn = (u, kind) => ((kind | 0) === 2 ? backdashTurn(u) : boxcutterTurn(u));
  // ...and the beat TABLE the turn is authored on, RAW: `player.js` reads it for the travel curve,
  // the landing beat and the i-frame window (see `backdashBeats` there), so the shape, the travel
  // and the invulnerability are all one decision. `boxcutterBeats` is the same bargain for the front
  // step: the beat the BLADE is on, which `dashContact` compresses a contacted step onto.
  group.userData.backdashBeats = BACKDASH;
  group.userData.boxcutterBeats = BOXCUT;
  group.userData.poseHurt = (u, kind, t, spin, jolt) => poseHurt(bones, u, kind, t, spin, jolt);
  group.userData.poseLie = (down, w) => poseLie(bones, down, w);
  group.userData.lieArm = LIE_ARM;
  group.userData.hurtKinds = Object.keys(HURTS);
  // ---- the rig's own pose MEMORY: the handover between two reactions ----
  // The same bargain as the player's `chainBlend` (see player.js), and for the same reason: two
  // shapes do not always MEET, and the reaction layer is written at full weight, so wherever they
  // do not, the rig snaps in a single frame. The player has this for the chain's handovers; this is
  // the enemy's, and it exists because one handover in particular cannot be authored away — the
  // 3rd M1 can be thrown at a body at ANY point in the clinch's beat (see `CLINCH_BEAT`), and the
  // flip's own `t = 0` is `CLINCHED`, the shape of the HOLD. A sweep that lands while the victim is
  // already coming up out of the release therefore used to snap its arms 2.87 rad (measured: a 164°
  // jump on `armUpperR` on the switch frame, against ~0.2 rad on the frames either side).
  //
  // `poseSnapshot` keeps every object under the rig as local rotations AND positions (the hair
  // plates and the fingers are part of the silhouette too), and `poseBlend(k)` mixes the freshly
  // written pose back toward it: k = 0 is the snapshot exactly, k = 1 the new pose exactly. The
  // snapshot is taken on the frame the handover is flagged — BEFORE the new reaction has posed
  // anything — so `k` is a plain ramp from the shape the rig was wearing to the shape it now is.
  const linkList = [];
  group.traverse((o) => { if (o !== group) linkList.push(o); });
  const linkBuf = new Float32Array(linkList.length * 6);
  let linkHave = false;
  group.userData.poseSnapshot = () => {
    for (let i = 0; i < linkList.length; i++) {
      const o = linkList[i];
      const k = i * 6;
      linkBuf[k] = o.rotation.x; linkBuf[k + 1] = o.rotation.y; linkBuf[k + 2] = o.rotation.z;
      linkBuf[k + 3] = o.position.x; linkBuf[k + 4] = o.position.y; linkBuf[k + 5] = o.position.z;
    }
    linkHave = true;
  };
  group.userData.poseBlend = (k) => {
    if (!linkHave) return;
    for (let i = 0; i < linkList.length; i++) {
      const o = linkList[i];
      const j = i * 6;
      o.rotation.x = linkBuf[j] + (o.rotation.x - linkBuf[j]) * k;
      o.rotation.y = linkBuf[j + 1] + (o.rotation.y - linkBuf[j + 1]) * k;
      o.rotation.z = linkBuf[j + 2] + (o.rotation.z - linkBuf[j + 2]) * k;
      o.position.x = linkBuf[j + 3] + (o.position.x - linkBuf[j + 3]) * k;
      o.position.y = linkBuf[j + 4] + (o.position.y - linkBuf[j + 4]) * k;
      o.position.z = linkBuf[j + 5] + (o.position.z - linkBuf[j + 5]) * k;
    }
  };
  return group;
}

export function buildStreetGeometry() {
  const a = makeAcc();
  for (const s of [-1, 1]) {
    shoe(a, s);
    legUpper(a, s);
    legLower(a, s);
    legKnee(a, s);
    sleeve(a, s);
    armUpper(a, s);
    armLower(a, s);
    hand(a, s);
    ballAt(a, ELBOW_X * s, ELBOW_Y, ELBOW_Z, 0.050, 0.050, 0.050, C.skin);
    ballAt(a, SHOULDER_X * s, SHOULDER_Y, SHOULDER_Z, 0.085, 0.085, 0.085, C.shirt);
  }
  torso(a);
  neck(a);
  head(a);
  hair(a);
  return toGeometry(a);
}

// --------------------------------------------------------------------------
// Run cycle.
//
// Poses here are *placed*, not angled. The cycle owns three things:
//
//   1. the hip's height (the body's bounce — including the flight arc),
//   2. where each foot's sole is, and at what angle, relative to the ground,
//   3. how far the ankle is from the hip (i.e. how bent the knee is),
//
// and every joint angle is solved from those with two-bone IK. Placing the
// cycle that way is what makes the three things a run is actually judged on
// fall out for free:
//
//   Stance   the sole's lowest point is pinned to exactly 0 for the whole
//            stance, so the foot never floats and never scuffs. The planted
//            foot also tracks straight backwards at a constant rate, which is
//            the only way it can stand still on the ground while the world
//            moves past underneath.
//   Flight   the body's height is authored, so it genuinely leaves the ground
//            and rises through the flight. (The old cycle derived the hip's
//            height from the lowest sole, which is correct for a walk and
//            geometry-impossible for a run: it pins the lowest foot down at
//            every instant, so the body can never be airborne.)
//   Swing    the leg is folded by an authored hip-to-ankle distance, so the
//            heel can kick up behind and the knee can drive forward without
//            ever asking for a pose the limb cannot reach.
//
// Timeline, in each leg's own phase q (0 = that leg's contact): stance holds
// for q in [0, toeOff], then the swing runs to q = 1. The other leg contacts at
// 0.5, so the two legs interleave into contact / down / passing / up / flight.
// Every channel is authored for the LEFT leg; the right samples q + 0.5, so the
// gait alternates by construction rather than by two hand-matched tables.
//
// Angles are radians. `sole` is the sole's angle relative to the WORLD (0 is
// flat, positive is toe-down), which is what the IK's ankle solve consumes.
// Lengths are authoring units: the hip stands at HIP_Y = 1 with the leg straight.
// --------------------------------------------------------------------------

const RUNC = {
  toeOff: 0.34,
  reach: 0.372,    // ankle ahead of the hip at contact
  stride: 0.82,    // how far back the ankle travels through the whole stance
  // Hip height through the stride — the entire bounce, including the flight.
  // Contact is a little low because the leg is reaching, mid-stance rides up as
  // the leg comes under the body, and the flight peak — the only part of the
  // curve the ground could not have produced on its own — carries the body above
  // its own standing height. That rise is the whole difference between a run and
  // a shuffle, so it is authored, not inherited.
  hipY: [0.912, 0.890, 0.874, 0.866, 0.864, 0.868, 0.916, 1.022,
         0.912, 0.890, 0.874, 0.866, 0.864, 0.868, 0.916, 1.022],
  // Sole angle through stance: heel strike, roll flat, roll onto the toe.
  stanceSole: [-0.30, -0.08, 0.02, 0.06, 0.18, 0.50, 1.05],
  // Where the ankle is through the swing, fore-and-aft. The foot does not turn
  // around at toe-off: it keeps travelling *back* while it lifts — that trailing
  // beat, foot up behind, is what reads as stride rather than as a shuffle — and
  // only then swings forward, overshooting a little before it strikes. Both ends
  // are pinned to the stance: the first sample is `reach - stride` (the toe-off)
  // and the last is `reach`.
  swingZ: [-0.448, -0.72, -0.74, -0.66, -0.58, -0.46, -0.16, 0.30, 0.372],
  // Hip-to-ankle distance through the swing. Barely folded: the leg trails
  // nearly straight behind the hip at the top of the swing, folds as it comes
  // through, and reaches out again into the strike.
  swingD: [0.763, 0.775, 0.772, 0.720, 0.710, 0.655, 0.600, 0.700, 0.769],
  // Sole angle through the swing: still pointed off the toe, relaxing as the
  // knee folds, toe up and ready to strike by the end.
  swingSole: [1.05, 0.86, 0.50, 0.18, 0.00, -0.14, -0.24, -0.30, -0.30],
  // Arms: shoulder swing (positive = back) and elbow flexion, measured off the
  // reference run poses (the five red mannequins): the hand rides at hip height
  // the whole way round, driving 0.44 forward of the hip at the front of the
  // swing and 0.39 behind it at the back. Getting that back reach is what makes
  // the elbow nearly straight at the back of the swing and folded at the front,
  // rather than the other way round.
  swing: [1.10, 1.09, 0.55, -0.14, -0.01, 0.42, 0.81, 0.73],
  elbow: [1.64, 1.44, 1.36, 1.65, 1.77, 1.34, 1.07, 1.42],
  lean: [0.44, 0.47, 0.50, 0.49, 0.46, 0.44, 0.39, 0.42],
  twist: [1.00, 0.71, 0.00, -0.71, -1.00, -0.71, 0.00, 0.71],
  // The trunk's twist, and how far the arms cross in front of the chest. Both are
  // rig leverage rather than angles: the whole run reads from behind and in front
  // off these two numbers, and the side view cannot see either of them at all.
  //
  // twistAmt is the one dial for the whole twist: everything below is rig leverage,
  // measured from the pelvis, and this scales all of it at once (pelvis yaw,
  // shoulder yaw, the shoulder line's slope, the head's counter-roll and the pelvis
  // counter-tilt), so the twist can be turned up or down without touching five
  // separate numbers. armCross is scaled by hand because it hangs off the arm swing
  // rather than off this curve.
  twistAmt: 0.65,
  twistLever: 0.30,   // pelvis yaw, against the shoulders' (below)
  shoulderYaw: 1.20,  // shoulders' own yaw, the other way
  hipRoll: 0,         // pelvis roll — off: any hip roll lifts the planted sole
  torsoRoll: -0.12,   // the trunk's own roll. Note the sign: it *reduces* the read
                      // from behind, because a yawed, pitched chest already rolls and
                      // rolling it the same way cancels the diagonal out again.
  headRoll: 0.72,     // the head's own counter-roll, so the face stays level
  // ...and the head's own counter-PITCH: how much of the trunk's lean it takes back out. It is NOT
  // true that the face ends up `(1 - this) * lean` back from the trunk, because the NECK takes its
  // share by re-reading `neck ∘ head` every frame while every pose re-authors the head (`poseNeckSplit`
  // — and note that split is only idempotent WITHIN a frame). Measured on the live rig, that
  // recurrence AMPLIFIES the head's world rotation to about **1.5x** the authored one. So 0.85,
  // which reads as "most of the way to level" on paper, actually carried the face to **~7 deg ABOVE
  // the horizon** (its worst frame of the cycle +11.9) — a head craning up over its own run, which
  // is the user's *"when im running the head looks up its looks weird can u fix that"*. 0.70 is the
  // share that lands the face level once the neck's added share is in: measured live at a full
  // sprint (speed 10.9), **-2.1 deg avg, -5.7 .. +1.3 over the whole cycle** — level, a touch
  // down, the way a runner's head rides. Session 172.
  headPitch: 0.70,
  pelvisRoll: 0.26,   // the pelvis MESH's tilt — cosmetic only, so the hip line can
                      // counter-slope the shoulders without moving a planted foot
                      // (kept small: the shirt hem is right above it, and a bigger
                      // tilt opens a gap between the two)
  armCross: 0.098,    // how much further the forward hand tucks across the body
  armTuck: 0.03,      // resting tuck, so a swinging arm clears the trousers
};

// The thigh and the shin are not quite square to their bones' own axes: the knee
// hangs 0.004 forward of the hip joint and the ankle 0.006 forward of the knee,
// so at rest both links lean a hair forward. Folding that in (here and in the IK
// below) is what makes the solve exact — a target of "sole flat on the ground"
// lands the sole on the ground rather than 1% of the body's height above it.
const THIGH_LEN = Math.hypot(KNEE_Y - HIP_Y, 0.004);
const SHANK_LEN = Math.hypot(ANKLE_Y - KNEE_Y, ANKLE_Z - 0.004);
const THIGH_TILT = Math.atan2(0.004, HIP_Y - KNEE_Y);
const SHANK_TILT = Math.atan2(ANKLE_Z - 0.004, KNEE_Y - ANKLE_Y);
const LIMB = THIGH_LEN + SHANK_LEN;
// Bounce extremes, used to normalise the trunk's stretch/squash.
let HIP_LO = Infinity;
let HIP_HI = -Infinity;
for (const v of RUNC.hipY) {
  if (v < HIP_LO) HIP_LO = v;
  if (v > HIP_HI) HIP_HI = v;
}
const HIP_MID = (HIP_LO + HIP_HI) / 2;
const HIP_HALF = (HIP_HI - HIP_LO) / 2;

// Cyclic Catmull-Rom: sample a table that wraps (a stride is a loop).
function runCurve(v, p) {
  const n = v.length;
  const x = ((p % 1) + 1) % 1 * n;
  const i = Math.floor(x);
  const t = x - i;
  const a = v[(i + n - 1) % n];
  const b = v[i % n];
  const c = v[(i + 1) % n];
  const d = v[(i + 2) % n];
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

// Clamped Catmull-Rom, for tables that describe one pass (u runs 0 to 1).
function runCurveEnd(v, u) {
  const n = v.length;
  const x = Math.max(0, Math.min(n - 1, u * (n - 1)));
  const i = Math.min(n - 2, Math.floor(x));
  const t = x - i;
  const a = v[Math.max(0, i - 1)];
  const b = v[i];
  const c = v[i + 1];
  const d = v[Math.min(n - 1, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

// How high the ankle has to be for the sole's lowest point to touch the ground
// at this sole angle — the toe and the heel take turns being the lowest point,
// which is what rolls the foot through the stance.
function ankleForSole(sole) {
  return -SOLE_Y * Math.cos(sole) + Math.max(SOLE_TOE * Math.sin(sole), SOLE_HEEL * Math.sin(sole));
}

// Two-bone IK in the sagittal plane: given where the ankle has to be relative
// to the hip, solve the thigh's swing, the knee's flexion, and the shin's world
// angle. `z` is forward, `y` is up (and negative: the ankle hangs below the hip).
function legIK(z, y) {
  const raw = Math.sqrt(z * z + y * y);
  const d = raw > LIMB ? LIMB : raw;
  if (raw > 0) {
    z *= d / raw;
    y *= d / raw;
  }
  const theta = Math.atan2(z, -y);
  let ca = (THIGH_LEN * THIGH_LEN + d * d - SHANK_LEN * SHANK_LEN) / (2 * THIGH_LEN * d);
  ca = ca < -1 ? -1 : ca > 1 ? 1 : ca;
  const thigh = theta + Math.acos(ca) - THIGH_TILT;
  const shin = Math.atan2(z - THIGH_LEN * Math.sin(thigh + THIGH_TILT),
    -(y + THIGH_LEN * Math.cos(thigh + THIGH_TILT))) - SHANK_TILT;
  return { thigh: -thigh, knee: thigh - shin, shin };
}

// The depth of the ANKLE below the hip that a pair of leg angles adds up to — the forward map of the
// solve `legIK` runs, in the same frame and the same units (the exact inverse of the two lines above,
// where `thighL = -ik.thigh` and `shinL = -ik.thigh - ik.knee`).
//
// NOTHING IN THE GAME CALLS IT ANY MORE, and that is worth saying rather than leaving a future reader
// to wonder. Its one caller was the spin kick's own deck clamp, which only ever spent it as a
// DIFFERENCE — the depth the same leg had a line earlier vs the depth it has after an `ext`-weighted
// pull — and that is what made it exact where it had to be: the lateral `ANKLE_X` term the real solver
// carries (the ankle hangs out to the side of the shin, so a splay turns that offset into height) is
// not modelled here, but it is the SAME term in both readings and it cancelled out of the subtraction
// to the millimetre. Used absolutely it reads ~0.03 too deep at a standing splay and wildly too deep
// once the leg is abducted, which is why it never is.
//
// The spin kick went in session 87 and the boxcutter that replaced it does not need a clamp at all —
// the solve owns both of its legs from `kickEnd` on, a tenth of a second before the feet arrive, so
// the foot can only ever come down from above (see "The FRONT step — the boxcutter"). It is left here
// as the exact forward map of `legIK`'s own ask, which is what a shape that DOES blend a leg out of
// the solve would need.
function legSagDepth(thigh, knee) {
  return -(THIGH_LEN * Math.cos(-thigh + THIGH_TILT) +
    SHANK_LEN * Math.cos(-thigh - knee + SHANK_TILT));
}

// One leg's plan at its own phase q. `hip` is the hip height there, which the
// swing needs in order to place the ankle at an authored distance from it.
function legPlan(q, hip) {
  const TO = RUNC.toeOff;
  const u = q - Math.floor(q);
  if (u < TO) {
    const s = u / TO;
    const sole = runCurveEnd(RUNC.stanceSole, s);
    return { z: RUNC.reach - RUNC.stride * s, ankle: ankleForSole(sole), sole, stance: true };
  }
  const s = (u - TO) / (1 - TO);
  const z = runCurveEnd(RUNC.swingZ, s);
  const d = Math.min(runCurveEnd(RUNC.swingD, s), LIMB);
  return { z, ankle: hip - Math.sqrt(Math.max(0, d * d - z * z)), sole: runCurveEnd(RUNC.swingSole, s), stance: false };
}

function smooth01(x) {
  const t = x <= 0 ? 0 : x >= 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// WALL KICK — four authored variants, one picked per kick by `player.js`.
//
// This used to be a single additive shape (a boot speared out to the wall's side).
// Four kicks off the same wall in a row read as one loop, so it is a TABLE now:
// every variant is a row of numbers and `poseKick` is the only code. A new shape is
// a new row, never a fork of the function.
//
// The numbers live in the same space as the rest of this file — `poseLegAngles`'s
// (thigh, knee, sole, splay), where the thigh swings the knee forward when it goes
// negative, the knee folds on a positive, the sole goes toe-down on a positive and
// the splay throws the leg outward from the midline; and `poseArmAngles`'s
// (upX, upZ, elbow), where a negative `upX` swings the hand forward and, past
// -PI/2, overhead.
//
// Two things about that space matter here. The first is that these are ABSOLUTE
// targets eased in on the kick's own envelope, like `poseAir` and `poseDive` —
// not additive like the shape this replaced — so the kick owns the body outright
// while it lasts and does not care how much of the dive pose is blended in behind
// it. The second is that `player.js` pitches the body onto its NOSE for the whole
// time a kick is live (the dive's +1.15 plus the kick's own pulse), so in this
// table "forward" means "toward the wall and the floor": a leg swung forward is a
// boot driven down the face, and one swung back is trailing up behind.
//
// Rows: `kick` (the wall-side leg, driven by `side`), `trail` (the other, by
// `-side`), `armWall` / `armFree`, the body twists, and `grip` (how hard the fists
// close — the anime shapes want them shut). `spin` is the whole body's turn in
// turns, read by `player.js` (see P.KICK_FLIP_TIME); `poseKick` itself ignores it.
// ---------------------------------------------------------------------------
const KICK_VARIANTS = [
  {
    // BOOT — the original: the boot speared square out to the wall's side, the trailing
    // knee folded up and across, hips and chest wound against each other. The plain
    // "I met a wall" shape, kept as the one with no story to it.
    name: "boot",
    kick: [0.20, 0.28, 1.08, 1.83],
    trail: [-0.13, 1.84, 0.40, 0.75],
    armWall: [0.94, 0.06, -1.25],
    armFree: [2.31, 1.31, -1.25],
    hipTwist: 0.28,
    torso: [-0.28, -0.45, 0.13],
    head: [0, -0.20, 0],
    grip: 1.0,
    spin: 0,
  },
  {
    // PLANT — the push-off: the knee comes up and folds so the SOLE goes flat on the
    // face, and the leg under the body trails straight down and back, so the shape is
    // one diagonal from the planted foot to the trailing toe. Both arms go overhead —
    // they are only balance; the shove is the leg's.
    name: "plant",
    kick: [-2.90, 0.55, 0.85, 0.15],
    trail: [-1.05, 0.22, 0.30, 0.25],
    armWall: [-2.55, 0.40, -1.30],
    armFree: [-2.55, 0.45, -1.30],
    hipTwist: 0.15,
    torso: [0.10, -0.25, 0.08],
    head: [-0.25, -0.15, 0],
    grip: 1.0,
    spin: 0,
  },
  {
    // RISING — the boot goes UP the face instead of into it: thigh high, knee nearly
    // locked, the other knee folded away underneath, both fists pulled in beside the
    // head. The tall stacked silhouette of a rising kick rather than a shove.
    name: "rising",
    kick: [3.10, 0.12, 0.06, 0.22],
    trail: [-1.60, 1.90, 0.30, 0.30],
    armWall: [-2.75, 0.55, -1.65],
    armFree: [-2.80, 0.60, -1.65],
    hipTwist: 0.25,
    torso: [-0.06, -0.50, 0.14],
    head: [-0.15, -0.25, 0],
    grip: 1.0,
    spin: 0,
  },
  {
    // FLIP — the kick nobody asked for. Both knees to the chest and both arms wrapped
    // to them: the wall is a trampoline and what leaves it is a ball. The turn is not a
    // pose (see `spin` above and P.KICK_FLIP_TIME in player.js), so this row only has to
    // be the tightest shape the body can hold while it goes round — hence the legs
    // borrow the tuck's own numbers (`poseTuck`), which are already known to read as one.
    name: "flip",
    kick: [-1.81, 2.44, 0.38, 0.20],
    trail: [-1.75, 2.50, 0.38, 0.25],
    armWall: [-0.88, 0.15, -2.31],
    armFree: [-0.88, 0.15, -2.31],
    hipTwist: 0,
    torso: [0.38, 0, 0],
    head: [0.33, 0, 0],
    grip: 1.0,
    spin: 1,
  },
];

function kickVariantAt(variant) {
  const n = KICK_VARIANTS.length;
  return KICK_VARIANTS[(((variant | 0) % n) + n) % n];
}

// The dive's wall kick. `u` runs 0 at contact to 1 when the boot has been pulled back in
// (the flip variant rides its own, longer clock — see `KICK_VARIANTS[].spin`); `side` is
// -1 when the wall-side leg is the model's `L` one and +1 when it is the `R`. The whole
// shape mirrors on it — both legs through `poseLegAngles`'s own `side * splay`, both arms
// through `poseArmAngles`'s `side * upZ` — so a left-hand wall is the right-hand kick
// reflected rather than a fixed pose wearing the wrong leg.
function poseKick(bones, u, side, variant) {
  const out = smooth01(Math.min(1, u / 0.3));
  const back = smooth01(Math.max(0, (u - 0.5) / 0.5));
  const a = out * (1 - back);
  if (a <= 0.0001) return;
  const V = kickVariantAt(variant);
  poseLegAngles(bones, side, V.kick[0], V.kick[1], V.kick[2], V.kick[3], a);
  poseLegAngles(bones, -side, V.trail[0], V.trail[1], V.trail[2], V.trail[3], a);
  poseArmAngles(bones, side, V.armWall[0], V.armWall[1], V.armWall[2], a);
  poseArmAngles(bones, -side, V.armFree[0], V.armFree[1], V.armFree[2], a);
  // Hips wind toward the kick and the chest winds against them — that shear is what the
  // camera's scripted spin reads off.
  poseRot(bones, "hips", "y", V.hipTwist * side, a);
  poseRot(bones, "hips", "z", 0, a);
  poseRot(bones, "torso", "x", V.torso[0], a);
  poseRot(bones, "torso", "y", V.torso[1] * side, a);
  poseRot(bones, "torso", "z", V.torso[2] * side, a);
  poseSettleTorso(bones, a);
  poseRot(bones, "head", "x", V.head[0], a);
  poseRot(bones, "head", "y", V.head[1] * side, a);
  poseRot(bones, "head", "z", 0, a);
  // THE STRETCH (see `poseStretch`). The wall kick is a leg thrown out to full extension, so it is
  // drawn up to a quarter longer than the bones are at the top of the throw, and back to normal on
  // the way down. It is keyed off `u` rather than off the pose's own envelope `a`, because `a` is
  // also the blend weight and would hold the stretch open for as long as the pose is worn; a kick
  // is an accent, so the curve has to come back down on its own.
  poseStretchChain(bones, "leg", side, kf(u, [[0, 1], [0.08, 1.04], [0.26, 1.24], [0.48, 1.24], [0.68, 1.08], [1, 1]]));
  poseGrip(bones, V.grip, a);
}

// How far a fist closes. The proximal segment folds right across the palm and
// the segment below it tucks in behind, so the digits curl all the way into the
// hand; the thumb only turns over the top of them.
const FIST = { knuckle: 1.62, mid: 1.72, thumb: 0.86 };

// ---------------------------------------------------------------------------
// The STRAFE — SHIFT LOCK's side-step. The user's *"add a better strafe walk animation"*, off the
// reference clips they brought with it (the Unreal "directional movement" set, the Unity "walking
// backward / strafe right & left" breakdown, and the "easiest method" strafe-walk still, whose
// wide planted stance is the shape this aims at).
//
// The strafe is the RUN CYCLE TURNED ONTO ITS SIDE. Everything below is the same machinery the
// sagittal plan uses — a strike station, a belt the planted foot rides back through the body, a
// swing that lags past the toe-off and then sweeps out to the next strike — but written on the
// LATERAL axis, and for the same reason it works in the sagittal plane: the station travels
// through the body at the speed the legs are being carried, so the planted foot stays where it was
// put out in the world instead of skating sideways. A short, made-up side-step is what skates: it
// has to cover the same ground with less travel.
//
// The run's own numbers transfer — the strike reach (0.372), the belt distance (0.82), the
// hip-to-ankle arc through the swing — because they were authored at the leg's own reach limit,
// and the leg does not care which way it is reaching: the same stations that put the ankle 0.372
// ahead of the hip put it 0.372 out to the side, at the same hip height and the same sole angle.
//
// What a side-step adds is the thing a sagittal solve cannot express: BOTH feet have to be placed
// sideways — the trailing one lands somewhere new too — and neither may lift while planted.
// `latLegIk` below solves exactly that; the old channel could not, which is why it faded its whole
// abduction out before the foot came down and so never actually left the foot anywhere.
//
// The fore/aft split (`front` / `swingZ`) exists for one reason: the legs pass each other at the
// crossing, and they have to pass at different fore/aft stations. The swinging foot crosses BEHIND
// the planted one.
// ---------------------------------------------------------------------------
const LATC = {
  reach: 0.372,       // where the ankle lands, sideways, out on the travel side (the run's strike)
  stride: 0.82,       // ...and how far it rides back through the body while it is planted
  front: 0.105,       // the fore/aft split: the planted foot rides this far forward of the hip line
  // ...and the swing, in the three channels the sagittal plan uses: where it is SIDEWAYS (it lags
  // past the toe-off, gathers while the other foot is under the body, then sweeps out to the
  // strike), where it is FORE/AFT (down to the back split — that is the crossing clearance), and
  // how far its SOLE clears the deck. The third one is authored as a clearance rather than as a
  // hip-to-ankle distance, the way the sagittal plan authors it, because the strafe reaches
  // sideways: the same distance would hang the foot on a diagonal and its height would then have to
  // be re-derived every time a station moved (and it is the height — a foot dragging the deck
  // through the crossing — that is the thing you can actually see). The leg's own span falls out
  // of the clearance; keep the stations wide and it is never more than the leg has.
  swingX: [-0.448, -0.50, -0.52, -0.46, -0.30, -0.10, 0.14, 0.32, 0.372],
  swingZ: [0.105, -0.03, -0.19, -0.23, -0.235, -0.22, -0.10, 0.07, 0.105],
  swingLift: [0, 0.075, 0.10, 0.115, 0.125, 0.115, 0.09, 0.045, 0],
  // How much of the run's heel-to-toe roll a side-step keeps. A strafe lands almost flat — and the
  // roll is not just a look: it is what sets the ankle's height over the deck (`ankleForSole`), so
  // this is also what leaves the leg the reach the wide stations need.
  soleK: 0.5,
  // How much of the two feet's mean sideways position the PELVIS rides (a wide stance puts the
  // weight over the support). The body does not skate — the feet do the travelling — so this is
  // small, and it is the only part of the strafe that is not the legs.
  sway: 0.5,
  // The arms trail the step — both of them, over on the side the body is leaving — with a little
  // of the step's own rhythm on top. (A strafe's arms do not pump; they hang and balance.)
  armTrail: 0.11,
  armPump: 0.07,
};

// One strafe foot at its own phase: where it is sideways (relative to the hip line, out on the
// travel side), where it is fore/aft, and how far it hangs from the hip while it is in the air.
function latPlan(q) {
  const u = q - Math.floor(q);
  if (u < RUNC.toeOff) {
    const s = u / RUNC.toeOff;
    return { x: LATC.reach - LATC.stride * s, z: LATC.front, lift: 0, stance: true };
  }
  const s = (u - RUNC.toeOff) / (1 - RUNC.toeOff);
  return {
    x: runCurveEnd(LATC.swingX, s),
    z: runCurveEnd(LATC.swingZ, s),
    lift: runCurveEnd(LATC.swingLift, s),
    stance: false,
  };
}

// The strafe's leg solve — abduction FIRST, from the target itself.
//
// The sagittal solve places the ankle in the leg's own fore/aft plane and `upper.rotation.z` then
// swings that whole plane out to the side. In the air that is fine; the moment the foot has to
// plant it is not, because the abduction swings the foot's own sideways offset down as well as
// out. The ankle sits `f` = ±ANKLE_X out from its bone, so under an abduction of `a` the foot
// lands at `Rz(a)·(N + (f, 0))` — the offset contributes `f·sin(a)` of HEIGHT, 9 cm at the wide
// station's own reach, which is why a planted, abducted leg digs its sole into the deck (or hovers
// over it) and why the old channel had to unwind the abduction before the foot came down.
//
// Solving for the abduction first removes the error instead of hiding it. For a target ankle at
// `(x, -drop)` the abduction that puts the thigh's own axis through it is
// `atan2(x, drop) - asin(f/R)`, `R` being the hip-to-ankle distance in that plane; the sagittal
// solve is then handed `yN`, the vertical of the point ON the thigh's axis that the foot hangs off,
// and the foot lands exactly on the target. Both numbers are exact, not tuned.
function latLegIk(x, drop, f) {
  const r = Math.hypot(x, drop);
  const k = Math.max(-1, Math.min(1, f / Math.max(1e-4, r)));
  return { abduct: Math.atan2(x, drop) - Math.asin(k), yN: -Math.sqrt(Math.max(0, r * r - f * f)) };
}
// ...and how much of the run's own trunk work a travel that is not straight ahead keeps. A strafe
// has no corkscrew in it (the body is squared to the aim) and a backpedal is not leaning into the
// wind, so the twist and the lean both come off — the arms with them, since a pump is a forwards
// gesture. These are the pose's own damping; the lock's own numbers are `P.LOCK_*`.
//
// The LEAN is damped harder than a straight proportion of the travel would: a body being carried
// sideways is not running *at* anything, and the run's own ~36°-at-a-sprint pitch is what makes a
// strafe read as a crab walk if it is left on (see the strafe note above — the user's clip is a
// man stepping sideways standing up). What is kept is the bob, the bounce and the bank.
const LOCK_TWIST_K = 0.75;
const LOCK_LEAN_K = 0.72;
const LOCK_BACK_LEAN_K = 0.75;
const LOCK_ARM_K = 0.80;
// ...and how much of the lock's sideways LEAN the head gives back (see `bank` in `poseRun`): 1 would
// hold the face dead level over a trunk that is leaning, which bends the neck harder than a lean
// that size should; this keeps the head nearly level without the neck taking all of it.
const LOCK_HEAD_K = 0.75;

function poseRun(bones, phase, blend, speedFrac, fwd = 1, lat = 0, bank = 0, chargeArm = 0) {
  const b = blend <= 0 ? 0 : blend >= 1 ? 1 : blend;
  const p = phase - Math.floor(phase);

  // ---- the LATERAL channel: SHIFT LOCK's strafe and backpedal (see `P.LOCK_*` and the run-cycle
  // block in player.js). `fwd` is the travel's forwards component in the BODY's own frame and `lat`
  // its sideways one, positive toward the character's own LEFT — so a body running where it looks
  // is `fwd` 1, `lat` 0 and the numbers below all collapse to exactly the cycle that was here
  // before (`strideK` 1, no abduction, no lean of its own). `bank` is the sideways LEAN the lock
  // gives the travel (`P.LOCK_BANK`, plus the steering lean the lock takes over off the container
  // roll), written on the TRUNK: a lean at the waist cannot move a planted sole, which is the whole
  // reason it is written there and not on the rig — a roll of the whole body would have to be paid
  // for out of every ankle in it (see the leg-order note in player.js).
  //
  // The strafe itself is `LATC`/`latPlan`/`latLegIk` above: the run's step turned onto the lateral
  // axis, solved exactly so that both feet can be PLANTED out to the side. The run's ankles are
  // solved in the SAGITTAL plane only (`legIK` takes a forwards offset and a height), so a sideways
  // placement has to come off the thigh's own ABDUCTION — a rotation about the hips' forward axis,
  // which is what the thigh's `z` means in the rig's `ZYX` order (the one the dash raises for
  // itself and puts back; see the leg-order note in player.js). In the strafe that abduction is
  // SOLVED per leg rather than faded in and out: it is what puts the foot where `latPlan` says,
  // planted or in the air alike, and `latLegIk` accounts for the foot's own sideways offset so a
  // planted leg does not dig (or hover) when the step is wide. The foot's own hinge takes the
  // abduction's roll back out, so the sole stays flat on the deck.
  //
  // ...and the order is borrowed ONLY while the lateral channel is live (`latAmt` off zero): with
  // `lat` 0 the abduction is 0, and the run cycle is then left on the `XYZ` the rig has always run
  // in — so the plain run's own pose, its `splay` included, is bit-for-bit what it was before any
  // of this existed, not merely close (the two orders read the same `z` differently: an own-frame
  // roll against the hips' one).
  const latAmt = Math.min(1, Math.abs(lat));
  const backAmt = Math.min(1, Math.max(0, -fwd));
  const latSign = lat >= 0 ? 1 : -1;
  const strideK = 1 - 0.80 * latAmt;   // the run's own reach, faded out by `latAmt` below
  const lateral = latAmt >= 0.02;
  // The two feet's plans for this frame: the left leg runs on phase `p` and the right on `p + 0.5`
  // (see the leg loops below), so these are the pair the strafe is stepping between.
  const latA = lateral ? latPlan(p) : null;
  const latB = lateral ? latPlan(p + 0.5) : null;
  // The pelvis rides the two feet's mean sideways position (see `LATC.sway`). Its own translation
  // is subtracted back out of the leg targets below, so the feet stay on the stations they were
  // given while the weight moves over them.
  const latSway = lateral ? latSign * LATC.sway * (latA.x + latB.x) * 0.5 * b * latAmt : 0;
  bones.hips.position.x = latSway;
  // ...and the sole's roll, much flattened for a side-step (see `LATC.soleK`).
  const latSoleK = 1 - (1 - LATC.soleK) * latAmt;
  const thighL = bones.legUpperL;
  const thighR = bones.legUpperR;
  if (lateral) {
    if (thighL) thighL.rotation.order = "ZYX";
    if (thighR) thighR.rotation.order = "ZYX";
  }

  // Axes nothing else in the run owns, reset here so they always come back to the rest
  // pose. Two of them belong to the idle (`poseIdle` tucks the arms in with the shoulder's
  // twist and toes the feet out): without the reset, a blend of 0 would be the rest pose for
  // every other joint but would leave an idle's twist and toe-out behind.
  bones.armUpperL.rotation.y = 0;
  bones.armUpperR.rotation.y = 0;
  bones.footL.rotation.y = 0;
  bones.footR.rotation.y = 0;
  // The other four are the WALL solves' leftovers. `wallHand` and `wallFoot` do not write
  // angles at all — they write a whole ORIENTATION (a quaternion), because the palm has to
  // lie flat in the face and the sole has to lie flat in it as well, and neither falls out of
  // a hinge. The decomposition of that orientation spreads onto axes the angle-based poses
  // never touch: the forearm is a plain hinge (`armLower.x`) and the thigh is placed by `x`
  // and `z`, so a yaw/twist left on either is unowned, survives the end of the wall move and
  // every pose after it, and reads as a joint that has come apart. Reset them here so a wall
  // solve is the only thing that can ever put a value on them.
  bones.armLowerL.rotation.y = 0;
  bones.armLowerL.rotation.z = 0;
  bones.armLowerR.rotation.y = 0;
  bones.armLowerR.rotation.z = 0;
  // ...and the WRISTS. The hand is its own bone now (see `WRIST_Y` / `poseWrist`), and the only
  // things in the game that write it are the staff form and the grips that mean to cock a hand —
  // every one of them wants the hand back at the rest angle the moment it is done, so all three
  // axes are cleared here rather than left to whichever pose happens to be next.
  for (const h of [bones.handL, bones.handR]) {
    if (!h) continue;
    h.rotation.x = 0;
    h.rotation.y = 0;
    h.rotation.z = 0;
  }
  bones.legUpperL.rotation.y = 0;
  bones.legUpperR.rotation.y = 0;
  // ...and THE SHINS, which are the same class of leftover one bone further down — and were the
  // one pair of them still missing (session 164, the user's *"whenever i like climb then land my
  // legs become closed in on each other"*). The climb's clip is a QUATERNION on all sixteen of
  // `CLIMB_BONES`, and two of those sixteen are the shins: the decomposition of the knee's own
  // hold spreads onto the yaw and the roll, and a shin is a plain hinge — `poseLegAngles`,
  // `poseLegIK` and `wallFoot` all place it with `L.rotation.x` alone — so nothing in the game
  // ever writes those two axes back. Left on, the shins stay ROLLED INWARD after the wall is
  // behind him (the clip's own bend plane, which a climbing leg wears) and the two feet are
  // carried into each other: MEASURED on the live rig, one climb-and-land took the shins from a
  // clean y/z of 0.000 to **z 0.537 and -0.539 (31 degrees a side)** and the feet from **0.476 rig
  // units apart to 0.082**, which is the whole of the report. They persist because nothing resets
  // them — a respawn does not either — so the legs stayed shut for the rest of the session. The
  // two places that DID square them (`poseClimbPark`, which squares the shins before it solves the
  // parked feet, and `dashSole`) each ease them to zero for their own solve; zeroing them here, at
  // the top of the frame and before every writer, is what makes that the DEFAULT state of the rig
  // rather than something two poses have to remember to ask for.
  for (const shin of [bones.legLowerL, bones.legLowerR]) {
    if (!shin) continue;
    shin.rotation.y = 0;
    shin.rotation.z = 0;
  }
  // ...and one that is not a rotation: the old crawl used to set the head back off the plate
  // (`CLIMB.headBack` in sessions 137-154 — the climb is the user's clip now and asks for no
  // set-back, so `poseWallClimb` drives it back to zero), and the head bone's own offset is not
  // owned by anything else, so it is reset here for exactly the same reason the axes above are.
  bones.head.position.z = 0;
  // The hips' own PITCH, which only the melee poses set (see "Combat"): the run writes `y` and
  // `z` on the hips and the action poses below write the trunk, so a hip pitch left on a move
  // that was interrupted mid-swing would survive every pose after it.
  bones.hips.rotation.x = 0;

  // The body's own bounce. The run's own height, eased in from standing.
  const hipRun = runCurve(RUNC.hipY, p);
  const hip = HIP_Y + (hipRun - HIP_Y) * b;
  bones.hips.position.y = hip;

  // Legs. Each target is eased from the rest pose's own target (ankle under the
  // hip, leg straight, sole flat), so a blend of 0 reproduces the rest pose
  // exactly — every angle comes out as a clean zero.
  for (const [q, upper, lower, foot] of [
    [p, bones.legUpperL, bones.legLowerL, bones.footL],
    [p + 0.5, bones.legUpperR, bones.legLowerR, bones.footR],
  ]) {
    const plan = legPlan(q, hipRun);
    const z = ANKLE_Z + (plan.z - ANKLE_Z) * b * strideK;
    const sole = plan.sole * b;
    // A planted sole's height follows from its angle rather than being interpolated
    // towards, and a swinging one is never allowed below that same height, so a
    // part-way-blended run keeps its foothold exactly on the ground on the way in
    // instead of scuffing through the last few degrees of the transition.
    const floor = ankleForSole(sole);
    const ankle = Math.max(plan.stance ? floor : ANKLE_Y + (plan.ankle - ANKLE_Y) * b, floor);
    const ik = legIK(z, ankle - hip);
    upper.rotation.x = ik.thigh;
    lower.rotation.x = ik.knee;
    // The foot's own joint angle is whatever is left of the authored sole pitch
    // once the thigh and the shin have had their say.
    foot.rotation.x = sole - ik.thigh - ik.knee;
  }
  // Flares this wide would scissor through each other on every stride, so the
  // legs splay a few degrees apart — which is also the way baggy trousers
  // swing. (The knee's own two-bone triangle is planar, so the splay is safe.)
  // The pelvis and the splay both roll the FEET, and a rolled sole's outer edge
  // is what would otherwise hover or dig, so a planted foot gets the roll taken
  // back out at its own hinge: the sole stays flat on the ground no matter how
  // much the hips sway above it.
  const legSplay = 0.075 * b;
  const pelvRoll = -runCurve(RUNC.twist, p) * RUNC.hipRoll * b;
  for (const [q, upper, lower, foot, splay, lp, side] of [
    [p, bones.legUpperL, bones.legLowerL, bones.footL, -legSplay, latA, -1],
    [p + 0.5, bones.legUpperR, bones.legLowerR, bones.footR, legSplay, latB, 1],
  ]) {
    const plan = legPlan(q, hipRun);
    // Fore/aft: the run's own stride (further squashed by `strideK`), faded out entirely by
    // `latAmt` as the strafe's own split takes over. At a full strafe the planted foot's fore/aft
    // position is dead constant and only the swinging one crosses over to the back split — which is
    // what stops the two legs walking through each other at the crossing.
    const z = ANKLE_Z + (plan.z - ANKLE_Z) * b * strideK * (1 - latAmt) +
      (lp ? (lp.z - ANKLE_Z) * b * latAmt : 0);
    // The sole keeps the run's roll, much flattened for a side-step (`latSoleK`). The roll is not
    // only a look: it is what sets the ankle's height over the deck (see `ankleForSole`).
    const sole = plan.sole * b * latSoleK;
    // A planted sole's height follows from its angle rather than being interpolated
    // towards, and a swinging one is never allowed below that same height, so a
    // part-way-blended run keeps its foothold exactly on the ground on the way in
    // instead of scuffing through the last few degrees of the transition.
    const floor = ankleForSole(sole);
    // The vertical: the sagittal solve's own, or the strafe's — which reaches SIDEWAYS, so its
    // swinging foot's height is authored as a clearance over the deck and the leg's span falls out
    // of it (see `LATC.swingLift`).
    const ankleSag = plan.stance ? floor : ANKLE_Y + (plan.ankle - ANKLE_Y) * b;
    let x = 0;
    let ankleLat = ankleSag;
    if (lp) {
      // ...relative to the THIGH's own origin, which the pelvis' own shift (`latSway`) has moved.
      x = latSign * lp.x * b * latAmt - latSway;
      const latAnkle = lp.stance ? floor : floor + lp.lift;
      ankleLat = ANKLE_Y + (latAnkle - ANKLE_Y) * b;
    }
    const ankle = Math.max(ankleSag * (1 - latAmt) + ankleLat * latAmt, floor);
    let ik = legIK(z, ankle - hip);
    let abduct = 0;
    if (lp) {
      // The strafe's own solve: the abduction that puts the ankle on its station, and the vertical
      // the sagittal solve then has to reach so the foot lands THERE (see `latLegIk`).
      const solve = latLegIk(x, hip - ankle, ANKLE_X * side);
      abduct = solve.abduct;
      ik = legIK(z, solve.yN);
    }
    upper.rotation.x = ik.thigh;
    // Only the swinging leg's knee flares out: a planted one is rolled back to
    // level, because any roll at the hip lifts the sole off the ground it is
    // supposed to be standing on (the foot's own hinge cannot put the height back).
    // The strafe does not need the splay at all: its feet are placed on their own stations.
    upper.rotation.z = lateral ? abduct : (plan.stance ? 0 : splay) + abduct;
    lower.rotation.x = ik.knee;
    foot.rotation.x = sole - ik.thigh - ik.knee;
    // ...and the abduction is taken back out at the ankle for the same reason the pelvis' roll is:
    // a rolled sole's outer edge is what would hover or dig.
    foot.rotation.z = (plan.stance ? -pelvRoll : 0) - abduct;
  }

  // Trunk: lean hard into the run (harder the faster you go) and counter-rotate
  // against the pelvis. The shoulders lead the hips the other way, and the gap
  // between the two is what you read from in front and from behind — from the side
  // none of it is visible, which is why it is levered separately from the arms.
  const tw = runCurve(RUNC.twist, p) * RUNC.twistAmt * b * (1 - LOCK_TWIST_K * latAmt);
  const lean =
    runCurve(RUNC.lean, p) * (0.65 + 0.80 * speedFrac) * b *
    (1 - LOCK_LEAN_K * latAmt - LOCK_BACK_LEAN_K * backAmt);
  // Sign: at this phase the LEFT leg is forward, so the left hip leads forward and
  // the left shoulder swings BACK — the pelvis and the chest shear past each other.
  // `twistLever` and `shoulderYaw` are measured from the pelvis, so the shoulders'
  // swing past the pelvis is the sum of the two; the head cancels most of both so
  // the face keeps looking down the track while the chest turns under it.
  bones.hips.rotation.y = tw * RUNC.twistLever;
  bones.hips.rotation.z = pelvRoll;
  bones.torso.rotation.x = lean;
  bones.torso.rotation.y = -tw * RUNC.shoulderYaw;
  // ...and SHIFT LOCK's own LEAN (`bank`) rides the trunk with the twist's roll: it is the sideways
  // lean into a strafe or a backpedal, and the waist is where it has to live — the hips are the
  // root the legs hang from, so any roll above them (here, or on the whole rig) is a roll the feet
  // have to be paid back for, and this one costs the deck nothing at all.
  bones.torso.rotation.z = tw * RUNC.torsoRoll + bank;
  bones.head.rotation.x = -lean * RUNC.headPitch;
  bones.head.rotation.y = tw * RUNC.headRoll;
  // The head comes back to level under that lean, the same way it cancels the run's twist: the face
  // is what the player is looking down the crosshair with, so it keeps the horizon. The share it
  // takes is `RUNC.headPitch`, and the number there is MEASURED on the composed rig rather than
  // read off the angles — see the note on it (and on `poseNeckSplit`) for why `1 - k` is not what
  // the face ends up with, and for the session-172 report this fixes.
  bones.head.rotation.z = tw * RUNC.headRoll - bank * LOCK_HEAD_K;
  // The pelvis mesh only: it is not a joint, so tilting it cannot lift a planted
  // sole, and the hip line counter-sloping the shoulders is what gives the twist
  // its corkscrew read from directly behind.
  if (bones.pelvisMesh) bones.pelvisMesh.rotation.z = tw * RUNC.pelvisRoll;
  // The trunk stretches on the way up into the flight and compresses as it
  // lands, in step with the bounce. Scaled about the hip, so any planted foot
  // is unaffected. (Also eased in from 1, so the rest pose is untouched.)
  const st = ((hipRun - HIP_MID) / HIP_HALF) * b;
  bones.torso.scale.set(1 - 0.035 * st, 1 + 0.065 * st, 1 - 0.035 * st);

  // Arms pump opposite the legs, elbows held closed and closing further as each
  // hand drives forward. Each arm also crosses in towards the chest's midline on
  // its drive and swings wide on its recovery — the second half of what makes the
  // run read from in front, and the part the shoulders' own yaw cannot supply,
  // since that moves the whole arm sideways with the chest rather than across it.
  const armK = 1 - LOCK_ARM_K * latAmt;
  const swingL = runCurve(RUNC.swing, p) * b * armK;
  const swingR = runCurve(RUNC.swing, p + 0.5) * b * armK;
  // ...and a strafe's arms do not pump sideways either: they TRAIL the step, both of them over on
  // the side the body is leaving, with a little of the step's own rhythm on top (see `LATC`). Both
  // arms take the same signed value: the two arm bones share the rig's frame, so one number moves
  // both hands the same way in the world.
  const latArm = -latSign * latAmt * b * (LATC.armTrail + LATC.armPump * Math.sin(p * Math.PI * 2));
  bones.armUpperL.rotation.x = swingL;
  bones.armUpperR.rotation.x = swingR;
  bones.armUpperL.rotation.z = RUNC.armTuck * b + RUNC.armCross * Math.max(0, -swingL) + latArm;
  bones.armUpperR.rotation.z = -(RUNC.armTuck * b + RUNC.armCross * Math.max(0, -swingR)) + latArm;
  bones.armLowerL.rotation.x = -runCurve(RUNC.elbow, p) * b;
  bones.armLowerR.rotation.x = -runCurve(RUNC.elbow, p + 0.5) * b;

  // ...and then the RIGHT one can stop being the run's. `chargeArm` is how much of THE BLOCK's own
  // arm a running body wears — up and ACROSS the eyes (`RUN_ARM`, below) instead of pumping.
  //
  // THE GAME NO LONGER ASKS FOR IT: `player.js` passes 0, and the block writes that arm itself in
  // `poseBlock` — its `moving` argument puts exactly these four channels on a body the run is
  // carrying (`blockArm(1)` IS `RUN_ARM`) and leaves the run pumping the other arm. One owner is
  // what makes the second brief agree with itself: *"if the player held m1 and m2 at the same time
  // and is running put the player right arm over his eye if else make the player arm normal next to
  // him like the normal running animtion"*. The seam is kept because it is still the honest way to
  // ask for the other shape on a running body — and because the numbers below are measured on it.
  //
  // At 1 the arm is the block's and at 0 it is exactly the cycle's own: it is a LERP OF THE TWO
  // TARGETS (`mix`, below) rather than an approach towards one, so the number reads as *how much of
  // that arm* and never as a rate — and so that at 0 the four channels really are the exact values
  // written above, not merely close. The frames between are the arm travelling the short way from
  // one to the other while riding the same `b` every other part of the cycle rides. The LEFT arm is
  // deliberately not touched: the run keeps pumping it, which is what makes the pair read as a body
  // running with one arm up rather than as a body that has stopped running to hold a pose.
  const ca = b * (chargeArm > 1 ? 1 : chargeArm < 0 ? 0 : chargeArm);
  if (ca > 0.002) {
    const a = RUN_ARM;
    const mix = (cur, tgt) => cur + (tgt - cur) * ca;
    bones.armUpperL.rotation.x = mix(bones.armUpperL.rotation.x, a.x * POSEX);
    bones.armUpperL.rotation.z = mix(bones.armUpperL.rotation.z, -a.out * POSEX);
    bones.armUpperL.rotation.y = mix(bones.armUpperL.rotation.y, a.twist * POSEX);
    bones.armLowerL.rotation.x = mix(bones.armLowerL.rotation.x, a.elbow * POSEX);
  }

  // Fists. The hands shut as the run blends in — a fist is a running pose, not a
  // standing one — and squeeze a touch tighter on the drive, the way the arm
  // pumps. `digits` holds the four fingers (which bend twice) and the thumb.
  const close = b <= 0 ? 0 : b >= 0.55 ? 1 : b / 0.55;
  const grip = close * close * (3 - 2 * close);
  for (const f of bones.digits || []) {
    const tight = grip * (0.88 + 0.12 * Math.abs(runCurve(RUNC.swing, f.side < 0 ? p : p + 0.5)));
    f.knuckle.rotation.z = -(f.thumb ? FIST.thumb : FIST.knuckle) * tight * f.side;
    if (f.mid) f.mid.rotation.z = -FIST.mid * tight * f.side;
  }

  // ...and the thighs' order handed back (see the lateral channel above): the same ORIENTATION,
  // re-decomposed into `XYZ`, so nothing after this in the frame can tell the run ever borrowed it.
  if (lateral) {
    if (thighL) { thighL.rotation.setFromQuaternion(thighL.quaternion, "XYZ"); }
    if (thighR) { thighR.rotation.setFromQuaternion(thighR.quaternion, "XYZ"); }
  }
}

// ---------------------------------------------------------------------------
// The slide. A slide is a POSE, never a squash: an earlier version scaled the body
// to 58% height and 116% width to fake a crouch, which reads as the character
// being squeezed rather than sliding. So this throws the body into the pose
// instead — hips dropped to the deck, both legs shot out low, the trailing arm
// braced down and back and the head up, watching where it is going.
//
// It is authored to be read from the CHASE CAMERA, because that is the only view
// the player ever gets of it. From directly behind, legs thrown straight ahead of
// the pelvis vanish behind the torso and the whole thing reads as a crouch; so the
// two legs fan WIDE into a long low V — that silhouette is the pose. The leading
// leg reaches out almost straight with its sole skimming the deck, the trailing leg
// folds under with the knee low and the toe tucked, the trunk rocks back over the
// hips and the head counter-rotates to stay level.
//
// How far the hips can drop is set by the trailing leg: the folded knee's trouser
// volume is what scrapes the ground first, so every foot height below is solved
// against the model's own mesh (see the slide note in src/README.md) rather than
// picked by eye — a pose this low has no room for numbers that are merely close.
//
// `u` runs 0 to 1 and every joint is eased from whatever `poseRun` just left
// (the run pose while you are still slowing down, the rest pose once the run
// blend is out), so it cross-fades in and out instead of snapping.
//
// Conventions, per `legIK`/`poseRun`: `rotation.x` positive folds a knee and
// negative swings a thigh forward; `rotation.z` splays a leg away from the
// midline; `armUpper.rotation.x` positive is the arm going BACK; `torso.rotation.x`
// positive leans the trunk forward (so a slide rocks it back with a negative one)
// and `torso.rotation.z` positive drops the character's LEFT shoulder.
//
// The one hand on the ground is the pose's anchor, and it is SOLVED rather than
// eyeballed: the trunk roll drops the plant shoulder and the arm's four angles are
// then searched against the live mesh until the palm's lowest vertex lands on the
// deck beside the hip (the numbers in src/README.md's slide note record the sweep).
// Everything else in the pose exists to get that hand down.
//
// These numbers are authored at their FINAL, already-toned-down value. A contact
// constraint cannot ride the POSEX exaggeration dial — move the dial and the hand
// leaves the ground — so this pose eases with `raw` throughout and POSEX is simply
// not its business. Every other action pose still rides the dial.
//
// The pose is a STILL — one authored shape held for the whole slide. The motion a slide
// needs is bought with VFX instead of a pose cycle (`effects.slideSpray`, driven from
// player.js off the speed the slide is actually carrying): a cycle has to move something,
// and every part of this pose is either a contact, a reach that a contact's height is
// measured against, or a silhouette the chase camera reads — so the cheapest honest place
// to put the travel is a spray of grit off the deck.
// ---------------------------------------------------------------------------

const SLIDE = {
  hipDrop: 0.562,
  hipRoll: -0.12,
  // Leading (right) leg: reaches out ahead, foot F L A T and skimming (the lunge half of the
  // kneel), so the whole leg is a long line from the hip to the deck.
  leadZ: 0.76,
  leadY: 0.264,
  leadSole: -0.06,
  leadSplay: 0.28,
  // Trailing (left) leg: folded under and behind, KNEE down on the deck (a knee-slide reads
  // from behind where a folded ankle does not) with the trailing toe tucked back and up.
  trailZ: -0.22,
  trailY: 0.314,
  trailSole: 0.95,
  trailSplay: -0.30,
  // Trunk: rocked back over the hips and rolled onto the plant side.
  torsoX: -0.26,
  torsoZ: 0.559,
  headX: 0.18,
  headZ: -0.16,
  // Plant (left) arm: solved against the mesh so the palm rides the deck under the shoulder.
  plantX: 0.853,
  plantY: 0.811,
  plantZ: -0.608,
  plantElbow: 0.013,
  plantGrip: 0.22,
  // Lead (right) arm: folded up and out, clear of the chest, fist shut.
  leadArmX: -0.95,
  leadArmY: 0.00,
  leadArmZ: 0.40,
  leadElbow: -1.25,
  leadGrip: 0.90,
};

function poseSlide(bones, u) {
  const k = u <= 0 ? 0 : u >= 1 ? 1 : u;
  const ease = k * k * (3 - 2 * k);
  const raw = (obj, axis, target) => {
    obj.rotation[axis] += (target - obj.rotation[axis]) * ease;
  };

  // Hips: drop the pelvis most of the way to the ground and roll onto the trailing hip.
  const hip = HIP_Y - SLIDE.hipDrop * ease;
  bones.hips.position.y += (hip - bones.hips.position.y) * ease;
  raw(bones.hips, "y", 0);
  raw(bones.hips, "z", SLIDE.hipRoll);

  // Legs. Each is planned by where its ANKLE has to sit — how far fore or aft (`z`) and how
  // high off the deck (`y`) — and then solved with the two-bone IK, so a foot lands where the
  // plan says whatever the hip height or the splay does. The splay (`rotation.z`) is what the
  // chase camera reads: the leading leg opens out to its own side, the trailing leg folds in
  // under the hip and swings out to the other, and the pair makes the long low V.
  //
  // The splay is a roll of the whole leg about its own forward axis, and a roll shortens the
  // leg's *vertical* reach by cos(roll) — left uncorrected, a leg fanned 35 deg off the midline
  // hovers a good fraction of a shin above the deck, which is exactly what a slide hides least.
  // So the planned drop is divided back out by the same cosine.
  const leadZ = SLIDE.leadZ;
  const trailZ = SLIDE.trailZ;
  const trailSole = SLIDE.trailSole;
  for (const [upper, lower, foot, zT, yT, soleT, splayT] of [
    [bones.legUpperL, bones.legLowerL, bones.footL, trailZ, SLIDE.trailY, trailSole, SLIDE.trailSplay],
    [bones.legUpperR, bones.legLowerR, bones.footR, leadZ, SLIDE.leadY, SLIDE.leadSole, SLIDE.leadSplay],
  ]) {
    const z = ANKLE_Z + (zT - ANKLE_Z) * ease;
    const ay = ANKLE_Y + (yT - ANKLE_Y) * ease;
    const sole = soleT * ease;
    const roll = splayT * ease;
    const ik = legIK(z, (ay - hip) / Math.max(0.30, Math.cos(roll)));
    raw(upper, "x", ik.thigh);
    raw(upper, "z", roll);
    raw(lower, "x", ik.knee);
    raw(foot, "x", sole - ik.thigh - ik.knee);
    raw(foot, "z", 0);
  }

  // Trunk: rocked back over the legs and rolled onto the plant side, which is what lowers the
  // plant shoulder far enough for the arm to reach the deck. The head takes most of both back
  // out so the face keeps looking down the track.
  raw(bones.torso, "x", SLIDE.torsoX);
  raw(bones.torso, "y", 0);
  raw(bones.torso, "z", SLIDE.torsoZ);
  bones.torso.scale.x += (1 - bones.torso.scale.x) * ease;
  bones.torso.scale.y += (1 - bones.torso.scale.y) * ease;
  bones.torso.scale.z += (1 - bones.torso.scale.z) * ease;
  raw(bones.head, "x", SLIDE.headX);
  raw(bones.head, "y", 0);
  raw(bones.head, "z", SLIDE.headZ);
  if (bones.pelvisMesh) raw(bones.pelvisMesh, "z", 0);

  // Arms: the trailing (left) hand is the plant — searched against the mesh so the palm's low
  // edge rides the deck beside the hip — while the leading (right) arm folds up and OUT, clear
  // of the chest, because a forearm that crosses in front of the torso reads as clipped
  // geometry from the chase camera. The plant hand stays open (spread on the deck, which is
  // what a brace looks like) and the lead hand is a fist.
  raw(bones.armUpperL, "x", SLIDE.plantX);
  raw(bones.armUpperL, "y", SLIDE.plantY);
  raw(bones.armUpperL, "z", SLIDE.plantZ);
  raw(bones.armLowerL, "x", SLIDE.plantElbow);
  raw(bones.armUpperR, "x", SLIDE.leadArmX);
  raw(bones.armUpperR, "y", SLIDE.leadArmY);
  raw(bones.armUpperR, "z", SLIDE.leadArmZ);
  raw(bones.armLowerR, "x", SLIDE.leadElbow);
  for (const f of bones.digits || []) {
    const tight = f.side < 0 ? SLIDE.plantGrip : SLIDE.leadGrip;
    const t = f.thumb ? Math.min(1, tight) * 0.62 : tight;
    f.knuckle.rotation.z += (-(f.thumb ? FIST.thumb : FIST.knuckle) * t * f.side - f.knuckle.rotation.z) * ease;
    if (f.mid) f.mid.rotation.z += (-FIST.mid * t * f.side - f.mid.rotation.z) * ease;
  }
}

// ---------------------------------------------------------------------------
// The idle. A relaxed stand with both hands tucked into the front trouser pockets.
//
// Numbers here are not taste, they are measured off the reference turnaround the pose was
// asked for, in this rig's own units: the elbows hang directly under the shoulders at
// |x| = 0.21 (the point of the pose — they are *tucked*, not flared, which is what the
// rest pose and the run cycle both do), the upper arm is a hair off vertical, the
// forearms fall almost straight down with ~35 deg of elbow flex (so `elbow` rotates less
// than half of what a running arm does), and the hands land at the top of the thigh
// (|x| = 0.18, y = 0.82) pushed in far enough that the hand's own volume ends up half
// inside the trouser leg and only the wrist shows. The hand is what sells "in the
// pocket", so the fingers stay half-closed (`grip`) and the palm is aimed down-and-in.
//
// Why the shoulder's own twist (`upperY`) is needed: the elbow hinges on a single axis,
// so with a straight forearm the hand can only sweep one circle — and that circle never
// reaches across the front of the hip. The reference pose gets there by rotating the
// upper arm about its own length (internal rotation), which is exactly this axis. The
// run cycle never touches it, which is why `poseRun` resets it (see there).
//
// `u` runs 0 to 1 and every joint is eased from whatever `poseRun` (and then `poseIdle`
// on the way out) left, exactly like `poseSlide`, so the pose cross-fades in as you come
// to a stop and back out as you walk off. `t` is seconds, because the pose breathes —
// arms riding the chest, hips rising on the inhale — and a dead-still idle in a
// third-person game reads as a paused screenshot rather than a body.
//
// The LEGS are the one part of the idle that reads the world rather than a number: each boot is
// solved down onto the deck it is actually standing over (`ground`, measured per frame by the player
// — see "THE IDLE'S FEET" in player.js), so a body on uneven ground bends a knee instead of standing
// on the terrain like a parked model.
// ---------------------------------------------------------------------------

const IDLE = {
  hipY: 0.995,     // a hair of knee flex: legs locked dead straight read as a mannequin
  stance: 0.050,   // leg splay per side — the reference stance is a little under shoulder width
  toeOut: 0.100,   // feet turned out, the cheapest thing that makes a stance read as relaxed
  lean: 0.100,     // slight forward lean of the trunk
  hipTilt: 0.050,  // the pelvis MESH's cosmetic tilt (not a joint): hip line vs shoulders
  headYaw: -0.060, // head turned a touch to his left, so he is looking at something
  clamp: 0.85,     // how much of the trunk's lean the head takes back out (keeps the face level)
  upperX: 0.151, upperY: 0.362, upperZ: 0.176, elbow: -0.571, grip: 0.50,
  breath: 0.004,   // hips rise/fall with the breath, authored units
  chest: 0.006,    // and the chest's own scale, about the hip, so no planted foot moves
  sway: 0.008,     // the arms' own ride on the breath
  breathRate: 1.5, // radians/second — about a 4.2 s breath
  stepDrop: 0.09,  // how far the pelvis may sink toward a foot that is standing LOWER than the body's
                   // own deck — see the feet note in `poseIdle`. It is small on purpose and it still
                   // reads big: at `hipY` the legs are 99.4% extended (the rig's thigh plus shank is
                   // 0.775 and the hip stands 0.775 above the ankle), and a solve that close to
                   // straight turns a centimetre of sink into tens of degrees of knee. It is also the
                   // exact limit of what a hanging boot can reach, to the millimetre — the foot is
                   // solved `sink` further down and the pelvis came down by `sink` to pay for it — so
                   // this one number is both "how deep a crouch may the idle fall into" and "how far
                   // below the deck may a boot dangle" (measured: 0.09 rig = 0.122 world at the rig's
                   // 1.351 scale, so a boot at the lip of the city's 0.64 decks hangs 12 cm).
  footPoint: 0.55, // toe-down for a boot that is hanging past its reach, radians at the foot hinge.
                   // This is the cheap half of the dangle and the reason `stepDrop` can stay small: a
                   // boot cannot get its ANKLE any lower than the dropped pelvis allows, but it can
                   // point, and pointing drops the toe by `SOLE_TOE·sin(point)·scale` — 0.176 · the arc
                   // · 1.351, so about 0.11 world at full point, which is as much dangle as the whole
                   // pelvis sink buys and costs the body nothing. It is also simply what a foot over
                   // nothing does (see the leg loop): a planted sole stays flat, a dropped one points.
  footPointK: 1.6, // radians of point per rig unit of hang PAST the reach — i.e. past `stepDrop`.
};

function poseIdle(bones, u, t = 0, ground = null) {
  const k = u <= 0 ? 0 : u >= 1 ? 1 : u;
  const ease = k * k * (3 - 2 * k);
  const to = (o, axis, v) => { o.rotation[axis] += (v - o.rotation[axis]) * ease; };
  const breath = Math.sin(t * IDLE.breathRate);

  // Hips: standing height, riding the breath — plus the FEET's own answer (see below): a foot that is
  // standing lower than the body's deck takes the pelvis down with it, which is what makes a boot
  // hanging over an edge reach down instead of floating level with the boot on the deck.
  const stepLo = ground ? Math.min(ground[0], ground[1]) : 0;
  const sink = Math.max(stepLo, -IDLE.stepDrop) * ease;
  const hip = IDLE.hipY + sink + breath * IDLE.breath * ease;
  bones.hips.position.y += (hip - bones.hips.position.y) * ease;
  to(bones.hips, "y", 0);
  to(bones.hips, "z", 0);

  // Legs: ankle under the hip, sole flat, each leg splayed out to its own side with the
  // foot rolled back to level at its own hinge (any roll left in at the hip lifts the
  // planted sole) and toed out. The IK is solved against the *breathing* hip height, so
  // the feet never move.
  //
  // `ground[i]` — signed, in the RIG's own units (the player divides the world's answer by the rig's
  // scale before handing it over) — is how far the deck under THAT foot sits above the deck the
  // body is standing on, measured per frame off the world by the player (see "THE IDLE'S FEET" in
  // player.js, which owns the query). It is the whole reason this pose is allowed to look at the
  // terrain: the boot is solved down onto the deck it is actually over, so one foot on a step bends
  // that knee and the other leg stays long. It enters through the ankle's own height, so the existing
  // solve does the bending — there is no second pose, no IK mode, and a leg that cannot reach simply
  // straightens, because `legIK` clamps its own reach.
  //
  // A foot that a step DID reach keeps the flat sole the solve gives it (see `foot`, and the
  // `ankleForSole` note above). A foot that ran out of leg hangs, and a hanging boot points: `-step -
  // IDLE.stepDrop` is how far past its reach the deck under it sits, and that is fed straight into the
  // hinge. So the sole is flat on a step it can stand on and toe-down over a drop — which is the whole
  // difference between a boot planted on the lip and a boot hanging off it (measured: at the full
  // clamp the boot's toe comes 0.11 world lower than its flat sole did, which is what makes a dangling
  // boot read as heavy rather than as a boot that missed the ground).
  for (const [upper, lower, foot, splay, step] of [
    [bones.legUpperL, bones.legLowerL, bones.footL, -IDLE.stance, ground ? ground[0] : 0],
    [bones.legUpperR, bones.legLowerR, bones.footR, IDLE.stance, ground ? ground[1] : 0],
  ]) {
    const ik = legIK(ANKLE_Z, ankleForSole(0) + step - hip);
    const slack = -step - IDLE.stepDrop;
    const point = slack > 0 ? Math.min(IDLE.footPoint, slack * IDLE.footPointK) : 0;
    to(upper, "x", ik.thigh);
    to(upper, "z", splay);
    to(lower, "x", ik.knee);
    to(foot, "x", -ik.thigh - ik.knee + point);
    to(foot, "z", -splay);
    to(foot, "y", splay > 0 ? IDLE.toeOut : -IDLE.toeOut);
  }

  // Trunk: upright with a slight lean, chest filling and emptying. The head takes most of
  // the lean back out so the face stays level.
  to(bones.torso, "x", IDLE.lean);
  to(bones.torso, "y", 0);
  to(bones.torso, "z", 0);
  bones.torso.scale.x += (1 - bones.torso.scale.x) * ease;
  bones.torso.scale.y += (1 + IDLE.chest * breath * ease - bones.torso.scale.y) * ease;
  bones.torso.scale.z += (1 - bones.torso.scale.z) * ease;
  if (bones.pelvisMesh) to(bones.pelvisMesh, "z", IDLE.hipTilt);
  to(bones.head, "x", -IDLE.lean * IDLE.clamp + IDLE.chest * breath);
  to(bones.head, "y", IDLE.headYaw);
  to(bones.head, "z", 0);

  // Arms: both hands into the front pockets, riding the breath out and back.
  const sway = IDLE.sway * Math.sin(t * IDLE.breathRate + 0.6);
  for (const [upper, lower, s] of [
    [bones.armUpperL, bones.armLowerL, 1],
    [bones.armUpperR, bones.armLowerR, -1],
  ]) {
    to(upper, "x", IDLE.upperX);
    to(upper, "y", IDLE.upperY * s);
    to(upper, "z", (IDLE.upperZ + sway) * s);
    to(lower, "x", IDLE.elbow);
  }
  for (const f of bones.digits || []) {
    to(f.knuckle, "z", -(f.thumb ? FIST.thumb : FIST.knuckle) * IDLE.grip * f.side);
    if (f.mid) to(f.mid, "z", -FIST.mid * IDLE.grip * f.side);
  }
}

// ---------------------------------------------------------------------------
// Action poses.
//
// `poseRun` is the base every one of these layers on top of: it is called every
// frame with whatever run blend is live (0 in the air, which is the rest pose),
// and each pose then eases its own joints toward its targets from whatever that
// left behind — the same pattern `poseSlide` and `poseIdle` already use. The
// poses are keyed to mutually exclusive states, so only one is ever live and the
// blends in player.js cross them in and out over a few frames.
//
// Every angle here is authored EXAGGERATED — limbs thrown well past where they
// "should" stop, so the shape reads at gameplay distance — and then scaled by
// POSEX on the way out. POSEX is the global "tone the exaggeration down 20%"
// dial: turn it up to push every action pose at once, down to calm them all.
// ---------------------------------------------------------------------------

const POSEX = 0.8;

function poseEase(k) {
  const t = k <= 0 ? 0 : k >= 1 ? 1 : k;
  return t * t * (3 - 2 * t);
}

function poseRot(bones, name, axis, target, e) {
  const b = bones[name];
  if (b) b.rotation[axis] += (target * POSEX - b.rotation[axis]) * e;
}

// ...and an ADDITIVE write (session 183), for a layer worn over a body that ANOTHER pose is already
// driving. `poseRot` approaches an absolute angle, which is what a pose wants — but an action played
// on a RUNNING body has to add to what the trunk is already doing: the run authors 0.68 rad of trunk
// lean, so a throw that wrote its own absolute lean would stand the body up as its layer faded in
// (the exact bug session 180 fixed in `poseCarry`'s trunk writes). This offsets instead — POSEX and
// all — so a throw thrown at a sprint leans INTO the run.
function poseAdd(bones, name, axis, delta, e) {
  const b = bones[name];
  if (b) b.rotation[axis] += delta * POSEX * e;
}

function poseHipY(bones, y, e) {
  bones.hips.position.y += (y - bones.hips.position.y) * e;
}

// ---------------------------------------------------------------------------
// THE NECK'S SHARE (the user's *"add neck wrest bone for the player animations"* — session 155).
//
// Every pose in this file writes the HEAD's own local rotation, exactly as it always did, and none
// of them knows the neck exists. What the neck does is take a SLICE of that rotation back down onto
// itself: this runs ONCE per frame, after every pose layer has had its say (the same bargain
// `poseStretchApply` makes, and it is called right beside it — see `neckApply` on the rig), and it
// hands `NECK_SPLIT` of the head's rotation to the neck.
//
// It is a ROTATION SPLIT ABOUT THE HEAD'S OWN AXIS, not three per-axis scalings, and that is the
// whole reason it is safe to bolt onto a rig this tuned: `R(q·s)` below the neck and `R(q·(1-s))`
// above it compose to exactly `R(q)` — the same axis, so the two rotations commute — which means
// **the head's world orientation is bit-for-bit what the pose authored**. Every measurement the
// file has ever made about where the face is pointing still holds: the guard's forearm still covers
// the eye band, the clinch's solved hands still land on the skull, the head-bone contacts the knee
// and the whirl read the same point. What CHANGES is where the head's own pivot is: it now swings on
// a joint 0.11 rig units below the jaw, so the head leans out of the collar and the shoulder line
// stops reading as a hinge. That is the entire visual difference, and it is the one the user asked
// for — a head that turns in a NECK rather than a head welded to the trunk.
//
// ...WITH ONE CAVEAT, and it is a big one: that "bit-for-bit" holds for ONE frame at a time, not
// across a run of them. The split is idempotent because it re-reads `neck ∘ head` as the thing the
// pose asked for — but every pose RE-AUTHORS the head every frame while the neck keeps the share it
// was handed, so the next frame's split starts from (last frame's neck) ∘ (this frame's head). The
// recurrence `T -> s·T ∘ h` settles with `T` about **1 / (1 - s) = 1.5x** the authored rotation (the
// HEAD's own local rotation lands on the authored value and the NECK carries the rest), so in the
// live game a head rotation comes out ~50 % LARGER in the world than the pose wrote. Nothing in this
// file's tuning was measured any other way, so it is left as the rig's behaviour rather than
// "fixed" here: poses are authored to LOOK right on the composed rig, and `RUNC.headPitch` is the
// session-172 example of a constant adjusted for it (the run's head was craning 7 deg up over its
// own lean). A pose that squares the neck itself (`poseClimbPark`) starts each frame from zero and
// is therefore NOT amplified.
//
// `NECK_SPLIT` is how much of it the neck takes. A real cervical spine carries roughly a third of
// the head's total range (the other two thirds are the atlanto-occipital joint), which is what this
// is: **0.34**, so a 0.62 rad run-tip of the head is 0.21 of neck and 0.41 of skull. `LIE_ROLL_T`-
// style tuning is not wanted here — the number is anatomy, not taste, and a share big enough to
// read as a neck is a share big enough to swing the head off the rig's own collar.
const NECK_SPLIT = 0.34;
const _neckQ = new THREE.Quaternion();
const _neckAxis = new THREE.Vector3();
function poseNeckSplit(bones) {
  const n = bones && bones.neck;
  const h = bones && bones.head;
  if (!n || !h) return;
  // WHAT THE POSE ACTUALLY ASKED FOR is the whole of the rotation the head wears relative to the
  // chest — the neck's own share of it from last frame composed with the head's — read here as one
  // rotation (`neck ∘ head`). Reading the head alone would be reading the previous frame's split,
  // which is what makes this idempotent: the sum is what is re-split, so the neck's slice from the
  // frame before is not paid again, and a `poseBlend` cross-fade (which mixes the two bones
  // separately) is split from the mixed total rather than from a half-mixed head.
  _neckQ.copy(n.quaternion).multiply(h.quaternion);
  let qx = _neckQ.x, qy = _neckQ.y, qz = _neckQ.z, qw = _neckQ.w;
  // The shortest arc (`w` positive), so a pose that comes round past half a turn splits forward
  // rather than spinning the neck the long way to the same place. An identity rotation has no axis
  // to split about, and a rig at rest is left exactly at rest.
  if (qw < 0) { qx = -qx; qy = -qy; qz = -qz; qw = -qw; }
  const len = Math.hypot(qx, qy, qz);
  if (len < 1e-6) {
    n.rotation.set(0, 0, 0);
    h.rotation.set(0, 0, 0);
    return;
  }
  const angle = 2 * Math.atan2(len, qw);
  _neckAxis.set(qx / len, qy / len, qz / len);
  n.quaternion.setFromAxisAngle(_neckAxis, angle * NECK_SPLIT);
  h.quaternion.setFromAxisAngle(_neckAxis, angle * (1 - NECK_SPLIT));
}

// ---------------------------------------------------------------------------
// SQUASH AND STRETCH — the limb channel (the table is built in `buildStreetCharacter`).
//
// `poseStretch` ASKS for a limb to be drawn this many times its rest length (1 = the rest
// length) on this frame. Nothing is written here: the request is recorded, and spent once by
// `poseStretchApply` after every pose has had its say. A bone that nothing asked about eases
// back to 1 on its own, which is what makes a stretch an ACCENT — a few frames of a throw —
// rather than a state the rig has to be told to leave.
function poseStretch(bones, name, s) {
  const rec = bones.stretch && bones.stretch[name];
  if (rec) rec.want = s;
}

// ...and a whole LIMB, which is what a pose actually wants: the same factor through the chain,
// so what reads is one long limb with a joint in it rather than a long thigh on a normal shin.
// `kind` is "leg" or "arm"; `side` takes the same convention as `poseLegAngles` /
// `poseArmAngles` (`< 0` is the bone named `...L`, the character's own right — see `RK`).
function poseStretchChain(bones, kind, side, s) {
  const sfx = side < 0 ? "L" : "R";
  poseStretch(bones, kind + "Upper" + sfx, s);
  poseStretch(bones, kind + "Lower" + sfx, s);
}

// Spend the frame's stretch: one pass over the table, at the END of the pose dispatch, so every
// pose has asked first. `e` is the frame's pose ease, so a stretch comes in and goes out over
// the same handful of frames a handover does instead of popping.
function poseStretchApply(bones, e) {
  const t = bones.stretch;
  if (!t) return;
  const k = e < 0 ? 0 : e > 1 ? 1 : e;
  for (const name in t) {
    const rec = t[name];
    rec.s += (rec.want - rec.s) * k;
    rec.want = 1;
    if (rec.s > 0.9985 && rec.s < 1.0015) rec.s = 1;
    rec.mesh.scale.y = rec.s;
    for (const kid of rec.kids) kid.o.position.y = kid.y * rec.s;
  }
}

function poseSettleTorso(bones, e) {
  bones.torso.scale.x += (1 - bones.torso.scale.x) * e;
  bones.torso.scale.y += (1 - bones.torso.scale.y) * e;
  bones.torso.scale.z += (1 - bones.torso.scale.z) * e;
  if (bones.pelvisMesh) bones.pelvisMesh.rotation.z += (0 - bones.pelvisMesh.rotation.z) * e;
}

// `thigh` negative swings the thigh forward, `knee` positive folds it, `sole` positive is
// toe-down and `splay` is outward from the midline (symmetric, whichever leg it is).
function poseLegAngles(bones, side, thigh, knee, sole, splay, e) {
  const U = side < 0 ? bones.legUpperL : bones.legUpperR;
  const L = side < 0 ? bones.legLowerL : bones.legLowerR;
  const F = side < 0 ? bones.footL : bones.footR;
  U.rotation.x += (thigh * POSEX - U.rotation.x) * e;
  U.rotation.z += (side * splay * POSEX - U.rotation.z) * e;
  L.rotation.x += (knee * POSEX - L.rotation.x) * e;
  F.rotation.x += (sole * POSEX - F.rotation.x) * e;
  F.rotation.z += (0 - F.rotation.z) * e;
}

// `upX` negative swings the arm forward (past -PI/2 it is overhead), `upZ` is outward,
// `elbow` negative folds the forearm forward (a bicep curl), and `twist` rotates the upper
// arm about its own length — the one axis only the idle and the crouch touch.
function poseArmAngles(bones, side, upX, upZ, elbow, e, twist) {
  const U = side < 0 ? bones.armUpperL : bones.armUpperR;
  const L = side < 0 ? bones.armLowerL : bones.armLowerR;
  U.rotation.x += (upX * POSEX - U.rotation.x) * e;
  U.rotation.z += (side * upZ * POSEX - U.rotation.z) * e;
  if (twist !== undefined) U.rotation.y += (twist * POSEX - U.rotation.y) * e;
  L.rotation.x += (elbow * POSEX - L.rotation.x) * e;
}

function poseGrip(bones, tight, e) {
  for (const f of bones.digits || []) {
    const t = f.thumb ? Math.min(1, tight) * 0.62 : tight;
    f.knuckle.rotation.z += (-(f.thumb ? FIST.thumb : FIST.knuckle) * t * f.side - f.knuckle.rotation.z) * e;
    if (f.mid) f.mid.rotation.z += (-FIST.mid * t * f.side - f.mid.rotation.z) * e;
  }
}

// ...and the same for ONE hand. The block authors its RIGHT arm on its own (see `BLOCK` /
// `poseBlockArm`), so its two hands can no longer be clenched by one call: the right fist belongs
// to the arm that is always live, the left one only to the charge. `side` is the same convention
// `poseArmAngles` and `poseLegAngles` take (`< 0` is the `...L` bone — the character's own right,
// and the sign the digits' own `side` field carries, so they compare directly).
function poseGripSide(bones, side, tight, e) {
  const t0 = tight > 1 ? 1 : tight < 0 ? 0 : tight;
  for (const f of bones.digits || []) {
    if (f.side !== side) continue;
    const t = f.thumb ? t0 * 0.62 : t0;
    f.knuckle.rotation.z += (-(f.thumb ? FIST.thumb : FIST.knuckle) * t * f.side - f.knuckle.rotation.z) * e;
    if (f.mid) f.mid.rotation.z += (-FIST.mid * t * f.side - f.mid.rotation.z) * e;
  }
}

// THE WRIST — the hand's own bone (see `WRIST_Y`). A wrist has three axes and all three of them
// mean something to a hand on a weapon: `x` is the cock and the drop (the whip at the top of a
// swing, the lay-back at the bottom of one), `z` is the side-to-side break, and `y` is the twist
// that turns a flat palm onto a shaft. It is written exactly like `poseArmAngles` writes an
// elbow — an eased approach, POSEX-scaled — so a pose can key it and the base pose's own reset
// brings it home (see the wrist reset in `poseRun`).
function poseWrist(bones, side, x, z, y, e) {
  const H = side < 0 ? bones.handL : bones.handR;
  if (!H) return;
  H.rotation.x += (x * POSEX - H.rotation.x) * e;
  H.rotation.z += (side * z * POSEX - H.rotation.z) * e;
  if (y !== undefined) H.rotation.y += (side * y * POSEX - H.rotation.y) * e;
}

// ---------------------------------------------------------------------------
// CROUCH — two poses in one, cross-faded by `walk`.
//
// Both drop the hips most of the way to the deck, fold the knees out over the
// feet and hunch the trunk over them, with the head craned back up so he is still
// watching where he is going (a crouch that stares at its own knees reads as a
// bug, not as a stance). Standing still the hands rest on the thighs; moving, the
// same squat shuffles — short ankle placements, a small lift on the swinging
// foot, and the arms swinging just enough to say "walking", not "running".
//
// The legs are placed by IK off the ankle target rather than by angles, exactly
// like the run cycle, so the feet stay on the ground whatever the hip height
// does — and `ankleForSole` keeps the sole flat while they shuffle.
// ---------------------------------------------------------------------------

const CROUCH = {
  hipY: 0.665,
  lean: 0.60,
  head: -0.30,
  stance: 0.30,
  reach: 0.30,
  shuffle: 0.05,
  armX: -0.40,
  armZ: 0.30,
  elbow: -1.10,
  sway: 0.30,
};

function poseCrouch(bones, u, walk, phase, t) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const w = Math.max(0, Math.min(1, walk));
  const breath = Math.sin(t * 1.6) * 0.011 * (1 - 0.6 * w);
  const hip = CROUCH.hipY + breath;
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", -0.06 * w, e);

  const flat = ankleForSole(0);
  for (const [side, ph] of [[-1, phase], [1, phase + 0.5]]) {
    const c = Math.cos(ph * Math.PI * 2);
    const z = ANKLE_Z + CROUCH.reach * c * 0.5 * w;
    const lift = Math.max(0, Math.sin(ph * Math.PI * 2)) * CROUCH.shuffle * w;
    const ik = legIK(z, flat + lift - hip);
    const U = side < 0 ? bones.legUpperL : bones.legUpperR;
    const L = side < 0 ? bones.legLowerL : bones.legLowerR;
    const F = side < 0 ? bones.footL : bones.footR;
    U.rotation.x += (ik.thigh - U.rotation.x) * e;
    U.rotation.z += (side * CROUCH.stance * (1 - 0.35 * w) - U.rotation.z) * e;
    L.rotation.x += (ik.knee - L.rotation.x) * e;
    F.rotation.x += (0 - ik.thigh - ik.knee - F.rotation.x) * e;
    F.rotation.z += (0 - F.rotation.z) * e;
  }

  poseRot(bones, "torso", "x", CROUCH.lean, e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", -CROUCH.lean * 0.88, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);

  const swing = Math.sin(phase * Math.PI * 2) * CROUCH.sway * w;
  poseArmAngles(bones, -1, CROUCH.armX + swing, CROUCH.armZ, CROUCH.elbow, e, 0.10);
  poseArmAngles(bones, 1, CROUCH.armX - swing, CROUCH.armZ, CROUCH.elbow, e, 0.10);
  poseGrip(bones, 0.45, e);
}

// ---------------------------------------------------------------------------
// THE SKATEBOARD — the stance, and the three shapes it is worn in (session 200).
//
// The brief, verbatim: *"add skateboard and make me able to get on it and do flips with it and
// stuff u can take animations from the marketplace if you have to but make the slide mech and dive
// and all the stuff unqiue for it not the same make able to get on it by pressing E"*. The prop, the
// mount and the two mechanics that are NOT a ride live in `inventory.js` and `player/board.js`;
// this is the body.
//
// A SKATER DOES NOT STAND THE WAY HE TRAVELS, and that one fact is the whole pose. The deck's long
// axis runs down the travel line — the board's mesh is parented into `tiltG`, so the rig's own `+z`
// IS the nose — the two feet are planted ALONG it, and both feet point ACROSS it: the duck stance.
// So the PELVIS IS TURNED ACROSS THE DECK (`BOARD.yaw`, about 74°) and the shoulders counter-rotate
// back onto the line (`BOARD.torsoYaw`), and the two legs are solved SEPARATELY with real two-bone
// IK, because the front foot rides the front bolts and the back one the tail and those are two
// genuinely different shapes.
//
// ...and the yaw is also what makes the two leg channels read the OTHER WAY ROUND from every other
// pose in this file. With the pelvis across the deck, `rotation.z` (the ABDUCTION) spreads the feet
// along the BOARD and `rotation.x` (the SWING) places them across it. That is why the abduction has
// to be a real hip abduction rather than a thigh roll — the thighs run on `ZYX` while this pose is
// on the rig (the same borrow `poseDash` makes, for the same MEASURED reason: on the rig's `XYZ` a
// big roll swings the solved ankle off the deck by 3.7 cm on the dash's bent lead leg) — and it is
// why the abduction's roll is taken back out at the ankle (`F.rotation.z`) so the shoe stays flat on
// the deck while the leg fans out over it.
//
// THE SOLVE, once per foot, is exact rather than tuned:
//
//   1. the ankle's target is authored in the RIG's frame — how far along the deck (`z`), how far
//      across it (`x`), and how high off the deck (`ankle`, which is what lets the ollie's tuck lift
//      both feet and the push put one of them on the road);
//   2. that target is turned into the PELVIS's own frame (`pf` forward, `pl` lateral) by the yaw;
//   3. the leg's reach `L = |(pf, pl, dy)|` is split into the abduction (`asin(pl / L)` — the angle
//      of the hip's own fan) and the in-plane solve (`legIK(pf, -√(L² - pf²))`, whose second
//      argument is the reach's own vertical leg, so the two-bone triangle lands on the target
//      whatever the fan is doing). This is the `poseSlide` bargain one step further on: there the
//      cos correction of a roll was enough, here the abduction IS part of the target.
//
// `BOARD.hipX` is the hip joint's own offset from the pelvis' midline, read off the rig (the
// `legUpper*` bones' own `position.x`) rather than assumed — the fan is measured from the JOINT, and
// 0.105 rig units of unaccounted width is 6° of abduction.
//
// The three shapes worn on top of the stance are `poseRide` itself (the ride: the carve's lean, the
// manual's nose-lift, the push, the trick's tuck and the bail), `poseBSlide` — the deck put SIDEWAYS
// to its own line with the body's own answer to it (a deep, braced crouch and the trailing hand
// reaching back at the deck, which is what a powerslide looks like and is nothing like the on-foot
// slide's knee-and-palm skid) — and `poseBBomb`, the board's own dive: prone over the deck with the
// knees folded under and the arms swept back, thrown AT the deck rather than gliding forward like
// the flying dive (`poseDive`).
// ---------------------------------------------------------------------------

const BOARD = {
  // ---- the stance (all in RIG units and RADIANS — 1 rig unit is 1.351 the world's) ----
  // THE HEIGHTS ARE A SET, and `hipY` is the one they are all read against. It is the NEUTRAL
  // cruise: where the pelvis sits with the feet on the deck and nothing else going on, and every
  // other entry below is stated the same way (the pelvis' own height, not a difference), so a
  // stance's depth can be read off the block. 0.905 is a leg that is 48 degrees folded at the
  // knee (measured through the same `legIK`: the hip-to-ankle distance comes to 0.705 rig against
  // the 0.775 the two links add up to), which is a skater's own athletic crouch. The block was
  // first written at 0.735 — 93 degrees, a sitting squat that read as a man crouching ON the
  // board rather than riding it (measured, and seen in the skeleton render: the shins came out at
  // 21 degrees off vertical with the shoes under the pelvis). The ankle sits `ANKLE_Y` (0.225)
  // over the deck's plane and the ankle-to-hip drop standing is 0.77, so 0.905 is a full 0.09 of
  // knee over a standing leg and 0.19 under the rig's own standing hip height (0.995 in `IDLE`).
  hipY: 0.905,      // the pelvis' height above the deck's top face
  yaw: -1.5708,     // the pelvis turned ACROSS the deck. NEGATIVE is the REGULAR stance
                    // (his LEFT foot on the front bolts): a rig-negative yaw points the pelvis'
                    // own left at the rig's `+z`, which is the nose.
                    // ...AND IT IS THE WHOLE QUARTER TURN, not the 74 degrees a skater's shoulders
                    // sit at, and the model is why: the ankles hang `ANKLE_X` (0.2 rig units) out
                    // from the legs' own midline, so at exactly 90 degrees that stand-off points
                    // ALONG the deck and the two feet are spread nose-and-tail by the legs' own
                    // geometry — the roll `boardLeg` solves comes out at 0.000 rad for the front
                    // foot and 0.019 for the back (measured on the live rig), where any other yaw
                    // spends part of that 0.2 as ABDUCTION, and an abducted leg LIFTS its drawn
                    // ankle by `ANKLE_X · sin(phi)` — the shoes riding over the deck. It also
                    // squares the duck stance: the toes come out about 20 degrees off the deck's
                    // cross-line at the front and 15 the other way at the back, instead of the
                    // front foot pointing a third of the way at the nose.
  frontZ: 0.200,    // the front foot's station, along the deck (rig z, towards the nose)
  backZ: -0.190,    // ...and the back foot's
  frontX: 0.040,    // across the deck (rig x, positive towards his own left)
  backX: -0.050,    // ...
  duckF: 0.34,      // the feet's own toe-out: the front foot turned towards the nose...
  duckB: -0.26,     // ...and the back one towards the tail (the duck stance's own two angles)
  sole: 0.02,       // the sole's pitch (positive is toe-down)
  manualAng: 0.42,  // rad the nose is held off the ground at a full manual (M2)
  // ---- the body over it ----
  torsoYaw: 0.90,   // how much of the yaw the chest gives BACK (so the shoulders face the line:
                    // 52 of the pelvis' 90 degrees, which leaves the chest 38 off it — where a
                    // skater's shoulders actually ride, opened towards where he is going)
  torsoX: 0.30,     // the lean over the deck
  headYaw: 0.45,    // ...and the head's own share of it. A skater's pelvis faces the deck's SIDE
                    // and the neck has to carry the rest of the way round, or he is riding looking
                    // at his own shoulder: with the chest 38 degrees off the line (measured), 0.45
                    // rad of local yaw leaves the head ~4 degrees off it — the eyes on the road.
                    // It was -0.34, which turned the head AWAY from the line — 64 degrees off it,
                    // worse than the chest, the wrong side of the body's own twist.
  headX: -0.16,
  armX: -0.26,      // both arms: slightly forward and out, the way a body balances on a deck
  armZ: 0.36,
  elbow: -0.62,
  breath: 0.010,    // the stance is not still — the deck buzzes and the knees drink it
  lean: 0.34,       // how far a full-rate carve lays the BODY over (the deck lays over with it — the
                    // same read on the mesh, from `P.BOARD_LEAN`)
  // ---- the push (see `poseRide`'s `pushPh`) ----
  pushHip: 0.790,   // the pelvis at the bottom of a push: it drops over the standing leg as the
                    // other one reaches for the road. 0.115 under the neutral, which is what the
                    // reaching leg needs: its target is the ROAD (`BOARD_ROAD` below the deck's
                    // plane), so the hip-to-ankle drop at the bottom of the push is 0.66 — inside
                    // the 0.775 the leg has, where a dip any shallower would leave the leg asking
                    // for reach it does not own and the shoe floating over the road.
  pushX: 0.340,     // ...and that foot goes this far across (the rig's +x: the HEEL side, which
                    // is the side a push happens on — the toes point the other way)
  pushSole: 0.16,
  // ---- the trick (see `poseRide`'s `kind` / `ph`) ----
  popHip: 0.750,    // the pelvis on the tail (the pop's own crouch — 0.155 under the neutral)
  airAnkle: 0.330,  // the tuck: both ankles this high off the deck at the top of the airtime
  airHip: 0.950,    // ...with the pelvis gathered up over them (the knees come up, and this is
                    // the one height that is ABOVE the neutral: a tuck folds the legs SHORTER)
  airArm: 0.55,     // the arms open out at the tuck, which is what a catch looks like
  missHip: 0.720,   // THE BAIL: the deck shoots out and the body is left staggering in the road
};

// The flips. `roll` is whole turns about the deck's LONG axis (a kickflip is one, a heelflip the
// same turn the other way), `yaw` is whole turns about the deck's own vertical (a shuvit), `pop` is
// what share of `P.BOARD_POP` the tail gives this one, and `dur` how long its own clock runs — the
// caller reads all four off the rig (`boardTricks`), so the spin that is DRAWN and the airtime the
// physics gives it are one decision (see `startTrick` in player/board.js). `bodyTurn` is the BODY
// VARIAL's own revolution: the rig turns with the deck, which is the one trick the board cannot do
// by itself.
const BOARD_TRICKS = [
  { name: "OLLIE", roll: 0, yaw: 0, dur: 0.46, pop: 1.00, bodyTurn: 0, flick: 0 },
  { name: "KICKFLIP", roll: 1, yaw: 0, dur: 0.60, pop: 1.00, bodyTurn: 0, flick: -1 },
  { name: "HEELFLIP", roll: -1, yaw: 0, dur: 0.60, pop: 1.00, bodyTurn: 0, flick: 1 },
  { name: "SHUVIT", roll: 0, yaw: 0.5, dur: 0.46, pop: 0.92, bodyTurn: 0, flick: 0 },
  { name: "360 SHUVIT", roll: 0, yaw: 1, dur: 0.74, pop: 1.10, bodyTurn: 0, flick: 0 },
  { name: "BODY VARIAL", roll: 0, yaw: 0.5, dur: 0.70, pop: 1.02, bodyTurn: 1, flick: 0 },
  { name: "BACKFLIP", roll: 0, yaw: 0, dur: 0.72, pop: 1.25, bodyTurn: 0, flick: 0, flip: 1, grab: -1, lean: 0.30, hipDrop: 0.25, plant: 1 },
];
const BOARD_FLIPS = BOARD_TRICKS.length - 1;   // the OLLIE is row 0 and is not in the M1 cycle

// THE AIR TRICKS — the grabs. M1 in the AIR throws these, where M1 on the deck throws the flips
// above: that split is the whole of "ground tricks vs air tricks". A grab spins nothing (roll/yaw
// 0 — the deck stays under the feet, so a grab cannot MISS the way a flip can), and `grab` says
// which hand goes to the deck: 1 the lead hand, -1 the trailing one, 0 both. `dur` is the shape's
// own clock, the same one `startTrick` reads for a flip.
const BOARD_AIR = [
  { name: "INDY", roll: 0, yaw: 0, dur: 0.62, pop: 0, bodyTurn: 0, grab: -1 },
  { name: "MELON", roll: 0, yaw: 0, dur: 0.62, pop: 0, bodyTurn: 0, grab: 1 },
  { name: "METHOD", roll: 0, yaw: 0, dur: 0.78, pop: 0, bodyTurn: 0, grab: 1 },
  { name: "TAILGRAB", roll: 0, yaw: 0, dur: 0.70, pop: 0, bodyTurn: 0, grab: -1 },
  { name: "NOSEGRAB", roll: 0, yaw: 0, dur: 0.70, pop: 0, bodyTurn: 0, grab: 1 },
  { name: "MUTE", roll: 0, yaw: 0, dur: 0.70, pop: 0, bodyTurn: 0, grab: 1, lean: 0.45, hipDrop: 0.14 },
  { name: "STRAIGHT AIR", roll: 0, yaw: 0, dur: 0.58, pop: 0, bodyTurn: 0, open: 0.55, arch: -0.12 },
  { name: "BACKSIDE 360", roll: 0, yaw: 0, dur: 0.62, pop: 0, bodyTurn: 0, grab: -1, lean: 0.15, hipDrop: 0.08, spinDir: -1 },
  { name: "720", roll: 0, yaw: 0, dur: 0.95, pop: 0, bodyTurn: 0, grab: 0, hipDrop: 0.10, turns: 2 },
  { name: "CORKSCREW", roll: 0, yaw: 0, dur: 0.95, pop: 0, bodyTurn: 0, grab: 1, lean: 0.30, hipDrop: 0.20, plant: 1, flip: 1 },
];
const BOARD_AIR_COUNT = BOARD_AIR.length;

// HOW FAR THE ROAD IS BELOW THE DECK, in the RIG's own units: the body is raised by the board's
// height while riding (`P.BOARD_LIFT` in the world's units), and the rig is DRAWN at 1.351 (see
// `charMesh.scale`), so the deck's top face sits ~0.1443 rig units over the ground the wheels are on.
// The one number a push needs, because the pushing foot's target is the ROAD and not the deck. It is
// written as the DIVISION rather than as its own literal, so it tracks `BOARD_LIFT` by construction:
// when the lift was 0.15 this read 0.111, and session 201's bigger deck took it from 0.13 to 0.195.
const BOARD_ROAD = 0.234 / 1.351;

function boardTrickAt(i) {
  const n = BOARD_TRICKS.length;
  return BOARD_TRICKS[((i % n) + n) % n];
}

// An air row by its own index. The live trick carries ground/air in `trickKind` itself (air rows
// ride at `BOARD_AIR_BASE + i`), so the pose, the deck spin and the HUD all read one number.
const BOARD_AIR_BASE = 100;
function boardAirTrickAt(i) {
  const n = BOARD_AIR.length;
  return BOARD_AIR[((i % n) + n) % n];
}
function boardRowAt(kind) {
  return kind >= BOARD_AIR_BASE ? boardAirTrickAt(kind - BOARD_AIR_BASE) : boardTrickAt(kind);
}

// The hip joint's own offset from the pelvis' midline, read off the rig. The leg bones carry NO
// lateral offset of their own (measured: `legUpperL/R.position` is exactly `(0, 0, 0)`), so the
// two-bone solve is measured from the pelvis' own midline and this is 0 — it is read rather than
// assumed only because a rig that ever moves a hip joint must move the solve with it. The wide ANKLES
// the model draws (the feet hang `ANKLE_X` out from the shins — that is the stance width) are geometry
// BELOW the solve and are carried by `boardLeg`'s own `off` term, exactly as `wallFoot` carries them.
function boardHipX(bones) {
  const b = bones.legUpperR || bones.legUpperL;
  const x = b && b.position ? Math.abs(b.position.x) : 0;
  return x > 0.001 ? x : 0;
}

// Scratch for the board's own quaternion solve (one per leg, no allocation).
const _bdE = new THREE.Euler();
const _bdQ = new THREE.Quaternion();

// ONE FOOT of the stance, solved. `side` is `poseLegAngles`' own convention (`< 0` is the bone named
// `...L`, which is the character's RIGHT — see `RK`), `hx` the hip JOINT's own lateral offset from the
// pelvis' midline (see `boardHipX` — 0 in this rig, and carried so a rig that moves its hip joints
// moves the solve with it), `x`/`z` the ankle's target in the rig's frame, `ankle` its height above
// the deck's top face, `sole` the sole's pitch and `duck` the foot's own toe-out. `e` is the frame's
// fade, so the whole stance is one eased approach and a fade of 1 lands it exactly.
//
// THE PARAMETER LIST IS PART OF THE SOLVE AND WAS ONCE OFF BY ONE. `hx` was missing from the head of
// this function while all three call sites passed it, so every argument behind it shifted: `yaw` took
// the hip offset (0), `x` took the yaw, `z` took the front station, `ankle` took the station's height
// and `hip` took the ANKLE's — and the roll came out at -1.706 rad instead of 0.008 (measured on the
// live rig), which threw both legs sideways to hang out at rig z -0.76 with the shoes a hand's width
// off the deck. A one-argument typo, and the feet are nowhere near the board; that is why every
// station in the block below is verified against a measurement rather than reasoned about.
//
// THE SOLVE IS `wallFoot`'s (see it for the full note, and `ANKLE_X` for why it has to be): the ankle
// JOINT is not on the leg's own axis — the foot bone hangs `ANKLE_X` out to its own side of the shin,
// which is what gives the character its stance width — so rolling the leg carries that offset around
// with it and the roll that lands the ankle where the plan wants it is not simply the ankle's bearing.
// Un-rotating the plan by the roll has to leave exactly that offset on the frame's x axis, which fixes
// the roll in one step (`phi` below), and the in-plane solve is then handed the reach that is LEFT
// once the offset has been taken out (`by`). The thigh is therefore a QUATERNION composed in ZYX
// order — the roll has to be the OUTER rotation, because it turns the plane the swing happens in — and
// only the swing is an angle.
//
// ...and on a DECK the yaw is what makes it a stance rather than a crouch: with the pelvis turned a
// quarter turn across it, the model's own `ANKLE_X` stand-off points ALONG the deck, so the two feet
// are spread nose-and-tail by the leg's own geometry and `phi` collapses to nearly nothing (measured:
// 0.000 for the front foot and 0.017 rad for the back one). That is the whole reason the yaw is 90°
// rather than the 74° a real skater's shoulders would suggest — it is the angle at which the model
// stands on a board with no abduction at all, and an abduction of this rig's feet is expensive: the
// drawn ankle LIFTS by `ANKLE_X · sin(phi)` (0.2 rig units of stand-off is 0.099 u of float at the
// 0.37 rad the two feet would otherwise need), which is the shoes riding a hand's width over the deck.
function boardLeg(bones, e, side, hx, yaw, x, z, ankle, hip, sole, duck) {
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  // The ankle's target in the PELVIS' own frame: `pf` forward along the pelvis' facing and `pl` out
  // to its own left. (Read off the hips' own yaw rather than the rig's, because that is the frame the
  // leg hangs in — the same reason `wallFoot` re-expresses its plan in the hips' frame.) The lateral
  // is measured from the HIP JOINT and not the pelvis' midline, because that is where the leg hangs.
  const pf = x * sy + z * cy;
  const pl = x * cy - z * sy - hx;
  const dy = ankle - hip;
  const off = side * ANKLE_X;
  const R = Math.hypot(pl, dy);
  const phi = Math.atan2(dy, pl) + Math.acos(Math.max(-1, Math.min(1, off / Math.max(1e-4, R))));
  const by = -Math.sqrt(Math.max(1e-4, R * R - off * off));
  const ik = legIK(pf, by);
  const U = side < 0 ? bones.legUpperL : bones.legUpperR;
  const L = side < 0 ? bones.legLowerL : bones.legLowerR;
  const F = side < 0 ? bones.footL : bones.footR;
  if (!U) return;
  _bdE.set(ik.thigh, 0, phi, "ZYX");
  _bdQ.setFromEuler(_bdE);
  U.quaternion.slerp(_bdQ, e);
  if (L) L.rotation.x += (ik.knee - L.rotation.x) * e;
  if (F) {
    F.rotation.x += (sole - ik.thigh - ik.knee - F.rotation.x) * e;
    F.rotation.z += (-phi - F.rotation.z) * e;
    F.rotation.y += (duck - F.rotation.y) * e;
  }
}

// The shared body of every board shape: the hips, the yaw and the two solved legs. `o` is the
// shape's own set of stations (all of them in the rig's frame, all of them optional off `BOARD`).
function boardStance(bones, e, o) {
  const yaw = o.yaw;
  const hip = o.hip;
  bones.hips.position.y += (hip - bones.hips.position.y) * e;
  bones.hips.position.x += ((o.hipX || 0) - bones.hips.position.x) * e;
  bones.hips.position.z += ((o.hipZ || 0) - bones.hips.position.z) * e;
  bones.hips.rotation.x += (0 - bones.hips.rotation.x) * e;
  bones.hips.rotation.y += (yaw - bones.hips.rotation.y) * e;
  bones.hips.rotation.z += (0 - bones.hips.rotation.z) * e;
  const hx = boardHipX(bones);
  const sole = o.sole === undefined ? BOARD.sole : o.sole;
  boardLeg(bones, e, 1, hx, yaw, o.frontX, o.frontZ, o.frontAnkle, hip,
    o.frontSole === undefined ? sole : o.frontSole, o.duckF);
  boardLeg(bones, e, -1, hx, yaw, o.backX, o.backZ, o.backAnkle, hip,
    o.backSole === undefined ? sole : o.backSole, o.duckB);
}

// THE RIDE, and everything a ride can be wearing at once: the carve, the manual, a push, a trick's
// own clock and the bail. One function because they are one body, and because the deck's own
// turn lives on the deck (see `solveRidePose` in player/board.js) — the body only ever answers it.
//
//   `carve`   -1..1: how hard the line is being bent. It is spent on the TRUNK (`torso.rotation.z`)
//             and on a shift of the weight's own centre, and deliberately NOT on the hips: a roll of
//             the pelvis would swing both solved soles off the deck (the codebase's own rule — a
//             lean at the waist cannot move a planted foot), and a carve is a lean over the deck's
//             edge, which is exactly what a waist is for.
//   `manual`  0..1: the nose held off the ground (M2). The weight moves back over the tail and the
//             FRONT foot's own station rides up with the deck's nose — its height comes from the
//             deck's own angle, so the pose and the mesh cannot disagree about how high the nose is.
//   `pushPh`  0..1 the push's own cadence clock, or -1 when the feet are both on the deck.
//   `kind`/`ph`  which flip and where in it (`BOARD_TRICKS`).
//   `miss`    0..1 the bail's own weight.
//   `air`     0..1 how far off the deck the wheels are — a ride off a ledge gets the tuck too.
//   `spdTuck` 0..1 the SPEED tuck (see `BOARD_TUCK_LO/HI`): folded down over the deck at pace,
//             hips dropped and chest forward, head following the lean.
//   `chg`     0..1 the ollie's own charge: the crouch the hold wears before the release pops.
function poseRide(bones, u, t, carve, manual, pushPh, kind, ph, miss, air, spdTuck, chg) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const tr = kind >= 0 ? boardRowAt(kind) : null;
  const ph2 = Math.max(0, Math.min(1, ph));
  // The trick's own four beats: the POP's crouch, the spring, the tuck at the top, and the catch as
  // the deck comes back up. When no trick is running they all collapse onto the stance.
  const pop = tr ? (1 - Math.min(1, ph2 / 0.30)) : 0;
  const tuck = tr ? Math.min(1, Math.max(0, (ph2 - 0.18) / 0.34)) * (1 - Math.max(0, (ph2 - 0.72) / 0.28)) : 0;
  // THE GRAB. An air row wears the tuck through the whole airtime (in fast, held, out late) and
  // reaches a hand to the deck with it — the tuck below is the deeper of the flip's and the grab's.
  const grabRow = tr && tr.grab !== undefined ? tr : null;
  const grabK = grabRow ? Math.min(1, ph2 / 0.15) * (1 - Math.max(0, (ph2 - 0.70) / 0.30)) : 0;
  const tuckEff = Math.max(tuck, grabK);
  const grabLean = grabRow && grabRow.lean ? grabRow.lean * grabK : 0;
  const catchK = tr ? Math.max(0, Math.min(1, (ph2 - 0.72) / 0.28)) : 0;
  const airK = Math.max(air || 0, tr ? Math.min(1, ph2 / 0.30) * (1 - catchK) : 0);
  const m = Math.max(0, Math.min(1, miss || 0));
  // THE SPEED TUCK. A little of the powerslide's own crouch, worn over the stance: the hips come
  // down and the chest folds forward over the nose, and the head rides the lean (see `poseBody`,
  // which pitches it with the trunk) so the eyes stay up the line.
  const spd = Math.max(0, Math.min(1, spdTuck || 0));
  const chgK = Math.max(0, Math.min(1, chg || 0));
  // ---- the hips, and the stance they are over ------------------------------------------------
  const breath = Math.sin(t * 1.5) * BOARD.breath * (1 - 0.6 * airK);
  const hip = BOARD.hipY
    + (BOARD.popHip - BOARD.hipY) * pop
    + (BOARD.airHip - BOARD.hipY) * tuckEff
    + (BOARD.missHip - BOARD.hipY) * m
    - 0.10 * spd
    - 0.12 * chgK
    + (grabRow && grabRow.hipDrop ? -grabRow.hipDrop * grabK : 0)
    + breath;
  // The push drops the pelvis over the STANDING (front) leg on the beat the other foot is down, so
  // the deck's own lean and the body's agree about which way the weight went.
  const push = pushPh >= 0 ? Math.max(0, Math.min(1, pushPh)) : 0;
  const pushing = pushPh >= 0;
  // ...and a push is a whole cycle: the foot leaves, reaches, touches, and comes back, so the
  // station is a sine of the clock and only the DOWN half of it has the foot on the road.
  const pushSwing = Math.sin(push * Math.PI * 2);
  const pushDown = pushing ? Math.max(0, Math.sin(push * Math.PI)) : 0;
  // The manual's nose angle, in radians, off the deck's own constant: the FRONT foot's station rides
  // up with the deck's nose, so the shoe stays on the deck instead of through it.
  const nose = manual * BOARD.manualAng;
  const flatAnkle = ankleForSole(0);
  const frontAnkle = flatAnkle + (BOARD.frontZ - BOARD.backZ) * Math.sin(nose);
  const o = {
    yaw: BOARD.yaw,
    hip: hip + (BOARD.pushHip - BOARD.hipY) * pushDown,
    hipX: carve * 0.075 - (pushing ? 0.055 * pushDown : 0) - m * 0.06,
    hipZ: -manual * 0.115 + (pushing ? 0.020 : 0) + m * 0.05,
    frontX: BOARD.frontX,
    backX: BOARD.backX,
    frontZ: BOARD.frontZ,
    backZ: BOARD.backZ,
    frontAnkle: frontAnkle + (BOARD.airAnkle - flatAnkle) * tuckEff * (grabRow && grabRow.plant ? 0 : 1),
    backAnkle: flatAnkle + (BOARD.airAnkle - flatAnkle) * tuckEff * (grabRow && grabRow.plant ? 0 : 1),
    duckF: BOARD.duckF,
    duckB: BOARD.duckB,
  };
  // ...AND THE PUSH. The BACK foot is the one that goes down (that is the whole reason a skater's
  // back foot wears out first): it leaves the deck, reaches out to the ROAD — which is `BOARD_ROAD`
  // below the deck's own plane, because the wheels are what is touching it — and comes back, and only
  // the middle of the cycle has it down. Its target is the ground, so what the solve below lands on
  // is the road rather than the deck.
  if (pushing) {
    const lift = pushSwing > 0 ? pushSwing : 0;
    const road = flatAnkle - BOARD_ROAD;
    o.backAnkle = road + (flatAnkle - road) * (1 - pushDown) + (BOARD.airAnkle - flatAnkle) * tuck;
    o.backX = BOARD.backX + BOARD.pushX * pushDown;
    o.backZ = BOARD.backZ - 0.10 * lift;
    o.backSole = BOARD.pushSole * pushDown;
  }
  boardStance(bones, e, o);
  // ---- the body over it -----------------------------------------------------------------------
  // The chest gives back most of the yaw (so the shoulders face the line) and the head the rest; the
  // head's own pitch keeps the eyes up off the deck, which is the one thing a duck stance must not
  // lose. Both are written raw (the `poseSlide` convention) so a number here is the angle it says.
  const torsoYaw = BOARD.torsoYaw + carve * 0.30 - m * 0.20;
  const torsoX = BOARD.torsoX - manual * 0.22 + pop * 0.34 - tuckEff * 0.22 + m * 0.30 + spd * 0.32 + chgK * 0.20 - boardTuckExtra(kind, ph2) + grabLean + (tr && tr.arch ? tr.arch * airK : 0);
  poseBody(bones, e, torsoYaw, torsoX, carve, m, airK);
  // ---- the arms ------------------------------------------------------------------------------
  // Both arms are up and out over the deck (the balance a body actually rides with). A carve loads
  // the INSIDE arm and lets the outside one go slack; a push throws the pushing side's arm back;
  // and a trick's tuck opens both out wide, which is the silhouette a flip is read by.
  const open = BOARD.airArm * (tuckEff * 0.9 + airK * 0.35) + m * 0.45 + (tr && tr.open ? tr.open * airK : 0);
  const lead = -Math.max(0, carve);
  const trail = Math.max(0, carve);
  const leadX = BOARD.armX - open * 0.35 - lead * 0.45 + (pushing ? 0.25 * pushDown : 0);
  const leadZ = BOARD.armZ + open + lead * 0.35;
  const leadE = BOARD.elbow + open * 0.30;
  const trailX = BOARD.armX - open * 0.35 - trail * 0.45 - (pushing ? 0.55 * pushDown : 0);
  const trailZ = BOARD.armZ + open + trail * 0.35;
  const trailE = BOARD.elbow + open * 0.30 + (pushing ? 0.25 * pushDown : 0);
  if (grabK > 0.001) {
    // THE REACH. The grabbing hand(s) come down to the deck's edge (the bslide's own down-reach,
    // held with both feet still on the board), the other arm keeping the balance it had.
    const gSide = grabRow.grab || 0;
    const lR = gSide >= 0 ? grabK : grabK * 0.25;
    const tR = gSide <= 0 ? grabK : grabK * 0.25;
    poseArmAngles(bones, 1, leadX + (0.80 - leadX) * lR, leadZ + (0.10 - leadZ) * lR,
      leadE + (-0.55 - leadE) * lR, e, 0.10);
    poseArmAngles(bones, -1, trailX + (0.80 - trailX) * tR, trailZ + (0.10 - trailZ) * tR,
      trailE + (-0.55 - trailE) * tR, e, -0.10);
  } else {
    poseArmAngles(bones, 1, leadX, leadZ, leadE, e, 0.10);
    poseArmAngles(bones, -1, trailX, trailZ, trailE, e, -0.10);
  }
  poseGrip(bones, m > 0.4 ? 0.10 : 0.34, e);
  if (grabK > 0.4) {
    const gSide = grabRow.grab || 0;
    if (gSide === 0) poseGrip(bones, 0.85, e);
    else poseGripSide(bones, gSide > 0 ? 1 : -1, 0.85, e);
  }
}

// The trick's own extra on the trunk: a flip reads as the body's own little curl at the top and a
// straightening as the deck comes back up under it.
function boardTuckExtra(kind, ph) {
  if (kind < 0) return 0;
  const tuck = Math.min(1, Math.max(0, (ph - 0.18) / 0.34)) * (1 - Math.max(0, (ph - 0.72) / 0.28));
  return 0.24 * tuck;
}

// The trunk, the head and the neck's own share — split out only so `poseRide` reads top-down. `carve`
// is the signed carve, `miss` the bail's weight and `air` how far off the deck the wheels are.
function poseBody(bones, e, yaw, lean, carve, miss, air) {
  const roll = carve * BOARD.lean + miss * 0.26;
  bones.torso.rotation.y += (yaw - bones.torso.rotation.y) * e;
  bones.torso.rotation.x += (lean - bones.torso.rotation.x) * e;
  bones.torso.rotation.z += (roll - bones.torso.rotation.z) * e;
  poseSettleTorso(bones, e);
  const headYaw = BOARD.headYaw - carve * 0.22 + miss * 0.35;
  const headX = BOARD.headX + lean * 0.30 + miss * 0.42 - air * 0.10;
  bones.head.rotation.y += (headYaw - bones.head.rotation.y) * e;
  bones.head.rotation.x += (headX - bones.head.rotation.x) * e;
  bones.head.rotation.z += (-roll * 0.75 - bones.head.rotation.z) * e;
  bones.head.position.z += (0 - bones.head.position.z) * e;
}

// ---------------------------------------------------------------------------
// THE POWERSLIDE — SHIFT on a deck (session 200). The deck is put SIDEWAYS to the line the body is
// still travelling on, so the whole stance above is worn at a DIFFERENT yaw: the pelvis keeps its
// 74° across the deck, the deck is off its own line by `ang`, and the two add — which is why this
// shape is the stance with one number moved rather than a pose of its own.
//
// The body's answer to a powerslide is the classic one: a DEEP, braced crouch with the weight going
// back onto the tail, the front knee folded over the nose bolt, both arms out, and the trailing hand
// reaching back and down at the deck behind him (the drag that keeps a powerslide from becoming a
// lie-down). The on-foot slide is a knee-and-palm skid along its own travel and shares nothing with
// it but the word.
// ---------------------------------------------------------------------------
function poseBSlide(bones, u, t, ang, spd, carve) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const k = Math.min(1, Math.max(0, spd));
  const crouch = 0.55 + 0.45 * k;
  const hip = BOARD.hipY - 0.235 * crouch;
  const o = {
    yaw: BOARD.yaw + ang,
    hip,
    hipX: 0 - 0.05 * crouch,
    hipZ: -0.115 * crouch,
    frontX: BOARD.frontX,
    backX: BOARD.backX + 0.055 * crouch,
    frontZ: BOARD.frontZ + 0.035 * crouch,
    backZ: BOARD.backZ - 0.030 * crouch,
    frontAnkle: 0.2225,
    backAnkle: 0.2225,
    duckF: BOARD.duckF + 0.22 * crouch,
    duckB: BOARD.duckB - 0.18 * crouch,
  };
  boardStance(bones, e, o);
  // The chest comes round with the deck (he is standing on it — the whole body turns), and rolls
  // back against the slide's own direction, which is the brace.
  const roll = -carve * 0.30 - Math.sign(ang || 1) * 0.20;
  bones.torso.rotation.y += (BOARD.torsoYaw + ang * 0.55 - bones.torso.rotation.y) * e;
  bones.torso.rotation.x += (0.52 * crouch - bones.torso.rotation.x) * e;
  bones.torso.rotation.z += (roll - bones.torso.rotation.z) * e;
  poseSettleTorso(bones, e);
  bones.head.rotation.y += (BOARD.headYaw - ang * 0.60 - bones.head.rotation.y) * e;
  bones.head.rotation.x += (-0.30 - bones.head.rotation.x) * e;
  bones.head.rotation.z += (-roll * 0.7 - bones.head.rotation.z) * e;
  bones.head.position.z += (0 - bones.head.position.z) * e;
  // Both arms out for balance, the trailing one reaching DOWN at the deck behind him.
  poseArmAngles(bones, 1, -0.95 * crouch, 0.85 * crouch, -0.30, e, 0.20);
  poseArmAngles(bones, -1, 0.55 * crouch, 0.30, -0.95 * crouch, e, -0.20);
  poseGrip(bones, 0.30, e);
}

// ---------------------------------------------------------------------------
// THE BOMB — F on a deck (session 200). The board's own dive, and it must not be the flying dive
// (`poseDive`: a head-first glide the camera steers). This one is THROWN at the road: the body folds
// flat over the deck, the knees drive up under the chest, the arms sweep back along the flanks and
// the head stays up. It is a tuck, not a glide — which is why the physics behind it is the
// steepest gravity of any of them (see `BBOMB_GRAV`) and the only one that lands with its speed.
// ---------------------------------------------------------------------------
function poseBBomb(bones, u, t, spd) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const k = Math.min(1, Math.max(0, spd));
  // The whole body is pitched about the HIPS — the one channel that moves the trunk and the legs
  // together (the legs hang off the hips), so it is the only way to lay a body flat over a deck whose
  // feet are staying on it. `POSE_FLAT` is that pitch, in radians.
  const flat = 0.62 + 0.28 * k;
  const hip = BOARD.hipY - 0.30 - 0.06 * k;
  bones.hips.position.y += (hip - bones.hips.position.y) * e;
  bones.hips.position.x += (0 - bones.hips.position.x) * e;
  bones.hips.position.z += (0.10 - bones.hips.position.z) * e;
  bones.hips.rotation.x += (flat - bones.hips.rotation.x) * e;
  bones.hips.rotation.y += (BOARD.yaw - bones.hips.rotation.y) * e;
  bones.hips.rotation.z += (0 - bones.hips.rotation.z) * e;
  // The feet stay on the deck: the legs are solved with the hips' own pitch taken back out, so the
  // prone body does not carry its shoes off the tail.
  const hx = boardHipX(bones);
  boardLeg(bones, e, 1, hx, BOARD.yaw, BOARD.frontX, BOARD.frontZ - 0.02, 0.2225, hip - flat * 0.30, 0.30, BOARD.duckF - 0.20);
  boardLeg(bones, e, -1, hx, BOARD.yaw, BOARD.backX - 0.05, BOARD.backZ - 0.06, 0.2225, hip - flat * 0.30, 0.55, BOARD.duckB + 0.20);
  // The trunk continues the flattening, the head cranes back up off the deck, and both arms are
  // swept BACK along the flanks — an arrowhead, not a pair of reaching hands.
  bones.torso.rotation.y += (BOARD.torsoYaw * 0.5 - bones.torso.rotation.y) * e;
  bones.torso.rotation.x += (0.34 - bones.torso.rotation.x) * e;
  bones.torso.rotation.z += (0 - bones.torso.rotation.z) * e;
  poseSettleTorso(bones, e);
  bones.head.rotation.y += (BOARD.headYaw * 0.4 - bones.head.rotation.y) * e;
  bones.head.rotation.x += (-0.85 - bones.head.rotation.x) * e;
  bones.head.rotation.z += (0 - bones.head.rotation.z) * e;
  bones.head.position.z += (0 - bones.head.position.z) * e;
  poseArmAngles(bones, 1, 0.85, 0.30, -0.35, e, 0.25);
  poseArmAngles(bones, -1, 0.85, 0.30, -0.35, e, -0.25);
  poseGrip(bones, 0.55, e);
}

// ---------------------------------------------------------------------------
// THE BLOCK — M1 and M2 pressed TOGETHER (see `block` / `startBlock` in player.js, and "THE BLOCK"
// in README.md). ONE pose with TWO shapes inside it, and `rush` slides between them:
//
//   THE GUARD (`rush` 0)  the BOXING block the brief asks for, and it HIDES THE FACE: both fists
//                         up at the brow with the forearms nearly vertical in front of the face,
//                         the elbows drawn in and forward so the two arms close the whole 0.28-wide
//                         face between them, the chin dropped (see `head` below — the tuck is half
//                         of how the cover works), the weight on the balls of the feet in the
//                         boxer's own stagger — the LEAD (left) foot fore, the REAR one behind it,
//                         which is the same stance `posePunch` throws the one-two out of, so the
//                         guard IS the stance the chain comes from. It BREATHES (a slow bob) because
//                         a block held perfectly still reads as a freeze, and it SHUFFLES when it
//                         walks (`walk`): the ankles re-set fore and aft under the guard exactly the
//                         way the crouch's walk does, which is the brief's *"when i block i walk"*.
//                         Measured against bare skin (see "THE BLOCK" in README.md): every sample
//                         of the face that was skin before is covered by an arm, by the hair, or by
//                         the chest, at every tuck from 0.18 to 0.45.
//   THE CHARGE (`rush` 1)  the brief's *"one arm lower limb over my eyes"*: the character's RIGHT
//                         arm (`RK`) comes up and ACROSS so the forearm lies over the eyes — the
//                         limb over them — and the LEFT one drops the whole way down and swings
//                         BACK as the counterweight, with the trunk folded over the drive and the
//                         head lifted back out of that fold so he is actually LOOKING AHEAD through
//                         the gap under the arm (see `rHead` below — with the head down in the fold
//                         the face points at the pavement and the arm reads as held in front of the
//                         chest instead of over the eyes).
//
// Everything is ONE set of channels, so nothing has to cross-fade between two poses: the two shapes
// are the two ends of the same authoring and `rush` is the blend between them. The `hit` jolt (a
// fist caught on the guard — see `blockCatch`) folds both elbows a little tighter and rocks the
// trunk back for a beat, which is the only thing in the move that is not the stance itself.
//
// THE BLOCK IS AN OVERLAY OF ARMS on whatever the base layer is already doing. The brief, verbatim:
//
//   *"make the block animtion only animte the arms not the rest of the body only add animtion for
//   the arms dont touch the rest of the body except for the black charge"*
//
// ...and then, on HOW MANY of them and WHICH shape, the sharpening that followed:
//
//   *"if player is staionary and m1 and m2 is held make the player block and the block animtion is
//   just making the right arm and left arm cover the player face like a boxer dont add a new
//   animtion just make the animtion over the deafult animtion ... if the player held m1 and m2 at
//   the same time and is running put the player right arm over his eye if else make the player arm
//   normal next to him like the normal running animtion"*
//
// So the ARMS are the whole of it, and the body underneath is never touched: no trunk lean, no chin
// tuck, no boxer's stagger, no foot placement. `updateVisual` keeps the run/idle channel live
// through the `block` state for exactly this reason, and the block is then arms written over a body
// that is still STANDING (the idle) or still RUNNING (the cycle, at whatever pace the block is
// making — `BLOCK_WALK`, or the charge's own drive). Everything else in the table below belongs to
// the CHARGE, written with `eb` (the pose's own weight times `rush` **times `1 - bodyRun`**, so it is
// a no-op on the guard AND on any body that is actually running — see the note on `eb` in
// `poseBlock`, and the session-90 brief quoted above: a running body's animation is the run, and the
// right arm is the only thing the block changes about it). The fold is therefore the shape of a
// charge broken out of a STANDSTILL, which is the one moment its body is not a run.
//
// `moving` is the RUN-CARRY blend and it is what picks between the two arm shapes — how much of the
// ONE-ARM shape the block is wearing, handed in by player.js off `solveBlockPose`'s own SPEED band
// (`BLOCK_RUN_LO`..`BLOCK_RUN_HI`, session 195). It used to be `runBlend`, which is already 1 at
// 1.6 u/s — a slow walk — so every step put the bash on the guard; the band straddles the guard's
// own top speed, so a WALKING block keeps the two-handed shape and the one-arm bash is what a body
// that is genuinely RUNNING wears:
//
//   `moving` 0   BOTH arms, and they are the boxer's guard: the right fist at the brow (`gRear…`)
//                and the left at the cheek (`gLead…`), forearms up, elbows drawn in and forward.
//                This is the brief's *"the right arm and left arm cover the player face like a
//                boxer"* — and it is `blockArm(0)`, the same arm the charge starts from.
//   `moving` 1   the RIGHT arm only, and it is the CHARGE's own: up and ACROSS the eyes (`cEye…`),
//                i.e. `blockArm(1)` — the brief's *"put the player right arm over his eye"*. The
//                LEFT one is left entirely alone, so the cycle underneath keeps pumping it: *"if
//                else make the player arm normal next to him like the normal running animtion"*.
//
// A body standing still OR WALKING under the block is `moving` 0 — the whole of the guard's own
// pace is under `BLOCK_RUN_LO` — and only a body that is RUNNING reads 1, so the two shapes are one
// arm's journey apart on the SPEED rather than on the standing/moving pair: `blockArm` below is the
// path between them — its arc bump included, which is what keeps the fist off the cheekbone on the
// way — and `moving` is how far along it the arm is. The LEFT arm's own weight is `1 - moving`, the
// same number, and it belongs to the block for every speed short of a run (so both hands are up at a
// walk); past it the cycle underneath pumps it like any other run.
//
// Both arms are always live (`e`, not `eb`), because they are the one thing both shapes share and
// the one thing this pose exists to move. The RUN wears the same right arm whenever it is played
// under a block — bone for bone, `blockArm(moving)` at `moving` 1 IS `RUN_ARM` (see `poseRun`) —
// which is why a running body in the guard and the charge's own arm are the same limb, and why the
// two can never disagree about where it is.
// ---------------------------------------------------------------------------

const BLOCK = {
  // ---- THE GUARD ----
  hip: 0.962,
  lean: 0.13,        // the trunk: a boxing guard leans a little INTO the fight, not away from it
  // The chin is DOWN (positive is down — see `poseCrouch`'s own head term): this is the GUARD's own
  // tuck, and NOTHING WRITES IT ANY MORE. It is here as the `r` 0 end of the blend below and for the
  // record, because it used to be load-bearing — the tuck turns the face down behind the gloves, so
  // gloves at the CHEEKS already cover the eyes once the chin is dropped, and the guard's numbers
  // were first solved against it. The guard no longer touches the head at all (the brief's *"dont
  // touch the rest of the body"*, and the arms-only note above the table), so with a level head the
  // same gloves covered the mouth and left the nose bare — which is what put the fists up at the
  // fist heights recorded below. Coverage is the ARMS' job now, not the chin's.
  head: 0.25,
  leadZ: 0.30,       // the lead foot's stagger, fore of the midline...
  rearZ: -0.20,      // ...and the rear one behind it
  splay: 0.24,
  reach: 0.20,       // how far each ankle re-sets in the shuffle
  lift: 0.055,
  bob: 0.013,
  // The arms. Solved, not eyeballed: these four numbers per arm were found by searching the
  // channels until each FIST landed where it has to be in the HEAD's own frame, with the forearms
  // coming up nearly VERTICAL off elbows drawn IN and FORWARD (`Out` is negative = adduction, the
  // elbows converge in front of the sternum). Two things fix where that is:
  //
  //   * THE HEIGHT comes from the coverage, and the coverage is now the arms' own job. The old
  //     solve put the fists at the CHIN (y ≈ 0.01) and leaned on the head's tuck to make that cover
  //     the face (see `head` above); with the head left alone, the same fists covered the mouth and
  //     left the nose bare — measured on the face ray grid: 7 of the 72 face samples were bare
  //     skin, every one of them in the y 0.048–0.084 band, i.e. ABOVE the gloves. So the fists went
  //     up to y 0.065 and a touch forward, and the elbows had to come with them: the forearm is
  //     0.284 long and near-vertical, so a fist at eye level puts its elbow at y −0.216 by
  //     geometry rather than by taste. Measured after: **0 bare-skin samples** in the face grid.
  //   * THE READ comes from the stagger. Two fists at the same height and depth read as one slab
  //     from the front (the first pass at this pair of solves did exactly that), so the two hands
  //     are staggered in DEPTH the way a boxer holds them: the lead (left) hand 0.053 ahead of the
  //     rear one — z 0.243 against 0.19 — which is what gives the front view its seam and what
  //     lets the two forearms overlap the midline in the projection without their geometry
  //     colliding. Both clear the skull (`qHand` 1.97 against 1.50, the lead one by twice as much).
  //   * And the fists do not TOUCH the face. Pressing the gloves onto the cheek (the 1–2 mm of
  //     overlap the first pair of solves had) is fine standing still, but the arm's first few per
  //     cent of the slide OUT of the guard then dug the fist into the cheek — measured on a fine
  //     `r` sweep: at r 0.02, 236 arm vertices up to 0.147 of the skull's radius inside, i.e. a
  //     2 cm bite, for the frames a guard takes to start walking (the same slide every entry into
  //     the charge makes, so it was always there to be seen). Pushed 1.2 cm forward the guard is
  //     clear of the skull at REST (0 vertices inside, worst quotient 1.097), the worst of the
  //     slide is 4 mm for two frames, and the face grid is still at 0 bare-skin samples.
  //
  // `elbow` is negative = folds forward; `twist` is the upper arm's own roll and it is what aims
  // the forearm's plane, so it is signed the other way round on the two arms.
  gLeadX: -1.65, gLeadOut: -0.9, gLeadElbow: -2.625, gLeadTwist: -0.8,
  gRearX: -1.75, gRearOut: -0.95, gRearElbow: -2.85, gRearTwist: 1.05,
  // ---- THE CHARGE ----
  rHip: 0.918,
  rLean: 0.56,       // folded over the drive
  // The head is LIFTED here (negative is up — `head` above is positive-down) even though the
  // trunk is folded hard over the drive: `rLean` already pitches the chest 0.56 forward, and if
  // the head then dropped with it too the face would point ~47 degrees at the pavement, which
  // drags anything held "in front of the face" down to neck height in the world. Lifting it back
  // puts the eyes ~26 degrees off horizontal, so the arm that crosses them is seen crossing them.
  rHead: -0.20,
  rLeadZ: 0.40,
  rRearZ: -0.34,
  rSplay: 0.20,
  rReach: 0.44,
  rLift: 0.075,
  // The charge's own two arms: the REAR (the character's RIGHT) comes up OVER THE EYES, and the
  // LEAD (his left) drops low and swings back as the counterweight. The sides used to be the other
  // way round; they are these numbers' own arm now, so the `cEye…` channel drives `RK` and the
  // `cLow…` one drives `LK` (see the arm block in `poseBlock`).
  // The `cEye…` four are solved the same way the guard's are, against the HEAD's own frame (with
  // the lifted head above): the target is the forearm LYING ACROSS the eye line — the eye line is the
  // TOP OF THE VISIBLE FACE here, because the fringe hangs over it (the skin patch left showing is
  // nose and mouth; located with markers: chin y 0.00, nose 0.05, hairline/eyes 0.10). The elbow lands
  // at (-0.12, +0.05, +0.28) and the fist at (+0.16, +0.10, +0.29), so the limb lies level across the
  // whole 0.28-wide face a hand's depth in front of it instead of out beside the temple.
  cEyeX: -4.05, cEyeOut: -1.84, cEyeElbow: -1.51, cEyeTwist: 1.55,
  // The mid-slide bump (see `blockArm`), authored on the same right arm: the upper arm
  // LEADS out of the guard and the elbow OPENS early, which is what bows the fist around the cheek
  // instead of through it.
  cArcX: -0.5, cArcElbow: 1.6,
  cLowX: 0.70, cLowOut: 0.22, cLowElbow: -0.42, cLowTwist: -0.16,
  // ---- THE CAUGHT-FIST JOLT (`hit`, the guard's own absorb — see `BLOCK_HIT_T` in player.js) ----
  // The jolt was a bare elbow fold on both arms, and a fold is the wrong shape for the GUARD: an
  // elbow that folds pulls the two forearms apart at the BROW and opens the seam between the fists.
  // Measured on the face grid at the start of an absorb (`j` 1): 0 bare-skin samples at rest, 1 at
  // half, 3 at full — always the same two or three points in the middle of the forehead, the one
  // patch the two fist-backs are supposed to close. A caught fist does not open a guard, it PRESSES
  // it: the fists are driven back onto the brow and slightly inward, which is the `gJoltOut` squeeze
  // below (negative is inward, the same sign as `out` everywhere else). The fold survives on the
  // CHARGE (`cJoltElbow`), where the arm lies across the eyes and the fold reads as the forearm
  // riding the impact — and there the body's own rock (`eb`) is carrying the blow anyway.
  gJoltOut: -0.16, gJoltElbow: -0.10,
  cJoltElbow: -0.20,
  lJoltX: 0, lJoltOut: -0.14, lJoltElbow: -0.16,
};

// The block's RIGHT arm as CHANNELS, so the two things that draw it can share one copy: `poseBlock`
// itself (`poseBlockArm`, below) and the RUN cycle, which wears the same arm (`poseRun` — the
// brief's *"take the entire right arm animtion of the block charging and put it on the run animtion
// of the player"*). `r` is the guard→charge blend and `j` the caught-fist jolt, so `r` 1 is the
// charge's own arm — up and ACROSS the eyes — and `r` 0 the guard's, a fist at the brow.
//
// `arc` is the mid-slide bump that keeps the transition OFF the straight line between the two
// shapes. It is 0 at BOTH ends and peaks a third of the way across (`6.75 r (1-r)^2`, which is
// exactly 1 at its peak, so the `cArc…` numbers read as peak amplitudes). Without it the fist
// travels the straight line from the cheek to the eye line, and that line goes THROUGH THE FACE:
// measured, 786 arm vertices inside the skull a quarter of the way across, knuckles coming out of
// the forehead. A real arm swings AROUND the head instead, so the bump LEADS the upper arm — it
// lifts it most of the way out of the guard before the elbow starts to unfold (`cArcX`) — and OPENS
// the elbow early (`cArcElbow`), so the fist bows out past the cheekbone at eye height and then
// lays back in across the eyes. Nothing at either end moves, so neither the guard nor the charge
// itself is touched by this. (Abduction was the obvious candidate and is the wrong lever — measured
// not to clear the cheek on its own, and it drops the fist to chest height on the way past.)
function blockArm(r, j) {
  const arc = 6.75 * r * (1 - r) * (1 - r);
  const guard = 1 - r;
  return {
    x: BLOCK.gRearX * (1 - r) + BLOCK.cEyeX * r + arc * BLOCK.cArcX,
    out: BLOCK.gRearOut * (1 - r) + BLOCK.cEyeOut * r + BLOCK.gJoltOut * j * guard,
    elbow: BLOCK.gRearElbow * (1 - r) + BLOCK.cEyeElbow * r + arc * BLOCK.cArcElbow +
      (BLOCK.gJoltElbow * guard + BLOCK.cJoltElbow * r) * j,
    twist: BLOCK.gRearTwist * (1 - r) + BLOCK.cEyeTwist * r,
  };
}

// ...and the write. `RK` is the character's own RIGHT (the rig's `...L` bones, its `-X` side — see
// `RK`), which is the arm the whole block is authored on: the guard's rear fist and the charge's
// forearm over the eyes are the same limb, which is why the two can never collide with each other.
function poseBlockArm(bones, r, j, e) {
  const a = blockArm(r, j);
  poseArmAngles(bones, RK, a.x, a.out, a.elbow, e, a.twist);
}

// THE ARM ON A RUNNING BODY — the block's own right arm at `moving` 1 (see `poseBlock`'s arms note),
// and the shape `poseRun`'s `chargeArm` seam asks for if a caller ever wants a running body to carry
// it. It IS the charge's own four channels (`cEye…`), kept as a copy rather than a read of `BLOCK`
// so the two can be tuned apart if they ever need to be: it is the same arm, bone for bone, and the
// only difference between a charge and a running body is what the rest of the figure is doing
// around it.
//
// Worth knowing before moving these numbers: the run and the charge are NOT the same body. The
// charge leans 0.45 into the drive with the head lifted back out of it (`rLean`/`rHead`), while the
// run leans far harder (0.68 at full speed, `RUNC.lean`) and counter-rotates the head most of the
// way back to level — so the run's face sits ~24° higher over its chest than the charge's does, and
// an arm posed in the chest's own frame rides lower on that face than it does on the charge's. The
// question that raises is whether it rides low enough to be drawn *through* the head, and it was
// measured rather than eyeballed, two ways, on a running rig at four stride phases:
//
//   * every arm vertex against the head's own cross-section table (`HS`, the skull): the worst
//     sample over the stride is 0.715 of the skull's radius — the same corner the plain run
//     reaches on its own at phase 0 (0.736), i.e. the overlap that is already there in the cycle
//     with nothing worn on it (it is the deltoid at the jaw, and the hair covers it);
//   * and the one that actually decides it — RENDERED occlusion, from straight in front and from
//     45°, which is where the charge's own arm is unambiguously the front-most thing in the
//     frame: the number of arm pixels the head hides is **0, 0, 3, 0** across the stride for the
//     arm as authored here, against **0** for the charge's own pose and 574–21839 for the plain
//     run. Nothing of the arm is behind the head that is not behind it in the charge itself.
//
// (An earlier pass "corrected" the arm for the 24° difference — 0.25 less swing, 0.64 less
// abduction, aimed at the run's own face — on the strength of the skull-table metric alone. It is
// measurably WORSE: 9224 arm pixels hidden by the head at phase 0, straight on. The face the run
// has is not the face that needs the arm aimed at it; the head moving back over the chest moves
// the CHEEK away from the forearm, not toward it. The numbers above are the ones that ship.)
const RUN_ARM = {
  x: BLOCK.cEyeX, out: BLOCK.cEyeOut, elbow: BLOCK.cEyeElbow, twist: BLOCK.cEyeTwist,
};

function poseBlock(bones, u, rush, hit, phase, walk, t, moving = 0, bodyRun = null) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const r = Math.max(0, Math.min(1, rush));
  const w = Math.max(0, Math.min(1, walk));
  const j = Math.max(0, Math.min(1, hit || 0));
  // THE ARM's own blend (see the arms-only note above the table): 0 is the boxer's TWO-HANDED guard,
  // 1 the one-arm bash. It is the SPEED band `solveBlockPose` hands in (`BLOCK_RUN_LO`..
  // `BLOCK_RUN_HI`), which is what keeps a WALKING block two-handed — a body that is not running
  // still wears the guard's own arms whatever the cycle underneath is doing (session 195).
  const m = Math.max(0, Math.min(1, moving));
  // ...and THE BODY's own, which is a DIFFERENT question and so a different number: how much of the
  // run cycle is actually carrying the figure (`runBlend`, handed in separately). It is what stands
  // the block's own body channel down (see `eb` below), and it is on purpose NOT the arm's number —
  // the cycle carries the legs from 1.6 u/s, well below where the arm changes shape.
  const mb = Math.max(0, Math.min(1, bodyRun == null ? moving : bodyRun));
  // The body's own ease: the pose weight TIMES the guard→charge blend, so every channel that is
  // not one of the block's arms is a no-op on the guard and the full charge on the charge.
  //
  // ...AND IT IS STOOD DOWN ENTIRELY WHILE THE RUN CYCLE IS CARRYING THE BODY (`mb` 1). The
  // brief is the user's own (session 90): *"when im running with fucking block the normal run
  // animtion plays normally BUT my right ARM only the thing that changes in the animtion ... the
  // problem is not the arm to cover the face the problem is the rest of the animtion"*. So a body
  // the cycle is carrying wears THE CYCLE for every bone but the right arm — the charge's body
  // (the fold, the dropped hips, the placed feet, the lifted head) is written only for a body the
  // cycle is NOT carrying, which in practice is the first tenth of a second of a charge broken out
  // of a standstill, before the charge's own speed has passed the run's blend threshold and
  // `mb` has followed it up. It is one factor doing it rather than a branch, so the two shapes
  // still cross-fade through each other on the way (the arms' own note below is unchanged: the ARM
  // is never stood down — it is the one thing this pose exists to write).
  const eb = e * r * (1 - mb);
  // ...and the LEFT arm's weight, which is now simply the same `(1 - m)`: the guard or the charge
  // owns that arm exactly as far as the block is wearing the two-handed shape. It was `max(r, 1 − m)`
  // — which is the same number whenever the guard is the shape (r 0) and was a flat 1 for the charge
  // — and the charge is the case the brief above is about: the limb it would otherwise drop low and
  // swing back is the second thing *"only my right arm"* has to leave alone. At `m` 1 (a genuine
  // RUN) this is 0 and the cycle keeps pumping both arms; on a body that is standing OR WALKING it
  // is still 1 and both arms are the block's (see the arms note above the table — this is the
  // session-195 change: a walk used to read 0 here because the number was the cycle's, not the
  // arm's, so a walking guard had one arm and a pumping one instead of the boxing block).
  const guardK = 1 - m;

  // The breath. It fades out as the shuffle takes over (a walking block's bob belongs to the step),
  // and right out on the charge, which is a drive and not a stance.
  const breath = Math.sin(t * 1.7) * BLOCK.bob * (1 - 0.6 * w) * (1 - r);
  const hip = (BLOCK.hip + breath) * (1 - r) + BLOCK.rHip * r;
  poseHipY(bones, hip, eb);
  poseRot(bones, "hips", "x", 0, eb);
  poseRot(bones, "hips", "y", 0, eb);
  poseRot(bones, "hips", "z", 0, eb);

  // THE FEET, SOLVED onto the deck (the shared leg IK — see `poseCrouch`): the boxer's stagger is
  // the ANKLE TARGETS' own offsets, and the shuffle is those targets travelling fore and aft, so
  // the soles stay on the pavement's plane whatever the hips are doing. Both feet keep the deck
  // throughout (the block is a standing stance and never leaves it) — and all of it is the
  // CHARGE's (`eb`): the guard does not place a foot at all.
  const flat = ankleForSole(0);
  const reach = BLOCK.reach * (1 - r) + BLOCK.rReach * r;
  const lift = BLOCK.lift * (1 - r) + BLOCK.rLift * r;
  const leadZ = BLOCK.leadZ * (1 - r) + BLOCK.rLeadZ * r;
  const rearZ = BLOCK.rearZ * (1 - r) + BLOCK.rRearZ * r;
  const splay = BLOCK.splay * (1 - r) + BLOCK.rSplay * r;
  for (const [side, ph, base] of [[LK, phase, leadZ], [RK, phase + 0.5, rearZ]]) {
    const c = Math.cos(ph * Math.PI * 2);
    const z = ANKLE_Z + base + reach * c * w;
    const step = Math.max(0, Math.sin(ph * Math.PI * 2)) * lift * w;
    poseLegIK(bones, side, z, flat + step - hip, splay, eb);
  }

  // THE TRUNK. The jolt rocks it back off the fist for a beat and folds the elbows on top of that.
  // All of it is the charge's (`eb`).
  const lean = BLOCK.lean * (1 - r) + BLOCK.rLean * r;
  const head = BLOCK.head * (1 - r) + BLOCK.rHead * r;
  poseRot(bones, "torso", "x", lean - 0.12 * j, eb);
  poseRot(bones, "torso", "y", 0, eb);
  poseRot(bones, "torso", "z", 0, eb);
  poseSettleTorso(bones, eb);
  poseRot(bones, "head", "x", head - 0.07 * j, eb);
  poseRot(bones, "head", "y", 0, eb);
  poseRot(bones, "head", "z", 0, eb);

  // THE ARMS. They are no longer a symmetric pair, because the brief splits them (see the arms note
  // above the table): the character's RIGHT arm is the block's own and its shape follows `moving`
  // — the boxer's fist at the brow unless the body is genuinely RUNNING, the forearm across the eyes
  // once it is — while the LEFT one is the block's (the guard's lead or the charge's low arm) for as
  // far as the block is wearing the two-handed shape (`guardK`), which is every speed up to a walk.
  //
  // The right arm comes from `blockArm` (above), which is the same function the RUN cycle wears, so
  // the arm a running body holds is bone-for-bone the arm the charge holds — and the path between
  // the two shapes is that function's own arc, not a straight line through the cheek.
  const lx = BLOCK.gLeadX * (1 - r) + BLOCK.cLowX * r;
  const lo = BLOCK.gLeadOut * (1 - r) + BLOCK.cLowOut * r;
  const le = BLOCK.gLeadElbow * (1 - r) + BLOCK.cLowElbow * r;
  const lt = BLOCK.gLeadTwist * (1 - r) + BLOCK.cLowTwist * r;
  poseArmAngles(bones, LK, lx + BLOCK.lJoltX * j, lo + BLOCK.lJoltOut * j, le + BLOCK.lJoltElbow * j, e * guardK, lt);
  poseBlockArm(bones, Math.max(r, m), j, e);
  // Both hands are FISTS — a boxing block is a closed guard, and a block with open hands reads as a
  // shove — and they are clenched the same way round as the arms: the right one always, the left
  // one only while the guard (or the charge) owns that arm.
  poseGripSide(bones, RK, 1, e);
  poseGripSide(bones, LK, 1, e * guardK);
}

// ---------------------------------------------------------------------------
// AIR — one pose with three authored variants.
//
// Consecutive jumps into the same frame read as a loop, so each jump picks a
// variant (player.js) and the whole airtime rides it: a TUCK (lead knee driven
// up to the chest, trailing leg folded behind), a SCISSOR (legs split wide fore
// and aft, both nearly straight) and a STAR (legs splayed sideways, arms out).
// `rise` (1 up, -1 down) reads the arc on top: a rise folds the trailing leg and
// opens the chest, a fall reaches both legs down to meet the ground and drops the
// head to look at it.
// ---------------------------------------------------------------------------

const AIR_LEG = [
  { lead: [-1.30, 1.50, 0.40, 0.12], trail: [0.66, 1.15, 0.60, 0.18] },
  { lead: [-1.55, 0.26, -0.28, 0.16], trail: [1.10, 0.42, 0.66, 0.22] },
  { lead: [-0.34, 0.86, 0.30, 0.80], trail: [0.28, 0.68, 0.52, 0.72] },
];
const AIR_ARM = [
  { upX: 1.05, upZ: 0.50, elbow: -1.00 },
  { upX: -0.80, upZ: 0.34, elbow: -0.70 },
  { upX: 0.30, upZ: 1.35, elbow: -0.40 },
];

function poseAir(bones, u, rise, variant) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const r = Math.max(-1, Math.min(1, rise));
  const up = Math.max(0, r);
  const dn = Math.max(0, -r);
  const v = (((variant | 0) % 3) + 3) % 3;
  const L = AIR_LEG[v];
  const A = AIR_ARM[v];
  poseHipY(bones, HIP_Y + 0.03 * up - 0.02 * dn, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  poseLegAngles(bones, -1, L.lead[0] + dn * 1.00 - up * 0.12, L.lead[1] * (1 - 0.62 * dn) + up * 0.22, L.lead[2] + dn * 0.30, L.lead[3], e);
  poseLegAngles(bones, 1, L.trail[0] - dn * 0.62 + up * 0.22, L.trail[1] * (1 - 0.32 * dn) + up * 0.30, L.trail[2] + dn * 0.30, L.trail[3], e);
  poseRot(bones, "torso", "x", 0.34 * up - 0.12 * dn, e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", -0.30 * up + 0.26 * dn, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  const ax = A.upX + 0.50 * up - 0.40 * dn;
  poseArmAngles(bones, -1, ax, A.upZ, A.elbow, e);
  poseArmAngles(bones, 1, ax * 0.88, A.upZ, A.elbow, e);
  poseGrip(bones, v === 0 ? 0.75 : 0.35, e);
}

// ---------------------------------------------------------------------------
// DIVE — aerodynamic, because the whole body is already pitched nose-down by
// player.js (the dive is locked to the camera's line). Legs straight out behind
// and a little apart, arms swept back along the flanks, chest open, head up
// watching the landing. Anything thrown forward here would read as tucking.
//
// The pose is a STILL. It used to carry a flutter (the legs alternating and the
// arms swapping with them, driven off the dive's speed) and the motion was bought
// with a wobble the shape could not afford — the dive is already pitched, banked
// and spinning under the rig, so an extra cycle in the limbs reads as the body
// coming apart rather than as speed. What speed does here now is the SPEED ITSELF:
// the body's own forward lean (player.js) and the wind streaks off the flanks
// (`effects.diveTrail`).
//
// The one thing that stays speed-driven is `spread`: the legs drift further apart
// as the dive winds up, which is what the eye reads as commitment. It is a
// monotonic widening (not a cycle), so it cannot wobble — and it is the sole
// remaining reason `poseDive` takes a second argument.
// ---------------------------------------------------------------------------

const DIVE = {
  spread: 0.14,      // the legs drift further apart as the dive winds up to speed
};

function poseDive(bones, u, move = 0) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const m = Math.max(0, Math.min(1, move));
  // `splay` is the one thing here that is speed and not taste: a faster dive is a flatter,
  // wider one, which is what the eye reads as commitment.
  const splay = DIVE.spread * m;
  poseHipY(bones, HIP_Y + 0.02, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  poseLegAngles(bones, -1, 0.34, 0.16, 0.62, 0.20 + splay, e);
  poseLegAngles(bones, 1, 0.40, 0.22, 0.62, 0.26 + splay, e);
  poseRot(bones, "torso", "x", -0.22, e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", -0.60, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  // The arms are swept back and out along the flanks. `upZ` is mirrored by `poseArmAngles`'
  // own `side`, so the two sides are signed to sit symmetrically rather than to move together.
  poseArmAngles(bones, -1, 1.30, 0.55, -0.30, e);
  poseArmAngles(bones, 1, 1.30, 0.55, -0.30, e);
  // THE STRETCH: the dive is the game's one STILL that wants to read as speed, and a body travelling
  // that fast is drawn LONG — both legs a little over their own length, the arms a touch. Nothing
  // here is a solved contact (the dive is flung through the air), so this is as free as the channel
  // gets; it is a hold rather than an accent, and it unwinds the moment the pose is no longer worn.
  const lg = 1.15;
  poseStretchChain(bones, "leg", -1, lg);
  poseStretchChain(bones, "leg", 1, lg);
  poseStretchChain(bones, "arm", -1, 1.07);
  poseStretchChain(bones, "arm", 1, 1.07);
  poseGrip(bones, 0.25, e);
}

// ---------------------------------------------------------------------------
// LAUNCH — the pad's flight (see `Player.startLaunch` in player.js).
//
// The arc is a real ballistic curve and it lasts for seconds, so the pose has to survive the
// whole of it: it is the only move in the game that is *in the air* for long enough for the
// body to be read as a shape rather than a blur. So it is a ride, not a jump — `rise` (the
// vertical velocity, normalised) turns one pose into two:
//
//   rising   arms swept back along the flanks, legs trailing together and slightly back,
//            the chest open and the head up, watching the roof come on — the classic
//            rocket shape, and the one that reads best against the sky
//   falling  arms out for balance, legs forward and apart reaching for the deck, the
//            trunk tipping over the top of the arc, the head down on the landing
//
// Nothing else drives it. The speed is shown by the trail off the body and the wind on the
// camera, both emitted from main.js.
// ---------------------------------------------------------------------------

const LAUNCH = {
  hipUp: 0.05,
  // Legs: [thigh, knee, sole, splay]. `base` is the shape the flight holds all the way through
  // — arms swept back along the flanks, legs together and trailing — and the rise/fall columns
  // are what the arc's slope adds on top. The base is not decoration: `rise` passes through
  // ZERO at the top of the arc, so a pose built only from the two extremes collapses into the
  // neutral stance for the second either side of the apex.
  baseLeg: [0.30, 0.34, 0.55, 0.06],
  riseLeg: [0.30, 0.34, 0.28, 0.00],
  fallLeg: [-0.55, 0.06, -0.55, 0.22],
  baseArm: [1.45, 0.40, -0.32],
  riseArm: [0.45, -0.12, 0.00],
  fallArm: [-1.30, 0.85, -0.20],
  baseTorso: -0.20,
  riseTorso: -0.14,
  fallTorso: 0.34,
  baseHead: -0.22,
  riseHead: -0.16,
  fallHead: 0.50,
};

function poseLaunch(bones, u, rise) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const r = Math.max(-1, Math.min(1, rise));
  const up = Math.max(0, r);
  const dn = Math.max(0, -r);
  const L = LAUNCH;
  poseHipY(bones, HIP_Y + L.hipUp * up, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  const leg = (i) => L.baseLeg[i] + L.riseLeg[i] * up + L.fallLeg[i] * dn;
  // The trailing leg leads the leading one a little, so the pair is not a single rigid shape.
  poseLegAngles(bones, -1, leg(0) + 0.10, leg(1) + 0.16, leg(2), leg(3), e);
  poseLegAngles(bones, 1, leg(0) - 0.16, leg(1) - 0.10, leg(2) + 0.06, leg(3) + 0.05, e);
  poseRot(bones, "torso", "x", L.baseTorso + L.riseTorso * up + L.fallTorso * dn, e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", L.baseHead + L.riseHead * up + L.fallHead * dn, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  const ax = L.baseArm[0] + L.riseArm[0] * up + L.fallArm[0] * dn;
  const az = L.baseArm[1] + L.riseArm[1] * up + L.fallArm[1] * dn;
  const ae = L.baseArm[2] + L.riseArm[2] * up + L.fallArm[2] * dn;
  poseArmAngles(bones, -1, ax, az, ae, e);
  poseArmAngles(bones, 1, ax * 0.94, az, ae, e);
  poseGrip(bones, 0.45, e);
}

// ---------------------------------------------------------------------------
// GROUND SLAM — a committed METEOR.
//
// It used to be a cannonball: knees pulled to the chest, both arms wrapped around them, head
// tucked, the body pitched nearly flat by player.js and spun as it drilled. It is now the shape the
// user's reference (session 51) is built on — a pixel sprite of an armoured body coming down the
// air with BOTH FISTS CLOSED AND OVER ITS HEAD, knees tucked, energy trailing — so the arms have come
// out of the tuck and gone up: the tuck is the LEGS (knees against the chest, the heels back under
// the seat), the trunk is ARCHED back over the fists rather than folded onto the knees, and the head
// is up. A body wearing this is a fist at the top of its fall, with the whole of it about to come
// down on the deck (the landing shape, `poseSlamLand`, is the same two fists).
//
// The fists are the two channels the whole move turns on: `upX` past -PI/2 is OVERHEAD (see
// `poseArmAngles`), and `upZ` negated from the usual outward value closes the two hands onto each
// other at the midline — `FIST_TOGETHER`'s own numbers, so the drop and the hammer's first beat are
// the same two fists.
// ---------------------------------------------------------------------------

const SLAM = {
  hipY: HIP_Y + 0.10,
  // The tuck: the thighs swing past horizontal so the knees come up against the chest and the heels
  // up against the seat. A LOOSER tuck than the cannonball's on purpose — the shape being read now
  // is the arms, and knees right under the chin bury them.
  thigh: -1.95,
  knee: 2.60,
  sole: 0.26,
  splay: 0.32,
  torso: -0.30,
  head: -0.34,
  // Both fists closed on each other over the head. These are `FIST_TOGETHER`'s own three numbers
  // (which is where the shape is documented, and where the sweep that measured them lives — it sits
  // further down the file, with `poseFists`, so the values are repeated here by hand).
  upX: -2.60,
  upZ: -0.52,
  elbow: -0.62,
};

function poseSlam(bones, u) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  poseHipY(bones, SLAM.hipY, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  poseLegAngles(bones, -1, SLAM.thigh, SLAM.knee, SLAM.sole, SLAM.splay, e);
  poseLegAngles(bones, 1, SLAM.thigh + 0.07, SLAM.knee + 0.06, SLAM.sole, SLAM.splay + 0.04, e);
  poseRot(bones, "torso", "x", SLAM.torso, e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", SLAM.head, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  // Both arms the SAME sign on `upZ`: `z` is outward (the channel multiplies it by the side), so the
  // two negative values are the two hands coming IN to the midline, onto each other.
  poseArmAngles(bones, -1, SLAM.upX, SLAM.upZ, SLAM.elbow, e);
  poseArmAngles(bones, 1, SLAM.upX, SLAM.upZ, SLAM.elbow, e);
  poseGrip(bones, 1, e);
}

// ---------------------------------------------------------------------------
// THE FISTS-INTO-THE-DECK SHAPE — the slam's LANDING, and the HAMMER it turns into.
//
// The slam used to arrive and simply stand up: the cannonball above faded out over a tenth of a
// second while `poseLand` threw both arms OUT for balance. That is the shape a body makes when it
// is CATCHING itself, not when it is hitting something. A ground slam is the other thing: the
// whole body drives BOTH fists into the deck, torso over them, head down. Everything below is that
// one shape, built off the same channels, so the landing and the hammer cannot look like two
// different moves:
//
//   * `hip`   — where the hips sit in the rig's own units (see `HIP_Y`), which is the whole of the
//               crouch: the feet are solved onto the deck underneath them (`poseLegIK`), so a low
//               hip bends the knees rather than putting the body through the floor. It is the hip
//               itself rather than a 0..1 depth because it is the number a sweep wants to move.
//   * `swing` — where the fists are, 0 in the deck … 1 both hands over the head. One channel, so
//               the wind-up and the drive are the same line travelled in both directions.
//   * `lean` / `head` — the trunk and the skull, authored angles because the two ends of the move
//               need them (the arch back at the top, the fold over the fists at the bottom).
//
// `poseFists` carries no clock of its own: the landing and the hammer hand it channels, which is
// what keeps this one shape rather than two.
// ---------------------------------------------------------------------------

// The landing's own channels. These are authored against a MEASUREMENT, because the fists are the
// whole point of the shape: `FIST_HIP_*`/`FIST_LEAN_*` are the depths that actually put the wrists
// on the deck (see "The ground slam" in src/README.md for the sweep's own numbers), and the arm
// channel's "in the deck" end is a rotation BACKWARD against the chest, so the arms hang down while
// the trunk is folded over them rather than following it out in front.
const FIST_HIP_BASE = 0.24;   // how far the hips come down for a light slam
const FIST_HIP_DROP = 0.16;   // ...and for a full-power one (0.60 at full: a deep, wide crouch)
const FIST_LEAN_BASE = 0.85;  // the trunk, folded over the fists (this is the channel that puts
const FIST_LEAN_DROP = 0.90;  // them on the deck — the arms alone cannot reach it)
const FIST_HEAD_BASE = 0.34;
const FIST_HEAD_DROP = 0.14;

// The two ends of the arm channel, in `poseArmAngles`' own units (see the note above it: `upX`
// negative swings the arm forward, past -PI/2 it is overhead): "in the deck" swings the arm back
// against a trunk that is folded a long way over, so the arms end up hanging at the ground, and
// "overhead" is a wind-up, not a stretch.
const FIST_DECK = { x: -1.00, z: 0.16, elbow: -0.45 };
const FIST_OVER = { x: -2.62, z: 0.24, elbow: -0.66 };
const FIST_SIDE = { x: 0.06, z: 0.12, elbow: -0.20 };
const FIST_SPLAY = 0.30;   // the leg solve's own outward roll (see `poseFists`)

// ...and the one the hammer's first beat and the slam's own drop share: both fists CLOSED and
// brought to the MIDLINE, so the two hands meet over the head (the user's *"make him close his fists
// together"*). The channel's `z` is OUTWARD, so together is a negative one, and the number is not
// eyeballed — it is taken off a sweep of `fistPose` that measured the gap between the two hands: at
// `z` 0.24 they are 1.019 apart, at -0.56 they are 0.11 (a pair of mitts of this rig's own size, so
// they read as closed ON each other without a pixel of the two of them overlapping).
const FIST_TOGETHER = { x: -2.60, z: -0.56, elbow: -0.62 };


// `splay` and `z` are the leg solve's two remaining channels (see the note below); they are
// parameters rather than constants because they are what a sweep has to move to keep the feet on
// the deck at a given hip — but every real caller leaves them at the defaults.
//
// ...and `extra` is what the HAMMER adds, because a flurry of six different smashes is more than one
// pair of arms can say:
//   * `armR` — the right arm's own channel, for the beats whose two arms are doing different
//              things. The LEFT arm keeps the `ax, az, ae` arguments, so every symmetric caller
//              (the landing, the measurements, the sweeps) is untouched.
//   * `tuck` — the leg angles the AIRBORNE half of a beat wears: `thigh`, `knee`, `sole`, `splay`
//              plus the optional per-leg offsets `tw`/`tk`/`ts`, so one knee can ride higher than
//              the other.
//   * `air`  — how much of that tuck to wear, 0..1. It is the body's OWN HEIGHT off the deck (the
//              bounce, handed down by player.js), so the legs fold up exactly as the body leaves the
//              ground and are back on the deck on the frame the fists are.
function poseFists(bones, e, hip, lean, head, ax, az, ae, splay, z, extra) {
  const hipTarget = hip;
  const h = bones.hips.position.y + (hipTarget - bones.hips.position.y) * e;
  bones.hips.position.y = h;
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  const flat = ankleForSole(0);
  const sp = splay === undefined ? FIST_SPLAY : splay;
  const az0 = z === undefined ? ANKLE_Z - 0.05 : z;
  poseLegIK(bones, -1, az0, flat - h, sp, e);
  poseLegIK(bones, 1, az0, flat - h, sp + 0.04, e);
  // ...and the air, on top of that solve.
  const tuck = extra && extra.tuck;
  const air = extra && extra.air ? Math.max(0, Math.min(1, extra.air)) : 0;
  if (tuck && air > 0.002) {
    const ea = e * air;
    poseLegAngles(bones, -1, tuck.thigh, tuck.knee, tuck.sole, tuck.splay, ea);
    poseLegAngles(bones, 1, tuck.thigh + (tuck.tw === undefined ? 0.07 : tuck.tw),
      tuck.knee + (tuck.tk === undefined ? 0.06 : tuck.tk), tuck.sole,
      tuck.splay + (tuck.ts === undefined ? 0.04 : tuck.ts), ea);
  }
  poseRot(bones, "torso", "x", lean, e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", head, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  const aR = (extra && extra.armR) || [ax, az, ae];
  poseArmAngles(bones, -1, ax, az, ae, e);
  poseArmAngles(bones, 1, aR[0], aR[1], aR[2], e);
  poseGrip(bones, 1, e);
}

// A SLAM'S OWN LANDING — one shot, set at the moment the feet touch and unwound over
// `P.SLAM_LAND_TIME` by the player's own timer, scaled by the slam's power (a slam pressed an
// inch off the deck gets the same shape at half the depth, which is honest: there was no drop
// behind it). It REPLACES the generic landing absorb for the frames it is live (see the gate in
// `updateVisual`): two absolute poses applied on one frame settle at a muddy average of each
// other, and the arms-out absorb pulled directly against these arms-down fists.
function poseSlamLand(bones, u, power) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const A = Math.max(0, Math.min(1, power || 0));
  poseFists(
    bones, e,
    HIP_Y - (FIST_HIP_BASE + FIST_HIP_DROP * A),
    FIST_LEAN_BASE + FIST_LEAN_DROP * A,
    FIST_HEAD_BASE + FIST_HEAD_DROP * A,
    FIST_DECK.x, FIST_DECK.z, FIST_DECK.elbow
  );
}

// THE HAMMER — the flurry the slam's landing turns into BY HAND (see `P.HAMMER` and `startHammer`
// in player.js, and "The ground slam" in README.md).
//
// It used to be ONE shape played six times with the body planted on the deck the whole way through.
// It is now six DIFFERENT smashes, and every one of them is a BOUNCE — the user's *"with every slam
// make it a different animation and dont make him sit still make him bounce"*. What makes both of
// those possible is that a beat is authored as a PAIR of shapes plus a weight:
//
//   * `deck` — the shape a beat begins and ends on: the fists (or the elbows, or the two hands
//              closed on each other) driven into the ground. It is written in the same channels as
//              the slam's own landing, so whatever a beat hits with, it still ARRIVES on the shape
//              the slam arrives on.
//   * `coil` — the shape at the TOP of the hop: that beat's wind-up, and the place the six say what
//              they are (both fists together over the head, one fist cocked over the shoulder, both
//              elbows flared, a backfist wound across the chest).
//   * `tuck` — the legs in the air: both knees to the chest, one knee high and one trailing, or
//              knees out and wide.
//
// The weight between the two is the BOUNCE ITSELF: `air` is the body's own height off the deck (0
// with the fists in it, 1 at the apex), computed by player.js off the same beat table the impacts
// fire on (see `hammerHop`). So the pose is not keyed to look like a hop — it IS the hop read back,
// and every fist is in the deck on exactly the frame its impact fires. `T` is the seconds into the
// sequence, `H` is that table, and `r` is the exit: over the last `H.exit` the whole thing is handed
// back to the standing body (arms at the sides, hips up, trunk upright) so the state can end into a
// plain run without a snap.

// The leg tucks a beat can wear (see `poseFists`'s `extra.tuck`). `tw`/`tk`/`ts` are the second
// leg's offsets from the first, which is what makes `stag` one knee driven higher than the other.
const HAMMER_TUCK = {
  chest: { thigh: -1.95, knee: 2.60, sole: 0.28, splay: 0.30 },
  stag: { thigh: -2.30, knee: 2.90, sole: 0.18, splay: 0.22, tw: 0.40, tk: -0.50, ts: 0.10 },
  // ...the same one mirrored, so the pair of one-fisted beats tuck on opposite knees rather than
  // being the same shape twice.
  stagL: { thigh: -2.30, knee: 2.90, sole: 0.18, splay: 0.22, tw: -0.40, tk: 0.50, ts: -0.10 },
  split: { thigh: -1.25, knee: 1.55, sole: 0.50, splay: 0.80, tw: -0.16, tk: 0.20 },
  // ...and the one the backfist wears: one knee driven high and the other leg left trailing out
  // behind it, which is the only tuck of the six that is not symmetric about the body.
  whip: { thigh: -0.70, knee: 1.20, sole: 0.60, splay: 0.48, tw: -0.95, tk: 1.45, ts: 0.22 },
};

// ...and the six. `hip` is the pose's own depth channel (rig units, `HIP_Y` standing — the same one
// the landing's depth is authored on), `lean`/`head` are the trunk and the skull, and each arm is a
// `poseArmAngles` channel (`z` is OUTWARD, so a negative one takes a fist in toward the midline).
const HAMMER_BEATS = [
  { // 1 — BOTH FISTS TOGETHER. The double axe-handle: the two hands are closed on each other over
    // the head and come straight down the middle onto the deck, trunk folded over them. It is the
    // reference shape for the whole move — and the one the slam's own drop now wears in the air.
    deck: { hip: 0.52, lean: 1.86, head: 0.30, armL: { x: -1.02, z: -0.56, elbow: -0.44 }, armR: { x: -1.02, z: -0.56, elbow: -0.44 } },
    coil: { hip: 0.99, lean: -0.30, head: -0.60, armL: FIST_TOGETHER, armR: FIST_TOGETHER },
    tuck: HAMMER_TUCK.chest,
  },
  { // 2 — THE RIGHT HAMMER. The right fist goes in on its own while the left arm is thrown back for
    // the turn, and the coil cocks the right arm back over the shoulder rather than over the head.
    deck: { hip: 0.58, lean: 1.74, head: 0.24, armL: { x: 0.62, z: 1.02, elbow: -0.26 }, armR: { x: -1.12, z: -0.04, elbow: -0.34 } },
    coil: { hip: 0.98, lean: -0.24, head: -0.40, armL: { x: 0.30, z: 1.10, elbow: -0.30 }, armR: { x: -2.42, z: 0.42, elbow: -0.92 } },
    tuck: HAMMER_TUCK.stag,
  },
  { // 3 — THE LEFT HAMMER. The mirror of the one above, so the pair reads as a drumroll rather than
    // as a favourite hand.
    deck: { hip: 0.58, lean: 1.74, head: 0.24, armL: { x: -1.12, z: -0.04, elbow: -0.34 }, armR: { x: 0.62, z: 1.02, elbow: -0.26 } },
    coil: { hip: 0.98, lean: -0.24, head: -0.40, armL: { x: -2.42, z: 0.42, elbow: -0.92 }, armR: { x: 0.30, z: 1.10, elbow: -0.30 } },
    tuck: HAMMER_TUCK.stagL,
  },
  { // 4 — BOTH ELBOWS. The body comes down on its folded arms, elbows first: the upper arm points
    // straight down the fall line and the forearms fold back up, so the two ELBOWS are the lowest
    // point of the whole figure (measured: elbows 0.26 above the deck, fists 0.52 — nothing else in
    // the flurry touches the ground with anything but a fist). The hips are lower than any other
    // beat, and this is the beat that goes over — a whole forward flip across it (`P.HAMMER.flips`),
    // which is the one thing in the six the other five cannot do.
    deck: { hip: 0.48, lean: 2.02, head: 0.45, armL: { x: -2.05, z: -0.10, elbow: -2.75 }, armR: { x: -2.05, z: -0.10, elbow: -2.75 } },
    coil: { hip: 1.00, lean: -0.16, head: -0.34, armL: { x: -2.28, z: -0.34, elbow: -1.16 }, armR: { x: -2.28, z: -0.34, elbow: -1.16 } },
    tuck: HAMMER_TUCK.split,
  },
  { // 5 — THE BACKFIST. The right arm is wound ACROSS the chest at the top of the hop and swings out
    // and down onto the deck at the end of it (this is the other beat that turns — see
    // `P.HAMMER.turns`), with the left arm left low and tucked: measured, the two fists are 1.05
    // apart at the impact with only the right one in the deck, which is the widest, most one-sided
    // shape of the six.
    deck: { hip: 0.50, lean: 1.86, head: 0.14, armL: { x: -0.34, z: -0.24, elbow: -1.34 }, armR: { x: -1.00, z: 0.70, elbow: -0.34 } },
    coil: { hip: 0.96, lean: -0.06, head: -0.28, armL: { x: 0.32, z: 1.15, elbow: -0.25 }, armR: { x: -1.45, z: -0.40, elbow: -1.95 } },
    tuck: HAMMER_TUCK.whip,
  },
  { // 6 — THE FINISHER. The tallest bounce of the six and the heaviest landing (see
    // `HAMMER_POWER_RAMP`) with two whole turns across it: both fists together again, arched as far
    // back as the shape goes at the top, and folded as deep as it goes at the bottom.
    deck: { hip: 0.52, lean: 1.96, head: 0.38, armL: { x: -1.04, z: -0.56, elbow: -0.40 }, armR: { x: -1.04, z: -0.56, elbow: -0.40 } },
    coil: { hip: 1.02, lean: -0.44, head: -0.74, armL: FIST_TOGETHER, armR: FIST_TOGETHER },
    tuck: HAMMER_TUCK.chest,
  },
];

// One arm through a beat: between the beat's own two shapes, then handed over to the standing shape
// by the exit weight. Returns a `poseArmAngles` triple.
function hammerArm(a, b, w, r) {
  const x = a.x + (b.x - a.x) * w;
  const z = a.z + (b.z - a.z) * w;
  const el = a.elbow + (b.elbow - a.elbow) * w;
  return [
    x + (FIST_SIDE.x - x) * r,
    z + (FIST_SIDE.z - z) * r,
    el + (FIST_SIDE.elbow - el) * r,
  ];
}

function poseSmash(bones, u, T, H, air) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const cycle = Math.max(1e-4, H.cycle);
  const k = Math.max(0, Math.min(H.hits - 1, Math.floor(T / cycle)));
  const B = HAMMER_BEATS[k % HAMMER_BEATS.length];
  const r = poseEase(Math.max(0, Math.min(1, (T - cycle * H.hits) / Math.max(1e-4, H.exit))));
  // ...and the weight between the beat's two shapes IS the bounce (see the note above): 0 with the
  // fists in the deck, 1 at the apex. One number, so a beat's coil can only happen at the top of the
  // hop its own impact is timed to.
  const w = Math.max(0, Math.min(1, air || 0));
  const mix = (a, b) => a + (b - a) * r;
  const hip = mix(B.deck.hip + (B.coil.hip - B.deck.hip) * w, HIP_Y);
  const lean = mix(B.deck.lean + (B.coil.lean - B.deck.lean) * w, 0.06);
  const head = mix(B.deck.head + (B.coil.head - B.deck.head) * w, 0);
  const aL = hammerArm(B.deck.armL, B.coil.armL, w, r);
  const aR = hammerArm(B.deck.armR, B.coil.armR, w, r);
  poseFists(bones, e, hip, lean, head, aL[0], aL[1], aL[2], undefined, undefined,
    { armR: aR, tuck: B.tuck, air: w });
}

// ---------------------------------------------------------------------------
// THE TOTE — the duffel carried in BOTH HANDS (see `takeInHands` / `throwFromHands` in
// inventory.js, and the `tote*` fields on `Player`).
//
// While it is being carried the bag is a CHILD of the torso hinge (see `BAG_TOTE` in
// inventory.js), so this shape's whole job is the ARMS: they come out of the run's swing, the
// elbows fold up under the duffel and both hands close on its own two ENDS — the way you carry a
// heavy case with both hands, and the way a duffel is actually picked up. One shape, three
// channels:
//
//   hold   the cradle. It BREATHES, slowly, because a man standing still with a heavy bag in
//          both arms is not a statue.
//   throw  M1 — the plain forward throw: the bag goes back over the shoulder and is hurled
//          away, and the hands open on the frame it leaves.
//   slam   M2 — the duffel is hoisted OVERHEAD and driven straight down into the deck in front
//          of him. This is the one that leaves it LIVE (see "THE HOT BAG" in inventory.js).
//
// `u` is the layer weight from the player's own pose stack; `t` is the shape's clock — 0..1 for
// the two one-shots and a running clock in SECONDS for the hold, which is what the breath rides.
// The legs are deliberately NOT touched: the base layer is still solving them against the deck
// as he walks, and a hip height written here would lift his soles off it.
//
// SESSION 184 — THE BODY WRITES ARE GONE, EXCEPT ADDITIVELY (the user's *"make the player item hold
// animation blend in with his running animation like what we did for the block"*). This pose used
// to write the trunk absolutely (plus zeroes on its yaw and roll), the head on all three axes and
// the hips' own rotations — which is the same mistake `poseCarry` made in session 179 and had
// fixed in 180, one bag further on: at a SPRINT the base layer is writing a real trunk lean and a
// real shoulder counter-rotation every frame, and an absolute write here throws them away, so the
// body stands up and stops swinging the moment the duffel comes into the arms. What is left is:
//
//   * THE ARMS. Untouched by any of it, and still the whole of what this layer is for.
//   * THE TRUNK'S FOLD AND THE HEAD, ADDITIVELY (`poseAdd`) — the cradle's own lean-back and the
//     head coming down over the load still read on a body standing still, and on a body RUNNING
//     they are added to the run's own lean instead of replacing it.
//   * THE HIP, as a DELTA off `HIP_Y` for the two one-shots only (a hoist lifts the body and a
//     slam drops it), so the slam of a running bag rides the run's own hip bob.
//   * NOTHING ELSE. The yaw and roll zeroes and the hips' rotation resets are DELETED rather than
//     left at 0 — there is no number left to be applied by accident.
//
// The ARMS' numbers are measured against the BAG, not guessed (see `BAG_HAND` in inventory.js):
// `upZ` 0.02 is what puts the two hands ON the bag's end panels instead of out in the air beside
// it, and the elbow at -1.0 hangs the forearms flat under it so the bag RESTS on them.
// ---------------------------------------------------------------------------
const TOTE = {
  lean: -0.070,   // the trunk takes the weight BACK — ADDED to the base's own lean (see below)
  head: 0.150,    // ...and the head comes down over the load, added the same way
  upX: -0.200,    // session 184: the arms come UP and IN, onto the bag's own ends
  upZ: 0.020,     // ...and in — the cradle is the bag's width, not wider than it (see the note)
  elbow: -1.000,  // the forearms fold up under it, so the duffel RESTS on them
  wrist: -0.300,  // the palms stand up a little against the ends
  twist: 0.453,   // the upper arm's own twist — NOT decoration: it is what swings the two hands in
  grip: 0.85,     // both hands closed on it
  breath: 0.030,  // the cradle's own rise and fall, as a share of the arm angle
  rate: 1.15,     // radians/s — a slow, heavy breath
};

// The two one-shots' own keys, on the shape's clock. Both START and END on the cradle, so the
// hold takes over from either of them without a step.
const TOTE_THROW = {
  upX:   [[0, TOTE.upX], [0.30, 1.25], [0.48, -1.85], [1, TOTE.upX]],
  elbow: [[0, TOTE.elbow], [0.30, -1.05], [0.48, -0.22], [1, TOTE.elbow]],
  lean:  [[0, TOTE.lean], [0.30, -0.230], [0.48, 0.300], [1, TOTE.lean]],
  head:  [[0, TOTE.head], [0.48, -0.120], [1, TOTE.head]],
  hipY:  [[0, HIP_Y], [0.30, HIP_Y + 0.030], [0.48, HIP_Y - 0.025], [1, HIP_Y]],
  grip:  [[0, TOTE.grip], [0.44, TOTE.grip], [0.56, 0.10], [1, TOTE.grip]],
};
const TOTE_SLAM = {
  upX:   [[0, TOTE.upX], [0.36, -2.60], [0.56, -0.70], [1, TOTE.upX]],
  elbow: [[0, TOTE.elbow], [0.36, -0.50], [0.56, -0.10], [1, TOTE.elbow]],
  lean:  [[0, TOTE.lean], [0.36, -0.240], [0.56, 0.520], [1, TOTE.lean]],
  head:  [[0, TOTE.head], [0.36, 0.020], [0.56, 0.360], [1, TOTE.head]],
  hipY:  [[0, HIP_Y], [0.36, HIP_Y + 0.045], [0.56, HIP_Y - 0.055], [1, HIP_Y]],
  grip:  [[0, TOTE.grip], [0.48, TOTE.grip], [0.60, 0.10], [1, TOTE.grip]],
};

function poseTote(bones, u, kind, t) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const shot = kind === "throw" ? TOTE_THROW : kind === "slam" ? TOTE_SLAM : null;
  let upX = TOTE.upX;
  let elbow = TOTE.elbow;
  let lean = TOTE.lean;
  let head = TOTE.head;
  let grip = TOTE.grip;
  let hip = 0;
  let sway = 0;
  if (shot) {
    const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
    upX = kf(k, shot.upX);
    elbow = kf(k, shot.elbow);
    lean = kf(k, shot.lean);
    head = kf(k, shot.head);
    grip = kf(k, shot.grip);
    // ...and the hoist and the drive, as a DELTA off the standing hip rather than an absolute
    // height: the body underneath may be running, and the run owns that number (see below).
    hip = kf(k, shot.hipY) - HIP_Y;
  } else {
    sway = Math.sin(t * TOTE.rate) * TOTE.breath;
  }
  // THE ARMS ARE THE POSE; THE BODY IS THE BODY'S (session 184 — the same call session 180 made for
  // the one-hand carry, and the same one THE BLOCK makes). Everything down here used to be an
  // ABSOLUTE write — the trunk's pitch, its yaw and its roll zeroed, the head's three axes, the
  // hips' two — and an absolute write of a channel the BASE layer is already animating is exactly
  // the bug session 180 fixed in `poseCarry`: at a sprint the run authors a real trunk lean and a
  // real shoulder counter-rotation every frame, and zeroing them the moment the duffel came up made
  // the body stand up and stop swinging, which is the *"separate animation"* the user can see. So
  // the trunk's fold and the head are written ADDITIVELY (`poseAdd`) — a body standing still with
  // the bag gets the cradle's own lean and the head over the load, and a body RUNNING with it leans
  // INTO the run instead of being straightened by it — and the yaw/roll zeroes and the hips' resets
  // are gone entirely: they are the cycle's, and the cycle is underneath. The arms are untouched by
  // any of this and are still the whole of what the layer exists to write.
  if (hip) bones.hips.position.y += hip * e;
  poseAdd(bones, "torso", "x", lean, e);
  poseAdd(bones, "head", "x", head, e);
  poseSettleTorso(bones, e);
  // ...and the twist is written HERE rather than left to whatever the base layer happens to be
  // doing with it: it is the one arm channel the idle and the run disagree about (the idle carries a
  // +-0.45 twist, the run's swing writes 0), and it is worth 0.15 of hand separation — enough that a
  // run would open the hands off the bag's ends and put them back out in the air. One number, so the
  // cradle is the same shape standing and sprinting (measured: 0.54 of hand separation either way).
  poseArmAngles(bones, -1, upX + sway * 0.5, TOTE.upZ + sway, elbow, e, TOTE.twist);
  poseArmAngles(bones, 1, upX - sway * 0.5, TOTE.upZ - sway, elbow, e, -TOTE.twist);
  poseWrist(bones, -1, TOTE.wrist, 0, 0, e);
  poseWrist(bones, 1, TOTE.wrist, 0, 0, e);
  poseGrip(bones, grip, e);
}

// ---------------------------------------------------------------------------
// THE HANDS — the thing carried in one hand (see "THE HANDS" in inventory.js).
//
// The duffel's tote above takes BOTH arms because a duffel needs both. What this one holds is a
// single item (in practice the soccer ball), so it takes ONE arm — the character's own right, which
// is the `...L` bone (`side` < 0 — see `poseArmAngles`) — and swings it a little out and forward so
// its hand sits on top of what it is carrying. The pose is deliberately SMALL: it has to survive a
// run, a slide and a wall climb (the gear pins the item to the trunk at a fixed offset and this
// layer is what puts the arm where the item actually is), and a big heroic carry silhouette would
// read as a mime the moment the legs started doing parkour underneath it.
//
// The numbers are read off the rig, not guessed: the hand's own position in the torso's frame was
// scanned over the (upX, upZ, elbow) grid and the corner chosen is the one that puts the palm at
// roughly (-0.44, -0.11, 0.18) — out, low and a little forward, which is where a hand rests on a
// ball held at the hip. `upZ` 0.24 is what buys the width: with the arm hanging it is at -0.336 and
// a ball of BALL_R needs the hand well outboard of the thigh it would otherwise sink into.
//
// SESSION 180 — THE ARM IS THE WHOLE OF IT. The brief, verbatim: *"dont make a separate animation
// of the run when im carrying the ball make it the same animation as the run but the arm im
// carrying with have like its own animation like what we did for the block"*. It USED to write the
// trunk as well, and that was the bug the brief is about: `poseRot(bones, "torso", "x", CARRY.lean)`
// is an absolute write of the trunk's pitch, so a body carrying a ball at a SPRINT — where the run's
// own lean is 0.68 rad — had its chest dragged back to −0.024 the moment this layer's weight
// reached 1. The legs ran and the trunk stood up, which is exactly "a separate animation of the
// run" — and the head had a channel of its own doing the same thing.
//
// So the carry is now written the way THE BLOCK is (see the arms-only note on `BLOCK` above): the
// ARMS are the whole of it and the body underneath is never touched. Nothing else about it moved —
// the four arm numbers are the same solve they always were — and the trunk and head channels are
// DELETED rather than zeroed, so there is no number left to be applied by accident.
//
// ...and it has a stroke of its own, which is the other half of the brief ("like its own
// animation", the way the block's arm is its own animation): the arm RIDES THE STRIDE. `stride` is
// the run's own phase and `strideAmt` how much of the cycle the base layer is playing (`runBlend`),
// so the hand bobs with the step and the elbow closes a little as the body comes down over it — the
// arm is CARRIED by the run rather than parked on it. Deliberately small (0.055 rad of swing): the
// arm is holding something, and a big pump would read as a mime.
// ---------------------------------------------------------------------------
const CARRY = {
  upX: -0.120,    // the upper arm swings forward, out of the ball's way
  upZ: 0.240,     // ...and out — see the note above
  elbow: -0.500,  // the forearm folds up under it
  wrist: -0.150,  // the palm lays back a little, cupping the ball's inner side
  grip: 0.75,     // the hand is closed on it
  breath: 0.018,  // the carry's own rise and fall, as a share of the arm angle
  rate: 1.05,     // radians/s
  swing: 0.055,   // ...and the arm's own ride on the stride (session 180 — see the note above)
};

function poseCarry(bones, u, t, stride, strideAmt) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const sway = Math.sin(t * CARRY.rate) * CARRY.breath;
  const amt = strideAmt === undefined ? 1 : strideAmt < 0 ? 0 : strideAmt > 1 ? 1 : strideAmt;
  const step = Math.sin((stride || 0) * Math.PI * 2) * CARRY.swing * amt;
  poseArmAngles(bones, -1, CARRY.upX + sway * 0.5 + step, CARRY.upZ + sway, CARRY.elbow - step * 0.55, e);
  poseWrist(bones, -1, CARRY.wrist, 0, 0, e);
  poseGripSide(bones, -1, CARRY.grip, e);
}

// ---------------------------------------------------------------------------
// THE BALL ACTIONS — THREE WAYS THE BALL LEAVES HIM.
//
// The user's own words for them, over four sessions: *"heres an animation for when the player throws
// the ball (Goalkeeper Drop Kick.fbx) it doesnt have ball animations so your gonna have to make
// them"* and *"make me if i m1 while im controlling the ball make me do a shoot and heres the
// shooting animation (Strike Foward Jog.fbx) this one also doesnt have ball animations"* (session
// 180), *"add a better ball throw animation"* (session 183), *"make me able to slam it and it spins
// like how we did for the bag"* (session 189), and *"add a better ball shoot animation and make
// shooting the ball chargeable"* (session 198).
//
// All three are AUTHORED BEATS now, and all three wear the same machinery: a table of keyed angles
// blended channel by channel, each segment eased on its own — so every beat is a small pose-to-pose
// hold and the whip between two of them reads as a whip rather than as one long lerp — applied
// through the helpers every other pose in this file uses. The two clips the user provided were
// retargeted offline first (see `src/tools/action-bake/`), and each was what the game wore for a
// few sessions before being replaced: the throw in session 183 (a keeper's drop kick is a PUNT — the
// ball left the hand while the arm was still down at the hip) and the shoot in session 198. That
// directory is kept as the record of where they came from; nothing here loads an FBX or a loader any
// more, and the game ships no clip for the ball at all.
//
//   THE THROW (`THROW`, M1 with it in his hand)   the overhand throw: six authored beats of trunk,
//     head and arm, starting and ending on `CARRY`'s own numbers so it grows out of the carry and
//     settles back into it. An OFFSET layer: the trunk's fold and the head are additive, so a throw
//     at a sprint leans into the run instead of standing it up.
//   THE SLAM (`BALL_SLAM`, M2 with it in his hand, session 189)   the same six columns, driving the
//     ball up over the head and down into the deck a step ahead, where it comes off LIVE exactly as
//     the duffel does out of both arms.
//   THE SHOOT (`SHOOT`, M1 with it at his feet, re-authored in 198)   the strike, and the only one
//     of the three whose columns key the foot's own PLACE rather than joint angles — see its own
//     block below. It is also the only one a player can CHARGE.
//
// THE LAYER. `poseBallAction` is written LAST of everything the rig does (see the call in
// `player.js`'s `updateVisual`, after the tote): it is one shape over whatever the body is already
// doing — the run's legs, the carry arm, a slide — and it EASES onto the rig bone by bone (`u`, the
// layer's own weight), so at `u` 1 the body IS the shape and at `u` 0 it is not there at all. The
// ball itself is not this file's business: while it is in the hand the gear pins it to the hand bone
// (`syncCarry`), so it rides the wind-up for free, and the gear launches it on the release key.
// ---------------------------------------------------------------------------

// THE THROW — AUTHORED HERE, not baked (session 183: the user's *"add a better ball throw
// animation"*).
//
// It used to be the keeper's drop kick (session 180: 25 keys of `Goalkeeper_Drop_Kick.fbx`,
// 2.20s..3.20s of it). That CLIP is not a throw: the keeper holds the ball out in one hand, DROPS it
// and PUNTS it, and the window that was taken is the punt — so the ball was leaving the hand at
// 61.8% of the shape while the arm was still down at the hip and the boot was on its way through
// (measured on the live rig at that frame: the hand at (0.39, 0.74, −0.85), the trunk already
// folding). It read as a drop kick that happens to have a ball in it, which is what the user was
// looking at when he asked for a better one.
//
// So the throw is a POSE now, written the way every other move in this file is: six beats of trunk,
// head and arm angles in the rig's own `poseArmAngles` / `poseRot` units, blended channel by channel
// and applied with the helpers. The arm that throws is the arm that CARRIES (`bones.handL` — the one
// `syncCarry` pins the ball to and `releaseHandThrow` reads it off), so the shape STARTS and ENDS on
// `CARRY`'s own numbers and the layer can come on and go off without a pop.
//
// It is an OFFSET LAYER, which is the one thing a baked table could not be: the trunk's FOLD and the
// head are written ADDITIVELY (`poseAdd`) and the free arm's counterweight rides whatever the run
// already has, so a throw thrown at a sprint leans into the run instead of standing it upright. The
// ball arm and the trunk's TWIST are absolute — the carry owns the arm, and nothing else owns the
// twist while a throw is in the air.
//
// The beats, with where the throwing HAND ends up in the body's own frame (fwd/side/up, measured on
// the live rig — see "THE THROW" in README.md for the solve):
//
//   t 0.00  START    the carry, exactly: the ball at the hip, nothing moves on the first frame.
//   t 0.24  DRAW     the ball sweeps out and back (hand 0.03 out / −0.72 fwd-side / 0.63 up), the
//                    elbow folds up, the trunk turns away (−0.20) and the free arm comes up and
//                    across to point at the target.
//   t 0.46  COCK     the coil: trunk twisted −0.46, the throwing elbow out at shoulder height and
//                    the ball up behind the head (hand −0.42 fwd / 1.22 up), face still on target.
//   t 0.60  RELEASE  where the ball leaves: the arm whips over the top (hand 0.58 fwd / 1.25 up) and
//                    the trunk unwinds THROUGH neutral to +0.28 as the fold comes in (+0.20).
//   t 0.78  FOLLOW   the arm crosses the body low and the trunk stays folded and twisted.
//   t 1.00  SETTLE   back onto the carry, so the layer's own fade (BALL_POSE_FADE, 0.08 s) has
//                    nothing to cover — the hand is already where the carry keeps it.
//
// Columns: t, fold(+), twist, roll, headPitch(+), headYaw, ball[upX, upZ, elbow, twist, wrist],
// free[upX, upZ, elbow]. Both arms and the trunk were solved against hand positions on the rig
// rather than eyeballed (see the session 183 row in SPEC.md).
const THROW_SECONDS = 0.72;      // the shape's own length, in the units its keys are timed in
const THROW_RELEASE = 0.60;      // where the ball leaves it — the RELEASE beat (0..1)
const THROW = [
  [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, CARRY.upX, CARRY.upZ, CARRY.elbow, 0.00, CARRY.wrist, 0.189, -0.224, -0.714],
  [0.24, 0.02, -0.20, 0.02, 0.02, 0.14, 0.60, 0.60, -2.02, -0.40, -0.10, -0.85, 0.36, -0.95],
  [0.46, -0.04, -0.46, 0.05, 0.05, 0.32, -3.20, 1.30, -2.31, 0.00, -0.20, -1.30, 0.34, -0.70],
  [0.60, 0.20, 0.28, -0.02, 0.08, -0.10, -1.80, -0.10, -2.05, 0.40, -0.35, -0.35, 0.50, -1.10],
  [0.78, 0.26, 0.42, -0.05, 0.10, -0.16, -0.10, -1.10, -1.67, 0.00, -0.30, 0.55, 0.62, -1.20],
  [1.00, 0.00, 0.00, 0.00, 0.00, 0.00, CARRY.upX, CARRY.upZ, CARRY.elbow, 0.00, CARRY.wrist, 0.189, -0.224, -0.714],
];

// THE SLAM — THE SAME AUTHORED-BEAT MACHINERY AS THE THROW, DRIVING THE BALL DOWN INSTEAD OF OVER
// THE SHOULDER (session 189: the user's *"make me able to slam it and it spins like how we did for
// the bag"*). The ball already had two ways out of the hand — the overhand THROW (M1) and the boot's
// SHOOT (M1 with it at his feet) — and this is the third: M2, the ball taken up overhead and driven
// straight into the deck a step ahead, where it comes off LIVE, exactly as the duffel does out of
// both arms (see "THE HOT BAG" and `releaseHandSlam` in inventory.js).
//
// SAME COLUMNS AS `THROW` (t, fold(+), twist, roll, headPitch(+), headYaw, ball[upX, upZ, elbow,
// twist, wrist], free[upX, upZ, elbow]), and the same three rules hold: the ball arm is the CARRY's
// arm (`bones.handL` — the bone `syncCarry` pins it to and the two release beats read it off), the
// shape STARTS and ENDS on `CARRY`'s own numbers so the layer can come on and go off without a pop,
// and the trunk's FOLD and the HEAD are written ADDITIVELY (`poseAdd`) while the ball arm and the
// trunk's twist are absolute.
//
// The beats, with where the throwing HAND is on the way (the mirror of the throw's own path):
//
//   t 0.00  START    the carry, exactly: the ball at the hip, nothing moves on the first frame.
//   t 0.22  RAISE    the ball comes up in front of the shoulder (the elbow folds under it), the
//                    trunk starts turning away (−0.22) and the free arm counterweights back.
//   t 0.44  HIGH     the coil: the ball up over the head (upX −2.95, past vertical), the trunk
//                    leaning away from the drive (−0.06 fold, −0.30 twist), the eyes down at where
//                    it is going.
//   t 0.56  RELEASE  where the ball leaves: the arm has come over the top and DOWN through the
//                    front (upX −1.45, the elbow opening), the trunk folding INTO the drive (+0.26)
//                    as the twist unwinds past neutral — the ball is driven at the deck from here.
//   t 0.76  FOLLOW   the arm finishes low and across, the trunk stays folded over it.
//   t 1.00  SETTLE   back onto the carry, so the layer's own fade (BALL_POSE_FADE) has nothing to
//                    cover — the hand is already where the carry keeps it.
const BALL_SLAM_SECONDS = 0.66;   // the shape's own length, in the units its keys are timed in
const BALL_SLAM_RELEASE = 0.56;   // where the ball leaves it — the RELEASE beat (0..1)
const BALL_SLAM = [
  [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, CARRY.upX, CARRY.upZ, CARRY.elbow, 0.00, CARRY.wrist, 0.189, -0.224, -0.714],
  [0.22, -0.05, -0.22, 0.03, -0.03, 0.16, -2.15, 0.70, -1.95, -0.25, -0.30, 0.30, 0.10, -1.05],
  [0.44, -0.06, -0.30, 0.02, -0.05, 0.20, -2.95, 0.45, -2.30, -0.10, -0.15, 0.20, 0.20, -0.95],
  [0.56, 0.26, 0.12, -0.03, 0.12, -0.04, -1.45, 0.15, -0.80, 0.25, -0.40, -0.35, 0.25, -0.90],
  [0.76, 0.40, 0.22, -0.04, 0.16, -0.08, -0.70, 0.05, -0.30, 0.06, -0.40, -0.15, 0.50, -0.72],
  [1.00, 0.00, 0.00, 0.00, 0.00, 0.00, CARRY.upX, CARRY.upZ, CARRY.elbow, 0.00, CARRY.wrist, 0.189, -0.224, -0.714],
];

// =============================================================================================
// THE SHOOT — AUTHORED, AND THE ONE YOU CAN CHARGE (session 198: the user's *"add a better ball
// shoot animation and make shooting the ball chargeable"*).
//
// WHAT IT WAS. Session 180's bake of the user's own `Strike_Foward_Jog.fbx` — 16 keys over
// 0.28s..0.90s of it. Three things were wrong with it, and the first two are why it read as
// something other than a kick: it is a generic forward STRIKE off a jog (there is no ball in the
// clip and no ball in the shape), it was applied to the whole rig as an ABSOLUTE
// `bone.quaternion.slerp` — so at a sprint it stood the run up, stopped the legs dead and threw the
// trunk at the clip's own lean (the exact class of bug session 180 fixed in `poseCarry`) — and the
// ball left the boot 0.20 s into the shape, with the strike's own wind-up still in front of it. The
// bake stays in `src/tools/action-bake/` as the record; the clip no longer ships.
//
// THE ONE IDEA IN IT: the columns key the striking ANKLE'S OWN PLACE — how far ahead of the hips it
// is and how high over the deck — and `legIK` solves the thigh and the knee, exactly as the run
// cycle does (`legPlan` / `legIK`). Every other authored shape in this file keys joint angles; this
// one keys the CONTACT, because the contact is the whole point of the shape and "the ankle this far
// forward, this high" is a number that can be checked against where the ball actually is. At the
// RELEASE beat the target IS the ball's own place (`SHOOT_AHEAD` ahead, `SHOOT_BALL_UP` up — the
// ball's radius, so the boot is aimed at its middle) and it is DELIBERATELY out of the leg's reach:
// `legIK` clamps to `LIMB`, so the leg comes out FULLY EXTENDED and POINTING AT THE BALL, which is
// what a strike is. The leg is drawn long at the top of the throw for the same reason
// (`poseStretchChain`), which closes the last of the gap. The measured contact is in the session
// 198 row of SPEC.md and the "SHOOT" entry in README.md.
//
// THE CHARGE. `t` is the shape's phase (0..1) and `charge` is how full the hold was. A held charge
// SITS ON the COCK beat: the wind-up runs there over `SHOOT_WINDUP` and waits, and the power builds
// into a deeper coil (`build`, below) with a slow tremble riding it — the hips sink, the trunk winds
// a little further, the arms tighten. Releasing lets the phase run on to 1 at a rate the POWER sets
// (the two `SHOOT_SWING_*` in inventory.js), so the shape is always that long from the release
// however far it had wound, and a tap comes out a short quick flick where a full charge comes out a
// long heavy one. The coil's own in and out are on the SHAPE's clock, so it is at its deepest on the
// beat a full charge is actually sitting on and gone by the time the boot is through.
//
// Columns: t,
//   hip[dip, yaw, roll],                 // dip = rig units off `HIP_Y`; yaw positive leads the
//                                        // character's own LEFT hip forward (the run's own `tw`)
//   trunk[fold(+), twist, roll],         // the fold is ADDITIVE (`poseAdd`); the twist is
//                                        // absolute, positive = the right shoulder forward (the
//                                        // run shears its shoulders the other way, with `-tw`)
//   head[pitch(+), yaw],                 // the pitch is ADDITIVE; positive = looking down
//   kick[fwd, up, sole, splay],          // the striking ankle: fwd = ahead of the hips, up = height
//                                        // over the deck, sole = the foot's pitch in the hips'
//                                        // frame (+ toe-down — the run's own
//                                        // `foot.rotation.x = sole - thigh - knee`), splay = the
//                                        // thigh's abduction (+ outward)
//   plant[fwd, up, sole, splay],
//   armA[upX, upZ, elbow, twist],        // the striking side's arm (side -1: the rig's `...L` bones,
//                                        // the character's own right)
//   armB[upX, upZ, elbow, twist],        // ...and the far one, which counterweights it
//   grip                                 // both fists
// Every signed channel is the one every other pose in this file uses: `poseArmAngles`'s `upX`
// negative = forward, `upZ` positive = out from the body, `elbow` negative = folded. The beats,
// with where the striking ankle IS at each of them (fwd / up, rig units, the deck at 0):
//
//   t 0.00  SET      the rest: both feet under the hips, everything neutral. The layer can come on
//                    and go off here with nothing to hide, and the last beat is the same row.
//   t 0.22  PLANT    the plant foot has stepped down ahead (0.16 fwd) and the striking leg is
//                    drawing back (-0.15 / 0.28), the body squaring to the ball.
//   t 0.44  COCK     the coil, and where a held charge SITS: the striking ankle is behind him and
//                    up (-0.44 / 0.34), the pelvis wound, the trunk turned away, the arms cocked.
//   t 0.62  RELEASE  the boot is through the ball: the ankle target is the ball's own place
//                    (0.62 / 0.28) — out of reach on purpose, so the leg is extended at it — the
//                    pelvis has whipped through and the trunk is folding in over the strike.
//   t 0.80  FOLLOW   the leg has carried up and across (0.30 / 0.66) with the knee folded, the trunk
//                    still folded over it, and the arms have swapped sides.
//   t 1.00  SETTLE   home, onto the same row t 0.00 is.
const SHOOT = {
  cock: 0.44,      // the beat a HELD charge sits on (`poseShoot` freezes the phase here while the
                   // button is down, and the `build` is keyed off this number, not a literal)
  release: 0.56,   // the beat the BALL LEAVES on, and it is the boot's arrival rather than the
                   // table's own RELEASE row: measured in session 198, the striking boot's box gets
                   // within 4.3 cm of the ball's centre at phase 0.563 and covers the ball's launch
                   // place from 0.563 through 0.685, so firing at 0.56 puts the ball gone on the
                   // frame the boot actually reaches it rather than a frame or two after the boot
                   // has already swept past it (which is what the row's own 0.62 did)

  rows: [
    [0.00,  0.000,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,
      ANKLE_Z, ANKLE_Y, 0.00, 0.05,   ANKLE_Z, ANKLE_Y, 0.00, 0.05,
      0.00, 0.16, -0.26, 0.00,   0.00, 0.16, -0.26, 0.00, 0.50],
    [0.22, -0.030,  0.10,  0.02, -0.04, -0.14,  0.05,  0.02, -0.06,
      -0.15, 0.280, 0.55, 0.12,   0.16, ANKLE_Y, 0.02, 0.03,
      0.35, 0.32, -0.55, 0.10,  -0.25, 0.28, -0.80, -0.10, 0.62],
    [0.44, -0.075,  0.30,  0.05, -0.10, -0.34,  0.12,  0.06, -0.22,
      -0.44, 0.340, 0.78, 0.17,   0.22, ANKLE_Y, 0.03, 0.02,
      0.70, 0.45, -0.75, 0.15,  -0.75, 0.20, -1.20, -0.15, 0.72],
    [0.62, -0.040, -0.34, -0.02,  0.24,  0.26, -0.06,  0.14, -0.04,
      0.620, 0.280, 0.50, 0.06,   0.26, ANKLE_Y, 0.00, 0.02,
      -0.30, 0.35, -0.95, 0.05,   0.50, 0.50, -0.65, 0.10, 0.80],
    [0.80,  0.010, -0.28, -0.04,  0.30,  0.20, -0.08,  0.10,  0.06,
      0.300, 0.660, 0.10, 0.02,   0.18, ANKLE_Y, 0.08, 0.02,
      -0.60, 0.30, -1.20, 0.00,   0.70, 0.45, -0.50, 0.16, 0.55],
    [1.00,  0.000,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,  0.00,
      ANKLE_Z, ANKLE_Y, 0.00, 0.05,   ANKLE_Z, ANKLE_Y, 0.00, 0.05,
      0.00, 0.16, -0.26, 0.00,   0.00, 0.16, -0.26, 0.00, 0.50],
  ],
};

const SHOOT_SIDE = -1;       // the striking leg: the character's own right (the rig's `...L` bones —
                             // the value `RK` carries, spelled out because this block sits above it)
const SHOOT_BALL_UP = 0.28;  // the ball's own radius (`PROP_ROLL_R.ball` in inventory.js) — the
                             // release target's height, because the boot is aimed at its middle
// THE BUILD — what a HELD charge adds on top of the wound-up COCK. It is applied by `build` below,
// which is 1 at the beat a full hold sits on and 0 anywhere else, so these are the depths of a
// fully-charged coil rather than rates: the hips sink another 7.5 cm, the pelvis and the shoulders
// wind a few degrees further, the striking leg's thigh abducts a little more, and both elbows close.
const SHOOT_BUILD = { dip: -0.075, yaw: 0.07, fold: -0.05, twist: -0.07, splay: -0.05, elbow: -0.22 };

// ONE LEG of the strike. The same bargain as `poseLegAngles` — a side, a target per joint, an eased
// approach — except the two links' targets come out of `legIK` from the foot's own PLACE (see the
// block above), and the sole is written the way the RUN writes it rather than the way
// `poseLegAngles` does: the sum of the two links' angles is taken back out of the foot, so `sole` is
// the foot's pitch in the hips' frame rather than a hinge angle, and a "flat" foot is flat whatever
// the knee happens to be doing. `hipY` has to be the height the pelvis is ACTUALLY at (see
// `poseHipY` in `poseShoot`), or the solve is measured off a hip that is not there.
function poseShootLeg(bones, side, fwd, up, sole, splay, hipY, e) {
  const U = side < 0 ? bones.legUpperL : bones.legUpperR;
  const L = side < 0 ? bones.legLowerL : bones.legLowerR;
  const F = side < 0 ? bones.footL : bones.footR;
  if (!U || !L || !F) return;
  const ik = legIK(fwd, up - hipY);
  U.rotation.x += (ik.thigh - U.rotation.x) * e;
  L.rotation.x += (ik.knee - L.rotation.x) * e;
  U.rotation.z += (side * splay * POSEX - U.rotation.z) * e;
  F.rotation.x += ((sole - ik.thigh - ik.knee) - F.rotation.x) * e;
  F.rotation.z += (0 - F.rotation.z) * e;
}

const _shoot = new Array(26);
// `lower` is HOW MUCH OF THE LOWER HALF IS THE SHAPE'S, 0..1 (see `SHOOT_LEG_*` in inventory.js and
// `ballLower`). It exists because a charge is up to a whole second of standing on the ball, and a
// body RUNNING through that second cannot be wearing a planted coil: the boot would be nailed to the
// deck while the man went on down the street. At 0 the hips and both legs are left alone — the run
// keeps them — and the shape keeps only the half it can read from a moving body: the trunk, the head
// and the arms. Everything below is gated through `le` (the layer's own ease taken down by `lower`),
// and the numbers the legs are solved from (`hipY`) are gated with them, because a hip height written
// by this shape over another pose's legs would drive those feet through the deck.
function poseShoot(bones, e, t, charge, clock, lower) {
  const tt = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const lw = lower === undefined || lower === null ? 1 : lower <= 0 ? 0 : lower >= 1 ? 1 : lower;
  const le = e * lw;
  const K = SHOOT.rows;
  let i = 0;
  while (i < K.length - 2 && tt >= K[i + 1][0]) i++;
  const a = K[i];
  const b = K[i + 1];
  const span = b[0] - a[0];
  const s = poseEase(span > 1e-6 ? (tt - a[0]) / span : 1);
  for (let c = 1; c < 26; c++) _shoot[c] = a[c] + (b[c] - a[c]) * s;

  // THE CHARGE'S OWN BUILD — how deep the coil is, and the only thing on this shape that reads how
  // long the button has been down. Both of its ends are the SHAPE's clock, so it is full exactly
  // where a held charge sits (the COCK beat) and gone by the time the strike is through.
  const ch = charge > 1 ? 1 : charge < 0 ? 0 : (charge || 0);
  const build = ch * smooth01((tt - 0.10) / 0.24) * smooth01((SHOOT.cock + 0.18 - tt) / 0.18);

  const dip = _shoot[1] + build * SHOOT_BUILD.dip;
  const hipY = HIP_Y + dip;
  poseAdd(bones, "torso", "x", _shoot[4] + build * SHOOT_BUILD.fold, e);
  poseRot(bones, "torso", "y", _shoot[5] + build * SHOOT_BUILD.twist, e);
  poseRot(bones, "torso", "z", _shoot[6], e);
  poseAdd(bones, "head", "x", _shoot[7], e);
  poseRot(bones, "head", "y", _shoot[8], e);
  poseSettleTorso(bones, e);
  poseArmAngles(bones, SHOOT_SIDE, _shoot[17], _shoot[18], _shoot[19] + build * SHOOT_BUILD.elbow, e, _shoot[20]);
  poseArmAngles(bones, -SHOOT_SIDE, _shoot[21], _shoot[22], _shoot[23] + build * SHOOT_BUILD.elbow, e, _shoot[24]);
  if (le > 0.002) {
    poseHipY(bones, hipY, le);
    poseRot(bones, "hips", "y", _shoot[2] + build * SHOOT_BUILD.yaw, le);
    poseRot(bones, "hips", "z", _shoot[3], le);
    poseShootLeg(bones, SHOOT_SIDE, _shoot[9], _shoot[10], _shoot[11],
      _shoot[12] + build * SHOOT_BUILD.splay, hipY, le);
    poseShootLeg(bones, -SHOOT_SIDE, _shoot[13], _shoot[14], _shoot[15], _shoot[16], hipY, le);
    // ...and the LEG'S OWN STRETCH (see `poseStretch`): a leg driven through a ball is drawn long at
    // the top of the throw, which is also what closes the last of the gap the IK cannot reach — see the
    // measured contact in the session 198 row of SPEC.md. It is keyed off the PHASE rather than off the
    // layer's weight, because the weight would hold the stretch open for as long as the layer is worn.
    // It is asked for through `lower` like everything else down here: a stretch on a leg the run owns
    // is the shape's hand on a leg that is not its own.
    const st = kf(tt, [[0, 1], [0.50, 1], [0.60, 1.18], [0.72, 1.10], [1, 1]]);
    poseStretchChain(bones, "leg", SHOOT_SIDE, 1 + (st - 1) * lw);
  }

  // ...and THE TREMBLE of a body holding a charge: a small, slow shake on the trunk and the head
  // only, scaled by the build, so a full hold is visibly loaded rather than a still. It rides the
  // shape's own clock (the phase is standing still while a hold does), and it is deliberately on the
  // roll and the yaw — a pitch tremble reads as a stutter, not as a coil being wound.
  if (build > 0.002 && clock > 0) {
    const q = Math.sin(clock * 21) * build * 0.013;
    poseAdd(bones, "torso", "z", q, e);
    poseAdd(bones, "head", "y", -q * 1.5, e);
  }
  poseGrip(bones, _shoot[25], e);
}



// THE BALL ARMS' OWN WRITER — one writer for the two AUTHORED shapes (see `THROW` and `BALL_SLAM`
// above). Six beats, blended channel by channel — each segment eased on its own, so every beat is a
// small pose-to-pose hold and the whip between the coil and the release reads as a whip rather than
// as one long lerp — then applied with the helpers every other pose in this file uses. The trunk's
// fold and the head are ADDITIVE (`poseAdd`), the trunk's twist and both arms are absolute, and the
// BALL HAND is gripped and then OPENED across the shape's own release beat, which is this family's
// read of "the ball has left".
//
// `K` is the table and `release` the beat inside it where the hand opens; the two callers are the
// throw (`THROW` / `THROW_RELEASE`, session 183) and the slam (`BALL_SLAM` / `BALL_SLAM_RELEASE`,
// session 189). Nothing here tests which one it is: the shapes are the same six columns, so the
// writer is the same code.
const _throw = new Array(14);
function poseBallBeats(bones, e, t, K, release) {
  const tt = t <= 0 ? 0 : t >= 1 ? 1 : t;
  let i = 0;
  while (i < K.length - 2 && tt >= K[i + 1][0]) i++;
  const a = K[i];
  const b = K[i + 1];
  const span = b[0] - a[0];
  const s = poseEase(span > 1e-6 ? (tt - a[0]) / span : 1);
  for (let c = 1; c < 14; c++) _throw[c] = a[c] + (b[c] - a[c]) * s;
  poseAdd(bones, "torso", "x", _throw[1], e);
  poseRot(bones, "torso", "y", _throw[2], e);
  poseRot(bones, "torso", "z", _throw[3], e);
  poseAdd(bones, "head", "x", _throw[4], e);
  poseAdd(bones, "head", "y", _throw[5], e);
  poseArmAngles(bones, -1, _throw[6], _throw[7], _throw[8], e, _throw[9]);
  poseWrist(bones, -1, _throw[10], 0, 0, e);
  poseArmAngles(bones, 1, _throw[11], _throw[12], _throw[13], e);
  // The hand: closed on the ball until the release, then opening over a tenth of the shape (a hand
  // that stays a fist while the ball leaves it reads as a stuck hand).
  const open = Math.max(0, Math.min(1, (tt - release) / 0.10));
  poseGripSide(bones, -1, 0.90 - 0.78 * open * open * (3 - 2 * open), e);
}

// `t` is the shape's own phase, 0..1, and it is a ONE-SHOT: the last beat is reached exactly at 1
// rather than wrapping onto the first, and the phase is what a held charge stands still on (see
// `poseShoot`). `charge` is how full that hold was and `clock` is the shape's own running seconds
// (only the charge's tremble reads it); both are ignored by the throw and the slam, which are
// over in well under a second and have nothing to hold. `lower` is the SHOOT's own third question —
// how much of the hips and legs the shape owns (see `poseShoot`, and `ballLower` in inventory.js) —
// and the other two shapes have no use for it at all: neither writes a leg.
function poseBallAction(bones, u, kind, t, charge, clock, lower) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  if (kind === "throw") return poseBallBeats(bones, e, t, THROW, THROW_RELEASE);
  if (kind === "slam") return poseBallBeats(bones, e, t, BALL_SLAM, BALL_SLAM_RELEASE);
  return poseShoot(bones, e, t, charge, clock, lower);
}


// ---------------------------------------------------------------------------
// SKYFALL — the long fall off something tall (see `Player.skyfall` in player.js).
//
// A hop between roofs, a dive and a slam all own the air for about a second. Falling off a
// BUILDING is the one time the body is up there long enough to be read as a shape rather than
// as a blur, so it gets a family of shapes instead of one pose — the film-fall set: the
// head-first torpedo, the skydiver's arch, the flat star, the feet-first hero drop, the
// punch-down descent and the loose flail. Which one a given fall wears is decided in
// player.js (some shapes belong to the situation, some are the roll of the dice); this file
// only owns what they look like, and the two things they all share:
//
//   * THE BRACE. As the ground comes up, every shape is blended toward one landing pose —
//     feet down, knees soft, arms out — because a fall that meets the deck still in its
//     cruise shape vanishes INTO the deck. The blend is the last half second, driven by the
//     time-to-impact (player.js), so a fast fall braces late and hard and a slow one drifts
//     down into it.
//
//   * THE DRIFT. A falling body is not a still. `t` (seconds in the fall) sways the limbs a
//     few degrees each, out of phase, scaled by `move` (the speed) — a slow drop barely
//     stirs and a fast one is alive. It is deliberately SMALL: a big flutter is a wobble, and
//     a wobble in mid-air reads as a bug (which is why the dive's flutter was deleted).
//
// Every row carries its own RIG LEAN as well (`lean` = radians of body pitch, `leanSpd` = the
// extra at speed), because the shape and the angle it is held at are one decision: the
// torpedo is only a torpedo because the body is past flat and the feet-first drop is only
// heroic because the body is upright. `player.js` reads them back through
// `charMesh.userData.fallLean(kind, speed)`.
// ---------------------------------------------------------------------------

const FALL = {
  drift: 0.075,   // radians of limb sway at full speed (the fine, fast tremble on top of the cycle)
  ramp: 0.40,     // seconds of fall before the motion below is all the way on
};

// hipY, torso [x, y, z], head [x, y], arm [upX, upZ, elbow], leg [thigh, knee, sole, splay].
const FALL_KINDS = {
  // HEAD-FIRST: the body past flat, arms swept back along the flanks like a dart, legs
  // straight together and toes pointed. The one that says "I know exactly where I am going".
  aim: {
    name: "HEAD-FIRST DIVE",
    hipY: 0.06,
    torso: [-0.12, 0, 0],
    head: [-0.28, 0],
    // Swept back and clearly OUT. This is the one shape the chase camera sees nearly END-ON
    // (the body is aimed away down the fall line), so everything that breaks the silhouette has
    // to be LATERAL: a first pass at `upZ` 0.30 with the legs together came back from review as
    // "a narrow vertical shank, the limbs invisible". `upZ` 0.95 is the tracking position a real
    // diver holds — arms back along the body, well outside the ribs — and the small leg splay is
    // there to break the line between the two shins from behind, not to change the shape.
    armL: [1.50, 0.95, -0.10],
    armR: [1.50, 0.95, -0.10],
    legL: [0.38, 0.06, 0.80, 0.18],
    legR: [0.44, 0.10, 0.80, 0.22],
    grip: 0.9,
    lean: 1.78,
    leanSpd: 0.16,
  },
  // ARCH: the skydiver. Chest open, arms out to the sides with the elbows folded so the
  // hands come forward, legs apart and bent, head up. It is the shape a body makes when it
  // is riding the air rather than aiming through it.
  arch: {
    name: "SPREAD-EAGLE",
    hipY: 0.05,
    torso: [-0.34, 0, 0],
    head: [-0.70, 0],
    armL: [0.18, 1.34, -0.78],
    armR: [0.18, 1.34, -0.78],
    legL: [0.32, 1.26, 0.30, 0.86],
    legR: [0.38, 1.32, 0.30, 0.92],
    grip: 0.2,
    lean: 1.42,
    leanSpd: 0.10,
  },
  // STAR: everything stretched wide and back — the flat, flying look. Wider and straighter
  // than the arch, with the arms swept rather than folded.
  spread: {
    name: "STARFALL",
    hipY: 0.05,
    torso: [-0.18, 0, 0],
    head: [-0.46, 0],
    armL: [0.86, 1.46, -0.06],
    armR: [0.86, 1.46, -0.06],
    legL: [0.40, 0.16, 0.62, 0.86],
    legR: [0.46, 0.20, 0.62, 0.90],
    grip: 0.35,
    lean: 1.62,
    leanSpd: 0.14,
  },
  // UPRIGHT: feet first, arms out for balance, legs together, head down watching the deck.
  // The controlled drop — a fall you are choosing rather than a fall that is happening.
  upright: {
    name: "CONTROLLED DROP",
    hipY: 0.05,
    torso: [0.06, 0, 0],
    head: [0.20, 0],
    // Arms well out and a little below the shoulder, but SWEPT BACK rather than held out like a
    // T: measured through the gameplay camera, the T read as "standing still, floating" — an
    // upright body seen from behind has no other cue that it is moving, and a straight-armed
    // scarecrow is the one silhouette that says "not moving". Swept arms plus SOFT KNEES (legs
    // slightly apart and slightly forward, taking the air like a braking sit-fly) is a body
    // clearly descending. Measured on the rig: `upZ` raises an arm away from the body and `upX`
    // lifts the hand above the shoulder, so `upZ` 1.2 with `upX` 0.42 is out-and-back and level.
    armL: [0.42, 1.20, -0.25],
    armR: [0.42, 1.20, -0.25],
    legL: [-0.14, 0.56, 0.34, 0.26],
    legR: [-0.08, 0.48, 0.34, 0.24],
    grip: 0.45,
    lean: 0.06,
    leanSpd: -0.02,
  },
  // PUNCH-DOWN: one fist driven forward down the fall line and the other arm swept back for
  // the turn, one knee up under the chest. Asymmetric on purpose — a fall with a side to it.
  hero: {
    name: "PUNCH-DOWN",
    hipY: 0.07,
    torso: [-0.06, 0.14, 0.10],
    head: [-0.34, -0.14],
    // ...and both arms are driven OUT as well as along the body, for the same reason `aim`'s
    // are: the fist that is thrown forward down the fall line is the one the camera cannot see.
    armL: [-1.24, 1.06, -0.10],
    armR: [1.26, 1.06, -0.38],
    legL: [-0.72, 1.34, 0.34, 0.44],
    legR: [0.58, 0.52, 0.60, 0.40],
    grip: 0.95,
    lean: 1.70,
    leanSpd: 0.14,
  },
  // FLAIL: the one that does not know what it is doing — limbs at odds with each other, the
  // trunk twisted and rolled. Only ever picked from the dice pile.
  flail: {
    name: "FLAIL",
    hipY: 0.06,
    // Loose, not folded: the first version tucked the elbows and knees in hard enough that the
    // whole body came apart into a blob with the limbs inside the torso (measured by eye off the
    // pose sheet, which is the one thing this file's shapes are judged on). The limbs stay
    // EXTENDED and out of each other's way — it is the angles that are at odds, not the joints.
    // ...and the limbs are STRETCHED out in opposing directions rather than folded in. Limb
    // ORDER is what reads here, not limb angle: one arm up-and-out, the other back-and-out, one
    // knee driven up and out, the other leg trailing straight and out.
    torso: [-0.10, 0.14, 0.10],
    head: [0.26, -0.26],
    armL: [-1.06, 1.36, -0.18],
    armR: [1.30, 1.06, -0.10],
    legL: [-0.86, 1.36, 0.26, 0.76],
    legR: [0.96, 0.18, 0.55, 0.70],
    grip: 0.6,
    lean: 1.30,
    leanSpd: 0.08,
  },
  // PLUNGE — the dive, aimed straight down the fall line. This is the user's *"make me if i hold
  // m1 i do dive animtion not a dive forward a dive down i dive down"*, and it is the DIVE's own
  // shape (see `poseDive`): legs straight out and a little apart, arms swept back along the
  // flanks, chest open, grip closed. The difference is the LEAN. The dive is thrown flat OVER the
  // air it is covering (1.15 → 1.60 rad — a body lying along its own line of travel), and there is
  // no line of travel to lie along in a fall that is going straight down, so this one is aimed
  // DOWN it: 2.92 rad (167°) puts the crown of the head on the deck and the swept arms trailing
  // up behind him, which is the one silhouette that says "falling as fast as a body can".
  //
  // A seventh SHAPE rather than a second dive state, on purpose: the fall's own machinery is what
  // owns a long drop (the brace, the drop-to-deck read, the wind, this cycle below), so written
  // this way the plunge eases in and out of whatever the fall was already wearing on the very same
  // limb channels, animates with the very same cycle, and is taken over by the very same landing
  // brace. A separate `plunge` state would have had to re-answer all four of those questions.
  plunge: {
    name: "PLUNGE",
    hipY: 0.06,
    torso: [-0.22, 0, 0],
    head: [0.16, 0],
    armL: [1.34, 0.60, -0.26],
    armR: [1.40, 0.66, -0.30],
    legL: [0.32, 0.14, 0.66, 0.20],
    legR: [0.38, 0.20, 0.66, 0.26],
    grip: 0.85,
    lean: 2.92,
    leanSpd: 0.06,
  },
};

// The one shape every fall ends in: feet down and forward, knees soft, arms out and a
// little back, head down on the deck. Its lean is near-upright — see `fallLean`.
const FALL_BRACE = {
  hipY: 0.10,
  torso: [0.12, 0, 0],
  head: [0.34, 0],
  armL: [0.58, 1.08, -0.56],
  armR: [0.58, 1.08, -0.56],
  legL: [-0.50, 1.06, 0.20, 0.30],
  legR: [-0.42, 0.98, 0.20, 0.26],
  grip: 0.7,
  lean: 0.18,
  leanSpd: 0,
};

// ---------------------------------------------------------------------------
// THE MOTION — what keeps each shape moving.
//
// A shape held for the whole of a long fall reads as a FREEZE: the drift above is a few degrees of
// tremble, and a body hanging in the sky doing nothing but tremble reads as a bug, not as a fall.
// (The user, watching exactly that: *"make the free fall animations like have actual animations
// not just still"*.) So every kind carries a CYCLE now, and it is a real one:
//
//   * the ARMS SWING — opposite phases, so the two limbs are never doing the same thing. A pair
//     of arms swinging together is a bird; a pair swinging against each other is a body in the
//     air. `arm` is the swing fore-and-aft (`upX`) and `armZ` the sweep out to the side, on the
//     same phase, so a hand traces a circle rather than a line;
//   * the LEGS BICYCLE — thigh and knee folded together, opposite phases, so one leg drives while
//     the other trails;
//   * the TRUNK TWISTS and the whole body ROLLS, on a second, slower clock, so the figure never
//     rotates in lockstep with its limbs.
//
// `roll` is deliberately the HIPS' `z` channel rather than the trunk's: the hips are the root of
// the body, so rolling them rolls the trunk and the legs with it and the whole figure tips as ONE
// body instead of the torso pivoting on a planted pelvis. That matters because of the legibility
// rule the shapes were authored to (see "The skyfall" in README.md): the chase camera sees a
// fall nearly end-on, so a roll about the fall line is the one rotation it can read, and a body
// that rolls is unmistakably not standing still, however far away it is.
//
// Amplitudes are radians BEFORE `POSEX` (the rig's 0.8 exaggeration dial). Rates are cycles per
// second of fall, and both are multiplied by a speed term in `poseFall` (a faster fall flails
// faster) and by the `live` envelope (ramped in over `FALL.ramp` so the shape grows out of the
// jump it came from, and stilled by `1 - brace` so the last half second before the deck settles
// into the landing brace). The spread signature of each shape is preserved: the cycle moves the
// limbs, it does not move the shape's own centres.
const FALL_MOVE = {
  //                 arms    arm out   elbow    thigh    knee     twist    roll    c/s    slow c/s
  aim:     { arm: 0.30, armZ: 0.22, elbow: 0.28, leg: 0.32, knee: 0.50, twist: 0.06, roll: 0.10, rate: 1.55, rate2: 0.75 },
  arch:    { arm: 0.55, armZ: 0.50, elbow: 0.35, leg: 0.50, knee: 0.62, twist: 0.12, roll: 0.20, rate: 1.10, rate2: 0.55 },
  spread:  { arm: 0.62, armZ: 0.62, elbow: 0.20, leg: 0.56, knee: 0.36, twist: 0.10, roll: 0.24, rate: 1.00, rate2: 0.62 },
  upright: { arm: 0.95, armZ: 0.55, elbow: 0.52, leg: 0.70, knee: 0.92, twist: 0.09, roll: 0.14, rate: 1.50, rate2: 0.70 },
  hero:    { arm: 0.72, armZ: 0.42, elbow: 0.60, leg: 0.52, knee: 0.72, twist: 0.11, roll: 0.16, rate: 1.30, rate2: 0.60 },
  flail:   { arm: 1.15, armZ: 0.82, elbow: 0.70, leg: 0.95, knee: 1.10, twist: 0.34, roll: 0.55, rate: 1.35, rate2: 0.45 },
  plunge:  { arm: 0.36, armZ: 0.30, elbow: 0.26, leg: 0.42, knee: 0.52, twist: 0.08, roll: 0.12, rate: 1.25, rate2: 0.52 },
};

function fallKindAt(kind) {
  return FALL_KINDS[kind] || FALL_KINDS.aim;
}

// The body's pitch for a shape at a given horizontal speed, already blended with the brace.
function fallLean(kind, spd, brace) {
  const K = fallKindAt(kind);
  const m = Math.min(1, Math.max(0, (spd || 0) / 18));
  const b = Math.max(0, Math.min(1, brace || 0));
  const cruise = K.lean + K.leanSpd * m;
  return cruise + (FALL_BRACE.lean - cruise) * b;
}

function poseFall(bones, u, kind, brace, t, move) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const K = fallKindAt(kind);
  const B = FALL_BRACE;
  const b = Math.max(0, Math.min(1, brace || 0));
  const m = Math.max(0, Math.min(1, move || 0));
  const tt = t || 0;
  const lerp = (a, z) => a + (z - a) * b;
  // The drift. Three out-of-phase sines, so no two limbs move together and the shape never
  // repeats a frame exactly; scaled by the speed, so a slow drop is nearly a still.
  const dr = FALL.drift * m;
  const s1 = Math.sin(tt * 1.35);
  const s2 = Math.sin(tt * 1.02 + 1.7);
  const s3 = Math.sin(tt * 0.83 + 3.4);
  // ---- THE CYCLE (see `FALL_MOVE`) --------------------------------------------------------
  // The shape's own motion: the arms swing, the legs bicycle, the trunk twists and the body rolls,
  // on two clocks so the limbs never lock to the trunk. The whole thing rides one envelope, `live`
  // — ramped in over `FALL.ramp` at the top of the fall (so the shape grows out of the jump it
  // came from instead of snapping into motion) and taken back to zero by the brace, which is what
  // leaves the landing to `FALL_BRACE` alone. And the SPEED term `spd`: a body coming down at 30
  // u/s flails visibly faster than one drifting at 8.
  const A = FALL_MOVE[kind] || FALL_MOVE.flail;
  const live = Math.min(1, tt / FALL.ramp) * (1 - b);
  const spd = 0.8 + 0.45 * m;
  const ph = tt * A.rate * spd;
  const ph2 = tt * A.rate2 * spd;
  // The two arms are on OPPOSITE phases and the two legs are too, and the legs are a quarter of a
  // cycle behind the arms, so all four limbs are always at four different points of the cycle.
  const aL = Math.sin(ph);
  const aR = -aL;
  const kL = Math.sin(ph + 0.9);
  const kR = -kL;
  const sw = Math.cos(ph);
  const roll = Math.sin(ph2) * A.roll * live;
  const twist = Math.sin(ph2 + 1.1) * A.twist * live;
  poseHipY(bones, lerp(K.hipY, B.hipY), e);
  // The body's roll rides the hips' `z` (its root), so the legs tip with the trunk; the twist is
  // split between the hips and the trunk, so the figure corkscrews rather than turning as a board.
  poseRot(bones, "hips", "y", lerp(K.torso[1] * 0.6, 0) + twist * 0.5, e);
  poseRot(bones, "hips", "z", lerp(K.torso[2] * 0.5, 0) + roll, e);
  poseLegAngles(
    bones, -1,
    lerp(K.legL[0], B.legL[0]) + dr * s3 * 0.8 + live * A.leg * kL,
    lerp(K.legL[1], B.legL[1]) + dr * s2 + live * A.knee * (0.5 - 0.5 * kL),
    lerp(K.legL[2], B.legL[2]),
    lerp(K.legL[3], B.legL[3]) + m * 0.10 + dr * s1 * 0.5,
    e
  );
  poseLegAngles(
    bones, 1,
    lerp(K.legR[0], B.legR[0]) + dr * s2 * 0.8 + live * A.leg * kR,
    lerp(K.legR[1], B.legR[1]) + dr * s3 + live * A.knee * (0.5 - 0.5 * kR),
    lerp(K.legR[2], B.legR[2]),
    lerp(K.legR[3], B.legR[3]) + m * 0.10 + dr * s2 * 0.5,
    e
  );
  poseRot(bones, "torso", "x", lerp(K.torso[0], B.torso[0]), e);
  poseRot(bones, "torso", "y", lerp(K.torso[1], 0) + twist * 0.5, e);
  poseRot(bones, "torso", "z", lerp(K.torso[2], 0) + roll, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", lerp(K.head[0], B.head[0]), e);
  poseRot(bones, "head", "y", lerp(K.head[1], 0) + twist * 0.4, e);
  poseRot(bones, "head", "z", 0, e);
  // The arms trace a circle: `upX` is the fore-and-aft half and `upZ` the out-to-the-side half, a
  // quarter cycle apart, so the hand goes back-and-down, out, forward-and-up, in — a real windmill
  // rather than a pendulum. The elbow opens and closes with it, so the arm is not a stick being
  // waved. Both arms are mirrored exactly, which is what keeps the shape symmetric at rest.
  poseArmAngles(
    bones, -1,
    lerp(K.armL[0], B.armL[0]) + dr * s1 + live * A.arm * aL,
    lerp(K.armL[1], B.armL[1]) + dr * s2 * 0.6 + live * A.armZ * sw,
    lerp(K.armL[2], B.armL[2]) + live * A.elbow * sw * 0.6,
    e
  );
  poseArmAngles(
    bones, 1,
    lerp(K.armR[0], B.armR[0]) + dr * s2 + live * A.arm * aR,
    lerp(K.armR[1], B.armR[1]) + dr * s1 * 0.6 + live * A.armZ * sw,
    lerp(K.armR[2], B.armR[2]) + live * A.elbow * sw * 0.6,
    e
  );
  poseGrip(bones, lerp(K.grip, B.grip), e);
}

// ---------------------------------------------------------------------------
// TUCK — the shape the roll and the double jump's flip both need. The roll spins
// the whole body about its side axis and the flip spins it about its left-right
// axis, so the only thing that reads at speed is the ball: knees to the chest,
// arms hugging the shins, head down. `tight` (0..1) is how committed the spin is.
// ---------------------------------------------------------------------------

function poseTuck(bones, u, tight) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const T = 0.6 + 0.4 * Math.max(0, Math.min(1, tight || 0));
  poseHipY(bones, HIP_Y + 0.06 * T, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  poseLegAngles(bones, -1, -1.45, 1.95, 0.30, 0.16, e);
  poseLegAngles(bones, 1, -1.40, 2.00, 0.30, 0.20, e);
  poseRot(bones, "torso", "x", 0.55 * T, e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", 0.30 * T, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  poseArmAngles(bones, -1, -0.70, 0.12, -1.85, e);
  poseArmAngles(bones, 1, -0.70, 0.12, -1.85, e);
  poseGrip(bones, 0.95, e);
}

// ---------------------------------------------------------------------------
// THE RUNNING LUNGE — THE PANTHER (see `lunge` / `startLunge` / `updateLunge` in player.js, and
// "The running lunge" in the README). The brief, verbatim: *"make me if im running fast like above
// 20 speed and i press m2 make me do a lunge i throw my self front ... and make the animtion like yk
// when a panther or a lion or a tiger lunges make it smth like that"*.
//
// FOUR beats, dispatched on the move's own phase, and this layer is written at FULL weight for the
// whole of the move (like the other three skills): one shape per beat, and the handovers are built
// into the SHAPES rather than faded — every beat's first frame is the shape the beat before it ended
// on. The pounce's last third draws the legs up, which is the tuck the roll opens on; both rolls end
// standing, which is where the spread begins.
//
//   POUNCE (0)       the lay-out. A drawn body is not a cat: it has two arms, two legs and no spine,
//                    so the horizontal is bought with the REACH (both arms thrown out past the head,
//                    in front) and the TRAIL (both thighs swung back behind the trunk, knees just
//                    broken, toes pointed), plus the arch (the trunk tips BACK over the chest so the
//                    head can stay up and forward). The DIAGONAL matters: the two arms and the two
//                    legs are never mirrored exactly — a real lunge has a lead side, and a shape
//                    that is perfectly symmetric reads as a swimming stroke.
//   MISS ROLL (1)    the ball. Knees to the chest, head tucked under, both arms wrapped in tight.
//                    The rig's own whole-body turn is the ROLL, so nothing here needs to move with
//                    `u` at all: the shape is held while the body goes over.
//   CLINCH ROLL (2)  the same ball with something PINNED ON it: the trunk curls a touch further
//                    over the weight riding it and the arms fold tight around it, so the pair read
//                    as one thing going over — which is what the roll's own placement does on the
//                    game side.
//   SPREAD JUMP (3)  the brief's exit, and its whole shape: *"i do a jump spreading my arms and
//                    legs"*. A STAR — the arms out and up, the legs out and under, the whole figure
//                    drawn long (`poseStretchChain`) at the top of the leap-off.
//
// `take` is 1 for as long as the clinch roll is holding somebody (the physics' own `lungeTarget`),
// and it is what chooses between the two rolls' arms: a tuck with empty hands is a ball, a tuck with
// a body in it is a HOLD.
// ---------------------------------------------------------------------------

const LUNGE = {
  // ---- the pounce ----
  pounceArch: -0.30,   // the trunk tipping back over the chest, off the rig's own lay-out
  pounceHead: -0.52,   // ...and the head up over it, watching what it is going to land on
  pounceArmX: -2.65,   // both arms out along the body's own long axis (negative is forward; -π/2 is
                       //    straight out in front of the chest, past that is up the axis itself, which
                       //    at this lay-out is the only angle that reads as REACHING: at -1.95 the arms
                       //    sat 68° off the body and the pitch turned them into two limbs hanging at
                       //    the ground — measured off the render, and the reason the brief's animal
                       //    did not show up in the first pass)
  pounceArmZ: 0.34,    // ...and a touch out from the midline, so they clear the head
  pounceElbow: -0.22,  // nearly straight: a foreleg, not a punch
  pounceThigh: 0.90,   // both thighs swung BACK (positive is behind the trunk) — a hind leg that
                       //    hangs is a hind leg that is not pushing
  pounceKnee: 0.16,
  pounceSole: 0.55,    // toes pointed: a trailing foot is an aerodynamic one
  pounceSplay: 0.16,
  // the draw-up: how far the limbs come in over the last stretch of the beat. It is the TUCK's own
  // numbers, not a half-way house: the beat's last frame IS the roll's first frame, so a pounce that
  // lands into the roll hands over with nothing moving (see `poseLunge`'s `draw`). The first draft
  // stopped at -0.55/1.00 and the handover snapped 1.55 rad of thigh in ONE frame.
  drawnThigh: -2.10,
  drawnKnee: 2.60,
  drawnArmX: -1.40,
  drawnElbow: -2.55,
  // ---- the tuck (both rolls) ----
  // THE BALL. These are not a pose that happens to be a roll: the rig is turned a FULL REVOLUTION
  // about the ball below (`LUNGE_BALL_*` in player.js), so the shape has to be compact or the head
  // sweeps through the deck twice a turn. Measured off the live rig (every mesh's AABB corner in the
  // rig's own frame, minimum enclosing circle of the (y,z) cloud): the first draft's fold — the
  // game's own `poseTuck` numbers, 0.62 of trunk — gave a ball of r 1.048 with the head 1.02 ABOVE
  // its centre, which is a head sweeping half a metre under a deck it is supposed to be rolling on.
  // Curled like this the same measure is r 0.617. The trunk is what does it: at 0.62 the head is
  // still over the hips, at 1.70 it is down between the knees, which is what makes a ball a ball.
  tuckThigh: -2.10,    // knees to the chest (past horizontal, the shins fold back under)
  tuckKnee: 2.60,      // ...and the heels to the seat
  tuckSole: 0.24,
  tuckSplay: 0.10,
  tuckTrunk: 1.70,     // the trunk curled over the knees: the head ends up between them
  tuckHead: 1.15,      // ...and the chin on the chest (the neck does the last of the curl)
  tuckArmX: -1.40,
  tuckArmZ: 0.10,
  tuckElbow: -2.55,    // both arms wrapped in across the front — they close the ring
  // ...and where the MISS ROLL stops being a ball and starts coming up onto its feet (the shape
  // rises to `REST` over the last of the beat — see `poseLunge` phase 1). READ BY player.js TOO:
  // the ball's own weight has to fall to zero on exactly the frame the shape stops needing it, or
  // the rig is placed off a ball it is no longer folded around, and it is the shape that decides
  // when that is, so the number lives here.
  riseAt: 0.72,
  // ...and the HOLD: the same ball with a body PINNED ON it (see `lungeHoldBody` — the roll
  // draws the held body's origin onto the carrier's own). The trunk curls a touch further over
  // the weight riding it, and the arms fold TIGHT around it rather than reaching ahead, because
  // the thing they are holding is on top of them.
  holdArmX: -1.45,
  holdArmZ: 0.22,
  holdElbow: -1.70,
  holdTrunk: 1.58,
  // ---- the spread ----
  spreadArmX: -0.90,
  spreadArmZ: 1.35,
  spreadElbow: -0.16,
  spreadThigh: -0.34,
  spreadKnee: 0.34,
  spreadSole: 0.32,
  spreadSplay: 0.88,
};

function poseLunge(bones, e, phase, u, roll, take) {
  if (e <= 0.0001) return;
  const t = u <= 0 ? 0 : u >= 1 ? 1 : u;
  const L = LUNGE;
  if (phase === 0) {
    // ---- THE POUNCE ----
    // `draw` is the last third of the beat: the legs come up under him and the arms fold in a
    // little, which is the shape the roll lands on (a body that broke into a roll from a full
    // stretch would have to snap a body's length of limb in one frame).
    const draw = kf(t, [[0, 0], [0.58, 0], [0.86, 0.7], [1, 1]]);
    // ...and the whole lay-out builds over the first of it: the paws leave the deck in the read
    // TOO, not just in the physics (the rig's own lean does the rest — see the `lunge` branch in
    // `updateVisual`, which is driven off the arc).
    const out = kf(t, [[0, 0.35], [0.16, 1], [1, 1]]);
    const thigh = L.pounceThigh * out + (L.drawnThigh - L.pounceThigh * out) * draw;
    const knee = L.pounceKnee * out + (L.drawnKnee - L.pounceKnee * out) * draw;
    const sole = L.pounceSole * out + (L.tuckSole - L.pounceSole * out) * draw;
    poseHipY(bones, HIP_Y + 0.10 * out - 0.06 * draw, e);
    poseRot(bones, "hips", "x", 0, e);
    // The pelvis winds a hair to one side: the lead hip leads. A lunge with a perfectly square
    // pelvis is a swan dive with its legs apart.
    poseRot(bones, "hips", "y", 0.10 * out - 0.05 * draw, e);
    poseRot(bones, "hips", "z", -0.06 * out, e);
    // The spine: the trunk tips BACK (negative) and the head comes up over it, which is the pair
    // that says CHEST FIRST rather than head first.
    poseRot(bones, "torso", "x", L.pounceArch * out + (L.tuckTrunk - L.pounceArch * out) * draw, e);
    poseRot(bones, "torso", "y", -0.12 * out + 0.10 * draw, e);
    poseRot(bones, "torso", "z", 0.07 * out, e);
    poseSettleTorso(bones, e);
    poseRot(bones, "head", "x", L.pounceHead * out + (L.tuckHead - L.pounceHead * out) * draw, e);
    poseRot(bones, "head", "y", 0.10 * out, e);
    poseRot(bones, "head", "z", 0.06 * out, e);
    // The limbs. The LEAD side is the character's own RIGHT — `side < 0` is the bone named `...L`
    // (see `RK`) — and it is signed so the two sides are a diagonal rather than a mirror: the lead
    // arms reach a touch further and higher, the trailing leg trails a touch more.
    const armX = L.pounceArmX * out + (L.drawnArmX - L.pounceArmX * out) * draw;
    const elbow = L.pounceElbow * out + (L.drawnElbow - L.pounceElbow * out) * draw;
    poseArmAngles(bones, -1, armX - 0.10 * out, L.pounceArmZ + 0.06 * out, elbow - 0.06 * out, e);
    poseArmAngles(bones, 1, armX + 0.08 * out, L.pounceArmZ - 0.05 * out, elbow + 0.10 * out, e);
    poseLegAngles(bones, -1, thigh - 0.08 * out, knee + 0.04 * out, sole, L.pounceSplay + 0.04 * out, e);
    poseLegAngles(bones, 1, thigh + 0.10 * out, knee - 0.05 * out, sole - 0.06 * out, L.pounceSplay - 0.03 * out, e);
    // Open on the way out, closing as he lands: the hands are what arrive first, and a body about to
    // land on somebody grabs before it is told to.
    poseGrip(bones, 0.15 + 0.75 * draw, e);
  } else if (phase === 1) {
    // ---- THE MISS ROLL ----
    // The ball. Held for the whole beat (the rig's own turn is the roll), and the shape is authored
    // so the ball's own centroid sits where `LUNGE_BALL_*` says it does: the knees are drawn up in
    // FRONT of the axis and the hold of the arms closes the front of the ring, because that is what
    // the rig is being turned about.
    // ...and then the RISE, over the last quarter: the body comes up OUT of the ball and onto its
    // feet, which is what a roll-recovery IS. It matters as much to the game as to the shape — the
    // ball's own weight (`lungeBall`, see `updateLunge`) has to be zero by the last frame, or the
    // rig is placed off a ball it is no longer folded around and the feet end up under the deck.
    // `riseAt` is read by BOTH sides, so the shape and the placement turn over on the same frame.
    const rise = kf(t, [[L.riseAt, 0], [1, 1]]);
    const mix = (a, b) => a + (b - a) * rise;
    const R = REST;
    poseHipY(bones, mix(HIP_Y + 0.06, R.hip), e);
    poseRot(bones, "hips", "x", mix(0.10, R.hipsX), e);
    poseRot(bones, "hips", "y", 0, e);
    poseRot(bones, "hips", "z", 0, e);
    poseRot(bones, "torso", "x", mix(L.tuckTrunk, R.torsoX), e);
    poseRot(bones, "torso", "y", mix(0, R.torsoY), e);
    poseRot(bones, "torso", "z", 0, e);
    poseSettleTorso(bones, e);
    poseRot(bones, "head", "x", mix(L.tuckHead, R.headX), e);
    poseRot(bones, "head", "y", mix(0.05, 0), e);
    poseRot(bones, "head", "z", 0, e);
    poseLegAngles(bones, -1,
      mix(L.tuckThigh, R.legL[0]), mix(L.tuckKnee, R.legL[1]),
      mix(L.tuckSole, R.legL[2]), mix(L.tuckSplay + 0.03, R.legL[3]), e);
    poseLegAngles(bones, 1,
      mix(L.tuckThigh + 0.05, R.legR[0]), mix(L.tuckKnee - 0.05, R.legR[1]),
      mix(L.tuckSole, R.legR[2]), mix(L.tuckSplay - 0.03, R.legR[3]), e);
    poseArmAngles(bones, -1,
      mix(L.tuckArmX, R.arm[0]), mix(L.tuckArmZ, R.arm[1]), mix(L.tuckElbow, R.arm[2]), e);
    poseArmAngles(bones, 1,
      mix(L.tuckArmX + 0.06, R.arm[0]), mix(L.tuckArmZ, R.arm[1]),
      mix(L.tuckElbow + 0.06, R.arm[2]), e);
    poseGrip(bones, mix(0.9, 0.30), e);
  } else if (phase === 2) {
    // ---- THE CLINCH ROLL ----
    // The same ball with a body pinned on it. The legs are the tuck's (the knees are what the pair
    // are rolling over), the trunk curls a touch further over the weight riding it, and the ARMS
    // are the whole difference: folded tight around the draped body rather than reaching ahead —
    // a body held ON TOP of the ball, not in front of it.
    const hold = take > 0.5 ? 1 : 0.35;
    poseHipY(bones, HIP_Y + 0.04 - 0.04 * hold, e);
    poseRot(bones, "hips", "x", 0.08, e);
    poseRot(bones, "hips", "y", 0.06 * hold, e);
    poseRot(bones, "hips", "z", 0, e);
    poseRot(bones, "torso", "x", L.tuckTrunk + (L.holdTrunk - L.tuckTrunk) * hold, e);
    poseRot(bones, "torso", "y", -0.16 * hold, e);
    poseRot(bones, "torso", "z", 0.05 * hold, e);
    poseSettleTorso(bones, e);
    poseRot(bones, "head", "x", L.tuckHead - 0.14 * hold, e);
    poseRot(bones, "head", "y", 0.10 * hold, e);
    poseRot(bones, "head", "z", 0, e);
    poseLegAngles(bones, -1, L.tuckThigh - 0.06 * hold, L.tuckKnee + 0.05 * hold, L.tuckSole, L.tuckSplay + 0.05, e);
    poseLegAngles(bones, 1, L.tuckThigh + 0.06, L.tuckKnee - 0.04, L.tuckSole, L.tuckSplay - 0.02, e);
    poseArmAngles(bones, -1,
      L.tuckArmX + (L.holdArmX - L.tuckArmX) * hold,
      L.tuckArmZ + (L.holdArmZ - L.tuckArmZ) * hold,
      L.tuckElbow + (L.holdElbow - L.tuckElbow) * hold, e);
    poseArmAngles(bones, 1,
      L.tuckArmX + (L.holdArmX - L.tuckArmX) * hold + 0.10 * hold,
      L.tuckArmZ + (L.holdArmZ - L.tuckArmZ) * hold,
      L.tuckElbow + (L.holdElbow - L.tuckElbow) * hold + 0.14 * hold, e);
    poseGrip(bones, 0.55 + 0.42 * hold, e);
  } else {
    // ---- THE SPREAD JUMP ----
    // The star, and it is caught: the limbs snap OUT over the first third of the beat (`splay` is
    // the read, so the legs lead) and hold there for the rest of the leap.
    const open = kf(t, [[0, 0.25], [0.30, 1], [1, 1]]);
    poseHipY(bones, HIP_Y - 0.02 * open, e);
    poseRot(bones, "hips", "x", -0.06 * open, e);
    poseRot(bones, "hips", "y", 0, e);
    poseRot(bones, "hips", "z", 0, e);
    poseRot(bones, "torso", "x", 0.10 * open, e);
    poseRot(bones, "torso", "y", 0, e);
    poseRot(bones, "torso", "z", -0.04 * open, e);
    poseSettleTorso(bones, e);
    poseRot(bones, "head", "x", -0.16 * open, e);
    poseRot(bones, "head", "y", 0, e);
    poseRot(bones, "head", "z", 0.03 * open, e);
    poseArmAngles(bones, -1, L.spreadArmX * open, L.spreadArmZ * open + 0.06, L.spreadElbow * open, e);
    poseArmAngles(bones, 1, L.spreadArmX * open + 0.10, L.spreadArmZ * open, L.spreadElbow * open - 0.05, e);
    poseLegAngles(bones, -1, L.spreadThigh * open - 0.06, L.spreadKnee * open + 0.04, L.spreadSole, L.spreadSplay * open + 0.05, e);
    poseLegAngles(bones, 1, L.spreadThigh * open + 0.04, L.spreadKnee * open, L.spreadSole - 0.05, L.spreadSplay * open - 0.04, e);
    poseGrip(bones, 0.25, e);
    // Drawn LONG: a body thrown off a roll and caught in the air is a body at full extension. The
    // request is held for as long as the layer is up (the same bargain the dive makes) and unwinds
    // by itself the moment the spread is not worn.
    const st = 1 + 0.06 * open;
    poseStretchChain(bones, "leg", -1, st);
    poseStretchChain(bones, "leg", 1, st);
    poseStretchChain(bones, "arm", -1, 1 + 0.05 * open);
    poseStretchChain(bones, "arm", 1, 1 + 0.05 * open);
  }
}

// ---------------------------------------------------------------------------
// VAULT / MANTLE — two beats in one pose. First the PULL: hands up on the lip,
// elbows folded, both knees dragged up under the chest. Then, from about a third
// of the way through, the PLANT: the hands come down off the ledge, the lead leg
// reaches out and stamps down and the trunk unrolls. Cross-fading the two beats
// on `u` is what makes a mantle read as a scripted move rather than a state you
// can sit in.
// ---------------------------------------------------------------------------

function poseMantle(bones, u, kIn) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const k = kIn === undefined ? u : Math.max(0, Math.min(1, kIn));
  const plant = poseEase(Math.max(0, (k - 0.34) / 0.66));
  const pull = 1 - plant;
  poseHipY(bones, HIP_Y + 0.24 * pull - 0.06 * plant, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  poseLegAngles(bones, -1, -1.30 * pull - 0.32 * plant, 1.75 * pull + 0.30 * plant, 0.20, 0.16, e);
  poseLegAngles(bones, 1, -1.05 * pull + 0.28 * plant, 1.55 * pull + 0.20 * plant, 0.20, 0.24, e);
  poseRot(bones, "torso", "x", 0.66 * pull - 0.05 * plant, e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", -0.46 * pull + 0.05 * plant, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  poseArmAngles(bones, -1, -2.35 * pull - 0.12 * plant, 0.30 * pull + 0.42 * plant, -1.15 * pull - 0.12 * plant, e);
  poseArmAngles(bones, 1, -2.35 * pull - 0.22 * plant, 0.34 * pull + 0.46 * plant, -1.15 * pull - 0.22 * plant, e);
  poseGrip(bones, 0.8 * pull + 0.2, e);
}

// ---------------------------------------------------------------------------
// THE LEDGE PULL-UP — the second half of the auto ledge grab (see `poseHang`, and `startMantle`
// in player.js).
//
// A mantle off a CLIMB tops out of a crawl that is already standing on the face; this one starts
// from a full hang, a body's height below the lip, with both palms solved onto it. It is not the
// same move and it must not wear the same shape — `poseMantle`'s pull beat is a climb's tucked-up
// knee, and wearing it from a hang is exactly what dragged both palms down off the lip and
// through the stone (see the measurement in `poseHang`'s note).
//
// Three beats, keyed off the arc's own clock (`k`, the same one the physics scripts the body
// with, so the shape and the travel cannot read different moments):
//
//   FOLD    the palms hold the lip and the ARMS FOLD; the body comes up into them, the legs coil
//           behind the hips — they cannot go forward, the face is there — and the chest tips over
//           the edge. This is the heavy half of a pull-up, and the reason it reads even when the
//           lip is only chest high.
//   STEP    the hips clear the lip, so the LEAD knee may at last drive forward and OVER it (the
//           one direction that was blocked). The foot plants on the top; the palms are still on
//           the stone — they are what the body is pivoting on.
//   STAND   the hands let go (`pin`, a keyframe rather than a fade, so the moment the palms leave
//           the lip is planned), the trunk unrolls, the planted foot takes the weight and the body
//           comes up over its own leg into the stride.
//
// `gx/gy/gz` is the lip in the rig's own frame — the same point, in the same units, that
// `poseHang` grips (see the note there), solved with the same `poseArmReach`. The catch, the hold
// and the pull-up are therefore ONE contact with no handover seam.
// ---------------------------------------------------------------------------

const LEDGE_PULL = {
  half: 0.385,   // the palms' half-width on the lip — the hang's own number, so the seam is not a step
  // THE PALMS' OWN CONTACT WEIGHT — and it is set by how far the arm actually REACHES, not by
  // taste. A pull-up cannot hold the lip past the moment the shoulder has risen further above it
  // than the arm is long: the grip is solved from the shoulder, so once `raw` passes `ARM_LIMB`
  // the solve clamps and the palms are dragged off the stone by however much is left over.
  // MEASURED on the live rig (a 2.5 u lip, a full dead hang): the arm runs out of reach at
  // k = 0.38 — the palms are 0.13 u off the lip by k = 0.39 and 0.24 u by k = 0.44 — which is
  // exactly the window the old `pin` (held to 0.46) was straining through, and it is what the
  // user read as the move being *"heavy"*. The release now lands ON the reach limit instead of
  // after it, so the hands come off the lip cleanly as the knee takes the edge.
  pin: [[0, 1], [0.24, 1], [0.40, 0], [1, 0]],
  hip: [[0, -0.05], [0.30, 0.12], [0.66, 0.13], [1, 0.02]],
  lean: [[0, 0.15], [0.30, 0.62], [0.62, 0.32], [1, 0.02]],
  head: [[0, -0.42], [0.34, 0.14], [0.68, -0.20], [1, 0.04]],
  // The legs. `lead` drives: it coils behind the hip on the FOLD (the only direction the face
  // leaves open), swings OVER the lip on the STEP, plants, and stands the body up.
  leadThigh: [[0, 0.34], [0.24, 0.58], [0.48, -0.40], [0.70, -0.96], [0.86, -0.40], [1, -0.04]],
  leadKnee: [[0, 1.30], [0.24, 1.74], [0.48, 1.60], [0.70, 1.04], [0.86, 0.50], [1, 0.10]],
  leadSole: [[0, 0.34], [0.46, 0.14], [0.70, -0.34], [1, 0.06]],
  leadSplay: [[0, 0.24], [0.24, 0.30], [0.70, 0.22], [1, 0.12]],
  trailThigh: [[0, -0.05], [0.24, 0.34], [0.48, 0.30], [0.70, -0.24], [1, -0.02]],
  trailKnee: [[0, 0.28], [0.24, 0.96], [0.48, 1.34], [0.70, 0.84], [1, 0.12]],
  trailSole: [[0, 0.22], [0.48, 0.26], [0.70, -0.08], [1, 0.06]],
  trailSplay: [[0, 0.10], [0.48, 0.20], [1, 0.10]],
  // ...and the arms, once they have let go of the stone: down past the hips into the stride's own
  // guard. They fade in on `1 - pin`, so the handover is exactly the release.
  armX: [[0.60, -0.95], [0.82, -0.36], [1, -0.08]],
  armZ: [[0.60, 0.32], [1, 0.16]],
  armE: [[0.60, -0.60], [1, -0.24]],
};

function poseLedgePull(bones, u, kIn, gx, gy, gz) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const k = kIn <= 0 ? 0 : kIn >= 1 ? 1 : kIn;
  const L = LEDGE_PULL;
  const pin = kf(k, L.pin);
  poseHipY(bones, HIP_Y + kf(k, L.hip), e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  poseLegAngles(bones, -1, kf(k, L.leadThigh), kf(k, L.leadKnee), kf(k, L.leadSole), kf(k, L.leadSplay), e);
  poseLegAngles(bones, 1, kf(k, L.trailThigh), kf(k, L.trailKnee), kf(k, L.trailSole), kf(k, L.trailSplay), e);
  poseRot(bones, "torso", "x", kf(k, L.lean), e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", kf(k, L.head), e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  const ax = kf(k, L.armX);
  const az = kf(k, L.armZ);
  const ae = kf(k, L.armE);
  // The standing arms fade in on `1 - pin`, so the release IS the handover: before it they are
  // weightless and the solved grip owns the arms, after it they own them.
  poseArmAngles(bones, -1, ax, az, ae, e * (1 - pin));
  poseArmAngles(bones, 1, ax - 0.06, az + 0.03, ae - 0.03, e * (1 - pin));
  poseGrip(bones, 0.95 * pin + 0.25 * (1 - pin), e);
}

// ...and the grip's own weight for this frame, read off the crossing's clock by `updateVisual` so
// the shared solve (`poseLedgeGrip`) knows how much of it is still on the stone.
function ledgePullPin(kIn) {
  return kf(kIn <= 0 ? 0 : kIn >= 1 ? 1 : kIn, LEDGE_PULL.pin);
}

// ---------------------------------------------------------------------------
// THE RUNNING VAULT — the hand-plant over a low box (see `startVault` in player.js).
//
// Three beats, and they are the three beats a vault HAS, keyed off the crossing's own
// clock (`k`: 0 on the near face, 1 on the far side) rather than off `u`, so each beat
// lands where the BOX actually is:
//
//   REACH          the hand goes down for the box top and the trunk folds after it.
//   PLANT          the weight goes onto that hand: the hips ride UP over the box, the
//                  pelvis TURNS into the sweep, and the two legs are dragged through
//                  under the body — the LEAD leg first, the trail one a tenth of the
//                  crossing behind it. That stagger is the whole read of a sweep: two
//                  legs that move together are a jump, two that follow each other are a
//                  body going round a corner.
//   SWING-THROUGH  the hand releases and sweeps back past the hip, the legs whip out
//                  to the far side, the trunk unrolls and the lead foot reaches down.
//
// The sweep mirrors on `side` (+1 / -1) so a vault off either shoulder reads, and the
// planting arm is driven DOWN and slightly AHEAD of the shoulder while the trunk folds
// over it — which is the lowest, most-extended point that arm can reach (the box top is
// above the palm; see the note on `plantX` below). What sells the contact is not the
// hand touching the box, it is the body hanging off the arm that is doing the touching.
//
// STYLE. There are TWO ways over a rail (session 197 — `VAULT_KIND` below, picked off the run in
// `startVault`). What carries the flip is not the pose but the RIG TURN — a flip is the whole body
// going round, and the pose only has to be the right SHAPE while it happens — so `vaultTurn` is the
// single source of the rotation, and the pose is handed the very angles the rig is wearing:
//
//   SPEED      the hand-plant sweep — the running jump OVER the box (the user's *"jump over"*)
//   FRONT FLIP the kong: both hands, the knees through the chest, a whole forward turn
//
// Three more (a side flip, a handstand and a cartwheel) went with their poses and their turns: the
// user's *"make the vault has only front flip animation and jump over animation"*.
// ---------------------------------------------------------------------------

const VAULT_KIND = { SPEED: 0, FRONT: 1 };

// THE BEAT THE CROSSING IS DONE BY (session 197) — the user's *"make it get done before the wall not
// when i direnctly touch the wall"*. The whole shape is SPENT by here: the revolution, the tuck and
// the shape's own beats all settle by `VAULT_SQUARE`, so the last third of the crossing is an
// ARRIVAL — square, legs down, dropping — instead of the tail of a flip.
//
// The number is picked off where the box actually sits in a crossing. `k` is the crossing's own
// clock and the body's POSITION along it is that clock's smoothstep (`e = k(3 - 2k)`, see
// `tickVaultState`), so 0.62 of the clock is **0.68 of the travel** — and a rail's far face, with
// `VAULT_PAD` in front of its near face and `VAULT_LAND` past the far one, falls at **0.69-0.73 of
// that travel** for the catches the band actually fires at. Measured over four approach distances
// (gap 0.42-0.81) and three speeds, the square-up lands **0.03-0.14 world BEFORE the far face** —
// and, whatever the catch, it is at the TOP of the crossing: the vertical holds its apex out to 0.74
// of the clock and only then drops (`VAULT_DROP` 0.26), so the body is square for the whole descent.
// A sprint that fires already OVERLAPPING the box (a gap under ~0.3) squares a hair past its far
// face; that is under a frame's travel at that speed, and the drop is still walked out square.
const VAULT_SQUARE = 0.62;

// The RIG TURN each style wears, on the crossing's own clock `k` (0 near face, 1 far side).
// Returned as { flip, roll }: `flip` is a whole-rig pitch (the forward/back axis), `roll` a
// whole-rig roll about the line of travel (the sideways axis). Both are the full turn from
// `VAULT_SQUARE` on, so the body is square — and STAYS square — for the arrival. (`side` picked
// which way the two rolls turned; with them gone nothing reads it.)
function vaultTurn(kind, k, side) {
  if (kind === VAULT_KIND.FRONT) {
    // ...and NOT a plain ease: a uniform turn would still be coming round at the far side, which is
    // exactly what the user is complaining about. The revolution is spent by `VAULT_SQUARE` —
    // through inverted at ~0.36 of the clock, which is a third of the way across, so the top of the
    // tuck is over the near half of the box — and then it is DONE: the `kf` walks in off the plant,
    // takes the fast half of the turn over the box, and settles home into the square-up.
    return { flip: Math.PI * 2 * kf(k, [[0, 0], [0.16, 0.22], [0.34, 0.54], [0.50, 0.86], [VAULT_SQUARE, 1], [1, 1]]), roll: 0 };
  }
  return { flip: 0, roll: 0 };
}

const VAULT = {
  hipUp: 0.30,     // the hips ride over the box (the arc does the rest)
  hipYaw: 0.62,    // ...and the pelvis TURNS toward the sweep — the legs cross the body
  torsoRoll: 0.30, // the trunk leans over the planting hand, which is what carries the weight
  lean: 0.58,      // the deepest trunk fold, at the plant
  splay: 0.30,
  // The planting arm, four keys (reach → plant → release → balance). It is reaching for the box
  // top — which, on a body that has to CLEAR that top, it can never actually touch: the shoulder
  // sits ~2.05 above the feet and the arm reaches ~0.76, so the lowest the palm can ever get is
  // ~1.29 above the feet. What sells it is the arm being at that lowest, most-extended point
  // (plantX/plantE), driven down and slightly ahead of the shoulder while the trunk folds over it.
  reachX: -1.05, reachZ: 0.16, reachE: -0.30,
  plantX: -1.00, plantZ: 0.06, plantE: -0.04,
  relX: 0.30, relZ: 0.26, relE: -0.58,
  balX: 0.54, balZ: 0.34, balE: -0.76,
  // ...and the far arm, counter-swinging the whole way: out behind at the plant (balance), forward
  // across the chest at the release (which is what stops the release reading as both arms folding in).
  fReachX: -0.34, fReachZ: 0.30, fReachE: -0.78,
  fPlantX: 0.74, fPlantZ: 0.52, fPlantE: -0.88,
  fRelX: -1.00, fRelZ: 0.34, fRelE: -0.80,
  fBalX: -0.58, fBalZ: 0.28, fBalE: -0.60,
};

function poseVault(bones, u, kIn, sideIn, kindIn, flipIn) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const k = kIn === undefined ? u : Math.max(0, Math.min(1, kIn));
  const side = sideIn < 0 ? -1 : 1;
  const kind = kindIn || 0;
  if (kind === VAULT_KIND.FRONT) { poseVaultFront(bones, e, k, side); return; }
  poseVaultSpeed(bones, e, k, side);
}

function poseVaultSpeed(bones, e, k, side) {
  const V = VAULT;
  // The two legs ride the SAME shape, a tenth of the crossing apart. That lag is the whole reason
  // the move reads as a sweep rather than as a hop: the lead leg is already through and reaching for
  // the deck by the time the trail one is at the top of its tuck.
  const kl = k;
  const kt = Math.max(0, Math.min(1, (k - 0.08) / 0.92));
  // How high the body is over the box — fast up, held across the box, gone by the landing. It
  // drives the hip rise, the roll onto the planting hand and the shoulder lift together.
  const lift = kf(k, [[0, 0], [0.34, 1], [0.70, 0.86], [1, 0]]);
  // How far into the sweep the pelvis is: in hard by the plant, unwound by the landing.
  const yawAmt = kf(k, [[0, 0.10], [0.20, 0.55], [0.40, 1], [0.66, 0.62], [1, -0.16]]);

  poseHipY(bones, HIP_Y + V.hipUp * lift, e);
  poseRot(bones, "hips", "y", V.hipYaw * side * yawAmt, e);
  poseRot(bones, "hips", "z", 0, e);

  // THE LEAD LEG (on `side`): trailing behind at the reach, tucked up and through the middle of the
  // crossing, then reaching down for the far deck. `splay` carries it outward as it comes through,
  // which is what keeps the two legs from drawing as one thick shape.
  poseLegAngles(bones, side,
    kf(kl, [[0, 0.34], [0.16, -0.62], [0.40, -1.30], [0.62, -0.86], [0.82, -0.40], [1, -0.28]]),
    kf(kl, [[0, 0.30], [0.16, 1.12], [0.40, 1.62], [0.62, 0.86], [0.82, 0.54], [1, 0.46]]),
    kf(kl, [[0, 0.30], [0.40, 0.10], [0.80, 0.34], [1, 0.42]]),
    V.splay * kf(kl, [[0, 0.30], [0.40, 1], [0.76, 0.50], [1, 0.24]]), e);
  // ...and the TRAIL leg: same shape, later clock, a deeper tuck and a touch less splay (it is the
  // one being dragged, so it reads a hair behind and under the lead one).
  poseLegAngles(bones, -side,
    kf(kt, [[0, 0.44], [0.20, -0.36], [0.46, -1.46], [0.68, -0.74], [0.86, -0.26], [1, -0.20]]),
    kf(kt, [[0, 0.36], [0.20, 0.96], [0.46, 1.80], [0.68, 0.80], [0.86, 0.48], [1, 0.42]]),
    kf(kt, [[0, 0.26], [0.46, 0.12], [0.86, 0.32], [1, 0.38]]),
    V.splay * 0.74 * kf(kt, [[0, 0.30], [0.46, 1], [0.80, 0.44], [1, 0.20]]), e);

  // THE TRUNK: folds over the planting arm and unrolls past it, with the hips' turn answered by an
  // opposite turn up top (a body going over a corner rotates in two halves) and a roll onto the
  // side the hand is on.
  poseRot(bones, "torso", "x", kf(k, [[0, -0.06], [0.20, 0.44], [0.38, V.lean], [0.62, 0.34], [0.84, -0.08], [1, -0.18]]), e);
  poseRot(bones, "torso", "y", -V.hipYaw * 0.42 * side * yawAmt, e);
  poseRot(bones, "torso", "z", V.torsoRoll * side * lift, e);
  poseSettleTorso(bones, e);
  // ...and the head goes down onto the box with the reach and comes up over it on the way out, so
  // the eyes are on the thing being crossed for the whole crossing.
  poseRot(bones, "head", "x", kf(k, [[0, 0.16], [0.34, -0.34], [0.66, -0.10], [1, 0.10]]), e);
  poseRot(bones, "head", "y", -V.hipYaw * 0.55 * side * yawAmt, e);
  poseRot(bones, "head", "z", 0, e);

  const A = [
    [V.reachX, V.plantX, V.relX, V.balX],
    [V.reachZ, V.plantZ, V.relZ, V.balZ],
    [V.reachE, V.plantE, V.relE, V.balE],
  ];
  const F = [
    [V.fReachX, V.fPlantX, V.fRelX, V.fBalX],
    [V.fReachZ, V.fPlantZ, V.fRelZ, V.fBalZ],
    [V.fReachE, V.fPlantE, V.fRelE, V.fBalE],
  ];
  const w = (row) => kf(k, [[0, row[0]], [0.32, row[1]], [0.60, row[2]], [1, row[3]]]);
  poseArmAngles(bones, side, w(A[0]), w(A[1]), w(A[2]), e, 0.10);
  poseArmAngles(bones, -side, w(F[0]), w(F[1]), w(F[2]), e, -0.10);
  poseGrip(bones, kf(k, [[0, 0.5], [0.32, 1.0], [0.58, 0.35], [1, 0.5]]), e);

  // SQUASH AND STRETCH. The planting arm is drawn LONGER than it is through the plant (a limb
  // carrying a body reads heavier when it is a little too long), and the trailing leg is drawn long
  // as it comes through — the two accents that make the frame the weight lands on the one the eye
  // remembers.
  poseStretchChain(bones, "arm", side, kf(k, [[0, 1], [0.20, 1.10], [0.36, 1.17], [0.58, 1.03], [1, 1]]));
  poseStretchChain(bones, "leg", -side, kf(kt, [[0, 1], [0.30, 1.10], [0.55, 1.15], [0.82, 1.01], [1, 1]]));
}

// ---------------------------------------------------------------------------
// THE OTHER WAY OVER — see the STYLE note above. It writes the SAME channels the sweep does
// (hips, trunk, head, both legs, both arms, grip) so a style change can never leave a channel
// holding the previous one's angle, and it is authored to look right for the whole of its own
// rig turn rather than merely at the plant.
//
// (The three shapes that stood here until session 197 — a side flip, a handstand and a cartwheel —
// are GONE, with their `vaultTurn` branches: the user's *"make the vault has only front flip
// animation and jump over animation"*.)
// ---------------------------------------------------------------------------

// A FRONT FLIP (kong): both hands down on the box together, the knees drawn through the chest for
// the middle of the turn, and the arms folded in behind the tuck. It is the smallest silhouette of
// the two and the one that reads fastest.
//
// SESSION 197 — IT IS SPENT BY `VAULT_SQUARE`, like the turn it is worn under (`vaultTurn` above):
// the tuck is out and the legs are already reaching for the deck by then, so the body comes out of
// the flip square and the last third of the crossing is an ARRIVAL rather than the end of a
// revolution. The two have to move together — a shape still tucked at the square-up would be a body
// turning inside a standing pose — which is why these keys are on the same beat as the turn's.
function poseVaultFront(bones, e, k, side) {
  const lift = kf(k, [[0, 0], [0.26, 1], [0.56, 0.92], [1, 0]]);
  const tuck = kf(k, [[0, 0.20], [0.18, 1], [0.42, 1], [VAULT_SQUARE, 0.26], [0.82, 0.14], [1, 0.18]]);
  poseHipY(bones, HIP_Y + 0.14 * lift, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  const thigh = -0.24 - 1.30 * tuck;
  const knee = 0.34 + 1.70 * tuck;
  poseLegAngles(bones, side, thigh, knee, 0.30, 0.16, e);
  poseLegAngles(bones, -side, thigh - 0.06, knee - 0.10, 0.30, 0.16, e);
  poseRot(bones, "torso", "x", 0.20 + 0.36 * tuck, e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", -0.10 - 0.30 * tuck, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  const reach = kf(k, [[0, -0.22], [0.16, 0.02], [0.36, -0.62], [0.56, -1.30], [0.76, -0.86], [1, -0.30]]);
  const elbow = kf(k, [[0, -0.10], [0.24, -0.60], [0.50, -1.60], [0.74, -0.95], [1, -0.40]]);
  poseArmAngles(bones, side, reach, 0.30, elbow, e, 0.05);
  poseArmAngles(bones, -side, reach, 0.30, elbow, e, -0.05);
  poseGrip(bones, kf(k, [[0, 0.35], [0.26, 1.0], [0.68, 0.4], [1, 0.35]]), e);
  poseStretchChain(bones, "leg", side, kf(k, [[0, 1], [0.30, 1.10], [0.58, 1.04], [1, 1]]));
  poseStretchChain(bones, "leg", -side, kf(k, [[0, 1], [0.34, 1.08], [0.60, 1.03], [1, 1]]));
  poseStretchChain(bones, "arm", side, kf(k, [[0, 1.02], [0.34, 1.10], [0.68, 1.02], [1, 1]]));
}

// ---------------------------------------------------------------------------
// THE HANG — the auto ledge grab's grip, and THE PULL-UP out of it.
//
// The player never asks for either (see `startLedge` / `startMantle` in player.js), so the
// hang has to read instantly: the hands are over the lip and the body hangs off them. Until
// session 159 that was a contact built out of ANGLES — `armUp` was chosen so the hand-mid
// point came out `LEDGE_GRIP` drawn body-heights above the feet, which is the number the
// physics places the body with. It read correctly and it FROZE the pose: any motion above
// the hips (a trunk lean, a settle, a shoulder) swings the hands off a lip they are
// supposed to be gripping, so the old hold could only ever move its LEGS and its head, and
// the pull-up that followed dragged both palms nearly a metre THROUGH the face and back off
// the lip (measured on the live rig: from the catch to the stand, the hand-mid point ran
// 0.87 u below the lip and 1.11 u into the wall, then finished 1.14 u above it).
//
// SESSION 159 solves the grip instead. `poseArmReach` — the two-bone solve the clinch and
// the wall clinch already place their hands with — puts both palms on the WORLD point the
// lip is at, which `player.js` projects into the rig's own frame every frame (`gx/gy/gz`
// below; it is stored once at the catch and re-projected, so the hands stay on the stone
// while the body moves under them). That is what let the whole move be animated:
//
//   * THE CATCH carries weight. The body DIPS onto the arms and the trunk rolls in over
//     the lip, decaying over `settleT` — a beat the old angle-locked hold could not have.
//   * THE HOLD IS BRACED, not draped. The lead leg HOOKS (thigh back, knee folded, heel
//     drawn up behind the hip) and the trail leg hangs long beside it, drifting on the
//     grip's own clock. Both legs hanging dead straight is what read as a body standing AT
//     a wall; the hook is also the only direction that cannot cross the face.
//   * THE PULL-UP FOLDS ON THE SAME CONTACT (`poseLedgePull`): the palms stay on the lip
//     while the arms fold and the body rises into them, the knee drives over the edge and
//     the foot plants — and only then do the hands let go. The release is a keyframe
//     (`pin`), not a fade, so the moment the palms leave the stone is planned.
//
// `LEDGE_GRIP` and `LEDGE_HUG` (see `P` in player.js) are unchanged: the height the solve
// is handed IS `LEDGE_GRIP` body-heights above the feet, so the arithmetic that places the
// body and the pose that grips the lip still agree to the millimetre.
// ---------------------------------------------------------------------------

const HANG = {
  lean: 0.15,       // trunk pitch into the face
  hipDrop: 0.05,    // the body settles onto the grip (a hang is not a stand)
  grip: 0.95,
  // THE BRACE (see above): one leg hooked behind the hip, one hanging long.
  hookThigh: 0.34, hookKnee: 1.30, hookSole: 0.34, hookSplay: 0.24,
  hangThigh: -0.05, hangKnee: 0.28, hangSole: 0.22, hangSplay: 0.10,
  // ...and what the two legs do on top of the brace: a slow drift, one out of phase with the
  // other, so a hold that lasts is a hold and not a freeze.
  legSwing: 0.09, legShift: 0.08,
  headUp: -0.55,    // chin up, watching the grip — a hang looks down at nothing otherwise
  // THE CATCH'S OWN BEAT: the weight ARRIVES on the grab, so the body dips onto the arms and
  // the trunk rolls in over the lip, decaying over `settleT`. It moves nothing the contact
  // cares about any more — the hands are solved — which is the whole point of the solve.
  settle: 0.09, settleT: 0.09,
  half: 0.385,      // the two palms' half-width on the lip (rig units)
};

// `age` is how long the grip has held (seconds; negative before the pose has one).
function poseHang(bones, u, tIn = 0, age = -1) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const t = (tIn || 0) * Math.PI * 2;
  const a = Math.sin(t);
  const b = Math.sin(t + 1.9);
  const H = HANG;
  const set = age < 0 ? 0 : Math.exp(-age / H.settleT);
  poseHipY(bones, HIP_Y - H.hipDrop - H.settle * set, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  poseLegAngles(bones, -1, H.hookThigh + H.legSwing * a, H.hookKnee + H.legShift * b, H.hookSole, H.hookSplay, e);
  poseLegAngles(bones, 1, H.hangThigh + H.legSwing * b, H.hangKnee + H.legShift * a, H.hangSole, H.hangSplay, e);
  poseRot(bones, "torso", "x", H.lean + 0.10 * set, e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", H.headUp - 0.14 * set + 0.05 * a, e);
  poseRot(bones, "head", "y", 0.10 * b, e);
  poseRot(bones, "head", "z", 0, e);
  // ...and THE HANDS are not written here: the grip is a contact SHARED with the pull-up and is
  // spent once, by `poseLedgeGrip`, after both layers have had their say (see the note there).
}

// THE GRIP, SOLVED ONCE — the one contact the hang and the pull-up share, spent after both of them
// have had their say (see `updateVisual`, which calls it where the stretch and the neck split are
// spent: at the end of the pose dispatch, against the FINISHED body shape).
//
// It has to be a separate pass because the two layers write the trunk and the hips on the frames
// they overlap, and a solve run inside either of them is computed against a trunk the other one
// then moves — measured at the mid-handover, the palms sat 0.11 u (0.15 world) below the lip with
// the solve inside the poses, and land on it to within 0.02 u with it here. `w` is the combined
// contact weight (the hang's, or the pull-up's `pin`, whichever is further on), so the handover
// between the two layers is seamless by construction: they solve the SAME point.
//
// `gx/gy/gz` is the lip in the rig's own frame — origin at the feet line, +y up, +z the way the
// rig faces, RIG units (the frame `poseArmReach` takes, see `gripLocal` in player.js) — and `half`
// the two palms' spread across it.
function poseLedgeGrip(bones, w, gx, gy, gz, half) {
  if (w <= 0.002) return;
  poseArmReach(bones, -1, w, gx - half, gy, gz);
  poseArmReach(bones, 1, w, gx + half, gy, gz);
}

// ---------------------------------------------------------------------------
// ON THE WALL — three attachments, one function.
//
//   "climb"  a hand-over-hand reach: the arms swap which one is overhead on
//            `phase`, the knees are drawn up against the face and the chest
//            turns into the wall with each pull.
//   "slide"  a brace: one hand up flat on the face, the other trailing, the legs
//            hanging a little bent, the trunk pressed in.
//   "run"    only touches the arms, because the wall run is already riding the
//            run cycle — the outer arm swings wide for balance and the trunk
//            leans into the wall.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The WALL SLIDE. The old one hung off the face: the body was squared up to the wall but
// stayed a capsule-half away from it, so the legs dangled in the air and only one arm got
// near. This one is a BRACE — the character puts their weight on the wall and slides down it.
//
// It is a ONE-SIDED brace, which is what makes it read (and what makes the reach solvable at
// all — the capsule keeps the body most of a half-width off the face, so only a nearly
// straight limb gets there): the LEAD leg is a long, almost straight line down the face with
// its sole laid flat on it, the TRAIL leg is folded up under the hip and hangs clear of the
// wall, the high palm is planted flat on the face above and the low one drags on it at hip
// height. Trunk pitched in off the hips, head up watching where it is going.
//
// Every contact is SOLVED, the way the ground slide's palm is. Each ankle is planned in the
// rig's own frame — how far out along the wall's normal and how far down the face — and the
// two-bone IK solves the leg; the foot's own angle is then whatever lays the sole on the face. A
// foot's sole rolls onto the wall exactly as it rolls onto the deck at 0: the chain (thigh + knee
// + foot) has to sum to -PI/2, because the sole faces the way the leg points (0 = down, -PI/2 =
// forward, toward the face). The stand-off itself is FACE-RELATIVE: the plan asks for the ankle
// `-SOLE_Y - press` out from the PLATE and the branch subtracts the hips' own distance to it
// (`frame.dFace`, which `wallRunFrame` measures off the real transform), so the same numbers put
// the sole on the stone whatever `P.WALL_SLIDE_HUG` the player is pressing with — which is what
// let session 144 change that press for the ARM's sake (0.52 -> 0.26) without re-tuning the leg.
//
// These numbers are authored at their final, already-toned-down value and the branch eases
// with `raw` throughout: a contact constraint cannot ride the POSEX exaggeration dial.
//
// ...and the branch is FADED on the way OUT only. The way IN is taken WHOLE — the slide's attach
// writes `wallPose = 1` on the frame the wall is caught (see the attach site in player.js, and *"the
// arm is not there"* in session 144's note): a contact cannot be blended in from the airborne pose
// either, because the airborne arm reaches clean through the face on its way to a brace authored to
// land on it. So `e` here is 1 from the first frame of a slide, and the fade only ever runs as a
// slide ends.
// ---------------------------------------------------------------------------

const WALL_SLIDE = {
  // How far past the plate the ankle is placed. The plate's own mount sits a touch proud of the
  // sole plane and the plan is a two-bone solve, so this is where the sole actually ends up: at
  // 0.014 the shoe sank better than six centimetres into the face, and the mesh wants it just
  // clear of the plate instead — tuned against the real render, not the arithmetic.
  press: -0.020,
  hipDrop: 0.20,    // the brace sinks
  hipBob: 0.022,    // ... and pumps with the scrape
  hipRoll: 0.10,
  // The ANCHOR foot: flat on the face, carrying the slide down it. It re-sets a little lower
  // along the face on every scrape, which is what makes the descent read as controlled rather
  // than as a fall.
  footAlong: 0.10,
  footD: 0.60,
  scrapeAlong: 0.05,
  scrapeD: 0.05,
  // The free leg trails out behind and below, clear of the face: the counterweight for the
  // brace, and the thing that keeps the pose from reading as a squat.
  trailThigh: 0.40,
  trailKnee: 0.92,
  trailSole: 0.55,
  trailSplay: 0.24,
  // Trunk pitched in over the braced foot, with a little counter-twist as the foot re-sets.
  torsoX: 0.20,
  torsoY: 0.05,
  torsoZ: -0.12,
  headX: -0.26,
  headY: -0.12,
  // Palms: the hand on the wall side takes the weight, swept against the mesh so the flat of
  // it lies in the face; the other is a balance arm, thrown out clear of the wall — because a
  // slide with the wall BESIDE the character is not a place the free hand can reach across to,
  // and a hand that tries reads as a knot.
  hiX: -1.15,
  hiZ: 0.38,
  hiTwist: -0.35,
  hiElbow: -1.75,
  hiGrip: 0.18,
  loX: -0.55,
  loZ: 0.55,
  loTwist: 0.40,
  loElbow: -0.55,
  loGrip: 0.55,
};

// ---------------------------------------------------------------------------
// The WALL RUN's wall-side hand.
//
// The run cycle is left completely alone: the legs keep swinging on the run's own ground stride,
// so a wall run reads as a run and not as a different gait, and the trunk takes only the bank the
// run branch below already adds. The wall changes exactly one thing — the arm on the wall side,
// which comes off the run's pump and HOVERS OVER THE FACE: the upper arm runs along it, the
// forearm reaches in to the palm, and the palm lies flat on the plate.
//
// ...AND THAT ARM IS STILL (session 196 — the user's *"make the arm thats next to the wall still
// when im wall running"*). It used to DRAG: the plan's `along` rode the run's own arm swing, so the
// hand swept fore-and-aft down the face once per stride, in step with the pumping arm. The user's
// read of that is the honest one — an arm sweeping while the other one pumps is a second, competing
// loop, and a wall run's wall-side arm is a PLANT. So the plan is now a fixed one (`along` =
// `fwd`, `up`, `curl`, and the pole below all constant), and the ONLY thing left moving it is the
// contact itself: `dn` still spends `frame.dFace`, so as the run's own press and bob carry the hips
// in and out of the face the arm bends to keep the palm exactly on the plate. That is what a hand
// planted on a wall does while the body runs beside it — the hand is the still thing and the ARM is
// what gives — and it leaves the stride's own motion in the one arm that should have it.
//
// ...AND THE PLANT HAD TO BE MADE REACHABLE (session 196). Holding the plan still is not enough on
// its own: a plan the arm cannot REACH is a plan `wallHand` clamps, and a clamped hand is a hand that
// leaves the plate. The old plan was written with the hand low (`up` 0.10, just above the hip), which
// is the far corner of the arm's own reach — the shoulder stands ~0.25 world further out from the
// face at the far end of the stride than at the near end, and there is no slack left to spend it with
// — so the palm popped ~5 cm off the stone once per stride whatever the drag was doing. `up` is 0.18
// now: still below the shoulder, but with the reach to hold the contact through the whole stride (see
// the dial's own note).
//
// The contact is SOLVED rather than eyeballed, and it is authored in the terms the look is judged
// in. The plan is written in the WALL's frame, which the player hands down (see `wallRunFrame`):
// `N` away from the face, `T` along the run line, `U` up it, and `dFace`, the hips' stand-off
// from the plate. So `up` is how high the hand rides, `along` how far down the face, and `dn`
// how hard it presses — and the solve comes out right for any bank, pitch or press.
//
// Three things make it less direct than it looks, and all three have the same shape as the foot
// solve below. The first is that the arm's chain does not start at the hips: the shoulder is
// carried by the torso, which the run leans, twists and stretches, so the plan is carried into
// the torso's own frame (and back out of its stretch — a point at local `c` lands at `scale ⊙ c`)
// before the IK may spend the arm's authored lengths. The second is that the hand has no bone of
// its own: it is rigid with the forearm, so the twist that lays the palm into the face belongs to
// the FOREARM, and it is measured from where the elbow's own bend left the palm and rolled the
// short way onto it. The third is the elbow: a two-bone solve leaves it free anywhere on a
// circle, and the pole below is what picks the point on it — behind and under the hand, so the
// forearm comes forward onto the plant while the elbow points back down the run line.
const WALL_HAND = {
  // How high the hand rides, measured up the face from the hips — and the plan's only REACH dial,
  // because the shoulder is above the hand: the higher it goes, the shorter the arm may be. It sat
  // at 0.10, and that is past the limb's own reach at the far end of the stride (the shoulder stands
  // ~0.25 world further out from the plate there), so `wallHand` clamped and the palm FLOATED ~5 cm
  // off the stone once per stride — MEASURED over four runs in a row, stand-off 0.187-0.242. At 0.18
  // the whole stride fits inside the arm (0.187-0.190, a 2 mm range) and the arm's swing comes out no
  // worse (the forearm's went from 18.5 to 16 degrees), which is what a PLANTED hand needed.
  up: 0.18,
  fwd: 0.05,       // ... and how far ahead of the hips, along the face
  face: 0.60,      // the hips' own stand-off the plan is written against (see below)
  // The hand's axis sits this far out from the face. Not the palm slab's half-thickness (0.04):
  // a rigid wrist cannot lie a palm dead flat on a face the hips are half a body away from, so
  // what actually reaches the plate is the palm's NEAR EDGE, and this is that edge's stand-off —
  // measured off the real mesh through the whole stride (the palm then lands within ~11 degrees
  // of the face and its edge sits on it, which is as flat as this rig can hold it).
  half: 0.088,
  press: -0.030,   // how far the palm's planned axis sits from the face (rig units; negative = out)
  curl: 0.24,      // the knuckles stay OPEN — only enough of a relax to seat the pads
  // Where the elbow rides between the plate (0) and the shoulder's own stand-off (1). 1 lays
  // the UPPER ARM along the face so the whole arm hovers over the wall; 0 lays the forearm
  // along it and leaves the palm flattest. See the note in `wallHand`.
  elbowLevel: 1.0,
  // The elbow's own clearance off the plate, and the phase reference the solve swings it from.
  // The elbow is what decides whether the palm can lie in the face at all (a rigid wrist can only
  // lie a palm flat if the FOREARM runs along the face), so the solve sends it as near the plate
  // as the arm's own reach allows and this is how close it may get — the sleeve's radius plus a
  // little. The pole is only which side of the reach the circle is measured from, and it is read
  // as "behind the hand and a little under it", which is where an elbow wants to be if the arm
  // ever has slack to spare.
  elbowGap: 0.085,
  poleT: -0.35,
  poleU: -0.15,
};

// The arm's own rest geometry, read off the rig: the upper arm from the shoulder to the elbow, and
// the forearm from the elbow to the MIDDLE of the palm — the point the solve actually places, with
// the palm's plate `WALL_HAND.half` out from it. Written for the character's own right (its `L`
// bones), which is also the wall-on-the-player's-right pairing; the other side mirrors in x.
const HAND_MID_Y = 0.806;
const HAND_MID_Z = 0.000;
const ARM_UP_LEN = Math.hypot(ELBOW_X - SHOULDER_X, ELBOW_Y - SHOULDER_Y, ELBOW_Z - SHOULDER_Z);
const ARM_LO_LEN = Math.hypot(HAND_X - ELBOW_X, HAND_MID_Y - ELBOW_Y, HAND_MID_Z - ELBOW_Z);
const ARM_LIMB = ARM_UP_LEN + ARM_LO_LEN;

const _wrV1 = new THREE.Vector3();
const _wrV2 = new THREE.Vector3();
const _wrV3 = new THREE.Vector3();
const _wrM1 = new THREE.Matrix4();
const _wrE = new THREE.Euler();
const _wrQ0 = new THREE.Quaternion();
const _wrQ1 = new THREE.Quaternion();
const _wrQ2 = new THREE.Quaternion();
const _wrQ3 = new THREE.Quaternion();
const _wrQh = new THREE.Quaternion();
const _wrV4 = new THREE.Vector3();
const _wrV5 = new THREE.Vector3();
const _wrV6 = new THREE.Vector3();

// Place one foot flat on the face. `dn` is the ankle's stand-off from the hips along the wall
// normal, `along` how far along the face it sits, and `d` the hip-to-ankle distance — the drop
// falls out of that, so a limb can never be asked for more than it has. `flat` cross-fades the
// foot's own quarter turn onto the face, so a foot that is only half committed reads as half
// turned rather than snapping flat.
//
// Two things make this less direct than it looks. The first is that the ankle JOINT is not on
// the leg's own axis: the foot bone hangs `ANKLE_X` off the shin's midline (that is what gives
// the character a stance width), so rolling the leg carries that offset around with it and the
// roll that lands the ankle where the plan wants it is not simply the ankle's bearing.
// Un-rotating the plan by the roll has to leave exactly that offset on the rig's x axis — which
// fixes the roll in one step.
//
// The second is the Euler order: the roll has to be the OUTER rotation (it turns the plane the
// swing happens in), and the leg bones' order is XYZ, where `rotation.z` applies innermost — in
// the leg's own frame, which tilts the bend plane instead of turning it. So the thigh is set as
// a quaternion composed in ZYX order, and only the swing is an angle. The shin is unaffected: it
// is a plain hinge on the thigh either way.
function wallFoot(bones, isL, e, F, dn, along, d, flat, kneeOut = 0) {
  const up = isL ? bones.legUpperL : bones.legUpperR;
  const lo = isL ? bones.legLowerL : bones.legLowerR;
  const drop = -Math.sqrt(Math.max(0, d * d - along * along - dn * dn));
  // `F` is written in the rig's own frame, but the thigh's parent is the HIPS, and the caller
  // has just rolled it (the slide takes a hip roll of its own). So the plan is re-expressed in
  // the hips' frame before it is solved: left in the rig's frame, every degree of hip roll
  // carries the whole leg bodily sideways, which pushes one side's foot into the wall and pulls
  // the other side's off it by the same amount. The foot's own orientation below needs no such
  // correction — it is composed against the parents' actual quaternions already.
  _wrQh.copy(bones.hips.quaternion).invert();
  _wrV4.set(F.N[0], F.N[1], F.N[2]).applyQuaternion(_wrQh);
  _wrV5.set(F.T[0], F.T[1], F.T[2]).applyQuaternion(_wrQh);
  _wrV6.set(F.U[0], F.U[1], F.U[2]).applyQuaternion(_wrQh);
  let ax = _wrV4.x * dn + _wrV5.x * along + _wrV6.x * drop;
  const ay = _wrV4.y * dn + _wrV5.y * along + _wrV6.y * drop;
  const az = _wrV4.z * dn + _wrV5.z * along + _wrV6.z * drop;
  // The solve below is written for the leg as it actually hangs — the ankle sits `ANKLE_X` off
  // the shin's own midline, to its own side — and the two sides' solutions come out mirrored
  // from that alone. `off` is therefore the leg's real stand-off and must not be flipped.
  const off = isL ? -ANKLE_X : ANKLE_X;
  const R = Math.hypot(ax, ay);
  const phi = Math.atan2(ay, ax) + Math.acos(Math.max(-1, Math.min(1, off / R)));
  const by = -Math.sqrt(Math.max(0, R * R - off * off));
  const ik = legIK(az, by);
  _wrE.set(ik.thigh, 0, phi, "ZYX");
  _wrQ1.setFromEuler(_wrE);
  if (kneeOut) {
    // `kneeOut` swings the knee's own bulge around the hip→ankle AXIS, and that axis is the whole
    // reason it is safe to do: the ankle sits ON it (the IK put it `d` along it), so the contact
    // does not move — only the bend plane turns. It exists because the IK's bulge is always along
    // the rig's own +z, i.e. straight INTO the wall for a face-on move, and a leg bent that way
    // buries the knee in the plate; turned a quarter round, the same bend throws the knee out to
    // the side, which is how a climber's leg actually braces. Signed per side, so both knees go
    // outward rather than one out and one in.
    _wrV1.set(ax, ay, az).normalize();
    _wrQ0.setFromAxisAngle(_wrV1, kneeOut * (isL ? 1 : -1));
    _wrQ1.premultiply(_wrQ0);
  }
  up.quaternion.slerp(_wrQ1, e);
  lo.rotation.x += (ik.knee - lo.rotation.x) * e;
  if (flat > 0.001) {
    // The sole, laid flat in the face. Built in the rig's frame: the foot's own +Y (out of the
    // sole) has to point away from the wall, and its +Z (the shoe's length, toe at +0.176) up
    // the face. What is left for the foot's own rotation is the parents' inverse applied to it.
    const ft = isL ? bones.footL : bones.footR;
    _wrV1.set(F.N[0], F.N[1], F.N[2]);
    _wrV2.set(F.U[0], F.U[1], F.U[2]);
    _wrV2.addScaledVector(_wrV1, -_wrV2.dot(_wrV1)).normalize();
    _wrV3.crossVectors(_wrV1, _wrV2);
    _wrM1.makeBasis(_wrV3, _wrV1, _wrV2);
    _wrQ0.setFromRotationMatrix(_wrM1);
    _wrQ2.copy(bones.hips.quaternion).multiply(up.quaternion).multiply(lo.quaternion).invert();
    _wrQ3.copy(_wrQ2).multiply(_wrQ0);
    ft.quaternion.slerp(_wrQ3, Math.min(1, e * flat));
  }
}

// One arm's worth of scratch, so a per-frame solve allocates nothing.
const _whA = new THREE.Vector3();
const _whB = new THREE.Vector3();
const _whC = new THREE.Vector3();
const _whD = new THREE.Vector3();
const _whE = new THREE.Vector3();
const _whF = new THREE.Vector3();
const _whG = new THREE.Vector3();
const _whH = new THREE.Vector3();
const _whN = new THREE.Vector3();
const _whT = new THREE.Vector3();
const _whU = new THREE.Vector3();
const _whP = new THREE.Vector3();
const _whS = new THREE.Vector3();
const _whW = new THREE.Vector3();
const _whUpDir = new THREE.Vector3();
const _whLoDir = new THREE.Vector3();
const _whQh = new THREE.Quaternion();
const _whQt = new THREE.Quaternion();
const _whQ0 = new THREE.Quaternion();
const _whQ1 = new THREE.Quaternion();
const _whQ2 = new THREE.Quaternion();

// The two bones' rest directions in the torso's own frame, for one side. Shared vectors, because
// `wallHand` wants both and both are the same two lines every frame.
function armRestDirs(isL) {
  const s = isL ? -1 : 1;
  _whUpDir.set((ELBOW_X - SHOULDER_X) * s, ELBOW_Y - SHOULDER_Y, ELBOW_Z - SHOULDER_Z).normalize();
  _whLoDir.set((HAND_X - ELBOW_X) * s, HAND_MID_Y - ELBOW_Y, HAND_MID_Z - ELBOW_Z).normalize();
}

// Put the wall-side hand flat on the face and hold it there. See the notes above `WALL_HAND`
// for why this is a solve and not a set of angles — and for why the plan it is handed is a FIXED
// one (the drag the run used to spend was retired in session 196). `cfg` is the table the arm is
// solved off, so a second wall move can carry its own. (The climb used to be one of them — `CLIMB_HAND`, sessions
// 137-154 — but session 156 replaced the climb's pose with the user's own clip, which brings its own
// arms; the wall RUN and the wall SLIDE are the two modes left that solve a hand, and both use
// `WALL_HAND`.)
function wallHand(bones, isL, e, F, dn, along, up, curl, cfg = WALL_HAND) {
  const upper = isL ? bones.armUpperL : bones.armUpperR;
  const lower = isL ? bones.armLowerL : bones.armLowerR;
  const s = isL ? -1 : 1;

  // The plan, in the hips' frame — the frame `dFace` is measured in. (The wall's own basis
  // arrives in the rig's frame, so the hips' rotation is taken back out of it here.)
  _whQh.copy(bones.hips.quaternion).invert();
  _whN.set(F.N[0], F.N[1], F.N[2]).applyQuaternion(_whQh);
  _whT.set(F.T[0], F.T[1], F.T[2]).applyQuaternion(_whQh);
  _whU.set(F.U[0], F.U[1], F.U[2]).applyQuaternion(_whQh);
  _whP.set(0, 0, 0).addScaledVector(_whN, dn).addScaledVector(_whT, along).addScaledVector(_whU, up);

  // The shoulder, and the plan re-expressed from it in the TORSO's own frame — the frame the arm
  // bones rotate in — with the run's stretch divided back out, so the solve below spends the arm's
  // authored lengths and not whatever the trunk happens to be scaled to this frame.
  _whS.set(SHOULDER_X * s, SHOULDER_Y - HIP_Y, SHOULDER_Z).multiply(bones.torso.scale);
  _whS.applyQuaternion(bones.torso.quaternion);
  _whQt.copy(bones.torso.quaternion).invert();
  // The direction the palm has to end up facing, taken into the torso's frame here (it is used
  // at the very end, in the forearm's own parent frame).
  _whW.copy(_whN).multiplyScalar(-1).applyQuaternion(_whQt);
  _whA.subVectors(_whP, _whS).applyQuaternion(_whQt);
  _whA.set(_whA.x / bones.torso.scale.x, _whA.y / bones.torso.scale.y, _whA.z / bones.torso.scale.z);

  // Two-bone IK, clamped inside the arm's real reach: a plan that asks for more than the limb has
  // straightens the arm instead of tearing it off.
  const raw = _whA.length();
  const d = Math.min(raw, ARM_LIMB * 0.998);
  if (raw > 1e-5) _whA.multiplyScalar(d / raw);
  const ca = Math.max(-1, Math.min(1,
    (ARM_UP_LEN * ARM_UP_LEN + d * d - ARM_LO_LEN * ARM_LO_LEN) / (2 * ARM_UP_LEN * d)));
  const alpha = Math.acos(ca);

  // The elbow. A two-bone solve leaves it free anywhere on a circle about the reach — radius
  // `elbR`, centred where the upper arm's own angle puts it — and on a wall that circle is the
  // whole ball game: the elbow is what decides whether the palm can lie in the face at all. Held
  // out away from the plate (the obvious "elbow back down the run line") the arm ends up reaching
  // at the wall and the hand comes out edge-on, like a chop; sent to the wall it swings the upper
  // arm out and leaves the FOREARM running along the face, which is the one arrangement a rigid
  // wrist can lie a palm flat in. So the elbow goes as near the plate as its circle allows, held
  // off by `elbowGap` so the sleeve clears, and the pole below is only the phase reference that
  // says which side of the reach the circle starts from.
  // The pole is only the phase reference the circle is measured from, but WHICH side of the arm
  // it names is the read of the elbow — and a table that asks for `poleSide` is measuring it
  // OUTWARD from the body's midline, which mirrors with the side (the run's plan is fore-and-aft,
  // so its own pole never needs it). `poleT` and `poleU` are that measurement IN the wall's own
  // plane (along the face and up it); `poleN` is the third axis and is only ever set by a table
  // that wants the elbow OFF the plate. (Sessions 137-154's `CLIMB_HAND` was the one table that did;
  // the climb is the user's clip now and `WALL_HAND` is the only table left, so no live plan sets it.)
  const poleT = cfg.poleSide ? (isL ? -cfg.poleT : cfg.poleT) : cfg.poleT;
  _whB.set(0, 0, 0)
    .addScaledVector(_whN, cfg.poleN || 0)
    .addScaledVector(_whT, poleT)
    .addScaledVector(_whU, cfg.poleU)
    .applyQuaternion(_whQt);
  _whC.crossVectors(_whA, _whB);
  if (_whC.lengthSq() < 1e-8) _whC.set(0, 0, 1);
  _whC.normalize();
  _whB.crossVectors(_whC, _whA).normalize();
  const cosA = Math.cos(alpha);
  const elbR = ARM_UP_LEN * Math.sin(alpha);
  // Measured against `_whW` (-N: straight into the face, in the torso's frame), so "how far in"
  // is positive and the arithmetic below reads as distance off the plate.
  const kUp = ARM_UP_LEN / (d || 1);
  const shIn = (SHOULDER_X * s) * _whW.x + (SHOULDER_Y - HIP_Y) * _whW.y + SHOULDER_Z * _whW.z;
  const reachIn = _whA.dot(_whW) * cosA * kUp;
  const bIn = _whB.dot(_whW);
  const cIn = _whC.dot(_whW);
  const rad = Math.hypot(bIn, cIn);
  const phiWall = Math.atan2(cIn, bIn);
  // Where the elbow SITS is the whole read of the arm, and it is a two-sided choice:
  //
  //   pressed to the plate (`elbowLevel` 0) the elbow swings out over the reach and the FOREARM
  //   ends up running along the face — the one arrangement a rigid wrist can lie a palm flat in,
  //   but the upper arm reads as a strut reaching from the shoulder into the wall;
  //   levelled with the SHOULDER (`elbowLevel` 1) the UPPER ARM runs along the face instead and
  //   the forearm reaches in to the palm — so the whole arm hovers over the wall the way the
  //   forearm alone did, at the cost of some of the palm's flatness (the wrist is rigid: a palm
  //   can only lie flat if the FOREARM is the segment the face runs along).
  //
  // `elbowIn` is the stand-off aimed at, measured inward from the hips along `-N` — the same axis
  // `dFace` lives on — and `cap` is what is left of it for the elbow's own circle to spend. The
  // sleeve's clearance is a hard ceiling and never a target, so the elbow cannot be driven into
  // the plate whatever the plan asks for.
  const inDeep = F.dFace - cfg.elbowGap;
  const elbowIn = Math.min(inDeep, shIn + (inDeep - shIn) * (1 - cfg.elbowLevel));
  const cap = elbowIn - shIn - reachIn;
  // ...and the reference the phase is measured FROM is the one thing the two wall moves disagree
  // about. Left alone (`polePrimary` off, which is what the run and the slide want) the circle is
  // read from the point nearest the PLATE, so the elbow is spent on the palm's flatness and the
  // pole only breaks the tie; that is right for a brace, whose one contact IS the palm.
  //
  // The CLIMB cannot use that, and the reason is geometric rather than a matter of taste. The whole
  // apparatus below measures the circle AGAINST the plate (`rad` is the circle's own depth spread,
  // `cap` the room left for it), which is the right question when the reach runs ALONG the face —
  // the wall run's drag hand — because then the circle crosses the plate and the clamp is what
  // keeps a sleeve out of the stone. A face-on climb's reach runs INTO the face, so the circle lies
  // nearly IN the plate's own plane: `rad` collapses, `cap` is a small negative number whatever the
  // plan asks for (`0.058 - elbowGap`, independent of `dFace` — which is why `elbowLevel` moved the
  // elbow not at all), and the clamp then pinned the azimuth to the boundary of the feasible arc,
  // which for a circle seen edge-on is ~126° round from the deepest point for EVERY limb. So the
  // elbows came out level with the shoulders and swung with the cycle — the "surrendering" read —
  // and neither the pole nor `elbowLevel` could do anything about it. `polePrimary` says: this
  // move's circle does not cross the plate, so take the phase straight from the POLE (`poleT`/
  // `poleU` are then literally the elbow's own direction — down and out, which is where a climber's
  // elbow is) and spend no clearance arithmetic on it at all.
  let phi = 0;
  if (elbR > 1e-5) {
    if (cfg.polePrimary) {
      phi = 0;
    } else if (elbR * rad <= cap) {
      phi = phiWall;
    } else {
      const g = Math.max(-1, Math.min(1, cap / elbR / rad));
      const dA = Math.acos(g);
      let a1 = phiWall - dA;
      let a2 = phiWall + dA;
      a1 -= Math.PI * 2 * Math.round(a1 / (Math.PI * 2));
      a2 -= Math.PI * 2 * Math.round(a2 / (Math.PI * 2));
      phi = Math.abs(a1) <= Math.abs(a2) ? a1 : a2;
    }
  }
  // Upper arm: the reach swung off the straight line by the elbow's own angle, out to where the
  // circle put it. Forearm: whatever closes the triangle. Both are directions in the torso's frame.
  _whD.copy(_whA).multiplyScalar(cosA * kUp);
  _whD.addScaledVector(_whB, Math.cos(phi) * elbR).addScaledVector(_whC, Math.sin(phi) * elbR);
  _whD.normalize();
  _whE.copy(_whA).addScaledVector(_whD, -ARM_UP_LEN);
  if (_whE.lengthSq() > 1e-10) _whE.normalize();

  armRestDirs(isL);
  _whQ0.setFromUnitVectors(_whUpDir, _whD);
  upper.quaternion.slerp(_whQ0, e);

  // The forearm — and with it the hand, which has no bone of its own. Its direction is the solve
  // expressed in the upper arm's own frame; the palm's roll is then a TWIST about that same
  // forearm axis, measured from where the elbow's bend alone left the palm and taken the short way
  // round, so it is the least roll that lies the palm flat. (`-s` on the hand's own x is the palm
  // — the side the knuckles close towards.)
  _whQ1.copy(_whQ0).invert();
  _whE.applyQuaternion(_whQ1);
  _whG.copy(_whW).applyQuaternion(_whQ1);                      // into the face, same frame
  _whQ1.setFromUnitVectors(_whLoDir, _whE);
  _whF.set(-s, 0, 0).applyQuaternion(_whQ1);                   // the palm's normal after the bend
  _whH.copy(_whF).addScaledVector(_whE, -_whF.dot(_whE));
  _whG.addScaledVector(_whE, -_whG.dot(_whE));
  if (_whH.lengthSq() > 1e-10 && _whG.lengthSq() > 1e-10) {
    _whH.normalize();
    _whG.normalize();
    _whC.crossVectors(_whH, _whG);
    _whQ2.setFromAxisAngle(_whE, Math.atan2(_whC.dot(_whE), _whH.dot(_whG)));
    _whQ1.premultiply(_whQ2);
  }
  lower.quaternion.slerp(_whQ1, e);

  // The knuckles stay open — the run has them shut, and a shut hand on a wall reads as a punch —
  // with just enough of a relax to seat the finger pads on the plate the palm is lying in.
  for (const f of bones.digits || []) {
    if ((f.side < 0) !== isL) continue;
    const main = (f.thumb ? FIST.thumb : FIST.knuckle) * curl;
    f.knuckle.rotation.z += (-main * f.side - f.knuckle.rotation.z) * e;
    if (f.mid) f.mid.rotation.z += (-FIST.mid * curl * f.side - f.mid.rotation.z) * e;
  }
}

// ---------------------------------------------------------------------------
// REACHING FOR A PLACE — the two-bone solve the CLINCH's hands are placed with.
//
// `poseArmAngles` is an angle table, and an angle table cannot promise where a hand ENDS UP: the
// shoulder it hangs off moves with the trunk, so the same three numbers put the palm somewhere
// else the moment the body leans — which is the one thing a clinch does. That move has to hit a
// real PLACE (the back of an opponent's skull, which `enemies.js` hauls in to `E.GRAB_DIST`), so
// its arms are SOLVED, not authored. `poseArmReach` takes a point in the character's own frame
// (the frame the `CLINCH` table is written in — origin at the feet, +y up, +z the way the rig
// faces) and puts the hand-mid ON it, clamped inside the arm's real reach (`ARM_LIMB`): a plan
// that asks for more than the limb has straightens the arm instead of tearing it off.
//
// The core is `wallHand`'s, and deliberately so — it is the same limb. The shoulder is taken into
// the hips' frame (it rides the trunk), the target is re-expressed from the shoulder in the
// TORSO's own frame (the frame the arm bones actually rotate in), the trunk's own stretch is
// divided back out so the arm spends its authored lengths, and the two segments close the
// triangle. What differs is only the elbow: on a wall the elbow's ring has a whole constraint
// apparatus around it (the palm has to lie flat in the face), while here the free parameter is one
// POLE — a direction the elbow is pushed towards — because the read of a clinch is where the
// elbows sit (down and out, round the head) and nothing else about the arm is constrained.
const ARM_REACH = { out: 1.0, up: -0.55, back: -0.20 };

const _arS = new THREE.Vector3();
const _arT = new THREE.Vector3();
const _arA = new THREE.Vector3();
const _arP = new THREE.Vector3();
const _arD = new THREE.Vector3();
const _arE = new THREE.Vector3();
const _arQ = new THREE.Quaternion();
const _arQ0 = new THREE.Quaternion();
const _arQ1 = new THREE.Quaternion();

function poseArmReach(bones, side, e, tx, ty, tz, cfg = ARM_REACH) {
  const isL = side < 0;
  const s = isL ? -1 : 1;
  const upper = isL ? bones.armUpperL : bones.armUpperR;
  const lower = isL ? bones.armLowerL : bones.armLowerR;
  // The target and the shoulder, both in the hips' frame.
  _arT.set(tx, ty, tz).sub(bones.hips.position);
  _arQ.copy(bones.hips.quaternion).invert();
  _arT.applyQuaternion(_arQ);
  _arS.set(SHOULDER_X * s, SHOULDER_Y - HIP_Y, SHOULDER_Z).multiply(bones.torso.scale);
  _arS.applyQuaternion(bones.torso.quaternion);
  // ...and the offset the solve works on, in the TORSO's frame.
  _arQ.copy(bones.torso.quaternion).invert();
  _arA.subVectors(_arT, _arS).applyQuaternion(_arQ);
  _arA.set(_arA.x / bones.torso.scale.x, _arA.y / bones.torso.scale.y, _arA.z / bones.torso.scale.z);
  const raw = _arA.length();
  const d = Math.max(1e-4, Math.min(raw, ARM_LIMB * 0.998));
  _arA.multiplyScalar(1 / Math.max(raw, 1e-6));
  // The elbow's own angle, off the triangle the three lengths close.
  const ca = Math.max(-1, Math.min(1,
    (ARM_UP_LEN * ARM_UP_LEN + d * d - ARM_LO_LEN * ARM_LO_LEN) / (2 * ARM_UP_LEN * d)));
  const alpha = Math.acos(ca);
  // The pole, squared to the reach: the elbow leaves the reach line in this direction, which is
  // the whole of the elbow's freedom in a two-bone solve.
  _arP.set(cfg.out * s, cfg.up, cfg.back).applyQuaternion(_arQ);
  _arP.addScaledVector(_arA, -_arP.dot(_arA));
  if (_arP.lengthSq() < 1e-8) _arP.set(0, 0, 1).addScaledVector(_arA, -_arA.z);
  _arP.normalize();
  // Upper arm: the reach swung off the straight line by the elbow's own angle. Forearm: whatever
  // closes the triangle.
  _arD.copy(_arA).multiplyScalar(Math.cos(alpha)).addScaledVector(_arP, Math.sin(alpha)).normalize();
  _arE.copy(_arA).multiplyScalar(d).addScaledVector(_arD, -ARM_UP_LEN);
  if (_arE.lengthSq() > 1e-10) _arE.normalize();
  armRestDirs(isL);
  _arQ0.setFromUnitVectors(_whUpDir, _arD);
  upper.quaternion.slerp(_arQ0, e);
  _arQ1.copy(_arQ0).invert();
  _arE.applyQuaternion(_arQ1);
  _arQ1.setFromUnitVectors(_whLoDir, _arE);
  lower.quaternion.slerp(_arQ1, e);
}

// The clinch's hands are keyed to a LIVE point: the head of the body `enemies.js` has hauled in,
// written here each frame by `player.js` in the player's own frame (see `updateVisual`). It has to
// be live because the head is the one thing in the move that something ELSE owns — the haul is a
// velocity, so the head arrives over a few frames rather than by teleport, and a fixed table of
// hand positions would either reach for where the head used to be or arrive before it. `ok` is how
// much of the target to believe: the pose cross-fades onto it over the grab (see `poseClinch`), so
// a body that is not there falls back to the authored path instead of snapping the arms to (0,0,0).
const CLINCH_HEAD = new THREE.Vector3();
let clinchHeadOk = false;

// ...and THE WALL CLINCH's own live target (see `poseWallBeat`): the same arrangement, and for the
// same reason — the player's two hands have the body's skull, so they are solved onto the head
// bone rather than authored as angles. What differs is what the head is being used for: this one is
// pressed into a WALL, so the hands drive it forward and down instead of dragging it onto a knee.
const WALLBEAT_HEAD = new THREE.Vector3();
let wallBeatHeadOk = false;
// ...and WHICH WAY the stone faces, so the grip can be placed on the SKULL's own axes rather than
// on the world's: the hands close on the sides of the head (along the wall's TANGENT) and a touch
// off the stone (along its NORMAL). Written by `player.js` alongside the head, from the wall the
// move is actually staged on; defaulted to +z so a frame before the first write still stands the
// hands somewhere sane rather than dropping both onto x=0.
let WALLBEAT_NX = 0, WALLBEAT_NZ = 1;

// ---------------------------------------------------------------------------
// THE CLIMB — THE CLIP. Session 137 built a procedural face-on gait, session 152 deleted and
// remade it, session 154 gave the limbs their lanes back. SESSION 156 THROWS ALL OF IT AWAY, and
// the reason is the user's own upload: *"here use this animation for the wall climb"*, with a
// Mixamo **Climbing Up Wall** clip (30 fps, four limbs alternating, one 2 s cycle) and a
// photograph of the game's character on the stone with the leg shapes sketched over it in blue.
//
// So the climb is no longer a pose this file authors. It is a POSE PLAYBACK: the clip, retargeted
// onto this rig's own rest frames offline and baked below as 61 keys of per-bone local
// quaternions (`CLIMB_Q`). Nothing of the clip ships at run time — no FBX, no loader, no skinned
// mesh — only the numbers, which are the whole of the animation. The bake, its input clip and the
// recipe for re-running both live in `src/tools/climb-bake/` (see the README there): `CLIMB_Q` is
// generated, never hand-edited.
//
// WHY A ROTATION TRANSFER AND NOT A WORLD DELTA. The clip's bind pose is a Mixamo T-pose and this
// rig rests arms-down, so "apply the clip's world rotation to the rig" would swing the arms off
// their shoulders: the same rotation means a different limb direction in the two rest poses. What
// the two rigs DO share is each bone's SEMANTIC frame — its segment direction, its hinge (the
// elbow's, the knee's), the palm's normal, the sole's — and every one of those is rebuilt from the
// clip's own joint positions at a reference frame, mapped onto the same frame measured on this rig
// at rest, and then carried by the clip's world rotation delta
// (`A_b = D_b · M_b(f0) · G_b⁻¹`). MEASURED: every bone's direction then tracks the clip to
// **0.012°** across the whole cycle and all four contact points to **0.000 u** — this file draws
// the clip, not a lookalike.
//
// The rig draws it with its OWN lengths (a thigh 0.440, a shin 0.390, an arm 0.585) and the clip's
// are within 5% of every one of those, so nothing is scaled but the hip height: the table's
// translation is the clip's hips' own ride, times `K` = 1.0 / 105.28, which ties the clip's 105 cm
// hip to this rig's `HIP_Y`.
//
// THE GRIP. The clip is a real climb — a hand plants at a steady descent, then flies to the next
// hold. MEASURED over the cycle, the four contacts descend at **0.53-0.65 u/s** while planted
// (0.59 mean, a ±12% spread), so the no-slip clock is 1.18 u a cycle: that is `CLIMB_CYCLE` in
// player.js, and it is why the cycle rate is now free to be a pure tempo dial — the leftover is at
// most 0.14 u a cycle, i.e. a palm slides no more than **7 cm** over a whole hold at ANY speed.
// (Sessions 137-152 spent their whole budget on that number: the procedural stroke carried 0.79 u
// of slide, which is what the user saw as the climb *"swimming"*.)
//
// THE PRESS. The clip's contacts are not all on one plane — MEASURED on this rig (the deepest drawn
// vertex of each limb, swept over the cycle; see the tuning notes in src/README.md), a hand reaches
// **0.44** in front of the hips at its median, a foot **0.28-0.35**, and the four spread over
// 0.33-0.62 — because the clip's own body swings in and out of its wall over the cycle while the
// game's plate is flat. So the body is placed where the limbs SPEND their time rather than at either
// extreme: `CLIMB.PRESS` is the median of the deepest drawn vertex of all four limbs over the whole
// cycle, and the hips are carried to that depth from the plate on the wall's own normal, whatever
// stand-off `WALL_CLIMB_HUG` leaves. The clip's own in-and-out ride survives all of this — it is in
// the table's hips translation — so the press is a base offset, not a flattening.
//
// The trade is honest: at the extremes of the cycle a reaching hand goes ~0.2 past the plate (a
// fist that buries itself, which the flat shading and a wall-side camera hide) and a foot is ~0.1
// short of it. Both are cheaper than the alternative — a press set to the DEEPEST limb would hang
// the body a third of a unit off the stone for most of the climb, and a body climbing air is the one
// thing that cannot be hidden.
const CLIMB = {
  PRESS: 0.44,   // rig units from the hips to the plate (MEASURED; see above)
  GRIP: 0.62,    // how far the digits close on the hold
  // THE SPLAY — the one thing this rig adds to the clip's LEGS (see `poseWallClimb`).
  //
  // The clip is a real climb and it holds the two legs CLOSE together, which this rig cannot draw:
  // its thigh bones are hinged at the pelvis' own centreline (both `legUpperL` / `legUpperR` sit at
  // `(0, 0, 0)` of the hips — see `buildStreetCharacter`'s `hinge` calls) and each leg's pant tube
  // is offset sideways only in the MESH (`LEG_TUBE`'s `centreX`). So the two tubes are already
  // touching at rest and the moment the clip brings the legs together — which it does twice a cycle,
  // on the beats the swing leg passes the planted one — the two thighs, shins and shoes land on top
  // of each other and the climb reads as ONE leg: the user's *"whenever i climb a wall it does this
  // weird animation glitch where my legs stick and join together"*.
  //
  // MEASURED on the live rig over a full moving cycle before this number: the two shoes came within
  // 0.006 rig units of each other and the shins within 0.027, where the run cycle never brings them
  // nearer than 0.48. So each thigh is ABDUCTED by this much (radians, both sides, about the
  // pelvis' fore-and-aft axis — see the pre-multiply in `poseWallClimb`) and the whole leg swings
  // out with it. It is CONSTANT, so the contacts keep their descent rate exactly (a fixed rotation
  // moves a held foot by a fixed offset and adds no slide — see `CLIMB_CYCLE` in player.js), and it
  // fades out with `rest` because the parked stance solves its own legs and must not be rolled
  // behind its own solve.
  //
  // 0.30 rad (17° a side) is where it stops being worth more: MEASURED over a full moving cycle, the
  // shoes' closest approach goes 0.006 -> 0.339 and the shins' 0.028 -> 0.230, and past it the gap
  // keeps growing but the stance stops reading as a climb and starts reading as a straddle. The feet
  // stay on the plate: the deepest foot vertex over the cycle reads -0.317 / -0.253 (L / R) before
  // the splay and -0.196 / -0.261 after it, i.e. no deeper into the stone than the raw clip — which
  // is the standard every wall pose is held to. Verified end-to-end too: on a real wall the body
  // climbs 10.3 -> 16.8 u with the shoes never nearer than 0.306 (0.41 world).
  SPLAY: 0.30,
};
// The BONES the table carries, in the order the encoder wrote them (see `climbTable`).
const CLIMB_BONES = ["hips", "torso", "neck", "head",
  "armUpperR", "armLowerR", "handR", "armUpperL", "armLowerL", "handL",
  "legUpperR", "legLowerR", "footR", "legUpperL", "legLowerL", "footL"];

// THE TABLE. 61 keys of one cycle (key 60 duplicates key 0, so the runtime wraps without a special
// case), each key 16 bone quaternions plus the hips' own translation, quantised to int16
// (`v * 32767`, a 3e-5 step — a quarter of a degree of roll) and base64'd: 10.9 KB of source for
// the whole climb. Decoded once, lazily, and never again.
const CLIMB_KEYS = 61;
const CLIMB_Q = "4Ov42/cG9ngaGikEew2DfNX7KwcT/rZ/NezOEB4ERH3SXIzRszjwMGQzzvLp+l90zvtC6Mv2Xn3yPIxUV79m2w5kquqhD1FLbOaXqQweyVVM7zcSi/Y7fTIzKRoL7cdwPSBr+Z4sXnOcnhDtZv7aUO109+lUCgoun/4aEQTHUnHTCP7y2wiW7SPfBwgQepgZNgf2DIh8hvojBfX+xX/N7MkNCAS7fSRZB83oPCUusjN99OX3PnRp/CDnD/UHfWtDFVNVw5Xc0WSh6mEQIEpE6nypPSPCVEjs2hFf9+h8xTM8FxTrznAlJx75byxEcX6fMu3y/OVRHHPi6NYLlDHN/3oPbcZEcbgHFPPVBWruNuKdCO56XBnRCq8MWXzL+U4Dh/7Lf5ftggp+BCZ+K1Fxx4REmyvhM8Hz3fTWc33/juMq8yJ8k0p1UeLIHd4oZfXqShDFSaTv2ajzKLlSwurFEZP4vnwlM0IUvOg1cUstJPlNLAFvTaH/7F/73FP2cOTnyA1nNYsB2A2gxQ5xhQaG85gC4O0v5RYJgXvCGZoNVgwHfEz51QGO/MN/xu4QBykFiH6jSavBSkp2J4oz4/Fu8oRzMwJD4ZjvJXv0T21Q1s7D3j9kcuz7Dq5LUPZUpzYt40+Z68URnfnxfCswQBF95oVybTMF+a8ri2yKpLrsf/kzVzNuBucJEPM50wM9DLXEtXA2Bar07/6f7O/n2AnSe60ZBA/DC+97b/m8AEL5pn/A8IED3AXnfmdELr1/TR4jXjL/7evzp3MxA8zg/OjxeVhSd1Ce0/fd52BQ7uUKAVGq+syiEi0TS9HtgREG+2J9ais9DzLj6nPCOZr4ASuPaYqosuxx9wlbwmpJ5kgSKz/LBtAK7sNNcO8DTvb7+mLr3OrvChB8cBjQDsIKTXwB+vj/iPVtf7PyXgC1BiB/dUB0ulFQrh6ELeXoh/cSdS0F4uAX4SJ41VJSUFLVqdygW5vxuwb0V4b9XJ0gJ4dH9+1rEXT8d31BKyEOAeBHcwk9mvjoKr1njatG7Rz1t13SZ0TlVhMzQ58J9gnbwyJw2AL19tv30Okm7aULGXyHFxcObgmrfC76Yv+N8id/qfMM/toGM3+1PJO4tVJ8G6UobePT+tl16AYQ4WHaKnYtUuFPTtU72v9U6/VyAiNfPgGlmIkfl0S57f8S/fw3fRUuJAw34HZyIT5H+O0peGdjr87tgfPxYOlkh+QUFANH3QtMCfzDC3CPAeD3ePXG52jurgvle6AXmA33B858jvka/3Dw4X788+z8CQZAfwk5SrYBVE8ZlyWl33T88nWiCCbgg9UkdExQwFDG1K7YK0xB+Yf9nWYOBteU7xUyQsDu9RTn/hV9+zCgCiHgYnGoPv33PylnZ620/u398hJlimE+5BAVM0vNDaEIAMTibxEAc/mD87Plg+9qC6Z7AxhjDTYG23yw+PP+s+6bfkX0MvyKBUh/SzQ6s8xUvhc2I9zdxfwvdjUMQd2h0XlxNku0U3fSa9cSPhD+ePrJb/D1gG9G9BLD9PCdF74B4nz7Mm0Idt9+cIc/v/fYKANn5brT7fDyZGmiXV3kGhbGT4sPBwgixMVvZP6Y+/bxAeTG8MYKf3u4GFAOCQS0fPr3WP6d7Wd+lvSB+icGOH9aLsuvdVVVFr8j5Nwe/Lh1fQ8j2UjPuW4ARfxW3M58178q0AOV+Wt4GfPUc34AFMun8sUaNgVYfKQ1zgUw31Zv+T9m97gowWZrwSrtB/NJbT5ZrOSEF19UpRGOByzEhG+m/Pv9yfAN4xHyyAmDe+IZAxBHAVJ8MPdN/QLuZH6p9G74NgcQfyIpmqxkVRMVaSkq3ML6knP8D/zUdM8ubS9BLVlCzDbZvhhwBGT8dH0B9lV2RA5u0qHyTB5lCUh7yDkCAyzfWm2JP0f3CinjZr7HHuwX84BwOVT45OsZz1h8FB8H5MPnbvT6awDT72HjU/OhCM97sBqhEO79DnwP9lT8su+Dfgb0JPfUB+N+xthfVpOsZOu1MuvcEvnzb1UOdNFU0cdscUYWWDXOnd0DF4P8+vebfUf78nYEFG7VVPA/IQMOzXnRPvIAFd+Maj4+ZfeqKXBnf83i6qfzCnMcTnjlAx14XSkYvQaLw/9tKfkXA/Hu3OS+9CYHX3w/G68OyfoWfGv0zPsR8YZ+sfKH9t8IpH5o1vRY3LAp6jw+l+CD9u1qbQvMzrLUWG1ZU61T69as5N8rGfND8IJ2+QHJeVkN/9qT65IjEhO9d+tEqP8O37Rm3Duj978qa2jf0mfpRfUjdYpGZeYIIJ5imxx6BlvD1mxA9wQGIO6q5if2VgX2fFkcCgvF+B58FfPe+3TxcX408cz2EQtSfmjRTVogtoDn/Ujl5UvzDmWXB8bNZNibbiRddE5c3TXt80JS6xTvxGnHCiJ8UQLO4ofkryW/GJp0/kwS/03f4GC3Nyj4uCzqaQ/Y+OcD+PB2Cj4O6EIi3WenIUMGz8Oma3r1tAht7XroQfcLA3p9th3tBzX4AXyi8kT87vF2ftLvDfjvDA9+rcxqWoK6teTmUK/qL/CSX88D+81r2+5vEmT8SDThUfZSUUDjyfTnXZIR83zM+Wrrh9j8JU8gFG96WrkBdODZVAAsVPmlMUNtQtwG5yj8R3hYNmfqgCKBbF4mOQaRxQtrKfRYCi3tP+qj+BwB6n0tH1QGb/jAe+7yMvyZ8pB+5u4t+BYO0n28yTtaOr0N4w5WIO557mJboQBjzpTcjHD2Z+ND9OBo/ohUe9rG/npYqQ4qfUjxG+/qzakkJSY9aUFk8QIX4NZIaB6r+og2nG/A35Hm/AA5ef8uPe0OIB1xrSqvBsXIFWsi83sLPu0M6i/6xP/3fesgqAYr+VN7tfPA+0rzs3797k/3Ig+ofTvJoVovvg7jVFgo74ruZ1mB/8TO7NuBcExpfD7n2uQD200b0s0INVrfCTB8pu0O6dDF1CKBKuRjJ2sQAvDcjzxxET38ATsscKbjSOaUBA16gSr+7kQcJHTxLPUHx8uUaxPymgtA7kjpsfuf/uJ9wSKRB+L5zXps9CP7VvTYfvzvU/b2D5x9lsgLW+y+6+M/WjPw3O65V+H9C88r211wW2krOCXSGwXkPzPIbA+aXmcALXhb9UDVKb5qIMQrTV9vbtMA8dfPMuoGyf0JPylvM+j85cgHzHoHJjTwThi7dvEudAl/zuNrD/GRC8vvD+ge/aX9r32qJPoImfoveq30Nvof9eZ+CPFq9CcQjn2Yx2dbjr+r5fVb0/Bz7yhWoPtKzwDaA3C5ahAxQ818A78vgr+XFVthvfSCcRcDAsYbto4c8CrnWtFvXQF9044rDgBK/qpAc27u7ajmxAnFeywgvO8ZFtB4OjFDC0nQgGs88KYLrPF55oH+0vxgfaAmuwpQ+3d5i/Qg+XT13H6/8cfxAxBifVjGpVscwPTn9l3m8YrvK1RT+UrPotnGbyxt4igzy00CyhwhsrYV+F4+FAeaPuptRzuuPhhLKIVW+HBFBKPSTicb/OH9XECNbi/zJOYlCkl8gB0M8NMVlXmIMZ4MLdGaa5bvIgtF9KLkAQA4/Pt8oCiLDPf7qXgX9Z/3U/bjfo3x3+5GEPd8LsOEWpHAZ+q5YA3zr/BmUTH0cM9o2VZvfW9/H7vJ+QOPCU2rSRK4XX8Zl6M/229MBan/E2clx1NPcb8FaNGbJIX4nP1vQFFuhvh55BoKXnxaHGbyohUseogwgQ180oJsDe9MCkT3o+KmAaf7f3yfKkoOuvzMd6729PWS9/t+SPBt7EIQdHwSwcpZusAW7SZj6fSd8LJOdvAyz1DaFW8xcIYazMi+BsEA0LB3EQdjKRwNpL7ZT0v/pgUQxiTHUrdxXQb9z0Qh0/Zf/TE/525M/aXi1gkrfAkdP/VLFVt6vi0PDhXUS26q7tEIhfqV4EsD4vrue40sBRDO/eZ2xPcP9aX3/X4e78/qQxAJfHy/q1gOwJTvRWWM9njwI0y77PrO8NvxbpJueBy8xj0IZwQttuUUXGaaGXKiUuBHTeynow4KJFVUaXLmBp3Qnx9F9D3+Ij+1bpoAUeE5Cet7SCBb9jUVpnkBKdsOE9VscIHuVAbX/ZHe7gQe+lB7Zi6ZEfb++3Xe9430a/fvfpnub+nzEKF7Hb99V1++dvHhZmv3nPAVSs3pz87m3fBuIG6nHs7HkgwJDwvB5xLLbD4Zl5ux8K9Jn6rhDkok61Z9cjgG7M9qHjjxlf9XQKhtXwMx4CEIq3sCJGj2HxZweHAj2g8N1SdyUO46A/MArtx+BoL5r3ooMPYSBAARdcz3uPO8999+CO6m5w8SDXvYvYpVvLwj81povviz8ClIiubkzuXf324Ybh4ggckmEOYXR8pzEVhwEReMlmH/xkSsrPgOsiVJWDFyTgX8zYYcEvBhAHhB02wuBuHetwZNe0UnIPfpFyB31B2EEKjUgnMB7uT/swMF2+sHB/kVes8xDhT0AC90FPf88r/3wH5Q7a3lXhNWeqC8NlPTumr0nGmo+Q/xeUZt4wbPoOGobkRueyDzytUSWhz6znIQmnGdFIOUtgfrQS2t9Q5fJwhY4nHwBO3LBxqh8OEA4kGnbOkIy913BeV6iSks+LMZDXbCGAsRgdSRdMftiPzsBarZOAmq+I15WDPDFL4BYXPG9YvyqPeafpDsPeReFLx5SLwRUY24BPWgav35qfEVRe3gF89a43lus271HxbMURQiHBjPPRC8cdEST5RaCelBPK1vD6woaVdccS4EmMmQF1LxlAHvQbZsLwv23AcFf3qpKtb4HRqadWoU4hHJ1GJ1te05+YAHtdhhCmr4I3nANP0UXAKxcn/0HfL693d+/usk4wEVSHn9uw1PkbY+9XFrmPod8vRDe94Vzw7lL26cb/geNM4SFuEbFM8KENJxSBFUky4KlUD7rJ0Pkim2VtRwqwOpx5EVBPITArxB6mzODBvc6wQYelYrdvnsGW51xxCmEjTV/nW57fz1kwit2OcKoPgYeaQ1KxSHAmxyxPOY8VD4XH6u6+vhpBXReLm5w01ht+L0bmwl/QDxSELS2+/OVuaUbS1xMh2f0eUXJB5M0KwP0HFI8PZuVfKxw4OsvA8bKvpVhXABBKPGYxRf8jICLkFKbeQMa9s7BOd5iixv+iAa/HTPDRsTe9Vndtrt1vJJCdTY8wrq+Ch5TTZ8FNUCDHKx81vx4fdMfk7r5eBvFll4Srm6TK+2AfXfbAr+yfCJQQjaus4C5wlts3JUGz7VhxkrH3XRjw8IcoXxCHE58OPHO6yvD/kqSFUqcKQEp8VlE5/yPQKgQKZtTwzW2noD0HnDLWb7GBqQdO8LeRPL1al2Ou7N72cJINnRCkz5SXmwNuMUMwPHcfLza/EW90d+1+pk4AUXBniiuR5Mp7V/9eBs+/328JJB6NhtzhLnhGyFczEaHNiUG3cgTtDjDWhxafGYcYHvR8n/q4cPSCvtVPdvywVaxVUTWfPiATFA/236CkXaygLJefguAPx/GTx0SAvJExfWx3bP7t7s3wjO2K0J2fhAefI0dBXzAoByUfVE8VT4d36467TgeBj5d3pHuLkBT6YJj2xoAk3tIkGo2frOIeqwbUxwfR6C0RgaaCBnz3cP1nA58UZxt/OWxxuuWRCALapVBXAgB3zF+BKo83ACCkNPbCML9NpMAv152i9Q+W0Y+3PmEOcT59e3duLvMuuoCXbY6Agm+Ch5FDLYFI4C6HNW92rxBvq6fjDtcOHpGE94NEnjwvdUXAhVajgGxuq6Q6vbEtJx7B9wRWvHJSnKcxeXInLQ7hBscA/wgG9998zDe7EZEE4uZlhWcHoIocYAFLjytgL3RPlqJQmx280AZXr1NCT2GxfJcaUWGxSi2Ph1NvHU6j8K6NiECA/3QXk4LRoTLwE0dp366PEy/hd/Q+5/45EXP3kCSzLNQ1plBVxmqwfH6NtI7d921Qjt03LeZOcvLMVKFawnddNgEA9wIu1hbTj5nsDPtekRgy6fWxFwGAjmxlMWdPJ9A1dHWWlcCAjdQADYeoE2efQ4FhNxeh0TFG7bXHXQ8m7sqwoN2vYHKvWAeTsnTxEtAJp4vv2k8jUENX8Q78rmAhWNejBL7NYXX4wAdGBjBW3ol1CR5nXX3ewpdc1dVTrAwr8UuC3X1zMOtW9TFsmU4gX9QYi6ahXZLlxeEG8LBkjGFRpS85QEgknqZ2sJWt+aAWV72zKo92EWAXPKJ3ETgeZaddj0se+1CsPaqQbU8pF5/yLJEIUC8XnM/JTz1QYrf2/yn+nZEt57/Er43jZiJ/t/V3EDeehYWhftstk+6q52RVgpQjPC3ROoM8jbEw55blwYE5c2BfJEI8D1GsEw7F82bXsD18S5HnP2DwaoTOBlKAqX4MACo3vPLZ7/LhWgdTI2YhFJ/JZyp/er8xcKVtoZBCPyeXm+IUUS0gbreZD5xPRyBi1/TvYA7HMQ+XwWTj/mzWFz+LRM3gZC5zNjV/HF3vHnWnjvUxVJ2sN6E1s8497fEJRqQRgnmcEEE0hYyCAjYjKKYUtqaADKwpQkXPrzB99Qu2LWBlnfcv6QeyYvNQGNE191NT/mDkIJ6W1k+/T3kwh52VwAWPNnedch2RMTCmt5o/l99oEHQ38X9tjvsQzyffZUNO2aXeH4SUKFCz/oRGpr9HTm3+i6elpRhE8GyJERyUNa4JoUy2UCGaiZugOYSGLSAyvCMF9kmmaj/VLCOy0f/BsJJFPQYL3+wt/m9XN77Tcw9+8RYnE8QowNbQCvbMX/ofw5BrPZCfxX9Zp5oyFbE6MLanmY/NX4DQlufzvzTPXICYh+i1mk8khaBPq/NrEK/ut0cYH6c+5W75F9gU+SUz/KvA0PR7fh1RWzY0gbPZnYAT5H1drAMEgsRGdwYkL9UsTlNz381ggAUtBh/fO543fxZ3sEQurtFQqwa6hBTQ3A8SJs7QPnAMcD59ua9xf4QnqTIB0T8wu2eZT8IfsrCJl/dvIJ+gMI434RXZr0B1ew+1Yudwii60J1O/5c8i75En8oTfhWdstGCiJK9eOBFvRhFBz2mGwAjUZB4U81LCXlaZ1cV/0ax4pDJP1sBypODGXw50rpye5xerBK8eldA4ZlLTtJDyznsG3gB3EFsgHj347zj/sye0QelxR+Cxx62Pnj/H0Hl38289T9ygQ/f1ddcPOjVmn9DinyBFXnmHbh/n/wsAAMfzJLg1pLzhMIwU1O5SUZ1F6SGVKYG/+QRu7lpzmtHIFr0VTh+oXIAk4NANAFREoWaKfaQ+8z7KZ3S1J06ML+KF/ULYgT/eJHcm0LxgkYAAfkte8t/9V72Rs/FhALb3oN95H+Dgd7f/zznwELAWt/n1yN8PtW+/8GJUUBKuMUdzz9ne4gA75+RUrEXMPQdwUUUTvmExxrW3UUn5f4/jFHYOkwPLYT52zvS/j55MoYWPQCKwSERrJqZs0+9Kjp03I9WffoQ/y+WAYgGxdB4c51PQ4eDdT+qeZi68gBv3syG44Xdww0emf1ngBkBHt/3fNrBdb+TH+MXK/r6lXmBC4jqgCc4UF3lfpG7ZICen6OS29c4dHPAUVUXec7HW9YPQ5Ll1wBN0gs7BA5qgs9cARClv7xzhBi3QdwArpC6myiwaj23ee8bHtesOqN/JtT9xVsGMjd4nbLEPgPrP1I6LjmLgMse98bqxjmDo55oPSzAvIAdX8v8wQJtv0Df3hctuXmUyMK2yHhAYHgVndX+J7rCgEgfqhMYlua0T3+6FZN6Kod9VXzBniXZgN2SULuuTJABBh0xDZyBmrVX2tTDlMALj71bjO33vYA6Blm+GFK7Cb/+U8TD3wYqNoBdxgTixLA/AvqdeK+A4h6MBwJGfEQJHmv84AE1/5Rf3XznAxn/LR+kF2Z4TlQYxA1IxQAnOO9dyHz2u0j/gl+5ExoWm7QI/qbWMbowR1OVJf/MpgEBbdK1u5nKtX+iXcCLNgPUNtbcTAWn/7JOoFvna3b9Y3qCl8fZWXt5QIuTGMJ1Bi22oh3wBRHFFz8Z+sx3zsE7HkzHL4X9xFAeVrzPwap/TJ/9PNFECr7S37rX3nfEUsfFkInGPfM6ER3lOti9tD77H1qS25Zzswz96NZFurOGztUY/hFmdMFv0vb7mQhJ/tGehwkghgX4AR0rx3s/WA4/m56pdTzje70V6hpge71BsFF1gOmGfvbDnhiFQ4VCv1666rc3AQzebMc3RSiEbZ5TPTvB5T8K39Z81MTGfvNfZVgZ9xYR2oaZyxr8ijtx3X96cn25fuvfUhJ/1jHyafzblqM60sZi1Rf8zSaCgc7TDHw7RjV90d8Jx2qH1fkVHU8JZn9ZzawbeyfsfFE819SdG5v70sKqz1lAKUZ59l5d4EVURUF/uPpaNoLBTt4BB5sEaUQEnor9loJT/swf2ryUhU5/Gt9YmFL22lEhx1KMX/qsfbHc8/s2/Zt/Ct+BEfZWKPHmu+3WovtFxaXVXPxmZrKCDtMAPQdEs70pH3wFcQkIeg9dp8sav2ZNMprnZ3070j30E8Rcl3wbAyGNif+OBlp1mF2QxUqFRT/5efI2K4EV3cPH9sNvA9jenP4lwoh+jN/uvGyFof9In2LYZbaq0PWHeAwHd49AFdxNfJO9J/5jX46RI1Y98T0611aJvCfEktX8PComngKAEy49wcQtPMffhgT4CWa6at29TCq/fQzN2oTnUbvTvkzTw50RPG1Ds8xe/3DGevUt3XSFMQTRwAX52bYeQQOd3oegAn3Dgt7D/qSC335K38j8bwXiP7jfKlhu9leQj4fYC+M1owEW2/99SjxZvdyfidA41g0wpro7Vnv8g8Qs1gs8duaFgs6TEn6lhDH8zN+FhKKJVHp4XalMt/8oDQRaW6dke8N+a5PVXTr8kMTCzDl/tgYttTcdRkUpxG9ASnnMdleBFZ39xytBLQOuHuP+kkM3vgXf+HwgRiX/7d8SmO42uM9ICRGM+fYawVwbhH7jfHW/RB/CDxUWbe/LOZrWmv0tA6kWMvvnptXC+hMY/plEMPzOn79FNgji+n4dmYwr/3BM5Jqjp6Z8Pj2C1G/cyT0ohZMMBX+khjE0451HhObDqkDgObF2oAEsXe3G8YBzQ4RfGH81Axg9wJ//+/1F/oAtXyvY8faqju9JlY28trmBaZtC/698VoCKn+7OohZGL9w5V5c1PLkDllWPOs5nZIMsk0c+ZAQx/IKfoUcgyJA7EZ20Sjr/IAyQ27mn1LxH/WLUi50ovMYFmAvNPgqGDfRZ3T3ESoKNwZb5DrcFQWjd+AbhwDrDSV89f7/DFT29n6R7lsWUQLMfDdiZNrRPb8mozPr2hoH3m5s/EXx1f4Xfxg7SFkNv4LlS14V8G4PrFNa5g6fpA4uTu35OxH48eh9FiTJIBjt1HS3Hnv8MjKdcf2f//CP9IRSTXWL8JIQ7i3G9SoYzc+jc7EQ6wTcCGfiB9yHBRd30hxW/0YMGnzN/+wMN/b3fujtghWPA9J8UWER2+k+4idmMCrcSQikcAP5iPBZ+bF+njoyWIi9nORmXxXu9g4VUjvjcqD+EFVOyPvtEQHy430KKeofjOxWcx0VR/w1MsVz157y75b1GFFrdsTtNgueKxr4ExgFzhRzZQ/5/zYLjOIh2iAFjnavHO/+GwwmfGr/3wwQ9vV+z+2UFYIExHxoYBHc8z7XKu8uot3oCKpxs/WY7zr1EH5kOQ5X27uQ4jdgXuxGDtlQLeH+oesS+05E/IIRPfL9fZQq/SBS7ZlydQ7Z+yIxO3WHnczuxPeDT0R3GO0OCjwpkPqCF0zLHnJPDg38MA1S5ALYlQRPdqIbIv/pDE58av6oDDr2/H707e8V/AS1fOBdkdwyPy8wJDIF214GoW8J9OrwnvYxfo43hlahumngC2Hw6sMNlE+Z3wakExRxUAD7URGT8gJ+1CpkIh7vX3KcC0P7hS8vdpec3O08+llOx3fD7PoJlCeH+9AWRclYcVMNBvmNDsXlktZoBCZ2Uxsy/ysNWXzI/TEMFvcVf/ntABZKBa98+lzR3Jk9BTT1Ma3h9AW4cZn4yukv+Jh9hDUxVoe5et6GYXDqLA30Tk7fzKXwFBhSgflCESTzAn6bK0sjRvD4cRsMvvobLqx2bJzF7Af9B07td+7rbAgUJ3j8ERZgyBdxUgyr9gwP0eYq1nUEO3aEGyr/Qg1MfBf+hQuK+D5/Xu17FVQFr3yFXf/b7DqQNTkyjeVeA6xy/vqx6Dv5k30KNOZV/biY3Kph6urTDPdOYOAMp9kVoFP99wUSy/PhfWYtISL58Lhx1A5g+gQtxHbdnP7rzf5xTs93dOvtB0onhP0qFXTH1XBnC+n0qg5Y6O/W1ATNdisb2v+2DVN8d/6gCoL6bX+E7MYU6ASxfD9eXdk1OGE1rDKP6qMAkXMF/DPoO/mFfYw00FXwuUPbHGI86zoNbk7q4RqoMBfwVJj1mhLX9Ld9li/OH1fwaXFoEy/6qCw7dmidT+y4/zZPSndS63sIqSgR/hwUYccAca0K1/NxDRbqANm0Bcp3jRrBAegNbXyX/SUJifyZfxrsWBNeBOB8KV6X1VE3jzNQM17v3P0OdNT7Kuhm+HV9/Dd8VWy87dofY9bqYw7VTMfjDqkBGr1VnvKTEuv1h32yMRUdre7+cFsZ3/m7LA51B56x7HL/ElBYdunqbwnxKiL+shJSxzZx1QlC84AL4Ov42/cG9ngaGikEew2DfNX7KwcT/rZ/NezOEB4ERH3SXIzRszjwMGQzzvLp+l90zvtC6Mv2Xn3yPIxUV79m2w5kquqhD1FLbOaXqQweyVVM7zcSi/Y7fTIzKRoL7cdwPSBr+Z4sXnOcnhDtZv7aUO109+lUCgoun/4aEQTHUnHTCP7y2wg=";
let _climbTable = null;
function climbTable() {
  if (_climbTable) return _climbTable;
  const bin = atob(CLIMB_Q);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bytes.length; i++) bytes[i] = bin.charCodeAt(i);
  const src = new Int16Array(bytes.buffer);
  const stride = CLIMB_BONES.length * 4 + 3;
  const q = [], hip = [];
  const kq = new THREE.Quaternion();
  for (let k = 0; k < CLIMB_KEYS; k++) {
    const row = [];
    let o = k * stride;
    for (let i = 0; i < CLIMB_BONES.length; i++) {
      row.push(new THREE.Quaternion(src[o] / 32767, src[o + 1] / 32767, src[o + 2] / 32767, src[o + 3] / 32767).normalize());
      o += 4;
    }
    hip.push(new THREE.Vector3(src[o] / 32767, src[o + 1] / 32767, src[o + 2] / 32767));
    q.push(row);
  }
  return (_climbTable = { q, hip });
}

// ---------------------------------------------------------------------------
// THE STROKE PROFILE — the clip's SPEED, which a pose cannot carry.
//
// The brief, verbatim: *"can u make the climbing actually dynamic like it matches the animation
// like if the character pulls the wall with his hands it pulls him up and stuff"*. The clip
// already knows the answer, because a climb's speed is not a free number: it is how fast the
// holds are being CONSUMED. A hand planted on the stone is being dragged down past the body at
// some rate, and that rate is exactly how fast the body is being hauled up past the hand. MEASURED
// per key frame on this rig — the depth-weighted descent of whichever contacts are planted and
// moving down, exactly as `bake.js` derives it, on the same table `CLIMB_Q` came from — the four
// limbs do NOT consume the wall at a steady rate. They take it in strokes, one per limb, four to
// the cycle, ~0.5 s apart: the planted contacts give up **0.25-1.07 u/s** in the rig's own units
// (0.571 mean — 0.34-1.45 world, the character being drawn at scale 1.351) depending on where in
// the rhythm you look. `CLIMB_PULL` is that rate per key frame, normalized to a mean
// of 1 — 1.00002 as the literal is rounded, which is as exact as three decimals go — the swing
// being 0.694 at the settling beat to 1.496 at the haul, a **2.16x** difference.
//
// `player.js` multiplies the climb's target speed by it, so the body goes up when the arms pull
// and coasts while the next hand reaches — the animation is the throttle, not a decoration
// playing alongside it. And because the clip's own cycle rate is that same target speed over
// `CLIMB_CYCLE`, the clip itself plays at a STEADY tempo while the body surges. That is not a side
// effect, it is what keeps the hands honest: a planted palm holds only while the body travels
// exactly what the clip's holds say it may, so a steady clock plus a stroke-shaped speed is the
// one combination that leaves the palm with nothing to slide against. (See the `CLIMB_PULL_DEPTH` block
// in `player.js`'s `P` for the arithmetic — feeding the clock the stroked speed instead gives back
// `v * (1 - pull)`, up to half the climb as slide at every haul.)
//
// It is BAKED, like `CLIMB_Q`, and never hand-edited: `bake.js` prints both literals from the same
// clip. Sample `k` belongs to key `k` of `CLIMB_Q` — phase `k / (CLIMB_KEYS - 1)`, i.e. `k / 60` —
// so the profile wraps the way the pose does, with key 0 following key 59.
const CLIMB_PULL = [
  0.885, 0.879, 0.887, 0.870, 0.828, 0.809,
  0.809, 0.860, 0.936, 1.016, 1.052, 1.090,
  1.060, 1.015, 0.953, 0.897, 0.850, 0.774,
  0.740, 0.762, 0.896, 1.016, 1.137, 1.212,
  1.237, 1.182, 1.127, 1.111, 1.064, 1.000,
  0.873, 0.830, 0.694, 0.725, 0.846, 0.991,
  1.061, 1.244, 1.297, 1.226, 1.154, 1.057,
  0.933, 0.818, 0.762, 0.737, 0.795, 0.923,
  1.150, 1.332, 1.459, 1.496, 1.460, 1.298,
  1.161, 1.065, 0.990, 0.916, 0.877, 0.877,
];
// The profile at any phase, wrapped and read between the two keys it sits between — linearly, so
// the SPEED has no corners on the keys (the pose is slerped between the same two and is smooth
// there for the same reason). Cheap enough to call every frame: two adds, a lerp.
function climbPull(p) {
  const N = CLIMB_KEYS - 1;
  const x = ((((p % 1) + 1) % 1)) * N;
  const a = Math.floor(x) % N, b = (a + 1) % N, t = x - Math.floor(x);
  return CLIMB_PULL[a] * (1 - t) + CLIMB_PULL[b] * t;
}

const _climbQ = new THREE.Quaternion();
const _climbV = new THREE.Vector3();
const _climbN = new THREE.Vector3();
// ...and the leg splay's own two (`CLIMB.SPLAY` — the thigh's own roll axis, and the roll itself).
const _climbZ = new THREE.Vector3(0, 0, 1);
const _climbSplay = new THREE.Quaternion();
// THE CLIMB ITSELF. `p` is the cycle's own phase (`player.js`'s `climbPhase`, 0..1) and `frame`
// the wall's basis in the rig's frame (`wallRunFrame`), whose `dFace` is how far the hips sit off
// the plate. Every contact is the clip's own and solved against the same plate the capsule gave
// it, so — exactly like the slide above — this eases with `raw` throughout and POSEX is not its
// business (see the note at the top of the wall branch run).
function poseWallClimb(bones, e, p, frame, rest, pull, idleT) {
  const T = climbTable();
  const N = CLIMB_KEYS - 1;
  // ...and the two stances that can sit on this clip. Either one takes the clip's own hip RIDE away
  // (see the note at the ride below): a stance is solved from a still origin or it is not solved at
  // all, and the pull's contacts have to hold through a body that is sinking and then flying, which
  // the clip's ±0.17 of heave per cycle would drag in and out of the stone. They can never both be on
  // the rig — a loading body is not a parked one (see `wantRest` in player.js).
  const stance = Math.max(rest || 0, pull ? pull.load || 0 : 0);
  const x = ((((p % 1) + 1) % 1)) * N;
  const a = Math.floor(x) % N, b = (a + 1) % N, t = x - Math.floor(x);
  for (let i = 0; i < CLIMB_BONES.length; i++) {
    const name = CLIMB_BONES[i];
    const bone = bones[name];
    if (!bone) continue;
    _climbQ.copy(T.q[a][i]).slerp(T.q[b][i], t);
    // ...and the THIGHS are ABDUCTED by `CLIMB.SPLAY`, so the two legs are held apart through the
    // whole cycle instead of stacking when the clip passes one past the other (see the note on the
    // constant). `legUpperL` is side -1, exactly as `poseLegAngles` takes it (the rig's `L` bones
    // are the character's own right — see `RK`).
    //
    // It is a PRE-multiply, and that is the whole point: the thigh's parent is the hips, so this
    // turns the leg about the PELVIS' fore-and-aft axis — a real abduction, in the body's own
    // frontal plane — rather than about whatever axis the clip happens to have rolled the thigh's
    // own frame onto (`poseLegAngles` can post-multiply because its thighs are already posed in the
    // rig's frame). The clip swings these legs around a good deal; an abduction measured off the
    // thigh instead of off the pelvis sends some beats sideways and some straight into the stone.
    if (CLIMB.SPLAY && (name === "legUpperL" || name === "legUpperR")) {
      const side = name === "legUpperL" ? -1 : 1;
      _climbSplay.setFromAxisAngle(_climbZ, side * CLIMB.SPLAY * (1 - rest));
      _climbQ.premultiply(_climbSplay);
    }
    bone.quaternion.slerp(_climbQ, e);
  }
  // THE BODY'S OWN RIDE, and THE PRESS. The clip's hips' translation is authored in the
  // character's own frame — x across the face, y up it, z into it — which is the frame this pose
  // is written in, so it rides the hips' position directly; the press then carries the hips from
  // wherever the capsule left them to the depth the clip's limbs were drawn for, measured along
  // the wall's own normal (see `CLIMB_PRESS`).
  //
  // ...AND THE RIDE IS A CLIP, SO THE REST STANCE HAS TO TAKE IT AWAY. The translation is not a
  // small offset: MEASURED over one cycle it swings **±0.17 on every axis** — 0.33 of bob up the
  // face, and ±0.15 both across it and INTO it — which is a body heaving itself up a wall stroke by
  // stroke and exactly right for the climb. Parks that body, and the same numbers are wrong three
  // times over: the hips heave while the pose around them is solved from them, so every contact
  // (all four are placed relative to the hips — see `poseClimbPark`) is dragged 0.15 in and out of
  // the stone with the clip's own breathing, and the parked body visibly bobs. So the ride fades out
  // with `rest` and the park stands on still hips — which is also what lets its contacts be SOLVED
  // once and hold: a solve placed off a moving origin is a solve that moves.
  _climbV.copy(T.hip[a]).lerp(T.hip[b], t).multiplyScalar(1 - stance);
  _climbV.y += HIP_Y;
  _climbN.set(frame.N[0], frame.N[1], frame.N[2]);
  _climbV.addScaledVector(_climbN, -(frame.dFace - CLIMB.PRESS));
  bones.hips.position.lerp(_climbV, e);
  // ...and the head's own set-back comes home: `poseRun` zeroes `head.position.z` every frame and
  // the old climb spent it on a lean off the plate, which the clip does not ask for.
  bones.head.position.z += (0 - bones.head.position.z) * e;
  // THE HOLD. The clip carries no fingers — nothing of Mixamo's hand chain is in the table — so the
  // digits closing on the stone are the one part of this pose still authored here.
  for (const f of bones.digits || []) {
    f.knuckle.rotation.z = -(f.thumb ? FIST.thumb : FIST.knuckle) * CLIMB.GRIP * f.side;
    if (f.mid) f.mid.rotation.z = -FIST.mid * CLIMB.GRIP * f.side;
  }
  poseSettleTorso(bones, e);
  // ...and the body PARKED on the stone takes the PARK over the top (see `poseClimbPark`).
  if (rest > 0.002) poseClimbPark(bones, rest, frame, idleT || 0);
  // ...and a body WOUND UP for a skip takes the pull (see `poseClimbPull`). It is applied after the
  // rest for the same reason every pose layer in this file is ordered: one writer per channel, last
  // one wins, and the two are mutually exclusive by construction anyway.
  if (pull && pull.load > 0.002) poseClimbPull(bones, pull.load, frame, pull);
}

// ---------------------------------------------------------------------------
// THE PARK — a body HELD on the stone (session 199 — the user's *"the wall climb idle animation
// looks bad delete it and make a new one from scratch also and take heavy inspiration from the
// wall climbing animation"*).
//
// WHAT STOOD HERE, AND WHY IT WENT. The hang used to wear a stance of its own, authored off a
// photograph of a rock climber shaking out: one arm reaching out along the face, the other
// HANGING at the character's side, one knee thrown high and out, the chest arched off the stone.
// It was the one pose on the wall that was NOT the climb — two of its four limbs were off the
// stone by design (the hanging arm and the free foot), its legs were solved close enough together
// that the rig drew them as one (`CLIMB.SPLAY` fades out with the stance and the stance did not
// put them back), and a body that has spent two seconds climbing and then hangs reads as having
// stopped being the animation. So the whole thing is DELETED — the table, the pose, and the
// hand-cache that chose which side of it to build (`readClimbHand`) — and the hang is a PARK.
//
// ...AND THE PARK IS READ OFF THE CLIP. Not "inspired by": MEASURED from it. `CLIMB_PARK.phase`
// is a key of `CLIMB_Q` — the frame the clip's own cycle settles on — and the four holds below are
// that frame's four contacts, read on the live rig in the wall's own basis exactly as `bake.js`
// reads them (the clip posed at that phase with the stance off, each contact's world position
// re-expressed from the hips along N/T/U). So a parked body is posed the way the clip poses it:
// two holds and two footholds, the same stagger (a hand high and the CONTRALATERAL foot high — the
// opposite hand/foot pairing a real climb alternates), and both feet on the stone rather than one.
//
// WHY A PHASE AT ALL, AND WHY THIS ONE. The clip is a stroke — four limbs alternating, four
// contacts consumed a cycle — so only some of its frames ARE a body on its holds: elsewhere a hand
// is in the air between grips, or a fist is buried in the plate. MEASURED over all 61 keys (the
// deepest drawn vertex of each of the four limbs against the plate, in rig units), phase **0.967**
// is the frame where all four are nearest it at once — **-0.027 / -0.041 / -0.009 / -0.056**, i.e.
// every limb on the stone in the same instant and none of them more than 7 cm (world) into it. Its
// other half has no such frame at all (its best key still puts a palm 0.24 rig into the stone),
// which is the second reason the park does not try to mirror: the clip is a real climb and its two
// halves are not each other's photographs.
//
// THE NUMBERS. `dn` is the stand-off from the hips along the wall's normal (negative = toward the
// stone), `along` is across the face in the RIG's own frame, and `up` is above the hips for a hand
// / the ankle's own depth for a foot. Each hold names the BONE it belongs to (`isL`), because the
// plans are per bone — there is no side flag left to get wrong — and `poseClimbPark` SOLVES them
// back onto the plate with the same `wallHand` / `wallFoot` the clip's own contacts are placed by,
// so a parked body touches the stone because it was solved onto it: the rule the pull, the slide
// and the wall run are all held to.
//
// ...and the IDLE is the same four incommensurate clocks the old stance moved on, because that
// part worked: the body breathes between four holds that do not move (every offset is subtracted
// from every plan), the weight walks from one foot to the other, the face reads up the stone and
// the grip re-seats on a slow pulse. What went with the old stance is the second, hanging arm.
const CLIMB_PARK = {
  phase: 0.967,     // the clip key the park is read off (see the note above)
  // ---- the body -------------------------------------------------------------------------------
  // Square, and pitched in over the holds by the clip's own trunk. MEASURED at the frame: the
  // clip's hips sit at -0.448 and its trunk at +0.432, a net -0.016 of lean into the stone — and
  // this pose has no reason to keep the two apart, so the hips are squared and the trunk carries
  // the whole of it. `hipsIn` presses the body in along the normal, and it moves all four contacts
  // with it (see the offset note in `poseClimbPark`), so it starts at zero: the plans are the
  // clip's own and the press only moves if the solved contacts ask for it.
  hipX: 0,
  lean: -0.016,
  hipsIn: 0,
  // ---- the four holds -------------------------------------------------------------------------
  // MEASURED at phase 0.967 on the live rig in the wall's basis, in rig units from the hips. The
  // RIG-R hand is the high one and the RIG-L hand braces out at shoulder height; the RIG-L foot is
  // up and folded under the hips and the RIG-R foot is extended down the face.
  //
  // ...AND EVERY `dn` IS THEN WALKED OUT until the limb's own deepest drawn vertex sits on the
  // plate, which is the number the pose is actually judged by (the same reading the old stance was
  // tuned to: a contact's deepest vertex 0.01-0.06 rig units into the stone). The clip's contacts
  // are its own SOLVE — its ankle drives a foot whose toes are turned into the wall, its wrist a
  // hand — while the park lays every sole FLAT on the plate and every palm flat in it (`wallFoot`'s
  // `flat`), and a flat foot reaches the stone from a shallower ankle than a pointed one does by
  // about 0.15 of the world. So the raw clip read (hands -0.217 / -0.155, feet -0.128 / -0.182,
  // MEASURED at -0.099 / -0.012 / -0.170 / -0.243 against the plate) is brought out by the amount
  // each limb needs and no more — MEASURED after the walk: **-0.04 / -0.03 / -0.03 / -0.04**, i.e.
  // all four limbs on the stone and none of them more than 5 cm (world) into it.
  handHi: { isL: false, dn: -0.188, along: 0.175, up: 0.948 },
  handLo: { isL: true, dn: -0.173, along: -0.393, up: 0.399 },
  // `kneeOut` turns each leg's bend plane (see `wallFoot`): the folded leg would otherwise bury its
  // knee in the plate and the extended one only needs a little. Both are the old stance's own
  // values for the same two shapes (1.571 for the high knee, 0.35 for the standing leg), brought in
  // to match this frame's shallower fold.
  footHi: { isL: true, dn: -0.018, along: -0.212, up: -0.143, kneeOut: 1.45 },
  footLo: { isL: false, dn: -0.009, along: 0.115, up: -0.715, kneeOut: 0.30 },
  // The knuckles: the clip carries no fingers, so the hold is this file's own — both hands closed
  // on the stone, at the pull's own grip (`CLIMB_COIL.hand.curl`).
  curl: 0.52,
  headX: -0.30,     // ...and the face up the stone, where the next hold is. The clip's own head is
                    // LEVEL at this frame (MEASURED -0.256 against a trunk of -0.016), so the
                    // look-up is the idle's own read of the stone rather than the clip's.
  // ---- THE IDLE (session 164 — the user's *"add a better climb idle animation"*) ---------------
  // A parked climber is not a statue. The two dials that move the BODY are offsets in the wall's
  // own basis and are subtracted from every hold exactly as the pull's coil is (see
  // `poseClimbPark`), so the breath and the weight-shift happen BETWEEN four contacts that do not
  // move; the rest live on bones that carry nothing — the head, the neck and the fingers. The
  // periods are deliberately incommensurate (4.3 / 7.1 / 9.7 / 5.9 s), because a loop the eye can
  // count is a loop that reads as one.
  idle: {
    breath: 4.3,      // s: the chest, and a hair of rise and fall in the body along the normal
    out: 0.012,       // rig units of that breath, out from the plate
    bob: 0.020,       // ...and up it (a climber's hips lift a little on the inhale)
    shift: 7.1,       // s: the weight walking from one foot to the other
    across: 0.022,    // rig units of it, sideways along the face
    look: 9.7,        // s: the head reading up the face and back down
    headX: 0.16,      // ...its pitch, radians at the peak (added to `headX`)
    headY: 0.22,      // ...and how far it turns to look around
    regrip: 5.9,      // s: the grip on the stone re-seating itself
    regripAmt: 0.26,  // ...and how much tighter it closes on that beat
  },
};

// ---------------------------------------------------------------------------
// THE PULL — the second stance a body on the stone wears (session 164 — the user's *"when i press m1
// i look like im pulling the wall and my but goes down and the longer i hole the more the wall climb
// skip distance covers"*). The MECHANIC is in `player.js` (the `CLIMB_LOAD_` / `CLIMB_SKIP_` blocks
// in `P`); this is the shape it is drawn with, and it is a SOLVE in exactly the rest stance's sense:
// a body hanging off its own holds, placed from the hips, every contact planned onto the stone.
//
// WHAT MAKES IT A PULL RATHER THAN A HANG is where the body is relative to what it is holding. The
// hips sit `sink` DOWN the face and `out` AWAY from it, which is the brief's butt-drop; both hands
// hold a chin-high pair of grips and BOTH feet are re-planted well up the stone, so the knees fold
// up instead of the legs straightening as the hips come down (that is what a real coil is — the feet
// move up before the hips go down, and it is the difference between a climber loading a move and a
// man dangling). Every number below is a WORLD position relative to the hips' own NOMINAL standing
// origin (`HIP_Y`, the origin the clip's own ride is written against): `dn` is toward the stone
// (negative), `along` is across the face (mirrored per side: the rig's `L` bones are the character's
// own right), and the third is up the face for a hand / the ankle's own drop for a foot.
//
// ...AND THE OFFSET IS SUBTRACTED FROM EVERY PLAN, which is the whole trick of the stance. `sink` and
// `out` move the hips; `poseClimbPull` takes the same two numbers back OUT of each contact's plan, so
// the body sinks between contacts that do not move — and the FIRE rides in the same subtraction
// (`st.rise`, the rig units the body has actually travelled since the release), so the hands stay on
// their holds while the body hauls itself up PAST them. That is the money shot of the whole move and
// it is only possible because `wallHand`/`wallFoot` plan in the HIPS' frame: the stance owns that
// frame, and the clip's ride is faded out under it (see `poseWallClimb`).
const CLIMB_COIL = {
  // ---- the body -------------------------------------------------------------------------------
  // EXAGGERATED (session 165b, the user's *"can u exaggerate the animation of the hold"*): the coil
  // is authored deep on purpose — the rig's hips go down `sink` 0.44, swing `out` 0.26 off the plate,
  // and the trunk leans `lean` in over the holds with the face pressed up it. Everything the charge
  // adds on top of it lives in `wind` (see below), so the whole stance DEEPENS through the hold.
  sink: 0.44,       // rig units the hips drop at a full load (matches `P.CLIMB_LOAD_SINK`)
  out: 0.26,        // ...and how far they swing out from the plate with it
  hipX: 0.10,       // the hips' own pitch off the clip's
  lean: 0.22,       // the trunk: positive leans the head end IN toward the stone (a coil, not a hang)
  headX: -0.40,     // ...and the face is up it, on the next hold (negative = pitched up)
  // ---- both hands: a pair at head height, elbows dropped ----------------------------------------
  // Read off the live rig and handed back as a plan, exactly as the rest stance's reaching arm is
  // (see the note there): a plan ON the arm rather than past it, so the palms are SOLVED onto their
  // grips and hold them while the coil winds and unwinds underneath (the load moves; the holds do
  // not). With the deeper coil above, the arms are spent nearly straight ONTO the holds — the strain
  // is the point of the exaggeration — while the read of the pull still comes from the elbows'
  // own pole (`polePrimary` below), which is not a consequence of the arm's length at all.
  hand: { dn: -0.36, along: 0.24, up: 0.34, curl: 0.52 },
  // The `wallHand` table it is solved with — `WALL_HAND` with two of its own dials changed, and the
  // second of them is the whole read of the arms.
  //
  // `polePrimary` takes the elbow's azimuth straight from the POLE instead of from `wallHand`'s
  // clearance arithmetic, and it is not a preference here, it is a correction: a face-on reach runs
  // INTO the face, so the elbow's circle lies nearly in the plate's own plane and the clamp pins it at
  // a fixed ~126° for every limb — the elbows come out level with the shoulders whatever the plan
  // asks (MEASURED: sweeping `poleT` -0.6 -> 0.6 and `poleU` -0.3 -> -0.9 moved the elbow not at all).
  // With it on, `poleT`/`poleU` ARE the elbow's own direction, and `poleSide` measures that direction
  // outward from the body's midline so the two elbows mirror. `elbowLevel` is inert while
  // `polePrimary` is on and is left here only because the fallback path still reads it.
  handCfg: { ...WALL_HAND, elbowLevel: 0.62, polePrimary: true, poleSide: true, poleN: 0, poleT: -0.30, poleU: -0.90 },
  // ---- both feet: tucked HIGH, so the knees come up as the hips go down ---------------------
  // `drop` is measured off the hips' NOMINAL origin like everything else here, so it is the ankle's
  // own height on the stone and NOT its height under the sunk hips. It is authored against `sink`:
  // the hips come down 0.44 and the ankles come up from the standing 0.82 to 0.50, which is the coil
  // — the legs fold by 0.46 instead of straightening, and they fold by exactly the amount the body
  // drops. (MEASURED on the live rig at a full load: the ankles sit 0.27 below the hips and the knees
  // **0.21 ABOVE** them at the older, shallower coil — i.e. the knees are up at hip height and thrown
  // `kneeOut` — which is what "my butt goes down" has to look like from the front, because a body
  // whose hips drop and whose feet do not is a body whose legs are getting longer.)
  foot: { dn: -0.19, along: 0.18, drop: -0.50, kneeOut: 1.30 },
  // ---- THE REACH, walked in over `st.rel` as the planted holds run out -------------------------
  // The limbs LET GO and throw: the hands sweep up the face (on their way to the next pair, which is
  // the clip's business again the moment this overlay is off) and the legs trail behind a body that
  // has just left its feet. Both are PLANS, solved by the same `wallHand`/`wallFoot` the holds are —
  // and both are authored PAST the limb's own reach on purpose, so the solve clamps them and the limb
  // comes out STRAIGHT: a leap's arm and a leap's trailing leg are straight, and a bent one reads as a
  // pose. They are solved rather than free-posed because a limb this overlay stops solving is handed
  // back to the clip's own writer mid-flight, and that writer WANDERS (MEASURED: 0.46 rad a frame,
  // throwing the palm 0.8 world off the plate, then 2.5 rad back in one frame — see `poseClimbPull`).
  //
  // `sweep` is the one dial that is NOT walked in by `rel`: it rides the fire's own clock (`st.fire`,
  // 0 -> 1 across the burst), so the hands keep travelling UP the face and the legs keep trailing for
  // as long as the body is flying. The skip is half a second long now (`CLIMB_SKIP_TIME`), and a
  // single frozen reach held for half a second reads as a freeze rather than as a leap; on the sweep
  // the flight is a reach for the next hold the whole way.
  reach: { dn: -0.30, along: 0.34, up: 1.10, curl: 0.26, sweep: 0.34 },
  reachFoot: { dn: -0.30, along: 0.24, drop: -0.62, kneeOut: 0.30, sweep: 0.26 },
  fireLean: -0.30,  // the arch: the chest swings back off the plate as the body flies
  fireHead: -0.44,  // ...and the face stays on the stone it is heading up
  // ---- the WIND-UP, as the charge fills (`st.charge`) ------------------------------------------
  // What the charge looks like on a body that is not allowed to move: the elbows draw back off the
  // plate, down and a little wider, the trunk leans further in over the holds, the grip closes, the
  // face presses up at the hold, and a slow strain-tremble runs through the head and the fingers.
  // None of it touches a contact — the palm's plan is the plan — which is exactly why the tells are
  // on the arms' own free axis (the elbow's pole), the TRUNK, the digits and the head.
  //
  // EXAGGERATED (session 165b): the elbow's walk is nearly doubled, the trunk leans another 0.12 on
  // top of `lean`, the grip closes harder, and the tremble is bigger AND SLOWER (9 Hz against 11),
  // which is what makes it read as strain rather than as noise.
  wind: { elbowN: 0.26, elbowT: -0.26, elbowU: 0.58, lean: 0.12, head: 0.14, grip: 0.42, tremble: 0.045, trembleHz: 9 },
};
// ---------------------------------------------------------------------------
// THE PARK'S OWN SCRATCH, and the `wallHand` table its holds are solved with. The elbow is taken
// straight from the POLE for the reason the pull's is (see `CLIMB_COIL.handCfg`): a hold ABOVE the
// shoulder is a reach INTO the face, where the circle the elbow is free on lies nearly in the
// plate's own plane, so `wallHand`'s clearance arithmetic collapses and pins every elbow to the
// same arc boundary whatever the plan asks. With `polePrimary` on, `poleT`/`poleU` ARE the elbow's
// own direction — down and out, which is where a climber hanging off two holds keeps them.
const _parkN = new THREE.Vector3();
const _parkT = new THREE.Vector3();
const _parkU = new THREE.Vector3();
const _parkCfg = { ...WALL_HAND, elbowLevel: 0.62, polePrimary: true, poleSide: true, poleN: 0, poleT: -0.34, poleU: -0.86 };
function poseClimbPark(bones, e, frame, t = 0) {
  const K = CLIMB_PARK;
  const I = K.idle;
  // THE IDLE (see `CLIMB_PARK.idle`). Four incommensurate periods: one breath and one weight-shift
  // on the BODY — taken back out of every hold below, so the parked body moves between four holds
  // that do not — and the look and the re-grip on the head and the fingers.
  const breath = Math.sin((t / I.breath) * Math.PI * 2);
  const shift = Math.sin((t / I.shift) * Math.PI * 2);
  const look = Math.sin((t / I.look) * Math.PI * 2);
  const look2 = Math.sin((t / I.look) * Math.PI * 2 + 1.15);
  // ...and the re-grip, which is a SQUEEZE and not a sway: a short pulse on a long period, so the
  // hands read as re-seating their fingers rather than as trembling.
  const pulse = Math.max(0, Math.sin((t / I.regrip) * Math.PI * 2));
  const regrip = pulse * pulse * pulse;
  _parkN.set(frame.N[0], frame.N[1], frame.N[2]);
  _parkT.set(frame.T[0], frame.T[1], frame.T[2]);
  _parkU.set(frame.U[0], frame.U[1], frame.U[2]);
  // The pose's own offsets. `offN`/`offU` are the breath (out from the plate and up it) and `offT`
  // the weight-shift; every hold below is planned against the hips MINUS them, and they are scaled
  // by `e` with the hips, so the stance lands on the same world points at any blend weight.
  const offN = I.out * breath * e;
  const offT = I.across * shift * e;
  const offU = I.bob * breath * e;
  // THE BODY, FIRST — AND THE TRUNK IS PART OF THE BODY. Everything below is solved from the hips
  // (`wallFoot`: "the thigh's parent is the HIPS") or from the torso (`wallHand`: the arm's own
  // parent), so BOTH have to be where they are going to stay before any of it is planned. The
  // trunk's squaring in particular has to happen HERE and not at the end of the pose: `wallHand`
  // takes the shoulder — and the whole plan's frame — through `bones.torso.quaternion`, so a trunk
  // squared after the solve is a solve in the wrong frame (MEASURED on the old stance, one
  // unchanged reach plan returning upper-arm targets 0.6 rad apart from the two orders).
  bones.hips.position.addScaledVector(_parkN, -K.hipsIn * e + offN);
  bones.hips.position.addScaledVector(_parkT, offT);
  bones.hips.position.addScaledVector(_parkU, offU);
  bones.hips.rotation.x += (K.hipX - bones.hips.rotation.x) * e;
  bones.hips.rotation.y += (0 - bones.hips.rotation.y) * e;
  bones.hips.rotation.z += (0 - bones.hips.rotation.z) * e;
  // The trunk itself, ahead of every limb that hangs off it — the one lean and the two squared
  // axes, all three aimed at constants, so the frame the shoulders are solved in does not move.
  bones.torso.rotation.x += (K.lean - bones.torso.rotation.x) * e;
  bones.torso.rotation.y += (0 - bones.torso.rotation.y) * e;
  bones.torso.rotation.z += (0 - bones.torso.rotation.z) * e;
  // THE TWO HOLDS. Solved palm-on-the-plate, with the WRIST squared to the forearm the solve just
  // placed: `wallHand` lies the palm flat as a ROLL OF THE FOREARM, which is only the correct roll
  // if the wrist between them carries nothing of its own — and the clip carries one, so left on it
  // a parked body's palm rides its own slow phase.
  for (const hold of [K.handHi, K.handLo]) {
    wallHand(bones, hold.isL, e, frame, hold.dn - offN, hold.along - offT, hold.up - offU, K.curl, _parkCfg);
    const hand = hold.isL ? bones.handL : bones.handR;
    if (hand) {
      hand.rotation.x += (0 - hand.rotation.x) * e;
      hand.rotation.y += (0 - hand.rotation.y) * e;
      hand.rotation.z += (0 - hand.rotation.z) * e;
    }
  }
  // ...and BOTH SHINS come off the clip's twist BEFORE the feet are solved off them. A knee is a
  // hinge and `wallFoot` writes its own hinge angle, so any y or z left on the shin is the clip's —
  // and it has to be squared HERE rather than after the solve, because `wallFoot` lays the SOLE flat
  // against its parents' ACTUAL quaternions: a shin squared afterwards hands the foot an
  // orientation built for a shin that no longer exists (MEASURED on the old stance, the soles
  // breathing 0.03-0.07 world through a cycle with everything else pinned — flat to the millimetre
  // with this order).
  for (const shin of [bones.legLowerL, bones.legLowerR]) {
    if (!shin) continue;
    shin.rotation.y += (0 - shin.rotation.y) * e;
    shin.rotation.z += (0 - shin.rotation.z) * e;
  }
  // THE TWO FOOTHOLDS. `up` is negative here (an ankle is below the hips) and `wallFoot` wants the
  // three-distance from the hip, so the plan's own depth comes back out of the same three numbers
  // the offsets were taken from — the drop is then exactly the hold's own `up`.
  for (const hold of [K.footHi, K.footLo]) {
    const dn = hold.dn - offN, along = hold.along - offT, up = hold.up - offU;
    wallFoot(bones, hold.isL, e, frame, dn, along, Math.hypot(dn, along, up), 1, hold.kneeOut);
  }
  // THE GRIP: both hands closed hard on the stone, and re-seating on the idle's own beat (the clip
  // carries no fingers — nothing of Mixamo's hand chain is in the table).
  for (const f of bones.digits || []) {
    const tight = CLIMB.GRIP * (1 + I.regripAmt * regrip);
    f.knuckle.rotation.z += (-(f.thumb ? FIST.thumb : FIST.knuckle) * tight * f.side - f.knuckle.rotation.z) * e;
    if (f.mid) f.mid.rotation.z += (-FIST.mid * tight * f.side - f.mid.rotation.z) * e;
  }
  // ...and the HEAD reads up the face, squared with the neck for the same reason the trunk is: the
  // clip drives the neck (it is one of `CLIMB_BONES`) and nothing above or below this pose writes
  // it, so left on the clip a parked body's head nods on the clip's own slow clock.
  bones.head.rotation.x += (K.headX + I.headX * look - bones.head.rotation.x) * e;
  bones.head.rotation.y += (I.headY * look2 - bones.head.rotation.y) * e;
  bones.head.rotation.z += (0 - bones.head.rotation.z) * e;
  if (bones.neck) {
    bones.neck.rotation.x += (0 - bones.neck.rotation.x) * e;
    bones.neck.rotation.y += (0 - bones.neck.rotation.y) * e;
    bones.neck.rotation.z += (0 - bones.neck.rotation.z) * e;
  }
}

// One plan's worth of scratch for the coil (see `CLIMB_COIL` and `poseClimbPull`), plus the
// `wallHand` table it solves with — a copy of `WALL_HAND` whose elbow call the wind-up moves, mutated
// in place once a frame so the solve below allocates nothing.
const _pullN = new THREE.Vector3();
const _pullT = new THREE.Vector3();
const _pullU = new THREE.Vector3();
const _pullHand = new THREE.Vector3();
const _pullHip = new THREE.Vector3();
const _pullV = new THREE.Vector3();
const _pullCfg = { ...WALL_HAND };
function poseClimbPull(bones, e, frame, st) {
  const Q = CLIMB_COIL;
  const charge = Math.max(0, Math.min(1, st.charge || 0));
  const rel = Math.max(0, Math.min(1, st.rel || 0));   // 0 = on its holds, 1 = off them
  const hold = 1 - rel;                                // ...and the share still planted
  // ...and the FIRE's own clock (0 -> 1 across the burst, NEGATIVE when nothing is firing), which is
  // what the reach's `sweep` rides — see the note at the table.
  const fire = Math.max(0, Math.min(1, st.fire || 0));
  const t = st.t || 0;
  _pullN.set(frame.N[0], frame.N[1], frame.N[2]);
  _pullT.set(frame.T[0], frame.T[1], frame.T[2]);
  _pullU.set(frame.U[0], frame.U[1], frame.U[2]);
  // THE OFFSET — the hips' position in the wall's own basis, relative to the frame every plan in
  // `CLIMB_COIL` is authored in. The two halves are scaled by `e` because the HIPS and the PLANS
  // below are both written with it, so the contacts land on the same world points at any blend weight
  // and the stance can cross-fade in under a body that is still on the clip's ride. `rise` is the one
  // term that is not: it is the RIG's own travel, and the rig is where it is whatever this overlay
  // weighs (see the note at the table).
  //
  // ...AND THE DEPTH IS THE CHARGE, not the blend weight. `st.sink` is `climbSink` (see the
  // `CLIMB_LOAD_SINK_T` block in player.js), which follows the charge the hold has wound up — so a
  // tap only twitches the body and a long hold coils it all the way down, while `e` still owns the
  // stance's cross-fade on and off. The two are MULTIPLIED rather than handed over, because they are
  // on different clocks: the blend out at the release is `CLIMB_FIRE_OUT` (0.28 s) and the coil
  // unwinds over 0.34, and a body whose stance has gone cannot still be 0.30 down — that is a snap.
  const dep = Math.max(0, Math.min(1, st.sink === undefined ? 1 : st.sink));
  const coilV = Q.sink * e * dep;
  const offN = Q.out * e * dep;
  const offU = Math.max(0, st.rise || 0) - coilV;

  // THE BODY, FIRST. Everything below is solved from the hips (the legs) or through the torso (the
  // arms), so both have to be where they are going to stay before any of it is planned — the rest
  // stance's own note, one stance over.
  bones.hips.position.addScaledVector(_pullN, offN);
  bones.hips.position.addScaledVector(_pullU, -coilV);
  bones.hips.rotation.x += (Q.hipX - bones.hips.rotation.x) * e;
  bones.hips.rotation.y += (0 - bones.hips.rotation.y) * e;
  bones.hips.rotation.z += (0 - bones.hips.rotation.z) * e;
  // ...and the trunk: leaned in over the holds for the coil (and leaning FURTHER as the charge fills,
  // see `wind.lean`), and swung back off the plate for the flight, one dial through `rel`.
  const trunkX = (Q.lean + Q.wind.lean * charge) * hold + Q.fireLean * rel;
  bones.torso.rotation.x += (trunkX - bones.torso.rotation.x) * e;
  bones.torso.rotation.y += (0 - bones.torso.rotation.y) * e;
  bones.torso.rotation.z += (0 - bones.torso.rotation.z) * e;

  // The wind-up's tremble — the one thing on this body that is allowed to move without moving a
  // contact, so it lives on the HEAD (and, below, on the fingers and the elbows' own free axis).
  const trem = Math.sin(t * Q.wind.trembleHz * Math.PI * 2) * Q.wind.tremble * charge;

  // THE HANDS. Both of them, on their chin-high pair, for as long as the holds last — and the elbow
  // call is where the CHARGE is spent: the palm's plan is the plan (the grip does not move, whatever
  // the load does), while `poleT`/`poleU` walk the elbows back and down, which is what a coil looks
  // like on arms that cannot move their hands.
  //
  // ...AND THE PLAN'S AIM TRAVELS WITH THE BLEND. A hold is a point in the world and the solve is
  // exact, but the limb being solved onto it was NOT solved onto it a frame ago, and a cross-fade
  // between two configurations travels between their two HANDS along an arc — and an arc between two
  // points on a wall goes through the wall. MEASURED from the rest stance into a load, with the aim
  // pinned to the hold for the whole blend: the palm walked **0.038 -> 0.297 -> 0.004** off the plate
  // — off the stone and back in a fifth of a second — and from a fresh grab the same blend drove it
  // to -0.28, i.e. through it. So the aim is dragged along with the solve's own weight: at zero it IS
  // where the palm already is (there is nothing to cross-fade to, and the solve's own configuration
  // is the one it is replacing), and it walks to the hold over the same `e`, which keeps the two
  // configurations next to each other the whole way and takes the arc out of it.
  //
  // ...AND THE AIM ITSELF HAS TWO ENDS. The HOLD is the same plan it has always been — a point in the
  // WORLD (`rise` is taken back out of it, see `offU` above), which is what leaves the hands planted
  // while the body hauls itself past them. The REACH is where the limbs are thrown once the holds run
  // out: a plan in the BODY's own frame, nothing compensated, authored PAST the arm's own length on
  // purpose — the solve clamps it, so the limb comes out straight up the face, which is what a leap's
  // arm does — and `rel` walks the aim from one to the other. Both ends are therefore SOLVED, and that
  // is the point: a limb this overlay leaves to the clip's own writer while its weight comes off it
  // WANDERS (MEASURED: 0.46 rad a frame for seven frames, which threw the palm 0.8 world off the plate
  // and then snapped it back 2.5 rad in ONE frame when the hold solve re-took it). Solved, both ends
  // are pinned and everything between them is a short arc.
  const handE = e;
  if (handE > 0.002) {
    _pullCfg.elbowLevel = Q.handCfg.elbowLevel;
    _pullCfg.elbowGap = Q.handCfg.elbowGap;
    // ...AND THE POLE IS THE ELBOW'S OWN DIRECTION HERE, not a tie-break. A face-on climb's reach runs
    // INTO the face, so the elbow's circle lies nearly in the plate's own plane, `wallHand`'s
    // clearance arithmetic collapses and its clamp pins the azimuth a fixed ~126° round from the
    // deepest point for every limb — the elbows come out level with the shoulders and swing with the
    // cycle (the "surrendering" read), and neither the pole nor `elbowLevel` can move them a
    // millimetre. MEASURED: with `polePrimary` off, sweeping `poleT` -0.6 -> 0.6 and `poleU` -0.3 ->
    // -0.9 at a full coil moved the elbow **not at all** (0.915 above the hips in all ten cases);
    // with it on they are the elbow's direction, which is where the difference between a hang and a
    // HAUL lives (see `wallHand`'s own note on `polePrimary`).
    _pullCfg.polePrimary = Q.handCfg.polePrimary;
    _pullCfg.poleSide = Q.handCfg.poleSide;
    _pullCfg.poleN = Q.handCfg.poleN + Q.wind.elbowN * charge;
    _pullCfg.poleT = Q.handCfg.poleT + Q.wind.elbowT * charge;
    _pullCfg.poleU = Q.handCfg.poleU - Q.wind.elbowU * charge;
    // The holds, and the palms as they already stand — the aim's two ends (see above). The stand-off
    // is taken back out of the world in the rig's own units, which is what every plan in this file is
    // written in, and `st.scale` is the mesh's own scale, handed in by player.js because a pose has no
    // idea how big the body it is posing is drawn.
    const rigS = st.scale || 1;
    bones.hips.getWorldPosition(_pullHip);
    for (const isL of [true, false]) {
      const hd = isL ? bones.handL : bones.handR;
      const pd = (Q.hand.dn - offN) * hold + Q.reach.dn * rel;
      const pt = (isL ? -1 : 1) * (Q.hand.along * hold + Q.reach.along * rel);
      const pu = (Q.hand.up - offU) * hold + (Q.reach.up + Q.reach.sweep * fire) * rel;
      if (hd) hd.getWorldPosition(_pullHand);
      _pullV.subVectors(_pullHand, _pullHip).divideScalar(rigS);
      const cd = _pullV.dot(_pullN), ct = _pullV.dot(_pullT), cu = _pullV.dot(_pullU);
      // ...AND THE SOLVE ITSELF IS AT FULL WEIGHT. A cross-fade would have to travel between two
      // CONFIGURATIONS, and the hand's own position is not a linear function of the arm's rotations —
      // MEASURED, a 19 % blend from the rest stance moved the palm 0.12 world units, so aiming the plan
      // at the palm is not enough on its own. Solved at full weight onto an aim that is AT the palm at
      // weight zero, the contact is exact at both ends of the blend and rides the straight line between
      // them the whole way. What that costs is the CONFIGURATION at the blend's first frame (the elbow
      // and the wrist go to where the solve wants them in one frame instead of easing), which is a
      // half-degree-scale change on an arm this nearly straight and is invisible next to a hand leaving
      // its hold.
      wallHand(
        bones, isL, 1, frame,
        cd + (pd - cd) * handE,
        ct + (pt - ct) * handE,
        cu + (pu - cu) * handE,
        Q.hand.curl * hold + Q.reach.curl * rel + Q.wind.grip * charge,
        _pullCfg
      );
      // ...and the wrist squared with the forearm the solve just placed, on the same rule the rest
      // stance's reaching hand is held to: a solve assumes a wrist that carries nothing of its own.
      if (hd) {
        hd.rotation.x += (0 - hd.rotation.x) * handE;
        hd.rotation.y += (0 - hd.rotation.y) * handE;
        hd.rotation.z += (0 - hd.rotation.z) * handE;
      }
    }
  }
  // THE SHINS, squared BEFORE the feet are solved off them: a knee is a plain hinge and `wallFoot`
  // writes its hinge angle, so any twist left on the shin is the clip's and belongs to no one — and it
  // has to come off here rather than after the solve, because `wallFoot` lays the sole flat against
  // its parents' ACTUAL quaternions (see the rest stance's note, where that was measured).
  for (const shin of [bones.legLowerL, bones.legLowerR]) {
    if (!shin) continue;
    shin.rotation.y += (0 - shin.rotation.y) * e;
    shin.rotation.z += (0 - shin.rotation.z) * e;
  }
  // ...and THE FEET, planted as high up the stone as the coil wants them — and solved the same way
  // the hands are, with the aim dragged along with the blend (see the note there; a foot arcs through
  // the stone exactly as readily as a palm does). `drop` is the ankle's own depth below the hips, so
  // the plan's distance is the three of them together. The aim's FAR end is the trail (`rel`): the
  // ankles let go with the hands and fall behind a body that has left its feet, so the legs read as
  // being left BEHIND rather than being posed.
  const footE = e;
  if (footE > 0.002) {
    bones.hips.getWorldPosition(_pullHip);
    for (const isL of [true, false]) {
      const ft = isL ? bones.footL : bones.footR;
      const dn = (Q.foot.dn - offN) * hold + Q.reachFoot.dn * rel;
      const along = (isL ? -1 : 1) * (Q.foot.along * hold + Q.reachFoot.along * rel);
      const drop = (Q.foot.drop - offU) * hold + (Q.reachFoot.drop - Q.reachFoot.sweep * fire) * rel;
      if (ft) ft.getWorldPosition(_pullHand);
      _pullV.subVectors(_pullHand, _pullHip).divideScalar(st.scale || 1);
      const cd = _pullV.dot(_pullN), ct = _pullV.dot(_pullT), cu = _pullV.dot(_pullU);
      const ad = cd + (dn - cd) * footE;
      const at = ct + (along - ct) * footE;
      const au = cu + (drop - cu) * footE;
      // A plan whose ankle ends up level with or above the hips has no solve left in it — the leg
      // cannot reach it from there. The aim's own end is the ankle's real position at weight 0, so a
      // degenerate plan can only be reached at full weight, and the guard only ever catches the frame a
      // release throws it off (`drop` is 0.20 below the hips at a full load).
      if (au > -0.02 && footE > 0.5) continue;
      wallFoot(bones, isL, footE, frame, ad, at, Math.hypot(ad, at, au), 1, Q.foot.kneeOut * hold + Q.reachFoot.kneeOut * rel);
    }
  }
  // THE GRIP. Both hands closed hard on the stone, and closing further as the charge fills — the clip
  // carries no fingers, so this is the pull's own (the rest stance's is one hand); the tremble rides
  // the fingers with the head.
  for (const f of bones.digits || []) {
    const tight = Math.max(0, Math.min(1, CLIMB.GRIP * (1 + 0.35 * charge) + trem));
    f.knuckle.rotation.z += (-(f.thumb ? FIST.thumb : FIST.knuckle) * tight * f.side - f.knuckle.rotation.z) * e;
    if (f.mid) f.mid.rotation.z += (-FIST.mid * tight * f.side - f.mid.rotation.z) * e;
  }
  // ...and the HEAD: up the face on the hold it is going for, pressing up harder as the charge
  // fills, with the wind-up's tremble on it.
  const headX = Q.headX * hold + Q.fireHead * rel + Q.wind.head * charge + trem;
  bones.head.rotation.x += (headX - bones.head.rotation.x) * e;
  bones.head.rotation.y += (0 - bones.head.rotation.y) * e;
  bones.head.rotation.z += (0 - bones.head.rotation.z) * e;
  if (bones.neck) {
    bones.neck.rotation.x += (0 - bones.neck.rotation.x) * e;
    bones.neck.rotation.y += (0 - bones.neck.rotation.y) * e;
    bones.neck.rotation.z += (0 - bones.neck.rotation.z) * e;
  }
}
// ---------------------------------------------------------------------------
// THE LEAP (session 199 — the user's *"the wall climb jump animation the leap looks meh fix it up
// a little"*; before that it was the skyfall's landing brace, session 181, and before THAT the
// pad's soar with a climber's arms, session 177).
//
// WHY THE BRACE STOPPED BEING THE RIGHT ANSWER. Session 181 read `FALL_BRACE` for the whole of the
// hop, which is the shape a long fall is blended INTO as the deck comes up: knees soft, feet down
// and forward, arms out and a little back, trunk nearly upright. It is a BRACE — a body getting
// ready to be landed on — and that is exactly what it reads as at the top of a wall: the man is
// standing in the air with his arms out. A leap up a wall is the opposite shape. He is not
// arriving anywhere; he is going UP, off holds that are behind him, towards holds he cannot see
// yet — one arm thrown overhead at them, one knee driven up under the chest, the other leg left
// trailing down the stone he just left, and the chest open with the face up the face.
//
// SO IT IS ITS OWN TABLE AGAIN, and the brace's two useful columns are kept: the hips stay in the
// CLIMB's convention (`HIP_Y + x`, and not the fall's) because this pose is worn ON TOP of the
// climb clip (see `poseWallClimb`), whose hips sit at `HIP_Y` — a brace-absolute hip would drop the
// body most of a metre in the single frame the flight starts; and the grip stays closed, because
// the hands leave the stone holding it.
//
// THE PAIRING is the park's, deliberately: the RIG-R arm leads overhead and the RIG-L knee drives
// up, i.e. the same opposite hand/foot pair `CLIMB_PARK` holds the body on. A leap whose pairing
// disagreed with the stance either side of it would read as the body changing its mind mid-air.
const CLIMB_FLY = {
  hipY: HIP_Y + 0.10,
  // [upX, upZ, elbow] — `upX` negative swings the arm forward and up (see `poseArmAngles`), and
  // these are read through `POSEX` (0.8), so the authored number is 1.25x the arm's own angle: the
  // lead's -3.35 is **-2.68 rad, i.e. 26 degrees short of straight up and tipped a little behind
  // the ear** — a hand thrown AT a hold, with the forearm still open. (Session 177 called -2.15
  // "overhead"; through `POSEX` that is -1.72 rad, eight degrees above HORIZONTAL, which is a
  // reach forward, not a reach up.) The trail is -2.55 = -2.04 rad, up and out to the side.
  armLead: [-3.35, 0.18, -0.30],
  armTrail: [-2.55, 0.85, -0.55],
  // [thigh, knee, sole, splay] — thigh negative is forward/up (see `poseLegAngles` and the pad's
  // `LAUNCH`, whose falling column is the negative one). The leading knee is folded hard (1.35
  // against a knee that is straight at 0) and thrown `splay` 0.10 off the midline; the trailing
  // leg is left long and pointed, which is what a wall leaves behind.
  legLead: [-1.25, 1.35, -0.05, 0.10],
  legTrail: [0.30, 0.12, -0.50, 0.14],
  // THE PELVIS IS SQUARED, and it has to be said out loud: the climb clip underneath drives
  // `hips.rotation.x` and this overlay is worn on top of it, so a hip pitch left on the clip is a
  // pelvis tilted by whatever phase the body happened to leave the stone at — MEASURED on the live
  // rig at one phase, the clip carries -0.62 of hip pitch, which tips the whole figure 35 degrees
  // and makes every leg angle below a lie. Squared, the thighs read as authored.
  hipX: 0,
  // The chest opens and the trunk tips back a little out of the climb's own lean-in (`CLIMB_PARK`
  // holds 0.432 of trunk pitch while it is on the stone), so the body reads as having left the
  // wall rather than as still climbing it.
  torso: [-0.18, 0, 0],
  // ...and the face up the stone, where the next hold is (the brace's own head looked DOWN at a
  // deck that is not there — the user's *"make the player look up"*, kept).
  head: -0.50,
  // The grip is closed but not clenched: these are hands that have just left a hold.
  grip: 0.45,
};
function poseClimbFly(bones, u) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const B = CLIMB_FLY;
  poseHipY(bones, B.hipY, e);
  poseRot(bones, "hips", "x", B.hipX, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  poseLegAngles(bones, -1, B.legLead[0], B.legLead[1], B.legLead[2], B.legLead[3], e);
  poseLegAngles(bones, 1, B.legTrail[0], B.legTrail[1], B.legTrail[2], B.legTrail[3], e);
  poseRot(bones, "torso", "x", B.torso[0], e);
  poseRot(bones, "torso", "y", B.torso[1], e);
  poseRot(bones, "torso", "z", B.torso[2], e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", B.head, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  poseArmAngles(bones, 1, B.armLead[0], B.armLead[1], B.armLead[2], e);
  poseArmAngles(bones, -1, B.armTrail[0], B.armTrail[1], B.armTrail[2], e);
  poseGrip(bones, B.grip, e);
}
function poseWall(bones, u, mode, phase, sideSign, frame, rest, pull, idleT) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  if (mode === "run") {
    // The run is the one wall mode that knows which side the wall is on (it is beside you, not
    // in front), so the trunk rolls with it: the wall side goes *under* the player, matching the
    // bank the player itself applies. `sideSign` is the wall's side on the player, so a wall on
    // the player's right (`< 0`) is the arrangement the sign below is authored for.
    const s = sideSign > 0 ? -1 : 1;
    // The run cycle owns this pose: the legs, the arm pump and the whole upper body are exactly
    // what `poseRun` just left, and all this branch adds is the bank's own trunk roll plus the
    // hand on the wall. Overriding the run with constants is what made an earlier wall run read
    // as a slide with the wall going past — a wall run should look like running, because it is.
    bones.torso.rotation.x += 0.06 * e;
    bones.torso.rotation.z += -0.20 * s * e;
    // The hand on the wall side: off the run's pump (the solve takes the arm completely) and flat
    // onto the face, where it is PLANTED — one fixed plan, held for as long as the run lasts. It
    // used to ride the run's own arm swing (the plan's `along` mapped the stride to a drag down the
    // face), and session 196 retired that: the user's *"make the arm thats next to the wall still
    // when im wall running"*. What is left moving the arm is the contact itself — `dn` still spends
    // `dFace` (below), so the body's own press and bob are absorbed by the elbow and the palm never
    // leaves the plate. The free arm is left exactly as the run left it.
    if (frame) {
      const wallIsL = sideSign < 0;
      wallHand(
        bones,
        wallIsL,
        e,
        frame,
        // The hand's axis, measured off the hips along N: the palm's plate is half a palm out
        // from that axis and `press` into the face, and the hips themselves are `dFace` out.
        WALL_HAND.half - WALL_HAND.press - frame.dFace,
        WALL_HAND.fwd,
        WALL_HAND.up,
        WALL_HAND.curl
      );
    }
    return;
  }
  const p = ((phase % 1) + 1) % 1;
  const sway = Math.sin(p * Math.PI * 2);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  if (mode === "slide") {
    // Solved contacts, so this branch eases with `raw` throughout and POSEX is not its
    // business — exactly like the ground slide.
    const raw = (obj, axis, target) => {
      obj.rotation[axis] += (target - obj.rotation[axis]) * e;
    };
    const W = WALL_SLIDE;
    const scrape = Math.sin(p * Math.PI * 2);
    const hip = HIP_Y - W.hipDrop - W.hipBob * scrape;
    // Which way the wall lies, as a mirror: the numbers below are authored for a wall on the
    // character's own right (`sideSign < 0`, its `L` bones), and everything that leans or rolls
    // TOWARD the wall has to follow it round.
    const mirror = sideSign < 0 ? 1 : -1;

    // Hips: low, rolled a little onto the taking hip, and pumping with the scrape.
    bones.hips.position.y += (hip - bones.hips.position.y) * e;
    raw(bones.hips, "y", 0);
    raw(bones.hips, "z", W.hipRoll * mirror);

    // The ANCHOR foot: the same solved contact the wall run's plant uses — flat on the face,
    // toe up it, carrying the weight — just set lower and re-setting on every scrape. The free
    // leg is a plain trailing pose (a running-style leg with its sole angle authored), because
    // the one thing it must not do is try to reach a face it is half a body away from.
    if (frame) {
      const dn = -SOLE_Y - frame.dFace - W.press;
      wallFoot(bones, sideSign < 0, e, frame, dn,
        W.footAlong + W.scrapeAlong * scrape, W.footD + W.scrapeD * scrape, 1);
    }
    const free = sideSign < 0 ? 1 : -1;
    poseLegAngles(bones, free, W.trailThigh, W.trailKnee, W.trailSole, W.trailSplay, e);

    // Palms: the arm on the wall side braces high with its palm flat on the face, the other
    // one is thrown out past the body as a counterweight. Which arm is which follows the wall
    // side, and so does the sense of the outward roll: `rotation.z` is `side * outward`, so the
    // two arms roll opposite ways for the same step and only the mirror lands the wall-side
    // arm rolled away from the face on BOTH sides. `hiZ`/`loZ` are those steps, positive out.
    // The twist is the odd one — `poseArmAngles` gives it no `side` — so it mirrors on its own.
    const wallArm = sideSign < 0 ? bones.armUpperL : bones.armUpperR;
    const wallFore = sideSign < 0 ? bones.armLowerL : bones.armLowerR;
    const freeArm = sideSign < 0 ? bones.armUpperR : bones.armUpperL;
    const freeFore = sideSign < 0 ? bones.armLowerR : bones.armLowerL;
    const wallOut = W.hiZ * mirror;
    const freeOut = W.loZ * mirror;
    raw(wallArm, "x", W.hiX);
    raw(wallArm, "y", W.hiTwist * mirror);
    raw(wallArm, "z", wallOut);
    raw(wallFore, "x", W.hiElbow);
    raw(freeArm, "x", W.loX);
    raw(freeArm, "y", W.loTwist * mirror);
    raw(freeArm, "z", freeOut);
    raw(freeFore, "x", W.loElbow);
    for (const f of bones.digits || []) {
      const tight = (f.side < 0) === (sideSign < 0) ? W.hiGrip : W.loGrip;
      f.knuckle.rotation.z = -(f.thumb ? FIST.thumb : FIST.knuckle) * tight * f.side;
      if (f.mid) f.mid.rotation.z = -FIST.mid * tight * f.side;
    }

    // Trunk pitched in over the braced foot, head up and turned along the wall it is descending.
    // The pitch (`x`) is the same either side — it leans down the wall — but the trunk's roll and
    // its counter-twist both lean ACROSS the body, so they are the mirror's business like the hip
    // roll above; left unmirrored, the trunk leans into a left-hand wall instead of off it.
    raw(bones.torso, "x", W.torsoX);
    raw(bones.torso, "y", W.torsoY * scrape * mirror);
    raw(bones.torso, "z", W.torsoZ * mirror);
    poseSettleTorso(bones, e);
    raw(bones.head, "x", W.headX);
    raw(bones.head, "y", W.headY * scrape * mirror);
    raw(bones.head, "z", 0);
    return;
  }
  // ---- THE CLIMB (see `poseWallClimb`) ----
  // The clip's own pose, playbacked on the cycle's phase (session 156) — see the note above
  // `CLIMB_PRESS`. Every contact is the clip's, solved against the plate, so this branch eases
  // with `raw` throughout (inside `poseWallClimb`) and POSEX is not its business.
  //
  // ...and TWO STANCES can sit on top of it, both of them solves of their own (session 161's rest
  // and session 164's pull): `pull` is the load's reading (or null on a frame that is not loading),
  // and `idleT` is the rest stance's own clock, which is what keeps a parked body alive.
  if (!frame) return;
  poseWallClimb(bones, e, p, frame, rest, pull, idleT);
}
// ---------------------------------------------------------------------------
// COMBAT — the four M1s, and the reactions the OTHER body wears when they land.
//
// The chain is authored the way a fighting game's is: each move is a start-up (the wind-up,
// where nothing is live), a contact window, and a recovery long enough for the next M1 to
// cancel into — and the four of them are one chain, so the body spends the whole string
// facing one direction and never takes a step (the user's "all the 4 m1s can be done without
// the character moving only looking at the enemy"; the facing is `player.js`'s job).
//
// A move is a TABLE of keyed channels, not a wall of arithmetic: `kf(t, keys)` is one scalar
// eased between its keys, so a pose reads as the drawings it is made of and a phase can be
// re-timed by moving a number. `t` is 0..1 over the move's own clock, and the key at which
// the contact lands is `start / total` for that move (see `COMBAT_MOVES`).
//
// SIDES. The rig names its bones for the MODEL's own -X/+X, and its `L` bones sit on the
// character's own RIGHT (see the crawl notes) — so `side -1` is the character's right hand and
// foot, which is the side every one of these moves is thrown with. `RK`/`LK` name them so the
// numbers below cannot be read the wrong way round.
// ---------------------------------------------------------------------------

const RK = -1;   // the character's RIGHT (the rig's `L` bones, its -X side)
const LK = 1;    // ...and its LEFT

// One channel of a move, eased between its keys (smoothstep, so the pose has no corners in
// it). Keys are [t, value] and must be in ascending t; outside the first/last key the value
// is held, so a channel that only lives for part of a move does not have to be padded.
function kf(t, keys) {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < n - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b[0]) {
      const s = poseEase((t - a[0]) / Math.max(1e-4, b[0] - a[0]));
      return a[1] + (b[1] - a[1]) * s;
    }
  }
  return keys[n - 1][1];
}

// --- M1 #1: the right knee into the stomach ------------------------------------------------
// Start-up 0.17, total 0.29 (contact key 0.345). The lead knee is chambered tall, the hips wind
// back and then snap the right hip through it, the trunk leans AWAY from the knee (the knee
// is the weapon, and a body that folds over its own strike reads as a stumble), the left hand
// spears out over the top of it and the right elbow drags back as the counterweight.
function poseKnee(bones, t, e) {
  // The anticipation is the whole read: he SITS DOWN first (a knee is thrown off a loaded leg)
  // and winds the hips away from the target, so the snap through it is the move.
  const hip = kf(t, [[0, 1.00], [0.20, 0.925], [0.345, 0.905], [0.47, 0.93], [0.62, 1.00], [1, 1.00]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", kf(t, [[0, 0], [0.24, -0.28], [0.345, 0.28], [0.47, 0.62], [0.66, 0.40], [1, 0]]), e);
  poseRot(bones, "hips", "z", kf(t, [[0, 0], [0.24, 0.09], [0.47, -0.13], [1, 0]]), e);

  // The trunk: down over the load, up and AWAY as the knee drives (the knee is the weapon, so
  // the body gets out of its way), then a crunch back over it on the follow-through — which is
  // the beat a knee strike is really sold on.
  poseRot(bones, "torso", "x", kf(t, [[0, 0.05], [0.24, 0.22], [0.345, -0.06], [0.47, -0.38], [0.62, 0.26], [0.80, 0.10], [1, 0.05]]), e);
  poseRot(bones, "torso", "y", kf(t, [[0, 0], [0.24, 0.24], [0.345, -0.10], [0.47, -0.44], [0.62, -0.14], [1, 0]]), e);
  poseRot(bones, "torso", "z", kf(t, [[0, 0], [0.24, 0.10], [0.47, -0.12], [1, 0]]), e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", kf(t, [[0, 0], [0.24, 0.16], [0.47, -0.34], [0.62, -0.10], [1, 0]]), e);
  poseRot(bones, "head", "y", kf(t, [[0, 0], [0.24, 0.16], [0.47, -0.26], [1, 0]]), e);
  poseRot(bones, "head", "z", 0, e);

  // The knee. The SNAP lives in the key spacing rather than in the values: the leg is still
  // fully folded when it lands (0.345, the contact) and only opens on the way back down, so
  // there is no frame where the knee is both high and unloaded.
  poseLegAngles(bones, RK,
    kf(t, [[0, 0.02], [0.10, -0.14], [0.18, -0.60], [0.30, -1.20], [0.345, -1.80], [0.47, -2.35], [0.60, -1.90], [0.80, -0.30], [1, 0.02]]),
    kf(t, [[0, 0.10], [0.10, 0.95], [0.18, 1.55], [0.30, 2.30], [0.345, 2.75], [0.47, 2.95], [0.60, 2.30], [0.80, 0.60], [1, 0.10]]),
    kf(t, [[0, 0], [0.47, 1.05], [0.80, 0.25], [1, 0]]),
    kf(t, [[0, 0.06], [0.30, 0.20], [0.47, 0.30], [1, 0.06]]), e);

  // The support leg is solved, not angled: it carries every bit of the sink and must not
  // skate, which is the one thing an angle-authored stance cannot promise at a moving hip.
  poseLegIK(bones, LK, ANKLE_Z + kf(t, [[0, 0], [0.30, -0.07], [0.47, -0.11], [1, 0]]), ankleForSole(0) - hip, 0.18, e);

  // The far hand spears out past the knee (the strike is thrown behind it) and the near elbow
  // drags back as the counterweight.
  poseArmAngles(bones, LK,
    kf(t, [[0, -0.35], [0.24, -0.85], [0.345, -1.25], [0.47, -1.32], [0.62, -1.00], [1, -0.35]]),
    kf(t, [[0, 0.30], [0.47, 0.16], [1, 0.30]]),
    kf(t, [[0, -1.30], [0.24, -1.95], [0.345, -2.10], [0.47, -1.90], [0.62, -1.70], [1, -1.30]]), e, 0.12);
  poseArmAngles(bones, RK,
    kf(t, [[0, 0.20], [0.24, 1.05], [0.47, 1.45], [0.62, 0.95], [1, 0.20]]),
    kf(t, [[0, 0.25], [0.47, 0.36], [1, 0.25]]),
    kf(t, [[0, -1.20], [0.24, -2.00], [0.47, -1.30], [1, -1.20]]), e, -0.12);
  // THE STRETCH: the knee IS the weapon, so the leg it is thrown off is drawn long through the
  // drive — the folded leg gets longer, which is what carries the knee up and into the target at
  // the contact key. The far (support) leg is not asked and is solved onto the deck, so the only
  // chain this can move is the one that is in the air.
  poseStretchChain(bones, "leg", RK, kf(t, [[0, 1], [0.14, 1.04], [0.345, 1.12], [0.50, 1.14], [0.70, 1.04], [1, 1]]));
  poseGrip(bones, kf(t, [[0, 0.35], [0.24, 0.95], [0.66, 0.95], [1, 0.35]]), e);
}

// --- M1 #2: the plum clinch and the knee that follows it ------------------------------------
// Start-up 0.38, total 0.55 (contact key 0.459). This is the move the user asked to be a real
// GRAB: both hands shoot out and take the back of the skull, hold it (the fingers are closed
// for the whole middle of the move — see `poseGrip`'s 1.0), and then DRAG it down as the body
// crunches and the hips drop, so the head is walked onto a rising right knee.
//
// Two things make it read as a grab rather than as a shove. The first is that the hands are
// keyed to a real PLACE — `CLINCH.grabX` / `grabY` are the back of an opponent's head once
// `enemies.js` has hauled the body in to `E.GRAB_DIST` (see "The clinch GRABS" in the README),
// and the pose is tuned against the measured distance between the two hands and the enemy's
// head bone. The second is that the hands' PATH is the pull: the arms go out, CLOSE, and then
// travel down and in, which is what an opponent's head does when you own it. The knee and the
// yank are the two halves of one lever, so they are keyed against each other: the hands are at
// the bottom of the pull exactly as the knee is at the top of its drive.
const CLINCH = {
  // The hands, in the rig's own frame, at the moment the head is taken and at the bottom of the
  // drag. `x` is out from the midline, `y` is up from the deck, `z` is forward (+Z is the way
  // the rig faces). These are the AUTHORED path — where the arms go when there is no head to
  // take, and where they come from and go back to — and they are what the live target in
  // `CLINCH_HEAD` is cross-faded onto over the grab.
  takeX: 0.26, takeY: 1.30, takeZ: 0.80,     // hands at full reach, arriving as the head comes in
  pullX: 0.15, pullY: 0.92, pullZ: 0.50,     // down and in, round the skull
  // ...and where on the SKULL the palms sit, relative to the enemy's head bone, once the hands are
  // on it: 0.11 either side of the midline, a finger's width above the joint and a hand's breadth
  // behind it, which is the back of the head rather than the face.
  grabX: 0.11, grabY: 0.02, grabZ: 0.06,
};

// The clinch, as the user asked for it: BOTH hands take the back of the skull, HOLD it (the fingers
// are shut for the whole middle of the move), and DRAG it down as the body crunches and the hips
// drop — so the head is walked onto a rising right knee, and the knee comes up into it.
//
// Three things make it read as a grab rather than as a shove:
//
//   1. The hands are SOLVED onto the head, live. `CLINCH_HEAD` is the enemy's head bone, written
//      into the player's own frame every frame by `player.js`; each arm is placed by `poseArmReach`
//      and cross-faded from `CLINCH.take*/pull*` onto that point over the take (see `hw` below).
//      An angle table cannot do this — the grab has to survive the trunk folding over, and the
//      trunk IS the thing the shoulder hangs off.
//   2. The trunk folds OVER the head instead of leaning away from it. The older shape threw the
//      body back off the knee (that read belongs to the standing knee strike, M1 #1); here the
//      attacker hunches over what he is holding, which is what drops the shoulders far enough in
//      and forward that the arms can still be BENT on a head that has been pulled down to waist
//      height (a straight-armed clinch reads as a shove).
//   3. Nothing releases until the end. The sink, the fold, the grip and the knee all HOLD from the
//      contact to `0.92` — the recovery used to start at 0.60, so with the move's clock warped
//      onto its contact the arms were already opening again by the time the hit landed.
//
// The knee is the other half of the lever and is keyed against the hands: it drives up while the
// hands drag down, and both are at their extremes together (0.60-0.74).
function poseClinch(bones, t, e) {
  const hip = kf(t, [[0, 1.00], [0.24, 0.99], [0.459, 0.87], [0.66, 0.84], [0.92, 0.85], [1, 1.00]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", kf(t, [[0, 0], [0.30, 0.12], [0.459, -0.14], [0.62, -0.18], [0.92, -0.14], [1, 0]]), e);
  poseRot(bones, "hips", "z", 0, e);

  // The trunk is the second half of the lever: it comes up as the hands take the neck, then folds
  // HARD over the head and stays folded — head and knee meet in the middle of it, which is the only
  // way the beat reads. It is held to 0.92 so the shoulders stay where the arms need them.
  poseRot(bones, "torso", "x", kf(t, [[0, 0.05], [0.30, 0.10], [0.459, 0.62], [0.62, 0.82], [0.72, 0.88], [0.92, 0.86], [1, 0.05]]), e);
  poseRot(bones, "torso", "y", kf(t, [[0, 0], [0.30, 0.14], [0.459, 0.30], [0.62, 0.10], [0.92, 0.06], [1, 0]]), e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", kf(t, [[0, 0], [0.30, 0.12], [0.459, 0.36], [0.72, 0.30], [0.92, 0.28], [1, 0]]), e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  // The knee: it comes back UP off the previous move's landing and then STAYS up — the user's
  // "the knee stays up in the enemy stomach" — which is what gives the hands something to drag
  // the head down ONTO. It peaks as the head arrives and only comes down with the release, so
  // there is never a frame where the head is being held over an empty knee.
  poseLegAngles(bones, RK,
    kf(t, [[0, 0.02], [0.22, -0.16], [0.36, -0.70], [0.48, -1.60], [0.60, -2.45], [0.74, -2.70], [0.92, -2.55], [0.98, -0.60], [1, 0.02]]),
    kf(t, [[0, 0.10], [0.22, 0.85], [0.36, 1.30], [0.48, 1.95], [0.60, 2.85], [0.74, 3.05], [0.92, 2.90], [0.98, 0.80], [1, 0.10]]),
    kf(t, [[0, 0], [0.70, 1.15], [0.92, 1.00], [1, 0]]),
    kf(t, [[0, 0.06], [0.60, 0.30], [0.92, 0.28], [1, 0.06]]), e);
  poseLegIK(bones, LK, ANKLE_Z + kf(t, [[0, 0], [0.44, -0.09], [0.62, 0.02], [0.92, 0.02], [1, 0]]), ankleForSole(0) - hip, 0.18, e);

  // The arms: OUT and high as the hands shoot for the skull, then they CLOSE onto it and ride it
  // down — the pull IS the hand path. `CLINCH.take*/pull*` are the authored stations, and `hw` is
  // how much of the LIVE head to use instead: it ramps in over the take (0 → 1 by 0.60) and back
  // out over the release, so a frame with no head to hold falls back to the authored path rather
  // than snapping to the origin. The elbows stay bent the whole way — a clinch is two hooks round
  // the back of the skull, not a pair of straight arms.
  const hw = clinchHeadOk ? kf(t, [[0, 0], [0.28, 0.06], [0.459, 0.30], [0.60, 1], [0.92, 1], [0.98, 0.35], [1, 0]]) : 0;
  const ax = kf(t, [[0, 0.30], [0.22, 0.30], [0.459, CLINCH.takeX], [0.62, CLINCH.pullX], [0.92, CLINCH.pullX], [1, 0.30]]);
  const ay = kf(t, [[0, 1.02], [0.22, 1.20], [0.459, CLINCH.takeY], [0.62, 1.02], [0.92, CLINCH.pullY], [1, 1.02]]);
  const az = kf(t, [[0, 0.40], [0.22, 0.62], [0.459, CLINCH.takeZ], [0.62, 0.60], [0.92, CLINCH.pullZ], [1, 0.40]]);
  for (const side of [LK, RK]) {
    const s = side < 0 ? -1 : 1;
    let tx = s * ax, ty = ay, tz = az;
    if (hw > 0) {
      const lx = CLINCH_HEAD.x + s * CLINCH.grabX;
      const ly = CLINCH_HEAD.y + CLINCH.grabY;
      const lz = CLINCH_HEAD.z + CLINCH.grabZ;
      tx += (lx - tx) * hw;
      ty += (ly - ty) * hw;
      tz += (lz - tz) * hw;
    }
    poseArmReach(bones, side, e, tx, ty, tz);
  }
  // The grip closes the instant the hands land and does not let go until the knee has gone
  // through — the one channel that says "held" rather than "touched".
  poseGrip(bones, kf(t, [[0, 0.35], [0.40, 0.7], [0.56, 1.0], [0.94, 1.0], [0.99, 0.4], [1, 0.35]]), e);
}

// ---------------------------------------------------------------------------
// THE WALL CLINCH — the ATTACKER's shape (see "THE WALL CLINCH" in README.md, and `player.js`'s
// `startWallBeat` / `updateWallBeat`).
//
// The user's own brief, in one sentence: *"the player smashes the enemy head to the wall and holds
// it there and keeps kneeing him in the stomach with each knee to the enemy it becomes faster until
// it becomes a blur and the enemy gets knocked far away from the wall"*. So there are exactly five
// things this shape has to do, and one clock each:
//
//   TAKE (0)   both hands shoot out and close on the back of the skull, and the body walks the
//              victim to the face — the arms are SOLVED onto the live head (`WALLBEAT_HEAD`, the
//              same bargain as the clinch's `poseClinch`), cross-faded from an authored reach;
//   SMASH (1)  the drive: the trunk pitches through the hands and shoves the skull into the wall.
//              It is the move's loud beat, and the pose's own extreme;
//   HOLD (2)   "holds it there": the fold settles a whisker and the whole body goes still, which is
//              what makes the first knee land as a release rather than as more of the smash;
//   KNEE (3)   ten knees, ALTERNATING legs, each one a beat of its own — driven at 0.42 of the
//              beat and planted again by its end, so the drive and the recovery are both in the
//              shape. `player.js` owns the schedule and hands each beat's progress in as `pu`; the
//              beats SHORTEN by ten per cent each (see `P.WALLBEAT.kneeAccel` — ten per cent, NOT
//              the doubling session 115 shipped, which is what turned the leg into a blur the eye
//              could not resolve and the user sent back), spent on the clock rather than faked in
//              the shape;
//   RELEASE(4) the hands come off and fling WIDE — the body straightens and leans back as the
//              victim is thrown off the wall, so the last thing the move does is the throw;
//   RECOVER(5) back onto a guard.
//
// ...AND HE STANDS UP (session 121). The user watched the whole move back and read it as something
// it is not — *"is he fucking him"* — and the top of the blame was here: the attacker used to fold
// his trunk right over the hands for the smash and stay there (torso 0.60 rad at the smash, 0.46
// held) while the victim was doubled over the stone with his hips out. Two bodies stacked front to
// back, one bent over the other, is a mount, whatever the hands are doing. Now the trunk only
// PITCHES (0.30 at the smash, 0.20 held, plus the knee's own small drive) and the head stays level,
// so the man is UPRIGHT on the body with both hands up on the skull and the knee driving into a
// belly he is looking straight at. The victim was re-staged to match (see `poseHurtWallPin`).
//
// `side` is which leg is striking (the player's own right is `RK`, see `RK`/`LK`), `blur` is how
// far into the accelerating tail the beat is, and `jolt` is the compression of a knee landing —
// the attack gets one too, because a man driving a knee into a body that is pinned recoils off it.
function poseWallBeat(bones, u, phase, pu, idx, side, blur, jolt) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const p = Math.max(0, Math.min(1, pu));
  const J = Math.max(0, Math.min(1, jolt || 0));
  const strike = side < 0 ? RK : LK;
  const plant = side < 0 ? LK : RK;

  let hip = 1.0, torX = 0.05, torY = 0, torZ = 0, hdX = 0, hdY = 0;
  let reachW = 0;                                   // how much of the arms' live-head solve is on
  let ax = 0.30, ay = 1.02, az = 0.42;              // the authored arm station (no head to hold)
  let kneeK = 0;                                    // the striking leg's own drive
  if (phase === 0) {
    hip = kf(p, [[0, 1.00], [0.45, 1.02], [1, 0.98]]);
    torX = kf(p, [[0, 0.05], [0.50, 0.10], [1, 0.14]]);
    hdX = kf(p, [[0, 0], [1, 0.04]]);
    reachW = kf(p, [[0, 0], [0.55, 0.35], [1, 1]]);
    ax = kf(p, [[0, 0.30], [0.50, 0.34], [1, 0.18]]);
    ay = kf(p, [[0, 1.02], [0.50, 1.30], [1, 1.34]]);
    az = kf(p, [[0, 0.42], [0.50, 0.66], [1, 0.80]]);
  } else if (phase === 1) {
    hip = kf(p, [[0, 0.98], [0.40, 0.94], [1, 0.95]]);
    torX = kf(p, [[0, 0.14], [0.40, 0.30], [1, 0.22]]);
    hdX = kf(p, [[0, 0.04], [0.40, 0.14], [1, 0.08]]);
    reachW = 1;
  } else if (phase === 2) {
    hip = kf(p, [[0, 0.95], [1, 0.96]]);
    torX = kf(p, [[0, 0.22], [1, 0.20]]);
    hdX = kf(p, [[0, 0.08], [1, 0.07]]);
    reachW = 1;
  } else if (phase === 3) {
    // The knee: driven at 0.42 of the beat and planted again by its end, so the drive AND the
    // recovery are both in the shape — which is what lets the beats shorten without the leg ever
    // being caught mid-air when the next one starts.
    kneeK = kf(p, [[0, 0], [0.42, 1], [1, 0]]);
    hip = 0.96 - 0.02 * kneeK;
    torX = 0.20 + 0.14 * kneeK;
    hdX = 0.07 + 0.04 * kneeK;
    // ...and the body turns a touch into each knee, with the shoulder on the striking side coming
    // over the top of it — a clinch knee is thrown ACROSS, not straight up the midline.
    torY = (strike < 0 ? -1 : 1) * 0.07 * kneeK;
    hdY = (strike < 0 ? 1 : -1) * 0.10 * kneeK;
    reachW = 1;
    torZ = -0.02 * kneeK;
  } else if (phase === 4) {
    hip = kf(p, [[0, 0.96], [0.25, 0.92], [1, 1.00]]);
    torX = kf(p, [[0, 0.20], [0.25, -0.10], [1, 0.05]]);
    hdX = kf(p, [[0, 0.07], [0.25, -0.22], [1, 0]]);
    reachW = kf(p, [[0, 1], [0.30, 0]]);
    ax = kf(p, [[0, 0.18], [1, 0.66]]);
    ay = kf(p, [[0, 1.34], [1, 0.92]]);
    az = kf(p, [[0, 0.80], [1, -0.12]]);
  } else {
    hip = 1.0;
    torX = 0.05;
    reachW = 0;
    ax = kf(p, [[0, 0.66], [1, 0.30]]);
    ay = kf(p, [[0, 0.92], [1, 1.02]]);
    az = kf(p, [[0, -0.12], [1, 0.42]]);
  }
  // The attack's own recoil off a knee that landed: half of what it throws the victim with, because
  // the man is braced against a body he has pinned and only the top of him moves.
  hip -= 0.02 * J;
  torX += 0.05 * J;

  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", torY * 0.55, e);
  poseRot(bones, "hips", "z", 0, e);
  poseRot(bones, "torso", "x", torX, e);
  poseRot(bones, "torso", "y", torY, e);
  poseRot(bones, "torso", "z", torZ, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", hdX, e);
  poseRot(bones, "head", "y", hdY, e);
  poseRot(bones, "head", "z", 0, e);

  // The legs. The PLANT leg is solved onto the deck (the body is grounded at the stage, so
  // `ankleForSole(0) - hip` is what the rig's own origin measures), and the STRIKING leg is
  // angle-authored exactly the way the clinch's knee is — a knee strike is a hip and a fold, not a
  // foot on a floor. Its `kneeK` is zero in every beat but its own, so the two legs agree by
  // construction at every boundary.
  poseLegIK(bones, plant, ANKLE_Z + (plant === LK ? 0.04 : -0.04), ankleForSole(0) - hip, 0.20, e);
  poseLegAngles(bones, strike,
    -0.02 - 1.90 * kneeK,
    0.12 + 2.80 * kneeK,
    1.00 * kneeK,
    0.18 + 0.30 * kneeK, e);
  // ...and the striking leg is drawn LONG at the top of the drive: the knee's own reach is the
  // contact, exactly the way the flying knee and the sweep both accent theirs.
  if (kneeK > 0.02) poseStretchChain(bones, "leg", strike, 1 + 0.10 * kneeK);

  // The hands. They are SOLVED onto the back of the skull (`WALLBEAT_HEAD`, written live by
  // `player.js`) and cross-faded from the authored station over the take, exactly as the clinch's
  // are — a fixed table of hand positions cannot survive the trunk folding over, because the
  // shoulder the arm hangs off moves with it. Once the head has been let go (`reachW` 0) the arms
  // go back to the authored station, which phase 4 walks out wide and back.
  for (const sd of [LK, RK]) {
    const s = sd < 0 ? -1 : 1;
    let tx = s * ax, ty = ay, tz = az;
    if (reachW > 0.001 && wallBeatHeadOk) {
      // ...and on the SKULL's own axes, not the world's: `s` runs along the wall's TANGENT so the
      // two hands close on the SIDES of the head, and both sit a touch off the stone along the
      // face normal. The old solve offset along the world's x/z, which put the hands on the head's
      // sides only for a face that happened to face ±z (and, on any other wall, along the normal —
      // one hand into the stone and one out of it). See `WALLBEAT_NX`.
      const tgx = -WALLBEAT_NZ, tgz = WALLBEAT_NX;
      const lx = WALLBEAT_HEAD.x + tgx * (s * 0.12) + WALLBEAT_NX * 0.10;
      const ly = WALLBEAT_HEAD.y + 0.03;
      const lz = WALLBEAT_HEAD.z + tgz * (s * 0.12) + WALLBEAT_NZ * 0.10;
      tx += (lx - tx) * reachW;
      ty += (ly - ty) * reachW;
      tz += (lz - tz) * reachW;
    }
    poseArmReach(bones, sd, e, tx, ty, tz, ARM_REACH);
  }
  // A shut fist for the whole hold, released on the throw: the one channel that says "held" rather
  // than "touched", and the same one the clinch uses.
  poseGrip(bones, phase === 4 ? kf(p, [[0, 1], [0.40, 0.15], [1, 0]]) : 1, e);
}

// --- M1 #3: pull back, then the sweep --------------------------------------------------------
// Start-up 0.25, total 0.62 (contact key 0.308). The body rocks BACK on the balls of the feet
// (that is the "pull back" the user asked for — it is what makes the sweep read as a wind-up
// rather than as a fall), then drops onto a deep, solved support leg and carves the right leg
// through at shin height. The trunk goes down over the support leg and the arms throw wide the
// other way: the whole body is the counterweight.
//
// This is the move that TURNS. `COMBAT_MOVES` gives it `spin: -1` and `player.js` winds the
// whole rig through one full turn across the middle of the move (see `poseSpin`), so the sweep
// arrives out of a pivot and lands back facing the target — the reference sheets' own read, and
// the reason the arms are thrown wide rather than tucked: at speed, the wide arms are what
// carry the eye around with the turn.
function poseSweep(bones, t, e) {
  const hip = kf(t, [[0, 1.00], [0.10, 1.02], [0.22, 0.60], [0.308, 0.38], [0.46, 0.34], [0.49, 0.60], [0.56, 0.78], [0.80, 0.95], [1, 1.00]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", kf(t, [[0, 0], [0.10, -0.30], [0.308, 0.30], [0.46, 0.95], [0.62, 0.70], [0.80, 0.25], [1, 0]]), e);
  poseRot(bones, "hips", "z", kf(t, [[0, 0], [0.10, -0.05], [0.308, 0.10], [0.46, 0.14], [1, 0]]), e);

  poseRot(bones, "torso", "x", kf(t, [[0, 0.05], [0.10, -0.24], [0.22, 0.34], [0.308, 0.62], [0.46, 0.68], [0.62, 0.42], [1, 0.05]]), e);
  poseRot(bones, "torso", "y", kf(t, [[0, 0], [0.10, 0.34], [0.308, -0.20], [0.46, -0.55], [0.62, -0.35], [1, 0]]), e);
  poseRot(bones, "torso", "z", kf(t, [[0, 0], [0.308, 0.12], [0.46, 0.18], [1, 0]]), e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", kf(t, [[0, 0], [0.10, 0.14], [0.308, -0.42], [0.46, -0.50], [1, 0]]), e);
  poseRot(bones, "head", "y", kf(t, [[0, 0], [0.308, 0.22], [0.46, 0.30], [1, 0]]), e);
  poseRot(bones, "head", "z", 0, e);

  // The sweeping leg: it goes out SIDEWAYS and low — `splay` is the abduction, so the foot
  // travels through a wide flat arc at shin height while the knee stays nearly straight. Then
  // it FOLDS as it comes back (`knee` 1.05 → 1.50 while the splay drops away), because a leg
  // that is still hanging out to the side when the body stands up reads as tangled rather than
  // as recovering.
  poseLegAngles(bones, RK,
    kf(t, [[0, 0.02], [0.10, 0.42], [0.16, -1.20], [0.22, -1.70], [0.26, -1.90], [0.46, -1.85], [0.51, -1.75], [0.56, -1.00], [0.72, -0.35], [0.86, 0.12], [1, 0.02]]),
    kf(t, [[0, 0.10], [0.10, 0.30], [0.16, 2.60], [0.22, 2.90], [0.26, 2.90], [0.288, 2.10], [0.308, 0.50], [0.46, 0.30], [0.468, 2.30], [0.48, 2.75], [0.54, 2.90], [0.62, 2.60], [0.72, 1.45], [0.86, 0.60], [1, 0.10]]),
    kf(t, [[0, 0], [0.308, -0.18], [0.46, -0.24], [0.50, 0.55], [0.58, 0.30], [0.72, 0.10], [1, 0]]),
    kf(t, [[0, 0.06], [0.10, 0.14], [0.16, 0.22], [0.22, 0.25], [0.308, 0.70], [0.46, 0.90], [0.54, 0.70], [0.62, 0.60], [0.72, 0.45], [0.86, 0.18], [1, 0.06]]), e);
  // The support leg takes the whole drop: a deep, solved crouch that never moves its foot.
  poseLegIK(bones, LK, ANKLE_Z + 0.10, ankleForSole(0) - hip, 0.22, e);

  // Arms: pulled in on the rock-back, then thrown wide and low as the sweep's counterweight.
  poseArmAngles(bones, LK,
    kf(t, [[0, -0.35], [0.10, -0.95], [0.22, -1.10], [0.308, -0.70], [0.62, -0.55], [1, -0.35]]),
    kf(t, [[0, 0.30], [0.10, 0.12], [0.308, 0.80], [0.46, 1.00], [0.62, 0.6], [1, 0.30]]),
    kf(t, [[0, -1.30], [0.10, -2.20], [0.22, -2.10], [0.308, -0.85], [0.62, -1.10], [1, -1.30]]), e, 0.12);
  poseArmAngles(bones, RK,
    kf(t, [[0, 0.20], [0.10, -0.75], [0.22, -0.80], [0.308, -0.30], [0.46, 0.55], [0.62, 0.80], [1, 0.20]]),
    kf(t, [[0, 0.25], [0.10, 0.10], [0.308, 0.75], [0.46, 1.05], [0.62, 0.7], [1, 0.25]]),
    kf(t, [[0, -1.20], [0.10, -2.10], [0.308, -1.00], [0.46, -0.60], [1, -1.20]]), e, -0.12);
  // THE STRETCH: the sweep's weapon is the SHIN, thrown out sideways through a wide flat arc — so
  // the sweeping leg is drawn long as it goes through the arc and is back to length by the time it
  // folds away on the recovery. (The sweeping leg is angle-authored; the crouched support leg is
  // the one that is solved, and it is not asked.)
  poseStretchChain(bones, "leg", RK, kf(t, [[0, 1], [0.20, 1.04], [0.34, 1.12], [0.48, 1.12], [0.66, 1.03], [1, 1]]));
  poseGrip(bones, kf(t, [[0, 0.35], [0.15, 0.85], [0.40, 0.30], [1, 0.35]]), e);
}

// --- M1 #4: the ONE-TWO — a lead jab, then the cross that sends them -------------------------
// Start-up 0.20, total 0.41 (contact key 0.60 — the CROSS's own contact; see `COMBAT_MOVES`).
// The user's reference is a boxing one-two thrown off a staggered stance: the LEAD (left) hand
// snaps out first, high, at the head, and comes straight back; the rear (right) hand then drives
// through to the chest with the hips, and the follow-through carries the body past the punch.
// Both feet stay planted — it is the same stance the whole chain fights from — so the whole move
// is the body TURNING: the hips wind one way for the jab and the other way for the cross, and the
// trunk rides a frame behind them both. The user's *"make the 4th m1 look like this"*, over a
// reference of exactly that combination.
//
// It is still the finisher, so the CROSS is the contact and it is still authored big: the deepest
// hip turn of the four, the arm out to full extension with the elbow near 0 (the reach is the
// body's, not the arm's), and a follow-through that keeps going after the contact instead of
// stopping at it. The jab is the SMALL half: no wind, no follow-through, out and back while the
// cross is still loading — which is the thing that separates a jab from a cross.
function posePunch(bones, t, e) {
  // The hips make two turns in one move — a small one for the jab and the big one for the cross —
  // and the counter-swing between them IS the load. `+y` carries the right shoulder through.
  const hip = kf(t, [[0, 1.00], [0.10, 0.985], [0.20, 0.975], [0.34, 0.955], [0.44, 0.900], [0.60, 1.015], [0.76, 1.005], [1, 1.00]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", kf(t, [[0, 0], [0.10, 0.18], [0.24, -0.26], [0.34, -0.10], [0.44, 0.34], [0.60, 0.72], [0.76, 1.00], [1, 0]]), e);
  poseRot(bones, "hips", "z", kf(t, [[0, 0], [0.24, -0.06], [0.44, 0.12], [0.60, -0.14], [1, 0]]), e);

  // The trunk is a frame behind the hips on both punches, and it is what carries the arms: the
  // jab is a small shoulder turn, and the cross is the whole upper body coming over the load.
  poseRot(bones, "torso", "x", kf(t, [[0, 0.05], [0.24, 0.10], [0.44, 0.30], [0.60, 0.34], [0.82, 0.22], [1, 0.05]]), e);
  poseRot(bones, "torso", "y", kf(t, [[0, 0], [0.10, 0.22], [0.24, -0.36], [0.44, -0.40], [0.60, 0.58], [0.76, 1.00], [1, 0]]), e);
  poseRot(bones, "torso", "z", kf(t, [[0, 0], [0.24, -0.10], [0.44, 0.14], [0.60, -0.16], [1, 0]]), e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", kf(t, [[0, 0], [0.20, 0.10], [0.44, 0.14], [0.60, -0.10], [0.82, -0.06], [1, 0]]), e);
  poseRot(bones, "head", "y", kf(t, [[0, 0], [0.10, 0.20], [0.24, -0.26], [0.44, -0.28], [0.60, 0.22], [0.82, 0.10], [1, 0]]), e);
  poseRot(bones, "head", "z", 0, e);

  // A stance, not a step, for the whole one-two: the lead (left) foot is planted forward and only
  // rocks under the weight, while the rear (right) foot is what DRIVES the cross — its heel comes
  // off the deck as the hips come through, which is where the punch's power is.
  poseLegIK(bones, LK, ANKLE_Z + kf(t, [[0, 0.10], [0.20, 0.16], [0.44, 0.12], [0.60, 0.02], [0.82, 0.08], [1, 0.10]]), ankleForSole(0) - hip, 0.22, e);
  poseLegAngles(bones, RK,
    kf(t, [[0, 0.02], [0.20, 0.30], [0.44, 0.52], [0.60, -0.26], [0.76, -0.16], [1, 0.02]]),
    kf(t, [[0, 0.10], [0.20, 0.60], [0.44, 0.72], [0.60, 0.38], [0.76, 0.30], [1, 0.10]]),
    kf(t, [[0, 0], [0.20, 0.10], [0.44, 0.18], [0.60, 0.50], [0.76, 0.40], [1, 0]]),
    kf(t, [[0, 0.06], [0.20, 0.20], [0.44, 0.30], [0.60, 0.38], [0.76, 0.28], [1, 0.06]]), e);

  // THE JAB (the left, the LEAD hand): a small chamber, straight out at HEAD height — higher than
  // the cross that follows it, which is the read of a one-two — and straight back. No wind and no
  // follow-through: the lead snap is the whole of it, and it is back before the cross has loaded.
  poseArmAngles(bones, LK,
    kf(t, [[0, -0.60], [0.08, -0.30], [0.24, -2.10], [0.40, -2.00], [0.56, -0.55], [0.74, -0.48], [1, -0.60]]),
    kf(t, [[0, 0.24], [0.08, 0.30], [0.24, 0.20], [0.40, 0.22], [0.56, 0.26], [1, 0.24]]),
    kf(t, [[0, -2.05], [0.08, -2.35], [0.24, -0.28], [0.40, -0.35], [0.56, -2.15], [0.74, -2.25], [1, -2.05]]), e, 0.10);
  // THE CROSS (the right, the REAR hand): drawn back and cocked high while the jab is out, then all
  // the way through to the chest — full extension, elbow near 0, and the fist carried past the
  // midline by the shoulder rather than by the arm. Its extension is the move's own extreme, at the
  // contact key, so the punch arrives at its longest rather than sliding past it.
  poseArmAngles(bones, RK,
    kf(t, [[0, 0.22], [0.24, 0.30], [0.44, 0.95], [0.60, -1.62], [0.76, -1.48], [1, 0.22]]),
    kf(t, [[0, 0.26], [0.24, 0.30], [0.44, 0.44], [0.60, 0.14], [0.76, 0.10], [1, 0.26]]),
    kf(t, [[0, -1.25], [0.24, -1.35], [0.44, -2.30], [0.60, -0.08], [0.76, -0.35], [1, -1.25]]), e, -0.20);
  // Both hands close on the way out and stay shut through the combination — the reference's lead
  // hand starts open and becomes a fist as it goes.
  // THE STRETCH: the one-two is the move whose whole read is REACH — the cross's extension is the
  // move's own extreme, at the contact key — so both arms are drawn past their own length on the
  // way out: a fifth on the cross, a sixth on the lead snap. Neither arm is a solved chain in this
  // pose (both are angle-authored), which is what makes it safe to do.
  poseStretchChain(bones, "arm", LK, kf(t, [[0, 1], [0.10, 1.06], [0.26, 1.16], [0.42, 1.14], [0.62, 1.0], [1, 1]]));
  poseStretchChain(bones, "arm", RK, kf(t, [[0, 1], [0.34, 1.04], [0.58, 1.24], [0.72, 1.22], [0.88, 1.04], [1, 1]]));
  poseGrip(bones, kf(t, [[0, 0.35], [0.12, 0.92], [0.30, 1.0], [0.92, 1.0], [1, 0.35]]), e);
}

// --- the 4th M1 IN THE AIR: the DOWN SLAM (see `player.js`'s `startAttack` / `P.DSLAM_*`) --------
// The chain's finisher is two moves behind one button. On the deck it is the one-two above; off the
// deck it is THIS: he turns one whole FORWARD revolution — a fast front flip — and lands the
// revolution by throwing a leg out and DOWN through whatever is beneath him. It is the move the
// sweep sets up: the sweep is the one that leaves a body hanging and hittable (`E.FLIP_*`), so
// "sweep, jump, M1" is a real string rather than a hopeful one. That is why the pose below is
// authored in the BALL first and the STOMP second.
//
// The revolution itself is NOT in here. It is the RIG's own pitch, spent by `player.js` on
// `inner.rotation.x` off `DOWNSLAM_TURN` — the same arrangement the macaco's turn and the double
// jump's revolution already use — because a flip about the hips is one rotation of the body, not a
// set of limb angles. What this pose owns is what the body is DOING while it turns: the TUCK
// through the turn (the trunk curled over the knees, the chin down, both legs folded to the chest,
// the arms hugging the shins — the same ball `poseTuck` builds for the double jump) and then the
// UNFOLDING, which is the slam — the trunk coming upright and the weapon leg (the right) shooting
// out of the tuck, straightening, and driving down through the body below.
//
// `DOWNSLAM_TURN` lands the revolution EARLY — by 0.45 of the move, while the contact key is 0.60
// — so the body is square again BEFORE the foot goes through: the leg lands in the WORLD's down,
// not in the tuck's, and the unfold that carries it down is the beat between the two keys. Everything
// after the contact is the recovery — the leg carries the landing and the body stands back up out of
// it. Landing the revolution early is also what keeps the move honest against the AIRTIME it is
// thrown into: a slam pressed a couple of frames after a jump has only a tenth of a second of fall
// left, and a turn that finished on the contact key would still be upside down when the feet
// arrived.
const DOWNSLAM_TURN_KEYS = [
  [0, 0], [0.08, 0.03], [0.18, 0.28], [0.30, 0.68], [0.38, 0.90], [0.45, 1], [0.60, 1], [1, 1],
];
const DOWNSLAM_TURN = (u) => kf(u, DOWNSLAM_TURN_KEYS);

function poseDownSlam(bones, t, e) {
  // The hips stay near standing height the whole way: the body is AIRBORNE, so there is no deck to
  // solve against and the whole shape is carried by the rig's own turn. The only hip motion is the
  // tuck's small lift and the sink the stomp lands into.
  const hip = kf(t, [[0, 1.00], [0.16, 1.06], [0.42, 1.04], [0.58, 0.94], [0.76, 0.93], [1, 1.00]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  // A touch of turn on the way in and back out, so the ball reads as THROWN rather than as a body
  // spun on a stick.
  poseRot(bones, "hips", "y", kf(t, [[0, 0], [0.28, 0.14], [0.58, -0.10], [0.76, 0.06], [1, 0]]), e);
  poseRot(bones, "hips", "z", 0, e);

  // The trunk is the tuck and the unfolding: it CURLS hard over the knees — that is what makes the
  // ball round enough for the turn to read at speed — and then comes upright as the leg goes out,
  // which is the beat that carries the foot down into the body. The unfold is keyed to be all but
  // done by `DOWNSLAM_TURN`'s own last key (0.45), so the body is opening as the revolution lands
  // rather than uncurling after it has already stopped.
  poseRot(bones, "torso", "x", kf(t, [[0, 0.10], [0.14, 0.62], [0.32, 0.86], [0.45, 0.62], [0.58, 0.26], [0.76, 0.14], [1, 0.05]]), e);
  poseRot(bones, "torso", "y", kf(t, [[0, 0], [0.28, -0.10], [0.58, 0.12], [0.76, 0.06], [1, 0]]), e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  // Chin to the chest through the turn (it is what closes the ball), eyes back up on the way down —
  // he is watching where the foot is going.
  poseRot(bones, "head", "x", kf(t, [[0, 0.06], [0.14, 0.36], [0.32, 0.50], [0.45, 0.30], [0.58, 0.02], [0.76, -0.16], [1, 0]]), e);
  poseRot(bones, "head", "y", kf(t, [[0, 0], [0.58, 0.14], [0.76, 0.06], [1, 0]]), e);
  poseRot(bones, "head", "z", 0, e);

  // THE WEAPON LEG (the right): folded to the chest for the turn, then THROWN — it comes out of the
  // tuck straightening, and by the contact key it is one long straight leg driven out and DOWN with
  // the foot pointed through the body. It is ANGLE-authored rather than solved onto a deck because
  // there is no deck in this move: the target is a BODY, and where the foot ends is the body's
  // business (the wedge in `player.js` is what finds it, and it reaches four units below the feet).
  poseLegAngles(bones, RK,
    kf(t, [[0, -0.95], [0.14, -1.60], [0.32, -1.88], [0.46, -1.45], [0.55, -0.86], [0.60, -0.64], [0.72, -0.34], [0.88, -0.14], [1, -0.06]]),
    kf(t, [[0, 1.40], [0.14, 2.30], [0.32, 2.50], [0.46, 1.95], [0.55, 0.55], [0.60, 0.06], [0.72, 0.26], [0.88, 0.22], [1, 0.20]]),
    kf(t, [[0, 0.45], [0.32, 0.90], [0.54, 0.60], [0.60, 0.56], [0.78, 0.28], [1, 0.16]]),
    kf(t, [[0, 0.14], [0.32, 0.26], [0.60, 0.05], [1, 0.10]]), e);
  // ...and the other leg stays TUCKED — knee up and out of the weapon's way — so the silhouette at
  // the contact is one leg driven down through a body with the other folded clear above it.
  poseLegAngles(bones, LK,
    kf(t, [[0, -0.85], [0.14, -1.72], [0.32, -2.02], [0.52, -1.92], [0.68, -1.42], [0.86, -0.52], [1, -0.06]]),
    kf(t, [[0, 1.25], [0.14, 2.42], [0.32, 2.66], [0.52, 2.58], [0.68, 2.05], [0.86, 0.80], [1, 0.20]]),
    kf(t, [[0, 0.42], [0.32, 0.92], [0.60, 0.88], [0.86, 0.40], [1, 0.16]]),
    kf(t, [[0, 0.16], [0.32, 0.34], [0.68, 0.30], [1, 0.10]]), e);

  // THE ARMS: hugging the shins for the turn (half of what makes the ball — the same `poseTuck`
  // arrangement the double jump's flip uses), then thrown WIDE as the leg goes through — one arm up
  // and back over the head, the other across the chest — because a body landing out of a flip onto
  // one foot needs the other three limbs out for balance.
  poseArmAngles(bones, RK,
    kf(t, [[0, -0.60], [0.16, -0.78], [0.34, -0.80], [0.50, -0.62], [0.60, 0.30], [0.76, 0.86], [1, 0.10]]),
    kf(t, [[0, 0.16], [0.16, 0.12], [0.34, 0.10], [0.60, 0.72], [0.76, 1.02], [1, 0.30]]),
    kf(t, [[0, -1.85], [0.16, -2.25], [0.34, -2.30], [0.50, -1.85], [0.60, -0.62], [0.76, -0.38], [1, -1.20]]), e, 0.10);
  poseArmAngles(bones, LK,
    kf(t, [[0, -0.60], [0.16, -0.78], [0.34, -0.80], [0.50, -0.66], [0.60, -1.05], [0.76, -0.62], [1, -0.35]]),
    kf(t, [[0, 0.16], [0.16, 0.12], [0.34, 0.10], [0.60, 0.22], [0.76, 0.34], [1, 0.30]]),
    kf(t, [[0, -1.85], [0.16, -2.25], [0.34, -2.30], [0.50, -1.95], [0.60, -1.42], [0.76, -1.28], [1, -1.20]]), e, -0.10);

  // The weapon leg is drawn LONG through the drive — the same accent the knee and the sweep take —
  // because the foot's reach is the whole of this move's contact.
  poseStretchChain(bones, "leg", RK, kf(t, [[0, 1], [0.44, 1.03], [0.60, 1.14], [0.74, 1.12], [0.92, 1.02], [1, 1]]));
  poseGrip(bones, kf(t, [[0, 0.85], [0.34, 0.95], [0.70, 0.95], [0.90, 0.70], [1, 0.60]]), e);
}

// --- SPACE held + M1 on the 4th M1: THE UPPERCUT — the launcher -------------------------------
// The user's own brief, across three messages. The move itself: *"if space is held while player is
// on the ground and m1ing then make the player do an uppercut that throws the enemy in the air"*.
// Then WHICH press it belongs to: *"fix the uppercut make it only be done in the m4 like if i hold
// space while doing the 4th m1 i do the uppercut"* — that gate is `player.js`'s
// (`nextMoveIndex() === 3`; see the press site in `update`), and this file owns only the shape.
// And then the shape itself, which is this function's third version: *"the animtion of it is a
// very fast leg sweep once (just visaul no hit) then as im getting up to do the knee uppercut i
// spin and give him the knee uppercut with my right knee"*.
//
// So the start-up is a SWEEP, thrown ONCE, and it is the LEG that sweeps — not the two hand passes
// this pose used to spend its wind-up on. The RIGHT leg whips out low and across the deck (`RK`,
// the leg the knee then comes up on, so the whole move is one arc of one leg rather than a leg
// change in the middle of it), the body sinks onto the LEFT leg to give it room to pass under him,
// and there is NO contact key, NO reach and NO wedge anywhere in it: the move's only contact is
// still the single one `player.js` fires at 0.50 (`P.UPPER_*`), and that one is the knee. The
// sweep is there for the effect, and because it is what LOADS the leg the knee is thrown off.
//
// Then he SPINS UP into it. The rig takes one whole turn on the way out of the sweep
// (`UPPERCUT_MOVE.spin` −1, spent on `UPPERCUT_SPIN_KEYS` so the turn is done and the body square
// again by the contact — the aim and the hit wedge are untouched by the turn either way, see
// `player.updateVisual`), the hips rise on the support leg, and the RIGHT knee arrives at the top
// of its drive on exactly the frame the launch fires.
//
// The knee is angle-authored rather than solved, because the target is a chin and not the deck
// (the wedge in `player.js` is what finds it, and it reaches a body's height above the feet — see
// `P.UPPER_UP`). The thigh goes past parallel (-2.20, a little under forty degrees ABOVE the
// horizontal at the peak) with the shin folded to 2.45 under it and the sole cocked, so the flat
// of the foot is never what arrives — the numbers the LEFT knee of the old pose was authored
// with, on the `RK` side the user's own words name (`LK`/`RK`: `< 0` is the bone named `...L`,
// the character's own right). The hands, which the sweeps used to occupy, are thrown wide as the
// sweep's counterweight (M1 #3's own gesture, and its reason: at speed the wide arms are what
// carry the eye round the turn) and then come down and back, out of the knee's way, for the
// contact.
function poseUppercut(bones, t, e) {
  // THE SINK AND THE RISE — and the SINK is most of the move's read: a leg sweep passes UNDER the
  // body, so the body has to come down to the deck with it (the same bargain M1 #3's sweep makes,
  // whose contact is at 0.38 of standing height; this one cannot go quite that low because it has
  // to get a knee out of the bottom of it, and it is measured rather than picked — see the numbers
  // below). The body is HELD down through the middle of the move and then rises fast: `0.47` →
  // `1.055` is 0.6 of a body height in 0.2 s, which is what makes the knee read as thrown off a
  // loaded leg rather than as arriving out of a crouch.
  const hip = kf(t, [[0, 1.00], [0.05, 0.80], [0.14, 0.55], [0.20, 0.47], [0.30, 0.47], [0.36, 0.70], [0.44, 0.96], [0.50, 1.055], [0.64, 1.005], [0.82, 1.00], [1, 1.00]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  // The hips wind with the sweep and are already opening towards the knee by the contact — the
  // knee comes up on the right, so the pelvis leads it there. The turn through the middle of the
  // move is the RIG's (see `poseSpin`); what is here is the wind-up and the unwind.
  poseRot(bones, "hips", "y", kf(t, [[0, 0], [0.12, 0.30], [0.26, 0.16], [0.38, -0.32], [0.46, -0.12], [0.50, 0.22], [0.68, 0.12], [1, 0]]), e);
  poseRot(bones, "hips", "z", kf(t, [[0, 0], [0.16, 0.08], [0.32, -0.08], [0.50, 0.05], [1, 0]]), e);

  // The trunk goes down over the sweep (the sweep IS the load) and then opens BACK over the knee:
  // the knee is the weapon and the body gets behind it, so the chest goes up and back as the thigh
  // comes up. That is the whole read of a launcher, and the opposite gesture from the standing knee
  // (M1 #1), which folds over its own strike.
  poseRot(bones, "torso", "x", kf(t, [[0, 0.05], [0.12, 0.20], [0.24, 0.30], [0.38, 0.10], [0.50, -0.34], [0.66, -0.18], [0.84, 0.04], [1, 0.05]]), e);
  poseRot(bones, "torso", "y", kf(t, [[0, 0], [0.12, 0.34], [0.26, 0.18], [0.38, -0.34], [0.46, -0.16], [0.50, 0.24], [0.68, 0.10], [1, 0]]), e);
  poseRot(bones, "torso", "z", kf(t, [[0, 0], [0.16, 0.10], [0.32, -0.12], [0.50, 0.06], [1, 0]]), e);
  poseSettleTorso(bones, e);
  // The head leads the sweep (he is watching his own leg) and then tips BACK as the knee takes over
  // — eyes up, at the body he has just put in the air.
  poseRot(bones, "head", "x", kf(t, [[0, 0], [0.14, 0.12], [0.30, 0.16], [0.50, -0.30], [0.70, -0.14], [1, 0]]), e);
  poseRot(bones, "head", "y", kf(t, [[0, 0], [0.14, 0.22], [0.32, -0.26], [0.50, 0.16], [1, 0]]), e);
  poseRot(bones, "head", "z", 0, e);

  // ---- THE RIGHT LEG: the sweep, and then the knee ----
  // ONE leg does both, and the channels read as one arc through it. The sweep is keyed to M1 #3's
  // own (that pose is the game's verified low sweep): the leg CHAMBERS as he sinks — the knee comes
  // up in front while the body drops onto the other leg, which is what makes the whip that follows
  // read as thrown rather than as a leg that happened to be out — and then the shin SNAPS straight
  // out at the peak (`knee` 2.90 → 0.45 in two frames at 0.20) with the whole leg rolled out to the
  // side (`splay` 0.90), so the foot travels a wide flat arc at deck height. It is only low BECAUSE
  // the body is low: with the hips at 0.46 of standing height, the horizontal leg's foot lands on
  // the pavement (measured below). Then the leg folds back into the chamber and is driven up as the
  // knee — and the splay is the thing that has to get out of the way on the way up, because a knee
  // comes up STRAIGHT: the abduction is all but gone (0.10) by the contact.
  poseLegAngles(bones, RK,
    kf(t, [[0, 0.02], [0.03, -0.20], [0.07, -0.60], [0.11, -1.08], [0.15, -1.52], [0.19, -1.82], [0.24, -1.95], [0.32, -1.92], [0.38, -1.62], [0.43, -1.38], [0.46, -1.74], [0.50, -2.20], [0.62, -2.05], [0.76, -0.60], [0.92, 0.04], [1, 0.02]]),
    kf(t, [[0, 0.10], [0.03, 0.90], [0.06, 1.70], [0.09, 2.30], [0.12, 2.70], [0.15, 2.88], [0.175, 2.90], [0.19, 0.45], [0.32, 0.28], [0.38, 0.60], [0.43, 1.60], [0.47, 2.20], [0.50, 2.45], [0.62, 2.36], [0.76, 1.00], [0.92, 0.18], [1, 0.10]]),
    kf(t, [[0, 0], [0.10, -0.10], [0.19, -0.18], [0.32, -0.14], [0.42, 0.20], [0.46, 0.44], [0.50, 0.58], [0.62, 0.50], [0.84, 0.14], [1, 0]]),
    kf(t, [[0, 0.06], [0.04, 0.16], [0.08, 0.26], [0.12, 0.38], [0.16, 0.60], [0.19, 0.84], [0.24, 0.95], [0.32, 0.95], [0.38, 0.64], [0.43, 0.32], [0.46, 0.16], [0.50, 0.10], [0.62, 0.12], [0.80, 0.10], [1, 0.06]]), e);
  // ...and the support leg takes both the sink and the rise: solved onto the deck the whole way, so
  // the foot never skates and the leg simply straightens under the hips as they come up (`legIK`
  // clamps at the limb's own reach, so an over-extension stands the heel rather than snapping it).
  poseLegIK(bones, LK, ANKLE_Z + kf(t, [[0, 0], [0.10, 0.08], [0.22, 0.10], [0.36, 0.04], [0.50, -0.05], [0.72, 0.02], [1, 0]]), ankleForSole(0) - hip, 0.18, e);

  // ---- THE COUNTERWEIGHT ----
  // The hands are OPEN for the sweep (a closed fist sweeping across the body reads as a punch that
  // missed) and shut for the knee. `upZ` is outward-positive on BOTH sides (`poseArmAngles`
  // multiplies it by the limb's own `side`), so the two arms are given the SAME sign and are
  // therefore thrown wide TOGETHER — the sweep's own gesture, and the trap is worth spelling out
  // here: feeding the pair opposite signs is what makes the two arms travel as each other's mirror
  // (the near one swinging out while the far one reaches across the chest), which is the opposite
  // of two arms spread for balance.
  poseArmAngles(bones, RK,
    kf(t, [[0, -0.45], [0.10, -1.02], [0.20, -1.12], [0.32, -0.92], [0.42, 0.20], [0.54, 0.76], [0.70, 0.46], [1, -0.35]]),
    kf(t, [[0, 0.30], [0.10, 0.72], [0.20, 0.96], [0.32, 0.84], [0.44, 0.76], [0.56, 0.56], [1, 0.30]]),
    kf(t, [[0, -1.25], [0.12, -2.20], [0.24, -2.10], [0.36, -1.62], [0.44, -1.05], [0.54, -1.52], [0.74, -1.34], [1, -1.30]]), e, 0.12);
  poseArmAngles(bones, LK,
    kf(t, [[0, -0.45], [0.10, -1.02], [0.20, -1.12], [0.32, -0.92], [0.42, 0.18], [0.54, 0.70], [0.70, 0.44], [1, -0.35]]),
    kf(t, [[0, 0.30], [0.10, 0.72], [0.20, 0.96], [0.32, 0.84], [0.44, 0.72], [0.56, 0.50], [1, 0.30]]),
    kf(t, [[0, -1.25], [0.12, -2.20], [0.24, -2.10], [0.36, -1.60], [0.44, -1.00], [0.54, -1.46], [0.74, -1.32], [1, -1.30]]), e, -0.12);

  // The leg is drawn LONG twice — once out through the sweep's arc and once up through the knee's
  // drive — because its reach is the whole of this move in both halves (the same accent the
  // standing knee and M1 #3's sweep take).
  poseStretchChain(bones, "leg", RK, kf(t, [[0, 1], [0.11, 1.04], [0.19, 1.12], [0.30, 1.11], [0.40, 1.05], [0.50, 1.15], [0.66, 1.12], [0.88, 1.02], [1, 1]]));
  poseGrip(bones, kf(t, [[0, 0.35], [0.10, 0.16], [0.34, 0.16], [0.44, 0.95], [0.84, 0.95], [1, 0.35]]), e);
}

// The four, in chain order. `start` is the move's start-up in SECONDS (when the strike
// connects) and `total` is the move's own clock; `player.js` reads them back through
// `charMesh.userData.combatMoves`, so the contact window it tests and the pose the body is
// wearing cannot drift apart.
//
// `key` is WHICH moment of the authored pose the contact is: each pose function above was
// keyed against a start-up/total ratio of its own (the knee's contact key is 0.345, the
// sweep's 0.308 …), and `poseAttack` warps the pose's clock so that key still lands exactly on
// `start / total`. That is what lets a move's recovery be shortened (the user's "make the
// animation faster") without touching a single authored key, and without the footgun of having
// to keep `start / total` equal to a magic number hidden in the pose.
//
// `spin` is how far the BODY turns through the move, in turns — the sweep is thrown off a
// pivot, so it whips the whole rig round once (`player.js` applies it to the rig, not to
// `facing`, so the aim and the hit wedge are untouched and the spin lands back on the target).
const COMBAT_MOVES = [
  { name: "KNEE", start: 0.17, total: 0.29, key: 0.345, spin: 0, pose: poseKnee },
  // The clinch used to be 0.38 / 0.78 — nearly twice the length of anything else in the chain, and
  // it read as a slow move in a fast string (the user's "increase the speed of the 2nd m1 make it
  // match the speed of the others"). Both numbers are scaled by the same factor (0.78 → 0.44, the
  // SWEEP's own total), so `start / total` is untouched and the authored pose plays at exactly the
  // shape it always did — just over a shorter clock. Sped up, its RELEASE also lands where the
  // enemy's own haul lets go (`E.GRAB_OFF` at `CLINCH_BEAT.hold` of the stun), so the two now agree
  // instead of the player still holding a head that had already been shoved off the knee.
  { name: "CLINCH", start: 0.214, total: 0.44, key: 0.459, spin: 0, pose: poseClinch },
  { name: "SWEEP", start: 0.25, total: 0.44, key: 0.308, spin: -1, pose: poseSweep },
  { name: "PUNCH", start: 0.20, total: 0.41, key: 0.60, spin: 0, pose: posePunch },
];

// THE 4th M1 THROWN IN THE AIR — the DOWN SLAM (see `poseDownSlam` above and `player.js`'s
// `attackMoveSpec`). It is a VARIANT of the PUNCH and not a fifth move: the chain cycle, the clash
// table and the enemy's own punch all still count four, and only `player.js`'s choice of descriptor
// changes when the finisher is thrown off the deck.
//
// `key` equals `start / total` (0.18 / 0.30 = 0.60, the pose's own contact key): the move is
// authored on its OWN clock so the rig's flip, the pose's unfolding and the contact frame are one
// decision rather than three. `total` is deliberately short — 0.30 s — because the airtime it is
// thrown into is short too: a jump only holds you up for about two thirds of a second, and the
// revolution alone is 0.18 s of that.
const DOWNSLAM_MOVE = { name: "DOWNSLAM", start: 0.18, total: 0.30, key: 0.60, spin: 0, pose: poseDownSlam };

// THE UPPERCUT — the SECOND move that rides the finisher's slot, and the other one that is not in
// the chain (see `player.js`'s `startUppercut`). It is the same bargain the DOWN SLAM makes: index
// 3 with its own descriptor, so the cycle, the clash table and the enemy's own punch still count
// four moves, and only `player.js`'s choice of descriptor changes when SPACE is held ON THE
// FINISHER'S SLOT (the gate is the press's — see `update` there — and not this table's).
//
// `key` equals `start / total` (0.30 / 0.60 = 0.50) exactly as the slam's does, so the warp in
// `poseAttack` is the identity and this pose is authored on the move's own clock: the leg sweep
// fills the start-up, the knee is at the top of its drive on the contact, and the recovery is the
// whole of the second half. `spin` is the sweep's own sign (-1, one whole turn the same way M1 #3
// pivots) but spent on ITS OWN KEYS (`UPPERCUT_SPIN_KEYS`): the turn is taken on the way up out of
// the sweep and is finished — and the body square again — by the contact, so the knee is thrown
// off a body that has stopped coming round.
const UPPERCUT_MOVE = { name: "UPPERCUT", start: 0.30, total: 0.60, key: 0.50, spin: -1, pose: poseUppercut };

function poseAttack(bones, u, move, t, slam, upper) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  // THE DOWN SLAM is a VARIANT of the finisher, not a fifth move (see `player.js`'s
  // `attackMoveSpec`): the 4th M1 thrown off the deck. It is authored on its own clock with its
  // contact key equal to its own `start / total`, so the warp below is the identity for it — which
  // is what lets the rig's flip (player.js's `attackFlip`, off `downSlamTurn`) and the pose's own
  // leg extension run off ONE clock instead of two.
  if (slam) { poseDownSlam(bones, Math.max(0, Math.min(1, t)), e); return; }
  // ...and THE UPPERCUT is the other variant (SPACE + M1 on the deck), on exactly the same terms:
  // its own descriptor, its own clock, its own authored contact key. Both are asked ahead of the
  // chain table, because neither of them is a row in it.
  if (upper) { poseUppercut(bones, Math.max(0, Math.min(1, t)), e); return; }
  const m = COMBAT_MOVES[move] || COMBAT_MOVES[0];
  const t0 = Math.max(0, Math.min(1, t));
  // Stretch the wind-up / squeeze the recovery so the authored contact key sits on `start/total`
  // (see the note on `key` above). Piecewise linear and continuous, through the anchor
  // (start/total, key): 0 → 0, to → key, 1 → 1. `t0` is the PLAY fraction (how far through the
  // move the body is) and `tt` what the pose is asked for.
  //
  // The two branches used to be written the other way round — `t0 <= key ? t0 * (to / key) : …`,
  // which anchors (key, to) instead — i.e. it applied the INVERSE of this map, so the authored
  // contact key was spent before the move's own start-up was over and every strike landed late,
  // mid-recovery. Measured on the punch, whose two are furthest apart (`key` 0.306, `to` 0.488):
  // the arm was at -1.17 rad and retracting at the contact against the -1.72 it was authored to
  // be at, so the fist was pulled back by the time the hit registered. The sleeves below are all
  // keyed against the faces this fixes (see "The move plays all the way out").
  const key = m.key;
  const to = m.start / m.total;
  const tt = t0 <= to
    ? t0 * (key / to)
    : key + (t0 - to) * ((1 - key) / Math.max(1e-4, 1 - to));
  m.pose(bones, Math.max(0, Math.min(1, tt)), e);
}

// How far through a move the body has turned, for the moves that spin (`m.spin`). Applied by
// `player.js` to the rig each frame; signed turns, and the last one lands back on a whole turn
// so the rig's yaw snaps to zero rather than to a stray angle.
//
// `upper`/`slam` are the variant flags `player.js` already holds (`attackUpper`/`attackSlam`) and
// they have to be handed in: those two moves ride the finisher's SLOT without being rows in
// `COMBAT_MOVES`, so without them the descriptor this reads would be the one-two's.
//
// The sweep's whip lives in the MIDDLE of its move — he is still square when the wind-up starts and
// square again by the time he stands up, so the turn cannot be seen to start or stop. The
// UPPERCUT's is the spin he takes on the way UP into the knee, and it is keyed rather than derived
// for the same reason: it has to be finished at the contact (a knee thrown off a body that is still
// coming round is a knee that points somewhere other than the wedge that fires), which the sweep's
// mid-move window would not do — it would still be turning on the contact frame.
const UPPERCUT_SPIN_KEYS = [[0, 0], [0.10, 0], [0.22, 0.06], [0.30, 0.26], [0.38, 0.62], [0.45, 0.90], [0.50, 1], [0.68, 1], [1, 1]];
function poseSpin(move, t, upper, slam) {
  const m = (upper && UPPERCUT_MOVE) || (slam && DOWNSLAM_MOVE) || COMBAT_MOVES[move];
  if (!m || !m.spin) return 0;
  const t0 = Math.max(0, Math.min(1, t));
  const a = m.key * 0.35;
  const b = m.key + (1 - m.key) * 0.62;
  const k = upper ? kf(t0, UPPERCUT_SPIN_KEYS)
    : t0 <= a ? 0 : t0 >= b ? 1 : poseEase((t0 - a) / (b - a));
  return m.spin * Math.PI * 2 * k;
}

// ---------------------------------------------------------------------------
// THE M1 CLASH — two strikes that arrive on the same beat.
//
// When the player's M1 and an enemy's M1 land together, neither of them lands at all: the two
// bodies lock at `player.js`'s `CLASH_DIST`, weapon against weapon, and the fight becomes a
// shoving match — whoever mashes M1 faster walks the other one backwards (see the block in
// player.js; the pair's own translation and the meters live there).
//
// This file owns the two SHAPES, and they are one function because they are one event:
//
//   * the player wears the move he brought, HELD at its contact key. The clash is the frame the
//     knee (or the fist, or the two hands, or the sweeping shin) met the other body's fist, so the
//     shape is the strike's own contact frame rather than a new pose — which is what makes the
//     pairing read "the fist and the knee" per variant without eight authored poses. Everything
//     the clash adds on top is DRIVE: the trunk folds over the weapon and the hips carry forward,
//     scaled by how much of the race this side has won and spiking on each press.
//
//   * the enemy wears the FIST, and it is solved onto the player's own weapon: `CLASH_POINT` is
//     written here every frame by `enemies.js` off the player's rig — the knee bone, the two hands,
//     the sweeping foot, the fist — in the enemy's frame, exactly the way the clinch's two hands
//     are solved onto a head (`CLINCH_HEAD`). That is what keeps the two weapons in the same place
//     whatever the player's move is and however far the shoving match has walked them, and it is
//     why the fist "tries to push" the knee: it is drawn ON it.
// ---------------------------------------------------------------------------

// Where the enemy's fist is driven when there is no live weapon point to solve onto (a rig that
// has not built yet — nothing that can clash is ever in that state, so these only exist so the
// function can never reach for the origin): the height of each of the four M1s' weapons, in the
// enemy's own frame, `z` forward.
const CLASH_FIST = [
  { x: 0.03, y: 1.00, z: 0.50 },   // the knee, held up in front
  { x: 0.03, y: 1.24, z: 0.52 },   // the clinch's two hands, up at head height
  { x: 0.20, y: 0.60, z: 0.54 },   // the sweep, low and across the midline
  { x: 0.03, y: 1.16, z: 0.54 },   // the fist
];

// ...and the STANCE this body fights the lock out of, per the player's move. It is not one stance
// because the four weapons are at four different heights: a knee and a fist are met standing, but
// a sweep is thrown out of a deep crouch with the shin a foot off the deck, and no standing body
// can put its fist on it — `ARM_LIMB` is what says so (measured: from a standing brace the fist
// reaches 1.17 short of the sweeping foot, against 0.04 for the knee). So the sweep is the one
// pairing where the free body has to come DOWN to meet it, which is also the most interesting
// shape of the four: a crouched brace with the fist reaching at the deck.
//   `hip`   the hips' own height (rig units; 1.0 is standing)
//   `lean`  how far the trunk folds over the fist
//   `lead`/`back` the two ankles, fore and aft of the hips
const CLASH_STANCE = [
  { hip: 0.955, lean: 0.26, lead: 0.30, back: -0.34, splay: 0.20 },
  { hip: 0.980, lean: 0.30, lead: 0.22, back: -0.30, splay: 0.22 },
  { hip: 0.480, lean: 0.90, lead: 0.42, back: -0.22, splay: 0.36 },
  { hip: 0.940, lean: 0.30, lead: 0.34, back: -0.36, splay: 0.24 },
];

// The player's weapon, live (see the block above): the point of his rig the enemy's fist is put on.
const CLASH_POINT = new THREE.Vector3();
let clashPointOk = false;

// The clash's drives are written with `poseAdd`, the pure ADD on a bone's angle — the one thing
// none of the helpers here can do (every helper above pulls a channel toward an absolute target,
// which at weight 1 replaces whatever the held move pose left there, and a clash is a drive on TOP
// of that pose). It lives up beside `poseRot` (session 183 hoisted it there so the ball actions
// could wear their layers additively too); it is scaled by POSEX like every other authored number,
// so the global dial reaches the clash as well.
// One clash frame, for one of the two bodies. `variant` is the PLAYER's move index (0-3) — the
// enemy's is always the punch, which is the same for all four pairings and so is not a parameter.
// `drive` is this side's share of the race (0..1) and `jolt` the decaying spike a single press
// puts on it (`CLASH_JOLT_T` in player.js), and `u` is the clash's own clock in seconds, used only
// for the judder — two bodies straining against each other are never quite still.
function poseClash(bones, role, variant, u, drive, jolt) {
  const v = Math.max(0, Math.min(COMBAT_MOVES.length - 1, variant | 0));
  const d = Math.max(0, Math.min(1, drive || 0));
  const j = Math.max(0, Math.min(1, jolt || 0));
  const shake = j * Math.sin((u || 0) * 46);

  if (role === "player") {
    // The move he brought, held on its own contact frame (see the block above). Nothing else in
    // the rig is written, so a clash that starts mid-move starts from the strike it was already
    // wearing — the two frames are the same one.
    const m = COMBAT_MOVES[v];
    m.pose(bones, m.key, 1);
    // The drive: the trunk folds over the weapon, the head comes down behind it, and the whole body
    // leans in (`P.CLASH_LEAN`, in `updateVisual`). The shove is on the FRONT of a press and gone by
    // the back of it, so it rides `j` rather than `d`.
    //
    // Everything here is a ROTATION, and every channel it touches is one the held move's own pose
    // already writes outright on this frame (see `poseAttack`'s table): an additive drive on a
    // channel nobody resets would accumulate frame after frame and walk the body off its own rig.
    poseAdd(bones, "torso", "x", 0.10 * d + 0.11 * j, 1);
    poseAdd(bones, "torso", "z", 0.035 * shake, 1);
    poseAdd(bones, "head", "x", -0.10 * d - 0.07 * j, 1);
    poseAdd(bones, "hips", "x", 0.05 * d + 0.06 * j, 1);
    return;
  }

  // THE OTHER SIDE. A braced push-off out of the stance its own move calls for (see
  // `CLASH_STANCE` — the sweep is the one that has to come down to the deck to meet the leg): the
  // lead foot is planted at the player, the rear foot is back and driving, the trunk is folded in
  // over the fist (the shoulder is what puts the arm's reach on the point) and the free arm is
  // tucked in as a counterweight.
  const S = CLASH_STANCE[v] || CLASH_STANCE[0];
  const hip = S.hip - 0.02 * d - 0.015 * j;
  poseHipY(bones, hip, 1);
  poseRot(bones, "hips", "x", 0, 1);
  poseRot(bones, "hips", "y", 0.10, 1);
  poseRot(bones, "hips", "z", 0, 1);
  poseRot(bones, "torso", "x", S.lean + 0.18 * d + 0.15 * j, 1);
  poseRot(bones, "torso", "y", -0.12, 1);
  poseRot(bones, "torso", "z", 0.03 * shake, 1);
  poseSettleTorso(bones, 1);
  poseRot(bones, "head", "x", -0.26 - 0.06 * j, 1);
  poseRot(bones, "head", "y", 0.06, 1);
  poseRot(bones, "head", "z", 0, 1);
  poseLegIK(bones, LK, ANKLE_Z + S.lead, ankleForSole(0) - hip, S.splay, 1);
  poseLegIK(bones, RK, ANKLE_Z + S.back, ankleForSole(0) - hip, S.splay * 1.3, 1);
  // The punching arm, on the player's weapon (see the block above): the whole point of the pairing.
  const F = CLASH_FIST[v];
  if (clashPointOk) poseArmReach(bones, RK, 1, CLASH_POINT.x, CLASH_POINT.y, CLASH_POINT.z);
  else poseArmReach(bones, RK, 1, F.x, F.y, F.z);
  // ...and the guard arm braces the lock from behind the fist.
  poseArmAngles(bones, LK, -0.80 - 0.18 * d, 0.50, -1.85, 1, 0.10);
  poseGrip(bones, 1, 1);
}

// ---------------------------------------------------------------------------
// THE MACACO — the slide's own M1.
//
// A slide is the one way to arrive at a body already moving, so its M1 is not another swing: it is
// the capoeira escape that turns the slide's momentum into a throw. The body plants a hand, whips
// over it, and the legs come up and through whatever the slide just took off its feet — which is
// why the move only exists on a body that is already RAGDOLLING and off the deck (see `startMacaco`
// in player.js): a macaco is a throw on something already in the air, not a strike.
//
// The whole move is two curves, and they are shared with `player.js` (which spends one on the
// rig's own rotation and one on its lift above the deck) because the POSE has to be built on them:
//
//   * `MACACO_TURN(u)` — how much of the way over the body is, 0..1. It is a FORWARD turn about
//     the hips (the same axis a roll winds about), completed inside the move so the body is back
//     on its feet before the clock runs out; the last fifth is the landing crouch.
//   * `MACACO_LIFT(u)` — how far the hips come off the deck, as a fraction of the standing hip
//     height. It is what carries the body over the planted hand: with no lift a body turned over
//     at the hips puts its own head through the pavement.
//
// ...and the arms are keyed to COUNTER-ROTATE against the turn: a hand stays on the deck through
// the plant only if the arm's own angle follows the body's, so `plant(u)` is authored as
// `-turn + bend`, where the bend is the elbow's share of the reach. Everything else — the legs
// whipping through, the trunk curling, the free arm thrown wide — is keyed off the same clock.
const MACACO_TURN_KEYS = [[0, 0], [0.10, 0.02], [0.24, 0.26], [0.42, 0.60], [0.60, 0.86], [0.78, 1], [1, 1]];
// ...and this curve is MEASURED rather than authored, because it is the one channel that has to
// obey the deck: it is the smallest lift that keeps the body's lowest vertex off the pavement at
// every point of the move. It was swept against a rig probe (per-mesh world bounding box against
// the deck, in `player.js`'s own world units) and the two places it has to work are the two the
// shape cannot fix on its own — the inversion, where the planted arm and then the head sweep the
// deck (hence the hump that peaks around the fling's own contact frame, which is also what puts the
// reaching hand ON the deck instead of through it), and the landing, where the trailing foot
// arrives early (0.72-0.94). Everything else is the old authored arc. Do not hand-edit this
// without re-running the probe; a key that looks high here is a key a measurement put there.
const MACACO_LIFT_KEYS = [
  [0, 0.000], [0.04, 0.035], [0.08, 0.084], [0.10, 0.105], [0.14, 0.100],
  [0.20, 0.159], [0.24, 0.230], [0.26, 0.290], [0.28, 0.410], [0.30, 0.520],
  [0.32, 0.505], [0.34, 0.531], [0.36, 0.476], [0.38, 0.353], [0.42, 0.296],
  [0.48, 0.294], [0.54, 0.262], [0.60, 0.227], [0.66, 0.190], [0.72, 0.155],
  [0.80, 0.145], [0.86, 0.117], [0.90, 0.108], [0.94, 0.066], [0.98, 0.010],
  [1, 0.000],
];
const MACACO_TURN = (u) => kf(u, MACACO_TURN_KEYS);
const MACACO_LIFT = (u) => kf(u, MACACO_LIFT_KEYS);

function poseMacaco(bones, u, e) {
  const turn = MACACO_TURN(u);
  const lift = MACACO_LIFT(u);
  // The hips sit low at the two ends (the entry and the landing are both a crouch) and come to
  // their standing height as the body goes over — the whole move is one drop and one rise.
  const hip = kf(u, [[0, 0.80], [0.20, 0.74], [0.42, 0.92], [0.62, 0.98], [0.82, 0.86], [1, 0.78]]);
  poseHipY(bones, hip, e);
  // The turn itself is the rig's (`player.js`), so the bones here only shape the body ON it: the
  // trunk curls into the tuck and comes out of it as the feet come down.
  poseRot(bones, "hips", "x", kf(u, [[0, 0.10], [0.3, 0.30], [0.55, 0.34], [0.8, 0.16], [1, 0.06]]), e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", kf(u, [[0, 0], [0.3, -0.12], [0.6, 0.14], [1, 0]]), e);
  poseRot(bones, "torso", "x", kf(u, [[0, 0.34], [0.24, 0.52], [0.5, 0.30], [0.72, -0.10], [1, 0.20]]), e);
  poseRot(bones, "torso", "y", kf(u, [[0, -0.10], [0.45, 0.40], [0.75, 0.18], [1, -0.06]]), e);
  poseRot(bones, "torso", "z", kf(u, [[0, 0], [0.45, 0.16], [0.8, -0.06], [1, 0]]), e);
  poseSettleTorso(bones, e);
  // The head looks along the move: down at the deck on the way in (a macaco is thrown blind), then
  // up and through, then at the ground he is about to land on.
  poseRot(bones, "head", "x", kf(u, [[0, 0.30], [0.3, 0.44], [0.56, 0.10], [0.82, -0.20], [1, 0.16]]), e);
  poseRot(bones, "head", "y", kf(u, [[0, 0.16], [0.5, -0.26], [1, 0.10]]), e);
  poseRot(bones, "head", "z", 0, e);

  // THE PLANT: the reach counter-rotates with the turn, so between `plantA` and `plantB` the hands
  // are on the deck while the body sweeps over them.
  const plant = kf(u, [[0, 0], [0.16, 0.55], [0.30, 1], [0.62, 1], [0.80, 0.45], [1, 0]]);
  const over = turn * Math.PI * 2;
  const bend = kf(u, [[0, 0.45], [0.3, 0.55], [0.62, 0.62], [1, 0.45]]);
  const upX = -(over + bend) * plant;
  const elbow = kf(u, [[0, -0.60], [0.20, -0.95], [0.42, -0.55], [0.62, -0.70], [0.82, -1.30], [1, -0.70]]);
  // The two arms are not the same arm: the far one is thrown wide and up as the counterweight to
  // the turn (the capoeira read is one hand down and the other grabbing at the sky), the near one
  // is the planted hand.
  const wide = kf(u, [[0, 0.30], [0.3, 0.80], [0.58, 1.05], [0.8, 0.45], [1, 0.30]]);
  poseArmAngles(bones, RK, upX, wide, elbow, e, -0.20);
  poseArmAngles(bones, LK, upX * 0.86, wide * 0.42, elbow * 1.12, e, 0.20);
  poseGrip(bones, kf(u, [[0, 0.5], [0.3, 0.9], [0.7, 0.6], [1, 0.5]]), e);

  // THE LEGS: tucked at the entry, then thrown out and through at the top of the arc (this is the
  // half that flings the body the slide took off its feet), then folded under for the landing.
  // The two legs are offset ON THE CLOCK rather than by a couple of degrees, which is the whole
  // difference between a cartwheel and a squat: the far leg is a seventh of the move ahead of the
  // near one, so they scissor through the top instead of moving as one piece.
  const legAt = (t) => ({
    thigh: kf(t, [[0, 0.10], [0.18, -0.30], [0.34, -1.05], [0.50, -1.30], [0.68, -0.85], [0.84, -0.25], [1, 0.10]]),
    knee: kf(t, [[0, 0.30], [0.18, 1.20], [0.34, 1.70], [0.50, 1.35], [0.68, 0.90], [0.84, 0.70], [1, 0.30]]),
    sole: kf(t, [[0, 0.10], [0.3, -0.25], [0.55, -0.30], [0.8, 0.20], [1, 0.30]]),
    splay: kf(t, [[0, 0.10], [0.18, 0.28], [0.34, 0.55], [0.5, 0.72], [0.7, 0.40], [1, 0.10]]),
  });
  //
  // ...but the two ENDS of the move are on the body's own feet — the entry crouch before the hand
  // goes down and the landing after it comes back up — and those two shapes are SOLVED against the
  // deck rather than keyed. A keyed leg puts the sole wherever its angle chain happens to land,
  // and at a hip height of 0.80 with near-straight legs that is a third of a body-length through
  // the pavement (measured: the sole 0.33 under the deck at the entry). So the planted ends take
  // the SAME two-bone solve the idle and the crouch wear — the ankle held a `ankleForSole(0)` below
  // the hips, which is what puts the sole's lowest point exactly on the deck — and the whip shape
  // is what is blended in over it. `legIK` emits RAW angles while `poseLegAngles` scales what it is
  // handed by POSEX, so dividing it back out is what makes the two agree (same as `poseHurtSweep`).
  const footPlant = kf(u, [[0, 1], [0.12, 0.85], [0.26, 0.15], [0.72, 0.1], [0.86, 0.7], [1, 1]]);
  const ik = legIK(ANKLE_Z, ankleForSole(0) - hip);
  const planted = [ik.thigh / POSEX, ik.knee / POSEX, -(ik.thigh + ik.knee) / POSEX];
  const near = legAt(u);
  const far = legAt(Math.max(0, Math.min(1, u - 0.14)));
  const wf = 1 - footPlant;
  const mix = (x, k) => x + (k - x) * wf;
  poseLegAngles(bones, RK, mix(planted[0], near.thigh), mix(planted[1], near.knee), mix(planted[2], near.sole), mix(0.10, near.splay), e);
  poseLegAngles(bones, LK, mix(planted[0], far.thigh * 0.92), mix(planted[1], far.knee * 0.94), mix(planted[2], far.sole * 0.9), mix(0.10, far.splay * 1.15), e);
}

// ---------------------------------------------------------------------------
// THE THREE SKILLS (see "The HUD dial" in src/README.md, and `player.js`'s `whirl` / `scissor` /
// `capoeira`).
//
//   skill 1 — the WHIRL, the LETHAL WHIRLWIND STREAM. He LUNGES in and takes a body by the NECK,
//             whips it round the floor in a WHIRLWIND, SLAMS it into the deck and LAUNCHES the
//             wreckage back into the air (see `player.whirl`). The hold is SOLVED onto the neck —
//             the same two-bone reach the clinch's hands are placed with — so the palm stays on
//             the throat while the body is whirled and the arm never reaches at where the head
//             used to be. A lunge that finds nothing plays the startup out and simply stops.
//   skill 2 — the SCISSOR. A guard, a leap, and both legs closing on the neck; then the twist
//             that puts the body on the deck. The guard is the counter: a fist that lands inside
//             it is BLOCKED (see `player.scissorCatch`) and the move turns straight onto whoever
//             threw it.
//   skill 3 — the LAUNCH. He coils on the spot (a real hold, with a shake in the legs), then both
//             legs snap up through a rising kick, the legs SNAPPING OUT longer than they are at the
//             top (the limb stretch's headline). The frame the boot lands is the frame he leaves the
//             ground — the body it caught is dragged up with him, pinned by the FACE to his soles,
//             and the air combo opens on it (see `P.CAPO_JUMP` / `P.CAPO_AIR_T`).
//
// Each is split into PHASES on `ph` (the current phase's own progress) rather than keyed on the
// whole clock, so the shape follows the clock whatever `P` says the phases are worth — every
// phase opens and closes on the same station as its neighbour, so the handovers are continuous
// without a table of magic fractions in here. Every pose here is ABSOLUTE (written at weight 1,
// like the chain's): the layer stack in `player.js` owns the fades.
// ---------------------------------------------------------------------------

// The whirl's live hold: the neck of the body it has by the throat, in the player's own frame,
// written every frame by `player.js` (the same bargain as `CLINCH_HEAD`).
const WHIRL_NECK = new THREE.Vector3();
let whirlNeckOk = false;

const WHIRL = {
  // ---- the STARTUP (the user's stage 1): the coil on the spot before the drive — both knees
  // bent with the weight on the right foot, the lead arm cocked BACK with the elbow at ~90°, the
  // other kept in close, the head level and slightly down, the energy forming on both hands.
  startupAt: 0.34,     // ...which is the same fraction of the lunge that `P.WHIRL_STARTUP` is
  startupHip: 0.86,
  startupLean: 0.20,
  startupHead: 0.12,
  cockX: 0.72,         // the right arm, swung back and up
  cockZ: 0.46,
  cockE: -1.50,        // ...at ~90° of elbow
  closeX: -0.14,       // the left arm, kept close to the body with the hand open
  closeZ: 0.24,
  closeE: -0.86,
  // ---- the LUNGE (the rest of the phase): the drive in, both hands out for the throat and the
  // chest — the lead takes the neck, the other lands on the shoulder a beat later, which is the
  // same pair the whole move is held with.
  lungeHip: 0.84,
  lungeLean: 0.52,
  lungeHead: 0.16,
  leadX: -1.30,        // the right hand: out for the throat, in `poseArmAngles` units
  leadZ: 0.06,         // (past -PI/2 is overhead)
  leadE: -0.52,
  supportX: -0.88,     // ...and the left, out and a touch lower — the second hand of the grab
  supportZ: 0.34,
  supportE: -0.95,
  // ---- the WHIRLWIND: the BEYBLADE — he spins on the body he has rolled over and pinned on the
  // deck under his own boots (`WHIRL_TOP_R`, `WHIRL_TOP_FLIP`), so the trunk rides TALL and
  // square over it rather than bent over it. The "under his boots" is the user's own read of the
  // beat and it is what the STANCE does: see `spinHip`/`spinStagger`/`spinSplay` below — the legs
  // are not the run's any more, they are a wide braced stance, planted, grinding round with the
  // rig's turn. The free arm starts on the body's shoulder (a GRIP) and opens out into a wide
  // LEVEL arc — the LARIAT the whirl grew out of — across the first half of the spin.
  dragLean: 0.24,      // the whirlwind's trunk: a little forward of upright, spinning ON the body
  dragHead: -0.10,     // ...with the chin down on it (the hip is `spinHip` below — the stance's)
  // ...and the stance itself (see the `spin` legs in `poseWhirl`). These four are the whole shape:
  // a lower hip than the standing line so the splay has something to bend into, both legs rolled
  // out wide off the midline, and the right foot thrown forward of the left so the stance has a
  // FRONT to it — a square star would read as a pose, a staggered brace reads as a man on top of
  // something. The left is the one driven back, i.e. the pair straddles the body under him.
  spinHip: 0.86,       // rig units — ~0.14 below standing, so both knees carry a visible load
  spinStagger: 0.18,   // ...and how far apart fore/aft the two feet are set (each way from centre)
  spinSplay: 0.24,     // ...and how far out to the sides the whole legs roll (the wide part)
  spinLift: 0.031,     // the rolled-sole compensation the planted target takes out (see below)
  lariatX: -0.30,      // the free (left) arm at full lariat: out, level, and a touch back
  lariatZ: 1.30,
  lariatE: -0.24,
  // ---- THE HAUL: the beat between the grab and the spin, where the body is dragged across the
  // deck head-first (see `P.WHIRL_SCRAPE_T` and the phase-6 shape in `poseWhirl`). This is the
  // one pose in the move that is BENT OVER: the trunk is folded down over the body he is hauling
  // and the hips ride low, because the thing on the end of his arm is on the FLOOR — the spin
  // stands tall because by then the body is under his feet, not on the end of his arm. `lean` is
  // the authored number, so the drawn bend is `POSEX` of it (1.24 rad of the 1.55 written here, i.e. about 70°: enough that
  // the shoulder is over the thing he is pulling, which is the one posture a haul has).
  skimHip: 0.74,
  skimLean: 1.55,
  skimHead: 0.55,      // the chin down on it, watching what he is dragging
  skimTwist: -0.17,    // ...and the right shoulder turned onto it, which is the side that has it
  skimBrace: 0.52,     // the walk's own stride, as a fraction of the run's (mirrors `P.WHIRL_SKIM_BRACE`)
  skimArmX: 0.62,      // the free (left) arm, thrown BACK and up as the counterweight
  skimArmZ: 0.45,
  skimArmE: -0.85,
  skimGrabY: 0.05,     // ...and where the palm sits relative to the head point through the haul. It is
                       //    nearly ON it, because with the body laid out FLAT (`SKIM_SHAPE`) the
                       //    neck is not above the skull the way it is while the body hangs doubled
                       //    over its own throat — the grip IS the head, which is what the beat is:
                       //    a man with his hand across the back of a skull, skinning it on the
                       //    pavement
  gripX: -1.08,        // the left hand ON the body: out, high and folded in
  gripZ: 0.16,
  gripE: -1.22,
  reelX: -0.32,        // ...and with nothing in the hand, swung out LEVEL
  reelZ: 1.22,
  reelE: -0.30,
  // ---- the SLAM: the PREP (a deep crouch with the torso coiled BACK, the body hoisted on the
  // holding arm) and the DRIVE (the legs straighten with power under a torso folded hard over it,
  // both arms pushing it down into the deck) ----
  hoistHip: 0.70,
  hoistLean: -0.14,
  slamHip: 0.94,
  slamLean: 1.72,
  slamHead: 0.40,
  slamHit: 0.50,       // where the drive REACHES the deck, as a fraction of the phase — a mirror
                       // of `P.WHIRL_SLAM_HIT`, which is where the impact itself fires
  slamArmLX: -0.52,    // ...where the two arms END the drive (the launch opens on the same pair)
  slamArmLZ: 0.24,
  slamArmLE: -0.32,
  slamArmRX: -1.46,
  slamArmRZ: 0.10,
  slamArmRE: -0.58,
  // ---- the ELBOW (the finisher's follow-up, on a body under `P.WHIRL_FINISH_HP`) ----
  elbowHip: 0.70,
  elbowLean: 1.96,
  elbowHead: 0.46,
  // ---- the authored hold (the fallback for a frame with no live neck in it) ----
  handX: 0.12,         // in rig units (+z is the way the rig faces): where the
  handY: 1.16,         // right hand goes on a frame that has no body in it
  handZ: 0.86,
  grabY: -0.10,        // ...and where the palm sits relative to the neck point that IS written
};

function poseWhirl(bones, e, u, phase, ph, cycle, hold) {
  // 0 LUNGE · 6 THE HAUL · 1 WHIRLWIND · 2 SLAM · 3 LAUNCH · 4 WHIFF TAIL · 5 ELBOW. The phases
  // open and close on the same stations as their neighbours, so the five read as ONE move rather
  // than five. 6 is out of numeric order on purpose: it was added between the first two beats and
  // the numbers were already the interface between this pose and `player.whirlPhase` (and the
  // impacts), so a new id is cheaper and safer than renumbering every branch in both files.
  // The LEGS are carried by the run cycle on ONE of the two moving beats and by a stance of its
  // own on the other. The HAUL strides (it is a walk, dragging something heavy), and the WHIRLWIND
  // does NOT: it gets a wide, braced, PLANTED stance (see the `spin` legs below), because a run
  // cycle exists to carry a moving centre of mass and a man planted on top of a body he is
  // whipping round has none. That mismatch is why the whirlwind used to read as a forward walk.
  const run = phase === 6;
  const spin = phase === 1;
  // ...and the one blend the shape needs: the WHIRLWIND's free arm opens from the GRIP that tore
  // the body off the haul out into a wide level LARIAT as the spin builds (see the arms below).
  const blend = (a, b, k) => a + (b - a) * k;
  const su = WHIRL.startupAt;
  let hip, lean, head, twist;
  if (phase === 0) {
    // THE STARTUP AND THE LUNGE: the coil (stage 1) and then the drive in. `su` is the same
    // fraction `P.WHIRL_STARTUP` is of the phase, so the shape, the arm timing and the drive ramp
    // in `player.updateWhirl` are three reads of one boundary.
    hip = kf(ph, [[0, 1.00], [su, WHIRL.startupHip], [1, WHIRL.lungeHip]]);
    lean = kf(ph, [[0, 0.06], [su, WHIRL.startupLean], [1, WHIRL.lungeLean]]);
    head = kf(ph, [[0, 0.02], [su, WHIRL.startupHead], [1, WHIRL.lungeHead]]);
    twist = kf(ph, [[0, 0], [su, 0.12], [1, -0.12]]);
  } else if (phase === 6) {
    // THE HAUL — the user's *"drags the enemy head across the ground"*. He is BENT OVER the body
    // on the end of his arm (it is on the floor, not in the air) and walking into it: the trunk
    // folded down over it, the chin on it, the right shoulder turned onto it, and the frame
    // leaning into the drive the way a man leaning on something heavy does. The legs are the RUN's
    // own (see `run`), played at `WHIRL.skimBrace` — a shorter, heavier stride than the spin's —
    // and advanced off the speed actually travelled, so the walk never skates.
    hip = WHIRL.skimHip;
    lean = WHIRL.skimLean;
    head = WHIRL.skimHead;
    twist = WHIRL.skimTwist;
  } else if (spin) {
    // THE WHIRLWIND: the BEYBLADE. He is planted TALL on top of the body — the stance is doing the
    // work (see the legs below), so the trunk is only a little forward of upright with the chin
    // down on the thing under his boots, and it rides square to the world (no `twist`: the RIG is
    // the thing turning, and a second twist on the trunk would fight it).
    hip = WHIRL.spinHip;
    lean = WHIRL.dragLean;
    head = WHIRL.dragHead;
    twist = 0;
  } else if (phase === 2) {
    // THE PREP then THE DRIVE. The crouch deepens and the torso coils BACK over the body being
    // hoisted (the user's "both legs bend deeply ... torso coils backward"), then the legs drive
    // straight under a trunk folded hard over it — and the drive reaches the deck exactly on the
    // impact, which is the user's own boundary between the two.
    const up = Math.min(1, ph / 0.34);
    const dn = Math.max(0, Math.min(1, (ph - 0.34) / Math.max(1e-3, WHIRL.slamHit - 0.34)));
    // ...and the phase OPENS on the WHIRLWIND's own hip, not the haul's: phase 1 now ends on
    // `spinHip` (0.86) rather than `dragHip` (0.95), so starting here from the old number would
    // pop the whole body 0.09 u on the first frame of the slam.
    const from = WHIRL.spinHip;
    hip = from + (WHIRL.hoistHip - from) * up + (WHIRL.slamHip - WHIRL.hoistHip) * dn;
    lean = WHIRL.dragLean + (WHIRL.hoistLean - WHIRL.dragLean) * up + (WHIRL.slamLean - WHIRL.hoistLean) * dn;
    head = WHIRL.dragHead + (0.10 - WHIRL.dragHead) * up + (WHIRL.slamHead - 0.10) * dn;
    twist = 0;
  } else if (phase === 5) {
    // THE ELBOW: the arm winds, then the whole body drives the elbow into the deck.
    const wind = Math.min(1, ph / 0.50);
    const drive = Math.max(0, Math.min(1, (ph - 0.50) / 0.34));
    hip = WHIRL.slamHip + 0.16 * wind + (WHIRL.elbowHip - WHIRL.slamHip - 0.16) * drive;
    lean = WHIRL.slamLean - 0.30 * wind + (WHIRL.elbowLean - WHIRL.slamLean + 0.30) * drive;
    head = WHIRL.slamHead - 0.10 * wind + (WHIRL.elbowHead - WHIRL.slamHead + 0.10) * drive;
    twist = 0;
  } else {
    // LAUNCH (3) and the WHIFF TAIL (4): up out of the fold, back onto his feet. The whiff's tail
    // opens on the WHIRLWIND's own hip (see the note in phase 2), not the haul's — a whiff never
    // has a haul, and phase 1 is where it is coming from.
    const from = phase === 3 ? WHIRL.slamHip : WHIRL.spinHip;
    const leanFrom = phase === 3 ? WHIRL.slamLean : WHIRL.dragLean;
    const headFrom = phase === 3 ? WHIRL.slamHead : WHIRL.dragHead;
    hip = kf(ph, [[0, from], [0.55, 0.99], [1, 1.00]]);
    lean = kf(ph, [[0, leanFrom], [0.55, 0.12], [1, 0.06]]);
    head = kf(ph, [[0, headFrom], [0.55, -0.04], [1, 0.00]]);
    twist = kf(ph, [[0, 0], [0.55, 0.06], [1, 0]]);
  }

  if (run) {
    // The legs are the RUN's own — a man dragging a body across the deck at six units a second is
    // walking, and the run cycle is already solved not to skate. `cycle` is that cycle's phase,
    // handed in by `player.js` off the speed actually being travelled. Everything the run writes
    // above the hips is overridden below. It plays at `WHIRL.skimBrace`: the body is on the FLOOR
    // for this beat, so his stride is the short, heavy one of a man hauling something, not the long
    // one of a runner. (The WHIRLWIND is not this case any more — see the `spin` legs below.)
    poseRun(bones, cycle, 1, WHIRL.skimBrace);
  } else {
    poseHipY(bones, hip, e);
  }
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", twist * 0.4, e);
  poseRot(bones, "hips", "z", 0, e);
  poseRot(bones, "torso", "x", lean, e);
  poseRot(bones, "torso", "y", twist, e);
  poseRot(bones, "torso", "z", twist * -0.45, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", head, e);
  poseRot(bones, "head", "y", twist * 0.5, e);
  poseRot(bones, "head", "z", 0, e);

  // ---- the legs (when the run is not carrying them) ----
  if (!run) {
    const flat = ankleForSole(0) - hip;
    if (phase === 0) {
      // THE STARTUP AND THE LUNGE: a short, bent stance to coil on, opening into a long stride —
      // the lead foot out, the trailing leg driven back behind it.
      const w = poseEase(ph);
      poseLegIK(bones, RK, ANKLE_Z + 0.10 + 0.60 * w, flat, 0.14, e);
      poseLegIK(bones, LK, ANKLE_Z - 0.12 - 0.48 * w, flat, 0.24, e);
    } else if (spin) {
      // THE WHIRLWIND'S OWN STANCE — the beat the whole move is named after, and the one place in
      // the game where the legs are neither a run cycle nor a step: he is PLANTED, on top of a
      // body, whipping round. A run cycle reads as a forward walk here (it carries a moving centre
      // of mass and there is none), so the stance is authored: both legs SPLAYED wide off the
      // midline, the right foot forward and the left driven back, the knees loaded over them, and
      // the weight sunk far enough that the splay has something to bend into.
      //
      // The feet are solved with `poseLegIKOn` rather than `poseLegIK` because the splay is a roll
      // of the whole leg and a rolled leg loses `cos(splay)` of its vertical reach — measured at
      // the scissor's 0.46, the plain solve leaves the ankle 0.11 u short of and ABOVE the target,
      // i.e. a wide stance hovering a hand's width off the deck. `poseLegIKOn` measures where the
      // drawn ankle actually landed and asks again, so the wide stance is planted like a narrow one.
      //
      // ...and the stance GRINDS rather than steps: `cycle` (the stride clock, advanced off the
      // speed actually travelled) drives a small fore/aft pump and a matching knee load, which is
      // the weight going round on the balls of the feet. It is a pump on purpose — a stride here
      // would be a step, and a man on top of a body does not step.
      const g = Math.sin(cycle * Math.PI * 2);
      const load = 0.5 + 0.5 * g;                 // 0..1, which foot is carrying him right now
      // ...and `plant` rather than `flat` for the ankle height: a legs-rolled-out stance tips the
      // SOLE too (`poseLegIK` zeroes the foot's own roll, so the foot keeps the leg's `splay` in
      // world — it stands on its outer edge), which drops that edge below the deck by about
      // `splay` × the foot's half-width. `WHIRL.spinLift` is that drop, taken out of the target so
      // the planted edge of the foot is ON the deck rather than in it.
      const plant = flat + WHIRL.spinLift;
      poseLegIKOn(bones, RK, ANKLE_Z + WHIRL.spinStagger + 0.055 * g, plant, WHIRL.spinSplay * (1 - 0.10 * load), e);
      poseLegIKOn(bones, LK, ANKLE_Z - WHIRL.spinStagger - 0.055 * g, plant, WHIRL.spinSplay * (1 - 0.10 * (1 - load)), e);
    } else if (phase === 5) {
      // THE ELBOW: planted WIDE and deep — the base the elbow is driven off.
      poseLegIK(bones, RK, ANKLE_Z + 0.32, flat, 0.34, e);
      poseLegIK(bones, LK, ANKLE_Z - 0.32, flat, 0.46, e);
    } else {
      // The SLAM and after: the feet are planted under him, a touch wider as the drive lands.
      const w = kf(ph, [[0, 0.80], [1, 1.00]]);
      poseLegIK(bones, RK, ANKLE_Z + 0.14 + 0.20 * w, flat, 0.18, e);
      poseLegIK(bones, LK, ANKLE_Z - 0.18 - 0.18 * w, flat, 0.30, e);
    }
  }

  // ---- the arms ----
  // The swing is written first in EVERY phase: it is what the arms are doing when there is no body
  // in the hand, so a frame that loses the target falls back to it rather than to the origin. The
  // hold is then blended ON TOP (the reach is a slerp, so `hold` is a real blend between the two
  // shapes rather than a snap).
  if (phase === 0) {
    // THE STARTUP: the lead arm cocks BACK and up at ~90° of elbow while the other stays in close.
    // THE LUNGE: both hands go out — the right for the throat, the left for the shoulder.
    poseArmAngles(bones, RK,
      kf(ph, [[0, 0.10], [su, WHIRL.cockX], [su + (1 - su) * 0.30, WHIRL.cockX * 0.35], [1, WHIRL.leadX]]),
      kf(ph, [[0, 0.95], [su, WHIRL.cockZ], [su + (1 - su) * 0.30, 0.56], [1, WHIRL.leadZ]]),
      kf(ph, [[0, -0.40], [su, WHIRL.cockE], [su + (1 - su) * 0.30, -1.05], [1, WHIRL.leadE]]), e);
    poseArmAngles(bones, LK,
      kf(ph, [[0, 0.10], [su, WHIRL.closeX], [1, WHIRL.supportX]]),
      kf(ph, [[0, 0.90], [su, WHIRL.closeZ], [1, WHIRL.supportZ]]),
      kf(ph, [[0, -0.40], [su, WHIRL.closeE], [1, WHIRL.supportE]]), e);
  } else if (phase === 6) {
    // THE HAUL. The right hand is on the neck — the solved reach takes it from here, exactly as it
    // does through the spin, so those two lines are the fallback for a frame that has nothing in
    // the hand. The FREE arm is the read: thrown back and up off the drive, the counterweight of a
    // man hauling something heavy along the floor on the end of one arm.
    poseArmAngles(bones, LK, WHIRL.skimArmX, WHIRL.skimArmZ, WHIRL.skimArmE, e);
    poseArmAngles(bones, RK, WHIRL.leadX, WHIRL.leadZ, WHIRL.leadE, e);
  } else if (spin) {
    // THE WHIRLWIND. The right hand is on the throat (the solved reach takes it from here). The
    // FREE arm is the read of the beat: it starts ON the body — the grip that tore it off the haul,
    // the user's "left hand grabs the enemy's left shoulder or upper chest for control" — and OPENS
    // OUT into the LARIAT over the first half of the spin, a wide level arc thrown away from the
    // body as he whips round. That opening is the user's own prescription for this beat: *"a wide
    // braced stance with the free arm out as a lariat"*. With nothing in the hands (a whiff) `arc`
    // simply starts higher, so the whiff comes out of the spin with the arc already out.
    const arc = Math.max(0, Math.min(1, (ph - 0.16) / 0.5));
    poseArmAngles(bones, LK,
      blend(WHIRL.gripX, WHIRL.lariatX, arc),
      blend(WHIRL.gripZ, WHIRL.lariatZ, arc),
      blend(WHIRL.gripE, WHIRL.lariatE, arc),
      e, -0.22 * arc);
    // The fallback is where the LUNGE left the hand, so a WHIFF's handover into the spin is
    // continuous (the grabbed case is the solved reach and never sees this line).
    poseArmAngles(bones, RK, WHIRL.leadX, WHIRL.leadZ, WHIRL.leadE, e);
  } else if (phase === 2) {
    // THE SLAM. Both hands are on the body, so both arms drive it DOWN: the prep lifts it, and on
    // the drive they carry it into the deck — the left, in the user's words, "pushes the enemy's
    // torso into the ground". Nothing winds overhead; the weight is the whole of the read. The
    // left arm OPENS from the lariat the spin ended on (a continuous handover; it used to open from
    // the grip, which is where the arm no longer is by the end of the whirlwind).
    poseArmAngles(bones, LK,
      kf(ph, [[0, WHIRL.lariatX], [0.34, -1.54], [WHIRL.slamHit, -0.66], [1, WHIRL.slamArmLX]]),
      kf(ph, [[0, WHIRL.lariatZ], [0.34, 0.18], [WHIRL.slamHit, 0.24], [1, WHIRL.slamArmLZ]]),
      kf(ph, [[0, WHIRL.lariatE], [0.34, -1.24], [WHIRL.slamHit, -0.42], [1, WHIRL.slamArmLE]]), e);
    poseArmAngles(bones, RK,
      kf(ph, [[0, WHIRL.leadX], [0.34, -1.62], [WHIRL.slamHit, -1.34], [1, WHIRL.slamArmRX]]),
      kf(ph, [[0, WHIRL.leadZ], [0.34, 0.16], [1, WHIRL.slamArmRZ]]),
      kf(ph, [[0, WHIRL.leadE], [0.34, -1.10], [1, WHIRL.slamArmRE]]), e);
  } else if (phase === 5) {
    // THE ELBOW: the right arm folds and the ELBOW (not the fist) is driven straight down.
    poseArmAngles(bones, RK,
      kf(ph, [[0, -1.60], [0.50, -2.45], [0.84, -1.05], [1, -0.95]]),
      kf(ph, [[0, 0.20], [0.50, -0.10], [0.84, -0.16], [1, -0.16]]),
      kf(ph, [[0, -1.40], [0.50, -2.60], [0.84, -2.85], [1, -2.85]]), e);
    poseArmAngles(bones, LK, kf(ph, [[0, -0.60], [0.50, -1.40], [1, -0.30]]),
      kf(ph, [[0, 0.30], [1, 0.40]]), kf(ph, [[0, -0.60], [1, -0.50]]), e);
  } else if (phase === 3) {
    // THE RELEASE: the right arm — the one that had the throat — swings UP and through (the
    // user's follow-through), the left comes back to guard, and the body straightens off the slam.
    poseArmAngles(bones, RK,
      kf(ph, [[0, WHIRL.slamArmRX], [0.36, -2.24], [0.72, -0.44], [1, 0.06]]),
      kf(ph, [[0, WHIRL.slamArmRZ], [0.36, 0.34], [1, 0.16]]),
      kf(ph, [[0, WHIRL.slamArmRE], [0.36, -0.34], [1, -0.24]]), e);
    poseArmAngles(bones, LK,
      kf(ph, [[0, WHIRL.slamArmLX], [0.36, -0.96], [0.72, -0.30], [1, -0.12]]),
      kf(ph, [[0, WHIRL.slamArmLZ], [1, 0.30]]),
      kf(ph, [[0, WHIRL.slamArmLE], [0.36, -1.05], [1, -1.15]]), e);
  } else {
    // THE WHIFF TAIL: out of the spin and back to the sides, arms to the neutral guard.
    poseArmAngles(bones, RK, kf(ph, [[0, WHIRL.leadX], [0.5, -0.30], [1, 0.06]]),
      kf(ph, [[0, WHIRL.leadZ], [1, 0.16]]), kf(ph, [[0, WHIRL.leadE], [1, -0.24]]), e);
    poseArmAngles(bones, LK, kf(ph, [[0, WHIRL.reelX], [0.5, 0.62], [1, 0.10]]),
      kf(ph, [[0, WHIRL.reelZ], [0.5, 1.00], [1, 0.20]]), kf(ph, [[0, WHIRL.reelE], [1, -0.24]]), e);
  }
  if (hold > 0.001) {
    let tx = -WHIRL.handX;
    let ty = WHIRL.handY;
    let tz = WHIRL.handZ;
    if (whirlNeckOk) {
      tx = WHIRL_NECK.x;
      ty = WHIRL_NECK.y + (phase === 6 ? WHIRL.skimGrabY : WHIRL.grabY);
      tz = WHIRL_NECK.z;
    }
    poseArmReach(bones, RK, hold * e, tx, ty, tz);
  }
  poseGrip(bones, hold > 0.4 || phase === 2 || phase === 5 ? 1 : 0.7, e);
}

// ---- skill 2: the head scissor ----
const SCISSOR = {
  guardHip: 0.93,
  guardLean: 0.22,
  leapHip: 1.04,
  // ...and the trunk at the end of the leap (session 157): he sits UP over the legs he has just
  // thrown forward and apart rather than folding after them, which is what makes the leap read as a
  // body above a pair of legs (see the leap's own note). Its one reader outside the leap is the
  // clamp's first key: the leap's last lean IS the clamp's first one, as every phase's handover in
  // this file is, so the two are one number.
  leapLean: -0.26,
  landHip: 0.74,
  // The CLAMP (`phase 2`): one constant hip height, because `player.scissorAnchor` places the
  // whole body off it — the rig is rigidly rotated about the opponent's neck, so a hip the pose
  // keyed would walk the contact off the neck it is supposed to be on. Nothing on the `player.js`
  // side reads its value: the anchor measures the hips' own offset off the LIVE rig on the clamp's
  // first frame, so this only has to be constant across the phase.
  clampHip: 1.04,
  // ...and the scissors themselves. The two ankles are SOLVED onto the neck (the shared two-bone
  // leg IK, hit exactly — see `poseLegIKOn`) rather than angle-keyed, so the clip holds however far
  // round the swing has turned, and these three numbers are the grip's own shape:
  //
  // The grip is a CROSSING, not a splay. The rig's legs root 0.20 either side of the midline
  // (`ANKLE_X`), so a leg solved straight onto the neck passes wide of it: measured at the clamp's
  // own target, with no cross the two shins hang 0.16 and 0.13 authoring units off the neck — the
  // legs reach for the neck and miss, which is exactly the "sweeps past the head" read this move
  // had. `grip` is how far each leg is brought IN across the midline (adduction), which walks the
  // ankle onto the neck's own line and the shin across it; `close` is how much more of that the
  // bite adds, so the two shins visibly squeeze shut on the neck on the snap's own frame.
  //   `grip`  — the crossing, held for the whole clamp;
  //   `close` — how much further it shuts as the bite lands (0.36 + 0.16 = 0.52 at full bite);
  //   `cross` — how far past each other the two ankles go FORE AND AFT, which is what keeps the
  //             two crossed shins from driving through each other (measured: the shin-to-shin gap
  //             runs 0.19 with no stagger and 0.10 with it, against a shin of ~0.08).
  // Measured at the clamp's target with 0.36 of grip: the shins 0.09/0.05 off the neck; at full
  // bite (0.52): 0.05/0.05, with the ankles 0.12/0.13 either side of it.
  grip: 0.36,
  close: 0.16,
  cross: 0.06,
  // ---- and THE JAWS' OWN WIDTH (session 157) ----
  // How far the legs are THROWN APART on the leap, which is the split the clamp's own first frame
  // hands over from and then closes on the neck (see the note under the table). It is in the leap's
  // own units — `poseLegAngles` scales a splay by `POSEX` — so the clamp, whose legs are solved by
  // IK in rig units, reads it back as `open * POSEX`. Measured off the rig at the leap's last
  // frame: the split puts the two ANKLES 0.96 rig units apart (0.55 × POSEX = the 0.44 the solved
  // legs are handed) against the 0.37 the phase had while it was a tuck, and the KNEES 0.37 apart
  // against both of them on the midline.
  open: 0.55,
  // ---- THE MISS'S OWN SHAPE (session 152 — see the note under the table) ----
  // The landed grip's three numbers say how the legs CLOSE ON A NECK; these say what the same legs
  // do when there is no neck, which is a different animation and not the same one with the target
  // taken away:
  //   `jaw`      — how far the two legs SPLIT before the shut. The splay's own units, so it is
  //                compared against the crossing directly, and it is the half of the scissors the
  //                first pass at the miss never had: a symmetric tuck has no jaws, so nothing
  //                reads as CLOSING. 0.58 (× `POSEX`) is ~26° of abduction opened, on top of the
  //                0.10 the phase opens with.
  //   `meet`     — where the two ankles are on the SHUT's own frame, in the same units. This is the
  //                number the whole miss turns on. MEASURED off the rig (the ankle's own lateral
  //                offset from the hips, rig-local): with the legs thrown up the two ankles are
  //                **0.6–0.7 apart** on the jaw's own splay and **0.5 apart on the OTHER sides**
  //                once the shut has crossed them — i.e. the legs swap over, and a scissor whose
  //                blades swap sides without ever MEETING reads as a spread, not as a shut. The
  //                meeting point measures at a splay of about **-0.21** (the swathe is steep: the
  //                abduction swings the ankle about a near-vertical axis once the leg is up), and
  //                that is all `meet` is: the blades MEETING, on the frozen frame. (0.52 × 0.40.)
  //   `through`  — ...and then sliding THROUGH each other, because there is nothing between them
  //                to stop them. From the meeting frame the splay runs out to -(0.52 × 1.28) =
  //                -0.67 over the first third of `post`: the blades pass each other and come out
  //                crossed, which is the one thing about a whiff that can be turned into animation
  //                rather than into an absence. A landed grip stops at 0.52 (ON the neck's own
  //                line); this does not stop at all.
  //   `crossMiss`— the extra fore-and-aft stagger the crossing needs. `cross` exists to keep two
  //                crossed shins from driving through each other (see above); doubled (0.12 either
  //                way, 0.24 apart) is what pays for the blades going past each other.
  // ...and the fall itself, in the rig's own frame: how far FORWARD of the hips the ankles are
  // thrown, and how far BACK through and under him they swing once they have shut on nothing. The
  // two are what the body is pitched over (`SCISSOR_MISS_FLIP` in player.js), so they are the
  // shape's half of one move.
  jaw: 0.36,
  meet: 0.40,
  through: 0.88,
  crossMiss: 1.0,
  reachZ: 0.62,
  fallZ: 0.90,
  missHip: 1.07,      // the hips at the top of the reach: he RISES into the throw
  foldLean: 0.80,     // the trunk, folded over the lap the legs came to rest in
  // ...and THE TRUNK TURNED INSIDE OUT for the catch half of the clamp (session 161 — the user's *"in
  // skill 2 miss make the torso position when he tries to catch the enemy with his legs the inverse
  // position of what it is rn divided by 2"*). The trunk the LANDED clamp folds over is folding over
  // a neck it caught; with nothing there, the same fold is a body hunching over its own lap for no
  // reason. So through the catch the torso's own two channels are scaled by `1 - 1.5 * missTorsoFlip`
  // — the inverse of what the keys give them, HALVED — and 1 (no change) at both ends of the phase,
  // because the phases either side hand over by number and a trunk that arrived flipped would tear
  // the handover open. `missTorsoFlip` 0 disables it entirely.
  missTorsoFlip: 1,
  missGrip: 0.28,     // and the hands — open, because they are holding nothing
  shiverLean: 0.10,   // how much of the shut's shudder lands on each channel (see `shiver`)
  shiverHead: 0.14,
  shiverTwist: 0.10,
  // ---- and the STUMBLE (phase 3's miss half) ----
  catchHip: 0.60,     // the hips at the bottom of the catch — well under the landed landing's own
                      // `landHip` 0.74, which with the wrong foot is what sells it as a catch
  catchLean: 0.66,    // ...and the trunk there: still folded over the lap, ALMOST as deep as the
                      // clamp left it, because the weight he missed is still not under him
  airAnkle: -0.62,    // the ankles' own target rel the hips on the clamp's last frame (the same
                      // number phase 2's `y` ends on), which the landing's first frame hands over
  leadX: 0.58,        // where the LEADING (character's right) foot slaps down: well out in front
  trailX: -0.40,      // ...and the trailing leg stays behind him, which is the stagger he has to
                      // untangle the crossing out of
};

// `miss` (session 143, the user's *"add a miss animtion for 2"*) is the whole difference between a
// scissor that caught something and one that did not. A scissor thrown at nothing has no neck to
// close on, so the CLAMP branch cannot be the pendulum it is on a hit (`player.js` leaves the rig to
// the air on a miss — see `updateScissor`), and the shape has to carry the read on its own:
//
//   * the scissors still SNAP SHUT on the bite's own frame (`bite` is the same flicked shut, so the
//     beat reads the same whether it landed or not), but they shut on EMPTY AIR — the legs come up
//     and the two shins cross the midline over nothing;
//   * the arms are thrown OUT for balance instead of pulled into the compact ball a real clamp is;
//     and
//   * the LANDING is a STUMBLE — the leading foot shoots out to catch a weight that is not there,
//     the trunk is still pitched over the empty grip, and the shape only settles into the ordinary
//     stance over the back half of the phase.
//
// The two phases hand over by number, the way every phase in this file does: the miss clamp's LAST
// keys ARE the miss landing's FIRST ones.
//
// RE-CUT IN SESSION 152. The user's read of the version above is *"add a better miss animation for
// the skill 2 wtf is this animation"*, and the shape above had one thing wrong with it that no
// amount of tuning fixes: it was a TUCK. The jaws never opened, so nothing read as CLOSING; the
// trunk sat at 0.34 through a fall it should have been diving; and the arms "thrown out for balance"
// is not what a body does when a grip it has just spent everything on fails — it WINDMILLS. The
// shape now says the three beats a whiff actually has (the jaws open, the jaws snap shut on nothing
// and the body shudders with it, then the body follows its own legs over and has to catch itself),
// and the third one is only half here: the body going over is a rotation of the RIG, so it is
// `player.js`'s (`SCISSOR_MISS_FLIP`), and this file's half of it is the ankles swinging through
// and down (`fallZ`) and the trunk folding over them (`foldLean`).
function poseScissor(bones, e, u, phase, ph, biteIn, tgtYIn, tgtZIn, miss, postIn) {
  let hip, lean, twist, headX;
  // ...and THE TORSO'S OWN TWO CHANNELS carry a factor of their own, because skill 2's MISS is the
  // one place in the file where the trunk is not simply `lean` and `-twist * 0.5`: `torsoInv` is what
  // the torso's x and y are scaled by (see the clamp's note — it is -0.5 through the catch, i.e. the
  // inverse of the shape, halved) and it is 1 for every other phase of every other move, so the hips
  // keep their twist and the head keeps its keys.
  let torsoInv = 1;
  // THE SCISSORS' SHUT, shaped here and only here. `player.js` hands over the raw 0..1 progress
  // through the shut and its own clock (it lands on 1 exactly on `SCISSOR_HIT_AT` — the frame the
  // shins cross, the hit fires and the 0.09 s hitstop holds), and this is the SPACING: `flickKeys`
  // is the same knock-on flick every received hit is authored on, two thirds of the crossing in
  // the first third of a segment that is barely two frames long. So the shins are KNOCKED shut
  // rather than eased shut, and the frame the world freezes on is the crossed one.
  const bite = biteIn == null ? 0 : kf(Math.max(0, Math.min(1, biteIn)), flickKeys(0, 1, 1));
  // ...and THE MISS'S OWN TWO CLOCKS (session 152 — see the note under the `SCISSOR` table). `post`
  // is the clamp's progress AFTER the shut (0 until `SCISSOR_HIT_AT`, 1 at the clamp's end — handed
  // over by `player.js`, which is where that constant lives), and the SHIVER is what the body does
  // about it: a decaying tremor through the trunk, the head and the twist, because a grip that has
  // just failed is a body whose expectation and its situation have come apart — which is a shake and
  // not a pose, and the one thing the first pass at the miss had no beat for at all. It is built
  // here rather than handed over because it is a SHAPE (three channels, each with its own weight)
  // and not a clock: the clock is `post`, and this is one read of it.
  const post = postIn == null || postIn < 0 ? 0 : postIn > 1 ? 1 : postIn;
  const shiver = post <= 0 ? 0 : Math.sin(post * 9.6) * (1 - post) * (1 - post);
  if (phase === 0) {
    // THE GUARD. Both hands up in front of the face, the chin tucked behind the lead shoulder,
    // the weight on the back foot: a block, and the pose the counter is read off.
    hip = kf(ph, [[0, 0.99], [0.35, SCISSOR.guardHip], [1, 0.97]]);
    lean = kf(ph, [[0, 0.04], [0.35, SCISSOR.guardLean], [1, 0.20]]);
    twist = kf(ph, [[0, 0], [0.35, 0.26], [1, 0.22]]);
    headX = kf(ph, [[0, 0], [0.35, 0.24], [1, 0.20]]);
  } else if (phase === 1) {
    // THE LEAP — and THE JAWS OPEN. He goes up and slightly back, the arms thrown out for the turn
    // that is coming, and the legs are NOT tucked: the two of them are thrown forward and APART on
    // the way to the throat, so what the beat reads as is a pair of scissors opening rather than a
    // man folding his knees into his chest.
    //
    // Session 157, the user's *"change skill 2 torso positions when he like pushes his legs forwards
    // or idk wtf he does ngl to be like the image i sent the red is wrong the blue is the right"* —
    // the red drawn down the sides of the torso with the blue drawn beside it as a pair of legs
    // thrown forward and split wide. The complaint is exact: a tuck puts both thighs against the
    // chest, and this is the one phase of the move whose legs are drawn at a camera BEHIND the body,
    // so at the end of the leap there was nothing to see of the legs at all — a torso with a pair of
    // arms and no legs under it. Measured off the rig at the phase's last frame, before this: the
    // two ANKLES **0.37 rig units apart** (the rig's own stance width, i.e. no split at all) with
    // both KNEES on the midline. The split below takes the ankles to **0.96** and the knees to
    // **0.37**. And it is not a shape only this phase wears: the CLAMP hands over from exactly this
    // width and closes it on the neck (see `SCISSOR.open`), so the two phases are one movement —
    // the jaws open on the leap and shut on the bite.
    hip = kf(ph, [[0, 0.97], [0.5, 1.02], [1, SCISSOR.leapHip]]);
    // ...and the TRUNK sits UP over the legs it has just thrown out (`SCISSOR.leapLean`) instead of
    // folding after them: the arch is what separates the silhouette from a body hunched over its own
    // knees. Its last key is the clamp's own first one, as every handover in this file is.
    lean = kf(ph, [[0, 0.20], [0.5, -0.06], [1, SCISSOR.leapLean]]);
    twist = kf(ph, [[0, 0.22], [1, 0.10]]);
    headX = kf(ph, [[0, 0.20], [1, 0.06]]);
  } else if (phase === 2) {
    // THE CLAMP — THE SCISSORS ON THE NECK, and the swing about it. The whole body's turn lives on
    // the RIG (`player.js`'s `scissorAnchor` winds `spinX` through exactly one revolution about the
    // CONTACT the legs are solved onto — the opponent's neck), so this branch only has to hold the
    // shape: the trunk curling up over the legs (`lean` forward is the tuck, the chin going with
    // it) and the scissors shut. `bite` is the one live channel — the flicked shut of the table
    // above, which lands crossed exactly on the frame the hit and its hitstop do, so what the
    // world freezes on IS the bite: the legs squeezed, the two shins across the neck, the trunk
    // curled over them.
    if (miss) {
      // THE MISS'S CLAMP — THE JAWS CLOSE ON NOTHING, AND THE BODY FOLLOWS ITS OWN LEGS OVER.
      //
      // (Re-cut in session 152. The user's read of the first pass at this — *"add a better miss
      // animation for the skill 2 wtf is this animation"* — is fair: it was a symmetric TUCK, the
      // legs came up to a point in the air and stopped there, and a tuck is a shape a body can be
      // in for any reason at all. Nothing in it said SCISSORS and nothing in it said FAILED.) The
      // shape below says both, in the order a real whiff happens:
      //
      //   1. THE JAWS OPEN. Through the reach the two legs SPLIT wide and drive up and FORWARD to
      //      where a neck would be (see `SCISSOR.jaw` / `reachZ`, and the legs below). The rig's
      //      legs root 0.20 either side of the midline, so a scissor's jaws are already open; what
      //      this adds is the CLOSING being legible, which a symmetric tuck can never have.
      //   2. THE SNAP. On the shut's own flicked beat the jaws slam shut and CROSS — past each
      //      other, because there is nothing there to stop them (`closeMiss`), the trunk is thrown
      //      forward with them (`lean`'s 0.34 key), the head drops, the hips are pulled down by the
      //      legs — and the whole body SHUDDERS (`shiver`).
      //   3. THE BODY FOLLOWS THE LEGS OVER. Nothing stopped the legs and nothing took the weight,
      //      so the ankles swing DOWN and BACK through the crossing (`fallZ`), the trunk keeps
      //      folding over them (0.34 → `foldLean` 0.80), and the arms — flung BACK on the reach, as
      //      the counterweight to legs going up and forward — whip forward and down past the knees.
      //      What is left is a body folded over its own lap with both hands falling at the deck,
      //      which is the shape the stumble picks up (the landing's first keys are these, as every
      //      phase's handover in this file is).
      //
      // ...and the whole-rig PITCH that goes with it is `player.js`'s (`SCISSOR_MISS_FLIP`): the
      // body going over is a rotation of the RIG, so it belongs on the same channel the landed
      // clamp's own revolution rides, not in here.
      hip = kf(ph, [[0, SCISSOR.leapHip], [0.30, SCISSOR.missHip], [0.40, 0.98], [1, 0.86]]);
      lean = kf(ph, [[0, SCISSOR.leapLean], [0.26, -0.36], [0.40, 0.34], [0.70, SCISSOR.foldLean],
        [1, SCISSOR.foldLean]]) + SCISSOR.shiverLean * shiver;
      twist = kf(ph, [[0, 0.10], [0.30, 0.24], [0.46, -0.30], [1, -0.36]])
        + SCISSOR.shiverTwist * shiver;
      headX = kf(ph, [[0, 0.06], [0.26, -0.14], [0.40, 0.62], [1, 0.44]]) + SCISSOR.shiverHead * shiver;
      // ---- AND THE TRUNK IS THE INVERSE OF ITSELF, HALVED (session 161) --------------------------
      // The user: *"in skill 2 miss make the torso position when he tries to catch the enemy with his
      // legs the inverse position of what it is rn divided by 2"*. The trunk the keys above are
      // writing is the LANDED clamp's, and it is a shape with a reason: a body folding up OVER the
      // neck it has just caught, the shoulders coming down on top of the hold. On a whiff there is
      // no neck — the legs shut on nothing and the same fold is a man hunching over his own lap, with
      // nothing in the pose saying why. So through the CATCH the trunk's two channels are turned
      // inside out: `torsoInv` -0.5 negates every value `lean` and `twist` hand the torso and halves
      // it, so the arch the reach already had becomes a small forward pitch, the fold over the lap
      // becomes a small arch BACK off it, and the whole trunk reads as leaning away from a hold that
      // is not there instead of over one that is.
      //
      // The RAMP is not decoration and is not optional — it is the handover. This phase opens on the
      // leap's own last frame (`leapLean`) and closes on the stumble's own first one (`foldLean`),
      // and every phase in this file hands over BY NUMBER, with no cross-fade anywhere: the trunk's
      // target therefore jumps the instant `player.js` moves the phase on. Flipped to the last frame,
      // that jump measures 1.2 rad on one frame of a 60 Hz pose — a 69 degree snap of the trunk, the
      // single loudest pop the move could have. `flip` is therefore 0 at both ends of the phase and 1
      // through the catch, so what arrives at each handover is the value the neighbour is expecting,
      // and the inversion is spent where the user asked for it: on the beat where the legs shut on
      // nothing and the body would otherwise fold after them.
      const flip = kf(ph, [[0, 0], [0.30, 0], [0.42, 1], [0.66, 1], [1, 0]]);
      torsoInv = 1 - 1.5 * SCISSOR.missTorsoFlip * flip;
    } else {
      hip = SCISSOR.clampHip;
      lean = kf(ph, [[0, SCISSOR.leapLean], [0.45, 0.34], [1, 0.48]]) + 0.22 * bite;
      twist = kf(ph, [[0, 0.10], [0.5, -0.16], [1, -0.26]]);
      headX = kf(ph, [[0, 0.06], [0.45, 0.30], [1, 0.34]]) + 0.10 * bite;
    }
  } else {
    // THE LANDING. He comes down on his feet out of the turn, both hands down. Its first keys are
    // the clamp's LAST ones (`SCISSOR.clampHip`, lean 0.48 + the bite's 0.22, twist -0.26, head
    // 0.34 + the bite's 0.10), so the handover out of the swing is continuous — the phases open and
    // close on the same station, as every phase in this file does.
    if (miss) {
      // THE MISS'S LANDING — THE SCRAMBLE. Its first keys ARE the miss clamp's last ones (hip 0.86,
      // lean `foldLean` 0.80, twist -0.36, head 0.44), so the handover is continuous the same way
      // every phase's is in this file — and it has to be, because what this phase inherits is a
      // body folded over its own lap mid-fall. From there it is a CATCH and not a stance: the trunk
      // stays folded almost as deep as the clamp left it (`catchLean` 0.66 — the weight he missed
      // is still not under him), the hips drop far below anything the landed landing does
      // (`catchHip` 0.60 against its own `landHip` 0.74), and it only finds the ordinary stance
      // over the back half of the phase. Depth on the WRONG foot is what sells it: the hit's
      // landing is a man absorbing a throw, this one is a man who has to catch himself.
      hip = kf(ph, [[0, 0.86], [0.34, SCISSOR.catchHip], [0.68, 0.90], [1, 1.00]]);
      lean = kf(ph, [[0, SCISSOR.foldLean], [0.28, SCISSOR.catchLean], [0.66, 0.26], [1, 0.06]]);
      twist = kf(ph, [[0, -0.36], [0.30, 0.26], [0.70, 0.06], [1, 0]]);
      headX = kf(ph, [[0, 0.44], [0.24, 0.34], [0.62, -0.14], [1, 0]]);
    } else {
      hip = kf(ph, [[0, SCISSOR.clampHip], [0.35, SCISSOR.landHip], [0.7, 0.86], [1, 1.00]]);
      lean = kf(ph, [[0, 0.70], [0.35, 0.42], [1, 0.06]]);
      twist = kf(ph, [[0, -0.26], [0.35, 0.16], [1, 0]]);
      headX = kf(ph, [[0, 0.44], [0.35, -0.08], [1, 0]]);
    }
  }
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", twist, e);
  poseRot(bones, "hips", "z", 0, e);
  // ...and the torso is the one place a move can re-read the trunk (`torsoInv` — see skill 2's miss,
  // where it is the inverse of the shape, halved). It is 1 everywhere else, so the hips above keep
  // their twist and the head below keeps its keys: this dials the TRUNK and nothing under or over it.
  poseRot(bones, "torso", "x", lean * torsoInv, e);
  poseRot(bones, "torso", "y", -twist * 0.5 * torsoInv, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", headX, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);

  if (phase === 0) {
    // Both feet are on the deck: solved, so the stance never scrapes through it.
    poseLegIK(bones, RK, ANKLE_Z + 0.10, ankleForSole(0) - hip, 0.16, e);
    poseLegIK(bones, LK, ANKLE_Z - 0.14, ankleForSole(0) - hip, 0.22, e);
  } else if (phase === 1) {
    // THE LEAP. Off the deck and the legs are the weapon: ANGLE-authored (there is nothing under
    // them to solve onto yet — the neck arrives at the end of the phase), both legs driven forward
    // with the trailing one a beat behind the lead (`LK` is the less-extended of the two, as it has
    // been since the shape was authored), and both SPLIT by `SCISSOR.open` so the jaws are open when
    // the phase hands over (see the note at the top of the branch).
    const open = kf(ph, [[0, -0.18], [0.45, 0.62], [1, 1]]);
    const split = SCISSOR.open * open;
    poseLegAngles(bones, RK,
      kf(ph, [[0, -0.35], [0.5, -1.28], [1, -1.06]]),
      kf(ph, [[0, 0.85], [0.5, 0.34], [1, 0.34]]),
      kf(ph, [[0, 0.30], [0.5, -0.20], [1, -0.30]]),
      kf(ph, [[0, -0.10], [0.45, 0.28], [1, split]]), e);
    poseLegAngles(bones, LK,
      kf(ph, [[0, -0.10], [0.5, -0.98], [1, -0.80]]),
      kf(ph, [[0, 0.80], [0.5, 0.50], [1, 0.56]]),
      kf(ph, [[0, 0.30], [0.5, -0.15], [1, -0.25]]),
      kf(ph, [[0, 0.10], [0.45, 0.34], [1, split]]), e);
  } else if (phase === 2) {
    if (miss) {
      // THE JAWS, AND THE SNAP ON NOTHING. The ankles are still SOLVED — that is what keeps the
      // handover to the landing a matter of numbers rather than a snap — but their target is a
      // point in the AIR above and in front of the hips rather than a neck, and the two shins cross
      // the midline on the bite's own flicked frame, so the beat the world would have been frozen
      // on with a hit still reads here: the scissors SHUT.
      //
      // Three things make it a pair of JAWS rather than the tuck the first pass had:
      //   * the legs OPEN first (`SCISSOR.jaw`, and the splay runs from it to zero across the
      //     shut, so what reads is the closing and not just the closed);
      //   * they arrive CROSSED instead of symmetric — the shut's own crossing is the landed
      //     clamp's (`grip` + `close`), pushed a third past it (`closeMiss`) because a neck that
      //     is not there cannot stop them, with the fore-and-aft stagger doubled (`crossMiss`) to
      //     pay for it;
      //   * and then they fall OUT of it: the ankles swing down and back through the crossing
      //     (`fallZ`) as the body pitches over them, so the second half of the clamp is the legs
      //     coming down under a body that went after them.
      const reach = kf(ph, [[0, 0], [0.26, 1], [1, 1]]);
      // THE JAWS, and then the blades MEETING on the shut's own flicked beat — the flick's shape
      // (`bite`) IS the slam, so the jaws are authored as "open, times however much of the shut is
      // left". That is what makes the frozen frame the frame they MEET on (see `SCISSOR.meet` for
      // the measured number, and why meeting — rather than merely converging — is the whole read).
      const open = SCISSOR.jaw * kf(ph, [[0, 0], [0.18, 1], [1, 1]]) * (1 - bite);
      // ...and then the blades SLIDE THROUGH each other, because there is nothing between them to
      // stop them (`SCISSOR.through`). Keyed on `post` — the clamp's progress AFTER the shut — so
      // the meeting and the sliding are two beats rather than one blur, which is what the first
      // pass (and the landed grip's own single crossing) could not be: a grip STOPS at the neck.
      const thru = SCISSOR.through * kf(post, [[0, 0], [0.32, 1], [1, 1]]);
      const splay = SCISSOR.open * POSEX * (1 - reach) + open
        - (SCISSOR.grip + SCISSOR.close) * (SCISSOR.meet + thru);
      const cross = SCISSOR.cross * (1 + SCISSOR.crossMiss * bite);
      // ...and the ankles themselves. Both curves are SATURATED before the clamp can end, and that
      // is not tidiness: a whiff is cut the frame the deck arrives (see `updateScissor`), which
      // measures at about 0.70 of the clamp, so the landing's own first frame reads these values —
      // a curve still moving at 0.70 would hand the legs over with a step in them (measured on the
      // first pass at this: `y` jumped **0.9 rig units in one frame**, the whole fall's own travel
      // arriving in one frame instead of over six).
      const y = kf(ph, [[0, 0.24], [0.26, 0.82], [0.40, 0.72], [0.56, 0.34], [0.66, SCISSOR.airAnkle],
        [1, SCISSOR.airAnkle]]);
      const z = ANKLE_Z + SCISSOR.reachZ * reach - SCISSOR.fallZ * kf(post, [[0, 0], [0.5, 1], [1, 1]]);
      poseLegIK(bones, RK, z - cross, y, splay, e);
      poseLegIK(bones, LK, z + cross, y, splay, e);
    } else {
      // THE CLAMP: the SCISSORS, SOLVED rather than keyed. Both ankles are put on the contact
      // `player.js` has placed the body by (`tgtY`/`tgtZ` — the neck's own point in this rig's
      // frame), so the clip stays on the neck for the whole revolution however far round the swing
      // has carried the body. Angle-keyed legs cannot do that: they swing straight past a head that
      // is not where the angles were written for, which is exactly what the clamp used to look like.
      // The grip's own shape is the CROSS (each leg brought in across the midline until the shin is
      // on the neck — see the table) plus the fore-and-aft stagger that keeps the two crossed shins
      // off each other, and both shut a little tighter on the bite. The crossing itself is EARNED
      // rather than worn from the clamp's first frame: it ramps in over the same beat the ankles
      // travel onto the neck (`reach`), so what reads is the legs reaching out beside the neck and
      // crossing over it as they arrive — and the phase opens on the leap's own splay, so there is
      // no roll of the thighs to see at the handover either.
      const reach = kf(ph, [[0, 0], [0.4, 1], [1, 1]]);
      const cross = SCISSOR.cross * bite;
      // ...and the JAWS SHUT: the split the leap threw the legs to is closed onto the neck over the
      // same beat the ankles travel onto it (`reach`), so the clamp is the second half of the leap
      // rather than a shape of its own — the legs open on the leap, sweep out beside the neck, and
      // cross it as they arrive. The handover term is `SCISSOR.open * POSEX` because the two phases
      // speak different units: the leap's legs are angle-authored (`poseLegAngles` scales a splay by
      // `POSEX`) and the clamp's are solved (`poseLegIKOn` takes the splay as it is).
      const splay = SCISSOR.open * POSEX * (1 - reach) - (SCISSOR.grip * reach + SCISSOR.close * bite);
      poseLegIKOn(bones, RK, ANKLE_Z + tgtZIn - cross, tgtYIn, splay, e);
      poseLegIKOn(bones, LK, ANKLE_Z + tgtZIn + cross, tgtYIn, splay, e);
    }
  } else {
    if (miss) {
      // THE SCRAMBLE'S LEGS. Its first frame IS the miss clamp's last one — both ankles at
      // `SCISSOR.airAnkle` below the hips, swung through and BACK (`fallZ`), still crossed by the
      // clamp's own deeper crossing and its doubled stagger — so the legs fall OUT of the empty
      // scissor instead of snapping to the deck, the same bargain the hit's landing makes and for
      // the same reason: a straight jump from an air target to a deck stance is the largest
      // one-frame move in the move (the hit's own measured **1.40 u** of ankle travel).
      //
      // From there the LEADING foot (the character's right) runs out AHEAD of him to take the
      // weight — `leadX` 0.58, further out than any stance either landing wears — and the trailing
      // leg stays BEHIND (`trailX` -0.40): that fore-and-aft stagger, with the splay unwinding from
      // the crossing's -0.68 out to the stance's own +0.46 over the same 0.44, is the untangling,
      // and it is why this reads as a catch-step and not as a landing. Both are on the deck by 0.44
      // of the phase; the phase after this one blends the stance in over the pose fade.
      // ...and the legs. `out` is FAST — the feet are already only 0.24 rig units above the deck on
      // the clamp's last frame (the legs swung down and through in the air, see `SCISSOR.fallZ`),
      // so reaching the deck in 0.18 of the phase is a PLANT and not a teleport. It has to be fast
      // for a second reason that is easy to get wrong: the hip dip below is blended in over a longer
      // window, and the ankle's own height is `hip + y` — two curves falling together take the feet
      // THROUGH the deck in the middle of the handover (measured on the first pass: **0.25 u of boot
      // under the ground** at the catch, on a body whose hips had already bottomed out while its
      // ankle was still 60% of the way to the deck). Planted first, the solve is exact for the whole
      // of the dip: with `out` at 1 the ankle IS `ankleForSole(0)`, whatever the hips are doing.
      //
      // The SPLAY unwinds on its own, slower clock (`outs`): the legs are still crossed on the frame
      // the leading foot slaps down, and the untangling is the back half of the stumble. That is the
      // beat the first pass had no answer for at all.
      const out = smooth01(ph / 0.18);
      const outs = smooth01(ph / 0.45);
      const deck = ankleForSole(0) - hip;
      const y = SCISSOR.airAnkle + (deck - SCISSOR.airAnkle) * out;
      const cross0 = SCISSOR.cross * (1 + SCISSOR.crossMiss);
      const cross1 = (SCISSOR.grip + SCISSOR.close) * (SCISSOR.meet + SCISSOR.through);
      const zR0 = (ANKLE_Z + SCISSOR.reachZ - SCISSOR.fallZ) - cross0;
      const zL0 = (ANKLE_Z + SCISSOR.reachZ - SCISSOR.fallZ) + cross0;
      poseLegIK(bones, RK, zR0 + ((ANKLE_Z + SCISSOR.leadX) - zR0) * out, y,
        -cross1 + (0.46 + cross1) * outs, e);
      poseLegIK(bones, LK, zL0 + ((ANKLE_Z + SCISSOR.trailX) - zL0) * out, y,
        -cross1 + (0.42 + cross1) * outs, e);
    } else {
      // THE LANDING'S OWN HANDOVER, and it makes the same bargain the trunk keys above make: its
      // first frame IS the clamp's last one, so the feet come down OUT of the neck grip instead of
      // snapping to the deck. They have to: the grip's ankles sit 0.11 above the hips and the deck's
      // sit 0.8 below them, and a landing that jumped straight there measured **1.40 world units of
      // ankle travel in a single frame** — far and away the largest one-frame move in the whole
      // move, a pair of legs teleporting off a neck. `out` is that handover: 0 on the phase's first
      // frame (the grip's own target, at its own crossing), 1 by 0.42 of the phase, and from there
      // it is exactly the stance this phase always had — the same solve, the same splay, only the
      // target travels. The trunk drops on its own keys underneath it, so what reads is the whole
      // body falling out of the swing and the feet reaching the deck just as they arrive.
      const out = smooth01((ph - 0.05) / 0.42);
      const deck = ankleForSole(0) - hip;
      const y = tgtYIn + (deck - tgtYIn) * out;
      const zR = ANKLE_Z + tgtZIn - SCISSOR.cross;
      const zL = ANKLE_Z + tgtZIn + SCISSOR.cross;
      poseLegIK(bones, RK, zR + ((ANKLE_Z + 0.26) - zR) * out, y,
        -SCISSOR.grip + (0.16 + SCISSOR.grip) * out, e);
      poseLegIK(bones, LK, zL + ((ANKLE_Z - 0.26 * 1.4) - zL) * out, y,
        -SCISSOR.grip + (0.22 + SCISSOR.grip) * out, e);
    }
  }

  if (phase === 0) {
    // The block: forearms crossed in front of the face, both hands shut.
    poseArmAngles(bones, RK, -1.30, 0.30, -2.25, e, -0.30);
    poseArmAngles(bones, LK, -1.15, 0.42, -2.35, e, 0.34);
  } else if (phase === 1) {
    poseArmAngles(bones, RK, -0.15, 1.05, -0.85, e, -0.2);
    poseArmAngles(bones, LK, 0.20, 1.15, -0.70, e, 0.2);
  } else if (phase === 2) {
    if (miss) {
      // THE WINDMILL. The hit's clamp pulls both arms into the ball (elbow -2.30, hard shut);
      // a scissor that caught nothing has nothing to ball up around, so they are free — and what
      // free arms do here is the counterweight: the legs are thrown up and FORWARD, so they go
      // BACK on the reach, and then, the moment the legs find nothing and the body starts over
      // after them, they whip FORWARD and DOWN past the knees, which is where the landing's
      // scramble picks them up. The two arms are deliberately NOT the same shape: the character's
      // RIGHT (the rig's `RK` side, the side the whole move is thrown off) leads, and the left lags
      // a beat behind it — the same asymmetry the landing makes, and the one thing that keeps a
      // failed two-limbed move from reading as a pose.
      poseArmAngles(bones, RK, kf(ph, [[0, -0.15], [0.28, 0.80], [0.44, -0.60], [1, -0.02]]),
        kf(ph, [[0, 1.05], [0.28, 1.26], [0.44, 0.90], [1, 0.40]]) + 0.18 * shiver,
        kf(ph, [[0, -0.85], [0.30, -0.45], [0.44, -0.95], [1, -0.40]]), e, -0.25);
      poseArmAngles(bones, LK, kf(ph, [[0, -0.15], [0.33, 0.70], [0.50, -0.72], [1, -0.06]]),
        kf(ph, [[0, 1.05], [0.33, 1.34], [0.50, 1.02], [1, 0.46]]) + 0.18 * shiver,
        kf(ph, [[0, -0.85], [0.33, -0.55], [0.50, -1.05], [1, -0.45]]), e, 0.25);
    } else {
      // THE CLAMP: both arms pulled in and both elbows shut — the ball the swing is. The bite's flick
      // squeezes them a little tighter with the legs (the whole shape shuts on that frame).
      poseArmAngles(bones, RK, 0.55 + 0.15 * bite, 0.30, -2.30 - 0.10 * bite, e, -0.3);
      poseArmAngles(bones, LK, 0.55 + 0.15 * bite, 0.30, -2.30 - 0.10 * bite, e, 0.3);
    }
  } else {
    if (miss) {
      // ...and THE TWO ARMS DO TWO DIFFERENT JOBS, which is the whole read of a scramble: the
      // character's LEFT hand drops straight to the deck (a hanging arm, the elbow nearly open — the
      // hand that has to catch HIM) while the RIGHT is flung out wide for the balance. The first
      // keys ARE the windmill's last ones, so the beat where the arms arrive is the beat the legs
      // find the deck: the left hand is already falling when the leading foot slaps down.
      poseArmAngles(bones, RK, kf(ph, [[0, -0.02], [0.26, -0.34], [0.62, -0.86], [1, -0.30]]),
        kf(ph, [[0, 0.40], [0.26, 0.82], [1, 0.42]]),
        kf(ph, [[0, -0.40], [0.26, -0.18], [0.62, -1.06], [1, -1.20]]), e, -0.20);
      poseArmAngles(bones, LK, kf(ph, [[0, -0.06], [0.26, -0.05], [0.56, -0.72], [1, -0.30]]),
        kf(ph, [[0, 0.46], [0.26, 0.24], [1, 0.42]]),
        kf(ph, [[0, -0.45], [0.26, -0.24], [0.62, -0.92], [1, -1.20]]), e, 0.20);
    } else {
      poseArmAngles(bones, RK, kf(ph, [[0, 0.55 + 0.15 * bite], [0.4, 1.05], [1, -0.30]]),
        kf(ph, [[0, 0.30], [1, 0.45]]), kf(ph, [[0, -2.30 - 0.10 * bite], [0.4, -1.15], [1, -0.70]]), e);
      poseArmAngles(bones, LK, kf(ph, [[0, 0.55 + 0.15 * bite], [0.4, 1.05], [1, -0.30]]),
        kf(ph, [[0, 0.30], [1, 0.45]]), kf(ph, [[0, -2.30 - 0.10 * bite], [0.4, -1.15], [1, -0.70]]), e);
    }
  }
  // THE STRETCH, and only on the LEAP. The leap is the phase whose legs are angle-authored and
  // whose whole read is the whip out to the throat, so they are drawn long as they climb — and only
  // there, because every other phase SOLVES the legs (the guard and the landing onto the deck, the
  // clamp onto the neck) and a solved leg must not be stretched: `poseLegIK` answers with angles
  // for the rest lengths, so a stretched leg under a solved foot puts the ankle past its target.
  // The curve then dips under 1 at the end of the leap, so what arrives on the neck is a slightly
  // SHORT leg rather than a long one (the same reason the kip-up's recovery does).
  if (phase === 1) {
    const st = kf(ph, [[0, 1], [0.5, 1.12], [1, 1.08]]);
    poseStretchChain(bones, "leg", RK, st);
    poseStretchChain(bones, "leg", LK, st);
  }
  // ...and THE HANDS. A landed scissor is a GRIP, so the fingers are shut for it (and half-shut on
  // the leap, where the reach is still a reach); a WHIFF is the opposite — there is nothing in them
  // from the first frame to the last, so they stay open the whole way round, which is a detail the
  // first pass at the miss did not carry and is most of what a failed grab looks like in a close-up.
  const gripT = phase === 1 ? 0.6 : 1;
  poseGrip(bones, miss ? SCISSOR.missGrip : gripT, e);
}

// ---- skill 3: THE LAUNCH (the charge, the rising kick, and the carry into the sky) ----
//
// The brief, verbatim:
//
// > "remove the press twice thing for skill 3 and make it more like chargy animtion and make it when
// > it hits it drags the enemy up with the player liek the player hits the enemy with his kid up but
// > in the hit frame the player goes high up in the sky with the enemy face pressed against the
// > player feet and then while theyre mid air u start an air combo"
//
// It was a KIP-UP for ~36 sessions (over backwards onto both palms, the legs whipped up over his own
// face; *"replace skill 3 animation with a kid-up an exaggerated kid-up"*, session 56). It is a
// CHARGE now, and the four phases are the four beats of one explosive movement:
//
//   * 0 CHARGE — he SINKS into a deep coil and BUILDS it there. The slowest, calmest beat in the
//     move on purpose: a charge that arrives as fast as the thing it charges is not a charge, and
//     the whole point of it is to give the kick something to be louder than. `charge` (below) is
//     the weight the hold carries, and the QUIVER riding on it is the tell that the coil is under
//     load — he drops a couple of centimetres into it across the hold and shakes on the spot.
//   * 1 KICK — the coil releases. Both legs snap UP out of the fold to full length, past vertical
//     (the whip, kept as a close PAIR per the user's *"dont split the legs in the 2nd kip up skill
//     make them close tightly"*), and the CONTACT fires at the top of it, on the frame the pair is
//     longest and highest. That is the "hit him with his kick up" the user asked for, and it is the
//     frame `player.js` launches off (`capoContact`). The arms leave the coil with the legs and meet
//     OVERHEAD, straight and together — *"close the arms together and stretch them upward when he
//     strikes"* — and the body is already arched back by the contact (*"make body lean back like 50%
//     more"*), so the two read as one line from the boots to the hands.
//   * 3 CARRY — a kick that LANDED. He hangs in the air with both SOLES presented down-forward and
//     the body it caught pinned by the FACE to them (see `capoCarry` in player.js / enemies.js).
//     The legs come down out of the kick and settle; the trunk arches back and the arms are thrown
//     wide, which is most of what reads as being THROWN up rather than eased up.
//   * 2 RECOVER — a whiff. The hop comes down, the feet catch the deck and take it, and he stands
//     back up into the stance the ground state cross-fades against.
//
// TWO CHANNELS RULE THE SHAPE, and both are inherited from the kip-up this replaced:
//
//   * `lay` — `hips.rotation.x` — tips the whole body about the hips. NEGATIVE arches him back
//     (the kip-up laid him flat on the deck with -1.78; the carry is a small -0.36, which is what
//     "thrown up" looks like), POSITIVE folds him forward over the coil. The arch is 1.5× what it
//     was, on the user's *"make body lean back like 50% more"* — see the note on the kick's own
//     `lay` for why one number does the whole body and why it now arrives at the contact.
//   * the legs are authored as TOTAL WORLD angles (`thighWorld`), and the joint angle handed to
//     `poseLegAngles` is `(thighWorld - lay)`: a leg is a DIRECTION IN THE WORLD, and the number
//     that expresses it must not change when the body it hangs off tips over.
//
// THE WHOLE MOVE IS AUTHORED IN DRAWN UNITS — `CX`. Every other pose in this file is written
// exaggerated and scaled down 20% on the way out by `POSEX` (0.8); this one divides that back out,
// so the numbers below are the angles that actually reach the rig. `poseHipY` (hip HEIGHTS, rig
// units) is deliberately NOT in drawn units and must stay out.
const CAPO = {
  bank: 0.12,         // the small roll he leans onto the kicking leg, and spends on the way up
  coilHip: 0.68,      // the hip at the bottom of the charge (standing is `HIP_Y` 1.00)
  coilSink: 0.05,     // ...how much further he sinks across the hold, and the scale of the quiver
  kickThigh: -3.00,   // the kick's peak: both legs up over his own face, a whisker FORWARD of the
                      // vertical (a rising kick, not a kip-up's lay-back — the pair points at the
                      // sky he is about to be thrown into)
  kickHip: 1.12,      // ...and the hip there, which is where the launch is thrown from
  carryHip: 0.94,     // the carry: the hip once the legs have come down under him
  carryThigh: -0.86,  // ...both legs a full step FORWARD of the vertical, the soles presented
  carryKnee: 0.16,
  carrySole: 0.42,    // ...and the toes down, so what the body is pinned to is the SOLE, not the toe
  stanceHip: 0.96,
};

// ...and the body's own ROLL, read by the pose (which tilts the hips, the trunk and the head with
// it) AND by player.js, which rolls the whole rig by the same number (see `updateVisual`). One
// function, so the two can never disagree about how far over the body is — the same bargain the
// old kip-up's `capoBank` made when the palm was solved in the rig's frame.
//
// It is a LEAN ONTO ONE LEG now, and it belongs to the CHARGE: a man coiling to jump puts his weight
// on the leg he is going to drive off, so the roll picks up through the sink, rides the hold, and is
// spent on the way up the kick.
function capoBankAt(phase, ph) {
  if (phase === 0) return kf(ph, [[0, 0], [0.30, CAPO.bank], [1, CAPO.bank]]);
  if (phase === 1) return kf(ph, [[0, CAPO.bank], [0.5, CAPO.bank * 0.35], [1, CAPO.bank * 0.12]]);
  if (phase === 3) return kf(ph, [[0, CAPO.bank * 0.12], [0.4, 0], [1, 0]]);
  return 0;
}

function poseCapo(bones, e, u, phase, ph) {
  // The kip-up is written in DRAWN units — see the note above the `CAPO` table. Every angle below
  // is the one that reaches the rig; `CX` is what undoes the file's global tone-down on the way in.
  const CX = 1 / POSEX;
  const bank = capoBankAt(phase, ph);
  // HOW MUCH OF THE CHARGE IS ON (see the header): 0 through the drop, 1 across the whole hold,
  // spent in the last seventh before the release. Two things read off it — the extra sink and the
  // QUIVER (a shake on the spot, which is the only thing in a still shape that says LOAD rather
  // than man-crouching).
  const charge = phase === 0 ? kf(ph, [[0, 0], [0.28, 0], [0.44, 1], [0.86, 1], [1, 0.72]]) : 0;
  const quiver = phase === 0 ? Math.sin(ph * 82) * CAPO.coilSink * 0.24 * charge : 0;

  // ...and TWO MORE channels, the pair that make the wind-up a WIND-UP: `wind` is the SPINE turning
  // the shoulders away from the target, and the head's own y takes the whole of it back out again so
  // his eyes stay on the man he is about to take off the floor. It is the one thing in the charge
  // that reads from the CHASE camera, which is behind him: the drop and the fold are foreshortened
  // to nothing from there, but a pair of shoulders swinging through 17° and snapping back is plain,
  // and it is the cheapest "he is loading something" a still beat can be given.
  //
  // It is on the TORSO and not on the hips, and that is a foot-slide decision: a y rotation at the
  // hips takes the legs round with it, so a 17° wind would slide both planted feet ~0.14 u sideways
  // across the deck. The trunk is the end of the body that has nothing to do with the floor.
  // (The `twist` argument of `armW` is the upper arm's own roll and is a different thing.)
  let hip, lay, tuck, headX, wind;
  if (phase === 0) {
    // THE CHARGE. The drop is FAST (a third of the second it takes) and everything after it is
    // slow: the read is that he has stopped moving and started BUILDING, so the hips carry on
    // sinking a couple of centimetres through the hold while the legs stay exactly where the squat
    // put them. The trunk folds over the knees and the HEAD stays up — a coil with the chin on the
    // chest is a man folding up; a coil with his eyes still on the target is a man about to take it
    // off the floor.
    //
    // ...and the load is REAL: measured off the rig, the hips fall 1.00 → 0.585 (41 cm, and all but
    // the first 31 of them before the hold starts), the trunk folds 0.06 → 0.75 rad and the wind is
    // 0.28 / 0.34 rad by the release. The last of every one of those keys is the FIRST key of the
    // kick (see the boundary note on the legs) so the release starts from the bottom of the load
    // and there is no frame where the move stands up before it fires.
    hip = kf(ph, [[0, HIP_Y], [0.28, CAPO.coilHip], [0.62, CAPO.coilHip - CAPO.coilSink * 0.7], [0.88, CAPO.coilHip - CAPO.coilSink * 1.5], [1, CAPO.coilHip - CAPO.coilSink * 1.9]]) + quiver * 0.5;
    lay = kf(ph, [[0, 0], [0.28, 0.19], [0.62, 0.24], [0.88, 0.29], [1, 0.31]]);
    tuck = kf(ph, [[0, 0.06], [0.28, 0.48], [0.62, 0.60], [0.88, 0.70], [1, 0.75]]);
    headX = kf(ph, [[0, 0], [0.28, -0.19], [0.62, -0.26], [0.88, -0.31], [1, -0.34]]);
    wind = kf(ph, [[0, 0], [0.28, 0.21], [0.62, 0.30], [1, 0.36]]);
  } else if (phase === 1) {
    // THE KICK. The beat the user's *"i think u made number 3 animtion worst"* bought 80 ms for (see
    // `P.CAPO_KICK_T`), and everything in it still arrives together: the legs go from the fold to
    // full extension past vertical, the hips ride up over them, the trunk whips open from folded to
    // arched, the wind unwinds, and both arms are thrown up off the coil they were cocked on. The
    // CONTACT fires at `ph` 0.34, one frame inside the peak.
    hip = kf(ph, [[0, CAPO.coilHip - CAPO.coilSink * 1.9], [0.30, 0.92], [0.62, CAPO.kickHip], [1, CAPO.kickHip + 0.03]]);
    // THE TRUNK GOES OVER THE TOP. `lay` is the whole body tipping about the hips (the trunk rides
    // it, and the legs' world angles are held by the `- lay` in `legW`), so this one number is the
    // move's headline shape — and the user's *"fix skill 3 torso position ... it should be the
    // inverse of whats the torso position rn"* is the rewrite of it. It used to arch back only
    // 0.31 → -0.36 rad (18°) and stop: the trunk pointed UP out of the hips for the whole beat,
    // which left the body JACKKNIFED — the trunk and the legs both standing up out of the hips,
    // the head buried between the boots, and (in the user's drawing, a red box round what the trunk
    // did and a green one round where it should be) no body at all in the column below the hips.
    //
    // It is a KIP-UP again: the trunk whips back THROUGH upright and all the way over, so by the
    // hold the shoulders are past vertical-down and the trunk hangs DOWN out of the hips toward the
    // deck — the green box, and the shape this move was for its first 36 sessions (*"the two boots
    // over two spread hands"*, see "The three skills"). The legs are untouched by it: they are
    // authored in WORLD angles, so the boots stay exactly where the wedge is and the kick still
    // lands on the same frame (`capoContact` reads the boot, not the shoulders). What moves is the
    // half of him that was never doing anything — the trunk, the head and the arms, which are all
    // authored off the chest and so hang off the new line for free: the arms' *"overhead"* becomes
    // the palms reaching for the deck once the shoulders are under him, which is the palm-plant of
    // the original.
    //
    // ONE KEY DOES THE WHOLE WHIP (`ph` 0 → 0.75 = 12.7 frames) and the last quarter is the HOLD,
    // which is both the shape the user drew and what puts the eye on the boots at the contact. The
    // swing is 3.26 rad (187°) and the curve is a single eased segment, so the trunk ACCELERATES
    // out of the coil and decelerates into the hold; measured on the live rig the whip peaks at
    // **22°/frame** at its middle and is under 10 for its last third — a whip, not the four-frame
    // flicker the arms were once caught doing. At the CONTACT (`ph` 0.34) the trunk is -1.09 rad
    // (62° laid back) with the boots already at full extension, and at `ph` 0.64 — the frame the
    // user's own sheet is drawn on — it is **-2.75 rad**, 20° short of straight down.
    lay = kf(ph, [[0, 0.31], [0.75, -2.95], [1, -2.98]]);
    tuck = kf(ph, [[0, 0.75], [0.30, 0.16], [0.62, -0.17], [1, -0.23]]);
    headX = kf(ph, [[0, -0.34], [0.30, -0.38], [1, -0.44]]);
    // ...and the WIND IS SPENT, whole, in the first third of the beat (the unwinding overshoots a
    // whisker past square and settles, which is the recoil) — so the shoulders that were wound 21°
    // away from the man are square on him by the frame the boot lands.
    wind = kf(ph, [[0, 0.36], [0.30, 0.12], [0.52, -0.05], [1, 0]]);
  } else if (phase === 3) {
    // THE CARRY. The legs come down out of the kick and settle under him with the soles presented,
    // and the body hangs off the kick's own arch. It is a HOLD: the last two thirds of the beat
    // barely move, which is what puts the eye on the body pinned to his feet rather than on him.
    hip = kf(ph, [[0, CAPO.kickHip + 0.03], [0.30, 1.00], [0.62, CAPO.carryHip], [1, CAPO.carryHip - 0.01]]);
    // ...and the KIP-UP'S LANDING is this beat: the trunk comes back up out of the inversion the
    // kick handed it (`-2.98`, its first key) and rights itself over the hips onto his feet, in ONE
    // eased segment over the first 72% of the beat — **20°/frame** at its middle, a fifth slower
    // than the whip that put him there, because the body is coming out of a hold and into a launch
    // rather than out of a coil. The last 28% is the settle onto the hang (under 11°/frame), which
    // is the beat's own brief: what the eye is on is the body pinned to his soles, and the pose has
    // to be still enough for the eye to find it.
    lay = kf(ph, [[0, -2.98], [0.72, -0.80], [1, -0.35]]);
    tuck = kf(ph, [[0, -0.23], [0.30, -0.12], [0.62, -0.06], [1, -0.05]]);
    headX = kf(ph, [[0, -0.44], [0.30, -0.20], [1, -0.14]]);
    // ...and the wind is already spent (the kick's last key is 0), so the body the carry hangs off
    // is square on the man it is holding — nothing to unwind while the eye is on him.
    wind = 0;
  } else {
    // THE RECOVER (a whiff). The hop comes down, the feet catch the deck and take it — that dip is
    // the whole of the landing — and he comes back up into the stance. The stance is the one every
    // state change cross-fades against, so the handover into `ground` has nothing left to blend.
    hip = kf(ph, [[0, CAPO.kickHip + 0.03], [0.26, 1.16], [0.48, 0.90], [0.70, 0.86], [1, 1.00]]);
    // ...and a whiff comes out of the same inversion the hit does (its first key is the kick's last,
    // `-2.98`) and rights itself the same way before the dip and the stand-up, so a whiff and a hit
    // leave the kick in the same shape and land the same way up. A couple of degrees per frame
    // slower than the carry for the same distance, because this beat is 0.26 s against its 0.22.
    lay = kf(ph, [[0, -2.98], [0.72, -0.70], [1, 0]]);
    tuck = kf(ph, [[0, -0.23], [0.30, 0.06], [0.66, 0.34], [1, 0.06]]);
    headX = kf(ph, [[0, -0.44], [0.36, -0.06], [0.70, 0.14], [1, 0]]);
    wind = 0;
  }
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", lay * CX, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", bank * 0.30, e);
  poseRot(bones, "torso", "x", tuck * CX, e);
  poseRot(bones, "torso", "y", wind * CX, e);
  poseRot(bones, "torso", "z", bank * 0.30, e);
  poseSettleTorso(bones, e);
  // THE HEAD, and it is on the same channel as the trunk: the coil folds under it, the kick throws
  // it back with the arch, and the carry keeps it level — the one part of him that never stops
  // watching what he is doing. (Head Y/Z take a share of the bank so the roll is a roll of the whole
  // body rather than of a stack of parts that each happen to be level — and Y also takes the whole
  // of the spine's `wind` back out, so the shoulders wind and the eyes do not.)
  poseRot(bones, "head", "x", headX * CX, e);
  poseRot(bones, "head", "y", -wind * CX, e);
  poseRot(bones, "head", "z", bank * 0.25, e);

  // ONE LEG, authored as the WORLD direction it points in (see the note at the top): the joint
  // angle is whatever is left once the body's own lay has been taken back out of it. `CX` cancels
  // the global tone-down on this channel too, so a `thighWorld` is drawn as the world direction it
  // says — the one property that makes the legs tunable at all.
  const legW = (side, thighWorld, knee, sole, splay) =>
    poseLegAngles(bones, side, (thighWorld - lay) * CX, knee * CX, sole * CX, splay * CX, e);
  const armW = (side, upX, upZ, elbow, twist) =>
    poseArmAngles(bones, side, upX * CX, upZ * CX, elbow * CX, e, twist * CX);

  // The two legs, per phase — a PAIR rather than a lead and a trail, and the boundary values are
  // SHARED between neighbouring phases so the move has no corners in it (the coil's last key is the
  // kick's first, the kick's last is the carry's and the recover's first).
  if (phase === 0) {
    // ...the two legs through the charge: a REAL squat. The thigh drives forward over the foot and
    // the knee folds, authored as the pair that keeps the ankle where it already is, so the hips
    // drop a third of a metre and the soles stay ON the deck. The quiver rides on it — the legs are
    // what is straining, so they shake with everything else.
    legW(LK, kf(ph, [[0, -0.10], [0.30, -0.78], [0.86, -0.80], [1, -0.84]]) + quiver,
      kf(ph, [[0, 0.30], [0.30, 1.42], [0.86, 1.46], [1, 1.52]]),
      kf(ph, [[0, 0.20], [0.30, -0.28], [0.86, -0.30], [1, -0.32]]), kf(ph, [[0, 0.05], [0.30, 0.12], [1, 0.13]]));
    legW(RK, kf(ph, [[0, -0.10], [0.30, -0.75], [0.86, -0.77], [1, -0.81]]) - quiver,
      kf(ph, [[0, 0.30], [0.30, 1.40], [0.86, 1.44], [1, 1.50]]),
      kf(ph, [[0, 0.20], [0.30, -0.26], [0.86, -0.28], [1, -0.30]]), kf(ph, [[0, 0.05], [0.30, 0.13], [1, 0.14]]));
  } else if (phase === 1) {
    // ...the KICK: both legs snap out of the fold to full length and HOLD across the contact
    // (`0.34` → `0.52` on the LEAD leg) — the frame the pair is longest, highest and straightest
    // is the frame the boot lands. Then they swing down and through underneath him, which is what
    // leaves the carry's shape continuous with the end of this one.
    //
    // THE TRAIL LEG IS A BEAT LATER NOW (its peak is `0.50`, not `0.38`), and it is the one change
    // to the shape the readability pass made: the two of them still cross the whole of every channel
    // together — nothing is split, and they are still within 2° of each other at the top — but a
    // pair that arrives on the same frame is a pair that reads as ONE limb, and a limb is exactly
    // what the strike looked like from the chase camera. Two and a half frames of stagger is enough
    // for the eye to see a leg throw another leg after it, and the contact frame (the lead leg's own
    // peak) now catches the move mid-throw instead of at the end of one.
    legW(LK, kf(ph, [[0, -0.84], [0.20, -2.20], [0.34, CAPO.kickThigh], [0.52, CAPO.kickThigh], [0.78, -2.50], [1, -1.80]]),
      kf(ph, [[0, 1.52], [0.20, 0.60], [0.34, 0.03], [0.52, 0.02], [0.78, 0.32], [1, 0.64]]),
      kf(ph, [[0, -0.32], [0.30, -0.10], [0.60, 0.22], [1, 0.30]]), kf(ph, [[0, 0.13], [0.40, 0.05], [1, 0.05]]));
    legW(RK, kf(ph, [[0, -0.81], [0.24, -1.95], [0.50, CAPO.kickThigh + 0.06], [0.66, CAPO.kickThigh + 0.06], [0.84, -2.46], [1, -1.76]]),
      kf(ph, [[0, 1.50], [0.24, 0.62], [0.50, 0.08], [0.66, 0.05], [0.86, 0.34], [1, 0.66]]),
      kf(ph, [[0, -0.30], [0.34, -0.08], [0.66, 0.24], [1, 0.32]]), kf(ph, [[0, 0.14], [0.40, 0.05], [1, 0.05]]));
  } else if (phase === 3) {
    // ...and the CARRY: the legs swing down out of the kick and settle with the soles presented
    // down and a step forward — the shape a man hangs in when he is STANDING on something in the
    // air — and then they hold, because the beat's whole job is to be still enough to read the body
    // pinned to them. The two soles end within 3 cm of each other, which is the pair this move has
    // kept since the user closed the split on it.
    legW(LK, kf(ph, [[0, -1.80], [0.30, -0.92], [0.62, CAPO.carryThigh], [1, CAPO.carryThigh - 0.02]]),
      kf(ph, [[0, 0.64], [0.30, 0.52], [0.62, CAPO.carryKnee], [1, CAPO.carryKnee]]),
      kf(ph, [[0, 0.30], [0.30, 0.30], [0.62, CAPO.carrySole], [1, CAPO.carrySole]]), kf(ph, [[0, 0.05], [1, 0.06]]));
    legW(RK, kf(ph, [[0, -1.76], [0.34, -0.88], [0.66, CAPO.carryThigh - 0.02], [1, CAPO.carryThigh - 0.04]]),
      kf(ph, [[0, 0.66], [0.34, 0.56], [0.66, CAPO.carryKnee + 0.03], [1, CAPO.carryKnee + 0.03]]),
      kf(ph, [[0, 0.32], [0.34, 0.32], [0.66, CAPO.carrySole + 0.02], [1, CAPO.carrySole + 0.02]]), kf(ph, [[0, 0.05], [1, 0.05]]));
  } else {
    // ...and the RECOVER: the legs come down FAST (the whip swings through and the soles reach for
    // the deck in the first third of the beat), the knees take the landing under a hip that dips
    // with it, and then he stands up out of the dip into the stance.
    legW(LK, kf(ph, [[0, -1.80], [0.30, -1.05], [0.52, -0.22], [0.70, -0.16], [1, -0.10]]),
      kf(ph, [[0, 0.64], [0.30, 0.72], [0.52, 0.46], [0.70, 0.62], [1, 0.30]]),
      kf(ph, [[0, 0.30], [0.36, 0.10], [0.62, -0.06], [1, 0.02]]), kf(ph, [[0, 0.05], [1, 0.08]]));
    legW(RK, kf(ph, [[0, -1.76], [0.30, -1.02], [0.55, -0.18], [0.72, -0.13], [1, -0.07]]),
      kf(ph, [[0, 0.66], [0.30, 0.74], [0.55, 0.49], [0.72, 0.64], [1, 0.32]]),
      kf(ph, [[0, 0.32], [0.36, 0.12], [0.62, -0.04], [1, 0.03]]), kf(ph, [[0, 0.05], [1, 0.09]]));
  }
  // THE STRETCH — the user's own note on the whip the move was built on: "the second he extends his
  // legs they stretch out taller". The legs squat slightly into the coil, are at their LONGEST on
  // the kick's own peak (a PLATEAU across the contact, because `poseStretchApply` spends a request
  // through an exponential ease — a one-frame spike measures as almost nothing), and are spent
  // before the soles reach the deck on the recover, because a 20%-long leg still stretched on the
  // frame it plants drives the sole through it.
  if (phase === 0) {
    const q = kf(ph, [[0, 1], [0.30, 0.90], [0.86, 0.88], [1, 0.94]]);
    poseStretchChain(bones, "leg", LK, q);
    poseStretchChain(bones, "leg", RK, q);
  } else if (phase === 1) {
    poseStretchChain(bones, "leg", LK, kf(ph, [[0, 0.94], [0.10, 1.14], [0.30, 1.40], [0.56, 1.40], [0.80, 1.12], [1, 1]]));
    poseStretchChain(bones, "leg", RK, kf(ph, [[0, 0.94], [0.16, 1.06], [0.46, 1.34], [0.72, 1.32], [0.90, 1.08], [1, 1]]));
  } else if (phase === 3) {
    const q = kf(ph, [[0, 1], [0.30, 1.08], [0.62, 1], [1, 1]]);
    poseStretchChain(bones, "leg", LK, q);
    poseStretchChain(bones, "leg", RK, q);
  } else {
    const q = kf(ph, [[0, 1], [0.16, 1.14], [0.32, 1.22], [0.50, 1.02], [0.66, 0.94], [1, 1]]);
    poseStretchChain(bones, "leg", LK, q);
    poseStretchChain(bones, "leg", RK, q);
  }

  // The arms, and they have the whole move's story in them: drawn DOWN AND BACK into the coil (the
  // anticipation — half of what a charge has to say from the chase camera is two arms going behind
  // him), thrown UP off it on the kick, thrown WIDE on the carry (which is what reads as the pop),
  // and drawn back down into the guard as he lands.
  //
  // THE THROW LEAVES A BEAT EARLY, and that is where most of the fix the kick's new length bought
  // actually lands. On the old 0.20 s beat the arms were asked to cover **3.52 rad — 202°, the
  // longest single-joint travel in the move** — between `ph` 0 and 0.34 of the kick, i.e. in four
  // frames: measured on the rig at 60 Hz, the upper arm peaked at **48°/frame** and the hands
  // crossed 0.60 u of the body in one frame. At any framerate that is not a throw, it is a flicker
  // — and a flicker on the one channel a charge animation is *about* (the user's *"close the arms
  // together and stretch them upward when he strikes"*) is exactly what "the animation is worse"
  // looks like. So the arms now start up in the coil's own last eighth (the keys below swing back to
  // 0.60 at `ph` 0.76 and are already on their way forward by 0.90) and the kick's beat picks the
  // swing up from there. Same shape, same endpoints, same frame at the contact — spread over
  // **13 frames instead of 4**, which measures at 15°/frame.
  if (phase === 0) {
    armW(LK, kf(ph, [[0, -0.20], [0.28, 0.52], [0.76, 0.60], [0.90, -0.25], [1, -0.95]]) + quiver * 1.6,
      kf(ph, [[0, 0.35], [0.30, 0.30], [0.86, 0.27], [1, 0.22]]),
      kf(ph, [[0, -1.20], [0.30, -0.92], [0.76, -0.86], [1, -0.70]]), 0.2);
    armW(RK, kf(ph, [[0, -0.34], [0.28, 0.62], [0.76, 0.70], [0.92, -0.17], [1, -0.88]]) - quiver * 1.6,
      kf(ph, [[0, 0.28], [0.30, 0.26], [0.86, 0.23], [1, 0.18]]),
      kf(ph, [[0, -1.34], [0.30, -1.00], [0.76, -0.94], [1, -0.76]]), -0.2);
  } else if (phase === 1) {
    // THE STRIKE, and the user's *"close the arms together and stretch them upward when he strikes"*
    // is the whole of these six lines. Both arms are already on their way up (the coil's own last
    // keys hand them over at -0.95 / -0.88 — see the note above) and they meet OVERHEAD: `upX` runs
    // past -PI/2 (horizontal-forward) to -2.80, which is 20° short of straight up, `upZ` comes IN to
    // 0.12–0.16 so the two of them share the sagittal plane the head is in rather than being thrown
    // wide (the old keys were 0.82/0.76), and the elbow goes to ZERO — a straight arm — where it was
    // folded to -0.32. So what the pop is drawn with is one long line through both shoulders instead
    // of two bent arms out to the sides, which is what "stretched upward" asked for.
    //
    // ...and the two of them arrive there at `ph` 0.40 / 0.44 — a hair AFTER the contact at 0.34,
    // which is the change from the 0.20 s beat, where they arrived exactly ON it and had to cover
    // the whole 202° in the four frames before it. At the contact they are now at **-2.64 rad (61°
    // above horizontal, 29° off vertical)** — up, and unmistakably part of an upward strike — and
    // the last 20° finishes as the legs start down, so the throw reads as following through rather
    // than as arriving with the boot. The right arm trails the left by 0.04 through both, which is
    // what keeps the pair from reading as one welded limb.
    armW(LK, kf(ph, [[0, -0.95], [0.14, -1.60], [0.40, -2.80], [0.66, -2.74], [1, -2.55]]),
      kf(ph, [[0, 0.22], [0.34, 0.16], [0.64, 0.13], [1, 0.14]]),
      kf(ph, [[0, -0.70], [0.30, -0.30], [0.52, -0.05], [1, -0.10]]), 0.2);
    armW(RK, kf(ph, [[0, -0.88], [0.18, -1.50], [0.44, -2.74], [0.70, -2.66], [1, -2.50]]),
      kf(ph, [[0, 0.18], [0.38, 0.13], [0.66, 0.11], [1, 0.12]]),
      kf(ph, [[0, -0.76], [0.34, -0.32], [0.56, -0.08], [1, -0.12]]), -0.2);
  } else if (phase === 3) {
    // ...and the pop: the arms come down out of the strike's overhead line and OPEN out to the sides,
    // which is the counterweight to the body hanging off the feet and the reason the rise reads from
    // BEHIND (the player only ever sees his back here). They start where the kick left them — still
    // overhead — because that boundary is the kick's own last key, and only then spread.
    armW(LK, kf(ph, [[0, -2.55], [0.34, -1.55], [0.66, -1.00], [1, -0.95]]),
      kf(ph, [[0, 0.14], [0.34, 0.66], [0.66, 1.02], [1, 1.05]]),
      kf(ph, [[0, -0.10], [0.34, -0.40], [1, -0.48]]), 0.2);
    armW(RK, kf(ph, [[0, -2.50], [0.38, -1.48], [0.70, -0.92], [1, -0.87]]),
      kf(ph, [[0, 0.12], [0.38, 0.60], [0.70, 0.94], [1, 0.97]]),
      kf(ph, [[0, -0.12], [0.38, -0.46], [1, -0.56]]), -0.2);
  } else {
    // ...and the whiff's arms take the same handover and drop out of the overhead line into the guard.
    armW(LK, kf(ph, [[0, -2.55], [0.40, -0.80], [1, -0.28]]),
      kf(ph, [[0, 0.14], [0.40, 0.52], [1, 0.40]]),
      kf(ph, [[0, -0.10], [0.60, -1.00], [1, -1.15]]), 0.2);
    armW(RK, kf(ph, [[0, -2.50], [0.40, -0.74], [1, -0.24]]),
      kf(ph, [[0, 0.12], [0.40, 0.46], [1, 0.34]]),
      kf(ph, [[0, -0.12], [0.60, -1.06], [1, -1.22]]), -0.2);
  }
  // ...and the ARM's own stretch rides the kick alone: the arms are thrown out of the coil long,
  // which is what makes the throw read as a throw rather than as a gesture.
  if (phase === 1) {
    // ...and the arm's stretch rides the arm's own arrival rather than the contact: it peaks at
    // `ph` 0.44 / 0.48, which is the frame the hands actually reach the top of the throw (see the
    // arm note above — they arrive a hair after the boot now), so what is drawn long is the arm
    // while it is being thrown rather than an arm that is already spent.
    poseStretchChain(bones, "arm", LK, kf(ph, [[0, 1], [0.28, 1.14], [0.44, 1.22], [0.70, 1.14], [1, 1.06]]));
    poseStretchChain(bones, "arm", RK, kf(ph, [[0, 1], [0.32, 1.10], [0.48, 1.20], [0.74, 1.10], [1, 1.04]]));
  }
  // ...and the hands: OPEN through the coil and the kick (nothing is being held yet), and shut on
  // the one thing that is — the body the carry has by the face.
  poseGrip(bones, phase === 3 ? 0.55 : 0.30, e);
}

// ---------------------------------------------------------------------------
// THE DASH — Q with a DIRECTION held (see `startDash` in player.js). The parkour roll grew into a
// four-direction dodge: a fast STEP that way, and there are three of them on this one function.
// `kind` is which — 0 FRONT, 1 SIDE, 2 BACK — and `side` is which way a sidestep goes (+1 = the
// character's own RIGHT, the same side convention as `RK` / `poseLegIK`). Everything is authored in
// the RIG's frame, so a sidestep is the same shape mirrored rather than a second table.
//
// The body does NOT turn onto the line it is dashing down, and that is the whole read of the
// thing: a backstep that turned round to face where it was going is just a run, and a dodge has to
// keep the fighter's eyes on the thing he is dodging. Only the FRONT dash faces its own line (it
// is a lunge — see `startDash`), and it is the one that keeps the roll's own bargain: it carries
// the speed you brought into it.
//
// Both feet are SOLVED onto the deck (`poseLegIK`, the same contact solver the landing and the
// skills' grounded phases use), because a step IS a contact — the lead foot reaches out and the
// trailing one pushes off, and neither may float or dig. A step is the one grounded move that
// abducts the legs hard AND leans the whole rig at the same time, though, and neither is something a
// sagittal solver knows about, so `step` below puts both of them back in before it is done — see
// its own note, and "The `Q` dash" in src/README.md for the measurements.
const DASH = {
  hip: 0.20,        // how far the hips DROP at the opening — he sits onto the lead leg
  // `front` / `trail` / `leanF` were the FRONT lunge's own reach and lean. They are DEAD since the
  // front step became the spin kick (`poseSpinKick`), which places its feet and its lean out of its
  // own beat table instead — kept rather than deleted only because the side and back steps still
  // share the table and re-tuning the lunge is one line away if it is ever wanted back.
  front: 0.50,      // (unused) how far the lead foot reached ahead on the old front dash (rig units)
  trail: 0.32,      // (unused) ...and how far the other one was left behind
  side: 0.60,       // how wide the lead leg goes out on a sidestep
  back: 0.40,       // ...and how far the trailing foot is thrown behind on a backstep
  leanF: 0.46,      // (unused) the old front lunge's trunk lean
  leanS: 0.22,      // ...side
  leanB: -0.20,     // ...and back: he leans AWAY from where the step is taking him
  bank: 0.34,       // how far the whole body rolls into a sidestep
};

// Scratch for the sole solve below (`step`): the world up, carried down the leg the foot hangs
// from. The leg bones are hinged groups with no rotation of their own, so every one of them is
// aligned with the rig's frame at rest — which is what makes the chain a plain sequence of
// axis-angle turns of this one vector.
const _dashUp = new THREE.Vector3();
const _dashAX = new THREE.Vector3(1, 0, 0);
const _dashAY = new THREE.Vector3(0, 1, 0);
const _dashAZ = new THREE.Vector3(0, 0, 1);

// ---------------------------------------------------------------------------
// SKILL 1 — THE FLYING KNEE (see `knee` / `updateKnee` in player.js). Three beats on one state, and
// every boundary between them is SHARED, so the three read as one move rather than as three:
//
//   `phase` 0  THE RUN-UP. He is already committed to a line and driving up it. The LEGS are the
//              RUN CYCLE's own — `poseRun`, played exactly the way the whirl's haul plays its own
//              walk — and they are advanced off the speed actually carried, so the stride cannot
//              skate; everything above them is the drive: the trunk thrown out over the front
//              foot, the head up, the arms pumping. There is deliberately no hip key here:
//              `poseRun` solves the two feet onto the deck from the hip IT writes, and moving the
//              hip after that without re-solving would drive both soles through the pavement.
//   `phase` 1  THE LEAP. `u` is the solved arc's own 0..1 (see `kneeLeap`): the takeoff, the KNEE,
//              and the brace for the deck. The strike thigh drives up PAST the horizontal with the
//              shin folded hard under it — the knee is the weapon, so it leads everything — the
//              trailing leg is whipped back and left long, the trunk arches BACK away from the
//              strike and both arms are thrown behind it. The limb STRETCH channel is spent on the
//              strike leg through the drive, which is the same trick the kip-up's whip uses to draw
//              its legs longer than they are.
//   `phase` 2  THE LANDING. `u` is the settle, and it is 0 for as long as the body is still in the
//              air — a knee that lands comes out of a CONTACT at head height, so there is always a
//              fall after it — which is what holds the opening BRACE: the knee still out in front,
//              the legs reaching down for the deck under it. Then the plant, the skid, and up onto
//              the feet, ending exactly on `REST` so the handover back to the run costs nothing.
//
// `KNEE_BRACE` is the ONE dial the whole thing is scaled by, and 1.25 is not a taste: every angle
// channel in this file is drawn through `POSEX` (0.8, the global "tone every action pose down 20%"
// dial — see the note on it), so 1.25 is exactly the number that hands the authored values BACK.
// This pose is therefore drawn as written, with none of the tone-down every other action pose
// takes, which is what the user's last two words — *"exaggrate the animtions"* — are buying.
// ---------------------------------------------------------------------------
const KNEE_BRACE = 1.25;

function poseFlyingKnee(bones, e, phase, u, stride, hit) {
  const X = KNEE_BRACE;
  const t = Math.max(0, Math.min(1, u));
  const legA = (side, thigh, knee, sole, splay) =>
    poseLegAngles(bones, side, thigh * X, knee * X, sole * X, splay * X, e);
  const armA = (side, upX, upZ, elbow) => poseArmAngles(bones, side, upX * X, upZ * X, elbow * X, e);
  poseSettleTorso(bones, e);

  if (phase === 0) {
    // ---- THE RUN-UP ----
    poseRun(bones, stride, 1, 1);
    // ...and the DRIVE on top of it. The run's own lean is written for `SPRINT` (10.9); this is
    // nearly twice that, so the trunk goes further over it — and the head comes back up, because
    // the one thing he is looking at is the head he is about to put a knee through.
    poseRot(bones, "torso", "x", 0.30 * X, e);
    poseRot(bones, "torso", "y", 0, e);
    poseRot(bones, "torso", "z", 0, e);
    poseRot(bones, "head", "x", -0.34 * X, e);
    poseRot(bones, "head", "y", 0, e);
    poseRot(bones, "head", "z", 0, e);
    // ...and the fists are SHUT: this is a strike being carried, not a jog.
    poseGrip(bones, 1, e);
    return;
  }

  if (phase === 1) {
    // ---- THE LEAP ----
    // The hips ride the arc — a coil at the takeoff, up through the drive — and the trunk goes from
    // the run-up's forward lean to a hard backward ARCH across it: the knee is out in front and the
    // body is behind it, which is the pose that makes a flying knee read as one.
    const hip = kf(t, [[0, 0.88], [0.16, 1.02], [0.50, 1.06], [0.80, 1.04], [1, 0.96]]);
    const lean = kf(t, [[0, 0.30], [0.16, -0.06], [0.50, -0.46], [0.80, -0.40], [1, 0.14]]);
    const head = kf(t, [[0, -0.18], [0.50, -0.38], [1, 0.12]]);
    const twist = kf(t, [[0, 0], [0.50, 0.12], [1, 0]]);
    // THE STRIKE LEG (the character's own right — see `RK`): the knee comes up and through, past the
    // horizontal, with the shin folded hard under the thigh so the joint itself is the leading
    // point; the sole stays cocked so the flat of the foot is not what arrives.
    const sThigh = kf(t, [[0, -0.55], [0.16, -1.35], [0.50, -2.15], [0.80, -2.10], [1, -1.30]]);
    const sKnee = kf(t, [[0, 1.35], [0.16, 2.10], [0.50, 2.60], [0.80, 2.50], [1, 1.60]]);
    const sSole = kf(t, [[0, 0.50], [0.50, 0.85], [1, 0.30]]);
    const sSplay = kf(t, [[0, 0.10], [0.50, 0.22], [1, 0.12]]);
    // THE TRAILING LEG: whipped back off the drive and left nearly STRAIGHT — the long line the eye
    // reads the knee against — and then swung through underneath for the deck.
    const tThigh = kf(t, [[0, 0.30], [0.16, 0.75], [0.50, 1.12], [0.80, 0.95], [1, 0.10]]);
    const tKnee = kf(t, [[0, 0.55], [0.50, 0.28], [0.80, 0.48], [1, 0.95]]);
    const tSole = kf(t, [[0, -0.20], [0.50, -0.45], [1, -0.10]]);
    // ...and the ARMS: both thrown back and out on the drive (the counterweight the knee is spent
    // against), coming forward for balance as the deck arrives.
    const armX = kf(t, [[0, 0.55], [0.16, 1.05], [0.50, 1.55], [0.80, 1.20], [1, -0.35]]);
    const armZ = kf(t, [[0, 0.30], [0.50, 0.55], [1, 0.65]]);
    const armE = kf(t, [[0, -1.35], [0.50, -0.55], [1, -1.25]]);
    poseHipY(bones, hip, e);
    poseRot(bones, "hips", "x", 0, e);
    poseRot(bones, "hips", "y", twist * 0.5 * X, e);
    poseRot(bones, "hips", "z", 0, e);
    poseRot(bones, "torso", "x", lean * X, e);
    poseRot(bones, "torso", "y", twist * X, e);
    poseRot(bones, "torso", "z", 0, e);
    poseRot(bones, "head", "x", head * X, e);
    poseRot(bones, "head", "y", twist * 0.4 * X, e);
    poseRot(bones, "head", "z", 0, e);
    legA(RK, sThigh, sKnee, sSole, sSplay);
    legA(LK, tThigh, tKnee, tSole, 0.16);
    armA(RK, armX, armZ, armE);
    armA(LK, armX * 0.9, armZ * 1.15, armE * 0.9);
    // ...and the knee is drawn LONGER than it is across the drive (see `poseStretchChain`): the
    // weapon is the whole read, so it is the one thing on the body allowed to lie about its size.
    poseStretchChain(bones, "leg", RK, kf(t, [[0, 1], [0.16, 1.06], [0.50, 1.18], [0.80, 1.12], [1, 1.02]]));
    poseStretchChain(bones, "leg", LK, kf(t, [[0, 1], [0.50, 1.10], [1, 1.02]]));
    poseGrip(bones, 1, e);
    return;
  }

  // ---- THE LANDING ----
  // The brace while the body is still in the air (see the note above) is `t` 0, and the settle runs
  // from the frame the feet find the deck: the plant, the SKID (the hips stay low and the trunk
  // stays folded over them while the deck bites the speed out — see `KNEE_LAND_BRAKE`), and the rise
  // back onto the feet.
  const hip = kf(t, [[0, 0.96], [0.22, 0.74], [0.55, 0.70], [0.80, 0.86], [1, REST.hip]]);
  const lean = kf(t, [[0, 0.14], [0.22, 0.56], [0.55, 0.64], [0.80, 0.30], [1, REST.torsoX]]);
  const head = kf(t, [[0, 0.12], [0.22, -0.20], [0.55, -0.26], [0.80, -0.10], [1, REST.headX]]);
  const hipsX = kf(t, [[0, 0.10], [0.22, 0.24], [0.55, 0.26], [1, REST.hipsX]]);
  // the two ankles' own stations on the deck: the strike leg is the one that comes down AHEAD (it
  // is already out in front), the trailing one plants behind to catch him, so the two feet land
  // staggered and the body is between them.
  const leadZ = kf(t, [[0, 0.44], [0.22, 0.64], [0.55, 0.74], [0.80, 0.40], [1, ANKLE_Z]]);
  const trailZ = kf(t, [[0, -0.02], [0.22, -0.34], [0.55, -0.44], [0.80, -0.16], [1, ANKLE_Z]]);
  const armX = kf(t, [[0, -0.35], [0.22, -0.95], [0.55, -1.15], [0.80, -0.55], [1, REST.arm[0]]]);
  const armZ = kf(t, [[0, 0.65], [0.22, 0.85], [0.55, 0.75], [0.80, 0.45], [1, REST.arm[1]]]);
  const armE = kf(t, [[0, -1.25], [0.22, -1.55], [0.55, -1.60], [0.80, -1.35], [1, REST.arm[2]]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", hipsX * X, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  poseRot(bones, "torso", "x", lean * X, e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseRot(bones, "head", "x", head * X, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  // The legs are SOLVED onto the deck rather than angled (see `poseLegIK`): a skid is a contact, and
  // an authored angle cannot promise the sole stays on the pavement while the hip drops 0.26 u under
  // it. The strike foot lands first and ahead; the trailing one catches behind it.
  poseLegIK(bones, RK, leadZ, ankleForSole(0) - hip, 0.22, e);
  poseLegIK(bones, LK, trailZ, ankleForSole(0) - hip, 0.26, e);
  armA(RK, armX, armZ, armE);
  armA(LK, armX * 0.92, armZ * 1.1, armE * 0.95);
  poseGrip(bones, kf(t, [[0, 1], [0.55, 0.7], [1, 0.35]]), e);
}

// ===========================================================================
// THE RIGHT-CLICK GRAB — three moves on ONE key (see `player.grab`).
//
// One key, three moves, and which one it is, is the state of the body in front of him (see
// `player.grabKind`): a body on its FEET is taken by the CHEST and thrown away, a body on
// the DECK is hauled up by the SHOULDERS and set on its feet, and a body in the AIR above him is
// taken by the LEG and pulled down out of it into the deck. The user's own brief:
//
//   *"make the right click grab the enemy by the chest and throw him away i must touch his chest /
//    and if hes under me on the floor i grab him by the shoulders up and put him up on his feet and
//    when he stands on his feet he does a cartoony dizzy animtion and a ring of starts spin over
//    his head / and if hes airborne above me i grab his leg and pull him down and do a front flip as
//    a i slam his body to the ground"*
//
// All three are GRABS rather than strikes, so all three share the two things that make a grab read
// as one:
//
//   1. **The hands are SOLVED onto the other body, live.** `GRAB_POINT` is the contact ON the
//      enemy's own rig — the sternum, the midpoint of the two shoulders, or the shin (see
//      `enemies.js`'s `chestPoint` / `shoulderPoint` / `legPoint`) — written into the player's own
//      frame every frame by `player.js`, exactly the bargain `CLINCH_HEAD` and `WHIRL_NECK` make.
//      So the fold of the player's own trunk, the reel of the enemy's reaction and the fact that
//      the enemy is being HAULED while the hands are on it are all in the number the hands are
//      asked for. The authored `fb` pair below is only the fallback for a frame with nothing in his
//      hands, and `w` cross-fades onto the live point over the reach. That is what makes *"i must
//      touch his chest"* a measurement rather than a hope.
//   2. **The grip CLOSES on it** (`poseGrip`) and the hands do not open until the move is done with
//      the body — the one channel that says "held" rather than "touched".
//
// The three shapes are authored on the move's OWN clock `t` (0..1 of the whole state), so the
// physics in `player.js` and the shape here can never drift apart: one clock, two readers.
//
// `POSEX` (0.8) is the file's global pose scale, and `poseRot` / `poseLegAngles` / `poseArmAngles`
// multiply by it — so every angle below is authored in real radians through `R()` rather than
// pre-divided by hand. `poseArmReach`, `poseHipY` and `poseLegIK` take their numbers raw.
// ===========================================================================
const GRAB_POINT = new THREE.Vector3();
let grabPointOk = false;

// How far apart the two hands sit on the thing they are holding, in RIG units. A two-handed grip
// is one hand either side of the live point, and the pair has to be wide enough to read as a grip
// and narrow enough that the arms do not cross — measured off the rig, the hands' own width is
// ~0.30 u, so half of it is the natural spread.
const GRAB_SPREAD = 0.15;
// ...and the SHOULDER grip's own, which is not a preference but a measurement: `GRAB_SPREAD` is the
// hands' own width, but a pair of hands on a pair of SHOULDERS has to be the SHOULDERS' own width
// apart or the two are not on the same body parts. The rig's two shoulder joints are `SHOULDER_X`
// either side of the spine, so that is the half-spread (see `poseGrabLift`).
const GRAB_SPREAD_SHOULDER = SHOULDER_X;

// Put BOTH hands on the grab: the two are placed either side of the live point by `spread`, or on
// the authored `fb` pair (`[[x,y,z] for the character's RIGHT hand, ... for the LEFT]` — see `RK`)
// when there is nothing in them, cross-faded by `w`. The lateral split is what keeps a two-handed
// chest grab reading as two hands rather than as one arm drawn twice.
function solveGrabHands(bones, e, w, fb, spread) {
  const sides = [RK, LK];
  const live = grabPointOk && w > 0;
  for (let i = 0; i < 2; i++) {
    const side = sides[i];
    const s = side < 0 ? -1 : 1;
    let tx = fb[i][0], ty = fb[i][1], tz = fb[i][2];
    if (live) {
      tx += (GRAB_POINT.x + s * spread - tx) * w;
      ty += (GRAB_POINT.y - ty) * w;
      tz += (GRAB_POINT.z - tz) * w;
    }
    poseArmReach(bones, side, e, tx, ty, tz);
  }
}

function poseGrab(bones, t, e, kind, grip, miss, rawT) {
  const g = Math.max(0, Math.min(1, grip));
  if (miss) poseGrabMiss(bones, t, e, g);
  else if (kind === 1) poseGrabLift(bones, t, e, g);
  else if (kind === 2) poseGrabSlam(bones, t, e, g);
  else poseGrabThrow(bones, t, e, g, rawT);
}

// --- (0) THE FLASH GRAB --------------------------------------------------------------------------
// Five beats on the move's own clock (`GRAB_PLAY` 1.35): a SLOW crouch with the grabbing arm
// drawn far back (0.00-0.28), a 1-2 frame ROCKET onto the throat (0.28-0.37), the LOCK with
// both feet leaving the deck (0.37), a full 360 swung round the vertical with the body
// dangling (0.37-0.70 — the RIG does the turn, so the pose stays square), and the CRASH down
// into a one-fist hero landing (0.70-1.00). The pose never twists: every turn in this move is
// the rig's (`grabSpinY`), which is what keeps the hands on the throat for the whole swing.
function poseGrabThrow(bones, t, e, g, rawT) {
  const R = (v) => v / POSEX;
  // The charge: while the wind-up crouch builds (real clock under the take time) the coiled
  // body shudders, harder the deeper it gets. Past the lock there is no tremor — the move is
  // faster than shaking from there on.
  const rt = rawT || 0;
  const strain = rt < 0.50 ? Math.min(1, rt / 0.38) : 0;
  const tremor = (f) => Math.sin(rt * 40 + f) * 0.020 * strain;
  // The hips sink slow into the crouch, catch the dash, rise tall for the swing, and slam down
  // into the landing — held low, then stood up.
  const hip = kf(t, [[0, 1.00], [0.14, 0.90], [0.28, 0.72], [0.33, 0.78], [0.37, 0.84], [0.45, 0.97], [0.55, 1.00], [0.65, 0.96], [0.70, 0.76], [0.78, 0.66], [0.88, 0.80], [1, 1.00]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", R(tremor(0) * 0.5), e);
  poseRot(bones, "hips", "z", R(kf(t, [[0, 0], [0.28, 0.05], [0.37, 0], [0.70, 0], [0.78, -0.06], [1, 0]])), e);
  // The trunk folds over the drawn-back fist, spears forward with the dash, opens tall for the
  // swing, and hammers down across the crash.
  poseRot(bones, "torso", "x", R(kf(t, [[0, 0.05], [0.14, 0.24], [0.28, 0.42], [0.33, 0.58], [0.37, 0.30], [0.45, 0.02], [0.55, -0.10], [0.65, -0.04], [0.70, 0.40], [0.78, 0.55], [0.88, 0.28], [1, 0.05]]) + tremor(2.1)), e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", R(kf(t, [[0, 0], [0.28, 0.06], [0.37, 0], [0.70, 0], [0.78, -0.08], [1, 0]])), e);
  poseSettleTorso(bones, e);
  // The head: down into the crouch, level for the dash, up riding the swing, buried in the slam.
  poseRot(bones, "head", "x", R(kf(t, [[0, 0], [0.14, 0.12], [0.28, 0.20], [0.37, 0.10], [0.45, -0.05], [0.55, -0.12], [0.65, -0.05], [0.70, 0.25], [0.78, 0.30], [0.90, 0.10], [1, 0]])), e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  // The legs: a deep lunge stance wound under the crouch, the dash's long plant and drive-off,
  // gathered under the swing, and the wide low landing. Solved onto the deck throughout.
  const leadZ = kf(t, [[0, 0.02], [0.14, 0.30], [0.28, 0.48], [0.37, 0.55], [0.45, 0.30], [0.55, 0.15], [0.65, 0.12], [0.70, 0.50], [0.78, 0.55], [0.90, 0.20], [1, 0.02]]);
  const trailZ = kf(t, [[0, 0.02], [0.14, -0.20], [0.28, -0.38], [0.37, -0.45], [0.45, -0.15], [0.55, 0.05], [0.65, 0.02], [0.70, -0.35], [0.78, -0.40], [0.90, -0.10], [1, 0.02]]);
  poseLegIK(bones, RK, leadZ, ankleForSole(0) - hip, 0.14, e);
  poseLegIK(bones, LK, trailZ, ankleForSole(0) - hip, 0.20, e);
  // ...and the hands: the RIGHT draws BACK behind the hip through the wind-up, spears onto the
  // throat with the dash (`w` hands the authored path to the live throat), holds it HIGH through
  // the swing, and hammers DOWN with the crash. The LEFT comes forward for balance, trails the
  // swing wide, and PLANTS the landing — the one fist down of the hero pose.
  const fx = kf(t, [[0, 0.34], [0.14, 0.20], [0.28, 0.02], [0.33, 0.40], [0.37, 0.68], [0.45, 0.55], [0.55, 0.48], [0.65, 0.45], [0.70, 0.60], [0.78, 0.55], [0.90, 0.35], [1, 0.30]]);
  const fy = kf(t, [[0, 1.05], [0.14, 0.90], [0.28, 0.75], [0.33, 0.95], [0.37, 1.15], [0.45, 1.38], [0.55, 1.45], [0.65, 1.40], [0.70, 0.80], [0.78, 0.60], [0.90, 0.90], [1, 1.05]]);
  const fz = kf(t, [[0, 0.30], [0.14, 0.05], [0.28, -0.40], [0.33, 0.10], [0.37, 0.45], [0.45, 0.40], [0.55, 0.35], [0.65, 0.33], [0.70, 0.45], [0.78, 0.42], [0.90, 0.33], [1, 0.30]]);
  const w = grabPointOk ? kf(t, [[0, 0], [0.30, 0], [0.37, 0.8], [0.42, 1], [0.62, 1], [0.70, 0.4], [0.78, 0], [1, 0]]) : 0;
  let rtx = -fx + tremor(4.2), rty = fy + tremor(5.1) * 0.5, rtz = fz;
  if (grabPointOk && w > 0) {
    rtx += (GRAB_POINT.x - rtx) * w;
    rty += (GRAB_POINT.y - rty) * w;
    rtz += (GRAB_POINT.z - rtz) * w;
  }
  poseArmReach(bones, RK, e, rtx, rty, rtz);
  const lxx = kf(t, [[0, 0.10], [0.14, 0.30], [0.28, 0.38], [0.37, 0.30], [0.45, 0.55], [0.55, 0.60], [0.65, 0.50], [0.70, 0.30], [0.78, 0.20], [0.90, 0.12], [1, 0.10]]);
  const lyy = kf(t, [[0, 0.90], [0.14, 0.95], [0.28, 1.00], [0.37, 0.85], [0.45, 0.95], [0.55, 1.00], [0.65, 0.95], [0.70, 0.55], [0.78, 0.35], [0.90, 0.75], [1, 0.90]]);
  const lzz = kf(t, [[0, 0.12], [0.14, 0.25], [0.28, 0.32], [0.37, 0.10], [0.45, -0.20], [0.55, -0.30], [0.65, -0.25], [0.70, 0.10], [0.78, 0.15], [0.90, 0.12], [1, 0.12]]);
  poseArmReach(bones, LK, e, lxx + tremor(1.3) * 0.5, lyy, lzz);
  // The grip: open through the wind-up, LOCKS on the lock frame, snaps open as the crash lands.
  poseGripSide(bones, RK, kf(t, [[0, 0.2], [0.28, 0.3], [0.37, 1], [0.62, 1], [0.70, 1], [0.76, 0.05], [0.85, 0.10], [1, 0.15]]) * (0.45 + 0.55 * g), e);
  poseGripSide(bones, LK, kf(t, [[0, 0.2], [0.30, 0.3], [0.50, 0.3], [0.62, 0.1], [1, 0.15]]), e);
  // ...and the limb draws LONGER on the dash's spear and on the crash's hammer (see
  // `poseStretchChain`): the two frames the whole move exists for.
  const st = kf(t, [[0.20, 1], [0.28, 1.05], [0.37, 1.18], [0.45, 1.05], [0.65, 1.00], [0.70, 1.12], [0.78, 1.05], [0.90, 1]]);
  poseStretchChain(bones, "arm", RK, st);
}

// --- (M) THE MISS --------------------------------------------------------------------------------
// The dash with nothing at the end of it. It plays the hit's own wind-up and dash — a whiff has
// to read as the same committed attempt — then the drive with nowhere to go: the hands SNAP SHUT
// on air, the body tumbles after them, the lead foot SLAPS down to stop the skid, and he is left
// FROZEN wide and off-balance while the window stays open. Long on purpose (`GRAB_MISS_PLAY`):
// the last third is the punish.
function poseGrabMiss(bones, t, e, g) {
  const R = (v) => v / POSEX;
  // Hips: the same sink and catch, then the skid drags low and the freeze stands him up halfway
  // — not recovered, parked.
  const hip = kf(t, [[0, 1.00], [0.14, 0.90], [0.28, 0.72], [0.33, 0.78], [0.40, 0.88], [0.50, 0.95], [0.58, 0.80], [0.66, 0.72], [0.74, 0.82], [0.86, 0.92], [1, 0.96]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", R(kf(t, [[0, 0], [0.33, 0], [0.45, 0.18], [0.58, 0.10], [0.70, -0.08], [0.86, -0.04], [1, 0]])), e);
  poseRot(bones, "hips", "z", R(kf(t, [[0, 0], [0.45, 0.08], [0.60, 0.12], [0.74, 0.06], [1, 0.02]])), e);
  // Trunk: wound, speared — and then past the point of no return it just keeps going over until
  // the skid catches it. The freeze wears the lean: he never got to spend it.
  poseRot(bones, "torso", "x", R(kf(t, [[0, 0.05], [0.14, 0.24], [0.28, 0.42], [0.33, 0.48], [0.42, 0.52], [0.52, 0.48], [0.60, 0.44], [0.68, 0.34], [0.80, 0.22], [1, 0.14]])), e);
  poseRot(bones, "torso", "y", R(kf(t, [[0, 0], [0.33, 0], [0.48, 0.12], [0.62, 0.08], [0.78, -0.06], [1, 0]])), e);
  poseRot(bones, "torso", "z", R(kf(t, [[0, 0], [0.45, 0.10], [0.62, 0.14], [0.80, 0.06], [1, 0.02]])), e);
  poseSettleTorso(bones, e);
  // Head: down for the attempt, then up staring at the nothing he grabbed — the whiff's face.
  poseRot(bones, "head", "x", R(kf(t, [[0, 0], [0.28, 0.20], [0.36, 0.12], [0.48, -0.10], [0.62, -0.14], [0.80, -0.06], [1, -0.02]])), e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  // Legs: the dash's plant, then a desperate stumbling chase — long, longer, planted wide — and
  // the freeze stands in it.
  const leadZ = kf(t, [[0, 0.02], [0.14, 0.30], [0.28, 0.48], [0.33, 0.55], [0.42, 0.72], [0.52, 0.60], [0.60, 0.42], [0.70, 0.38], [0.84, 0.34], [1, 0.32]]);
  const trailZ = kf(t, [[0, 0.02], [0.14, -0.20], [0.28, -0.38], [0.33, -0.45], [0.42, -0.20], [0.52, 0.25], [0.60, 0.30], [0.70, 0.05], [0.84, -0.05], [1, -0.08]]);
  poseLegIK(bones, RK, leadZ, ankleForSole(0) - hip, 0.14, e);
  poseLegIK(bones, LK, trailZ, ankleForSole(0) - hip, 0.20, e);
  // Hands: the spear, the CLAMP on air, then the stumble-catch — both arms chop DOWN and
  // forward to catch the fall, hands staying below the shoulders and in front the whole way.
  // Nothing goes overhead: a real whiffed grab folds you forward, it never windmills.
  // Both drop to a soft hang through the freeze, inside their own reach so the elbows stay bent.
  const fx = kf(t, [[0, 0.34], [0.14, 0.20], [0.28, 0.02], [0.33, 0.10], [0.42, 0.18], [0.52, 0.22], [0.62, 0.20], [0.74, 0.18], [0.88, 0.16], [1, 0.15]]);
  const fy = kf(t, [[0, 1.05], [0.14, 0.90], [0.28, 0.75], [0.33, 0.72], [0.42, 0.78], [0.52, 0.82], [0.62, 0.80], [0.74, 0.78], [0.88, 0.76], [1, 0.75]]);
  const fz = kf(t, [[0, 0.30], [0.14, 0.05], [0.28, -0.40], [0.33, -0.10], [0.42, 0.12], [0.52, 0.28], [0.62, 0.30], [0.74, 0.16], [0.88, 0.30], [1, 0.36]]);
  poseArmReach(bones, RK, e, -fx, fy, fz);
  const lxx = kf(t, [[0, 0.10], [0.14, 0.30], [0.28, 0.38], [0.33, 0.34], [0.44, 0.30], [0.55, 0.34], [0.66, 0.34], [0.74, 0.38], [0.88, 0.22], [1, 0.15]]);
  const lyy = kf(t, [[0, 0.90], [0.14, 0.95], [0.28, 1.00], [0.33, 0.92], [0.44, 0.86], [0.55, 0.84], [0.66, 0.82], [0.74, 0.80], [0.88, 0.78], [1, 0.77]]);
  const lzz = kf(t, [[0, 0.12], [0.14, 0.25], [0.28, 0.32], [0.33, 0.28], [0.44, 0.22], [0.55, 0.26], [0.66, 0.28], [0.74, 0.02], [0.88, 0.24], [1, 0.34]]);
  poseArmReach(bones, LK, e, lxx, lyy, lzz);
  // The clamp: open, open, SHUT on air — and the fists fall open on nothing through the freeze.
  poseGripSide(bones, RK, kf(t, [[0, 0.2], [0.28, 0.3], [0.33, 1], [0.80, 1], [1, 0.15]]), e);
  poseGripSide(bones, LK, kf(t, [[0, 0.2], [0.28, 0.3], [0.33, 1], [0.80, 1], [1, 0.15]]), e);
}

function poseGrabLift(bones, t, e, g) {
  const R = (v) => v / POSEX;
  // DOWN to 0.52 (a squat over the body — deep enough that the SHOULDERS can get down toward the
  // deck, which is what the reach below needs, without him sitting on his own heels: measured, the
  // two shoulder joints of a body lying flat sit only ~0.30 world units up, and the arms reach
  // 0.72 from the shoulder), then UP through standing to 1.06 — the overshoot is the last of the
  // lift, and it is what stops the haul ending as a dead stop at full height.
  const hip = kf(t, [[0, 1.00], [0.10, 0.82], [0.20, 0.60], [0.30, 0.52], [0.46, 0.72], [0.60, 0.96], [0.68, 1.06], [0.78, 1.00], [1, 1.00]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", R(kf(t, [[0, 0], [0.30, 0.06], [0.60, -0.06], [1, 0]])), e);
  poseRot(bones, "hips", "z", 0, e);
  // The trunk folds HARD over the body on the deck — past a right angle at the deepest beat, because
  // the shoulders have to get DOWN to the deck while the arms stay inside their own reach (see the
  // note in README.md) — and then unfolds as the hips drive, ending a whisker past upright.
  poseRot(bones, "torso", "x", R(kf(t, [[0, 0.05], [0.10, 0.62], [0.20, 1.02], [0.26, 1.10], [0.38, 0.94], [0.50, 0.58], [0.62, 0.18], [0.70, 0.0], [0.80, -0.07], [1, 0.05]])), e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  // The head: down at the body he is picking up, then up as it comes past his own chest (the one
  // thing he is looking at the whole way is the face he is about to leave spinning).
  poseRot(bones, "head", "x", R(kf(t, [[0, 0], [0.20, 0.34], [0.40, 0.12], [0.60, -0.10], [0.72, 0.02], [1, 0]])), e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  // The legs: solved, and SPLAYED through the squat — a wide base is the only way a body comes up
  // off the pavement with another body's weight on it. The feet do not move: the depth is the hip.
  const legZ = kf(t, [[0, 0.02], [0.14, 0.12], [0.26, 0.16], [0.46, 0.08], [0.62, -0.04], [0.72, 0.0], [1, 0.02]]);
  const splay = kf(t, [[0, 0.06], [0.24, 0.40], [0.44, 0.32], [0.68, 0.10], [1, 0.06]]);
  poseLegIK(bones, RK, legZ, ankleForSole(0) - hip, splay, e);
  poseLegIK(bones, LK, legZ * 1.06, ankleForSole(0) - hip, splay * 1.08, e);
  // ...and the hands: down to the deck at the crouch, then carried up in front of his own chest as
  // the body rises. `w` hands them over to the live pair of shoulders.
  const fy = kf(t, [[0, 1.06], [0.14, 0.66], [0.26, 0.40], [0.42, 0.72], [0.58, 1.06], [0.70, 1.22], [0.82, 1.10], [1, 1.02]]);
  const fz = kf(t, [[0, 0.28], [0.14, 0.56], [0.26, 0.66], [0.42, 0.60], [0.58, 0.54], [0.70, 0.50], [0.82, 0.44], [1, 0.30]]);
  const fx = kf(t, [[0, 0.30], [0.26, 0.34], [0.58, 0.28], [0.70, 0.26], [1, 0.30]]);
  const w = grabPointOk ? kf(t, [[0.02, 0], [0.12, 0.35], [0.26, 1], [0.64, 1], [0.72, 0.3], [0.82, 0], [1, 0]]) : 0;
  solveGrabHands(bones, e, w, [[-fx, fy, fz], [fx, fy, fz]], GRAB_SPREAD_SHOULDER);
  poseGrip(bones, kf(t, [[0, 0.2], [0.16, 0.9], [0.26, 1], [0.64, 1], [0.72, 0.25], [0.86, 0.2], [1, 0.2]]) * (0.45 + 0.55 * g), e);
  // The arms take the strain through the haul (they are the link between the hips and the body).
  const st = kf(t, [[0.14, 1], [0.42, 1.14], [0.62, 1.06], [0.80, 1]]);
  poseStretchChain(bones, "arm", RK, st);
  poseStretchChain(bones, "arm", LK, st);
}

// --- (2) THE LEG PULL AND THE FRONT FLIP ---------------------------------------------------------
// A body in the AIR above him: both hands take the shin (an ANKLE grab — that is what a man takes
// hold of when he pulls someone down out of the air), and the whole man goes over FORWARD in a
// front flip with the body on the end of his arms, driving it into the deck.
//
// The FLIP is not in this file: `player.js` owns the whole-rig rotation (`grabFlip`, one 2π about
// the body's own X — see `updateVisual`), because it is the RIG's angle and not a joint's, exactly
// the way the down slam's is. What is here is what the body is doing INSIDE the turn: an extension
// up to the leg at the reach (0.00-0.16), the TUCK through the turn with the arms pulling the leg
// down past his own centre (0.16-0.58), and then the fold of a landing that is driving something
// into the pavement under it (0.58-1.00). The legs are ANGLE-authored rather than solved here,
// because mid-flip there is no deck to solve them against — the one place in the game where the
// feet are genuinely off the floor for the whole of the move.
function poseGrabSlam(bones, t, e, g) {
  const R = (v) => v / POSEX;
  const hip = kf(t, [[0, 1.00], [0.10, 0.92], [0.20, 1.02], [0.40, 1.06], [0.54, 0.98], [0.62, 0.80], [0.72, 0.62], [0.84, 0.86], [1, 1.00]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  // The trunk: a small ARCH as the arms go up (the stretch that starts the pull), then the fold of
  // the tuck, then the hard fold of the landing.
  poseRot(bones, "torso", "x", R(kf(t, [[0, 0.05], [0.10, -0.12], [0.22, 0.30], [0.42, 0.38], [0.56, 0.22], [0.64, 0.34], [0.72, 0.50], [0.86, 0.12], [1, 0.05]])), e);
  poseRot(bones, "torso", "y", R(kf(t, [[0, 0], [0.30, 0.08], [0.60, -0.06], [1, 0]])), e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", R(kf(t, [[0, 0], [0.14, -0.30], [0.40, 0.26], [0.58, 0.14], [0.72, 0.20], [0.86, 0.04], [1, 0]])), e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  // The legs, angle-authored (see the note above): thrown out LONG at the reach (he is hanging off
  // the body), tucked through the turn, and then split and braced for the landing — the lead foot
  // comes down first and takes the whole of it. The two are a fifth of the clock apart so the
  // tuck-and-snap reads as a hinge rather than as a pose.
  poseLegAngles(bones, RK,
    kf(t, [[0, -0.30], [0.12, -0.62], [0.30, -1.34], [0.46, -1.62], [0.58, -1.12], [0.66, -0.34], [0.74, -0.62], [0.86, -0.18], [1, 0.02]]),
    kf(t, [[0, 0.50], [0.12, 0.72], [0.30, 1.90], [0.46, 2.34], [0.58, 1.66], [0.66, 0.72], [0.74, 0.92], [0.86, 0.34], [1, 0.10]]),
    kf(t, [[0, 0.10], [0.40, 0.40], [0.62, 0.20], [0.74, -0.20], [1, 0]]),
    kf(t, [[0, 0.08], [0.40, 0.22], [0.66, 0.30], [0.84, 0.20], [1, 0.06]]), e);
  poseLegAngles(bones, LK,
    kf(t, [[0, -0.26], [0.16, -0.54], [0.34, -1.12], [0.50, -1.44], [0.60, -0.94], [0.68, -0.26], [0.76, -0.50], [0.88, -0.14], [1, 0.02]]),
    kf(t, [[0, 0.44], [0.16, 0.64], [0.34, 1.62], [0.50, 2.06], [0.60, 1.44], [0.68, 0.62], [0.76, 0.80], [0.88, 0.28], [1, 0.10]]),
    kf(t, [[0, 0.08], [0.44, 0.34], [0.64, 0.16], [0.76, -0.16], [1, 0]]),
    kf(t, [[0, 0.08], [0.44, 0.24], [0.68, 0.32], [0.86, 0.20], [1, 0.06]]), e);
  // ...and the hands: thrown UP to the leg at the reach, then pulling it down THROUGH his own
  // centre as the flip carries him over, then opening as the body is driven into the deck. `w`
  // hands them over to the live shin.
  const fy = kf(t, [[0, 1.40], [0.10, 1.90], [0.22, 1.86], [0.40, 1.42], [0.54, 1.10], [0.62, 0.92], [0.70, 1.00], [0.84, 1.10], [1, 1.02]]);
  const fz = kf(t, [[0, 0.34], [0.10, 0.30], [0.24, 0.42], [0.42, 0.52], [0.56, 0.50], [0.64, 0.42], [0.74, 0.44], [1, 0.30]]);
  const fx = kf(t, [[0, 0.26], [0.20, 0.30], [0.52, 0.26], [0.68, 0.30], [1, 0.30]]);
  const w = grabPointOk ? kf(t, [[0.02, 0], [0.08, 0.45], [0.16, 1], [0.54, 1], [0.62, 0.35], [0.72, 0], [1, 0]]) : 0;
  solveGrabHands(bones, e, w, [[-fx, fy, fz], [fx, fy, fz]], GRAB_SPREAD);
  poseGrip(bones, kf(t, [[0, 0.3], [0.10, 0.9], [0.16, 1], [0.52, 1], [0.62, 0.3], [0.76, 0.2], [1, 0.2]]) * (0.45 + 0.55 * g), e);
  // ...and the ARMS are the thing doing the pulling, so they are drawn long through the yank and
  // back to rest by the time the deck arrives.
  const st = kf(t, [[0.06, 1], [0.26, 1.18], [0.50, 1.12], [0.66, 1], [1, 1]]);
  poseStretchChain(bones, "arm", RK, st);
  poseStretchChain(bones, "arm", LK, st);
}

// ===========================================================================
// ===========================================================================
// THE POLE — the staff you CARRY (see player.js's `POLE_*` block, `pole.js`, and "THE POLE" in
// src/README.md).
//
// It used to be a FORM: take a staff out of the ground and a twenty-beat kata plays itself out and
// snaps the pole at the end. The user threw all of that out —
//
//   *"delete all the pole animtions and there concepts ... make it when i grab a pole i dont do the
//   attack instantly i grab the pole normally it has its weight it can slow me down a bit it has
//   durability"* —
//
// so the staff is now a THING HE CARRIES. Picking one up is a pickup and nothing else (the shape
// below is the one it comes to rest in, and the only thing the hand does is close on it). What the
// staff can then do is four moves, and this file owns the SHAPE of all four:
//
//   CARRY     the staff held upright at his left, one fist on it at the waist. It is the shape every
//             other one leaves from and comes back to, so nothing here has a seam: the strike and
//             the throw both BEGIN and END on exactly these numbers.
//   STRIKE    M1 — *"an attack flashy animation that looks really really cool and must be moving
//             forward it cannot be stationary"*. A three-beat flurry thrown forward off the carry:
//             a wind over the shoulder, a diagonal chop that crosses the body, a rising cut the other
//             way and a low sweep, with the whole body taking ONE revolution through it (finished on
//             a whole turn, so the aim is square again the frame it ends) and the shaft rolling on
//             its own axis the whole way through.
//   THROW     M2 — *"i can throw it with m2 / pressing grab again and it breaks after that ofc"*.
//             He whirls it overhead in one flowing circle and hurls it. The release share
//             (`POLE_THROW_RELEASE`)
//             is where the prop actually leaves the hand (player.js owns the flight); what this file
//             owns is the shape either side of it, including the hands — which OPEN on the release
//             and follow through empty, while the virtual grip the arms are solved onto carries on
//             down the line so the follow-through is a throw's and not a pose's.
//   VAULT     the double jump — *"make when the player double jump its not holdable anymore the
//             player does a front flip with the stick aiming forward and he stirkes the ground with
//             it wich launches far forward in the air"*. A one-shot: the body turns a whole forward
//             revolution over a staff that HOLDS ITS AIM in the world (see `poleHoldVault`), and the
//             beat its tip reaches the deck is the beat the launch fires on and the wood snaps. It is
//             the one shape here whose LEGS are authored: a stride is a set of contacts with a deck,
//             and mid-revolution there is no deck.
//
// THE SHAFT IS THE HITBOX, and it always was (see `player.js`'s `poleStrikeContact`): a staff is a
// two-metre line, so what hits is the SEGMENT between its ends. Nothing here measures anything —
// what this file does is decide WHERE the line is, and player.js mounts the prop on the same answer,
// so the drawn stick and the thing that hits are one number.
//
// THE HAND CONVENTION. Every shape below is authored as the SHAFT's own path — the take-point `g`
// (in the RIG's frame: +X is the character's LEFT, +Y up, +Z forward), the shaft's `pitch` off
// straight up and `yaw` off dead ahead, how far up the shaft from the BUTT the grip sits (`hf`), the
// hands' spread along it (`hs`), and the shaft's own roll about its length. The hands are then
// SOLVED onto points read off that shaft — never authored as angles — so a hand cannot come off the
// wood, and a fist that is stretched by `poseStretch` still lands on it (`poleArm`).
// ===========================================================================

// The shaft's length in RIG units: pole.js's `POLE.LEN` over the character's own fit scale (the rig
// is authored 1.17 tall and drawn at `P.HY * P.BODY_RATIO`, so the group is scaled by ~1.351), so
// the prop the pose holds is bit-for-bit the prop standing in the world.
const POLE_L = POLE.LEN / 1.351;

// THE CARRY — THE STAFF AT HIS SIDE, IN A STRAIGHT-DOWN ARM (session 185).
//
// What it was: the staff STOOD UP at his left, gripped a third of the way up (`hf` 0.40) so the butt
// hung a hand's width off the street and the tip went a half-body over his head — a staff you are
// carrying, in the words of the old note, "and one held at its middle is a staff you are waving".
// The user's own read of it (*"fix the pole hold animation make the player hold it
// horizantaly and titled a little and the arm is straight down"*) is that an upright staff in a
// bent-elbow fist looks like a flag, and the thing a staff carried by a walking man actually does is
// hang LEVEL off a straight arm, with the hand at the bottom of the shoulder line and the rod
// running fore-and-aft past his thigh.
//
// So the three numbers that carry the shape are now:
//   pitch 1.34  the shaft LEVEL and a little up at the front — 76.8° off straight up, i.e. 13°
//               above horizontal, read off a rod whose +Y is the TIP. (`axis = (0, cos, sin)`, so
//               anything under π/2 lifts the tip; the "a little" is that 13°, which keeps the far end
//               off the deck through a run's bob and stops it reading as a spear at shoulder height.)
//   hf 0.5      the grip at the MIDDLE of the shaft, so the rod is balanced in the fist the way a
//               walking staff is: 1.20 rig of wood each way — forward past the thigh and back past
//               the calf. (It is `g` that is the CENTRE when `hf` is 0.5 — see `composePole`.)
//   gy 0.83     the take-point at THIGH height, which is what makes the ARM STRAIGHT. The left
//               shoulder is at (0.215, 1.400); the grip at (0.26, 0.83, 0.02) is **0.570 rig** away,
//               against an arm 0.607 long — a 94 % reach, i.e. a straight arm with a hair of bend in
//               it. (`gx` 0.26 is only 0.045 out from the shoulder: any further and the arm hangs
//               diagonally, and any nearer and the sleeve is pressed into the hip and the rod into
//               the leg.)
//
// The RIGHT ARM IS STILL NOT TOUCHED by this shape at all: it keeps whatever the base layer is doing
// (the run cycle's swing, the idle's hand in the pocket), because one fist on a staff leaves the
// other one free. That is the whole reason the carry is one-handed.
const POLE_CARRY = {
  gx: 0.26, gy: 0.83, gz: 0.02, pitch: 1.34, yaw: 0, hf: 0.50, hs: 0.30, roll: 0,
  hip: 0.98, lean: 0.02, hyaw: -0.05, tyaw: 0.04, headx: 0.02, heady: -0.04,
  hands: 1, dangle: 0, grip: 1,
};

// The three clocks the mover reads back off this file (`poleHold` writes them with the shape), and
// they are the whole of the contract between the two files for the strike and the throw — see the
// note in player.js's `POLE_*` block.
const POLE_ATK_HITS = [0.24, 0.44, 0.58];
const POLE_ATK_BREAK = 0.58;
const POLE_THROW_RELEASE = 0.62;

// ---- THE TWO NUMBERS THE REACHING HAND IS ACTUALLY AUTHORED ON (session 150) ------------------
//
// The strike's take-point is not authored in `gx`/`gz` any more: it is authored as the CLEARANCE
// and the SLIDE, and the three channels are solved off them (see `poleHoldStrike`). The clearances
// are in rig units, measured off the body's own centre line, and they are the number the user's
// complaint is about: *"WHAT THE FUCK ARE THESE POLE ANIMATIONS"* was a two-metre rod held at the
// centre of a body, and a rod at the centre of a body is a rod through it.
//
// `POLE_ATK_CLEAR` is how far the WOOD stays off that line. Its ends are the CARRY's own numbers
// (0.26 since session 185 — the one shape in the file that never clipped, because a staff held at a
// body's side and running fore-and-aft cannot be inside it), it opens to 0.40 through the three
// beats where the trunk twists and leans hardest, and it
// closes back onto the carry's number on the last share so the handover is a shape the body is
// already in. `POLE_ATK_SLIDE` is where along the rod's own line the two fists sit (0 is the point
// of that line nearest the body), and it is what keeps the arms reaching a fist-wrapped shaft
// LENGTHWISE rather than sliding up and down it: both hands are always ON the line, so the slide is
// free to be shaped for the reach and cannot cost any clearance at all.
const POLE_ATK_CLEAR = [[0, 0.26], [0.12, 0.38], [0.24, 0.40], [0.64, 0.40], [0.82, 0.33],
  [1, 0.26]];
const POLE_ATK_SLIDE = [[0, 0.02], [0.06, 0.15], [0.13, -0.14], [0.19, -0.15], [0.245, 0.16],
  [0.30, 0.17], [0.35, 0.12], [0.40, 0.08], [0.44, 0.14], [0.49, 0.15], [0.53, -0.10],
  [0.58, 0.17], [0.63, 0.17], [0.72, 0.12], [1, 0.02]];
// ...and the two fists' own SPAN along the rod. A two-handed grip is a pair of hands a hand's width
// apart on the wood, and the second hand is the far end of the arm's reach: `0.30` puts it 0.40
// world units down the staff from the grip, which with the rod held clear of the trunk is a point
// the far shoulder cannot get to (measured: **0.24 rig** of daylight between the fist and the wood
// through the recovery, on an arm already pinned at its own length). 0.20 is a fist on the shaft.
const POLE_ATK_HANDS = [[0, 0.30], [0.07, 0.16], [0.20, 0.12], [0.66, 0.12], [0.76, 0.22], [1, 0.30]];

// ...and the throw's own pair (see `poleHoldThrow`). The same two numbers with the same meaning: a
// javelin's release is the one beat of the move where the wood must be OUT of the body — the arm
// comes over the top and the staff leaves from a hand a foot clear of the shoulder — and the wind-up
// before it is a rod cocked BEHIND a shoulder that is also, at that instant, leaning back over it.
// Measured before this: the trunk-to-shaft gap bottomed at **0.114 rig** at the release itself, so
// the one frame the whole move exists for was the frame the wood was inside the chest.
const POLE_THROW_CLEAR = [[0, 0.26], [0.15, 0.30], [0.30, 0.36], [0.46, 0.38],
  [0.52, 0.40], [0.62, 0.42], [0.75, 0.33], [1, 0.26]];
const POLE_THROW_SLIDE = [[0, 0.02], [0.15, 0.06], [0.30, 0.12], [0.46, 0.14],
  [0.52, 0.16], [0.62, 0.18], [0.75, 0.12], [1, 0.02]];
const POLE_THROW_HANDS = [[0, 0.30], [0.12, 0.28], [0.20, 0.18], [0.75, 0.18], [0.88, 0.24],
  [1, 0.30]];

// ---- THE SECOND HAND'S WEIGHT (session 151) -----------------------------------------------------
//
// `hands` used to be a count — 1 or 2 — and both the strike and the throw said 2 for the whole of
// their clocks. That is the right ANSWER for the middle of a flurry (a two-handed rod is what a
// formed strike is) and the wrong one at the ends, because both moves begin and end on the CARRY,
// which is deliberately one-handed: its grip is on his own left at the waist, so the point the
// second fist would hold is **0.88 rig** from the right shoulder against a 0.62 arm — the solve
// cannot reach it and does not pretend to, and the pose put the fist in the air **0.27 rig** (a
// third of a metre, world) off the wood for the last tenth of a second of both moves. Measured on
// the live rig at t 0.92 of the strike: the right hand 0.27 rig from the shaft, hanging beside a
// staff it is nominally gripping.
//
// These two tables are that fist's own share of the move: 1 (the carry's one-fist grip) at each
// end, 2 (a full two-handed grip) through the body of it, and everything between is the hand
// closing on the wood rather than blinking onto it. They are read as a WEIGHT by `posePole` (see
// the note there) — `hands` 1 is weight zero, 2 is weight one — so a hand at 1.6 is a hand halfway
// onto the rod, and the arm solves at exactly that share. The window is short on purpose: a fist
// takes hold of a staff in about a tenth of a second, and the strike's first beat is at 0.24.
const POLE_ATK_HANDS2 = [[0, 1], [0.07, 2], [0.60, 2], [0.72, 1], [1, 1]];
// ...and the throw's: it never leaves 1. The hurl is one-handed — the carry's own fist does all
// of it — so the right arm is the base layer's throughout and there is no second hand to manage.
const POLE_THROW_HANDS2 = [[0, 1], [1, 1]];

// THE STRIKE — M1, and the shape the user asked for by hand: flashy, and MOVING.
//
// The beats are `POLE_ATK_HITS`: a diagonal chop that crosses the body (0.24), a rising cut the
// other way (0.44) and a low sweep (0.58).
//
// ---- IT IS DRAWN AS THREE HOLDS, NOT AS ONE CONTINUOUS SWING (session 151) --------------------
//
// The whole of the old channel set was authored as a run of single keys with no two of them equal,
// and `kf` EASES between its keys — so there was no frame anywhere in the flurry at which the wood
// was still. A flurry drawn that way is a body waving a stick: the eye is given a different extreme
// sixty times a second and is never told which of them is the STRIKE. What the three beats need is
// the shape every hand-animated weapon combo in the medium has — an ANTICIPATION that holds, a
// whip that takes two or three frames, and an IMPACT that holds again — because the hold is the
// only thing that says *this one landed*.
//
// So every beat is now a PAIR of keys at the extreme (0.13/0.19 at the chamber, 0.245/0.30 on the
// chop, 0.44/0.49 on the rising cut, 0.58/0.63 on the sweep) with 0.05 … 0.06 of the clock —
// three or four frames — of dead-still wood between them, and the travel between two holds is
// 0.045 … 0.055 of the clock, i.e. **2.5 … 3.3 frames at 60 Hz**. That is the whole of what makes
// it read as three strikes rather than as a spin: the ease has nothing left to smooth, and the
// still frames do the punctuation. `POLE_ATK_HITS` (0.24, 0.44, 0.58) falls inside each hold, so
// the beat that HITS is a beat the wood is being driven through and not one it is passing.
//
// `spin` is ONE WHOLE TURN of the rig about its own yaw, and it is finished on exactly 1.0 so the
// mover can drop it the frame the move ends without the body jumping (2π IS 0) — the same bargain
// the old form's pivots made, and the reason the aim (which rides `facing`, not `spin`) is untouched
// by the turn. `roll` is the shaft's own spin about its length, and it is a straight ramp rather
// than a pair of keys for the same reason a propeller is not a metronome.
function poleHoldStrike(o, t) {
  o.spin = kf(t, [[0, 0], [0.30, 0.30], [0.62, 1.0], [1, 1]]);
  o.roll = t * 4.0;
  // THE WOOD. `pitch` off straight up (+ tips the tip FORWARD), `yaw` in plan — and the three beats
  // are the three extremes: the chamber at pitch −0.58 (tip up and BEHIND), the chop at 1.98 (tip
  // past horizontal and driving DOWN), the rising cut at 0.24 (tip up and out) and the sweep at
  // 1.62 (tip forward and level).
  // ...and both ENDS are the CARRY's own numbers now (session 185 — see `POLE_CARRY`): the flurry is
  // thrown with the staff at the body's side and level, so it has to LIFT to the chamber and settle
  // back to level on the way out. The intermediate keys either side of the ends are the pass-through
  // (0.62 rising, 1.36 coming home) that keeps the wood's path a swing rather than a snap.
  o.pitch = kf(t, [[0, POLE_CARRY.pitch], [0.06, 0.62], [0.13, -0.58], [0.19, -0.58], [0.245, 1.98],
    [0.30, 1.95], [0.35, 1.45], [0.40, 0.95], [0.44, 0.24], [0.49, 0.24], [0.53, 1.50],
    [0.58, 1.62], [0.63, 1.60], [0.72, 1.30], [0.86, 1.36], [1, POLE_CARRY.pitch]]);
  o.yaw = kf(t, [[0, 0], [0.06, 0.0], [0.13, 0.42], [0.19, 0.42], [0.245, -0.72],
    [0.30, -0.70], [0.35, -0.50], [0.40, 0.05], [0.44, 0.80], [0.49, 0.78], [0.53, -0.50],
    [0.58, 0.86], [0.63, 0.84], [0.72, 0.35], [0.86, 0.10], [1, 0]]);
  // ---- THE HANDS RIDE THE ROD'S OWN LINE (session 150) ------------------------------------
  //
  // This is the fix for the one thing about the flurry the user could see from every camera: the
  // WOOD WENT THROUGH THE BODY. `gx`/`gz` used to be authored as two independent tables of world
  // plan coordinates — his left, his front — and a take-point is only ever ONE point; the rod it
  // belongs to is 2.4 rig units long and runs both ways from it, so a grip authored at (0.02,
  // −0.14) while the rod stood on end was a rod standing on end THROUGH THE SPINE. Measured on the
  // real rig, the shortest gap between the trunk (the segment hips → head) and the drawn shaft over
  // the flurry was **0.012 rig** — a centimetre from the spine to the centre of the wood — and it
  // was under 0.10 at four separate stretches (the chamber, the follow-through of the first chop,
  // the low sweep, and the whole recovery).
  //
  // The declaration the shape now makes is not where the hands go but WHAT THE WOOD IS TO MISS: the
  // clearance (`POLE_ATK_CLEAR`) and where along the rod's own line the fists sit
  // (`POLE_ATK_SLIDE`). Both are spent here, in the rod's own frame — `yaw` is the shaft's plan
  // angle, so `(cos yaw, −sin yaw)` is the line's NORMAL and `(sin yaw, cos yaw)` is the line
  // itself. A take-point of `clear · normal + slide · along` is therefore ON a line whose closest
  // approach to the body's centre is exactly `clear`, for every slide and every yaw: the hands can
  // slide the whole length of the wood and it can never come nearer, which is the whole reason the
  // clearance is authored as a clearance rather than fished for in two world coordinates.
  //
  // It is also why the hands' path is now the shaft's own: as the flurry turns the rod through
  // ±0.9 rad the fists are carried round with it, at a fixed radius and a fixed distance off the
  // body, which is what a pair of arms holding a pole does. Measured over the move: the shortest
  // trunk-to-shaft gap is **0.357 rig** (was 0.012), nothing is under 0.32, and the throwing hand
  // never leaves the wood by more than **0.02 rig**. The two ends are the CARRY's own numbers, so
  // the flurry still starts and finishes on a shape the body is already standing in.
  const holdYaw = o.yaw;
  const holdClear = kf(t, POLE_ATK_CLEAR);
  const holdSlide = kf(t, POLE_ATK_SLIDE);
  o.gx = holdClear * Math.cos(holdYaw) + holdSlide * Math.sin(holdYaw);
  o.gz = -holdClear * Math.sin(holdYaw) + holdSlide * Math.cos(holdYaw);
  o.gy = kf(t, [[0, POLE_CARRY.gy], [0.13, 1.34], [0.19, 1.36], [0.245, 1.08], [0.30, 1.06],
    [0.35, 1.10], [0.44, 1.18], [0.49, 1.18], [0.58, 0.98], [0.63, 0.98], [0.72, 1.00],
    [1, POLE_CARRY.gy]]);
  o.hf = kf(t, [[0, POLE_CARRY.hf], [0.13, 0.28], [0.19, 0.28], [0.245, 0.52], [0.30, 0.52],
    [0.35, 0.46], [0.44, 0.34], [0.49, 0.34], [0.58, 0.44], [0.63, 0.44], [0.72, 0.42],
    [1, POLE_CARRY.hf]]);
  o.hs = kf(t, POLE_ATK_HANDS);
  o.hands = kf(t, POLE_ATK_HANDS2);
  // ---- THE BODY: A WEIGHT SHIFT, NOT A SQUAT (session 150) --------------------------------
  // The old keys dropped the pelvis to `hip` 0.79 and 0.77 on the two chops — a fifth of the body's
  // height, twice a second — and swung the trunk through ±0.56 rad. On the rig that read as a man
  // DUCKING and waving a stick rather than a form with weight in it: from any camera the two chops
  // were the frames the head went away behind the shoulder, and the recovery was the body climbing
  // back out of a crouch. The dips are a third of that now (`hip` 0.905 … 0.955, i.e. 2 … 7 % against
  // 2 … 20 %) and the trunk swings ±0.30, which is the range a body actually turns its shoulders
  // through when it drives a two-metre rod; the DEPTH comes from the `spin`, the leap of the shaft
  // and the forward floor instead, which is where this form's weight belongs (a staff strike is a
  // thrown thing, not a dropped one).
  o.hip = kf(t, [[0, POLE_CARRY.hip], [0.13, 0.955], [0.19, 0.95], [0.245, 0.90], [0.30, 0.90],
    [0.35, 0.93], [0.44, 0.90], [0.49, 0.90], [0.58, 0.88], [0.63, 0.89], [0.80, 0.955],
    [1, POLE_CARRY.hip]]);
  o.lean = kf(t, [[0, 0.02], [0.13, -0.16], [0.19, -0.16], [0.245, 0.34], [0.30, 0.32], [0.35, 0.10],
    [0.44, 0.05], [0.58, 0.26], [0.63, 0.24], [0.80, 0.06], [1, 0.02]]);
  o.hyaw = kf(t, [[0, -0.05], [0.13, 0.30], [0.19, 0.30], [0.245, -0.32], [0.30, -0.30],
    [0.35, -0.10], [0.44, 0.30], [0.49, 0.28], [0.53, -0.20], [0.58, 0.28], [0.63, 0.26],
    [0.80, 0.0], [1, -0.05]]);
  o.tyaw = kf(t, [[0, 0.04], [0.13, 0.36], [0.19, 0.36], [0.245, -0.38], [0.30, -0.36],
    [0.35, -0.12], [0.44, 0.34], [0.49, 0.32], [0.53, -0.24], [0.58, 0.32], [0.63, 0.30],
    [0.80, 0.02], [1, 0.04]]);
  // ---- THE HEAD LOOKS AT WHAT IT IS HITTING ----------------------------------------------
  // `headx` spent the wind-up and the recovery at +0.18 / +0.06 — the chin down — which is the one
  // thing a body swinging a rod past its own eyeline must never do. It stays UP now (never positive
  // past the chamber) and the yaw keeps tracking the leading side, so the face is on the target
  // through all three beats — and the head follows the wood through the two chambers instead of
  // sitting still while it goes by.
  o.headx = kf(t, [[0, 0.02], [0.13, 0.06], [0.19, 0.04], [0.245, -0.16], [0.30, -0.14],
    [0.35, -0.06], [0.44, -0.10], [0.58, -0.14], [0.63, -0.12], [1, 0.02]]);
  o.heady = kf(t, [[0, -0.04], [0.13, -0.22], [0.19, -0.22], [0.245, 0.18], [0.30, 0.18],
    [0.35, 0.06], [0.44, 0.20], [0.58, -0.18], [0.63, -0.16], [1, -0.04]]);
  o.dangle = 0;
  o.grip = 1;
  // ---- THE LEGS: THE FORM IS FOUGHT FROM THE FEET (session 152) --------------------------------
  //
  // The user: *"MAKE THE STAFF ANIMATION HAVE LEG ANIMATIONS AND TORSO ANIMATIONS"*. The flurry
  // authored everything above the hips and left the legs on the standing idle, so from the outside
  // the whole move lived in the arms. This is the plan that fixes it, and it is a STEP rather than
  // a stance: three beats means three plantings, and the weight has to be seen to move between
  // them.
  //
  // The character's RIGHT foot is the LEAD (his staff is in his LEFT hand, so the opposite foot
  // goes forward — the same way a swordsman stands). `legZR`/`legZL` are the feet's forward
  // offsets from the hips, `legLiftR`/`legLiftL` how far off the deck, and the two splay numbers
  // are the width of the base. Read against the beats (`POLE_ATK_HITS` 0.24 / 0.44 / 0.58):
  //
  //   0.13-0.19  THE CHAMBER. The hips sink onto the TRAIL foot and the lead comes up and BACK
  //              (0.42 → 0.02, lifted 0.07) — the coil, and the frame the whole move is loaded on.
  //   0.245      THE CHOP. The lead foot SLAPS down forward at 0.44 with the weight arriving on it
  //              (the hips drop to 0.90 on the same beat — see `o.hip`), which is what turns a
  //              swing into a driven strike.
  //   0.35-0.44  THE RISING CUT. A STEP-THROUGH: the trail foot comes off the deck and swings past
  //              the lead (lift 0.10, −0.26 → +0.34) while the lead rolls back under the body
  //              (0.44 → 0.16). The feet genuinely swap, which is the only thing that reads as the
  //              body throwing its weight the other way.
  //   0.58       THE SWEEP. The new lead plants WIDE and low (0.40, splay 0.34) — the widest base in
  //              the move, because a low sweep is the one beat that is taken from a grounded stance.
  //   0.72-1     gather back onto the carry's own light stagger, so the handover out of the flurry
  //              is a shape the body is already standing in.
  //
  // The strike travels ~11 u down its own facing while it runs (see `POLE_ATK_V`), so the step is
  // also what keeps the feet honest: a planted foot left where it was would skate. The duty is
  // deliberately long (a foot is off the deck for 0.06 … 0.10 of the clock, i.e. 3 … 5 frames) —
  // long enough to read as a step, short enough that the body is never without a foot under it.
  //
  // SESSION 154 SCALED THE WHOLE STEP UP BY ABOUT A THIRD — `legZR`'s peak 0.44 → 0.52 (the sweep
  // 0.44 → 0.52 too), `legZL`'s −0.32 → −0.38 with the step-through running to +0.50, and the
  // two splay peaks 0.34 / 0.38 → 0.42 / 0.46. The reason is the same one the 0.44 was too small
  // for in the first place: the user's *"MAKE THE STAFF ANIMATION HAVE LEG ANIMATIONS AND TORSO
  // ANIMATIONS"* is a request about what is VISIBLE, and at the gameplay camera the character is
  // about 90 px tall — a 0.44 rig stride is a stride nobody can see. Nothing here comes near the
  // leg's own 0.88 reach at any key, so the solve is never clamped and no foot is dragged off the
  // deck to get there.
  o.legMode = 2;
  o.legBlend = 1;
  o.legZR = kf(t, [[0, 0.06], [0.06, 0.12], [0.13, 0.34], [0.19, 0.38], [0.245, 0.50],
    [0.30, 0.48], [0.40, 0.22], [0.44, 0.06], [0.49, 0.02], [0.53, 0.24], [0.58, 0.52],
    [0.63, 0.50], [0.72, 0.28], [0.86, 0.12], [1, 0.06]]);
  o.legZL = kf(t, [[0, -0.10], [0.06, -0.18], [0.13, -0.36], [0.19, -0.38], [0.245, -0.18],
    [0.30, -0.08], [0.35, 0.08], [0.40, 0.30], [0.44, 0.48], [0.49, 0.50], [0.58, -0.08],
    [0.63, -0.16], [0.72, -0.18], [0.86, -0.12], [1, -0.10]]);
  o.legLiftR = kf(t, [[0, 0], [0.06, 0.05], [0.13, 0.15], [0.19, 0.12], [0.245, 0],
    [0.30, 0], [0.40, 0], [0.44, 0.02], [0.49, 0.09], [0.53, 0.05], [0.58, 0],
    [0.72, 0], [1, 0]]);
  o.legLiftL = kf(t, [[0, 0], [0.13, 0.03], [0.19, 0.05], [0.30, 0], [0.35, 0.11],
    [0.40, 0.05], [0.44, 0], [0.53, 0.13], [0.58, 0.02], [0.63, 0], [1, 0]]);
  o.legSplayR = kf(t, [[0, 0.14], [0.13, 0.28], [0.19, 0.28], [0.245, 0.24], [0.30, 0.24],
    [0.44, 0.24], [0.58, 0.42], [0.63, 0.40], [0.80, 0.20], [1, 0.14]]);
  o.legSplayL = kf(t, [[0, 0.20], [0.13, 0.34], [0.19, 0.34], [0.245, 0.30], [0.30, 0.30],
    [0.44, 0.32], [0.58, 0.46], [0.63, 0.44], [0.80, 0.26], [1, 0.20]]);
}
// leaves on. Before it the shaft is cocked back over the shoulder (`pitch` goes NEGATIVE — the tip
// behind him, which is what `pitch` off straight-up means) with the hand riding up toward the butt
// for the long lever; after it the whole body unwinds through the line and the hands follow the
// shaft's virtual path down and across.
//
// ---- THE LOAD AND THE WHIP (session 151) ------------------------------------------------------
//
// A throw is the one move in the set whose whole point is the frame the fist opens, and the old
// channel set gave it the same treatment as the flurry: a single key at the deepest cock, a single
// key at the release, and an ease on both. Measured on the clock, the wood was never still in the
// wind-up — so the most loaded frame of the move (the staff at `pitch` −0.66 with the body leaning
// back over it) existed for one frame and was already swinging out of by the next. It is a PAIR of
// A gather, a hold, a whip, a pose, a relaxation: the dip and rise (0-0.15), the coil the wood
// sits dead-still in while the legs sink (0.30-0.46), the whip over the top and the release at
// 0.62, the full-extension pose held (0.68-0.78) and the settle. The two holds are what make it
// read as thrown rather than waved — the same bargain as the strike's three beats.
//
// THE FIST OPENS ON THE RELEASE. This is the one place in the file the grip is a channel, and it is
// the difference between a throw and a shove: a hand that is still clenched on the wood 0.16 s after
// the staff left it is a hand that did not let go — and it STAYS open now (`grip` 0.10 → 0.22),
// because the staff does not come back: the pose is a follow-through on a virtual shaft, and the
// next thing this body holds is whatever it picks up next.
function poleHoldThrow(o, t) {
  const R = POLE_THROW_RELEASE;
  // ...and both ends are the CARRY's own, the same way the strike's are (see it above): the staff
  // comes UP off his side to the cock (`0.62` at 0.05 is the pass-through that keeps it a lift
  // rather than a snap) and comes back down to level as the follow-through settles.
  o.pitch = kf(t, [[0, POLE_CARRY.pitch], [0.08, 1.40], [0.15, 0.35], [0.30, -1.02],
    [0.38, -1.02], [0.46, -0.96], [0.52, -0.30], [R, 1.40], [0.70, 1.52], [0.78, 1.52],
    [0.88, 1.30], [1, POLE_CARRY.pitch]]);
  o.yaw = kf(t, [[0, 0], [0.12, 0.45], [0.25, 0.55], [0.38, -0.15], [0.46, -0.18],
    [0.52, -0.35], [R, -0.05], [0.75, 0.10], [1, 0]]);
  o.roll = kf(t, [[0, 0], [0.35, 5.0], [0.62, 7.0], [1, 7.0]]);
  // THE HANDS RIDE THE ROD'S OWN LINE, exactly as the strike's do (see `POLE_ATK_CLEAR`) — the
  // throw is the same authoring problem with a different story: the wood has to be clear of the
  // trunk at the wind-up (the rod is cocked behind a shoulder that is leaning back over it) and it
  // has to be clear at the RELEASE, which is the frame the whole move exists for. `R` is
  // `POLE_THROW_RELEASE`, and the clearance's own peak is built on the same share, so the wood is
  // furthest off the body on exactly the frame the fist opens.
  const holdYaw = o.yaw;
  const holdClear = kf(t, POLE_THROW_CLEAR);
  const holdSlide = kf(t, POLE_THROW_SLIDE);
  o.gx = holdClear * Math.cos(holdYaw) + holdSlide * Math.sin(holdYaw);
  o.gz = -holdClear * Math.sin(holdYaw) + holdSlide * Math.cos(holdYaw);
  o.gy = kf(t, [[0, POLE_CARRY.gy], [0.15, 1.05], [0.30, 1.35], [0.38, 1.34],
    [0.46, 1.32], [0.52, 1.30], [R, 1.24], [0.68, 1.00], [0.78, 1.00], [0.88, 0.90],
    [1, POLE_CARRY.gy]]);
  o.hf = kf(t, [[0, POLE_CARRY.hf], [0.15, 0.42], [0.30, 0.30], [0.52, 0.28], [R, 0.32],
    [0.75, 0.45], [1, POLE_CARRY.hf]]);
  o.hs = kf(t, POLE_THROW_HANDS);
  o.hands = kf(t, POLE_THROW_HANDS2);
  o.hip = kf(t, [[0, POLE_CARRY.hip], [0.08, 0.93], [0.15, 0.95], [0.30, 0.90],
    [0.52, 0.88], [R, 0.86], [0.75, 0.90], [0.88, 0.94], [1, POLE_CARRY.hip]]);
  // ---- THE FOLLOW-THROUGH IS A POSE, THEN A RELAXATION (session 151) ---------------------------
  // The old shape walked every body channel back to the carry from the release onward, evenly, so
  // the 0.32 s after the fist opened was one long slow return and read as the body standing still
  // again. A throw does not do that: it SNAPS to full extension and stays there for a beat (that is
  // the pose the move exists to show) and only then relaxes. So the trunk and the hips now overshoot
  // onto the line and through it (`lean` 0.45 and `hyaw`/`tyaw` −0.40 / −0.44, flowing
  // to the settle), and the recovery starts from there. Measured on the club: the body's own yaw carries
  // **0.50 rad past the release** before it begins to unwind, against 0.34 before this pass.
  o.lean = kf(t, [[0, 0.02], [0.08, -0.02], [0.15, -0.10], [0.30, -0.28], [0.52, -0.15],
    [R, 0.40], [0.70, 0.44], [0.78, 0.44], [0.88, 0.20], [1, 0.02]]);
  o.hyaw = kf(t, [[0, -0.05], [0.15, 0.20], [0.30, 0.50], [0.52, 0.25], [R, -0.30],
    [0.68, -0.40], [0.78, -0.40], [0.88, -0.22], [1, -0.05]]);
  o.tyaw = kf(t, [[0, 0.04], [0.15, 0.24], [0.30, 0.55], [0.52, 0.28], [R, -0.32],
    [0.68, -0.44], [0.78, -0.44], [0.88, -0.24], [1, 0.04]]);
  // THE HEAD WATCHES IT GO. The release is the one frame of the move worth looking at, so the chin
  // comes up and the face swings onto the line the staff leaves on (`headx` −0.26 just after `R`),
  // then settles. Hand-keyed at ±0.02 at both ends, so the head is the carry's own at the handover.
  o.headx = kf(t, [[0, 0.02], [0.08, 0.08], [0.15, 0], [0.30, -0.05], [0.52, -0.10],
    [R, -0.08], [0.75, -0.12], [1, 0.02]]);
  o.heady = kf(t, [[0, -0.04], [0.15, -0.12], [0.30, -0.20], [0.52, -0.15], [R, 0.05],
    [0.75, 0.08], [1, -0.04]]);
  o.dangle = 0;
  o.grip = kf(t, [[0, 1], [R - 0.02, 1], [R + 0.03, 0.10], [0.90, 0.18], [1, 0.22]]);
  // ---- THE LEGS: A THROW IS THROWN FROM THE BACK FOOT (session 152) ----------------------------
  //
  // The user: *"THE THROW ANIMATION IS MEH BUT THERES IS NOT TORSO AND HEAD ANIMATIONS AND LEGS
  // ANIMATIONS ONLY THE ARMS ARE MOVING"*. This is the fix for the third clause, and it is the one
  // that matters most, because a throw is the one move in the game where the audience looks at the
  // FEET: the whole idea of a hurl is that the power comes up out of the deck.
  //
  // The character's LEFT foot is the PLANT (the javelin's off-foot — the one that takes the run-up's
  // last stride and stops the body so the arm can be whipped over it) and the RIGHT is the DRIVE
  // (loaded behind, then thrown through). Read against the shares:
  //
  //   0.05-0.15  THE PLANT STEPS IN. The left foot comes off the deck, travels forward,
  //              and slaps down at 0.30 — a real stride, taken while the staff is still sweeping up
  //              overhead, so the step and the wind-up arrive together.
  //   0.30-0.45  THE LOAD. The hips sink to 0.90 and then 0.86 (see `o.hip`) onto that front foot
  //              while the drive leg loads BEHIND (−0.28) with its heel coming up. This
  //              is the deepest point of the move, a body coiled over a leg
  //              rather than a body standing on two.
  //   0.62 (R)   THE RELEASE. The drive leg fires through (−0.25 → −0.08) and the trunk comes over
  //              the top of it — the throw's own beat.
  //   0.68-0.80  THE STEP-THROUGH. The drive leg swings past the plant and lands at 0.80 while the
  //              plant rolls back under the body (0.30 → 0.05): the feet genuinely change ends,
  //              which is what a follow-through IS. It is the same step the strike takes at its
  //              rising cut, at twice the size.
  //   0.88-1     the gather back to a light stagger, so the fade into the carry (see `POLE_FADE`)
  //              hands the base layer a stance it can take over without a pop.
  //
  // SESSION 154 made the step-through BIGGER (the drive leg's landing 0.50 → 0.62, the plant's
  // step-in 0.34 → 0.40), for the same reason the strike's was scaled: a throw is the move where
  // the audience is looking at the FEET, and a 0.5 rig step on a 90 px character is not a step.
  // 0.62 rig is 0.84 world against a 1.19 world leg, so the solve still has room at the extreme —
  // measured, the reaching foot is never clamped and both feet stay within a hand's width of the
  // deck through the whole move.
  o.legMode = 2;
  o.legBlend = 1;
  o.legZR = kf(t, [[0, 0.06], [0.15, 0.00], [0.30, -0.28], [0.52, -0.25], [R, -0.08],
    [0.68, 0.20], [0.80, 0.45], [0.88, 0.30], [1, 0.06]]);
  o.legZL = kf(t, [[0, -0.10], [0.15, 0.20], [0.30, 0.38], [0.52, 0.36], [R, 0.30],
    [0.68, 0.12], [0.80, 0.02], [0.88, -0.05], [1, -0.10]]);
  o.legLiftR = kf(t, [[0, 0], [0.15, 0.03], [0.30, 0.05], [0.52, 0.03], [R, 0.01],
    [0.68, 0.08], [0.80, 0], [1, 0]]);
  o.legLiftL = kf(t, [[0, 0], [0.06, 0.10], [0.15, 0], [0.68, 0], [0.80, 0.05], [0.88, 0.06],
    [0.95, 0], [1, 0]]);
  o.legSplayR = kf(t, [[0, 0.14], [0.30, 0.22], [0.52, 0.22], [0.80, 0.26], [1, 0.14]]);
  o.legSplayL = kf(t, [[0, 0.20], [0.15, 0.24], [0.52, 0.26], [0.80, 0.30], [1, 0.20]]);
}

// THE VAULT — THE DOUBLE JUMP'S OWN SHAPE (rewritten in session 185).
//
// WHAT IT REPLACES. Sessions 143-183 spent the double jump on the SHAOLIN BALANCE: *"i do an
// animation where i hold the top of the pole with my left arm and both legs on the pole and my right
// arm is dangling then if i release the 2nd jump / the double jump i get launched far in the air with
// super fast speed then the pole breaks ofc (its like the Shaolin Stick Balance)"*. Three sessions
// went into making that hang read (the grip pulled inside the arm's own reach, the legs spread
// instead of folded under the seat, a pendulum so the hold was not a freeze), and the user has now
// thrown the whole thing away: *"make when the player double jump its not holdable anymore the player
// does a front flip with the stick aiming forward and he stirkes the ground with it wich launches far
// forward in the air"*. *"its not holdable anymore"* IS the hang — the double jump is a ONE-SHOT now:
// there is no hold, there is nothing to release, and nothing the player does after the press changes
// anything. So the balance's whole body of hold machinery went with it (its max-hold clock, its sway,
// its `balHold` seconds), and what replaced it is a clock (`POLE_VAULT_T`) and one beat on it
// (`POLE_VAULT_HIT`) — the frame the tip meets the deck, which is where the launch fires and where
// the wood gives (see `updatePoleVault` / `poleVaultLaunch` in player.js).
//
// WHAT IT IS. A FRONT FLIP with the staff held out in front of the chest, and the staff's tip driven
// into the deck at the bottom of it. The double jump is spent on that one revolution.
//
// THE ONE IDEA THE SHAPE IS BUILT ON. The flip is a revolution of the RIG — it is a channel of its
// own (`poleFlipT`, ticked in `clocks.js`, read by `solveRigAngles` in rig.js) — and the staff is
// mounted in the rig's own frame (see `composePole` / `solvePoleBody`), so a staff authored at a
// fixed `pitch` would simply go round with the body: a stick on a Catherine wheel, which is not what
// a vault is and is exactly what a stick waved in a circle looks like. A vaulter's pole holds its
// AIM — it is the body that goes over the top — so this shape authors the staff's direction IN THE
// WORLD (`POLE_VAULT.aim`, radians off straight up) and spends it through `flip`, the rig's own
// angle in the revolution, which the mover hands in as `o.flip`:
//
//     o.pitch = aim(t) - flip(t)
//
// The wood therefore holds a nearly-constant world line (out in front, tipping down through the
// plant) while the body turns a whole revolution underneath it, and the HANDS — which are solved
// onto the wood rather than authored (see `posePole`) — are carried round the grip by the body the
// way a vaulter's are carried over his own pole. That is the whole difference between this and a
// spinning stick, and it is why the shape is handed the angle at all. It also fixes the stick to the
// sagittal plane: `pitch` and the flip are both rotations about the rig's own X, so they commute
// exactly as long as `yaw` is zero, which is why the vault authors no yaw at all.
//
// THE BEATS, against the clock (`POLE_VAULT_T` 0.60, `POLE_VAULT_HIT` 0.50 — so the strike is the
// BOTTOM of the revolution, where the rig is exactly inverted and `flip` is π):
//
//   0.00-0.14  THE CLIMB. The staff comes up off the carry (level at his side) and swings out in
//              front of the chest as the body leaves the deck and the revolution starts to wind. The
//              second hand closes on the wood over it (`hands` 1 → 2): a plant is a two-fisted move.
//   0.14-0.50  THE REVOLUTION. The body goes over, the legs TUCK, the staff holds its line and tips
//              down through the turn, and the hands travel over the top of the grip. The legs are
//              authored here (`legMode` 1) because up in the air there is no deck for a foot to be
//              solved onto — the same reason the balance authored its own.
//   0.50       THE STRIKE. The body is inverted, the hands are at their lowest, the staff aims down
//              and forward at its steepest, and its tip is as deep as the shape can drive it. This is
//              the frame the launch fires on and the frame the wood snaps on.
//   0.50-1.00  THE THROW. The staff is gone, so everything below is the BODY's own follow-through:
//              the legs come out of the tuck and open for the deck, the trunk unwinds, the arms track
//              the line they threw (and then come home to the carry), and the revolution COMPLETES on
//              the last share — a whole turn is visually nothing, so the handover is square and the
//              body is standing in the carry's own shape again by the time the shape lets go of it.
//
// The LEGS are a lerp between the carry's own light stagger and the tucked read (`tuck`), because in
// a front flip the legs ARE the silhouette: they fold up under the body through the part of the turn
// there is no time to read, and they come out for the plant so that the line from the hands through
// the hips to the toes is straight on the frame the tip lands.
const POLE_VAULT = {
  // THE STAFF'S AIM, in the world (rad off straight up; + tips the tip FORWARD). Both of its ends
  // are the CARRY's own `pitch`: the flip is zero on the frame the move opens and a whole turn on the
  // frame it closes, so the carry's value at both ends is what makes the two handovers seamless.
  // 2.30 at the strike is 42° under the horizontal — the steepest the wood goes, and the frame the
  // tip is deepest.
  aim: [[0, POLE_CARRY.pitch], [0.10, 1.60], [0.28, 1.94], [0.42, 2.16], [0.50, 2.30],
    [0.62, 2.22], [0.78, 1.84], [0.90, 1.52], [1, POLE_CARRY.pitch]],
  // THE GRIP, in the rig's frame (+X his left, +Y up, +Z forward). It walks from the carry's own
  // point at his side onto the body's MIDLINE and out in front of the chest — a plant is a two-fisted
  // move, so the wood has to be where both shoulders can reach it (`tyaw` squares them to it below) —
  // and back to the carry's point on the way out. `hf`/`hs` are its own two numbers: the grip a hair
  // under the middle so there is wood above the hands, and the second fist a hand's width down it.
  gx: [[0, 0.26], [0.10, 0.14], [0.30, 0.06], [0.50, 0.04], [0.66, 0.08], [0.84, 0.18],
    [1, 0.26]],
  gy: [[0, 0.83], [0.10, 0.94], [0.30, 1.02], [0.50, 1.00], [0.66, 0.94], [0.84, 0.88],
    [1, 0.83]],
  gz: [[0, 0.02], [0.10, 0.12], [0.30, 0.20], [0.50, 0.24], [0.66, 0.18], [0.84, 0.08],
    [1, 0.02]],
  hf: [[0, POLE_CARRY.hf], [0.14, 0.46], [0.50, 0.42], [0.72, 0.45], [1, POLE_CARRY.hf]],
  hs: [[0, POLE_CARRY.hs], [0.12, 0.18], [0.32, 0.13], [0.62, 0.13], [0.80, 0.20],
    [1, POLE_CARRY.hs]],
  hands: [[0, 1], [0.10, 2], [0.70, 2], [0.86, 1], [1, 1]],
  // THE BODY. `hip` is the pelvis' own height on the standing line; `lean` curls the trunk over the
  // turn and folds it over the plant (the trunk is a rotation about the hips, so it is the one thing
  // that can tuck the body that the rig's revolution cannot); `tyaw` is the SHOULDERS coming square
  // to the wood, which is both what a plant looks like and what puts the far fist in reach of it;
  // `headx` tucks the chin (positive is chin-down) and then lifts it up the line of the throw.
  hip: [[0, POLE_CARRY.hip], [0.20, 1.04], [0.50, 1.00], [0.72, 0.94], [1, POLE_CARRY.hip]],
  lean: [[0, POLE_CARRY.lean], [0.12, 0.22], [0.32, 0.34], [0.50, 0.44], [0.70, 0.26],
    [1, POLE_CARRY.lean]],
  tyaw: [[0, POLE_CARRY.tyaw], [0.12, 0.34], [0.40, 0.46], [0.52, 0.42], [0.70, 0.22],
    [1, POLE_CARRY.tyaw]],
  hyaw: [[0, POLE_CARRY.hyaw], [0.20, -0.16], [0.50, -0.20], [0.70, -0.10], [1, POLE_CARRY.hyaw]],
  headx: [[0, POLE_CARRY.headx], [0.16, 0.30], [0.50, 0.52], [0.70, 0.30], [1, POLE_CARRY.headx]],
  heady: [[0, POLE_CARRY.heady], [0.50, -0.10], [1, POLE_CARRY.heady]],
  // THE TUCK, 0 (the carry's own stagger) … 1 (folded up). Its peak is the first half of the
  // revolution and it is down to a third by the strike, so the legs are already reaching for the deck
  // on the frame the tip lands.
  tuck: [[0, 0], [0.12, 0.85], [0.34, 1.0], [0.50, 0.35], [0.66, 0.15], [0.86, 0.05], [1, 0]],
  // ...and how much of the body the legs are allowed to own. Authored from the first frame of the
  // climb (the base layer's own solve is handed back by `legBlend`), and handed back before the
  // handover so the body is standing in the carry again on the last share.
  tuckBlend: [[0, 0], [0.08, 1], [0.84, 1], [0.94, 0.25], [1, 0]],
  // [thigh, knee, sole, splay] per leg — the character's own RIGHT is `legR` (the rig's `L` bones),
  // and the LEAD of this shape is the LEFT, because the staff's own hand is. The TUCKED read is a
  // front flip's: both knees drawn up hard and the toes pointed (a tucked body is a ball), with the
  // two legs a hair apart so they read as two.
  legR: [-0.20, 0.30, 0.20, 0.18],
  legTuckR: [-1.80, 2.25, 0.40, 0.30],
  legL: [-0.20, 0.30, 0.20, 0.24],
  legTuckL: [-1.58, 2.08, 0.40, 0.24],
};

function poleHoldVault(o, t) {
  const V = POLE_VAULT;
  const mix = (a, b, k) => a + (b - a) * k;
  // THE STAFF. `aim` is a WORLD angle and `o.flip` is the rig's own share of the revolution, so the
  // line the wood keeps is `aim`, not `pitch` — see the note above. `(o.flip || 0)` because the read
  // object is shared: a caller that has not set it is a frame with no revolution in it.
  const aim = kf(t, V.aim);
  o.pitch = aim - (o.flip || 0);
  o.yaw = 0;
  o.roll = 0;
  o.spin = 0;
  o.gx = kf(t, V.gx);
  o.gy = kf(t, V.gy);
  o.gz = kf(t, V.gz);
  o.hf = kf(t, V.hf);
  o.hs = kf(t, V.hs);
  o.hands = kf(t, V.hands);
  o.grip = 1;
  o.dangle = 0;
  o.hip = kf(t, V.hip);
  o.lean = kf(t, V.lean);
  o.hyaw = kf(t, V.hyaw);
  o.tyaw = kf(t, V.tyaw);
  o.headx = kf(t, V.headx);
  o.heady = kf(t, V.heady);
  // THE LEGS. Authority is authored here (there is no deck), so the shape writes them itself — and
  // the two reads are LERPed by the tuck rather than keyed channel by channel, because a tucked leg
  // is one shape, not four independent numbers.
  const tk = kf(t, V.tuck);
  o.legMode = 1;
  o.legBlend = kf(t, V.tuckBlend);
  setLeg(o.legR, mix(V.legR[0], V.legTuckR[0], tk), mix(V.legR[1], V.legTuckR[1], tk),
    mix(V.legR[2], V.legTuckR[2], tk), mix(V.legR[3], V.legTuckR[3], tk));
  setLeg(o.legL, mix(V.legL[0], V.legTuckL[0], tk), mix(V.legL[1], V.legTuckL[1], tk),
    mix(V.legL[2], V.legTuckL[2], tk), mix(V.legL[3], V.legTuckL[3], tk));
}

// One authored leg. The read is the five numbers `poseLegAngles` takes ([blend, thigh, knee, sole,
// splay]), and it is written IN PLACE because it is read every frame: a fresh array per frame is a
// garbage-collector stumble in the middle of a move that is already holding a two-metre prop.
function setLeg(a, thigh, knee, sole, splay) {
  a[0] = 1;
  a[1] = thigh;
  a[2] = knee;
  a[3] = sole;
  a[4] = splay;
}

// ---------------------------------------------------------------------------
// THE READ. One function, one `out`, four shapes — and every shape is written ON TOP OF THE CARRY,
// which is the whole of how four moves stay continuous without a single hand-matched number between
// them: a channel a beat does not speak about is simply the carry's, and a beat that does speak
// about it owes the carry the same value on its first and last share. The mover (player.js) calls
// this ONCE a frame and then spends the answer twice — once to place the prop, once to solve the
// body onto it — so the stick that is drawn and the stick the hands are on cannot disagree.
// ---------------------------------------------------------------------------
function poleHold(mode, t, out) {
  const o = out;
  o.g.set(POLE_CARRY.gx, POLE_CARRY.gy, POLE_CARRY.gz);
  // ...and the take-point's three CHANNELS, which the shapes below move and `o.g` is then set from.
  // They are seeded here rather than only in the shapes because `out` is one object reused every
  // frame: a shape that does not speak about `gx` (the carry speaks about nothing at all, and the
  // take is a carry) would otherwise inherit the LAST move's own take-point and hold the staff
  // wherever the move before it left it. See the note on the copy at the bottom of this function.
  o.gx = POLE_CARRY.gx;
  o.gy = POLE_CARRY.gy;
  o.gz = POLE_CARRY.gz;
  o.pitch = POLE_CARRY.pitch;
  o.yaw = POLE_CARRY.yaw;
  o.hf = POLE_CARRY.hf;
  o.hs = POLE_CARRY.hs;
  o.roll = POLE_CARRY.roll;
  o.spin = 0;
  o.hip = POLE_CARRY.hip;
  o.lean = POLE_CARRY.lean;
  o.hyaw = POLE_CARRY.hyaw;
  o.tyaw = POLE_CARRY.tyaw;
  o.headx = POLE_CARRY.headx;
  o.heady = POLE_CARRY.heady;
  o.hands = POLE_CARRY.hands;
  o.dangle = POLE_CARRY.dangle;
  o.grip = POLE_CARRY.grip;
  o.legBlend = 0;
  o.legR[0] = 0;
  o.legL[0] = 0;
  // ...and the STEP's own channels (see the `legMode` note in player.js's `_poleHold`): seeded with
  // the carry's own stance, which is a light staggered one, so a shape that does not speak about
  // the legs hands the body back to the carry without a jump.
  o.legMode = 0;
  o.legZR = ANKLE_Z + 0.06;
  o.legZL = ANKLE_Z - 0.10;
  o.legLiftR = 0; o.legLiftL = 0;
  o.legSplayR = 0.14; o.legSplayL = 0.20;
  if (mode === "strike") poleHoldStrike(o, t);
  else if (mode === "throw") poleHoldThrow(o, t);
  else if (mode === "vault") poleHoldVault(o, t);
  // ---- THE TAKE-POINT IS `gx`/`gy`/`gz`, AND `g` IS ONLY THEIR HOME ----
  // This copy is the whole of the shaft's own TRAVEL, and it had gone MISSING (found again in
  // session 146, on the user's *"WHAT THE FUCK ARE THESE POLE ANIMATIONS"*): session 143's own note
  // on the old balance — *"`gy` 1.60 put the hand outside the arm's reach, measured gap 0.88, where
  // 1.25 measures 0.005"* — can only be true if this line was there when that was measured, since
  // `g` is the ONLY thing the hand's own target is read off. So it was wired once and lost in a
  // later edit, which is exactly the kind of silent regression the two comments here exist to stop
  // happening twice. `composePole` in player.js builds the shaft's matrix out of
  // `a.g` — see it there — and every shape in this file authors its take-point as the three
  // channels `gx`/`gy`/`gz` (`poleHoldStrike` crosses the body with them, `poleHoldThrow` cocks
  // them back over the shoulder, `poleHoldBalance` walks them in to the midline). Only the CARRY's
  // home point was ever written into `g`, so the shaft of every move pivoted about the carry's own
  // grip — a stick bolted to his left hip and only ever ROTATED. Measured (strike, six phases, the
  // line the pose was built on against the line the shape authored): the two are the same number
  // now and were **0.34 to 0.54 rig** apart before, and at the crossing (t 0.26) the authored
  // take-point is (-0.12, 0.86, 0.46) against the carry's (0.34, 1.02, 0.14) the pose was actually
  // built on. And because `posePole` reads its grip point off THIS SAME MATRIX (`_plG` is `a.g` by
  // construction — see the note in `composePole`), the cost was not that the hands left the wood:
  // it was that **nothing moved**. Measured over the whole flurry, the grip hand's own travel was
  // **0.04 rig** — the fist sat at (0.35, 1.02, 0.12) on every sampled frame while the staff spun
  // about it — against **0.59 rig** now, with the free hand 0.33 → 0.41. A staff that turns in a
  // fist that is not going anywhere is a staff waving about a hip, which is exactly what the user
  // was looking at, and it is the whole reason every shape in this file is authored as a moving
  // take-point in the first place. With it, the staff, the arms and the hitbox are one number
  // again, which is the property the whole feature is built on.
  o.g.set(o.gx, o.gy, o.gz);
  // ...AND THE THREE CLOCKS the shapes above are drawn on, handed back with them: the mover fires the
  // strike's contacts off `hits`, breaks the wood on `breakT`, and lets go of the throw on
  // `release`. They are the whole contract between the two files (see the note in player.js's
  // `POLE_*` block): the beats that HIT and the beats that are DRAWN are one number, so a contact
  // cannot land on a frame the pose is not driving the shaft through.
  o.hits = POLE_ATK_HITS;
  o.breakT = POLE_ATK_BREAK;
  o.release = POLE_THROW_RELEASE;
  return o;
}

// ---------------------------------------------------------------------------
// THE ARMS, on the shaft.
//
// `poseArmReach` answers in ANGLES for the arm's REST lengths, so a limb drawn 13% long by the
// stretch channel puts its hand 13% of an arm PAST the point it was solved for — which on a staff
// is 13% past the wood, i.e. a fist floating off it on exactly the frames the whip matters. So the
// ASK is shortened by the factor the chain is actually wearing (`1/k` along the shoulder→target
// line, read off the APPLIED value), which is what makes a stretched arm still land its hand on the
// stick.
function poleArm(bones, side, e, tgt, k) {
  if (k > 1.0008) {
    const sx = (side < 0 ? -1 : 1) * SHOULDER_X;
    _plT.copy(tgt).sub(bones.hips.position).applyQuaternion(_plQ.copy(bones.hips.quaternion).invert());
    _plS.set(sx, SHOULDER_Y - HIP_Y, SHOULDER_Z).multiply(bones.torso.scale).applyQuaternion(bones.torso.quaternion);
    _plT.sub(_plS).multiplyScalar(1 / k).add(_plS);
    _plT.applyQuaternion(bones.hips.quaternion).add(bones.hips.position);
  } else {
    _plT.copy(tgt);
  }
  poseArmReach(bones, side, e, _plT.x, _plT.y, _plT.z);
}

// THE WRIST — put the FIST on the shaft. `M` is the shaft's matrix in the rig's frame, so its second
// basis column is the rod's own direction; take that down the chain (hips → torso → upper arm →
// forearm) to get it in the hand's frame, and the hand's rotation is whatever maps its own grip axis
// (local `z`, the axis the digits fan along and curl about) onto it. The staff is rigid and the fist
// is rigid, so this is the whole of what a wrist does while holding one — and solving it is why the
// hands read as gripping the rod instead of touching it edge-on.
function poseWristTo(bones, side, M, e) {
  const H = side < 0 ? bones.handL : bones.handR;
  const U = side < 0 ? bones.armUpperL : bones.armUpperR;
  const L = side < 0 ? bones.armLowerL : bones.armLowerR;
  if (!H || !U || !L) return;
  _plY.setFromMatrixColumn(M, 1).normalize();
  _plQ.copy(bones.hips.quaternion)
    .multiply(bones.torso.quaternion)
    .multiply(U.quaternion)
    .multiply(L.quaternion)
    .invert();
  _plT.copy(_plY).applyQuaternion(_plQ);
  if (_plT.lengthSq() < 1e-8) return;
  _plT.normalize();
  _plQ2.setFromUnitVectors(_plZA, _plT);
  H.quaternion.slerp(_plQ2, e);
}

const _plG = new THREE.Vector3();
const _plA = new THREE.Vector3();
const _plB = new THREE.Vector3();
const _plX = new THREE.Vector3();
const _plY = new THREE.Vector3();
const _plZ = new THREE.Vector3();
const _plT = new THREE.Vector3();
const _plS = new THREE.Vector3();
const _plQ = new THREE.Quaternion();
const _plQ2 = new THREE.Quaternion();
const _plZA = new THREE.Vector3(0, 0, 1);
const _tdM = new THREE.Matrix4();
const _tdM2 = new THREE.Matrix4();
const _tdP = new THREE.Vector3();
const _tdQ = new THREE.Quaternion();
const _tdOne = new THREE.Vector3(1, 1, 1);

// THE TRUNK'S DELTA — where the carried staff's own frame lives (session 147).
//
// The carry's shaft is authored in the RIG's frame (`POLE_CARRY`'s `g`), which is the frame of a
// body STANDING: the staff hangs off the hips' own line at the waist, upright. A run does not move
// that line — it pitches the TORSO (`poseRun`'s `lean`, up to 0.68 rad at a sprint) — so a shaft
// left in the rig's frame is a shaft the runner's chest turns its back on: the shoulder rides
// forward and down with the lean while the grip stays at the waist, and the arm has to fold up and
// back to keep a fist on it. Measured at speed 9, the holding arm's elbow ran **94° … 147°** (a
// straight arm held OUT at shoulder height) where the standing carry is a constant **97°** with the
// hand a hand's width below the shoulder.
//
// This is the matrix that puts the staff on the TRUNK instead: `Rc · Rr⁻¹`, where `Rc` is the
// torso's transform in the char's own frame this frame and `Rr` the same at REST. Applying it to a
// rig-frame point re-expresses that point in the trunk's frame — so the shaft (and the fist the arm
// solves onto it) leans, bobs and sways with the runner, and the arm's own solve comes out at
// EXACTLY the standing carry's angles, because `Rr⁻¹` cancels the torso out of the target before
// `poseArmReach` measures it. The rest transform is two constants (`hips` at `HIP_Y`, `torso` at
// the origin, both with an identity rotation — see the `hinge` calls in `buildStreetCharacter`), so
// no rest matrix has to be captured: `Rr = T(0, HIP_Y, 0)` and `Rr⁻¹ = T(0, −HIP_Y, 0)`.
//
// It is spent by `player.js` on the CARRY only (see the note at the call site): the strike, the
// throw and the vault author the whole body themselves, so their shaft is already in the frame
// their own posture set and must not be moved.
//
// `k` is how much of that turn the SHAFT takes, and it is not 1 by taste: the runner's trunk leans
// up to ~0.68 rad at a sprint, and a staff that leaned by the whole of it would swing its butt down
// and its tip out to nearly horizontal once a stride. A hand carrying a staff holds it more upright
// than the chest it hangs off — the wrist takes the difference — so the shaft takes a share of the
// turn and the arm's solve, whose target is the grip the same matrix puts out, follows it: at `k`
// 1 the hold is EXACTLY the standing carry's arm; below 1 the grip shifts a few centimetres and the
// elbow opens by a few degrees to stay on it, which is the same trade a real carrier makes.
function trunkDelta(out, bones, k = 1) {
  const h = bones.hips, t = bones.torso;
  _tdP.copy(h.position); _tdQ.identity().slerp(h.quaternion, k);
  out.compose(_tdP, _tdQ, _tdOne);
  _tdP.copy(t.position); _tdQ.identity().slerp(t.quaternion, k);
  _tdM2.compose(_tdP, _tdQ, _tdOne);
  out.multiply(_tdM2);
  _tdM2.makeTranslation(0, -HIP_Y, 0);
  return out.multiply(_tdM2);
}

// ---------------------------------------------------------------------------
// THE BODY, on the read above.
//
// `u` is the layer's own weight (the mover fades it in the frame a staff is taken and out the frame
// one is let go), and `M` is the shaft's matrix in the RIG's frame — the same one the prop was
// mounted on this frame. Everything the body does here is in service of the two things the hands
// need: the trunk has to be where the shaft says it is (`lean` / `hyaw` / `tyaw` / `hip` are the
// carrying body's own posture, authored next to the shaft so they can never disagree), and the arms
// have to reach it.
//
// THE RIGHT ARM IS THE ONE EXCEPTION. In the carry it is not written at all — one fist on a staff
// leaves the other hand to the base layer, so a man carrying a staff at a run still pumps his free
// arm, and the same body standing still still has its hand in its pocket. The `dangle` channel is
// the other half of that idea — a shape that needs the arm written hanging says so — but nothing
// authors it any more: the balance was the one move that ever wanted it (there is no run cycle to
// leave the arm to up on a stick), and the vault that replaced the balance wants both fists.
// ---------------------------------------------------------------------------
function posePole(bones, u, mode, t, M, A, body = 0) {
  const R = (v) => v / POSEX;
  // ---- the body ----
  // THE CARRY'S TRUNK BELONGS TO WHOEVER IS ALREADY POSING IT. The block is the precedent (see
  // "THE BLOCK" above: its body channels are scaled by `1 - moving` so a body the run cycle is
  // carrying keeps its own trunk), and the carry needs the same hand. Its posture is authored for a
  // body STANDING with a staff — upright, no bob, no sway — so spending it over a run replaced the
  // run's own lean (measured at speed 9: the torso pitched **0.60 → 0.02 rad**), its hips' bob
  // (0.897/0.866 → **0.975 flat**) and its roll, and over a SLIDE it lifted the hips straight back
  // up out of the slide (**0.44 → 0.85 rig** on the same slide, the body skating upright). `body`
  // is what `player.js` measures the base layer to be owning — `runBlend` and every state pose's
  // own weight, read as a max — so the carry's posture is spent only as far as nothing else is
  // posing the body, and the two cross-fade on the same fades everything else uses.
  // The MOVES are exempt (`mode !== "carry"`): a strike, a throw and a vault author the whole
  // body, and a flurry thrown at a run must keep its own drive.
  const bw = mode === "carry" ? u * (1 - (body > 1 ? 1 : body < 0 ? 0 : body)) : u;
  poseHipY(bones, A.hip, bw);
  poseRot(bones, "hips", "y", R(A.hyaw), bw);
  poseRot(bones, "hips", "z", 0, bw);
  poseRot(bones, "torso", "x", R(A.lean), bw);
  poseRot(bones, "torso", "y", R(A.tyaw), bw);
  poseRot(bones, "torso", "z", 0, bw);
  poseSettleTorso(bones, bw * 0.5);
  poseRot(bones, "head", "x", R(A.headx), bw);
  poseRot(bones, "head", "y", R(A.heady), bw);
  poseRot(bones, "head", "z", 0, bw);
  // ---- the legs ----
  // THE POLE MOVES OWN THEIR LEGS NOW (session 152). The user's *"MAKE THE STAFF ANIMATION HAVE
  // LEG ANIMATIONS AND TORSO ANIMATIONS"* / *"THERE IS NOT TORSO AND HEAD ANIMATIONS AND LEGS
  // ANIMATIONS ONLY THE ARMS ARE MOVING"* is the whole of this branch. Up to here the pole's two
  // ground moves authored the hips, the trunk, the head and the shaft, and then left the LEGS to
  // whatever the base layer was doing underneath — a standing idle. From the outside that is
  // exactly the read the user describes: the upper body throws a javelin while the feet stay a
  // pedestrian's, so the eye puts all of the motion in the arms. A body that throws has to throw
  // with its legs.
  //
  // `legMode` picks how they are spent (see the note in player.js's `_poleHold`): 1 is
  // the vault's AUTHORED angles (there is no deck under a body mid-revolution), and 2 is a foot
  // deck at an authored forward offset — a step, which is what the strike and the throw are made
  // of. `ankleForSole(0)` is the ankle height that puts a flat sole exactly on the ground, so the
  // ask is the hips' own height plus whatever a shape has lifted the foot by.
  if (A.legBlend > 0.001) {
    const w = u * A.legBlend;
    if (A.legMode === 1) {
      poseLegAngles(bones, RK, A.legR[1], A.legR[2], A.legR[3], A.legR[4], w);
      poseLegAngles(bones, LK, A.legL[1], A.legL[2], A.legL[3], A.legL[4], w);
    } else {
      const groundY = ankleForSole(0) - A.hip;
      poseLegIK(bones, RK, A.legZR, groundY + A.legLiftR, A.legSplayR, w);
      poseLegIK(bones, LK, A.legZL, groundY + A.legLiftL, A.legSplayL, w);
    }
  }
  // ---- the hands, on the shaft ----
  // Read the shaft's take-point and direction OFF the matrix the mover handed in, then put a hand
  // either side of it. The LEFT hand is the one at the grip (the hand the carry and the vault are
  // both described with); the right hand sits `hs` further down the shaft, toward the butt.
  _plG.set(0, (A.hf - 0.5) * POLE_L, 0).applyMatrix4(M);
  M.extractBasis(_plX, _plY, _plZ);
  _plY.normalize();
  _plA.copy(_plG);
  _plB.copy(_plG).addScaledVector(_plY, -A.hs);
  // The fist, at the shape's own tightness — 1 through every strike, and the open hand of a throw
  // through the release (see `poleHoldThrow`).
  //
  // ---- THE SECOND HAND IS A WEIGHT, NOT A SWITCH (session 151) --------------------------------
  //
  // `A.hands` used to be read as a COUNT (`> 1` = two hands) and every line below was gated on that
  // one comparison, so the right hand either WAS on the wood or was not, and which of the two
  // changed between one frame and the next. That is fine for a shape whose right hand is on the
  // staff for the whole of it, and wrong for every shape whose two ends are the CARRY: the carry is
  // deliberately one-handed (see `POLE_CARRY` — one fist on a staff leaves the other hand to the
  // base layer), and the carry's grip is on his own LEFT at the waist, so the point a second hand
  // would have to hold (`_plB`, `hs` further down the wood) is **0.88 rig** from the right shoulder
  // against an arm 0.62 long. The solve cannot reach it and does not pretend to: with the old
  // `> 1` reading, the strike and the throw spent their last tenth of a second with the right fist
  // hanging in the air **0.27 rig** (a third of a metre, world) off the rod, because the shape's own
  // numbers were walking back to the carry while the gate kept saying "two hands".
  //
  // So `hands` is now read as the second hand's own WEIGHT: 1 is the carry's one-fist grip and 2 is
  // a full two-handed grip, and everything between is a hand ROTATING with the wood rather than
  // blinking onto it. The strike keys it 1 → 2 → 1 (`POLE_ATK_HANDS2`), so the right hand takes
  // hold a few frames into the move and lets go a few
  // frames before the end — which is what a person does with a two-metre rod — and every solve
  // below is spent at that weight. It is backwards compatible by construction: every existing shape
  // says 1 (one hand — weight zero) or 2 (two hands — weight one), so nothing that does not speak
  // about the new share moves at all.
  const hw = Math.max(0, Math.min(1, A.hands - 1));
  poseGripSide(bones, 1, A.grip, u);
  if (hw > 0.001) poseGripSide(bones, -1, A.grip, u * hw);
  const kUse = bones.stretch
    ? (bones.stretch.armUpperL.s + bones.stretch.armUpperR.s) * 0.5
    : 1;
  poleArm(bones, LK, u, _plA, kUse);
  if (hw > 0.001) poleArm(bones, RK, u * hw, _plB, kUse);
  // ...and THE RIGHT ARM, when the shape is not using it: the `dangle` read (nothing authors it any
  // more — see the note above), or nothing at all (the carry and the vault both leave it to the base
  // layer — see the note above).
  if (A.dangle > 0.001) {
    poseArmAngles(bones, RK, 0.0, 0.05, 0.12, u * A.dangle);
  }
  // THE WRISTS, last: a fist is rolled onto the rod (see `poseWristTo`), which is the one thing an
  // arm solve cannot know about the weapon it has just reached.
  poseWristTo(bones, LK, M, u);
  if (hw > 0.001) poseWristTo(bones, RK, M, u * hw);
  void mode;
  void t;
}

// Live-editable copies, for the running page (see `poseCfg`): the shaft's length and the carry are
// what a measurement is taken against, so they are readable (and the reads are callable — a harness
// can ask `POLE_CFG.HOLD("vault", 0, out)` and get the exact numbers the pose is drawing).
const POLE_CFG = {
  L: POLE_L,
  CARRY: POLE_CARRY,
  VAULT: POLE_VAULT,
  HITS: POLE_ATK_HITS,
  BREAK: POLE_ATK_BREAK,
  RELEASE: POLE_THROW_RELEASE,
  HOLD: (mode, t, out) => poleHold(mode, t, out),
};


// ONE STEP of the dash: one leg, solved onto the deck. There are three things the sagittal solver
// cannot know about on its own, and all three are solved here rather than left in the pose.
//
// 1. The splay is an ABDUCTION — a rotation of the whole leg about the body's fore-aft axis
//    (that is exactly what the `ZYX` order on the thigh makes of it) — so the ankle comes out of
//    it a `cos` nearer the hip than the depth the deck asked for, and the foot's own lateral offset
//    (`ANKLE_X` — it hangs out to the side of the shin) is carried into the vertical.
// 2. The rig's own pitch (the dash's lean, and the hips' bank on a sidestep) sits ABOVE the legs,
//    so it turns them too: a forward-pitched body pushes a forward foot DOWN, which is what lets
//    the lunge's lead foot reach at all and what a backstep has none of.
// 3. The foot's own target is a WORLD angle, not a joint one (the same bargain `poseRun`'s sole
//    solve makes): the sole has to lie flat on the deck whatever the trunk above it is doing. And
//    once a splay is in the leg the chain is no longer a sum of angles — the abduction turns every
//    joint under it, so the leftover `-(thigh + knee)` a level sole would need is not what it
//    looks like. So the world up is carried DOWN the chain the foot actually hangs from and the
//    two foot angles are read straight out of where it lands.
//
// The first two are one line on the depth handed to the IK; the third is the two lines after it.
// Measured through the real pipeline, they are the difference between a planted sole and one that
// reads under the deck (see the numbers in src/README.md).
//
// It takes `bones`/`e` as arguments (rather than being a closure inside `poseDash`) because the
// FRONT step's boxcutter has to stand on the same solve at both of its ends — see `poseBoxcutter`.
function dashStep(bones, e, side, z, splay, ankleY, bodyPitch) {
  // The depth the sagittal solver is handed is the depth that SURVIVES everything the step turns
  // it through on the way out: the abduction (the splay — a rotation about the body's fore-aft
  // axis) and the rig's own pitch, plus the way the foot hangs `ANKLE_X` out to the side of the
  // shin, so the turn carries that lateral offset into the vertical as well. One line solves it
  // for the depth the IK wants, exactly — which is the difference between a foot on the deck and
  // one five centimetres over it (the backstep's, which has no pitch to bring it back down).
  const th = side * splay + bones.hips.rotation.z;
  const pit = (bodyPitch || 0) + bones.hips.rotation.x;
  const vNeed = (ankleY + z * Math.sin(pit)) / Math.cos(pit);
  const lat = ANKLE_X * side;
  const cth = Math.cos(th);
  const vDepth = (vNeed - lat * Math.sin(th)) / (cth > 0.25 ? cth : 0.25);
  poseLegIK(bones, side, z, vDepth, splay, e);
  dashSole(bones, side, e, bodyPitch);
  // ...and the DEPTH it was asked for is handed back, because a caller that BLENDS this leg into
  // another shape has to be able to check the result against it. Nothing does at the moment: the
  // boxcutter used to, as the clamp on its kicking leg, and since session 87 it hands this solve
  // BOTH of its legs a tenth of a second before the feet arrive, so there is no blend left to guard
  // (see "The FRONT step — the boxcutter"). The return is kept because the ask is worth reading.
  return vDepth;
}

// THE SOLE'S OWN LEVELING — the last of the three things `dashStep` puts back into a bare
// `poseLegIK` (see 3. there): the two foot angles that put the sole's normal on the world up, read
// off the chain the leg actually hangs from rather than summed out of it (once a splay is in the
// leg the chain is no longer a sum of angles). Split out of `dashStep` because ONE caller has to
// run it a second time: the boxcutter pulls AUTHORED angles on top of the solved leg after the
// solve has run (see the note at its call site), and leveling a sole from a chain that is about to
// move is leveling it from a lie.
function dashSole(bones, side, e, bodyPitch) {
  const U = side < 0 ? bones.legUpperL : bones.legUpperR;
  const L = side < 0 ? bones.legLowerL : bones.legLowerR;
  const F = side < 0 ? bones.footL : bones.footR;
  U.rotation.y += (0 - U.rotation.y) * e;
  L.rotation.y += (0 - L.rotation.y) * e;
  L.rotation.z += (0 - L.rotation.z) * e;
  const up = _dashUp.set(0, 1, 0)
    .applyAxisAngle(_dashAX, -(bodyPitch + bones.hips.rotation.x))
    .applyAxisAngle(_dashAY, -bones.hips.rotation.y)
    .applyAxisAngle(_dashAZ, -bones.hips.rotation.z)
    .applyAxisAngle(_dashAZ, -U.rotation.z)
    .applyAxisAngle(_dashAX, -(U.rotation.x + L.rotation.x));
  // The foot keeps the rig's usual `XYZ` order, so its turn is `Rx(pitch) · Rz(roll)`: the roll is
  // read off the sideways part of the up and the pitch out of what is left.
  const cyz = Math.sqrt(Math.max(0, up.y * up.y + up.z * up.z));
  F.rotation.x += (Math.atan2(up.z, up.y) - F.rotation.x) * e;
  F.rotation.z += ((cyz < 1e-4 ? 0 : Math.atan2(-up.x, cyz)) - F.rotation.z) * e;
}

// ---------------------------------------------------------------------------
// THE BOXCUTTER — the FRONT step (`Q`), kind 0.
//
// The user's brief: *"fix the front dash animtion make it The Boxcutter kick animtion"*. "The
// Boxcutter" is the tricking name for a **cork hyperhook** — a HOOK KICK thrown out of a CORK (a
// twisting backflip) with the "hyper" meaning the twist does not stop at one revolution but goes on
// to TWO, and the kick is thrown on the SECOND pass. The name is the blade: the leg is CHAMBERED
// against the chest through the first turn and then SLIDES OUT like a box cutter's blade on the
// second, slices the arc with the body upside down over it, and is snapped shut again before the
// landing. (`Shurikencutter` is the same trick with a shuriken-style chamber, and a `Sheep Shearer`
// is two of them back to back — this is the plain one.)
//
// It replaced session 85's spinning wheel kick on the same `Q` (see the note on `QDASH_T`), and it
// differs from that move in the one way that matters: **IT LEAVES THE DECK.** The wheel was a
// standing kick taken off a pivot — a foot was on the pavement for the whole of it. A boxcutter is
// nothing BUT the flight, so this is the second of the game's three steps that is a PERFORMANCE
// rather than a placement (`poseBackdash` is the other), and `player.js` treats it as one: it opens
// with a leap the shape's own beats SOLVE (`P.QDASH_FRONT_HOP`), it is not ended by losing the
// ground (it has to be allowed to BE off the ground), and it puts itself back down on the beat its
// own table says.
//
// Four things about how it is built on this rig:
//
//   1. THE TURNS ARE NOT IN THE POSE. Both of them — the cork's backflip and the hyper's two
//      revolutions of yaw — are `boxcutterTurn`, a pure function of the move's clock, which
//      `player.js` reads onto the rig (`inner.rotation.x` / `.y`, the same channels the backdash's
//      backflip-and-spiral and the whirl's spin ride). One table drives the rotation AND the shape,
//      so the blade is thrown exactly on the beat the body is square-on BACKWARDS to its own line,
//      and a dropped frame cannot leave the turn behind the pose. `kick` is three-quarters of the
//      way through the twist window, which is what puts it on the SECOND pass — one and a half
//      revolutions, the body square-on-backwards, the blade across the line it is travelling down.
//   2. THE BACKFLIP IS SCOPED TO THE FLIGHT. It opens on `launch` and finishes on `unwind`, and it
//      is EXACTLY 0 at both ends — so the body is upright while a foot is still on the deck and
//      upright again on the frame the feet come back to it. That is not tidiness: the deck solve
//      below only knows about the rig's own lean, so a body left mid-flip under a solved foot
//      plants it through the pavement. It also means the landing is a landing and not a stumble
//      out of one — the trick is finished before the feet arrive.
//   3. THE LEGS ARE AUTHORED OUT OF THE FLIGHT AND SOLVED AT BOTH ENDS. `poseLegIK` places a FOOT
//      on a DECK in the HIPS' frame, which is exactly right for the two beats the body is standing
//      on (and wrong in the air, where there is no deck); `dashStep` is the same solve with the
//      rig's own lean and the sole's world angle taken out of it, which is what the takeoff wants
//      because the body is already leaning into the step by then. Between them the legs are just
//      ANGLES — a chambered knee and an extended one — which is the only honest way to draw a limb
//      that is not standing on anything.
//   4. THE BLADE IS THE EXTENSION. `ext` opens the leg (straight, abducted, toe pointed) and
//      `chamber` shuts it; everything the kick IS lives in the difference between those two
//      numbers, and the STRETCH channel (see "Squash and stretch") asks for the last few per cent
//      of it on the kick's own beat, so the limb is drawn a blade's length longer at the slice.
//
// `player.js` also reads `kick` (published as `userData.boxcutterBeats`): a front step that touches
// a body BEFORE the kick does not deliver it there — it compresses its own clock onto this beat so
// the BLADE is what lands. See `dashContact`.
// ---------------------------------------------------------------------------

const BOXCUT = {
  // ---- THE BEATS (fractions of `P.QDASH_T[0]`) ----
  coil: 0.09,     // the gather: the takeoff step is planted and the body is wound the wrong way
  launch: 0.19,   // THE TAKEOFF: the feet leave the deck and the cork's backflip opens
  cock: 0.33,     // THE CHAMBER: laid over, the kicking knee up against the chest, the blade SHUT
  kick: 0.50,     // THE BLADE: the leg is out — the hook at its widest, the body over it
  kickEnd: 0.60,  // ...and the hook CLOSES (the knee snaps back in off the slice)
  unwind: 0.72,   // the flips and the turns are spent, the body upright, the legs reaching down
  plant: 0.80,    // the landing foot is on the deck
  absorb: 0.89,   // ...and the crouch that takes the weight of the whole trick
  settle: 0.97,   // ...and he is up out of it, into the run
  // ---- THE TURNS ----
  // The twist window, and `kick` sits at exactly three quarters of it: the blade is thrown on the
  // SECOND revolution, one and a half turns in, which is the beat the body is square-on-backwards
  // to its own line — the same relationship the wheel kick's own `kick` had to its one revolution.
  // The backflip's own curve is `flipKeys` below (it is a keyed curve rather than a window because
  // it has to be dead flat at both ends — see 2. above — and it is read by `player.js`, so it is
  // built here as data rather than baked as a formula).
  spinA: 0.15,
  spinB: 0.67,
  flipKeys: [
    [0, 0], [0.19, 0], [0.33, 0.33], [0.50, 0.50], [0.60, 0.72], [0.72, 1], [1, 1],
  ],
  // ---- THE HIPS, as DEPTHS below `HIP_Y`, one scalar per beat ----
  // (The hip is the thing that carries the body up over the trick and puts it back down: down into
  // the gather, up off the takeoff, HELD up through the whole flight — a hip at deck height with a
  // flip on it would put the head through the pavement — and then down into the landing crouch.)
  dipCoil: 0.16,
  dipLaunch: 0.03,
  dipCock: 0.06,
  dipKick: 0.08,
  dipKickEnd: 0.04,
  dipUnwind: 0.06,
  dipPlant: 0.13,
  dipAbsorb: 0.30,
  dipSettle: 0.11,
  // ---- THE KICKING LEG (the character's RIGHT — the rig's `L` bones, `KICK_SIDE`) ----
  // `abductKick` is the wheel kick's own measured number, reused on purpose: at 1.5708 a straight
  // leg is thrown out along the body's own right axis, level with the hip, shoe in line with it —
  // and because the BODY IS UPSIDE DOWN exactly here (the backflip is one half-revolution on the
  // `kick` beat), "level with the hip in the body's frame" is level in the WORLD. The blade and the
  // wheel therefore throw the limb down the same world line; what makes this a boxcutter is the
  // CHAMBER either side of it and the second revolution carrying it round.
  abductKick: 1.5708,
  kneeKick: 0.04,
  // The hook: how far the knee is folded at the two ends of the slice (the blade shut) and how far
  // the leg is abducted at the chamber (knee up and ACROSS, which is what a chamber is).
  kneeChamber: 2.15,
  abductChamber: 0.55,
  // ...and the landing: the stagger the feet arrive in, and the toe the blade foot goes out with.
  landLead: 0.24,
  landRear: -0.16,
  landSplay: 0.13,
  toeOut: 0.50,
};

function boxcutterTurn(u) {
  const t = Math.max(0, Math.min(1, u));
  const B = BOXCUT;
  const spin = poseEase(Math.max(0, Math.min(1,
    (t - B.spinA) / Math.max(1e-3, B.spinB - B.spinA))));
  return { x: -Math.PI * 2 * kf(t, B.flipKeys), y: Math.PI * 4 * spin };
}

// The leg the blade is thrown with: the character's RIGHT (the rig's `L` bones), which is the leg
// the front lunge led with and the wheel kick kicked with — the same limb, so the beat the contact
// logic compresses onto is still the beat that limb is out on.
const KICK_SIDE = -1;

function poseBoxcutter(bones, e, t, bodyPitch) {
  const B = BOXCUT;
  const p = -KICK_SIDE;            // the character's LEFT — the leg the takeoff stands on
  // ---- the beats. `wind` is the gather, `curl` the cork's own ball, `chamber` the blade SHUT,
  // `ext` the blade OPEN, `open` the arms thrown out of the tuck, `fold` the landing, and `disc`
  // how much of the move is standing ON THE DECK (its complement is the flight).
  const wind = kf(t, [[0, 0], [B.coil, 0.9], [B.launch, 1], [B.cock, 0.5], [B.kick, 0.12], [B.unwind, 0], [1, 0]]);
  const curl = kf(t, [[0, 0], [B.launch, 0.6], [B.cock, 1], [B.kick, 0.7], [B.kickEnd, 0.45], [B.unwind, 0.12], [1, 0]]);
  const chamber = kf(t, [[0, 0.25], [B.launch, 0.9], [B.cock, 1], [B.kick, 0.28], [B.kickEnd, 0.95], [B.unwind, 0.3], [1, 0]]);
  const ext = kf(t, [[0, 0.05], [B.launch, 0.1], [B.cock, 0.34], [B.kick, 1], [B.kickEnd, 0.5], [B.unwind, 0.18], [B.plant, 0.03], [1, 0]]);
  const open = kf(t, [[0, 0], [B.coil, 0.25], [B.launch, 0.6], [B.cock, 0.22], [B.kick, 1], [B.kickEnd, 0.78], [B.unwind, 0.45], [B.plant, 0.9], [B.absorb, 0.55], [1, 0.05]]);
  const tuck = kf(t, [[0, 0], [B.launch, 0.35], [B.cock, 1], [B.kick, 0.55], [B.kickEnd, 0.85], [B.unwind, 0.3], [1, 0]]);
  const fold = kf(t, [[0, 0], [B.plant, 0.2], [B.absorb, 1], [B.settle, 0.25], [1, 0]]);
  // THE DECK'S OWN WEIGHT — the thing that decides whether a leg is SOLVED or AUTHORED. It comes
  // off over [coil, launch] and comes back on over [unwind, plant], which are exactly the two
  // windows the backflip is dead flat on (see 2. at the top of this section), so the solve is only
  // ever handed a body that is standing up.
  const disc = kf(t, [[0, 1], [B.coil, 1], [B.launch, 0], [B.kickEnd, 0], [0.68, 0.92], [B.unwind, 1], [1, 1]]);
  const air = 1 - disc;

  const dip = kf(t, [[0, 0.05], [B.coil, B.dipCoil], [B.launch, B.dipLaunch], [B.cock, B.dipCock],
    [B.kick, B.dipKick], [B.kickEnd, B.dipKickEnd], [B.unwind, B.dipUnwind], [B.plant, B.dipPlant],
    [B.absorb, B.dipAbsorb], [B.settle, B.dipSettle], [1, 0.03]]);
  const hip = HIP_Y - dip;
  poseHipY(bones, hip, e);
  poseSettleTorso(bones, e);

  // ---- the trunk. Wound across in the gather, BALLED UP for the cork (a body going over backwards
  // curls over itself to take the head through it), then OPENED against the blade — the arch is the
  // counterweight that keeps the extended leg from reading as a fall — and finally folded over the
  // landing. Nothing here tumbles: the flip is the rig's (see `boxcutterTurn`).
  poseRot(bones, "torso", "x", 0.20 * wind + 0.95 * curl - 0.35 * ext + 0.90 * fold, e);
  poseRot(bones, "torso", "y", -0.40 * wind + 0.30 * ext, e);
  poseRot(bones, "torso", "z", -KICK_SIDE * 0.22 * ext, e);
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", 0.30 * wind - 0.18 * ext, e);
  // ...and the pelvis is LEVEL through the landing on purpose: `poseLegIK` solves in the hips'
  // frame, so a pelvis left rolled on the beat a foot plants walks that foot off the deck by
  // `0.775 sin(roll)`. This had a `+ 0.10 fold` term on it — a boxer's hip accent borrowed from
  // the wheel kick — and measured through the real pipeline it took the shoe **0.08 UNDER the
  // pavement** at the absorb (the frame the crouch is deepest), against a sidestep's own worst of
  // 0.014 above it. The roll is the kick's now (`ext`) and it is spent before the feet arrive.
  poseRot(bones, "hips", "z", -KICK_SIDE * 0.18 * ext, e);
  // The head LEADS the turn (a spun body's head goes first), comes up out of the ball to find the
  // line the blade is cutting, and then cranes through the landing fold.
  poseRot(bones, "head", "y", 0.38 * wind + 0.20 * ext - 0.34 * fold, e);
  poseRot(bones, "head", "x", 0.32 * curl - 0.30 * ext + 0.34 * fold, e);
  poseRot(bones, "head", "z", KICK_SIDE * 0.20 * ext, e);

  // ---- the legs. First the two beats that stand on the deck, through the shared solved step (see
  // `dashStep` — the abduction, the rig's lean and the sole's world angle all come out inside it),
  // and then the flight's own angles pulled on top of them by `air`. The solve comes FIRST for the
  // same reason the wheel kick's does: everything the kick does is a PULL away from where the solve
  // left the leg, so at the two ends (where `air` is 0) the foot is exactly where a step puts it.
  const ankleY = ankleForSole(0) - hip;
  const kz = kf(t, [[0, ANKLE_Z + 0.30], [B.launch, ANKLE_Z + 0.34], [B.unwind, ANKLE_Z + 0.18],
    [B.plant, ANKLE_Z + B.landLead], [1, ANKLE_Z + 0.06]]);
  const pz = kf(t, [[0, ANKLE_Z - 0.24], [B.launch, ANKLE_Z - 0.30], [B.unwind, ANKLE_Z - 0.14],
    [B.plant, ANKLE_Z + B.landRear], [1, ANKLE_Z - 0.04]]);
  const ksp = kf(t, [[0, 0.11], [B.plant, B.landSplay], [1, REST.legL[3]]]);
  const psp = kf(t, [[0, 0.13], [B.plant, B.landSplay], [1, REST.legR[3]]]);
  dashStep(bones, e * disc, KICK_SIDE, kz, ksp, ankleY, bodyPitch);
  dashStep(bones, e * disc, p, pz, psp, ankleY, bodyPitch);

  // The blade. `thigh` is its fore/aft swing (negative forward), `abduct` how far out of the body's
  // own plane it is thrown, `knee` the fold: SHUT against the chest through the first revolution,
  // OPEN across the line on the second, SHUT again off the slice.
  const kThigh = kf(t, [[0, 0.22], [B.launch, -0.85], [B.cock, -1.15], [B.kick, -0.22],
    [B.kickEnd, -0.40], [B.unwind, 0.16], [B.plant, 0.10], [1, 0]]);
  const kAbduct = kf(t, [[0, 0.10], [B.launch, 0.40], [B.cock, B.abductChamber], [B.kick, B.abductKick],
    [B.kickEnd, 1.15], [B.unwind, 0.55], [B.plant, 0.30], [1, 0.05]]);
  const kKnee = kf(t, [[0, 0.55], [B.launch, 1.35], [B.cock, B.kneeChamber], [B.kick, B.kneeKick],
    [B.kickEnd, 1.45], [B.unwind, 0.90], [B.plant, 0.55], [1, 0.10]]);
  // ...and the pivot leg: it DRIVES the takeoff, then balls up under the body for the whole flight
  // (the tuck is the leg that is not kicking, and a tuck is what reads a flip), then reaches down
  // first — it is the foot that catches the landing while the blade foot is still coming round.
  const pThigh = kf(t, [[0, -0.10], [B.launch, 0.30], [B.cock, -1.05], [B.kick, -0.95],
    [B.kickEnd, -0.80], [B.unwind, 0.10], [B.plant, 0.06], [1, 0]]);
  const pAbduct = kf(t, [[0, 0.06], [B.launch, 0.10], [B.cock, 0.35], [B.kick, 0.40],
    [B.kickEnd, 0.36], [B.unwind, 0.20], [B.plant, 0.14], [1, 0.05]]);
  const pKnee = kf(t, [[0, 0.40], [B.launch, 0.25], [B.cock, 1.85], [B.kick, 1.95],
    [B.kickEnd, 1.70], [B.unwind, 0.55], [B.plant, 0.50], [1, 0.10]]);
  const KU = KICK_SIDE < 0 ? bones.legUpperL : bones.legUpperR;
  const KL = KICK_SIDE < 0 ? bones.legLowerL : bones.legLowerR;
  const KF = KICK_SIDE < 0 ? bones.footL : bones.footR;
  const PU = p < 0 ? bones.legUpperL : bones.legUpperR;
  const PL = p < 0 ? bones.legLowerL : bones.legLowerR;
  const PF = p < 0 ? bones.footL : bones.footR;
  KU.rotation.x += (kThigh * POSEX - KU.rotation.x) * air;
  KU.rotation.z += (KICK_SIDE * kAbduct * POSEX - KU.rotation.z) * air;
  KL.rotation.x += (kKnee * POSEX - KL.rotation.x) * air;
  PU.rotation.x += (pThigh * POSEX - PU.rotation.x) * air;
  PU.rotation.z += (p * pAbduct * POSEX - PU.rotation.z) * air;
  PL.rotation.x += (pKnee * POSEX - PL.rotation.x) * air;
  // The feet follow the legs they are on. The blade's toe goes OUT with the slice — a pointed foot
  // is half of what makes an extended leg read as a blade rather than as a dangling limb — and both
  // are written every frame the flight owns them, because a channel nothing writes keeps whatever
  // the last pose left on it.
  KF.rotation.x += (B.toeOut * ext - KF.rotation.x) * air;
  KF.rotation.z += (0 - KF.rotation.z) * air;
  PF.rotation.x += (0.30 * ext - PF.rotation.x) * air;
  PF.rotation.z += (0 - PF.rotation.z) * air;
  // ...and the sole is LEVELED AGAIN, from the chain the flight's own authorship has just finished
  // writing. `dashStep` levels the foot off the leg it was handed — but the boxcutter then PULLS
  // that leg (the blade and the tuck are authored angles laid on top of the solve), so the leveling
  // is computed from a chain that is about to move and the foot trails it by a frame. Measured
  // through the real pipeline on the reach-down, that lag is a 9.6-degree toe-down sole at t 0.676
  // — with the ankle already at deck height (0.317) that is the shoe's lowest vertex 0.023 BELOW
  // the pavement for the three frames the legs are swinging down. Leveled again after the pull, at
  // the deck's own weight (`disc`), the toe level is within a degree of flat the whole way in.
  dashSole(bones, KICK_SIDE, e * disc, bodyPitch);
  dashSole(bones, p, e * disc, bodyPitch);

  // ---- the arms. Wrapped across the chest for the whole of the twist (the arms are half of what
  // reads a turn, and a tucked pair is half of what reads a BALL), thrown OPEN off the blade — the
  // far arm out wide, the near one swept back, the pair that reads the slice from behind — and then
  // out for the landing and down into the crouch.
  poseArmAngles(bones, p,
    -1.30 * open - 1.05 * wind + 0.35 * fold - 1.10 * tuck,
    0.55 * open - 0.55 * wind - 0.40 * tuck,
    -0.75 * open - 0.95 * wind - 0.30 * fold - 1.30 * tuck, e, -0.35 * open);
  poseArmAngles(bones, KICK_SIDE,
    0.85 * open + 0.30 * wind - 0.45 * fold - 1.00 * tuck,
    0.42 * open - 0.30 * wind + 0.45 * tuck,
    -0.55 * open - 0.80 * wind - 0.55 * fold - 1.45 * tuck, e, 0.35 * open);
  // ...and the few per cent of LENGTH the blade is drawn with at the slice (see 4. above). Asked for
  // on the kick's beat only, so the limb is its true length again long before the foot comes down.
  poseStretchChain(bones, "leg", KICK_SIDE, 1 + 0.055 * ext * ext);
}


function poseDash(bones, e, u, kind, side, bodyPitch) {
  const t = Math.max(0, Math.min(1, u));
  const k = kind | 0;
  const s = side < 0 ? -1 : 1;
  // The step's own envelope: everything is up on the opening third and back under him by the end,
  // which is what makes it read as a step rather than a shape he sits in. The ends meet the run's
  // own stance (a shallow dip, the hips near `HIP_Y`), so the handover back into the run is clean.
  const push = kf(t, [[0, 0.30], [0.32, 1], [1, 0.22]]);
  // The two thigh bones run on the `ZYX` order while this pose is on the rig, so the splay below is
  // a real abduction — out to the side of the BODY rather than of the thigh (see the reset and the
  // measurement in `player.js`). The base poses put them back to `XYZ` every frame. The BACKDASH
  // is the exception (`k === 2`): its legs are never solved against a deck at all (see
  // `poseBackdash`), so it keeps the `XYZ` below and the solver below never runs for it.
  if (k !== 2) {
    bones.legUpperL.rotation.order = "ZYX";
    bones.legUpperR.rotation.order = "ZYX";
  }
  const hip = HIP_Y - DASH.hip * push;
  const ankleY = ankleForSole(0) - hip;
  const step = (side, z, splay) => dashStep(bones, e, side, z, splay, ankleY, bodyPitch);
  // ONE STEP of the dash, solved — the body of this lives at module level as `dashStep`, because the
  // FRONT step's spin kick has to place a foot on the deck too (see `poseSpinKick`). See that
  // function for the three things it puts back into a bare `poseLegIK` and the measurements behind
  // each. The three corrections are all for a STEP — an abduction, a rig pitch, a solved sole — and
  // the wrapper is only here so the two callers below read the same as they always have.
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "y", 0, e);
  poseSettleTorso(bones, e);

  if (k === 1) {
    // SIDESTEP. The body goes over the lead leg and rolls into the step. The neck takes the bank
    // back out — the head stays on the line he was already looking down — because without that a
    // banked body reads as a stumble rather than a step.
    poseRot(bones, "hips", "z", s * DASH.bank * push, e);
    poseRot(bones, "torso", "x", DASH.leanS * push, e);
    poseRot(bones, "torso", "y", s * 0.22 * push, e);
    poseRot(bones, "torso", "z", s * DASH.bank * 0.55 * push, e);
    poseRot(bones, "head", "x", -0.10 * push, e);
    poseRot(bones, "head", "y", -s * 0.18 * push, e);
    poseRot(bones, "head", "z", -s * DASH.bank * 0.45 * push, e);
    step(-s, ANKLE_Z + 0.12 * push, DASH.side * push);
    step(s, ANKLE_Z - 0.10 * push, 0.14);
    poseArmAngles(bones, -s, 0.10, 1.05 * push, -0.70 * push, e);
    poseArmAngles(bones, s, -0.35 * push, 0.25, -1.55 * push, e);
  } else if (k === 2) {
    // THE BACKDASH — the whole performance, and the only step in the game that is not a placement:
    // it leaves the deck, turns a full revolution about the body's own centre and comes down into
    // a hero landing (see `poseBackdash`). It owns the rig's own turn as well (`backdashTurn`,
    // read by `player.js`), and none of its legs are solved against a deck — so it dresses itself.
    poseBackdash(bones, e, t);
  } else {
    // FRONT DASH — THE BOXCUTTER (see `poseBoxcutter` above, and `BOXCUT` for the beats). The one
    // step whose SHAPE is a flight rather than a placement: it dresses itself, and the two turns in
    // it (the cork's backflip and the hyper's second revolution) are not written here — they are
    // `boxcutterTurn`, read by `player.js` onto the rig's own pitch and yaw. The deck solves at its
    // two ends are inside `poseBoxcutter` rather than here, because they are the same solve this
    // function wraps (`dashStep`) and they belong to that shape's own beats.
    poseBoxcutter(bones, e, t, bodyPitch);
  }
  if (k !== 2) poseGrip(bones, 0.55, e);
}

// ---------------------------------------------------------------------------
// THE BACKDASH — kind 2 of the `Q` step, and the only one of the three that is a PERFORMANCE
// rather than a placement.
//
// The user's brief, and it is all one sentence: *"the player does a 1 second backdash ... its
// animation is a backflip then a spiral spin into a hero land pose then standing up"*, with
// *"it give I Frames for just 0.2 seconds in the middle of its 1 second duration"*. Those two
// tenths are the SPIRAL below, and `player.js`'s `invuln` reads this file's own beat table to
// place them, so the window can never drift off the shape it is supposed to be covering.
//
// Three things make it unlike every other shape in the game:
//
//   1. IT LEAVES THE DECK. Its lift (`P.QDASH_BACK_HOP`) is spent on the first frame and the body
//      is airborne until `BACKDASH.spin` — the very beat the feet reach down for the deck again.
//      The hop is solved off this table rather than guessed (`2 v / g` IS `spin`; see the note in
//      `player.js`), so the shape and the arc are the same decision.
//   2. IT TURNS. The whole rig's -2 PI (the backflip) and its +2 PI about the vertical (the
//      spiral) are NOT written here — they are `backdashTurn` below, which `player.js` reads and
//      puts on `inner.rotation.x` / `inner.rotation.y`, the rig's own turn, the same channel the
//      whirl and the sweep spin on. One table drives the rotation AND the shape, so the tuck can
//      be released on exactly the frame its revolution finishes instead of on an authored guess.
//   3. IT LANDS ON TWO POINTS. The two beats that touch the deck are placed by `poseLegIK` — the
//      sagittal solver `poseDash`'s `step` wraps, used bare, because the wrapper's three
//      corrections are all for a STEP (an abduction, a rig pitch, a solved sole) and neither
//      landing leg has any of them. Both legs are handed an ANKLE TARGET in the hips' frame,
//      flown through the whole move: `ANKLE_Y` (0.225) is where a sole sits on the deck, so a
//      target of `ANKLE_Y - hip` IS a foot on it, and a hand-off from a tuck to a plant is then
//      just the target moving rather than two writers agreeing.
//
// The beats (the whole performance is now ONE AND A HALF seconds — `P.QDASH_T[2]` — because the
// user asked for the hero landing to be HELD and then SLID out of, and neither fits inside a
// second). The `t` column below is the FRACTION of that clock, which is the space every reader of
// this table works in (`player.js` hands the pose and `backdashTurn` `stateTime / qdashTime()`, and
// scales the beats back up for the i-frame window) — so `turn` 0.44 is 0.66 s of real time:
//
//   t 0.00-0.06  THE COIL     he is already off the deck — the hop is spent on frame one — but the
//                             legs are still folded under him and the arms have just swung back
//                             and down: the shape a leap is actually thrown FROM, so the
//                             extension that follows reads as one.
//   t 0.06-0.44  THE TWIST    A BACKFLIP AND A SPIRAL AT THE SAME TIME — the user's own brief,
//                             *"make it do the backflip and spiral at the same time"*. The knees
//                             come to the chest and the arms wrap them (a ball), and the whole rig
//                             spends -2 PI about the body's own X AND +2 PI about the vertical
//                             across the ONE window, so it is a TWISTING backflip rather than a
//                             flip and *then* a spin. The rig's own turn is spent by here, which is
//                             also the beat the feet reach down for the deck. THIS is the i-frames.
//   t 0.44-0.50  THE REACH    the tuck opens out and both feet are thrown down for the deck.
//   t 0.50-0.54  THE LANDING  the hero landing is ARRIVED at (`land`) and settled on for the
//                             blink of a beat to `hold` — the RIGHT knee down with its toes tucked
//                             under it and the LEFT foot planted forward under a folded trunk, the
//                             RIGHT fist driven into the deck. The hold used to be a long one
//                             (`land` 0.50 to `hold` 0.70, i.e. 0.3 s, the user's *"make it hold it
//                             for a bit"*), and it has been TRIMMED to a settle because of the
//                             user's later ask: *"theres a slide when the player does a hero land
//                             can u fix its timing and make it as soon as the player does the hero
//                             land"*. The shape still reads as a landing because the SLIDE below
//                             is played in this same kneel — what changed is only how long the body
//                             sits still in it before it starts skimming.
//   t 0.54-0.88  THE SLIDE    still in the landing shape, the whole body slides BACKWARDS along the
//                             deck — the user's *"make it slide backwards"* — the planted foot
//                             skimming out ahead and the trunk unfolding a little as it goes. The
//                             travel itself is `player.js`'s (see `BACK_HOLD_SPEED` /
//                             `BACK_SLIDE_SPEED`), read off these same beats.
//   t 0.80-1.00  THE RISE     stood up out of the slide, ending exactly on `REST` so the handover
//                             back to the run costs nothing.
//
// ...and `player.js` reads the SAME line the leap is aimed down (`dashDir`) with the wish while the
// flip is in the air, so the leap can be pointed wherever the camera is turned (see `P.BACK_STEER`),
// and the line is COMMITTED a quarter of a second before `land` — the landing and the slide out of
// it are spent on it and the wish cannot touch them (the user's *"make the hero land for the
// backdash not get effected when i move left right or back or forward"*, session 123, which retired
// the old re-aim here — see `P`'s "THE RE-AIM"). The beats below say WHEN each part happens, never
// WHICH WAY.
// ...and the ROTATION LOCK (session 77): the two revolutions are DONE a quarter of a second before
// the hero landing, because the user asked for exactly that — *"make the player rotation lock when
// before he does a super hero land with 0.25 seconds"*. So the last 0.25 s before the landing is a
// SQUARE, STILL body falling onto the deck, instead of a body still coming round as it plants. Both
// the rig's turn and the tuck come out on that one beat, which is the point: a body that stopped
// spinning but stayed curled would read as a flip that was cut short.
//
// `turn` is a DIFFERENT beat and is not the same number: it is the beat the feet come back down,
// which is what `player.js` solves the leap's own hop off (`P.QDASH_BACK_HOP` — the arc has to be
// down at `turn × 1.5` s). It must not move when the lock does, or the body would reach the deck at
// a different beat from the one the pose plants its feet on.
const BACK_LAND = 0.50;         // the hero landing is ARRIVED at here (a fraction of the 1.5 s clock)
const BACK_LOCK_T = 0.25;       // seconds of square, still body before it — the beat the backflip and
                                // the spiral are both spent on, so the body drops onto the deck SQUARE.
                                // Session 127 took this off the TRAVEL, which the camera steers now
                                // (see `P.BACK_STEER`); it is the POSE's own beat alone.
const BACKDASH = {
  coil: 0.06,      // the launch compression is released by here (the body straight again)
  lock: BACK_LAND - BACK_LOCK_T / 1.5,   // 0.3333 — the twist, and the tuck, are DONE
  turn: 0.44,      // the feet come back down (the hop is solved off this — NOT the twist's beat)
  land: BACK_LAND, // the hero landing is ARRIVED at here...
  hold: 0.54,      // ...settled on to here (a blink: the slide starts as soon as the landing lands)...
  slide: 0.80,     // ...and SLID backwards to here, then stood up out of by 1.00
};

// The rig's own turn for the backdash, in one place (see 2. above): `x` is the backflip — NEGATIVE,
// the same sign as the wall kick's own flip, because -rotation.x is the head coming up and over the
// shoulders — and `y` is the spiral. The two run TOGETHER off one eased window (`coil` -> `lock`),
// which is what makes it a TWISTING backflip rather than a flip then a spin. Both are whole
// revolutions finished on that one beat — a quarter of a second before the landing, so what is left
// is a square body dropping onto the deck — which is also why the "finish the tumble" tidy-up in
// `player.js` (which winds a leftover partial turn on to the next whole one) has nothing left to do
// but drop them.
function backdashTurn(u) {
  const t = Math.max(0, Math.min(1, u));
  const a = poseEase(Math.max(0, Math.min(1,
    (t - BACKDASH.coil) / Math.max(1e-3, BACKDASH.lock - BACKDASH.coil))));
  return { x: -Math.PI * 2 * a, y: Math.PI * 2 * a };
}

function poseBackdash(bones, e, t) {
  const B = BACKDASH;
  // ---- the hips: dropped into the coil, up through the launch, drawn up into the tuck (a tucked
  // body's pelvis is the thing that goes over), let out through the twist, and then put down on the
  // deck for the kneel. That landing height is a MEASUREMENT rather than a taste: the kneel puts a
  // thigh under the pelvis with the knee's own (chunky) cap for a contact, and the sweep through
  // the real pipeline says a hip of 0.56 leaves the knee's cap a centimetre clear of the deck while
  // the two feet still land on it (see the legs below). It is held there through the hold and only
  // comes up a whisker for the SLIDE, which is what lets the whole shape drag backwards.
  const hip = kf(t, [
    [0, 0.58], [B.coil, HIP_Y - 0.05], [0.18, 0.62], [B.turn, 0.70],
    [B.land, 0.560], [B.hold, 0.560], [B.slide, 0.585], [1, REST.hip],
  ]);
  poseHipY(bones, hip, e);
  // The pelvis rides the tuck and comes back LEVEL for the landing, which is not decoration:
  // `poseLegIK` solves in the hips' frame, so a pelvis left tipped on the beat a foot plants would
  // walk that foot off the deck by `0.775 * sin(tilt)` — 8 cm at the coil's own 0.10, which is the
  // whole error budget. The twist stays, because the kneel IS a twist (the left foot is passed the
  // right) and the solver's own `z` is measured off it, which is exactly what we want it to mean.
  poseRot(bones, "hips", "x", kf(t, [
    [0, 0.10], [B.coil, -0.20], [0.18, 0.40], [B.turn, 0.34],
    [B.land, 0], [B.hold, 0], [B.slide, -0.05], [1, 0],
  ]), e);
  poseRot(bones, "hips", "y", kf(t, [
    [0, 0], [B.turn, 0], [B.land, 0.20], [B.hold, 0.20], [B.slide, 0.13], [1, 0],
  ]), e);
  poseRot(bones, "hips", "z", 0, e);
  // ---- the trunk: the curl that closes the tuck into a ball, held through the whole twist, and
  // then FOLDED — hard — over the planted leg on the landing. That fold is not styling: the rig's
  // arm reaches 0.607 from a shoulder that stands 0.40 over the hip, so a fist can only be brought
  // down onto the deck by bringing the shoulder down to meet it, and the fold is what does it. It
  // is HELD through the hold and unfolds a little over the slide, as the body skims back and the
  // eyes stay on the fight.
  poseRot(bones, "torso", "x", kf(t, [
    [0, 0.34], [B.coil, 0.02], [0.18, 1.00], [B.lock, 0.94],
    [B.land, 1.20], [B.hold, 1.16], [B.slide, 0.86], [1, REST.torsoX],
  ]), e);
  poseRot(bones, "torso", "y", kf(t, [
    [0, 0], [B.turn, 0], [B.land, 0.16], [B.hold, 0.16], [B.slide, 0.09], [1, 0],
  ]), e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  // ---- the head: tucked into the tuck, up out of the twist (he is looking for the deck he is
  // about to arrive on), and then CRANED through the landing fold — the trunk goes down and the
  // eyes stay on the fight, which is the whole reason the fold can be this deep without reading as
  // a stumble. The crane is relaxed across the slide.
  poseRot(bones, "head", "x", kf(t, [
    [0, 0.26], [B.coil, -0.14], [0.18, -0.28], [B.lock, -0.22],
    [B.land, -0.96], [B.hold, -0.90], [B.slide, -0.52], [1, REST.headX],
  ]), e);
  poseRot(bones, "head", "y", kf(t, [
    [0, 0], [B.turn, 0], [B.land, -0.22], [B.hold, -0.20], [B.slide, -0.12], [1, 0],
  ]), e);
  poseRot(bones, "head", "z", 0, e);
  // ---- the legs, both off an ankle target in the hips' frame (`z` forward, `y` up; see 3. above).
  // The LEFT is the one that ends up planted out in front; the RIGHT is the one that goes down on
  // its knee, and a kneel on the ball of the foot is nothing more than its foot placed BEHIND the
  // knee with the sole flat — which is exactly what the solver draws: the shin comes back up out of
  // it and the knee is left as the lowest point of the leg.
  //
  // The four landing depths are MEASURED, and off the real pipeline (the sole's own probe plane,
  // `SOLE_Y`, is a hand's width off the shoe's lowest vertex on this rig, and a swept-back shin
  // tilts the foot a little further still — so a target that is arithmetically exact lands the shoe
  // four centimetres under the deck). These are the numbers that came back with the knee's cap, the
  // planted sole and the tucked sole all on the deck at the same time, to within a centimetre.
  const lz = kf(t, [
    [0, 0.20], [B.coil, 0.05], [0.18, 0.15], [B.turn, 0.20],
    [B.land, 0.50], [B.hold, 0.50], [B.slide, 0.64], [1, ANKLE_Z],
  ]);
  const ly = kf(t, [
    [0, ANKLE_Y - 0.58], [B.coil, -0.760], [0.18, -0.345], [B.turn, -0.455],
    [B.land, -0.285], [B.hold, -0.302], [B.slide, -0.268],
    [1, ANKLE_Y - REST.hip],
  ]);
  const lsp = kf(t, [
    [0, 0.30], [B.coil, 0.16], [0.18, 0.24], [B.turn, 0.20],
    [B.land, 0.30], [B.hold, 0.30], [B.slide, 0.26], [1, REST.legL[3]],
  ]);
  poseLegIK(bones, LK, lz, ly, lsp, e);
  // ...and the RIGHT one is the same solve with a different intent: it is a KNEE that lands, so the
  // thigh is handed far enough forward (a fifth of a radian of its own `z`) that the knee's cap
  // sits on the deck rather than in it, and the foot is then seated a little deeper than the plain
  // deck rule to keep the tucked sole down against it.
  const rz = kf(t, [
    [0, -0.20], [B.coil, -0.05], [0.18, -0.06], [B.turn, -0.14],
    [B.land, -0.12], [B.hold, -0.12], [B.slide, 0.04], [1, ANKLE_Z],
  ]);
  const ry = kf(t, [
    [0, ANKLE_Y - 0.58], [B.coil, -0.760], [0.18, -0.340], [B.turn, -0.470],
    [B.land, -0.346], [B.hold, -0.362], [B.slide, -0.330], [1, ANKLE_Y - REST.hip],
  ]);
  const rsp = kf(t, [
    [0, 0.26], [B.coil, 0.14], [0.18, 0.20], [B.turn, 0.16],
    [B.land, 0.16], [B.hold, 0.16], [B.slide, 0.14], [1, REST.legR[3]],
  ]);
  poseLegIK(bones, RK, rz, ry, rsp, e);
  // ---- the arms, one beat each: swung down and back off the deck, wrapped round the knees for the
  // whole twist (the arms are half of what reads a turn, and here they read the TUCK the twist is
  // spent in), and then the RIGHT one driven down onto the deck for the landing while the left
  // sweeps back off it as the counterweight — both held through the hold and trailing out over the
  // slide. `RK` is the character's own right (see `RK`) and it is the side the knee goes down on, so
  // it is the side the fist goes down with.
  //
  // The landing arm is a REACH, and the rig's arm is short: 0.607 from a shoulder that stands 0.40
  // over the hip means a trunk folded 60 degrees still leaves the fist a hand's width off the deck
  // (measured). So the fist is brought the last of the way by the game's own STRETCH channel (see
  // "Squash and stretch") — a few per cent on the limb, which is the same accent the chain's
  // throws already ask for and is the only thing in the rig that can lengthen a bone. It is asked
  // for on the landing beats and released with them; `poseStretch` eases it in and out on its own
  // clock, so the arm is back to its true length before the rise reaches `REST`.
  poseArmAngles(bones, RK,
    kf(t, [[0, 0.30], [B.coil, 0.95], [0.18, -1.60], [B.lock, -1.52],
      [B.land, -1.25], [B.hold, -1.22], [B.slide, -0.62], [1, REST.arm[0]]]),
    kf(t, [[0, 0.28], [B.coil, 0.60], [0.18, 0.30], [B.lock, 1.10],
      [B.land, 0.26], [B.hold, 0.24], [B.slide, 0.42], [1, REST.arm[1]]]),
    kf(t, [[0, -1.20], [B.coil, -0.40], [0.18, -2.40], [B.lock, -0.40],
      [B.land, -0.02], [B.hold, -0.06], [B.slide, -0.55], [1, REST.arm[2]]]),
    e, 0);
  poseStretchChain(bones, "arm", RK, kf(t, [
    [0, 1], [B.lock, 1], [B.land, 1.26], [B.hold, 1.26], [B.slide, 1.08], [0.96, 1], [1, 1],
  ]));
  poseArmAngles(bones, LK,
    kf(t, [[0, 0.30], [B.coil, 0.90], [0.18, -1.50], [B.lock, -1.44],
      [B.land, 0.74], [B.hold, 0.62], [B.slide, 0.28], [1, REST.arm[0]]]),
    kf(t, [[0, 0.28], [B.coil, 0.62], [0.18, 0.34], [B.lock, 1.15],
      [B.land, 0.54], [B.hold, 0.46], [B.slide, 0.62], [1, REST.arm[1]]]),
    kf(t, [[0, -1.20], [B.coil, -0.45], [0.18, -2.35], [B.lock, -0.35],
      [B.land, -1.30], [B.hold, -1.16], [B.slide, -1.05], [1, REST.arm[2]]]),
    e, 0);
  // The fist closes on the landing and comes open again over the slide, on the same beats as the
  // arm that makes it.
  poseGrip(bones, kf(t, [
    [0, 0.55], [B.lock, 0.55], [B.land, 1.00], [B.hold, 1.00], [B.slide, 0.70], [0.96, 0.55], [1, 0.30],
  ]), e);
}

// ---------------------------------------------------------------------------
// HURT — what the body on the RECEIVING end wears. Same rig, same keyed channels; the enemy
// manager (src/enemies.js) owns where it is and which way up it is, so these only have to
// draw the shape. Eight of them, and WHICH one a body wears is often settled by what it was
// already wearing: a reaction whose t=0 key is not the shape the last one finished on teleports
// its wearer for a frame, and `enemies.js` resets the pose clock every time it swaps which
// reaction a body is wearing (see `FALLEN`, `DOWNED` and `CLINCHED`).
//
//   fold    doubled over the knee, hands wrapped round the impact  (M1 #1)
//   clinch  hauled forward and DOWN by the head, arms hanging      (M1 #2)
//   trip    the legs taken out from under it, going over backwards (M1 #3, off its feet)
//   sweep   ...and the same on a body the chain is already holding (M1 #3, the usual case)
//   flight  thrown back through the air, limbs trailing            (M1 #4, off its feet)
//   launch  ...and the same from the DECK, scooped up off its back (M1 #4, the usual case)
//   down    on its back, loose;  getup  pushing itself up off it
//
// ---------------------------------------------------------------------------
// THE BEAT EVERY RECEIVED HIT IS CUT TO
//
// `kf` eases between its keys, which is right for a MOVE — a limb accelerates out of one pose
// and settles into the next — and wrong for an IMPACT in exactly one place: its slow START. A
// hit that eases out of the pose it is already in has been cushioned, and a hit cushioned at
// both ends reads as nothing happening, which is what these shapes used to be. So the received
// hits are authored on this beat instead, and `hitKf` puts the keys where it wants them:
//
//      flick ▶ SNAP ────── HOLD ──────▶ OUT ──▶ REST
//      rest     peak        peak         overshoot   rest
//
//   * the **flick** is the snap. Two thirds of the distance is covered in the first third of a
//     very short segment, so the part is KNOCKED onto the pose and then decelerates into it —
//     the spacing is fast, then slow, and never even.
//   * the **hold** is the beat that makes the hit land: nothing recovers while it lasts. It is
//     the one thing a hit needs that a move does not, and it is what the motion either side of
//     it reads against.
//   * the **out** overshoots REST by `over` (a share of the distance travelled) and then
//     settles, so the body rebounds past standing instead of easing into it like a puppet on
//     strings.
//
// `lag` shifts a part's whole curve later, which is the OVERLAP: nothing arrives on the same
// frame as anything else. The order is always the same — hips, then trunk, then the head (which
// WHIPS: it arrives last and leaves last), then the arms, then the legs — because a struck body
// is a chain of parts each being dragged by the one above it.
// ---------------------------------------------------------------------------
const HIT_SNAP = 0.085;   // the flick onto the pose ends here
const HIT_HOLD = 0.34;    // ...and the pose sits still until here
const HIT_OUT = 0.72;     // the rebound's overshoot lands here
const HIT_REST = 0.90;    // ...and the body is back at rest by here

// One channel of the beat above: `rest` → `peak`, snapped on at `HIT_SNAP + lag`, HELD to
// `HIT_HOLD + lag`, rebounding through an overshoot at `HIT_OUT + lag`, settled by
// `HIT_REST + lag`. `over` is the overshoot as a share of the distance travelled.
function hitKf(t, rest, peak, lag, over) {
  const a = HIT_SNAP + lag;
  const b = HIT_HOLD + lag;
  const c = HIT_OUT + lag;
  const d = HIT_REST + lag;
  const o = rest - (peak - rest) * (over === undefined ? 0.12 : over);
  return kf(t, [
    [0, rest],
    [a * 0.34, rest + (peak - rest) * 0.66],
    [a, peak],
    [b, peak],
    [c, o],
    [d, rest],
  ]);
}

// The same flick, but starting from a shape the body is already WEARING rather than from rest,
// for the reactions that are thrown at a body which is still in the previous one: the sweep
// takes the legs out of the shape the clinch left, the finisher scoops a body up off the deck.
// `from` is that shape's value for this channel; the keys are handed back so a channel can carry
// on past the arrival with a tail of its own.
function flickKeys(from, to, at) {
  return [[0, from], [at * 0.34, from + (to - from) * 0.66], [at, to]];
}

// ...and the same climb EASED instead of flicked: half the travel at half the arrival. For parts
// that are being DRAGGED rather than struck — the hips of a body pulled down by its head (which
// drag the whole leg chain with them, and a knee near full extension runs away from a fast hip
// drop: 44° of it in a single frame), and everything a finisher LIFTS off the deck.
function dragKeys(from, to, at) {
  return [[0, from], [at * 0.5, from + (to - from) * 0.5], [at, to]];
}

// The shape the body is in when nothing is happening to it: standing, arms down, weight on both
// feet, legs straight. `fold` and `clinch` spell these same numbers out inline — they are keyed
// by `hitKf`, whose `rest` argument IS this shape — but the angle-keyed reactions (the
// trip/sweep, the flight, the launch) take them from here, because for those the t=0 key is a
// HANDOVER rather than a recovery: `enemies.js` resets the pose clock when it changes which
// reaction a body wears, so a shape that does not start where the last one ended teleports its
// wearer. Both legs are the same shape (nothing about standing is asymmetric).
const REST = {
  hip: 1.00,
  hipsX: 0, hipsY: 0,
  torsoX: 0.05, torsoY: 0, torsoZ: 0,
  headX: 0,
  arm: [-0.35, 0.30, -1.30],          // upX, upZ, elbow
  legL: [0.02, 0.10, 0, 0.06],        // thigh, knee, sole, splay
  legR: [0.02, 0.10, 0, 0.06],
};

// The shape a body has the moment its BACK arrives on the deck, with the limbs still loose and
// still up because they have not caught up with the trunk. Three reactions have to MEET here:
// `trip` finishes its fall on it, `flight` comes down onto it, and `down` starts from it and
// does the settle. `enemies.js` switches `hurtKind` and resets the pose clock at those
// handovers, so the pose function the body wears changes underneath it — if the two do not
// agree on this shape, the body pops on the frame it lands.
// ...and the LIMBS are a TUCK, which is what the user's own reference for this shape is: a body
// thrown off its feet folds — the knees come up in front of the pelvis, the shins hang folded
// under them, the arms come in and forward with the elbows bent, and the two legs ride
// TOGETHER. The old table sprawled instead (arms out along the left-right axis, knees near
// straight, the legs split 0.17 apart and splayed 0.30/0.20 on top), and on the frames where the
// tumble brings the rig back through upright that sprawl read as a man RUNNING in mid-air — the
// user's own report, and the reason the legs below are authored as a near-symmetric pair. The
// two sides are still a whisker apart (0.11 of thigh, and 0.04 of splay) because two identical
// limbs read as one rigid part.
//
// The thighs are RAISED (thigh negative — see the measurement note under `DOWNED`): -1.05/-1.16
// puts the knees 0.34 u in front of the pelvis and 0.25 below it, with the shins folded back
// down under them at ~1.1 of flexion. Nothing about it is a sprawl, so a side lie's `poseLie`
// fold has less to do than it used to (see "THE LIE OVERLAY") — measured, the legs still need
// it, because the rig stands them 0.25 u apart across the pelvis.
const FALLEN = {
  hip: 0.30,
  hipsX: -0.34,
  hipsY: -0.18,                       // the twist it lands with, which unwinds over `down`
  torsoX: 0.06,
  headX: 0.46,
  arm: [-1.00, 0.20, -1.55],          // upX, upZ, elbow
  legL: [-1.35, 1.40, -0.22, 0.07],   // thigh, knee, sole, splay
  legR: [-1.46, 1.50, -0.16, 0.04],
};

// ...and the shape it has SETTLED into once everything hanging off the trunk has finished
// falling. This is `down`'s target and `getup`'s starting pose, and it is the same contract:
// those two meet here, exactly, or the body pops when it starts to get up. (The arms are pinned by
// the crouch and walk poses this has to hand back to — `getup` ends at rest, so its t=1 is not
// this table, but its t=0 is.)
//
// The LEGS are the one part of this table that was measured rather than authored, because a knee
// is the one joint whose angle is not where it puts the foot: `hipsX` rotates the whole leg chain
// with the pelvis, so a thigh angle that lies flat on the deck at one pelvis tilt stands straight
// up at another, and this table used to put both feet a metre in the air (a body on its back with
// its knees up, which is not what "settled" looks like). Solved against the deck instead: the
// pelvis tips 16° and the thighs carry the legs back down, so the left leg lies flat and splayed
// with its sole on the ground and the right one is drawn up a little — the asymmetry a body that
// fell over has, and the reason nothing in the settle lands on the same frame as anything else.
const DOWNED = {
  hip: 0.16,
  hipsX: -0.20,
  hipsY: 0,                           // the twist has unwound by here (see `down`)
  torsoX: 0.02,
  headX: 0.34,
  arm: [0.10, 0.85, -0.70],
  legL: [0.20, 0.12, -0.05, 0.34],
  legR: [-0.05, 0.70, -0.10, 0.18],
};

// ...and the shape it is wearing once the hands have owned its head for a moment. THREE reactions
// meet here: `clinch` arrives on it (the head is taken, the body is dragged over after it, and the
// whole beat in `poseHurtClinch` is keyed off this table), the FLIP — which this chain only ever
// throws at a body it is still holding by that head — leaves from it (`poseHurtFlip`'s t=0), and
// the SWEEP is kicked off it, so its first frame is this shape rather than the standing one (see
// `poseHurtSweep`). The legs are worn as ANGLES by all three, so they are the clinch's own IK
// solution divided back out of POSEX — `legIK` emits raw angles and `poseLegAngles` scales what it
// is given.
const CLINCH_LIFT = 0.12;
const CLINCH_HIP = 0.86;
const CLINCH_LEGS = (() => {
  const ik = legIK(ANKLE_Z - 0.14, ankleForSole(0.20) + CLINCH_LIFT - CLINCH_HIP);
  // The shin and the sole come straight back out of the solve. The THIGH has no sign of its own
  // here — `legIK` already returns it with the sign `poseLegAngles` puts straight onto the bone,
  // and negating it made the sweep's first frame stand the thigh up 54° before swinging it back
  // down.
  return [ik.thigh / POSEX, ik.knee / POSEX, -(ik.thigh + ik.knee) / POSEX, 0.30 / POSEX];
})();
// The shape a body is wearing while its head is owned: pulled down and FORWARD onto the rising
// knee — doubled over the attacker's hands, not folded flat and not parked at his waist.
//
// Every number here is SOLVED against the one contact that matters: the skull has to arrive
// exactly where the knee is going to be, because that is the beat the move is named for (the
// user's "is he sucking my dick or what ... make the knee and the head go toward each other").
// The target is the player's own raised knee at the top of his drive — measured at
// (1.46 up, 0.54 in front of his centre, 0.20 off his midline, the left leg's side) — and the
// whole shape was swept against it in the live page: the SKULL (the world centre of every mesh
// hanging off the head bone, not the bone's origin, which does not move when the neck turns) now
// lands 0.037 from the knee joint, i.e. the knee is IN the head. The knobs are three and they do
// different jobs: `torsoX` is how far over the trunk is dragged, `torsoZ` is the side bend that
// walks the skull across to meet a knee that comes up off the midline (a clinch knee is thrown up
// and across), and `torsoY` is the crank — the attacker has hold of the head and turns it.
// `hip` is dropped to `CLINCH_HIP`, which is the body being pulled down rather than choosing to
// bend, and the legs are `CLINCH_LEGS`, the same solve worn as angles by the sweep that follows.
//
// Note what is NOT here: the whole-rig PITCH (see `HURT_BODY.clinch` in enemies.js). The old shape
// reached this read by turning the entire body 0.42 rad about its own feet, which is why it read
// as a rotated enemy rather than an animated one.
// Where the victim's hands go while it is being held: UP, onto its own skull, prying at the two
// hands that have hold of it — a body whose head has been owned grabs back at whatever is holding
// it, and it is the one thing in this reaction that answers the attacker rather than trailing him.
//
// Authored as angles against `REST.arm`, and the station is MEASURED in the live page against the
// attacker's own grip: his hands land on this rig's head bone (the CLINCH's two-hands solve, the
// other side of the same contact), so the victim's hands are sent to the same place from its own
// side — measured, they come up to 1.40-1.44 with the elbows folded and the two of them a third of
// a body apart, i.e. on the skull just under the attacker's palms. (Reaching for his FOREARMS
// instead was tried and is not representable: the haul leaves his forearms at the victim's own
// shoulder height, inside the arm's reach shell, so no fold of the elbow can put a hand there.)
const CLINCH_HAND = { x: -2.30, z: -0.60, elbow: -2.00 };

const CLINCHED = {
  hip: CLINCH_HIP,
  hipsX: 0, hipsY: 0.06,
  torsoX: 0.58, torsoY: 0.24, torsoZ: -0.30,
  headX: 0.34,
  // The arms are the hands of the HOLD, and they are written as `CLINCH_HAND` rather than as
  // numbers of their own because THIS TABLE IS A HANDOVER CONTRACT: `poseHurtSweep` and
  // `poseHurtFlip` both start from it, and the frame either of them starts on is the frame the
  // clinch's own last frame produced. If the two disagree the arms snap on the switch (they hung
  // at `[0.10, 0.50, −0.62]` while the clinch's were up on the skull — a ~90° jump at every
  // clinch→sweep handover).
  arm: [CLINCH_HAND.x, CLINCH_HAND.z, CLINCH_HAND.elbow],
  legL: CLINCH_LEGS,
  legR: CLINCH_LEGS,
};

// The beats of the clinch reaction, in the pose's own clock (u over the stun) — shared with
// `enemies.js`, which needs the same `hold` number to know when the HAUL stops holding and starts
// shoving the body off the knee (see `E.GRAB_OFF_*`). Exported on `poseCfg` as `CLINCH_BEAT` so
// the two files cannot drift apart.
const CLINCH_BEAT = { take: 0.10, in: 0.24, knee: 0.32, hold: 0.52, off: 0.78 };
const CLINCH_TAKE = CLINCH_BEAT.take;   // the head is taken and walked down
const CLINCH_IN = CLINCH_BEAT.in;       // the trunk and the hips have been dragged in after it
const CLINCH_KNEE = CLINCH_BEAT.knee;   // the knee drives in — the impact the move exists for
const CLINCH_HOLD = CLINCH_BEAT.hold;   // the head is owned until here
const CLINCH_OFF = CLINCH_BEAT.off;     // thrown off the knee, back on its own feet by 1

// The clinch's own shape, and the reason it is not just `fold` again: `fold` is a body that
// CURLS UP around an impact under its own power, and a body whose head has been seized and walked
// down onto a knee is the opposite of that — it is being pulled, so it is trailing, not bracing.
//
// This is the one reaction the game runs over its whole STUN (0.75 s) rather than over a couple of
// frames, so it is the one that gets a full BEAT rather than an arrival: the head is TAKEN, the
// body is doubled over after it, the knee drives in, the head is OWNED for a moment, and then the
// attacker lets go and the body is thrown off and staggers back onto its own feet. Every channel
// below is keyed on those beats, and every channel ENDS on the standing shape — which is what the
// state's last frame has to hand to the idle, and what stops the old shape's worst tell: a body
// held bent double long after the knee had left it, standing there in front of an idle attacker
// (the user's "is he sucking my dick or what" was partly this pose and partly where it was aimed).
function poseHurtClinch(bones, t, e) {
  // A channel's own path through the beat: nothing at the start, the held value through the
  // middle, thrown past neutral on the release, and back on the standing shape by the end. `w` is
  // the part's LAG — the head leads because the head is what was taken, the trunk is dragged over
  // behind it, and the hips (which carry the whole leg chain) are hauled down last.
  const held = (w, over) => kf(t, [
    [0, 0],
    [CLINCH_TAKE + w, 1],
    [CLINCH_IN + w, 1],
    [CLINCH_KNEE + w, 1.07],           // the knee is driven INTO the body
    [CLINCH_KNEE + 0.10 + w, 1],
    [CLINCH_HOLD + w, 1],
    [CLINCH_OFF + w, over],            // ...and the body is thrown off it
    [0.93, 0.02],
    [1, 0],
  ]);
  const lead = (a, b, k) => a + (b - a) * k;
  const wh = held(0, -0.05);      // the head: taken first
  const wt = held(0.02, -0.06);   // the trunk, dragged over after it
  const wp = held(0.07, -0.03);   // the hips, hauled down last

  poseHipY(bones, lead(REST.hip, CLINCHED.hip, wp), e);
  poseRot(bones, "hips", "x", lead(REST.hipsX, CLINCHED.hipsX, wp), e);
  poseRot(bones, "hips", "y", lead(REST.hipsY, CLINCHED.hipsY, wp), e);
  poseRot(bones, "hips", "z", 0, e);
  poseRot(bones, "torso", "x", lead(REST.torsoX, CLINCHED.torsoX, wt), e);
  poseRot(bones, "torso", "y", lead(REST.torsoY, CLINCHED.torsoY, wt), e);
  poseRot(bones, "torso", "z", lead(REST.torsoZ, CLINCHED.torsoZ, wt), e);
  poseSettleTorso(bones, e);
  // The head, and the one part of the HOLD that keeps moving: the attacker has it by both hands
  // and works it, so it shakes until he lets go. It is the difference between a body being held
  // and a body that has been posed — and it is faded in and out against the beat, because a shake
  // that starts before the grab or outlives it is a vibration, not a struggle.
  const shake = Math.sin(t * 30) * 0.075 *
    Math.min(1, Math.max(0, (t - CLINCH_TAKE) / 0.07)) *
    Math.min(1, Math.max(0, (CLINCH_HOLD - t) / 0.10));
  poseRot(bones, "head", "x", lead(REST.headX, CLINCHED.headX, wh) + shake, e);
  poseRot(bones, "head", "y", shake * 1.6, e);
  poseRot(bones, "head", "z", shake * 0.6, e);
  // The legs give LAST and are the far end of the chain: the stance goes back on its heels as the
  // body is doubled over. Worn as ANGLES — the same `CLINCH_LEGS` the sweep above starts from (see
  // `CLINCHED`), so the two agree by construction rather than by a second solve.
  for (const side of [LK, RK]) {
    const G = side < 0 ? CLINCHED.legR : CLINCHED.legL;
    const R = side < 0 ? REST.legR : REST.legL;
    poseLegAngles(bones, side,
      lead(R[0], G[0], wp), lead(R[1], G[1], wp), lead(R[2], G[2], wp), lead(R[3], G[3], wp), e);
  }
  // The hands: knocked out of the way by the grab, then UP onto the two arms that are holding this
  // head — a body whose head is owned grabs back at whatever is holding it (see `CLINCH_HAND`,
  // whose station is measured against the attacker's own forearms). Held tight through the knee,
  // and flung off with the release.
  const take = kf(t, [
    [0, 0],
    [0.08, -0.5],
    [0.18, 0.45],
    [CLINCH_KNEE, 1],
    [CLINCH_HOLD, 1],
    [CLINCH_HOLD + 0.07, 0.25],
    [0.80, -0.45],
    [0.94, 0],
    [1, 0],
  ]);
  for (const side of [LK, RK]) poseArmAngles(bones, side,
    lead(REST.arm[0], CLINCH_HAND.x, take),
    lead(REST.arm[1], CLINCH_HAND.z, take),
    lead(REST.arm[2], CLINCH_HAND.elbow, take), e, 0);
  // ...and the fists close the instant the hands land, which is the one channel that says "held"
  // rather than "touched".
  poseGrip(bones, Math.max(0, Math.min(1, take)), e);
}

// The shape a body wears while the WHIRL has it by the throat and is carrying it on the move's own
// orbit (see `player.whirlGrab`, `updateWhirl` and the `carryOrbit` it writes) — the user's own
// enemy-side stage 2: "entire body is pulled low to the ground ... arms flail or hang loosely ...
// legs drag behind, knees bent, feet scraping the ground ... torso twists with the spin".
//
// Second pass at it, and the difference is WHERE THE BODY IS rather than what the limbs are doing:
// the move holds the body ON THE DECK and turns it over under the player's boots (`WHIRL_TOP_LAY` —
// the body is laid flat out from its own root, face-down for the haul and face-up for the beyblade),
// and a body held flat off a hand that has it by the neck is a body HANGING OFF THAT HAND: a straight
// line from the neck (the trunk's own angle is the ORBIT's — `lay` — not a torso bend, so `torsoX` is
// deliberately near zero) with everything below it dangling. The arms hang in the frame's own +Z,
// which with the rig laid out face-DOWN is the way the DECK is — so the arms "hanging" are `upX`
// driven forward, and the legs dangle the same way with a slack knee.
//
// It is still a shape of its own rather than the clinch again, and that is a fix, not a flourish:
// the clinch is a BEAT — head taken, trunk hauled over, KNEE DRIVEN IN at `CLINCH_KNEE` — and the
// whirl runs the hold for two seconds, so a body whirled in the clinch's shape was getting
// kneed halfway round the floor.
//
// Four shapes and four weights, and the weights are what make it a single continuous haul:
// `skim` holds the DRAG ALONG THE DECK through the move's HAUL (`P.WHIRL_SCRAPE_T` — the beat the
// user asked for between the grab and the spin), `dragW` holds the general hold through the spin
// (the body it wears there is limp and trailing — it is the ORBIT that has ROLLED it face-up and
// pinned it under the player's boots, not the pose), `lift` swaps to the HOIST as the man stands up
// under it, and `coil` swaps to the COIL as it is driven over. All of them are zero at t = 0.12, so the pose OPENS on `REST` — which is exactly where the
// clinch's own `t = 0` is — and the handover when `player.whirlGrab` switches the kind costs
// nothing.
//
// `hip` is the SAME in all four, and that is the one thing the second pass had to fix (measured):
// the placement puts the body at a keyed height and holds it by the HEAD, and `poseHipY` moves the
// whole rig inside the pivot — so a `hip` that changed between the shapes bought a lift the orbit
// had not asked for and walked the head 0.7 u out of the player's reach halfway through the slam.
// With it constant, the pose only ever says what the body is DOING, and where the body IS belongs
// wholly to the orbit (`player.whirlHoldKeys`). The HAUL is the one exception, and it is a
// deliberate one: the body is on the DECK for that beat, and the only way the head gets down to
// the hand with the rest of the body lying flat is for the whole shape to sit lower inside the
// pivot (`SKIM_SHAPE.hip`) — measured, and read back off the head's own height on the pavement.
const DRAG_SHAPE = {
  hip: 0.99,
  hipsX: 0.10, hipsY: 0.10,
  torsoX: 0.04, torsoY: 0.18, torsoZ: -0.16,
  headX: -0.18,
  arm: [-1.44, 0.22, -0.36],       // hanging off the laid-out body, slack
  leg: [-0.48, 0.44, 0.26, 0.12],  // dangling, a slack knee
};
const SKIM_SHAPE = {
  // The HAUL's own shape, and it is the odd one out on purpose: the body is being dragged along
  // the DECK, so it is not hanging off the hand — it is LYING on the pavement, and the whole of
  // this table is what "lying" costs on a rig whose rest pose is standing.
  //
  // The rig's own angle does most of it (`WHIRL_SKIM_LAY`, a quarter turn in the orbit), and that
  // leaves exactly one thing for the pose: THE TRUNK HAS TO BE STRAIGHT. The first pass had it
  // doubled over its own waist (`torsoX` 1.50) — which reads as a body folded in half being
  // carried, and measured, that is what it was: the rig turned flat and the torso folded back up
  // out of it, so the hips rode 0.9 off the deck with the head hanging under them. Flat is
  // `torsoX` 0, and with it the whole body sits 0.2-0.4 up — on the floor, head first.
  //
  // `hip` is the one key the four shapes do NOT share (see the note above): the others are held
  // clear of the deck by the hand, this one is lying on it, so its whole rig sits lower inside the
  // pivot. `headX` is the neck being pulled — a head dragged by the skull always lifts its chin.
  // The limbs are the read: the arms are dragged along the deck UNDER the chest (upX near zero
  // lays them down the body rather than into the floor, which otherwise holds the whole body a
  // hand's width off the deck — measured), and the legs trail limp with a slack knee and the feet
  // skidding out behind.
  hip: 0.99,
  hipsX: 0.06, hipsY: 0.06,
  torsoX: 0.0, torsoY: 0.10, torsoZ: -0.12,
  headX: -0.15,                    // the chin comes up: a neck being pulled always lifts the head
  arm: [0.25, 0.80, -0.50],        // dragging on the deck under the chest
  leg: [-0.05, 0.12, 0.05, 0.12],  // limp, a slack knee, the feet skidding out behind
};
const HOIST_SHAPE = {
  hip: 0.99,
  hipsX: 0.10, hipsY: 0.06,
  torsoX: -0.12, torsoY: 0.10, torsoZ: -0.10,
  headX: 0.32,
  arm: [-1.34, 0.28, -1.62],       // reaching up for the arms that have it
  leg: [-0.34, 0.62, 0.24, 0.20],  // dangling
};
const COIL_SHAPE = {
  hip: 0.99,
  hipsX: -0.10, hipsY: 0.14,
  torsoX: 0.58, torsoY: 0.16, torsoZ: -0.16,
  headX: 0.52,
  arm: [-0.62, 0.34, -1.86],       // pulled in
  leg: [-0.92, 1.70, 0.20, 0.30],  // curled up under the coming drive
};

function poseHurtWhirlDrag(bones, t, e) {
  // The SKIM hands over to the FLING a beat BEFORE the spin starts rather than at the same moment:
  // measured, a body still wearing the flat dragging shape while the orbit has already lifted it
  // is a body held out like a board (`vph` 0.34 — the spin's own first frame — is where the skim
  // used to still be at full weight), and the swap costs nothing because the lift and the shape
  // are read off the same clock.
  const skim = kf(t, [[0.12, 0], [0.21, 1], [0.31, 1], [0.39, 0]]);
  const dragW = kf(t, [[0.31, 0], [0.39, 1], [0.58, 1], [0.72, 0]]);
  const lift = kf(t, [[0.12, 0], [0.58, 0], [0.72, 1], [0.85, 0]]);
  const coil = kf(t, [[0.12, 0], [0.58, 0], [0.72, 0], [0.85, 1], [1, 1]]);
  const pick = (rest, s, a, b, c) => rest + (s - rest) * skim + (a - rest) * dragW
    + (b - rest) * lift + (c - rest) * coil;
  // ...and the one thing that keeps it alive through the haul: the swing of a body being spun
  // round the floor. Windowed, so it is silent at the handover, through the hoist and at the coil.
  const swing = Math.sin(t * 19) *
    Math.min(1, Math.max(0, (t - 0.14) / 0.16)) * Math.min(1, Math.max(0, (0.62 - t) / 0.14));

  poseHipY(bones, pick(REST.hip, SKIM_SHAPE.hip, DRAG_SHAPE.hip, HOIST_SHAPE.hip, COIL_SHAPE.hip), e);
  poseRot(bones, "hips", "x", pick(REST.hipsX, SKIM_SHAPE.hipsX, DRAG_SHAPE.hipsX, HOIST_SHAPE.hipsX, COIL_SHAPE.hipsX), e);
  poseRot(bones, "hips", "y", pick(REST.hipsY, SKIM_SHAPE.hipsY, DRAG_SHAPE.hipsY, HOIST_SHAPE.hipsY, COIL_SHAPE.hipsY) + swing * 0.10, e);
  poseRot(bones, "hips", "z", 0, e);
  poseRot(bones, "torso", "x", pick(REST.torsoX, SKIM_SHAPE.torsoX, DRAG_SHAPE.torsoX, HOIST_SHAPE.torsoX, COIL_SHAPE.torsoX), e);
  poseRot(bones, "torso", "y", pick(REST.torsoY, SKIM_SHAPE.torsoY, DRAG_SHAPE.torsoY, HOIST_SHAPE.torsoY, COIL_SHAPE.torsoY) + swing * 0.26, e);
  poseRot(bones, "torso", "z", pick(REST.torsoZ, SKIM_SHAPE.torsoZ, DRAG_SHAPE.torsoZ, HOIST_SHAPE.torsoZ, COIL_SHAPE.torsoZ), e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", pick(REST.headX, SKIM_SHAPE.headX, DRAG_SHAPE.headX, HOIST_SHAPE.headX, COIL_SHAPE.headX), e);
  poseRot(bones, "head", "y", swing * 0.34, e);
  poseRot(bones, "head", "z", swing * 0.12, e);
  // The limbs: dragging underneath and skidding behind while the body is hauled along the deck,
  // hanging and swinging off it through the fling, reaching for the arms that hold it as it comes
  // up, and pulled in tight for the drive.
  for (const side of [LK, RK]) {
    const A = side < 0 ? REST.legR : REST.legL;
    const S = SKIM_SHAPE.leg, D = DRAG_SHAPE.leg, H = HOIST_SHAPE.leg, C = COIL_SHAPE.leg;
    const fl = swing * (side < 0 ? 1 : -1);
    poseLegAngles(bones, side,
      pick(A[0], S[0], D[0], H[0], C[0]) - fl * 0.22,
      pick(A[1], S[1], D[1], H[1], C[1]) + fl * 0.26,
      pick(A[2], S[2], D[2], H[2], C[2]),
      pick(A[3], S[3], D[3], H[3], C[3]), e);
    const RA = REST.arm, SA = SKIM_SHAPE.arm, DA = DRAG_SHAPE.arm, HA = HOIST_SHAPE.arm, CA = COIL_SHAPE.arm;
    poseArmAngles(bones, side,
      pick(RA[0], SA[0], DA[0], HA[0], CA[0]) - fl * 0.20,
      pick(RA[1], SA[1], DA[1], HA[1], CA[1]) + fl * 0.30,
      pick(RA[2], SA[2], DA[2], HA[2], CA[2]) + fl * 0.24, e, 0);
  }
  // Limp at the start of the haul and shut tight by the time it is being driven down: the one
  // channel that says "dragged" rather than "posed".
  poseGrip(bones, kf(t, [[0.12, 0.20], [0.30, 0.10], [0.62, 0.12], [0.85, 0.85], [1, 0.85]]), e);
}

// ---------------------------------------------------------------------------
// THE CLINCH ROLL (see the running lunge in player.js: `lungeTakeNow` / `lungeHoldBody`). The body
// the pounce took is held and rolled — and it is PLACED by the move rather than driven by its own
// physics, so the whole of its shape is here.
//
// It is DRAPED over the carrier, not curled into its own ball: the roll pins the held body's
// origin onto the carrier's own (x, y and z — all three) with both rigs turning on the same
// pivot, so a second tuck in the same spot would sit INSIDE the carrier. Instead the trunk
// arches BACK over the ball it is riding, the head is thrown, one arm stays hooked around the
// carrier while the other beats loose, and the trailing legs kick. `t` is the roll's own progress
// (the move hands it over as `carryOrbit.ph`): it slams the body onto the hold over the first
// quarter, then lets it fight all the way over.
// ---------------------------------------------------------------------------
function poseHurtClinchRoll(bones, t, e) {
  const settle = kf(t, [[0, 0.15], [0.25, 1], [1, 1]]);
  const thrash = kf(t, [[0, 0], [0.20, 0.25], [0.45, 1], [0.85, 1], [1, 0.6]]);
  const kickR = Math.sin(t * 21.0) * 0.30 * thrash;
  const kickL = Math.sin(t * 21.0 + 2.4) * 0.30 * thrash;
  const flail = (Math.sin(t * 26.0) * 0.5 + Math.sin(t * 13.7) * 0.5) * thrash;
  const whip = Math.sin(t * 15.0) * 0.14 * thrash;
  poseHipY(bones, HIP_Y + 0.05 * settle, e);
  poseRot(bones, "hips", "x", 0.18 * settle, e);
  poseRot(bones, "hips", "y", whip * 0.6, e);
  poseRot(bones, "hips", "z", 0.06 * settle, e);
  poseRot(bones, "torso", "x", -0.62 * settle + 0.10 * flail, e);
  poseRot(bones, "torso", "y", -0.12 * settle + whip, e);
  poseRot(bones, "torso", "z", 0.10 * settle + whip * 0.5, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", -0.50 * settle + 0.12 * flail, e);
  poseRot(bones, "head", "y", whip * 1.8, e);
  poseRot(bones, "head", "z", whip * 0.7, e);
  poseLegAngles(bones, RK, (0.55 + kickR) * settle, (1.15 - 0.75 * Math.abs(kickR)) * settle, 0.30 * settle, LUNGE.tuckSplay, e);
  poseLegAngles(bones, LK, (0.62 + kickL) * settle, (1.25 - 0.75 * Math.abs(kickL)) * settle, 0.36 * settle, LUNGE.tuckSplay + 0.05, e);
  poseArmAngles(bones, LK, -0.55 * settle, 0.15 * settle, -2.30 * settle, e, 0);
  const loose = Math.max(0, flail);
  poseArmAngles(bones, RK, (-0.55 - 0.55 * loose - 0.25 * thrash) * settle,
    (0.15 + 0.45 * loose) * settle, (-2.30 + 1.00 * loose + 0.30 * thrash) * settle, e, 0);
  poseGrip(bones, 0.9 * settle, e);
}

function poseHurtFold(bones, t, e) {
  // The beat in full, and every part on its own lag — which is the whole read of the move. The
  // hips give first (lag 0), the trunk curls round the impact right behind them, and the head
  // arrives LAST (lag 0.06) and leaves last, with a 40% overshoot: the chin comes back UP past
  // neutral on the rebound. That whiplash is the difference between "punched" and "leaning
  // forward", and the fold curls very slightly to one side because a body struck from the front
  // never folds perfectly down its own middle.
  const hip = hitKf(t, 1.00, 0.79, 0);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", 0, e);
  poseRot(bones, "hips", "y", hitKf(t, 0, 0.14, 0.03, 0.20), e);
  poseRot(bones, "hips", "z", hitKf(t, 0, -0.07, 0.03), e);
  poseRot(bones, "torso", "x", hitKf(t, 0.05, 1.02, 0.015), e);
  poseRot(bones, "torso", "y", hitKf(t, 0, -0.10, 0.02), e);
  poseRot(bones, "torso", "z", hitKf(t, 0, 0.17, 0.02), e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", hitKf(t, 0, 0.66, 0.06, 0.40), e);
  poseRot(bones, "head", "y", hitKf(t, 0, -0.13, 0.065), e);
  poseRot(bones, "head", "z", hitKf(t, 0, 0.11, 0.065), e);
  // The knees buckle and the feet skid out, a beat behind the hips.
  const legY = hitKf(t, 0, 0.32, 0.03);
  for (const side of [LK, RK]) poseLegIK(bones, side, ANKLE_Z + legY, ankleForSole(0) - hip, 0.26, e);
  // The arms come in around the stomach — the one shape everyone recognises — and they arrive
  // after the trunk has already folded, so they read as being thrown there by the impact rather
  // than as part of the decision.
  for (const side of [LK, RK]) poseArmAngles(bones, side,
    hitKf(t, -0.35, -0.98, 0.05),
    hitKf(t, 0.30, 0.20, 0.05),
    hitKf(t, -1.30, -2.42, 0.05, 0.25), e, 0);
  poseGrip(bones, 0.72, e);
}

// ---------------------------------------------------------------------------
// THE CHEST HOLD — a body the right-click has by the STERNUM (see "THE RIGHT-CLICK GRAB" in
// player.js, `poseGrabThrow`, and `player.grabPoint`). It is the third shape that exists only
// because the clinch's own did not fit, the whirl's `poseHurtWhirlDrag` being the second: the
// clinch is a body held by the HEAD — doubled over it, with a knee coming up — and this is a body
// held by the FRONT OF THE CHEST and hauled, which is a different animal entirely.
//
// What it is: on its TOES, hips driven forward into the grip, trunk tipped back over them with the
// chest thrust out, head snapped back off the top of that, and both of his own hands coming up to
// the wrists that own him. That backward tip is the important half. The shape this replaced was
// the gut-punch fold, which bends the trunk TOWARD whoever is holding it — and with two chunky
// low-poly bodies a body folded into the man hauling it disappears INSIDE him (measured in the
// harness: the two heads ended up in one another). A body pulled off its front foot tips the other
// way, and the head stays clear.
//
// It is a HAUL, not a beat: the shape arrives in the first fifth and then rides the hold, swaying —
// because it is worn for as long as the move is (the coil AND the heave), and one that snapped into
// a pose and froze there would read as a mannequin being carried.
function poseHurtChestHold(bones, t, e) {
  const pull = kf(t, [[0, 0], [0.09, 0.60], [0.22, 1.0], [0.60, 0.98], [0.80, 0.90], [1, 0.84]]);
  // ...and the struggle: a slow sway that starts once the grip is closed, because a held body that
  // is perfectly still is a body that has given up.
  const sway = Math.sin(t * 9.4) * 0.05 * Math.min(1, Math.max(0, (t - 0.12) / 0.14));
  // UP onto the toes (a small rise — the whole body is being taken off its base) and the pelvis
  // tipped back under it.
  const hip = HIP_Y + 0.05 * pull;
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", -0.26 * pull, e);
  poseRot(bones, "hips", "y", sway * 0.7, e);
  poseRot(bones, "hips", "z", 0, e);
  poseRot(bones, "torso", "x", -0.36 * pull + sway, e);
  poseRot(bones, "torso", "y", -sway * 1.5, e);
  poseRot(bones, "torso", "z", sway * 0.5, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", -0.26 * pull - sway * 1.8, e);
  poseRot(bones, "head", "y", sway * 2.4, e);
  poseRot(bones, "head", "z", sway * 1.6, e);
  // The legs are ANGLED rather than solved: the feet are not bearing weight (they are being
  // dragged), so there is no deck contact to solve them onto. Both knees come up and the heels
  // go with them — he is being taken off the floor at the front edge — with the two sides a
  // whisker apart so the pair does not read as one rigid part.
  poseLegAngles(bones, RK, 0.30 * pull, 0.50 * pull, -0.34 * pull, 0.16, e);
  poseLegAngles(bones, LK, 0.42 * pull, 0.66 * pull, -0.46 * pull, 0.22, e);
  // ...and HIS OWN hands come up onto the wrists holding him: the one channel that says "held, and
  // fighting it" rather than "carried".
  const grip = kf(t, [[0, 0], [0.10, 0.35], [0.26, 1.0], [0.62, 0.96], [0.84, 0.60], [1, 0.34]]);
  for (const side of [LK, RK]) {
    poseArmAngles(bones, side,
      -0.35 + 0.58 * grip,
      0.30 - 0.04 * grip,
      -1.30 - 0.62 * grip, e, 0);
  }
  poseGrip(bones, 0.5 + 0.4 * grip, e);
}

// ---------------------------------------------------------------------------
// THE ANKLE HOLD — a body the right-click has by the SHIN, out of the air (see `player.updateGrabSlam`
// and `poseGrabSlam`). It is a body being pulled DOWN by one leg: the leg it is held by comes up
// straight toward the grip, the trunk crunches over it, the head comes up off the chest to look at
// whatever has hold of it, and the free leg and both hands trail and grab.
//
// Nothing here is solved onto a deck, because there is no deck: this is the one shape in the game
// that is worn entirely in the air and entirely by AUTHORED angles (the body it belongs to is being
// hauled by one limb, so no foot has a contact to solve against).
function poseHurtAnkleHold(bones, t, e) {
  const pull = kf(t, [[0, 0], [0.10, 0.65], [0.26, 1.0], [0.70, 1.0], [1, 0.94]]);
  const flail = Math.sin(t * 14.0) * 0.16 * Math.min(1, Math.max(0, (t - 0.10) / 0.12));
  const swing = Math.sin(t * 7.0) * 0.10 * Math.min(1, Math.max(0, (t - 0.10) / 0.12));
  poseHipY(bones, HIP_Y - 0.08 * pull, e);
  poseRot(bones, "hips", "x", 0.34 * pull + flail * 0.4, e);
  poseRot(bones, "hips", "y", flail * 0.5, e);
  poseRot(bones, "hips", "z", swing, e);
  poseRot(bones, "torso", "x", 0.85 * pull + flail * 0.5, e);
  poseRot(bones, "torso", "y", -flail * 1.2, e);
  poseRot(bones, "torso", "z", swing * 1.4, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", -0.70 * pull - flail * 1.2, e);
  poseRot(bones, "head", "y", -flail * 2.0, e);
  poseRot(bones, "head", "z", swing * 2.0, e);
  poseLegAngles(bones, RK, -1.15 * pull + flail * 0.3, 0.14 * pull, -0.12 * pull, 0.05, e);
  poseLegAngles(bones, LK, 0.55 * pull + flail * 0.4, 1.25 * pull, -0.30 * pull, 0.14, e);
  for (const side of [LK, RK]) {
    poseArmAngles(bones, side,
      -1.50 * pull + flail * 0.8,
      0.28 - 0.06 * pull,
      -0.38 - 0.12 * pull, e, 0);
  }
  poseGrip(bones, 0.6 + 0.4 * pull, e);
}

// The fall, shared by the two ways the sweep can land: `poseHurtTrip` when the legs are taken out
// from under a body that is still on its feet, and `poseHurtSweep` when they are taken out from
// under one this chain is already holding by the head. They differ only in the shape the sweep
// LEAVES and in how long the kick takes to arrive; the fall from there on is authored once.
//
// A fall is not a beat you can hold — it keeps going — but the SWEEP is a strike, so the legs get
// the kick at the front and then everything above them is dragged: the hips keep dropping for the
// whole of `t`, the trunk goes over behind them, and the head is the LAST thing to arrive,
// because a body going over backwards falls out from under its own head. It finishes exactly ON
// `FALLEN` (see above), which is the shape `down` starts from — so the handover is invisible
// instead of the body snapping upright and falling over a second time.
//
// `G` is the shape being left, and `at` how far into `t` the kick lands. The knee is the one
// channel that eases rather than flicking: it has further to come than anything else on the body.
function poseHurtFall(bones, t, e, G, at) {
  const hip = kf(t, [[0, G.hip], [at * 1.4, G.hip - 0.14], [0.36, 0.58], [0.68, 0.36], [1, FALLEN.hip]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", kf(t, [[0, G.hipsX], [0.14, -0.16], [0.5, -0.30], [0.8, -0.36], [1, FALLEN.hipsX]]), e);
  poseRot(bones, "hips", "y", kf(t, [[0, G.hipsY], [0.3, -0.26], [0.7, -0.24], [1, FALLEN.hipsY]]), e);
  poseRot(bones, "hips", "z", 0, e);
  poseRot(bones, "torso", "x", kf(t, [[0, G.torsoX], [at * 1.4, -0.10], [0.44, -0.30], [0.74, -0.06], [1, FALLEN.torsoX]]), e);
  poseRot(bones, "torso", "y", kf(t, [[0, G.torsoY], [0.4, 0.22], [1, 0.10]]), e);
  poseRot(bones, "torso", "z", kf(t, [[0, G.torsoZ], [0.5, 0.10], [1, 0.06]]), e);
  poseSettleTorso(bones, e);
  // The head hangs where it was for the first beat — the deck comes up to meet it — and only then
  // whips down, a good 0.1 of t behind the trunk: later still on the sweep, which has further to
  // come before it gets there.
  poseRot(bones, "head", "x", kf(t, [[0, G.headX], [at * 1.6, 0.12], [0.36, 0.34], [0.68, 0.56], [1, FALLEN.headX]]), e);
  poseRot(bones, "head", "y", kf(t, [[0, 0], [0.4, 0.12], [1, 0.08]]), e);
  poseRot(bones, "head", "z", 0, e);
  // The legs take the kick — the thigh is KNOCKED out, and the sole whips with it — and then stay
  // UP, which is the whole read of a sweep: a body with its legs still in the air under it.
  for (const side of [LK, RK]) {
    const F = side < 0 ? FALLEN.legR : FALLEN.legL;
    const L = side < 0 ? G.legR : G.legL;
    poseLegAngles(bones, side,
      kf(t, [...flickKeys(L[0], -1.16, at), [0.36, -1.40], [0.72, -1.22], [1, F[0]]]),
      kf(t, [[0, L[1]], [at * 1.1, 0.42], [0.40, 0.68], [0.75, 0.92], [1, F[1]]]),
      kf(t, [...flickKeys(L[2], -0.52, at), [1, F[2]]]),
      kf(t, [[0, L[3]], [1, F[3]]]), e);
  }
  // The arms FLING — out and back for balance — and they are the last thing to arrive, because
  // nothing is driving them.
  for (const side of [LK, RK]) poseArmAngles(bones, side,
    kf(t, [[0, G.arm[0]], [at, -0.62], [0.34, -1.05], [1, FALLEN.arm[0]]]),
    kf(t, [[0, G.arm[1]], [0.34, 0.78], [1, FALLEN.arm[1]]]),
    kf(t, [[0, G.arm[2]], [0.34, -1.05], [1, FALLEN.arm[2]]]), e, 0);
  poseGrip(bones, 0.25, e);
}

// A body caught on its feet: the sweep comes out of nowhere and it goes over backwards.
function poseHurtTrip(bones, t, e) {
  poseHurtFall(bones, t, e, REST, 0.09);
}

// ...and a body the chain is already holding by the head, which is the case the four moves are
// actually built around: the player's 2nd M1 is the clinch and the 3rd is this, so the shape the
// sweep leaves is `CLINCHED`, not standing. The kick is spread over twice as much t as well,
// because it has twice as far to come — hanging bent knees to legs flung up in front of the body,
// which is more travel than the rest of the fall put together.
function poseHurtSweep(bones, t, e) {
  poseHurtFall(bones, t, e, CLINCHED, 0.16);
}

// Thrown back through the air. The shape is authored as a LAUNCH into a TUCK: the body is thrown
// off its feet, its arms come up and in FORWARD with the elbows folding, its knees come up in front
// of it and the whole thing curls — because a limp body thrown loose does not sprawl, it folds, and
// because that is the shape the user's own reference for this move is (see `FALLEN`). `spin` is the
// ragdoll's tumble angle — the finisher hands the body a real end-over-end spin (see `E.TUMBLE_*`
// in enemies.js) and this shape rides it, so the limbs SWING rather than holding one silhouette for
// the whole flip. Both SIDES of each pair swing TOGETHER, a beat behind the trunk (a limb hanging
// off a turning body is a pendulum, not a paddle — see `lag`), and because every offset is a `sin`
// of the spin it is exactly zero when there is no tumble, which keeps every other `flight` — a
// sweep that catches a body off its feet — byte-identical.
//
// `G` is the shape the body is LEAVING and `lift` how it gets onto the launch pose. Both default
// to what a body knocked off its feet has always used — `REST`, flicked on — and `poseHurtLaunch`
// passes the other pair (a body scooped off the DECK, eased on). `a` is the part of `t` the
// launch pose arrives in: on the finisher's own clock (see `E.LAUNCH_T`) that is four or five
// frames, which is what turns the raise of the hips from a teleport into a lift.
function poseHurtFlight(bones, t, e, spin, G, lift) {
  const s = spin || 0;
  // How much of the swing to believe. Every offset below is a `sin` of the spin, so it is exactly
  // zero when there is no tumble — which keeps every other `flight` (a sweep that catches a body
  // off its feet, a launch off the deck) byte-identical to what it always was. `sw` is what lets
  // the swing be BIG for a body that is really tumbling without changing those at all: it is the
  // spin's own magnitude, ramped in over the first couple of radians.
  const sw = Math.min(1, Math.abs(s) / 2.5);
  const swing = Math.sin(s) * sw;             // the trunk's own small wobble on the turn
  const swing2 = Math.sin(2 * s) * sw;        // ...plus a faster wobble, so it never looks metronomic
  // The extremities LAG the trunk — a limb is a weight on the end of a lever, so it arrives at the
  // far side of the swing a beat after the body does. That phase shift is most of what separates a
  // body being thrown from a body being rotated, and it is scaled by `sw` like everything else.
  //
  // ...and they lag it TOGETHER. This used to be a scissor — the two sides on `±sin`, one arm and
  // one leg forward while the other pair went back — on the argument that a limp body does not move
  // like a star jump. It does not, but it does not PADDLE either: the body is spinning end over
  // end about its own X, and the only force on a limp limb is the trunk it hangs off, so both legs
  // (and both arms) swing the SAME way, a beat behind the turn. The scissor is exactly what the
  // user saw and reported: on the frames where the tumble carries the rig back through upright it
  // made the body read as a man RUNNING in mid-air, one leg forward and one back. Same-phase lag
  // costs nothing and cannot do that. `m` below is the small counter-wobble that keeps the two
  // sides from being a single rigid part.
  const lag = Math.sin(s - 0.85) * sw;
  const lag2 = Math.sin(2 * s - 1.5) * sw;
  const F0 = G || REST;
  // How far into `t` the launch pose lands. A body that is KNOCKED off its feet has it on in a
  // couple of frames; one being LIFTED off the deck gets twice as long, on top of its longer clock
  // (see `E.LAUNCH_T`) — the whole climb then takes five or six frames, which is what makes it read
  // as the body being scooped up rather than teleported into the air.
  const a = lift ? 0.20 : 0.10;
  // One channel's climb onto the launch pose: from where the part IS, to `peak`, arriving at
  // `a * k`. The punch that puts the body here is SUDDEN, so a KICKED launch is flicked on — two
  // thirds of the travel in the first third of the arrival — and then the whole shape DRIFTS for
  // the rest of the flight. A LIFTED one is DRAGGED instead (half the travel at half the arrival):
  // nothing is being struck, so there is nothing to snap, and the climb IS the move. Nothing here
  // is HELD either way: the tail is not a hold, it is the body coming down LOOSE, and it finishes
  // on `FALLEN` so the landing has somewhere to be continuous with — nothing about that tail needs
  // easing in, because it is already moving.
  const climb = (from, peak, k) => {
    const at = a * (k === undefined ? 1 : k);
    return lift ? dragKeys(from, peak, at) : flickKeys(from, peak, at);
  };
  const hip = kf(t, [...climb(F0.hip, 0.93, 1.2), [0.45, 0.95], [0.68, FALLEN.hip]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", kf(t, [...climb(F0.hipsX, 0.06, 1.2), [0.68, FALLEN.hipsX]]) + 0.10 * swing2, e);
  poseRot(bones, "hips", "y", kf(t, [...climb(F0.hipsY, 0.24, 1.2), [0.5, 0.18], [0.68, FALLEN.hipsY]]) + 0.10 * swing, e);
  poseRot(bones, "hips", "z", 0.14 * swing, e);
  poseRot(bones, "torso", "x", kf(t, [...climb(F0.torsoX, -0.44, 1.1), [0.45, -0.40], [0.68, FALLEN.torsoX]]) + 0.20 * swing, e);
  poseRot(bones, "torso", "y", kf(t, [...climb(0, -0.22, 1.1), [0.68, 0.08]]) + 0.16 * swing2, e);
  poseRot(bones, "torso", "z", 0.12 * swing, e);
  poseSettleTorso(bones, e);
  // The head is the last thing to be LEFT BEHIND: it snaps back hard, hangs there, and only comes
  // round as the body turns over on the way down.
  poseRot(bones, "head", "x", kf(t, [...climb(F0.headX, -0.58, 1.3), [0.46, -0.42], [0.56, 0.08], [0.68, FALLEN.headX]]) + 0.16 * swing, e);
  poseRot(bones, "head", "y", kf(t, [...climb(0, -0.12, 1.3), [0.68, 0.06]]) + 0.14 * swing2, e);
  poseRot(bones, "head", "z", 0.12 * swing, e);
  // Everything trails behind the launch — the arms are thrown up and come in FORWARD with the
  // elbows folding, and the knees are already coming up — and then the whole tuck swings loose on
  // top of that, TOGETHER, a beat behind the trunk (see `lag`): a ragdoll's limbs are a weight on
  // the end of a lever, and a body whose limbs move in lockstep with its trunk is a body being
  // rotated, not thrown. The shape they swing off is `FALLEN`, which is the tuck — so the swing is
  // small (0.26/0.16 of raw bone against the scissor's 0.46/0.34) and it can only ever ride on top
  // of a body that is already folded.
  for (const side of [LK, RK]) {
    const m = side < 0 ? 1 : -1;                 // ...the whisker that stops the pair reading as one part
    const F = side < 0 ? FALLEN.legR : FALLEN.legL;
    const L = side < 0 ? F0.legR : F0.legL;
    poseArmAngles(bones, side,
      kf(t, [...climb(F0.arm[0], -0.30), [0.32, -0.62], [0.60, -0.88], [0.68, FALLEN.arm[0]]]) + 0.22 * lag + 0.07 * lag2 * m,
      kf(t, [...climb(F0.arm[1], 0.26), [0.32, 0.30], [0.68, FALLEN.arm[1]]]) + 0.08 * lag * m,
      kf(t, [...climb(F0.arm[2], -1.15), [0.32, -1.32], [0.68, FALLEN.arm[2]]]) - 0.18 * lag - 0.05 * lag2 * m, e, 0);
    poseLegAngles(bones, side,
      kf(t, [...climb(L[0], 0.06), [0.32, -0.35], [0.58, F[0]], [0.68, F[0]]]) + 0.24 * lag + 0.05 * lag2 * m,
      kf(t, [...climb(L[1], 1.00), [0.32, 1.15], [0.58, F[1]], [0.68, F[1]]]) - 0.14 * lag - 0.04 * lag2 * m,
      kf(t, [...climb(L[2], 0.28), [0.68, F[2]]]) + 0.10 * lag2,
      kf(t, [[0, L[3]], [0.68, F[3]]]), e);
  }
  poseGrip(bones, 0.3, e);
}

// The other way into `flight`, and the one the finisher actually takes: a body that is already ON
// the deck, scooped back up off it (see `hit` in enemies.js, which is where the body's state is
// known). It is the same shape, leaving `DOWNED` instead of `REST` and easing onto the launch pose
// rather than flicking onto it — so the limbs trail up out of the shape they were lying in, and
// the hips are LIFTED off the deck across four frames rather than being teleported to standing
// height in one (measured, before this: 0.80 m of hip in 1/60 s).
function poseHurtLaunch(bones, t, e, spin) {
  poseHurtFlight(bones, t, e, spin, DOWNED, true);
}

// ...and the third way in, which is the 3rd M1's: a body the chain is holding by the HEAD, thrown
// up and over into a FLIP.
//
// This is the one reaction in the game that is an acrobatic beat rather than a shove with a shape
// on it, so it is authored as one. A body somersaults by TUCKING: the knees come up, the trunk
// curls over them, the arms wrap round the shins and the whole thing becomes a ball, because a
// long body cannot rotate — that is the entire reason the shape exists, and it is what the old
// version was missing. It used to delegate to `poseHurtFlight`, whose limbs only swing on
// `sin(spin)`, so a body thrown by the sweep crossed the air as one rigid plank turning about its
// own middle (the user's "youre just turning the angel of the enemy youre not adding animtion").
//
// Two clocks, laid over each other:
//   * `carry` — how much of the shape it LANDS in (`FALLEN`) it has picked up. Slow at the front,
//     because the body is still a ball, and it is what hands the landing something continuous.
//   * `tuck`  — the ball itself: in fast off the deck, held right over the top of the arc (where
//     the rotation is fastest and the tuck is doing the most work), and gone by the time the deck
//     arrives, so the limbs are already out to land on.
// `spin` still rides on top of both: the limbs swing in opposition on the tumble, so no two frames
// of the flight are the same shape, and the open-out has something to open out OF.
function poseHurtFlip(bones, t, e, spin) {
  const s = spin || 0;
  const swing = Math.sin(s);
  const swing2 = Math.sin(2 * s);
  const carry = kf(t, [[0, 0], [0.46, 0.10], [0.78, 0.74], [1, 1]]);
  const tuck = kf(t, [[0, 0], [0.14, 0.85], [0.28, 1], [0.58, 1], [0.80, 0.34], [1, 0]]);
  const mix = (a, b, k) => a + (b - a) * k;
  const G = CLINCHED, F = FALLEN;
  // The trunk curls over the knees and the hips come up under it — that is the shape becoming a
  // ball. `tuck` drives it; `carry` is only along for the landing.
  poseHipY(bones, mix(G.hip, F.hip, carry) - 0.10 * tuck, e);
  poseRot(bones, "hips", "x", mix(G.hipsX, F.hipsX, carry) + 0.34 * tuck + 0.10 * swing2, e);
  poseRot(bones, "hips", "y", mix(G.hipsY, F.hipsY, carry) + 0.10 * swing, e);
  poseRot(bones, "hips", "z", 0.14 * swing, e);
  poseRot(bones, "torso", "x", mix(G.torsoX, F.torsoX, carry) + 0.62 * tuck + 0.20 * swing, e);
  poseRot(bones, "torso", "y", mix(G.torsoY, 0, carry) + 0.16 * swing2, e);
  poseRot(bones, "torso", "z", mix(G.torsoZ, 0, carry) + 0.12 * swing, e);
  poseSettleTorso(bones, e);
  // The chin goes to the chest — a tuck is a shape with no neck in it.
  poseRot(bones, "head", "x", mix(G.headX, F.headX, carry) + 0.42 * tuck + 0.16 * swing, e);
  poseRot(bones, "head", "y", 0.14 * swing2, e);
  poseRot(bones, "head", "z", 0.12 * swing, e);
  for (const side of [LK, RK]) {
    // The arms come off the skull and DOWN round the knees (forward and folded), which is where a
    // tucked body puts them; they open out to `FALLEN`'s own fold as the ball unwinds, so
    // `carry` is doing less of that work than it used to (the landing shape is a tuck now too).
    // `upX` is authored the way the arm hangs — negative is FORWARD (see the measurement note on
    // `FALLEN`) — so coming down off the head is a POSITIVE delta, and the entry frame (tuck 0)
    // is the clinch's own hold exactly, which is the handover contract.
    const m = side < 0 ? 1 : -1;
    poseArmAngles(bones, side,
      mix(G.arm[0], F.arm[0], carry) + 0.55 * tuck + 0.30 * swing + 0.10 * swing2 * m,
      mix(G.arm[1], F.arm[1], carry) - 0.10 * tuck + 0.14 * swing * m,
      mix(G.arm[2], F.arm[2], carry) - 0.30 * tuck - 0.22 * swing - 0.08 * swing2 * m, e, 0);
    // The LEGS are the whole read: the knees are dragged up into the chest and STAY folded (the
    // clinch leaves them folded already — see `CLINCH_LEGS` — so the tuck is what keeps them that
    // way while `carry` tries to straighten them out). Both legs swing TOGETHER on the tumble
    // (see the note in `poseHurtFlight` — a scissor here is what makes a spinning body read as a
    // man running), and the knees stay close: a tucked body is a ball, not a frog.
    const L = side < 0 ? G.legR : G.legL;
    const FL = side < 0 ? F.legR : F.legL;
    poseLegAngles(bones, side,
      mix(L[0], FL[0], carry) - 0.92 * tuck + 0.30 * swing + 0.06 * swing2 * m,
      mix(L[1], FL[1], carry) + 0.62 * tuck - 0.20 * swing - 0.05 * swing2 * m,
      mix(L[2], FL[2], carry) + 0.24 * tuck,
      mix(L[3], FL[3], carry) + 0.06 * tuck, e);
  }
  poseGrip(bones, 0.35 + 0.55 * tuck, e);
}

// ...and the FOURTH way into `flight`, which is the UPPERCUT's: a body a rising right knee has just
// taken under the chin (see `player.js`'s `UPPER_*`, `E.UPPER_*` in enemies.js and `poseUppercut`).
// It is a shape of its own rather than a `flight` with a bigger number on it, because the read is
// different in two ways.
//
// The first is the GESTURE. This body was hit from BELOW and in FRONT, so the head is the first
// thing to go and the last thing to leave: the trunk ARCHES BACK over the hips with the chin up
// (the flight's fold is the opposite gesture, and the flip's tuck the opposite of both) and the
// arms are thrown out and BACK — a body whose head has just been snapped backwards puts its hands
// out behind it. The legs come last: they trail, nearly straight and slightly swept back, and only
// fold as the body comes down.
//
// The second is the CLOCK. This is the longest air any hit in the game buys — `P.UPPER_LIFT` is
// solved off `P.GRAVITY` for a full second of hang, against the flight's third of one — so the
// shape is spread over the whole arc rather than landing in the first few frames: the arch arrives
// over the first fifth, holds through the hang (that HOLD is the move, and it is what makes the
// body read as parked in the air rather than as passing through), and comes loose into `FALLEN`
// across the descent, so the deck is handed a body already unfolding — the same contract the flight
// and the flip both keep, and the reason all three can hand over to `down` without a pop.
const UPPER = {
  hip: 0.98,
  hipsX: -0.22, hipsY: -0.10,          // the hips are driven back under the arch
  torsoX: -0.62, torsoY: 0.16,         // ...and the trunk is thrown back over them
  headX: -0.66,                        // chin up: the head is what the knee met
  arm: [0.80, 0.46, -0.60],            // upX, upZ, elbow — thrown out and BACK
  legL: [0.34, 0.55, -0.24, 0.16],     // thigh, knee, sole, splay — trailing, nearly straight
  legR: [0.20, 0.42, -0.20, 0.10],
};

function poseHurtUpper(bones, t, e, spin) {
  const s = spin || 0;
  // The same swing machinery the flight and the flip use (see the note in `poseHurtFlight`): every
  // offset below is a `sin` of the tumble, so the limbs SWING on the turn instead of holding one
  // silhouette through a whole revolution, and both sides of a pair swing TOGETHER — a body turning
  // end over end does not paddle.
  const sw = Math.min(1, Math.abs(s) / 2.5);
  const swing = Math.sin(s) * sw;
  const swing2 = Math.sin(2 * s) * sw;
  const lag = Math.sin(s - 0.85) * sw;
  const lag2 = Math.sin(2 * s - 1.5) * sw;
  const R = REST, U = UPPER, F = FALLEN;
  const hip = kf(t, [[0, R.hip], [0.16, U.hip], [0.52, U.hip], [0.80, F.hip], [1, F.hip]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", kf(t, [[0, R.hipsX], [0.16, U.hipsX], [0.52, U.hipsX * 0.8], [0.80, F.hipsX], [1, F.hipsX]]) + 0.10 * swing2, e);
  poseRot(bones, "hips", "y", kf(t, [[0, R.hipsY], [0.16, U.hipsY], [0.52, U.hipsY], [0.80, F.hipsY], [1, F.hipsY]]) + 0.10 * swing, e);
  poseRot(bones, "hips", "z", 0.14 * swing, e);
  poseRot(bones, "torso", "x", kf(t, [[0, R.torsoX], [0.14, U.torsoX], [0.50, U.torsoX * 0.86], [0.76, F.torsoX], [1, F.torsoX]]) + 0.18 * swing, e);
  poseRot(bones, "torso", "y", kf(t, [[0, R.torsoY], [0.16, U.torsoY], [0.62, 0], [0.80, 0.06]]) + 0.14 * swing2, e);
  poseRot(bones, "torso", "z", 0.12 * swing, e);
  poseSettleTorso(bones, e);
  // The head HOLDS its snap for most of the hang — it is the joint that was hit, so it is the last
  // thing to come back — and only comes round as the body turns over on the way down.
  poseRot(bones, "head", "x", kf(t, [[0, R.headX], [0.10, U.headX], [0.42, U.headX * 0.72], [0.64, 0.10], [0.82, F.headX], [1, F.headX]]) + 0.14 * swing, e);
  poseRot(bones, "head", "y", kf(t, [[0, 0], [0.18, -0.16], [0.72, 0.06]]) + 0.12 * swing2, e);
  poseRot(bones, "head", "z", 0.12 * swing, e);
  for (const side of [LK, RK]) {
    const m = side < 0 ? 1 : -1;                 // the whisker that stops the pair reading as one part
    const UA = side < 0 ? U.legR : U.legL;
    const FA = side < 0 ? F.legR : F.legL;
    const RA = side < 0 ? R.legR : R.legL;
    poseArmAngles(bones, side,
      kf(t, [[0, R.arm[0]], [0.16, U.arm[0]], [0.48, U.arm[0] * 0.9], [0.74, -0.30], [1, F.arm[0]]]) + 0.22 * lag + 0.07 * lag2 * m,
      kf(t, [[0, R.arm[1]], [0.16, U.arm[1]], [0.54, U.arm[1] * 0.9], [1, F.arm[1]]]) + 0.08 * lag * m,
      kf(t, [[0, R.arm[2]], [0.16, U.arm[2]], [0.54, U.arm[2] * 0.9], [1, F.arm[2]]]) - 0.16 * lag - 0.05 * lag2 * m, e, 0);
    poseLegAngles(bones, side,
      kf(t, [[0, RA[0]], [0.18, UA[0]], [0.50, UA[0] * 0.92], [0.80, FA[0]], [1, FA[0]]]) + 0.24 * lag + 0.05 * lag2 * m,
      kf(t, [[0, RA[1]], [0.18, UA[1]], [0.50, UA[1]], [0.80, FA[1]], [1, FA[1]]]) - 0.14 * lag - 0.04 * lag2 * m,
      kf(t, [[0, RA[2]], [0.32, UA[2]], [0.80, FA[2]], [1, FA[2]]]) + 0.10 * lag2,
      kf(t, [[0, RA[3]], [0.42, UA[3]], [0.80, FA[3]], [1, FA[3]]]), e);
  }
  poseGrip(bones, 0.3, e);
}

function poseHurtDown(bones, t, e) {
  // It arrives ON `FALLEN` — the trunk is already on the deck by then — so this shape is the
  // SETTLE, and the only things left to move are the bits hanging off the trunk. Each of them
  // finishes falling on its OWN lag (the arms, the head, then the legs) and the two sides of
  // each pair are offset too, so nothing in the whole pose slaps down on the same frame as
  // anything else. The head BOUNCES once — it is the lightest thing on the longest lever, so it
  // is the one part that rebounds — and the hips sink the last few centimetres past rest and
  // come back. It ends exactly on `DOWNED`, which is where `getup` starts.
  poseHipY(bones, kf(t, [[0, FALLEN.hip], [0.16, DOWNED.hip - 0.015], [0.40, DOWNED.hip + 0.012], [1, DOWNED.hip]]), e);
  poseRot(bones, "hips", "x", kf(t, [[0, FALLEN.hipsX], [0.20, DOWNED.hipsX - 0.03], [0.48, DOWNED.hipsX + 0.02], [1, DOWNED.hipsX]]), e);
  poseRot(bones, "hips", "y", kf(t, [[0, FALLEN.hipsY], [0.5, DOWNED.hipsY + 0.04], [1, DOWNED.hipsY]]), e);
  poseRot(bones, "hips", "z", 0, e);
  poseRot(bones, "torso", "x", kf(t, [[0, FALLEN.torsoX], [0.20, DOWNED.torsoX - 0.04], [0.52, DOWNED.torsoX + 0.03], [1, DOWNED.torsoX]]), e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  // The head smacks the deck, rebounds, and settles — one bounce, and it is the last beat of the
  // whole settle to finish.
  poseRot(bones, "head", "x", kf(t, [[0, FALLEN.headX], [0.13, 0.18], [0.34, DOWNED.headX + 0.09], [0.62, DOWNED.headX - 0.05], [1, DOWNED.headX]]), e);
  poseRot(bones, "head", "y", kf(t, [[0, 0], [0.32, -0.07], [1, 0]]), e);
  poseRot(bones, "head", "z", 0, e);
  for (const side of [LK, RK]) {
    const F = side < 0 ? FALLEN.legR : FALLEN.legL;
    const D = side < 0 ? DOWNED.legR : DOWNED.legL;
    const lag = side < 0 ? 0.08 : 0;   // the right leg lands a beat after the left
    poseLegAngles(bones, side,
      kf(t, [[0, F[0]], [0.26 + lag, D[0] - 0.07], [0.60 + lag, D[0] + 0.03], [1, D[0]]]),
      kf(t, [[0, F[1]], [0.26 + lag, D[1] + 0.07], [0.60 + lag, D[1] - 0.04], [1, D[1]]]),
      kf(t, [[0, F[2]], [1, D[2]]]),
      kf(t, [[0, F[3]], [1, D[3]]]), e);
  }
  for (const side of [LK, RK]) {
    const A = DOWNED.arm;
    const lag = side < 0 ? 0.07 : 0;
    poseArmAngles(bones, side,
      kf(t, [[0, FALLEN.arm[0]], [0.22 + lag, A[0] + 0.06], [0.54 + lag, A[0] - 0.02], [1, A[0]]]),
      kf(t, [[0, FALLEN.arm[1]], [0.24 + lag, A[1] + 0.05], [1, A[1]]]),
      kf(t, [[0, FALLEN.arm[2]], [0.30 + lag, A[2] - 0.12], [0.64 + lag, A[2] + 0.05], [1, A[2]]]), e, 0);
  }
  poseGrip(bones, 0.15, e);
}

function poseHurtGetup(bones, t, e) {
  // It starts exactly ON `DOWNED` — every channel's t=0 is that table, including the feet, which
  // are the one thing that did move before this (a bare 9° flick of the soles on the first frame)
  // — and it ends exactly ON `REST`, which is the shape the idle takes over from, so both ends of
  // this reaction are handovers rather than pops.
  const hip = kf(t, [[0, DOWNED.hip], [0.45, 0.55], [1, REST.hip]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", kf(t, [[0, DOWNED.hipsX], [0.6, -0.20], [1, REST.hipsX]]), e);
  poseRot(bones, "hips", "y", kf(t, [[0, DOWNED.hipsY], [0.6, 0.03], [1, REST.hipsY]]), e);
  poseRot(bones, "hips", "z", 0, e);
  poseRot(bones, "torso", "x", kf(t, [[0, DOWNED.torsoX], [0.45, 0.55], [1, REST.torsoX]]), e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", kf(t, [[0, DOWNED.headX], [0.5, 0.20], [1, REST.headX]]), e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  for (const side of [LK, RK]) poseArmAngles(bones, side,
    kf(t, [[0, DOWNED.arm[0]], [0.45, -0.95], [1, REST.arm[0]]]),
    kf(t, [[0, DOWNED.arm[1]], [0.45, 0.35], [1, REST.arm[1]]]),
    kf(t, [[0, DOWNED.arm[2]], [0.45, -1.90], [1, REST.arm[2]]]), e, 0);
  // The legs HOLD the tuck until the trunk is most of the way up and only then reach out for the
  // deck. They cannot simply unfold as the body rises: the pitch turns the whole rig about its
  // own origin, so a leg that is out in front of a lying body swings down through the pavement
  // as the body comes upright (measured: the feet 0.25 under the deck for a third of the beat).
  // Held in, they ride up with the hips and arrive on the ground at the end, as a kip-up does.
  poseLegAngles(bones, LK,
    kf(t, [[0, DOWNED.legL[0]], [0.68, -0.75], [1, REST.legL[0]]]),
    kf(t, [[0, DOWNED.legL[1]], [0.68, 1.10], [1, REST.legL[1]]]),
    kf(t, [[0, DOWNED.legL[2]], [1, REST.legL[2]]]),
    kf(t, [[0, DOWNED.legL[3]], [1, 0.24]]), e);
  poseLegAngles(bones, RK,
    kf(t, [[0, DOWNED.legR[0]], [0.68, -0.55], [1, REST.legR[0]]]),
    kf(t, [[0, DOWNED.legR[1]], [0.68, 0.90], [1, REST.legR[1]]]),
    kf(t, [[0, DOWNED.legR[2]], [1, REST.legR[2]]]),
    kf(t, [[0, DOWNED.legR[3]], [1, 0.24]]), e);
  poseGrip(bones, 0.3, e);
}

// ---------------------------------------------------------------------------
// THE OTHER THREE WAYS UP (see `pickGetup` in enemies.js, and the `GETUP_*` angle curves there).
//
// The plain `getup` above is a straight roll-up: every channel eases from `DOWNED` to `REST` and
// the legs are the only thing with a beat of its own. That is fine, and it is why it is still the
// fallback, but it has no ACCENT — nothing in it says what kind of body is getting up or how it
// got there. These three each do, and they are picked per knock-down out of the situation the
// body is in:
//
//   kip     the show-off. Everything is one whip and the legs are the whip; the arms are only
//           there for the push-off and the balance. Fastest of the four by a third.
//   roll    the tactical one: turn onto the hip, post on an arm, come up off one knee.
//   sit     the end of the road: no momentum at all, the arms walk the trunk up and take the
//           weight while the legs get themselves under. Slowest.
//
// All three start exactly ON `DOWNED` and end exactly ON `REST`, like the one above — the
// reaction layer is at full weight on a variant switch, so anything else teleports the body.
// The whole-rig angle (pitch + height) is NOT here: it belongs to enemies.js's per-variant
// `angle` curve, and the deck contact is solved there (`restOnDeck`), which is what lets these
// be authored as pure shapes.
//
// The KIP-UP — the one from the reference clip, and the only one of the four that is a STUNT.
//
// Its whole-rig angle is a full 360° forward turn (see `HURT_BODY.getupKip`), so this pose is not
// a whip at all — it is a TUCK, and the turn is what carries him round. That is the thing the
// reference makes obvious and the first pass got wrong: the body's rotation is what puts him on
// his feet, so the pose's job is to be a shape the rotation can turn AROUND (small, curled, low
// moment of inertia) and then to open out at the right moment to catch the deck. The legs are
// pulled in tight for the turn and thrown out of it to land; the trunk stays curled, because an
// inverted body with a straight spine is a headstand, and the head is the one thing that must
// never be the lowest point. The arms push off behind the shoulders and then tuck in.
function poseHurtGetupKip(bones, t, e) {
  const hip = kf(t, [[0, DOWNED.hip], [0.30, 0.62], [0.60, 0.92], [1, REST.hip]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", kf(t, [[0, DOWNED.hipsX], [0.20, -0.46], [0.48, -0.34], [0.76, -0.14], [1, REST.hipsX]]), e);
  poseRot(bones, "hips", "y", kf(t, [[0, DOWNED.hipsY], [0.30, 0.10], [0.70, 0.04], [1, REST.hipsY]]), e);
  poseRot(bones, "hips", "z", 0, e);
  poseRot(bones, "torso", "x", kf(t, [[0, DOWNED.torsoX], [0.12, 0.60], [0.36, 1.35], [0.58, 1.30], [0.78, 0.45], [1, REST.torsoX]]), e);
  poseRot(bones, "torso", "y", kf(t, [[0, 0], [0.34, -0.08], [1, REST.torsoY]]), e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  // The chin goes hard to the chest for the whole turn and only lifts as he comes out of it. This
  // is not decoration — it is the whole reason the roll is legal: measured, the crown of the head
  // is the lowest thing on this rig the moment the spine points down, so without the tuck the body
  // balances on its skull through the middle of the move. Tucked, the head rides level with the
  // upper back and the contact stays on the back and the posted arms, as it should.
  poseRot(bones, "head", "x", kf(t, [[0, DOWNED.headX], [0.12, 0.85], [0.36, 1.70], [0.62, 1.60], [0.84, 0.35], [1, REST.headX]]), e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  // The arms post on the deck behind the shoulders and STAY there for the whole turn — measured,
  // they are the only thing on this rig that reaches past the head once the spine is inverted, so
  // they are what keeps the deck contact legal through the middle of the roll (a real kip-up
  // pushes off exactly like this: the hands stay down while the hips ride up over them). They come
  // off it only as the feet arrive, and swing out to stop the rotation.
  for (const side of [LK, RK]) poseArmAngles(bones, side,
    kf(t, [[0, DOWNED.arm[0]], [0.14, 1.30], [0.30, 1.85], [0.46, 1.90], [0.62, 1.85], [0.74, 0.30], [0.88, -0.72], [1, REST.arm[0]]]),
    kf(t, [[0, DOWNED.arm[1]], [0.16, 0.60], [0.44, 0.30], [0.72, 0.70], [1, REST.arm[1]]]),
    kf(t, [[0, DOWNED.arm[2]], [0.14, -1.30], [0.30, -0.75], [0.46, -0.60], [0.60, -0.90], [0.72, -1.60], [1, REST.arm[2]]]), e, 0);
  // ...and the legs are the whole trick, in two moves: tucked TIGHT for the turn, then thrown out
  // of it to catch the deck and take the weight. "Tight" is meant literally here — the user:
  // *"dont split the legs in the 2nd kip up skill make them close tightly"* — so the trail leg
  // rides ON the lead (0.03 of thigh, 0.02 of knee, one hundredth of the clock behind it) instead
  // of a hand's width off it, and the SPLAY is closed to 0.05 for the whole of the tuck (it used
  // to be held at 0.12/0.16, which is a flicker of daylight between the knees at exactly the
  // frame the ball has to read as one shape). The two legs are still a whisker apart, because two
  // identical legs is a handstand — but nothing in it is a split.
  poseLegAngles(bones, LK,
    kf(t, [[0, DOWNED.legL[0]], [0.14, -1.30], [0.34, -1.95], [0.52, -1.70], [0.72, -0.30], [0.86, 0.10], [1, REST.legL[0]]]),
    kf(t, [[0, DOWNED.legL[1]], [0.14, 1.70], [0.34, 2.45], [0.52, 2.30], [0.72, 0.70], [1, REST.legL[1]]]),
    kf(t, [[0, DOWNED.legL[2]], [0.34, 0.44], [0.74, 0.06], [1, REST.legL[2]]]),
    kf(t, [[0, DOWNED.legL[3]], [0.40, 0.05], [1, REST.legL[3]]]), e);
  poseLegAngles(bones, RK,
    kf(t, [[0, DOWNED.legR[0]], [0.15, -1.32], [0.35, -1.98], [0.53, -1.72], [0.73, -0.32], [0.87, 0.08], [1, REST.legR[0]]]),
    kf(t, [[0, DOWNED.legR[1]], [0.15, 1.72], [0.35, 2.47], [0.53, 2.32], [0.73, 0.72], [1, REST.legR[1]]]),
    kf(t, [[0, DOWNED.legR[2]], [0.35, 0.46], [0.75, 0.06], [1, REST.legR[2]]]),
    kf(t, [[0, DOWNED.legR[3]], [0.40, 0.05], [1, REST.legR[3]]]), e);
  poseGrip(bones, kf(t, [[0, 0.15], [0.32, 0.66], [0.62, 0.30], [1, 0.30]]), e);
}

// The ROLL — the tactical get-up, and the one a hard landing pushes a body towards.
//
// There is no whip in it anywhere: the body TURNS. The hips and the trunk yaw against each other,
// one arm posts on the deck under the shoulder while the other comes across the chest, and the
// two legs do completely different things — the far one tucks under into a kneel, the near one
// draws up and PLANTS, and it is the planted foot the body stands up off. The trunk leads the
// rise (a body pushing itself up on an arm is a body whose chest is already going) and the hand
// is the last thing to let go of the deck.
function poseHurtGetupRoll(bones, t, e) {
  const hip = kf(t, [[0, DOWNED.hip], [0.20, 0.26], [0.44, 0.54], [0.70, 0.80], [1, REST.hip]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", kf(t, [[0, DOWNED.hipsX], [0.28, -0.36], [0.58, -0.18], [1, REST.hipsX]]), e);
  poseRot(bones, "hips", "y", kf(t, [[0, DOWNED.hipsY], [0.22, 0.54], [0.48, 0.62], [0.74, 0.28], [1, REST.hipsY]]), e);
  poseRot(bones, "hips", "z", kf(t, [[0, 0], [0.26, 0.30], [0.56, 0.16], [1, 0]]), e);
  poseRot(bones, "torso", "x", kf(t, [[0, DOWNED.torsoX], [0.24, 0.48], [0.48, 0.72], [0.72, 0.34], [1, REST.torsoX]]), e);
  poseRot(bones, "torso", "y", kf(t, [[0, 0], [0.22, -0.42], [0.48, -0.50], [0.74, -0.20], [1, REST.torsoY]]), e);
  poseRot(bones, "torso", "z", kf(t, [[0, 0], [0.26, -0.24], [0.56, -0.10], [1, 0]]), e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", kf(t, [[0, DOWNED.headX], [0.26, 0.14], [0.58, -0.20], [1, REST.headX]]), e);
  poseRot(bones, "head", "y", kf(t, [[0, 0], [0.26, 0.34], [0.62, 0.18], [1, 0]]), e);
  poseRot(bones, "head", "z", 0, e);
  // The LK arm posts on the deck for the push and lifts as the trunk comes up off it (measured:
  // the hand only reaches the deck while the trunk is still low — past a third of the move the
  // shoulder is already too high for it, so it comes away rather than dragging). The other arm
  // crosses the chest, then swings out for balance as he comes up.
  poseArmAngles(bones, LK,
    kf(t, [[0, DOWNED.arm[0]], [0.10, 1.05], [0.24, 1.10], [0.44, 0.62], [0.66, 0.20], [1, REST.arm[0]]]),
    kf(t, [[0, DOWNED.arm[1]], [0.24, 0.95], [0.48, 0.80], [0.66, 0.58], [1, REST.arm[1]]]),
    kf(t, [[0, DOWNED.arm[2]], [0.10, -0.55], [0.24, -0.50], [0.50, -0.75], [0.68, -1.05], [1, REST.arm[2]]]), e, 0);
  // ...and the other one swings across the chest, then out for balance as he comes up.
  poseArmAngles(bones, RK,
    kf(t, [[0, DOWNED.arm[0]], [0.24, -0.55], [0.52, -0.78], [0.74, -0.95], [1, REST.arm[0]]]),
    kf(t, [[0, DOWNED.arm[1]], [0.24, 0.52], [0.52, 0.22], [1, REST.arm[1]]]),
    kf(t, [[0, DOWNED.arm[2]], [0.24, -1.60], [0.52, -1.30], [1, REST.arm[2]]]), e, 0);
  // LK leg: tucked UNDER into the kneel, then extended to carry him up off it.
  poseLegAngles(bones, LK,
    kf(t, [[0, DOWNED.legL[0]], [0.26, -0.60], [0.50, 0.58], [0.74, -0.18], [1, REST.legL[0]]]),
    kf(t, [[0, DOWNED.legL[1]], [0.26, 1.35], [0.50, 2.50], [0.74, 1.30], [1, REST.legL[1]]]),
    kf(t, [[0, DOWNED.legL[2]], [0.50, 0.38], [0.74, 0.12], [1, REST.legL[2]]]),
    kf(t, [[0, DOWNED.legL[3]], [0.52, 0.24], [1, REST.legL[3]]]), e);
  // RK leg: drawn up and PLANTED — the foot the whole get-up stands on.
  poseLegAngles(bones, RK,
    kf(t, [[0, DOWNED.legR[0]], [0.26, -1.40], [0.50, -1.18], [0.74, -0.42], [1, REST.legR[0]]]),
    kf(t, [[0, DOWNED.legR[1]], [0.26, 2.00], [0.50, 1.62], [0.74, 1.00], [1, REST.legR[1]]]),
    kf(t, [[0, DOWNED.legR[2]], [0.50, -0.10], [1, REST.legR[2]]]),
    kf(t, [[0, DOWNED.legR[3]], [0.52, 0.18], [1, REST.legR[3]]]), e);
  poseGrip(bones, kf(t, [[0, 0.15], [0.42, 0.45], [0.78, 0.25], [1, 0.30]]), e);
}

// The SIT-UP — the ordinary one, and the slowest: nothing about it is a spring.
//
// The trunk does the whole first half (this is the one get-up where the hips barely move and the
// FOLD is the move), the arms come off the deck to counterbalance it and then one hand goes down
// behind the hip and takes the body's weight, and the legs come under one at a time: one foot
// plants flat and the other knee stays folded beside it. A body that gets up like this has
// nothing left, which is exactly when `pickGetup` reaches for it.
function poseHurtGetupSit(bones, t, e) {
  const hip = kf(t, [[0, DOWNED.hip], [0.28, 0.22], [0.52, 0.34], [0.74, 0.70], [1, REST.hip]]);
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", kf(t, [[0, DOWNED.hipsX], [0.32, -0.46], [0.62, -0.24], [1, REST.hipsX]]), e);
  poseRot(bones, "hips", "y", kf(t, [[0, DOWNED.hipsY], [0.36, 0.16], [0.72, 0.08], [1, REST.hipsY]]), e);
  poseRot(bones, "hips", "z", 0, e);
  poseRot(bones, "torso", "x", kf(t, [[0, DOWNED.torsoX], [0.26, 0.58], [0.48, 1.18], [0.68, 1.02], [0.88, 0.44], [1, REST.torsoX]]), e);
  poseRot(bones, "torso", "y", kf(t, [[0, 0], [0.42, 0.18], [1, REST.torsoY]]), e);
  poseRot(bones, "torso", "z", kf(t, [[0, 0], [0.42, 0.10], [1, 0]]), e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", kf(t, [[0, DOWNED.headX], [0.26, 0.42], [0.52, 0.60], [0.82, 0.04], [1, REST.headX]]), e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  // The arms: forward off the deck to counterbalance the sit-up, then the LK hand goes down BEHIND
  // the hip and presses — that press is the whole second half of the move — and lets go last.
  poseArmAngles(bones, LK,
    kf(t, [[0, DOWNED.arm[0]], [0.22, -0.72], [0.44, -0.34], [0.60, 0.95], [0.86, 0.40], [1, REST.arm[0]]]),
    kf(t, [[0, DOWNED.arm[1]], [0.22, 0.46], [0.44, 0.22], [0.62, 0.72], [1, REST.arm[1]]]),
    kf(t, [[0, DOWNED.arm[2]], [0.22, -1.95], [0.44, -1.60], [0.62, -0.42], [0.86, -1.05], [1, REST.arm[2]]]), e, 0);
  poseArmAngles(bones, RK,
    kf(t, [[0, DOWNED.arm[0]], [0.22, -0.58], [0.44, -0.38], [0.62, -0.12], [1, REST.arm[0]]]),
    kf(t, [[0, DOWNED.arm[1]], [0.22, 0.42], [0.44, 0.36], [1, REST.arm[1]]]),
    kf(t, [[0, DOWNED.arm[2]], [0.22, -2.10], [0.44, -2.15], [0.64, -1.70], [1, REST.arm[2]]]), e, 0);
  // The legs: drawn up to the chest first (the knees are what he folds onto), then the RK foot
  // plants FLAT and takes the weight while the LK knee stays folded beside it.
  poseLegAngles(bones, LK,
    kf(t, [[0, DOWNED.legL[0]], [0.32, -1.32], [0.58, -1.48], [0.82, -0.32], [1, REST.legL[0]]]),
    kf(t, [[0, DOWNED.legL[1]], [0.32, 1.90], [0.58, 1.98], [0.82, 1.05], [1, REST.legL[1]]]),
    kf(t, [[0, DOWNED.legL[2]], [0.58, 0.12], [1, REST.legL[2]]]),
    kf(t, [[0, DOWNED.legL[3]], [0.52, 0.32], [1, REST.legL[3]]]), e);
  poseLegAngles(bones, RK,
    kf(t, [[0, DOWNED.legR[0]], [0.32, -1.08], [0.60, -1.80], [0.86, -0.38], [1, REST.legR[0]]]),
    kf(t, [[0, DOWNED.legR[1]], [0.32, 1.65], [0.60, 2.20], [0.86, 1.12], [1, REST.legR[1]]]),
    kf(t, [[0, DOWNED.legR[2]], [0.60, -0.06], [1, REST.legR[2]]]),
    kf(t, [[0, DOWNED.legR[3]], [0.52, 0.22], [1, REST.legR[3]]]), e);
  poseGrip(bones, kf(t, [[0, 0.15], [0.52, 0.30], [0.82, 0.45], [1, 0.30]]), e);
}

// ---------------------------------------------------------------------------
// THE WALL SLAM (see `Enemy.wallSlam`, `E.WALL_*` and `HURT_BODY.wallslam`) — the longest
// authored shape in the game, and the only one written to a frame breakdown rather than to a
// move. The user's own, at 60 fps, is the spine of it; `t` is `frame / 60` for the whole thing:
//
//   1. THE COLLISION & CRUMPLE  (f1-15)
//      f1-2    the hit: the body is FLAT on the face, limbs whipped out and forward, and it
//              FREEZES (the key pair at 0 and 0.05 holds every channel dead still);
//      f3-6    the slide: the limbs go loose and hang while the body rides down the wall — the
//              DESCENT is `pos.y` in `stepReaction`, so what is here is only the limpness;
//      f7-15   the collapse: it tips onto the deck and crumples into a heap. The head drops
//              LAST and bounces once (it is the lightest thing on the longest lever).
//   2. THE RECOVERY STUN  (f16-26)
//      f16-25  the daze: dead still for a beat, then a head-shake and the RK hand drifting in
//              across the stomach — the user's "lightly shake their head or clutch their
//              stomach/head".
//
// ...and from f26 (u 0.42 — `SLAM_HAND`) the body is HANDED OVER to the game's own get-up. The
// rest of the user's breakdown is the three beats that move is already built out of: it posts one
// hand on the deck and pushes the torso up off it (f26-35, the ANCHOR), drives a knee under
// itself (f36-45, the STRUGGLE) and comes up unevenly onto its feet (f46-55, the RISE), before
// the stance takes over (f56-60, the SNAP). Rather than author a second get-up that says the same
// thing in different numbers — and risk the contorted mid-poses an earlier hand-authored pass
// produced — the slam delegates to `poseHurtGetupRoll`, re-timed onto the slam's clock, and lays
// the two beats the roll does NOT carry on top of it:
//
//   * THE WOBBLE (f36-45) — an additive roll of the trunk, windowed so it enters and leaves at
//     zero. It is the one thing in the shape that says "out of breath" rather than "getting up".
//   * THE HEAD STAYS DOWN (f46-55) — the user's "looking at the ground". Ramped in as the body
//     leaves the deck and released before the snap, so the last beat is the eyes coming up.
//
// Both ends are handovers, exactly like the get-ups': it STARTS on the shape a body pinned
// vertically on a wall is in (see `HURT_BODY.wallslam`, whose pitch is 0 through this) and ENDS
// on `REST`, which is what the idle layer is wearing when the reaction's weight goes away. The
// authored half is keyed to land EXACTLY on `DOWNED` at `SLAM_HAND` — which is where the roll's
// own `t = 0` is — so the seam is invisible. `HURT_BODY.wallslam`'s pitch curve follows the pose
// across it: it tips the body onto the deck over the crumple, holds it flat through the daze, and
// from `SLAM_HAND` on it is the roll's own curve, mapped onto this clock.
// ---------------------------------------------------------------------------
const SLAM_HAND = 0.42;

function poseHurtWallSlam(bones, t, e) {
  // ---- THE HANDOVER (f26 on). Additive nudges, NOT `poseRot`: the roll has already ASSIGNED
  // every channel it owns, so writing them again would only replace its shape with this one's.
  if (t >= SLAM_HAND) {
    const u = Math.min(1, (t - SLAM_HAND) / (1 - SLAM_HAND));
    poseHurtGetupRoll(bones, u, e);
    // THE WOBBLE (f36-45): the trunk rolling against itself on the way up, on a half-sine
    // window so it never displaces the shape it rides on.
    if (u > 0.17 && u < 0.70) {
      const k = (u - 0.17) / 0.53;
      bones.torso.rotation.z += Math.sin(k * Math.PI * 5) * 0.16 * Math.sin(k * Math.PI) * e;
    }
    // THE HEAD STAYS DOWN (f46-55), released by the snap.
    const low = kf(u, [[0, 0], [0.30, 0.15], [0.62, 0.60], [0.78, 1], [0.88, 1], [0.96, 0]]);
    bones.head.rotation.x += 0.55 * low * e;
    return;
  }

  // ---- THE IMPACT (f1-2) AND THE SLIDE (f3-6). The body is pinned flat on the face and vertical
  // while the limbs are still travelling: they whip out and forward, and then go limp and HANG
  // while the body rides down the wall (the descent itself is `pos.y`, in `stepReaction`). The key
  // pair at 0 and 0.05 is what makes the stop a STOP rather than a settle.

  // ---- the hips: up on the face at the impact, then riding themselves down as the body tips onto
  // the deck, and settled on `DOWNED` before the daze starts.
  poseHipY(bones, kf(t, [
    [0, 0.96], [0.05, 0.96], [0.10, 0.92], [0.16, 0.70], [0.20, 0.46], [0.24, 0.28],
    [0.28, 0.19], [0.34, DOWNED.hip], [0.42, DOWNED.hip],
  ]), e);
  poseRot(bones, "hips", "x", kf(t, [
    [0, 0.03], [0.05, 0.03], [0.10, -0.02], [0.16, -0.10], [0.22, -0.17], [0.28, DOWNED.hipsX],
    [0.42, DOWNED.hipsX],
  ]), e);
  poseRot(bones, "hips", "y", kf(t, [
    [0, 0], [0.12, 0.08], [0.22, -0.06], [0.30, 0.03], [0.38, 0], [0.42, DOWNED.hipsY],
  ]), e);
  poseRot(bones, "hips", "z", kf(t, [
    [0, 0], [0.10, 0.09], [0.22, -0.07], [0.32, 0.02], [0.42, 0],
  ]), e);

  // ---- the trunk: arched back into the face at the impact, folding as the body goes down, and
  // flat by the daze. The SIT-UP is not here — it is the roll's, on the far side of the handover.
  poseRot(bones, "torso", "x", kf(t, [
    [0, -0.12], [0.05, -0.12], [0.10, 0.02], [0.16, 0.12], [0.22, 0.08], [0.28, DOWNED.torsoX],
    [0.42, DOWNED.torsoX],
  ]), e);
  poseRot(bones, "torso", "y", kf(t, [
    [0, 0], [0.12, 0.09], [0.22, -0.07], [0.30, 0.04], [0.38, 0], [0.42, 0],
  ]), e);
  poseRot(bones, "torso", "z", kf(t, [
    [0, 0], [0.10, 0.08], [0.22, -0.06], [0.30, 0.02], [0.42, 0],
  ]), e);
  poseSettleTorso(bones, e);

  // ---- the head: craned back into the face at the impact, thrown forward as the body tips, and
  // the LAST thing to land — it smacks the deck, rebounds and settles (f7-15), then shakes itself
  // in the daze (f16-25) and is still by the handover.
  poseRot(bones, "head", "x", kf(t, [
    [0, -0.30], [0.05, -0.30], [0.10, 0.12], [0.16, 0.48], [0.21, 0.70], [0.26, 0.34],
    [0.31, 0.52], [0.36, 0.40], [0.40, 0.36], [0.42, DOWNED.headX],
  ]), e);
  poseRot(bones, "head", "y", kf(t, [
    [0, 0], [0.09, 0], [0.12, 0.14], [0.15, -0.12], [0.18, 0.09], [0.22, -0.05], [0.30, 0],
    [0.33, 0.16], [0.36, -0.15], [0.39, 0.10], [0.42, 0],
  ]), e);
  poseRot(bones, "head", "z", kf(t, [
    [0, 0], [0.10, 0.05], [0.20, -0.08], [0.30, 0.03], [0.42, 0],
  ]), e);

  // ---- the arms. The LK one is the ANCHOR side — it is the hand the roll posts on the deck a beat
  // later — so it comes off the face, goes limp and is already low and out to the side by the
  // handover, the shorter path to the pavement of the two. The RK one is the CLUTCH: down off the
  // face, across to the stomach through the daze, then released back onto `DOWNED` before the seam.
  poseArmAngles(bones, LK,
    kf(t, [
      [0, -2.28], [0.05, -2.30], [0.10, -1.20], [0.16, -0.62], [0.22, -0.34], [0.28, -0.12],
      [0.34, 0.02], [0.42, DOWNED.arm[0]],
    ]),
    kf(t, [
      [0, 0.30], [0.05, 0.32], [0.10, 0.58], [0.16, 0.74], [0.22, 0.80], [0.28, 0.83],
      [0.34, 0.85], [0.42, DOWNED.arm[1]],
    ]),
    kf(t, [
      [0, -0.20], [0.05, -0.20], [0.10, -0.58], [0.16, -0.74], [0.22, -0.74], [0.28, -0.72],
      [0.34, -0.70], [0.42, DOWNED.arm[2]],
    ]), e, 0);
  poseArmAngles(bones, RK,
    kf(t, [
      [0, -1.80], [0.05, -1.82], [0.10, -1.00], [0.16, -0.46], [0.22, -0.24], [0.26, -0.34],
      [0.31, -0.70], [0.35, -0.52], [0.39, -0.06], [0.42, DOWNED.arm[0]],
    ]),
    kf(t, [
      [0, -1.20], [0.05, -1.22], [0.10, -0.86], [0.16, -0.90], [0.22, -0.88], [0.26, -0.62],
      [0.31, -0.30], [0.35, -0.26], [0.39, 0.40], [0.42, DOWNED.arm[1]],
    ]),
    kf(t, [
      [0, -0.25], [0.05, -0.28], [0.10, -1.05], [0.16, -1.10], [0.22, -1.02], [0.26, -1.25],
      [0.31, -1.78], [0.35, -1.86], [0.39, -1.24], [0.42, DOWNED.arm[2]],
    ]), e, 0);

  // ---- the legs: splayed wide and whipped forward at the impact, DANGLE on the slide (a limp
  // body on a wall has no footing to push against), then splay closed and settle as it crumples —
  // and are left exactly on `DOWNED` for the roll to draw under the body from.
  poseLegAngles(bones, LK,
    kf(t, [
      [0, -0.30], [0.05, -0.30], [0.10, 0.02], [0.16, 0.18], [0.22, 0.24], [0.28, DOWNED.legL[0]],
      [0.42, DOWNED.legL[0]],
    ]),
    kf(t, [
      [0, 0.55], [0.05, 0.56], [0.10, 0.36], [0.16, 0.22], [0.22, 0.12], [0.28, DOWNED.legL[1]],
      [0.42, DOWNED.legL[1]],
    ]),
    kf(t, [[0, 0.10], [0.10, 0.02], [0.22, -0.06], [0.34, DOWNED.legL[2]], [0.42, DOWNED.legL[2]]]),
    kf(t, [[0, 0.60], [0.05, 0.60], [0.12, 0.48], [0.20, 0.40], [0.28, DOWNED.legL[3]], [0.42, DOWNED.legL[3]]]), e);
  poseLegAngles(bones, RK,
    kf(t, [
      [0, -0.18], [0.05, -0.18], [0.10, 0.10], [0.16, 0.04], [0.22, -0.02], [0.28, DOWNED.legR[0]],
      [0.42, DOWNED.legR[0]],
    ]),
    kf(t, [
      [0, 0.70], [0.05, 0.72], [0.10, 0.55], [0.16, 0.62], [0.22, 0.68], [0.28, DOWNED.legR[1]],
      [0.42, DOWNED.legR[1]],
    ]),
    kf(t, [[0, 0.08], [0.10, 0], [0.22, -0.08], [0.34, DOWNED.legR[2]], [0.42, DOWNED.legR[2]]]),
    kf(t, [[0, 0.50], [0.05, 0.50], [0.12, 0.34], [0.20, 0.24], [0.28, DOWNED.legR[3]], [0.42, DOWNED.legR[3]]]), e);
  // Fists clenched at the impact, slack on the slide, a light grip through the daze — and the same
  // tightness the roll's own `t = 0` opens on, so the seam costs nothing.
  poseGrip(bones, kf(t, [
    [0, 0.92], [0.05, 0.92], [0.14, 0.35], [0.24, 0.16], [0.30, 0.26], [0.36, 0.20], [0.42, 0.15],
  ]), e);
}
// ---------------------------------------------------------------------------
// THE PUSHBACK — the FRONT LUNGE's own reaction (see the `pushback` branch in `enemies.js`'s
// `hit`, and `HURT_BODY.pushback` there).
//
// The user's brief: *"it forces the dummy to do a pushback ... the enemy does a quick backflip then
// supports him self with 2 hands on the ground then getting up all this is done within 0.75
// seconds its doesnt count as a ragdoll btw"*. The whole-rig angle does the flipping — one
// monotone backwards turn, authored in enemies.js — so this is only the BODY, and its `t` is the
// same clock (`hurtT / E.PUSH_T`), so a key here and a key there land on the same frame:
//
//   t 0.00-0.10  THE HIT     the recoil: the arms fly up and out, the trunk snaps back off the
//                            lunge, the knees give a little — a body taking one on the chest;
//   t 0.10-0.40  THE FLIP    the tuck: knees to the chest, shins folded under them, arms wrapped
//                            in and the trunk curled round them, which is what carries the turn;
//   t 0.40-0.72  THE HANDS   the two-hand support the user asked for, and the plant is solved
//                            rather than posed: the arms STRAIGHTEN OVERHEAD (see the arm note
//                            below) so that the fists are the body's lowest vertices, and the deck
//                            solve in `enemies.js` then rests the whole body on the PALMS with the
//                            crown 0.2-0.5 clear above them. The trunk unfolds to hold the body up
//                            and the legs stay straight up in the air — measured, this window is a
//                            clean upside-down handstand on two hands, hips ~1.2 high;
//   t 0.72-1.00  THE RISE    the legs fold forward through the pike (the handspring's own "legs
//                            whip over" beat) and come down in front, the hands leave the deck and
//                            everything straightens, ending exactly on `REST` (the idle's own
//                            shape) so the handover out of the reaction costs nothing.
//
// Both ends are handovers, exactly like the wall slam's: it STARTS on `REST` — a body standing
// square, which is where the lunge caught it — and ENDS there.
function poseHurtPushback(bones, t, e) {
  // ---- the hips: down into the recoil, up through the turn (a tucked body's pelvis is the
  // thing that goes over), then back under the body as the feet come down.
  poseHipY(bones, kf(t, [
    [0, REST.hip], [0.10, 0.86], [0.26, 0.48], [0.46, 0.54], [0.62, 0.66], [0.80, 0.90], [1, REST.hip],
  ]), e);
  poseRot(bones, "hips", "x", kf(t, [
    [0, 0], [0.10, 0.26], [0.26, -0.32], [0.46, -0.28], [0.62, -0.10], [0.80, 0.24], [1, 0],
  ]), e);
  poseRot(bones, "hips", "y", kf(t, [
    [0, 0], [0.24, 0.16], [0.60, -0.10], [1, 0],
  ]), e);
  poseRot(bones, "hips", "z", 0, e);
  // ---- the trunk: arched back on the hit, curled hard for the turn, folded over the arms at the
  // hands, and back to the idle's own small lean.
  poseRot(bones, "torso", "x", kf(t, [
    [0, REST.torsoX], [0.10, -0.32], [0.26, 0.72], [0.42, 0.34], [0.56, 0.10], [0.72, 0.20], [0.88, 0.10], [1, REST.torsoX],
  ]), e);
  poseRot(bones, "torso", "y", kf(t, [
    [0, 0], [0.30, -0.12], [0.62, 0.10], [1, 0],
  ]), e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  // ---- the head: thrown back on the hit, tucked on the way over (a flipping body's head is the
  // last thing to come out of it), then up as he rises.
  poseRot(bones, "head", "x", kf(t, [
    [0, 0], [0.10, 0.34], [0.26, -0.30], [0.42, -0.16], [0.58, -0.06], [0.76, 0.28], [1, REST.headX],
  ]), e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  // ---- the arms. Up and out on the hit, wrapped in through the turn, then STRAIGHTENED OVERHEAD
  // for the hands beat — and "overhead" is the whole trick: `upX` is measured in the BODY's own
  // frame, and by the time of the plant the body is inverted, so an arm held straight up along the
  // body points straight DOWN at the deck. Measured (see the plant note above), with `upX` at -3.0
  // the fists are the body's lowest vertices from t 0.42 through 0.66, with the crown a clear 0.35
  // above them — which is exactly what makes the deck solve in `enemies.js` rest the body on the
  // PALMS instead of on its feet or its head.
  for (const side of [LK, RK]) {
    poseArmAngles(bones, side,
      kf(t, [
        [0, REST.arm[0]], [0.10, -1.30], [0.26, -1.15], [0.38, -2.55], [0.48, -3.00], [0.62, -3.00],
        [0.74, -2.20], [0.86, -1.10], [1, REST.arm[0]],
      ]),
      kf(t, [
        [0, REST.arm[1]], [0.10, 0.95], [0.26, 0.35], [0.38, 0.30], [0.62, 0.22], [0.80, 0.42], [1, REST.arm[1]],
      ]),
      kf(t, [
        [0, REST.arm[2]], [0.10, -0.70], [0.26, -2.20], [0.38, -0.45], [0.48, -0.08], [0.62, -0.02],
        [0.72, -0.40], [0.84, -1.00], [1, REST.arm[2]],
      ]), e, 0);
  }
  // ...and the palms stay OPEN to take the deck (see the note on `poseGrip`), rather than balled
  // into the climb's fists, all the way through the plant.
  poseGrip(bones, kf(t, [
    [0, 0.30], [0.14, 0.80], [0.50, 0.30], [0.70, 0.25], [0.86, 0.40], [1, 0.30],
  ]), e);
  // ---- the legs. Tucked hard for the turn (knees to the chest, the shins folded under them),
  // thrown down and out as the body comes out of it, then under the body for the rise. The two
  // sides are a whisker apart, because two identical limbs read as one rigid part (the same note
  // `FALLEN` carries).
  poseLegAngles(bones, LK,
    kf(t, [
      [0, REST.legL[0]], [0.10, 0.12], [0.26, -1.40], [0.40, -1.00], [0.52, -0.48], [0.64, -0.30],
      [0.72, -0.62], [0.80, -1.28], [0.86, -0.95], [0.92, -0.38], [1, REST.legL[0]],
    ]),
    kf(t, [
      [0, REST.legL[1]], [0.10, 0.30], [0.26, 1.52], [0.40, 0.98], [0.52, 0.36], [0.64, 0.18],
      [0.72, 0.28], [0.80, 0.62], [0.86, 0.45], [0.92, 0.22], [1, REST.legL[1]],
    ]),
    kf(t, [[0, REST.legL[2]], [0.26, -0.20], [0.56, 0.06], [0.80, 0.10], [1, REST.legL[2]]]),
    kf(t, [[0, REST.legL[3]], [0.26, 0.05], [1, REST.legL[3]]]), e);
  poseLegAngles(bones, RK,
    kf(t, [
      [0, REST.legR[0]], [0.10, 0.12], [0.26, -1.28], [0.40, -0.88], [0.52, -0.40], [0.64, -0.22],
      [0.72, -0.54], [0.80, -1.18], [0.86, -0.86], [0.92, -0.32], [1, REST.legR[0]],
    ]),
    kf(t, [
      [0, REST.legR[1]], [0.10, 0.30], [0.26, 1.40], [0.40, 0.86], [0.52, 0.30], [0.64, 0.14],
      [0.72, 0.24], [0.80, 0.55], [0.86, 0.38], [0.92, 0.18], [1, REST.legR[1]],
    ]),
    kf(t, [[0, REST.legR[2]], [0.26, -0.16], [0.56, 0.05], [0.80, 0.08], [1, REST.legR[2]]]),
    kf(t, [[0, REST.legR[3]], [0.26, 0.04], [1, REST.legR[3]]]), e);
}

// ---------------------------------------------------------------------------
// THE LIE OVERLAY — how a body that has settled onto a SIDE holds its limbs.
//
// Every shape above assumes the body is FLAT: `DOWNED` (like `FALLEN` and the rest of the
// sprawls) puts the arms out along the body's own left-right axis and splays the legs, which is
// correct while that axis is horizontal — as it is on the back and on the front. A quarter turn
// of roll (see `LIE` in enemies.js) stands that axis on END, and the sprawl comes up with it:
// measured, the body's spine was left a metre above the deck with the whole thing propped on one
// outstretched hand, because the arm span had become a vertical 1.6 m and the ground solve (which
// may only ever LIFT, see `groundOn`) had to hoist the body clear of a hand that was under the
// pavement. It is the same body in the same pose — only the width that is wrong.
//
// So a side lie FOLDS the ones that stick up: the arms come in and down (a quarter-turned body's
// forward is horizontal, so an arm swung that way lies on the pavement in front of the chest or
// draped across it, which is what a body on its side actually does) and the legs are brought
// together onto each other. The fold is weighted by how far INTO the roll the body is, which is
// what keeps a body that is still ON ITS BACK — and one that is rolling back onto it to get up —
// completely untouched: `down` is which local axis points at the deck (see `poseLie`), and the
// weight is |roll| over the lie's own quarter turn, so the limbs come in AS the body rolls rather
// than after it. (Every channel is a weighted pull on the bone's CURRENT value, never a restate of
// the pose's own number, so at weight 0 the overlay is not there at all — which is what lets it
// ride over the get-ups without fighting the shape they are carrying.)
//
// `down` is +1 when the deck is on the rig's own +X and -1 when it is on the -X (the roll's sign
// says which — see the `LIE` table in enemies.js). Measured on the rig: the LEFT arm's shoulder
// sits at -X, so `down > 0` means the RIGHT arm is the one against the deck.
//
// The numbers are from a SWEEP of the two arms' `upZ` over the settled, ground-solved body (the
// rig's own arm bones only give the joint positions, so the result has to be read off the mesh
// and the solve has to be live — measuring the two arms independently is wrong in both
// directions, because whichever arm is buried is what decides how high the body sits):
//
//   * the arm ON the deck only has to stop standing the body up on its hand — `upZ` 0, i.e. left
//     where the rest puts it, swinging along the body — and the elbow lowest (0.12 over the deck
//     against the sprawl's 0.52) at exactly that value;
//   * the arm OFF the deck is the whole problem: the sprawl has it 1.5 m up, and it wants the
//     full swing down and across to drape over the body, which it reaches at 1.2 of raw bone
//     rotation (0.44 over the deck at the elbow, from 1.5). That is `1.5` here, since
//     `poseArmAngles` scales what it is handed by POSEX.
//
// The two are NOT mirrored, and the sign is not either: `poseArmAngles` mirrors what it is handed
// by the arm it is given (`side * upZ`) and 1 is its RIGHT arm, -1 its LEFT, so the arm off the
// deck takes the SAME negative number whichever arm it happens to be, and the one on the deck
// takes the same zero. (That is also how the sprawl above reads: one positive number for both
// arms is the symmetric spread, and the sign is what makes a swing asymmetric.)
const LIE_ARM = [0.34, -1.5, 0, -0.55, 0.4];   // upX, upZ (arm off the deck), upZ (arm on it), elbow, leg

// ...and the LEGS. Closing their splay puts them in one line down the body, which is right as far
// as it goes, but the rig stands them a quarter of a metre apart across the pelvis, and a quarter
// of a metre across a side-lying body is a quarter of a metre UP: measured with the splay simply
// closed, the far leg's lowest was left 0.47 over the deck (and its foot 0.66) against the near
// one's 0.18. So the leg OFF the deck is swung back down onto the other one — the same magnitude
// with the sign MIRRORED between the two legs, which is the symmetric spread's own convention
// (`poseArmAngles` applies that mirror for the arms above, but these are written straight onto the
// bone). A sweep of it lands the two legs on each other at 0.4, with the body's own 0.51 of spine
// and 0.1 of torso untouched; 0.6 has the near foot start taking the weight and lifting the whole
// body, which is the limit. (This is a raw bone rotation, not a `poseLegAngles` argument: that
// function sets the whole leg, and the overlay has to leave the shape's own knees and thighs
// alone.)
function poseLie(bones, down, w) {
  const e = Math.max(0, Math.min(1, w));
  if (e <= 0.0001) return;
  const A = LIE_ARM;
  const upL = down > 0;      // the deck is on the rig's +X, which is the RIGHT arm's side
  poseArmAngles(bones, -1, A[0], upL ? A[1] : A[2], A[3], e, 0);   // the left arm
  poseArmAngles(bones, 1, A[0], upL ? A[2] : A[1], A[3], e, 0);    // the right arm
  const zL = upL ? A[4] : 0;
  const zR = upL ? 0 : -A[4];
  bones.legUpperL.rotation.z += (zL - bones.legUpperL.rotation.z) * e;
  bones.legUpperR.rotation.z += (zR - bones.legUpperR.rotation.z) * e;
}

// ---------------------------------------------------------------------------
// SET UP DAZED (see `Enemy.dizzy` and the player's `grabLift`).
//
// The user's *"when he stands on his feet he does a cartoony dizzy animtion and a ring of starts
// spin over his head"*, and the cartoon is the whole brief: this is the ONE shape in the game that
// is allowed to be funny. A body that has just been hauled up off the pavement by the shoulders
// and set on its feet is not folded over a knee and not reeling off a punch — it is STANDING THERE
// with its lights on the blink, and the read is the one every cartoon has used since the 1930s:
//
//   * the whole body SWAYS in a slow circle — the hips' yaw and the trunk's lean are sines a
//     quarter-cycle apart, so the head traces an ELLIPSE rather than a line;
//   * the HEAD LOLLS, a beat behind the trunk and out of phase with it on both axes, so it rolls
//     round the shoulders instead of pointing anywhere;
//   * the KNEES are soft and the body sits under standing height for the whole state, which is
//     what stops a reeling body reading as a body that is merely standing;
//   * the ARMS hang LIMP and swing a beat behind the sway, with slack elbows — pendulums, not a
//     pose.
//
// `t` is the state's own clock (0..1 across `E.DIZZY_T`), so the frequency is authored as a number
// of CIRCUITS rather than as a rate. The feet are SOLVED onto the deck (`poseLegIK`) rather than
// angled, so the sway cannot walk him across the pavement — a dizzy man's feet stay where they are.
const DAZE_CYC = 2.3;      // whole circular sways across the state (a circuit every ~1.1 s)
function poseHurtDizzy(bones, t, e) {
  const R = (v) => v / POSEX;
  // The three clocks: the sway itself, and the head and the arms, each a beat behind it.
  const a = t * Math.PI * 2 * DAZE_CYC;
  const b = a - 0.75;
  const c = a - 1.25;
  const sink = kf(t, [[0, 0.0], [0.12, 0.06], [0.84, 0.06], [1, 0.0]]);
  const hip = HIP_Y - sink;
  poseHipY(bones, hip, e);
  poseRot(bones, "hips", "x", R(Math.sin(a * 0.5) * 0.05), e);
  poseRot(bones, "hips", "y", R(Math.sin(a) * 0.20), e);
  poseRot(bones, "hips", "z", 0, e);
  poseRot(bones, "torso", "x", R(0.10 + Math.cos(a) * 0.10), e);
  poseRot(bones, "torso", "y", R(Math.sin(a) * 0.22), e);
  poseRot(bones, "torso", "z", R(Math.sin(a * 0.9 + 1.9) * 0.10), e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", R(0.16 + Math.sin(b * 1.15) * 0.24), e);
  poseRot(bones, "head", "y", R(Math.sin(b * 0.9 + 0.4) * 0.34), e);
  poseRot(bones, "head", "z", R(Math.cos(b) * 0.30), e);
  // The legs: soft and splayed, SOLVED onto the deck so the feet stay planted under a swaying body.
  const splay = 0.20 + Math.sin(a * 0.5) * 0.04;
  poseLegIK(bones, RK, ANKLE_Z + 0.05, ankleForSole(0) - hip, splay, e);
  poseLegIK(bones, LK, ANKLE_Z - 0.05, ankleForSole(0) - hip, splay * 1.1, e);
  // ...and the arms hang loose and swing a beat behind the body, elbows slack.
  const swing = Math.sin(c) * 0.30;
  const out = Math.cos(c * 0.8) * 0.10;
  const slack = -0.28 - Math.abs(swing) * 0.30;
  poseArmAngles(bones, RK, -0.20 + swing, 0.34 + out, slack, e);
  poseArmAngles(bones, LK, -0.20 - swing, 0.34 - out, slack, e);
  poseGrip(bones, 0.22, e);
}

// ---------------------------------------------------------------------------
// THE WALL CLINCH — the VICTIM's shape (see "THE WALL CLINCH" in README.md, `Enemy.headPin` and
// `player.startWallBeat`).
//
// THE WALL CLINCH's VICTIM, and this shape was RE-AUTHORED in session 121 — read the note at the
// top of `poseWallBeat` for why (short version: he used to be doubled over the stone, facing it,
// with his hips presented to the man behind him).
//
// What he is NOW is the shape the brief always meant: a body standing with its BACK on the wall,
// squared on the man who has it by the back of the skull, chin driven up, belly open — and folding
// forward around every knee that lands in it. The player has the skull pinned, so the head is not
// the body's any more: `enemies.js` solves it onto the wall every frame from the rig's own MEASURED
// head (`headPoint`), so nothing here reaches for it. What is left for the pose is what the rest of
// the body does while its head is owned.
//
// ONE THING THIS SHAPE IS NOT ALLOWED TO DO, and it is why the numbers below look the way they do:
//
//   * it may not carry the body's WEIGHT. `Enemy.update` stands a pinned body on the deck the move
//     started on (see the `wallpin` case there), so the feet are a fact and the head's height is
//     whatever this shape's own span is — the shape decides how TALL the victim stands, and the
//     `headPin.y` he is walked in on is nominal. That is why the legs below are nearly straight:
//     this pose is the whole of the victim's height, and the old one (crouched, `legKn` 0.94, hip
//     0.80) is what made him a head shorter than the man holding him.
//
// `t` is the MOVE's own hold clock (`headPin.u`: 0 at the smash, 1 at the last knee) and `jolt` is
// the compression of a gut taking a knee. The compression is what makes the flurry read as landing
// on the BODY rather than beside it, so it is deliberately fast — it is written on the impact frame
// and unwinds in a few — and it deepens as `t` runs, because the beats keep coming.
// ...and the grab's own live target: where the skull IS on the body, in the body's own frame — the
// point the two arms are solved at (see `poseHurtWallPin`). One scratch, because both hands are
// aimed off the same point.
const _wpBrace = new THREE.Vector3();
// ...and where the victim's hands go, in that same frame: out to either side of his own skull by
// `WALLPIN_GRAB_SIDE`, down from it by `WALLPIN_GRAB_DOWN` and forward by `WALLPIN_GRAB_FWD` — and
// FORWARD here is the MAN, because the body's own forward is the half turn away from the stone (see
// `headPin.yaw` in `player.js`). So the two hands come up and in onto the forearms that have his
// head, which is what a held body's hands do, and it is also what tells the eye which way he faces.
const WALLPIN_GRAB_SIDE = 0.28;
const WALLPIN_GRAB_DOWN = 0.30;
const WALLPIN_GRAB_FWD = 0.26;

function poseHurtWallPin(bones, t, e, spin, jolt) {
  const J = Math.max(0, Math.min(1, jolt || 0));
  // Being held is not being still: a body pinned by the skull and worked over writhes under the
  // hands, and a body that is dead still reads as a prop rather than as a person.
  const strain = Math.sin(t * 23) * 0.05;
  const fold = J * (0.20 + 0.10 * t);

  // Standing tall with the stone at his back: the trunk only ever leans FORWARD as the impact of a
  // knee, so between beats the axis is upright and slightly opened (`torX` just under 0) and the
  // belly is the part of him facing the man. The chin is held UP (`hdX` negative) because the grip
  // is on the back of the skull and the neck is the only thing with any give in it.
  const hip = 0.99 - 0.02 * J;
  const torX = -0.05 + fold;
  const hdX = -0.14 + 0.08 * J;
  const legTh = -0.04 - 0.06 * J;
  const legKn = 0.14 + 0.34 * J;
  const legSol = 0.08;
  const legSp = 0.24;

  poseHipY(bones, hip - 0.03 * J + strain * 0.04, e);
  poseRot(bones, "hips", "x", 0.06 + 0.04 * J, e);
  poseRot(bones, "hips", "y", 0.06 + strain * 0.45, e);
  poseRot(bones, "hips", "z", 0, e);
  // The trunk: the one channel the knee's own beat is written on. A gut shot is the body folding
  // forward around the knee that put it there, so the fold is the whole of this channel between
  // standing and folded, and everything else here is a hair of sway under the grip.
  poseRot(bones, "torso", "x", torX, e);
  poseRot(bones, "torso", "y", 0.06 + strain, e);
  poseRot(bones, "torso", "z", -0.06 - 0.05 * J, e);
  poseSettleTorso(bones, e);
  // The head is the one part that is NOT free — the placement owns where it IS — so this only says
  // what the neck is doing under the grip: the chin driven up the stone (the skull is held back), and
  // a shake on every beat (the impact goes through it).
  poseRot(bones, "head", "x", hdX, e);
  poseRot(bones, "head", "y", strain * 1.4, e);
  poseRot(bones, "head", "z", strain * 0.6, e);
  // The arms: up and IN at the man holding him, closed on the forearms that have his skull. SOLVED
  // rather than authored (the same two-bone reach the attacker's own hands and the clinch's use),
  // because the head's own place on the body moves with every channel above it and a table of angles
  // could not track it. The target is read off the bones this frame's pose has ALREADY written: walk
  // the head's offset up the trunk (turned by the torso, then by the hips) and it is a point in this
  // frame like any other.
  _wpBrace.copy(bones.head.position);
  _wpBrace.applyQuaternion(bones.torso.quaternion);
  _wpBrace.applyQuaternion(bones.hips.quaternion);
  _wpBrace.add(bones.hips.position);
  for (const side of [LK, RK]) {
    poseArmReach(bones, side, e,
      _wpBrace.x + (side < 0 ? -WALLPIN_GRAB_SIDE : WALLPIN_GRAB_SIDE),
      _wpBrace.y - WALLPIN_GRAB_DOWN - 0.06 * J,
      _wpBrace.z + WALLPIN_GRAB_FWD, ARM_REACH);
  }
  poseGrip(bones, 0.75, e);
  // The legs: under him and nearly straight, because the deck under them is a fact (see the note
  // above) and this shape is the whole of his height. The knees bend with the impact and settle
  // back, and the feet are set apart — he is being held UP on them rather than standing on them.
  for (const side of [LK, RK]) {
    const beat = (side < 0 ? 0.10 : -0.10) * strain;
    poseLegAngles(bones, side,
      legTh + beat,
      legKn + 0.10 * J,
      legSol,
      legSp, e);
  }
}

// ---------------------------------------------------------------------------
// THE HEAD SCISSOR's VICTIM (see "2 — THE HEAD SCISSOR" in README.md, `player.scissorGrip` and the
// `headPin`/`wallpin` machinery it borrows from the wall clinch).
//
// This is the WALL CLINCH's victim one verb over. `enemies.js` solves the skull onto the point the
// move holds it at, so the head is not the body's any more and nothing here reaches for it — what
// is left for the pose is what the rest of the body does while it hangs off a neck that is owned.
//
// THE ONE THING THAT SHAPES EVERY NUMBER BELOW is that this body is OFF ITS FEET. The wall pin's
// victim is stood on the deck by the solve in `Enemy.update`, so its legs are a fact and the shape
// only decides how tall he is; here the solve is SKIPPED (`headPin.hang`), so the shape IS the
// body's whole arrangement in the world — and because the rig is laid back by the pin's own pitch
// (`SCISSOR_HANG_PITCH`), the limbs have to hang in WORLD space rather than in the rig's. Measured
// off the rig rather than reasoned: at that pitch the rig's own FORWARD axis `(0,0,1)` lands on
// world `(0, +0.909, +0.418)` — straight up — so the rig's own BACKWARD is world DOWN. That is the
// whole of why the arms and the thighs below swing BACKWARD to `DANGLE` instead of staying at their
// rest angles: a limp limb left pointing down the rig's own -Y stands straight out sideways on a
// body lying on its back, and one swung forward sticks up at the sky. This was measured the wrong
// way round first: written forward, the victim's feet came out 0.43 u ABOVE its own hips (`eFeet`
// 1.96 against `eHip` 1.53 through the live loop) — a body held by the neck doing a pike.
//
// `t` is the hold's own clock (`headPin.u`: 0 on the bite frame, 1 by the throw) and the whole
// shape is the ARRIVAL OF THE WEIGHT onto the neck over it — at 0 the body is still the shape it
// was caught in (standing, which is also where the pin's own place puts it: the contact is its own
// neck height, so the handover is continuous), and by 1 it is hanging limp. `jolt` is the
// compression of the catch itself, written in the first tenth of a second of the hold: the drop of
// a body's weight onto a clamped neck.
function poseHurtScissor(bones, t, e, spin, jolt) {
  const J = Math.max(0, Math.min(1, jolt || 0));
  const s = spin || 0;
  const hang = kf(t, [[0, 0], [0.45, 0.85], [1, 1]]);
  // The swing that puts a limb on WORLD-DOWN at the pin's own lean (`SCISSOR_HANG_PITCH`, 1.35 rad):
  // the two helpers put POSEX on the way in, so the bone sees exactly 1.35 and the rig's lean
  // cancels it. This is the number the whole shape hangs on — a limb left at its rest angle stands
  // straight out of a body laid on its back, which is the one thing a limp limb never does.
  const DANGLE = 1.35 / POSEX;
  // ...and the WRITHE: a body held up by the neck is not a prop, and a shape that arrives and
  // freezes reads as one (the same note `poseHurtWallPin` makes). This reaction is the one hold in
  // the game whose body is NOT tumbling, so `s` is zero throughout and the oscillation runs on the
  // hold's own clock instead — a dying one, scaled by `hang`, so it belongs to the hanging body.
  const sway = Math.sin(t * 14) * 0.06 * hang + Math.sin(s) * 0.08;
  const sag = J * 0.05;
  // The neck is the only thing taking the load, so the hips are pulled up under the grip a whisker
  // and compressed by the catch: the body hangs straighter than it stands, and the catch gives it
  // the one downward beat.
  poseHipY(bones, 1.00 - 0.02 * hang - sag, e);
  poseRot(bones, "hips", "x", 0.04 * hang, e);
  poseRot(bones, "hips", "y", 0.06 * hang + sway, e);
  poseRot(bones, "hips", "z", 0, e);
  // The trunk stays nearly STRAIGHT — a body slung by the neck is not doubled over, and more than
  // about a tenth of a radian here costs the read directly: this channel and the rig's own lean ADD,
  // and the whole-rig number was chosen against a measured 0.43 rad of trunk curl (see
  // `SCISSOR_HANG_PITCH`). Only the catch folds it the rest of the way, for a few frames.
  poseRot(bones, "torso", "x", 0.05 + 0.10 * hang + 0.06 * J, e);
  poseRot(bones, "torso", "y", 0.06 * hang + sway, e);
  poseRot(bones, "torso", "z", -0.06 * hang, e);
  poseSettleTorso(bones, e);
  // The head is the one part that is NOT the body's any more — the placement owns where it IS — so
  // this only says what the neck is doing under the clamp: the chin driven down and lolling, and a
  // shake on the catch (the impact of the legs shutting goes through it).
  poseRot(bones, "head", "x", 0.24 * hang - 0.10 * J, e);
  poseRot(bones, "head", "y", sway * 1.6, e);
  poseRot(bones, "head", "z", sway * 1.2, e);
  // The limbs: slack, swung to `DANGLE` (dead down in the world), and trailing the writhe a beat
  // wide of each other so the two sides never read as one rigid part.
  for (const side of [LK, RK]) {
    const m = side < 0 ? 1 : -1;
    poseArmAngles(bones, side,
      -0.35 + (0.35 + DANGLE) * hang + 0.24 * sway * m,
      0.30 + 0.10 * hang + 0.10 * sway,
      -1.30 + 0.95 * hang + 0.12 * sway * m, e, 0);
    poseLegAngles(bones, side,
      0.02 + (DANGLE - 0.02) * hang + 0.18 * sway * m,
      0.10 + 0.42 * hang - 0.10 * J,
      0.10 * hang,
      0.06 + 0.10 * hang, e);
  }
  poseGrip(bones, 0.22, e);
}

const HURTS = {
  fold: poseHurtFold,
  chestHold: poseHurtChestHold,
  ankleHold: poseHurtAnkleHold,
  clinch: poseHurtClinch,
  trip: poseHurtTrip,
  sweep: poseHurtSweep,
  flight: poseHurtFlight,
  launch: poseHurtLaunch,
  flip: poseHurtFlip,
  upper: poseHurtUpper,
  down: poseHurtDown,
  getup: poseHurtGetup,
  getupKip: poseHurtGetupKip,
  getupRoll: poseHurtGetupRoll,
  getupSit: poseHurtGetupSit,
  whirlDrag: poseHurtWhirlDrag,
  clinchRoll: poseHurtClinchRoll,
  wallslam: poseHurtWallSlam,
  pushback: poseHurtPushback,
  dizzy: poseHurtDizzy,
  wallpin: poseHurtWallPin,
  scissor: poseHurtScissor,
};

// `spin` is the ragdoll's own tumble angle in radians (enemies.js hands it over only for a body
// that is actually tumbling), and it is the ONLY clock any of these shapes swings on: with no
// spin every key below is exactly what it always was, so a non-ragdoll reaction — and the
// player's own hurt poses — are untouched.
//
// `jolt` is the same kind of hand-over for THE WALL CLINCH (see `poseHurtWallPin`): the pulse of a
// body taking a knee in the gut, written by `player.js` on the pin and decaying between the beats.
// It is zero for every other reaction, so nothing else in the file can see it.
function poseHurt(bones, u, kind, t, spin, jolt) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const f = HURTS[kind] || HURTS.fold;
  f(bones, Math.max(0, Math.min(1, t)), e, spin || 0, jolt || 0);
}

// ---------------------------------------------------------------------------
// LANDING ABSORB — one shot, unwinding over the landing's own timer and scaled
// by how hard the drop was (`power`, the player's landImpact). A soft landing is
// barely a dip; a real plunge folds him onto his heels with both arms thrown out
// for balance and the knees taking all of it.
// ---------------------------------------------------------------------------

function poseLand(bones, u, power) {
  const e = poseEase(u);
  if (e <= 0.0001) return;
  const A = Math.max(0, Math.min(1, power || 0));
  const hipTarget = HIP_Y - (0.14 + 0.26 * A);
  const hip = bones.hips.position.y + (hipTarget - bones.hips.position.y) * e;
  bones.hips.position.y = hip;
  poseRot(bones, "hips", "y", 0, e);
  poseRot(bones, "hips", "z", 0, e);
  const flat = ankleForSole(0);
  poseLegIK(bones, -1, ANKLE_Z, flat - hip, 0.30, e);
  poseLegIK(bones, 1, ANKLE_Z + 0.05 * A, flat - hip, 0.34, e);
  poseRot(bones, "torso", "x", 0.10 + 0.30 * A, e);
  poseRot(bones, "torso", "y", 0, e);
  poseRot(bones, "torso", "z", 0, e);
  poseSettleTorso(bones, e);
  poseRot(bones, "head", "x", -0.26 * A, e);
  poseRot(bones, "head", "y", 0, e);
  poseRot(bones, "head", "z", 0, e);
  poseArmAngles(bones, -1, 0.30 + 0.35 * A, 0.20 + 0.95 * A, -0.25 - 1.15 * A, e);
  poseArmAngles(bones, 1, 0.30 + 0.35 * A, 0.20 + 0.95 * A, -0.25 - 1.15 * A, e);
  poseGrip(bones, 0.5, e);
}

// Place one leg by IK from an ankle target, planting whichever edge of the sole is
// lowest exactly on the ground. Used by the poses that must not let a foot float.
function poseLegIK(bones, side, z, yAnkleRelHip, splay, e) {
  const U = side < 0 ? bones.legUpperL : bones.legUpperR;
  const L = side < 0 ? bones.legLowerL : bones.legLowerR;
  const F = side < 0 ? bones.footL : bones.footR;
  const ik = legIK(z, yAnkleRelHip);
  U.rotation.x += (ik.thigh - U.rotation.x) * e;
  U.rotation.z += (side * splay - U.rotation.z) * e;
  L.rotation.x += (ik.knee - L.rotation.x) * e;
  F.rotation.x += (0 - ik.thigh - ik.knee - F.rotation.x) * e;
  F.rotation.z += (0 - F.rotation.z) * e;
}

// `poseLegIK` with the target actually HIT — the scissor's clamp is the one caller that needs it.
//
// `legIK` solves the ankle in the sagittal plane and `poseLegIK` then rolls the solved leg out of
// that plane by `splay` (about the bone's own z) — and rolling a folded leg out of its own plane
// scales its reach IN that plane. Measured off the live rig: at the clamp's 0.46 of splay the
// ankle lands 0.11 units short of and above the target it was asked for, and the miss grows with
// the splay. That is harmless everywhere the foot is being planted on a deck, but it is fatal
// here, because in the scissor's clamp the ankle target IS the contact the whole body is placed by
// (`player.scissorAnchor`) — an ankle 0.11 off its target is the legs 0.11 off the neck, which is
// exactly why the move read as a somersault with the legs sweeping past the head.
//
// So rather than model that roll, this ASKS `legIK`, MEASURES where the drawn ankle actually
// landed (in the hips' own frame, which is the frame `legIK` answers in), and asks again with the
// error taken out. The error is smooth in the ask, so the correction contracts on the spot —
// measured: 0.110 -> 0.021 -> 0.007 -> 0.002, i.e. under half a millimetre of neck.
//
// Eased calls are handed straight through: a pose that is mid-blend is blended on purpose, and the
// correction is only meaningful once the pose owns the leg outright (which the clamp does).
const _ikOnV = new THREE.Vector3();
function poseLegIKOn(bones, side, z, y, splay, e) {
  if (e < 0.999) { poseLegIK(bones, side, z, y, splay, e); return; }
  const H = bones.hips;
  const F = side < 0 ? bones.footL : bones.footR;
  let zz = z, yy = y;
  for (let i = 0; i < 4; i++) {
    poseLegIK(bones, side, zz, yy, splay, e);
    F.updateWorldMatrix(true, false);
    F.getWorldPosition(_ikOnV);
    H.worldToLocal(_ikOnV);
    const dz = z - _ikOnV.z, dy = y - _ikOnV.y;
    if (dz * dz + dy * dy < 2.5e-7) break;
    zz += dz; yy += dy;
  }
}
