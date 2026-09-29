// The four meters behind the HUD dial (see "The HUD dial" in src/README.md).
//
// The dial is one circular gauge in the top-left corner with the four things the user asked for
// ringed inside each other — the GREEN core is HEALTH, the three RED pills are the SKILLS, the CYAN
// ring is the ULTIMATE, and the GOLD letters beside it are the STYLE rank — and this file is
// everything behind it. The point of the design is that the four are not four independent readouts:
//
//   - the RANK multiplies how fast the ULTIMATE charges (a D trickle against an SSS flood), so the
//     style meter is worth keeping up for a reason other than the score;
//   - the ULTIMATE (R) turns on OVERDRIVE, which is how the skills stop having cooldowns, so the
//     payoff for the style meter is more of the thing the style meter is built from;
//   - HEALTH is what stops any of it being free: the fight can cost you something, and the rank
//     bleeds when it does;
//   - the SKILLS are the three things worth a cooldown — the FLYING KNEE on 1 (from a standstill he
//     SPRINTS a body down at ~20 u/s and leaps a knee through its head; from a run the knee comes
//     out on the spot, no run-up), the head SCISSOR on 2 (a guard
//     that blocks an incoming fist and counters with the legs) and the LAUNCH on 3 (he coils on the
//     spot, holds it with a shake in the legs, then drives both legs up through a rising kick — and
//     the frame the boot lands is the frame he leaves the ground, hauling the body it caught up with
//     him by the face).
//
// The player owns the VERBS (`player.whirl()` / `player.scissor()` / `player.scissorCatch()`), because
// they are things the body does and they have to move `player.vel`; this file owns the ECONOMY
// (what is off cooldown, what is charged, what rank you are standing on). Splitting it that way
// keeps one source of truth for each — and `player.scissorCatch` in particular is called straight
// from the enemy's own punch test (enemies.js), so it cannot wait a frame for a press to be
// forwarded through here.

import { P } from "./player.js";

// ---------------------------------------------------------------------------
// The style rank: a DMC-shaped ladder of seven letters over a point total, with a hold before the
// meter starts bleeding and a hard bite when you are the one who gets hit.
// ---------------------------------------------------------------------------
export const RANKS = [
  { name: "D", at: 0 },
  { name: "C", at: 45 },
  { name: "B", at: 100 },
  { name: "A", at: 170 },
  { name: "S", at: 260 },
  { name: "SS", at: 380 },
  { name: "SSS", at: 520 },
];
// ...and what each letter is worth to the ultimate's charge. The floor sits BELOW 1 on purpose: a
// fight picked with no style at all still builds toward the ultimate, just slowly enough that doing
// it well is visibly better.
const RANK_MUL = [0.8, 0.9, 1.0, 1.15, 1.35, 1.6, 2.0];
// What a landed strike is worth, by move (knee / clinch / sweep / finisher). The finisher is worth
// more than the three before it together: it is what the chain is built toward, and it is the one
// you have to earn by not dropping the string.
const MOVE_STYLE = [10, 14, 20, 34];
const VARIETY = 1.3;       // a strike you did NOT just throw is worth this much more than a repeat
const RANK_HOLD = 1.5;     // s with no style at all before the meter starts bleeding
const RANK_DECAY = 52;     // points/s once it does
const RANK_HIT_LOSS = 150; // ...and what taking a hit costs, on the same scale

export class Rank {
  constructor() {
    this.points = 0;
    this.index = 0;
    this.hold = 0;
    this.lastMove = -1;
    this.pulse = 0;      // >0 for a gain, <0 for a loss (the HUD's flash)
  }

  // Landed something worth `points`. `move` is the chain's move index when the points came off a
  // strike (so repeating one pays less) and -1 for everything else — a clash, a parry, a slide take
  // cannot take the variety bonus, because there is no strike for them to be a repeat of.
  gain(points, move = -1) {
    if (points <= 0) return;
    let p = points;
    if (move >= 0 && move !== this.lastMove) p *= VARIETY;
    this.points += p;
    if (move >= 0) this.lastMove = move;
    this.hold = RANK_HOLD;
    this.pulse = 1;
    this._rescore();
  }

