import * as THREE from "./three.js";
import { settings } from "./ps1.js";
import { P } from "./player.js";

const UP = new THREE.Vector3(0, 1, 0);

// ---- the wall kick's camera move ----
// The kick turns the picture onto the exit line, and this is how it gets there: not a cut, a
// SWEEP. `aimYaw()` (what the camera renders) starts exactly where the camera already was and
// eases round to the new line, so the character stays on screen and the boot is *seen* landing
// from the side instead of the view teleporting out from under it. The turn's own size sets how
// long it takes, and a kick that lands during another sweep pays off what is left rather than
// restarting, so chained kicks stay continuous. Player steering does NOT wait for the camera:
// `moveYaw()` — the yaw the moves aim off — is the settled `yaw`, on the new line from frame 0.
//
// The shot itself is a *cinematic* one, faded in and out on a bell (so nothing pops at either
// end): the orbit pulls back and the camera rises to look down on the character through the
// middle of the turn.
const KICK_CINE_MIN = 0.34;      // seconds, the shortest sweep (a small turn)
const KICK_CINE_PER_RAD = 0.10;  // ... plus this per radian of turn
const KICK_CINE_MAX = 0.62;      // seconds, a full half turn's sweep
const KICK_CINE_PULL = 1.15;     // extra orbit distance at the middle of the shot
const KICK_CINE_PITCH = -0.12;   // and this much pitch (a lower pitch = a higher camera)
// THE MOVE CAMERA's own settle (see `setMovePull`): how fast the shot eases toward the distance a
// live move is asking for. Slow enough to read as the camera being taken in rather than cut, fast
// enough that a move 0.36 s into its commitment is already framed.
const MOVE_CAM_RATE = 3.2;
// ...and its SWING (see `setMoveOrbit`): the move camera's own YAW, laid on top of the picture's
// yaw so a move can be watched from off the player's own sight line. Distance alone cannot frame a
// move that happens between the player and the thing he is pressed against — from behind the body
// the body IS the shot, and a clinch that walks a skull onto a wall and works its gut is entirely
// behind the shoulders. Swinging the shot round to the pair's flank puts both bodies in profile,
// side by side down the wall, which is the only angle that move reads from.
const MOVE_ORBIT_RATE = 3.6;

// ---- first person ----------------------------------------------------------
// The first-person camera is the character's own HEAD (see `follow`): the eye rides the head
// bone, sat down at the FACE and taken a hair out in front of it — which means the view pitches
// with a dive, drops with a landing and leans on a wall run, because the body is doing all of
// those and the eye is on it. The body itself is NOT hidden (only its head is), so the arms, chest
// and legs are there when you look down; they are the same rig the action poses drive.
//
// ...and the BODY turns with the look. `player.js` holds the facing on the camera's own line while
// the mode is on (the `firstPerson` branch of its facing chain), because the eye is ON the head:
// a body left pointing wherever it last walked would have the view spinning inside its own
// shoulders. Where a MOVE owns the aim instead — the pad, a vault, a grab, the knee, the wall
// clinch — `follow` turns the LOOK onto the body (see `FP_BODY_AIM`), so the view is never left
// staring out of the side of the head.
//
// Two things are added on top of the head's own motion, because from inside the head neither
// exists otherwise:
//
//   * THE WALK. The model's run cycle is all limbs — the hips never rise — so a first-person walk
//     that only followed the head would read as sliding. The bob (twice per stride, once per
//     footfall), the sway and the little roll are authored here, scaled by the speed actually
//     carried, and the standing breath covers the idle case.
//   * THE TUMBLE. A flip — the double jump, the wall kick or the backdash — somersaults the body;
//     from inside, the only thing that can show that is the WORLD going over, so the body's spin
//     (`player.bodySpin`) is taken OFF the view's pitch — MINUS it, because the body's own forward
//     comes out of that same rotation as `(0, -sin, cos)` (see the note at `aimPitch`; added, the
//     two ran against each other and the body turned at twice the world's rate). The eye is pinned
//     to the head's own face for a tumble as well (the anchor below is built in the BODY's frame),
//     so the somersault is the world going over around a steady body, which is what it should be.
//   * THE BODY IN ITS OWN FACE. A pose can put a limb right through the eye (the kip-up's leg whip
//     does), so the rig is taken off the screen for as long as the eye is inside it — measured
//     against the rig's own bones, see `FP_BODY_NEAR_HIDE` and the note in `follow`.
//
// The eye's height, the pull over the axis, the bob and the tumble follow are all live-tunable
// through `rig.fp` (see the constructor), so the look can be swept against measurements in the
// running page.
const FP_EYE_UP = 0.24;          // how far up the head the eye sits, along the BODY's own up (so it
                                 // rides a tumble: see the anchor in `follow`). The bone is the base
                                 // of the skull, so this is EYE LEVEL, not the crown
const FP_EYE_FWD = 0.24;         // ...and this far out of the face, along the body's own front. At
                                 // the face the shoulders are BEHIND the eye, so looking down shows
                                 // the chest and its emblem instead of the flat top of the torso
const FP_EYE_CENTER = 0.0;       // how far the eye is pulled back over the body's axis (see follow).
                                 // 0 = at the head; the channel stays for tuning against measurements
const FP_BODY_FOLLOW = 6;        // how fast the LOOK swings onto the body's own line while the BODY
                                 // is the one aiming (see `FP_BODY_AIM`) — a rate, not a snap, so a
                                 // vault carries the head round rather than cutting to it
const FP_PITCH_MAX = 1.50;       // how far up and down first person may look (rad, ~86°). The chase
                                 // camera stops at 1.32 — from behind the body a steeper shot would
                                 // be looking up its own back — but the eye IS the head here, and a
                                 // head that cannot look at its own feet is a head that feels bolted on
