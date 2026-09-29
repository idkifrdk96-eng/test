import * as THREE from "./three.js";
import { buildPlayerCharacter } from "./charmodel.js";
import { applyWardrobe, wardrobeOverrides, repaintWardrobe } from "./streetwear.js";
import { P, launchArc } from "./player.js";
import { setBodyFlash, setOutlineTint, clearOutlineTint } from "./ps1.js";

// ---------------------------------------------------------------------------
// ENEMIES — the bodies on the other end of the player's M1 chain.
//
// An enemy is the SAME rig the player wears (`buildPlayerCharacter`), driven by the same pose
// library out of its own `userData`: the walk is the run cycle at a walking gait, standing is
// the idle, every reaction is one of `poseHurt`'s six shapes, and the one attack it owns is
// the punch out of `poseAttack`. Nothing here draws a limb of its own — the enemy manager
// decides where the body IS, how it is angled, and which shape it is wearing, and streetwear.js
// decides what that shape looks like. That split is the same bargain the player's states make.
//
// The body's ANGLE is `inner.rotation.x` (positive tips the head forward, so falling on its
// back is negative) and `inner.position.y` sinks it toward the deck — a body lying on its back
// is the standing rig pitched ~85 degrees AND dropped most of its height, which is why the two
// travel together in `HURT_BODY` rather than one being derived from the other. The one extra
// rotation this file DOES own is the finisher's ragdoll: `tumble`/`roll` are added on top of
// that angle (`E.RAGDOLL_*`), so a body flipping through the air is still wearing its shape.
//
// Enemies are built ONE PER FRAME (a fresh rig costs ~40 ms and a clone costs ~280 ms — see the
// notes in streetwear.js), so the first seconds of a session spend a few frames in the loader
// and the fight is ready by the time anyone has run anywhere.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// THE RIGHT-CLICK GRAB's three contact points (see `chestPoint` / `shoulderPoint` / `legPoint`, and
// the player's `grab`). The offset is in RIG units in the bone's own frame — the units streetwear.js
// authors in, where the feet are at y=0, the hips at `HIP_Y` 1.0 and the shoulders at `SHOULDER_Y`
// 1.4 (see `ARM_REACH`). `CHEST_LOCAL` is a step UP the torso from its own origin (the hips — the
// torso bone's origin IS hip height: that is how `poseArmReach` measures the shoulder as
// `SHOULDER_Y - HIP_Y` off it) and a step FORWARD along +z, so a hand solved onto it lands on the
// STERNUM rather than inside the spine. Expressed in the body's own frame, so the trunk's fold and
// the reel of a reaction both carry it.
const CHEST_LOCAL = new THREE.Vector3(0, 0.26, 0.10);

export const E = {
  COUNT: 1,
  HP: 100,
  // How far down the player's spawn facing the body stands. It plants there (see `update`):
  // it never walks, never closes on the player and never gives chase — a stationary body, the
  // user's "it only 1 enemy and make it not move".
  SPAWN_DIST: 6,
  // ...and how far off that line it is stood, so it is not directly behind the player from the
  // camera's own eye (which is where his back is). It is exported as a number of its own because
  // the ARENA's wall (see `ARENA` in world.js and `beginPlay` in main.js) is axis-aligned and the
  // dummy is not: the opening camera yaw is this value NEGATED, which stands the body dead ahead
  // so a wall can be authored square across it.
  SPAWN_SPREAD: 0.34,
  RING: 26,             // how far out they wander from where the player started
  SIGHT: 24,            // ...and how far away one will notice you
  STOP: 2.15,           // how close one wants to be before it plants
  WALK: 3.4,            // ...and the gait it would walk at (nothing walks any more: see `update`)
  ACCEL: 11,
  FRICTION: 11,
  TURN: 7.5,
  JUMP_V: 8.4,
  STEP: P.STEP,
  // Reactions. `FOLD`/`TRIP`/`FLIGHT` are entered by a hit (see `hit`), and each one hands the
  // body on to the next: a fold lets the body stand back up, a trip folds out into LYING on the
  // deck, and a flight lands into the same place from the air.
  FOLD_RAMP: 0.45,      // the fold's beat at its shortest — it runs out over the whole stun
  TRIP_FALL: 0.42,      // stand -> flat, for the sweep
  // HOW LONG A KNOCKED-DOWN BODY LIES ON THE DECK. One number for every entry into `down` — a
  // flight that has just landed, a body DRIVEN into the mat by the slam, and a trip that has
  // finished its fall — because it is the same question in all three: how long is he on the
  // ground before he starts to get up. The user's own ask: *"make the stun time lower make it
  // like 0.5 when hes on the ground"*.
  //
  // It is a FIX rather than a taste change, and the old behaviour is worth spelling out because
  // it was invisible in the tables: the three entries each handed the state a duration of their
  // own (the flight carried its stun in, the slam its own, a trip `DOWN_T` plus what was left of
  // its fall) and then `stepReaction`'s exit gate demanded `hurtT >= DOWN_T + 0.4` — 1.5 s —
  // whatever that duration was. So every knock-down in the game, however light, lay on the deck
  // for a second and a half before the get-up even began: measured, a chain finisher's victim
  // and the uppercut's both. The entries now hand the state THIS clock and the gate IS this
  // clock, so the lie is exactly it and no entry can disagree with the gate. (The knocked-out
  // body's stay-down is deliberately its own, much longer number — see `KO_DOWN_T`.)
  DOWN_LIE: 0.42,
  // The finisher's own clock, for the body it picks UP off the deck. A launch's shape is the
  // flight's, but its arrival is a LIFT rather than an impact, so it is spread over the first
  // tenth of this (see `poseHurtLaunch`) — four or five frames of hips coming off the mat, instead
  // of the one frame they used to take. It is also short enough that the shape is fully settled on
  // `FALLEN` (the flight's tail, at 0.68 of t) before the shortest launch there is (an M1 landing
  // on a body already down: ~0.39 s of air at `GRAVITY`) can arrive back on the deck — otherwise
  // the landing would pop the hips up from wherever the flight had got to.
  LAUNCH_T: 0.55,
  // ...and THE PAD's own lockout for an ENEMY (session 174 — the user's *"make the dummy get
  // launched from the jump pad normaly like a player"*). The same number as the player's own
  // `P.LAUNCH_CD`: it is the same plate, and the reason it exists is the same one — the body
  // spends its first frames rising off the plate it is still standing over, so without a lockout
  // the pad would fire it again on the way out.
  PAD_CD: 0.75,
  // How long each get-up takes, by variant (the shapes are in streetwear.js, the pick is
  // `pickGetup`). They are one list because the LENGTH is part of the shape: the kip-up is a whip
  // and is the shortest thing here by a third, and the sit-up is a body with nothing left in it
  // and is the longest. `getup` is the quick roll-up the rig always had, and is the fallback.
  //
  // SCRAPPED OFF AROUND THE OLD SHAPE (session 155 — the user's *"make the dummy get up animation
  // faster and smoother"*). Every one of them lost about a quarter of its clock — a body getting up
  // off the deck in a fight is a beat, not a routine, and at these lengths a body that had been
  // knocked down spent a full second and a half lying and rising while the player stood over it.
  // The RATIOS are the old ones (the kip is still the whip and the sit-up is still the slowest, and
  // each one's move is still keyed against its own beats — the keys are shares of the clock, not
  // seconds, so a shorter clock re-times every beat proportionally rather than truncating the tail),
  // which is why nothing had to be re-authored: the shape is the same shape, played quicker.
  GETUP_T: { getup: 0.72, getupKip: 0.50, getupRoll: 0.86, getupSit: 1.06 },
  KO_DOWN_T: 3.4,       // knocked out flat, then back on its feet
  KO_HP: 35,
  // The AIR COMBO's hand on a body (the player's `airComboOpen` → `comboY`): while the window is
  // open, a body off the deck and still hittable RIDES the player's own altitude instead of falling
  // away from him — the user's *"make the air combo make the enemy Y the same as the player but in a
  // smooth motion"*. The body takes the player's own CLIMB as its vertical velocity (so the two rise
  // and fall together), and `COMBO_PULL` then draws it onto his altitude: an eased draw onto a moving
  // target cannot overshoot, which is what keeps the follow smooth rather than magnetic. The rate is
  // the throat carry's own (see the carried branch in `update`).
  COMBO_PULL: 12,       // how fast a juggled body is drawn onto the player's own altitude
  // ...and the LAUNCH's own carry (skill 3 — see `player.capoContact` and the `capoCarry` branch in
  // `update`). That one PLACES the body — its head is solved onto the player's own SOLES every frame
  // — so the only thing here is how fast the BODY's hang (its whole-rig angle) is brought onto the
  // move's: the body the kick caught is a ragdoll mid-tumble, and snapping from a tumble onto a
  // boot in one frame is a teleport. The HEAD is exact from the first frame either way — the
  // placement solves for it — so what this buys is the settle of the hang, not the contact.
  CAPO_CARRY_TURN: 16,
  // ...and every stun the enemy TAKES is scaled by this at the door (`hit`), so *"make the enemy
  // stun lower"* is one knob rather than a dozen call sites' own numbers.
  STUN_MUL: 0.7,
  // ...and HOW LONG A BODY NEEDS TO SHAKE IT OFF once the stun is over (session 191). Without
  // this a body came out of a reaction with its own attack cooldown wherever it had been left, so
  // one that was hit while its punch was charged punched on the very frame it stood back up —
  // measured, a `fold` ending at 0.52 s with `atkCd` already 0 threw a fist on frame 32. Every
  // route back to `idle` out of a reaction now spends this first (see `standUp`), so a stun is a
  // beat the player can actually use rather than a gap that closes itself.
  STUN_RECOVER: 0.5,
  // The reaction layer's own blend, and it is a SEPARATE CLOCK from the shape's: this is how
  // long the body takes to cross from its walk/idle base onto the reaction at all. It has to be
  // short — three frames, which is also what a hand-drawn animator would spend on the impact —
  // because it is a CUSHION on the front of every hit: the longer it takes, the more the shape's
  // own snap (see `hitKf` in streetwear.js) gets averaged away, and a cushioned hit reads as
  // nothing happening. Blending OUT is slower (0.18) — that one is a recovery, not an impact.
  POSE_IN: 0.04,
  // ...and the HANDOVER fade (`linkPose`): when a reaction lands on a body the chain still HOLDS,
  // the silhouette the rig is actually wearing is carried across into the new one over this long
  // instead of being snapped. A tenth of a second, and the number is bounded above rather than
  // chosen: the reaction it most often feeds is the clinch, whose own beat leads with the head over
  // `CLINCH_BEAT.take` (0.10), so a fade any longer would smear the front of the very animation it
  // is meant to protect. Measured on the switch frame (the worst single-frame rotation change in
  // the whole rig), against the 1.24 rad the knee → clinch handover used to snap: 0.09 rad. The
  // sweep off the clinch's release: 2.12 → 0.13 (the late-throw case) and 0.03 when it is thrown on
  // the beat. The finisher picking a body off the deck: 2.12 → 0.03.
  POSE_LINK: 0.10,
  // The 3rd M1's FALL: the sweep takes the legs out of the body the clinch is holding and throws
  // it up and over, so the chain's own beat is an air flip rather than a fall onto the deck. The
  // hang is the user's "flip the enemy in the air for 0.5 seconds", and it is a solved number
  // rather than a taste one: `LIFT` is exactly the pop that comes back down 0.5 s later under
  // `P.GRAVITY` (2 · v / g = 0.5 → v = g/4 = 8.25), and `SPIN` is exactly one whole turn across
  // that same 0.5 s (2π / 0.5 = 12.57 rad/s), so the body lands the right way up for the deck and
  // the wind-out in `landed` has nothing left to do. It is NOT a ragdoll (`ragdoll` stays false):
  // the 4th M1 has to be able to hit it in the air, which is the whole point of the window.
  FLIP_LIFT: 8.25,
  FLIP_SPIN: 12.57,
  FLIP_T: 0.55,         // ...and the pose clock the shape is spread over (it ends on `FALLEN`)
  // ...and THE UPPERCUT's own pair (SPACE + M1 — see `player.js`'s `UPPER_*` and `poseHurtUpper`).
  // This is the longest air any hit in the game buys: `P.UPPER_LIFT` is 17, which under
  // `P.GRAVITY` 33 is a hang of 2·17/33 ≈ **1.03 s** and a peak of **4.4 units** — the user's
  // *"throws the enemy high up in the air"*, measured rather than guessed, and the reason the lift
  // is solved off the gravity instead of being picked against the shove.
  //
  // `SPIN` is then whatever makes the body come round an EVEN number of times over that hang, so it
  // lands the right way up for the deck: 6.0 rad/s × 1.05 s ≈ 6.3 rad ≈ one whole backward
  // revolution. It is slower than the flip's 12.57 because the flip is solved for HALF a second —
  // the same tumble at this hang would be two and a half turns, which reads as a body being spun on
  // a spit rather than thrown. `T` is the shape's own clock and it is the hang, one for one (see
  // `poseHurtUpper`: the arch arrives, HOLDS through the hang, and comes loose into `FALLEN` as the
  // deck arrives), which is what the `flight` branch in `updatePose` reads it for.
  UPPER_T: 1.05,
  UPPER_SPIN: 6.0,
  // The clinch GRABS: on a clinch hit the body is hauled in to `GRAB_DIST` from the player and
  // held there for the stun, so the player's two hands (which `streetwear.js` keys to the back
  // of an opponent's skull) and this body's head are in the same place. `GRAB_PULL` is how
  // hard the yank is — high enough to close a gap in a couple of frames, low enough that a
  // body already in place does not visibly snap — and `GRAB_RATE` the rate the haul's error is
  // spent at. Both went up with the clinch's grab: the move's hold starts a frame or two after
  // the hit, so a soft exponential approach (the old 7/s spent 0.4 s arriving) left the head
  // still travelling while the hands were already closing on nothing.
  GRAB_DIST: 0.98,
  GRAB_PULL: 24,
  GRAB_RATE: 26,
  // ...and the CARRY's own ceiling (the whirl's run — see `player.whirlGrab`): the haul is fed the
  // carrier's velocity on top of its own correction, so this is only what the error term may ever
  // add, and it is deliberately much larger than a run — a body being carried across the floor has
  // to arrive where the hand says it is, not lag behind it.
  CARRY_PULL: 40,
  // ...and the hold is not the whole stun: the beat has a RELEASE in it (see `CLINCH_BEAT` in
  // streetwear.js, which is where the pose's own copy of this timing lives — the two are read from
  // one object so they cannot drift). From `hold` onwards the haul stops holding and starts
  // SHOVING: the distance it wants grows by `GRAB_OFF`, which walks the body away from the player,
  // so the reaction ends with the victim staggering off the knee instead of parked bent double in
  // front of a man who has already gone back to standing. It is spent at `GRAB_OFF_RATE` and
  // capped at `GRAB_OFF_PUSH`, because a stagger is a step back and not a launch — the same
  // controller with `GRAB_RATE`/`GRAB_PULL` would snap the body half a metre in three frames.
  GRAB_OFF: 0.42,
  GRAB_OFF_RATE: 9,
  GRAB_OFF_PUSH: 2.6,
  // ...and the finisher (M1 #4) throws the body LOOSE. A ragdolled body tumbles end over end
  // about its own X (backwards, the way the punch sends it) and rolls a little as it flies,
  // skips when it hits the deck, and then winds the spin out to a whole turn so it settles flat
  // on its back. `AIR_DRAG` is deliberately gentler than a normal reaction's, because a body
  // that has been knocked clean off its feet should carry — that IS the "push back".
  RAGDOLL_AIR_DRAG: 2.0,
  // THE RAGDOLL'S SPIN IS SOLVED, NOT A CONSTANT RATE (the user's *"the ragdoll stuff for dummy is
  // so bad like he spins around and it has no like actual sense"*). A constant rate makes the number
  // of revolutions a function of how long the body happens to hang, and a body caught out of the
  // sweep's own launch hangs more than twice as long as one punched off the deck: measured, the same
  // 9.2 rad/s was ONE TURN on a clean finisher and TWO FULL TURNS on a juggled one, which is a body
  // spun on a spit rather than thrown. It is the same fix `E.FLIP_SPIN` and `E.UPPER_SPIN` already
  // carry one verb over (the flip is "exactly one whole turn across its half second, so the body
  // lands the right way up"): what is fixed is the TURN, not the rate, and the rate is whatever
  // spends it over the hang the body actually has — asked again after every skip (`ragSpinRate`).
  //
  // Since session 191 the turn is always EXACTLY ONE revolution (it used to be solved against the
  // lie the body had been given, which could come out 0.75, 1.0 or 1.5 turns depending on a
  // coin toss — the same punch throwing bodies that somersaulted vastly different amounts). The lie
  // is no longer this spin's business at all: the body leaves square and the FLOP onto its face or
  // its side is the wind-out after it lands (`setLie`; see `LIE`).
  RAGDOLL_TURNS: 1.0,
  // THE RAGDOLL'S OWN CLOCK — how long a body may be ANIMATING as a ragdoll, in seconds (session
  // 191, the user's *"make the longest ragdoll animation is 0.67"*). It is the one ceiling on the
  // whole loose phase, and everything loose is measured against it:
  //
  //   * the THROW is bounded by it: a hit that ragdolls a body has its pop clamped so the arc it
  //     buys comes back down inside the clock (`P.GRAVITY * RAGDOLL_T / 2` — 11.05 u/s, where the
  //     macaco alone used to hand out 15.5 and the ultimate's blast 20.5, i.e. 0.94 s and 1.24 s of
  //     a body spinning in the sky);
  //   * the SPIN is spent inside it: the rate is solved over `min` of the air it has left and the
  //     clock it has left (`ragSpinTime`), so the one revolution always completes on the clock
  //     whatever the body's hang turns out to be;
  //   * and when the clock IS spent the turn simply STOPPED — a body still in the air (a juggle, a
  //     fall off a roof) rides the rest of it limp instead of tumbling on. The animation is the
  //     clock's; the fall is the world's.
  //
  // Measured before this: the finisher 0.57 s, the knee 0.50, the whirl's launch 1.00, the macaco
  // 1.22 and the ultimate's blast **1.63** — one number for the whole family now.
  RAGDOLL_T: 0.67,
  // ...and its LEAN: no body tumbles on a perfect axis (one shoulder is heavier than the other), so
  // a small tilt is drawn and eased in. A small, BOUNDED, eased tilt rather than a roll RATE — a
  // rate laid on top of the somersault corkscrews the body, which is the other half of the same
  // complaint (*rollRate* was 0.35-0.77 rad/s of ever-accumulating sideways spin all the way down).
  RAGDOLL_LEAN: 0.28,      // rad the tilt is drawn from
  RAGDOLL_LEAN_RATE: 2.4,  // ...and how fast it eases in
  ROLL_MAX: 1.1,         // rad/s of randomised sideways wobble (the FLIP's and the UPPERCUT's)
  BOUNCES: 2,            // how many times it skips before it stays down
  BOUNCE: 0.34,          // how much of the landing impact the first skip gives back
  SETTLE: 8,             // how fast the tumble winds out to a whole turn once it lands
  TUMBLE_HARD: 3.2,      // ...and how hard it has to hit the deck for a skip to happen
  // How long a get-up spends rolling a body that settled in any lie but `back` onto its back
  // before the move it picked can start (see `LIE` / `getupLead`). Trimmed with the moves themselves
  // (session 155): it is a beat on the front of a get-up that is now a quarter shorter, so leaving it
  // at 0.34 would have made the roll the longest part of getting up.
  LIE_ROLL_T: 0.24,
  // The enemy's own attack: the punch out of the player's own table (so its reach and its pose
  // can never disagree), thrown on a cooldown at anything inside `REACH`.
  ATK_CD: 2.4,
  ATK_RANGE: 2.9,
  ATK_DMG: 7,
  ATK_PUSH: 5.2,
  ATK_UP: 1.6,
  ATK_ARC: 0.7,
  // ...and the vertical band the fist reaches: this body's OWN span (its feet, `pos.y`, to its
  // head, `2 * P.HY`) plus a step of grace either way — the same test the player's own strikes
  // make (see `Enemies.inFront` and `P.COMBAT_UP/DOWN`). Without it a fist thrown at a body
  // standing four metres overhead connected, which is the same "the hitboxes go so high up" the
  // player's side had.
  ATK_BAND_UP: 0.4,
  ATK_BAND_DOWN: 0.4,

  // ---- THE WALL SLAM (see `Enemy.wallSlam`) ----
  // A body THROWN into a wall does not simply stop against it — it goes limp on the face, slides
  // down it and gets up off the deck (the user's own 60-frame breakdown, keyed to 60 fps). It is
  // gated on being THROWN: a body merely shoved into a wall while on its feet is not slammed,
  // because it never left the ground in the first place (see `resolveColliders`).
  WALL_T: 1.0,          // the whole performance, start to stance
  WALL_SPEED: 7.0,      // how fast a thrown body must be going INTO the face to slam
  WALL_SLIDE: 0.09,     // ...the slice of the clock the slide down the wall takes (frames 2-6)
  WALL_MIN_H: 1.4,      // ...and how tall a solid must be to be a wall rather than a kerb
  WALL_STAGGER: 2.4,    // the step it takes clear of the wall on the way back up (frames 46-55)
  WALL_START: 1.8,      // ...and the highest up the face a slide may begin, above the deck

  // ---- THE WALL CLINCH (see "THE WALL CLINCH" in README.md, `Enemy.headPin` and `wallpin`) ----
  // The body's other PIN: the player's wall clinch holds it by the back of the skull pressed into a
  // wall face, and `headPin` is the placement that does it (the LAUNCH's `capoCarry` arrangement,
  // one verb over). `PIN_TURN` is how fast its yaw and hang are brought onto the move's — a pinned
  // body that snapped round in one frame is a body that teleported, and the head is exact either
  // way because the PLACEMENT solves for it. `PIN_PITCH` is the whole-rig lean of the pinned body:
  // POSITIVE, so the body's hips swing back toward the stone while its skull stays pinned. It is a
  // small NUDGE and not the read — since session 121 the victim stands tall with his back of the
  // skull on the wall and his belly open to the man (see `poseHurtWallPin`), and the fold he wears
  // is the pose's own per-knee compression rather than a bend he is held in. A whole-rig pitch
  // swings the LEGS too, and a body whose shins are tilted off a deck it is standing on reads as
  // falling over — which is why this channel stays a nudge.
  PIN_TURN: 14,
  PIN_PITCH: 0.10,
  // ...and the same number for THE HEAD SCISSOR's hold (`headPin.hang`), which needs a much faster
  // one and for a reason that is not a taste: the scissor is a whole REVOLUTION of the attacker
  // about the contact, and the victim's yaw is aimed away from him every frame (see `scissorGrip`),
  // so the target it is chasing sweeps 2 PI in the ~0.28 s the hold lasts — 22 rad/s. The wall
  // clinch's 14/s cannot follow that (measured: the victim's body fell ~1.6 rad behind the man it
  // was supposed to be clear of, which is exactly the overlap the aim exists to avoid), and at 40/s
  // the lag is 22/40 = 0.55 rad — a third of a right angle, well inside the half-turn of clearance
  // the aim buys. This is the ONLY difference between the two holds' easing.
  PIN_TURN_HANG: 40,

  // ---- THE PUSHBACK (see the `pushback` branch in `hit`, and the note there) ----
  // The reaction the FRONT LUNGE forces on a body that is already reeling: a quick backflip, both
  // hands down on the deck, and back on its feet — the user's *"the enemy does a quick backflip
  // then supports him self with 2 hands on the ground then getting up all this is done within
  // 0.75 seconds its doesnt count as a ragdoll btw"*. It is a REACTION and not a ragdoll: the body
  // is never loose, so it stays hittable for the whole of it, and it always ends standing.
  PUSH_T: 0.75,         // the whole performance, end to end — the user's own number
  // ...and the two numbers the USER'S LATER BRIEF added to it — *"make the pushback of the enemy
  // far and make it pushback in a random direction"*:
  PUSH_SPREAD: 2.6,     // how far off the lunge's line the shove may swing, in radians. The draw is
                        // TRIANGULAR (see the roll in the `pushback` branch), so it is usually
                        // straight back and only rarely out at the edge — where the edge is most of
                        // the circle (2.6 rad ≈ 149° either way). See the branch for why.
  PUSH_DRAG: 1.5,       // how fast the shove bleeds off. The reaction drag is EXPONENTIAL
                        // (`approach`), so what a shove carries is `knock / PUSH_DRAG` and not the
                        // linear `v² / 2a` — which is the whole reason this is down beside a ragdoll's
                        // own air drag (2.0). An ordinary reaction's `FRICTION * 1.5` (16.5) caps a
                        // pushback at under half a unit however hard it is thrown.
                        //
                        // The user's *"make the pushback of the enemy far"* put it at 2.6 against
                        // `P.DASH_PUSH_KNOCK` 11 — about **4.2 units**. Their follow-up — *"make the
                        // push back a lot more further a lot a lot more further"* — took it to **1.5**
                        // with the knock at **45**: the shove now carries the body **~20 units**, and
                        // what makes that a LOT rather than a little is that the performance's own
                        // window (`PUSH_T` 0.75 s) is what ends it, so the drag has to be slow enough
                        // to still be moving at the end of it — `(knock / drag) · (1 − e^(−drag·0.75))`,
                        // which is 3.6 units at the old pair and 20.6 at this one. Measured in the
                        // live page, both. The user then took half of it back — *"can u make the
                        // throw back half the size u just edited"* — and `P.DASH_PUSH_KNOCK` is now
                        // **16**, so the same formula gives **7.5 units**: measured 7.5 against 16.2
                        // at 45, with the body still moving when the window closes. The DRAG stays
                        // 1.5 on purpose — the knock is the size of the throw and the drag is only
                        // the shape of the carry inside the 0.75 s, so halving the drag would have
                        // changed how long the body slides rather than how far it goes. It is NOT the pose's clock that changed: the backflip is
                        // still exactly the user's 0.75 s, it just plays out at a run now.

  // ---- THE RIGHT-CLICK GRAB'S OWN REACTION (see the player's `grab`) ----
  // The grab itself owns the player's side (the reach, the grip and the throw are all his), but ONE
  // of its three branches puts something on THIS body that no other move does: being SET UP ON ITS
  // FEET. The shoulder lift hauls a body off the deck by the shoulders and stands it up, and the
  // user's *"when he stands on his feet he does a cartoony dizzy animtion and a ring of starts spin
  // over his head"*. `dizzy` is a REACTION (it stands the body, and holds it there with no AI and no
  // attack for its whole length) and this is how long it lasts — long enough to read as dazed,
  // short enough that the fight goes on.
  DIZZY_T: 2.6,
};

