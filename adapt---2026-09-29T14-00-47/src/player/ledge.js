// ---------------------------------------------------------------------------
// THE LEDGE AND THE MANTLE (part 11 of the player.js split).
//
// The auto ledge grab and the pull-up it opens onto: the reads that find the lip
// (`mantleTarget` / `ledgeTarget` / `ledgeFind`), the lip's own rig-frame solve
// (`gripLocal`), and the two state entries (`startMantle` / `startLedge`) — six
// methods, verbatim, in a table `installLedge` copies onto `Player.prototype`.
//
// The two blocks were NOT adjacent in `player.js`: the reads and `gripLocal` sat
// between the squeeze and the launch pad, and the state entries came after the
// pad's own two methods. They are one feature, so they are one file here.
//
// A LEAF with respect to player.js: it imports `P` (player/config.js) and
// `approach` (player/math.js). No scratch. Every cross-reference (the ledge's
// grip solve read by `updateVisual`, the reads called from `update`) is a `this.`
// method call, so the prototype copy is enough.
// ---------------------------------------------------------------------------
import * as THREE from "../three.js";
import { P } from "./config.js";
import { approach } from "./math.js";
import { MANTLE_POSE_FADE, LEDGE_POSE_FADE } from "./pose.js";

const ledgeMethods = {

  // Where a climb over this wall's top edge would land, or null if there is nothing to vault.
  mantleTarget(w) {
    const raise = w.topY - (this.pos.y - P.HY);
    if (raise > P.MANTLE_REACH || raise < -0.5) return null;
    const x = this.pos.x - w.nx * P.MANTLE_PUSH;
    const z = this.pos.z - w.nz * P.MANTLE_PUSH;
    const y = w.topY + P.HY + 0.004;
    if (!this.spaceFree(x, y, z)) return null;
    return { x, y, z, nx: w.nx, nz: w.nz };
  },

  // Where an AUTO GRAB would catch this wall — the same idea as `mantleTarget`, but measured
  // against the HANDS rather than the climb's own reach, so the lip may be a full body-height
  // up. Null when the top is out of the hands' window or when there is nowhere to land on top.
  ledgeTarget(w) {
    const grip = P.LEDGE_GRIP * P.HY * P.BODY_RATIO;
    const raise = w.topY - (this.pos.y - P.HY);
    if (raise < grip - P.LEDGE_SLACK || raise > grip + P.LEDGE_SLACK) return null;
    const x = this.pos.x - w.nx * P.MANTLE_PUSH;
    const z = this.pos.z - w.nz * P.MANTLE_PUSH;
    const y = w.topY + P.HY + 0.004;
    if (!this.spaceFree(x, y, z)) return null;
    return { x, y, z, nx: w.nx, nz: w.nz };
  },

  // WHERE A LEDGE GRAB WOULD CATCH — over EVERY face the body can see (session 159).
  //
  // The catch used to be tested against ONE wall: the one `pickWall` named for the line of travel.
  // That is right for a slide or a climb — both are things you DO to a face you are running into —
  // and wrong for the grab, which is a thing that happens to you: it made the catch depend on the
  // approach ANGLE, so a lip met on the diagonal, or on the corner of a box the body only overlaps
  // by a hand's width, was simply never offered. The user's *"to ledge grab u dont have to be angle
  // perfect"* is exactly that. So the catch now looks at all of them and takes the best one — the
  // nearest face whose top is in the HANDS' window (see `ledgeTarget`) and which has somewhere to
  // stand on top.
  //
  // `dirX/dirZ` is the line of travel (velocity, or the stick when the body has none). It only
  // breaks ties — and is handed back as `toward`, how much of that travel points AT the face, which
  // is what the wide-aircone gate in the grab block uses. `null` when there is no lip here.
  ledgeFind(dirX, dirZ) {
    let best = null;
    let bestScore = -1e9;
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      const t = this.ledgeTarget(w);
      if (!t) continue;
      const ahead = dirX * w.nx + dirZ * w.nz;
      const score = -Math.max(0, w.gap) * 1.5 + ahead * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = { w, t, toward: -ahead };
      }
    }
    if (!best && this.world && this.world.raycast) {
      // ...and THE RAY, for the face a box-distance test reads as "beside you" — the glancing
      // approach. The same fallback `findKickWall` uses, and for the same reason: the body only
      // has to be near the lip, not square to it.
      const arm = Math.max(P.HX, P.HZ);
      const hit = this.world.raycast(this.pos.x, this.pos.y, this.pos.z, dirX, 0, dirZ, arm + P.WALL_PAD + 0.1);
      if (hit && (hit.nx || hit.nz) && hit.box) {
        const w = { nx: hit.nx, nz: hit.nz, gap: Math.max(0, hit.t - arm), topY: hit.box.maxY, c: hit.box };
        const t = this.ledgeTarget(w);
        if (t) best = { w, t, toward: 1 };
      }
    }
    return best;
  },

  // THE GRIP IN THE RIG'S OWN FRAME (see `startLedge`, and `poseHang` / `poseLedgePull` in
  // streetwear.js). The palms are SOLVED onto the lip rather than authored, so the pose needs the
  // lip expressed the way `poseArmReach` takes it: from the rig origin (the FEET line — the rig is
  // drawn with its origin there, see `charMesh.position.y`) along the body's own right/up/forward,
  // in RIG units. Read on every frame of the grab and the pull-up, because the body moves and the
  // stone does not; the rig's scale is read off the drawn mesh rather than duplicated here, so a
  // retune of the model moves this with it.
  gripLocal() {
    const g = this.ledgeGrip;
    if (!g) {
      this.gripX = 0;
      this.gripY = 0;
      this.gripZ = 0;
      return;
    }
    const s = this.charMesh && this.charMesh.scale.y ? this.charMesh.scale.y : 1.351;
    const ox = this.pos.x - this.wallNx * this.hug;
    const oz = this.pos.z - this.wallNz * this.hug;
    const dx = g.x - ox;
    const dz = g.z - oz;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    this.gripX = (dx * Math.cos(this.facing) - dz * Math.sin(this.facing)) / s;
    this.gripY = (g.y - (this.pos.y - P.HY)) / s;
    this.gripZ = (dx * fx + dz * fz) / s;
  },

  // ---- THE LEDGE ENTRY: the catch and the pull-up. (These two sat after the launch
  // pad's own methods in `player.js`; they belong to this feature, not to the pad.) ----
  startMantle(t, dur) {
    this.mantleFromLedge = this.state === "ledge";
    // ...and the catch's leftover carry rides out with the vault (see `LEDGE_EXIT`): a running catch
    // that ends in a pull-up has to come off the lip still moving, or the grab has eaten the run it
    // was made from. Read HERE rather than at the mantle's end because this is the moment the pull-up
    // starts — which is exactly when the hang has finished bleeding it.
    this.mantleExit = this.mantleFromLedge && (this.ledgeCarry.x || this.ledgeCarry.z)
      ? { x: this.ledgeCarry.x * P.LEDGE_EXIT, z: this.ledgeCarry.z * P.LEDGE_EXIT }
      : null;
    this.setState("mantle");
    this.mantleFrom = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    this.mantleTo = t;
    this.mantleT = 0;
    this.mantleDur = dur || P.MANTLE_TIME;
    this.attached = false;
    this.attachMode = null;
    this.wallSliding = false;
    this.climbing = false;
    this.wallStick = 0;
    this.vel.set(0, 0, 0);
    this.facing = Math.atan2(-t.nx, -t.nz);
    // ...and NO squash on a pull-up out of a HANG, for the same reason `startLedge` takes none on
    // the catch (see the note there): the palms are a solved contact and `squash` scales the whole
    // body about its origin, so the 0.3 a climb's mantle wants would shorten the reach 10% on the
    // frame it matters most — 10% of 2.55 u is a quarter of a metre of grip, which walks both
    // hands straight through the lip. A vault off a climb keeps it: that path has no solved hands.
    this.squash = this.mantleFromLedge ? 0 : 0.3;
    this.grip = Math.min(P.GRIP_MAX, this.grip + 0.45);
    if (this.sfx) this.sfx.mantle();
    this.events.push("mantle");
  },

  // The auto ledge grab. Unlike the climb, nothing is asked for: the hands land on the lip
  // because the body is PLACED so they do — the grip sits `LEDGE_GRIP` body-heights above the
  // feet in the hang pose, so the feet line goes to `topY - that`, and the last of the gap to
  // the face is closed over the next few frames (the capsule can only ever get to `WALL_PAD`
  // on its own, and `LEDGE_HUG` is what carries the drawn body the rest of the way).
  startLedge(w, t) {
    this.setState("ledge");
    this.ledgeT = 0;
    this.ledgePhase = 0;
    this.ledgeWall = { nx: w.nx, nz: w.nz, gap: w.gap, topY: w.topY };
    this.ledgeTo = t;
    this.ledgeGripUp = P.LEDGE_GRIP * P.HY * P.BODY_RATIO;
    // Where the hang holds: `pos.y` for the feet line to land the grip on the lip (the feet line
    // is `pos.y - HY`, which is the half-height this must not forget — the grip is measured from
    // the FEET, and the body is placed by its centre), and the gap the capsule closed to, taken
    // the rest of the way to the face.
    this.ledgeSpot = {
      x: this.pos.x - w.nx * w.gap,
      y: w.topY - this.ledgeGripUp + P.HY,
      z: this.pos.z - w.nz * w.gap,
    };
    // ...and THE LIP ITSELF (session 159) — the world point the palms are SOLVED onto for the whole
    // of the grab, hang and pull-up (see the grip projection in `updateVisual`, and `poseHang` /
    // `poseLedgePull` in streetwear.js). It is the front face's plane, where the body has been
    // taken to, at the grip's own height, a palm's thickness past the stone (`LEDGE_PAST`): the
    // palm's middle sits just inside the lip and the fingers curl over it, which is what the old
    // angle-authored hold happened to do by luck. Stored ONCE here and re-projected every frame
    // after, so the hands hold the stone while the body moves under them instead of travelling
    // with it — measured on the live rig, the authored pull-up used to drag both palms 0.87 u
    // below the lip and 1.11 u into the wall before the body was standing on it.
    this.ledgeGrip = {
      x: this.ledgeSpot.x - w.nx * (P.HX + P.LEDGE_PAST),
      y: this.ledgeSpot.y - P.HY + this.ledgeGripUp,
      z: this.ledgeSpot.z - w.nz * (P.HX + P.LEDGE_PAST),
    };
    // ...and the wall the grab will HOLD is the one it caught, not whatever `pickWall` named: an
    // approach at an angle may well put a different face on the line of travel (see `ledgeFind`),
    // and the press that carries the drawn body to the stone reads the face off `this.wall`.
    this.wall = w;
    this.wallNx = w.nx;
    this.wallNz = w.nz;
    this.attached = false;
    this.attachMode = null;
    this.wallSliding = false;
    this.climbing = false;
    this.wallRunning = false;
    this.wallStick = 0;
    // THE CATCH KEEPS THE RUN (see `LEDGE_KEEP`). The velocity into the face is the wall's and goes;
    // the velocity ALONG the lip is the player's and stays, as a carry the hang spends rather than a
    // speed it has already spent. The body is PLACED (the grip is a contact), so the carry is applied
    // to the hang spot below and is what makes the catch read as catching a run instead of hitting a
    // stop — and whatever survives the hang leaves with the pull-up.
    const vn = this.vel.x * w.nx + this.vel.z * w.nz;
    const tx = this.vel.x - w.nx * vn;
    const tz = this.vel.z - w.nz * vn;
    const ts = Math.hypot(tx, tz);
    const keep = ts > 0.05 ? Math.min(P.LEDGE_CARRY_MAX, ts * P.LEDGE_KEEP) / ts : 0;
    this.ledgeCarry.x = tx * keep;
    this.ledgeCarry.z = tz * keep;
    this.vel.set(0, 0, 0);
    this.facing = Math.atan2(-w.nx, -w.nz);
    // No squash on the catch, for the same reason there is none on a slide: the hands are a
    // solved CONTACT on the lip, and `squash` scales the whole body about its origin — even the
    // small 0.22 catch would shorten the reach 7.5%, and 7.5% of 2.6 units is 13cm of grip,
    // which walks the hands straight down the face.
    if (this.sfx) this.sfx.wallGrab();
    this.events.push("ledgegrab");
  },

  // THE GRIP. The hands are on the lip, so the body goes where that says and nowhere
  // else: no gravity and no steering. It eases from the catch onto the hang spot over
  // `LEDGE_SETTLE` — down (or, if the lip was a hair out of reach, up) to the height the grip
  // needs, and the last of the gap to the face, which the capsule cannot close on its own.
  // Then it holds, and the pull-up takes over.
  //
  // ...but the ALONG-THE-LIP carry the catch kept is spent here rather than thrown away: it
  // drags the hang spot along the lip and bleeds off at `LEDGE_DRAG` (see the user's *"make
  // the ledge grab doesnt kill momentum instantly, make just slow down a bit"*). The grip
  // height is untouched by it — the carry is tangential, so the hands stay on the lip — and
  // what is left when the pull-up starts rides out with the vault (`mantleExit`).
  tickLedgeState(dt) {
        this.ledgeT += dt;
        const spot = this.ledgeSpot;
        if (!spot) {
          this.setState("air");
          return;
        }
        const carry = this.ledgeCarry;
        if (carry.x || carry.z) {
          spot.x += carry.x * dt;
          spot.z += carry.z * dt;
          const k = Math.min(1, dt * P.LEDGE_DRAG);
          carry.x -= carry.x * k;
          carry.z -= carry.z * k;
          if (Math.abs(carry.x) < 0.02 && Math.abs(carry.z) < 0.02) {
            carry.x = 0;
            carry.z = 0;
          }
        }
        const e = Math.min(1, dt / P.LEDGE_SETTLE);
        this.pos.x += (spot.x - this.pos.x) * e;
        this.pos.y += (spot.y - this.pos.y) * e;
        this.pos.z += (spot.z - this.pos.z) * e;
        this.vel.set(0, 0, 0);
        this.ledgePhase = (this.ledgePhase + dt) % 1;
        if (this.ledgeT >= P.LEDGE_HANG) this.startMantle(this.ledgeTo, P.LEDGE_PULL);
        return;
  },

  // Scripted pull-up: a short arc from where the climb topped out — or from the ledge
  // grab's own hang — onto the ledge. `mantleDur` is the arc's own clock (a grab that
  // starts from a full hang gets longer than a vault off a climb).
  tickMantleState(dt) {
        this.mantleT += dt;
        const k = Math.min(1, this.mantleT / this.mantleDur);
        // THE LEDGE PULL-UP'S OWN CLOCK (session 159). It comes off a full hang, so the body's
        // travel is a PULL — quick out of the bottom and settling onto the lip — rather than the
        // climb-topped-out vault's even sweep. The bow is all but gone with it: the body is rising
        // on its own arms (the palms hold the stone the whole way, see `poseLedgePull`), so the old
        // 0.16 of extra arc on top of that was a body being THROWN up rather than hauling itself —
        // most of the "heavy" the user asked away. Measured on the live rig, the extra arc alone
        // put the drawn hips 0.14 u above where the arms had actually pulled them.
        const ledge = this.mantleFromLedge;
        const e = ledge ? 1 - Math.pow(1 - k, 1.7) : k * k * (3 - 2 * k);
        const f = this.mantleFrom;
        const t = this.mantleTo;
        this.pos.x = f.x + (t.x - f.x) * e;
        this.pos.z = f.z + (t.z - f.z) * e;
        this.pos.y = f.y + (t.y - f.y) * e + (ledge ? 0.05 : 0.16) * Math.sin(Math.PI * k);
        if (k >= 1) {
          this.pos.copy(new THREE.Vector3(t.x, t.y, t.z));
          this.vel.set(0, 0, 0);
          // ...and the run the CATCH kept leaves with the pull-up (the user's *"make the ledge grab
          // doesnt kill momentum instantly, make just slow down a bit"*). It is the last of the
          // along-the-lip carry that the hang did not manage to bleed, so a catch taken at a run
          // ends in a run rather than in a standstill.
          if (this.mantleExit) {
            this.vel.x = this.mantleExit.x;
            this.vel.z = this.mantleExit.z;
            if (Math.hypot(this.vel.x, this.vel.z) > 0.2) this.throttle = 1;
          }
          this.mantleExit = null;
          this.ledgeGrip = null;
          this.grounded = true;
          this.prevGrounded = true;
          this.setState("ground");
          this.jumpsLeft = P.AIR_JUMPS;
          this.squash = 0.32;
          this.landTimer = 0;
          this.ledgeCd = P.LEDGE_CD;
          this.events.push("mantleend");
        }
        return;
  },

  // THE MANTLE'S OWN POSE LAYER (lifted out of `updateVisual`). A climb that tops out and a LEDGE
  // that pulls up wear different shapes off the same fade: the ledge's is keyed to the arc's own
  // clock and its arms are the hang's own solved grip (see `poseLedgeGrip`, spent below it).
  solveMantlePose(dt, ud) {
    this.mantlePose = approach(this.mantlePose, this.state === "mantle" ? 1 : 0, dt / MANTLE_POSE_FADE);
    if (ud && ud.poseMantle && this.mantlePose > 0.002) {
      const k = Math.min(1, this.mantleT / this.mantleDur);
      // ...and the pull-up out of a LEDGE is its own shape (session 159): it comes off a full hang
      // with the palms on the stone, not out of a climb that has already topped out, so its
      // shape is keyed to the arc's own clock and its arms are the hang's own solved grip
      // (`poseLedgeGrip`, spent below). The climb's own vault is untouched.
      if (this.mantleFromLedge && ud.poseLedgePull) {
        this.ledgePullPin = ud.ledgePullPin(k);
        ud.poseLedgePull(this.mantlePose, k);
      } else {
        ud.poseMantle(this.mantlePose, k);
      }
    }
  },

  // THE LEDGE HANG AND ITS GRIP (lifted out of `updateVisual`). The hang is a layer on the skills'
  // own fade; the grip is the ONE contact shared by the hang and the pull-up, solved after both
  // layers have written the body (see the note on the block).
  solveLedgePose(dt, ud) {
    // The hang. It rides the same clock the grip does (`ledgePhase`), so the legs drift while the
    // hands hold — and it fades in on its own short time constant because the grip is only
    // `LEDGE_HANG` long: the pose has to be all the way on before the pull-up starts.
    this.ledgePose = approach(this.ledgePose, this.state === "ledge" ? 1 : 0, dt / LEDGE_POSE_FADE);
    if (ud && ud.poseHang && this.ledgePose > 0.002) {
      ud.poseHang(this.ledgePose, this.ledgePhase, this.ledgeT);
    }

    // ---- THE GRIP, SOLVED ONCE ----
    // The palms on the lip are ONE contact shared by the hang and the pull-up, so they are solved
    // ONCE, here, after both layers have written the body — the same place the stretch and the neck
    // split are spent, and for the same reason (see `poseLedgeGrip`). The weight is whichever of
    // the two is further on: the hang's own fade, overdriven so the contact is ON within three
    // frames of the catch, or the pull-up's `pin` (its release keyframe). Solved against the
    // FINISHED trunk — measured at the mid-handover, solving inside either layer left the palms
    // 0.15 u below the lip, because each layer's solve was computed against a trunk the other one
    // then moved.
    if (ud && ud.poseLedgeGrip && this.ledgeGrip) {
      const lp = this.ledgePose;
      const hangW = lp > 0.002 ? Math.min(1, lp * lp * (3 - 2 * lp) * 1.8) : 0;
      // ...and the pull-up's `pin` is taken at its FACE value, not scaled by its own pose fade:
      // the arms it is holding are the HANG's (the same solved contact, still fading out alongside
      // it), so the contact weight has nothing to do with how much of the pull-up's SHAPE is on.
      // Scaled by it, the two fades multiplied and the grip dropped to ~0.48 through the middle of
      // the handover — measured, that alone let the palms sag 0.26 u off the lip for three frames.
      const pullW = this.mantleFromLedge ? this.ledgePullPin : 0;
      const gw = Math.max(hangW, pullW);
      if (gw > 0.002) {
        this.gripLocal();
        ud.poseLedgeGrip(gw, this.gripX, this.gripY, this.gripZ);
      }
    }
  },
};

export function installLedge(Player) {
  Object.assign(Player.prototype, ledgeMethods);
}
