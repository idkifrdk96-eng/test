// ---------------------------------------------------------------------------
// THE BALL-ACTION BAKE (session 180) — the two Mixamo clips the user supplied for the ball, run
// through the same offline retarget `src/tools/climb-bake/bake.js` uses, and keyed into the two
// pose tables the game wears (`THROW_Q`, `SHOOT_Q` in `src/streetwear.js`).
//
// RUN THIS FILE WITH THE EDITOR'S `execute_js` (it needs the workspace `fs`) — see README.md beside
// it. It writes `scratch/action-table.js`, whose literals are pasted into `src/streetwear.js` by
// hand; they are generated, never edited.
//
// TWO THINGS MAKE THIS NOT JUST `bake.js` AGAIN:
//
//   * IT KEYS A WINDOW, NOT A CYCLE. The climb is a loop and gets 61 keys wrapping onto key 0;
//     these are ONE-SHOTS, so each action names the slice of its clip that IS the action — the
//     wind-up through the follow-through — and the table simply runs 0..1 across it. The table's
//     own `release` key (where the ball leaves the hand or the boot) is measured here and reported
//     in FRACTIONS, because that is the number the runtime has to know: `player.js` spends the
//     ball's own launch off it (see `poseThrow` / `poseShoot` in streetwear.js).
//
//   * IT DROPS THE ROOT'S TRANSLATION. Both clips carry their own locomotion — the drop kick walks
//     nearly 3.5 m, the strike hops — and a game action plays ON a body the player is already
//     driving. The whole table is therefore ROTATIONS ONLY: sixteen bone quaternions, no hip
//     offset. What the clip's own foot placement then does is whatever this rig's leg lengths do
//     with the clip's joint ANGLES, which is the whole point of a direction-only retarget.
//
// The retarget itself is `bake.js`'s, verbatim: build each bone's SEMANTIC frame on the clip from
// its own joint positions (segment direction + hinge / palm / sole), measure the same frame on this
// rig at rest, and carry the clip's world delta `D_b(t)` across as `A_b(t) = D_b(t)·M_b(f0)·G_b⁻¹`.
// The one change is that `f0` is picked PER BONE here (the frame in which that bone's own hinge is
// least degenerate) rather than once for the whole body — the same file, a better-conditioned
// reference. The clip's `Left*` bones drive this rig's `R`-named bones, exactly as in `bake.js`.
// ---------------------------------------------------------------------------
const THREE = await import("https://esm.sh/three@0.160.0");
const { FBXLoader } = await import("https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js");

const FPS = 24;
// The two actions. `from`/`to` are SECONDS into the clip; `release` is the second the ball leaves.
const ACTIONS = [
  {
    key: "THROW",
    file: "Goalkeeper_Drop_Kick.fbx",
    from: 2.20, to: 3.20, release: 2.826,
    note: "the right arm's wind-up over the shoulder and the overhand throw out of it",
  },
  {
    key: "SHOOT",
    file: "Strike_Foward_Jog.fbx",
    from: 0.28, to: 0.90, release: 0.490,
    note: "the right leg's wind-back and the strike forward, off a jogging body",
  },
];

const NEED = ["mixamorigHips","mixamorigSpine","mixamorigSpine1","mixamorigSpine2","mixamorigNeck","mixamorigHead",
  "mixamorigHeadTop_End","mixamorigLeftShoulder","mixamorigLeftArm","mixamorigLeftForeArm","mixamorigLeftHand","mixamorigLeftHandMiddle1","mixamorigLeftHandThumb1",
  "mixamorigRightShoulder","mixamorigRightArm","mixamorigRightForeArm","mixamorigRightHand","mixamorigRightHandMiddle1","mixamorigRightHandThumb1",
  "mixamorigLeftUpLeg","mixamorigLeftLeg","mixamorigLeftFoot","mixamorigLeftToeBase",
  "mixamorigRightUpLeg","mixamorigRightLeg","mixamorigRightFoot","mixamorigRightToeBase"];