  // You took one. The meter does not reset to nothing — a single stray punch must not throw away a
  // whole fight's style — it takes a fixed bite, which is two or three letters off the top.
  hurt() {
    if (this.points <= 0) return;
    this.points = Math.max(0, this.points - RANK_HIT_LOSS);
    this.lastMove = -1;
    this.pulse = -1;
    this.hold = RANK_HOLD;
    this._rescore();
  }

  // Death: the one thing that does wipe it.
  reset() {
    this.points = 0;
    this.lastMove = -1;
    this.hold = 0;
    this.pulse = 0;
    this._rescore();
  }

  update(dt) {
    this.pulse = Math.sign(this.pulse) * Math.max(0, Math.abs(this.pulse) - dt * 2.6);
    if (this.points <= 0) return;
    if (this.hold > 0) {
      this.hold -= dt;
      return;
    }
    this.points = Math.max(0, this.points - RANK_DECAY * dt);
    this._rescore();
  }

  _rescore() {
    let i = 0;
    for (let k = 0; k < RANKS.length; k++) if (this.points >= RANKS[k].at) i = k;
    this.index = i;
  }

  get name() {
    return RANKS[this.index].name;
  }

  // The rank's own 0..1 position between its letter and the next one, for the HUD's fill.
  get progress() {
    const lo = RANKS[this.index].at;
    const hi = this.index + 1 < RANKS.length ? RANKS[this.index + 1].at : lo + 180;
    return Math.max(0, Math.min(1, (this.points - lo) / Math.max(1, hi - lo)));
  }

  mul() {
    return RANK_MUL[this.index];
  }
}

// ---------------------------------------------------------------------------
// The three skills, in the order the three red pills sit in the ring. Each is a cooldown and a
// verb; the verbs are on the player (see the note at the top of the file).
// ---------------------------------------------------------------------------
export const SKILLS = [
  { name: "KNEE", cd: P.KNEE_CD, hint: "the FLYING KNEE: press it standing and he SPRINTS in at ~20 u/s and leaps a knee through whatever is in front of him; press it already running and the knee comes out on the spot with no run-up. The leap is SOLVED onto the target's HEAD — the knee itself is the contact — and it throws the body off its feet ragdolling. It hits like a truck and it is the only skill that is pure approach" },
  { name: "SCISSOR", cd: P.SCISSOR_CD, hint: "a guard into a head scissor: a fist that lands inside the guard is BLOCKED and the legs take the body that threw it — he swings on the neck like a pendulum, the shins snapping shut across it" },
  { name: "LAUNCH", cd: P.CAPO_CD, hint: "the LAUNCH — he coils down onto the back leg with both arms drawn behind him and HOLDS it, so the read is a man loading rather than a man crouching; then both legs snap up through a rising kick. The frame the boot lands is the frame he leaves the ground: whoever it caught is RAGDOLLED and DRAGGED UP with him, pinned by the FACE to his soles, and M1 keeps chaining in the air — the combo starts on the body he just tore off the deck" },
];

export class Abilities {
  constructor(player) {
    this.player = player;
    this.rank = new Rank();
    this.ult = 0;
    this.overT = 0;
    this.failPulse = [0, 0, 0];
    this.readyPulse = 0;
    // The purple diamond's own flash (see `hud()` / `setDial`): set by the dive launch, so the icon
    // that just went on cooldown says so — the same job `failPulse` does for a cold pill, on the
    // other side of the event.
    this.airPulse = 0;
    this.running = false;
    this.creditId = -1;
  }

  get ready() {
    return this.ult >= P.ULT_FULL;
  }

  get over() {
    return this.overT > 0;
  }

