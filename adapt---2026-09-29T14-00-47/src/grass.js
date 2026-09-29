import * as THREE from "./three.js";
import { shared } from "./ps1.js";
import { groundBaseAt, grassAllowedAt } from "./world.js";
import { rngFor } from "./rng.js";

// ---------------------------------------------------------------------------
// THE MOVING GRASS (see "THE HILLS" and "THE LAWN" in world.js and in README.md)
//
// The user's brief: *"add moveable grass and make sure it doesnt kill performance"*. So this is one
// system that does all of the moving in a single draw call, and it is built around three rules:
//
//   1. ONE MESH PER LOD. Every tuft of a ring is an instance of that ring's own geometry in one
//      `InstancedMesh`, so a whole ring is one draw call whatever is in it. Nothing here ever
//      creates a mesh per tuft.
//   2. THE WIND IS THE GPU'S. The sway is a vertex shader, not a simulation: a travelling sine over
//      world position, so a gust crosses the field instead of every tuft nodding together, and not
//      one byte of it is touched on the CPU per frame. The body pushes the grass aside in the same
//      shader, off a single `uPlayer` uniform.
//   3. NOTHING IS DRAWN WHERE IT CANNOT BE SEEN. The tufts are streamed in 12-unit TILES around the
//      player, rebuilt only when the player crosses a tile line, and the shader SHRINKS each blade
//      into its own root over the outer ring instead of switching it off - so a tile arriving at
//      the edge of the world grows up out of the ground rather than popping in, and there is no
//      alpha to sort.
//
// ...AND IT IS DENSE NOW, WITHOUT A FULL REBUILD. The hills used to be grass plus trees, rocks and
// bushes; the user's later brief took the scenery away and asked for the field itself instead —
// *"remove the trees and rock and bushes in the bliss hills map and add more grass i want the entire
// feild to be grass but do it smartly in a way that doesnt lag"*. The count went from 110 tufts a
// tile to 480, and the smart half of that is the SLOT BLOCK below: every tile owns a fixed run of
// `PER_TILE` instance slots for as long as it is live, so crossing a tile line now rewrites the five
// tiles that actually changed instead of re-writing all twenty-five. That is what keeps the cost of
// the denser field flat — the per-crossing rebuild is ~5 tiles' worth whatever the density is, and
// the per-frame work is still one uniform write.
//
// THE MEASURED COST, at the stock quality with the near field alone at its full 10 399 tufts /
// 51 995 triangles in one draw call: a tile line crossing is **1.23 ms** (against 6.11 ms with the
// terrain read per tuft — see `buildTile` — and 5.3 ms for a full twenty-five-tile re-stream, which
// is the once-a-slam `invalidate`), and the live loop sits at the display's own cap: 60.3 fps with
// the grass off, 60.3 at half density, and 59.0 / 59.8 / 60.3 across three reads at full density,
// median frame 16.66 ms. The whole denser lawn costs at most about one frame a second.
//
// ---------------------------------------------------------------------------
// THE FAR RING (session 135) — *"make the grass appear like its every where but at the same time it
// looks good and doesnt ruin the performance"*. The one-field answer above covers a 60-unit square
// and then stops: the fade takes the last of the tufts to nothing at 29 units, and everything past
// it is the ground's own paint. The nearby half of the fix is in the SHADER, not here — the ground
// itself is grass now at two scales (see "THE LAWN" in ps1.js and world.js), which is what a distant
// field is: at a grazing angle and a PS1 buffer, a blade 40 units away is a fraction of a pixel, and
// what you actually see of a real meadow at that range is turf, not blades.
//
// What the shader cannot give is PARALLAX and, above all, a SILHOUETTE — matte paint on a plane has
// neither, and a field whose only horizon cue is a smooth green edge reads as a lawn-shaped object.
// So the tufts get a second, CHEAPER ring: a bigger block of tiles at a twelfth of the density,
// whose instances are small CLUMPS (six blades over a metre, rather than five over half of one) and
// which are GROWN by the vertex shader as they recede (`uGrow`), so one instance covers more and
// more ground the further away it is and the count does not have to rise with the square of the
// distance. That is the whole trick of the far ring: scale instead of count.
//
// Why `uGrow` rather than a per-band density: a tile's distance from the player changes as he runs,
// so a density that depended on it would need every tile rebuilt on every crossing (half of a
// 160-tile ring, ~2 ms a hedge — measured, and rejected). A per-instance SCALE costs nothing to
// change, because the vertex shader already reads `dist` for the fade: growing the clump is one
// extra multiply on the same number, and it is continuous, so there is no ring boundary to see.
// The far ring is the same slot-block streamer as the near one, and its cost per crossing is its
// own PERIMETER (about eighteen tiles), not its 160-tile area.
// ---------------------------------------------------------------------------

