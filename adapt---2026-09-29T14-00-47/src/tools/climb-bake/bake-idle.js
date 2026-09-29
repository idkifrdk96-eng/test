// ---------------------------------------------------------------------------
// THE CLIMB IDLE BAKE (session 163) — the user's `climber_pose.fbx`, retargeted onto this rig.
//
// RUN THIS FILE WITH THE EDITOR'S `execute_js` (it needs the workspace `fs`); see README.md beside
// it for the full recipe. It writes `scratch/climb-idle-table.js`, whose `CLIMB_IDLE_Q` literal is
// pasted into `src/streetwear.js` by hand — the literal is generated, never edited.
//
// WHAT THE CLIP IS. The user's upload is *not* a Mixamo clip. Its own header says so:
//   `; FBX 7.4.0 project file generated from photo-based pose reconstruction`
//   `Creator: "Claude pose reconstruction"`
// — a 24-bone ASCII FBX whose node rotations ARE the pose, carrying a 3 s animation stack of
// `ClimbPoseHold` whose every curve has **two keys, at t=0 and t=3, with the same value**: it is a
// still. So this is a POSE, not a cycle, and the bake below keys ONE frame where `bake.js` keys 61.
//
// WHY IT NEEDS POSING AT ALL. `bake.js` gets away with using a clip's own world frame directly,
// because a Mixamo clip is authored facing +z with its wall at +z (`CLIMB_Q`'s contacts sit +13..+17
// cm in front of its hips and its own shoulders run +x, so it is already in this rig's convention —
// MEASURED, its four contacts are coplanar to 0.99 cm about a normal 8.6° off -z, i.e. the whole
// character is yawed that much, which is Mixamo's business and is why the climb's own contacts
// spread the way they do). A PHOTO RECONSTRUCTION has no such promise: it is built in the
// reconstructor's arbitrarily-chosen frame. MEASURED here, this one's four contacts are coplanar
// only to 17.56 cm and about a normal **32.1° away** from -z. Copied straight across, the pose
// would stand three quarters of a unit of its body off a flat plate and one limb through it.
//
// So the bake STANDS THE POSE ON ITS OWN WALL FIRST: from the four contacts it builds the clip's
// own (side, out, up) — `out` the contact plane's normal, oriented toward the body; `up` the mean
// hand minus the mean foot, taken perpendicular to `out` — and rotates the whole clip by the one
// rotation that carries that frame onto the game's: `out` -> (0,0,-1), `up` -> (0,1,0). That is the
// frame `CLIMB_Q` is already in, so the two tables are posed in one convention.
//
// AND IT IS DONE TO `Q` AS WELL AS `P`: a world orientation is rotated by pre-multiplying, a world
// position by applying — getting that backwards is a pose that spins without moving, or moves
// without spinning.
//
// THE CONTACTS, WHICH IS WHERE THIS CLIP IS NOT LIKE THE OTHER. After standing the pose up,
// MEASURED relative to the hips: both hands and the right foot land coplanar to **0.04 cm** at
// +0.8 cm toward the stone, and the left foot lands at **+24.2 cm** — 23.4 cm through a flat plate.
// Three agree and one is out, and the odd one is the high-knee leg, whose depth is exactly what a
// single-photograph reconstruction cannot know: the image fixes where that knee and foot are ACROSS
// the frame and says nothing about how far they are from the lens. `poseClimbIdle` in streetwear.js
// handles it (see the note there); the bake's job is to hand it an honest table and the numbers,
// which is why the report below prints every contact's own (across, up, out).
//
// THE HAND HAS NO THUMB. `bake.js` builds a hand's semantic frame from the thumb (`cross(dir,
// thumb)`), and this skeleton carries no finger chain at all — 24 bones, ending at `Hand_End` and
// `Toe_End`. So the palm's roll here is tied to the ARM'S OWN PLANE instead: `basis(handDir,
// elbowToWrist)` on the clip against `basis(CHILD_OFF[hand], CHILD_OFF[armLower])` on this rig,
// which is the same convention read off the rig's own rest (its hands rest hanging, so the two
// offsets are the wrist-to-palm and elbow-to-wrist directions in the rig's frame). What that buys
// is a palm whose roll follows the forearm exactly as far as the reconstruction determines it and
// no further: with only the hand's exact direction recoverable, this is the honest reading, and it
// is why the digits closing on the stone are still authored in `streetwear.js` (`CLIMB.GRIP`).
// ---------------------------------------------------------------------------
const buf = await fs.readFile("src/tools/climb-bake/climber_pose.fbx");
const THREE = await import("https://esm.sh/three@0.160.0");
const { FBXLoader } = await import("https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js");
const fbx = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
const clip = fbx.animations[0];
const B = {};
fbx.traverse((o) => { if (o.isBone) B[o.name] = o; });
const mixer = new THREE.AnimationMixer(fbx);
mixer.clipAction(clip).play();
mixer.setTime(0);                       // it is a still: t=0 is the pose
fbx.updateMatrixWorld(true);

