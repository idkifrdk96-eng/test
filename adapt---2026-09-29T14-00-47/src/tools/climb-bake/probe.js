const buf = await fs.readFile("src/tools/climb-bake/Climbing_Up_Wall.fbx");
const THREE = await import("https://esm.sh/three@0.160.0");
const { FBXLoader } = await import("https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js");
const loader = new FBXLoader();
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const fbx = loader.parse(ab, "");
const clip = (fbx.animations || [])[0];

// find hips node
let hips = null;
fbx.traverse(o => { if (o.isBone && /Hips$/.test(o.name) && !hips) hips = o; });

const names = [];
fbx.traverse(o => { if (o.isBone) names.push(o.name); });

const KEYS = ["mixamorigHips","mixamorigSpine","mixamorigSpine1","mixamorigSpine2","mixamorigNeck","mixamorigHead",
  "mixamorigRightShoulder","mixamorigRightArm","mixamorigRightForeArm","mixamorigRightHand",
  "mixamorigLeftShoulder","mixamorigLeftArm","mixamorigLeftForeArm","mixamorigLeftHand",
  "mixamorigRightUpLeg","mixamorigRightLeg","mixamorigRightFoot",
  "mixamorigLeftUpLeg","mixamorigLeftLeg","mixamorigLeftFoot"];

const bone = {};
fbx.traverse(o => { if (o.isBone) bone[o.name] = o; });

// rest local positions (bind pose) and parent names
const rest = {};
for (const k of KEYS) {
  const b = bone[k];
  if (!b) { rest[k] = null; continue; }
  rest[k] = {
    parent: b.parent && b.parent.name,
    p: [b.position.x, b.position.y, b.position.z].map(v => +v.toFixed(4)),
    q: [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w].map(v => +v.toFixed(4)),
    kids: b.children.filter(c=>c.isBone).map(c=>c.name),
  };
}

// hips world translation over the clip: create mixer and sample
const mixer = new THREE.AnimationMixer(fbx);
const action = mixer.clipAction(clip);
action.play();
const N = 120; // sample 30fps frames
const trace = [];
const worldDirs = {};
for (const k of KEYS) worldDirs[k] = [];
const worldPos = {};
for (const k of KEYS) worldPos[k] = [];

function worldDir(b) {
  // direction from this bone's origin to its first bone child
  const c = b.children.find(x => x.isBone);
  if (!c) return null;
  const a = new THREE.Vector3(), bb = new THREE.Vector3();
  b.getWorldPosition(a); c.getWorldPosition(bb);
  return bb.sub(a).normalize();
}
const up = new THREE.Vector3(0,1,0);

for (let f = 0; f <= N; f++) {
  const t = (f / N) * clip.duration;
  mixer.setTime(t);
  fbx.updateMatrixWorld(true);
  const hp = new THREE.Vector3();
  bone["mixamorigHips"].getWorldPosition(hp);
  trace.push([+hp.x.toFixed(4), +hp.y.toFixed(4), +hp.z.toFixed(4)]);
  for (const k of KEYS) {
    const d = worldDir(bone[k]);
    worldDirs[k].push(d ? [+d.x.toFixed(3), +d.y.toFixed(3), +d.z.toFixed(3)] : null);
    const p = new THREE.Vector3(); bone[k].getWorldPosition(p);
    worldPos[k].push([+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)]);
  }
}

// world-root scale: compute overall bounds
const box = new THREE.Box3().setFromObject(fbx);
const size = box.getSize(new THREE.Vector3());

await fs.writeTextFile("scratch/climb-probe.json", JSON.stringify({
  names, rest, trace, worldDirs, worldPos,
  duration: clip.duration,
  rootScale: [fbx.scale.x, fbx.scale.y, fbx.scale.z],
  boundsMin: [box.min.x, box.min.y, box.min.z].map(v=>+v.toFixed(3)),
  boundsMax: [box.max.x, box.max.y, box.max.z].map(v=>+v.toFixed(3)),
}, null, 0));

// compact report
const report = {
  duration: clip.duration,
  bounds: { min: [box.min.x, box.min.y, box.min.z].map(v=>+v.toFixed(3)), max: [box.max.x, box.max.y, box.max.z].map(v=>+v.toFixed(3)), size: [size.x,size.y,size.z].map(v=>+v.toFixed(3)) },
  hipsTraceY: trace.map(t => t[1]),
  hipsTraceMinMax: { min: Math.min(...trace.map(t=>t[1])), max: Math.max(...trace.map(t=>t[1])) },
  restHipsP: rest["mixamorigHips"].p,
  numBones: names.length,
};
return report;
