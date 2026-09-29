// ---------------------------------------------------------------------------
// THE VOXEL MODEL — what it means for a box to have a PART taken out of it
//
// Destruction used to be all-or-nothing at the scale of one box, and that is fine for a box
// that is small: a 2-unit cube IS a block, and taking the whole block is taking the thing you
// hit. It stops being fine the moment the box is LARGE, because `STRUCTURES` builds a lot of
// big boxes — a 30 x 20 x 2 wall face, a 14 x 15 x 14 storey of the monolith, a 14 x 1 x 14
// terrace slab — and to the generator each of those is ONE box, exactly like a pebble is. A
// slam that reached `BREAK` on one of them used to delete the entire object.
//
// So a box big enough to have an *inside* is cut into a grid of cells, and the cells are what
// the world is built from and what damage is addressed to. Nothing about the world changes when
// a box is whole (it is one piece, exactly as before); the grid only exists once something has
// been taken out of it, and from then on a break takes the CELL the boot is on rather than the
// object. Work a big wall and you get a bite out of it, then a hole through it, then a doorway
// — rather than one slam and the wall is gone.
//
// This module owns the whole idea, because it is the one thing `destruction.js` (which decides
// what breaks) and `world.js` (which draws and collides whatever is left) have to agree on
// exactly:
//
//   * `gridOf(box)`  — how many cells each axis is cut into. A pure function of the box's own
//                      size, so the same box always cuts the same way, which is what makes a
//                      cell addressable across a chunk unload/reload.
//   * `slotOf` / `cellSlot` / `decodeSlot` — the damage ADDRESS of a solid. A whole box is
//                      `slotOf(idx)`; a cell of it is `cellSlot(idx, cell)`. Numbers, not
//                      strings, because these are Map/Set keys on the hot path.
//   * `cellOf`       — the cell's own rectangle, and its colour (see below).
//   * `pieceOf`      — the world's unit of solid: a whole box or one cell, with its collider
//                      bounds and its slot. `world.js` builds its meshes and colliders out of
//                      these and `destruction.js` hits them, so both are looking at the same
//                      objects.
//
// TWO THINGS ABOUT THE CUT ARE LOAD-BEARING:
//
// 1. THE CELLS ARE A PARTITION, NOT AN OVERLAP. Cell edges come from one shared formula
//    (`x0 = box.x + box.w*i/n`), so cell i's far edge IS cell i+1's near edge — bit for bit.
//    Anything else leaves sub-micron gaps or overlaps along every seam, and at this render
//    resolution an overlap is a z-fighting stripe and a gap is a hairline of sky through a wall.
//    The internal faces a partition creates are all inside the object's own convex hull, so
//    back-face culling drops the half of each pair that faces away and the depth buffer hides
//    the other half behind the object's own surface: the cut costs triangles and nothing else.
//
// 2. A CELL'S COLOUR DEPENDS ON WHERE IT IS. `box.c` is the paint on a box, and the paint is on
//    the OUTSIDE — `interiorOf(c)` is the same paint taken down hard, which is what a block's
//    shards mix and what a crack in a block is bottomed with. A cell the cut has exposed is
//    still wearing the paint (it was on the surface), but a cell that has lived its whole life
//    inside the object was never painted, and painting it would make a bite through a stone
//    wall read as the same stone all the way in — a rectangle cut out of a picture rather than
//    a bite out of a thing. So a fully-enclosed cell is given the interior colour, and it only
//    ever becomes visible when the bites around it have been taken, at which point it *is* the
//    raw inside of the object. That is the whole visual budget of this feature: one array
//    lookup per cell at build time, and the hole gets darker as it goes in.
// ---------------------------------------------------------------------------

