// ---------------------------------------------------------------------------
// THE FONT BUILDER — `glyphs.js` (art) in, a real font file out.
//
//   node-less: it runs in any browser/worker. From the generator page you can rebuild with
//     const m = await import("./src/font/build-font.js");
//     const { ttf, woff, report } = await m.buildAll();
//   and the file it writes can be re-embedded in index.html's @font-face (see "THE FONT" in
//   README.md for the recipe and the current artifact's name).
//
// HOW THE PIXEL ART BECOMES A LOW-POLY FONT
//   1. RASTERIZE each glyph's cells onto a lattice SUB times finer (SUB=5, so one sub-cell is 20
//      units and the geometry has somewhere to put the seam without resampling the art).
//   2. CARVE THE SEAM — a slit SEAM.half units either side of SEAM.yCap (or SEAM.yXh on x-height
//      glyphs), one sub-row thick, running the full width of the glyph. On most glyphs it JOGS: the
//      slit runs low across the left of the letter and SEAM.step higher across the right, so the
//      letters read as split through the middle by a stepped channel — the first face's signature
//      split. Thin-diagonal glyphs would be sliced into crumbs by a step, so they take the straight
//      slit; `pickSeam` keeps whichever cut leaves the letter's biggest piece intact.
//      THE STEP IS NOW SWITCHED OFF: the `CARVE_SEAM` flag in glyphs.js makes `pickSeam` return "no
//      cut", because the second brief's specimen has no keyline — its letters are solid slabs whose
//      only white is the nicked counters, which are drawn in the ART. The step is still here, and
//      one boolean brings it back.
//   3. TRACE the boundary of the carved lattice: every edge between ink and no ink, chained into
//      closed loops (outer loops counter-clockwise, holes automatically clockwise). Corners where
//      two regions pinch are resolved by always taking the sharpest right turn, which is what
//      keeps the loops simple.
//   4. FACET the loops: every corner gets CUT — a 45-degree facet where the corner is convex
//      (SHARP.cut) and a smaller one where it is concave (SHARP.notch). That is the low-poly half of
//      the brief: the silhouette is still a pixel grid, but every right angle in it is now a cut
//      facet, which is what the CYBERFUNK lettering does with its corners and what gives the
//      staircase diagonals their chiselled look.
//
//      Session 107 added the SHARD half of that pass for the user's *"make it look edgy and spiky
//      and sharp and vortex not cuby"*: the cut was allowed to eat half of either edge (so a
//      one-cell feature ENDS IN A POINT), the middle of every convex corner could be pushed OUT as
//      a FANG (`SHARP.spike`), and those fangs could be swept tangentially by `SHARP.sweep`. Those
//      two dials are at 0 for the heavy face — its spikes are drawn INTO the art (wedged diagonals,
//      tapered terminals) and a fang on top of a chisel is a thorn growing out of a chisel — so
//      this pass is now exactly step 4's plain cut facet.
//   5. HAND THE CONTOURS TO opentype.js and write an OpenType (CFF/OTTO) font. Then (optionally)
//      wrap it in a WOFF container — the tables are just zlib-compressed individually, and the
//      browser's own CompressionStream("deflate") emits exactly the zlib stream WOFF asks for.
//
// `report()` returns a per-glyph audit — box and ink extents (ALIGNMENT: a glyph whose `top` puts
// its box on the wrong row of the grid floats off the baseline, which is invisible in a JSON dump
// but glaring on screen, so every letter is checked against the height its class should have), loop
// count, and an AREA CHECK that the traced loops' signed areas sum to the inked lattice cells, and
// a SEAM CHECK that cutting the seam did not raise the number of loose blobs of ink. The build
// asserts on the lot, because a contour tracer that is subtly wrong still returns plausible-looking
// loops, and a seam that cuts a stem in half still returns a plausible-looking glyph.
// ---------------------------------------------------------------------------

import * as opentype from "https://esm.sh/opentype.js@1.3.4";
import { ART, CELL, EM, ASC, DESC, SEAM, CARVE_SEAM, FAMILY, SLANT } from "./glyphs.js";

