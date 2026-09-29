// ---------------------------------------------------------------------------
// THE CLIMB BAKE (session 156), step 2 — the table.  RUN THIS FILE WITH THE EDITOR'S `execute_js`
// (it needs the workspace `fs`); see README.md beside it for the full recipe.
//
// Runs the retarget, keys ONE cycle (frames 0..60, 30 fps, 2 s) at every 3rd frame
// (21 keys, key 20 duplicating key 0 so the runtime wraps without a special case),
// verifies the keyed pose against the exact one at EVERY frame, and emits
// `scratch/climb-table.js` with the constants + the measurements.
// ---------------------------------------------------------------------------
const buf = await fs.readFile("src/tools/climb-bake/Climbing_Up_Wall.fbx");
const THREE = await import("https://esm.sh/three@0.160.0");
const { FBXLoader } = await import("https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js");
const fbx = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const clip = fbx.animations[0];
const B = {};
fbx.traverse((o) => { if (o.isBone) B[o.name] = o; });

const NEED = ["mixamorigHips","mixamorigSpine","mixamorigSpine1","mixamorigSpine2","mixamorigNeck","mixamorigHead",
  "mixamorigHeadTop_End","mixamorigLeftShoulder","mixamorigLeftArm","mixamorigLeftForeArm","mixamorigLeftHand","mixamorigLeftHandMiddle1","mixamorigLeftHandThumb1",
  "mixamorigRightShoulder","mixamorigRightArm","mixamorigRightForeArm","mixamorigRightHand","mixamorigRightHandMiddle1","mixamorigRightHandThumb1",
  "mixamorigLeftUpLeg","mixamorigLeftLeg","mixamorigLeftFoot","mixamorigLeftToeBase",
  "mixamorigRightUpLeg","mixamorigRightLeg","mixamorigRightFoot","mixamorigRightToeBase"];

const mixer = new THREE.AnimationMixer(fbx);
mixer.clipAction(clip).play();

const NC = 60;                 // one cycle = 60 frames
const Q = {}, P = {};
for (const n of NEED) { Q[n] = []; P[n] = []; }
for (let f = 0; f <= NC; f++) {
  mixer.setTime(f / 30);
  fbx.updateMatrixWorld(true);
  for (const n of NEED) {
    Q[n].push(B[n].getWorldQuaternion(new THREE.Quaternion()).clone());
    P[n].push(B[n].getWorldPosition(new THREE.Vector3()).clone());
  }
}

const HIP_Y = 1.000, KNEE_Y = 0.560, ANKLE_Y = 0.225, ANKLE_X = 0.200, ANKLE_Z = 0.010;
const NECK_Y = 1.440, NECK_BASE_Y = 1.330;
const SHX = 0.215, SHY = 1.400, SHZ = -0.004;
const ELX = 0.294, ELY = 1.086, ELZ = -0.004;
const HAX = 0.336, WRY = 0.828, WRZ = -0.002;
const HMY = 0.806, HMZ = 0.000;

const G_BONES = ["hips","torso","neck","head","armUpperR","armLowerR","handR","armUpperL","armLowerL","handL",
  "legUpperR","legLowerR","footR","legUpperL","legLowerL","footL"];
