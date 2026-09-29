// THE POLE — the staff you pick up.
//
// A single world object, planted butt-down in the deck with a slight lean beside the spawn, and the
// one thing in the game the player can CARRY: walk up to it and press M2 (see `Player.poleTake` in
// player.js) and it changes hands. Session 143 threw the old "staff form" away — the take used to BE
// an attack that broke the wood on its own last chop — for the user's plain pickup: *"i grab the pole
// normally"*, *"it has its weight it can slow me down a bit"*, *"it has durability"*. The weight is a
// movement multiplier (`P.POLE_CARRY_MUL`), the durability is five strikes (`P.POLE_HP`), and the
// wood's whole job now is to be SPENT: an M1 flurry spends one per flurry and snaps it at zero, an M2
// throw breaks it, and so does the launch a double jump holds on it (all three live in player.js).
//
// THIS FILE OWNS THE PROP, NOT THE MOVES. What the body DOES with the wood — the flurry, the throw,
// the Shaolin balance — lives in player.js (the `POLE_*` numbers and the methods) and its SHAPES in
// streetwear.js (`poleHold` / `posePole`). This file owns the prop itself: how it is modelled, where
// it is planted, the transform the pose hands it to be drawn on, and the two halves it becomes when
// it breaks. There is exactly ONE pole in the world: the hand-planted one at POLE_HOME. It stands
// perfectly still (no sway, no glow pulse, no grow-in) until it is taken, and a broken one stands
// again on the old numbers once its respawn clock runs out.
//
// THE PROP'S OWN `state` IS THE HANDSHAKE: "planted" is the world's, "held" belongs to a body — set on
// the take and cleared by a break, or handed back by `release` when a respawn puts the wood down — and
// that is what stops the same stick being taken twice. `mount` is the ONLY writer of a held prop's
// transform, and it serves the THROW as well as the hands: a thrown staff keeps its own ballistic
// transform (`updatePoleFlight` in player.js hands it here every frame it is in the air), so the prop
// is drawn by one path whether it is in his hands, in flight, or in the deck.
//
// WHAT LIVES WHERE:
//   * `POLE`     — the prop's own numbers (its length, how deep it is planted, how near he must be
//                  to take it). The MOVES' numbers are in player.js's `P` (the `POLE_*` block),
//                  because they are the body's clocks; the staff's own SHAPE is authored in
//                  streetwear.js (the `poleHold*` shapes and `posePole`), because it is a pose.
//   * `Pole`     — the prop: its mesh, the planted pose, the in-range read, the mount, the break.
//   * `Poles`    — the manager: the single prop, its respawn clock, the debris of a break, and the
//                  per-frame tick.
//
// The staff is DRAWN here and POSED in streetwear.js. Session 143 made the CARRY a one-handed haul —
// the old form gripped the shaft with both hands and solved both onto it — so the pose now writes one
// grip point (the carry, and the balance, which hangs off the top by the left arm alone); the strike
// and the throw still put the second hand on, and `posePole` is what decides. In every case one number
// says where the shaft is, the hand(s) are read off it, and `mount` spends the transform.
import * as THREE from "./three.js";
import { createMaterial, attachOutline } from "./ps1.js";
import { mulberry32 } from "./rng.js";

