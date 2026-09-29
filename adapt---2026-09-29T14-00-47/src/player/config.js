// ---------------------------------------------------------------------------
// THE PLAYER'S NUMBERS (part 1 of the player.js split).
//
// `player.js` had grown to ~16k lines, which made it slow to find anything in: the
// tuning data and the state machine have nothing to do with each other. This file is
// the FIRST piece to move out — every constant and the whole `P` table. It is pure
// data with no behaviour, and it is a LEAF: it imports nothing and references nothing
// defined later in the old file, so moving it is a straight copy.
//
// `player.js` imports `P` and `CHAR_SCALE` back from here and RE-EXPORTS `P`, so the
// several modules that do `import { P } from "./player.js"` (abilities, camera,
// enemies, inventory, main) keep working unchanged. If you ever clean that up, point
// them at this file directly and drop the re-export.
//
// Only `CHAR_SCALE` is read by the class directly; `BASE_HALF`/`BOX_HALF` are exported
// for completeness but are baked into `P.HX/HY/HZ` here.
// ---------------------------------------------------------------------------

// How big the character is. BASE_HALF is the size the look and feel were tuned at (a 0.9-unit cube)
// and CHAR_SCALE multiplies it into the body the game actually draws. Everything body-relative scales
// off these two — the drawn model (charmodel.js and streetwear.js fit the body to the box's height),
// the camera's anchor height (camera.js), the blob shadow's radius (main.js) and the placeholder
// cube. The collision box is NOT one of them any more (see `BOX_HALF` below). Movement numbers
// (speeds, jump heights, step height) are deliberately NOT scaled: they are world units, and the
// world does not care how big the thing running through it is.
export const BASE_HALF = 0.45;
export const CHAR_SCALE = 2;
// ...and THE BOX'S OWN PLAN, which is not the placeholder cube's and never was the body's. The
// collision box was a cube — `BASE_HALF * CHAR_SCALE` on all three axes, a 1.8-square in plan — and
// the body it carries does not come close to filling it: measured off `charMesh`'s world box on the
// idle pose, the street body is 1.17 wide, 0.63 deep and 2.44 tall. A 0.9 half-extent is therefore
// 0.32 proud of the shoulder and 0.58 proud of the chest, and both of those are things you can SEE
// (the user's *"i think the player hitbox is a bit over scaled"*): the body stops a visible step off
// every wall face it walks into, and — the worse half, because it is silent — `tryStep` (`P.STEP`
// 1.05) lifts the body onto any deck the BOX overlaps, so a ledge you are standing *beside* is a
// ledge you stand ON, hovering a boot above the pavement. So the plan is its own number now: 0.6, the
// box that hugs the body (0.02 proud of the shoulder, 0.29 of the chest) and the small square at
// every facing, because the world's colliders are axis-aligned and a box that turned with the rig
// would change the body's own width as you turned on the spot.
// The HEIGHT is deliberately left as the cube's 0.9: `pos.y - HY` is the feet everywhere in this
// file, the whole step / ledge / mantle / headroom tuning is written against it, and the drawn body
// is MEANT to stand proud of its box (see `BODY_RATIO`). Limbs leave the plan constantly — the run's
// own stride is 2.0 deep and the air pose 2.7 wide — and that is right: a box grown to hold a kick
// would be the cube again.
export const BOX_HALF = 0.6;

// RUN_STRIDE is body-relative, not world-relative: it is how far the body advances in one
// two-step cycle, which is set by how far the legs swing, so it scales with CHAR_SCALE (a
// bigger character covers more ground per stride and takes fewer of them per second). Leave it
// constant and a scaled-up body skates — the feet would sweep twice the ground the body does.
export const RUN_STRIDE = 3.1 * CHAR_SCALE; // game units travelled per full two-step cycle