// A tiny keyed curve, eased between its keys: the same shape as streetwear.js's `kf`, but local
// because the WHOLE-RIG angle (and only that) is this file's business — the get-up variants carry
// their own pitch curves below, and they have to be readable next to them.
function ckf(u, keys) {
  const t = u <= 0 ? 0 : u >= 1 ? 1 : u;
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const t0 = keys[i - 1][0], v0 = keys[i - 1][1], t1 = keys[i][0], v1 = keys[i][1];
      const s = t1 - t0 < 1e-6 ? 1 : (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * (s * s * (3 - 2 * s));
    }
  }
  return keys[keys.length - 1][1];
}

// The body's angle and how far it is sunk, per reaction. `pitch` is `inner.rotation.x` in
// radians, `bodyY` is in world units (negative sinks the body toward the deck) and the two are
// NOT independent: the pitch turns the rig about its own origin, so the pose's own angles and
// this pair together decide how high off the deck a body ends up. Every lying entry below is
// therefore MEASURED, not guessed — the deepest of the rig's mesh vertices was read off against
// `pos.y` (the ground the body's own feet stand on) and `bodyY` set so it comes to rest ON the
// deck: a settled body used to sit 0.175 under the pavement. Re-measure the same way after any
// change to `DOWNED`/`FALLEN` in streetwear.js, or to a pitch here.
const HURT_BODY = {
  fold: { pitch: 0.06, bodyY: 0 },
  // THE CHEST HOLD (see `poseHurtChestHold`): the shape is all in the JOINTS — a body taken off its
  // front foot — and the whole-rig angle is only the small backward tip that goes with being
  // hauled, which is the same bargain `clinch` and `whirlDrag` make. Deliberately near zero: a big
  // pitch here is the RIG being rotated, not the body reacting (the user's own note on the clinch).
  chestHold: { pitch: -0.06, bodyY: 0 },
  // ...and THE ANKLE HOLD (`poseHurtAnkleHold`), for a body the right-click has by the shin out of
  // the air. Its whole-rig angle is never used: the slam's haul OWNS that channel (`carryOrbit.lay`
  // — the body has to be swung through the turn), so this one only exists so the table lookup has
  // an answer.
  ankleHold: { pitch: 0, bodyY: 0 },
  // The clinch is the one reaction whose whole-rig angle is nearly ZERO, and that is the point:
  // the shape of a body held by the head is the JOINTS' work (see `CLINCHED` in streetwear.js),
  // and a big pitch here turns the whole rig about the feet, which reads as the enemy being
  // rotated rather than reacting — the user's "youre just turning the angel of the enemy youre
  // not adding animtion". What is left is the small forward lean of a body being pulled in.
  // `bodyY` is INERT here: the clinch has no `angle` curve, so `restOnDeck` is handed a lift of 0
  // and the contact is the measured one. (It used to be -0.30, which did nothing at all.)
  clinch: { pitch: 0.19, bodyY: 0 },
  // ...and the WHIRL's own shape for a body it has by the throat and is DRAGGING round the deck
  // (see `poseHurtWhirlDrag`): the same bargain — the joints do the shape, and the whole-rig angle
  // is only the extra TIP forward that says the body is being hauled after the man rather than
  // doubled over standing still. Its clock is the whirl's, not the stun's (`carryOrbit.ph`, handed
  // in by `updatePose`), so the drag, the hoist and the coil land on the MOVE's own beats.
  whirlDrag: { pitch: 0.32, bodyY: 0 },
  // ...and THE CLINCH ROLL (the running lunge — see `poseHurtClinchRoll`): the same bargain as the
  // two above, and for the same reason — the whole-rig angle belongs to a `carryOrbit.lay` that the
  // MOVE writes every frame, so the reaction's own entry here is inert by construction. It exists so
  // the table lookup has an answer and so the `direct` rule has a pitch to hand over, and both of
  // those numbers are zero because the roll's own turn starts flat.
  clinchRoll: { pitch: 0, bodyY: 0 },
  trip: { pitch: -1.5, bodyY: -0.52 },
  // The sweep is the same fall as the trip — only the shape it STARTS from differs (see
  // `poseHurtSweep`), so it is drawn at the same angle.
  sweep: { pitch: -1.5, bodyY: -0.52 },
  flight: { pitch: -0.95, bodyY: 0 },
  // ...and the same for the launch, which comes off the deck into the same air.
  launch: { pitch: -0.95, bodyY: 0 },
  // ...and for the flip, which comes off its feet out of the clinch into the same air again.
  flip: { pitch: -0.95, bodyY: 0 },
  // ...and for the UPPERCUT's launch, which is thrown off its feet by a rising knee and goes up
  // higher than either of them (see `E.UPPER_*`). Same air, same angle: the ARCH is in the shape's
  // own joints (`poseHurtUpper`), and the whole-rig pitch only says the body is off its feet on its
  // back — a bigger number here would be the RIG being rotated rather than the body reacting.
  upper: { pitch: -0.95, bodyY: 0 },
  down: { pitch: -1.55, bodyY: -0.525 },
  // The get-ups. The plain `getup` is the shape the rig always had (and deliberately has NO
  // `angle`: it keeps the eased path it was tuned on). The three new variants each carry their
  // own curve, and getting up is the one reaction whose read IS the whole-rig angle, so the curve
  // is where the character of each one lives:
  //
  //   * `getupKip`  — the pitch is a full 360° FORWARD TURN (a somersault about the shoulders) and
  //                   it leaves the deck late and comes round fast: the body stays down while the
  //                   legs and hips whip over it, and the turn is what puts him on his feet. It is
  //                   the only reaction in the game whose pitch leaves (-PI, PI); `updatePose`
  //                   snaps whole turns back before easing, so the handover to the idle is a no-op.
  //   * `getupRoll` — a steady monotone drive off the deck, with the hips leading: it is the
  //                   angle of a body pushing itself up on an arm and a knee, so it has no snap.
  //   * `getupSit`  — the pitch barely moves for the first two thirds (the TRUNK is doing all the
  //                   work — see the pose), then comes up as the hips finally leave the deck.
  //
  // `bodyY` on these is a LIFT off the solved deck contact (`restOnDeck`), not a position: 0 means
  // "resting on whatever part is lowest". The kip-up carries a whisper of a lift (a body whose feet
  // catch it can be a centimetre off the deck at the top of the thrust) and the other two none at
  // all — an earlier pass gave the kip a 0.18 hop, and it read as an airborne flip rather than a
  // get-up: the reference has continuous ground contact. All three end at exactly the standing
  // angle and zero lift, because the idle takes over from there.
  // The plain `getup` is on the same solve with NO lift at all (its old `bodyY` ramp was tuned for
  // the feet-only lift and is now moot — the contact is measured, not authored), so all four of
  // these are lift-0-or-a-whisper.
  getup: { pitch: -1.55, bodyY: 0 },
  getupKip: {
    pitch: -1.55, bodyY: 0,
    angle: (u) => ({
      pitch: ckf(u, [[0, -1.55], [0.10, -1.66], [0.26, -2.25], [0.42, -3.10], [0.56, -4.05], [0.70, -5.00], [0.84, -5.80], [1, -6.283185307]]),
      bodyY: ckf(u, [[0, 0], [0.28, 0], [0.44, 0.04], [0.58, 0.02], [0.72, 0], [1, 0]]),
    }),
  },
  getupRoll: {
    pitch: -1.55, bodyY: 0,
    angle: (u) => ({
      pitch: ckf(u, [[0, -1.55], [0.20, -1.42], [0.46, -1.06], [0.70, -0.58], [1, 0]]),
      bodyY: 0,
    }),
  },
  getupSit: {
    pitch: -1.55, bodyY: 0,
    angle: (u) => ({
      pitch: ckf(u, [[0, -1.55], [0.30, -1.46], [0.52, -1.30], [0.74, -0.92], [1, 0]]),
      bodyY: 0,
    }),
  },
  // THE WALL SLAM (see `Enemy.wallSlam`) — the one reaction in the game whose whole-rig angle is
  // a whole PERFORMANCE rather than an entry, which is why it is here with its own curve rather
  // than being eased toward a pitch like the fold or the flight.
  //
  // It is keyed to the user's own frame breakdown at 60 fps, so `u` reads as frame/60:
  //
  //   u 0.00-0.03  f1-2   THE HIT   the body is flat on the face and vertical, and it FREEZES
  //                                 there (the key pair at 0 and 0.05 holds the angle dead still);
  //   u 0.03-0.10  f2-6   THE SLIDE the pitch is still ~0 — it slides down the wall, not along it
  //                                 (`pos.y` is what descends; see `stepReaction`);
  //   u 0.10-0.28  f6-17  THE COLLAPSE it tips over onto the deck, hard and early, and is flat by
  //                                 the time the hips arrive (the pose does the crumple and the
  //                                 head bounce — see `poseHurtWallSlam`);
  //   u 0.28-0.44  f17-26 THE DAZE   dead still on the floor;
  //   u 0.44-0.58  f26-35 THE ANCHOR the torso comes up off a planted hand — slow, then;
  //   u 0.58-0.75  f35-45 THE STRUGGLE it drives up onto its knees (the pose wobbles here);
  //   u 0.75-0.92  f45-55 THE RISE  up onto its feet, uneven, head down (the step CLEAR of the
  //                                 wall is `E.WALL_STAGGER`, in `stepReaction`);
  //   u 0.92-1.00  f55-60 THE SNAP  back onto the combat stance.
  //
  // The pitch is the only thing here: `bodyY` is 0 throughout, because where the body IS on the
  // way down the face is `pos.y`, driven off the same clock in `stepReaction` — a height the
  // curve could not express anyway, since it is measured against the deck the body lands on.
  wallslam: {
    pitch: 0, bodyY: 0,
    angle: (u) => ({
      pitch: ckf(u, [
        [0, 0], [0.05, 0.02], [0.10, 0.03], [0.15, -0.24], [0.20, -0.78], [0.25, -1.30],
        [0.30, -1.55], [0.42, -1.55], [0.536, -1.42], [0.687, -1.06], [0.826, -0.58], [1, 0],
      ]),
      bodyY: 0,
    }),
  },

  // THE PUSHBACK (see the `pushback` branch in `hit`) — the front lunge's own reaction, and the
  // only thing in the game that is a whole performance without being a ragdoll.
  //
  // The whole-rig angle is ONE monotone rotation, and that IS the shape of the move: the pitch
  // tips BACKWARDS (negative — the sign that lays a body onto its spine) all the way round a whole
  // turn, so the body goes over backwards through upside-down, HOLDS there while the hands take the
  // weight, and comes out of it tipped forward onto the feet. `u` reads as t / `E.PUSH_T`:
  //
  //   u 0.00-0.10  THE HIT    the recoil: the body snaps back off the lunge and the arms fly;
  //   u 0.10-0.40  THE FLIP   the somersault, fastest through the middle, with `bodyY` carrying
  //                           the body clear of the deck while it is over (this is the one place
  //                           in the game `bodyY` is a real hop rather than a whisper — see the
  //                           note on the get-ups; without it the solve would roll the body over
  //                           the pavement instead of flipping it);
  //   u 0.40-0.72  THE HANDS the pit of the turn is HELD: the rotation all but stops a whisker past
  //                           upside-down and stays there for a third of a second, because this is
  //                           where the hands plant — the body has to be INVERTED for an arm held
  //                           overhead to point at the deck (see `poseHurtPushback`), and the lift
  //                           goes to zero here so the deck solve can put the palms down and leave
  //                           them there. Measured on the rig: fists at 0.00, crown 0.2-0.5 clear,
  //                           hips up at 1.1-1.2, feet 1.2-2.2 in the air. Holding the pit is also
  //                           what keeps the whole move from reading as a body rolling over its own
  //                           head — the earlier curve ran straight through this window and put the
  //                           palms down on a body that was already nearly prone, which read as a
  //                           belly-flop;
  //   u 0.72-1.00  THE RISE   the legs whip over through the pike (feet come through to the deck,
  //                           the lowest vertex hands off from the palms to the soles at u ~0.79)
  //                           and the body carries the rest of the turn up onto its feet, ending
  //                           exactly on the standing angle, so the idle takes over with nothing to
  //                           smooth.
  //
  // `pitch` is 0 (the standing angle this is authored from) and `bodyY` is a LIFT off the solved
  // deck contact, exactly as the get-ups' is (see `restOnDeck`).
  pushback: {
    pitch: 0, bodyY: 0,
    angle: (u) => ({
      pitch: ckf(u, [
        [0, 0], [0.10, -0.30], [0.20, -1.15], [0.30, -2.20], [0.40, -2.92],
        [0.52, -3.12], [0.60, -3.32], [0.68, -3.80], [0.76, -4.42], [0.84, -5.12],
        [0.92, -5.85], [1, -6.283185307],
      ]),
      // ...and the lift comes back to ZERO as the arms come out (u 0.50) and STAYS there, because
      // from that beat on the body's lowest vertices are its own FISTS (measured — see the plant
      // note on `poseHurtPushback`): the deck solve is what puts the palms down, so a lift here
      // would only float the body off its own hands.
      bodyY: ckf(u, [
        [0, 0], [0.10, 0.06], [0.20, 0.40], [0.30, 0.58], [0.38, 0.34],
        [0.46, 0.05], [0.54, 0], [0.74, 0], [1, 0],
      ]),
    }),
  },
  // THE WALL CLINCH (see `Enemy.headPin` and "THE WALL CLINCH" in README.md): a body held by the
  // back of the skull against a wall while it is kneed in the stomach. Its whole-rig angle is the
  // MOVE's (`headPin.pitch`, eased onto the body in `update` and assigned through the `direct`
  // rule below), so this entry is inert by construction and exists so the table lookup has an
  // answer. The lean is SMALL and positive, and it is a lean of the whole rig rather than the read:
  // the hips and the legs stay under the body (a whole-rig pitch swings the LEGS too, and a body
  // whose shins are tilted off a deck it is standing on looks like it is falling over), and what
  // the body actually does with a knee in it is the pose's own trunk channel — see
  // `poseHurtWallPin`, re-authored in session 121 to STAND the victim up facing the man with his
  // back of the skull on the stone, folding forward around each beat.)
  wallpin: { pitch: 0.10, bodyY: 0 },
  // ...and THE HEAD SCISSOR's own hold (the same `headPin`, with `hang` set — see `player.js`'s
  // `scissorGrip` and "2 — THE HEAD SCISSOR" in README.md). This is the wall pin's whole-rig angle
  // one verb over, and it is the MOVE's rather than this table's for the same reason: the body's
  // lean is `headPin.pitch`, eased on in `update` and assigned through the `direct` rule below, so
  // the number here is inert and exists so the table lookup has an answer. What it IS is the lean
  // itself, kept here so the two files agree on what a body hanging off a clamped neck looks like:
  // 66° back, which puts the victim's feet ~1.5 u behind and off the deck (see `SCISSOR_HANG_PITCH`
  // for the measurement). The body is NOT stood on anything — the `wallpin` ground solve skips a
  // hanging pin — so unlike every other entry in this table there is no deck for it to answer to.
  scissor: { pitch: -1.15, bodyY: 0 },
  // SET UP DAZED (see `Enemy.dizzy` and the player's `grabLift`). The body is on its feet and
  // reeling, so there is no whole-rig angle of its own: the standing angle, no lift, no curve. All
  // of the read is in the SHAPE (`poseHurtDizzy` — the wobble, the loose arms, the lolling head)
  // and in the ring of stars the caller puts over its head. Anything authored here would be the
  // body being *rolled*, which is the one thing this state is not.
  dizzy: { pitch: 0, bodyY: 0 },
};

// ---------------------------------------------------------------------------
// THE LIES — how a body that has been knocked off its feet comes to REST.
//
// A knocked-down body used to end every knock-down flat on its BACK: the ragdoll wound its tumble
// out to the nearest whole turn, and a whole turn from a supine body is a supine body. It now
// settles into one of four lies — the user's "make the ragdoll better he doesnt always have to
// fall in his back" — picked from how it went down (see `pickLie`), and ROTATES into the one it
// picked as the tumble winds out, so the settle is a flop rather than a snap.
//
// The whole-rig angle is two numbers (`inner.rotation.x` and `.z`, written in `update`) and the
// Euler order is XYZ, so the ROLL is applied to the body first and the pitch second. That is what
// lets all four lies be one table of two channels:
//
//   * `back`  — the original: the pitch tips the body backwards onto its spine (-PI/2), no roll.
//   * `prone` — the same shape turned over about the body's own left-right axis. The pitch cannot
//               do it (it would have to pass through standing), so the TUMBLE does: the spin is
//               wound to a whole turn PLUS a half, which lands the chest on the deck instead of
//               the back. The DOWNED sprawl then reads as face-down with no pose change at all.
//   * `sideL` / `sideR` — the rig ROLLED a quarter turn, which stands the body up about its own
//               length: the head swings out to one side and the chest faces the way the body was
//               facing. The pitch has to come back to ~0 for that (a rolled body whose pitch is
//               still -PI/2 is on its back, just crossways), which is why these two wind the
//               tumble to a QUARTER turn instead of a whole one.
//
// `bodyY` is the sink that puts the body's lowest vertex on the deck, MEASURED the same way every
// other lying entry above is (see the note on `HURT_BODY`): a different orientation has a
// different lowest point, and since `groundOn` only ever lifts, a too-deep number is safe where a
// too-shallow one floats.
//
// `lead` is whether a get-up has to roll the body back onto its back before it can start. All four
// get-ups are authored to start on a SUPINE body (they begin exactly on `DOWNED` at pitch -1.55,
// and three of them carry whole-rig `angle` curves that assume it), so a body lying any other way
// spends `E.LIE_ROLL_T` rolling over first — see `getupLead`.
const LIE = {
  back: { turn: 0, roll: 0, bodyY: -0.54, lead: false },
  prone: { turn: Math.PI, roll: 0, bodyY: -0.63, lead: true },
  sideL: { turn: Math.PI / 2, roll: -Math.PI / 2, bodyY: -0.525, lead: true },
  sideR: { turn: Math.PI / 2, roll: Math.PI / 2, bodyY: -0.525, lead: true },
};

// ---------------------------------------------------------------------------
// WHICH LIE A BODY SETTLES INTO — the same "some random, some smart" stack the get-ups and the
// fall shapes use, because a knocked-down body has exactly the same problem: four lies is
// variety, but four EQUAL lies is a coin toss, and the thing that should decide is how the body
// went down.
//
//   SMART — the WEIGHTS. `back` is the solid middle (it is what every knock-down used to be), a
//     body thrown HARD lands on its front (it is going over with nothing left to catch itself
//     with), and the SIDEWAYS WOBBLE it was carrying when it touched down says which side it
//     favours — a body rolling to its left lands on its left. A body that went over BACKWARDS
//     (the sweep's trip) never lands prone, because it is travelling the other way.
//   RANDOM — the ROLL, with the previous lie zeroed so the same one never plays twice running
//     (`liePrev`), the way the get-ups and the falls already work.
function lieWeights(c) {
  const w = c.backwards
    ? { back: 3.4, prone: 0, sideL: 0.8, sideR: 0.8 }
    : { back: 2.6, prone: 1.3, sideL: 0.9, sideR: 0.9 };
  if (c.roll < -0.12) w.sideL += 1.5;
  if (c.roll > 0.12) w.sideR += 1.5;
  if (!c.backwards && c.knock > 9) { w.prone += 1.1; w.back -= 0.7; }
  if (!c.backwards && c.air) w.prone += 0.4;
  return w;
}