const MAP = [
  { g: "hips",       m: "mixamorigHips",            kind: "trunk" },
  { g: "torso",      m: "mixamorigSpine2",          kind: "trunk" },
  { g: "neck",       m: "mixamorigNeck",            kind: "trunk" },
  { g: "head",       m: "mixamorigHead",            kind: "trunk" },
  { g: "armUpperR",  m: "mixamorigLeftArm",     kind: "arm",  s: 1 },
  { g: "armLowerR",  m: "mixamorigLeftForeArm", kind: "arm",  s: 1 },
  { g: "handR",      m: "mixamorigLeftHand",    kind: "hand", s: 1, fin: "mixamorigLeftHandMiddle1", thumb: "mixamorigLeftHandThumb1" },
  { g: "armUpperL",  m: "mixamorigRightArm",    kind: "arm",  s: -1 },
  { g: "armLowerL",  m: "mixamorigRightForeArm",kind: "arm",  s: -1 },
  { g: "handL",      m: "mixamorigRightHand",   kind: "hand", s: -1, fin: "mixamorigRightHandMiddle1", thumb: "mixamorigRightHandThumb1" },
  { g: "legUpperR",  m: "mixamorigLeftUpLeg",   kind: "leg",  s: 1 },
  { g: "legLowerR",  m: "mixamorigLeftLeg",     kind: "leg",  s: 1 },
  { g: "footR",      m: "mixamorigLeftFoot",    kind: "foot", s: 1, toe: "mixamorigLeftToeBase" },
  { g: "legUpperL",  m: "mixamorigRightUpLeg",  kind: "leg",  s: -1 },
  { g: "legLowerL",  m: "mixamorigRightLeg",    kind: "leg",  s: -1 },
  { g: "footL",      m: "mixamorigRightFoot",   kind: "foot", s: -1, toe: "mixamorigRightToeBase" },
];
const G_OFF = {
  hips: [0, HIP_Y, 0],
  torso: [0, 0, 0],
  neck: [0, NECK_BASE_Y - HIP_Y, 0],
  head: [0, NECK_Y - NECK_BASE_Y, 0],
  armUpperR: [SHX, SHY - HIP_Y, SHZ],  armUpperL: [-SHX, SHY - HIP_Y, SHZ],
  armLowerR: [ELX - SHX, ELY - SHY, ELZ - SHZ], armLowerL: [-(ELX - SHX), ELY - SHY, ELZ - SHZ],
  handR: [HAX - ELX, WRY - ELY, WRZ - ELZ],     handL: [-(HAX - ELX), WRY - ELY, WRZ - ELZ],
  legUpperR: [0, 0, 0], legUpperL: [0, 0, 0],
  legLowerR: [0, KNEE_Y - HIP_Y, 0.004], legLowerL: [0, KNEE_Y - HIP_Y, 0.004],
  footR: [ANKLE_X, ANKLE_Y - KNEE_Y, ANKLE_Z - 0.004], footL: [-ANKLE_X, ANKLE_Y - KNEE_Y, ANKLE_Z - 0.004],
};
const PARENT = {
  hips: null, torso: "hips", neck: "torso", head: "neck",
  armUpperR: "torso", armLowerR: "armUpperR", handR: "armLowerR",
  armUpperL: "torso", armLowerL: "armUpperL", handL: "armLowerL",
  legUpperR: "hips", legLowerR: "legUpperR", footR: "legLowerR",
  legUpperL: "hips", legLowerL: "legUpperL", footL: "legLowerL",
};
const CHILD_OFF = {
  hips: [0, NECK_BASE_Y - HIP_Y, 0],
  torso: [0, NECK_BASE_Y - HIP_Y, 0],
  neck: [0, NECK_Y - NECK_BASE_Y, 0],
  head: [0, 0.11, 0],
  armUpperR: [ELX - SHX, ELY - SHY, ELZ - SHZ], armUpperL: [-(ELX - SHX), ELY - SHY, ELZ - SHZ],
  armLowerR: [HAX - ELX, WRY - ELY, WRZ - ELZ], armLowerL: [-(HAX - ELX), WRY - ELY, WRZ - ELZ],
  handR: [0, HMY - WRY, HMZ - WRZ], handL: [0, HMY - WRY, HMZ - WRZ],
  legUpperR: [0, KNEE_Y - HIP_Y, 0.004], legUpperL: [0, KNEE_Y - HIP_Y, 0.004],
  legLowerR: [ANKLE_X, ANKLE_Y - KNEE_Y, ANKLE_Z - 0.004], legLowerL: [-ANKLE_X, ANKLE_Y - KNEE_Y, ANKLE_Z - 0.004],
  footR: [0, 0, 1], footL: [0, 0, 1],
};