// --- this rig's own rest geometry (identical to `bake.js` — it is the rig, not the clip) --------
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
const CHILD_OF = {
  torso: "mixamorigNeck", neck: "mixamorigHead",
  armUpperR: "mixamorigLeftForeArm", armLowerR: "mixamorigLeftHand",
  armUpperL: "mixamorigRightForeArm", armLowerL: "mixamorigRightHand",
  legUpperR: "mixamorigLeftLeg", legLowerR: "mixamorigLeftFoot",
  legUpperL: "mixamorigRightLeg", legLowerL: "mixamorigRightFoot",
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

// --- the clip's own semantic frame for one bone, at one frame --------------------------------
// (identical to `bake.js`'s `clipFrame`, plus `hingeScore`, which is what picks this bone's f0)
function clipFrame(e, f, P) {
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
// how well-conditioned that frame is: the normalised cross that `basis` uses as its own reference.
function hingeScore(e, f, P) {
  const p = v3(P[e.m][f]);
  if (e.kind === "hand") {
    const dir = v3(P[e.fin][f]).sub(p);
    return new THREE.Vector3().crossVectors(dir, v3(P[e.thumb][f]).sub(p)).length() / Math.max(1e-6, dir.length());
  }
  if (e.kind === "trunk") {
    const dir = e.g === "hips" ? v3(P.mixamorigSpine[f]).sub(p)
      : e.g === "head" ? v3(P.mixamorigHeadTop_End[f]).sub(p)
      : v3(P[CHILD_OF[e.g]][f]).sub(p);
    const ref = e.g === "hips" ? v3(P.mixamorigLeftUpLeg[f]).sub(v3(P.mixamorigRightUpLeg[f]))
      : v3(P.mixamorigLeftShoulder[f]).sub(v3(P.mixamorigRightShoulder[f]));
    return new THREE.Vector3().crossVectors(dir.normalize(), ref.normalize()).length();
  }
  if (e.kind === "foot") {
    const dir = v3(P[e.toe][f]).sub(p).normalize();
    return new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, -1, 0)).length();
  }
  const child = CHILD_OF[e.g];
  const dir = v3(P[child][f]).sub(p).normalize();
  let w;
  if (e.kind === "arm") {
    w = e.g.startsWith("armUpper")
      ? v3(P[e.s === 1 ? "mixamorigLeftHand" : "mixamorigRightHand"][f]).sub(v3(P[child][f])).normalize()
      : v3(P[e.s === 1 ? "mixamorigLeftArm" : "mixamorigRightArm"][f]).sub(v3(P[e.s === 1 ? "mixamorigLeftShoulder" : "mixamorigRightShoulder"][f])).normalize();
  } else {
    w = e.g.startsWith("legUpper")
      ? v3(P[e.s === 1 ? "mixamorigLeftFoot" : "mixamorigRightFoot"][f]).sub(v3(P[child][f])).normalize()
      : v3(P[e.s === 1 ? "mixamorigLeftLeg" : "mixamorigRightLeg"][f]).sub(v3(P[e.s === 1 ? "mixamorigLeftUpLeg" : "mixamorigRightUpLeg"][f])).normalize();
  }
  return new THREE.Vector3().crossVectors(dir, w).length();
}
function gameFrame(e) {
  const dir = v3(CHILD_OFF[e.g]);
  if (e.kind === "trunk") return basis(dir, new THREE.Vector3(1, 0, 0));
  if (e.kind === "arm") return basis(dir, new THREE.Vector3(1, 0, 0));
  if (e.kind === "hand") return basis(dir, new THREE.Vector3(-e.s, 0, 0));
  if (e.kind === "leg") return basis(dir, new THREE.Vector3(1, 0, 0));
  return basis(dir, new THREE.Vector3(0, -1, 0));
}

// --- the rig, rebuilt from a table of locals (the fidelity check and the yaw report) ----------
function rebuildWorld(loc) {
  const w = {};
  for (const g of G_BONES) {
    const p = PARENT[g];
    const off = v3(G_OFF[g]);
    if (!p) {
      w[g] = { q: loc[g].clone(), p: off.clone() };
    } else {
      const lp = off.clone().applyQuaternion(w[p].q).add(w[p].p);
      w[g] = { q: w[p].q.clone().multiply(loc[g]), p: lp };
    }
  }
  return w;
}

