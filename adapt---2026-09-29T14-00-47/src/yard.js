import * as THREE from "./three.js";

// ================================================================================================
// THE TRAINING GROUNDS
//
// The spawn used to be a patch of empty meadow with a wall, a staff and five rails in it: you could
// fight and you could vault, and everything ELSE the game can do you had to go and find a place for.
// The GROUNDS are that same patch, AUTHORED: a flat open FIELD with a station for every mechanic
// around its edges, and a SIGN standing over each one that names the move — so a new player walks
// from sign to sign and tries the whole moveset in the order this file lists it. Nothing about the
// moves changed to make the place work; this is CONTENT for them (the same bargain the ARENA's rails
// made — "the vault works on any low box, these are just boxes near the spawn").
//
// THREE RULES ARE LOAD-BEARING here, and all three are about what the MOVES need rather than looks:
//
//   * EVERY STATION LEAVES ITSELF A RUN-UP. Speed is a build-up (2 → 10.9 u/s over ~2.6 s, so ~7.5
//     units to reach the vault's own 7.4 gate), so nothing that needs speed is allowed to have
//     anything in front of it. The FIELD is deliberately EMPTY for exactly that reason: it is the
//     run-up, and the wall-run lane down its east side is 26 units of it.
//   * THE HEIGHTS ARE THE MECHANIC. A top within `P.STEP` (1.05) of the deck is a step, 0.45-1.35
//     above the feet is a VAULT, and a top in the HANDS' window (2.21-2.89 above the feet, see
//     `LEDGE_GRIP`) is the AUTO LEDGE GRAB — the one move nothing asks for. So the ledge ladder on
//     the tower's west flank is a STAIRCASE of three solid rungs, each exactly the window above the
//     last (2.4): jump at a rung and the hands catch it and pull you onto it, then the next rung is
//     the same jump again, until the last one is level with the roof. Every rung is a COLUMN from the
//     deck, not a floating lip: a wall only exists to the wall query while it overlaps the body's own
//     height band, and a lip hanging at 4.8 has nothing at body height to catch.
//   * NOTHING IS PLANTED ACROSS A MOVE'S LINE. The bench rails sit north of the slide lane, the
//     chimney's mouth opens onto the field, and the tower's climb face (north) is kept clear of the
//     ledge ladder (west) so neither station's approach crosses the other's landing.
//
// It is planted like the landmark and the ARENA wall — authored into the chunk each box actually
// stands in, before the scenery roll, with `YARD.clear` as the rectangle nothing grows in (see
// `buildChunk` in world.js). See "THE TRAINING GROUNDS" in README.md.
// ================================================================================================

const CHUNK = 32;

// The camp's palette is deliberately NOT the biome's. It is a built place, and it has to read as one
// in a green meadow, a white frostfield and a rust canyon: warm concrete with the two axes baked
// apart the way the landmark's are (a single flat tone turns to mush the moment the sun moves), and
// the paint in the world's own neon, so the lanes are still legible at midnight.
const CONC = [0.60, 0.60, 0.575];      // the ±z faces
const CONC_X = [0.515, 0.515, 0.525];  // the ±x faces, darker so a corner always shows two values
const SLAB = [0.68, 0.675, 0.645];     // the ledge lips and the roof, lighter than the body
const RAIL = [0.46, 0.47, 0.50];
const CRATE = [0.50, 0.42, 0.31];
const NEON = [0.20, 0.96, 1.16];       // the lane paint and the roof rim (glow)
const WARM = [1.10, 0.46, 0.92];       // ...and the spawn mark

