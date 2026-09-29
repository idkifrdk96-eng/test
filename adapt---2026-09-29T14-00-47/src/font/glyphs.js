// ---------------------------------------------------------------------------
// ADAPTCHUNK — the game's typeface, as PIXELS. This file is the ART; `build-font.js` is the
// machine that turns it into a real font file (see "THE FONT" in README.md).
//
// THE SECOND BRIEF was a PICTURE, not a description. The face was first cut from a written
// description (BOMB RUSH CYBERFUNK's clipped squares + JET SET RADIO's jagged lean); the user then
// sent a specimen sheet — A-Z, 0-9 and punctuation, white on black — with *"use this font"*. The
// specimen is a heavy DISPLAY face, and it is heavy in a particular way: the letters are nearly
// SOLID slabs. Their counters are not windows you read through, they are SLITS — one cell wide in
// a two-cell stroke, a nick rather than a hole — and the ink around them is so thick that B, D, 8
// and 0 read as carved blocks. Its other marks are: every outer corner cut off on the diagonal,
// wedge-shaped diagonals (M, N, V, W, X, Y, Z, 4, 7 are chisels, not staircases), bars that are
// kerfed apart rather than joined (its E is three bars with white between them, its H is a heavy
// cross), a slab I — a bar on top, a stem, a foot — and tapered terminals everywhere.
//
// So this face is the specimen translated onto OUR grid: the same 0.1em cell as before (the pixel
// half of the brief, and the reason the HUD stays sharp), the specimen's weight, and the builder
// still doing the cutting (the low-poly half). What changed is the drawing style, not the machine.
//
//   baseline = 0     x-height = 500     cap height = 700     ascender = 800     descender = -200
//
// THE GRID: one cell = 100 units, the em = 1000, so a cell is exactly 0.1em. That is on purpose:
// at a font-size of 10px, 20px or 30px a cell is exactly 1, 2 or 3 device pixels and the type is
// razor sharp. Anything between those sizes antialiases (which is fine, it just reads softer).
//
// Each glyph is written as a block: a header line `char adv top` followed by one line per ROW of
// its box, top row first. `adv` and `top` are in cells; '#' is ink and '.' is empty. `adv` is the
// glyph's INK width — the builder adds SIDE_BEARING cell of side bearing, so a letter never touches
// the next one even at letter-spacing: normal. `top` is the height of the box's top edge above the
// baseline, so a 7-row glyph with top 7 sits with its last row ON the baseline (y 0..1) and a 9-row
// glyph with top 7 descends to y -2. Rows may be shorter than `adv`; they are padded.
//
// THE WEIGHT — how you draw a face this heavy on a grid this coarse, and the one place the
// specimen could not be copied literally. The specimen was rendered at ~47px, so its stroke is two
// of its cells and its counters are ONE cell: 2 ink, 1 hole, 2 ink across a five-or-six-cell letter.
// That ratio cannot be taken as-is here, because the builder CUTS every corner of every loop
// (SHARP.cut), and a cut eats into a hole exactly as far as it eats into the ink around it: a
// one-cell counter on our grid loses both its sides to the cut and closes up completely, which at
// 10px (one cell = one pixel) would turn every letter of the HUD into a solid tile. So the art is
// drawn the specimen's way but ONE CELL LOOSER — two-cell strokes with TWO-CELL counters — and the
// cut closes it back up to the specimen's proportion: a 200-unit counter loses ~50 units at each
// end and survives as ~100 units, i.e. one cell — the same slit the specimen has, at the same 2:1
// ink-to-counter ratio — and at 10px it survives as a whole readable pixel instead of a fraction
// of one. The same rule is why no counter in this file is one cell tall (a 100-unit side is
// smaller than two cuts and collapses entirely): every hole here is at least 2x2 cells.
//
// THE DIAGONALS are drawn as TWO-CELL STAIRCASES, never as thin chains. A one-cell diagonal is a
// dotted line once the cut has taken a third off each block, and it reads as noise at the sizes the
// HUD uses; a two-cell step survives the cut as a solid wedge, which is the specimen's chisel.
//
// THE `top` RULE — get it wrong and the glyph floats off the baseline (the build's `alignOk` audit
// catches exactly that):
//   caps, digits, ascenders (b d f h k l i t)   7 rows, top 7   letters sit on the baseline
//   x-height (a c e m n o r s u v w x z)        5 rows, top 5
//   descenders (g p q y)                        7 rows, top 5   5 rows of body, 2 below the line
//   Q, j                                        8 rows, top 7   7 rows of body, last row below
//   the comma                                   8 rows, top 7   tail below the line
//
// THE WIDTH: caps are 6 cells (up from 5 — the specimen's letters are as wide as they are tall
// plus a cell, and the two-cell stroke needs the room), M and W are 8, I is 4 (a slab: bar, stem,
// foot), L is 5, J is 6 for its hook. Lowercase is 5 wide at a 5-row x-height, with i and l at 2,
// j at 3, and m and w at 7. The punctuation and the symbol row (arrows, bullets, the em-dash) are
// carried over from the first face untouched: their forms never depended on the weight, and the
// specimen's two punctuation rows agree with them.
//
// THE SEAM IS OFF. The old face carved a jogged keyline through every glyph from the builder; this
// specimen has no seam — it has SOLID letters with nicked counters — so CARVE_SEAM below is false
// and `pickSeam` in build-font.js returns "no cut" instead of choosing a jog. The seam machinery
// (`SEAM`, `lattice`'s carve step, `pickSeam`) is left whole and documented so the keyline can be
// switched back on with this one boolean plus a rebuild.