// The states in which the BODY, not the player, owns the aim: he is squared on a wall, on what he
// has grabbed, or on a line he was placed along. First person rides those or the view is left
// looking out of the side of his own head. (The wall attachments are player FLAGS rather than
// states, so `follow` tests those too.)
const FP_BODY_AIM = { launch: 1, mantle: 1, vault: 1, ledge: 1, lunge: 1, grab: 1, knee: 1, wallbeat: 1, clash: 1 };
const FP_TUMBLE_FOLLOW = 10;     // eye follow rate WHILE the body is tumbling (it orbits the hip)
// THE BODY GETS OUT OF ITS OWN WAY (see the note in `follow`): the eye's distance to the nearest
// DISTAL limb segment at which the rig is taken off the screen, and the farther one at which it is
// handed back (hysteresis). Measured through the whole move set — see the constants' note.
const FP_BODY_NEAR_HIDE = 0.40;
const FP_BODY_NEAR_SHOW = 0.52;
// The four segments that can arrive at a face: forearm→hand and shin→foot, both sides. The upper
// arms and thighs are deliberately not in here — a shoulder sits ~0.47 u from the eye in EVERY
// pose, so including them would flag the whole game.
const FP_LIMBS = [
  ["armLowerL", "handL"], ["armLowerR", "handR"],
  ["legLowerL", "footL"], ["legLowerR", "footR"],
];
const FP_FOV = 8;                // extra degrees of field of view over the third-person base
const FP_BOB_UP = 0.052;         // the run's bob at a full sprint (two dips per stride)
const FP_BOB_SIDE = 0.046;       // ...its sway (one per stride)
const FP_BOB_ROLL = 0.028;       // ...and the roll that goes with the sway
const FP_BREATH = 0.020;         // the standing breath
const FP_LAND_DIP = 0.16;        // how far the eye folds down under a full-impact landing
const FP_ROLL_GAIN = 3.2;        // how much more of the body's bank first person shows

export class CameraRig {
  constructor(camera, player, world) {
    this.camera = camera;
    this.player = player;
    this.world = world;
    this.yaw = 0;
    this.pitch = 0.22;
    this.baseDist = 5.0;
    this.dist = 5.0;
    this.wantDist = 5.0;
    this.minDist = 2.2;
    this.maxDist = 9.0;
    this.anchor = new THREE.Vector3();
    this.smoothAnchor = new THREE.Vector3();
    this.shake = 0;
    this.baseFov = 61;
    this.fov = 61;
    this.fovKick = 0;
    // THE IMPACT PUNCH (see `punch` / `rollKick`). A hit the camera is close to is felt two ways and
    // the game only had one of them: `shake` is a translation, which reads as a knock on the world,
    // and this is a LENS — a couple of tenths of a second where the picture is a touch tighter than
    // it should be and then opens back up. That is the difference between "the ground is shaking"
    // and "something hit something, and it was right there".
    this.fovPunch = 0;
    this.fxRoll = 0;
    // ...and THE PULL — the third way a hit is felt. `fovPunch` changes the lens and `shake` knocks
    // the world, but neither moves the camera THROUGH the space between it and the fight, and at the
    // chase distance (5..7 units) an impact of world objects is small on screen no matter how bright
    // it is. `fxPull` is a distance offset in world units: negative brings the camera in toward the
    // body (so the contact, and everything the strike threw off it, grows on screen for a moment),
    // positive pushes it back out (what a vault wants — the obstacle has to fit in the frame). It
    // rides the same clock as the punch and is read by `follow`.
    this.fxPull = 0;
    // ...and THE MOVE CAMERA — a second, slower pull for a MOVE that wants the frame held in for
    // its whole length rather than punched in on each beat (see `setMovePull`). `fxPull` above rides
    // the impacts and decays between them, which is exactly right for a punch and wrong for the wall
    // clinch: twelve beats would have the camera pumping in and out twelve times instead of sitting
    // on the pair. This one is a WANT that the caller sets while the move is live and eases to zero
    // the frame it stops, so the shot closes as the move commits and opens as it lets go.
    this.movePull = 0;
    this.movePullWant = 0;
    // ...and the swing that goes with it (see `setMoveOrbit`): the move's own yaw offset, laid on
    // the picture in `aimYaw()` and never on `moveYaw()`, so the shot can stand off the player's
    // line while the player's own steering and aim stay exactly where they were.
    this.moveOrbit = 0;
    this.moveOrbitWant = 0;
    // ...and the rest of the MOVE FRAME (see `setMoveAnchor` / `setMoveRise`): the point the shot is
    // CENTRED on and the height its eye is lifted to. `moveAnchor` is a world-space offset from the
    // player's own chest, so a move that has two bodies in it can put the frame between them, and
    // the rise is a camera-only lift (the centre stays put, so the shot looks down at it).
    this.moveAnchor = new THREE.Vector3();
    this.moveAnchorWant = new THREE.Vector3();
    this.moveRise = 0;
    this.moveRiseWant = 0;
    this.roll = 0;
    this.firstPerson = false;
    // SHIFT LOCK (ALT — see `P.LOCK_*` and `setShiftLock`): the camera's own look in the lock
    // (nearer, over the shoulder), the swing onto the body's line when the lock goes on, and the
    // blend the first of those rides.
    this.shiftLock = false;
    this.lockBlend = 0;
    this.lockSwing = 0;
    // The lock's own distance, i.e. what the wheel zooms while the lock is on. `null` means "not
    // chosen yet" and `lockDistance()` then falls back to the reading distance the lock was tuned
    // to (`P.LOCK_DIST`, or the free camera's own distance if that is already nearer).
    this.lockDist = null;
    // The kick's sweep: `cineCur` is the yaw the picture is still OWED (a negative offset that
    // decays to zero — see `kick`), `cineAmt` is how cinematic the shot is right now (a 0→1→0
    // bell, for the pull-back and the pitch dip), and `cineT`/`cineDur` are its clock.
    this.cineT = 0;
    this.cineDur = 0;
    this.cineFrom = 0;
    this.cineCur = 0;
    this.cineAmt = 0;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    // First person: the eye, the head's own frame, and the walk's bob/sway/roll. `fp` is the
    // live tuning table for all of it (the same numbers the module constants above default to),
    // so the look can be swept against measurements in the running page.
    this._eye = new THREE.Vector3();
    this._hipW = new THREE.Vector3();
    this._off = new THREE.Vector3();
    this._fq = new THREE.Quaternion();
    this._segA = new THREE.Vector3();
    this._segB = new THREE.Vector3();
    this.bodyHide = false;
    this._wasFp = false;
    this.fp = {
      eyeUp: FP_EYE_UP,
      eyeFwd: FP_EYE_FWD,
      eyeCenter: FP_EYE_CENTER,
      fov: FP_FOV,
      bobUp: FP_BOB_UP,
      bobSide: FP_BOB_SIDE,
      bobRoll: FP_BOB_ROLL,
      breath: FP_BREATH,
      landDip: FP_LAND_DIP,
      rollGain: FP_ROLL_GAIN,
      tumbleFollow: FP_TUMBLE_FOLLOW,
    };
    this.bobY = 0;
    this.bobX = 0;
    this.bobRoll = 0;
  }