export const SUB = 5;
export const UNIT = CELL / SUB;
export const SIDE_BEARING = 1;     // cells of side bearing the builder gives every glyph, so that
                                   // letters never touch even at letter-spacing: normal (the ink of
                                   // a glyph fills its cell edge to edge). It MUST be a whole number
                                   // of cells: the advance is `(adv + SIDE_BEARING) * CELL`, so a
                                   // fractional value puts every glyph after the first - and every
                                   // stem inside every glyph - on a fractional pixel at 10px and
                                   // softens the whole line. (Session 94 tried 1.4 to pay for the
                                   // LEAN's wider top and it did exactly that; 1 cell is enough,
                                   // because the lean shifts the TOP of a glyph off its ink box
                                   // edge, which can only widen the gap to the next letter.)
// THE SHARPENING DIALS. They live in a MUTABLE object on purpose: the look of the face is tuned by
// mutating these and re-running `buildAll()` from the console (see "THE FONT" in README.md), which
// costs a third of a second and needs no edit to any file.
export const SHARP = {
  cut: 45,        // units cut off a CONVEX corner of the OUTER silhouette — the face's chisel. The
                  // first face ran this at 50 (half a cell, so two cuts on a one-cell stroke's end
                  // MEET and the stroke ends in a point); this one runs it just under that and
                  // separately from the counters' cut (see `holeCut`), because the specimen is far
                  // more aggressive OUTSIDE than inside: its bowls are octagons whose corners are
                  // taken off in long 45-degree strokes, and its terminals end in wedges. 45 plus the
                  // slope takes 101 units — a whole cell — off each end of a two-cell edge, which is
                  // the wedge the specimen's stroke ends have.
  slope: 0.28,    // the cut also grows with the edge it stands on (cut_i = cut + slope * l_i, still
                  // capped at half that edge), so a long side is eaten deep and the corner reads as
                  // a BLADE rather than a rounded shoulder: with these two dials a six-cell edge (600
                  // units) loses 213 — 2.1 cells — at each end, which is the long diagonal the
                  // specimen takes off the top-left of B, C, D, E, G, P and R, and a two-cell edge
                  // loses the 101 above (capped at half, so the wedge stops exactly at the stroke's
                  // midline). 0 = the cut `cut` units everywhere, a plain 45-degree chisel.
  holeCut: 22,    // ...and this is the cut for the corners of a HOLE (a counter). Why separate: a
                  // cut eats into the white of a counter exactly as far as it eats into the ink
                  // around it, and a heavy face's counters are its scarcest resource. With ONE dial
                  // the choice is between an aggressive silhouette and open counters — at the outer
                  // setting a two-cell counter loses 101 units from each side and closes completely.
                  // Split, the outside keeps its blade and a two-cell counter loses only 22 plus
                  // `holeSlope`'s 24: it keeps 108 of its 200 units, i.e. the one-cell slit the
                  // specimen has, and at 10px (where a cell is exactly one pixel) it is still a
                  // whole pixel of white instead of a fraction of one.
  holeSlope: 0.12,// the counters' own growth, deliberately a third of the silhouette's: a counter's
                  // long edges are only two cells, so the outer slope would eat it from all four
                  // sides at once. At 0 a counter's corners are cut `holeCut` whatever their edges.
  notch: 34,      // ...and off a CONCAVE corner — the silhouette's inner angles (the inside of an
                  // L, the notch between the bars of an E, the crotch of a K or a Y). Cut from the
                  // silhouette side, so these DO take the slope: a long inner edge is chamfered far
                  // enough that the inner angle reads as a fold rather than a square step, which is
                  // how the specimen's L, E and K get their slanted insides.

  // THE FANGS. `spike` pushes the MIDDLE of a convex corner's chamfer OUT along the corner's own
  // bisector; `sweep` rotates that push TANGENTIALLY, the same direction at every corner, which is
  // the difference between a letter that is spiky and one that looks like it is spinning. They were
  // the first face's *"edgy and spiky ... vortex"* (55 / 50). This face is spiky in the ART instead —
  // its diagonals are wedges and its terminals taper — so a fang on top of that would be a thorn
  // growing out of a chisel: at 0 the corner is the plain cut facet, and the specimen's own
  // chiselled look is what the cut produces. The pair is kept as dials (set them and re-run
  // `buildAll()` from the console) for a third pass if the user ever wants the thorns back.
  spike: 0,
  sweep: 0,
  spikeOuter: true, // ...and only on the OUTER silhouette (a hole's convex corner is a corner of a
                    // COUNTER, and a fang there eats into the ink instead of out of it — the letter
                    // stops looking thorny and starts looking chewed). Moot at spike 0.

  // Never touch a corner whose shortest side is under this. One LATTICE edge is UNIT (a fifth of a
  // cell) long, and the only edges that short are the ones a corner-touching diagonal leaves behind;
  // cutting those would shave a diagonal chain thinner than MIN_PIECE and snap it. Every real stroke
  // edge is a whole cell (100 units), so it is always cut.
  edge: 30,

  // THE SMALL GLYPHS' OWN SET. Punctuation and the symbol row are small-featured by nature: a hyphen
  // is two cells of ink with five of white beside it, a full stop is one small block, an arrowhead is
  // a couple of two-cell pieces. The letters' dials would reduce every one of them to a diamond — a
  // cut of 45 plus the slope IS a whole cell on a two-cell edge, which is the whole edge, and a block
  // whose four edges are each exactly consumed comes out as a rhombus (the tracer still finds it, so
  // nothing throws: it just stops looking like a full stop). So a glyph whose class is `sym` (see
  // `KIND`) is faceted with THIS set instead, merged over the one above. The corner is still cut off
  // at 45 degrees — the brief is kept — but at 20 + 0.10·l it is a facet rather than a blade, which
  // is also what the specimen does: its `!`, `.`, `,` and brackets are cut like its letters but they
  // are not *eaten* like them, because a symbol has no long edge to stand a blade on.
  small: { cut: 20, slope: 0.10, holeCut: 16, holeSlope: 0.08, notch: 20 },
};