export const CELL = 100;        // units per cell
export const EM = 1000;         // units per em (10 cells)
export const CAP = 700;         // cap height, units (7 cells)
export const XH = 500;          // x-height, units (5 cells)
export const ASC = 800;         // ascender, units (8 cells)
export const DESC = -200;       // descender, units (2 cells)

// THE LEAN (the JET SET RADIO half of the first brief). The letters lean forward: the row of the art
// sitting on the baseline is the anchor, and each row above it is pushed right in proportion to how
// high it is, so the top of a capital ends up a couple of whole cells to the right of its feet.
//
// It is applied on the LATTICE, per ROW OF THE ART, in WHOLE CELLS (see `lattice` in build-font.js)
// — never per sub-row. That distinction is the whole ballgame for a pixel font: a sub-cell step
// lands a stroke's edge on a fractional pixel at 10px / 20px / 30px, which antialiases every stem in
// the game and turns the face into an ordinary slanted one. A whole cell is exactly 1, 2 or 3 device
// pixels at those three sizes, so the staircase stays on the grid and the stems stay solid.
//
// IT IS OFF — the user's *"make the font not italic"*, and this specimen is upright too. At 0 every
// row's `stepOf` comes out 0, the lattice is not widened, and the whole face stands square. The
// lean machinery is kept whole, so the slant can be turned back on by changing this one number and
// rebuilding (see "THE FONT" in README.md for the recipe).
export const SLANT = 0;         // cells of lean per cell of height (quantized to whole cells)

// THE SEAM: a horizontal slit through the mid-height of every glyph, the BOMB RUSH CYBERFUNK
// keyline of the FIRST face. In units, measured from the baseline. It is SUB-cell (0.2 of a cell)
// so it reads as a fine seam at logo sizes and all but vanishes at HUD sizes. On most glyphs it
// JOGS: the slit runs at `yCap` over the left of the letter and `step` units higher over the
// right — the reference logo's angular step. Glyphs built from thin diagonals (X, M, W, % …) get a
// straight slit instead, because a step slices every arm twice and the letter crumbles; the builder
// picks whichever cut leaves the larger piece.
export const SEAM = { yCap: 350, yXh: 250, half: 10, step: 70 };