  aim(lookX, lookY) {
    this.yaw -= lookX;
    this.pitch -= lookY;
    // The look's own limits. First person IS the head, so it looks nearly straight up and down
    // (which is what lets you look at your own chest and feet); the chase camera stops at 1.32 rad,
    // where the shot would otherwise swing under the body. `follow` clamps the third-person aim on
    // its own, and this is re-clamped on a mode change so leaving first person can never start the
    // chase camera above its own limit.
    const lim = this.firstPerson ? FP_PITCH_MAX : 1.32;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;
  }

  // Where the view is actually pointing — the settled yaw PLUS whatever the kick's sweep still
  // owes it (see `kick`). That distinction is the whole of the cinematic turn: the moment a kick
  // lands, `yaw` is already on the exit line (so `moveYaw` and every move aimed off it are too)
  // while the PICTURE is still where the camera was, and over `cineDur` the two close back up.
  aimYaw() {
    return this.yaw + this.cineCur + this.moveOrbit;
  }

  // The yaw the player steers off. That is the picture's SETTLED yaw, which is also what makes
  // the kick's turn something the body can be *seen* taking: see `kick`.
  moveYaw() {
    return this.yaw;
  }

  // The wall kick's turn onto your new line: `yaw` lands on `amount`'s result on the SAME frame
  // the boot does (so the new line is yours immediately), and the picture is given the turn as a
  // debt instead of taking it as a cut — `cineCur` starts at `-amount` (i.e. exactly the yaw the
  // camera already had, so nothing moves on this frame) and eases to zero over `cineDur`, which
  // is what sweeps the camera around the character and shows the kick going off.
  //
  // It used to be a whip: the base yaw jumped the whole turn while a mirror of that jump (plus
  // an extra revolution) eased back to zero over 0.32 s. That cut the picture to the new line on
  // frame one and then merely wobbled — 0.32 s is also longer than the kick pose itself lasts
  // (`P.KICK_POSE`, 0.30 s), so the whole shape played out inside a rotating blur. Now the turn
  // is swept (the character stays on screen the whole way) and only the BODY lags it, coming
  // round on the dive's own facing easing (18/s in player.js).
  kick(amount) {
    this.yaw += amount;
    // Start from wherever the picture actually is: if a sweep is mid-flight, this pays off the
    // turn that is left AND this kick's, so two kicks in a row are one continuous move.
    this.cineFrom = this.cineCur - amount;
    this.cineDur = Math.min(KICK_CINE_MAX, KICK_CINE_MIN + Math.abs(this.cineFrom) * KICK_CINE_PER_RAD);
    this.cineT = 0;
    this.cineAmt = 0;
    this.shake = Math.max(this.shake, 0.5);
    this.fovKick = 1;
  }

  // The kick's own camera punch: a hit of FOV that decays (read by `follow`).
  updatePunch(dt) {
    if (this.fovKick > 0) {
      this.fovKick *= Math.max(0, 1 - dt * 4.5);
      if (this.fovKick < 0.002) this.fovKick = 0;
    }
    // ...and the strike's. Faster than the kick's on purpose: a kick is a move you are WATCHING
    // happen and its widening is part of the shot, where a hit is a single frame of contact and a
    // punch that outlasted it would read as the camera drifting.
    if (this.fovPunch) {
      this.fovPunch *= Math.max(0, 1 - dt * 7.5);
      if (Math.abs(this.fovPunch) < 0.002) this.fovPunch = 0;
    }
    if (this.fxRoll) {
      this.fxRoll *= Math.max(0, 1 - dt * 5.5);
      if (Math.abs(this.fxRoll) < 0.001) this.fxRoll = 0;
    }
    if (this.fxPull) {
      this.fxPull *= Math.max(0, 1 - dt * 5.2);
      if (Math.abs(this.fxPull) < 0.004) this.fxPull = 0;
    }
    // ...and the MOVE CAMERA's own, which is a WANT rather than a value (see `setMovePull`): it
    // eases toward whatever the last frame asked for, so the shot closes in as the move commits and
    // opens up as it releases without the caller having to author the ramp.
    if (this.movePull !== this.movePullWant) {
      this.movePull += (this.movePullWant - this.movePull) * Math.min(1, dt * MOVE_CAM_RATE);
      if (Math.abs(this.movePullWant - this.movePull) < 0.004) this.movePull = this.movePullWant;
    }
    // ...and its SWING (see `setMoveOrbit`), eased on its own clock because a shot that swings and
    // closes at the same rate reads as one lazy arc instead of the camera turning and then moving in.
    // First person takes none of it: there the camera IS the head, and a yaw laid on the eye would
    // spin the player's own view off his aim. Reading it as a target of zero rather than skipping the
    // ease means toggling V mid-move unwinds the swing instead of snapping it away.
    const oWant = this.firstPerson ? 0 : this.moveOrbitWant;
    if (this.moveOrbit !== oWant) {
      this.moveOrbit += (oWant - this.moveOrbit) * Math.min(1, dt * MOVE_ORBIT_RATE);
      if (Math.abs(oWant - this.moveOrbit) < 0.004) this.moveOrbit = oWant;
    }
    // ...and the frame's centre and lift (see `setMoveAnchor` / `setMoveRise`), on the same clock and
    // with the same first-person guard: there the camera is the head, and an offset from it is a view
    // glued into whatever the move is happening against.
    const axw = this.firstPerson ? 0 : this.moveAnchorWant.x;
    const ayw = this.firstPerson ? 0 : this.moveAnchorWant.y;
    const azw = this.firstPerson ? 0 : this.moveAnchorWant.z;
    const ka = Math.min(1, dt * MOVE_CAM_RATE);
    this.moveAnchor.x += (axw - this.moveAnchor.x) * ka;
    this.moveAnchor.y += (ayw - this.moveAnchor.y) * ka;
    this.moveAnchor.z += (azw - this.moveAnchor.z) * ka;
    if (Math.abs(axw - this.moveAnchor.x) < 0.004) this.moveAnchor.x = axw;
    if (Math.abs(ayw - this.moveAnchor.y) < 0.004) this.moveAnchor.y = ayw;
    if (Math.abs(azw - this.moveAnchor.z) < 0.004) this.moveAnchor.z = azw;
    const rWant = this.firstPerson ? 0 : this.moveRiseWant;
    if (this.moveRise !== rWant) {
      this.moveRise += (rWant - this.moveRise) * Math.min(1, dt * MOVE_CAM_RATE);
      if (Math.abs(rWant - this.moveRise) < 0.004) this.moveRise = rWant;
    }
  }

