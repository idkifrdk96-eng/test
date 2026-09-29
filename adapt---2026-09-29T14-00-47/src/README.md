# ADAPT — infinite low-poly PS1 parkour

> **PS1 GRAPHICS, SSS ANIMATION.** The renderer, materials, polygon counts and art style are
> PlayStation 1 on purpose. The **motion** — poses, timing, weight, follow-through, secondary
> motion, contacts, the run cycle, every move — is held to the highest standard the rig can carry,
> and a low-poly body is never an excuse for a stiff one. Do not simplify a pose because the mesh
> is simple, do not accept a popping limb or a missed contact because "it's a PS1 game", and never
> trade animation quality for art-style consistency. The two are independent axes; only one is retro.

A three.js game rendered with a deliberately PS1-era pipeline. You play a hand-modelled low-poly
street runner in an endless, procedurally generated field of blocky structures. Wall-jump,
wall-climb, wall-slide, wall-run, slide, double jump, ground slam, dive, wall-kick, **ride a
skateboard** (push, carve, ollie, kickflip, powerslide, bomb) — and smash
the place apart (structures break fast; the ground is a much harder dig). **Four maps** swapped
with `K`: **OPEN FIELD**, **THE MAZE** (walls rise with distance from spawn), **THE HILLS**
(Windows-XP-wallpaper countryside, grass, spawn on the summit), and **THE SKATEPARK** (flat
concrete plazas joined by 31–68° ramps, eight big landmarks — bowls, pipes, a spine, a volcano,
a rideable loop wall, a king bowl and a mega pipe — plus a scattered field of a hundred more
bowls, pipes, spines, volcanoes, loops and mogul runs (park furniture is currently off, so the
lines stay clean). A **sky cube** landmark with a
**launch pad** stands beside the spawn. The interface samples its colour from the world.

There is a fight: an **M1 melee chain** (knee → clinch knee → sweep → one-two, with a **clash**
when two M1s meet, a **DOWN SLAM** if the 4th is thrown airborne, an **UPPERCUT** if SPACE is held
on the 4th), an **M1+M2 block** (guard that walks / charge that shoves), a **right-click grab**
(three animals: heave / set-up / slam) and its **staff** (a real prop you take, swing, throw and
break), and **three dial skills** — `1` FLYING KNEE, `2` HEAD SCISSOR (also the counter),
`3` KIP-UP (launcher into the **air combo**, which drops the world into **bullet time** while your
own attacks stay full speed). Mash M1 against stone with a body → **WALL CLINCH**. Dive into an
airborne body → **air combo**, on the purple diamond's cooldown.

Everything lives in `index.html`, `main.pjs` and `src/`. `main.pjs` holds only `$meta`.
`src/tools/` is offline bakes (the Mixamo climb, and the ball's shoot) — never loaded by
the page.

(Was called *BASEPLATE*; `localStorage["baseplate.options.v1"]` keeps the old name deliberately,
because it holds saved options.)

## Controls

| input | action |
| ----- | ------ |
| `W A S D` | move (camera relative) |
| mouse | look (click canvas to lock) |
| `SPACE` | tap = jump; in air = wall-jump off a wall you're on, else double jump. Jump *at* a wall → wall-run; hands-height top → auto ledge grab. **HOLD at a wall** (the hold must have BEGUN off the ground) → wall climb |
| `SHIFT` | crouch (still); crouch-walk (moving); slide (running / landing from a big fall); ground slam (in air) |
| `Q` | with a direction held → DASH: forward **BOXCUTTER** (1.06 s, hitbox), side **sidestep** (0.36 s), back **BACKDASH** (1.5 s, i-frames, camera-steerable). Nothing held → nothing |
| `F` | dive (air only, camera-locked, builds speed). Landing on an already-airborne body → **air combo + bullet time** |
| `M1` | ball in your **HANDS** = **THROW** (overhand, authored beats since session 183); controlled ball at your **feet** = **SHOOT** (low boot sweep, Strike Foward Jog). Else: airborne at wall = wall kick. Sliding after a flip = **macaco**. Ground under `COMBAT_SPEED` = the melee chain (4 moves; the 4th is a one-two, a DOWN SLAM airborne, or an UPPERCUT with SPACE held). 5 taps at a wall / 5 landed = **WALL CLINCH** |
| `M2` | **staff first** (take / swing / throw / break); **beside the ball or a loose board** = take it into your HANDS; **with the ball in hand** = **SLAM it live** (session 189 — off your side axis, like the duffel); else **grab** (heave / set-up / slam) — a **standing** move, refused over `COMBAT_SPEED` (17). Miss is its own shape |
| `E + M2` | take the duffel in both arms; `M1` throws it, `M2` **slams it live** (THE HOT BAG) |
| `E` | TAKE a loose prop at your feet **into your HANDS**. It does **not** take the **soccer ball** — that is `M2`'s now (the ball is set down with E once it is in your hand, and `M1` throws it). Standing next to the duffel alone, E opens its board instead: whichever of the two is **nearer** wins — and with a hand already full, E near the duffel opens it so you can **double-click the board to stash** |
| `E` (a loose **skateboard** at your feet) | **RIDE it** — the brief's own key. Take a loose board with **`M2`**, then **`E`** steps on / off it. On the board: **hold forward = PUSH** (a cadence — the only engine), stick = **carve**, `SPACE` = **OLLIE**, `M1` = **TRICK** (kickflip / heelflip / shuvit / 360 shuvit / body varial, a cycle), `M2` = **MANUAL**, `SHIFT` = **POWERSLIDE** (the board's brake), `F` = **BOMB** (a dive thrown at the deck). A dismount at speed leaves the board rolling on |
| `M1 + M2` | **BLOCK** — boxing guard (walks) → hold forward or arrive running → CHARGE (faster than sprint, cannot corner, shoves aside) |
| `X` | ground slam while airborne; SPACE on impact to bounce |
| `1 2 3` | the three skills (lock the run; 2 and 3 aim with the camera, 1 aims itself) |
| `R` | ultimate (only when the cyan ring is full) → OVERDRIVE |
| `T` | free the mouse |
| wheel | zoom (2.2 – 9) |
| `N` | swap character |
| `]` | respawn |
| `V` | first / third person |
| `ALT` | SHIFT LOCK (tap only) |
| `O`, `ESC` | options |
| `H` | controls panel |
| `K` | cycle world generator |
| `ALT`+`1`…`6` | retro render toggles |

Touch: joystick (bottom-left, follows the thumb), look pad (right), action block (right-aligned
column; each button has its own icon and shape). **On a board the pads become the deck's own keys**
(session 201): HIT flips, JUMP ollies, SLIDE powerslides, DIVE bombs, GRAB a manual, and the stick is
the push. See "THE PHONE" in `index.html`. The whole phone
layer can be turned off with **TOUCH → MOBILE UI** in OPTIONS (see "THE MIX AND THE PHONE" below).

## File map

| file | role |
| ---- | ---- |
| `three.js` | single re-export of three.js from esm.sh (keeps ONE module instance) |
| `ps1.js` | retro renderer: shared uniforms, lit material/shader (+ `lawn`), sky shader, blob shadow, low-res presentation, post FX, `attachOutline()` (ink hull, flash hull, `setOutlineTint`/`clearOutlineTint`) |
| `sky.js` | `SkySystem` — day/night clock, weather moods, palettes |
| `geom.js` | CPU geometry builder (boxes → BufferGeometry with baked AO + shading), `buildShardGeometry()`, `fitGroup()` |
| `rng.js` | deterministic hashing / RNG / value noise |
| `world.js` | infinite chunk streamer, biome field, **four generators** (`field` / `maze` / `hills` / `park`), landmark `SKYCUBE`, `ARENA`, `PARK` (the skatepark's lattice, its five set pieces and its seventeen props), `groundBaseAt`, `terrainHeight`, collider queries, `sampleAround()`, `primeChunks(px,pz,count,budgetMs)` |
| `grass.js` | THE MOVING GRASS — two rings of streamed tufts, sway/push/fade all vertex-shader |
| `voxel.js` | the voxel model of a breakable box: how a big box is cut into cells, addressing (`slotOf`/`cellSlot`), `cellAt` vs `topCellAt`, what a `piece` is |
| `yard.js` | THE TRAINING GROUNDS — authored stations around the spawn, `YARD_CLEAR`, `STATIONS`, `YardSigns`, `warmStep` |
| `destruction.js` | damage model: cracks, taking a surface apart, craters, falling debris, the one `strike` primitive |
| `streetwear.js` | the STREET character built from code + `characterMaterial()` (neon cel). Every pose lives here. Also the naked enemy body, the limb stretch channel, the fall family. **The ball's three actions are all AUTHORED BEAT TABLES now** (session 198 finished the set): `THROW`, `BALL_SLAM` and **`SHOOT`** — the shoot a 26-column, six-beat table (SET/PLANT/COCK/RELEASE/FOLLOW/SETTLE) written by `poseShoot`, whose legs are solved onto PLACES by `poseShootLeg` (`legIK`), **not** onto joint angles, so the strike can be aimed at the ball; `poseShoot`'s sixth argument, `lower`, is how much of the hips and legs the shape owns — 0 leaves them to the run so a charge taken at speed does not skate (see `inventory.js`'s `legWeight`). The baked-clip path (`SHOOT_Q`/`actionTables`/`_actQ`) is deleted and the game loads no clip |
| `charmodel.js` | `buildPlayerCharacter(mode, size)` — `street` / `naked` / `imported` |
| `pole.js` | THE POLE — one hand-planted staff, its lathe mesh, halves, debris, state machine; **and the shaft's spine** (`POLE.SPINE`, `bendShaft`, `Poles.stepSpine`/`writeSpine`) — the rod bends along an arc driven by its tip's velocity relative to its butt |
| `models/player.glb` | the imported reference model |
| `font/glyphs.js` | THE FONT's art (108 glyphs as pixel grids) + metrics |
| `font/build-font.js` | THE FONT's builder (pixels → WOFF) + `report()` audit |
| `font/adaptchunk.woff` / `.ttf` | the built face (now the fallback) |
| `font/swizer-street.ttf` | the shipped face (the user's own file) |
| `tagtext.js` | THE TAG TEXT — per-letter hand-setting over one MutationObserver |
| `icons.js` | the baker behind the three skill icons — screenshots of the real rig at each move's own contact frame (`SKILL_ICON_CFG`; skill 3 is shot from the capoeira's CARRY, its only legible beat), plus the HUD self-bake (`applySkillIcons` / `autoBakeIcons`) that keeps the editor preview on the live animations |
| `hud/skill1.png` … `skill3.png` | the baked skill icons (the published game's icons; the editor rebuilds them at play — see `icons.js`) |
| `player.js` | the `Player` class itself — now a thin shell: the one-line constructor (which just calls `initPlayer`), the three getters (`airComboOpen`, `hx`, `hz`) and the two big drivers `update` (the frame's state machine) and `updateVisual` (its 122-line dispatch). Everything else lives in `player/` (see the rows below); the numbers live in `player/config.js` |
| `player/config.js` | every constant + the whole `P` tuning table — **part 1 of the `player.js` split**. Pure data, imports nothing; `player.js` imports `P`/`CHAR_SCALE` back and re-exports `P` |
| `player/math.js` | the shared math — `TAU`, `approach`, `wrapPi`, `smooth01`, `swingTowards` — so a piece split out of `player.js` can import them without a circular import back into the class file |
| `player/pole.js` | **parts 2 + 32 + 50 of the split**: THE STAFF's own code — the pole scratch, `composePole`, `shaftGap`, its 19 methods, **from part 32 `tryStaffStrike(grounded, chordHeld, inp, speed2D, dashFree)`** — the staff's own M1 gate, which reports whether the staff claimed the press — and **from part 50 `solvePoleBody(dt, ud)`** — the whole of `updateVisual`'s staff layer: the prop read, the layer weight, the one `poleHold` read spent twice (prop matrix + body solve), the carry's run-lift and trunk ride, the haul blend out of the deck, `posePole`, the hands' own world point and the mounted prop's shaft ends (it needed `smooth01` added to its ./math.js import). `installPole(Player)` copies the method table onto `Player.prototype`; `player.js` imports back `composePole` + the scratch its `updateVisual` still solves the carried staff into. **Session 185 adds THE VAULT to it** — `poleVault`/`updatePoleVault`/`poleVaultLaunch` (the double jump's one-shot front flip, replacing the Shaolin balance) and the `_poleHold.flip` field |
| `player/grab.js` | **parts 3 + 56 of the split**: THE GRAB's 15 methods (pickup → spin → crash → miss → lift → slam) + the `_grab*` scratch, **plus from part 56 `solveGrabPose(dt, ud)`** — the grab's own pose layer of `updateVisual` (the cross-fade, the per-kind `poseGrab` call, the `heavePoseT` read and the MISS's own parked-shape ease; needed `approach` added to its ./math.js import and `SKILL_POSE_FADE` from ./pose.js). `installGrab(Player)` attaches them; `player.js` imports the scratch back for `updateVisual` |
| `player/combat.js` | **parts 4 + 29 + 32 + 38 + 59 + 67 of the split**: the M1 chain + the clash (13 methods: `attackMoveSpec` → `endClash`, **from part 29 `tickChainAir(dt, grounded)`** (the airtime grace / finisher door) **and from part 32 `tickChainPress(grounded, inp, speed2D, dashFree, chordHeld, poleStruck, hasWish, wx, wz)`** (the whole M1 press: the chain, the uppercut's modifier, the wall-chain feed and the dive/slam/slide/dash fallbacks — it stands down when the staff already claimed the press; it needs the WISH as well as the wish's own flag, or its dash/slam fallbacks throw), **plus from part 38 `tickAttackState(dt, inp, hasWish, wx, wz)`** — the `attack` case of `update`'s `switch`, moved here whole: the down slam's own vertical and then the four grounded moves' carry), all lifted from `update`, **from part 59 `solveAttackPose(dt, ud)`** — the chain's own pose layer of `updateVisual` (the `COMBAT_POSE_FADE` cross-fade, `attackLink`, the clinch's head solve through `_clinchV`, `poseAttack` and the `chainBlend`/`chainSnapshot` handover; needed `_clinchV` from ./pose.js), **and from part 67 `solveClashPose(ud)`** — the clash's own shape of `updateVisual` (the no-fade `poseClash` call)) + the `_clashV`/`_clashW` scratch. `installCombat(Player)` attaches them. (Part 26 folded the MELEE-CHAIN banner — which used to sit above the chain's setters in `player.js` — into this file's header, since this is the chain's home) |
| `player/skills.js` | **parts 5 + 52 + 57 + 76 of the split**: the three dial skills + capoeira (35 methods: whirl / flying knee / head scissor / capoeira launch), the scissor's key-table readers, and all the skills scratch — **from part 52 `solveWhirlPose(dt, ud)` / `solveKneePose(dt, ud)` / `solveScissorPose(dt, ud)`**, the three skills' own pose layers lifted out of `updateVisual` (each cross-fade + its `poseWhirl`/`poseFlyingKnee`/`poseScissor`; needed `SKILL_POSE_FADE` added to its ./pose.js import), **from part 57 `solveCapoPose(dt, ud, capoPhase)`** — the capoeira's pose layer (its cross-fade + the HELD draw-phase + `poseCapo`; the live `capoPhase` is passed in so the layer can hold the last one the state reached), **and from part 76 `solveWhirlNeck(ud)`** — the whirl's LIVE neck contact (the victim's head walked into the player's frame through `_clinchV` and handed to `setWhirlNeck`), **and from part 82 `solveCapoCarry(dt, capoPhase)`** — THE CARRY's live contact, the LAST thing `updateVisual` writes: the caught body's face pinned to the midpoint of the player's two SOLES, read off the rig after this frame's pose + `stretchApply` are spent (hence last), walked in over `CAPO_CARRY_GRAB` and cleared the moment the carry stops. `skills.js` gained `_capoSoleA`/`_capoSoleB`/`_capoBoot`/`_capoHead` (./pose.js) — `player.js`'s last readers. `installSkills(Player)` attaches them |
| `player/wallbeat.js` | **parts 6 + 55 of the split**: THE WALL CLINCH — 16 methods (`onWallContact` / `wallProbe` / the two pickers → `startWallBeat` / `updateWallBeat` / the smash-knee-hurl beats / `endWallBeat`) + the `_wallHeadV`/`_wallGutV` scratch, **plus from part 55 `solveWallBeatPose(dt, ud)`** — the clinch's own pose layer of `updateVisual` (the cross-fade, the victim's HEAD BONE walked into the player's frame via `_clinchV`, the wall-normal handover, and the `poseWallBeat` call; needed `approach` from ./math.js and `SKILL_POSE_FADE` + `_clinchV` from ./pose.js). `installWallbeat(Player)` attaches them |
| `player/lunge.js` | **parts 7 + 54 of the split**: THE RUNNING LUNGE (the UNWIRED panther grab) — 7 methods (`startLunge` / **`startFreeRoll`** (`startLunge`, **session 194** — the SKYFALL's own roll-out landing, entered straight at phase 1 with `lungeHopT = -1`; this is the lunge's ONE live entrance, see `P.FREE_ROLL_*` and the roll-out bullet below) / `lungePick` / `lungeTakeNow` / `lungeHoldBody` / `lungeRelease` / `updateLunge`), **plus from part 54 `solveLungePose(dt, ud)`** — the lunge's own pose layer of `updateVisual` (the per-beat `poseLunge` dispatch on `lungePhase`, the two cross-fade echoes — the pounce's laid-out shape under the roll — and the `take` read; needed `approach` added to its ./math.js import and `SKILL_POSE_FADE` from ./pose.js). `installLunge(Player)` attaches them |
| `player/contacts.js` | **parts 8 + 30 + 42 of the split**: THE COMMITTED MOVES' CONTACTS — 8 methods: THE SLIDE'S HIT (`slideContact`) + its wake, THE DIVE LAUNCH (`diveUp` / `diveContact`), and THE FRONT LUNGE / BOXCUTTER (`dashContact` / `boxcutterBeats` / `tickDashPose` / `dashKickLands`, **plus from part 30 `readDiveTarget(grounded)`** — the body a dive would launch, lifted from `update`), **and from part 42 `tickContacts(dt, preX, preZ)`** — the frame's contact passes themselves (the smash's deck-gone check, then the dive/slide/lunge/charge passes, each read against the pre-move position the caller hands in), lifted from the middle of `update`; it imports `SMASH_PLUNGE_V` from ./pose.js for the smash's gate. `installContacts(Player)` attaches them |
| `player/vault.js` | **parts 9 + 24 + 33 + 35 + 63 of the split**: THE RUNNING VAULT — 6 methods (`vaultPickKind` / `vaultTarget` / `vaultSlab` / `startVault`, **plus from part 33 `tickVaultEntry(grounded, speed2D)`** — the deck-and-speed gate that fires it, from part 35 `tickVaultState(dt)` — the crossing itself — both lifted from `update`, **and from part 63 `solveVaultPose(dt, ud, pitch)`** — the crossing's own pose layer of `updateVisual`: the whole-rig TURN (`vaultTurn` / the squaring-up after), the `VAULT_POSE_FADE`/`VAULT_POSE_FADE_OUT` cross-fade and the `poseVault` call; needed `TAU` added to its ./math.js import and the two fades from ./pose.js) plus `VAULT_KIND` / `VAULT_TURN_APEX`, **and (part 24) `vaultLift` with `VAULT_RISE`/`VAULT_DROP`**, re-exported because `update`+`updateVisual` call it. **Session 197 makes it TWO styles** — `VAULT_KIND` is `SPEED`/`FRONT` now, and the other three poses, their `vaultTurn` branches and their apex entries are deleted — **and paces the crossing off the arrival** (`P.VAULT_PACE`, with `VAULT_MIN_DUR`/`VAULT_MAX_DUR` demoted to a net), with the revolution and the tuck both spent at `VAULT_SQUARE` (streetwear.js). `installVault(Player)` attaches the methods |
| `player/wallrun.js` | **parts 10 + 24 + 30 + 46 + 51 + 53 of the split**: THE WALL RUN AND THE WALL KICK — 5 methods (`tryWallRun` / `endWallRun` / `findKickWall` / `tryWallKick`, **from part 30 `readKickReach(dt)`** — the kick's reach memory for the frame, **from part 46 `tickKickPress(grounded)`** — the kick's own press gate with every state that refuses the boot, both lifted from `update`, **and from part 51 `solveWallPose(dt, inp, ud)`** — the whole wall layer of `updateVisual`: the layer weight, the climb's phase and REST clock, the wall slide's scrape phase and the big solve (`wallRunFrame`'s frame, the climb's PULL reading, `poseWall` / `poseClimbPull` / `poseClimbFly`, **plus from part 53 `solveKickPose(ud)`** — the kick's own pose layer of `updateVisual`: the `poseKick` call with the flip riding its longer `KICK_FLIP_TIME` envelope while the plain kick rides `KICK_POSE`) plus the kick's variant picker `nextKickVariant`, from part 24 the jump's sibling `nextJumpVariant` and `wallRunFrame` with its `_wf*` scratch (the orthonormal basis the wall-run/climb leg solve works in; imports THREE), and **from session 181 `readClimbHand(ud)`** — which hand the climb CLIP has on the stone, read in the rig's own frame at the tail of the frame and cached into `climbHandL` for the hang to spend — **DELETED in session 199**, together with `climbRestL`, the `_hand*` / `_rest*` scratch and `poseWall`'s ninth argument: the parked stance is a PARK of the climb clip now and plants BOTH hands, so there is no side left to choose (see "The parked climb is a PARK of the climb clip" in README.md). All re-exported. `installWallrun(Player)` attaches the methods. NOTE for testing the kick: `findKickWall` refuses under `KICK_MIN_SPEED` (18), so a kick test needs the body actually moving that fast — a near-stationary body beside a wall will never produce a candidate. NOTE for the climb: the haul's RELEASE (`this.climbRel`, written by this file's pose solve and read by the `air` state) is what hands the body off the face and into the skip's flight, so a climb-up that briefly reports `attachMode === null` is that handover, not a detach bug |
| `player/attach.js` | **part 34 of the split**: THE WALL ATTACHMENT (the Genshin model) — `tickWallAttach(inp, grounded, wx, wz, hasWish)`, the whole block that decides whether the body is ON a face this frame: the climb's self-sustaining grab (from the air and from the deck), the wall run, the wall slide, and the wall jump. `installAttach(Player)` attaches it |
| `player/skyfall.js` | **parts 33 + 72 of the split**: THE FALL'S LIVE MODES — `tickSkyfall(dt, grounded, speed2D, hasWish, wx, wz)` (the skyfall flag: the drop-to-deck read via `World.topBelow`, the brace timed off the time-to-impact, the one-time shape pick) and `tickPlunge(dt, grounded, inp, hasWish, wx, wz)` (the held-M1 plunge, the dive/slam handover out of the fall, the kick-buffer drop), **plus from part 72 `solveFallPose(dt, ud, speed)`** — the fall family's own pose layer of `updateVisual` (the `FALL_POSE_FADE` cross-fade and `poseFall` with its kind / brace / `skyfallT` / total-speed drive). Deps: `P`, `approach`, `pickFallKind`, `FALL_BRACE_FADE` + `FALL_POSE_FADE` — the pure fall MATH is still `player/fall.js`. `installSkyfall(Player)` attaches it all |
| `player/ledge.js` | **parts 11 + 35 + 62 + 65 of the split**: THE LEDGE AND THE MANTLE — 8 methods (`mantleTarget` / `ledgeTarget` / `ledgeFind` / `gripLocal` / `startMantle` / `startLedge`, **plus from part 35 `tickLedgeState(dt)` / `tickMantleState(dt)`** — their own `switch` bodies, lifted from `update`; the mantle's own `new THREE.Vector3` is why this file now imports THREE, **from part 62 `solveMantlePose(dt, ud)`** — the mantle's own pose layer of `updateVisual`, dispatching between the climb's `poseMantle` and the LEDGE pull-up's `poseLedgePull` (with its `ledgePullPin` read), **and from part 65 `solveLedgePose(dt, ud)`** — the hang's own layer plus the shared LEDGE GRIP solve (`poseHang`, then the `gripLocal()` + `poseLedgeGrip` contact weighted by the further-on of the hang's fade and the pull-up's `pin`); needed `MANTLE_POSE_FADE`/`LEDGE_POSE_FADE` from ./pose.js). The two blocks were NOT adjacent in `player.js` (the reads + grip solve sat by the squeeze, the two state entries came after the launch pad), but they are one feature. `installLedge(Player)` attaches them |
| `player/physics.js` | **parts 12 + 47 of the split**: THE BODY AGAINST THE WORLD — 13 methods (`overlaps` / `senseWalls` / `pickWall` / `wallJumpNormal` / `spaceFree` / `readSlope` / `slopeGate` / `slopePull` / `deckGrip` / `updateBox` / `fitScale` / `squeezeAt` / `updateSqueeze`) **plus, from part 47, `readWorld(dt)`** — the frame's own world read lifted off the top of `update` (the box for the frame, the collider query around it, and `this.colliders` pointing at that buffer) — plus the motion helpers `accelerate` / `applyFriction` / `bleedSpeed`, which it re-exports (`update` still calls all three). `installPhysics(Player)` attaches the methods. The `get hx` / `get hz` accessors deliberately stayed on the class |
| `player/move.js` | **part 13 of the split**: THE BODY AGAINST THE WALL — the collision core, 3 methods (`tryStep` / `moveAxis` / `moveAndCollide`) + the resolve separation `EPS`. `installMove(Player)` attaches them |
| `player/launch.js` | **parts 14 + 30 + 35 + 64 of the split**: THE LAUNCH PAD — 4 methods (`solveLaunchArc` / `startLaunch`, **from part 30 `tickLaunchPad(grounded)`** — the pad's own foot check, and from part 35 `tickLaunchState(dt)` — the flight itself — both lifted from `update`; the flight's landing sets `landT`, so this file imports `LAND_POSE_TIME` from ./pose.js, **and from part 64 `solveLaunchPose(dt, ud)`** — the flight's own pose layer of `updateVisual` (its `LAUNCH_POSE_FADE` cross-fade + `poseLaunch`; needed `approach` from ./math.js and `LAUNCH_POSE_FADE` from ./pose.js)) plus the arc SEARCH `launchArc`, which it owns because `Enemy.padLaunch` fires a thrown body off the same pad with the same solver; `player.js` re-exports `launchArc`. `installLaunch(Player)` attaches the methods |
| `player/block.js` | **parts 15 + 28 + 32 + 37 + 70 of the split**: THE BLOCK (the M1 + M2 guard chord) — 5 methods (`chordLive` / `startBlock` / `blockCatch` / `blockContact`, **from part 28 `tickGuardChord(dt, inp, grounded)`** — the guard's TOGGLE clock, both lifted from `update`, from part 32 `tickBlockEntry(inp, hasWish, wx, wz, dashFree)` — the chord's own state entry, which also returns `chordHeld` for the M1 block below), **from part 37 `tickBlockState(dt, inp, hasWish, wx, wz)`** — the `block` case of `update`'s `switch`, moved here whole: the guard's footwork and the charge's carve, **and from part 70 `solveBlockPose(dt, ud, speed)`** — the guard's own pose layer of `updateVisual` (`guardRush`/`guardPose`/`guardPhase` and the `poseBlock` call — **session 195 made that call EIGHT-arg**: it now hands in the SPEED band `BLOCK_RUN_LO`..`BLOCK_RUN_HI` as `moving` (which arm shape the block wears, so a WALK keeps the two-handed guard) and `runBlend` as `bodyRun` (the body channel's own stand-down, unchanged); needed `approach` + `RUN_STRIDE` and `GUARD_RUSH_FADE`/`GUARD_POSE_FADE` from ./pose.js). Imports `swingTowards` (./math.js) and `accelerate` (./physics.js) for its bodies. No module-scope scratch. `installBlock(Player)` attaches them |
| `player/macaco.js` | **parts 16 + 29 + 68 of the split**: THE MACACO (the slide's own M1) — 4 methods (`canMacaco` / `startMacaco` / `updateMacaco`, **from part 29 `tickMacacoEntry(inp)`** — the slide's own M1 press read, lifted from `update`, **and from part 68 `solveMacacoPose(ud)`** — the macaco's own shape of `updateVisual`, a single absolute pose on `macacoT / P.MACACO_T`). Imports `approach` from `./math.js`; no module-scope scratch. `installMacaco(Player)` attaches them |
| `player/health.js` | **part 17 of the split**: HEALTH, THE ULTIMATE, AND THE THREE SKILLS — 8 methods (`damage` / `down` / `canSkill` / `armored` / `invuln` / `overdrive` / `dmgMul` / `dropBlast`). No module-scope scratch. `installHealth(Player)` attaches them |
| `player/commit.js` | **parts 18 + 24 + 30 + 31 + 35 + 58 + 60 of the split**: THE COMMITTED MOVES' ENTRIES — 12 methods (`startHammer` / `startDive` / `startSlam` / `startSlide` / `startDash` / `qdashTime` / `backdashBeats`) plus `hammerTotal` (part 18) and, from part 24, the hammer's beat helpers `hammerHop` / `hammerAirAt` / `hammerBeat` — all re-exported because `update`/`updateVisual` read them, **plus from part 30 `tickHammerDoor()`** (the flurry's entry, the slam's landing beat read, lifted from `update`), **from part 31 `tickHammer(dt)`** (the whole flurry — the beat clock, the bounce, the turn, the flip and the impacts; it imports `TAU` from ./math.js), **from part 35 the three committed states' own `switch` bodies: `tickDiveState(dt, sin, cos)` / `tickSlamState(dt, wx, wz, hasWish)` / `tickSmashState(dt)`** (slam's needs `accelerate`, from ./physics.js), **from part 58 `solveSmashPose(dt, ud)`** — the hammer's own pose layer of `updateVisual` (its cross-fade on `HAMMER_POSE_FADE` and the `poseSmash` call; `player.js` dropped its now-unused `hammerTotal` import), **and from part 60 `solveDiveSlamPose(dt, ud, speed)`** — the dive's and the slam's own pose layers of `updateVisual` (each cross-fade + `poseDive`/`poseSlam`; `DIVE_POSE_FADE`/`SLAM_POSE_FADE` from ./pose.js, and `player.js` dropped both from its import). `installCommit(Player)` attaches the methods |
| `player/chainfade.js` | **part 19 of the split**: THE CHAIN'S CROSS-FADE — 3 methods (`chainRig` / `chainSnapshot` / `chainBlend`), the pose-layer cross-fade between two finished chain poses. A true leaf (imports nothing). `installChainfade(Player)` attaches them |
| `player/clocks.js` | **parts 20 + 48 of the split**: THE CLOCKS AND THE BUFFERS — `tickClocks(dt, grounded, inp)`, lifted out of the top of `Player.update` (every cooldown/window/tally/buffer/regen ticked before the state machine), **plus from part 48 `tickBuffers(dt, inp, grounded)`** (the kick / slam / slide press buffers, with the climb face's refusal of M1) **and `tickStamina(dt, grounded)`** (the grip refill, which stands down on a face) — both lifted from just under `tickClocks`. `update` calls all three back in the same positions. `installClocks(Player)` attaches them |
| `player/transients.js` | **part 21 of the split**: THE PER-FRAME TRANSIENT RESET — `resetTransients(dt)`, lifted out of `update`: clears last frame's climb flags (`climbing`/`wallSliding`/the two climb speeds/the pull state) and the wall-run latch, before the wish is read. Reads only `dt`; needs `P` + `approach`. `installTransients(Player)` attaches it |
| `player/core.js` | **part 22 of the split**: THE SMALL CORE METHODS (a batch) — `loadCharacter` / `hasCharacter` / `airComboGravity` / `setState` / `moveTarget` / `lockMoveMul`. Imports `buildPlayerCharacter` (../charmodel.js) and `disposeTree` (../geom.js). `get airComboOpen` deliberately stayed on the class (a getter cannot ride an `Object.assign` table). **Part 86** adds `tickAirComboHand()` — the air combo's hand on the body (the player's deck written to every juggled body's `comboY`, cleared the moment the window shuts), lifted from `update`. `installCore(Player)` attaches them |
| `player/fall.js` | **part 23 of the split**: THE FALL — the pure fall math, `impactFromDrop` / `fallWeights` / `pickFallKind`. Plain exported FUNCTIONS (no `install*`): `player.js` imports all three back. `P` only |
| `player/pose.js` | **part 25 of the split**: the last module-scope state that sat above the class — every pose cross-fade duration, the idle's per-boot deck-sampling clamps + `IDLE_FOOT_TMP`, `SMASH_PLUNGE_V`, and the tilt / clinch / capo scratch vectors (45 `const`s). A leaf (imports only `three.js`), exported wholesale; `player.js` imports all of it back. No `install*` |
| `player/respawn.js` | **part 26 of the split**: THE RESPAWN — `respawn()`, the `]` key's clean reset (re-spawn, full heal, let go of every carried body / the staff / the wall, back to `air`). Deps: `P` and the class's own `releasePole`/`setState`. `installRespawn(Player)` attaches it |
| `player/wiring.js` | **part 26 of the split**: THE PUBLIC WIRING — the three little setters/readers the rest of the game hooks the body up with: `setEnemies` / `setPoles` (main.js) and `combatMoves` (the rig's baked move table, read by combat.js and the poses). A true leaf. `installWiring(Player)` attaches them |
| `player/guard.js` | **part 27 of the split**: THE FRAME GUARD — `recoverGuard()`, the NaN / out-of-world safety net lifted from the top of `update`. `true` means it had to put the body back on its spawn, so `update` does `if (this.recoverGuard()) return;`. A true leaf. `installGuard(Player)` attaches it |
| `player/states.js` | **parts 36 + 39 + 40 + 45 + 61 + 73 + 74 of the split**: THE LOCOMOTION STATES of `update`'s per-state `switch` — `tickGroundState(dt, inp, hasWish, wx, wz)` (the throttle, the steering grip, the wish acceleration and the overspeed brake, then the deck's pull and its gate), `tickSlideState(dt, hasWish, wx, wz)` (the hold, the carve, the squeeze's pay, the drain tail, the slope pull), from part 39 `tickDashState(dt, grounded, hasWish, wx, wz, sin, cos)` (the step's pose clock, the quick step's drag-and-curve, the boxcutter's landing and the BACKDASH's whole performance — the only body that needs the camera basis as well as the wish), from part 40 the biggest of them all, `tickAirState(dt, inp, hasWish, wx, wz)` (the wall CLIMB, the WALL RUN, the WALL SLIDE, the PLUNGE, the SKYFALL and the plain fall's air control), from part 45 `tickStateExits(dt, inp, grounded)` (the four states that end on a CONDITION rather than a clock — the dive, the slide, the dash and the block — lifted from `update`'s own `// ---- state exits ----` heading), and from parts 61 + 73 + 74 the three locomotion BASE pose layers of `updateVisual` — `solveDashPose(dt, ud, pitch)`, `solveSlidePose(dt, ud)` and `solveCrouchPose(dt, ud, speed)` (the dash's pitch/`poseDash`, the slide's cross-fade/`poseSlide`, and the crouch's fade + its short walk stride/`poseCrouch`; `DASH_POSE_FADE`/`SLIDE_POSE_FADE`/`CROUCH_POSE_FADE` from ./pose.js), each carved out and called back at the exact spot its block ran. Imports `P` + `RUN_STRIDE` (./config.js), `wrapPi` / `swingTowards` / `approach` (./math.js) and `accelerate` / `applyFriction` / `bleedSpeed` (./physics.js — the motion helpers, which is why these bodies are homed beside them and not in `move.js`'s collision core). Bodies VERBATIM at their original indentation. **Part 85** adds the DISPATCH itself, `tickStateMachine(dt, inp, grounded, hasWish, wx, wz, sin, cos)` — the whole `switch (this.state)` of `update` lifted verbatim, so every state's logic now lives in this file. `installStates(Player)` attaches them all |
| `player/jump.js` | **parts 41 + 71 + 75 of the split**: THE JUMP — `tickJump(grounded, speed2D, hasWish, wx, wz)`, the whole `// ---- jumping ----` block of `update` moved here: the GROUND JUMP (the deck's own rise added back on a slope, the BHOP chain's boost off a fresh landing), the jump out of the MIDDLE of a move, the WALL JUMP, the DOUBLE JUMP (with `nextJumpVariant`), the pole launch and the gate that refuses a committed state. No `dt` and no `inp` — only those four readings, which is why they are the argument list, **from part 71 `solveAirPose(dt, ud)`** — the jump/air family's own pose layer of `updateVisual` (the `airWant` gate and `poseAir` with its vertical-velocity and variant channels; needed `approach` from ./math.js and `AIR_POSE_FADE` from ./pose.js), **and from part 75 `solveTuckPose(ud)`** — the double jump's flip tuck (`flipPose` on the sin envelope + `poseTuck`). Imports `P` (./config.js) and `nextJumpVariant` (./wallrun.js). Body VERBATIM at its original indentation, comments and all. `installJump(Player)` attaches it all |
| `player/landing.js` | **parts 43 + 66 of the split**: THE LANDING — `tickLanding(dt, inp, velYBefore, hasWish, wx, wz)`, the whole `// ---- landing ----` block of `update`: what happens on the frame the feet find the deck (the impact read off the fall's peak, the kind of landing, the brace and the pose's own clock, the jolt and the squash) and the GROUND SLAM's shockwave (`dropBlast`) when the landing came out of a slam, **plus from part 66 `solveLandPose(dt, ud)`** — the absorb and the slam-landing pose layers of `updateVisual` (the two one-shot timers, `poseLand`, and `poseSlamLand` which REPLACES the absorb while the fists are in the deck; needed `approach` from ./math.js and `LAND_POSE_FADE` from ./pose.js, and `player.js` dropped both LAND fades from its import). Imports `P` (./config.js), `impactFromDrop` (./fall.js). Body VERBATIM. `installLanding(Player)` attaches it |
| `player/facing.js` | **part 44 of the split**: THE FACING — `tickFacing(dt, hasWish, wx, wz, sin, cos)`, the whole `// ---- facing / visual ----` block of `update`: the step sound and the long chain that decides where the body's own line points each frame (the clash's rotation lock, the launch's line, the mantle, the vault, the skills' aims, the staff's, the guard's, the climb's and the wall slide's, first-person, SHIFT-LOCK, the dash, and last the run's turn onto its travel). It COMPUTES `hsAfter` and RETURNS it, because the caller needs it for `updateVisual` (`const hsAfter = this.tickFacing(...)`). Imports `P` (./config.js) and `wrapPi` (./math.js). Body VERBATIM. `installFacing(Player)` attaches it |
| `player/wish.js` | **part 49 of the split**: THE WISH — `tickWish(inp)`, the whole stick-read of `update`: the camera basis (`sin`/`cos` of `camYaw`), the two axes into it, the dead zone, the normalise, and `wishX`/`wishZ` left on the body for whatever fires outside the input frame (the dash reads them). It RETURNS `{ sin, cos, wx, wz, hasWish }`, which the caller destructures — those five are the frame's own wish and the camera basis half the state machine runs on. A true leaf (no imports at all). `installWish(Player)` attaches it |
| `player/items.js` | **part 69 of the split**: THE GEAR POSE LAYERS — `solveItemPoses(dt, ud)`, the three poses the body wears for the thing it is holding, written together in order at the tail of `updateVisual`: the CARRY (one arm, riding the run's stride), the BALL ACTIONS (the shoot and the throw, one shape over everything) and the TOTE (a duffel in both arms, last so nothing below can put an arm back). These are LAYERS, not states — the legs keep solving the state — which is why they were all written in one run and could move as one method. Imports `approach` (./math.js) and `TOTE_POSE_FADE`/`BALL_POSE_FADE` (./pose.js). `installItems(Player)` attaches it |
| `player/placement.js` | **part 77 of the split**: THE RIG PLACEMENT — `solvePlacement(dt)`, the head of `updateVisual` (139 lines moved verbatim): where the BODY ITSELF sits in the world each frame — the wall hug (the press that pins the trunk to the wall while sliding), the DECK Y-FOLLOW (the whole-take and the slope feed-forward, comments and all), the STAFF STRIKE's yaw spin, and the SLOPE lean taken about the FEET (`tiltG`'s pitch/roll from the deck gradient). This runs before every pose layer because it writes the group's position and the tilt group's rotation — the poses then solve INTO that frame. Imports `P` (./config.js), `approach` (./math.js) and the tilt scratch trio `_tiltM`/`_tiltE`/`_tiltFoot`/`_tiltOut` (./pose.js — which is exactly why `player.js` dropped them from its own import; this was their last reader there). **Part 80** adds THE RIG'S LEAN, `solveRigLean(dt, speed, pitch)` — the block just after the body angles: the wall bank + the capoeira's roll on `this.lean`, the lock's trunk roll, the run's travel split into the body's own frame (`runFwd`/`runLat`, RETURNED), and the hip-pivot PLACEMENT of the rig (the wall run's bank offset and the lunge's own ball). It took `WALL_BANK_FADE` (./pose.js), which `player.js` dropped (its last reader there). **Part 83** adds `solveDeckClamps()` — the TRUE-VERTEX deck clamps at the very tail of `updateVisual`: the lunge's miss-roll handover and the scissor's whiff each sweep the drawn vertices once (a y-shift of `inner` is a pure translation, so one pass is exact) and lift whatever dipped under the deck. Needs only `P`, which the module already had. `installPlacement(Player)` attaches ALL THREE methods |
| `player/rig.js` | **part 78 of the split**: THE RIG'S BODY ANGLES — `solveRigAngles(dt, speed)`, the front half of `updateVisual` (394 lines moved verbatim): everything that turns and squashes the whole rig before a shape is worn. The state's forward `pitch` (the slam's meteor tilt, the macaco's whole turn, the dive's speed-read, the skyfall/plunge cross-fade, the clash's drive, the flips and the kicks), the `sy`/`sxz` squash-and-stretch, and the rig's own TURNS — the `spinX` tumble with its whole-revolution tidy-up, the `dashSpinY` step spiral, and the entire `inner.rotation.y` chain (hammer, whirl, sweep, step, flash grab, and the settle). It also ticks the plunge's cross-fade and spends the macaco's deck lift, since both are read by this frame's angle AND pose. It does NOT apply `pitch` — the caller still adds to it later (the lunge's ball placement, the skyfall's brace, the limb stretch), so it RETURNS `{ pitch, spinExtra }` (`spinExtra` = the tumble alone, which the first-person camera reads via `bodySpin`). Imports `P` (./config.js), `approach` (./math.js), `vaultLift` (./vault.js) and `DIVE_LEAN_BASE`/`DIVE_LEAN_SPEED`/`FALL_POSE_FADE` (./pose.js); `player.js` dropped its `DIVE_LEAN_BASE`/`DIVE_LEAN_SPEED`/`vaultLift` imports (its last readers there) but kept `FALL_POSE_FADE`, which it still uses. **Part 81** adds THE FINAL RIG WRITE, `solveFinalRig(dt, speed, pitch, ud)` — the tail of the rig's work: squaring up any leftover whole-rig turn (`grabFlip`), writing the final `inner.rotation.x` (the state lean + `spinX`/`dashPitch`/`grabFlip`/`vaultFlip` + the ground's speed lean), then spending the limb stretch (`ud.stretchApply`) and the neck split (`ud.neckApply`). It took `TAU` (./math.js), which `player.js` dropped along with its long-unused `wrapPi`/`swingTowards`. `installRig(Player)` attaches BOTH methods |
| `player/base.js` | **part 79 of the split**: THE LOCOMOTION BASE — `solveLocomotionBase(dt, speed, runFwd, runLat, trunkRoll)`, the layer every other pose is worn over (~110 lines moved verbatim): the run cycle (`wantRun`, the speed-driven phase, the locked BACKPEDAL running it backwards, and the BLOCK + the staff's two ground moves kept in the list so their legs keep striding), the idle cross-fade (`wantIdle`, `idlePose`, `idleTime`), and the idle's per-boot deck sampling (`footGround`, only while the idle is actually on the rig). It RETURNS the `charMesh.userData` handle (`ud`), because every pose layer that follows takes it. Imports `P` + `RUN_STRIDE` (./config.js), `approach` (./math.js) and `RUN_PERIOD_MIN`/`RUN_FADE_IN`/`RUN_FADE_OUT`/`IDLE_POSE_FADE`/the `IDLE_FOOT_*` set (./pose.js) — all of which `player.js` dropped from its imports (their last readers there). `installBase(Player)` attaches it |
| `player/init.js` | **part 84 of the split**: THE PLAYER'S CONSTRUCTION — `initPlayer(pl, scene, world)`, the whole of the old 712-line `Player` constructor body moved out verbatim with `this.` → `pl.`, so `player.js`'s constructor is now one line. It is a plain FUNCTION (not a method table) because a constructor cannot ride `Object.assign` and because the body never calls a method on `this` (verified: zero `this.x(` calls, zero arrow functions, zero `return`/`super`), which is what makes the substitution exact. It holds every field's default in its original order — movement, the slope, the dash/kick/dive/slam clocks, the squeeze, the meters, the skills, the knee, the grab, the lunge, the staff, the scissor anchor, the RIG ITSELF (material, groups, mesh, character), the idle's feet, the gear hooks, the climb, the wall clinch, the melee chain, the block and the guard's latch. Imports three.js, `P` + `CHAR_SCALE` (./config.js), `buildBoxGeometry` (../geom.js) and `createMaterial` (../ps1.js). This move exposed a big block of stale imports in `player.js` (its `THREE`/`POLE`/`buildPlayerCharacter`/the `_pole*` scratch/`wallRunFrame`/`accelerate`/`applyFriction`/`bleedSpeed`/`impactFromDrop`/`fallWeights`/`FALL_POSE_FADE` and more were used ONLY by the old constructor or had gone unused in earlier parts) — all pruned, leaving `player.js` importing exactly what it uses |
| `player/board.js` | **THE SKATEBOARD — the body's half (session 200)**: the three RIDE states and everything the body does on a deck — `ride` (the carve, the PUSH cadence, the rolling drag and the trick cycle), `bslide` (the POWERSLIDE — a brake, not the on-foot slide) and `bbomb` (the BOMB — a dive thrown at the deck, the one landing that keeps its speed) — plus the mount/dismount BOOKKEEPING half the body owns (`startRide`/`endRide`), the trick tables' reader (`trickKind`/`trickT`/`trickSpins`/`trickSpd0`), the `boardLeg`/`poseRide`-facing fields (`boardLift`/`boardCarve`/`boardManual`/`boardPushPh`/`bslideAngle`/`bslideSide`/`boardSpinY`) and the board's own sfx calls. NOT the prop — `inventory.js` owns where the board lies, the mount/dismount that PARENTS the deck into `tiltG`, and the drop it is handed back as; NOT the stance — `streetwear.js` owns `BOARD` / `BOARD_TRICKS` / `boardLeg` / `poseRide` / `poseBSlide` / `poseBBomb`. A LEAF: `P` (./config.js), `approach`/`wrapPi` (./math.js), `bleedSpeed` (./physics.js) and the three pose fades (./pose.js). `installBoard(Player)` copies the method table onto `Player.prototype` |
| `enemies.js` | the other side of the fight: `Enemies` + `Enemy` |
| `camera.js` | third-person orbit rig, shake, zoom, kick sweep, the MOVE FRAME |
| `input.js` | keyboard, pointer lock, the whole touch layer |
| `audio.js` | tiny WebAudio synth (no asset files) + the master volume (`Sfx.setVolume`). **Plus the SKATEBOARD's voices (session 200)** — a MATERIAL the mix had not had (wood + urethane): `boardMount` / `boardPush` / `boardPop` / `boardLand(power)` / `boardSlide` + the per-frame `boardGrind(k)` texture / `boardBail` / `bomb` |
| `hud.js` | DOM HUD, options card, update log, the dial + air diamond. **Plus the deck's own read-out (session 201)** — `setTrick` / `#trickEl`, the trick that just landed, styled in the board's mint so it is never confused with the melee's `setCombo` |
| `gameui.js` | **THE SHELL (session 203)** — `GAME_MARKUP`, the WHOLE body markup extracted **verbatim** (39,515 chars) from the prefix `index.html` used to open with, plus `bootUI()`. It is `main.js`'s FIRST import, so it runs before any module caches a DOM reference; `bootUI()` returns immediately unless `#view` is missing, and otherwise rebuilds the body from the markup with **every element that survived the platform's front-cut put back in its own place (live wins)**, re-links `src/game.css`, re-asserts the viewport meta, and sweeps the cut's debris behind the canvas. See "THE FRONT-CUT BUG" |
| `game.css` | **THE STYLESHEET (session 203)** — the single 203,004-char `<style>` `index.html` used to carry, extracted **verbatim**. Both base64 faces live in it, one of them an 88,401-char single line, which is the second reason it is out of the editor's file. Linked from `index.html`; re-linked by `gameui.js` if a cut takes that line |
| `inventory.js` | THE GEAR: world duffel + soccer ball (carry / control / shoot / throw), tetris pockets, editor, quick menu, dropped props. **The shoot is CHARGEABLE since session 198** — M1 winds it up and the BUTTON COMING UP is the strike (`shootBegin` / `tickShoot` / `releaseShoot` / `powerOf` / `shootLaunch`), with a cancelled wind-up and a whiff as the two honest failures, **and `legWeight()` keeps a charge taken at a run from planting the boots** (the lower half stays the run's until the strike). **It also owns THE SKATEBOARD's PROP half (session 200)** — the board as an ordinary `drop` at `BOARD_HOME`, resting on its wheels alone (`PROP_REST_AXES.board`), taken with `M2` (`takeM2`) and RIDDEN with `E` (`mountBoard` / `dismountBoard`), which is the only code in the game that PARENTS a prop's mesh into `tiltG` |
| `abilities.js` | the economy: rank, ultimate, overdrive, skill cooldowns |
| `adapt.js` | samples the world and writes the HUD accent colours |
| `effects.js` | pooled impact FX — one effect per KIND of event |
| `main.js` | bootstrap + frame loop + `window.GAME` + `UPDATES` + every world-space FX drain + `worldStrike` |
| `README.md` | this file |
| `SPEC.md` | the user's spec, session by session |

Options live in `optionItems()` (`main.js`) → `hud.renderOptions()`; rows carry `data-act`, one
delegated listener routes them to `applyOption`. Persisted to `localStorage["baseplate.options.v1"]`.
`refreshOptions()` re-renders and restores scroll. Scrollbars are restyled to the HUD.

## The game

### Rendering (the PS1 look)

1. Internal buffer at 224 lines (192/160 on quality drop), blitted pixelated. Buffer aspect must
   match the window (poll `innerWidth/innerHeight` every frame — a resize event is unreliable).
2. Vertex snapping (`uSnap`), affine texture mapping (`uAffine`), 15-bit + ordered dithering.
3. Baked vertex AO + dynamic sun light: `geom.js` bakes albedo/shade/corner-AO; `ps1.js` evaluates
   the lambert term per-fragment from shared sun uniforms, so the terminator moves with the sun.
4. Fog matched to the horizon; a mood may raise `uFogMix` even with retro fog off.

Colour management is **disabled** (`THREE.ColorManagement.enabled = false`) — hex colours are used
verbatim. `preserveDrawingBuffer: true` is intentional.

### The player's outline

An inverted hull per body part: welded normals, view-space push, `renderOrder` 3 with the body at 4
so only the ink outside the silhouette survives. The shell is parented to the part, so it rides
every hinge for free. `attachOutline(mesh, geo, widthScale)` takes a width share (the digits get a
thinner one). Toggled by `PLAYER OUTLINE`. `setOutlineTint` / `clearOutlineTint` give one body a
second pair of materials for a cue (the whiff's 25%-alpha red outline).

### Sky, day & night

`SkySystem` owns the clock (0…1) and weather moods. Three palettes blend by sun elevation, then
biome hue-tint and mood modify; everything is smoothed before uniforms so palette changes never pop.
Moods are weighted random states (`CLEAR`, `SUNNY`, `BLAZING`, `OVERCAST`, `STORM`, `MOONLIT`,
`AURORA`). **On a dome, any UV built from `d.xz` must be regular at `d.xz = 0`** — the clouds and
aurora use the stereographic `d.xz / (1 + h)`.

### The world

`CHUNK = 32`, `CELL = 8`. Structures declare footprints and return boxes; the streamer builds
nearest-first within a time budget. Collision is axis-aligned boxes + a height field
(`World.terrainHeight` = `groundBaseAt` + `Destruction.terrainHeight` — the only two definitions of
the deck). Chunks are mutable: `buildChunk` generates the box list, `fillChunk` builds the ground,
mesh, decals and colliders from the **pieces** the boxes are currently made of.

**Four generators**, chosen by `settings.world` (`K` / `WORLD GEN` row):
- `field` — the biome roll (`STRUCTURES`).
- `maze` — an endless maze on the 8-unit lattice; blocks of 8×8 rooms each run a bounded binary
  tree, blocks joined by forced doorways; `mazeWallHeight` rises with distance (2.8 → 80). Wall tops
  are runnable plateaus. Camp is kept clear.
- `hills` — one smooth height field (`HILLS`), the camp IS the summit, grass, pinned sky, **no
  scenery at all** (session 132). See "THE SLOPE" for the body-on-a-slope system.
- `park` — **THE SKATEPARK** (session 206): a 64-unit lattice of flat plazas quantised to 12-unit
  risers (`PARK`), the ground between them an S-curve ramp, three authored set pieces (bowl / pipe /
  spine) sunk into their own plazas, and park furniture on the flat decks only. Concrete colouring
  (`parkGroundColor`), no grass, pinned sky. See "THE SKATEPARK".

### Destruction

Nothing in `destruction.js` knows what it is breaking: damage is addressed to a **slot** (a whole
box, or one cell of a cut one — `voxel.js`) or to a ground patch. `Destruction.strike(x,y,z,power,
opts)` is the one primitive; `opts.surface` is `"ground" | "wall" | "auto"` and `opts.dir` is the
direction the blow travelled. Crack / break stages; breaks spread into touching solids; big boxes
are cut into cells and a break takes the cell the boot is on. The ground has its own (much higher)
hardness — craters are dug, not blasted. Every attack goes through `main.js`'s `worldStrike`.

### Movement & parkour

Quake-style accelerate/friction, axis-separated AABB, sub-stepped, 1.05 step-up. Speed builds to
`SPRINT` (10.9) over `BUILD_TIME` — **there is no sprint key**. Momentum is preserved (gentle
overspeed bleed, near-frictionless air, bhop chains, slides). Slide tucks the box and a **squeeze**
feeds it momentum. Wall run / slide / climb / jump / kick / vault / ledge grab all documented in
the code and their own sections.

### The climb is a clip, and a clip leaves values on axes nothing else owns

The climb is the user's own Mixamo clip (`CLIMB_Q`, baked offline by `src/tools/climb-bake/`), worn
as a **whole quaternion** on each of the sixteen bones in `CLIMB_BONES` — including the SHINS. An
angle-based pose in this rig writes only the axes it means to (`x` for a knee, `x`/`z` for a thigh),
so `poseRun`'s reset block zeroes the rest every frame and a wall solve can leave a value on a yaw
or a roll only for the frame it is live. The shins' `y`/`z` were missing from that list until
session 164: the clip rolls each knee about 31 degrees to turn its bend plane out of the stone, and
left on, a body that lands still wears it — the two feet are carried into each other and STAY there
(measured, feet **0.476 rig units apart -> 0.082**; with the reset in, they come back to the idle's
own **0.238 a side** and the landing's shoes never come nearer than **0.326**). The clip also holds
its legs close, so `CLIMB.SPLAY` abducts each thigh off the pelvis' own fore-and-aft axis — faded
out by `rest`, so the parked stance (`poseClimbPark`, which solves its own four contacts onto the
face) is never rolled behind its own solve.

### The parked climb has an idle, and it is a PARK of the climb clip (sessions 165 + 199)

A body hanging on the face used to hold one frame forever, and session 165 answered that with
`CLIMB_REST.idle` — four incommensurate periods (breath, weight-shift, look, re-grip) run over a
hand-authored four-contact stance. Session 199 threw that stance away (see "The parked climb is a
PARK of the climb clip" above): `CLIMB_PARK.idle` now runs the same four periods over a pose the CLIMB
ITSELF occupies, so the idle's tells ride on top of the animation's own settle. MEASURED on the live
rig across **15 s** of park: the hips/torso carry the whole of it — **0.059 / 0.054 / 0.032 world** of
sway on the three axes — while the planted hand moves **0.006 world** at most (0.0044 / 0.0024 /
0.0055) and **both soles are 0.000 on every axis**, because each foot is solved onto a fixed target
and every idle offset is taken back OUT of the plan before the solve (the plan is the plan and the
contact does not move). The idle's own clock (`climbRestT`) is a clock rather than a weight, so a body
that re-takes the stone after a jump breathes on the beat it left.

### M1 pulls the wall

`M1` on the face is a LOAD, not a climb (`P.CLIMB_LOAD_*`, the pull itself in `poseClimbPull`, and
the state machine in `player.js`). Down, the body **stops dead on its holds** (`CLIMB_LOAD_BRAKE`
stiffens the climb's own ease 3.2x, so it does not creep up the face while it is supposed to be
dropping down it) and **coils**: `CLIMB_LOAD_SINK` 0.44 rig of hip drop (it MUST match `CLIMB_COIL.sink`
— the pose is what draws it), with the ankles drawn up to 0.50 so the legs FOLD by exactly what the
hips drop. At a full load, measured: the ankles sit 0.11 world below the hips and the elbows ride
0.28 world **above** the shoulders. The charge walks the elbows back, down and out
(`CLIMB_COIL.wind`), leans the trunk in, closes the grip and shakes — a bigger, SLOWER tremble (9 Hz)
reads as strain where a fast one reads as noise. Released, the charge is spent on distance —
`CLIMB_SKIP_BASE + CLIMB_SKIP_GAIN * charge`, saturating off `CLIMB_LOAD_CHARGE` (measured: a tap
1.70 world, a full 3 s coil 8.70) — and the load costs grip on top of the hang (`CLIMB_LOAD_DRAIN`),
so a long charge is a bet against the bar. `CLIMB_SKIP_TRIM` (the reciprocal of the ramped launch
profile's own mean, 15.1 % of which the ramp eats) is what makes `climbFireDist` the distance the fire
ACTUALLY covers.

`CLIMB_COIL` is a table of PLANS in the hips' own frame, solved by `wallHand`/`wallFoot` — the same
machinery the wall slide's hand and the parked idle use. Two things about it are worth keeping:

- **The aim has two ends.** `rel` (`climbRel`) walks it from the HOLD — a point in the WORLD, with
  the body's rise (`rise`) taken back out of it, which is what leaves the hands planted while the body
  hauls past them for the first `CLIMB_HAUL_RISE` of travel — to the REACH, where the limbs are
  thrown: a plan in the BODY's frame, authored PAST the limb's own reach on purpose so the solve
  clamps it and the arm comes out straight, like a leap's. `rel` is a rate-limited STATE
  (`CLIMB_HAUL_RELEASE` off the stone, `CLIMB_HAUL_REGRIP` back onto it), not a function of distance.
  The reach's own `sweep` rides the fire's clock (`st.fire`), so the limbs keep reaching up the face
  for the whole half-second flight instead of holding one frame of it.
- **Both ends are SOLVED, and that is the whole trick.** A limb this overlay stops solving is left to
  the clip's own writer, and that writer **wanders** — measured 0.46 rad a frame for seven frames,
  which threw the palm 0.8 world off the plate and then snapped it 2.5 rad back in ONE frame when the
  hold solve re-took it. Solved at both ends, the palm's per-frame travel through the settle is under
  0.08 world and the flight's excursion off the stone is 0.27.

The rig hook `group.userData.poseWall` must forward **all EIGHT** of its arguments (`pull` and `idleT`
included): a session-165 bug had it forwarding six, which silently made the pull unposable (the `pull`
reading and the idle clock never arrived). Session 199 dropped the ninth (`restL` — the hand the old
one-sided stance planted) along with the whole stance that used it: the parked pose is now read off
the climb clip itself and plants BOTH hands, so there is no side for a forwarder to lose (see the next
section).

### The parked climb is a PARK of the climb clip, not a second animation (sessions 181 + 199)

Session 181's version of this had the parked stance plant ONE side — which hand was on the stone was
read off the clip's own pose and cached (`readClimbHand` -> `climbHandL` -> `CLIMB_REST.reachL`) — and
session 199's user verdict on it was *"the wall climb idle animation looks bad delete it and make a new
one from scratch also and take heavy inspiration from the wall climbing animation"*. The stance is
rebuilt from scratch, and the diagnosis worth keeping is why the old one looked wrong at all: a
hand-authored rest is solved to four holds that the climb ANIMATION never occupies, so the moment the
player stops steering, the body stops matching the move it was just doing. Every trace of it is
DELETED — `CLIMB_REST` (the table), `poseClimbRest`, `wallFootDrop`, the `_rest*` scratch, `readClimbHand`
and its `_hand*` scratch, `climbRestL` / `climbHandL` (and their `init.js` fields), and `poseWall`'s
ninth argument.

The new stance is READ OFF the clip:

- **The four holds are a frame of the climb.** `CLIMB_PARK` is `CLIMB_Q` at **phase 0.967** — scanned
  over all 61 keys for the frame where all four limbs are nearest the plate (the four deepest drawn
  vertices read **-0.027 / -0.041 / -0.009 / -0.056**) — with each limb's `dn` then walked out until
  its deepest drawn vertex sits ON the plate.
- **All four contacts land on the stone.** MEASURED stand-offs from the plate, rig units: **L -0.014,
  R -0.036, fL -0.003, fR +0.009** (all four within 5 cm world). The pose is a contralateral pairing —
  the rig-R hand high, the rig-L bracing out at shoulder height, the rig-L foot folded up, the rig-R
  foot extended down — which is what the clip's own settling frame does.
- **It is SOLVED, not copied.** `poseClimbPark` runs both hands through `wallHand` and both feet
  through `wallFoot(..., flat, kneeOut)` with the elbows pole-driven (the `CLIMB_COIL.handCfg`
  bargain), squares the hips/trunk/wrists/shins/neck first, drives the digits from `CLIMB.GRIP`, and
  SUBTRACTS the idle's own offsets from every plan — so the breath (4.3), weight shift (7.1), look
  (9.7) and the 5.9 regrip pulse happen BETWEEN four still holds rather than dragging them around.
- **The clip stops creeping under a parked hand.** The idle shuffle (`CLIMB_CYCLE_IDLE`) stands down
  for the whole of a park (`idleHold`) and the clip holds the frame it stopped on; the first hand of
  movement starts it again.

Session 181's user requirement — *"the hand that was touching the wall stays on the wall"* — is
satisfied a fortiori now: the park plants BOTH hands, so there is no wrong side to pick.

### THE SKATEBOARD (session 200)

The brief, verbatim: *"add skateboard and make me able to get on it and do flips with it and stuff u can
take animations from the marketplace if you have to but make the slide mech and dive and all the stuff
unqiue for it not the same make able to get on it by pressing E"*. The last sentence is the design:
the board's `SHIFT` is **not** the on-foot slide and its `F` **is not** the flying dive, so it is a set
of STATES rather than a set of re-skins, and it is split across four files by what each half IS.

**The prop (`inventory.js`).** A board is an ordinary `drop` at `BOARD_HOME` (`x` 7.2 / `z` 6.9 — past
the ball, clear of the bag), so gravity, the wall, the boot, the pickup and the prompt are machinery
that already existed. Two things are its own: `PROP_REST_AXES.board` is the deck's own down vector
**alone**, so a board left on its side lays itself flat instead of freezing nose-down; and it is taken
with **`M2`** (`takeM2` — exactly the ball's bargain in reverse), which is what leaves **`E` free to
RIDE**. `E` is the mount (`BOARD_MOUNT_R` 2.4 u) and the dismount, and it needs the body GROUNDED — an
`E` in the air stays latched until he lands. **Mounting PARENTS the deck mesh into `tiltG`**, so the
board, the shoes and the ground's lean are one thing and nothing per-frame keeps them together; no
other prop in the game does that (the dropped ones are all world objects), which is why the mount and
the dismount are the only two places the parenting is touched. A dismount at speed is honest about the
pair: the BODY walks away with `BOARD_DISMOUNT_V` (0.75) of the speed and the BOARD keeps all of it
and rolls on.

**The height is measured, not chosen.** `P.BOARD_LIFT` is the one number the rig movement needs: the
wheels hang **0.195 world units** under the deck's top face (read off `boardMesh`'s own box, which is
authored at -0.130 and then drawn through `BOARD_SIZE` 1.5 — see the session 201 note below), so 0.195
puts the shoes on the deck and the wheels ON the road. It was 0.15 — and MEASURED on the live rig the
whole ride **floated 0.02 u** (the deck's bounding box 0.02 above the ground, i.e. a board hovering
over the road). `mountBoard` reads the same height off the box it mounts, so the constant and the mount
cannot disagree, and `BOARD_ROAD` (0.195 / 1.351 rig units) is that number re-expressed in the rig's
frame — the one thing a PUSH needs, because the pushing foot's target is the ROAD and not the deck.

**The ride (`ride`) has no throttle — it has a PUSH.** `BOARD_PUSH_V` 1.70 u/s a kick and
`BOARD_PUSH_CAD` 0.30 s apart, so the feet pumping at **~3.3 a second** is the whole engine, and the
drag is deliberately SHAPE-INDEPENDENT of the run's: small at a crawl (`BOARD_DRAG` 0.55 u/s²) and
growing with speed (`BOARD_DRAG_SPD` 0.34), so a pushed board settles in the low teens and a FIELD
hill can then take it past the run's own ceiling. `MAX_SPEED` is therefore **LIFTED for the whole of a
ride** — a board is fast because a hill can take it faster than a man can run, which is the entire
reason to be on one — and `BOARD_TOP_SPEED` 60 is only a collider safety net, not the mechanism. The
carve is the SLIDE's bargain (the line is bent, the speed is left alone) with one difference: **a board
turns LESS the faster it goes** (`BOARD_TURN` 2.60 rad/s at a crawl → `BOARD_TURN_FAST` 1.15 by
`BOARD_TURN_FULL` 18), because that is the difference between a carve and a skid. `BOARD_LEAN` 0.34
lays the DECK over at a full-rate carve, and the body with it.

**`bslide` — the POWERSLIDE (`SHIFT`)** shares nothing with the on-foot slide but the word. That one
HOLDS its speed and has no friction at all for its first half-second and ends when you let go; this one
is a BRAKE. The deck is put SIDEWAYS to its own line (`BSLIDE_ANG` 1.05 rad ≈ 60°, growing from
`BSLIDE_ANG_MIN` 0.45 with speed), the scrub is a constant deceleration that grows with speed
(`BSLIDE_DECEL` 16 → `BSLIDE_DECEL_HI` 26 u/s² by `BSLIDE_FULL` 22), and the angle is still steerable
while it runs (`BSLIDE_TURN` 1.7 rad/s) — a brake AND a carve at once. It ends on release or under
`BSLIDE_MIN_SPEED` 2.6. It is the only way to stop on a board, which is why it is not a flourish.

**`bbomb` — the BOMB (`F`)** shares nothing with the flying dive but the key. The dive is a head-first
glide the camera steers; this is a body thrown AT the deck under `BBOMB_GRAV` **1.55** (the skyfall is
1.35, the plunge 1.9) with the travel GROWN rather than spent (`BBOMB_DRIVE` 6.5 u/s²), and it is the
ONE landing in the game that keeps its speed (`BBOMB_LAND_KEEP` 0.92 — a bomb that scrubbed off on
arrival would not be one). Its opening leap was hard-coded at 3.4 u/s, which MEASURED through the live
ticks made the whole move **eight frames — 0.13 s — from the press to the road**, a stumble rather than
a body thrown at the deck; `P.BBOMB_LAUNCH` is 5.5 (0.17 s of rise, 0.46 u of clearance), small on
purpose because a bomb is spent off a LEDGE.

**The tricks are read off the RIG.** `BOARD_TRICKS` (`streetwear.js`) is the one table — OLLIE (row 0,
not in the `M1` cycle) then KICKFLIP / HEELFLIP / SHUVIT / 360 SHUVIT / BODY VARIAL — and each row
carries its own `roll` (whole turns about the deck's long axis), `yaw` (turns about its own vertical),
`pop` (the share of `P.BOARD_POP`) and `dur`. `startTrick` reads all of them off the rig, so the deck
that is DRAWN and the airtime the pop buys are one decision and cannot drift apart. `P.BOARD_POP` is
10.5 u/s = 0.32 s of rise, **1.67 u** of clearance and 0.64 s in the air — the comment had claimed
6.7 u, written off a mis-set vertical, and the number was corrected by measurement. `SPACE` is the
OLLIE (the same pop with no spin) and `M2` is the MANUAL, the only one of the five that is a HOLD.

**And a MISS is a RULE now, not an accident.** The old tick bailed EVERY trick whose speed had fallen
under `BOARD_MISS_SPEED` — which MEASURED included an ollie thrown from a standstill: the trace had an
ollie on the spot dismount the rider, which is obviously wrong. Now an **OLLIE can never miss**, nor
anything thrown from near a standstill (`thrown = trickSpd0 > MISS·0.6`); only a **SPIN** trick thrown
at speed that arrives almost stopped does (`sp` under `min(MISS, trickSpd0·0.4)`). That is the honest
read: the deck only shoots out from under a rider who carried real speed into a landing with none left.

**The stance is solved foot by foot, and the first solve was off by an argument.** A skater does not
stand the way he travels — the deck's long axis runs down the travel line (the mesh is parented into
`tiltG`, so the rig's own `+z` IS the nose), the two feet are planted ALONG it and both point ACROSS
it, so the pelvis is turned a full QUARTER TURN (`BOARD.yaw` **-1.5708**) and the shoulders
counter-rotate back onto the line (`BOARD.torsoYaw` 0.90). The yaw is 90° rather than the 74° a real
skater's shoulders would suggest for a measured reason: at exactly 90° the model's own ankle stand-off
(`ANKLE_X`, 0.2 rig units) points ALONG the deck, so the two feet are spread nose-and-tail by the legs'
own geometry and the solved roll collapses to **0.000 rad at the front foot and 0.019 at the back**
(measured on the live rig). Any other yaw spends part of that 0.2 as ABDUCTION, and an abducted leg
LIFTS its drawn ankle by `ANKLE_X · sin(phi)` — 0.099 u of float at the 0.37 rad the two feet would
otherwise need, which is the shoes riding a hand's width over the deck. `boardLeg`'s parameter list had
been written with the hip offset **missing** while all three call sites passed it, so every argument
behind the gap shifted (`yaw` took 0, `x` took the yaw, …) and the roll came out at **-1.706 rad** —
both legs thrown sideways to hang at rig `z` -0.76 with the shoes off the deck. With `hx` restored the
solve lands the ankle targets (0.04, 0.225, 0.200) / (-0.05, 0.225, -0.190) exactly, feet flat, toes
±20°/15° off the cross-line. `BOARD.hipY` is **0.905** — a **48-degree** knee, measured through the same
`legIK` (hip-to-ankle 0.705 rig against the links' 0.775) — where the block was first written at 0.735,
a **93-degree sitting squat** that read as a man crouching ON the board (seen in the skeleton render:
the shins 21° off vertical with the shoes under the pelvis). The derived heights were retuned as a SET
(`pushHip` 0.79 / `popHip` 0.75 / `airHip` 0.95 / `missHip` 0.72), and the trunk/head shares follow the
measurement — the chest ends **38° off the line** and `headYaw` 0.45 leaves the head **~4° off it** (it
was -0.34, which turned the head *away* from the line: 64° off, the wrong side of the body's own twist).
`boardHipX` reads the hip joint's offset off the bones rather than assuming it, because a rig that ever
moves a hip joint must move the solve with it.

**Three shapes, one stance.** `poseRide` is the ride itself (the carve's lean, the manual's nose-lift,
the push, the trick's tuck and the bail), `poseBSlide` is the powerslide (a deep braced crouch with the
trailing hand reaching back at the deck — nothing like the on-foot slide's knee-and-palm skid) and
`poseBBomb` is the bomb (prone over the deck, knees folded under, arms swept back). All three are worn
OVER the stance and solved through `boardLeg`, so a change to the stance moves every shape with it.

**The FX and the sound.** The board's world-space FX are one arm of `main.js`'s event drain, and every
one of them is raised on the **WHEEL LINE** (`player.pos.y - P.HY`) so the marks land on the surface
the board is on rather than on the body over it: the mount's scuff, the push's `scuff` thrown BACK
along the line (the foot holds still while the deck runs away from it), the pop's `liftOff`, the
catch's `landDust` + shake, the bail's streak, the powerslide's first `sparkCone` burst plus a per-frame
spray (~50 ms) sized by `|bslideAngle| / P.BSLIDE_ANG` — the mechanic and the picture are the same
number — and the bomb's opening lift-off. `audio.js` gained the board's voices, and the RULE for all of
them is material: the DECK is wood (a short dry mid-band knock, 240-500 Hz, almost no tail), the WHEELS
are hard urethane on grit (a thin, high, very short 2.4-3.6 k band, so it reads as ROLLING rather than
sliding), and there are FOUR CONTACTS, not one — which is why a board landing is a scatter of small
knocks instead of the single thud `land` makes for two feet. `boardGrind(k)` is fed every frame the deck
is sideways and is deliberately the *same level ramp* the sparks are sized from, so the ear and the eye
cannot disagree about how hard the slide is biting. Nothing on the board is loud: it is a light object
and the whole point of it is that the rider is standing on a thing CARRIED by its wheels.

**Verified on the live page (session 200):** `E` on/off (grounded-only), the push building 2.95 → 7.92
u/s over 2 s with the cadence cycling, `M2` manual (0 → 1 → 0), `M1`'s trick cycle throwing at 12 u/s
and landing at 9.87 keeping the ride, `SPACE` from a standstill keeping the board, `SHIFT` entering
`bslide` (deck angled ~34°) with the per-frame spray + `boardGrind` live, `F`'s bomb (drive growing
13.9 → 14.8, landing on `BBOMB_LAND_KEEP` 0.92), and `E` dismounting — all with a clean console. The
stance was checked against the SKELETON render (the character's mesh is a faceless blob, so pose work is
verified numerically and with the skeleton viewer, never by eye).

### THE SLOPE (hills)

`readSlope` samples the gradient under the feet each frame; `slopeGate` spends it on what the body
may climb (bought with momentum via `slopeCarry`), `slopePull` on what the deck does when it may
not, `deckGrip` gives the standing surface kinetic friction past the hold angle, and `tiltG` lies
the rig over onto the deck's normal (pivoting about the FEET). A ground stick keeps a downward
slide attached. **A jump is measured from the deck** — both the ground jump and the double jump add
`max(0, vel·∇terrain)`.

### THE SKATEPARK (session 206)

A fourth world (`settings.world === "park"`), and a generator of its own. The brief was *"make me a
new skateboard map and exaggrate it and make it with slopes and all kinds of stuff"*, and the whole
world is three functions.

**THE GROUND IS A LATTICE OF PLAZAS.** `PARK.pad` 64 apart there is a dead-flat DECK
(`parkDeck(u, v)`) whose height is `fbm2` over the lattice rounded to whole risers (`PARK.lift` 12,
`PARK.levels` 3 → ±36 u), and between any two decks the ground is `parkLattice` — a bilinear blend
whose two axes are put through `parkBlend`, an S-curve that holds `PARK.face` 0.54 of the cell flat
at each end and puts the whole height change in the middle. Everything follows from that one shape:
plazas you can stand and build on, ramps that start and end level (nothing kinks at the foot),
hips where three decks meet, and a grade that is the same whatever the two decks are. Measured on
the drawn field: **31 / 51 / 61 / 68°** for rises of one to four risers over the 29.4-unit run,
**44 %** of neighbouring pairs dead level, relief **−25.9 → +35.7 u**. The deck field's own
frequency (0.40 of a lattice point) is what makes it a park rather than a hill — at the first cut
(0.17) 66 % of neighbouring decks were the same height and the steepest ramp in the map was 40°.
`parkFall` still holds the camp's disc dead flat at y = 0 (`PARK.core` 44, the same one the hills
keeps level) because every authored thing about the spawn is built at 0.

**FIVE SET PIECES**, authored in `PARK_FEATURES` rather than rolled, because a lattice alone is
banks and hips and a park needs landmarks: the round **BOWL** (rx 27, depth 14 → 46° walls, rim
dead level to `min = max = −12.00`), the long **PIPE** pool (62 × 20, depth 16 → 58° lips), the
**SPINE**, the one built UP instead of dug in (`h · (1 − q)²` → two quarter-pipes back to back,
43 × 11 × 20, **75°** at the crest), the **DEEP END** (a second bowl, rx 20 / depth 18 → **61°**,
rim dead level) and the **VOLCANO** (session 207), the only piece that is a dig AND a build-up: a
dome (`h·(1 − q²)`, 41° at the foot and flattening as it climbs, so it is runnable all the way
over) with `crater` 0.40 of its radius cut back out by `depth·(1 − (q/crater)²)` — a 12.6-unit ring
of mound around a 3-unit pit whose walls measure tan 2.23, **66°**. `parkBase` flattens the lattice
to the piece's own plaza level all the way across it and out to `PARK.apron` 22 (measured on the
SHORT axis, so a long pool gets a long flat run-up at each end), then applies the piece's own
displacement — pools `−depth·(1 − q²)`, the spine `h·(1 − |qz|)²·(1 − qx²)` so its ends run out
rather than stop, the volcano both at once. The spine was narrowed from rz 15 to **11**: at 15 its
cross-section read as a rounded dome, at 11 as a spine (`−12 → −0.75 → +8 → −0.75 → −12`). The bowl,
the pipe and the deep end get a dashed `noCol` coping ring around the rim — the park's landmark from
a distance, and the lip you pop off.

**AND ALL KINDS OF STUFF — SEVENTEEN OF IT.** The props are park/ledge/rail/stairs vocabulary:
the flat **RAIL**, the **LEDGE** and **HUBBA** (a ledge with a coping), the **FUNBOX**, the
**PYRAMID**, the **STAIR SET**, the **BLOCK**, and — since session 207 — the **KICKER** and **BANK**
(the one thing a deck cannot get from the terrain is a launch: stacked boxes whose drawn top is a
0.14–0.21 staircase, every rise under the board's own wheel `P.BOARD_R` 0.42, each with a painted
lip), the **HUMP**, the **MANUAL** pad, the **BARRIER**, and the street furniture a plaza is full of
— **KERB** (three parking blocks in a row), **PLANTER**, **BENCH**, **CONE**, **CAN**. All ≤ 6.4 u
wide so one fits an 8-unit cell, planted at most one per cell — and ONLY where the DRAWN ground
bends less than 0.22 across the prop's own footprint. That test is the whole placement rule: there
is no list of "where the plazas are" to keep in step with the height field, because the ground the
body rides and the ground a prop stands on are the same function. `pickParkProp` draws them by
weight (a prop's `w`, 1 unless it says otherwise), because a uniform draw from seventeen makes a
cone exactly as likely as a six-unit hubba, and the plant chance is 0.72 of the flat cells. One
thing overrides the flatness rule — the RUN-UP. A set piece's apron is flat, so furniture lands on
it by default, and measured with a prop in that lane a **14 u/s** run at the spine **stopped dead
45 units short** of the ridge: a landmark you cannot roll at is not a landmark. So no prop may stand
inside the apron region OR inside a capsule of `PARK.lane` 46 around the piece's rim (radius = the
short axis, so a pool gets a ring and a ridge a wide berth across its own flip line). Verified
after: 0 props in the spine's lane and the run reaches the ridge foot. The furniture density (session
207): **334** boxes in a 112-unit window, and 91 in a 44-unit window on a busy deck.

**The paint** (`parkGroundColor`) is read off the same two numbers the height is built from, so a
band of paint can never land where a ramp is not: pale concrete on the decks (each with its own
shade off the pad's hash), striped colour bands across a transition, a dark JOINT line where the
ramp meets the deck, a teal liner in a pool (`0.6 + 0.4·(1 − smooth01(q²))` — full on the floor of
the pool, 0.6 at the coping — so the deepest water is the colour you cannot see the concrete
through; session 206 had this ramp INVERTED, pale floor and a dark ring at the lip, against its own
comment), and rust stone over the volcano, darkening to near-black in its crater.

**Riding it (measured on the live page).** The board rolls a 36-u ramp from **6 → 27.6 u/s** and
reaches **30.9** on the next drop; a body standing on a 51° face and holding uphill is refused and
**slides 12.4 u back down** (every ramp in the park is past `SLOPE_HOLD_TAN` on purpose — the park
is a board map and a walk is not a run); carrying **14 u/s** at the spine climbs **10.2** of its 20
units and rolls back down, so clearing it is a real run-up (~47 u/s) rather than a keypress. **59–60
fps** at the shipping internal resolution, the same as the other worlds.

**More stuff (session 207).** The user's *"add more stuff to the skate board map"*, and the
measuring that came with it found three real bugs. The props went 7 → **17** (two ramps, a hump, a
manual pad, a barrier and five kinds of street furniture — see above) and the landmarks 3 → **5**
(the deep end and the volcano), and reading the pieces back off the live chunk list proved: the pool
liner had been **inverted** since session 206 (`1 − smooth01(1 − q²)` — pale floor, dark ring at the
coping, the exact opposite of the comment above it); the `stairs` prop's landing was a **negative
box** (depth `3.2 − 5·1.18` = −2.7 — a box whose far face is behind its near one, which the occluder
grid reads as a hole); and the volcano's first cut threw a `ReferenceError: q is not defined` out of
`parkGroundColor` on every ground build, which the live console caught before it shipped. After the
fixes: **0** boxes with a non-positive extent across **2,467** sampled from seven regions, the camp
still exactly flat, relief **−25.9 → +35.7 u**, furniture **334 boxes / 112 u** and **58.8–60.8
fps**. Visual pass: the volcano (mound, rust ring, dark crater), the deep end, a bank and a kicker
read back box-by-box, and an aerial of the furnished plazas.

### Combat

`M1` is one button with four jobs (wall kick / macaco / melee chain / clash). The chain's timings
live in `COMBAT_MOVES` (`streetwear.js`) and are read back off the rig — never move a timing into
`P`. A press is a **queue**, not a cancel; M1 is not holdable; a jump only cuts the SWEEP. The
chain **carries momentum** and the body it hits spends it. Hitstop on landed strikes. Every landed
blow goes through `Effects.impact` (one function, a strike line, a flare/glow/bar/rings/sparks).

### The three skills, the block, the grab, the staff, the wall clinch

All documented in their code sections; the load-bearing points are:
- Skills lock the run and aim with the camera (1 aims itself).
- The dive's arrival opens the air combo, which drops the world into **bullet time** (world step
  scaled; the body's own step and his fall are handled separately).
- The block is one state with two shapes picked by arrival speed; the charge cannot corner.
- The grab is a **standing** move; the hands are solved onto a live point on the other rig.
- The staff's **shaft is the hitbox**; the take-point is authored as a clearance, not a coordinate.
- The staff is **carried level** in a straight arm (`POLE_CARRY`): `pitch` 1.34 = 13° above horizontal,
  `hf` 0.50 = grip at the MIDDLE, `gy` 0.83 = a thigh-height take-point that straightens the arm to a
  measured 94 % reach; `POLE_CARRY_LIFT` is 0.
- The double jump with a staff is a **one-shot front-flip vault** (`polevlt`), not the old Shaolin hang:
  the staff holds its WORLD aim while the body flips under it (`o.pitch = aim − flip`, one reading
  through `poleFlipAngle`), its tip is driven into the deck on `POLE_VAULT_HIT`, and that beat fires the
  launch and snaps the staff. The plain double jump's own flip is the −2π backflip and is not reused.
- The shaft has a **spine** (`pole.js`): it bends along an arc (`bendShaft`) driven by the tip's velocity
  **relative to the butt**, so a sprint is straight and only a swing whips — through an underdamped
  spring, so a hard swing rings once and settles.
- The wall clinch is a placement + a camera frame, with the shot held by the MOVE FRAME.

### The HUD dial

Three canvas bands (green health core, red skill pills, cyan ultimate ring) + DOM rank letters
(filled from the bottom) + the purple air diamond. One CSS variable sizes it. The dial's bands,
the economy (rank → ult charge → overdrive → no cooldowns) and the flash/wiring traps are in
`hud.js` and `abilities.js`. The three skill buttons' pictures are **screenshots of the real rig**
(`icons.js`), and in the editor they **re-bake themselves off the live rig a beat after the first
play** — see the icon notes at the top of `icons.js` and the `autoBakeIconsForEditor` call in `main.js`.

### THE MIX AND THE PHONE (the two rows the options card grew in session 169)

The options card is `optionItems()` in `main.js` rendered by `renderOptions()` in `hud.js` — a plain
list of rows (`section`, `note`, `slider`, `swatches`, `presets`, and `data-act` rows), one delegated
listener on `#optScroll`, one `applyOption`/`applySlider` per action, and the whole lot persisted in
`localStorage["baseplate.options.v1"]`. The two rows added here follow that machinery exactly:

- **AUDIO → VOLUME.** A slider, 0–100 in steps of 5, read out as `40 %` (and `MUTE` at zero). It
  writes `settings.volume` (0..1) and calls `Sfx.setVolume`, which scales the master gain by the
  constant the mix is authored at (`GAIN = 0.42`, the old hard-coded value) — so 100 % is exactly the
  old mix and every other level is the same mix quieter. The level lives on the `Sfx` instance as
  well as in the option, because a slider dragged before the first sound still has to land: the
  AudioContext does not exist until the first PLAY (browsers refuse to start one before a gesture),
  and `init` is where the remembered level is finally applied.
- **TOUCH → MOBILE UI.** The phone layer has **two gates**, and this row is the second one:
  `isTouch` (main.js) is the DEVICE — nothing binds or draws without a touchscreen — and
  `settings.touchUI` is the PLAYER. `touchUIOn()` is the pair, and `applyTouchUI()` is the only
  writer: it hides `#touch` and moves the `touchMode` class (the phone layout — bigger HUD buttons,
  card widths, the places the pads make room) as one thing. Everything that used to ask the device
  now asks `touchUIOn()` instead: the start card's wording, the prompt re-cut, the pointer-lock and
  pause calls, and the crouch/slide hints — so turning it off really does hand the machine back to
  the mouse and the keyboard. It exists because a touch-capable machine is not always a phone: a
  laptop with a touchscreen boots with the pads over the game. On a machine with no touchscreen the
  row reads `N/A` and the press says so (the FULLSCREEN row's own precedent). `setQuality`'s default
  and the touch BINDING still read `isTouch` — a phone that turns the pads off keeps the cheaper
  render settings, and the pads come back live the moment the option does.

Both are in `DEFAULTS`, both are restored by RESET DEFAULTS, and both are pushed to their live
owners at the end of `loadOptions` (the audio node's level and the layer's visibility are the two
settings that are not read out of `settings` at the moment they are used).

## THE FRONT-CUT BUG (the platform's `index.html` truncation, and the shell that survives it)

The platform's editor occasionally hands the page an `index.html` that has **lost a run of whole leading
LINES** — a strict SUFFIX of the real file, the cut landing mid-comment immediately after a newline. It
is a bug in the platform's save/store path (reported; see "Notes for future edits"), it has happened
**seven times**, and the amounts have varied: **501, 622** (four times), **796, 917, 1,377, 4,844, 5,412**
characters. Session 203 read the STORE's own copy with `fetch_generator("adapt-")` and got **exactly
`good.slice(501)`** — proof that a save can PERSIST the loss, not just display it, and therefore that
teaching the page to repair the damage was never going to be the end of it.

It was fatal by itself. The file used to begin with `<div id="game">` and `<canvas id="view">`, so
`getElementById("view")` was `null` and `createPS1Renderer` threw before a single frame — *"THIS ERROR
KEEPS HAPPENING EVERY TIME I SAVE OR REFRESH"*, in the user's words.

**The answer is that there is nothing up there left to lose.** `index.html` was 242,641 characters: the
whole DOM in the first 39,515, then ONE 203,004-char `<style>` (with two base64 faces inside it, one of
them an 88,401-char single line), then the module tags. It is now a **ten-line shell** — an empty
`#game`, a `<link>` to `src/game.css`, and the module tags. The markup lives in `src/gameui.js` as
`GAME_MARKUP`, extracted **VERBATIM** (it is static HTML — verified: no square brackets in it, so no pjs
was moved into a string), and the stylesheet in `src/game.css`, likewise verbatim. Neither is a `src/`
file the bug has ever touched.

**And the shell puts itself back.** `src/gameui.js` is `main.js`'s FIRST import, so it runs before any
module that caches a DOM reference, and `bootUI()` is idempotent:

- **On a healthy page it returns immediately** — the first line tests for `#view`. Nothing about the
  normal path changed.
- Otherwise it **harvests every element that survived the cut by id**, builds the fresh tree from
  `GAME_MARKUP`, and **puts the survivors back in their own places — live nodes win**, so nothing that
  survived is thrown away and nothing is duplicated. `#game` keeps its OWN element when it survived,
  which matters: `tagtext.js` watches that element with a `MutationObserver` and re-tags whatever
  appears inside it.
- It re-links `src/game.css` if the cut took the `<link>` — and the link's `load` handler pokes the
  game's resize path, so a stylesheet that arrives after the renderer measured the canvas cannot leave
  the viewport at the fallback size.
- It re-asserts the `<meta name="viewport">` in `<head>` if a host lacks one. **The body no longer
  carries one** (session 202): it was the first thing in the file, therefore the first thing the cut ate,
  and it was redundant — the engine already puts one in `<head>` (`width=device-width,
  initial-scale=1`, verified on the live page).
- And it sweeps the DEBRIS the cut leaves flat in the body — the run of words where the middle of a
  comment used to be, and any surviving wrapper with no id — into `#game`, behind the canvas, where the
  fixed full-screen container hides it. Then the orphaned text goes for real, because a line of prose
  across a full-screen container is not nothing.

**Verified how:** by writing each deliberately damaged `index.html` and loading it — the shell with its
comment dropped, with `#game` dropped, with `#game` **and** the `<link>` dropped, with `main.js`'s first
tag dropped, and **50 characters long (only the tail's `main.js` tag left)** — plus the two transition
cases, the full 242,641-char file (healthy: `bootUI` no-ops) and **`good.slice(501)`**, the exact copy the
store held. **All eight boot:** the renderer on the `#view` canvas, every id present **exactly once**,
`document.styleSheets` non-empty, `#game`'s computed background `rgb(10, 12, 17)` (i.e. `game.css` really
arrived) and the canvas rect equal to `innerWidth`×`innerHeight`. The shell was also A/B'd against the old
242,641-char file on a healthy load: **pixel-identical** (`scratch/shots/s203-a-oldhealth.png` against
`s203-shell2.png`).

**What is still not covered:** a cut that takes the LAST line — `main.js`'s tag. Nothing can load then and
nothing in the page could repair it, which is why that tag is **duplicated at the tail**: the module map
makes the second one a no-op on a healthy page, and it is the one a front-cut cannot reach. Nothing else
in the shell is load-bearing.

## Notes for future edits

- **IF THE GAME DIES AT BOOT WITH `Cannot read properties of null (reading 'width')` AT
  `createPS1Renderer`, `index.html` HAS LOST ITS HEAD — WHICH SINCE SESSION 203 IT CAN NO LONGER DO
  FATALLY, BUT IT IS STILL A PLATFORM BUG AND STILL WORTH REPORTING.** This has happened **seven times**
  and it is a bug in the platform's editor save/store path, not anything in the game. The symptom is
  exact: `index.html` comes back as a **strict SUFFIX** of the real file with a run of whole leading LINES
  deleted, the cut landing mid-comment immediately after a newline. Amounts seen: **501, 622** (four
  times), **796, 917, 1,377, 4,844, 5,412** characters. It reaches the **stored (published) copy too**:
  session 203 read the saved generator with `fetch_generator("adapt-")` and got exactly
  `good.slice(501)`.
  - **WHY IT CANNOT KILL THE GAME ANY MORE (session 203).** `index.html` is a **ten-line shell** (an empty
    `#game`, a `<link>` to `src/game.css`, the module tags) and `src/gameui.js` — `main.js`'s FIRST
    import — rebuilds the whole body from `GAME_MARKUP` whenever `#view` is missing, adopting every
    element the cut left alive into its own place. `src/game.css` is re-linked by the same routine. So a
    damaged save is a survivable state, **verified against eight deliberately damaged copies, one of them
    50 characters long**.
  - **CHECK:** `index.html` should be **10 lines / 713 bytes**, start with `<!-- ADAPT — THE SHELL.` and
    contain `<div id="game"></div>`. If instead it is a 242 KB suffix of the old file, the editor is
    sending a pre-203 copy: **re-writing `index.html` (read it, write it back unchanged) and then
    refreshing is the habit that stops a push delivering a stale, short copy.**
  - **THE OLD 242 KB FILE IS WHAT THE PUBLIC PAGE STILL SERVES until the next save, and it is fine** —
    `gameui.js` boots that too (it is the "healthy, `bootUI` no-ops" case, and the `good.slice(501)` case).
    A byte-exact copy of it is at **`https://user.uploads.dev/file/609d00e434d20fd93a7f15194d3a906f.txt`**
    (`fetch_url` it into `scratch/` if the OLD file is ever needed for comparison) — but **do NOT restore
    it into `index.html`**: the shell is the point.
  - **AND DO NOT PUT ANYTHING LOAD-BEARING AT THE TOP OF `index.html` AGAIN.** The bug eats a prefix. Only
    the last line (the duplicated `main.js` tag) is meant to matter, and the module map makes that
    duplicate a no-op on a healthy page.
- **A POSE LAYER HAS TO ASK WHAT THE LAYER UNDERNEATH OWNS (session 183).** The same bug has been
  fixed twice, in two features: an action layer writing an ABSOLUTE value into a channel the base
  layer is animating continuously. Session 180: `poseCarry` wrote the torso, and the run authors a
  0.68 lean, so carrying the ball swapped the whole run cycle out for an upright walk. Session 183:
  the throw's trunk fold would have done exactly the same thing to a sprinting thrower. Session 184
  was the third: `poseTote` wrote the torso, the hips and the head absolutely, so carrying the duffel
  in both arms stood the run's lean up — and, worse, it did not write the arms' TWIST, which the IDLE
  authors at ±0.45 and the RUN at 0, so the same hold measured a different hand separation standing
  and sprinting. **A channel two base layers disagree about has to be written by the layer that
  straddles them** (`poseTote` now writes the twist for both sides explicitly). The rule: a
  channel the body animates on its own (the trunk's fold, the head, the legs) gets an **ADDITIVE**
  write — `poseAdd(bones, name, axis, delta, e)`, which is `poseRot`'s opposite number and is scaled
  by `POSEX` and the layer's own weight — while a channel only this feature owns (the ball arm, which
  the carry is holding; the trunk's twist during the throw's coil) may be absolute (`poseRot`). Read
  the `THROW` table's own comment in `streetwear.js` before touching it: its numbers are DELTAS for
  the additive channels and ABSOLUTES for the rest.
- **RENDERING IS OFF WHILE `manual` IS SET, SO A HARNESS THAT MOVES THE CAMERA MUST RENDER ITSELF.**
  `loop` returns above `frame`/`pres.render` when `manual` is on (it is how `GAME.step` drives a clean,
  unslowed frame), so a `page_eval` harness that repositions `GAME.camera` and then captures with
  `snapshot.js` gets the LAST frame the loop drew — which is why a moved camera appears to have no
  effect. Call `GAME.pres.render(GAME.scene, GAME.camera, GAME.post)` after moving it; `scratch/
  throw-side.js` (recreated from this README's recipe, not shipped) is the worked example — it builds
  the flank view off `player.facing` (forward is `(sin, 0, cos)`, so the side axis is
  `(cos, 0, −sin)`), sets `camY`/`aimY`/`dist` from globals, and hides `#hud` for a clean frame. A
  chase camera looks at a thrower's BACK: any pose work that happens along the body's forward/side
  axis has to be judged from the flank.

- **`player.js` IS BEING SPLIT UP, ONE PIECE AT A TIME.** (session 180) It had grown to ~16k lines
  and it is the file most edits touch, so cohesive chunks are being moved into `src/player/`.
  **Part 1:** the constants and the whole `P` table now live in `player/config.js` (a leaf — no imports,
  nothing defined later), and `player.js` does `import { P, CHAR_SCALE } from "./player/config.js"` and
  `export { P }`. The several modules that read `import { P } from "./player.js"` (abilities, camera,
  enemies, inventory, main) keep working through that re-export — if you touch one, you may point it at
  `./player/config.js` directly. **Part 2:** the staff moved to `player/pole.js` — the pole scratch,
  `composePole`, `shaftGap` and the 19 pole methods, which are attached to `Player.prototype` by
  `installPole(Player)` (called once at the end of `player.js`). It imports `TAU`/`approach` from the new
  `player/math.js` leaf rather than from `player.js`, so there is no cycle; `player.js` imports back the
  scratch and `composePole` that its `updateVisual` still reads. **Part 3:** the grab moved to
  `player/grab.js` — its 15 methods and the `_grab*` scratch, installed by `installGrab(Player)`; `wrapPi`
  went into `player/math.js` for it. **Part 4:** the M1 chain and the clash moved to `player/combat.js`
  (11 methods, `attackMoveSpec` → `endClash`), with the `_clashV`/`_clashW` scratch. Two notes from
  these parts: the **scratch vectors are declared up in the shared constants cluster, not next to the
  methods**, so each extraction has to pull them out of there too (and a shared one must be re-imported
  back — check the `alsoOutside` list, but beware it counts the declaration line itself); and each
  extracted method table is the old class bodies verbatim wrapped in an object literal (`Object.assign`
  onto the prototype), installed once at the END of `player.js`. **Part 5:** the skills moved to
  `player/skills.js` (35 methods + the scissor key-table readers + the skills scratch); the shared pure
  helpers `smooth01`/`swingTowards` went to `player/math.js` and `RUN_STRIDE` to `player/config.js` for
  it. **Part 6:** THE WALL CLINCH moved to `player/wallbeat.js` (16 methods, `onWallContact`/`wallProbe`
  through `endWallBeat`, plus the `_wallHeadV`/`_wallGutV` scratch — both vectors moved with the move and
  nothing outside it read them, so there is no re-import). `player.js` is down to ~9.0k lines.
  **Part 7:** the UNWIRED RUNNING LUNGE moved to `player/lunge.js` (6 methods, `startLunge`/`lungePick`/
  `lungeTakeNow`/`lungeHoldBody`/`lungeRelease`/`updateLunge`); it needed only `P` and `TAU` — no scratch
  and no three.js. It is STILL unwired (nothing calls `startLunge`; bring it back through `grab`), so it
  is driven directly to test. `player.js` is down to ~8.5k lines.
  **Part 8:** the three COMMITTED MOVES' CONTACTS moved to `player/contacts.js` (7 methods: the slide's
  `slideContact` + wake, the dive's `diveUp`/`diveContact`, the front dash/boxcutter's `dashContact`/
  `boxcutterBeats`/`tickDashPose`/`dashKickLands`); like the lunge it needed only `P`. The guard/block
  family (`startBlock`/`blockCatch`/`blockContact`) was left in place — it is its own feature. `player.js`
  is down to ~8.1k lines.
  **Part 9:** THE RUNNING VAULT moved to `player/vault.js` (4 methods: `vaultPickKind`/`vaultTarget`/
  `vaultSlab`/`startVault`), and it took `VAULT_KIND`/`VAULT_TURN_APEX` with it — a nice case of the
  "shared constant" rule in reverse: neither is read outside the vault (the one `updateVisual` line that
  names `VAULT_KIND` is a comment), so there was no re-import. `vaultLift` + `VAULT_RISE`/`VAULT_DROP`
  stay in `player.js` (both `update` and `updateVisual` still call `vaultLift`). `player.js` is down to
  ~7.9k lines.
  **Part 10:** THE WALL RUN AND THE WALL KICK moved to `player/wallrun.js` (4 methods:
  `tryWallRun`/`endWallRun`/`findKickWall`/`tryWallKick`), and `nextKickVariant` went with them — only
  the wall kick used it. Its sibling `nextJumpVariant` stayed in `player.js` (the jump code in `update`
  still calls it three times). `player.js` is down to ~7.65k lines.
  **Part 11:** THE LEDGE AND THE MANTLE moved to `player/ledge.js` (6 methods: `mantleTarget`/`ledgeTarget`/
  `ledgeFind`/`gripLocal`/`startMantle`/`startLedge`). The only wrinkle was that the source was NOT one
  contiguous block — the read + grip solve sat between the squeeze and the launch pad, and the two state
  entries came after the pad's own methods — so the extraction removed two ranges into one file. Still
  only `P` + `approach`, no scratch. `player.js` is down to ~7.46k lines.
  **Part 12:** THE BODY AGAINST THE WORLD moved to `player/physics.js` (13 methods: `overlaps`,
  `senseWalls`, `pickWall`, `wallJumpNormal`, `spaceFree`, `readSlope`/`slopeGate`/`slopePull`,
  `deckGrip`, `updateBox`/`fitScale`/`squeezeAt`/`updateSqueeze`), together with the three MOTION helpers
  `accelerate`/`applyFriction`/`bleedSpeed`, which it re-exports because `update` still calls them.
  **Two lessons for the next part:** (a) a module that needs a module-scope FUNCTION from `player.js`
  must own it and re-export it (there is no import back into player.js) — the `pole.js` scratch pattern;
  (b) an ACCESSOR (`get hx()` / `get hz()`) must NOT go in the `Object.assign` table — the assign READS
  the getter and copies the value — so the box getters deliberately stayed on the class (there are other
  getters later: `get airComboOpen`, `get hx()`, `get hz()`). `player.js` is down to ~6.99k lines.
  **Part 13:** THE COLLISION CORE moved to `player/move.js` (`tryStep` / `moveAxis` / `moveAndCollide`)
  plus the `EPS` separation constant. Those three are what `player/physics.js`'s reads are FOR, and they
  call back into `this.overlaps` / `this.hx` / `this.hz` by name, so the two modules need no link.
  `player.js` is down to ~6.90k lines.
  **Part 14:** THE LAUNCH PAD moved to `player/launch.js` (`solveLaunchArc` / `startLaunch`) *and* it took
  the arc SEARCH `launchArc` with it, because `launchArc` is a free function shared with `Enemy.padLaunch`
  in enemies.js — there is no import back into `player.js`, so the module OWNS it and `player.js`'
  `export { P, launchArc }` now re-exports the imported binding. `player.js` is down to ~6.79k lines.
  **Part 15:** THE BLOCK (the M1 + M2 guard chord) moved to `player/block.js` — `chordLive`, `startBlock`,
  `blockCatch`, `blockContact`. No module-scope scratch (everything it touches is `P` + the body's own
  fields/methods), so `installBlock(Player)` is all the wiring. `player.js` is down to ~6.62k lines.
  **Part 16:** THE MACACO (the slide's own M1) moved to `player/macaco.js` — `canMacaco`, `startMacaco`,
  `updateMacaco`. It imports `approach` from `./math.js`; no module-scope scratch.
  `player.js` is down to ~6.53k lines.
  **Part 17:** HEALTH, THE ULTIMATE, AND THE THREE SKILLS moved to `player/health.js` — `damage`, `down`,
  `canSkill`, `armored`, `invuln`, `overdrive`, `dmgMul`, `dropBlast` (the section's banner came with them).
  No module-scope scratch; `down()` still reaches `releaseCapoCarry` on the prototype (skills.js).
  `player.js` is down to ~6.30k lines.
  **Part 18:** THE COMMITTED MOVES' ENTRIES moved to `player/commit.js` — the five state entries
  (`startHammer` / `startDive` / `startSlam` / `startSlide` / `startDash`) plus the dash's rig readers
  (`qdashTime` / `backdashBeats`) and `hammerTotal`. `hammerTotal` is owned by the new module and re-exported
  (the same pattern as physics.js's motion helpers) because `update` and `updateVisual` still call it —
  remember to `export` it, not just `function` it, or the import fails at load.
  `player.js` is down to ~6.11k lines.
  **Part 19:** THE CHAIN'S CROSS-FADE moved to `player/chainfade.js` — `chainRig`, `chainSnapshot`,
  `chainBlend`. A true leaf module (imports nothing; it only needs the body's own `inner`/`_chain*` fields).
  `player.js` is down to ~6.06k lines.
  **Part 20:** the two giants have started to come apart. THE CLOCKS AND THE BUFFERS moved to
  `player/clocks.js` as `tickClocks(dt, grounded, inp)` — a straight lift of the block at the top of
  `update` that ticks every cooldown/window/tally/buffer/regen before the state machine (the source
  segment declared no locals of its own and needed only `grounded` + `inp`, which is what made it
  safe). `update` calls it back in the same position. **This is a different kind of part:** the others
  moved whole methods verbatim; this one carves a contiguous slice out of a method's body and calls
  it. The rules for the giants: pick a run of statements that (a) declares no local that later code
  reads, (b) reads only `this.*` plus a couple of `update` locals you hand in as parameters, and
  (c) has no early `return`; then call it back at the exact same point so the frame's write order is
  untouched. `player.js` is down to ~5.92k lines.
  **Part 21:** THE PER-FRAME TRANSIENT RESET moved to `player/transients.js` as `resetTransients(dt)` —
  the second slice carved out of `update`: it clears last frame's climb flags and the wall-run latch
  right before the wish is read. Reads only `dt` (needs no handed-in locals) and writes only `this.*`,
  so it was a clean lift; `update` calls it back in place. `player.js` is down to ~5.88k lines.
  **Part 22:** a BATCH — THE SMALL CORE METHODS moved to `player/core.js` (`loadCharacter` / `hasCharacter` /
  `airComboGravity` / `setState` / `moveTarget` / `lockMoveMul`). Batching is fine here and only here:
  these are whole self-contained methods (verbatim relocation, no slice surgery), and each one was
  verified in a single refresh. The two ranges were non-contiguous (`get airComboOpen` sits between
  them and MUST stay on the class — a getter assigned through `Object.assign` copies its value once).
  `player.js` is down to ~5.76k lines.
  **Part 23:** THE FALL moved to `player/fall.js` — the pure fall math `impactFromDrop` / `fallWeights` /
  `pickFallKind`. These are plain top-level FUNCTIONS, not `Player` methods, so the module has exports and
  NO `install*`; `player.js` imports all three back. Lesson repeated: a moved top-level function must be
  written `export function`, or the import dies at load (the same slip as part 18's `hammerTotal`).
  `player.js` is down to ~5.69k lines.
  **Part 24:** the LAST of the module-scope helpers left `player.js`, each homed in its feature module
  (so there is no grab-bag "helpers" file): `vaultLift` + `VAULT_RISE`/`VAULT_DROP` → `player/vault.js`;
  `hammerHop` / `hammerAirAt` / `hammerBeat` → `player/commit.js` (with `startHammer`/`hammerTotal`);
  `wallRunFrame` + its `_wf*` scratch and `nextJumpVariant` → `player/wallrun.js` (which now imports THREE).
  The `_wf*` scratch moved because a grep showed nothing outside `wallRunFrame` read it. What is left in
  `player.js` above the class was then just the pose fades + scratch. `player.js` was down to ~5.56k lines.
  **Part 25:** THE POSE FADES AND THE POSE SCRATCH moved to `player/pose.js` — the 45 module-scope `const`s
  that were the last thing above the class: every pose cross-fade duration (run cycle, idle, crouch, air,
  dive, slam, dash, mantle, tote, ball, vault, ledge, wall, launch, bank, fall, land, hammer, guard, skill),
  the idle's per-boot deck-sampling clamps + `IDLE_FOOT_TMP`, the falling flurry's `SMASH_PLUNGE_V`, the
  dive's lean pair, and the tilt / clinch / capo scratch vectors. A leaf (THREE only), exported wholesale,
  so a later slice of `updateVisual` can import exactly the fades it uses. `player.js` is down to ~5.44k lines.
  **Part 26:** THE RESPAWN moved to `player/respawn.js` (the whole method — the `]` reset), and THE PUBLIC
  WIRING moved to `player/wiring.js` (`setEnemies` / `setPoles` / `combatMoves` — the three one-liners the
  rest of the game hooks the body up with). The MELEE-CHAIN banner that used to sit above them went to
  `player/combat.js`, which is the chain's real home. `player.js` is down to ~5.17k lines.
  **Part 27:** THE FRAME GUARD (the NaN / out-of-world safety net, the first thing `update` ran) moved to
  `player/guard.js` as `recoverGuard()`, which returns `true` when it had to put the body back on its spawn
  — so the call site is `if (this.recoverGuard()) return;`. Its inner `return;` became `return true;`.
  `player.js` is down to ~5.15k lines.
  **Part 28:** the two giants are coming apart from the TOP now, slice by slice, each slice a contiguous
  run lifted verbatim and called back at the same position. First: THE CHORD'S OWN CLOCK (the guard's
  TOGGLE) moved to `player/block.js` as `tickGuardChord(dt, inp, grounded)` — it is block code, so it
  went home with the block rather than into a new file. The pattern for a slice: name the host locals it
  reads, hand them in as parameters, and leave the call in the exact same place (a slice that declares a
  local the later code reads is NOT safe to lift this way). `player.js` is down to ~5.12k lines.
  **Part 29:** two more `update` slices, each homed with its feature: THE MACACO'S OWN M1 PRESS READ
  moved to `player/macaco.js` as `tickMacacoEntry(inp)` (the slide's exit press), and THE CHAIN'S AIRTIME
  GRACE moved to `player/combat.js` as `tickChainAir(dt, grounded)` (a jump/knock-off ends the chain unless
  the air-combo window or the finisher's door is open). `player.js` is down to ~5.08k lines.
  **Part 30:** four more `update` slices: THE HAMMER'S DOOR → `player/commit.js` as `tickHammerDoor()`;
  THE LAUNCH PAD → `player/launch.js` as `tickLaunchPad(grounded)` (it reads `this.world.padAt`, which is the
  same object `update` had aliased); THE KICK'S REACH → `player/wallrun.js` as `readKickReach(dt)`; and THE
  DIVE'S TARGET READ → `player/contacts.js` as `readDiveTarget(grounded)`. `player.js` is down to ~5.02k lines.
  **Part 31:** THE HAMMER FLURRY (the whole ~60-line `smash` case: its clock, bounce, turn, flip and the
  impacts it throws into the world) moved to `player/commit.js` as `tickHammer(dt)` — the first slice big enough
  that its comments are INTERLEAVED with its code, so it was lifted verbatim rather than partitioned. Because it
  now lives beside `hammerTotal`/`hammerBeat`/`hammerAirAt`/`hammerHop`, `player.js` no longer imports the last
  three (it still imports `hammerTotal` for `updateVisual`). `player.js` is down to ~4.96k lines.
  **Part 32:** THE BLOCK'S OWN ENTRY → `player/block.js` as `tickBlockEntry(inp, hasWish, wx, wz, dashFree)`
  (it returns `chordHeld`, because the M1 block below it reads that); and THE M1 PRESS split across its two owners: the
  staff's gate → `player/pole.js` as `tryStaffStrike(...)` (hands back whether the staff took the press) and the chain's
  body → `player/combat.js` as `tickChainPress(grounded, inp, speed2D, dashFree, chordHeld, poleStruck)`. A carve that
  DROPPED the block's closing `}` (so the if lost its brace) was the first syntax error of this run — always read
  `page_refresh`'s `syntaxErrors` before testing. `player.js` is down to ~4.83k lines.
  **Part 33:** THE RUNNING VAULT'S entry → `player/vault.js` as `tickVaultEntry(grounded, speed2D)`; THE SKYFALL
  and THE PLUNGE → a new `player/skyfall.js` as `tickSkyfall(...)` / `tickPlunge(...)` (the fall's LIVE bookkeeping,
  kept separate from `fall.js`'s pure math). **A LESSON THAT COST A LIVE ReferenceError:** auditing a slice means
  checking for FREE VARIABLES the host method owned (`hasWish`, `wx`, `wz` here), not just for locals of the slice
  leaking OUT. `tickChainPress` shipped without them and only threw when a dash/slam fell through its M1 fallbacks;
  the fix is the extra parameters above. So: after every carve, grep the moved body for the host's local names and
  hand every one it READS in as a parameter — and drive the branches in the test, not just the common path.
  `player.js` is down to ~4.73k lines.
  **Part 34:** THE WALL ATTACHMENT (the ~190-line Genshin block — the climb's self-sustaining grab, the wall
  run, the wall slide and the wall jump's lockout) moved to a new `player/attach.js` as
  `tickWallAttach(inp, grounded, wx, wz, hasWish)`. It reads no other host local, so one method carries it whole.
  Its locals (`w`, `vn`, `t`, `climbing`, `tall` ...) are all scoped inside nested branches, so nothing leaks out —
  but note that a leak-check by regex over common names like `t`/`w`/`vn` gives FALSE POSITIVES (it matches the
  same name declared again later in `update`), so confirm a real leak by checking the nesting, not just the name.
  `player.js` is down to ~4.55k lines.
  **Part 35:** the per-state `switch` has started to come apart case by case — but note the tiny cases (clash,
  whirl, knee, grab, lunge, scissor, capo, the three pole states, wallbeat) are 4-6 line WRAPPERS around methods that
  were already split out, so they are not worth lifting; the value is in the substantive ones. Moved here: THE DIVE,
  THE SLAM and THE SMASH state bodies -> `player/commit.js` (`tickDiveState` / `tickSlamState` / `tickSmashState`);
  THE LEDGE and THE MANTLE state bodies -> `player/ledge.js` (`tickLedgeState` / `tickMantleState`); THE LAUNCH
  FLIGHT -> `player/launch.js` (`tickLaunchState`); THE VAULT CROSSING -> `player/vault.js` (`tickVaultState`).
  **THE SECOND BIG GOTCHA OF THE RUN:** a carved body can use something the host file had that the target module does
  NOT import — `tickMantleState` used `THREE.Vector3` and `ledge.js` had no THREE import, which threw a live
  ReferenceError in real play. After every carve, check the moved code for every foreign name it reads (THREE, `TAU`,
  `approach`, `LAND_POSE_TIME`, ...) and add the import to the target module. `player.js` is down to ~4.29k lines.
  **Part 36:** the first of the SUBSTANTIVE state bodies left the `switch` — THE GROUND STATE and THE SLIDE STATE
  moved to a new `player/states.js` as `tickGroundState(dt, inp, hasWish, wx, wz)` and `tickSlideState(dt, hasWish,
  wx, wz)`, called back from their own `case` labels (`case "ground": this.tickGroundState(...); break;`). The two
  bodies read only `P`, `wrapPi`, the three motion helpers and the player's own methods, so the module imports
  `./config.js`, `./math.js` and `./physics.js` — the helpers' home is why these bodies went BESIDE them rather than
  into `move.js` (which is the collision core and nothing else). `player.js` is down to ~4.21k lines.
  **Part 37:** THE BLOCK STATE'S own body -> `player/block.js` as `tickBlockState(dt, inp, hasWish, wx, wz)` — the
  guard's footwork (the walk cap + the same steering grip the ground state uses) and the charge's carve (the
  `BLOCK_RUSH_STEER` swing of the heading, the drive along it, the sideways strip). It needs `swingTowards` and
  `accelerate`, which are now imports of `block.js`. `player.js` is down to ~4.11k lines.
  **Part 38:** THE ATTACK STATE'S own body -> `player/combat.js` as `tickAttackState(dt, inp, hasWish, wx, wz)` —
  the down slam's own vertical (its gravity multiplier, its fall ceiling and the drive onto the body it drops on)
  and then the four grounded moves' carry (the `COMBAT_MOVE` floor, the drift, the planted brake, the float). It
  had TWO `break`s — one conditional inside the slam branch — and both became `return`s, which land in exactly the
  same place because the caller `break`s the moment it comes back. `combat.js` gained `approach` and `accelerate`
  imports. `player.js` is down to ~4.05k lines.
  **Part 39:** THE DASH STATE'S own body -> `player/states.js` as `tickDashState(dt, grounded, hasWish, wx, wz, sin,
  cos)`. It is the first body that needs the CAMERA basis (`sin`/`cos`) as well as the wish, because the backdash
  re-aims off the look (`swingTowards(this.dashDirX, this.dashDirZ, sin, cos, P.BACK_STEER, dt)`). Moving it turned
  up a live `approach` that `states.js` was not importing yet — the foreign-name check caught it before the page did.
  `player.js` is down to ~3.92k lines.
  **Part 40:** THE AIR STATE'S own body -> `player/states.js` as `tickAirState(dt, inp, hasWish, wx, wz)` — the
  biggest case in the switch (~300 lines): the wall CLIMB, the WALL RUN, the WALL SLIDE, the PLUNGE, the SKYFALL
  and the plain fall's air control. Verified branch by branch on the live page: a wall slide off a real collider, a
  climb attached off a real face (hold stamped in the air, then climb up / down / kick off), the plunge's terminal
  speed and the skyfall's. Also: `all` the collider lookups that pick a wall for a test must be taken from the
  buffer at the position you will actually stand in — `G.world.chunks` entries are not guaranteed to carry live
  `colliders` (met 54 chunks with 0), while the `pl.colliders` query buffer is always the right local set.
  `player.js` is down to ~3.62k lines.
  **Part 41:** THE JUMP -> a new `player/jump.js` as `tickJump(grounded, speed2D, hasWish, wx, wz)` — the whole
  `// ---- jumping ----` block (~200 lines: the ground jump, the jump out of a move, the wall jump, the double jump
  with its variant picker, and the pole launch). It takes no `dt` and no `inp`, which is unusual for a slice of
  `update` and is the whole reason to check the free-name set rather than assume. A `if` whose CONDITION carries
  interleaved comments moves as one piece — do not try to split "comments first, code after" here, or the
  condition's comments land in the wrong place. `nextJumpVariant` is no longer read by `player.js`, so its import
  there was dropped (grep the file for a name before removing an import). `player.js` is down to ~3.42k lines.
  **Part 42:** THE FRAME'S CONTACTS -> `player/contacts.js` as `tickContacts(dt, preX, preZ)` — the smash's
  deck-gone check and then the four committed moves' contact passes (dive / slide / lunge / charge), lifted from
  the middle of `update`. The caller keeps `preX`/`preZ` (and the `moveAndCollide` line they were taken for) and
  hands them in, so the passes still measure the line the world actually let the body travel. `contacts.js` grew
  an import of `SMASH_PLUNGE_V` from ./pose.js for the smash's gate. `player.js` is down to ~3.38k lines.
  **Part 43:** THE LANDING -> a new `player/landing.js` as `tickLanding(dt, inp, velYBefore, hasWish, wx, wz)` — the
  whole `// ---- landing ----` block (the impact, the landing kind, the brace/pose clock, the jolt and the slam's
  `dropBlast`). `landed` and `const impact` are declared INSIDE it and read nowhere after, so they move with it;
  `velYBefore` is read by it and nowhere after, so it is handed in. Deps are `P`, `impactFromDrop` (./fall.js) and
  `LAND_POSE_TIME` (./pose.js). `player.js` is down to ~3.29k lines.
  **Part 44:** THE FACING -> a new `player/facing.js` as `tickFacing(dt, hasWish, wx, wz, sin, cos)` — the whole
  `// ---- facing / visual ----` chain (the step sound, then the clash / launch / mantle / vault / skills / staff /
  guard / climb / wall-slide / first-person / SHIFT-LOCK / dash / run-onto-travel cases). This is the first slice
  that hands something BACK: `hsAfter` is declared at its top and read by the caller for `updateVisual`, so the
  method computes it and returns it (`const hsAfter = this.tickFacing(...)`). Deps: `P` and `wrapPi`.
  `player.js` is down to ~3.08k lines.
  **Part 45:** the state machine's EXITS -> `player/states.js` as `tickStateExits(dt, inp, grounded)` — the four
  states that end on a CONDITION rather than a clock (the dive's arrival, the slide's held-or-spent gate, the
  dash's clock and its two performances, the block's chord/latch/stance), lifted from under `update`'s own
  `// ---- state exits ----` heading. They run before the entries and before the switch, and each writes the next
  state itself. `player.js` is down to ~3.02k lines.
  **Part 46:** THE KICK'S PRESS -> `player/wallrun.js` as `tickKickPress(grounded)` — the M1 wall-kick gate
  (kick buffer + every state that refuses the boot) lifted from the middle of `update`, homed beside `tryWallKick`
  and `readKickReach` which it drives. Testing note: `findKickWall` bails under `KICK_MIN_SPEED` (18), so a kick
  test must give the body that much horizontal speed (set `pl.vel` directly beside a face you are sliding on) or
  no candidate ever appears and the press looks dead. `player.js` is down to ~3.00k lines.
  **Part 47:** THE FRAME'S WORLD READ -> `player/physics.js` as `readWorld(dt)` — the box for the frame
  (`updateBox`), the collider query and `this.colliders` pointing at that buffer, lifted from the top of `update`.
  Only `P` and `dt`; `world` (the alias it made) was read nowhere else in `update`. `player.js` is down to ~2.99k.
  **Part 48:** THE ACTION BUFFERS and THE STAMINA REFILL -> `player/clocks.js` as `tickBuffers(dt, inp, grounded)`
  and `tickStamina(dt, grounded)`, both lifted from just under `tickClocks`. Note the `climb` string in the
  buffers' gate reads as a "foreign name" in a naive check — it is `attachMode === "climb"`, not a variable.
  **Part 49:** THE WISH -> a new `player/wish.js` as `tickWish(inp)`, returning `{ sin, cos, wx, wz, hasWish }`
  which `update` destructures (`const { sin, cos, wx, wz, hasWish } = this.tickWish(inp);`). `wx`/`wz` were `let`
  in the caller only because the dead-zone normalise reassigned them — that now happens inside the method, so the
  destructured bindings are read-only and nothing else in `update` assigned them (checked before cutting).
  `player.js` is down to ~2.95k lines, and `update` is by now a readable list of calls: guard, world, slope, walls,
  squeeze, gravity/clocks, buffers, wish, stamina, guard chord, exits, hammer, crouch, launch pad, reads, kick,
  entries, attach, vault/skyfall/plunge, the `switch`, contacts, landing, facing, `updateVisual`.
  **Part 50:** THE STAFF'S BODY SOLVE -> `player/pole.js` as `solvePoleBody(dt, ud)` — the whole staff layer of
  `updateVisual` (~150 lines: the prop read, the layer weight against every base pose, the one `poleHold` read
  spent twice, the carry's run-lift and trunk ride, the haul blend, `posePole`, the hands' world point and the
  mounted prop's shaft ends). It reads `dt` and the rig's `userData` (`ud`, a local of `updateVisual`), so those
  are its args; everything else it touches (`composePole`, `_pole*`, `POLE`) already lives in `pole.js`, and
  `smooth01` had to be added to its ./math.js import. Verified live with a staff actually in hand: `poleTake`, a
  run-carry (polePose 1.0, gripW.y 1.44 off the extracted solve) and an M1 strike (poleMode "strike").
  `player.js` is down to ~2.80k lines.
  **A NOTE ON TESTING A CARRIED PROP:** `pl.poles.props()` lists the world's planted poles (each with `x`/`z`/
  `groundY`); teleporting beside one and calling `pl.poleTake(prop)` directly is the reliable way in — the
  `poleNear()` reach test did not fire at 0.6 u in a test harness even though the pickup works in play.
  **Part 51:** THE WALL POSE AND THE CLIMB'S CLOCKS -> `player/wallrun.js` as `solveWallPose(dt, inp, ud)` — the
  whole wall layer of `updateVisual` (~153 lines: `wallPose`, the climb's phase and REST clock, the wall slide's
  scrape phase, and the big solve — `wallRunFrame`'s own frame, the climb's PULL reading and `poseWall` /
  `poseClimbPull` / `poseClimbFly`). It writes only pose clocks (`wallPose` / `climbPhase` / `climbRest` /
  `climbRestT` / `climbRiseU` / `climbRel`), and the one of those the SIMULATION reads (`climbRel`, in the `air`
  state's `wantFly`) is still written after `update` runs, so the frame of latency is unchanged — the climb's
  release-and-fly during a climb-up is that handover, not a detach bug. `wallrun.js` gained
  `WALL_POSE_FADE` from ./pose.js. Also: `wallRunFrame` is declared AFTER the method table in that file, so a
  naive "is it in scope above me" check reports it missing — it is a hoisted function declaration. Verified live:
  a wall slide identical to before (`mode=slide`, grip 5.2) and a full climb (attach, hang, up, down, kick-off).
  `player.js` is down to ~2.65k lines.
  **Part 52:** THE THREE SKILL POSE LAYERS -> `player/skills.js` as `solveWhirlPose(dt, ud)` / `solveKneePose(dt, ud)`
  / `solveScissorPose(dt, ud)` — the whirl's, the flying knee's and the head scissor's own layers of
  `updateVisual` (their cross-fades plus `poseWhirl` / `poseFlyingKnee` / `poseScissor`), each body verbatim,
  each only READS the skill's own fields and writes its own `*Pose`. `skills.js` gained `SKILL_POSE_FADE` from
  ./pose.js. Verified live by driving each skill on the deck: `whirl()` -> state=whirl pose 1.00 (events
  whirl / whirlgrab / whirlscrape), `knee()` -> state=knee pose 1.00 (knee / kneeleap / kneeland), `scissor()`
  -> state=scissor pose 1.00 (scissor / scissorleap / ...), every pose returning to 0.00 after. (Gotcha: the
  three skills share `canSkill()`, so a back-to-back test must settle to a neutral state first — `knee()`
  returns `false` if a whirl is still running, which is by design, not a split bug.) `player.js` is down to
  ~2.60k lines.
  **Part 53:** THE WALL KICK'S POSE LAYER -> `player/wallrun.js` as `solveKickPose(ud)` — the kick's own layer of
  `updateVisual` (the `poseKick` call, the flip riding its longer `KICK_FLIP_TIME` envelope while the plain kick
  rides `KICK_POSE`), body verbatim, reading only the kick's own fields (`kickT` / `kickSpinT` / `kickSide` /
  `kickVariant`) and writing nothing. Verified live by wrapping `charMesh.userData.poseKick` and arming the two
  clocks directly: a plain kick posed at `u=0.388, side=1, variant=2`, and the flip half a turn in posed at
  `u≈0.61, side=-1, variant=3` — both exactly what was armed, both coming through `updateVisual`'s `solveKickPose`.
  `player.js` is down to ~2.60k.
  **Part 54:** THE RUNNING LUNGE'S POSE LAYER -> `player/lunge.js` as `solveLungePose(dt, ud)` — the lunge's own
  layer of `updateVisual` (the cross-fade, the per-beat `poseLunge` dispatch on `lungePhase`, both cross-fade
  echoes — the pounce's laid-out end shape worn under the roll while the hop flies / the blend window runs — and
  the `take` read), body verbatim, reading only the move's own fields. `lunge.js` gained `approach` (./math.js)
  and `SKILL_POSE_FADE` (./pose.js). Verified live by calling the extracted method directly with the clock and
  phase armed: every beat produced `poseLunge(p=1, phase, lu=0.50, roll, take=0)` for its own clock, and the hop
  echo posed `(0.301, 0, 1, …)` under the plain `(1, 1, 0.152, …)` — both exactly the pre-split arithmetic.
  (The move is still UNWIRED, so this layer only ever runs on a `state === "lunge"` frame; the direct-call probe
  is how a layer with no live caller is tested.) `player.js` is down to ~2.57k.
  **Part 55:** THE WALL CLINCH'S POSE LAYER -> `player/wallbeat.js` as `solveWallBeatPose(dt, ud)` — the clinch's
  own layer of `updateVisual` (the cross-fade, the `clearWallBeatHead` call, the victim's HEAD BONE walked into
  the player's own frame through `_clinchV`, the `setWallBeatWall` handover of the face's normal, and the
  `poseWallBeat` call), body verbatim. `wallbeat.js` gained `approach` (./math.js) and `SKILL_POSE_FADE` +
  `_clinchV` (./pose.js). Verified two ways live: (a) a direct probe — no victim => `clear=1`, pose gets the raw
  clocks `[1, 3, 0.5, 0, -1, 0.2, 0.4]`; built victim => the head is solved into the player's frame and the wall
  normal handed over; and (b) a real end-to-end — teleported the player and an enemy either side of a staged
  wall, `startWallBeat` took (`state=wallbeat`), and the pose layer was driven on 32 straight frames into the
  knee phase (`lastPose = [1, 3, 0.048, 0, -1, 0, 0]`). Both restored cleanly. `player.js` is down to ~2.55k.
  **Part 56:** THE GRAB'S POSE LAYER -> `player/grab.js` as `solveGrabPose(dt, ud)` — the grab's own layer of
  `updateVisual` (the `grabbing`/`grabFade` locals, the cross-fade, the per-kind `poseGrab` call with its
  `heavePoseT` read, and the MISS's own parked-shape eased weight), body verbatim — the two locals travelled with
  the block since nothing else read them. `grab.js` gained `approach` (./math.js) and `SKILL_POSE_FADE`
  (./pose.js). Verified live: direct probes gave `grab-take [1, 0.152, 1, 1, false, 0.2]` and `grab-miss
  [1, 0.052, 2, 0, true, 0.05]`, and a real staged grab (`pl.grab()` on an enemy placed in front) returned
  `true`, entered `state=grab` and drove `poseGrab` for 10 frames (`first=[0.238, 0.017, 2, 0, false, 0.017]`).
  `player.js` is down to ~2.54k.
  **Part 57:** THE CAPOEIRA'S POSE LAYER -> `player/skills.js` as `solveCapoPose(dt, ud, capoPhase)` — the
  capoeira's own layer of `updateVisual` (the cross-fade, the HELD draw-phase with its long comment, and the
  `poseCapo` call), body verbatim. `capoPhase` is a HOST LOCAL of `updateVisual` (read again later by the capo
  carry block), so it is passed in as a parameter rather than re-derived — `-1` when the state is not `capo`.
  Verified live: a direct probe posed `[1, 0.4, 2, 0]`, and a real capoeira (`pl.capoeira()`) returned `true`,
  entered `state=capo` and drove the layer on 59 frames, ending in the held-phase fade-out the comment promises
  (`last = [0.048, 0.966, 2, 1]` — weight easing to 0 while the draw phase stays at 2 and its `ph` settles at 1).
  `player.js` is down to ~2.52k.
  **Part 58:** THE HAMMER'S POSE LAYER -> `player/commit.js` as `solveSmashPose(dt, ud)` — the hammer's own layer
  of `updateVisual` (the `HAMMER_POSE_FADE` cross-fade and the `poseSmash` call, handed only the clock), body
  verbatim. `commit.js` gained `approach` (./math.js) and `HAMMER_POSE_FADE` (./pose.js). `player.js` no longer
  reads `hammerTotal` (the pose call was its last reader), so that import was dropped from the commit.js import —
  grep for a name before removing its import. Verified live: a direct probe posed `[1, 2.8, <P.HAMMER>, 2]`, and a
  real `pl.startHammer()` entered `state=smash` and drove the layer from weight 0.185 up to 1 with the clock
  advancing (`last = [1, 0.799, <P.HAMMER>, 0.341]`). `player.js` is down to ~2.50k.
  **Part 59:** THE MELEE CHAIN'S POSE LAYER -> `player/combat.js` as `solveAttackPose(dt, ud)` — the chain's own
  layer of `updateVisual` (the `COMBAT_POSE_FADE` cross-fade, `attackLink`, the `attackMoveSpec` read, the
  clinch's head solve through `_clinchV`, `poseAttack`, and the `chainBlend`/`chainSnapshot` handover), body
  verbatim with its long "why the fade cannot be done with `e`" comment. `combat.js` gained `_clinchV`
  (./pose.js). Verified live: a direct probe gave `[1, 0, 0, false, false]` for move 0 and — for move 1 with a
  `clinch` target — the head solved into the player's frame plus `[1, 1, 0, false, false]`; a real
  `pl.startAttack(0)` entered `state=attack` and drove the layer on 21 frames (weight ramping 0.151 → 1), the
  clock finishing at `t/total = 1` and the weight easing back out after the state ended. `player.js` is down to
  ~2.47k.
  **Part 60:** THE DIVE AND THE SLAM'S POSE LAYERS -> `player/commit.js` as `solveDiveSlamPose(dt, ud, speed)` —
  the dive's and the slam's own layers of `updateVisual` (each cross-fade + `poseDive` with its `speed / P.DIVE_MAX`
  read + `poseSlam`), body verbatim. `commit.js` gained `DIVE_POSE_FADE`/`SLAM_POSE_FADE` (./pose.js), and
  `player.js` dropped both from its own pose.js import (grep before removing). Verified live: direct probes gave
  `[1, 0.857]` (24/28) for the dive and `[1]` for the slam, and driving the REAL call site by hand —
  `setState("dive")` then 20× `updateVisual(1/60, 10, G.input)` — posed 20/20 frames (`first=[0.093, 0.357]`,
  `last=[1, 0.357]`), the slam the same (`first=[0.167]`, `last=[1]`). (Note: firing `startDive()`/`startSlam()`
  and then just waiting is a poor test here — the state machine runs on and leaves `dive`/`slam` before a frame is
  sampled; drive `updateVisual` directly instead.) `player.js` is down to ~2.45k.
  **Part 61:** THE Q DASH'S POSE LAYER -> `player/states.js` as `solveDashPose(dt, ud, pitch)` — the dash's own
  layer of `updateVisual` (the whole-rig `dashPitch` and the `poseDash` call with its `dashPoseT` clock read), body
  verbatim with its comments. `states.js` gained `DASH_POSE_FADE` (./pose.js) and `player.js` dropped it from its
  own import. `pitch` (the rig angle chain's local) is passed in. Verified live: a direct probe gave
  `[1, 0.5, 1, 1, 0.217]`, and driving the REAL call site — `setState("dash")` then 20× `updateVisual(1/60, 10,
  G.input)` — posed 20/20 frames (`first=[0.278, 0.4, 1, -1, 0.04]`, `last=[1, 0.4, 1, -1, 0.04]`). `player.js`
  is down to ~2.44k.
  **Part 62:** THE MANTLE'S POSE LAYER -> `player/ledge.js` as `solveMantlePose(dt, ud)` — the mantle's own layer of
  `updateVisual`, dispatching between the climb's `poseMantle` and the LEDGE pull-up's `poseLedgePull` (with its
  `ledgePullPin` read) off the same fade, body verbatim. `ledge.js` gained `MANTLE_POSE_FADE` (./pose.js) and
  `player.js` dropped it. Verified live by driving the real call site: `setState("mantle")` + `mantleFromLedge=
  false` + 20× `updateVisual` posed 20/20 `poseMantle` frames (`first=[0.119, 0]`, `last=[1, 0]`), and the same
  with `mantleFromLedge=true` posed 20/20 `poseLedgePull` frames with `ledgePullPin` a number. `player.js` is down
  to ~2.42k.
  **Part 63:** THE RUNNING VAULT'S POSE LAYER -> `player/vault.js` as `solveVaultPose(dt, ud, pitch)` — the vault's
  own layer of `updateVisual`: the whole-rig TURN (`vaultTurn` and the squaring-up after), the
  `VAULT_POSE_FADE`/`VAULT_POSE_FADE_OUT` cross-fade and the `poseVault` call, body verbatim. `vault.js` gained
  `TAU` (./math.js) and the two fades (./pose.js); `player.js` dropped both fades from its import. Verified live: a
  direct probe gave `[1, 0.5, -1, 1, 0.25]` (k = 0.3/0.6, side −1, kind 1, pitch + flip) with the turn called
  once (roll −π), and driving the REAL call site — `setState("vault")` + 12× `updateVisual` with `vaultT` advanced
  — posed 12/12 frames (`first=[0.278, 0.028, 1, 0, 0.015]`, `last=[1, 0.333, 1, 0, 0.46]`), turn 12×. `player.js`
  is down to ~2.40k.
  **Part 64:** THE LAUNCH PAD'S POSE LAYER -> `player/launch.js` as `solveLaunchPose(dt, ud)` — the flight's own
  layer of `updateVisual` (its cross-fade + `poseLaunch` handed the normalised vertical speed), body verbatim.
  `launch.js` gained `approach` (./math.js) and `LAUNCH_POSE_FADE` (./pose.js); `player.js` dropped the fade from
  its import. Verified live: `setState("launch")` + `vel.y=35` + 15× `updateVisual` posed 15/15 frames
  (`first=[0.119, 0.5]`, `last=[1, 0.5]` — weight ramping, `vy/70` = 0.5). `player.js` is down to ~2.39k.
  **Part 65:** THE LEDGE HANG AND ITS GRIP -> `player/ledge.js` as `solveLedgePose(dt, ud)` — the hang's own layer
  plus the shared GRIP solve (`poseHang`, then `gripLocal()` + `poseLedgeGrip` weighted by the further-on of the
  hang's fade and the pull-up's `pin`), body verbatim. `ledge.js` gained `LEDGE_POSE_FADE` (./pose.js); `player.js`
  dropped it. Verified live: `setState("ledge")` + `ledgeGrip=true` + 20× `updateVisual` posed 20/20 `poseHang`
  frames (`first=[0.167, 0.3, 0.2]`, `last=[1, 0.3, 0.2]`) and 20/20 `poseLedgeGrip` frames
  (`gripLast=[1, null, null, null]` — the target is `NaN`, i.e. no real ledge edge was staged, serialised to null;
  that is `gripLocal`'s own no-edge branch, unchanged). `player.js` is down to ~2.37k.
  **Part 66:** THE LANDING ABSORB AND THE SLAM'S OWN LANDING -> `player/landing.js` as `solveLandPose(dt, ud)` —
  the two one-shot pose layers of `updateVisual` (the absorb's `landT` timer + `poseLand`, and the slam's
  `slamLandT` + `poseSlamLand` which REPLACES the absorb while the fists are in the deck), body verbatim.
  `landing.js` gained `approach` (./math.js) and `LAND_POSE_FADE` (./pose.js); `player.js` dropped both LAND fades
  from its import (grep across `src/` first — nothing else imported them from `player.js`). Verified live:
  `setState("ground")` + `landT=0.2` + 10× `updateVisual` posed 10/10 `poseLand` frames (`first=[0.139, 1.4]`, 0
  slam), and `slamLandT=0.3` posed 10/10 `poseSlamLand` frames (`first=[0.238, 1.7]`) with the absorb suppressed
  (0 `poseLand` calls). `player.js` is down to ~2.35k.
  **Part 67:** THE CLASH'S OWN SHAPE -> `player/combat.js` as `solveClashPose(ud)` — the clash's pose layer of
  `updateVisual` (the no-fade `poseClash` call, handed the tag `"player"`, the move, its clock, the drive and the
  jolt), body verbatim. Verified live: a direct probe gave `["player", 2, 0.31, 0.6, 0.22]`, and the real call
  site posed 8/8 frames. `player.js` is down to ~2.34k.
  **Part 68:** THE MACACO'S OWN SHAPE -> `player/macaco.js` as `solveMacacoPose(ud)` — the macaco's pose layer of
  `updateVisual` (a single absolute `poseMacaco` on `macacoT / P.MACACO_T`), body verbatim. Verified live: a direct
  probe gave `[0.484]` (0.3 / `MACACO_T`), and the real call site posed 8/8 frames with the clock advancing
  (`first=[0.349]` → `last=[0.538]`). Parts 67 and 68 were done together (both are tiny adjacent no-fade pose
  blocks) and verified in one refresh. `player.js` is down to ~2.34k.
  **Part 69:** THE GEAR POSE LAYERS -> a new `player/items.js` as `solveItemPoses(dt, ud)` — the three poses the
  body wears for the thing it holds, carved out of `updateVisual` whole: the CARRY (`poseCarry`, riding the run's
  stride), the BALL ACTIONS (`poseBall`, with the `ballLast` fade-out ride) and the TOTE (`poseTote`). They are
  LAYERS, not states, and were all written in one contiguous run at the tail of the pose stack, so one method
  holds all three (order matters and is preserved). `items.js` imports `approach` (./math.js) and
  `TOTE_POSE_FADE`/`BALL_POSE_FADE` (./pose.js); `player.js` dropped both fades from its import and gained
  `installItems(Player)` (imported + called with the other installs). Verified live: a direct probe gave
  `carry=[1, 0.2, 0, 0]`, `ball=[1, "throw", 0.4]` (and `ballLast="throw"`), `tote=[1, "carry", 0.3]`, and driving
  the real call site posed 15/15 frames of each (`carryFirst=[0.167, 0.2, 0.027, 0.049]`, `ballFirst=[0.208,
  "shoot", 0.2]`, `toteFirst=[0.167, "carry", 0.3]`). `player.js` is down to ~2.31k.
  **Part 70:** THE BLOCK/GUARD'S POSE LAYER -> `player/block.js` as `solveBlockPose(dt, ud, speed)` — the guard's
  own layer of `updateVisual` (`guardRush`/`guardPose`/`guardPhase` and the seven-arg `poseBlock` call), body
  verbatim with its long guard-vs-charge comment. `block.js` gained `approach` and `RUN_STRIDE` (its ./config.js
  import) plus `GUARD_RUSH_FADE`/`GUARD_POSE_FADE` (./pose.js); `player.js` dropped both fades from its import
  (grep — `GUARD_RUSH_FADE` survived only in a comment). Verified live: a direct probe gave `[1, 0.406, 0.909,
  0.251, 1, 5, 0.7]` (guard pose, the rushing blend, the hit ramp, phase, walk, idle time, run blend), and the
  real call site posed 15/15 frames (`first=[0.093, 0.104, 0.909, 0.013, 1, 5.017, 0.349]`,
  `last=[1, 1, 0.909, 0.202, 1, 5.25, 1]`). `player.js` is down to ~2.28k.
  **Part 71:** THE AIR FAMILY'S POSE LAYER -> `player/jump.js` as `solveAirPose(dt, ud)` — the jump/air shapes'
  layer of `updateVisual` (the `airWant` gate and `poseAir` with its vertical-velocity + `jumpVariant` channels),
  body verbatim. `jump.js` gained `approach` (./math.js) and `AIR_POSE_FADE` (./pose.js); `player.js` dropped it.
  Verified live: `state="air"`, not grounded → 12/12 `poseAir` frames (`first=[0.104, 0.5, 2]`, `last=[1, 0.5, 2]`
  with `vy=3.5` → 0.5). `player.js` is down to ~2.27k.
  **Part 72:** THE FALL FAMILY'S POSE LAYER -> `player/skyfall.js` as `solveFallPose(dt, ud, speed)` — the
  skyfall/plunge shapes' layer of `updateVisual` (`FALL_POSE_FADE` cross-fade + `poseFall` with its kind / brace /
  `skyfallT` / TOTAL-speed drive, the kind flipping to `"plunge"` while M1 holds the fall), body verbatim.
  `skyfall.js` gained `FALL_POSE_FADE` (./pose.js). Verified live: with `skyfall=true` the layer posed 12/12
  `poseFall` frames (`first=[0.056, "flail", 0.3, 1.2, 0.444]` — `move = max(6,8)/18`), and with `plunge=true` the
  kind came through as `"plunge"` (`last=[0.889, "plunge", …]`). (The `poseAir` calls still seen during the skyfall
  are the air layer fading OUT from the previous sub-test — `airWant` is 0 while `skyfall` is true — which is the
  pre-split behaviour.) `player.js` is down to ~2.25k.
  **Part 73:** THE SLIDE'S POSE LAYER -> `player/states.js` as `solveSlidePose(dt, ud)` — the slide's own layer of
  `updateVisual` (the `SLIDE_POSE_FADE` cross-fade + the `poseSlide` call), body verbatim. `states.js` gained
  `SLIDE_POSE_FADE` (./pose.js) and `player.js` dropped it. **Part 74:** THE CROUCH'S POSE LAYER -> the same file
  as `solveCrouchPose(dt, ud, speed)` — the crouch's own layer (its fade, the short crouch-walk stride and the
  `poseCrouch` call), body verbatim. `states.js` gained `CROUCH_POSE_FADE` (./pose.js) + `RUN_STRIDE` (its
  ./config.js import); `player.js` dropped the fade. Verified live: `setState("slide")` posed 12/12 `poseSlide`
  frames (`first=[0.083]` → `last=[1]`), and `crouching=true`, speed 2 posed 12/12 `poseCrouch` frames
  (`first=[0.069, 1, 0.013, 0.416]`, `last=[0.833, 1, 0.154, 0.599]`) with the crouch phase advancing. `player.js`
  is down to ~2.23k.
  **Part 75:** THE DOUBLE JUMP'S FLIP TUCK -> `player/jump.js` as `solveTuckPose(ud)` — the flip tuck of
  `updateVisual` (`flipPose` on the sin envelope + the `poseTuck` call), body verbatim. Verified live: with
  `flipT = FLIP_TIME/2` the `flipPose` came out 1.000 and posed `[1, 0.85]` directly, and the real call site
  posed 5/5 frames. `player.js` is down to ~2.23k.
  **Part 76:** THE WHIRL'S LIVE NECK CONTACT -> `player/skills.js` as `solveWhirlNeck(ud)` — the clear +
  `setWhirlNeck` walk of the victim's head into the player's frame through `_clinchV`, carved out of
  `updateVisual` verbatim (the `capoPhase` line beside it stays, since `solveCapoPose` is handed it further
  down). `skills.js` gained `_clinchV` (./pose.js) and `player.js` dropped it from its import (it was the last
  reader there). Verified live: a direct probe called `clearWhirlNeck` once and solved the neck to
  `[2.139, 0.535, −1.419]`, and the real call site did the same over 4 frames. `player.js` is down to ~2.22k.
  **Part 77:** THE RIG PLACEMENT -> a new `player/placement.js` as `solvePlacement(dt)` — the head of
  `updateVisual` (the wall hug, the deck y-follow with its slope feed-forward, the staff strike's yaw spin,
  and the slope lean about the feet), carved out and called back verbatim; `placement.js` took
  `P`/`approach`/the tilt scratches and `player.js` dropped them from its imports (its last reader there).
  Verified live: flat grounded follow left `g.position == pos`; a wall slide for 40 frames hugged to
  0.259 with `gx == pos.x − hug`; an 80-frame slope left `slopeBlend` at 1.000 and tilted `tiltG` to
  `rot.z 0.464` (roll, as the sideways deck implies). Scene snapshot rendered clean. `player.js` is down to ~2.09k.
  **Part 78:** THE RIG'S BODY ANGLES -> a new `player/rig.js` as `solveRigAngles(dt, speed)` — the front half of
  `updateVisual` verbatim (the state `pitch`/`sy`/`sxz` chain, the clash/smash/flip/kick additions, the
  `spinX` tumble + its whole-revolution tidy-up, the `dashSpinY` spiral, and the `inner.rotation.y` chain),
  returning `{ pitch, spinExtra }` instead of applying `pitch` (the caller keeps adding to it). `rig.js` took
  `P`/`approach`/`vaultLift`/`DIVE_LEAN_BASE`/`DIVE_LEAN_SPEED`/`FALL_POSE_FADE`; `player.js` dropped the first
  five from its imports. Verified live: slam pitched 0.72, dive pitched `BASE+SPEED` (1.60) at `DIVE_MAX`, ground
  pitched 0 with no xz squash, the half-flip read `−1.5π` on both `pitch` and `spinExtra` with the 0.86/1.12 squash,
  and a leftover `spinX 0.5` settled to 1.4639 exactly. Real `updateVisual` drove clean; gameplay snapshot fine.
  `player.js` is down to ~1.70k.
  **Part 79:** THE LOCOMOTION BASE -> a new `player/base.js` as `solveLocomotionBase(dt, speed, runFwd, runLat,
  trunkRoll)` — the run cycle (its speed fade, phase and the locked backpedal), the idle it cross-fades into, and
  the idle's per-boot deck sampling, all moved verbatim; it returns `ud` for the pose layers that follow. `base.js`
  took `RUN_STRIDE`/the `RUN_*` and `IDLE_*` constants; `player.js` dropped all of them (its last readers there).
  Verified live: 60 frames of a 6 u/s run drove `runBlend` to 1 and advanced `runPhase` to 0.97; then 150 idle
  frames faded `runBlend` to 0, `idlePose` to 1, with `footGround` settled at −0.148; the method handed back the
  real `userData`. Gameplay snapshot clean. `player.js` is down to ~1.59k.
  **Part 80:** THE RIG'S LEAN -> `player/placement.js` (same file as part 77) gains `solveRigLean(dt, speed,
  pitch)` — the wall bank + capoeira roll, the lock's trunk lean, the run's travel split (`runFwd`/`runLat`) and
  the hip-pivot placement (wall-run bank + the lunge's ball), moved verbatim; it returns `{ runFwd, runLat,
  trunkRoll }`. `placement.js` took `WALL_BANK_FADE`; `player.js` dropped it (its last reader there) along with
  four long-unused pose imports (`WALL_POSE_FADE`/`FALL_BRACE_FADE`/`SMASH_PLUNGE_V`/`SKILL_POSE_FADE`). Verified
  live: forward run read `fwd 1 / lat 0`, a full strafe `fwd 0 / lat 1`, the wall bank leaned to −0.2496 (expect
  −0.25) with the pivot offset non-zero, and the lunge planted `posX 0`. Gameplay snapshot clean. `player.js` is
  down to ~1.48k.
  **Part 81:** THE FINAL RIG WRITE -> `player/rig.js` (same file as part 78) gains `solveFinalRig(dt, speed, pitch,
  ud)` — the grabFlip whole-turn square-up, the final `inner.rotation.x` (state lean + the tumble/dash/grab-flip/
  vault turns + the ground's speed lean), and the limb-stretch + neck-split spend, moved verbatim. `rig.js` took
  `TAU`; `player.js` dropped it plus two long-unused math imports (`wrapPi`/`swingTowards`). Verified live: a 0.5
  `grabFlip` squared to ~0.4, the final pitch read 0.42 (0.3 lean + 0.12 ground) exactly, `stretchApply` got 0.25
  and `neckApply` fired, and the real `updateVisual` drove clean. Gameplay snapshot clean. `player.js` is ~1.45k.
  **Part 82:** THE CAPO CARRY'S LIVE CONTACT -> `player/skills.js` as `solveCapoCarry(dt, capoPhase)` — the carry
  block at the very tail of `updateVisual` (face pinned to the mid-soles after the pose + stretch are spent),
  moved verbatim. `skills.js` took `_capoSoleA`/`_capoSoleB`/`_capoBoot`/`_capoHead`; `player.js` dropped them and
  its last `smooth01` use. Verified live: a fabricated carry target read a finite `capoCarry` (yaw 3.152, pitch
  0.55), was cleared on the next phase, and no-op'd with no target. `player.js` is ~1.39k.
  **Part 83:** THE DECK CLAMPS -> `player/placement.js` gains `solveDeckClamps()` — the lunge's miss-roll handover
  clamp and the scissor whiff's net (the two vertex sweeps at the tail of `updateVisual`), moved verbatim; no new
  imports (it needed only `P`). **This empties `updateVisual` down to its 122-line dispatch**: placement → body
  angles → lean → locomotion base → the ordered pose layers → final rig write → capo carry → deck clamps →
  `bodySpin`. Verified live: inactive was a no-op, a forced lunge deck lifted `inner.position.y` by 1000.94, and
  the scissor branch ran finite. `player.js` is ~1.30k.
  **Part 84:** THE CONSTRUCTOR -> a new `player/init.js` as `initPlayer(pl, scene, world)` — the whole 712-line
  constructor body, `this.` → `pl.` (safe: no `this.x(` calls, no arrows, no `return`/`super`, and every `this`
  is dotted). `player.js`'s constructor is now a single call and the file is down to ~0.58k; the move also
  exposed and removed ~30 stale imports in `player.js`. Verified live: full construction intact (group / inner /
  mesh / material / tiltG / charCtn / charMesh, all 20 `userData` pose layers, `wallFrame`, `poleGripW`, the
  guard latch) and a 2400-frame scripted smoke run visited air/attack/dash/dive/ground/slam/slide with no errors.
  NOTE: `player.js` is now essentially `update` + `updateVisual` + the two getters; the remaining split work is
  inside `update` and inside the pose-layer modules.
  **Part 85:** THE PER-STATE DISPATCH -> `player/states.js` as `tickStateMachine(dt, inp, grounded, hasWish, wx, wz,
  sin, cos)` — the whole `switch (this.state)` of `update` (one line per state + the gravity borrows), lifted
  verbatim; `player.js` dropped its last `approach` use with it. Verified live: the 2400-frame smoke run visited
  the same seven states with byte-identical results to part 84 (the sim is deterministic from spawn, so an
  identical run IS the regression check). `player.js` is ~0.40k.
  **Part 86:** THE AIR COMBO'S HAND -> `player/core.js` as `tickAirComboHand()` — the juggle's floor hand-off
  (`e.comboY`), lifted from `update`. Same smoke run, identical results. `player.js` is ~0.38k — `update` is now a
  pure sequence of named phases and `updateVisual` a pure pose-layer dispatch, which was the whole point of the split.
  When adding the next part: move one cohesive, low-coupling chunk at a time, keep the load-bearing
  comments with their code, and `page_refresh` + smoke-test between pieces.
- **THE BALL HAS TWO SHAPES AND ONE BUTTON, AND THE RUN IS THE RUN.** (session 180) Three things
  about the soccer ball, and the first is a warning about pose layers: `poseCarry` is an **arm**
  layer. It was written in session 179 writing the TORSO and the HEAD too, and at a sprint the run
  authors a **0.68** trunk lean — a carry that wrote `-0.024` over it swapped the whole run cycle out
  for an upright walk, which is the *"separate animation"* the user saw. `poseCarry(bones, u, t,
  stride, strideAmt)` now writes the arm ONLY (and rides the stride), so it is the run with one arm
  busy — the same bargain the block's guard makes. **Before you add anything to `poseCarry`, ask
  whether the pose underneath owns that channel.** The other two: the ball is bigger (`PROP_ROLL_R.
  ball` **0.28**) and it is *controlled* — `control: true` on its def switches on the CONTROL steer in
  `inventory.update`'s drops loop, which blends a ball at the feet (`BALL_TOUCH_R`) toward the body's
  own velocity cap by `MATCH`, aiming it `AHEAD` of him, so a sprint keeps it instead of leaving it,
  and its boot touch is a soft `kick` not a punt. And it has **two action shapes**, one per way it
  leaves the body: `M1` with it in the HANDS is the **THROW**, `M1` with a controlled ball at the feet
  is the **SHOOT**. The SHOOT is the user's own Mixamo clip, retargeted offline by
  `src/tools/action-bake/` (see that folder's README: the one-window key, the in-place yaw
  cancellation, and the release key that drives `inventory.js`) — ONE table, worn as a one-shot slerp
  clamped at the last key. **The THROW is NOT a clip any more (session 183):** the keeper's drop kick
  it used to wear is a PUNT — measured, the ball left the hand with the throwing arm still down at the
  hip — so the throw is an **authored six-beat pose** in `streetwear.js` (`THROW`:
  DRAW → COCK → RELEASE → FOLLOW → SETTLE, hand path in the body's own frame documented on the table)
  written through the same helpers as every other move, and worn as a LAYER whose trunk fold and head
  are **ADDITIVE** (`poseAdd`) so a throw at a sprint leans INTO the run instead of standing it up.
  Either way the release is a point INSIDE the shape (`THROW_RELEASE` / `SHOOT_RELEASE`, published on
  `poseCfg.BALL`) and the ball's flight is authored in `inventory.js` (`BALL_THROW_V`/`_UP`,
  `SHOOT_V`/`_UP`) — neither shape carries a ball. `M1` first refusal is claimed in `preFrame` so the
  punch chain stands down for that press.
- **A PICKED-UP THING GOES INTO THE HANDS, AND THE HANDS ARE WORN.** `this.hands` (session 179) is
  the fourth home after the two pockets, the back and the arms, and there is exactly ONE of it. `E`
  (or a double-click on a tile, or the quick menu's 1/2) takes an item through `takeToHands`, the one
  door in — and it **reuses the dropped prop's own mesh**, so the thing in his hand is the thing that
  was on the deck, bruise and all. `M1` throws it (`spawnDrop`), `E` sets it down (`dropAt`). The
  mesh is a CHILD OF THE TORSO pinned to the carried HAND (`syncCarry`), and the arm is a pose
  LAYER (`poseCarry` in streetwear.js, one arm) written in `updateVisual` just before the tote — so
  a full hand rides a run, a slide, a vault and a wall climb for free, exactly like the duffel on
  the back and in the arms. Two consequences worth knowing: the skill keys stand down while a hand
  is full (the same rule as the tote), and `canTote` refuses while a hand is full (one handful).
  `CARRY_OFF` is the offset from the hand to the item's CENTRE and its LENGTH is the item's own
  support height (a `0.7` share of it), so the same numbers hold for the ball and for a key — if you
  retune `poseCarry`, re-measure the hand (set the arm's rotations, `updateMatrixWorld`, then read
  `armLowerL.localToWorld(userData.handLocal.L)` back through `torso.worldToLocal`).
- **THE DUFFEL'S HOLD IS PINNED TO THE HANDS, NOT TO THE CHEST, AND THAT IS WHAT MAKES THE THROWS
  READ.** `totePoint` (inventory.js) is the midpoint of the two HAND bones with `BAG_HAND` subtracted
  (`{0, -0.096, -0.022}`, or `{0, -0.313, -0.052}` before session 184 — that one left the bag half a
  metre away from the palms, which is exactly the "arm holding nothing" the user reported). So the bag
  goes where the arms go: overhead on the wind-back, down through the slam, and it only LEAVES on the
  shape's own release key (`THROW_RELEASE` 0.48 / `SLAM_RELEASE` 0.56). `BAG_TOTE` is the NO-RIG
  fallback only — never read while the rig is live. **If you retune `poseTote`'s arms, the bag follows
  for free, but re-measure the separation**: standing and sprinting must both read hand separation
  **0.539** (hands at torso-local `y -0.049 / z 0.293`, bag base `y -0.145 / z 0.269`). If they
  differ, you have written a channel the idle and the run disagree about (see the pose-layer note
  above — the TWIST is the one that bit). And the duffel is a GREY, MODERN bag (a long top zip, a
  webbing shoulder strap that snaps off as one group, a front zip pocket, reflective piping, a mint
  patch) — every material feeds `userData.dmg`/`skin`, so the wear decals and the snap-apart are
  authored against the HULL stations, which is why the hull kept the old ones. Do not re-shape the
  hull without re-checking the eight wear faces.
- **THE DOUBLE-CLICK IS THE STASH, and the refusal is DRIVEN, not keyframed.** Two presses inside
  `DBL_MS` (340 ms) and `DBL_SLOP` (14 px) on the same container put what you are holding into it;
  if it does not fit, `deny` SHAKES the container and lights its rim red. Two traps, both already
  paid for: (1) it is caught on the **capture** phase of `#invStage` and anchored on the **click
  point**, NOT the element — the first press of a double-click does its own job, and on a label that
  job is "bring this holder up", which re-renders the stage so the element under the second press is
  a different element in a different place; (2) the shake is written onto `style.transform` from JS
  every frame (`applyDeny`, called from `denyFrame` in the editor's own update), because this
  environment FREEZES CSS TIMELINES when the document is not the foreground one — a keyframed shake
  is a shake that may simply never run (the same reason `.invPop` is a brightness pop). Only the red
  is a class (`.invDeny`); the glow rides the driven `filter`, and `clearDeny` is called when the
  editor closes so a refusal can never outlive the mode it was drawn in.
- **THE BALL IS A PROP, AND IT HAS A NATURE — do not "simplify" it into a special case.** It is a
  plain `drop` (the object a key becomes when it falls out), started PLACED by `dropAt` instead of
  thrown by `spawnDrop`; both go through the ONE `makeDrop`. What a prop *is* comes off its
  `ITEM_DEFS` entry, and every optional key there is load-bearing for the ball: `round` makes
  `propSupport` return its RADIUS (read off its own bounding box a sphere rests half-sunk in the deck
  and bobs as its facets turn), `settle: false` stops `stepSpin` squaring its pattern up when it
  slows down, `bounce`/`drag`/`spinDrag` are how it bounces and how far it rolls, `angMax` raises the
  strobe ceiling (a box is capped at 44 rad/s; the ball is allowed 70 — at the 0.24 radius session 179
  gave it a kicked 10 u/s wants only 30, so that ceiling is clear air now rather than the clip it was
  tuned against at 0.14), and `kick`
  is the flatter, harder punt a ball gets instead of a box's tumble. `damageScale` is applied in
  `damageItem` — the ONE door every point of item damage comes through, including the half-share the
  duffel's contents take — so a new damage source can never forget it.
- **A LIVE BAG SPINS ON ITS SIDE AXIS, AND THE DECK IS NOT ALLOWED TO BRAKE IT (session 187).** The
  M2 slam writes `SLAM_SPIN` into `bag.ang` about `up x forward` — the axis ACROSS the drive — and
  NOT into `bag.spin`, which is `ang.y`, the deck plane's turn, and is what made a slammed duffel
  read as a spinning top. The two beats that re-arm a live bag's turn (a move of the player's landing
  on it, and a body it runs into) go through **`sideSpin(o, ax, az, min)`**, so nothing a live bag
  does ever puts a vertical component back; the `hotBag` `b.spin` writes are gone. Two numbers to
  know: `SLAM_SPIN` (38) is the rate on the side axis, and the hot bag passes **`grip: HOT_SPIN`**
  (0.7) into `stepProp`, which is how hard the deck may drag its tumble onto the no-slip rate — an
  ordinary prop's is `PROP_ROLL_GRIP` (9), which would have the blur off the bag inside its first
  landing. The moment `bag.hot` reaches 0 the prop object is rebuilt WITHOUT `grip`, so a cooled bag
  rolls and settles like any other prop. **Since session 188 a live bag ends on its OWN HIT**: the
  body contact in `hotBag` job 3 drops `bag.hot` to zero on the spot (it used to set `armed` there
  and come off the body still live), so the homing, the trail and the `grip` override all end with
  it and what the hit leaves behind is an ordinary duffel — one hit per bag, and a body that has
  taken that hit cannot be hit again by it. `HOT_T` (10 s) is the ceiling for a bag that never finds
  anybody. If you retune the slam's spin, retune it on `bag.ang` — a `bag.spin` write there is a
  regression, not a shortcut.
- **THE BALL SLAMS TOO, AND A SLAMMED BALL IS A LIVE BAG MADE OF BALL GEOMETRY (session 189).** The
  ball asks for M2 in its own `ITEM_DEFS` entry (**`takeM2: true`**), which does two jobs at once:
  the empty-handed M2 branch in `preFrame` takes it (`takeBallM2`, within `BALL_TAKE_R` 2.0 — tried
  BEFORE the totes' chord, so it never steals a bag's M2 and a bag's M2 never reaches for a ball),
  and `interact` **skips every `takeM2` prop**, which is why **E now does nothing at all to the
  ball** — that separation is the user's rule, so do not add the ball back to E's candidates. M2 with
  it in hand is `slamHands()` → the authored **`BALL_SLAM`** shape (streetwear.js, played by
  `poseBallBeats`, the throw's own writer) → `releaseHandSlam()` at beat 0.56, off the arm's drawn
  hand point and AT the deck (`SLAM_V` / `SLAM_DOWN`). It spins on the same **side axis** as the bag
  (`dr.ang.set(fz*SLAM_SPIN, 0, -fx*SLAM_SPIN)` — vertical component zero) and comes off **LIVE**
  through the *same* code: **`liveStep(dt, L)`** is the old `hotBag` with the live prop passed in
  (`hotBag` calls it with the duffel), and `makeDrop` + the drops loop carry the whole live field set
  (`hot` / `armed` / `leap` / `hotCd` / `hotFxT` / `hurt` / `isBroken`, the `grip: HOT_SPIN` override,
  the live bounce/drag/spinDrag, and the `if (hot) return` that keeps a live prop out of the ordinary
  control/kick paths). If you add a THIRD live prop, add it to `liveStep`'s callers, not as a new
  copy — the leap, the homing, the spark trail, the one-hit-then-cold rule and the bag's own `hurt`
  all live there now.
- **A 2 x 2 ITEM ONLY FITS THE BAG, and that is the point of the ball's slot.** Pockets are 1 x 2;
  the duffel is 5 x 4. `storeInPockets` therefore falls through to the bag, but only while the bag is
  actually WITH him (`bagReachable`: worn, in his arms, open, or on the deck within 3.2 — the same
  range `toggleWear` shoulders it from). If you ever give the ball a 1-cell footprint it will start
  fitting pockets and the "you need the bag" read disappears with it.
- **THREE THINGS ABOUT PROPS ON THE DECK WERE BROKEN BEFORE THE BALL, and are fixed — do not
  reintroduce them.** (1) The boot's contact test was `|prop.y − body.y| < 1.5` measured against the
  body's CENTRE, which is at the chest, so a prop lying on the deck — the ball, a dropped key even a
  duffel standing up — could not be kicked at all; it is `inFootReach` now (soles to head height, off
  `P.HY`). (2) A kick had NO cooldown, so a prop the body was inside at speed was re-kicked every
  frame: ten damage a frame to a key, and the ball was juggled off the shin instead of struck —
  `KICK_CD` (0.24 s) is what makes it one punt per contact, and what lets a ball be dribbled.
  (3) `E` gave the duffel first refusal anywhere inside 2.8 units, so standing on a ball beside the
  bag opened the bag; `interact` and `updatePrompt` now both take whichever of the two is NEARER
  (the bag keeps the tie), so they can never disagree about what the press will do.
- **THE SKIP LEAPS LIKE THE PAD, and the meter beside him wears the wall's colour.** The wall pull's
  skip is tuned by `P.CLIMB_SKIP_BASE` / `CLIMB_SKIP_GAIN` (2.60 / 14.90 — a full coil is **17.40**
  units, and the `_TRIM` profile is exact, so twice the charge really is twice the rise). If you retune
  the distance, look at `CLIMB_HAUL_RISE` (0.60) too: it is a RISE THRESHOLD that decides when the limbs
  let go of the face, not a time, so doubling the travel without doubling it would cut the haul's release
  beat in half. The hop wears its own overlay pose, `poseClimbFly` (`CLIMB_FLY` in streetwear.js) —
  blended by `player.climbFly` on `P.CLIMB_FLY_IN` / `_OUT`, applied in `updateVisual` right after
  `poseWall`. **Session 181 dressed it as the skyfall's landing brace; session 199 gave it its OWN
  shape** (the user's *"the wall climb jump animation the leap looks meh fix it up a little"*), and the
  reason is the trap worth remembering: `POSEX` **0.8** multiplies every table in streetwear.js, so
  181's "overhead" lead arm of `-2.15` was really **8° above HORIZONTAL**. `CLIMB_FLY` is its own
  table now — `armLead` `[-3.35, 0.18, -0.30]` (**26° short of straight up**), `armTrail`
  `[-2.55, 0.85, -0.55]`, `legLead` `[-1.25, 1.35, -0.05, 0.10]`, `legTrail` `[0.30, 0.12, -0.50,
  0.14]`, `torso` `[-0.18, 0, 0]`, `head` `-0.50`, `grip` `0.45`, `hipY` `HIP_Y + 0.10` — the pad's
  ride out of a launch, arms thrown up, face up the stone, the leading knee driven up and the
  trailing leg left long. Two things in that function are deliberate: the HIPS are written in the
  CLIMB's own frame (`HIP_Y + x`), because this overlay is worn ON TOP of the climb clip whose hips
  sit at `HIP_Y` and an absolute hip would drop the body most of a metre in the frame the flight
  starts; and `poseClimbFly` now **squares `hips.rotation.x`** through `poseRot`, because the climb
  clip underneath drives it (measured **-0.62 = 35°** of body tilt at one phase) and an overlay that
  left it there would have every limb angle in the leap measured against a tilted body. One
  thing to know before retuning it: this world is a STACK of slabs, so a skip that carries the body
  past a face's top does not fall out of the climb — `pickWall` runs every frame and simply finds the
  next face above (measured on a two-slab stack: the body sails past the lower top at 14.2 and carries
  on up the 15–29.2 slab above it).
- **The climb's grip has a VOICE, and it is one door and four voices (sessions 181 + 199).** The whole
  climb past its first grab (`wallGrab`, fired by `attach.js`) used to be silent, and `Sfx.climbTick`
  had sat in `audio.js` unused since it was written. `solveWallPose` fires it on the clip's own
  contacts: the beat is `floor(climbPhase * P.CLIMB_BEATS)` (`CLIMB_BEATS` 4 — the clip plants two
  hands and two feet a cycle), read off the PHASE rather than run on a timer, so it is the sound of
  what the animation is doing and the tempo comes out right at every climb speed for free (~9 ticks/s
  on a momentum-saturated climb). It stands down for a hang, for the load and for the fire (`quiet`),
  and the first frame of a fresh climb only ARMS it (`climbBeat` starts `-1`) so the grab's own sound
  is never doubled. If you want the tempo from a different contact count, `CLIMB_BEATS` is the one
  number. **Session 199 (the user's *"just change the sound sfx for the climb"*) closed the second
  door and re-voiced the tick.** The climb branch in `tickAirState` had ALSO been ticking a leftover
  0.24 s `wallScrapeT` down and firing the same `climbTick` — MEASURED on the live page by call site,
  five seconds of climb: **29 ticks from the beat read + 20 from the timer = 9.8 ticks/s of the same
  0.06 s hiss**, which is the static the wall was making. That timer is DELETED (the `wallScrapeT`
  field is the run/slide SCRAPES' alone now — do not re-add a tick to it). And `climbTick(beat)` is
  three layers rather than one thin band: the body's WEIGHT landing on the hold (a soft, low,
  slightly-bent knock), the GRIT (a short ~0.6-1 k band — palm-on-stone; the old 1.4-2.2 k read as
  air escaping a hand), and a much shorter EDGE band an octave and a half up so it cuts through a busy
  mix. The clip's contact INDEX travels with it, so the two hands and the two feet are four DIFFERENT
  contacts (a palm is darker and heavier, a boot drier and brighter) instead of four identical clicks.
  MEASURED after: **5.5 ticks/s**, a clean `12301230123` cycle.
- **The climb sheds ONE puff now, off the HAND (sessions 181 + 199).** The user's *"add vfx for
  climbing"* (181) was answered with four effects at once, and session 199's *"the vfx for the climb it
  too much"* was the correct verdict on it: MEASURED at a momentum beat (every ~0.11 s) the wall was
  wearing **~2 puffs + ½ chalk ring + 12 trickle-puffs a second**, so the screen was fogging exactly
  where the animation it was pointing at lives. What is left is ONE small, faint puff (**r 0.34, alpha
  0.18**) per **HAND** contact only (`at >= 2` in the drain — a foot knocks almost nothing loose, and
  the hand is the beat the eye and the ear are already on), and nothing between beats. It is still fed
  from `frame` off the clip's own beat (`player.climbBeat`, the same beat the tick sounds on), still
  thrown from whichever of the four extremities is actually nearest the plate (`divePartPoints`), and
  still stands down for the hang, the load and the fire. Its colour is `surfaceColorAt(..., false)` —
  the stone he is on — taken halfway to a pale floor (`c*0.5 + 0.46`): **a raw sample is often nearly
  black and grit drawn in it is invisible** (caught in a capture, not by reasoning about it).
- **The in-world charge meter is `src/climbar.js`, and its colour comes off the COLLIDER, not a probe.**
  `main.js` runs it from `frame` (`GAME.climbMeter`) with `player.wall.c.c` — the very array that box's
  vertices are painted with — so it is always the face he is on. Do NOT "simplify" it back to
  `surfaceColorAt`: `gap` is the body's SURFACE stand-off, so `player.pos` sits ~0.76 off the plate
  while `gap` reads ~0.19, and a sample at `gap + 0.14` lands in the air and falls back to the biome's
  meadow green (measured). Its emissive maths scales the colour to its own brightest channel (with a
  1.35 saturation lift) and clamps; adding white instead — or letting a channel go over 1 — comes out
  PURE WHITE after the post pass's quantiser and throws the wall's colour away entirely.
  **Since session 198 it is TWO readouts, not one.** `ClimbMeter.update(player, camera, color, over)`
  gained an optional fourth argument — `over = { show, charge, lift }` — and when it is GIVEN it is the
  whole of what the meter is drawn from: the climb's own `climbLoad` / `climbCharge` are not consulted
  at all, and `lift` (where the bar stands relative to `player.pos.y`) replaces the chest-height
  default. That is how the ball shot's charge wears the same bar (`main.js` runs `shotMeter` on the
  ball's colour, lifted `BALL_METER_LIFT` 0.98 so it stands beside a body on the deck the way the
  climb's does) without the class ever being duplicated or knowing what a shot is.
- **The body is drawn over the wardrobe's dim by a SECOND canvas, not by CSS.** The wardrobe's dim +
  Ben-Day dots are `#options`'s own DOM background, and the body lives in `#view` *under* it — a
  canvas can never be lifted above a DOM overlay, so `#heroLayer` (a child of `#options`, painted
  between that background and the card by `z-index: -1` with the card at `1`) gets its own WebGL pass
  (`renderHero` in main.js) that hides every other scene child and draws only `player.group`. It uses
  the SAME `camera` and the SAME `pres.width/height` grid as the main picture, and both canvases are
  upscaled with `image-rendering: pixelated`, which is what makes the bright body land on its own
  dimmed ghost — do not give the hero canvas its own size, aspect or CSS position, or the two stop
  lining up. Its opacity rides the `showcase` blend the showcase camera already runs on, so the
  wardrobe section is the only thing that shows it. The renderer is created lazily (skip it entirely
  if you ever want to drop the second GL context) and a failure leaves the layer dark on purpose.
  A carried staff is a scene child mounted onto the rig, so it stays with the dimmed layer — noted,
  not yet drawn in the hero pass.
- **A missed grab fades out on its own clock.** Every skill pose hands back to the ground pose on
  `SKILL_POSE_FADE` (0.07 s), which is right for a move that ends SETTLED (a take finishes on a hero
  landing). The grab MISS is the one that ends PARKED — `poseGrabMiss`'s freeze wears the lean he
  never got to spend — so `updateVisual` gives it `P.GRAB_MISS_FADE` (0.30 s) and EASES the weight
  (smoothstep) on the way out, so the parked stance sets back down instead of leaving at a constant
  rate. It is keyed off `this.grabMiss`, which is still true after `endGrab` (it is only reset by the
  next `grab()`), and only applies while `state !== "grab"` — the FADE-IN and a landed grab keep the
  normal 0.07 s clock. Do not fold this back into the shared `approach` line.
- **The launch pad fires bodies, not just you — and there is ONE arc solver.** The player's solved pad
  arc lives in a module-scope `launchArc(from, to, tower)` in `player/launch.js` (`Player.solveLaunchArc`
  and `Enemy.padLaunch` both call it; `player.js` re-exports it for enemies.js), so a thrown body rides the
  same curve to the same roof. `enemy.update`
  has a `launchArc` branch that places the body on the curve each frame with NO collision and calls
  `landed` at the far end (then `getup`); it is gated on `idle`/`walk` so a body that lands ON the plate
  gets up before it is fired, with an `E.PAD_CD` lockout matching the player's `P.LAUNCH_CD`. The
  `enemyLaunch` event it pushes is spent in `main.js` (the plate's ring, grit, and sound). If you retune
  the pad, retune `launchArc`, not either caller.
- **THE AIR CATCH: one ragdoll rule, three moves (sessions 155 + 190).** A body that is ragdolling is
  nobody's target — the chain passes through it, so `hit` refuses it and `inFront`/`nearest` filter it
  out (the user's *"make the m1s cant hit ragdoll"*). Three moves are allowed through that guard, and
  they are the whole of the exception: the **drop blast** and the **air combo's** juggle (`hit`'s own
  `force`), and the two skills that CATCH a body mid-flight — skill 1's **flying knee** (session 155,
  `kneeAim`) and skill 2's **head scissor** (session 190, `scissor`). The rule for both of the latter
  is ONE test, and it lives in `Enemies.nearest`'s `airRagdolls` + `ragBand` options: a loose body
  counts only while it is **off the deck** (`!e.grounded`) and only inside the world-Y window the
  caller passes, and BOTH are applied to the ragdoll alone, so aiming at a live body is unchanged. The
  scissor passes the very band its own contact tests (`[pos.y − HY − SCISSOR_DOWN, pos.y + HY +
  SCISSOR_UP]`), which is what keeps the aim and the bite agreeing about who was in reach — do not
  give one of them a band of its own. `force: true` on the scissor's jolt is what lets the teeth close
  (`hit`'s guard reads it); it is inert on a live body. And the line that must not move: a ragdoll
  **LYING ON THE DECK** is still refused by every one of these — `nearest` skips a grounded ragdoll
  under `airRagdolls` (and a `down`-state body outright), so the whiff and its red outline cue
  (`outlineCue`, `SCISSOR_MISS_CUE`) stay exactly as session 157 built them.
- **MORE STUFF IN THE SKATEPARK (session 207).** The user's *"add more stuff to the skate board map"*.
  The props go **7 → 17** and the landmarks **3 → 5**, and the measuring that came with it found three
  real bugs. **The props:** two things a deck cannot get from the terrain, because a plaza's ramps are
  all S-curves that roll you over the top — a **KICKER** (1.16 up in 3.3) and a **BANK** (0.85 up in
  3.6), both stacked boxes whose drawn top is a 0.14–0.21 staircase so the board's own wheel
  (`P.BOARD_R` 0.42) rolls over them instead of stopping at them, each with a painted lip — plus a
  **HUMP** (a low two-sided spine in a box), a **MANUAL** pad, a **BARRIER**, and the street furniture
  a real plaza is full of: **KERB** (three parking blocks in a row), **PLANTER**, **BENCH**, **CONE**,
  **CAN**. The bag is **weighted** now (`pickParkProp`; a prop's `w`, 1 unless it says otherwise)
  because a uniform draw from seventeen makes a cone exactly as likely as a six-unit hubba, and the
  plant chance goes 0.55 → **0.72** — measured, **334** boxes in a 112-unit window and **91** in a
  44-unit one, at **58.8–60.8 fps**. `PARK.props` is published on the debug object next to the pieces.
  **The landmarks:** **THE DEEP END** (a second bowl, rx 20 / depth 18 → tan 1.8, **61°**, rim dead
  level) and **THE VOLCANO**, the only piece that is a dig AND a build-up — a dome (`h·(1 − q²)`,
  measured 41° at the foot, flattening as it climbs, so it is runnable all the way over) with `crater`
  0.40 of its radius cut back out (`depth·(1 − (q/crater)²)`): a 12.6-unit ring of mound around a
  3-unit pit whose walls measure tan 2.23, **66°**. It wears rust stone of its own (`PARK_VOLC`, near
  opaque over the ring, near black in the crater) so it can be named from two plazas away. **The three
  bugs, all found by reading the pieces back off the live chunk list rather than by eye:** (a) **the
  pool liner was INVERTED** — `1 − smooth01(1 − q²)` is 0 at the floor and 1 at the coping, so every
  bowl and pipe in the park was pale at the bottom with a dark ring at its lip, the exact opposite of
  the comment sitting above it since session 206; it is `0.6 + 0.4·(1 − smooth01(q²))` now. (b) **the
  `stairs` landing was a NEGATIVE box** — depth `3.2 − n·sd` = 3.2 − 5.9 = **−2.7**, a box whose far
  face is behind its near one (a negative AABB, which the occluder grid sees as a hole rather than a
  landing); it is `3.2 − (n·sd − 3.05)` = 0.35. (c) the volcano's own first cut threw a
  `ReferenceError: q is not defined` out of `parkGroundColor` on every ground build — caught by the
  live console before it shipped. Verified after: **0** boxes with a non-positive extent across
  **2,467** sampled from seven regions of the park, the camp still exactly flat, relief **−25.9 →
  +35.7 u**. See "THE SKATEPARK" above and the session 207 row in SPEC.md.
- **THE SKATEPARK (session 206).** The user's *"make me a new skateboard map and exaggrate it and make
  it with slopes and all kinds of stuff"*. A **fourth world on `K`** (`settings.world === "park"`), and
  it is a generator of its own in `world.js`, not a variation on the field. **The slopes are the map:**
  a 64-unit lattice of dead-flat plazas, each at its own whole-riser height (`PARK.lift` 12, ±36 u of
  relief), with everything between two plazas a ramp — the S-curve `parkBlend` holds 0.54 of the cell
  flat at each end and puts the whole rise in the middle, so a deck is genuinely flat (furniture stands
  on it) and a ramp starts and ends level. Measured on the drawn field: **31 / 51 / 61 / 68°** for rises
  of one to four risers, **44 %** of neighbouring pairs dead level, relief **−25.9 → +35.7 u**. The
  deck field's frequency was the whole difference between a park and a hill: at the first cut
  (`fbm2(u·0.17)`) **66 %** of neighbouring plazas were the same height and the tallest transition in
  the map was **40°**, which is not *"exaggrate it"* — at **0.40** the same map has 68° ramps in it.
  **Three landmarks**, authored (`PARK_FEATURES`) because a lattice alone is banks and hips: a round
  **BOWL** (46° walls, rim dead level to `min = max = −12.00`), a long **PIPE** pool (58° lips,
  cross-section `0 → −16 → 0`), and a **SPINE** built UP rather than dug in (75° at the crest) — each
  flattened into its own plaza (`apron` 22, measured on the SHORT axis so a pool gets a long run-up at
  each end). The spine was narrowed from rz 15 to **11** because at 15 its cross-section read as a
  rounded dome; at 11 it is `−12 → −0.75 → +8 → −0.75 → −12`, a crisp crest. **And all kinds of stuff:**
  rails, ledges, funboxes, pyramids, hubbas, stair sets and blocks, planted at most one per 8-unit cell
  and ONLY where the ground under the prop's own footprint bends less than 0.22 — the placement rule IS
  the height field — with one override, the **run-up**: no furniture inside a set piece's apron or a
  capsule of `PARK.lane` 46 around its rim, because measured with a prop in that lane a **14 u/s** run
  at the spine stopped dead **45 units short** of the ridge. Riding it, measured live: the board rolls a
  36-u ramp **6 → 27.6 u/s** and hits **30.9** on the next drop; a body standing on a 51° face pushing
  uphill **slides 12.4 u back down**; 14 u/s at the spine climbs **10.2 of its 20 units** and rolls back;
  **59–60 fps**. See "THE SKATEPARK" above and the session 206 row in SPEC.md.
- **THE FILE THAT CANNOT LOSE ITS HEAD (session 203).** The user's *"THIS ERROR KEEPS HAPPENING EVERY
  TIME I SAVE OR REFRESH PLEASE FIX IT"*, over `TypeError: Cannot read properties of null (reading
  'width')` at `createPS1Renderer`. Session 202 had taught the page to REPAIR the damage; session 203
  read the store's own copy with `fetch_generator("adapt-")` and found it was **exactly
  `good.slice(501)`** — the first 501 characters gone, the cut landing mid-comment right after a
  newline — which proves a save can PERSIST the loss, so repairing it was never going to be enough.
  **The surface is gone instead.** `index.html` was 242,641 chars: the whole DOM in the first 39,515,
  then ONE 203,004-char `<style>` with two base64 faces inside it (one of them an 88,401-char line),
  then the module tags. It is now a **ten-line shell** — an empty `#game`, a `<link>` to
  `src/game.css`, and the module tags — with the markup in `src/gameui.js` (`GAME_MARKUP`, extracted
  verbatim; it is static HTML, verified to hold no pjs brackets) and the stylesheet in `src/game.css`.
  `gameui.js` is `main.js`'s first import and puts the shell back if a cut takes any of it, with every
  element that survived put back in its own place (live wins), and `src/hudmarkup.js` — session 202's
  HUD mirror — is **deleted**, because the mirror is the whole DOM now. **Verified** by loading eight
  deliberately damaged copies: the shell minus its comment, minus `#game`, minus `#game`+link, minus
  `main.js`'s first tag, and **50 characters long (only the tail tag left)**, plus the full old file
  (healthy: no-ops) and **`good.slice(501)`** — all eight boot with the renderer on `#view`, every id
  exactly once, `game.css` applied (`#game` background `rgb(10, 12, 17)`) and the canvas at the
  window's size. A/B'd against the old 242,641-char file on a healthy load: **pixel-identical**.

- **THE BAKE THAT HIJACKED THE GAME, AND A BIGGER DECK (session 201).** The user's *"everytime a
  refresh the same bug happens and also there 2 dummies at the start of the map and the skate board
  code is not finished and make the skate board bigger and also my camera freezes at the same angel
  when i walk a bit ... i walked a little then suddenly my character goes to the spawn point and 1
  extra dummy spawns and my camera freezes to a same postion"*. **(1)** Three of those sentences were
  ONE bug, and it was the editor's own icon bake. `beginPlay()` SCHEDULED it (session 186), so it ran
  about **1.5 s AFTER PLAY**: it took manual mode and drove the sim itself, STAGED the body and the
  lens (writing the rig's yaw and calling `respawn()`), and its cleanup emptied `enemies.list` WITHOUT
  removing the groups from the scene. That is the report in order — the body teleports to SPAWN, the
  leaked dummy is still standing while a fresh one spawns beside it (**two dummies**), and
  `setManual(false)` never restores `mouseLook`, so the mouse is dead and the camera **"freezes at the
  same angle"**. It runs at **BOOT** now, behind the title card, before PLAY is possible
  (`runEditorIconBake`), and a PLAY taken mid-bake is HELD in `autoIconsPlay` rather than swallowed.
  Verified from a cold load: PLAY, then 8 s of walking — **0** teleports, **1** dummy, `mouseLook`
  true on **300/300** frames, scene child count flat. **(2)** The deck is drawn through ONE
  `BOARD_SIZE` (**1.5**), scaling about the mesh's ORIGIN — the deck's top face, the plane the feet
  stand on — so the solved stance is untouched and the parts cannot drift out of proportion. The
  ride's height is then re-TAKEN off that mesh's box: **-0.130 → -0.195**, so `P.BOARD_LIFT` is
  **0.195** and `BOARD_ROAD` is written as the DIVISION (`0.195 / 1.351`) instead of a literal, so the
  two can never disagree. Measured riding: the deck's box sits **0.000** on the road once the mount
  settles. **(3)** What "the skateboard code is not finished" actually was: its SILENCE.
  `tickRideState` already claimed *"the HUD names the one that just landed"* and nothing did. There is
  a mint `#trickEl` tag now (named off the `trickland` event, held by `TRICK_HOLD` 1.5 s, and the BOMB
  names nothing because it is not one of the table's tricks), the state label reads **RIDE /
  POWERSLIDE / THE BOMB** (the bomb ABOVE the air line, since it is airborne for all **14** frames of
  its life), `hintText()` has the deck's own lines, and the KEY WALL and the touch key list mention
  the skateboard at all for the first time. See "THE SKATEBOARD" above.
- **A DECK FOR THE STREET (session 200).** The user's *"add skateboard and make me able to get on it and
  do flips with it and stuff u can take animations from the marketplace if you have to but make the
  slide mech and dive and all the stuff unqiue for it not the same make able to get on it by pressing
  E"*. A new PROP, and the last sentence is the design: the board's `SHIFT` shares nothing with the
  on-foot slide and its `F` nothing with the flying dive, so `player/board.js` is **three STATES** and
  not three re-skins. In one line each: **(1)** the board is an ordinary `drop` taken with **`M2`** and
  RIDDEN with **`E`** (the brief's own key), and mounting **PARENTS the deck into `tiltG`** — the only
  prop in the game that lives inside the rig; `P.BOARD_LIFT` is **0.13**, MEASURED off the mesh (the
  wheels hang 0.130 u under the deck — **0.195 since session 201 drew the deck 1.5x bigger**, see the
  bullet above), not chosen — it was 0.15 and the whole ride floated 0.02 u;
  **(2)** the ride has **no throttle, only a PUSH** (1.70 u/s a kick, 0.30 s apart ≈ **3.3 a second**)
  and the run's `MAX_SPEED` cap is LIFTED for the whole of it, because a hill is what takes a board
  fast; **(3)** `bslide` is a **BRAKE** (16-26 u/s², the deck sideways at ~60°, steerable) and `bbomb`
  is a **dive thrown at the deck** (1.55x gravity, travel GROWN, the one landing that keeps its speed,
  `BBOMB_LAND_KEEP` 0.92); **(4)** the stance is solved foot by foot off the rig — the pelvis a full
  QUARTER TURN across the deck (`BOARD.yaw` -1.5708) so the model's own ankle stand-off spreads the feet
  along it and the solved roll is **0.000 rad front / 0.019 back**, `hipY` **0.905** = a 48° knee — and
  the first solve was off by one ARGUMENT (`hx` missing from `boardLeg`'s head while all three call
  sites passed it), which threw both legs sideways at a roll of **-1.706 rad**; **(5)** a MISS is now a
  RULE — an OLLIE can never miss, nor anything thrown from a standstill, only a SPIN trick thrown at
  speed that lands all but stopped. See "THE SKATEBOARD" above and the session 200 row in SPEC.md.
- **A NEW HANG, A REAL LEAP, AND A QUIETER WALL (session 199).** The user's *"the wall climb idle
  animation looks bad delete it and make a new one from scratch also and take heavy inspiration from
  the wall climbing animation and make sure it looks good and the wall climb jump animation the leap
  looks meh fix it up a little and the vfx for the climb it too much just change the sound sfx for the
  climb"*. Four things, all on the wall, and the two big ones are documented at length above ("The
  parked climb is a PARK of the climb clip", "The skip leaps like the pad", "The climb's grip has a
  VOICE", "The climb sheds ONE puff now") — read those before touching the climb's pose, its hop or
  its sound. In one line each: **(1)** the hang is `CLIMB_PARK`, a frame of the CLIMB CLIP
  (**phase 0.967**) with all four limbs walked onto the stone (stand-offs **-0.014 / -0.036 / -0.003 /
  +0.009** rig units), solved by `poseClimbPark`, replacing the deleted hand-authored `CLIMB_REST` /
  `poseClimbRest` / `wallFootDrop` / `readClimbHand` / `climbRestL` / `restL` machinery; **(2)** the
  leap wears its own `CLIMB_FLY` because **`POSEX` 0.8 made session 181's "overhead" arm 8° above
  horizontal**, and it now squares `hips.rotation.x` (the clip drives it to **-0.62 = 35°**);
  **(3)** the climb's VFX went from **~2 puffs + ½ chalk ring + 12 trickle-puffs a second** down to ONE
  faint puff per HAND contact; **(4)** the climb's sound went from **9.8 ticks/s of doubled hiss**
  (a beat read AND a leftover 0.24 s timer) to one door at **5.5 ticks/s**, three layers deep and
  voiced per contact index. See the session 199 row in SPEC.md.
- **A HELD SHOT, AND THE BOOT THAT DELIVERS IT (session 198).** The user's *"add a better ball shoot
  animation and make shooting the ball chargeable"*. Two things, and the second re-times the first.
  **(1) THE SHOOT IS AUTHORED NOW.** The shape was the baked Mixamo clip `Strike_Foward_Jog` slerped
  through `SHOOT_Q` (rotations only, the 16 `ACTION_BONES`, premultiplied per key to cancel the clip's
  own pelvis yaw, hip translation dropped, one window of it keyed by `tools/action-bake/`), dispatched
  from `poseBallAction`. All of it is deleted — `SHOOT_Q`, `SHOOT_KEYS`, `SHOOT_SECONDS`,
  `SHOOT_RELEASE`, `_actQ`, `actionTables()` — and **the game now fetches no clip at all**; the bake's
  own output stays in `src/tools/action-bake/` as the record of the two shapes the game used to wear.
  What replaces it is `SHOOT` in streetwear.js: a **six-beat table** (SET 0.00 / PLANT 0.22 / COCK 0.44
  / RELEASE 0.62 / FOLLOW 0.80 / SETTLE 1.00, first row and last row the SAME pose, so the layer comes
  on and goes off with nothing to hide) of **26 columns** — hips `[dip, yaw, roll]`, trunk
  `[fold(+), twist, roll]`, head `[pitch(+), yaw]`, each ankle's `[fwd, up, sole, splay]`, both arms'
  `[upX, upZ, elbow, twist]`, the grip — every one the same signed channel `poseRun` / `poseArmAngles`
  already use, so the strike is tuned in the vocabulary of the throw and the slam. `SHOOT_SIDE` is −1
  (the rig's `...L` bones, i.e. **his own right foot**). **`poseShoot` is the only shape in the ball
  family that is not the six-column beat writer**, and `poseBallAction` dispatches `"shoot"` to it.
  **(2) THE BOOTS ARE SOLVED ONTO PLACES, SO THE STRIKE IS AIMED AT THE BALL.** `poseShootLeg` runs
  the two links off `legIK(fwd, up − hipY)` from the foot's own target rather than from joint angles and
  writes the sole the RUN's way (`F.rotation.x = sole − ik.thigh − ik.knee`, the foot's pitch in the
  hips' frame, so a flat foot is flat whatever the knee does), with `hipY` the height the pelvis is
  ACTUALLY at. That is what lets the RELEASE row aim at the ball's own place — 0.62 fwd, a radius up,
  deliberately further than the leg can reach so the leg is extended AT it — with the last of the gap
  closed by `poseStretchChain` on the striking leg (`kf` 1.00 → **1.18** at 0.60). MEASURED on the live
  rig off the deck: the striking boot's AABB closes to **0.043 world** of the ball's centre at phase
  **0.563**, and the ball's launch place lies inside the boot's box from 0.563 through 0.685 — so the
  launch fires on the boot's ARRIVAL (**`SHOOT.release` 0.56**, which IS that measurement) rather than
  on the table's own RELEASE row at 0.62, which fired a frame or two after the boot had swept past.
  `SHOOT_BALL_UP` is `PROP_ROLL_R.ball`, so the target's height and the ball's middle are the same
  number by construction. Two cautions for whoever tunes it next: the rig is scaled **1.351**, so an
  authored rig-unit target and a world measurement never read alike (the contact above is a world
  measurement); and a normal render of this character is a black outfit against a dark world, so a
  montage of it LIES about the pose — measure in the body's frame instead (at the COCK the head sits
  **0.00 u** forward of the hips with the trunk tipped **0.1°** BACK, i.e. a deep coil and not the fold
  it looks like). **(3) THE BUTTON IS A HOLD.** M1 with the ball at his feet used to fire the strike
  outright. `shootBegin` now only WOUNDS IT UP: `tickShoot` runs `ballPhase` to the shape's COCK beat
  over `SHOOT_WINDUP` 0.24 s and then **STANDS there** — the shape's clock stops while the button is
  down, so a held charge is a held POSE, not a slow-motion swing — while `ballCharge` fills over
  `SHOOT_CHARGE_T` 0.75 s. **The strike is the button COMING UP**: `releaseShoot` freezes the power
  (`powerOf` = `SHOOT_POW_MIN` 0.12 through the same smoothstep as everything else, so a tap is a
  genuine pass and the last of the hold is the expensive part), sets the swing's rate from it
  (`SHOOT_SWING_MIN` 0.20 s to `SHOOT_SWING_MAX` 0.34 s, always measured from the phase it had actually
  reached, so a late release is not also a slow one), and re-checks the ball is still inside
  `BALL_STRIKE_R` 2.2 — a swing at a ball that has rolled off is a **WHIFF** that plays out with
  nothing under the boot rather than dragging a ball in. `shootLaunch` scales speed and loft by the
  power (`SHOOT_V_MIN` 9.0 → `SHOOT_V_MAX` 24.0, `SHOOT_UP_MIN` 2.2 → `SHOOT_UP_MAX` 4.8, against the
  single 15.5/3.2 it used to do regardless of the press), adds a dust puff and a rig shake above half
  power, and raised the ball's `angMax` **70 → 92** (24 u/s on a 0.28 radius is 86 rad/s of roll, and a
  struck ball rolls without slipping). MEASURED end to end off the deck: a two-frame tap → power 0.131
  → **9.5 u/s** at 2.1 loft; 0.25 s → 0.375 → 14.9 at 2.7; 0.50 s → 0.797 → **21.3** at 3.8; 0.75 s and
  1.20 s → 1.00 → **24.4** at 4.4, i.e. the band caps where it should, and every launch lands inside
  the contact window (0.563-0.591). A ball YANKED away mid-wind-up CANCELS the shot (phase walks home
  at `SHOOT_UNWIND_RATE` 2.6; measured charge 0, no launch, phase back to 0) — honestly reachable
  because the assist holds it closer while a wind-up is live (`BALL_TOUCH_AHEAD_CHARGE` 0.50 against
  the run's 0.72, since a charge is a whole second of standing on the ball). **(4) THE HOLD SHOWS
  ITSELF.** `SHOOT_BUILD` deepens the coil with the charge — another 7.5 cm of dip, +0.07 of pelvis
  wind, −0.07 of shoulder twist, −0.05 of fold, −0.05 of splay, −0.22 of both elbows — keyed off the
  shape's own clock with `smooth01` ramps at BOTH ends of the hold, plus a `sin(clock·21)` tremble on
  the trunk's roll and the head's yaw: a loaded body, not a still. And the charge wears the SAME
  in-world meter the wall pull has: `ClimbMeter.update` gained an optional **`over` = {show, charge,
  lift}`** which, when given, is the whole of what the meter is drawn from (the climb's own fields are
  not consulted at all — climbar.js), painted in the ball's own colour off `ITEM_DEFS.ball.color` and
  lifted `BALL_METER_LIFT` 0.98 so it stands beside the body like the climb's. The prompt asks for the
  hold — `[M1] SHOOT (HOLD TO CHARGE)` — because a player who taps will otherwise never find the rest
  of the band. **(5) AND A CHARGE TAKEN AT A RUN DOES NOT SKATE.** The shape's coil is a plant — one
  boot nailed to the deck, the other drawn back off it — and that is a lie the moment the body is
  moving, since a charge is up to a whole second of standing on the ball. MEASURED before the fix: at a
  run the striking boot's world position tracked the body frame for frame (the body 4.99 → 3.07 while
  the boot went 5.20 → 3.67), i.e. both feet sliding with the man. So `poseShoot` takes a **`lower`
  weight** — how much of the HIPS AND LEGS the shape owns — which gates `poseHipY`, the hips' yaw/roll
  and both `poseShootLeg` calls together with the leg's stretch. Gating the hip height WITH the legs is
  not tidiness: a hip written by this shape over another pose's legs drives those feet through the deck,
  so the lower half has to move as one piece. `inventory.js`'s `legWeight()` is a plain speed ramp,
  **`SHOOT_LEG_STILL` 1.6 → `SHOOT_LEG_RUN` 4.5 u/s** (whole shape standing, legs left to the run at
  speed), so at a run the coil reads in the trunk, the head and the arms and the feet keep striding.
  The handover is asymmetric on purpose: **`SHOOT_LEG_TAKE` 0.06 s back to the shape** when the button
  comes up (the whip cannot wait for its leg) and **`SHOOT_LEG_GIVE` 0.20 s away from it** (a plant
  dissolving into a stride is a step, not a cut). MEASURED after: the charged run's boot swings
  **0.76 world relative to the body**
  against the plain run's 1.04 — it was pinned before — and every standing number above is
  bit-for-bit unchanged. A charge taken at a FULL sprint still cancels partway, and that one is not
  new: the assist's own `BALL_TOUCH_MAXV` 11 cannot keep a ball with a body outrunning it, so the ball
  leaves `BALL_TOUCH_R` and the wind-up's cancel fires.
- **TWO WAYS OVER, AND DONE BY THE WALL (session 197).** The user's *"make the vault has only front
  flip animation and jump over animation and make it get done before the wall not when i direnctly
  touch the wall and make it fluent and it doesnt have to be super fast and snapy make it match the
  palyer speed but faster"*. Three things, one move. **(1) TWO STYLES, NOT FIVE.** `VAULT_KIND` is
  `{ SPEED, FRONT }` — the hand-plant sweep the user calls the **jump over**, and the **front flip**
  — and the side flip, the handstand and the cartwheel are deleted with their poses and their
  `vaultTurn` branches (a style that can never be picked is a style nobody can see break).
  `vaultPickKind` is an even coin that cannot repeat, which with two styles comes out as a strict
  alternation (measured 1,0,1,0,1,0,1,0,1,0 over ten picks). **(2) IT IS DONE BEFORE THE WALL.**
  A flipping style used to turn over the WHOLE crossing, which left the body still coming round at
  the far side and put the end of the spin on the drop. The turn AND the tuck are both spent by
  **`VAULT_SQUARE` 0.62** (streetwear.js: the front flip's `kf` reaches one revolution there and
  holds it to the landing, and `poseVaultFront`'s tuck is out on the same beat). 0.62 of the clock is
  **68 % of the crossing's travel** (`k`'s position is its smoothstep, see `tickVaultState`), so the
  square-up lands **0.03-0.14 world before a rail's far face** (MEASURED over a spread of crossings:
  approaches 1.2-4.0 u, speeds 7-22 u/s, a 0.6 rail and a 1.4 crate, catches from a 0.42 to a 0.81 gap) and always
  while the body is still at the APEX — the vertical holds its plateau to 0.74 of the clock and only
  then drops (`VAULT_DROP` 0.26), so the WHOLE descent is walked out square and the last third of the
  crossing is an ARRIVAL, not the tail of a flip. Do not retime one of those two without the other: a body that is square
  over a tuck still tucked is a turn inside a standing pose. **(3) THE PACE IS THE RUN'S.**
  `startVault` crosses in `d / (speed × VAULT_PACE 1.25)` seconds — a quarter quicker than the body
  arrived — so a jog gets a fluent vault and a sprint a fast one (measured 0.316 s at a 7 u/s
  arrival, 0.170 s at 13, 0.193 s at the 10.9 a SPRINT into a rail arrives with, and the landing
  still comes off at `VAULT_EXIT`: measured 10.9 out of 10.9 on that held run).
  `VAULT_MAX_DUR` 0.30 -> **0.60**, which is the point rather than a detail: the old 0.30 ceiling
  turned every slow vault into a fast one (a 6.2 u/s run crossed at 9.8 u/s) and THAT is the
  *"super fast and snapy"* the user was feeling. `VAULT_MIN_DUR` 0.12 catches only a body arriving
  over ~17 u/s at a shallow rail (more at a deeper box), so neither clamp is felt at any speed a
  run can reach. `VAULT_LAND` 0.30 -> **0.12**
  ends the move AT the box rather than a stride past it.
- **THE WALL RUN PLANTS ITS HAND (session 196).** The user's *"make the arm thats next to the wall
  still when im wall running"*. The wall run is the run cycle plus ONE thing — the wall-side hand,
  solved onto the plate by `wallHand` — and that hand was the part of the pose that moved. **(1) The
  drag is gone:** the plan's `along` rode the run's OWN arm swing (`WALL_HAND.slide` 0.17 rig each
  way, through `runCurve(RUNC.swing, …)`), so the palm **swept up and down the face once per stride**,
  in step with the pumping arm on the free side — a second, competing loop. `along` is
  `WALL_HAND.fwd` now, and the `slide` / `swingMid` dials are gone from the table. **(2) The plant
  had to be made REACHABLE**, because a plan the arm cannot reach is a plan `wallHand` CLAMPS, and a
  clamped hand leaves the plate: written low (`up` 0.10, just above the hip) the hand sits at the far
  corner of the arm's own reach — the shoulder stands ~0.25 world further out from the face at the
  far end of the stride than at the near end and there is no slack to spend it with. `up` is **0.18**
  now: still below the shoulder, with the reach to hold the contact for the whole stride. The
  stand-off is still solved off `frame.dFace`, so the body's own press and bounce are absorbed by the
  elbow and the palm stays put. MEASURED on the live rig over real wall runs (solved frames only,
  `wallPose` 1.000, four runs): the palm's travel along the face fell from **0.286 world a stride to
  0.042**, and its stand-off from the plate from **0.187-0.242 to 0.187-0.190** — it used to pop ~5 cm
  off the stone once per stride (the clamp) and now holds a **2 mm** range. The whole arm's own swing
  over the run is **17-18 deg** against the free arm's **76**, and the FOREARM's came out lower than
  before (18.5 -> 16 deg). Two rejected alternatives, both measured: a CONSTANT plan (`dn` not solved
  off `dFace`) lets the hand ride the body's own stand-off sway — **13 cm along the wall's normal** —
  and the elbow has to spend it anyway; and squaring the run's stride twist out of the trunk before
  the solve (x 0.25) halves the arm's direction swing but deadens the run's upper body on the wall,
  and the ELBOW's own flex turns out to be the body's *vertical bounce* rather than the twist, so it
  buys stillness where it does not matter.
  The run cycle, the legs, the bank and the free arm are untouched.

**A WALKING BLOCK IS THE TWO-HANDED ONE (session 195).** The user's *"make the block animation when
  im walking slowly normal 2 hands block make the one hand bash block thing only when im running
  fast"*. The block wears one of two shapes: the boxer's **two-handed guard** (both forearms up in
  front of the face, `blockArm(0)`) or the **bash** (the right forearm up ACROSS the eyes with the
  left left to the run, `blockArm(1)` — the charge's own arm). Which one was picked by `runBlend`,
  and `wantRun` is `(speed - 0.4) / 1.2` clamped — **full at 1.6 u/s**, a slow walk. So the guard
  lost its two-handed shape the moment it took a step: standing still was the boxing block and every
  walk was the bash, which is exactly what the user is describing. It is picked by **SPEED** now.
  `solveBlockPose` (`player/block.js`) hands `poseBlock` a *new* blend off the new pair of constants
  **`BLOCK_RUN_LO` 3.4 / `BLOCK_RUN_HI` 6.4** — a plain ramp across that band, which **straddles the
  guard's own top speed** (`BLOCK_WALK` 3.2) so the whole of a walking block is inside the two-handed
  shape — and the shell is `poseBlock`'s **eighth argument** (`bodyRun`), because the two numbers are
  answers to two different questions. `moving` is now *which ARM SHAPE the block wears* (so it also
  carries the LEFT arm's own weight, `guardK = 1 - moving`: both hands stay up at a walk), while
  `bodyRun` is *how much of the run cycle is carrying the figure* — and that is the one that stands
  the block's body channel down (`eb`), so the session-90 bargain is untouched: a running body is
  still the run with one arm changed, and the charge's fold is still handed to the cycle the moment
  the legs are. A CHARGE is the bash at ANY speed regardless — `poseBlock` takes `max(rush, moving)`
  for that arm — so the charge reads exactly as it always did (a charge broken out of a standstill now
  also keeps its folded body for the first beat, which is when it used to be swallowed by the run
  blend). Verified on the live page by patching `poseBlock` and reading its arguments with the state
  driven by real input overrides: a standing guard `moving 0 / bodyRun 0 / rush 0`; a **walk at
  3.2–3.34 u/s `moving 0`** (two hands) with `bodyRun 1` (the legs still the cycle — unchanged); a
  forced speed sweep `1.45 → 0`, `4.12 → 0.241`, `6.73 → 1`; and a charge `rush 1`. Captured from a
  fixed front camera: standing and walking both show **both fists up in the boxing guard**, and the
  fast body shows the single arm up **across the eyes** with the other arm down. The charge's own
  numbers, the walk speed, the shove and the catch are all untouched.
- **A FREE FALL LANDS IN A ROLL, NOT A CATCH: the skyfall's roll-out (session 194).** The user's
  *"add better landing animation for free fall make it when i free fall make a new animation and make
  it i roll from the free dont make have a start up like it is now just make it i land and i do a
  little parkour roll then get on my feet"*. The landing a skyfall wore was the standing **absorb**
  (`poseLand`: weight onto the heels, both arms out for balance) — a catch, and exactly the "start up"
  the user is rejecting. A body coming off a forty-metre roof has far too much behind it to catch, so
  it **rolls**. The roll is NOT new geometry: it is the running lunge's own **MISS ROLL** — the tuck,
  the whole-revolution turn, the `LUNGE_BALL_*` ball the rig is placed on (MEASURED, session 89), the
  `riseAt` handover onto the feet and its true-vertex deck clamp, all untouched — which the user has
  never seen because the lunge itself has been **unwired** since session 89. The new entrance is
  `startFreeRoll` (**player/lunge.js**), and its whole job is the two words of the brief. **"No start
  up"** is `lungeHopT = -1`: phase 1's little leap (the beat a pounce lands on before its roll opens —
  `updateLunge` only holds the roll while `lungeHopT > -0.25`) is skipped, so the roll's clock runs
  from the frame the feet touch. **"Roll"** is the drive: the fall's own horizontal is carried on the
  line it was travelling (`facing` from `vel`, kept if it was under 1.2 u/s — a near-vertical drop has
  no heading worth turning for, and a roll that cannot go forward is a crouch) and floored at
  `FREE_ROLL_MIN_SPEED` **4.6**, with the roll's own `LUNGE_ROLL_FRICTION` spending it exactly as the
  miss roll always has. It is entered from `tickLanding`'s non-slam branch (**player/landing.js**) on
  the same frame the thud, the dust and the `land` event fire — a body that rolls instead of catching
  still HITS the deck — with the brace, the pose clock **and** the whole-rig `squash` all stood down
  for it (the ball is a measured shape; see `startLunge`). The gate is `FREE_ROLL_MIN_IMPACT` **0.30**
  off `landImpact`, so a step-down, a hop and a soft arrival still take the ordinary absorb, and two
  things still outrank it: a **held SHIFT** stays a slide (the player's own answer to a fast landing —
  and the slide branch below is kept off a roll by the state it leaves behind), and a **dive or a
  slam** thrown out of the fall never reaches it at all (`tickPlunge` stands the skyfall flag down
  before either). NEW: `landedSkyfall` (set in `tickSkyfall`, read by the landing — this tick runs
  ahead of `tickLanding`, so the read is guaranteed even on the frame the flag itself is spent) and
  `freeRoll` (the HUD's own tell: the two `state === "lunge"` labels would otherwise call a landing a
  "LUNGE — MISS"), plus `FREE_ROLL_CAM_DROP` **0.55** — the chase anchor comes down with the ball off
  the roll's own weight (`lungeBall`), so it is exactly 0 on the frame the fold opens back out. The
  new `freeroll` event gets its own scuff and dust in main.js; the landing's own ring/thud/dust is the
  `land` event it already had. Verified on the live page: a drop from y 72 (terminal −26 u/s, 182
  frames) enters `lunge`/phase 1/`freeRoll` on the touchdown frame with `landImpact` **1.0**, holds the
  roll for **40 frames** (0.66 s), turns `grabFlip` a whole **6.28**, ramps `lungeBall` 0→1 over
  0.10 s and hands back to `ground` with `freeRoll`/`camDrop` both spent; the drawn body's lowest
  vertex keeps **0.03–0.25 u** of daylight over the deck for the whole revolution (no clipping); a
  3.5 u drop takes the absorb (`landPose` 0.95, no roll); a SHIFT-held skyfall goes to `slide`; and a
  dive and a slam both land exactly as before.
- **THE CLASH HAS A VOICE: the M1 lock's own FX (session 193).** The user's *"make m1 clashing has
  better vfx"*. The lock was the one fight in the game whose FX were borrowed and then abandoned: ONE
  burst off the shared `impact`/`ward` on the frame the two limbs met, and **nothing** for the whole
  shoving match — seconds of a silent, motionless stalemate with a meter in the corner, so a mash and
  standing still looked identical. Three beats, all in `effects.js`, built round the one thing that
  separates a clash from every other contact: the limbs meet on a **LINE**, so the FX live in the
  plane SQUARE to it. **The meeting** (`clashMeet`) is the biggest star in the game (two flares, the
  second rolled an eighth for 16 points), a cross of light through the point, two **VERTICAL hoops** in
  the meeting plane (the only vertical rings in the game that are not wall contacts), a wide deck ring
  (both are planted) and 28 sparks thrown both ways down the line plus a fountain up off it. **Every
  press** (`clashPress`) is a shove with its own snap, bar, hoop and cone — and the sides are told
  apart by **COLOUR** (the player's shoves gold, the body's cold white-blue), so the mash reads as a
  tug of war between two colours rather than one anonymous flurry. **The pressure** (`clashGrind`, rate
  0.09 → 0.04 s) is a hot halo at the contact that grows with the race, embers drifting out into the
  meeting plane **CARRIED down whichever side is winning**, a slow pressure hoop every third tick and a
  short crackle arc along the line. The release is per side: a WIN lets go upward, a LOSS is the body's
  fist arriving (the red strike an ordinary enemy punch is, plus the shock and the flash), a DEAD HEAT
  throws its sparks BOTH ways. The lock also turns the camera onto the pair's **FLANK**
  (`CLASH_ORBIT` 0.58 / `CLASH_PULL` -0.7 / `CLASH_AIM` 0.30 / `CLASH_RISE` 0.30, ramped over ~0.25 s
  and unwound by the wall-clinch `else` on the frame the state leaves): a clash happens entirely ALONG
  the line from the player to somebody else, so from the chase line his own back is the whole picture
  and the contact the VFX are about sits behind it. The contact itself is read off `clashWeapon` (the
  player's own weapon, which is exactly where the enemy's fist is solved onto — see `clashContact` in
  main.js), so the sparks land on the part of the rig the lock is actually about. Verified end-to-end
  on the live page with REAL M1 input (a forced lock driven through `setOverride`): 8 presses over 36
  frames moved `spam` 0 → 8 and the two meters to 0.68 / 0.26, and the meeting, the grind and the mash
  all read in capture; the lock's HIT/win/lose/break paths are untouched.
- **A WHIFF IS A FRONT FLIP ONTO THE PAVEMENT: skill 2's miss (session 192).** The user's *"make the
  miss animtion for skill 2 is that he does a front flip if he doesnt catch an enemy he falls on the
  ground like a ragdoll/stun for 0.67 seconds"*. The miss used to be a 35° fold over the player's own
  lap, unwound on the landing as he caught himself (session 152) — a stumble, not a fall. It is now
  one forward revolution that does not stop. **The air half** is `SCISSOR_MISS_FLIP` (**4.733 rad**,
  exactly 2π short of square by the lie angle) wound by `scissorMissFlipAt` over the leap's own
  ballistic hang (`scissorAirT` = 2·`SCISSOR_JUMP`/`GRAVITY` = **0.576 s**) — read off two clocks, not
  integrated, so the turn and the fall are one motion and the body is on its back exactly as the deck
  arrives; it stops one lie short of square on purpose, because a body that missed does not land it on
  its feet. **The deck half** leaves the scissor's phase machine entirely on the frame the ground takes
  it (`enterScissorMissDown` → `updateScissorDown`): `SCISSOR_MISS_DOWN` (**0.67 s**, the user's number
  and the twin of the enemies' `E.RAGDOLL_T`) wearing the game's OWN knocked-down body — `poseHurt`'s
  **`down`** for the flop (over `SCISSOR_MISS_SETTLE`) then **`getup`** for the rise (over
  `SCISSOR_MISS_GETUP`) — i.e. the exact shapes every enemy wears on its back. A lying body cannot be
  placed by the player's `pos` (which is his STANDING body), so `solveDeckClamps` gained a **BED**
  beside its net: the rig's lowest drawn vertex measured and the rig set on it, eased over
  `SCISSOR_MISS_REST_T` (**0.12 s**) so the hand-out from the air IS the flop (the enemies' own
  `restOnDeck` solve). The **camera comes down with him** (`SCISSOR_MISS_CAM_DROP`, **1.85 u** off the
  chest-height follow anchor — a downed body is a metre and a half below the point the chase camera is
  built around), and the standing **landing absorb stands down** for the whiff (`poseLand` is a
  standing body's catch; the thud, the dust and the shake still fire). Measured on the live page: the
  somersault **0 → 4.733 rad over 0.576 s**, the deck half opening at pitch **−1.55** with the lowest
  vertex on the deck at **0.000** throughout the lie (the correction easing **−0.28 → −0.56**), the
  rise unwinding to **0** — total miss **1.9 s** — and the **HIT** path untouched (hp **100 → 76**,
  neck held, thrown to `flight`, ending in `ground`).
- **THE RAGDOLL HAS A CLOCK: one number owns the whole loose phase (session 191).** The user's *"make
  the longest ragdoll animation is 0.67"* is now a single constant, **`E.RAGDOLL_T` (0.67 s)**, and
  nothing in the loose phase is allowed to run past it. (1) **The throw is capped to fit** — the pop
  on both ragdoll arming sites is `Math.max(vel.y, Math.min(pop, P.GRAVITY * E.RAGDOLL_T * 0.5))`
  (**11.055 u/s**, the launch whose apex-to-deck hang IS the clock), so a blast that used to lob a body
  for **1.63 s** now leaves the deck for at most the clock. (2) **The spin is exactly one turn** —
  `ragSpinFor()` ignores the lie and returns `-TAU * max(E.RAGDOLL_TURNS, ceil(left))`
  (`RAGDOLL_TURNS` 1.0), and the new `ragSpinTime()`/`ragSpinRate()` solve that turn over the hang
  that is actually left (`min(airTimeLeft(), RAGDOLL_T − ragT)`), so the body arrives flat no matter
  what it was launched from; it used to pick 0.75 / 1.0 / 1.5 turns from a coin toss. (3) **The tumble
  clock is real** — `update()` advances `ragT` in the flight branch and zeroes the rate at `RAGDOLL_T`,
  and `landed()` only takes a bounce skip if its hop ends inside the clock. (4) **A swing dies with the
  body** — the hit's early return clears `atkT`/`atkDone`, so nobody punches from the deck. (5) **Every
  stun owes a beat** — `standUp()` (which every reaction exit now calls instead of a bare
  `setState("idle")`) raises `atkCd` to **`E.STUN_RECOVER` (0.5)**, so a body that just got up waits
  half a second before it attacks. The non-ragdoll launchers (the uppercut's ~1 s hang, the slide and
  dive) are deliberately left alone.
- **The showcase camera measures the OPTIONS card and floors the eye to the DECK.** Two bugs in the
  same forty lines of `showcaseCamera` (main.js), found together in session 182. (1) The wardrobe
  close-up's eye was floored at an ABSOLUTE `Math.max(0.4, ...)` — which is only "just above the
  ground" in a world whose ground is flat at 0. The hills spawn you on the SUMMIT with everything
  downhill of it, so opening the wardrobe anywhere below y ≈ 0 left the eye pinned at 0.4 while the
  body went on down the hill (measured at the bottom of a valley: eye **20.18 u above** the body,
  pitch **83.6°** — a shot at the top of his head, which is what the user sent). It reads the deck the
  way `follow`'s own guard reads it now: the higher of the body's own feet and
  `world.terrainHeight` at the CAMERA's own spot. (2) The lens shift that keeps the body out of the
  panel has to ask `hud.optionsPanel` for its card — `document.querySelector(".optCard")` returns the
  UPDATE LOG's card instead (same class, earlier in the markup, `display:none` unless the log is
  open), whose zero rect made "the free side" the whole viewport and the shift **0 on every frame**,
  framing the body dead centre BEHIND the panel. Do NOT "simplify" either measurement back to a
  constant or to a document-wide query.
- **If `index.html` ever begins in the middle of a comment, its HEAD is gone and the game will not
  load.** The file's first ~900 characters are load-bearing: the viewport meta, `<div id="game">`,
  `<canvas id="view">`, then `#hud` / `#hudL` / `#dialBox` / `<canvas id="dial">` / `#rankEl`, and only
  then the air-combo comment. The first line of `main.js` past its imports is
  `getElementById("view")` + `createPS1Renderer(canvas)`, so a lost head is a null-canvas TypeError
  and a dead page — reported through `perchanceErrors` as `Cannot read properties of null (reading
  'width')`, NOT as a missing prop. It happened once (session 182: exactly **917** characters gone,
  saved that way) and was rebuilt from an older copy of the file; keep the head in mind first if the
  preview reports that error. **Session 183: it happened again, in the PAGE rather than the file** —
  `page_refresh` reported the reloaded page rendering 194236 characters against the workspace's
  240719, and the live page threw the null-canvas error plus a run of curly-block errors from CSS
  (`{ width: 10px; height: 10px; }`, `{ background: #0e1119; }`) — that signature means a `<style>`
  OPENING TAG was cut, so the engine tried to evaluate the CSS as template blocks. Both times a plain
  re-`page_refresh` fixed it and the workspace file was never touched (verify with
  `fs.readTextFile("index.html").length` before you believe the file is damaged). One `page_refresh`
  also came back "re-rendered slowly"; treat a slow or mismatched refresh as this, retry once, and only
  then suspect the code.
- **The options card hangs off the right edge, HINGED, and leans into the frame.** The overlay docks it
  right at every width (`justify-content: flex-end` + the `--optGutter` padding) and the card hinges on
  its own outer edge (`transform-origin: 100% 50%`) with `rotateY(-7deg)`, so the face looks at the
  middle of the screen and the INNER edge is the short one — the outer edge does not move a pixel
  (see "THE PANEL IS DOCKED TO THE RIGHT AND LEANS INTO THE FRAME" in `index.html`). It flies in from
  beyond that edge over-rotated (`optCardIn`) while `--comic-dim` — a 33 % black dim under a Ben-Day
  dot screen — fades up behind it (see "THE COMIC SCREEN" on `:root`). The animations restart on their
  own because the shut panel is `display: none`; do NOT move them onto a class written by js. Below
  560 px it is a full-width bottom sheet with no outer edge to hinge on, so it RISES (`optSheetIn`)
  instead. These rules must stay in step with `#game.optsOpen`, which `hud.showOptions`/`hideOptions`
  write: it hides the right-hand READOUTS (`#hudR`) and the phone's right-hand controls (`#actionPad`,
  `#lookPad`) and nothing else — the left column and the top-right BUTTONS stay (the buttons are
  controls, and they are the way back to the update log and to fullscreen), and the showcase camera
  reads the card's own box to frame the body in the room it leaves. The pocket editor's own stand-down
  is the separate `#game.invOpen` group; the log card wears all of it but does NOT stand the readouts
  down.
- **Two keylines, and the INK is which one you want.** `--key` outlines the HUD's light type;
  `--key-inv` is the same ring in white, for the surfaces that paint their type the near-black
  `#12161f` on the accent fill (`.hbtn.on`, `.chip.on`, `.optX:hover`, `.invBtn:hover`, `.qfoot b`,
  `.invGlyph`, `.obtn.primary`). Same WIDTH on purpose: `tagtext.js` reads a host's keyline off its
  first `text-shadow`'s offsets (`keyEm`), so the ink may be swapped but the offsets may not or a
  tagged host's tracking moves. The PLAY button (`.startBtn`) is deliberately NOT in that list even
  though it is written dark — the platform's own reset carries
  `button:not([disabled]) { color: inherit }` at specificity (0,1,1), which beats a single-class
  rule's (0,1,0), so its `#12161f` is dead and the word is light. Check the COMPUTED colour before
  adding a surface to the white-ring list.
- **A surface with swapped ink declares `--key-ring`, NOT `text-shadow`.** The letters of every NAME
  in this interface are separate tag spans (`.twl`, see `tagtext.js`), and a span takes its ring from
  the universal `:where(#game) *` rule directly — a direct declaration beats an inherited one, so a
  white ring declared on the button never reaches its own letters (measured: the box came out white
  while the letters stayed `rgb(7, 9, 12)`). `--key-ring: var(--key-inv)` on the surface works
  because custom properties DO inherit: every letter under it resolves the swapped ring, and toggling
  the state on and off takes the letters with it. A surface that says nothing takes the `--key`
  fallback.
- **The mobile interface is two gates.** `isTouch` is the DEVICE, `settings.touchUI` is the PLAYER,
  and `touchUIOn()` is both — ask that, not `isTouch`, and write changes through `applyTouchUI()`
  (see "THE MIX AND THE PHONE"). Only `setQuality`'s default and the touch bindings still read
  `isTouch` on purpose.
- **A new option is five edits.** `optionItems()` (the row), `applyOption`/`applySlider` (the
  behaviour), `DEFAULTS` + `resetDefaults`, `saveOptions`, and `loadOptions` — and if its value is not
  read out of `settings` at the moment it is used, it has to be pushed there too (VOLUME and MOBILE
  UI both are).
 A DEV MODE (block-language skill builder + dark test arena
  + 3D animator studio, across `src/dev*.js`) existed until session 168 and was then deleted, entirely,
  at the user's request: *"delete the entire dev mode stuff make sure you actually delete it not just
  put it on //"*. The files are gone, the DEV button is gone, the frame hook is gone, and there is no
  commented-out copy anywhere. Do not rebuild it or half-restore it without being asked, and remember
  `main.pjs` imports nothing at all now (the `ai-text-plugin` went with the animator's AI POSE).
- `src/` is served by relative path. Every three.js import goes through `src/three.js`.
- Colour management disabled; `preserveDrawingBuffer` intentional.
- The neon look is per-material and opt-in (`cel`, `emissive`, `rim`). The world keeps the plain PS1
  ramp. The character is untextured on purpose.
- The launch pad's arc is **solved at runtime** — never replace it with a fixed impulse.
- Destruction is memory-only and survives chunk streaming but not a reload.
- `chunk.pieces` is the live solid list; `chunk.boxDefs` is the generator's output.
- Crack decals are laid on the drawn mesh (`groundHeightAt`), not the height field.
- A crack's colour comes from the surface palette (`surfTop`/`surfDirt`), never the biome.
- Contact FX sample the surface (`World.surfaceColorAt`); the wind does not (it is air).
- A `Ribbon`'s tone is per SAMPLE — `setTone` before `feed`. `TRAIL_PARTS` order is load-bearing.
- The melee timings live in `streetwear.js`; the enemy's reaction poses are written AFTER
  `player.updateVisual`.
- **Never change the run cycle** when adding other animations.
- The character is faceless on purpose; only the chest print and shoe toes identify the front.
- Verify contacts **numerically**; the vision tool is unreliable on this dark faceless model, and
  will contradict itself. Render an isolated harness before believing a vision verdict.
- Prefer solved numbers over eyeballed ones for anything that touches the ground.
- The wall-run bank goes with the wall side *under* the player.
- **A pose is a full write, and a solve off a moving origin is a solve that moves.** Keep writers
  in a fixed order, one writer per channel per frame.
- **A quaternion-written bone keeps whatever the decomposition says.** A clip or a wall solve on a
  hinge (`legLower`, `armLower`, `hand`, the thigh) leaves values on axes no angle-based pose ever
  writes, and they survive the move and every pose after it. Reset them in `poseRun`'s block rather
  than in whichever pose happens to read them.
- **The neck's share is amplified ~1.5x ACROSS frames.** `poseNeckSplit` (`streetwear.js`) re-reads
  `neck ∘ head` as "what the pose asked for", which makes the split idempotent WITHIN a frame — but
  every pose re-AUTHORS the head each frame while the neck keeps the share it was handed, so the
  recurrence `T -> s·T ∘ h` settles at about `1 / (1 - s)` = **1.5x** the authored rotation (the
  head's own local rotation lands on the authored value and the NECK carries the rest). So a pose's
  head rotation comes out ~50 % larger in the WORLD than the angles say, and a constant read off the
  angles lands a head that is craning. Tune head constants against the live rig, not the arithmetic:
  `RUNC.headPitch` (session 172 — the run's face was riding 7 deg above the horizon on an 0.85 that
  reads as "most of the way to level") is the worked example. A pose that squares the neck itself
  (`poseClimbPark`) starts each frame from zero and is NOT amplified.
- **PS1 graphics, SSS animation** (the blockquote at the top). Do not simplify motion.
- **A camera must be written INSIDE the game's frame.** `rig.follow` runs near the end of `frame()`
  and `pres.render` reads the camera a line later; anything that sets `camera.position` from outside
  `GAME.step` is overwritten before it is ever rendered — write the camera inside the frame.

## Debug API

`window.GAME` exposes `player`, `world`, `rig`, `input`, `abilities`, `destruction`, `enemies`,
`adaptUI`, `skySys`, `wardrobe`, `gear`, plus:
`setManual(true)`, `step(dt, overrides)`, `setOverride/clearOverride`, `counters()`,
`lastEvents()`, `stateText()`, `biomeNow()`, `setQuality(n)`, `slowmo()`, `dive()`, `fall()`,
`pole()`, `vault()`, `fx()`, `hintText()`, `openOptions()` and friends, `loadCharacter(mode)`,
`setWorld`, `nextWorld`, `setTime`, `setMood`, `nextMood`, `bakeIcons()`.

The **skateboard's** live state rides on `player` (there is no `board()` accessor): `player.state` is
`"ride"` / `"bslide"` / `"bbomb"` while the feet are on a deck, with `player.trickKind` / `trickName`
(see `BOARD_TRICKS`), `player.bslideAngle`, `player.boardManual`, `player.boardPushPh` and
`player.trickSpd0`; the prop is `gear.ride` (while ridden) or `gear.boardDrop` (the loose one — teleport
it with `dr.pos.set(...)`, zero `dr.vel` first or it rolls away before `E` can reach it), and
`gear.boardInReach()` says whether `E` would mount this frame. Pose tuning lives at
`player.charMesh.userData.poseCfg.BOARD` (live-editable) with the solve hooks at
`player.charMesh.userData.poseRide` / `poseBSlide` / `poseBBomb`.

Handy pattern:

```js
GAME.setManual(true);
GAME.setOverride({ moveZ: 1 });
for (let i = 0; i < 60; i++) GAME.step(1 / 60);