// every bone the mapping touches — the report reads the rest of them off the same snapshot
const NEED = ["Hips","Spine","Chest","Neck","Head","HeadTop_End",
  "LeftShoulder","LeftArm","LeftForeArm","LeftHand","LeftHand_End",
  "RightShoulder","RightArm","RightForeArm","RightHand","RightHand_End",
  "LeftUpLeg","LeftLeg","LeftFoot","LeftToe_End",
  "RightUpLeg","RightLeg","RightFoot","RightToe_End"];
const P = {}, Q = {};
for (const n of NEED) {
  P[n] = B[n].getWorldPosition(new THREE.Vector3());
  Q[n] = B[n].getWorldQuaternion(new THREE.Quaternion());
}

// --- the clip's own wall frame, from its four contacts -----------------------
// The contacts are read off the JOINTS (wrist, ankle) rather than off a mesh: this file has no
// mesh, and a wrist is the same point on both sides of the retarget, which is what a plane fit
// wants. (How far the PALM or the SOLE then reaches past that joint is a property of this rig's
// drawn meshes and is measured there — see `CLIMB_IDLE_PRESS` in streetwear.js.)
const v3 = (n) => P[n].clone();
function planeNormal(points) {
  const c = new THREE.Vector3();
  for (const p of points) c.add(p);
  c.multiplyScalar(1 / points.length);
  let best = null;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) for (let k = j + 1; k < points.length; k++) {
    const n = new THREE.Vector3().crossVectors(points[j].clone().sub(points[i]), points[k].clone().sub(points[i]));
    if (n.lengthSq() < 1e-9) continue;
    n.normalize();
    let mx = 0;
    for (const p of points) mx = Math.max(mx, Math.abs(p.clone().sub(c).dot(n)));
    if (!best || mx < best.mx) best = { n: n.clone(), mx, c: c.clone() };
  }
  return best;
}
function wallFrame(hands, feet, hips) {
  const pl = planeNormal([...hands, ...feet].map(v3));
  const out = pl.n.clone();
  if (out.dot(v3(hips).sub(pl.c)) < 0) out.negate();
  const mf = new THREE.Vector3(); for (const n of feet) mf.add(v3(n)); mf.multiplyScalar(1 / feet.length);
  const mh = new THREE.Vector3(); for (const n of hands) mh.add(v3(n)); mh.multiplyScalar(1 / hands.length);
  const up = mh.clone().sub(mf);
  up.addScaledVector(out, -up.dot(out));
  up.normalize();
  return { out, up, side: new THREE.Vector3().crossVectors(up, out), coplanar: pl.mx };
}
const HANDS = ["LeftHand", "RightHand"], FEET = ["LeftFoot", "RightFoot"];
const Fn = wallFrame(HANDS, FEET, "Hips");
const rawNorm = Fn.out.clone(), rawUp = Fn.up.clone();
const rawCoplanar = Fn.coplanar;

