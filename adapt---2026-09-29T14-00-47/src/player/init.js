// ---------------------------------------------------------------------------
// THE PLAYER'S CONSTRUCTION (part 84 of the player.js split).
//
// The whole of the old `Player` constructor body, moved out verbatim: every
// field the body owns, defaulted in the order it always was — the movement and
// slope state, the dash / kick / dive / slam clocks, the slide's squeeze, the
// meters, the three skills' state, the flying knee, the right-click grab, the
// running lunge, the staff, the scissor's anchor, the rig itself (material,
// groups, mesh, character), the idle's feet, the gear's tote/hands hooks, the
// climb's momentum, the wall clinch, the melee chain, the block and the guard's
// latch.
//
// It is a plain FUNCTION rather than a table of methods because a class
// constructor cannot be spread onto the prototype, and because the body never
// calls a method on `this` — it only writes fields, so `this.` -> `pl.` is the
// whole of the transform. The class's constructor is now one line that calls
// this (see `player.js`).
//
// Imports: three.js, `P` + `CHAR_SCALE` (player/config.js), `buildBoxGeometry`
// (geom.js) and `createMaterial` (ps1.js) — the five module-scope names the old
// constructor used, which `player.js` no longer needs.
// ---------------------------------------------------------------------------
import * as THREE from "../three.js";
import { P, CHAR_SCALE } from "./config.js";
import { buildBoxGeometry } from "../geom.js";
import { createMaterial } from "../ps1.js";

