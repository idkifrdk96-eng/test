import { P } from "./player/config.js";
export { P, launchArc };
import { installGrab } from "./player/grab.js";
import { installPole } from "./player/pole.js";
import { installCombat } from "./player/combat.js";
import { installSkills } from "./player/skills.js";
import { installWallbeat } from "./player/wallbeat.js";
import { installLunge } from "./player/lunge.js";
import { installContacts } from "./player/contacts.js";
import { installVault } from "./player/vault.js";
import { installWallrun } from "./player/wallrun.js";
import { installLedge } from "./player/ledge.js";
import { installPhysics } from "./player/physics.js";
import { installMove } from "./player/move.js";
import { installLaunch, launchArc } from "./player/launch.js";
import { installBlock } from "./player/block.js";
import { installMacaco } from "./player/macaco.js";
import { installHealth } from "./player/health.js";
import { installCommit } from "./player/commit.js";
import { installChainfade } from "./player/chainfade.js";
import { installClocks } from "./player/clocks.js";
import { installTransients } from "./player/transients.js";
import { installCore } from "./player/core.js";
import { installRespawn } from "./player/respawn.js";
import { installWiring } from "./player/wiring.js";
import { installGuard } from "./player/guard.js";
import { installSkyfall } from "./player/skyfall.js";
import { installAttach } from "./player/attach.js";
import { installJump } from "./player/jump.js";
import { installLanding } from "./player/landing.js";
import { installFacing } from "./player/facing.js";
import { installWish } from "./player/wish.js";
import { installStates } from "./player/states.js";
import { installItems } from "./player/items.js";
import { installBoard } from "./player/board.js";
import { installPlacement } from "./player/placement.js";
import { installRig } from "./player/rig.js";
import { installBase } from "./player/base.js";
import { initPlayer } from "./player/init.js";

export class Player {
  constructor(scene, world) {
    initPlayer(this, scene, world);
  }

  // Is the air combo OPEN and is the body actually UP in it (see `airComboT`)? Everything that
  // reads the window as a MODE — main.js's bullet time, the state label, the hint line — wants
  // this pair of conditions rather than the raw clock, so they cannot drift apart between readers.
  get airComboOpen() {
    return this.airComboT > 0 && !this.grounded;
  }

  // The collision box's own half-widths: the constants the whole game is tuned at — EXCEPT while
  // a slide has the body tucked in (see `updateBox`). Every horizontal query below reads these
  // rather than `P.HX`/`P.HZ`, so a slide is thinner to the WORLD and not just to the eye, which
  // is the entire point of it. The height is not touched (see `SLIDE_SHRINK`).
  get hx() {
    return P.HX * this.boxScale;
  }
  get hz() {
    return P.HZ * this.boxScale;
  }