// The size a cell aims for, in world units — so a bite is roughly a bootful of whatever it was
// standing on, whatever the object is. A box whose grid comes out at a single cell is not
// cuttable at all (see `isCuttable`), which is also the scale below which "part of it" and "all
// of it" are the same thing.
const VOX_EDGE = 2.5;
// ...nor a box into more cells than this, in total. The cell count is bounded rather than the
// cell size, because cost is what has to be bounded: every cell is a box of its own from here on
// — its own geometry, its own collider, its own corner of the chunk's occluder grid — and the
// chunk rebuild that follows a bite pays for all of them. So a long rod gets as many bites
// along its length as the ceiling allows (27 slices of a 120-unit rib) and a big cube gets
// 3 x 3 x 3, and a 30 x 20 wall gets 5 x 5. (27 and not 24: three cells on every axis is also
// the first grid that has an ENCLOSED cell in the middle of it — the raw, never-painted inside
// of the object, which is what a bite deep enough to reach it is standing in. Two cells on an
// axis means every cell of it is on the object's surface.)
const VOX_MAX_CELLS = 27;

// The damage address space. `slot = idx * SLOT_SPAN + sub`, where `sub` is 0 for the box itself
// and `1 + cell` for one of its cells — so `SLOT_SPAN` only has to outrun the cell count, and
// raising `VOX_MAX_CELLS` raises it automatically.
export const SLOT_SPAN = VOX_MAX_CELLS + 1;

// `buildBoxGeometry`'s own fallback for a box that was never given a colour (`geom.js`), so a
// box's web, its shards and its dust can never be a different colour from the box itself.
export const NO_COLOR = [1, 1, 1];