// the game's own wall frame, in this rig's convention (`CLIMB_Q`'s): the stone is at +z, up is +y
const Fi = {
  out: new THREE.Vector3(0, 0, -1),
  up: new THREE.Vector3(0, 1, 0),
  side: new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)),
};
const mkB = (f) => new THREE.Matrix4().makeBasis(f.side, f.out, f.up);
const R = new THREE.Matrix4().multiplyMatrices(mkB(Fi), new THREE.Matrix4().copy(mkB(Fn)).invert());
const Rq = new THREE.Quaternion().setFromRotationMatrix(R);
// stand the whole clip up: orientations pre-multiply, positions apply
for (const n of NEED) { P[n].applyQuaternion(Rq); Q[n].premultiply(Rq); }
const alignDeg = +(Math.acos(Math.max(-1, Math.min(1, rawNorm.dot(Fi.out)))) * 180 / Math.PI).toFixed(1);

// --- the rig's own rest geometry (identical to `bake.js`: it is the rig, not the clip) ----------
const HIP_Y = 1.000, KNEE_Y = 0.560, ANKLE_Y = 0.225, ANKLE_X = 0.200, ANKLE_Z = 0.010;
const NECK_Y = 1.440, NECK_BASE_Y = 1.330;
const SHX = 0.215, SHY = 1.400, SHZ = -0.004;
const ELX = 0.294, ELY = 1.086, ELZ = -0.004;
const HAX = 0.336, WRY = 0.828, WRZ = -0.002;
const HMY = 0.806, HMZ = 0.000;
const G_BONES = ["hips","torso","neck","head","armUpperR","armLowerR","handR","armUpperL","armLowerL","handL",
  "legUpperR","legLowerR","footR","legUpperL","legLowerL","footL"];
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

const b3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function basis(dir, ref) {
  const c0 = dir.clone().normalize();
  const c2 = ref.clone().addScaledVector(c0, -ref.dot(c0));
  if (c2.lengthSq() < 1e-12) c2.copy(c0).cross(new THREE.Vector3(0, 0, 1)).cross(c0);
  c2.normalize();
  const c1 = new THREE.Vector3().crossVectors(c2, c0);
  return new THREE.Matrix4().makeBasis(c0, c1, c2);
}
const hingeOf = (u, w) => new THREE.Vector3().crossVectors(u, w);

