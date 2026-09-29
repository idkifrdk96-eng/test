// ---------------------------------------------------------------------------
// THE STAFF (part 2 of the player.js split).
//
// Everything about the pole the game carries lives here: the scratch it is solved
// with, `composePole` (the form's path as a matrix in the rig's frame), `shaftGap`
// (the whole of its hitbox), and its nineteen methods. The methods are attached to
// `Player.prototype` by `installPole`, which player.js calls once after the class —
// they are the class's own method bodies moved verbatim, so nothing about how they
// run has changed.
//
// It is a LEAF with respect to player.js: it imports three.js, `POLE`, `P` (from
// player/config.js) and the shared math, and player.js imports back the pieces its
// own `updateVisual` still reads (`composePole` and the scratch it solves the
// carried staff into). No circular import.
//
// The doc comment inside `poleMethods` is the feature's own; it was written where
// the methods were and moved with them.
// ---------------------------------------------------------------------------
import * as THREE from "../three.js";
import { POLE } from "../pole.js";
import { P } from "./config.js";
import { TAU, approach, smooth01 } from "./math.js";

// ---------------------------------------------------------------------------
// THE POLE's own scratch (see the `POLE_*` block, and `poleHold` / `posePole` in streetwear.js).
// The staff is the one item in the game whose weapon is a WORLD OBJECT, so this file needs two
// things nothing else does: a way to express the prop's transform in the RIG's own frame (the pose
// is authored there and the prop is not), and ONE measured segment for what the staff is touching.
// Both live here.
//
// `_poleHold` is the READ streetwear hands back every frame — the shaft's own path plus the body
// posture authored next to it (see `poleHold`). It is one object, mutated in place: it is read on
// every frame of every pole move, and a fresh object per frame is a garbage-collector stumble in
// the middle of a move that is already holding a two-metre prop.
const _poleHold = {
  g: new THREE.Vector3(),
  pitch: 0.07, yaw: 0, hf: 0.40, hs: 0.30, roll: 0, spin: 0,
  hip: 0.975, lean: 0.02, hyaw: -0.05, tyaw: 0.04, headx: 0.02, heady: -0.04,
  hands: 1, dangle: 0, grip: 1, legBlend: 0,
  // ...and the three beat tables the SHAPE is authored on (`poleHold` in streetwear.js writes them
  // back with every read): the strike's contacts, the frame the wood gives, and the share the throw
  // lets go on. The mover spends the answer twice — once for the pose, once for the hitboxes — so
  // the beats that hit and the beats that are drawn are the same number, which is the whole reason
  // they live in one object with the shape.
  hits: null, breakT: 0.58, release: 0.30,
  // ---- THE VAULT'S OWN REVOLUTION (session 185) -------------------------------------------------
  // The rig's angle through the staff's front flip, in radians, written by the mover just before the
  // shape is read (`solvePoleBody`) and read by the vault alone: the wood is mounted in the rig's
  // frame, so a shape that authored the staff's direction in the rig's frame would have it go round
  // with the body. `poleHoldVault` authors the staff's direction IN THE WORLD instead and spends it
  // through this — `pitch = aim - flip` — so the wood holds its line while the body turns under it.
  // Note that it is the RIG's angle (from `poleFlipAngle`), and not the shape's own clock: the two
  // are the same number by construction (see the note on the flip's clock in config.js).
  flip: 0,
  legR: [0, 0, 0, 0, 0],
  legL: [0, 0, 0, 0, 0],
  // ---- THE LEGS (session 152) -------------------------------------------------------------------
  // `legMode` says HOW a shape's legs are to be spent, because the two kinds of pole move need
  // different things from the same rig:
  //   0 = none — the base layer keeps them (the carry: a staff on your shoulder does not change how
  //       you walk);
  //   1 = AUTHORED ANGLES — `legR`/`legL` are `poseLegAngles`' own read ([blend, thigh, knee, sole,
  //       splay]) and are taken outright. Only the vault uses this: mid-revolution there is no deck
  //       for a foot to be planted on, so the only honest way to hold the legs is to author them
  //       (see `poleHoldVault`);
  //   2 = SOLVED ON THE DECK — `legZ*`/`legLift*`/`legSplay*` are a STEP: the ankle is solved by
  //       `poseLegIK` at a forward offset `legZ*` from the hips, lifted `legLift*` off the deck, and
  //       rolled `legSplay*` off the midline. This is the whole of what the strike and the throw
  //       were missing (the user, session 152: *"MAKE THE STAFF ANIMATION HAVE LEG ANIMATIONS AND
  //       TORSO ANIMATIONS"* / *"THERE IS NOT TORSO AND HEAD ANIMATIONS AND LEGS ANIMATIONS ONLY
  //       THE ARMS ARE MOVING"*) — both moves authored the trunk and the shaft and left the legs to
  //       the standing idle underneath, so a man threw a javelin with a pedestrian's feet.
  legMode: 0,
  legZR: 0, legZL: 0, legLiftR: 0, legLiftL: 0, legSplayR: 0.16, legSplayL: 0.22,
};
const _poleWanted = new THREE.Matrix4();
const _polePlant = new THREE.Matrix4();
const _poleM = new THREE.Matrix4();
const _poleInv = new THREE.Matrix4();
const _poleWorld = new THREE.Matrix4();
const _poleMount = new THREE.Matrix4();
const _poleTrunk = new THREE.Matrix4();      // the trunk's delta, for the carried staff (see `trunkDelta`)
const _poleCentre = new THREE.Vector3();      // the shaft's midpoint, solved by `composePole`
const _poleP = new THREE.Vector3();
const _poleP2 = new THREE.Vector3();
const _poleQ = new THREE.Quaternion();
const _poleQ2 = new THREE.Quaternion();
const _poleGrip = new THREE.Vector3();         // where the hands hold the shaft, in the rig's frame
const _poleSpin = new THREE.Matrix4();         // ...the haul's own tilt, and the two halves of
const _poleTwist = new THREE.Matrix4();        //    rotating about that point rather than the origin
const _poleS = new THREE.Vector3();
const _poleS2 = new THREE.Vector3();
const _poleOne = new THREE.Vector3(1, 1, 1);
const _poleAxis = new THREE.Vector3();
const _poleUp = new THREE.Vector3(0, 1, 0);
const _poleMid = new THREE.Vector3();
const _poleButt = new THREE.Vector3();

// The form's path, as a MATRIX in the rig's own frame: the shaft runs along the local +Y, its
// middle at the origin, and `a.hf` is how far up it from the BUTT the hands are (so the hands'
// point sits `(0.5 - hf) * len` along the shaft from its middle). `len` is the shaft's length in
// the units of the frame it is being expressed in — rig units here, world units on the mount.
function composePole(out, a, len) {
  const sp = Math.sin(a.pitch);
  _poleAxis.set(sp * Math.sin(a.yaw), Math.cos(a.pitch), sp * Math.cos(a.yaw));
  _poleCentre.copy(a.g).addScaledVector(_poleAxis, len * (0.5 - a.hf));
  _poleQ2.setFromUnitVectors(_poleUp, _poleAxis);
  // ...and THE SHAFT'S OWN SPIN (`roll`): the prop is a rod, and a rod spun about its own length is
  // the one rotation that moves NOTHING — not the hands (they are solved onto points ON the line),
  // not the grip, not the hitbox, and not the wrists (`poseWristTo` reads the shaft's second basis
  // column, which a roll about it leaves alone). All it moves is the wood: six flat faces catching
  // the light a different way every frame, which is most of what makes a two-metre stick read as
  // SPINNING rather than as being waved (see `poleHoldStrike`'s `roll`).
  _poleQ2.multiply(_poleQ.setFromAxisAngle(_poleUp, a.roll || 0));
  out.compose(_poleCentre, _poleQ2, _poleOne);
  return out;
}

