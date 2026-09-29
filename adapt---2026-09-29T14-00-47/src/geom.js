import * as THREE from "./three.js";

const NRM = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];
const UAX = [
  [0, 0, -1], [0, 0, 1],
  [1, 0, 0], [1, 0, 0],
  [1, 0, 0], [-1, 0, 0],
];
const VAX = [
  [0, 1, 0], [0, 1, 0],
  [0, 0, -1], [0, 0, 1],
  [0, 1, 0], [0, 1, 0],
];
const UVX = [2, 2, 0, 0, 0, 0];
const UVY = [1, 1, 2, 2, 1, 1];
const AO_STEPS = [1, 0.8, 0.66, 0.55];

function faceCorners(b, f) {
  const x = b.x;
  const y = b.y;
  const z = b.z;
  const X = x + b.w;
  const Y = y + b.h;
  const Z = z + b.d;
  switch (f) {
    case 0: return [X, y, Z, X, y, z, X, Y, z, X, Y, Z];
    case 1: return [x, y, z, x, y, Z, x, Y, Z, x, Y, z];
    case 2: return [x, Y, Z, X, Y, Z, X, Y, z, x, Y, z];
    case 3: return [x, y, z, X, y, z, X, y, Z, x, y, Z];
    case 4: return [x, y, Z, X, y, Z, X, Y, Z, x, Y, Z];
    case 5: return [X, y, z, x, y, z, x, Y, z, X, Y, z];
    default: return [x, y, z, x, y, z, x, y, z, x, y, z];
  }
}

