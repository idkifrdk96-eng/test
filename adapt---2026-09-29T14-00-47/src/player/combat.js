// ---------------------------------------------------------------------------
// COMBAT (part 4 of the player.js split).
//
// The M1 chain and the clash: which descriptor governs a move right now, the chain
// index, the attack's start/tick/hit, the clash's weapon solve and its win/lose.
// Eleven methods, verbatim, in a table `installCombat` copies onto `Player.prototype`.
//
// A LEAF with respect to player.js: it imports three.js (the clash scratch), `P`
// (player/config.js) and `wrapPi` (player/math.js). The clash's scratch pair moved
// with it and nothing outside reads them, so there is no export back.
// ---------------------------------------------------------------------------
// -------------------------------------------------------------------------
// THE MELEE CHAIN — the four M1s.
//
// One button, one chain: below `COMBAT_SPEED` on the ground, M1 throws move `combo`. The move
// plays ALL THE WAY OUT — a press during it does not cut it short, it QUEUES the next one, and
// the queue is spent the instant the move's own clock expires. That is the user's "making it
// wait till i finish the m1": mashing can no longer behead the animation, so four presses read
// as four moves. The moves themselves were shortened at the same time (`COMBAT_MOVES`), because
// a chain that cannot be cancelled only feels fast if each beat is short.
//
// M1 is NOT holdable (the user's "make the m1s not holdable"): only a fresh press queues the
// next move, so a held button throws exactly one, and the chain is four clicks rather than one
// held-down hand.
//
// Let the chain lapse and it resets to the knee, and `COMBAT_GRACE` is the window in which a
// late press still counts. And leaving the ground only ends the chain after `COMBAT_AIR_GRACE`
// — a shove's little hop must not reset it.
//
// The timings are NOT here: they are streetwear.js's `COMBAT_MOVES`, read back off the rig, so
// the pose the body is wearing and the frame the contact lands on cannot drift apart. This file
// owns everything else — which body is in front, whether it is in reach, how hard it is shoved,
// and how long the chain stays open.
// -------------------------------------------------------------------------

import * as THREE from "../three.js";
import { P } from "./config.js";
import { wrapPi, approach } from "./math.js";
import { _clinchV } from "./pose.js";
import { accelerate } from "./physics.js";

// The clash's own scratch pair (see `clashWeapon`): the player's weapon in world space, and the
// second hand of the clinch while the two are being averaged.
const _clashV = new THREE.Vector3();
const _clashW = new THREE.Vector3();