  update(dt, inp) {
    this.events.length = 0;
    // ...and a stamp for the list itself, because the events are read by MORE than one consumer per
    // frame (main.js for the FX, abilities.js for the style/charge) and a reader that runs twice —
    // or outside the frame — must not credit the same hit twice (see `Abilities.credit`).
    this.eventsId = (this.eventsId || 0) + 1;
    this.landImpact = 0;
    this.landTimer += dt;
    if (this.recoverGuard()) return;
    this.readWorld(dt);

    // The deck's own angle under the feet, read once (see `readSlope` / "THE SLOPE").
    this.readSlope(dt);

    this.senseWalls();
    // What the slide would be squeezing through, off the same collider set. Taken here, ahead of
    // the state machine, because the slide case is where the reading is SPENT.
    this.updateSqueeze(dt);
    const grounded = this.prevGrounded && this.vel.y <= 0.001;
    this.grounded = grounded;
    const speed2D = Math.hypot(this.vel.x, this.vel.z);
    const velYBefore = this.vel.y;
    // Highest point of the current airtime. Landings ask "how far did I actually fall?" (see
    // `impactFromDrop`), which is a question about the arc, not the frame: a step-down, a jump
    // arc and a real plunge can all arrive at the ground, and only some of them are impacts.
    if (grounded) this.fallPeakY = this.pos.y;
    else this.fallPeakY = Math.max(this.fallPeakY, this.pos.y);

    this.tickClocks(dt, grounded, inp);
    this.tickBuffers(dt, inp, grounded);
    this.resetTransients(dt);

    const { sin, cos, wx, wz, hasWish } = this.tickWish(inp);

    this.tickStamina(dt, grounded);

    this.tickGuardChord(dt, inp, grounded);

    this.tickStateExits(dt, inp, grounded);
    this.tickMacacoEntry(inp);
    if (this.state === "ground" && !grounded) this.setState("air");
    if (this.state === "air" && grounded) this.setState("ground");
    this.tickChainAir(dt, grounded);
    if (this.state === "slam" && (grounded || this.stateTime >= P.SLAM_TIME)) this.setState(grounded ? "ground" : "air");

    this.tickHammerDoor();

    this.tickHammer(dt);

    // ---- crouch ----
    // SHIFT held on the ground, and not already sliding, is a crouch: a standing hold while
    // you are not moving, and a slow crouch walk once you are. It is a modifier rather than a
    // state, so jumping and the wall work all still run out of it, and the slide still
    // owns SHIFT whenever you are actually moving (its own press gate wants > 3.2 u/s, so the
    // two can never both claim the same moment).
    this.crouching = grounded && this.state === "ground" && inp.slideHeld;

    this.tickLaunchPad(grounded);

    this.readKickReach(dt);

    this.readDiveTarget(grounded);

    this.tickKickPress(grounded);

    // ---- state entries ----
    // A step OWNS THE BODY for its first `DASH_LOCK` (the "stun") and then hands the player back:
    // past that beat a front or side step is just a state the very next press can act out of —
    // which is the user's *"dont make the side dash stop the player from doing any action like
    // slide m1 ... make it stun the player just at the start for 0.15 seconds"*. The BACKDASH is
    // exempt: it is a performance with i-frames, not a placement (see `startDash`).
    const dashFree = this.state === "dash" && this.dashKind !== 2 && this.stateTime >= P.DASH_LOCK;
    const chordHeld = this.tickBlockEntry(inp, hasWish, wx, wz, dashFree);
    const poleStruck = this.tryStaffStrike(grounded, chordHeld, inp, speed2D, dashFree);
    this.tickChainPress(grounded, inp, speed2D, dashFree, chordHeld, poleStruck, hasWish, wx, wz);

    this.tickWallAttach(inp, grounded, wx, wz, hasWish);

    this.tickVaultEntry(grounded, speed2D);

    this.tickSkyfall(dt, grounded, speed2D, hasWish, wx, wz);

    this.tickPlunge(dt, grounded, inp, hasWish, wx, wz);

    // ---- movement per state ----
    // The per-state dispatch — see `tickStateMachine` in `player/states.js`.
    this.tickStateMachine(dt, inp, grounded, hasWish, wx, wz, sin, cos);

    // ---- the ride's own tidy-up (session 200) ----
    // A ride is a MODE and the deck is a PROP, so the two can come apart: if anything OUTSIDE the
    // ride's own three states has taken the body over — a launch pad under the wheels, a wall grab, a
    // respawn — the deck is handed back to the world where it stands rather than left parented to a
    // body that is no longer standing on it. The gear owns both halves (`dismountBoard`), so this is
    // one call; the fallback is only for a page where the gear is not wired yet.
    if (this.board && !this.aboard()) {
      if (this.gear && this.gear.dismountBoard) this.gear.dismountBoard(1);
      else {
        this.board = null;
        this.boardRig = null;
      }
    }

    this.tickAirComboHand();

    // ---- momentum chain ----
    if (this.grounded && this.landTimer > P.BHOP_WINDOW && this.chain > 0) this.chain = 0;

    this.tickJump(grounded, speed2D, hasWish, wx, wz);

    // ...AND THE POLE LAUNCH OWNS ITS OWN CEILING FOR A MOMENT (see `poleLaunch` and
    // `POLE_LAUNCH_HOLD`). The brief asks for a leap that goes *"far in the air with super fast
    // speed"*, so `POLE_LAUNCH_V` (44) is deliberately OVER the run's ceiling: while the window
    // runs the cap is raised to the launch's own number, so the speed he was thrown at is still
    // there for the whole of the throw, and the ordinary clamp takes it back the moment the window
    // closes (a whole leap out of the body rather than one frame of it). Every other caller reads
    // exactly the number it always read — this is a ceiling that MOVES, not a looser one.
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const cap = this.poleLaunchT > 0 ? P.POLE_LAUNCH_V
      : this.board ? P.BOARD_TOP_SPEED : P.MAX_SPEED;
    if (hs > cap) {
      const k = cap / hs;
      this.vel.x *= k;
      this.vel.z *= k;
    }
    if (hs > this.bestSpeed) this.bestSpeed = hs;

    this.prevGrounded = this.grounded;
    // The launch flies its own curve and does not collide (see `startLaunch`); every other
    // state is moved by its velocity, as always. ...and the VAULT is the same kind of thing (see
    // `startVault`): its crossing is solved, and letting the capsule push against the box it is
    // in the middle of going over would stop it on the face the whole move exists to clear.
    // ...and THE POLE'S OWN VAULT (session 185 — see `updatePoleVault`) is a SKIP for the first half
    // of its clock only: while the flip is holding him off the staff the shape places the body and
    // the world has no say (a deck found under a body mid-revolution would start a landing and cut
    // the move in half), and from the STRIKE beat on it is an ordinary airborne body on the launch's
    // line, so the capsule, the contacts and the landing all work exactly as they do for a dive.
    const preX = this.pos.x;
    const preZ = this.pos.z;
    if (this.state !== "launch" && this.state !== "vault" && this.state !== "wallbeat" &&
      !(this.state === "polevlt" && !this.poleVaultHit)) this.moveAndCollide(dt);
    this.tickContacts(dt, preX, preZ);

    this.tickLanding(dt, inp, velYBefore, hasWish, wx, wz);
    this.prevGrounded = this.grounded;
    if (this.grounded) this.jumpsLeft = P.AIR_JUMPS;

    // ---- facing / visual ----
    const hsAfter = this.tickFacing(dt, hasWish, wx, wz, sin, cos);
    this.updateVisual(dt, hsAfter, inp);
  }