  // A LANDED BLOW, felt through the lens (see the note in the constructor). `amount` is the share
  // of the full punch, and it is NEGATIVE for a punch-in (a tighter lens, the thing getting bigger
  // where it was hit) and positive for a pull-back, which is what a heavy move that MISSES the camera
  // by a hair wants. It stacks, so a chain of hits keeps landing on itself, and it is capped so four
  // M1s in a second cannot end up looking through a telescope.
  punch(amount) {
    this.fovPunch = Math.max(-1.5, Math.min(1.5, this.fovPunch + amount));
  }

  // ...and the same blow felt as a TILT: the camera banks a degree or two into the strike and comes
  // back. Deliberately tiny — a big roll on every hit is a funhouse mirror; this is the horizon
  // leaning for a moment, which is what a hard contact does to a person holding a camera.
  rollKick(amount) {
    this.fxRoll = Math.max(-0.1, Math.min(0.1, this.fxRoll + amount));
  }

  // ...and the same blow felt as the camera being TAKEN IN (see `fxPull`). NEGATIVE is in toward
  // the body (the contact grows), POSITIVE is out (the frame widens, which is what a vault asks for:
  // the obstacle the body is crossing has to fit on screen), and it is capped at under two metres
  // either way so a chain of hits cannot end up inside the player's own head.
  pull(amount) {
    this.fxPull = Math.max(-1.8, Math.min(1.6, this.fxPull + amount));
  }

  // ...and THE MOVE CAMERA (see the note in the constructor). `d` is a distance offset the caller
  // sets EVERY FRAME the move is live (negative is in toward the pair) and stops setting when it is
  // not — the rig eases to it, so the caller only has to say what the shot should be WHILE the move
  // runs, and the closing and opening are the rig's own. Setting it every frame is deliberate: a
  // move that is cancelled or interrupted stops asking and the shot opens back up on its own.
  setMovePull(d) {
    this.movePullWant = Math.max(-4.5, Math.min(3.0, d || 0));
  }

  // ...and THE MOVE CAMERA's SWING (see the note in the constructor). `radians` is a YAW the caller
  // sets every frame the move is live, like `setMovePull` — negative swings the shot one way round
  // the player, positive the other — and it is clamped short of a right angle so the picture never
  // ends up looking straight down the player's own flank (at 90° the body is a paper cut-out and the
  // ground runs away underneath). Read only by `aimYaw()`, so steering is untouched by it.
  setMoveOrbit(radians) {
    this.moveOrbitWant = Math.max(-1.75, Math.min(1.75, radians || 0));
  }

  // ...and THE MOVE FRAME's centre (see the note in the constructor): a world-space offset from the
  // player's chest that the whole shot is built around — position AND sight line — so a move with two
  // bodies in it can put the frame BETWEEN them instead of on the player's own back. Like
  // `setMovePull` it is a WANT the caller sets every frame the move is live, and the rig eases to it,
  // so the frame drifts onto the pair as the move commits and drifts back as it lets go.
  setMoveAnchor(x, y, z) {
    this.moveAnchorWant.set(x || 0, y || 0, z || 0);
  }

  // ...and the height its eye is LIFTED to, in world units, with the frame's centre left where it is
  // — which is the whole difference between a shot raised to look down at a move (this) and a shot
  // raised to look at the sky over it (a rise on `moveAnchor`, which moves the aim with the eye).
  setMoveRise(h) {
    this.moveRiseWant = Math.max(-1.5, Math.min(4.0, h || 0));
  }

  // SHIFT LOCK (ALT — see `P.LOCK_*`). Turning it ON also arms the SWING: the camera comes onto
  // the body's own line over `P.LOCK_CAM_TURN`, which is the user's *"it turns instantly but dont
  // make it very instant just make it extremly fast for smooth ness"*. It is a one-shot rather than
  // a permanent pull, because while the lock is on it is the BODY that follows the camera — a
  // camera that also chased the body would drag the aim back every time the mouse moved.
  setShiftLock(on) {
    const want = !!on;
    if (want === this.shiftLock) return;
    this.shiftLock = want;
    if (want) this.lockSwing = 1;
  }