export function buildBoxGeometry(boxes, opts = {}) {
  const {
    uvScale = 2,
    occluder = null,
    aoStrength = 0.85,
    tint = null,
    shade = null,
  } = opts;

  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];

  for (let bi = 0; bi < boxes.length; bi++) {
    const b = boxes[bi];
    const c = b.c || [1, 1, 1];
    const tr = tint ? tint[0] : 1;
    const tg = tint ? tint[1] : 1;
    const tb = tint ? tint[2] : 1;

    for (let f = 0; f < 6; f++) {
      const n = NRM[f];
      const cs = faceCorners(b, f);
      const ua = UAX[f];
      const va = VAX[f];
      const uvxA = UVX[f];
      const uvyA = UVY[f];
      const base = positions.length / 3;

      for (let k = 0; k < 4; k++) {
        const px = cs[k * 3];
        const py = cs[k * 3 + 1];
        const pz = cs[k * 3 + 2];

        let ao = 1;
        if (occluder) {
          const su = (k === 1 || k === 2) ? 1 : -1;
          const sv = (k === 2 || k === 3) ? 1 : -1;
          const ox = px + n[0] * 0.5;
          const oy = py + n[1] * 0.5;
          const oz = pz + n[2] * 0.5;
          const ax = ox + ua[0] * su * 0.5;
          const ay = oy + ua[1] * su * 0.5;
          const az = oz + ua[2] * su * 0.5;
          const bx = ox + va[0] * sv * 0.5;
          const by = oy + va[1] * sv * 0.5;
          const bz = oz + va[2] * sv * 0.5;
          let occ = 0;
          if (occluder(ax, ay, az)) occ++;
          if (occluder(bx, by, bz)) occ++;
          if (occluder(ax + va[0] * sv * 0.5, ay + va[1] * sv * 0.5, az + va[2] * sv * 0.5)) occ++;
          ao = 1 - (1 - AO_STEPS[occ]) * aoStrength;
        }

        let sh = 1;
        if (shade) {
          sh = shade(px, py, pz);
        }

        const m = ao * sh;
        positions.push(px, py, pz);
        normals.push(n[0], n[1], n[2]);
        uvs.push(cs[k * 3 + uvxA] / uvScale, cs[k * 3 + uvyA] / uvScale);
        colors.push(c[0] * m * tr, c[1] * m * tg, c[2] * m * tb);
      }

      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export function buildGroundGrid(x0, z0, size, cells, opts) {
  const {
    uvScale = 2,
    light = 0.95,
    shadeAt = null,
    colorAt = null,
    color = [0.5, 0.6, 0.4],
    // The ground is not a flat board any more: a ground destruction pass can sink it into a
    // crater, so the builder asks a height field for every vertex (and derives the vertex
    // normal from it, so a crater bowl is lit as a bowl instead of staying a flat plane). The
    // field is a pure function of world position, so two neighbouring chunks evaluate the
    // SAME height at the vertices they share and the seam stays watertight.
    heightAt = null,
    darkAt = null,
  } = opts;
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  const step = size / cells;
  const grid = [];
  for (let i = 0; i <= cells; i++) {
    grid.push([]);
    for (let j = 0; j <= cells; j++) {
      grid[i].push(positions.length / 3);
      const px = x0 + i * step;
      const pz = z0 + j * step;
      const py = heightAt ? heightAt(px, pz) : 0;
      const sh = shadeAt ? shadeAt(px, pz) : 1;
      const dk = darkAt ? darkAt(px, pz) : 1;
      const m = light * sh * dk;
      const col = colorAt ? colorAt(px, pz) : color;
      let nx = 0;
      let ny = 1;
      let nz = 0;
      if (heightAt) {
        const hx = heightAt(px + step * 0.5, pz) - heightAt(px - step * 0.5, pz);
        const hz = heightAt(px, pz + step * 0.5) - heightAt(px, pz - step * 0.5);
        const inv = step;
        nx = -hx / inv;
        nz = -hz / inv;
        const l = Math.hypot(nx, 1, nz);
        nx /= l;
        ny = 1 / l;
        nz /= l;
      }
      positions.push(px, py, pz);
      normals.push(nx, ny, nz);
      uvs.push(px / uvScale, pz / uvScale);
      colors.push(col[0] * m, col[1] * m, col[2] * m);
    }
  }
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const a = grid[i][j];
      const b = grid[i + 1][j];
      const c = grid[i + 1][j + 1];
      const d = grid[i][j + 1];
      indices.push(a, d, c, a, c, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

// A single "unstitched" polygon: a flat-ish prism whose cross-section is an irregular convex
// polygon, which is what a block or a patch of ground breaks into when it comes apart (see
// destruction.js). `poly` is a ring of [x, z] points; the solid spans y = -thickness..0 so a
// caller can place it by its top face. Colours are baked per vertex (top brighter, underside
// dark) because the world's material is vertex-coloured and the shading is done in the shader.
export function buildShardGeometry(poly, thickness, color, opts = {}) {
  const { topJitter = 0.35, shade = 1 } = opts;
  const n = poly.length;
  if (n < 3) return null;

  // The renderer culls back faces, and a prism's top must face +y: wind the ring so that the
  // fan (0, i, i+1) has a +y geometric normal (2D "clockwise" in x/z), then every side quad's
  // winding follows from that.
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const ring = new Array(n);
  for (let i = 0; i < n; i++) ring[i] = poly[area > 0 ? n - 1 - i : i];

  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];

  const topY = new Array(n);
  for (let i = 0; i < n; i++) topY[i] = (Math.random() - 0.5) * thickness * topJitter;

  const push = (x, y, z, nx, ny, nz, c, u, v) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    colors.push(color[0] * c * shade, color[1] * c * shade, color[2] * c * shade);
    uvs.push(u, v);
  };

  // top face
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    push(a[0], topY[i], a[1], 0, 1, 0, 1.08, a[0] * 0.5, a[1] * 0.5);
  }
  // underside
  const underBase = n;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    push(a[0], -thickness, a[1], 0, -1, 0, 0.7, a[0] * 0.5, a[1] * 0.5);
  }
  // sides. The outward normal of an edge (ex, ez) on a ring wound for a +y top is (-ez, ex)
  // in the x/z plane; the quad is wound a_top -> a_bot -> b_bot -> b_top so the face actually
  // faces that way and survives back-face culling.
  const sideBase = n * 2;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const j = (i + 1) % n;
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const l = Math.hypot(ex, ez) || 1;
    const nx = -ez / l;
    const nz = ex / l;
    const ny = 0.35 * thickness;
    const nl = Math.hypot(nx, ny, nz);
    push(a[0], topY[i], a[1], nx / nl, ny / nl, nz / nl, 0.94, 0, 1);
    push(a[0], -thickness, a[1], nx / nl, ny / nl, nz / nl, 0.86, 0, 0);
    push(b[0], -thickness, b[1], nx / nl, ny / nl, nz / nl, 0.86, 1, 0);
    push(b[0], topY[j], b[1], nx / nl, ny / nl, nz / nl, 0.94, 1, 1);
  }

  const indices = [];
  for (let i = 1; i < n - 1; i++) indices.push(0, i, i + 1);
  for (let i = 1; i < n - 1; i++) indices.push(underBase, underBase + i + 1, underBase + i);
  for (let i = 0; i < n; i++) {
    const o = sideBase + i * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

// Scale a group so it stands `height` tall and drop its lowest point to `footY`,
// centred on x/z. Used to seat a character model inside the player's cube.
//
// `top` overrides the height reference: pass the authored y of the top of the
// character's BODY when things sticking out of it (hair spikes, a hood) should
// not count. Without it the model is scaled by whatever its bounding box happens
// to reach, so adding a taller hairdo literally shrinks the character.
export function fitGroup(group, { height = 0.9, footY = -0.45, top = null } = {}) {
  group.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(group);
  const spanTop = top === null ? box.max.y : top;
  const s = height / Math.max(1e-4, spanTop - box.min.y);
  group.scale.setScalar(s);
  group.position.set(0, 0, 0);
  group.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(group);
  group.position.set(
    -(box.min.x + box.max.x) / 2,
    footY - box.min.y,
    -(box.min.z + box.max.z) / 2
  );
  group.updateMatrixWorld(true);
  return group;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}
