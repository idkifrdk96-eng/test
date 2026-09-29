---
name: bomb-rush-3d-style
description: Design, model, texture, rig and animate 3D assets (characters, props, environments) in the low-poly, cel-shaded, graffiti-soaked look of Bomb Rush Cyberfunk and Jet Set Radio. Use this skill whenever the user wants a 3D model, a Blender (bpy) script, a text-to-3D prompt, a character or prop design, a rig, an animation set, or a modeling plan in a Bomb Rush Cyberfunk / BRC / Jet Set Radio / street-art / cel-shaded low-poly style — even if they never name the game and just say things like "chunky graffiti skater", "PS1-style character", "toon-shaded", or "Jet Set Radio vibes". Also use it when someone asks for a flat-shaded low-poly character built from code (three.js / WebGL / a game engine) rather than from an art tool.
---

# Bomb Rush Cyberfunk–Style 3D Modeling

Build assets that feel like they belong in **Bomb Rush Cyberfunk** (and its ancestor **Jet Set Radio**): low-poly, cel-shaded, hand-painted, and dripping with graffiti and street attitude. This skill covers the whole chain — design → blockout → texture → shader → rig → animation → QA — for three output routes: a **design breakdown**, a **Blender (bpy) script**, a **generator prompt**, or **procedural code** that builds the asset at runtime.

The goal is the *style*, not the game's content. Design original characters and assets. Don't recreate specific named characters, logos, or level layouts from the game.

---

## 0. Pick the output route first

Infer the route from context; don't quiz the user. State which route you chose and offer the others at the end.

| Signal | Route | Section |
|---|---|---|
| "design me a…", "what would it look like" | **Design breakdown** | §11 |
| Blender, bpy, a script, `.blend` | **Blender script** | §9 |
| Meshy / Tripo / Rodin / "a prompt for…" | **Generator prompt** | §10 |
| three.js, WebGL, a game, "runs in the browser", no art tool | **Procedural code** | §5, §7, §8 |
| An existing rig needs new poses / a new animation set | **Animation pass** | §7, §8 |

Most real requests are two of these at once ("a BRC-style courier *and* the code that animates it"). Do both, and keep the numbers consistent between them.

---

## 1. The style in eight pillars