function clampInt(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// How many cells a box's three axes are cut into. Pure function of the box's size: `VOX_EDGE`
// is the size a cell wants to be, and the trim loop only ever takes cells off the LONGEST axis,
// so the cut that gets given up under the cost ceiling is always the one that was going to be
// the least visible, and what is left is as near a cube of cells as the box's proportions allow.
//
// A box thinner than `VOX_EDGE` on an axis simply comes out as one cell on that axis, which is
// the right answer for a panel as well as for a plate: a 14 x 14 x 0.5 wall gets cut in PLANE
// (1 x 6 x 6, trimmed to 25) so a break takes a square hole through it, and a keel-thin slab
// gets a 2 x 1 x 2 grid. Thin things are not exempt from being broken in part — they are just
// broken in part ACROSS rather than INTO.
export function gridOf(box) {
  const g = [
    Math.max(1, Math.round(box.w / VOX_EDGE)),
    Math.max(1, Math.round(box.h / VOX_EDGE)),
    Math.max(1, Math.round(box.d / VOX_EDGE)),
  ];
  while (g[0] * g[1] * g[2] > VOX_MAX_CELLS) {
    let m = 0;
    if (g[1] > g[m]) m = 1;
    if (g[2] > g[m]) m = 2;
    if (g[m] <= 1) break;
    g[m]--;
  }
  return g;
}

export function cellTotal(grid) {
  return grid[0] * grid[1] * grid[2];
}

// Is this box big enough that "part of it" is a different thing from "all of it"? A grid that
// comes out at one cell is the whole box, so a break on it takes the whole box either way.
export function isCuttable(box) {
  const g = gridOf(box);
  return g[0] * g[1] * g[2] >= 2;
}

export function slotOf(idx) {
  return idx * SLOT_SPAN;
}

export function cellSlot(idx, cell) {
  return idx * SLOT_SPAN + 1 + cell;
}

export function decodeSlot(slot) {
  const idx = Math.floor(slot / SLOT_SPAN);
  return { idx, cell: slot - idx * SLOT_SPAN - 1 };
}

// A box's inside: the same hue taken down hard, hue preserved. The ground's version of a hole
// goes brown (soil), but a painted box's inside is the same paint, so a red crate's break is
// dark red. `buildShardGeometry` bakes the same idea into a shard's underside at 0.7 and
// `crackTones` bottoms a block's web with it, and all three have to agree — the break, the
// chunks that came off it and the bite you took out of it are the same material.
export function interiorOf(c, out) {
  out[0] = c[0] * 0.38 + 0.02;
  out[1] = c[1] * 0.34 + 0.018;
  out[2] = c[2] * 0.3 + 0.016;
  return out;
}

// One cell of a box: its own rectangle (a clean partition — see the header), its colour, and
// whatever flags the box carried. `cell` is `i + j*nx + k*nx*ny`, and the caller can always get
// i/j/k and the grid back from it, so nothing else has to be stored.
export function cellOf(box, grid, cell) {
  const nx = grid[0];
  const ny = grid[1];
  const nz = grid[2];
  const i = cell % nx;
  const j = Math.floor(cell / nx) % ny;
  const k = Math.floor(cell / (nx * ny));
  const x0 = box.x + (box.w * i) / nx;
  const x1 = box.x + (box.w * (i + 1)) / nx;
  const y0 = box.y + (box.h * j) / ny;
  const y1 = box.y + (box.h * (j + 1)) / ny;
  const z0 = box.z + (box.d * k) / nz;
  const z1 = box.z + (box.d * (k + 1)) / nz;
  const inside =
    nx > 2 && ny > 2 && nz > 2 &&
    i > 0 && i < nx - 1 && j > 0 && j < ny - 1 && k > 0 && k < nz - 1;
  return {
    x: x0, y: y0, z: z0,
    w: x1 - x0, h: y1 - y0, d: z1 - z0,
    c: inside ? interiorOf(box.c || NO_COLOR, [0, 0, 0]) : box.c,
    glow: box.glow,
    noCol: box.noCol,
  };
}

// The cell the boot landed on: in the TOP layer, directly under the hit. A bite is always taken
// out of the top of the thing you are standing on, because in this game the only surface a slam
// can reach is a top face (see `impact`), and that means a bite is a pit you can see into from
// where you are standing rather than a hole in a wall you cannot see.
export function topCellAt(box, grid, x, z) {
  const nx = grid[0];
  const ny = grid[1];
  const nz = grid[2];
  const i = clampInt(Math.floor(((x - box.x) / box.w) * nx), 0, nx - 1);
  const k = clampInt(Math.floor(((z - box.z) / box.d) * nz), 0, nz - 1);
  return i + (ny - 1) * nx + k * nx * ny;
}

// The cell a blow driven into a FACE lands on: the cell containing the point (x, y, z). The
// ground slam can only ever reach a TOP face, which is why `topCellAt` exists and why it takes
// nothing but a footprint — but a blow into a wall has a height as well, and it has to take the
// cell it actually hit. Without this, every hole punched in the side of a tower would open at
// the object's roofline whatever storey the fist arrived on.
export function cellAt(box, grid, x, y, z) {
  const nx = grid[0];
  const ny = grid[1];
  const nz = grid[2];
  const i = clampInt(Math.floor(((x - box.x) / box.w) * nx), 0, nx - 1);
  const j = clampInt(Math.floor(((y - box.y) / box.h) * ny), 0, ny - 1);
  const k = clampInt(Math.floor(((z - box.z) / box.d) * nz), 0, nz - 1);
  return i + j * nx + k * nx * ny;
}

// A SOLID THE WORLD IS BUILT FROM: a whole box, or one surviving cell of a cut box. It carries
// its own collider bounds (so a piece *is* its collider — nothing has to look a box up again),
// its damage address `slot`, and the box it came out of (`idx`, -1 `cell` for a whole box).
export function pieceOf(def, idx, cx, cz, slot, cell = -1) {
  return {
    x: def.x, y: def.y, z: def.z,
    w: def.w, h: def.h, d: def.d,
    c: def.c, glow: def.glow, noCol: def.noCol,
    minX: def.x, minY: def.y, minZ: def.z,
    maxX: def.x + def.w, maxY: def.y + def.h, maxZ: def.z + def.d,
    idx, cell, cx, cz, slot,
  };
}

// The rectangle a slot is, off a chunk's own box list — used to draw the crack web of a slot
// that is not currently on screen (a cell that has been damaged but whose box has not been
// rebuilt yet) and by the decal build, which works from damage state rather than from pieces.
export function defOfSlot(boxDefs, slot) {
  const d = decodeSlot(slot);
  const box = boxDefs[d.idx];
  if (!box || d.cell < 0) return box;
  return cellOf(box, gridOf(box), d.cell);
}