// ------------------------------------------------------------------------------------------------
// THE PLAN, in world units. The spawn is (5, 5) and the ring wall stands across the -Z axis in front
// of it (see `ARENA` in world.js — the fight's own furniture, untouched).
//
//          z=+26  ┌─ THE SLIDE GATE (x 22..31.6, a 1.15 slot) ─┐
//          z=+20  │  THE VAULT BENCH (4 rails + a crate)      │
//          z=+14  ├───────────────────────────────────────────┤
//                 │            THE FIELD (empty)              │  ← wall run lane: x 20.9, z -12..14
//                 │                                           │  ← chimney: x 22.6..29.2, z 0..14
//          z=-14  ├───────────────────────────────────────────┤
//          z=-24  └─ THE TOWER (climb N, ladder W, roof y 8) ─┘
// ------------------------------------------------------------------------------------------------
const FIELD = { minX: 8, maxX: 21.4, minZ: -14, maxZ: 18 };
const RUN_WALL = { x: 21.8, t: 0.8, z0: -14, z1: 14, h: 7 };   // the long face the wall run rides
const CHIMNEY = { x: 29.2, t: 0.8, z0: 0, z1: 14, h: 7 };      // ...and the far face, 6.6 away
const TOWER = { x: 12, z: -24, w: 8, d: 7.3, top: 8 };         // the climb + the roof
const LADDER_X = 9.6;                                          // the staircase's west edge
const LADDER_W = 2.0;
const LADDERS = [                                              // the ledge rungs, ascending north…
  { z: -24.0, d: 1.8, top: 2.4 },                              // …each one a jump's own window up
  { z: -22.2, d: 1.8, top: 4.8 },
  { z: -20.4, d: 1.8, top: 7.2 },                              // …and level with the roof
];
const BENCH = { z: 19.6, d: 0.6, x0: 1, w: 4, gap: 2, tops: [0.7, 1.0, 1.25, 1.35] };
const CRATE_BOX = { x: 25.0, z: 16.6, w: 2.2, d: 2.2, top: 1.1 };
const GATE = { x: 22, w: 9.6, thin: 2.4, h: 4, z0: 20.2, gap: 1.15 };

// The chunk-local bins, built once (the box list is deterministic, so it is the same list every time
// a chunk streams back in — exactly like every other box in the world).
let bins = null;

function binOf(list, b) {
  // A box is filed with the chunk it STANDS in, and `queryXZ` only ever sees the chunks it touches —
  // so a box that crossed a boundary would be half invisible to every query. Nothing here is allowed
  // to cross one: a box that does is split at the line.
  const x1 = b.x + b.w;
  const z1 = b.z + b.d;
  const cx0 = Math.floor(b.x / CHUNK);
  const cx1 = Math.floor((x1 - 1e-6) / CHUNK);
  const cz0 = Math.floor(b.z / CHUNK);
  const cz1 = Math.floor((z1 - 1e-6) / CHUNK);
  if (cx0 === cx1 && cz0 === cz1) {
    const k = cx0 + "," + cz0;
    let arr = list.get(k);
    if (!arr) list.set(k, (arr = []));
    arr.push(b);
    return;
  }
  if (cx0 !== cx1) {
    const cut = (cx0 + 1) * CHUNK;
    binOf(list, { x: b.x, y: b.y, z: b.z, w: cut - b.x, h: b.h, d: b.d, c: b.c, glow: b.glow, noCol: b.noCol });
    binOf(list, { x: cut, y: b.y, z: b.z, w: x1 - cut, h: b.h, d: b.d, c: b.c, glow: b.glow, noCol: b.noCol });
    return;
  }
  const cut = (cz0 + 1) * CHUNK;
  binOf(list, { x: b.x, y: b.y, z: b.z, w: b.w, h: b.h, d: cut - b.z, c: b.c, glow: b.glow, noCol: b.noCol });
  binOf(list, { x: b.x, y: b.y, z: cut, w: b.w, h: b.h, d: z1 - cut, c: b.c, glow: b.glow, noCol: b.noCol });
}

