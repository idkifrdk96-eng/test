// Part 25 of the `player.js` split: the pose-fade durations and the pose scratch vectors.
//
// These are the module-scope `const`s that used to sit at the top of `player.js`, between the
// import block and `export class Player`. Every one of them is read by the rig-posing code: the
// cross-fade time each state's pose owns (see `updateVisual`), the idle's per-boot deck-sampling
// clamps (see `poseIdle`), the threshold the falling flurry uses to admit its deck has gone, and
// the scratch vectors (tilt / clinch / capo) the poses borrow for a frame.
//
// They live here rather than in `config.js` because `config.js` is the tuning table the whole game
// reads, while these are private to the player's posing. They are EXPORTED so that slices of
// `updateVisual` can be carved out later and import exactly the fades they use.
import * as THREE from "../three.js";

// Run cycle timing. The legs are driven by how fast you are actually travelling
// (so they never look like they are skating) but never allowed to cycle faster
// than RUN_PERIOD_MIN, which is where a stride stops reading as legs and starts
// reading as a blur. The cycle fades in and out on a timer rather than snapping,
// so starting and stopping eases.
export const RUN_PERIOD_MIN = 0.30; // seconds — the fastest the legs may cycle
export const RUN_FADE_IN = 0.34;    // seconds to blend the run cycle in
export const RUN_FADE_OUT = 0.46;   // and to blend it back out
export const SLIDE_POSE_FADE = 0.20; // seconds to blend the slide pose in (and back out)
// The dive's own forward lean, on top of the whole-body pitch `player.js` already gives the
// state: a dive leans further over the faster it is going, so the body's angle is the speed.
// Both terms are radians of `inner.rotation.x`, measured with `t` (the entry ramp) still on.
export const DIVE_LEAN_BASE = 1.15;  // the lean the moment the dive starts
export const DIVE_LEAN_SPEED = 0.45; // ...plus this much at `DIVE_MAX`
export const IDLE_POSE_FADE = 0.28;  // seconds to blend the resting idle in (and back out)
// THE IDLE'S FEET — the one thing in the game that asks the WORLD where the body is standing, per leg.
//
// The idle is the only state where the legs are not being placed by a move, so it is the only state
// that can afford to look: each boot is sampled for the deck under it and its leg is then SOLVED down
// onto whatever it found (see `poseIdle`). Standing with one boot on a step therefore bends that knee
// and leaves the other leg long, and standing on the lip of a block drops the hanging boot over the
// edge — instead of both legs locked straight with one boot buried in the step. That sameness is what
// it is for: without it a body on uneven ground reads as a model parked on the terrain rather than a
// man standing on it.
//
// The sample is taken with a reach up AND down from the boot, so it finds the deck whether the foot is
// about to step up or has been hanging; and the answer is EASED rather than used raw, because a boot
// sitting exactly on an edge would otherwise pick the high deck on one frame and the low one on the
// next and buzz.
//
// The answer is a WORLD distance and the pose authors in the rig's own units, so it is divided by the
// rig's scale on the way in (`poseIdle` never sees a world number). That division is not cosmetic:
// measured on the live rig at a scale of `1.351`, a boot handed a raw world offset of 0.2 swung its
// sole 0.267 instead of 0.2 — the mismatched unit read as a 35% exaggeration of every step, which is
// exactly the kind of thing that looks like a bug in the leg rather than a step in the ground.
//
// `HI`/`LO` are the clamps, in world units. `HI` is the guard, not a working number: the body's
// collision box is 1.2 wide (`P.HX`) and the boots stand only ±0.2 from the middle, so any deck under
// a boot is under the body too — the support height the body is standing on is already the HIGHEST
// thing in that box, and a boot can therefore only ever be over a deck the same height or lower. It is
// there for the frames where the idle is still blending in and the foot is somewhere a move put it.
// `LO` is past the point of usefulness on purpose: the leg can only reach about 0.12 below the body's
// deck however far the pelvis sinks (see `IDLE.stepDrop`), so asking for more than that just pins the
// leg straight and holds the pelvis down, which is what a boot hanging over a drop should do.
export const IDLE_FOOT_UP = 0.35;    // how far above the boot to start looking for a deck
export const IDLE_FOOT_DOWN = 0.60;  // ...and how far below it to give up
export const IDLE_FOOT_HI = 0.35;    // the most a boot may be lifted onto a step, in world units
export const IDLE_FOOT_LO = -0.60;   // ...and the most it may hang off one
export const IDLE_FOOT_FADE = 0.12;  // seconds for a boot to settle onto the deck it just found
export const IDLE_FOOT_TMP = new THREE.Vector3();
// Action-pose fades. Every state that used to be expressed only as a squash/pitch on the
// whole body now owns a rig pose as well, and each needs its own cross-fade timer so a state
// change eases instead of snapping.
export const CROUCH_POSE_FADE = 0.24;
export const AIR_POSE_FADE = 0.16;
export const DIVE_POSE_FADE = 0.18;
export const SLAM_POSE_FADE = 0.10;
export const DASH_POSE_FADE = 0.06;   // a step is the snappiest shape in the game — it has 0.34 s to be one
export const MANTLE_POSE_FADE = 0.14;
// THE TOTE — the duffel in both hands (see `poseTote` in streetwear.js, and the `tote*` fields
// below). It is a LAYER over whatever state the body is in, not a state of its own: the legs keep
// running (or sliding, or hanging) and only the arms are taken. `0.10` is quick, because the bag
// has to be in the arms on the frame the hands close on it.
export const TOTE_POSE_FADE = 0.10;
// ...and THE BALL ACTIONS' own layer fade (session 180 — see `poseBallAction` in streetwear.js): the
// shoot and the throw. It is QUICK, because a strike has to be the man on the frame he presses it —
// and the shapes' own first keys sit close enough to the run that a hundredth of a second of blend
// reads as a step into the move rather than as a cut.
export const BALL_POSE_FADE = 0.08;
export const VAULT_POSE_FADE = 0.06;  // the plant is the FIRST frame of a vault — there is no wind-up
export const VAULT_POSE_FADE_OUT = 0.16; // ...but it LEAVES through the run rather than out of it: the shape
                                  // the crossing ended in dissolves into the stride instead of
                                  // snapping off on the frame the state ends (see `updateVisual`)
