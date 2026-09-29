# The climb bake

`CLIMB_Q` in `src/streetwear.js` — the whole of the wall climb's pose — is generated from the clip in
this folder. **Nothing here ships to the browser:** the game only ever reads the base64 table, and
neither the FBX nor three.js's FBXLoader is loaded at run time.

## What is here

| file | what it is |
| --- | --- |
| `Climbing_Up_Wall.fbx` | the source clip — Mixamo's *"Climbing Up Wall"*, 30 fps, 4 s of which the first 2 s are one cycle (the second cycle repeats it), skeleton only, no mesh. The user supplied it in session 156 with *"here use this animation for the wall climb"* |
| `bake.js` | **the bake.** Reads the FBX, retargets it onto this rig bone by bone, keys one cycle, quantises to int16, base64s it and prints the `CLIMB_Q` literal plus a fidelity/pacing report. **Session 162 added `CLIMB_PULL` to its output**: the depth-weighted descent of the planted (and descending) contacts per key, mean-normalized to 1 — the clip's own stroke, which `player.js` wears as the climb's speed. The mean of the two literals is also where the energy went: `CLIMB_CYCLE` 1.18 is a RIG measurement, and the rig is drawn at 1.351, so it is worth 1.594 world. It also writes the literals to `scratch/climb-table.js` |
| `probe.js` | the clip's own analysis (each contact's descent rate while planted, its depth ahead of the hips per frame, the contact windows), which is where `CLIMB_CYCLE` 1.18 and the press arithmetic come from. Writes `scratch/climb-probe.json` |

## How to re-run it

Both scripts are plain ES modules that expect a workspace `fs`, which is what the editor's
`execute_js` tool mounts — run them there (not in the page: `page_eval` has no `fs`).

1. `execute_js` the contents of `probe.js` if you want the clip's own measurements re-derived.
2. `execute_js` the contents of `bake.js`. It loads `three@0.160.0` and its `FBXLoader` (from esm.sh),
   so it needs network access.
3. Paste the emitted `CLIMB_Q` + `CLIMB_PULL` into `src/streetwear.js` (`CLIMB_KEYS` too, if the key
   count changed). They are one recipe: the pose and the stroke it is played at.
4. Re-measure **`CLIMB.PRESS`** on the live rig — the bake knows the clip's *joints*, not this game's
   *meshes*, and the press is defined on the drawn surface. The sweep is written up in
   `src/README.md` ("The climb is the clip (session 156)"): pose the rig frame by frame with
   `userData.poseWall(1, "climb", phase, 1, frame)`, transform every vertex of every mesh under each
   limb bone into the rig's frame and take the deepest one; `CLIMB.PRESS` is the median of those over
   the cycle.

## The retarget, in one paragraph

The clip's bind pose is a Mixamo T-pose and this rig rests arms-down, so "apply the clip's world
rotation" is wrong by construction — the same rotation means a different limb direction in the two
rest poses. What the two rigs *do* share is each bone's **semantic frame**: its segment direction
(from the clip's own joint positions at a reference frame), its hinge (the elbow's, the knee's), the
palm's normal, the sole's. The bake builds that frame on the clip (`M_b(f0)`), measures the same
thing on this rig at rest (`G_b`), and carries the clip's world rotation delta `D_b(t)` across:
**`A_b(t) = D_b(t) · M_b(f0) · G_b⁻¹`**, with each bone's local rotation then `A_parent⁻¹ · A_b`.
Measured after the bake: every bone's direction tracks the clip to **0.012°** across the whole cycle
and all four contact points to **0.000 u** — the table is the clip, not a lookalike.

Two mappings worth knowing before editing anything here:

- the clip's **`Left*` bones drive this rig's `R`-named bones** (this rig's `L` bones are the
  character's own RIGHT). Verified against the clip's joint positions — no mirroring happens.
- the clip's units are centimetres and its hip sits at 105.28, so every translation is scaled by
  `K = 1 / 105.28`, which puts the clip's hip on this rig's `HIP_Y` 1.000. Its limb lengths are within
  5% of this rig's own, so nothing else is scaled.

The clip carries no finger chain into the table (its hand bones drive `handL`/`handR` only), so the
four digits closing on the hold are the one part of the climb still authored in `streetwear.js`
(`CLIMB.GRIP`).