// The prop's own numbers, in WORLD units. `LEN` is the staff's own length against the character's
// drawn height (`P.HY * P.BODY_RATIO` = 2.34). The reference draws the staff at about **1.4 of the
// figure** — measured off the user's own cut of it (`scratch`-side frame grabs, session 83): in the
// guard frame the rod runs 58 px end to end against a 36 px crouched figure and about a 44 px
// standing one, and every other frame of the clip reads in the same 1.3–1.6 band, with the hands
// gripping it near its MIDDLE. So the shipped number is deliberately taller than the figure rather
// than equal to it (the user's *"make the pole taller"*), where the first pass had it at 1.0.
export const POLE = {
  LEN: 3.25,
  R: 0.058,        // the shaft's radius
  SINK: 0.40,      // how much of the butt stands below the deck when it is planted
  LEAN: 0.13,      // the planted tilt off vertical (rad) — nothing in the world stands plumb
  REACH: 2.35,     // how near the player has to be to take it (centre to centre)
  FACE: 1.35,      // ...and how far off his facing the pole may sit (rad)
  SETTLE: 20,      // s a broken pole stays down before it stands again
  // ---- THE SPINE (session 185) ----------------------------------------------------------------
  // *"make the pole have spine animation bones idk whats called and make sure you use when the pole
  // is moving at a high speed to make it look for fluent and animated"*. The shaft is not a rigid
  // rod any more: it bends along its own length as a chain, driven by how fast its TIP is moving
  // RELATIVE TO ITS BUTT — which is the one reading that separates a staff flashing through a
  // swing (a big relative speed: the wood whips) from the same staff merely travelling with a body
  // (none: a rod carried at a sprint is straight). See `bendShaft` / `Poles.stepSpine`.
  SPINE: {
    GAIN: 0.024,   // rad of total bend per u/s of the tip's relative speed
    MAX: 0.40,     // ...and the most it may ever bend by, in total (a rod, not a rope)
    STIFF: 250,    // the spring that pulls it back to straight (rad/s² per rad)
    DAMP: 23,      // ...and what bleeds the wobble off (a hard swing rings once and settles)
    DEAD: 3.0,     // the tip's RELATIVE speed below which nothing is asked for at all (u/s)
  },
};
// The one place in the world the pole is planted: the clearing beside the spawn, off the
// player's left and a step forward, so it is in frame on the very first look. This is the one
// you cannot miss, and it is never recycled.
export const POLE_HOME = { x: 7.7, z: 3.3 };

// ---------------------------------------------------------------------------
// THE SHAPE — a six-sided lathe with a dark butt cap, a dark tip cap and a light grip band, every
// facet flat-shaded from its own normal into the vertex colour (the trick the world geometry uses:
// a PS1 renderer had no per-pixel light, so the SHADE was baked into the vertices).
const WOOD = [0.560, 0.400, 0.262];
const WOOD_HI = [0.700, 0.520, 0.345];
const CAP = [0.190, 0.200, 0.232];
const CAP_HI = [0.268, 0.278, 0.320];
const GRIP = [0.845, 0.700, 0.290];
const GRIP_HI = [0.960, 0.830, 0.420];
const SEG = 6;

