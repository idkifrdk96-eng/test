// ---------------------------------------------------------------------------
// Part 15 of the `player.js` split: THE BLOCK (the M1 + M2 guard chord).
//
// Moved here from player.js:
//   - `chordLive` — whether the chord would put the guard up this frame.
//   - `startBlock` / `blockCatch` / `blockContact` — raising the stance, a fist
//     arriving on it, and the CHARGE running into a body.
//
// Deps: `P` from ./config.js, and the body's own fields/methods
// (`setState`, `hx`, `guardHits`, `enemies`, ...). No module-scope scratch.
// ---------------------------------------------------------------------------
import { P, RUN_STRIDE } from "./config.js";
import { swingTowards, approach } from "./math.js";
import { GUARD_RUSH_FADE, GUARD_POSE_FADE } from "./pose.js";
import { accelerate } from "./physics.js";

const blockMethods = {
  // =========================================================================
  // THE BLOCK (M1 + M2 together — see `P.BLOCK_*`, and "THE BLOCK" in the README)
  //
  // The chord is the whole way in, and it is read off the two buttons' own HELD states rather than
  // off their presses: M1 alone is the chain, M2 alone is the grab, and the two of them down
  // together are the guard. Reading the holds (rather than a third edge) is what lets the chord
  // take a move back — a chain thrown on M1 a couple of frames before M2 arrives is exactly the
  // same two buttons, and it has to be cancellable or the block would be unreachable for anyone
  // whose hands are not perfectly simultaneous. Both are also pressed on RELEASE-based edges
  // (`kickQueued` / `grabQueued`), so suppressing them here is enough to stop the punch and the
  // grab: nothing else reads the buttons.
  // =========================================================================

  // Is the chord LIVE this frame — i.e. would it put the guard up? Everything that has to stand
  // aside for the chord asks THIS rather than the two raw buttons, so the two held together in the
  // air (where there is no block: the guard is a standing stance) still mean the punch and the grab.
  chordLive(inp) {
    if (!inp || !inp.blockHeld) return false;
    return this.grounded || this.coyote > 0;
  },

  // THE CHORD. Two buttons into one stance, and which shape it opens as is the SPEED it is pressed
  // at: a body already running opens as the CHARGE, a body standing or walking opens as the GUARD
  // (and holds forward for `BLOCK_RUSH_T` to break into the charge from there).
  startBlock(hasWish, wx, wz) {
    // A move that has only just been thrown is TAKEN BACK (the chord is the same two buttons, and a
    // guard that could not interrupt its own punch would be a guard you cannot raise). Only the
    // frames before the move's own contact are eligible — the caller tests that — so nothing has
    // happened yet: the `attack` drop below is a clean fold of a move that never landed, and the
    // grab's is the same (and it can only refuse a grab that has not TAKEN anything).
    if (this.state === "attack") {
      this.attackTarget = null;
      this.attackMove = -1;
      this.attackSpinning = false;
      this.attackSpin = 0;
      this.attackFlip = 0;
      this.attackSlam = false;
      this.attackUpper = false;
      this.attackDone = true;
      this.attackNext = false;
      this.combo = 0;
      this.comboGrace = 0;
    } else if (this.state === "grab") {
      const ud = this.charMesh && this.charMesh.userData;
      if (ud && ud.clearGrabPoint) ud.clearGrabPoint();
      const e = this.grabTarget;
      if (e) { e.grabDist = null; e.grabT = 0; e.carryOrbit = null; }
      this.grabTarget = null;
      this.grabTake = false;
      this.grabReleased = true;
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.setState("block");
    this.guardT = 0;
    this.guardHitT = 0;
    this.guardRush = sp > P.BLOCK_RUSH_MIN ? 1 : 0;
    this.guardCharging = sp > P.BLOCK_RUSH_MIN;
    this.guardBroken = this.guardCharging;
    this.guardHold = 0;
    this.guardPhase = 0;
    // The charge's heading: the way the body is going if it is going anywhere, else the way it is
    // facing. It is a LINE from here on — the wish can only swing it (see the `block` case).
    let hx = hasWish ? wx : Math.sin(this.facing);
    let hz = hasWish ? wz : Math.cos(this.facing);
    if (sp > 0.6) { hx = this.vel.x; hz = this.vel.z; }
    const hl = Math.hypot(hx, hz) || 1;
    this.guardDirX = hx / hl;
    this.guardDirZ = hz / hl;
    this.guardHits.clear();
    this.lastShove = null;
    // A charge opened straight out of a run does not have to earn the break: the guard is already
    // broken, so releasing and re-pushing the forward continues it (see `BLOCK_RUSH_RE`).
    this.events.push("guardup");
    if (this.sfx && this.sfx.ui) this.sfx.ui();
  },

  // A fist arriving on the GUARD. Called from the enemy's own contact test, one frame before
  // anything here could have known about it — the same door the scissor's counter comes through
  // (see `scissorCatch`) — and, like it, it RETURNS whether it caught the punch: true means the
  // caller drops its own hit entirely. What it does NOT do is start anything: the block is a
  // stance and not a wind-up, so catching one costs the enemy its swing and gives the player
  // nothing but the frame back (and the style, which `main.js` and `abilities.js` both pay for on
  // the `block` event the scissor's counter already uses).
  blockCatch(e, dx, dz) {
    if (this.state !== "block") return false;
    if (!e || !e.built) return false;
    // It has to come at the FRONT: a guard is a wall built out of two arms, and a fist landing on
    // the small of the back is not caught by it. The arc is the melee chain's own (`COMBAT_ARC` is
    // 0.95; this is wider, because the guard's whole job is to be where the fists are).
    const ex = e.pos.x - this.pos.x;
    const ez = e.pos.z - this.pos.z;
    const d = Math.hypot(ex, ez) || 1e-3;
    if ((ex * Math.sin(this.facing) + ez * Math.cos(this.facing)) / d < Math.cos(P.BLOCK_ARC)) return false;
    this.guardHitT = P.BLOCK_HIT_T;
    // ...and the body that threw it is staggered by its own swing — the same `fold` at zero damage
    // the scissor's counter gives it.
    e.hit("fold", dx, dz, P.BLOCK_HIT_SHOVE, P.BLOCK_HIT_STUN, { dmg: 0 });
    this.lastBlock = {
      x: this.pos.x + dx * 0.5,
      y: this.pos.y + 0.42,
      z: this.pos.z + dz * 0.5,
      e,
    };
    this.hitstop = Math.max(this.hitstop, P.BLOCK_HIT_STOP);
    this.events.push("block");
    return true;
  },

  // THE CHARGE RUNNING INTO SOMEBODY. Measured exactly like the lunge (`dashContact`): the SEGMENT
  // this frame's move covered, thickened by the body's half-width, against every built body in the
  // same height band, one shove per body per charge. What is different is the direction and what
  // happens next: the knock is ACROSS the charge's line — the side the body is actually standing on
  // — so what reads is a body being thrown out of the way rather than run over, and the charge does
  // NOT stop on it (`dashContact` spends the lunge there; this one is a run, and a run that stopped
  // on the first shoulder would never cross a crowd).
  blockContact(px, pz) {
    if (!this.enemies || !this.enemies.spawned) return;
    const segX = this.pos.x - px;
    const segZ = this.pos.z - pz;
    const segLen = Math.hypot(segX, segZ);
    const ux = segLen > 1e-4 ? segX / segLen : this.guardDirX;
    const uz = segLen > 1e-4 ? segZ / segLen : this.guardDirZ;
    const reach = this.hx + P.HX + P.BLOCK_SHOVE_PAD;
    const y = this.pos.y - P.HY;
    let any = false;
    for (const e of this.enemies.list) {
      if (!e.built) continue;
      if (this.guardHits.has(e)) continue;
      if (Math.abs(e.pos.y - y) > P.HY * 1.5) continue;
      const ex = e.pos.x - px;
      const ez = e.pos.z - pz;
      const proj = segLen > 1e-4 ? Math.max(0, Math.min(segLen, ex * ux + ez * uz)) : 0;
      const cx = px + ux * proj;
      const cz = pz + uz * proj;
      if (Math.hypot(e.pos.x - cx, e.pos.z - cz) > reach) continue;
      // On the deck already, or out of the fight: nothing. (A ragdoll is skipped rather than shoved:
      // its position is its own and a shoulder does not get a vote on where a thrown body lands —
      // the same bargain the lunge makes, and it keeps a broken body's tumble from being re-shaped
      // by a move that is not even aiming at it.)
      if (e.ragdoll) continue;
      if (e.state === "down" || e.state === "getup" || (e.ragdoll && e.grounded)) continue;
      // ASIDE — the component of the gap that is ACROSS the line, which is the direction the body
      // is actually off to, PLUS the fixed shoulder (`BLOCK_SHOVE_BIAS`) that gives a body exactly
      // on the line a side at all. The bias is small enough to disappear into a body that is
      // standing off to one side of the line and large enough to decide the degenerate case.
      let ox = e.pos.x - this.pos.x;
      let oz = e.pos.z - this.pos.z;
      const along = ox * ux + oz * uz;
      ox -= ux * along;
      oz -= uz * along;
      ox += -uz * P.BLOCK_SHOVE_BIAS;
      oz += ux * P.BLOCK_SHOVE_BIAS;
      const ol = Math.hypot(ox, oz) || 1;
      const nx = ox / ol;
      const nz = oz / ol;
      const reeling = !e.grounded ||
        e.state === "fold" || e.state === "clinch" || e.state === "flight" ||
        e.state === "trip" || e.state === "wallslam" || e.state === "pushback";
      const knock = P.BLOCK_SHOVE_KNOCK *
        (reeling ? P.BLOCK_SHOVE_CATCH : 1) *
        (e.grounded ? 1 : P.BLOCK_SHOVE_AIR);
      const landed = e.hit("fold", nx, nz, knock, P.BLOCK_SHOVE_STUN, { dmg: 0 });
      if (!landed) continue;
      this.guardHits.add(e);
      any = true;
      this.lastShove = { x: e.pos.x, y: e.pos.y + P.HY * 0.8, z: e.pos.z, e, reeling };
    }
    if (any) {
      this.hitstop = Math.max(this.hitstop, P.BLOCK_HIT_STOP);
      this.events.push("guardshove");
    }
  },

  // ---- THE CHORD'S OWN CLOCK (the guard's TOGGLE — see `startBlock` and the `block` exit) ----
  // The two buttons together are the guard, and pressed TWICE they are the toggle: a guard that
  // is carried hands-free and let go with a jump or a press of either button. The read runs in
  // `update`, AHEAD of the state exits, because the block's own exit below is what has to know about it.
  // `guardChordUp` counts the seconds since the chord came UP, so the second press is measured
  // against the RELEASE rather than the key-repeat: a chord that has been up longer than
  // `BLOCK_TOGGLE_T` is a fresh guard, not the second half of a toggle.
  tickGuardChord(dt, inp, grounded) {
    const chordRaw = !!(inp && inp.blockHeld);
    if (chordRaw && !this.guardChordWas) {
      // A rising edge, on the deck only: the chord in the air is the punch and the grab (there is
      // no guard up there — see `chordLive`), so it must not toggle anything either.
      if (grounded || this.coyote > 0) {
        if (this.guardLatch) {
          // ...and a chord pressed while the guard is TOGGLED ON moves it back to the HELD guard on
          // the spot: the latch goes, so it drops the moment the buttons do, and the stance stays
          // up for as long as they are down.
          this.guardLatch = false;
        } else if (this.guardChordUp >= 0 && this.guardChordUp <= P.BLOCK_TOGGLE_T) {
          this.guardLatch = true;
          this.events.push("guardup");
          if (this.sfx && this.sfx.ui) this.sfx.ui();
        }
      }
      this.guardChordUp = -1;
    } else if (chordRaw) {
      this.guardChordUp = -1;
    } else {
      this.guardChordUp = this.guardChordUp < 0 ? 0 : this.guardChordUp + dt;
    }
    this.guardChordWas = chordRaw;
  },

  // ---- THE BLOCK (M1 + M2 together — see `startBlock`) ----
  // Checked AHEAD of every other press, because the chord is the one input that has to be able to
  // take the body off the two buttons it is made of: an M1 that arrives with M2 already down (or
  // the other way about) must not throw the punch or the grab first and ask questions later. A
  // move that has only just been thrown — inside `BLOCK_CHORD`, and therefore before its own
  // contact frame, so nothing has happened yet — is taken back by the chord; anything further
  // along is left alone and the guard waits for the buttons to come up again.
  tickBlockEntry(inp, hasWish, wx, wz, dashFree) {
    const chordHeld = this.chordLive(inp);
    if (chordHeld &&
      (this.state === "ground" || dashFree ||
        (this.state === "attack" && !this.attackDone && this.stateTime < P.BLOCK_CHORD) ||
        (this.state === "grab" && !this.grabTake && this.stateTime < P.BLOCK_CHORD))) {
      this.startBlock(hasWish, wx, wz);
    }
    return chordHeld;
  },
  // THE BLOCK STATE'S OWN BODY (the `block` case of `update`'s switch, moved here whole): the two
  // shapes are TRAVELLED here — the charge's carve and the guard's footwork — off the same frame
  // locals the host `update` had (`dt`, `inp`, `hasWish`, `wx`, `wz`), handed in as arguments.
  tickBlockState(dt, inp, hasWish, wx, wz) {
        // `forward` is the way IN to the charge (the brief's *"if i run while blocking"* — a run is
        // a FORWARD thing), and `hasWish` is what KEEPS it there: once the body is charging, ANY
        // direction held swings the line (slowly, at `BLOCK_RUSH_STEER`) rather than stepping off
        // it, because a charge you could side-step out of would not be committing to anything.
        const forward = hasWish && inp.moveZ > 0.30;
        if (this.guardCharging) {
          if (!hasWish) {
            this.guardCharging = false;
            this.guardHold = 0;
          }
        } else if (forward) {
          // ...and the way in is holding the forward. The first break is the longer one (a body
          // actually lowering its shoulder and breaking into a run); after that the guard is
          // already broken, so it only takes a push (`BLOCK_RUSH_RE`).
          this.guardHold += dt;
          const need = this.guardBroken ? P.BLOCK_RUSH_RE : P.BLOCK_RUSH_T;
          if (this.guardHold >= need) {
            this.guardCharging = true;
            this.guardBroken = true;
            const hl = Math.hypot(this.vel.x, this.vel.z);
            if (hl > 0.6) { this.guardDirX = this.vel.x / hl; this.guardDirZ = this.vel.z / hl; }
            else { this.guardDirX = wx; this.guardDirZ = wz; }
            this.guardHits.clear();
            this.events.push("guardcharge");
          }
        } else {
          this.guardHold = 0;
        }
        if (this.guardCharging) {
          if (hasWish) {
            const s = swingTowards(this.guardDirX, this.guardDirZ, wx, wz, P.BLOCK_RUSH_STEER, dt);
            this.guardDirX = s.x;
            this.guardDirZ = s.z;
          }
          // The momentum brought INTO the block is kept and settles onto the charge's own pace at
          // the run's own overspeed friction — the same bargain the ground state makes — so a guard
          // thrown up out of a 30 u/s dive is still worth most of 30 for the first second of it.
          accelerate(this.vel, this.guardDirX, this.guardDirZ, P.BLOCK_RUSH_SPEED, P.BLOCK_RUSH_ACCEL, dt);
          const sp = Math.hypot(this.vel.x, this.vel.z);
          if (sp > P.BLOCK_RUSH_SPEED) {
            const drop = P.RUN_OVERSPEED_FRICTION * (sp - P.BLOCK_RUSH_SPEED) * dt;
            const k = Math.max(0, sp - drop) / sp;
            this.vel.x *= k;
            this.vel.z *= k;
          }
          // ...and the sideways part is stripped: a body that could still side-step out of its own
          // heading would not be committing to anything.
          const along = this.vel.x * this.guardDirX + this.vel.z * this.guardDirZ;
          if (along > 0) {
            const latX = this.vel.x - this.guardDirX * along;
            const latZ = this.vel.z - this.guardDirZ * along;
            const keep = Math.max(0, 1 - P.LATERAL_GRIP * dt);
            this.vel.x = this.guardDirX * along + latX * keep;
            this.vel.z = this.guardDirZ * along + latZ * keep;
          }
        } else if (hasWish) {
          // THE GUARD WALKS. The build-up still runs underneath, so stepping out of the block and
          // into a run resumes the pace the legs had — but the cap is the walk, and the guard's
          // footwork takes the ground state's own steering grip: the part of the velocity that
          // points ACROSS the way he is being asked to go is stripped off as it is asked for, which
          // is what makes a boxing step a step rather than a drift. It is the exact opposite of the
          // charge's own bargain: a guard can re-point in a quarter of a second, and a charge cannot
          // re-point at all.
          this.throttle = Math.min(1, this.throttle + dt / P.BUILD_TIME);
          const target = Math.min(this.moveTarget() * this.lockMoveMul(inp), P.BLOCK_WALK);
          const sp0 = Math.hypot(this.vel.x, this.vel.z);
          if (sp0 > 0.05) {
            const align = (this.vel.x * wx + this.vel.z * wz) / sp0;
            const grip = align >= 0 ? P.LATERAL_GRIP : P.LATERAL_GRIP * (1 + align);
            if (grip > 0.001) {
              const vAlong = this.vel.x * wx + this.vel.z * wz;
              const latX = this.vel.x - wx * vAlong;
              const latZ = this.vel.z - wz * vAlong;
              const keep = Math.max(0, 1 - grip * dt);
              this.vel.x = wx * vAlong + latX * keep;
              this.vel.z = wz * vAlong + latZ * keep;
            }
          }
          accelerate(this.vel, wx, wz, target, P.BLOCK_ACCEL, dt);
          const sp = Math.hypot(this.vel.x, this.vel.z);
          if (sp > target) {
            const drop = P.OVERSPEED_FRICTION * (sp - target) * dt;
            const k = Math.max(0, sp - drop) / sp;
            this.vel.x *= k;
            this.vel.z *= k;
          }
        } else {
          this.throttle = Math.max(0, this.throttle - dt / P.BUILD_DECAY);
          // The guard stands on the same deck the run does, so it is held the same way: the deck's
          // own grip, which is the standing brake on deck that can hold him and the kinetic slide
          // past it (see `deckGrip`).
          this.deckGrip(dt);
        }
        // ...and the guard walks the same deck the run does (see "THE SLOPE"): a charge up a flank
        // is a charge the speed has to pay for, and a flank too steep for it slides him.
        this.slopePull(dt);
        this.slopeGate();
        this.vel.y -= P.GRAVITY * dt;
  },

  // THE BLOCK/GUARD'S OWN POSE LAYER (lifted out of `updateVisual`). An absolute pose like the
  // crouch's, on its own fade — and the GUARD→CHARGE slide lives INSIDE it (`guardRush`), as one blend
  // through the pose's own channels rather than a cross-fade between two poses: the guard's lead hand
  // and the charge's arm-over-the-eyes are chosen by the same channels, and two poses averaged through
  // each other would put an arm through the face on the way. The stride is driven off the speed the
  // body is actually making (`guardPhase`), so a charge's legs keep up with the charge and the guard's
  // shuffle is the shuffle of a walk.
  solveBlockPose(dt, ud, speed) {
    // ...and the last TWO arguments are the pair of blends `poseBlock` reads:
    //
    //   `runCarry`  WHICH ARM SHAPE the block is wearing — the boxer's two-armed guard or the single
    //               arm across the eyes with the other left to the run (the brief's *"if player is
    //               staionary and m1 and m2 is held ... the right arm and left arm cover the player
    //               face like a boxer ... if the player held m1 and m2 at the same time and is running
    //               put the player right arm over his eye"*). IT IS THE SPEED'S OWN READ, NOT
    //               `runBlend` (session 195 — the user's *"make the block animation when im walking
    //               slowly normal 2 hands block make the one hand bash block thing only when im
    //               running fast"*): `wantRun` reaches 1 at **1.6 u/s**, a slow walk, so the guard
    //               used to lose its two-handed shape the moment it took a step — standing still was
    //               the boxing block and every walk was the bash. The band is `BLOCK_RUN_LO`..
    //               `BLOCK_RUN_HI`, which STRADDLES the guard's own top speed (`BLOCK_WALK` 3.2), so
    //               the whole of a walking block is inside the two-hand shape and the one-arm bash is
    //               what a body that is genuinely RUNNING wears (a sprint, or the charge's own 13.5).
    //               The `max` with `guardRush` in `poseBlock` still means a CHARGE is the bash
    //               whenever it is on, at any speed — this only ever decides the GUARD's arms — and
    //               the LEFT arm rides the same number (it belongs to the guard exactly as far as the
    //               RUN CARRY does not), which is what keeps both hands up at a walk.
    //   `runBlend`  THE BLOCK'S BODY CHANNEL's own stand-down (`eb`), unchanged: how much of the run
    //               cycle is playing UNDER the guard, which is the session-90 brief's *"the normal run
    //               animtion plays normally BUT my right ARM only the thing that changes"*. It stays
    //               on the cycle's own blend because that is what it is a statement about — the body
    //               the cycle is carrying — so the charge's fold is still handed over to the run the
    //               moment the legs are, exactly as before.
    this.guardRush = approach(this.guardRush, this.guardCharging ? 1 : 0, dt / GUARD_RUSH_FADE);
    this.guardPose = approach(this.guardPose, this.state === "block" ? 1 : 0, dt / GUARD_POSE_FADE);
    if (this.state === "block") {
      const rate = Math.min(1 / 0.42, speed / (RUN_STRIDE * 0.5));
      this.guardPhase = (this.guardPhase + rate * dt) % 1;
    }
    if (ud && ud.poseBlock && this.guardPose > 0.002) {
      const walk = Math.min(1, Math.max(0, (speed - 0.35) / 1.7));
      // (a plain ramp, not an eased one: `speed` is the physics' own number and already continuous,
      // and the arm's journey between the two shapes is `blockArm`'s own arc — see `poseBlock`.)
      const runCarry = Math.min(1, Math.max(0, (speed - P.BLOCK_RUN_LO) / Math.max(1e-3, P.BLOCK_RUN_HI - P.BLOCK_RUN_LO)));
      ud.poseBlock(
        this.guardPose,
        this.guardRush,
        Math.min(1, this.guardHitT / P.BLOCK_HIT_T),
        this.guardPhase,
        walk,
        this.idleTime,
        runCarry,
        this.runBlend
      );
    }
  },
};

export function installBlock(Player) {
  Object.assign(Player.prototype, blockMethods);
}
