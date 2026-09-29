# The ball-action bake

**NOTHING HERE SHIPS, AND NOTHING HERE IS READ ANY MORE.** `THROW_Q` and `SHOOT_Q` in
`src/streetwear.js` used to be the whole of the ball's throw and shoot poses, generated from the two
clips in this folder. Both of those tables are now **deleted**, because both shapes are authored: the
throw since session 183 and the shoot since session 198. **The game loads no clip at all** — neither
FBX nor three.js's FBXLoader is fetched at run time, and the `SHOOT_*/THROW_*` literals this bake
prints have no consumer. What is left here is the RECORD: the two source clips, and a bake that still
knows how to key them, which is what a future session would want if it decided an authored shape
should go back to being a clip.

> **SESSION 183: THE THROW STOPPED BEING BAKED.** The window taken from the keeper's drop kick turned
> out to be a PUNT (measured: the ball left the hand while the throwing arm was still down at the hip,
> because what that clip "releases" on is the boot), so the throw became an **authored six-beat pose**
> (`THROW` in `src/streetwear.js`). `Goalkeeper_Drop_Kick.fbx` is kept as the record of where the old
> shape came from, and `bake.js` still knows how to key it.

> **SESSION 198: ...AND SO DID THE SHOOT.** The shoot was the last baked shape and it is an authored
> table now too — `SHOOT` (six beats: SET / PLANT / COCK / RELEASE / FOLLOW / SETTLE, 26 columns),
> written by `poseShoot` and aimed at the ball by `poseShootLeg`, which solves the legs onto PLACES
> with `legIK` rather than onto joint angles (the whole point: a joint-angle shape cannot know where
> the ball is, and this one connects on the beat it should — see the session 198 row in SPEC.md).
> `actionTables()`, `_actionTables`, `_actQ`, `SHOOT_Q`, `SHOOT_KEYS`, `SHOOT_SECONDS` and
> `SHOOT_RELEASE` are all DELETED from `src/streetwear.js`, and the shoot's launch beat is now the
> shape's own **measured** contact (`SHOOT.release` 0.56) rather than a key of a clip. `bake.js`'s
> `SHOOT_*` output would need both the `poseBallAction` dispatch and the whole table machinery written
> back before anything could read it — so treat a re-bake as a REFERENCE for tuning the authored
> tables, not as a drop-in.


## What is here

| file | what it is |
| --- | --- |
| `Goalkeeper_Drop_Kick.fbx` | the **old throw** source clip — Mixamo's *"Goalkeeper Drop Kick"*, 24 fps. The user supplied it in session 180 with *"heres an animation for when the player throws the ball (Goalkeeper Drop Kick.fbx) it doesnt have ball animations so your gonna have to make them"*. 65 bones, no mesh. **No longer baked** (see the note above): its window is a punt, so the throw is authored now |
| `Strike_Foward_Jog.fbx` | the **shoot** source clip — Mixamo's *"Strike Foward Jog"*, 24 fps, also 65 bones, no mesh. Supplied in the same session: *"make me if i m1 while im controlling the ball make me do a shoot and heres the shooting animation (Strike Foward Jog.fbx) this one also doesnt have a ball animation"* |
| `bake.js` | **the bake.** Reads an FBX, retargets it onto this rig bone by bone, keys **one window** of the clip, cancels the clip's own turn, quantises to int16, base64s it and prints the `THROW_*`/`SHOOT_*` literals plus a fidelity / heading / pace report. **Nothing consumes either set any more** (session 198) — it is kept as the tool that would rebuild a clip shape if one were ever wanted back |

There is no `probe.js` here: unlike the climb, these actions have no stroke to measure (no cycle, no
descent rate) — the only numbers the runtime needs out of the clip are the **release key** and the
**window length**, and the bake emits both.

## How to re-run it

`bake.js` is a plain ES module that expects a workspace `fs`, which is what the editor's `execute_js`
tool mounts — run it there (not in the page: `page_eval` has no `fs`).

1. `execute_js` the contents of `bake.js`. It loads `three@0.160.0` and its `FBXLoader` (from esm.sh),
   so it needs network access.
2. The emitted literals have nowhere to go: **both `THROW_Q` and `SHOOT_Q` are deleted** (session 198),
   along with `ACTION_BONES`, `actionTables()`, `_actQ`, `SHOOT_KEYS`, `SHOOT_SECONDS` and
   `SHOOT_RELEASE`. Today the output is a REFERENCE — pose the baked shape beside the authored table
   and tune the table against it. Wiring a clip back in means restoring the slerp as well as the data.