// --- THE MAPPING: this rig's 16 bones onto the clip's 24 ---------------------
// The clip's `Left*` bones drive this rig's `R`-named bones, exactly as in `bake.js` (this rig's `L`
// bones are the character's own right), which is verified there against the clip's joint positions.
// `m` is the clip bone whose SEMANTIC FRAME stands for the rig bone; `child` the clip bone it points
// at; the hinge references are the two joints that define the bone's bend plane.
const MAP = [
  { g: "hips",       m: "Hips",       kind: "trunk", child: "Spine",       side: "legs" },
  { g: "torso",      m: "Chest",      kind: "trunk", child: "Neck",        side: "shoulders" },
  { g: "neck",       m: "Neck",       kind: "trunk", child: "Head",        side: "shoulders" },
  { g: "head",       m: "Head",       kind: "trunk", child: "HeadTop_End", side: "shoulders" },
  { g: "armUpperR",  m: "LeftArm",     kind: "arm", s: 1,  child: "LeftForeArm",  tip: "LeftHand" },
  { g: "armLowerR",  m: "LeftForeArm", kind: "arm", s: 1,  child: "LeftHand",     upper: "LeftArm",  root: "LeftShoulder" },
  { g: "handR",      m: "LeftHand",    kind: "hand", s: 1, fin: "LeftHand_End",  fore: "LeftForeArm" },
  { g: "armUpperL",  m: "RightArm",     kind: "arm", s: -1, child: "RightForeArm", tip: "RightHand" },
  { g: "armLowerL",  m: "RightForeArm", kind: "arm", s: -1, child: "RightHand",    upper: "RightArm", root: "RightShoulder" },
  { g: "handL",      m: "RightHand",    kind: "hand", s: -1, fin: "RightHand_End", fore: "RightForeArm" },
  { g: "legUpperR",  m: "LeftUpLeg",   kind: "leg", s: 1,  child: "LeftLeg",  tip: "LeftFoot" },
  { g: "legLowerR",  m: "LeftLeg",     kind: "leg", s: 1,  child: "LeftFoot", upper: "LeftLeg",  root: "LeftUpLeg" },
  { g: "footR",      m: "LeftFoot",    kind: "foot", s: 1, toe: "LeftToe_End" },
  { g: "legUpperL",  m: "RightUpLeg",  kind: "leg", s: -1, child: "RightLeg", tip: "RightFoot" },
  { g: "legLowerL",  m: "RightLeg",    kind: "leg", s: -1, child: "RightFoot", upper: "RightLeg", root: "RightUpLeg" },
  { g: "footL",      m: "RightFoot",   kind: "foot", s: -1, toe: "RightToe_End" },
];
function sideRef(which, f) {
  return which === "legs"
    ? P["LeftUpLeg"].clone().sub(P["RightUpLeg"])
    : P["LeftShoulder"].clone().sub(P["RightShoulder"]);
}
function clipFrame(e) {
  const p = v3(e.m);
  if (e.kind === "trunk") return basis(v3(e.child).sub(p), sideRef(e.side));
  if (e.kind === "arm") {
    const dir = v3(e.child).sub(p);
    const u = e.g.startsWith("armUpper") ? dir : v3(e.upper).sub(v3(e.root));
    const w = e.g.startsWith("armUpper") ? v3(e.tip).sub(v3(e.child)) : dir;
    return basis(dir, hingeOf(u, w));
  }
  if (e.kind === "hand") return basis(v3(e.fin).sub(p), p.clone().sub(v3(e.fore)));
  if (e.kind === "leg") {
    const dir = v3(e.child).sub(p);
    const u = e.g.startsWith("legUpper") ? dir : v3(e.upper).sub(v3(e.root));
    const w = e.g.startsWith("legUpper") ? v3(e.tip).sub(v3(e.child)) : dir;
    return basis(dir, hingeOf(u, w));
  }
  return basis(v3(e.toe).sub(p), new THREE.Vector3(0, -1, 0));
}
function gameFrame(e) {
  const dir = b3(CHILD_OFF[e.g]);
  if (e.kind === "trunk") return basis(dir, new THREE.Vector3(1, 0, 0));
  if (e.kind === "arm") return basis(dir, new THREE.Vector3(1, 0, 0));
  // the hand's roll is tied to the ARM'S PLANE, the clip having no thumb to tie it to: on the rig
  // that plane is the two rest offsets that meet at the wrist (palm, and back up the forearm).
  if (e.kind === "hand") return basis(dir, b3(CHILD_OFF[PARENT[e.g]]));
  if (e.kind === "leg") return basis(dir, new THREE.Vector3(1, 0, 0));
  return basis(dir, new THREE.Vector3(0, -1, 0));
}

// `A_b = M_b · G_b⁻¹` — the clip's semantic frame mapped onto the rig's. This file is a STILL, so
// there is no world delta to carry (`bake.js`'s `D_b(t)` is the identity): the pose IS the transfer.
const A = {};
for (const e of MAP) A[e.g] = new THREE.Matrix4().multiplyMatrices(clipFrame(e), new THREE.Matrix4().copy(gameFrame(e)).invert());
const L = {};                                    // the per-bone LOCAL quaternion of the pose
for (const e of MAP) {
  const p = PARENT[e.g];
  L[e.g] = new THREE.Quaternion().setFromRotationMatrix(p ? new THREE.Matrix4().copy(A[p]).invert().multiply(A[e.g]) : A[e.g]);
}