function build() {
  const list = new Map();
  const out = (x, y, z, w, h, d, c, glow, noCol) =>
    binOf(list, { x, y, z, w, h, d, c, glow: glow ? 1 : 0, noCol: noCol ? 1 : 0 });

  // ---- THE FLOOR MARKINGS (drawn, never solid: 4 cm of paint on the deck) ----------------------
  // The spawn square, the wall-run lane and the slide lane. `noCol` because a painted line that
  // could be tripped over is furniture, and this is a mark on the ground.
  const paint = (x, z, w, d, c) => out(x, 0.02, z, w, 0.05, d, c, 1, 1);
  paint(3.4, 3.4, 3.2, 0.36, WARM);           // ── the spawn square, (5,5) ──
  paint(3.4, 6.24, 3.2, 0.36, WARM);
  paint(3.4, 3.4, 0.36, 3.2, WARM);
  paint(6.24, 3.4, 0.36, 3.2, WARM);
  paint(20.9, -12, 0.36, 26, NEON);           // ── the wall-run lane (it runs N-S beside the wall) ──
  paint(9.0, 23.4, 13, 0.36, NEON);           // ── the slide lane (it runs E-W into the slot) ──
  paint(9.0, 22.78, 13, 0.22, NEON);
  paint(9.0, 24.02, 13, 0.22, NEON);

  // ---- THE WALL YARD: one long face to run, and a second one to bounce off ---------------------
  // The run wall is 28 long and 7 tall, and its WEST face is what the wall run rides (the lane paint
  // above is laid at x 20.9, right in front of it). The chimney is the same wall again 6.6 away —
  // exactly the distance `WJ_PUSH` (9.4) crosses in the ~0.7 s of a wall jump's flight, so the two
  // faces are a ladder: bounce across the gap and each bounce keeps a metre or two of the height.
  const wallPair = (m, cz0, cz1) => {
    out(m.x, 0, cz0, m.t, m.h, cz1 - cz0, CONC_X);          // the face side reads darker…
    out(m.x - m.t * 0.06, 0, cz0, m.t * 1.12, 0.5, cz1 - cz0, SLAB);   // …with a kerb cap on top
  };
  wallPair(RUN_WALL, RUN_WALL.z0, RUN_WALL.z1);
  wallPair(CHIMNEY, CHIMNEY.z0, CHIMNEY.z1);

  // ---- THE TOWER: climb it, top out, dive off ------------------------------------------------
  // The body stops 0.4 short of the roof so the crown can be a lit band in the SAME footprint (the
  // landmark's rule: a band that stuck out would be a lip to trip on, and these faces are climbed —
  // and, here, it would also be a ceiling over the ledge ladder's own landing, which is measured
  // with headroom). Flush means the crown's side faces start exactly where the body's end, so there
  // is no coplanar overlap to z-fight either.
  const T = TOWER;
  out(T.x, 0, T.z, T.w, T.top - 0.4, T.d, CONC);
  out(T.x, T.top - 0.4, T.z, T.w, 0.4, T.d, NEON, 1);                          // the crown
  out(T.x + 0.5, T.top - 0.4, T.z + 0.5, T.w - 1.0, 0.42, T.d - 1.0, SLAB);    // …and the roof itself

  // THE LEDGE LADDER — a STAIRCASE up the tower's west flank, one rung per hands' window. Each rung
  // is a solid column from the deck (a wall the query can actually find, see the header) 2.4 taller
  // than the last, so the SAME jump reads three times: run at a rung, it catches the hands, the hang
  // pulls you onto it, and the next rung is right there. The top rung (7.2) is one `P.STEP` under the
  // tower's own deck, so the ladder's last move is a step across onto the roof.
  // ONE box per rung, and that is not a shortcut: the hands' window is measured off the collider's
  // own top (`topY`), so a decorative cap stacked on a shorter column would put the REAL top 14 cm
  // under the drawn one and the catch would fall out of the window. The rung's own top is the lip.
  for (const L of LADDERS) {
    out(LADDER_X, 0, L.z, LADDER_W, L.top, L.d, SLAB);
  }

  // ---- THE VAULT BENCH: four rails and a crate -----------------------------------------------
  // Thin in Z on purpose — the run is across the box's DEPTH (`VAULT_MAX_DEPTH`), so a rail you vault
  // has to be shallow along the way you are going and wide across it. Four heights inside the vault's
  // own band, so one is a tap and the tall one is the whole move.
  for (let i = 0; i < BENCH.tops.length; i++) {
    out(BENCH.x0 + i * (BENCH.w + BENCH.gap), 0, BENCH.z, BENCH.w, BENCH.tops[i], BENCH.d, RAIL);
  }
  const C = CRATE_BOX;
  out(C.x, 0, C.z, C.w, C.top, C.d, CRATE);   // the deep one: 2.2 along the run, right at the limit

  // ---- THE SLIDE GATE: a slot only a slide fits through ---------------------------------------
  // The body's standing width is 2 * HX = 1.2 and the slide gives up `SLIDE_SHRINK` (0.2) a side
  // (0.96 slid), so the slot has to sit between those two: at 1.15 walking at it is still a wall
  // (0.05 of slack on the standing box) and a slide goes through with 0.09 either side, which is the
  // same bargain the 1.6 slot made with the old 1.8-wide box — and it is within a whisker of the
  // drawn body's own 1.17, so the slot reads as the body's own width rather than as a hole wider
  // than the thing going through it. The two blocks are 4 tall, which is past a double jump's 3.2, so
  // there is no way over it that is not the long way round — and the lintel over the slot is what
  // makes it read as a GATE rather than as a gap between two blocks. Both frames stand PROUD of the
  // mouth (west of x = G.x, and in the blocks' own Z), so nothing here narrows the 1.15 the slide
  // needs.
  const G = GATE;
  const zin = G.z0 + G.thin;
  out(G.x, 0, G.z0, G.w, G.h, G.thin, CONC_X);
  out(G.x, 0, zin + G.gap, G.w, G.h, G.thin, CONC_X);
  out(G.x - 0.05, G.h, zin, G.w + 0.1, 0.62, G.gap, CONC);              // the lintel
  out(G.x - 0.22, 0, G.z0, 0.22, G.h, G.thin, SLAB);                    // a frame down each mouth…
  out(G.x - 0.22, 0, zin + G.gap, 0.22, G.h, G.thin, SLAB);
  out(G.x - 0.22, G.h, G.z0, 0.22, 0.62, G.thin + G.gap + G.thin, SLAB); // …tied across the top
  bins = list;
  return list;
}