// How far a point is off a segment — the whole of the staff's hitbox (see `poleStrikeContact`). Every
// other strike in the game is a wedge thrown out of the body, because every other strike IS the
// body; a staff is a stick, and the thing that hits is the line between its ends.
function shaftGap(px, py, pz, a, b) {
  const ax = b.x - a.x, ay = b.y - a.y, az = b.z - a.z;
  const wx = px - a.x, wy = py - a.y, wz = pz - a.z;
  const ll = ax * ax + ay * ay + az * az;
  let s = ll > 1e-8 ? (wx * ax + wy * ay + wz * az) / ll : 0;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  const dx = wx - ax * s, dy = wy - ay * s, dz = wz - az * s;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export { _poleHold, _poleWanted, _polePlant, _poleM, _poleInv, _poleWorld, _poleMount, _poleTrunk, _poleP, _poleP2, _poleQ, _poleQ2, _poleGrip, _poleSpin, _poleTwist, _poleS, _poleS2, _poleOne, composePole };

const poleMethods = {

  // =========================================================================
  // THE POLE — the staff you CARRY (see `P`'s `POLE_*` block, `pole.js`, `poleHold` / `posePole` in
  // streetwear.js, and "THE POLE" in src/README.md).
  //
  // It used to be a form: a staff stood in the world, the right button tore it out of the ground and
  // a twenty-beat kata played itself out and snapped the pole at the end of it. That is all gone. A
  // staff is a THING HE CARRIES now, and the four things it can do are:
  //
  //   (no key)   CARRY IT. The take is a pickup and nothing else — no clock, no commitment, no move.
  //              It costs the legs a little (`POLE_CARRY_MUL`), it rides the rig across every other
  //              state in the game, and it has DURABILITY (`poleHp`): a staff is good for
  //              `POLE_HP` strikes and then it goes in his hands (see `poleStrike`).
  //   M1         THE STRIKE — three beats of flurry thrown FORWARD on a real carry. Flashy by
  //              construction (one whole body revolution, the shaft rolling on its own axis, a
  //              wind-up and an overshoot on every beat) and, per the brief, never stationary.
  //   M2         THE THROW — cocked and hurled. The prop leaves the hand as a real world object on a
  //              real line, and it BREAKS: on the first body it finds, on the deck it lands on, or
  //              when it has flown `POLE_THROW_RANGE`. No rebound, no return.
  //   double jump THE VAULT (session 185) — he flips FORWARD over the staff instead of leaping,
  //              driving its tip into the deck; the strike is the launch (a real, very fast throw
  //              forward and up) and it breaks the staff. It replaced the Shaolin BALANCE: the user's
  //              *"its not holdable anymore"* retired the hang.
  //
  // THE CARRY IS NOT A STATE. The staff is an ATTACHMENT — `poleHeld` is the prop and it rides the
  // rig the way the tote's duffel does — so everything the body can do without a staff it can still
  // do with one, and the three MOVES above are the only states this feature adds. The one exception
  // is the brief's own third line: no WALL SLIDE while the wood is in his hands (see the attach
  // block in `update`).
  //
  // THE SHAFT IS THE HITBOX, as it always was: every other strike in the game is a wedge thrown out
  // of the body because every other strike IS the body, but a staff is a two-metre LINE, so the
  // wedge only shortlists and `shaftGap` decides — each body is measured against the segment between
  // the shaft's own published ends (`poleShaftA/B`), which `updateVisual` writes off the matrix the
  // PROP was actually mounted on. One number, so the drawn stick and the thing that hits are the
  // same line.
  // =========================================================================

  // Is there a staff to take? (pole.js). The right click asks this before it asks about bodies.
  poleNear() {
    if (!this.poles) return null;
    return this.poles.nearest(this.pos.x, this.pos.z, Math.sin(this.facing), Math.cos(this.facing));
  },

  // IS THE WOOD IN HIS HANDS. Two facts, not one: `poleHeld` is the handle to the PROP, and the prop
  // goes on being his while it is in the air — `updatePoleFlight` owns it from the release until it
  // breaks, and it needs the handle to keep owning it (see the note on the flight's tick). So every
  // read that means "he is carrying it" goes through here rather than testing `poleHeld`, or a man
  // who has just hurled his staff off a roof would go on paying the carry's weight, being refused the
  // wall, and swinging an empty fist through a flurry (see `moveTarget`, `noGrip`, `poleStrike`).
  holdingPole() {
    return !!this.poleHeld && !this.poleFly;
  },

  // THE TAKE — the brief's *"i grab the pole normally"*. No form, no clock, no attack: the prop
  // changes hands (its own `state` goes to "held", which is what stops anybody else taking it) and
  // the haul out of the deck runs from here over `POLE_LIFT_T` (see `updatePoleCarry` for the clock
  // and the step in, and the blend in `updateVisual` for the haul itself). Returns false when there
  // is nothing to take, so `grab` falls straight through to the three animals and the whiff.
  poleTake(p) {
    if (!p || this.poleHeld) return false;
    if (!this.canSkill()) return false;
    this.poleHeld = p;
    p.state = "held";
    this.poleHp = P.POLE_HP;
    this.poleLiftT = 0;
    this.poleLift = 0;
    this.poleMode = "carry";
    this.poleT = 0;
    this.poleGroundY = p.groundY != null ? p.groundY : this.pos.y;
    this.attackBuf = 0;
    // The butt clears the deck it was planted in, so the grit belongs at the prop's own spot (see
    // the `poletake` event in main.js). Nothing else is published: there is no clock to read.
    this.events.push("poletake");
    return true;
  },

  // THE CARRY, ticked every frame the staff is in his hands — above the state switch in `update`,
  // because the carry is not a state and has to run under all of them (a run, a jump, a slide).
  //
  // Two things live here. The HAUL's own clock (`poleLift`, 0..1 over `POLE_LIFT_T`), which the
  // blend in `updateVisual` reads; and THE STEP IN, which closes the gap between the body and the
  // wood so the hands can reach it while it is still in the ground. The step is a VELOCITY rather
  // than a placement, so the world's own collision still has a say in where he ends up, and it is
  // over well before the shaft is free of the deck.
  updatePoleCarry(dt) {
    if (!this.poleHeld) {
      this.poleLiftT = 0;
      this.poleLift = 0;
      return;
    }
    this.poleLiftT += dt;
    this.poleLift = Math.min(1, this.poleLiftT / P.POLE_LIFT_T);
    const p = this.poleHeld;
    if (p && this.poleLiftT < P.POLE_STEP_T) {
      this.poleStepIn(p, dt);
    }
  },

  // The one step onto the staff's BASE — not onto its SITE. A staff stands at its own lean
  // (`POLE.LEAN`, and the lean is random per prop), so its butt is displaced from the cell it is
  // planted in by up to a third of a unit, and the butt is the end that ends up beside a boot as it
  // is hauled out. Walking to the site therefore leaves the base wherever the lean threw it; walking
  // to the BASE puts the shaft's own bottom end in the gap between his feet, whichever way it
  // happens to be leaning.
  poleStepIn(p, dt) {
    _poleButt.set(0, -POLE.LEN * 0.5, 0).applyMatrix4(p.plantM);
    const dx = this.pos.x - _poleButt.x;
    const dz = this.pos.z - _poleButt.z;
    const d = Math.hypot(dx, dz) || 1;
    const gx = (_poleButt.x + (dx / d) * P.POLE_TAKE) - this.pos.x;
    const gz = (_poleButt.z + (dz / d) * P.POLE_TAKE) - this.pos.z;
    const gl = Math.hypot(gx, gz);
    if (gl > 0.03) {
      const sp = Math.min(11, gl * 8.5);
      this.vel.x = (gx / gl) * sp;
      this.vel.z = (gz / gl) * sp;
    } else {
      this.vel.x = approach(this.vel.x, 0, 30 * dt);
      this.vel.z = approach(this.vel.z, 0, 30 * dt);
    }
  },

  // LET THE STAFF GO — back to the deck it came out of, as it was (`Poles.release` re-plants the
  // prop on its own numbers). This is the DROP: a respawn (see `Player.respawn`) and nothing else
  // any more, because the throw and the launch both BREAK the staff rather than putting it down.
  releasePole() {
    if (this.poleHeld && this.poles) this.poles.release(this.poleHeld);
    this.poleHeld = null;
    this.poleFly = null;
    this.poleReleased = false;
    this.poleLiftT = 0;
    this.poleLift = 0;
    this.poleMode = "carry";
    this.poleT = 0;
    this.poleAtkSpin = 0;
  },

  // THE STAFF GOES. One function, three callers (the strike that runs the durability out, the
  // throw's landing, and the launch), because the staff breaking is one event however it was
  // reached: the prop is handed to `Poles.shatter` with the line it was travelling on and the axis
  // its shaft ran in (which is what throws the two halves apart), and the shock that follows is the
  // same for all three — a wide, shallow hit that reaches through ragdolls too, because two metres
  // of wood coming apart beside you is not a punch.
  //
  // `dirX/dirZ` is the direction the pieces are thrown; `at` is where the cut is, and defaults to
  // the middle of the shaft's published line (which is where a STRIKE's break happens — the wood is
  // in his hands and the line is the one the hitbox just used).
  poleBreak(dirX, dirZ, at) {
    const p = this.poleHeld;
    if (!p || !this.poles) return;
    const a = this.poleShaftA;
    const b = this.poleShaftB;
    const midX = at ? at.x : (a.x + b.x) * 0.5;
    const midY = at ? at.y : (a.y + b.y) * 0.5;
    const midZ = at ? at.z : (a.z + b.z) * 0.5;
    const ax = b.x - a.x;
    const ay = b.y - a.y;
    const az = b.z - a.z;
    const al = Math.hypot(ax, ay, az) || 1;
    this.poles.shatter(p, _poleMid.set(midX, midY, midZ), dirX, dirZ, ax / al, ay / al, az / al, 1);
    this.poleHeld = null;
    this.poleFly = null;
    this.poleReleased = false;
    this.lastPoleBreak = { x: midX, y: midY, z: midZ, dx: dirX, dz: dirZ };
    this.events.push("poleshatter");
    if (!this.enemies || !this.enemies.spawned) return;
    const list = this.enemies.inFront(midX, midZ, dirX, dirZ, P.POLE_BREAK_R, Math.PI, null, { ragdolls: true });
    for (const e of list) {
      const dx = e.pos.x - midX;
      const dz = e.pos.z - midZ;
      const dl = Math.hypot(dx, dz) || 1;
      const fr = Math.max(0, 1 - dl / P.POLE_BREAK_R);
      e.hit("flight", dx / dl, dz / dl,
        P.POLE_BREAK_KNOCK * (0.45 + 0.55 * fr), P.POLE_BREAK_STUN,
        { dmg: P.POLE_BREAK_DMG, force: true, lift: 4.0 + 6.0 * fr });
    }
  },

  // =========================================================================
  // M1 — THE STRIKE.
  //
  // The brief, verbatim: *"when i press m1 i do an attack flashy animation that looks really really
  // cool and must be moving forward it cannot be stationary"*. Both halves of that are load-bearing
  // and they are two different mechanisms:
  //
  //   THE SHAPE is streetwear.js's (`poleHoldStrike`): a wind over the shoulder, a diagonal chop
  //   that crosses the body, a rising cut the other way and a low sweep — three hits — with ONE
  //   whole revolution of the rig through it and the shaft rolling on its own axis the entire way.
  //   The revolution is finished on exactly one turn, so the aim is square again the frame it ends
  //   and the yaw can be dropped for free.
  //
  //   THE TRAVEL is here, and it is a FLOOR rather than an impulse. Three beats that each ADDED a
  //   step would stack — the old form's own strikes came in tight pairs and a whole route carried
  //   the body 15.5 u on the added velocity alone — so the deck takes its own drag off between
  //   beats (`POLE_ATK_DRAG`) and the speed ALONG THE FACING is then pulled up to `POLE_ATK_V`. A
  //   second beat re-aims a surge that is still running instead of adding to it, which is what makes
  //   a three-beat flurry travel about as far as a single long stride rather than across the arena.
  //
  //   ...AND THE FLOOR IS ON THE WHOLE BODY, not just the part of it pointing down the line
  //   (session 155): the momentum across the line is spent at `POLE_ATK_GRIP` instead of being left
  //   to sum with the surge, so holding a direction through the move CARVES the line (see the
  //   `poleatk` aim branch) and can never make him travel faster than the carry's own speed.
  //
  // THE DURABILITY is spent HERE, on the press, and it decides the LAST BEAT rather than the first:
  // a staff with one strike left in it does not break on the wind-up, it plays the flurry out and
  // SNAPS ON THE FINAL CHOP (`POLE_ATK_BREAK`), which is the one frame in the move the wood is being
  // driven hardest into whatever it finds. That is the whole point of the number — the weapon is
  // seen to run out in his hands.
  // =========================================================================
  poleStrike() {
    if (!this.holdingPole()) return false;
    if (this.poleAtkCd > 0) return false;
    if (!this.canSkill()) return false;
    this.poleAtkCd = P.POLE_ATK_T + P.POLE_ATK_CD;
    // ...and the haul is over the moment a move opens: a flurry is thrown with the staff in his
    // HANDS, so the blend out of the deck is closed here rather than left running under the move.
    // Both ends of the blend are the carry's own numbers and every move begins and ends on them (see
    // `poleHoldStrike`), so this cannot pop: it only skips the last of a take the player cut short.
    this.poleLift = 1;
    this.poleLiftT = P.POLE_LIFT_T;
    this.poleAtkT = 0;
    this.poleAtkBeat = 0;
    this.poleAtkSpin = 0;
    this.poleMode = "strike";
    // ...and the trail starts EMPTY: the arc the wood has swept belongs to the flurry that swept
    // it, so a second strike cannot inherit the last one's band and hit a body it never passed.
    this.poleTrailN = 0;
    this.poleTrailNext = 0;
    this.poleT = 0;
    this.poleHp -= P.POLE_USE;
    this.poleWillBreak = this.poleHp <= 0;
    this.setState("poleatk");
    this.attackBuf = 0;
    this.events.push("polestrike");
    return true;
  },

  updatePoleStrike(dt) {
    this.poleAtkT += dt;
    const T = P.POLE_ATK_T;
    const t = Math.min(1, this.poleAtkT / T);
    this.poleT = t;
    const ud = this.charMesh && this.charMesh.userData;
    // THE READ — one call, spent twice (the pose in `updateVisual` and the beats below), so the
    // shape and the hitbox cannot be looking at two different frames of the same move.
    if (ud && ud.poleHold) ud.poleHold("strike", t, _poleHold);
    this.poleAtkSpin = _poleHold.spin * TAU;
    // ---- THE FORWARD CARRY (see the block above) ----
    // The line is read AFTER the aim has been carved for this frame (see the `poleatk` branch at the
    // foot of `update`), so a stick held through the flurry turns the line the flurry is thrown down
    // rather than adding a velocity of its own to it. The momentum is therefore split in two: the
    // part that is ON the line, which the carry owns and the deck drags at `POLE_ATK_DRAG`, and the
    // part ACROSS it, which is spent at `POLE_ATK_GRIP` — a throw committed to a line cannot be
    // carried sideways, and (the bug this split fixes) it can never be ADDED to by the stick either.
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const along = this.vel.x * fx + this.vel.z * fz;
    const latX = this.vel.x - fx * along;
    const latZ = this.vel.z - fz * along;
    const drag = Math.max(0, 1 - P.POLE_ATK_DRAG * dt);
    const grip = Math.max(0, 1 - P.POLE_ATK_GRIP * dt);
    const onLine = along * drag;
    // The surge itself: the speed along the line is pulled UP to the carry's own, which is the
    // brief's *"it cannot be stationary"* — but never DOWN (a body that entered the move faster than
    // `POLE_ATK_V`, off a dive or a dash, keeps what it brought; only the deck's own drag spends it).
    const add = onLine < P.POLE_ATK_V ? Math.min(P.POLE_ATK_V - onLine, P.POLE_ATK_ACCEL * dt) : 0;
    const speed = onLine + add;
    this.vel.x = fx * speed + latX * grip;
    this.vel.z = fz * speed + latZ * grip;
    if (!this.grounded) this.vel.y -= P.GRAVITY * dt;
    // ---- THE TRAIL, written before the beats are read ------------------------------------------
    // The shaft's line is the one the prop was MOUNTED on last frame (`updateVisual` publishes
    // `poleShaftA/B` off the matrix the hands were solved against — one frame of lag, the same
    // bargain every contact in the game makes), so this is the arc the wood has genuinely swept, one
    // entry per frame, oldest first out of the ring. See `poleStrikeContact` for what reads it.
    this.pushPoleTrail();
    // ---- THE BEATS, each fired once, on the frame the clock crosses its own share (they are
    // authored in streetwear.js next to the shape that draws them) ----
    const hits = _poleHold.hits;
    while (hits && this.poleAtkBeat < hits.length && t >= hits[this.poleAtkBeat]) {
      this.poleStrikeContact(this.poleAtkBeat);
      this.poleAtkBeat++;
    }
    // ...and the staff going, if this strike spent the last of it.
    if (this.poleWillBreak && this.poleHeld && t >= _poleHold.breakT) {
      this.poleBreak(Math.sin(this.facing), Math.cos(this.facing));
    }
    if (this.poleAtkT >= T) this.endPoleMove();
  },

  // One frame of the shaft's own history: the line it was published on, written into the fixed ring
  // the beats are measured against (see `poleStrikeContact`). The slot cycles, so the entry that is
  // overwritten is always the oldest one and `poleTrailN` is the number of entries worth reading.
  pushPoleTrail() {
    const slot = this.poleTrail[this.poleTrailNext % P.POLE_TRAIL];
    this.poleTrailNext++;
    slot.a.copy(this.poleShaftA);
    slot.b.copy(this.poleShaftB);
    if (this.poleTrailN < P.POLE_TRAIL) this.poleTrailN++;
  },

  // ONE STRIKE. The wedge shortlists; the SHAFT decides (see the note in the `POLE_*` block).
  poleStrikeContact(index) {
    // The whoosh is fired HERE rather than off the event, because it belongs to the SWING: a beat
    // that hits nothing has to whoosh just as loudly as one that lands.
    if (this.sfx && this.sfx.swing) this.sfx.swing(index);
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const fy = this.pos.y - P.HY;
    let landed = 0;
    if (this.enemies && this.enemies.spawned) {
      // The wedge is the WHOLE WAY ROUND (`arc` PI), and that is not a fudge: the shape turns the
      // rig a full revolution with the wood out (`poleHoldStrike`'s `spin`), so the shaft genuinely
      // sweeps behind him as well as in front, and a body at his back is a body the second beat
      // finds. `fx/fz` are still handed in because `inFront` wants a line to rank and filter by,
      // and the band is the height the wood actually occupies. The shortlist is only there to keep
      // the per-body measurement (14 segment tests, see below) off every body in the world.
      const list = this.enemies.inFront(this.pos.x, this.pos.z, fx, fz, 3.4, Math.PI, [fy - 0.9, fy + 2.6]);
      for (const e of list) {
        // ...and the body has to be near the SHAFT, or the strike visibly misses it — where "near
        // the shaft" is measured against every line the shaft has OCCUPIED since the last beat, not
        // against the one it happens to be on this frame. That distinction is the whole of whether
        // this move works: the flurry is a body turning one whole revolution with a two-metre rod
        // in its hands, so between two beats the wood sweeps a wide band, and a rod sampled on the
        // three single frames the beats land on will sail straight past a body standing right in
        // front of it (measured: with the single-frame read, a body 2.0 u dead ahead was missed by
        // beat 0 at a gap of 1.19 against a `POLE_SHAFT_R` of 1.10 — a hit the player can see was
        // one frame away from landing). The trail is the swept segment, exactly: `poleTrail` is the
        // shaft's published ends for the last `POLE_TRAIL` frames (written by `pushPoleTrail`), and
        // the body is measured against the CLOSEST of them. One segment test per stored line, so a
        // beat costs at most `POLE_TRAIL` of them per body — and only for bodies the wedge has
        // already shortlisted.
        let gap = Infinity;
        const trail = this.poleTrail;
        const n = this.poleTrailN;
        for (let i = 0; i < n; i++) {
          const t = trail[i];
          const g = shaftGap(e.pos.x, e.pos.y + P.HY, e.pos.z, t.a, t.b);
          if (g < gap) gap = g;
        }
        if (gap > P.POLE_SHAFT_R) continue;
        const dx = e.pos.x - this.pos.x;
        const dz = e.pos.z - this.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        const took = e.hit("flight", dx / dl, dz / dl, 16, 0.50,
          { dmg: 13, lift: 4.4, ragdoll: index === 2 });
        if (!took) continue;
        landed++;
        this.lastPoleHit = e;
      }
    }
    // The FX anchor: the point on the shaft the strike is read at — the TIP (the furthest end of the
    // stick is where the staff actually reaches) plus the shaft's middle, which is where the deck's
    // own mark goes (see main.js: a two-metre line leaves a line's worth of a mark, not a point's).
    const a = this.poleShaftA;
    const b = this.poleShaftB;
    this.lastPole = {
      x: (a.x + b.x) * 0.5,
      y: (a.y + b.y) * 0.5,
      z: (a.z + b.z) * 0.5,
      tipX: b.x, tipY: b.y, tipZ: b.z,
      power: 0.45 + index * 0.25,
      index,
      landed,
    };
    this.events.push(landed ? "polehit" : "polewhiff");
  },

  // =========================================================================
  // M2 — THE THROW (with a staff in his hands).
  //
  // The brief: *"i can throw it with m2 / pressing grab again and it breaks after that ofc"*. The
  // SHAPE is the pose's (`poleHoldThrow` — cocked over the shoulder, `POLE_THROW_RELEASE` is the
  // share the prop actually leaves on, and the fist OPENS on the release); what this owns is the
  // flight and the break.
  //
  // THE FLIGHT IS A REAL LINE. The staff leaves the hand at the grip's own world point, travelling
  // at `POLE_THROW_V` with a small rise, sagging under `POLE_THROW_G`, and rolling about its own
  // length (`POLE_THROW_SPIN`) — which is the whole of what makes a thrown stick read as thrown
  // rather than as slid. It is a world object while it is away (`Poles.mount` is the only writer of
  // its transform, as always), and its hitbox is its own swept segment, exactly the way the strike's
  // is: the shaft's line last frame joined to the line this frame, against every body inside a wedge
  // around it.
  //
  // AND THEN IT BREAKS. There is no rebound and no return any more (that was the old form's
  // boomerang, and the brief replaced it): the staff goes on the FIRST BODY IT FINDS, on the DECK it
  // lands on, or when it has flown `POLE_THROW_RANGE` — all three through `poleBreak`, so a thrown
  // staff and a swung one break the same way.
  // =========================================================================
  poleThrow() {
    if (!this.holdingPole()) return false;
    if (!this.canSkill()) return false;
    this.poleLift = 1;
    this.poleLiftT = P.POLE_LIFT_T;
    this.poleThrT = 0;
    this.poleReleased = false;
    this.poleWhipEv = false;
    this.poleFly = null;
    this.poleMode = "throw";
    this.poleT = 0;
    this.setState("polethr");
    this.attackBuf = 0;
    this.events.push("polethrow");
    return true;
  },

  updatePoleThrow(dt) {
    this.poleThrT += dt;
    const T = P.POLE_THROW_T;
    const t = Math.min(1, this.poleThrT / T);
    this.poleT = t;
    const ud = this.charMesh && this.charMesh.userData;
    if (ud && ud.poleHold) ud.poleHold("throw", t, _poleHold);
    if (!this.poleWhipEv && t >= 0.52) { this.poleWhipEv = true; this.events.push("polewhip"); }
    if (!this.poleReleased && t >= _poleHold.release) this.poleThrowRelease();
    // A throw is a stand-and-deliver: the body is committed, so the ground spends what it is
    // carrying and only gravity is left if he happened to throw it off a ledge.
    this.vel.x = approach(this.vel.x, 0, P.GROUND_FRICTION * dt);
    this.vel.z = approach(this.vel.z, 0, P.GROUND_FRICTION * dt);
    if (!this.grounded) this.vel.y -= P.GRAVITY * dt;
    // (the FLIGHT is not ticked here — it is ticked above the state switch, because it outlives this
    //  state: see the note there.)
    if (this.poleThrT >= T) this.endPoleMove();
  },

  // THE RELEASE — the prop leaves the hand. The line is the facing, unless there is a body out there
  // to throw it AT (the throw is a throw, not a gesture down a line), and the origin is the grip's
  // own world point, published by the pose off the matrix the hands were solved onto — so the staff
  // leaves from exactly where it was drawn.
  poleThrowRelease() {
    this.poleReleased = true;
    const p = this.poleHeld;
    if (!p) return;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const hx = this.poleGripW.x;
    const hy = this.poleGripW.y;
    const hz = this.poleGripW.z;
    let tx = hx + fx * P.POLE_THROW_RANGE;
    let ty = hy;
    let tz = hz + fz * P.POLE_THROW_RANGE;
    if (this.enemies && this.enemies.spawned) {
      const fy = this.pos.y - P.HY;
      const list = this.enemies.inFront(this.pos.x, this.pos.z, fx, fz, P.POLE_THROW_RANGE, 0.8, [fy - 0.6, fy + 2.2]);
      let best = null;
      let bd = 1e9;
      for (const e of list) {
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        tx = best.pos.x;
        ty = best.pos.y + P.HY * 0.95;
        tz = best.pos.z;
      }
    }
    let dx = tx - hx;
    let dy = ty - hy;
    let dz = tz - hz;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    this.poleFly = {
      x: hx, y: hy, z: hz,
      vx: dx * P.POLE_THROW_V,
      vy: dy * P.POLE_THROW_V + P.POLE_THROW_UP,
      vz: dz * P.POLE_THROW_V,
      spin: 0,
      travel: 0,
      hit: [],
    };
    this.events.push("polerelease");
  },

  // One frame of the flight: the line, the roll, the sweep test, and the three ways it ends.
  updatePoleFlight(dt) {
    const f = this.poleFly;
    const p = this.poleHeld;
    if (!f || !p) return;
    const px = f.x;
    const py = f.y;
    const pz = f.z;
    f.vy -= P.POLE_THROW_G * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.z += f.vz * dt;
    f.spin += P.POLE_THROW_SPIN * TAU * dt;
    // The shaft runs ALONG ITS TRAVEL and rolls about its own length: a thrown staff is a propeller
    // with a spear's line, and the roll is what reads as the spin from a distance.
    _poleAxis.set(f.vx, f.vy, f.vz);
    const av = _poleAxis.length() || 1;
    _poleAxis.multiplyScalar(1 / av);
    _poleQ.setFromUnitVectors(_poleUp, _poleAxis);
    _poleQ.multiply(_poleQ2.setFromAxisAngle(_poleUp, f.spin));
    _poleMount.compose(_poleP.set(f.x, f.y, f.z), _poleQ, _poleOne);
    this.poles.mount(p, _poleMount);
    this.poleShaftA.set(0, -POLE.LEN * 0.5, 0).applyMatrix4(_poleMount);
    this.poleShaftB.set(0, POLE.LEN * 0.5, 0).applyMatrix4(_poleMount);
    // ...and the grip point follows the shaft, so the follow-through pose and the prop stay in the
    // same world after the release (the pose keeps solving the hands onto the virtual shaft).
    this.poleGripW.set(0, 0, 0).applyMatrix4(_poleMount);
    const step = Math.hypot(f.x - px, f.y - py, f.z - pz);
    f.travel += step;
    const dl = Math.hypot(_poleAxis.x, _poleAxis.z) || 1;
    const dx = _poleAxis.x / dl;
    const dz = _poleAxis.z / dl;
    // ---- THE BODIES ----
    if (this.enemies && this.enemies.spawned) {
      const A = this.poleShaftA;
      const B = this.poleShaftB;
      const mx = (A.x + B.x) * 0.5;
      const my = (A.y + B.y) * 0.5;
      const mz = (A.z + B.z) * 0.5;
      const list = this.enemies.inFront(mx, mz, dx, dz, step + P.POLE_SHAFT_R, Math.PI,
        [my - 1.2, my + 1.2], null);
      for (const e of list) {
        if (f.hit.indexOf(e) !== -1) continue;
        if (shaftGap(e.pos.x, e.pos.y + P.HY, e.pos.z, A, B) > P.POLE_SHAFT_R) continue;
        const took = e.hit("flight", dx, dz, P.POLE_THROW_KNOCK, P.POLE_THROW_STUN,
          { dmg: P.POLE_THROW_DMG, lift: 4.6 });
        if (!took) continue;
        f.hit.push(e);
        this.lastPole = {
          x: mx, y: my, z: mz,
          tipX: B.x, tipY: B.y, tipZ: B.z,
          power: 1.5, index: 3, landed: 1,
        };
        this.events.push("polehit");
        this.poleBreak(dx, dz);
        return;
      }
    }
    // ---- AND THE WORLD ----
    const floor = this.world ? this.world.topBelow(f.x, f.z, f.y, 4) : 0;
    if (f.y - 0.1 <= floor || f.travel >= P.POLE_THROW_RANGE) {
      const y = Math.max(f.y, floor + 0.08);
      this.poleBreak(dx, dz, _poleP2.set(f.x, y, f.z));
    }
  },

  // =========================================================================
  // THE VAULT (the double jump with a staff — `polevlt`, session 185).
  //
  // The brief: *"make when the player double jump its not holdable anymore the player does a front
  // flip with the stick aiming forward and he stirkes the ground with it wich launches far forward
  // in the air"*. This REPLACES the Shaolin balance (which took the stick, hung the body off its
  // tip and spent the launch on the button's RELEASE): *"its not holdable anymore"* is that hang,
  // and what the double jump buys now is a ONE-SHOT front flip with the shaft driven forward and
  // down until its tip meets the deck — and THAT beat is the launch (and it snaps the staff, which
  // is why the turn has a clock of its own: the body goes on spinning with nothing in its hands).
  //
  // Three things follow from "one-shot", and they are the whole of the difference from the old
  // move: the entry IS the commitment (there is no floor on the clock and no ceiling on a hold, so
  // `POLE_VAULT_MIN`/`_MAX` are gone with it); the SHAPE owns the timing (`POLE_VAULT_HIT` is a
  // share of the shape's own clock, and the shape is where the tip is driven down — see
  // `poleHoldVault`), so the frame the wood hits and the frame the body is drawn hitting it are one
  // frame; and the flip is a whole revolution of the RIG, which is a channel of its own
  // (`poleFlipT`, ticked in `clocks.js` and read by rig.js) rather than the double jump's — that one
  // is a BACKFLIP (-2π) and a vault that reused it would spin the wrong way.
  //
  // THE STAFF HOLDS ITS AIM AND THE BODY GOES OVER IT. The flip is a revolution of the RIG, and the
  // wood is mounted in the rig's frame — so the shape authors the staff's direction IN THE WORLD and
  // cancels the revolution out of it (`o.flip`, see `poleHoldVault`). What the eye reads is a stick
  // driven down into the deck at a nearly fixed line while a body turns over the top of it, which is
  // what a vault is, and it is the one thing a rig-frame `pitch` could never have given.
  //
  // THE FLIP HOLDS HIM HORIZONTALLY: nothing but the staff's own lift moves the body sideways while
  // the shape is riding it (no drag, no collision — see the `moveAndCollide` guard in `update`), so
  // the revolution reads the same off a standstill and off a sprint, and the whole arc is the
  // launch's.
  //
  // THE LAUNCH IS UNCHANGED: a rise of `POLE_LAUNCH_UP` and a forward throw of `POLE_LAUNCH_V`,
  // deliberately OVER `MAX_SPEED`, with the ceiling standing down for `POLE_LAUNCH_HOLD` (see the
  // note at the clamp in `update`). The staff BREAKS on the strike, cut where the tip went, and the
  // two halves are left behind on the deck.
  // =========================================================================
  poleVault() {
    if (!this.holdingPole()) return false;
    if (this.state === "polevlt") return false;
    // The haul is over: the flip is thrown with the staff in his HANDS.
    this.poleLift = 1;
    this.poleLiftT = P.POLE_LIFT_T;
    this.poleVaultT = 0;
    this.poleVaultHit = false;
    this.poleMode = "vault";
    this.poleT = 0;
    this.setState("polevlt");
    // NO JUMP AND NO MOMENTUM: the vault is thrown from wherever the body already is. The whole of
    // its vertical is the DIVE the shape makes onto the plant (`updatePoleVault`), and the whole of
    // its arc is the launch's — a jump here would fight the shape's own descent for the same number
    // and would make the strike's height depend on whether the press was made rising or falling.
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.airFromJump = true;
    this.jumpBuffer = 0;
    this.jumpsLeft = 0;
    this.fallPeakY = this.pos.y;
    // ...and the revolution itself, for the rig: a countdown on its own clock (`clocks.js` ticks it
    // and `poleFlipAngle` reads it), because the turn is a rig rotation AND the staff's own
    // counter-rotation (see `poleHoldVault`), and both have to be the same number.
    this.poleFlipT = P.POLE_VAULT_FLIP_TIME;
    this.events.push("polevault");
    return true;
  },

  updatePoleVault(dt) {
    const T = P.POLE_VAULT_T;
    this.poleVaultT += dt;
    const t = Math.min(1, this.poleVaultT / T);
    this.poleT = t;
    const ud = this.charMesh && this.charMesh.userData;
    // THE READ — one call, spent twice (the pose in `updateVisual` and the strike beat below), the
    // same bargain every other pole shape makes: the frame the tip is DRAWN meeting the deck and the
    // frame the launch fires are one number.
    if (ud && ud.poleHold) ud.poleHold("vault", t, _poleHold);
    // THE FLIP HOLDS HIM, and then the LAUNCH OWNS HIM — the two halves of the move are the two
    // halves of this branch. Up to the strike the body is the shape's (nothing else moves it: no
    // gravity, no collision, so the revolution reads the same off a standstill and off a sprint);
    // from the strike it is the throw's, on an ordinary ballistic line with the world's own say back
    // in it (see the `moveAndCollide` guard in `update`, which is opened by the same flag), so the
    // landing it comes down to is a landing like any other and the peak the drop is measured from
    // rides up with him.
    if (!this.poleVaultHit) {
      // THE FLIP DIVES. The HORIZONTAL is frozen — the revolution is the whole read, and a body
      // sliding across the frame while it turns is a body the eye cannot follow — but the VERTICAL is
      // a real FALL: the staff's tip is two metres below the grip, so a body that hung in the air
      // through the flip would drive a stick at nothing, and a pole vault is planted on the way DOWN
      // and thrown on the way up. `POLE_VAULT_DROP` is the acceleration (its own number rather than
      // `GRAVITY`, so the beat is the same off a hop and off the top of a double jump) and `_FLOOR`
      // is the stop: an inverted body's head is over a metre and a half under its own centre, so the
      // body may not descend past it — and a press made BELOW the floor holds the height it was made
      // at rather than rising to it (see the `Math.min` below).
      //
      // ...and it is written STRAIGHT TO THE BODY'S OWN HEIGHT rather than through `vel`:
      // `moveAndCollide` — the one place a velocity becomes a position — is exactly what this half of
      // the move stands down (see the guard in `update`), so a velocity set here would never be spent
      // at all. Integrating it here keeps the two halves honest: the staff takes the body down onto
      // the deck through the flip, and from the strike the launch's own ballistic line owns it, with
      // the world's collision back in the loop.
      this.vel.set(0, 0, 0);
      const deck = this.world && this.world.terrainHeight
        ? this.world.terrainHeight(this.pos.x, this.pos.z) : 0;
      const floor = Math.min(this.pos.y, deck + P.POLE_VAULT_FLOOR);
      if (this.pos.y > floor) {
        this.pos.y = Math.max(floor, this.pos.y - P.POLE_VAULT_DROP * t * dt);
      }
      this.grounded = false;
      this.fallPeakY = this.pos.y;
    } else if (!this.grounded) {
      this.vel.y -= P.GRAVITY * dt;
      this.fallPeakY = Math.max(this.fallPeakY, this.pos.y);
    }
    // THE STRIKE, on the shape's own beat.
    if (!this.poleVaultHit && t >= P.POLE_VAULT_HIT) {
      this.poleVaultHit = true;
      this.poleVaultLaunch();
    }
    if (this.poleVaultT >= T) this.endPoleMove();
  },

  // The tip has met the deck: the vault's whole payoff, in one function (see the brief above).
  poleVaultLaunch() {
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    this.vel.x = fx * P.POLE_LAUNCH_V;
    this.vel.z = fz * P.POLE_LAUNCH_V;
    this.vel.y = P.POLE_LAUNCH_UP;
    this.poleLaunchT = P.POLE_LAUNCH_HOLD;
    this.airFromJump = true;
    this.squash = -0.7;
    if (this.sfx) this.sfx.doubleJump();
    this.events.push("polelaunch");
    // ...and the staff goes, on the line it struck — cut at the TIP, which is the end that met the
    // deck (the default cut is the shaft's middle, which is right for a strike landing on a body and
    // wrong for a staff that has just been driven into the floor point-first).
    this.poleBreak(fx, fz, this.poleShaftB);
  },

  // Out of a pole move. The staff — if it is still there — simply stays in his hands: this is the
  // handover back to whatever the body was doing, and the carry is an attachment, so there is
  // nothing to put down. (The POSE layer fades itself out over `POLE_FADE`; see `updateVisual`.)
  endPoleMove() {
    this.poleMode = "carry";
    this.poleT = 0;
    this.poleAtkT = 0;
    this.poleThrT = 0;
    this.poleAtkSpin = 0;
    const st = this.state;
    if (st === "poleatk" || st === "polethr" || st === "polevlt") {
      this.setState(this.grounded ? "ground" : "air");
    }
  },

  // ...but NOT out of a FREE FALL: a skyfall's M1 is the plunge (see the block in `update`), so
  // the chain's whole entry — the press, the buffered press and the wall clinch that rides it —
  // stands down for as long as the fall lasts. The state test alone would not do it: a fall IS
  // `air`, and the air-combo and the finisher's window both claim to be "a standing body" up
  // there, which is exactly the pair of doors a free-falling body must not have.
  // ---- THE STAFF'S OWN M1 (see `poleStrike`) ------------------------------------------------
  // Asked HERE, ahead of the chain and ahead of everything else in the block below, because a body
  // carrying a staff is a body whose LEFT button is about the staff — exactly the way its right
  // button is about the throw (see `grab`) — and a press that both started the flurry and settled
  // into a punch would be two moves off one click. The gates are the M1 family's own, unchanged:
  // a foot on the deck (or one of the two windows that stand that gate down — the air combo's and
  // the broken-chain finisher's), the same `COMBAT_SPEED` ceiling the chain and the grab wear, and
  // not while the M1+M2 chord is down (that is the GUARD, and the guard outranks the staff: see
  // `chordLive`). `poleStrike` itself is the last word — it refuses with no staff, inside its own
  // lockout, or out of a committed move.
  tryStaffStrike(grounded, chordHeld, inp, speed2D, dashFree) {
    // ...and a ride claims the press itself (session 200 — see `tickChainPress`): M1 with a deck under
    // the feet is the BOARD's trick, whatever the hands happen to be holding.
    const poleStruck = !this.board && this.poleHeld && !chordHeld && inp.kickPressed &&
      (grounded || this.airComboT > 0 || this.airFinisherT > 0 || dashFree) &&
      speed2D < P.COMBAT_SPEED && this.poleStrike();
    return poleStruck;
  },
  // THE STAFF'S OWN BODY SOLVE (lifted whole out of `updateVisual`, where it was the LAST layer
  // written on the rig — see the note it carries): the prop read (`poleHeld` / `poleFly` /
  // `holdingPole`), the layer weight (`polePose`, and how much of the body the base layers already
  // own), the ONE `poleHold` read spent twice (the prop's matrix and the body's solve), the carry's
  // run-lift and trunk ride, the HAUL blend out of the deck, `posePole`, the hands' own world point
  // and the mounted prop's two shaft ends. It reads the frame's `dt` and the rig's `userData`,
  // which is why those are its arguments.
  solvePoleBody(dt, ud) {
    // THE POLE, on top of everything (see `poleStrike` / `poleThrow` / `poleVault`, and `poleHold`
    // / `posePole` in streetwear.js).
    //
    // The bar for this layer is the PROP and not a state, because a staff is an ATTACHMENT: it has
    // to ride the rig through every state the body has (a run, a jump, a slide, a dash, a grab) the
    // way the tote's duffel does, and the whole point of the user's *"i grab the pole normally"* is
    // that there is no form to be in. So `poleHeld` is the read — plus the three pole MOVES, so the
    // SHAPE can outlive the wood: the flurry finishes its follow-through after the staff snaps in
    // his hands, and the throwing arm follows through after the fist has opened on nothing.
    const poleProp = this.poleHeld;
    const flying = this.poleFly;
    // ...and "in his hands" is `holdingPole()` — the handle AND not the flight (see the note there):
    // a man who has just hurled his staff off a cliff must not go on standing in a carrying pose with
    // an empty fist closed around nothing.
    const inHands = this.holdingPole();
    const poleWant = (inHands || this.state === "poleatk" || this.state === "polethr" ||
      this.state === "polevlt") ? 1 : 0;
    this.polePose = approach(this.polePose, poleWant, dt / P.POLE_FADE);
    // HOW MUCH OF THE BODY THE BASE LAYER IS ALREADY POSING. The carry's posture is a STANDING
    // body's (see the note in `posePole`), so it is spent only as far as nothing below this layer
    // has already written a trunk of its own — the run cycle and every state pose that owns the
    // body, read as one max. Without it the staff's layer (applied last, by design) took the body
    // back off whatever the state had just done with it: measured, a slide with a staff carried
    // the hips at **0.85 rig** against the slide's own **0.44**, i.e. a man skating on a staff with
    // his body standing upright on top of it. (Read with `>` rather than `Math.max`: a pose weight
    // that this frame's path never touched is `undefined`, and one of those would poison the whole
    // sum with a NaN.)
    //
    // `idlePose` is on the list as of session 150, and it was the one omission that made a carried
    // staff look DEAD. Every other base layer was in here but the idle, so a man standing still with
    // a staff had his whole trunk (and the breath in it) overwritten by the carry's authored
    // standing pose — a shape with no bob, no sway and no breathing in it at all, which the user
    // sees more of than every other frame of the feature combined. With it in, the standing carry
    // rides the idle the same way the running one rides the run cycle: the trunk breathes and shifts,
    // the arms go on being solved onto the shaft (they are NOT gated — see the note in `posePole`),
    // and the staff moves the few millimetres a carried staff moves.
    let bodyOwn = this.runBlend || 0;
    const bodyOwners = [
      this.idlePose, this.slidePose, this.crouchPose, this.airPose, this.fallPose, this.plungePose,
      this.divePose, this.slamPose, this.dashPose, this.mantlePose, this.vaultPose,
      this.launchPose, this.ledgePose, this.wallPose, this.landPose, this.slamLandPose,
      this.guardPose, this.attackPose, this.whirlPose, this.kneePose, this.wallBeatPose,
      this.grabPose, this.lungePose, this.scissorPose, this.capoPose, this.hammerPose,
      this.macacoPose,
    ];
    for (let i = 0; i < bodyOwners.length; i++) {
      const w = bodyOwners[i];
      if (w > bodyOwn) bodyOwn = w;
    }
    // ...and WHILE IT IS AWAY the prop is NOT mounted from the rig at all: `updatePoleFlight` owns its
    // world transform and publishes the shaft's own ends off it (see the note there). The pose still
    // runs — the hands keep being solved onto the shape's virtual shaft, which is what makes the
    // follow-through read as a throw's — but everything below the pose is skipped, so there is no
    // second writer of the prop's transform and no second writer of the shaft's hitbox line.
    if (ud && ud.posePole && ud.poleHold && this.poles && this.polePose > 0.002) {
      const mode = this.poleMode;
      const t = this.poleT;
      // THE READ. One call, spent twice: here (to place the prop and solve the body onto it) and in
      // the mover (to fire the beats, break the wood and mount the hitbox). Handing the answer and
      // the shape back through one object is what keeps the drawn stick and the stick that hits as
      // one number — see the note on `_poleHold`.
      //
      // ...and the VAULT is handed the rig's own angle through the turn first (see the note on
      // `_poleHold.flip`): its shape holds the staff's aim in the WORLD, so it has to be told how far
      // the body has come round to be able to cancel it out. Read from the same function the rig
      // spins the body with, on the same frame, so the two are one number.
      _poleHold.flip = this.poleFlipAngle();
      ud.poleHold(mode, t, _poleHold);
      this.charMesh.updateWorldMatrix(true, false);
      const rigScale = this.charMesh.scale.x || 1;
      // ---- ...AND THE RUNNER HOLDS IT A LITTLE HIGHER (session 147) --------------------------
      // The carry's grip is authored 0.06 rig above the deck at a STANDSTILL, which is the whole of
      // its clearance — and a run's hips bob 0.13 rig under it, so a staff left at the authored
      // height drags its butt through the ground at the bottom of every stride (measured: **0.05
      // world under the deck** on flat ground, worst phase). A carrier lifts the shaft as the body
      // drops into the stride, so the lift is graded by the same `runBlend` the trunk attach is:
      // zero standing (the authored carry is untouched) and full at a run.
      if (mode === "carry" && this.runBlend > 0.001) {
        const lift = P.POLE_CARRY_LIFT * this.runBlend;
        _poleHold.gy += lift;
        _poleHold.g.y += lift;
      }
      composePole(_poleWanted, _poleHold, POLE.LEN / rigScale);
      // ---- THE CARRIED STAFF RIDES THE TRUNK (session 147) ---------------------------------
      // The carry's shaft is authored in the rig's own frame, which is a body STANDING: the run's
      // lean lives on the TORSO (up to 0.68 rad at a sprint), so a shaft left in the rig's frame
      // has the chest turn its back on it — the shoulder rides forward while the grip stays at the
      // waist, and the arm folds up and back to keep hold of it. `trunkDelta` re-expresses the
      // shaft in the trunk's own frame, so the staff leans and bobs with the runner and the arm's
      // solve lands on exactly the standing carry's angles (see the note on `trunkDelta` in
      // streetwear.js). CARRY ONLY: a strike, a throw or a balance authors the whole body itself,
      // so its shaft is already in the frame its own posture set.
      if (mode === "carry" && this.runBlend > 0.001 && ud.trunkDelta) {
        ud.trunkDelta(_poleTrunk, P.POLE_CARRY_TRUNK);
        _poleWanted.premultiply(_poleTrunk);
      }
      _poleM.copy(_poleWanted);
      // ---- THE HAUL: the staff is still on its way up out of the deck --------------
      // The take has no shape of its own (see the brief: a pickup is a pickup), so the only thing
      // the take LOOKS like is the blend between the two things that are both already true — where
      // the staff is PLANTED (the prop's own frame, folded into the rig's so the two are comparable)
      // and where the carry WANTS it. `poleLift` is that blend's clock (see `updatePoleCarry`).
      //
      // It arcs and it tilts, for the same reason the old form's draw did: a straight line from a
      // staff standing out in the world to a pair of hands on the body goes through whatever is in
      // between, and what is between them is his own leg — the shaft is 2.4 rig units long and its
      // BUTT is what sweeps, a metre and a quarter below a grip that is not allowed to move (the
      // hands are solved onto it). So the correction is a LIFT through the middle of the blend (the
      // deck has to be cleared) and a TILT about the grip (the far end swings, the fist does not).
      // Both are sine-shaped, so both vanish onto the two ends and neither can pop.
      if (poleProp && !flying && this.poleLift < 1) {
        _poleInv.copy(this.charMesh.matrixWorld).invert();
        _polePlant.copy(_poleInv).multiply(poleProp.plantM);
        _polePlant.decompose(_poleP, _poleQ, _poleS);
        _polePlant.compose(_poleP, _poleQ, _poleOne);
        const w = smooth01(this.poleLift);
        if (w < 1) {
          _poleWanted.decompose(_poleP2, _poleQ2, _poleS2);
          const arc = Math.sin(Math.PI * w);
          _poleP.lerp(_poleP2, w);
          _poleP.y += P.POLE_LIFT_ARC * arc;
          _poleQ.slerp(_poleQ2, w);
          _poleM.compose(_poleP, _poleQ, _poleOne);
          if (P.POLE_LIFT_TILT) {
            _poleGrip.set(0, (_poleHold.hf - 0.5) * POLE.LEN / rigScale, 0).applyMatrix4(_poleM);
            _poleSpin.makeRotationZ(-P.POLE_LIFT_TILT * arc);
            _poleTwist.makeTranslation(-_poleGrip.x, -_poleGrip.y, -_poleGrip.z);
            _poleM.premultiply(_poleTwist);
            _poleM.premultiply(_poleSpin);
            _poleTwist.makeTranslation(_poleGrip.x, _poleGrip.y, _poleGrip.z);
            _poleM.premultiply(_poleTwist);
          }
        }
      }
      // ---- THE BODY, on the same read and the same matrix --------------------------
      // One call: the trunk's posture, the legs (only the balance authors them) and both arms, all
      // of them read off the shaft the mover is about to mount. See `posePole`.
      ud.posePole(this.polePose, mode, t, _poleM, _poleHold, bodyOwn);
      // THE HANDS' OWN POINT, in the world, off the same matrix the fists were just solved onto: the
      // one number a throw leaves from (see `poleThrowRelease`), so the staff departs from exactly
      // where it was drawn rather than from wherever the body's centre happens to be.
      this.poleGripW.set(0, (_poleHold.hf - 0.5) * POLE.LEN / rigScale, 0).applyMatrix4(_poleM);
      this.poleGripW.applyMatrix4(this.charMesh.matrixWorld);
      if (poleProp && !flying) {
        // ...and MOUNT it. The prop's world transform is the rig's own world matrix applied to the
        // same matrix the hands were solved against, with the fit scale divided back out again (the
        // prop's geometry is in WORLD units, see pole.js).
        _poleWorld.copy(this.charMesh.matrixWorld).multiply(_poleM);
        _poleWorld.decompose(_poleP, _poleQ, _poleS);
        _poleMount.compose(_poleP, _poleQ, _poleOne);
        this.poles.mount(poleProp, _poleMount);
        // ...and hand the SHAFT's own ends to the mover: `poleStrikeContact` and the flight test
        // measure bodies against this segment, so what hits cannot drift off what is drawn.
        this.poleShaftA.set(0, -POLE.LEN * 0.5, 0).applyMatrix4(_poleMount);
        this.poleShaftB.set(0, POLE.LEN * 0.5, 0).applyMatrix4(_poleMount);
      }
    }
  },
};

export function installPole(Player) {
  Object.assign(Player.prototype, poleMethods);
}