export function initPlayer(pl, scene, world) {
    pl.world = world;
    // The start: the spawn pad that used to be under this point is gone (see `ARENA` in
    // world.js), so the body begins a hand's width off the open deck and settles onto it.
    pl.pos = new THREE.Vector3(5, P.HY + 0.2, 5);
    pl.vel = new THREE.Vector3();
    pl.facing = 0;
    pl.camYaw = 0;
    // FIRST PERSON (V — see the facing chain in `update`): set from `rig.firstPerson` by `main.js`
    // each frame. While it is on, the body is held on the camera's own line.
    pl.firstPerson = false;
    // SHIFT LOCK (ALT — see `P.LOCK_*`): the camera owns the aim and the body is held on it, so
    // A/D and S are STRAFE and BACKPEDAL rather than turn-and-run.
    pl.shiftLock = false;
    pl.lockBlend = 0;
    pl.state = "ground";
    pl.grounded = false;
    pl.prevGrounded = false;
    pl.coyote = 0;
    // ---- THE SLOPE (see `readSlope`, `slopeGate` and "THE SLOPE" in README.md) ----
    // The deck's own gradient under the feet, read once a frame: what the body can climb, how hard
    // the deck pulls it downhill, and how far the rig lies over onto it.
    pl.slopeTan = 0;
    pl.slopeGx = 0;
    pl.slopeGz = 0;
    pl.onSlope = false;
    pl.slopeCarry = 0;
    pl.slopeBlend = 0;
    pl.tiltPitch = 0;
    pl.tiltRoll = 0;
    pl.jumpBuffer = 0;
    pl.wallCd = 0;
    pl.wallCoyote = 0;
    pl.wallNx = 0;
    pl.wallNz = 0;
    // The wall's basis in the rig's frame (see `wallRunFrame`) — reused every frame.
    pl.wallFrame = { N: [0, 0, 0], T: [0, 0, 0], U: [0, 0, 0], dFace: 1 };
    pl.slideCd = 0;
    // ...and the Q dash's own state (see `startDash`): which of the three it is, which way a
    // sidestep goes, the line it opened on (it holds it while it lasts), its cooldown and its
    // press buffer.
    pl.dashCd = 0;
    pl.dashBuffer = 0;
    pl.dashKind = 0;
    pl.dashSide = 0;
    pl.dashDirX = 0;
    pl.dashDirZ = 0;
    // ...and the LUNGE's own hit (see `dashContact`): the bodies this step has already touched,
    // and the last one of them (the FX anchor `dashhit` is read from).
    pl.dashHits = new Set();
    pl.dashHitTarget = null;
    // The backdash's own spiral (`poseBackdash` + the yaw channel in `updateVisual`)...
    pl.dashSpinY = 0;
    // ...and the STEP's own POSE CLOCK (see `dashPoseT`): the fraction of the step already drawn,
    // which can be RUSHED forward onto a beat (`dashRushAt`) — that is how a front step that touches
    // a body before its kick gets to the kick in time to be the thing that lands (see `dashContact`).
    pl.dashPoseT = 0;
    pl.dashRushAt = -1;
    pl.dashRushK = 1;
    pl.dashPendingHits = null;
    pl.dashKickLanded = false;
    // ...and its landing beat, so its impact FX fires exactly once (`dashland`, see the `dash`
    // case in `update`).
    pl.backdashLanded = false;
    // ...and the same for the front step's boxcutter, whose own landing is fired once on the frame
    // the feet arrive (`boxland`, see the `dash` case in `update`).
    pl.boxLanded = false;
    pl.spinX = 0;
    pl.diveCd = 0;
    pl.diveSpeed = 0;
    pl.diveBuffer = 0;
    pl.kickCd = 0;
    pl.kickT = 0;
    pl.kickSide = 1;
    pl.kickWall = null;
    pl.kickDirX = 0;
    pl.kickDirZ = 0;
    pl.kickVariant = -1;
    pl.kickSpinT = 0;
    pl.kickSpinTurns = 0;
    pl.kickBuffer = 0;
    pl.kickMem = null;
    pl.kickMemT = 0;
    pl.kickCandidate = null;
    // The dive's own target read (see the block in `update`): the airborne body the tackle would
    // launch. Set on the player rather than computed twice so the hint line and the move agree.
    pl.diveCandidate = null;
    pl.slamCd = 0;
    pl.slamBuffer = 0;
    pl.slideBuffer = 0;
    // How wide the body is as a fraction of its standing width (1 = standing), what the slide's
    // squeeze across its line of travel is reading (0 = open ground, 1 = filling the gap), how
    // long a squeeze has been held, and the two contact points the squeeze grit comes off (see
    // `updateBox` / `updateSqueeze`).
    pl.boxScale = 1;
    pl.squeeze = 0;
    pl.squeezeHold = 0;
    pl.squeezing = false;
    pl.sqA = { x: 0, y: 0, z: 0, act: false };
    pl.sqB = { x: 0, y: 0, z: 0, act: false };
    pl.jumpsLeft = P.AIR_JUMPS;
    pl.flipT = 0;
    pl.slamStartY = 0;
    pl.slamHeight = 0;
    pl.slamPower = 0;
    pl.lastSlam = null;
    // The wall kick's own address on the face (see the wall strike in main.js): where the boot
    // landed and which way it was driven, so the wall it came off takes the blow.
    pl.lastWallKick = null;
    // The two other things the body's mass does to the world (see `slideContact` / `dropBlast`):
    // where the last slide hit landed (an FX anchor, read by main.js off the `slidehit` event)
    // and the blast the last hard landing threw (the same, off `dropblast`).
    pl.lastSlideHit = null;
    pl.blast = null;
    // How many times the CURRENT slide has already ragdolled each body: a slide may take the same
    // enemy `SLIDE_HIT_MAX` times (see `slideContact`), and this is the count that stops it at
    // that. Cleared on every `startSlide`.
    pl.slideHits = new Map();
    // The macaco's own window (see `startMacaco`): how long is left of the moment after a slide's
    // take in which a press of M1 still counts, and WHICH body that take was on (the move is
    // thrown on that body, and only while it is still a ragdoll in the air). Both are set by the
    // take itself and cleared by the window running out.
    pl.slideHitT = 0;
    pl.slideHitTarget = null;
    // The macaco's own clock, the pose weight it fades in on, and the lift and the body's share of
    // the slide's momentum that `updateVisual` spends (see `updateMacaco`).
    pl.macacoT = 0;
    pl.macacoHitDone = false;
    pl.macacoLift = 0;
    // The M1 clash (see `startClash`): the whole lock — the body it is with, the move the player
    // brought, the two meters, the two decays the presses put on them, and where the pair was
    // standing when it started (the mark the shoving match walks away from).
    pl.clash = null;
    pl.clashDrive = 0;
    pl.lastClash = null;
    pl.lastMacacoHit = null;
    pl.stateTime = 0;
    pl.grip = P.GRIP_MAX;
    pl.wall = null;
    pl.walls = [];
    pl.wallSliding = false;
    pl.climbing = false;
    pl.wallRunning = false;
    pl.prevWallRun = false;
    pl.wallSide = 0;
    pl.wallBank = 0;
    pl.wallRunT = 0;
    pl.wallRunCd = 0;
    pl.airFromJump = false;
    pl.attached = false;
    pl.prevAttached = false;
    pl.attachMode = null;
    pl.wallStick = 0;
    pl.wallLock = 0;
    pl.wallScrapeT = 0;
    pl.lean = 0;
    pl.hug = 0;
    pl.mantleT = 0;
    pl.mantleFrom = null;
    pl.mantleTo = null;
    pl.mantleDur = P.MANTLE_TIME;
    pl.mantleFromLedge = false;
    pl.mantleExit = null;
    // The running vault's own state (see `vaultTarget` / `startVault`): what it goes over, where it
    // comes down, and its own lockout.
    pl.vaultT = 0;
    pl.vaultDur = 0;
    pl.vaultFrom = null;
    pl.vaultTo = null;
    pl.vaultTop = 0;
    pl.vaultNx = 0;
    pl.vaultNz = 0;
    pl.vaultSide = 1;
    pl.vaultSpeed = 0;
    pl.vaultCd = 0;
    pl.vaultPose = 0;
    // The momentum dividend the last crossing paid (see `vaultend` / `GAME.vault()`), reset with the
    // rest of the run so a fresh spawn never reports a stale bonus.
    pl.vaultBonus = 0;
    // WHICH way over (see `VAULT_KIND`): the style picked for this crossing, and the whole-rig
    // turn it is wearing. A flipping vault is a RIG ROTATION first and a pose second — the pose
    // only has to be the right shape while it happens.
    pl.vaultKind = 0;
    pl.vaultFlip = 0;
    pl.vaultRoll = 0;
    pl.vaultApex = 0;
    pl.vaultLastKind = -1;
    // ...and the point the hand plants on (the box's top, read off the collider in `startVault`):
    // the FX for the plant hang off it, so it has to outlive the move by a frame or two.
    pl.vaultPlantAt = null;
    // The auto ledge grab's own state: the face it caught, where the pull-up finishes, how high
    // the grip sits above the feet (see `LEDGE_GRIP`), and its lockout.
    pl.ledgeT = 0;
    pl.ledgeWall = null;
    pl.ledgeTo = null;
    pl.ledgeGripUp = 0;
    // ...and THE LIP ITSELF, in world space: the point the solved palms hold (see the grip
    // projection in `updateVisual`), stored once at the catch so the hands stay on the stone
    // while the body moves under them (`poseHang` / `poseLedgePull`).
    pl.ledgeGrip = null;
    // ...and the same point in the rig's own frame, re-projected every frame by `gripLocal()`.
    pl.gripX = 0;
    pl.gripY = 0;
    pl.gripZ = 0;
    pl.ledgeCd = 0;
    pl.ledgePhase = 0;
    pl.ledgePose = 0;
    // ...and the speed the CATCH carried along the lip (`LEDGE_KEEP`), spent by the hang.
    pl.ledgeCarry = { x: 0, z: 0 };
    pl.landImpact = 0;
    pl.landTimer = 10;
    pl.fallPeakY = pl.pos.y;
    // The launch pad's own state: the solved arc (`launch`), its clock, and its lockout.
    pl.launch = null;
    pl.launchT = 0;
    pl.launchCd = 0;
    pl.launchPose = 0;
    pl.chain = 0;
    pl.bestSpeed = 0;
    // The skyfall (see the block in `update`): whether a long fall is being worn as one of the
    // FALL shapes, which shape, how long it has been falling, how far it is to the deck, and how
    // much of the landing brace is on. `fallPrev` is the shape the last fall wore, so the same
    // one never plays twice in a row.
    pl.skyfall = false;
    pl.skyfallT = 0;
    pl.fallKind = "arch";
    pl.fallPrev = null;
    pl.fallDrop = 0;
    pl.fallBrace = 0;
    // ...and whether the deck under the feet was reached OUT OF a fall (session 194 — see
    // `startFreeRoll`): the landing reads it to decide between the brace and the roll-out.
    pl.landedSkyfall = false;
    // The whole-rig lean the fall is wearing this frame (see `updateVisual`) — the slam/dive
    // handover reads it so the body cannot snap upright on the frame a fall turns into a move.
    pl.fallPitch = 0;
    pl.fallPose = 0;
    pl.fallKindOverride = null;
    // THE PLUNGE (see the block in `update` and `P.PLUNGE_*`): whether the fall is being held
    // into its downward dive by M1, how long that has been on, and the cross-fade the rig's angle
    // and the pose both ride so the shape change is a lean rather than a switch.
    pl.plunge = false;
    pl.plungeT = 0;
    pl.plungePose = 0;
    pl.squash = 0;
    // The body's tumble for the first-person camera (see `updateVisual`).
    pl.bodySpin = 0;
    pl.throttle = 0;
    pl.colliders = [];
    pl.qbuf = [];
    pl.trailT = 0;
    pl.stepT = 1;
    pl.spawn = pl.pos.clone();
    pl.sfx = null;
    pl.events = [];

    // ---- the four meters (see "The HUD dial" in the README, and abilities.js for the economy) ----
    // `hp` is the green core, `hurtT` is time since the last hit (the regen clock AND the HUD's
    // flash), `hurtCd` is the invulnerability window. `overT` is the overdrive the ultimate buys,
    // and the three cooldowns are the skills on 1/2/3: the WHIRL, the head SCISSOR and the LAUNCH.
    // `blockT` is the scissor's counter window (the guard that catches a fist).
    pl.hp = P.HP_MAX;
    pl.hurtT = P.HP_REGEN_DELAY;
    pl.hurtCd = 0;
    pl.overT = 0;
    pl.whirlCd = 0;
    pl.kneeCd = 0;           // skill 1's own cooldown now — the WHIRL's pill is the KNEE's
    pl.scissorCd = 0;
    pl.capoCd = 0;
    pl.blockT = 0;
    pl.lastWhirl = null;     // the grab itself (main.js reads it for the FX)
    pl.lastWhirlSlam = null;
    pl.lastWhirlLaunch = null;
    pl.lastScissor = null;
    pl.lastCapo = null;
    pl.lastBlock = null;
    // ---- the three skill moves' own clocks (see `whirl` / `scissor` / `capoeira`) ----
    pl.whirlT = 0;
    pl.whirlTarget = null;
    pl.whirlHold = 0;        // the pose's own grip weight (see `updateWhirl`)
    pl.whirlSpin = 0;        // the rig's own turn through the whirlwind (see `updateWhirl`)
    pl.whirlSpin0 = 0;       // ...where it starts: the angle the grabbed body was actually at
    pl.whirlR0 = 0;            // ...the radius it is hauled in from
    pl.whirlOriginY0 = 0.05;   // ...the height its OWN ORIGIN sits at (the hold places it by that)
    pl.whirlLay0 = 0;          // ...and the whole-rig angle it was already wearing (see `WHIRL_TOP_LAY`)
    pl.whirlStride = 0;      // the whirlwind's run cycle, advanced off the speed actually run
    pl.whirlGrabbed = false;
    pl.whirlAerial = false;  // the grab was made in the AIR (the "webby smash" slam)
    pl.whirlSlamDone = false;
    pl.whirlLaunched = false;
    pl.whirlElbow = false;   // the finisher: a body under `WHIRL_FINISH_HP` takes the elbow
    // ---- THE FLYING KNEE's own state (see `knee` / `updateKnee`) ----
    pl.kneeT = 0;            // the state's clock
    pl.kneePhase = 0;        // 0 the RUN-UP, 1 the LEAP, 2 the LANDING (see `updateKnee`)
    pl.kneeStride = 0;       // the run-up's run cycle, advanced off the speed actually run
    pl.kneeTarget = null;    // the body the knee is aimed at (null = a whiff)
    pl.kneeMark = 0;         // ...where in the clock the LEAP opened
    pl.kneeLeapT = 0;        // ...and how long the solved arc is (see `kneeLeap`)
    pl.kneeLandMark = 0;     // ...and where in the clock the feet reached the deck again
    pl.kneeHit = false;      // the contact has happened (one per knee, like the lunge's hitbox)
    pl.kneeHitBody = null;
    pl.kneeAimZero = 0;      // the aim's own heading at the leap (a whiff keeps it; see `kneeLeap`)
    pl.kneeAimT = null;      // ...and the lead time the aim was solved for (null = a whiff)
    pl.lastKnee = null;      // the contact itself (main.js reads it for the FX)
    pl.lastKneeLand = null;  // ...and the landing under it
    // ---- THE RIGHT-CLICK GRAB's own state (see `grab` / `updateGrab`) ----
    pl.grabCd = 0;
    pl.grabT = 0;            // the state's clock
    pl.grabKind = 0;         // 0 the FLASH GRAB, 1 the SET-UP, 2 the SLAM (see `grabPick`)
    pl.grabDashed = false;   // the flash dash has launched (one per move)
    pl.grabYaw0 = 0;         // the facing on the lock — the swing orbits off it
    pl.grabSpinY = 0;        // the 360's visual turn, spent on the rig (see `updateVisual`)
    pl.lastGrabDash = null;  // the dash launch (main.js reads it for the streaks)
    pl.grabTarget = null;    // the body it is taking (null = a whiff)
    pl.grabFlip = 0;         // the SLAM's front flip, one 2π about the rig's own X
    pl.grabTake = false;     // the contact has been MADE (one per move, like the lunge's hitbox)
    pl.grabReleased = false;
    pl.grabLanded = false;   // the player is back off the SLAM's own leap
    pl.grabGap = -1;         // MEASURED: how far the nearest hand is from the contact (see `grabMeasure`)
    pl.grabDeckY = 0;        // the deck the slam is aimed at (read at the take)
    pl.grabAnkle0 = null;    // where the SHIN itself was when it was taken (see `updateGrabSlam`)
    pl.grabAimZero = 0;
    pl.grabMiss = false;         // nothing was in reach — the WHIFF (see `poseGrabMiss`)
    pl.grabMissClamp = false;    // the empty clamp has fired (one per move)
    pl.grabMissCatch = false;    // ...and the catch-step has
    pl.lastGrab = null;      // the take itself (kept for debugging reads)
    pl.lastGrabThrow = null;
    pl.lastGrabSet = null;
    pl.lastGrabSlam = null;
    pl.lastGrabMiss = null;  // the empty clamp (main.js reads it for the FX)
    pl.lastGrabCatch = null; // ...and the catch-step
    // ---- THE RUNNING LUNGE's own state (see `lunge` / `startLunge` / `updateLunge`) ----
    pl.lungeCd = 0;
    pl.lungeT = 0;           // the phase's clock (reset at every phase change)
    pl.lungePhase = 0;       // 0 POUNCE, 1 MISS ROLL, 2 CLINCH ROLL, 3 SPREAD JUMP
    // ...and whether the roll that is running belongs to the FREE FALL rather than to the panther
    // (session 194 — see `startFreeRoll`): a skyfall's landing is entered STRAIGHT at phase 1 with no
    // pounce and no hop, so the ONLY thing that tells the two apart is this flag. It rides the HUD's
    // lines and nothing in the physics, and it is cleared the frame the roll hands back to the deck.
    pl.freeRoll = false;
    pl.lungeTarget = null;   // the body the pounce took (null = a miss)
    pl.lungeTake = false;
    pl.lungeReleased = false;
    pl.lungeSpeed = 0;       // the speed the pounce opened at (the momentum everything else keeps)
    pl.lungeRoll = 0;        // the rig's forward turn, spent on `grabFlip` (see `updateVisual`)
    pl.lungeRollV = 0;       // ...and the speed the CURRENT roll opened at (the bleed's own start)
    pl.lungeBall = 0;        // 0..1: how much of the rig is dropped onto the ball the pair roll on
    pl.lungeHopT = 0;        // the little jump's own clock (a grounded pounce landing hops first)
    pl.lungeBlendT = 0;      // the pounce-to-roll pose crossfade (every pounce exit sets it)
    pl.lungeWindFrom = 0;    // ...and where the wind-up to a whole turn started (the release leap)
    pl.lungeWindTo = 0;      // ...and the whole turn it is winding to
    pl.lungeGrab0 = null;    // where the body was, relative to him, on the frame it was taken
    pl.lungeDeckY = 0;       // the deck the pounce left from (read at the take)
    pl.lungeRiseAt = 0.72;   // where the miss roll comes up out of the ball (the pose table's own)
    pl.lastLunge = null;     // the take itself (main.js reads it for the FX)
    pl.lungePose = 0;
    // THE POLE (see the `POLE_*` block): the staff he is CARRYING, how much of it is left, and the
    // four moves it can make. `poleHeld` is the prop (pole.js) or null, and it rides the rig across
    // every other state — there is no "carrying" state to fall out of (see the note in the block).
    //
    // `poleMode` is which shape the pose is drawing and `poleT` is that shape's own clock (0..1 on
    // the strike and the throw, held at 0 on the carry and ignored on the balance), so the pose and
    // the hitboxes read one number between them exactly the way the old form's routes did.
    pl.poles = null;
    pl.poleHeld = null;
    pl.poleHp = P.POLE_HP;
    pl.poleMode = "carry";
    pl.poleT = 0;
    pl.polePose = 0;
    pl.poleLiftT = 0;        // s the haul out of the deck has been running
    pl.poleLift = 0;         // ...and how far through it is (0..1)
    pl.poleGroundY = 0;
    pl.poleAtkT = 0;
    pl.poleAtkBeat = 0;
    pl.poleAtkCd = 0;
    pl.poleAtkSpin = 0;      // the strike's whole-body revolution, in radians
    pl.poleWillBreak = false;// has the strike that is running spent the last of the wood
    pl.poleVaultT = 0;       // the vault's own clock (the double jump — see `poleVault`)
    pl.poleVaultHit = false; // whether this vault's strike has already fired the launch
    pl.poleFlipT = 0;        // ...and the front revolution it is riding, for the rig
    pl.poleLaunchT = 0;      // s the launch's own speed ceiling stands down for
    pl.poleThrT = 0;
    pl.poleReleased = false; // whether the throw's release has happened
    pl.poleFly = null;       // the thrown staff's own flight (see `updatePoleThrow`)
    pl.poleGripW = new THREE.Vector3();
    pl.lastPole = null;
    pl.lastPoleBreak = null;
    // ...and THE TRAIL: the shaft's published ends for the last `POLE_TRAIL` frames, in a fixed
    // ring of preallocated pairs (a fresh array per frame is a GC stumble in the middle of a
    // move). Every beat of the flurry measures a body against ALL of these rather than against the
    // single line of the frame it lands on — see the note in `poleStrikeContact`, which is where
    // the whole reason lives.
    pl.poleTrail = [];
    for (let i = 0; i < P.POLE_TRAIL; i++) pl.poleTrail.push({ a: new THREE.Vector3(), b: new THREE.Vector3() });
    pl.poleTrailN = 0;
    pl.poleTrailNext = 0;
    pl.poleShaftA = new THREE.Vector3();   // the shaft's two ends in WORLD space, written by
    pl.poleShaftB = new THREE.Vector3();   // `updateVisual` off the mounted prop and read by the
                                             // contact test — one number, so the drawn stick and the
                                             // thing that hits cannot drift apart.
    pl.scissorT = 0;
    pl.scissorTarget = null;
    pl.scissorCounter = null;   // the body whose fist the guard caught (the counter)
    pl.scissorLeaped = false;
    pl.scissorClamped = false;
    // ...and whether the NECK is actually TAKEN (see `scissorContact` / `scissorGrip`): false until
    // the bite lands on a body that can be held, so a leap that catches a ragdoll (whose `hit` is
    // refused, see `Enemy.hit`) sweeps through it with nothing gripped rather than hanging a body
    // off a hold that was never taken.
    pl.scissorHeld = false;
    // ---- the clamp's own anchor (see `scissorAnchor`): the CONTACT the legs are on, in world
    // space, and the point it started the clamp from (the leap's own exit, which is where the
    // handover has to be continuous). `scissorClamp` is the clamp's 0..1, kept so the pose
    // dispatch below and the anchor cannot read the clock differently.
    pl.scissorC = new THREE.Vector3();       // the live contact (the neck)
    pl.scissorArr = new THREE.Vector3();     // ...and where it was when the clamp opened
    pl.scissorHipOff = new THREE.Vector3();  // the hips' own offset inside the rig (rig frame)
    pl.scissorClamp = 0;                     // the clamp's own 0..1
    pl.scissorBite = 0;                      // the scissors' snap, 0..1 (see `SCISSOR_BITE`)
    pl.scissorTgtY = 0;                      // the ankles' live IK target, in the rig's frame
    pl.scissorTgtZ = 0;
    pl.scissorTgt0 = { y: 0, z: 0 };         // ...and the ankles' own arrival, to hand over from
    pl.scissorAnchored = false;
    pl.scissorHitDone = false;
    // ...and WHETHER THIS SCISSOR HAS ANYTHING TO CLOSE ON (see `updateScissor` / `poseScissor`):
    // written once, on the leap, off whether a target was found. True means the whole clamp is the
    // MISS — the legs snap shut on empty air, the rig is left to the air instead of winding about a
    // neck, and the landing is a stumble. It is a flag rather than a live read because the swing has
    // to be decided BEFORE it starts: a clamp that wound a third of its turn and only then found out
    // there was no neck would have to unwind, which is a pop no shape survives.
    pl.scissorMiss = false;
    // ...and the MISS's own channels (session 152 — reworked session 191, see `SCISSOR_MISS_FLIP` /
    // `SCISSOR_MISS_DOWN`): the whole rig's forward pitch (the front somersault, then the lie), which
    // HALF of the miss's tail the move is in — 0 the air (guard, leap, clamp), 1 the settle, 2 the
    // rise — the two clocks that half runs on (`scissorMissT` into the leap's own airtime
    // `scissorAirT` for the air, `scissorDownT`/`scissorGetupT` for the deck), and the EASED
    // deck-rest correction `scissorRest` (the player placed by his lowest vertex while he is down,
    // see `solveDeckClamps` in placement.js). `lastScissorMiss` is where the world is told to draw
    // the air the scissors cut: it is written on the shut frame off the two drawn ANKLES and read by
    // `main.js` when it spends the `scissormiss` event, so the ring is on the pair of legs that
    // closed rather than at an offset.
    pl.scissorPitch = 0;
    pl.scissorMissT = 0;
    pl.scissorAirT = 0;
    pl.scissorMissPhase = 0;
    // ...and whether the DECK half has been opened at all (see `solveScissorPose`): it stays true
    // after the move ends so the layer keeps wearing the `getup` shape while it fades out, instead
    // of cross-fading back into the scissor's own shape on a body that has just stood up from the
    // pavement.
    pl.scissorMissDeck = false;
    // ...and how far the chase camera comes down with him while he is on the deck (see
    // `SCISSOR_MISS_CAM_DROP` — read by `camera.js`).
    pl.camDrop = 0;
    pl.scissorDownT = 0;
    pl.scissorGetupT = 0;
    pl.scissorRest = 0;
    pl.lastScissorMiss = null;
    pl.capoT = 0;
    pl.capoAir = false;         // has the kick taken him off the deck yet (phase 1's own flag)
    pl.capoHitDone = false;
    pl.capoHit = false;         // did the kick land? a hit is what OPENS THE SKY (see `capoContact`)
    pl.capoCarryTarget = null;  // ...and the body it caught, which rides up on his soles
    // ...and the carry's own grab (see `updateVisual`): the clock the yank onto the boot runs on
    // (negative until the carry's first frame), and the point the head was actually at when it
    // started, so the face is WALKED onto the sole rather than snapping a body and a half onto it.
    pl.capoGrabT = -1;
    pl.capoGrabFrom = new THREE.Vector3();
    pl.airComboT = 0;        // the window the launch opens for AIR M1s
    pl.airComboIdle = 0;     // ...and its IDLE clock: no hit inside `P.AIR_IDLE` shuts it (session 94)
    // The ONE piece of the body's OWN motion the air combo's bullet time still owns (see
    // `airComboGravity`): written by `main.js`'s loop from the live `slowmo` ramp and read here. His
    // attacks, his chain and his horizontal movement all run on the RAW frame step, because that is
    // what the user asked for — *"my speed is normal only slow the stuff around me and my fall speed
    // but my attacks speed are the same"* — so the hang his descent gets is the only part of him the
    // slow is allowed to touch. 1 whenever no combo is open, so it is inert for every other caller.
    pl.fallScale = 1;
    // ...and the DIVE LAUNCH's own clocks (see `diveContact`): the cooldown the purple diamond
    // beside the dial draws, the bodies THIS dive has already arrived on (one launch per dive, one
    // check per body), and the frame the arrival is read on.
    pl.airCd = 0;
    pl.diveHits = new Set();
    pl.lastDiveHit = null;
    pl.diveArrive = false;
    // The wish direction of the last frame, as a unit vector (`dash` fires along it — a skill press
    // is not an input frame, so the direction has to be left where the movement put it).
    pl.wishX = 0;
    pl.wishZ = 0;

    // The debug/fallback body: the collision cube itself wearing the old orange runner's face,
    // authored at the base size (a 0.9 cube) and scaled up to the character's box. It is what
    // you see until the real character model finishes loading, and it stays as the fallback if
    // that load fails, so it has to match the box exactly.
    const geo = buildBoxGeometry(
      [
        { x: -0.45, y: -0.45, z: -0.45, w: 0.9, h: 0.9, d: 0.9, c: [0.96, 0.42, 0.14] },
        { x: -0.24, y: -0.1, z: 0.44, w: 0.48, h: 0.17, d: 0.04, c: [0.1, 0.11, 0.14] },
        { x: -0.3, y: 0.06, z: 0.44, w: 0.6, h: 0.05, d: 0.03, c: [0.98, 0.85, 0.3] },
        { x: -0.24, y: -0.28, z: -0.56, w: 0.48, h: 0.5, d: 0.14, c: [0.72, 0.28, 0.1] },
        { x: -0.46, y: -0.1, z: -0.14, w: 0.04, h: 0.28, d: 0.28, c: [0.78, 0.32, 0.1] },
        { x: 0.42, y: -0.1, z: -0.14, w: 0.04, h: 0.28, d: 0.28, c: [0.78, 0.32, 0.1] },
      ],
      { uvScale: 1, ambient: 0.5, diffuse: 0.48, hemi: 0.12 }
    );
    pl.material = createMaterial({ minLight: 0.42 });
    pl.group = new THREE.Group();
    pl.inner = new THREE.Group();
    // ...and THE SLOPE's own layer, between the two (see `updateVisual` and "THE SLOPE" in
    // README.md): `group` carries the position and the facing, `inner` carries the pose, and this
    // carries the one rotation that belongs to the GROUND rather than to the body — the lean that
    // lies the whole man onto the deck's own normal. It sits between them so the pose stack inside
    // `inner` is untouched by it (every contact it solves is solved in the body's own frame, which is
    // what the lean is), and it is the layer whose origin is moved to keep the FEET on the ground
    // while the body tips — a roll about the hips drives the feet through the deck, and a roll about
    // the feet is the only one a standing body can actually make.
    pl.tiltG = new THREE.Group();
    pl.mesh = new THREE.Mesh(geo, pl.material);
    pl.mesh.scale.setScalar(CHAR_SCALE);
    pl.inner.add(pl.mesh);
    pl.tiltG.add(pl.inner);
    pl.group.add(pl.tiltG);
    pl.group.position.copy(pl.pos);
    scene.add(pl.group);

    // The real character model loads in the background; the box above stays visible
    // until it arrives (and remains the fallback if the model can't be loaded).
    pl.charCtn = new THREE.Group();
    pl.inner.add(pl.charCtn);
    pl.charMesh = null;
    pl.charLoad = 0;
    pl.charMode = "street";
    pl.runPhase = 0;
    pl.runBlend = 0;
    pl.slidePose = 0;
    pl.idlePose = 0;
    pl.idleTime = 0;
    // THE IDLE'S FEET (see the `IDLE_FOOT_*` block): how far the deck under each foot sits above the
    // deck the body itself is standing on, in the RIG's own units — the world number the query returns
    // is divided by the rig's scale before it lands here, because that is the frame `poseIdle` solves
    // in. Zeroed by `respawn` so a fresh body starts on flat ground.
    pl.footGround = [0, 0];
    // Crouch (a modifier on the ground state, not a state of its own) and the action-pose
    // blends: one per state, each fading in and out over its own timer.
    pl.crouching = false;
    pl.crouchPhase = 0;
    pl.crouchPose = 0;
    pl.airPose = 0;
    pl.divePose = 0;
    pl.slamPose = 0;
    // The three skills' own pose weights (see `updateVisual`).
    pl.whirlPose = 0;
    pl.kneePose = 0;
    pl.grabPose = 0;
    pl.scissorPose = 0;
    pl.capoPose = 0;
    // THE TOTE (see `poseTote`): the gear owns the bag and writes these four, the player only
    // spends them on the rig. `toting` is the layer's weight input, `toteKind` which shape, and
    // `toteT` that shape's clock (seconds while the bag is in the arms, 0..1 through a throw).
    pl.toting = false;
    pl.toteKind = "hold";
    pl.toteT = 0;
    pl.totePose = 0;
    // THE HANDS (see `poseCarry` in streetwear.js, and "THE HANDS" in inventory.js): the gear owns
    // whatever is carried in one hand and writes these two, the player only spends them on the rig.
    pl.carrying = false;
    pl.carryT = 0;
    pl.carryPose = 0;
    // ...and THE BALL ACTIONS (session 180 — see `poseBallAction` in streetwear.js, and the block on
    // them in inventory.js): the throw, the slam and the shoot. The gear writes `ballKind`/`ballPhase`
    // and the player spends them, exactly the way the carry's two work — plus `ballPose`, the layer's
    // own weight, and `ballLast`, which kind is being faded OUT (the phase is left at 1 once a shape
    // has played out, so the fade rides the follow-through and never snaps back to the wind-up).
    // `ballCharge`/`ballShow` are the SHOOT's own two (session 198): how full the wind-up is, and the
    // weight of the in-world charge meter beside him (see `publishCarry` in inventory.js).
    pl.ballKind = null;
    pl.ballPhase = 0;
    pl.ballPose = 0;
    pl.ballLast = "shoot";
    pl.ballCharge = 0;
    pl.ballShow = 0;
    // ---- THE SKATEBOARD (session 200 — see player/board.js and the `BOARD` block in config.js) ----
    // `board`/`boardRig`/`boardDeck` are the GEAR's half: the drop being ridden, the mesh it is drawn
    // with (parented into `tiltG` while riding) and the board's own height, which the rig is lifted by
    // (see `solvePlacement`). Everything else is the body's: the ride's own fade and clock, the deck's
    // three live angles (the carve, the manual, the powerslide's yaw), the push's cadence clock and
    // its phase, the trick's row / clock / duration / spins, the bail's lock, and the two mechanics'
    // own pose weights and clocks.
    pl.board = null;
    pl.boardRig = null;
    pl.boardDeck = 0;
    pl.ridePose = 0;
    pl.rideT = 0;
    pl.boardLift = 0;
    pl.boardCarve = 0;
    pl.boardManual = 0;
    pl.boardPushT = 0;
    pl.boardPushPh = -1;
    pl.trickKind = -1;
    pl.trickT = 0;
    pl.trickDur = 0.5;
    pl.trickCd = 0;
    pl.trickCycle = 0;
    pl.trickName = "";
    pl.trickRoll = 0;
    pl.trickYaw = 0;
    pl.trickBody = 0;
    pl.trickSpins = false;
    pl.trickSpd0 = 0;
    pl.boardMissT = 0;
    pl.boardSpinY = 0;
    pl.bslidePose = 0;
    pl.bslideT = 0;
    pl.bslideAngle = 0;
    pl.bslideSide = 0;
    pl.bbombPose = 0;
    pl.bbombT = 0;
    pl.bbombCd = 0;
    pl.trickUnwind = 0;
    // ...and the gear itself, wired by main.js: the ride is the one thing the body can hand BACK (a
    // bail gives the deck to the world — see `bailBoard`), and the deck lives in the gear's drops.
    pl.gear = null;
    // ...and which phase of the capo that weight is drawn in (see `updateVisual`): held after the
    // state ends so the launch's last frame cross-fades into the air pose instead of cutting.
    pl.capoDrawPhase = -1;
    // The slam's own landing (a one-shot, unwinding on its own timer) and the hammer's clock, the
    // bounce it rides and the turn its beats take.
    pl.slamLandT = 0;
    pl.slamLandPower = 0;
    pl.slamLandPose = 0;
    pl.hammerT = 0;
    pl.hammerHit = 0;
    pl.hammerPose = 0;
    pl.hammerAir = 0;
    pl.hammerLift = 0;
    pl.hammerSpin = 0;
    pl.hammerFlip = 0;
    pl.dashPose = 0;
    pl.dashPitch = 0;
    pl.mantlePose = 0;
    pl.wallPose = 0;
    pl.climbPhase = 0;
    // THE CLIMB'S MOMENTUM AND REST (see the `CLIMB_MOM_` / `CLIMB_REST_` blocks in `P`): the seconds
    // of continuous push the speed is earned from, and the weight of the idle rest stance.
    pl.climbMomT = 0;
    pl.climbRest = 0;
    // ...and THE PULL (see the `CLIMB_LOAD_` / `CLIMB_SKIP_` blocks in `P`): the load's own clock, the
    // weight of its stance, the charge it has built and how deep the coil has wound, then the fire —
    // its clock, the distance it is spending, and where the body was when it was released (the pose
    // compensates every contact by the ACTUAL travel off that mark, so a planted hand stays planted
    // however the physics spends the distance).
    pl.climbLoadT = 0;
    pl.climbLoad = 0;
    pl.climbCharge = 0;
    pl.climbSink = 0;
    pl.climbFireT = 0;
    pl.climbFireDist = 0;
    pl.climbFireY = 0;
    pl.climbRiseU = 0;
    pl.climbRel = 0;
    pl.climbBurst = 0;
    // ...and THE LAUNCH SHAPE the skip's flight is drawn with (session 177 — see `poseClimbFly`):
    // the weight of the pad-launch overlay, and the release point + wall face the VFX are fired from
    // (`main.js` reads `lastClimbSkip` on the `climbskip` event).
    pl.climbFly = 0;
    pl.lastClimbSkip = null;
    // ...and THE PARK's own idle clock: it runs for as long as he is on the stone, so the parked
    // body's breath and its head are wherever they are rather than restarting on every hang.
    pl.climbRestT = 0;
    // ...and THE CLIMB'S OWN BEAT (session 181 — the user's *"fix the wall climb sfx"*): which of the
    // clip's four contact beats the tick has last sounded on (see the beat read in `solveWallPose`).
    // It starts at -1, which ARMS the tick without firing it — the grab itself sounds through
    // `wallGrab` (attach.js), so the first beat of a fresh climb must not double it.
    pl.climbBeat = -1;
    // ...and THE CLIMB'S TWO SPEEDS (see the `CLIMB_PULL_DEPTH` block in `P`): the un-stroked target the
    // phase clock reads (`climbUp` up the face, `climbSide` across it) and the stroke the body is
    // wearing this frame (`climbPull`). All three are re-written every frame by `update`, and
    // neutral (0 / 0 / 1) on any frame that is not a climb.
    pl.climbUp = 0;
    pl.climbSide = 0;
    pl.climbPull = 1;
    // Whether the climb hold the player is currently holding started in the AIR (see `canGrab` in
    // the wall-attach block, and the note there): a SPACE (or CLIMB pad) hold that began on the
    // deck cannot take a face — the player has to press again once he is off the ground.
    pl.climbHoldAir = false;
    // ---- THE WALL CLINCH's own state (see `startWallBeat` / `updateWallBeat`, and "THE WALL
    // CLINCH" in src/README.md) ----
    // The ENTRY tally and its window (see `feedWallChain`), then the move itself: the state's own
    // clock and phase, the wall face and the two staging points it PLACES the pair on, the pin
    // target walked into the victim's head, and the knee beat the flurry is currently on (its
    // index, which leg, and the jolt of the last one).
    pl.wallChain = 0;
    pl.wallChainT = 0;
    pl.wallBeatT = 0;
    pl.wallBeatPhase = 0;
    pl.wallBeatPu = 0;          // ...the phase's own 0..1, for the pose
    pl.wallBeatSched = null;    // ...and the knee schedule (see `wallBeatSchedule`)
    pl.wallBeatWall = null;     // {nx, nz, faceX, faceZ, deck, topY}
    pl.wallBeatStage = null;    // {x, y, z} the attacker is placed on
    pl.wallBeatStandFrom = null;// ...and where he was when the move opened
    pl.wallBeatHead = null;     // {x, y, z} the victim's skull is pinned to
    pl.wallBeatHeadFrom = null; // ...and where it was (the pin's own yank walks in from it)
    pl.wallBeatYaw = 0;         // the facing both of them are squared onto (into the wall)
    pl.wallBeatTarget = null;   // the body being held
    pl.wallBeatKnee = 0;        // how many knees have landed
    pl.wallBeatSide = -1;       // which leg the NEXT knee is (alternating; -1 = his own right)
    pl.wallBeatJolt = 0;        // the pulse of the last impact, decaying between beats
    pl.wallBeatBlur = 0;        // how far into the accelerating tail the flurry is (0..1)
    pl.wallBeatPose = 0;        // the pose layer's own weight
    pl.wallBeatSmashDone = false;
    pl.wallBeatHurlDone = false;
    pl.lastWallbSmash = null;   // the head-to-wall impact (main.js reads it for the FX)
    pl.lastWallbKnee = null;    // ...each knee
    pl.lastWallbHurl = null;    // ...and the throw off the wall
    pl.landPose = 0;
    pl.landT = 0;
    pl.landPower = 0;
    pl.flipPose = 0;
    // Which of the three airborne shapes this airtime is riding (see poseAir). Re-picked on
    // every jump, never repeating the one before it, so a chain of jumps is never a loop.
    pl.jumpVariant = 0;
    // The melee chain: which move is due, how long the chain stays open, the live move's own
    // clock, and the enemy manager it lands on (main.js hands that over with `setEnemies`).
    pl.enemies = null;
    pl.attackMove = 0;
    pl.attackT = 0;
    pl.attackTotal = 0;
    pl.attackDone = true;
    pl.attackNext = false;
    pl.attackIgnore = false;
    pl.attackFaceTo = null;
    // The body the live move locked onto (see `startAttack`). Only the 2nd M1 uses it — the
    // clinch solves its two hands onto that body's head every frame — but it is kept for the
    // whole move, so the grab cannot wander off onto whatever is nearest halfway through.
    pl.attackTarget = null;
    pl.attackPose = 0;
    // How much of a chained move's pose has been handed over from the move before it (see
    // `P.COMBAT_LINK_FADE` in `updateVisual` and `chainBlend`): 1 outside a chain, reset to 0 by a
    // chained start.
    pl.attackLink = 1;
    pl.combo = 0;
    pl.comboGrace = 0;
    pl.attackCd = 0;
    pl.attackBuf = 0;
    pl.hitstop = 0;
    pl.lastHit = null;
    // How long the live move has been off the ground (see `COMBAT_AIR_GRACE`), and the rig's
    // own turn for the moves that spin (`COMBAT_MOVES[i].spin`).
    pl.attackAirT = 0;
    pl.attackSpin = 0;
    pl.attackSpinning = false;
    // ...and the DOWN SLAM's own two (see `P.DSLAM_*`): whether the live move is the airborne
    // finisher rather than the one-two, the rig's own FLIP through it (radians of forward pitch —
    // the same channel the double jump's revolution rides), and the window an airborne press has
    // to throw it in after a chain has been broken by a jump (`P.COMBAT_AIR_FINISH`).
    pl.attackSlam = false;
    pl.attackFlip = 0;
    // ...and the UPPERCUT's own flag (see `startUppercut`): the other variant that rides the
    // finisher's slot, and the only thing that says the live move is it.
    pl.attackUpper = false;
    pl.airFinisherT = 0;
    pl.dslamWhiff = false;
    pl.dslamWhiffT = 0;
    // ---- THE BLOCK's own state (see `block` / `startBlock`, and `P.BLOCK_*`) ----
    // `guardRush` is the same decision as `guardCharging`, but as the 0..1 BLEND the pose reads
    // (see `updateVisual`), so the guard can open into the charge over `GUARD_RUSH_FADE` instead of
    // in one frame.
    pl.guardT = 0;             // the state's clock
    pl.guardPose = 0;          // the pose's own weight (see `updateVisual`)
    pl.guardRush = 0;          // 0 the GUARD → 1 the CHARGE (the pose's blend)
    pl.guardCharging = false;  // ...and the same thing as the DECISION the movement reads
    pl.guardHold = 0;          // how long forward has been held on the guard (see `BLOCK_RUSH_T`)
    pl.guardBroken = false;    // the guard has broken into the charge once already this block
    pl.guardDirX = 0;          // the CHARGE's own heading — the thing `BLOCK_RUSH_STEER` swings
    pl.guardDirZ = 1;
    pl.guardPhase = 0;         // the stride's own cycle, advanced off the speed actually made
    pl.guardHitT = 0;          // the absorb jolt (see `blockCatch`)
    pl.guardHits = new Set();  // the bodies THIS charge has already shoved (one shove each)
    pl.lastShove = null;       // ...the shove itself (main.js reads it for the FX)
    // ---- THE GUARD'S TOGGLE (see `guardLatch` below and `startBlock`) ----
    // The chord pressed TWICE in quick succession (inside `P.BLOCK_TOGGLE_T`) TOGGLES the guard:
    // it is carried hands-free until a jump or a press of either button lets it go. `guardChordUp`
    // is the clock the second press is measured against — seconds since the chord last came UP, or
    // -1 for as long as it is held.
    pl.guardLatch = false;
    pl.guardChordWas = false;
    // Seconds since the chord came UP, and it starts PAST the window rather than at -1: -1 is the
    // "never pressed / still down" marker the watcher assigns, and a fresh page that read it as 0
    // made the player's very first chord press a toggle (measured: the guard latched on the first
    // press of the session, off a counter that had merely been counting since the page loaded).
    pl.guardChordUp = P.BLOCK_TOGGLE_T + 1;
}