// Everything the world needs: the boxes for one chunk (empty for the hundreds that are not here).
export function buildYard(cx, cz, out) {
  if (!bins) build();
  const arr = bins.get(cx + "," + cz);
  if (!arr) return 0;
  for (let i = 0; i < arr.length; i++) out.push(arr[i]);
  return arr.length;
}

// The rectangle nothing may grow in: the whole camp, its run-ups and its landings.
export const YARD_CLEAR = { minX: 0, minZ: -26, maxX: 32, maxZ: 28 };

// ================================================================================================
// THE SIGNS
//
// One per station, hung in the WORLD: a name and a line of what to do, positioned by projecting the
// station's own anchor through the lens that is on screen (the pocket editor's labels do exactly
// this — see `toScreen` in inventory.js, which is where the "never draw one that is behind the lens,
// it projects MIRRORED" rule comes from). A sign fades in as you walk up to it and goes when you
// leave, and it is HIDDEN BEHIND THE WORLD: a ray to the anchor that hits a collider first means
// there is a wall between you and it, so it is not drawn. That is what keeps a nameplate from
// floating over the fight from the far side of a building.
// ================================================================================================
export const STATIONS = [
  // The ring: the fight, the skills and the bag all stand around the spawn, so these four signs are
  // the ones you read first. Their radii are deliberately SMALLER than the distance between them —
  // the ring is a few metres across, and five nameplates in one corner of the screen is worse than
  // none (see `MAX_SHOWN`).
  { n: 0, name: "TRAINING GROUNDS", hint: "walk to a sign — every move in the game is here", x: 5, y: 6.7, z: -5.4, r: 30, big: 1 },
  { n: 1, name: "THE FIGHT", hint: "M1 = the chain · 4th M1 off the deck = DOWN SLAM · SPACE held on the 4th M1 = UPPERCUT · M1+M2 = BLOCK", x: 8.0, y: 3.1, z: -1.2, r: 11 },
  { n: 2, name: "THE SKILLS + THE GRAB", hint: "M2 = grab / the staff · 1 knee · 2 scissor · 3 LAUNCH (throws them up)", x: 1.9, y: 3.1, z: -1.4, r: 11 },
  { n: 3, name: "JUMP PAD", hint: "step on the plate — it throws you up to the roof", x: -5, y: 3.4, z: -5, r: 14 },

  // The field and its edges.
  { n: 4, name: "THE FIELD", hint: "hold a direction to build speed · SPACE twice = double jump", x: 15, y: 3.0, z: 6, r: 19 },
  { n: 5, name: "WALL RUN", hint: "SPACE when a wall is beside you at speed · M1 kicks off", x: 21.2, y: 4.9, z: 11, r: 18 },
  { n: 6, name: "WALL JUMP / WALL CLIMB", hint: "SPACE on a wall bounces · jump, then hold SPACE again to climb", x: 26, y: 4.9, z: 3.0, r: 16 },
  { n: 7, name: "THE LEDGE LADDER", hint: "jump at a rung — the hands catch it · three of them, up onto the roof", x: 10.6, y: 3.2, z: -25.2, r: 15 },
  { n: 8, name: "CLIMB THE TOWER", hint: "jump at the face, then hold SPACE · climb onto the roof · STAMINA is what holds you", x: 16, y: 5.1, z: -15.2, r: 14 },
  { n: 9, name: "ROOF — DIVE / SLAM", hint: "F = DIVE off the edge · X = GROUND SLAM", x: 16, y: 9.9, z: -20.2, r: 14 },
  { n: 10, name: "THE VAULT BENCH", hint: "no button — just RUN at a rail", x: 12, y: 3.3, z: 19.9, r: 16 },
  { n: 11, name: "THE SLIDE GATE", hint: "hold SHIFT at a sprint — only a slide fits · standing, SHIFT = crouch", x: 26, y: 5.3, z: 23.4, r: 16 },

  // The two the yard has no furniture for, because neither needs any: the field is their run-up and
  // their runway, and the sign is the whole station (a move that only exists in the open should be
  // taught in the open — a box to practice a sidestep on would just be in the way of the sidestep).
  { n: 12, name: "THE DASH — Q", hint: "Q + a direction: W = the lunge · A/D = a sidestep · S = the BACKDASH (twist, i-frames)", x: 12.5, y: 3.0, z: 14.5, r: 13 },
  { n: 13, name: "THE BLOCK — M1+M2", hint: "hold both = the guard (walks, turns a fist) · push FORWARD = the CHARGE", x: 18.5, y: 3.0, z: -4, r: 13 },
];