export const P = {
  // Exposed so the camera and the effects can scale the few body-relative numbers that live
  // outside this file (they read `P` rather than importing the constant directly).
  CHAR_SCALE,
  // ...and the collision box's own plan, which is NOT the body's (see `BOX_HALF` above).
  BOX_HALF,
  // How tall the drawn body is (feet to the top of the skull) as a multiple of the box
  // half-height. Above 2 because the character is drawn taller than the cube it rides in —
  // the head sits proud of the collision box.
  BODY_RATIO: 2.6,
  // The plan (see `BOX_HALF`): 1.2 wide and 1.2 deep, the body's own footprint.
  HX: BOX_HALF,
  // ...and the cube's height, which the feet, the ledges and the headroom are all tuned at.
  HY: BASE_HALF * CHAR_SCALE,
  HZ: BOX_HALF,
  GRAVITY: 33,
  SPRINT: 10.9,
  RUN_MIN: 2,
  BUILD_TIME: 2.6,
  BUILD_DECAY: 0.7,
  LATERAL_GRIP: 8,
  GROUND_ACCEL: 14,
  AIR_ACCEL: 3.4,
  GROUND_FRICTION: 9.5,
  // ---- SLOPE PHYSICS (see "THE SLOPE" in README.md) ----
  // The hills is a height field now, and the body has to answer to it: it stands ON the slope it is
  // standing on (the rig lies down onto the deck's own normal), the deck holds it up to a certain
  // steepness and pulls it down past that, and — the user's own brief — *"if hes running fast he can
  // go to like the big 90 degree angel slopes and above but if hes slow he cants"*: what he can
  // CLIMB is bought with the speed he is carrying, so a walk is stopped by a flank a run goes up.
  //
  // `SLOPE_PROBE` is how far the field is sampled either side of the feet. It wants to be big enough
  // that the fbm's own fine octaves do not make the reading jitter frame to frame, and small enough
  // that a crater's rim is still a rim: 0.45 u is a third of a body's foot and about a fiftieth of
  // the noise's wavelength.
  SLOPE_PROBE: 0.45,
  // tan(theta) of the steepest deck that will HOLD a standing body — the static friction of the
  // world, and also the standing climb limit (they are one number on purpose: the deck that cannot
  // hold you cannot be walked up). 0.55 is 28.8 degrees, which is past every slope the field rolls
  // at a walk and under the flanks the run is for.
  //
  // It is a FRICTION COEFFICIENT and not only a switch, and that is the whole of "THE GRIP" (see
  // `deckGrip`): the same number that says what grade a standing body can be held on says how hard
  // the deck fights him once it CANNOT hold him. Past the hold angle the only thing the surface has
  // left is the KINETIC grip of a body already moving on it — `tan · g · cos²(theta)`, the horizontal
  // part of mu·N on a slope — and the pull it is fighting is `g · sin(theta) · cos(theta)`, so the
  // net is `g · cos(theta) · (sin(theta) − tan · cos(theta))`: zero at exactly this angle by
  // construction, growing with the grade above it, and never the wrong way round.
  SLOPE_HOLD_TAN: 0.55,
  // ...and THE ENERGY TERM: how much steeper a face he can climb per (u/s)^2 of the speed he
  // CARRIED IN. The limit is `SLOPE_HOLD_TAN + SLOPE_CLIMB_ENERGY * carry²` — climbing is bought with
  // momentum, and `carry` (see `slopeCarry`) is the speed he was going when the slope took hold of
  // him, not what he manages while on it. 0.045 was measured against the map: a body standing at the
  // foot of a face gets the 29 degrees it can already stand on and no more, a 2 u/s shuffle gets 36
  // (so the field's steeper flanks — 36 to 44 degrees — are closed to a walk), a 3 u/s jog gets 44
  // (the field's own steepest, so it opens at a trot), a 5.5 u/s run gets 62, a full 10.9 u/s sprint
  // gets 80, and 20 gets 87 — the most the height field can express at all.
  SLOPE_CLIMB_ENERGY: 0.045,
  // ...and how fast that carried speed is SPENT while he is climbing. This is the whole of "running
  // fast he can go up it, slow he cannot": a run up a flank costs its momentum at 3 u/s per second,
  // so a sprint into a 39-degree face carries him ~20 units up it and then leaves him there, while a
  // body standing at the bottom of the same face has no momentum to spend and is simply refused. The
  // carrying is what makes it a RUN-UP rather than a key.
  SLOPE_CARRY_DECAY: 3.0,
  // How much of gravity's own along-slope pull the deck actually applies (see `slopePull`). 1 is
  // the real horizontal component of g·sin(theta) and is what the whole mechanic is tuned at; it is
  // a knob rather than a constant only because a weak device's lower framerate must not change the
  // terrain, and because the value the tune settled on has to be readable in one place.
  SLOPE_PULL: 1.0,
  // How far below the feet the deck may be and still count as "still on it" (the ground STICK: a
  // body running downhill is airborne for a frame at the drop the slope makes, and without this the
  // slide ends the instant the deck falls away — the user's *"every time i slide on a slope it gets
  // cancelled instantly"*). On top of it the stick adds the drop the slope owes at the speed he is
  // carrying (`speed · dt · slopeTan`, read in `moveAndCollide`), so a sprint down a flank sticks
  // exactly as well as a walk does, and no drop this side of a step is mistaken for the ground.
  SLOPE_SNAP_BASE: 0.3,
  // Seconds the rig takes to LIE DOWN onto a slope (and to come off one). A snap would read as the
  // character being welded to the ground; this is the same fade the wall bank uses.
  SLOPE_TILT_BLEND: 0.14,

  // How hard a RUN pulls you back down to the speed the run itself wants. It is deliberately
  // TINY: coming out of a dive, a squeeze or a kick at 30 u/s and simply running should hold
  // that momentum for seconds, not bleed it off in one (the user's "make the running doesnt
  // kill momentum just very slowly kills it"). `OVERSPEED_FRICTION` is the old, much firmer
  // number and it is still what the WALL SLIDE uses — a slide down a face is a place to shed
  // speed, not a place to carry it.
  RUN_OVERSPEED_FRICTION: 0.2,
  OVERSPEED_FRICTION: 0.9,
  AIR_DRAG: 0.35,
  SLIDE_BRAKE: 1.8,
  BHOP_WINDOW: 0.16,
  BHOP_BOOST: 1.055,
  JUMP_V: 10.7,
  JUMP_SPEED_BONUS: 0.17,
  AIR_JUMPS: 1,
  AIR_JUMP_V: 9.9,
  AIR_JUMP_PUSH: 3.2,
  // How near the deck the second leap still counts as a leap FROM it. A double jump is thrown from
  // the air, so `readSlope` has already refused the deck by then (it gives up at a foot of
  // clearance) and the rise the first jump is measured against is not on hand — the branch below
  // reads the gradient under the body instead, and this is how close the deck has to be for that to
  // mean anything. It is set above a plain jump's own apex (~1.7 u at `JUMP_V` and `GRAVITY`) so
  // that any second press inside the arc of the first leap counts, and a double jump taken off some
  // high place does not get a hillside's worth of extra lift from the ground far below it.
  AIR_JUMP_DECK: 3.5,
  FLIP_TIME: 0.46,
  SLAM_V: 30,
  SLAM_FALL: 2.6,
  SLAM_MAX_V: 58,
  SLAM_TIME: 5,
  SLAM_HEIGHT_MAX: 55,
  SLAM_BOUNCE_V: 13.2,
  SLAM_LAND_SPEED: 7.5,
  SLAM_DRAG: 1.4,
  // ---- the slam's own LANDING, and the HAMMER it turns into ----
  // A slam used to arrive and stand straight back up. It now lands on BOTH FISTS and holds them
  // in the deck for `SLAM_LAND_TIME` (`poseSlamLand` in streetwear.js) — a slam is a thing the
  // body does TO the ground, and the old landing absorb (arms thrown out for balance) is the
  // shape a body makes when it is catching itself.
  SLAM_LAND_TIME: 0.42,
  SLAM_LAND_FADE: 0.07,   // s to blend the landing shape on — an impact, so it is nearly a snap
  // THE HAMMER. It is not the third slam into a spot any more: it is MANUAL, and the way in is the
  // slam's own landing beat — the fists are in the deck for `SLAM_LAND_TIME` after every slam, and
  // one more press of the slam button inside that window takes the body into the flurry instead of
  // standing it back up (see the door in `update`). Nothing in the hint line or the help grid ever
  // mentions it, which is what keeps it an easter egg rather than a move.
  HAMMER_POWER: 0.62,     // what the hammer's FIRST impact is worth (destruction + FX)
  HAMMER_POWER_RAMP: 0.5, // ...and how much heavier the last of the six is (0.93 at 6 hits)
  // THE CLOCK. One beat is a BOUNCE: a spring off the deck, a coil at the top of the hop and a
  // drive back down into it — six of them, each a shape of its own (`HAMMER_BEATS` in
  // streetwear.js). `cycle` is one bounce, `raise` is the phase of the coil inside it, `strike` is
  // the phase of the drive from there to the deck, and the impact fires at `raise + strike` of
  // every cycle. `raise === strike` puts the coil at the APEX of the bounce: the impulse is at
  // phase 0 and gravity brings the body back to the deck exactly on the impact, so the shape and
  // the hop are the SAME motion. The hop is derived from those two numbers (`hammerHop`) and the
  // pose is handed its own height to coil with — one expression, no second copy of the timing to
  // drift away from. Mutate the table in place to sweep the whole move.
  HAMMER: {
    cycle: 0.50, raise: 0.33, strike: 0.33, hits: 6, exit: 0.30,
    // ...and how many WHOLE TURNS the body takes between one impact and the next, per beat. Whole
    // turns only: every impact arrives with the body square to the line it started on, so six
    // shapes as different as these still hand the exit a body facing the way it began.
    turns: [0, 1, 0, 1, 0, 1],
    // How much taller than the base hop each beat's bounce is — the same arc, thrown harder. The
    // finisher is the one that has to read as the end of the flurry, so it is the one that leaves the
    // deck hardest.
    hops: [1, 1.08, 0.94, 1.0, 1.12, 1.35],
    // ...and how many whole FORWARD FLIPS the body takes across the beat, if any. A flip is a pitch
    // of the rig rather than a turn on it (`hammerFlip`), it is finished exactly on the impact like
    // the turns are, and one beat of the six has it — the elbows, which need a shape of their own
    // because the other five all land on a fist.
    flips: [0, 0, 0, 1, 0, 0],
  },
  STEP: 1.05,
  COYOTE: 0.11,
  JUMP_BUFFER: 0.13,
  // Presses are edges (holding never repeats), so each action also gets a short buffer that
  // carries a tap across a one-frame state transition (tapping F a frame before you leave a
  // ledge, or X the frame before a jump, still fires the moment you are airborne).
  ACTION_BUFFER: 0.13,
  // ---- landing impact ----
  // A landing only reads as an IMPACT if you actually fell. `drop` is the height lost since
  // the top of the current airtime (see `fallPeakY`), so under DROP_IMPACT_MIN there is no
  // impact at all — no thud, no squash, no camera shake, no dust — and DROP_IMPACT_MAX is a
  // full-power one. A standing jump apexes at ~1.7 u, which is why MIN sits just above it:
  // hopping is silent, falling is not.
  DROP_IMPACT_MIN: 2.4,
  DROP_IMPACT_MAX: 8,
  WALL_PAD: 0.2,          // how close a wall face must be to count as contact
  WALL_HUG: 2.0,          // speed pressed into the wall while attached (keeps you flush)
  WALL_STICK: 0.34,       // how long the wall keeps holding once you stop pushing into it
  WALL_LOCK: 0.3,         // contact lockout after a wall jump so the launch actually leaves
  WALL_ARROW: 0.55,       // steering this hard away from the wall peels you off
  WALL_STEER: 14,         // tangential acceleration while wall sliding
  WJ_UP: 11.6,
  WJ_PUSH: 9.4,
  WJ_AIM: 0.5,            // how far a wall jump bends its tangential speed toward your wish
  WALL_SLIDE: 3.4,
  WALL_SLIDE_EASE: 9,     // how fast the fall eases onto WALL_SLIDE
  WALL_COYOTE: 0.14,
  // ---- wall run ----
  // A running jump whose SIDE comes up against a wall turns into a wall run: the speed is
  // kept along the face and gravity mostly stops, so a gap can be crossed in one line.
  // Momentum is HELD, not re-based: the run never brakes you down to a run speed (a dive at
  // 30 u/s runs the wall at 30), so dive -> kick -> run chains keep everything they built.
  // Airborne only, off a real jump, already moving fast, and the wall has to be *beside*
  // you — a wall straight ahead is the slide/climb's job, not this one's.
  WALLRUN_SPEED: 6.2,     // horizontal speed needed to start one
  WALLRUN_TIME: 1.5,      // seconds one wall run lasts
  WALLRUN_HUG: 0.6,       // gentle press into the face that keeps you flush
                      // (kept under the slide's own press threshold, so a run in progress
                      // is never mistaken for "pushing into the wall")
  WALLRUN_EASE: 9,        // how fast the velocity swings onto the wall's tangent
  WALLRUN_SINK: 7,        // how fast the fall eases onto WALLRUN_DROP
  WALLRUN_DROP: 1.0,      // the slow settle it holds while running (a run, not a slide)
  WALLRUN_RISE_G: 0.6,    // gravity multiplier while a run still has upward momentum
  WALLRUN_LIFT: 0.9,      // the little hop up onto the wall when the run starts
  WALLRUN_KICK: 1.05,     // speed multiplier at the start
  WALLRUN_END_PUSH: 2.2,  // outward shove when the run times out
  WALLRUN_CD: 0.3,        // lockout after a run ends, so it cannot re-grab instantly
  WALLRUN_MAX_FALL: 8,    // do not start one while plummeting faster than this
  WALLRUN_TOP: 1.0,       // the wall has to reach this far above the feet to be runnable
  // ---- wall attachment, VISUAL ----
  // The capsule keeps the body a full half-width (HX) off the face, so nothing the player
  // sees ever touches the wall on its own: every limb contact is solved in the pose and the
  // numbers below are what the transform and the poses agree on. All of them are in world
  // units except the banks, which are radians.
  // ---- AND THE RUN IS THE ONE WALL MOVE THAT STANDS OFF (session 146) ----
  // The user: *"WHAT THE FUCK ARE THESE POLE ANIMATIONS FIX THEM ... AND THE WALL RUN ANIMATION THE
  // ARM LOOKS A BIT WEIRD CUZ THE LEG IS INSIDE THE FUCKING WALL PUSH THE PLAYER AWAY FROM THE WALL
  // A BIT"*. They were right, and it was worse than it looked: the run's LEGS are not a set of
  // contacts at all — the stride is the base layer's plain run cycle, solved (by `poseRun`) onto a
  // DECK that a wall run does not have, and it is the BANK that swings it into the stone. The bank
  // rolls the whole body about the hips (`WALLRUN_PIVOT_Y`), so the feet come out of it
  // `pivotY·sin(lean)` = 1.35·sin(0.25) = **0.34 u toward the face**, on top of a stride whose own
  // lateral amplitude adds the rest. Measured on the real rig against the stone (the tall slab at
  // x = 21.8 on the yard's east side, whole stride swept at 1/60 over 90 frames, every vertex of
  // all 99 of the character's meshes transformed and read against the face): the deepest thing the
  // run had at 0.06 was **legLowerR, 0.422 u INSIDE the plate** — 42 cm of shin through the wall,
  // on 87 of the 90 frames, at every speed from a 8 u/s jog to a 20 u/s sprint. On screen that is a
  // leg that vanishes into the stone on every stride, which is what the user was seeing.
  //
  // The fix is the one thing they asked for and nothing else: the same sweep, with the body stood
  // off instead of pressed in, puts the worst vertex of the whole stride at **-0.012 u** — 1.2 cm
  // CLEAR — with the **palm the deepest thing on 112 of the 120 frames** (it is solved onto the
  // plate by `wallHand`, so it rides the face wherever the body goes: `frame.dFace` in
  // `wallRunFrame` is read off this very offset). So the run now reads as a body hanging its hand
  // on the stone with the feet skimming just off it — the feet still travel toward the face out of
  // the bank, they simply arrive AT it rather than through it — and `WALLRUN_BANK` is untouched, so
  // the lean that sells the move is exactly the one it always was. Swept (-0.02 / -0.10 / -0.20 /
  // -0.30 / -0.34 / -0.38 / -0.42 / -0.44, at banks 0.12 to 0.28, at 8 / 12 / 20 u/s); -0.38 is the
  // tightest press-free stand-off with the bank at its own 0.25, and every looser value is only
  // more air between the soles and the stone. The slide and the climb are the other case entirely —
  // they PRESS, because their limbs are solved contacts that have to *reach* the plate:
  WALL_VIS_HUG: -0.38,    // visual stand-off from the face while wall running (was a 0.06 press)
  // ...and the slide presses too, because its brace is SOLVED onto the plate (see `poseWall` in
  // streetwear.js) — but only as far as the pose's own arms actually reach. SESSION 144's number,
  // and the reason it is not 0.52 any more is the user's *"when i wall slide or wall jump in a wall
  // it looks bad like my arms is not there its in the wall fix that make me a bit further from the
  // wall to show the arm"*. The slide's arm table (`WALL_SLIDE.hi*` / `lo*`) is authored by ANGLE,
  // not solved, so it reaches a FIXED distance in front of the rig origin: measured against the
  // tower's stone at 0.52, the wall-side hand's deepest vertex sat **0.25 u inside the plate**
  // (upper arm 0.23, forearm 0.23) — on screen the character braced on the wall with no arm at all,
  // which is exactly what the user described. The stand-off the table was authored for is the one
  // the arm reaches, and at 0.26 the same sweep of the whole scrape cycle puts the palm's deepest
  // vertex between **0.011 inside and 0.009 clear** — i.e. the palm lies ON the plate — with the
  // anchor foot untouched (its plan is face-relative, see the `wallFoot` call: measured -0.017 to
  // -0.022 u, the same contact it holds at 0.52) and the torso clear by 0.04. Anything tighter than
  // ~0.30 buries the hand again; anything looser than ~0.20 lifts it off the stone and it reads as a
  // hover. Both were swept (0.52 / 0.44 / 0.42 / 0.38 / 0.34 / 0.32 / 0.30 / 0.28 / 0.26 / 0.22 /
  // 0.20 / 0.16), over a full cycle, on the real rig.
  WALL_SLIDE_HUG: 0.26,
  // The climb is the third case, and it presses for the slide's reason and one of its own: the
  // climber solves FOUR contacts onto the face (see `poseWall` in streetwear.js), so the body has
  // to be where all four limbs can reach it — and the capsule is far wider than the body is deep,
  // so without a press a climb would be working a plate half a metre away.
  //
  // SESSION 145 PULLED IT IN FROM 137/141's 0.48 TO 0.30, on the user's *"fix the climbing
  // animation please it looks sooooo bad"*. 0.48 is flush enough that the plate takes the elbow's
  // own circle away from `wallHand`'s pole, and the arm it draws is a bent one WINGED out level with
  // a chest-high hand rather than a pull (measured: the holding elbow **+0.08 / +0.12 u ABOVE**
  // its shoulder at 0.48, **-0.40 and steady** at 0.30 — the whole sweep is written up in the
  // `CLIMB` header in streetwear.js). 0.30 is the tightest stand-off with the elbow already fully
  // down, so the body is as flush to the stone as the arm allows: it measures **0.30 rig clear** of
  // the face, against 0.12 at 0.48 — which also lifts the trunk's own mesh fully out of the plate
  // (deepest vertex **+0.03** at 0.30 against **-0.15** at 0.48) and takes the worst of the legs
  // with it (whole-body deepest **0.31 inside** the stone at 0.48, **0.235** at 0.30). Session 139's
  // 0.14 is looser than the arm needs, and hanging the figure out in front of the wall is what the
  // user read as the *"bad spider look"* — so 0.30 is the middle the two earlier sessions had been
  // trading around without ever measuring the elbow.
  // SESSION 156: this is now derived rather than tuned — the CLIP decides where the body stands
  // (`CLIMB.PRESS` 0.44 in streetwear.js, measured), and the press in the pose cancels this number
  // exactly, so the stand-off the user sees is the clip's whichever value sits here. 0.16 is the
  // value that makes the two agree on a square wall: `BOX_HALF - CLIMB.PRESS`, i.e. the unpressed mesh
  // already sits where the press is about to put it, so a mode change eases between two nearly equal
  // offsets instead of sliding the body half a palm for no reason.
  WALL_CLIMB_HUG: 0.16,
  WALLRUN_BANK: 0.25,     // how far a wall run rolls over (the wall side going under)
  WALL_SLIDE_BANK: 0.16,  // a slide braces off the face, so it only rolls a little
  WALL_CLIMB_BANK: 0.12,
  WALLRUN_PIVOT_Y: 1.35,  // the hip height (world): the bank pivots about the HIPS, so the
                          // feet swing out onto the face instead of the body tipping off it
  // ---- THE CLIMB — THE GENSHIN MODEL (session 137) ----
  // The user's *"fix the climbing everything about it is wrong make it like genshin impact
  // climbing"*. The climb it replaced was a key-gated, four-way-solved crawl: SPACE had to be HELD
  // (`CLIMB_HOLD` 0.14 s) and the body only ever took a face it was already pressed against
  // airborne, so a wall you walked into did nothing, letting go of the key dropped you, and the
  // stamina (`grip`) drained to zero and then simply... kept going. The Genshin model is four
  // things, and every one of them is a number below or a line in the attach block:
  //
  //   1. THE GRAB IS AUTOMATIC. Pushing INTO a face (the stick, not a key) takes it, from the DECK
  //      as well as the air — walk or run at a wall and the body starts climbing it. The climb key
  //      is now only an *extra* grab (`inp.climbHeld`), which is what the phone's CLIMB pad still
  //      is, because a thumb on a stick cannot aim at a wall as reliably as a button can.
  //   2. THE HOLD SUSTAINS ITSELF. Once the body is ON the face the press keeps the capsule flush,
  //      so a body that stops steering HANGS where it is (that is Genshin's climb) instead of
  //      dropping the instant an input stops arriving. The way OFF is deliberate: push away at the
  //      bottom, climb down to the deck, JUMP off the face, or run out of stamina.
  //   3. THERE IS A STAMINA. It is the one that was already drawn — the HUD's bar (relabelled
  //      STAMINA in session 137) — but it now means what it means in Genshin: it drains while the
  //      body is on the wall, and at zero the body SLIPS and falls (see `CLIMB_SLIP_*`). It refills
  //      on the deck.
  //   4. THE BODY FACES THE FACE AND MOVES FREELY ON IT. Up/down and across are one speed each and
  //      both answer the camera, exactly as before — what is new is that 'across' is no longer the
  //      slow shuffle (3.6) it was: a Genshin climb's lateral is the same speed as its rise.
  // SESSION 156 — THE CLIMB IS THE CLIP, AND `CLIMB_UP` IS NOW A TEMPO DIAL. The pose is no longer
  // authored here or tuned by hand: it is the user's own Mixamo *"Climbing Up Wall"* clip, retargeted
  // onto this rig and baked as a table (`CLIMB_Q` in streetwear.js — see its header). That changes
  // what these two numbers ARE. While the pose was arithmetic, its limb tempo was whatever the
  // numbers happened to be; running the clip makes the tempo a RATIO, the rate the clip is played
  // against the rate it was drawn at. The clip climbs at **0.59 u/s** of its own (measured at the
  // face: its four contacts descend 0.53-0.65 u/s while planted), so a no-slip cycle is 1.18 u, and
  // a body rising at `CLIMB_UP` plays the clip `CLIMB_UP / 0.59` times its authored speed: at the
  // old 4.0 that is **6.8x**, a handover every 0.15 s — a blur, which is the *"swimming"* the user
  // reported in 152 with the limbs on backwards. 1.6 is **2.7x**: brisk, but a climb the eye can
  // follow, and the whole ascent is deliberately slower than it was (see `GRIP_DRAIN` — the wall
  // distance the bar buys is unchanged, so the climb is not shorter, just slower; session 161 then
  // gives a committed climb up to 1.83x of that distance back, see the `CLIMB_MOM_` block below).
  //
  // The one thing the ratio does NOT cost is the grip: how far a palm slides against the stone over
  // a whole hold is set by the table and the cycle, not by the tempo. The clip's own leftover is at
  // most 0.14 u a cycle, i.e. **7 cm over a hold at ANY speed** (against the 0.79 u the procedural
  // stroke carried), so `CLIMB_UP` is free to be taste alone. 1.6 is the compromise: it is 2.7x the
  // clip's own speed, fast enough that the climb still reads as a move rather than a rest.
  CLIMB_UP: 1.6,          // u/s straight up the face at a full push
  CLIMB_SIDE: 1.6,        // ...and across it (the same speed — a Genshin climb's lateral is its rise)
  CLIMB_ACCEL: 14,        // how fast the climb eases into/out of its target velocity
  CLIMB_DRAIN_IDLE: 0.30, // stamina cost of just hanging on (scales up to 1 with a full push up)
  // How tall a face has to be, above the feet, for the body to take it FROM THE DECK (see the
  // `deckGrab` door in `update`). Under this a face is not a climb at all: it is a step the box
  // carries you up (`P.STEP` 1.05), a vault the run throws you over (`VAULT_*`), or a lip to mantle
  // (`MANTLE_REACH` 1.15) — so walking into a kerb does not start a climb, and the grab from
  // standing is spent on the faces that genuinely have to be climbed.
  CLIMB_GRAB_MIN_TOP: 1.6,
  // The little lift the body takes as it grabs from the deck, so the feet actually leave the ground
  // (a grab that left `grounded` true would be undone by the very next frame's ground/air flip) and
  // the take reads as a body taking the wall rather than as a body leaning on it.
  CLIMB_GRAB_LIFT: 2.4,
  // The cycle's own clock. The contacts are solved onto the face (streetwear.js's `CLIMB`), so how
  // fast the cycle has to run is not a taste decision: it is the rate the body travels past its
  // holds. `CLIMB_CYCLE` is the travel the cycle's stroke is authored at, so the phase rate is the
  // speed along the face divided by it — which is why the number reads as a distance and not as a
  // speed. Idle keeps a slow shuffle going while hanging.
  //
  // ...AND IT IS IN THE RIG'S OWN UNITS (session 162 — the correction itself is at the phase drive).
  // `bake.js` measures the contacts in the rig's frame, where this rig's hip stands at 1.000, and
  // the character is DRAWN at `charMesh.scale` **1.351**, so a rig unit is 1.351 world ones and this
  // 1.18 is worth **1.594 world u a cycle**. SESSION 156 READ IT AS WORLD UNITS — the paragraph
  // below says so in as many words — which ran the clock 35% fast and left every planted palm being
  // dragged down the stone at 35% of the climb: the exact opposite of what the number was for.
  //
  // A NO-SLIP cycle is `stroke * SCALE / duty` from the table in streetwear.js — a hand holds the
  // stone for `duty` of the cycle, and through that hold the plan rides `stroke` down the face, so
  // the body may rise exactly `stroke * SCALE` in that time and no more. SESSION 152 MADE IT ONE.
  // It used to run at 2.6, a little under twice the no-slip value, and the argument for that was
  // tempo: at 4.8 u/s a no-slip cycle is 3.5 hand-moves a second, and 3.5 reads as a blur.
  //
  // The argument was wrong, and the price was the thing the user could see. With the cycle running
  // at 2.6 against a stroke that only covers 1.37 of travel, **every contact slid UP the wall at
  // 46% of the body's own speed** (`v * (1 - stroke * SCALE / (duty * CLIMB_CYCLE))`, measured at
  // the face: 2.2 u/s of drift against a 4.8 u/s climb). A hand that answers only half the stone
  // is a hand that is not holding anything: on screen the whole ascent read as the body FLOATING
  // up the face with its limbs swimming alongside, which is exactly the "filtered ... looks bad"
  // the user reported in 152 — and it is not a thing any amount of pose tuning could out-vote.
  //
  // SESSION 156 REPLACED THE ARITHMETIC WITH A MEASUREMENT. The pose is the user's own clip now, so
  // `CLIMB_CYCLE` is not chosen to make an authored stroke grip — it is READ OFF the clip's own
  // contacts: they descend at **0.53-0.65 u/s** while planted (0.59 mean, a ±12% spread), so one
  // cycle covers **0.59 x 2 s = 1.18 rig u** — 0.797 u/s and 1.594 u a cycle once the rig scale is
  // on, see above — and that is what the table is authored at. The leftover is then at most 0.14 u a
  // cycle, i.e. a palm slides **≤7 cm over a whole hold** — and, unlike 152's
  // 0.03 (its file's own best case, and only at 4.0 exactly), that bound holds at ANY speed, because
  // the phase rate is the vertical velocity divided by this distance (see the phase drive). So the
  // contacts grip whatever `CLIMB_UP` is set to, and `CLIMB_CYCLE` is the one number that has to be
  // right — measured, not tuned.
  CLIMB_CYCLE: 1.18,
  // SESSION 156 — THE IDLE SHUFFLE IS ALMOST OFF, AND IT FADES. With the authored pose the shuffle
  // was free; with the CLIP it is a SLIDE, because a clip's contacts hold the stone only while its
  // playback is exactly proportional to how fast the body is moving past its holds (see the phase
  // drive). 0.04 still moves while a body hangs — a full cycle in 25 s, a hand creeping ~2 cm/s,
  // which reads as a settle rather than a stroke — and `CLIMB_IDLE_FADE` takes even that away as soon
  // as the body is climbing, so the climb itself is exact at every speed.
  CLIMB_CYCLE_IDLE: 0.04,
  CLIMB_IDLE_FADE: 0.35,  // the vertical speed at which the idle shuffle is fully gone
  // ---- THE CLIMB'S OWN BEAT (session 181 — the user's *"fix the wall climb sfx"*). The climb clip
  // plants **four** contacts a cycle — two hands and two feet, one per quarter of the phase — and
  // this is how many that is. The tick is read off the PHASE (`floor(phase * CLIMB_BEATS)`) rather
  // than run on a timer, so the sound is the animation's own grip re-setting rather than a click
  // track laid under it, and it comes out right at every climb speed for free (see `climbTick` in
  // audio.js). Session 199 made this the ONLY door — the climb branch in `tickAirState` was running a
  // second, 0.24 s timer that doubled the tick at 9.8/s — and the beat INDEX travels with the call
  // (`climbTick(beat)`), so the even beats (hands) and the odd ones (feet) are different sounds and a
  // cycle reads as four contacts rather than four clicks.
  CLIMB_BEATS: 4,
  // ---- THE MOMENTUM (session 161 — the user's *"make climbing has a momentum system where it makes
  // faster the longer i climb but not smooth faster like smth like the image i send up and down u
  // feel me but at the end its going up ... please dont make it go downwards"*, with a chart of a
  // jagged green arrow climbing in steps). The climb starts at `CLIMB_UP` and EARNS speed the longer
  // the push is held: `climbMomT` is the seconds of continuous push, and the speed multiplier is
  // `1 + CLIMB_MOM_MAX * (1 - exp(-t/CLIMB_MOM_T))` — 63 % of the way there in 1.6 s, 95 % in 4.8 —
  // so a committed climb is up to **1.55x** the base. Let go and it bleeds off over `CLIMB_MOM_FALL`.
  // The speed never dips below the base for the whole climb — the momentum only ever ADDS, which is
  // the user's *"dont make it go downwards"* read literally — and the trend is monotone up.
  CLIMB_MOM_MAX: 0.55,    // the extra speed at full momentum (as a fraction of the base)
  CLIMB_MOM_T: 1.6,       // seconds of push to reach 63 % of it
  CLIMB_MOM_FALL: 1.4,    // ...and how fast the clock bleeds back when the push stops
  // ...AND THE DRAIN IS DELIBERATELY NOT SCALED WITH IT. `GRIP_DRAIN` is a rate in seconds, so a
  // climb that covers ground faster covers MORE wall on the same bar: 5.2 at 0.21/s is 24.8 s, which
  // is the ~40 u the base speed has always bought and **~60 u at a fully wound-up climb**. That is
  // the reward for a committed ascent and it is left in on purpose — scaling the drain by the same
  // multiplier would make the momentum buy nothing but a shorter climb, which is not what was asked
  // for (the ask is tempo and feel, not economy). It is recorded here because it is the one number
  // elsewhere in the file that the momentum moves: see the `GRIP_*` block below.
  // ...AND IT IS SPENT IN PULLS, not as a smooth ramp (the user's *"not smooth faster ... like the
  // image up and down"*). The chart is a speed that surges in strokes and settles between them
  // while the envelope climbs. SESSION 161 GUESSED that stroke with a cosine (`CLIMB_MOM_SURGE *
  // bump(climbPhase)`, one bump a cycle) — a rhythm of its own, and the wrong rhythm: the clip's
  // limbs stroke FOUR times a cycle, not once, and not evenly. SESSION 162 MEASURES IT INSTEAD,
  // because that is what was asked for: the user's *"can u make the climbing actually dynamic like
  // it matches the animation like if the character pulls the wall with his hands it pulls him up
  // and stuff"*. `CLIMB_PULL` in streetwear.js is the clip's own per-key descent of the planted
  // holds, normalized to a mean of 1 — the rate the stone is being consumed, which IS the rate the
  // arms are hauling body up the wall — and `CLIMB_PULL_DEPTH` is how much of it the speed wears.
  // MEASURED over the cycle: 0.694 to 1.496, four strokes, ~0.5 s apart.
  //
  // ...AND MEASURED ON THE LIVE RIG, with the envelope held off so this is the stroke alone: the
  // body's rise swings **1.35 -> 2.04 u/s around a 1.60 mean** (a 1.51x contrast — the rest of the
  // profile's 2.13x is `CLIMB_ACCEL`'s own 71 ms of lag) while the clip's cycle rate sits at
  // **1.004 a second from the first frame to the last**. One steady tempo and one stroked speed is
  // the whole shape of this: the clip plays as it was filmed and the body travels as far as the
  // clip's own holds say it may, so what the eye reads as the surge is the animation's own pull.
  //
  // THE ARITHMETIC OF THE STICKY PALM, because it is the whole reason this is a SPEED and not a
  // clock. A planted contact holds only while the body travels exactly what the clip's holds say
  // it may: over a phase step `dp` the holds give up `D(p)·dp` of wall, so the body's speed must be
  // `D(p)` times the phase rate. If the phase rate is `speed / CLIMB_CYCLE` (what it has always
  // been) then a stroked speed makes the phase rate stroke too, the two chase each other, and the
  // palm slides by `v * (1 - pull)` — up to half the climb at a haul, which is session 152's swim
  // all over again. So THE CLOCK READS THE PULL, NOT THE PULLED: it is driven by `this.climbUp` /
  // `this.climbSide` — what the push and the momentum are pulling FOR, before the stroke — while
  // the body rides the stroked speed. The clip then plays at one steady tempo (one cycle per
  // `CLIMB_CYCLE / v` seconds, exactly as before) and the body travels `D(p) / mean(D) = pull(p)`
  // of what a steady climb would have, so the palm has nothing to slide against at ANY phase and
  // the whole surge is the animation's own. The two speeds are the same number on average, which
  // is why nothing else has to know: distances, stamina and every other dial are untouched.
  //
  // (The cosine's 0.16 mean is gone with it — a session-161 climb was 1.71x base at full momentum
  // where `CLIMB_MOM_MAX` says 1.55x, because a mean-0.5 bump is a hidden 16% of free speed. The
  // measured profile has a mean of exactly 1, so the envelope now means what it has always said.)
  CLIMB_PULL_DEPTH: 1.0,  // how much of the clip's measured stroke the speed wears (0 = off)
  // ---- THE PARK (session 161 — the user's *\"make the idle climb animation like the guy image i
  // sent\"*; REBUILT from scratch in session 199 — *\"the wall climb idle animation looks bad delete
  // it and make a new one from scratch ... take heavy inspiration from the wall climbing animation\"*).
  // Hanging still is the one moment a real climber is not mid-stroke, so the hang wears a stance of
  // its own, blended in over this many seconds of near-zero climb speed and out again the moment he
  // moves. It is a PARK now rather than a shake-out: both hands and both feet on the stone, solved
  // off plans MEASURED from the climb clip's own settling frame. See `poseClimbPark` in
  // streetwear.js, and `CLIMB_PARK.phase` for which key of the clip it is read off.
  CLIMB_REST_IN: 0.26,    // seconds to settle into the park
  CLIMB_REST_OUT: 0.10,   // ...and to be back on the clip's own pose
  CLIMB_REST_SPEED: 0.50, // the along-face speed under which the park is fully on
  // ---- THE PULL (session 164 — the user's *"when i press m1 i look like im pulling the wall and my
  // but goes down and the longer i hole the more the wall climb skip distance covers"*) -------------
  // M1 ON THE FACE IS THE PULL, and it is not the wall kick there: the kick is for a face you are
  // PASSING (it throws the body off it — see `tryWallKick`, and the press is refused outright while a
  // climb is live). On a climb, M1 is a HELD move with two halves, and this block is both of them:
  //
  //   THE LOAD (held). The push goes dead and the body COILS onto its holds: the hips sink
  //   `sink` and swing `out` from the plate, the feet re-plant up the stone so the knees come up, both
  //   hands keep their high grips and the arms FOLD onto them, and the head comes up to look at the
  //   next hold. Not one pad MOVES while this happens — `poseClimbPull` subtracts the hip offset
  //   from every contact's plan, so the butt drops BETWEEN two planted hands and two planted feet,
  //   which is the whole read of the brief. `climbCharge` fills over `CLIMB_LOAD_CHARGE` seconds
  //   (a saturating curve, so there is no cliff to the last of it) and it costs grip at
  //   `CLIMB_LOAD_DRAIN` on top of the climb's own rate — so a long load is a BET: the deeper the
  //   charge, the further the skip, and the closer the bar is to the bottom.
  //
  //   THE FIRE (released). The body is thrown up the face by `CLIMB_SKIP_BASE + CLIMB_SKIP_GAIN *
  //   charge` world units over `CLIMB_SKIP_TIME`. It is a SKIP rather than another stroke: the
  //   planted holds absorb the first `CLIMB_HAUL_RISE` of rig travel — which is the body hauling
  //   itself up PAST its own hands, the money shot — and the limbs then let go at `CLIMB_HAUL_RELEASE`
  //   and reach while the rest of the distance flies. The burst's profile has a mean of 1, so the
  //   distance covered is the number above whatever the shape, and it ends exactly on the base climb
  //   speed so the hand-back to the clip is a cross-fade and not a stop.
  //
  //   ...AND WHETHER THE BODY IS ON ITS HOLDS OR OFF THEM IS A CLOCK, NOT A DISTANCE. `rel` used to be
  //   read straight off the rise (`(rise - RISE) / FADE`), which is a 0.22 rig window — two frames of
  //   travel at the skip's own speed — so the leap's pose snapped back onto the holds the instant the
  //   burst ended, while 80 % of the overlay was still weighted (MEASURED: the palm jumped 0.30 rig in
  //   ONE frame of the settle, which is the pop the eye catches). It is now a state that is
  //   rate-limited in both directions — off the stone at `CLIMB_HAUL_RELEASE`, back onto it at the
  //   slower `CLIMB_HAUL_REGRIP` — so the hands and the feet are let go of and taken back up the way
  //   limbs come off and go onto stone, and the settle after a full skip is a sweep rather than a cut.
  CLIMB_LOAD_POSE: 0.12,    // s for the load stance to settle onto its holds
  CLIMB_LOAD_CHARGE: 0.60,  // s of M1 held for 63 % of the skip (saturating: 95 % at 1.8 s)
  CLIMB_LOAD_DRAIN: 1.10,   // the extra grip drain at a full charge, over `GRIP_DRAIN`
  CLIMB_LOAD_SINK: 0.44,    // rig units the hips drop at a full load (MUST match `CLIMB_COIL.sink`)
  CLIMB_LOAD_SINK_T: 0.34,  // ...and the time constant the coil deepens on
  CLIMB_LOAD_BRAKE: 3.2,    // how much faster the body comes to a stop on its holds than it climbs
  CLIMB_SKIP_BASE: 2.60,    // world units the fire covers off a tap
  CLIMB_SKIP_GAIN: 14.90,   // ...plus this at a full charge (17.4 world off a full 3 s coil)
                            // SESSION 177: both DOUBLED (were 1.30 / 7.45, an 8.70 full charge) — the
                            // user's *"make the climb jump/skip be double the distance it can cover"*.
                            // The profile's mean is still 1 (see `CLIMB_SKIP_TRIM`), so the number here
                            // is still the distance the fire actually covers, and the peak velocity
                            // simply doubles with it: 2*dist/T is 67 u/s at a full charge.
  CLIMB_SKIP_TIME: 0.52,    // s the fire lasts, release to the last of the overlay
  CLIMB_SKIP_RAMP: 0.16,    // the share of the fire the launch ramps in over (no step in `vel.y`)
  CLIMB_SKIP_TRIM: 1.179,   // ...and the reciprocal of the ramped profile's own mean (see below), so
                            // `climbFireDist` is the distance the fire actually covers
  CLIMB_HAUL_RISE: 0.60,    // rig units of rise the planted holds absorb before the limbs let go
                            // (session 177: DOUBLED from 0.30 with the skip's own distance, so the
                            // money shot — the body hauling up PAST its hands while they stay planted
                            // — lasts the same TIME it always did now that the travel is twice as fast)
  CLIMB_HAUL_RELEASE: 20,   // /s the limbs let go of the stone at (0.05 s off the holds)
  CLIMB_HAUL_REGRIP: 7.5,   // ...and the slower rate they take them back up at (0.13 s)
  CLIMB_HAUL_UNWIND: 44,    // rig units/s the limbs unwind at once the fire is over (see below)
  CLIMB_FIRE_OUT: 0.28,     // s for the fire's overlay to hand back to the clip
  // ...and THE FLIGHT ITSELF (session 177 — the user's *"make the animation when he hops the same
  // animation as when the player uses a jump pad but a little different"*). While the limbs are off
  // the stone (`climbRel`) the body wears a LAUNCH shape — the pad's own soar, see `poseClimbFly` —
  // and these two are how fast that shape comes on and hands back. `CLIMB_FLY_IN` is the pad's own
  // `LAUNCH_POSE_FADE` (0.14), because the user asked for THAT animation; `rel` alone would snap it
  // on in the 0.05 s the hands take to let go.
  CLIMB_FLY_IN: 0.14,       // s for the leap's shape to come on
  CLIMB_FLY_OUT: 0.18,      // ...and to hand back to the climb's own held pose
  // ---- THE SLIP (stamina empty, still on the face) ----
  // What a body does when it runs out up there: it lets GO. The push and the fall are what make the
  // slip read as a slip rather than as a normal jump-off (the wall jump owns that), and the lock is
  // the beat it is refused the wall again — without it the very next frame would re-grab the face
  // the body is still touching and the "fall" would be one frame of noise.
  CLIMB_SLIP_PUSH: 2.0,   // the shove off the face, along its normal
  CLIMB_SLIP_FALL: -2.5,  // the fall it is dropped onto (never a rise, whatever the climb had)
  CLIMB_SLIP_LOCK: 0.6,   // seconds the wall is out of bounds after a slip
  // ---- STAMINA (the HUD's bar) ----
  // It used to be `GRIP_MAX` 1.9 with a 1.0/s drain, which is ~2 seconds of anything — a number
  // that only ever had to gate whether a grab was allowed, because nothing happened when it hit
  // zero. Now that the bottom of the bar is a FALL, it is sized to be a real climb: 5.2 at 0.21/s
  // up the face is ~25 seconds — the same ~40 units of wall it has always bought, because session
  // 156 scaled the drain by exactly the speed that came out of it (`0.52 x 1.6/4.0`) — and a HANG is
  // still `CLIMB_DRAIN_IDLE` 0.30 of that (0.063/s, so 82 seconds; the old half-minute is 2.5x
  // longer, in step with the climb itself, because the idle share is a ratio and needs no re-scaling).
  // On the deck it refills in about three seconds (`GRIP_REGEN`).
  GRIP_MAX: 5.2,
  GRIP_DRAIN: 0.21,
  GRIP_REGEN: 1.7,
  MANTLE_REACH: 1.15,     // how far below the ledge top a climb can vault you over it
  MANTLE_PUSH: 0.80,      // how far onto the ledge the vault lands you
  MANTLE_TIME: 0.30,
  // ---- auto ledge grab ----
  // Fly at a wall whose top is within reach of the HANDS and the character catches it with no
  // press at all: the grip lands on the lip, the body hangs there for a beat while the weight
  // settles, and then it pulls up over the edge (the mantle's own arc, from the hang).
  //
  // The window is measured off the HANG POSE, not off the climb's `MANTLE_REACH` (1.15, which
  // is a waist-high top): `poseHang` puts the grip `LEDGE_GRIP` body-heights above the feet
  // with the arms stretched at the wall, so a lip within `LEDGE_SLACK` of that height is
  // catchable — anything lower is a step, anything higher is a wall to slide or climb.
  // The body is then PLACED from that same number, which is what makes the contact arithmetic
  // rather than a tuned offset: `pos.y = topY - grip height`.
  //
  // `LEDGE_GRIP` and `LEDGE_HUG` are MEASURED, not guessed: pose the rig with
  // `poseHang(1, 0)` and read the hand-mid point back (`userData.handLocal`, see the pose
  // tuning note in src/README.md). The palm's middle comes out 2.493 units above the feet line
  // (drawn height 2.34) and 0.474 forward of the body, so the press that closes the rest of the
  // capsule's half-width is 0.42 — and the grip is pinned a knuckle's width ABOVE the palm, at
  // 1.09, because a hang holds the lip at the knuckle line with the fingers curling over the
  // edge, not through the middle of the palm. At 1.09 the palm sits 6cm under the lip, the
  // finger joints straddle it and the fingertips clear it.
  //
  // SESSION 159 — THE PALMS ARE SOLVED ONTO THE LIP, so this height is now the TARGET the pose
  // is handed rather than a number read back off it (see the grip projection in `updateVisual`,
  // `poseHang` and `poseLedgePull`). The window is wider for the same reason the user asked:
  // *"to ledge grab u dont have to be angle perfect"* — a lip within `LEDGE_SLACK` of the grip
  // height is caught, and 0.45 (was 0.34) is most of a body's own hand-span of slack either way.
  LEDGE_GRIP: 1.09,       // grip height above the feet, as a multiple of the drawn body height
  LEDGE_SLACK: 0.45,      // how far above/below that height a lip is still caught
  LEDGE_PAST: 0.04,       // how far past the face the solved palm's middle sits (see `ledgeGrip`)
  LEDGE_CONE: 0.0,        // how much of the line of travel must point at a lip for the AIR
                          // grab to fire without a press: 0 = anything that is not moving away
  LEDGE_HANG: 0.13,       // seconds the grip holds before the pull-up starts
  LEDGE_SETTLE: 0.06,     // time constant the body eases into the grip with (it starts `LEDGE_SLACK` out)
  LEDGE_PULL: 0.29,       // the pull-up's own arc time (longer than a vault — it starts lower)
  LEDGE_HUG: 0.42,        // visual press into the face: the capsule cannot touch the wall, so
                          // this is what puts the chest against it and the hands in reach
  LEDGE_CD: 0.25,         // lockout after a grab ends, so it cannot re-fire on the way out
  // ...and THE CATCH KEEPS THE RUN (the user's *"make the ledge grab doesnt kill momentum instantly,
  // make just slow down a bit"*). Only the component INTO the face is the wall's — that is the catch,
  // and it is the part a body cannot keep. The component ALONG the lip is the player's own, and a
  // parkour catch spends it rather than losing it: the hang carries along the lip and bleeds it at
  // `LEDGE_DRAG`, and whatever is left when the pull-up starts leaves with the vault (`LEDGE_EXIT`).
  LEDGE_KEEP: 0.68,       // the share of the along-the-face speed the catch carries
  LEDGE_DRAG: 2.4,        // ...and how fast the hang bleeds it off (a rate, 1/s)
  LEDGE_CARRY_MAX: 9,     // ...capped, so a 30 u/s wall-kick into a lip still reads as a catch
  LEDGE_EXIT: 0.80,       // the share of what is left that leaves with the pull-up
  // ---- THE RUNNING VAULT ----
  // The user's *"add vault parkour mech"*. A vault is the move the game was missing between a step
  // and a climb: a LOW obstacle — a rail, a crate, a kerb you cannot just walk over — that the body
  // takes at a RUN, one hand planted on the top, legs swung to one side, and comes down the far
  // side still running. It is not asked for with a key: like the auto ledge grab it happens TO you
  // when you meet the right box at the right speed, because that is what a vault IS.
  //
  // SESSION 197: TWO WAYS OVER, PACED BY THE RUN (*"make the vault has only front flip animation and
  // jump over animation ... make it fluent and it doesnt have to be super fast and snapy make it
  // match the palyer speed but faster"*). The five styles became two (see `VAULT_KIND`), the crossing
  // is timed off the speed it arrived with (`VAULT_PACE`), and the shape is spent before the wall is
  // behind him (`VAULT_SQUARE`, in streetwear.js). The three numbers that shape the pace are
  // `VAULT_PACE` / `VAULT_MIN_DUR` / `VAULT_MAX_DUR`; the one that shapes where the move ENDS is
  // `VAULT_LAND`.
  //
  // The band is the whole design. Below `VAULT_MIN_TOP` the obstacle is a step (the box collider
  // itself carries you up it); above `VAULT_MAX_TOP` it is a climb's business (see `MANTLE_REACH`),
  // and past the hands' window it is a ledge grab. Between them is the one height a body running at
  // full tilt throws itself over without breaking stride. `VAULT_MAX_DEPTH` keeps it a vault and not
  // a bridge — a box deeper than that is a wall run or a climb, never a hand-plant — and
  // `VAULT_PAD` is how far before the face the catch fires, so the vault opens from a running frame
  // rather than from the stopped one the collision would leave behind.
  VAULT_MIN_SPEED: 6.2,   // below this it is not a vault, it is a wall to stop at (u/s, flat speed)
  VAULT_MIN_TOP: 0.45,    // the lowest top a vault will take, above the feet
  VAULT_MAX_TOP: 1.35,    // ...and the highest (above this it is the climb's, see `MANTLE_REACH`)
  VAULT_PAD: 0.85,        // how far before the face it fires — a running frame, not a stopped one
  VAULT_OVERLAP: 0.35,    // ...and how far past the face the catch still counts (the body may already
                          //    straddle the near corner when the run arrives, so the catch is a band)
  VAULT_MAX_DEPTH: 2.4,   // the deepest box a vault will cross (along the run, i.e. the box's depth)
  VAULT_LAND: 0.12,       // how far past the far face the body's near edge comes down (it used to be
                          //    0.30, which put the body's ARRIVAL a stride beyond the rail: the move
                          //    now ends AT the box rather than a metre past it)
  VAULT_CLEAR: 0.18,      // how far the feet clear the top at the apex
  VAULT_MIN_DUR: 0.12,    // the quickest crossing there is — a net, and it only catches a body arriving
                          //    over ~18 u/s at a shallow rail (see `startVault`'s duration)
  VAULT_MAX_DUR: 0.60,    // ...and the slowest, which is the other end of the same net: it sits above
                          //    the slowest legal crossing there is — the deepest box (`VAULT_MAX_DEPTH`)
                          //    at the speed gate, 4.57 u / 7.75 = 0.59 s — so `VAULT_PACE` is the whole
                          //    shape of the pace and neither clamp is felt at any speed a run reaches
  VAULT_PACE: 1.25,       // the crossing travels at this multiple of the run that arrived (the user's
                          //    *"make it match the palyer speed but faster"*)
  VAULT_EXIT: 1.0,        // what share of the run the landing comes off with (a vault costs nothing —
                          // the user's *"make it feel easy and fast ... as well as the vault"*)
  VAULT_EXIT_BONUS: 0.15, // ...plus up to this much more for a FAST crossing: momentum is the reward
  VAULT_EXIT_REF: 11.0,   // the speed the bonus starts at (u/s)
  VAULT_EXIT_FULL: 20.0,  // ...and the speed it is fully paid at
  VAULT_CD: 0.24,         // lockout after a vault ends, so it cannot re-fire on the box behind you
  // ---- the slide's TAIL ----
  // A slide does not end by itself: there is no timer and no speed floor to trip over, so hold
  // SHIFT and it keeps going — the user's "make sliding infinite doesnt cancel on its own". What
  // pays for that is what it costs to OVERSTAY: past `SLIDE_HOLD_TIME` the slide starts spending
  // momentum, so a slide is a burst you take, not a gear you sit in — the user's "sliding for too
  // long kills momentum".
  //
  // THE SPEND IS A CONSTANT DECELERATION, NOT A FRICTION COEFFICIENT (session 148 — the user's
  // *"dont make the slide suddenly slow down make it make sense"*). It used to be `applyFriction`
  // with a coefficient ramping to 3/s, and a coefficient is SPEED-PROPORTIONAL (see
  // `applyFriction`): measured on a fixed patch of deck so the world could not touch it, a slide
  // that entered at 24.8 u/s sat on 24.8 for the whole free hold and then lost **94% of its speed
  // in 1.4 s**, with the deceleration itself climbing from ~3 to **−23 u/s²** as it went — a glide
  // that turns into a wall of gravel in the last third. A body sliding on real ground sheds speed
  // at a CONSTANT rate (friction is a force over a mass, and neither one knows the speed), so the
  // spend is a fixed deceleration in u/s², ramped in over `SLIDE_DRAIN_RAMP` so the onset is not a
  // step. At 10 u/s² (≈0.3 g) the same 24.8 u/s slide falls on a straight line instead — 24.8,
  // 22.3, 12.3, 2.3, nought — over the same ~25 units of ground it always covered, with no part of
  // it steeper than any other. `SLIDE_MIN_SPEED` is not a cap on sliding, it is the floor at which
  // a slide that has been bled to a standstill hands over to the crouch rather than sliding on the
  // spot.
  SLIDE_BOOST: 1.24,
  SLIDE_HOLD_TIME: 1.4,   // free slide time before the spend begins
  SLIDE_DRAIN_RAMP: 0.5,  // seconds the spend takes to reach full strength (0 → DECEL)
  SLIDE_DRAIN_DECEL: 10,  // full-strength spend: u/s² — a steady brake (~0.3 g on the trousers)
  SLIDE_MIN_SPEED: 0.9,   // ...and the speed at which the slide gives up and crouches
  // ---- crouch ----
  // SHIFT on the ground is one intent with two readings, split by speed: press it while you
  // are actually moving and it is the slide, hold it standing still (or once a slide has been
  // bled out by its own tail) and you drop into a crouch instead. Move while crouched and the
  // crouch walks — at CROUCH_SPEED, which is deliberately slow: it is the careful, precise way
  // to cross something fiddly, not another gear.
  CROUCH_SPEED: 2.4,
  // A slide bends its line at SLIDE_TURN rad/s with the SPEED LEFT ALONE — steering changes
  // the direction, never the magnitude (see the slide branch in `update`).
  SLIDE_TURN: 2.6,
  // ---- the slide: the body TUCKS, and a squeeze PAYS ----
  // SHIFT gets you low, and low is also THIN. While the slide is live the collision box gives up
  // SLIDE_SHRINK of its width on BOTH horizontal axes, which is what lets it thread a gap the
  // standing body cannot (see the `hx`/`hz` getters and `updateBox`). Width only: `pos.y - HY` is
  // the feet all over this file and the drawn body's feet are pinned to it, so a shorter box would
  // either lift the body off the deck or sink the model into it.
  SLIDE_SHRINK: 0.2,      // how much of its width the box tucks in while sliding
  SLIDE_THIN_IN: 0.06,    // seconds the tuck takes to come in (you press SHIFT AT the gap)
  SLIDE_THIN_OUT: 0.22,   // ...and to ease back out once the body is clear
  // ...and a gap the standing body could NOT have taken is worth speed. The corridor is measured
  // ACROSS the line of travel — the nearest face on the left of the line plus the nearest on the
  // right — so it takes walls on both sides to register, and sliding along a single wall in the
  // open never does. `SLIDE_NARROW_W` is the corridor width where a squeeze starts to count and
  // `SLIDE_NARROW_TIGHT` the width where it is full (the body's own standing width is 2 * HX =
  // 1.2, and the world's tightest passage — the slide gate — is 1.15).
  // The payoff is acceleration along the slide line, capped like every other speed gain, PLUS a
  // shove when the squeeze lets go, so threading a tight place spits you out faster than you went
  // in and the speed you built is momentum the slide then carries (a slide has no friction).
  SLIDE_NARROW_W: 4.4,
  SLIDE_NARROW_TIGHT: 2.4,
  SLIDE_SQUEEZE_ACCEL: 11,
  SLIDE_SQUEEZE_ESCAPE: 2.4,
  SLIDE_SQUEEZE_HOLD: 0.2,   // seconds of squeeze before it is a thread worth launching out of
  SLIDE_SQUEEZE_FADE: 0.07,  // how fast the squeeze reading follows the corridor
  // The dash family's own ceiling (see `startDash`): no step opens faster than this, whatever run
  // it was thrown out of.
  DASH_MAX: 21,
  // HOW LONG A STEP OWNS THE BODY. The first `DASH_LOCK` of a front or side step is a stun — the
  // step has the body and nothing else is read — and past it the player is FREE to act out of it
  // (a slide, an M1, a jump), which cancels the step where it stands. The BACKDASH is exempt: it
  // is a performance with i-frames, not a placement (see `startDash`).
  DASH_LOCK: 0.15,
  // The Q press's own buffer, so a press a frame or two early still steps.
  QDASH_BUFFER: 0.45,
  // ---- the Q DASH (see `startDash`) ----
  // Q with a DIRECTION held is the four-direction step: FRONT / SIDE / BACK, chosen off the wish
  // in the body's own frame (see `startDash`). A Q with nothing held does NOTHING: the parkour
  // roll that used to live on that press has been REMOVED from the game entirely.
  QDASH_SPEED: 16.5,      // what a step opens with, before the run you brought into it
  // Each of the three steps has its own CLOCK now. The user's brief: *"make the side dash cover a
  // little more distance and the front dash a long dash ... the player does a 1 second backdash"*.
  //
  //   [0] FRONT — THE BOXCUTTER (session 87: *"fix the front dash animtion make it The Boxcutter
  //               kick animtion"* — it replaced session 85's spinning wheel kick, which itself
  //               replaced the lunge). "The Boxcutter" is the tricking name for a CORK HYPERHOOK: a
  //               twisting backflip with TWO revolutions of twist and a hook kick thrown on the
  //               second one, so — unlike the wheel — it is a FLIGHT: it leaves the deck on its own
  //               hop (`QDASH_FRONT_HOP`) and it is not ended by losing the ground. It runs the full
  //               clock rather than ending on what it hits, because the shape has a whole trick's
  //               descent and rise in it — what the hit does is STOP THE TRAVEL on the blade's own
  //               beat (see `dashContact` / `dashKickLands`), which is the user's own rule *"when u
  //               hit the enemy u stop the dash"* expressed on the kick. It is 1.06 rather than the
  //               wheel's 0.62 because a trick needs three revolutions of room: `BOXCUT.kick` is
  //               half the clock in, and the blade is out from 0.47 to 0.64 s of it.
  //   [1] SIDE  — the sidestep: a touch longer and a touch faster than it was, and it covers
  //               about a fifth more ground for it.
  //   [2] BACK  — the BACKDASH: the whole performance, a SECOND AND A HALF now (the flip/spiral
  //               flight, the hero landing it settles onto and the backwards SLIDE out of it, which
  //               starts on the very beat the landing lands — see `P.BACK_STEER` for the line it
  //               travels and streetwear.js's `BACKDASH` for the beats), with its i-frames on the
  //               twist (`QDASH_IFRAME_T`) and the shape on `poseBackdash`.
  QDASH_T: [1.06, 0.36, 1.5],
  QDASH_CD: 0.5,          // ...and how long before the next one
  QDASH_FRONT: 1.18,      // the three speeds: the front step is the fastest and the longest, the
  QDASH_SIDE: 1.14,       // sidestep the middle, and the backstep the biggest THROW of the
  QDASH_BACK: 1.15,       // three — it is the one that has to leave the ground and travel.
  // ...and the BACKDASH's own LIFT, because it is the one step that leaves the ground: the whole
  // shape is a TWISTING backflip, and a flip needs air. It is SOLVED off the pose's own beat table
  // rather than guessed at: `streetwear.js`'s `BACKDASH.turn` (0.44 of the clock) is the beat the
  // feet come back down, so the arc has to be down `0.44 × 1.5 = 0.66` s after it opens —
  // `2 v / g` = 0.66 s gives 10.9 at GRAVITY 33. (A leap of a JUMP_V is 10.7 and 0.65 s, so the
  // backstep rises a whisker over a jump — which is what a backflip has to do to have room to turn.)
  QDASH_BACK_HOP: 10.9,
  // ...and the FRONT step's own LIFT, on the same bargain (session 87 — a boxcutter is a trick, and
  // a trick needs air). It is spent on FRAME ONE (see `startDash`), exactly like the backstep's, so
  // what it buys is AIR TIME and the shape's own clock is what says how much of it the trick wants:
  // `BOXCUT.plant` (0.80) is the beat the shape calls the landing and `BOXCUT.launch` (0.19) the
  // beat its takeoff is drawn on, so the flight between those two is `(0.80 − 0.19) × 1.06 = 0.647`
  // s — `2 v / g` = 0.647 s gives **10.67** at GRAVITY 33. That is a plain jump's own leap almost to
  // the digit (10.7 at 0.65 s) and a whisker under the backstep's 10.9, which is the point: the
  // three things in this game that leave the deck all leave it the same way, so a dash out of a run
  // arrives at the same height as a jump.
  //
  // MEASURED, and worth knowing before the timing is judged by the bug: because the hop is spent on
  // frame one while the shape draws the takeoff on the `launch` beat, the body's arc comes down at t
  // **0.597** of the clock — `kickEnd`, 0.2 of the clock before the shape's own `plant`. The DRAWN
  // feet arrive at t 0.676 (the deck solve cannot own a leg under a body still mid-revolution, see
  // the note at the `boxland` event), so the last tenth of the descent is the legs reaching down out
  // of the flip onto a deck the body is already on. Raising this number does NOT close that gap — it
  // was swept, 10.67 → 14.3, and the drawn touchdown keeps trailing the body's by 3–6 frames at
  // every value (the legs' own reach limits it) — so the hop is left where the jump is.
  QDASH_FRONT_HOP: 10.67,
  // ...and the BACKDASH's own SPEED PROFILE (see the `dash` case in `update`), read beat by beat
  // off the rig's own `BACKDASH` table (`userData.backdashBeats`): the leap's burst decays at
  // `QDASH_BACK_DRAG` (much lighter than a step's, because the whole point now is the DISTANCE),
  // the hero landing brakes it to a crawl for the blink it settles for, and the SLIDE out of the
  // landing shoves it back again — the user's *"make it hold it for a bit and make it slide
  // backwards"*, with the hold since trimmed to a settle by the later *"fix its timing and make it
  // as soon as the player does the hero land"*. Reading the beats off the pose is what keeps the
  // shape and the travel from drifting apart.
  QDASH_BACK_DRAG: 0.85,
  BACK_HOLD_SPEED: 0.8,
  BACK_SLIDE_SPEED: 14,
  BACK_SLIDE_ACCEL: 60,
  // The BACKDASH's i-frames: this long, CENTRED on the middle of the FLIP/SPIRAL (the twist is
  // what the two tenths are for — see `invuln`), the user's *"it give I Frames for just 0.2
  // seconds in the middle of its 1 second duration"*.
  QDASH_IFRAME_T: 0.2,
  // ...and the LUNGE's own two numbers (see `dashContact`): the stagger it puts on a body it
  // simply runs into, and the shove that goes with it. 0.25 s is the user's own number, and it is
  // handed over PRE-DIVIDED because `Enemy.hit` scales every stun in the game by `E.STUN_MUL`
  // (0.7) at the door — so this lands on the clock as 0.25 s, not 0.175.
  QDASH_STUN: 0.357,
  QDASH_KNOCK: 2.4,
  DASH_HIT_PAD: 0.55,     // how far past the two boxes touching a body can still be caught
  QDASH_STOP: 0.05,       // the hold-the-world beat on a step that lands (see `SLIDE_HIT_STOP`)
  // ...and THE RUSH: a front step that touches a body BEFORE its kick does not deliver it there —
  // it compresses its own pose clock onto `BOXCUT.kick` so the BLADE is what lands (the user's *"as
  // soon as it touches an enemy it plays the kick part or speeds up to the kick part"*, answered
  // with the speed-up of the two because the other one teleports the leg). `DASH_RUSH_T` is how long
  // the remaining gap is covered in, in SECONDS, and `DASH_RUSH_MAX` caps the multiplier so a touch
  // on the very first frame cannot ask for an absurd rate (a 0.5-clock gap is 5×, a whole-clock one
  // hits the cap and arrives in 0.09 s).
  DASH_RUSH_T: 0.07,
  DASH_RUSH_MAX: 6,
  // ...and what the LUNGE keeps of its travel on the body it lands on: the user's *"when u hit the
  // enemy u stop the dash"* — the step ends where it connected rather than carrying the player
  // through the body it just staggered (see `dashContact`).
  DASH_STOP_KEEP: 0.12,
  // The PUSHBACK's own two numbers, handed to `Enemy.hit` (see `dashContact`): the SPEED of the
  // shove (its DIRECTION is the reaction's own business now — it rolls it, see `E.PUSH_SPREAD`) and
  // the stun that rides it. The stun is not the reaction's clock — the pushback runs a pinned 0.75 s
  // of its own (`E.PUSH_T`) — it is only what the body carries out of it if something interrupts, so
  // it is set a touch under the whole performance. Raised from 2.6 for the user's *"make the pushback
  // of the enemy far"*, then raised again (11 → 45) for the follow-up — *"make the push back a lot
  // more further a lot a lot more further"*. Against the reaction's own `E.PUSH_DRAG` (now 1.5) this
  // throws the body in the 0.75 s the performance lasts. CUT BACK for *"make the throw back half the
  // size u just edited"*. The number is 45 → **16** and not the literal half of it, because the
  // DISTANCE is what the user sees and it does not halve with the number: measured in the live page
  // (five solves each, the body thrown from the same spot, the best of each): 45 → **16.2 units**,
  // 22.5 → 10.6, 16 → **7.5**, 11 → 5.2. The response flattens off above ~22 (that is where the
  // performance's own backflip carries the body on past the shove), so 16 is the number that halves
  // the THROW. See the note on `E.PUSH_DRAG` in enemies.js for the arithmetic.
  DASH_PUSH_KNOCK: 16,
  DASH_PUSH_STUN: 0.5,
  QDASH_KEEP: 1.06,       // what a FRONT step carries of the run it was thrown out of — it is the
                          // one step that is an ATTACK rather than a dodge, so it keeps the momentum
  QDASH_CARRY: 0.5,       // ...and what a sidestep or a backstep keeps: those two exist to LEAVE
                          // the line you were on, so they only take half of it with them
  QDASH_DRAG: 1.5,        // how fast the burst bleeds off
  QDASH_STEER: 2.6,       // ...and how much of the wish can still curve it while it lasts
  // ---- the BACKDASH's own STEER (see the `dash` case in `update`) ----
  // The backstep is the one step that can be POINTED while it runs, and since session 127 it is
  // pointed by the CAMERA rather than by the stick. Its first pass gave it to the wish (*"while
  // doing a backdash dont stop the player from being able to rotate like where to land ... you turn
  // your camera around and u can go left and right what ever u want"*), a later pass took the stick
  // back out of it (*"make the hero land for the backdash not get effected when i move left right
  // or back or forward"*) and this one puts the LOOK in instead: *"make me able to rotate around
  // with the backdash hero land part but only turn around with the camera not with the keyboard u
  // understood me wrong"*. So the line the move TRAVELS is swung toward the camera's own line,
  // continuously through the whole performance — the flip, the hero landing AND the slide out of it
  // — and the stick cannot touch it at all. This is the rate it is swung at, in rad/s
  // (`swingTowards` below), and the leap's velocity is swung onto that same line at the same rate —
  // the same deal `SLIDE_TURN` gives a slide, and for the same reason: the SPEED is left alone and
  // only the heading answers the look. The rate MATCHES the body's own pan onto the camera line
  // while a step owns the aim (the `dash` branch of the facing chain, `P.SKILL_TURN` 12): the body
  // turns with the look at one rate and the line it travels at the same one, so the two can never
  // disagree and the retreat turns as one whole. It used to be 3.4 — deliberately heavy, because it
  // answered a STICK and a thrown shape had to still read as one; pointed by the LOOK it wants to
  // answer the look, or whipping the camera leaves the body facing one way and still sliding the
  // old one.
  BACK_STEER: 12,
  // ---- THE RE-AIM: a step's LANDING is INSTANTLY the player's (see the `dash` case in `update`) ----
  // The user's *"when i backdash and on the hero landing part i can like rotate my velocity rotate
  // where im going instantly and also do that for the front dash and side dash"*. While a step is
  // putting itself DOWN — from the beat its own shape's trick is spent to the end of its clock, or,
  // for the sidestep, for the whole of it, because it never leaves the deck — a direction held on
  // the stick SNAPS the line the step travels onto it, on the frame it is held, instead of being
  // added to at `QDASH_STEER`. The SPEED is left exactly where the shape's own profile has it (the
  // re-aim turns the line the landing is spent DOWN, it never puts travel back); only the heading
  // answers the hands, and it answers with NO rate at all.
  //
  // IT IS STILL TWO STEPS, NOT THREE — the BACKSTEP is out of the re-aim, and it stays out. Session
  // 123 took the stick off its hero landing (*"make the hero land for the backdash not get effected
  // when i move left right or back or forward"*) and session 127 replaced that with the LOOK: the
  // whole performance is pointed by the camera now and the stick never touches it (see
  // `P.BACK_STEER` and the `dash` case). So the re-aim — a held direction SNAPPING the line on the
  // frame it is held — is the front step's and the sidestep's alone.
  //
  // For those two it is DELIBERATELY not the whole step. A step's trick is a commitment — the
  // boxcutter's flight is a shape being THROWN — so the re-aim opens on the beat it starts putting
  // itself back on the deck: `BOXCUT.unwind` (0.72) for the front step, which is the beat the flips
  // and the two turns are spent and the legs are already reaching down (it is a tenth before the
  // shape's own `plant`, and the body's arc is down even a shade before that). The sidestep has no
  // flight to be committed to, so it is the player's from frame one.
  DIVE_SPEED: 16,
  DIVE_MAX: 28,
  DIVE_ACCEL: 15,
  DIVE_TIME: 1.35,
  // ---- the DIVE LAUNCH, and the AIR COMBO it opens (see `diveContact`) ----
  // The dive is the second way to arrive on a body as a BODY rather than as a swing (the slide is
  // the first — see `slideContact`), but where a slide takes the legs, a dive TACKLES: the body is
  // caught and ridden up, and the window the capoeira's launch opens (`airComboT`) opens with it —
  // so a dive at a body is a way into the air combo that does not need skill 3 up. The launch is a
  // FLIP and not a ragdoll, for the same reason the capoeira's kick is (`Enemies.inFront` skips
  // ragdolls): the body has to be hittable up there or the combo has nothing to land on.
  //
  // It is gated by its own cooldown (`airCd`, drawn as the purple diamond beside the dial), and a
  // dive thrown while that is filling still LANDS — as a plain body-check: a shove and a stagger,
  // no launch and no window. The move is never silently swallowed; it just is not the one you get.
  DIVE_HIT_SPEED: 6.5,      // under this a dive is a fall, and touches nothing (was 9 — the dive
                            // carries you in faster than this almost always, so lowering it only
                            // ever helps a dive thrown from a standing restart or a slow step-off)
  DIVE_HIT_FULL_SPEED: 28,  // ...and at/above this the launch is at its strongest (≈ DIVE_MAX)
  DIVE_HIT_PAD: 1.1,        // how far past the two boxes touching a body can still be caught (was
                            // 0.6: the tackle is thrown at a body that is MOVING, and half a metre
                            // either side of the line was the difference between a juggle and a
                            // whiff whenever the body drifted across it)
  // ...and the vertical reach, which is the number this move lives or dies on. The dive HOLDS its
  // height (its gravity is 0.55 of the world's), so a tackle thrown out of a normal jump arrives
  // over the head of a standing body rather than into its chest: measured on a jump-then-dive
  // across an arena, the diver's box bottom passed **0.4 u above the body's head** — a near miss
  // that the honest box test would call a whiff every single time, which would make the whole
  // mechanic a thing you can only do from very low. `DIVE_HIT_BAND` is that miss plus margin: how
  // far below its own box the diver still catches a body. It is on the same dial as the wall
  // kick's own forgiveness (`KICK_PAD`, "almost any angle short of behind me"), and for the same
  // reason — a move you cannot land is not a move. `DIVE_HIT_BAND_DOWN` mirrors it under the body.
  // BOTH are doubled from what they were (1.2 / 0.55): the body a dive is FOR is one that is being
  // juggled, and a juggled body's height at the moment you arrive is the one thing about this move
  // you cannot aim — so the band has to forgive being a whole body-height out either way.
  DIVE_HIT_BAND: 2.4,
  DIVE_HIT_BAND_DOWN: 1.2,
  // ...and the rule the whole move turns on: the tackle takes a body that is ALREADY UP. `grounded`
  // is the enemy's own read of the deck, and it is true for the frame or two a body spends
  // clipping the pavement at the bottom of a juggle — the moment you are most likely to arrive on
  // it — so a body that is RISING this fast counts as up whether or not its feet have touched.
  DIVE_UP_V: 0.6,
  DIVE_HIT_KNOCK: 3.2,      // the shove along the dive's own line, at the slow end
  DIVE_HIT_KNOCK_MAX: 5.6,  // ...and at the fast end
  DIVE_HIT_LIFT: 9.5,       // the pop off the deck, at the slow end...
  DIVE_HIT_LIFT_MAX: 12.5,  // ...and at the fast end. Both are read against `CAPO_LIFT` 9, which
                            // is the height the air-combo window is verified working from: a dive
                            // that threw a body higher than the capoeira does would put it above
                            // the diver for the whole window.
  DIVE_HIT_DMG: 12,
  DIVE_HIT_STUN: 1.4,
  DIVE_HIT_STOP: 0.07,      // the hold-the-world beat on the tackle (see `SLIDE_HIT_STOP`)
  // ...and what the tackle does to the DIVER. The dive's run is spent on the body it caught — a
  // dive that carried on at 28 while the body went up at 9 would leave its own juggle behind it —
  // and the body is popped up to meet the one it just threw. `DIVE_HIT_KEEP` is what is left of
  // the dive's line; `DIVE_HIT_POP` is the rise, read against `CAPO_JUMP` 12.5 (the jump the
  // capoeira's own air combo is launched with), and ramped by how fast the dive arrived.
  DIVE_HIT_KEEP: 0.22,
  DIVE_HIT_POP: 11.5,
  DIVE_HIT_POP_MAX: 13.5,
  AIR_CD: 2.0,              // the air combo's cooldown — the purple diamond beside the dial (was 5:
                            // five seconds is most of a fight, so a single mistimed tackle cost you
                            // the whole mechanic for the rest of the exchange. Two is still long
                            // enough that the launch is a thing you DO rather than a thing you spam)
  // ---- the air combo's BULLET TIME (see the `slowmo` block in main.js's loop) ----
  // While the air combo is open AND you are actually up in it, the whole world runs slow: the
  // enemy's flight, the window itself and the diver's own move are all integrated on the slowed
  // step, so the same juggle takes this much longer in real time. Nothing else knows about it —
  // it is one multiplier on the step, exactly like the hitstop — which is what makes it safe: no
  // system has a clock that can disagree with any other.
  AIR_SLOWMO: 0.42,
  AIR_SLOWMO_FADE: 0.10,    // how long the shift takes at either end (short on both counts: the
                            // slow-in has to land with the tackle, and the slow-out has to be gone
                            // by the time the body is back on its feet)
  // ---- wall kick (M1 at a wall, airborne) ----
  // Instead of pancaking into a wall — or peeling off one you are riding — you boot off
  // the face, the exit line takes hold, the view sweeps onto it, and the dive carries on along
  // it with a little more speed than you arrived with. A wall ahead of you is the head-on case, but
  // a wall run, a slide and a climb can all be kicked off too (see `findKickWall`).
  //
  // Landing it is deliberately forgiving, because a move you cannot land is not a move:
  //  - KICK_PAD is a hand's width of stand-off (the face no longer has to be touching you),
  //    and `findKickWall` ALSO casts a short ray along your line of travel, so a tap that
  //    lands before you arrive still sees the wall you are about to hit.
  //  - KICK_AHEAD is tiny, so almost anything short of "the wall is behind me" counts as
  //    head-on, and the best-facing wall wins.
  //  - KICK_BUFFER carries a press forward a fifth of a second (tap it a touch early), and
  //    KICK_COYOTE remembers the last wall you were in reach of (tap it a touch late, after
  //    the face has already zeroed your speed), so the press lands either side of the impact.
  //
  // All of that is forgiveness, and it is only ever extended to a body that brought SPEED:
  // `KICK_MIN_SPEED` is the price of admission, and it is checked before anything else in
  // `findKickWall`, so a slow body is refused by every one of the doors above.
  KICK_PAD: 0.5,          // how far off the face the kick will still reach (and how close is "touch")
  KICK_AHEAD: 0.06,       // ...and how opposed to your dive line (head-on-ness; smaller = pickier)
  KICK_TOPS: 0.35,        // the wall has to reach this far above the feet
  KICK_MIN_SPEED: 18,     // ...and you have to be MOVING to boot off a wall: horizontal speed
                          // over this, or nothing answers at all (the user's *"make the wall kick
                          // only work if im moving in a speed over 18"*). It governs the ridden-wall
                          // case too — a wall run, a slide and a climb are all refused while you are
                          // slow, however tall the face. One over `COMBAT_SPEED` (17), so the kick is
                          // the top of the same ladder the melee chain sits under: a plain sprint
                          // (10.9) is under it, and only the momentum a dive, a chain or a slide has
                          // carried buys it. It is measured off the velocity you carry INTO the face
                          // and remembered WITH the wall (`kickMem`), which is the part that keeps
                          // the move landable: the memory can only ever be filled on a fast frame, so
                          // a press landing a blink after the face has zeroed you still counts — the
                          // gate is the speed you ARRIVED with, not the speed left when it stopped
                          // you (a head-on dive at a wall is still the way this move is meant to be
                          // thrown). A body that never gets over the gate never gets a candidate,
                          // and never sees the hint either (see `hintText`).
  KICK_BOOST: 1.18,       // the speed you come out of the kick with
  KICK_PUSH: 4.2,         // the shove off the face
  KICK_LIFT: 6.6,         // and the pop upward, so it reads as a jump kick
  KICK_CD: 0.28,          // lockout, so it cannot be spammed into one wall
  KICK_POSE: 0.30,        // how long the leg spends thrown out at the wall
  KICK_FLIP_TIME: 0.62,   // the flip variant's own clock: how long it spins for. A whole
                          // turn does not fit in KICK_POSE, so the tuck rides this instead
                          // (see `poseKick`'s `spin` rows and the spin chain in updateVisual).
  KICK_BUFFER: 0.22,      // a press this long before the wall is in reach still lands
  KICK_COYOTE: 0.2,       // ...and this long after you last had one in reach
  // ---- the melee chain (the four M1s, streetwear.js's `COMBAT_MOVES`) ----
  // M1 is one button with two jobs: in the air above COMBAT_SPEED it is the wall kick it always
  // was, and on the ground below it it is the chain. The two can never overlap (the kick wants
  // airborne, the chain wants grounded), so the split is only about feel.
  COMBAT_SPEED: 17,       // faster than this and the M1 stays a movement verb (was 12, then 11
                          // before that — the user's "make me able to m1 from speed under 17": a
                          // plain run is SPRINT (10.9), so the gate now sits above anything the
                          // legs make on their own and only the momentum a CHAIN, a slide or a dive
                          // has carried can put you over it)
  COMBAT_REACH: 2.5,      // how far in front of the body a move can land
  COMBAT_ARC: 0.95,       // ...and the half-angle of the wedge it covers (generous: melee)
  COMBAT_LOCK: 8,         // the auto-face range: the nearest body inside this is the target
  COMBAT_TURN: 30,        // how fast the body comes round onto that target
  COMBAT_GRACE: 0.42,     // after a move ends, this long to press for the next one
  COMBAT_CD: 0.09,        // ...and the dead time after a chain ends before it can restart
  COMBAT_DMG: [14, 16, 18, 32],
  COMBAT_STUN: [0.75, 0.75, 1.0, 1.0],
  // The finisher is the one that sends a body: it leaves the deck with a ragdoll tumble on it
  // (see `E.RAGDOLL_*` in enemies.js), so its knock is an order of magnitude over the others'.
  COMBAT_KNOCK: [1.1, 1.1, 1.6, 16],
  // ...and the sweep is the one that sends a body UP: a flight with `flip` on it (see `E.FLIP_*`
  // in enemies.js), which is the chain's juggle window — 0.5 s in the air for the finisher to
  // catch. Its knock is still small, because the flip is mostly vertical and the body has to stay
  // inside the finisher's reach for the window to be worth having.
  COMBAT_KIND: ["fold", "clinch", "flight", "flight"],
  // ...and how much world HEIGHT each one reaches, measured off the player's own HEAD and FEET.
  // The wedge used to ignore height COMPLETELY (see `Enemies.inFront`), so a knee, a fist or a
  // punch landed on a body standing on a roof four metres up — the user's "the hitboxes of the
  // attacks height is insanely broken they go so high up". A strike can reach a body whose own
  // span (its feet to its head — note the enemy's `pos.y` IS its feet, the player's is its centre)
  // overlaps [feet - down, head + up]. The first three are ground strikes thrown at a body on the
  // same floor, so they get most of a step either way and nothing more; the FINISHER is the
  // chain's anti-air move — it is the one that catches the sweep's flip out of the air — so it
  // reaches well over the head (and can still be thrown down at a body below a ledge).
  COMBAT_UP: [0.7, 0.7, 0.7, 1.7],
  COMBAT_DOWN: [0.7, 0.7, 0.7, 1.3],
  COMBAT_STOP: 0.05,      // the hitstop on a clean hit: the world holds its breath for a beat
  COMBAT_STOP_HEAVY: 0.10, // ...and the finisher holds it much longer (see the user's "impactful")
  // A move owns the body but not the legs: holding a direction during the chain creeps you
  // along at this speed (the user's "when i m1 im able to move but very very slow") — under half
  // a walk, so a chain thrown while walking is a stall rather than a stride, and the aim is the
  // auto-face either way, which makes it a lock-on shuffle. With no direction held the move
  // plants exactly as it always did.
  COMBAT_MOVE: 0.9,
  COMBAT_MOVE_ACCEL: 8,   // ...and how quickly the feet get there (a creep, not a snap)
  // The chain does NOT kill momentum (the user's "make them dont kill momentum"): a move thrown
  // out of a run is thrown ON THE MOVE. `COMBAT_CARRY` is how much of the horizontal the feet had
  // when the move began that survives into it — 1 keeps every unit, 0 is the old dead plant — and
  // `COMBAT_DRIFT` (u/s²) is how fast that carried line bleeds off over the move, so a strike out
  // of a sprint glides through the swing and settles instead of slamming to a stop. Neither number
  // adds anything: nothing in the attack state accelerates past `COMBAT_MOVE`, so the moves still
  // cannot walk themselves (the chain is a carry, not a stride).
  COMBAT_CARRY: 1,
  COMBAT_DRIFT: 12,
  // ...and a body it is closing on SPENDS that carry. Inside `COMBAT_PLANT_D` of the move's own
  // target the bleed jumps to `COMBAT_PLANT_DRIFT`, so a running chain arrives AT the body and
  // puts the brakes on on it (the strikes land, and the last of the momentum goes into the
  // ground) instead of sliding straight through and whiffing from behind. With nothing in front
  // neither number applies: a whiffed running M1 keeps every unit of its line.
  COMBAT_PLANT_D: 3.2,
  COMBAT_PLANT_DRIFT: 45,
  // A CHAINED move is cross-faded out of the move before it over this many seconds (see
  // `chainBlend`): the chain's handovers are not all seamless — the clinch holds the trunk ~25°
  // further over than the knee does and leaves the guard with the arms ~30° further out — and the
  // chain pose is otherwise a full override, so the change used to land in a single frame. The
  // user's ask for more of it — *"blend the m1 animations together"* — is this number: 0.09 was
  // enough to turn the quarter-radian snap into a move, and 0.15 lets the two poses genuinely
  // overlap, so knee → clinch → sweep → punch reads as one continuous string rather than as four
  // shapes with smoothed joins. It is still bounded by the strike rather than chosen: the shortest
  // start-up in the table is the KNEE's 0.17 s (`COMBAT_MOVES`), and the fade is OVER before that
  // (the rate is linear, so `attackLink` is 1 at 0.15 s exactly), so every contact frame is still
  // drawn from the new move's own pose alone — the blend spends the wind-up and never the blow.
  // Set to 0 to skip the cross-fade entirely.
  COMBAT_LINK_FADE: 0.15,
  // ...and the chain LAYER's own fade — `attackPose`, which `updateVisual` walks from 0 to 1 when
  // the state becomes `attack` and back down when it ends. It is what covers the two handovers the
  // cross-fade does not: a chain thrown out of a genuinely neutral body (the run, the idle, the
  // air) has no pose to blend FROM, so it fades in over this; and a chain that ends eases back into
  // whatever wants the body next over it. 0.07 used to be that number and it was the worst pop left
  // in the whole string (the README's own measurement: 0.46 u of bone-tip travel in one frame on
  // the idle → knee entry, against 0.07 mid-chain with the cross-fade on) — the same ask, so the
  // same treatment. Still far inside the 0.17 s before the KNEE's contact, so the layering-in of
  // the first move never softens its strike either.
  COMBAT_POSE_FADE: 0.11,
  // How long the chain survives LEAVING THE GROUND. The enemy's own punch is a shove with a
  // little lift on it (`E.ATK_UP`), which pops the body about a tenth of a second into the air
  // — and an attack used to end the instant the feet left the deck, so standing in a crowd of
  // enemies reset the chain to the knee over and over ("it keeps doing the first m1"). This is
  // how long the move may keep running off the ground before it really is an airtime; a jump's
  // own arc is far longer, so jumping out of a chain still ends it.
  COMBAT_AIR_GRACE: 0.22,
  // ---- THE DOWN SLAM — the 4th M1 thrown IN THE AIR (see `startAttack` / `updateAttack`) ----
  // The chain's finisher is TWO moves behind one button. On the deck it is the one-two (the punch
  // that sends a body); off the deck it is the DOWN SLAM: he winds into one whole FORWARD
  // revolution — a fast front flip — and lands the revolution by throwing a leg out and DOWN
  // through whatever is beneath him, driving the body into the deck. It is the move the sweep sets
  // up: the sweep is the one that leaves a body hanging and hittable (see `E.FLIP_*`), so
  // "sweep, jump, M1" is a real string rather than a hopeful one.
  //
  // `COMBAT_AIR_FINISH` is what makes the jump half of that work. The chain normally dies the
  // moment the feet leave the ground (a jump is far longer than `COMBAT_AIR_GRACE`), which would
  // throw the finisher away exactly when it is wanted — so a chain broken by leaving the GROUND
  // with the FINISHER next (`combo >= 3`) keeps its place and opens an airborne press window for
  // this long. Inside it, M1 off the deck throws the finisher, and the finisher off the deck is
  // the down slam.
  COMBAT_AIR_FINISH: 1.10,  // the airborne press window after a chain is broken by a jump
  DSLAM_V: 2,               // the downward commit the move opens with (u/s — deliberately small:
                            // the drop has to stay in the air long enough for the revolution, and a
                            // hard drive here ate the whole airtime and left the body still flipping
                            // when it reached the deck. The SLAM is the leg, not the plummet)
  DSLAM_FALL: 1.2,          // ...and gravity's own multiplier while it runs (heavier than a plain
                            // jump's fall, without shortening the air the revolution needs)
  DSLAM_MAX_V: 40,          // the drop's speed ceiling
  DSLAM_DRIVE: 6,           // how hard the horizontal is bent onto the body he is dropping on
  DSLAM_DRIVE_MAX: 10,      // ...and the horizontal speed that drive may reach
  DSLAM_REACH: 3.0,         // how far in front of the body the foot can land
  DSLAM_ARC: 1.15,          // ...and the half-angle of the wedge it covers (wide — the body is BELOW)
  DSLAM_UP: 0.5,            // how far above his own head the foot reaches
  DSLAM_DOWN: 4.0,          // ...and how far BELOW his feet, which is the whole read of the move
  DSLAM_DMG: 34,
  DSLAM_STUN: 1.25,
  DSLAM_KNOCK: 3.4,         // small on purpose: the body is driven DOWN, not across
  DSLAM_STOP: 0.11,         // the hitstop on a landed slam (between the chain's and the finisher's)
  DSLAM_THUD: 0.5,          // the deck impact's power when the slam arrives on the pavement instead
  DSLAM_THUD_T: 0.9,        // how long a whiffed slam's armed thud survives waiting for the deck
  // ---- THE UPPERCUT — M1 with the JUMP key held on the FINISHER's press (see `startUppercut`) ----
  // The user's own brief: *"if space is held while player is on the ground and m1ing then make the
  // player do an uppercut that throws the enemy in the air"* — narrowed by their second pass to
  // *"fix the uppercut make it only be done in the m4 like if i hold space while doing the 4th m1 i
  // do the uppercut"*, so the modifier is gated on the chain's own place as well as on the key. It
  // is the chain's OTHER second door — the down slam is the first — and the same bargain: index 3
  // with its own descriptor (`streetwear.js`'s `UPPERCUT_MOVE`), so nothing that counts the chain
  // can see it and only `startAttack`'s choice of descriptor changes. The animation is the pose's
  // business (see `poseUppercut`); what lives here is what it does to the body it catches.
  //
  // The HEIGHT is the whole of it, and it is the one number in this file that is SOLVED rather than
  // picked. Under `GRAVITY` 33 the hang of a pop `v` is `2v/g` and its peak is `v²/2g`, so:
  //
  //   v = 17  →  1.03 s of air, 4.4 units of peak.
  //
  // The flip's own 8.25 (half a second, 1 unit) was the previous ceiling and is what the lift has to
  // beat by enough that the difference reads at a glance — 4.4 units is over four times the body's
  // own height above the deck, and it is what makes the follow-up possible at all: the body is up
  // there long enough to jump to. It is deliberately NOT more than that. A lift of 20 is 1.2 s of
  // air and 6 units, at which point the body leaves the fight entirely (and the camera, which
  // tracks whoever is nearest) rather than being thrown into the air over it.
  UPPER_LIFT: 17,
  UPPER_KNOCK: 3.2,         // small on purpose: the knee throws the body UP, and a launcher that
                            // also shoves it across the biome is a move that drops its own follow-up
  UPPER_DMG: 24,
  UPPER_STUN: 1.5,          // long, but only because the air is: a body that recovers mid-hang would
                            // stand up in the air (the `flight` state does not end until it lands)
  UPPER_REACH: 2.2,         // a knee is a close-quarter weapon — shorter than either fist
  UPPER_ARC: 0.85,          // ...and thrown narrower than the chain's own 0.95
  UPPER_UP: 1.9,            // the rising knee reaches WELL above his own head: this is the hit that
                            // goes UP, and the band is what lets it reach a body its own height again
  UPPER_DOWN: 0.45,         // ...and it does not reach below the knees: an uppercut is not a sweep
  // ---- the slide's own hit (see `slideContact`) ----
  // A slide is the OTHER way to arrive at a body at speed: it has no swing and no swing clock, so
  // it does not strike anything — the tucked box simply SWEEPS through its line and the momentum
  // goes into whatever that line crosses, flipping it off its feet. The speed is the whole dial:
  // the lift ramps from `SLIDE_HIT_LIFT` at `SLIDE_HIT_SPEED` to `SLIDE_HIT_LIFT_MAX` at
  // `SLIDE_HIT_FULL_SPEED`, so the faster the slide the higher the body goes (the user's "the
  // faster im sliding the higher they go"), and the shove along the slide's own line goes up with
  // it. Below `SLIDE_HIT_SPEED` a slide is a crawl and touches nothing.
  SLIDE_HIT_SPEED: 5.5,       // under this a slide is a shuffle, not a hit
  SLIDE_HIT_FULL_SPEED: 30,   // ...and at/above this both the lift and the shove are maxed
  SLIDE_HIT_PAD: 0.55,        // how far past the two boxes touching a body can still be caught
  SLIDE_HIT_MAX: 2,           // how many times ONE slide may ragdoll the SAME body (see below)
  SLIDE_HIT_RECATCH: 0.20,    // ...and the gap between those two takes, so the second reads as one
  SLIDE_HIT_KNOCK: 4.6,       // the shove along the slide line, at the slow end
  SLIDE_HIT_KNOCK_MAX: 9.5,   // ...and at the fast end
  SLIDE_HIT_LIFT: 8.6,        // the pop off the deck, at the slow end...
  SLIDE_HIT_LIFT_MAX: 19,     // ...and at the fast end (≈5.5 body-heights of air at GRAVITY)
  SLIDE_HIT_STUN: 1.15,
  SLIDE_HIT_DMG: 9,
  // The one thing a slide keeps from the melee chain: the world holds its breath for a couple of
  // frames when the impact lands, so the flip reads as a HIT rather than the body being passed
  // through. It is deliberately tiny — a slide is a movement move, and every millisecond of
  // hitstop is distance it does not travel (see `SLIDE_HIT_STOP`'s cost in the hitstop block of
  // main.js's loop): 0.04 s of squash costs a 25 u/s slide about 0.9 units, which is under half a
  // body length, and it buys the punch.
  SLIDE_HIT_STOP: 0.04,

  // ---- the M1 clash (see `startClash` / `updateClash`) ----
  // Two M1s that arrive together do not both land: they LOCK. The player's move and the enemy's
  // fist meet in the middle, both bodies are frozen at `CLASH_DIST` apart with the enemy's fist
  // solved onto whatever the player's move brought (streetwear.js's `poseClash`), and the fight
  // becomes a shoving match — every press of M1 drives the pair a little further back, and the
  // first side to fill its meter wins. The enemy mashes too (`CLASH_RATE_*`), so the whole thing
  // is "who spams faster", exactly as the user asked for it.
  //
  // `CLASH_WINDOW` is what "at the same time" means: the two contacts have to fall within this
  // many seconds of each other. Measured against the moves themselves: the punch's start-up is
  // 0.20 and the knee's 0.17, so a window of a tenth of a second is about three frames either
  // side of the contact — close enough that it reads as one impact (and that a trade made on
  // purpose, by throwing M1 into a fist that is already coming, always counts).
  CLASH_WINDOW: 0.10,
  // How far apart the two bodies are held, per the player's move (index 0-3). It is not one
  // number because the WEAPONS are not the same length: a knee or a fist held out in front is met
  // at close quarters, while the punch arrives at full extension and needs the room. These are
  // tuned against the enemy's own arm (`ARM_LIMB`): a gap much wider than this leaves the fist
  // reaching short of the knee it is supposed to be pushing against.
  CLASH_DIST: [1.06, 1.12, 1.18, 1.42],
  // The race. Each press of M1 is worth `CLASH_PRESS` of the player's meter and each of the
  // enemy's own presses the same; the first to `CLASH_WIN` takes it. The enemy's rate is picked
  // once per clash from `CLASH_RATE_*` (presses a second), so some clashes are genuinely harder
  // than others — but the player's own ceiling is the real dial here: mashing M1 at seven or
  // eight clicks a second beats anything in that band, and a human mashing at four does not.
  CLASH_PRESS: 0.085,
  CLASH_WIN: 1,
  CLASH_RATE_MIN: 3.7,
  CLASH_RATE_MAX: 5.5,
  // A stalemate has to end. `CLASH_MAX_T` is the whole clock, and the side with the fuller meter
  // when it runs out is the one that walks away (a dead heat is a mutual break — see `endClash`).
  CLASH_MAX_T: 3.4,
  // The press itself: `CLASH_JOLT_T` is how long the shove takes to decay (so a mash reads as a
  // series of separate jolts rather than one long lean), and every press also walks the pair a
  // little further back. The advance scales with the DIFFERENCE of the two meters, so a side that
  // is losing ground is visibly being pushed, and it is capped at `CLASH_ADVANCE` half-lengths
  // either way — a shoving match, not a stroll across the map.
  CLASH_JOLT_T: 0.16,
  CLASH_ADVANCE: 1.15,
  // How far the whole body leans into the lock at full drive (a rotation about the hips, so the
  // lean is the body's weight going into the opponent rather than a nod). It is per the player's
  // move, because a whole-rig pitch about the hips swings whatever is lowest around with it: the
  // sweep is thrown out of a deep crouch with a leg stretched low and wide, so it takes a fraction
  // of the standing moves' lean or the shin is driven under the pavement (measured: the rig's
  // lowest vertex 0.29 under the deck at full lean, against 0.05 for the knee).
  CLASH_LEAN: 0.34,
  CLASH_LEAN_MOVE: [1, 0.6, 0.12, 0.9],
  // The bodies are driven onto their marks by velocity rather than teleported (so a wall behind
  // one of them stops it, and the camera rides the push rather than snapping).
  CLASH_PULL: 16,
  // ...and the loser is thrown by the winner's move, at this multiple of the chain's own knock for
  // that move, plus the shove the PLAYER takes when he is the one being walked backwards (which
  // rides the enemy's own `enemyHit` event, so it costs the fight nothing new).
  CLASH_WIN_KNOCK: 1.5,
  CLASH_LOSE_PUSH: 8.5,
  CLASH_LOSE_UP: 2.6,
  // ...and what losing one costs, in health: it is the same beat as taking the punch (main.js runs
  // both through `player.damage`), and it is the bigger number because a lock you lost is a whole
  // exchange you were in and did not win.
  CLASH_LOSE_DMG: 9,
  // The two frames the world holds still when a clash is won, so the shove out reads as a
  // decision rather than as the meter quietly filling.
  CLASH_STOP: 0.09,

  // ---- the macaco (the slide's M1 — see `startMacaco`) ----
  // A slide is the only way to arrive at a body already off its feet, so it is the only state with
  // a move of its own: press M1 in the moment after the slide has taken a body AND that body is
  // still a ragdoll in the air, and the player whips over a planted hand and flings it upward (the
  // user's "a macaco reversao or a macaco cartwheel that flings the enemy upward if hes ragdolled
  // and not touching the ground"). Anything else — a press too late, or on a body that has already
  // landed — is not a macaco, and the slide carries on sliding.
  MACACO_WINDOW: 0.55,      // how long after a slide's take the press still counts
  MACACO_REACH: 3.4,        // ...and how far away the body it took may be
  MACACO_T: 0.62,           // the move's own clock
  MACACO_CONTACT: 0.30,     // when the legs come through and the body is flung (0-1 of the clock)
  MACACO_LIFT: 15.5,        // the fling's pop (hang = 2·v/g ≈ 0.94 s of air)
  MACACO_KNOCK: 2.6,        // ...and the outward shove, which is small: this throw is HIGHT
  MACACO_UP_PULL: 0.35,     // how much of the slide's own momentum the body keeps through the move
  MACACO_STUN: 1.15,
  MACACO_DMG: 7,
  // The move plants: the slide's speed is bled off at this rate as the body comes up over the
  // hand, so a 30 u/s slide skids a body length or so and stops.
  MACACO_BRAKE: 26,

  // ---- the drop blast (see `dropBlast`) ----
  // A GROUND SLAM is not only the player's own thud: the shock of it throws the bodies standing
  // around the landing into the air (the user's "the drop impact throws every one into the air
  // like a weak blast"). It is the slam's alone — a plain fall of any height lands with its thud
  // and nothing else (the user's "the drop has to be ground slam not any drop for it to make a
  // blast"). The whole API is the DROP — the height actually fallen since the top of the airtime
  // (`fallPeakY`), the same number the landing's own `landImpact` is read from — and it scales
  // BOTH how far the blast reaches and how hard it throws, so a slam off a kerb is nothing while a
  // slam off a roof clears the street (the user's "longer distance im droping the harder the
  // blast"). A normal jump tops out ~1.7 units up, which is why the floor sits above it: only a
  // slam with a real drop behind it has a blast at all. The throw falls off with distance, but
  // only as far as `BLAST_FALLOFF`, so a body at the rim is still picked up rather than merely
  // nudged — everyone inside the radius goes in the air, which is what "every one" means.
  BLAST_DROP_MIN: 3.2,     // the fall that first counts as a drop at all
  BLAST_DROP_MAX: 26,      // ...and the fall that maxes it out (a roof, not a ledge)
  BLAST_RADIUS_MIN: 4.0,   // how far the smallest blast reaches
  BLAST_RADIUS_MAX: 15,    // ...and the largest
  BLAST_LIFT_MIN: 11,      // the pop at the middle of the smallest blast (≈1.8 of air)
  BLAST_LIFT_MAX: 20.5,    // ...and at the middle of the largest (≈6.3)
  BLAST_KNOCK_MIN: 2.0,    // the outward shove at the slow end
  BLAST_KNOCK_MAX: 6.5,    // ...and at the fast end
  BLAST_FALLOFF: 0.6,      // how much of the lift survives at the rim (1 = no falloff at all)
  BLAST_FLOOR: 0.35,       // ...and how much of the shove: the rim is a nudge, not a throw
  BLAST_STUN: 1.3,
  BLAST_DMG: 6,

  // ---- the four meters (see abilities.js, and "The HUD dial" in the README) ----
  // HEALTH. Standing in a fight used to cost nothing at all — "nothing in this game can kill you"
  // was the design (see the `enemyHit` block in main.js), and that left the melee chain as the one
  // system in the game with no risk attached to it. `HP_MAX` is on the enemies' own scale (E.HP is
  // 100) and a punch is `E.ATK_DMG` (7), so a fight you are LOSING is one you can see yourself
  // losing, while a fight you are winning never touches you. Regen is what keeps the meter from
  // being a slow death by attrition in a world with no health pickups: stay out of it for
  // `HP_REGEN_DELAY` and it comes back over a few seconds.
  HP_MAX: 100,
  HP_REGEN: 3.0,          // hp/s, once you have been out of the fight for HP_REGEN_DELAY
  HP_REGEN_DELAY: 5,
  HURT_IFRAME: 0.55,      // s of grace after a hit, so a crowd cannot chain-lock the body

  // ULTIMATE (the cyan ring) — the meter the style rank feeds (`Rank.mul()`), spent on R for
  // OVERDRIVE. The charge is mostly DAMAGE DEALT (`ULT_PER_DMG` a point) with a flat tip per landed
  // strike, so a full meter is about four clean chains at rank D and about two at SSS — the rank is
  // the difference between the ultimate being a reward and being a habit.
  ULT_FULL: 100,
  ULT_PER_DMG: 0.22,
  ULT_PER_HIT: 2,
  ULT_PER_CLASH: 12,      // ...and what winning a shoving match is worth
  ULT_PER_BLOCK: 14,     // ...and what catching a fist on the scissor's guard (skill 2) is worth

  // OVERDRIVE (what the ultimate buys): a window with no skill cooldowns, more speed, more damage
  // and double style. `OVER_SPEED` rides `moveTarget()` — the single place the run's own cap comes
  // from — so it speeds up the run and nothing else, and `MAX_SPEED` stays the hard ceiling.
  OVER_T: 8,
  OVER_SPEED: 0.4,        // +40% on the run's own target speed
  OVER_DMG: 0.6,          // +60% damage on every strike
  OVER_STYLE: 2,          // and style gains doubled

  // The three SKILLS (the red pills), in ring order: the WHIRL, the head SCISSOR, the CAPOEIRA
  // kick. The whirl KEEPS the dash inside it (see `whirl`): it fires the same burst along the
  // input first and only becomes the grab-carry-throw if the spin finds a body, so the parkour
  // verb it used to be survives inside the combat move it now is.
  DASH_SPEED: 9.5,        // u/s added along the input, on top of what you were already carrying
  // ---- how a SKILL is AIMED, now that one locks the run: with the CAMERA. The body PANS onto the
  // camera's own forward (`camYaw + PI`) rather than snapping to it, over a couple of tenths of a
  // second — the user's *"the player pans his rotation to the camera angel but dont make it an
  // instant"*. One rate for all three (see the facing chain in `update`).
  // ---- FIRST PERSON (V) — the body is the camera's MOUNT. The eye IS the head (see `camera.js`),
  // so a body left pointing wherever it last walked means turning the mouse spins the view inside
  // its own shoulders: you look out of the side of your own chest and the arms swing across the
  // frame. While the mode is on the facing is held on the camera's own line, exactly the way the
  // shift lock holds it, so the body, the limbs and the view are one thing — and for the same
  // reason the lock does it, A/D and S become a strafe and a backpedal with his chest still to the
  // front. Holds that own their own aim (a grab, a vault, the launch pad) are untouched: their
  // branches sit above this one in the facing chain, and `camera.js` turns the LOOK onto the body
  // instead (see `FP_BODY_AIM` in camera.js). The rate is just short of the lock's: fast enough
  // that a flick of the mouse carries the body with it, soft enough that the turn reads as the
  // torso coming round rather than as a teleport.
  FP_TURN: 22,            // lerp rate onto the camera's line in first person (~95% in 0.13 s)
  SKILL_TURN: 12,         // lerp rate toward the camera: ~90% of the gap closed in 0.2 s
  SKILL_STICK_TURN: 9,    // ...and the rate the WHIRL turns onto a HELD STICK instead: a skill is
                          // not rotation-locked (see the facing chain), so a direction held through
                          // the move aims the body onto it. Deliberately slower than a run's 20 —
                          // this is a turn, not a snap — and the camera still aims it when no
                          // direction is held at all
  // ---- SHIFT LOCK (ALT) — the camera locks behind the body and the body stops turning to run ----
  // The user's own brief: *"when i press alt my cross hair turns into a + and my camera becomes like
  // roblox shift lock it turns instantly but dont make it very instant just make it extremly fast
  // for smooth ness ... if i press or hold D or A u walk left or right while my head is still
  // looking at the crosshair and if i press S i walk backward while still looking at the cross hair
  // direction"*.
  //
  // So the lock is ONE line — the CAMERA's — and the body is held on it (branch 9 of the facing
  // chain in `update`) instead of turning onto whatever it happens to be running at: with the
  // facing pinned, A/D and S stop being "turn and run" and become STRAFE and BACKPEDAL, and the
  // whole move stays aimed down the crosshair. None of that is new motion — the wish is already
  // built off `camYaw` (see the movement frame in `update`) so it already points wherever you asked
  // — the lock only stops the BODY following it round, which is what used to turn a sidestep into a
  // U-turn within a couple of frames. The run cycle is then told which way the ground is actually
  // going (`poseRun`'s `fwd`/`lat`) so the legs step sideways and backpedal rather than skating.
  //
  // The camera side is `CameraRig.follow`: the lock's look (nearer, over the shoulder) fades in on
  // `LOCK_BLEND`, and the SWING onto the body's own line when the lock goes on is `LOCK_CAM_TURN` —
  // the user's "it turns instantly but don't make it very instant, extremely fast for smoothness",
  // which is ~95% of the way in 0.1 s. After that it is simply the body that follows the camera, so
  // the pair stays locked together with no rubber-banding at all.
  LOCK_TURN: 34,          // how fast the body snaps onto the camera's line (~95% in 0.09 s)
  LOCK_CAM_TURN: 26,      // ...and how fast the camera swings behind the body when the lock goes on
  LOCK_BLEND: 0.12,       // how long the lock's own look (distance + shoulder) takes to fade
  LOCK_DIST: 3.45,        // the camera's distance in the lock — closer in, so the body reads
                          // (the unlocked chase distance is `rig.baseDist`, 5.0)
  LOCK_SHOULDER: 0.52,    // ...and how far over the shoulder it rides (0.25 unlocked)
  LOCK_BANK: 0.22,        // how far the body banks into a full-speed side-step
  LOCK_BACK_LEAN: 0.55,   // ...and how much of the run's forward lean a backpedal gives back
  // ...and the lock is SLOWER sideways and backwards (the user's *"when shift lock is activated the
  // walk speed is slower for A S D but its normal for W"*). The lock pins the body on the camera's
  // line, so A/D/S are the only ways to move it off that line; each of them costs this share of the
  // walk, and W pays none of it. It is a rate on the FORWARD share of the wish rather than a flag on
  // the keys, so a W+A diagonal splits the difference (see `lockMoveMul`), and with the lock off it
  // does not exist at all.
  LOCK_STRAFE_MUL: 0.6,
  // ---- skill 1: THE WHIRL — the LETHAL WHIRLWIND STREAM. The clock is the USER'S OWN breakdown,
  // in seconds, and every phase boundary below is one of their frame markers — do not retune one
  // without the others, they are read against each other:
  //
  //   LAND (a body is taken), 2.10 s:
  //     0.00-0.30  STARTUP and LUNGE (`WHIRL_LUNGE_T`; the wind-up is the first `WHIRL_STARTUP`
  //                of it, the reach the rest, and the neck is taken on the frame the wedge finds
  //                it — the user's "Startup + Grab")
  //     0.30-0.85  THE HAUL (`WHIRL_SCRAPE_T` — the beat the user asked for afterwards: *"drags
  //                the enemy head across the ground"*. The body is driven down onto the deck and
  //                dragged across it head-first, the hand still on the neck, before it is ripped
  //                up off the floor into the spin below)
  //     0.85-1.40  WHIRLWIND (`WHIRL_DRAG_T` — "Drag / Whirlwind Spin")
  //     1.40-1.80  SLAM (`WHIRL_SLAM_T`), split at `WHIRL_SLAM_HIT` into the PREP ("lifts the
  //                enemy slightly off the ground ... torso coils backward") and the DRIVE
  //     1.80-2.10  LAUNCH (`WHIRL_LAUNCH_T` — "Release + Launch")
  //
  //   MISS (nothing was there), 1.10 s: the same startup and lunge, then the spin runs itself out
  //   over `WHIRL_MISS_SPIN_T` and the recovery over `WHIRL_RECOVER_T` — no slam and no launch,
  //   and the enemy is not touched at all.
  //
  // See `updateWhirl` and `poseWhirl`. ----
  WHIRL_CD: 5.0,
  WHIRL_LUNGE_T: 0.36,    // the STARTUP + the lunge IN: the reach that takes the neck, tested every
                          // frame of it (extended from 0.30 with `WHIRL_LUNGE_V`: the burst needs
                          // TIME to spend its speed, and the distance the user asked for is speed
                          // multiplied by it)
  WHIRL_STARTUP: 0.34,    // ...and how much of that is the WIND-UP (the body coils, the lead arm
                          // cocks back) before the drive goes in — mirrors `WHIRL.startupAt`
  WHIRL_LUNGE_V: 30.0,    // how hard it drives him in (raised from 15, then 22, for the user's
                          // *"make the first part cover more distance"* — the reach now crosses
                          // ~5 u instead of 3.4 u, so the opening is a real lunge, not a step)
  WHIRL_LUNGE_ACCEL: 1200,// ...and how fast the burst gets there (u/s² — see `updateWhirl`: the
                          // drive is a STEP, not an ease-in, because `approach`'s step is an
                          // absolute ceiling and the old `40*dt` starved it to 40 u/s², which is
                          // why the man used to crawl his way through the whole lunge)
  WHIRL_GRIP_BRAKE: 260,  // ...and how hard he plants once the neck IS taken (u/s²): a lunge at
                          // `WHIRL_LUNGE_V` that kept its drive would carry him straight THROUGH the
                          // body, so the grab folds the drive onto the haul's own speed instead
  WHIRL_COIL_MUL: 0.16,   // ...but only 16% of that during the WIND-UP: the coil is on the spot
                          // (a slow creep, ~0.2 u) and the whole of the drive happens AFTER it, so
                          // the reach opens on a body that is still out in front (see `updateWhirl`)
  WHIRL_DRAG_T: 0.55,     // the WHIRLWIND: how long the body is spun across the floor
  WHIRL_MISS_SPIN_T: 0.40,// ...and how long a WHIFF's own spin runs (its shorter clock)
  WHIRL_TURNS: 2,         // how many WHOLE revolutions the whirl is worth (whole: the rig
                          // ends the move square to the line it began on, so there is nothing to
                          // wind back when the state hands over). It was 4, which is 7.3 rev/s
                          // across the 0.55 s spin — a blender, and once the phase clock above was
                          // fixed it read as a blur rather than a turn. 2 over the same clock is
                          // 3.6 rev/s: fast enough to be a whirlwind, slow enough that the eye can
                          // track a revolution and read "standing on a body and spinning".
  WHIRL_DRAG_V: 9.5,      // how fast the whirlwind travels forward while it spins
  WHIRL_SLAM_T: 0.40,     // the PREP (hoist) and the DRIVE (down into the deck)
  WHIRL_SLAM_HIT: 0.50,   // where in that phase the body actually hits the deck — the user's
                          // 1.05 s boundary between "Slam Preparation" and "Ground Slam"
  WHIRL_LAUNCH_T: 0.30,   // ...and the release: the pop out of the crater and the step back
  WHIRL_STEPBACK: 2.6,    // ...and how hard he steps BACK off it while the arm follows through
  WHIRL_RECOVER_T: 0.40,  // a WHIFF's own tail (no body, no slam: the spin simply runs out)
  WHIRL_REACH: 2.7,       // how far the lunge can take a neck from
  WHIRL_ARC: 2.2,         // ...and its arc: he is turning into it, so a body beside him is as
                          // takeable as one in front of him.
  WHIRL_UP: 1.5,          // ...and the band of heights it reaches, off the player's own head/feet
  WHIRL_DOWN: 1.2,
  WHIRL_DIST: 1.30,       // the HAUL's own arm's length: how far out a taken body is carried in at
                          // before the HOLD (below) takes it over — and what the clinch holds a
                          // body at everywhere else (`grabDist`)
  // ---- THE HOLD (the whirlwind's own carry — see `updateWhirl` and `poseHurtWhirlDrag`) ----
  // ONE keyed path runs from the frame the neck is taken (h 0) to the frame it is driven into the
  // deck (h 1): `whirlHoldKeys`, whose keys are the (orbit radius, orbit height, LAY-OUT ANGLE,
  // ROLL) quads below, so the hold's shape and the move's beats are the same read. Radius and height
  // are the rig's own ORIGIN (what `pos` is, and therefore the one thing the placement gets
  // exactly); the height is off the deck, and measured it comes out as the body's LOWEST point to
  // within a centimetre, because the laid-out shape hangs nothing below the origin.
  //
  // The LAY-OUT is what does the real work, and its numbers are worth having in one place: the rig
  // turns about its own origin, so laying the body out at `lay` swings the head INWARD (towards the
  // player) and the feet the same distance the other way. A QUARTER turn is the only angle at which
  // a person-sized body lies ALONG the deck at all — which is why BOTH flat beats of the move (the
  // HAUL and the BEYBLADE) are a quarter turn, and why the difference between them is the ROLL:
  // the haul is face-DOWN and the beyblade is the same lie rolled 180° about its own length
  // (`WHIRL_TOP_FLIP`), so the head stays under the player's boots and only the belly turns over.
  // ---- THE BEYBLADE — the second part, per the user's own rewrite of it ----
  // *"make the 2nd part does a bayblade rotated spin then smashes the enemy to the ground ...
  // turn the dummy 180 degrees so he becomes under the player feet"*. So the whirlwind's ALOFT
  // fling is gone: the body is torn off the haul, TURNED 180° — rolled over about its own length
  // from the haul's face-down flat to face-UP (`WHIRL_TOP_FLIP`) so that its HEAD stays swung in
  // under the player's boots — and pinned on the deck there, and the man spins on it like a top for
  // the rest of the phase (the body rides the whirlwind's own angle, so it is ground round with him
  // and stays squared under his stance the whole way), then the slam drives it in.
  // Radius and height are still the orbit's own two (the body's ORIGIN, which is its FEET, and the
  // height its LOWEST point rides at — see `WHIRL_SKIM_R`):
  WHIRL_TOP_R: 0.45,      // ...UNDER THE FEET, and this is the number that puts him there: the orbit
                          //    is the body's own ORIGIN (its hips) and the flat shape hangs its HEAD
                          //    most of a body length INWARD of that origin (a quarter turn is the
                          //    only angle at which a person lies ALONG the deck at all). It was 0.95
                          //    — measured, that put the body 0.79-0.95 u AHEAD of the player, so
                          //    "under the boots" read as "under his FRONT foot" (the user's note).
                          //    Pulled in to 0.45 the body's own length then straddles the player's
                          //    axis: the skull sits just behind his heels and the hips/toes just in
                          //    front of them, which is a man standing ON a body rather than over one
  WHIRL_TOP_Y: 0.10,      // ...and riding a hand's width off the deck, so the boots grind the body
                          //    into the pavement instead of standing inside it
  WHIRL_TOP_LAY: 1.57,    // ...at the SAME quarter turn the haul had: the head stays swung INWARD
                          //    (toward the player) all the way through the move, and it is the FLIP
                          //    below — not this — that turns him over
  WHIRL_TOP_FLIP: Math.PI,// THE 180° — the user's *"turn the dummy 180 degrees so he becomes under
                          //    the player feet"*. It is the rig's own Y (`inner.rotation.y`, see
                          //    `enemies.js`), which for a body ALREADY laid out flat is a ROLL ABOUT
                          //    ITS OWN LENGTH: the head keeps pointing inward (0.2 behind the heels)
                          //    and the belly turns over from the deck to the sky. Pitching the lie
                          //    out by another quarter turn instead — which is what this was — is a
                          //    HEAD-TO-FEET swap, not a turn-over, and it left the body lying out in
                          //    FRONT of him, head furthest away, which is not under his feet at all.
  WHIRL_HOIST_R: 0.55,    // HOISTED (the short "Slam Preparation" before the smash) — up off the
  WHIRL_HOIST_Y: 0.58,    //   pavement, riding on the boots, so the drive has somewhere to come down
  WHIRL_HOIST_LAY: 1.57 - 0.35,  //   ...and tipped, so it is the HEAD (the end under the boots)
                          //   that comes up off the deck to be smashed back into it
  WHIRL_DRIVE_R: 0.35,    // ...and DRIVEN into the deck at the impact: pulled in under the feet and
  WHIRL_DRIVE_Y: 0.02,    //   brought all the way down (the key is the height the body's lowest
  WHIRL_DRIVE_LAY: 1.57 + 0.12,  //   then sits at, and it is set so that is the DECK, with the
                          //   skull itself a little PAST flat — driven a hand's width into it)
  // ---- THE HAUL (the user's *"add a part for skill 1 between the 1st part and the 2nd part where
  // he drags the enemy head across the ground"*) ----
  // A beat of its own between the GRAB and the WHIRLWIND: the neck is taken on the lunge, and then
  // the body is driven DOWN onto the deck and HAULED across it head-first — the skull skimming the
  // pavement at the hand — before it is turned over and pinned underfoot for the spin. It is the
  // reference clip's own beat (a body dragged along the ground, head down, the man bent over it,
  // striding into it), and it is the reason the hold has a low key at all: the whirlwind then holds
  // the body FLAT AND UNDER THE BOOTS (`WHIRL_TOP_*`), so without this the body went from standing
  // straight to being pinned underfoot and its head never touched the floor. It is a WHOLE PHASE
  // (id 6, see `whirlPhase`), which is why the move
  // is 2.10 s with a body in his hands rather than the 1.55 s of the original three beats.
  //
  // Where the body IS during it is the ORBIT's three numbers, exactly like the top's:
  WHIRL_SCRAPE_T: 0.55,   // how long the haul runs
  WHIRL_SCRAPE_V: 6.2,    // ...how hard he drives forward while he hauls (the spin is `WHIRL_DRAG_V`,
                          //    which is faster: the haul is a STRIDE, the spin is a throw)
  WHIRL_SKIM_R: 1.88,     // ...the orbit radius the body is dragged on. It is the body's own ORIGIN,
                          //    and the origin is its FEET — so a body laid out FLAT (below) has its
                          //    head most of a body-length INWARD of that radius, which is exactly
                          //    what puts the skull out at the hand with the rest of the body
                          //    trailing behind it (measured: the head rides 0.8 ahead of his feet,
                          //    the toes 2.5, and every part of the body between 0.2 and 0.4 off the
                          //    deck — a body LYING on it, which is the whole read of the beat).
                          //    It is bounded from both sides and this is the span between them: out
                          //    far enough that the man is not standing on the body, and in close
                          //    enough that the ARM still reaches the neck — `poseArmReach` clamps at
                          //    `ARM_LIMB` (0.87, measured), and the haul's own stride swings the
                          //    shoulder a tenth of a unit either way, so (measured) the solved reach
                          //    runs 0.82-0.97 across the haul: in contact everywhere but the top of
                          //    the stride, which is the price of `poseRun` carrying the legs
  WHIRL_SKIM_Y: 0.02,     // ...and the height its LOWEST point rides at: the DECK. This is the whole
                          //    beat — a body skimming the pavement rather than being held off it —
                          //    and it is measured rather than guessed: the clinch's own ground solve
                          //    (`restOnDeck` in enemies.js) puts the lowest VERTEX of the rig on this
                          //    number every frame, so it is the skull and the chest that the pavement
                          //    is read against, not the body's origin
  WHIRL_SKIM_LAY: 1.57,   // ...and the whole-rig angle: FACE-DOWN AND FLAT — a quarter turn, the only
                          //    angle at which a person-sized body lies ALONG the deck at all (see
                          //    `SKIM_SHAPE`, which carries the rest of the flat pose)
  WHIRL_SCRAPE_DPS: 9,    // what the pavement is worth, per second, while the head is skinned on it
  WHIRL_SCRAPE_PUFF: 0.12,// ...and how often the dragging head kicks its own dust and scrape up
  WHIRL_SKIM_BRACE: 0.52, // how much of the run's stride the haul's own walk plays (see `poseRun`)
  WHIRL_HOLD: 2.6,        // the stun the hold is written on (it has to outlive the whole move)
  WHIRL_CANCEL: 0.26,     // how far in a press has to be before it may cancel the move
  WHIRL_SLAM_DMG: 18,     // the slam into the deck
  WHIRL_SLAM_DMG_FAST: 28,// ...and the AERIAL one — the "webby smash": the same slam thrown out
                          // of the air, which is what `WHIRL_SLAM_FAST` buys (see `whirlSlam`)
  WHIRL_ELBOW_DMG: 24,    // the finisher's follow-up, on a body already under `WHIRL_FINISH_HP`
  WHIRL_FINISH_HP: 0.22,  // ...which is the fraction of a body's health the finisher waits for
  WHIRL_SLAM_SHOVE: 5.0,  // what the body is driven into the deck with
  WHIRL_LAUNCH_KNOCK: 7.0,// the pop out of the crater: up, with only a little push
  WHIRL_LAUNCH_UP: 13.5,  // ...and how high it throws him
  WHIRL_LAUNCH_STUN: 1.8,
  WHIRL_GRAB_DMG: 6,      // what the neck itself is worth on the way in
  WHIRL_STOP: 0.06,
  // =========================================================================
  // SKILL 1, AS IT IS NOW — THE FLYING KNEE (see `knee` / `updateKnee`). The WHIRL above is kept
  // whole and unwired: the user's *"replace the first skill with ..."* took the pill, not the
  // move, so everything the whirl is (`whirl()` … `whirlLaunch()`, `poseWhirl`, the four enemy
  // shapes its hold drives) is still in the file, ten lines of `trySkill` away from being wired
  // back up. What follows is what the pill DOES now.
  //
  // The brief, one sentence: *"replace the first skill with make him do a fast run up about like 20
  // speed if the player is standing still and if the player is running make him do the flying knee
  // right away without the run up make the knee go to the enemy head it must touch the enemy head
  // and exaggrate the animtions"*. Four things fall out of it, and they are the four that shape
  // every number below:
  //
  //   1. IT OPENS WITH A RUN-UP — but only from a standstill. `KNEE_RUN_V` is the "about like 20
  //      speed" and `KNEE_RUN_SPEED` is the line between the two cases: a body already carrying
  //      more than that is RUNNING, and a running press skips the run-up entirely and leaps on the
  //      frame it was pressed (the leap below is solved from wherever the body is, so it does not
  //      care which way it got there).
  //   2. THE KNEE GOES TO THE HEAD. The leap is not a shove in a direction, it is a SOLVED ARC:
  //      `kneeLeap` puts the body's centre where the strike knee's own offset (`KNEE_FWD` /
  //      `KNEE_UP`, measured off the rig) lands the knee ON the target's head bone, and the contact
  //      test (`kneeContact`) then reads the REAL shin bone against the REAL head every frame of
  //      the flight — so "it must touch the enemy head" is checked, not assumed (see the notes on
  //      those two).
  //   3. IT IS ONE BIG SHAPE. The pose is authored loud (`poseFlyingKnee`): a sprint that leans
  //      past the run cycle's own limit, a knee driven up through the target's chin at full
  //      extension with the trailing leg whipped back and both arms thrown behind it, and a landing
  //      that skids out of it. `KNEE_BRACE` is the one dial the whole thing is scaled by.
  //   4. IT IS A SKILL, so it is a cooldown, a state the run is locked out of, and one body it can
  //      take — but unlike the whirl it is a HIT rather than a hold: there is no grab, no carry and
  //      nothing to cancel, which is why the whole move is a third of a second of flight and a
  //      landing.
  KNEE_CD: 5.0,
  KNEE_RUN_V: 20,         // the run-up's own speed — the user's *"about like 20 speed"*
  KNEE_RUN_ACCEL: 95,     // how hard it drives up to it (u/s²): the whole burst takes ~0.2 s
  KNEE_RUN_SPEED: 5.0,    // ...and the line between the two openings: a body faster than this is
                          //    RUNNING, and a running press leaps at once with no run-up at all
  KNEE_RUN_MAX_T: 1.0,    // the longest a run-up may last before it leaps whatever the range (a
                          //    far target, a target that walked away, a whiff: it still goes up)
  KNEE_TURN: 13,          // how fast the body comes round onto the target while the move runs
                          //    (rad/s): the run-up is a CHASE, so the aim is the thing being chased
                          //    and not the camera — this is what makes a knee pressed at a body
                          //    standing off to the side turn onto it and go
  KNEE_LEAP_RANGE: 3.0,   // how close the run-up gets before it goes up — a body's own length plus
                          //    the knee's reach, measured between the two CENTRES
  KNEE_RANGE: 26,         // how far away a body may be and still be aimed at by the run-up
  KNEE_ARC: 2.0,          // ...and the half-angle of the wedge it is looked for in (radians)
  KNEE_UP: 2.4,           // ...and the height band it is looked for in, off the player's own head
  KNEE_DOWN: 1.4,
  KNEE_LEAP_V: 14,        // the leap's own speed: the flight time to the STRIKE is solved off it
                          //    (`dist / v`), clamped between the two below — a leap into a body an
                          //    arm's length away would otherwise be a single frame, and a long one
                          //    would float. The whole arc is that over `KNEE_STRIKE_U`.
  KNEE_LEAP_MIN_T: 0.12,
  KNEE_LEAP_MAX_T: 0.40,
  KNEE_STRIKE_U: 0.55,    // which beat of the arc the knee arrives on: the pose is at full
                          //    stretch here (see `poseFlyingKnee` — the strike leg's extension
                          //    peaks at u≈0.55), so the arrival is SOLVED for this beat and the
                          //    knee is on the skull at the moment it is longest. The arc is the
                          //    rest of it (`T = ts / KNEE_STRIKE_U`).
  KNEE_HOME: 1.7,         // rad/s the flight's heading may still be swung by at the target: a body
                          //    that walks out from under the arc is still met (the vertical is the
                          //    solved one and is not touched — a homing arc reads as a missile)
  KNEE_AIM_FWD: 0.92,     // MEASURED, off the rig at the strike beat (see `kneePoint`): how far
  KNEE_AIM_UP: 0.57,      //    FORWARD of the body's centre and how far UP of it the strike knee
                          //    is, as a fraction of the body. `kneeLeap` puts the CENTRE here:
                          //    `centre = head - fwd * KNEE_AIM_FWD` and `centre = head - up * KNEE_AIM_UP`
  KNEE_WHIFF_DIST: 4.4,   // how far ahead a leap with nothing in front of it flies (the knee is
  KNEE_WHIFF_UP: 0.35,    //    thrown into the air: this is how far ABOVE his own centre it is aimed)
  KNEE_HIT_R: 0.45,       // TOUCHING: the two chunky parts — the knee joint's own radius and the
                          //    head's — with a centimetre of grace on top. Measured off the rig: the
                          //    knee cap is ~0.19 across and the skull ~0.23, so 0.42 is the geometric
                          //    contact. It is set to that and not to "nearly", because the leap is
                          //    SOLVED (the knee's closest approach to the head bone measures ~0.16 —
                          //    it goes THROUGH the skull), so the margin is there and a press that
                          //    connects means the knee really did touch: the user's *"it must touch
                          //    the enemy head"* taken literally
  KNEE_STOP_KEEP: 0.16,   // what the leap keeps of its speed on the contact: the knee stops on the
                          //    head the way the lunge stops on a body (`DASH_STOP_KEEP`)
  KNEE_KNOCK: 9.5,        // the head-shot's own shove...
  KNEE_LIFT: 7.0,         // ...and the pop that goes with it (a `flight`, ragdolling)
  KNEE_STUN: 1.7,
  KNEE_DMG: 95,
  KNEE_STOP: 0.10,        // the hitstop on the contact (a `max`, like every other)
  KNEE_RECOVER: 0.40,     // the landing's own settle: the skid out of the knee, and up
  KNEE_LAND_BRAKE: 120,   // ...and how hard the deck bites the skid (u/s²)
  // =========================================================================
  // THE RIGHT-CLICK GRAB (see `grab` / `updateGrab`). The brief:
  //
  //   *"make the right click grab the enemy by the chest and throw him away i must touch his chest
  //   / and if hes under me on the floor i grab him by the shoulders up and put him up on his feet
  //   and when he stands on his feet he does a cartoony dizzy animtion ... / and if hes airborne
  //   above me i grab his leg and pull him down and do a front flip as a i slam his body to the
  //   ground"*
  //
  // ONE button, THREE moves, and which one it is is decided by where the body IS (see `grabPick`):
  //
  //   2  THE SLAM     a body coming down out of the AIR above him: both hands take the shin, he
  //                   drives off the deck after it, and the pair of them go over FORWARD in a
  //                   front flip (`grabFlip` — the rig's own whole-rig X, exactly the way the
  //                   down slam's rotation is the rig's) and the body is planted in the deck on
  //                   the beat the turn comes round.
  //   1  THE SET-UP   a body on the DECK under him: the hands go under the shoulders and haul it
  //                   back up. The body's own rise is its place get-up (`Enemy.liftUp`), run under
  //                   the haul so it is on its feet as the hands come off — and it is left DAZED
  //                   there (the stars are `main.js`'s, the reel is `poseHurtDizzy`).
  //   0  THE FLASH GRAB  a body STANDING in front of him: a slow crouch wind-up, a 1-2 frame
  //                   rocket onto the THROAT, a hitstop freeze as the one hand locks, a full 360
  //                   swing with the body dangling (`grabSpinY` — the rig's own whole-rig Y), and
  //                   a back-first CRASH into the deck finished from a one-fist hero landing.
  //                   Hit or miss is decided at the hand, not the press.
  //
  // What all three share is the thing the button exists for: the hands are SOLVED onto the other
  // body's own bones every frame (the throat / the shoulders / the shin — see `GRAB_POINT`).
  //
  // It is a SKILL like the others: a cooldown, one body, and a state the run and the jump are both
  // locked out of. A press with nothing in reach is a WHIFF — the chest shape still plays, on the
  // authored fallback path, and the hands close on nothing.
  GRAB_CD: 1.6,
  GRAB_TURN: 16,          // how fast the body comes round onto what it is taking (rad/s)
  GRAB_RANGE: 3.5,        // how far a body may be and still be taken (chest / shoulders)
  GRAB_ARC: 1.35,         // ...and the half-angle of the wedge it is looked for in (radians)
  GRAB_AIR_RANGE: 3.0,    // ...and the (slightly shorter) reach for a body coming out of the air
  GRAB_AIR_ABOVE: 0.30,   // ...and how far ABOVE him it has to be for the ankle grab
  GRAB_FLOOR_BELOW: 0.7,  // ...and how far BELOW him a body on the deck may be and still be reached
  GRAB_TURN_RATE: 0.16,   // how long the rig takes to come round onto the target while the move is
                          //    on (`GRAB_TURN` is its cap — the aim is a turn, not a snap)
  // ---- 0: THE FLASH GRAB (wind-up, flash dash, lock, 360 spin-lift, crash) ----
  GRAB_WINDUP: 0.38,    // the slow crouch with the arm back — the anticipation
  GRAB_TAKE: 0.50,      // contact: the dash lands the hand on the throat (hit or miss is
                        //    decided HERE, at the hand, not at the press — see `updateGrabThrow`)
  GRAB_DASH_SPEED: 16,  // the flash dash's drive (u/s), barely decaying: 1-2 frames of blur
  GRAB_SPIN_END: 0.95,  // the 360 lift finishes and the crash starts
  GRAB_PLAY: 1.35,      // the whole move on a hit...
  GRAB_MISS_PLAY: 1.50, // ...and on a whiff (the extra is the punish window)
  GRAB_LOCK_DIST: 0.80, // how close the throat is held through the spin (u)
  GRAB_LOCK_HOLD: 0.60, // the clinch stun covering the lock and the spin
  GRAB_POP: 3.2,        // the little hop both bodies get on the lock (u/s)
  GRAB_SPIN_R: 0.68,    // the orbit radius the body is swung on (u)
  // The SWING's own height. The held point is the THROAT, and it is solved onto a height read off
  // the player's DECK rather than off his shoulders: the body is carried LOW (feet skimming the
  // pavement) instead of being hoisted overhead — a swing you can see the whole of, at the side of
  // a man who is turning on the spot, rather than a body held up out of frame.
  GRAB_SPIN_HOLD: 1.18, // the held throat's height above the player's deck (u)
  GRAB_SPIN_ARC: 0.16,  // ...plus this much rise through the middle of the swing
  GRAB_SPIN_MIN: 0.22,  // ...and the body's own feet never sink below this above the deck
  GRAB_SPIN_LAY: -0.50, // the whole-rig tip: hauled off its feet (head back, feet swung out) rather
                        //    than standing upright beside him
  GRAB_CRASH_KNOCK: 8.0, // the slam's shove down the facing...
  GRAB_CRASH_STUN: 1.6,
  GRAB_CRASH_DMG: 34,
  GRAB_LOCK_STOP: 0.12, // hitstop on the lock (the freeze frames)...
  GRAB_CRASH_STOP: 0.15, // ...and on the crash
  // ---- 1: THE SET-UP (the shoulder lift) ----
  GRAB_LIFT_T: 1.32,      // the whole move
  GRAB_LIFT_TAKE: 0.36,   // where the shoulders are TAKEN (on the deepest beat of the crouch)
  GRAB_LIFT_SET: 0.92,    // ...and where the body is let go — on its feet, and left dizzy
  GRAB_LIFT_DIST: 0.74,   // how far in front the body is hauled to
  GRAB_LIFT_HOLD: 0.80,   // how long the haul has it (s)
  GRAB_LIFT_RISE: 0.30,   // ...and how much longer than the SET the body's get-up is given, so
                          //    it is already standing on the frame the hands come off it
  GRAB_LIFT_STEP: 1.6,    // the step-in before the drop
  // ---- 2: THE SLAM (the ankle grab and the front flip) ----
  GRAB_SLAM_T: 0.96,      // the whole move
  GRAB_SLAM_TAKE: 0.15,   // where the shin is TAKEN (s)
  GRAB_SLAM_JUMP: 8.6,    // ...and the pop he gives himself to ride the body down (u/s): the
                          //    airtime that buys is ~0.52 s, which is what the flip is timed to
  GRAB_SLAM_PUSH: 2.2,    // ...and the small forward drive that goes with it
  GRAB_SLAM_TURN0: 0.17,  // the flip's own window (S): where the rig starts going over...
  GRAB_SLAM_TURN1: 0.67,  // ...and where it comes all the way round — on the slam itself
  GRAB_SLAM_DIST: 0.52,   // how far in front the ANKLE is held through the flip (see the haul — it
                          //    has to stay inside the arms' own reach, which is 0.72)
  GRAB_SLAM_LAND: 1.20,   // ...and how far in front the BODY is planted, which is a longer throw:
                          //    the handover from ankle-on-hands to back-on-deck moves both
  GRAB_SLAM_HOLD: 0.90,   // how long the orbit's haul has it (s)
  GRAB_SLAM_DROP: -9.0,   // the drive INTO the deck it is given on the slam frame (u/s)
  GRAB_SLAM_KNOCK: 10.0,
  GRAB_SLAM_STUN: 2.1,
  GRAB_SLAM_DMG: 46,
  GRAB_STOP: 0.075,       // the hitstop on a take and on the slam (a `max`, like every other)
  // ---- THE MISS (the whiff — the dash lands on empty air; see `poseGrabMiss`) ----
  // It runs long on purpose: the overshoot, the skid, and then a frozen recovery the enemy is
  // free to punish. Two beats of it are the game's rather than the pose's: the hands SNAP SHUT
  // on empty air, and the lead foot SLAPS down to stop the skid.
  GRAB_MISS_CLAMP: 0.50,  // s: where the hands close on nothing (the take's own beat)
  GRAB_MISS_SKID: 0.95,   // s: ...and where the skid stops under the catch-step
  // ...and the miss's own HAND-OFF. Every skill hands its shape back to the ground on
  // `SKILL_POSE_FADE` (0.07 s), which is right for a move that ENDS settled — a take finishes on a
  // hero landing, a knee on a plant. The miss is the one that ends PARKED (see `poseGrabMiss`: the
  // freeze wears the lean he never got to spend), so a 0.07 s cut out of it reads as a snap rather
  // than as him gathering himself. This is its own, longer clock, and the weight is eased (see
  // `updateVisual`) so the parked shape sets back down into the ground pose instead of leaving at a
  // constant rate.
  GRAB_MISS_FADE: 0.30,   // s: the fade-out of the miss's shape (4x the normal hand-off)
  // =========================================================================
  // THE BLOCK — M1 and M2 pressed TOGETHER (see `block` / `startBlock` / `blockCatch` /
  // `blockContact`, and streetwear.js's `poseBlock`). The brief, verbatim:
  //
  //   *"make me able to block if press m1 and m2 at the same time and make the block like the boxing
  //   block and make me when i block i walk not run if i run while blocking or if i block while im
  //   running make me put one arm lower limb over my eyes and i go faster but turning left and right
  //   is slower and if i run into an enemy i shove them aside"*
  //
  // ONE state with TWO shapes, and the speed is what picks between them:
  //
  //   THE GUARD   the BOXING block: both forearms up in front of the face, fists shut, chin down
  //               behind the lead shoulder, the weight on the balls of the feet in the boxer's own
  //               stagger — and it WALKS (`BLOCK_WALK`), which is the brief's *"when i block i walk
  //               not run"* made a number. A punch that arrives inside it is CATCH (`blockCatch`):
  //               no damage, no shove, the body that threw it staggered by its own swing.
  //   THE CHARGE  one arm DOWN, the other up ACROSS THE EYES (`poseBlock`'s charge half), the trunk
  //               folded over the drive — and it goes FASTER than a sprint (`BLOCK_RUSH_SPEED`),
  //               but the line it travels can only be swung at `BLOCK_RUSH_STEER`, which is the
  //               brief's *"i go faster but turning left and right is slower"*. Anything standing
  //               on that line is SHOVED ASIDE (`blockContact`) and the charge runs on through.
  //
  // Both shapes turn the same fists away — a guard is a guard — and both pay NO damage for it: what
  // they cost is that the guard is slow and the charge cannot corner. The way IN is either end of
  // the brief's own sentence: the chord pressed already running (over `BLOCK_RUSH_MIN`) opens as the
  // CHARGE, and pressed from a standstill it opens as the GUARD — where holding forward for
  // `BLOCK_RUSH_T` breaks it into the charge from there.
  BLOCK_CHORD: 0.14,      // s: how soon after the first button the second may land and still count
                          //    as the chord. Under the shortest move's own start (the knee's 0.17),
                          //    so a chord can always take a move back before it has touched anything
  BLOCK_WALK: 3.2,        // THE GUARD's own pace — a walk, and just over the crouch walk
  // ...and WHICH OF THE TWO ARM SHAPES THE GUARD ITSELF WEARS, as a speed band (session 195 — the
  // user's *"make the block animation when im walking slowly normal 2 hands block make the one hand
  // bash block thing only when im running fast"*). The one-arm shape ("the bash" — the charge's
  // forearm up ACROSS the eyes, `blockArm(1)`) used to be picked by `runBlend`, and `wantRun` is
  // already 1 at **1.6 u/s** — a slow walk — so the moment the guard took a step the body stopped
  // wearing the two-handed boxing block. It is picked by SPEED now: below `LO` the block is the
  // two-handed guard whatever else is going on, and by `HI` the body is genuinely running and the
  // right arm goes over the eyes with the left left to the cycle. The band straddles the guard's
  // own top speed (`BLOCK_WALK` 3.2), so the WHOLE of a walking block is inside the two-hand shape,
  // and the charge (13.5) and a sprint are both well past the top of it.
  BLOCK_RUN_LO: 3.4,      // u/s: at or below this, the block is the two-handed boxing guard
  BLOCK_RUN_HI: 6.4,      // ...and at or above this the run is carrying the body (a real run)
  BLOCK_ACCEL: 6,         // ...and how hard it pulls for it (gentle: a step, not a launch)
  BLOCK_TURN: 9,          // rad/s the guard's facing comes round onto the camera's line
  BLOCK_ARC: 1.15,        // the half-angle a punch has to arrive inside to be caught on the guard
  BLOCK_HIT_T: 0.22,      // how long the guard's own absorb jolt plays
  BLOCK_HIT_SHOVE: 2.6,   // what a caught fist does to the body that threw it (a `fold`, no damage)
  BLOCK_HIT_STUN: 0.5,
  BLOCK_HIT_STOP: 0.06,
  BLOCK_RUSH_MIN: 4.6,    // arriving at the block faster than this opens it as the CHARGE
  BLOCK_RUSH_T: 0.42,     // ...and this long of holding FORWARD on the guard breaks into it too
  BLOCK_RUSH_RE: 0.12,    // ...and how long that takes once the guard has already broken once
  BLOCK_RUSH_SPEED: 13.5, // THE CHARGE's own pace: above SPRINT (10.9), so it really is faster
  BLOCK_RUSH_ACCEL: 2.2,  // ...and how hard it drives for it — about half a second of build from the
                          //    walk, so the break into the charge is SEEN happening rather than snapped
  BLOCK_RUSH_STEER: 1.6,  // rad/s the charge's LINE may be swung at — the slow turning
  BLOCK_RUSH_TURN: 6,     // ...and how fast the BODY comes round onto that line
  BLOCK_SHOVE_PAD: 0.6,   // how far past the two boxes touching the charge still catches a body
  // ...and the shove itself. It is measured off the rig rather than guessed: `Enemy.hit` drags a
  // `fold` to a standstill in about a tenth of a second, so the knock has to be an order of
  // magnitude over the lunge's own 2.4 to move a body at all — measured, a fold at 26 slides it
  // **1.14 u** sideways and one at 45 slides it 1.98, against the 0.19 a knock of 4.2 manages. It
  // is the biggest knock in the game on purpose: the other big ones (`COMBAT_KNOCK[3]` 16, the
  // slam's 10) all buy their travel with a LIFT, and this one has to buy it with the horizontal,
  // because a shoulder to the ribs puts a body down and across rather than up.
  BLOCK_SHOVE_KNOCK: 26,  // the shove ASIDE (across the charge's line, not along it)
  BLOCK_SHOVE_AIR: 0.45,  // ...scaled right back for a body that is off the deck, which has a
                          //    tenth of the drag and would otherwise be fired off like a puck
  BLOCK_SHOVE_CATCH: 1.5, // ...and what a body that is ALREADY reeling takes instead
  BLOCK_SHOVE_STUN: 0.75,
  // A body exactly ON the charge's line has no side of its own to be pushed to, and the maths is
  // degenerate there (the side flipped on a rounding error of 1e-16 — measured, a body dead ahead
  // went *away* from the shoulder that hit it). This is the fixed shoulder that breaks the tie: a
  // hair, so a body that IS off the line still goes the way it is standing.
  BLOCK_SHOVE_BIAS: 0.4,
  // ...and the way IN, twice over: the chord pressed TWICE in quick succession TOGGLES the guard
  // (see `guardLatch`), so a guard can be carried hands-free and let go with a jump or a press of
  // either button. This is the window the second press has to land inside.
  BLOCK_TOGGLE_T: 0.5,    // s: how long after the chord comes UP a new chord counts as the second of two
  // =========================================================================
  // THE RUNNING LUNGE (the panther — see `lunge` / `startLunge` / `updateLunge`, and `poseLunge`).
  // !! UNWIRED since session 89 — the user's *"remove the lunge"*. `grab` no longer calls
  // `startLunge`, so state `lunge` can never be entered and none of the constants below are read.
  // Kept whole (like the whirl's block) so the move can be brought back with one line. !!
  // The brief, verbatim:
  //
  //   *"make me if im running fast like above 20 speed and i press m2 make me do a lunge i throw my
  //   self forward and if i fail to grab an enemy if roll and get slowed down a bit and make the
  //   animtion like yk when a panther or a lion or a tiger lunges make it smth like that and if i
  //   land the running grab i take the enemy and we both roll untill i do a jump spreading my arms
  //   and legs and let go of him before that ofc make it momentum friendly"*
  //
  // ONE state and FOUR beats (`lungePhase`): the POUNCE (0), the MISS ROLL (1), the CLINCH ROLL (2)
  // and the SPREAD JUMP (3). What picks between the middle two is whether the pounce found a body.
  // The state owns the horizontal for all four, because the whole move is momentum: it opens at the
  // speed you arrived with (plus a tenth — a pounce is a throw, not a new top speed), the miss roll
  // spends half of it and the clinch roll keeps nine tenths of it, and the release JUMP carries
  // whatever is left straight into the air rather than resetting it. See `updateLunge`.
  LUNGE_MIN: 20,          // u/s: at or over this, M2 USED TO be the lunge rather than the grab (unwired)
  LUNGE_POP: 5.4,         // the low leap it opens with — 0.16 s of rise and 0.44 u of height, so it
                          //    is a pounce and not a jump, and it is still off the deck when it
                          //    arrives at whatever is in front of it
  LUNGE_DRIVE: 1.10,      // ...and the drive: the speed you arrived with, plus a tenth
  LUNGE_FALL: 0.22,       // how much of that drive the pounce has spent by the end of its beat — a
                          //    landing costs speed, and this is what it costs, no more
  LUNGE_T: 0.46,          // the pounce's own clock (a CAP: the beat really ends when the paws find
                          //    the deck — see `updateLunge`)
  LUNGE_REACH: 2.4,       // how far in front the paws reach — the CATCH's own wedge, and it is a
                          //    body's reach rather than a strike's: at this speed the wedge is open
                          //    for four frames, so a pounce that is aimed off the body MISSES it
  LUNGE_ARC: 0.85,        // ...and the half-angle of the wedge
  LUNGE_DROP: 7.0,        // u/s: how hard the catch pulls the leap DOWN. Catching a body in the air
                          //    arrests the flight — the pair go down together, which is the whole
                          //    read of a pounce that lands
  LUNGE_BELOW: 1.9,       // ...and the height band it is looked for in, off the FEET
  LUNGE_ABOVE: 3.4,
  LUNGE_CD: 1.3,
  LUNGE_DMG: 22,
  LUNGE_STUN: 2.2,        // the stun the TAKE is written on, and like the whirl's own hold it is not
                          //    the beat's length — it has to OUTLIVE the whole move, because the
                          //    reaction it sets owns the held body's clock: the moment the reaction
                          //    ends, the body is dropped (`setState` clears the orbit) and the pair
                          //    come apart in the middle of their roll (measured: the first draft read
                          //    1.4, the enemy's own `STUN_MUL` made that 0.98 s, and the body fell
                          //    out of the hold 0.22 s before the end of the 1.2 s roll)
  LUNGE_KNOCK: 2.6,
  // the miss — what the brief calls *"if roll and get slowed down a bit"*
  LUNGE_ROLL_T: 0.66,     // the recovery roll's own clock
  LUNGE_ROLL_KEEP: 0.62,  // what is left of the entry speed when the roll ends. "Slowed down a
                          //    bit" made a number: it sheds a THIRD of the run and no more.
  // ...and the bleed is DERIVED from the two above rather than tuned by hand, so the number the
  // comment above promises is the number the roll actually delivers: an exponential decay toward
  // zero whose rate is `-ln(KEEP)/T` arrives on `KEEP` exactly at `T` whatever the entry speed was.
  LUNGE_ROLL_FRICTION: 0.72, // = -ln(0.62)/0.66
  LUNGE_HOP_V: 2.8,        // the little jump the landing opens with before either roll
  LUNGE_HOP_T: 0.22,       // ...and how long the roll waits for it (the air itself is ~0.17 s)
  LUNGE_BLEND_T: 0.14,     // the pose crossfade from the pounce's lay-out into either roll
  // ---- THE FREE FALL'S ROLL-OUT (session 194 — see `startFreeRoll` in player/lunge.js) ----
  // The user's *"add better landing animation for free fall ... make it i roll ... just make it i land
  // and i do a little parkour roll then get on my feet"*. A skyfall that lands hard does not catch
  // itself on its heels: it goes STRAIGHT into the running lunge's own MISS ROLL (the tuck and the
  // rise to the feet, `poseLunge` phase 1) with no pounce and no little hop in front of it, and comes
  // up standing. These are the three numbers that decide whether a landing earns it, plus the drop the
  // chase anchor takes while the body IS the ball.
  FREE_ROLL_MIN_IMPACT: 0.30, // `landImpact` a landing needs to become a roll rather than a brace.
                              //    Well under a real skyfall's 1.0, so any true high fall qualifies,
                              //    and (like the thud's own 0.28) above the step-downs and hops
  FREE_ROLL_MIN_SPEED: 4.6,   // u/s: a fall that arrives almost straight down has no roll to carry, so
                              //    the drive is raised to this — the body still goes over, it just
                              //    does not do it standing still (a roll has to go FORWARD)
  FREE_ROLL_CARRY: 1.0,       // ...and above that, how much of the fall's own horizontal the roll keeps
                              //    on its line. A free fall is mostly vertical, so this is usually a
                              //    fraction of a run; the roll's own bleed (`LUNGE_ROLL_FRICTION`)
                              //    then spends it exactly as the miss roll always has
  FREE_ROLL_CAM_DROP: 0.55,   // u: how far the chase anchor comes down while the body is a ball (the
                              //    chest-height follow sits well over a body rolling at deck height —
                              //    see `camera.js`; read off `lungeBall`, so it is 0 the moment the
                              //    fold opens back out onto the feet)
  // the landed pair — *"we both roll untill i do a jump spreading my arms and legs"*
  CLINCH_ROLL_MAX: 1.2,   // s: how long the two of them roll at most before the body is let go —
                          //    long enough for ONE whole revolution of the pair, which is the read
                          //    (a grapple roll is a body going over, not a wheel turning), and short
                          //    enough that the roll is a beat of the move rather than a way of
                          //    travelling
  CLINCH_ROLL_KEEP: 0.90, // ...and what the RELEASE JUMP carries of the roll's own speed: a tenth
                          //    is all the leap-off costs. This is what "momentum friendly" is — the
                          //    jump leaves with the roll rather than resetting to the standing one.
  // The roll's own bleed, as a fraction of its speed per second. A rolling body is slowed by the
  // deck rather than stopped, so it is far gentler than the miss roll's: 24 u/s of entry is spent
  // on ~15 u of deck over the 1.2 s, which is less ground than the same run would have covered —
  // the move costs speed without being a handbrake, and the leap-off leaves with ~10.
  CLINCH_ROLL_FRICTION: 0.55,
  // THE BALL the pair roll on. Both bodies turn about a POINT and not about their own hips (a body
  // rotated about its hips swings its extremities through the deck); that point is the tuck's own
  // MINIMUM ENCLOSING CIRCLE, and these three numbers ARE that circle: `PY`/`PZ` are its centre in
  // the rig's own frame (where the origin is the capsule's centre and the deck is at -P.HY) and `R`
  // is its radius. The centre is placed at `deck + R`, so the ball's surface is what touches the deck
  // and the roll rides it for the whole revolution instead of pumping.
  //
  // MEASURED, not authored (every VERTEX of every mesh, in the rig's own frame, the (y,z) cloud
  // wrapped by a grid-refined min-circle solve — the vertices and not the mesh AABB corners, which
  // sit outside the geometry and inflated the first pass by 8%: r 0.718 against this 0.660, i.e. a
  // third of a metre of daylight under the tuck at the worst of the turn), over the three shapes
  // that share this ball — the miss roll's tuck, the clinch roll's hold, and the HELD BODY's own
  // `clinchRoll`:
  //
  //     player, miss tuck      centre (0.359, 0.394)  r 0.617
  //     player, clinch hold    centre (0.317, 0.439)  r 0.654
  //     held body (enemy)      centre (0.330, 0.398)  r 0.622
  //     union                  centre (0.324, 0.425)  r 0.660   <- the numbers below, rounded
  //
  // One ball covers all three, so the whole 4 cm the loosest shape gains over the tightest is float
  // and never clip. The first draft of these was authored blind (-0.40, 0.13, 0.52) and it was the
  // wrong ball twice over: the tuck of the day measured r 1.048 centred 0.54 ABOVE the rig's origin,
  // so the head was sweeping half a metre through the deck at the quarter turns — and the pose was
  // tightened (see the `LUNGE` table's tuck) so that it would not have to be a big one.
  LUNGE_BALL_R: 0.66,     // the tucked body's own radius (u)
  LUNGE_BALL_PY: 0.32,    // ...and where its centre sits in the rig's own frame: ABOVE the origin
  LUNGE_BALL_PZ: 0.43,    //    (the fold throws the mass up and forward of the hips, not below them)
  // ...and a CLEARANCE on top of the radius. Without it the ball's surface sits exactly ON the deck and
  // the tuck's own lowest vertex therefore rides at 0.000 — which is a face lying IN the ground plane,
  // and at low camera angles a face coplanar with the voxel top reads as CLIPPING rather than as
  // contact (seen twice in a render pass, with the true-vertex measure saying the body was never
  // under). Three centimetres of daylight is invisible on a body turning a whole revolution in 0.66 s
  // and it keeps the contact out of the pavement's own plane. (The miss roll's last 28% — where
  // `lungeBall` blends this placement into the standing one and is therefore exact for NEITHER shape —
  // is clamped by the drawn rig instead: see the note at the foot of `updateVisual`.)
  LUNGE_BALL_CLEAR: 0.03,
  LUNGE_BALL_IN: 0.10,    // s: how long the rig takes to drop onto the ball (a landing, not a pop)
  // ...and how long it takes to come back OFF it, which is ONE FRAME and has to be: the leap-off is
  // the frame the body leaves the ball, and the SPREAD shape is not a tuck — its feet are under it,
  // where the tuck's knees are in front of it — so every frame spent half-on the ball is a frame
  // whose feet are under the deck (measured: 0.57 under at the handover, before this was split).
  LUNGE_BALL_OUT: 0.017,
  LUNGE_LEAN: 1.45,       // rad: how far the POUNCE lays the body over at the top of its arc (the
                          //    shape itself is `poseLunge`'s; this is the whole-body lay-out). It is
                          //    the difference between a cat and a dive: at 1.05 (60°) the leap read as
                          //    a steep head-down plunge with the legs under it — measured off the
                          //    render — and at 83° the body is level, which is the lay-out a pouncer
                          //    actually flies in and what lets the trailing legs read as TRAILING
  // How long the hold takes to walk a body caught at the paws' reach in to the chest. It is a CAP
  // and not a clock: the rate is derived per-frame from the gap and the speed actually carried (see
  // `lungeHoldBody`), and this is what stops a slow catch from taking a second over it.
  LUNGE_HOLD_MAX: 0.30,
  // ...and how hard the body is thrown off the leap-off's own let-go (`flight`, ragdolled).
  CLINCH_ROLL_LIFT: 4.6,
  CLINCH_ROLL_MIN: 6.5,   // below this the roll has run out and the body is let go
  CLINCH_ROLL_DIST: 0.95, // how far in front of him a caught body is carried through the
                          //    hop and the walk-in — the roll itself then pins it onto his own
                          //    origin (see `lungeHoldBody`)
  CLINCH_ROLL_KNOCK: 4.5, // the shove the body gets on release (it is left where the roll put it)
  CLINCH_ROLL_STUN: 2.0,
  // ---- THE WALL CLINCH (see `startWallBeat` / `updateWallBeat`, and "THE WALL CLINCH" in
  // src/README.md) ----
  // The user's own brief: *"add a wall attack with fluent animtion it activates with using spaming
  // the wall to combo or doing 5 m1s on the wall ... the player smashes the enemy head to the wall
  // and holds it there and keeps kneeing him in the stomach with each knee to the enemy it becomes
  // faster until it becomes a blur and the enemy gets knocked far away from the wall"*.
  //
  // ENTRY. One tally, three doors, all of them the same count, so the tally the player is watching
  // is the same one whichever way they got there: a wall KICK that comes out (`tryWallKick`), an M1
  // thrown while the body is working a wall (see `feedWallChain` — a grounded chain pressed against
  // a face, or a strike thrown off a slide/climb/run), and — the follow-up brief's own door —
  // **a landed M1 driven into a body** (*"if i keep m1ing the enemy to a wall i start a wall
  // combo"*, fed in `attackContact`). It is deliberately NOT fed by a wall JUMP: "spamming the
  // wall" is the boot and the punches, and a jump is how you leave a wall, not how you hit it.
  // `WALLCHAIN_WINDOW` is how long a tap keeps the count alive — a lapse drops it to zero, so a
  // player who kicks a wall twice, wanders off and comes back is not three quarters of the way into
  // a move they never threw.
  //
  // It is 3.6 s because of what a five-tap string actually costs: a kick throws the body off the
  // face and it has to climb back for the next one, and an M1 pressed against a face runs the M1
  // CHAIN — whose second swing is a CLASH the player has to win or break before the next tap is
  // read (measured: four taps in 2.6 s, with the fifth landing in a clash). The window is the
  // user's *"5 m1s on the wall"* given the room to be thrown deliberately rather than perfectly.
  WALLCHAIN_N: 5,
  WALLCHAIN_WINDOW: 3.6,
  // ...and once the count IS full it stays full until the window lapses (see `tryWallBeat`): the
  // fifth kick usually leaves the body flying away from the face with nothing in reach, so the
  // move retries every frame and fires the moment a wall and a body are both there.
  //
  // WHICH WALL. `WALLBEAT_WALL_PAD` is how close a face has to be to take the move, and it is
  // deliberately looser than `WALL_PAD` (0.2, the attachment radius): the kick that fed the tally
  // pushed the body off the face (see `KICK_PUSH`), so the attacker arrives a stride away from the
  // wall they were just riding and has to be able to take it from there. `WALLBEAT_WALL_TOP` is how
  // far the face has to run above the deck — a wall to be smashed INTO, not a kerb.
  WALLBEAT_WALL_PAD: 0.95,
  WALLBEAT_WALL_TOP: 2.0,
  // ...and the body. `WALLBEAT_TAKE_E` is the horizontal reach the victim may be at (the move is a
  // grab, so it can take one a stride and a half away and walk it in — see the pin's own yank), and
  // `WALLBEAT_DECK_MAX` is how far below the attacker the deck under the pair may be, so the drop
  // into the stage is never a step off a roof.
  WALLBEAT_TAKE_E: 3.2,
  WALLBEAT_DECK_MAX: 3.0,
  // ...and WHOSE WALL. The move's original two doors are both about the ATTACKER working a face
  // (boot it, punch it), so the face the pair is placed on was always FOUND UNDER HIM — one probe,
  // from his own box, with `WALLBEAT_WALL_PAD`. The user's third door (*"if i keep m1ing the enemy
  // to a wall i start a wall combo"*) inverts that: the man is not at the wall, the BODY is, and he
  // is standing behind the body driving it into the stone. So there is a second probe, and it runs
  // off the VICTIM's own box — `WALLBEAT_PUSH_PAD` is how close a face has to be to the body, and
  // it is a TIGHT number on purpose: at 1.1 the body is pressed on the face (a body pushed into a
  // wall is stopped ON it, so `resolveColliders` leaves its front a hair off the stone — measured
  // 0.00 in the live page), and a body merely NEAR a wall must not be dragged half a room sideways
  // to be smashed into one. `WALLBEAT_STAGE_MAX` is the other half of that bargain, read from the
  // attacker's side: how far the take may WALK him onto the stage. The stage sits
  // `WALLBEAT_STAND` back from the face, so with a body pinned on the stone and the attacker's own
  // reach at the chain's own `GRAB_DIST`, the walk is around 0.8 units — a stride. It is a CAP and
  // not a rule, because the frame the body is driven to the stone is usually not the frame the man
  // is square behind it: the tally stays full for its window and the move RETRIES every frame (see
  // `tryWallBeat`), so a body pressed to a face will be taken the moment its driver has closed up
  // rather than being dragged three units to a stage he was never standing behind.
  WALLBEAT_PUSH_PAD: 1.1,
  WALLBEAT_STAGE_MAX: 2.4,
  // THE STAGE, in world units, measured from the FACE (not from the attacker): where the pair is
  // PLACED for the whole move, squared on each other with the victim's back on the stone.
  // `WALLBEAT_STAND` is the attacker's own distance from the face — far enough that the knee's own
  // drive reaches the belly, and back far enough that the two bodies are not standing in each
  // other. It is 1.14 in session 121, DOWN from 1.24, and the reason is the half turn: the victim
  // now faces the man (see the note on `headPin.yaw` in `startWallBeat`) and the rig's
  // head-to-origin offset therefore points the OTHER way, which pushed the pair's own origin gap
  // out by ~0.16 with the stand unchanged. Measured on the posed rigs, the striking knee's joint
  // reaches 0.57 forward of the attacker's origin and the victim's gut is ~0.12 in front of his;
  // so the gap has to come in under ~0.72 for the knee to sink in, and at 1.14 the measured origin
  // gap is 0.80 — the number this move was tuned around. Push the stand much past ~1.30 and the
  // knee runs out of leg and the pair reads as two men standing near a wall rather than on it.
  // `WALLBEAT_HEAD_GAP` is the victim's SKULL against the stone. It is the BACK of
  // the skull that is on the stone (the victim faces the MAN — see the note on `headPin.yaw` in
  // `startWallBeat`), so this is the head's centre-to-back-of-head radius and not its face: measured
  // off the rig at 0.42 (the head box is 0.78 deep, centred on the head bone), against the 0.46 the
  // old face-first staging needed. `WALLBEAT_HEAD_Y` is the NOMINAL height the skull is held at on
  // the face, and it is nominal in one direction only: the pin takes x and z exactly (the pin is
  // `Enemy.headPin`, and the solve there measures the rig's own head bone), and the pair stands on
  // the deck rather than hanging off the pin — see the `wallpin` case in `Enemy.update` — so the
  // head's HEIGHT is whatever the pose's own span is (see `poseHurtWallPin`) and this number is only
  // the height the skull is WALKED in at, and the height the beat FX are read against. It is
  // deliberately set just under the pose's own span, so the press is a press and never a lift.
  WALLBEAT_STAND: 1.14,
  WALLBEAT_HEAD_GAP: 0.42,
  WALLBEAT_HEAD_Y: 1.62,
  // THE THROW. "knocked far away from the wall" is the move's punctuation, so it is a knock of its
  // own rather than the chain's own shove formula: a big flat shove along the face's normal (out
  // and away), a pop of lift so the body is airborne and ragdolled for the whole of the flight, and
  // a long stun — a body that has just been kneed a dozen times should not be back in the fight
  // while the man is still recovering.
  WALLBEAT_KNOCK: 26,
  WALLBEAT_LIFT: 7.5,
  WALLBEAT_STUN: 3.2,
  WALLBEAT_DMG: 9,
  // ...and the move's own CLOCK. The phases are named in streetwear.js's `poseWallBeat`; what lives
  // here is their lengths in seconds, and the knee schedule: `knee0` is the first interval, each one
  // is `kneeAccel` of the one before it, and `kneeMin` is the floor the beats can never go under (a
  // shape has to have a frame to be drawn on). The impacts are fired at 0.42 of each interval (see
  // `updateWallBeat`), which is where `poseWallBeat` drives the knee, so the bone position and the
  // sound cannot drift apart.
  //
  // THE RAMP IS TEN PER CENT A BEAT NOW (session 121). It used to be a genuine DOUBLING — the user's
  // original words were *"with each knee to the enemy it becomes faster until it becomes a blur"* —
  // and a doubling is THREE real beats and then five or six at a floor shorter than two frames of
  // the game's own 60 Hz, i.e. the leg stops being animated at all and is aliased into a smear. That
  // is exactly what the read used to be, and watching it back the user called it: *"the speed like
  // increases by 10 not doubles"*. So: `knee0` **0.42 s** (a slow, heavy, obvious first gut knee —
  // the beat the whole move is timed off), each one **0.9 of the one before it**, which over the ten
  // beats is 0.42 → 0.16 and **2.74 s** of knees in all (0.89 s of it before this session, with six
  // of the ten beats inside a blur). Nothing is ever drawn at a floor now, so `kneeMin` is only a
  // guard rail — the schedule's own `blur` therefore comes out 0 on all ten beats and the smear,
  // the damage carry and the camera's closing all stand down together (see `wallBeatSchedule`).
  WALLBEAT: {
    take: 0.36,
    smash: 0.14,
    hold: 0.16,
    knee0: 0.42,
    kneeAccel: 0.9,
    kneeMin: 0.042,
    knees: 10,
    release: 0.34,
    recover: 0.30,
  },
  // the release — the SPREAD JUMP
  LUNGE_JUMP: 9.6,        // the pop off the roll
  LUNGE_JUMP_PUSH: 0.9,   // ...and the last of the roll's drive, kept: the jump is the roll's own
                          //    speed plus a launch, never a reset to the standing jump
  LUNGE_WIND_T: 0.14,     // s: how long the tumble takes to square itself up for the jump, so the
                          //    spread shape is never worn by a body lying on its side
  LUNGE_SPREAD_T: 1.6,    // the spread jump's own clock (it ends when the feet find the deck)
  // ---- skill 2: THE HEAD SCISSOR (the guard and the counter, the leap, the clamp) ----
  SCISSOR_CD: 7.0,
  SCISSOR_GUARD_T: 0.10,  // the block AND the counter: how long the counter window is open. The whole
                          //    of the move's first phase IS the window (a fist that lands inside it is
                          //    caught — see `scissorCatch`), so this number is both the guard's length
                          //    and the size of the counter — 0.10 s is the user's own number, and it is
                          //    a real parry window rather than a stance: six frames to catch the fist.
  SCISSOR_LEAP_T: 0.26,
  // ---- THE CLAMP, re-timed in session 68 (see "2 — THE HEAD SCISSOR" in src/README.md) ----
  // The clamp used to be 0.34 s and the rig turned its whole wind inside it at a flat rate, which
  // is part of what made the move read as a blur. It is longer now because the clamp has three
  // jobs — the legs travelling onto the neck, the bite (which the hitstop freezes), and the swing
  // — and the swing is a WHOLE revolution about the neck, which will not read at all if it is
  // crammed into the tail of the old clock.
  SCISSOR_TWIST_T: 0.46,
  SCISSOR_LAND_T: 0.34,
  SCISSOR_REACH: 3.0,     // how far the leap can take a neck from
  // ...and THE TELL A WHIFF LEAVES (session 161 (cont'd) — see `OUTLINE_CUE_RGB` in enemies.js and
  // `setOutlineTint` in ps1.js): how long the body the move REFUSED wears its red outline. This is
  // the one thing about the miss that is not the player's own body, so it is timed here rather than
  // in the shape: the move is 1.16 s long and the miss is decided on the leap, 0.10 s in, so 0.7 s
  // covers the empty jaws' snap (which fires on `SCISSOR_HIT_AT`, 0.40 of the clamp) and the
  // stumble out of it, and it is gone by the time he is back on his feet.
  SCISSOR_MISS_CUE: 0.7,
  SCISSOR_ARC: 1.35,
  SCISSOR_UP: 2.1,        // the band, off the player's head/feet: the neck is ABOVE the feet
  SCISSOR_DOWN: 0.6,
  SCISSOR_JUMP: 9.5,      // the leap's own lift
  SCISSOR_FWD: 3.4,       // ...and the drive toward the neck, so the legs arrive on it. Deliberately
                          // small: the leap is 0.26 s, and at 6.5 the player crossed the whole gap and
                          // ended INSIDE the body (measured 0.07 u apart) instead of on its neck.
  // ---- THE CLAMP'S OWN GEOMETRY: the pendulum on the neck ----
  // The clamp is not a somersault about the player's own hips any more — it is the body RIGIDLY
  // ROTATING about the opponent's neck (`scissorAnchor`), which is what puts the scissors on the
  // neck instead of sweeping the legs past the opponent's head. Two numbers place it:
  //   * the HOLD — where the player's HIPS sit relative to the neck while the legs are on it: this
  //     far FORWARD of it and this far BELOW it (11 — the user's own measurement for the reference
  //     read: *"place the player's hips off the target's neck (fixed radius, e.g. neck +0.4
  //     forward / +0.15 down)"*). The two legs are then solved onto the neck itself with the
  //     shared two-bone leg IK, so the ankles stay on it however far the swing has turned: the
  //     thing that makes the bite read is that the CONTACT is the pivot, and the pivot is real.
  //   * the SWING — the whole revolution's own velocity profile, in `SCISSOR_SPIN_KEYS` below.
  SCISSOR_NECK_F: 0.40,
  SCISSOR_NECK_D: 0.15,
  // (The clamp's hip HEIGHT itself is the pose's own `SCISSOR.clampHip` — it has to be a constant
  // across the phase, so the pose may not key it — but nothing here needs to know its value: the
  // anchor reads the hips' own offset inside the rig off the live rig on the clamp's first frame.)
  SCISSOR_HIT_AT: 0.40,     // the shins cross here, as a fraction of the clamp: the contact (and its
                            // 0.09 s hitstop, which IS the hold) fires on this frame
  SCISSOR_BITE: 0.085,      // ...and the scissors snap shut over the run-up TO it (`poseScissor`
                            // flicks the shut on `flickKeys`, so the crossing is KNOCKED on rather
                            // than eased — the frame the hitstop freezes is the crossed one)
  // ---- THE HOLD: the victim's neck is TAKEN (see `scissorGrip` / `scissorThrow`) ----
  // The frame the shins cross used to spend the whole move at once: the bite fired a `flight`, which
  // is a reaction whose entire job is to throw a body OFF the thing that struck it, so the man was
  // knocked out of the legs on the very frame the ankles closed. Measured through the live loop
  // before this: the ankles 0.13 u off the skull on the bite frame, 0.61 one frame later, **1.44 by
  // three frames**, and 2.5 u apart by the end of the swing — the body somersaulting about a point
  // the head had already left, which is what the user saw when they asked for the move to "actually
  // grab the enemy head". The hold below is the fix, and it is the WALL CLINCH's own arrangement
  // (`Enemy.headPin`, the `wallpin` state): the move writes where the skull IS, every frame the
  // clamp runs, and the body goes wherever that puts it. The pin's point is `scissorC` — the very
  // number `scissorAnchor` solves the two ankles onto — so the legs and the skull read ONE number
  // and cannot drift apart by a frame of rig lag.
  SCISSOR_HANG_PITCH: -1.35, // the whole-rig lean of a body hanging off a clamped neck: negative
                            // lays it back onto its spine (see `HURT_BODY`), and at 1.35 rad the
                            // pose's own trunk (which curls a little round the grip) comes out at
                            // ~60° from vertical — MEASURED through the live loop, because the two
                            // are not independent: the rig's lean and the shape's own `hipsX`/
                            // `torsoX` add, and an earlier pass at 1.15 with a 0.43 rad trunk curl
                            // netted only 41°, i.e. a body still nearly on its feet. Laid out like
                            // this its feet hang ~0.9 u clear of the deck and its body is a spoke on
                            // the grip rather than a man standing next to one.
  SCISSOR_HANG_U: 1,         // the hold's own 0..1 (`headPin.u`, which the victim's shape is played
                            // on) at its END. One, so the shape's whole arrival happens on the
                            // hold's clock rather than on a fraction of it.
  SCISSOR_HANG_RATE: 3.5,    // ...and how fast it gets there, in u per second: the bite leaves 0.60
                            // of the 0.46 s clamp = 0.28 s, and at 3.5 the limp has fully arrived
                            // just as the throw takes the body off the grip. A body does not go limp
                            // in a frame, and this is the number that decides how much of the hold
                            // is spent arriving rather than hanging.
  SCISSOR_HANG_SAG: 0.6,     // the compression of the CATCH, 0..1, handed to the victim's shape as
                            // its `jolt`: the weight of a body coming onto a clamped neck, and the
                            // one thing that makes the grab read as taking weight rather than as
                            // two rigs that happen to touch.
  SCISSOR_HANG_SAG_T: 0.12,  // s: how long the sag takes to arrive. The weight is there the moment
                            // the legs shut, so it is a fast beat rather than a fade.
  // The clamp's turn: fraction of the clamp → fraction of ONE revolution. Monotonic, and it ends
  // on exactly 1 (≡ 0 mod 2 PI), which is what lets the landing below hand the body straight to its
  // authored feet solve: the rig is square again on the frame the landing starts. The shape of it
  // is the PENDULUM's own — slow while the legs travel onto the neck, fast through the swing,
  // settling onto the feet — rather than the flat rate the old clamp wound at.
  SCISSOR_SPIN_KEYS: [[0, 0], [0.40, 0.14], [0.78, 0.74], [1, 1]],
  SCISSOR_KNOCK: 10.5,    // the throw off the legs
  SCISSOR_LIFT: 9.0,
  SCISSOR_STUN: 1.45,
  SCISSOR_DMG: 24,
  SCISSOR_BLOCK_SHOVE: 3.2,   // what a blocked fist does to the body that threw it
  SCISSOR_BLOCK_STUN: 0.9,
  SCISSOR_STOP: 0.06,
  // ---- THE MISS'S OWN NUMBERS (session 152, REWORKED session 191) ----
  // The whiff, cut a third time. The user's *"make the miss animtion for skill 2 is that he does a
  // front flip if he doesnt catch an enemy he falls on the ground like a ragdoll/stun for 0.67
  // seconds"* replaced the old read entirely. What the whiff used to be (session 152) was a 35° fold
  // over its own lap, unwound on the landing as he caught himself — a stumble, not a fall. It is now
  // a whole front somersault that does not stop, and the deck half of it is a real knock-down:
  //
  //   * THE AIR. The legs are thrown at a neck that is not there, nothing takes the weight, and the
  //     body follows them all the way over: `SCISSOR_MISS_FLIP` is one forward revolution, timed off
  //     the AIRTIME the leap actually bought (the ballistic hang of `SCISSOR_JUMP`), so the turn and
  //     the fall are one motion. It is deliberately SHORT of square by the lie angle — it stops on
  //     `SCISSOR_MISS_DOWN_PITCH`, which is supine — because a body that missed does not come out of
  //     it on its feet; the back takes the deck a quarter turn early.
  //   * THE SNAP. `SCISSOR_MISS_STOP` freezes the body on the frame the shins cross on nothing (a
  //     landed scissor holds the world on that frame because the frame IS the bite; a whiff has the
  //     snap without the bite, and an unheld snap is a frame the eye drops). It is handed to the BODY
  //     rather than the world (`player.hitstop` squashes both — see `main.js`), and it is the only
  //     part of the miss the world takes part in: no flash, no shake, no ring of sparks.
  //   * THE DECK. `SCISSOR_MISS_DOWN` is how long he is DOWN — the user's own 0.67 s, the same
  //     number the enemies' ragdoll clock runs on (`E.RAGDOLL_T`) — and `SCISSOR_MISS_SETTLE` is how
  //     much of it the flop takes (the `down` shape settling onto `DOWNED`). Then
  //     `SCISSOR_MISS_GETUP` is the rise.
  //
  // The deck half wears the game's OWN knocked-down body — `poseHurt`'s `down` and `getup`, the very
  // shapes an enemy wears on its back (see streetwear.js) — so a whiffed player goes down the way
  // everybody else in the street does. `SCISSOR_MISS_REST_T` is the one number that is the player's
  // own: he is placed by his lowest vertex on the deck (`restOnDeck`'s solve, in placement.js) and
  // that correction is eased over this, so the hand-over from the air is the flop itself rather than
  // a jump down onto the back.
  SCISSOR_MISS_STOP: 0.05,
  SCISSOR_MISS_FLIP: 4.733,       // radians: ONE forward revolution (2 PI) short of square by the
                                  // lie angle below, so the body flips forward and lands on its BACK
  SCISSOR_MISS_DOWN_PITCH: -1.55, // the lie it lands in: supine, the `DOWNED` angle (see enemies.js)
  SCISSOR_MISS_SETTLE: 0.34,      // s: the flop — how long the `down` shape takes to reach `DOWNED`
  SCISSOR_MISS_DOWN: 0.67,        // s: how long he is down (the user's number; `E.RAGDOLL_T`'s twin)
  SCISSOR_MISS_GETUP: 0.5,        // s: the rise, out of the `getup` shape and back onto his feet
  SCISSOR_MISS_REST_T: 0.12,      // s: the ease on the deck-rest correction (see placement.js)
  // ...and HOW FAR THE CAMERA COMES DOWN WITH HIM, in world units off the chest-height follow
  // anchor `camera.js` aims at. A knocked-down body is a metre and a half below the point the chase
  // camera is built around, so without this the shot stands over the top of him with his boots on
  // the bottom edge of the frame (measured: the anchor is 1.24 above `pos.y` and a lying body's
  // centre is 0.56 BELOW it, so the eye is ~1.8 above the body it is meant to be looking at). It
  // rides its own eased clock (`camera.js` reads `player.camDrop`), so the drop to the deck and the
  // rise back up are the same two beats the body's own settle and get-up are.
  SCISSOR_MISS_CAM_DROP: 1.85,
  // ...and the curve the somersault is wound on (read by `scissorMissFlipAt`), as a fraction of the
  // revolution by a fraction of the AIRTIME. Slow off the deck (the body has just left it), fastest
  // through the middle, and settling SQUARE by 0.90 of the hang and holding there — so the last
  // frame before the deck is not still turning, and a landing that arrives a frame early is within
  // a couple of degrees of the lie either way.
  SCISSOR_MISS_FLIP_KEYS: [[0, 0], [0.16, 0.09], [0.46, 0.52], [0.72, 0.90], [0.90, 1], [1, 1]],
  // ---- skill 3: THE LAUNCH (the charge, the rising kick, and the body it drags into the sky) ----
  // It was a kip-up for its first ~36 sessions (down onto the back, both palms planted, the legs
  // whipped up over the face) and it is a CHARGE now: he sinks into a deep coil and builds it
  // there, snaps BOTH legs up out of it and off the deck — and a kick that lands does not throw the
  // body away, it takes it WITH him: the player goes up into the sky with the body's face pinned on
  // his soles, and the air combo (`airComboT`) opens on the way up. The names in the code stay
  // `capo` / `CAPO_*` — only the beats changed.
  //
  //   * the CHARGE is long and slow on purpose (0.42 s, the calmest frames in the move): a charge
  //     that arrives as fast as the thing it is charging reads as nothing. It is the anticipation,
  //     and the whole point of it is that the KICK has something to be louder than.
  //   * the KICK is where the contact fires: the legs snap up past vertical together, the body
  //     leaves the deck with them. It is 0.28 s, and that length is the fix the user's *"i think u
  //     made number 3 animtion worst"* bought. At 0.20 s the whole strike — the legs out of the
  //     fold, the arms up off the coil, the trunk opening — was four frames of travel, and four
  //     frames is a flicker: measured on the rig, the arms peaked at **48°/frame** (the old keys
  //     threw them from `upX` 0.72 to -2.80 between `ph` 0 and 0.34) and the hands crossed **0.60 u
  //     of the body in a single frame**. The extra 80 ms is spent on the two channels that need it,
  //     one of which (the arms) now also leaves the coil a beat EARLY — see the note on them in
  //     `poseCapo`'s phase 0. The legs are deliberately left alone: a kick is supposed to snap, and
  //     5.7 frames for the pair's 2.16 rad is the snap.
  //   * the LAUNCH is not a press any more (the user's *"remove the press twice thing"*): a kick
  //     that LANDS opens it on its own frame, so the hit and the launch are the same beat.
  //   * the CARRY is what a landed kick buys: the rise itself, with the body's head pinned to the
  //     soles (`capoCarry` — placed, exactly like the whirl's own orbit).
  CAPO_CD: 3.6,
  CAPO_CHARGE_T: 0.42,    // the wind-up: the coil, and the hold at the bottom of it
  CAPO_KICK_T: 0.28,      // ...then the legs snap up out of it — the kick, and the deck is left.
                          // 0.28, not the 0.20 it ran for its first ~20 sessions: see the note on
                          // this beat in the block above — the strike needs enough frames to be
                          // READ, and four was not enough (the contact is still at `ph` 0.34 of the
                          // beat, so the launch lands on the same shape it always did; it is simply
                          // 27 ms later in absolute time, which nothing downstream can feel)
  CAPO_RECOVER_T: 0.26,   // ...and the whiff: the hop back down and onto his feet
  CAPO_CARRY_T: 0.22,     // a kick that LANDED: how long the rise holds the body on the soles. It is
                          // SHORT on purpose (session 94): the carry is the drag up off the kick, not
                          // a servoed hold — the body is on the feet inside three frames of the
                          // carry starting and then handed straight to the air combo's own juggle
                          // (see `releaseCapoCarry`), which is what carries it the rest of the way
  CAPO_REACH: 3.4,        // the kick's own arc — the legs reach well over the head
  CAPO_ARC: 1.9,
  CAPO_UP: 2.4,
  CAPO_DOWN: 1.1,
  CAPO_KNOCK: 3.4,        // the shove under the kick, and it is SMALL on purpose: the kick's own pop
                          // only has to put the body's face where the soles are, and the LAUNCH does
                          // the rest of the climbing (see `CAPO_LIFT`)
  CAPO_LIFT: 2.6,
  CAPO_STUN: 1.6,         // ...and the stun, which has to outlast the carry: the carry IS the hold
  CAPO_DMG: 26,
  CAPO_KICK_POP: 4.8,     // the pop the kick puts on the PLAYER, so a whiff still leaves the deck
  CAPO_JUMP: 17.0,        // ...and the launch a LANDED kick puts on him. Measured against `GRAVITY`
                          // 33: 17 u/s is 0.52 s of rise and a 4.4 u apex — three body lengths of
                          // sky, launched on the hit frame, which is the user's *"in the hit frame
                          // the player goes high up in the sky"*
  CAPO_JUMP_PUSH: 3.4,    // ...and a little drive along the facing, so the rise travels too
  CAPO_AIR_T: 2.6,        // how long the air combo stays open after it (see `airComboT`) — a CEILING
                          // now rather than the working clock: the idle timer below is what usually
                          // ends it
  CAPO_AIR_HOLD: 1.2,     // ...and how much of it every LANDED air strike buys back
  AIR_IDLE: 0.85,         // ...and the window that ends it far sooner: the user's *"if theres no hit
                          // within 0.85 second the air combo gets canceled"*. Every landed air
                          // strike rewinds it (see `attackContact`), and when it runs out the whole
                          // window shuts on the spot wherever `CAPO_AIR_T` had got to — so a combo
                          // opened and then not fed dies in under a second instead of hanging open
                          // over a body that has already fallen out from under it
  // ---- the CARRY: the body the kick caught, held by the FACE on the player's soles (see
  // `capoCarry`, written by the player and placed by enemies.js) ----
  // The body is not hauled and not servoed: it is PLACED, every axis of it, the same way the
  // whirl's own orbit places a body it has by the throat — the argument there is the argument here
  // (a placed body has no lag to correct, so what the move asks for is exactly what is drawn).
  // What is placed is the HEAD, not the origin: the offset from the body's own origin to its head
  // is MEASURED off the rig every frame (the pose and the whole-rig angle both move it), so the
  // face lands on the boot however the body is hanging.
  CAPO_CARRY_GAP: 0.10,   // how far the face is held OFF the sole (the sole is a surface, not a point)
  CAPO_CARRY_PITCH: 0.55, // the whole-rig angle it hangs at: tipped FORWARD off the boot, so the
                          // body falls away down the FRONT of the player rather than straight down
                          // under him — measured with -0.38 the feet land 0.6 u BEHIND the sole, i.e.
                          // inside his own legs, where the chase camera cannot see them; the FACE
                          // still meets the sole first because it is the head that is placed, not the
                          // origin (see the note above)
  CAPO_CARRY_YAW: 0.35,   // ...and how far it is turned off the player's own facing, so the body
                          // hangs across his line rather than dead in it (it is on screen, not
                          // behind him, from the chase camera)
  CAPO_CARRY_GRAB: 0.05,  // how long the grab takes to YANK the body onto the boot (see `updateVisual`):
                          // the kick throws the body loose across the rest of its own beat, so the
                          // carry opens with the face up to a body and a half away from the sole. It
                          // is a SNAP now, not a walk (session 94 — the user's *"make it fast and
                          // dont make it follow it for ever just make it go the player feet at the
                          // frame where his leg was extenended"*): three frames from the kick's own
                          // extension frame to the face on the soles
  // ---- the air combo's own FLOAT (see `airComboGravity`) ----
  // The window alone is not enough to have a juggle in: the launch's pop is a normal pop against a
  // `GRAVITY` of 33, which is 0.76 s of air, and one pass of the chain (0.29 + 0.44 + 0.44 + 0.41 s)
  // is 1.58 s — so the string could never be finished. The float is ASYMMETRIC: the RISE runs at
  // full gravity (the pop is exactly the pop) and only the FALL is held, at `AIR_COMBO_G` of
  // gravity and then a TERMINAL VELOCITY of `AIR_COMBO_FALL`. Measured with 0.18 / 1.8: 12.5 u/s
  // rises 2.37 u in 0.38 s and the descent of those 2.37 u takes 1.32 s, so the window is
  // **approx 1.7 s of air** against the string's 1.58 — the whole chain fits, with the DOWN SLAM
  // (the air finisher) riding its own drive out of the bottom of it. (Before this the launch was
  // 0.83 s of air against the string's 1.58: measured, exactly ONE air M1 could land.)
  AIR_COMBO_G: 0.18,      // ...and the gravity the chain FALLS on while it is open: the descent
                          // hangs rather than drops, which is what a juggle is
  AIR_COMBO_FALL: 1.8,    // ...and its terminal velocity (u/s), so a juggle started high (a dive
                          // launch, a leap off a roof) hangs as long as one started low instead of
                          // picking up speed all the way down
  CAPO_BANK: 0.12,        // the small roll he picks up in the COIL and spends on the way up (see
                          // `capoBankAt`) — a charge leans onto one leg, and the kick comes off that
                          // leg, so the body is a few degrees over as it goes
  CAPO_STOP: 0.05,

  // ---- THE POLE (the staff you carry) -------------------------------------------------------
  // THE BRIEF, verbatim: *"delete all the pole animtions and there concepts and heres what were
  // gonna do — make it when i grab a pole i dont do the attack instantly i grab the pole normally
  // it has its weight it can slow me down a bit it has durability but it has some specific
  // mechanics / 1) i can throw it with m2 / pressing grab again and it breaks after that ofc / 2)
  // when i press m1 i do an attack flashy animation that looks really really cool and must be moving
  // forward it cannot be stationary / 3) if i cant wall slide while holding the pole / 4) if i
  // double jump with a pole i do an animation where i hold the top of the pole with my left arm and
  // both legs on the pole and my right arm is dangling then if i release the 2nd jump / the double
  // jump i get launched far in the air with super fast speed then the pole breaks ofc (its like the
  // Shaolin Stick Balance)"*.
  //
  // So the staff is a CARRY ITEM now, not a move. The old system was a twenty-beat kata that owned
  // the body for two and a half seconds and snapped the pole at the end of it; that is gone whole —
  // the beats, the routes, the handstand, the plant, the flying rebound, `poleAir`, the shaft's own
  // hitbox readout and the pose that drew any of it. What is left is the prop (pole.js still owns
  // it, still plants one in the world and still has the two half-meshes it breaks into) and this
  // block, which is the whole of the carrying:
  //
  //   THE TAKE      M2 with a staff in front of him PICKS IT UP. No form, no clock, no commitment —
  //                 the staff comes up out of the deck over `POLE_LIFT_T` and settles into the carry.
  //                 The same button still does everything it used to when there is no staff in reach
  //                 (see `grab`), and the M1+M2 chord is still the BLOCK, which is checked first.
  //   THE WEIGHT    carrying it costs the legs (`POLE_CARRY_MUL` on `moveTarget`) and nothing else.
  //                 It is one multiplier on the one number every ground speed in the game reads, so
  //                 the run, the build-up, the braked turn and the slope carry all pay it together.
  //   THE DURABILITY `poleHp` is how much of the staff is left, and one strike spends `POLE_USE` of
  //                 it. At zero the staff SNAPS ON THE STRIKE THAT SPENT IT — the last chop of the
  //                 flurry goes through and the wood goes with it — so the weapon runs out in the
  //                 player's hands rather than quietly disappearing. The throw and the vault's strike
  //                 break it outright (the brief says so of both).
  //   THE FOUR MOVES carry (no key), M1 (`poleatk`), M2 (`polethr`), double jump (`polevlt`).
  //
  // NOTHING HERE IS A STATE EXCEPT THE MOVES. `poleHeld` is an ATTACHMENT — the staff rides the rig
  // across the run, the jump, the slide and the dash, exactly the way the tote's duffel does — so
  // there is no "carrying" state to fall out of, and a man with a staff on his shoulder can still do
  // everything he could without one (minus the wall slide: the brief's third line).
  //
  // THE SHAFT IS THE HITBOX, as it always was. Every other strike in the game is a wedge thrown out
  // of the body, because every other strike IS the body; a staff is a two-metre LINE, so
  // `poleStrikeContact` shortlists with the wedge and then measures each body against the segment
  // between the shaft's own ends (`shaftGap`), exactly the way the grab measures its reach.
  POLE_HP: 5,              // strikes a staff takes before it goes
  POLE_USE: 1,             // ...and what one strike spends of that
  POLE_CARRY_MUL: 0.86,    // what carrying costs the legs — a multiplier on the run's own target
  // ...and HOW MUCH OF THE RUN'S TRUNK TURN THE CARRIED STAFF TAKES. The carry's shaft is authored
  // in the rig's frame for a body STANDING, and a run's lean lives on the torso, so the staff has to
  // be re-expressed in the trunk's frame or the chest turns its back on it (see `trunkDelta` in
  // streetwear.js). It takes a SHARE of that turn rather than all of it: at a sprint the trunk leans
  // up to 0.68 rad, and a staff that leaned by the whole of it would swing out to nearly horizontal
  // once a stride — a carrier's wrist holds the shaft more upright than the chest it hangs off.
  POLE_CARRY_TRUNK: 0.55,
  // ...and the OTHER half of the same problem, which session 185 RETIRED. The old carry was a staff
  // standing UPRIGHT with its butt 0.06 rig off the deck, and a run's hips bob 0.13 rig under it, so
  // the runner had to lift it or drag the butt through the street at the bottom of a stride. The
  // carry is HORIZONTAL at hip height now (`POLE_CARRY` in streetwear.js), so there is no end near
  // the deck to catch and no lift to grade — it stays at 0, and the rod simply bobs with the body it
  // is welded to, which is what a carried rod does. Kept as a number rather than deleted because the
  // machinery behind it (a lift applied as `runBlend` came on) is still the right shape for any
  // future carry that does reach the ground.
  POLE_CARRY_LIFT: 0,
  POLE_TAKE: 0.55,         // how far off the shaft's line the body stands to take it
  POLE_STEP_T: 0.18,       // ...and how long that one step in takes
  // THE HAUL. The staff comes up out of the deck and settles into the carry, and the blend is the
  // same bargaining the old take made: a straight line from "planted out in the world" to "held at
  // his left" runs the shaft through whatever is between them, and what is between them is his own
  // leg. So the haul ARCS (a sine through the middle of the blend) and TILTS about the grip, and
  // both corrections vanish onto the two ends, so neither can pop. The tilt is a rotation ABOUT THE
  // HANDS: translating the shaft instead would move the grip, and the hands are solved onto the grip.
  POLE_LIFT_T: 0.34,       // s the haul takes
  POLE_LIFT_ARC: 0.34,     // how far it arcs the staff UP through the middle of it (rig units)
  POLE_LIFT_TILT: 0.42,    // ...and how far it tilts it about the hands (rad)
  POLE_TURN: 9,            // how fast the body comes onto the staff's line on the way in
  POLE_FADE: 0.10,         // s the pose layer fades in and out on
  // THE STRIKE (M1 — `poleatk`). *"flashy ... and must be moving forward it cannot be stationary"*,
  // and those two clauses are the whole design: the SHAPE is a three-beat flurry with one whole
  // body revolution through it (see `poleHoldStrike` in streetwear.js), and the MOVEMENT is a real
  // forward carry — the move accelerates him down his own facing at `POLE_ATK_V` and holds it for as
  // long as it runs, so the flurry is thrown ACROSS the ground rather than played on a mark.
  //
  // It is applied as a FLOOR on ONE LINE, not an impulse: every frame the strike is on, the speed
  // ALONG the facing is pulled up to `POLE_ATK_V` (and the deck drags it back by `POLE_ATK_DRAG` a
  // second between strikes). An impulse would stack — the old form's strikes came in tight pairs and
  // a whole route carried the body 15.5 u on the added velocity alone. A floor cannot: a second beat
  // re-aims a surge that is still running instead of adding to it, which is what makes three beats
  // travel about as far as one.
  //
  // ...AND IT IS A FLOOR ON THE TOTAL, not on one component of it (session 155 — the user's *"fix
  // the velocity for the pole attack make it make sense"*). The momentum is split into the part ON
  // the line, which the floor owns, and the part ACROSS it, which is spent at `POLE_ATK_GRIP`: the
  // stick can CARVE the line but it can never add a velocity of its own, so nothing stacks. The old
  // form only compared the along-facing part against `POLE_ATK_V`, so a direction held off the line
  // left its own momentum sitting across while the floor pushed a fresh surge down — measured,
  // holding BACK through a strike took his speed to **19.9** u/s, past the move's own carry.
  POLE_ATK_T: 0.80,        // the strike's own clock
  // HOW FAST THE CARRY IS, and it is a STRIDE rather than a speed of its own. The old 17 was over
  // half again the run's own `SPRINT` (10.9), so the most committed thing a man with a staff could
  // do was travel faster than his legs had ever carried him — the user's *"fix the velocity for the
  // pole attack make it make sense"*. 15 is a stride and a half: it still out-distances a run by
  // enough that the flurry visibly THROWS him down the line, and it is a number a body is producing.
  POLE_ATK_V: 15,          // how fast it carries him forward (u/s)
  POLE_ATK_ACCEL: 34,      // ...and how hard it pulls up to that (reaches it in ~0.44 s of the 0.80)
  POLE_ATK_DRAG: 0.30,     // what the deck takes off the part of it that is ON the line (1/s)
  // ...and what it takes off the part that is ACROSS it. The flurry is thrown down a LINE (every
  // beat's hitbox reads `facing`, and so does the carry), so a stick held through the move CARVES
  // that line — the aim is swung at `POLE_ATK_SPIN` — but it may never ADD a velocity of its own to
  // it. That is the bug this number fixes: the carry used to be a floor on the speed along the
  // facing ONLY, so a player who held a direction off the line left the whole of his old momentum
  // sitting across the new one while the floor pushed a fresh surge down it, and the two summed.
  // Measured before the fix, holding BACK through a strike: his speed climbed from the carry's own
  // 17 u/s to **19.9** — the fastest way to travel with the wood in his hands was to fight the move.
  // Measured after: the off-line part is spent at 8/s, and a sweep of all sixteen held directions
  // through a whole strike peaks at **15.0–15.2** — the carry's own 15 — so nothing a player does
  // with the stick can put him past it.
  POLE_ATK_GRIP: 8,        // (1/s) how fast the momentum ACROSS the line is spent
  POLE_ATK_CD: 0.16,       // lockout between strikes, so the button cannot spam them
  POLE_ATK_SPIN: 9,        // how fast the body comes round onto its own line while striking
  // HOW NEAR THE WOOD HAS TO HAVE PASSED a body for it to count. It is deliberately generous, and
  // it was MEASURED rather than guessed: the flurry is a body turning a full revolution with a
  // two-metre rod in its hands, so the rod's tip sweeps a circle of radius ~1.9 about him and any
  // body inside that circle is a body the rod went through — the sampled lines are only three arcs
  // of that circle, so a body that the rod genuinely passed can sit a metre and a bit off the
  // particular lines the beats land on. Measured against a body planted dead ahead: driven in, the
  // collision slides a body around the charge to his RIGHT while the staff is carried at his LEFT,
  // and the closest the rod's line ever comes to that body's chest is **1.32** — so a tolerance of
  // 1.10 missed a body standing inside the swing (a whole press, three beats, 0 damage) while 1.45
  // catches it. It is the rod's own width plus a body's own width plus the arc between two beats.
  POLE_SHAFT_R: 1.45,
  POLE_TRAIL: 14,          // frames of the shaft's own line the beats measure a body against —
                           // 0.23 s at 60 Hz, just past the widest gap between two beats (0.20 s),
                           // so every beat sees the whole arc the wood swept since the last one
  // THE THROW (M2 — `polethr`). *"i can throw it with m2 / pressing grab again and it breaks after
  // that ofc"*. The staff leaves the hand as a real prop on a real ballistic line at
  // `POLE_THROW_V`, rolling about its own length (which is what makes a thrown stick read as
  // thrown), and it BREAKS — on the first body it finds, on the deck it lands on, or when it has
  // flown `POLE_THROW_RANGE`. There is no rebound and no return; the old form's boomerang is gone
  // with the rest of it.
  POLE_THROW_T: 1.20,      // the throw's own clock
  POLE_THROW_V: 34,        // u/s it leaves the hand at
  POLE_THROW_UP: 5.0,      // ...and the rise it leaves on
  POLE_THROW_G: 24,        // ...and how hard the line sags
  POLE_THROW_SPIN: 3.4,    // turns per second the thrown shaft rolls about its own length
  POLE_THROW_RANGE: 40,    // how far it flies before it breaks of its own accord
  POLE_THROW_Y: 1.55,      // how high above the feet it leaves the hand
  POLE_THROW_KNOCK: 22,
  POLE_THROW_STUN: 0.7,
  POLE_THROW_DMG: 18,
  // THE BREAK's own shock, shared by the throw's landing, the launch and the strike that runs the
  // staff out of durability: a two-metre stick going off in a fight is a wide, shallow impact, so it
  // reaches further than a fist and moves what it finds less than a finisher.
  POLE_BREAK_R: 3.4,
  POLE_BREAK_KNOCK: 20,
  POLE_BREAK_STUN: 0.7,
  POLE_BREAK_DMG: 20,
  // THE VAULT (the double jump — `polevlt`, session 185). *"make when the player double jump its not
  // holdable anymore the player does a front flip with the stick aiming forward and he stirkes the
  // ground with it wich launches far forward in the air"*. This REPLACES the Shaolin balance, which
  // took the stick, hung the body off it and threw him when the button came UP: the user's *"its not
  // holdable anymore"* is that hang, and what the double jump spends itself on now is a ONE-SHOT
  // front flip with the shaft driven forward and down — the shape is a whole forward revolution of
  // the rig (`POLE_VAULT_FLIP_TIME`, spent by `poleFlipAngle`) and the tip meeting the deck
  // is the beat that throws him (`POLE_VAULT_HIT`), fires the launch and snaps the staff.
  //
  // Nothing the player does after the press changes its timing, so there is no floor and no ceiling
  // to police, and the two numbers that were the balance's whole reason for existing — how long the
  // hold lasts and how long it may be — are gone with it. The LAUNCH's own numbers are unchanged:
  // a forward throw of `POLE_LAUNCH_V` and a rise of `POLE_LAUNCH_UP`, and the forward throw is
  // deliberately OVER the run's `MAX_SPEED` (36), which is the whole reason `POLE_LAUNCH_HOLD`
  // exists — the ceiling stands down for that window so the leap has a whole body of speed on it for
  // the frame it is thrown.
  //
  // THE CLOCK AND THE BEAT ARE THE SAME CLOCK. `POLE_VAULT_T` and `POLE_VAULT_FLIP_TIME` are equal,
  // and that is on purpose: the revolution is the move. The flip starts on the press, runs a whole
  // turn, and is over on the same frame the shape hands the body back — so the STRIKE (`_HIT` 0.50)
  // falls on the exact bottom of the revolution, where the rig is inverted and the staff's hands are
  // at their lowest (see `poleHoldVault`, which is authored around that one fact).
  //
  // THE FLIP DIVES INTO THE PLANT. The first half of the move is a FALL (no collision — the guard in
  // `update` stands `moveAndCollide` down — but a real downward acceleration), because a pole vault
  // plants its pole on the way DOWN and is thrown on the way up: the staff's tip is 1.9 units below
  // the grip, so a body that hung in the air through the flip would drive a stick at nothing. The
  // drop is the whole of why the strike reads as a strike. It is its own number rather than
  // `GRAVITY` so that the beat is the same off a hop and off the top of a double jump, and
  // `_FLOOR` is what keeps an INVERTED body's head out of the deck on a press made low: the body
  // never descends below it, and a press made under it simply holds the height it was made at.
  POLE_VAULT_T: 0.60,        // the vault's own clock (s, press to handover)
  POLE_VAULT_HIT: 0.50,      // ...and the share the tip meets the deck on: the launch fires here
  POLE_VAULT_DROP: 26,       // u/s² the flip falls at — he DIVES onto the plant
  POLE_VAULT_FLOOR: 1.6,     // the lowest the body's own centre goes while it is inverted (u above
                             // the deck) — the head is ~1.6 below it in that pose, so this is what
                             // keeps a low press from burying his skull
  POLE_VAULT_FLIP_TIME: 0.60,// s the whole forward revolution takes — its OWN clock, ticked in
                             // `clocks.js` and read through `poleFlipAngle`, because the turn is a
                             // RIG rotation AND the staff's own counter-rotation (see
                             // `poleHoldVault`): both are functions of this one number, so the drawn
                             // body and the aimed wood can never disagree about where in the turn
                             // the frame is.
  POLE_LAUNCH_UP: 33,      // the launch's own rise (u/s) — `GRAVITY` is 33, so this is a second to
                           // the top and 16.5 u of clearance, and a second back down
  POLE_LAUNCH_V: 44,       // ...and the speed it throws him forward at: deliberately OVER the run's
                           // own `MAX_SPEED` (36) — the whole reason `POLE_LAUNCH_HOLD` exists
  POLE_LAUNCH_HOLD: 0.26,  // s the hard speed ceiling stands down for (see above)

  MAX_SPEED: 36,

  // ---- the launch pad ----
  // Stepping on the landmark's pad does not push the player, it *solves* a ballistic arc from
  // where they are standing to a fixed point on the roof (`solveLaunchArc`), and then flies it
  // with gravity exactly as physics would: `vy` and the horizontal velocity are chosen so the
  // arc arrives at the roof at t = D, and D is the smallest one whose whole path clears the
  // tower. It is a real arc, not a scripted tween — the only thing taken away from it is
  // collision (a launch that clipped a face and stopped halfway would be worse than useless).
  LAUNCH_MIN: 2.6,        // shortest flight the solver will consider
  LAUNCH_MAX: 6.5,        // longest (the flight is longer the further you stand from the roof)
  LAUNCH_STEP: 0.08,      // and the resolution it searches at
  LAUNCH_CLEAR: 0.55,     // how far the path must miss the tower's flanks, on top of the body
  LAUNCH_CD: 0.75,        // lockout after a launch, so the pad cannot re-fire on the way out

  // ---- the skyfall ----
  // Jumping off a building is the one time the body is in the air long enough to be a SHAPE
  // rather than a blur, so the air state has a second mode: past `SKYFALL_DELAY` of airtime,
  // with more than `SKYFALL_MIN_DROP` under the feet and actually descending, a fall becomes a
  // SKYFALL — one of the six cruise FALL shapes (streetwear.js; the seventh, `plunge`, is worn by
  // M1 rather than rolled — see `PLUNGE_*` below), picked by `pickFallKind` below and blended into
  // the landing brace as the deck comes up. Physics-wise it is a heavier, faster, less steerable
  // air: a real drop rather than a hop. And everything else you can press is REFUSED inside one —
  // see `canSkill` and the plunge block in `update`.
  SKYFALL_DELAY: 0.42,     // seconds off the ground before a fall counts as a fall at all
  SKYFALL_MIN_DROP: 52,    // ...and this much clear air under the feet (4× the old 13: a HIGH roof)
  SKYFALL_PROBE: 90,       // how far down the world is asked for a surface
  SKYFALL_GRAV: 1.35,      // gravity multiplier (heavier than a jump's)
  SKYFALL_V: 26,           // terminal velocity: a fall settles here and stays
  SKYFALL_AIR: 0.55,       // steering authority, against the air's own 1.0
  SKYFALL_BRACE_T: 0.62,   // seconds-to-impact at which the landing brace starts
  SKYFALL_BRACE_FADE: 0.34,// ...and how long it takes to come all the way on

  // ---- THE PLUNGE (M1 held in a skyfall — see `plunge` in `update`) ----
  // Up here M1 has no chain to feed it and no wall to kick off, and the user asked for the one
  // thing a fall can actually answer: *"make me if i hold m1 i do dive animtion not a dive forward
  // a dive down i dive down"*. So the button is the DIVE, aimed down the fall line — the skyfall's
  // own physics, only steeper and faster, so the shape reads as being thrown at the deck rather
  // than happening to it. It is a MODE of the skyfall rather than a state (see the block in
  // `update`), which is what lets the fall's own shape, brace and landing handover carry on
  // unchanged around it. The shape itself is the seventh FALL kind (streetwear.js's
  // `FALL_KINDS.plunge`), so it eases in and out on the same limb channels as the other six.
  PLUNGE_V: 42,       // terminal velocity of the held plunge (the skyfall's is 26)
  PLUNGE_GRAV: 1.9,   // its gravity multiplier (the skyfall's is 1.35)
  PLUNGE_KILL: 9,     // how fast the horizontal velocity is spent onto the plunge's line

  // ================================================================================================
  // THE SKATEBOARD (session 200 — the user's *"add skateboard and make me able to get on it and do
  // flips with it and stuff ... make the slide mech and dive and all the stuff unqiue for it not the
  // same make able to get on it by pressing E"*)
  //
  // A board is a PROP (inventory.js — a `drop` like the ball, so the boot, the wall, the pickup and
  // the prompt are machinery that already exists), and RIDING it is a mode of the body: the `ride`
  // state. The three things it must NOT be are the things the brief names, so every verb the board
  // has is its own verb and none of them is a re-skin of the one on foot:
  //
  //   * the FEET do not run — they stand ACROSS the deck (see `poseRide`), and the deck is the thing
  //     that moves. There is no run cycle under any of it.
  //   * SHIFT is the POWERSLIDE, not the crouched slide: the board goes SIDEWAYS to its own line and
  //     scrubs the speed off as friction (see `bslide`), where the foot slide is a knee-and-palm
  //     body sliding along its own travel.
  //   * F is THE BOMB, not the flying dive: the board is tucked under a prone body and the drop is
  //     steep and fast (see `bbomb`), where the dive is a head-first glide the camera steers.
  //   * M1 is the TRICK (the flips the brief asks for), where on foot it is the melee chain.
  //
  // ...AND THE BOARD'S OWN HEIGHT IS THE ONE NUMBER THE RIG MOVEMENT NEEDS. Everything else about
  // riding is either the prop's or a pose.
  BOARD_LIFT: 0.234,       // world units the whole rig is RAISED while riding — the board's own
                           // height, wheels' underside to the deck's top face, so the shoes stand on
                           // the deck and the wheels stand on the ground (see `solvePlacement`).
                           // MEASURED off the mesh, not chosen: the wheels hang to -0.195 world units
                           // from the deck's top face (see `boardMesh`), so 0.195 is the number that
                           // puts the wheels ON the road. The mesh itself is authored at -0.130, and
                           // the user's *"make the skate board bigger"* (session 201) is what moved
                           // it: `boardMesh` draws the whole thing through `BOARD_SIZE` (1.5), so the
                           // height scaled with the deck and this is 0.130 x 1.5. At 0.15 the whole
                           // ride FLOATED 0.02 u — measured on the live rig as the deck's bounding box
                           // 0.02 above the ground — which is a board hovering over the road.
                           // `mountBoard` reads the same number off the box it mounts, so the two can
                           // never disagree.
  BOARD_MOUNT_R: 2.4,      // how close a loose board has to be for `E` to step onto it
  BOARD_DISMOUNT_V: 0.75,  // what share of the board's speed the body walks away with (a rolling
                           // dismount keeps rolling; the board keeps the rest and rolls on)
  BOARD_TOP_SPEED: 60,     // the ceiling a ride is clamped to — and it is NOT the mechanism: the
                           // rolling drag is what settles a board (see the block below) and a flank
                           // is what takes it past `MAX_SPEED`. This exists only so that no
                           // compounding of the push, the drag and the deck's own pull can put a
                           // body somewhere the world cannot collide it.
  // ---- THE DECK'S OWN ROLLING (see `tickRideState`) ----
  // A board has no throttle: what it has is a PUSH. `BOARD_PUSH_V` is one kick's worth of speed and
  // `BOARD_PUSH_CAD` is how often the foot can go down, so the feet pumping at 3.3 a second is the
  // engine — and the drag below is what caps it, because a board has no run cap of its own. The
  // drag is deliberately SHAPE-INDEPENDENT of the run's: it is small at a crawl (a board is the
  // freest thing on the deck) and grows with speed, so a pushed board settles in the low teens and a
  // hill can then take it past `MAX_SPEED` — which is the whole reason to be on one.
  BOARD_DRAG: 0.05,        // u/s² of rolling resistance at a crawl — a whisper, so the deck
  BOARD_DRAG_SPD: 0.01,    // ...plus this share of the speed carried: it holds its momentum for
                           // minutes, not seconds (uphill gravity and the powerslide still bite)
  BOARD_PUSH_V: 1.70,      // u/s one kick-push adds
  BOARD_PUSH_CAD: 0.30,    // s between two kicks
  BOARD_PUSH_TOP: 45,      // above this the feet stay on the deck and he just rides
  BOARD_STICK: 0.35,       // extra ground-stick base while aboard, so the deck hugs rolling
                           // terrain at speed instead of bouncing loose off every crest
  BOARD_TUCK_LO: 20,       // the speed the tuck starts coming on
  BOARD_TUCK_HI: 40,       // ...and where it is fully down in it
  // ---- THE CARVE (see `tickRideState`) ----
  // Steering is the SLIDE's bargain — the line is bent and the SPEED IS LEFT ALONE — but a board
  // turns LESS the faster it is going, which is the whole difference between a carve and a skid:
  // `BOARD_TURN` is the rate at a crawl and `BOARD_TURN_FAST` the rate at `BOARD_TURN_FULL`.
  BOARD_TURN: 2.60,        // rad/s the line is bent at, at a crawl
  BOARD_TURN_FAST: 1.15,   // ...and at speed
  BOARD_TURN_FULL: 18,     // the speed the second one is reached by
  BOARD_LEAN: 0.34,        // how far a full-rate carve lays the DECK over (and the body with it)
  BOARD_MANUAL: 0.30,      // how far the deck pitches up when the nose is held off the ground (M2)
  BOARD_MANUAL_TURN: 1.8,  // turn-rate multiplier with the nose up — a manual pivots on the tail,
                           // so the line comes round faster than a flat carve
  // ---- THE OLLIE AND THE TRICKS (M1 — see `startTrick`) ----
  BOARD_POP: 10.5,         // u/s of pop the board gets off the tail — `GRAVITY` is 33, so this is
                           // 0.32 s of rise, 1.67 u of clearance and 0.64 s in the air, which is
                           // the air a trick is thrown in. (The 6.7 u this comment used to claim was
                           // written off a mis-set vertical; measured through the live ticks, an
                           // ollie from the deck tops out 1.67 u over it.)
  OLLIE_CHARGE_MAX: 0.9,   // s of holding to reach a FULL charge — hold as long past it as you like,
  OLLIE_POP_MIN: 0.45,     // a tap hops at this share of the pop...
  OLLIE_POP_MAX: 1.15,     // ...a full hold at this share: a little boost, and it stops there
  TRICK_BOOST: 0.25,       // u/s landing a trick pays, times the tricks thrown since touchdown —
                           // one move is a push, a whole airtime is a launch (clamped by the ride's
                           // own ceiling like every other speed gain)
  GROUND_SCORE: 100,       // points per ground-trick row, times (row + 1), times the airtime's count
  AIR_SCORE: 150,          // ...and per air row: grabs pay more because they only open upstairs
  BOARD_TRICK_CD: 0.18,    // s before the next trick can be asked for
  BOARD_MISS_LOCK: 0.45,   // s the board refuses to be re-mounted after a ride that ended in a bail
  BOARD_MISS_SPEED: 7,     // u/s of a SPIN trick's own speed that a landing under has to stay above,
                           // as a floor and as a share of the speed it was thrown at (see the MISS
                           // note in `tickTrick`), or the deck shoots out from under him
  // ---- THE POWERSLIDE (SHIFT — see `startBSlide`) ----
  // The board is put SIDEWAYS to its own line and the speed is spent by friction. It is a BRAKE and
  // a CARVE at once (the angle is steerable), which is why the wish still bends it — and it is the
  // one move on a board that is not a ride, so it is a state of its own.
  BSLIDE_ENTER_V: 4.0,     // u/s under which there is nothing to slide
  BSLIDE_ANG: 1.05,        // rad the deck is turned off its own line (about 60°)
  BSLIDE_ANG_MIN: 0.45,    // ...at the slow end, growing to it with speed
  BSLIDE_DECEL: 16,        // u/s² the scrub costs (against the slide's 10, and its own drag)
  BSLIDE_DECEL_HI: 26,     // ...at `BSLIDE_FULL`, so a fast powerslide is a hard one
  BSLIDE_FULL: 22,         // the speed the second number is reached by
  BSLIDE_TURN: 1.7,        // rad/s the SLIDE ITSELF may be pointed while it runs
  BSLIDE_MIN_SPEED: 2.6,   // ...and the speed it gives up at
  // ---- THE BOMB (F — see `startBBomb`) ----
  // The board's own dive: prone over the deck, tucked, and STEEPER than a fall — the shape is a
  // body being thrown at the deck rather than a body gliding forward like the flying dive.
  BBOMB_ENTER_V: 5.0,      // u/s of travel under which there is nothing to bomb with
  BBOMB_LAUNCH: 5.5,       // u/s the deck is thrown UP with as the dive opens. It is a small leap
                           // (`GRAVITY` is 33, so 5.5 is 0.17 s of rise and 0.46 u of clearance) and
                           // that is on purpose — the bomb is a move you spend off a LEDGE, where
                           // the 1.55x gravity below turns the fall into the dive. It was 3.4,
                           // which (measured through the live ticks) made the whole move eight
                           // frames — 0.13 s — from the press to the road, which read as a stumble
                           // rather than as a body thrown at the deck.
  BBOMB_GRAV: 1.55,        // gravity multiplier (the skyfall's is 1.35, the plunge's 1.9)
  BBOMB_V: 34,             // terminal velocity
  BBOMB_DRIVE: 6.5,        // u/s² the body keeps pushing itself DOWN the line (it is a bomb, not a
                           // drop: the travel is kept and grown, not spent)
  BBOMB_LAND_KEEP: 0.92,   // what of the bomb's speed the landing keeps
  BBOMB_CD: 0.5,           // s before the next one
  BBOMB_AIR_DROP: 6.0,     // u/s down the air bomb commits to on its opening frame
};