export const LEDGE_POSE_FADE = 0.10;  // the hang comes on fast — it is over in LEDGE_HANG
export const WALL_POSE_FADE = 0.18;
export const LAUNCH_POSE_FADE = 0.14; // the pad's soar comes on fast — it is a moment, not a pose
export const WALL_BANK_FADE = 0.14;  // how fast the wall run's hip-pivot bank comes on and off
export const FALL_POSE_FADE = 0.30;  // the skyfall's shape eases in over the jump it grew out of
export const FALL_BRACE_FADE = 0.10;// ...and the landing brace eases so it cannot pop on
export const LAND_POSE_FADE = 0.12;  // how fast the landing absorb comes on
export const LAND_POSE_TIME = 0.34;  // ...and how long it takes to unwind
export const HAMMER_POSE_FADE = 0.09; // the hammer's shape comes on fast — it IS the landing
// How fast a falling body has to be going before the flurry admits its deck is gone (see the
// plunge check in `update`). It has one job: tell a body that is being CARRIED DOWN by the deck it
// broke (`g·dt²` a frame into the floor, and the couple of millimetres a high framerate spreads that
// settle over) from one that is in free fall. A planted body never reaches it at any framerate the
// game runs at — measured 0.14 u/s at 240 fps, 0.55 at 60 — while a deck that has actually gone
// passes it inside two or three frames.
export const SMASH_PLUNGE_V = 2.0;
// THE BLOCK's own two fades (see `poseBlock`): the pose itself, and the GUARD→CHARGE slide inside
// it. The second is the slower of the two on purpose — the guard opening into the charge is a body
// lowering its shoulder and starting to run, and it should be seen happening.
export const GUARD_POSE_FADE = 0.18;
export const GUARD_RUSH_FADE = 0.16;
// The three skills' shapes (see `whirl` / `scissor` / `capoeira`). Each comes on FAST — all three
// are decisions rather than transitions, and two of them are answered by a contact (a neck, a
// deck) that has to be where the pose says it is by the time the move's clock gets there.
export const SKILL_POSE_FADE = 0.07;

// THE SKATEBOARD's own three (session 200 — see `poseRide` / `poseBSlide` / `poseBBomb`). The RIDE
// comes on over a step-off's worth of time (it is a mode, and the first frame of it is the only place
// a mount could pop), and the two mechanics come on much faster: a powerslide and a bomb are both
// decisions with a beat, not transitions. The ride's own fade is ALSO the ramp the body is lifted by
// (see `boardLift`), so a dismount puts the feet back on the road over the same handful of frames the
// shape does.
export const BOARD_POSE_FADE = 0.16;
export const BSLIDE_POSE_FADE = 0.10;
export const BBOMB_POSE_FADE = 0.12;

// THE SLOPE's own scratch (see `Player.tiltG`): the rotation that lies the man onto the deck, and
// the foot-point it is turned about — a roll about the body's own centre swings the feet off the
// ground, so the layer's origin is corrected by `p - R·p` (the same trick the wall bank's hip pivot
// uses, one axis over).
export const _tiltM = new THREE.Matrix4();
export const _tiltE = new THREE.Euler();
export const _tiltFoot = new THREE.Vector3();
export const _tiltOut = new THREE.Vector3();
// The clinch's live hand target: the held body's head, walked into the player's own frame (see
// `setClinchHead` in streetwear.js and the 2nd M1 in `updateVisual`).
export const _clinchV = new THREE.Vector3();
// The LAUNCH's own scratch pair (see `updateVisual`): the two SOLES the body the kick caught is
// held to, read off the rig's own foot bones on the frame's pose.
export const _capoSoleA = new THREE.Vector3();
export const _capoSoleB = new THREE.Vector3();
// ...and the point the face is actually held to (the soles, less `CAPO_CARRY_GAP`), plus where the
// head WAS when the carry took it — the two ends of the grab's own yank (see `updateVisual`).
export const _capoBoot = new THREE.Vector3();
export const _capoHead = new THREE.Vector3();