// How many TAGS may stand at once beside the plate. The stations are close together by design (the
// ring's three are inside three metres), so this is not a frame budget — it is what makes the signs
// readable: the one you are standing at explains itself, the ones you can see name themselves, and
// anything past that simply waits until you have walked nearer it.
const MAX_TAGS = 3;

// Where a sign may be nudged to when the HUD's own furniture is standing where it wants to be, in
// preference order, in pixels: UP first (a sign hangs over its station), then down, then aside.
const NUDGE = [[0, 0], [0, -66], [0, -132], [0, 62], [118, -40], [-118, -40], [0, -198]];

export class YardSigns {
  constructor(el, world, camera, player) {
    this.el = el;
    this.world = world;
    this.camera = camera;
    // Distance is read off the PLAYER, not the camera: a sign is "near" when you are STANDING near
    // it, and the chase camera sits five units back — measured from the lens, every sign is one step
    // further away than it feels, which at the spawn is the difference between the ring's signs
    // reading and not.
    this.player = player;
    this.enabled = true;
    this._shown = true;
    this._fwd = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._cand = [];
    this._rects = [];
    this._keep = [{}, {}, {}, {}];
    this.labels = [];
    this._warm = 0;
    if (!el) return;
    for (const s of STATIONS) {
      // TWO elements per station, because the hint is what makes a plate big and a big plate is the
      // whole reason the ring's five signs cannot all stand at once: the station you are standing at
      // wears the PLATE (name + what the move is), and the ones you can see from here wear a TAG
      // (the name alone). Somewhere to walk to, and what to do when you get there.
      const plate = document.createElement("div");
      plate.className = "yardSign" + (s.big ? " big" : "");
      const name = document.createElement("div");
      name.className = "ysName";
      name.textContent = s.name;
      plate.appendChild(name);
      if (s.hint) {
        const hint = document.createElement("div");
        hint.className = "ysHint";
        hint.textContent = s.hint;
        plate.appendChild(hint);
      }
      const tag = document.createElement("div");
      tag.className = "yardTag";
      tag.textContent = s.name;
      el.appendChild(plate);
      el.appendChild(tag);
      this.labels.push({
        s,
        at: new THREE.Vector3(s.x, s.y, s.z),
        plate,
        tag,
        pw: 0, ph: 0, tw: 0, th: 0,
        x: 0, y: 0, px: 0, py: 0, d: 0, a: 1,
        plateOn: false, tagOn: false,
      });
    }
  }