const combatMethods = {

  // Which descriptor governs the move at `i` RIGHT NOW. The four chain moves are one table, but the
  // FINISHER is two moves behind one button: on the deck it is the one-two, and off the deck it is
  // the DOWN SLAM (`P.DSLAM_*`, streetwear.js's `DOWNSLAM_MOVE`). `attackSlam` is settled at the
  // top of `startAttack`, so every reader of the live move's own clock — the contact frame, the
  // pose fraction, the chain's handover — reads whichever of the two is actually playing.
  attackMoveSpec(i) {
    const moves = this.combatMoves();
    const ud = this.charMesh && this.charMesh.userData;
    // The UPPERCUT (SPACE + M1 — see `startUppercut`) is the OTHER move that rides the finisher's
    // slot, and it is asked FIRST for the same reason the slam is asked here at all: the
    // descriptor is what every number the move runs on comes from, and only one of the three can
    // be playing.
    if (this.attackUpper && i === 3 && ud && ud.uppercutMove) return ud.uppercutMove;
    if (this.attackSlam && i === 3 && ud && ud.downSlamMove) return ud.downSlamMove;
    return (moves && moves[i]) || null;
  },

  // Which move the next press throws: the chain's own counter while the window is open, else the
  // first move of a fresh chain.
  nextMoveIndex() {
    return this.comboGrace > 0 ? Math.min(this.combo, 3) : 0;
  },

  startAttack(index, opts) {
    const moves = this.combatMoves();
    if (!moves) return false;
    const i = Math.max(0, Math.min(moves.length - 1, index | 0));
    // THE FINISHER'S SECOND DOOR (see `P.DSLAM_*`): the 4th M1 thrown with the feet off the deck
    // is the DOWN SLAM rather than the one-two. Read here, before anything else, because the
    // descriptor below is picked off it and every number the move runs on comes from that.
    this.attackSlam = i === 3 && !this.grounded;
    // ...and the THIRD DOOR is the UPPERCUT (see `P.UPPER_*` / `startUppercut`): the same slot, on
    // the deck, asked for by a flag rather than settled off the body's own altitude — because unlike
    // the slam there is nothing about the moment that says "uppercut"; it is a modifier the player
    // holds (`opts.upper`, set by `startUppercut` alone). Both are derived here, before the
    // descriptor is read, so no reader of the live move can ever see two of them at once.
    this.attackUpper = i === 3 && this.grounded && !!(opts && opts.upper);
    const m = this.attackMoveSpec(i) || moves[i];
    this.airFinisherT = 0;   // the move it was opened for has been thrown
    this.dslamWhiff = false; // the thud is only armed by this move's own contact pass
    this.dslamWhiffT = 0;
    // A move thrown while the chain's own layer is still ON THE BODY is a handover, and the rig has
    // to be given a few frames to swap one pose for the next — see `attackLink` in `updateVisual`.
    // That is a QUEUED move (the common case: a mash always queues) and equally a move thrown in
    // the GRACE WINDOW just after the one before it ended, which is the handover the old
    // `state === "attack"` test missed: there the state has already gone back to `ground`, but
    // `attackPose` is still pinned near 1 because its own fade has barely started — so the new
    // move's opening pose arrived in a single frame exactly as it does mid-chain. A move thrown
    // out of a genuinely neutral body (a fresh chain out of the run or the air) is still NOT a
    // handover: there is no pose on the body to hand over FROM, and its entry is the state fade's
    // business (`P.COMBAT_POSE_FADE`).
    const chained = this.state === "attack" || this.attackPose > 0.05;
    this.attackLink = chained ? 0 : 1;
    this.setState("attack");
    this.attackMove = i;
    this.attackT = 0;
    this.attackTotal = m.total;
    this.attackDone = false;
    this.attackNext = false;
    this.attackIgnore = true;   // the press that started this move is not also a chain press
    this.attackCd = 0;
    this.attackAirT = 0;
    this.attackSpin = 0;
    this.attackFlip = 0;
    this.attackSpinning = (m.spin || 0) !== 0;
    // The chain is a cycle, not a one-way street: the finisher hands the chain back to the knee,
    // so mashing M1 throws knee-clinch-sweep-punch-knee-... instead of hammering the finisher.
    // The DOWN SLAM is a variant of the PUNCH, not a fifth move, so it wraps the same way.
    this.combo = i + 1 < moves.length ? i + 1 : 0;
    // The move is thrown ON THE MOVE (the user's "make them dont kill momentum"): the horizontal
    // the feet ran in with is CARRIED, not dropped (`COMBAT_CARRY`), and the attack state bleeds
    // it off at `COMBAT_DRIFT` — so a chain thrown out of a run glides through its own animation
    // and settles, instead of planting the feet on the frame the knee goes out. `COMBAT_CARRY` 0
    // is the old dead plant. An AIR COMBO move keeps the older, smaller fraction: it is thrown at
    // the end of a jump, and a chain that stopped dead in the air would drop the player out of
    // the air the moment the first knee went out. The DOWN SLAM keeps less than either: it is a
    // move that goes DOWN, and most of its line is spent by the drive onto the body below it (see
    // `DSLAM_DRIVE`).
    const keep = this.attackSlam ? 0.40 : this.airComboT > 0 && !this.grounded ? 0.62 : P.COMBAT_CARRY;
    this.vel.x *= keep;
    this.vel.z *= keep;
    // ...and it OPENS WITH THE DROP: the slam is driven down off the same frame it is thrown, so
    // the flip has air to happen in and the leg meets the body rather than hanging over it. A
    // whiff simply lands the move early (the state hands the body back to whatever owns it).
    if (this.attackSlam) this.vel.y = Math.min(this.vel.y, -P.DSLAM_V);
    this.throttle = 0;
    // ...and it is aimed with the eyes. The nearest body inside `COMBAT_LOCK` is the target (ties
    // go to whatever is closest to straight ahead, see `Enemies.nearest`), and the body comes
    // round onto it over the move's start-up rather than snapping — a 180-degree pick-up should
    // read as a turn, not as a turntable.
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    let target = null;
    if (this.enemies) target = this.enemies.nearest(this.pos.x, this.pos.z, fx, fz, P.COMBAT_LOCK,
      { ragdolls: this.airComboOpen });
    this.attackTarget = target;
    if (target) {
      const dx = target.pos.x - this.pos.x;
      const dz = target.pos.z - this.pos.z;
      this.attackFaceTo = Math.hypot(dx, dz) > 0.08 ? Math.atan2(dx, dz) : this.facing;
    } else {
      this.attackFaceTo = this.facing;
    }
    if (this.sfx && this.sfx.swing) this.sfx.swing(i);
    this.events.push("attack");
    return true;
  },

  // THE UPPERCUT — M1 with the JUMP key held ON THE 4th SLOT OF THE CHAIN (see `P.UPPER_*`,
  // `startAttack` and `poseUppercut` in streetwear.js). The user's own brief: *"if space is held
  // while player is on the ground and m1ing then make the player do an uppercut that throws the
  // enemy in the air"*, narrowed by their second pass to *"fix the uppercut make it only be done in
  // the m4 like if i hold space while doing the 4th m1 i do the uppercut"* — the gate for which is
  // the CALLER's (`nextMoveIndex() === 3`; see the press site in `update`), because only the press
  // knows what the chain is holding.
  //
  // It is thrown through `startAttack(3, { upper: true })` rather than as a fifth move, exactly the
  // way the DOWN SLAM is: the finisher's slot with its own descriptor, so the chain's cycle, the
  // clash table and the enemy's own punch all still count four moves, and everything that reads a
  // move's own clock — the contact frame, the pose fraction, the chain's handover — reads whichever
  // of the three is actually playing (see `attackMoveSpec`).
  //
  // This only answers "can the move be thrown at all": the body has to be wearing a rig that
  // exports the descriptor. It reports back whether the move actually came out, so the caller can
  // leave the chain where it is when it did not.
  startUppercut() {
    const ud = this.charMesh && this.charMesh.userData;
    if (!ud || !ud.uppercutMove) return false;
    this.startAttack(3, { upper: true });
    return this.attackUpper === true;
  },

  // The move's own clock, its contact, and the chain.
  updateAttack(dt, inp) {
    const moves = this.combatMoves();
    if (!moves) {
      this.setState("ground");
      return;
    }
    const m = this.attackMoveSpec(this.attackMove) || moves[0];
    this.attackT += dt;
    if (this.attackFaceTo !== null) {
      this.facing += wrapPi(this.attackFaceTo - this.facing) * Math.min(1, P.COMBAT_TURN * dt);
    }
    // A move is queued by a PRESS and only by a press (the user's "make the m1s not holdable"):
    // keeping the button down does nothing, so a chain is four deliberate clicks rather than one
    // held-down hand. The press that STARTED the move is ignored for its first frame
    // (`attackIgnore`), so it cannot also count as a queue — which leaves the one-frame window
    // between the press and the next frame as the only thing a click inside a single frame loses.
    if (this.attackIgnore) this.attackIgnore = false;
    else if (inp.kickPressed) this.attackNext = true;
    if (!this.attackDone && this.attackT >= m.start) {
      this.attackDone = true;
      this.attackContact(m);
    }
    // The spin (the sweep's, and now the uppercut's): the rig turns on the move's own clock, not on
    // `facing` (see `updateVisual`), so the aim and the hit wedge below are untouched by it. The
    // two variant moves ride the finisher's slot and neither of them is a row in `COMBAT_MOVES`, so
    // the flags go with the ask — `poseSpin` reads the descriptor the move is actually playing.
    if (this.attackSpinning && this.charMesh && this.charMesh.userData.poseSpin) {
      this.attackSpin = this.charMesh.userData.poseSpin(this.attackMove,
        this.attackT / Math.max(1e-3, m.total), this.attackUpper, this.attackSlam);
    }
    // ...and THE DOWN SLAM's own FLIP (see `P.DSLAM_*` / streetwear.js's `downSlamTurn`): one whole
    // FORWARD revolution through the tuck, on the move's own clock — read rather than integrated,
    // so a dropped frame cannot leave the turn behind the shape, and finished on exactly 2π (a
    // whole turn is visually zero) so the handover at either end of it is a no-op. It is written to
    // the rig's pitch in `updateVisual`, where the double jump's revolution already lives.
    if (this.attackSlam && this.charMesh && this.charMesh.userData.downSlamTurn) {
      const twoPi = Math.PI * 2;
      if (this.grounded && this.attackFlip < twoPi * 0.995) {
        // ...and the DROP BEAT THE REVOLUTION to the deck. A slam thrown at the top of a jump has
        // about a third of a second of fall left and the turn takes 0.18 s of it, so a press made
        // low — a slam thrown on the way down — can reach the pavement with the body still part-way
        // through its flip. Reading the clock straight through there stands the body on the deck
        // mid-revolution with its head under the pavement, which is the one thing a flip must never
        // do. What happens instead depends on HOW FAR through it is:
        //   - past HALF a turn the body is upside down, and the only way out is FORWARD: the
        //     revolution is finished — wound on to the whole turn (never unwound, because finishing
        //     it is exactly what the move is) — which closes in about a tenth of a second;
        //   - under half a turn it has barely left the ground, so the turn is simply DROPPED, and
        //     the few degrees it had are spent by the pose's own fade like any other handover.
        // Either way the far end of it is a WHOLE turn — visually nothing — so the frame the move
        // hands over on is square.
        if (this.attackFlip >= Math.PI) {
          this.attackFlip += (twoPi - this.attackFlip) * Math.min(1, dt * 26);
          if (twoPi - this.attackFlip < 0.02) this.attackFlip = twoPi;
        } else {
          this.attackFlip += (0 - this.attackFlip) * Math.min(1, dt * 26);
          if (this.attackFlip < 0.02) this.attackFlip = 0;
        }
      } else {
        this.attackFlip = this.charMesh.userData.downSlamTurn(this.attackT / Math.max(1e-3, m.total));
      }
    }
    if (this.attackT >= m.total) {
      // The move has played out in full. A queued press spends itself here and nowhere earlier,
      // which is the whole point: the animation is never cut off. Past the finisher the queue
      // wraps round to the knee, so HOLDING the button keeps the chain going instead of stopping
      // at the end of the string.
      if (this.attackNext) {
        const next = this.attackMove + 1 < moves.length ? this.attackMove + 1 : 0;
        // THE UPPERCUT's SECOND DOOR, and the one a mash actually comes through (see the press
        // site in `update` for the first): a QUEUED press whose move would have been the 4th M1,
        // with the JUMP key held. Nothing else about the chain changes — the queue still spends
        // here and the animation is still never cut off — and without it the gate the user asked
        // for ("only be done in the m4") would make the launcher nearly unreachable: pressing M1
        // at a human rate lands inside the 0.44 s sweep, so the fourth press arrives as a QUEUE
        // rather than as a fresh press in the grace window, and every one of those would have been
        // the one-two. `inp` is this frame's, which is the fair reading of "hold space while doing
        // the 4th m1": the key is held when the move is thrown.
        if (next === 3 && this.grounded && (inp.jumpHeld || inp.climbHeld) && this.startUppercut()) return;
        this.startAttack(next);
        return;
      }
      this.setState(this.grounded ? "ground" : "air");
      this.comboGrace = P.COMBAT_GRACE;
      this.attackCd = P.COMBAT_CD;
    }
  },

  // The frame a move lands on: everything inside the wedge in front, shoved along the facing.
  attackContact() {
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const i = this.attackMove;
    const slam = this.attackSlam;
    // ...and the UPPERCUT is the third shape this one frame can put on the world (see `P.UPPER_*`
    // and `startUppercut`): it gets its own wedge, its own reaction and its own height, for the
    // same reason the slam does — its contact is nothing like the fist it shares a slot with.
    const upper = this.attackUpper;
    let any = false;
    if (this.enemies && this.enemies.spawned) {
      // The wedge. The DOWN SLAM gets its own numbers: it is thrown from ABOVE, so its band reaches
      // four units BELOW the feet — the body is down there, not out at arm's length — and it covers
      // a wider angle at a longer reach for the same reason.
      // ...and the UPPERCUT's are its own for the mirror-image reason: it is thrown from BELOW, at a
      // chin, so its band reaches nearly two units ABOVE the head and only half a unit below the
      // knees (see `P.UPPER_UP` / `P.UPPER_DOWN`), at a shorter reach than any fist.
      const reach = slam ? P.DSLAM_REACH : upper ? P.UPPER_REACH : P.COMBAT_REACH;
      const arc = slam ? P.DSLAM_ARC : upper ? P.UPPER_ARC : P.COMBAT_ARC;
      const down = slam ? P.DSLAM_DOWN : upper ? P.UPPER_DOWN : (P.COMBAT_DOWN[i] || 0.7);
      const up = slam ? P.DSLAM_UP : upper ? P.UPPER_UP : (P.COMBAT_UP[i] || 0.7);
      // THE AIR COMBO TAKES THE BODY IT LAUNCHED. The LAUNCH's kick RAGDOLLS whatever it catches
      // (the user's *"make the 3rd skill hit ragdoll no matter how many times"*), and a ragdoll was
      // the one thing neither the wedge nor `hit` would touch — so the second press opened a window
      // onto a body nothing in the game could reach, and the air combo could never actually be
      // thrown. While the window is open the wedge takes limp bodies too, and the hits on one take
      // the FLIGHT's own juggle path with the ragdoll KEPT, so the string rides a loose body up
      // instead of being aimed at an untouchable one.
      const combo = this.airComboOpen;
      const hits = this.enemies.inFront(this.pos.x, this.pos.z, fx, fz, reach, arc,
        [this.pos.y - P.HY - down, this.pos.y + P.HY + up], { ragdolls: combo });
      // A fist arriving at the same moment as this move does not get hit at all: the two strikes
      // LOCK (see `startClash`). Tested before anything lands, because a clash is the one outcome
      // in which neither move connects — the player's knee does not fold the body it met, and the
      // body's fist does not shove the player. The DOWN SLAM can never be one of them (`startClash`
      // wants BOTH bodies on the deck, and the slam is thrown off it), so the test is skipped.
      if (!slam) for (const e of hits) if (this.startClash(e, i)) return;
      for (const e of hits) {
        // The DOWN SLAM's reaction is the slam's own (see `enemies.js`): DRIVEN INTO THE DECK. It
        // is the one reaction that means "put it on the mat" rather than "shove it along the floor"
        // — which is exactly what a foot coming down out of the sky onto a body is. A body that was
        // still in the air (the sweep's flip, most of the time) is left to fall the rest of the way
        // and lies there.
        // ...and a LIMP body the air combo is juggling takes the flight's own juggle path with the
        // ragdoll KEPT — the knee or the fist meeting a tumbling body re-launches it rather than
        // swapping its reaction out from under the tumble (which would snap the body's roll to a
        // whole turn on the frame the pose changed).
        const juggle = combo && e.ragdoll && !e.grounded;
        if (e.ragdoll && !juggle) continue;
        // The UPPERCUT's reaction is the LAUNCH (see `enemies.js` and `poseHurtUpper`), which is what
        // `P.COMBAT_KIND[3]` already says — so the kind only has to be spelled out for the two
        // variants that are not the one-two, and the uppercut's own weight rides in the options.
        const kind = slam ? "slam" : (juggle ? "flight" : (P.COMBAT_KIND[i] || "fold"));
        const catching = !slam && !upper && i === 3 && (e.state === "trip" || e.state === "flight" || !e.grounded);
        const landed = e.hit(kind, fx, fz, upper ? P.UPPER_KNOCK : slam ? P.DSLAM_KNOCK : P.COMBAT_KNOCK[i],
          upper ? P.UPPER_STUN : slam ? P.DSLAM_STUN : P.COMBAT_STUN[i], {
          // Overdrive is the only thing that moves the damage (and it moves it on BOTH sides of a
          // lock, so a clash won during it hits as hard as the move that won it).
          dmg: (upper ? P.UPPER_DMG : slam ? P.DSLAM_DMG : P.COMBAT_DMG[i]) * this.dmgMul(),
          catch: catching,
          // `force` is what gets a juggled ragdoll past `hit`'s own guard (see `Enemy.hit`).
          force: juggle,
          // Only the finisher ragdolls: the flag rides the hit so `enemies.js` does not have to
          // guess which move produced a `flight` (the slide's hit and the drop blast reach the
          // same reaction, but they are shoves, not a launch — the user's "make the 4th m1 just
          // ragdolls"). The DOWN SLAM does not ragdoll either — it DOWNS, which is a state of its
          // own and a different read (the body lies there rather than tumbling away).
          // ...and neither does the UPPERCUT, for the opposite reason to the punch: it is a
          // LAUNCHER, and a limp body cannot be hit — so ragdolling what it catches would lock the
          // player out of the very body he has just put in the air (the same trap the air combo
          // found, see `Enemies.inFront`'s `ragdolls` option).
          ragdoll: !slam && !upper && i === 3,
          // ...and only the SWEEP flips it (M1 #3): the same `flight` reaction, thrown up on a
          // solved 0.5 s of hang with a whole turn of spin on it, and left HITTABLE — that is the
          // window the finisher is supposed to catch it in (see `E.FLIP_*`).
          flip: !slam && i === 2,
          // THE UPPERCUT's own height and tumble (see `E.UPPER_*`): solved off `P.GRAVITY` for a
          // second of hang rather than picked against the shove, which is what makes the body go
          // four and a half units up instead of the one the sweep's flip is worth.
          upper,
          lift: upper ? P.UPPER_LIFT : undefined,
        });
        if (!landed) continue;
        any = true;
        // ---- THE WALL CLINCH's THIRD DOOR (see `feedWallChain` / `tryWallBeat`, and "THE WALL
        // CLINCH" in src/README.md): a landed M1 that drives a body into a face counts toward the
        // move exactly the way a boot off the face does — the user's *"if i keep m1ing the enemy to
        // a wall i start a wall combo"*. The tally is fed by the HIT rather than by the press
        // (which is fed at the press site, and only while the body is working a face) because the
        // two doors are not the same act: the first is a man punching a wall, and this one is a man
        // punching a MAN, and only a landed hit has a man in it.
        //
        // Fed on EVERY landed hit rather than only on the ones that land at a face, and the reason
        // is measured rather than assumed: the chain's own finisher throws the body clear of the
        // attacker (`COMBAT_KNOCK[3]` 16, ragdolled), so a string that has to land all five of its
        // taps ON the stone is a string whose fourth tap has already thrown the body out of reach —
        // the count can never get past three that way. What makes the move a WALL move is the other
        // half of the gate, which stays absolute: the body has to be pressed on a face
        // (`wallBeatVictimWall`) before any of this fires. So the tally is "how deep into the
        // beating he is" and the face is the move's own condition — mash a body into a wall and the
        // fifth landed hit is the one that takes him into the stone.
        this.feedWallChain();
        const ko = e.hp <= 0;
        this.lastHit = {
          kind,
          move: i,
          slam,
          x: e.pos.x,
          y: e.pos.y + P.HY * (kind === "fold" ? 0.95 : 0.7),
          z: e.pos.z,
          power: slam ? 1 : (i === 3 ? 1 : 0.5),
          ko,
          catch: catching,
        };
        this.chain = 0;
        this.events.push("hit");
        if (ko) this.events.push("ko");
      }
    }
    if (!any && this.sfx && this.sfx.whiff) this.sfx.whiff();
    // ...and a DOWN SLAM that finds nothing is still a stomp: the thud is ARMED here and spent in
    // the body's own per-frame tick on the first frame the feet are actually on the deck. It waits
    // for the foot rather than for the clock because the contact key can fall a frame or two before
    // the drop touches down — a slam thrown from just off the ground reaches its contact with the
    // pavement still an inch away — and a stomp that thudded in mid-air would read as a sound effect
    // rather than as a landing.
    if (slam) { this.dslamWhiff = !any; this.dslamWhiffT = this.dslamWhiff ? P.DSLAM_THUD_T : 0; }
    // Hitstop: a clean hit holds the whole world still for a beat. It is the cheapest impact
    // there is — the frame you just landed simply lasts longer — and it is what makes the punch
    // read as heavier than the knee.
    this.hitstop = any
      ? (slam ? P.DSLAM_STOP : i === 3 ? P.COMBAT_STOP_HEAVY : P.COMBAT_STOP)
      : 0;
    // A hit inside the AIR COMBO's window (see `P.CAPO_AIR_T`) FEEDS it: every strike that lands
    // off the deck buys the window back, so the string is held up by the string — a chain kept
    // going by nothing but the clock would run out mid-combo and drop the player out of the air
    // with the last move still playing.
    if (any && this.airComboT > 0) {
      this.airComboT = Math.max(this.airComboT, P.CAPO_AIR_HOLD);
      this.airComboIdle = P.AIR_IDLE;
    }
  },

  // -------------------------------------------------------------------------
  // THE M1 CLASH — two strikes that arrive on the same beat.
  //
  // "If I M1 and the enemy M1 at the same time we clash, and it does a special animation for every
  // variant ... and the way to win is by who spams faster" — the user's own words, and the whole
  // spec. So this is not a parry and not a trade: both moves are CANCELLED, the two bodies lock
  // weapon-to-weapon at `CLASH_DIST`, and the fight becomes a shoving match decided by which side
  // fills its meter first. The player fills his with presses of M1; the body it is locked with
  // mashes at its own rate (`CLASH_RATE_*`), so the loser is the one who spams slower.
  //
  // What makes it a clash rather than a lucky frame is `CLASH_WINDOW`: the two contacts have to
  // fall within a tenth of a second of each other, whichever side gets there first. Both paths in
  // — the player's own contact (`attackContact`, above) and the enemy's (`Enemy.update`, in
  // enemies.js) — call `startClash`, and `startClash` is the whole test, so there is exactly one
  // definition of "at the same time" in the game.
  //
  // The lock itself lives in `updateClash` (driven from the state machine in `update`) and the two
  // SHAPES live in streetwear.js (`poseClash`): the player holds the move he brought on its own
  // contact frame and the enemy solves its fist onto whatever that move's weapon is, live off the
  // player's rig. That is what makes the pairing per-variant — the fist and the knee, the fist and
  // the fist, the fist and the spread hands — without a single authored combination.
  // -------------------------------------------------------------------------

  // How long until the body's punch lands: positive = still winding up, negative = it has already
  // gone off, Infinity = it is not punching at all. Read off the enemy's own clock against the
  // shared move table, so "at the same time" is measured in the units both moves are authored in.
  strikeTimeToContact(e) {
    const ud = e && e.charMesh && e.charMesh.userData;
    const moves = ud && ud.combatMoves;
    if (!moves || !e.atkT || e.atkT <= 0) return Infinity;
    const m = moves[e.atkMove] || moves[3];
    return e.atkT - (m.total - m.start);
  },

  // The point of the player's own rig a clash is fought OVER: the weapon the live move brought.
  // The enemy's fist is solved onto this (see `poseClash` in streetwear.js), which is what turns
  // two animations that happen to be near each other into a contact — and it is read off the
  // BONES, so the fold of the trunk, the drive of the shove and the creep of the shoving match are
  // all already in the answer.
  clashWeapon(out) {
    const ud = this.charMesh && this.charMesh.userData;
    const b = ud && ud.bones;
    if (!b) return out.set(this.pos.x, this.pos.y, this.pos.z);
    // The bones are asked where they ENDED UP, so their world matrices have to be current — the
    // same measure-then-pin bargain the clinch's hands make (and the same one call).
    this.charMesh.updateWorldMatrix(true, true);
    switch (this.attackMove) {
      case 0:
        // THE KNEE: the joint the folded leg swings on, which is the L bone's own origin.
        if (b.legLowerL) return b.legLowerL.getWorldPosition(out);
        break;
      case 2:
        // THE SWEEP: up the leg from the foot, because the sweeping leg is thrown out WIDE and the
        // foot ends up half a body off the midline — measured, the enemy's whole arm reaches 1.17
        // short of it from a standing brace and 0.57 short even from the crouched one this pairing
        // fights out of (`CLASH_STANCE`). The shin just below the knee is both reachable and the
        // right thing to meet a wide sweep with: it is the part of the leg that comes through.
        if (b.legLowerL && b.footL) {
          b.legLowerL.getWorldPosition(out);
          b.footL.getWorldPosition(_clashW);
          return out.lerp(_clashW, 0.35);
        }
        break;
      case 1:
        // THE CLINCH: the midpoint of the two hands, which is where the head being held is.
        if (b.armLowerL && b.armLowerR && ud.handLocal) {
          b.armLowerL.localToWorld(out.copy(ud.handLocal.L));
          b.armLowerR.localToWorld(_clashW.copy(ud.handLocal.R));
          return out.add(_clashW).multiplyScalar(0.5);
        }
        break;
    }
    // THE PUNCH (and any fallback): the fist, which hangs off the L arm bone.
    if (b.armLowerL && ud.handLocal) return b.armLowerL.localToWorld(out.copy(ud.handLocal.L));
    return out.set(this.pos.x, this.pos.y, this.pos.z);
  },

  // Try to lock with `e` off the `move` this body is throwing. Returns true if the clash STARTED,
  // in which case nothing else about the move happens (see `attackContact` and enemies.js).
  startClash(e, move) {
    if (this.clash || !e || !e.built || e.ragdoll) return false;
    // Both sides have to be mid-beat. The player's side is checked against his own move's contact
    // key and the enemy's against its fist's (`strikeTimeToContact`), and the two windows are the
    // same number — which is the whole definition of "at the same time".
    if (this.state !== "attack" || !this.grounded) return false;
    if (e.state !== "idle") return false;
    const moves = this.combatMoves();
    const m = moves && moves[this.attackMove];
    if (!m || Math.abs(this.attackT - m.start) > P.CLASH_WINDOW) return false;
    if (Math.abs(this.strikeTimeToContact(e)) > P.CLASH_WINDOW) return false;
    const dx = e.pos.x - this.pos.x;
    const dz = e.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1e-3;
    const i = Math.max(0, Math.min(3, move | 0));
    this.clash = {
      e,
      move: i,
      t: 0,
      push: 0,
      ePush: 0,
      spam: 0,
      jolt: 0,
      eJolt: 0,
      // The line between the two bodies, and the mark the shoving match walks away from.
      ux: dx / d,
      uz: dz / d,
      midX: (this.pos.x + e.pos.x) * 0.5,
      midZ: (this.pos.z + e.pos.z) * 0.5,
      dist: P.CLASH_DIST[i] || P.CLASH_DIST[0],
      // The body's own mashing rate, picked once: some clashes are genuinely harder than others,
      // but the band is under what a human can mash, so the race is always winnable by hand.
      rate: P.CLASH_RATE_MIN + Math.random() * (P.CLASH_RATE_MAX - P.CLASH_RATE_MIN),
      ePressT: 0.30 + Math.random() * 0.45,
      done: false,
    };
    this.setState("clash");
    this.clashDrive = 0;
    this.attackNext = false;
    this.attackSpinning = false;
    this.vel.x = 0;
    this.vel.z = 0;
    // The lock is an impact, so it holds the world for the same beat a clean hit does.
    this.hitstop = Math.max(this.hitstop, P.CLASH_STOP);
    if (this.sfx && this.sfx.clash) this.sfx.clash();
    this.events.push("clash");
    // The other side of it: the body is locked too, and told which weapon it is up against (it is
    // the DISPLAY's copy of the move — the fist itself is solved live, see streetwear.js).
    if (e.setState) e.setState("clash");
    e.clashMove = i;
    e.clashDrive = 0;
    e.clashJolt = 0;
    // The body's own punch is frozen on its contact frame for the duration of the lock and marked
    // as already landed. A lock the PLAYER started is against a fist that was still winding up, and
    // without this that fist would go off in the middle of the shoving match.
    const em = e.charMesh && e.charMesh.userData.combatMoves;
    if (em) {
      const emm = em[e.atkMove] || em[3];
      e.atkT = emm.total - emm.start;
      e.atkDone = true;
    }
    return true;
  },

  // The lock, one frame. The two bodies are held `dist` apart on the line they met on and the PAIR
  // walks along it by whatever share of the race has been won — so winning is visibly walking the
  // other body backwards, and losing is being walked. Everything is driven by velocity rather than
  // assigned so the world's own collision still applies to both of them.
  updateClash(dt, inp) {
    const c = this.clash;
    const e = c && c.e;
    // The body can leave the lock out from under it (a respawn, a knock-out landing, a shove off a
    // roof). A lock with nothing in it ends rather than dragging a body that is no longer there.
    if (!c || !e || !e.built || e.ragdoll || e.state !== "clash") {
      this.endClash(null);
      return;
    }
    c.t += dt;
    c.jolt = Math.max(0, c.jolt - dt / P.CLASH_JOLT_T);
    c.eJolt = Math.max(0, c.eJolt - dt / P.CLASH_JOLT_T);
    // The lock's own aim: both bodies face each other for as long as it lasts (the body's is its
    // own, in enemies.js), so a clash that started off a turn lands square rather than leaning.
    const fy = Math.atan2(c.ux, c.uz);
    this.facing += wrapPi(fy - this.facing) * Math.min(1, 18 * dt);
    // The player's half of the race: one press, one shove.
    if (inp.kickPressed) {
      c.spam++;
      c.push += P.CLASH_PRESS;
      c.jolt = 1;
      if (this.sfx && this.sfx.clashPush) this.sfx.clashPush(c.spam);
      // ...and the press is an M1 like any other, so THE WALL CLINCH's tally counts it too (see
      // `feedWallChain`): an M1 throw at a face that happens to have landed in a clash is still
      // *"an m1 on the wall"*, and without this the second swing of the chain — which IS the clash —
      // silently eats a tap of the string (measured: four taps fed out of six).
      if (this.onWallContact() || this.wallBeatWallFind()) this.feedWallChain();
    }
    // ...and the body's: its own presses, on the rate this clash was handed at.
    c.ePressT -= dt;
    let guard = 0;
    while (c.ePressT <= 0 && guard++ < 8) {
      c.ePush += P.CLASH_PRESS;
      c.eJolt = 1;
      c.ePressT += 0.5 / c.rate;
    }
    // The marks. `bias` is the state of the race (1 = the player has it all, -1 = the body does)
    // and it is what moves the PAIR; the two jolts only squeeze the lock, which is the read of a
    // single press (a shove, then the arms take it back).
    const p = Math.min(1, c.push / P.CLASH_WIN);
    const q = Math.min(1, c.ePush / P.CLASH_WIN);
    const bias = Math.max(-1, Math.min(1, p - q));
    const gap = c.dist - 0.10 * (c.jolt + c.eJolt);
    const cx = c.midX + c.ux * P.CLASH_ADVANCE * bias;
    const cz = c.midZ + c.uz * P.CLASH_ADVANCE * bias;
    this.vel.x = Math.max(-14, Math.min(14, (cx - c.ux * gap * 0.5 - this.pos.x) * P.CLASH_PULL));
    this.vel.z = Math.max(-14, Math.min(14, (cz - c.uz * gap * 0.5 - this.pos.z) * P.CLASH_PULL));
    // Who has it. A meter filling ends it outright; a stalemate is decided on the meters when the
    // clock runs out (a dead heat is a break — see `endClash`).
    let winner = null;
    if (c.push >= P.CLASH_WIN) winner = "player";
    else if (c.ePush >= P.CLASH_WIN) winner = "enemy";
    else if (c.t >= P.CLASH_MAX_T) winner = Math.abs(p - q) < 0.06 ? "break" : p > q ? "player" : "enemy";
    // The two drives are handed out every frame, because the POSES are read from them (see
    // `updateVisual` and `Enemy.updatePose`).
    this.clashDrive = p;
    e.clashDrive = q;
    e.clashJolt = c.eJolt;
    if (winner) this.endClash(winner);
  },

  // Break the lock. `winner` is "player", "enemy", "break" or null (the lock died with the body).
  endClash(winner) {
    const c = this.clash;
    this.clash = null;
    this.clashDrive = 0;
    if (c) {
      const e = c.e;
      if (e) {
        e.clashMove = -1;
        e.clashDrive = 0;
        e.clashJolt = 0;
      }
      if (winner === "player" && e && e.built && e.state === "clash") {
        // The winner's move lands after all: the same reaction the chain's own move would have put
        // on the body, off the same table, with the knock of a move that has been walked in — so
        // a clash won is worth more than the same move thrown from standing.
        const i = c.move;
        const kind = P.COMBAT_KIND[i] || "fold";
        const landed = e.hit(kind, c.ux, c.uz, P.COMBAT_KNOCK[i] * P.CLASH_WIN_KNOCK, P.COMBAT_STUN[i], {
          dmg: P.COMBAT_DMG[i] * this.dmgMul(),
          ragdoll: i === 3,
          flip: i === 2,
        });
        if (landed) {
          this.lastHit = {
            kind,
            move: i,
            x: e.pos.x,
            y: e.pos.y + P.HY * (kind === "fold" ? 0.95 : 0.7),
            z: e.pos.z,
            power: 1,
            ko: e.hp <= 0,
            catch: false,
          };
          this.events.push("hit");
          if (e.hp <= 0) this.events.push("ko");
        }
        // ...and the chain carries on from the move that won it, so mashing M1 out of a clash
        // walks straight into the next beat of the string instead of back to the knee.
        // `clashwin` is the win's own event (the strike above already pushed `hit`, which is what
        // carries the damage): it is what the style meter and the ultimate's charge read for the
        // shoving match itself. Losing one pushes `clashlose` below, and that one now costs health.
        this.events.push("clashwin");
        this.combo = i + 1 < 4 ? i + 1 : 0;
        this.comboGrace = P.COMBAT_GRACE;
        this.attackCd = P.COMBAT_CD;
        this.hitstop = Math.max(this.hitstop, P.CLASH_STOP);
      } else if (winner === "enemy" && e) {
        // ...and if he lost it, the fist he was pushing against comes through. The shove is handed
        // to main.js off `clashlose`, which is where every other knock on the player already lands
        // (see the `enemyHit` block), so the knock, the shake and the sound cost nothing new.
        e.setState("idle");
        this.combo = 0;
        this.comboGrace = 0;
        this.attackCd = P.COMBAT_CD;
        this.hitstop = Math.max(this.hitstop, P.CLASH_STOP);
        this.lastClash = {
          win: "enemy",
          x: this.pos.x + c.ux * 0.5,
          y: this.pos.y + 0.4,
          z: this.pos.z + c.uz * 0.5,
          dx: c.ux,
          dz: c.uz,
        };
        this.events.push("clashlose");
      } else {
        // A dead heat (or a lock that died): both bodies are driven apart and nobody's move lands.
        if (e && e.built && e.state === "clash") e.setState("idle");
        this.combo = 0;
        this.comboGrace = 0;
        this.lastClash = {
          win: "break",
          x: (this.pos.x + e.pos.x) * 0.5,
          y: this.pos.y + 0.4,
          z: (this.pos.z + e.pos.z) * 0.5,
          // ...and the line the two of them met on, so the break's FX can throw its sparks BOTH
          // ways (see the `clashbreak` block in main.js): a dead heat is the one clash beat whose
          // burst is symmetric, and it needs the direction to make it so.
          dx: c.ux,
          dz: c.uz,
        };
        this.events.push("clashbreak");
      }
    }
    this.setState(this.grounded ? "ground" : "air");
  },

  // The chain does not survive leaving the floor for LONG: a jump or a knock-off ends it
  // outright (and the chain counter goes with it, so the next press starts at the knee again)
  // — but only once the move really is an airtime. A shove from an enemy's punch lifts the
  // body for about a tenth of a second, and ending a move for that would reset the chain every
  // time anyone else in the fight lands one (the user's "it keeps doing the first m1").
  tickChainAir(dt, grounded) {
    if (this.state === "attack") {
      if (grounded) this.attackAirT = 0;
      else {
        this.attackAirT += dt;
        // ...unless the move is the DOWN SLAM, which is THROWN from the air and is allowed to run
        // there (see `P.DSLAM_*`) — a slam that cancelled itself a fifth of a second in, because
        // its own state noticed it was not on the deck, would never land.
        //
        // ...or the AIR COMBO is open (see `P.CAPO_AIR_T`): the capoeira's launch is a deliberate
        // invitation to take the chain off the deck, so the move is allowed to run in the air for
        // as long as the window lasts. Every landed hit refreshes it (see `attackContact`), which
        // is what makes it a combo rather than a single jump-in.
        if (this.attackAirT > P.COMBAT_AIR_GRACE && this.airComboT <= 0 && !this.attackSlam) {
          this.setState("air");
          // THE FINISHER'S SECOND DOOR (see `P.COMBAT_AIR_FINISH`). A chain broken by a JUMP used
          // to be broken outright — and that is right for the knee, the clinch and the sweep, which
          // are footwork. But if it is the FINISHER that is next (`combo` 3 — i.e. the sweep was
          // the last move thrown) then the press after the jump is the one the down slam is FOR,
          // so the chain keeps its place and opens an airborne window instead of dying. Nothing
          // else about the break changes: any other move's chain still dies here.
          if (this.combo >= 3) {
            this.airFinisherT = P.COMBAT_AIR_FINISH;
            this.combo = 3;
            this.comboGrace = P.COMBAT_AIR_FINISH;
          } else {
            this.combo = 0;
            this.comboGrace = 0;
          }
          this.attackSpinning = false;
        }
      }
    }
  },

  tickChainPress(grounded, inp, speed2D, dashFree, chordHeld, poleStruck, hasWish, wx, wz) {
    // THE DECK CLAIMS THE PRESS FIRST (session 200 — see player/board.js). While the feet are on a
    // board, M1 is a TRICK and M2 a MANUAL, and there is no chain, no uppercut, no wall chain, no
    // dive, no slam, no slide and no dash: everything below is ONE button family, and none of it
    // exists on a deck. The ride's own tick has already READ the press (it runs in the state machine,
    // which is earlier in the frame than this), so this door exists to make sure the same press cannot
    // ALSO come out as a knee — a trick on the mount frame and a punch three frames later is exactly
    // what a mash would produce.
    if (this.board) return;
    if (!poleStruck && (this.state === "ground" || this.state === "air" || dashFree) && !this.skyfall) {
      // A press inside the chain's own DEAD TIME still counts. `COMBAT_CD` exists to stop a HELD
      // button from restarting the chain the moment it ends, but with M1 no longer holdable it
      // only ever costs a real click: a move ends, its cooldown is 0.14 s of that same window, and
      // a click landing in it was simply swallowed — which is a chain that keeps dropping back to
      // the knee for a player clicking at a human rate. So a press with a LIVE chain is buffered
      // for the length of that dead time and spent the frame it clears. A press with no chain
      // behind it (comboGrace spent) is still not buffered, so the cooldown still does its real
      // job: it stops mashing from restarting a finished string.
      if (inp.kickPressed && (grounded || this.airFinisherT > 0) && speed2D < P.COMBAT_SPEED && this.attackCd > 0 && this.comboGrace > 0) {
        this.attackBuf = P.COMBAT_CD + P.ACTION_BUFFER * 0.25;
      }
      if (
        (inp.kickPressed || this.attackBuf > 0) &&
        // ...and never while the CHORD is down: M1 held with M2 is the guard, not the chain (see
        // `startBlock` — the chord is checked above, so this is the one frame where both could
        // otherwise read, and it is the block's frame).
        !chordHeld &&
        // ...and the AIRBORNE finishes count as a standing body too: the air combo's own window
        // (see `P.CAPO_AIR_T`) and the window the DOWN SLAM opens after a chain is broken by a
        // jump (see `P.COMBAT_AIR_FINISH`). Both stand the "foot on the deck" gate down; the speed
        // gate below is NOT stood down by the slam's, because the 17 u/s ceiling is the user's and
        // it holds in the air exactly as it does on the ground.
        (grounded || this.airComboT > 0 || this.airFinisherT > 0) &&
        // ...and a step the player is already free of counts as a standing body for this: the M1
        // comes out of the dash it cancels (the user's *"like slide m1"*), which the speed gate
        // would otherwise refuse — you are still going too fast to punch.
        (speed2D < P.COMBAT_SPEED || this.airComboT > 0 || dashFree) &&
        this.attackCd <= 0
      ) {
        // M1, standing: the chain. Checked ahead of every other press because it is the one the
        // player will be mashing, and because the moves it starts are cancellable by anything
        // that reads a press later in a frame only if they are entered first.
        //
        // ...and the same press works IN THE AIR while the capoeira's launch has the window open
        // (the user's *"if i press twice i jump and i can start air comboing the enemy"*, now one
        // press: the kick itself is the launch): the two gates the ground chain opens with — a foot
        // on the deck and a body that is not running — are exactly the two an air combo does not
        // have, so the window stands both of them down for as long as it lasts
        // (see `P.CAPO_AIR_T`).
        //
        // ...and the 4th M1 off the deck is the DOWN SLAM rather than the one-two: `startAttack`
        // settles that off the body's own altitude, so the same press reads as whichever finisher
        // the moment calls for.
        this.attackBuf = 0;
        // THE UPPERCUT is the third thing this one press can be (see `startUppercut`): M1 with the
        // JUMP key HELD, on the deck, ON THE 4th SLOT OF THE CHAIN. Space is the jump AND the climb
        // (see `input.js`), and a jump is a fresh press — so holding it down after a landing leaves
        // a body standing on the deck with the key still down, which is exactly the window the
        // user's *"if space is held while player is on the ground and m1ing"* describes.
        //
        // ...and WHICH PRESS it belongs to is the second half of the user's own fix: *"fix the
        // uppercut make it only be done in the m4 like if i hold space while doing the 4th m1 i do
        // the uppercut"*. So the modifier is gated on the chain's own place and not only on the key:
        // `nextMoveIndex()` is 3 only when the press would have been the FINISHER — either four
        // moves into a string or with the finisher queued behind a move that is still playing —
        // which is what makes it a variant of the 4th M1 rather than a move of its own that could be
        // thrown off a cold chain. Before the gate, holding SPACE and mashing threw an uppercut on
        // EVERY press (the knee's slot included), because `startUppercut` starts the finisher's slot
        // outright.
        //
        // It is asked ONLY on a fresh press. A `attackBuf` press was made before the jump key went
        // down (or landed too late to be a modifier), and the move it belongs to is the chain's —
        // holding SPACE must not retroactively turn a queued knee into a launcher.
        const upperWish = grounded && inp.kickPressed && (inp.jumpHeld || inp.climbHeld) &&
          this.nextMoveIndex() === 3;
        // When it comes out the chain is left exactly where it was (`startAttack` wraps its own
        // place back to the knee), so the uppercut reads as its own thing rather than as the fourth
        // beat of a string; when it does not, the press is the chain's, unchanged.
        if (!(upperWish && this.startUppercut())) {
          // THE WALL CLINCH's second door (see `feedWallChain`): an M1 thrown while the body is
          // working a face feeds the same tally the wall kick feeds — the user's *"doing 5 m1s on the
          // wall"*. It is asked BEFORE `startAttack`, so the move's own opening frame can take the
          // body over the punch rather than after it (the punch is what fed the fifth tap, and a move
          // that had to wait for the chain to finish would be a move that never comes out of a mash).
          if (this.onWallContact() || this.wallBeatWallFind()) this.feedWallChain();
          this.startAttack(this.nextMoveIndex());
        }
      } else if (this.diveBuffer > 0 && this.diveCd <= 0 && !grounded && !this.skyfall) {
        this.startDive();
      } else if (this.slamBuffer > 0 && this.slamCd <= 0 && !grounded && !this.skyfall) {
        this.startSlam(hasWish, wx, wz);
      } else if (grounded && this.slideBuffer > 0 && this.slideCd <= 0 && speed2D > 3.2) {
        this.slideBuffer = 0;
        this.startSlide();
      } else if (this.dashBuffer > 0 && (grounded || this.coyote > 0) && hasWish && this.dashCd <= 0) {
        // Q with a DIRECTION is the dash (see `startDash` for how the three come out of the wish).
        // A Q with nothing held does NOTHING: the parkour roll that used to be the fallback here
        // has been REMOVED from the game.
        this.dashBuffer = 0;
        this.startDash(wx, wz);
      }
    }
  },
  // THE ATTACK STATE'S OWN BODY (the `attack` case of `update`'s `switch`, moved here whole): the
  // down slam's own vertical, and then the four grounded moves' carry — the creep at `COMBAT_MOVE`,
  // the drift toward it, the planted brake and the air combo's float. The two `break`s the case had
  // are `return`s here, which lands in the same place (the caller `break`s the moment it comes back).
  tickAttackState(dt, inp, hasWish, wx, wz) {
        // THE DOWN SLAM is thrown from the air and is DRIVEN down (see `P.DSLAM_*`): it is a move
        // that goes DOWN, so the vertical is its own — a gravity of its own multiplier and a
        // ceiling on the fall — and the horizontal is bent onto the body it is dropping on rather
        // than bled off like the grounded chain's carry. Everything below (the creep, the drift,
        // the float) belongs to the four grounded moves, and none of it can reach a slam.
        if (this.attackSlam) {
          this.vel.y -= P.GRAVITY * P.DSLAM_FALL * dt;
          if (this.vel.y < -P.DSLAM_MAX_V) this.vel.y = -P.DSLAM_MAX_V;
          const tgt = this.attackTarget;
          if (tgt) {
            const dx = tgt.pos.x - this.pos.x;
            const dz = tgt.pos.z - this.pos.z;
            const d = Math.hypot(dx, dz);
            if (d > 0.05) {
              // The drive is proportional to the gap, so the body is arrived AT rather than
              // overshot: a slam thrown from far off leans in, and one thrown straight down on a
              // body barely moves horizontally at all.
              const want = Math.min(P.DSLAM_DRIVE_MAX, d * 3.0);
              accelerate(this.vel, dx / d, dz / d, want, 6, dt);
            }
          } else {
            // Nothing to drop on: shed the horizontal instead, so the slam falls straight.
            const sps = Math.hypot(this.vel.x, this.vel.z);
            if (sps > 0.01) {
              const k = Math.max(0, 1 - 6 * dt);
              this.vel.x *= k;
              this.vel.z *= k;
            }
          }
          this.updateAttack(dt, inp);
          return;
        }
        const floor = hasWish ? P.COMBAT_MOVE : 0;
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > floor) {
          // ...and the body the move is working on SPENDS the carry: inside `COMBAT_PLANT_D` the
          // brake is `COMBAT_PLANT_DRIFT`, so the run is spent arriving at the strike rather than
          // carrying the feet past it.
          let drift = P.COMBAT_DRIFT;
          const tgt = this.attackTarget;
          if (tgt) {
            const dx = tgt.pos.x - this.pos.x;
            const dz = tgt.pos.z - this.pos.z;
            if (Math.hypot(dx, dz) < P.COMBAT_PLANT_D) drift = P.COMBAT_PLANT_DRIFT;
          }
          const ns = Math.max(floor, sp - drift * dt);
          const k = ns / sp;
          this.vel.x *= k;
          this.vel.z *= k;
        } else if (!hasWish) {
          this.vel.x = approach(this.vel.x, 0, P.GROUND_FRICTION * 2.4 * dt);
          this.vel.z = approach(this.vel.z, 0, P.GROUND_FRICTION * 2.4 * dt);
        }
        if (hasWish) accelerate(this.vel, wx, wz, P.COMBAT_MOVE, P.COMBAT_MOVE_ACCEL, dt);
        // The air combo FLOATS (see `airComboGravity`): a move thrown off the deck hangs there
        // instead of pulling the player out of his own string.
        this.airComboGravity(dt);
        this.updateAttack(dt, inp);
  },

  // THE MELEE CHAIN'S OWN POSE LAYER (lifted out of `updateVisual`).
  //
  // The melee chain sits on top of everything (see the block in `update`): an absolute pose
  // that owns the body for the whole of its move, with the run and idle layers already stood
  // down by the state gates above. It fades in and out over a few frames so a chain that ends
  // into a landing, or a jump that cancels one, eases back to whatever wants the body next.
  //
  // ...and a CHAINED move is cross-faded out of the move before it (`attackLink`). The chain
  // pose is a full OVERRIDE — `poseAttack` is handed `attackPose` itself, so at the end of its
  // fade it writes every bone it owns outright — and that is what makes the handover the one
  // place it has no smoothing: `attackPose` covers the STATE, so inside a chain it sits pinned
  // at 1 and a queued move's opening pose lands in a single frame. The chain's own handovers are
  // not all seamless (the clinch holds the trunk ~25° further over than the knee does, and its
  // arms leave the guard by ~30°), so knee→clinch and clinch→sweep each snapped a quarter of a
  // radian in one frame.
  //
  // The fade therefore CANNOT be done by easing the pose's own `e`: `e` is a convergence rate
  // from whatever the bones currently hold, and the run/idle layers have already written this
  // frame by the time the chain runs, so a partial `e` would let the run cycle leak through and
  // the limbs would swing out toward it and back (measured: a 0.62 u flail on the far hand,
  // against 0.29 u for the raw snap). Instead the chain is written EXACTLY as it always was, and
  // then the whole rig is eased back toward the silhouette the body was actually wearing last
  // frame (`chainBlend`). That is a true cross-fade between two finished poses, it cannot leak
  // anything, and it is measured in `main.js`'s own units — see the note in `P.COMBAT_LINK_FADE`.
  solveAttackPose(dt, ud) {
    this.attackPose = approach(this.attackPose, this.state === "attack" ? 1 : 0, dt / P.COMBAT_POSE_FADE);
    this.attackLink = Math.min(1, this.attackLink + dt / Math.max(1e-4, P.COMBAT_LINK_FADE));
    if (ud && ud.poseAttack && this.attackPose > 0.004) {
      // Which descriptor is playing (see `attackMoveSpec`): the four chain moves, or the DOWN SLAM
      // in the finisher's place when the finisher was thrown off the deck.
      const m = this.attackMoveSpec(this.attackMove);
      // The 2nd M1 (the clinch) GRABS: its hands are SOLVED onto the head of the body it is
      // holding (see `poseArmReach` / `CLINCH_HEAD` in streetwear.js), so the target is written
      // here, in the player's own frame, on every frame the move is up. It is read off the enemy's
      // own head BONE rather than its origin, so the haul dragging the body in, the bend of its
      // reaction and the fold of the player's own trunk are all already in the number the hands
      // are asked for — nothing about the grab is a fixed offset from anything. `fold` is in the
      // list because the clinch's reaction has to cross `fold` on its way in (the hit lands before
      // the shape does), and a frame with no body to hold clears the target so the arms fall back
      // to the authored `CLINCH.take*/pull*` path instead of snapping to the origin.
      const ct = this.attackTarget;
      if (ud.clearClinchHead) ud.clearClinchHead();
      if (ud.setClinchHead && ct && ct.built && this.attackMove === 1 &&
        (ct.state === "clinch" || ct.state === "fold") && ct.headPoint) {
        this.charMesh.updateWorldMatrix(true, false);
        ct.headPoint(_clinchV);
        this.charMesh.worldToLocal(_clinchV);
        ud.setClinchHead(_clinchV.x, _clinchV.y, _clinchV.z);
      }
      if (m) ud.poseAttack(this.attackPose, this.attackMove, Math.min(1, this.attackT / Math.max(0.001, m.total)), this.attackSlam, this.attackUpper);
      if (this.attackLink < 0.999) this.chainBlend(this.attackLink);
      this.chainSnapshot();
    }
  },

  // THE CLASH'S OWN SHAPE (lifted out of `updateVisual`). It is an absolute pose like the chain's — it
  // owns the body for as long as the lock lasts — and it is applied in the same place and on the same
  // terms: the player wears the move he brought, HELD on its own contact frame, with the drive of the
  // shoving match laid over the top. There is no fade in or out because there is nothing to fade: the
  // frame the lock starts on is the frame the move's own contact pose was already on, and the first
  // frame after it ends is whatever wants the body next, which converges from here like any other
  // handover.
  solveClashPose(ud) {
    if (ud && ud.poseClash && this.state === "clash" && this.clash) {
      ud.poseClash("player", this.clash.move, this.clash.t, this.clashDrive, this.clash.jolt);
    }
  },
};

export function installCombat(Player) {
  Object.assign(Player.prototype, combatMethods);
}