const results = {};
const literals = [];
for (const A of ACTIONS) {
  const buf = await fs.readFile("src/tools/action-bake/" + A.file);
  const fbx = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
  const clip = fbx.animations[0];
  const B = {};
  fbx.traverse((o) => { if (o.isBone) B[o.name] = o; });
  const mixer = new THREE.AnimationMixer(fbx);
  mixer.clipAction(clip).play();

  const NF = Math.round(clip.duration * FPS) + 1;          // frames 0..NF-1
  const Q = {}, P = {};
  for (const n of NEED) { Q[n] = []; P[n] = []; }
  for (let f = 0; f < NF; f++) {
    mixer.setTime(f / FPS);
    fbx.updateMatrixWorld(true);
    for (const n of NEED) {
      Q[n].push(B[n].getWorldQuaternion(new THREE.Quaternion()).clone());
      P[n].push(B[n].getWorldPosition(new THREE.Vector3()).clone());
    }
  }
  // ...and one wrap frame, so the last key can be interpolated through the loop point
  mixer.setTime(clip.duration);
  fbx.updateMatrixWorld(true);
  for (const n of NEED) {
    Q[n].push(B[n].getWorldQuaternion(new THREE.Quaternion()).clone());
    P[n].push(B[n].getWorldPosition(new THREE.Vector3()).clone());
  }

  // --- per-bone f0: the frame where this bone's own hinge is least degenerate ------------------
  const F0 = {};
  for (const e of MAP) {
    let best = -1, bf = 0;
    for (let f = 0; f < NF; f += 1) {
      const s = hingeScore(e, f, P);
      if (s > best) { best = s; bf = f; }
    }
    F0[e.g] = bf;
  }
  // --- C_b(t): the clip's world delta from the BIND, per frame --------------------------------
  const C = {};
  for (const e of MAP) C[e.g] = Q[e.m].map((q) => q.clone().multiply(Q[e.m][0].clone().invert()));
  const A0 = {};
  for (const e of MAP) {
    A0[e.g] = new THREE.Matrix4().multiplyMatrices(clipFrame(e, F0[e.g], P), new THREE.Matrix4().copy(gameFrame(e)).invert());
  }
  // --- the local quaternion of every bone, every frame ----------------------------------------
  const Rq = {};
  for (const e of MAP) Rq[e.g] = [];
  for (let f = 0; f <= NF; f++) {
    const Amat = {};
    for (const e of MAP) Amat[e.g] = new THREE.Matrix4().makeRotationFromQuaternion(C[e.g][f].clone().multiply(C[e.g][F0[e.g]].clone().invert())).multiply(A0[e.g]);
    for (const e of MAP) {
      const p = PARENT[e.g];
      Rq[e.g].push(new THREE.Quaternion().setFromRotationMatrix(p ? new THREE.Matrix4().copy(Amat[p]).invert().multiply(Amat[e.g]) : Amat[e.g]));
    }
  }
  // --- the table: the window, every frame ------------------------------------------------------
  const f0 = Math.round(A.from * FPS), f1 = Math.round(A.to * FPS);
  const NK = f1 - f0 + 1;
  const keyQ = G_BONES.map(() => []);
  for (let k = 0; k < NK; k++) {
    const f = f0 + k;
    for (let i = 0; i < G_BONES.length; i++) keyQ[i].push(Rq[G_BONES[i]][f].clone());
  }
  // --- THE BODY'S OWN TURN, TAKEN OUT (the in-place pass) -------------------------------------
  // Both clips are run-up clips and BOTH of them TURN: the drop kick swings the pelvis from −72° to
  // +65° and back, the strike from −25° to +55°. That is the clip's own locomotion — the character
  // is running a curve and turning into the ball — and it is the one part of the clip the GAME
  // cannot wear, because the player owns the facing: played as-is, a shot would spin the whole
  // figure half a turn off the line the camera is looking down.
  //
  // So the pelvis' YAW is zeroed at every key, by premultiplying the HIPS' own local quaternion with
  // the rotation that takes its forward back onto the rig's +z. The hips are the root of the chain,
  // so that one write carries the whole body — and because every bone is turned by the same angle on
  // a given key, every RELATIVE joint angle in the pose is untouched: the chest's twist against the
  // pelvis, the hip's opening, the swing of the arms. What is left is the shape, aimed down the
  // body's own nose — which is exactly what an in-place action is.
  const HIPS_I = G_BONES.indexOf("hips");
  const _yq = new THREE.Quaternion();
  const _yax = new THREE.Vector3(0, 1, 0);
  const faceYaw = [];
  for (let k = 0; k < NK; k++) {
    const loc = {};
    for (let i = 0; i < G_BONES.length; i++) loc[G_BONES[i]] = keyQ[i][k];
    const w = rebuildWorld(loc);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(w.hips.q);
    faceYaw.push(+(Math.atan2(fwd.x, fwd.z) * 180 / Math.PI).toFixed(1));
  }
  // --- fidelity: the rig's own bone directions vs the clip's, every frame of the window --------
  const fid = {};
  for (const g of G_BONES) fid[g] = [];
  for (let k = 0; k < NK; k++) {
    const loc = {};
    for (let i = 0; i < G_BONES.length; i++) loc[G_BONES[i]] = keyQ[i][k];
    const w = rebuildWorld(loc);
    for (const e of MAP) {
      const d = v3(CHILD_OFF[e.g]).normalize().applyQuaternion(w[e.g].q);
      let cd;
      if (e.kind === "hand") cd = v3(P[e.fin][f0 + k]).sub(v3(P[e.m][f0 + k])).normalize();
      else if (e.kind === "foot") cd = v3(P[e.toe][f0 + k]).sub(v3(P[e.m][f0 + k])).normalize();
      else if (e.kind === "trunk") cd = (e.g === "head" ? v3(P.mixamorigHeadTop_End[f0 + k]).sub(v3(P[e.m][f0 + k])) : v3(P[e.g === "hips" ? "mixamorigSpine" : CHILD_OF[e.g]][f0 + k]).sub(v3(P[e.m][f0 + k]))).normalize();
      else cd = v3(P[CHILD_OF[e.g]][f0 + k]).sub(v3(P[e.m][f0 + k])).normalize();
      fid[e.g].push(+(Math.acos(Math.max(-1, Math.min(1, d.dot(cd)))) * 180 / Math.PI).toFixed(2));
    }
  }
  const fidMax = {};
  for (const g of G_BONES) fidMax[g] = Math.max(...fid[g]);

  // ...and only NOW is the body's turn taken out (the note above): the fidelity check reads the
  // pose as the retarget left it, so it has to run before this, and the literal has to carry the
  // corrected table. `faceYaw` above is the clip's own heading per key — the amount removed here.
  for (let k = 0; k < NK; k++) {
    if (!faceYaw[k]) continue;
    _yq.setFromAxisAngle(_yax, -(faceYaw[k] * Math.PI / 180));
    keyQ[HIPS_I][k].premultiply(_yq).normalize();
  }

  // --- encode: 16 quaternions per key, int16, base64 -------------------------------------------
  const stride = G_BONES.length * 4;
  const flat = new Int16Array(NK * stride);
  let o = 0;
  for (let k = 0; k < NK; k++) {
    for (let i = 0; i < G_BONES.length; i++) {
      const q = keyQ[i][k];
      flat[o++] = Math.round(q.x * 32767); flat[o++] = Math.round(q.y * 32767);
      flat[o++] = Math.round(q.z * 32767); flat[o++] = Math.round(q.w * 32767);
    }
  }
  const bytes = new Uint8Array(flat.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  const releaseK = (A.release * FPS - f0) / (NK - 1);

  literals.push("// THE " + A.key + " — " + A.note + " (session 180). ONE-SHOT: " + NK + " keys over");
  literals.push("// " + A.from.toFixed(2) + "s.." + A.to.toFixed(2) + "s of `" + A.file + "`, rotations only, no hip ride.");
  literals.push("const " + A.key + "_KEYS = " + NK + ";");
  literals.push("const " + A.key + "_SECONDS = " + (A.to - A.from).toFixed(3) + ";");
  literals.push("const " + A.key + "_RELEASE = " + releaseK.toFixed(4) + ";   // where the ball leaves, in 0..1 of the shape");
  literals.push("const " + A.key + "_Q = \"" + b64 + "\";");
  literals.push("");
  results[A.key] = {
    file: A.file, from: A.from, to: A.to, NK, releaseK: +releaseK.toFixed(4),
    hipYRange: [Math.min(...P.mixamorigHips.map(v => v.y)), Math.max(...P.mixamorigHips.map(v => v.y))].map(v => +v.toFixed(1)),
    hipTravel: +Math.hypot(P.mixamorigHips[NF].x - P.mixamorigHips[0].x, P.mixamorigHips[NF].z - P.mixamorigHips[0].z).toFixed(1),
    faceYaw, fidMax, b64Len: b64.length,
  };
}
await fs.writeTextFile("scratch/action-table.js", literals.join("\n"));
return results;
