// ---------------------------------------------------------------------------
// THE GRAB (part 3 of the player.js split).
//
// The right-click grab and its three animals (heave / set-up / slam) plus the whole
// lifecycle of a body in his hands: pickup, the spin, the crash, the miss, the lift,
// the slam. The fifteen methods are the class's own, moved verbatim into a table that
// `installGrab` copies onto `Player.prototype`; only their scratch moved with them.
//
// Like player/pole.js this is a LEAF with respect to player.js: it imports three.js
// (the scratch vectors), `P` (player/config.js) and `TAU`/`wrapPi` (player/math.js).
// player.js imports back the five `_grab*` scratch vectors that `updateVisual` still
// reads, so the two files share ONE set of them. No circular import.
// ---------------------------------------------------------------------------
import * as THREE from "../three.js";
import { P } from "./config.js";
import { TAU, wrapPi, approach } from "./math.js";
import { SKILL_POSE_FADE } from "./pose.js";

// THE GRAB's own scratch (see `grabContact` / `updateGrab`): the point on the other body's rig that
// the two hands are closed on — the sternum, the midpoint of the two shoulders, or the shin — read
// LIVE off its bones and walked into the player's own frame (the same bargain `_clinchV` makes for
// the clinch). `_grabW` is the world-space answer, kept for the harness so the gap between the
// hands' target and the contact it was solved onto can be MEASURED rather than assumed.
const _grabV = new THREE.Vector3();
const _grabW = new THREE.Vector3();
const _grabS = new THREE.Vector3();
const _grabX = new THREE.Vector3();
const _grabY = new THREE.Vector3();

export { _grabV, _grabW, _grabS, _grabX, _grabY };