  // The distance the lock rides. Its default is the tuned reading distance `P.LOCK_DIST` — or the
  // free camera's own `baseDist` when that is already nearer, since a player who keeps the chase
  // camera tucked in doesn't want the lock to push the picture back out.
  lockDistance() {
    return this.lockDist === null ? Math.min(this.baseDist, P.LOCK_DIST) : this.lockDist;
  }

  // The distance the wheel is zooming right now — the lock's while the lock is on, the free
  // camera's otherwise. What the CAMERA DIST slider reads and writes.
  activeDistance() {
    return this.shiftLock ? this.lockDistance() : this.baseDist;
  }

  setActiveDistance(v) {
    const d = Math.max(this.minDist, Math.min(this.maxDist, v));
    if (this.shiftLock) this.lockDist = d;
    else this.baseDist = d;
  }

  // The wheel (and the CAMERA DIST slider) zooms whichever distance is in play: the lock's while
  // the lock is on (`this.lockDist`, which the lock's dolly then blends onto), the free camera's
  // otherwise. Separate values on purpose — zooming in the lock must not leave the free chase
  // camera somewhere the player never put it.
  zoomBy(delta) {
    const locked = this.shiftLock;
    const from = locked ? this.lockDistance() : this.baseDist;
    const next = Math.max(this.minDist, Math.min(this.maxDist, from + delta * 0.0035));
    if (next === from) return false;
    if (locked) this.lockDist = next;
    else this.baseDist = next;
    return true;
  }

