import * as THREE from "./three.js";

THREE.ColorManagement.enabled = false;

export const settings = {
  lowRes: true,
  internalHeight: 224,
  maxInternalWidth: 520,
  wobble: 1,
  dither: 1,
  colorLevels: 32,
  affine: 1,
  fog: 1,
  viewDistance: 4,
  showPs1Menu: true,
  showControlsGuide: true,
  // WHICH WORLD GENERATOR FILLS THE FIELD — "field" is the biome roll the world has always been,
  // "maze" is the endless maze (see "THE MAZE" in world.js, and `setWorld` in main.js, which is
  // the only thing that ever changes it: the whole field has to be torn down and re-streamed).
  world: "field",
  firstPerson: false,
  // NO CAMERA FLIP — the user's *"add an option in the settings to stop the screen from fliping with
  // the double jump flip and name it no camera flip"*. In first person the body's tumble is what
  // makes a somersault READ (the world goes over: see the `bodySpin` term in `CameraRig.follow`),
  // but a whole revolution of the horizon is too much for some players to watch, so it can be
  // switched off here. With it on, the view stays world-upright through a flip — the eye still
  // rides the head, but the picture no longer rolls over with it. Only ever affects first person;
  // the chase camera never tumbled with the body in the first place.
  noCamFlip: false,
  // THE MOBILE INTERFACE, on or off. `isTouch` (main.js) decides whether the DEVICE can show the
  // phone's stick-and-buttons at all; this is the player's own half of that, flipped by the MOBILE UI
  // row in OPTIONS (see `applyTouchUI`). It exists because a touch-capable machine is not always a
  // phone — a laptop with a touchscreen boots with the pads over the game, and before this option the
  // only way to lose them was to unplug the touchscreen. Off, the whole phone layer stands down: the
  // overlay is hidden, the `touchMode` layout goes with it, and the game reads the mouse and the
  // keyboard exactly as it would on a desk.
  touchUI: true,
  // The master level of the game's own mix, 0..1 (see `Sfx.setVolume` and the OPTIONS VOLUME row).
  // 1 is the mix as authored; it is applied to the live audio node the moment a slider moves, so it
  // can be dragged while the game is playing.
  volume: 1,
  // The interface's base type size in px. Every font-size in index.html's stylesheet is a multiple
  // of it (see `:root`'s `--fs`), so the HUD's whole type scale — and the panel widths and button
  // sizes keyed off the same variable — come from this one number. `setTextSize` in main.js is the
  // only writer, and it mirrors it onto <html> as an inline custom property.
  textSize: 12,
  // The player's outline: an inverted-hull shell (see `attachOutline`). `outlinePx` is the
  // hull's width in *internal* pixels, so it survives the low-res buffer and the vertex
  // snap instead of thinning out with distance. `outlineDigitScale` is the fingers' share of
  // it — the digits get their own, thinner ink (see `attachOutline`).
  outline: 1,
  outlinePx: 1.1,
  outlineDigitScale: 0.6,
  doxSaver: false,
};

// Full-resolution buffer cap. These scale the *display* size down by one shared factor, so
// the buffer's aspect always equals the window's: capping width and height independently
// (min(dw,1280) x min(dh,720)) silently stretches the canvas on anything that isn't 16:9
// (16:10 laptops, ultrawides — i.e. most fullscreen windows).
const MAX_INTERNAL_WIDTH = 1280;
const MAX_INTERNAL_HEIGHT = 720;

export const shared = {
  uResolution: { value: new THREE.Vector2(320, 224) },
  uSnap: { value: 1.0 },
  uAffine: { value: 1.0 },
  uFogColor: { value: new THREE.Color(0.78, 0.81, 0.71) },
  uFogNear: { value: 48 },
  uFogFar: { value: 122 },
  uFogMix: { value: 1.0 },
  uLightDir: { value: new THREE.Vector3(0.45, 0.82, 0.35).normalize() },
  uLightColor: { value: new THREE.Color(0.5, 0.5, 0.5) },
  uAmbient: { value: new THREE.Color(0.46, 0.46, 0.46) },
  uSkyLight: { value: new THREE.Color(1, 1, 1) },
  uGroundLight: { value: new THREE.Color(1, 1, 1) },
  uHemi: { value: 0.1 },
  uOutline: { value: 2.0 },
  uOutlineThin: { value: 1.1 },
  // THE ICON MODE. A flat CUT-OUT of a body: every material built by `createMaterial` draws as pure
  // white washed toward gray with distance from the camera, with no lighting, no fog and no texture
  // — the look the HUD's skill icons are baked in (see "THE SKILL ICONS"). The outline shells are
  // not affected (they are the INK), so a flat body still comes with its black line.
  //
  // It lives on `shared` rather than in `settings` on purpose: it is not a player option and it is
  // never on during play — it is switched on for the single synchronous render that writes an icon
  // and off again in the same breath, so the only thing that ever sees it is the offscreen pass.
  // `uFlatNear`/`uFlatFar` are the camera-space depth band the gray ramp spans; they are set per
  // render to the body's own extent (see the icon builder), so every icon gets the full ramp no
  // matter how big the pose is or how far the camera ends up sitting.
  uFlat: { value: 0 },
  uFlatNear: { value: 0 },
  uFlatFar: { value: 1 },
};

const VERT = `
attribute vec3 aColor;
uniform vec2 uResolution;
uniform float uSnap;
varying vec3 vColor;
varying vec3 vNrm;
varying vec3 vViewPos;
varying float vFogDepth;
#ifdef USE_MAP
varying vec2 vMapUvP;
varying vec2 vMapUvA;
varying float vMapW;
#endif
#ifdef LAWN
varying vec3 vWPos;
#endif
void main() {
  vColor = aColor;
  vNrm = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  #ifdef LAWN
  vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
  #endif
  vec4 clip = projectionMatrix * mv;
  float w = clip.w;
  if (w > 0.0 && uSnap > 0.0) {
    vec2 g = max(uResolution * 0.5, vec2(1.0)) * uSnap;
    clip.xy = floor((clip.xy / w) * g) / g * w;
  }
  gl_Position = clip;
  #ifdef USE_MAP
  vMapUvP = uv;
  vMapUvA = uv * w;
  vMapW = w;
  #endif
  vViewPos = mv.xyz;
  vFogDepth = -mv.z;
}
`;

const FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
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
uniform float uMinLight;
uniform vec3 uEmissive;
uniform float uCel;
uniform float uCelBands;
uniform float uRim;
uniform vec3 uRimColor;
uniform float uRimPow;
uniform float uFlat;
uniform float uFlatNear;
uniform float uFlatFar;
varying vec3 vColor;
varying vec3 vNrm;
varying vec3 vViewPos;
varying float vFogDepth;
#ifdef USE_MAP
uniform sampler2D uMap;
uniform float uAffine;
varying vec2 vMapUvP;
varying vec2 vMapUvA;
varying float vMapW;
#endif
#if defined(USE_MAP) && defined(LAWN)
// THE LAWN (see createMaterial's own note, and "THE LAWN" in world.js). x is the DETAIL tile in
// world units, y the MACRO tile, and z scales both against the map's own average.
uniform vec3 uLawn;
varying vec3 vWPos;
#endif
void main() {
  // THE ICON MODE (see shared.uFlat): a flat cut-out — white in front, gray behind, nothing else.
  // It returns before any of the lighting, the map or the fog, so an icon is the same picture in
  // any weather, at any time of day and under any mood the sky happens to be wearing.
  if (uFlat > 0.5) {
    float dd = clamp((vFogDepth - uFlatNear) / max(0.001, uFlatFar - uFlatNear), 0.0, 1.0);
    // The ramp is a PLATEAU, not a slide: the front third of the pose in depth stays pure white and
    // only past it does the gray come in, reaching full gray at the back. A plain linear mix was
    // tried first and the icons read as one flat gray mass, because with a linear ramp the ONLY white
    // pixel is the single nearest point of the body and everything else is already partway to gray.
    // (The band itself spans the pose's depth — see the setBand call in icons.js — so this is
    // scale-free.)
    //
    // Opaque no matter what the material says. Some body parts (eyes and hair, by the look of them)
    // are drawn at partial opacity, and a cut-out blended with the background is a cut-out with a
    // halo: the magenta key would read the blend as body and the icon would come out pink. The icon
    // is a silhouette, so in this mode every material is solid.
    float shade = smoothstep(0.34, 1.0, dd);
    gl_FragColor = vec4(mix(vec3(1.0), vec3(0.42), shade), 1.0);
    return;
  }
  vec3 n = normalize(vNrm);
  float nd = max(dot(n, uLightDir), 0.0);
  // Cell shading: the diffuse term snapped to whole steps, so a facet picks a
  // band and holds it instead of shadowing off smoothly. Mixed by uCel (the
  // world's materials leave it at 0 and keep the PS1 ramp).
  nd = mix(nd, floor(nd * uCelBands + 0.5) / uCelBands, uCel);
  vec3 hemiC = mix(uGroundLight, uSkyLight, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 light = uAmbient + uLightColor * nd + hemiC * uHemi;
  light = max(light, vec3(uMinLight));
  // The toon half. Snapping nd alone is not enough to see: the world's ambient floor
  // (which is what stops its own facades going black) is most of the total, so every band
  // lands within a few percent of the next. The cel branch therefore re-scales the WHOLE
  // light term by the banded diffuse — the shadow bands come down to ~0.6, the lit band
  // stays — which is what turns a facet into a flat patch of colour instead of a gradient.
  light = mix(light, max(vec3(uMinLight), light * mix(0.62, 1.0, nd)), uCel);
  vec3 c = vColor * uColor * light + vColor * uEmissive;
  #if defined(USE_MAP) && defined(LAWN)
  vec2 gp = vWPos.xz;
  vec3 dt = texture2D(uMap, gp / uLawn.x).rgb;
  vec3 mc = texture2D(uMap, gp / uLawn.y).rgb;
  float ld = (dt.r + dt.g + dt.b) * 0.3333333 - 0.95;
  float lm = (mc.r + mc.g + mc.b) * 0.3333333 - 0.95;
  // ...AND THE MACRO IS HELD OFF THE FEET (see "THE LAWN"). A 13-unit sample is a clump-level read,
  // and at three metres from the eye one tile of it covers most of the screen: that is a blotch, not
  // grass. It is also the term that carries the distance, so it is not switched off but faded IN
  // over the first few metres, while the fine 2-unit sample — which is the turf between the blades
  // and is all the near ground needs — hands over to it as it goes.
  float far01 = smoothstep(2.5, 17.0, vFogDepth);
  float amp = uLawn.z * mix(0.95, 1.0, far01);
  float shade = max(0.62, 1.0 + (ld * mix(0.9, 0.4, far01) + lm * mix(0.1, 1.0, far01)) * amp);
  vec3 lawnTint = mix(vec3(0.9, 1.0, 0.82), vec3(1.07, 1.02, 0.85), clamp(shade * 1.6 - 0.7, 0.0, 1.0));
  c *= lawnTint * shade;
  #elif defined(USE_MAP)
  vec2 uvP = vMapUvP;
  vec2 uvA = vMapUvA / max(vMapW, 0.0001);
  c *= texture2D(uMap, mix(uvP, uvA, uAffine)).rgb;
  #endif
  // Neon: a Fresnel rim in the part's OWN colour, so a cyan sleeve lights its
  // own edge and the black hair waits for the outline. Added before the fog so
  // the glow dies into the haze with everything else.
  vec3 vdir = normalize(-vViewPos);
  float fres = pow(1.0 - clamp(dot(n, vdir), 0.0, 1.0), uRimPow);
  c += vColor * uRimColor * (uRim * fres);
  float f = clamp((vFogDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f) * uFogMix;
  c = mix(c, uFogColor, f);
  gl_FragColor = vec4(c, uOpacity);
}
`;

// The outline shell's vertex shader. It runs the same vertex snap as `VERT` — the hull has
// to wobble exactly like the body it wraps, or the ink line swims against it — with one
// extra step first: push the vertex out along its own view-space normal by whatever distance
// projects to `uOutline` pixels *at this vertex's depth*, so the line holds a constant
// screen width instead of thinning out with distance.
const OUTLINE_VERT = `
uniform vec2 uResolution;
uniform float uSnap;
uniform float uOutline;
varying float vFogDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  float k = uOutline * 2.0 / max(1.0, uResolution.y * projectionMatrix[1][1]);
  mv.xyz += n * (k * max(0.0, -mv.z));
  vec4 clip = projectionMatrix * mv;
  float w = clip.w;
  if (w > 0.0 && uSnap > 0.0) {
    vec2 g = max(uResolution * 0.5, vec2(1.0)) * uSnap;
    clip.xy = floor((clip.xy / w) * g) / g * w;
  }
  gl_Position = clip;
  vFogDepth = -mv.z;
}
`;

// A flat ink fill. The fog matters: without it a black ring hangs in the haze around a
// character that has already faded into it.
//
// `uOpacity` is 1 for the ink and whatever the caller asks for when a body is TINTED (see
// `setOutlineTint`): the fragment is the one place the alpha can come from, because the shell's
// material is shared by every body in the game and the only per-body thing in it is which
// material a shell is wearing.
const OUTLINE_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogMix;
varying float vFogDepth;
void main() {
  vec3 c = uColor;
  float f = clamp((vFogDepth - uFogNear) / max(0.001, uFogFar - uFogNear), 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f) * uFogMix;
  c = mix(c, uFogColor, f);
  gl_FragColor = vec4(c, uOpacity);
}
`;

export function createMaterial(opts = {}) {
  const {
    map = null,
    color = 0xffffff,
    transparent = false,
    opacity = 1,
    side = THREE.FrontSide,
    depthWrite = true,
    depthTest = true,
    minLight = 0,
    emissive = 0x000000,
    cel = 0,
    celBands = 3,
    rim = 0,
    rimColor = 0xffffff,
    rimPow = 2.6,
    // THE LAWN (see "THE LAWN" below, and in world.js). `false` — every material in the game — is
    // the plain single-sample map the ground has always worn. `true` (or a [detailTile, macroTile,
    // amp] triple) turns the fragment shader's map read into the hills' two-scale grass, which is
    // the whole of what makes the ground read as a FIELD rather than as paint at any distance.
    lawn = false,
  } = opts;
  const lawnU = lawn ? (lawn === true ? [2, 13, 4] : lawn) : null;

  return new THREE.ShaderMaterial({
    uniforms: {
      uResolution: shared.uResolution,
      uSnap: shared.uSnap,
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
      uMinLight: { value: minLight },
      uEmissive: { value: new THREE.Color(emissive) },
      uCel: { value: cel },
      uCelBands: { value: celBands },
      uRim: { value: rim },
      uRimColor: { value: new THREE.Color(rimColor) },
      uRimPow: { value: rimPow },
      uFlat: shared.uFlat,
      uFlatNear: shared.uFlatNear,
      uFlatFar: shared.uFlatFar,
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uAffine: shared.uAffine,
      uMap: { value: map },
      ...(lawnU ? { uLawn: { value: new THREE.Vector3(lawnU[0], lawnU[1], lawnU[2]) } } : {}),
    },
    defines: {
      ...(map ? { USE_MAP: "" } : {}),
      ...(lawnU ? { LAWN: "" } : {}),
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent,
    opacity,
    side,
    depthWrite,
    depthTest,
  });
}

// --------------------------------------------------------------------------
// THE PLAYER'S OUTLINE
//
// Every mesh handed to `attachOutline` gets a second mesh parented to it: the same geometry
// with welded normals (`weldedNormalGeometry`), drawn back-faces-only in flat ink and pushed
// out along those normals (see `OUTLINE_VERT`). Parenting the shell to the mesh it wraps is
// what makes this free to animate — the shell rides every hinge, pose and squash the body
// does, with no rig bookkeeping.
//
// The pass order is what keeps it clean. The body is a hierarchy of RIGID PARTS that overlap
// each other at the joints, so a hull drawn after the body leaks ink onto whatever part sits
// behind each seam. Instead:
//
//   renderOrder 3 — the shells. `depthWrite: false`, so they leave no depth behind.
//   renderOrder 4 — the body. It draws last and paints straight over the ink.
//
// (3 and 4 rather than 1 and 2: the world's crack decals sit at 2, and a decal drawn after
// the ink would paint over the line wherever the character stood in front of one.)
//
// Every ink pixel inside the character's silhouette is therefore covered by the character
// itself, and what survives is exactly the ink OUTSIDE the union silhouette: one clean line
// around the whole figure, no poke-through, no bleed, no internal seams. It also means the
// ink respects the world for free — it is depth-tested against whatever was drawn before it,
// so a hull behind a building is hidden like everything else. (`streetwear.js` /
// `charmodel.js` set the body's `renderOrder`; the world stays at the default 0.)
//
// A side effect worth knowing: because the ink is drawn before the body, a limb resting
// against another part does not get an inner contour line — the shapes merge, joined by the
// single outer line. That is the intended look (it is what the world's own silhouette
// reads as), and at this resolution an inner contour would be a crawling speck anyway.
//
// The push is done in view space, so the line holds the same width on screen whether the
// character is across the map or in your face, whatever scale `fitGroup` gave it.
//
// `attachOutline`'s third argument scales that width for one part: the digits pass
// `settings.outlineDigitScale` (0.6), because a finger is only a few pixels wide at the
// baseline buffer and a body-width line around one is a line with a finger hidden inside it.
// It is a second material rather than a second shader — same program, its own `uOutline`.
//
// `outlineMeshes` is the toggle's handle: one array, one flag, no scene traversal.
// `outlineThinMaterial` is that second material: parts whose ink has to be narrower than the
// body's hand `attachOutline` a `widthScale` below 1 and land on it.
let outlineMaterial = null;
let outlineThinMaterial = null;
export const outlineMeshes = [];
// THE HIT FLASH (see `setBodyFlash`). One shared material, and a second hull mesh per body part
// hanging off the same welded geometry the ink uses, so the flash costs one draw call per visible
// part for the two or three frames it lasts and nothing at all the rest of the time.
let flashMaterial = null;
const FLASH_COLOR = new THREE.Color(1.55, 1.5, 1.42);
// ...and HOW MUCH OF IT there is. This used to be all of it, and at 1.55 additive over the whole
// silhouette the body did not read as "struck", it read as a white cut-out — the user's *"can u not
// make the dummy like do white highlight when i hit him or keep it but make the highlight opacity
// like 25%"*. 0.25 is that number, applied to the additive CONTRIBUTION (`uColor * uOpacity` in the
// fragment), which is the only size an additive flash has. At a quarter a struck body is still
// lifted hard toward white on the contact frame and back off it the frame after — the cue is
// unchanged — it is simply no longer a hole in the picture.
const FLASH_OPACITY = 0.25;

// The character is authored HARD-EDGED: every face carries its own flat normal and no two
// faces share a vertex. Expand along those flat normals and the hull tears open at every
// corner — a dotted line with bald patches on the head and legs, and stray facets poking
// out of creases as streaks on the body.
//
// So the shell gets its own copy of the geometry with the vertices WELDED by position and
// the normals averaged over the faces that meet there, weighted by face area so a big face
// pulls harder than a sliver. The hull then inflates as one continuous surface, the way an
// offset of the real shape should.
//
// The average is taken over the geometry's OWN normal attribute rather than recomputed from
// the winding: the imported model (charmodel.js) is mirrored, so its triangle winding points
// inwards and cross products would inflate its hull inwards — invisible. Its authored
// normals are correct, and for a flat-shaded mesh the authored normals ARE the face normals,
// so this is the same average either way, only robust to handedness.
//
// Positions are untouched — only the normals differ — so the shell still lands exactly on
// the body when `uOutline` is zero.
const _ov = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _oe1 = new THREE.Vector3();
const _oe2 = new THREE.Vector3();
const _ofn = new THREE.Vector3();

function weldedNormalGeometry(geo) {
  const pos = geo.getAttribute("position");
  const src = geo.getAttribute("normal");
  const index = geo.index ? geo.index.array : null;
  const count = pos.count;
  const seen = new Map();
  const remap = new Int32Array(count);
  const vx = [];
  const vy = [];
  const vz = [];
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Quantized so that "the same point" survives floating-point noise.
    const key = Math.round(x * 20000) + "," + Math.round(y * 20000) + "," + Math.round(z * 20000);
    let u = seen.get(key);
    if (u === undefined) {
      u = vx.length;
      seen.set(key, u);
      vx.push(x);
      vy.push(y);
      vz.push(z);
    }
    remap[i] = u;
  }
  const nv = vx.length;
  const nrm = new Float32Array(nv * 3);
  const tris = (index ? index.length : count) / 3;
  for (let t = 0; t < tris; t++) {
    const ia = index ? index[t * 3] : t * 3;
    const ib = index ? index[t * 3 + 1] : t * 3 + 1;
    const ic = index ? index[t * 3 + 2] : t * 3 + 2;
    const a = remap[ia], b = remap[ib], c = remap[ic];
    _ov[0].set(vx[a], vy[a], vz[a]);
    _ov[1].set(vx[b], vy[b], vz[b]);
    _ov[2].set(vx[c], vy[c], vz[c]);
    _oe1.subVectors(_ov[1], _ov[0]);
    _oe2.subVectors(_ov[2], _ov[0]);
    _ofn.crossVectors(_oe1, _oe2);
    const area = _ofn.length();
    for (let k = 0; k < 3; k++) {
      const n = k === 0 ? a : k === 1 ? b : c;
      const i = k === 0 ? ia : k === 1 ? ib : ic;
      nrm[n * 3] += src.getX(i) * area;
      nrm[n * 3 + 1] += src.getY(i) * area;
      nrm[n * 3 + 2] += src.getZ(i) * area;
    }
  }
  const p = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    p[i * 3] = vx[i]; p[i * 3 + 1] = vy[i]; p[i * 3 + 2] = vz[i];
    const x = nrm[i * 3], y = nrm[i * 3 + 1], z = nrm[i * 3 + 2];
    const len = Math.hypot(x, y, z);
    if (len > 1e-9) { nrm[i * 3] = x / len; nrm[i * 3 + 1] = y / len; nrm[i * 3 + 2] = z / len; }
    else { nrm[i * 3] = 0; nrm[i * 3 + 1] = 1; nrm[i * 3 + 2] = 0; }
  }
  // Orientation. The street model's parts all agree with "outward from the mesh's own
  // centroid" (the flattest, most awkward part still scores +0.14); the imported look is a
  // mirrored game-rip whose normals point inwards and scores -0.15, which would inflate its
  // hull into the body where nothing can see it. Nothing legitimate lands near zero, so the
  // sign is a safe test — and flipping is all it takes to make either model work.
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < nv; i++) { cx += vx[i]; cy += vy[i]; cz += vz[i]; }
  cx /= nv; cy /= nv; cz /= nv;
  let score = 0;
  for (let i = 0; i < nv; i++) {
    const dx = vx[i] - cx, dy = vy[i] - cy, dz = vz[i] - cz;
    const dl = Math.hypot(dx, dy, dz) || 1;
    score += (nrm[i * 3] * dx + nrm[i * 3 + 1] * dy + nrm[i * 3 + 2] * dz) / dl;
  }
  if (score < 0) for (let i = 0; i < nv * 3; i++) nrm[i] = -nrm[i];
  const idx = new Uint32Array(tris * 3);
  for (let t = 0; t < tris * 3; t++) idx[t] = index ? remap[index[t]] : remap[t];
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(p, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

export function attachOutline(mesh, geometry, widthScale = 1) {
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const thin = widthScale < 0.999;
  if (!outlineMaterial) {
    outlineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: shared.uResolution,
        uSnap: shared.uSnap,
        uOutline: shared.uOutline,
        uFogColor: shared.uFogColor,
        uFogNear: shared.uFogNear,
        uFogFar: shared.uFogFar,
        uFogMix: shared.uFogMix,
        uColor: { value: new THREE.Color(0x07070b) },
        uOpacity: { value: 1 },
      },
      vertexShader: OUTLINE_VERT,
      fragmentShader: OUTLINE_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    });
  }
  if (thin && !outlineThinMaterial) {
    outlineThinMaterial = outlineMaterial.clone();
    // `clone()` DEEP-copies the plain uniform objects, so the copy's `uResolution` would be a
    // snapshot that goes stale the next time the buffer is resized (`syncMaterialSettings` and
    // `Presentation.resize` write to the SHARED objects). Re-point every shared uniform at the
    // shared object; the only one that differs is `uOutline`.
    const u = outlineThinMaterial.uniforms;
    u.uResolution = shared.uResolution;
    u.uSnap = shared.uSnap;
    u.uFogColor = shared.uFogColor;
    u.uFogNear = shared.uFogNear;
    u.uFogFar = shared.uFogFar;
    u.uFogMix = shared.uFogMix;
    u.uOutline = shared.uOutlineThin;
  }
  const welded = weldedNormalGeometry(geometry);
  const shell = new THREE.Mesh(welded, thin ? outlineThinMaterial : outlineMaterial);
  shell.frustumCulled = false;
  // See the note above: 3 puts the shells after the world AND its crack decals (2) and
  // before the body (4), which is what paints over the ink inside the silhouette.
  shell.renderOrder = 3;
  shell.visible = settings.outline > 0;
  shell.userData.isOutline = true;
  // ...and WHAT THIS SHELL DRAWS WITH when nothing is tinting it — the shared ink, or the shared
  // digits' ink (`widthScale`). Kept on the shell because the tint is a SWAP of material rather
  // than a change of it (the material is shared by every body, so recolouring it would recolour
  // every body), and putting it back needs to know which of the two it came off (see
  // `setOutlineTint` / `clearOutlineTint`).
  shell.userData.baseMaterial = shell.material;
  outlineMeshes.push(shell);
  mesh.add(shell);
  // THE HIT FLASH, hung on the same part from the SAME welded geometry (one geometry, two meshes —
  // so this costs no extra memory and no extra weld). It is the mirror of the ink in every way that
  // matters: FRONT-facing instead of back, ADDED instead of painted, drawn AFTER the body (9) rather
  // than before it (3) — so where the ink is only ever seen outside the silhouette, this covers the
  // silhouette itself, and a struck body is briefly its own shape in white. It is invisible except
  // during a flash (see `setBodyFlash`), and it never writes depth, so it cannot hide anything.
  if (!flashMaterial) {
    flashMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uResolution: shared.uResolution,
        uSnap: shared.uSnap,
        uOutline: shared.uOutline,
        uColor: { value: FLASH_COLOR.clone() },
        uOpacity: { value: FLASH_OPACITY },
      },
      vertexShader: OUTLINE_VERT,
      fragmentShader: FLASH_FRAG,
      side: THREE.FrontSide,
      depthWrite: false,
      depthTest: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
  }
  const flash = new THREE.Mesh(welded, flashMaterial);
  flash.frustumCulled = false;
  flash.renderOrder = 9;
  flash.visible = false;
  flash.userData.isFlash = true;
  mesh.add(flash);
  return shell;
}

