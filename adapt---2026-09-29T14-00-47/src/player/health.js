// ---------------------------------------------------------------------------
// Part 17 of the `player.js` split: HEALTH, THE ULTIMATE, AND THE THREE SKILLS.
//
// Moved here from player.js:
//   - `damage` / `down` — taking a hit and being broken.
//   - `canSkill` — the one gate the four skills, the grab, the staff and the wall
//     clinch all come through.
//   - `armored` / `invuln` — the whirl's and the backdash's own windows.
//   - `overdrive` / `dmgMul` — the ultimate: the window and the damage it buys.
//   - `dropBlast` — the ground slam's shockwave.
//
// Deps: `P` from ./config.js, and the body's own fields/methods
// (`dropBlast`/`backdashBeats`/`qdashTime`/`releaseCapoCarry`/...). No
// module-scope scratch, and nothing here touches THREE.
// ---------------------------------------------------------------------------
import { P } from "./config.js";

const healthMethods = {
  // =========================================================================
  // HEALTH, THE ULTIMATE, AND THE THREE SKILLS
  //
  // The verbs behind the HUD dial (see "The HUD dial" in the README). The economy — what is
  // charged, what is off cooldown, what rank you are standing on — is in abilities.js; what lives
  // here is the part that has to touch the BODY: taking damage, the dash, the blast and the parry
  // window. `player.parryCatch` in particular is called from the enemy's own punch test, one frame
  // before anything in abilities.js could have known about it (see the punch block in enemies.js).
  // =========================================================================

  // Take a hit. `n` is in the enemies' own units (E.ATK_DMG is 7 against `HP_MAX` 100), and the
  // i-frames are what stop a crowd of bodies from chaining one punch into the next into a lock —
  // the grace is the same one every action game lands on, and it is why a fight with three of them
  // in it is survivable rather than a coin flip.
  damage(n, opts) {
    if (n <= 0) return false;
    if (this.hurtCd > 0 && !(opts && opts.pierce)) return false;
    // ...and the WHIRL's own armor (skill 1 — see `armored`): a body with a neck in its hand does
    // not flinch. The hit still sparks (main.js draws it), it simply does not land.
    // ...and the BACKDASH's i-frames ride the same rule (see `invuln`).
    if ((this.armored() || this.invuln()) && !(opts && opts.pierce)) return false;
    this.hurtCd = P.HURT_IFRAME;
    this.hurtT = 0;
    this.hp = Math.max(0, this.hp - n);
    this.events.push("hurt");
    if (this.hp <= 0) this.down();
    return true;
  },

  // Out of health. There is no death animation and no corpse, and — deliberately — no trip back to
  // the spawn: the world is infinite and a run is long, so losing your PLACE because a crowd
  // cornered you would make the health meter something to avoid fighting near rather than
  // something to manage. The body goes down where it stands and is back on its feet a beat later
  // with the meter wiped, which is the real cost: the ultimate, the rank and the cooldowns all go
  // with it (see `Abilities.credit`).
  down() {
    this.hp = P.HP_MAX;
    this.hurtT = P.HP_REGEN_DELAY;
    this.hurtCd = P.HURT_IFRAME;
    this.vel.set(0, 0, 0);
    this.chain = 0;
    this.throttle = 0;
    this.clash = null;
    this.combo = 0;
    this.comboGrace = 0;
    this.slideHits.clear();
    // ...and every hold the body was in is let go of: a carry does not survive the carrier going
    // down, and neither does the guard's window or the air combo's (`down` is the one thing that
    // wipes everything the fight gave you — see `Abilities.credit`).
    if (this.whirlTarget && this.whirlTarget.built) {
      this.whirlTarget.grabT = 0;
      this.whirlTarget.grabDist = null;
    }
    this.whirlTarget = null;
    this.whirlCd = 0;
    this.kneeCd = 0;
    this.grabCd = 0;
    // ...and the LUNGE's own hold, for the whirl's reason: `down` wipes everything the fight gave
    // you, and a body left with a `carryOrbit` nobody writes is a body stuck where the roll put it.
    if (this.lungeTarget && this.lungeTarget.built) {
      this.lungeTarget.carryOrbit = null;
      this.lungeTarget.grabDist = null;
      this.lungeTarget.grabT = 0;
    }
    this.lungeTarget = null;
    this.lungeBall = 0;
    this.lungeHopT = 0;
    this.lungeBlendT = 0;
    this.lungeGrab0 = null;
    this.lungeCd = 0;
    // ...and the free fall's own roll-out, which is the lunge's state (session 194 — see
    // `startFreeRoll`): a body put on its back mid-roll must not come up still wearing the flag or a
    // camera that is still dropped onto a ball nobody is turning on.
    this.freeRoll = false;
    this.camDrop = 0;
    this.scissorCd = 0;
    this.capoCd = 0;
    this.blockT = 0;
    this.airComboT = 0;
    this.airComboIdle = 0;
    // ...and the body the LAUNCH's carry is holding, for the whirl's own reason: `down` wipes
    // everything the fight gave you, and a held body with nobody writing its hold is a body stuck
    // in the air (see `releaseCapoCarry`).
    this.releaseCapoCarry();
    this.events.push("down");
  },

  // Whether a skill may open at all right now. The four committed moves refuse (a slam that let go
  // into a spin, or a vault that turned into a kick, would both read as the move being cancelled
  // by nothing), and so do the other two skills' own moves; everything else — the run, the air,
  // the chain — is fair game, because a skill out of the chain is the cancel the chain is built
  // around (see the note in `startAttack`).
  canSkill() {
    const st = this.state;
    // ...and THE FREE FALL refuses EVERYTHING (the user's *"make me when im free falling i cant
    // grab or do skills or do anything other than moving"*). A skyfall is the one state with no
    // ground to work from and no air to work in: there is nothing to knee, nothing to take by the
    // shoulders, no staff to plant and no wall to clinch, and a fall that could throw a skill would
    // not be a fall. Steering is the whole of the player's agency up there — and the ONE thing the
    // fall CAN answer is carved out elsewhere (the `plunge` block in `update`): M1, straight down.
    // This gate is the single door the four skills, the grab, the staff and the wall clinch all
    // come through, so it is the only place that lock has to be said here (the ultimate is gated
    // at its own door, `Abilities.tryUlt`).
    if (this.skyfall) return false;
    // ...and THE POLE'S TWO COMMITTED MOVES are on the list with them: the strike and the throw are
    // both short performances with their own clocks and their own contacts (0.80 s and 0.46 s), and
    // a staff that could be cancelled five frames in by a skill would never land the second or third
    // beat of the flurry. THE BALANCE is deliberately NOT here: he is hanging on a stick in the air
    // with a jump button under his thumb, and everything else in the air is still his.
    return st !== "clash" && st !== "smash" && st !== "slam" && st !== "mantle" && st !== "vault" &&
      st !== "launch" && st !== "scissor" && st !== "capo" && st !== "whirl" && st !== "knee" &&
      st !== "grab" && st !== "poleatk" && st !== "polethr" && st !== "lunge" && st !== "wallbeat";
  },

  // The WHIRL's own armor (the user's *"semi-invincibility during the grab portion"*): from the
  // frame the neck is taken to the frame the slam lands, the body rides the move out — the enemy's
  // punch and its shove are both turned away (main.js asks this before either). It is deliberately
  // NOT up during the lunge before the grab: an approach that ate a fist for free would make the
  // whiff unpunishable, and the whiff is half of what the move is (see `updateWhirl`).
  armored() {
    return this.state === "whirl" && this.whirlGrabbed &&
      this.whirlT < P.WHIRL_LUNGE_T + this.whirlScrapeT() + this.whirlSpinT() + P.WHIRL_SLAM_T;
  },

  // The BACKDASH's i-frames (the user's *"it give I Frames for just 0.2 seconds in the middle of
  // its 1 second duration"*). For a fifth of a second, centred on the middle of the FLIP/SPIRAL —
  // the two revolutions the backstep is spent on, which are also the two tenths the brief is
  // about — the body cannot be touched: it rides `armored`'s own path (`damage` and main.js's punch
  // test both ask), so the hit costs neither health nor the shove nor the dash itself, which is the
  // whole point of putting the window in the middle of a move you are committed to.
  invuln() {
    if (this.state !== "dash" || this.dashKind !== 2) return false;
    // Centred on the twist, read off the pose's own beat table so the window can never drift off
    // the shape it is meant to cover (see `backdashBeats`) — and off `lock`, not `turn`: the twist
    // is the window between `coil` and the ROTATION LOCK, and `turn` is a different beat (the feet
    // coming down). Centred on the wrong one, the i-frames would sit over the body's arrival rather
    // than over the revolutions.
    const B = this.backdashBeats();
    const mid = this.qdashTime(2) * (B.coil + B.lock) * 0.5;
    const start = mid - P.QDASH_IFRAME_T * 0.5;
    return this.stateTime >= start && this.stateTime <= start + P.QDASH_IFRAME_T;
  },

  // ---- the ULTIMATE: overdrive ----
  // What the meter buys (see `Abilities.tryUlt`). Everything it does is a multiplier on something
  // that already exists — `moveTarget()` for the speed, `dmgMul()` for the damage, the style
  // multiplier in abilities.js — plus the shock that announces it, which is the biggest one in the
  // game: a forced blast, so the bodies around you are already in the air when the window opens.
  overdrive() {
    this.overT = P.OVER_T;
    // The announcement is the biggest blast in the game — `BLAST_DROP_MAX`, the same blast a slam
    // off a roof makes — fired from where he stands, so the bodies around him are already in the air
    // when the window opens.
    this.dropBlast(P.BLAST_DROP_MAX);
    this.events.push("over");
    this.lastOver = { x: this.pos.x, y: this.pos.y - P.HY, z: this.pos.z, radius: P.BLAST_RADIUS_MAX };
    return true;
  },

  // The damage a strike does right now (overdrive is the only thing that moves it). Read in
  // `attackContact` and `updateClash` so both sides of a lock agree.
  dmgMul() {
    return this.overT > 0 ? 1 + P.OVER_DMG : 1;
  },

  // -------------------------------------------------------------------------
  // THE DROP BLAST — what a GROUND SLAM does to the street.
  //
  // Every landing already has its own thud, squash and dust (`landImpact`, read from the height
  // actually fallen since the top of the airtime). This is the part of that which happens to
  // everybody ELSE, and it belongs to ONE landing only: the ground slam (the user's "the drop has
  // to be ground slam not any drop for it to make a blast"). A plain fall — however far it fell —
  // now lands with its own thud and nothing else; the shockwave is what the slam MEANS, so `update`
  // only ever calls this from the slam's own landing branch.
  //
  // The shock throws the bodies standing around the landing into the air (the user's "the drop
  // impact throws every one into the air like a weak blast"). `drop` is the height actually fallen
  // — the one number the whole feature is built on — and it scales in both directions at once:
  //
  //   WIDTH — `BLAST_RADIUS_MIN`..`BLAST_RADIUS_MAX`, so a landing off a low ledge disturbs what
  //   is standing on top of it and a plunge off a roof reaches right across the street.
  //   FORCE — `BLAST_LIFT_MIN`..`BLAST_LIFT_MAX` (the vertical throw) and
  //   `BLAST_KNOCK_MIN`..`BLAST_KNOCK_MAX` (the radial shove), so a longer drop is a harder blast
  //   (the user's "longer distance im droping the harder the blast").
  //
  // The falloff is radial and smooth, but neither the lift nor the shove falls to zero at the
  // rim: a blast that merely NUZZLED the bodies at its edge would look like a bug rather than an
  // edge of effect, and the user asked for everyone in it to go up. So the lift keeps
  // `BLAST_FALLOFF` of itself and the shove `BLAST_FLOOR` at the rim, which is the difference
  // between "thrown" and "nudged".
  //
  // A body already on the deck or already in the air is included — `force` is what says so (see
  // `hit` in enemies.js: the ragdoll guard is there to stop the CHAIN juggling a body it just
  // threw, not to make a shockwave polite) — and every body caught is re-thrown outward from the
  // landing rather than along the player's facing, because a blast has no facing.
  // -------------------------------------------------------------------------
  dropBlast(drop) {
    if (!this.enemies || !this.enemies.spawned) return;
    if (drop < P.BLAST_DROP_MIN) return;
    const power = Math.min(1, (drop - P.BLAST_DROP_MIN) / (P.BLAST_DROP_MAX - P.BLAST_DROP_MIN));
    const radius = P.BLAST_RADIUS_MIN + (P.BLAST_RADIUS_MAX - P.BLAST_RADIUS_MIN) * power;
    const lift = P.BLAST_LIFT_MIN + (P.BLAST_LIFT_MAX - P.BLAST_LIFT_MIN) * power;
    const knock = P.BLAST_KNOCK_MIN + (P.BLAST_KNOCK_MAX - P.BLAST_KNOCK_MIN) * power;
    const y = this.pos.y - P.HY;
    let caught = 0;
    for (const e of this.enemies.list) {
      if (!e.built) continue;
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      // Two floors (or a roof and the street) apart is not one blast: a body standing on the
      // terrace above where you landed is out of it.
      if (Math.abs(e.pos.y - y) > P.HY * 1.5) continue;
      const ux = d > 0.001 ? dx / d : Math.sin(this.facing);
      const uz = d > 0.001 ? dz / d : Math.cos(this.facing);
      // Smoothstep on the radial falloff, so the near field is thrown hard and the edge eases off
      // instead of the two meeting at a hard rim.
      const f = Math.max(0, 1 - d / radius);
      const fr = f * f * (3 - 2 * f);
      const landed = e.hit("flight", ux, uz, knock * (P.BLAST_FLOOR + (1 - P.BLAST_FLOOR) * fr), P.BLAST_STUN, {
        dmg: P.BLAST_DMG,
        ragdoll: true,
        force: true,
        lift: lift * (P.BLAST_FALLOFF + (1 - P.BLAST_FALLOFF) * fr),
      });
      if (landed) caught++;
    }
    if (!caught) return;
    // The blast is an event like the slam's own (main.js draws the ring, the dust and the shake),
    // and it carries only what the FX and the tuning need: where it is, how wide, how hard.
    this.blast = { x: this.pos.x, y, z: this.pos.z, radius, power, caught };
    this.events.push("dropblast");
  },
};

export function installHealth(Player) {
  Object.assign(Player.prototype, healthMethods);
}