  _size(L, el, wKey, hKey) {
    if (!L[wKey]) {
      el.style.display = "";
      el.style.opacity = "0";
      el.style.transform = "translate(-50%,-100%) translate(" + L.x.toFixed(1) + "px," + L.y.toFixed(1) + "px)";
      L[wKey] = el.offsetWidth || 150;
      L[hKey] = el.offsetHeight || 24;
    }
  }

  // ---- THE WARM-UP (session 142) ----------------------------------------------------------------
  //
  // `_size` puts an element on screen to measure it — `offsetWidth` on a box that has never been laid
  // out — and until this existed every one of those reads landed on the FIRST FRAME THE SIGNS WERE
  // ALLOWED ON SCREEN, which is the first frame after the PLAY press, because `enabled` is
  // `running && …`. Measured on the live page by timing `signs.update` from a patched `GAME.signs`:
  // **21.1 ms on its first call**, then 0.2-0.4 ms on every one after it — and that single call was
  // the whole of the **21 ms of forced style-and-layout** LoAF recorded on the play frame, a frame
  // that measured **42 ms** against the ~7 ms frames either side of it.
  //
  // So the work is done BEFORE the signs are wanted instead of when they are: `main.js` calls this from
  // the game loop on every frame the game is NOT running — the title screen — and it returns
  // immediately once every label is measured.
  //
  // ...and it does them ALL AT ONCE rather than a few a frame, which is the opposite of what a
  // "spread the work out" instinct says and is what the measurement says. A frame of this costs a
  // FORCED LAYOUT (the container changes from `display: none` to laid out, and every read after the
  // first is free), so the floor is one layout per frame whatever the batch size — spread two at a
  // time it was **22.5 / 7.6 / 6.7 / 7.4 ms = 44.2 ms over four frames**, and all fourteen in one go
  // was **12.5 ms, once**. One longer frame at the title (where the screen is a static card) is a
  // better trade than four of them, and both are a better trade than all of it landing on the press.
  //
  // The veil is `visibility`, not `display`: a `display: none` parent gives every child an
  // `offsetWidth` of 0, which is exactly the number being measured. Hidden boxes are still LAID OUT,
  // so the numbers are the real ones and nothing is ever painted. (The `opacity: 0` `_size` leaves on
  // each element is why the container can be put back to `display: none` afterwards without anything
  // flashing: the elements it touched are already invisible on their own.)
  warmStep() {
    const el = this.el;
    if (!el || this._warm >= this.labels.length) return;
    const wasDisplay = el.style.display;
    el.style.display = "";
    el.style.visibility = "hidden";
    for (let i = 0; i < this.labels.length; i++) {
      const L = this.labels[i];
      this._size(L, L.plate, "pw", "ph");
      this._size(L, L.tag, "tw", "th");
    }
    this._warm = this.labels.length;
    el.style.visibility = "";
    el.style.display = wasDisplay;
  }