  updateVisual(dt, speed, inp) {
    // THE RIG'S PLACEMENT (wall press, deck follow, slope lean) — see `solvePlacement` in `player/placement.js`.
    this.solvePlacement(dt);

    const inner = this.inner;
    const { pitch, spinExtra } = this.solveRigAngles(dt, speed);

    const { runFwd, runLat, trunkRoll } = this.solveRigLean(dt, speed, pitch);
    const ud = this.solveLocomotionBase(dt, speed, runFwd, runLat, trunkRoll);
    // THE SLIDE's own pose layer — see `solveSlidePose` in `player/states.js`.
    this.solveSlidePose(dt, ud);
    // THE RIDE's own (session 200 — see `solveRidePose` in `player/board.js`): the stance, the two
    // mechanics and the deck's own spin. It sits HERE, with the base-family layers, because a ride IS
    // the base — the feet do not run at all while it is on (see the `wantRun`/`wantIdle` gates in
    // player/base.js, which read the state) — and because the layers that follow it (the landing's
    // absorb, the crouch) are worn OVER it. It is also the layer that keeps ticking the ride's own
    // fades and the body's lift after a dismount, so it is called unconditionally.
    this.solveRidePose(dt, ud);

    // ------------------------------------------------------------------
    // Action poses. One layer per state, each on its own fade, applied in order
    // over the run/idle/slide base above. The states are mutually exclusive, so
    // in practice only one layer is ever live — the fade timers are what cross
    // them, which is why a jump out of a crouch, or a landing into a slide, eases
    // instead of popping.
    // ------------------------------------------------------------------
    // THE CROUCH's own pose layer — see `solveCrouchPose` in `player/states.js`.
    this.solveCrouchPose(dt, ud, speed);

    // THE BLOCK/GUARD's own pose layer — see `solveBlockPose` in `player/block.js`.
    this.solveBlockPose(dt, ud, speed);

    // THE AIR FAMILY's own pose layer — see `solveAirPose` in `player/jump.js`.
    this.solveAirPose(dt, ud);

    // THE SKYFALL's own pose layer — see `solveFallPose` in `player/skyfall.js`.
    this.solveFallPose(dt, ud, speed);
    // ...and THE FALL'S LEAN IS HANDED OVER, not snapped (see `startDive` / `startSlam`): a dive or
    // a slam thrown out of a skyfall blends the whole rig out of the lean the fall was wearing over
    // the same `FALL_POSE_FADE` the limb shape fades on, so neither the body nor the pose has a seam
    // on the frame the fall becomes a move. `fallPitch` is the fall's own last lean (written in the
    // angle chain far above); `pitch` here is still the dive/slam's own local, so this is a pure
    // cross-fade. A fall that simply LANDS never reaches this line — the two states it names are
    // exactly the pair the free fall can now hand over to, so nothing about the landing changes.
    if ((this.state === "dive" || this.state === "slam") && !this.skyfall && this.fallPose > 0.002) {
      inner.rotation.x += (this.fallPitch - pitch) * this.fallPose;
    }
    // THE DOUBLE JUMP's flip tuck — see `solveTuckPose` in `player/jump.js`.
    this.solveTuckPose(ud);

    // THE DIVE AND THE SLAM's own pose layers — see `solveDiveSlamPose` in `player/commit.js`.
    this.solveDiveSlamPose(dt, ud, speed);

    // THE Q DASH's own pose layer — see `solveDashPose` in `player/states.js`.
    this.solveDashPose(dt, ud, pitch);

    // THE MANTLE's own pose layer — see `solveMantlePose` in `player/ledge.js`.
    this.solveMantlePose(dt, ud);

    // THE RUNNING VAULT's own pose layer — see `solveVaultPose` in `player/vault.js`.
    this.solveVaultPose(dt, ud, pitch);

    // THE LAUNCH PAD's own pose layer — see `solveLaunchPose` in `player/launch.js`.
    this.solveLaunchPose(dt, ud);

    // THE LEDGE HANG AND ITS GRIP — see `solveLedgePose` in `player/ledge.js`.
    this.solveLedgePose(dt, ud);

    this.solveWallPose(dt, inp, ud);

    // THE LANDING ABSORB AND THE SLAM'S OWN LANDING — see `solveLandPose` in `player/landing.js`.
    this.solveLandPose(dt, ud);

    // The wall kick layers on top of everything (airborne, so the run blend is out) — see
    // `solveKickPose` in `player/wallrun.js`.
    this.solveKickPose(ud);

    // THE MELEE CHAIN's own pose layer — see `solveAttackPose` in `player/combat.js`.
    this.solveAttackPose(dt, ud);

    // THE CLASH's own shape — see `solveClashPose` in `player/combat.js`.
    this.solveClashPose(ud);
    // ...and THE MACACO's own shape — see `solveMacacoPose` in `player/macaco.js`.
    this.solveMacacoPose(ud);

    // ------------------------------------------------------------------
    // THE THREE SKILLS' own shapes (see `whirl` / `scissor` / `capoeira`, and the block of the same
    // name in streetwear.js). Each is an ABSOLUTE pose like the chain's — one layer per state, on
    // its own fade, so a move that is cancelled or thrown eases back into whatever wants the body
    // next instead of popping. Only one is ever live: the states are mutually exclusive.
    //
    // Two of them carry a LIVE CONTACT, written here every frame: the whirl has a body by the throat
    // that something else owns the position of (the haul is a velocity), and the LAUNCH has the body
    // its kick caught pinned by the FACE to the soles (`capoCarry`) — and that one is read off the
    // rig's own BONES, on this frame's pose, so what the boot is on is exactly what the camera sees.
    // ------------------------------------------------------------------
    const capoPhase = this.state === "capo" ? this.capoPhase() : -1;
    // THE WHIRL's live neck contact — see `solveWhirlNeck` in `player/skills.js`.
    this.solveWhirlNeck(ud);
    // (THE CARRY's own live contact is NOT written here — it is the LAST thing `updateVisual` does,
    // because it reads the soles and this is the earliest frame the pose exists. See the block at the
    // tail of the function.)

    this.solveWhirlPose(dt, ud);
    this.solveKneePose(dt, ud);
    // THE WALL CLINCH's own pose layer — see `solveWallBeatPose` in `player/wallbeat.js`.
    this.solveWallBeatPose(dt, ud);
    // THE RIGHT-CLICK GRAB's own pose layer — see `solveGrabPose` in `player/grab.js`.
    this.solveGrabPose(dt, ud);
    // THE RUNNING LUNGE's own pose layer — see `solveLungePose` in `player/lunge.js`.
    this.solveLungePose(dt, ud);
    this.solveScissorPose(dt, ud);
    // THE CAPOEIRA's own pose layer — see `solveCapoPose` in `player/skills.js`.
    this.solveCapoPose(dt, ud, capoPhase);

    // THE HAMMER's own pose layer — see `solveSmashPose` in `player/commit.js`.
    this.solveSmashPose(dt, ud);

    this.solvePoleBody(dt, ud);

    // THE GEAR POSE LAYERS (carry / ball action / tote) — see `solveItemPoses` in `player/items.js`.
    this.solveItemPoses(dt, ud);

    this.solveFinalRig(dt, speed, pitch, ud);
    this.solveCapoCarry(dt, capoPhase);
    this.solveDeckClamps(dt);
    // The tumble alone, for the first-person camera: see `spinExtra` above and `CameraRig.follow`.
    this.bodySpin = spinExtra + this.spinX;
  }
}


installPole(Player);

installGrab(Player);

installCombat(Player);

installSkills(Player);

installWallbeat(Player);

installLunge(Player);

installContacts(Player);

installVault(Player);

installWallrun(Player);

installLedge(Player);

installPhysics(Player);

installMove(Player);

installLaunch(Player);

installBlock(Player);

installMacaco(Player);

installHealth(Player);

installCommit(Player);

installChainfade(Player);

installClocks(Player);

installTransients(Player);

installCore(Player);

installRespawn(Player);

installWiring(Player);

installGuard(Player);

installSkyfall(Player);

installAttach(Player);

installStates(Player);

installJump(Player);

installLanding(Player);

installFacing(Player);

installWish(Player);
installItems(Player);
installBoard(Player);
installPlacement(Player);
installRig(Player);
installBase(Player);