  follow(dt, speed) {
    const p = this.player;
    const fp = this.firstPerson;
    // ---- SHIFT LOCK (see `setShiftLock` and `P.LOCK_*`) ----
    // The camerawork's own half of the lock: the look fades on `P.LOCK_BLEND` (the same clock the
    // body's bank rides, so the two halves can never disagree) and the SWING onto the body's line
    // is spent here, on the aim's own yaw — which is what `moveYaw()` hands the player, so the two
    // close on each other instead of the picture lagging the body.
    this.lockBlend += ((this.shiftLock ? 1 : 0) - this.lockBlend) * Math.min(1, dt / P.LOCK_BLEND);
    if (this.lockSwing > 0) {
      const diff = Math.atan2(Math.sin(p.facing + Math.PI - this.yaw), Math.cos(p.facing + Math.PI - this.yaw));
      this.yaw += diff * Math.min(1, dt * P.LOCK_CAM_TURN);
      if (Math.abs(diff) < 0.02) this.lockSwing = 0;
    }
    // ---- FIRST PERSON'S OTHER HALF (see `FP_BODY_AIM`) ----
    // The body turns onto the look (the `firstPerson` branch of `player.js`'s facing chain), which
    // is right for everything the PLAYER aims. Where a MOVE owns the aim it is the other way round:
    // the look comes round onto the body, or the player rides a vault or a launch staring out of
    // the side of his own head. Slow enough to read as being carried.
    if (fp && (FP_BODY_AIM[p.state] === 1 || p.climbing || p.wallSliding || p.wallRunning)) {
      const diff = Math.atan2(Math.sin(p.facing + Math.PI - this.yaw), Math.cos(p.facing + Math.PI - this.yaw));
      this.yaw += diff * Math.min(1, dt * FP_BODY_FOLLOW);
    }
    // The head bone. Its world position is the base of the skull, with the body's whole transform
    // already in it (facing, the dive's pitch, a tumble's orbit), which is what makes the
    // first-person eye follow the body for free.
    const ud = p.charMesh && p.charMesh.userData;
    const head = ud && ud.bones ? ud.bones.head : null;
    const hips = ud && ud.bones ? ud.bones.hips : null;

    // The anchor: the character's chest in third person (0.62 above the box centre at CHAR_SCALE
    // 1, so it scales with the body), the EYE in first person.
    //
    // The eye is the head bone, sat down at the face (the bone is the base of the skull) and lifted
    // a hair out of it. It used to be lifted clear of the skull and then pulled back HORIZONTALLY
    // over the body's axis to keep the chest below it — which is exactly why looking down showed
    // the flat top of the torso as a slab at the bottom of the frame: the eye was above the
    // shoulders, looking down onto them. At the face the shoulders are BEHIND the eye, so looking
    // down shows the chest and its emblem, and the run's own lean carries the eye with the body.
    if (fp && head) {
      head.getWorldPosition(this._eye);
      this.anchor.copy(this._eye);
      if (hips) {
        hips.getWorldPosition(this._hipW);
        this.anchor.x += (this._hipW.x - this._eye.x) * this.fp.eyeCenter;
        this.anchor.z += (this._hipW.z - this._eye.z) * this.fp.eyeCenter;
      }
      // ...and those two offsets are the BODY's, not the world's. `eyeUp` is 0.24 along the body's
      // own up and `eyeFwd` 0.24 out of its own face — written in world axes they are the upright
      // pose's offsets and nothing else, and a body that is TUMBLING (the double jump, the wall
      // kick, the backdash) turns them into a pair of arrows pointing straight into its own chest:
      // at the top of a flip the world's "up" is the body's "down", so the eye was pushed 0.24 u
      // toward the hips it is orbiting, and the user's *"i took this image while im in first person
      // mode"* was the inside of his own torso. Measured on the live page mid-double-jump: the eye
      // sat **0.28 u** from the hip bone, i.e. inside it, against 0.95 u standing. The fix is to
      // take the body's own frame — `inner` carries the facing AND the whole tumble (`rotation.x`
      // is the flip) — and rotate the offsets into it, so the eye stays pinned to the head's own
      // face whatever the body is doing and the flip itself is still read off the world going over
      // (see the `bodySpin` term in the pitch above).
      if (p.inner) {
        p.inner.updateWorldMatrix(true, false);
        p.inner.getWorldQuaternion(this._fq);
        this._off.set(0, this.fp.eyeUp, this.fp.eyeFwd).applyQuaternion(this._fq);
        this.anchor.add(this._off);
      } else {
        const fs = Math.sin(p.facing);
        const fc = Math.cos(p.facing);
        this.anchor.x += fs * this.fp.eyeFwd;
        this.anchor.z += fc * this.fp.eyeFwd;
        this.anchor.y += this.fp.eyeUp;
      }
    } else {
      this.anchor.set(p.pos.x, p.pos.y + 0.62 * P.CHAR_SCALE, p.pos.z);
    }
    // ...and the MOVE FRAME's own centre (see `setMoveAnchor`), added to the FOLLOW TARGET rather
    // than to the smoothed result: the follow is a lerp toward this point, so an offset added
    // afterwards would be re-lerped away every frame and settle at `offset / (dt * rate)` times its
    // own size — a clinch camera that meant to lean half a metre onto the pair ended up standing
    // through the wall. Added here, the follow carries the frame onto the pair for real, and the one
    // easing the shot has is the caller's own.
    if (!fp) {
      this.anchor.x += this.moveAnchor.x;
      this.anchor.y += this.moveAnchor.y;
      this.anchor.z += this.moveAnchor.z;
      // ...and THE KNOCK-DOWN's own drop (see `SCISSOR_MISS_CAM_DROP`): while the player is down on
      // the deck the chest anchor above is a metre and a half over the body it is meant to frame, so
      // the shot comes down with him — written by the miss on its own eased clock, and zero for
      // every other state in the game. Third person only: in FIRST person the anchor is the head
      // bone itself, which is already down there with him.
      this.anchor.y -= p.camDrop || 0;
    }
    // The follow is instantaneous in first person — the head's position is already smooth, and a
    // lag would leave the camera behind its own body — EXCEPT while the body is tumbling, when the
    // head is swinging round the hips and a soft follow is what turns that orbit into the wobble a
    // somersault has instead of a whip. Switching modes snaps, so toggling V cannot swoop.
    const tumbling = Math.abs(p.bodySpin || 0) > 0.02;
    const lf = Math.min(1, dt * (fp ? (tumbling ? this.fp.tumbleFollow : 240) : 18));
    if (fp !== this._wasFp) {
      this.smoothAnchor.copy(this.anchor);
      this._wasFp = fp;
      // ...and the look is brought back inside THIS mode's own range (see `aim` / `FP_PITCH_MAX`),
      // so leaving first person can never start the chase camera above its own limit.
      const lim = fp ? FP_PITCH_MAX : 1.32;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    }
    this.smoothAnchor.lerp(this.anchor, lf);
    if (this.smoothAnchor.lengthSq() === 0) this.smoothAnchor.copy(this.anchor);

    // ---- the kick's sweep ----
    // Advance the clock, then read everything off one progress value: the yaw the picture is
    // still owed (a smoothstep, so the sweep settles rather than stopping dead) and the bell for
    // the shot's own framing. Both are exactly 0/full at `k = 0`, so the kick's first frame is
    // the frame before it as far as the camera is concerned — no jump, however big the turn.
    if (this.cineT < this.cineDur) this.cineT = Math.min(this.cineDur, this.cineT + dt);
    const ck = this.cineDur > 0 ? Math.min(1, this.cineT / this.cineDur) : 1;
    const ce = ck * ck * (3 - 2 * ck);
    this.cineCur = this.cineFrom * (1 - ce);
    this.cineAmt = ck > 0 && ck < 1 ? Math.sin(Math.PI * ck) : 0;

    const yaw = this.aimYaw();
    // The aim's own pitch, clamped for the third-person camera — and in FIRST PERSON plus the
    // body's tumble (`p.bodySpin`: the flips' spin — the double jump, the wall kick, the backdash),
    // which is the only way a somersault reads from inside the head. Nothing is clamped in first person:
    // the view vectors are built from sin/cos, so a whole revolution lands back where it started.
    //
    // IT IS MINUS. `p.bodySpin` is the rotation written onto the BODY's own X (`player.js`'s
    // `inner.rotation.x`), and the body's forward comes out of that as `(0, -sin, cos)` — so the
    // view only rides the body when the pitch takes the NEGATIVE of it. Added, the two ran at
    // opposite signs and the picture counter-rotated against the body: measured mid-double-jump,
    // the angle between the body's own forward and the camera's went **0.97 → −0.68 → −0.10 → 0.95 →
    // −0.42 → −0.97** over one flip, i.e. the body appeared to turn at twice the world's rate, and
    // at the quarter-turns it was pointing straight at the camera. Nobody could see it while the
    // eye was buried in the torso (see the anchor below); with the eye out on the face it is the
    // whole of what made a flip unreadable.
    // ...and NO CAMERA FLIP (see `settings.noCamFlip`): the user's *"stop the screen from fliping
    // with the double jump flip"*. It simply takes the tumble term out, so the view keeps the aim's
    // own pitch and the horizon stays upright through a somersault — the flip then reads as nothing
    // from inside the head, which is exactly what is being asked for.
    const spin = settings.noCamFlip ? 0 : (p.bodySpin || 0);
    const aimPitch = fp
      ? this.pitch - spin
      : Math.max(-1.32, Math.min(1.32, this.pitch + KICK_CINE_PITCH * this.cineAmt));
    const cp = Math.cos(aimPitch);
    this._fwd.set(-Math.sin(yaw) * cp, Math.sin(aimPitch), -Math.cos(yaw) * cp);
    this._right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    // ---- the walk, in first person only ------------------------------------------------
    // The model's run cycle is all limbs, so the walk gets its own motion here: a dip per
    // footfall and a sway per stride (scaled by the speed actually carried, so a walk barely
    // stirs), the standing breath, and the landing's absorb felt rather than seen.
    if (fp) {
      const run01 = Math.min(1, speed / P.SPRINT);
      const rb = (p.runBlend || 0) * run01;
      const ph = (p.runPhase || 0) * Math.PI * 2;
      const breath = p.grounded ? Math.sin(p.idleTime * 1.9) * (1 - (p.runBlend || 0)) : 0;
      this.bobY = -Math.abs(Math.sin(ph)) * this.fp.bobUp * rb + breath * this.fp.breath;
      this.bobY -= (p.landPose || 0) * Math.min(1, p.landImpact || 0) * this.fp.landDip;
      this.bobX = Math.cos(ph) * this.fp.bobSide * rb;
      this.bobRoll = Math.cos(ph) * this.fp.bobRoll * rb;
    } else {
      this.bobY = 0;
      this.bobX = 0;
      this.bobRoll = 0;
    }

    // ...and the lock's own look: nearer in, and further over the shoulder, so the body reads at a
    // glance and the crosshair sits clear of it (see `P.LOCK_DIST` / `P.LOCK_SHOULDER`).
    const lockD = this.lockBlend;
    // `movePull` is the MOVE CAMERA's share (see `setMovePull`) and it is added in here rather than
    // with `fxPull` below because it is a FRAMING, not a blow: it belongs with the distance the shot
    // is set at, and it is clamped and floor-guarded with the rest of it.
    const lockBase = this.baseDist + (this.lockDistance() - this.baseDist) * lockD + this.movePull;
    // The pull rides ON TOP of the lock's own distance and is clamped back into the camera's real
    // range: a hit takes the picture in, a vault pushes it out, and neither may put the chase camera
    // inside the body or out past its own maximum.
    const pullDist = Math.max(this.minDist * 0.78, Math.min(this.maxDist + 1.2, lockBase + this.fxPull));
    const lockTarget = fp ? 0 : pullDist + KICK_CINE_PULL * this.cineAmt;
    const shoulder = 0.25 + (P.LOCK_SHOULDER - 0.25) * lockD;
    if (fp) {
      this.camera.position.copy(this.smoothAnchor);
      this.camera.position.y += this.bobY;
      this.camera.position.x += this._right.x * this.bobX;
      this.camera.position.z += this._right.z * this.bobX;
    } else {
      const wantX = this.smoothAnchor.x - this._fwd.x * lockTarget + this._right.x * shoulder;
      const wantY = this.smoothAnchor.y - this._fwd.y * lockTarget + 0.12;
      const wantZ = this.smoothAnchor.z - this._fwd.z * lockTarget + this._right.z * shoulder;
      const dx = wantX - this.smoothAnchor.x;
      const dy = wantY - this.smoothAnchor.y;
      const dz = wantZ - this.smoothAnchor.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      const hit = this.world.raycast(
        this.smoothAnchor.x,
        this.smoothAnchor.y,
        this.smoothAnchor.z,
        dx / len,
        dy / len,
        dz / len,
        len + 0.4
      );
      let allowed = lockTarget;
      // Keep the pull-in out of the body: the floor scales with the character and the margin is
      // the body's own half-extent.
      if (hit && hit.t < len + 0.4) allowed = Math.max(1.1 * P.CHAR_SCALE, hit.t - P.HY);
      this.wantDist = allowed;
      const rate = allowed < this.dist ? 40 : 7;
      this.dist += (this.wantDist - this.dist) * Math.min(1, dt * rate);
      this.camera.position.set(
        this.smoothAnchor.x - this._fwd.x * this.dist + this._right.x * shoulder,
        this.smoothAnchor.y - this._fwd.y * this.dist + 0.12,
        this.smoothAnchor.z - this._fwd.z * this.dist + this._right.z * shoulder
      );
      // ...and the move frame's own LIFT (see `setMoveRise`): the eye goes up off the line while the
      // frame's centre stays where it is, which is what turns a move into a shot looking DOWN at it —
      // the one angle a pair of clinched bodies reads from over each other's shoulders.
      this.camera.position.y += this.moveRise;
      // THE DECK GETS THE LAST WORD. The pull-in above raycasts the world's COLLIDERS, and the
      // ground has never been one (`World.terrainHeight` is the floor, not a box) — which was free
      // while every map was a flat plane at 0 and is not any more: the hills put real ground up
      // where the camera's own line is whenever the body turns down a slope, and a shot that was
      // merely low over the old flat deck would be inside a hill. The floor is read at the CAMERA's
      // own spot rather than at the player's, and the old constant `0.3` becomes "0.3 above the
      // ground here", which is the same number in the field and the maze (their ground is 0) and
      // the right one in the hills. Two field evaluations, once per frame.
      const gy = this.world && this.world.terrainHeight ? this.world.terrainHeight(this.camera.position.x, this.camera.position.z) : 0;
      if (this.camera.position.y < gy + 0.3) this.camera.position.y = gy + 0.3;
    }

    let strafe = (p.vel.x * this._right.x + p.vel.z * this._right.z) / Math.max(2, speed);
    if (p.state === "slide") strafe *= 0.4;
    // Lean the view with a wall you're riding so the wall-run reads on screen. The body banks
    // harder than this on purpose (see `player.lean`): the character carries the wall run, the
    // camera just agrees with it about which side is low. First person keeps MORE of it (and the
    // run's own roll), because from inside the body that bank is the whole read of the move.
    let wallLean = 0;
    if ((p.wallSliding || p.climbing || p.wallRunning) && p.wall) {
      const amt = p.wallRunning ? 0.14 : 0.05;
      wallLean = (p.wall.nx * this._right.x + p.wall.nz * this._right.z) * amt;
    }
    const targetRoll =
      (-strafe * 0.025 + (p.climbing ? 0.03 * Math.sign(this._fwd.x || 1) : 0) - wallLean) *
        (fp ? this.fp.rollGain : 1) +
      this.bobRoll +
      this.fxRoll;
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);