  // ---- one frame ----
  // `inp` is the frame's own input (input.js `frame()`), so the presses are read here rather than
  // forwarded through the player: what a skill press MEANS is a question about the economy.
  //
  // This is called EARLY in the frame (right after the player's own update) so that a skill fired
  // this frame can change what happens to the bodies this frame; `credit()` is called LATE, after
  // the enemies have had their say, because half of what the economy reads — the damage the player
  // TOOK — is only pushed into his event list down there (see main.js's frame). Two calls, one
  // clock: everything that decays or expires is here, everything that is EARNED is in `credit`.
  update(dt, inp, running) {
    const pl = this.player;
    this.running = !!running;
    for (let i = 0; i < 3; i++) {
      this.failPulse[i] = Math.max(0, this.failPulse[i] - dt * 3);
    }
    // The flash decays toward zero from EITHER side: a positive one is the ring coming up, a negative
    // one is R pressed too early (see `tryUlt`), and both have to be able to run out.
    this.readyPulse = Math.sign(this.readyPulse) * Math.max(0, Math.abs(this.readyPulse) - dt * 2.4);
    this.airPulse = Math.max(0, this.airPulse - dt * 2.2);
    if (this.overT > 0) {
      const was = this.overT;
      this.overT = Math.max(0, this.overT - dt);
      if (was > 0 && this.overT === 0) pl.events.push("overoff");
    }
    const wasReady = this.ready;

    if (this.running) {
      if (inp.skill1Pressed) this.trySkill(0);
      if (inp.skill2Pressed) this.trySkill(1);
      if (inp.skill3Pressed) this.trySkill(2);
      if (inp.ultPressed) this.tryUlt();
      // THE GRAB is not a pill (it is the right mouse button — see "THE RIGHT-CLICK GRAB" in
      // player.js), so it has no fail pulse to flash: it is offered to the verb and the verb's own
      // cooldown and state rules decide. A refused press costs nothing.
      //
      // ...except while the M1+M2 CHORD is down, which is THE BLOCK and not the grab (see
      // `player.chordLive`): the two buttons held together are the guard, and the right one among
      // them must not also be taking a body by the shoulders.
      // ...and never from a deck (session 200): the right button on a board is the MANUAL (see
      // `tickRideState` in player/board.js), so the ride owns the press and the grab is not offered
      // it at all.
      if (inp.grabPressed && !pl.chordLive(inp) && !pl.board) pl.grab();
    }

    if (!wasReady && this.ready) this.readyPulse = 1;
    this.rank.update(dt);
    return this;
  }

  // Read what the player did this frame off its own event list. The strikes carry `lastHit` (see
  // `attackContact`), which is where the damage — and so the charge — comes from; everything else
  // is a flat tip for doing something worth doing.
  credit() {
    const pl = this.player;
    // Once per frame, whatever else happens (see `player.eventsId`): the events are a queue that
    // main.js also reads, and re-reading them would pay the player twice for one punch.
    if (pl.eventsId === this.creditId) return;
    this.creditId = pl.eventsId;
    const ev = pl.events;
    const rank = this.rank;
    const sm = this.over ? P.OVER_STYLE : 1;
    if (ev.indexOf("hit") !== -1 && pl.lastHit) {
      const h = pl.lastHit;
      this.charge(P.COMBAT_DMG[h.move] * P.ULT_PER_DMG + P.ULT_PER_HIT, rank.mul());
      rank.gain((MOVE_STYLE[h.move] || 10) * sm, h.move);
      if (h.ko) rank.gain(24 * sm);
    }
    if (ev.indexOf("clashwin") !== -1) {
      this.charge(P.ULT_PER_CLASH, rank.mul());
      rank.gain(30 * sm);
    }
    if (ev.indexOf("block") !== -1) {
      // The guard catching a fist is worth more than anything but a finisher: it is the whole point
      // of the scissor, and the counter it opens is where the damage comes from.
      this.charge(P.ULT_PER_BLOCK, rank.mul());
      rank.gain(40 * sm);
    }
    if (ev.indexOf("whirlgrab") !== -1) rank.gain(26 * sm);
    if (ev.indexOf("whirlslam") !== -1) rank.gain(30 * sm);
    if (ev.indexOf("whirllaunch") !== -1) rank.gain(34 * sm);
    if (ev.indexOf("kneehit") !== -1) rank.gain(44 * sm);
    // ...and THE GRAB's own three (see "THE RIGHT-CLICK GRAB" in player.js): making the contact is
    // the tip, and what the contact turns into is what it is worth. The slam is the biggest thing
    // the button does, so it is priced with the finishers.
    if (ev.indexOf("grabtake") !== -1) rank.gain(18 * sm);
    if (ev.indexOf("grabcrash") !== -1) rank.gain(30 * sm);
    if (ev.indexOf("grabset") !== -1) rank.gain(20 * sm);
    if (ev.indexOf("grabslam") !== -1) rank.gain(38 * sm);
    if (ev.indexOf("scissorhit") !== -1) rank.gain((pl.scissorCounter ? 46 : 28) * sm);
    if (ev.indexOf("capohit") !== -1) rank.gain(24 * sm);
    if (ev.indexOf("slidehit") !== -1) rank.gain(18 * sm);
    if (ev.indexOf("macacohit") !== -1) rank.gain(22 * sm);
    // The dive launch: a tackle that opens an air combo, so it is paid like the capoeira's own
    // launcher (`capohit`, 24) rather than like a movement hit — it is the same door into the same
    // window, and it is on a longer cooldown than any pill.
    if (ev.indexOf("divelaunch") !== -1) {
      rank.gain(26 * sm);
      this.airPulse = 1;
    }
    if (ev.indexOf("wallkick") !== -1) rank.gain(12 * sm);
    if (ev.indexOf("hurt") !== -1) rank.hurt();
    if (ev.indexOf("down") !== -1) {
      rank.reset();
      this.ult = 0;
      this.overT = 0;
    }
  }

