import * as THREE from "./three.js";

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uKind;
uniform float uRing;
uniform float uThick;
uniform float uT;
varying vec2 vUv;
void main() {
  float a;
  if (uKind < 0.5) {
    // RING: an expanding hoop seen from above, with a faint wash inside it. The wash is what makes
    // a shock read as a DISC of displaced air rather than as a drawn circle — the hoop is the edge
    // of the disturbance, and the disturbance is the thing the eye is being told about.
    float d = length(vUv * 2.0 - 1.0);
    float hoop = 1.0 - smoothstep(uThick * 0.45, uThick, abs(d - uRing));
    float wash = (1.0 - smoothstep(uRing * 0.55, uRing * 1.02, d)) * 0.065;
    a = hoop + wash;
    a *= 1.0 - smoothstep(0.82, 1.0, d);
  } else if (uKind < 1.5) {
    // PUFF: a soft blob on the ground plane.
    float d = length(vUv * 2.0 - 1.0);
    a = 1.0 - smoothstep(0.15, 1.0, d);
  } else if (uKind < 2.5) {
    // COLUMN: a vertical wall of dust.
    a = (1.0 - vUv.y * 0.92) * (0.68 + 0.32 * sin(vUv.x * 3.14159265));
  } else if (uKind < 4.5) {
    // STREAK (3) and GLINT (4): bright at the root (vUv.y = 0, the point it was spawned at) and
    // dying along its own length, so it reads as a line drawn through the air rather than a bar.
    float f = 1.0 - vUv.y;
    a = f * f;
  } else if (uKind > 8.5) {
    // GLOW (9): a soft round billboard in ADDITIVE — the bloom under a flash, and the general
    // "this point is a light source" primitive. No flat top and no rim: a hard edge on a glow reads
    // as a disc of coloured glass, which is exactly what a flash must not look like. The falloff is
    // a plain power curve all the way to zero at the rim, because the pool discards below a small
    // alpha and a gaussian would still be just-above that threshold in a ring (a visible circle).
    vec2 p = vUv * 2.0 - 1.0;
    float d = clamp(length(p), 0.0, 1.0);
    a = pow(1.0 - d, 2.6) * 1.45 + (1.0 - smoothstep(0.0, 0.24, d)) * 0.5;
  } else if (uKind > 7.5) {
    // SPARK (8): a chip of something hot thrown off a contact. Brightest at the LEADING TIP
    // (vUv.y = 1, the far end from where it was born) and drawing a tail back down its own length,
    // with the width tapering to nothing at the back. Additive, so a handful of them over a dark
    // body is a shower of points rather than a set of drawn lines.
    float y = vUv.y;
    float head = smoothstep(0.30, 0.99, y);
    float tail = (1.0 - y) * (1.0 - y) * 0.30;
    a = head * 1.35 + tail;
  } else if (uKind > 6.5) {
    // FLARE (7): the impact's own flash — a hot core that the strike is born from, inside an
    // eight-point star (long spikes on the card's own axes, short ones on the diagonals), drawn
    // ADDITIVE and very short. It is a BILLBOARD, so the star's points always cross the screen's
    // own axes rather than lying in some world plane, and uT (the slot's own progress, 0..1)
    // makes the spikes SLASH outward and then pull in — a flash that only fades reads as a light
    // coming on, where one that also extends reads as a strike.
    vec2 p = vUv * 2.0 - 1.0;
    float d = length(p);
    float grow = smoothstep(0.0, 0.34, uT);
    float hold = 1.0 - smoothstep(0.34, 1.0, uT);
    // The core: tiny, and gone by a third of the way through — the white frame where the fist was.
    float core = 1.0 - smoothstep(0.0, 0.30, d);
    core = core * core * (1.6 * (1.0 - smoothstep(0.30, 0.95, uT)));
    // The spikes: a narrow ridge along an axis, cut off at its own length. rp is the pair of
    // diagonals, so sp is the 8-point star and the diagonal four are half as long and half as hot.
    float spX = exp(-abs(p.x) * 26.0) * (1.0 - smoothstep(0.0, 0.62 + 0.4 * grow, d));
    float spY = exp(-abs(p.y) * 26.0) * (1.0 - smoothstep(0.0, 0.62 + 0.4 * grow, d));
    vec2 rp = vec2(p.x + p.y, p.x - p.y) * 0.7071;
    float dX = exp(-abs(rp.x) * 30.0) * (1.0 - smoothstep(0.0, 0.34 + 0.24 * grow, d));
    float dY = exp(-abs(rp.y) * 30.0) * (1.0 - smoothstep(0.0, 0.34 + 0.24 * grow, d));
    float spikes = (spX + spY) * 0.95 + (dX + dY) * 0.42;
    a = core + spikes * hold * (0.35 + 0.85 * grow);
  } else if (uKind > 5.5) {
    // SHEET (6): a card of air the body is about to fly through (the wind meshes, see
    // diveWake). Soft on all four edges — a rectangle would read as a sprite standing in the
    // sky — with two faint lengthwise strands so it has a SHAPE rather than being a smudge.
    float across = 1.0 - smoothstep(0.30, 1.0, abs(vUv.x * 2.0 - 1.0));
    float along = 1.0 - smoothstep(0.10, 0.92, abs(vUv.y * 2.0 - 1.0));
    float strand = 0.72 + 0.28 * sin(vUv.x * 12.5664);
    a = across * along * strand;
  } else {
    // SPRITE (5): a camera-facing blob — the only kind that reads as smoke from any angle,
    // which is why the slide's cloud and the dive's condensation are made of these.
    //
    // The profile is a FLAT-TOPPED disc with a soft rim, not a gaussian. That was the whole
    // difference between a puff of dust and a light source: a smooth falloff from the centre
    // reads as a glow no matter what colour it is (measured against the slide's plume, which
    // came back from review as "a self-illuminating aura"), where a shape with a body and an
    // edge reads as something with density.
    float d = length(vUv * 2.0 - 1.0);
    float b = 1.0 - smoothstep(0.35, 1.0, d);
    a = b * b;
  }
  a *= uOpacity;
  if (a < 0.012) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

// The live-effect pool is one mesh per slot, and only a live slot costs a draw call — so the
// ceiling is set by the busiest moment, not by the average one. The slide's grit and the
// dive's rakes are both CONTINUOUS emitters (dozens of slots a second, each living a fraction
// of a second), and they must never evict a landing's ring or a kick's dust, so the
// ceiling is generous.
// ...and the wind sheets are the newest tenant: a handful live at once (they last a fifth of a
// second and are rate-limited to one or two per 30-55 ms), which is what took the ceiling to 96.
// ...and it went up again with the STRIKE (session 82): an impact is a flash, a ring and a dozen
// sparks all at once, and a chain of four M1s inside a second lands four of those on top of the
// moves' own wakes. The ceiling is what protects the frame budget, so it is the one number that has
// to be generous rather than tight — an evicted landing ring is far more visible than 40 idle slots.
const MAX_POOL = 176;
const RING = 0;
const PUFF = 1;
const COLUMN = 2;
const STREAK = 3;
const GLINT = 4;
const SPRITE = 5;
const SHEET = 6;
const FLARE = 7;
// SPARK (8): the strike's own flying chip — a streak that is HOT AT ITS LEADING TIP and thins into a
// tail behind it, which is the one thing that separates a spark from a glint: a glint is a piece of
// light being dragged, and it is brightest where it was born (see GLINT's profile in FRAG), while a
// spark is a piece of matter being thrown and is brightest where it is GOING. The vault's hand-slap
// and the sweep use GLINT-shaped grit; every punch uses these.
const SPARK = 8;
// GLOW (9): a soft additive billboard — the bloom under a flash. Not a sprite: a SPRITE has a flat
// top and a hard rim on purpose (dust has a body and an edge, see the SPRITE note in FRAG), where a
// glow is all falloff with no edge at all, which is the only profile that reads as LIGHT rather
// than as a thing lit.
const GLOW = 9;
// The kinds drawn ADDITIVELY: a glint and a spark are both light, a sheet is air being split, and a
// flare and a glow are both flash — all of them have to be brighter than what is behind them rather
// than a pane of colour in front of it. Nothing in the pool DARKENS the world.
const ADDITIVE = (kind) => kind === GLINT || kind === SHEET || kind === FLARE || kind === SPARK || kind === GLOW;

const _fxUp = new THREE.Vector3(0, 1, 0);
const _fxDir = new THREE.Vector3();
// Scratch for THE STRIKE (see `impact`): the normalised strike line, a unit axis square to it, and
// the working direction a spark is thrown along.
const _impN = new THREE.Vector3();
const _impT = new THREE.Vector3();
const _impD = new THREE.Vector3();
// ...and the third axis of the same little frame, which is what the impact's RAYS are thrown around
// (see `impact`): `_impT` and `_impR` span the plane square to the strike, so an angle in that plane
// is a direction the shock is free to travel in.
const _impR = new THREE.Vector3();
// ...and THE CLASH's own little frame (see `clashMeet` / `clashPress` / `clashGrind`): the line the
// two bodies met on (`_clN`), the horizontal unit square to it (`_clP`, the plane the sparks are
// thrown out in), and the two working directions a throw reuses (`_clA`/`_clB`/`_clE`).
const _clN = new THREE.Vector3();
const _clP = new THREE.Vector3();
const _clA = new THREE.Vector3();
const _clB = new THREE.Vector3();
const _clE = new THREE.Vector3();
// ...and the deck effects' own scratch — `slamCrater`, `scuff`, `landDust`, `liftOff` and `wallGrit`
// all throw their lumps and grit on a RANDOM bearing rather than down a strike line, so they need
// one unit direction to aim with and nothing else.
const _fxA = new THREE.Vector3();
// Scratch basis for the dive: the flight direction and two axes square to it, which is how a
// rake is placed somewhere around the body rather than always on the same shoulder.
const _dv1 = new THREE.Vector3();
const _dv2 = new THREE.Vector3();
const _dv3 = new THREE.Vector3();
// Scratch for the WIND SHEETS: a card laid across the body's own path and turned square to the
// camera, so a chase camera never catches one edge-on and loses it.
const _wsP = new THREE.Vector3();
const _wsO = new THREE.Vector3();
const _wsU = new THREE.Vector3();
const _wsV = new THREE.Vector3();
const _wsF = new THREE.Vector3();
const _wsM = new THREE.Matrix4();
// The dive's wind is a cool near-white; the slide's is whatever the biome's dust is (the caller
// passes it), so a slide in the ash reads grey and one on the sand reads warm.
const DIVE_WIND = [0.90, 0.94, 1.0];
// The slide's three deck contacts, in the body's own (forward, right) frame with the deck at
// the body's base — MEASURED off the posed mesh (the lowest vertices of the lead foot, the
// trailing knee and the planted palm; see the slide note in src/README.md for the sweep that
// authored the pose). `n` is how many pieces of grit that contact throws per tick and `w` how
// heavy they are: the lead foot is skimming and tears up the most, the knee is grinding, and
// the planted palm is a spark source rather than a gravel one (`n` 0).
//
// (f 0.80, r 0.60) — lead foot. (f -0.19, r -0.23) — knee. (f -0.05, r -0.52) — palm.
const SLIDE_CONTACTS = [
  { f: 0.80, r: 0.60, n: 2, w: 1.0 },
  { f: -0.19, r: -0.23, n: 1, w: 0.7 },
  { f: -0.05, r: -0.52, n: 0, w: 0.5 },
];

function makeMaterial(additive) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(1, 1, 1) },
      uOpacity: { value: 0 },
      uKind: { value: 0 },
      uRing: { value: 0 },
      uThick: { value: 0.5 },
      // The slot's own progress, 0..1, for the shaders whose PROFILE is animated rather than just
      // faded (the flare's star extends and retracts — see FRAG).
      uT: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function discGeometry(kind) {
  let geo;
  if (kind === COLUMN) {
    geo = new THREE.CylinderGeometry(1, 1.18, 1, 12, 1, true);
    geo.translate(0, 0.5, 0);
  } else if (kind === STREAK || kind === GLINT || kind === SPARK) {
    // Unit radius at the root, tapering to a quarter of it at the tip, and open-ended (the
    // taper hides the missing caps). Translated so the ROOT is at the mesh's origin: the
    // streak is then thrown from the point it was spawned at and scaled along its own +Y,
    // which is the axis `_spawn` aims at the direction.
    geo = new THREE.CylinderGeometry(0.25, 1, 1, 5, 1, true);
    geo.translate(0, 0.5, 0);
  } else if (kind === SPRITE || kind === FLARE || kind === GLOW) {
    geo = new THREE.PlaneGeometry(2, 2);
  } else if (kind === SHEET) {
    // A card in its own XY plane: +Y is the length (along the flow), +X the width across it, and
    // the normal is +Z — which is exactly the basis `_spawn` builds from the flow and the camera.
    geo = new THREE.PlaneGeometry(1, 1);
  } else {
    geo = new THREE.CircleGeometry(1, 18);
    geo.rotateX(-Math.PI / 2);
  }
  return geo;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.live = [];
    this.budget = 0;
    // Trails. Both are fed every frame while their move is live and age out on their own once
    // main.js stops feeding them (see `update`).
    this.diveRib = null;
    this.diveActive = false;
    this.diveT = 0;
    this.slideT = 0;
    // ...and THE SWING MESH: the strip the staff's own ends sweep while the form is swinging (see
    // `staffSwing`). Two ribbons — the TIP and the BUTT — because a two-metre stick sweeping an arc
    // does not sweep a line, it sweeps a BAND, and the band is the outer edge plus the inner one.
    this.poleRibT = null;
    this.poleRibB = null;
    this.poleGap = 0;
    this.poleActive = false;
    // The ground slam's own ember stream (see `slamWake`).
    this.slamT = 0;
    // ...and the whirl's own energy (see `whirlAura`).
    this.whirlT = 0;
    // ...and the heave's one-handed grip (see `heaveHold`): gold-white glints crawling off the
    // fist that is holding the sternum, gathering while the hold lasts.
    this.heaveT = 0;
    // ...and the ring of stars a DAZED body wears (see `dizzyStars`). Both the rate limit and the
    // RING's own angle, which is what makes the stars go round instead of just sitting there.
    this.dizzyT = 0;
    this.dizzySpin = 0;
    // ...and THE M1 CLASH's own grind clock (see `clashGrind`): the rate limit on the continuous
    // ember at the contact, plus a tick counter for the slower pressure ring, so the effect can be
    // fed every frame and tick on its own.
    this.clashT = 0;
    this.clashGrindN = 0;
    // The wind SHEETS' own rate limit (they are cards, not trail samples — see `diveWake`), and
    // the camera, which a sheet needs to turn itself square to (it arrives with `update`).
    this.sheetT = 0;
    this.camera = null;
    // Seconds since the move last fed its trail. A move that starts again after a gap gets a
    // NEW trail — otherwise the strip would be drawn straight across the gap, from wherever the
    // last slide ended to wherever this one begins.
    this.diveGap = 0;
    // The dive's PER-PART trails: one thin ribbon per tracked bone (see `diveWake`). Same gap
    // bookkeeping as the body strip, but an entry per part, plus the "was this part fed this
    // frame" flag the ribbon-ageing in `update` reads.
    this.diveParts = [];
    this.divePartGap = [];
    this.divePartFed = [];
    // THE STRIKE's own numbers (see `impact`): how many sparks the last impact threw, so the
    // impacts can be counted (and budgeted) rather than guessed at.
    this.strikes = 0;
    this.sparks = 0;
    // How many particles a burst is allowed to throw, as a share of its authored count. `main.js`
    // walks this down with the QUALITY setting (see `setQuality`): the FX are the first thing that
    // should get cheaper on a weak device, because a missing spark reads as a frame budget and a
    // missing crater reads as a bug.
    this.fxScale = 1;
  }

  _take(kind) {
    for (let i = 0; i < this.pool.length; i++) {
      const it = this.pool[i];
      if (it.kind === kind && !it.alive) return it;
    }
    if (this.pool.length >= MAX_POOL) {
      let oldest = null;
      for (let i = 0; i < this.pool.length; i++) {
        if (!oldest || this.pool[i].born < oldest.born) oldest = this.pool[i];
      }
      if (oldest) {
        this.pool.splice(this.pool.indexOf(oldest), 1);
        this.scene.remove(oldest.mesh);
        oldest.mesh.geometry.dispose();
        oldest.mat.dispose();
      }
    }
    // A wind sheet is ADDED for the same reason a glint is: a near-white card at a fifth of an
    // alpha reads as air over a dark deck, where the same card in normal blending reads as a pane
    // of glass standing in front of the body. Nothing in the pool DARKENS the world.
    const mat = makeMaterial(ADDITIVE(kind));
    const mesh = new THREE.Mesh(discGeometry(kind), mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    mesh.visible = false;
    this.scene.add(mesh);
    const it = {
      mesh,
      mat,
      kind,
      alive: false,
      born: 0,
      t: 0,
      dur: 0.5,
      x: 0,
      y: 0,
      z: 0,
      r0: 1,
      r1: 2,
      op: 0,
      ring0: 0,
      ring1: 1,
      thick: 1,
      spin: 0,
      rise: 0,
      fall: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      // The item's OWN position, integrated each frame (see `update`): a spark that drags and
      // falls cannot be drawn from `v * t`, and everything else has v = 0, so this is the same
      // number it always was.
      px: 0,
      py: 0,
      pz: 0,
      drag: 0,
      grav: 0,
      follow: false,
    };
    this.pool.push(it);
    return it;
  }

  _spawn(kind, opts) {
    const it = this._take(kind);
    it.alive = true;
    it.born = performance.now();
    it.t = 0;
    it.dur = opts.dur;
    it.x = opts.x;
    it.y = opts.y;
    it.z = opts.z;
    it.r0 = opts.r0;
    it.r1 = opts.r1;
    it.op = opts.opacity;
    it.ring0 = opts.ring0 !== undefined ? opts.ring0 : 0;
    it.ring1 = opts.ring1 !== undefined ? opts.ring1 : 1;
    it.thick = opts.thick !== undefined ? opts.thick : 0.5;
    it.spin = opts.spin || 0;
    it.rise = opts.rise || 0;
    it.fall = opts.fall || 0;
    it.vx = opts.vx || 0;
    it.vy = opts.vy || 0;
    it.vz = opts.vz || 0;
    it.px = opts.x;
    it.py = opts.y;
    it.pz = opts.z;
    it.drag = opts.drag || 0;
    it.grav = opts.grav || 0;
    it.follow = !!opts.follow;
    it.yScale = opts.yScale || 1;
    it.mat.uniforms.uKind.value = kind;
    it.mat.uniforms.uColor.value.setRGB(opts.color[0], opts.color[1], opts.color[2]);
    it.mat.uniforms.uOpacity.value = opts.opacity;
    it.mat.uniforms.uRing.value = it.ring0;
    it.mat.uniforms.uThick.value = it.thick;
    it.mat.uniforms.uT.value = 0;
    it.mesh.visible = true;
    // A streak is AIMED (`dir` is the direction its length runs along, from the spawn point);
    // everything else is a ground-plane disc and only ever spins about `yaw`.
    if (kind === SPRITE || kind === FLARE || kind === GLOW) {
      // ...and a STATIC roll, in the card's own plane. It is what a second, turned star is built
      // from (see the sixteen-point burst in `impact`): the flare's points are on the card's axes
      // and diagonals, so a star rolled by an eighth of a turn lands eight more points between them.
      it.mesh.quaternion.identity();
      it.mesh.rotation.set(0, 0, opts.roll || 0);
    } else if (kind === SHEET) {
      // A wind sheet is a CARD standing in the air ahead of the body, so it is aimed at TWO
      // things at once: its +Y runs along the flow (the direction the body is travelling) and its
      // +Z faces the camera. `setFromUnitVectors` (what a streak gets) can only aim one axis and
      // leaves the twist arbitrary — on a card, an arbitrary twist is a coin flip between a
      // visible sheet and a hairline seen edge-on.
      _wsF.set(opts.dir[0], opts.dir[1], opts.dir[2]);
      if (_wsF.lengthSq() < 1e-8) _wsF.set(0, 1, 0);
      _wsF.normalize();
      if (this.camera) {
        _wsV.set(this.camera.position.x - opts.x, this.camera.position.y - opts.y, this.camera.position.z - opts.z);
      } else {
        _wsV.set(0, 0, 0);
      }
      if (_wsV.lengthSq() < 1e-8) _wsV.copy(_fxUp);
      _wsV.normalize();
      _wsU.crossVectors(_wsF, _wsV);
      if (_wsU.lengthSq() < 1e-8) _wsU.set(1, 0, 0);
      _wsU.normalize();
      _wsV.crossVectors(_wsU, _wsF).normalize();
      _wsM.makeBasis(_wsU, _wsF, _wsV);
      it.mesh.quaternion.setFromRotationMatrix(_wsM);
    } else if (opts.dir) {
      _fxDir.set(opts.dir[0], opts.dir[1], opts.dir[2]);
      if (_fxDir.lengthSq() < 1e-8) _fxDir.set(0, 1, 0);
      it.mesh.quaternion.setFromUnitVectors(_fxUp, _fxDir.normalize());
    } else {
      it.mesh.quaternion.identity();
      it.mesh.rotation.set(0, opts.yaw || 0, 0);
    }
    it.mesh.position.set(opts.x, opts.y, opts.z);
    // A streak's +Y is its LENGTH (it is aimed at `dir` above) and its X/Z are its thickness —
    // cross-section and length are separate axes, and getting them the wrong way round draws a
    // flat card across the throw instead of a line along it (see the streak note in
    // src/README.md). A sprite is square in its own plane; everything else is a disc, where
    // `r1` is the radius it grows to.
    if (kind === STREAK || kind === GLINT || kind === SPARK) it.mesh.scale.set(opts.r0, opts.r1, opts.r0);
    else if (kind === SHEET) it.mesh.scale.set(opts.r0, opts.r1, 1);
    else if (kind === SPRITE || kind === FLARE || kind === GLOW) it.mesh.scale.set(opts.r0, opts.r0, 1);
    else it.mesh.scale.set(opts.r0, opts.yScale, opts.r0);
    return it;
  }

  // ------------------------------------------------------------------------------------------
  // THE CRATER — THE GROUND SLAM'S OWN, and the only effect in the game allowed to draw a COLUMN.
  //
  // The user's brief: *"can u stop spamming this vfx everywhere make them have unique vfx please fix
  // that i think this vfx should only be for the slam not all that other stuff add better vfx for
  // it"*. "This vfx" is the bright ground disc plus the wall of translucent dust, and before this
  // session ONE pair of methods — the old `shockwave` and `burst` — drew it for THIRTY-FIVE
  // different events: every push-off, every landing, every knee, every block, every broken crate,
  // every wall slam. A body being DRIVEN into the deck is the slam's read and nothing else's, so the
  // columns and the disc now live here, and every event that used to borrow them has an effect of
  // its own: `scuff` for a foot leaving the deck, `landDust` for one coming back to it, `ward` for a
  // guard, `wallGrit` for a blow on a face, `debrisCloud` for the world breaking, `liftOff` for
  // something sent UP off the ground, and `heatPuff` for the bag and the hot props.
  //
  // ...and it is BETTER than the effect it replaces, which is what *"add better vfx for it"* asks
  // for. Four things are new:
  //
  //   1. THE COLLAPSE RING. The old effect only ever threw its rings OUTWARD, so the mark of a slam
  //      was a ripple passing over the deck. A crater is the ground coming back IN — so the first
  //      ring is BORN wide (r0 2.5) and contracts to nothing while the second expands through it.
  //      The frames in which the two cross are the ones that read as a HOLE opening, not a wave.
  //   2. THE CLODS. Real lumps of the deck, thrown out on a shallow arc with their own drag and
  //      gravity, so the crater keeps spitting for a third of a second after the ring has gone. The
  //      disc says the floor was struck; the lumps say what it is MADE of.
  //   3. THE FLASH. A hot four-point star and a bloom ON the contact — the one frame where the boot
  //      is — because the boot is what the move is about, and the disc alone never showed it.
  //   4. THE GRIT. A fast, low, radial spray of sparks skimming out along the deck. The clods arc
  //      and the grit stays down; together they are what a heavy thing coming down throws.
  //
  // The disc itself is kept but pulled in. At power 1 the old one grew to a 5.4 unit radius and read
  // as a LAMP standing on the floor — which is where this session started — so the radius is down
  // about a third and the whole mark is one colour temperature warmer.
  slamCrater(x, y, z, power, color) {
    const p = Math.max(0, Math.min(1, power == null ? 0.6 : power));
    const c = color || [0.90, 0.89, 0.80];
    const dark = [c[0] * 0.78, c[1] * 0.76, c[2] * 0.72];
    // 1. THE COLLAPSE — the ground coming back in: born wide, shrinking, crossing the ring below on
    // its way down. A ring that CONTRACTS is the one move in this vocabulary nothing else uses.
    this._spawn(RING, {
      x,
      y: y + 0.035,
      z,
      color: [c[0] * 0.55 + 0.42, c[1] * 0.55 + 0.41, c[2] * 0.55 + 0.38],
      dur: 0.20 + p * 0.10,
      r0: 2.5 + p * 3.6,
      r1: 0.18,
      opacity: 0.34 + p * 0.24,
      ring0: 0.98,
      ring1: 0.10,
      thick: 0.46,
    });
    // 2. THE RINGS — the deck going out, in two passes: a thick fast one carrying the shock and a
    // thin wide one chasing it. Both are the old `shockwave`'s, untouched; this part was right.
    this._spawn(RING, {
      x,
      y: y + 0.05,
      z,
      color: c,
      dur: 0.42 + p * 0.24,
      r0: 0.7,
      r1: 3.4 + p * 8.5,
      opacity: 0.55 + p * 0.35,
      ring0: 0.12,
      ring1: 1.0,
      thick: 0.85 - p * 0.3,
    });
    this._spawn(RING, {
      x,
      y: y + 0.09,
      z,
      color: c,
      dur: 0.3 + p * 0.2,
      r0: 0.3,
      r1: 2.0 + p * 4.5,
      opacity: 0.45 + p * 0.3,
      ring0: 0.05,
      ring1: 0.95,
      thick: 1.2,
    });
    // 3. THE COLUMNS. Two, and this pair is the whole reason the session happened: the tall one is
    // the dust thrown straight up off the deck, the squat one the skirt of it rolling outward. The
    // slam's signature, and now nothing else in the game wears it.
    this._spawn(COLUMN, {
      x,
      y,
      z,
      color: dark,
      dur: 0.36 + p * 0.26,
      r0: 0.5 + p * 0.7,
      r1: 1.5 + p * 2.2,
      opacity: 0.55 + p * 0.35,
      yScale: 2.0 + p * 4.2,
    });
    this._spawn(COLUMN, {
      x,
      y: y - 0.16,
      z,
      color: dark,
      dur: 0.34 + p * 0.26,
      r0: 0.9 + p * 0.5,
      r1: 3.4 + p * 8.5,
      opacity: 0.42 + p * 0.26,
      yScale: 0.8 + p * 1.3,
    });
    // 4. THE DECK, LIT. The soft disc the old effect drew, kept but gathered in — see the note above.
    this._spawn(PUFF, {
      x,
      y: y + 0.07,
      z,
      color: c,
      dur: 0.20 + p * 0.14,
      r0: 0.6 + p * 0.4,
      r1: 1.9 + p * 2.4,
      opacity: 0.60 + p * 0.28,
    });
    // 5. THE FLASH — the boot, for a tenth of a second. A four-point star and the bloom under it,
    // both white-hot at the core, so the frame the slam lands on has something IN it.
    this._spawn(FLARE, {
      x,
      y: y + 0.20,
      z,
      color: [1.34, 1.24, 1.02],
      dur: 0.11 + p * 0.06,
      r0: 0.30 + p * 0.30,
      r1: 0.86 + p * 0.92,
      opacity: 0.60 + p * 0.30,
    });
    this._spawn(GLOW, {
      x,
      y: y + 0.16,
      z,
      color: [1.12 + c[0] * 0.24, 1.00 + c[1] * 0.22, 0.84 + c[2] * 0.20],
      dur: 0.17 + p * 0.10,
      r0: 0.24 + p * 0.20,
      r1: 0.68 + p * 0.78,
      opacity: 0.32 + p * 0.26,
    });
    // 6. THE CLODS. Lumps of the deck on a shallow arc: out and up at birth, gravity and drag bring
    // them down, and the sprite SHRINKS as it flies so a lump thins out as it dies. They are drawn
    // in the deck's own colour — the caller passes what `World.surfaceColorAt` read off the floor —
    // so a slam on grass throws grass and a slam on a painted slab throws the slab.
    const nc = Math.round((4 + p * 7) * this.fxScale);
    for (let i = 0; i < nc; i++) {
      const a = Math.random() * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const sp = 2.4 + p * 4.8 + Math.random() * 2.4;
      this._spawn(SPRITE, {
        x: x + ca * (0.08 + Math.random() * 0.36),
        y: y + 0.12 + Math.random() * 0.20,
        z: z + sa * (0.08 + Math.random() * 0.36),
        color: [c[0] * 0.96, c[1] * 0.92, c[2] * 0.86],
        dur: 0.32 + Math.random() * 0.34,
        r0: 0.055 + Math.random() * 0.075,
        r1: 0.026 + Math.random() * 0.048,
        opacity: 0.58 + Math.random() * 0.30,
        vx: ca * sp,
        vy: 1.7 + Math.random() * 3.4,
        vz: sa * sp,
        drag: 1.5 + Math.random(),
        grav: 15 + Math.random() * 8,
      });
    }
    // 7. THE GRIT. Flat and fast, thrown on a SHALLOW bearing so the spray skims out along the deck
    // and dies in the dirt rather than orbiting the body. It is kept short and low on purpose: the
    // first cut threw twenty of these at up to half a unit long and off the deck at a third of a
    // radian, and from the chase camera they read as a hedgehog of hair standing off the body
    // (measured on the live page) — grit the deck threw has to stay ON the deck.
    const ng = Math.round((6 + p * 8) * this.fxScale);
    this.sparks += ng;
    for (let i = 0; i < ng; i++) {
      const a = Math.random() * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const sp = 3.6 + p * 5.5 + Math.random() * 2.6;
      _fxA.set(ca, 0.05 + Math.random() * 0.16, sa).normalize();
      this._spawn(SPARK, {
        x: x + ca * 0.12,
        y: y + 0.08,
        z: z + sa * 0.12,
        color: [1.45 + Math.random() * 0.45, 1.12 + Math.random() * 0.34, 0.60 + Math.random() * 0.30],
        dur: 0.13 + Math.random() * 0.16,
        r0: 0.013 + p * 0.012,
        r1: 0.13 + p * 0.20 + Math.random() * 0.11,
        opacity: 0.46 + p * 0.36,
        dir: [_fxA.x, _fxA.y, _fxA.z],
        vx: _fxA.x * sp,
        vy: _fxA.y * sp,
        vz: _fxA.z * sp,
        drag: 3.8 + Math.random() * 1.8,
        grav: 13 + Math.random() * 8,
        follow: true,
      });
    }
  }

  // THE PUSH-OFF — the deck scraped by a foot that is LEAVING it.
  //
  // This is the effect for the biggest family of events in the game: the frame a move starts by
  // kicking the ground — the whirl's lunge, the knee's run-up and leap, the scissor's leap, the
  // running lunge's pounce and spread, skill 3's coil and launch, the Q dash, the guard's charge,
  // the grab's drive and the clinch's grip. Every one of them used to call `shockwave`, and so every
  // one of them drew a CRATER — a ring, a bright disc and a column of dust — under a man who was
  // only running. There is no ring here because there is no mark: a foot that pushes off leaves
  // grit going BACKWARD, a short bright skid on the deck where it went, and one low wisp of the
  // floor's own dust. Nothing rings, nothing stands up, and nothing lingers.
  //
  // `dx/dz` is the direction the body is GOING; the grit and the skid go the other way, because a
  // boot throws the floor behind it.
  scuff(x, y, z, dx, dz, power, color) {
    const p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
    const c = color || [0.92, 0.90, 0.84];
    const l = Math.hypot(dx || 0, dz || 0) || 1;
    const bx = -(dx || 0) / l;
    const bz = -(dz || 0) / l;
    const gritC = [c[0] * 0.34 + 0.62, c[1] * 0.34 + 0.62, c[2] * 0.34 + 0.60];
    // 1. THE SKID. A short smear laid ON the deck along the push-off line, brightest at the foot and
    // dying back behind it — the one mark that says the boot actually BIT before it left.
    this._spawn(GLINT, {
      x: x + bx * 0.14,
      y: y + 0.035,
      z: z + bz * 0.14,
      dir: [bx, 0.03, bz],
      color: [c[0] * 0.5 + 0.46, c[1] * 0.5 + 0.45, c[2] * 0.5 + 0.42],
      dur: 0.18 + p * 0.08,
      r0: 0.10 + p * 0.08,
      r1: 0.55 + p * 0.95,
      opacity: 0.22 + p * 0.18,
    });
    // 2. THE GRIT — thrown backward in a fan, each piece with gravity of its own so it arcs over and
    // skitters. Fast and low: a push-off is a flick of the foot, not a kick.
    const n = Math.round((3 + p * 5) * this.fxScale);
    this.sparks += n;
    for (let i = 0; i < n; i++) {
      const fan = (Math.random() - 0.5) * (0.7 + p * 0.9);
      _fxA.set(bx + bz * fan, 0.30 + Math.random() * 0.45, bz - bx * fan).normalize();
      const sp = 2.2 + p * 3.6 + Math.random() * 2.2;
      this._spawn(SPARK, {
        x,
        y: y + 0.07,
        z,
        color: [gritC[0] * 1.42, gritC[1] * 1.40, gritC[2] * 1.36],
        dur: 0.18 + Math.random() * 0.22,
        r0: 0.014 + p * 0.012,
        r1: 0.16 + p * 0.26 + Math.random() * 0.14,
        opacity: 0.44 + p * 0.34,
        dir: [_fxA.x, _fxA.y, _fxA.z],
        vx: _fxA.x * sp,
        vy: _fxA.y * sp,
        vz: _fxA.z * sp,
        drag: 3.0 + Math.random() * 1.6,
        grav: 13 + Math.random() * 7,
        follow: true,
      });
    }
    // 3. ONE WISP. Lifted toward white like the skid is, small and low: the puff of nothing that
    // comes off a step, not the bank of dust a crater throws.
    this._spawn(PUFF, {
      x: x + bx * 0.20,
      y: y + 0.05,
      z: z + bz * 0.20,
      color: [c[0] * 0.5 + 0.44, c[1] * 0.5 + 0.44, c[2] * 0.5 + 0.41],
      dur: 0.20 + p * 0.10,
      r0: 0.24 + p * 0.16,
      r1: 0.62 + p * 0.62,
      opacity: 0.26 + p * 0.20,
      fall: 0.2,
    });
  }

  // THE LANDING — feet (or a body) back on the deck.
  //
  // What a landing leaves is a thin flat ring and a bank of the floor's own dust, and that is all
  // this is: no column (that is the SLAM's), no clods (nothing broke) and no flash (nothing was
  // struck). It is also deliberately dimmer than a crater — half the opacity and no flash — because
  // a man putting his feet down must never read as a man hitting the ground with his fist.
  //
  // `spread` widens the whole mark without brightening it, which is what a blast needs: the same
  // ring, reaching further. `dx/dz`, given a direction the body was still travelling in, adds a
  // short forward skid of grit — the difference between a landing that RAN OUT and one that stopped.
  landDust(x, y, z, power, color, dx, dz, spread) {
    const p = Math.max(0, Math.min(1, power == null ? 0.4 : power));
    const base = color || [0.90, 0.89, 0.84];
    // The mark is LIFTED toward white before it is drawn (the same bargain `slideWake`'s grit makes):
    // the caller hands over the floor's own colour, and a ring of the floor's own colour at a quarter
    // of an alpha is a ring nobody can see. What the deck contributes is a TINT, so a landing on
    // grass is a pale green ring and one on a painted slab is a pale grey one — but it is always
    // legible, which a landing has to be, because it is the thing that tells you the move is over.
    const c = [base[0] * 0.5 + 0.46, base[1] * 0.5 + 0.45, base[2] * 0.5 + 0.42];
    const sp = spread === undefined ? 1 : spread;
    this._spawn(RING, {
      x,
      y: y + 0.04,
      z,
      color: c,
      dur: 0.44 + p * 0.20,
      r0: 0.42,
      r1: (1.55 + p * 1.85) * sp,
      opacity: 0.56 + p * 0.26,
      ring0: 0.16,
      ring1: 1,
      thick: 0.55,
    });
    this._spawn(PUFF, {
      x,
      y: y + 0.08,
      z,
      color: c,
      dur: 0.34 + p * 0.16,
      r0: 0.50 + p * 0.22,
      r1: (1.00 + p * 1.35) * sp,
      opacity: 0.52 + p * 0.26,
      fall: 0.22,
    });
    const l = Math.hypot(dx || 0, dz || 0);
    if (l > 0.01) {
      const n = Math.round((2 + p * 4) * this.fxScale);
      this.sparks += n;
      const fx = dx / l;
      const fz = dz / l;
      for (let i = 0; i < n; i++) {
        const fan = (Math.random() - 0.5) * (0.6 + p * 0.9);
        _fxA.set(fx + fz * fan, 0.22 + Math.random() * 0.34, fz - fx * fan).normalize();
        const v = 2.0 + p * 3.4 + Math.random() * 2.0;
        this._spawn(SPARK, {
          x,
          y: y + 0.06,
          z,
          color: [c[0] * 1.4 + 0.2, c[1] * 1.38 + 0.18, c[2] * 1.34 + 0.16],
          dur: 0.16 + Math.random() * 0.20,
          r0: 0.013 + p * 0.012,
          r1: 0.15 + p * 0.24 + Math.random() * 0.12,
          opacity: 0.40 + p * 0.32,
          dir: [_fxA.x, _fxA.y, _fxA.z],
          vx: _fxA.x * v,
          vy: _fxA.y * v,
          vz: _fxA.z * v,
          drag: 3.0 + Math.random() * 1.6,
          grav: 13 + Math.random() * 7,
          follow: true,
        });
      }
    }
  }

  // THE WARD — a guard, a lock, a parry, a pair of hands closing on nothing.
  //
  // A block never touches the deck, so it must never draw a mark on it, and the shared `shockwave`
  // drew one for every one of them: the boxer's block, the guard chord, the guard's charge, the
  // whirl's grab and the scissor's own opening all rang the floor like a slammed fist. What says a
  // guard is up is a ring of AIR, standing square to the fighter's own front at the height of the
  // hands, with a cold bloom inside it and a cross of light through the point.
  //
  // `dx/dy/dz` is the direction the guard FACES (the caller's facing, or the line a blow arrived
  // down), and the whole effect lies in the plane square to it — so a ward seen from behind the
  // shoulder is a disc and one seen side-on is a line, which is the same read a strike's own air
  // ring makes, and correct for the same reason: it is a surface between the two bodies.
  ward(x, y, z, dx, dy, dz, power, color) {
    const p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
    const c = color || [0.88, 0.95, 1.06];
    const nl = Math.hypot(dx, dy, dz) || 1;
    _impN.set(dx / nl, dy / nl, dz / nl);
    this._spawn(RING, {
      x,
      y,
      z,
      dir: [_impN.x, _impN.y, _impN.z],
      color: c,
      dur: 0.20 + p * 0.14,
      r0: 0.22 + p * 0.10,
      r1: 0.78 + p * 0.60,
      opacity: 0.46 + p * 0.30,
      ring0: 0.16,
      ring1: 1,
      thick: 0.20,
    });
    this._spawn(RING, {
      x,
      y,
      z,
      dir: [_impN.x, _impN.y, _impN.z],
      color: [c[0] * 0.8 + 0.2, c[1] * 0.8 + 0.2, c[2] * 0.8 + 0.2],
      dur: 0.28 + p * 0.16,
      r0: 0.34 + p * 0.14,
      r1: 1.05 + p * 0.85,
      opacity: 0.20 + p * 0.16,
      ring0: 0.44,
      ring1: 1,
      thick: 0.36,
    });
    this._spawn(GLOW, {
      x,
      y,
      z,
      color: [c[0] * 0.6 + 0.5, c[1] * 0.6 + 0.5, c[2] * 0.6 + 0.48],
      dur: 0.14 + p * 0.10,
      r0: 0.16 + p * 0.14,
      r1: 0.44 + p * 0.46,
      opacity: 0.28 + p * 0.24,
    });
    // ...and the two glints: a short bright bar through the point on the plane's own two axes, which
    // is the cross of light where the two limbs met.
    const barL = 0.42 + p * 0.5;
    this._spawn(GLINT, {
      x, y, z,
      dir: [-_impN.z, 0.02, _impN.x],
      color: [c[0] + 0.2, c[1] + 0.2, c[2] + 0.18],
      dur: 0.11,
      r0: 0.045 + p * 0.03,
      r1: barL,
      opacity: 0.42 + p * 0.30,
    });
    this._spawn(GLINT, {
      x, y, z,
      dir: [_impN.x * 0.3, 1, _impN.z * 0.3],
      color: [c[0] + 0.2, c[1] + 0.2, c[2] + 0.18],
      dur: 0.11,
      r0: 0.045 + p * 0.03,
      r1: barL * 0.8,
      opacity: 0.42 + p * 0.30,
    });
  }

  // ------------------------------------------------------------------------------------------
  // THE M1 CLASH (see `startClash` / `updateClash` in player/combat.js and the clash blocks in
  // main.js's `frame`).
  //
  // Two M1s meeting is the one contact in the game with no STRIKER: nobody landed anything, the two
  // limbs arrived at the same point from opposite sides and stopped there, and the fight turns into
  // a shoving match the player has to mash out of. The lock already had its own SHAPES (see
  // `poseClash`) but its FX were borrowed — one burst off the shared `impact` and then nothing at
  // all for the whole contest, which is the single longest beat in the game. The loudest moment in
  // the fight was followed by seconds of silence with a meter up in the corner.
  //
  // So the clash now has a voice of its own, and it is built round the one thing that separates it
  // from every other contact: the two limbs are meeting on a LINE, so everything is laid out in the
  // plane SQUARE to that line — a VERTICAL shock disc (not the ground ring every other contact in
  // the game wears), sparks sprayed out of the plane as the two edges bite, and a cross of light
  // through the point itself. The deck still gets a ring, because a clash is fought with both feet
  // planted, but it is the SECOND read, drawn wide and faint under the real event.
  //
  // Its colour is the lock's own gold; the two sides are told apart by how the sparks LEAVE (the
  // player's shoves throw them at the body, the body's throw them at the player), which is the same
  // read the poses give. Three beats: `clashMeet` (arriving), `clashPress` (a shove), `clashGrind`
  // (the pressure under both).
  clashMeet(x, y, z, dx, dz, power, groundY) {
    const p = Math.max(0, Math.min(1, power == null ? 0.8 : power));
    const l = Math.hypot(dx, dz) || 1;
    _clN.set(dx / l, 0, dz / l);
    const hot = [1.0, 0.90, 0.56];
    const white = [1.34, 1.29, 1.17];
    // 1. THE MEETING. The biggest star in the game, and the only place two of them are drawn at
    // once: two blows arriving in the same frame is two blows' worth of light, and the second star
    // (turned an eighth) carries it past the sixteen points a single finisher gets. Both live longer
    // than an ordinary impact's on purpose — the camera is still swinging onto the pair's flank for
    // the first tenth of a second of the lock (see the clash block in main.js's `frame`), so the
    // burst has to still be there when the shot arrives.
    this._spawn(FLARE, { x, y, z, color: white, dur: 0.24, r0: 0.34, r1: 1.34, opacity: 0.95 });
    this._spawn(FLARE, { x, y, z, color: [white[0] * 0.9, white[1] * 0.88, white[2] * 0.84], dur: 0.28, r0: 0.42, r1: 1.66, opacity: 0.42, roll: Math.PI * 0.125 });
    this._spawn(GLOW, { x, y, z, color: [1.05, 0.92, 0.60], dur: 0.36, r0: 0.30, r1: 1.52, opacity: 0.76 });
    // 2. THE CROSS. The one straight line at the contact, drawn BOTH ways down the line the fists
    // met on, with a shorter vertical through it. Two things colliding is read as an X, and it is
    // the part that survives from a camera sitting directly behind the player, where the disc is
    // edge-on and the sparks are a haze in the middle of the screen.
    this._spawn(GLINT, { x, y, z, dir: [_clN.x, 0, _clN.z], color: white, dur: 0.11, r0: 0.075, r1: 1.15, opacity: 0.9 });
    this._spawn(GLINT, { x, y, z, dir: [-_clN.x, 0, -_clN.z], color: white, dur: 0.11, r0: 0.075, r1: 1.15, opacity: 0.9 });
    this._spawn(GLINT, { x, y, z, dir: [0, 1, 0], color: [1.2, 1.12, 0.9], dur: 0.10, r0: 0.06, r1: 0.85, opacity: 0.72 });
    // 3. THE FRONT. A VERTICAL disc in the plane square to the line — the wall of air the two of
    // them are squeezing between them — snapping out fast and thin. This is the clash's own mark:
    // the only vertical ring in the game that is not a wall contact.
    this._spawn(RING, { x, y, z, dir: [_clN.x, 0, _clN.z], color: hot, dur: 0.42, r0: 0.26, r1: 1.60, opacity: 0.82, ring0: 0.14, ring1: 1, thick: 0.20 });
    this._spawn(RING, { x, y, z, dir: [_clN.x, 0, _clN.z], color: [hot[0] * 0.8 + 0.28, hot[1] * 0.8 + 0.26, hot[2] * 0.8 + 0.22], dur: 0.52, r0: 0.40, r1: 2.35, opacity: 0.32, ring0: 0.30, ring1: 1, thick: 0.44 });
    // 4. THE DECK, because both of them are PLANTED. Wide, flat and faint — the second read.
    if (groundY != null) {
      this._spawn(RING, { x, y: groundY, z, color: [hot[0] * 0.55 + 0.40, hot[1] * 0.55 + 0.36, hot[2] * 0.55 + 0.30], dur: 0.44, r0: 0.35, r1: 2.80, opacity: 0.44, ring0: 0.20, ring1: 1, thick: 0.34 });
    }
    // 5. THE SPARKS. The two edges biting throw a fountain straight up and a spray BOTH ways down
    // the line into each body — an omnidirectional shower would say "something exploded", where the
    // two-way spray says the two of them are pushing against each other. Tuned DOWN from a first cut
    // that threw 42 at once: at this camera the long tail of that many sparks reads as white
    // scratches over the sky, and the star (above) is the beat the eye is supposed to take, with the
    // spray as its air rather than as a hailstorm.
    _clA.set(0, 1, 0);
    _clB.set(_clN.x, 0, _clN.z);
    this.sparkCone(x, y, z, _clA, 14, 8 + 7 * p, Math.min(1, p + 0.1), hot, 0.95);
    this.sparkCone(x, y, z, _clB, 7, 7 + 8 * p, p * 0.8, hot, 0.5);
    _clB.set(-_clN.x, 0, -_clN.z);
    this.sparkCone(x, y, z, _clB, 7, 7 + 8 * p, p * 0.8, hot, 0.5);
  }

  // A SHOVE in the lock: one press of M1 (the player's or the body's), landing at the contact.
  // `side` is +1 for the player's shove (it travels from the player into the body, i.e. along the
  // line the two met on) and -1 for the body's. It is a small, fast, forward version of the meeting
  // — a snap of light, the bar down the direction the push went, a thin disc and a spray of sparks
  // out of the plane — because it happens several times a second and has to read as a RHYTHM, not
  // as a second impact every time. The two sides are told apart by COLOUR as well as by direction:
  // the player's shove is the lock's own gold and the body's is a cold white-blue, so a mash reads
  // as a tug of war between two colours rather than as one anonymous flurry.
  clashPress(x, y, z, dx, dz, power, side) {
    const p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
    const l = Math.hypot(dx, dz) || 1;
    const sg = side < 0 ? -1 : 1;
    _clN.set((dx / l) * sg, 0, (dz / l) * sg);
    const hot = sg > 0 ? [1.0, 0.92, 0.60] : [0.78, 0.90, 1.18];
    const white = sg > 0 ? [1.30, 1.24, 1.10] : [1.14, 1.22, 1.36];
    this._spawn(FLARE, { x, y, z, color: white, dur: 0.09 + 0.04 * p, r0: 0.22 + 0.14 * p, r1: 0.66 + 0.56 * p, opacity: 0.70 + 0.28 * p });
    this._spawn(GLOW, { x, y, z, color: [hot[0] * 0.7 + 0.4, hot[1] * 0.7 + 0.38, hot[2] * 0.7 + 0.36], dur: 0.16, r0: 0.22, r1: 0.62 + 0.42 * p, opacity: 0.44 + 0.20 * p });
    this._spawn(GLINT, { x, y, z, dir: [_clN.x, 0, _clN.z], color: white, dur: 0.085, r0: 0.06, r1: 0.50 + 0.45 * p, opacity: 0.80 });
    this._spawn(RING, { x, y, z, dir: [_clN.x, 0, _clN.z], color: hot, dur: 0.17, r0: 0.18, r1: 0.90 + 0.50 * p, opacity: 0.60, ring0: 0.20, ring1: 1, thick: 0.26 });
    this.sparkCone(x, y, z, _clN, 8 + Math.round(7 * p), 8 + 9 * p, p, hot, 1.0);
  }

  // THE PRESSURE UNDER BOTH — the continuous grind at the contact for as long as the lock lasts.
  // It is a RATE, not a per-frame spawn (the same bargain the slide's spray and the climber's grit
  // make): a hot halo at the contact plus an ember or two drifted out into the meeting plane and a
  // slow pressure ring, ticking faster and brighter the further the race has run. `bias` is the
  // state of the race (`c.push - c.ePush`) and it CARRIES the embers down whichever side is winning,
  // so the sparks themselves lean the way the shoving match is going.
  clashGrind(dt, x, y, z, dx, dz, power, bias) {
    const p = Math.max(0, Math.min(1, power == null ? 0.4 : power));
    this.clashT -= dt;
    if (this.clashT > 0) return;
    this.clashT = 0.09 - 0.05 * p;
    const l = Math.hypot(dx, dz) || 1;
    _clN.set(dx / l, 0, dz / l);
    _clP.set(-_clN.z, 0, _clN.x);
    // ...the light the two of them are STUCK on: a halo at the contact, sized and lit by how far the
    // race has run, so the pair is always visibly fighting over a hot point rather than holding a
    // pose. It is fed a touch too big for its opacity on purpose — the spill onto the two bodies is
    // the part that says the light is BETWEEN them.
    this._spawn(GLOW, {
      x, y, z,
      color: [1.0 + 0.18 * p, 0.90 + 0.14 * p, 0.60 + 0.10 * p],
      dur: 0.22 + 0.14 * p,
      r0: 0.22 + 0.22 * p,
      r1: 0.80 + 0.95 * p,
      opacity: 0.36 + 0.46 * p,
    });
    // ...and the pressure drawn as a HOOP every few ticks, so the contact has a shape and not just a
    // glow. Slow and faint: it is the same air the meeting burst rang, still being squeezed.
    this.clashGrindN++;
    if (this.clashGrindN % 3 === 0) {
      this._spawn(RING, {
        x, y, z, dir: [_clN.x, 0, _clN.z],
        color: [1.0, 0.90, 0.60], dur: 0.26 + 0.14 * p,
        r0: 0.40 + 0.20 * p, r1: 1.10 + 0.90 * p, opacity: 0.22 + 0.20 * p,
        ring0: 0.30, ring1: 1, thick: 0.26,
      });
    }
    const n = 2 + (p > 0.45 ? 1 : 0);
    const carry = (bias || 0) * (0.9 + 1.6 * p);
    for (let i = 0; i < n; i++) {
      if (Math.random() > 0.85) continue;
      const a = Math.random() * Math.PI * 2;
      _clE.copy(_clP).multiplyScalar(Math.cos(a));
      _clE.y += Math.sin(a);
      const sp = 0.5 + Math.random() * (1.0 + 1.5 * p);
      this._spawn(GLINT, {
        x, y, z,
        color: [1.2, 1.02, 0.64],
        dur: 0.22 + Math.random() * 0.22,
        r0: 0.032 + Math.random() * 0.024,
        r1: 0.18 + 0.26 * p + Math.random() * 0.10,
        opacity: 0.55,
        dir: [_clE.x, _clE.y, _clE.z],
        vx: _clE.x * sp + _clN.x * carry,
        vy: _clE.y * sp + 0.6,
        vz: _clE.z * sp + _clN.z * carry,
        drag: 2.8,
        grav: 3.2,
      });
    }
    // ...and a bite of real, thrown sparks once the pressure is up.
    if (p > 0.30 && Math.random() < 0.55) {
      _clB.copy(_clP).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
      _clB.y = 0.6;
      _clB.normalize();
      this.sparkCone(x, y, z, _clB, 4, 6 + 6 * p, p, [1.0, 0.9, 0.6], 0.8);
    }
    // ...and the CRACKLE: a short arc thrown ALONG the line between the two limbs, jittered off it —
    // the one part of the clash drawn along the contact rather than across it, which reads as energy
    // jumping between the two of them instead of as another ring.
    if (Math.random() < 0.6) {
      const off = (Math.random() - 0.5) * 0.7;
      const up = (Math.random() - 0.5) * 0.5;
      const s = Math.random() < 0.5 ? 1 : -1;
      this._spawn(GLINT, {
        x: x + _clP.x * off, y: y + up, z: z + _clP.z * off,
        color: [1.25, 1.1, 0.72],
        dur: 0.06 + Math.random() * 0.05,
        r0: 0.03, r1: 0.30 + 0.45 * Math.random(),
        opacity: 0.55,
        dir: [_clN.x * s, (Math.random() - 0.5) * 0.25, _clN.z * s],
      });
    }
  }

  // GRIT OFF A FACE — a blow that landed on a WALL.
  //
  // A wall is not a deck, and the shared `shockwave` rang the FLOOR for every wall contact in the
  // game — the body thrown into the stone, the clinch's smash, the clinch's hurl, every prop that
  // bounced off a face. What a wall leaves is paint and stone thrown off the FACE, so the ring here
  // stands ON the wall (square to the normal), the grit is sprayed out along the normal in a wide
  // shallow fan, and a few lumps catch the normal, cling and drop.
  //
  // `nx/ny/nz` points OUT of the face into the room — the same convention `destruction` uses for a
  // wall strike, so the caller can hand over its own normal without a sign flip.
  wallGrit(x, y, z, nx, ny, nz, power, color) {
    const p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
    const c = color || [0.86, 0.86, 0.84];
    const nl = Math.hypot(nx, ny || 0, nz) || 1;
    _impN.set(nx / nl, (ny || 0) / nl, nz / nl);
    // 1. THE RING, on the wall — a mark left on a VERTICAL surface rather than a hoop on the floor.
    this._spawn(RING, {
      x: x + _impN.x * 0.03,
      y: y + _impN.y * 0.03,
      z: z + _impN.z * 0.03,
      dir: [_impN.x, _impN.y, _impN.z],
      color: [c[0] * 0.55 + 0.44, c[1] * 0.55 + 0.43, c[2] * 0.55 + 0.40],
      dur: 0.30 + p * 0.16,
      r0: 0.30,
      r1: 1.25 + p * 1.35,
      opacity: 0.34 + p * 0.24,
      ring0: 0.18,
      ring1: 1,
      thick: 0.40,
    });
    // 2. THE SPRAY — straight out of the face, in a wide shallow cone so it reads as one slap of
    // grit rather than as a fistful of sparks thrown at a point.
    this.sparkCone(x, y, z, _impN, 8 + Math.round(9 * p), 4.5 + 5.5 * p, p, [c[0] * 1.25, c[1] * 1.24, c[2] * 1.20], 0.55);
    // 3. THE LUMPS — clinging and dropping: thrown out and DOWN, because a wall face does not throw
    // anything upward, and gravity is what tells the eye the surface is vertical.
    const nc = Math.round((3 + p * 5) * this.fxScale);
    for (let i = 0; i < nc; i++) {
      const a = Math.random() * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      _fxA.set(_impN.x + ca * 0.5, _impN.y + sa * 0.35, _impN.z + sa * 0.4).normalize();
      const v = 1.6 + p * 3.2 + Math.random() * 1.6;
      this._spawn(SPRITE, {
        x,
        y,
        z,
        color: [c[0] * 0.95, c[1] * 0.93, c[2] * 0.90],
        dur: 0.30 + Math.random() * 0.30,
        r0: 0.045 + Math.random() * 0.06,
        r1: 0.020 + Math.random() * 0.04,
        opacity: 0.50 + Math.random() * 0.30,
        vx: _fxA.x * v,
        vy: _fxA.y * v - 0.8,
        vz: _fxA.z * v,
        drag: 1.6 + Math.random(),
        grav: 15 + Math.random() * 8,
      });
    }
    // 4. ...and the dust ON the face, a small puff at the contact rather than a bank on the floor.
    this._spawn(PUFF, {
      x: x + _impN.x * 0.10,
      y,
      z: z + _impN.z * 0.10,
      color: c,
      dur: 0.20 + p * 0.10,
      r0: 0.28 + p * 0.16,
      r1: 0.75 + p * 0.85,
      opacity: 0.22 + p * 0.18,
      fall: 0.35,
    });
  }

  // DEBRIS — the world coming apart (a block destroyed, the ground unstitched, the staff shattered,
  // a prop giving out).
  //
  // A breaking object is not an impact and not a landing; it is a CLOUD, and the thing the shared
  // `shockwave` got most wrong about it was the column — a crate coming apart sent a translucent
  // wall of dust standing up out of the rubble, which is the vocabulary of a thing being struck
  // rather than of a thing falling to pieces. This is a bank of staggered puffs at different heights
  // and offsets, a slow faint ring at the base (the one part of a break that does reach the floor),
  // and lumps thrown up and out. No column, no bright disc, no flash: nothing was hit.
  debrisCloud(x, y, z, power, color) {
    const p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
    const c = color || [0.88, 0.87, 0.82];
    const n = Math.round((4 + p * 4) * (0.6 + 0.4 * this.fxScale));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rr = 0.18 + Math.random() * (0.9 + p * 0.9);
      const hgt = 0.10 + Math.random() * (0.55 + p * 0.85);
      this._spawn(SPRITE, {
        x: x + ca * rr,
        y: y + hgt,
        z: z + sa * rr,
        color: [c[0] * (0.94 + Math.random() * 0.14), c[1] * (0.93 + Math.random() * 0.14), c[2] * (0.90 + Math.random() * 0.14)],
        dur: 0.42 + Math.random() * 0.42,
        r0: 0.30 + Math.random() * 0.30,
        r1: 1.05 + p * 1.50 + Math.random() * 0.60,
        opacity: 0.26 + Math.random() * 0.22,
        vx: ca * (0.5 + Math.random() * 1.1),
        vy: 0.35 + Math.random() * 1.0,
        vz: sa * (0.5 + Math.random() * 1.1),
        drag: 1.2 + Math.random() * 0.8,
        fall: 0.15,
      });
    }
    this._spawn(RING, {
      x,
      y: y + 0.04,
      z,
      color: c,
      dur: 0.34 + p * 0.20,
      r0: 0.5,
      r1: 1.8 + p * 3.0,
      opacity: 0.20 + p * 0.16,
      ring0: 0.2,
      ring1: 1,
      thick: 0.6,
    });
    const nc = Math.round((4 + p * 7) * this.fxScale);
    for (let i = 0; i < nc; i++) {
      const a = Math.random() * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const v = 1.8 + p * 4.0 + Math.random() * 2.2;
      this._spawn(SPRITE, {
        x,
        y: y + 0.10 + Math.random() * 0.30,
        z,
        color: [c[0] * 0.90, c[1] * 0.88, c[2] * 0.84],
        dur: 0.34 + Math.random() * 0.36,
        r0: 0.050 + Math.random() * 0.080,
        r1: 0.024 + Math.random() * 0.045,
        opacity: 0.55 + Math.random() * 0.30,
        vx: ca * v,
        vy: 2.2 + Math.random() * 3.4,
        vz: sa * v,
        drag: 1.5 + Math.random(),
        grav: 16 + Math.random() * 9,
      });
    }
  }

  // THE LIFT — something left the deck UPWARD.
  //
  // Every launcher in the game shares a shape the shared `shockwave` could not draw: the ground is
  // left BEHIND. The dive that takes a body into the air, the macaco's fling, the whirl's pop out of
  // its crater, a double jump and the sky's own launch pad all used to ring the floor as though
  // something had ARRIVED, when the one thing that had happened was that something had GONE.
  //
  // So the ring lies flat UNDER the point — a mark on a deck the body is no longer on — the grit is
  // thrown UP rather than out, and the dust RISES. Everything moves the way the body is moving,
  // which is the whole read of a launcher.
  liftOff(x, y, z, power, color) {
    const p = Math.max(0, Math.min(1, power == null ? 0.6 : power));
    const c = color || [0.94, 0.92, 0.84];
    this._spawn(RING, {
      x,
      y: y + 0.03,
      z,
      color: c,
      dur: 0.26 + p * 0.16,
      r0: 0.40,
      r1: 1.25 + p * 1.55,
      opacity: 0.28 + p * 0.22,
      ring0: 0.16,
      ring1: 1,
      thick: 0.5,
    });
    const n = Math.round((5 + p * 9) * this.fxScale);
    this.sparks += n;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      _fxA.set(ca * (0.25 + Math.random() * 0.45), 1.0, sa * (0.25 + Math.random() * 0.45)).normalize();
      const v = 3.4 + p * 5.0 + Math.random() * 2.4;
      this._spawn(SPARK, {
        x,
        y: y + 0.06,
        z,
        color: [c[0] * 1.40 + 0.22, c[1] * 1.36 + 0.20, c[2] * 1.30 + 0.16],
        dur: 0.22 + Math.random() * 0.24,
        r0: 0.014 + p * 0.014,
        r1: 0.20 + p * 0.34 + Math.random() * 0.18,
        opacity: 0.46 + p * 0.36,
        dir: [_fxA.x, _fxA.y, _fxA.z],
        vx: _fxA.x * v,
        vy: _fxA.y * v,
        vz: _fxA.z * v,
        drag: 2.4 + Math.random() * 1.4,
        grav: 11 + Math.random() * 6,
        follow: true,
      });
    }
    // ...and the rising dust: puffs with upward velocity, so the bank climbs off the deck WITH the
    // body instead of sitting on it. This is the half that makes a lift legible in a still frame.
    const np = Math.round((2 + p * 3) * (0.5 + 0.5 * this.fxScale));
    for (let i = 0; i < np; i++) {
      const a = Math.random() * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      this._spawn(SPRITE, {
        x: x + ca * (0.12 + Math.random() * 0.34),
        y: y + 0.10 + Math.random() * 0.22,
        z: z + sa * (0.12 + Math.random() * 0.34),
        color: c,
        dur: 0.30 + Math.random() * 0.24,
        r0: 0.26 + Math.random() * 0.24,
        r1: 0.72 + p * 0.90 + Math.random() * 0.40,
        opacity: 0.20 + Math.random() * 0.16,
        vx: ca * 0.5,
        vy: 1.5 + Math.random() * 1.6,
        vz: sa * 0.5,
        drag: 1.4 + Math.random() * 0.7,
      });
    }
  }

  // A BURST OF HEAT — the bag and the hot props (see `inventory.js`).
  //
  // The duffel catches fire, and from then on every contact with it — a hit, a body running into it,
  // a boot putting it away, the frame it finally comes apart — throws a spray of the heat rather
  // than a shock. All six of those used to call `burst`, so all six rang a golden ring on the floor
  // under a burning bag, which reads as a firework rather than as something hot being struck.
  //
  // What heat actually does when it is disturbed is RISE, so these are camera-facing puffs in the
  // thing's own colour with upward velocity and drag, plus a couple of glints riding up with them.
  // No ring at all: nothing here touched the deck.
  heatPuff(x, y, z, power, color) {
    const p = Math.max(0, Math.min(1, power == null ? 0.6 : power));
    const c = color || [1.0, 0.82, 0.45];
    const np = Math.round((3 + p * 3) * (0.6 + 0.4 * this.fxScale));
    for (let i = 0; i < np; i++) {
      const a = Math.random() * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rr = 0.10 + Math.random() * (0.30 + p * 0.35);
      this._spawn(SPRITE, {
        x: x + ca * rr,
        y: y + (Math.random() - 0.3) * 0.25,
        z: z + sa * rr,
        color: [c[0] * (0.96 + Math.random() * 0.30), c[1] * (0.92 + Math.random() * 0.28), c[2] * (0.86 + Math.random() * 0.24)],
        dur: 0.20 + Math.random() * 0.22,
        r0: 0.22 + Math.random() * 0.20,
        r1: 0.70 + p * 0.80 + Math.random() * 0.35,
        opacity: 0.30 + Math.random() * 0.24,
        vx: ca * (0.35 + Math.random() * 0.7),
        vy: 1.5 + Math.random() * 1.7,
        vz: sa * (0.35 + Math.random() * 0.7),
        drag: 1.5 + Math.random() * 0.8,
      });
    }
    const ng = Math.round((2 + p * 3) * this.fxScale);
    this.sparks += ng;
    for (let i = 0; i < ng; i++) {
      const a = Math.random() * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      _fxA.set(ca * 0.35, 1.0, sa * 0.35).normalize();
      const v = 2.0 + p * 3.0 + Math.random() * 1.8;
      this._spawn(GLINT, {
        x: x + ca * 0.18,
        y: y + Math.random() * 0.2,
        z: z + sa * 0.18,
        color: [c[0] * 1.40 + 0.20, c[1] * 1.30 + 0.18, c[2] * 1.15 + 0.14],
        dur: 0.14 + Math.random() * 0.16,
        r0: 0.014 + p * 0.014,
        r1: 0.16 + p * 0.26 + Math.random() * 0.14,
        opacity: 0.40 + p * 0.30,
        dir: [_fxA.x, _fxA.y, _fxA.z],
        vx: _fxA.x * v,
        vy: _fxA.y * v,
        vz: _fxA.z * v,
        drag: 2.2 + Math.random() * 1.2,
        grav: 4 + Math.random() * 4,
        follow: true,
      });
    }
  }

  puff(x, y, z, size, color, opacity) {
    this._spawn(PUFF, {
      x,
      y: y + 0.06,
      z,
      dur: 0.32,
      r0: size * 0.45,
      r1: size,
      opacity: opacity !== undefined ? opacity : 0.5,
      color: color || [0.9, 0.89, 0.83],
      rise: 0,
      fall: 0.25,
    });
  }


  // ------------------------------------------------------------------------------------------
  // THE STRIKE — every blow that lands in the game is drawn by `impact` (session 82).
  //
  // A hit used to be a puff and a ring, which is the vocabulary of a THING ARRIVING somewhere, not
  // of a thing BEING STRUCK: it says "dust moved here", so a fist landing on a body read as weather.
  // What a strike actually looks like is DIRECTION. So this does four things, all of them laid out on
  // the line the blow travelled in (`dir`, the world direction from the striker to the contact):
  //
  //   1. A FLASH on the contact itself — a hot core inside a four-point star, additive, a tenth of a
  //      second. This is the frame going white where the fist stopped.
  //   2. AN AIR RING square to the strike, so the shock is a disc the punch pushed through the air
  //      rather than a hoop lying on the ground (a ground ring is a LANDING's mark; see `landDust`).
  //   3. SPARKS thrown in a cone down the strike line. They drag and they fall (see `update`), so
  //      they fly out fast and die off, which is the single strongest "something hard just hit
  //      something harder" cue available at this resolution, and the only one that shows WHO hit WHOM.
  //   4. A little of whatever the blow was made of — a pale wash along the strike, and `dust` when
  //      the caller knows what surface is under it.
  //
  // `power` is the same 0..1 dial every other impact in the game uses, and it drives the count, the
  // speed, the size and the colour temperature together — so a jab and the finisher are the same
  // system at two places on one dial rather than two hand-built effects.
  impact(x, y, z, dx, dy, dz, power, opts) {
    const p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
    const o = opts || {};
    const hot = o.color || [1.0, 0.88, 0.56];
    const nl = Math.hypot(dx, dy, dz) || 1;
    _impN.set(dx / nl, dy / nl, dz / nl);
    // A unit axis square to the strike: the ring lies in the plane this spans with the strike's own
    // perpendicular, and the sparks are thrown off it at a random angle.
    _impT.set(-_impN.z, 0, _impN.x);
    if (_impT.lengthSq() < 1e-6) _impT.set(1, 0, 0);
    _impT.normalize();
    const scale = this.fxScale;
    this.strikes++;
    // Everything the contact throws is keyed off one dial, and the two ends of it are the two ends
    // of the fight: `p` 0.2 is the first knee and `p` 1 is the finisher that puts a body down.
    const fl = 0.55 + 0.45 * p;
    // Near-white at the core and tinted on the way out, because a hot thing is white first and
    // coloured second — the tint says which move it was, the white says how hard.
    const white = [
      1.25 * fl + hot[0] * 0.5 * (1 - fl),
      1.22 * fl + hot[1] * 0.5 * (1 - fl),
      1.12 * fl + hot[2] * 0.5 * (1 - fl),
    ];
    // 1. THE FLASH. An eight-point star with a core that collapses inside the first third of it and
    // spikes that slash outward (see the FLARE note in FRAG). Everything else here hangs off this
    // one frame: the star is the beat, and the rest is the air it moved. It is drawn BIG on purpose
    // (session 122 took it up by a third): at 224 lines the star's points are the one shape at the
    // contact that is legible from the chase camera's distance, and a strike that is only clear when
    // the camera is zoomed in is a strike the player never sees. A jab stays a small snap and the
    // finisher is a third of a body across — the same dial, pushed further at the top.
    this._spawn(FLARE, {
      x,
      y,
      z,
      color: white,
      dur: 0.10 + p * 0.08,
      r0: 0.25 + p * 0.35,
      r1: 0.76 + p * 1.02,
      opacity: 0.72 + p * 0.24,
    });
    // ...and a SECOND star on the heavy strikes, turned 22.5° and drawn wider and dimmer. The star's
    // own points land on the card's axes and diagonals (four long, four short); a second one between
    // them is eight points more, which is what turns a four-point sparkle into a sixteen-point burst
    // — the difference between a jab and the move that puts a body on the deck.
    if (p > 0.42) {
      this._spawn(FLARE, {
        x,
        y,
        z,
        color: [white[0] * 0.86, white[1] * 0.84, white[2] * 0.8],
        dur: 0.13 + p * 0.09,
        r0: 0.30 + p * 0.36,
        r1: 0.92 + p * 1.0,
        opacity: 0.26 + p * 0.26,
        roll: Math.PI * 0.125,
      });
    }
    // 1b. THE BLOOM. A soft additive halo UNDER the star, so the contact lights the air around it
    // rather than only drawing on top of it — at 224 lines the star's own points are a couple of
    // pixels wide, and the halo is the part that survives being small. It swells fast and dies with
    // the star; nothing lingers, because a glow that outlives a punch reads as a magic effect.
    this._spawn(GLOW, {
      x,
      y,
      z,
      color: [hot[0] * 0.9 + 0.36, hot[1] * 0.86 + 0.34, hot[2] * 0.8 + 0.3],
      dur: 0.16 + p * 0.10,
      r0: 0.20 + p * 0.24,
      r1: 0.56 + p * 0.76,
      opacity: 0.36 + p * 0.30,
    });
    // 2. THE BAR. The strike's own LINE, drawn THROUGH the contact: a hot streak out past the body
    // and a shorter one back toward the fist, both brightest AT the contact and fading outward. It
    // is the one part of the strike that is a straight line, and it is what makes the blow read as
    // having a direction even from a camera sitting directly behind the striker's shoulder (where
    // the ring is edge-on and the cone is a puff of dots in the middle of the screen).
    const barL = 0.68 + 1.0 * p;
    const barC = [white[0], white[1] * 0.98, white[2] * 0.94];
    const barOpts = {
      x,
      y,
      z,
      color: barC,
      dur: 0.085 + p * 0.05,
      r0: 0.045 + 0.05 * p,
      r1: barL,
      opacity: 0.6 + p * 0.4,
      drag: 6,
    };
    this._spawn(GLINT, Object.assign({ dir: [-_impN.x, -_impN.y, -_impN.z] }, barOpts));
    this._spawn(GLINT, Object.assign({ dir: [_impN.x * 0.75, _impN.y * 0.75, _impN.z * 0.75] }, barOpts, { r1: barL * 0.7 }));
    // 3. THE AIR RING, square to the strike. Small and fast: it is the air closing, not a crater. A
    // second, wider one chases it a few hundredths later and spreads at half the rate, which is what
    // gives the shock a thickness in time rather than a single drawn hoop. Both are kept near the
    // body's own width — a shock that outgrows the two bodies stops being about them.
    this._spawn(RING, {
      x,
      y,
      z,
      dir: [_impN.x, _impN.y, _impN.z],
      color: [hot[0] * 0.95 + 0.30, hot[1] * 0.95 + 0.28, hot[2] * 0.95 + 0.26],
      dur: 0.22 + p * 0.18,
      r0: 0.20 + p * 0.16,
      r1: 0.82 + p * 1.35,
      opacity: 0.48 + p * 0.34,
      ring0: 0.18,
      ring1: 1,
      thick: 0.24 - p * 0.06,
    });
    this._spawn(RING, {
      x,
      y,
      z,
      dir: [_impN.x, _impN.y, _impN.z],
      color: [hot[0] * 0.7 + 0.42, hot[1] * 0.7 + 0.4, hot[2] * 0.7 + 0.36],
      dur: 0.28 + p * 0.22,
      r0: 0.32 + p * 0.22,
      r1: 1.05 + p * 1.9,
      opacity: 0.20 + p * 0.18,
      ring0: 0.34,
      ring1: 1,
      thick: 0.42,
    });
    // 3b. THE RAYS. The star above is a BILLBOARD, so its points always lie across the screen's own
    // axes — which is what makes it read at any camera, and also what makes it a drawing of a hit
    // rather than a thing happening in the world. These are the world's half of the same beat: a
    // handful of thick, short streaks thrown out from the contact in the plane the shock is
    // travelling through (square to the strike), so a blow that lands side-on to the camera throws
    // its spokes across the frame and one that lands straight away throws them INTO the picture.
    // They are GLINTs — a light being dragged outward, brightest at the root — and they are thrown
    // with a little outward speed so the rays spread as they die rather than sitting still.
    // Gated on power, like the second star: a jab is a snap, and this is what a finisher gets.
    if (p > 0.34) {
      const nr = 4 + Math.round(p * 4);
      const hotC = [1.15 + hot[0] * 0.5, 1.05 + hot[1] * 0.5, 0.9 + hot[2] * 0.5];
      _impR.crossVectors(_impN, _impT).normalize();
      for (let i = 0; i < nr; i++) {
        if (Math.random() > 0.85) continue;                   // a ragged edge rather than a pinwheel
        const a = (i / nr) * Math.PI * 2 + Math.random() * 0.5;
        _impD.copy(_impT).multiplyScalar(Math.cos(a)).addScaledVector(_impR, Math.sin(a)).normalize();
        const spd = 3.5 + p * 7;
        this._spawn(GLINT, {
          x, y, z,
          color: hotC,
          dur: 0.09 + p * 0.06,
          r0: 0.035 + p * 0.06,
          r1: 0.30 + p * 0.62 + Math.random() * 0.2,
          opacity: 0.5 + p * 0.45,
          dir: [_impD.x, _impD.y, _impD.z],
          vx: _impD.x * spd,
          vy: _impD.y * spd,
          vz: _impD.z * spd,
          drag: 6.5,
        });
      }
    }
    // 4. THE SPARKS. `sparkCone` is the whole of the cone, so the vault's hand-slap and the sweep
    // can throw the same sparks without pretending to be a punch.
    this.sparkCone(x, y, z, _impN, 11 + Math.round(16 * p * scale), 7 + 15 * (0.55 + 0.45 * p), p, hot);
    // 5. A little of whatever the blow was made of — a pale wash down the strike line, and `dust`
    // when the caller knows what surface is under it.
    this._spawn(GLINT, {
      x: x - _impN.x * 0.55,
      y: y - _impN.y * 0.55,
      z: z - _impN.z * 0.55,
      dir: [_impN.x, _impN.y, _impN.z],
      color: [1.0 + hot[0] * 0.3, 0.96 + hot[1] * 0.28, 0.9 + hot[2] * 0.26],
      dur: 0.13,
      r0: 0.16 + 0.22 * p,
      r1: 0.9 + 0.8 * p,
      opacity: 0.24 + 0.26 * p,
    });
    if (o.dust) {
      this.puff(x - _impN.x * 0.2, y - 0.1, z - _impN.z * 0.2, 1.1 + 1.9 * p, o.dust, 0.2 + 0.24 * p);
    }
  }

  // A cone of sparks down `dir` (a THREE.Vector3, already normalised). Each one is thrown at a
  // random angle inside a cone of `spread`, at a random speed, and is left to drag and fall — so the
  // burst opens out and arcs down, which is what makes a spark read as a thrown thing rather than as
  // a drawn line. Called by `impact`, and directly by the vault's plant and the slide's palm.
  //
  // They are SPARKs, not GLINTs (see the note on the kind): hot at the leading tip, tapering to a
  // tail. A quarter of them are thrown LONG and SLOW and live three times as long, which is what
  // gives a shower a few pieces the eye can follow instead of a uniform burst of identical flecks —
  // at this resolution the short fast ones are single frames, and it is the long ones that make the
  // shower read as SHOWER.
  sparkCone(x, y, z, dir, count, speed, power, color, spread) {
    const p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
    const n = Math.max(0, Math.round(count * this.fxScale));
    if (!n) return;
    const sp = spread === undefined ? 0.85 : spread;
    const c = color || [1, 0.88, 0.56];
    for (let i = 0; i < n; i++) {
      // Any axis square to the strike will do to build the cone from, and the up-axis one is tried
      // first because a punch thrown level would otherwise get a degenerate cross product.
      _impT.set(-dir.z, 0, dir.x);
      if (_impT.lengthSq() < 1e-6) _impT.set(1, 0, 0);
      _impT.normalize();
      _impD.crossVectors(dir, _impT).normalize();
      const a = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.6) * sp;
      _impD.multiplyScalar(Math.cos(a) * r).addScaledVector(_impT, Math.sin(a) * r).add(dir).normalize();
      // The long tail of the shower. `long` also gets more reach and less drag, so it flies on past
      // the body instead of dying in the same little sphere as the rest.
      const long = Math.random() < 0.26;
      const v = speed * (long ? 0.62 + Math.random() * 0.4 : 0.5 + Math.random() * 0.85);
      const len = long ? 0.42 + p * 0.6 + Math.random() * 0.4 : 0.16 + p * 0.28 + Math.random() * 0.16;
      this.sparks++;
      this._spawn(SPARK, {
        x,
        y,
        z,
        color: [
          c[0] * (1.3 + Math.random() * 0.55),
          c[1] * (1.3 + Math.random() * 0.55),
          c[2] * (1.3 + Math.random() * 0.55),
        ],
        dur: long ? 0.5 + Math.random() * 0.4 : 0.20 + Math.random() * 0.26,
        r0: (long ? 0.010 : 0.014) + p * 0.018 + Math.random() * 0.012,
        r1: len,
        opacity: 0.6 + p * 0.4,
        dir: [_impD.x, _impD.y, _impD.z],
        vx: _impD.x * v,
        vy: _impD.y * v,
        vz: _impD.z * v,
        drag: long ? 1.7 + Math.random() * 1.1 : 3.4 + Math.random() * 1.8,
        grav: 13 + Math.random() * 7,
        follow: true,
      });
    }
  }

  // THE VAULT's three beats (see `startVault` / the `vault` case in player.js).
  //
  // The plant: a hand goes down on the top of the box and takes the body's weight, so it is a slap
  // on a surface — a flat ring on the top, the box's own dust, a fistful of sparks (small, because a
  // palm on a rail is a scuff and not a strike), and, the part that actually sells it, a short
  // SCRAPE down the line the body is travelling: the palm does not land and stop, it lands and
  // SLIDES, which is the difference between the two marks on the box that a real vault leaves.
  vaultPlant(x, y, z, power, color, dx, dz) {
    const p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
    const c = color || [0.92, 0.9, 0.85];
    const l = Math.hypot(dx || 0, dz || 0) || 1;
    const nx = (dx || 0) / l;
    const nz = (dz || 0) / l;
    this._spawn(RING, {
      x,
      y: y + 0.03,
      z,
      color: [c[0] * 0.6 + 0.45, c[1] * 0.6 + 0.44, c[2] * 0.6 + 0.42],
      dur: 0.3,
      r0: 0.2,
      r1: 1.4 + p * 1.2,
      opacity: 0.5,
      ring0: 0.2,
      ring1: 1,
      thick: 0.4,
    });
    this._spawn(PUFF, {
      x,
      y: y + 0.06,
      z,
      color: c,
      dur: 0.26,
      r0: 0.4,
      r1: 1.3 + p * 1.2,
      opacity: 0.42,
    });
    // ...and the scrape: a thin bright smear laid along the travel line on the box top, brightest at
    // the palm and dying back behind it. Drawn as a GLINT (a light on a surface, not a light in the
    // air) so it reads as the box being scuffed rather than as a spark thrown off it.
    this._spawn(GLINT, {
      x: x - nx * 0.10,
      y: y + 0.02,
      z: z - nz * 0.10,
      dir: [-nx, 0.05, -nz],
      color: [1.0, 0.97, 0.9],
      dur: 0.22,
      r0: 0.06 + p * 0.06,
      r1: 0.55 + p * 0.75,
      opacity: 0.34 + p * 0.24,
    });
  }

  // The whoosh: the body crossing the box, drawn as coarse air rather than as particles — a couple
  // of cards laid along the line of travel, a few long thin glints down the same line, and two AIR
  // RINGS that leave the box behind on either side (the air closing over the space the body just
  // stopped occupying). Without the rings the crossing is only legible as a body-shaped smudge; with
  // them it is legible as the body having GONE somewhere.
  vaultWhoosh(x, y, z, dx, dz, power) {
    const p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
    const l = Math.hypot(dx, dz) || 1;
    const nx = dx / l;
    const nz = dz / l;
    // ONE card per pulse, and a faint one. A wind sheet is a camera-facing card, so a chase camera
    // sitting behind the body sees the stacking of them nearly FACE-ON — half a dozen of these at any
    // real opacity reads as a white funnel wrapped around the player rather than as air being split.
    // The rings and the glints carry the crossing; the card is only there to suggest the body has a
    // wake at all.
    this._spawn(SHEET, {
      x: x + (Math.random() - 0.5) * 0.5,
      y: y + (Math.random() - 0.3) * 0.35,
      z: z + (Math.random() - 0.5) * 0.5,
      dir: [nx, 0.06, nz],
      color: [0.88, 0.92, 1.0],
      dur: 0.16 + Math.random() * 0.08,
      r0: 0.30 + p * 0.22,
      r1: 0.95 + p * 0.8,
      opacity: 0.11 + p * 0.09,
    });
    // The rings: square to the line of travel, thrown out sideways where the body has just been, so
    // they read as the box being left behind rather than as the body being wrapped in air.
    // The ring: square to the line of travel, thrown out where the body has just been, so it reads as
    // the box being left behind rather than as the body being wrapped in air. One per pulse is
    // enough — from a chase camera these are seen face-on, so a stack of them is a stack of circles.
    this._spawn(RING, {
      x: x - nx * 0.3,
      y: y + 0.02,
      z: z - nz * 0.3,
      dir: [nx, 0.04, nz],
      color: [0.86, 0.92, 1.05],
      dur: 0.22 + Math.random() * 0.08,
      r0: 0.30,
      r1: 1.0 + p * 0.9,
      opacity: 0.16 + p * 0.14,
      ring0: 0.22,
      ring1: 1,
      thick: 0.34,
    });
    const n = Math.round((2 + 3 * p) * this.fxScale);
    for (let i = 0; i < n; i++) {
      this._spawn(GLINT, {
        x: x - nx * Math.random() * 1.1 + (Math.random() - 0.5) * 0.5,
        y: y + (Math.random() - 0.4) * 0.6,
        z: z - nz * Math.random() * 1.1 + (Math.random() - 0.5) * 0.5,
        dir: [-nx, 0.05, -nz],
        color: [0.95, 0.98, 1.05],
        dur: 0.16 + Math.random() * 0.12,
        r0: 0.02 + p * 0.02,
        r1: 0.7 + Math.random() * 1.1,
        opacity: 0.3 + p * 0.3,
      });
    }
  }

  // ...and the far side: the body comes down on the deck still running, so it is a LANDING's mark
  // (a flat ring and the deck's own dust) with the strength of the vault's exit speed on it.
  //
  // It used to carry a bright GLOW on the deck — "the one frame of a vault where the body is
  // actually HEAVY" — and a small spark cone with it. Both are gone: a vault is a stride across
  // something, and a bloom plus thrown sparks is a body ARRIVING on the deck, which is exactly the
  // impact the user asked to be rid of (*"...make it smooth and fluent"*; see the notes in
  // `startVault` and the `vault` case in player.js). The ring and the dust stay: the deck still
  // gets marked, it just is not struck.
  // (Session 131 removed the hand-tuned body from here: it was the same thin ring plus a puff of
  // the deck's own dust that `landDust` already draws, and a landing that is drawn by two different
  // functions is a landing that drifts apart from itself. It now calls `landDust` — the shared
  // landing mark — at four fifths of the caller's power, which keeps the vault's own exit speed on
  // the mark without letting a stride across a box ring out like a body being put down.)
  vaultLand(x, y, z, power, color) {
    const p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
    this.landDust(x, y, z, p * 0.8, color || [0.9, 0.89, 0.84]);
  }

  // THE CROSSING'S OWN LINE USED TO BE DRAWN HERE, and it is REMOVED at the user's request —
  // *"remove the trail for the vault mech"*. `vaultWake` fed a `Ribbon` (max 28, life 0.30, view
  // mode) down the body's own path EVERY frame and threw a couple of bright RAKES back along it
  // every ~60 ms (the pool's `vaultRakes` counter, and the strip's own `vaultRib` / `vaultActive` /
  // `vaultGap` / `vaultT` bookkeeping in the constructor, in `update` and in `clear` — all of it is
  // gone with the method, so `GAME.fx()` publishes no `rakes` count any more).
  //
  // WHY it had to go: the vault is the only move on the deck that left a line in the air — an
  // ordinary running JUMP leaves neither a ribbon nor rakes — and a strip drawn through the space
  // the body passed is a SPEED effect, the same vocabulary the slide's and the dive's wakes speak.
  // The vault is a stride over a box, and it is already read by the plant, the whoosh and the
  // landing; the line on top of those made it the one move that looked like it was moving fast
  // rather than crossing something. It is the same read as the strike vocabulary removed from this
  // move in session 93 (see the note above and "The running vault" in src/README.md).
  //
  // What the crossing keeps is its three EVENT beats — `vaultPlant` above, `vaultWhoosh`, and
  // `vaultLand` below — each fed on its own timer rather than every frame: the plant's ring, dust
  // and scrape on the box top, the single faint card + air ring + glints of the crossing every
  // 75 ms, and the landing's ring and dust on the far deck. The `Ribbon` class itself is untouched:
  // the dive's contrails and the pole's swing bands still use it (see "The trails" in README.md).

  // ------------------------------------------------------------------------------------------
  // The slide (`slideWake`) and the dive/launch (`diveWake`) are the two moves whose speed is
  // shown by VFX rather than by a pose cycle — both poses are STILLS on purpose (see `poseSlide`
  // / `poseDive`). They are called EVERY FRAME while the move is live (the rate limiting lives in
  // here, not in the caller) and each does three things: it lays the move's own air (the dive's
  // limb ribbons and the wind sheets ahead of the body), it emits a rate-limited burst of the
  // small fast particles, and it scales all of it off the speed the move is actually carrying.
  // ------------------------------------------------------------------------------------------

  // The slide's three deck contacts, in the body's own (forward, right) frame with the deck at
  // the body's base — MEASURED off the posed mesh (the lowest vertices of the lead foot, the
  // trailing knee and the planted palm; see the slide note in src/README.md for the sweep that
  // authored the pose). `w` is how much grit that contact throws: the lead foot is skimming and
  // tears up the most, the knee is grinding, and the palm mostly kicks sparks.
  //
  // s12: (f 0.80, r 0.60) — lead foot. (f -0.19, r -0.23) — knee. (f -0.05, r -0.52) — palm.
  slideWake(dt, x, y, z, fx, fz, power, color) {
    const p = Math.max(0, Math.min(1, power));
    const c = color || [0.93, 0.92, 0.86];
    // The colours. `color` is the DECK's own colour — `main.js` samples it with
    // `World.surfaceColorAt` — so the grit a slide throws is the stuff it is grinding: a hint of
    // grass on grass, a hint of ash on ash. It is lifted hard toward WHITE here (the grit off the
    // reference is white, not a shade of the floor), so what the deck contributes is a TINT rather
    // than the colour. (This used to be the biome's fog dust, which is a warm beige: it read as
    // grit on a meadow and as meadow on everything else — a slide on a painted slab sprayed
    // grass.)
    const gritC = [c[0] * 0.34 + 0.62, c[1] * 0.34 + 0.62, c[2] * 0.34 + 0.60];
    const puffC = [gritC[0] * 0.86, gritC[1] * 0.855, gritC[2] * 0.84];
    // The slide lays NO trail (it was removed at the user's request — see src/SPEC.md, session
    // 24). A strip on the deck is the one thing a slide makes that is still there when the move
    // is over, and the reviewer wanted the slide to be grit and air, not a mark on the ground.
    // Everything below is the burst: the grit, the sparks and the plume.
    // A hard sliding contact is a SPARK source: the fast white grit is what tells the eye the
    // body is grinding rather than gliding.
    this.slideT -= dt;
    if (this.slideT > 0) return;
    this.slideT = 0.060 - p * 0.024;
    // 1. Grit torn off the deck. Each contact throws its own pieces, BACK along the slide's own
    //    line and fanned out to either side, each with gravity of its own so it arcs over and
    //    skitters away — a hard slide is a spray of stones, not a haze. The pieces are fat and
    //    bright on purpose: this game draws the slide at 224 lines, where a 4cm chip is a
    //    sub-pixel, so anything that is going to be *seen* has to be a visible lump.
    for (const ct of SLIDE_CONTACTS) {
      const cx = x + fx * ct.f + fz * ct.r;
      const cz = z + fz * ct.f - fx * ct.r;
      const n = ct.n + (p > 0.5 && ct.w > 0.9 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const fan = (Math.random() - 0.5) * (1.2 + p * 1.1);
        const back = 0.55 + Math.random() * 0.8;
        let ax = -fx * back + fz * fan;
        let az = -fz * back - fx * fan;
        const al = Math.hypot(ax, az) || 1;
        ax /= al;
        az /= al;
        const up = 0.16 + Math.random() * (0.20 + p * 0.55);
        const sp = 3.0 + p * 7.5 + Math.random() * 2.6;
        const dur = 0.24 + p * 0.22 + Math.random() * 0.08;
        const vy = up * sp;
        this._spawn(STREAK, {
          x: cx + (Math.random() - 0.5) * 0.16,
          y: y + 0.04 + Math.random() * 0.07,
          z: cz + (Math.random() - 0.5) * 0.16,
          // Dirt, not light: the chips are clods of the deck coming apart. The only thing the
          // slide makes that is brighter than the dust is a spark (below), and it stays rare
          // enough to mean something.
          color: gritC,
          dur,
          r0: (0.095 + p * 0.075) * ct.w,
          r1: 0.50 + p * (1.20 + ct.w * 0.60),
          opacity: 0.48 + p * 0.44,
          dir: [ax, up, az],
          vx: ax * sp,
          vy,
          vz: az * sp,
          // The arc LANDS: gravity is tuned to the throw so the chip is back at deck level
          // exactly as it fades, rather than sailing off below the ground it came from.
          fall: vy * dur,
        });
      }
    }
    // 2. The sparks. Only a real grind makes them, so they are gated on power, and they are the
    //    one ADDITIVE thing on the slide — a spark that is merely light grey reads as grit.
    if (p > 0.50 && Math.random() < 0.4) {
      const ct = SLIDE_CONTACTS[Math.random() < 0.6 ? 1 : 2];
      const cx = x + fx * ct.f + fz * ct.r;
      const cz = z + fz * ct.f - fx * ct.r;
      const fan = (Math.random() - 0.5) * 1.4;
      let ax = -fx + fz * fan;
      let az = -fz - fx * fan;
      const al = Math.hypot(ax, az) || 1;
      ax /= al;
      az /= al;
      const sp = 5 + Math.random() * 9;
      const dur = 0.16 + Math.random() * 0.16;
      const vy = 2.2 + Math.random() * 3.4;
      this._spawn(GLINT, {
        x: cx,
        y: y + 0.03,
        z: cz,
        color: [1.0, 0.94, 0.72],
        dur,
        r0: 0.018 + Math.random() * 0.016,
        r1: 0.45 + p * 1.15,
        opacity: 0.55 + p * 0.45,
        dir: [ax, 0.18 + Math.random() * 0.5, az],
        vx: ax * sp,
        vy,
        vz: az * sp,
        fall: vy * dur,
      });
    }
    // 3. The rooster tail. Camera-facing sprites, because the plume behind a sliding body is
    //    read as a VOLUME and a ground disc seen down the body's length is a line. They are
    //    thrown back and slightly up and left to churn, which is what gives the slide its wake.
    const puffs = 1 + (Math.random() < p * 0.55 ? 1 : 0);
    for (let k = 0; k < puffs; k++) {
      // The plume is THROWN, not left where it was made: its velocity is mostly backward along
      // the slide, so a run of them stacks up into a long cloud trailing out behind the body
      // instead of a soft smudge sitting on the hips. It is also the one part of the slide that
      // rises clear of the character's own silhouette, which is worth more than its area: at a
      // chase camera most of what happens on the deck is hidden behind the body.
      const side = (Math.random() - 0.5) * (0.5 + p * 0.55);
      const back = 0.08 + Math.random() * 0.34;
      const sp = 2.4 + p * 5.2;
      this._spawn(SPRITE, {
        x: x - fx * back + fz * side,
        y: y + 0.10 + Math.random() * (0.10 + p * 0.34),
        z: z - fz * back - fx * side,
        color: puffC,
        dur: 0.36 + p * 0.30,
        // Small and DENSE rather than large and thin. At a chase camera the body is only about
        // four units away, so a puff of unit radius covers a third of the frame on its own: a
        // dozen of those at low alpha is a fog bank, not a plume. (Measured at midnight, where
        // the contrast shows what the daylight wash hides: the wide version covered 30% of the
        // screen.) The same total density in smaller, stronger puffs reads as churned-up dust.
        r0: 0.13 + p * 0.11,
        r1: 0.30 + p * (0.26 + Math.random() * 0.26),
        opacity: 0.30 + p * 0.24,
        vx: -fx * sp + (Math.random() - 0.5) * 1.2,
        vy: 0.8 + p * (1.1 + Math.random() * 0.9),
        vz: -fz * sp + (Math.random() - 0.5) * 1.2,
        fall: 0.10,
      });
    }
  }

  // The dive's wind. `dx/dy/dz` is the unit flight direction; the rakes are thrown BACK along the
  // flight line from points AROUND the body, which is the one thing a chase camera can read as
  // speed — a wake is mostly hidden behind the body it belongs to, so the lines have to be raked
  // past its silhouette.
  //
  // The trail itself is fed in one of two ways. With `pts` (an array of world points, one per
  // tracked body part — see `divePartPoints` in main.js) every part gets its OWN thin ribbon and
  // the wind SHEETS are laid ahead of the body — that is what both the DIVE and the LAUNCH fly
  // on now, so the pad's flight has the wind the same way the dive does. Without `pts`, the
  // single body-centred strip is the fallback (anything that wants a plain body wake).
  diveWake(dt, x, y, z, dx, dy, dz, power, color, pts) {
    const p = Math.max(0, Math.min(1, power));
    const c = color || DIVE_WIND;
    this.diveActive = true;
    if (pts && pts.length) {
      // PER-PART. A dozen of these at the body ribbon's weight is a white smear over the whole
      // character rather than a set of lines, so each one is NARROW (a tenth of a unit or so,
      // against the body strip's half-metre), more TRANSPARENT (0.16-0.32 against 0.50-0.84) and
      // PLAINER (lane strength 0.35, against the body strip's 1.0). There are FOUR of them — the
      // two hands and the two shoes (see TRAIL_PARTS in main.js); the torso, hips, shoulders,
      // elbows and knees that used to carry their own line as well are gone, because four lines
      // beside a body read as wind and thirteen read as a white cage, and the head's own line was
      // removed at the user's request in session 66.
      //
      // Every line is fed ON the part it belongs to — its newest sample IS the shoe or the hand —
      // so a ribbon reads as something coming off that limb and nothing else. It used
      // to be pushed AHEAD along the flow (`0.32 + p * 0.80`, up to a unit), to buy visibility at
      // a chase camera: the tip then arrived from in front of the limb, where the body could not
      // hide it. But the head of such a line hangs in the air a body-length in front of the shoe
      // or hand it is supposed to come off, so from behind — the only angle this game is played
      // from — every contrail looks like it has come loose rather than like wind (the user:
      // "the trails are not sticking to the specific body parts they are attached to"). A ribbon
      // is a HISTORY of where the part has been, so its head is where the part IS (see `feed`:
      // the new sample is only skipped when the part has moved less than `minStep`, 5 cm, which
      // is a fraction of the ribbon's own width). The wind is still arriving from the front — that
      // is what the `SHEET` cards ahead of the body are for, and they belong to no limb.
      for (let i = 0; i < pts.length; i++) {
        let rib = this.diveParts[i];
        if (!rib) {
          rib = this.diveParts[i] = new Ribbon(this.scene, { max: 18, life: 0.38, mode: "view", minStep: 0.05 });
          this.divePartGap[i] = 0;
        } else if (this.divePartGap[i] > 0) rib.reset();
        this.divePartGap[i] = 0;
        this.divePartFed[i] = true;
        rib.setTone(
          // A limb's contrail is LIGHT, not a shadow: the core tone is only a couple of stops
          // under the rim, so the line never darkens the sky or the deck behind it. (The body
          // wake keeps its dim compression core — see below — but a dozen of those over each
          // other reads as a grey cage around the character.)
          [c[0] * 0.60, c[1] * 0.63, c[2] * 0.70],
          [Math.min(1, c[0] * 1.0), Math.min(1, c[1] * 1.02), Math.min(1, c[2] * 1.05)],
          0.15 + p * 0.13,
          0.35
        );
        rib.half = 0.065 + p * 0.075;
        const q = pts[i];
        rib.feed(q.x, q.y, q.z);
      }
      // ---- THE WIND SHEETS ("wind meshes from the front") -----------------------------------
      // A card of still air laid across the body's own path a couple of units ahead of it, which
      // the body then flies THROUGH: it is spawned with almost no velocity of its own, because the
      // world's air is not moving — the body is. They are the one part of the wind that cannot be
      // hidden by the body, because they are in front of it, so a chase camera looking straight up
      // the flight line gets all of them.
      this.sheetT -= dt;
      if (this.sheetT <= 0) {
        // Sparse on purpose. A sheet lives about a fifth of a second, so a tighter interval than
        // this stacks a dozen cards in front of the body — and a dozen ADDED cards at any alpha
        // is the halo this whole game is built to avoid. At full power this is one card every
        // 75 ms, so four or five are in the air at once.
        this.sheetT = 0.14 - p * 0.065;
        const n = 1 + (Math.random() < p * 0.4 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const src = pts[(Math.random() * pts.length) | 0];
          // The card belongs in front of THAT shoe or THAT hand, so it is placed on the part's own
          // offset from the body — squared to the flow. That is what rings the sheets around the
          // body instead of stacking them all on its spine.
          _wsO.set(src.x - x, src.y - y, src.z - z);
          _wsF.set(dx, dy, dz);
          _wsO.addScaledVector(_wsF, -_wsO.dot(_wsF));
          if (_wsO.lengthSq() < 0.04) {
            _wsO.crossVectors(_wsF, _fxUp);
            if (_wsO.lengthSq() < 1e-6) _wsO.set(1, 0, 0);
          }
          _wsO.normalize();
          // A little fan, so successive cards never sit in one another's plane.
          _wsO.applyAxisAngle(_wsF, (Math.random() - 0.5) * 0.8);
          // OUT past the silhouette on purpose, exactly the way the rakes above are placed: a
          // card drawn where the body's own pixels are cannot be seen, and at a chase camera the
          // body sits dead centre. The reach is what puts a sheet on the frame's edge, where the
          // eye catches it coming.
          const ahead = 0.9 + Math.random() * 2.2;
          const out = 1.0 + Math.random() * 1.6;
          // Long and thin: a gust read at 224 lines is a STREAK, not a card. A square of the same
          // area reads as fog, and fog in front of a body is a smudge, not wind.
          const along = 1.6 + p * 2.4 + Math.random() * 0.8;
          const push = 0.6 + Math.random() * 0.8;
          this._spawn(SHEET, {
            x: x + dx * ahead + _wsO.x * out,
            y: y + dy * ahead + _wsO.y * out,
            z: z + dz * ahead + _wsO.z * out,
            color: c,
            dur: 0.16 + Math.random() * 0.14,
            // `r0` is the width ACROSS the flow, `r1` the length ALONG it (see `_spawn`), so a
            // sheet is a long thin gust rather than a square of fog.
            r0: along * 0.18,
            r1: along,
            opacity: 0.14 + p * 0.18 + Math.random() * 0.05,
            dir: [dx, dy, dz],
            // A touch of outward drift and a slow rise, so a card is not perfectly frozen.
            vx: _wsO.x * push,
            vy: _wsO.y * push + 0.25,
            vz: _wsO.z * push,
          });
        }
      }
    } else {
      if (!this.diveRib) this.diveRib = new Ribbon(this.scene, { max: 40, life: 0.55, mode: "view", minStep: 0.10 });
      else if (this.diveGap > 0) this.diveRib.reset();
      this.diveGap = 0;
      // The wake is a COMPRESSION streak, not a pale smear: air torn open in the body's path is
      // denser than the air around it, so the core goes dim and the rims stay bright. That is
      // also what keeps it visible — a dive spends most of its life against a bright sky, where a
      // pale ribbon at low alpha is nothing at all (measured: an earlier version came back from
      // review as "no trail or wake" while it was covering 0.3% of the frame). The bright speed
      // lines the shader lays down the middle are what carry the reference's look without giving
      // up that contrast: white lines read on the sky AND on the deck, a white ribbon on the sky
      // does not.
      this.diveRib.setTone(
        [c[0] * 0.36, c[1] * 0.39, c[2] * 0.44],
        [Math.min(1, c[0] * 1.05), Math.min(1, c[1] * 1.05), Math.min(1, c[2] * 1.05)],
        0.50 + p * 0.34,
        1.0
      );
      // WIDER than the body. A chase camera looks straight down the wake, so a tube the width of
      // the body is almost entirely hidden by the body: the only part of it that can be seen is
      // whatever sticks out either side.
      this.diveRib.half = 0.45 + p * 0.55;
      this.diveRib.feed(x, y, z);
    }
    this.diveT -= dt;
    if (this.diveT > 0) return;
    this.diveT = 0.048 - p * 0.024;
    _dv1.set(dx, dy, dz);
    _dv2.crossVectors(_dv1, _fxUp);
    if (_dv2.lengthSq() < 1e-6) _dv2.set(1, 0, 0);
    _dv2.normalize();
    _dv3.crossVectors(_dv1, _dv2).normalize();
    // 1. The rakes. A ring of them around the body at a random angle, each thrown straight back
    //    with a small outward flare, length and brightness set by the speed. Two or three of
    //    them sit well clear of the silhouette so the lines cut past the body rather than
    //    hiding behind it.
    const n = 1 + Math.round(p * 2.4);
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * Math.PI * 2;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const ox = _dv2.x * ca + _dv3.x * sa;
      const oy = _dv2.y * ca + _dv3.y * sa;
      const oz = _dv2.z * ca + _dv3.z * sa;
      const far = k === 0 && Math.random() < 0.5;
      // Out past the silhouette on purpose. A rake drawn through the body's own pixels is
      // invisible at best and, being ADDED, piles up with the others into a bright blob behind
      // the body at worst — which is a halo, and a halo is exactly what this game is not.
      const rad = far ? 1.2 + Math.random() * 1.5 : 0.45 + Math.random() * 0.60;
      const flare = 0.05 + Math.random() * 0.13;
      let ax = -dx + ox * flare;
      let ay = -dy + oy * flare;
      let az = -dz + oz * flare;
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al;
      ay /= al;
      az /= al;
      const sp = 7 + p * 17;
      this._spawn(GLINT, {
        x: x + ox * rad,
        y: y + oy * rad,
        z: z + oz * rad,
        color: c,
        dur: 0.15 + p * 0.16 + Math.random() * 0.06,
        r0: (far ? 0.010 : 0.016) + p * 0.024,
        r1: (far ? 1.1 : 0.65) + p * (far ? 3.6 : 2.4),
        opacity: (far ? 0.10 : 0.16) + p * 0.30,
        dir: [ax, ay, az],
        vx: ax * sp,
        vy: ay * sp,
        vz: az * sp,
      });
    }
    // 2. The condensation. Sprites hugging the body — close in, quick, and faint, so they read
    //    as air coming apart on the body rather than as smoke it is emitting.
    if (p > 0.25 && Math.random() < 0.45) {
      const ang = Math.random() * Math.PI * 2;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const rad = 0.45 + Math.random() * 0.55;
      const sp2 = 1.6 + p * 3.8;
      this._spawn(SPRITE, {
        x: x + (_dv2.x * ca + _dv3.x * sa) * rad,
        y: y + (_dv2.y * ca + _dv3.y * sa) * rad,
        z: z + (_dv2.z * ca + _dv3.z * sa) * rad,
        color: c,
        dur: 0.26 + p * 0.26,
        r0: 0.20 + p * 0.20,
        r1: 0.55 + p * 0.75,
        opacity: 0.12 + p * 0.16,
        vx: -dx * sp2,
        vy: -dy * sp2,
        vz: -dz * sp2,
      });
    }
    // 3. The rush past the LENS. A rake thrown back from the body is fighting the chase camera
    //    for the same few pixels as the body itself; one thrown back from BEHIND the body is
    //    already next to the camera when it is born, so it crosses the whole frame in a couple
    //    of frames and is gone. That is the part of a dive that is felt rather than watched,
    //    and at a chase camera it is the only element that cannot be hidden by the body.
    if (p > 0.30 && Math.random() < 0.55) {
      const back = 2.2 + Math.random() * 2.6;
      const side = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.7);
      const up = (Math.random() - 0.35) * 1.2;
      const ox = _dv2.x * side + _dv3.x * up;
      const oy = _dv2.y * side + _dv3.y * up;
      const oz = _dv2.z * side + _dv3.z * up;
      const flare = 0.06 + Math.random() * 0.14;
      let ax = -dx + ox * flare;
      let ay = -dy + oy * flare;
      let az = -dz + oz * flare;
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al;
      ay /= al;
      az /= al;
      const sp = 18 + p * 34;
      this._spawn(GLINT, {
        x: x - dx * back + ox,
        y: y - dy * back + oy,
        z: z - dz * back + oz,
        color: c,
        dur: 0.10 + p * 0.10,
        r0: 0.018 + p * 0.020,
        r1: 2.2 + p * 4.5,
        opacity: 0.16 + p * 0.30,
        dir: [ax, ay, az],
        vx: ax * sp,
        vy: ay * sp,
        vz: az * sp,
      });
    }
  }

  // ---- THE GROUND SLAM's own embers ----------------------------------------------------------
  // The drop flies the dive's per-part wake drawn in fire (main.js hands it `SLAM_FIRE`), but a wake
  // is a HISTORY of where a body has been: it reads as movement, not as burning. What the reference
  // for the drop (session 51) has is FIRE ON THE BODY — a body coming down inside its own trail —
  // so this is the one thing the slam owns that no other move has: a rate-limited stream of embers
  // thrown off the body's flanks, OUT past the silhouette (a spark drawn where the body's own pixels
  // are is invisible from a chase camera, which is the only camera this game has), left to rise and
  // die behind a body that is already forty units below them.
  //
  // Two kinds, because one is a line and the other is a glow: the glint is the spark's streak of
  // travel and the sprite is the ember itself, and the mix is what stops a stream of identical marks
  // from reading as a texture. Both are ADDED (see `_take`), so the whole effect brightens the fall
  // rather than darkening the sky behind it.
  slamWake(dt, x, y, z, power) {
    const p = Math.max(0, Math.min(1, power));
    this.slamT -= dt;
    if (this.slamT > 0) return;
    this.slamT = 0.032 - p * 0.014;
    const n = 1 + (Math.random() < p * 0.7 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rad = 0.40 + Math.random() * 0.70;
      const ex = x + ca * rad;
      const ey = y + (Math.random() - 0.30) * 0.9;
      const ez = z + sa * rad;
      const life = 0.22 + Math.random() * 0.28;
      // The spark's own line of travel: outward from the body and UP, which is what fire does while
      // everything around it is falling.
      const ux = ca * (0.5 + Math.random() * 0.7);
      const uy = 1.3 + Math.random() * 1.9;
      const uz = sa * (0.5 + Math.random() * 0.7);
      const ul = Math.hypot(ux, uy, uz) || 1;
      this._spawn(GLINT, {
        x: ex, y: ey, z: ez,
        color: [1.30, 0.86, 0.40],
        dur: life * 0.75,
        r0: 0.020 + p * 0.022,
        r1: 0.28 + p * 0.55,
        opacity: 0.30 + p * 0.34,
        dir: [ux / ul, uy / ul, uz / ul],
        vx: ux, vy: uy, vz: uz,
      });
      if (Math.random() < 0.55) {
        this._spawn(SPRITE, {
          x: ex, y: ey, z: ez,
          // Cooler and dimmer than the streak: it is the coal, not the flame.
          color: [1.10, 0.52, 0.16],
          dur: life,
          r0: 0.10 + p * 0.10,
          r1: 0.26 + p * 0.26,
          opacity: 0.20 + p * 0.22,
          vx: ux * 0.55, vy: uy * 0.55, vz: uz * 0.55,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // THE WHIRL's OWN ENERGY (skill 1 — see `player.whirl` and the feed in main.js). The move comes
  // with *"blue energy effects around the fists/arms"*, and this is the one part of it that is not
  // the body: it is fed off the two HANDS while the whirl has a body in them, so the light sits on
  // the arm DOING the holding rather than on the body as a whole.
  //
  // It is deliberately SMALL and additive — a sheen on the forearm, not a fireball. The fists are
  // moving at whirlwind speed, and anything bigger than this turns the fastest part of the move
  // into a smear. Both kinds are ADDED (see `_take`), so the aura brightens the limb rather than
  // dimming what is behind it, and the rate limiting is inside the effect, as it is for the other
  // two continuous emitters — main.js feeds it every frame.
  // ---------------------------------------------------------------------------
  // THE SWING MESH — the strip the staff sweeps, fed from the two ends of the shaft itself.
  //
  // The user's *"add a swing mesh vfx"*. A stick two metres long moving at thirty units a second is
  // the one weapon in this game that leaves a MARK IN THE AIR rather than a puff at the impact: the
  // tip's own path is an arc, and the butt's is a smaller one, so two ribbons fed off the two ends
  // of the same read (`player.poleShaftA/B`, which is also the hitbox — see `poleContact`) draw the
  // band the shaft is covering and nothing else. That is why it is fed from the SHAFT rather than
  // from a bone: whatever the pose and the prop agree the stick is on is what the mesh is drawn on,
  // so the two cannot come apart.
  //
  // The rate is limited by the ribbon's own `minStep`, so a slow guard beat feeds nothing at all and
  // only the whirls and the chops — the beats that are actually moving — lay strip down. `power` is
  // the tip's own speed, normalised by main.js, and it drives the width and the brightness, so the
  // mesh keeps up with the strike instead of being uniformly bright.
  staffSwing(ax, ay, az, bx, by, bz, power) {
    if (!this.poleRibT) {
      this.poleRibT = new Ribbon(this.scene, { max: 30, life: 0.19, mode: "view", minStep: 0.085, additive: true });
      this.poleRibB = new Ribbon(this.scene, { max: 22, life: 0.16, mode: "view", minStep: 0.085, additive: true });
    }
    const p = Math.max(0, Math.min(1, power));
    this.poleRibT.setTone([0.26, 0.24, 0.19], [0.88, 0.79, 0.58], 0.21 + 0.26 * p, 1.0);
    this.poleRibT.half = 0.09 + 0.16 * p;
    this.poleRibT.feed(bx, by, bz);
    this.poleRibB.setTone([0.17, 0.17, 0.19], [0.58, 0.64, 0.80], 0.10 + 0.16 * p, 1.0);
    this.poleRibB.half = 0.06 + 0.10 * p;
    this.poleRibB.feed(ax, ay, az);
  }

  whirlAura(dt, x, y, z, power) {
    const p = Math.max(0, Math.min(1, power));
    this.whirlT -= dt;
    if (this.whirlT > 0) return;
    this.whirlT = 0.024 - p * 0.008;
    const a = Math.random() * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rad = 0.05 + Math.random() * 0.15;
    const ex = x + ca * rad;
    const ey = y + (Math.random() - 0.35) * 0.20;
    const ez = z + sa * rad;
    // The spark's own line: outward off the limb and a little UP — energy coming off the arm
    // rather than blowing along it.
    const ux = ca * (0.4 + Math.random() * 0.6);
    const uy = 0.5 + Math.random() * 0.9;
    const uz = sa * (0.4 + Math.random() * 0.6);
    const ul = Math.hypot(ux, uy, uz) || 1;
    this._spawn(GLINT, {
      x: ex, y: ey, z: ez,
      color: [0.42, 0.68, 1.45],
      dur: 0.12 + Math.random() * 0.12,
      r0: 0.014 + p * 0.014,
      r1: 0.16 + p * 0.24,
      opacity: 0.34 + p * 0.30,
      dir: [ux / ul, uy / ul, uz / ul],
      vx: ux, vy: uy, vz: uz,
    });
    if (Math.random() < 0.45) {
      this._spawn(SPRITE, {
        x: ex, y: ey, z: ez,
        // Cooler and dimmer than the streak: it is the glow, not the spark.
        color: [0.32, 0.52, 1.15],
        dur: 0.14 + Math.random() * 0.14,
        r0: 0.05 + p * 0.05,
        r1: 0.12 + p * 0.12,
        opacity: 0.20 + p * 0.20,
        vx: ux * 0.4, vy: uy * 0.5, vz: uz * 0.4,
      });
    }
  }

  // THE HEAVE's own grip: hot gold-white glints crawling off the one fist holding the
  // sternum, fed every frame the hold lasts. Rate-limited inside like the other continuous
  // emitters; `power` ramps with the hold so the gathering visibly builds toward the throw.
  heaveHold(dt, x, y, z, power) {
    const p = Math.max(0, Math.min(1, power == null ? 1 : power));
    if (p <= 0.01) return;
    this.heaveT -= dt;
    if (this.heaveT > 0) return;
    this.heaveT = 0.05 - p * 0.028;
    const a = Math.random() * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const rad = 0.04 + Math.random() * 0.10;
    const ex = x + ca * rad;
    const ey = y + (Math.random() - 0.5) * 0.16;
    const ez = z + sa * rad;
    const ux = ca * (0.5 + Math.random() * 0.7);
    const uy = 0.7 + Math.random() * 1.0;
    const uz = sa * (0.5 + Math.random() * 0.7);
    const ul = Math.hypot(ux, uy, uz) || 1;
    this._spawn(GLINT, {
      x: ex, y: ey, z: ez,
      color: [1.45, 1.12, 0.55],
      dur: 0.10 + Math.random() * 0.10,
      r0: 0.012 + p * 0.014,
      r1: 0.14 + p * 0.22,
      opacity: 0.40 + p * 0.35,
      dir: [ux / ul, uy / ul, uz / ul],
      vx: ux, vy: uy, vz: uz,
    });
    if (Math.random() < 0.5) {
      this._spawn(SPRITE, {
        x: ex, y: ey, z: ez,
        color: [1.15, 0.85, 0.42],
        dur: 0.12 + Math.random() * 0.12,
        r0: 0.04 + p * 0.05,
        r1: 0.10 + p * 0.12,
        opacity: 0.22 + p * 0.22,
        vx: ux * 0.4, vy: uy * 0.5, vz: uz * 0.4,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // THE RING OF STARS over a DAZED body's head (the user's *"when he stands on his feet he does a
  // cartoony dizzy animtion and a ring of starts spin over his head"* — see `Enemy.dizzy` and the
  // feed in main.js). This is the CARTOON half of the move and it is deliberately not physical: a
  // ring of little sparks going round and round in the air over a head that is wobbling underneath
  // them, which is the oldest way there is of drawing "he is seeing stars".
  //
  // It is fed every frame with the HEAD POINT, so the ring rides the wobble — and each star is
  // spawned with the ring's own TANGENTIAL velocity, so it keeps circling for the whole of its life
  // rather than sitting where it was born. That is what makes it read as a ring SPINNING rather
  // than as sparks that happen to be arranged in a circle. The rate limiting is inside the effect,
  // like the other continuous emitters; `power` is the arrival/departure ramp main.js hands it, so
  // the ring fades up as the body comes up and out before the reel ends.
  dizzyStars(dt, x, y, z, power) {
    const p = Math.max(0, Math.min(1, power == null ? 1 : power));
    if (p <= 0.01) return;
    // One whole circuit every ~1.0 s, a little faster while the reel is at full strength.
    const spin = 6.4 + 1.6 * p;
    this.dizzySpin += dt * spin;
    this.dizzyT -= dt;
    if (this.dizzyT > 0) return;
    this.dizzyT = 0.052;
    const N = 3;                  // the three that are in the air at any instant
    const rad = 0.46;             // a little wider than the skull, so the ring reads as a ring
    for (let i = 0; i < N; i++) {
      const a = this.dizzySpin + (i / N) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const ex = x + ca * rad;
      const ez = z + sa * rad;
      const ey = y + Math.sin(this.dizzySpin * 1.4 + i * 2.1) * 0.06;
      // The tangential line: the direction the ring is turning, so the star circles with it.
      const spd = rad * spin;
      this._spawn(SPRITE, {
        x: ex, y: ey, z: ez,
        color: [1.55, 1.28, 0.44],
        dur: 0.30 + Math.random() * 0.08,
        r0: 0.085,
        r1: 0.15,
        opacity: 0.62 * (0.45 + 0.55 * p),
        vx: -sa * spd, vy: 0.10, vz: ca * spd,
      });
      // ...and one in three gets a sharp glint on top of it, which is what turns a soft dot into a
      // STAR rather than a firefly.
      if (i === 0) {
        this._spawn(GLINT, {
          x: ex, y: ey, z: ez,
          color: [1.7, 1.5, 0.85],
          dur: 0.16,
          r0: 0.05,
          r1: 0.22,
          opacity: 0.55 * (0.45 + 0.55 * p),
          vx: -sa * spd, vy: 0.12, vz: ca * spd,
        });
      }
    }
  }

  trickStars(x, y, z, power) {
    const p = Math.max(0, Math.min(1, power == null ? 1 : power));
    if (p <= 0.01) return;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.random() * 0.6;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rad = 0.42 + Math.random() * 0.25;
      this._spawn(SPRITE, {
        x: x + ca * rad, y: y + (Math.random() - 0.35) * 0.55, z: z + sa * rad,
        color: [1.55, 1.28, 0.44],
        dur: 0.42 + Math.random() * 0.16,
        r0: 0.07,
        r1: 0.14,
        opacity: 0.8,
        vx: ca * 1.1, vy: 1.0 + Math.random() * 0.9, vz: sa * 1.1,
      });
      if (i < 2) {
        this._spawn(GLINT, {
          x: x + ca * rad, y: y + 0.1, z: z + sa * rad,
          color: [1.7, 1.5, 0.85],
          dur: 0.22,
          r0: 0.05,
          r1: 0.20,
          opacity: 0.7,
          vx: ca * 1.1, vy: 1.2, vz: sa * 1.1,
        });
      }
    }
  }

  update(dt, camera) {
    // Kept for the wind sheets, which turn themselves square to it at spawn time (`_spawn`).
    this.camera = camera;
    const pool = this.pool;
    for (let i = 0; i < pool.length; i++) {
      const it = pool[i];
      if (!it.alive) continue;
      it.t += dt;
      const t = it.t / it.dur;
      if (t >= 1) {
        it.alive = false;
        it.mesh.visible = false;
        continue;
      }
      const e = 1 - (1 - t) * (1 - t);
      // THE MOTION, integrated rather than interpolated (see the note in `_spawn`): `v` is a real
      // velocity that drag eats and gravity bends, so a spark thrown off a fist decelerates, arcs
      // over and falls, and a spent one drops out of the frame instead of sliding away in a straight
      // line forever. Everything that was spawned with no velocity is still drawn exactly where it
      // was (`px` never moves), so this costs the older effects nothing and changes none of them.
      it.px += it.vx * dt;
      it.py += it.vy * dt;
      it.pz += it.vz * dt;
      if (it.drag) {
        const k = Math.max(0, 1 - it.drag * dt);
        it.vx *= k;
        it.vy *= k;
        it.vz *= k;
      }
      if (it.grav) it.vy -= it.grav * dt;
      if (it.follow) {
        // A spark's LENGTH points down its own line of flight, and its line of flight is what the
        // drag and the gravity keep changing — so the aim is re-taken every frame. A spark that kept
        // its birth angle would draw a streak across its own arc.
        _fxDir.set(it.vx, it.vy, it.vz);
        if (_fxDir.lengthSq() < 1e-6) _fxDir.set(0, 1, 0);
        it.mesh.quaternion.setFromUnitVectors(_fxUp, _fxDir.normalize());
      }
      if (it.kind === STREAK || it.kind === GLINT || it.kind === SPARK) {
        // A streak does not swell: it is thrown, thins and retracts as it goes, and its LENGTH
        // is on the mesh's own +Y — the axis `_spawn` aimed at the direction it was thrown
        // along — with the cross-section on X/Z. `r0` is the thickness, `r1` the length.
        const th = it.r0 * (1 - 0.55 * t);
        it.mesh.scale.set(th, it.r1 * (1 - 0.28 * t), th);
      } else if (it.kind === SPRITE || it.kind === FLARE || it.kind === GLOW) {
        const r = it.r0 + (it.r1 - it.r0) * e;
        it.mesh.scale.set(r, r, 1);
        if (camera) it.mesh.quaternion.copy(camera.quaternion);
      } else if (it.kind === SHEET) {
        // A sheet keeps the aim it was born with (it is a card lying in the flow, not a
        // billboard) and only BROADENS as it goes — air that has been split spreads, which is
        // what stops it reading as a pane of glass hung in the sky.
        it.mesh.scale.set(it.r0 * (1 + e * 0.55), it.r1 * (1 + e * 0.22), 1);
      } else {
        const r = it.r0 + (it.r1 - it.r0) * e;
        it.mesh.scale.set(r, it.yScale * (1 + e * 0.35), r);
      }
      it.mesh.position.set(it.px, it.py - it.fall * e, it.pz);
      it.mat.uniforms.uRing.value = it.ring0 + (it.ring1 - it.ring0) * e;
      it.mat.uniforms.uT.value = t;
      // ...except a sheet, which ATTACKS first: it is born standing still in the air the body is
      // about to hit, and a hard fade-in is what keeps it from popping into existence.
      const attack = it.kind === SHEET ? Math.min(1, t * 8) : 1;
      it.mat.uniforms.uOpacity.value = it.op * attack * (1 - t) * (1 - t * 0.35);
      if (it.spin) it.mesh.rotation.y += it.spin * dt;
    }
    const diveFed = this.diveActive;
    if (this.diveRib) this.diveRib.update(dt, camera);
    this.diveActive = false;
    this.diveGap = diveFed ? 0 : this.diveGap + dt;
    // ...and the swing mesh ages the same way: a beat that stops feeding it (the form standing in
    // its guard, or the staff out of his hands) lets the strip run out of life rather than freezing,
    // and a beat that starts again after a gap gets a NEW strip instead of one drawn across the gap.
    if (this.poleRibT) {
      if (this.poleActive) this.poleGap = 0;
      else if (this.poleGap < 0.2) this.poleGap += dt;
      else {
        this.poleRibT.reset();
        this.poleRibB.reset();
        this.poleGap = 0.2;
      }
      this.poleRibT.update(dt, camera);
      this.poleRibB.update(dt, camera);
    }
    this.poleActive = false;
    // The per-part ribbons age like the body one, but each keeps its own gap: a limb that stops
    // being fed (the pose folds it in behind the body, so a point stops advancing) must not reset
    // its own contrail, only let it run out.
    for (let i = 0; i < this.diveParts.length; i++) {
      const rib = this.diveParts[i];
      if (!rib) continue;
      if (this.divePartFed[i]) this.divePartGap[i] = 0;
      else this.divePartGap[i] += dt;
      this.divePartFed[i] = false;
      rib.update(dt, camera);
    }
  }

  clear() {
    for (const it of this.pool) {
      it.alive = false;
      it.mesh.visible = false;
    }
    if (this.diveRib) this.diveRib.reset();
    if (this.poleRibT) {
      this.poleRibT.reset();
      this.poleRibB.reset();
      this.poleActive = false;
      this.poleGap = 0.2;
    }
    for (let i = 0; i < this.diveParts.length; i++) {
      const rib = this.diveParts[i];
      if (rib) rib.reset();
      this.divePartGap[i] = 1;
      this.divePartFed[i] = false;
    }
    this.diveActive = false;
  }
}

// --------------------------------------------------------------------------------------------
// The trails.
//
// A move that runs for a second cannot be sold by particles alone at this frame rate: a puff
// every 30 ms is a string of blobs, not a LINE. So a move that carries real speed feeds a ribbon
// instead — a strip of quads built through the points the body has passed, which is what makes a
// dive leave a set of thin contrails behind its head, hands and shoes.
//
// One class, two modes:
//   "flat" — the width axis is horizontal and square to the path, so the strip lies flat ON the
//            deck. Nothing uses this at the moment (the slide's skid was removed — see
//            src/SPEC.md session 24); it is kept because a mark laid on the deck is what the
//            class was built for and it costs six lines.
//   "view" — the width axis is re-squared toward the camera every frame, so the strip faces the
//            viewer wherever it is: what the dive's and the launch's contrails use, and which a
//            chase camera would otherwise see edge-on and miss entirely.
//
// The strip is rebuilt from the live samples each frame (a few dozen quads, one draw call), so
// nothing has to be reallocated as the body moves: `max` sets how far back the trail reaches,
// `life` how long a sample survives once the move has stopped feeding it.
const RIBBON_VERT = `
attribute float aA;
attribute float aArc;
attribute vec3 aLine;
attribute vec3 aRim;
varying vec2 vUv;
varying float vA;
varying float vT;
varying vec3 vLine;
varying vec3 vRim;
void main() {
  vUv = uv;
  vA = aA;
  vT = aArc;
  vLine = aLine;
  vRim = aRim;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RIBBON_FRAG = `
uniform float uEdgeMix;
uniform float uStreak;
varying vec2 vUv;
varying float vA;
varying float vT;
varying vec3 vLine;
varying vec3 vRim;
// A cheap value noise, used to BREAK the lengthwise streaks up. A lane of constant brightness
// down the whole trail is a rail; the same lane fading in and out along its own length is a
// line something drew.
float rHash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}
float rNoise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(rHash(i), rHash(i + 1.0), f);
}
void main() {
  float u = abs(vUv.x * 2.0 - 1.0);
  // THE CROSS-SECTION is a body and a haze, not a stripe and not a gaussian. A hard edge (a
  // near-constant core with a quick fade at the very rim, which is what this was) reads as a
  // plank of flat colour laid on the deck; a pure gaussian spends its whole width too faint to
  // survive 224 lines. So: a solid core out to about a third of the half-width, a shoulder to
  // about 0.88, and a soft gauze carrying the last of it out to the edge.
  float core = 1.0 - smoothstep(0.34, 0.88, u);
  float gauze = pow(max(0.0, 1.0 - u), 2.6) * 0.55;
  float env = core + gauze;
  // THE SPEED LINES. Four bright lanes running the length of the trail, each one fanned a
  // little wider the further it is from the head, and each broken up along its own length by
  // the noise. Their phase is WORLD DISTANCE TRAVELLED (vT), not a uv, so a lane holds its
  // place while the trail is painted past it: the marks stay put and the trail runs through
  // them, which is the difference between a drawn line and a scrolling texture.
  float fan = min(1.0, vT * 0.12);
  float s = 0.0;
  float lane;
  lane = abs(u - (0.00 + fan * 0.12));
  s += (1.0 - smoothstep(0.02, 0.11, lane)) * (0.30 + 0.70 * rNoise(vT * 1.7));
  lane = abs(u - (0.40 + fan * 0.34));
  s += (1.0 - smoothstep(0.02, 0.10, lane)) * (0.26 + 0.74 * rNoise(vT * 2.2 + 7.3));
  lane = abs(u - (0.70 + fan * 0.44));
  s += (1.0 - smoothstep(0.02, 0.09, lane)) * (0.22 + 0.78 * rNoise(vT * 2.8 + 19.1));
  lane = abs(u - (0.55 - fan * 0.30));
  s += (1.0 - smoothstep(0.02, 0.09, lane)) * (0.24 + 0.76 * rNoise(vT * 2.5 + 41.7));
  s *= uStreak;
  float a = (env + s * 0.45) * vA;
  if (a < 0.008) discard;
  // Two tones across the band — the CORE tone runs the middle and the RIM tone the outer strip,
  // so one trail can be a pale track with a softer edge (the slide) or a dim core inside a
  // bright one (the dive). Per vertex, so a trail laid across two surfaces keeps both tones
  // along its own length (see Ribbon.feed). The lanes are then ADDED over whichever tone is
  // under them, which is what lets a speed line read as brighter than the mark it sits in.
  vec3 c = mix(vLine, vRim, smoothstep(0.50, 0.88, u) * uEdgeMix);
  c += vec3(0.9 * s);
  gl_FragColor = vec4(min(c, vec3(1.0)), min(a, 1.0));
}
`;

const _rbV = new THREE.Vector3();
const _rbW = new THREE.Vector3();

class Ribbon {
  constructor(scene, o) {
    this.max = o.max;
    this.life = o.life;
    this.mode = o.mode;
    this.minStep = o.minStep;
    this.half = 0.3;
    this.samples = [];
    this.free = [];
    // The tone the next sample is fed with (see `setTone`). A sample keeps its own copy of it, and
    // the strip carries it per vertex, so the mark a slide leaves changes colour where the deck
    // under it does instead of being repainted with whatever the body is on now.
    this.curLine = [0.25, 0.24, 0.23];
    this.curRim = [0.9, 0.89, 0.85];
    this.curStreak = 1;
    const n = this.max;
    this.pos = new Float32Array(n * 6);
    this.uv = new Float32Array(n * 4);
    this.al = new Float32Array(n * 2);
    this.arc = new Float32Array(n * 2);
    this.line = new Float32Array(n * 6);
    this.rim = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const v = i / (n - 1);
      this.uv[i * 4 + 0] = 0;
      this.uv[i * 4 + 1] = v;
      this.uv[i * 4 + 2] = 1;
      this.uv[i * 4 + 3] = v;
    }
    const idx = new Uint16Array((n - 1) * 6);
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx[i * 6 + 0] = a;
      idx[i * 6 + 1] = a + 1;
      idx[i * 6 + 2] = a + 2;
      idx[i * 6 + 3] = a + 1;
      idx[i * 6 + 4] = a + 3;
      idx[i * 6 + 5] = a + 2;
    }
    this.geo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(this.pos, 3);
    pa.setUsage(THREE.DynamicDrawUsage);
    const aa = new THREE.BufferAttribute(this.al, 1);
    aa.setUsage(THREE.DynamicDrawUsage);
    const ra = new THREE.BufferAttribute(this.arc, 1);
    ra.setUsage(THREE.DynamicDrawUsage);
    const la = new THREE.BufferAttribute(this.line, 3);
    la.setUsage(THREE.DynamicDrawUsage);
    const rb = new THREE.BufferAttribute(this.rim, 3);
    rb.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("position", pa);
    this.geo.setAttribute("uv", new THREE.BufferAttribute(this.uv, 2));
    this.geo.setAttribute("aA", aa);
    this.geo.setAttribute("aArc", ra);
    this.geo.setAttribute("aLine", la);
    this.geo.setAttribute("aRim", rb);
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uEdgeMix: { value: 0.8 },
        uOpacity: { value: 0.4 },
        uStreak: { value: 1 },
      },
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    this.mesh.userData.isTrail = true;
    scene.add(this.mesh);
  }

  setTone(dark, edge, opacity, streak) {
    // The tone for samples fed from here on — it is not applied to the strip already laid down.
    this.curLine[0] = dark[0];
    this.curLine[1] = dark[1];
    this.curLine[2] = dark[2];
    this.curRim[0] = edge[0];
    this.curRim[1] = edge[1];
    this.curRim[2] = edge[2];
    this.curStreak = streak === undefined ? 1 : streak;
    this.mat.uniforms.uEdgeMix.value = 0.8;
    this.mat.uniforms.uOpacity.value = opacity;
    this.mat.uniforms.uStreak.value = this.curStreak;
  }

  feed(x, y, z) {
    const s = this.samples;
    // The arc length of this sample: the distance from the head it is replacing, carried so the
    // speed lines have a phase that is locked to the world (see RIBBON_FRAG). It restarts at
    // zero after `reset`, so it never drifts far enough to cost the noise its precision.
    let arc = 0;
    if (s.length) {
      const h = s[0];
      const d = Math.hypot(x - h.x, y - h.y, z - h.z);
      if (d < this.minStep) return;
      arc = h.a + d;
    }
    const sm = this.free.pop() || { x: 0, y: 0, z: 0, t: 0, a: 0, l0: 0, l1: 0, l2: 0, r0: 0, r1: 0, r2: 0 };
    sm.x = x;
    sm.y = y;
    sm.z = z;
    sm.t = 0;
    sm.a = arc;
    // The tone of the surface this bit of the mark was laid on, carried with the sample.
    sm.l0 = this.curLine[0];
    sm.l1 = this.curLine[1];
    sm.l2 = this.curLine[2];
    sm.r0 = this.curRim[0];
    sm.r1 = this.curRim[1];
    sm.r2 = this.curRim[2];
    s.unshift(sm);
    while (s.length > this.max) this.free.push(s.pop());
  }

  reset() {
    while (this.samples.length) this.free.push(this.samples.pop());
    this.mesh.visible = false;
  }

  update(dt, camera) {
    const s = this.samples;
    for (let i = s.length - 1; i >= 0; i--) {
      s[i].t += dt;
      if (s[i].t > this.life) this.free.push(s.splice(i, 1)[0]);
    }
    const n = s.length;
    if (n < 2) {
      this.mesh.visible = false;
      return;
    }
    const uOpacity = this.mat.uniforms.uOpacity.value;
    for (let i = 0; i < n; i++) {
      const c = s[i];
      const a = s[i > 0 ? i - 1 : 0];
      const b = s[i < n - 1 ? i + 1 : n - 1];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dz = b.z - a.z;
      let dl = Math.hypot(dx, dy, dz);
      if (dl < 1e-5) {
        dx = 0;
        dy = 0;
        dz = 0;
      } else {
        dx /= dl;
        dy /= dl;
        dz /= dl;
      }
      let ax, ay, az;
      if (this.mode === "flat") {
        ax = -dz;
        ay = 0;
        az = dx;
        const al = Math.hypot(ax, az);
        if (al < 1e-5) {
          ax = 1;
          az = 0;
        } else {
          ax /= al;
          az /= al;
        }
      } else {
        if (camera) _rbV.set(camera.position.x - c.x, camera.position.y - c.y, camera.position.z - c.z).normalize();
        else _rbV.set(dx, dy, dz);
        _rbW.set(dx, dy, dz).cross(_rbV);
        if (_rbW.lengthSq() < 1e-8) _rbW.set(-dz, 0, dx);
        _rbW.normalize();
        ax = _rbW.x;
        ay = _rbW.y;
        az = _rbW.z;
      }
      // The strip is widest at the head — where the body still is — and narrows down its own
      // length, and fades with the age of each sample, so a trail lasts exactly as long as the
      // move fed it plus `life`.
      const f = i / (n - 1);
      const w = this.half * (1 - 0.72 * f);
      const age = 1 - c.t / this.life;
      // The fade along the trail is nearly linear now: the old squared falloff killed the back
      // half of the mark, and the back half is the part that says how far the body has come.
      const A = Math.pow(age, 1.35) * uOpacity;
      const o = i * 6;
      this.pos[o + 0] = c.x + ax * w;
      this.pos[o + 1] = c.y + ay * w;
      this.pos[o + 2] = c.z + az * w;
      this.pos[o + 3] = c.x - ax * w;
      this.pos[o + 4] = c.y - ay * w;
      this.pos[o + 5] = c.z - az * w;
      this.arc[i * 2] = c.a;
      this.arc[i * 2 + 1] = c.a;
      this.line[o + 0] = c.l0;
      this.line[o + 1] = c.l1;
      this.line[o + 2] = c.l2;
      this.line[o + 3] = c.l0;
      this.line[o + 4] = c.l1;
      this.line[o + 5] = c.l2;
      this.rim[o + 0] = c.r0;
      this.rim[o + 1] = c.r1;
      this.rim[o + 2] = c.r2;
      this.rim[o + 3] = c.r0;
      this.rim[o + 4] = c.r1;
      this.rim[o + 5] = c.r2;
      this.al[i * 2] = A;
      this.al[i * 2 + 1] = A;
    }
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aA.needsUpdate = true;
    this.geo.attributes.aArc.needsUpdate = true;
    this.geo.attributes.aLine.needsUpdate = true;
    this.geo.attributes.aRim.needsUpdate = true;
    this.mesh.visible = true;
  }
}