// ...and it is switched OFF, because the specimen has no seam. Flip this to true to carve the
// keyline back through the face; nothing else has to change.
export const CARVE_SEAM = false;

export const FAMILY = "AdaptChunk";

export const ART = `
space 5 7

A 6 7
..##..
.####.
##..##
##..##
######
##..##
##..##

B 6 7
#####.
##..##
##..##
#####.
##..##
##..##
#####.

C 6 7
.####.
##..##
##..##
##....
##....
##..##
.####.

D 6 7
#####.
##..##
##..##
##..##
##..##
##..##
#####.

E 6 7
######
##....
##....
#####.
##....
##....
######

F 6 7
######
##....
##....
#####.
##....
##....
##....

G 6 7
.####.
##..##
##....
##.###
##..##
##..##
.####.

H 6 7
##..##
##..##
##..##
######
##..##
##..##
##..##

I 4 7
####
.##.
.##.
.##.
.##.
.##.
####

J 6 7
..####
....##
....##
....##
....##
##..##
.####.

K 6 7
##..##
##.##.
####..
###...
####..
##.##.
##..##

L 5 7
##...
##...
##...
##...
##...
##...
#####

M 8 7
##....##
###..###
########
##.##.##
##....##
##....##
##....##

N 6 7
##..##
###.##
###.##
####.#
##.###
##.###
##..##

O 6 7
######
##..##
##..##
##..##
##..##
##..##
######

P 6 7
#####.
##..##
##..##
#####.
##....
##....
##....

Q 6 7
######
##..##
##..##
##..##
##..##
#####.
..###.
...##.

R 6 7
#####.
##..##
##..##
#####.
####..
##.##.
##..##

S 6 7
.#####
##....
##....
.####.
....##
....##
#####.

T 6 7
######
..##..
..##..
..##..
..##..
..##..
..##..

U 6 7
##..##
##..##
##..##
##..##
##..##
##..##
.####.

V 6 7
##..##
##..##
##..##
##..##
##..##
.####.
..##..

W 8 7
##....##
##....##
##....##
##.##.##
########
###..###
##....##

X 6 7
##..##
##..##
.####.
..##..
.####.
##..##
##..##

Y 6 7
##..##
##..##
.####.
..##..
..##..
..##..
..##..

Z 6 7
######
....##
...##.
.###..
.##...
##....
######

0 6 7
.####.
##..##
##..##
##..##
##..##
##..##
.####.

1 6 7
..##..
.###..
..##..
..##..
..##..
..##..
######

2 6 7
.####.
##..##
....##
..###.
.##...
##....
######

3 6 7
#####.
....##
....##
.####.
....##
....##
#####.

4 6 7
...##.
..###.
.##.##
##..##
######
...##.
...##.

5 6 7
######
##....
##....
#####.
....##
##..##
.####.

6 6 7
.####.
##..##
##....
#####.
##..##
##..##
.####.

7 6 7
######
....##
...##.
..##..
..##..
..##..
..##..

8 6 7
.####.
##..##
##..##
.####.
##..##
##..##
.####.

9 6 7
.####.
##..##
##..##
.#####
....##
##..##
.####.

a 5 5
.###.
##..#
#####
##..#
.####

b 5 7
##...
##...
####.
##..#
##..#
##..#
####.

c 5 5
.###.
##..#
##...
##..#
.###.

d 5 7
...##
...##
.####
##..#
##..#
##..#
.####

e 5 5
#####
##..#
#####
##...
.###.

f 4 7
.###
###.
##..
####
##..
##..
##..

g 5 5
.####
##..#
##..#
##..#
.####
...##
.###.

h 5 7
##...
##...
####.
##..#
##..#
##..#
##..#

i 2 7
##
##
..
##
##
##
##

j 3 7
.##
...
.##
.##
.##
.##
.##
##.

k 5 7
##...
##...
##.##
####.
####.
##.##
##..#

l 2 7
##
##
##
##
##
##
##

m 7 5
#######
##.#.##
##.#.##
##.#.##
##.#.##

n 5 5
#####
##..#
##..#
##..#
##..#

o 5 5
.###.
##..#
##..#
##..#
.###.

p 5 5
####.
##..#
##..#
##..#
####.
##...
##...

q 5 5
.####
##..#
##..#
##..#
.####
...##
...##

r 4 5
###.
##.#
##..
##..
##..

s 5 5
.####
##...
####.
...##
####.

t 4 7
.##.
.##.
####
.##.
.##.
.##.
..##

u 5 5
##..#
##..#
##..#
##..#
.####

v 5 5
##..#
##..#
##..#
.####
..##.

w 7 5
##...##
##...##
##.#.##
#######
.##.##.

x 5 5
##..#
.####
..##.
.####
##..#

y 5 5
##..#
##..#
##..#
.####
...##
...##
.###.

z 5 5
#####
...##
..##.
.##..
#####

. 3 7
...
...
...
...
...
###
###

, 3 7
...
...
...
...
...
###
###
.##

: 3 7
...
...
###
###
...
###
###

; 3 7
...
...
###
###
...
###
###
.##

! 3 7
.##
.##
.##
.##
.##
...
.##

? 6 7
#####.
....##
....##
..###.
..##..
......
..##..

' 3 7
##.
##.

" 5 7
##.##
##.##

- 5 5
.....
#####
#####
.....
.....

+ 6 7
..##..
..##..
..##..
######
######
..##..
..##..

= 6 7
......
######
######
......
......
######
######

* 6 7
##..##
.####.
######
..##..
######
.####.
##..##

/ 6 7
....##
...##.
...##.
..##..
.##...
.##...
##....

\\ 6 7
##....
.##...
.##...
..##..
...##.
...##.
....##

( 4 7
..##
.##.
##..
##..
##..
.##.
..##

) 4 7
##..
.##.
..##
..##
..##
.##.
##..

[ 4 7
####
####
##..
##..
##..
####
####

] 4 7
####
####
..##
..##
..##
####
####

{ 5 7
..###
.##..
.##..
##...
.##..
.##..
..###

} 5 7
###..
..##.
..##.
...##
..##.
..##.
###..

< 5 7
...##
..##.
.##..
##...
.##..
..##.
...##

> 5 7
##...
.##..
..##.
...##
..##.
.##..
##...

% 7 7
###....
###.##.
...###.
..##...
.##....
....###
....###

# 6 7
.##.##
######
######
.##.##
######
######
.##.##

& 6 7
..###.
.##.##
.####.
####..
##..##
##..##
.###.#

@ 6 7
.####.
##..##
##.###
##.#.#
##.###
##....
.####.

~ 6 6
......
##....
#####.
.#####
....##
......

^ 6 7
..##..
.####.
######
##..##
......
......
......

| 3 7
.##
.##
.##
.##
.##
.##
.##

_ 5 6
.....
.....
.....
.....
.....
#####
#####

° 4 7
.##.
####
####
.##.
....
....
....

· 3 7
...
...
###
###
...
...
...

– 6 7
......
......
......
######
######
......
......

— 8 7
........
........
........
########
########
........
........

− 6 7
......
......
......
######
######
......
......

× 6 7
##..##
##..##
.####.
..##..
.####.
##..##
##..##

… 8 7
........
........
........
........
........
##.##.##
##.##.##

▶ 6 7
##....
###...
####..
#####.
####..
###...
##....

● 6 7
.####.
######
######
######
######
######
.####.

→ 8 7
....###.
...####.
..#####.
########
########
..#####.
...####.

← 8 7
.###....
.####...
.#####..
########
########
.#####..
.####...

↑ 7 7
..###..
.#####.
#######
..###..
..###..
..###..
..###..

↓ 7 7
..###..
..###..
..###..
..###..
#######
.#####.
..###..

■ 6 7
######
######
######
######
######
######
######

□ 6 7
######
######
##..##
##..##
##..##
######
######
`;