const v3 = (a) => (a && a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
function basis(dir, ref) {
  const c0 = dir.clone().normalize();
  const c2 = ref.clone().addScaledVector(c0, -ref.dot(c0));
  if (c2.lengthSq() < 1e-12) c2.copy(c0).cross(new THREE.Vector3(0, 0, 1)).cross(c0);
  c2.normalize();
  const c1 = new THREE.Vector3().crossVectors(c2, c0);
  return new THREE.Matrix4().makeBasis(c0, c1, c2);
}
const hingeOf = (u, w) => new THREE.Vector3().crossVectors(u, w);
const CHILD_OF = {
  torso: "mixamorigNeck", neck: "mixamorigHead",
  armUpperR: "mixamorigLeftForeArm", armLowerR: "mixamorigLeftHand",
  armUpperL: "mixamorigRightForeArm", armLowerL: "mixamorigRightHand",
  legUpperR: "mixamorigLeftLeg", legLowerR: "mixamorigLeftFoot",
  legUpperL: "mixamorigRightLeg", legLowerL: "mixamorigRightFoot",
};
function clipFrame(e, f) {
  const p = v3(P[e.m][f]);
  if (e.kind === "trunk") {
    const dir = e.g === "hips" ? v3(P.mixamorigSpine[f]).sub(p)
      : e.g === "head" ? v3(P.mixamorigHeadTop_End[f]).sub(p)
      : v3(P[CHILD_OF[e.g]][f]).sub(p);
    if (e.g === "hips") return basis(dir, v3(P.mixamorigLeftUpLeg[f]).sub(v3(P.mixamorigRightUpLeg[f])));
    return basis(dir, v3(P.mixamorigLeftShoulder[f]).sub(v3(P.mixamorigRightShoulder[f])));
  }
  if (e.kind === "arm") {
    const child = CHILD_OF[e.g];
    const dir = v3(P[child][f]).sub(p);
    const up = e.g.startsWith("armUpper")
      ? { u: dir, w: v3(P[e.s === 1 ? "mixamorigLeftHand" : "mixamorigRightHand"][f]).sub(v3(P[child][f])) }
      : { u: v3(P[e.s === 1 ? "mixamorigLeftArm" : "mixamorigRightArm"][f]).sub(v3(P[e.s === 1 ? "mixamorigLeftShoulder" : "mixamorigRightShoulder"][f])), w: dir };
    return basis(dir, hingeOf(up.u, up.w));
  }
  if (e.kind === "hand") {
    const dir = v3(P[e.fin][f]).sub(p);
    const nrm = new THREE.Vector3().crossVectors(dir, v3(P[e.thumb][f]).sub(p));
    if (nrm.dot(new THREE.Vector3(0, -1, 0)) < 0) nrm.negate();
    return basis(dir, nrm);
  }
  if (e.kind === "leg") {
    const child = CHILD_OF[e.g];
    const dir = v3(P[child][f]).sub(p);
    const up = e.g.startsWith("legUpper")
      ? { u: dir, w: v3(P[e.s === 1 ? "mixamorigLeftFoot" : "mixamorigRightFoot"][f]).sub(v3(P[child][f])) }
      : { u: v3(P[e.s === 1 ? "mixamorigLeftLeg" : "mixamorigRightLeg"][f]).sub(v3(P[e.s === 1 ? "mixamorigLeftUpLeg" : "mixamorigRightUpLeg"][f])), w: dir };
    return basis(dir, hingeOf(up.u, up.w));
  }
  return basis(v3(P[e.toe][f]).sub(p), new THREE.Vector3(0, -1, 0));
}
function gameFrame(e) {
  const dir = v3(CHILD_OFF[e.g]);
  if (e.kind === "trunk") return basis(dir, new THREE.Vector3(1, 0, 0));
  if (e.kind === "arm") return basis(dir, new THREE.Vector3(1, 0, 0));
  if (e.kind === "hand") return basis(dir, new THREE.Vector3(-e.s, 0, 0));
  if (e.kind === "leg") return basis(dir, new THREE.Vector3(1, 0, 0));
  return basis(dir, new THREE.Vector3(0, -1, 0));
}

// --- C_b(t): the clip's world delta from the bind, per frame ---
const C = {};
for (const e of MAP) C[e.g] = Q[e.m].map((q) => q.clone().multiply(Q[e.m][0].clone().invert()));

// a good F0: the frame where the four limb hinges are least degenerate. Take 0 — the frames
// are all well bent in this clip (checked below by the hinge spread report).
const F0 = 6;
const A0 = {}, G = {};
for (const e of MAP) { G[e.g] = gameFrame(e); A0[e.g] = new THREE.Matrix4().multiplyMatrices(clipFrame(e, F0), new THREE.Matrix4().copy(G[e.g]).invert()); }

const q4 = new THREE.Quaternion();
const Rq = {};                                 // [bone][frame] local quaternion, exactly
for (const e of MAP) Rq[e.g] = [];
for (let f = 0; f <= NC; f++) {
  const A = {};
  for (const e of MAP) A[e.g] = new THREE.Matrix4().makeRotationFromQuaternion(C[e.g][f].clone().multiply(C[e.g][F0].clone().invert())).multiply(A0[e.g]);
  for (const e of MAP) {
    const p = PARENT[e.g];
    Rq[e.g].push(new THREE.Quaternion().setFromRotationMatrix(p ? new THREE.Matrix4().copy(A[p]).invert().multiply(A[e.g]) : A[e.g]));
  }
}

// --- the hips' own translation, relative to the cycle's mean, scaled to the rig ---
const mean = new THREE.Vector3();
for (let f = 0; f <= NC; f++) mean.add(v3(P.mixamorigHips[f]));
mean.multiplyScalar(1 / (NC + 1));
const K = HIP_Y / v3(P.mixamorigHips[0]).y;    // the clip's hip height -> the rig's
const hipOff = [];
for (let f = 0; f <= NC; f++) hipOff.push(v3(P.mixamorigHips[f]).sub(mean).multiplyScalar(K));

// --- key it: every 3rd frame ---
const STEP = 1, NK = NC / STEP + 1;            // 61 keys, the last a copy of the first
const keyQ = G_BONES.map(() => []), keyH = [];
for (let k = 0; k < NK; k++) {
  const f = k === NK - 1 ? 0 : k * STEP;
  for (let i = 0; i < G_BONES.length; i++) keyQ[i].push(Rq[G_BONES[i]][f].clone());
  keyH.push(hipOff[f].clone());
}

// --- rebuild the rig: `world` per bone, from either the exact or the keyed pose ---
function rebuildWorld(keyed, f) {
  const w = {};
  // the per-bone local quaternion at frame f
  const loc = {};
  if (keyed) {
    const x = (f / STEP);
    const a = Math.floor(x) % (NK - 1), b = (a + 1) % (NK - 1), t = x - Math.floor(x);
    for (let i = 0; i < G_BONES.length; i++) {
      loc[G_BONES[i]] = keyQ[i][a].clone().slerp(keyQ[i][b], t);
    }
  } else {
    for (const g of G_BONES) loc[g] = Rq[g][f].clone();
  }
  for (const g of G_BONES) {
    const p = PARENT[g];
    const off = v3(G_OFF[g]);
    if (!p) {
      // THE HIPS' OWN TRANSLATION rides the root — added HERE, before the children are
      // built, so the whole body inherits it (a clip's body motion is most of the motion).
      const h = keyed
        ? (() => { const x = f / STEP; const a = Math.floor(x) % (NK - 1), b = (a + 1) % (NK - 1), t = x - Math.floor(x); return keyH[a].clone().lerp(keyH[b], t); })()
        : hipOff[f].clone();
      w[g] = { q: loc[g].clone(), p: off.clone().add(h) };
    } else {
      const lp = off.clone().applyQuaternion(w[p].q).add(w[p].p);
      w[g] = { q: w[p].q.clone().multiply(loc[g]), p: lp };
    }
  }
  return w;
}
function contactPts(w) {
  const out = {};
  for (const g of ["handR", "handL", "footR", "footL"]) {
    const rel = g.startsWith("hand") ? v3([0, HMY - WRY, HMZ - WRZ]) : v3([0, -0.225, 0.05]);
    out[g] = w[g].p.clone().add(rel.applyQuaternion(w[g].q));
  }
  return out;
}

// --- fidelity: the keyed pose vs the exact, every frame ---
const fid = {};
for (const g of G_BONES) fid[g] = 0;
let fidPos = 0, fidQ = 0, fidWorstFrame = -1, fidWorstBone = "";
for (let f = 0; f <= NC; f++) {
  const we = rebuildWorld(false, f), wk = rebuildWorld(true, f);
  for (const g of G_BONES) {
    const d = v3(CHILD_OFF[g]).normalize();
    const a = d.clone().applyQuaternion(we[g].q), b = d.clone().applyQuaternion(wk[g].q);
    const ang = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI;
    if (ang > fid[g]) fid[g] = ang;
  }
  const ce = contactPts(we), ck = contactPts(wk);
  for (const g of Object.keys(ce)) {
    const dd = ce[g].distanceTo(ck[g]);
    if (dd > fidPos) { fidPos = dd; fidWorstFrame = f; fidWorstBone = g; }
  }
}
// where the internal (un-keyed) reconstruction's own wobble lives: the direction error of
// the EXACT rebuild against the clip itself, per bone, at every frame.
const wob = {};
for (const e of MAP) {
  let worst = 0, worstF = -1;
  for (let f = 0; f <= NC; f++) {
    const lin = {};
    for (const g of G_BONES) lin[g] = Rq[g][f];
    const w = rebuildWorld(false, f);
    const d = v3(CHILD_OFF[e.g]).normalize().applyQuaternion(w[e.g].q);
    let cd;
    if (e.kind === "hand") cd = v3(P[e.fin][f]).sub(v3(P[e.m][f])).normalize();
    else if (e.kind === "foot") cd = v3(P[e.toe][f]).sub(v3(P[e.m][f])).normalize();
    else if (e.kind === "trunk") cd = (e.g === "head" ? v3(P.mixamorigHeadTop_End[f]).sub(v3(P[e.m][f])) : v3(P[e.g === "hips" ? "mixamorigSpine" : CHILD_OF[e.g]][f]).sub(v3(P[e.m][f]))).normalize();
    else cd = v3(P[CHILD_OF[e.g]][f]).sub(v3(P[e.m][f])).normalize();
    const ang = Math.acos(Math.max(-1, Math.min(1, d.dot(cd)))) * 180 / Math.PI;
    if (ang > worst) { worst = ang; worstF = f; }
  }
  wob[e.g] = [+worst.toFixed(2), worstF];
}
// per-frame keyed error for the worst bone, printed as a profile
const prof = [];
for (let f = 0; f <= NC; f++) {
  const we = rebuildWorld(false, f), wk = rebuildWorld(true, f);
  let m = 0;
  for (const g of G_BONES) {
    const d = v3(CHILD_OFF[g]).normalize();
    const a = d.clone().applyQuaternion(we[g].q), b = d.clone().applyQuaternion(wk[g].q);
    m = Math.max(m, Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI);
  }
  prof.push(+m.toFixed(1));
}

// --- THE PACING: the weighted mean descent rate of the four contacts ---
// A contact is "on the wall" in proportion to how deep it is. For each frame the contact's
// world y falls at dy/dt; a body rising at v keeps it planted iff v = -dy/dt. So v* is the
// depth-weighted mean of -dy/dt over the whole cycle.
const CONTACTS = ["handR", "handL", "footR", "footL"];
const all = {};
for (const g of CONTACTS) all[g] = [];
for (let f = 0; f <= NC; f++) {
  const c = contactPts(rebuildWorld(false, f));
  for (const g of CONTACTS) all[g].push(c[g]);
}
let num = 0, den = 0;
const per = {};
for (const g of CONTACTS) {
  const zs = all[g].map((p) => p.z);
  const zmax = Math.max(...zs);
  let n = 0, d = 0;
  for (let f = 0; f < NC; f++) {
    const w = Math.max(0, Math.min(1, (zs[f] - (zmax - 0.10)) / 0.10));
    if (w <= 0) continue;
    const dy = (all[g][f + 1].y - all[g][f].y) * 30;
    n += w * (-dy); d += w;
  }
  per[g] = { rate: +(n / (d || 1)).toFixed(4), weight: +d.toFixed(1) };
  num += n; den += d;
}
const p = { rate: +(num / (den || 1)).toFixed(4), perCycle: +((num / (den || 1)) * 2).toFixed(4), per, weight: +den.toFixed(1) };


// --- THE STROKE PROFILE: the clip's own SPEED per key (the `CLIMB_PULL` literal) ---
// Session 162. A climb's speed is not a free number — it is how fast the HOLDS are being consumed.
// A contact planted on the stone is dragged down past the body, and that rate is exactly how fast
// the body is being hauled up past the contact, so the profile IS the pull. Read off the KEYED
// table (the one that ships), depth-weighted toward whichever contacts are actually on the stone,
// counting only contacts moving DOWN — a contact rising up the face is flying to its next hold, not
// holding this one. Mean-normalized to exactly 1 so that wearing it as a speed multiplier upstream
// changes no average (see the `CLIMB_PULL_DEPTH` block in player.js).
const pullRaw = [];
const kc = {};
for (const g of CONTACTS) kc[g] = [];
for (let k = 0; k < NK; k++) {
  // `rebuildWorld(true, NK-1)` lands back on key 0 (see its own wrap), so index NK-1 IS index 0
  const c = contactPts(rebuildWorld(true, k));
  for (const g of CONTACTS) kc[g].push(c[g]);
}
const kz = {};
for (const g of CONTACTS) kz[g] = Math.max(...kc[g].map((c) => c.z));
for (let k = 0; k < NK - 1; k++) {
  let num = 0, den = 0;
  for (const g of CONTACTS) {
    const w = Math.max(0, Math.min(1, (kc[g][k].z - (kz[g] - 0.12)) / 0.12));
    const dy = kc[g][k + 1].y - kc[g][k].y;
    if (w > 0 && dy < 0) { num += w * (-dy); den += w; }
  }
  pullRaw.push(den > 0 ? num / den : null);
}
// A beat with all four limbs in flight holds nothing, so it coasts on the nearest rate rather
// than reading as a zero-speed hole.
for (let i = 0; i < pullRaw.length; i++) {
  if (pullRaw[i] != null) continue;
  for (let d = 1; d < pullRaw.length; d++) {
    const lo = pullRaw[(i - d + pullRaw.length) % pullRaw.length];
    const hi = pullRaw[(i + d) % pullRaw.length];
    if (lo != null) { pullRaw[i] = lo; break; }
    if (hi != null) { pullRaw[i] = hi; break; }
  }
}
const pullMean = pullRaw.reduce((a, b) => a + b) / pullRaw.length;
// ...then smoothed once (±2 keys, wrapping) so the SPEED has no corners on the keys, and
// re-normalized so its mean is still exactly 1.
const pullSm = pullRaw.map((_, i) => {
  let s = 0;
  for (let j = -2; j <= 2; j++) s += pullRaw[(i + j + pullRaw.length) % pullRaw.length];
  return s / 5;
});
const pullMean2 = pullSm.reduce((a, b) => a + b) / pullSm.length;
const CLIMB_PULL_OUT = pullSm.map((v) => +(v / pullMean2).toFixed(3));
const pullStats = {
  keys: CLIMB_PULL_OUT.length,
  mean: +(CLIMB_PULL_OUT.reduce((a, b) => a + b) / CLIMB_PULL_OUT.length).toFixed(4),
  min: Math.min(...CLIMB_PULL_OUT), max: Math.max(...CLIMB_PULL_OUT),
  ratePerSec: +(pullMean * 30).toFixed(4), perCycle: +(pullMean * 30 * 2).toFixed(4),
};


// --- the contact traces (exact, in the rig's own fixed frame — the world descent of each) ---
const trace = {};
for (const g of ["handR","handL","footR","footL"]) trace[g] = [];
for (let f = 0; f <= NC; f++) {
  const c = contactPts(rebuildWorld(false, f));
  for (const g of Object.keys(c)) trace[g].push([+c[g].x.toFixed(4), +c[g].y.toFixed(4), +c[g].z.toFixed(4)]);
}
// the cycle's total descent per contact: the best-fit slope of y over the frames it is
// deepest (its own plant), reported as a range over depth thresholds.
function strokeOf(g, thresh) {
  const tr = trace[g];
  const zs = tr.map((v) => v[2]);
  const zmax = Math.max(...zs);
  const on = zs.map((z) => z >= zmax - thresh);
  const idx = on.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 4) return null;
  // the longest run (wrapping), then its y drop
  let best = null, run = [];
  for (let i = 0; i < idx.length; i++) {
    if (run.length && idx[i] !== idx[i - 1] + 1) { if (!best || run.length > best.length) best = run; run = []; }
    run.push(idx[i]);
  }
  if (!best || run.length > best.length) best = run;
  const y0 = tr[best[0]][1], y1 = tr[best[best.length - 1]][1];
  return { frames: best.length, duty: +(best.length / NC).toFixed(3), drop: +(y0 - y1).toFixed(4), perFrame: +((y0 - y1) / best.length).toFixed(4) };
}
const strokes = {};
for (const g of ["handR","handL","footR","footL"]) strokes[g] = [0.04, 0.06, 0.10].map((t) => strokeOf(g, t));
const zRanges = {};
for (const g of ["handR","handL","footR","footL"]) zRanges[g] = { min: +Math.min(...trace[g].map(v=>v[2])).toFixed(3), max: +Math.max(...trace[g].map(v=>v[2])).toFixed(3) };
const hipRange = { x: [], y: [], z: [] };
for (let f = 0; f <= NC; f++) { hipRange.x.push(hipOff[f].x); hipRange.y.push(hipOff[f].y); hipRange.z.push(hipOff[f].z); }