export const MIN_PIECE = 2;        // sub-cells; the seam may not leave a blob of ink thinner than this

export function parseArt() {
  const blocks = ART.split(/\n\s*\n/).map(b => b.replace(/^\n+/, "").replace(/\n+$/, "")).filter(b => b.trim().length);
  const out = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    const head = lines[0].trim().split(/\s+/);
    const ch = head[0] === "space" ? " " : head[0];
    const adv = +head[1], top = +head[2];
    const rows = lines.slice(1).filter(l => l.trim().length);
    const w = Math.max(adv, ...rows.map(r => r.length));
    out.push({ ch, adv, top, w, rows: rows.map(r => r.padEnd(w, ".")) });
  }
  return out;
}

// ---- 1 + 2: the lattice -----------------------------------------------------
// `seam`: false = leave the glyph whole; "straight" = one slit; "jog" = slit that steps up partway
// across; undefined = whichever of the two does less damage (see pickSeam).
export function lattice(g, seam = "jog") {
  const H = g.rows.length;
  const GH = H * SUB;
  const yTop = g.top * CELL;
  // THE LEAN — stepped in WHOLE CELLS, one step per row of the ART, never per sub-row. (A sub-cell
  // step is 0.2px at 10px / 0.4 at 20 / 0.6 at 30, so a smooth shear lands every stroke's edge on a
  // fractional pixel at every size the game uses, antialiases the whole face and quietly turns a
  // pixel font into an ordinary slanted one — measured: a 1-cell stem came out as `++`, two
  // half-covered pixels and no solid core, at 10px. Whole cells keep every edge on the grid.)
  //
  // `stepOf(h)` is how many whole cells a row `h` CELLS ABOVE THE BASELINE has been pushed right.
  // It is a function of that height alone, not of the glyph, so every glyph shears by the same
  // amount at the same height and the gap between two neighbours is `SIDE_BEARING` at every row,
  // whatever the two letters are. It is clamped at 0 so the rows below the baseline do not lean
  // back the other way (a descender tail is only 2 cells long; a vertical tail under a leaning body
  // reads fine, and letting it swing left would need a per-glyph left padding, which would put the
  // letters on different left bearings).
  //
  // No two neighbouring rows are ever more than ONE cell apart (`Math.round(h*SLANT)` can step by
  // at most 1 as h climbs by 1), which is what keeps a 1-cell stem CONNECTED: rows offset by one
  // cell share an edge, rows offset by two would only share a corner and the stem would come apart
  // into a dotted diagonal.
  const stepOf = (h) => Math.max(0, Math.round(h * SLANT));
  let maxStep = 0;
  for (let r = 0; r < H; r++) maxStep = Math.max(maxStep, stepOf(g.top - 1 - r));
  // The ink leans out to the right of the row sitting on the baseline, so the lattice is widened by
  // the top's own overhang; `X0` is 0 and the advance is left at `adv + SIDE_BEARING`, which means a
  // glyph's top rows overhang its own advance — harmless and deliberate, because the letter beside
  // it overhangs by exactly the same amount at exactly the same heights.
  const X0 = 0;
  const GW = g.w * SUB + maxStep * SUB;
  const on = new Uint8Array(GW * GH);
  for (let r = 0; r < H; r++) {
    const shift = stepOf(g.top - 1 - r) * SUB;
    for (let c = 0; c < g.w; c++) {
      if (g.rows[r][c] !== "#") continue;
      for (let sy = 0; sy < SUB; sy++) {
        const y = r * SUB + sy;
        for (let sx = 0; sx < SUB; sx++) {
          const x = X0 + c * SUB + sx + shift;
          if (x < 0 || x >= GW) continue;
          on[x + y * GW] = 1;
        }
      }
    }
  }
  if (seam) {
    const rowsFor = (lo, hi) => {
      const out = [];
      for (let y = 0; y < GH; y++) {
        const c = yTop - (y + 0.5) * UNIT;
        if (c > lo - 1e-6 && c < hi) out.push(y);
      }
      return out;
    };
    const cy = (/[gjpqy]/.test(g.ch) || /[acemnorsuvwxz]/.test(g.ch)) ? SEAM.yXh : SEAM.yCap;
    const low = rowsFor(cy - SEAM.half, cy + SEAM.half);
    const high = rowsFor(cy + SEAM.step - SEAM.half, cy + SEAM.step + SEAM.half);
    const win = rowsFor(cy - SEAM.half, cy + SEAM.step + SEAM.half);
    const cut = (y, x0, x1) => { for (let x = x0; x < x1; x++) on[x + y * GW] = 0; };
    if (seam === "jog" && high.length) {
      const xm = seamColumn(g, on, GW, GH, win, X0);
      for (const y of low) cut(y, 0, xm);
      for (const y of high) cut(y, xm, GW);
    } else {
      for (const y of low) cut(y, 0, GW);
    }
  }
  return { on, GW, GH, yTop };
}