    // ---- point it ----
    if (fp) {
      // Built from the yaw frame rather than with `lookAt`, because `lookAt` needs an up vector
      // and a somersault passes straight through vertical — where there is no up, and where
      // `lookAt` returns NaN. A yaw frame tilted about its own right axis and then rolled about
      // the view line is defined at every angle, and off the roll it is the same tube the
      // third-person view rides.
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      const hx = -sy;
      const hz = -cy;
      const cpp = Math.cos(aimPitch);
      const spp = Math.sin(aimPitch);
      // ...and the roll goes the OTHER way round here, because the two halves turn the camera about
      // opposite ends of its own view line: the third-person path below hands `rotateZ` the roll,
      // and `rotateZ` turns the camera about its local +Z, which points BACK at the viewer — while
      // this branch tips the `up` vector about the forward line (Rodrigues: `up` rotated about
      // `fwd` by θ is `up·cosθ + (fwd × up)·sinθ`, which is what the `cr`/`sr` pair below is). Same
      // rotation, opposite handedness, so the sign has to flip or first person banks against the
      // body it is standing in. Measured on the live rig with the wall forced to the runner's right
      // (yaw 0, wall normal −x): third person rolled the horizon **+8.0°** and first person rolled
      // it **−23.0°** — the opposite way, and harder, because first person keeps `rollGain` (3.2)
      // of it on purpose (see `targetRoll`). This is the user's *"when im in first person and i
      // wall run the camera titls the wrong way"*.
      const cr = Math.cos(-this.roll);
      const sr = Math.sin(-this.roll);
      this.camera.up.set(
        -hx * spp * cr + cy * sr,
        cpp * cr,
        -hz * spp * cr - sy * sr
      );
      const c = this.camera.position;
      this.camera.lookAt(c.x + hx * cpp, c.y + spp, c.z + hz * cpp);
    } else {
      const la = this.smoothAnchor;
      this.camera.up.set(0, 1, 0);
      // The sight line runs eight units ahead of the frame's centre so the pitch rides the aim rather
      // than the anchor's own jitter — but a MOVE FRAME (see `setMoveRise`) lifts the eye off that
      // line, and a lead of eight units would then leave the shot pointing over the pair's heads at
      // the sky. Lifted, the shot looks straight AT its own centre, which is what turns the lift into
      // a downward angle on the move instead of a view that drifts off the top of the frame.
      const lead = this.moveRise > 0.05 ? 0 : 8;
      this.camera.lookAt(la.x + this._fwd.x * lead, la.y + this._fwd.y * lead, la.z + this._fwd.z * lead);
    }

