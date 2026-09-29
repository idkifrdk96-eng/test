// ---------------------------------------------------------------------------
// THE WALL CLINCH (part 6 of the player.js split).
//
// The wall attack: the probe that finds the face, the two pickers that find the
// body and the stone, the knee schedule, the tally that feeds the move, the
// placement that opens it, the frame-by-frame pin solve, the three beats it
// fires (smash / knee / hurl) and its end. Sixteen methods, verbatim, in a table
// `installWallbeat` copies onto `Player.prototype`.
//
// A LEAF with respect to player.js: it imports three.js (the move's own scratch
// pair) and `P` (player/config.js). Both scratch vectors moved with it and
// nothing outside reads them, so there is no export back.
// ---------------------------------------------------------------------------
import * as THREE from "../three.js";
import { P } from "./config.js";
import { approach } from "./math.js";
import { SKILL_POSE_FADE, _clinchV } from "./pose.js";

// THE WALL CLINCH's own scratch (see `startWallBeat` / `updateWallBeat`): the head of the body being
// held, read off its rig when the move opens — the point the pin's own yank walks in from.
const _wallHeadV = new THREE.Vector3();
// ...and the second of its pair: the point a knee is AIMED at, which is the victim's own STERNUM —
// read off the rig the way the clinch and the grab read theirs (see `chestPoint`), so the beat FX
// land on the belly the knee is actually in and not on a guess measured down from the skull. The
// skull's height belongs to the pose, and a body bent over its own pinned head carries its belly at
// nothing like a fixed offset from it.
const _wallGutV = new THREE.Vector3();

