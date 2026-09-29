// ---------------------------------------------------------------------------
// THE RUNNING LUNGE — THE PANTHER (part 7 of the player.js split).
//
// The six methods of the unwired running grab: the button that opens it, the
// pounce's wedge test, the take, the roll's carry (both bodies on one ball), the
// release and the frame-by-frame solver, in a table `installLunge` copies onto
// `Player.prototype`.
//
// A LEAF with respect to player.js: it imports `P` (player/config.js) and `TAU`
// (player/math.js). No scratch, no three.js. Still UNWIRED — nothing calls
// `startLunge` (see the note in the table below) — so the move only runs if it is
// brought back through `grab`.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { TAU, approach } from "./math.js";
import { SKILL_POSE_FADE } from "./pose.js";

const lungeMethods = {

  // =========================================================================
  // THE RUNNING LUNGE — THE PANTHER.
  //
  // !! UNWIRED since session 89: the user's *"remove the lunge"*. Nothing calls `startLunge` any
  // more (see `grab`), so this state cannot be entered — the whole section is left in place, whole
  // and unread, the same way the whirl's is, so bringing the move back is one line in `grab`. !!
  //
  // The brief, verbatim: *"make me if im running fast like above 20 speed and i press m2 make me do
  // a lunge i throw my self forward and if i fail to grab an enemy if roll and get slowed down a
  // bit and make the animtion like yk when a panther or a lion or a tiger lunges make it smth like
  // that and if i land the running grab i take the enemy and we both roll untill i do a jump
  // spreading my arms and legs and let go of him before that ofc make it momentum friendly"*.
  //
  // It is the RIGHT BUTTON's own move, thrown ahead of the standing grab when the body is carrying
  // `LUNGE_MIN` or over (see `grab`) — and the whole of it is momentum, so the state owns the
  // horizontal from the press to the landing of the leap-off. ONE state (`lunge`) and FOUR beats
  // (`lungePhase`):
  //
  //   POUNCE (0)   the leap: he leaves along the line he was RUNNING on (never the aim — a throw
  //                that stopped to turn would be a step), at the speed he arrived with plus a tenth,
  //                and he spends a fifth of that over the flight. Every frame of it tests the wedge
  //                in front for a body (see `lungePick`) and the beat ends when the paws find the
  //                deck (or on `LUNGE_T`, whichever comes first).
  //   MISS ROLL (1) nothing was there: he lands out of the pounce into a forward roll that sheds a
  //                THIRD of the run — the brief's *"if roll and get slowed down a bit"* — one whole
  //                revolution, out of which he comes up on his feet.
  //   CLINCH ROLL (2) something WAS there: the body is taken on the landing and the two of them go
  //                over together, once, on the deck — the body is PLACED on the same ball the player
  //                is turning about (see `lungeHoldBody`), so they read as one object rather than a
  //                man and a body that happen to be near each other.
  //   SPREAD JUMP (3) the exit, and it is the brief's own: he springs off the roll with the arms and
  //                the legs thrown OUT (`poseLunge`) and whatever the roll had left of the run
  //                CARRIED into the air, which is what "momentum friendly" is. It ends when the feet
  //                find the deck.
  //
  // The MISS and the TAKE are decided on the frame the pounce ENDS, not on the frame a body first
  // enters the wedge, because that is what the brief says: *"if i LAND the running grab i take the
  // enemy"*. The wedge is read every frame (so a pounce past a body's flank still finds it) but it
  // is re-read at the landing and the nearest body wins there.
  //
  // Nothing here is a ragdoll and nothing here throws: the body is held, rolled and let go, which is
  // the whole of it. A target that dies mid-roll is released by `setState` (like the whirl's neck).
  // =========================================================================

  // THE BUTTON. Returns false when the press is not a lunge after all, so `grab` can fall through
  // to the three animals.
  startLunge(sp) {
    const drive = Math.min(P.MAX_SPEED, Math.max(sp, P.LUNGE_MIN) * P.LUNGE_DRIVE);
    this.setState("lunge");
    this.lungeT = 0;
    this.lungePhase = 0;
    this.freeRoll = false;
    this.lungeTarget = null;
    this.lungeTake = false;
    this.lungeReleased = false;
    this.lungeSpeed = drive;
    this.lungeRoll = 0;
    this.lungeRollV = drive;
    this.lungeBall = 0;
    this.lungeHopT = 0;
    this.lungeBlendT = 0;
    this.lungeWindFrom = 0;
    this.lungeWindTo = 0;
    this.lungeGrab0 = null;
    this.lungeCd = P.LUNGE_CD;
    this.lungeDeckY = this.pos.y - P.HY;
    this.lastLunge = null;
    // Where the miss roll stops being a ball and comes up onto its feet, read off the POSE layer's
    // own table (see `LUNGE.riseAt` in streetwear.js): the shape's rise and the ball's own weight
    // have to turn over on the same frame, so the number lives with the shape.
    const pc = this.charMesh && this.charMesh.userData.poseCfg;
    this.lungeRiseAt = pc && pc.LUNGE && pc.LUNGE.riseAt != null ? pc.LUNGE.riseAt : 0.72;
    // The hands are EMPTY for the whole of it: the state is not the grab's, so its own take/grip
    // flags are cleared rather than left over from a previous haul (the pose solves its hands off
    // the same flags — see the `grabPoint` block in `updateGrab`).
    const ud = this.charMesh && this.charMesh.userData;
    if (ud && ud.clearGrabPoint) ud.clearGrabPoint();
    this.grabTarget = null;
    this.grabTake = false;
    this.grabReleased = true;
    this.grabSpinY = 0;
    this.grabFlip = 0;
    this.attackBuf = 0;
    this.jumpBuffer = 0;
    if (this.overT <= 0) this.grabCd = P.GRAB_CD;
    // THE LINE IS THE RUN'S OWN (see the note above): the way the body is already travelling, which
    // is also the line the wedge is thrown down. A body running at 20 u/s is pointed where it is
    // going whether or not the camera agrees, so this is both the honest read and the one that
    // cannot be wrong.
    this.facing = Math.atan2(this.vel.x, this.vel.z);
    this.vel.x = Math.sin(this.facing) * drive;
    this.vel.z = Math.cos(this.facing) * drive;
    this.vel.y = P.LUNGE_POP;
    this.grounded = false;
    // NO SQUASH, and that is not an oversight: `squash` scales the WHOLE rig (see `updateVisual`),
    // and the ball the two rolls are placed on is a MEASURED shape (`LUNGE_BALL_*`) — a body
    // stretched 10% in y is no longer the shape that was measured, so it hangs off the ball it is
    // supposed to be rolling on (measured: the first draft's entry squash of -0.30 put the tuck
    // 0.138 under the deck at the quarter turns, which is exactly the 10% the stretch added to the
    // tuck's own 1.27 of height). The pounce's read is its SHAPE — the arch, the lay-out, the
    // trailing feet — and none of that needs a scale.
    this.squash = 0;
    if (this.sfx && this.sfx.dash) this.sfx.dash();
    this.events.push("lunge");
    return true;
  },

  // THE FREE FALL'S ROLL-OUT (session 194 — see `P.FREE_ROLL_*`). The user's *"add better landing
  // animation for free fall ... make it i roll ... dont make have a start up like it is now just make
  // it i land and i do a little parkour roll then get on my feet"*.
  //
  // A hard skyfall landing used to wear the standing ABSORB (`poseLand`: weight onto the heels, both
  // arms out) — a catch, i.e. exactly the "start up" the user is rejecting. A body coming off a
  // forty-metre roof has too much forward momentum to catch: it rolls. So the landing enters the
  // running lunge's own MISS ROLL directly, at the `lungePhase === 1` beat, and rides it out to the
  // feet. NOTHING is re-authored: the tuck, the whole-revolution turn (`grabFlip`), the ball the rig
  // is placed on (`LUNGE_BALL_*`), the rise onto the feet (`riseAt`) and the deck-clamp handover are
  // all the shape the panther has worn since session 89 — it has simply never been reachable, because
  // the lunge was unwired. This is its one live entrance.
  //
  // The ENTRY is the whole of the new work, and the two things it is careful about are the user's two
  // words: "no start up" and "roll". (1) No start up is `lungeHopT = -1`: phase 1's little leap (the
  // beat the pounce lands on before the roll opens) is skipped by parking its clock past its own
  // window (`updateLunge` only holds the roll while `lungeHopT > -0.25`), so the roll begins on the
  // frame the feet touch. (2) Roll is the drive: a roll that cannot go forward is a crouch, so the
  // fall's own horizontal is carried on the line the fall was travelling and FLOORED at
  // `FREE_ROLL_MIN_SPEED` for a fall that arrives almost straight down.
  //
  // Called from `tickLanding`'s non-slam branch (see `player/landing.js`), which has already fired the
  // thud, the dust and the `land` event: the roll lands exactly as hard as the catch would have.
  startFreeRoll() {
    // The line: a roll has no aim of its own, it is the fall's own heading laid onto the deck. Below
    // a walking pace there is nothing worth turning for, so a near-vertical drop keeps the facing it
    // landed with and the floor does the rest.
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 1.2) this.facing = Math.atan2(this.vel.x, this.vel.z);
    const sinF = Math.sin(this.facing);
    const cosF = Math.cos(this.facing);
    const drive = Math.max(P.FREE_ROLL_MIN_SPEED, hs * P.FREE_ROLL_CARRY);
    this.setState("lunge");
    this.lungeT = 0;
    this.lungePhase = 1;
    this.freeRoll = true;
    this.lungeTarget = null;
    this.lungeTake = false;
    this.lungeReleased = false;
    this.lungeSpeed = drive;
    this.lungeRoll = 0;
    this.lungeRollV = drive;
    this.lungeBall = 0;
    // NO HOP (see the note above): parked past the window phase 1 waits for, so the roll's clock runs
    // from zero on this frame. `lungeBlendT` is left at zero too — the crossfade echoes the POUNCE's
    // lay-out in underneath the roll, and there was no pounce here; the fall's own shape is what the
    // tuck cross-fades out of (see `solveFallPose` / `solveLungePose`).
    this.lungeHopT = -1;
    this.lungeBlendT = 0;
    this.lungeWindFrom = 0;
    this.lungeWindTo = 0;
    this.lungeGrab0 = null;
    this.lungeCd = P.LUNGE_CD;
    this.lungeDeckY = this.pos.y - P.HY;
    this.lastLunge = null;
    // Where the miss roll stops being a ball and comes up onto its feet, read off the POSE layer's
    // own table (see `startLunge` and `LUNGE.riseAt` in streetwear.js): the shape's rise and the
    // ball's own weight turn over on the same frame, so the number lives with the shape.
    const pc = this.charMesh && this.charMesh.userData.poseCfg;
    this.lungeRiseAt = pc && pc.LUNGE && pc.LUNGE.riseAt != null ? pc.LUNGE.riseAt : 0.72;
    // The hands are empty for the whole of it (see `startLunge`): the state is not the grab's, so its
    // own take/grip flags are cleared rather than left over from a previous haul.
    const ud = this.charMesh && this.charMesh.userData;
    if (ud && ud.clearGrabPoint) ud.clearGrabPoint();
    this.grabTarget = null;
    this.grabTake = false;
    this.grabReleased = true;
    this.grabSpinY = 0;
    this.grabFlip = 0;
    this.attackBuf = 0;
    this.jumpBuffer = 0;
    if (this.overT <= 0) this.grabCd = P.GRAB_CD;
    // The feet are ON the deck — that is the whole premise of the entrance — and the fall's own
    // vertical is spent on it: the roll's horizontal replaced it above.
    this.grounded = true;
    this.vel.x = sinF * drive;
    this.vel.z = cosF * drive;
    this.vel.y = 0;
    // NO SQUASH, exactly as `startLunge`: `squash` scales the WHOLE rig and the ball the roll is
    // placed on is a MEASURED shape, so a stretched body hangs off its own ball.
    this.squash = 0;
    this.camDrop = 0;
    this.events.push("freeroll");
  },

  // The one wedge test the pounce makes, run on every frame of it: the nearest body in front, in the
  // band the paws can reach. It only READS — the take is resolved on the frame the pounce ends (see
  // `updateLunge`). The height band is measured off the player's own FEET, the same convention
  // everything else in this file uses, so "at my feet" is the deck and not the capsule's middle.
  lungePick() {
    if (!this.enemies || !this.enemies.spawned) return null;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    const py = this.pos.y - P.HY;
    const hits = this.enemies.inFront(this.pos.x, this.pos.z, fx, fz, P.LUNGE_REACH, P.LUNGE_ARC,
      [py - P.LUNGE_BELOW, py + P.LUNGE_ABOVE]);
    let best = null;
    let bestD = Infinity;
    for (const e of hits) {
      if (!e.built || e.ragdoll) continue;
      // A body already flat on the mat is NOT pounced on and rolled with: `hit` promotes anything
      // put on a decked body to a LAUNCH (`decked` in enemies.js — only the finisher and a slam are
      // exempt), which is a different move entirely, and the hold below would have nothing it could
      // write. It is the same read `whirlGrab` makes of a ragdoll, one state further along.
      if (e.state === "down") continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  },

  // THE TAKE — the pounce's landing on a body. It is the CLINCH's own reaction (a body held by the
  // head/shoulders), LONG-held and PLACED rather than dragged, which is the whirl's own bargain (see
  // `whirlGrab`): `grabDist` and a `grabT` longer than the move mean the haul never lets go, and
  // `carryOrbit` then owns where the body actually is.
  lungeTakeNow(e) {
    const dx = Math.sin(this.facing);
    const dz = Math.cos(this.facing);
    this.lungeTarget = e;
    const landed = e.hit("clinch", dx, dz, P.LUNGE_KNOCK, P.LUNGE_STUN, { dmg: P.LUNGE_DMG, force: true });
    // The grab OWNS it: whatever it was wearing or doing is spent here (the ankle slam's own
    // bargain), because it is being held and rolled rather than falling or recovering.
    e.ragdoll = false;
    e.flip = false;
    e.bounces = 0;
    e.tumble = 0;
    e.tumbleRate = 0;
    e.roll = 0;
    e.rollRate = 0;
    e.hurtKind = "clinchRoll";
    e.grabDist = P.CLINCH_ROLL_DIST;
    e.grabT = 99;
    // Where it was when it was taken, relative to the player: the hold walks in from here (see
    // `lungeHoldBody`) rather than teleporting a body taken at the far end of the reach. The
    // VERTICAL is part of it because the take happens in the AIR (the pounce is half a metre up when
    // its paws arrive) and the hold's own height is the ball's, so a body snapped straight onto the
    // ball would drop out of the hands it was just caught by.
    this.lungeGrab0 = { x: e.pos.x - this.pos.x, y: e.pos.y - this.pos.y, z: e.pos.z - this.pos.z };
    this.lastLunge = { x: e.pos.x, y: e.pos.y + 1.0, z: e.pos.z, e };
    this.events.push("lungtake");
    if (landed) this.hitstop = Math.max(this.hitstop, P.GRAB_STOP * 1.2);
    if (this.sfx && this.sfx.squeeze) this.sfx.squeeze();
    return landed;
  },

  // WHERE THE BODY IS through the clinch roll: PLACED, never hauled (the ankle slam's own bargain,
  // see `updateGrabSlam`), on the ball the pair are turning about.
  //
  // Both bodies turn about the SAME point — the tuck's own centroid (`LUNGE_BALL_*`) — so they read
  // as one object going over. The player's side of that is in `updateVisual` (the rig is offset by
  // `P - R·P`); this is the same arithmetic for a body whose position is its own feet line, so the
  // centroid's offset has to come back OUT of the placement, and the group's own `HY` with it.
  // The turn is handed over as `lay`, which enemies.js assigns straight to the rig (see the
  // `direct` rule in `updatePose`) — the whirl's own channel, for the whirl's own reason: where a
  // carried body POINTS is part of where it IS. And once the roll owns the pair, the placement is
  // drawn all the way onto the carrier's own origin (x, y and z — see the pin below), so the two
  // rigs turn on one pivot and read as one object going over.
  lungeHoldBody(e, u, s) {
    const ca = Math.cos(s * TAU);
    const sa = Math.sin(s * TAU);
    const py = P.LUNGE_BALL_PY;
    const pz = P.LUNGE_BALL_PZ;
    // ...and the whole placement is weighted by the ball's own blend (`lungeBall`, the same number
    // the player's own rig is placed by — see `updateVisual`). At 1 this is "the body is on the
    // ball"; at 0 it is "the body is on the carrier's own feet line", which is where it was caught
    // and where the hold's first frame has to be, or the pair come onto the ball one frame apart and
    // the held body drops half a metre through the arms that are holding it.
    const b = this.lungeBall;
    // The hold's own point, and it WALKS IN: a body caught at the far end of the paws' reach is
    // hauled in to the chest rather than snapped there. The rate is DERIVED rather than authored —
    // the gap divided by the speed the pair are actually travelling at — because that is the one
    // rate that puts the body on the hold without yanking it: closed any faster and the body is
    // dragged along in front of a man moving faster than it (a body teleporting FORWARD), and any
    // slower and the player runs through it.
    const holdX = Math.sin(this.facing) * P.CLINCH_ROLL_DIST;
    const holdZ = Math.cos(this.facing) * P.CLINCH_ROLL_DIST;
    // Where the body's own origin has to end up, relative to the player's (which is the frame
    // `lungeGrab0` is measured in): the ball's centre at `cy`, less the rotated offset back to the
    // body's origin, less the half-height the rig's own origin sits above its feet line.
    const wantY = -P.HY + b * ((this.lungeDeckY + P.LUNGE_BALL_R + P.LUNGE_BALL_CLEAR - this.pos.y) - (ca * py - sa * pz));
    let ox = holdX;
    let oz = holdZ;
    let oy = wantY;
    if (this.lungeGrab0) {
      const gap = Math.max(0, Math.hypot(this.lungeGrab0.x, this.lungeGrab0.z) - P.CLINCH_ROLL_DIST);
      const sp = Math.max(1, Math.hypot(this.vel.x, this.vel.z));
      const rate = Math.max(1e-4, Math.min(P.LUNGE_HOLD_MAX, gap / sp));
      const g = Math.min(1, this.lungeT / rate);
      const gg = g * g * (3 - 2 * g);
      ox = this.lungeGrab0.x + (holdX - this.lungeGrab0.x) * gg;
      oz = this.lungeGrab0.z + (holdZ - this.lungeGrab0.z) * gg;
      oy = this.lungeGrab0.y + (wantY - this.lungeGrab0.y) * gg;
    }
    const cx = this.pos.x + ox;
    const cz = this.pos.z + oz;
    // ...and then the ROLL pins it: the pair go over as ONE object, so the held body's origin is
    // drawn onto the carrier's own (x, y and z — all three) by the ball's own weight. The walk-in
    // above still owns the take and the hop (b is ~0 there), and the pin only arrives with the
    // roll itself — which is what keeps the catch from teleporting, and what keeps the two rigs
    // on the same pivot for the whole revolution once it does.
    const pin = b * b * (3 - 2 * b);
    const wx = cx;
    const wy = this.pos.y + oy;
    const wz = cz - b * (sa * py + ca * pz);
    e.carryOrbit = {
      x: wx + (this.pos.x - wx) * pin,
      y: wy + (this.pos.y - wy) * pin,
      z: wz + (this.pos.z - wz) * pin,
      // It faces the way the pair are travelling: the two of them are going over TOGETHER, so their
      // own +X is the same line and the same direction (the whirl's own yardstick — a body carried
      // by the throat is the only other one that is placed rather than driven).
      yaw: this.facing,
      ph: u,
      lay: s * TAU,
    };
  },

  // THE RELEASE — the body is let go of, at the end of the roll, one way or the other.
  //
  //   * OFF THE JUMP (the brief's own exit — *"untill i do a jump ... and let go of him"*): the
  //     leap-off THROWS it — a `flight` with a ragdoll on it, so it goes loose off the deck and
  //     lands wherever it lands.
  //   * OFF THE CLOCK (the roll simply ran out of road): the body is left where the roll put it,
  //     doubled over and getting up, which is a `fold` — the game's own "stunned on its feet".
  //
  // Either way it is put back on the DECK first: the hold has it riding the ball (`pos.y` is the
  // ball's own centre height, which is BELOW the feet line), so a body handed back to its own
  // physics from there would be standing in the pavement.
  lungeRelease(e, thrown) {
    const dx = Math.sin(this.facing);
    const dz = Math.cos(this.facing);
    if (e && e.built) {
      e.carryOrbit = null;
      e.grabDist = null;
      e.grabT = 0;
      e.pos.y = Math.max(e.pos.y, this.lungeDeckY);
      if (thrown) {
        e.hit("flight", dx, dz, P.CLINCH_ROLL_KNOCK, P.CLINCH_ROLL_STUN,
          { dmg: 0, ragdoll: true, force: true, lift: P.CLINCH_ROLL_LIFT });
      } else {
        e.hit("fold", dx, dz, P.CLINCH_ROLL_KNOCK * 0.55, P.CLINCH_ROLL_STUN, { force: true });
      }
      this.lastLunge = { x: e.pos.x, y: e.pos.y + 1.0, z: e.pos.z, e, thrown };
      this.events.push("lungdrop");
      if (this.sfx && this.sfx.slamImpact) this.sfx.slamImpact(thrown ? 0.8 : 0.5);
    }
    this.lungeTarget = null;
    this.lungeGrab0 = null;
    this.lungeReleased = true;
  },

  // One frame of the whole move. The horizontal is written by every beat — nothing below this reads
  // the run state — and gravity is the world's business except where a beat is ON the deck.
  updateLunge(dt, inp) {
    this.lungeT += dt;
    if (this.lungeBlendT > 0) this.lungeBlendT = Math.max(0, this.lungeBlendT - dt);
    const sinF = Math.sin(this.facing);
    const cosF = Math.cos(this.facing);
    // The tuck's own weight (see `updateVisual`): the rig is dropped onto the ball through the two
    // rolls and lifted back out of it for the leap. Eased here rather than in the pose because it is
    // a placement, not a shape. It is read at the END of the frame (below) rather than at the top,
    // because a beat can hand over ON this frame — the leap-off flips the phase here — and the ball
    // has to follow the phase that is in force when the rig is actually placed: read at the top, the
    // release frame would place the STAR on a ball the body has just jumped off (measured: 0.57 of
    // the leap-off's own frame spent under the deck).
    const ballWant = this.lungePhase === 1 || this.lungePhase === 2 ? 1 : 0;

    if (this.lungePhase === 0) {
      // ---- THE POUNCE ----
      const t = Math.min(1, this.lungeT / P.LUNGE_T);
      const sp = this.lungeSpeed * (1 - P.LUNGE_FALL * t);
      this.lungeRollV = sp;
      this.vel.x = sinF * sp;
      this.vel.z = cosF * sp;
      // A jump pressed into the pounce is eaten, not buffered: the beat is committed (the same
      // bargain the whirl and the scissor make), and a leap-off in the middle of the flight is
      // precisely what the move must not offer.
      this.jumpBuffer = 0;
      // THE TAKE IS THE PAW ARRIVING, and it is tested on EVERY frame of the leap (the same way the
      // whirl's lunge is): the wedge is the paws' own reach, so it finds a body on the frame they
      // would have touched it. The CATCH ARRESTS THE LEAP — the body comes down with it, because
      // that IS what catching something in mid-air is: the pair go down together rather than one
      // after the other, and it is what stops the pounce flying past what it just caught.
      const e = this.lungePick();
      if (e && this.lungeTakeNow(e)) {
        this.lungePhase = 2;
        this.lungeT = 0;
        this.lungeRollV = sp;
        this.lungeBlendT = P.LUNGE_BLEND_T;
        this.vel.y = Math.min(this.vel.y, -P.LUNGE_DROP);
      } else if (this.grounded || this.lungeT >= P.LUNGE_T) {
        // NOTHING THERE: he lands out of the leap into the recovery roll — the brief's *"if i fail
        // to grab an enemy if roll and get slowed down a bit"*. A landing opens with the little
        // jump first (the roll's clock waits for it — see phase 1); a cap-expiry in mid-air goes
        // straight to the roll with only the pose crossfading.
        this.lungeT = 0;
        this.lungeRollV = sp;
        this.lungePhase = 1;
        if (this.grounded) {
          this.lungeHopT = P.LUNGE_HOP_T;
          this.vel.y = Math.max(this.vel.y, P.LUNGE_HOP_V);
          this.grounded = false;
        } else {
          this.lungeBlendT = P.LUNGE_BLEND_T;
        }
        this.events.push("lungmiss");
      }
    } else if (this.lungePhase === 1) {
      // ---- THE MISS ROLL ----
      // ...which waits for the little jump first: the roll's clock is held at zero while the hop
      // is in the air, and the entry speed is carried untouched (a jump keeps momentum — the bleed
      // only starts once the shoulder hits). The roll begins when the hop's window is spent and the
      // feet are back, with a hard cap so a skipped ground can never hang the move.
      if (this.lungeHopT > -0.25) this.lungeHopT -= dt;
      if (this.lungeHopT > 0 || (this.lungeHopT > -0.25 && !this.grounded)) {
        this.lungeT = 0;
        this.lungeRoll = 0;
        this.grabFlip = 0;
        this.vel.x = sinF * this.lungeRollV;
        this.vel.z = cosF * this.lungeRollV;
        this.jumpBuffer = 0;
      } else {
      // One whole revolution across its own clock, eased at both ends, so it opens flat out of the
      // landing and closes SQUARE (a whole turn is the same pose — the handover back to the ground
      // is a no-op, exactly the way the macaco's turn and the ankle slam's flip are built).
      const u = Math.min(1, this.lungeT / P.LUNGE_ROLL_T);
      const s = u * u * (3 - 2 * u);
      this.lungeRoll = s;
      this.grabFlip = s * TAU;
      const sp = this.lungeRollV * Math.exp(-P.LUNGE_ROLL_FRICTION * this.lungeT);
      this.vel.x = sinF * sp;
      this.vel.z = cosF * sp;
      this.jumpBuffer = 0;
      if (this.lungeT >= P.LUNGE_ROLL_T) {
        // The free fall's roll is over (see `startFreeRoll`): the flag and the camera's drop are
        // spent with the beat, so the body that comes up onto its feet is an ordinary one.
        this.freeRoll = false;
        this.camDrop = 0;
        this.setState(this.grounded ? "ground" : "air");
      }
      }
    } else if (this.lungePhase === 2) {
      // ---- THE CLINCH ROLL ----
      const e = this.lungeTarget;
      const u = Math.min(1, this.lungeT / P.CLINCH_ROLL_MAX);
      const s = u * u * (3 - 2 * u);
      this.lungeRoll = s;
      this.grabFlip = s * TAU;
      // The road, read BEFORE the roll writes its own speed over it: a roll that has been STOPPED
      // (a wall, a body that will not move) is a roll with nothing left to spend, so it is let go of
      // on the same terms the speed floor uses. Without it the hold would keep writing the roll's
      // own pace into a body the world is holding still, and the pair would grind against the wall
      // for the rest of the clock.
      const road = Math.hypot(this.vel.x, this.vel.z);
      const sp = this.lungeRollV * Math.exp(-P.CLINCH_ROLL_FRICTION * this.lungeT);
      this.vel.x = sinF * sp;
      this.vel.z = cosF * sp;
      if (e && e.built) this.lungeHoldBody(e, u, s);
      else if (e) this.lungeTarget = null;
      // Out: the player's own JUMP (the brief's exit), the clock, or the roll running out of road.
      const jump = !!inp.jumpPressed;
      if (jump) this.jumpBuffer = 0;
      if (jump || this.lungeT >= P.CLINCH_ROLL_MAX || sp < P.CLINCH_ROLL_MIN ||
        (this.lungeT > 0.12 && road < P.CLINCH_ROLL_MIN)) {
        this.lungeRelease(e && e.built ? e : null, jump);
        this.lungePhase = 3;
        this.lungeT = 0;
        this.lungeWindFrom = this.grabFlip;
        this.lungeWindTo = Math.ceil((this.grabFlip + 1e-4) / TAU) * TAU;
        // The leap-off: the roll's own speed, less a TENTH (see `CLINCH_ROLL_KEEP`), plus the launch
        // — a jump off a roll, never a reset to the standing one.
        const hs = Math.hypot(this.vel.x, this.vel.z) * P.CLINCH_ROLL_KEEP + P.LUNGE_JUMP_PUSH;
        this.vel.x = sinF * hs;
        this.vel.z = cosF * hs;
        this.vel.y = P.LUNGE_JUMP;
        this.grounded = false;
        this.jumpBuffer = 0;
        this.events.push("lungjump");
        if (this.sfx && this.sfx.jump) this.sfx.jump();
      }
    } else {
      // ---- THE SPREAD JUMP ----
      // The turn is squared up onto a whole revolution over `LUNGE_WIND_T` (so the shape is never
      // worn by a body lying on its side), the horizontal is only lightly dragged, and the beat runs
      // until the feet find the deck. It is the one beat the player is free to leave — the state is
      // not a committed one, so a double jump or a dive out of it is theirs to take.
      const w = Math.min(1, this.lungeT / Math.max(1e-3, P.LUNGE_WIND_T));
      const wi = w * w * (3 - 2 * w);
      this.grabFlip = this.lungeWindFrom + (this.lungeWindTo - this.lungeWindFrom) * wi;
      this.lungeRoll = 1;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 0.01) {
        const k = Math.max(0, sp - P.AIR_DRAG * dt) / sp;
        this.vel.x *= k;
        this.vel.z *= k;
      }
      if (this.grounded || this.lungeT >= P.LUNGE_SPREAD_T) this.setState(this.grounded ? "ground" : "air");
    }

    // The ball's own weight, one beat late (see the note at the top of this method): the phase that
    // is in force NOW is the one the rig is about to be placed by. The miss roll is the exception
    // and it is assigned rather than eased, because its weight IS its shape's own rise (see
    // `poseLunge` phase 1): the body stops being a ball at `riseAt` and comes up onto its feet, and
    // the placement has to let go of the ball on exactly the frame the fold lets go of it. Letting go
    // TOGETHER is what leaves those ~11 frames on neither placement — which is what the handover clamp
    // at the foot of `updateVisual` is for (measured: -0.058 without it, 0.000 with).
    if (this.lungePhase === 1) {
      const u = Math.min(1, this.lungeT / P.LUNGE_ROLL_T);
      const rr = Math.max(0, Math.min(1, (u - this.lungeRiseAt) / Math.max(1e-3, 1 - this.lungeRiseAt)));
      const rise = rr * rr * (3 - 2 * rr);
      const drop = Math.min(1, this.lungeT / P.LUNGE_BALL_IN);
      this.lungeBall = Math.min(drop, 1 - rise);
    } else {
      const want = this.lungePhase === 2 ? 1 : 0;
      const rate = want > this.lungeBall ? P.LUNGE_BALL_IN : P.LUNGE_BALL_OUT;
      this.lungeBall += (want - this.lungeBall) * Math.min(1, dt / rate);
    }
    // ...and THE FREE FALL'S CAMERA (session 194 — see `P.FREE_ROLL_CAM_DROP`): while the roll-out's
    // body IS the ball, the chest-height chase anchor is most of a metre over the thing being watched,
    // so the shot comes down with it. Read off the ball's own weight rather than put on a clock, so it
    // is exactly 0 on the frame the fold opens back out onto the feet, and written HERE because this
    // is where that weight is solved. Free fall's rolls only — the panther's pounce never sets the flag.
    if (this.freeRoll) this.camDrop = P.FREE_ROLL_CAM_DROP * this.lungeBall;
  },

  // THE RUNNING LUNGE'S OWN POSE LAYER (lifted out of `updateVisual`). One shape per BEAT,
  // dispatched on the same `lungePhase` the physics runs on, and the beat's own progress read off
  // the same clock — so the pounce's stretch, the tucks and the spread can never show a beat the
  // body is not in. `take` is 1 for as long as the clinch roll is holding a body (the tuck's arms
  // are authored differently when they have somebody in them).
  solveLungePose(dt, ud) {
    this.lungePose = approach(this.lungePose, this.state === "lunge" ? 1 : 0, dt / SKILL_POSE_FADE);
    if (ud && ud.poseLunge && this.lungePose > 0.002) {
      let lu = 0;
      if (this.lungePhase === 0) lu = Math.min(1, this.lungeT / Math.max(1e-3, P.LUNGE_T));
      else if (this.lungePhase === 1) lu = Math.min(1, this.lungeT / Math.max(1e-3, P.LUNGE_ROLL_T));
      else if (this.lungePhase === 2) lu = Math.min(1, this.lungeT / Math.max(1e-3, P.CLINCH_ROLL_MAX));
      else lu = Math.min(1, this.lungeT / Math.max(1e-3, P.LUNGE_SPREAD_T));
      // The pounce-to-roll handover is crossfaded, not cut: the pounce's laid-out end shape is worn
      // underneath the roll while the hop flies (phase 1) or the blend window runs (either roll),
      // fading out as the ball's shape fades in. The writers all ease toward their targets, so two
      // calls with split weights read as one shape morphing, not two fighting.
      const take = this.lungeTarget ? 1 : 0;
      let echo = 0;
      if (this.lungePhase === 1 && this.lungeHopT > 0) {
        const k = Math.max(0, Math.min(1, this.lungeHopT / Math.max(1e-3, P.LUNGE_HOP_T)));
        echo = k * k * (3 - 2 * k);
      } else if ((this.lungePhase === 1 || this.lungePhase === 2) && this.lungeBlendT > 0) {
        const k = Math.max(0, Math.min(1, this.lungeBlendT / Math.max(1e-3, P.LUNGE_BLEND_T)));
        echo = k * k * (3 - 2 * k);
      }
      if (echo > 0.001) ud.poseLunge(this.lungePose * echo, 0, 1, this.lungeRoll, take);
      ud.poseLunge(this.lungePose, this.lungePhase, lu, this.lungeRoll, take);
    }
  },
};

export function installLunge(Player) {
  Object.assign(Player.prototype, lungeMethods);
}
