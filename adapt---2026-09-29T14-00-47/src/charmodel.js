import * as THREE from "./three.js";
import { GLTFLoader } from "https://esm.sh/three@0.160.1/examples/jsm/loaders/GLTFLoader.js";
import { attachOutline } from "./ps1.js";
import { fitGroup } from "./geom.js";
import { buildStreetCharacter, characterMaterial } from "./streetwear.js";

// Two player looks, both real low-poly meshes fitted into the player's collision cube
// (centred on the origin, feet at y = -HY):
//
//   "street"   — the hand-modelled STREET character built from scratch in
//                src/streetwear.js. Default look.
//   "imported" — the reference model the user supplied, UNTEXTURED and recoloured into
//                the same neon palette as the street character.
//
// The size of the body is not decided here: the caller (the player) passes
// `{ height, footY }` derived from the collision box, and fitGroup() seats the model in
// it. That is what keeps a resized player from being drawn at the old size.
//
// The imported model (src/models/player.glb) is authored Z-up and facing +Z, so it is
// rotated upright before fitting.
//
// Neither look carries a texture any more. The imported model's 512x512 atlas is sampled
// ONCE per triangle and snapped to a palette (`bakedGeometry` / `classify` below), exactly
// as the old debug "blackout" mode did — which is why that mode and the real one are now
// the same code path. Both looks then draw through `characterMaterial` (cell-shaded,
// emissive, self-coloured rim, no map) with a glow hull around the silhouette.
//
// player.glb was pruned from the 1.28 MB source download (a game-rip that also carried
// nine stray flat decal meshes and an unrelated 2048x2048 environment atlas, neither of
// which this file draws): one node / one mesh / one 512x512 base-colour texture, 281 KB.
// To rebuild, load the original with @gltf-transform/core WebIO, dispose every scene node
// whose mesh bounding-box diagonal is <= 0.5, dispose the meshes/materials/textures that
// leaves unused, run prune()+dedup(), and write it back as GLB.
//
// NOTE the atlas is still needed in the FILE — it is what `classify` reads to tell the
// model's hair from its jacket from its boots. It is the draw that no longer uses it.

const MODEL_URL = new URL("./models/player.glb", import.meta.url).href;

// The neon palette the imported model's atlas is snapped into, matching streetwear's
// `C` so the two looks read as the same character.
const PAL = {
  skin: [0.960, 0.790, 0.735],
  skinShade: [0.800, 0.615, 0.600],
  hair: [0.070, 0.070, 0.082],
  hairLit: [0.132, 0.132, 0.152],
  cloth: [0.090, 0.800, 0.940],
  cloth2: [0.360, 0.985, 1.000],
  dark: [0.070, 0.075, 0.115],
  white: [0.800, 1.000, 1.000],
  accent: [0.960, 0.120, 0.620],
  grey: [0.360, 0.120, 0.860],
};

let gltfPromise = null;
function loadGltf() {
  if (!gltfPromise) gltfPromise = new GLTFLoader().loadAsync(MODEL_URL);
  return gltfPromise;
}

// Only the real body mesh: the file also carries a handful of degenerate flat decal
// meshes (all squashed onto a single plane) which must not be drawn.
function bodyMeshes(gltf) {
  const found = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const diag = o.geometry.boundingBox.getSize(new THREE.Vector3()).length();
    if (diag > 0.5) found.push(o);
  });
  return found;
}

function hueOf(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  let h;
  if (mx === r) h = 60 * (((g - b) / (mx - mn)) % 6);
  else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2);
  else h = 60 * ((r - g) / (mx - mn) + 4);
  return h < 0 ? h + 360 : h;
}