// Where the slit steps: a column with plenty of ink through the seam window, as close to the middle
// of the glyph as we can get, so the two levels meet somewhere that reads as a deliberate jog.
function seamColumn(g, on, GW, GH, win, x0) {
  const counts = [];
  for (let c = 0; c < g.w; c++) {
    let n = 0;
    for (const y of win) for (let sx = 0; sx < SUB; sx++) n += on[(x0 + c * SUB + sx) + y * GW];
    counts.push(n);
  }
  let sumX = 0, sumN = 0;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (on[x + y * GW]) { sumX += x; sumN++; }
  const cx = sumN ? sumX / sumN : GW / 2;
  const mx = Math.max(...counts);
  let bestC = 0, bestD = Infinity;
  for (let c = 0; c < g.w; c++) {
    if (counts[c] < 0.6 * mx) continue;
    const d = Math.abs(x0 + (c + 0.5) * SUB - cx);
    if (d < bestD) { bestD = d; bestC = c; }
  }
  return Math.round(x0 + (bestC + 0.5) * SUB);
}

// The jog is the more characterful cut (it is what the reference logo does), but its second cut can
// slice the same stroke twice and spray the glyph into extra fragments. So: try both, and keep the
// jog unless it costs the letter pieces. `CARVE_SEAM` (glyphs.js) turns the whole thing off, which is
// what the specimen sheet's solid letters ask for — the seam machinery stays, the cut does not run.
function pickSeam(g) {
  if (!CARVE_SEAM) return false;
  const straight = pieces(lattice(g, "straight"));
  const jog = pieces(lattice(g, "jog"));
  return jog.n <= straight.n + 1 ? "jog" : "straight";
}