// --- encode ---
const flat = new Int16Array(NK * (G_BONES.length * 4 + 3));
let o = 0;
for (let k = 0; k < NK; k++) {
  for (let i = 0; i < G_BONES.length; i++) {
    const q = keyQ[i][k];
    flat[o++] = Math.round(q.x * 32767); flat[o++] = Math.round(q.y * 32767);
    flat[o++] = Math.round(q.z * 32767); flat[o++] = Math.round(q.w * 32767);
  }
  flat[o++] = Math.round(keyH[k].x * 32767); flat[o++] = Math.round(keyH[k].y * 32767); flat[o++] = Math.round(keyH[k].z * 32767);
}
const bytes = new Uint8Array(flat.buffer);
let bin = "";
for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
const b64 = btoa(bin);

const lines = [];
lines.push("// THE CLIMB, RETARGETED FROM THE CLIP (session 156) — generated data, do not hand-edit.");
lines.push("// Source: Mixamo \"Climbing Up Wall\" (30 fps, 2 s per cycle), retargeted onto this rig's");
lines.push("// own rest frames offline and keyed at " + NK + " keys per cycle; see `CLIMB_KEYS` in streetwear.js.");
lines.push("const CLIMB_KEYS = " + NK + ";");
lines.push("const CLIMB_KEYS_PER_SEC = " + (30 / STEP) + ";");
lines.push("const CLIMB_Q = \"" + b64 + "\";");
lines.push("");
lines.push("// THE STROKE PROFILE (session 162) — the clip's own descent of the planted holds per key,");
lines.push("// mean-normalized to exactly 1. Worn by `player.js` as the climb's speed: the body is hauled");
lines.push("// up while the arms haul. See the `CLIMB_PULL_DEPTH` block in its `P`.");
lines.push("const CLIMB_PULL = [");
for (let i = 0; i < CLIMB_PULL_OUT.length; i += 6) {
  lines.push("  " + CLIMB_PULL_OUT.slice(i, i + 6).map((v) => v.toFixed(3)).join(", ") + ",");
}
lines.push("];");
lines.push("");
await fs.writeTextFile("scratch/climb-table.js", lines.join("\n"));

return {
  NK, b64Len: b64.length, K: +K.toFixed(4),
  fidMaxDeg: { dir: fid, worstQ: +fidQ.toFixed(2), worstPos: +fidPos.toFixed(4), at: [fidWorstBone, fidWorstFrame] },
  wobble: wob,
  prof,
  pace: p,
  pull: pullStats,
  strokes, zRanges,
  hipRange: { x: [Math.min(...hipRange.x), Math.max(...hipRange.x)].map(v=>+v.toFixed(3)),
              y: [Math.min(...hipRange.y), Math.max(...hipRange.y)].map(v=>+v.toFixed(3)),
              z: [Math.min(...hipRange.z), Math.max(...hipRange.z)].map(v=>+v.toFixed(3)) },
  hipTraceY: hipOff.map(v=>+v.y.toFixed(3)),
  traceHandRY: trace.handR.map(v=>+v[1].toFixed(2)),
};