function classify(r, g, b, isHead, isFoot) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const v = mx;
  const s = mx > 0 ? (mx - mn) / mx : 0;
  const h = hueOf(r, g, b);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const skin = v > 0.40 && h > 4 && h < 46 && s > 0.10 && s < 0.62;
  if (isHead) {
    // Everything up top becomes the character's hair: near-black with a few lit strands
    // so the shape of the mop still reads instead of turning into one flat blob.
    if (skin) return v > 0.62 ? PAL.skin : PAL.skinShade;
    if (lum > 0.72) return PAL.hairLit;
    if (lum > 0.30) return PAL.hair;
    return PAL.dark;
  }
  if (skin) return v > 0.62 ? PAL.skin : PAL.skinShade;
  if (lum < 0.13) return PAL.dark;
  if (lum < 0.34) return s < 0.22 ? PAL.cloth : PAL.dark;
  if (lum < 0.58) return s < 0.30 ? PAL.cloth2 : PAL.dark;
  // Bright, unsaturated texels are only really "white" on the shoe soles; on the body
  // they are usually blank atlas space, so they get folded back into the dark clothes
  // instead of speckling the trousers with white squares.
  if (s < 0.20) return isFoot && lum > 0.72 ? PAL.white : lum > 0.86 ? PAL.cloth2 : PAL.grey;
  if (h >= 110 && h < 210) return PAL.cloth;
  if (h >= 60 && h < 110) return PAL.cloth2;
  if (h >= 210 && h < 300) return PAL.cloth2;
  if (h >= 300 || h < 18) return PAL.accent;
  return PAL.cloth2;
}

function samplerFor(texture) {
  const img = texture && texture.image;
  if (!img || !img.width) return null;
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
  return (u, v) => {
    const x = Math.min(cv.width - 1, Math.max(0, (u * cv.width) | 0));
    const y = Math.min(cv.height - 1, Math.max(0, ((1 - v) * cv.height) | 0));
    const i = (y * cv.width + x) * 4;
    return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
  };
}