  // One per frame, AFTER the camera has settled (see the call in main.js's `frame`), so a sign is
  // always on the frame it was placed for.
  //
  // Two passes, because the stations stand metres apart: the first finds every sign that is near
  // enough, in front of the lens and not behind a wall; the second walks them NEAREST FIRST — the
  // nearest takes the plate, the rest take tags — and a sign that would sit on one already up simply
  // waits, so walk two metres and it is the one talking.
  update() {
    const el = this.el;
    if (!el || !this.labels.length) return;
    if (!this.enabled) {
      if (this._shown) {
        el.style.display = "none";
        this._shown = false;
      }
      return;
    }
    if (!this._shown) {
      el.style.display = "";
      this._shown = true;
    }
    const cam = this.camera;
    cam.updateMatrixWorld();
    this._fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cand = this._cand;
    cand.length = 0;
    for (let i = 0; i < this.labels.length; i++) {
      const L = this.labels[i];
      const s = L.s;
      const d = L.at.distanceTo(this.player ? this.player.pos : cam.position);
      if (d >= s.r) continue;
      const reach = L.at.distanceTo(cam.position) - 0.45;
      this._dir.copy(L.at).sub(cam.position).normalize();
      // Only what is in front of the lens: a point behind a perspective camera projects MIRRORED.
      if (this._dir.dot(this._fwd) <= 0.3) continue;
      if (reach > 0.6) {
        // Something solid between the camera and the sign is not a sign you can read.
        const hit = this.world.raycast(
          cam.position.x, cam.position.y, cam.position.z,
          this._dir.x, this._dir.y, this._dir.z, reach
        );
        if (hit) continue;
      }
      const p = this._p.copy(L.at).project(cam);
      L.x = (p.x * 0.5 + 0.5) * W;
      L.y = (0.5 - p.y * 0.5) * H;
      L.d = d;
      L.a = Math.min(1, (s.r - d) / Math.max(1, s.r * 0.32));
      cand.push(L);
    }
    if (cand.length > 1) cand.sort((a, b) => a.d - b.d);
    // THE HUD'S OWN CORNERS ARE KEEP-OUT: a nameplate that lands on the dial or the options row is
    // illegible, and one that lands on the thumb buttons is in the way of playing. A sign that would
    // is lifted (or stepped aside) instead of dropped — it keeps naming its station — and one with
    // nowhere to go is simply not shown.
    const keep = this._keep;
    keep[0] = { x: 0, y: 0, w: 196, h: 252 };            // the dial and the meters under it
    keep[1] = { x: W - 224, y: 0, w: 224, h: 54 };        // OPTIONS / FULLSCREEN
    keep[2] = { x: W - 190, y: 140, w: 190, h: H - 140 }; // the thumb column (touch only — inert on a keyboard)
    keep[3] = { x: 0, y: H - 150, w: 150, h: 150 };       // the duffel panel
    const rects = this._rects;
    rects.length = 0;
    for (let i = 0; i < this.labels.length; i++) {
      this.labels[i].plateOn = false;
      this.labels[i].tagOn = false;
    }
    let tags = 0;
    for (let i = 0; i < cand.length; i++) {
      const L = cand[i];
      const plate = i === 0;               // the station you are standing at does the talking
      if (!plate && tags >= MAX_TAGS) break;
      const el2 = plate ? L.plate : L.tag;
      this._size(L, el2, plate ? "pw" : "tw", plate ? "ph" : "th");
      const w = plate ? L.pw : L.tw;
      const h = plate ? L.ph : L.th;
      let put = null;
      for (let n = 0; n < NUDGE.length; n++) {
        const gx = L.x + NUDGE[n][0];
        const gy = L.y + NUDGE[n][1];
        const rx = gx - w / 2;
        const ry = gy - h;
        let ok = true;
        for (let k = 0; k < keep.length; k++) {
          const o = keep[k];
          if (rx < o.x + o.w && rx + w > o.x && ry < o.y + o.h && ry + h > o.y) { ok = false; break; }
        }
        if (!ok) continue;
        for (let r = 0; r < rects.length; r++) {
          const o = rects[r];
          if (Math.abs(o.x - gx) * 2 < o.w + w && Math.abs(o.y - gy) * 2 < o.h + h) { ok = false; break; }
        }
        if (!ok) continue;
        put = { x: gx, y: gy };
        break;
      }
      if (!put) continue;
      rects.push({ x: put.x, y: put.y, w, h });
      if (plate) { L.plateOn = true; L.px = put.x; L.py = put.y; }
      else { L.tagOn = true; L.px = put.x; L.py = put.y; tags++; }
    }
    for (let i = 0; i < this.labels.length; i++) {
      const L = this.labels[i];
      // Written EVERY frame, on purpose: `_size` puts an element on screen to measure it, and one
      // that then loses the race has to be taken back down — tracking the last state here and
      // writing only on a change is exactly how one gets left hanging.
      L.plate.style.display = L.plateOn ? "" : "none";
      L.tag.style.display = L.tagOn ? "" : "none";
      if (L.plateOn || L.tagOn) {
        const on = L.plateOn ? L.plate : L.tag;
        on.style.transform =
          "translate(-50%,-100%) translate(" + L.px.toFixed(1) + "px," + L.py.toFixed(1) + "px)";
        on.style.opacity = L.a.toFixed(2);
      }
    }
  }
}