// The flash's own fill: flat, additive, and unfogged. Deliberately NOT fogged — the ink fades into
// the haze because a black ring around a body that has already faded is a wart, but a body going
// white for two frames at any distance is a hit landing, and the one thing it must never do is get
// quietly dimmer exactly when the fight has moved away from the camera.
const FLASH_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(uColor * uOpacity, 1.0);
}
`;

// Is this body flashing? `root` is a character group; `amount` is 1 at the contact and 0 when it is
// over. The list of hulls is read off the group once and cached, because the alternative is a
// `traverse` of thirty nodes per body per frame for a feature that is usually doing nothing.
export function setBodyFlash(root, amount) {
  if (!root) return;
  let list = root.userData.flashMeshes;
  if (!list) {
    list = [];
    root.traverse((o) => {
      if (o.userData.isFlash) list.push(o);
    });
    root.userData.flashMeshes = list;
  }
  const on = amount > 0.02;
  for (let i = 0; i < list.length; i++) list[i].visible = on;
}

// ...and what colour the flash is. Shared by every body (they are never flashing in different
// colours at the same instant), and pushed past white on purpose: the material is additive, so
// 1.55 is "brighter than the brightest thing on screen", which is what makes the silhouette read.
export function setFlashColor(r, g, b) {
  if (!flashMaterial) return;
  flashMaterial.uniforms.uColor.value.setRGB(r, g, b);
}

// --------------------------------------------------------------------------
// THE OUTLINE TINT
//
// A body can be given a RED OUTLINE for a beat. It exists for one thing: telling the player that
// a move refused a body on purpose — the chain passes THROUGH a ragdoll (see `Enemies.nearest`),
// so a scissor thrown at one whiffs even though it is right there, and the user asked for that
// refusal to be visible (the user's *"if i try to like hit the enemy while hes ragdoll ... make it
// if that happens like a 25% opacity red outline appears around the enemy"*).
//
// The ink is ONE shared material and ONE shared colour (`outlineMaterial` above), so a body
// cannot be recoloured where it stands: this is a second pair of materials — the body's width and
// the digits' — that the ONE body being tinted wears for the life of the cue, and
// `clearOutlineTint` hands its shells back to the shared ones. Only one body is ever tinted at a
// time (the move that asks for it names one target), which is the same bargain the flash makes,
// and it is why the colour and the alpha live on the material rather than on each shell.
//
// `transparent: true` is the whole of the "25% opacity": the shell moves into the transparent
// pass, so it lands AFTER the body it wraps — its far side is depth-tested away behind the body
// exactly as the opaque ink's is, and what survives is the same clean ring around the figure, at
// whatever alpha the caller asked for. `depthWrite` is already off, so it cannot hide anything.
//
// The shells are collected once per body (`userData.outlineTintShells`, the same cache the flash
// uses) because the alternative is a thirty-node `traverse` on every frame of every cue.
let outlineTintMaterial = null;
let outlineTintThinMaterial = null;

function buildOutlineTint() {
  // `clone()` DEEP-copies the plain uniform objects, so the copies' `uResolution` / `uFog*` would
  // be snapshots that go stale the moment the buffer is resized — the same trap `outlineThinMaterial`
  // documents above. Every shared uniform is re-pointed at the shared object; `uColor`, `uOpacity`
  // and the shell's own `uOutline` are the ones that differ.
  const rePoint = (mat, thin) => {
    const u = mat.uniforms;
    u.uResolution = shared.uResolution;
    u.uSnap = shared.uSnap;
    u.uFogColor = shared.uFogColor;
    u.uFogNear = shared.uFogNear;
    u.uFogFar = shared.uFogFar;
    u.uFogMix = shared.uFogMix;
    u.uOutline = thin ? shared.uOutlineThin : shared.uOutline;
  };
  outlineTintMaterial = outlineMaterial.clone();
  rePoint(outlineTintMaterial, false);
  outlineTintMaterial.transparent = true;
  if (outlineThinMaterial) {
    outlineTintThinMaterial = outlineThinMaterial.clone();
    rePoint(outlineTintThinMaterial, true);
    outlineTintThinMaterial.transparent = true;
  }
}

// Tint `root`'s outline. `color` is an [r, g, b] triple 0..1 and `opacity` the ink's own alpha.
// Idempotent — call it every frame the cue is live and it costs two uniform writes and a length
// check — so a caller can drive it straight off its own timer without any change bookkeeping.
export function setOutlineTint(root, color, opacity) {
  if (!root || !outlineMaterial) return;
  if (!outlineTintMaterial) buildOutlineTint();
  outlineTintMaterial.uniforms.uColor.value.setRGB(color[0], color[1], color[2]);
  outlineTintMaterial.uniforms.uOpacity.value = opacity;
  if (outlineTintThinMaterial) {
    outlineTintThinMaterial.uniforms.uColor.value.setRGB(color[0], color[1], color[2]);
    outlineTintThinMaterial.uniforms.uOpacity.value = opacity;
  }
  let list = root.userData.outlineTintShells;
  if (!list) {
    list = [];
    root.traverse((o) => {
      if (o.userData.isOutline) list.push(o);
    });
    root.userData.outlineTintShells = list;
  }
  // The digits keep their own (thinner) ink: a tinted finger drawn with the body's line is a line
  // with a finger hidden inside it, which is exactly what `widthScale` exists to avoid.
  const thin = outlineTintThinMaterial || outlineTintMaterial;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    s.material = s.userData.baseMaterial === outlineThinMaterial ? thin : outlineTintMaterial;
    // Flagged so the ink TOGGLE does not switch the cue off with the cosmetic setting (see
    // `setOutlineEnabled`): the cue is information and the setting is decoration.
    s.userData.tinted = true;
    s.visible = true;
  }
}

// ...and the way back: the shell's own material, and its visibility back on the cosmetic setting.
export function clearOutlineTint(root) {
  const list = root && root.userData && root.userData.outlineTintShells;
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    s.material = s.userData.baseMaterial;
    s.userData.tinted = false;
    s.visible = settings.outline > 0;
  }
}

export function setOutlineEnabled(on) {
  settings.outline = on ? 1 : 0;
  // Compact while we're here: swapping the character look rebuilds its meshes, and the
  // shells that went with the old ones are already detached. Dropping them keeps this list
  // proportional to what is actually on screen.
  let n = 0;
  for (const m of outlineMeshes) {
    if (!m.parent) continue;
    outlineMeshes[n++] = m;
    // ...and a shell that is wearing a TINT stays on whatever the setting says: the cue is
    // information about the fight, not part of the look (see `setOutlineTint`).
    m.visible = settings.outline > 0 || !!m.userData.tinted;
  }
  outlineMeshes.length = n;
}

export function syncMaterialSettings() {
  shared.uSnap.value = settings.wobble > 0 ? 1.0 : 0.0;
  shared.uFogMix.value = settings.fog > 0 ? 1.0 : 0.0;
  shared.uAffine.value = settings.affine > 0 ? 1.0 : 0.0;
  // The ink width is authored against the baseline 224-line buffer — 1.1px there is a line
  // you can see at a glance. Keep that same share of the screen when the buffer gets taller
  // (QUALITY 1/2/3, or LOW-RES RENDER switched off), where the same 1.4px would thin away to
  // a hair. `Presentation.resize` calls this again whenever the buffer changes size.
  const scale = shared.uResolution.value.y / 224;
  shared.uOutline.value = Math.max(1.2, Math.min(6, settings.outlinePx * scale));
  shared.uOutlineThin.value = Math.max(0.7, Math.min(6, settings.outlinePx * settings.outlineDigitScale * scale));
}

export function createGroundTexture() {
  const S = 64;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#f2f2f0";
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const x = (Math.random() * S) | 0;
    const y = (Math.random() * S) | 0;
    const v = 216 + ((Math.random() * 34) | 0);
    ctx.fillStyle = "rgb(" + v + "," + v + "," + v + ")";
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = "rgba(120,124,118,0.9)";
  ctx.fillRect(0, 0, S, 2);
  ctx.fillRect(0, 0, 2, S);
  ctx.fillStyle = "rgba(150,154,148,0.55)";
  ctx.fillRect(0, 0, S, 1);
  ctx.fillRect(0, 0, 1, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 1;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// THE HILLS' OWN GROUND TEXTURE (see "THE HILLS" and "THE LAWN" in world.js). The world's ground
// texture is a paving slab — a light tile with a hard rule along two of its edges — which is exactly
// right under a field of concrete blocks and reads as a wireframe drawn on a lawn when it is
// stretched over a green hill. So the hills get their own map, and it is a LAWN: the ground's own
// COLOUR comes from the vertex colours (this only multiplies them), but every bit of the grass's
// character is here, because a vertex is 1-2 units apart and a blade is a hundredth of that.
//
// It is built at FOUR SCALES on purpose, and the reason is the two-sample read in the lawn shader
// (see `createMaterial`'s LAWN branch). The same map is sampled twice: once at the DETAIL tile (a
// couple of world units, where the blades are) and once at the MACRO tile (~14 units, where the
// clumps are), so the content has to carry structure that survives being read at both:
//
//   - broad mown patches, ~10-20 cm of shade either way across a third of a tile — what a field
//     this size has where the grass stands a little taller or the sun crosses a fold;
//   - clumps, a few centimetres across, in and out of the light;
//   - individual blades: a dark root pixel with a lit tip above it, 2-5 texels tall;
//   - a fine grain under all of it, so nothing is ever one flat value.
//
// `wrapDraw` is what keeps it TILEABLE: a blob near an edge is drawn nine times, once per wrap
// position, so the mottle runs across the seam instead of being cut off by it. A tile that shows a
// seam every couple of metres would be far worse than a flat one. The recipe is otherwise the
// original `CanvasTexture` one (nearest MAG, mipmapped min, repeat, no colour space) so it filters
// and repeats exactly the way the paving slab does — plus ANISOTROPY, which the paving slab never
// needed because it is only ever seen from above, and which a lawn seen down a 60-metre slope at a
// grazing angle cannot live without: without it the whole middle distance smears into one colour.
export function createGrassTexture() {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "rgb(243,246,239)";
  ctx.fillRect(0, 0, S, S);

  // ...the wrapped soft blob: a radial wash of `dv` (in 8-bit levels, + or -) about (x, y).
  const wrapDraw = (x, y, r, dv, alpha, fn) => {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        fn(x + ox * S, y + oy * S, r, dv, alpha);
      }
    }
  };
  const blob = (x, y, r, dv, alpha) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = Math.max(0, Math.min(255, 246 + dv)) | 0;
    const b = Math.max(0, Math.min(255, 238 + dv)) | 0;
    const c0 = Math.max(0, Math.min(255, 243 + dv)) | 0;
    g.addColorStop(0, "rgba(" + c0 + "," + a + "," + b + "," + alpha + ")");
    g.addColorStop(1, "rgba(" + c0 + "," + a + "," + b + ",0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // (1) the broad mown patches
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 44 + Math.random() * 46;
    wrapDraw(x, y, r, Math.random() < 0.5 ? -16 : 14, 0.72, blob);
  }
  // (2) the clumps
  for (let i = 0; i < 54; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 9 + Math.random() * 17;
    wrapDraw(x, y, r, Math.random() < 0.5 ? -13 : 11, 0.85, blob);
  }
  // (3) the fine grain
  for (let i = 0; i < 9000; i++) {
    const x = (Math.random() * S) | 0;
    const y = (Math.random() * S) | 0;
    const v = 232 + ((Math.random() * 22) | 0);
    ctx.fillStyle = "rgb(" + (v - 3) + "," + (v + 3) + "," + (v - 7) + ")";
    ctx.fillRect(x, y, 1, 1);
  }
  // (4) the blades: a dark root with a lit tip, gathered into clumps, the way a mown lawn's own
  // strokes gather rather than standing on a grid.
  for (let c = 0; c < 190; c++) {
    const cx = Math.random() * S, cy = Math.random() * S;
    const spread = 5 + Math.random() * 13;
    const n = 6 + ((Math.random() * 12) | 0);
    for (let i = 0; i < n; i++) {
      const x = (((cx + (Math.random() - 0.5) * spread) | 0) + S) % S;
      const y = (((cy + (Math.random() - 0.5) * spread) | 0) + S) % S;
      const h = 2 + ((Math.random() * 4) | 0);
      const root = 216 + ((Math.random() * 14) | 0);
      ctx.fillStyle = "rgb(" + (root - 4) + "," + (root + 2) + "," + (root - 8) + ")";
      ctx.fillRect(x, y, 1, 2);
      const tip = 240 + ((Math.random() * 15) | 0);
      ctx.fillStyle = "rgb(" + (tip - 3) + "," + (tip + 5) + "," + (tip - 9) + ")";
      ctx.fillRect(x, (y - h + S) % S, 1, h);
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function createSky() {
  const radius = 300;
  const geo = new THREE.SphereGeometry(radius, 32, 20);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(0.42, 0.6, 0.85) },
      uHorizon: { value: new THREE.Color(0.8, 0.83, 0.72) },
      uGround: { value: new THREE.Color(0.3, 0.3, 0.32) },
      uFog: shared.uFogColor,
      uSunDir: { value: new THREE.Vector3(0.45, 0.82, 0.35).normalize() },
      uMoonDir: { value: new THREE.Vector3(-0.45, -0.82, -0.35).normalize() },
      uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
      uMoonColor: { value: new THREE.Color(0.7, 0.76, 0.95) },
      uSkyGlowColor: { value: new THREE.Color(1, 0.8, 0.6) },
      uCloudLight: { value: new THREE.Color(1, 1, 1) },
      uCloudShadow: { value: new THREE.Color(0.3, 0.32, 0.38) },
      uAuroraA: { value: new THREE.Color(0.26, 1.0, 0.52) },
      uAuroraB: { value: new THREE.Color(0.24, 0.78, 0.96) },
      uAuroraC: { value: new THREE.Color(0.72, 0.36, 0.98) },
      uSunSize: { value: 0.032 },
      uSunDisc: { value: 1 },
      uSunGlow: { value: 0.4 },
      uGlare: { value: 0 },
      uShafts: { value: 0 },
      uSkyGlow: { value: 0.4 },
      uMoonSize: { value: 0.03 },
      uMoonDisc: { value: 0 },
      uMoonGlow: { value: 0 },
      uStars: { value: 0 },
      uMilky: { value: 0 },
      uAurora: { value: 0 },
      uCloud: { value: 0.4 },
      uCloudCover: { value: 0.6 },
      uCloudContrast: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform vec3 uSunDir;
      uniform vec3 uMoonDir;
      uniform vec3 uSunColor;
      uniform vec3 uMoonColor;
      uniform vec3 uSkyGlowColor;
      uniform vec3 uCloudLight;
      uniform vec3 uCloudShadow;
      uniform vec3 uAuroraA;
      uniform vec3 uAuroraB;
      uniform vec3 uAuroraC;
      uniform float uSunSize;
      uniform float uSunDisc;
      uniform float uSunGlow;
      uniform float uGlare;
      uniform float uShafts;
      uniform float uSkyGlow;
      uniform float uMoonSize;
      uniform float uMoonDisc;
      uniform float uMoonGlow;
      uniform float uStars;
      uniform float uMilky;
      uniform float uAurora;
      uniform float uCloud;
      uniform float uCloudCover;
      uniform float uCloudContrast;
      uniform float uTime;
      varying vec3 vDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float hash31(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      float fbm3(vec2 p) {
        float s = 0.5 * vnoise(p);
        p = p * 2.03 + 13.7;
        s += 0.25 * vnoise(p);
        p = p * 2.07 + 7.3;
        s += 0.125 * vnoise(p);
        return s;
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float up = clamp(h, 0.0, 1.0);
        vec3 base = mix(uHorizon, uTop, pow(up, 0.45));
        float down = clamp(-h, 0.0, 1.0);
        base = mix(base, uGround, smoothstep(0.0, 0.45, down));

        if (uMilky > 0.002) {
          vec3 bn = normalize(vec3(0.42, 0.6, -0.68));
          float bd = dot(d, bn);
          float band = exp(-bd * bd * 15.0);
          float grain = fbm3(d.xz * 4.0 + d.y * 2.0) * 1.5 - 0.35;
          base += vec3(0.42, 0.46, 0.72) * band * max(0.0, grain) * uMilky;
        }

        if (uStars > 0.002) {
          vec3 p = d * 48.0;
          vec3 id = floor(p);
          vec3 f = fract(p) - 0.5;
          float r = hash31(id);
          if (r > 0.922) {
            vec3 off = vec3(hash31(id + 1.7), hash31(id + 5.1), hash31(id + 9.3)) - 0.5;
            float dd = length(f - off * 0.74);
            float mag = (r - 0.922) / 0.078;
            float star = smoothstep(0.34, 0.22, dd) * (0.35 + mag * 1.25);
            float tw = 0.72 + 0.28 * sin(uTime * 2.3 + r * 71.0);
            vec3 sc = mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.9, 0.74), hash31(id + 3.3));
            base += sc * star * tw * uStars * smoothstep(-0.02, 0.2, h);
          }
        }

        float sunAng = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
        float sunHalo = exp(-sunAng * 16.0);
        float sunWide = exp(-sunAng * 3.4);
        float horizonBand = 1.0 - smoothstep(0.0, 0.52, abs(h));
        base += uSunColor * (sunHalo * 1.05 + sunWide * 0.20) * uSunGlow;
        base += uSkyGlowColor * horizonBand * exp(-sunAng * 1.6) * uSkyGlow;
        if (uGlare > 0.002) {
          base += mix(uSunColor, vec3(1.0), 0.45) * exp(-sunAng * 1.6) * uGlare;
        }
        if (uShafts > 0.002) {
          float sh = 0.5 + 0.5 * sin(d.z * 26.0 + d.x * 14.0 + uTime * 0.14 + sin(d.x * 5.0 + uTime * 0.05) * 1.7);
          base += uSunColor * sunWide * sh * uShafts;
        }
        float sunBody = (1.0 - smoothstep(uSunSize * 0.86, uSunSize, sunAng)) * uSunDisc;
        base = mix(base, uSunColor * 2.2 + vec3(0.45), sunBody);

        float moonAng = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
        base += uMoonColor * (exp(-moonAng * 12.0) * 0.85 * uMoonDisc + exp(-moonAng * 3.2) * 0.22 * uMoonGlow);
        float moonBody = (1.0 - smoothstep(uMoonSize * 0.9, uMoonSize, moonAng)) * uMoonDisc;
        base = mix(base, uMoonColor * 1.5 + vec3(0.25), moonBody);

        if (uCloud > 0.002 && h > 0.06) {
          // THE CLOUD UV HAS TO BE REGULAR AT THE ZENITH. d.xz shrinks to nothing straight up, and
          // the obvious rescue — normalising it so the cover keeps some detail overhead, which is
          // what this used to do (hd = d.xz / length(d.xz), blended in above h 0.6) — is an
          // AZIMUTHAL map: it names a point by the ANGLE around the pole, and that angle turns at
          // 1/sin(polar) per radian of view. Straight up that is unbounded, so consecutive pixels
          // sample unrelated noise and the cover tears into the radial fan the user photographed
          // (see the session-92 note in SPEC.md). The cure is to project through the NADIR instead:
          // d.xz / (1 + d.y) is the stereographic map from the bottom of the sky, which is smooth
          // and conformal over the WHOLE upper hemisphere (the one point it blows up at, h = -1,
          // is under the ground and never drawn) and still spreads 8 units of noise over the cap,
          // so the cover overhead keeps its detail. The h * 1.8 slide stays: it is a rigid offset
          // of the whole sheet, not a function of the azimuth, so it costs no regularity.
          vec2 cuv = d.xz * (8.0 / (1.0 + h)) + vec2(0.0, h * 1.8);
          cuv += vec2(23.7 + uTime * 0.02, 9.4 + uTime * 0.008);
          float n1 = fbm3(cuv) * 1.18;
          float cover = smoothstep(uCloudCover, uCloudCover + 0.24, n1);
          if (cover > 0.004) {
            vec2 sdir = normalize(uSunDir.xz + vec2(0.0001, 0.0001));
            float n2 = fbm3(cuv + sdir * 0.18);
            float n3 = fbm3(cuv - sdir * 0.18);
            float dev = (n1 - (uCloudCover + 0.13)) * 1.25 + (n2 - n3) * 1.6;
            float shade = clamp(0.45 + dev * uCloudContrast, 0.0, 1.0);
            float fade = smoothstep(0.06, 0.20, h);
            vec3 cc = mix(uCloudShadow, uCloudLight, shade);
            base = mix(base, cc, clamp(cover * uCloud * fade, 0.0, 1.0));
          }
        }

        if (uAurora > 0.002) {
          // Same regularity rule as the cover above, and the same 1/sin(polar) tear if it is
          // broken: the curtains are drawn off the direction AROUND the pole, so they may not name
          // that pole. d.xz / (1 + h) is the same azimuth as the old d.xz / length(d.xz) to within
          // 10% anywhere the curtain is actually drawn (the sheet has fallen to a tenth of its value
          // by h = 0.75), but it stays finite and smooth straight up instead of spinning.
          vec2 hd = d.xz / (1.0 + h);
          float w1 = fbm3(hd * 3.4 + vec2(uTime * 0.04, 0.0));
          float w2 = fbm3(hd * 7.5 + vec2(w1 * 1.8, uTime * 0.06));
          float curtain = smoothstep(0.52, 0.74, w1 * 1.7);
          curtain *= 0.20 + 0.80 * smoothstep(0.35, 0.80, w2);
          float rays = fbm3(hd * 33.0 + vec2(w2 * 3.0, h * 0.35 - uTime * 0.32));
          rays = pow(clamp(rays * 2.1, 0.0, 1.0), 1.4);
          float baseH = 0.03 + 0.22 * w1;
          float above = max(0.0, h - baseH);
          float sheet = exp(-above * 3.0) * smoothstep(0.0, 0.04, above);
          float a = min(1.0, curtain * (0.30 + 0.80 * rays) * sheet * uAurora * 1.9);
          if (a > 0.003) {
            vec3 ac = mix(uAuroraA, uAuroraB, clamp(rays * 0.7, 0.0, 1.0));
            ac = mix(ac, uAuroraC, clamp((w2 - 0.5) * 2.6, 0.0, 1.0));
            base += ac * a;
          }
          float haze = smoothstep(0.02, 0.14, h) * (1.0 - smoothstep(0.14, 0.30, h));
          base += uAuroraA * haze * uAurora * 0.035 * (0.35 + 0.65 * fbm3(hd * 3.4 + vec2(uTime * 0.05)));
        }

        base += (hash21(gl_FragCoord.xy * 1.37 + 0.5) - 0.5) * 0.038;
        gl_FragColor = vec4(base, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  mesh.name = "sky";
  return mesh;
}

export function createBlobShadow() {
  const geo = new THREE.CircleGeometry(0.5, 10);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0.45 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = 1.0 - clamp(length(p), 0.0, 1.0);
        float a = smoothstep(0.0, 0.55, d) * uOpacity;
        if (a < 0.02) discard;
        gl_FragColor = vec4(0.05, 0.06, 0.06, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

export function createPostPass() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    tDiffuse: { value: null },
    uResolution: shared.uResolution,
    uLevels: { value: settings.colorLevels },
    uDither: { value: settings.dither },
    // THE SCREEN FLASH (see `flash` below). A whole-frame wash of colour, laid over the finished
    // picture AFTER the quantise/dither so the flash itself stays smooth — it is the one thing on
    // screen that is meant to read as a light source rather than as an object, and banding it into
    // the palette would turn a struck frame into a striped one.
    uFlash: { value: 0 },
    uFlashTint: { value: new THREE.Color(1, 1, 1) },
    // THE IMPACT'S SHOCKWAVE (see `shock` below and the fragment): where on the screen the blow
    // landed, how hard, and how far the ring has travelled, 0..1.
    uShock: { value: 0 },
    uShockAt: { value: new THREE.Vector2(0.5, 0.5) },
    uShockT: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 uResolution;
      uniform float uLevels;
      uniform float uDither;
      uniform float uFlash;
      uniform vec3 uFlashTint;
      uniform float uShock;
      uniform vec2 uShockAt;
      uniform float uShockT;
      varying vec2 vUv;
      float bayer2(vec2 a) {
        a = floor(a);
        return fract(a.x * 0.5 + a.y * a.y * 0.75);
      }
      float bayer4(vec2 p) {
        vec2 p1 = mod(p, 2.0);
        vec2 p2 = floor(mod(p, 4.0) * 0.5);
        return bayer2(p2) + 0.25 * bayer2(p1);
      }
      void main() {
        vec2 uv = vUv;
        // THE IMPACT'S SHOCKWAVE (see the pass's own shock). A blow that is big enough to be felt
        // through the camera throws a ring of displaced air OUT through the finished picture, from
        // wherever on the screen it landed — the picture is pushed along the ring's own radius and
        // torn a hair apart (red one way, blue the other) exactly where the ring is, and both fade
        // to nothing as it reaches the edge of the frame. It is sampled BEFORE the quantise, because
        // it is a distortion of the picture rather than a colour laid over it: a warp applied after
        // the palette would band the very thing it is meant to smear. The three taps only happen
        // while a shock is live, so the steady-state cost of the pass is one texture read.
        float shockBand = 0.0;
        vec2 shockDir = vec2(0.0);
        if (uShock > 0.001) {
          float ar = uResolution.x / max(1.0, uResolution.y);
          vec2 dd = (uv - uShockAt) * vec2(ar, 1.0);
          float r = length(dd);
          shockDir = r > 1e-4 ? dd / r : vec2(0.0);
          shockDir.x /= ar;
          // The ring LEAVES the contact point (it starts at a radius, not at zero, so the point the
          // blow landed on is not itself dragged — the eye is looking right at it) and accelerates
          // out of frame; uShockT is the effect's own clock, 0..1. It WIDENS as it goes, which is
          // the same air spread over a longer circumference — that is what keeps a shockwave
          // reading as a wave and not as a hoop, and what stops the early frames from being one
          // blob of displacement over the middle of the picture.
          float ring = 0.16 + uShockT * uShockT * 0.35 + uShockT * 1.05;
          shockBand = exp(-pow((r - ring) / (0.09 + uShockT * 0.20), 2.0));
          shockBand *= 1.0 - smoothstep(0.78, 1.45, r);
          uv -= shockDir * shockBand * uShock * 0.072;
        }
        vec3 c;
        if (shockBand > 0.001) {
          // ...and a hair of chromatic split, hottest ON the ring: the picture is pulled apart along
          // the shock the way a cheap lens splits under a hard knock — a couple of pixels, and only
          // for the fraction of a second the ring is crossing.
          float sp = shockBand * uShock * 0.0022;
          c = vec3(
            texture2D(tDiffuse, uv - shockDir * sp).r,
            texture2D(tDiffuse, uv).g,
            texture2D(tDiffuse, uv + shockDir * sp).b
          );
        } else {
          c = texture2D(tDiffuse, uv).rgb;
        }
        float dth = bayer4(gl_FragCoord.xy);
        vec3 q = floor(c * uLevels + dth) / uLevels;
        c = mix(c, q, uDither);
        // The flash is heaviest in the middle of the frame and falls off toward the corners, so it
        // reads as a blow landing in front of the camera rather than as the monitor being turned up.
        vec2 fc = uv * 2.0 - 1.0;
        float falloff = 1.0 - 0.55 * smoothstep(0.2, 1.25, length(fc));
        c += uFlashTint * uFlash * falloff;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  scene.add(quad);
  let flashAmt = 0;
  let flashDecay = 3.2;
  let shockAmt = 0;
  let shockT = 1;
  const SHOCK_T = 0.30;
  return {
    scene,
    camera,
    uniforms,
    // The impact's own light on the LENS. `amount` is 0..1-ish and it STACKS (a finisher landing a
    // frame after a jab gets both), so `flash` is a `max`-free add clamped by the cap below: two
    // blows arriving together should read as brighter than one, not as the same white. `decay` is
    // how fast it falls off per second — a jab wants a blink and a finisher wants a wash.
    flash(amount, tint, decay) {
      flashAmt = Math.min(0.85, flashAmt + Math.max(0, amount || 0));
      if (tint) uniforms.uFlashTint.value.setRGB(tint[0], tint[1], tint[2]);
      if (decay) flashDecay = decay;
      uniforms.uFlash.value = flashAmt;
      return this;
    },
    // ...and THE SHOCKWAVE the blow throws through the PICTURE (see the fragment). `u`/`v` is where
    // it landed, in screen UV — so a hit at the edge of the frame throws its ring across the middle
    // of the screen rather than at the centre of it, which is what keeps the effect about the FIGHT
    // rather than about the camera. `amount` takes the MAX rather than summing: two blows a frame
    // apart are two rings and the second one restarts the clock from its own contact, so stacking
    // them would leave a permanent bend on screen (measured: three chained M1s inside a fifth of a
    // second held `uShock` at 1 for the whole chain at a 1 s clock). `amount` is the caller's own
    // 0..1 power, already gated below a third (see `screenShock` in main.js).
    shock(u, v, amount) {
      const a = Math.max(0, Math.min(1, amount || 0));
      if (a <= 0) return this;
      shockAmt = Math.max(shockAmt, a);
      shockT = 0;
      uniforms.uShockAt.value.set(u, v);
      uniforms.uShock.value = shockAmt;
      uniforms.uShockT.value = shockT;
      return this;
    },
    update(dt) {
      // The shock first: it ages on its own clock and simply ends (nothing to return, and it has to
      // run even when no flash is live — the early-out below is the flash's).
      if (shockAmt > 0) {
        shockT = Math.min(1, shockT + dt / SHOCK_T);
        if (shockT >= 1) shockAmt = 0;
        uniforms.uShockT.value = shockT;
        uniforms.uShock.value = shockAmt;
      }
      if (flashAmt <= 0) return;
      flashAmt = Math.max(0, flashAmt - dt * flashDecay);
      uniforms.uFlash.value = flashAmt;
    },
    clearFlash() {
      flashAmt = 0;
      uniforms.uFlash.value = 0;
      shockAmt = 0;
      shockT = 1;
      uniforms.uShock.value = 0;
      uniforms.uShockT.value = 1;
    },
    render(renderer, texture) {
      uniforms.tDiffuse.value = texture;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
  };
}

export function createPS1Renderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  renderer.autoClear = true;
  return renderer;
}

export class Presentation {
  constructor(renderer) {
    this.renderer = renderer;
    this.width = 320;
    this.height = 224;
    this.rt = new THREE.WebGLRenderTarget(320, 224, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      type: THREE.UnsignedByteType,
    });
    this.rt.texture.colorSpace = THREE.NoColorSpace;
  }

  resize() {
    const dw = Math.max(1, window.innerWidth);
    const dh = Math.max(1, window.innerHeight);
    let iw;
    let ih;
    const scale = Math.min(1, MAX_INTERNAL_WIDTH / dw, MAX_INTERNAL_HEIGHT / dh);
    if (settings.lowRes) {
      ih = settings.internalHeight;
      iw = Math.round(ih * (dw / dh));
      if (iw > settings.maxInternalWidth) {
        iw = settings.maxInternalWidth;
        ih = Math.round(iw * (dh / dw));
      }
    } else {
      iw = Math.max(1, Math.round(dw * scale));
      ih = Math.max(1, Math.round(dh * scale));
    }
    this.width = iw;
    this.height = ih;
    this.renderer.setSize(iw, ih, false);
    this.rt.setSize(iw, ih);
    shared.uResolution.value.set(iw, ih);
    syncMaterialSettings();
    return { width: iw, height: ih, displayWidth: dw, displayHeight: dh };
  }

  render(scene, camera, post) {
    this.renderer.setRenderTarget(this.rt);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    post.render(this.renderer, this.rt.texture);
  }
}
