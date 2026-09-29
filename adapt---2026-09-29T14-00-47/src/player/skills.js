// ---------------------------------------------------------------------------
// THE SKILLS (part 5 of the player.js split).
//
// The three dial skills and the capoeira launch: the whirl (kept whole, unwired), the
// flying knee, the head scissor (clamp + miss + catch) and the capoeira carry/contact.
// Thirty-five methods, verbatim, in a table `installSkills` copies onto
// `Player.prototype`; the scissor's own key-table readers (`scissorSpinAt`,
// `scissorMissFlipAt`, `keyTableAt`) and the whole skills scratch moved with them.
// Part 82 adds `solveCapoCarry(dt, capoPhase)` — THE CARRY's live contact, the last
// thing `updateVisual` writes: the caught body's face pinned to the midpoint of the
// player's two soles, read off the rig after this frame's pose + stretch are spent.
//
// A LEAF with respect to player.js: it imports three.js (the scratch), `P`/`RUN_STRIDE`
// (player/config.js) and the shared math (player/math.js).
// ---------------------------------------------------------------------------
import * as THREE from "../three.js";
import { P, RUN_STRIDE } from "./config.js";
import { SKILL_POSE_FADE, _clinchV, _capoSoleA, _capoSoleB, _capoBoot, _capoHead } from "./pose.js";
import { TAU, approach, wrapPi, smooth01, swingTowards } from "./math.js";

// The scissor clamp's turn: how much of its ONE revolution the rig has wound by `ph` (the clamp's
// own 0..1). A monotonic key table (`P.SCISSOR_SPIN_KEYS`), each segment smoothstepped, so the
// swing has a velocity profile instead of a flat rate: slow while the legs are still travelling
// onto the neck, fastest through the swing, settling square on the last frame — which is the whole
// point of it, because the landing's own feet solve assumes the rig is square again when it opens.
function scissorSpinAt(ph) {
  return keyTableAt(P.SCISSOR_SPIN_KEYS, ph);
}

// ...and the whiff's own version of it (session 191 — see `SCISSOR_MISS_FLIP`): how much of the
// front somersault the body has wound by `u`, 0..1 of the whole revolution BY 0..1 of the AIRTIME.
//
// It is a pure read of the hang rather than of the clamp's own clock, because the two are different
// lengths: the leap's airtime is 0.58 s and the clamp only covers the back half of it, so a table
// keyed on the clamp would have the body already square while it was still coming down. Slow off the
// deck (the body has just left it), fastest through the middle, and SQUARE and holding by 0.90 —
// which is what lets the deck phase open on a still body instead of catching it mid-turn (see
// `tickMissFlip`). `SCISSOR_MISS_FLIP` is the whole revolution it is multiplied by.
function scissorMissFlipAt(u) {
  return keyTableAt(P.SCISSOR_MISS_FLIP_KEYS, u);
}

// The one reader both of the above go through: a monotonic key table ([t, value] pairs in ascending
// t), each segment smoothstepped so the channel has a velocity profile rather than a flat rate,
// clamped at both ends and holding the last value past the end. `SCISSOR_SPIN_KEYS` and
// `SCISSOR_MISS_FLIP_KEYS` are the two tables it draws.
function keyTableAt(K, t0) {
  const t = t0 <= 0 ? 0 : t0 >= 1 ? 1 : t0;
  for (let i = 0; i < K.length - 1; i++) {
    const a = K[i];
    const b = K[i + 1];
    if (t <= b[0]) return a[1] + (b[1] - a[1]) * smooth01((t - a[0]) / Math.max(1e-4, b[0] - a[0]));
  }
  return K[K.length - 1][1];
}

// The HAUL's own scratch point: the dragged body's head, read off its rig for the dust the scrape
// kicks up (see `updateWhirl` / `lastWhirlScrape`).
const _whirlV = new THREE.Vector3();
// The FLYING KNEE's own scratch pair (see `kneeContact`): the strike knee's world point, read off
// the rig's own shin bone — the joint `legLowerL` hangs off `legUpperL` at IS the knee — and the
// head of the body it is being read against. Two scratches because the test needs both at once.
const _kneeV = new THREE.Vector3();
const _kneeH = new THREE.Vector3();
// The scissor clamp's own scratch: the contact the legs are on, the point it is travelling from,
// the hips' own offset inside the rig, and the rotation that carries both (`scissorAnchor`).
const _scA = new THREE.Vector3();
const _scB = new THREE.Vector3();
const _scC = new THREE.Vector3();
const _scOff = new THREE.Vector3();
const _scQ = new THREE.Quaternion();
const _scE = new THREE.Euler();
const _scM = new THREE.Matrix4();