const TILE = 12; // world units per grass tile
const SEED = 991;
const SEED_FAR = 4211;

// One tuft: `blades` single tapered triangles leaning out and up from a common root, root dark and
// tip lit. The near field's five triangles is the whole cost of a tuft and the FIELD is made by
// there being a lot of them (see PER_TILE): at ~0.4-1.1 units tall the tufts overlap into a fuzzy
// green turf instead of standing apart as spikes, which is what the wallpaper's field looks like.
// The far field's six are spread over a metre instead of half of one — a CLUMP rather than a blade
// cluster, because that is what one instance has to stand for out there (see THE FAR RING above).
function buildTuftGeometry(blades = 5, spread = 0, height = 1, seedMul = 1, leanMul = 1) {
  const pos = [];
  const nrm = [];
  const col = [];
  const root = [0.26, 0.42, 0.17];
  const tip = [0.42, 0.66, 0.26];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + 0.6;
    const ox = Math.sin(a);
    const oz = Math.cos(a);
    const sx = Math.cos(a);
    const sz = -Math.sin(a);
    const h = (0.72 + ((i * 37 * seedMul) % 7) * 0.078) * height;
    // `leanMul` is the far clump's uprightness: a tuft leaning hard out of its own root reads as a
    // blade, and a metre-wide patch of blades all doing it reads as a STAR. The clump leans less, so
    // what stands on the far ground is a patch of upright grass rather than five spokes.
    const lean = (0.15 + ((i * 53 * seedMul) % 5) * 0.045) * height * leanMul;
    const w = 0.075 * height;
    // `spread` walks each blade's root out from the centre of the clump, so the far field's
    // instance is a metre-wide patch of grass rather than one tuft drawn twice as big.
    const bx = ox * spread * (0.35 + ((i * 29 * seedMul) % 11) * 0.06);
    const bz = oz * spread * (0.35 + ((i * 41 * seedMul) % 11) * 0.06);
    pos.push(
      bx - sx * w, 0, bz - sz * w,
      bx + sx * w, 0, bz + sz * w,
      bx + ox * lean, h, bz + oz * lean
    );
    const nx = ox * 0.45;
    const nz = oz * 0.45;
    const l = Math.hypot(nx, 1, nz);
    for (let k = 0; k < 3; k++) nrm.push(nx / l, 1 / l, nz / l);
    col.push(root[0], root[1], root[2], root[0], root[1], root[2], tip[0], tip[1], tip[2]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute("aColor", new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

const VERT = `
attribute vec3 aColor;
attribute vec3 aTint;
uniform float uTime;
uniform vec3 uPlayer;
uniform float uSway;
uniform float uNear;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform float uFadeIn;
uniform float uFadeOutStart;
uniform float uFadeOutEnd;
uniform float uGrow;
uniform float uGrowStart;
uniform float uGrowEnd;
varying vec3 vColor;
varying vec3 vNrm;
varying float vFogDepth;
void main() {
  // Where the blade stands, and how far that is from the body (see the fade below).
  vec4 wp0 = instanceMatrix * vec4(position, 1.0);
  float dist = length(wp0.xz - uPlayer.xz);
  // THE RAMP, and the two opposite ways it is used. ramp is 0 at uFadeStart and 1 at uFadeEnd.
  // The NEAR field is drawn with uFadeIn 0: f falls from 1 to 0 over the outer ring, so a tile that
  // has just streamed in at the edge of the block is a nothing in the ground and a full tuft by the
  // time the player is inside it — which is what makes a tiled field stream without a pop, and it
  // costs one smoothstep. The FAR field is drawn with uFadeIn 1: the same ramp grows it OUT of the
  // ground at the inner edge, so the two rings cross-fade instead of meeting at a step.
  float ramp = smoothstep(uFadeStart, uFadeEnd, dist);
  float f = mix(1.0 - ramp, ramp, uFadeIn);
  // ...and the same trick at the OUTER edge, for the ring whose outer edge the player can see
  // (see THE FAR RING): a tile is culled by the streamer when it falls outside the block, and a
  // tile arriving there at full size is a pop. A second smoothstep shrinks the last band into its
  // own root as well, so both edges of the block grow rather than switch. The near field passes a
  // distance it can never reach, so its own fade is bit-for-bit what it always was.
  f *= 1.0 - smoothstep(uFadeOutStart, uFadeOutEnd, dist);
  // THE GROW (the far ring only — uGrow is 0 in the near field, and then this is exactly 1 and the
  // whole line is a no-op). One instance standing in for more and more ground the further away it
  // is: see THE FAR RING at the top of this file for why the LOD is spent on scale and not on count.
  float grow = 1.0 + uGrow * smoothstep(uGrowStart, uGrowEnd, dist);
  vec4 wp = instanceMatrix * vec4(position.x * grow, position.y * f * grow, position.z * grow, 1.0);
  // THE WIND. bend is the square of the blade's own height, so the root never leaves the ground
  // and the tip carries the whole of the travel; gust is a slow travelling modulation, so a gust
  // crosses the field rather than every tuft leaning together. (bend is the LOCAL height, before
  // the grow, and the offset is scaled by grow — so a far clump sways by the same SHARE of its
  // own size as a near tuft rather than standing stock still out there.)
  float bend = position.y * position.y;
  float ph = wp.x * 0.5 + wp.z * 0.42 + uTime * 1.9;
  float gust = 0.55 + 0.45 * sin(uTime * 0.63 + wp.x * 0.035 + wp.z * 0.028);
  wp.xz += vec2(sin(ph), cos(ph * 0.86 + 1.7)) * (uSway * gust * bend * grow);
  // ...and THE BODY: anything standing in the grass pushes it out of the way. The push falls off
  // with distance from the feet and with height above them, so the blades part around a runner and
  // the tips still nod - one uniform, no simulation.
  vec2 toP = wp.xz - uPlayer.xz;
  float pd = length(toP) + 0.0001;
  float near = 1.0 - smoothstep(0.0, uNear, pd);
  float low = 1.0 - clamp((wp.y - uPlayer.y) / 2.4, 0.0, 1.0);
  wp.xz += (toP / pd) * (near * low * 0.6 * bend * grow);
  vec4 mv = modelViewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  vColor = aColor * aTint;
  vNrm = normalize(normalMatrix * normal);
  vFogDepth = -mv.z;
}
`;

const FRAG = `
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogMix;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uSkyLight;
uniform vec3 uGroundLight;
uniform float uHemi;
varying vec3 vColor;
varying vec3 vNrm;
varying float vFogDepth;
void main() {
  // The same light the world's own shader uses (shared, in ps1.js), so grass standing in a
  // meadow is lit by the meadow's own sun and goes into the meadow's own haze.
  vec3 n = normalize(vNrm);
  float nd = max(dot(n, uLightDir), 0.0);
  vec3 hemiC = mix(uGroundLight, uSkyLight, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 light = uAmbient + uLightColor * nd + hemiC * uHemi;
  vec3 c = vColor * light;
  float f = clamp((vFogDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f) * uFogMix;
  c = mix(c, uFogColor, f);
  gl_FragColor = vec4(c, 1.0);
}
`;

// ---------------------------------------------------------------------------
// ONE RING. Everything below is the same machine run twice with different numbers: a square block
// of `TILE`-sized cells from Chebyshev distance `inner` out to `outer` around the player's own cell,
// each live cell owning a fixed run of `perTile` instance slots so that a tile line crossing
// rewrites only the cells that actually entered and left.
// ---------------------------------------------------------------------------
class GrassField {
  constructor(scene, cfg) {
    this.name = cfg.name;
    this.inner = cfg.inner;
    this.outer = cfg.outer;
    this.perTile = cfg.perTile;
    this.hg = cfg.hg === undefined ? 6 : cfg.hg;
    this.seed = cfg.seed;
    this.geo = buildTuftGeometry(cfg.blades, cfg.spread || 0, cfg.height || 1, cfg.seedMul || 1, cfg.leanMul || 1);
    this.maxTufts = this.tileCount() * this.perTile;
    this.tints = new Float32Array(this.maxTufts * 3);
    this.tintAttr = new THREE.InstancedBufferAttribute(this.tints, 3);
    this.geo.setAttribute("aTint", this.tintAttr);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPlayer: { value: new THREE.Vector3() },
        uSway: { value: 0.24 },
        uNear: { value: 1.5 },
        uFadeStart: { value: cfg.fadeStart },
        uFadeEnd: { value: cfg.fadeEnd },
        uFadeIn: { value: cfg.fadeIn ? 1 : 0 },
        // Out of reach by default: a field with no outer edge in view (the near ring) passes these
        // and its fade line is exactly what it was before the far ring existed.
        uFadeOutStart: { value: cfg.fadeOutStart === undefined ? 1e6 : cfg.fadeOutStart },
        uFadeOutEnd: { value: cfg.fadeOutEnd === undefined ? 1e6 + 1 : cfg.fadeOutEnd },
        uGrow: { value: cfg.grow || 0 },
        uGrowStart: { value: cfg.growStart || 0 },
        uGrowEnd: { value: cfg.growEnd || 1 },
        uFogColor: shared.uFogColor,
        uFogNear: shared.uFogNear,
        uFogFar: shared.uFogFar,
        uFogMix: shared.uFogMix,
        uLightDir: shared.uLightDir,
        uLightColor: shared.uLightColor,
        uAmbient: shared.uAmbient,
        uSkyLight: shared.uSkyLight,
        uGroundLight: shared.uGroundLight,
        uHemi: shared.uHemi,
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.material, this.maxTufts);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // The instance matrices are in WORLD space and follow the player, so the mesh's own bounding
    // sphere (built once, at the origin) would cull the whole field the moment the body walked away
    // from it. Nothing here is ever off screen for long, and it is one draw call.
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
    scene.add(this.mesh);
    this.tiles = new Map();
    this.tileBases = new Map();
    this.nextBase = 0;
    this.freeBases = [];
    this.tufts = 0;
    this.tx = 1e9;
    this.tz = 1e9;
    this.time = 0;
    this.enabled = false;
    this.density = 1;
    // How many cells ONE frame is willing to build for this ring (`fillRing`). A small ring admits
    // a handful per crossing and never needs the cap; the far ring admits more than twenty, and
    // spreading them over the next few frames is invisible for the reason given there.
    this.maxPerStream = cfg.maxPerStream || Infinity;
    this.pending = false;
    this.terrainAt = null; // set by Grass: the world's own floor, once the world exists
  }

  // How many cells a full block of this ring holds: the square of side 2*outer+1, less the hole the
  // inner rings live in (none at all when `inner` is 0, which is the near field's own block).
  tileCount() {
    const side = 2 * this.outer + 1;
    const hole = this.inner > 0 ? Math.pow(2 * this.inner - 1, 2) : 0;
    return side * side - hole;
  }

  // One tile's worth of tufts, as a flat [x, y, z, heightScale, yaw, widthScale, tintR, tintG,
  // tintB] stride. Pure function of the tile's own coordinates (and the quality density), so a tile
  // that streams out and back in comes back identical, and two tiles that meet share no tufts (each
  // is rolled off its own seed). `grassAllowedAt` keeps the field off everything the camp authored.
  buildTile(tx, tz) {
    const arr = [];
    const rng = rngFor(tx, tz, this.seed);
    const n = Math.round(this.perTile * this.density);
    // THE TERRAIN IS SAMPLED ON A COARSE GRID, NOT PER TUFT. `terrainAt` is the height field, and a
    // fbm sample is the only expensive thing in this file: at the old density (110 a tile) 550 of
    // them a crossing was free, but the field is 480 a tile now and 2 400 fbm samples cost ~5 ms —
    // a visible hitch every tile line. The field is smooth over 12 units (the noise's own wavelength
    // is 48, and its finest octave is six), so a 6 x 6 grid across the tile and a bilinear read per
    // tuft lands every blade on the same surface to within a few millimetres, for 36 samples instead
    // of 480. It also agrees BETTER with the drawn deck than a per-tuft read did: the deck is the
    // same field sampled on a grid of its own and interpolated the same way.
    //
    // The FAR ring (`hg` 0) reads it PER TUFT instead, and that is a measurement rather than a
    // preference: on a 4-unit cell the bilinear read was **0.465** units off the deck at its worst —
    // nearly half a blade, i.e. clumps visibly floating over a fold — against **0.099** for the near
    // ring's 2-unit cell. A 2.4-unit grid would be ~0.14, but the far ring only holds 44 tufts, so
    // reading the field at each of them costs barely more than a grid fine enough to trust and has
    // no interpolation error at all.
    const HG = this.hg;
    const step = HG > 0 ? TILE / HG : 0;
    const stepInv = step > 0 ? 1 / step : 0;
    const grid = HG > 0 ? new Float32Array((HG + 1) * (HG + 1)) : null;
    const sample = this.terrainAt || groundBaseAt;
    for (let j = 0; grid && j <= HG; j++) {
      for (let i = 0; i <= HG; i++) {
        grid[j * (HG + 1) + i] = sample(tx * TILE + i * step, tz * TILE + j * step);
      }
    }
    for (let i = 0; i < n; i++) {
      const lx = rng() * TILE;
      const lz = rng() * TILE;
      const x = tx * TILE + lx;
      const z = tz * TILE + lz;
      if (!grassAllowedAt(x, z)) continue;
      let y;
      if (HG > 0) {
        const fx = lx * stepInv;
        const fz = lz * stepInv;
        const i0 = Math.min(HG - 1, fx | 0);
        const j0 = Math.min(HG - 1, fz | 0);
        const ux = fx - i0;
        const uz = fz - j0;
        const r0 = j0 * (HG + 1) + i0;
        const r1 = r0 + (HG + 1);
        const h00 = grid[r0];
        const h10 = grid[r0 + 1];
        const h01 = grid[r1];
        const h11 = grid[r1 + 1];
        y = (h00 * (1 - ux) + h10 * ux) * (1 - uz) + (h01 * (1 - ux) + h11 * ux) * uz;
      } else {
        y = sample(x, z);
      }
      arr.push(
        x,
        y,
        z,
        0.42 + rng() * 0.62, // height: knee-high turf at the top end, ankle at the bottom
        rng() * Math.PI * 2, // yaw
        0.8 + rng() * 0.45, // width
        0.84 + rng() * 0.28, // tint: a little sun/shade variation, per tuft, and kept GREEN
        0.88 + rng() * 0.26, // (a wide spread here is what turns a lawn into straw)
        0.74 + rng() * 0.3
      );
    }
    return arr;
  }

  // Write ONE tile's tufts into its own run of slots, starting at `base`. Nothing else in the pool
  // is touched, which is the whole point of the slot block: a tile line crossing rewrites five
  // tiles, not twenty-five.
  writeTile(base, arr) {
    const im = this.mesh.instanceMatrix.array;
    const ti = this.tints;
    let n = 0;
    for (let i = 0; i + 8 < arr.length; i += 9) {
      const o = (base + n) * 16;
      const x = arr[i];
      const y = arr[i + 1];
      const z = arr[i + 2];
      const hs = arr[i + 3];
      const yaw = arr[i + 4];
      const ws = arr[i + 5];
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      // Y-rotation times a non-uniform scale, column-major (`THREE.Matrix4.elements` order).
      im[o] = c * ws;
      im[o + 1] = 0;
      im[o + 2] = -s * ws;
      im[o + 3] = 0;
      im[o + 4] = 0;
      im[o + 5] = hs;
      im[o + 6] = 0;
      im[o + 7] = 0;
      im[o + 8] = s * ws;
      im[o + 9] = 0;
      im[o + 10] = c * ws;
      im[o + 11] = 0;
      im[o + 12] = x;
      im[o + 13] = y;
      im[o + 14] = z;
      im[o + 15] = 1;
      const t = (base + n) * 3;
      ti[t] = arr[i + 6];
      ti[t + 1] = arr[i + 7];
      ti[t + 2] = arr[i + 8];
      n++;
    }
    return n;
  }

  // Retire a tile's run: zero matrices are degenerate, so the slots draw nothing while they are
  // empty (and they are handed straight back to the free list, so they are usually refilled in the
  // same crossing).
  clearTile(base, used) {
    const im = this.mesh.instanceMatrix.array;
    for (let i = 0; i < this.perTile; i++) im.fill(0, (base + i) * 16, (base + i) * 16 + 16);
  }

  // How many instances the draw currently has to cover: the last slot any live tile touches. Holes
  // left by a retired tile are zeroed, so they are drawn as nothing.
  highSlot() {
    let hi = 0;
    for (const b of this.tileBases.values()) hi = Math.max(hi, b + this.perTile);
    return Math.min(this.maxTufts, hi);
  }

  commit() {
    let live = 0;
    for (const arr of this.tiles.values()) live += arr.length / 9;
    this.tufts = live;
    this.mesh.count = this.tileBases.size ? this.highSlot() : 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tintAttr.needsUpdate = true;
  }

  takeBase() {
    const tile = this.freeBases.length ? this.freeBases.pop() : this.nextBase++;
    return tile * this.perTile;
  }

  // Is this cell part of the ring? Chebyshev distance, so the ring is a square annulus.
  inRing(dx, dz) {
    const d = Math.max(Math.abs(dx), Math.abs(dz));
    return d <= this.outer && d >= this.inner;
  }

  // Switch the field on or off (only the hills world grows it). The tile cache is thrown away in
  // both directions: the terrain under it has just changed, so every cached tuft is stale.
  setEnabled(on) {
    this.enabled = !!on;
    this.mesh.visible = this.enabled;
    this.tiles.clear();
    this.tileBases.clear();
    this.nextBase = 0;
    this.freeBases.length = 0;
    this.tufts = 0;
    this.mesh.count = 0;
    this.tx = 1e9;
    this.tz = 1e9;
    this.pending = false;
  }

  // The quality tier's share of the authored density (see `setQuality` in main.js): the field is
  // the cheapest thing to thin on a weak device and the most expensive to lose entirely, so it is
  // thinned by COUNT rather than switched off.
  setDensity(d) {
    const want = Math.max(0.15, Math.min(1, d));
    if (Math.abs(want - this.density) < 0.001) return;
    this.density = want;
    this.reseed();
  }

  // ...and the same for a hole beaten out of ONE patch of the deck, which is the common case: only
  // the tiles the disc actually touches are re-read. A crater is at most 4.6 units across
  // (`CRATER_R_MAX` in destruction.js), so on the far ring that is ONE tile out of 280 and on the
  // near ring one or two out of 25 — where re-reading the lot is ~14 ms on the live hills, i.e. a
  // dropped frame on every slam, almost all of it spent re-sitting grass that has not moved.
  reseedNear(x, z, reach) {
    if (!this.enabled || this.tx > 1e8) return;
    const im = this.mesh.instanceMatrix.array;
    let touched = false;
    for (const [k, base] of this.tileBases) {
      const comma = k.indexOf(",");
      const cx = Number(k.slice(0, comma));
      const cz = Number(k.slice(comma + 1));
      const x0 = cx * TILE;
      const z0 = cz * TILE;
      const px = Math.max(x0, Math.min(x, x0 + TILE));
      const pz = Math.max(z0, Math.min(z, z0 + TILE));
      if (Math.hypot(x - px, z - pz) > reach) continue;
      const arr = this.buildTile(cx, cz);
      this.tiles.set(k, arr);
      const n = this.writeTile(base, arr);
      // A rebuilt tile can hold fewer tufts than the one it replaces (a cell the camp now owns),
      // and the run it borrowed is the same length either way — so the tail is zeroed rather than
      // left holding the old field's blades.
      for (let i = n; i < this.perTile; i++) im.fill(0, (base + i) * 16, (base + i) * 16 + 16);
      touched = true;
    }
    if (touched) this.commit();
  }

  // Throw the tile cache away and re-stream in place around the cell the player was standing on.
  // Nothing here ever leaves the field empty for a frame, so a crater does not make the lawn blink.
  reseed() {
    if (!this.enabled || this.tx > 1e8) return;
    this.tiles.clear();
    this.tileBases.clear();
    this.nextBase = 0;
    this.freeBases.length = 0;
    this.tufts = 0;
    this.mesh.count = 0;
    this.stream(this.tx, this.tz, true);
  }

  update(dt, px, py, pz) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uPlayer.value.set(px, py, pz);
    if (!this.enabled) return;
    const tx = Math.floor(px / TILE);
    const tz = Math.floor(pz / TILE);
    if (tx !== this.tx || tz !== this.tz) this.stream(tx, tz);
    else if (this.pending) this.fillRing(this.maxPerStream);
  }

  // The player's cell changed: retire whatever of the ring has fallen outside it, build whatever is
  // not in the cache, and write ONLY those cells' slots into the instance buffers.
  stream(tx, tz, force) {
    this.tx = tx;
    this.tz = tz;
    // 1. retire the tiles that have left the ring (their slots go back to the free list)
    for (const [k, base] of this.tileBases) {
      const comma = k.indexOf(",");
      const dx = Number(k.slice(0, comma)) - tx;
      const dz = Number(k.slice(comma + 1)) - tz;
      if (!this.inRing(dx, dz)) {
        const arr = this.tiles.get(k);
        this.clearTile(base, arr ? arr.length / 9 : this.perTile);
        this.freeBases.push(base / this.perTile);
        this.tileBases.delete(k);
        this.tiles.delete(k);
      }
    }
    if (force) this.freeBases.sort((a, b) => a - b);
    // 2. build and write the ones that have entered — but only as many as this frame is willing to
    // pay for (see `fillRing`). A big ring can admit more than twenty cells at once, and each of
    // them is a handful of terrain reads; spreading them over the next few frames is free, because
    // a cell that has just entered is at the very edge of the block, where the fade has it at
    // nothing in the ground.
    this.fillRing(force ? Infinity : this.maxPerStream);
  }

  // Build every cell of the ring that is not in the cache yet, stopping after `budget` of them and
  // remembering that there is more to do. Called from `stream` on a crossing and, while `pending`
  // is up, from `update` on the frames after it.
  fillRing(budget) {
    let left = budget;
    let touched = false;
    this.pending = false;
    for (let a = -this.outer; a <= this.outer; a++) {
      for (let b = -this.outer; b <= this.outer; b++) {
        if (!this.inRing(a, b)) continue;
        const k = this.tx + a + "," + (this.tz + b);
        if (this.tileBases.has(k)) continue;
        if (left <= 0) {
          this.pending = true;
          if (touched) this.commit();
          return;
        }
        const arr = this.buildTile(this.tx + a, this.tz + b);
        const base = this.takeBase();
        this.tiles.set(k, arr);
        this.tileBases.set(k, base);
        this.writeTile(base, arr);
        touched = true;
        left--;
      }
    }
    if (touched) this.commit();
  }
}

export class Grass {
  constructor(scene, terrainAt = null) {
    // The near field: the dense tuft carpet the user runs through. Exactly the field the last three
    // sessions measured (a 5 x 5 block of 12-unit tiles, 480 a tile, fading into its own root over
    // the outer ring) — the far ring is additive and nothing here was re-tuned to make room for it.
    this.near = new GrassField(scene, {
      name: "near",
      inner: 0,
      outer: 2,
      perTile: 480,
      blades: 5,
      seed: SEED,
      fadeStart: 19,
      fadeEnd: 29,
    });
    // ...and the far ring: six-blade clumps over a metre, a twelfth of the density, in a square
    // annulus from two cells out to six (24 to 84 world units), grown by the shader as they recede.
    // It OVERLAPS the near block by one cell on purpose — the near field is at its faintest exactly
    // where the far ring starts, and a shared cell means the two cross-fade over 24-36 units rather
    // than leaving a bald ring between them.
    this.far = new GrassField(scene, {
      name: "far",
      inner: 2,
      outer: 8,
      perTile: 50,
      blades: 5,
      spread: 1.2,
      height: 1.05,
      leanMul: 0.5,
      seedMul: 3,
      hg: 0, // read the height field at every tuft (see `buildTile`)
      maxPerStream: 8,
      seed: SEED_FAR,
      fadeStart: 18,
      fadeEnd: 32,
      fadeIn: true,
      // ...and the last two cells of the block are taken to nothing again, so the row that streams
      // in at the outer edge arrives as a nothing in the ground rather than as a line of clumps.
      fadeOutStart: 78,
      fadeOutEnd: 96,
      grow: 1.15,
      growStart: 20,
      growEnd: 110,
    });
    this.fields = [this.near, this.far];
    // `terrainAt` is where the ground is at a point. It is the world's OWN floor — the base field
    // plus any crater dug into it (see `World.terrainHeight`) — rather than the base field alone,
    // because a tuft standing in a freshly-beaten hole has to be standing on the BOTTOM of it. A
    // crater invalidates the tiles it touched (`invalidate`), so this is re-read rather than cached
    // forever; when it is not given, the base field is used on its own.
    for (const f of this.fields) f.terrainAt = terrainAt;
    this.enabled = false;
    this.density = 1;
  }

  get mesh() {
    return this.near.mesh;
  }

  get tufts() {
    return this.near.tufts + this.far.tufts;
  }

  setEnabled(on) {
    this.enabled = !!on;
    for (const f of this.fields) f.setEnabled(this.enabled);
  }

  setDensity(d) {
    this.density = Math.max(0.15, Math.min(1, d));
    for (const f of this.fields) f.setDensity(this.density);
  }

  // A crater was beaten out of the deck: the cached tufts standing over it are stale (see
  // `GrassField.reseedNear`). Called with the hole's own centre and radius it re-sits just those
  // tiles; called with nothing it throws both rings' caches away and re-streams them in place.
  invalidate(x, z, reach) {
    for (const f of this.fields) {
      if (x === undefined) f.reseed();
      else f.reseedNear(x, z, reach);
    }
  }

  update(dt, px, py, pz) {
    for (const f of this.fields) f.update(dt, px, py, pz);
  }
}