1. **Silhouette first.** The shape must read instantly as a solid black cutout. Skating, grinding and tagging are all about readable motion, so bold shapes beat fine detail every time.
2. **Exaggeration.** Push proportions past realism: long lanky limbs, oversized hands, huge chunky sneakers, baggy clothes, small-to-medium heads, big attitude in the pose. (In this project's rig the hands are ~1.6× realistic and the shoes are ~1.9× — see §2.)
3. **Low poly with intent.** Spend triangles on the silhouette; save them on flat areas; let paint do the rest. A facet that doesn't change the silhouette is wasted.
4. **Painted grit.** Flat saturated colours, hard-edged painted highlights, grain, halftone dots, scuffs, stickers, tags. Nothing looks factory-clean.
5. **Hard toon shading.** Two or three crisp tonal bands with a hard shadow edge. No smooth gradients. A thin ink outline or a strong rim.
6. **Angle over curve.** Faceted planes, confident long straights, hard edges at jawlines, soles, collars and folds. Smoothing everything is what makes low-poly look cheap.
7. **Volume, not anatomy.** Clothes are *shaped geometry* — puffy jackets, drooping hems, thick soles — not skin-tight surfaces. Accessories (headphones, goggles, bandanas, chains, packs) buy personality without a complex face.
8. **A flat palette discipline.** 3–5 saturated colours plus one accent, checked in grayscale. If the shape still reads in grayscale, the value structure is right.

---

## 2. Silhouette and proportions

### 2.1 The proportion cheat-sheet

Author in **head-heights** (HH). A realistic adult is ~7.5 HH; BRC-style is 5.5–6.5 HH with the *volume* pushed elsewhere.

| Feature | Realistic | BRC / JSR target | Notes |
|---|---|---|---|
| Total height | 7.5 HH | **5.5–6.5 HH** | shorter reads chunkier and more stylised |
| Head | 1.0 HH | **1.15–1.35 HH** | big enough to carry hair/hat/cap shapes |
| Shoulder width | 1.6 HH | **1.9–2.2 HH** | clothes do the widening |
| Arms (shoulder→fingertip) | 2.9 HH | **2.6–2.8 HH** but *thinner* | long and lanky; hands oversized |
| Hand length | 0.75 HH | **1.0–1.2 HH** | oversized hands read as "mitts" |
| Torso (hip→shoulder) | 2.8 HH | **2.0–2.3 HH** | short torso keeps the legs long |
| Legs (hip→ground) | 3.7 HH | **3.4–3.8 HH** | lanky |
| Thigh : shin | 1 : 0.9 | **1 : 1.0–1.05** | equal links make the IK trivial and the knees read |
| Foot length | 1.0 HH | **1.4–1.8 HH** | the single biggest stylisation win |
| Neck | 0.4 HH | **0.15–0.25 HH** | a visible neck breaks the cutout |

Two hard rules that follow from this: **feet are always too big**, and **hands are always too big**. If a silhouette looks flat, it is almost always because a hand or a shoe is too small.

### 2.2 Author in your own units, then fit

Author the whole body in a **private, convenient space** (e.g. hip at exactly `y = 1.000`, ankle at `0.225`, ground at `0`), then **fit it** to the game's world scale in one call. This decouples "does the model look right" from "does the model match the character controller", and it means every joint number in the file is directly readable.

```js
// fitGroup(group, {height, footY, top}) — measured body height (feet→top of skull,
// hair excluded), mapped so the body spans [footY, footY + height] in world units.
const bodyTop = HEAD_SECS[HEAD_SECS.length - 1][0];
fitGroup(group, { height: P.HY * P.BODY_RATIO, footY: -P.HY, top: bodyTop });
```

The payoff is that a "sole on the deck" solve in authored space (`authorspace y = 0`) maps to exactly `authorspace * scale + footY` in world space, so contact numbers never need re-tuning when the world scale changes.

### 2.3 What to model vs what to paint

**Model** anything that breaks the silhouette: hair chunks, laces, tread, straps, a hood, a chain, the brim of a cap, a popped collar, a backpack, knee pads, a bag strap.

**Paint** everything else: eyes, brows, mouths, logos, stitching, tags, seams, pocket outlines, panel lines, tattoo shapes.

---

## 3. Poly budget and topology

Targets, not laws. Adjust if the user gives a budget.

| Asset | Triangles |
|---|---|
| Character | 3,000 – 8,000 |
| Prop (sneaker, boombox, spray can, board) | 200 – 1,500 |
| Vehicle | 1,500 – 4,000 |
| Environment piece | as low as the shape allows, from modular blocks |

A worked allocation for a ~4k-tri character:

| Part | Tris | Why |
|---|---|---|
| Head + hair | 500–900 | hair is the main silhouette read on a small head |
| Torso + jacket | 500–1,000 | few loops, flat panels; the hem/collar add the shape |
| Pelvis / shorts | 200–400 | often hidden; keep it cheap |
| Arms (both) | 400–700 | enough loops at the elbow to bend without collapsing |
| Hands (both) | 300–600 | cheap geometry, *big* — blocky fingers, no nails |
| Legs (both) | 500–900 | the knee needs 2–3 edge loops to fold cleanly |
| Shoes (both) | 600–1,200 | this is where the silhouette budget goes |
| Accessories | 400–1,200 | packs, chains, headphones, wraps |

### Topology rules

- **Quads almost everywhere**, no n-gons in bending areas. Triangles only where a shape genuinely terminates.
- **Edge loops at every joint**: shoulder, elbow, wrist, hip, knee, ankle. Two loops minimum, three around a knee or elbow.
- **Flat shading** (`poly.use_smooth = False` / `flatShading` / unshared normals). Split normals only where you *deliberately* want a smooth facet.
- **Build in A-pose** (or a relaxed T-pose) with straight limbs — a bent rest pose makes every hinge wrong.
- **Every joint gets a clean hinge position**. In procedural code that means: author each bone as a `Group` placed at its joint, then attach the geometry with a pure translation. See §7.
- **Mirror last.** Build one side, then mirror, then break the symmetry deliberately (a different chain, one pad, mismatched laces).

---

## 4. Palette and value structure

- Choose **3–5 main colours + 1 accent**. Hot magenta, acid yellow, cyan, orange, lime against deep purple, navy and black is the canonical BRC range, but any high-contrast set works.
- Check in **grayscale**: at least one light shape, one mid, one dark. If the silhouette is a single grey mass, saturation isn't saving it.
- **Value first, then hue.** Assign the value structure before choosing hues — this is what makes the model read at 30 metres.
- Give every material a **mid-tone that is genuinely mid** (~0.5 luma). Beginners put everything at 0.7–0.9 and the model turns to mush under fog and bloom.
- Reserve the **darkest value for the outline/edges** and for accents you want to punch (a black tee, black socks, tyre tread).
- The accent is for **one thing**: the shoe stripe, the laces, the bag, the visor. Two accents cancel out.

```js
// Author the palette as named flats, never as literals buried in geometry code.
const C = {
  shirt:   [0.92, 0.93, 0.96],   // bone white tee
  shirtLo: [0.78, 0.80, 0.85],   // hem / shadow bands
  denim:   [0.16, 0.20, 0.34],   // indigo trousers
  denimHi: [0.24, 0.30, 0.47],
  skin:    [0.76, 0.56, 0.42],
  shoe:    [0.86, 0.88, 0.90],
  accent:  [0.95, 0.22, 0.52],   // the one accent: sole stripe + a back print
  hair:    [0.12, 0.10, 0.14],
};
```

---

## 5. Texture — the banded triplanar atlas

This is the single most useful technique in the whole skill, and it is what turns a flat-coloured low-poly mesh into a painted BRC asset *without* a UV unwrap.

### 5.1 The idea

1. Build **one small square atlas** (512×512 or 1024×1024) split into **horizontal bands**, one band per *material family* (cloth / denim / skin / hard).
2. Give every vertex all the bands at once, and encode **which band** in the V coordinate: `v = (band + localV) / bandCount`.
3. Generate **triplanar UVs per triangle**: at build time, look at the face normal, pick the dominant axis, and project onto the other two. No unwrap, no seams to hand-paint, no artist time.
4. Paint each band with the *material's own* signature — a twill diagonal for denim, a thread checker for cloth, anisotropic streaks for hair/leather/rubber, near-flat grain for skin.
5. Ship it as a **multiply detail map** (`NoColorSpace`, white = untouched) so it can darken grime into a vertex-coloured palette without touching the palette. This is the key trick: the palette stays authored, the grime is additive-on-top.

### 5.2 Why bands must tile

Triplanar UVs jump at every facet boundary. If a band does not **tile seamlessly inside itself**, every facet boundary becomes a visible crack, and the grittier the texture the more obvious it is. So: use **periodic value noise** (a lattice that wraps in both axes) and wrap all stamps modulo the band size.

```js
// Periodic value noise: the lattice wraps in both axes, so the field tiles exactly.
function makeNoise(cellsX, cellsY, rnd) {
  const g = new Float32Array(cellsX * cellsY);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const wrap = (v, m) => ((v % m) + m) % m;
  return (x, y) => {
    const fx = x * cellsX, fy = y * cellsY;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const j0 = wrap(x0, cellsX), j1 = wrap(x0 + 1, cellsX);
    const i0 = wrap(y0, cellsY), i1 = wrap(y0 + 1, cellsY);
    const a = g[i0 * cellsX + j0], b = g[i0 * cellsX + j1];
    const c = g[i1 * cellsX + j0], d = g[i1 * cellsX + j1];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}
```

### 5.3 Triplanar UVs at build time

```js
// A tiny vertex accumulator: position, normal, colour, uv.
function pushTri(a, n, c, p0, p1, p2) {
  const u = sub(p1, p0), v = sub(p2, p0);
  const nx = u.y * v.z - u.z * v.y, ny = u.z * v.x - u.x * v.z, nz = u.x * v.y - u.y * v.x;
  const len = Math.hypot(nx, ny, nz) || 1;
  const nx1 = nx / len, ny1 = ny / len, nz1 = nz / len;
  const ax = Math.abs(nx1), ay = Math.abs(ny1), az = Math.abs(nz1);
  // dominant axis picks the projection plane
  const ua = ax > ay && ax > az ? 1 : ay > az ? 0 : 0;
  const va = ax > ay && ax > az ? 2 : ay > az ? 2 : 1;
  const S = UV_SCALE;                         // authored units per band-width
  for (const p of [p0, p1, p2]) {
    a.pos.push(p[0], p[1], p[2]);
    a.nrm.push(nx1, ny1, nz1);
    a.col.push(c[0], c[1], c[2]);
    const uu = p[ua] * S;
    const vv = (CUR_BAND + frac(p[va] * S * 4)) / BAND_COUNT;
    a.uv.push(uu, vv);
  }
}
```

`UV_SCALE` is the only tuning knob: "how many authored units wide is one tile of texture". At 0.45 in this project's units, the character's ~1.8-unit body gets ~4 tiles of detail — coarse enough that the grain is visible from the chase camera, fine enough not to read as stripes.

### 5.4 Painting each band

Per band, write the shade (1.0 = untouched, lower = dirtier) into a `Float32Array`, then blit all bands into one `ImageData`. Rules that make it read:

- **Contrast beats detail.** A 1-texel weave averages to flat grey in the mip chain before it ever reaches the screen. Build features measured in **tens of texels** with a shade range of ~0.55–1.00.
- **Every material gets one directional tell**: a twill diagonal for denim, a 4-texel checker for woven cloth, anisotropic stretched noise for hair/leather/rubber.
- **Halftone**: a small dot grid whose radius breathes with a low-frequency noise field. This is the "printed" tell that stops big flat panels from reading as flat.
- **Creases are dark line + lit edge.** A fold is a dark line with a highlight beside it.
- **Grime is sparse and clustered**: a few dozen soft blobs at 0.55–0.80, plus a few hundred short scuff strokes.
- **Sample the grime from the noise field, not from a stash of photos.** Anything sampled from noise tiles; anything sampled from an image will not.

```js
// Denim: twill diagonal + wear patches + faint cross-leg creases.
function paintDenim(px) {
  const rnd = mulberry32(0x2e91);
  const coarse = makeNoise(5, 2, rnd), wear = makeNoise(3, 1, rnd), grain = makeNoise(45, 12, rnd);
  each(px, (x, y, u, v) => {
    const twill = ((((x - y) % 8) + 8) % 8) < 4 ? 0.085 : -0.085;   // 8 divides the atlas
    let s = 1.0 + twill;
    s -= (coarse(u, v) - 0.45) * 0.44;
    s -= (grain(u, v) - 0.5) * 0.16;
    s -= Math.max(0, wear(u, v) - 0.42) * 0.52;                       // uneven fade
    const cr = Math.sin(v * Math.PI * 2 * 6 + coarse(u, v) * 4.0);    // cross-leg creases
    s -= Math.max(0, cr - 0.82) * 0.20;
    return s;
  });
  for (let i = 0; i < 26; i++) blob(px, (rnd() * S) | 0, (rnd() * H) | 0, 4 + ((rnd() * 16) | 0), 0.66 + rnd() * 0.20, true);
}
```

### 5.5 Determinism

Seed one PRNG per band (`mulberry32`). The asset must look **identical on every load**, or you can't tell a texture change from a random flicker, and you can't ship a screenshot as a listing image.

```js
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### 5.6 If you *are* using a real atlas (Blender / DCC route)

- One **512–1024 px** atlas per asset. Small is authentic here: visible texel edges are part of the look.
- Lay out by *value*, not by body part: all the darks together, all the lights together, so a paint-over stays coherent.
- Bake nothing. Paint. Hard-edged strokes, flat fills, a rim of light on top-facing planes.
- Leave 4 px of gutter and keep each island's background EXACTLY the island's average colour, or you will get a dark halo when mipmapping.
- Graffiti: **invent** tags — fat lettering, arrows, stars, lightning bolts, drips. Never copy a real tag or logo.

---

## 6. Shading — the toon lookup, the rim, and the outline

### 6.1 The three-band toon ramp

The whole look is: `base colour × (quantized light)` plus a small ambient floor. Quantize into 2–3 bands with hard edges, and set a **minimum light** so even the shadow side keeps its colour (this is what stops a stylised model from reading as black in shadow).

```glsl
// fragment (PS1-ish, vertex-lit, texture-multiplied — see the note about affine UVs below)
vec3 n = normalize(vNrm);
float nd = max(dot(n, uLightDir), 0.0);
vec3 hemi = mix(uGroundLight, uSkyLight, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
vec3 light = uAmbient + uLightColor * nd + hemi * uHemi;
light = max(light, vec3(uMinLight));            // the ambient floor — never fully black
vec3 c = vColor * uColor * light + vColor * uEmissive;
c *= texture2D(uMap, uv).rgb;                   // the multiply detail map from §5
```

`uMinLight ≈ 0.28–0.34` is the useful range. Below 0.2 the shadow side dies; above 0.45 there is no shape left.

For a **hard** two-tone version, replace `nd` with a step:

```glsl
float band = nd > 0.42 ? 1.0 : (nd > 0.16 ? 0.72 : 0.52);   // 3 crisp tones, hard edges
vec3 light = uAmbient + uLightColor * band;
```

Add a **rim** if the silhouette needs help against a busy background:

```glsl
float rim = pow(1.0 - max(dot(n, normalize(-vViewDir)), 0.0), 3.0);
c += uRimColor * rim * uRimStrength;
```

### 6.2 The outline

Two options, both correct:

**A. Inverted hull** (geometry shell; works in every engine, no post-processing):

```js
const shell = new THREE.Mesh(mesh.geometry, outlineMaterial);
shell.material = new THREE.MeshBasicMaterial({ color: 0x0a0a10, side: THREE.BackSide });
shell.scale.setScalar(1.0);                       // scale so the shell pokes out
// Robust version: push vertices along their normals in the vertex shader
//   position + normal * uOutlineWidth * (view depth factor)
```

Scale the width with **distance** (`width ∝ depth`) or the outline closes up on far geometry and swells on near geometry.

**B. Post-process edge detect** (Sobel on depth+normals). Cheaper on draw calls, more control per-scene, and it can outline the *world* too — which is what BRC actually does.

If you have neither (like a PS1-look renderer with a hard pixel snap and fog), you can ship **no outline at all** and lean on: flat shading + a hard toon step + a strong palette contrast + a **minimum-light floor**. That is the look this project uses, and it is legitimate — but then the value structure in §4 has to do the work an outline would have done.

### 6.3 The PS1 details that sell the era

- **Vertex snapping** — quantise `clip.xy` to a low-resolution grid (`320×224`, or a uniform grid) *after* the perspective divide.
- **Affine texture mapping** — interpolate `uv / w` and `w` separately and divide in the fragment shader (see the vertex/fragment pair above). This is the famous texture "swim" on big polygons.
- **Low render resolution + upscale** with nearest or a light bilinear. 320×224 → 1280×896 is the sweet spot.
- **Dithering** on gradients (the sky), **heavy fog** to a horizon colour, and **no** anisotropic filtering on world textures.
- **A small flat palette** and a post pass that quantises to it.

---

## 7. Rigging — hinge-per-joint, authored in a readable space

A procedural rig (code-built) and a Blender armature should share the same mental model.

### 7.1 The model

1. **Joint table**: a flat list of named joints with world-space (authored-space) positions. Everything else derives from it.
2. **One `Group` per joint**, parented in hierarchy, each positioned at its joint. Its local axes are the parent's axes — so a rotation is always "about the bone's own rest orientation", which makes sign conventions learnable rather than magic.
3. **Geometry is attached by pure translation** to the deepest joint it belongs to, so `bone.rotation.x` is the only thing that moves it.
4. **Ball joints for gaps**: a sphere at every hinge, sized to the limb, so a bent joint never shows a hole.

```js
const HIP_Y = 1.000, KNEE_Y = 0.560, ANKLE_Y = 0.225, NECK_Y = 1.440;
const SHOULDER = [0.215, 1.400, -0.004], ELBOW = [0.294, 1.086, -0.004], HAND = [0.336, 0.806, 0.0];

const gHips  = hinge("hips",  root,  0, HIP_Y, 0);
const gTorso = hinge("torso", gHips, 0, 0, 0);
const gHead  = hinge("head",  gTorso, 0, NECK_Y - HIP_Y, 0);
// arm: shoulder -> elbow -> wrist, each offset from the parent's own joint
const armU = hinge("armUpperL", gTorso, SHOULDER[0] * s, SHOULDER[1] - HIP_Y, SHOULDER[2]);
const armF = hinge("armLowerL", armU, (ELBOW[0] - SHOULDER[0]) * s, ELBOW[1] - SHOULDER[1], ELBOW[2] - SHOULDER[2]);
// and a sphere at every hinge
ballAt(acc, ELBOW[0] * s, ELBOW[1], ELBOW[2], 0.05, 0.05, 0.05, C.skin);
```

### 7.2 Sign conventions you must decide and write down

Do this *immediately*, in a comment, and never violate it. This project's, with `+Y` up, `+Z` forward, and `+X` to the character's left:

| Axis | Meaning |
|---|---|
| `legUpper.rotation.x` | **negative swings the thigh forward**; `legLower.rotation.x` **positive folds the knee** |
| `foot.rotation.x` | **positive = toe down** |
| `any.rotation.z` | **positive tips toward +X** (so `side * splay` is always "outward") |
| `armUpper.rotation.x` | **positive = arm back** (negative forward; ~`-π` = overhead) |
| `armLower.rotation.x` | **negative = bicep-curl flexion** |
| `torso.rotation.x` | positive leans the trunk forward |
| `torso.rotation.z` | positive drops the **left** shoulder (top toward −X) |
| `inner.rotation.x` | the *whole body's* pitch: **positive = nose-down / forward** |

Getting one of these backwards is the single most common bug in a hand-rolled rig, and it is invisible in a still frame — a dive that arches onto its back instead of leading head-first looks "fine" until you animate it. **Verify every pitch sign with a measurement** (§13.1), not by eye.

### 7.3 Two-bone IK that keeps feet on the ground

Feet must never float or dig. Solve each leg from an **ankle target** rather than from angles:

```js
function legIK(z, y) {                     // z = forward, y = up (negative below the hip)
  const raw = Math.sqrt(z * z + y * y);
  const d = Math.min(raw, LIMB);            // clamp to the leg's length
  if (raw > 0) { z *= d / raw; y *= d / raw; }
  const theta = Math.atan2(z, -y);
  let ca = (THIGH_LEN * THIGH_LEN + d * d - SHANK_LEN * SHANK_LEN) / (2 * THIGH_LEN * d);
  ca = Math.max(-1, Math.min(1, ca));
  const thigh = theta + Math.acos(ca) - THIGH_TILT;   // "knee forward" branch
  const shin = Math.atan2(z - THIGH_LEN * Math.sin(thigh + THIGH_TILT),
    -(y + THIGH_LEN * Math.cos(thigh + THIGH_TILT))) - SHANK_TILT;
  return { thigh: -thigh, knee: thigh - shin, shin };
}
```

Two details that make it exact instead of approximate:

- **Include the joint tilts.** If the knee hangs 0.004 forward of the hip and the ankle 0.006 forward of the knee, fold that into the link lengths (`Math.hypot`) and subtract it as `THIGH_TILT`/`SHANK_TILT`. Without it, "sole flat on the ground" lands 1% of body height off — which is exactly the amount a player notices.
- **`ankleForSole(pitch)`**: the ankle height at which a sole of pitch `p` has its lowest edge on the ground. The toe and the heel take turns being lowest; take the `max` of the two.

```js
const SOLE_Y = -0.225, SOLE_TOE = 0.176, SOLE_HEEL = -0.128;
const ankleForSole = (p) => -SOLE_Y * Math.cos(p) + Math.max(SOLE_TOE * Math.sin(p), SOLE_HEEL * Math.sin(p));
```

- **Splay loses vertical reach.** A leg fanned 35° off the midline reaches `cos(35°) = 82%` as far down. If you splay the legs for a wide stance (and you should — it is what reads from behind), divide the planned drop back out by `cos(roll)`:

```js
const drop = (ankleY - hipY) / Math.max(0.30, Math.cos(roll));
```

---

## 8. Animation — pose functions, blending, and a global exaggeration dial

### 8.1 The architecture

One function per state, each easing its own joints from whatever the previous layer left:

```
poseRun(phase, blend, speed)      // the base: always called, blend 0 = rest pose
                                  //   (+ optional fwd/lat/bank: the sideways channel — `lat` runs
                                  //   a full strafe cycle, see the SHIFT LOCK notes in src/README.md)
  ├─ poseIdle(u, t)               // cross-fades in as you stop
  ├─ poseSlide(u)                 // one pose
  ├─ poseCrouch(u, walk, phase, t)// two poses in one, cross-faded by `walk`
  ├─ poseAir(u, rise, variant)    // one pose, three authored variants
  ├─ poseDive(u) / poseSlam(u) / poseTuck(u, tight)
  ├─ poseMantle(u, k)             // two beats, cross-faded on `k`
  ├─ poseWall(u, mode, phase)     // "climb" | "slide" | "run"
  ├─ poseLand(u, power)           // one shot, unwinding on its own timer
  └─ poseKick(u, side)            // additive, layered over everything
```

Rules that make this work:

- **Every pose eases.** `obj.rotation[axis] += (target - obj.rotation[axis]) * ease` with `ease = smoothstep(u)`. A pose function must be callable at any `u` from any starting state, because that is what a cross-fade *is*.
- **`poseRun` is the only one that hard-assigns** (`upper.rotation.x = ik.thigh`) and it must reproduce the exact rest pose at `blend = 0`. Every other pose eases from that.
- **One layer per state, mutually exclusive states**, each on its own fade timer. That is what lets a jump-out-of-a-crouch or a landing-into-a-slide cross instead of popping.
- **Reset the axes nobody owns.** If only `poseIdle` twists the shoulder (`upper.rotation.y`) and toes the feet out (`foot.rotation.y`), then `poseRun` must explicitly zero them, or a blend of 0 will be "the rest pose for every joint except those two".

### 8.2 The exaggeration dial

Author every action pose **exaggerated** — limbs thrown well past where they "should" stop, so the shape reads at gameplay distance — and then scale them all by a single dial:

```js
const POSEX = 0.8;                        // global: tone the exaggeration down 20%
const poseRot = (b, axis, target, e) => { b.rotation[axis] += (target * POSEX - b.rotation[axis]) * e; };
```

Two things this buys you: the user can ask for "more / less exaggerated" and you change one number; and the authored numbers stay in a humanly-readable "pushed" space (author `-2.75`, ship `-2.2`).

**The exception: contacts bypass the dial.** A pose with a solved ground contact (a hand on the deck, a knee down) must ease with `raw` (no `POSEX`), or the hand leaves the ground the moment the dial moves:

```js
const raw = (b, axis, target, e) => { b.rotation[axis] += (target - b.rotation[axis]) * e; };
// trunk roll and plant arm are a CONTACT CONSTRAINT, not an exaggeration:
raw(bones.torso, "z", SLIDE.torsoZ);
raw(bones.armUpperL, "x", SLIDE.plantX);
```

And a contact-driven pose must also **not accept a body pitch** from the state machine: rotating the whole body about the hips drives the planted hand through the floor. Keep the lean in the trunk and keep the body pitch at 0 for those states.

### 8.3 Variants (jump shapes etc.)

A chain of jumps into the same pose reads as a loop. So pick a variant per airtime and never repeat the previous one:

```js
function nextJumpVariant(cur) {
  const n = 3;                                    // tuck / scissor / star
  let v = cur;
  while (v === cur) v = (Math.random() * n) | 0;
  return v;
}
```

Then author the variants as data, not as code branches — a table of `{lead, trail}` leg tuples and `{upX, upZ, elbow}` arm tuples, indexed by variant, is far easier to tune and extend than `if (v === 0) … else if (v === 1) …`.

### 8.4 Authoring a hard pose: solve, don't eyeball

For any pose with a **contact** (hand on the deck, knee down, both feet planted), do not guess the numbers — solve them against the real mesh, in the live engine:

```js
// coordinate descent on the pose constants, objective = measured contact error
function cost() {
  ud.poseRun(0,0,0); ud.poseSlide(1);              // ease 1 => snap to the authored targets
  const g = minVertexOf(bones.armLowerL);          // lowest vertex, in the rig's own frame
  const dy = g.y - GROUND, dx = g.x - TARGET_X, dz = g.z - TARGET_Z;
  let c = dy*dy + (dx*dx + dz*dz) * 0.30;
  if (g.y < GROUND - 0.004) c += (GROUND - 0.004 - g.y) * 8;   // never clip through
  return c;
}
for (let pass = 0, step = 0.5; pass < 10; pass++, step *= 0.5) { /* ...pattern search... */ }
```

Then **bake the winner into the constants** and re-verify through the full pipeline (the game's own `updateVisual`), because fades, `inner.rotation`, scale and the run blend can all move a solved contact by a few centimetres.

And keep the constants in a **named object on the rig at runtime** (`rig.userData.poseCfg = { SLIDE, SLAM, ... }`) so the tuning loop can write to the same objects the pose functions read. That turns a 30-second rebuild into a 30-millisecond edit.

### 8.5 Timing

| Motion | Duration | Note |
|---|---|---|
| Pose fade in/out | 0.10–0.25 s | under 0.1 pops; over 0.3 lags the input |
| Landing absorb | 0.30–0.40 s | one shot, unwinding, scaled by impact |
| Roll / tumble | 0.40–0.50 s | a whole turn around the lateral axis |
| Slide | 1.5–2.0 s | long enough to read as a state, not a stumble |
| Mantle / vault | 0.30–0.40 s | two beats: pull (hand contact) → plant (feet take weight) |
| Run cycle | 0.55–0.80 s per stride | scale with speed so feet don't skate |

---

### 8.6 Squash and stretch — limbs

The single cheapest way to make an extreme frame read as an extreme. A strike's contact frame is on
screen for two or three frames at 60 Hz; drawing the limb **longer than its bones are** on exactly
those frames is what makes it land as impact instead of as a pose. Do it on:

- a **strike's extension** (the kick as it snaps straight, the cross as it reaches full stretch, the
  knee as it drives up) — peak on the *contact* key, not after it;
- a **landing** — the reverse: draw the legs slightly SHORT as the feet arrive, so what comes down
  onto the floor is a compressed leg and the body absorbs visibly;
- a **launch out of a whip or a throw** — long on the way out, short on the wind-up;
- a **fall or a dive** — a body travelling fast is drawn long, and it can be a *hold* rather than an
  accent, because the speed is a state.

Four rules, and the first three are not optional:

1. **Never scale a bone.** A non-uniform scale on a parent propagates to a subtree whose children are
   ROTATED, so scaling a thigh shears the knee and the foot instead of moving them. Scale the bone's
   own body MESH and slide each child joint out along it — rigid, and the downstream chain keeps its
   shape. (Store each child's rest offset when you build the rig.)
2. **One writer, one place, once a frame.** Let poses *ask* (record a target) and have a single
   call at the END of the pose stack spend the whole frame: `s += (want − s) * dt * k` (`k` ≈ 15),
   then write the mesh scale and the joint offsets, then reset every `want` to 1. That gives you
   "unasked bones unwind on their own" for free — so a stretch is never a state a later pose has to
   remember to clear — and it makes it impossible for two poses to leave each other's stretch on the
   rig.
3. **A limb your pose is SOLVING this frame must not be stretched this frame.** A two-bone IK solve
   works in angles and cannot know the mesh is longer than the bones, so a stretched solved contact
   goes through whatever it was solved onto. Stretch the limb that is in the air; if one limb must do
   both within half a second, gate the stretch on the solve's own weight (a `down`-style value that
   goes to 0 as the contact releases) rather than on a clock.
4. **Peaks are plateaus, and they overshoot.** The ease is exponential, so a target that is only at
   its peak for a frame or two is barely a third of the way there on the way back down — a 30 % spike
   measures as 14 % and reads as nothing. Hold the peak across the whole extension (a few frames) and
   author it ~5–8 % higher than the number you want; 1.35-ish measured on a strike frame is a good
   place to be. The way out is just as slow, which is what the landing squash in the bullet above is
   buying.

Verify it the same way as everything else here: measure the limb's world length (a joint's world
position before and after a child bone) with the channel on and off, and check the rig's lowest
vertex with it on and off — a stretch that pushes a foot 0.2 u through the floor is worse than no
stretch at all.

## 9. Blender script route (bpy)

Write a single runnable script the user can paste into Blender's Scripting tab. Keep it simple and commented.

- Block out with primitives, **name every object**, and group them in a collection.
- **Mirror modifier** for symmetric forms; **Bevel** with 1–2 segments for chunky edges.
- Set faces to **flat shading**. Check the triangle count with the Statistics overlay.
- Colour with vertex colours or a small atlas; apply the toon material and outline helpers below.
- **Shader to RGB only works in EEVEE.** Say so, or the user will render in Cycles and get a black model.

```python
import bpy

def make_toon_material(name, color, shadow=0.45):
    """Hard-banded toon material: Diffuse -> Shader to RGB -> Color Ramp (constant) -> tint -> Emission."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (1, 1, 1, 1)
    to_rgb = nt.nodes.new("ShaderNodeShaderToRGB")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = 'CONSTANT'
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (shadow, shadow, shadow, 1)
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    tint = nt.nodes.new("ShaderNodeMixRGB")
    tint.blend_type = 'MULTIPLY'
    tint.inputs["Fac"].default_value = 1.0
    tint.inputs["Color2"].default_value = color
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")

    nt.links.new(diffuse.outputs["BSDF"], to_rgb.inputs["Shader"])
    nt.links.new(to_rgb.outputs["Color"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], tint.inputs["Color1"])
    nt.links.new(tint.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def add_outline(obj, thickness=0.02, color=(0.02, 0.02, 0.03, 1)):
    """Inverted-hull outline. Assign the object's main material to slot 0 first."""
    mat = bpy.data.materials.new(obj.name + "_Outline")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = color
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    mat.use_backface_culling = True
    obj.data.materials.append(mat)

    mod = obj.modifiers.new("Outline", 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = 1
    mod.use_flip_normals = True
    mod.use_rim = False
    mod.material_offset = 1        # the shell uses the outline material in slot 1


def flat_shade(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = False


def bevel(obj, width=0.01, segments=2):
    m = obj.modifiers.new("Bevel", 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = 0.6


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)
```

Rigging helper (arms/legs as two links + an IK target), which also makes the pose-authoring in §8 usable in Blender:

```python
def two_bone_ik(chain_root, target, pole, chain_len=2):
    """Add an IK constraint on the last bone of a chain, targeting an empty."""
    b = chain_root.pose.bones[-1] if chain_len > 1 else chain_root.pose.bones[0]
    c = b.constraints.new('IK')
    c.target = target
    c.pole_target = pole
    return c


def make_chain(arm_obj, head, tail, parent_bone=None, name="bone"):
    """A straight two-link chain (upper/lower) with a hinge at the midpoint."""
    eb = arm_obj.data.edit_bones
    mid = ((head[0] + tail[0]) / 2, (head[1] + tail[1]) / 2, (head[2] + tail[2]) / 2)
    up = eb.new(name + "_upper"); up.head, up.tail = head, mid
    lo = eb.new(name + "_lower"); lo.head, lo.tail = mid, tail
    lo.parent = up; lo.use_connect = True
    if parent_bone: up.parent = parent_bone
    return up
```

---

## 10. Text-to-3D generator prompts

Fill this template. Many generators ignore negative prompts, so **fold the important exclusions into the positive text as well**.

```
Stylized low-poly [SUBJECT], cel-shaded, hand-painted flat texture with grain and
halftone dots, [2-3 SIGNATURE SHAPES], bold readable silhouette, hard-edged toon
shading, saturated [PALETTE], graffiti stickers and scuffs, oversized [HANDS /
SHOES / PACK], Jet Set Radio / Bomb Rush Cyberfunk inspired, game-ready, clean
quad topology, flat shading, [A-pose if a character], not photorealistic, no
subdivision smoothing, no thin limbs, no clean sterile surfaces

Negative: realistic, photorealistic, PBR, high poly, smooth subdivision, muted
colors, thin limbs, tiny feet, clean sterile surfaces, complex face detail
```

Variants that reliably improve generator output:

- Name the **silhouette** explicitly ("silhouette dominated by a torso-sized backpack").
- Ask for **flat shading** and "crisp facets" — generators default to smooth.
- Ask for **one 1024 atlas** and "painted details, not modelled".
- For turnarounds: "orthographic front / side / back turnaround, identical pose, flat lighting".

---

## 11. Design breakdown template

```markdown
# [Asset name]
**Silhouette:** one sentence describing the black cutout.
**Proportions:** the 2-3 exaggerations that define it (in head-heights).
**Key shapes:** 3-5 chunky forms (e.g. oversized hoodie, brick-sized sneakers).
**Palette:** 3-5 hex codes plus one accent, and which shape carries each value.
**Signature details:** 3 items that make it memorable.
**Texture notes:** grit, halftone, stickers, tags, where the wear is.
**Poly budget:** target triangle count, split by part.
**Rig notes:** joint count, what's rigid, what deforms.
**Animation notes:** which states it needs and which are one-shots.
**Modeling plan:** blockout -> refine -> UV/atlas -> paint -> toon shader + outline.
```

Fill the template, then **follow it with the modeling plan** — don't just hand over the design. A design without a plan is a mood board.

---

## 12. Worked example: a streetwear courier

**Input:** "A bike courier with a giant backpack, Bomb Rush Cyberfunk style."

**Design breakdown**

- **Silhouette:** tall lanky body dominated by a torso-sized backpack, big beanie, huge sneakers.
- **Proportions:** 6.0 head-heights; arms reach the knees; hands 1.7× realistic; feet 1.6× realistic; shoulders widened by a puffy windbreaker.
- **Key shapes:** boxy delivery backpack (the silhouette), puffy windbreaker with a dropped hem, baggy cargo shorts, chunky high-tops with a thick midsole lip.
- **Palette:** magenta `#FF2E93` jacket, yellow `#FFE600` pack, cyan `#00E5FF` shoe accents, deep purple `#1B1030` shorts, lime `#A6FF00` reflective strip as the accent.
- **Signature details:** sticker-covered pack, dangling keychain, mismatched laces.
- **Texture:** denim twill on the shorts, woven cloth on the jacket, anisotropic grain on the beanie and boot rubber, halftone screening on the pack's flat faces, scuffs concentrated at the knees and the pack's bottom edge.
- **Poly budget:** ~3,600 tris — head+hair 600, torso 700, arms 500, hands 400, legs 600, shoes 800.
- **Plan:** blockout (boxes at the joint table from §7) → refine (bevel, hem, sole lip) → **triplanar banded atlas** (§5, no unwrap needed) → paint four bands (cloth / denim / skin / hard) → vertex-lit toon shader with a `0.32` minimum-light floor + a distance-scaled inverted hull → 14-hinge rig + `poseRun`/`poseIdle`/`poseSlide`/`poseAir`(3 variants).

**Then the actual numbers.** Every joint gets a row, e.g.:

| Joint | x | y | z | Note |
|---|---|---|---|---|
| hip | 0 | 1.000 | 0 | authored hip height = 1 |
| knee | 0 | 0.560 | 0.004 | hinge 4 mm forward |
| ankle | 0.200 | 0.225 | 0.010 | sole is 0.225 below, toe +0.176 / heel −0.128 |
| shoulder | 0.215 | 1.400 | −0.004 | |
| elbow | 0.294 | 1.086 | −0.004 | upper link 0.324 |
| hand | 0.336 | 0.806 | 0.000 | forearm link 0.283, palm 0.028 thick |

This table *is* the model. Geometry is then written against it, and the rig is free.

---

## 13. QA — how to check your own work without fooling yourself

### 13.1 Verify signs with numbers, not eyes

Never trust a still frame for pitch direction. Measure:

```js
// "does +rotation.x tip the head forward?" — compare head vs hips in world Z
const headZ = head.getWorldPosition(new THREE.Vector3()).z;
const hipZ  = hips.getWorldPosition(new THREE.Vector3()).z;   // yaw zeroed
// +rotation.x should move the head FORWARD (larger z, if the model faces +Z)
```

And for contacts:

```js
// lowest vertex of a subtree, in an arbitrary reference frame
function minVertexOf(scope, frame) {
  frame.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert();
  const v = new THREE.Vector3();
  let min = Infinity, at = null;
  scope.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
      if (v.y < min) { min = v.y; at = v.clone(); }
    }
  });
  return { min, at };
}
```

Then assert: **the contact part's minimum equals the ground plane to within a millimetre, and nothing else is below it.**

### 13.2 The vision-tool trap

An image model judging a dark, faceless, low-poly character at a small size is **unreliable**, and it will contradict itself between renders. It is useful for: "is this a readable silhouette?", "does the pose read as X?", "where is each limb pointing?". It is **not** reliable for: "is there a 3 cm gap between the hand and the ground" or "is a foot 2 cm below the plane".

So: **measure contacts numerically; use vision for readability.** And when you do ask vision, help it:

- Render with a **`MeshNormalMaterial`** override (each surface tinted by its facing). Limb orientation becomes legible and accuracy improves dramatically.
- **Show the ground plane** in the shot. A solo render with no floor makes any contact question meaningless.
- Add a **reference plane and a sky-coloured background** so "up" and "down" are unambiguous.
- Ask **one focused question per tile**, and ask for a **rating** so you get a signal you can optimise.

### 13.3 The checklist

Run this before finishing, and fix anything that fails.

- [ ] Does the silhouette read as a solid black shape, from every angle a player sees?
- [ ] Are the proportions exaggerated — feet, hands, clothing volume, head size?
- [ ] Is the triangle count within budget, and is the budget spent on silhouette?
- [ ] Is the palette limited, punchy, and readable in grayscale?
- [ ] Is the shading hard-banded with a minimum-light floor (never pure black)?
- [ ] Is there believable grit — grain, halftone, scuffs, stickers — with the wear **where a body would wear**?
- [ ] Are all feet on the ground and no vertices below it, **measured**, in every state?
- [ ] Do the limbs interpenetrate at the extremes of every animation?
- [ ] Do all poses cross-fade (no pops), and does every state return to the rest pose as its blend goes to 0?
- [ ] Are the timings in §8.5 respected (fades, one-shots, cycles)?
- [ ] Does it look right at **gameplay distance**, not just in a close-up?
- [ ] Does it still read when the camera is **directly behind** (the view the player actually has)?
- [ ] Is the model deterministic (same on every load)?

---

## 14. Anti-patterns

| Anti-pattern | Why it hurts | Do instead |
|---|---|---|
| Smooth subdivision blobs | destroys the facets that *are* the style | flat shading, hard edges, low loops |
| Tiny hands / tiny feet | the silhouette goes limp | oversize both, always |
| Photoreal PBR, normal maps | fights the illustrated read | flat colours + one multiply detail map |
| Muted / desaturated palette | model turns to grey mush in fog | 3–5 saturated colours + 1 accent, value-checked |
| Modelling detail that doesn't break the silhouette | wasted tris | paint it in the atlas |
| Guessing contact numbers by eye | hand floats / foot digs | solve numerically against the mesh (§8.4) |
| Letting a global "exaggeration" dial touch a contact constraint | the hand leaves the ground | ease contacts with `raw`, no dial |
| A body pitch on a state whose pose has a ground contact | the contact sinks through the floor | keep the lean in the trunk |
| One pose reused for every jump | reads as a loop | 3 authored variants, never repeating |
| Hard-assigning angles in a secondary pose | it will pop on every cross-fade | ease everything from the previous layer |
| Number literals scattered through geometry code | untunable | one named constants object per pose, exposed at runtime |
| Trusting an image model on a centimetre-scale contact | contradictions, wasted iterations | measure it numerically |
| Oppositional limb swing (left arm forward with right leg forward) on a body that is *tumbling or spinning* | every revolution passes back through upright, and on that frame the pose is a freeze-frame of a slouching run | swing the limbs in the SAME phase as the trunk, or LAG them by a fixed phase — a thrown body folds and trails, it does not stride |
| Sprawled limbs on a thrown / knocked-out body | it reads as alive and mid-lunge, not limp | fold it: knees up onto the chest, arms in across the body, the two legs together, only a whisker of asymmetry between the sides |
| A lead-and-trail pair (a 20°+ gap) on a move whose signature frame is drawn in silhouette | on that one frame it is a pair of scissors, not a strike | author the two limbs as a PAIR — the trail one key behind the lead and a few hundredths short — with the splay ≤ 0.05; keep the lead's own keys |
| Wrapping up without looking at the render | silent visual breakage | render, look, then report done |

---

## 15. Glossary

- **HH** — head-heights; the unit of proportion. "6 HH" = six heads tall.
- **Band** — one horizontal strip of the texture atlas, holding one material family, tiled inside itself.
- **Authored space** — the model's private coordinate system before world fitting (hip at 1.0, ground at 0).
- **Contact constraint** — a pose value solved against the mesh so a body part touches the ground exactly; must not be scaled by an exaggeration dial.
- **Hinge** — a `Group` placed at a joint; rotation about it moves everything attached below.
- **Inverted hull** — an outline made by a back-face shell pushed out along the normals.
- **Link** — one straight segment of a limb between two joints.
- **Multiplying detail map** — a texture (typically grayscale around 1.0) multiplied into vertex colour, so it can only add grit, never change the palette.
- **POSEX** — the global exaggeration multiplier applied to action poses; contacts opt out.
- **Triplanar UV** — per-face UVs projected from the dominant normal axis; no unwrap, no seams to paint.
- **Variant** — one of several authored shapes for the same state (jump tucks, kicks), picked per airtime.