// ---- 3: the boundary -------------------------------------------------------
function traceLoops(on, GW, GH) {
  const edges = [];
  const from = new Map();
  const push = (x, y, dx, dy) => {
    const i = edges.length;
    edges.push({ x, y, dx, dy, used: false });
    const k = x + "," + y;
    let a = from.get(k);
    if (!a) from.set(k, a = []);
    a.push(i);
  };
  const at = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH && on[x + y * GW];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    if (!on[x + y * GW]) continue;
    if (!at(x + 1, y)) push(x + 1, y, 0, 1);
    if (!at(x, y + 1)) push(x + 1, y + 1, -1, 0);
    if (!at(x - 1, y)) push(x, y + 1, 0, -1);
    if (!at(x, y - 1)) push(x, y, 1, 0);
  }
  const loops = [];
  for (let s = 0; s < edges.length; s++) {
    if (edges[s].used) continue;
    const loop = [];
    let e = edges[s];
    let guard = 0;
    while (e && !e.used && guard++ < 200000) {
      e.used = true;
      loop.push([e.x, e.y]);
      const cand = from.get((e.x + e.dx) + "," + (e.y + e.dy)) || [];
      let next = null;
      if (cand.length === 1) next = edges[cand[0]].used ? null : edges[cand[0]];
      else {
        let bestAng = Infinity;
        for (const ci of cand) {
          const c = edges[ci];
          if (c.used) continue;
          const ang = Math.atan2(e.dx * c.dy - e.dy * c.dx, e.dx * c.dx + e.dy * c.dy);
          if (ang < bestAng) { bestAng = ang; next = c; }
        }
      }
      if (!next) break;
      e = next;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

function pieces({ on, GW, GH }) {
  const seen = new Uint8Array(on.length);
  const stack = [];
  let n = 0, thinnest = Infinity;
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || seen[i]) continue;
    n++; seen[i] = 1; stack.push(i);
    let x0 = GW, x1 = -1, y0 = GH, y1 = -1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % GW, y = (j - x) / GW;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const visit = (a, b) => {
        if (a < 0 || b < 0 || a >= GW || b >= GH) return;
        const k = a + b * GW;
        if (on[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      };
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) visit(x + dx, y + dy);
    }
    const t = Math.min(x1 - x0 + 1, y1 - y0 + 1);
    if (t < thinnest) thinnest = t;
  }
  return { n, thinnest: n ? thinnest : Infinity };
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

// ---- 4: simplify + facet ---------------------------------------------------
function simplify(pts) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    const c1 = (c[0] - p[0]) * (q[1] - c[1]) - (c[1] - p[1]) * (q[0] - c[0]);
    if (c1 === 0) continue;
    if (out.length && out[out.length - 1][0] === c[0] && out[out.length - 1][1] === c[1]) continue;
    out.push(c);
  }
  return out.length >= 3 ? out : pts;
}

// `dir` is +1 for a loop wound counter-clockwise and -1 for one wound clockwise (outer boundaries and
// holes come out of the tracer wound opposite ways). It is what says which way a corner really turns:
// a corner is CONVEX when its turn goes the same way round as the loop is wound — walking a clockwise
// (negative-area) outer boundary you TURN RIGHT at every corner of the silhouette, and `cross` is
// negative for a right turn, so convex is `cross` and the area having the SAME sign. The tracer emits
// the OUTER silhouette negative (dir < 0) and every hole positive (dir > 0), which is also how
// `spikeOuter` knows where the outside is — and it is what lets the two families of convex corners
// take different cuts, `SHARP.cut` for the silhouette and `SHARP.holeCut` for the counters.
function facet(pts, dir, dials = SHARP) {
  const n = pts.length;
  const res = [];
  const hole = dir > 0;
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n], c = pts[i], q = pts[(i + 1) % n];
    const e1 = [c[0] - p[0], c[1] - p[1]], e2 = [q[0] - c[0], q[1] - c[1]];
    const l1 = Math.hypot(e1[0], e1[1]), l2 = Math.hypot(e2[0], e2[1]);
    const cross = e1[0] * e2[1] - e1[1] * e2[0];
    if (Math.min(l1, l2) < SHARP.edge) { res.push(c); continue; }
    const conv = cross * dir > 0;
    // Half of EITHER edge is the most a cut may take: half of BOTH is where the two cuts standing on
    // the same edge meet, and meeting is exactly what makes a one-cell stroke end a point.
    const want = conv ? (hole ? dials.holeCut : dials.cut) : dials.notch;
    // `slope` lets the cut grow with the edge it stands on (base + slope * l_i, still capped at
    // half of that edge), so a long side is eaten far deeper than a short one and the facet stops
    // looking like a rounded corner and starts looking like a BLADE. 0 = every corner is cut `cut`
    // units whatever its edges are, which is the chisel the face shipped with. A HOLE has its own
    // slope (`holeSlope`, 0): a counter's edges are only two cells long, and growing the cut with
    // them would eat the counter from all four sides at once.
    const sl = hole ? dials.holeSlope : dials.slope;
    const cut1 = Math.min(0.5 * l1, want + sl * l1);
    const cut2 = Math.min(0.5 * l2, want + sl * l2);
    if (cut1 < 6 && cut2 < 6) { res.push(c); continue; }
    const a = [c[0] - e1[0] * (cut1 / l1), c[1] - e1[1] * (cut1 / l1)];
    const b = [c[0] + e2[0] * (cut2 / l2), c[1] + e2[1] * (cut2 / l2)];
    res.push(a);
    if (SHARP.spike && conv && (!SHARP.spikeOuter || dir < 0)) {
      // OUT is away from the ink: the bisector of the corner's two neighbours, pointing the way the
      // loop's own winding is not.
      let ox = (p[0] - c[0]) / l1 + (q[0] - c[0]) / l2;
      let oy = (p[1] - c[1]) / l1 + (q[1] - c[1]) / l2;
      const ol = Math.hypot(ox, oy) || 1;
      ox = (ox / ol) * dir;
      oy = (oy / ol) * dir;
      const th = (SHARP.sweep * Math.PI) / 180;
      const rx = ox * Math.cos(th) - oy * Math.sin(th);
      const ry = ox * Math.sin(th) + oy * Math.cos(th);
      res.push([(a[0] + b[0]) / 2 + rx * SHARP.spike, (a[1] + b[1]) / 2 + ry * SHARP.spike]);
    }
    res.push(b);
  }
  return res;
}