// --- rebuild the rig from those locals, and check them against the clip itself ---------------
function rebuild() {
  const w = {};
  for (const g of G_BONES) {
    const p = PARENT[g];
    w[g] = p
      ? { q: w[p].q.clone().multiply(L[g]), p: b3(G_OFF[g]).applyQuaternion(w[p].q).add(w[p].p) }
      : { q: L[g].clone(), p: b3(G_OFF[g]) };
  }
  return w;
}
const w = rebuild();
const fid = {};                                  // the rig's semantic frame vs the clip's, per bone
for (const e of MAP) {
  const rig = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeRotationFromQuaternion(w[e.g].q), gameFrame(e));
  const clipM = clipFrame(e);
  const a = new THREE.Vector3(1, 0, 0).applyMatrix4(rig);   // the bone's own segment axis
  const b = new THREE.Vector3(1, 0, 0).applyMatrix4(clipM);
  fid[e.g] = +(Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI).toFixed(3);
}
// the contacts, as this rig draws them, measured in the wall's frame relative to the hips
const CONTACT_REL = { handR: [0, HMY - WRY, HMZ - WRZ], handL: [0, HMY - WRY, HMZ - WRZ],
  footR: [0, -0.225, 0.05], footL: [0, -0.225, 0.05] };
const rigContacts = {}, clipContacts = {};
for (const g of ["handR","handL","footR","footL"]) {
  const c = b3(CONTACT_REL[g]).applyQuaternion(w[g].q).add(w[g].p);
  rigContacts[g] = [+c.x.toFixed(3), +c.y.toFixed(3), +c.z.toFixed(3)];   // x across, y up, z into the stone
}
// the clip's own four joints, in the same standing-up frame, relative to its hips
for (const [g, m] of [["handR","LeftHand"],["handL","RightHand"],["footR","LeftFoot"],["footL","RightFoot"]]) {
  const c = v3(m).sub(P["Hips"]);
  clipContacts[g] = [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)];
}
// how far the clip's own joints sit ahead of the hips along +z, and the rig's own for comparison
const depths = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v[2]]));

// --- WHERE THE LIMBS ACTUALLY LAND, and why the fields above read the way they do -----------
// A direction-only transfer carries the clip's ANGLES, not its distances, and this clip's own
// proportions are not the rig's. So each limb is walked out bone by bone here and reported in the
// wall's frame (x across the face, y up it, z into the stone), beside the clip's own joints scaled
// by the rig's leg (the clip's hip-to-ankle against this rig's 0.775 — `legScale` below), which is
// what a joint-by-joint comparison needs. Off `P` of a joint that is not in `MAP` this is a
// straight read of the rebuilt rig, not a second model of it.
const chain = {};
function worldOf(g) { return w[g]; }
const site = (g, rel) => b3(rel).applyQuaternion(w[g].q).add(w[g].p);
const rigJoint = {
  hips: [w.hips.p.x, w.hips.p.y, w.hips.p.z],
  shoulderR: w.armUpperR.p, shoulderL: w.armUpperL.p,
  elbowR: w.armLowerR.p, elbowL: w.armLowerL.p,
  wristR: w.handR.p, wristL: w.handL.p,
  kneeR: w.legLowerR.p, kneeL: w.legLowerL.p,
  ankleR: w.footR.p, ankleL: w.footL.p,
};
const toHips = (v) => [+(v.x - w.hips.p.x).toFixed(3), +(v.y - w.hips.p.y).toFixed(3), +(v.z - w.hips.p.z).toFixed(3)];
const rigJoints = Object.fromEntries(Object.entries(rigJoint).map(([k, v]) => [k, toHips(v)]));
// the angle between the rig's limb direction and the clip's, per limb (should be ~0: the frame
// check above uses the SEMANTIC frame; this one checks the segment the limb actually points down)
const segAng = {};
for (const [g, m, child] of [["armUpperR","LeftArm","LeftForeArm"],["armLowerR","LeftForeArm","LeftHand"],
  ["legUpperR","LeftUpLeg","LeftLeg"],["legLowerR","LeftLeg","LeftFoot"],
  ["armUpperL","RightArm","RightForeArm"],["armLowerL","RightForeArm","RightHand"],
  ["legUpperL","RightUpLeg","RightLeg"],["legLowerL","RightLeg","RightFoot"]]) {
  const rigD = b3(CHILD_OFF[g]).applyQuaternion(w[g].q).normalize();
  const clipD = v3(child).sub(v3(m)).normalize();
  segAng[g] = +(Math.acos(Math.max(-1, Math.min(1, rigD.dot(clipD)))) * 180 / Math.PI).toFixed(3);
}
const legScale = 0.775 / 84;                  // this rig's hip-to-ankle against the clip's (cm)
// the four contact points the POSE itself leaves, with the palm/sole offsets this rig draws
const contactOf = (g) => site(g, CONTACT_REL[g]);