const grabMethods = {

  // =========================================================================
  // THE RIGHT-CLICK GRAB (see the constants block above for the brief). One button, three moves,
  // and `grabPick` is what decides between them — by where the body IS, which is the only thing the
  // user's own three sentences are about: *"standing"*, *"under me on the floor"*, and *"airborne
  // above me"*.
  //
  // Every one of the three is a HAUL plus a beat, and the haul is the game's OWN (the clinch's
  // `grabDist`/`grabT` servo — see `Enemy.update`): a body with `grabDist` non-null and `grabT`
  // positive is driven to that distance in front of the player, squared onto him and pinned to his
  // own deck, for as long as `grabT` lasts. None of that machinery is new; what is new is that
  // three different moves write it, and that the CLOCK each one writes is the move's own.
  //
  // THE CONTACT is live, and it is the whole point of the button: `grabPoint` reads the point off
  // the other body's OWN rig every frame (its throat, the midpoint of its shoulders, or its shin)
  // and `updateVisual` hands it to the pose, which solves both hands onto it.
  grabTotal() {
    if (this.grabKind === 1) return P.GRAB_LIFT_T;
    if (this.grabKind === 2) return P.GRAB_SLAM_T;
    return this.grabMiss ? P.GRAB_MISS_PLAY : P.GRAB_PLAY;
  },

  // The flash grab's pose clock: one straight run over the move, hit or miss.
  heavePoseT() {
    return Math.min(1, this.grabT / Math.max(1e-3, this.grabTotal()));
  },

  // THE BUTTON. It takes whatever `grabPick` found, locks the state, and from there the kind's own
  // reader (`updateGrabThrow` / `updateGrabLift` / `updateGrabSlam`) runs the move. A press with
  // nothing in reach is a WHIFF: the chest shape still plays, on the authored fallback path, and
  // the hands close on nothing.
  grab() {
    if (this.grabCd > 0) return false;
    // THE GUARD IS ARMS-ONLY (see `startBlock` / `guardLatch`): a body behind a raised guard has no
    // hands free to take anybody by the shoulders, so the right button does nothing at all while
    // the block is up. A TOGGLED guard that has only just been let go is not "up" — the frame it
    // was let go of, the state has already left `block` (see the block's own exit), so this is a
    // backstop for the ordering rather than the thing the toggle leans on.
    if (this.state === "block") return false;
    if (!this.canSkill()) return false;
    // THE BUTTON IS A STANDING MOVE — the user's *"make me not able to do grab when moving in a
    // speed above 17"*. Thrown at a run there is no reaching out at all: the hands stay down and
    // the press does nothing (no grab, no pole, no whiff sound). `COMBAT_SPEED` (17) is the game's
    // own line between standing and running — the M1 chain reads the very same number off the very
    // same speed (see `COMBAT_SPEED` above) — so the grab wears it too rather than inventing a
    // second threshold. Read off the speed the body is ACTUALLY carrying rather than off the keys,
    // so it is the momentum from a dive, a slide or a dash that counts.
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > P.COMBAT_SPEED) return false;
    // (THE RUNNING LUNGE used to be thrown from right here, ahead of the grab, at `LUNGE_MIN` (20)
    //  and over — see `lunge` / `startLunge`. THE USER REMOVED IT (session 89: *"remove the
    //  lunge"*), so the right button is now the GRAB and only the grab. The state, its poses and
    //  its enemy reactions are all left in the file, unwired exactly as the whirl's are, so the
    //  move is still whole here if it is ever wanted back.)
    // THE POLE FIRST, and it comes in two halves. A staff ALREADY IN HIS HANDS is the more specific
    // answer of the two — a body holding a stick is a body whose right button is about the stick —
    // so the press HURLS IT (see `poleThrow`), and that is asked BEFORE the standing-speed gate
    // below because the throw the brief asked for is *"i can throw it with m2 / pressing grab
    // again"*: an M2 that only worked from a standstill would be a different move. A staff standing
    // in the WORLD is the other half: the same button takes it (see `poleTake`), and a press with
    // neither falls straight through to the three animals below.
    if (this.holdingPole()) return this.poleThrow();
    if (this.poleTake(this.poleNear())) return true;
    if (this.overT <= 0) this.grabCd = P.GRAB_CD;
    const pick = this.grabPick();
    this.grabTarget = pick.e;
    this.grabKind = pick.kind;
    // Hit or miss is decided AT THE HAND (`resolveGrabTake`), not here: the dash covers ground,
    // so the press only picks the line and the likely body. A press with nothing on it just means
    // the dash is already a whiff.
    this.grabMiss = false;
    this.grabMissClamp = false;
    this.grabMissCatch = false;
    this.grabAimZero = this.facing;
    if (pick.e && pick.e.built) {
      // The line the move is aimed down: the body's own line at the press. A whiff keeps the line
      // the player was facing, so the shape still plays out where he was looking.
      this.grabAimZero = Math.atan2(pick.e.pos.x - this.pos.x, pick.e.pos.z - this.pos.z);
    }
    this.setState("grab");
    this.grabT = 0;
    this.grabFlip = 0;
    this.grabTake = false;
    this.grabReleased = false;
    this.grabDashed = false;
    this.grabYaw0 = this.facing;
    this.grabSpinY = 0;
    this.lastGrabDash = null;
    this.grabLanded = false;
    this.grabGap = -1;
    this.grabAnkle0 = null;
    this.lastGrab = null;
    this.lastGrabThrow = null;
    this.lastGrabSet = null;
    this.lastGrabSlam = null;
    this.attackBuf = 0;
    this.events.push("grab");
    return true;
  },

  // WHICH of the three it is — and the order is the whole of it. A body coming down out of the air
  // is the most specific thing the button can find and the one the other two would otherwise steal
  // (it is inside the chest's reach on its way past), so the ANKLE is looked for first; then a body
  // on the DECK at or under his own feet; and only then a body standing in front of him. Each has
  // its own reach and its own height band, because each is reaching for a different part of a body
  // that is in a different place.
  //
  // The height bands are measured off the player's own FEET (`py` — the enemy's `pos.y` is its
  // feet, the same convention the collision box uses everywhere else), so "above me" and "under me"
  // mean exactly that rather than being offsets from a centre.
  grabPick() {
    const none = { e: null, kind: 0 };
    if (!this.enemies || !this.enemies.spawned) return none;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const py = this.pos.y - P.HY;
    const nearest = (reach, yLo, yHi, want) => {
      const hits = this.enemies.inFront(this.pos.x, this.pos.z, fx, fz, reach, P.GRAB_ARC, [yLo, yHi]);
      let best = null;
      let bestD = Infinity;
      for (const e of hits) {
        if (!e.built || e.ragdoll) continue;
        if (want && !want(e)) continue;
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        if (d < bestD) { bestD = d; best = e; }
      }
      return best;
    };
    // (2b) THE AIR-COMBO SLAM — a body being JUGGLED. Mid-combo the body is a ragdoll
    // (the finisher and the flips ragdoll it), which every branch below refuses — so a press
    // thrown out of an air combo always whiffed. While the window is open (or the player is off
    // the deck with it) limp bodies count too, and the take is kind 2 (the ankle slam, whose
    // take below already clears the ragdoll with `force`). A standing body is still skipped: it
    // has to be UP (or still rising through the deck at the bottom of a juggle).
    if (this.airComboT > 0 || !this.grounded) {
      const chits = this.enemies.inFront(this.pos.x, this.pos.z, fx, fz,
        Math.max(P.GRAB_AIR_RANGE, 3.6), P.GRAB_ARC, [py - 2.2, py + 4.2], { ragdolls: true });
      let cbest = null;
      let cbestD = Infinity;
      for (const e of chits) {
        if (!e.built) continue;
        if (e.grounded && e.vel.y <= P.DIVE_UP_V) continue;
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        if (d < cbestD) { cbestD = d; cbest = e; }
      }
      if (cbest) return { e: cbest, kind: 2 };
    }
    // (2) THE SLAM — a body in the AIR above him.
    const air = nearest(P.GRAB_AIR_RANGE, py - 1.0, py + 4.2,
      (e) => !e.grounded && e.pos.y > py + P.GRAB_AIR_ABOVE);
    if (air) return { e: air, kind: 2 };
    // (1) THE SET-UP — a body on the DECK, at or under his own feet.
    const floored = nearest(P.GRAB_RANGE, py - 1.8, py + 1.4,
      (e) => (e.state === "down" || e.state === "getup") && e.pos.y < py + P.GRAB_FLOOR_BELOW);
    if (floored) return { e: floored, kind: 1 };
    // (0) THE HEAVE — a body standing in front of him.
    const standing = nearest(P.GRAB_RANGE, py - 1.4, py + 2.4,
      (e) => e.grounded && e.state !== "down" && e.state !== "getup");
    if (standing) return { e: standing, kind: 0 };
    return none;
  },

  // WHERE THE CONTACT IS — the point on the other body's rig that both hands are closed on, in
  // WORLD space, read LIVE off its own bones (`throatPoint` / `shoulderPoint` / `legPoint`) so the
  // fold of its reaction, the haul it is under and the swing it is being taken on are all already
  // in the number the hands are asked for. Which point it is is the KIND's: the throat, the
  // midpoint of the two shoulder joints, or the shin.
  grabPoint(e, out) {
    if (this.grabKind === 1) {
      e.shoulderPoint(-1, out);
      if (e.shoulderPoint(1, _grabS)) out.add(_grabS).multiplyScalar(0.5);
      return out;
    }
    if (this.grabKind === 2) return e.legPoint(out);
    if (e.throatPoint) return e.throatPoint(out);
    return e.chestPoint(out);
  },

  // THE GAP: how far the nearest of the two HANDS actually is, in world units, from the contact it
  // was solved onto. The arm solve is a two-bone reach with an authored elbow pole that the pose
  // cross-fades in (see `poseArmReach` in streetwear.js), so the hand is not pinned to the point —
  // it is *aimed* at it — and this is the read that says whether "touching" is what happened. It is
  // taken with the rig in LAST frame's pose (the physics runs before `updateVisual`), which is the
  // same one-frame staleness the clinch's own hand solve has. `-1` means there was nothing to read.
  grabMeasure(e, contact) {
    const ud = this.charMesh && this.charMesh.userData;
    const b = ud && ud.bones;
    if (!b || !ud.handLocal || !b.armLowerL || !b.armLowerR) { this.grabGap = -1; return; }
    const hl = b.armLowerL.localToWorld(_grabS.copy(ud.handLocal.L));
    const hr = b.armLowerR.localToWorld(_grabV.copy(ud.handLocal.R));
    if (this.grabKind === 1) {
      // A SHOULDER grip is two hands on two JOINTS, not two hands either side of one point: the
      // thing to measure is therefore each hand against the shoulder it is actually on, which is
      // the nearest of the two (the hands are placed on the joints themselves — see
      // `GRAB_SPREAD_SHOULDER` — so the pairing is symmetric and the nearest is the right one).
      const sA = e.shoulderPoint(-1, _grabX);
      const sB = e.shoulderPoint(1, _grabY);
      let m = Infinity;
      for (const h of [hl, hr]) {
        m = Math.min(m, h.distanceTo(sA), h.distanceTo(sB));
      }
      this.grabGap = m;
      return;
    }
    this.grabGap = Math.min(contact.distanceTo(hl), contact.distanceTo(hr));
  },

  // One frame of the move. The three kinds are their own readers; what is shared is the CONTACT —
  // the live point, handed to the pose for as long as the hands are on the body, and cleared on
  // every other frame so the reach and the follow-through are the authored shape's own.
  updateGrab(dt, inp) {
    this.grabT += dt;
    const e = this.grabTarget;
    if (this.grabKind === 1) this.updateGrabLift(dt, e);
    else if (this.grabKind === 2) this.updateGrabSlam(dt, e);
    else this.updateGrabThrow(dt, e, inp);
    const ud = this.charMesh && this.charMesh.userData;
    if (ud && ud.clearGrabPoint) {
      if (this.grabTake && !this.grabReleased && e && e.built) {
        this.charMesh.updateWorldMatrix(true, false);
        this.grabPoint(e, _grabW);
        this.grabMeasure(e, _grabW);
        _grabV.copy(_grabW);
        this.charMesh.worldToLocal(_grabV);
        ud.setGrabPoint(_grabV.x, _grabV.y, _grabV.z);
      } else {
        ud.clearGrabPoint();
      }
    }
    if (this.grabT >= this.grabTotal()) this.endGrab();
  },

  // Out of the grab — the move ran out (or the body died, which resets the state under it).
  endGrab() {
    const ud = this.charMesh && this.charMesh.userData;
    if (ud && ud.clearGrabPoint) ud.clearGrabPoint();
    this.grabTarget = null;
    this.setState(this.grounded ? "ground" : "air");
  },

  // -------------------------------------------------------------------------
  // (0) THE FLASH GRAB — wind-up, flash dash, lock, 360 spin-lift, crash. One continuous
  // cinematic on `GRAB_PLAY`: a slow crouch with the arm back, a 1-2 frame rocket onto the
  // throat, a hitstop freeze as the grip locks, a full 360 swing with the body dangling, and a
  // back-first crash into the deck finished from a hero landing. Hit or miss is decided AT THE
  // HAND (`GRAB_TAKE`), not at the press: the dash covers ground, so a body the press could not
  // see can still be taken, and only a dash that truly lands on air whiffs.
  updateGrabThrow(dt, e, inp) {
    const T = this.grabT;
    const fx0 = Math.sin(this.facing);
    const fz0 = Math.cos(this.facing);
    if (!this.grabTake && !this.grabMiss) {
      if (T < P.GRAB_WINDUP) {
        // THE WIND-UP: slow and heavy. Whatever drive he had dies into the crouch — the dash
        // spends its own, so nothing here may carry him forward early.
        const damp = Math.max(0, 1 - 8 * dt);
        this.vel.x *= damp;
        this.vel.z *= damp;
        // Ease the aim onto the target's line (a turn, not a snap).
        const want = Math.abs(wrapPi(this.grabAimZero - this.facing));
        if (want > 0.02) this.facing += Math.sign(wrapPi(this.grabAimZero - this.facing)) * Math.min(want, 10 * dt);
      } else if (T < P.GRAB_TAKE) {
        // THE FLASH DASH: full drive, barely decaying — the blur. FOV + streaks go out on the
        // launch frame (`grabdash`), and the aim stays glued to the target's line.
        if (!this.grabDashed) {
          this.grabDashed = true;
          this.lastGrabDash = { x: this.pos.x, y: this.pos.y - P.HY + 0.15, z: this.pos.z, fx: fx0, fz: fz0 };
          this.events.push("grabdash");
        }
        const u = (T - P.GRAB_WINDUP) / Math.max(1e-3, P.GRAB_TAKE - P.GRAB_WINDUP);
        const sp = P.GRAB_DASH_SPEED * (1 - 0.25 * u);
        this.vel.x = fx0 * sp;
        this.vel.z = fz0 * sp;
        const want = Math.abs(wrapPi(this.grabAimZero - this.facing));
        if (want > 0.02) this.facing += Math.sign(wrapPi(this.grabAimZero - this.facing)) * Math.min(want, 14 * dt);
      } else this.resolveGrabTake(e);
    } else if (this.grabMiss) {
      this.updateGrabMiss(dt);
    } else if (!this.grabReleased) {
      this.updateGrabSpin(dt, e);
    } else {
      // THE RECOVER: the crash is spent, the hero landing sits. Everything dies to still.
      const damp = Math.max(0, 1 - 6 * dt);
      this.vel.x *= damp;
      this.vel.z *= damp;
    }
  },

  // ---- THE TAKE (at TAKE): the dash arrives — hit or miss is decided at the hand ----
  resolveGrabTake(e) {
    const dx = e && e.built ? e.pos.x - this.pos.x : 0;
    const dz = e && e.built ? e.pos.z - this.pos.z : 0;
    const d = Math.hypot(dx, dz);
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    let live = e && e.built && !e.ragdoll && d < 3.2 &&
      (d < 0.5 || (dx * fx + dz * fz) / Math.max(1e-3, d) > 0.2);
    if (!live) {
      // THE HAND DECIDES (see `grab()`): the press only picked the line, so a body that is
      // in front of the hand NOW — walked in, or just past the press's own range — still gets
      // taken. Standing bodies only: this reader is the heave's, not the lift's or the slam's.
      const fresh = this.grabPick();
      if (fresh.e && fresh.e.built && fresh.kind === 0) {
        const ax = fresh.e.pos.x - this.pos.x;
        const az = fresh.e.pos.z - this.pos.z;
        const ad = Math.hypot(ax, az);
        if (!fresh.e.ragdoll && ad < 3.2 &&
          (ad < 0.5 || (ax * fx + az * fz) / Math.max(1e-3, ad) > 0.2)) {
          e = fresh.e;
          this.grabTarget = e;
          this.grabAimZero = Math.atan2(ax, az);
          live = true;
        }
      }
    }
    if (live) {
      // THE LOCK: the throat, one hand. The clinch lands, the in-flight punch dies, the pair
      // of them pop off the deck, and the world freezes for the lock frames.
      this.grabTake = true;
      this.grabTarget = e;
      const landed = e.hit("clinch", 0, 0, 0, P.GRAB_LOCK_HOLD, { force: true });
      if (landed) {
        e.hurtKind = "chestHold";
        e.grabDist = P.GRAB_LOCK_DIST;
        e.grabT = Math.max(e.grabT, P.GRAB_LOCK_HOLD);
        e.atkT = 0;
        e.atkCd = Math.max(e.atkCd, P.GRAB_PLAY);
      }
      this.grabYaw0 = this.facing;
      this.grabSpinY = 0;
      if (e && e.built) this.grabPos0 = { x: e.pos.x, y: e.pos.y, z: e.pos.z };
      this.grounded = false;
      this.vel.y = P.GRAB_POP;
      this.vel.x = fx * 1.5;
      this.vel.z = fz * 1.5;
      if (e && e.built) e.vel.y = Math.max(e.vel.y, P.GRAB_POP + 0.6);
      this.hitstop = Math.max(this.hitstop, P.GRAB_LOCK_STOP);
      this.lastGrab = { x: e.pos.x, y: e.pos.y + 1.3, z: e.pos.z, e, kind: 0 };
      this.events.push("grabtake");
      if (this.sfx) this.sfx.squeeze();
    } else {
      // THE WHIFF: the same dash, nothing at the end of it. The drive stays on him — that is
      // what the overshoot and the skid are made of.
      this.grabMiss = true;
      this.grabTarget = null;
      this.lastGrabMiss = { x: this.pos.x + fx * 0.62, y: this.pos.y + 0.86, z: this.pos.z + fz * 0.62 };
      this.grabMissClamp = true;
      if (this.sfx) this.sfx.whiff();
      this.events.push("grabmiss");
    }
  },

  // ---- THE SPIN (TAKE to SPIN_END): a full 360 with the body dangling off the throat ----
  updateGrabSpin(dt, e) {
    const T = this.grabT;
    if (T >= P.GRAB_SPIN_END) {
      this.resolveGrabCrash(e);
      return;
    }
    // The body is OUT of the fight for the whole swing: the lock's stun is shorter than the
    // spin, so it is topped up every frame — hauled, stunned, unable to attack.
    if (e && e.built) {
      e.hurtDur = Math.max(e.hurtDur, e.hurtT + 0.3);
      e.grabT = Math.max(e.grabT, 0.3);
    }
    const u = Math.max(0, Math.min(1, (T - P.GRAB_TAKE) / Math.max(1e-3, P.GRAB_SPIN_END - P.GRAB_TAKE)));
    const s = u * u * (3 - 2 * u);
    this.grabSpinY = s * TAU;
    // ...and the BODY rides the turn: swung round him on the throat at arm's length, feet off
    // the deck, facing him the whole way. Placed, not driven — no servo could draw this arc.
    //
    // The held point is the THROAT, and it is solved onto a height read off the player's own DECK
    // (`GRAB_SPIN_HOLD`) rather than off his shoulders: the body is carried LOW — feet skimming the
    // deck at the side of a man turning on the spot — instead of being hoisted overhead, which is
    // what put its head above the player's own. `arc` lifts it a little through the middle of the
    // swing so the sweep reads as a THROW, and the deck-relative floor keeps the feet off the
    // pavement however deep the throat's own offset is.
    if (e && e.built) {
      const ang = this.grabYaw0 + s * TAU;
      let throatOff = 1.13;
      if (e.throatPoint) {
        e.throatPoint(_grabW);
        throatOff = _grabW.y - e.pos.y;
      }
      const arc = Math.sin(Math.min(1, u) * Math.PI);
      const deck = this.pos.y - P.HY;
      let wantY = deck + P.GRAB_SPIN_HOLD + arc * P.GRAB_SPIN_ARC - throatOff;
      const minY = deck + P.GRAB_SPIN_MIN;
      if (wantY < minY) wantY = minY;
      const wantX = this.pos.x + Math.sin(ang) * P.GRAB_SPIN_R;
      const wantZ = this.pos.z + Math.cos(ang) * P.GRAB_SPIN_R;
      // Handover without a pop: ease off the take position over the first 0.12 s.
      let wx = wantX, wy = wantY, wz = wantZ;
      if (this.grabPos0) {
        const hk = Math.max(0, Math.min(1, (T - P.GRAB_TAKE) / 0.12));
        const hs = hk * hk * (3 - 2 * hk);
        wx = this.grabPos0.x + (wantX - this.grabPos0.x) * hs;
        wy = this.grabPos0.y + (wantY - this.grabPos0.y) * hs;
        wz = this.grabPos0.z + (wantZ - this.grabPos0.z) * hs;
      }
      // PLACED through the whirl's own machinery (`carryOrbit`, see the `carried` block in
      // enemies.js) rather than written onto `pos`: the flash grab's spin owns every axis of where
      // the body is, and a direct write was fighting the clinch's own carry-haul — which eases a
      // carried body's feet back down to the carrier's deck every frame — so the height this move
      // asked for was never the height the body sat at. Placing it settles the argument: the orbit
      // IS the body's position for as long as the hand is on it.
      e.carryOrbit = { x: wx, y: wy, z: wz, yaw: ang + Math.PI, ph: 0.5, lay: P.GRAB_SPIN_LAY };
      e.vel.set(0, 0, 0);
    }
  },

  // ---- THE CRASH (at SPIN_END): back-first into the deck, from the hero landing ----
  resolveGrabCrash(e) {
    this.grabReleased = true;
    this.grabSpinY = 0;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    if (e && e.built) {
      // Let go FIRST, then the reaction: what follows is unambiguously the crash's.
      e.carryOrbit = null;
      e.grabT = 0;
      e.grabDist = null;
      e.pos.x = this.pos.x + fx * 1.0;
      e.pos.z = this.pos.z + fz * 1.0;
      e.pos.y = this.pos.y + 0.8;
      e.hit("trip", fx, fz, P.GRAB_CRASH_KNOCK, P.GRAB_CRASH_STUN, { dmg: P.GRAB_CRASH_DMG });
      e.vel.y = -7;
      this.lastGrabThrow = { x: e.pos.x, y: e.pos.y + 0.4, z: e.pos.z, e, power: 1 };
    } else {
      this.lastGrabThrow = {
        x: this.pos.x + fx * 1.0, y: this.pos.y, z: this.pos.z + fz * 1.0, e: null, power: 0.4,
      };
    }
    // ...and HE stomps down with it: the landing is the pose's, the weight is the game's.
    this.vel.y = Math.min(this.vel.y, -5);
    this.vel.x *= 0.2;
    this.vel.z *= 0.2;
    this.hitstop = Math.max(this.hitstop, P.GRAB_CRASH_STOP);
    if (this.sfx) this.sfx.slamImpact(1);
    this.events.push("grabcrash");
  },

  // ---- THE MISS (a whiff only): the overshoot, the skid, the frozen recovery ----
  updateGrabMiss(dt) {
    const T = this.grabT;
    if (T < P.GRAB_TAKE + 0.25) {
      // THE OVERSHOOT: nothing arrested the dash, so it is still on him — run it out.
      const u = (T - P.GRAB_TAKE) / 0.25;
      const sp = P.GRAB_DASH_SPEED * 0.45 * (1 - u * 0.5);
      this.vel.x = Math.sin(this.facing) * sp;
      this.vel.z = Math.cos(this.facing) * sp;
    } else {
      const damp = Math.max(0, 1 - 5 * dt);
      this.vel.x *= damp;
      this.vel.z *= damp;
    }
    // ...and the SKID stops under the catch-step: the one beat of the miss that touches
    // anything, so the one that gets weight — a scuff of dust and a slap.
    if (!this.grabMissCatch && T >= P.GRAB_MISS_SKID) {
      this.grabMissCatch = true;
      const fx = Math.sin(this.facing);
      const fz = Math.cos(this.facing);
      this.lastGrabCatch = {
        x: this.pos.x + fx * 0.55, y: this.pos.y - P.HY + 0.06, z: this.pos.z + fz * 0.55,
      };
      if (this.sfx) this.sfx.step(true);
      this.events.push("grabcatch");
    }
  },

  // -------------------------------------------------------------------------
  // (1) THE SET-UP — the shoulder lift. He steps in, dives both hands under a body on the deck, and
  // HAULS it back up onto its feet; the body is left there REELING (see `Enemy.dizzy` and the stars
  // `main.js` hangs over its head) — the user's *"when he stands on his feet he does a cartoony
  // dizzy animtion and a ring of starts spin over his head"*.
  //
  // The body's own rise is the game's PLAIN get-up (`Enemy.liftUp`), not a new animation of mine:
  // it is authored as a body coming up off the deck, which is exactly what this is, and forcing the
  // plain one is the point — `pickGetup` would hand a freshly-hurt body one of the show-off
  // variants, and a man being pulled up under two other hands is not showing off. Its clock is the
  // HAUL's own clock, so the body stands on its feet exactly as the hands come off it.
  updateGrabLift(dt, e) {
    if (this.grabT < P.GRAB_LIFT_TAKE) {
      const k = 1 - this.grabT / P.GRAB_LIFT_TAKE;
      this.vel.x = Math.sin(this.facing) * P.GRAB_LIFT_STEP * k;
      this.vel.z = Math.cos(this.facing) * P.GRAB_LIFT_STEP * k;
    } else {
      const damp = Math.max(0, 1 - 8 * dt);
      this.vel.x *= damp;
      this.vel.z *= damp;
    }
    // ---- THE TAKE (at TAKE): the shoulders, and the haul starts ----
    if (!this.grabTake && this.grabT >= P.GRAB_LIFT_TAKE) {
      this.grabTake = true;
      if (e && e.built) {
        // The get-up's clock is handed over as the WHOLE of the haul's own: the roll-back beat (if
        // the body's lie needs one — see `getupLead`) plus the rise, and a whisker MORE than the
        // haul lasts, so the body is still coming up on the frame the hands come off it rather than
        // having stood, gone back to `idle` and started walking.
        const lead = e.getupLead ? e.getupLead() : 0;
        const rise = Math.max(0.30, (P.GRAB_LIFT_SET - P.GRAB_LIFT_TAKE) - lead + 0.04);
        e.liftUp(rise);
        e.grabDist = P.GRAB_LIFT_DIST;
        e.grabT = Math.max(e.grabT, P.GRAB_LIFT_HOLD);
        this.lastGrab = { x: e.pos.x, y: e.pos.y + 0.45, z: e.pos.z, e, kind: 1 };
        this.events.push("grabtake");
        if (this.sfx) this.sfx.squeeze();
      }
    }
    // ---- THE SET (at SET): it is on its feet, so let go and leave it spinning ----
    if (this.grabTake && !this.grabReleased && this.grabT >= P.GRAB_LIFT_SET) {
      this.grabReleased = true;
      if (e && e.built) {
        // `linkPose` first: the rig is mid-rise, and the dizzy shape has to fade in off THAT rather
        // than replace it. Then the haul is cleared and the body is stood and left reeling.
        e.linkPose();
        e.grabT = 0;
        e.grabDist = null;
        e.carryOrbit = null;
        e.dizzy();
        this.lastGrabSet = { x: e.pos.x, y: e.pos.y + 1.0, z: e.pos.z, e };
        this.events.push("grabset");
      }
      if (this.sfx) this.sfx.squeezeOut();
    }
  },

  // -------------------------------------------------------------------------
  // (2) THE SLAM — the ankle grab and the front flip. A body in the AIR above him: both hands take
  // the shin, and the pair of them come down together — the body hauled under him and around onto
  // the deck, and the player over the top of it in a FRONT FLIP (`grabFlip`: one 2π about the rig's
  // own X, driven straight into `updateVisual`'s whole-rig rotation, exactly the way the down slam's
  // spin is), planted on the beat the turn comes round.
  //
  // The body is not solved but PLACED (`carryOrbit` — the whirl's own machinery, which owns every
  // axis of where a carried body is): it is dragged from where the shin was caught to
  // `GRAB_SLAM_DIST` in front of him, its feet driven to his own deck level, and its whole-rig angle
  // (`lay`) turned from a tipped-forward hold all the way over to the flat angle a body on the deck
  // wears — so the handover to the `down` reaction at the slam is continuous, not a snap.
  updateGrabSlam(dt, e) {
    if (this.grabT < P.GRAB_SLAM_TAKE) {
      const k = 1 - this.grabT / P.GRAB_SLAM_TAKE;
      this.vel.x = Math.sin(this.facing) * 2.6 * k;
      this.vel.z = Math.cos(this.facing) * 2.6 * k;
    }
    // ---- THE TAKE (at TAKE): the shin, and the two of them go up ----
    if (!this.grabTake && this.grabT >= P.GRAB_SLAM_TAKE) {
      this.grabTake = true;
      this.grabLanded = false;
      this.grounded = false;
      this.vel.y = P.GRAB_SLAM_JUMP;
      this.vel.x += Math.sin(this.facing) * P.GRAB_SLAM_PUSH;
      this.vel.z += Math.cos(this.facing) * P.GRAB_SLAM_PUSH;
      this.grabDeckY = this.pos.y - P.HY;
      this.hitstop = Math.max(this.hitstop, P.GRAB_STOP * 0.6);
      if (e && e.built) {
        const landed = e.hit("clinch", 0, 0, 0, P.GRAB_SLAM_HOLD + 0.5,
          { dmg: P.GRAB_SLAM_DMG * 0.4, force: true });
        if (landed) {
          // The grab OWNS it now: whatever it was doing (a ragdoll's tumble, a flip's spin) is spent
          // here, because it is being held rather than falling.
          e.ragdoll = false;
          e.flip = false;
          e.tumble = 0;
          e.tumbleRate = 0;
          e.roll = 0;
          e.rollRate = 0;
          e.hurtKind = "ankleHold";
          e.grabDist = 0.85;
          e.grabT = P.GRAB_SLAM_HOLD + 0.5;
          // The ANKLE, not the body: the haul tracks the thing in his hands (see below).
          e.legPoint(_grabW);
          this.grabAnkle0 = { x: _grabW.x, y: _grabW.y, z: _grabW.z };
        }
        this.lastGrab = { x: e.pos.x, y: e.pos.y + 0.5, z: e.pos.z, e, kind: 2 };
        this.events.push("grabtake");
        if (this.sfx) this.sfx.squeeze();
        if (this.airComboT > 0) {
          this.airComboT = Math.max(this.airComboT, P.CAPO_AIR_HOLD);
          this.airComboIdle = P.AIR_IDLE;
        }
      }
    }
    // ---- THE FLIP (TURN0 - TURN1): one whole turn about the rig's own X ----
    const t0 = P.GRAB_SLAM_TURN0;
    const t1 = P.GRAB_SLAM_TURN1;
    const g = Math.max(0, Math.min(1, (this.grabT - t0) / Math.max(1e-3, t1 - t0)));
    const s = g * g * (3 - 2 * g);         // eased at both ends: he pushes off it and lands on it
    this.grabFlip = s * TAU;
    // ---- THE HAUL (TAKE - TURN1): the body comes down and round, under him ----
    if (this.grabTake && !this.grabReleased && e && e.built && this.grabAnkle0) {
      const k = Math.max(0, Math.min(1, (this.grabT - P.GRAB_SLAM_TAKE) / Math.max(1e-3, t1 - P.GRAB_SLAM_TAKE)));
      const kk = k * k * (3 - 2 * k);
      const sinF = Math.sin(this.facing);
      const cosF = Math.cos(this.facing);
      // THE ANKLE'S OWN TARGET — and it is the ANKLE the haul aims, not the body's origin, because
      // the ankle is the thing in his hands. The anchor is measured off the SHOULDER JOINTS
      // themselves, because they are what the arms hang from: a point a fifth of a body under them
      // and `GRAB_SLAM_DIST` out in front is inside the arms' reach whichever way up the flip has
      // him, which an authored height cannot promise — the shoulders swing through more than a body
      // across this turn, and a fixed anchor would leave the hands holding air for half of it.
      const b = this.charMesh && this.charMesh.userData && this.charMesh.userData.bones;
      // THE ANCHOR IS MEASURED OFF THE SHOULDER JOINTS, on every axis. The arms hang from them, and
      // this beat turns the body head over heels: the shoulders travel most of a body's length
      // across the turn, so an anchor pinned to the FEET walks clean out of the arms' reach three
      // quarters of the way through the flip (measured: the shoulders ended up 1.38 u from where the
      // feet said the hands could work, and the grip fell 0.57 u short of the shin). Measured off
      // the joints themselves, the point is `GRAB_SLAM_DIST` out in front and a fifth of a body down
      // from them for the whole turn, which is inside the arm's reach by construction — and it comes
      // back onto the feet on the last frame, because that is where the shoulders end up.
      let sx = this.pos.x;
      let sy = this.pos.y + 0.5;
      let sz = this.pos.z;
      if (b && b.armUpperL && b.armUpperR) {
        b.armUpperL.getWorldPosition(_grabX);
        b.armUpperR.getWorldPosition(_grabY);
        sx = (_grabX.x + _grabY.x) * 0.5;
        sy = (_grabX.y + _grabY.y) * 0.5;
        sz = (_grabX.z + _grabY.z) * 0.5;
      }
      const anchorY = sy - 0.22;
      const ax = sx + sinF * P.GRAB_SLAM_DIST;
      const az = sz + cosF * P.GRAB_SLAM_DIST;
      // ...and the body is PLACED by its origin, so the ankle's own live offset inside it comes off:
      // whatever the body's own rotation and reaction are doing is already in this number, so the
      // ankle lands where it was asked for whatever shape the body is wearing.
      e.legPoint(_grabV);
      const ox = _grabV.x - e.pos.x;
      const oy = _grabV.y - e.pos.y;
      const oz = _grabV.z - e.pos.z;
      // THE TRACK IS THE ANKLE'S, not the body origin's. Lerping the ORIGIN from where the body
      // happened to be caught is the same thing only while the ankle's own offset inside the body
      // holds still — and it does not: the body is being rolled a whole turn onto its back while
      // this runs, so the ankle sweeps most of a body's length across the origin. Lerping the origin
      // therefore walked the ankle OUT past the anchor during the flip and left the hands reaching
      // at air (measured: 0.60 u short at the worst of it). The thing in his hands is the ankle, so
      // the ankle is what is tracked — from where it actually was at the take (`grabAnkle0`) onto
      // the anchor — and the origin the body is PLACED by is derived back off it every frame.
      const a0 = this.grabAnkle0;
      const hx = a0.x + (ax - a0.x) * kk;
      const hy = a0.y + (anchorY - a0.y) * kk;
      const hz = a0.z + (az - a0.z) * kk;
      // ...and the last fifth of the beat is the DRIVE: the aim hands over from `my ankle is in your
      // hands` to `my back is on the deck at THAT spot` — out at `GRAB_SLAM_LAND`, which is a longer
      // throw than the hold — so the body is planted on the frame his own feet come down and the
      // handover to the `down` reaction is continuous.
      const drop = Math.max(0, Math.min(1, (k - 0.78) / 0.22));
      const ds = drop * drop * (3 - 2 * drop);
      const lx = this.pos.x + sinF * P.GRAB_SLAM_LAND;
      const lz = this.pos.z + cosF * P.GRAB_SLAM_LAND;
      e.carryOrbit = {
        x: (hx - ox) + (lx - (hx - ox)) * ds,
        y: (hy - oy) + (this.grabDeckY - (hy - oy)) * ds,
        z: (hz - oz) + (lz - (hz - oz)) * ds,
        // He is holding it by the ankle with its feet toward him, so it faces BACK at him for the
        // whole of the turn — which is also what puts its head pointing away when it goes flat.
        // A mirrored body needs the negated angle for the same world direction (see the whirl's
        // own yardstick), so the turn runs WITH his flip rather than against it: the full
        // revolution plus the tip, landing on exactly the flat angle it always did.
        yaw: this.facing + Math.PI,
        ph: 0.5,
        lay: 0.25 - (TAU + 1.80) * s,
      };
    }
    // ---- THE SLAM (at TURN1): into the deck ----
    if (this.grabTake && !this.grabReleased && this.grabT >= t1) {
      this.grabReleased = true;
      const fx = Math.sin(this.facing);
      const fz = Math.cos(this.facing);
      if (e && e.built) {
        e.carryOrbit = null;
        e.grabT = 0;
        e.grabDist = null;
        const landed = e.hit("slam", fx, fz, P.GRAB_SLAM_KNOCK * 0.42, P.GRAB_SLAM_STUN,
          { dmg: P.GRAB_SLAM_DMG, force: true });
        this.lastGrabSlam = {
          x: e.pos.x, y: this.grabDeckY + 0.12, z: e.pos.z, e,
          power: landed ? 1.15 : 0.5,
        };
        if (landed) this.hitstop = Math.max(this.hitstop, P.GRAB_STOP * 2.4);
      } else {
        this.lastGrabSlam = {
          x: this.pos.x + fx * P.GRAB_SLAM_LAND, y: this.grabDeckY + 0.12,
          z: this.pos.z + fz * P.GRAB_SLAM_LAND, e: null, power: 0.4,
        };
      }
      this.squash = 0.55;
      this.landImpact = Math.max(this.landImpact, 0.85);
      // ...and HE stops on the spot: the flip carries him over the body and the deck catches both of
      // them, so what is left of the run he arrived on is spent on the landing rather than skidding
      // him into the body he just put down.
      this.vel.x *= 0.06;
      this.vel.z *= 0.06;
      if (this.sfx) this.sfx.slamImpact(1.1);
      this.events.push("grabslam");
    }
    // ---- and HIS OWN landing out of the flip ----
    if (this.grabTake && this.grounded && !this.grabLanded) {
      this.grabLanded = true;
      this.squash = Math.max(this.squash, 0.45);
      this.landImpact = Math.max(this.landImpact, 0.7);
      if (this.sfx) this.sfx.land(0.7);
      this.events.push("grabland");
    }
  },

  // THE GRAB'S OWN POSE LAYER (lifted out of `updateVisual`). One shape per kind, on the move's OWN
  // clock (`grabT` over `grabTotal`), and one weight across all three: the pose is handed the kind
  // and the grip's own weight (the shape closes its fists on its own beats — see `poseGrab`), so the
  // physics and the shape can never read different beats.
  //
  // ...and the MISS fades out on its own longer clock (`GRAB_MISS_FADE`), because the shape it ends
  // in is PARKED rather than recovered — a take's landing is settled and still wants the quick 0.07 s
  // cut. The weight is EASED on the way out so the parked shape sets back down into the ground pose
  // instead of leaving at a constant rate.
  solveGrabPose(dt, ud) {
    const grabbing = this.state === "grab";
    const grabFade = (!grabbing && this.grabMiss) ? P.GRAB_MISS_FADE : SKILL_POSE_FADE;
    this.grabPose = approach(this.grabPose, grabbing ? 1 : 0, dt / grabFade);
    if (ud && ud.poseGrab && this.grabPose > 0.002) {
      let gt = Math.min(1, this.grabT / Math.max(1e-3, this.grabTotal()));
      if (this.grabKind === 0 && !this.grabMiss) gt = this.heavePoseT();
      const gw = (!grabbing && this.grabMiss)
        ? this.grabPose * this.grabPose * (3 - 2 * this.grabPose) : this.grabPose;
      ud.poseGrab(gw, gt,
        this.grabKind, this.grabTake && !this.grabReleased ? 1 : 0, this.grabMiss, this.grabT);
    }
  },
};

export function installGrab(Player) {
  Object.assign(Player.prototype, grabMethods);
}