// ---- 5: a glyph ------------------------------------------------------------
// `seam` selects the cut: undefined = pickSeam, false/"straight"/"jog" = force one.
export function contoursOf(g, seam) {
  const mode = seam === undefined ? pickSeam(g) : seam;
  // The small glyphs (punctuation, the symbol row) are faceted with their own milder dials — see
  // `SHARP.small`: they are all small features, and the letters' blade would turn a full stop into a
  // rhombus. Everything else about the build — the lattice, the seam, the tracer — is identical.
  const dials = KIND(g.ch) === "sym" ? { ...SHARP, ...SHARP.small } : SHARP;
  const { on, GW, GH, yTop } = lattice(g, mode);
  const loops = traceLoops(on, GW, GH);
  const cellCount = on.reduce((s, v) => s + v, 0);
  const out = [];
  let areaSum = 0;
  for (const loop of loops) {
    const pts = [];
    for (const [x, y] of simplify(loop)) pts.push([x * UNIT, yTop - y * UNIT]);
    const sa = signedArea(pts);
    if (Math.abs(sa) < 1) continue;
    areaSum += sa;
    out.push(facet(pts, Math.sign(sa), dials));
  }
  return { loops: out, cellCount, areaSum: Math.abs(areaSum) / (UNIT * UNIT) };
}

function glyphOf(g, name) {
  const { loops } = contoursOf(g);
  const path = new opentype.Path();
  for (const loop of loops) {
    path.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i++) path.lineTo(loop[i][0], loop[i][1]);
    path.close();
  }
  const unicode = name === "space" ? 32 : g.ch.codePointAt(0);
  return new opentype.Glyph({ name: name || ("u" + unicode), unicode, advanceWidth: (g.adv + SIDE_BEARING) * CELL, path });
}

const KIND = (ch) =>
  /[A-Z]/.test(ch) ? "cap" : /[acemnorsuvwxz]/.test(ch) ? "xh" : /[bdfhiklt]/.test(ch) ? "asc"
  : /[gjpqy]/.test(ch) ? "desc" : /[0-9]/.test(ch) ? "num" : "sym";

const KIND_TOP = { cap: 7, xh: 5, asc: 7, num: 7 };
const KIND_LOW = { cap: 0, xh: 0, asc: 0, num: 0 };

function aligns(g, ch, inkY) {
  if (!inkY) return true;
  if (inkY[0] < -2 || inkY[1] > 8) return false;
  const kind = KIND(ch);
  if (kind === "desc") return inkY[0] <= 0 && inkY[0] >= -2 && inkY[1] === (ch === "j" ? 7 : 5);
  if (kind === "cap") return inkY[1] === 7 && (inkY[0] === 0 || inkY[0] === -1);
  if (KIND_TOP[kind] === undefined) return true;
  return inkY[1] === KIND_TOP[kind] && inkY[0] === KIND_LOW[kind];
}