  charge(amount, mul) {
    if (this.ult >= P.ULT_FULL) return;
    this.ult = Math.min(P.ULT_FULL, this.ult + amount * mul);
  }

  // ---- the skills ----
  // The COOLDOWN belongs to the verb (the player owns `whirlCd` / `scissorCd` / `capoCd`, because a
  // verb can be asked for from anywhere and has to be able to refuse), so there is nothing to
  // duplicate here: the ability layer only decides whether the press was worth anything and
  // flashes the pill when it was not. That is also what keeps the dial honest — the pill is drawn
  // off the player's own clock, so it can never show READY while the body cannot fire.
  trySkill(i) {
    const did = i === 0 ? this.player.knee() : i === 1 ? this.player.scissor() : this.player.capoeira();
    if (!did) {
      this.failPulse[i] = 1;
      return false;
    }
    return true;
  }

  // ---- the ultimate ----
  // ...and it refuses in a FREE FALL on the same terms as everything else (the user's *"i cant
  // grab or do skills or do anything other than moving"*): overdrive's whole announcement is a
  // blast fired from the STREET at the player's feet (`dropBlast`), and there is no street under a
  // skyfall. The meter is not spent on a refused press — the gate is ahead of the `ult = 0`.
  tryUlt() {
    if (this.player.skyfall) return false;
    if (!this.ready) {
      this.readyPulse = -Math.abs(this.readyPulse || 1);
      return false;
    }
    this.ult = 0;
    this.overT = P.OVER_T;
    this.player.overdrive();
    return true;
  }

  // What the HUD dial draws. Everything is 0..1; the rank is its letter plus how far into the next
  // letter the meter has climbed.
  hud() {
    return {
      hp: this.player.hp / P.HP_MAX,
      hurt: Math.max(0, 1 - this.player.hurtT / 0.45),
      ult: this.ult / P.ULT_FULL,
      ready: this.ready,
      readyPulse: this.readyPulse,
      over: this.over ? this.overT / P.OVER_T : 0,
      skills: [0, 1, 2].map((i) => {
        // Straight off the player's own clocks (see `trySkill`): one source of truth, so a pill can
        // never say READY while the body would refuse the press.
        const left = i === 0 ? this.player.kneeCd : i === 1 ? this.player.scissorCd : this.player.capoCd;
        return {
          name: SKILLS[i].name,
          frac: SKILLS[i].cd > 0 ? 1 - Math.min(1, left / SKILLS[i].cd) : 1,
          ready: left <= 0,
          fail: this.failPulse[i],
        };
      }),
      rank: this.rank.name,
      rankIndex: this.rank.index,
      rankProgress: this.rank.progress,
      rankPulse: this.rank.pulse,
      // The AIR COMBO's own cooldown, for the purple diamond beside the dial (see "The dive
      // launch"): straight off the player's clock, like the pills, so the icon can never say READY
      // while a dive would come out as a plain body-check (`diveContact` reads `player.airCd`).
      air: {
        frac: P.AIR_CD > 0 ? 1 - Math.min(1, this.player.airCd / P.AIR_CD) : 1,
        ready: this.player.airCd <= 0,
        open: this.player.airComboOpen,
        flash: this.airPulse,
      },
    };
  }
}