// Flat-shaded version: every face gets one palette colour, so the PS1 shader can light it
// with no texture bound at all.
function bakedGeometry(mesh, material) {
  const tex = material && material.map;
  const sample = samplerFor(tex);
  const src = mesh.geometry;
  const geo = src.index ? src.toNonIndexed() : src.clone();
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const n = pos.count;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const z = pos.getZ(i);
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const zSpan = Math.max(1e-4, zMax - zMin);
  const colors = new Float32Array(n * 3);
  const c = new THREE.Color();
  const headCut = zMin + zSpan * 0.80;
  const footCut = zMin + zSpan * 0.22;
  for (let t = 0; t < n; t += 3) {
    let col = PAL.cloth;
    if (sample && uv) {
      const u = (uv.getX(t) + uv.getX(t + 1) + uv.getX(t + 2)) / 3;
      const v = (uv.getY(t) + uv.getY(t + 1) + uv.getY(t + 2)) / 3;
      const [r, g, bl] = sample(u, v);
      const zc = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      col = classify(r, g, bl, zc > headCut, zc < footCut);
    }
    c.setRGB(col[0], col[1], col[2]);
    for (let k = 0; k < 3; k++) {
      colors[(t + k) * 3] = c.r;
      colors[(t + k) * 3 + 1] = c.g;
      colors[(t + k) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
  geo.deleteAttribute("tangent");
  geo.deleteAttribute("uv1");
  geo.deleteAttribute("color");
  return geo;
}

// The imported model is ONE merged mesh, so there is no head node to hide — and in first person
// the camera would sit inside the skull. The bake already knows where the head starts: the same
// cut `classify` uses to recognise hair (`zMin + span * 0.80`, in the model's own Z-up space)
// splits the triangles into a body half and a head half, and the head half gets a `head` group
// of its own (see `buildPlayerCharacter`).
function sliceGeometry(geo, head) {
  const pos = geo.attributes.position;
  const col = geo.attributes.aColor;
  const nrm = geo.attributes.normal;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const cut = zMin + (zMax - zMin) * 0.80;
  const keep = [];
  for (let t = 0; t < pos.count; t += 3) {
    const zc = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
    if ((zc > cut) === !!head) keep.push(t, t + 1, t + 2);
  }
  const n = keep.length;
  const p = new Float32Array(n * 3);
  const c = new Float32Array(n * 3);
  const nn = nrm ? new Float32Array(n * 3) : null;
  for (let k = 0; k < n; k++) {
    const s = keep[k];
    p[k * 3] = pos.getX(s);
    p[k * 3 + 1] = pos.getY(s);
    p[k * 3 + 2] = pos.getZ(s);
    c[k * 3] = col.getX(s);
    c[k * 3 + 1] = col.getY(s);
    c[k * 3 + 2] = col.getZ(s);
    if (nn) {
      nn[k * 3] = nrm.getX(s);
      nn[k * 3 + 1] = nrm.getY(s);
      nn[k * 3 + 2] = nrm.getZ(s);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(p, 3));
  out.setAttribute("aColor", new THREE.BufferAttribute(c, 3));
  if (nn) out.setAttribute("normal", new THREE.BufferAttribute(nn, 3));
  else out.computeVertexNormals();
  return out;
}

async function buildMeshes() {
  const gltf = await loadGltf();
  const bodies = bodyMeshes(gltf);
  const bodyGeos = [];
  const headGeos = [];
  for (const m of bodies) {
    // Both modes bake now: the atlas is only ever READ (to classify a triangle's colour),
    // never sampled at draw time, so the character carries no texture in either look.
    const geo = bakedGeometry(m, m.material);
    const b = sliceGeometry(geo, false);
    if (b.attributes.position.count) bodyGeos.push(b);
    const h = sliceGeometry(geo, true);
    if (h.attributes.position.count) headGeos.push(h);
  }
  // Where the head group's origin goes: the base of the head, in the model's own space — which
  // is also the `tilt` node's space, since the tilt only carries the stand-up ROTATION and the
  // geometries are authored in it. The head geometries are moved onto that point here, BEFORE
  // the ink hulls are built, since a hull is a geometry of its own and would not follow a later
  // translate.
  const box = new THREE.Box3();
  for (const g of headGeos) {
    g.computeBoundingBox();
    box.union(g.boundingBox);
  }
  const origin = box.isEmpty()
    ? null
    : new THREE.Vector3(
        (box.min.x + box.max.x) / 2,
        (box.min.y + box.max.y) / 2,
        box.min.z
      );
  if (origin) for (const g of headGeos) g.translate(-origin.x, -origin.y, -origin.z);
  const mk = (geos) =>
    geos.map((g) => {
      const mesh = new THREE.Mesh(g, characterMaterial());
      mesh.frustumCulled = false;
      mesh.renderOrder = 4;
      attachOutline(mesh, g);
      return mesh;
    });
  return { body: mk(bodyGeos), head: mk(headGeos), origin };
}

// Returns a Group ready to drop into the player's `inner` node, or null if the model
// could not be loaded (the caller then keeps the fallback box). `size` is the fit passed
// straight to fitGroup — `{ height, footY }` measured off the player's collision box.
//
// A third mode, `"naked"`, is the same hand-modelled rig with the outfit taken off (see the
// NAKED block in streetwear.js). The enemy wears it.
export async function buildPlayerCharacter(mode = "street", size = null) {
  if (mode === "street") return buildStreetCharacter(size);
  if (mode === "naked") return buildStreetCharacter(size, { naked: true });
  const { body, head, origin } = await buildMeshes();
  if (!body.length && !head.length) return null;
  const tilt = new THREE.Group();
  // The source model is authored Z-up and facing its own +Y, so -90 degrees
  // about X stands it up and turns its face to +Z, the game's forward (verified
  // by rendering the model from all four sides).
  tilt.rotation.set(-Math.PI / 2, 0, 0);
  for (const m of body) tilt.add(m);
  const gHead = new THREE.Group();
  for (const m of head) gHead.add(m);
  if (origin) gHead.position.copy(origin);
  tilt.add(gHead);
  const group = new THREE.Group();
  group.add(tilt);
  // The same node the hand-modelled look publishes, so the first-person camera can take the
  // head off either character (see `CameraRig.follow`) — this model is ONE merged mesh, so
  // without the split there would be nothing to take off and the camera would sit inside the
  // skull. See `sliceGeometry`.
  group.userData.bones = { head: gHead };
  return fitGroup(group, size || undefined);
}