// --- encode: 16 quaternions, int16, base64 — it is one pose, so there is one key ------------
const flat = new Int16Array(G_BONES.length * 4);
let o = 0;
for (const g of G_BONES) {
  const q = L[g];
  flat[o++] = Math.round(q.x * 32767); flat[o++] = Math.round(q.y * 32767);
  flat[o++] = Math.round(q.z * 32767); flat[o++] = Math.round(q.w * 32767);
}
const bytes = new Uint8Array(flat.buffer);
let bin = "";
for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
const b64 = btoa(bin);

const lines = [];
lines.push("// THE CLIMB IDLE, RETARGETED FROM THE USER'S POSE (session 163) — generated, do not hand-edit.");
lines.push("// Source: `climber_pose.fbx` (a 24-bone *\"photo-based pose reconstruction\"*, one held pose,");
lines.push("// no mesh, no fingers), stood up on its own contact plane and retargeted onto this rig's rest");
lines.push("// frames. ONE key — it is a still. See `poseClimbIdle` in streetwear.js.");
lines.push("const CLIMB_IDLE_Q = \"" + b64 + "\";");
lines.push("");
await fs.writeTextFile("scratch/climb-idle-table.js", lines.join("\n"));

return {
  clip: { name: clip.name, duration: clip.duration, bones: Object.keys(B).length,
    curves: clip.tracks.length, keysPerCurve: clip.tracks[0].times.length },
  b64Len: b64.length,
  align: { wallOffDeg: alignDeg, coplanarCm: +rawCoplanar.toFixed(2),
    clipOut: rawNorm.toArray().map(v => +v.toFixed(3)), clipUp: rawUp.toArray().map(v => +v.toFixed(3)),
    quat: [Rq.x, Rq.y, Rq.z, Rq.w].map(v => +v.toFixed(4)) },
  fidDeg: fid,
  segAngDeg: segAng,
  rigJoints,
  legScale: +legScale.toFixed(5),
  rigContacts, clipContacts,
  rigDepth: depths(rigContacts), clipDepth: depths(clipContacts),
  locals: Object.fromEntries(G_BONES.map(g => [g, [L[g].x, L[g].y, L[g].z, L[g].w].map(v => +v.toFixed(4))])),
  // where each clip joint landed after standing the pose up — the geometric read of the pose
  clipJoints: Object.fromEntries(["Hips","HeadTop_End","LeftHand","RightHand","LeftFoot","RightFoot","LeftLeg","RightLeg","LeftArm","RightArm"]
    .map(n => [n, [+(P[n].x - P["Hips"].x).toFixed(1), +(P[n].y - P["Hips"].y).toFixed(1), +(P[n].z - P["Hips"].z).toFixed(1)]])),
};
