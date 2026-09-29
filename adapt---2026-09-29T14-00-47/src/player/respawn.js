// ---------------------------------------------------------------------------
// Part 26 of the `player.js` split: THE RESPAWN.
//
// Moved here from player.js: `respawn` — the `]` key's clean reset. It puts the body back on its
// spawn, heals it, and lets go of everything it was holding (every carried body's `carryOrbit`/
// `headPin`, the staff, the wall it was attached to), then sets the state back to air. The two
// things it calls back into the class are `releasePole` (pole.js) and `setState` (core.js).
//
// Deps: `P` only (plus the body's own fields) — a near-leaf.
// ---------------------------------------------------------------------------
import { P } from "./config.js";

const respawnMethods = {
  respawn() {
    this.pos.copy(this.spawn);
    this.pos.y = this.spawn.y + 1;
    this.vel.set(0, 0, 0);
    this.grip = P.GRIP_MAX;
    // ...and the slope reading is put back to flat with him: the spawn is the summit (dead level in
    // the hills and the plain in the other two), and a body standing back up out of a slope should
    // not come up wearing the last one's lean for a frame (see "THE SLOPE").
    this.slopeTan = 0;
    this.slopeGx = 0;
    this.slopeGz = 0;
    this.onSlope = false;
    this.slopeCarry = 0;
    this.slopeBlend = 0;
    this.tiltPitch = 0;
    this.tiltRoll = 0;
    // ...and the idle's feet start level (see `footGround`): a body put back on the spawn is standing
    // on flat deck, and carrying the last drop's step offsets into it would show as a pop.
    this.footGround[0] = 0;
    this.footGround[1] = 0;
    // A respawn is also a full heal (and the `]` key has to stay a clean reset, not a way to eat
    // a punch and teleport with the wound still on you).
    this.hp = P.HP_MAX;
    this.hurtT = P.HP_REGEN_DELAY;
    this.hurtCd = 0;
    this.jumpsLeft = P.AIR_JUMPS;
    this.flipT = 0;
    this.spinX = 0;
    this.slamHeight = 0;
    this.chain = 0;
    this.throttle = 0;
    this.lastSlam = null;
    this.lastSlideHit = null;
    this.blast = null;
    // ...and every hold is let go of: a respawn in the middle of the whirl must not leave a body
    // marked as held (the enemy would keep its `grabDist`/orbit for the life of the page).
    if (this.whirlTarget && this.whirlTarget.built) {
      this.whirlTarget.carryOrbit = null;
      this.whirlTarget.grabT = 0;
      this.whirlTarget.grabDist = null;
    }
    this.whirlTarget = null;
    this.whirlHold = 0;
    // ...and the knee's own aim (see `knee`): a respawn mid-leap must not leave the next press
    // aimed at a body the body is no longer chasing.
    this.kneeTarget = null;
    this.kneeHitBody = null;
    // ...and the GRAB's (see `grab`): the same bargain, one move further — a respawn mid-haul must
    // let go of the body it had.
    if (this.grabTarget && this.grabTarget.built) {
      this.grabTarget.carryOrbit = null;
      this.grabTarget.grabT = 0;
      this.grabTarget.grabDist = null;
    }
    this.grabTarget = null;
    this.grabFlip = 0;
    this.grabSpinY = 0;
    // ...and the LUNGE's take (see `lunge`): the same bargain one state further along — a respawn
    // in the middle of the clinch roll must let go of the body it was rolling with, or the body
    // would keep a `carryOrbit`/`grabDist` that nobody is writing any more.
    if (this.lungeTarget && this.lungeTarget.built) {
      this.lungeTarget.carryOrbit = null;
      this.lungeTarget.grabDist = null;
      this.lungeTarget.grabT = 0;
    }
    this.lungeTarget = null;
    this.lungeT = 0;
    this.lungePhase = 0;
    this.lungeBall = 0;
    this.lungeHopT = 0;
    this.lungeBlendT = 0;
    this.lungeGrab0 = null;
    this.lungeCd = 0;
    // ...and the free fall's roll-out with it (session 194 — see `startFreeRoll`): a fresh spawn must
    // not be wearing the previous life's roll flag, and the chase anchor must be back up at chest
    // height rather than dropped onto a ball the new body is not on.
    this.freeRoll = false;
    this.camDrop = 0;
    // ...and the LAUNCH's carry (skill 3): the same bargain again — the body it was dragging up must
    // not be left holding a `capoCarry` no one is writing.
    if (this.capoCarryTarget && this.capoCarryTarget.built) this.capoCarryTarget.capoCarry = null;
    this.capoCarryTarget = null;
    this.capoGrabT = -1;
    this.capoHit = false;
    this.capoAir = false;
    this.capoHitDone = false;
    this.slideHitT = 0;
    this.slideHitTarget = null;
    this.macacoT = 0;
    this.macacoHitDone = false;
    this.macacoLift = 0;
    this.clash = null;
    this.clashDrive = 0;
    this.lastClash = null;
    this.lastMacacoHit = null;
    this.lastDiveHit = null;
    this.diveHits.clear();
    this.diveArrive = false;
    this.attackSlam = false;
    this.attackFlip = 0;
    this.attackUpper = false;
    this.airFinisherT = 0;
    this.dslamWhiff = false;
    this.dslamWhiffT = 0;
    this.airCd = 0;
    this.kickBuffer = 0;
    this.kickMem = null;
    this.kickMemT = 0;
    this.kickCandidate = null;
    this.diveCandidate = null;
    this.kickSpinT = 0;
    this.kickSpinTurns = 0;
    this.fallPeakY = this.pos.y;
    this.crouching = false;
    this.crouchPose = 0;
    this.boxScale = 1;
    this.squeeze = 0;
    this.squeezeHold = 0;
    this.squeezing = false;
    this.airPose = 0;
    this.divePose = 0;
    this.slidePose = 0;
    this.slamPose = 0;
    this.slamLandT = 0;
    this.slamLandPose = 0;
    this.hammerT = 0;
    this.hammerHit = 0;
    this.hammerPose = 0;
    this.hammerAir = 0;
    this.hammerLift = 0;
    this.hammerSpin = 0;
    this.hammerFlip = 0;
    this.dashPose = 0;
    this.dashPitch = 0;
    this.mantlePose = 0;
    this.ledgePose = 0;
    this.mantleDur = P.MANTLE_TIME;
    this.mantleFromLedge = false;
    this.mantleExit = null;
    this.ledgeGrip = null;
    // ...and the pull-up's own grip weight for the frame (see `ledgePullPin`).
    this.ledgePullPin = 0;
    this.vaultCd = 0;
    this.vaultPose = 0;
    this.vaultPlantAt = null;
    // ...and the MOMENTUM DIVIDEND the last crossing paid (see the vaultend block in `update`): how
    // much of `VAULT_EXIT_BONUS` a fast vault earned. Nothing in the physics reads it after the frame
    // it lands — it exists so the run's own read-out (`GAME.vault()`) and the HUD can report it.
    this.vaultBonus = 0;
    this.vaultKind = 0;
    this.vaultFlip = 0;
    this.vaultRoll = 0;
    this.vaultApex = 0;
    this.ledgeT = 0;
    this.ledgeWall = null;
    this.ledgeTo = null;
    this.ledgeCd = 0;
    this.ledgeCarry.x = 0;
    this.ledgeCarry.z = 0;
    this.wallPose = 0;
    this.wallSide = 0;
    this.wallBank = 0;
    // ...and the climb's momentum and rest stance, for the same reason `wallPose` is: a respawn is a
    // fresh body, and a climb it never made cannot leave speed on it.
    this.climbMomT = 0;
    this.climbRest = 0;
    // ...and THE WALL CLINCH: a respawn lets the body it was holding go (a pinned skull with
    // nobody holding it is a body stuck on a wall for the rest of the page), and drops the entry
    // tally with it.
    if (this.wallBeatTarget && this.wallBeatTarget.built) this.wallBeatTarget.headPin = null;
    this.wallBeatTarget = null;
    // ...and THE HEAD SCISSOR's grip goes with it, for the same reason — and more so, because a
    // body this move has hold of is hanging OFF THE DECK (see `scissorGrip`): a pin left with
    // nobody writing it is a man held in the air by a neck no one has any more.
    if (this.scissorTarget && this.scissorTarget.built) this.scissorTarget.headPin = null;
    this.scissorTarget = null;
    this.wallChain = 0;
    this.wallChainT = 0;
    this.wallBeatT = 0;
    this.wallBeatPhase = 0;
    this.wallBeatKnee = 0;
    this.wallBeatJolt = 0;
    this.wallBeatBlur = 0;
    this.wallBeatPose = 0;
    this.wallBeatSched = null;
    this.wallBeatWall = null;
    this.wallBeatStage = null;
    this.landPose = 0;
    this.landT = 0;
    this.flipPose = 0;
    this.launch = null;
    this.launchT = 0;
    this.launchCd = 0;
    this.launchPose = 0;
    this.skyfall = false;
    this.skyfallT = 0;
    this.fallBrace = 0;
    this.fallDrop = 0;
    this.fallPitch = 0;
    this.plunge = false;
    this.plungeT = 0;
    this.bodySpin = 0;
    // ...and the staff. A respawn DROPS what he is carrying: the prop goes back to the deck it came
    // off (`releasePole` does exactly that — it is the one place in the game left that puts a staff
    // DOWN rather than breaking it), the move he was in is forgotten, and the durability comes back
    // with the fresh one. It is a reset, so it resets the weapon too: a player who swings their
    // staff until it snaps and then dies should not respawn holding the wreck.
    this.releasePole();
    this.poleHp = P.POLE_HP;
    this.poleT = 0;
    this.poleMode = "carry";
    this.polePose = 0;
    this.poleAtkT = 0;
    this.poleAtkBeat = 0;
    this.poleAtkCd = 0;
    this.poleAtkSpin = 0;
    this.poleWillBreak = false;
    this.poleVaultT = 0;
    this.poleVaultHit = false;
    this.poleFlipT = 0;
    this.poleLaunchT = 0;
    this.poleThrT = 0;
    this.poleReleased = false;
    this.poleFly = null;
    this.poleLiftT = 0;
    this.poleLift = 0;
    this.poleTrailN = 0;
    this.poleTrailNext = 0;
    this.lastPole = null;
    this.lastPoleBreak = null;
    // ...and the supply itself: every broken prop stands again (see `Poles.reset`), so a respawn can
    // never leave the player in a world with nothing left to pick up.
    if (this.poles) this.poles.reset();
    // ...and every wall the body was on is let go of (session 137). The attach block clears these
    // at the top of every frame ANYWAY, so a stale value can only ever be read once — but "once" is
    // `prevMode` in that block, and a `prevMode` of "climb" makes the climb SUSTAIN (it reads the
    // capsule's own flush gap instead of an input), so a respawn out of a climb would leave the body
    // clinging to the first face it touched. Cheap, and it keeps `]` a clean reset.
    this.attached = false;
    this.attachMode = null;
    this.climbing = false;
    this.wallSliding = false;
    this.wallRunning = false;
    this.wallStick = 0;
    this.wallLock = 0;
    this.wallCoyote = 0;
    this.wall = null;
    this.setState("air");
  },
};

export function installRespawn(Player) {
  Object.assign(Player.prototype, respawnMethods);
}