const skillMethods = {

  // A fist caught on the GUARD (skill 2's first phase). Called from the enemy's own contact test,
  // which is why it RETURNS whether it caught it: true means the caller drops its own hit entirely.
  //
  // This is the COUNTER the user asked for ("make it also a counter if he gets hit he blocks then
  // does the move"): a punch that lands inside the guard is BLOCKED — no damage, no shove, and the
  // body that threw it is staggered by its own swing — and the move then turns straight onto it.
  // Nothing here has to START the scissor, because the guard IS the scissor's first phase: all
  // this does is cut the rest of the guard, aim the leap, and hand it the neck.
  scissorCatch(e, dx, dz) {
    if (this.blockT <= 0) return false;
    this.blockT = 0;
    if (e && e.built) e.hit("fold", dx, dz, P.SCISSOR_BLOCK_SHOVE, P.SCISSOR_BLOCK_STUN, { dmg: 0 });
    this.lastBlock = { x: this.pos.x + dx * 0.55, y: this.pos.y + 0.34, z: this.pos.z + dz * 0.55, e: e || null };
    this.events.push("block");
    if (this.state === "scissor") {
      this.scissorCounter = e || null;
      this.scissorTarget = e || this.scissorTarget;
      // The rest of the guard is dropped — the block has already happened, and a window that stayed
      // open after catching one fist would swallow the next one too (measured: at half the guard
      // there were still 0.13 s of it left, which is a second free block).
      this.scissorT = Math.max(this.scissorT, P.SCISSOR_GUARD_T * 0.98);
      const ax = e.pos.x - this.pos.x;
      const az = e.pos.z - this.pos.z;
      if (Math.hypot(ax, az) > 0.25) this.facing = Math.atan2(ax, az);
    }
    return true;
  },

  // =========================================================================
  // SKILL 1 — THE WHIRL, as the LETHAL WHIRLWIND STREAM: a LUNGE that takes a neck, a WHIRLWIND
  // that drags the body round the floor, a SLAM that drives it into the deck, and a LAUNCH that
  // pops the wreckage back into the air.
  //
  // The user's words, in three goes. First: *"the player spins and picks the enemy by the neck and
  // runs with him across the floor then throwing him away"*. Then the whole move: *"The user
  // lunges forward and grabs the opponent by the neck. They drag the opponent roughly across the
  // ground in a spinning/whirlwind motion (hence the name). The user then violently slams them
  // down into the ground. The opponent is launched upward into a ragdoll state after the slam."*
  // And then, later, the beat that was missing between the first two: *"add a part for skill 1
  // between the 1st part and the 2nd part where he drags the enemy head across the ground"* — the
  // HAUL below.
  // Plus the three things the description calls out that are NOT the spin itself: the grab portion
  // is ARMORED (`armored`), a slam thrown out of the AIR hits harder (the "webby smash" —
  // `whirlAerial`), and a body already under `WHIRL_FINISH_HP` takes the ELBOW instead of the
  // launch (the finisher).
  //
  // Five phases on one clock (`whirlPhase` / `whirlTotal`):
  //
  //   LUNGE  he drives IN along his facing (`WHIRL_LUNGE_V`) and the hand closes on the first
  //          frame a neck is inside the wedge — tested on EVERY frame of the lunge rather than on
  //          one key, because the lunge IS the grab attempt and nothing else. Whatever it finds is
  //          taken with the CLINCH's own reaction (the haul that drags a body in by the head),
  //          written LONG and at arm's length (`grabDist`), which also lifts the reaction's own
  //          release beat (see the haul in enemies.js) so the hands do not let go halfway.
  //   HAUL   the body is DRIVEN DOWN onto the deck and dragged across it head-first — the user's
  //          *"drags the enemy head across the ground"* — while he strides into it, still holding
  //          the neck. The hold's own keyed path does the laying-out (`whirlHoldKeys`: the body is
  //          turned flat at `WHIRL_SKIM_LAY` and its lowest point put on the pavement), and the
  //          phase is the WALK: `WHIRL_SCRAPE_V`, the run cycle advanced off the speed actually
  //          travelled, plus the chip the deck takes off the body (`WHIRL_SCRAPE_DPS`) and the dust
  //          the scrape kicks up (main.js, off `lastWhirlScrape`).
  //   WHIRL  the WHIRLWIND: the whole rig turns `WHIRL_TURNS` revolutions on the vertical axis
  //          while he travels forward, and the body in his hand is SWUNG — it is PLACED on the
  //          orbit in front of the rig (`carryOrbit` in enemies.js), skimming the deck, so the
  //          arm, the body and the line he is whirling on are all the same line through the turn.
  //   SLAM   the whirl hoists the body over his head and drives it into the deck (the fling's own
  //          keyed path carries it up and down — see `whirlHoldKeys`). The impact is a
  //          real one — a `slam` reaction with the slam's damage on it, so main.js draws its own
  //          shockwave and dust and the deck cracks under it — and it lands `WHIRL_SLAM_HIT` of the
  //          way through the phase, so the pose can follow the drive all the way down into it.
  //   LAUNCH the body comes out of the crater into the air: a `flight` with a RAGDOLL on it (the
  //          user's *"launched upward into a ragdoll state after the slam"*).
  //
  // ...and a lunge that finds nothing is a WHIFF: no drag, no slam, no launch — the spin runs out
  // over `WHIRL_RECOVER_T` and nothing else happens (the user's *"the startup animation playing
  // out with no follow-through"*). The armor is not up for a whiff either (it never got its grab)
  // and the move is on cooldown just the same.
  //
  // It is CANCELABLE, which is the user's own first word about it: a second press of the same key
  // (nothing else reads one) and any of the other actions end the move and DROP the body — see the
  // cancel block in `updateWhirl`.
  // =========================================================================
  whirl() {
    if (this.state === "whirl") {
      // A second press IS the cancel. Before the commit window it is swallowed: one mash must not
      // be able to throw the grab away on the frame it was made.
      if (this.whirlT >= P.WHIRL_CANCEL) this.endWhirl(true);
      return true;
    }
    if (this.whirlCd > 0) return false;
    if (!this.canSkill()) return false;
    if (this.overT <= 0) this.whirlCd = P.WHIRL_CD;
    // The LUNGE drives along the FACING — and, since a skill locks the run (see the facing chain in
    // `update`), the facing is the CAMERA's. So the opening is a REACH aimed with the camera and
    // nothing else: no stick, no snap. The PAN carries him round onto the aim over the start of the
    // move, which is what makes a lunge pressed on a stale aim curve in rather than turn on the spot.
    // The press itself opens the COIL, not the drive (see `WHIRL_COIL_MUL`): the burst belongs to
    // `updateWhirl`, which fires it once the wind-up is over. Handing the whole `WHIRL_LUNGE_V` over
    // here blew the wind-up away entirely — the man crossed a body's standing distance during the
    // coil, before the reach had even opened, and the grab whiffed every time.
    const sp0 = Math.hypot(this.vel.x, this.vel.z);
    const coil = P.WHIRL_LUNGE_V * P.WHIRL_COIL_MUL;
    const k0 = Math.min(1, coil / Math.max(1e-3, sp0));
    this.vel.x *= k0;
    this.vel.z *= k0;
    this.setState("whirl");
    this.whirlT = 0;
    this.whirlTarget = null;
    this.whirlGrabbed = false;
    this.whirlAerial = !this.grounded;
    this.whirlSlamDone = false;
    this.whirlLaunched = false;
    this.whirlElbow = false;
    this.whirlHold = 0;
    this.whirlSpin = 0;
    this.whirlSpin0 = 0;
    this.whirlR0 = 0;
    this.whirlStride = 0;
    this.attackBuf = 0;
    if (this.sfx && this.sfx.dive) this.sfx.dive();
    this.events.push("whirl");
    return true;
  },

  // The one wedge test the lunge makes, run on EVERY frame of it: a body inside the arc, at neck
  // height. The first one it finds is taken and the hand is closed for the rest of the move.
  whirlGrab() {
    if (!this.enemies || !this.enemies.spawned) return;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const hits = this.enemies.inFront(this.pos.x, this.pos.z, fx, fz, P.WHIRL_REACH, P.WHIRL_ARC,
      [this.pos.y - P.HY - P.WHIRL_DOWN, this.pos.y + P.HY + P.WHIRL_UP]);
    for (const e of hits) {
      if (e.ragdoll) continue;
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1e-3;
      const landed = e.hit("clinch", dx / d, dz / d, 1.2, P.WHIRL_HOLD, { dmg: P.WHIRL_GRAB_DMG });
      if (!landed) continue;
      // The two overrides that make the clinch's haul into a NECK CARRY: held out at arm's length
      // rather than dragged into his chest, and held for the whole of the move (the haul's own
      // release beat would otherwise have the hands off it halfway through).
      e.grabDist = P.WHIRL_DIST;
      e.grabT = Math.max(e.grabT, P.WHIRL_HOLD);
      // ...and the SHAPE it is dragged in is not the clinch's. The clinch is a BEAT — head taken,
      // trunk hauled over, KNEE DRIVEN IN — and the whirl runs it for a second and a half, so the
      // body being whirled was getting kneed halfway round the floor. `whirlDrag` is the shape the
      // haul was always missing: a body held low by the throat and skinned along the deck (see
      // `poseHurtWhirlDrag`). The reaction and its clock are untouched — only the shape worn.
      e.hurtKind = "whirlDrag";
      e.scrapeT = 0;
      this.whirlTarget = e;
      this.whirlGrabbed = true;
      // ...and where the orbit STARTS: the angle the body is actually at, relative to the facing
      // the neck was taken on, and how far away it was. Starting the whirl from THERE rather than
      // from zero is what keeps the first frame of the drag from teleporting it round to his front.
      this.whirlSpin0 = wrapPi(Math.atan2(dx, dz) - this.facing);
      this.whirlSpin = this.whirlSpin0;
      this.whirlR0 = d;
      // ...and where the HOLD opens: the height the body's own origin is at on the frame it is
      // taken, and the whole-rig angle it is already wearing. `whirlR0` above is the third of the
      // three (`updateWhirl` places the body by its own origin, so those are what it needs). The
      // angle is read live off the rig, and the height off its own `pos`, which is what the first
      // key of the hold's path opens on — so the whirlwind starts from where the body ACTUALLY is
      // and the grab hands over without the body jumping off the deck into the air.
      this.whirlOriginY0 = Math.max(0.05, e.pos.y - (this.pos.y - P.HY));
      this.whirlLay0 = wrapPi(e.pitch);
      this.lastWhirl = { x: e.pos.x, y: e.pos.y + 1.3, z: e.pos.z, e };
      this.events.push("whirlgrab");
      this.hitstop = Math.max(this.hitstop, P.WHIRL_STOP);
      break;
    }
  },

  // THE SLAM: the body is driven into the deck. It is the game's own `slam` reaction — the state a
  // flight lands in — with the slam's damage on it, so main.js draws its usual shockwave and dust
  // and the deck cracks under it like anything else. The AERIAL slam is the heavier one, and a body
  // already under `WHIRL_FINISH_HP` heavier still and marked for the elbow (see `whirlLaunch`).
  whirlSlam() {
    const e = this.whirlTarget;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const finish = !!(e && e.built && e.hp01 <= P.WHIRL_FINISH_HP);
    this.whirlElbow = finish;
    const dmg = finish ? P.WHIRL_SLAM_DMG * 1.5
      : this.whirlAerial ? P.WHIRL_SLAM_DMG_FAST : P.WHIRL_SLAM_DMG;
    if (e && e.built) {
      const landed = e.hit("slam", fx, fz, P.WHIRL_SLAM_SHOVE, P.WHIRL_HOLD, { dmg, force: true });
      this.lastWhirlSlam = {
        x: e.pos.x, y: this.pos.y - P.HY + 0.12, z: e.pos.z,
        power: landed ? (finish ? 1.3 : this.whirlAerial ? 1.15 : 1) : 0.5,
        fast: this.whirlAerial, finish, e,
      };
      if (landed) this.hitstop = Math.max(this.hitstop, P.WHIRL_STOP * 2.2);
    } else {
      this.lastWhirlSlam = { x: this.pos.x + fx * 0.9, y: this.pos.y - P.HY + 0.12, z: this.pos.z + fz * 0.9, power: 0.4, fast: false, finish: false, e: null };
    }
    this.events.push("whirlslam");
  },

  // THE LAUNCH (or, on a body already finished, THE ELBOW). The ordinary exit is the user's
  // *"launched upward into a ragdoll state after the slam"* — a `flight` with a ragdoll on it and
  // `WHIRL_LAUNCH_UP` of pop. The FINISHER instead follows the slam with an elbow driven straight
  // back down into it, and the body is left in the crater where the elbow put it.
  whirlLaunch() {
    const e = this.whirlTarget;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const elbow = this.whirlElbow;
    this.whirlTarget = null;
    this.whirlHold = 0;
    if (e && e.built) {
      e.carryOrbit = null;
      e.grabT = 0;
      e.grabDist = null;
      if (elbow) {
        const landed = e.hit("slam", fx, fz, P.WHIRL_SLAM_SHOVE * 0.6, P.WHIRL_LAUNCH_STUN,
          { dmg: P.WHIRL_ELBOW_DMG, force: true });
        this.lastWhirlLaunch = { x: e.pos.x, y: this.pos.y - P.HY + 0.12, z: e.pos.z, power: landed ? 1 : 0.4, elbow: true, e };
        if (landed) this.hitstop = Math.max(this.hitstop, P.WHIRL_STOP * 2.2);
      } else {
        // ...and the AERIAL slam's own follow-through (the user's "Webby Smash": the slam thrown out
        // of the air). Its damage already comes from `whirlSlam`; what the user says it changes here
        // is the HEIGHT and the SPEED of the launch, so the body is thrown harder and further off
        // the same slam.
        const aerial = this.whirlAerial;
        const up = P.WHIRL_LAUNCH_UP * (aerial ? 1.25 : 1);
        const knock = P.WHIRL_LAUNCH_KNOCK * (aerial ? 1.3 : 1);
        const landed = e.hit("flight", fx, fz, knock, P.WHIRL_LAUNCH_STUN,
          { ragdoll: true, force: true, lift: up });
        this.lastWhirlLaunch = { x: e.pos.x, y: e.pos.y + 1.0, z: e.pos.z, power: landed ? 1 : 0.4, elbow: false, e };
        if (landed) this.hitstop = Math.max(this.hitstop, P.WHIRL_STOP * 1.8);
      }
    } else {
      this.lastWhirlLaunch = { x: this.pos.x + fx * 0.8, y: this.pos.y - P.HY + 0.12, z: this.pos.z + fz * 0.8, power: 0.4, elbow: false, e: null };
    }
    this.events.push("whirllaunch");
  },

  // How long the move runs: the four phases when it has a body, and the three a whiff gets (the
  // lunge, a shorter spin, and a tail — no slam and no launch). These are the user's own two
  // clocks: 1.55 s with a body in his hands, 1.10 s with nothing in them.
  whirlTotal() {
    const d = P.WHIRL_LUNGE_T;
    return this.whirlGrabbed
      ? d + this.whirlScrapeT() + P.WHIRL_DRAG_T + P.WHIRL_SLAM_T + P.WHIRL_LAUNCH_T
      : d + P.WHIRL_MISS_SPIN_T + P.WHIRL_RECOVER_T;
  },

  // ...and how long the SPIN itself lasts, which is the one phase whose length depends on whether
  // the hand closed: a body is whirled for `WHIRL_DRAG_T`, a whiff spins `WHIRL_MISS_SPIN_T`.
  whirlSpinT() {
    return this.whirlGrabbed ? P.WHIRL_DRAG_T : P.WHIRL_MISS_SPIN_T;
  },

  // ...and the HAUL's own length, which is the beat only a BODY buys: a whiff has nothing to drag
  // across the floor, so its clock is untouched and its three beats still run end to end.
  whirlScrapeT() {
    return this.whirlGrabbed ? P.WHIRL_SCRAPE_T : 0;
  },

  // Which phase `whirlT` is in, and how far into it (0..1). 0 lunge, 6 the HAUL, 1 whirlwind,
  // 2 slam, 3 launch, 4 the whiff's own tail, 5 the finisher's elbow. The pose and the impacts are
  // the same read of this clock, so a shape can never drift from the phase that owns it.
  whirlPhase() {
    const l = P.WHIRL_LUNGE_T;
    const scrap = this.whirlScrapeT();
    const drag = this.whirlSpinT();
    const haul = l + scrap;
    const d = haul + drag;
    if (this.whirlT < l) return { phase: 0, ph: this.whirlT / Math.max(1e-3, l) };
    if (this.whirlT < haul) return { phase: 6, ph: (this.whirlT - l) / Math.max(1e-3, scrap) };
    if (this.whirlT < d) return { phase: 1, ph: (this.whirlT - haul) / Math.max(1e-3, drag) };
    if (!this.whirlGrabbed) return { phase: 4, ph: (this.whirlT - d) / Math.max(1e-3, P.WHIRL_RECOVER_T) };
    if (this.whirlT < d + P.WHIRL_SLAM_T) {
      return { phase: 2, ph: (this.whirlT - d) / Math.max(1e-3, P.WHIRL_SLAM_T) };
    }
    const s = d + P.WHIRL_SLAM_T;
    return {
      phase: this.whirlElbow ? 5 : 3,
      ph: (this.whirlT - s) / Math.max(1e-3, P.WHIRL_LAUNCH_T),
    };
  },

  // How hard the move's own blue energy is burning at this frame (0..1), fed to `effects.whirlAura`
  // by main.js. The user's note is the whole spec: "blue energy effects are strongest during the
  // spin and slam". It is a phase read rather than a curve of its own, so it can never disagree
  // with the animation, and it is NON-ZERO on the whiff too — a miss still throws the energy out,
  // it just never gets to the slam.
  whirlEnergy() {
    if (this.state !== "whirl") return 0;
    const wp = this.whirlPhase();
    const t = this.whirlT;
    const l = P.WHIRL_LUNGE_T;
    const d = l + this.whirlScrapeT() + this.whirlSpinT();
    const s = d + P.WHIRL_SLAM_T;
    if (wp.phase === 0) {
      // The wind-up: the energy FORMS around the hands (the user's stage 1) — nothing to nothing.
      const k = Math.min(1, t / Math.max(1e-3, l * P.WHIRL_STARTUP));
      return 0.24 + 0.46 * k;
    }
    // ...and the HAUL: the energy SURGING with the drag — it is weaker than the spin because the
    // move is still on the floor, and it winds UP through the beat so the whirlwind's own 0.95
    // reads as the release it is.
    if (wp.phase === 6) return 0.66 + 0.22 * wp.ph;
    if (wp.phase === 1) return 0.95;                       // the spin: strongest
    if (wp.phase === 2) return wp.ph < P.WHIRL_SLAM_HIT ? 1 : 0.9;
    if (wp.phase === 3) return 0.85 * (1 - Math.min(1, wp.ph / 0.66));  // released, fading
    if (wp.phase === 5) return 0.9;
    return Math.max(0, 0.7 * (1 - Math.min(1, (t - d) / Math.max(1e-3, P.WHIRL_RECOVER_T * 0.7))));
  },

  // ...and letting go: clears the hold off the body (the orbit, the haul and the stun in one
  // place), so every way out of the move releases the neck the same way. Called by `endWhirl` and
  // by the state machine when something else takes the body out of a running whirl.
  releaseWhirl() {
    const e = this.whirlTarget;
    if (e && e.built) {
      e.carryOrbit = null;
      e.grabT = 0;
      e.grabDist = null;
    }
    this.whirlTarget = null;
    this.whirlHold = 0;
  },

  // Out of the whirl — launched, cancelled, or run out. A CANCELLED one drops the body where it is
  // with nothing more than the shove it was already carrying, so a cancel is not a way to hold
  // someone forever; the launch and the slam belong to the move.
  endWhirl(cancel) {
    const e = this.whirlTarget;
    if (e && e.built) {
      e.carryOrbit = null;
      e.grabT = 0;
      e.grabDist = null;
      if (cancel) {
        const dx = e.pos.x - this.pos.x;
        const dz = e.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1e-3;
        e.hit("fold", dx / d, dz / d, 1.6, 0.5, { dmg: 0 });
      }
    }
    this.whirlTarget = null;
    this.whirlHold = 0;
    this.setState(this.grounded ? "ground" : "air");
  },

  // The whirl's own clock (see the block above).

  // The HOLD's own path — the (orbit radius, orbit height, lay-out angle, roll) the whirlwind
  // carries the body at, keyed on `h`, the move's own clock from the lunge's end to the impact (see
  // the long note in `updateWhirl`, which is where the shape of it and the reason for every key is).
  // Read it as the move's three shapes: the HAUL (the body laid out FACE-DOWN and skinned along the
  // deck), the BEYBLADE (the same body ROLLED 180° about its own length — `WHIRL_TOP_FLIP`, the
  // user's own number — so it lies face-UP with its head still swung in under the player's boots,
  // where the whole spin happens), and then the short hoist and the drive that smash it into the
  // pavement. The ROLL is the rig's own Y rather than its pitch (`enemies.js`), which is what makes
  // it a turn-over instead of the head-to-feet swap a pitched-out lie would be.
  whirlHoldKeys() {
    return [
      [0.00, this.whirlR0, this.whirlOriginY0, this.whirlLay0, 0],
      [0.16, P.WHIRL_SKIM_R, P.WHIRL_SKIM_Y, P.WHIRL_SKIM_LAY, 0],
      [0.42, P.WHIRL_SKIM_R, P.WHIRL_SKIM_Y, P.WHIRL_SKIM_LAY, 0],
      [0.56, P.WHIRL_TOP_R, P.WHIRL_TOP_Y, P.WHIRL_TOP_LAY, P.WHIRL_TOP_FLIP],
      [0.80, P.WHIRL_TOP_R, P.WHIRL_TOP_Y, P.WHIRL_TOP_LAY, P.WHIRL_TOP_FLIP],
      [0.90, P.WHIRL_HOIST_R, P.WHIRL_HOIST_Y, P.WHIRL_HOIST_LAY, P.WHIRL_TOP_FLIP],
      [1.00, P.WHIRL_DRIVE_R, P.WHIRL_DRIVE_Y, P.WHIRL_DRIVE_LAY, P.WHIRL_TOP_FLIP],
    ];
  },

  updateWhirl(dt, inp) {
    this.whirlT += dt;
    const lungeEnd = P.WHIRL_LUNGE_T;
    const haulEnd = lungeEnd + this.whirlScrapeT();
    const dragEnd = haulEnd + this.whirlSpinT();
    const slamEnd = dragEnd + P.WHIRL_SLAM_T;
    const impactT = dragEnd + P.WHIRL_SLAM_T * P.WHIRL_SLAM_HIT;
    const e = this.whirlTarget;
    const smooth = (k) => { const t = Math.max(0, Math.min(1, k)); return t * t * (3 - 2 * t); };
    // The hold's own weight, for the pose: it comes on as the hand closes and falls off when the
    // move LETS GO of him — which is the launch, not the slam. It is deliberately not read off the
    // victim's own stun: the slam's reaction clears the grab the frame it lands, and the hand has
    // to stay on the throat through the drive (the user's "right arm extends fully downward while
    // still holding the neck"). The fall is also eased slower than the close, so letting go of a
    // body is a release rather than a snap.
    const want = (e && e.built && this.whirlT < slamEnd) ? 1 : 0;
    const holdRate = want > (this.whirlHold || 0) ? 0.07 : 0.16;
    this.whirlHold = (this.whirlHold || 0) + (want - (this.whirlHold || 0)) * Math.min(1, dt / holdRate);

    if (this.whirlT < lungeEnd) {
      // THE STARTUP AND THE LUNGE. The reach is tested on every frame of the DRIVE — but not of
      // the wind-up: the user's stage 1 is the coil ("right arm swings back and upward, elbow bent
      // ~90°") and the hand goes out for the throat only once it is over. Testing from frame one
      // meant a body standing close enough was taken on the very frame the move started, which
      // skipped the startup entirely — the one beat the move opens on.
      const ph = this.whirlT / Math.max(1e-3, lungeEnd);
      if (ph >= P.WHIRL_STARTUP && !this.whirlTarget) this.whirlGrab();
      const fx = Math.sin(this.facing);
      const fz = Math.cos(this.facing);
      // The drive: the coil is a COIL, and the power comes off it. The wind-up holds the man to a
      // crawl (`WHIRL_COIL_MUL` of the drive — he is loading, not travelling), and the reach
      // OPENS with the drive, so the whole of the closing burst happens inside the grab window.
      // That order matters and it is why this is a two-piece ramp rather than one `smooth`: with the
      // drive ramping in from the first frame the man covers the body's whole standing distance
      // DURING the coil, and the grab — which may not test until `WHIRL_STARTUP` is over — opens on
      // a body already behind him (measured: at the old ramp the 1.6 u gap was gone by the frame the
      // reach opened, and the move whiffed every time at the new `WHIRL_LUNGE_V`). It bleeds off at
      // the end so the grab lands on a body rather than carrying him through it.
      const su = Math.max(1e-3, P.WHIRL_STARTUP);
      let drive = ph < su
        ? P.WHIRL_LUNGE_V * P.WHIRL_COIL_MUL * smooth(ph / su)
        : P.WHIRL_LUNGE_V * (1 - 0.55 * ((ph - su) / Math.max(1e-3, 1 - su)));
      // ...and the moment the neck is TAKEN the lunge is over: the drive collapses onto the haul's
      // own speed, so the burst throws him AT a body and not through it. Without this the grab
      // landed and the man kept the whole `WHIRL_LUNGE_V` into the drag, which read as him running
      // past the body he was holding.
      const gripped = !!this.whirlTarget;
      let accel = P.WHIRL_LUNGE_ACCEL;
      if (gripped) { drive = Math.min(drive, P.WHIRL_SCRAPE_V); accel = P.WHIRL_GRIP_BRAKE; }
      this.vel.x = approach(this.vel.x, fx * drive, accel * dt);
      this.vel.z = approach(this.vel.z, fz * drive, accel * dt);
      this.whirlSpin = this.whirlSpin0;
    } else if (this.whirlT < haulEnd) {
      // THE HAUL — the user's *"drags the enemy head across the ground"*. The body has just been
      // driven onto the deck: the hold's own first key does that (it lays the body out flat at
      // `WHIRL_SKIM_LAY` and puts its lowest point on the pavement — see `whirlHoldKeys`). What is
      // left is the DRAG, and it is a STRIDE rather than a spin: he bores in on a heavy, forward
      // walk and the body is hauled across the deck in front of him, head-first, with a hand still
      // on the neck. The run cycle is advanced off the speed ACTUALLY travelled (so the haul never
      // skates, exactly like the whirlwind's own) and drawn at `WHIRL_SKIM_BRACE`, a shorter
      // stride than the spin's — a man leaning on something heavy does not bound.
      const fx = Math.sin(this.facing);
      const fz = Math.cos(this.facing);
      this.vel.x = approach(this.vel.x, fx * P.WHIRL_SCRAPE_V, 22 * dt);
      this.vel.z = approach(this.vel.z, fz * P.WHIRL_SCRAPE_V, 22 * dt);
      this.whirlStride = (this.whirlStride + (Math.hypot(this.vel.x, this.vel.z) / RUN_STRIDE) * dt) % 1;
      this.whirlSpin = this.whirlSpin0;
      // ...and what the pavement takes off the body while it is skinned along it. It is a CHIP
      // rather than a reaction on purpose: the body is being dragged, not struck, and anything
      // that put a `hit` on it here would take it off the move's own orbit (the orbit is written
      // from this same clock) — so the damage goes straight onto the health with the flash and the
      // dust of a scrape, and the hold is left alone.
      if (e && e.built && e.grabT > 0) {
        e.hp = Math.max(0, e.hp - P.WHIRL_SCRAPE_DPS * dt * (this.overT > 0 ? 2 : 1));
        e.flash = Math.max(e.flash || 0, 0.55);
        e.scrapeT = (e.scrapeT || 0) + dt;
        if (e.scrapeT >= P.WHIRL_SCRAPE_PUFF) {
          e.scrapeT = 0;
          if (e.headPoint) {
            e.headPoint(_whirlV);
            this.lastWhirlScrape = { x: _whirlV.x, y: this.pos.y - P.HY + 0.06, z: _whirlV.z, e };
            this.events.push("whirlscrape");
          }
        }
      }
    } else if (this.whirlT < dragEnd) {
      // THE WHIRLWIND. The rig turns `WHIRL_TURNS` whole revolutions, he travels forward along his
      // facing — the STICK does nothing here (a skill locks the run); the camera is the only thing
      // that steers it, through the facing pan in `update` — and the body in his hand rides the
      // SAME angle: it is placed on the orbit below, so it stays in front of the rig through the
      // whole turn and the reach never has to chase it round the outside (which is what the haul
      // alone could never do).
      // The phase clock runs off the END OF THE HAUL, not the end of the lunge: the haul is a beat
      // that was inserted between the lunge and the spin (session 62), and this line was the one
      // place that was not moved with it — measured, `ph` was already 1.01 on the spin's FIRST
      // frame, so `smooth` clamped it to 1 and the rig jumped straight to the whole `WHIRL_TURNS`
      // worth of turn and sat there. Four whole turns is visually identical to zero, which is why
      // the whirlwind silently played as a forward walk. (A whiff has no haul — `whirlScrapeT()`
      // is 0 — so `haulEnd === lungeEnd` for it and this reads the same as the other beats.)
      const ph = (this.whirlT - haulEnd) / Math.max(1e-3, this.whirlSpinT());
      this.whirlSpin = this.whirlSpin0 + Math.PI * 2 * P.WHIRL_TURNS * smooth(ph);
      const fx = Math.sin(this.facing);
      const fz = Math.cos(this.facing);
      const target = e ? P.WHIRL_DRAG_V : P.WHIRL_DRAG_V * 0.7;
      this.vel.x = approach(this.vel.x, fx * target, 26 * dt);
      this.vel.z = approach(this.vel.z, fz * target, 26 * dt);
      // The run cycle, advanced off the speed actually being run, so the whirlwind never skates.
      this.whirlStride = (this.whirlStride + (Math.hypot(this.vel.x, this.vel.z) / RUN_STRIDE) * dt) % 1;
      if (e && (!e.built || e.grabT <= 0)) this.whirlTarget = null;
    } else {
      // THE SLAM, THE RELEASE AND AFTER. He PLANTS: the drive is shed in a couple of frames, and
      // what is left is the pose's own hoist and drive, which the orbit below rides. Then, on the
      // RELEASE, the user's "steps back slightly": a short push AWAY along his own facing while the
      // arm follows through, which is a step and not a slide because the pose is standing up out
      // of the fold at the same time.
      const drag = this.grounded ? 12 : 2;
      this.vel.x = approach(this.vel.x, 0, drag * dt);
      this.vel.z = approach(this.vel.z, 0, drag * dt);
      if (this.whirlT >= slamEnd) {
        const back = -P.WHIRL_STEPBACK * (1 - Math.min(1, (this.whirlT - slamEnd) / Math.max(1e-3, P.WHIRL_LAUNCH_T * 0.7)));
        this.vel.x = approach(this.vel.x, Math.sin(this.facing) * back, 12 * dt);
        this.vel.z = approach(this.vel.z, Math.cos(this.facing) * back, 12 * dt);
      }
    }
    // Past the whirl the rig holds the whole-turn angle it finished the drag on, so the slam comes
    // down square to the line the body was being whirled on.
    if (this.whirlT >= dragEnd) this.whirlSpin = this.whirlSpin0 + Math.PI * 2 * P.WHIRL_TURNS;

    // ---- the ORBIT: where the body in his hand actually IS ----
    // The whole reason the whirl reads is that the BODY goes round with the rig rather than being
    // dragged behind it: the haul in enemies.js can only pull a body toward its carrier, and a
    // running arm never gets its hand back onto a neck that is going round the outside. So a
    // carried body is PLACED on the rig's own line every frame (`carryOrbit`).
    //
    // THE BEYBLADE — the whirlwind's own hold, and the thing that makes the second phase read as
    // SPINNING ON A BODY rather than whirling one around: the body is torn off the haul, ROLLED
    // OVER 180° about its own length and pinned on the deck UNDER the boots, and the man spins on
    // it like a top (see `WHIRL_TOP_*`). Because the placement is built off `facing + whirlSpin`
    // the body is carried round WITH him, so it stays squared under his stance for the whole spin
    // rather than orbiting out from under him. It is laid out about its own root and its own roll
    // (`carryOrbit.lay` and `carryOrbit.flip`, assigned to the rig in enemies.js, where the whole
    // rig angle has always been written), so the spin happens with both bodies stacked: the player
    // upright and whipping round, the body flat and grinding under his feet.
    //
    // ONE keyed path runs the whole hold, from the frame the neck is taken to the frame it is
    // driven into the deck — `whirlHoldKeys`, and the reason for every key is at the constants:
    //
    //   h 0.00   where the body ACTUALLY was on the frame it was taken (its radius off the man,
    //            its own height, and the whole-rig angle it already wore) — so the grab hands over
    //            without a jump, which is the entire reason those three are read live in `whirlGrab`
    //   h 0.16   HAULED: flat, face-down, skinned along the deck
    //   h 0.42   ...held there for the whole of the haul beat
    //   h 0.56   ROLLED OVER 180° about its own length and pulled in UNDER the boots (the head
    //            swinging in behind the player's heels and the body lying out in front of them) —
    //            where the whole of the spin happens
    //   h 0.80   ...held there for the whole of the spin
    //   h 0.90   HOISTED a little way up off the pavement (the short "Slam Preparation"), tipped so
    //            it is the HEAD — the end under the boots — that comes up first
    //   h 1.00   DRIVEN straight back down onto the deck — the impact, `WHIRL_SLAM_HIT`
    //
    // `h` is the move's own clock (the lunge's end to the impact), so the hold's shape and the
    // move's beats are the same read. The rig's own angle — and its own ROLL — are ASSIGNED rather
    // than eased (see `enemies.js`): where the body points is part of where it IS, not a reaction to
    // recover from.
    if (e && e.built && e.grabT > 0 && this.whirlT < impactT) {
      const ang = this.facing + this.whirlSpin;
      const deck = this.pos.y - P.HY;
      const h = Math.max(0, Math.min(1, (this.whirlT - lungeEnd) / Math.max(1e-3, impactT - lungeEnd)));
      const keys = this.whirlHoldKeys();
      let r = 0, y = 0, lay = 0, flip = 0;
      for (let i = 1; i < keys.length; i++) {
        if (h <= keys[i][0] || i === keys.length - 1) {
          const k0 = keys[i - 1], k1 = keys[i];
          const s = k1[0] - k0[0] < 1e-6 ? 1 : smooth((h - k0[0]) / (k1[0] - k0[0]));
          r = k0[1] + (k1[1] - k0[1]) * s;
          y = k0[2] + (k1[2] - k0[2]) * s;
          lay = k0[3] + (k1[3] - k0[3]) * s;
          flip = k0[4] + (k1[4] - k0[4]) * s;
          break;
        }
      }
      // ...and the body's own SHAPE clock, which is the move's rather than the enemy's (see
      // `poseHurtWhirlDrag`): the SKIM runs across the HAUL (a body being dragged flat along the
      // deck), the drag's own held shape across the spin (the body still limp and trailing — it is
      // the ORBIT that has rolled it over and pinned it, not the pose), the HOIST across the prep
      // and the COIL across the drive.
      // It is 0.12 at the grab — which is `REST` in the pose, so the handover off the clinch costs
      // nothing — and 0.85 by the impact.
      const vph = this.whirlT < haulEnd
        ? 0.12 + 0.22 * smooth((this.whirlT - lungeEnd) / Math.max(1e-3, this.whirlScrapeT()))
        : this.whirlT < dragEnd
          ? 0.34 + 0.26 * smooth((this.whirlT - haulEnd) / Math.max(1e-3, this.whirlSpinT()))
          : 0.60 + 0.25 * Math.max(0, Math.min(1, (this.whirlT - dragEnd) / Math.max(1e-3, P.WHIRL_SLAM_T * P.WHIRL_SLAM_HIT)));
      e.carryOrbit = {
        x: this.pos.x + Math.sin(ang) * r,
        z: this.pos.z + Math.cos(ang) * r,
        y: y,
        yaw: ang + Math.PI,
        ph: vph,
        lay,
        flip,
      };
    } else if (e) {
      e.carryOrbit = null;
    }

    // ---- the impacts ----
    if (!this.whirlSlamDone && this.whirlGrabbed &&
      this.whirlT >= impactT) {
      this.whirlSlamDone = true;
      this.whirlSlam();
    }
    if (!this.whirlLaunched && this.whirlGrabbed && this.whirlT >= slamEnd) {
      this.whirlLaunched = true;
      this.whirlLaunch();
    }

    // ---- the cancel (the user's "change skill 1 cancelable") ----
    // Past the commit window ANY other action ends the move and drops the body: the Q dash, the
    // dive, the slam, either of the other two skills, and M1 — which also BUFFERS, so the chain it
    // was cancelled into starts on the next frame instead of being eaten by the frame the cancel
    // landed on. A JUMP needs nothing here: the jump block in `update` fires for any state that is
    // not one of the four committed ones, and "whirl" is deliberately off that list.
    if (this.whirlT >= P.WHIRL_CANCEL &&
      (inp.kickPressed || inp.dashPressed || inp.divePressed || inp.slamPressed ||
        inp.skill2Pressed || inp.skill3Pressed)) {
      if (inp.kickPressed && this.grounded) this.attackBuf = P.COMBAT_CD + P.ACTION_BUFFER * 0.25;
      this.endWhirl(true);
      return;
    }
    if (this.whirlT >= this.whirlTotal()) this.endWhirl(false);
  },

  // =========================================================================
  // SKILL 1 — THE FLYING KNEE. The pill's verb now (the WHIRL above is kept whole and unwired: see
  // the note on the constants block). The user's brief, one sentence: *"replace the first skill
  // with make him do a fast run up about like 20 speed if the player is standing still and if the
  // player is running make him do the flying knee right away without the run up make the knee go to
  // the enemy head it must touch the enemy head and exaggrate the animtions"*.
  //
  // Three phases on one clock (`kneeT`, see `updateKnee`):
  //
  //   RUN-UP (0)   only from a STANDSTILL — `KNEE_RUN_SPEED` is the line between the user's two
  //                cases. He turns onto the target and drives up to `KNEE_RUN_V`, the "about like
  //                20 speed": nearly twice `SPRINT`, so it is a burst and the shape says so. The
  //                leap fires the frame the two bodies are inside `KNEE_LEAP_RANGE`, or when the
  //                clock runs out. The LEGS are the run cycle's own (advanced off the speed
  //                actually carried, so they cannot skate); everything above them is the pose.
  //   LEAP (1)     the arc, SOLVED ONCE at the frame it opens (`kneeLeap`). The aim is the target's
  //                own HEAD bone, moved back along the player's line by the strike knee's own
  //                offset (see `KNEE_AIM_FWD` / `KNEE_AIM_UP`) — so arriving at the aim IS the knee
  //                arriving on the skull. The flight then re-reads the REAL shin bone against the
  //                REAL head every frame (`kneeContact`), which is what makes the user's *"it must
  //                touch the enemy head"* a measurement rather than a hope.
  //   LANDING (2)  the fall out of the contact (or off the end of the arc, or a whiff) and the skid
  //                that breaks it, settled on `KNEE_RECOVER` from the frame the feet find the deck.
  //
  // A HIT, not a hold: there is no grab and nothing in his hands, so the whole move is a third of a
  // second of flight and a landing — which is why it can be that short and still sit on the same 5 s
  // pill the whirl did.
  //
  // MEASURED, off the rig at the strike beat (the numbers `KNEE_AIM_FWD` / `KNEE_AIM_UP` are set
  // from): the strike knee is `legLowerL`'s own origin, and at the contact beat of `poseFlyingKnee`
  // it sits +0.92 FORWARD of the body's centre and +0.57 above it, with the body's own pitch at 0
  // for this state (see `updateVisual`'s `pitch`).
  // =========================================================================
  knee() {
    if (this.kneeCd > 0) return false;
    if (!this.canSkill()) return false;
    if (this.overT <= 0) this.kneeCd = P.KNEE_CD;
    // WHICH of the two openings it is (see `KNEE_RUN_SPEED`): a body already RUNNING throws the knee
    // on the frame of the press, off the run it is carrying — and so does an airborne one, because
    // there is no deck to run on up there. Everything else takes the run-up first.
    this.kneeTarget = this.kneeAim();
    this.setState("knee");
    this.kneeT = 0;
    this.kneePhase = 0;
    this.kneeStride = 0;
    this.kneeMark = 0;
    this.kneeLeapT = 0;
    this.kneeLandMark = 0;
    this.kneeLanded = false;
    this.kneeHit = false;
    this.kneeHitBody = null;
    this.kneeAimZero = this.facing;
    this.kneeAimT = null;
    this.lastKnee = null;
    this.lastKneeLand = null;
    this.attackBuf = 0;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (!this.grounded || sp >= P.KNEE_RUN_SPEED || !this.kneeTarget) {
      // ...and with nothing in the wedge there is no one to run DOWN, so a standing press throws
      // the knee on the spot rather than sprinting twenty units at nothing.
      this.kneeLeap();
    } else {
      // ...the standstill: a run starts from nothing, and it starts on the aim's own line.
      this.vel.x *= 0.2;
      this.vel.z *= 0.2;
    }
    if (this.sfx) this.sfx.dash();
    this.events.push("knee");
    return true;
  },

  // The nearest body inside the wedge — the whirl's own test (`inFront`, so the height band and the
  // ragdoll rule are the same ones every strike in the game uses), with the knee's reach, sorted by
  // closeness because the run-up is going to be aimed at ONE of them.
  kneeAim() {
    if (!this.enemies || !this.enemies.spawned) return null;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const hits = this.enemies.inFront(this.pos.x, this.pos.z, fx, fz, P.KNEE_RANGE, P.KNEE_ARC,
      [this.pos.y - P.HY - P.KNEE_DOWN, this.pos.y + P.HY + P.KNEE_UP], { ragdolls: true });
    let best = null;
    let bestD = Infinity;
    for (const e of hits) {
      // ...and a body that is already LOOSE counts while it is IN THE AIR (the user's *"make skill 1
      // hit ragdoll that is in air"* — session 155). `ragdolls: true` above opens the wedge to one;
      // this is what keeps the run-up aimed at the body the leap is going to meet rather than at the
      // line the button was pressed on. A ragdoll lying on the deck is still nobody's business — the
      // knee passes through it exactly as every other strike in the game does (see `kneeContact`).
      if (e.ragdoll && e.grounded) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  },

  // WHERE THE STRIKE KNEE IS, in world space. It is the RIGHT knee — the side the chain's own knee
  // is thrown with (`COMBAT_MOVES`'s KNEE, and `poseFlyingKnee` throws the `RK` leg too) — and on
  // the rig the character's right is the `L` bones (see `RK`), so the joint to read is the SHIN's
  // own origin: `legLowerL` hangs off `legUpperL` at exactly the knee. Read LIVE off the rig, the
  // way the clinch's hands and the enemy's own head are, so the authored pose, the stretch chain
  // and every solver correction are all already in the answer. The fallback is for a rig that has
  // not finished building (a test harness on frame 0): the authored offset, on the body's own line.
  kneePoint(out) {
    const b = this.charMesh && this.charMesh.userData.bones;
    if (!b || !b.legLowerL) {
      return out.set(
        this.pos.x + Math.sin(this.facing) * P.KNEE_AIM_FWD,
        this.pos.y + P.KNEE_AIM_UP,
        this.pos.z + Math.cos(this.facing) * P.KNEE_AIM_FWD);
    }
    return b.legLowerL.getWorldPosition(out);
  },

  // THE LEAP — the arc, solved once (see the block above). The body's CENTRE is put where the knee's
  // own offset (`KNEE_AIM_FWD` / `KNEE_AIM_UP`) lands the knee ON the target's head bone, the
  // flight time is the distance over `KNEE_LEAP_V` (clamped), and the vertical is what carries the
  // centre to the aim's own height in that time. Nothing is faked: it is a real ballistic arc with
  // gravity left on, so `vel` is a real velocity for the camera, the FX and the pose to read.
  //
  // A press with NOTHING in front of him is a WHIFF — the knee is still thrown, along the line he
  // was already on, and it still flies and still lands (the move has to work off the end of a roof
  // with nothing to hit, exactly like the whirl's).
  kneeLeap() {
    this.kneePhase = 1;
    this.kneeMark = this.kneeT;
    const e = this.kneeTarget;
    let ax, ay, az;
    if (e && e.built) {
      const h = e.headPoint(_kneeH);
      const fx0 = Math.sin(this.facing);
      const fz0 = Math.cos(this.facing);
      // ...AND IT IS READ WHERE THE HEAD WILL BE, not where it is — the LEAD (session 155). A head
      // bone is a point on a body, and a body that is not standing still is going to have moved by
      // the time the knee arrives: the arc is a real one with a real flight time, and the one axis it
      // cannot re-aim on the way (see `KNEE_HOME`: the heading only) is the VERTICAL. That is exactly
      // the axis a JUGGLED body is moving on — the user's *"make skill 1 hit ragdoll that is in
      // air"* — so a body rising at 14 u/s over a 0.29 s flight was met at a head that had already
      // gone **4.0 u** higher, which is a miss every time (measured: the jump-arc launched, the body
      // untouched, `kneeHit` false). The arc that comes out is still a plain ballistic arc to a point
      // — it is simply the point the head is going to be AT rather than the one it left.
      //
      // ONE TIME DRIVES ALL OF IT — the aim, the vertical and the arc's own length — and that is not
      // tidiness, it is the whole of whether a MOVING target is hit (session 155). The aim is a
      // function of the time it takes to get there (the further the lead, the further the point, the
      // longer the flight), so the time is solved as a fixed point rather than taken from the body's
      // present distance in one pass; and the number that comes out must then be the SAME one the
      // vertical is solved against AND the one the arc is cut to. Two different numbers (which is
      // what a single pass off the present distance gives whenever the target is also running away,
      // because the aim lands further off than the body is and the clamp then bites) means the aim is
      // predicted for one arrival time and reached at another: measured on a loose body thrown away
      // at 13 u/s with `lift` 17, the vertical was solved for 0.339 s while the arc was cut to the
      // clamped 0.40 s, the head was **0.66** higher at the real arrival than the aim said, and the
      // knee passed that far under it (closest approach **0.71** against a `KNEE_HIT_R` of 0.45) —
      // a miss on exactly the body the user asked for.
      const rough = Math.hypot(h.x - this.pos.x, h.z - this.pos.z);
      const clampT = (t) => Math.max(P.KNEE_LEAP_MIN_T, Math.min(P.KNEE_LEAP_MAX_T, t));
      let lead = clampT(rough / Math.max(1e-3, P.KNEE_LEAP_V));
      for (let i = 0; i < 2; i++) {
        const px = h.x + e.vel.x * lead - fx0 * P.KNEE_AIM_FWD;
        const pz = h.z + e.vel.z * lead - fz0 * P.KNEE_AIM_FWD;
        lead = clampT(Math.hypot(px - this.pos.x, pz - this.pos.z) / Math.max(1e-3, P.KNEE_LEAP_V));
      }
      // ...and the VERTICAL half of the lead is solved, not extrapolated: a body in the air is under
      // the same gravity this leap is, so its height at the arrival is `v·t − ½g t²`, and a straight
      // `v·t` overshoots it badly on the way up (measured on a body rising at 13 u/s with a 0.35 s
      // flight: a straight lead aimed the knee at **6.97** where the head actually got to **4.26** —
      // the leap sailed over the body by 2.7 u and the closest the knee ever came was 1.48, against a
      // `KNEE_HIT_R` of 0.45). Ballistic, the two arcs meet.
      // ...and only for a body the physics is actually carrying: a body on the deck is STOOD on it
      // and a body a move is holding is PLACED every frame, so neither is falling and neither gets
      // the `½gt²` term. Spent on them it drops the aim below the head by 1.5 u over a 0.35 s flight
      // — which is exactly what it did to the STANDING case the first time this was written: the
      // knee sailed UNDER a body that had not moved at all. (A standing target is untouched by the
      // fixed point above as well: with `vel` 0 the lead cancels out of its own aim entirely.)
      const falling = !e.grounded && e.comboY == null && !e.capoCarry && !e.carryOrbit;
      ax = h.x + e.vel.x * lead - fx0 * P.KNEE_AIM_FWD;
      az = h.z + e.vel.z * lead - fz0 * P.KNEE_AIM_FWD;
      ay = h.y + e.vel.y * lead - (falling ? 0.5 * P.GRAVITY * lead * lead : 0) - P.KNEE_AIM_UP;
      this.kneeAimT = lead;
    } else {
      const fx0 = Math.sin(this.kneeAimZero);
      const fz0 = Math.cos(this.kneeAimZero);
      ax = this.pos.x + fx0 * P.KNEE_WHIFF_DIST;
      az = this.pos.z + fz0 * P.KNEE_WHIFF_DIST;
      ay = this.pos.y + P.KNEE_WHIFF_UP;
      this.kneeAimT = null;
    }
    const dx = ax - this.pos.x;
    const dz = az - this.pos.z;
    const dist = Math.hypot(dx, dz);
    // The time of flight TO THE STRIKE (`KNEE_LEAP_V` is the closing speed), and the whole arc is
    // that over `KNEE_STRIKE_U`: the pose's `u` is the arc's, and the knee is at full stretch at
    // `KNEE_STRIKE_U` of it (see `poseFlyingKnee`), so solving the arrival for that beat is what
    // puts the KNEE on the skull rather than merely somewhere near it on the way past. For a target
    // it is the LEAD's own time (see above — the aim was placed for it); a whiff, which has no body
    // to read, keeps the distance over the closing speed.
    const ts = this.kneeAimT != null
      ? this.kneeAimT
      : Math.max(P.KNEE_LEAP_MIN_T, Math.min(P.KNEE_LEAP_MAX_T, dist / Math.max(1e-3, P.KNEE_LEAP_V)));
    const T = ts / P.KNEE_STRIKE_U;
    this.kneeLeapT = T;
    if (dist > 0.05) {
      this.kneeAimZero = Math.atan2(dx, dz);
      this.facing = this.kneeAimZero;
    }
    this.vel.x = dx / ts;
    this.vel.z = dz / ts;
    this.vel.y = (ay - this.pos.y + 0.5 * P.GRAVITY * ts * ts) / ts;
    this.grounded = false;
    this.jumpsLeft = P.AIR_JUMPS;
    this.squash = -0.5;
    if (this.sfx) this.sfx.jump();
    this.events.push("kneeleap");
  },

  // THE CONTACT — the one test the leap makes, run on EVERY frame of the flight: the strike knee's
  // own point (`kneePoint`) against each live body's own HEAD bone (`headPoint`), within
  // `KNEE_HIT_R`. That radius is TOUCHING plus the two chunky parts (the knee cap and the skull —
  // see the constant), which is the user's *"it must touch the enemy head"* taken literally.
  //
  // The payload is the biggest a single strike in the game carries: a `flight` with a RAGDOLL on it,
  // the family the capoeira, the dive launch and the whirl's own exit all throw into. A knee to the
  // head is the fight-ender of this move and there is no hold behind it to pay the damage off over,
  // so it is all spent on the one frame the knee arrives.
  //
  // ...AND IT CATCHES A BODY THAT IS ALREADY IN THE AIR (the user's *"make skill 1 hit ragdoll that
  // is in air"* — session 155), ragdoll or not: a body the finisher threw loose and that has not
  // come down yet is the one thing on this rig that is still moving through the arc the knee is
  // flying, and a head-high knee that sailed through it would read as the move being blind. What it
  // gets is the JUGGLE the air combo already owns (`reAir` in `Enemy.hit`): the pop is refreshed and
  // the loose body's solved spin is re-spread over the longer hang it buys, so the knee reads as a
  // second launch rather than as a hit that did nothing.
  kneeContact() {
    if (!this.enemies || !this.enemies.spawned) return false;
    const kp = this.kneePoint(_kneeV);
    for (const e of this.enemies.list) {
      // A body that is already out of the fight is SKIPPED ONLY WHILE IT IS ON THE DECK. One lying
      // there is not the knee's business — the move passes through it exactly as every other strike
      // in the game does — but one still IN THE AIR is, and that is the user's *"make skill 1 hit
      // ragdoll that is in air"* (session 155): a body the finisher threw loose is a body the knee
      // can still catch on the way past, and catching it POPS it again (the `reAir` juggle in
      // `Enemy.hit`, which a ragdoll's own state — `flight` — is already in). `force` is what lets
      // that through the "a ragdoll cannot be hit" guard, and it is only ever set for one.
      if (!e.built || (e.ragdoll && e.grounded)) continue;
      const h = e.headPoint(_kneeH);
      const d = h.distanceTo(kp);
      if (d > P.KNEE_HIT_R) continue;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const dx = sp > 1e-3 ? this.vel.x / sp : Math.sin(this.facing);
      const dz = sp > 1e-3 ? this.vel.z / sp : Math.cos(this.facing);
      const landed = e.hit("flight", dx, dz, P.KNEE_KNOCK, P.KNEE_STUN,
        { dmg: P.KNEE_DMG, ragdoll: true, lift: P.KNEE_LIFT, force: e.ragdoll });
      this.kneeHit = true;
      this.kneeHitBody = e;
      this.lastKnee = { x: h.x, y: h.y, z: h.z, e, dist: d, power: landed ? 1 : 0.5 };
      this.hitstop = Math.max(this.hitstop, P.KNEE_STOP);
      this.squash = -0.72;
      if (this.sfx) this.sfx.slamImpact(landed ? 1 : 0.45);
      this.events.push("kneehit");
      // ...and the leap STOPS on it, the way a lunge stops on a body it runs into: what is left of
      // the flight is only the fall out of the strike.
      this.vel.x *= P.KNEE_STOP_KEEP;
      this.vel.z *= P.KNEE_STOP_KEEP;
      this.kneeToLand();
      return true;
    }
    return false;
  },

  // Out of the LEAP — the contact, the end of the arc, or a foot on the deck first.
  kneeToLand() {
    this.kneePhase = 2;
    this.kneeLanded = false;
  },

  // One frame of the move (the state case in `update`; gravity is the state's, as it is for every
  // other skill).
  updateKnee(dt, inp) {
    this.kneeT += dt;
    const e = this.kneeTarget;
    if (this.kneePhase === 0) {
      // ---- THE RUN-UP (see the block above) ----
      // The line is the TARGET's — or, with nothing in front of him, the line he pressed it on —
      // and the whole body is committed to it: this is a man running someone down, not a run that
      // can be turned. The speed is `KNEE_RUN_V` (~20), which is also why the leap has to happen at
      // the END of it: 20 u/s into a body's head is the move.
      if (e && e.built) {
        const tx = e.pos.x - this.pos.x;
        const tz = e.pos.z - this.pos.z;
        if (Math.hypot(tx, tz) > 0.35) this.kneeAimZero = Math.atan2(tx, tz);
      }
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const ns = approach(sp, P.KNEE_RUN_V, P.KNEE_RUN_ACCEL * dt);
      // The SPEED climbs at `KNEE_RUN_ACCEL` (the user's "fast run up" — ~20 u/s inside a quarter
      // of a second), and the LINE turns onto the aim at `KNEE_TURN`, the same rate the body does:
      // a chase that snapped its heading would read as a strafe, and one that could not turn at all
      // would run past a body that stepped aside.
      let h = sp > 0.05 ? Math.atan2(this.vel.x, this.vel.z) : this.kneeAimZero;
      h += wrapPi(this.kneeAimZero - h) * Math.min(1, dt * P.KNEE_TURN);
      this.vel.x = Math.sin(h) * ns;
      this.vel.z = Math.cos(h) * ns;
      // ...and the legs are the run cycle's own, advanced off the speed actually carried so the
      // stride keeps up with the body (see `poseFlyingKnee`'s run-up beat). A cycle authored for
      // `SPRINT` played at 20 u/s is what makes it read as a dead sprint.
      this.kneeStride = (this.kneeStride + (ns / RUN_STRIDE) * dt) % 1;
      const range = e && e.built ? Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) : Infinity;
      if (!this.grounded || range <= P.KNEE_LEAP_RANGE || this.kneeT >= P.KNEE_RUN_MAX_T) this.kneeLeap();
      return;
    }
    if (this.kneePhase === 1) {
      // ---- THE LEAP ----
      const u = (this.kneeT - this.kneeMark) / Math.max(1e-3, this.kneeLeapT);
      // ...the light homing (see `KNEE_HOME`): a body that walks out from under the arc is met
      // rather than missed. The HEADING only — the vertical is the solved one and is never touched,
      // because an arc that chases in both axes reads as a guided missile rather than as a jump.
      if (!this.kneeHit && e && e.built) {
        const tx = e.pos.x - this.pos.x;
        const tz = e.pos.z - this.pos.z;
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > 1e-3 && Math.hypot(tx, tz) > 0.35) {
          const s = swingTowards(this.vel.x, this.vel.z, tx, tz, P.KNEE_HOME, dt);
          this.vel.x = s.x * sp;
          this.vel.z = s.z * sp;
        }
      }
      if (!this.kneeHit) this.kneeContact();
      if (!this.kneeHit && (u >= 1 || this.grounded)) this.kneeToLand();
      return;
    }
    // ---- THE LANDING ----
    if (this.grounded) {
      if (!this.kneeLanded) {
        this.kneeLanded = true;
        this.kneeLandMark = this.kneeT;
        this.landImpact = Math.max(this.landImpact, 0.5);
        this.squash = Math.max(this.squash, 0.42);
        this.lastKneeLand = {
          x: this.pos.x, y: this.pos.y - P.HY, z: this.pos.z,
          power: this.kneeHit ? 1 : 0.5,
        };
        if (this.sfx) this.sfx.land(0.75);
        this.events.push("kneeland");
      }
      // The SKID: a knee thrown at 20 u/s does not stop where the body comes down, and the deck
      // biting out of it is the whole read of the beat (see `KNEE_LAND_BRAKE`).
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 0.02) {
        const k = Math.max(0, sp - P.KNEE_LAND_BRAKE * dt) / sp;
        this.vel.x *= k;
        this.vel.z *= k;
      }
      if (this.kneeT - this.kneeLandMark >= P.KNEE_RECOVER) this.endKnee();
    }
  },

  // Out of the knee — the settle ran out (or the body died, which resets the state under it).
  endKnee() {
    this.kneeTarget = null;
    this.setState(this.grounded ? "ground" : "air");
  },


  scissor() {
    if (this.scissorCd > 0) return false;
    if (!this.canSkill()) return false;
    if (this.overT <= 0) this.scissorCd = P.SCISSOR_CD;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    let target = null;
    if (this.enemies) {
      // ...AND A BODY OUT OF THE AIR IS A NECK TOO (the user's *"make the 2nd skill catch airborne
      // ragdoll enemy/dummy"* — session 190). Skill 1's knee has taken a loose body out of the air
      // since session 155 (`kneeAim`); this is the same rule on the same terms: a body that is
      // ragdolling counts while it is still off the deck (`airRagdolls`), inside the very band this
      // move's own contact tests (`ragBand`), and one lying on the pavement is still skipped — the
      // whiff and its red cue (below) keep that case exactly as it was.
      target = this.enemies.nearest(this.pos.x, this.pos.z, fx, fz, P.SCISSOR_REACH, {
        airRagdolls: true,
        ragBand: [this.pos.y - P.HY - P.SCISSOR_DOWN, this.pos.y + P.HY + P.SCISSOR_UP],
      });
    }
    this.setState("scissor");
    this.scissorT = 0;
    this.scissorTarget = target;
    this.scissorCounter = null;
    this.scissorLeaped = false;
    this.scissorClamped = false;
    this.scissorClamp = 0;
    this.scissorBite = 0;
    // The anchor is captured on the clamp's FIRST frame (see `scissorAnchor`) — it has to read the
    // rig where the leap actually left it, which is not known until then.
    this.scissorAnchored = false;
    this.scissorHitDone = false;
    // THE MISS is decided on the LEAP below (see `updateScissor`): a press with nothing in reach is
    // a committed whiff, not a target that might turn up — the swing can only be aimed once.
    this.scissorMiss = false;
    // ...and the miss's own channels are cleared with it (see `SCISSOR_MISS_FLIP` /
    // `SCISSOR_MISS_DOWN`): the somersault's own clocks (`scissorMissT` into the airtime
    // `scissorAirT`), which half of the miss's tail it is in (`scissorMissPhase`), the two deck
    // clocks, the eased deck-rest correction (`scissorRest`), and the point the world draws the
    // air-cut on (`lastScissorMiss`, which must not survive from the previous scissor).
    this.scissorPitch = 0;
    this.scissorMissT = 0;
    this.scissorAirT = 0;
    this.scissorMissPhase = 0;
    this.scissorMissDeck = false;
    this.scissorDownT = 0;
    this.scissorGetupT = 0;
    this.scissorRest = 0;
    this.camDrop = 0;
    this.lastScissorMiss = null;
    // THE GRIP (see `scissorContact` / `scissorGrip` / `scissorThrow`): the clock the victim's own
    // limp shape is played on while it is held, and whether the throw has been spent. The HOLD
    // itself lives on the victim (`e.headPin`), never on the player, so a body cannot be left held
    // by a move that has ended.
    this.scissorGripT = 0;
    this.scissorThrown = false;
    this.scissorHeld = false;
    this.blockT = P.SCISSOR_GUARD_T;
    this.vel.x *= 0.2;
    this.vel.z *= 0.2;
    this.events.push("scissor");
    return true;
  },

  updateScissor(dt, inp) {
    // ---- THE MISS'S OWN TAIL IS NOT THE SCISSOR (see `SCISSOR_MISS_DOWN`) ----
    // A whiff that has come down is no longer this move at all: the neck it was for is gone, the
    // arms and legs of the scissor are gone, and all that is left is a body on the pavement. It
    // leaves the phase machine below on the frame the deck arrives (or on the frame the clamp's own
    // clock runs out, if it flew off something) and runs on its own two clocks — `scissorMissPhase`
    // is 0 for the air half (guard, leap, clamp) and 1 / 2 for the settle and the rise.
    if (this.scissorMissPhase > 0) { this.updateScissorDown(dt); return; }
    this.scissorT += dt;
    const guardEnd = P.SCISSOR_GUARD_T;
    const leapEnd = guardEnd + P.SCISSOR_LEAP_T;
    const twistEnd = leapEnd + P.SCISSOR_TWIST_T;
    const end = twistEnd + P.SCISSOR_LAND_T;
    const e = this.scissorTarget;
    // THE COUNTER'S WINDOW IS THE FIRST PHASE — and it is written HERE, outside the phase, so that it
    // CLOSES on the frame the phase ends. Written only while it was open, the phase's last frame
    // leaves a residue of ~1e-17 s on the clock (floating point), and `scissorCatch`'s own
    // `blockT > 0` test then reads the window as still OPEN for the whole rest of the move — a fist
    // arriving during the leap or the clamp would be caught by a guard that had already ended.
    // Written every frame from the clock, the HUD and the enemy's own contact test read the same
    // number as the phase does.
    this.blockT = this.scissorT < guardEnd ? guardEnd - this.scissorT : 0;
    if (this.scissorT < guardEnd) {
      // THE GUARD: the body roots on the spot and the window runs down.
      this.vel.x = approach(this.vel.x, 0, 18 * dt);
      this.vel.z = approach(this.vel.z, 0, 18 * dt);
      if (this.scissorT >= Math.min(P.WHIRL_CANCEL, guardEnd * 0.5) &&
        (inp.dashPressed || inp.divePressed || inp.slamPressed)) {
        this.blockT = 0;
        this.setState(this.grounded ? "ground" : "air");
        return;
      }
    } else if (this.scissorT < leapEnd) {
      // THE LEAP. Once, on the first frame of the phase: up off the deck and IN toward the neck,
      // aimed off the eyes rather than the feet so a counter's leap goes at the body that threw
      // the fist even though the fist came from one side.
      if (!this.scissorLeaped) {
        this.scissorLeaped = true;
        // WHETHER THERE IS A NECK TO CLOSE ON, decided HERE and never again (see `scissorMiss`).
        this.scissorMiss = !(e && e.built);
        if (this.scissorMiss) {
          // ...AND WHETHER THE WHIFF IS THE MOVE'S OWN RULE RATHER THAN A DROPPED INPUT. A body
          // the CHAIN refuses — one that is ragdolling (see `Enemies.nearest`, which skips one, and
          // `hit`, which turns one away: the user's *"make the m1s cant hit ragdoll"*) is not a
          // target at all, so a scissor thrown with one lying right in front of the player whiffs on
          // purpose. That is a rule the player cannot see, so the body that got away SAYS it: it
          // wears its own outline in red for `SCISSOR_MISS_CUE` (see `OUTLINE_CUE_RGB` in
          // enemies.js, and `setOutlineTint` in ps1.js). The user's *"if i try to like hit the enemy
          // while hes ragdoll ... make it if that happens like a 25% opacity red outline appears
          // around the enemy"*.
          //
          // The search is the same `nearest` the aim used, with the ragdolls taken (`ragdolls: true`
          // — the only difference the refusal makes), and the same reach, so only a body that really
          // was in the swing gets marked: a whiff in open ground marks nothing, which is the honest
          // read (there is no body for it to have been about).
          const mx = Math.sin(this.facing);
          const mz = Math.cos(this.facing);
          const refused = this.enemies &&
            this.enemies.nearest(this.pos.x, this.pos.z, mx, mz, P.SCISSOR_REACH, { ragdolls: true });
          if (refused) refused.outlineCue = P.SCISSOR_MISS_CUE;
          // ...AND THE SOMERSAULT'S OWN CLOCK OPENS HERE (see `SCISSOR_MISS_FLIP`). The whole flip
          // is timed off the AIRTIME this leap just bought — the ballistic hang of `SCISSOR_JUMP`
          // (`2v/g`, the same pair of numbers the launch uses, gravity being the world's) — so the
          // revolution and the fall are one motion, and the body is square on the frame the deck
          // arrives rather than wherever the clamp's own clock happened to leave it.
          this.scissorMissT = 0;
          this.scissorAirT = Math.max(0.2, 2 * P.SCISSOR_JUMP / P.GRAVITY);
        }
        if (e && e.built) {
          const dx = e.pos.x - this.pos.x;
          const dz = e.pos.z - this.pos.z;
          if (Math.hypot(dx, dz) > 0.25) this.facing = Math.atan2(dx, dz);
        }
        const fx = Math.sin(this.facing);
        const fz = Math.cos(this.facing);
        this.grounded = false;
        this.vel.y = P.SCISSOR_JUMP;
        this.vel.x += fx * P.SCISSOR_FWD;
        this.vel.z += fz * P.SCISSOR_FWD;
        this.squash = -0.5;
        if (this.sfx && this.sfx.jump) this.sfx.jump();
        this.events.push("scissorleap");
      }
      // ...and the flip runs on EVERY frame of the air half, leap included: it opens the moment the
      // deck is left (see the note on `scissorAirT` above), not on the clamp's first frame.
      if (this.scissorMiss) this.tickMissFlip(dt);
    } else if (this.scissorT < twistEnd) {
      // THE CLAMP — THE PENDULUM ON THE NECK. The legs shut on the opponent's neck and the body
      // swings around it: ONE revolution, monotonic, rigidly about the CONTACT (`scissorAnchor`),
      // which is what makes the scissors read. The old version wound the same turn about the
      // player's OWN hips, so the legs swept straight past the opponent's head and there was no
      // clip to see at all — and it shared the turn with `updateVisual`'s tumble-settle, which is
      // what made the rig somersault three times and land upside down (see the note there).
      //
      // This is the ONLY writer of `spinX` while the clamp runs, and it is a pure read of the
      // clamp's own clock, so the rate cannot drift and a dropped frame cannot leave the turn
      // behind the shape.
      const cph = Math.min(1, (this.scissorT - leapEnd) / Math.max(1e-3, P.SCISSOR_TWIST_T));
      this.scissorClamp = cph;
      // THE MISS (session 143; re-cut 152, RE-CUT AGAIN session 191 — the user's *"make the miss
      // animtion for skill 2 is that he does a front flip if he doesnt catch an enemy he falls on
      // the ground like a ragdoll/stun for 0.67 seconds"*). A scissor thrown with nothing in reach
      // has no NECK, so there is no pendulum to run: `scissorAnchor` exists to wind the rig about a
      // contact that is a real opponent, and hanging a body off a contact that is merely a point in
      // the air beside its own hips is what the move used to do on a whiff — a clean, confident
      // somersault that reads as though he had caught somebody.
      //
      // What it does now is the physics of the failure, in three parts:
      //
      //   * THE AIR. `scissorAnchor` is still not called: the leap's own line, gravity (the one
      //     thing a plain jump has and the clamp normally takes away) and a little drag (1.7 /s)
      //     carry him out and down.
      //   * THE BODY GOES OVER — ALL THE WAY OVER (`SCISSOR_MISS_FLIP`, wound on `scissorMissFlipAt`
      //     over the leap's own airtime). The legs are thrown up and FORWARD and they close on
      //     nothing, so nothing stops them and nothing takes the weight, and the body's own mass
      //     follows them over a whole front somersault. It stops one lie short of square, so the
      //     BACK takes the deck rather than the feet — a body that missed does not land it.
      //   * THE DECK (`SCISSOR_MISS_DOWN`, then `SCISSOR_MISS_GETUP`). He goes down on it the way
      //     everybody else in this game does — the game's own knocked-down body (`poseHurt`'s `down`
      //     and `getup`), held for `SCISSOR_MISS_DOWN` and then got up out of. See
      //     `enterScissorMissDown` / `updateScissorDown`.
      //
      // The SHAPE keeps the rest (see `poseScissor`): the jaws of the scissors OPEN wide through
      // the reach and then SLAM shut and CROSS on `SCISSOR_HIT_AT`, on the same flicked beat a real
      // bite fires on, so a whiff and a hit read on the same beat of the clock — and what they shut
      // on is empty air, past each other, because there is nothing there to stop them.
      //
      // The whiff is spent HERE rather than at `scissorContact`, because there is nothing to contact
      // and a missed scissor should not silently search the air for a body for the rest of the swing
      // (the target is decided on the LEAP — see `scissorMiss`).
      if (this.scissorMiss) {
        // ---- THE BODY GOES OVER — ALL THE WAY OVER (see `SCISSOR_MISS_FLIP`) ----
        this.tickMissFlip(dt);
        const drag = Math.max(0, 1 - 1.7 * dt);
        this.vel.x *= drag;
        this.vel.z *= drag;
        if (!this.scissorClamped && cph >= P.SCISSOR_HIT_AT) {
          // THE SNAP — the shins cross on NOTHING, and this is the miss's whole punchline, so it is
          // held: `SCISSOR_MISS_STOP` freezes the body on this frame the way a landed scissor's
          // hitstop freezes the world on it (the same mechanism, a third of the length, aimed at
          // the body — `main.js`'s loop squashes the step to 7% for it).
          //
          // ...and the point the WORLD is told about is read off the two drawn ANKLES, not off a
          // formula: the midpoint of the feet is where the scissors closed, and `main.js` draws the
          // air-cut ring there. The rig is a frame behind the state here (the pose for this frame
          // is written at the end of `update`), which for a RING on a MIDPOINT costs nothing — the
          // two legs come in from opposite sides, so the midpoint barely moves across the shut,
          // while the ring's old fixed offset (1.15 up and 0.55 ahead of a body standing in it) was
          // half a metre from where the scissors actually went.
          this.scissorClamped = true;
          this.hitstop = Math.max(this.hitstop, P.SCISSOR_MISS_STOP);
          const bs = this.charMesh && this.charMesh.userData.bones;
          if (bs && bs.footL && bs.footR) {
            this.group.updateWorldMatrix(true, true);
            bs.footR.getWorldPosition(_scA);
            bs.footL.getWorldPosition(_scB);
            this.lastScissorMiss = {
              x: (_scA.x + _scB.x) * 0.5,
              y: (_scA.y + _scB.y) * 0.5,
              z: (_scA.z + _scB.z) * 0.5,
              fx: Math.sin(this.facing),
              fz: Math.cos(this.facing),
            };
          } else {
            this.lastScissorMiss = null;
          }
          if (this.sfx && this.sfx.whiff) this.sfx.whiff();
          this.events.push("scissormiss");
        }
        // ...and THE DECK ENDS THE AIR HALF (see `SCISSOR_MISS_DOWN`). The frame the ground takes
        // him, the somersault is handed to the lie it has wound to and the body goes to the
        // pavement — the settle and get-up clocks take over from here. THIS is the beat the old
        // whiff got wrong: it handed over to a LANDING (it wrote `scissorT = twistEnd`) which
        // unwound the fold and stood him back up, so a miss ended on its feet like a move that had
        // gone right. A whiff does not land — it stops being in the air.
        if (this.grounded && cph > P.SCISSOR_HIT_AT) { this.enterScissorMissDown(); return; }
        // (the bite channel below still runs, so the snap's own shape keys stay live)
      } else {
        this.scissorAnchor(cph, dt);
        // ...AND THE VICTIM COMES WITH IT (see `scissorGrip`): from the bite to the end of the swing
        // the body he has by the neck is HELD on the clamp's own contact, written every frame the
        // clamp runs. This is the whole of what makes the move a head scissor: the contact the legs
        // are solved onto and the point the victim's skull is placed on are the same number, so the
        // head cannot drift off the ankles, and the man somersaults about the head he has instead of
        // about a point it was knocked away from.
        //
        // FROM THE BITE, not from the top of the clamp: until the shins have crossed there is nothing
        // held — the legs are still travelling — and a pin written over the run-up hangs the victim
        // off a grip that has not closed yet (measured: an enemy caught mid-air by a leap is already
        // dangling from the contact on the clamp's FIRST frame, in whatever shape it happened to be
        // wearing, which is a body levitating by the neck a beat before anything touched it). On the
        // bite frame itself the grip is opened by `scissorContact` and written by hand there, because
        // the flag it is gated on is not set until then.
        if (this.scissorHeld) this.scissorGrip(dt);
      }
      // THE SCISSORS' BITE, off the same clock: nothing until the shut's own run-up, then the
      // legs SNAP shut so that they ARRIVE crossed on `SCISSOR_HIT_AT` — the exact frame the shins
      // cross, the hit fires and the hitstop holds. (It used to start the shut on that frame
      // instead, so what the hitstop froze was a pair of legs that had only just begun to close,
      // and the crossing itself played out after the hold had let go.) The spacing of the shut is
      // `poseScissor`'s — `flickKeys`' knock-on flick — and the value handed over is the raw
      // 0..1 progress through it, so the shape stays the pose's business.
      const biteFrom = P.SCISSOR_HIT_AT - P.SCISSOR_BITE;
      this.scissorBite = cph <= biteFrom
        ? 0
        : Math.min(1, (cph - biteFrom) / Math.max(1e-4, P.SCISSOR_BITE));
      if (!this.scissorClamped && cph >= P.SCISSOR_HIT_AT) {
        // THE SHINS CROSS. The hit, and with it the hitstop the hold is made of (`main.js` squashes
        // the step to 7% for its 0.09 s), fires here — with the body already part-way round the
        // swing and the legs shut on the neck, so the frozen frame is the bite.
        this.scissorClamped = true;
        this.scissorContact();
      }
    } else {
      // THE LANDING. The legs let the neck go and the feet take the deck (the landing's own keys
      // and its solved stance — see `poseScissor`). The rig is square again — the swing ended on
      // exactly one revolution — so zeroing it here is seamless, and it has to be done HERE
      // rather than left to `updateVisual`'s tumble-settle: that settle is what used to drag the
      // turn out from under the landing and leave the body planted on its head.
      //
      // ...and THE THROW is the first thing that happens: the grip is let go and the body is
      // hurled off it (see `scissorThrow`), once, on this frame. The swing is what the throw is
      // FOR — the body spends the whole turn being carried by the neck and leaves on the move's own
      // knock and lift, instead of the two being spent on the bite frame, three tenths of a second
      // before the man had finished the turn he had it by.
      if (!this.scissorThrown) this.scissorThrow();
      // ...and A WHIFF NEVER REACHES THIS BRANCH ANY OTHER WAY (see `SCISSOR_MISS_DOWN`): the deck
      // hands it to the lie the moment it lands, so the only miss that gets here is one that was
      // still in the air when the clamp's own clock ran out — it went off a ledge, and there is no
      // scissor left to recover. The hand-over is the same call.
      if (this.scissorMiss) { this.enterScissorMissDown(); return; }
      this.scissorPitch = 0;
      this.spinX = 0;
      this.vel.x = approach(this.vel.x, 0, 14 * dt);
      this.vel.z = approach(this.vel.z, 0, 14 * dt);
      if (this.scissorT >= end) {
        this.scissorTarget = null;
        this.scissorPitch = 0;
        this.setState(this.grounded ? "ground" : "air");
      }
    }
  },

  // -------------------------------------------------------------------------
  // THE MISS'S AIR HALF — the front somersault (see `SCISSOR_MISS_FLIP`).
  //
  // One call per frame of the leap and the clamp, and it is a pure read of two clocks: how far
  // through the AIRTIME the leap bought (`scissorAirT`, `2v/g` off `SCISSOR_JUMP`), into how far
  // through the revolution the body has wound (`scissorMissFlipAt`). Read rather than integrated, so
  // a dropped frame cannot leave the turn behind the fall, and so the two are one motion by
  // construction rather than by two rates happening to agree — the whole point of the rework, and
  // the same bargain the enemies' own ragdoll spin makes (see `E.RAGDOLL_T` in enemies.js).
  // -------------------------------------------------------------------------
  tickMissFlip(dt) {
    this.scissorMissT += dt;
    const u = Math.min(1, this.scissorMissT / Math.max(1e-3, this.scissorAirT));
    this.scissorPitch = P.SCISSOR_MISS_FLIP * scissorMissFlipAt(u);
    // `spinX` is written off every frame of the air half: the scissor's clamp turns the rig through
    // `scissorAnchor`, and a miss has nothing to anchor to — the somersault is `scissorPitch`, and
    // `spinX` left with a value on it would be a second turn fighting the first (this is the same
    // guard the clamp keeps, one branch over).
    this.spinX = 0;
  },

  // ...and THE HAND-OVER TO THE DECK. Called on the frame the ground takes him, or on the frame the
  // clamp's clock runs out with him still in the air (a whiff off a ledge — the fall that follows is
  // then a real one, gravity pulling until the deck arrives, and the deck-rest solve in
  // `placement.js` beds him onto it). The somersault is finished as far as it got, and the lie it
  // lands in is the same orientation `SCISSOR_MISS_DOWN_PITCH` names whatever fraction of the
  // revolution the clock reached — `scissorPitch` and the lie are a whole turn apart (2 PI), so
  // writing the lie here is not a rotation at all, it is the same pose named once.
  enterScissorMissDown() {
    this.scissorMissPhase = 1;
    this.scissorMissDeck = true;
    this.scissorDownT = 0;
    this.scissorGetupT = 0;
    this.scissorPitch = P.SCISSOR_MISS_DOWN_PITCH;
    // The deck-rest correction starts at zero and is eased onto the measurement (see
    // `solveDeckClamps` in placement.js), which is what makes the hand-over from the air a FLOP
    // rather than a jump down onto the back.
    this.scissorRest = 0;
    this.scissorTarget = null;
    this.scissorClamped = true;
    this.spinX = 0;
    // The horizontal is dead the moment he is on the pavement; the VERTICAL is left alone, because
    // a body handed over in mid-air has to fall. `updateScissorDown` catches the rest once the deck
    // is under it.
    this.vel.x = 0;
    this.vel.z = 0;
    if (this.grounded) this.vel.y = 0;
  },

  // THE MISS'S DECK HALF (see `SCISSOR_MISS_DOWN`) — the settle, and the rise. Two clocks off one
  // phase, and neither of them touches the phase machine above: this IS the whole of the move once
  // the deck has him.
  updateScissorDown(dt) {
    this.scissorDownT += dt;
    this.spinX = 0;
    if (this.scissorMissPhase === 1) {
      // ---- THE FLOP ---- the rig is held in the lie the somersault wound to, and the SHAPE does
      // the settling (`poseHurt`'s `down` — the arms, the head and both legs finishing their fall
      // on their own lags, exactly as an enemy's does). Once the deck is under him he is parked:
      // nothing about a body lying on the pavement wants a velocity.
      if (this.grounded) this.vel.set(0, 0, 0);
      this.scissorPitch = P.SCISSOR_MISS_DOWN_PITCH;
      // ...and the shot comes down with him, on the flop's own beat (see `SCISSOR_MISS_CAM_DROP`).
      this.camDrop = P.SCISSOR_MISS_CAM_DROP * Math.min(1, this.scissorDownT / Math.max(1e-3, P.SCISSOR_MISS_SETTLE));
      if (this.scissorDownT >= P.SCISSOR_MISS_DOWN) {
        this.scissorMissPhase = 2;
        this.scissorGetupT = 0;
      }
      return;
    }
    // ---- THE RISE ---- the `getup` shape brings the feet under the body, and the last of the lie
    // is unwound over the same clock, so the man is square on the frame the shape reaches REST —
    // which is the shape the ground state's own idle takes over from, so the hand-out does not pop.
    if (this.grounded) this.vel.set(0, 0, 0);
    this.scissorGetupT += dt;
    const g = Math.min(1, this.scissorGetupT / Math.max(1e-3, P.SCISSOR_MISS_GETUP));
    this.scissorPitch = P.SCISSOR_MISS_DOWN_PITCH * (1 - smooth01(g));
    this.camDrop = P.SCISSOR_MISS_CAM_DROP * (1 - smooth01(g));
    if (g >= 1) {
      this.scissorMissPhase = 0;
      this.scissorPitch = 0;
      this.scissorRest = 0;
      this.camDrop = 0;
      this.setState(this.grounded ? "ground" : "air");
    }
  },

  // -------------------------------------------------------------------------
  // THE CLAMP'S ANCHOR — the neck the legs are on, and the body rigidly swinging about it.
  //
  // The whole move lives in one idea: the clamp is a PENDULUM, and its pivot is the opponent's
  // neck rather than the player's own hips. So every frame of the clamp does two things:
  //
  //   * the CONTACT — the point the two legs are solved onto — is placed in the WORLD. On the
  //     first clamp frame it is captured off the rig where the leap actually left it (so the
  //     handover is continuous to the millimetre: the same position, the same rotation), and over
  //     the first `SCISSOR_HIT_AT` of the clamp it travels onto the opponent's live neck. The legs
  //     lead it (they are solved to it, see `poseScissor`), so what reads is the legs reaching out
  //     and hooking the neck and the body following them down. From the frame the shins cross the
  //     contact is FROZEN — the body is thrown at that same frame, and the attacker's weight
  //     cannot still be on a neck that is already flying away. A whiff has no neck to travel to,
  //     so the contact simply stays where it was and the body swings about a point just off its own
  //     hips: a clean single somersault, which is the most a scissor thrown at nothing can be.
  //   * the RIG — `pos` and `spinX` are written so the hips sit `SCISSOR_NECK_F` forward of and
  //     `SCISSOR_NECK_D` below the contact, and the whole body is rotated by the clamp's turn about
  //     it. Both are one rigid transform of the point the pose puts the ankles on, so the feet stay
  //     exactly on the neck for the whole revolution.
  //
  // The rig arithmetic is in the rig's own measured units. A point in the rig's authoring frame
  // lands in the world at `charCtn + charMesh.position + charMesh.scale * p`, and the pose's hip
  // height is authoring too — so the hips' offset inside the rig is read off those three and the
  // contact's own offset is whatever is left when the hold's forward/down is taken out of it. That
  // is the whole trick: the ankle target the pose is handed and the position the body is put at
  // are two reads of ONE number, so they cannot disagree.
  // -------------------------------------------------------------------------
  scissorAnchor(cph, dt) {
    const m = this.charMesh;
    if (!m) return;
    const bones = m.userData.bones;
    const ms = m.scale.x || 1;
    // The hold, in the rig's own units — the same pair the pose is handed below (`tgt`), so the
    // point the ankles are solved onto and the point the body is placed by are ONE number.
    const tgtY = P.SCISSOR_NECK_D / ms;
    const tgtZ = -P.SCISSOR_NECK_F / ms;
    if (!this.scissorAnchored) {
      // ---- THE FIRST FRAME: read the clamp's own frame off the rig as the leap left it ----
      this.scissorAnchored = true;
      if (bones) {
        this.group.updateWorldMatrix(true, true);
        // The contact the legs are on: the hips, walked back along the hold (`spinX` is still the
        // leap's — zero — so this captures the leap's own exit transform exactly, and the
        // placement below therefore reproduces this frame's position to the millimetre).
        _scQ.setFromEuler(_scE.set(this.spinX, this.facing, 0, "YXZ"));
        _scB.set(0, -P.SCISSOR_NECK_D, P.SCISSOR_NECK_F).applyQuaternion(_scQ);
        // ...off the drawn rig, which lags `pos` by whatever the body's own y-follow left behind:
        // the clamp needs the position the body would be at for real, since that is what the
        // placement below has to reproduce (the y-follow is taken whole inside the clamp — see
        // `updateVisual` — so the two agree from the next frame on).
        bones.hips.getWorldPosition(_scA).add(_scC.copy(this.pos).sub(this.group.position));
        _scC.copy(_scA).sub(_scB);
        this.scissorC.copy(_scC);
        this.scissorArr.copy(_scC);
        // ...where the hips sit INSIDE the rig, in the rig's frame: measured, so the mesh's own
        // scale, the pose's hip height and the inner's squash are all already in it.
        this.scissorHipOff.copy(_scA).sub(this.pos).applyQuaternion(_scQ.conjugate());
        // ...and the ankles' own ARRIVAL — their sagittal offsets from the hips in the rig's own
        // frame, which is the frame the pose's IK speaks. Measured, because the leap leaves them
        // wherever its own shape put them, and the legs have to hand over from there.
        _scM.copy(m.matrixWorld).invert();
        bones.hips.getWorldPosition(_scA).applyMatrix4(_scM);
        bones.footL.getWorldPosition(_scB).applyMatrix4(_scM);
        bones.footR.getWorldPosition(_scOff).applyMatrix4(_scM);
        this.scissorTgt0.y = (_scB.y + _scOff.y) * 0.5 - _scA.y;
        this.scissorTgt0.z = (_scB.z + _scOff.z) * 0.5 - _scA.z;
      } else {
        // No rig yet (the character is still loading): swing about the body's own origin, which is
        // all the placement has to know.
        this.scissorC.set(this.pos.x, this.pos.y, this.pos.z);
        this.scissorArr.copy(this.scissorC);
        this.scissorHipOff.set(0, 0, 0);
        this.scissorTgt0.y = tgtY;
        this.scissorTgt0.z = tgtZ;
      }
    }
    // ---- THE CONTACT: travelling, then frozen ----
    const HIT = Math.max(1e-3, P.SCISSOR_HIT_AT);
    const k = smooth01(cph / HIT);
    if (!this.scissorClamped && cph < HIT) {
      const e = this.scissorTarget;
      if (e && e.built && e.headPoint) {
        // The opponent's neck is LIVE until the throw: the legs travel onto wherever it actually is
        // (this rig's head bone sits at the base of the skull, which IS the neck they close on).
        e.headPoint(_scC);
        this.scissorC.copy(this.scissorArr).lerp(_scC, k);
      }
      // No neck to travel to (a whiff) and the contact simply stays where it was: the body swings
      // about a point just off its own hips, which is the most a scissor thrown at nothing can be.
      this.scissorTgtY = this.scissorTgt0.y + (tgtY - this.scissorTgt0.y) * k;
      this.scissorTgtZ = this.scissorTgt0.z + (tgtZ - this.scissorTgt0.z) * k;
    } else if (!this.scissorHitDone) {
      // The frame the shins cross: the hold is taken (the legs are already on the neck, `k` is 1).
      this.scissorHitDone = true;
      this.scissorTgtY = tgtY;
      this.scissorTgtZ = tgtZ;
    }
    // ---- THE TURN: one revolution, monotonic, off the clamp's own clock ----
    // (see `scissorSpinAt`; it lands on exactly 2 PI, so the landing below opens with the rig
    // square and the pose's solved stance puts the feet on the deck where it was authored to).
    const turn = TAU * scissorSpinAt(cph);
    this.spinX = turn;
    // ---- THE RIG, placed so the CONTACT is on the world point the legs are solved onto ----
    // The body is rigidly rotated by `turn` about that point (the group's yaw is the facing), so
    // the origin is the contact less that same rotation applied to the hips' offset from it.
    _scQ.setFromEuler(_scE.set(turn, this.facing, 0, "YXZ"));
    _scOff.set(0, -P.SCISSOR_NECK_D, P.SCISSOR_NECK_F).sub(this.scissorHipOff);
    _scOff.applyQuaternion(_scQ).add(this.scissorC);
    this.pos.x = _scOff.x;
    this.pos.z = _scOff.z;
    // `pos.y` carries the one frame of gravity the state's own case adds AFTER this runs and
    // `moveAndCollide` then spends (`dt * dt * G`), so the body is exactly on the anchor when it is
    // drawn instead of a frame's worth of fall behind it.
    this.pos.y = _scOff.y + P.GRAVITY * dt * dt;
    this.vel.set(0, 0, 0);
  },

  // The frame the legs shut. The scissors BITE — the damage, the flash and the hitstop — and then
  // the body is TAKEN: from this frame to the end of the swing its skull is held on the clamp's own
  // contact (see `scissorGrip`) and the throw is spent when the legs let go (`scissorThrow`).
  //
  // The BITE IS DAMAGE ONLY, and that is the one line the move was missing. It used to fire a full
  // `flight` here, which is a reaction whose whole job is to throw the body OFF the thing that hit
  // it — so the victim was knocked out of the legs on the very frame the ankles closed and the
  // scissor had nothing in it at all. Measured through the live loop before this: the ankles 0.13 u
  // off the skull on the bite frame, 0.61 a frame later, **1.44 by three frames**, and 2.5 u away
  // by the end of the swing — the man was somersaulting about a point the head had already left.
  // A `jolt` is the wall clinch's own door for the same problem (see `Enemy.hit`): hp, flash and
  // the shape's little impact, and NO `setState` — the state the grip needs is put on below.
  scissorContact() {
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    let e = this.scissorTarget && this.scissorTarget.built ? this.scissorTarget : null;
    if (this.enemies && this.enemies.spawned) {
      // The wedge takes a LOOSE body as well (`ragdolls: true` — session 190), because the aim
      // above can now hand this move one; but only while it is IN THE AIR. A ragdoll lying on the
      // deck is filtered straight back out — the same test `kneeAim` makes (skill 1's own air
      // catch) — so the contact can never land on a body the aim would have refused.
      const hits = this.enemies.inFront(this.pos.x, this.pos.z, fx, fz, P.SCISSOR_REACH, P.SCISSOR_ARC,
        [this.pos.y - P.HY - P.SCISSOR_DOWN, this.pos.y + P.HY + P.SCISSOR_UP], { ragdolls: true })
        .filter((b) => !(b.ragdoll && b.grounded));
      if (!e && hits.length) e = hits[0];
      else if (e && hits.indexOf(e) === -1 && hits.length && hits[0] !== e) e = hits[0];
    }
    if (!e || !e.built) return;
    // The body the grip is on is the body the bite landed on, whichever door found it.
    this.scissorTarget = e;
    // `force` is what lets the teeth close on a LOOSE body: the ragdoll guard in `hit` refuses every
    // ordinary strike (the user's *"make the m1s cant hit ragdoll"*), and this is the move that is
    // allowed through it — the user's own air catch. It is inert on a live body, which is every
    // other bite this move has ever landed.
    const landed = e.hit("jolt", fx, fz, 0, 0, { dmg: P.SCISSOR_DMG, force: true });
    if (landed) {
      // THE HOLD IS OPENED — the same arrangement as the WALL CLINCH's (`Enemy.headPin` plus the
      // `wallpin` state, which is the game's one reaction that lasts exactly as long as a move
      // keeps writing it — see `stepReaction`). What it wears is its OWN shape rather than the
      // flight's (`poseHurtScissor`): a body taken off its feet by the neck is LIMP — it hangs off
      // the grip — and the flight shape climbs to a launch pose, which is a body on its way
      // somewhere. (The flight shape also could not be reused here even if it fitted: `poseHurt`
      // passes `jolt` as its fifth argument, which for `poseHurtFlight` is the shape it starts
      // FROM — a jolt of 0.6 would arrive as `G = 0.6` and every key below would be NaN.)
      e.setState("wallpin", P.SCISSOR_STUN);
      e.hurtKind = "scissor";
      e.hurtPose = 1;
      e.ragdoll = false;
      e.flip = false;
      e.bounces = 0;
      e.tumble = 0; e.tumbleRate = 0; e.roll = 0; e.rollRate = 0;
      e.grounded = true;
      e.hitstop = 0;
      this.scissorGripT = 0;
      this.scissorHeld = true;
      this.scissorGrip(0);
    }
    this.lastScissor = { x: e.pos.x, y: e.pos.y + 1.25, z: e.pos.z, power: landed ? 1 : 0.5, counter: !!this.scissorCounter, e };
    if (landed) this.hitstop = Math.max(this.hitstop, P.SCISSOR_STOP * 1.5);
    this.events.push("scissorhit");
  },

  // THE GRIP — the victim's skull held on the CLAMP'S OWN CONTACT for the whole swing.
  //
  // It is the WALL CLINCH's placement, one verb over, and it is the same trick the clamp itself
  // runs on: the point the two ankles are solved onto (`scissorC`, which `scissorAnchor` keeps
  // every frame) is the point the skull is placed on, so the legs and the head are reading ONE
  // number and cannot drift apart by so much as a frame of rig lag. The contact does not move
  // during the swing — `scissorAnchor` freezes it the frame the shins cross — so what the move
  // reads as is the man somersaulting ABOUT the head he has, which is exactly what a head scissor
  // is, and the body he has it by hanging off it underneath.
  //
  // `hang` is the one difference from the wall's pin: this body is OFF ITS FEET (see the `wallpin`
  // ground solve in enemies.js), so the deck is left alone — the pose decides where the body hangs
  // and no floor gets a vote until the throw. `pitch` and `yaw` are the hang's own lean, eased onto
  // the body by the pin (see `E.PIN_TURN`), and `u` is played on the VICTIM's shape so the limp
  // arrival is spread over the hold rather than done on the bite frame.
  scissorGrip(dt) {
    const e = this.scissorTarget;
    if (!e || !e.built) return;
    this.scissorGripT += dt || 0;
    // ---- WHICH WAY THE VICTIM'S BODY LIES ----
    // Away from the man holding it, and read off the geometry rather than off an angle, because the
    // two are the same thing played at different speeds. The grip is a full REVOLUTION of the
    // attacker's rig about the contact (see `scissorAnchor`), so a victim pointed at a fixed compass
    // bearing is a victim the attacker's own body sweeps straight through on half of the turn — and
    // measured, it did: with the yaw written once, the player's hips and the victim's chest ended up
    // in one another for a third of the swing. Written as "the way I am looking from you", the two
    // bodies stay on opposite sides of the neck for every frame of the revolution, because the
    // victim's body is a spoke that the attacker's own offset keeps re-aiming.
    const ax = this.scissorC.x - this.pos.x;
    const az = this.scissorC.z - this.pos.z;
    const yaw = (ax * ax + az * az > 1e-4) ? Math.atan2(ax, az) : this.facing + Math.PI;
    e.headPin = {
      x: this.scissorC.x, y: this.scissorC.y, z: this.scissorC.z,
      yaw: yaw,
      pitch: P.SCISSOR_HANG_PITCH,
      // The one flag that separates this from the wall's pin: the body is OFF ITS FEET, so the deck
      // solve that stands a `wallpin` body up is SKIPPED (see the `wallpin` case in `enemies.js`).
      // Without it the solve drags the victim's feet back down onto the pavement every frame and
      // the hang it was just placed in is thrown away — the pose would decide where the body
      // hangs and the floor would overrule it.
      hang: true,
      u: Math.min(P.SCISSOR_HANG_U, this.scissorGripT * P.SCISSOR_HANG_RATE),
      jolt: P.SCISSOR_HANG_SAG * Math.min(1, this.scissorGripT / Math.max(1e-3, P.SCISSOR_HANG_SAG_T)),
    };
  },

  // THE THROW — the grip let go and the body hurled off it, once, on the first frame of the
  // landing. This is what the swing was for: the victim spends the whole turn carried by the neck
  // and leaves on the move's own knock and lift, which is the pair the move was always supposed to
  // spend on the throw rather than on the bite.
  scissorThrow() {
    this.scissorThrown = true;
    const e = this.scissorTarget;
    if (!e || !e.built) return;
    if (e.headPin) e.headPin = null;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const landed = e.hit("flight", fx, fz, P.SCISSOR_KNOCK, P.SCISSOR_STUN,
      { lift: P.SCISSOR_LIFT, flip: true });
    if (landed) {
      this.lastScissor = { x: e.pos.x, y: e.pos.y + 1.25, z: e.pos.z, power: 1, counter: !!this.scissorCounter, e };
      this.events.push("scissorthrow");
    }
  },

  // Let the neck go. Called from `setState` (the one choke point) and from `respawn`, so a hold can
  // never outlive the state that made it — the same bargain the whirl's, the launch's and the wall
  // clinch's own releases make, and idempotent in the same way. It matters more here than anywhere
  // else, because the victim of this move is OFF ITS FEET while it is held: a pin with nobody
  // writing it is a body hanging in mid-air with no move to hang off.
  releaseScissor() {
    const e = this.scissorTarget;
    if (e && e.built) e.headPin = null;
    this.scissorTarget = null;
  },

  // =========================================================================
  // SKILL 3 — THE LAUNCH. He SINKS into a deep coil and builds the charge there, snaps BOTH legs up
  // past his own face, and leaves the deck with them — and a kick that LANDS does not throw the body
  // away, it takes it WITH him: the player goes up into the sky with the body's face pinned on his
  // soles (`capoCarry`) and the air combo's window (`airComboT`) opens on the way up.
  //
  // It was a kip-up (session 56 — over backwards onto both palms, the legs whipped up over the face)
  // with a SECOND-PRESS launch (session 88) until this session. The user's brief for the re-shape:
  // *"remove the press twice thing for skill 3 and make it more like chargy animtion and make it
  // when it hits it drags the enemy up with the player liek the player hits the enemy with his kid
  // up but in the hit frame the player goes high up in the sky with the enemy face pressed against
  // the player feet and then while theyre mid air u start an air combo"*. So there is ONE press; the
  // launch belongs to the CONTACT rather than to a second key; and what the kick catches is carried.
  // =========================================================================
  capoeira() {
    // ONE PRESS, ONE MOVE (see the note above): a press arriving while the state runs is swallowed —
    // it is the same key and the move already owns it — so the old double-tap is not an action any
    // more, and a player mashing the skill does not queue anything up behind it.
    if (this.state === "capo") return true;
    if (this.capoCd > 0) return false;
    if (!this.canSkill()) return false;
    if (this.overT <= 0) this.capoCd = P.CAPO_CD;
    // No aim of its own: like the other two skills, it is pointed with the CAMERA (the facing pan in
    // `update`), because a skill locks the run and the camera is the only thing left with authority.
    this.setState("capo");
    this.capoT = 0;
    this.capoAir = false;
    this.capoHitDone = false;
    this.capoHit = false;
    this.capoCarryTarget = null;
    this.capoGrabT = -1;
    // THE CHARGE PLANTS HIM: the coil is a standstill, so the run's own momentum is bled off rather
    // than carried into it (the kick gets its drive from the leg, not from the approach).
    this.vel.x *= 0.30;
    this.vel.z *= 0.30;
    this.events.push("capo");
    return true;
  },

  // Which of the four the move is in, on the total clock.
  capoPhase() {
    const a = P.CAPO_CHARGE_T;
    const b = a + P.CAPO_KICK_T;
    if (this.capoT < a) return 0;
    if (this.capoT < b) return 1;
    // ...and what follows the kick is decided by whether it LANDED: a hit takes him UP (phase 3, the
    // carry), a whiff puts him back on the deck (phase 2, the recovery). Both are read off the same
    // clock, so the shape and the physics cannot disagree about which one is running.
    if (this.capoHit) return this.capoT < b + P.CAPO_CARRY_T ? 3 : -1;
    return this.capoT < b + P.CAPO_RECOVER_T ? 2 : -1;
  },

  // WHICH BEAT OF THE MOVE we are in, in ONE place: the phase, how far into it, and how long it is.
  // The pose dispatch, the rig's own bank and the carry all read it, so no two of them can disagree
  // about where the move is — the same argument `whirlPhase` makes for the whirl. `phaseArg` lets a
  // caller ask about a phase other than the live one (the pose keeps drawing the move's LAST phase
  // for as long as its weight is fading, and that phase's own `ph` has to be the frame it stopped
  // on, not 1).
  capoBeat(phaseArg) {
    const a = P.CAPO_CHARGE_T;
    const b = a + P.CAPO_KICK_T;
    const phase = phaseArg === undefined ? this.capoPhase() : phaseArg;
    const start = phase === 0 ? 0 : phase === 1 ? a : b;
    const len = phase === 0 ? a : phase === 1 ? P.CAPO_KICK_T
      : (phase === 3 ? P.CAPO_CARRY_T : P.CAPO_RECOVER_T);
    const ph = Math.min(1, Math.max(0, (this.capoT - start) / Math.max(1e-3, len)));
    return { phase, ph, start, len };
  },

  updateCapo(dt, inp) {
    this.capoT += dt;
    const phase = this.capoPhase();
    if (phase < 0) {
      this.releaseCapoCarry();
      this.setState(this.grounded ? "ground" : "air");
      return;
    }
    if (phase === 1 && !this.capoAir) {
      // THE KICK LEAVES THE DECK. It is a hop on a whiff and the sky on a hit: the kick itself only
      // pops him (`CAPO_KICK_POP`), and `capoContact` adds `CAPO_JUMP` on the frame the kick LANDS —
      // which is why the hit frame is the frame the sky opens, word for word the user's *"in the hit
      // frame the player goes high up in the sky"*.
      this.capoAir = true;
      this.grounded = false;
      this.vel.y = Math.max(this.vel.y, P.CAPO_KICK_POP);
    }
    // The kick's own contact: at the top of the snap, and it is the WIDEST wedge in the game — the
    // legs are the weapon and they sweep the whole arc in front of him.
    if (!this.capoHitDone && this.capoT >= P.CAPO_CHARGE_T + P.CAPO_KICK_T * 0.34) {
      this.capoHitDone = true;
      this.capoContact();
    }
    if (this.grounded) {
      this.vel.x = approach(this.vel.x, 0, 16 * dt);
      this.vel.z = approach(this.vel.z, 0, 16 * dt);
    }
  },

  // Let the body the carry is holding go — into the AIR COMBO's own hands, so the handover from the
  // rise to the juggle is a body that is already moving with him rather than one dropped on the frame
  // the state changes. It is the launch's `releaseWhirl`: idempotent, and called from the one place
  // every way out of the state goes through (`setState`, plus the move's own end).
  releaseCapoCarry() {
    const e = this.capoCarryTarget;
    this.capoCarryTarget = null;
    this.capoGrabT = -1;
    if (!e) return;
    if (e.capoCarry) e.capoCarry = null;
    if (!e.built) return;
    // Handed to the juggle: airborne, travelling with the man who was holding it, so `comboY` (the
    // player's own altitude, written every frame while `airComboT` is open) takes it from here and
    // the body is drawn up alongside him by its own eased draw.
    e.grounded = false;
    e.vel.x = this.vel.x;
    e.vel.z = this.vel.z;
    e.vel.y = this.vel.y;
  },

  capoContact() {
    if (!this.enemies || !this.enemies.spawned) return;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    // ...and the wedge takes RAGDOLLS as well (`{ragdolls: true}`): the user's *"make the 3rd skill
    // hit ragdoll no matter how many times the ragdoll have been hit"* — a body the finisher already
    // threw is exactly what this kick is supposed to pick back up, and the default wedge (which the
    // CHAIN needs) would pass straight through it.
    const hits = this.enemies.inFront(this.pos.x, this.pos.z, fx, fz, P.CAPO_REACH, P.CAPO_ARC,
      [this.pos.y - P.HY - P.CAPO_DOWN, this.pos.y + P.HY + P.CAPO_UP], { ragdolls: true });
    let any = false;
    // ...and the body it CAUGHT is the nearest one the wedge found, because that is the one the boot
    // is on: anything else the sweep reaches is thrown the way the kick always threw.
    let best = null;
    let bestD = Infinity;
    for (const e of hits) {
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1e-3;
      // The kick sweeps ACROSS the front, so the body is thrown outward from the body's own line
      // rather than straight down it — the shove is along the line to the body, with the facing
      // mixed in so nothing goes backwards.
      let ux = (dx / d) * 0.7 + fx * 0.3;
      let uz = (dz / d) * 0.7 + fz * 0.3;
      const n = Math.hypot(ux, uz) || 1;
      ux /= n;
      uz /= n;
      // ...and it RAGDOLLS. `force: true` takes a body that is ALREADY ragdolling, which is the whole
      // point of the user's own ask — a body that has been thrown before, however many times, is
      // picked up and thrown again rather than passed through. A LOOSE body is also what the carry
      // wants (it hangs limp off the boot) and what the air combo's window takes (see the README's
      // note on the window taking ragdolls at all).
      const landed = e.hit("flight", ux, uz, P.CAPO_KNOCK, P.CAPO_STUN,
        { dmg: P.CAPO_DMG, lift: P.CAPO_LIFT, ragdoll: true, force: true });
      if (landed) {
        any = true;
        if (d < bestD) { bestD = d; best = e; }
        this.lastCapo = { x: e.pos.x, y: e.pos.y + 1.2, z: e.pos.z, power: 1, e };
      }
    }
    if (any) {
      // THE HIT FRAME IS THE LAUNCH FRAME. There is no second press to wait for: the kick landing is
      // what opens the sky, and the body it landed on is what comes with him (`capoCarryTarget`,
      // held by the face on his soles from the very next frame — see `updateVisual`).
      this.capoHit = true;
      this.capoCarryTarget = best;
      this.capoAir = true;
      this.grounded = false;
      this.vel.y = Math.max(this.vel.y, P.CAPO_JUMP);
      this.vel.x += fx * P.CAPO_JUMP_PUSH;
      this.vel.z += fz * P.CAPO_JUMP_PUSH;
      this.airComboT = P.CAPO_AIR_T;
      this.airComboIdle = P.AIR_IDLE;
      this.squash = -0.55;
      if (this.sfx && this.sfx.jump) this.sfx.jump();
      this.hitstop = Math.max(this.hitstop, P.CAPO_STOP);
      this.events.push("capohit");
      this.events.push("capojump");
    }
  },
  // THE WHIRL'S OWN LAYER (lifted out of `updateVisual`): its cross-fade and `poseWhirl`, read off
  // the SAME table the impacts are fired from (`whirlPhase`), so the shape can never show a phase
  // the physics is not in.
  solveWhirlPose(dt, ud) {
    this.whirlPose = approach(this.whirlPose, this.state === "whirl" ? 1 : 0, dt / SKILL_POSE_FADE);
    if (ud && ud.poseWhirl && this.whirlPose > 0.002) {
      // The phase (and its own 0..1) come off the SAME table the impacts do (see `whirlPhase`), so
      // the shape is always the phase that is actually running.
      const wp = this.whirlPhase();
      ud.poseWhirl(this.whirlPose, Math.min(1, this.whirlT / Math.max(1e-3, this.whirlTotal())),
        wp.phase, wp.ph, this.whirlStride, this.whirlHold);
    }
  },

  // THE FLYING KNEE'S OWN LAYER (lifted out of `updateVisual`): its cross-fade and
  // `poseFlyingKnee`, with the LEAP's and the LANDING's own clocks solved here from the same fields
  // the physics reads (`kneeMark`/`kneeLeapT`, `kneeLandMark`/`KNEE_RECOVER`), so the shape cannot
  // show a beat the body is not in.
  solveKneePose(dt, ud) {
    // THE FLYING KNEE (see `knee` / `updateKnee`). Its phase dispatch is the move's own three
    // beats, read off the SAME fields the physics runs on so the shape can never show a beat the
    // body is not in: the RUN-UP's legs are the run cycle's, advanced off the speed actually
    // carried (`kneeStride`); the LEAP's `u` is its own solved clock (`kneeLeapT`, the arc it was
    // thrown on); and the LANDING's is the settle, counted from the frame the feet found the deck
    // (0 while it is still falling, which holds the landing brace).
    this.kneePose = approach(this.kneePose, this.state === "knee" ? 1 : 0, dt / SKILL_POSE_FADE);
    if (ud && ud.poseFlyingKnee && this.kneePose > 0.002) {
      let ku = 0;
      if (this.kneePhase === 1) {
        ku = Math.min(1, Math.max(0, (this.kneeT - this.kneeMark) / Math.max(1e-3, this.kneeLeapT)));
      } else if (this.kneePhase === 2 && this.grounded) {
        ku = Math.min(1, Math.max(0, (this.kneeT - this.kneeLandMark) / Math.max(1e-3, P.KNEE_RECOVER)));
      }
      ud.poseFlyingKnee(this.kneePose, this.kneePhase, ku, this.kneeStride, this.kneeHit ? 1 : 0);
    }
  },

  // THE HEAD SCISSOR'S OWN LAYER (lifted out of `updateVisual`): its cross-fade and `poseScissor`
  // (the bite, the trunk's aim, the miss and the clamp's own `post` progress).
  solveScissorPose(dt, ud) {
    this.scissorPose = approach(this.scissorPose, this.state === "scissor" ? 1 : 0, dt / SKILL_POSE_FADE);
    if (!ud || this.scissorPose <= 0.002) return;
    // ---- THE DECK HALF IS NOT THE SCISSOR'S SHAPE (see `SCISSOR_MISS_DOWN`) ----
    // The air half wears the scissor (`poseScissor`, below); the deck half wears the game's OWN
    // knocked-down body — `poseHurt`'s `down`, then `getup`, the very shapes an enemy wears on its
    // back (see the HURT block in streetwear.js) — so a whiffed player goes down the way everybody
    // else in the street does, and the hand-out at the end of the rise is exact (the `getup` shape
    // ends ON `REST`, which is where the ground state's idle begins). One layer, one weight: the
    // same `scissorPose` fades whichever of the two is on.
    if (this.scissorMiss && this.scissorMissDeck && ud.poseHurt) {
      const settling = this.scissorMissPhase === 1;
      const t = settling
        ? Math.min(1, this.scissorDownT / Math.max(1e-3, P.SCISSOR_MISS_SETTLE))
        : Math.min(1, this.scissorGetupT / Math.max(1e-3, P.SCISSOR_MISS_GETUP));
      ud.poseHurt(this.scissorPose, settling ? "down" : "getup", t, 0, 0);
      return;
    }
    if (ud.poseScissor) {
      const g = P.SCISSOR_GUARD_T;
      const l = g + P.SCISSOR_LEAP_T;
      const t2 = l + P.SCISSOR_TWIST_T;
      const phase = this.scissorT < g ? 0 : this.scissorT < l ? 1 : this.scissorT < t2 ? 2 : 3;
      const start = phase === 0 ? 0 : phase === 1 ? g : phase === 2 ? l : t2;
      const len = phase === 0 ? g : phase === 1 ? P.SCISSOR_LEAP_T : phase === 2 ? P.SCISSOR_TWIST_T : P.SCISSOR_LAND_T;
      const ph = Math.min(1, Math.max(0, (this.scissorT - start) / Math.max(1e-3, len)));
      // THE CLAMP's own handover, read off the SAME numbers the anchor was placed with (`bite` is
      // how far the scissors have snapped shut, and `tgt`/`tgtz` are the ankles' IK target in the
      // rig's own frame — the point the body's placement put on the neck), so the shape and the
      // position cannot disagree about where the opponent is.
      //
      // ...and `post` is the clamp's progress AFTER the shut (0 until `SCISSOR_HIT_AT`, 1 at the
      // clamp's end), which is the beat a MISS is made of: the jaws close on nothing and then the
      // legs swing down and through and the trunk follows them over. Computed here rather than in
      // the pose because `SCISSOR_HIT_AT` is this file's number — the shape is handed a channel,
      // not a constant to keep a copy of.
      const post = Math.min(1, Math.max(0,
        (this.scissorClamp - P.SCISSOR_HIT_AT) / Math.max(1e-3, 1 - P.SCISSOR_HIT_AT)));
      ud.poseScissor(this.scissorPose, Math.min(1, this.scissorT / Math.max(1e-3, t2 + P.SCISSOR_LAND_T)),
        phase, ph, this.scissorBite, this.scissorTgtY, this.scissorTgtZ, this.scissorMiss, post);
    }
  },

  // THE CAPOEIRA'S OWN POSE LAYER (lifted out of `updateVisual`). Its weight rides the skills' own
  // fade, and — unlike the three dial skills — WHICH PHASE IT IS DRAWN IN is held rather than read
  // live, so the live phase is handed in from the caller (`capoPhase`, `-1` when the state is not
  // `capo`).
  solveCapoPose(dt, ud, capoPhase) {
    this.capoPose = approach(this.capoPose, this.state === "capo" ? 1 : 0, dt / SKILL_POSE_FADE);
    // WHICH PHASE THE POSE IS DRAWN IN is the LIVE one while the state runs — and the last one it
    // reached for as long as `capoPose` is still on the rig. `capoT` stops when the state ends, so
    // the held phase settles on its own final frame and simply cross-fades out under the next
    // pose. It matters because the LAUNCH's last frame is the shape the air pose wants next
    // (`AIR_LEG[0]` — the same hips, the same two legs), so holding it makes the handover into
    // `air` a blend. Without it the layer disappeared on the very frame the state changed, the
    // limbs fell all the way back to `poseRun`'s rest pose, and the air pose took a third of a
    // second to ease them back out — measured: **0.41 u of foot travel in one frame**, four times
    // the move's own hardest frame, which is exactly the kind of pop the whole pose stack exists
    // to prevent.
    if (capoPhase >= 0) this.capoDrawPhase = capoPhase;
    if (ud && ud.poseCapo && this.capoPose > 0.002 && this.capoDrawPhase >= 0) {
      // ...and the held phase keeps its own clock: `capoT` stops with the state, so the drawn `ph`
      // settles on the frame the state ended on rather than snapping to 1.
      const cb = this.capoBeat(this.capoDrawPhase);
      ud.poseCapo(this.capoPose, this.capoT, this.capoDrawPhase, cb.ph);
    }
  },

  // THE WHIRL'S LIVE NECK CONTACT (lifted out of `updateVisual`). The whirl has a body by the throat
  // whose position something else owns (the haul is a velocity), so the neck is walked into the
  // player's own frame every frame and handed to `setWhirlNeck` — the same bargain the clinch and the
  // wall clinch make with `_clinchV` (player/pose.js).
  solveWhirlNeck(ud) {
    if (ud && ud.clearWhirlNeck) ud.clearWhirlNeck();
    if (ud && ud.setWhirlNeck && this.whirlTarget && this.whirlTarget.built && this.whirlHold > 0.002) {
      const we = this.whirlTarget;
      if (we.headPoint) {
        this.charMesh.updateWorldMatrix(true, false);
        we.headPoint(_clinchV);
        this.charMesh.worldToLocal(_clinchV);
        ud.setWhirlNeck(_clinchV.x, _clinchV.y, _clinchV.z);
      }
    }
  },

  // THE CARRY's live contact, written last in `updateVisual`: the point the caught body's FACE is held to is the
  // midpoint of the player's two SOLES, read off the rig after this frame's pose (and `stretchApply`) has been
  // written — so it is the boot that is drawn, not a formula that agrees with it. Walked in over `CAPO_CARRY_GRAB`
  // so the yank reads, and CLEARED the moment the carry is not running.
  solveCapoCarry(dt, capoPhase) {
    // ---- THE CARRY, written LAST (skill 3's own hold — see `capoCarry`) ----
    // The point the body's face is held to is the midpoint of the two SOLES, taken off the rig after
    // this frame's pose has been written — so it is the boot that is DRAWN, not a formula that agrees
    // with it. It is written every frame while the carry runs and CLEARED the moment it does not
    // (like `carryOrbit`/`comboY`), so the body can never be left pinned by a hold nobody is
    // maintaining.
    //
    // It belongs HERE and not up with the whirl's own neck contact, and the difference is 0.7 u: the
    // whirl solves against a body the PLAYER places, so reading the fingers a frame early costs
    // nothing, but this one reads the soles — and the soles are the end of a limb chain whose pose
    // for this frame is not written until the pose stack below/above runs, and whose LENGTH is not
    // final until `stretchApply` has spent this frame's request. Measured with the block up in the
    // contacts: the target sat **0.61-0.78 u** behind and below the boot it was supposed to be on —
    // the sole as it stood a frame ago, with the legs still up out of the kick — for every frame of
    // the carry. Down here the head lands on the boot to **0.000** and the only offset left is
    // `CAPO_CARRY_GAP`.
    if (this.capoCarryTarget) {
      const ce = this.capoCarryTarget;
      if (ce.built && this.state === "capo" && capoPhase === 3) {
        const cb = this.charMesh && this.charMesh.userData && this.charMesh.userData.bones;
        if (cb && cb.footL && cb.footR) {
          this.charMesh.updateWorldMatrix(true, true);
          cb.footL.getWorldPosition(_capoSoleA);
          cb.footR.getWorldPosition(_capoSoleB);
          _capoSoleA.add(_capoSoleB).multiplyScalar(0.5);
          // THE GRAB IS A YANK, NOT A TELEPORT. The body the kick caught has been flying loose for
          // the rest of the kick's beat, so its head is up to a body and a half away from the boot
          // when the carry starts — and a head that SNAPS that far in one frame is a head that
          // teleported. The target is therefore walked in from where the head actually was on the
          // first frame of the carry, over `CAPO_CARRY_GRAB`: fast enough to read as being taken by
          // the face, slow enough to read at all.
          _capoBoot.set(_capoSoleA.x, _capoSoleA.y - P.CAPO_CARRY_GAP, _capoSoleA.z);
          if (this.capoGrabT < 0) {
            this.capoGrabT = 0;
            this.capoGrabFrom.copy(_capoBoot);
            if (ce.headPoint) {
              ce.headPoint(_capoHead);
              this.capoGrabFrom.copy(_capoHead);
            }
          } else {
            this.capoGrabT += dt;
          }
          const k = smooth01(Math.min(1, this.capoGrabT / Math.max(1e-3, P.CAPO_CARRY_GRAB)));
          if (k < 1) _capoBoot.lerp(this.capoGrabFrom, 1 - k);
          ce.capoCarry = {
            x: _capoBoot.x,
            y: _capoBoot.y,
            z: _capoBoot.z,
            yaw: this.facing + P.CAPO_CARRY_YAW,
            pitch: P.CAPO_CARRY_PITCH,
          };
        }
      } else if (ce.capoCarry) {
        ce.capoCarry = null;
      }
    }
  },
};

export function installSkills(Player) {
  Object.assign(Player.prototype, skillMethods);
}