3. The shoot's release beat is no longer published through `poseCfg.BALL` at all: it is the authored
   table's own `SHOOT.release` (0.56), read straight off the shared object by `tickShoot` (see
   `ballReleaseOf` / `shootShape` in `src/inventory.js`). `THROW_RELEASE` / `BALL_SLAM_RELEASE` are
   likewise the authored beats inside their own tables.

To change **which slice** of a clip is the action, edit that clip's `from` / `to` / `release` in the
`ACTIONS` list at the top of `bake.js`. The clip is 24 fps, so `from`/`to` are frame-aligned
(`Math.round(seconds * 24)`). Both clips are long take-styles; the windows chosen here are
**THROW 2.20–3.20 s, release 2.826** (the right arm's wind-up over the shoulder and the overhand throw
out of it — *historical: that window is what the throw stopped wearing in session 183*) and
**SHOOT 0.28–0.90 s, release 0.490** (the right leg's wind-back through the low forward strike sweep).

## The retarget, in one paragraph

It is `src/tools/climb-bake/bake.js`'s retarget, verbatim. The clip's bind pose is a Mixamo T-pose and
this rig rests arms-down, so "apply the clip's world rotation" is wrong by construction — the same
rotation means a different limb direction in the two rest poses. What the two rigs *do* share is each
bone's **semantic frame**: its segment direction, its hinge (the elbow's, the knee's), the palm's
normal, the sole's. The bake builds that frame on the clip (`M_b(f0)`), measures the same thing on this
rig at rest (`G_b`), and carries the clip's world rotation delta `D_b(t)` across:
**`A_b(t) = D_b(t) · M_b(f0) · G_b⁻¹`**, with each bone's local rotation then `A_parent⁻¹ · A_b`. The one
difference from the climb's bake is that `f0` is picked **per bone** here (the frame in which that
bone's own hinge is least degenerate, via `hingeScore`) rather than once for the whole body — the same
method, a better-conditioned reference for a one-shot window. Measured after the bake: every bone's
direction tracks the clip to **0.01°** across the window. The clip's **`Left*` bones drive this rig's
`R`-named bones** (this rig's `L` bones are the character's own RIGHT), exactly as in `bake.js`.

## Two things this bake does that the climb's does not

- **It keys a WINDOW, not a cycle.** The climb is a loop and gets 61 keys wrapping onto key 0; these
  are ONE-SHOTS, so each action names the slice of its clip that IS the action and the table simply
  runs `0..1` across it. The runtime wears it as a one-shot slerp (`poseBallAction`, clamped at the
  last key) and fades it back out on the follow-through.
- **It drops the hip translation AND cancels the body's own turn.** Both clips carry their own
  locomotion — the drop kick walks nearly 3.5 m and both of them *turn* (the keeper's pelvis swings
  from −72° to +65°, the striker's from −25° to +55°, confirmed two ways: the leg-based
  `cross(left, up)` reference and the hips' own world-quaternion twist). The player owns the facing, so
  played as-is a shot would spin the whole figure half a turn off the camera's line. The table is
  therefore **rotations only, no hip offset**: the hip's translation is simply not keyed, and the
  pelvis' **yaw is zeroed at every key** by premultiplying the hips' local quaternion with `Ry(-yaw)`.
  The hips are the root of the chain, so that one write carries the whole body — and because every bone
  turns by the same angle on a given key, every RELATIVE joint angle (the chest's twist against the
  pelvis, the hip's opening, the arm swing) is untouched. What is left is the shape, aimed down the
  body's own nose, which is what an in-place action is. `faceYaw` in the report is the per-key heading
  that was removed.

## What the runtime does with it

The literals were consumed in `src/streetwear.js` (`ACTION_BONES`, `actionTables()`, `poseBallAction`)
and `src/inventory.js` — all of that is deleted as of session 198 (see the note at the top). The clip
shaped the BODY; the BALL was always authored by the game, because no clip has one: the release beat is
where `inventory.js` launches the controlled ball off the boot (`shootLaunch`), using `SHOOT_V`/`_UP`.
That split outlived the clips — the shoot's shape and its launch beat are both authored now, and the
body still lines up with the launch moment because `SHOOT.release` is where the shape's own boot
REACHES the ball (measured, see SPEC.md session 198).

The **throw** works the same way one layer over: `releaseHandThrow` hands the carried mesh out of the
hand's own live world point, so it follows whatever shape the throw is wearing — today the authored
`THROW` table (`BALL_THROW_V`/`_UP`), and it needed no change when the shape stopped being a clip.