function pickLie(c, prev) {
  const w = lieWeights(c);
  if (prev && w[prev] !== undefined) w[prev] = 0;
  let total = 0;
  for (const k in w) if (w[k] > 0) total += w[k];
  // Nothing earned a weight (the numbers above do not actually allow it, but the roll has to
  // return something): fall back to the plainest lie there is.
  if (total <= 0) return prev === "back" ? "prone" : "back";
  let r = Math.random() * total, acc = 0;
  for (const k in w) {
    if (w[k] <= 0) continue;
    acc += w[k];
    if (r <= acc) return k;
  }
  return "back";
}

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
// The LAUNCH's carry (see the branch in `update`): where this body's HEAD ended up with its group
// parked at a known point, which is the whole of the offset the placement needs.
const _capoCarryV = new THREE.Vector3();
const _box = new THREE.Box3();

// ---------------------------------------------------------------------------
// WHICH GET-UP A BODY DOES — the same "some random, some smart" stack the falls use (see
// `fallWeights` in player.js), because a get-up has exactly the same problem: four shapes is
// variety, but four EQUAL shapes is noise, and the thing that should decide is the situation the
// body is getting up out of.
//
//   SMART — the WEIGHTS. A get-up is decided by the body's CONDITION and by how it went down:
//     * a healthy body that was knocked off its feet has the energy to KIP UP — that is the
//       show-off, and it is what the reference clip does. A body at death's door does not;
//     * a body in the middle of its health gets up off one KNEE (the roll) or rolls straight up;
//     * a body that is nearly done — or that has just been knocked OUT — SITS UP, because that is
//       the only get-up it has left: no momentum, all arms, and the slowest of the four;
//     * a body that went down out of the AIR (launched, flipped, juggled) landed hard, so it is
//       less likely to show off and more likely to have to be walked up.
//   A knocked-out body is not allowed to spring at all: its kip weight is forced to zero.
//
//   RANDOM — the ROLL. Among whatever earned a weight the pick is a weighted roll, so the same
//   situation twice still produces different bodies getting up, and the same variant never plays
//   twice running (`prev`), the way the jump, kick and fall variants already work.
//
// The whole thing is pure — no `this`, no rig, no clock — so it can be swept from the live page.
function getupWeights(c) {
  const hp = c.hp01;
  const fresh = hp > 0.62;         // "he has plenty left"
  const hurt = hp < 0.40;          // "he does not"
  const w = {};
  // The show-off: only for a body that has the legs (and the air) for it.
  w.getupKip = fresh ? 3.4 : hurt ? 0 : 1.3;
  if (c.air) w.getupKip -= 1.1;
  if (c.knock > 8) w.getupKip -= 0.7;      // a big launch leaves nothing to spring from
  // Off one knee: the middle-of-the-road get-up, and the one a hard landing pushes you to.
  w.getupRoll = fresh ? 1.1 : hurt ? 1.3 : 2.1;
  if (c.knock > 8) w.getupRoll += 0.9;
  // The end of the road.
  w.getupSit = hurt ? 3.2 : fresh ? 0.5 : 1.5;
  if (c.air) w.getupSit += 0.9;
  // ...and the quick roll-up the rig always had: a solid, plain middle for everything.
  w.getup = fresh ? 1.1 : hurt ? 1.0 : 1.7;
  // Out cold: nothing springy, and getting up at all is an effort.
  if (c.ko) { w.getupKip = 0; w.getupRoll *= 0.5; w.getupSit += 3.4; w.getup += 0.6; }
  return w;
}

function pickGetup(c, prev) {
  const w = getupWeights(c);
  if (prev && w[prev] !== undefined) w[prev] = 0;
  let total = 0;
  for (const k in w) if (w[k] > 0) total += w[k];
  // Nothing earned a weight (every candidate ruled out — which the numbers above do not actually
  // allow, but the roll has to return something): fall back to the plainest get-up there is.
  if (total <= 0) return prev === "getupSit" ? "getup" : "getupSit";
  let r = Math.random() * total, acc = 0;
  for (const k in w) {
    if (w[k] <= 0) continue;
    acc += w[k];
    if (r <= acc) return k;
  }
  return "getup";
}

export class Enemies {
  constructor(scene, world, effects, sfx) {
    this.scene = scene;
    this.world = world;
    this.effects = effects;
    this.sfx = sfx;
    this.list = [];
    this.buildQueue = [];
    this.center = new THREE.Vector3();
    this.spawned = false;
    this.events = [];
  }

  // Where they live: down the CAMERA's line, on the ground, looking back at the player. The old
  // version scattered a ring of three around the start; one body in front of you is the whole
  // fight now (see `E.COUNT`), and in front of you is where you can see it.
  //
  // The camera's line, not the body's: at spawn the body still faces the camera (it only turns on
  // the first input), so "down the facing" would stand the body BEHIND you. `camYaw` is the yaw
  // the camera and every move aim off, and its forward is `-(sin, cos)`, so the body goes at
  // `camYaw + PI`.
  spawn(player) {
    this.center.set(player.pos.x, player.pos.y, player.pos.z);
    const camYaw = isFinite(player.camYaw) ? player.camYaw : (player.facing || 0) + Math.PI;
    for (let i = 0; i < E.COUNT; i++) {
      const e = new Enemy(this.scene, this.world, i);
      // A shallow arc, off to one side by `spread`: dead ahead would put the body directly behind
      // the player from the camera's own eye, which is exactly where his back is.
      const spread = E.SPAWN_SPREAD + (i - (E.COUNT - 1) / 2) * 0.6;
      const d = E.SPAWN_DIST + i * 2.5;
      const dir = camYaw + Math.PI + spread;
      e.place(this.center.x + Math.sin(dir) * d, this.center.z + Math.cos(dir) * d, dir + Math.PI);
      this.list.push(e);
      this.buildQueue.push(e);
    }
    this.spawned = true;
  }

  // One rig per frame, behind everything else, so the build hitch is spread out.
  //
  // ...and a rig that FAILS goes back on the queue and is tried again a beat later. The builder is
  // a big async job and it can come back empty (`buildPlayerCharacter` threw, or produced nothing);
  // `spawn` is the only caller of `build`, and it runs once, so a failed rig used to be PERMANENT —
  // measured on a fresh page: `built` false, `building` false, the body invisible for the life of
  // the page and every strike at it a silent no-op (which is exactly what "the melee does nothing"
  // looks like). The `buildTryT` stamp is what keeps a body that cannot ever build from being
  // retried every frame.
  pump() {
    if (!this.buildQueue.length) return;
    const now = performance.now();
    const e = this.buildQueue.shift();
    if (e.buildTryT > now) { this.buildQueue.push(e); return; }
    e.build().then((ok) => {
      if (!ok && !e.built && !e.building) { e.buildTryT = performance.now() + 1500; this.buildQueue.push(e); }
    }).catch(() => { e.buildTryT = performance.now() + 1500; this.buildQueue.push(e); });
  }

  update(dt, player) {
    this.events.length = 0;
    this.pump();
    for (const e of this.list) e.update(dt, player, this);
  }