    let shakeAmt = this.shake;
    this.shake *= Math.max(0, 1 - dt * 5);
    if (shakeAmt > 0.001) {
      const s = shakeAmt * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }

    if (!fp) this.camera.rotateZ(this.roll);

    const speedT = Math.min(1, Math.max(0, (speed - P.SPRINT) / 14));
    const targetFov =
      this.baseFov +
      (fp ? this.fp.fov : 0) +
      speedT * 13 +
      (p.state === "dive" ? 8 : 0) +
      this.fovKick * 11 +
      this.fovPunch * 9;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 5);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // The body is never hidden any more: first person is played from INSIDE it, so the only part
    // that comes off is the head — the one piece that would fill the screen. Everything else
    // stays, which is the whole point of the mode: look down and the arms and legs are there,
    // mid-stride or mid-tumble, because they are the same rig the action poses drive. The
    // placeholder cube (there before the model loads, and the fallback if it fails) still has to
    // go, since it has no head to take off.
    //
    // ...EXCEPT WHEN THE BODY IS THE SCREEN. A pose can bring a limb right through the eye — the
    // user's *"i took this image while im in first person mode"* — and the whole rig goes for as
    // long as that lasts. It is measured rather than guessed, off the same rig the poses drive: the
    // eye's distance to the four DISTAL limb segments (forearm→hand and shin→foot, the parts that
    // can actually arrive at a face), sampled per frame through the real move set. Standing,
    // running, a jump, the double jump, the dive: **never under 0.81 u**. The kip-up's leg whip
    // (skill 3) comes to **0.06**. So the hide is 0.40 u with the return at 0.52 (hysteresis, so a
    // limb sitting on the line cannot blink), and nothing that is not genuinely in the eye's face
    // is ever taken away — it is the rig's own geometry that decides, so a new pose cannot forget
    // to opt in.
    if (head) head.visible = !fp;
    p.mesh.visible = !p.charMesh && !fp;
    if (p.charMesh) {
      if (!fp) {
        this.bodyHide = false;
      } else {
        const near = this.nearestLimb(p, this.camera.position);
        if (near < FP_BODY_NEAR_HIDE) this.bodyHide = true;
        else if (near > FP_BODY_NEAR_SHOW) this.bodyHide = false;
      }
      p.charMesh.visible = !this.bodyHide;
    }
  }

  // How close the eye is to the nearest of the body's four DISTAL limb segments (see the note in
  // `follow`). Cheap on purpose — eight bone positions and four point-to-segment tests, and the
  // bones are where the pose has already put them, so this cannot disagree with what is drawn.
  nearestLimb(p, eye) {
    const ud = p.charMesh && p.charMesh.userData;
    const bones = ud && ud.bones;
    if (!bones) return Infinity;
    let best = Infinity;
    for (const [a, b] of FP_LIMBS) {
      const A = bones[a], B = bones[b];
      if (!A || !B) continue;
      A.getWorldPosition(this._segA);
      B.getWorldPosition(this._segB);
      const abx = this._segB.x - this._segA.x;
      const aby = this._segB.y - this._segA.y;
      const abz = this._segB.z - this._segA.z;
      const apx = eye.x - this._segA.x;
      const apy = eye.y - this._segA.y;
      const apz = eye.z - this._segA.z;
      const len2 = abx * abx + aby * aby + abz * abz;
      const t = len2 > 1e-6 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / len2)) : 0;
      const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best) best = d;
    }
    return best;
  }
}