const wallbeatMethods = {

  // =========================================================================
  // THE WALL CLINCH (see the constants block at the head of `P`, and "THE WALL CLINCH" in
  // src/README.md).
  //
  // The user's brief: *"add a wall attack with fluent animtion it activates with using spaming the
  // wall to combo or doing 5 m1s on the wall ... the player smashes the enemy head to the wall and
  // holds it there and keeps kneeing him in the stomach with each knee to the enemy it becomes
  // faster until it becomes a blur and the enemy gets knocked far away from the wall"*.
  //
  // The entry is ONE tally with THREE doors. The first two are the ones the original brief named
  // and they are the same idea (hitting a wall five times): a wall KICK that comes out, and an M1
  // thrown while the body is working a face. The third is the user's own follow-up — *"if i keep
  // m1ing the enemy to a wall i start a wall combo"* — which is the same tally read the other way
  // round: a landed M1, thrown into a MAN rather than into a wall, while that man is the one on the
  // stone (see the note on the feed in `attackContact` and the victim-side probe in
  // `wallBeatVictimWall`). They all feed `wallChain`, the count stays alive for
  // `WALLCHAIN_WINDOW`, and at `WALLCHAIN_N` the move tries to fire — every frame, until it can or
  // the window lapses, which is what makes the fifth kick of a string (a kick leaves you flying off
  // the face with nothing in reach) still hand over the moment you land under the wall next to
  // somebody.
  //
  // What limits WHICH door the move came through is not the tally but the PLACEMENT: `tryWallBeat`
  // reads a face under the attacker first and a face under the victim second, and the second one is
  // held tight to the body (see `WALLBEAT_PUSH_PAD`), so "the combo came out" always means the same
  // thing — there was stone, and one of the two men was on it.
  //
  // The move itself is a PLACEMENT, like the launch's carry and the whirl's orbit: both bodies are
  // put on a stage measured off the wall face (the attacker a stride back, the victim's skull pressed
  // into the stone) and held there while the clock runs. That is the only way the animation can be
  // authored against a contact — the head has to BE on the wall, not near it — and it is why the
  // attacker skips `moveAndCollide` for the whole of it.
  // =========================================================================

  // Is the body working a wall right now? The gate the tally's second door reads.
  onWallContact() {
    return !!(this.attached || this.wallSliding || this.climbing || this.wallRunning || this.wallCoyote > 0);
  },

  // THE PROBE. A face within `pad` of a BOX, or null — the one read the move's placement is built
  // off, and (since the third door) it is asked of two different boxes: the ATTACKER's own (the
  // two doors the user named first) and the VICTIM's (the new one). It is `senseWalls`'s own read,
  // opened OUT: the attachment radius (`WALL_PAD`, 0.2) is where a wall can be GRABBED, and the
  // move has to be takeable from further back than that because the kick that fed the tally pushes
  // the body off the face (`KICK_PUSH`). The same axes, the same normal convention (`n` points AWAY
  // from the face), and the same two guards — a face has to run `WALLBEAT_WALL_TOP` above the deck
  // the probe's body stands on, and the box has to overlap the collider's own span rather than
  // being corner-to-corner with it.
  //
  // The result carries the box it was measured from (`ox`/`oz`) as well as the face, because the
  // two are what turn a hitbox test into a PLACE: `startWallBeat` puts the stone at
  // `o - n·(half + gap)`, so a face found under the victim is placed correctly even though the
  // attacker is standing somewhere else entirely.
  wallProbe(x, z, hx, hz, yLo, yHi, pad) {
    let best = null;
    let bestGap = Infinity;
    const cols = this.colliders;
    const minY = yLo + 0.10;
    const maxY = yHi - 0.10;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (maxY <= c.minY || minY >= c.maxY) continue;
      const cx = (c.minX + c.maxX) * 0.5;
      const cz = (c.minZ + c.maxZ) * 0.5;
      const chx = (c.maxX - c.minX) * 0.5;
      const chz = (c.maxZ - c.minZ) * 0.5;
      const sx = Math.abs(x - cx) - (hx + chx);
      const sz = Math.abs(z - cz) - (hz + chz);
      let nx = 0, nz = 0, gap = 0, half = 0;
      if (sx >= sz) {
        if (sx > pad || sx < -0.25) continue;
        if (hz + chz - Math.abs(z - cz) <= 0.02) continue;
        nx = x > cx ? 1 : -1;
        gap = sx;
        half = hx;
      } else {
        if (sz > pad || sz < -0.25) continue;
        if (hx + chx - Math.abs(x - cx) <= 0.02) continue;
        nz = z > cz ? 1 : -1;
        gap = sz;
        half = hz;
      }
      if (c.maxY - yLo < P.WALLBEAT_WALL_TOP) continue;
      if (gap < bestGap) { bestGap = gap; best = { nx, nz, gap, half, topY: c.maxY, botY: c.minY, c, ox: x, oz: z }; }
    }
    return best;
  },

  // ...the face the ATTACKER is working — the original read, and the one both of the user's first
  // two doors are gated on. His own box, his own deck, `WALLBEAT_WALL_PAD` loose.
  wallBeatWallFind() {
    return this.wallProbe(this.pos.x, this.pos.z, this.hx, this.hz,
      this.pos.y - P.HY, this.pos.y + P.HY, P.WALLBEAT_WALL_PAD);
  },

  // ...and the face the VICTIM is pressed against (the third door — see `WALLBEAT_PUSH_PAD`). The
  // same probe asked of the body's own box on its own deck, which is what makes the move takeable
  // by a man standing BEHIND the body he is driving into the stone rather than only by one standing
  // at the stone himself. Deliberately tight: a body that is merely NEAR a wall must not be hauled
  // sideways to one.
  wallBeatVictimWall(e) {
    return this.wallProbe(e.pos.x, e.pos.z, P.HX, P.HZ,
      e.pos.y, e.pos.y + 2 * P.HY, P.WALLBEAT_PUSH_PAD);
  },

  // The body the move can take. A GRAB's read, not a strike's: one within a stride and a half, on
  // its feet and in the fight (the move walks the victim's skull in from wherever it is, so it does
  // not have to be touching the wall already), and — when the caller HAS a face — on the right side
  // of it, between the attacker and the stone, because the pin is on the face's own OUT side and a
  // body behind the attacker would be walked through him to get there. `w` null is the third door's
  // own read (there is no attacker-side face yet — the face is found under the BODY), so the side
  // test has nothing to ask about and the nearest eligible body is the answer.
  wallBeatPick(w) {
    if (!this.enemies || !this.enemies.spawned) return null;
    let best = null;
    let bestD = Infinity;
    const deck = this.pos.y - P.HY;
    for (const e of this.enemies.list) {
      if (!e.built || e.ragdoll) continue;
      if (e.state === "down" || e.state === "getup" || e.state === "wallslam" || e.state === "wallpin") continue;
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > P.WALLBEAT_TAKE_E) continue;
      if (Math.abs(e.pos.y - deck) > 2.2) continue;
      // ...and it must be on the WALL's side of the attacker's own line rather than behind his back:
      // `n` points away from the face, so a body the pin can reach is at or toward the wall — a
      // body behind him would have to be walked through him to get there.
      if (w && d > 0.05 && (dx * w.nx + dz * w.nz) / d > 0.55) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  },

  // The knee schedule: when each beat starts, when its impact lands and when it ends. Ten beats,
  // each `kneeAccel` of the one before it — a ten-per-cent step now, NOT the doubling this used to
  // be (see `P.WALLBEAT`) — and never shorter than `kneeMin`. The impacts sit at 0.42 of each beat,
  // which is where `poseWallBeat` drives the knee, so the bone and the beat cannot disagree.
  wallBeatSchedule() {
    const W = P.WALLBEAT;
    const base = W.take + W.smash + W.hold;
    const times = [];
    let t = base;
    for (let i = 0; i < W.knees; i++) {
      const iv = Math.max(W.kneeMin, W.knee0 * Math.pow(W.kneeAccel, i));
      times.push({ start: t, impact: t + iv * 0.42, end: t + iv, iv, i, blur: 0 });
      t += iv;
    }
    // ...and each beat carries its own share of the BLUR, which is the read the older, doubling ramp
    // asked for: a beat that is still a real interval is a hit (blur 0) and the beats the floor
    // caught are the blur, ramping to 1 across them. It is derived here rather than written as a
    // beat index so it can never drift out of step with the ramp. It drives the damage
    // (`fireWallKnee`), the victim's jolt, the smear, the shake and the camera's closing, so all
    // five of the things the tail does are read off one number and speed up together. With the
    // shipped ten-per-cent ramp NO beat ever reaches the floor, so `firstFloor` is past the end of
    // the list, `floored` is 0 and every beat comes out 0 — the tail is ten plain, heavy knees and
    // the smear machinery is simply switched off by the numbers rather than by a boolean.
    let firstFloor = times.length;
    for (const x of times) if (x.iv <= W.kneeMin + 1e-9) { firstFloor = Math.min(firstFloor, x.i); }
    const floored = times.length - firstFloor;
    for (const x of times) {
      x.blur = floored <= 1 ? 0 : Math.min(1, Math.max(0, (x.i - firstFloor) / (floored - 1)));
    }
    return { kneeStart: base, times, kneeEnd: t, total: t + W.release + W.recover, blurFrom: firstFloor };
  },

  wallBeatTotal() {
    return this.wallBeatSchedule().total;
  },

  // One tap at a wall. The count is CLAMPED at `WALLCHAIN_N` rather than refused, so the fifth kick
  // and everything after it keep the move armed while the window is alive (see `tryWallBeat`).
  feedWallChain() {
    if (this.wallChainT <= 0) this.wallChain = 0;
    this.wallChain = Math.min(P.WALLCHAIN_N, this.wallChain + 1);
    this.wallChainT = P.WALLCHAIN_WINDOW;
  },

  // The count is full and the move is due: fire it if there is a face and a body to fire it at.
  // TWO READINGS, in the order the doors were built: the face under the ATTACKER first (its own
  // pick, which must be on the stone's side of him — see `wallBeatPick`), and then the face under
  // the BODY (the third door). The attacker's own reading is asked first because when both exist
  // they are almost always the same face, and it is the one the two original doors were tuned on.
  tryWallBeat() {
    if (this.wallChain < P.WALLCHAIN_N) return false;
    if (this.state === "wallbeat") return false;
    if (!this.canSkill()) return false;
    const deck = this.pos.y - P.HY;
    const w = this.wallBeatWallFind();
    if (w) {
      const e = this.wallBeatPick(w);
      if (e && this.startWallBeat(w, e, deck)) return true;
    }
    // ...the BODY's own wall. `wallBeatPick(null)` is the same grab with the `w`-relative side test
    // skipped (there is no attacker-side face to be on the wrong side of), which is exactly the
    // read this door wants: the nearest body in reach, then "is there stone behind it?".
    const v = this.wallBeatPick(null);
    if (!v) return false;
    const vw = this.wallBeatVictimWall(v);
    if (!vw) return false;
    return !!this.startWallBeat(vw, v, deck);
  },

  // THE OPENING. Everything about where the pair stands is settled here, in one place, off the
  // face's own normal: the stage the attacker is placed on, the point the victim's skull is pinned
  // to, and the two yaws — the attacker's own line, which points into the wall, and the victim's,
  // which is that turned a half turn so the two face each other with the victim's back on the stone
  // (see the note on `headPin.yaw` below). The victim's `headPin` starts at the head it ALREADY has
  // and is walked onto the wall over the take (see `updateWallBeat`), because a skull that snapped a
  // body and a half in one frame is a teleport — the same yank the launch's carry makes (see
  // `CAPO_CARRY_GRAB` in `updateVisual`).
  //
  // It reports whether it took. A stage too far from the man (see `WALLBEAT_STAGE_MAX`) is the one
  // refusal, and it has to be a refusal rather than a clamp: the take WALKS the body onto the stage
  // (see `updateWallBeat`), so a stage three units behind him is a man sliding three units in a
  // quarter of a second, and the honest answer for that frame is "not yet" — the tally is still
  // full, so the move retries on the next one.
  startWallBeat(w, e, deck) {
    const n = this.wallJumpNormal(w);
    const nx = n && (n.nx || n.nz) ? n.nx : w.nx;
    const nz = n && (n.nx || n.nz) ? n.nz : w.nz;
    const half = w.half || this.hx;
    // Where the face is, read off the BOX THE PROBE MEASURED (see `wallProbe`): `gap` is that box's
    // own clearance from the stone, so the face is `half + gap` out along the normal from the box
    // it was found under — the attacker's own for the first two doors, the VICTIM's for the third,
    // and the arithmetic is the same either way because the probe hands back its origin.
    const ox = w.ox != null ? w.ox : this.pos.x;
    const oz = w.oz != null ? w.oz : this.pos.z;
    const faceX = ox - nx * (half + w.gap);
    const faceZ = oz - nz * (half + w.gap);
    // ...and the stage, which is where the MAN is put: if walking him to it is further than the
    // take can honestly carry, the move waits (see the note above).
    const stageX = faceX + nx * P.WALLBEAT_STAND;
    const stageZ = faceZ + nz * P.WALLBEAT_STAND;
    if (Math.hypot(stageX - this.pos.x, stageZ - this.pos.z) > P.WALLBEAT_STAGE_MAX) return false;
    this.wallBeatWall = { nx, nz, faceX, faceZ, deck, topY: w.topY };
    this.wallBeatStage = { x: faceX + nx * P.WALLBEAT_STAND, y: deck, z: faceZ + nz * P.WALLBEAT_STAND };
    this.wallBeatStandFrom = { x: this.pos.x, y: deck, z: this.pos.z };
    this.wallBeatHead = { x: faceX + nx * P.WALLBEAT_HEAD_GAP, y: deck + P.WALLBEAT_HEAD_Y, z: faceZ + nz * P.WALLBEAT_HEAD_GAP };
    this.wallBeatYaw = Math.atan2(-nx, -nz);
    this.wallBeatTarget = e;
    this.wallBeatSched = this.wallBeatSchedule();
    this.wallBeatT = 0;
    this.wallBeatPhase = 0;
    this.wallBeatPu = 0;
    this.wallBeatKnee = 0;
    this.wallBeatSide = -1;
    this.wallBeatJolt = 0;
    this.wallBeatBlur = 0;
    this.wallBeatSmashDone = false;
    this.wallBeatHurlDone = false;
    // Where the skull is NOW, so the pin can walk it onto the wall (see the note above).
    if (e.headPoint) {
      e.headPoint(_wallHeadV);
      this.wallBeatHeadFrom = { x: _wallHeadV.x, y: _wallHeadV.y, z: _wallHeadV.z };
    } else {
      this.wallBeatHeadFrom = { x: e.pos.x, y: e.pos.y + P.HY, z: e.pos.z };
    }
    // The victim is put under the pin: a reaction state of its own whose only clock is the hold
    // (see `Enemy.headPin` and the `wallpin` case in `stepReaction`).
    e.setState("wallpin", this.wallBeatSched.total);
    e.hurtKind = "wallpin";
    // The reaction layer EASES in rather than being slammed on (the impact's own `hurtPose = 1` is
    // for a hit that has already landed — see `hit`): the move's first beat is the TAKE, and the
    // victim's shape has to walk into the wall with the same 0.36s the placement does or the body
    // arrives in a crouch it never bent into. `POSE_IN` (0.18s, see `Enemy.update`) is what the
    // layer eases at, so the fold is half done when the skull lands.
    e.hurtPose = 0;
    e.ragdoll = false;
    e.flip = false;
    e.bounces = 0;
    e.tumble = 0; e.tumbleRate = 0; e.roll = 0; e.rollRate = 0;
    e.grounded = true;
    e.hitstop = 0;
    // The deck the pair is standing on goes into the pin: the pin takes x and z, and the body is
    // stood on this deck by `Enemy.update`'s own `wallpin` solve, so the number has to travel with
    // the placement rather than be re-guessed under the body every frame.
    //
    // ...AND THE VICTIM FACES THE MAN, not the stone (session 121). The pin's yaw is the ATTACKER's
    // own line (`wallBeatYaw`, which points into the wall) turned a half turn, so the two bodies are
    // squared on EACH OTHER with the victim's back on the stone. That is the whole of the pose fix:
    // with both of them facing the wall the victim was doubled over it with his hips presented to
    // the man behind him, which — with the beats slowing into plain heavy knees — read as something
    // this move is definitely not. Facing each other, the same beats read the way the brief meant
    // them: the head held on the stone from the front and the knees going into the belly.
    e.headPin = {
      x: this.wallBeatHeadFrom.x, y: this.wallBeatHeadFrom.y, z: this.wallBeatHeadFrom.z,
      yaw: this.wallBeatYaw + Math.PI, u: 0, jolt: 0, deck,
    };
    // The attacker: placed square on the wall, on the deck, body still.
    this.setState("wallbeat");
    this.pos.set(this.pos.x, deck + P.HY, this.pos.z);
    this.vel.set(0, 0, 0);
    this.facing = this.wallBeatYaw;
    this.wallNx = nx;
    this.wallNz = nz;
    this.hug = 0;
    this.grounded = true;
    this.prevGrounded = true;
    this.wallChain = 0;
    this.wallChainT = 0;
    this.attackBuf = 0;
    this.kickBuffer = 0;
    this.jumpBuffer = 0;
    this.slamBuffer = 0;
    this.diveBuffer = 0;
    this.dashBuffer = 0;
    this.slideBuffer = 0;
    this.squash = -0.25;
    if (this.sfx) this.sfx.wallGrab();
    this.events.push("wallbeat");
  },

  // Let the skull go. Called from `setState` (the one choke point) and from the move's own end, so
  // a hold can never outlive the state that made it — idempotent, like the whirl's and the launch's
  // own releases.
  releaseWallBeat() {
    const e = this.wallBeatTarget;
    if (e && e.built) e.headPin = null;
    this.wallBeatTarget = null;
  },

  // One frame of the move. It owns the attacker's position and facing outright (the stage is a
  // placement, see the note above), writes the victim's pin every frame, and fires the beats: the
  // smash at `take`, every knee at 0.42 of its own interval, and the throw at the top of the
  // release.
  updateWallBeat(dt, inp) {
    const W = P.WALLBEAT;
    const sched = this.wallBeatSched || (this.wallBeatSched = this.wallBeatSchedule());
    this.wallBeatT += dt;
    const t = this.wallBeatT;
    const smashEnd = W.take + W.smash;
    const holdEnd = smashEnd + W.hold;
    const kneeEnd = sched.kneeEnd;
    const releaseEnd = kneeEnd + W.release;
    const total = releaseEnd + W.recover;

    // Which beat of the move it is, and how far into that beat (the pose reads both).
    let phase, pu;
    if (t < W.take) { phase = 0; pu = t / W.take; }
    else if (t < smashEnd) { phase = 1; pu = (t - W.take) / W.smash; }
    else if (t < holdEnd) { phase = 2; pu = (t - smashEnd) / W.hold; }
    else if (t < kneeEnd) {
      phase = 3;
      let i = 0;
      while (i < sched.times.length - 1 && t >= sched.times[i].end) i++;
      const kt = sched.times[i];
      pu = Math.min(1, Math.max(0, (t - kt.start) / Math.max(1e-3, kt.iv)));
      // ...and the blur is the BEAT's own (see `wallBeatSchedule`): 0 while the beats are still real
      // intervals, ramping across a floored tail to 1 on the last one. On the shipped ten-per-cent
      // ramp there is no floor to reach, so every knee's blur is 0.
      this.wallBeatBlur = kt.blur;
    } else if (t < releaseEnd) { phase = 4; pu = (t - kneeEnd) / W.release; this.wallBeatBlur = 1; }
    else { phase = 5; pu = (t - releaseEnd) / W.recover; }
    this.wallBeatPhase = phase;
    this.wallBeatPu = pu;
    this.wallBeatJolt = Math.max(0, this.wallBeatJolt - dt / 0.17);

    // ---- the attacker: walked onto the stage over the take, then held there ----
    const stage = this.wallBeatStage;
    const sf = this.wallBeatStandFrom;
    const k = Math.min(1, t / Math.max(1e-3, W.take * 0.7));
    const sw = k * k * (3 - 2 * k);
    this.pos.set(sf.x + (stage.x - sf.x) * sw, sf.y + P.HY, sf.z + (stage.z - sf.z) * sw);
    this.vel.set(0, 0, 0);
    this.facing = this.wallBeatYaw;
    this.grounded = true;

    // ---- the victim: the pin, walked onto the wall over the take ----
    const e = this.wallBeatTarget;
    if (e && e.built) {
      const head = this.wallBeatHead;
      const from = this.wallBeatHeadFrom;
      const wk = Math.min(1, t / Math.max(1e-3, W.take));
      const ww = wk * wk * (3 - 2 * wk);
      const holdU = Math.min(1, Math.max(0, (t - smashEnd) / Math.max(1e-3, kneeEnd - smashEnd)));
      e.headPin = {
        x: from.x + (head.x - from.x) * ww,
        y: from.y + (head.y - from.y) * ww,
        z: from.z + (head.z - from.z) * ww,
        // ...a HALF TURN off the attacker's own line, so the two are squared on each other with the
        // victim's back on the stone (see the long note in `startWallBeat`): this pin is rewritten
        // every frame and it is the one the body actually eases its yaw onto, so the `+ PI` has to
        // be HERE or the staging silently reverts to face-the-wall.
        yaw: this.wallBeatYaw + Math.PI,
        u: holdU,
        jolt: this.wallBeatJolt,
        // ...and the deck travels with it (see `startWallBeat`): the pin takes x and z, and the
        // body is STOOD on this deck by the solve in `Enemy.update`, so it cannot be re-guessed
        // under the body every frame.
        deck: this.wallBeatWall.deck,
      };
    }

    // ---- the beats ----
    if (!this.wallBeatSmashDone && t >= W.take) {
      this.wallBeatSmashDone = true;
      this.fireWallSmash();
    }
    while (this.wallBeatKnee < sched.times.length && t >= sched.times[this.wallBeatKnee].impact) {
      this.fireWallKnee(this.wallBeatKnee);
      this.wallBeatKnee++;
    }
    if (!this.wallBeatHurlDone && t >= kneeEnd + W.release * 0.12) {
      this.wallBeatHurlDone = true;
      this.fireWallHurl();
    }
    if (t >= total) this.endWallBeat();
  },

  // THE SMASH: the skull driven into the stone. Its own beat, ahead of every knee, because it is
  // the beat the move is NAMED for — and the one the body is bent by the pose's own smash phase.
  fireWallSmash() {
    const n = this.wallBeatWall;
    const head = this.wallBeatHead;
    if (!n || !head) return;
    this.lastWallbSmash = { x: head.x, y: head.y, z: head.z, nx: n.nx, nz: n.nz };
    this.events.push("wallbsmash");
    if (this.sfx) this.sfx.slamImpact(0.7);
    this.wallBeatJolt = 1;
    const e = this.wallBeatTarget;
    if (e && e.built) e.hit("jolt", n.nx, n.nz, 0, 1, { dmg: P.WALLBEAT_DMG * 0.6, flash: 0.85 });
  },

  // THE KNEE. One beat of the flurry: the legs alternate, the jolt is written onto the victim AND
  // onto the attacker's own clock (the pose and the pin both read it), and the damage ramps with the
  // blur so the last four knees — the ones the user asked to be a blur — are the ones that hurt.
  fireWallKnee(i) {
    const n = this.wallBeatWall;
    const head = this.wallBeatHead;
    this.wallBeatSide = -this.wallBeatSide;
    this.wallBeatJolt = 1;
    // The beat's own blur (see `wallBeatSchedule`) rather than a second formula: the damage, the
    // victim's jolt and the FX event all have to be the same number the pose and the camera are
    // reading this frame, or the flurry's acceleration would be drawn at one rate and dealt at
    // another.
    const blur = (this.wallBeatSched && this.wallBeatSched.times[i] ? this.wallBeatSched.times[i].blur : 0);
    // Where the knee lands: the victim's own sternum if there is a victim to read it off (see
    // `_wallGutV`), and a fall-back measured down the pin's own line if there is not — the beat
    // still has to have a place to happen.
    const e = this.wallBeatTarget;
    let gx, gy, gz;
    if (e && e.built && e.chestPoint) {
      e.chestPoint(_wallGutV);
      gx = _wallGutV.x; gy = _wallGutV.y; gz = _wallGutV.z;
    } else {
      gx = head.x + n.nx * 0.30;
      gy = head.y - 0.30;
      gz = head.z + n.nz * 0.30;
    }
    this.lastWallbKnee = { x: gx, y: gy, z: gz, nx: n.nx, nz: n.nz, i, blur, side: this.wallBeatSide };
    this.events.push("wallbknee");
    if (this.sfx) this.sfx.hit(i % 2);
    if (e && e.built) e.hit("jolt", n.nx, n.nz, 0, 1, { dmg: P.WALLBEAT_DMG * (1 + blur * 0.6), flash: 0.34 });
  },

  // THE THROW: the skull is let go and the body is sent off the wall — "knocked far away from the
  // wall", so it is a big flat shove along the face's own normal with a pop of lift, ragdolled for
  // the whole flight. `force` is asked for because the shape it is being thrown out of is not one
  // `hit` knows: the guard that refuses a ragdoll does not apply, but the entry-shape read does, and
  // `linkPose` is what carries the pinned silhouette into the flight rather than snapping it to the
  // standing one (see the note in `hit`).
  fireWallHurl() {
    const n = this.wallBeatWall;
    const head = this.wallBeatHead;
    if (!n || !head) return;
    this.lastWallbHurl = { x: head.x, y: head.y, z: head.z, nx: n.nx, nz: n.nz };
    this.events.push("wallbhurl");
    if (this.sfx) this.sfx.blast(0.9);
    const e = this.wallBeatTarget;
    if (e && e.built) {
      e.headPin = null;
      e.linkPose();
      // ...and STAND THE BODY CLEAR OF THE STONE before it is given its shove, which is not
      // housekeeping — it is the whole reason the throw used to fall off the wall instead of being
      // thrown off it. The pin holds the SKULL on the face, which leaves the body's own collider
      // box (P.HX/P.HZ either side of an origin that is only `WALLBEAT_HEAD_GAP` out) overlapping
      // the wall for the whole hold — harmlessly, because the pin branch SKIPS `resolveColliders`
      // and the placement is rewritten at the tail of the update anyway. The first frame the pin is
      // gone, that collision runs for real, and what `resolveColliders` does with an overlapping
      // body is push it out of the face **and zero that axis's velocity**: measured, the body left
      // at −25.6 m/s and had `vel.x` set to 0 on the same frame, came to rest **0.95** from the face
      // instead of the ~9 the move is for, and the whole horizontal of the throw went into fighting
      // its own collider. Clearing the overlap here — where the throw owns the body and is about to
      // set the velocity — means there is nothing left to resolve when `resolveColliders` next
      // looks, so the shove survives. (The body is `HX·|nx| + HZ·|nz|` wide along the normal, and
      // this moves it exactly that far out from the face.)
      const outN = (e.pos.x - n.faceX) * n.nx + (e.pos.z - n.faceZ) * n.nz;
      const needN = P.HX * Math.abs(n.nx) + P.HZ * Math.abs(n.nz);
      if (outN < needN) {
        const push = needN - outN;
        e.pos.x += n.nx * push;
        e.pos.z += n.nz * push;
      }
      e.hurtKind = "flip";
      e.setState("flight", P.WALLBEAT_STUN);
      e.hurtDur = P.WALLBEAT_STUN;
      e.vel.set(n.nx * P.WALLBEAT_KNOCK, P.WALLBEAT_LIFT, n.nz * P.WALLBEAT_KNOCK);
      e.grounded = false;
      e.ragdoll = true;
      e.flip = false;
      e.bounces = 2;
      e.launchBonus = 0;
      e.tumbleTarget = e.tumble;
      e.tumbleRate = 0;
      e.rollRate = (Math.random() < 0.5 ? -1 : 1) * 0.6;
      e.flash = 1;
      e.hp = Math.max(0, e.hp - P.WALLBEAT_DMG);
      e.noteHit(P.WALLBEAT_KNOCK, true);
    }
    // ...and the move LETS GO here, not at `endWallBeat`: the body is off the wall the frame this
    // fires, so the hold has to end with it or `updateWallBeat` writes the pin straight back on the
    // next frame and the throw is cancelled the instant it is thrown (measured: the body left at
    // -25.8 m/s and had its velocity zeroed and its `headPin` re-created one frame later, which
    // pinned it back to the wall for the whole of the release). The release is the move's own
    // recovery; what it is recovering from is the throw, and the victim is gone at the top of it.
    this.wallBeatTarget = null;
  },

  // ...and the move's own end: back on the deck, in the state the ground is in. `releaseWallBeat`
  // runs through `setState` as well, so this is only the tidy-up of the attacker's own side.
  endWallBeat() {
    this.wallBeatTarget = null;
    this.setState("ground");
    this.wallBeatT = 0;
    this.wallBeatPhase = 0;
    this.wallBeatBlur = 0;
    this.wallBeatJolt = 0;
    this.wallBeatSched = null;
  },

  // THE WALL CLINCH'S OWN POSE LAYER (lifted out of `updateVisual`). One layer on the skills' own
  // fade, and its live contact is the same bargain the clinch's is: the victim's HEAD BONE is walked
  // into the player's own frame every frame and both hands are SOLVED onto it. It has to be live for
  // the clinch's own reason — the skull is the one thing in the move that something else owns (the
  // pin), and the trunk folding over it moves the shoulders the arms hang off — so a table of hand
  // angles could not promise the hands are on the head. It reads `_clinchV` (player/pose.js), the
  // same scratch the grab's clinch and the whirl's neck use.
  solveWallBeatPose(dt, ud) {
    this.wallBeatPose = approach(this.wallBeatPose, this.state === "wallbeat" ? 1 : 0, dt / SKILL_POSE_FADE);
    if (ud && ud.clearWallBeatHead) ud.clearWallBeatHead();
    if (ud && ud.poseWallBeat && this.wallBeatPose > 0.002) {
      const we = this.wallBeatTarget;
      if (ud.setWallBeatHead && we && we.built && we.headPoint) {
        this.charMesh.updateWorldMatrix(true, false);
        we.headPoint(_clinchV);
        this.charMesh.worldToLocal(_clinchV);
        ud.setWallBeatHead(_clinchV.x, _clinchV.y, _clinchV.z);
        if (ud.setWallBeatWall) ud.setWallBeatWall(this.wallNx, this.wallNz);
      }
      ud.poseWallBeat(this.wallBeatPose, this.wallBeatPhase, this.wallBeatPu,
        this.wallBeatKnee, this.wallBeatSide, this.wallBeatBlur, this.wallBeatJolt);
    }
  },
};

export function installWallbeat(Player) {
  Object.assign(Player.prototype, wallbeatMethods);
}