function lathe(rings, capLo, capHi) {
  const pos = [];
  const nrm = [];
  const col = [];
  const idx = [];
  const pts = rings.map((r) => {
    const out = [];
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2 + Math.PI / SEG;
      out.push([Math.cos(a) * r.r, r.y, Math.sin(a) * r.r]);
    }
    return out;
  });
  const push = (p, n, c) => {
    pos.push(p[0], p[1], p[2]);
    nrm.push(n[0], n[1], n[2]);
    col.push(c[0], c[1], c[2]);
    return pos.length / 3 - 1;
  };
  const lit = (c, up, side) => {
    const k = 0.52 + 0.34 * up + 0.20 * side;
    return [c[0] * k, c[1] * k, c[2] * k];
  };
  for (let s = 0; s < rings.length - 1; s++) {
    const c = [
      (rings[s].c[0] + rings[s + 1].c[0]) * 0.5,
      (rings[s].c[1] + rings[s + 1].c[1]) * 0.5,
      (rings[s].c[2] + rings[s + 1].c[2]) * 0.5,
    ];
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      const a = pts[s][i];
      const b = pts[s][j];
      const d = pts[s + 1][j];
      const e = pts[s + 1][i];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = e[0] - a[0], vy = e[1] - a[1], vz = e[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const cc = lit(c, Math.max(0, ny), 0.5 + 0.5 * (nz * 0.5 - nx * 0.86));
      const k = [
        push(a, [nx, ny, nz], cc),
        push(b, [nx, ny, nz], cc),
        push(d, [nx, ny, nz], cc),
        push(e, [nx, ny, nz], cc),
      ];
      idx.push(k[0], k[1], k[2], k[0], k[2], k[3]);
    }
  }
  const cap = (ringPts, y, c, flip) => {
    const cc = lit(c, flip ? 0 : 1, 0.55);
    const mid = push([0, y, 0], [0, flip ? -1 : 1, 0], cc);
    const ring = ringPts.map((p) => push(p, [0, flip ? -1 : 1, 0], cc));
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      if (flip) idx.push(mid, ring[j], ring[i]);
      else idx.push(mid, ring[i], ring[j]);
    }
  };
  cap(pts[0], rings[0].y, capLo, true);
  cap(pts[pts.length - 1], rings[rings.length - 1].y, capHi, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("aColor", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

// The stations of the shaft, as fractions of whatever piece is being built (0 = butt, 1 = tip).
const STATIONS = [
  { t: 0.000, r: 0.74, c: CAP },
  { t: 0.070, r: 0.94, c: CAP_HI },
  { t: 0.110, r: 1.00, c: WOOD },
  { t: 0.400, r: 1.00, c: WOOD_HI },
  { t: 0.462, r: 1.10, c: GRIP },
  { t: 0.538, r: 1.10, c: GRIP_HI },
  { t: 0.600, r: 1.00, c: WOOD_HI },
  { t: 0.890, r: 1.00, c: WOOD },
  { t: 0.930, r: 0.94, c: CAP_HI },
  { t: 1.000, r: 0.74, c: CAP },
];

function piece(lo, hi) {
  const L = POLE.LEN;
  const y0 = lo * L - L * 0.5;
  const span = (hi - lo) * L;
  const rings = STATIONS.map((s) => ({
    y: y0 + span * ((s.t - lo) / (hi - lo)),
    r: POLE.R * s.r,
    c: s.c,
  }));
  return lathe(rings, CAP, CAP);
}

let GEO = null;
let GEO_LO = null;
let GEO_HI = null;
let BUILT = false;
// The shaft's REST shape, kept beside the geometry it came from: the spine is a pure function of the
// frame (see `bendShaft`), so every vertex is written from its own rest value every time and nothing
// accumulates. `_REST_N` is the rest NORMALS, which the same rotation carries (the shape is bent, not
// scaled, so the normals are only turned).
let GEO_REST = null;
let GEO_REST_N = null;

function build() {
  if (BUILT) return;
  BUILT = true;
  GEO = piece(0, 1);
  GEO_LO = piece(0, 0.502);
  GEO_HI = piece(0.498, 1);
  GEO_REST = Float32Array.from(GEO.getAttribute("position").array);
  GEO_REST_N = Float32Array.from(GEO.getAttribute("normal").array);
}

// ---------------------------------------------------------------------------
// THE SPINE — THE SHAFT IS NOT A RIGID ROD (session 185).
//
// The user: *"make the pole have spine animation bones idk whats called and make sure you use when
// the pole is moving at a high speed to make it look for fluent and animated"*. A five-station lathe
// turn is a brick; the one thing that separates a rod being WAVED from a rod being SWUNG is that the
// swinging one whips, and the whip is a bend travelling out toward the tip. So the shaft is bent as a
// chain here: every vertex is placed on an ARC of constant curvature whose start is the butt, and the
// curvature is a number the per-frame tick solves (see `Poles.stepSpine`). Six-sided and flat-shaded
// as it is, that reads as the wood flexing, and it costs a few hundred flops a frame.
//
// WHAT DRIVES IT. Not the tip's speed — a staff carried at a sprint moves at 36 u/s and is perfectly
// straight, and a bend driven by speed would have it flapping about the whole time the player was
// running. The driver is the tip's speed RELATIVE TO THE BUTT, which is zero for any rigid motion
// (translation and a body turning together) and large exactly when the rod is being turned about
// something near its own grip: a swing, a whip, a throw. That is the whole physical content of the
// effect, and it is why the reading is taken in the SHAFT'S OWN frame — the wood bends in the plane
// it is being swept through, not in the world's.
//
// THE BEND IS AN ARC, not a noise or a lag, because an arc is what a beam actually does under load:
// `bendVec` is the TOTAL turn (a lateral vector in the shaft's own local XZ plane, radians), so its
// magnitude over `POLE.LEN` is the curvature, and a vertex `s` along the shaft sits at
//
//     P = butt + (sin φ / κ) U + ((1 - cos φ) / κ) B̂        φ = κ·s,  κ = |bendVec| / L
//
// with the cross-section (and the normal) carried round by the same turn — `R(φ)` about `A = U × B̂`.
// At `φ` 0 that is the rest shaft exactly, so the shape is a no-op when nothing is swinging.
const _spB = new THREE.Vector3();
const _spA = new THREE.Vector3();
const _spTip = new THREE.Vector3();
const _spButt = new THREE.Vector3();
const _spV = new THREE.Vector3();
const _spN = new THREE.Vector3();
const _spQ = new THREE.Quaternion();

function bendShaft(geo, restPos, restNrm, bx, bz) {
  const pos = geo.getAttribute("position");
  const nrm = geo.getAttribute("normal");
  const pa = pos.array;
  const na = nrm.array;
  const n = pos.count;
  const L = POLE.LEN;
  const k = Math.hypot(bx, bz);
  if (k < 1e-5) {
    pa.set(restPos);
    na.set(restNrm);
    pos.needsUpdate = true;
    nrm.needsUpdate = true;
    return;
  }
  const kap = k / L;
  const inv = 1 / kap;
  _spB.set(bx / k, 0, bz / k);
  _spA.set(_spB.z, 0, -_spB.x);          // A = U x B: the axis the cross-section turns about
  const ax = _spA.x, ay = _spA.y, az = _spA.z;
  const y0 = -L * 0.5;
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    const s = restPos[j + 1] - y0;        // how far along the REST shaft this vertex is (from the butt)
    const phi = kap * s;
    const sp = Math.sin(phi);
    const cr = Math.cos(phi);
    const k3 = 1 - cr;
    // the centreline point at that station
    const ox = _spB.x * k3 * inv;
    const oy = y0 + sp * inv;
    const oz = _spB.z * k3 * inv;
    // ...and the vertex's own offset and normal, carried round by the same rotation (Rodrigues
    // about A, whose `y` is zero because A is lateral): v' = v cos + (A x v) sin + A (A.v)(1 - cos)
    const x = restPos[j], y = restPos[j + 1], z = restPos[j + 2];
    const dv = ax * x + az * z;
    pa[j] = ox + x * cr + ay * z * sp + ax * dv * k3;
    pa[j + 1] = oy + (az * x - ax * z) * sp;
    pa[j + 2] = oz + z * cr - ay * x * sp + az * dv * k3;
    const nx = restNrm[j], ny = restNrm[j + 1], nz = restNrm[j + 2];
    const dn = ax * nx + az * nz;
    na[j] = nx * cr + ay * nz * sp + ax * dn * k3;
    na[j + 1] = ny * cr + (az * nx - ax * nz) * sp + ay * dn * k3;
    na[j + 2] = nz * cr - ay * nx * sp + az * dn * k3;
  }
  pos.needsUpdate = true;
  nrm.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// ONE PROP.
//
// `state`:
//   "planted" — standing there, takeable;
//   "held"    — a body owns it: mounted onto his rig while it is in his hands, or onto its own
//               ballistic transform while a throw has it in the air (see `mount`);
//   "gone"    — in two halves and splinters; the pole is on its respawn clock.
class Pole {
  constructor(scene, site, x, z, groundY, seed, material) {
    build();
    this.scene = scene;
    this.site = site;
    this.x = x;
    this.z = z;
    this.groundY = groundY;
    this.seed = seed;
    const rng = mulberry32(seed);
    this.rng = rng;
    this.lean = POLE.LEAN * (0.35 + rng() * 1.3);
    this.leanDir = rng() * Math.PI * 2;
    this.state = "planted";
    this.debris = null;
    // ONE material for the one pole, with a faint warm emissive baked in so the shaft never
    // goes flat. It never changes at runtime: the pole stands perfectly still.
    this.mat = material || createMaterial({ minLight: 0.34, cel: 1, celBands: 3, emissive: 0.18, rim: 0.58, rimPow: 2.2 });
    this.mat.uniforms.uEmissive.value.setRGB(0.15 * 0.62, 0.15 * 0.52, 0.15 * 0.34);
    // THE PLANTED TRANSFORM, kept whole: the mover blends the form's authored path against the
    // prop's own frame (see `Player.updateVisual`), and it cannot ask the mesh for it once the mesh
    // has been MOUNTED — the mount overwrites exactly the thing it needs.
    this.plantM = new THREE.Matrix4();
    this.mesh = new THREE.Mesh(GEO, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    attachOutline(this.mesh, GEO, 0.62);
    // THE OUTLINE'S OWN REST SHAPE, so the ink bends with the wood. The shell's geometry is WELDED
    // (see `weldedNormalGeometry`), so it is its own vertex list with its own count — and the hit
    // FLASH is hung on the very same geometry object, so there is one array to write and the two
    // cannot disagree. `isOutline` is how the shell is found among the mesh's children.
    this.shell = this.mesh.children.find((c) => c.userData && c.userData.isOutline) || null;
    this.shellRest = this.shell ? Float32Array.from(this.shell.geometry.getAttribute("position").array) : null;
    this.shellRestN = this.shell ? Float32Array.from(this.shell.geometry.getAttribute("normal").array) : null;
    // ...and THE SPINE's own state: the bend it is being drawn with (a lateral vector in the shaft's
    // own frame whose magnitude is the total turn, see `bendShaft`), the velocity of that bend (the
    // spring that makes a hard swing ring), and where the two ENDS were last frame — which is the
    // whole of what the driver reads (`Poles.stepSpine`). `spineInit` is false until the first tick,
    // so the first frame of a pole that has just been moved into place cannot invent a velocity.
    this.bend = new THREE.Vector3();
    this.bendV = new THREE.Vector3();
    this.prevTip = new THREE.Vector3();
    this.prevButt = new THREE.Vector3();
    this.spineInit = false;
    scene.add(this.mesh);
    // The two halves are built UP FRONT and kept hidden: a break happens on the frame the staff
    // meets the deck, and building geometry on that frame would hitch the whole game.
    this.lo = new THREE.Mesh(GEO_LO, this.mat);
    this.hi = new THREE.Mesh(GEO_HI, this.mat);
    this.lo.frustumCulled = false;
    this.hi.frustumCulled = false;
    this.lo.renderOrder = 4;
    this.hi.renderOrder = 4;
    this.lo.visible = false;
    this.hi.visible = false;
    attachOutline(this.lo, GEO_LO, 0.62);
    attachOutline(this.hi, GEO_HI, 0.62);
    scene.add(this.lo);
    scene.add(this.hi);
    this.place();
  }

  // WHERE THE MESH IS. Planted: a point on the deck with a lean. Held: whatever
  // `Poles.mount` wrote. One function owns the planted transform so nothing can half-write it.
  place() {
    this.mesh.position.set(this.x, this.groundY - POLE.SINK + POLE.LEN * 0.5, this.z);
    const l = this.lean;
    this.mesh.rotation.set(Math.cos(this.leanDir) * l, 0, -Math.sin(this.leanDir) * l);
    this.mesh.updateMatrix();
    this.plantM.copy(this.mesh.matrix);
    // A pole that has just been MOVED has no velocity: the spine starts each pose from straight.
    this.spineInit = false;
    this.bend.set(0, 0, 0);
    this.bendV.set(0, 0, 0);
  }

  // A respawn stands the pole again on the same numbers, ready to take on the spot.
  replant() {
    const rng = mulberry32(this.seed);
    this.rng = rng;
    this.lean = POLE.LEAN * (0.35 + rng() * 1.3);
    this.leanDir = rng() * Math.PI * 2;
    this.state = "planted";
    this.debris = null;
    this.mesh.visible = true;
    this.lo.visible = false;
    this.hi.visible = false;
    this.place();
  }

  // THE STAFF GOES. `dir` is the direction the tip was travelling when it broke (the strike's own
  // line), `axis` the world direction the shaft ran in, `atY` the height it was at. The butt half
  // is thrown back up the line it came down, the tip half on along it, both tumbling about a
  // horizontal axis — which is what a staff that snapped at the deck actually does.
  //
  // BOTH HALVES ARE PLACED ON THE CUT, not spread along it: `piece()` builds each half in the FULL
  // staff's own frame (`GEO_LO` runs from the butt to the middle, `GEO_HI` from the middle to the
  // tip), so the two of them standing at the same transform ARE the staff — which is what the
  // frame of the break has to look like. Spreading them by half a half-length instead would snap
  // the staff into two pieces with a metre of daylight between them on the very frame it broke.
  break_(dirX, dirZ, power, axisX, axisY, axisZ, atY) {
    this.state = "gone";
    this.mesh.visible = false;
    this.debris = [];
    const spawn = (mesh, along, away) => {
      mesh.visible = true;
      mesh.position.set(this.x, atY, this.z);
      mesh.quaternion.copy(this.mesh.quaternion);
      const sp = 4.6 + power * 6.4;
      this.debris.push({
        mesh,
        v: new THREE.Vector3(
          dirX * sp * (1 - away * 0.5) + away * axisX * sp * 0.8,
          3.0 + power * 4.0 + (away > 0 ? 1.2 : 0),
          dirZ * sp * (1 - away * 0.5) + away * axisZ * sp * 0.8
        ),
        w: new THREE.Vector3(5 + power * 14, (this.rng() - 0.5) * 3, (this.rng() - 0.5) * 18),
        rest: 0,
      });
    };
    spawn(this.lo, -1, -1);
    spawn(this.hi, 1, 1);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.lo);
    this.scene.remove(this.hi);
  }
}

// ---------------------------------------------------------------------------
// THE MANAGER.
//
// There is exactly ONE pole: the hand-planted one at POLE_HOME. No streaming, no lattice, no
// recycling. The manager owns it, its respawn clock, and the debris pass for its two halves.
export class Poles {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cool = new Map();     // site key -> seconds left before the pole stands again
    build();
    const gy = world ? world.terrainHeight(POLE_HOME.x, POLE_HOME.z) : 0;
    this.home = new Pole(scene, "home", POLE_HOME.x, POLE_HOME.z, gy, 0x9e37, null);
  }

  props() {
    return this.home ? [this.home] : [];
  }

  // The prop the player can take right now, or null: the nearest one whose direction is inside his
  // facing cone, ranked by distance with a bias against anything off to the side.
  nearest(x, z, fx, fz) {
    let best = null;
    let bestScore = Infinity;
    for (const p of this.props()) {
      if (p.state !== "planted") continue;
      const dx = p.x - x;
      const dz = p.z - z;
      const d = Math.hypot(dx, dz);
      if (d > POLE.REACH) continue;
      const ahead = d > 0.4 ? Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d))) : 0;
      if (ahead > POLE.FACE) continue;
      const score = d + ahead * 1.1;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  // THE MOUNT. While the move runs, the player hands the staff's own transform here — in the
  // character's frame, already blended by him (see `Player.updateVisual`) — and it is spent as the
  // prop's world transform. This is the ONLY writer of a held prop's transform.
  mount(p, m) {
    if (!p) return;
    m.decompose(_vA, _qA, _scl);
    p.mesh.position.copy(_vA);
    p.mesh.quaternion.copy(_qA);
  }

  // The move is finished with it before the break (i.e. it let go): back to the deck it came from.
  release(p) {
    if (!p) return;
    if (p.state === "held") {
      p.state = "planted";
      p.place();
    }
  }

  // The pole broke. `at` is the world point it went at, `dir` the strike's own line, `axis`
  // the way the shaft ran there, `power` how hard.
  shatter(p, at, dirX, dirZ, axisX, axisY, axisZ, power) {
    if (!p) return;
    p.x = at.x;
    p.z = at.z;
    p.break_(dirX, dirZ, power, axisX, axisY, axisZ, at.y);
    this.cool.set(p.site, POLE.SETTLE);
  }

  tickCool(dt) {
    if (this.cool.size === 0) return;
    for (const [k, v] of this.cool) {
      const n = v - dt;
      if (n <= 0) this.cool.delete(k);
      else this.cool.set(k, n);
    }
  }

  update(dt, player, effects) {
    this.tickCool(dt);
    if (!this.home) return;
    // A pole that has been broken for `POLE.SETTLE` seconds stands again on the old numbers, so
    // the landmark is never permanently spent.
    if (this.home.state === "gone" && !this.cool.has("home")) this.home.replant();
    // THE SPINE (see `bendShaft`): however the prop is being held, thrown or planted, the shaft is
    // bent once a frame from the motion of its own two ends. It is the LAST writer of the shaft's
    // geometry, so whatever the mount wrote this frame is what it reads.
    this.stepSpine(dt, this.home);
    // The planted pole stands perfectly still: no sway, no glow pulse, nothing per-frame. The
    // only thing that moves is the debris of its two halves after a break.
    if (this.home.state === "gone") this.stepDebris(this.home, dt, effects);
  }

  // -------------------------------------------------------------------------
  // THE SPINE, ONE FRAME. Everything here is one reading taken twice: where the shaft's two ends
  // are NOW, and where they were LAST frame. The difference is the tip's velocity RELATIVE TO THE
  // BUTT — the one number that tells a rod being swung (big) from a rod being carried (nothing,
  // however fast the body runs) — and it is taken in the shaft's own frame so the bow lies in the
  // plane the wood is actually being swept through.
  //
  // The rest is a spring: the ASK is `-GAIN · relative speed` (the wood trails the way its tip is
  // being thrown), capped at `MAX` so the shaft stays a rod, and `bend` chases it through an
  // underdamped spring so a hard swing overshoots once and settles instead of snapping back.
  // `writeSpine` spends it — the geometry is rewritten from its REST arrays every frame, so
  // nothing accumulates and the bend can never drift.
  stepSpine(dt, p) {
    const S = POLE.SPINE;
    const mesh = p.mesh;
    if (!mesh.visible) {
      p.bend.set(0, 0, 0);
      p.bendV.set(0, 0, 0);
      p.spineInit = false;
      return;
    }
    mesh.updateMatrix();
    _spTip.set(0, POLE.LEN * 0.5, 0).applyMatrix4(mesh.matrix);
    _spButt.set(0, -POLE.LEN * 0.5, 0).applyMatrix4(mesh.matrix);
    if (!p.spineInit || dt < 1e-6) {
      // The first frame of a pose (or a frame with no time in it) has no velocity in it: the ends
      // are recorded and the shaft is drawn straight, so a pole that has just been planted, taken
      // or respawned cannot snap into a bow off a teleport.
      p.prevTip.copy(_spTip);
      p.prevButt.copy(_spButt);
      p.spineInit = true;
      p.bend.set(0, 0, 0);
      p.bendV.set(0, 0, 0);
      this.writeSpine(p);
      return;
    }
    const inv = 1 / dt;
    _spV.copy(_spTip).sub(p.prevTip).multiplyScalar(inv)
      .sub(_spN.copy(_spButt).sub(p.prevButt).multiplyScalar(inv));
    _spQ.copy(mesh.quaternion).invert();
    _spV.applyQuaternion(_spQ);
    p.prevTip.copy(_spTip);
    p.prevButt.copy(_spButt);
    const lat = Math.hypot(_spV.x, _spV.z);
    let tx = 0;
    let tz = 0;
    if (lat > S.DEAD) {
      const g = -S.GAIN * (1 - S.DEAD / lat);
      tx = _spV.x * g;
      tz = _spV.z * g;
      const m = Math.hypot(tx, tz);
      if (m > S.MAX) {
        tx *= S.MAX / m;
        tz *= S.MAX / m;
      }
    }
    p.bendV.x += (tx - p.bend.x) * S.STIFF * dt;
    p.bendV.z += (tz - p.bend.z) * S.STIFF * dt;
    const bleed = Math.max(0, 1 - S.DAMP * dt);
    p.bendV.x *= bleed;
    p.bendV.z *= bleed;
    p.bend.x += p.bendV.x * dt;
    p.bend.z += p.bendV.z * dt;
    if (Math.abs(p.bend.x) < 1e-4 && Math.abs(p.bend.z) < 1e-4 &&
      Math.abs(p.bendV.x) < 1e-3 && Math.abs(p.bendV.z) < 1e-3) {
      p.bend.set(0, 0, 0);
      p.bendV.set(0, 0, 0);
    }
    this.writeSpine(p);
  }

  // ...and the write: the shaft's own geometry, and the ink hung on it (the shell's is WELDED, so it
  // is a different vertex list — see the note in the constructor). Both are bent from their rest
  // arrays by the same arc, so the two can never disagree about where the wood went.
  writeSpine(p) {
    bendShaft(GEO, GEO_REST, GEO_REST_N, p.bend.x, p.bend.z);
    if (p.shell) bendShaft(p.shell.geometry, p.shellRest, p.shellRestN, p.bend.x, p.bend.z);
  }

  // The two halves and the splinters. A staff that snapped at the deck: both pieces leave with the
  // strike's own speed, tumble about a horizontal axis, bounce on the deck, settle, then sink out
  // of the world. Dust comes off the ground each time one lands.
  stepDebris(p, dt, effects) {
    if (!p.debris) return;
    for (const d of p.debris) {
      if (d.rest > 0) {
        d.rest -= dt;
        if (d.rest <= 0) d.mesh.visible = false;
        continue;
      }
      d.v.y -= 26 * dt;
      d.mesh.position.x += d.v.x * dt;
      d.mesh.position.y += d.v.y * dt;
      d.mesh.position.z += d.v.z * dt;
      d.mesh.rotation.x += d.w.x * dt;
      d.mesh.rotation.z += d.w.z * dt;
      const floor = (this.world ? this.world.topBelow(d.mesh.position.x, d.mesh.position.z, d.mesh.position.y + 0.4, 3) : 0) + 0.06;
      if (d.mesh.position.y <= floor && d.v.y < 0) {
        d.mesh.position.y = floor;
        d.v.y = -d.v.y * 0.34;
        d.v.x *= 0.5;
        d.v.z *= 0.5;
        d.w.multiplyScalar(0.42);
        if (effects) effects.puff(d.mesh.position.x, floor, d.mesh.position.z, 0.7, [0.62, 0.56, 0.44], 0.2);
        if (Math.abs(d.v.y) < 1.4) {
          d.v.set(0, 0, 0);
          d.w.set(0, 0, 0);
          d.rest = 2.6 + Math.random() * 1.4;
        }
      }
    }
  }

  clear() {
    if (this.home) {
      this.home.dispose();
      this.home = null;
    }
    this.cool.clear();
  }

  // A respawn stands the pole again and clears its clock. A held one is let go where it was
  // planted.
  reset() {
    this.cool.clear();
    for (const p of this.props()) {
      if (p.state === "gone") p.replant();
      else if (p.state === "held") {
        p.state = "planted";
        p.place();
      }
    }
  }
}

const _scl = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _vA = new THREE.Vector3();