export function report() {
  const rows = [];
  for (const g of parseArt()) {
    const { loops, cellCount, areaSum } = contoursOf(g);
    const ch = g.ch === " " ? "space" : g.ch;
    const inkRows = [];
    g.rows.forEach((r, i) => { if (r.includes("#")) inkRows.push(g.top - i - 1); });
    const inkY = inkRows.length ? [Math.min(...inkRows), Math.max(...inkRows) + 1] : null;
    const areaOk = Math.abs(cellCount - areaSum) < 0.51;
    const alignOk = aligns(g, g.ch, inkY);
    const seam = pickSeam(g);
    const whole = pieces(lattice(g, false));
    const split = pieces(lattice(g, seam));
    const splitOk = cellCount === 0 || split.thinnest >= MIN_PIECE;
    rows.push({
      ch, kind: KIND(g.ch), w: g.w, adv: g.adv, top: g.top, h: g.rows.length,
      boxY: [g.top - g.rows.length, g.top], inkY,
      loops: loops.length, cells: cellCount, area: +areaSum.toFixed(2),
      seam, pieces: split.n, piecesBefore: whole.n, thinnest: split.thinnest,
      areaOk, alignOk, splitOk, ok: areaOk && alignOk && splitOk
    });
  }
  return rows;
}

export function buildAll() {
  const art = parseArt();
  const glyphs = [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: (5 + SIDE_BEARING) * CELL, path: new opentype.Path() })];
  const nbsp = parseArt().find(g => g.ch === " ");
  for (const g of art) glyphs.push(glyphOf(g, g.ch === " " ? "space" : g.ch));
  glyphs.push(new opentype.Glyph({ name: "nbsp", unicode: 160, advanceWidth: (nbsp.adv + SIDE_BEARING) * CELL, path: new opentype.Path() }));
  const font = new opentype.Font({ familyName: FAMILY, styleName: "Regular", unitsPerEm: EM, ascender: ASC, descender: DESC, glyphs });
  const ttf = font.toArrayBuffer();
  return { ttf, report: report(), font };
}

// ---- WOFF ------------------------------------------------------------------
async function zlib(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

export async function toWoff(ttf) {
  const dv = new DataView(ttf);
  const flavor = dv.getUint32(0);
  const numTables = dv.getUint16(4);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables.push({ tag: new Uint8Array(ttf, o, 4), checksum: dv.getUint32(o + 4), offset: dv.getUint32(o + 8), length: dv.getUint32(o + 12) });
  }
  const parts = [];
  for (const t of tables) {
    const raw = new Uint8Array(ttf, t.offset, t.length);
    let z = await zlib(raw);
    if (z.length >= t.length) z = raw;
    parts.push({ tag: t.tag, checksum: t.checksum, orig: raw, comp: z });
  }
  const dirSize = 44 + parts.length * 20;
  const pad = n => (4 - (n % 4)) % 4;
  let total = dirSize;
  for (const p of parts) total += p.comp.length + pad(p.comp.length);
  const out = new Uint8Array(total);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, 0x774f4646);
  ov.setUint32(4, flavor);
  ov.setUint32(8, total);
  ov.setUint16(12, parts.length);
  ov.setUint16(14, 0);
  ov.setUint32(16, ttf.byteLength);
  ov.setUint16(20, 1); ov.setUint16(22, 0);
  ov.setUint32(24, 0); ov.setUint32(28, 0); ov.setUint32(32, 0);
  ov.setUint32(36, 0); ov.setUint32(40, 0);
  let off = dirSize;
  parts.forEach((p, i) => {
    const o = 44 + i * 20;
    out.set(p.tag, o);
    ov.setUint32(o + 4, off);
    ov.setUint32(o + 8, p.comp.length);
    ov.setUint32(o + 12, p.orig.length);
    ov.setUint32(o + 16, p.checksum);
    out.set(p.comp, off);
    off += p.comp.length + pad(p.comp.length);
  });
  return out;
}

export async function buildWood() {
  const { ttf, report: rep } = buildAll();
  const woff = await toWoff(ttf);
  return { ttf: new Uint8Array(ttf), woff, report: rep };
}
