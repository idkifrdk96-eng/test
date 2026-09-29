// ---------------------------------------------------------------------------
// Part 20 of the `player.js` split: THE CLOCKS AND THE BUFFERS.
//
// Lifted out of the top of `Player.update` — the whole block that ticks every cooldown,
// window, tally, buffer and regen BEFORE the state machine runs, so `update` reads as the
// state machine it is. It is called back in the same position it held inline:
//
//   this.tickClocks(dt, grounded, inp);
//
// `grounded` and `inp` are the only two locals of `update` it needs; everything else it
// touches is the body's own fields. Order within the block is preserved exactly — several of
// these clocks are read by the state machine later in the same frame.
//
// Deps: `P` from ./config.js, the body's own fields, and `this.tryWallBeat` / other
// installed methods. Nothing here touches THREE.
// ---------------------------------------------------------------------------
import { P } from "./config.js";

const clocksMethods = {
  tickClocks(dt, grounded, inp) {
    this.stateTime += dt;
    this.wallCd = Math.max(0, this.wallCd - dt);
    this.wallCoyote = Math.max(0, this.wallCoyote - dt);
    this.slideCd = Math.max(0, this.slideCd - dt);
    this.wallStick = Math.max(0, this.wallStick - dt);
    this.wallLock = Math.max(0, this.wallLock - dt);
    this.ledgeCd = Math.max(0, this.ledgeCd - dt);
    this.vaultCd = Math.max(0, this.vaultCd - dt);
    this.wallRunCd = Math.max(0, this.wallRunCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.diveCd = Math.max(0, this.diveCd - dt);
    this.slamCd = Math.max(0, this.slamCd - dt);
    this.kickCd = Math.max(0, this.kickCd - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.attackBuf = Math.max(0, this.attackBuf - dt);
    // ---- THE WALL CLINCH's entry tally (see `feedWallChain` / `tryWallBeat`) ----
    // The count's own window, and then the attempt. While the tally is FULL it RETRIES every frame
    // until it can fire — a face and a body both in reach — or the window lapses; that is what makes
    // the door work for the wall-kick door in particular, because the fifth boot leaves the body
    // flying off the face with nothing in reach and the move has to hand over the moment it can.
    // Gated on the body being on the deck or working a wall: that is where the move is thrown from,
    // and handing over from mid-flight would snap a diving body onto a stage.
    if (this.wallChain > 0) {
      this.wallChainT = Math.max(0, this.wallChainT - dt);
      if (this.wallChainT <= 0) this.wallChain = 0;
    }
    if (this.wallChain >= P.WALLCHAIN_N && this.state !== "wallbeat" && (grounded || this.onWallContact())) {
      this.tryWallBeat();
    }
    // The four meters' clocks (see "The HUD dial"): the three skill cooldowns, the scissor's
    // counter window, the overdrive, the hit i-frames, and the clock that both the health regen
    // and the HUD's hurt flash read.
    this.whirlCd = Math.max(0, this.whirlCd - dt);
    this.kneeCd = Math.max(0, this.kneeCd - dt);
    this.grabCd = Math.max(0, this.grabCd - dt);
    this.lungeCd = Math.max(0, this.lungeCd - dt);
    // ...and THE POLE's own two (see the `POLE_*` block): the strike's lockout, the launch's own
    // speed window, and THE CARRY — which is not a state and therefore has to be ticked here, above
    // the state switch, so the haul out of the deck and the one step onto the staff's base run under
    // every state the body happens to be in (a take made at a walk is a take made while walking).
    this.poleAtkCd = Math.max(0, this.poleAtkCd - dt);
    this.poleLaunchT = Math.max(0, this.poleLaunchT - dt);
    this.updatePoleCarry(dt);
    // ...and THE THROWN STAFF, ticked here for the other half of the same reason: the prop is a
    // WORLD OBJECT from the frame it leaves the hand, so its flight has to run to its own conclusion
    // (a body, the deck, or `POLE_THROW_RANGE`) whatever the BODY is doing — the throw's own state
    // ends after `POLE_THROW_T` (1.20 s) while a staff hurled off a roof is still falling, and a
    // flight that stopped with the state would leave the wood hanging in the air, or worse, leave
    // `poleHeld` set on a staff that is nowhere near his hands (see the `!this.poleFly` guards on
    // every read of "in his hands").
    this.updatePoleFlight(dt);
    this.scissorCd = Math.max(0, this.scissorCd - dt);
    this.capoCd = Math.max(0, this.capoCd - dt);
    // The guard's window is written by `updateScissor` for as long as the phase lasts; anything
    // else (a cancel, a death, the move ending) has to be able to close it, so it is also ticked
    // here — the two can never disagree, because the phase writes it back every frame it is live.
    if (this.state !== "scissor") this.blockT = 0;
    this.airComboT = Math.max(0, this.airComboT - dt);
    // ...and the combo's own IDLE clock (see `P.AIR_IDLE`). The window is opened by the launch or by
    // a dive and rewound by every LANDED air strike; if it goes `P.AIR_IDLE` without one, the whole
    // window shuts HERE, wherever `CAPO_AIR_T` had got to. It has to be this way round rather than a
    // shorter `CAPO_AIR_T`, because the ceiling is what lets a well-fed string run: the idle clock is
    // the miss, and the ceiling is the cap on how long a good one can last.
    if (this.airComboT > 0) {
      this.airComboIdle -= dt;
      if (this.airComboIdle <= 0) {
        this.airComboT = 0;
        this.airComboIdle = 0;
      }
    } else {
      this.airComboIdle = 0;
    }
    // The airborne finisher's window (see `COMBAT_AIR_FINISH`): it is a window on the AIR, so
    // touching down closes it — a foot back on the deck is the chain's own grace's business from
    // there, and the finisher on the deck is the one-two.
    this.airFinisherT = grounded ? 0 : Math.max(0, this.airFinisherT - dt);
    // ...and the DOWN SLAM's own THUD, spent here rather than at the contact or in the attack's own
    // update. A whiffed slam (see `attackContact`) is ARMED there with one, and it goes off the
    // first frame the feet are on the deck after it — the ground slam's own impact event, at
    // `DSLAM_THUD`, so the world cracks and the camera rocks under a stomp that found nobody. It is
    // spent HERE because the slam's clock and the slam's LANDING are two different events: a slam
    // thrown from high enough runs its 0.30 s out while still in the air, so the state has already
    // handed back to "air" by the time the feet arrive and the attack's own update never runs
    // again. A slam that never reaches the pavement simply drops it; an ordinary landing has its
    // own thud.
    if (this.dslamWhiff && this.attackDone && grounded) {
      this.dslamWhiff = false;
      this.lastSlam = { x: this.pos.x, y: this.pos.y - P.HY, z: this.pos.z, power: P.DSLAM_THUD };
      this.events.push("slamimpact");
      this.squash = Math.max(this.squash, 0.34);
      if (this.sfx) this.sfx.slamImpact(P.DSLAM_THUD);
    }
    if (this.dslamWhiff) {
      this.dslamWhiffT = Math.max(0, this.dslamWhiffT - dt);
      if (this.dslamWhiffT <= 0) this.dslamWhiff = false;
    }
    this.airCd = Math.max(0, this.airCd - dt);
    this.overT = Math.max(0, this.overT - dt);
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    this.hurtT += dt;
    if (this.hp < P.HP_MAX && this.hurtT >= P.HP_REGEN_DELAY) {
      this.hp = Math.min(P.HP_MAX, this.hp + P.HP_REGEN * dt);
    }
    // The macaco's window and the pose weight (see `startMacaco`): the window is opened by a
    // slide's take and closed here. The move's own clock lives in `updateMacaco`.
    this.slideHitT = Math.max(0, this.slideHitT - dt);
    if (this.slideHitT <= 0) this.slideHitTarget = null;
    if (this.state !== "attack") this.comboGrace = Math.max(0, this.comboGrace - dt);
    if (this.comboGrace <= 0 && this.state !== "attack") this.combo = 0;
    this.launchCd = Math.max(0, this.launchCd - dt);
    if (this.kickT > 0) this.kickT = Math.max(0, this.kickT - dt);
    if (this.flipT > 0) this.flipT = Math.max(0, this.flipT - dt);
    // ...and the VAULT's own front revolution rides the same clock (session 185): it is set at the
    // double jump's press (`poleVault`), it is read by the rig (`solveRigAngles`), and it must go on
    // running after the move has handed the body over — the staff snaps on the strike, the state ends
    // on its own clock, and the body is left spinning through the air. Ticking it here rather than in
    // `updatePoleVault` is what lets the flip outlive the shape it belongs to.
    if (this.poleFlipT > 0) this.poleFlipT = Math.max(0, this.poleFlipT - dt);
    this.coyote = grounded ? P.COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (inp.jumpPressed) this.jumpBuffer = P.JUMP_BUFFER;
    // `climbHold` is gone (session 137): the climb no longer has to be told apart from the jump,
    // because the climb is not on a key any more — pushing INTO a face takes it (see the attach
    // block). SPACE is purely the jump again, and `inp.climbHeld` survives only as the phone's
    // CLIMB pad and an extra way to take a face you are already touching.
    //
    // ...AND THE HOLD HAS TO BE A FRESH ONE (session 148). The user: *"make the wall climb only be
    // done if press space once then hold space again"*. Session 137 went the other way — walking
    // into a face took it with nothing pressed — and session 141 put it back on a held key, which
    // left one hole: a SPACE that was pressed ON THE DECK (a jump, or just a run with the key down)
    // is still down when the wall arrives, and the body takes the face off a hold it never made
    // for it. So the climb's own hold is stamped with WHERE IT BEGAN: `climbHoldAir` goes true only
    // for a press made while already airborne, and the grip reads it (see `canGrab`). The sequence
    // the user asked for is then exactly the one that works — jump off the deck (that press began
    // on the ground, so it cannot climb), then press-and-hold again in the air, and the face is
    // taken. Falling without jumping still climbs on the first press, which is the same thing with
    // the tap supplied by the fall.
    if ((inp.jumpPressed || inp.climbPressed) && !grounded) this.climbHoldAir = true;
    if (!inp.climbHeld) this.climbHoldAir = false;
    this.dashBuffer = Math.max(0, this.dashBuffer - dt);
    if (inp.dashPressed) this.dashBuffer = P.QDASH_BUFFER;
    this.diveBuffer = Math.max(0, this.diveBuffer - dt);
    if (inp.divePressed) this.diveBuffer = P.ACTION_BUFFER;
    this.slamBuffer = Math.max(0, this.slamBuffer - dt);
    if (inp.slamPressed) this.slamBuffer = P.ACTION_BUFFER;
    // The kick's own press buffer (see the wall kick block): airborne presses only, and it is
    // dropped the moment the feet are back on something, so a click made mid-air cannot turn
    // into a kick off the next wall you happen to jump past.
    this.kickBuffer = Math.max(0, this.kickBuffer - dt);
  },

  // THE VAULT'S REVOLUTION, AS AN ANGLE (session 185). One reading of `poleFlipT`, shared by the two
  // things that need it and must never be allowed to disagree: the RIG, which turns the whole body by
  // it (see `solveRigAngles`), and the STAFF, which COUNTER-ROTATES by it so the wood holds its own
  // aim in the world while the body goes over the top of it (see `poleHoldVault` in streetwear.js,
  // and `o.flip` in player/pole.js's `_poleHold`). A rig turn and a stick that has to cancel it out
  // are one number, so there is one place that reads it.
  //
  // It is a SMOOTHSTEP of the clock rather than a ramp. A somersault is slowest at its two ends and
  // fastest through the middle — the frames the eye can actually read are the square one it starts on
  // and the inverted one at the bottom — and it is what puts the strike (`POLE_VAULT_HIT` 0.50) on
  // the exact bottom of the revolution, which is the frame the shape is authored around.
  poleFlipAngle() {
    if (this.poleFlipT <= 0) return 0;
    const f = 1 - this.poleFlipT / P.POLE_VAULT_FLIP_TIME;
    return Math.PI * 2 * (f * f * (3 - 2 * f));
  },
  // THE ACTION BUFFERS (lifted from `update`, where they sat just under `tickClocks`): the kick's
  // own press buffer — REFUSED outright on a climb face, where M1 is the pull — and SHIFT's, which
  // is a slide on the deck and a slam in the air. They are read by the state entries later in the
  // frame, so they are written here, before the wish is even read.
  tickBuffers(dt, inp, grounded) {
    // ...AND M1 ON A CLIMB FACE IS THE PULL, NOT A KICK (session 164 — see the `CLIMB_LOAD_` block in
    // `P`, and `tryWallKick`). The press is REFUSED outright there rather than buffered and dropped:
    // the buffer outlives the press by `KICK_BUFFER`, so a pull that is still loading would otherwise
    // throw a boot into the stone the moment it let go. `onClimb` is last frame's attachment, which is
    // the same reading every other gate in this frame takes (the attach block runs later).
    const onClimb = this.attached && this.attachMode === "climb";
    if (inp.kickPressed && !grounded && !onClimb) this.kickBuffer = P.KICK_BUFFER;
    if (grounded) this.kickBuffer = 0;
    // SHIFT is one intent — get low and get down there — so on the ground it slides and in the
    // air it slams. The `!grounded` guard is what keeps that safe: Shift is *held* for whole
    // slides, and a buffered slam would otherwise fire the instant that slide ended in a jump.
    // (It is an edge, so holding Shift off a ledge — the "land into a slide" move — is
    // untouched: that path wants `slideHeld` on impact, not a press.)
    if (inp.slidePressed && !grounded) this.slamBuffer = P.ACTION_BUFFER;
    this.slideBuffer = Math.max(0, this.slideBuffer - dt);
    if (inp.slidePressed) this.slideBuffer = P.ACTION_BUFFER;
  },

  // STAMINA REFILL (see the `GRIP_*` block). It stands DOWN while the body is on a face — `attached`
  // and `attachMode` are last frame's here, which is exactly the reading the refill wants — and off
  // the deck it comes back at a third of the rate.
  tickStamina(dt, grounded) {
    // STAMINA REFILL (see the `GRIP_*` block). It stands DOWN while the body is on a face: the two
    // are one number being pushed both ways at once, and the old air regen (a quarter of the
    // deck's) fighting the drain was most of why the bar looked like it never moved. `this.climbing`
    // is last frame's value here (the attach block writes it later in the frame), which is exactly
    // the reading the refill wants: it is the body's state on the frame it is being asked about.
    const onFace = this.attached && this.attachMode === "climb";
    if (this.grip < P.GRIP_MAX && !onFace) {
      const regen = grounded ? P.GRIP_REGEN : P.GRIP_REGEN * 0.3;
      this.grip = Math.min(P.GRIP_MAX, this.grip + regen * dt);
    }
  },
};

export function installClocks(Player) {
  Object.assign(Player.prototype, clocksMethods);
}