  // The one the player is squaring up to: nearest live body inside `range` of the point, with
  // ties going to whatever is closest to straight ahead of (fx, fz). A body that is ragdolling is
  // not a candidate — the chain cannot touch it (see `hit`), so turning the aim onto one would
  // just throw every following move at something nothing can land on.
  //
  // `opts.ragdolls` takes a body that is already limp as a candidate too — the AIR COMBO's own
  // window, which juggles the very body the LAUNCH's kick threw loose (see `player.capoContact`).
  //
  // `opts.airRagdolls` is the narrower half of that, and it is what the two moves that CATCH a body
  // out of the air aim with: skill 1's flying knee (session 155) and skill 2's head scissor
  // (session 190). A loose body counts only while it is still OFF THE DECK, and only inside
  // `opts.ragBand` — a world-Y window of the same shape `inFront`'s band is, and applied to the
  // RAGDOLL ONLY, so aiming at a live body is exactly what it always was. The band is the point:
  // without it the scissor would snatch a body out of the sky from twenty metres under it, and with
  // it the neck the move closes on is one the leap could have reached — the very band its own
  // contact tests (`scissorContact`), so the aim and the bite cannot disagree about who was in
  // reach. A ragdoll LYING ON THE DECK is skipped either way, which is the rule every other caller
  // gets (see `hit`): one body you can pluck out of the air is not the same as one you can scoop up
  // off the pavement.
  nearest(x, z, fx, fz, range, opts) {
    const takeRagdolls = !!(opts && opts.ragdolls);
    const airRagdolls = !!(opts && opts.airRagdolls);
    const ragBand = opts && opts.ragBand;
    let best = null;
    let bestScore = Infinity;
    for (const e of this.list) {
      if (!e.built || e.state === "down" || e.state === "getup") continue;
      if (e.ragdoll && !takeRagdolls) {
        if (!airRagdolls || e.grounded) continue;
        if (ragBand && (e.pos.y > ragBand[1] || e.pos.y + 2 * P.HY < ragBand[0])) continue;
      }
      const dx = e.pos.x - x;
      const dz = e.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const ahead = d > 0.001 ? (dx * fx + dz * fz) / d : 1;
      const score = d * (ahead > 0.1 ? 1 : 1.6);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  // Everything inside a wedge in front of (x, z) looking along (fx, fz) — what a strike tests.  // The wedge starts at the body rather than at a point so a body pressed against you still
  // counts as "in front".
  //
  // `band` is the vertical slice the strike reaches — [lo, hi] in world Y — and it is optional only
  // so a caller with no opinion can skip it. It used to be that nothing passed one, i.e. the wedge
  // ignored height ENTIRELY: a swing thrown at a body standing on a roof four metres up landed on
  // it, and a body on the floor below was "in front" of you as well. The user's words for it were
  // "the hitboxes of the attacks height is insanely broken they go so high up". A body counts only
  // if its own span — from its FEET (`pos.y`, the deck contact: an enemy's `pos.y` is its feet,
  // the player's is its centre) to its head, `2 * P.HY` tall — overlaps the band.
  inFront(x, z, fx, fz, reach, arc, band, opts) {
    const out = [];
    // `opts.ragdolls` — take a body that is already ragdolling too. It is off by default, because
    // the CHAIN must pass through one (see the guard below); it is on for the LAUNCH's own kick,
    // whose job is to ragdoll whatever it catches however many times that body has already been
    // thrown (see `player.capoContact`), and for the AIR COMBO's own window, which juggles the very
    // body that kick left limp (see `player.attackContact`).
    const takeRagdolls = !!(opts && opts.ragdolls);
    for (const e of this.list) {
      // A ragdolling body is not in the wedge: the chain passes THROUGH it (the user's "make the
      // m1s cant hit ragdoll"), so a finisher's launch can never be juggled by the next press.
      // That is the default; `takeRagdolls` is the LAUNCH's and the air combo's own exception.
      if (!e.built || (e.ragdoll && !takeRagdolls)) continue;
      if (band && (e.pos.y > band[1] || e.pos.y + 2 * P.HY < band[0])) continue;
      const dx = e.pos.x - x;
      const dz = e.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      if (d > 0.35) {
        const ahead = (dx * fx + dz * fz) / d;
        if (ahead < Math.cos(arc)) continue;
      }
      out.push(e);
    }
    return out;
  }

  // Everything awake inside a radius — the enemy attack's own test, run from the enemy.
  busy() {
    for (const e of this.list) if (e.built && e.state !== "idle" && e.state !== "down") return true;
    return false;
  }
}

// ---------------------------------------------------------------------------
// THE WHIFF'S OWN TELL
//
// The chain does not touch a RAGDOLL on purpose (`nearest` skips one, `hit` refuses one — the
// user's *"make the m1s cant hit ragdoll"*), which means a move thrown at a body lying right in
// front of you can come up empty by DESIGN. A scissor is the move where that reads worst: it is
// aimed at a neck, so a whiff beside a limp body looks like a dropped input rather than like the
// game's own rule. The answer is the body's own outline: while the cue is live it wears the ink
// in red at a quarter of its alpha (`setOutlineTint` in ps1.js), which is the smallest thing the
// frame can say and is read on the body that got away rather than on the HUD.
//
// The colour is the red the hit FX are drawn in, and the alpha is the user's own number — *"make
// it if that happens like a 25% opacity red outline appears around the enemy"*. The cue is a
// TIMER on the body, like the hit flash beside it: whoever refuses the body does not own how long
// the tell lasts (see `Player`'s miss decision, which arms it via `P.SCISSOR_MISS_CUE`).
const OUTLINE_CUE_RGB = [1.0, 0.13, 0.13];
const OUTLINE_CUE_ALPHA = 0.25;

export class Enemy {
  constructor(scene, world, index) {
    this.scene = scene;
    this.world = world;
    this.index = index;
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.group.visible = false;
    scene.add(this.group);
    this.charMesh = null;
    this.built = false;
    this.building = false;
    this.buildTryT = 0;    // ...and when a FAILED build may be tried again (see `pump`)
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.hp = E.HP;
    this.state = "idle";
    this.stateT = 0;
    this.hurtKind = "fold";
    this.hurtT = 0;
    this.hurtDur = 0;
    this.hurtPose = 0;
    // ...and the shape/clock the fade-out draws (see the note in `updatePose`): the last reaction's
    // own `hurtKind` and `u`, remembered so the layer can be blended OUT of rather than snapped out
    // of. Null until the body is first in a reaction.
    this.reactKind = null;
    this.reactU = null;
    // Which get-up the next knock-down will be (see `pickGetup`), how long that one takes, and
    // what the last one was (so the same one never plays twice running). These are chosen when
    // the body starts to rise, not when it goes down — `hurtHp01`/`hurtKnock`/`hurtAir` are the
    // readings taken at the last hit, and they are what the pick is made from.
    this.getupKind = "getup";
    this.getupT = E.GETUP_T.getup;
    this.getupPrev = null;
    this.hurtHp01 = 1;
    this.hurtKnock = 0;
    this.hurtAir = false;
    this.pitch = 0;
    this.bodyY = 0;
    this.phase = Math.random();
    this.idleTime = Math.random() * 20;
    this.idlePose = 1;
    this.runBlend = 0;
    this.atkT = 0;
    this.atkMove = 0;
    this.atkDone = true;
    this.atkCd = Math.random() * E.ATK_CD;
    this.koT = 0;
    this.launchBonus = 0;
    this.grounded = true;
    // THE PAD (session 174 — see `padLaunch` and the flight branch in `update`): the arc being
    // flown, its clock, and the lockout that keeps the plate from re-firing on the way out. The
    // player's own three (`launch` / `launchT` / `launchCd` in player.js), one body over.
    this.launchArc = null;
    this.launchT = 0;
    this.padCd = 0;
    this.flash = 0;
    // ...and THE WHIFF'S TELL (see `OUTLINE_CUE_RGB`): seconds left of the red ink a body wears
    // when a move refused it on purpose. Armed by whoever does the refusing (the player's scissor
    // miss, see `P.SCISSOR_MISS_CUE`), ticked here with the flash beside it, and driven straight
    // onto the outline at the tail of `update`.
    this.outlineCue = 0;
    // ...and whether that ink is currently ON this body — the way back to the shared ink is a
    // transition, not a per-frame write (see the tail of `update`).
    this.outlineTinted = false;
    this.grabT = 0;
    // The one OVERRIDE the whirl's neck carry writes over the clinch's haul (see
    // `player.whirlGrab`): how far in front the body is held (the clinch's own `E.GRAB_DIST`
    // otherwise). Null for every other route into the clinch, so the reaction is unchanged
    // everywhere except the carry.
    this.grabDist = null;
    // ...and the WALL SLAM's own two readings (see `wallSlam`): how high up the face the body
    // arrived, and the face's outward normal, which is the direction it steps clear on the way
    // back up. Both are written when a slam starts and read for as long as it lasts.
    this.wallY0 = 0;
    this.wallNx = 0;
    this.wallNz = 0;
    // ...and where the body IS while it is being SWUNG (the whirl's whirlwind — see
    // `player.updateWhirl` and the carried branch in `update`): `{x, y, z, yaw}` in WORLD space,
    // written every frame by the player and null for every other route into a clinch. `grabDist`
    // says how far the body is held; this says where it is being held TO, which the haul (a pull
    // toward the carrier) cannot express.
    this.carryOrbit = null;
    // ...and the altitude a JUGGLED body rides (the air combo — see `E.COMBO_CLIMB`): the player's
    // own feet level, written every frame while his window is open and null for every other route
    // into the air, so this is the carry's own arrangement in the vertical.
    this.comboY = null;
    // ...and the LAUNCH's own hold (skill 3 — see `player.capoContact`): the point the player's
    // SOLES are at, written every frame while his carry runs and null for every other route into
    // the air. The hold PLACES the body by its HEAD (measured off the rig on the frame it is
    // placed) rather than by its origin, so the face is on the boot however the body is hanging;
    // `pitch`/`yaw` on it are the hang the body is drawn in.
    this.capoCarry = null;
    // ...and THE WALL CLINCH's own hold (see "THE WALL CLINCH" in README.md): the point the player
    // has this body's HEAD pinned to, pressed against a wall face — `{x, y, z, yaw, pitch, u,
    // jolt}`, written every frame by `player.js` while its wall clinch runs and null for every other
    // route into a reaction. Like `capoCarry` it is a PLACEMENT rather than a haul: the head is
    // solved onto the point from this frame's own measured rig, so the skull is on the wall however
    // the body is hanging. `u` is the move's own hold clock (the pose is drawn on it) and `jolt` is
    // the compression of a body taking a knee in the gut, decaying between the beats.
    this.headPin = null;
    // The handover cross-fade's clock (see `linkPose`): 1 = no fade, the pose is written straight.
    this.poseLink = 1;
    // The ragdoll (see E.RAGDOLL_*). `tumble` is extra rotation about the body's own X on top
    // of `pitch`, `roll` the same about Z, and `tumbleTarget` the whole turn the tumble is
    // wound out to when the body lands (so it ends flat rather than frozen mid-flip).
    this.ragdoll = false;
    // ...and the FLIP (see E.FLIP_*): the 3rd M1 throws the body up and over, and unlike the
    // finisher's ragdoll it leaves it HITTABLE, because the 4th M1 is what is supposed to catch
    // it on the way down. Same `tumble`/`roll` machinery, its own flag.
    this.flip = false;
    this.tumble = 0;
    this.tumbleRate = 0;
    this.tumbleTarget = 0;
    this.roll = 0;
    this.rollRate = 0;
    // ...and the solved ragdoll spin's own bookkeeping (see `ragSpinFor` / `ragSpinRate`): the angle
    // the tumble is solved to arrive at, the small lean it eases to while it is up there, and the
    // CLOCK the whole loose phase is spent on (`E.RAGDOLL_T` — counted up while the body is loose
    // and airborne, and the thing the spin is solved against).
    this.ragTumbleEnd = 0;
    this.ragT = 0;
    this.ragLean = 0;
    // The lie the solved spin is aimed at, picked at LAUNCH rather than at touchdown (the spin has
    // to know where it is going to land), and used in place of `pickLie` by `landed`.
    this.ragLie = null;
    // ...and the sideways wobble is wound out to `rollTarget` rather than to 0, because a body's
    // settled ROLL is part of which way up it ends: see `LIE` (it is 0 for three of the four lies
    // and a quarter turn for the two on a side).
    this.rollTarget = 0;
    // Which way up the body comes to REST (see `LIE` / `pickLie`), and what the last one was, so
    // the same lie never plays twice running — the same guard the get-ups and the fall shapes use.
    this.lie = "back";
    this.liePrev = null;
    this.bounces = 0;
    // The M1 clash's own state on this side (see `clashUpdate`): which move the player brought (it
    // is what picks the fist's target and the free arm's brace), and the two numbers the pose is
    // driven by — how much of the race this body has won, and the spike of its own last press.
    this.clashMove = -1;
    this.clashDrive = 0;
    this.clashJolt = 0;
  }

  async build() {
    if (this.built || this.building) return this.built;
    this.building = true;
    let group = null;
    try {
      group = await buildPlayerCharacter("naked", { height: P.HY * P.BODY_RATIO, footY: -P.HY });
    } catch (e) {
      group = null;
    }
    this.building = false;
    if (!group) return false;
    this.charMesh = group;
    this.inner.add(group);
    const keep = wardrobeOverrides();
    applyWardrobe(ENEMY_PAINT);
    repaintWardrobe(group);
    applyWardrobe(keep);
    this.built = true;
    this.group.visible = true;
    this.settle(true);
    return true;
  }

  place(x, z, yaw) {
    let g = this.world.topBelow(x, z, 400, 900);
    if (!isFinite(g)) g = this.world.terrainHeight ? this.world.terrainHeight(x, z) : 0;
    this.pos.set(x, g, z);
    this.vel.set(0, 0, 0);
    // ...and a placed body is not a body mid-flight: `place` is where a body STARTS (see
    // `Enemies.spawn`), so any pad launch it was riding is over by definition.
    this.launchArc = null;
    this.launchT = 0;
    this.padCd = 0;
    this.yaw = yaw;
    this.group.position.set(x, g + P.HY, z);
    this.group.rotation.y = yaw;
  }

  // Put the rig on the deck at the current pos (and re-read the ground under it).
  settle(snap) {
    const g = this.world.topBelow(this.pos.x, this.pos.z, this.pos.y + 3, 80);
    if (isFinite(g)) this.pos.y = g;
    if (snap || !this.built) {
      this.group.position.set(this.pos.x, this.pos.y + P.HY + this.bodyY, this.pos.z);
      this.group.rotation.y = this.yaw;
      this.inner.rotation.x = this.pitch + this.tumble;
      this.inner.rotation.z = this.roll;
    }
  }

  setState(s, dur) {
    this.state = s;
    this.stateT = 0;
    this.hurtDur = dur || 0;
    this.hurtT = 0;
    // The clinch's haul is part of the reaction it was set by, so it never survives a state
    // change (`hit` sets it again immediately for the clinch itself) — and nor does the carry's
    // own override, which belongs to the grab that wrote it.
    this.grabT = 0;
    this.grabDist = null;
    this.carryOrbit = null;
    this.comboY = null;
    // ...and the WALL CLINCH's own hold goes with them: nothing may leave a body pinned to a wall
    // after the state that put it there has ended. `player.js` writes it again on the same frame it
    // opens the reaction (after this call), so the pin survives its own state's entry.
    this.headPin = null;
  }

  // BACK ON YOUR FEET, AND NOT INSTANTLY SWINGING (session 191 — see `E.STUN_RECOVER`). Every
  // reaction that hands the body back to the fight goes through here instead of talking to
  // `setState` directly, because "the stun is over" and "the body may throw its punch again" are
  // two different moments and the code only ever had the first. A body's attack cooldown is
  // whatever was left on it when it was hit — so one caught with its fist already charged stood
  // up and punched on the SAME frame (measured: a fold ending at 0.52 s with `atkCd` 0 threw on
  // frame 32 of the reaction). `E.STUN_RECOVER` is the beat it owes the player first.
  standUp() {
    this.atkCd = Math.max(this.atkCd, E.STUN_RECOVER);
    this.setState("idle");
  }

  // THE PAD (session 174 — the user's *"make the dummy get launched from the jump pad normaly like a
  // player"*). A body standing on the plate is fired off it by the SAME machinery the player's own
  // launch rides: `launchArc` (player.js) solves the flight to the roof, and the branch in `update`
  // flies it without collision and lands it there. What the body WEARS for the ride is the game's
  // own shape for a body thrown off its feet — `flight` with the `launch` kind, exactly what a body
  // an M1 finisher picks up off the deck wears — because a limp body being fired into the sky is
  // the one thing the reactions already have a picture of.
  //
  // The SPIN is deliberately left off (`tumble`/`roll` cleared rather than re-armed): that shape is
  // a body CURLED, not one mid-somersault, and a dummy tumbling end over end for four seconds of
  // arc would read as a body that had been hit rather than one the pad threw. What sells this is the
  // arc and the arrival, and the plate's own ring and grit — published on the `enemyLaunch` event
  // below and spent in main.js — so the pad reads exactly as it does under the player's own feet.
  padLaunch(pad, mgr) {
    const arc = launchArc(
      { x: this.pos.x, y: this.pos.y + P.HY, z: this.pos.z },
      { x: pad.launch.x, y: pad.launch.y + P.HY, z: pad.launch.z },
      pad.tower
    );
    if (!arc) return false;
    this.launchArc = arc;
    this.launchT = 0;
    this.padCd = E.PAD_CD;
    this.ragdoll = false;
    this.flip = false;
    this.tumble = 0;
    this.tumbleRate = 0;
    this.roll = 0;
    this.rollRate = 0;
    this.grounded = false;
    this.yaw = Math.atan2(arc.dx, arc.dz);
    this.vel.set(arc.dx / arc.D, arc.vy, arc.dz / arc.D);
    // ...and the reaction is entered last, because `setState` clears every hold a move could have
    // left on this body (the carries, the pin, the juggle's altitude): a body fired off the plate
    // belongs to the pad now, not to whatever had hold of it a frame ago.
    this.setState("flight", E.LAUNCH_T);
    this.hurtKind = "launch";
    if (mgr && mgr.events) {
      mgr.events.push({ type: "enemyLaunch", x: this.pos.x, y: this.pos.y, z: this.pos.z });
    }
    return true;
  }

  // What this body will have to get up WITH, recorded on every hit (see `pickGetup`): its
  // condition after the damage, how hard it was hit, and whether it is leaving its feet into the
  // air. Recorded per hit rather than read at the get-up, because health is RESTORED when a
  // knocked-out body gets up — reading it later would make every KO recovery look like a healthy
  // one, and every KO would get the show-off.
  noteHit(knock, air) {
    this.hurtHp01 = Math.max(0, this.hp) / E.HP;
    this.hurtKnock = knock;
    this.hurtAir = !!air;
  }

  // How long the get-up it is wearing takes (see `E.GETUP_T`). That is the MOVE's own clock only:
  // `getupTime` below adds the roll-back beat, because the state's clock has to cover the whole
  // thing or the body would stand up out of its lie mid-roll.
  getupMoveTime() {
    return this.getupT || E.GETUP_T.getup;
  }

  // The beat a get-up spends rolling a body onto its BACK before the move it picked can start.
  // All four get-ups are authored to start exactly on `DOWNED` at pitch -1.55 (a supine body) and
  // three of them carry whole-rig `angle` curves that assume it, so a body that settled in any
  // other lie has to be rolled over first — otherwise the get-up would snap it there on its first
  // frame. Zero for `back`, which is the only lie that needs nothing (see `LIE`).
  getupLead() {
    const lie = LIE[this.lie];
    return lie && lie.lead ? E.LIE_ROLL_T : 0;
  }

  // ...and the whole clock the state runs on: the roll-back beat plus the move.
  getupTime() {
    return this.getupMoveTime() + this.getupLead();
  }

  // The get-up's OWN clock, 0..1 — 0 for the whole of the roll-back beat, because the pose for
  // that beat is the move's first frame (DOWNED), which is where the body already is.
  getupU() {
    const lead = this.getupLead();
    return Math.max(0, Math.min(1, (this.hurtT - lead) / Math.max(1e-3, this.getupMoveTime())));
  }

  // Settle into a lie (see `LIE`): which way up the body is, and the two targets its tumble and
  // its roll are wound out to on the way there. Split out from the landing because a TRIP settles
  // by the same rule as a ragdoll (a swept body has to lie down too) but picks from different odds.
  setLie(kind) {
    this.lie = LIE[kind] ? kind : "back";
    this.liePrev = this.lie;
    const lie = LIE[this.lie];
    // The turn is taken off the nearest whole one, so the body always rolls the SHORT way to the
    // lie it picked rather than unwinding a full spin to get there.
    this.tumbleTarget = Math.round((this.tumble - lie.turn) / TAU) * TAU + lie.turn;
    this.rollTarget = lie.roll;
  }

  // ---------------------------------------------------------------------------
  // THE RAGDOLL'S SOLVED SPIN (see `E.RAGDOLL_TURNS`). Neither of these is a rate constant; the
  // rate is the third thing, derived:
  //
  //   * `ragSpinFor()` — where the tumble has to END. Since session 191 that is EXACTLY one whole
  //     revolution on from wherever the body is (see `E.RAGDOLL_TURNS`): the spin only ever runs
  //     ON, so the end is the first whole-turn boundary at or behind the current tumble after
  //     `RAGDOLL_TURNS` revolutions. Measured from upright it is one turn for EVERY lie now; before
  //     this the lie was folded into the spin and the same punch threw 0.75 turns (a side), 1.0 (a
  //     back) or 1.5 (a front) depending on a coin toss — three different somersaults off one move.
  //   * `ragSpinTime()` / `ragSpinRate()` — the angular speed that spends the REST of that rotation
  //     over the shorter of the hang the body has left and the ragdoll clock it has left
  //     (`E.RAGDOLL_T`). This is the whole fix: the number of turns is no longer a function of the
  //     hang, and the whole tumble is inside the clock. Re-asked on every skip (`landed`) and on
  //     every juggle, because both change the hang.
  // ---------------------------------------------------------------------------
  ragSpinFor() {
    const left = -(this.tumble - 1e-3) / TAU;
    return -TAU * Math.max(E.RAGDOLL_TURNS, Math.ceil(left));
  }

  // How long the spin has to spend itself: the hang the body has LEFT, or the ragdoll clock's own
  // remainder — whichever is shorter (see `E.RAGDOLL_T`). "The animation is the clock's, the fall
  // is the world's": a body thrown off a roof is in the air for two seconds and tumbles for 0.67 of
  // them. Floored at a whisker so a body that is all but on the deck cannot divide by zero.
  ragSpinTime() {
    const left = E.RAGDOLL_T - (this.ragT || 0);
    return Math.max(0.05, Math.min(this.airTimeLeft(), left));
  }

  ragSpinRate() {
    return (this.ragTumbleEnd - this.tumble) / this.ragSpinTime();
  }

  // How long this body has left in the air at the fall it is actually carrying: the positive root of
  // `h + v·t − ½g·t² = 0` for the deck under it, with `h` measured off the body's own `floorY` (so a
  // launch off a ledge is the longer hang it really is, not the shorter one flat ground would give).
  // Used by the solved ragdoll spin and by nothing else — every other reaction's clock is its own.
  airTimeLeft() {
    const g = P.GRAVITY;
    const floor = isFinite(this.floorY) ? Math.min(this.floorY, this.pos.y) : this.pos.y;
    const h = Math.max(0, this.pos.y - floor);
    const v = Math.max(0, this.vel.y);
    return Math.max(0.12, (v + Math.sqrt(v * v + 2 * g * h)) / g);
  }

  // Standing up: pick which get-up the body has earned (`pickGetup`), take its length, and swap
  // the shape under it in the same frame the state changes, so the pose clock and the shape it is
  // drawn on can never disagree. `ko` is whether this is a recovery from being knocked OUT, which
  // is the one thing that rules a show-off get-up out entirely.
  startGetup(ko) {
    const kind = pickGetup({
      hp01: this.hurtHp01,
      knock: this.hurtKnock,
      air: this.hurtAir,
      ko: !!ko,
    }, this.getupPrev);
    this.getupKind = kind;
    this.getupPrev = kind;
    this.getupT = E.GETUP_T[kind] || E.GETUP_T.getup;
    this.setState("getup");
    this.hurtKind = kind;
    // A get-up is authored on a SUPINE body, so a body lying in any other lie rolls onto its back
    // first (see `getupLead` / `getupU`): the roll's target becomes level, and the tumble's becomes
    // the nearest WHOLE turn — a supine body by definition, and the shorter way round for a lie
    // that is a quarter turn off it. Both are spent by the lead-in beat at the front of the move.
    const lie = LIE[this.lie] || LIE.back;
    this.tumbleTarget = Math.round(lie.turn / TAU) * TAU;
    this.rollTarget = 0;
  }

  // The body's HEAD, in world space: the point the clinch's two hands are solved onto (see
  // `setClinchHead` in streetwear.js and the 2nd M1 in player.js). Read off the rig's own bone, so
  // the haul dragging the body in, the bend of its reaction and the pitch it is held at are all
  // already in the answer — there is no offset from the body's origin for anyone to keep in sync.
  // The fallback is only for a rig that has not finished building; nothing should be grabbing that.
  headPoint(out) {
    const b = this.charMesh && this.charMesh.userData.bones;
    if (!b || !b.head) return out.set(this.pos.x, this.pos.y + P.HY * 1.5, this.pos.z);
    return b.head.getWorldPosition(out);
  }

  // ---------------------------------------------------------------------------
  // THE GRAB'S CONTACT POINTS (the right-click — see the player's `grab`). Each is read off the
  // rig's own bone the same way `headPoint` is, so the shape the body is actually wearing — the
  // fold of a reaction, the fold of the FOLD, the reel of a stagger, the tumble of a ragdoll — is
  // already in the answer and a hand solved onto one is guaranteed to land ON the body rather than
  // near where the body was. The fallbacks only fire for a rig that has not finished building.
  //
  //   * `chestPoint` — the STERNUM (see `CHEST_LOCAL`): the `torso` bone's origin is the hips, so
  //     the point is a step up it and a step forward, in the torso's own frame.
  //   * `shoulderPoint(side)` — the shoulder joint itself (the `armUpper` bone's origin). `side`
  //     takes the same convention as everywhere else: `< 0` is the bone named `...L`, the
  //     character's own right.
  //   * `legPoint` — the shin just above the ankle. The grab for a body in the AIR is an ankle
  //     grab — that is what a man takes hold of when he pulls someone down out of the air — and
  //     the `L` side is the one `poseGrab`'s own reach is authored for.
  chestPoint(out) {
    const b = this.charMesh && this.charMesh.userData.bones;
    if (!b || !b.torso) return out.set(this.pos.x, this.pos.y + P.HY * 1.25, this.pos.z);
    return b.torso.localToWorld(out.copy(CHEST_LOCAL));
  }

  shoulderPoint(side, out) {
    const b = this.charMesh && this.charMesh.userData.bones;
    const bone = b && (side < 0 ? b.armUpperL : b.armUpperR);
    if (!bone) return out.set(this.pos.x, this.pos.y + P.HY * 1.4, this.pos.z);
    return bone.getWorldPosition(out);
  }

  // The THROAT: the head bone dropped a notch, in world space — the flash grab's one-handed
  // grip. Read off the rig the same way `headPoint` is, so the swing, the dangle and the slam
  // are already in the answer and the hand lands ON the body.
  throatPoint(out) {
    const b = this.charMesh && this.charMesh.userData.bones;
    if (!b || !b.head) return out.set(this.pos.x, this.pos.y + P.HY * 1.7, this.pos.z);
    b.head.getWorldPosition(out);
    out.y -= 0.22;
    return out;
  }

  legPoint(out) {
    const b = this.charMesh && this.charMesh.userData.bones;
    const bone = b && (b.legLowerL || b.footL);
    if (!bone) return out.set(this.pos.x, this.pos.y + P.HY * 0.35, this.pos.z);
    return bone.getWorldPosition(out);
  }

  // ---------------------------------------------------------------------------
  // THE SHOULDER LIFT's arrival — the body is SET ON ITS FEET and left DAZED there (see the
  // player's `grabLift`, and `E.DIZZY_T`). Everything a reaction could have left on the body is
  // cleared here, because the whole point of the move is that the body is back UP: the ragdoll and
  // the flip, the tumble and the roll, and the lie it was lying in. The state it enters is a
  // REACTION — it stands, it does not walk, it does not punch (see the `live` test in `update`) —
  // and its shape is `poseHurtDizzy`, which is where the cartoon lives.
  dizzy(dur) {
    if (!this.built) return false;
    this.ragdoll = false;
    this.flip = false;
    this.bounces = 0;
    this.tumble = 0;
    this.tumbleRate = 0;
    this.tumbleTarget = 0;
    this.roll = 0;
    this.rollRate = 0;
    this.rollTarget = 0;
    this.ragLie = null;
    this.launchBonus = 0;
    this.hurtKind = "dizzy";
    this.hurtDur = dur != null ? dur : E.DIZZY_T;
    this.hurtPose = 1;        // an arrival: the layer is at full weight from the first frame
    this.grounded = true;
    this.vel.set(0, 0, 0);
    this.koT = 0;
    this.hp = Math.max(this.hp, 1);
    this.setState("dizzy", this.hurtDur);
    // ...and the LIE is cleared with it: `setLie` is what a `down` leaves behind, and a body walked
    // back up onto its feet has no business carrying one into its next knock-down.
    this.setLie("back");
    return true;
  }

  // ---------------------------------------------------------------------------
  // THE SHOULDER LIFT's arrival (`dizzy` above is the same arrival, one beat later). A body that
  // has been hauled up off the deck onto its feet does not get to CHOOSE how it rises: `pickGetup`
  // weighs a hurt, freshly-hit man and hands back a show-off for most of them, and a body coming up
  // under two of somebody else's hands is not showing off. So the plain roll-up is forced, and it is
  // handed exactly the clock the player's haul has left him (see `player.grabLift`) so the body and
  // the hands carrying it move together — the get-up always outlives the haul.
  liftUp(dur) {
    if (!this.built) return false;
    this.ragdoll = false;
    this.flip = false;
    this.bounces = 0;
    this.tumbleRate = 0;
    this.launchBonus = 0;
    this.rollRate = 0;
    this.koT = 0;
    this.hp = Math.max(this.hp, 1);
    this.getupKind = "getup";
    this.getupPrev = "getup";
    this.getupT = dur != null ? dur : E.GETUP_T.getup;
    this.setState("getup");
    this.hurtKind = "getup";
    // The lie is levelled the short way round, exactly as `startGetup` does it: a get-up is authored
    // on a supine body, so whichever way this one was lying it rolls onto its back to be brought up.
    const lie = LIE[this.lie] || LIE.back;
    this.tumbleTarget = Math.round(lie.turn / TAU) * TAU;
    this.rollTarget = 0;
    return true;
  }

  // How much fight is left in it, 0..1 — the read the whirl's FINISHER waits for (see
  // `player.whirlSlam`: a body already under `P.WHIRL_FINISH_HP` takes the elbow instead of the
  // launch). Read off `E.HP` rather than repeated here, so the two can never disagree.
  get hp01() {
    return Math.max(0, Math.min(1, this.hp / E.HP));
  }

  // The HANDOVER cross-fade, start side (the spend side is the block at the end of `updatePose`).
  // A reaction's `t = 0` is normally the shape a standing body is already in, so the reaction layer
  // can be written at full weight and the shape arrives as a snap — which is what an impact wants.
  // The exception is a hit that lands on a body the chain is still HOLDING: the clinch's beat (see
  // `CLINCH_BEAT`) means the sweep or the finisher can arrive at ANY point in it, so the shape the
  // new reaction starts from is not the one the body is wearing. Here the rig is still in that
  // shape (nothing has posed it since the last frame), so it is snapshotted and the new pose is
  // faded in off it instead of replacing it.
  linkPose() {
    const ud = this.charMesh && this.charMesh.userData;
    if (!ud || !ud.poseSnapshot) return;
    ud.poseSnapshot();
    this.poseLink = 0;
  }

  // -------------------------------------------------------------------------
  // Taking a hit. `kind` is which reaction the move puts on the body, `knock` the shove
  // along (dx, dz), `stun` how long the body is out of the fight. Returns true if it landed.
  //
  // Two options go beyond the melee chain's own shove:
  //   `lift`  — the vertical pop, in world units per second, for a hit whose height is its own
  //             number rather than the chain's one formula off the knock (a slide's speed, a
  //             drop blast's power). Omit it and the flight gets the finisher's pop, which is
  //             what every other route into the air wants.
  //   `force` — take the body even if it is already ragdolling. The guard below is there to stop
  //             the CHAIN juggling a body it just threw (see `inFront` too); a shockwave is not a
  //             swing, and "throws every one into the air" has to mean the bodies already in the
  //             air as well. The AIR COMBO's own juggle is the other exception, and it is the one
  //             the guard was never meant to catch: skill 3's kick ragdolls what it catches, so the
  //             body the air combo was opened ON is a ragdoll.
  // -------------------------------------------------------------------------
  hit(kind, dx, dz, knock, stun, opts) {
    if (!this.built) return false;
    // THE FLASH (see `setBodyFlash` in ps1.js). A body that is struck goes white for about a
    // tenth of a second — the one cue that cannot be missed at this resolution and from this
    // camera, because it is the whole silhouette and not a detail on it. It is set HERE, before
    // any of the shape decisions below, so a hit that is going to be refused further down still
    // reads as a hit that landed (the guard that refuses it is about what the body is wearing,
    // and the contact already happened).
    this.flash = 1;
    // Out of the fight: a body that is already ragdolling cannot be hit at all until it is back
    // on its feet (the user's "make the m1s cant hit ragdoll"). This is the whole guard — every
    // caller sees the same false — and `Enemies.inFront` filters them out as well so a swing at
    // one is a clean whiff rather than a hit that silently does nothing. Only a `force` hit goes
    // through it: the drop blast ("throws every one into the air" has to mean the ones already up
    // there), and the AIR COMBO's juggle, which is deliberately striking a limp body (see
    // `player.attackContact`).
    if (this.ragdoll && !(opts && opts.force)) return false;
    // Every reaction in the game brings its stun through here, so "the enemy stun" has one knob
    // (`E.STUN_MUL`) instead of a dozen call sites' own. It scales the reaction's clock, not the
    // shape: a body that recovers sooner is a body that is back in the fight sooner.
    stun = (stun || 0) * E.STUN_MUL;
    // ---- THE WALL CLINCH's own knee (see `headPin` and "THE WALL CLINCH" in README.md) ----
    // A body pinned by the skull against a wall and kneed in the stomach takes the DAMAGE, the
    // flash and the jolt, and NOTHING else. It is the one hit in the game that puts no reaction on
    // the body at all, and it has to be: the shape it is already wearing is the move's own, and
    // every other branch below ends in a `setState`, which would reset the pose clock and teleport
    // a body that is being held by the head to the opening frame of a reaction it is not in. So it
    // is handled here, ahead of every one of them, and returns.
    if (kind === "jolt") {
      this.hp = Math.max(0, this.hp - ((opts && opts.dmg) || 0));
      this.noteHit(knock || 0, false);
      this.hurtPose = 1;
      // ...and the flash is the CALLER's, because this one hit covers ten of them: the flurry's
      // knees land faster than a full-body flash can fade (the last beats are 0.06s apart), so ten
      // white-outs in a row is a strobing rag rather than a body being hit — see `fireWallKnee`.
      // A `jolt` with no number is the older full flash.
      this.flash = opts && opts.flash != null ? opts.flash : 1;
      return true;
    }
    // A SWING DIES WITH THE BODY (session 191). Every branch below puts a reaction on this body,
    // and a reaction means it is no longer punching — but the punch's own clock (`atkT`) was never
    // cleared by a hit, so a body knocked off its feet mid-swing still LANDED that swing from the
    // deck: measured, a punch cancelled on frame 3 of 24 still threw its contact on frame 27 while
    // the body was lying on its back in `down`. Cleared here, once, for every reaction there is.
    this.atkT = 0;
    this.atkDone = false;
    // WHICH SHAPE this hit puts on the body is usually settled by what the body is already
    // wearing, because the chain's swings are thrown at whatever it just left there: the sweep
    // (M1 #3) lands on a body the clinch (M1 #2) is still holding by the head, and the finisher
    // (M1 #4) lands on a body the sweep has already put on the deck. Both of those shapes have a
    // different t=0 from the standing one, and `setState` resets the pose clock — so a reaction
    // that started in the wrong shape would teleport its wearer for the frame it swapped in.
    // `held` is a body the chain is still holding up; `decked` one already flat on the mat.
    const held = this.state === "fold" || this.state === "clinch";
    const decked = this.state === "down";
    if (decked && kind !== "flight" && kind !== "slam") {
      // Already on the deck: only the finisher picks it back up, and it picks it UP. A `slam` is
      // exempt because a slam is "put it on the deck" and a body already there is where it goes
      // (see `player.whirlSlam` / the elbow follow-up) — promoting that to a launch would turn the
      // finisher's second strike into the very thing it replaced.
      kind = "flight";
      knock *= 1.35;
    }
    const airborne = this.state === "flight" || !this.grounded;
    // A body that is ALREADY flying and takes a `flight` hit is a JUGGLE, not a new reaction: the
    // 4th M1 catching the 3rd M1's flip before it comes down. It has to keep the shape it is
    // wearing — `setState` resets the pose clock, and re-entering the same shape from its own t=0
    // teleports a body that is halfway through its turn (measured before this: it snapped from
    // `FALLEN`, its landing shape, back to `REST`) — so all it takes is the hit's own velocity, a
    // refreshed stun, and the finisher's ragdoll if it brought one. Everything is the same
    // reaction from then on: it lands, winds out and lies there like any other flight.
    const reAir = this.state === "flight" && kind === "flight";
    if (reAir) {
      this.hp = Math.max(0, this.hp - ((opts && opts.dmg) || 0));
      this.noteHit(knock, true);
      this.vel.x = dx * knock;
      this.vel.z = dz * knock;
      const pop = opts && opts.lift != null ? opts.lift : 6.0 + 3.2 * Math.min(1, knock / 11);
      // ...and the same ceiling as the finisher's own (see `E.RAGDOLL_T` and the note in the flight
      // branch): a JUGGLE that re-arms the ragdoll is on the clock too, so a string of them cannot
      // stack one pop on another into a body hanging in the sky.
      this.vel.y = Math.max(this.vel.y, opts && opts.ragdoll ? Math.min(pop, P.GRAVITY * E.RAGDOLL_T * 0.5) : pop);
      this.grounded = false;
      this.launchBonus = 1;
      this.hurtDur = Math.max(this.hurtDur, stun);
      if (opts && opts.ragdoll && !this.ragdoll) {
        // The finisher turns the juggle loose: the body keeps the turn it is already in and picks
        // up the finisher's own spin from there. Solved like the launch's own, but from wherever the
        // body already IS — `ragSpinFor` only ever looks FORWARD, so the turn it carries is spent
        // rather than rewound, and the extra hang this juggle buys is spent as a slower revolution
        // instead of a second one (`tumbleTarget` is where the wind-out starts).
        this.ragdoll = true;
        this.flip = false;
        this.bounces = E.BOUNCES;
        this.rollRate = 0;
        this.ragT = 0;      // a fresh loose phase, on a fresh clock (see `E.RAGDOLL_T`)
        this.ragLie = pickLie({ roll: this.roll, knock, air: true, backwards: false }, this.liePrev);
        this.lie = this.ragLie;
        this.liePrev = this.ragLie;
        this.ragLean = (Math.random() * 2 - 1) * E.RAGDOLL_LEAN;
        this.rollTarget = LIE[this.ragLie].roll;
        this.ragTumbleEnd = this.ragSpinFor();
        this.tumbleTarget = this.ragTumbleEnd;
      }
      // ...and a body that was ALREADY loose and is caught again keeps its solved spin, re-spread
      // over the longer hang the fresh pop has just bought it.
      if (this.ragdoll) this.tumbleRate = this.ragSpinRate();
      this.hurtPose = Math.min(1, this.hurtPose + 0.4);
      this.flash = 1;
      return true;
    }
    this.hurtKind = kind;
    this.hp = Math.max(0, this.hp - ((opts && opts.dmg) || 0));
    this.noteHit(knock, kind === "flight");
    this.vel.x = dx * knock;
    this.vel.z = dz * knock;
    if (kind === "flight") {
      // The finisher is the one that takes the body OFF THE FLOOR: it leaves with the shove on
      // the horizontal and a pop of lift on the vertical, and it lands on its back further away.
      // The pop is normally the chain's own formula off the knock, but a hit that brought its own
      // height (`opts.lift` — a slide's speed, a blast's power) sends that instead, and a FLIP
      // (`opts.flip`) sends `E.FLIP_LIFT`, which is the height whose hang is the 0.5 s the user
      // asked for. Those are the moves whose whole point is how high the body goes, so the height
      // cannot be a side effect of the shove. Still a `max`, so no hit can ever push a body
      // already flying DOWN.
      const rag = !!(opts && opts.ragdoll);
      const flip = !!(opts && opts.flip) && !rag;
      // ...and the UPPERCUT is the third variant of this same reaction (see `E.UPPER_*` /
      // `poseHurtUpper`): a body thrown straight up off a rising knee. It is NOT a ragdoll — the
      // whole point of a launcher is that the body it put up there can be hit again — and not a
      // `flip` either, because a flip is solved for a half second and this one is up for a whole
      // one. It brings its own height (`opts.lift`), its own slower tumble and its own shape.
      const upper = !!(opts && opts.upper) && !rag;
      const pop = opts && opts.lift != null ? opts.lift : flip ? E.FLIP_LIFT : 6.0 + 3.2 * Math.min(1, knock / 11);
      // THE RAGDOLL'S OWN CEILING ON THE THROW (session 191 — see `E.RAGDOLL_T`). A body that goes
      // loose is never given more pop than the clock can bring back down (`P.GRAVITY * T / 2`), so
      // the whole loose phase is inside the ceiling however hard the move that threw it. It is a
      // CLAMP and not a re-tune: the moves keep their own heights (the macaco's 15.5, the blast's
      // 20.5) and only the loose bodies they throw are held to the ragdoll's clock — the same
      // launch on a body that is NOT ragdolled still goes exactly as high as it ever did.
      this.vel.y = Math.max(this.vel.y, rag ? Math.min(pop, P.GRAVITY * E.RAGDOLL_T * 0.5) : pop);
      this.grounded = false;
      // ...and a body already falling when the knee catches it keeps its roll and gets a little more
      // air (the "caught mid-air" bonus below). The uppercut does not take it: its height is SOLVED
      // (`E.UPPER_LIFT`), so a bonus on top of it would be a second, unmeasured height wearing the
      // same name — and the horizontal it adds is the one thing a vertical launcher must not have.
      this.launchBonus = (opts && opts.catch && !upper) ? 1 : 0;
      // ...and it leaves its FEET differently according to the shape it was wearing when it was
      // hit — the same argument as `held`/`decked` above, one step further: the shape is the
      // reaction's first frame, and `setState` resets the clock it is drawn on, so it has to be
      // the shape the body is actually IN. Off the DECK it comes up out of `DOWNED` (`launch`),
      // out of a body the chain is still holding (the clinch's doubled-over hold, or the fold a
      // knee left behind) it comes up out of `CLINCHED` (`flip`), and off a standing body it
      // leaves `REST` like it always did.
      //
      // Read BEFORE `setState` — which is the trap this line fell into: `setState("flight")`
      // writes `this.state` first, so the old `this.state === "clinch"` test was ALWAYS false and
      // the flip wore the STANDING start shape regardless of what it was hit out of. The body
      // therefore teleported out of the doubled-over clinch into an upright silhouette on the
      // switch frame (the reaction layer is at full weight by then, so nothing smoothed it).
      // `held`/`decked` are the two reads that were taken before the state changed.
      this.hurtKind = upper ? "upper" : decked ? "launch" : held ? "flip" : "flight";
      if (held || decked) this.linkPose();
      this.setState("flight", stun);
      // ...and it goes LOOSE — but only when the FINISHER is what launched it (`opts.ragdoll`;
      // the user's "make the 4th m1 just ragdolls"). Every other route into `flight` — the sweep
      // that flips a body off its feet (`opts.flip`), the slide's hit and the blast (neither),
      // and the promotion below of a hit on a body already on the deck — is a shove with a pop of
      // lift, exactly the shape it was before the ragdoll existed, and it hands the body back to
      // its normal reactions. When it IS a ragdoll the body gets a spin about its own X (backwards,
      // the way the punch sends it) and a randomised roll, and keeps both for as long as it is in
      // the air (see the block in `update`).
      this.ragdoll = rag;
      // ...and the tumble: a flip is solved to one whole turn across its half second and the
      // uppercut the same way across its own full second (see `E.UPPER_SPIN`) — slower per second,
      // the same one revolution, so it lands square. The RAGDOLL's is the same one revolution, but
      // solved over the shorter of the hang it actually has and its own clock (see `E.RAGDOLL_TURNS`
      // / `E.RAGDOLL_T`).
      this.flip = flip || upper;
      this.bounces = rag ? E.BOUNCES : 0;
      this.tumbleTarget = this.tumble;
      this.tumbleRate = upper ? -(E.UPPER_SPIN + 0.12 * knock)
        : flip ? -(E.FLIP_SPIN + 0.2 * knock) : 0;
      this.rollRate = (flip || upper)
        ? (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * (E.ROLL_MAX - 0.5)) * 0.7
        : 0;
      if (rag) {
        // A FRESH LOOSE PHASE, ON A FRESH CLOCK (see `E.RAGDOLL_T`): whatever the body was doing
        // with its own clock before this hit, the throw that ragdolls it starts the 0.67 s over.
        this.ragT = 0;
        // WHICH WAY UP IT IS GOING TO LAND is settled HERE, at the throw. The odds are `pickLie`'s
        // own, fed the roll it was carrying a moment ago (the lean is re-drawn below, so this is the
        // last read of that number). It is no longer encoded in the SPIN — since session 191 the
        // revolution is always exactly one — it is the FLOP the wind-out does after the landing
        // (`setLie`), and `rollTarget` below is the half of it that is a sideways roll.
        this.ragLie = pickLie({ roll: this.roll, knock, air: true, backwards: false }, this.liePrev);
        this.lie = this.ragLie;
        this.liePrev = this.ragLie;
        this.ragLean = (Math.random() * 2 - 1) * E.RAGDOLL_LEAN;
        this.rollTarget = LIE[this.ragLie].roll;
        this.ragTumbleEnd = this.ragSpinFor();
        this.tumbleTarget = this.ragTumbleEnd;
      }
      if (this.launchBonus) {
        // Caught mid-fall: the sweep had already taken the legs, so the launch has further to
        // go and the body keeps its roll.
        this.vel.y += 2.6;
        this.vel.x *= 1.5;
        this.vel.z *= 1.5;
      }
      // ...and the ragdoll's rate is solved LAST, because the hang it is spread over is the body's
      // OWN and the `catch` bonus above is part of it (a body caught out of the air hangs longer, so
      // the same one revolution is spent SLOWER — never as more revolutions).
      if (rag) this.tumbleRate = this.ragSpinRate();
    } else if (kind === "trip") {
      this.setState(airborne ? "flight" : "trip", stun);
      if (airborne) this.hurtKind = "flight";
      // A sweep that lands on a body already in a reaction is leaving the CLINCH's shape behind,
      // not standing (see `held` above). A body already going over keeps `trip`: neither entry
      // shape is the one it is actually wearing, and its own is the closer of the two.
      else if (held) {
        this.hurtKind = "sweep";
        this.linkPose();
      }
    } else if (kind === "clinch") {
      // The plum clinch: the body is held by the head, so the stun and the HAUL are one number
      // — it is dragged in to `E.GRAB_DIST` (see `update`) and stays there until the stun runs
      // out, which is what lets the player's hands be authored at a fixed place.
      //
      // ...and it is the most-used handover in the whole chain: the knee (M1 #1) leaves the body
      // doubled over in `fold`, and the clinch is thrown at it a beat later, so its `t = 0` is
      // almost never the shape the body is actually wearing. Measured off the knee's own fold, the
      // fold → clinch swap snapped 1.24 rad in one frame on the knee (`o13.rot.z`), against ~0.1 on
      // the frames around it — so this one gets the handover fade as well.
      if (held) this.linkPose();
      this.setState("clinch", stun);
      this.grabT = stun;
    } else if (kind === "slam") {
      // DRIVEN INTO THE DECK (the whirl's own slam — see `player.whirlSlam`, and the finisher's
      // elbow follow-up). The body is put DOWN on the mat rather than left doubled over: a slam's
      // whole read is the shape it leaves behind, and `down` is the state the game already has for
      // "on the floor" — the same one a `flight` is promoted into when it lands (see `landed`), so
      // the lie, the get-up clock and the pose are the ones every knock-down already uses. It is
      // also exactly what the LAUNCH needs: `decked` is true on the next hit, so the `flight` the
      // whirl throws it back into the air with comes up out of `DOWNED` like a finisher's own
      // pick-up (see `player.whirlLaunch`).
      if (held) this.linkPose();
      this.setState("down", E.DOWN_LIE);
      this.hurtKind = "down";
      this.hurtAir = true;      // it was hoisted and driven down, which is what the lie reads
      this.grounded = true;
      this.vel.y = 0;
      this.tumbleRate = 0;
      this.rollRate = 0;
      this.setLie(pickLie({ roll: this.roll, knock, air: true }, this.liePrev));
    } else if (kind === "pushback") {
      // THE PUSHBACK — the front lunge's own reaction, and the one thing in the game a body takes
      // that is a whole performance without being a ragdoll (the user's *"the enemy does a quick
      // backflip then supports him self with 2 hands on the ground then getting up all this is
      // done within 0.75 seconds its doesnt count as a ragdoll btw i repeat push back is not a
      // ragdoll"*).
      //
      // It is authored exactly like the WALL SLAM, and for the same reasons: it is a fixed
      // 0.75 s of its own (NOT the stun it came in with — the whole read is `E.PUSH_T`, so the
      // clock is pinned here), its whole-rig angle is an authored CURVE (`HURT_BODY.pushback`),
      // and the spin the body arrived with is SPENT rather than wound out, because a body caught
      // mid-flip by the lunge has to be put back on the deck before its first frame is drawn or
      // the curve starts from wherever its tumble happened to be. It is NOT a ragdoll, so it is
      // never loose: it stays hittable for the whole of it and it ends on its feet.
      if (held) this.linkPose();
      this.ragdoll = false;
      this.flip = false;
      this.bounces = 0;
      this.tumble = 0;
      this.tumbleRate = 0;
      this.rollRate = 0;
      this.roll = 0;
      this.launchBonus = 0;
      this.hurtKind = "pushback";
      this.hurtPose = 1;    // an impact: the reaction layer is at full weight from the first frame
      // THE DIRECTION IS ROLLED (the user's *"make it pushback in a random direction"*): the shove
      // swings off the lunge's own line by a TRIANGULAR draw (`rand - rand`), so it is usually
      // straight back, often hard to the side, and only rarely out at the edge — where the edge is
      // most of the circle. Triangular rather than a flat draw over the full turn, because a flat one
      // would fling the body back at the man who hit it as often as away from him, and a pushback
      // into the striker reads as a glitch rather than as a hit.
      const a = (Math.random() - Math.random()) * E.PUSH_SPREAD;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      let ux = dx * ca - dz * sa;
      let uz = dx * sa + dz * ca;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul;
      uz /= ul;
      this.vel.x = ux * knock;
      this.vel.z = uz * knock;
      // ...and the body wears the shove's line as its FACING — the relation the straight version
      // always had, kept: it faces the way it was hit FROM and flips BACKWARD along its travel. So
      // the somersault is always in the plane the body is actually moving in, whichever way the roll
      // sent it, instead of a sideways tumble sliding across its own flip axis.
      this.yaw = Math.atan2(-ux, -uz);
      this.vel.y = Math.max(this.vel.y, 0);
      this.setState("pushback", E.PUSH_T);
      this.hurtDur = E.PUSH_T;
    } else {
      // THE FOLD, and the ONE handover in the chain that is a SNAP by design — but only off a body
      // that is actually wearing the shape it starts from. `poseHurtFold`'s `t = 0` is `REST` (every
      // channel's opening key is the standing value), so the snap is right for a punch landing on a
      // standing body: that is the read of the impact, and the note at the end of `updatePose` says
      // so. A body that is NOT standing is a different animal — a knee thrown at one that is still
      // getting up, or reeling, or halfway through a swing of its own — and there the reaction
      // starts from a silhouette the body is not in, which is the same problem the chain's own
      // handovers had (see `linkPose`). Measured as the worst single-frame travel of any node on the
      // victim's rig, a fold landing on a body 0.3 s into its get-up: **1.613 u** unfolded against
      // **0.413** faded — the largest snap left anywhere in the chain, and the fold's own legs are
      // what do it (the shape solves the feet onto the deck, which a body already halfway up is not
      // standing on). The other non-neutral states, same measurement: dizzy 0.409 → 0.111, a fold
      // re-thrown into a fold 0.309 → 0.191, the clinch 0.735 → 0.401 — and a fold off a body
      // actually standing is **unchanged** (idle 0.522 both ways), because `idle` and `walk` are the
      // two neutral states and every other one is mid-reaction.
      if (this.state !== "idle" && this.state !== "walk") this.linkPose();
      this.setState("fold", stun);
    }
    this.hurtPose = Math.min(1, this.hurtPose + 0.4);
    this.flash = 1;
    return true;
  }

  // -------------------------------------------------------------------------
  // One frame of the M1 clash, from this body's side (see `player.startClash` / `updateClash`).
  //
  // The lock is the PLAYER's — the pair's line, the mark it walks away from and the two meters are
  // all his — so there is nothing to decide here: this only drives the body onto its own half of
  // the pair, square onto the player, and lets the pose (`poseClash` in streetwear.js) put the fist
  // on whatever weapon it is up against. Driven by velocity rather than assigned, so a wall behind
  // the body stops it and the two cannot end up inside each other.
  // -------------------------------------------------------------------------
  clashUpdate(dt, c) {
    const gap = c.dist - 0.10 * (c.jolt + c.eJolt);
    const p = Math.min(1, c.push / P.CLASH_WIN);
    const q = Math.min(1, c.ePush / P.CLASH_WIN);
    const bias = Math.max(-1, Math.min(1, p - q));
    const cx = c.midX + c.ux * P.CLASH_ADVANCE * bias;
    const cz = c.midZ + c.uz * P.CLASH_ADVANCE * bias;
    const tx = cx + c.ux * gap * 0.5;
    const tz = cz + c.uz * gap * 0.5;
    this.vel.x = Math.max(-14, Math.min(14, (tx - this.pos.x) * P.CLASH_PULL));
    this.vel.z = Math.max(-14, Math.min(14, (tz - this.pos.z) * P.CLASH_PULL));
    if (this.vel.y > 0) this.vel.y = 0;
    // Square onto the player: the fist's target is behind the shoulder when the body is turned
    // side-on, and the solve would go looking for it.
    const fy = Math.atan2(-c.ux, -c.uz);
    this.yaw += wrapAngle(fy - this.yaw) * Math.min(1, 18 * dt);
  }

  // -------------------------------------------------------------------------
  update(dt, player, mgr) {
    if (!this.built) return;
    this.stateT += dt;
    this.hurtT += dt;
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.koT > 0) this.koT = Math.max(0, this.koT - dt);
    // ...and the whiff's tell runs on its own clock (see `OUTLINE_CUE_RGB`): the ink is driven at
    // the tail of this method, where the rig is wearing its final shape, so the timer only has to
    // count here.
    if (this.outlineCue > 0) this.outlineCue = Math.max(0, this.outlineCue - dt);
    if (this.padCd > 0) this.padCd = Math.max(0, this.padCd - dt);

    const toP = _v.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    const dist = toP.length();
    if (dist > 0.001) toP.multiplyScalar(1 / dist);
    const live = this.state !== "fold" && this.state !== "clinch" && this.state !== "trip" && this.state !== "flight" &&
      this.state !== "down" && this.state !== "getup" && this.state !== "clash" && this.state !== "wallslam" &&
      this.state !== "pushback" && this.state !== "dizzy" && this.state !== "wallpin";
    const knockedOut = this.koT > 0 || this.hp <= 0;

    // ---- THE M1 CLASH (see `player.startClash`) ----
    // A body locked with the player is not doing any of its own thinking: the lock owns where it is
    // (the player's `updateClash` walks the PAIR along the line the two strikes met on, and
    // `clashUpdate` drives this body onto its own half of that), which way it faces, and what it is
    // wearing. So it stands the AI down entirely — and if the lock died with the player's end of it
    // (a respawn, a launch into the sky) the body simply goes back to standing there.
    if (this.state === "clash") {
      const c = player.clash;
      if (c && c.e === this) this.clashUpdate(dt, c);
      else this.setState("idle");
    } else if (live && !knockedOut) {
      // ---- what the body is DOING ----
      // The body PLANTS. It never walks, never closes on the player and never gives chase (the
      // user's "make it not move"), so the walk gait below and `E.STOP`/`E.WALK` are dormant:
      // this is the branch that used to drive them. What it keeps is the facing — it still turns
      // on the spot to look at you — and its punch, thrown at anything that comes into reach. A
      // shoved body therefore stays where it slid to, and the fight comes to it rather than the
      // other way round.
      this.vel.x = approach(this.vel.x, 0, E.FRICTION * dt);
      this.vel.z = approach(this.vel.z, 0, E.FRICTION * dt);
      this.setState("idle");
      // In reach, off cooldown and looking at you: throw the punch. It is the player's own
      // punch (`combatMoves[3]`), so the reach and the pose come from one table. The height band
      // is the same one the fist itself tests on the way out (see `ATK_BAND_*`), read here so a
      // body standing on a roof does not even start the move.
      const pLow = player.pos.y - P.HY;
      const pHigh = player.pos.y + P.HY;
      if (dist < E.ATK_RANGE && this.atkCd <= 0 && this.atkT <= 0 &&
        pHigh >= this.pos.y - E.ATK_BAND_DOWN && pLow <= this.pos.y + 2 * P.HY + E.ATK_BAND_UP) {
        this.startAttack();
      }
      // Face the player, easing (a body that snaps reads as a turntable).
      const wantYaw = Math.atan2(toP.x, toP.z);
      this.yaw += wrapAngle(wantYaw - this.yaw) * Math.min(1, E.TURN * dt);
    } else if (live && knockedOut) {
      this.vel.x = approach(this.vel.x, 0, E.FRICTION * dt);
      this.vel.z = approach(this.vel.z, 0, E.FRICTION * dt);
    } else {
      // Reactions drag the body to a stop rather than letting it skate — and a body thrown off
      // its feet drags harder in the AIR than on the deck, so a launch carries a few body
      // lengths rather than sailing off into the next valley. A ragdoll is the exception: it
      // has been knocked clean off its feet, so it carries further (that is the "push back").
      // ...and the PUSHBACK has a drag of its own (see `E.PUSH_DRAG`): it is a shove that CARRIES, so
      // it bleeds slower than an ordinary reaction whether or not the solve has it on the deck yet.
      const drag = this.state === "pushback" ? E.PUSH_DRAG
        : this.grounded ? E.FRICTION * 1.5 : (this.ragdoll ? E.RAGDOLL_AIR_DRAG : 2.8);
      this.vel.x = approach(this.vel.x, 0, drag * dt);
      this.vel.z = approach(this.vel.z, 0, drag * dt);
    }

    // ---- the clinch's haul ----
    // The one reaction where something else owns where the body IS. `hit` sets `grabT` when the
    // clinch lands; for as long as it lasts the body is driven to `E.GRAB_DIST` in front of the
    // player and turned square onto them, so the hands that took the head and the head itself
    // stay in the same place while the knee comes up. Written AFTER the drag above (which would
    // otherwise stop it dead) and BEFORE the physics, so it is an ordinary velocity and the
    // ground/collider work below still applies — a haul that teleported would walk through walls.
    if (this.grabT > 0) {
      this.grabT = Math.max(0, this.grabT - dt);
      const gx = player.pos.x - this.pos.x;
      const gz = player.pos.z - this.pos.z;
      const gd = Math.hypot(gx, gz) || 1e-3;
      // How far into the BEAT the reaction is (the same clock the pose is drawn on), and therefore
      // how far past the hands coming off it is — see `CLINCH_BEAT`.
      const beat = (this.charMesh && this.charMesh.userData.poseCfg && this.charMesh.userData.poseCfg.CLINCH_BEAT) || { hold: 0.52 };
      // ...and the two overrides a CARRY writes over it: how long the body is actually held
      // ...and the one override a CARRY writes over it: how far in front the body is held
      // (`grabDist`, at arm's length rather than dragged into the chest). See `player.whirlGrab`.
      const dist = this.grabDist != null ? this.grabDist : E.GRAB_DIST;
      const carry = this.grabDist != null;
      const u = Math.min(1, this.hurtT / Math.max(0.5, Math.min(0.95, this.hurtDur || 0.75)));
      // A carry has no release beat: the clinch's own `hold` is where a body is finally shoved off
      // the knee, and that is the wrong thing to do to a body a running arm still has by the
      // throat. What ends a carry is the THROW (`player.whirlThrow`), which clears `grabDist`, so
      // held, the haul never stops asking for the body at arm's length.
      const off = carry ? 0
        : Math.min(1, Math.max(0, (u - beat.hold) / Math.max(1e-3, 1 - beat.hold)));
      const err = gd - (dist + E.GRAB_OFF * off);
      // ...and a CARRY is fed the carrier's own velocity on top of the correction: the servo alone
      // can never catch a runner, because at the distance where the error is big enough to ask for
      // the run's speed the correction IS the run's speed (measured: at 13.5 u/s the body settled
      // half a body behind and stayed there). The correction then only has to make up the
      // difference, and the body rides exactly where the hold says it does.
      const drawn = err * E.GRAB_RATE + (carry ? player.vel.x * (gx / gd) + player.vel.z * (gz / gd) : 0);
      const cap = carry ? E.CARRY_PULL : E.GRAB_PULL;
      const want = off > 0
        ? Math.max(-E.GRAB_OFF_PUSH, Math.min(E.GRAB_OFF_PUSH, err * E.GRAB_OFF_RATE))
        : Math.max(-cap, Math.min(cap, drawn));
      this.vel.x = (gx / gd) * want;
      this.vel.z = (gz / gd) * want;
      const faceYaw = Math.atan2(gx, gz);
      this.yaw += wrapAngle(faceYaw - this.yaw) * Math.min(1, 14 * dt);
    }

    // ---- the enemy's own punch ----
    if (this.atkT > 0) {
      this.atkT = Math.max(0, this.atkT - dt);
      const moves = this.charMesh.userData.combatMoves;
      const m = moves[this.atkMove] || moves[3];
      const t = 1 - this.atkT / m.total;
      if (!this.atkDone && t >= m.start / m.total) {
        this.atkDone = true;
        const dx = Math.sin(this.yaw);
        const dz = Math.cos(this.yaw);
        const hitP = dist < E.ATK_RANGE && (toP.x * dx + toP.z * dz) > Math.cos(E.ATK_ARC) &&
          player.pos.y + P.HY >= this.pos.y - E.ATK_BAND_DOWN &&
          player.pos.y - P.HY <= this.pos.y + 2 * P.HY + E.ATK_BAND_UP;
        // ...and a fist that lands on the same beat as the player's own M1 does not land at all:
        // the two strikes LOCK (see `player.startClash` — the same test the player's own contact
        // makes, run from this side, so whichever of the two gets there first the outcome is the
        // same one). A lock is not a hit, so the shove below is skipped outright.
        const locked = hitP && player && player.startClash && player.startClash(this, player.attackMove);
        // ...and a fist thrown at an OPEN GUARD (the HUD's skill 2, the scissor's first phase) is
        // BLOCKED instead of landing: the body is staggered by its own swing — it takes the `fold`
        // every other strike puts on it, at zero damage — and nothing at all happens to the player,
        // who then counters with the legs (see `player.scissorCatch`). It returns whether it caught
        // it, which is why it is asked BEFORE the shove rather than after: a caught punch must not
        // push.
        const parried = hitP && !locked && player && player.scissorCatch && player.scissorCatch(this, dx, dz);
        // ...and the same fist thrown at the STANDING GUARD (M1 + M2 — see `player.blockCatch`) is
        // turned away the same way: the body that threw it is staggered, the player takes nothing,
        // and it does not open anything (the block is a stance, not a wind-up). It is asked AFTER
        // the scissor's, because the two are one window each and the scissor's guard is the one that
        // is already open when a skill is running.
        const guarded = !parried && hitP && !locked && player && player.blockCatch && player.blockCatch(this, dx, dz);
        if (hitP && !locked && !parried && !guarded && mgr) mgr.events.push({ type: "enemyHit", enemy: this, dmg: E.ATK_DMG, push: E.ATK_PUSH, up: E.ATK_UP, dx, dz, x: this.pos.x + dx * 0.9, y: this.pos.y + 1.25, z: this.pos.z + dz * 0.9 });
      }
    }

    // ---- the launch pad ----
    // THE PLATE DOES NOT CARE WHOSE FEET ARE ON IT (session 174 — the user's *"make the dummy get
    // launched from the jump pad normaly like a player"*). A body standing on it is fired exactly
    // as the player is: the SAME solver (`launchArc`, player.js) aims the same arc at the same
    // point on the roof, and the flight below is that arc flown with no collision — which is the
    // whole reason the pad solves one rather than shoving (`Player.solveLaunchArc`'s note).
    //
    // It is checked here, before the physics, because the pad beats everything the moment a body
    // is standing on it — and it is gated on the body being ON ITS FEET (`idle` is what the AI
    // plants a live body in), so a body that lands on the plate on its back gets up first and is
    // fired by the plate it is then standing on. That is the whole read: it is the body standing
    // there that goes up. A carried, pinned or juggled body is placed by a move and never reaches
    // this (all three live in states of their own), and the feet are `pos.y`, which is what
    // `padAt` wants — an enemy's origin is its soles, not its centre.
    if (this.grounded && this.padCd <= 0 && (this.state === "idle" || this.state === "walk")) {
      const pad = this.world.padAt ? this.world.padAt(this.pos.x, this.pos.y, this.pos.z) : null;
      if (pad) this.padLaunch(pad, mgr);
    }

    // ---- physics ----
    // A body carried by the throat (the whirl's run — `grabDist`, written by `player.whirlGrab`)
    // is the one body in the game whose position is not its own: the haul above already drives it
    // at the carrier's own speed, so the terrain must not get a vote. A step it could not climb
    // stopped the run dead (measured: the body fell 3.8 u behind a carry that had not finished),
    // and the carrier ran on with an arm out at nothing. Held, it is PLACED — at the carrier's own
    // deck level when it is being hauled in, and on the whirl's own orbit when it is being swung —
    // and the world is left for the moment it is thrown.
    const carried = this.grabDist != null && this.grabT > 0;
    if (this.capoCarry) {
      // CAUGHT BY THE LAUNCH (skill 3 — see `player.capoContact` / `updateVisual`): the body the
      // kick landed on is dragged up on the player's own SOLES, its face pinned to the boots.
      //
      // Like the whirl's orbit, the hold is a PLACEMENT and not a haul — the player writes WHERE the
      // face is held and this is where the body has to be for that to be true — but what is placed
      // is the HEAD rather than the origin: the offset from this body's own origin to its head is
      // MEASURED off the rig on this very frame (the pose and the whole-rig angle both move it), so
      // the face lands on the boot however the body is hanging. The measurement is taken with the
      // group parked at a known point, so all this needs is the difference.
      //
      // The whole-rig angle is the MOVE's, and it is EASED in: the body the carry takes is a ragdoll
      // mid-tumble, and one that snapped from its tumble onto the boot in a single frame is one that
      // teleported. The HEAD is exact either way, so the face is on the sole from the first frame
      // and only the HANG settles — which is what the drag of a limp body by the face looks like.
      const c = this.capoCarry;
      const k = Math.min(1, dt * E.CAPO_CARRY_TURN);
      this.yaw += wrapAngle(c.yaw - this.yaw) * k;
      this.pitch += (c.pitch - this.pitch) * k;
      this.tumble += (0 - this.tumble) * k;
      this.roll += (0 - this.roll) * k;
      this.bodyY = 0;
      this.whirlFlip = 0;
      this.vel.set(0, 0, 0);
      this.grounded = true;
      this.floorY = this.pos.y;
      // WHERE THE BODY GOES is solved at the END of the update, just before the transform is written
      // — see the carry's own block there. It has to be: `inner` and the reaction's SHAPE are both
      // only final by then, and the head this is solved onto is read off the rig.
    } else if (this.headPin) {
      // PINNED AGAINST A WALL (THE WALL CLINCH — see `headPin` and "THE WALL CLINCH" in README.md):
      // exactly the LAUNCH's carry, one verb over. The hold is a PLACEMENT — the player writes where
      // the skull is held and this is where the body has to be for that to be true — and what is
      // placed is the HEAD rather than the origin, so the face stays on the wall however the body is
      // bent. `yaw` and the whole-rig hang are the MOVE's and are EASED in (the body the clinch
      // takes was standing, mid-reaction, or mid-flip, and one that snapped onto the wall in a
      // single frame is one that teleported); the head itself is exact from the first frame either
      // way, because the solve at the tail of this method is what places it.
      //
      // The clinch's own HAUL must never run on this body: the placement is absolute, and a haul
      // would fight it for the whole move. `grabT` is left at zero for that reason (and `grabDist`
      // stays null), which is also what keeps the world's own physics out: a pinned body is held
      // clear of every step and slope, and the world is left for the moment it is thrown.
      const p = this.headPin;
      // A hanging pin (the head scissor) chases a target that is itself sweeping a revolution, so it
      // gets its own, much faster easing — see `E.PIN_TURN_HANG`.
      const k = Math.min(1, dt * (p.hang ? E.PIN_TURN_HANG : E.PIN_TURN));
      this.yaw += wrapAngle(p.yaw - this.yaw) * k;
      this.pitch += ((p.pitch == null ? E.PIN_PITCH : p.pitch) - this.pitch) * k;
      this.tumble += (0 - this.tumble) * k;
      this.roll += (0 - this.roll) * k;
      this.bodyY = 0;
      this.whirlFlip = 0;
      this.vel.set(0, 0, 0);
      this.grounded = true;
      this.floorY = this.pos.y;
    } else if (carried) {
      if (this.carryOrbit) {
        // SWUNG (the whirl's whirlwind — see `player.updateWhirl`): the ORBIT owns where the body
        // is, every axis of it. The arm holding it is going round with the rig, and a haul that can
        // only pull a body toward its carrier can never get its hand back onto a neck going round
        // the outside — so the body is PLACED on the rig's own line instead: held clear of the deck
        // and laid out while it is whirled, and driven straight down into the deck by the slam. The
        // height is ASSIGNED rather than eased for the pose-placement's own reason — the whole
        // point of placing a carried body by its origin is that where it IS is exactly what the
        // move asked for, and an eased draw would lag the hoist and the drive by a third of a beat.
        // The world is left for the moment it is driven into the deck.
        const o = this.carryOrbit;
        this.pos.x = o.x;
        this.pos.z = o.z;
        this.pos.y = o.y;
        this.vel.set(0, 0, 0);
        this.yaw = o.yaw;
        this.grounded = true;
        this.floorY = o.y;
      } else {
        this.pos.x += this.vel.x * dt;
        this.pos.z += this.vel.z * dt;
        const carryFloor = player.pos.y - P.HY;
        this.pos.y += (carryFloor - this.pos.y) * Math.min(1, dt * 12);
        this.vel.y = 0;
        this.grounded = true;
        this.floorY = carryFloor;
      }
    } else if (this.comboY != null && !this.grounded) {
      // JUGGLED (the air combo — see `E.COMBO_PULL`): `comboY` is the player's own altitude, and
      // the body RIDES it rather than falling away from the man hitting it, so the string can be
      // kept going. Its climb is the player's own — the vertical velocity is taken straight, so the
      // two bodies rise and fall TOGETHER rather than one hanging under the other — and the altitude
      // itself is then DRAWN out on the position, which is what leaves the whole thing smooth: an
      // eased draw onto a moving target cannot overshoot, and there is no snap in it anywhere. The
      // world gets no vote while it lasts, which is the carry's own bargain: the altitude it is
      // being held at is the answer. Any reaction qualifies as long as the body is OFF THE DECK —
      // the chain's knee folds it and its clinch holds it, and both of those in the air are just as
      // jugglable as a flip. A LIMP body rides it too: the LAUNCH's kick RAGDOLLS what it catches
      // (the user's own ask for skill 3), so the body the window was opened for is a ragdoll, and
      // leaving it out here was exactly why the air combo could never be thrown — the body fell out
      // from under the string in half a second (measured: it touched down 0.47 s after the kick,
      // while the player was still climbing).
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.vel.y = player.vel.y;
      this.pos.y += this.vel.y * dt;
      this.pos.y += (this.comboY - this.pos.y) * Math.min(1, dt * E.COMBO_PULL);
      this.floorY = this.comboY;
    } else if (this.launchArc) {
      // ---- THE PAD'S FLIGHT (see `padLaunch`) ----
      // The arc IS the position: it is solved once and then flown here, so `vel` is its own
      // derivative and every reader of it (the flight shape's limb swing, the speed FX) sees a
      // real velocity rather than a tween's. It does not collide, for exactly the reason the
      // player's own pad flight does not (`Player.solveLaunchArc`): a launch that clipped a face
      // would stop dead halfway up the wall, and arriving is the entire promise of the move.
      //
      // It ends by PLACING the body on the roof and handing the arrival to `landed`, so the last
      // frame is an ordinary landing — the puff, the dust and the lie a body thrown off a roof
      // gets — rather than something the pad has to fake. `pos.y` is the FEET on this rig, so the
      // centre the arc is solved about comes off the top and goes back on at the bottom.
      const a = this.launchArc;
      this.launchT += dt;
      const t = Math.min(this.launchT, a.D);
      this.pos.x = a.from.x + (a.dx * t) / a.D;
      this.pos.z = a.from.z + (a.dz * t) / a.D;
      this.pos.y = a.from.y + a.vy * t - 0.5 * P.GRAVITY * t * t - P.HY;
      this.vel.x = a.dx / a.D;
      this.vel.z = a.dz / a.D;
      this.vel.y = a.vy - P.GRAVITY * t;
      this.grounded = false;
      if (this.launchT >= a.D) {
        const impact = this.vel.y;           // negative: how fast it was falling on arrival
        this.pos.x = a.to.x;
        this.pos.z = a.to.z;
        this.pos.y = a.to.y - P.HY;
        this.vel.set(0, 0, 0);
        this.launchArc = null;
        this.grounded = true;
        this.floorY = this.pos.y;
        this.landed(impact);
      }
    } else {
    this.vel.y -= P.GRAVITY * dt;
    const prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    // Terrain: a step up this tall is a wall; anything else is walked over (or fallen off).
    const groundAt = this.world.topBelow(nx, nz, Math.max(this.pos.y, prevY) + 2.2, 60);
    let g = groundAt;
    if (!isFinite(g)) g = this.pos.y - 40;
    if (g - this.pos.y > E.STEP && this.pos.y <= prevY + 0.01) {
      this.vel.x = 0;
      this.vel.z = 0;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    // Colliders: shove the box out of anything it is inside, along the shallowest axis. It is
    // also where a body THROWN into a wall is caught and handed to the wall slam (see
    // `wallSlam`), because this is the only place that knows how fast it was going in.
    this.resolveColliders(dt, mgr);
    // Land.
    const floor = this.world.topBelow(this.pos.x, this.pos.z, this.pos.y + 2.2, 60);
    if (isFinite(floor) && this.pos.y <= floor) {
      const wasAir = !this.grounded;
      const impact = this.vel.y;   // negative: how fast it was falling when it touched
      this.pos.y = floor;
      this.vel.y = 0;
      this.grounded = true;
      // `landed` returns true when a ragdoll SKIPPED off the deck instead of staying down, in
      // which case it is still in the air and must not be marked grounded here.
      if (wasAir && this.landed(impact)) this.grounded = false;
    } else if (this.pos.y > floor + 0.02) {
      this.grounded = false;
    }
    // The deck under it, kept for the ground-contact pass below: a body that has just touched
    // down is NOT `grounded` (a skipped ragdoll is deliberately left un-grounded so gravity keeps
    // acting on it), but it is still on the pavement for that one frame and must not be allowed
    // to sweep through it.
    this.floorY = isFinite(floor) ? floor : -Infinity;
    }

    // ---- the ragdoll / the flip ----
    // The finisher throws the body loose and the sweep throws it over: for as long as it is off
    // the ground a flipped body turns end over end about its own X and rolls a little. The two
    // are the same machinery with one difference that matters — a ragdoll cannot be hit and a
    // flip can, because the 4th M1 is supposed to catch the 3rd M1's (see `hit`) — so they run
    // together here and are cleared together. The moment it is back on the deck that spin is
    // WOUND OUT to the turn its LIE asks for and the roll taken to the lie's own (see `LIE`), so
    // the body finishes set in a shape rather than frozen mid-flip on its back.
    // `live` is the
    // manager's "this body is back in the fight" test, and it is where both end.
    if (!this.capoCarry && !this.headPin && (this.ragdoll || this.flip)) {
      if (this.state === "flight" && !this.grounded) {
        if (this.ragdoll) {
          // THE RAGDOLL'S CLOCK (see `E.RAGDOLL_T`). It runs only while the body is actually
          // LOOSE IN THE AIR — the carry and the pin are excluded by the test above, because a
          // body a move is holding is that move's, not the ragdoll's. When the clock is spent the
          // TURN stops where the solve put it (a whole revolution, so the body is square): a body
          // still in the air at that point — a long juggle, a fall off a roof — rides the rest of
          // the fall limp and in one piece, which is the whole of "the animation is the clock's,
          // the fall is the world's".
          this.ragT = Math.min(E.RAGDOLL_T, this.ragT + dt);
          if (this.ragT >= E.RAGDOLL_T) this.tumbleRate = 0;
        }
        this.tumble += this.tumbleRate * dt;
        if (this.ragdoll) {
          // ...and the LEAN (see `E.RAGDOLL_LEAN`): eased in and then held, NOT a roll rate laid on
          // top of the somersault — a rate there corkscrews the body, which was the other half of
          // the user's *"he spins around and it has no like actual sense"*.
          this.roll += (this.ragLean - this.roll) * Math.min(1, dt * E.RAGDOLL_LEAN_RATE);
        } else {
          this.roll += this.rollRate * dt;
        }
      } else {
        const k = Math.min(1, dt * E.SETTLE);
        this.tumble += (this.tumbleTarget - this.tumble) * k;
        this.roll += (this.rollTarget - this.roll) * k;
        if (live) {
          // Up and about: the tumble has wound to a whole turn (so dropping it is invisible) and
          // the roll is level. Clearing them here keeps both numbers small.
          this.tumble -= Math.round(this.tumble / TAU) * TAU;
          this.roll = 0;
          this.ragdoll = false;
          this.flip = false;
          this.ragLie = null;
          this.ragT = 0;
        }
      }
    }

    // ---- reaction timers ----
    this.stepReaction(dt);
    this.updatePose(dt, player);

    // ---- write the transform ----
    this.group.position.set(this.pos.x, this.pos.y + P.HY + this.bodyY, this.pos.z);
    this.group.rotation.y = this.yaw;
    // The ragdoll's tumble and roll are laid on top of the reaction's own angle, so a body that
    // is flipping is still wearing its `flight` shape (and a body on its back is still at the
    // `down` pitch) — the two never fight.
    this.inner.rotation.x = this.pitch + this.tumble;
    this.inner.rotation.z = this.roll;
    // ...and the rig's own Y, which only the WHIRL's hold ever writes: it is the 180° ROLL the
    // beyblade puts a body through (see `carryOrbit.flip` in `player.updateWhirl`). For a body
    // already laid out flat by its pitch this is a turn-over about its own LENGTH — the head keeps
    // pointing where it pointed and the belly goes from the deck to the sky — which is exactly the
    // user's *"turn the dummy 180 degrees"*. Applied BEFORE the pitch (three.js applies `inner`'s
    // euler as X·Y·Z), so it is a roll in the body's own frame rather than a yaw on the world. It
    // is assigned while the hold is live and eased back to zero the moment the body is let go.
    if (this.carryOrbit && this.carryOrbit.flip != null) {
      this.whirlFlip = this.carryOrbit.flip;
    } else if (this.whirlFlip) {
      this.whirlFlip += (0 - this.whirlFlip) * Math.min(1, dt * 12);
      if (Math.abs(this.whirlFlip) < 0.01) this.whirlFlip = 0;
    }
    this.inner.rotation.y = this.whirlFlip || 0;
    // A hit reads as a SNAP in the body's shape, not as a new pose: the whole rig squashes for a
    // few frames and springs back, the same read the player's own landing squash uses. It is the
    // one cue that shows on a body already wearing a reaction pose. The squash is DIRECTIONAL —
    // a strike comes from in front (the body always faces whoever hit it), so the rig compresses
    // front-to-back and bulges sideways and up, which is what a body taking one in the middle
    // actually does. An even squash on all axes would just read as a bug in the scale.
    const f = this.flash * 0.22;
    this.inner.scale.set(1 + f * 0.62, 1 + f * 0.20, 1 - f * 0.72);
    // ...and THE FLASH itself: the whole body goes white for the first half of that squash and
    // snaps back with it. White for exactly one frame of the squash's ramp rather than faded across
    // all of it — a hit flash that EASES reads as the body glowing, and the whole point of it is
    // the cut: the body is white on the contact frame and is not white on the frame after.
    setBodyFlash(this.charMesh, this.flash > 0.7 ? 1 : 0);
    // ...and THE WHIFF'S TELL (see `OUTLINE_CUE_RGB`): a body a move refused on purpose wears its
    // own outline in red at a quarter of the alpha for as long as the cue lasts. Driven here rather
    // than where the cue is ARMED (the player's miss decision) for the reason the flash is: this is
    // the one place in the frame where the body's look is finished, and the tint is a look. The
    // flag is what keeps the way back a transition rather than a `traverse` of thirty nodes a frame
    // for every body standing in the yard that is doing nothing.
    if (this.outlineCue > 0) {
      setOutlineTint(this.charMesh, OUTLINE_CUE_RGB, OUTLINE_CUE_ALPHA);
      this.outlineTinted = true;
    } else if (this.outlineTinted) {
      clearOutlineTint(this.charMesh);
      this.outlineTinted = false;
    }

    // ---- the LAUNCH's CARRY: the head solved onto the boot (see the branch in the physics above) ----
    // It is solved HERE, at the end of the update, because this is the first moment in the frame that
    // the rig is wearing everything it is about to be drawn in: the reaction's shape has been
    // written, `inner` has its final hang and the hit's own squash is on it. The offset from the
    // body's ORIGIN to its HEAD is measured off the rig itself — with the group parked at a known
    // point — and the body is then moved so the two meet, so the face is on the boot however the
    // body is hanging and whichever way the reaction has folded it. Nothing is eased: a PLACED body
    // is exactly where the move asked for it (the same bargain the whirl's orbit makes).
    // ...and THE WALL CLINCH's own pin is the same solve, on the same terms (see `headPin`): the
    // skull is put on the wall by MEASURING where the head actually is on this frame's rig and
    // moving the body by the difference. The two are one block because they are one idea — a body
    // held by its head — and a second copy would be a second place for it to go wrong.
    const pin = this.capoCarry || this.headPin;
    if (pin) {
      this.group.position.set(0, P.HY, 0);
      this.group.updateMatrixWorld(true);
      this.headPoint(_capoCarryV);
      this.pos.x = pin.x - _capoCarryV.x;
      this.pos.y = pin.y - _capoCarryV.y;
      this.pos.z = pin.z - _capoCarryV.z;
      this.group.position.set(this.pos.x, this.pos.y + P.HY + this.bodyY, this.pos.z);
      this.group.updateMatrixWorld(true);
    }
    // (A body pinned to a wall is stood on the deck by the ground solve at the tail of this method
    //  like the clinch is — see the `wallpin` case there. It used to be a lift-only clamp here,
    //  which left the pin's own height fighting the pose's: the feet were pushed onto the deck and
    //  the head then rode UP the face by whatever the pose's span was over the pin's, which is a
    //  number the pose owns and no placement should be guessing at. Solved on the lowest vertex
    //  instead, the pose decides the height it stands at and the pin is left to do the one job it
    //  is for — holding the skull against the stone.)

    // ---- ground contact ----
    // Nothing may be under the pavement it is lying on. Two reactions need it by hand, because in
    // both the contact point is decided by where the POSE happens to put a limb and by the pitch
    // of the trunk, neither of which knows where the ground is:
    //   * getting up — whose pivot is its feet;
    //   * a ragdoll that has come back DOWN — the finisher's spin is wound out to a whole turn
    //     while the body is already on the deck, so it sweeps through the pavement on the way
    //     (measured: the head 0.9 under, at its worst). Whichever part is lowest becomes the
    //     pivot, which is what a body flopping flat actually rolls over.
    //   * the WALL SLAM, whose whole middle is a body lying on the deck and getting up off it —
    //     its angle is authored (`HURT_BODY.wallslam`) so the pose never knows where the floor
    //     is, and the contact has to be measured like every other lying contact in the game.
    //     `groundOn` only ever LIFTS, so the first seconds of the slam — a body pinned up the
    //     face with its feet off the deck — are left exactly where `pos.y` puts them.
    // Both are LIFTS only, so a body that is legitimately in the air is never dragged down.
    //
    // ...and the get-up VARIANTS (the ones that carry an angle curve) are the third case, and the
    // only one that has to be solved both ways. A get-up's contact point MOVES through the body —
    // the back, then a shoulder, then the hip, then a knee, then a foot — so the body is rested on
    // whatever part of it is lowest (`restOnDeck`), with the variant's own `bodyY` as a LIFT on
    // top (the kip-up hops as its feet catch it). Lifting only would leave the shoulders hanging
    // in the air through the whole middle of it.
    //
    // The plain `getup` is on the same solve now, with no lift. It used to be lifted by its FEET
    // alone, and measured that way the whole body hung a sixth of a metre off the deck for the
    // middle two thirds of the move: the rig turns about its own origin, so the feet swing up out
    // of the way early and after that nothing was holding the body down. Solved on the lowest part
    // instead, the seat and the lower back carry it off the deck exactly as a body sitting up does,
    // and its pitch path — which is the part that was tuned — is untouched.
    const gb = HURT_BODY[this.hurtKind];
    if (this.state === "getup") {
      this.restOnDeck(this.bodyMeshes(), gb && gb.angle ? this.bodyY : 0);
    }
    // ...and the CLINCH is the fourth, and the one where the contact is least obvious: a body held
    // by the head is standing on its own two feet, but WHICH part of them is touching is decided by
    // a pose no independent number knows — the trunk is dragged over the attacker's hands, the neck
    // is cranked, and the legs take the shape's leftovers. Left unsolved it hangs (measured: every
    // vertex 0.29 off the deck, i.e. the victim floating), and the only thing that used to be
    // holding it down was the whole-rig PITCH, which pushed the toes into the pavement as a side
    // effect of turning the body forwards (see `HURT_BODY.clinch`). Solved on the lowest vertex
    // instead, the contact is measured like every other ground contact in the game, the pitch is
    // free to be a small lean rather than a lever, and the body rises and falls with the shape —
    // which is what "dragged down onto a knee" should do anyway.
    //
    // ...with ONE exception, and it is the running lunge's (`clinchRoll`): that body is not standing
    // on the deck at all — it is held and rolled on a BALL, so its `pos.y` is not a deck line but
    // wherever the ball placement puts its origin (half a metre UNDER the deck at the quarter turns,
    // and above it at the others). Solving its lowest vertex onto `pos.y` therefore drags the tuck
    // through the pavement by exactly the radius it is rolling on (measured: 0.80 under at the worst
    // of the turn, on a body whose own placement was exact). A body whose whole placement is a
    // move's — `carryOrbit` — is not ground-solved anywhere else in this file either.
    // (The exception is the ORBIT and not the `hurtKind`: a body that has been let go — or whose
    // reaction ran out under it — is standing here again like any clinch, and skipping the solve for
    // it would drop it straight through the deck.)
    else if (this.state === "clinch" && !(this.hurtKind === "clinchRoll" && this.carryOrbit)) {
      this.restOnDeck(this.bodyMeshes(), 0);
    }
    else if (!this.capoCarry && !this.headPin && (this.state === "down" || (this.ragdoll && this.pos.y <= this.floorY + 0.75))) this.groundOn(this.bodyMeshes());
    // ...and the WALL SLAM is solved BOTH ways like the get-ups, because its whole middle is a
    // body resting on the deck: `groundOn` only ever lifts, and a body lying on a face-solved
    // pose sits half a metre off the pavement without a number to sink it. Its ends stand up, so
    // the solve is a no-op there — the same measure every other lying contact in the game uses.
    else if (this.state === "wallslam") this.restOnDeck(this.bodyMeshes(), 0);
    // ...and the PUSHBACK is the fifth, solved the same way as the get-up variants (and for the
    // same reason): its whole middle is a body going over on the deck and coming up off its
    // hands, and its angle is authored (see `HURT_BODY.pushback`) so the pose never knows where
    // the floor is. Its curve's `bodyY` is handed over as the LIFT on top of that solve — the
    // hop that gets the flip off the deck — exactly as the kip-up's is.
    else if (this.state === "pushback") this.restOnDeck(this.bodyMeshes(), this.bodyY);
    // ...and THE WALL CLINCH's own hold is the last of them, and the one the pin leaves open: the
    // pin places the SKULL on the stone (x and z, and it does that exactly), and where the body
    // hangs from there is the pose's business, so the contact is measured on the lowest vertex like
    // every other standing contact in the game. The deck is the one the move started on (it is the
    // wall's own base, written into the pin by `startWallBeat`), so the body is stood on the floor
    // it was taken from and the head is driven along the face rather than the whole rig being lifted
    // to wherever the pin's own height happened to be.
    else if (this.state === "wallpin") {
      // ...with ONE exception, and it is THE HEAD SCISSOR's own hold (`headPin.hang`): that body
      // is not standing on anything. The man clamping its neck has it OFF its feet for the whole of
      // the swing, and where it hangs is the pose's business entirely (see `poseHurtScissor`) — so
      // the deck solve is skipped and the pin's own placement is left exactly as it stands. Solve
      // it here and the pose's whole dangle is thrown away every frame: the feet are dragged back
      // onto the pavement, the body is stood up, and a body being held up by the neck reads as a
      // body standing next to a man doing a cartwheel. (Measured through the live loop with the
      // solve left in: the victim's feet never left `pos.y` and the hang went with them.)
      if (this.headPin && this.headPin.hang) {
        this.floorY = this.pos.y;
      } else {
        this.pos.y = this.headPin.deck != null ? this.headPin.deck : this.pos.y;
        this.floorY = this.pos.y;
        this.restOnDeck(this.bodyMeshes(), 0);
      }
    }
  }

  // The lowest point of `probes`, in world space — the one number every ground contact is
  // measured against.
  lowestOf(probes) {
    if (!probes.length) return Infinity;
    this.group.updateMatrixWorld(true);
    let low = Infinity;
    for (const { o, bb } of probes) {
      o.updateWorldMatrix(true, false);
      for (let c = 0; c < 8; c++) {
        _v.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld);
        if (_v.y < low) low = _v.y;
      }
    }
    return low;
  }

  // Lift the body — never drop it — until the lowest of `probes` is standing on `pos.y`.
  groundOn(probes) {
    const low = this.lowestOf(probes);
    const drop = low - this.pos.y;
    if (!(drop < 0)) return;          // (also catches the no-probes Infinity)
    this.group.position.y -= drop;
    this.group.updateMatrixWorld(true);
  }

  // ...and the same solve BOTH ways: put the lowest of `probes` exactly on `pos.y`, whether that
  // means lifting the body or dropping it, then add `lift` on top. For a body that is RESTING on
  // the deck rather than being kept out of it — see the get-up variants — this replaces the
  // authored height entirely: the contact is measured, not guessed, so it cannot float and cannot
  // sink.
  restOnDeck(probes, lift) {
    const low = this.lowestOf(probes);
    if (!isFinite(low)) return;
    this.group.position.y += (this.pos.y - low) + (lift || 0);
    this.group.updateMatrixWorld(true);
  }

  // ...and every mesh on the rig, for the ragdoll case, where any part may be the one touching.
  bodyMeshes() {
    // Only a NON-EMPTY list is cached: the rig is built asynchronously (see `build`), so a call
    // that happens to land before it arrives would otherwise cache "no meshes" forever and every
    // ground solve from then on would be a no-op.
    if (this._bodyMeshes && this._bodyMeshes.length) return this._bodyMeshes;
    const list = [];
    this.group.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.attributes.position) {
        o.geometry.computeBoundingBox();
        list.push({ o, bb: o.geometry.boundingBox });
      }
    });
    this._bodyMeshes = list;
    return list;
  }

  startAttack() {
    const moves = this.charMesh.userData.combatMoves;
    this.atkMove = 3;
    this.atkT = moves[3].total;
    this.atkDone = false;
    this.atkCd = E.ATK_CD + Math.random() * 0.8;
  }

  // `impact` is how fast the body was falling when it touched (negative). Returns true when a
  // ragdoll SKIPPED off the deck — it is still airborne and the caller must not ground it.
  landed(impact) {
    if (this.state === "flight") {
      const vy = impact || 0;
      if (this.ragdoll && this.bounces > 0 && -vy > E.TUMBLE_HARD) {
        // ...and only while the SKIP ITSELF still fits inside the ragdoll's clock (see
        // `E.RAGDOLL_T`): the clock covers the whole loose phase, not just the throw, so the
        // hardest hits — which the lift clamp has already put right on the ceiling — land and STAY
        // instead of skipping a second time past it. `2 v / g` is the hang the skip would buy, and
        // `this.bounces - 1` is the count the skip below would leave behind.
        const skipV = -vy * (E.BOUNCE - (this.bounces - 1) * 0.08);
        if (this.ragT + (2 * skipV) / P.GRAVITY <= E.RAGDOLL_T) {
          this.bounces--;
          this.vel.y = skipV;
          this.vel.x *= 0.72;
          this.vel.z *= 0.72;
          // ...and the spin is RE-SOLVED over the shorter hang the skip buys, rather than halved: the
          // rest of the turn has to be spent before it comes down again, or the body arrives at the
          // deck mid-flip and the wind-out then has a whole quarter turn of it left to do (see
          // `ragSpinRate`). `rollRate` is 0 for a ragdoll and stays 0 — the lean is what replaces it.
          this.tumbleRate = this.ragSpinRate();
          this.rollRate = 0;
          if (this.effects) {
            this.effects.puff(this.pos.x, this.pos.y + 0.08, this.pos.z, 1.5, [0.85, 0.83, 0.78], 0.24);
          }
          if (this.sfx && this.sfx.land) this.sfx.land(0.26);
          return true;
        }
      }
      // ...and it is the DECK CLOCK that decides how long he stays there (see `E.DOWN_LIE`), not
      // the stun he arrived with: the air is over, and how long a body lies on the pavement is
      // the same question whoever put it there.
      this.setState("down", E.DOWN_LIE);
      this.hurtKind = "down";
      this.hurtT = 0;
      // WHICH WAY UP it ends (see `LIE`): a ragdoll already picked its own at the throw (the solved
      // spin had to know where it was going — see `ragSpinFor`), so only the bodies that are not
      // loose pick here, from how they went down. Either way the tumble is then wound into the lie
      // and the sideways wobble to the lie's own roll instead of to 0, so a body rolls over onto its
      // front or its side as it settles rather than always landing flat on its back.
      this.tumbleRate = 0;
      this.rollRate = 0;
      this.setLie(this.ragdoll && this.ragLie
        ? this.ragLie
        : pickLie({ roll: this.roll, knock: this.hurtKnock, air: this.hurtAir }, this.liePrev));
      // The deck marks the landing — and for a body thrown LOOSE that has to be an IMPACT, not a
      // puff. What was missing from the ragdoll more than anything else was the weight at the end of
      // it: a body that spins through the air and then is simply lying there has no sense of having
      // ARRIVED anywhere. So the harder it touched down, the more deck it moves — a ground ring, a
      // second churn of dust under the first, and a heavier thud — all scaled off the fall speed it
      // actually landed at (`vy`, negative), so a skip that barely catches the deck is still a puff.
      if (this.effects) {
        const lp = Math.min(1, Math.max(0, -vy / 14));
        const dust = [0.85, 0.83, 0.78];
        this.effects.puff(this.pos.x, this.pos.y + 0.1, this.pos.z, 2.2 + lp * 1.6, dust, 0.30 + lp * 0.22);
        if (this.ragdoll) {
          // The deck marks the landing with a LANDING's mark (see `landDust`) — a thin ring and the
          // dust it threw, wide because a loose body comes down over a lot of ground. It used to be a
          // `shockwave`, which put the slam's crater under a ragdoll.
          this.effects.landDust(this.pos.x, this.pos.y + 0.05, this.pos.z, 0.30 + lp * 0.45, dust, null, null, 1.25);
          this.effects.puff(this.pos.x, this.pos.y + 0.06, this.pos.z, 1.3 + lp * 1.1, dust, 0.20 + lp * 0.18);
        }
      }
      if (this.sfx) this.sfx.land ? this.sfx.land(this.ragdoll ? 0.34 + 0.30 * Math.min(1, -vy / 14) : 0.4) : null;
    }
    return false;
  }

  stepReaction(dt) {
    const stunLeft = this.hurtDur - this.hurtT;
    switch (this.state) {
      case "fold":
        if (stunLeft <= 0) this.standUp();
        break;
      case "clinch":
        // Held for the whole stun; when it ends he is let go standing (there is nowhere for a
        // body that was just walked onto a knee to be except back on its feet, and a fall would
        // undo the beat the next move is waiting for).
        if (stunLeft <= 0) this.standUp();
        break;
      case "trip":
        if (this.hurtT >= E.TRIP_FALL) {
          // Hand over to the DECK, and take the SHAPE with it. `hurtKind` has to change with the
          // state: `setState` resets the pose clock, so leaving it on "trip" replayed the whole
          // fall from the top — the body it had just finished putting on the floor snapped
          // upright and fell a second time. The trip's shape ENDS on the deck and `down`'s
          // STARTS there (see `FALLEN` in streetwear.js), so the swap costs nothing.
          this.setState("down", E.DOWN_LIE);
          this.hurtKind = "down";
          // A body swept off its feet lands on its back — it is travelling BACKWARDS on the way
          // down — but it can still come to rest rolled onto a side (see `lieWeights`).
          this.setLie(pickLie({ roll: 0, knock: this.hurtKnock, air: false, backwards: true }, this.liePrev));
        }
        break;
      case "wallslam": {
        // THE SLAM'S OWN CLOCK (see `wallSlam` and `E.WALL_*`). Two things happen here that
        // the pose cannot do for itself:
        //
        //   1. WHERE THE BODY IS ON THE WAY DOWN THE FACE. The rig is held on the wall rather
        //      than simulated while it is limp on it, so its height is driven: `pos.y` falls from
        //      where it arrived to the deck over the slide's own slice of the clock (frames 2-6),
        //      which is what reads as sliding down the wall rather than dropping off it.
        //   2. THE STEP CLEAR OF THE WALL on the way back up (frames 46-55). The user's "staggering
        //      backward" cannot be a step BACKWARDS for a body facing out of the wall — backwards
        //      from its own facing is straight INTO the face — so it is spent OUTWARD instead: a
        //      push along the face's own normal, tapered so it reads as a step and not a slide.
        const ground = this.world.topBelow(this.pos.x, this.pos.z, this.pos.y + 2.2, 60);
        const floor = isFinite(ground) ? ground : 0;
        const s = Math.min(1, this.hurtT / E.WALL_SLIDE);
        this.pos.y = this.wallY0 + (floor - this.wallY0) * (s * s * (3 - 2 * s));
        if (this.hurtT > E.WALL_T * 0.74 && this.hurtT < E.WALL_T * 0.96) {
          const k = 1 - Math.abs((this.hurtT / E.WALL_T - 0.85) / 0.11);
          const push = E.WALL_STAGGER * Math.max(0, k);
          this.vel.x = this.wallNx * push;
          this.vel.z = this.wallNz * push;
        }
        if (this.hurtT >= E.WALL_T) {
          // A body that was already knocked out when it hit the wall still has to go down and
          // come back: `down` is where the KO recovery lives (see the tail of this method).
          if (this.hp <= 0) {
            this.hurtKind = "down";
            this.setLie("back");
            this.setState("down", E.KO_DOWN_T);
          } else {
            this.standUp();
          }
        }
        break;
      }
      case "pushback": {
        // THE PUSHBACK (see the branch in `hit`). One authored performance on one pinned clock —
        // the whole read is `E.PUSH_T` and nothing shortens it, so unlike every other reaction
        // this one does not end on the stun: it ends on its own last frame, back on its feet.
        if (this.hurtT >= E.PUSH_T) this.standUp();
        break;
      }
      case "dizzy": {
        // SET UP DAZED (see `dizzy`). The body is on its feet the whole time and simply stands
        // there reeling; when the clock runs out it shakes it off and is back in the fight.
        if (stunLeft <= 0) this.standUp();
        break;
      }
      case "wallpin": {
        // THE WALL CLINCH (see `headPin` and "THE WALL CLINCH" in README.md). The state is not on a
        // clock of its own: it lasts exactly as long as the player keeps the hold. Written every
        // frame by `player.js`, and CLEARED by it on the frame the hold ends (the hurl, a respawn,
        // the player being interrupted) — and this is what turns that into a body: the frame the
        // pin goes is the frame the body is free again. It deliberately does not run out on
        // `hurtDur`, because a hold that let go on a timer while the attacker was still kneeing
        // would drop the body out of the move mid-beat.
        if (!this.headPin) this.standUp();
        break;
      }
      case "down": {
        if (this.koT > 0) break;
        const downFor = this.hp <= 0 ? E.KO_DOWN_T : 0;
        if (downFor > 0 && this.hurtT >= downFor) {
          // Out cold, and now back up — with the reading taken BEFORE the health is handed back,
          // so the get-up this body picks is the one a knocked-out body deserves.
          this.hp = E.KO_HP;
          this.koT = 0;
          this.startGetup(true);
        } else if (downFor === 0 && this.hurtT >= E.DOWN_LIE) {
          this.startGetup(false);
        }
        break;
      }
      case "getup":
        if (this.hurtT >= this.getupTime()) this.standUp();
        break;
    }
    if (this.hp <= 0 && this.koT <= 0 && (this.state === "down" || this.state === "flight")) {
      // Out cold: hold the deck, then get back up with a fresh grip on the fight.
      this.koT = 0.001;
    }
  }

  // -------------------------------------------------------------------------
  // THE WALL SLAM (see `E.WALL_*`). A thrown body that arrives at a face hard enough does not
  // bounce off it: it is pinned on it and plays the whole recovery there — splat, slide,
  // crumple, daze, anchor, push-up, rise, and a snap back onto the stance. It is a reaction like
  // any other, so it ends with `setState("idle")` and hands the body back to the fight, and its
  // whole-rig angle is `HURT_BODY.wallslam`'s own curve.
  //
  // What is NOT here is the "thrown" test: `resolveColliders` owns that, because it is the one
  // place that knows how fast the body was actually going into the face when it got there.
  // -------------------------------------------------------------------------
  wallSlam(nx, nz, speed, mgr) {
    const ground = this.world.topBelow(this.pos.x, this.pos.z, this.pos.y + 2.2, 60);
    const floor = isFinite(ground) ? ground : 0;
    // Where on the face it hit, clamped: a body that arrives off the top of a tower starts its
    // slide at the wall rather than a storey above it (see `E.WALL_START`).
    this.wallY0 = Math.min(this.pos.y, floor + E.WALL_START);
    this.wallNx = nx;
    this.wallNz = nz;
    // The splat is FACED OUT OF THE WALL. The body was thrown AT the face, so it arrives back
    // first and ends pressed on it looking back the way it came — which is also, for every hit
    // the player throws, back at the player.
    this.yaw = Math.atan2(nx, nz);
    this.hurtKind = "wallslam";
    this.ragdoll = false;
    this.flip = false;
    this.bounces = 0;
    // The tumble is SPENT rather than wound out: this reaction is authored from a body standing
    // square on a wall, and a body that arrived mid-flip has to be put there before its first
    // frame is drawn or the shape starts from wherever the spin happened to be.
    this.tumble = 0;
    this.roll = 0;
    this.tumbleRate = 0;
    this.rollRate = 0;
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this.hurtPose = 1;      // this is an impact: the reaction layer is already at full weight
    this.linkPose();
    this.setState("wallslam", E.WALL_T);
    if (mgr) {
      // The FX are thrown off the FACE, in the face's own colour (see `World.surfaceColorAt`) —
      // sampled TOWARD the wall rather than at the body's centre: the solver has just pushed the
      // body clear of the face, so the nearest solid from its centre is the deck.
      const col = this.world.surfaceColorAt(
        this.pos.x - nx * P.HX * 0.85, this.pos.y + P.HY, this.pos.z - nz * P.HZ * 0.85, [0, 0, 0], 0.45);
      mgr.events.push({
        type: "wallslam", enemy: this, speed,
        x: this.pos.x, y: this.pos.y + P.HY, z: this.pos.z,
        nx, nz,
        color: [col[0], col[1], col[2]],
      });
    }
  }

  resolveColliders(dt, mgr) {
    const w = this.world;
    if (!w.queryXZ) return;
    this.qbuf = this.qbuf || [];
    this.qbuf.length = 0;
    w.queryXZ(this.pos.x - P.HX - 1.5, this.pos.z - P.HZ - 1.5, this.pos.x + P.HX + 1.5, this.pos.z + P.HZ + 1.5, this.qbuf);
    const feet = this.pos.y;
    const head = this.pos.y + P.HY * 2;
    // The hardest thing this body ran into this frame, for the wall slam: which way it was pushed
    // out of the face, and how fast it was going when it got there. The speeds are read off the
    // velocity the frame STARTED with, so which collider happens to be resolved first (each one
    // zeroes its own axis as it goes) cannot change the answer.
    const vx0 = this.vel.x;
    const vz0 = this.vel.z;
    let hitNx = 0;
    let hitNz = 0;
    let hitSpeed = 0;
    for (const c of this.qbuf) {
      if (c.maxY <= feet + 0.25 || c.minY >= head) continue;
      const ox = Math.min(this.pos.x + P.HX, c.maxX) - Math.max(this.pos.x - P.HX, c.minX);
      const oz = Math.min(this.pos.z + P.HZ, c.maxZ) - Math.max(this.pos.z - P.HZ, c.minZ);
      if (ox <= 0 || oz <= 0) continue;
      // A KERB IS NOT A WALL (see `E.WALL_MIN_H`): it is resolved against like anything else, but
      // it can never be the face a body splats on.
      const tall = c.maxY - c.minY >= E.WALL_MIN_H;
      if (ox < oz) {
        const push = (this.pos.x < (c.minX + c.maxX) * 0.5 ? -1 : 1) * ox;
        this.pos.x += push;
        this.vel.x = 0;
        if (tall) {
          // How fast it was going INTO the face: the push is out of it, so the approach is the
          // component of the frame's own velocity against the push.
          const into = vx0 * (push < 0 ? 1 : -1);
          if (into > hitSpeed) {
            hitSpeed = into;
            hitNx = push < 0 ? -1 : 1;
            hitNz = 0;
          }
        }
      } else {
        const push = (this.pos.z < (c.minZ + c.maxZ) * 0.5 ? -1 : 1) * oz;
        this.pos.z += push;
        this.vel.z = 0;
        if (tall) {
          const into = vz0 * (push < 0 ? 1 : -1);
          if (into > hitSpeed) {
            hitSpeed = into;
            hitNz = push < 0 ? -1 : 1;
            hitNx = 0;
          }
        }
      }
    }
    // ...and a THROWN body that got there hard enough SLAMS (see `E.WALL_SPEED`). Only a body that
    // is off its feet qualifies: a ragdoll (the finisher's own throw) or a `flight` (a slide's
    // launch, the whirl's pop, a blast). A body merely shoved backwards into a wall while it is
    // standing is simply stopped by it, which is what it was before this existed.
    if (hitSpeed >= E.WALL_SPEED && this.state !== "wallslam" && (this.ragdoll || this.state === "flight")) {
      this.wallSlam(hitNx, hitNz, hitSpeed, mgr);
    }
  }

  // -------------------------------------------------------------------------
  // The body: base (idle/walk) then one reaction shape over the top, plus the angle and drop
  // that shape is drawn at. Every layer is an ABSOLUTE pose, so they are applied in order and
  // the reaction gets the whole body once it is faded in.
  // -------------------------------------------------------------------------
  updatePose(dt, player) {
    const ud = this.charMesh && this.charMesh.userData;
    if (!ud) return;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const moving = this.state === "walk" || (this.state === "idle" && sp > 0.4);
    const wantRun = moving ? Math.min(1, sp / 2.2) : 0;
    this.runBlend = approach(this.runBlend, wantRun, dt / 0.18);
    if (this.runBlend > 0.004) this.phase = (this.phase + Math.min(1.8, sp * 0.17) * dt) % 1;
    this.idlePose = approach(this.idlePose, 1 - this.runBlend, dt / 0.18);
    if (ud.poseRun) ud.poseRun(this.phase, this.runBlend, Math.min(1, sp / 7));
    this.idleTime += dt;
    if (ud.poseIdle && this.idlePose > 0.004) ud.poseIdle(this.idlePose, this.idleTime);

    // The reaction layer.
    const react = this.state === "fold" || this.state === "clinch" || this.state === "trip" ||
      this.state === "flight" || this.state === "down" || this.state === "getup" || this.state === "wallslam" ||
      this.state === "pushback" || this.state === "dizzy" || this.state === "wallpin";
    this.hurtPose = approach(this.hurtPose, react ? 1 : 0, dt / (react ? E.POSE_IN : 0.18));
    // ...AND THE FADE-OUT IS REAL (session 155 — the user's *"make the dummy get up animation faster
    // and smoother"*). That 0.18 s ease-out used to have NO consumer at all: the block below was
    // gated on `react`, so leaving a reaction stopped calling `poseHurt` on the very frame the state
    // changed and the rig swapped from the reaction's last frame to the idle's first in ONE frame.
    // Measured on the rig through every get-up: a **0.47 rad** single-frame step on the largest
    // joint at the handover, against ~0.07 on the frames around it — the biggest jerk in the move,
    // and the whole of why a body that had just stood up read as POPPING upright. The shape and the
    // clock it left off at are therefore kept (see `reactKind` / `reactU` below) and the same call
    // is made at the decaying weight until the weight is spent: a real cross-fade into the idle.
    if ((react || this.hurtPose > 0.004) && ud.poseHurt) {
      const dur = this.hurtDur || 0.9;
      let u = 0;
      // The fold and the clinch are run out over the whole STUN rather than over a couple of
      // frames. Both shapes arrive in the first tenth of that and hold for the rest of it, so a
      // longer clock costs them nothing at the front — and it is the only thing that buys the
      // overlap: the head leads, the trunk follows and the legs give last (see `poseHurtClinch`),
      // which is invisible when the whole arrival is one frame long. It also means the body is
      // still coming out of this reaction when the chain's next M1 arrives, instead of standing
      // there fully recovered.
      if (this.state === "fold") u = Math.min(1, this.hurtT / Math.max(E.FOLD_RAMP, Math.min(0.9, dur)));
      else if (this.state === "clinch") u = Math.min(1, this.hurtT / Math.max(0.5, Math.min(0.95, dur)));
      else if (this.state === "trip") u = Math.min(1, this.hurtT / E.TRIP_FALL);
      else if (this.state === "down") u = Math.min(1, this.hurtT / 0.35);
      else if (this.state === "getup") u = this.getupU();
      // ...and the WALL SLAM is one clock from end to end, because it is one authored performance
      // (see `poseHurtWallSlam`): the shape and the whole-rig angle are keyed to the same `u`.
      else if (this.state === "wallslam") u = Math.min(1, this.hurtT / E.WALL_T);
      // ...and so is the PUSHBACK (see `poseHurtPushback`), on its own pinned clock.
      else if (this.state === "pushback") u = Math.min(1, this.hurtT / E.PUSH_T);
      // ...and the DIZZY is spread over its whole state, so the reel builds, holds and unwinds
      // across it rather than arriving in a frame (see `poseHurtDizzy`).
      else if (this.state === "dizzy") u = Math.min(1, this.hurtT / Math.max(0.2, this.hurtDur || E.DIZZY_T));
      // ...and the WALL CLINCH's is the MOVE's own hold clock, handed over on the pin (see
      // `headPin.u`): the victim is kneed while the attacker is kneeing and is let go when he lets
      // go, so the shape's own beats have to be the player's, not a stun of its own.
      else if (this.state === "wallpin") u = Math.min(1, this.headPin ? this.headPin.u : 0);
      // ...and the flight has three clocks: the sweep that catches a body off its feet is knocked on
      // in a couple of frames, a body LIFTED off the deck needs its shape's whole arrival to be a
      // lift (see `poseHurtLaunch`), and the flip is thrown up for a solved 0.5 s, so its shape is
      // spread over `E.FLIP_T` and lands on `FALLEN` exactly as it comes down (see `E.FLIP_*`).
      else if (this.state === "flight") {
        const ft = this.hurtKind === "launch" ? E.LAUNCH_T : this.hurtKind === "upper" ? E.UPPER_T : this.hurtKind === "flip" ? E.FLIP_T : 0.3;
        u = Math.min(1, this.hurtT / ft);
      }
      // ...and ONE reaction wears a clock that is not its own: a body the whirl has by the throat
      // is dragged on the MOVE's beats, not on its own stun (see `poseHurtWhirlDrag`). The man
      // writes the whole move's progress onto the orbit he is placing the body on, so the victim
      // is in the drag while he is dragging, hoisted while he hoists and braced while he drives —
      // whatever moment of the lunge the neck happened to be taken at.
      if (this.hurtKind === "whirlDrag" && this.carryOrbit && this.carryOrbit.ph != null) {
        u = this.carryOrbit.ph;
      }
      // THE FADE'S OWN SHAPE AND CLOCK (see the note above the gate). While the state is IN the
      // reaction set the two are just the body's own, remembered here for the frame the state
      // leaves. Once it has, every branch of the chain above tests `this.state` and so picks none of
      // them (u is left at 0) — so the clock it left off at is put back and the same shape is drawn
      // on it, at whatever weight is left. It is `1` for a get-up (its move is 0..1 and it finishes
      // at the top) and the held hold for a fold or a clinch, which is exactly the frame the fading
      // layer should be holding.
      if (react) { this.reactKind = this.hurtKind; this.reactU = u; }
      else u = this.reactU != null ? this.reactU : u;
      const reactive = react ? this.hurtKind : (this.reactKind || this.hurtKind);
      // The ragdoll's tumble angle goes along too: the flight shape's limbs swing with the turn
      // (see `poseHurtFlight`), which is what stops a body in mid-flip reading as a pose.
      ud.poseHurt(this.hurtPose, reactive, u, this.tumble, this.headPin ? this.headPin.jolt : 0);
      // ...and the LIE overlay rides on top of the shape (see `poseLie`): a body lying on a SIDE
      // has the sprawl's limbs standing on end, so they fold as it rolls, by how far into the roll
      // it is. Only the two side lies (a lie whose own roll is level leaves the shape alone), and
      // only while the body is lying or getting up.
      const lieRoll = (LIE[this.lie] || LIE.back).roll;
      if (lieRoll !== 0 && (this.state === "down" || this.state === "getup") && ud.poseLie) {
        const w = Math.min(1, Math.abs(this.roll / lieRoll));
        if (w > 0.004) ud.poseLie(lieRoll < 0 ? 1 : -1, w);
      }
    }
    // The attack pose, over the top of everything (it owns the body while it lasts). A body in a
    // CLASH is the exception: it wears the lock's own shape instead, with its fist SOLVED onto
    // whatever weapon the player's move brought — read LIVE off the player's rig, in this body's
    // own frame, exactly the way the clinch's two hands are solved onto a head. That is what makes
    // the pairing a contact for every variant rather than two animations that happen to be near
    // each other (see `poseClash` in streetwear.js).
    if (this.state === "clash" && ud.poseClash) {
      const c = player && player.clash;
      if (c && c.e === this && player.clashWeapon && ud.setClashPoint) {
        // The body's own transform is written at the END of `update`, so push this frame's version
        // of it out before the target is walked into this frame's frame — the fist is the one thing
        // in the lock that has to be exactly where it is drawn ON the player's weapon.
        this.group.position.set(this.pos.x, this.pos.y + P.HY + this.bodyY, this.pos.z);
        this.group.rotation.y = this.yaw;
        this.group.updateMatrixWorld(true);
        this.charMesh.updateWorldMatrix(true, false);
        const lp = player.clashWeapon(_v);
        this.charMesh.worldToLocal(lp);
        ud.setClashPoint(lp.x, lp.y, lp.z);
      } else if (ud.clearClashPoint) {
        ud.clearClashPoint();
      }
      ud.poseClash("enemy", this.clashMove >= 0 ? this.clashMove : 3, this.stateT, this.clashDrive, this.clashJolt);
    } else if (this.atkT > 0 && ud.poseAttack && !react) {
      const m = this.charMesh.userData.combatMoves[this.atkMove];
      const u = 1 - this.atkT / m.total;
      ud.poseAttack(1, this.atkMove, Math.max(0, Math.min(1, u)));
    } else if (ud.clearClashPoint) {
      // Nothing is locked, so the weapon point is dead: leaving it set would have the NEXT lock's
      // first frames solve the fist onto wherever the player's knee was last time.
      ud.clearClashPoint();
    }

    // The angle and the drop ride the reaction's own clock, so a sweep FALLS over rather than
    // snapping flat: the pitch is read off the same `u` the pose is.
    //
    // ...and the GET-UP variants are the exception: they carry their own whole-rig angle CURVE
    // (`HURT_BODY[...].angle`), and it is assigned rather than eased. Its ends are exactly the
    // angle `down` left the body at and the angle standing wants, so there is nothing to smooth —
    // and a kip-up's pitch leaves the deck fast enough that the 8/s easing below would lag it by
    // a third of the move. `bodyY` on those is a LIFT off the solved deck contact (see
    // `restOnDeck`), not a position. The plain `getup` has no curve and keeps the eased path it
    // was tuned on.
    //
    // ...and the third thing here is the body's SETTLED ORIENTATION, which is not the reaction's
    // at all: which way up a knocked-down body lies is its LIE (see `LIE`). It is read while the
    // body is in `down`, and spent at the front of its get-up, where the body rolls out of that
    // lie and onto its back (see `getupLead`).
    let wantPitch = 0;
    let wantY = 0;
    let direct = null;
    let leadIn = -1;      // progress (0..1) of a roll-back beat, or -1 when one is not running
    if (react) {
      const b = HURT_BODY[this.hurtKind] || HURT_BODY.fold;
      const lie = LIE[this.lie] || LIE.back;
      let k = 1;
      if (this.state === "trip") k = Math.min(1, this.hurtT / E.TRIP_FALL);
      else if (this.state === "flight") k = 1;
      else if (this.state === "fold") k = 0.55 * Math.min(1, this.hurtT / Math.max(0.2, (this.hurtDur || 0.9) * 0.5));
      else if (this.state === "getup") {
        const lead = this.getupLead();
        if (this.hurtT < lead) {
          // THE ROLL-BACK BEAT (see `getupLead`): a body that settled in any lie but `back` comes
          // over onto its back first, and it does it on the FIRST FRAME of the move it picked —
          // `getupU()` is 0 for the whole of the beat, so the shape is DOWNED, which is exactly
          // where the body already is. The whole turn it has to come is spent by the TUMBLE (see
          // below), so the pitch path the four moves are authored on is never touched.
          const s = this.hurtT / lead;
          leadIn = s * s * (3 - 2 * s);
          direct = { pitch: b.pitch, bodyY: b.bodyY };
        } else {
          const u = this.getupU();
          if (b.angle) direct = b.angle(u);
          else k = 1 - u * u * (3 - 2 * u);
        }
      } else if (this.state === "wallslam") {
        // The wall slam's whole-rig angle is a whole authored curve, like the get-up variants'
        // (see `HURT_BODY.wallslam`) — assigned rather than eased, because its ends are the
        // angle the body is actually pinned at and the angle standing wants.
        direct = b.angle(Math.min(1, this.hurtT / E.WALL_T));
      } else if (this.state === "pushback") {
        // ...and the PUSHBACK's is a whole authored curve too (see `HURT_BODY.pushback`), for the
        // same reason and with the same bargain: it is a rotation the eased path could not carry
        // (a whole turn away from where it starts), and its ends are the hit's own angle and the
        // standing one.
        direct = b.angle(Math.min(1, this.hurtT / E.PUSH_T));
      }
      wantPitch = b.pitch * k;
      wantY = b.bodyY * k;
      // A body lying down is sunk by its LIE's own amount: the pose is the same DOWNED shape in
      // all four lies, so the orientation is the whole of the difference between them (see `LIE`).
      if (this.state === "down") wantY = lie.bodyY;
    }
    // ...and the WHIRL's hold is the one whole-rig angle in the game that is not a reaction at
    // all: a body it has by the throat is being SWUNG, and where it POINTS is written with where it
    // IS — the fling hangs the body off the grip at the angle the move has reached (`carryOrbit.lay`
    // in `player.updateWhirl`, which is null on the slam and while it is not carrying). Assigned
    // rather than eased, for the get-up curve's own reason: this is a position, not a recovery, and
    // easing it would lag the spin by a third of the move.
    if (this.carryOrbit && this.carryOrbit.lay != null) direct = { pitch: this.carryOrbit.lay, bodyY: this.bodyY };
    // ...and the LAUNCH's carry owns it too, and even more completely: the branch in `update` has
    // already assigned the pitch (`capoCarry.pitch`, eased onto the body there) and zeroed the
    // bodyY, so `direct` is a no-op reassignment — what matters is that the EASED path below is
    // skipped, because easing this body's pitch toward the reaction's own `wantPitch` would fight the
    // hang the move asked for the whole way up.
    if (this.capoCarry) direct = { pitch: this.pitch, bodyY: this.bodyY };
    // ...and the WALL CLINCH's pin owns it for the same reason (see `headPin`): the branch in
    // `update` has already eased the pitch onto `E.PIN_PITCH`, so assigning it here is a no-op —
    // what matters is that the EASED path below is skipped, because easing toward the reaction's
    // own `wantPitch` would fight the lean the move asked for.
    if (this.headPin) direct = { pitch: this.pitch, bodyY: this.bodyY };
    if (direct) {
      this.pitch = direct.pitch;
      this.bodyY = direct.bodyY;
    } else {
      // A get-up's curve can hand the pitch over a whole TURN away from where the eased path
      // expects it — the kip-up rolls the body a full 360° (see `getupKip`) — and unwinding that
      // would spin him backwards through the deck. A whole turn is the same pose, so snap first.
      if (this.pitch >= Math.PI || this.pitch <= -Math.PI) this.pitch = Math.atan2(Math.sin(this.pitch), Math.cos(this.pitch));
      const rate = this.state === "getup" ? 8 : 9;
      this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * rate);
      this.bodyY += (wantY - this.bodyY) * Math.min(1, dt * rate);
    }
    // THE ROLL, and the tumble the roll-back beat spends. Two owners, one number:
    //   * while a body is TUMBLING the ragdoll owns both (its wind-out runs in `update`, and it is
    //     winding to the lie's own turn and roll — that IS how the body gets into its lie);
    //   * otherwise the REACTION owns them: the roll eases to the lie's while lying (a body swept
    //     off its feet has no ragdoll to roll it, and has to reach a side lie too) and back to
    //     level on the way up, and the roll-back beat assigns both outright on its own clock.
    const lie = LIE[this.lie] || LIE.back;
    if (this.capoCarry) {
      // ...and the LAUNCH's carry owns the whole rig (see the branch in `update`): the body is being
      // HELD by the face, so its pitch, its tumble and its roll are the move's own and nothing here
      // may ease them anywhere. Its `roll`/`tumble` are wound out THERE, onto the hang.
    } else if (leadIn >= 0) {
      // ...the beat takes the body from its lie to SUPINE. The tumble goes to the nearest whole
      // turn rather than to zero, which is what picks the shorter way for a quarter-turn lie (a
      // body on its side rolls a quarter) and the FORWARD ROLL for a half-turn one — rotating
      // prone through zero would sit the body up and lay it back down instead.
      const end = Math.round(lie.turn / TAU) * TAU;
      this.tumble = lie.turn + (end - lie.turn) * leadIn;
      this.roll = lie.roll * (1 - leadIn);
    } else if (!(this.ragdoll || this.flip)) {
      const rate = this.state === "getup" ? 8 : 9;
      const down = this.state === "down";
      const wantRoll = down ? lie.roll : 0;
      this.roll += (wantRoll - this.roll) * Math.min(1, dt * rate);
      // ...and a body with NO ragdoll spin to wind out — one swept off its feet, or a hit whose
      // launch left the body loose and then landed it (see `landed`) — has to be given the lie's
      // turn here, or it settles onto its back crossways: the roll alone cannot do it, because
      // rolling a supine body leaves it supine, just facing a different way. The turn and the roll
      // are what make a lying body a SIDE lie (see `LIE`), so they run on the same clock, and the
      // ragdoll's own settle rate keeps the flop looking like one motion rather than a snap.
      if (down) this.tumble += (lie.turn - this.tumble) * Math.min(1, dt * E.SETTLE);
    }

    // ---- the HANDOVER between two reactions ----
    // Two shapes do not always meet, and the reaction layer is written at full weight, so wherever
    // they do not the rig snaps in one frame. The one that cannot be authored away is the 3rd M1
    // landing on a body that is part of the way through the clinch's RELEASE (see `CLINCH_BEAT`):
    // the flip's own `t = 0` is `CLINCHED`, the shape of the HOLD, so a sweep thrown a beat late
    // arrives on a body that is already coming up out of it. `hit` flags that handover (`linkPose`
    // = 0 when the body it lands on is `held`), and here it is spent: the fresh pose is mixed back
    // toward the silhouette the rig was actually wearing, over `E.POSE_LINK`. The snapshot is the
    // PRE-handover shape and it stays put, so the fade is one monotone walk from the old silhouette
    // into the new one rather than a lag chasing a moving target. The `k` is eased (smoothstep)
    // rather than linear, because a straight cross-fade turns a corner at both ends and that corner
    // reads as a flinch — the only thing this fade exists to avoid. Nothing is flagged for a fold
    // off a body that is actually STANDING: that hit has to SNAP, and the snap is the whole read of
    // a punch (a fold thrown at one mid-reaction is flagged, and that is the one exception — see
    // the note in `hit`).
    if (this.poseLink < 1 && ud.poseBlend) {
      this.poseLink = Math.min(1, this.poseLink + dt / E.POSE_LINK);
      const k = this.poseLink;
      ud.poseBlend(k * k * (3 - 2 * k));
    }

    // ...and THE NECK'S SHARE (see `poseNeckSplit` in streetwear.js). The enemy wears the same rig the
    // player does, so it has the same neck joint, and this is the same last-line-of-the-dispatch call
    // `player.js` makes: the split of whatever head rotation the reaction above settled on. It has to
    // be down HERE, after the handover cross-fade, or the fade and the split would be fighting over
    // the head — the blend mixes the neck and the head as two separate bones, and the split is what
    // gives them their shares.
    if (ud.neckApply) ud.neckApply();
  }
}

function approach(v, target, k) {
  return v + (target - v) * Math.min(1, k);
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
// What the other side wears. The body is the NAKED one (see streetwear.js), so the only family
// it has any vertices in is SKIN — this override IS the enemy's whole look: a whitish grey that
// the cel bands shade down to a darker grey, the user's "it a naked version of the player ... its
// entire skin whiteish grey". A nude body has no cloth colours to fight the player's outfit, and
// overriding SKIN alone means an enemy's repaint can never touch the player's own rig.
const ENEMY_PAINT = {
  skin: "#cfcfcf",
};
