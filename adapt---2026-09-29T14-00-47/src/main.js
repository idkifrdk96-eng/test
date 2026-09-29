import "./gameui.js";
import * as THREE from "./three.js";
import {
  createPS1Renderer,
  createPostPass,
  createSky,
  createBlobShadow,
  Presentation,
  settings,
  shared,
  syncMaterialSettings,
  setOutlineEnabled,
} from "./ps1.js";
import { World, biomeAtPoint, MAZE, HILLS, PARK } from "./world.js";
import { Grass } from "./grass.js";
import { Player, P } from "./player.js";
import { Destruction } from "./destruction.js";
import { Input } from "./input.js";
import { CameraRig } from "./camera.js";
import { HUD } from "./hud.js";
import { TrickScore, STILL_V, STILL_T, CHAIN_T } from "./trickscore.js";
import { TrickText3D, TRICK_COLORS } from "./tricktext3d.js";
import { AdaptUI } from "./adapt.js";
import { Sfx } from "./audio.js";
import { Effects } from "./effects.js";
import { Enemies, E } from "./enemies.js";
import { Abilities } from "./abilities.js";
import { Poles } from "./pole.js";
import { GearSystem, ITEM_DEFS } from "./inventory.js";
import { YardSigns, STATIONS } from "./yard.js";
import { SkySystem } from "./sky.js";
import { ClimbMeter } from "./climbar.js";
// ...and the SKILL ICON BAKER (see icons.js). Nothing in the game calls it: it is the tool that
// rebuilds the three PNGs in `src/hud/`, kept in the shipped source so the recipe for those assets
// travels with them (a retuned pose means re-running `GAME.bakeIcons()`).
import { bakeSkillIcons, autoBakeIcons } from "./icons.js";
import {
  wardrobeState,
  wardrobeOverrides,
  setWardrobeColor,
  applyWardrobe,
  resetWardrobe,
  repaintWardrobe,
  outfitList,
  currentOutfit,
  outfitName,
  setOutfit,
  nextOutfit,
} from "./streetwear.js";

// THE SHELL — see `src/gameui.js`. It is this file's FIRST import, so the DOM the game needs is on
// the page before any line below runs, and it rebuilds the shell if the editor's save path hands the page
// a truncated `index.html` (the platform's front-cut bug — "THE FRONT-CUT BUG" in README.md, the session
// 203 row in SPEC.md). Nothing below needs to know: by the next line, `#view` exists.

const canvas = document.getElementById("view");
const renderer = createPS1Renderer(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(61, 16 / 9, 0.12, 640);
const post = createPostPass();
const pres = new Presentation(renderer);
const world = new World(scene);
const player = new Player(scene, world);
// THE STAFF — the prop he can take off the deck and carry (see pole.js). Everything the body DOES
// with it is the player's (`P`'s `POLE_*` block in player.js, `poleHold` / `posePole` in
// streetwear.js); this is the prop itself, handed to the body so its right-click can find one and
// so a thrown staff has somewhere to live while it is away (see `Poles.mount`).
const poles = new Poles(scene, world);
player.setPoles(poles);
// The world's damage memory: what has been cracked, what has been broken off, and where the
// ground has been beaten down. `world.damage` is read by the chunk builder, so a chunk that
// streams back in comes back exactly as smashed as it was left.
const destruction = new Destruction(world);
world.damage = destruction;
const sky = createSky();
scene.add(sky);
const shadow = createBlobShadow();
scene.add(shadow);
// THE CHARGE METER (session 177 — see climbar.js): the wall pull's charge, drawn in the world
// beside the body rather than on the HUD, in the face's own colour.
const climbMeter = new ClimbMeter(scene);
// ...and THE BALL SHOT's own, on the same bar (session 198 — see `shootBegin` in inventory.js). Two
// charge readouts, one class: a hold filling a band and spent on the release is the same idea twice,
// and the user's own reason for the wall's applies to the shot's even more directly — *"make a meter
// next to the player in game not the ui"*. Its colour is the BALL's own (`ITEM_DEFS.ball.color`, the
// white of the shell — the one thing the charge is actually about) and it stands `BALL_METER_LIFT`
// above his feet, because a body holding a shot is standing on the deck where a climber's position is
// already at chest height (see the `over` argument in `ClimbMeter.update`).
const shotMeter = new ClimbMeter(scene);
const BALL_METER_LIFT = 0.98;
const ballTint = new THREE.Color(ITEM_DEFS.ball.color);
const BALL_METER_RGB = [ballTint.r, ballTint.g, ballTint.b];
const input = new Input(canvas);
const rig = new CameraRig(camera, player, world);
const hud = new HUD();
const tricks = new TrickScore();
let tricksRiding = false;
const trickText3D = new TrickText3D(scene);
// The interface's colour: sampled from the world around the player every frame (see adapt.js).
const adaptUI = new AdaptUI(hud);
const sfx = new Sfx();
const effects = new Effects(scene);
const skySys = new SkySystem();
player.sfx = sfx;
// The other side of the fight: the melee chain's targets. They are built lazily (one rig per
// frame, see enemies.js) so nothing here costs anything until the first frame of play.
const enemies = new Enemies(scene, world, effects, sfx);
player.setEnemies(enemies);
// The four meters behind the dial (see abilities.js): the style rank, the ultimate's charge, the
// three skill cooldowns and the overdrive window. Built after the player because it drives him.
const abilities = new Abilities(player);
// THE BAG + POCKETS (see "THE BAG + POCKETS" in inventory.js): the spawn duffel, the player's
// three pockets, the tetris editors and the E / TAB verbs. Built after effects/sfx (its impacts
// make noise and dust) and before the loop reads it.
const gear = new GearSystem({ scene, world, player, input, rig, sfx, effects });
// ...AND BACK THE OTHER WAY (session 200): the ride is the one thing the BODY hands to the GEAR. A
// board that shoots out from under a trick (see `bailBoard` in player/board.js) is a prop going back
// into the world, and the drops are the gear's — so the player is given the gear it can hand it to.
// Everything else the two share still runs through the player's own event list (see the board's
// `events` drain below), exactly as it always has.
player.gear = gear;

// THE TRAINING GROUNDS' SIGNS (see `YardSigns` in yard.js): the nameplates over the stations at the
// spawn, positioned in the world every frame. It writes into `#yardSigns` (index.html) and is fed
// the camera AFTER the frame's camerawork, so a label is always on the frame it was placed for.
const signs = new YardSigns(document.getElementById("yardSigns"), world, camera, player);

// THE MOVING GRASS (see grass.js): the hills world's own field of swaying tufts, streamed in tiles
// around the body. Built always, drawn only by the world that wants it (`setWorld` switches it),
// and one draw call whatever is in it — the brief's *"make sure it doesnt kill performance"*.
const grass = new Grass(scene, (x, z) => world.terrainHeight(x, z));

const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
// (`#interactPrompt` is read up here because the touch set-up below needs it, and it is looked up
// once for the same reason every other HUD node is: the element never leaves the page.)
const interactPromptEl = document.getElementById("interactPrompt");
if (isTouch) {
  input.bindTouch(document);
  input.touchActive = true;
  bindTouchExtras();
}
applyTouchUI();

// THE MOBILE INTERFACE'S OWN SWITCH (see `settings.touchUI`, its MOBILE UI row in `optionItems`, and
// `applyTouchUI`). It is TWO gates, and both have to be open:
//
//   `isTouch`          the DEVICE. Nothing here means anything without a touchscreen — a desktop
//                      never binds the pads (above) and never paints them.
//   `settings.touchUI` the PLAYER. This is the one the option flips, because a touch-capable machine
//                      is not always a phone: a laptop with a touchscreen boots with the stick and
//                      the whole button block sitting over the game, and until this option existed
//                      the only way out of them was to unplug the touchscreen.
//
// `touchUIOn` is the pair, and everything that used to ask only the device — the pad-hint wording,
// the pointer-lock calls, the start card — now asks this, so turning the mobile UI off really does
// hand the machine back to the mouse and the keyboard instead of leaving it half a phone. It is
// called from the boot above (before the saved option has been read, i.e. on the DEFAULT) and again
// from `loadOptions`, which is where a saved OFF finally reaches the page.
function touchUIOn() {
  return isTouch && settings.touchUI;
}

function applyTouchUI() {
  const on = touchUIOn();
  hud.touchUI.hidden = !on;
  // `touchMode` is the phone's other half (see "THE PHONE" in index.html): the bigger HUD buttons,
  // the card widths and the places the pads make room for themselves. It travels with the pads, so a
  // machine with the mobile UI off gets the desk layout as well as the desk controls.
  document.getElementById("game").classList.toggle("touchMode", on);
}

// ---- THE PHONE'S ACTIONS THAT ARE NOT VERBS (see "THE PHONE, THE OTHER HALF" in index.html) -----
// The button block carries the game's verbs; these two carry the things a KEYBOARD does, which a
// phone otherwise has no way to ask for at all:
//
//   #invClose        the pocket editor's exit. Opening it puts `invOpen` on `#game`, which hides
//                    `#touch` whole (the editor owns the frame), and the only ways out of it are
//                    TAB and E — so before this button a phone that opened the bag was STUCK in it.
//                    It fires the same `tab` edge TAB does, so it goes through the identical close
//                    path in `inventory.js` rather than a second one of its own.
//   #interactPrompt  the world prompt ("[E] CHECK BAG …") is a BUTTON on a phone. It only exists
//                    while there is something in reach, which is exactly when the `use` edge (E)
//                    means something, so a tap on it is the whole of the feature.
//
// ...and the prompt's own WORDS are re-cut, because they name keys that are not on the screen. The
// swap is a plain string pass (`touchPromptText`) run from the HUD block in `frame`, i.e. after the
// frame's own `gear.update`, because `inventory.js` rebuilds the prompt from scratch every frame it
// is up — so this has to win the LAST word, not the first.
function touchPromptText(text) {
  return text
    .replace(/\[E \+ M2\]/g, "[TAP + GRAB]")
    .replace(/\[M1\]/g, "[HIT]")
    .replace(/\[M2\]/g, "[GRAB]")
    .replace(/\[E\]/g, "[TAP]");
}

function bindTouchExtras() {
  const hold = (el, name) => {
    if (!el) return;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      el.classList.add("on");
      input.setTouch(name, true);
    });
    const up = () => {
      el.classList.remove("on");
      input.setTouch(name, false);
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
  };
  hold(document.getElementById("invClose"), "tab");
  hold(interactPromptEl, "use");
  // The pocket editor's own legend is the desk one ("TAB OPENS · TAB AGAIN CLOSES · CLICK TO
  // SELECT · …"). `inventory.js` reads it ONCE at construction into `hintBase` and puts it back
  // whenever a live selection takes the line over, so the phone's wording is swapped in at that
  // source rather than painted over the DOM every frame.
  if (gear && gear.invHint) {
    gear.hintBase = "TAP TO SELECT · DOUBLE-TAP A BOARD TO STASH / A TILE TO TAKE · DRAG TO MOVE · DROP OUTSIDE TO TOSS · TAP CLOSE";
  }
}

function computeFov(aspect) {
  const v = (2 * Math.atan(1 / Math.max(0.35, aspect)) * 180) / Math.PI;
  return Math.max(54, Math.min(94, v));
}

const spawnDist = { v: 0 };
// The melee chain's readout (see `hud.setCombo`): how many strikes have landed in a row, and how
// long that counter stays up after the last one.
const COMBO_NAMES = ["KNEE", "CLINCH", "SWEEP", "1-2"];
const COMBO_HOLD = 1.6;
// The deck's own counter (see `hud.setTrick`): how long the name of the trick the wheels just came
// back down from stays up. A hair shorter than the melee's, because a landing is a beat rather than
// a blow — by 1.5 s the board is already rolling on and the eye has left the tag.
const TRICK_HOLD = 1.5;
// WHAT EACH M1 LOOKS LIKE WHEN IT LANDS (see the `hit` block in `frame`, and `effects.impact`).
// The chain is four different moves and the FX used to be one colour for all of them, which made
// the string read as the same move four times: now each one has its own temperature. The knee is
// warm metal, the clinch's knee is deeper, the sweep is a COLD whip (it is a leg thrown through the
// air rather than a fist driven into a body), and the finisher is the hottest thing in the game.
// `punch` is how much of the camera's impact punch that move is worth (see `CameraRig.punch`), so
// the fourth M1 moves the lens about twice as hard as the first. `flash` is the whole-frame wash
// (see `post.flash`) — small for the first three so a chain does not strobe the screen white, and
// turned up on the finisher, which is meant to be a moment. It came DOWN on the finisher in session
// 122 (0.36 → 0.24), not up: `flash * (0.6 + power * 0.7)` at power 1 is 0.47, and measured on the
// live page that held the frame's mean luma at 187 for the first two frames of the contact against
// a scene baseline of ~120 — a full-screen white-out that hid the very impact it was selling (the
// strike's own FX were measured at +0 at that peak: the blowout was ALL wash). A wash that eats the
// graphic is not weight, it is a flashbang; at 0.24 the frame still takes the blow's colour for
// about a tenth of a second and the strike is what the eye lands on.
const HIT_FX = [
  { color: [1.0, 0.86, 0.42], punch: 0.45, flash: 0.14 },
  { color: [1.0, 0.74, 0.38], punch: 0.5, flash: 0.16 },
  { color: [0.92, 0.97, 1.12], punch: 0.58, flash: 0.17 },
  { color: [1.0, 0.93, 0.6], punch: 1.0, flash: 0.24 },
];
let comboCount = 0;
let comboT = 0;
// ...and the deck's own tag's clock (see `TRICK_HOLD` / `hud.setTrick`).
let trickT = 0;
// The overdrive's spark trail's own rate limit (see the block in `frame`).
let overTrailT = 0;
// ...and THE WALL CLINCH's blur smear's own (see the block in `frame`): the smear is a RATE, not a
// per-frame spawn — one soft billboard a frame is sixty a second, and sixty overlapping soft discs
// is a fog that hides the very flurry it is there to sell. A little over one per beat at the blur
// end, so the tail reads as a trail without ever covering the pair.
let wallSmearT = 0;
// ...and THE CLIMB SKIP's own trail's (session 177, same reasoning): a skip fires for half a second
// and leaves a streak of the face's grit up the stone, so the puffs are fed on a timer rather than
// every frame.
let climbWakeT = 0;
// ...and THE CLIMB'S OWN GRIP (session 181 — the user's *"add vfx for climbing"*; CUT BACK hard in
// session 199 — the same user's *"the vfx for the climb it too much"*): the beat of the clip the
// grit was last thrown on (`climbVfxBeat` — see the beat read in `solveWallPose`, the same
// quarter-phase contact count the tick sounds on). The beat starts at -1 so the first read of a
// fresh climb only ARMS it, the way the sound's does.
let climbVfxBeat = -1;
// ...and the WALL CLINCH's camera swing (see `setMoveOrbit` in camera.js and the MOVE CAMERA block
// in `frame`): how far round the pair's flank the shot is taken while the move is live, in radians.
// A little over three quarters of a right angle — enough that the two bodies stand side by side down
// the wall instead of one behind the other, not so far that the picture is on the player's beam ends.
const WB_ORBIT = 1.32;
// ...and the aim and the lift that go with it (see `setMoveAnchor` / `setMoveRise`): how far past the
// player the shot's centre is walked, toward the body being worked against the stone, and how far the
// eye is raised off that line so the picture looks down on the pair. Measured against captures of the
// clinch: without the aim the turn frames the player's shoulder, without the lift it frames his back.
const WB_AIM = 0.42;
const WB_RISE = 0.85;
// ...and THE CLASH's own framing (see the clash block further down `frame`): the yaw the shot swings
// onto the pair's FLANK while the lock lasts, how far it is pushed in, how far the centre is walked
// toward the body being shoved and how far the eye is lifted off the line.
const CLASH_ORBIT = 0.58;
const CLASH_PULL = -0.7;
const CLASH_AIM = 0.30;
const CLASH_RISE = 0.30;
// ...and the clash's per-press bookkeeping (see the `player.clash` block in `frame`): the lock the
// last read was taken against, the player's own press tally and the body's. All three are re-armed
// on a NEW lock, so a fresh clash never opens with a phantom shove from the last one's counter.
let clashRef = null;
let clashSpamPrev = 0;
let clashEPrev = 0;
// ...and the vault's own air (see the `vault` block in `frame`): the crossing feeds a whoosh every
// ~55 ms for as long as it lasts.
let vaultFxT = 0;
// ...and the SKATEBOARD's own two, on the same bargain (session 200 — see the `board` block in
// `frame`): the powerslide feeds a spray of sparks off the wheels for as long as the deck is
// sideways, which is the one move in the game whose FX are a RATE rather than an event, and the
// direction it throws them in — opposite the travel, so they trail the rider — is a scratch vector
// because `effects.sparkCone` takes one.
let boardSlideFxT = 0;
const _boardSpray = new THREE.Vector3();
let running = false;
let frameCount = 0;
let stepCount = 0;
let fpsAcc = 0;
let fpsCount = 0;
let fpsAcc_timer = 0;
let fps = 60;
let slowTime = 0;
let quality = 0;

// The slide's spray and the dive's wind (see `effects.slideWake` / `effects.diveWake`) are the
// VFX that replaced the two poses' own wobble. `SLIDE_SPRAY_FULL` is the speed the slide's
// power dial is authored against, so a hard entry sprays fast and heavy and a slide bleeding
// out barely stirs; the dive's dial is its own `P.DIVE_MAX`.
const SLIDE_SPRAY_FULL = 22; // the speed the slide's spray is authored at full power
// ...and the GROUND SLAM's own trail colour. The drop flies the dive's per-part wake
// (`effects.diveWake`) rather than a kind of its own — it is the same body tearing through the same
// air, and the machinery is already rate-limited and already reading the body's own bone points.
// The one thing that is the slam's is the COLOUR: the user's reference for the drop's shape
// (session 51) is a body coming down inside a trail of orange, so the wake is drawn in fire — a
// straight column down the fall line, because the drop does not turn (the drill was removed at the
// user's request in session 52).
const SLAM_FIRE = [1.22, 0.78, 0.32];
const QUALITY = [
  { h: 224, view: 4, fx: 1, grass: 1 },
  { h: 192, view: 3, fx: 0.7, grass: 0.66 },
  { h: 160, view: 3, fx: 0.45, grass: 0.4 },
];
const DOX = { h: 112, view: 2, fx: 0.12, grass: 0 };
let inputOverride = null;
let manual = false;
let optionsOpen = false;
let resumeAfterOptions = false;
let hasStarted = false;

const OPT_KEY = "baseplate.options.v1";
const DEFAULTS = {
  lowRes: true,
  wobble: 1,
  dither: 1,
  affine: 1,
  fog: 1,
  fp: false,
  noCamFlip: false,
  outline: 1,
  sens: 0.0024,
  invertY: false,
  sprint: P.SPRINT,
  runMin: P.RUN_MIN,
  build: P.BUILD_TIME,
  wallSlide: P.WALL_SLIDE,
  camDist: 5,
  dayLength: 4,
  charMode: "street",
  world: "field",
  textSize: 12,
  volume: 1,
  touchUI: true,
  showPs1Menu: true,
  showControlsGuide: true,
  doxSaver: false,
};

// Player looks: "street" is the hand-modelled STREET character, "imported" is the
// reference model the user supplied.
const CHAR_LABEL = { street: "STREET", imported: "CITY" };
function charLabel(mode) {
  return CHAR_LABEL[mode] || String(mode).toUpperCase();
}

function applyPs1MenuVisibility() {
  const el = document.getElementById("settings");
  if (el) {
    el.style.display = settings.showPs1Menu === false ? "none" : "";
  }
}

function applyControlsGuideVisibility() {
  const on = settings.showControlsGuide !== false;
  const help = document.getElementById("help");
  if (help && !on) {
    help.classList.add("hidden");
  }
  const keys = document.querySelectorAll("#overlay .keys");
  for (const k of keys) {
    k.style.display = on ? "" : "none";
  }
}

function loadOptions() {
  try {
    const raw = localStorage.getItem(OPT_KEY);
    if (!raw) {
      setTextSize(settings.textSize);
      sfx.setVolume(settings.volume);
      applyTouchUI();
      applyPs1MenuVisibility();
      applyControlsGuideVisibility();
      return;
    }
    const o = JSON.parse(raw);
    if (typeof o.lowRes === "boolean") settings.lowRes = o.lowRes;
    if (typeof o.showPs1Menu === "boolean") settings.showPs1Menu = o.showPs1Menu;
    if (typeof o.showControlsGuide === "boolean") settings.showControlsGuide = o.showControlsGuide;
    if (o.wobble !== undefined) settings.wobble = o.wobble ? 1 : 0;
    if (o.dither !== undefined) settings.dither = o.dither ? 1 : 0;
    if (o.affine !== undefined) settings.affine = o.affine ? 1 : 0;
    if (o.fog !== undefined) settings.fog = o.fog ? 1 : 0;
    if (o.outline !== undefined) setOutlineEnabled(!!o.outline);
    if (typeof o.fp === "boolean") {
      rig.firstPerson = o.fp;
      settings.firstPerson = o.fp;
    }
    if (typeof o.noCamFlip === "boolean") settings.noCamFlip = o.noCamFlip;
    if (typeof o.sens === "number" && o.sens > 0.0002 && o.sens < 0.02) {
      input.sensitivity = o.sens;
      input.touchSensitivity = o.sens * 1.75;
    }
    if (typeof o.invertY === "boolean") input.invertY = o.invertY;
    if (typeof o.volume === "number" && o.volume >= 0 && o.volume <= 1) settings.volume = o.volume;
    if (typeof o.touchUI === "boolean") settings.touchUI = o.touchUI;
    if (typeof o.doxSaver === "boolean") settings.doxSaver = o.doxSaver;
    if (typeof o.quality === "number") setQuality(o.quality);
    if (typeof o.sprint === "number" && o.sprint >= 4 && o.sprint <= 30) P.SPRINT = o.sprint;
    if (typeof o.runMin === "number" && o.runMin >= 0.5 && o.runMin <= 9) P.RUN_MIN = o.runMin;
    if (typeof o.build === "number" && o.build >= 0.4 && o.build <= 8) P.BUILD_TIME = o.build;
    if (typeof o.wallSlide === "number" && o.wallSlide >= 0.5 && o.wallSlide <= 12) P.WALL_SLIDE = o.wallSlide;
    if (typeof o.camDist === "number" && o.camDist >= rig.minDist && o.camDist <= rig.maxDist) rig.baseDist = o.camDist;
    if (typeof o.camLockDist === "number" && o.camLockDist >= rig.minDist && o.camLockDist <= rig.maxDist) rig.lockDist = o.camLockDist;
    if (typeof o.dayLength === "number" && o.dayLength >= 0 && o.dayLength <= 20) skySys.dayLength = o.dayLength * 60;
    if (typeof o.textSize === "number" && o.textSize >= 8 && o.textSize <= 30) settings.textSize = o.textSize;
    if (o.charMode === "street" || o.charMode === "imported") player.charMode = o.charMode;
    // The saved world generator. It is read here rather than in `setWorld` for the reason every
    // other option is: boot has to come up in the world the player left the game in, and `setWorld`
    // is only ever the switch a press goes through.
    if (o.world === "field" || o.world === "maze" || o.world === "hills" || o.world === "park") settings.world = o.world;
    if (o.wardrobe && typeof o.wardrobe === "object") applyWardrobe(o.wardrobe);
  } catch (e) {}
  setTextSize(settings.textSize);
  // The two settings that are not read out of `settings` at the moment they are used — the audio
  // node's level and the touch layer's visibility — are PUSHED here, because this is the first
  // moment the saved values exist and the last moment before the game starts. `applyTouchUI` has
  // already run once, on the default, in the boot above.
  sfx.setVolume(settings.volume);
  applyTouchUI();
  applyPs1MenuVisibility();
  applyControlsGuideVisibility();
}

function saveOptions() {
  try {
    localStorage.setItem(
      OPT_KEY,
      JSON.stringify({
        lowRes: settings.lowRes,
        showPs1Menu: settings.showPs1Menu !== false,
        showControlsGuide: settings.showControlsGuide !== false,
        wobble: settings.wobble > 0,
        dither: settings.dither > 0,
        affine: settings.affine > 0,
        fog: settings.fog > 0,
        outline: settings.outline > 0,
        fp: rig.firstPerson,
        noCamFlip: settings.noCamFlip,
        sens: input.sensitivity,
        invertY: input.invertY,
        volume: settings.volume,
        touchUI: settings.touchUI,
        quality: quality,
        doxSaver: !!settings.doxSaver,
        sprint: P.SPRINT,
        runMin: P.RUN_MIN,
        build: P.BUILD_TIME,
        wallSlide: P.WALL_SLIDE,
        camDist: rig.baseDist,
        camLockDist: rig.lockDist,
        dayLength: skySys.dayLength / 60,
        textSize: settings.textSize,
        charMode: player.charMode,
        world: settings.world,
        wardrobe: wardrobeOverrides(),
      })
    );
  } catch (e) {}
}

function toggleLowRes() {
  settings.lowRes = !settings.lowRes;
  pres.resize();
}

function toggleWobble() {
  settings.wobble = settings.wobble > 0 ? 0 : 1;
  syncMaterialSettings();
}

function toggleDither() {
  settings.dither = settings.dither > 0 ? 0 : 1;
  post.uniforms.uDither.value = settings.dither;
}

function toggleAffine() {
  settings.affine = settings.affine > 0 ? 0 : 1;
  syncMaterialSettings();
}

function toggleFog() {
  settings.fog = settings.fog > 0 ? 0 : 1;
  syncMaterialSettings();
}

function toggleOutline() {
  setOutlineEnabled(settings.outline <= 0);
}

function toggleFirstPerson() {
  rig.firstPerson = !rig.firstPerson;
  settings.firstPerson = rig.firstPerson;
}

// ---------------------------------------------------------------------------
// CHANGING THE WORLD
//
// `settings.world` is read by the chunk builder (see "THE HILLS" and "THE MAZE" in world.js), so
// changing it only takes effect for chunks built AFTER it changes — half a field of one world and
// half of the other is the one thing this must never do. So the switch is: tear the field down
// (`world.clearAll`), forget every mark the old one carried (`destruction.reset` — damage is
// addressed by chunk and box index, and an index is a different box under the other generator, so
// a hole would land in the wrong wall), stand the pole back up and the body back at the spawn —
// the one place all three generators guarantee is open ground, which is why a switch sends you home
// — and then stream the new field in immediately, before the next frame is drawn, so there is never
// a frame of void.
//
// ...and the two things that belong to ONE world only (the grass, and the hills' pinned sky) are
// switched here with it rather than being asked about every frame: `settings.world` is the single
// source of truth for all three.
const WORLD_ORDER = ["field", "maze", "hills", "park"];
function applyWorldTraits() {
  grass.setEnabled(settings.world === "hills" && !settings.doxSaver);
  skySys.fixed =
    settings.world === "hills"
      ? { time: 0.45, mood: "SUNNY", cloud: 0.72, cover: 0.5 }
      : settings.world === "park"
        ? { time: 0.60, mood: "SUNNY", cloud: 0.30, cover: 0.35 }
        : null;
}
// HOW LONG THE SYNCHRONOUS HALF OF THE STREAMER MAY TAKE, in ms — see `primeChunks` in world.js.
//
// The boot (and every world swap) used to build 30 chunks before returning, which is the nearest 30 of
// a 37-chunk view: **69 ms measured on the live page** (2.3 ms a chunk), all of it inside the module's
// own top level and so all of it on the critical path in front of the very first frame. 22 ms caps that
// at roughly a third of its old cost — about nine chunks, a 5×5 block around the spawn — and leaves the
// rest of the ring to `world.update`, which already streams at 6 ms a frame while the game is running
// and 2 ms a frame while it is not (the title screen, which is exactly when the boot's leftovers get
// spent, so they cost nothing per frame and are hidden behind the overlay). A TIME budget rather than a
// smaller COUNT because the count is a machine-independent lie: the same 30 chunks is a tenth of a
// second on a desktop and several times that on a phone, and the two have to share one constant.
const PRIME_MS = 22;

function rebuildWorld() {
  world.clearAll();
  destruction.reset();
  poles.reset();
  player.respawn();
  spawnDist.v = 0;
  applyWorldTraits();
  world.primeChunks(player.pos.x, player.pos.z, 30, PRIME_MS);
}

function setWorld(mode) {
  const want = WORLD_ORDER.indexOf(mode) >= 0 ? mode : "field";
  if (want === settings.world) return;
  settings.world = want;
  rebuildWorld();
  saveOptions();
  updateSettingsPanel();
  refreshOptions();
  hud.setOptSub("WORLD: " + worldLabel(want));
  if (sfx.ready) sfx.ui();
}

// ---------------------------------------------------------------------------
// SHIFT LOCK (ALT)
//
// The user's own brief: *"when i press alt my cross hair turns into a + and my camera becomes like
// roblox shift lock it turns instantly but dont make it very instant just make it extremly fast for
// smooth ness ... if i press or hold D or A u walk left or right while my head is still looking at
// the crosshair and if i press S i walk backward while still looking at the cross hair direction"*.
//
// The move itself is `player.shiftLock` (the facing chain in player.js holds the body on the
// camera's line, and `updateVisual` hands the run cycle the travel's own forward/sideways split),
// the camera's half is `rig.setShiftLock` (it swings behind the body once and then just looks where
// the mouse says), and the reticle is `hud.setShiftLock` (the dot becomes a `+`). This is only the
// key: a plain ALT toggles it, ALT+<key> does NOT — see `altArmed` below.
function setShiftLock(on) {
  const want = !!on;
  if (want === player.shiftLock) return;
  player.shiftLock = want;
  rig.setShiftLock(want);
  hud.setShiftLock(want);
  if (sfx.ready) sfx.ui();
}

function toggleShiftLock() {
  setShiftLock(!player.shiftLock);
}

// Swap the player character's look and rebuild its mesh from the model.
function cycleCharacter() {
  const next = player.charMode === "street" ? "imported" : "street";
  player.loadCharacter(next).then((ok) => {
    hud.setOptSub(ok ? "CHARACTER: " + charLabel(next) : "CHARACTER MODEL UNAVAILABLE");
    updateSettingsPanel();
    refreshOptions();
  });
}

// ---------------------------------------------------------------------------
// WARDROBE
//
// Colours are stored as hex per family (see streetwear.js for the palette itself) and applied
// to the live rig by rewriting its vertex colours — no rebuild, so a colour picker can be
// dragged against the model. The panel is a grid of colour wells plus the outfit presets.
// ---------------------------------------------------------------------------
function wardrobeRows() {
  const street = player.charMode === "street";
  const rows = [
    { type: "section", name: "WARDROBE" },
    {
      type: "swatches",
      items: wardrobeState().map((s) => ({ id: s.id, name: s.name, value: s.value, off: !street })),
    },
    {
      type: "presets",
      presets: outfitList().map((o) => ({ id: o.id, name: o.name, chips: o.chips, on: o.id === currentOutfit() })),
    },
    { act: "outfitNext", key: "B", name: "OUTFIT PRESET", value: outfitName(currentOutfit()), on: true },
  ];
  if (!street) rows.push({ type: "note", name: "STREET LOOK ONLY \u2014 SWITCH CHARACTER LOOK BELOW" });
  return rows;
}

let wardrobeSaveT = 0;
function paintWardrobeFamily(family, hex) {
  setWardrobeColor(family, hex);
  repaintWardrobe(player.charMesh);
  const box = document.getElementById("swBox_" + family);
  if (box) box.style.setProperty("--sw", hex);
  clearTimeout(wardrobeSaveT);
  wardrobeSaveT = setTimeout(saveOptions, 400);
}

function chooseOutfit(id) {
  if (!id) return;
  setOutfit(id);
  repaintWardrobe(player.charMesh);
  if (sfx.ready) sfx.ui();
  saveOptions();
  hud.setOptSub("OUTFIT: " + outfitName(currentOutfit()).toUpperCase());
  refreshOptions();
}

// ---------------------------------------------------------------------------
// WARDROBE SHOWCASE CAMERA
//
// The options card covers the middle of the screen — which is exactly where the third-person
// camera puts the character — so while the WARDROBE section is on screen the camera moves to a
// 3/4 close-up and frames the body in whatever space the card leaves free: the left gutter on a
// wide screen, the strip above the bottom sheet on a narrow one. Every other options section
// keeps the game's own camera, so scrolling the wardrobe into view is what brings the body up.
//
// It is a blend rather than a cut: the rig's own camera is left where it is and the position
// and the aim point are both lerped toward the showcase, so the panel's scroll glides between
// the two framings instead of snapping.
// ---------------------------------------------------------------------------
const _showPos = new THREE.Vector3();
const _showAim = new THREE.Vector3();
const _rigAim = new THREE.Vector3();
const _camDir = new THREE.Vector3();
let showcase = 0;

function wardrobeInView() {
  if (!optionsOpen) return false;
  const el = document.getElementById("swGrid");
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const p = hud.optionsScroll.getBoundingClientRect();
  return r.top < p.bottom - 16 && r.bottom > p.top + 16;
}

function showcaseCamera(dt) {
  const want = wardrobeInView() ? 1 : 0;
  // Snaps off below a threshold rather than chasing zero: the lens shift is in screen pixels, so
  // anything under a couple of percent is a few pixels of residual pan at most — and it stops
  // the offset outliving the panel by a second of imperceptible drift.
  showcase += (want - showcase) * Math.min(1, dt * 6);
  if (showcase < 0.02) {
    if (showcase !== 0) camera.clearViewOffset();
    showcase = 0;
    return;
  }
  const W = window.innerWidth;
  const H = window.innerHeight;
  // Which way the body is framed is read off the card itself rather than guessed from the
  // viewport: whichever side of the card has the most room is the one it goes in, with a LENS
  // shift (`setViewOffset`) rather than an aim offset, because aiming past the body would swing
  // a 61-degree lens across it and smear the model (the first version of this did exactly that:
  // at 3.4 units a 0.8-half-frame pan put the body 46 degrees off axis and cropped it in half).
  //
  // The card read has to be the OPTIONS card, not the first `.optCard` in the document. The update
  // log wears the same class — it is the same card, borrowed — and it sits ABOVE `#options` in the
  // markup, so `document.querySelector(".optCard")` matched a `display:none` element and measured a
  // **zero rect**: `right` then came out as the whole viewport, the biggest band by far, and `dx`
  // was 0 on every frame the showcase ran. The body was framed dead centre BEHIND the panel it was
  // written to stand clear of, and on a phone — where the card is a bottom sheet — the sheet covered
  // him completely (the gutter is the whole of what this measurement is for).
  const card = hud.optionsPanel ? hud.optionsPanel.querySelector(".optCard") : null;
  const r = card ? card.getBoundingClientRect() : null;
  const left = r ? r.left : 0;
  const right = r ? Math.max(0, W - r.right) : W;
  const top = r ? r.top : 0;
  const bottom = r ? Math.max(0, H - r.bottom) : 0;
  const band = Math.max(left, right, top, bottom);
  let dx = 0;
  let dy = 0;
  let minHalfH;
  if (band === left || band === right) {
    dx = (W / 2 - band / 2) * (band === left ? 1 : -1);
    minHalfH = 1.7; // a side band is the full height, so only the body has to fit
  } else {
    dy = (H / 2 - band / 2) * (band === top ? 1 : -1);
    // A top/bottom band is short: pull back far enough that the body clears it with margin.
    minHalfH = (1.8 * H) / Math.max(80, band);
  }
  const dist = Math.max(minHalfH, 2.0) / Math.tan((camera.fov * Math.PI) / 360);
  const p = player.pos;
  // The drawn body: feet at `pos.y - P.HY`, the skull `P.HY * BODY_RATIO` above that.
  const bodyY = p.y - P.HY + P.HY * P.BODY_RATIO * 0.5;
  const yaw = player.facing + Math.PI * 0.78;
  const pitch = -0.10;
  const cp = Math.cos(pitch);
  _showPos.set(
    p.x + Math.sin(yaw) * cp * dist + Math.cos(yaw) * 0.28,
    bodyY - Math.sin(pitch) * dist + 0.1,
    p.z + Math.cos(yaw) * cp * dist - Math.sin(yaw) * 0.28
  );
  // ...and the eye is floored to the DECK, which is a thing you measure, not a number. That `0.4`
  // in the line above used to be the floor — an ABSOLUTE world height, written when every world's
  // ground was a flat plain at 0, where "0.4" and "just above the deck" are the same sentence. The
  // hills are not that world: you spawn on the SUMMIT and every direction out of it is downhill, so
  // the moment the wardrobe was opened anywhere below y ≈ 0 the eye stayed pinned at 0.4 while the
  // body went on down the hill, and the shot was left looking straight down the top of his head from
  // as far up as he had walked below (measured on the live page at the bottom of a valley: the eye
  // **20.18 u above** the body, pitch **83.6°**, the body a dot in the middle of the frame). It is
  // the user's *"when i go to the wardrobe section and im in a place lower than the avg like starting
  // place or higher my camera gets weird and it makes the camera view from above the player head"*.
  //
  // Read exactly the way `follow`'s own deck guard reads it (see camera.js — the same 0.3-becomes-
  // "0.3 above the ground here" fix, for the same reason): the floor is the higher of the BODY's own
  // feet and the ground under the CAMERA's spot, so the framing above is the shot at every height in
  // every world, and the floor only ever catches a camera a hill has been built under. In the field
  // and the maze (ground 0, feet 0 at the spawn) this is the old clamp to the digit.
  const deckY = Math.max(p.y - P.HY, world.terrainHeight ? world.terrainHeight(_showPos.x, _showPos.z) : 0);
  if (_showPos.y < deckY + 0.4) _showPos.y = deckY + 0.4;
  _showAim.set(p.x, bodyY, p.z);
  _rigAim.copy(camera.position).addScaledVector(camera.getWorldDirection(_camDir), 8);
  camera.position.lerp(_showPos, showcase);
  _rigAim.lerp(_showAim, showcase);
  camera.setViewOffset(W, H, dx * showcase, dy * showcase, W, H);
  camera.up.set(0, 1, 0);
  camera.lookAt(_rigAim);
}

// ---------------------------------------------------------------------------
// THE HERO LAYER — the body drawn OVER the wardrobe's dim (session 176).
//
// The user: *"make the player when im the wardrobe section appear over the dim and over the comic
// dot effect thing only the player like hes breaking the 4th wall or something"*.
//
// The wardrobe's dim + Ben-Day dots are the options overlay's own DOM background (`--comic-dim` in
// index.html), and the character is drawn in `#view` UNDER it, so he is dimmed and dotted with the
// rest of the paused world. A canvas cannot be lifted above a DOM overlay, so the body is rendered
// a SECOND time — into `#heroLayer`, a canvas that is a child of the overlay (above its background,
// below the card) — with everything else in the scene switched off for that one pass. The same
// `camera` and the same `pres.width/height` grid are used, and both canvases are upscaled with
// `image-rendering: pixelated`, so the bright body lands on exactly the pixels its dimmed ghost
// occupies and simply stands in front of the print.
//
// It runs only while the wardrobe is in view (the `showcase` blend), and the world is frozen behind
// an open panel, so the extra pass is a handful of meshes. The layer's opacity rides `showcase`, so
// he lifts out of the dots as the section scrolls in rather than popping.
//
// The renderer is made LAZILY (a second WebGL context is real GPU memory, so a session that never
// opens the wardrobe never pays for it) and a context that refuses to be made just leaves the layer
// dark — the wardrobe is a menu, not a thing worth failing over.
const heroCanvas = document.getElementById("heroLayer");
let heroRenderer = null;
let heroFailed = false;

function renderHero(amount) {
  if (!heroCanvas) return;
  if (amount <= 0.004) {
    if (heroCanvas.style.visibility !== "hidden") heroCanvas.style.visibility = "hidden";
    return;
  }
  if (heroFailed) return;
  if (!heroRenderer) {
    try {
      heroRenderer = new THREE.WebGLRenderer({
        canvas: heroCanvas,
        alpha: true,
        antialias: false,
        stencil: false,
        powerPreference: "default",
        preserveDrawingBuffer: false,
      });
      heroRenderer.setPixelRatio(1);
      heroRenderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      heroRenderer.setClearColor(0x000000, 0);
      heroRenderer.autoClear = true;
    } catch (err) {
      heroFailed = true;
      heroRenderer = null;
      return;
    }
  }
  // The SAME grid the main picture is drawn on, so the two line up pixel for pixel. `setSize`'s
  // third argument is false on purpose: the canvas's CSS box stays the overlay ('100%'), and the
  // upscale to it is the same `pixelated` stretch `#view` gets.
  if (heroCanvas.width !== pres.width || heroCanvas.height !== pres.height) {
    heroRenderer.setSize(pres.width, pres.height, false);
  }
  // EVERYTHING BUT THE BODY comes off for this pass — the world, the grass, the props, the other
  // fighters, the sky and the contact shadow — and goes straight back on. `player.group` is the
  // body's own root (see the player's constructor); the staff, when he is carrying one, is a scene
  // child mounted onto his rig, so it is dropped here with the rest and appears only in its own
  // (dimmed) place behind the dots — a menu moment, not a fight.
  const kids = scene.children;
  const off = [];
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i];
    if (c === player.group) continue;
    if (c.visible) { off.push(c); c.visible = false; }
  }
  heroRenderer.render(scene, camera);
  for (let i = 0; i < off.length; i++) off[i].visible = true;
  heroCanvas.style.visibility = "visible";
  heroCanvas.style.opacity = amount >= 1 ? "1" : amount.toFixed(3);
}

let isPseudoFullscreen = false;
let lastFsToggleTime = 0;

function fsActive() {
  return isPseudoFullscreen || !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

function fsSupported() {
  return true; // Supported natively or via full-viewport fallback
}

async function toggleFullscreen() {
  const now = Date.now();
  if (now - lastFsToggleTime < 280) return;
  lastFsToggleTime = now;

  const currentlyActive = fsActive();

  if (currentlyActive) {
    if (isPseudoFullscreen) {
      isPseudoFullscreen = false;
      const gameEl = document.getElementById("game");
      if (gameEl) gameEl.classList.remove("pseudo-fullscreen");
      document.documentElement.classList.remove("pseudo-fullscreen-root");
      document.body.classList.remove("pseudo-fullscreen-root");
    }
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    } catch (e) {}
    hud.setOptSub("EXIT FULLSCREEN");
  } else {
    let nativeSuccess = false;
    const targets = [
      document.documentElement,
      document.getElementById("game"),
      document.body,
    ].filter(Boolean);

    for (const target of targets) {
      if (nativeSuccess) break;
      if (target.requestFullscreen) {
        try {
          await target.requestFullscreen();
          nativeSuccess = true;
          break;
        } catch (err1) {
          try {
            await target.requestFullscreen({ navigationUI: "hide" });
            nativeSuccess = true;
            break;
          } catch (err2) {}
        }
      } else if (target.webkitRequestFullscreen) {
        try {
          target.webkitRequestFullscreen();
          nativeSuccess = true;
          break;
        } catch (err3) {}
      } else if (target.mozRequestFullScreen) {
        try {
          target.mozRequestFullScreen();
          nativeSuccess = true;
          break;
        } catch (err4) {}
      } else if (target.msRequestFullscreen) {
        try {
          target.msRequestFullscreen();
          nativeSuccess = true;
          break;
        } catch (err5) {}
      }
    }

    if (!nativeSuccess && !fsActive()) {
      isPseudoFullscreen = true;
      const gameEl = document.getElementById("game");
      if (gameEl) gameEl.classList.add("pseudo-fullscreen");
      document.documentElement.classList.add("pseudo-fullscreen-root");
      document.body.classList.add("pseudo-fullscreen-root");
      hud.setOptSub("EXPANDED FULLSCREEN");
    }
  }

  syncFullscreen();
  resize();
  setTimeout(resize, 80);
  setTimeout(resize, 200);
  setTimeout(resize, 500);
}

function syncFullscreen() {
  const nativeActive = !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
  if (!nativeActive && !isPseudoFullscreen) {
    const gameEl = document.getElementById("game");
    if (gameEl) gameEl.classList.remove("pseudo-fullscreen");
    document.documentElement.classList.remove("pseudo-fullscreen-root");
    document.body.classList.remove("pseudo-fullscreen-root");
  }
  hud.setFullscreen(fsActive());
  refreshOptions();
}

// The four world generators, as the options row names them (see "THE HILLS", "THE MAZE" and "THE
// SKATEPARK" in world.js).
const WORLD_LABEL = { field: "OPEN FIELD", maze: "THE MAZE", hills: "BLISS HILLS", park: "SKATEPARK" };
const WORLD_NOTE = {
  field: "SWITCH TO THE MAZE OR THE HILLS \u2014 YOU CAN SWAP BACK AT ANY TIME (A WORLD IS REGENERATED, SO BREAKAGE IS LOST)",
  maze: "A MAZE WITH NO END \u2014 AND ITS WALLS RISE THE FURTHER YOU RUN. CLIMB THEM AT THE SPAWN AND RUN THEIR TOPS.",
  hills: "THE WINDOWS XP WALLPAPER AS A MAP \u2014 SMOOTH GREEN HILLS ALL THE WAY OUT, SWAYING GRASS, AND YOU START ON THE SUMMIT",
  park: "A SKATEPARK, EXAGGERATED \u2014 PLAZAS AND RAMPS FOR MILES, A BOWL, A HALF-PIPE POOL AND A 70\u00B0 SPINE, RAILS AND LEDGES ON EVERY DECK. BRING THE BOARD",
};
function worldLabel(mode) {
  return WORLD_LABEL[mode] || String(mode).toUpperCase();
}

// The row's click and the `K` key both walk the same list — field → maze → hills → park → field —
// so the one press always shows you the next map whatever the current one is.
function nextWorld() {
  const i = WORLD_ORDER.indexOf(settings.world);
  return WORLD_ORDER[(i + 1) % WORLD_ORDER.length];
}

function optionItems() {
  return [
    { type: "section", name: "WORLD" },
    { act: "world", key: "K", name: "WORLD GEN", value: worldLabel(settings.world), on: true },
    { type: "note", name: WORLD_NOTE[settings.world] || WORLD_NOTE.field },
    { type: "section", name: "RENDER" },
    { act: "showPs1Menu", name: "PS1 RENDER MENU", on: settings.showPs1Menu !== false, value: settings.showPs1Menu !== false ? "ON" : "OFF" },
    { act: "lowRes", key: "1", name: "LOW-RES RENDER", on: settings.lowRes },
    { act: "wobble", key: "2", name: "VERTEX WOBBLE", on: settings.wobble > 0 },
    { act: "dither", key: "3", name: "DITHER + 15BIT", on: settings.dither > 0 },
    { act: "affine", key: "4", name: "AFFINE WARP", on: settings.affine > 0 },
    { act: "fog", key: "5", name: "FOG", on: settings.fog > 0 },
    { act: "outline", key: "7", name: "PLAYER OUTLINE", on: settings.outline > 0 },
    { act: "quality", key: "6", name: "QUALITY", value: quality + 1 + "/" + QUALITY.length, on: true },
    { act: "dox", name: "ULTRA SUPER DOX PERFORMANCE SAVER", on: !!settings.doxSaver, value: settings.doxSaver ? "ON" : "OFF" },
    { type: "section", name: "CAMERA" },
    { act: "fp", key: "V", name: "FIRST PERSON", on: rig.firstPerson },
    { act: "noCamFlip", name: "NO CAMERA FLIP", on: settings.noCamFlip },
    {
      act: "fullscreen",
      key: "&nbsp;",
      name: "FULLSCREEN",
      on: fsActive(),
      value: fsSupported() ? (fsActive() ? "ON" : "OFF") : "N/A",
    },
    { type: "slider", act: "camDist", name: "CAMERA DIST", min: 20, max: 90, value: Math.round(rig.activeDistance() * 10), disp: rig.activeDistance().toFixed(1), mul: 0.1, dec: 1 },
    { type: "section", name: "LOOK" },
    { type: "slider", act: "sens", name: "SENSITIVITY", min: 6, max: 60, value: Math.round(input.sensitivity * 10000), mul: 0.0001 },
    { act: "invertY", name: "INVERT Y", on: input.invertY },
    { type: "slider", act: "textSize", name: "TEXT SIZE", min: 10, max: 22, step: 1, value: Math.round(settings.textSize), disp: textSizeOf(settings.textSize), fmt: textSizeOf, mul: 1 },
    { type: "section", name: "AUDIO" },
    { type: "slider", act: "volume", name: "VOLUME", min: 0, max: 100, step: 5, value: Math.round(settings.volume * 100), disp: volOf(settings.volume * 100), fmt: volOf },
    { type: "section", name: "TOUCH" },
    {
      act: "touchUI",
      name: "MOBILE UI",
      on: touchUIOn(),
      value: isTouch ? (settings.touchUI ? "ON" : "OFF") : "N/A",
    },
    { type: "section", name: "MOVE" },
    { type: "slider", act: "sprint", name: "TOP SPEED", min: 7, max: 20, value: Math.round(P.SPRINT), mul: 1 },
    { type: "slider", act: "runMin", name: "START SPEED", min: 1, max: 8, value: Math.round(P.RUN_MIN), mul: 1 },
    { type: "slider", act: "build", name: "BUILD-UP (s)", min: 1, max: 6, value: Math.round(P.BUILD_TIME), mul: 1 },
    { type: "slider", act: "wallSlide", name: "WALL SLIDE SPEED", min: 10, max: 90, value: Math.round(P.WALL_SLIDE * 10), disp: P.WALL_SLIDE.toFixed(1), mul: 0.1, dec: 1 },
    { type: "section", name: "SKY" },
    { type: "slider", act: "time", name: "TIME OF DAY", min: 0, max: 1435, step: 5, value: Math.round(skySys.time * 1440), disp: skySys.clockText(), fmt: clockOf },
    { type: "slider", act: "dayLength", name: "DAY LENGTH", min: 0, max: 20, value: Math.round(skySys.dayLength / 60), disp: skySys.dayLength <= 0 ? "FROZEN" : Math.round(skySys.dayLength / 60) + " min", fmt: dayLengthOf, mul: 60 },
    { act: "mood", name: "SKY MOOD", value: skySys.mood, on: true },
    ...wardrobeRows(),
    { type: "section", name: "PLAY" },
    {
      act: "char",
      key: "N",
      name: "CHARACTER LOOK",
      value: player.hasCharacter() ? charLabel(player.charMode) : "LOADING...",
      on: true,
    },
    { act: "showControlsGuide", name: "CONTROLS GUIDE", on: settings.showControlsGuide !== false, value: settings.showControlsGuide !== false ? "ON" : "OFF" },
    { act: "help", key: "H", name: "CONTROLS", value: "OPEN" },
    { act: "respawn", key: "]", name: "RESPAWN AT SPAWN PAD", value: "GO" },
    { type: "section", name: "DEVICE" },
    { act: "proto", name: "SPECIAL DEVICE PROTOCOL", value: "OPEN", on: false },
  ];
}

function clockOf(mins) {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

function dayLengthOf(mins) {
  return mins <= 0 ? "FROZEN" : Math.round(mins) + " min";
}

function textSizeOf(px) {
  return Math.round(px) + "px";
}

// The VOLUME row's read-out: the mix is authored at 100 %, so the number shown is the share of it
// the player is hearing — and a level of zero is called what it is rather than "0 %".
function volOf(pct) {
  const p = Math.round(pct);
  return p <= 0 ? "MUTE" : p + " %";
}

function refreshOptions() {
  if (!optionsOpen) return;
  // Keep the scroll position across the re-render: the showcase camera keys off whether the
  // wardrobe is on screen, so a panel that jumped back to the top would drop the character out
  // of frame the moment you clicked a swatch.
  const keep = hud.optionsScroll.scrollTop;
  hud.renderOptions(optionItems());
  hud.optionsScroll.scrollTop = keep;
  for (const it of optionItems()) {
    if (it.type === "swatches") {
      for (const s of it.items) {
        const el = document.getElementById("sw_" + s.id);
        if (!el) continue;
        el.addEventListener("input", () => paintWardrobeFamily(s.id, el.value));
      }
      continue;
    }
    if (it.type !== "slider") continue;
    const el = document.getElementById("opt_" + it.act);
    if (!el) continue;
    el.addEventListener("input", () => {
      applySlider(it.act, Number(el.value) * (it.mul || 1));
      const lab = document.getElementById("optVal_" + it.act);
      if (lab) lab.textContent = it.fmt ? it.fmt(Number(el.value)) : (Number(el.value) * (it.mul || 1)).toFixed(it.dec || 0);
      saveOptions();
    });
  }
}

function applySlider(act, v) {
  switch (act) {
    case "textSize":
      setTextSize(v);
      break;
    case "volume":
      settings.volume = v / 100;
      sfx.setVolume(settings.volume);
      break;
    case "sens":
      input.sensitivity = v;
      input.touchSensitivity = v * 1.75;
      break;
    case "sprint":
      P.SPRINT = v;
      break;
    case "runMin":
      P.RUN_MIN = v;
      break;
    case "build":
      P.BUILD_TIME = v;
      break;
    case "wallSlide":
      P.WALL_SLIDE = v;
      break;
    case "camDist":
      rig.setActiveDistance(v);
      break;
    case "time":
      skySys.setTime(v / 60);
      break;
    case "dayLength":
      skySys.dayLength = v;
      break;
    default: return;
  }
  if (sfx.ready) sfx.ui();
}

// The interface's type size, in px. Every font-size in index.html's stylesheet is a multiple of
// this one number (see `:root`'s `--fs`), so the whole HUD's type scales from here — the panel
// widths, the help grid's columns and the touch buttons are all keyed off the same variable, which
// is what keeps a bigger font from overflowing the boxes that hold it. Written as an inline style on
// <html> because that beats the stylesheet's own `:root` default.
function setTextSize(px) {
  settings.textSize = px;
  document.documentElement.style.setProperty("--fs", px + "px");
}

function applyOption(act, data) {
  switch (act) {
    case "showPs1Menu":
      settings.showPs1Menu = !settings.showPs1Menu;
      applyPs1MenuVisibility();
      hud.setOptSub(settings.showPs1Menu ? "PS1 MENU: ON" : "PS1 MENU: OFF");
      break;
    case "showControlsGuide":
      settings.showControlsGuide = !settings.showControlsGuide;
      applyControlsGuideVisibility();
      hud.setOptSub(settings.showControlsGuide ? "CONTROLS GUIDE: ON" : "CONTROLS GUIDE: OFF");
      break;
    case "lowRes": toggleLowRes(); break;
    case "wobble": toggleWobble(); break;
    case "dither": toggleDither(); break;
    case "affine": toggleAffine(); break;
    case "fog": toggleFog(); break;
    case "outline": toggleOutline(); break;
    case "quality": setQuality((quality + 1) % QUALITY.length); break;
    case "dox":
      settings.doxSaver = !settings.doxSaver;
      setQuality(quality);
      grass.setEnabled(settings.world === "hills" && !settings.doxSaver);
      hud.setOptSub(settings.doxSaver ? "DOX SAVER: ON" : "DOX SAVER: OFF");
      break;
    case "fp": toggleFirstPerson(); break;
    case "mood": skySys.nextMood(); break;
    case "char": cycleCharacter(); return;
    case "world": setWorld(nextWorld()); return;
    case "outfit": chooseOutfit(data && data.outfit); return;
    case "outfitNext": chooseOutfit(nextOutfit()); return;
    case "fullscreen": toggleFullscreen(); return;
    case "invertY": input.invertY = !input.invertY; break;
    case "noCamFlip": settings.noCamFlip = !settings.noCamFlip; break;
    case "touchUI":
      // Nothing to flip on a machine with no touchscreen, and the row already reads N/A there — so
      // the press says why rather than moving an ON/OFF that stands for nothing (the FULLSCREEN
      // row's own answer to the same situation, and the same words it uses).
      if (!isTouch) {
        hud.setOptSub("NO TOUCHSCREEN");
        return;
      }
      settings.touchUI = !settings.touchUI;
      applyTouchUI();
      hud.setOptSub(settings.touchUI ? "MOBILE UI: ON" : "MOBILE UI: OFF");
      break;
    case "help": hud.toggleHelp(); break;
    case "respawn":
      player.respawn();
      spawnDist.v = 0;
      break;
    case "proto": enterProto(); return;
    default: return;
  }
  if (sfx.ready) sfx.ui();
  updateSettingsPanel();
  saveOptions();
  refreshOptions();
}

// ------------------------------------------------------------------------------------------------
// THE UPDATE LOG
//
// The user's brief was one line long: *"can we add an update log next to the option button that
// looks like this (i) just type the things u added in a shortend way"*. So it is a list of SHORT
// lines, newest first, and the writing rule is "a sentence you could say out loud" rather than a
// changelog entry. `tag` is the session the line came from — "NOW" is the session that is running as
// you read this — and it is only there so the player can see how much is new without needing to
// know any version numbers.
//
// KEEP IT SHORT-LINED AND ONE THING PER LINE. This is the one list in the generator written for the
// player rather than for the engine, and the temptation to explain is the thing to resist: if a line
// wants a full stop in the middle it is either two lines or it is too long.
//
// ...and the list is in SECTIONS (session 131, the user's *"put in between every update log a title
// like the -VFX UPDATE-"*): a `{ head: "..." }` entry is a SECTION TITLE, and everything after it
// belongs to that section until the next one. It is drawn as `- LIKE THIS -` in its own row (see
// `renderLog` in hud.js). The sections run newest-first like the lines do, so the title of the
// session that is running as you read this is the first one in the card.
const UPDATES = [
  { head: "DEVICE PROTOCOL" },
  { tag: "NOW", text: "new option **SPECIAL DEVICE PROTOCOL** at the bottom of OPTIONS: parks the game on a blank page with only BACK, doing zero render work for very weak devices" },
  { head: "MEGA PARK + DOX SAVER" },
  { tag: "S208", text: "the skatepark goes **past 100 features**: a rideable **LOOP** wall, the **KING BOWL**, a **MEGA PIPE**, plus a whole scattered field of mini bowls, pipes, spines, volcanoes, loop walls and mogul runs" },
  { tag: "S208", text: "new option **ULTRA SUPER DOX PERFORMANCE SAVER**: drops the render way down, halves what the game streams, and kills grass and most particles for weak devices" },
  // ---- session 207: MORE STUFF (the user's *"add more stuff to the skate board map"*). Ten new props
  // and two new landmarks, and the plastering of three real bugs the measuring found along the way.
  //
  //   1. THE PROPS GO 7 → 17. The one thing a deck cannot get from the terrain is a LAUNCH, so the
  //      bag gains a KICKER and a BANK (stacked boxes, every rise under the board's own wheel), a
  //      HUMP, a MANUAL pad, a BARRIER, and the street furniture a plaza is full of (KERB, PLANTER,
  //      BENCH, CONE, CAN). The bag is weighted now and plants 0.72 of flat cells instead of 0.55 —
  //      measured: 334 boxes in a 112-unit window, and 58.8-60.8 fps.
  //   2. THE LANDMARKS GO 3 → 5. THE DEEP END is a second, tighter bowl (61° walls), and THE
  //      VOLCANO is a mound with a pit: 41° of runnable dome around a 66° crater, in rust stone, so
  //      you can name it from two plazas away.
  //   3. THREE BUGS, found by reading the pieces back off the live chunk list. The pool liner was
  //      INVERTED (pale floor, dark ring at the coping — the opposite of its own comment); the stair
  //      set's landing was a NEGATIVE box (depth 3.2 - 5.9 = -2.7, a hole in the occluder grid); and
  //      the volcano's first cut threw a `q is not defined` out of `parkGroundColor` on every ground
  //      build. All three fixed; 0 bad boxes across 2,467 sampled.
  // -------------------------------------------------------------------------------------------------
  { head: "MORE STUFF" },
  { tag: "S207", text: "**the skatepark gets a lot fuller**: ten new things to skate — **kicker** and **bank** ramps you can launch off, a **hump**, a **manual** pad, a **barrier** — plus the street furniture a real plaza is full of (**kerbs, planters, benches, cones, trash cans**), spending more densely across the decks" },
  { tag: "S207", text: "two new landmarks: **THE DEEP END** (a tighter, 61° bowl) and **THE VOLCANO** — a mound you run up and over with a 66° pit cut into the middle of it, in rust stone so you can spot it from across the park" },
  { tag: "S207", text: "the pools are **lined properly now**: the colour deepens toward the floor of every bowl and pipe instead of ringing the lip, which is what the code had always said it did and never did" },
  { tag: "S207", text: "and a stair set's landing is a landing again — it had been built with a **negative depth** (a box with its far face behind its near one), which the occluder grid read as a hole" },
  // ---- session 206: THE SKATEPARK (the user's *"make me a new skateboard map and exaggrate it and
  // make it with slopes and all kinds of stuff"*). A FOURTH world on `K`, and it is a generator of
  // its own — see "THE SKATEPARK" in README.md and the session 206 row in SPEC.md.
  //
  //   1. THE SLOPES ARE THE MAP. `PARK.pad` 64 apart is a dead-flat plaza at its own height (whole
  //      risers of 12, up to ±36), and everything between two plazas is a ramp: measured on the
  //      drawn field at **31, 51, 61 and 68 degrees** for rises of one to four risers. 44% of
  //      neighbouring plazas are dead level, so it is plazas with ramps between them, not one hill.
  //   2. THREE LANDMARKS. A round BOWL (46° walls, its rim dead level), a long PIPE pool (58°) and
  //      a SPINE built UP instead of dug in (75° at the crest) — each sunk in its own flat plaza.
  //   3. AND ALL KINDS OF STUFF. Rails, ledges, funboxes, pyramids, hubbas, stair sets and blocks
  //      stand on the flat decks only (a prop is planted only where the ground under its own
  //      footprint bends less than 0.22), and never in a set piece's runway — measured before that
  //      rule: a 14 u/s run at the spine stopped DEAD on a prop 45 units short of the ridge.
  //
  // Measured after: the camp exactly flat; the board rolls a ramp from 6 → 27.6 u/s and 30.9 on the
  // next drop; a body standing on a 51° face and pushing uphill slides 12.4 u BACK DOWN it; 59-60
  // fps. ---------------------------------------------------------------------------------------------
  { head: "THE SKATEPARK" },
  { tag: "S206", text: "**a fourth map on `K`**: a skatepark of flat plazas joined by ramps — measured grades of **31° to 68°**, three landmarks (**a round bowl, a long pipe, and a spine you launch off**), and rails, ledges, pyramids, hubbas, stair sets and blocks standing on the decks" },
  { tag: "S206", text: "the bowl and the pipe are **sunk in their own flat plazas** with their rims dead level, and the spine is **built up** — 20 units of concave wall that needs a real run-up to clear" },
  { tag: "S206", text: "the ground and the furniture agree by construction: a prop only stands where the deck under its own footprint is flat, and **nothing is ever planted in a landmark's runway**" },
  { tag: "S206", text: "bigger risers and a tighter lattice than the first cut — the old one measured **40°** at its steepest and two thirds of its plazas were the same height, which is not an exaggerated skate map" },
  { head: "THE SCORE UNDER THE WHEEL" },
  { tag: "S204", text: "the board's scoreboard finally has a scorer behind it: every trick pays by risk (OLLIE 60 up to BODY VARIAL 300), and each trick in a chain steps the multiplier by two — 2x, 4x, 6x up to 20x" },
  { tag: "S204", text: "landings throw a [ TRICK +POINTS xMULT ] tag beside you that slides across into the scoreboard and pays on arrival, while the number rolls up to meet it — bails and step-offs reset the chain, never the bank" },
  { tag: "S204", text: "the readout sits under the circular HUD at exactly the wheel's width with the multiplier badge, and the whole word ladder is clean now, topped by HALAL" },
  // ---- session 203: THE SHELL THAT CANNOT LOSE ITS HEAD (the user's *"An error has occurred somewhere
  // in your code ... TypeError: Cannot read properties of null (reading 'width') at createPS1Renderer ...
  // THIS ERROR KEEPS HAPPENING EVERY TIME I SAVE OR REFRESH PLEASE FIX IT"*). Session 202 taught the page
  // to repair the damage; this session takes away the surface that was being damaged.
  //
  //   1. WHAT WAS BEING EATEN. The store's copy of `index.html` was a strict SUFFIX of the real file:
  //      `fetch_generator("adapt-")` returned exactly `good.slice(501)` — the first 501 characters
  //      deleted, the cut landing mid-comment immediately after a newline. Seven occurrences seen now:
  //      **501, 622** (four times), **796, 917, 1,377, 4,844, 5,412** — always whole leading LINES,
  //      always a prefix, never a mid-file edit.
  //   2. SO THE FILE IS TOO SMALL TO HURT NOW. `index.html` was 242,641 chars: the whole DOM in the
  //      first 39,515, then ONE 203,004-char `<style>` with two base64 faces inside it (one of them an
  //      88,401-char line), then the module tags. It is now a ten-line shell — an empty `#game`, a
  //      `<link>` to `src/game.css`, the module tags — and the markup it used to carry lives in
  //      `src/gameui.js` as GAME_MARKUP, extracted VERBATIM (it is static HTML; there was no pjs in it).
  //   3. AND THE SHELL PUTS ITSELF BACK. `src/gameui.js` is `main.js`'s FIRST import: it returns
  //      immediately unless `#view` is actually missing, and otherwise rebuilds the body from
  //      GAME_MARKUP and ADOPTS every element the cut left alive into its own place — live nodes win, so
  //      nothing that survived is thrown away and nothing is duplicated, and `#game` keeps its identity
  //      so tagtext.js's MutationObserver still sees it. The old HUD mirror's job is subsumed: this is the
  //      WHOLE DOM, not just the HUD. `src/hudmarkup.js` is deleted.
  //
  // See the session 203 row in SPEC.md and "THE FRONT-CUT BUG" in README.md. --------------------------
  { head: "THE FILE THAT CANNOT LOSE ITS HEAD" },
  { tag: "S203", text: "**the error that survived every save and refresh is gone for good**: the editor was handing the page a copy of `index.html` with its **first lines cut off**, and the canvas and the HUD went with them — so `index.html` is now **ten lines**, and there is nothing up there left to lose" },
  { tag: "S203", text: "if a cut takes any of that shell, the whole UI is rebuilt from `src/gameui.js` with every element that survived put back exactly as it was" },
  { tag: "S203", text: "the 203 KB stylesheet moved out to `src/game.css`, so the editor is never again asked to hold a 242 KB `index.html`" },
  // ---- session 202: THE PAGE THAT REPAIRS ITSELF. The first pass at this bug: the page learned to put
  // its own DOM back from a mirror of the HUD's markup (`src/hudmarkup.js`), verified against
  // deliberately truncated copies of `index.html` — 900 characters off, then 6,000 off, both booting
  // clean with every element present exactly once and the HUD drawing. Session 203 replaced that mirror
  // with the whole shell and deleted the file, so what is left of 202 is the habit of testing against a
  // CUT copy and the hedge on the `<meta viewport>`. ---------------------------------------------
  { head: "THE PAGE THAT REPAIRS ITSELF" },
  { tag: "S202", text: "**the crash that survived every refresh was handled**: the editor occasionally fed the page an `index.html` with its first ~622 characters cut off — the canvas and the HUD's wrappers — and the game put its own DOM back and booted anyway" },
  { tag: "S202", text: "the page stopped carrying a `<meta viewport>` in the body, which is what the cut ate first — the engine already sets the viewport in the head" },
  // ---- session 201: THE BAKE THAT HIJACKED THE GAME, AND A BIGGER DECK (the user's *"everytime a
  // refresh the same bug happens and also there 2 dummies at the start of the map and the skate board
  // code is not finished and make the skate board bigger and also my camera freezes at the same angel
  // when i walk a bit ... i walked a little then suddenly my character goes to the spawn point and 1
  // extra dummy spawns and my camera freezes to a same postion"*). Three of those sentences were ONE
  // bug, and the other two were the deck.
  //
  //   1. THE THREE SYMPTOMS WERE ONE BUG, and it was the editor's own skill-icon bake. `beginPlay()`
  //      SCHEDULED it (session 186), so it ran about **1.5 s AFTER the player pressed PLAY**: it took
  //      manual mode and drove the sim itself, it STAGED the body and the lens (writing the rig's yaw
  //      and calling `respawn()`), and its cleanup EMPTIED `enemies.list` WITHOUT removing the groups
  //      from the scene. That is the report, in that order: the body JUMPS TO SPAWN, the leaked dummy
  //      is still standing where it was made while a fresh one spawns beside it (TWO dummies), and
  //      `setManual(false)` never restores `mouseLook` — so the mouse is DEAD and the camera "freezes
  //      at the same angle". It runs at BOOT now, behind the title card, before the player can press
  //      PLAY; a PLAY taken mid-bake is HELD, not swallowed. Verified from a cold load: press PLAY,
  //      then walk 8 s — **0** teleports, **1** dummy, `mouseLook` true on **300 of 300** frames, and
  //      the scene's child count flat.
  //   2. THE DECK IS 1.5x BIGGER, and it is a SCALE rather than new numbers. All of `boardMesh` is
  //      drawn through one `BOARD_SIZE`, so the deck, the kicks, the trucks and the wheels stay in
  //      proportion by construction. It scales about the mesh's ORIGIN — the deck's top face, the
  //      plane the feet stand on — so the solved stance is untouched and the wheels simply hang 1.5x
  //      further below it. The ride's height is then re-TAKEN off that mesh's own box rather than
  //      reasoned about: **-0.130 -> -0.195**, so `P.BOARD_LIFT` is 0.195, and `BOARD_ROAD` is written
  //      as the DIVISION (0.195 / 1.351) rather than as a literal so the two cannot drift. Measured
  //      riding: the deck's box sits **0.000** on the road once the mount settles.
  //   3. THE BOARD'S OWN READ-OUTS, which is what "the skate board code is not finished" was. The
  //      code already CLAIMED the HUD names the trick that just landed (see `tickRideState`) and
  //      nothing did: a whole mechanic with rules and no voice. There is a **mint tag** under the
  //      melee's counter now that names each flip as it comes round, the state label says **RIDE /
  //      POWERSLIDE / THE BOMB** (a rider at 10 m/s used to read "SPRINT", which is what he was doing
  //      BEFORE he got on), the debug `hintText()` has the deck's own lines, and the KEY WALL finally
  //      mentions the skateboard at all — a mechanic the start screen had never pointed at.
  //
  // See the session 201 row in SPEC.md and "THE SKATEBOARD" in README.md. ---------------------------
  { head: "THE BAKE THAT HIJACKED THE GAME, AND A BIGGER DECK" },
  { tag: "S201", text: "the **bug that ate every run** is fixed: the editor's skill-icon bake was scheduled off **PLAY**, so ~1.5 s into a game it teleported the body to spawn, left a leaked dummy standing (two on the map at once) and killed the mouse look. It runs at boot now, behind the title card" },
  { tag: "S201", text: "the **skateboard is 1.5x bigger**, drawn through ONE scale so nothing can fall out of proportion — and the ride height is re-measured off the mesh (**0.195**, was 0.13), so the wheels still sit exactly on the road" },
  { tag: "S201", text: "the deck finally **says what it is doing**: a mint tag names the flip that just landed (**KICKFLIP**, **SHUVIT**, ...), and the state reads **RIDE / POWERSLIDE / THE BOMB** instead of the old **SPRINT**" },
  { tag: "S201", text: "and the start screen **mentions the skateboard at all** for the first time — how to get on it and what its keys do" },
  // ---- session 200: A DECK FOR THE STREET (the user's *"add skateboard and make me able to get on it
  // and do flips with it and stuff u can take animations from the marketplace if you have to but make
  // the slide mech and dive and all the stuff unqiue for it not the same make able to get on it by
  // pressing E"*). A new PROP, a new set of STATES, and the last sentence is the whole design: the
  // board's moves share nothing with the ones already on those keys but the key.
  //
  //   1. THE BOARD IS A PROP FIRST. It lies at the spawn as a `drop` (`BOARD_HOME`, past the ball and
  //      clear of the bag), so gravity, the wall, the boot and the pickup are machinery that already
  //      exists. Two things are its own: it rests on its WHEELS and nothing else (`PROP_REST_AXES`,
  //      so a board left on its side lays itself flat), and it is taken with `M2` — exactly the
  //      ball's bargain — which is what leaves `E` free to RIDE, the brief's own key (*"by pressing
  //      E"*). Mounting PARENTS the deck into `tiltG`, so the board, the shoes and the ground's lean
  //      are one thing and no per-frame solve keeps them together. `P.BOARD_LIFT` is the one number
  //      the rig needs, and it is MEASURED off the mesh rather than chosen: the wheels hang **0.130**
  //      world units under the deck's top face, so 0.13 puts the shoes on the deck and the wheels on
  //      the road. At 0.15 the whole ride FLOATED 0.02 u — and `mountBoard` reads the height off the
  //      same box, so the two can never disagree.
  //   2. RIDING IS THREE STATES, not a modifier (`player/board.js`). `ride` is the mode: the deck is
  //      the floor, the wish CARVES the line and never accelerates, the only engine is a PUSH cadence
  //      (1.70 u/s a kick, 0.30 s apart — **3.3 kicks a second**), the rolling drag settles it in the
  //      low teens, and the run's own `MAX_SPEED` cap is LIFTED for the whole of it, because a hill
  //      is what takes a board faster than a man can run. `bslide` is the POWERSLIDE — a BRAKE whose
  //      scrub (16-26 u/s²) grows with speed, nothing like the on-foot slide that holds its own — and
  //      it is the only way to stop on a board. `bbomb` is the BOMB — a body thrown AT the deck under
  //      1.55x gravity with the travel GROWN (6.5 u/s²) rather than spent, and the ONE landing in the
  //      game that keeps its speed (`BBOMB_LAND_KEEP` 0.92).
  //   3. THE STANCE IS SOLVED, and getting it wrong took a skeleton render to see. A skater does not
  //      stand the way he travels: the pelvis is turned a full QUARTER TURN across the deck
  //      (`BOARD.yaw` -1.5708), because that is the yaw at which the model's own ankle stand-off
  //      (`ANKLE_X`, 0.2 rig units) points ALONG the deck — the feet then spread nose-and-tail with
  //      the solved roll at **0.000 rad front / 0.019 back** (measured), where any other yaw spends
  //      that stand-off as abduction and LIFTS the drawn shoe by `ANKLE_X · sin(phi)`. `boardLeg` had
  //      been written with the hip offset MISSING from its parameter list while all three call sites
  //      passed it, so every argument behind the missing one shifted and the roll came out at
  //      **-1.706 rad** — both legs thrown sideways, the shoes a hand's width off the deck. And
  //      `BOARD.hipY` is 0.905 (a **48-degree** knee, measured through `legIK`) where it was first
  //      written at 0.735, which is a **93-degree sitting squat**. Every stance number is measured,
  //      none reasoned about.
  //   4. AND TWO OLD NUMBERS WERE WRONG. `P.BOARD_POP` is 10.5 u/s — 0.32 s of rise, **1.67 u** of
  //      clearance, 0.64 s of air, which is the air a trick is thrown in (the comment had claimed
  //      6.7 u off a mis-set vertical). `P.BBOMB_LAUNCH` was hard-coded at 3.4, which made the whole
  //      bomb **eight frames (0.13 s)** from the press to the road — a stumble; it is 5.5. And the
  //      MISS is a RULE now, not an accident: an OLLIE can never miss, nor anything thrown from near
  //      a standstill, and only a SPIN trick thrown at speed that arrives almost stopped does.
  //
  // See the session 200 row in SPEC.md and "THE SKATEBOARD" in README.md. ---------------------------
  { head: "A DECK FOR THE STREET" },
  { tag: "S200", text: "there is a **skateboard** now: take a loose one with the **right button**, **step on it with `E`**" },
  { tag: "S200", text: "**hold forward to push** (a cadence, not a throttle), **carve** with the stick, and ride it down a hill faster than a man can run" },
  { tag: "S200", text: "**`M1` is a trick** (kickflip / heelflip / shuvit / 360 shuvit / body varial), **`SPACE`** is the **ollie**, **`M2`** holds a **manual**" },
  { tag: "S200", text: "**`SHIFT` is a powerslide** — a real brake, not the on-foot slide — and **`F` is the bomb**, a dive thrown at the deck, the one landing that keeps its speed" },
  { tag: "S200", text: "the whole **stance is solved foot by foot** off the rig, and every number in it is measured (the first one was off by an argument and threw both legs sideways)" },
  // ---- session 199: A NEW HANG, A REAL LEAP, AND A QUIETER WALL (the user's *"the wall climb idle
  // animation looks bad delete it and make a new one from scratch also and take heavy inspiration
  // from the wall climbing animation and make sure it looks good and the wall climb jump animation
  // the leap looks meh fix it up a little and the vfx for the climb it too much just change the
  // sound sfx for the climb"*). Four things, all on the wall.
  //
  //   1. THE HANG IS REBUILT OFF THE CLIMB CLIP. The old rest stance was hand-authored, and that was
  //      the problem: it parked the body on four holds the climb ANIMATION never occupies, so the
  //      moment you stopped steering the pose stopped matching the move you had just been doing. The
  //      new one is read OFF the clip — `CLIMB_PARK` is the climb's own frame at **phase 0.967**, the
  //      one where all four limbs are nearest the stone, with each hand and foot then walked out
  //      until it actually touches it (MEASURED stand-offs from the plate, rig units: **-0.014,
  //      -0.036, -0.003, +0.009** — every limb within 5 cm of the stone). So the hang IS the climb,
  //      just parked: both hands planted, one knee folded up, the other leg braced down. Breath,
  //      weight shift, a look around and a re-grip ride BETWEEN the holds rather than moving them.
  //   2. THE LEAP'S ARMS WERE BARELY UP. The jump's "overhead" lead arm was **8° above horizontal** —
  //      `POSEX` 0.8 scales every pose table, and nobody had multiplied by it when the number was
  //      chosen. It is `-3.35` now (**26° short of straight up**), the trailing arm sweeps wide, and
  //      the hips get squared: the climb clip underneath tilts them **35°** and the overlay has to
  //      take that out or every limb angle in the leap is measured against a tilted body.
  //   3. THE CLIMB STOPPED FOGGING THE SCREEN. What the wall was shedding every second was about
  //      **two puffs, half a chalk ring and twelve trickle-puffs** — a pale haze sitting right where
  //      the animation was. It is ONE small, faint pop off the HAND that just gripped (a foot knocks
  //      almost nothing loose), on the clip's own contact beat, and nothing in between.
  //   4. AND THE CLIMB'S SOUND IS ONE GRIP, NOT TWO. It had been ticking from two places at once — the
  //      clip's beat AND a leftover 0.24 s timer — for **9.8 ticks/s of the same hiss** (counted on
  //      the live page). The timer is gone, and the tick is re-voiced: the body's WEIGHT on the hold,
  //      the grit under it, and a short edge on top, with the clip's own contact index riding along so
  //      a **hand and a foot are different sounds** instead of four identical clicks a cycle. See the
  //      session 199 row in SPEC.md. ------------------------------------------------------------
  { head: "A NEW HANG, A REAL LEAP, AND A QUIETER WALL" },
  { tag: "S199", text: "the wall **hang is a new animation** built off the climb itself — both hands planted on the stone, one knee folded up, the other leg braced down" },
  { tag: "S199", text: "the **wall leap throws his arms up properly** now — they were barely above level before" },
  { tag: "S199", text: "climbing no longer **fogs the screen**: one small pop off the hand that grips, instead of dust off everything" },
  { tag: "S199", text: "the climb **sounds like one grip at a time** now (it was ticking over itself), and a **hand and a foot are different sounds**" },
  // ---- session 198: A HELD SHOT, AND THE BOOT THAT DELIVERS IT (the user's *"add a better ball shoot
  // animation and make shooting the ball chargeable"*). Two things, and the second one re-times the
  // first.
  //
  //   1. THE SHOOT IS AN AUTHORED SHAPE. It used to be a BAKED clip (`Strike_Foward_Jog` from
  //      `src/tools/action-bake/`) slerped through a `SHOOT_Q` track; that is gone from the file
  //      entirely. In its place is a six-beat table — SET / PLANT / COCK / RELEASE / FOLLOW / SETTLE —
  //      of 26 columns, every one of them the same signed channel the other poses in streetwear.js
  //      use, so the strike is tuned in the same breath as the throw and the slam. The boots are
  //      solved onto PLACES rather than joint angles (`legIK` from the foot's own spot), which is what
  //      aims the strike at the ball: MEASURED, the striking boot's own box gets within **4.3 cm** of
  //      the ball's centre at phase **0.563** and covers the ball's launch place from 0.563 through
  //      0.685, and the launch fires on that beat — `SHOOT.release` is **0.56**, i.e. where the boot
  //      arrives rather than the table's own RELEASE row at 0.62, which fired a frame or two after the
  //      boot had already swept past the ball.
  //   2. THE BUTTON IS A HOLD, and this is the bigger half. M1 with the ball at his feet used to fire
  //      the strike outright; now the press only WOUNDS IT UP — the shape runs to its COCK beat and
  //      STANDS there (with a small slow tremble while it does), the power fills over
  //      `SHOOT_CHARGE_T` 0.75 s, and **the strike is the button coming up**. One button, no mode:
  //      MEASURED off the deck, a two-frame tap comes off at power 0.13 → 9.5 u/s and 2.1 of loft (a
  //      pass), a 0.5 s hold at power 0.80 → 21.3 u/s and 3.8 (already more than the old single speed
  //      of 15.5/3.2, whatever you did), and a 0.75 s hold caps at **24.4 u/s** and 4.4 — and the
  //      swing is snapped by the power too (`SHOOT_SWING_MIN` 0.20 s off a tap to 0.34 s off a full
  //      charge), so a pass is quick and a screamer winds through. A ball that gets away mid-wind-up
  //      CANCELS the shot (the phase walks home at `SHOOT_UNWIND_RATE`; the table's first and last
  //      rows are the same pose, so the fade has nothing to cover), and a swing at a ball that has
  //      rolled off is a WHIFF that plays out with nothing under the boot rather than dragging a ball
  //      in from across the street.
  //   3. ...AND THE HOLD SHOWS ITSELF. The coil deepens with the charge (`SHOOT_BUILD`: another 7.5 cm
  //      of dip, a few degrees more wind in the pelvis and the shoulders, the elbows closing), and the
  //      charge wears the SAME in-world meter the wall pull has — `ClimbMeter` with the `over` argument
  //      (see climbar.js), in the ball's own colour, coming on with the wind-up and gone off the
  //      release's tail. The prompt asks for the hold: `[M1] SHOOT (HOLD TO CHARGE)`.
  //   4. ...AND THE LEGS KNOW WHEN THEY ARE NOT THE STRIKE'S. The coil is a PLANT — one boot nailed to
  //      the deck — which is a lie the moment the body is MOVING, because a charge is up to a second of
  //      standing on the ball: a player who winds one up at a run used to go on down the street with
  //      both feet sliding under him. So the shape takes the HIPS AND LEGS only as far as the body's
  //      speed allows (`ballLower` / `legWeight`, `SHOOT_LEG_STILL` 1.6 to `SHOOT_LEG_RUN` 4.5: 1
  //      standing, 0 at a run) and keeps the trunk, the head and the arms throughout — the coil reads
  //      on a moving body as a coil, not as a skate. It hands the lower half back to the shape FAST
  //      when the button comes up (`SHOOT_LEG_TAKE` 0.06 s — the whip cannot wait for its leg) and
  //      away from it slowly (`SHOOT_LEG_GIVE` 0.20 s — a plant dissolving into a stride is a step,
  //      not a cut). See the session 198 row in SPEC.md. ---------------------------------------------
  { head: "A HELD SHOT, AND THE BOOT THAT DELIVERS IT" },
  { tag: "S198", text: "shooting the ball is a **charge** now — **hold M1** to wind up, **let go to strike**: a quick tap is a pass, a full hold is a screamer" },
  { tag: "S198", text: "a **new shoot animation**: he plants, coils up, whips the boot through the ball and follows through — and the boot is **aimed at the ball itself**, so it connects on the beat it should" },
  { tag: "S198", text: "the charge **shows itself**: the coil sinks deeper and winds tighter the longer you hold it, with a **meter filling beside you** in the ball's colours" },
  { tag: "S198", text: "**you can wind it up on the run** — his legs keep striding while the shot loads, so a moving charge doesn't slide with him" },
  { tag: "S198", text: "a hit that carries further the harder you strike it — and **if the ball gets away mid-wind-up the shot cancels** and he stands back up" },
  // ---- session 197: TWO WAYS OVER, AND DONE BY THE WALL (the user's *"make the vault has only front
  // flip animation and jump over animation and make it get done before the wall not when i direnctly
  // touch the wall and make it fluent and it doesnt have to be super fast and snapy make it match the
  // palyer speed but faster"*). Three things. (1) THE VAULT WEARS TWO STYLES, not five: the
  // hand-plant sweep the user calls the **jump over**, and the **front flip**. The side flip, the
  // handstand and the cartwheel are deleted outright — their poses, their `vaultTurn` branches and
  // their apex entries — and the pick is an even coin that can never repeat, which with two styles
  // comes out as a strict alternation: every other rail is the flip. (2) IT IS DONE BEFORE THE WALL.
  // A flipping style used to turn over the WHOLE crossing, so it was still
  // coming round at the far side and through the drop. The revolution now completes at
  // **`VAULT_SQUARE` 0.62** of the crossing — which is 68 % of the TRAVEL, and the vertical only
  // starts to drop at 0.74 of the clock — and the tuck is out on the same beat, so the body is
  // SQUARE AT THE TOP and the whole descent is walked out square instead of being the end of a spin.
  // MEASURED over a spread of crossings (approach 1.2-4.0 u, speeds 7-22 u/s, a 0.6 rail and a 1.4
  // crate; catches from a 0.42 to a 0.81 gap): the turn reads 1.82 revolutions at k 0.61 and exactly 2.00 from the
  // square-up to the landing, and the square-up lands **0.03-0.14 world BEFORE a rail's far face**,
  // with the body still at the apex. (3) THE PACE IS THE RUN'S. The crossing is
  // `d / (speed x VAULT_PACE 1.25)` now — it crosses a quarter faster than the body arrived — and
  // the old 0.30 s ceiling is gone with it: that ceiling was what the user was feeling, because it
  // turned every slow vault into a fast one (a 6.2 u/s run crossed at 9.8). A 7 u/s arrival now takes
  // 0.314 s, a 13 u/s one 0.170 s, and the landing comes off at the old `VAULT_EXIT` (measured 10.9
  // out of 10.9 on a held run into a rail). The move also ENDS at the box: `VAULT_LAND` 0.30 -> 0.12,
  // so the body comes down with its near edge 12 cm past the far face rather than 30. See the session
  // 197 row in SPEC.md and the vault bullet in README.md. -----------------------------------------
  { head: "TWO WAYS OVER, AND DONE BY THE WALL" },
  { tag: "S197", text: "the vault has **two ways over: a front flip and a jump-over** — the side flip, the handstand and the cartwheel are gone" },
  { tag: "S197", text: "the **flip is squared away before the wall** — it used to still be turning at the far side, so the drop was the end of the spin" },
  { tag: "S197", text: "it is **paced by your run**: the crossing is **a quarter faster than the speed you arrived at** (a jog gets a fluent vault, a sprint a fast one)" },
  { tag: "S197", text: "and it **lands at the rail** instead of a stride past it" },
  // ---- session 196: THE WALL RUN PLANTS ITS HAND (the user's *"make the arm thats next to the wall
  // still when im wall running"*). The wall run's wall-side arm was the run cycle PLUS a HAND solved
  // onto the face, and that hand was the one part of it that moved: the plan's `along` was driven by
  // the run's own arm swing (`WALL_HAND.slide`, 0.17 rig each way), so the palm swept up and down the
  // plate once per stride, in step with the pumping arm on the other side. The user's read of that is
  // the honest one — a wall run's wall-side arm is a PLANT, and an arm sweeping while the other one
  // pumps is a second, competing loop. So the plan is FIXED now (`along` = `WALL_HAND.fwd`, and the
  // `slide`/`swingMid` dials are gone), and the only thing left moving the arm is the contact itself.
  // MEASURED on the live rig over a real wall run: the palm's travel along the face went from **28.6 cm
  // a stride to 4.2**, and the whole arm's own swing is **17-18 degrees** against the free arm's
  // **76**. The plan also had to be made REACHABLE: with the hand low (`up` 0.10) the arm has no slack
  // at the far end of the stride, `wallHand` clamped, and the palm popped ~5 cm off the stone once per
  // stride (measured: stand-off 0.187-0.242). `up` is **0.18** now, which fits the whole stride inside
  // the arm — the palm holds 0.187-0.190, a 2 mm range — and the arm swings no worse for it. The free
  // arm, the legs and the run cycle itself are untouched. See the session 196 row in SPEC.md and the
  // wall-hand bullet in README.md. -----------------------------------------------------------------
  { head: "THE WALL RUN PLANTS ITS HAND" },
  { tag: "S196", text: "**wall running plants the arm that is on the wall** — it used to drag the hand up and down the wall with every stride" },
  { tag: "S196", text: "the palm now **holds its spot on the stone** for the whole run, and it no longer floats off it mid-stride" },
  { tag: "S196", text: "the running arm on the open side is untouched — that one still pumps" },
  // ---- session 195: THE BLOCK HAS TWO SHAPES AND A WALK IS THE TWO-HANDED ONE (the user's *"make the
  // block animation when im walking slowly normal 2 hands block make the one hand bash block thing
  // only when im running fast"*). The block wears one of two shapes — the boxer's TWO-HANDED guard
  // (both forearms up in front of the face) or the "bash" (the right forearm up across the eyes with
  // the left arm left to the run) — and which one was picked by `runBlend`, which is already at full
  // at 1.6 u/s: a slow WALK. So the guard lost its two-handed shape the moment it took a step, and
  // standing still was the only way to see the boxing block. It is picked by SPEED now: the whole of
  // the guard's walk (up to `BLOCK_WALK`, 3.2) is inside the two-handed shape, and the one-hand bash
  // is what a body that is genuinely RUNNING wears (a sprint, or the charge's own 13.5) — the charge
  // still shows it at any speed, because a charge IS the bash. The block's BODY is untouched (it
  // still hands itself over to the run cycle exactly as it did), so the walk, the run and the charge
  // all move as they always have. See the session 195 row in SPEC.md and the block bullet in
  // README.md. ---------------------------------------------------------------------------------------
  { head: "A WALKING BLOCK IS THE TWO-HANDED ONE" },
  { tag: "S195", text: "**blocking while walking now keeps the proper two-handed boxing guard** — it used to drop to the one-arm shape as soon as you took a step" },
  { tag: "S195", text: "the **one-arm bash** (forearm across the eyes) is now only what you wear when you are actually **running fast**" },
  { tag: "S195", text: "the charge is unchanged — it is the bash whatever speed you are going" },
  // ---- session 194: A FREE FALL ROLLS OUT OF ITS LANDING (the user's *"add better landing animation
  // for free fall make it when i free fall make a new animation and make it i roll from the free dont
  // make have a start up like it is now just make it i land and i do a little parkour roll then get on
  // my feet"*). The landing a big fall wore was the standing ABSORB (weight onto the heels, both arms
  // out for balance) — a CATCH, and exactly the "start up" the user is rejecting. It is replaced by the
  // running lunge's own MISS ROLL (the tuck, the whole-revolution turn and the rise onto the feet — a
  // shape the game has had since session 89 but never shown, because the lunge is unwired), entered
  // STRAIGHT at the roll with the little hop in front of it skipped, so there is nothing between the
  // feet finding the deck and the body going over. The thud, the dust and the impact are all still the
  // landing's own, a held SHIFT still slides instead, and a soft landing still just catches itself.
  // See the session 194 row in SPEC.md and the roll-out bullet in README.md. -------------------------
  { head: "A FREE FALL ROLLS OUT OF ITS LANDING" },
  { tag: "S194", text: "**a big fall lands in a roll now** — he hits the deck and goes straight over into a parkour roll, then up onto his feet" },
  { tag: "S194", text: "**and there is no wind-up at all** — no brace, no hop, no catch: the roll starts the frame your feet touch the ground" },
  { tag: "S194", text: "the thud and the dust are still there (going over hits the deck as hard as catching it does), and the roll carries whatever you were drifting when you landed" },
  { tag: "S194", text: "hold **SHIFT** through the landing and you still slide instead, and a small drop still just catches itself" },
  // ---- session 193: THE CLASH HAS A VOICE (the user's *"make m1 clashing has better vfx"*). The
  // lock's FX were BORROWED and then ABANDONED: ONE burst off the shared `impact`/`ward` on the frame
  // the two limbs met, and nothing at all for the whole shoving match — seconds of a silent,
  // motionless stalemate with a meter up in the corner, so mashing looked like standing still.
  //
  //   1. THE MEETING (`clashMeet`, effects.js): the biggest star in the game, a cross of light
  //      through the point, VERTICAL hoops in the plane the two of them are squeezing between them,
  //      a wide deck ring (both of them are planted) and sparks thrown both ways down their line.
  //   2. EVERY PRESS IS A SHOVE (`clashPress`), and the sides are told apart by COLOUR — the
  //      player's gold, the body's cold blue — so a mash reads as a tug of war, not one flurry.
  //   3. THE PRESSURE UNDER BOTH (`clashGrind`): a hot halo that grows with the race, embers CARRIED
  //      down whichever side is winning, a slow pressure hoop and a crackle along the line.
  //   4. THE RELEASE, per side: a win lets go upward, a loss is the body's fist arriving, a dead
  //      heat throws its sparks both ways at once.
  //   5. THE CAMERA TURNS ONTO THE PAIR'S FLANK for the lock, because from the chase line the
  //      player's own back is the whole picture and the contact is behind it.
  // See the session 193 row in SPEC.md and the clash bullet in README.md. ------------------------
  { head: "THE CLASH HAS A VOICE" },
  { tag: "S193", text: "**m1 clashes are loud now** — a 16-point flash, a cross of light and two vertical shock rings right where the two of them meet" },
  { tag: "S193", text: "**every mash press throws its own shove** — yours gold, the enemy's cold blue, so you can see who is winning the push" },
  { tag: "S193", text: "the lock **grinds** while it lasts (a hot contact, embers and a crackle between the limbs) and the camera swings onto the pair's **flank** so you can actually see it" },
  // ---- session 192: A WHIFF IS A FRONT FLIP ONTO THE PAVEMENT (the user's *"make the miss animtion
  // for skill 2 is that he does a front flip if he doesnt catch an enemy he falls on the ground like
  // a ragdoll/stun for 0.67 seconds"*). The old miss was a 35° fold over the player's own lap,
  // unwound on the landing as he caught himself — a stumble, and the user has replaced the read.
  //
  //   1. THE AIR IS ONE FORWARD SOMERSAULT (`SCISSOR_MISS_FLIP`), wound off the leap's own ballistic
  //      hang (`scissorAirT` = 2v/g) so the turn and the fall are one motion. It stops one lie short
  //      of square, so the BACK takes the deck: a body that missed does not land it on its feet.
  //   2. THE DECK IS A KNOCK-DOWN (`SCISSOR_MISS_DOWN`, the user's 0.67 s — the enemy ragdoll
  //      clock's twin): the game's OWN downed shapes (`poseHurt`'s `down` then `getup`) for the flop
  //      and the rise, i.e. exactly what every enemy wears on its back.
  //   3. HE IS BEDDED ON THE DECK by his lowest drawn vertex (the enemies' own `restOnDeck` solve,
  //      `solveDeckClamps`), eased so the hand-out from the air IS the flop.
  //   4. THE CAMERA COMES DOWN WITH HIM, and the standing landing absorb stands down for the whiff.
  // The scissor's HIT path (the neck, the throw, the landing) is byte-identical. See the session 192
  // row in SPEC.md and the whiff bullet in README.md. ----------------------------------------------
  { head: "A WHIFF IS A FRONT FLIP ONTO THE PAVEMENT" },
  { tag: "S192", text: "miss skill 2 and he **front-flips all the way over** and lands flat on his back — nothing catches, nothing stops him" },
  { tag: "S192", text: "he then **stays down for 0.67 s** like a knocked-down body, gets up off the deck, and the camera goes down with him" },
  { tag: "S192", text: "it is the game's own **knocked-down animation** (the one every enemy wears), so he goes down exactly like everybody else" },
  // ---- session 191: THE RAGDOLL HAS A CLOCK (the user's *"REWORK THE ENTIRE RAGDOLL/STUN SYSTEM ITS
  // SO BAD AND A LOT OF STUFF IS BROKEN MAKE THE LONGEST RAGDOLL ANIMATION IS 0.67"*). The loose
  // phase had no single owner, so five things disagreed about how long it lasted:
  //
  //   1. ONE CLOCK. `E.RAGDOLL_T` (0.67) is the ceiling on the whole loose phase, and `ragT` counts
  //      against it every flight frame. A throw's pop is clamped to `g*T/2`, the exact launch whose
  //      hang IS the clock.
  //   2. ONE TURN. `ragSpinFor()` ignores the lie — every ragdoll is exactly `RAGDOLL_TURNS` (1.0)
  //      revolution, solved by `ragSpinTime`/`ragSpinRate` over the hang that is actually left, so a
  //      body arrives flat whatever it was launched from (was 0.75/1.0/1.5 turns off a coin toss).
  //   3. THE BOUNCE MUST FIT. The deck's skip only fires if its hop ends inside `RAGDOLL_T`.
  //   4. A SWING DIES WITH THE BODY. A stun clears `atkT`/`atkDone`, so nobody punches from the deck.
  //   5. EVERY STUN OWES A BEAT. `standUp()` sets `atkCd` to `E.STUN_RECOVER` (0.5) on every
  //      reaction's exit, so a body that just got up doesn't swing again immediately.
  // Verified by fuzzing 14 real moves: every ragdoll now hangs ≤ 0.65 s with `turns` 0.94-1.0 (was
  // up to 1.63 s). See the session 191 row in SPEC.md and the ragdoll bullet in README.md. ---------
  { head: "THE RAGDOLL HAS A CLOCK" },
  { tag: "S191", text: "every **loose body** now runs off **one 0.67 s clock** — a throw's pop is capped to fit it, and the tumble rate dies exactly at the end" },
  { tag: "S191", text: "a ragdoll does **one clean revolution** every time — the same somersault off a face-plant, a back-landing or a shoulder-roll (it used to pick one at random)" },
  { tag: "S191", text: "a stun now **kills the swing that was in the air**, and a body that just stood up **waits half a second** before it attacks again" },
  // ---- session 190: SKILL 2 CATCHES A BODY OUT OF THE AIR (the user's *"make the 2nd skill catch
  // airborne ragdoll enemy/dummy"*). The head scissor used to refuse a loose body outright — the aim
  // skipped it, so the press whiffed and painted the body with the red "you cannot hit this" cue.
  // It now takes one, on exactly the terms skill 1's flying knee has taken one since session 155:
  //
  //   1. THE RULE IS IN THE AIM. `Enemies.nearest` grew `airRagdolls` (a ragdoll counts while it is
  //      still OFF THE DECK) and `ragBand` (a world-Y window), and both apply to the RAGDOLL ONLY —
  //      aiming at a live body is untouched. The band is what stops the move snatching a body out of
  //      the sky from twenty metres below it.
  //   2. ONE BAND, TWO ENDS. `scissor()` aims inside the very window its own contact tests, so the
  //      aim and the bite cannot disagree about who was in reach.
  //   3. THE BITE IS ALLOWED THROUGH THE GUARD. `scissorContact` takes ragdolls from its wedge (then
  //      drops the grounded ones back out) and jolts with `force: true` — inert on a live body.
  // A ragdoll LYING ON THE DECK is unchanged: still refused, still a whiff, still its red cue.
  // See the session 190 row in SPEC.md and the air-catch bullet in README.md. ---------------------
  { head: "SKILL 2 CATCHES A BODY OUT OF THE AIR" },
  { tag: "S190", text: "the **head scissor now catches an airborne ragdoll** — juggle a body with skill 3 and pluck it out of the sky with **2**" },
  { tag: "S190", text: "same terms as skill 1's knee: it counts while it is **off the deck**, and only as high as the leap could have reached" },
  { tag: "S190", text: "a ragdoll **lying on the floor** is still nobody's business — the whiff and its **red outline** stay exactly as they were" },
  // ---- session 189: GRAB THE BALL WITH M2, AND SLAM IT (the user's *"make me grab the ball from m2
  // instead of E and make me able to slam it and it spins like how we did for the bag make me when i
  // press E on it it does nothing"*). Three changes, one prop, and the duffel's own live code earning
  // a second user:
  //
  //   1. M2 IS THE BALL'S OWN BUTTON. The ball's def asks for it (`takeM2`), the empty-handed M2
  //      branch tries it before the totes' chord (`takeBallM2`, `BALL_TAKE_R` 2.0), and `interact`
  //      skips every `takeM2` prop — so **E on the ball does nothing at all**, which is the user's
  //      own rule. M2 with the ball already in hand is the second half, below.
  //   2. M2 AGAIN SLAMS IT. A new authored shape (`BALL_SLAM` in streetwear.js, the throw's own
  //      six-beat writer, now `poseBallBeats`) takes the ball up over the head and drives it into the
  //      deck a step ahead (`slamHands` / `releaseHandSlam`), on the duffel's slam numbers.
  //   3. IT SPINS LIKE THE BAG. The whole of `SLAM_SPIN` goes on the ball's SIDE axis with a vertical
  //      component of exactly zero, and it comes off the deck LIVE (the leap, the hot window, the
  //      one-hit-then-cold rule) — the duffel's own live code, generalized off the bag (`hotBag` →
  //      `liveStep`) so a live ball and a live bag are the same machine.
  // See the session 189 row in SPEC.md and the ball bullet in README.md. ---------------------------
  { head: "GRAB THE BALL WITH M2, AND SLAM IT" },
  { tag: "S189", text: "the **ball is M2's now** — M2 beside it puts it in your hands, and **E on the ball does nothing**" },
  { tag: "S189", text: "M2 again **slams it into the deck**, and it comes off **rolling on its side**, exactly like a slammed bag" },
  { tag: "S189", text: "and a slammed ball is **live** the same way: it leaps off the deck and homes — **one hit, then it's a ball again**" },
  // ---- session 186: SKILL 3's ICON, AND ICONS THAT BAKE THEMSELVES (the user's *"make skill 3 icon
  // the new animation and make the skills in the feature automatically do that"*). Two halves:
  //
  //   1. SKILL 3's ICON IS SHOT FROM THE CARRY. `src/hud/skill3.png` had a problem its own note
  //      recorded: it was baked before session 114 closed the capoeira's arms, and re-baking it against
  //      the current CONTACT was measured as a plain vertical blob from every angle (the strike puts
  //      every limb on top of the body) — so the file had been left wearing an older pose rather than
  //      degraded. The fix the note named is the code now: `SKILL_ICON_CFG[2]` photographs the CARRY,
  //      the beat where the body has righted itself over the hips with the legs stepped forward onto
  //      presented soles and the arms opened WIDE, which is the one shape of this move that has a
  //      silhouette. It is taken at 0.72 through the carry and SQUARE FROM BEHIND — the view the chase
  //      camera already has of the move — and the angle was picked at the button's own 34 px.
  //   2. THE ICONS BAKE THEMSELVES IN THE EDITOR. A beat after the first play, the editor bakes all
  //      three icons off the live rig at the shipped size and swaps them onto the HUD, so a pose that
  //      has just been retuned can never leave the preview wearing a stale picture. The published game
  //      is untouched — it keeps the baked PNGs in `src/hud/`, which is the whole reason the bake is
  //      gated to the editor at all.
  // See the session 186 row in SPEC.md and the icon notes in README.md. -----------------------------
  // ---- session 188: A LIVE BAG IS DONE AFTER ITS ONE HIT (the user's *"make it once it hit the
  // enemy once it gets back to its orginal physics"*). The bag used to come off a body still LIVE —
  // still homing, still fed by the player's moves, still a blur — and ran its ten seconds out that
  // way, so its own hit started its career rather than finishing it. `hotBag` job 3 drops
  // `bag.hot` to zero ON the hit, and that one flag is the whole live bag: the homing, the spark
  // trail and the `grip` override all end with it (the stepper is handed an ordinary prop's bounce,
  // drag and spinDrag again — 0.35 / 6 / 5 — and the deck's ordinary 9/s no-slip grip takes the
  // tumble back), so the duffel the hit leaves behind is a plain prop you can boot around again.
  // `HOT_T` is a ceiling for a bag that never finds anybody, not the usual end of one.
  // See the session 188 row in SPEC.md and the live-bag bullet in README.md. ---------------------
  { head: "ONE HIT, THEN IT'S A BAG AGAIN" },
  { tag: "S188", text: "a live bag is **done after its one hit** — the moment it lands on somebody it drops back to ordinary, bootable bag physics" },
  { tag: "S188", text: "so there is no **endless homing blur**: one hit, then it is a bag again" },
  // ---- session 187: THE SLAMMED BAG SPINS ON ITS SIDE AXIS (the user's *"make it when i slam a bag
  // it spins only in side axis"*). One axis, moved:
  //
  //   1. THE TURN IS THE SIDE AXIS'S. `SLAM_SPIN` used to be handed to `bag.spin`, which is the deck
  //      plane's `ang.y` — the duffel went into the deck like a spinning TOP. The whole of the rate
  //      is now about `up x forward`, the axis ACROSS the drive, which is the axis the deck's own
  //      roll already grips and so the axis a rolling duffel is read on: same 38 rad/s, same blur,
  //      and the vertical component is not small, it is zero.
  //   2. A LIVE BAG NEVER PUTS A FLYWHEEL BACK. The two beats that re-arm its turn — a move of the
  //      player's landing on it, and a body it runs into — wrote `bag.spin` too; both go through a
  //      new `sideSpin(o, ax, az, min)`, which puts the turn on the side axis of whatever line the
  //      bag was just thrown along and keeps its sign.
  //   3. THE DECK DOES NOT BRAKE THAT TURN. A live bag names its own `grip` (HOT_SPIN, 0.7) instead
  //      of an ordinary prop's 9, so the no-slip drag cannot pull the slam's blur off it inside the
  //      first landing it makes.
  // See the session 187 row in SPEC.md, and the live-bag bullet in README.md. ---------------------
  { head: "A BAG THAT TUMBLES" },
  { tag: "S187", text: "slam a bag and it **spins on its side axis** — end over end now, instead of like a spinning top" },
  { tag: "S187", text: "and a **live bag keeps it there**: the moves you land on it and the bodies it hits all turn it over that same axis" },
  { head: "A NEW LAUNCH ICON" },
  { tag: "S186", text: "**skill 3's icon** is the capoeira's **launch pose** now — arms thrown wide, legs under him — instead of the old unreadable blob" },
  { tag: "S186", text: "and the skill icons **rebuild themselves off the animation** while you work in the editor, so they can never go stale again" },
  // ---- session 185: THE STAFF — CARRIED LEVEL, VAULTED OVER, AND WITH A SPINE (the user's *"fix the
  // pole hold animation make the player hold it horizantaly and titled a little and the arm is
  // straight down and make when the player double jump its not holdable anymore the player does a
  // front flip with the stick aiming forward and he stirkes the ground with it wich launches far
  // forward in the air and make the pole have spine animation bones idk whats called and make sure you
  // use when the pole is moving at a high speed to make it look for fluent and animated and make it
  // look fluent and good"*). Four things, one staff:
  //
  //   1. THE CARRY IS HORIZONTAL, IN A STRAIGHT ARM. The old carry STOOD the staff UP at his side,
  //      gripped a third of the way up, the butt a hand's width off the street and the tip a
  //      half-body over his head — which is the "flag" the user was looking at. `POLE_CARRY`
  //      (streetwear.js) is re-keyed around three numbers: `pitch` 1.34 (the shaft LEVEL and 13°
  //      above horizontal, so the far end clears a run's bob), `hf` 0.50 (the grip at the MIDDLE, so
  //      the rod is balanced in the fist — wood each way, forward past the thigh and back past the
  //      calf), and `gy` 0.83 (the take-point at THIGH height, which is what makes the arm STRAIGHT:
  //      the grip measures 0.570 rig off a 0.607 shoulder — a 94 % reach, with a hair of bend).
  //      `POLE_CARRY_LIFT` (config) goes to 0: the old lift existed to stop a VERTICAL staff's butt
  //      dragging through the deck at the bottom of a stride, and a level one at the hip never
  //      reaches it. The RIGHT arm is untouched — one fist on a staff leaves the other free, which is
  //      the whole reason the carry is one-handed.
  //   2. THE DOUBLE JUMP IS A FRONT-FLIP VAULT, NOT A HOLD. The Shaolin balance is GONE (sessions
  //      143-183): *"its not holdable anymore"* is exactly that hang, which took the stick, hung the
  //      body off its tip and spent the launch on the button's RELEASE, with a floor and a ceiling on
  //      the hold to police. The double jump now spends itself on `polevlt` — a ONE-SHOT front flip
  //      (`POLE_VAULT_T` 0.60) with the shaft driven forward and DOWN until its tip meets the deck,
  //      and THAT beat (`POLE_VAULT_HIT` 0.50, the bottom of the revolution where the rig is
  //      inverted) fires the launch (forward at `POLE_LAUNCH_V` 44, rise `POLE_LAUNCH_UP` 33 —
  //      deliberately OVER the run's `MAX_SPEED` 36) and snaps the staff. The staff holds its WORLD
  //      aim while the body flips under it (`o.pitch = aim(t) − flip(t)`) — the one thing that
  //      separates a vault from a stick on a Catherine wheel — and the flip DIVES onto the plant
  //      (`POLE_VAULT_DROP` 26, floored by `POLE_VAULT_FLOOR` 1.6 so an inverted head can't bury
  //      itself). The plain double jump's own flip is the −2π BACKFLIP and is never reused: this is a
  //      FORWARD revolution (+2π), read once through `poleFlipAngle` (clocks.js) by both the rig and
  //      the staff so the drawn body and the aimed wood can never disagree.
  //   3. THE SHAFT HAS A SPINE. `POLE.SPINE` (pole.js) bends the shaft along its length as an ARC of
  //      constant curvature (`bendShaft`), applied to the main geometry AND its welded outline, so the
  //      ink bends with the wood. The driver is the tip's velocity RELATIVE TO THE BUTT, taken in the
  //      shaft's own frame: a staff merely carried at a 36 u/s sprint is dead straight, and only the
  //      rod's own rotation through the air (a swing, a whip, a throw) bends it. It goes through an
  //      underdamped spring (`STIFF` 250 / `DAMP` 23), so a hard swing rings once and settles — which
  //      is the "fluent" the user was asking for, and why the effect can never flap while he runs.
  //   4. ONE SHAPE, THREE READINGS. The carry the flurry grows out of, the vault the double jump
  //      spends and the spine under both all read the staff's own ends off `POLE_CARRY`, so the wood
  //      moves through every one of them without a hitch to hide.
  // See the session 185 row in SPEC.md and the staff bullets in README.md. -------------------------
  { head: "THE STAFF: LEVEL, VAULTED, SPINED" },
  { tag: "S185", text: "he carries the staff **level, tilted a little, in a straight-down arm** now — held out at his side, not standing up like a flag" },
  { tag: "S185", text: "the double jump is a **one-shot front-flip vault**: he flips over the stick, **rams it into the ground** and it **throws him far forward** — and it is no longer holdable" },
  { tag: "S185", text: "the staff has a **spine** now — the wood **bends and whips** when it's swung fast, and stays dead straight when you're just running with it" },
  // ---- session 184: A MODERN BAG, AND ARMS THAT ACTUALLY HOLD IT (the user's *"make a better bag
  // model that looks like modern bags and make it grey not brown and make the hold animation actually
  // holds the bag not the arm far away from the bag and make the player item hold animation blend in
  // with his running animation like what we did for the block"*). Three things, one prop:
  //
  //   1. THE BAG IS GREY, AND IT IS A BAG FROM NOW, not a bag from 1970. The old shape was a brown
  //      leather holdall — a rolled leather lid, a belt round the middle, a buckle strap down the
  //      front, two studs and a pair of leather hoops — and the COLOUR was doing the ageing more than
  //      the geometry: leather-brown reads as OLD whatever you do to the silhouette. `bagMesh` in
  //      inventory.js is rewritten around a grey nylon duffel: a long top ZIP (coil, tape, slider and
  //      both pulls), two flat webbing handles plus a padded shoulder strap that snaps off as ONE
  //      group, a flat front zip pocket, a shoe pocket at the end, reflective piping down both long
  //      faces and a small mint patch (the character's own trim colour). The HULL keeps the old
  //      stations, so the silhouette and the eight wear decals that were authored against it are
  //      unchanged; the rest are lofts turned onto the bag's own length by an `alongX` helper. Every
  //      material is named for its new job (`shell`/`shellMid`/`shellLo`/`webbing`/`tape`/`reflect`/
  //      `metal`/`accent`) and all of them feed `userData.dmg` and `userData.skin`, so the wear ramp,
  //      the snap-apart and the paint-damage tinting all still work. Item icon, ink and the holder's
  //      CSS theme were re-keyed to the same grey.
  //   2. THE HOLD HAD THE BAG FIFTY CENTIMETRES FROM HIS HANDS. `BAG_HAND` — the offset from the
  //      midpoint of the two hand bones to the bag's base — was `{0, -0.313, -0.052}`: the hands sat
  //      0.42 *above* the bag's base and out in the air beside it, which is exactly the "arm holding
  //      nothing" the user saw. It is `{0, -0.096, -0.022}` now, MEASURED off the running rig rather
  //      than guessed (the cradle `poseTote` paints puts the hands at torso-local y -0.049 / z 0.293
  //      and the bag's base at y -0.145 / z 0.269 — that gap, in the character's frame). The `TOTE`
  //      angles were retuned to match: the arms come down and in (elbow -1.76 -> -1.00, up -0.30 ->
  //      -0.20), and the palms end up ON the bag's end panels with 0.539 u between them.
  //   3. THE HOLD RIDES THE RUN, and this is the same bug session 180 fixed in `poseCarry`.
  //      `poseTote` was ALSO writing the torso, the hips and the head absolutely, so a sprint carrying
  //      the duffel had the run's lean overwritten (measured: the run leans `torso.rotation.x` 0.437
  //      and the hold was standing it up). Those writes are gone — the trunk's fold and the head go
  //      through `poseAdd` (an ADDITIVE layer), the hips' one-shot value is a delta off `HIP_Y`, and
  //      the yaw/roll zeroes were deleted — so the run is the run underneath with both arms busy.
  //      `poseTote` also now writes the arms' TWIST explicitly, because the idle writes ±0.45 while
  //      the run writes 0, which was worth 0.15 of hand separation: standing and sprinting both hold
  //      the bag at 0.539 now instead of the hands opening off it at speed.
  // See the session 184 row in SPEC.md and the duffel bullets in README.md. ------------------------
  { head: "A MODERN BAG" },
  { tag: "S184", text: "the duffel is a **grey modern bag** now — zip, straps, pockets and reflective piping, instead of a brown leather holdall" },
  { tag: "S184", text: "he actually **holds it with both hands** — the bag sits in his arms, right against his palms, not floating out at his elbows" },
  { tag: "S184", text: "and the hold **rides your run** — the same stride as the block puts on, so it doesn't straighten you up when you sprint" },
  // ---- session 183: A BETTER BALL THROW (the user's *"add a better ball throw animation"*). The
  // throw WAS the keeper's drop kick — the window of `Goalkeeper_Drop_Kick.fbx` session 180 baked —
  // and the user was right that it is not a throw. What was measured on the live rig: the ball left
  // the hand on the clip's own release key (0.6177 of the shape) while the throwing hand was STILL
  // DOWN AT THE HIP (0.39 fwd / 0.74 up in the body's frame) and the trunk had barely started to
  // fold, because what the clip releases on is the BOOT coming through — a punt with a ball in the
  // hand. So this is not a retune of that clip but a different shape, and it is AUTHORED:
  //
  //   1. THE THROW IS A POSE NOW (the `THROW` table in streetwear.js: six beats — DRAW, COCK, RELEASE,
  //      FOLLOW, SETTLE — of trunk / head / arm angles, blended channel by channel and applied with
  //      the same helpers every other move in the file uses). It starts and ends on `CARRY`'s own arm
  //      numbers, so it grows out of the carry and settles back into it with nothing to hide. Measured
  //      on the rig in the body's own frame (fwd/left/up, off `player.facing`): the throwing hand goes
  //      hip (0.29, -0.52, 0.28) -> out and up (-0.03, -0.72, 0.62) -> up behind the head (-0.40,
  //      -0.56, 1.24 — the COCK) -> over the top (0.68, -0.24, 1.19 — the RELEASE) -> across and down
  //      (0.37, 0.12, 0.45) -> home. `poseAdd` is new and is what makes it a LAYER: an ADDITIVE write,
  //      so the trunk's fold and the head ride whatever the body is ALREADY doing instead of replacing
  //      it — the same bug session 180 fixed in the old `poseCarry` (a throw at a sprint no longer
  //      stands the run's trunk up: measured `torso.rotation.x` 0.45 -> 0.76 through the release,
  //      where an absolute write would have pulled it to 0.16). The ball arm is absolute because the
  //      carry owns it; the trunk's twist is absolute because the throw's coil has to read the same
  //      every time the button goes.
  //   2. THE BALL LEAVES ON THE RELEASE BEAT. `THROW_RELEASE` is 0.60 (a beat of the shape, not a
  //      key of a clip) and the two things that fire on it are the hand and the ball: the ball hand
  //      OPENS over the tenth of the shape after it (a fist that stays shut while the ball leaves it
  //      reads as a stuck hand), and `releaseHandThrow` sends the mesh off the hand's own world point
  //      — measured leaving at 11.4 u/s against `BALL_THROW_V` 11.5, i.e. no pop, the arc starts on
  //      the arm's own speed. The ball passes the head on the way through and never touches it
  //      (measured minimum clearance 0.15 u).
  //   3. The clip is NOT deleted: `src/tools/action-bake/` still carries it and its README says so —
  //      it is the record of where the old shape came from. NEITHER CLIP IS LOADED ANY MORE: session
  //      198 authored the shoot the same way, so `actionTables()` and the `_actQ` slerp are gone and
  //      the game fetches no clip at all (the bake's own output stays as the record of the two
  //      shapes the game used to wear).
  // See the session 183 row in SPEC.md and the ball bullets in README.md. --------------------------
  { head: "A BETTER THROW" },
  { tag: "S183", text: "the throw is a **real overhand throw** now — the ball is swept back **past his ear** and whipped through, instead of a drop-kick shape" },
  { tag: "S183", text: "the ball leaves his hand **at the top of the throw**, not while his arm is still down at his hip" },
  { tag: "S183", text: "his hand **opens on the ball** as it goes, and the throw **leans into a sprint** instead of standing him upright" },
  // ---- session 182: THE WARDROBE CAMERA, AND THE PAGE THAT HAD LOST ITS HEAD (the user's *"when i
  // go to the wardrobe section and im in a place lower than the avg like starting place or higher my
  // camera gets weird and it makes the camera view from above the player head fix that please"*).
  // Two separate absolute-world assumptions inside the same forty lines of `showcaseCamera`:
  //
  //   1. THE FLOOR WAS A NUMBER. The showcase eye was floored at an absolute y of 0.4, which is
  //      "just above the ground" only in a world whose ground is flat at 0. The hills spawn you on
  //      the SUMMIT and everything is downhill of it, so anywhere below y ≈ 0 the eye stayed pinned
  //      at 0.4 while the body went on down: measured at the bottom of a valley, the eye was
  //      **20.18 u above** the body at a pitch of **83.6°** — a shot down the top of his head, which
  //      is the screenshot he sent. The floor is the deck now, read the way `follow`'s own deck guard
  //      reads it (the higher of the body's feet and the ground under the CAMERA's spot).
  //   2. THE GUTTER WAS THE WRONG CARD. Which side of the screen the body is framed in is measured
  //      off the options card, and `document.querySelector(".optCard")` matched the UPDATE LOG's card
  //      — same class, sits above `#options` in the markup, and is `display:none` unless the log is
  //      open. Its zero rect made the "free side" the whole viewport and the lens shift **0 on every
  //      frame**: the body was framed dead centre behind the very panel it was written to stand clear
  //      of, and on a phone behind the bottom sheet entirely. It asks `#options` for its own card now.
  //   3. ...AND index.html HAD LOST ITS FIRST 917 CHARACTERS. `<canvas id="view">`, the `#game`/`#hud`
  //      wrappers and the dial's own box were gone, which is a hard error on the first line of main.js
  //      (`getElementById("view")` is null) — i.e. nothing on the page at all. Rebuilt; see README.md.
  { head: "THE WARDROBE CAMERA" },
  { tag: "S182", text: "the wardrobe's close-up no longer ends up **looking straight down at the top of his head** when you're down in the hills" },
  { tag: "S182", text: "and he now stands in the **gap beside the options panel** like he was always meant to, instead of behind it" },
  { tag: "S182", text: "rebuilt the page's own **canvas and HUD markup**, which had gone missing and stopped the game loading at all" },
  // ---- session 181: THE WALL, FOUR WAYS (the user's *"make the wall climb jump the same animation as
  // the sky fall landing but make the player look up and fix the wall climb sfx and change the wall
  // climb idle and make it the same animation as the wall climb but depending one what hand was
  // touching the wall like if the right hand was touching the wall and the player stops climbing then
  // stop the animation on the right hand thats touching the wall if it was the left hand the same
  // thing add vfx for climbing"*). Four unrelated pieces of the wall, done together because they are
  // all the same feature to the player:
  //
  //   1. THE LEAP WEARS THE SKYFALL'S LANDING. `poseClimbFly` now reads `FALL_BRACE` — the one shape
  //      every fall ends in — for the hips, both legs, the trunk, both arms and the grip, so the hop
  //      off the face is limb-for-limb the brace the skyfall lands on (verified on the live rig:
  //      identical channels), with the ONE override a wall needs: the head, pitched UP the stone
  //      (`CLIMB_FLY.head` -0.55 against the brace's +0.34) instead of down at a deck that is not
  //      there — the user's *"make the player look up"*.
  //   2. THE CLIMB HAD NO SOUND. `Sfx.climbTick` had sat in audio.js unused since it was written —
  //      everything past the first grab was silent. It fires now off the clip's own contacts
  //      (`floor(climbPhase * CLIMB_BEATS)`, four a cycle: two hands, two feet), so the tick IS the
  //      animation re-gripping, at whatever tempo the body is climbing (measured ~9/s).
  //   3. THE HANG HOLDS THE HAND IT WAS HOLDING. The parked stance had only ever planted ONE side, so
  //      a body that stopped with its other hand on the stone swung that hand off the hold and grabbed
  //      with the one the clip had in the air. The side is read off the climb itself (`readClimbHand`:
  //      whichever palm is nearer the face, compared in the RIG's frame so it is the animation's
  //      answer and not the speed lean's, and read at the TAIL of a frame because the bones are the
  //      rig's neutral rest at the head of one) and handed to the stance.
  //   4. THE CLIMB SHEDS GRIT. A pale puff at whichever of the four limbs is actually on the plate, on
  //      every contact beat, plus a thin fall of dust down the face between them and a chalk mark on a
  //      hand's contact — all in the stone's own colour, lifted so it can be seen against it.
  // See the session 181 row in SPEC.md and the climb sections in README.md. ------------------------
  { head: "THE WALL, FOUR WAYS" },
  { tag: "S181", text: "the wall **climb jump** now wears the **skyfall landing** shape — same brace, but his face is **up the wall**" },
  { tag: "S181", text: "the climb makes **sound** at last — a dry scrape on every hand- and foot-hold, in step with the animation" },
  { tag: "S181", text: "let go of the stick and he **holds on with the hand that was actually on the wall** — not always the same one" },
  { tag: "S181", text: "climbing **kicks up grit** now: dust off the stone at every grip, and it trickles down the face" },
  // ---- session 180: THE BALL BECOMES A BALL (the user's *"dont make a separate animation of the run
  // when im carrying the ball make it the same animation as the run but the arm im carrying with
  // have like its own animation like what we did for the block and make the soccer a little more
  // bigger and make it actully smart not just a ball like make it easier to control with the player"
  // + *"heres an animation for when the player throws the ball (Goalkeeper Drop Kick.fbx) it doesnt
  // have ball animations so your gonna have to make them"* + *"make me if i m1 while im controlling
  // the ball make me do a shoot and heres the shooting animation (Strike Foward Jog.fbx) this one
  // also doesnt have a ball animation"* — THREE things, all of them the same insight: the ball is a
  // BALL, not a prop that happens to be round.
  //
  //   1. THE CARRY IS AN ARM, NOT A WALK. `poseCarry` (session 179) was a LAYER, but it made the
  //      mistake of writing the TORSO and the HEAD as well as the arm — `poseRot("torso","x",CARRY.lean)`
  //      and a head turn. At a sprint the run authors a 0.68 trunk lean and the carry wrote it back to
  //      -0.024, so carrying the ball literally swapped the run cycle out for a different (upright)
  //      walk — exactly the *"separate animation"* the user saw. The torso and head writes are GONE:
  //      `poseCarry(bones, u, t, stride, strideAmt)` now writes ONLY the carrying arm, and it rides
  //      the stride (`CARRY.swing` 0.055, `upZ`, the elbow closing by `step * 0.55`), so it is the
  //      run underneath with one arm carrying — the same bargain the block's guard already made.
  //   2. BIGGER, AND SMARTER. `PROP_ROLL_R.ball` 0.24 -> **0.28** (a 0.56-unit ball). And the ball is
  //      no longer a loose object you chase: `control: true` on the def plus a CONTROL pass in
  //      `inventory.update`'s drops loop steers a ball at the feet toward where the body is GOING
  //      (`BALL_TOUCH_R` 1.55, `AHEAD` 0.72, blend `MATCH` 9.0 to `player.vel`, cap `MAXV` 11), so a
  //      running player keeps it in front of him instead of leaving it behind — and the boot's touch
  //      is a soft `kick` (2.3 + 0.14·speed, 0.45 loft) rather than a punt.
  //   3. A SHAPE FOR EVERY WAY THE BALL LEAVES. Both new clips are Mixamo and BOTH travel in place and
  //      TURN (the keeper's pelvis yaws -72° -> +65°, the striker's -25° -> +55°), and neither has a
  //      ball, so the bake (`src/tools/action-bake/`) keys ONE WINDOW of the clip, at every key
  //      premultiplies the hips' local quaternion by Ry(-yaw) to cancel the turn, and drops the hip
  //      translation — the rig is then moved by the game. It emits `THROW_Q`/`SHOOT_Q` (rotations
  //      only, the 16 `ACTION_BONES`), and `poseBallAction` slerps the rig onto them as a one-shot
  //      (clamped at the last key). [GONE as of session 198: the shoot is an authored beat table too
  //      now, so nothing in the game reads a baked clip — see the note under this block.] **The
  //      release keys** (the throw's `THROW_RELEASE` 0.6177, read off the keeper's clip; the shoot's
  //      own `SHOOT_RELEASE` 0.3173, which session 198 replaced with the shape's own measured beat)
  //      are where the authored ball
  //      motion is handed off: `throwHands`/`releaseHandThrow` fires the carried mesh out of the hand
  //      on that frame, `shootBall` launches a controlled ball off the boot on that frame. The ball's
  //      arc is authored in `inventory.js` (`BALL_THROW_V`/`_UP`, `SHOOT_V`/`_UP`), not in the clip.
  //      Input: `M1` while the ball is in the HANDS = the throw (Goalkeeper Drop Kick); `M1` while a
  //      controlled ball is at the feet = the shoot (Strike Foward Jog). Both stand the punch chain
  //      down for that press.
  // See the session 180 rows in SPEC.md and the ball bullets in README.md. -----------------------------
  // (Session 183 replaced the THROW's shape: the keeper's clip it describes is a punt, and the throw is
  // an authored beat table now — see "A BETTER THROW" at the top of this array. Session 198 did the
  // same to the SHOOT — see "A HELD SHOT, AND THE BOOT THAT DELIVERS IT" — so this clip is history
  // too, and the game no longer loads either one.)
  { head: "THE BALL BECOMES A BALL" },
  { tag: "S180", text: "running with the ball is now **the run** — only the carrying **arm** has its own animation, so no more separate walk" },
  { tag: "S180", text: "the soccer ball is **bigger**, and it's **smart**: it stays with you as you run instead of rolling off, so it's much easier to keep at your feet" },
  { tag: "S180", text: "**M1 with the ball at your feet is a SHOOT** — a stride into a low forward boot sweep (Strike Foward Jog)" },
  { tag: "S180", text: "**M1 with the ball in your hands is a THROW** — an overhand wind-up and release (Goalkeeper Drop Kick)" },
  // ---- session 179: BIGGER BALLS, AND HANDS TO CARRY THEM (the user's *"make all the balls bigger
  // and make if i try to pick up with my hands i pick it in my hands normally and if i double click
  // in my bag or an avable inventory that has the capacility to take the size of the ball then it
  // can if it cant and i double click shake the ui and make it light up with red"* — THREE changes
  // to the one item, and they are all about the same thing: a ball is something you HOLD.
  //
  //   1. BIGGER. `PROP_ROLL_R.ball` 0.14 -> 0.24 world units of radius — a 0.48-unit ball against a
  //      1.9-unit body. Nothing else had to change, and that is the point of the shape being a
  //      NUMBER rather than a mesh: the rest height is `radius` (`propSupport`), the roll rate is
  //      `radius`, and the scuff is drawn at `BALL_R * …`. The one read-out that moves is the spin a
  //      kick wants: 0.24 at a kicked 10 u/s wants 30 rad/s where 0.14 wanted 51, so the `angMax` 70
  //      is clear air now instead of the ceiling it was leaning on.
  //   2. THE HANDS. E did not pick a thing up so much as teleport it into a pocket; now it goes into
  //      a HAND — a fourth home after the two pockets, the back and the arms (see "THE HANDS" at the
  //      head of inventory.js). `this.hands` is one item, `takeToHands` is the one door in (it
  //      REUSES the dropped prop's own mesh, so the thing in your hand is the thing that was on the
  //      deck, bruise and all), M1 throws it and E sets it down. It is WORN (`syncCarry`): parented
  //      to the torso and pinned to the carried hand, with `poseCarry` (new, streetwear.js) swinging
  //      that one arm out and forward — the arm is a LAYER over whatever state the body is in, the
  //      same bargain the duffel in both arms already made, so he can carry it at a run, through a
  //      slide and off a wall. The skill keys stand down while a hand is full, for the same reason
  //      they do with the duffel in both arms.
  //   3. THE DOUBLE-CLICK. A double-click in the editor is the stash: what you are holding goes into
  //      the container you double-clicked, if it fits — and if it does not, the container SHAKES and
  //      LIGHTS UP RED (`deny`). A double-click on a TILE with an empty hand is the other direction:
  //      it comes OUT into your hands. It is caught on the CAPTURE phase of `#invStage` and anchored
  //      on the CLICK POINT rather than the element (`DBL_SLOP`), because the first press of a
  //      double-click does its own job — and for a label that job is "bring this holder up", which
  //      re-renders the stage so the element under the second press is not the one under the first.
  //      The shake is DRIVEN from JS frame by frame, not keyframed: this environment freezes CSS
  //      timelines when the document is not the foreground one (the note `.invPop` already carries),
  //      so a keyframe shake is a shake that may simply never run.
  // See the session 179 row in SPEC.md and the carry's own bullets in README.md. --------------------
  { head: "BIGGER BALLS, REAL HANDS" },
  { tag: "S179", text: "the **soccer ball is bigger** — a proper ball at the hip rather than a marble at your feet" },
  { tag: "S179", text: "**E picks things up into your HANDS** now: the ball rides in his hand as he runs, slides and vaults — **M1 throws it**, **E sets it down**" },
  { tag: "S179", text: "in the inventory, **double-click a board to stash** what you are holding, or **double-click a tile to take it out** into your hands" },
  { tag: "S179", text: "a container **too small to take it lights up red and shakes** instead of quietly doing nothing" },
  // ---- session 178: A BALL AT THE SPAWN (the user's *"add a new item soccer ball i can pick it up
  // and put it in my bag and make its slot size make sense and make kicking it around doesnt lower
  // its durability and stuff but it lowers it by like 0.0001 or something for realstic reasons"*).
  //
  // It is a PROP, not a special case: the ball is a `drop` — the same kind of loose object a key
  // becomes when it falls out of a pocket — that starts the game PLACED (`dropAt`) instead of thrown,
  // so the boot, the wall collision, the ground, the pickup and the prompt all already knew it. What
  // the def adds is the ball's own nature:
  //   * `cells` 2 x 2, which is what a round thing costs a board: it does NOT fit a pocket (1 x 2) and
  //     DOES fit the duffel (5 x 4), and `storeInPockets` now asks the bag too — but only while it is
  //     with him (worn, in his arms, open, or on the deck within 3.2 — `bagReachable`), so a ball can
  //     never be posted into a duffel left across the map.
  //   * it is ROUND, which is not decoration: a prop's support height and its settle-to-a-face are
  //     both read off its bounding BOX, and a sphere read off its own box rests half-sunk in the deck
  //     and then visibly rotates its pattern square when it stops. `round` (support = the radius) and
  //     `settle: false` (the tumble is bled, not squared) turn both off.
  //   * it BOUNCES (0.52 off a landing) and KEEPS ROLLING (ground drag 1.7 against a box's 6), and it
  //     may turn at 70 rad/s instead of 44 (`angMax`) — a 0.14-radius sphere at a kicked 10 u/s wants
  //     51, and the box ceiling would have clipped it into a skid.
  //   * `damageScale: 0.00001` — EVERY knock it takes is scaled at `damageItem`, the one door all item
  //     damage comes through: a full-speed boot costs a ten-thousandth, a slam into a building two or
  //     three of them. Not immortal; a ball.
  // Its shell is a `detail`-2 icosahedron with the twelve pentagons PAINTED onto the vertices (see
  // `paintBallPanels` — a facet belongs to a pentagon when all three of its corners are within 34.4
  // degrees of one icosahedron vertex, which carves the real truncated-icosahedron pattern and needs
  // no panels to align), and its tile on the board is a 2 x 2 white "BALL" well.
  //
  // ...and it exposed THREE THINGS THAT WERE ALREADY WRONG, all of them about props on the deck:
  //   1. THE BOOT COULD NOT REACH THE GROUND. The contact test was `|prop.y - body.y| < 1.5`, and the
  //      body's centre is at the chest: a duffel standing on the deck misses that window by a hair and
  //      a ball sitting on it by 0.4, so the kick only ever connected with something already airborne.
  //      It is measured over the body's own SPAN now (`inFootReach`: soles to head).
  //   2. A KICK WAS A PER-FRAME GRIND. The branch had no cooldown of its own, so a prop the body was
  //      inside at speed was re-kicked every frame — ten damage a frame to a key (it shattered in four
  //      frames, before the boot had visually connected) and a fresh punt every 16 ms to the ball,
  //      which juggled it off the shin instead of kicking it. `KICK_CD` (0.24 s) makes it one punt per
  //      contact, which is also what lets a ball be DRIBBLED.
  //   3. E HAD NO SENSE OF WHICH THING WAS NEARER. The duffel had first refusal on E anywhere inside
  //      2.8 units, which was fine while the only other thing E could mean was a pocket's contents;
  //      with a ball lying two metres from the bag it meant E skipped over the ball you were standing
  //      on. `interact` and its prompt now take whichever is NEARER (the bag keeps the tie).
  // See the session 178 row in SPEC.md and the ball's own bullets in README.md. -------------------
  { head: "A BALL AT THE SPAWN" },
  { tag: "S178", text: "a **soccer ball** sits at the spawn — **run into it and you boot it**, and it rolls and bounces like a ball should" },
  { tag: "S178", text: "**E picks it up**: a ball is **too big for a pocket**, so it goes in your **bag** — it takes **2 x 2** on the duffel's board" },
  { tag: "S178", text: "kicking it around **costs it almost nothing** — a **ten-thousandth** of its health a boot, for the realism, so you can hammer it all day" },
  // ---- session 177: THE SKIP LEAPS LIKE THE PAD (the user's *"can you make the climb jump/skip be
  // double the distance it can cover and can u make the animation when he hops the same animation as
  // when the player uses a jump pad but a little diffrent and can u add like vfx for the climb
  // jump/skip and make a meter next to the player in game not the ui a vertical meter shows how much
  // the charge is charged and make the meter the same color as the thing hes climb jumping from"* —
  // FOUR things, all of them about the one move.
  //
  //   1. DOUBLE THE DISTANCE. `P.CLIMB_SKIP_BASE` 1.30 -> 2.60 and `CLIMB_SKIP_GAIN` 7.45 -> 14.90, so
  //      a full coil now covers 17.40 world units where it covered 8.70 (the skip's own `_TRIM`
  //      profile is exact, so "double the charge" IS "double the rise" — measured live at charge 0.95:
  //      16.76 wanted, 16.76 risen). `CLIMB_HAUL_RISE` went 0.30 -> 0.60 with it, because it is a rise
  //      THRESHOLD that decides when the limbs let go: with travel twice as fast the old threshold
  //      would have released the haul in half the time, and the beat is supposed to be the same length.
  //   2. THE PAD'S LEAP. A new overlay pose, `poseClimbFly` (the `CLIMB_FLY` table in streetwear.js):
  //      the launch pad's rising soar, arms apart, with ONE deliberate difference — the leading arm
  //      punched overhead past -PI/2 instead of swept, so the skip reads as its own move. Blended in
  //      off the pull by `player.climbFly`, which ramps 0->1 over `P.CLIMB_FLY_IN` (0.14 s, the pad's
  //      own fade) while the load rises and back out over `CLIMB_FLY_OUT` (0.18 s).
  //   3. THE VFX. The release reports `climbskip` (a `lastClimbSkip` snapshot of the face point, its
  //      normal and the spent charge, in player.js), and main.js drains it into wall grit, a puff and
  //      a lift-off flash — all in `surfaceColorAt(..., floor = false)`, the FACE's colour — plus a
  //      `post.flash` above charge 0.45; a per-frame wake puffs off the face for as long as
  //      `climbFireT` is live. So the skip throws the wall it came off rather than the ground.
  //   4. THE METER — `src/climbar.js`, a small in-world bar beside the body (NOT the HUD): a dark
  //      frame, a fill grown from its own bottom by `player.climbCharge`, and a bright cap on the fill's
  //      head. It billboards at the camera, stands on the camera's right, rides the pull's own weight
  //      (`climbLoad`) so it fades in with the coil and out with the fire, and its COLOUR is the face's
  //      own — read straight off `player.wall.c.c`, the array that collider is painted with. (The first
  //      cut probed `surfaceColorAt` for it and read the biome's MEADOW GREEN: `gap` is the body's
  //      SURFACE stand-off, so a sample at `gap + 0.14` still lands in the air outside the stone.)
  //      See the session 177 row in SPEC.md.) ----------------------------------------------------
  { head: "THE SKIP LEAPS LIKE THE PAD" },
  { tag: "S177", text: "the wall **skip covers twice the distance** now — a full coil throws him **17 units** up the face where it used to manage eight and a half" },
  { tag: "S177", text: "he **flies it like a launch pad** — the same soaring leap, but the **leading arm punches up over his head** on the way, so the skip is its own move" },
  { tag: "S177", text: "letting go **kicks the wall's own dust, grit and glare** off the face he is leaving, in that wall's colour — and trails it behind him through the flight" },
  { tag: "S177", text: "there is a **charge meter beside him in the world** while he winds up: **filled from the bottom**, and **painted the colour of the thing he is climbing**" },
  // ---- session 176: HE STEPS OUT OF THE DOTS (the user's *"make the player when im the wardrobe
  // section appear over the dim and over the comic dot effect thing only the player like hes
  // breaking the 4th wall or something"*. The wardrobe's dim + Ben-Day dots are the options
  // overlay's own DOM background (`--comic-dim`), and the body is drawn in `#view` UNDER it, so he
  // was dimmed and dotted like the paused world. A canvas cannot go above a DOM overlay, so the body
  // gets a canvas of its own (`#heroLayer`, a child of `#options` between its background and the
  // card): a second WebGL pass that draws ONLY him, off the same showcase camera and the same
  // low-res grid, so he lands on his own dimmed ghost and stands in front of the print. Driven by
  // the `showcase` blend, so he lifts out of the dots as the section scrolls in. See "THE HERO
  // LAYER" in index.html, `renderHero` in main.js, and the session 176 row in SPEC.md.) ------------
  { head: "HE STEPS OUT OF THE DOTS" },
  { tag: "S176", text: "in the **wardrobe** the character stands **over the dim and over the comic-dot screen** now — bright, in front of the printed panel, while everything else stays dimmed behind him" },
  { tag: "S176", text: "he **lifts out of the dots** as the wardrobe scrolls into view and **settles back into them** as it leaves, like he is leaning out of the frame" },
  // ---- session 175: THE MISS FADES OUT (the user's *"make the grab miss has a better fade out
  // animation"*. Every skill pose hands back to the ground pose on `SKILL_POSE_FADE` (0.07 s), which
  // is right for a move that ends SETTLED — a take lands on a hero pose. The grab's MISS is the one
  // that ends PARKED (see `poseGrabMiss`: the freeze wears the lean he never got to spend), so that
  // quick hand-off cut out of it. It now hands off on its own `P.GRAB_MISS_FADE` (0.30 s), with the
  // weight EASED (smoothstep) so the parked stance sets back down rather than leaving at a constant
  // rate. See "THE RIGHT-CLICK GRAB" in `updateVisual` and the session 175 row in SPEC.md.) --------
  { head: "THE MISS FADES OUT" },
  { tag: "S175", text: "a **missed grab** sets itself back down now — the whiff ends parked mid-stumble, and it used to **snap** upright in a twentieth of a second; it **fades out** over a proper beat instead" },
  { tag: "S175", text: "the grabs that LAND still hand off on the quick clock — only the miss, which ends off-balance, gets the longer, eased one" },
  // ---- session 174: THE PAD THROWS BODIES TOO (the user's *"make the dummy get launched from the jump
  // pad normaly like a player"*. The launch pad fired only the player; a body placed on its plate just
  // stood there. The player's arc SOLVER was pulled out of `Player` into a free function `launchArc`
  // in player.js, and `Enemy.padLaunch` now uses the SAME one, so a body standing on the plate is
  // fired on the identical arc and lands on the same roof. The flight places the body on the arc each
  // frame with no collision (like the player's own `launch` case) and hands it to `landed` at the far
  // end, where it gets up. Gated on `idle`/`walk` so a body that lands ON the plate stands up first,
  // and `E.PAD_CD` is the same lockout the player has. See `Enemy.padLaunch` in enemies.js, `launchArc`
  // in player.js, and the session 174 row in SPEC.md.) --------------------------------------------
  { head: "THE PAD THROWS BODIES TOO" },
  { tag: "S174", text: "the **launch pad throws thrown bodies** now — a downed fighter that lands on the plate gets up, and then the pad fires it off exactly like it fires you" },
  { tag: "S174", text: "it rides the **same arc** to the **same roof** — there is one solver for both, so you can throw a body onto the pad and watch it sail the same way you would" },
  // ---- session 173: THE PANEL HANGS OFF THE RIGHT EDGE (the user's *"in the options ui i want the ui
  // to stick to the right and the part thats aiming in ward to be aimed to the center and make it
  // have an opening animation from the right with the background having a 33% black dim with a comic
  // dots effect that looks like this"*, with a halftone reference attached. The card is docked right
  // at EVERY width now, hinged on its own outer edge and turned the other way (`rotateY(-7deg)`) so
  // its face looks at the middle of the screen; it flies in from beyond that edge over-rotated; and
  // the dim is a 33 % black wash under a Ben-Day dot screen (`--comic-dim`). See "THE PANEL IS DOCKED
  // TO THE RIGHT AND LEANS INTO THE FRAME" and "THE COMIC SCREEN" in index.html, and the session 173
  // row in SPEC.md.) ----------------------------------------------------------------------------
  { head: "THE PANEL HANGS OFF THE RIGHT EDGE" },
  { tag: "S173", text: "the options panel is **docked to the right side** at every window size now — it used to drift to the middle on a wide screen — and it **hinges on its own outer edge**, turned so its face looks at the middle of the screen" },
  { tag: "S173", text: "opening it **flies it in from beyond the right edge**, over-rotated, so it swings into place; on a phone, where the panel is a bottom sheet, it rises from the bottom instead" },
  { tag: "S173", text: "the backdrop behind it is a **33 % black dim under a comic dot screen** — a fine Ben-Day halftone, so the paused world reads like a printed panel" },
  // ---- session 172: THE HEAD COMES LEVEL (the user's *"when im running the head looks up its looks
  // weird can u fix that"*. The run's head counter-pitch was authored as "most of the way to level"
  // — 0.85 of the trunk's lean — but the NECK's split re-reads `neck ∘ head` every frame while the
  // pose re-authors the head, and that recurrence AMPLIFIES the head's world rotation to about 1.5x
  // the authored one, so the face actually rode ~7 deg ABOVE the horizon (its worst frame +11.9).
  // `RUNC.headPitch` is the share measured to land it level once the neck's added share is in. See
  // `RUNC.headPitch` and the caveat on `poseNeckSplit` in streetwear.js, and the session 172 row in
  // SPEC.md.) ------------------------------------------------------------------------------------
  { head: "THE HEAD COMES LEVEL" },
  { tag: "S172", text: "the run's **head no longer cranes up** — it was riding about 7 degrees ABOVE the horizon for the whole stride (past 11 at its worst), which is what made a sprint read as odd" },
  { tag: "S172", text: "measured on the live rig over a full stride at full speed, the face now sits at **-2.1 deg on average, -5.7 to +1.3** — level, a touch down, the way a runner's head rides" },
  // ---- session 171: THE PLATE (the user's *"i want opening the options menu to hide the mobile hud on
  // the right all of the hud thats on the right only"* and *"i dont want it to be a straight square; i
  // want it to have a trapezoid 3d prespective effect where the outer side tilts inward"*. The right
  // readouts stand down with the menu (`#game.optsOpen`), and the card is turned on its axis with a
  // real perspective. See "THE CARD IS A PLATE" and "THE RIGHT SIDE STANDS DOWN" in index.html, and
  // the session 171 row in SPEC.md.) --------------------------------------------------------------
  { head: "THE PLATE" },
  { tag: "S171", text: "the options card is a **3D plate** now — its outer edge tilts in, so it reads as a panel held at an angle instead of a flat square" },
  { tag: "S171", text: "and opening it **clears the right side of the screen**: the fps, biome, sky, clock, position and distance readouts go away while the menu is up, and come back when it closes" },
  // ---- session 170: THE WHITE RING (the user's *"when the text becomes black make every letter have
  // a white outline"*, sent with a screenshot of the fullscreen button in its ON state — black
  // letters on the accent's green fill, welded into blobs by the black keyline. The fix is `--key-inv`
  // in index.html: the session-136 ring in white, worn by every surface that turns its own ink over.
  // See "Two keylines" in README.md and the session 170 row in SPEC.md.) --------------------------
  { head: "THE WHITE RING" },
  { tag: "S170", text: "the buttons that turn **black** when they are on — OPTIONS, the `(i)`, EXIT FULL — wear a **WHITE OUTLINE** on every letter now, instead of the black one that was welding them into blobs" },
  // ---- session 169: AUDIO & THE MOBILE UI (the user's *"make me able to lower the volume in the
  // options and also make me able to hide mobile interfere from options menu too"*. Two rows on the
  // options card: **AUDIO → VOLUME** (a MUTE-to-100 % slider on the game's whole mix) and
  // **TOUCH → MOBILE UI** (the phone's stick and buttons, hidden and brought back). See "THE MIX AND
  // THE PHONE" in README.md and the session 169 row in SPEC.md.) --------------------------------
  { head: "AUDIO & THE MOBILE UI" },
  { tag: "S169", text: "the option card has an **AUDIO** section now, and its **VOLUME** slider turns the whole game down — from **MUTE** to 100 %, in steps, and it is remembered between sessions" },
  { tag: "S169", text: "and the phone's interface can be **HIDDEN**: **TOUCH → MOBILE UI** in the same card puts the stick and every button away — for a laptop with a touchscreen, or when you just want to see the game" },
  // ---- session 165: M1 PULLS THE WALL (the user's *"add a better climb idle animation and make me
  // when i press m1 i look like im pulling the wall and my but goes down and the longer i hole the
  // more the wall climb skip distance covers make it look good and fluent"*. Four things: the parked
  // climb gets a real idle (`CLIMB_REST.idle` + `poseClimbRest`), M1 on the face becomes a LOAD that
  // stops the body on its holds and coils it (`CLIMB_LOAD_*`), the charge that hold winds up is what
  // the release is spent on (`CLIMB_SKIP_BASE + CLIMB_SKIP_GAIN * charge`), and the whole handover —
  // clip -> coil -> flight -> holds -> clip — was made continuous (`CLIMB_COIL.reach`/`reachFoot`
  // solved through the same `wallHand`/`wallFoot` as the holds, `CLIMB_HAUL_RELEASE`/`_REGRIP`, and a
  // real argument-forwarding bug in `userData.poseWall` that was eating half the feature). See
  // "The parked climb has an idle" and "M1 pulls the wall" in README.md and the session 165 block in
  // SPEC.md) --------------------------------------------------------------------------------------
  // (165b, the same session, the user's *"can u make it cover a lot more distance and can u exaggerate
  // the animation of the hold"*: `CLIMB_COIL.sink`/`out`/`lean`/`wind` went deeper and further (and the
  // trunk gained a charge-driven lean), `CLIMB_SKIP_GAIN` 2.30 -> 7.45 with `CLIMB_SKIP_TIME` 0.30 ->
  // 0.52 so a full charge is 8.70 world, `CLIMB_SKIP_TRIM` added because the ramp was silently eating
  // 15 % of every skip, and `CLIMB_COIL.reach.sweep`/`reachFoot.sweep` so the half-second flight keeps
  // reaching instead of holding one frame.)
  { head: "M1 PULLS THE WALL" },
  { tag: "S164", text: "and the hold is **EXAGGERATED** now (*\"can u exaggerate the animation of the hold\"*): the coil goes half again as deep — hips **0.44 rig units** down (was 0.30) and **0.26** further off the plate — the trunk leans in another 0.12 as the charge fills, the face presses up harder, the grip closes harder, and the strain-tremble is bigger and **slower** (9 Hz against 11), which is what makes it read as strain rather than as noise. Measured at a full coil: the ankles sit **0.11 world** below the hips (they were 0.27) and the elbows ride **0.28 world ABOVE the shoulders** (they were level), which is the read the whole move is for" },
  { tag: "S164", text: "and the skip covers **much more ground**: a tap is **1.70 world** and a full 3 s coil **8.70** (was 1.19 and 2.78) over 0.52 s — and it now covers what its own number says it does. The launch's ramp was eating **15.1 %** of the burst's area, so every skip ever fired came up 15 % short (measured 2.78 off a stated 3.30, which is how long it hid); `CLIMB_SKIP_TRIM` is that reciprocal, and measured now, wanted and got agree to **0.00 world** at every charge" },
  { tag: "S164", text: "and the half-second flight KEEPS MOVING instead of holding one reach for thirty frames: the arms and the trailing legs ride the fire's own clock (`reach.sweep`), so the limbs keep travelling up the face as long as the body is flying — measured, the palm leaves the stone at the release (**0.02 -> 0.50 world** of stand-off), eases back to **0.31** as the body comes up to it, and then walks back out to **0.34** on the sweep rather than sitting at one value for the rest of the flight" },
  { tag: "S164", text: "a body parked on the face BREATHES now instead of holding one frame: four incommensurate periods — a breath and a weight-shift on the hips (measured **0.059 world** of sway), the head looking up the face at the hold it is going for next, the free hand swinging and re-gripping (**0.183 world** of travel), and the grip ticking on the fingers — and **all four contacts hold through it**: measured, the palm spans **0.006 world** and both soles **0.000** across a full idle cycle" },
  { tag: "S164", text: "and **M1 ON THE FACE PULLS THE WALL**: the body stops dead on its holds (`CLIMB_LOAD_BRAKE` stiffens the climb's ease by 3.2x while the coil is on, so it does not creep **0.11 world** up the face while it is supposed to be dropping down it) and coils — the hips go down **0.49 world** at a full load with the knees folding UP past them (measured at a 3 s load: the ankles sit **0.27 below** the hips and the knees **0.20 ABOVE** them, so the legs fold as the hips drop instead of the legs getting longer), and the charge walks the elbows back, down and out to shoulder height (**0.24 out**) — which is what \"pulling the wall\" has to look like on arms whose hands cannot move" },
  { tag: "S164", text: "and **the longer you hold, the further it skips**: a tap covers **1.19 world** and a 3 s hold **2.78** (the charge saturates off `CLIMB_LOAD_CHARGE` 0.60 s, 95 % of it at 1.8 s), and holding a full coil costs grip ON TOP of the hang (`CLIMB_LOAD_DRAIN` 1.10), so a long charge is a bet against the bottom of the bar" },
  { tag: "S164", text: "and the skip is a LEAP that lands on the wall rather than a slide: the hands stay planted for the first **0.30 rig units** of travel while the body hauls itself up PAST them, then let go at `CLIMB_HAUL_RELEASE` (0.05 s) and are thrown straight up the face — authored PAST the arm's own reach, so the solve clamps it and the arms come out straight, the way a leap's do — and the holds are taken back up at the slower `CLIMB_HAUL_REGRIP` (0.13 s), so the catch is a movement and not a cut" },
  { tag: "S164", text: "and that catch is the thing that had to be measured to be believed: the limbs this overlay STOPS solving mid-flight were being handed back to the clip's own writer, which **wanders** — measured at **0.46 rad a frame for seven frames**, which threw the palm **0.8 world off the plate** and then snapped it **2.5 rad back in ONE frame**. Both ends of the skip's aim are solved now, so nothing is left free: measured, the palm's per-frame travel through the whole settle is **under 0.08 world** (against **0.27** in the base climb's own reach) and the flight's own excursion off the stone is **0.27**" },
  { tag: "S164", text: "and a real bug was found under all of it: the rig's pose hook (`group.userData.poseWall`) forwarded only **six of its eight arguments**, so the pull's own reading and the idle's clock never arrived at streetwear.js — which is why the load stance could not be posed at all before this session. One line, and the whole feature became possible" },
  // ---- session 164: THE LEGS COME APART WHEN HE LANDS (the user's *"whenever i like climb then land
  // my legs become closed in on each other fix that make them go to there original postion not closed
  // in"*. The climb clip is a whole quaternion on all sixteen of `CLIMB_BONES` and two of those are
  // the SHINS, whose yaw and roll no pose in the game ever writes — so the clip's own inward roll
  // stayed on them after the wall was behind him and carried the two feet into each other. Reset with
  // the run's other wall-solve leftovers in `poseRun` (streetwear.js). See "The climb is the clip" in
  // README.md and the session 164 block in SPEC.md) ------------------------------------------------
  { head: "THE LEGS COME APART WHEN HE LANDS" },
  { tag: "S164", text: "climb a wall, drop off (or jump off) and land, and his two legs used to SHUT TOGETHER like a pair of scissors — and stay shut for the rest of the session. That is fixed, and it was a real bone nothing was resetting: the climb's clip is a full rotation on every one of its sixteen bones, and **two of those are the shins**, which nothing else in the game has an opinion about — so the clip's own **31 degrees of inward roll a side** was still on them long after the wall was behind him. Measured on the live rig, one climb-and-land left the knee bones at **y/z 0.000 -> z 0.537 and -0.539**, and took the feet from **0.476 rig units apart to 0.082**" },
  { tag: "S164", text: "and the fix is one piece of housekeeping in the same place the run already resets every other wall-solve leftover: the shins' **yaw and roll go home to zero at the top of the frame**, so a wall solve can put a value on them for the frame it is live and nothing can leave one on for the frame after it" },
  { tag: "S164", text: "measured after a full climb, let-go and landing: the feet stand at **0.238 a side — exactly the idle's own stance, bone for bone** — the shoes' closest approach through the landing goes **0.004 -> 0.326**, and the knees' y/z are **0.000**. Same after a wall JUMP off the face and landing: the legs never come nearer than 0.303 all the way down" },
  { tag: "S164", text: "and the wall SLIDE gets the same line for free, because its own solved foot is built on those two shins (the slide writes the knee's bend and never its roll) — so a body that goes from a climb straight into a slide no longer builds its sole on the clip's roll" },
  // ---- session 163: THE CLIMB'S LEGS STOP STACKING (the user's *"whenever i climb a wall it does this
  // weird animation glitch where my legs stick and join together"*. The clip is a real climb and holds
  // its legs close; this rig's thighs are both hinged at the pelvis' own CENTRELINE (see `hinge` in
  // buildStreetCharacter), so the two pant tubes are touching at rest and the beats where the clip
  // passes one leg by the other land them on top of each other. `CLIMB.SPLAY` — an abduction of each
  // thigh off the pelvis' fore-and-aft axis, in `poseWallClimb` — holds them apart. See the session
  // 163 block in SPEC.md and "The climb is the clip" in README.md) ---------------------------------
  { head: "THE CLIMB'S LEGS STOP STACKING" },
  { tag: "S163", text: "the climb's legs used to STICK TOGETHER into one leg twice a cycle and they do not any more — the legs the clip holds close were landing on top of each other, because this rig's thighs both hinge at the **middle of the pelvis**, so a leg swung out sits exactly where the other one is. Measured on the live rig over a full cycle: the two shoes used to come within **0.006 rig units** of each other and the shins within **0.027**, against **0.48** at the nearest on a plain run" },
  { tag: "S163", text: "and the fix is **17 degrees of abduction a side**, off the pelvis' own fore-and-aft axis, so both legs swing out of each other's way for the WHOLE cycle — measured, the shoes' closest approach goes **0.006 -> 0.339** and the shins' **0.028 -> 0.230**, i.e. real daylight between the two legs at every beat, and it is CONSTANT, so the hands and feet slide on the stone exactly as much as they did before (the deepest foot vertex is no deeper into the stone than the raw clip's)" },
  { tag: "S163", text: "and it fades out when he HANGS, because that stance solves its own two legs and must not be rolled behind its own solve — so the parked pose you asked for in the rock-climber photograph is exactly the one you have" },
  // ---- session 161 (cont'd): THE TOP-LEFT IS THE DRAWING (the user's third send of the concept —
  // *"the ui on the top left look excatly like the image i sent Untitled19_20260925091955.png"*.
  // Session 142 read that crop and said it had nothing new to say about the dial; session 161 measured
  // it instead, and it did: see "THE BANDS ARE THE DRAWING" in README.md and the session 161 (cont'd)
  // entry in SPEC.md) ----------------------------------------------------------------------------
  // ---- session 162: THE CLIMB IS THE ANIMATION'S PULL (the user's *"can u make the climbing actually
  // dynamic like it matches the animation like if the character pulls the wall with his hands it pulls
  // him up and stuff"*. The climb's speed is the clip's own per-key descent of the planted holds, worn
  // as a stroke — `CLIMB_PULL` in streetwear.js, baked by bake.js, worn by `P.CLIMB_PULL_DEPTH` in
  // player.js — and the phase clock reads the pull rather than the pulled, which also fixed a 1.351
  // units slip that had every planted palm dragging down the stone. See "The climb is the clip", the
  // session 162 block in SPEC.md, and src/tools/climb-bake/README.md) ----------------------------------
  { head: "THE CLIMB IS THE ANIMATION'S PULL" },
  { tag: "S162", text: "the climb now GOES UP WHEN HIS HANDS PULL — the body's speed is the clip's OWN per-key rate at which the planted holds are being consumed, so he is hauled up while the arms haul and coasts while the next hand reaches for its hold. Measured on the live rig with the long-run boost held off, the rise swings **1.35 -> 2.04 u/s around a 1.60 mean** — one surge per limb, FOUR to a cycle, ~0.25 s apart — and the old session-161 version was a cosine with one bump a cycle, i.e. a rhythm invented here rather than the animation's" },
  { tag: "S162", text: "and THE CLIP PLAYS AT ONE STEADY TEMPO while the body surges (measured, **1.004 cycles a second from the first frame to the last**) — which is what keeps the hands honest, because a planted palm holds only while the body travels exactly what the clip's holds say it may. Measured: a palm now creeps **0.025-0.029 u through a whole hold, 6-8% of the climb it is holding through**" },
  { tag: "S162", text: "and a **FIX for a slip that was there the whole time**: `CLIMB_CYCLE` is measured ON THE RIG (1.18 of its own units a cycle) while the speed fed to the clock was a WORLD one, and the character is drawn at `charMesh.scale` **1.351** — so the cycle ran **35% fast** and every planted palm was dragged DOWN the stone at a third of the climb. Measured before: the body rose **1.1675-1.1869 u a cycle** against the clip's own 1.594, and a palm swept **0.10-0.22 u through a single hold, 29-31% of the climb**. Measured after: **1.5839-1.5985 u**, and **0.025-0.029 u**" },
  { tag: "S162", text: "and the clip plays at **2.0x** the speed it was filmed at for the base 1.6 u/s (the old 2.7x figure was the same units slip, and it is corrected in the source notes), so the limbs read cleaner at every speed — and the other numbers are untouched: the wall is the same wall, the stamina bar still buys the same ~40 u of it, and the momentum still adds on top and still never goes downwards" },
  { head: "THE TOP-LEFT IS THE DRAWING" },
  { tag: "S161", text: "the gauge's three bands now sit where YOUR DRAWING puts them — measured off the 83x41 crop, one ring of pixels at a time: the green core runs to **0.63 of the radius**, the red band spans **0.73-0.85**, and the cyan ring sits at **0.95-0.98 — right on the dial's edge, with only ~2 px of ink outside it**. The old fractions were 0.545 / 0.67-0.83 / 0.89-0.97, i.e. a smaller green core and an outer ring floating 0.05 R inside the rim" },
  { tag: "S161", text: "and the **GOLD RING is off the dial entirely** — the drawing has three bands and no gold at all (your own first brief: *\"Style rank is the yellow or gold or the SSS text\"*), and it was the fourth band that was crowding the other three out of the positions you drew them in. The meter it was is not gone, it MOVED into the LETTERS: they fill from the bottom as the style climbs (measured, `--rank-p` 0.00 at rank D, **0.42 at 130 points**, 1.00 at SSS), and at SSS the fill covers the glyph, so the letter is your drawing's solid gold exactly" },
  { tag: "S161", text: "and the green core is cut into **SIXTEEN** slices now, not five — a luminance walk round a ring inside the green finds the darker runs at ~22, 45, 66 and 88 degrees, one line every 22.5 degrees, four to a quadrant (the five had been misread out of this same crop since session 130), and they are thin enough that sixteen of them still leave the disc green" },
  { tag: "S161", text: "and every seam is INK now — the whole disc is filled once before a single band is drawn. It used to keep its seams black by spacing the bands so their rims just touched, which is a layout that springs a hole the moment a band moves, and the three-band version above has a seam twice as wide as those rims can cover" },
  { tag: "S161", text: "and the empty ultimate ring is a real dim CYAN (`#123039` -> `#2b7d8e`): the drawing's ring is cyan at whatever charge, and the near-black track was the single biggest reason the gauge did not look like the picture — at zero charge the whole outer band disappeared into the dial's ink" },
  // ---- session 161 (cont'd): THE WHIFF SAYS WHY (the user's *"make me if i try to like hit the enemy
  // while hes ragdoll ... the specific skill that miss even tho im next to him and we did that on
  // purpose for balancing reasons can u make it if that happens like a 25% opacity red outline
  // appears around the enemy"*. The refused body wears its own outline in red at a quarter alpha for
  // 0.7 s — see `OUTLINE_CUE_RGB` in enemies.js, `setOutlineTint` in ps1.js, `P.SCISSOR_MISS_CUE`,
  // and the session 161 (cont'd) entry in SPEC.md) ------------------------------------------------
  { head: "THE WHIFF SAYS WHY" },
  { tag: "S161", text: "a head scissor thrown at a body the fight REFUSES now says so — the chain passes straight through a RAGDOLL on purpose (your *\\\"make the m1s cant hit ragdoll\\\"*), so a skill 2 aimed at one whiffs even with the body lying right in front of you, and that body now wears a **25% opacity red outline** for **0.7 s**: the move's rule, told on the body it refused" },
  { tag: "S161", text: "it is read off the SAME reach the aim uses, with the ragdolls taken — so a body that really was in the swing is marked and a whiff in open ground marks nothing (there is no body for it to have been about), and the tell is timed to the move: on from the leap, 0.10 s in, through the empty jaws' snap and the stumble out of it (measured: 34 outline shells red at alpha 0.25 on the live page, all back to the black ink by frame 39)" },
  { tag: "S161", text: "and it is the body's own OUTLINE that changes, not a glow painted over it — the shell the character already has, moved into the transparent pass so the ring stays exactly as clean and exactly as wide, and a shell wearing the cue also ignores the cosmetic `PLAYER OUTLINE` setting, because the cue is information and the setting is decoration" },
  // ---- session 161 (cont'd): THE STEEP DECK LETS GO (the user's *"didnt know the player can stand on
  // wall slopes (im being sarcastic) fix that please make it make sense"*, with a screenshot of the
  // body standing on a steep grass flank. The standing brake could hold him on ANY grade — see
  // `deckGrip` and the "THE GRIP" block in player.js, and the session 161 (cont'd) entry in SPEC.md)
  // -------------------------------------------------------------------------------------------------
  { head: "THE STEEP DECK LETS GO" },
  { tag: "S161", text: "you cannot STAND on a face too steep for the deck to hold any more — past the world's own friction angle (**28.8 degrees**) the surface only has the KINETIC grip of a body already moving on it, so the deck SLIDES you and the STEEPNESS decides how hard: measured standing with no input on a constant flank for three seconds, he is at **0.85 -> 3.9 u/s by the 3rd second at 31 degrees, 1.9 -> 10.2 at 35, 4.0 -> 22.6 at 45, 5.0 -> 28.9 at 63, 2.9 -> 17.1 at 79**" },
  { tag: "S161", text: "and it was the WRONG WAY ROUND before — the steeper the face, the better it held him, because the pull a slope hands a body is `g·sin·cos`, which **peaks at 45 degrees and falls away past it**, while the brake holding him had never heard of slopes. Measured on the old code, the same three seconds moved him **0.78 u at 35 degrees and 0.83 at 45, but only 0.50 at 72, 0.32 at 79 and 0.16 at 84** — i.e. half the creep on an 84-degree wall as on a 45-degree hill: the wall is where he stood most solidly of all" },
  { tag: "S161", text: "and the field is where you will feel it — the steepest flank in the hills stands at 44.7 degrees, and it used to hold a standing body indefinitely: measured, **0.55 u of creep in two seconds**, which the HUD rounds to \"0.0 m/s\". He goes down it now (3.98 u in three seconds, arriving at a standstill on the flatter deck below, which then holds him like any other hill)" },
  { tag: "S161", text: "and every HOLD is untouched — the grip is the same single number the hold angle already was (`SLOPE_HOLD_TAN`, now read as a real friction coefficient), so the pull and the grip cancel exactly AT the hold angle and nothing under it can move: measured, 28.8 degrees and under move him **exactly 0.000 u** in three seconds, as they always did, and the climb/run-up tuning and the speed a SLIDE builds down a flank are unchanged" },
  // ---- session 161 (cont'd): THE MISS STOPS FOLDING OVER NOTHING (the user's *"in skill 2 miss make
  // the torso position when he tries to catch the enemy with his legs the inverse position of what it
  // is rn divided by 2"*. The catch half of skill 2's miss now re-reads the TRUNK — the inverse of
  // the shape, halved — see `SCISSOR.missTorsoFlip` and the clamp's note in streetwear.js, and the
  // session 161 (cont'd) entry in SPEC.md) ---------------------------------------------------------
  { head: "THE MISS STOPS FOLDING OVER NOTHING" },
  { tag: "S161", text: "when skill 2 MISSES, the trunk no longer folds over the neck that is not there — through the beat where the legs shut on nothing the torso is turned **inside out: the inverse of the shape, halved**. Measured on the trunk's own channel through the catch, 0.30 -> **-0.15** at the snap and 0.56 -> **-0.28** at the fold, so the arch the reach already had becomes a small forward pitch and the hunch over his own lap becomes a small arch AWAY from it" },
  { tag: "S161", text: "and only the TRUNK moves: the hips keep their own twist and the head keeps its own keys, and the legs do not move by a thousandth (measured: identical ankle, knee and hip world positions with the flip on and off, at every phase) — the legs are solved off the hips, so what this re-reads is the trunk and nothing under it. It also cannot tear the move apart: the phase opens on the leap's last frame and closes on the stumble's first one, so the inversion fades in after the reach and out before the catch-step, and both handovers measure **exact** to 4 decimal places" },
  // ---- session 161: THE CLIMB EARNS ITS SPEED, AND RESTS LIKE A CLIMBER (the user's *"make the
  // climbing animation speed match the speed of how fast im going and make climbing has a momentum
  // system where it makes faster the longer i climb but not smooth faster like smth like the image i
  // send up and down u feel me but at the end its going up ... please dont make it go downwards"*,
  // with a chart of a jagged green arrow climbing in steps — plus *"make the idle climb animation
  // like the guy image i sent"*, a photograph of a climber shaking out on a rock face. See the
  // `CLIMB_MOM_` / `CLIMB_REST_` blocks in player.js, the rest-stance note over `CLIMB_PARK` in
  // streetwear.js, and the session 161 entry in SPEC.md) ------------------------------------------
  { head: "THE CLIMB EARNS ITS SPEED" },
  { tag: "S161", text: "the climb's ANIMATION runs at the speed you are actually moving on the stone now, not just how fast you are RISING — working sideways used to play a **frozen clip** (measured: 0.00 cycles/s at full traverse), because only the vertical velocity drove it. Measured now: a lateral traverse at 1.6 u/s drives the cycle 1.36 a second, exactly the rate a vertical climb of the same speed has always had, and straight up is untouched" },
  { tag: "S161", text: "and the climb EARNS SPEED the longer you hold it — it ramps from the base 1.6 u/s to **2.92 u/s** over about ten seconds, in PULLS instead of a smooth slide: one surge per stroke of the limbs, so he drives hard off each hand-move and coasts into the next. Measured second by second, the troughs go 2.10 -> 2.53 and the peaks 2.62 -> 2.92, both rising the whole way" },
  { tag: "S161", text: "and IT NEVER GOES DOWNWARDS, which is the whole point of the chart — the momentum only ever ADDS, so the slowest moment of any pull is still the speed he started the climb at, and the troughs themselves rise. Let go and it bleeds away in a couple of seconds; hold on and he keeps getting faster until it plateaus" },
  { tag: "S161", text: "and HANGING still is a REST now, not a shuffle — let go of the push and he settles into a climber shaking out on the stone: one arm reaching out along the face, the other hanging at his side, one knee thrown high and out, the other leg straight down, chest arched off the rock and eyes up at the next hold. It is a POSE of its own, solved onto the stone like every other contact in the game — measured against the plate, the reaching palm lies **0.017 u** off it, the raised sole 0.020, the standing sole 0.026, and the hanging hand a clear 0.359. The first hand of movement takes it away again" },
  { tag: "S161", text: "and those four contacts HOLD STILL — every one is constant to the millimetre over the clip's whole cycle, which took finding: the arm is solved off the torso and each sole off the shin, so squaring the trunk or the shin AFTER the solve hands it a frame the render never uses, and the contact slides around on the clip's own slow clock with nothing in the numbers to show it (measured before the fix: one unchanged reach plan came back 0.6 rad apart at two phases, and the soles breathed 0.068 -> 0.097 and 0.034 -> 0.082)" },
  // ---- session 160: THE SLIDE STOPS SHAKING ON A SLOPE (the user's *"when im sliding and i go down
  // a slope my character shakes it does like a weird glitch"* — see "and the deck's own motion is not
  // a step" under "THE SLOPE" in README.md and the session 160 entry in SPEC.md) ------------------
  { head: "THE SLIDE STOPS SHAKING" },
  { tag: "S160", text: "the SHAKE going down a slope is GONE — the drawn body was **floating up to 0.37 u off the deck** and being slapped back onto it in a single frame (a **0.7 u** lurch), 7-9 times through a 3.7 s slide. The smoothing that keeps him on the deck is a follow that closes a fixed share of its gap each frame, so a gap that keeps opening (the deck falling away under a fast slide) settles at a steady lag — and that lag sat right on the rule that says \"take the whole gap in one frame\", so it took it, rebuilt, and took it again. Measured after: the body sits on the deck to **0.03 u** with **zero** lurches, at every frame rate from 30 to 144 fps" },
  { tag: "S160", text: "the FIX is the same thing the airborne case already learned — the deck moving under the feet is not a step, so its motion is fed FORWARD and only a real discontinuity (a box lip, a crater rim) is smoothed. A slide down a flank now tracks the ground exactly instead of trailing it" },
  { tag: "S160", text: "and running UP a flank is exact for the same reason — the body used to be drawn sunk up to 0.4 u into the hill it was climbing; measured now at 0.000" },
  // ---- session 159: THE LEDGE GRAB'S HANDS, ITS ANGLES, AND THE VAULT'S WEIGHT (the user's *"make
  // the ledge grab animation 100x better and to ledge grab u dont have to be angle perfect and make
  // it less heavy make it feel easy and fast as well as the vault"* — see "THE LEDGE GRAB'S HANDS
  // (session 159)" in README.md and the session 159 entry in SPEC.md) ------------------------------
  { head: "THE LEDGE'S HANDS, AND THE VAULT" },
  { tag: "S159", text: "the LEDGE GRAB's palms really HOLD THE LIP now — they were solved onto the stone, but the whole rig was being LEANED and SQUASHED on top of that solve, which swings a contact that lives in the rig's own frame straight off it: measured, the palms fell 0.148 u below the lip and 0.144 u through the face at the middle of the pull-up. The lean and the squash are off the pull-up path and the hands hold the lip to **0.003 u** for the whole move — 50x tighter" },
  { tag: "S159", text: "and the hands LET GO where the arms actually run out — a pull-up cannot keep holding a lip once the shoulder has risen further above it than the arm is long. Measured on the live rig that is k = 0.38, and the release was planned for 0.46, so for four frames the palms were being dragged off the stone by an arm with nothing left; the release lands ON that limit now, so the hands come off cleanly as the knee takes the edge" },
  { tag: "S159", text: "and it is LIGHTER and FASTER end to end — a shorter hold (0.13 s) and a shorter pull-up (0.29 s), **0.42 s from the catch to standing** against 0.49, and the whole-rig bow that made the pull-up read as a heave is gone entirely: the fold is in the trunk, where the solve already accounts for it" },
  { tag: "S159", text: "and you can take a ledge from ANY ANGLE — the catch scans EVERY face the body can see instead of only the one the line of travel happened to name, and its intent is read off that face rather than off a wall the body is not even touching: measured, a run-in takes the lip at **0, 20, 40, 60, 70 and 80 degrees**, where it used to have to be square to it" },
  { tag: "S159", text: "and a JUMP at an edge is the most forgiving of all — anything not moving AWAY from the face is caught, so a diagonal or glancing leap at a lip takes it like a square one: measured at every angle out to 75" },
  { tag: "S159", text: "the VAULT is lighter and easier too — the whole-rig fold over the plant is down from 0.62 to 0.46 with the squash under it (the same shape carried rather than hurled), the crossing is quicker, and it arms from **6.2 u/s** instead of 7.4, so a jog takes a rail and not only a sprint" },
  // ---- session 158: THE SLIDE LIES ON THE SLOPE (the user's *"can u make the player slide stick to
  // the slopes like turn its angles depending on the slope"* — see "and the deck MOVES wear the
  // lean too" under "THE SLOPE" in README.md) -----------------------------------------------------
  { head: "THE SLIDE LIES ON THE SLOPE" },
  { tag: "S158", text: "the SLIDE lies on the hill now — it was the one move that did not: the lean the body already had on a flank faded out the moment SHIFT went down, so he slid DOWN a 39-degree face with his own up still on the world's, floating off the uphill edge and cutting into the downhill one. Measured: his up was 39.9 degrees off the deck's own normal through the whole slide; it is 1.000 (dead on it) now" },
  { tag: "S158", text: "and the DASH wears it too — the same class of move on the same deck, so both of the ground MOVES lie in the plane their feet are in, and every angle of the body turns with the slope under it" },
  { tag: "S158", text: "and it FITS the hill better for it — the deepest drawn vertex of the whole body, measured against the deck under it: 12 cm at the worst frame while the slide lies on the slope, against 43 cm while it stayed level" },
  // ---- session 157: THE SCISSOR'S JAWS (the user's *"change skill 2 torso positions when he like
  // pushes his legs forwards or idk wtf he does ngl to be like the image i sent the red is wrong the
  // blue is the right"*, with a drawing of the leap — the red down the sides of the torso, the blue
  // beside it as a pair of legs thrown forward and split wide. See the leap's own note in
  // streetwear.js and "THE SCISSOR'S JAWS (session 157)" in SPEC.md) -------------------------------
  { head: "THE SCISSOR OPENS ITS JAWS" },
  { tag: "S157", text: "skill 2's LEAP is a pair of scissors OPENING now — the legs are thrown forward and SPLIT on the way to the throat instead of being tucked up against the chest, which is what the beat was from behind the body: a torso with a pair of arms and no legs under it at all. Measured off the rig at the leap's last frame, the two ankles are **0.96 rig units apart** against 0.37 — and 0.37 is the rig's own stance width, i.e. no split at all — with the knees 0.37 apart where they used to sit together on the midline" },
  { tag: "S157", text: "and the CLAMP hands over from exactly that width and SHUTS it on the neck, so the two phases are one movement: the jaws open on the leap, sweep out beside the neck, and cross it on the bite — measured, the ankles' own per-frame travel through the handover is unchanged (0.10-0.24 u), so nothing pops" },
  { tag: "S157", text: "and the trunk SITS UP over the legs instead of folding after them, which is the other half of the silhouette the drawing asked for: a body above a pair of legs rather than a body hunched over its own knees" },
  // ---- session 156: THE CLIMB IS THE USER'S OWN CLIP (the user's *"here use this animation for the
  // wall climb"*, with a Mixamo "Climbing Up Wall" FBX attached — see "The climb is the clip
  // (session 156)" in README.md) ------------------------------------------------------------------
  { head: "THE CLIMB IS YOUR ANIMATION" },
  { tag: "S156", text: "the WALL CLIMB is the ANIMATION YOU SENT — a real Mixamo climb, retargeted onto the body bone by bone and baked into the game as a table of numbers, so the pose is the clip's own frames rather than anything drawn by hand here" },
  { tag: "S156", text: "and his HANDS AND FEET HOLD the stone — the clip's own four contacts were measured descending at one rate, and the climb's speed is played against exactly that, so a palm slides at most 7cm through a whole hold however fast or slow he works" },
  { tag: "S156", text: "the climb is SLOWER for it — 4.0 to 1.6 u/s, which is 2.7x the speed the clip was filmed at and the fastest it can be played before the limbs read as a blur; the stamina bar was rescaled to match, so the same wall still costs the same bar" },
  { tag: "S156", text: "and he climbs ON the wall instead of beside it — the body stands off the stone at the depth the clip's own limbs reach for (0.44), measured rather than guessed" },
  { tag: "S156", text: "and every hold really HOLDS — the idle shuffle was dragging all four hands and feet down the stone at 0.35 u/s whatever he was doing, which is a clip-only bug; it fades out as soon as he moves, so a hand grips where it lands" },
  // ---- session 155: FOUR ASKS — THE FLURRY'S SPEED, A NECK, THE DUMMY'S GET-UP, AND THE KNEE ON A
  // BODY IN THE AIR (the user's *"fix the velocity for the pole attack make it make sense / add neck
  // wrest bone for the player animations / make the dummy get up animation faster and smoother / make
  // skill 1 hit ragdoll that is in air"* — see the session 155 entry in SPEC.md, "THE NECK JOINT" in
  // README.md, and the reaction-layer note under the enemy handovers) ---------------------------
  { head: "THE FLURRY'S SPEED, THE NECK, AND THE DUMMY" },
  { tag: "S155", text: "the staff's forward carry makes SENSE now — it was 17 u/s, over half again his own sprint, and it was a floor on ONE component of his velocity, so a direction held off the line left its own momentum sitting ACROSS the new one while the floor pushed a fresh surge down it: measured, the fastest way to travel with the wood in his hands was to FIGHT the move (19.9 u/s against the move's own 17). It is 15 u/s now, reached in 0.47 s of the flurry, and the across-line part is SPENT rather than stacked — held in any of the sixteen directions through a whole strike, he tops out at 15.0-15.2" },
  { tag: "S155", text: "and he has a real NECK — the head used to hinge straight on the trunk; there is a neck joint between them now and every pose's head rotation is split across the two, so a head turns IN a neck instead of swinging on the torso" },
  { tag: "S155", text: "and the dummy gets UP faster and smoother — the knock-down and all four get-ups are shorter (0.42 s down, then 0.72 / 0.50 / 0.86 / 1.06 s), and the END of every get-up no longer pops upright: the pose was easing out over 0.18 s but nothing was reading it, so the rig jumped from the reaction's last frame to the idle in one frame — a measured 0.47 rad snap on the largest joint, the biggest jerk in the whole move" },
  { tag: "S155", text: "and SKILL 1 catches a body that is still IN THE AIR — the flying knee LEADS its target now (the aim is carried to where the head WILL be, solved on one clock for the aim, the height and the leap itself, because a rising body is the one thing it was always going to sail over), and a ragdoll that has not landed yet is a body the knee can hit instead of one it passes through" },
  // ---- session 154: THE POLE COMES OUT OF HIS BODY, THE HANG OPENS UP, AND THE CLIMB GETS ITS
  // LANES BACK (the user's *"THE STAFF ANIMATIONS AND CLIMBING ANIMATIONS ARE THE WORST THINGS MY
  // EYES HAVE EVER SEEN ... MAKE THE STAFF ANIMATION HAVE LEG ANIMATIONS AND TORSO ANIMATIONS AND
  // THE CLIMBING ANIMATIONS DELETE THEM AND REMAKE NEW ONES ... THE DOUBLE JUMP ANIMATIONS FOR THE
  // STAFF IS SO BAD ... THE THROW ANIMATION IS MEH BUT THERES IS NOT TORSO AND HEAD ANIMATIONS AND
  // LEGS ANIMATIONS ONLY THE ARMS ARE MOVING"*, with a screenshot of the double jump annotated in
  // blue — see "The hang, redrawn (session 154)" in README.md) ------------------------------------
  { head: "THE STAFF AND THE CLIMB, AGAIN" },
  { tag: "S154", text: "the staff's DOUBLE JUMP is a completely different SHAPE — the stick used to be threaded down the middle of his own body, so the one thing the whole move is about was INVISIBLE from the camera you play from, and his legs were folded up under his seat in one black lump. It stands clear of his left flank now and the legs hang in a WIDE OPEN V off the hip line, knees out and feet apart, exactly the shape you drew over the screenshot" },
  { tag: "S154", text: "and the WALL CLIMB's limbs have LANES back — all four of them used to travel one lane at one height, so from behind the body read as a STAR with four equal arms and no direction. A hand's lane is a read of its own stroke now: the reaching arm goes UP AND OUT above his head while the pulling arm comes DOWN AND IN beside his ribs, and the stepping knee is thrown clear of the coat" },
  { tag: "S154", text: "and the staff's LEGS work harder — the M1 flurry's step and the throw's step-through are both about a third BIGGER, because at the distance you actually play at a 0.44 stride is a stride nobody can see" },
  // ---- session 153: THE STAFF'S DOUBLE JUMP STOPS BEING A STILL FRAME (the user's *"THE DOUBLE
  // JUMP ANIMATIONS FOR THE STAFF IS SO BAD WTF IS THIS"* — see "The hang is not a freeze
  // (session 153)" in README.md, THE STAFF §5) ------------------------------------------------
  { head: "THE STAFF'S DOUBLE JUMP" },
  { tag: "S153", text: "the Shaolin hang is no longer a STILL FRAME — it held one frozen pose for up to two and a half seconds, which is the thing that made it read as filtered next to everything else; he now SWAYS on the stick, the trunk swinging and turning about the pole with the hips breathing under him and the legs re-settling a beat behind" },
  { tag: "S153", text: "and his LEGS are on the pole where you can SEE them — they were swung flat forward, which hides both of them behind his seat from the camera you actually play from; the knees ride up and open now and the shins drop either side of the wood" },
  // ---- session 152: THE STAFF'S LEGS, THE CLIMB REMADE, AND THE HANDS THAT FINALLY GRIP (the
  // user's *"THE STAFF ANIMATIONS AND CLIMBING ANIMATIONS ARE THE WORST THINGS MY EYES HAVE EVER
  // SEEN ... MAKE THE STAFF ANIMATION HAVE LEG ANIMATIONS AND TORSO ANIMATIONS AND THE CLIMBING
  // ANIMATIONS DELETE THEM AND REMAKE NEW ONES ... THE THROW ANIMATION IS MEH BUT THERES IS NOT
  // TORSO AND HEAD ANIMATIONS AND LEGS ANIMATIONS ONLY THE ARMS ARE MOVING"* — see "The staff's
  // legs, and the climb remade (session 152)" in README.md) ---------------------------------------
  { head: "THE STAFF'S LEGS, AND THE CLIMB REMADE" },
  { tag: "S152", text: "the WALL CLIMB was DELETED AND REMADE — and what was actually wrong was arithmetic: the cycle ran at 1.9x the no-slip rate, so every hand and every foot SLID UP THE STONE at 46% of his own climbing speed, and the whole ascent read as a body floating up the face with its limbs swimming alongside" },
  { tag: "S152", text: "his HANDS GRIP now — the cycle is 1.40 against the no-slip 1.37, so a hand moves 3cm along the stone through a whole hold instead of 79cm; the climb is a sixth slower for it, and it is his arms hauling him up rather than a hover" },
  { tag: "S152", text: "and the climb's two-hundred-line pose is GONE — deleted and redrawn from two shapes: one straight arm punched above his head against one pulled down with the elbow UNDER the shoulder, one knee lifted and open against one leg spent long and low. The knees stopped flying at the camera" },
  { tag: "S152", text: "the STAFF'S LEGS move — the M1 flurry plants, slaps the lead foot through on the chop and steps through on the rising cut; the throw's plant steps in while the drive leg loads and FIRES off the back foot, then the two feet change ends" },
  { tag: "S152", text: "and the THROW has a trunk and a head to go with it — the whole move used to be two arms on a body that stood still" },
  { tag: "S152", text: "and the staff's DOUBLE JUMP bal- ance actually hangs off the wood — the grip was authored half a metre past the end of his own arm, so the stick was driven into the ground between his knees and he only ever stood NEXT to it" },
  // ---- session 152: THE MISS ON NOTHING (the user's *"add a better miss animation for the skill 2
  // wtf is this animation"* — see "The miss's re-cut (session 152)" in README.md) -------------------
  { head: "THE MISS ON NOTHING" },
  { tag: "S152", text: "the head scissor's whiff is a real BOTCH now — the legs snap shut on EMPTY AIR and slide straight through each other, so his own lock carries him head-first over his own lap and he catches the fall on a hand" },
  { tag: "S152", text: "it used to be a symmetric TUCK — both knees came up level and just hung there, so a whiff read as a jump that came to nothing" },
  { tag: "S152", text: "and the air-cut ring drops where the ankles actually CLOSED now, instead of floating a metre up by his chest" },
  // ---- session 151: THE FLURRY STANDS UP (the user's *"idk i think u should make the pole animations
  // only 1000x better"* — see "The flurry stands up, and the three holds (session 151)" in README.md)
  { head: "THE STAFF, PART TWO" },
  { tag: "S151", text: "the M1 flurry stopped DIVING face-first — the forward carry at 17 u/s made the game read him as airborne, so the whole rig INCLUDING THE LEGS was pitched 28° onto its face for the entire move; he stands up through it now and the three strikes actually read" },
  { tag: "S151", text: "and every beat HOLDS — the wood used to be at a different extreme on every single frame, so nothing told you which one had landed; each chop, cut and sweep is now a loaded anticipation, a two-frame whip and an impact you can catch" },
  { tag: "S151", text: "and the off hand takes hold of the staff and LETS GO — it was welded on at full stretch for both moves and spent the last tenth of a second hanging a third of a metre off the wood, because the carry is a one-handed grip it physically cannot reach" },
  { tag: "S151", text: "and the THROW has a load and a release now — the wind-up holds at its deepest for a beat, the fist opens on a whip, the body overshoots the line and holds the extension, and his head follows the stick out of his hand" },
  // ---- session 150: THE ROD THAT WENT THROUGH THE BODY (the user's *"hmm make the pole animations
  // 100x better btw"* — see "The rod that went through the body (session 150)" in README.md) ------
  { head: "THE STAFF" },
  { tag: "S150", text: "the staff no longer cuts through his BODY — the M1 flurry was being drawn straight through his own chest, shoulder and head on four separate stretches of the move (a centimetre from his spine at the worst frame); the wood rides clear of him now, through the throw's release as well" },
  { tag: "S150", text: "and his LEGS drive through the whole flurry — his stance was frozen in one deep crouch for the last two thirds of the strike while the rest of him slid forward into it" },
  { tag: "S150", text: "and a staff you are just CARRYING breathes — standing still, the carry's own dead posture was laid over his idle, so the thing you look at more than any other frame had a flat chest, fixed hips and a head that never moved" },
  { tag: "S150", text: "and the two hands sit a hand's width apart on the wood now — the far one could not reach the staff at all once it was held out of his body" },
  // ---- session 149: THE SLIDE'S BRAKE, THE CLIMB'S WEIGHT, AND A FRESH HOLD (the user's *"dont make
  // the slide suddenly slow down make it make sense make the climbing torso and head animations 100x
  // better and make the wall climg only be done if press space once then hold space again"* — see
  // "The climber's trunk and head, and the hold that must be fresh (session 149)" in README.md) ------
  { head: "THE CLIMB, THE SLIDE, AND THE HOLD" },
  { tag: "S149", text: "a SLIDE brakes at a steady rate now — staying down past the free slide used to bite harder the slower you got, so the speed fell away in the last third of it and the slide \"suddenly slowed down\"; it sheds a fixed amount now and the stop is one you can see coming" },
  { tag: "S149", text: "the WALL CLIMB has WEIGHT now — his SHOULDERS roll over the hand that is holding him, where before the two of them travelled level with each other however hard the body worked" },
  { tag: "S149", text: "and his HEAD leads it — the chin lifts with every pull and the skull darts toward the hand that is reaching for the next hold, where before it sat fixed on the wall like it was welded on" },
  { tag: "S149", text: "and the climb has to be ASKED for — a SPACE pressed on the ground is a JUMP, and holding it all the way into a wall no longer takes the face; jump, then press and hold again in the air" },
  { tag: "S149", text: "his HANDS stay on the stone through all of it — the roll and the head are spent by the arms, so nothing on the face slides" },
  // ---- session 148: THE POLE AT A RUN (the user's *"fix the POLE animation keep working on it ...
  // and blend the pole run animation with the normal run animation like what u did for the block"* —
  // see "The carried staff at a run, and the trunk it rides (session 148)" in README.md) ------------
  { head: "THE POLE AT A RUN" },
  { tag: "S148", text: "carrying the staff no longer kills your RUN — the pole's own body pose was being laid over the sprint, so a man at full speed ran with a standing torso and a staff that would not lean" },
  { tag: "S148", text: "the staff RIDES the stride now — it leans with his back and bobs with his hips, so the hand holds it the way it holds it standing instead of folding in against his belly" },
  { tag: "S148", text: "and no more skating — a SLIDE with the staff used to stand him back up out of it, and it is the same slide now" },
  { tag: "S148", text: "and on the double jump's stick the legs actually CLOSE on the pole — they were floating either side of it with a hand's air on each one" },
  // ---- session 147: THE CLIMB'S STRIDE AND THE FLICK (the user's *"FIX THE CLIMBING ANIMATION
  // PLEASE HERES SOME REFENCES"* — see "The climb's stride, and the arm that flicked at the handover
  // (session 147)" in README.md) ---------------------------------------------------------------------
  { head: "THE CLIMB STEPS" },
  { tag: "S147", text: "the WALL CLIMB steps now — one foot lands high with the knee bent and OPEN and the other drives long and low to the stone, where before both ankles stayed within a hand's width of each other the whole way up and the two folded legs read as a squat" },
  { tag: "S147", text: "and his KNEES are out of the wall — at the old angle the shin sat a quarter of a body INSIDE the stone on every step, which is the thing the baggy trouser was hiding" },
  { tag: "S147", text: "and the arms stopped FLICKING at the handover — once per hand per cycle his elbow jumped most of an arm's length in a single frame as it crossed under its own shoulder; the gripping hand rides a wider lane now and that bend is spent as a throw" },
  // ---- session 146: THE STAFF, AND THE WALL RUN (the user's *"WHAT THE FUCK ARE THESE POLE
  // ANIMATIONS FIX THEM ... AND THE WALL RUN ANIMATION THE ARM LOOKS A BIT WEIRD CUZ THE LEG IS
  // INSIDE THE FUCKING WALL PUSH THE PLAYER AWAY FROM THE WALL A BIT"* — see "The staff that was
  // bolted to his hip, and the wall run's leg (session 146)" in README.md) -------------------------
  { head: "THE STAFF ARRIVES" },
  { tag: "S146", text: "the staff MOVES with his hands now — the moving grip every swing, throw and balance was authored around had never been wired up, so the whole stick just turned on the spot in his fist like it was bolted to his hip" },
  { tag: "S146", text: "so M1 is a real flurry: the staff crosses his body, comes back up the other way and sweeps in low, with both hands riding the wood the whole way through" },
  { tag: "S146", text: "and the WALL RUN holds you off the stone a bit — a wall run used to bury his SHIN 40cm inside it on every stride, which is what made the arm braced on the wall look wrong too" },
  // ---- session 145: THE CLIMB'S ARM (the user's *"fix the climbing animation please it looks
  // sooooo bad"* — see "The climb's arm — and the press that was taking it (session 145)" in
  // README.md) -------------------------------------------------------------------------------------
  { head: "THE CLIMB'S ARM" },
  { tag: "S145", text: "the WALL CLIMB holds you a little further off the stone now — pressed in as close as it was, the wall took his ELBOW and winged it out level with his chest, so the arm doing the pulling read as a bent stick out to the side" },
  { tag: "S145", text: "and the pull is a real one now — his holding hand comes down under its own shoulder for the haul, where before both hands stayed up by his head the whole way and it looked like he was hanging off nothing" },
  { tag: "S145", text: "and his knee is BENT on every frame of it — the step down the face was planted so deep that the leg went straight and dangled at the bottom of each one" },
  // ---- session 144: THE ARM ON THE WALL (the user's *"when i wall slide or wall jump in a wall it
  // looks bad like my arms is not there its in the wall fix that make me a bit further from the wall
  // to show the arm"* — see "The wall slide's press — and the arm it was drawn for" in README.md) --
  { head: "THE ARM ON THE WALL" },
  { tag: "S144", text: "the WALL SLIDE holds you a little further off the stone now — pressed in as close as it was, the arm bracing on the wall spent the whole slide INSIDE it, so it read as if he had no arm on that side at all" },
  { tag: "S144", text: "and the WALL JUMP lets that press go the moment it fires — his trailing leg used to come round straight through the wall on the first frames of the launch" },
  { tag: "S144", text: "and catching a wall no longer drags that arm through the stone on the way IN — the brace lands on the face the frame he takes it, where before he swung the arm clean through the wall for the first fraction of a second, every time" },
  // ---- session 143 (later): SKILL 2'S MISS (the user's *"add a miss animtion for 2"*) -------------
  { head: "SKILL 2'S MISS" },
  { tag: "S143", text: "the head scissor has a MISS now — throw it at nothing and the legs snap shut on EMPTY AIR, with an air-cut ring where the neck should have been" },
  { tag: "S143", text: "before, a whiff still did the whole spin, so it looked like he'd caught somebody — the guard, the counter and a hit that lands are all untouched" },
  // ---- session 143: THE POLE YOU CARRY (the user's *"delete all the pole animtions and there
  // concepts"* / *"i grab the pole normally it has its weight it can slow me down a bit it has
  // durability"* / *"i can throw it with m2 ... and it breaks after that"* / *"an attack flashy
  // animation ... and must be moving forward it cannot be stationary"* / *"if i cant wall slide while
  // holding the pole"* / *"if i double jump with a pole ... i get launched far in the air with super
  // fast speed then the pole breaks ofc (its like the Shaolin Stick Balance)"* — see "THE STAFF — the
  // pole you carry" in README.md) -------------------------------------------------------------------
  { head: "THE POLE YOU CARRY" },
  { tag: "S143", text: "grabbing the pole just PICKS IT UP now — no move comes out of it, he takes it and carries it, and it stays in his hands" },
  { tag: "S143", text: "and it has its WEIGHT — a staff on your shoulder costs you a little speed on the ground" },
  { tag: "S143", text: "and it has DURABILITY — five hits and the wood goes, and how much of it is left is the new bar under STAMINA" },
  { tag: "S143", text: "M1 swings a three-hit flurry with his whole body turning through it, and it DRIVES him forward — it never plays on the spot" },
  { tag: "S143", text: "M2 again HURLS the staff, and it breaks where it lands" },
  { tag: "S143", text: "you can't WALL SLIDE while you're holding it" },
  { tag: "S143", text: "and the double jump takes the stick — he hangs off the top of it with his legs folded on the wood, and letting go LAUNCHES him far and fast, then the pole breaks" },
  { tag: "S143", text: "the pole's old move is gone completely: take it, swing it, throw it, break it — that is the whole thing now" },
  // ---- session 142: THE START & THE INK (the user's *"theres some performance lag at the start of the
  // map theres a frame drop yk"* and *"add this ... make the game ui look like this"*, with the concept
  // drawing sent again — see "THE START OF THE MAP" and "THE CONCEPT'S INK" in README.md) -----------
  { head: "THE START & THE INK" },
  { tag: "S142", text: "the start of the game is SMOOTH now — the judder you got the moment you pressed PLAY is gone, and the first second after it runs flat" },
  { tag: "S142", text: "the world fills in a few blocks a frame BEHIND the title card instead of all at once in front of it, so there is nothing left to hitch on when you start" },
  { tag: "S142", text: "the station names on the phone measure themselves at the title too — all fourteen of them used to do it on the very first frame you were playing" },
  { tag: "S142", text: "and the speed counter and the world prompt stopped re-cutting themselves letter by letter every frame — that was most of the stutter everywhere, not only at the start" },
  { tag: "S142", text: "the update log builds when you first open it now, not while the game is loading — a hundred and thirty-eight entries is the biggest thing the start was doing" },
  { tag: "S142", text: "and the whole INTERFACE wears the dial's ink now — flat fills inside the same heavy black rim with a hard shadow under it, on every panel, meter, counter and button" },
  // ---- session 141: THE THUMB PAD AND THE CLIMB (the user's *"add icons for all these buttons and
  // make them have diffrent shapes and make it look easy to use and stuff"*, *"dont make me wall climb
  // when i touch a wall make it only when space is held"* and *"you made a good animation for the climb
  // but suddenly u turned this into this bad spider look animation why return the animation u made it
  // looked perfect"* — see "THE PHONE" and "THE CLIMB" in README.md) --------------------------------
  { head: "THE THUMB PAD & THE CLIMB" },
  { tag: "S141", text: "every phone button has a PICTURE on it instead of a word — a shield, a ladder, an up-arrow, a hand — and it is the real move's own icon, so you read what the button does at a glance" },
  { tag: "S141", text: "and every one is its own SHAPE — the three big verbs are circles, the guard is a pill, the wall and movement verbs take a cut corner — so your thumb can find a button by feel without looking" },
  { tag: "S141", text: "the WALL CLIMB went back onto SPACE — hold it at a wall to take the face, hold it to stay and let go to drop. It used to start on its own the moment you walked into a wall" },
  { tag: "S141", text: "and the climb's SPIDER look is gone — his knees were bowed OUT to the sides and that is what read as a frog on the stone; they are back under him in one column, which is the shape you asked to have returned" },
  // ---- session 138: THE FALL & THE HILL (the user's *"make me able to dive and slam in free fall and
  // try to spam jump while walking up hill it looks weird"* — see "The skyfall" and item 5 of "THE
  // SLOPE" in README.md, and `startDive` / `startSlam` plus the `rise` term in player.js) -----------
  { head: "THE FALL & THE HILL" },
  { tag: "S138", text: "a FREE FALL is not helpless any more — F throws the DIVE and X throws the GROUND SLAM off the deck of any long drop, exactly as they do in a short hop, so a fall off a building can be spent on a move and not only on M1's held plunge" },
  { tag: "S138", text: "and JUMPING UP A HILL is fixed — the deck carries you up a flank, so the jump is measured from the deck now. Before, a fast run up a hill swallowed the whole jump: the same hop rose 0.98 units at 6 speed and 0.00 at 24, so spamming jump made him glide up the grass glued to it" },
  // ---- session 136: THE LETTERS (see "THE FACE HAS NO LOWER CASE, AND ITS ONE `t` IS DRAWN WRONG"
  // in README.md, and the `#game` rule in index.html) -----------------------------------------------
  { head: "THE LETTERS" },
  { tag: "S136", text: "every word you read is in CAPITALS now — the font you sent has no real lower case (its little letters ARE its big ones) and the one letter it drew differently, the lower-case t, came out as a mark that wasn't a letter, so 'the' read as 'lhe' on every line of this log" },
  { tag: "S136", text: "and every letter's OUTLINE is thicker — over a third more ink on every side — with the letters spaced a hair further apart so the outline has somewhere to go instead of the letters welding into one block" },
  { tag: "S136", text: "that was the whole of it being unreadable: this log, the move card and the welcome card are all one step clearer, and nothing else in the game changed at all" },
  // ---- session 135: THE GRASS (see "THE MOVING GRASS" and "THE LAWN" in README.md, grass.js and
  // the LAWN branch of `createMaterial` in ps1.js) ------------------------------------------------
  { head: "THE GRASS" },
  { tag: "S135", text: "the grass doesn't STOP any more — it used to fade out twenty metres away and leave the whole field beyond it as flat green paint, and now it runs all the way to the horizon" },
  { tag: "S135", text: "and the GROUND is grass too now — the deck is painted with a real lawn at two scales, so there is no bald ring where the blades give up and nothing between them up close either" },
  { tag: "S135", text: "the far grass is grown, not drawn: the clumps out there get BIGGER with distance, so one of them stands in for a whole patch of field and the count doesn't have to rise with it" },
  { tag: "S135", text: "it's still free — the whole thing is two draw calls that follow you around, and running the field flat out across the hills costs no frames at all" },
  // ---- session 134: THE PHONE (see "THE PHONE" in README.md, and the `#touch` block in
  // index.html) -----------------------------------------------------------------------------------
  { head: "THE PHONE" },
  { tag: "S134", text: "the phone has a THUMB lay-out now — the whole lower-left corner is the stick, and the ring comes to your thumb wherever you touch it instead of you having to find a small square first" },
  { tag: "S134", text: "and the buttons are ONE block on the right instead of two grids drawn on top of each other — HIT and JUMP are twice the size on the corner, the five movement verbs go above them, and the skills, the guard, the ultimate and the bag are grouped at the top" },
  { tag: "S134", text: "the SKILLS show their cooldown on the phone now — each one darkens from the bottom up as it recharges and lights its frame when it is back, so a press the game refuses is not silent any more" },
  { tag: "S134", text: "and the things a phone simply could not do have buttons: the prompt is a TAP target, BAG opens your pockets, the start card fits the screen instead of being three times too tall, and the pocket editor has a CLOSE — opening the bag used to be a trap" },
  // ---- session 133: THE FALL (see "the skyfall" in README.md, and `plunge` in player.js) --------
  { head: "THE FALL" },
  { tag: "S133", text: "a FREEFALL is helpless now — from the moment you are falling off something tall, everything but steering is refused: no grab, no skills, no staff, no wall to catch, no slam, no dive" },
  { tag: "S133", text: "and M1 is the one thing it can answer — HOLD it and he throws himself into a dive, straight DOWN, not the forward one: it is faster than the fall and it pins you to the fall line, and letting go spreads you back out" },
  { tag: "S133", text: "the fall POSES move now — every one of the seven shapes breathes: the arms windmill, the legs bicycle and the whole body rolls, faster the faster he is coming down, and it all stills into the landing brace a half second off the deck" },
  // ---- session 132: THE SLOPES (see "THE SLOPE" in README.md — the hills' scenery removal, the
  // denser lawn in grass.js, and the terrain physics in player.js) ---------------------------------
  { head: "THE SLOPES" },
  { tag: "S132", text: "the hills are PURE GRASS now — the trees, the rocks and the bushes are gone, and the field itself is a lawn: about four times as many blades, and it still only costs one draw call" },
  { tag: "S132", text: "and he STANDS ON THE HILL — his whole body lies over to the exact angle of the ground under his feet, so a flank is a surface he is standing on instead of a floor he is sliding along" },
  { tag: "S132", text: "the ground has a LIMIT now — a steep flank stops him dead at a walk, and how steep he can take is bought with the speed he is carrying: a run straight up it needs a run-up, a sprint can take almost anything" },
  { tag: "S132", text: "and a SLIDE works on a hill — it used to be cancelled the instant it met a slope; it sticks to the deck now, it BUILDS speed going down and spends it going up" },
  // ---- session 131: THE VFX UPDATE (see `Effects.slamCrater` and the seven effects beside it in
  // effects.js) ---------------------------------------------------------------------------------
  { head: "VFX UPDATE" },
  { tag: "S131", text: "every move has its OWN vfx now — one bright ring and a wall of dust was being drawn by thirty-five different things, and plenty of them never touched the ground" },
  { tag: "S131", text: "that ring and that dust column belong to the SLAM and nobody else — a push-off is grit off the deck, a landing is a soft ring, a guard is a ring in the air at the hands, and a wall hit throws paint off the face" },
  { tag: "S131", text: "and the slam's got BIGGER: the ground collapses back in, the deck throws real lumps of itself, and his boot flashes where it lands" },
  { tag: "S131", text: "this log is in SECTIONS now — a title between the runs of changes, so the one you're after is findable" },
  // ---- session 130 ----------------------------------------------------------------------------
  { head: "LOOK UPDATE" },
  { tag: "S130", text: "every letter in the game wears an OUTLINE now — the names always had one; the numbers, the paragraphs and the panels have it too" },
  { tag: "S130", text: "and the VAULT leaves no trail any more — the strip it drew through the air and the streaks thrown back down it are gone; the hand-plant, the whoosh and the landing all stay" },
  { tag: "S130", text: "the four M1s BLEND into each other now — the handover between two of them is spread out, so a chain reads as one string of moves instead of four" },
  { tag: "S129", text: "his HITBOX is the size of him now — it was a cube half again as wide as the body, so he stopped a step short of every wall, and a ledge he was standing next to was a ledge he stood ON" },
  { tag: "S129", text: "and a JUMP cuts the SWEEP and only the sweep — the third M1 is the one you can jump out of, so sweep-jump-slam is a real string; the knee, the clinch and the one-two play all the way out" },
  { head: "THE NEW WORLD" },
  { tag: "S128", text: "there's a NEW MAP — K walks OPEN FIELD → THE MAZE → BLISS HILLS, and the hills one is the windows xp wallpaper: smooth green grass rolling away as far as you can see" },
  { tag: "S128", text: "and you SPAWN ON THE SUMMIT of it — the training camp is the top of the hill, so the whole world falls away below you" },
  { tag: "S128", text: "the grass MOVES — it sways in the wind and bends out of the way when you run through it" },
  { tag: "S128", text: "it's cheap too: the whole moving field is one draw call that follows you around, not grass drawn across the whole map" },
  { tag: "S127", text: "there's a NO CAMERA FLIP option in the settings now — turn it on and the screen stays upright through a double jump instead of rolling all the way over with him" },
  { tag: "S127", text: "and the BACKDASH turns with the CAMERA — swing the look through the hero landing and the slide and the whole retreat turns with it; the movement keys don't touch it at all any more" },
  { head: "THE FIGHT" },
  { tag: "S126", text: "the UPPERCUT only comes out of the FINISHER now — hold SPACE right through the third M1 and he sweeps your leg out and drives the right knee up; mashing it out still works, but nothing else launches any more" },
  { tag: "S126", text: "and it LOOKS different: one fast sweep at the deck for show, no hit on it, then he spins the whole way round and buries the RIGHT knee in him on the way up" },
  { tag: "S126", text: "a knocked-down body is on the floor for HALF A SECOND now, not a second and a half — the sweep, the slam and the trip all put him up that much sooner" },
  { tag: "S125", text: "everything you read is BIGGER now — the whole HUD was drawn at 10 pixels and is drawn at 12, and OPTIONS > LOOK > TEXT SIZE takes it anywhere from 10 to 22" },
  { tag: "S125", text: "and the CONTROLS card stops squeezing its writing into a sliver — on a phone it takes the width of the screen now instead of about a hundred pixels" },
  { tag: "S125", text: "skill 3's TORSO was on the wrong end of the man — the trunk hung UP out of the hips for the whole throw instead of whipping back over into it; he kips up now the way the pose was drawn" },
  { tag: "S125", text: "and a WALL RUN in first person lays the picture over the right way — the view was banking AGAINST the wall, nearly three times as hard as the chase camera banks with it" },
  { tag: "S124", text: "FIRST PERSON doesn't put your own legs through your face any more — the body gets out of the way while it's in the eye, and stands right back down when it isn't" },
  { tag: "S124", text: "and a flip finally READS from inside the head — the view was counter-rotating against the body, so the somersault was double-speed and aimed at your own chest; the world rolls over now and the body stays put" },
  { tag: "S123", text: "the lettering is TIGHT now — the face's own over-generous air is spent, so a name reads as a set word instead of a row of loose marks" },
  { tag: "S123", text: "and the backdash's hero landing is yours no longer — the line commits a quarter second early, so moving mid-landing can't swing the slide" },
  { tag: "S122", text: "landing a hit bends the PICTURE now — a shockwave rings out from wherever the blow landed and the frame tears a hair apart as it passes" },
  { tag: "S122", text: "and the impacts are half again as big: a sixteen-point star and a spray of hot spokes off the contact on the heavy ones" },
  { tag: "S122", text: "the finisher stops white-screening you — the whole-frame flash is a third lighter, so you can actually see the strike under it" },
  { tag: "S122", text: "getting hit no longer turns him ghost-white — the hit flash is a quarter as bright" },
  { tag: "S122", text: "and a knocked-down body goes over ONE time now instead of twirling — the spin is worked out up front, so he lands flat on his side or his front" },
  { tag: "S122", text: "the knock-down lands with a THUMP too — a ring, a burst of dust and a heavier thud, scaled off how hard he came down" },
  { tag: "S121", text: "the WALL CLINCH is TEN SLOW KNEES now, not a blur — the ramp speeds up ten per cent a strike instead of doubling, so you can watch every one land" },
  { tag: "S121", text: "and the body stands UP against the stone facing him while he works the gut — it used to be doubled over the wall with the man behind it, which read wrong" },
  { head: "THE WALL CLINCH" },
  { tag: "S120", text: "the whole game wears YOUR FONT now — Swizer Street over every label, every option and every tag, straight out of the file you sent" },
  { tag: "S119", text: "first person turns WITH you now — the whole body follows the look, so A and D are a strafe with his chest still to the front instead of him jogging off sideways" },
  { tag: "S119", text: "...and the eye sits at his FACE: looking down shows his chest and the emblem, not the flat top of his own shoulders" },
  { tag: "S119", text: "vaults, grabs and the launch pad carry the view round with them, instead of leaving you staring out of the side of your own head" },
  { tag: "S119", text: "and first person can look nearly straight down at his own feet now — it stops where a head stops, not where the chase camera does" },
  { tag: "S118", text: "skill 3's kick takes its TIME now — the whole strike used to be four frames of everything at once, which read as a flick; the arms start up out of the crouch and whip through the throw" },
  { tag: "S118", text: "...and he LOADS it: his shoulders wind away from the man through the crouch and snap back square on the frame the boot lands" },
  { tag: "S118", text: "the legs leave the coil one after the other now, so it reads as two legs throwing something up instead of one" },
  { head: "HOW HE MOVES" },
  { tag: "S117", text: "the whole game wears the FONT FROM YOUR SHEET now — heavy slabs you can barely see through, every corner cut off, and no keyline through the middle" },
  { tag: "S117", text: "the capitals and the letters are drawn on the same 0.1em grid as always, so the counters are one whole pixel of white at 10px and open up from there" },
  { tag: "S116", text: "he LOOKS AT THE CURSOR in the pockets now — his head was turning the WRONG WAY, so cursor-right had him staring off to the left of it" },
  { tag: "S116", text: "and a CLICK picks gear up: click the key once and it lights up, then click a pocket or a name and it goes there — no drag needed for the small stuff" },
  { tag: "S116", text: "the little boards on the pocket NAMES are tap-able now, and a key grabbed off one can't be thrown out of the pocket by mistake any more" },
  { tag: "S115", text: "the WALL CLINCH comes out of MASHING M1 on him now — keep driving a body into a wall and the fifth landed hit puts his skull into the stone" },
  { tag: "S115", text: "and the knees DOUBLE — each strike is twice as fast as the one before it until his leg is a blur, then the body is thrown clear of the wall" },
  { tag: "S114", text: "skill 3's strike is thrown harder now — both arms go up TOGETHER and straight at the hit instead of out to the sides, and he leans back into it half again as far" },
  { tag: "S113", text: "the idle's legs READ the ground now — standing at a ledge the planted leg takes the weight and bends while the other goes long and its boot points down over the drop, instead of both legs locked straight" },
  { tag: "S113", text: "the names are SORTED again — the letters stand side by side and up straight, no chain and no lean" },
  { tag: "S112", text: "the three numbered skills are PICTURES now — 1, 2 and 3 wear a shot of the move LANDING, the body cut out white with its far limbs gray and the ink on, and the number sits small at the corner" },
  { tag: "S111", text: "every dash's landing is YOURS instantly — as a dash puts itself down (the backdash's hero landing and its backward slide included) a held direction snaps him straight onto it, no turn" },
  { head: "THE WORLD" },
  { tag: "S110", text: "there's a SECOND WORLD — the new WORLD setting swaps the endless field for THE MAZE: an endless maze whose walls get taller the further you run from the spawn, and you can climb up and run along their tops" },
  { tag: "S109", text: "the bag is a real BAG now — rounded and soft with a lid and carry handles, instead of the blocky box it was" },
  { tag: "S108", text: "hold SPACE and M1 on the ground and he throws an UPPERCUT — two fast sweeps for show, then his left knee, and the enemy goes HIGH" },
  { head: "THE LETTERING" },
  { tag: "S107", text: "the font is SHARP now — every corner cut into a blade and a spike, and the capital letters redrawn to match" },
  { tag: "S107", text: "the lunge's throw-back is half the size it was — still a full backflip, just a shorter flight" },
  { tag: "S106", text: "every NAME runs like a CHAIN now — each letter half over the one before it and half under the one after, and the whole word leans out at both ends" },
  { tag: "S105", text: "the dummy has real feet now — the right length, a proper heel, and toes instead of pegs" },
  { tag: "S104", text: "the pushback throws the enemy about FIVE TIMES further — it flies across the yard now, and slams into whatever it hits" },
  { tag: "S103", text: "every NAME in the interface is a TAG now — the letters overlap and weave like the logo, while the numbers and the paragraphs stay crisp" },
  { tag: "S102", text: "scrollbars match the HUD now — squared and dark instead of the browser's grey bar" },
  { tag: "S101", text: "the enemy's pushback now flies FAR and in a random direction, and the font stands upright (no more italic)" },
  { head: "THE WORLD BREAKS" },
  { tag: "S100", text: "loose items tumble and roll like real objects, and every attack now breaks whatever it lands on — body-slams, wall kicks and the clinch's smash crack the WALL, the slams break the GROUND" },
  { tag: "S99", text: "loose items bounce off walls, blocks and the tower now instead of going straight through them" },
  { tag: "S98", text: "and the camera swings round to watch it: the head into the wall, the knees into the gut, the throw" },
  { tag: "S97", text: "the WALL CLINCH — kick a wall (or land 5 M1s on one) and the enemy's skull goes into the stone" },
  { head: "THE GEAR & THE YARD" },
  { tag: "S95", text: "items LOOK damaged now: bruised paint, cracks that spread, and a broken one comes apart" },
  { tag: "S95", text: "air combo slow-mo now only slows the world and your fall — your attacks and your run stay full speed" },
  { tag: "S95", text: "this log, behind the (i) button" },
  { tag: "S94", text: "the air combo cancels itself 0.85 s after your last hit" },
  { tag: "S94", text: "the launch's carry snaps the body onto your foot in 3 frames" },
  { tag: "S93", text: "the vault stops landing like a strike — smooth, no impact, no camera hit" },
  { tag: "S92", text: "the sky's pole tear fixed  ·  the hot bag only homes after you hit it, and stops burning" },
  { tag: "S91", text: "the quick pockets moved to the bottom band, a size up" },
  { tag: "S90", text: "carry the duffel in BOTH hands (E + right): M1 throws it, M2 slams it live" },
  { tag: "S89", text: "the running lunge is gone — the right button is a standing move" },
  { tag: "S88", text: "every item leans at its own angle in its pocket" },
  { tag: "S87", text: "the worn bag is welded to your back, the right way round" },
  { tag: "S86", text: "training grounds at spawn: a station and a sign for every move" },
  { head: "THE POCKET EDITOR" },
  { tag: "S85", text: "the pocket editor's camera rides the body instead of flying off" },
  { tag: "S85", text: "a vault is five moves from any angle; a grabbed body rides low" },
  { tag: "S83", text: "the strike and the running vault, rebuilt" },
  { tag: "S82", text: "the pocket editor: no dim, a camera on the body, arrows on the names" },
  { tag: "S81", text: "the bag and pocket editor crash fixed" },
  { tag: "S80", text: "the right-click grab is a one-handed flash" },
  { head: "THE FOUNDATIONS" },
  { tag: "EARLY", text: "the staff: take it with the right button and a whole form plays out — it breaks in two at the end" },
  { tag: "EARLY", text: "1 / 2 / 3 skills: flying knee, head scissor (and its counter), the launch" },
  { tag: "EARLY", text: "M1 + M2 together: the boxer's block, and the charge it breaks into" },
  { tag: "EARLY", text: "dive into a body that is already in the air to launch it, then M1 chains in the air" },
  { tag: "EARLY", text: "the duffel, the three pockets, and the hot bag" },
  { tag: "EARLY", text: "first person, shift lock, the wardrobe, and the dial with the style rank" },
  { tag: "EARLY", text: "the endless city, the sky cube and its launch pad, the PS1 renderer and the font" },
];

// The log is the options panel's twin: opening it stops the run and frees the mouse (nobody should
// be killed while they are reading), closing it puts you back exactly where you were, and the two
// panels take each other's place rather than stacking — so the top-right pair always reads as "one
// of these is open, or neither is". `resumeAfterLog` is the mirror of `resumeAfterOptions`: whether
// there was a run in progress to go back to, or only the pause overlay.
let logOpen = false;
let resumeAfterLog = false;

function openLog() {
  if (logOpen) return;
  if (optionsOpen) {
    // ...handed over, not resumed: `closeOptions` would put the player back on the field for a frame
    // before this function stopped him again, so the state is moved across directly and the "was
    // there a run in progress" answer travels with it.
    optionsOpen = false;
    hud.hideOptions();
    resumeAfterLog = resumeAfterOptions;
    resumeAfterOptions = false;
  } else {
    resumeAfterLog = running;
  }
  logOpen = true;
  running = false;
  input.mouseLook = false;
  input.keys = Object.create(null);
  if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  hud.showLog();
  if (sfx.ready) sfx.ui();
}

function closeLog() {
  if (!logOpen) return;
  logOpen = false;
  hud.hideLog();
  if (resumeAfterLog) beginPlay();
  else if (hasStarted) pause();
  resumeAfterLog = false;
  if (sfx.ready) sfx.ui();
}

function toggleLog() {
  if (logOpen) closeLog();
  else openLog();
}

function openOptions() {
  if (optionsOpen) return;
  // ...and the update log takes its place rather than stacking with it (the two share the middle of
  // the screen and the same top-right button row — see `openLog`).
  if (logOpen) {
    logOpen = false;
    hud.hideLog();
  }
  optionsOpen = true;
  resumeAfterOptions = running;
  running = false;
  input.mouseLook = false;
  input.keys = Object.create(null);
  if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  refreshOptions();
  hud.showOptions();
}

function closeOptions() {
  if (!optionsOpen) return;
  optionsOpen = false;
  hud.hideOptions();
  if (resumeAfterOptions) beginPlay();
  else if (hasStarted) pause();
  resumeAfterOptions = false;
}

function toggleOptions() {
  if (optionsOpen) closeOptions();
  else openOptions();
}
let protoActive = false;
let resumeAfterProto = false;
function enterProto() {
  if (protoActive) return;
  protoActive = true;
  if (optionsOpen) {
    optionsOpen = false;
    hud.hideOptions();
    resumeAfterProto = resumeAfterOptions;
    resumeAfterOptions = false;
  } else if (logOpen) {
    logOpen = false;
    hud.hideLog();
    resumeAfterProto = resumeAfterLog;
    resumeAfterLog = false;
  } else {
    resumeAfterProto = running;
  }
  running = false;
  input.mouseLook = false;
  input.keys = Object.create(null);
  if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  const help = document.getElementById("help");
  if (help) help.classList.add("hidden");
  let el = document.getElementById("proto");
  if (!el) {
    el = document.createElement("div");
    el.id = "proto";
    el.setAttribute("style", "position:fixed;inset:0;background:#000;display:flex;align-items:center;justify-content:center;z-index:9999;");
    const b = document.createElement("button");
    b.id = "protoBack";
    b.textContent = "BACK";
    b.setAttribute("style", "background:#111;color:#fff;border:2px solid #fff;font-size:20px;padding:14px 42px;cursor:pointer;");
    b.addEventListener("click", () => exitProto());
    el.appendChild(b);
    document.body.appendChild(el);
  }
  el.style.display = "flex";
  const game = document.getElementById("game");
  if (game) game.style.display = "none";
  if (sfx.ready) sfx.ui();
}
function exitProto() {
  if (!protoActive) return;
  protoActive = false;
  const el = document.getElementById("proto");
  if (el) el.style.display = "none";
  const game = document.getElementById("game");
  if (game) game.style.display = "";
  if (resumeAfterProto) beginPlay();
  else if (hasStarted) pause();
  resumeAfterProto = false;
  if (sfx.ready) sfx.ui();
}

function setQuality(q) {
  quality = Math.max(0, Math.min(QUALITY.length - 1, q));
  settings.internalHeight = QUALITY[quality].h;
  settings.viewDistance = QUALITY[quality].view;
  // ...and the FX take the same walk down. The particles are the first thing that should get
  // cheaper on a weak device (a missing spark reads as a frame budget; a missing crater reads as
  // a bug — see `Effects.fxScale`), so the share of every authored count that is actually thrown is
  // keyed off the quality tier: full, most, half.
  effects.fxScale = QUALITY[quality].fx;
  // ...and THE GRASS is thinned the same way, by count rather than by drawing nothing: the field is
  // the cheapest thing to make cheaper on a weak device (see `Grass.setDensity`).
  grass.setDensity(QUALITY[quality].grass);
  if (settings.doxSaver) {
    settings.internalHeight = DOX.h;
    settings.viewDistance = DOX.view;
    effects.fxScale = DOX.fx;
    grass.setDensity(DOX.grass);
    grass.setEnabled(false);
  }
  pres.resize();
  world.lastCX = 1e9;
  world.lastCZ = 1e9;
}

function currentBiome() {
  return biomeAtPoint(player.pos.x, player.pos.z);
}

function biomeLabel(b) {
  return b.name;
}

const dustColor = [0.9, 0.89, 0.82];
function biomeDust() {
  const b = currentBiome();
  const f = b.fog;
  const h = b.horizon;
  dustColor[0] = Math.min(1, f[0] * 0.62 + h[0] * 0.22 + 0.2);
  dustColor[1] = Math.min(1, f[1] * 0.62 + h[1] * 0.22 + 0.19);
  dustColor[2] = Math.min(1, f[2] * 0.62 + h[2] * 0.22 + 0.17);
  return dustColor;
}

// What the body is in contact with right now, in that surface's own colour (see
// `World.surfaceColorAt`). `floor` asks for the deck UNDER the point rather than the nearest thing
// to it — the two callers a frame are the wall's grit and the deck's spray, and they ask about
// different surfaces. Cached against the point and the mode, because both ask every frame while
// the move is live and the answer only changes when the body crosses onto something else.
const surfCol = [0.9, 0.89, 0.82];
const surfAt = [1e9, 1e9, 1e9, 0];

function surfaceColorAt(x, y, z, floor) {
  const f = floor ? 1 : 0;
  if (surfAt[3] === f && Math.abs(x - surfAt[0]) + Math.abs(y - surfAt[1]) + Math.abs(z - surfAt[2]) < 0.12) {
    return surfCol;
  }
  surfAt[0] = x;
  surfAt[1] = y;
  surfAt[2] = z;
  surfAt[3] = f;
  return world.surfaceColorAt(x, y, z, surfCol, floor ? 0.3 : 0.36, !!floor);
}

// THE STRIKE LINE — the world direction a blow travelled, from the striker's own chest to the
// contact it reported (see `effects.impact`, which lays its flash, its bar, its air ring and its
// cone of sparks out along this one vector).
//
// It is read off the two BODIES rather than off the pose on purpose: a body knocked sideways sparks
// off in the direction it was actually struck, where a line taken from the player's current `facing`
// would point wherever he happens to be looking a frame later — and the whole value of the strike
// system is that a hit has a direction at all. The fallback matters for the one case where the
// bodies are on top of each other (a clinch, a grab at the throat): there the vector is degenerate
// and the facing is the only sensible answer left.
const strikeVec = [0, 0, 1];
function strikeLine(x, y, z) {
  let dx = x - player.pos.x;
  let dy = y - (player.pos.y + P.HY * 0.55);
  let dz = z - player.pos.z;
  if (Math.hypot(dx, dz) < 1e-3) {
    dx = Math.sin(player.facing);
    dy = 0;
    dz = Math.cos(player.facing);
  }
  strikeVec[0] = dx;
  strikeVec[1] = dy;
  strikeVec[2] = dz;
  return strikeVec;
}

// ---- THE CLASH'S CONTACT (see the M1 clash's FX in `frame`) ----
// A clash has no striker, so it has no `lastHit` to read a contact off: the point the two limbs
// actually meet at is the player's own WEAPON, which is exactly where the enemy's fist is solved
// onto (see `clashWeapon` in player/combat.js and `poseClash` in streetwear.js). Asking the piece of
// the rig the lock is ABOUT — rather than a step in front of the player's feet — is what puts the
// sparks on the contact when the move that brought it is a wide sweep or a raised knee.
const _clashPt = new THREE.Vector3();
const _clashDir = new THREE.Vector3();
function clashContact(out) {
  if (player.clashWeapon) {
    player.clashWeapon(out);
    if (Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z)) return out;
  }
  return out.set(player.pos.x + Math.sin(player.facing) * 0.55, player.pos.y + 0.25, player.pos.z + Math.cos(player.facing) * 0.55);
}

// ---- THE WORLD TAKES IT (see `Destruction.strike`) --------------------------------------------
// Every attack in the game lands on the world as well as on the bodies standing in it, and which
// SURFACE it is addressed to is the attack's own business: a boot coming down is addressed to the
// GROUND, a blow driven into a face to the WALL (the direction it travelled says which face), and
// the staff's tip — the one strike point in the game that does not know what it is about to meet —
// reads it off its own line ("auto"). All of it goes through this one call, so a verb added
// tomorrow gets the whole destruction system — the crack, the break, the shards, the dust of the
// surface's own colour — by saying where it landed and which way it was going.
//
// The FX of a crack or a break already belong to that surface's own drain (`drainDestruction`),
// drawn where the damage was recorded and in the colour of the thing that broke; what an attack
// adds is its own contact FX, which it draws exactly where it always did. This is only the
// world's half of the blow.
function worldStrike(x, y, z, power, surface, dir) {
  return destruction.strike(x, y, z, power, { surface, dir: dir || null });
}

// THE LENS' OWN SHOCK (see `shock` in `createPostPass`). A blow that is big enough to be felt
// THROUGH the camera: the contact is projected onto the screen and a ring of displaced air travels
// out from that spot through the finished picture, bending it as it passes. It is the one piece of
// an impact that is not in the world at all — everything else in `effects.impact` is drawn where
// the blow happened, and this is the same blow arriving at the eye — which is why it is worth a
// third of the post pass's fragment.
//
// The world point is projected rather than the screen centre being used, so a hit at the side of
// the frame throws its shock across the picture from the side. `power` is the same 0..1 every other
// impact in the game uses, and the gate is a third: below it a strike bends the picture so little
// that the bend is not what the eye takes from the frame, and a screen that ripples at every jab is
// a screen that never means anything on a finisher.
const _shockV = new THREE.Vector3();
function screenShock(x, y, z, power) {
  const p = power == null ? 0 : power;
  if (p < 0.34) return;
  _shockV.set(x, y, z).project(camera);
  if (_shockV.z > 1) return;            // behind the camera: there is no screen point for it
  post.shock(_shockV.x * 0.5 + 0.5, _shockV.y * 0.5 + 0.5, Math.min(1, (p - 0.30) / 0.70));
}

// The dive's and the launch's trail is per PART, not per body. `effects.diveWake` takes an array
// of world points, feeds a thin ribbon at each and lays its wind sheets on the same points. The
// parts are the four that LEAD a body through the air — the two hands and the two shoes — and not
// the torso, hips, shoulders, elbows and knees that used to carry a line as well: thirteen ribbons
// around one character read as a white cage rather than as wind. The HEAD had one too until
// session 66, when the user asked for it to go (*"remove the head trail"*): a line off the crown
// read as a light source stapled to the face rather than as air moving past the body, because the
// head neither reaches nor cuts — it only goes where the body was already going.
//
// The points are read off the character's own bone groups (`charMesh.userData.bones` — the same
// groups the poses drive), so a tuck or a splay drags the lines with the limbs. A hand has no bone
// of its own — the digits are ten little groups hanging off the forearm, far too fine to read at
// 224 lines — so it is placed with `handLocal`, which is exactly the offset the digits are hung
// from.
//
// The list is ORDER-STABLE: `Ribbon` #i belongs to part #i for the life of the page, so the order
// of TRAIL_PARTS must not change without clearing `effects.diveParts`.
const TRAIL_PARTS = ["footL", "footR", "handL", "handR"];
const divePartPool = [];
for (let i = 0; i < TRAIL_PARTS.length; i++) divePartPool.push(new THREE.Vector3());
const divePts = [];
const _handV = new THREE.Vector3();
// The DAZED body's own head point (see the star ring in the frame below).
const _dizzyV = new THREE.Vector3();

function divePartPoints() {
  const mesh = player.charMesh;
  if (!mesh) return null;
  const b = mesh.userData.bones;
  const hl = mesh.userData.handLocal;
  if (!b || !b.head || !hl) return null;
  divePts.length = 0;
  for (let i = 0; i < TRAIL_PARTS.length; i++) {
    const name = TRAIL_PARTS[i];
    if (name === "handL" || name === "handR") {
      // A hand hangs off the forearm's own hand socket, so the point follows the wrist through a
      // splay exactly as the digits do.
      const side = name === "handL" ? "L" : "R";
      const arm = b["armLower" + side];
      const h = hl[side];
      if (!arm || !h) continue;
      _handV.set(h.x, h.y, h.z);
      arm.localToWorld(_handV);
      divePts.push(divePartPool[divePts.length].copy(_handV));
      continue;
    }
    const o = b[name];
    if (!o) continue;
    divePts.push(o.getWorldPosition(divePartPool[divePts.length]));
  }
  return divePts.length ? divePts : null;
}

function dustAtWall(size, opacity) {
  const nx = player.wallNx;
  const nz = player.wallNz;
  if (!nx && !nz) return;
  // wallNx/Nz points away from the wall, so the contact face sits on the -n side of the cube
  const cx = player.pos.x - nx * (P.HX + 0.07);
  const cy = player.pos.y - P.HY + 0.14;
  const cz = player.pos.z - nz * (P.HZ + 0.07);
  // ...and the grit is the colour of the face the boot is on, not the biome's fog: kicking off a
  // painted slab throws that slab, the same way a break does (see destruction.js).
  effects.puff(cx, cy, cz, size, surfaceColorAt(cx, cy, cz, false), opacity);
}

// The grit a squeeze scrapes off the walls it is threading (see `Player.squeezeAt`, which leaves
// the two contact points on `sqA`/`sqB`). The points come from the physics, so this only owns the
// RATE: the walls are sampled for their colour, so one puff per frame on BOTH sides would be two
// world samples a frame for something the eye reads as one scrape. Sides alternate, and the side
// that is open is skipped.
let squeezeDustT = 0;
let squeezeSide = 0;
function squeezeDust(dt) {
  if (player.state !== "slide" || player.squeeze <= 0.2) {
    squeezeDustT = 0;
    return;
  }
  squeezeDustT -= dt;
  if (squeezeDustT > 0) return;
  squeezeDustT = 0.05;
  squeezeSide ^= 1;
  const a = squeezeSide ? player.sqA : player.sqB;
  const p = a.act ? a : squeezeSide ? player.sqB : player.sqA;
  if (!p.act) return;
  // ...in the colour of the face being scraped, the same way the wall's own grit is (see
  // `dustAtWall`): the gap throws its own paint, not the biome's fog.
  effects.puff(p.x, p.y, p.z, 0.9 + player.squeeze * 1.1, surfaceColorAt(p.x, p.y, p.z, false), 0.18 + player.squeeze * 0.18);
}

// The destruction pass only reports what happened to the world; the visuals and sounds of it
// are made here, next to the slam's own FX, so all the impact of a broken world lives in one
// place. Cracks puff a little dust, a block coming apart throws a cloud of itself and a lot of
// it, and the ground unstitching is the heaviest hit in the game (it is the one you only get by
// standing there and doing it four times).
//
// Every one of these is drawn in the colour of the thing that broke: the event carries a `dust`
// when the surface was a BLOCK (its own colour, lifted — see destruction.js), and only the ground
// falls back to `biomeDust()`, which is the biome's own dust and so is already the ground's
// colour. Break a red crate and the cloud is red; slam the meadow and it is meadow.
function drainDestruction() {
  const ev = destruction.events;
  if (!ev.length) return;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e.type === "crack") {
      effects.puff(e.x, e.y, e.z, e.big ? 2.6 : 1.3, e.dust || biomeDust(), e.big ? 0.42 : 0.24);
    } else if (e.type === "destroy") {
      const dust = e.dust || biomeDust();
      // A break is a CLOUD and not a shock (see `debrisCloud`): the old `shockwave` gave every
      // crate in the game the slam's ring and a standing column of dust.
      effects.debrisCloud(e.x, e.y, e.z, 0.45 + e.power * 0.5, dust);
      // The low ground cloud is a lighter thing than the debris cloud at any surface, so a block
      // gets a pale wash of its own colour and the ground keeps the colour it always had.
      effects.puff(e.x, e.y - 0.3, e.z, 3.2 + e.power * 3, e.dust || [0.85, 0.84, 0.78], 0.4);
      rig.shake = Math.max(rig.shake, 0.75 + e.power * 0.7);
      sfx.crumble(e.power);
    } else if (e.type === "unstitch") {
      effects.debrisCloud(e.x, e.y, e.z, 0.5 + e.power * 0.6, biomeDust());
      effects.puff(e.x, e.y + 0.25, e.z, 2.8 + e.power * 3, [0.9, 0.88, 0.8], 0.42);
      rig.shake = Math.max(rig.shake, 0.9 + e.power * 0.8);
      sfx.crumble(e.power * 0.9);
      // ...and the grass that was standing on that patch is standing in a hole now: the deck under
      // it moved, so the tiles over the hole are re-read (see `Grass.invalidate`). The crater's own
      // centre and radius go with it, so only the tiles the disc touches are rebuilt — everything
      // else in either ring is still standing on ground that has not moved. Nothing to do in the
      // other two worlds, where the field is switched off and this returns immediately.
      grass.invalidate(e.x, e.z, (e.r || 5) + 1);
    } else if (e.type === "shardhit" && e.power > 0.25) {
      effects.puff(e.x, e.y + 0.1, e.z, 0.9 + e.power * 1.4, biomeDust(), 0.22);
    }
  }
  ev.length = 0;
}

// `dt` is the WORLD's step and `pdt` the BODY's (see the bullet-time note in `loop`) — they are the
// same number except while an air combo has the world in slow time, when the player keeps his own.
// The split is deliberately small: only the calls that ARE the player's own clock (his update, and
// the camera that is bolted to him) take `pdt`. Anything the world owns — the enemies, the props,
// the debris, the meters — stays on `dt`, so the slow reads as the world crawling rather than as
// everything being fine.
function frame(dt, inp, pdt = dt) {
  const lookScale = input.sensitivity;
  rig.aim(inp.lookDX * lookScale, inp.lookDY * lookScale);
  // The camera's own impulse decays on the BODY's clock: a punch is thrown by the player and its
  // kick should land and let go at the speed he threw it, even with the world standing still.
  rig.updatePunch(pdt);
  // ...and the lens's own flash (see `post.flash`), which decays on the same clock as the punch.
  post.update(pdt);
  // The player steers off the camera's yaw (see CameraRig.moveYaw): the picture itself, always.
  // A kick's turn lands in one frame, so the new line is yours immediately — the character is
  // the one that takes its time coming round to it.
  player.camYaw = rig.moveYaw();
  // ...and first person's own half (see the facing chain in `player.js`): the eye IS the head, so
  // the body has to be held on the camera's line while the mode is on.
  player.firstPerson = rig.firstPerson;

  if (running) {
    const bx = player.pos.x;
    const bz = player.pos.z;
    // THE GEAR reads first: TAB/E own the frame's input while an editor is open (movement
    // frozen, skills suppressed), and E near the bag or a dropped item spends itself here.
    gear.preFrame(dt, inp);
    // THE BODY ON ITS OWN CLOCK (see the bullet-time note in `loop`): with an air combo open the
    // world is on `dt × slowmo` and the player is on the raw `dt`, so his attacks, his chain and his
    // air moves play at full speed while everything he is hitting crawls. His FALL is the exception
    // and is handled inside `player.js` off `player.fallScale`.
    player.update(pdt, inp);
    // ...and the head rides the mouse once the pocket editor owns the picture.
    gear.postPlayer();
    // The four meters, right after the body's own update and BEFORE the enemies': a skill fired
    // this frame (a dash, a blast, a parry window) has to be able to change what happens to the
    // bodies this frame — the parry in particular is read by the enemy's own punch test below.
    abilities.update(dt, inp, running);
    spawnDist.v += Math.hypot(player.pos.x - bx, player.pos.z - bz);
    // ...and the staff props, right after the body's own update: they read the body's finished
    // pose (the move MOUNTS the shaft onto the rig — see `Poles.mount`) and the body's position,
    // so this has to be after `updateVisual` and not a line before it.
    poles.update(dt, player, effects);
    // ...and the bag + the dropped gear: world physics, kicks, prompts, settle tweens.
    gear.update(dt);
    // ---- the fight ----
    // The other side of the melee chain. They are updated AFTER the player so they react to where
    // the body actually ended the frame, and their one attack lands here rather than in
    // player.js: an enemy punch is a SHOVE, a shake, and — since the dial — health.
    if (enemies.spawned) {
      enemies.update(dt, player);
      for (const eh of enemies.events) {
        // ...and a body THROWN into a wall SLAMS it (see `enemy.js`'s `wallSlam` and
        // `poseHurtWallSlam`): the impact comes off the FACE, in the face's own colour, because
        // that is the thing the body just hit. A thud, a ring against the wall and a shake —
        // the same three things the game already gives a body being put into a surface.
        if (eh.type === "wallslam") {
          const c = eh.color || [0.85, 0.85, 0.85];
          effects.puff(eh.x, eh.y, eh.z, 2.4, c, 0.34);
          // ...and it comes off the FACE (see `wallGrit`): a body going into a wall used to ring the
          // floor it never touched.
          effects.wallGrit(eh.x, eh.y, eh.z, eh.nx, 0, eh.nz, 0.34 + Math.min(0.4, eh.speed * 0.03), c);
          screenShock(eh.x, eh.y, eh.z, Math.min(0.85, 0.30 + eh.speed * 0.05));
          rig.shake = Math.max(rig.shake, 0.5);
          if (sfx.crumble) sfx.crumble(0.45);
          // ...and THE FACE takes the body (see `worldStrike`): a body thrown hard enough to slam
          // takes a bite out of what it hits, so the wall the player threw him into is the wall
          // the player broke. `eh.nx/nz` is the shove the wall gave the body — its own normal
          // pointing out of the face — so the blow travelled the other way.
          worldStrike(eh.x, eh.y, eh.z, Math.min(0.9, 0.25 + eh.speed * 0.045), "wall", [-eh.nx, 0, -eh.nz]);
          // ...and it COUNTS toward THE WALL CLINCH (see `feedWallChain`): the body arriving at the
          // stone is the loudest way to hit a wall the game has, and it is the same act the tally's
          // three doors are all counting — *"if i keep m1ing the enemy to a wall i start a wall
          // combo"*, with the finisher's own throw being what usually puts him on it. Fed HERE rather
          // than in the enemy because this is the one place that knows it was the PLAYER's doing (the
          // event only exists for a body thrown off a face at `E.WALL_SPEED`), and because the tally
          // is the player's, not the world's.
          player.feedWallChain();
          continue;
        }
        if (eh.type === "enemyLaunch") {
          // A BODY FIRED OFF THE LAUNCH PAD (session 174 — see `Enemy.padLaunch`). The shot is the
          // player's own, one body over: the ring and the grit come off the plate the body just
          // left (the event carries the body's FEET, which is where the plate is), and the shake is
          // trimmed a little, because a body is usually further from the camera than the player's own
          // feet and a full-strength shot would read as one going off under them.
          effects.liftOff(eh.x, eh.y, eh.z, 1.0, [0.4, 0.95, 1.15]);
          effects.puff(eh.x, eh.y, eh.z, 3.6, [0.55, 0.95, 1.05], 0.5);
          rig.shake = Math.max(rig.shake, 0.4);
          if (sfx.launch) sfx.launch();
          continue;
        }
        if (eh.type !== "enemyHit") continue;
        // ...and it costs HEALTH (see "The HUD dial" and `player.damage`). This used to be a pure
        // shove — "nothing in this game can kill you" — which left the melee chain as the one
        // system in the game with no risk attached to it; the dial's green core is what changed
        // that, and the i-frames inside `damage` are what keep a crowd of bodies from stun-locking
        // the player with it.
        // ...and a GRAB's own armor (skill 1 — see `player.armored`): a punch that lands on a body
        // with a neck in its hand sparks off it and nothing else happens — no health, no shove, no
        // interrupt. It is the move's whole approach: the grab portion is the half that cannot be
        // traded with, which is exactly why the WHIFF (armor never goes up) is the punishable half.
        // ...and the BACKDASH's i-frames ride the same read (see `player.invuln`): for the middle
        // fifth of a second of the backstep the punch does not land at all — no health, no shove.
        if (player.armored && (player.armored() || (player.invuln && player.invuln()))) {
          // The parry: a ring of air between the fist and the body, not a mark on the floor.
          effects.ward(eh.x, eh.y, eh.z, -eh.dx, 0.2, -eh.dz, 0.6, [0.55, 0.8, 1.35]);
          effects.puff(eh.x, eh.y, eh.z, 1.2, [0.7, 0.85, 1.2], 0.22);
          rig.shake = Math.max(rig.shake, 0.22);
          if (sfx.enemyHit) sfx.enemyHit();
          continue;
        }
        player.damage(eh.dmg);
        player.vel.x += eh.dx * eh.push;
        player.vel.z += eh.dz * eh.push;
        player.vel.y = Math.max(player.vel.y, eh.up);
        rig.shake = Math.max(rig.shake, 0.45);
        // A punch the PLAYER takes is drawn by the same strike system as one he lands (see
        // `effects.impact`), thrown down the line the enemy's own push travels back up, in a colour
        // that is nobody's but this one's: the chain's moves are warm metal and cold whip, and being
        // hit is red. `eh.dx/dz` is the shove the enemy applied, so the strike line is its negative.
        effects.impact(eh.x, eh.y, eh.z, -eh.dx, 0.06, -eh.dz, 0.5, { color: [1.15, 0.42, 0.34] });
        effects.puff(eh.x, eh.y, eh.z, 1.8, [0.9, 0.6, 0.5], 0.3);
        screenShock(eh.x, eh.y, eh.z, 0.55);
        post.flash(0.16, [1.0, 0.62, 0.55], 5.2);
        rig.punch(-(0.5));
        if (sfx.enemyHit) sfx.enemyHit();
      }
    }
    // The economy reads the frame's events HERE, after everything has pushed into them: the hits the
    // player landed come off his own update, but the hits he TOOK arrive with the enemies, and a
    // `credit()` that ran any earlier would never see the "hurt" that drops his rank (or the "down"
    // that wipes it). This is why the meters are two calls and not one — see `Abilities.update`.
    abilities.credit();
    const ev = player.events;
    if (ev.indexOf("hit") !== -1 && player.lastHit) {
      // A strike that lands. The FX are built off the body that took it rather than off the fist,
      // so the grit and the flash arrive where the impact actually was.
      //
      // THE STRIKE itself is `effects.impact` (see its note in effects.js): a flash on the contact,
      // an air ring square to the line the blow travelled, and a cone of sparks thrown down that
      // same line. The line is read off the two bodies rather than off the pose — the contact point
      // the hit reported minus the striker's own chest — so a punch thrown at a body that has just
      // been knocked sideways sparks off in the direction it was actually thrown instead of the
      // direction the player happens to be facing a frame later.
      const h = player.lastHit;
      const sl = strikeLine(h.x, h.y, h.z);
      const fx = HIT_FX[h.move] || HIT_FX[0];
      const hp = h.slam ? 1 : h.power;
      effects.impact(h.x, h.y, h.z, sl[0], sl[1], sl[2], hp, {
        color: fx.color,
        dust: surfaceColorAt(h.x, h.y - 0.5, h.z, true),
      });
      // ...and the LENS takes it (see `screenShock`): the picture bends where the blow landed and
      // the bend travels out of frame. Everything above is drawn in the world; this is the same
      // strike arriving at the eye, and it is what makes the difference between a hit that happened
      // somewhere and a hit that was FELT.
      screenShock(h.x, h.y, h.z, hp);
      // The heavy ones get the ground's own mark too — a finisher that put a body down is also
      // something the FLOOR felt, and the mark on the deck is the only part of a strike that is about
      // the world rather than about the two bodies.
      // ...and (session 131) the two heavy ones are different marks, because they are different
      // things: the SLAM drives a body INTO the deck and takes the crater, while the third M1 only
      // trips it over — which is a body ARRIVING on the floor, so it takes the landing mark with the
      // skid of whatever it was still travelling.
      if (h.slam) effects.slamCrater(h.x, h.y - 0.5, h.z, 0.7 + h.power * 0.5, fx.color);
      else if (h.move === 3) effects.landDust(h.x, h.y - 0.5, h.z, 0.7 + h.power * 0.5, fx.color, sl[0], sl[2]);
      rig.shake = Math.max(rig.shake, 0.22 + h.power * 0.55);
      // ...and the lens, which is the half of an impact no particle can do: for a fifth of a second
      // the picture is tighter than it should be, then opens back up (see `CameraRig.punch`), and
      // the frame itself takes a wash of the blow's own colour (see `post.flash`) for the length of
      // a blink. The wash is the one part of a strike that is not IN the world — it is the fight
      // arriving at the camera — and it is what makes a heavy move feel heavier without making it
      // any bigger.
      rig.punch(-(fx.punch + h.power * 0.45));
      rig.rollKick((Math.random() - 0.5) * 0.05 * (0.4 + h.power));
      rig.pull(-(0.32 + h.power * 0.5));
      post.flash(fx.flash * (0.6 + h.power * 0.7), [fx.color[0] * 0.9 + 0.32, fx.color[1] * 0.9 + 0.3, fx.color[2] * 0.9 + 0.28], 4.6);
      if (sfx.hit) sfx.hit(h.move, h.catch);
      comboCount = Math.min(99, comboCount + 1);
      comboT = COMBO_HOLD;
      hud.setCombo(comboCount, h.slam ? "SLAM" : COMBO_NAMES[h.move] || "HIT");
    }
    if (ev.indexOf("clash") !== -1) {
      // Two M1s locked (see `startClash` in player/combat.js). The clash's own FX (see
      // `effects.clashMeet`): two limbs arriving at one point is the one contact in the game with no
      // striker, so it is drawn as a MEETING — the biggest star in the game, a cross of light
      // through the point, a VERTICAL shock disc in the plane the two of them are squeezing between
      // them, sparks thrown both ways down their line and a fountain up off it, and a wide flat ring
      // on the deck because both of them are planted. It is the loudest single beat in the fight
      // short of a finisher, and the shake is the whole point of it: the fight just stopped being a
      // boxing match.
      const c = player.clash;
      const ux = c ? c.ux : Math.sin(player.facing);
      const uz = c ? c.uz : Math.cos(player.facing);
      clashContact(_clashPt);
      const cx = _clashPt.x;
      const cy = _clashPt.y;
      const cz = _clashPt.z;
      const gy = player.pos.y - P.HY;
      effects.clashMeet(cx, cy, cz, ux, uz, 1, gy);
      screenShock(cx, cy, cz, 1);
      rig.shake = Math.max(rig.shake, 0.72);
      rig.punch(-0.6);
      rig.pull(-0.35);
      rig.rollKick((Math.random() - 0.5) * 0.06);
      post.flash(0.30, [1.0, 0.94, 0.72], 4.0);
      // ...and the two of them kick the deck, because a clash is fought with both feet planted.
      effects.puff(player.pos.x, gy + 0.12, player.pos.z, 1.5, surfaceColorAt(player.pos.x, gy, player.pos.z, true), 0.24);
    }
    if (ev.indexOf("clashwin") !== -1) {
      // ...and WON: the pressure the two of them were leaning on each other with lets go all at
      // once, so it RELEASES upward — the deck lets the body go (see `liftOff`), the meeting plane
      // rings once more, and a fountain of the lock's own sparks goes up. The strike itself already
      // fired above (the win IS the move landing — see `endClash`), so this is the flourish on top
      // of it rather than the blow, which is why it is the lock's gold and not the move's own colour.
      const h = player.lastHit;
      const x = h ? h.x : player.pos.x;
      const y = h ? h.y : player.pos.y + P.HY * 0.7;
      const z = h ? h.z : player.pos.z;
      effects.liftOff(x, y - P.HY * 0.9, z, 0.85, [1.05, 0.96, 0.62]);
      effects.ward(x, y, z, Math.sin(player.facing), 0.35, Math.cos(player.facing), 0.8, [1.0, 0.96, 0.7]);
      _clashDir.set(0, 1, 0);
      effects.sparkCone(x, y, z, _clashDir, 14, 10, 0.9, [1.0, 0.94, 0.62], 0.9);
      screenShock(x, y, z, 1.0);
      rig.shake = Math.max(rig.shake, 0.6);
      rig.punch(-0.7);
      post.flash(0.24, [1.0, 0.95, 0.7], 4.0);
    }
    if (ev.indexOf("clashlose") !== -1 && player.lastClash) {
      // ...and the player lost it: the fist he was pushing against comes through. It is dressed the
      // way every other knock on the player is (see the `enemyHit` block above) — the strike down
      // the line the body's own push travels back up, a shock ring at the contact and the lens
      // taking it — so a lock lost and a punch taken are the same event, which is what they are.
      const c = player.lastClash;
      player.damage(P.CLASH_LOSE_DMG);
      player.vel.x += c.dx * P.CLASH_LOSE_PUSH;
      player.vel.z += c.dz * P.CLASH_LOSE_PUSH;
      player.vel.y = Math.max(player.vel.y, P.CLASH_LOSE_UP);
      effects.impact(c.x, c.y, c.z, -c.dx, 0.12, -c.dz, 0.85, { color: [1.15, 0.46, 0.36] });
      effects.puff(c.x, c.y, c.z, 2.2, [0.9, 0.6, 0.5], 0.34);
      screenShock(c.x, c.y, c.z, 0.8);
      rig.shake = Math.max(rig.shake, 0.7);
      rig.punch(-0.7);
      post.flash(0.22, [1.0, 0.6, 0.52], 5.0);
      if (sfx.enemyHit) sfx.enemyHit();
    }
    if (ev.indexOf("clashbreak") !== -1 && player.lastClash) {
      // A dead heat: neither shove won, so the two of them come apart — the one beat of a clash
      // whose sparks are SYMMETRICAL (thrown both ways at once), with the meeting plane rung wide
      // between them and a pale wash of dust, and nothing bright on either side, because nobody
      // took it.
      const c = player.lastClash;
      const ux = c.dx || Math.sin(player.facing);
      const uz = c.dz || Math.cos(player.facing);
      effects.ward(c.x, c.y, c.z, ux, 0.15, uz, 0.9, [1.0, 0.96, 0.78]);
      _clashDir.set(ux, 0.15, uz);
      effects.sparkCone(c.x, c.y, c.z, _clashDir, 8, 9, 0.7, [1.0, 0.94, 0.78], 0.7);
      _clashDir.set(-ux, 0.35, -uz);
      effects.sparkCone(c.x, c.y, c.z, _clashDir, 8, 9, 0.7, [1.0, 0.94, 0.78], 0.7);
      effects.puff(c.x, c.y, c.z, 2.0, [0.94, 0.92, 0.86], 0.30);
      screenShock(c.x, c.y, c.z, 0.5);
      rig.shake = Math.max(rig.shake, 0.34);
    }
    if (ev.indexOf("macaco") !== -1) {
      // The plant, at the feet (see `startMacaco`): the hand going down is the move's whole read,
      // and the grit is what says a body just changed level on the pavement.
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.08, player.pos.z, 2.0, surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true), 0.34);
    }
    if (ev.indexOf("macacohit") !== -1 && player.lastMacacoHit) {
      // ...and the fling: the body the slide took goes UP off the legs. It is a bigger, brighter
      // version of the slide's own hit FX, with the ring under the body rather than on it, because
      // the whole point of the move is that the body leaves the deck.
      const h = player.lastMacacoHit;
      // ...and the fling: the body the slide took goes UP off the legs. It is a bigger, brighter
      // version of the slide's own hit FX, with the ring under the body rather than on it, because
      // the whole point of the move is that the body leaves the deck — so the strike line is
      // straight UP, and the bar and the cone are thrown along it.
      effects.impact(h.x, h.y, h.z, 0, 1, 0.12, 0.95, { color: [1.0, 0.92, 0.6] });
      effects.puff(h.x, h.y, h.z, 3.4, [0.98, 0.94, 0.84], 0.44);
      // The body goes UP off the legs, so the deck is left BEHIND (see `liftOff`) — this is the one
      // hit in the game whose whole point is that the floor is no longer involved.
      effects.liftOff(h.x, h.y - 0.6, h.z, 0.9, [1, 0.9, 0.66]);
      screenShock(h.x, h.y, h.z, 0.95);
      rig.shake = Math.max(rig.shake, 0.7);
      rig.punch(-0.85);
      post.flash(0.24, [1.0, 0.94, 0.66], 4.4);
      if (sfx.hit) sfx.hit(3, true);
    }
    if (ev.indexOf("doublejump") !== -1) {
      effects.liftOff(player.pos.x, player.pos.y - P.HY, player.pos.z, 0.45, biomeDust());
      effects.puff(player.pos.x, player.pos.y - P.HY, player.pos.z, 2.6, [0.95, 0.94, 0.8], 0.5);
    }
    // ---- THE RUNNING VAULT (see `startVault` / the `vault` case in player.js) ----
    // Three beats, and they are the three beats a vault HAS: the hand going down on the box, the
    // crossing itself, and the body coming back onto the deck still running.
    if (ev.indexOf("vault") !== -1) {
      // THE PLANT is drawn where the hand actually lands — `vaultPlantAt`, the top of the box a
      // hand's width in from the face the body is crossing (player.js reads it off the collider, so
      // it is the real box and not a guess). This is the whole read of the move: the body TOUCHED
      // something on the way over. A puff at the feet would say it jumped.
      const vp = player.vaultPlantAt;
      const p = Math.max(0, Math.min(1, player.vaultSpeed / 16));
      if (vp) {
        const pc = surfaceColorAt(vp.x, vp.y - 0.5, vp.z, true);
        effects.vaultPlant(vp.x, vp.y, vp.z, p, pc, Math.sin(player.facing), Math.cos(player.facing));
      }
      // ...and the camera takes it as a bank toward the side the legs sweep. That bank is what makes
      // a vault legible from the chase camera at all: the body is a shape in the middle of the
      // screen and the HORIZON is what tells you it just went over something.
      // ...and the camera is pushed BACK for the crossing (see `CameraRig.pull`): a vault is the one
      // move in the game that is about a piece of the WORLD rather than about a body, so the box has
      // to be in the frame, and at the chase distance it is not unless the picture is opened up.
      //
      // IT USED TO DO THREE MORE THINGS, and they were the whole of what the user was feeling when
      // they said *"the vault has like impact heavy impact gng dont make it like that make it smooth
      // and fluent"*: a lens PUNCH-IN (`rig.punch`), a camera SHAKE, and a post FLASH — the exact
      // trio a landed STRIKE is dressed in (see `effects.impact` and the hit blocks below). A body
      // putting a hand on a rail and going over it does not knock the world, does not flash the
      // screen, and does not hit anything. The push-back and the bank are the vault's own two cues
      // and both stay: they are about the OBSTACLE and the SIDE, not about a blow.
      rig.rollKick(-player.vaultSide * (0.035 + p * 0.045));
      rig.pull(0.8 + p * 0.55);
      if (sfx.vault) sfx.vault(p);
    }
    if (player.state === "vault") {
      // ...and the crossing is a standing wave of air along the line of travel. A per-frame emitter,
      // so the rate limit lives here rather than in the effect (the same bargain the slide's spray
      // makes): ~13 pulses a second reads as one continuous rush without stacking so many cards and
      // rings that a camera sitting directly behind the body sees a tunnel rather than a wake.
      vaultFxT -= dt;
      if (vaultFxT <= 0) {
        vaultFxT = 0.075;
        const p = Math.max(0, Math.min(1, player.vaultSpeed / 16));
        effects.vaultWhoosh(player.pos.x, player.pos.y - 0.12, player.pos.z, Math.sin(player.facing), Math.cos(player.facing), p);
      }
      // (The crossing used to feed its own LINE here — a ribbon strip down the body's path plus a
      // couple of bright rakes thrown back along it every ~60 ms, `effects.vaultWake`. It is
      // REMOVED at the user's request: *"remove the trail for the vault mech"*. The record of what
      // it was, and why the vault was the only move on the deck wearing one, is where the method
      // used to live in effects.js. The whoosh above is the whole of the crossing's FX now — like
      // the plant and the landing, it is an EVENT on a timer rather than something fed every
      // frame, so the `vault` arm of this block no longer needs `dt` at all.)
    }
    if (ev.indexOf("vaultend") !== -1) {
      // THE FAR SIDE: the body comes down still running, so it is a LANDING's mark with the exit
      // speed on it rather than a stumble. The lens used to take the weight here too — a punch-in
      // and a `pull(-0.45)` that yanked the camera back IN toward the body on the frame the crossing
      // ended. Both are gone with the plant's shake and flash (see above): the picture now just
      // eases back from the plant's push-back on its own, which is the one thing the vault's camera
      // ever needed from the far side.
      const p = Math.max(0, Math.min(1, player.vaultSpeed / 16));
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.vaultLand(player.pos.x, player.pos.y - P.HY, player.pos.z, p, col);
      if (sfx.vaultLand) sfx.vaultLand(p);
    }
    if (ev.indexOf("land") !== -1 && player.landImpact > 0.28) {
      // A landing is a LANDING (see `landDust`): a thin ring, the deck's own dust, and the skid of
      // grit thrown forward along whatever he was still travelling when he came down. It used to be
      // a bare puff — and the heavier landings used to borrow the slam's crater.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.landDust(player.pos.x, player.pos.y - P.HY, player.pos.z, 0.30 + player.landImpact * 0.55, col, player.vel.x, player.vel.z);
    }
    if (ev.indexOf("slamimpact") !== -1 && player.lastSlam) {
      const s = player.lastSlam;
      // The boot lands somewhere in the world, and the world remembers it: cracks open, and
      // enough of them in one place takes that surface apart (see destruction.js). The impact
      // reports the colour of the surface it landed on, so the ring and the dust it throws are
      // the colour of the thing that broke rather than the colour of the biome's fog.
      const hit = destruction.impact(s.x, s.y, s.z, s.power);
      effects.slamCrater(s.x, s.y, s.z, s.power, hit.dust || biomeDust());
      rig.shake = Math.max(rig.shake, 0.5 + s.power * 0.8);
      post.flash(0.16 + s.power * 0.16, [1.0, 0.86, 0.66], 4.0);
      player.lastSlam = null;
    }
    if (ev.indexOf("hammer") !== -1) {
      // The flurry opens (see `startHammer`). The opener gets a bigger shake and a ring of its own so
      // the move announces itself before the first fist lands; the six impacts inside it are ordinary
      // `slamimpact`s and need nothing here.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.slamCrater(player.pos.x, player.pos.y - P.HY + 0.05, player.pos.z, 0.8, col);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.12, player.pos.z, 3.6, col, 0.44);
      rig.shake = Math.max(rig.shake, 1.05);
    }
    if (ev.indexOf("slidehit") !== -1 && player.lastSlideHit) {
      // A slide took a body off its feet (see `slideContact`). The grit and the flash come off the
      // BODY that was flipped rather than off the deck the slide was grinding: it is the body the
      // impact happened to, and the deck is already busy with the slide's own wake (drawn every
      // frame below). `power` is on the same 0..1 dial as every other impact, so the FX cost
      // nothing new — only the anchor and the sound are this feature's own.
      const h = player.lastSlideHit;
      const sl = strikeLine(h.x, h.y, h.z);
      effects.impact(h.x, h.y, h.z, sl[0], sl[1] * 0.4, sl[2], 0.45 + h.power * 0.4, { color: [1.0, 0.9, 0.62] });
      effects.puff(h.x, h.y, h.z, 1.8 + h.power * 2.2, [0.96, 0.92, 0.82], 0.32);
      effects.landDust(h.x, h.y, h.z, 0.26 + h.power * 0.34, [1, 0.9, 0.66], sl[0], sl[2]);
      rig.shake = Math.max(rig.shake, 0.24 + h.power * 0.5);
      rig.punch(-(0.4 + h.power * 0.4));
      rig.pull(-(0.2 + h.power * 0.3));
      post.flash(0.12 + h.power * 0.1, [1.0, 0.9, 0.66], 4.6);
      sfx.slideHit(h.power, h.ramp);
      player.lastSlideHit = null;
    }
    if (ev.indexOf("divehit") !== -1 && player.lastDiveHit) {
      // A dive ARRIVED on a body (see `diveContact`). The anchor is the body, like the slide's, and
      // the read has to say both of the things the move can be: a TACKLE that takes the body up
      // (a burst, a wide ring and the diver's own dust where he leaves the floor) or the
      // body-check it becomes while the diamond is still filling (the same FX, smaller, and no
      // ring under the enemy — nothing is going up, so nothing announces a launch).
      const h = player.lastDiveHit;
      const sl = strikeLine(h.x, h.y, h.z);
      effects.impact(h.x, h.y, h.z, sl[0], h.up ? 0.35 : 0.05, sl[2], h.up ? 0.95 : 0.6, { color: h.up ? [1.0, 0.94, 0.72] : [1.0, 0.9, 0.72] });
      effects.puff(h.x, h.y, h.z, (h.up ? 2.6 : 1.7) + h.power * 2.0, [0.97, 0.95, 0.88], h.up ? 0.38 : 0.28);
      if (h.up) {
        // ...and the ring is UNDER the body rather than on it: this is the one hit in the game
        // whose whole point is that the body leaves the deck, so the mark belongs on the floor.
        effects.liftOff(h.x, h.y - 0.7, h.z, 0.4 + h.power * 0.4, [1, 0.94, 0.76]);
        effects.puff(player.pos.x, player.pos.y - P.HY, player.pos.z, 2.2, [0.96, 0.95, 0.9], 0.34);
      }
      rig.shake = Math.max(rig.shake, h.up ? 0.5 + h.power * 0.5 : 0.3);
      rig.punch(-(h.up ? 0.7 : 0.4));
      rig.pull(-(h.up ? 0.4 : 0.22));
      post.flash((h.up ? 0.2 : 0.12) + h.power * 0.12, [1.0, 0.95, 0.76], 4.4);
      sfx.diveLaunch(h.power, h.up);
      player.lastDiveHit = null;
    }
    if (ev.indexOf("dropblast") !== -1 && player.blast) {
      // ...and a hard landing threw the street into the air (see `dropBlast`). The ring is at the
      // LANDING, at the feet, because a blast is a thing the ground does rather than a thing the
      // body does, and it is drawn in the colour of whatever the body came down on. This sits
      // alongside the slam's own ring when a slam lands: one is the crater, this one is the air
      // moving, and the two are deliberately different sizes (the blast reaches much further).
      const b = player.blast;
      const col = surfaceColorAt(b.x, b.y, b.z, true);
      // The blast is the slam's own air moving, so it is a landing mark thrown WIDE — the whole point
      // of the blast is that it reaches further than the crater does — and not a second crater.
      effects.landDust(b.x, b.y + 0.05, b.z, 0.35 + b.power * 0.75, col, null, null, 1.8);
      effects.puff(b.x, b.y + 0.15, b.z, 2.2 + b.power * 3.4, col, 0.3 + b.power * 0.28);
      rig.shake = Math.max(rig.shake, 0.3 + b.power * 0.65);
      sfx.blast(b.power);
      player.blast = null;
    }
    // ---- the dial's own four (see "The HUD dial") ----
    if (ev.indexOf("whirl") !== -1) {
      // Skill 1 opening: the lunge kicks its own dirt out from under him — a PUSH-OFF in whatever the
      // deck is made of (see `scuff`: grit thrown backward and a short skid, and no ring, because a
      // ring at the feet is a LANDING's mark and he is leaving). The cast is read off the ground from
      // this camera because the body is a dark silhouette against it.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.scuff(player.pos.x, player.pos.y - P.HY, player.pos.z, Math.sin(player.facing), Math.cos(player.facing), 0.75, col);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.14, player.pos.z, 1.2, col, 0.22);
      rig.shake = Math.max(rig.shake, 0.14);
      sfx.dive();
    }
    if (ev.indexOf("whirlgrab") !== -1 && player.lastWhirl) {
      // ...and the hand closing on the throat. The spark is AT THE NECK (not on the player), which
      // is the whole read of a grab: the effect has to be where the two bodies meet.
      const g = player.lastWhirl;
      const sl = strikeLine(g.x, g.y, g.z);
      effects.impact(g.x, g.y, g.z, sl[0], 0.1, sl[2], 0.55, { color: [1.0, 0.96, 0.86] });
      effects.ward(g.x, g.y, g.z, sl[0], 0.1, sl[2], 0.55, [1, 0.96, 0.86]);
      effects.puff(g.x, g.y, g.z, 1.4, [0.96, 0.94, 0.88], 0.26);
      rig.shake = Math.max(rig.shake, 0.3);
      rig.punch(-0.42);
      post.flash(0.1, [1.0, 0.97, 0.9], 5.0);
      sfx.hit(1, true);
    }
    if (ev.indexOf("whirlslam") !== -1 && player.lastWhirlSlam) {
      // ...and the SLAM: the body driven into the deck. The loudest thing the move does, and it
      // lands where the BODY is (not on the player), which is the whole read of a slam — the
      // crater, the ring and the dust all belong to the body that was driven into it.
      const t = player.lastWhirlSlam;
      const col = surfaceColorAt(t.x, t.y, t.z, true);
      effects.slamCrater(t.x, t.y + 0.05, t.z, 0.55 + t.power * 0.5, col);
      effects.puff(t.x, t.y + 0.12, t.z, 2.4 + t.power * 2.2, col, 0.34);
      // ...and the strike itself: the body driven into the deck, struck straight DOWN into it, so
      // the flash, the bar and the sparks all lie on the vertical — the one direction a slam has.
      effects.impact(t.x, t.y + 0.25, t.z, 0, -1, 0, 0.85 + t.power * 0.2, { color: [1.0, 0.9, 0.7] });
      // ...and the FINISHER's own read: a body already under the finish line takes the ELBOW, so
      // the heavier strike is told apart by the blue of the move's own energy.
      if (t.finish) effects.impact(t.x, t.y + 0.45, t.z, 0, 1, 0, 0.9, { color: [0.55, 0.75, 1.35] });
      rig.shake = Math.max(rig.shake, 0.45 + t.power * 0.55);
      rig.punch(-(0.7 + t.power * 0.3));
      rig.pull(-(0.35 + t.power * 0.25));
      post.flash((t.finish ? 0.3 : 0.18) + t.power * 0.14, t.finish ? [0.72, 0.86, 1.2] : [1.0, 0.9, 0.72], 4.0);
      sfx.slamImpact(Math.min(1, t.power));
      // ...and THE DECK takes the body: this is a slam, so it is addressed to the GROUND, and
      // `t.power` is the move's own ramp (read straight off the aerial/finisher tables, and over 1
      // for the heavier two — `strike` clamps it). A whirl chain therefore leaves the same crater a
      // ground slam does, which is what the move's own FX have always claimed it does.
      worldStrike(t.x, t.y, t.z, Math.min(1, t.power), "ground");
    }
    if (ev.indexOf("whirllaunch") !== -1 && player.lastWhirlLaunch) {
      // ...and the pop out of the crater: the body leaves UP, so the ring stands on the deck under
      // it and the burst rides the line it leaves on.
      const t = player.lastWhirlLaunch;
      effects.impact(t.x, t.y, t.z, 0, 1, 0, t.elbow ? 0.85 : 0.7, { color: [1.0, 0.9, 0.7] });
      if (!t.elbow) {
        effects.liftOff(t.x, t.y - 0.55, t.z, 0.42 + t.power * 0.3, [1, 0.92, 0.76]);
        effects.puff(t.x, t.y - 0.28, t.z, 2.2, [0.95, 0.93, 0.9], 0.3);
      }
      rig.shake = Math.max(rig.shake, 0.3 + t.power * 0.3);
      rig.punch(-0.55);
      post.flash(0.14 + t.power * 0.1, [1.0, 0.93, 0.74], 4.6);
      sfx.slamImpact(Math.max(0.2, t.power * 0.8));
    }
    if (ev.indexOf("whirlscrape") !== -1 && player.lastWhirlScrape) {
      // ...and THE HAUL's own read (the beat between the grab and the spin): the pavement coming off
      // the skull that is being dragged along it. It is a small, FREQUENT puff rather than an
      // impact — the body is being skinned, not struck — and it is raised AT THE HEAD, which is the
      // whole point of the beat; the sound is the wall-slide's own scrape, at the speed the haul
      // is actually travelling, so the read of "something heavy sliding on the floor" is one the
      // game already makes elsewhere.
      const t = player.lastWhirlScrape;
      const col = surfaceColorAt(t.x, t.y, t.z, true);
      effects.puff(t.x, t.y + 0.10, t.z, 1.0 + Math.random() * 0.8, col, 0.22);
      sfx.wallScrape(Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 8));
    }
    // ---- THE SKATEBOARD (session 200 — see "THE SKATEBOARD" in src/README.md) ----
    // The board's own events, and each of them is a real contact rather than a flourish: a push is
    // the foot put down on the ROAD, the pop is the tail snapped against the deck, a landing is the
    // wheels coming back onto it, a bail is the deck leaving without its rider and a bomb is a body
    // thrown at the road. Everything is raised on the WHEEL LINE (`player.pos.y - P.HY` — the board
    // is one deck above the ground, `P.BOARD_LIFT`, and the wheels are what actually touches it), so
    // the marks land on the surface the board is on rather than on the body that is over it.
    if (ev.indexOf("boardmount") !== -1) {
      // Step on: the deck takes the weight and the tape settles — one small scuff under the wheels.
      const y = player.pos.y - P.HY;
      effects.puff(player.pos.x, y + 0.06, player.pos.z, 0.7, [0.92, 0.92, 0.9], 0.16);
    }
    if (ev.indexOf("boardpush") !== -1) {
      // The push is the FOOT on the road, so it is a `scuff` (see it: the skid a boot leaves) thrown
      // BACKWARD along the line the board is going — the foot is what is holding still while the
      // deck runs away from it — plus a hand's-width of dust. Raised behind the rider rather than
      // under him, because that is where the foot is.
      const y = player.pos.y - P.HY;
      const col = surfaceColorAt(player.pos.x, y, player.pos.z, true);
      const bx = player.pos.x - Math.sin(player.facing) * 0.34;
      const bz = player.pos.z - Math.cos(player.facing) * 0.34;
      effects.scuff(bx, y, bz, -Math.sin(player.facing), -Math.cos(player.facing), 0.5, col);
      effects.puff(bx, y + 0.10, bz, 0.8, col, 0.16);
    }
    if (ev.indexOf("trick") !== -1) {
      // The POP: the tail snapped against the deck and the wheels left the road. `liftOff` is the
      // game's own "something left the ground" ring and it is exactly that; the scuff under it is the
      // tail's own little skid at the moment of the snap.
      const y = player.pos.y - P.HY;
      const col = surfaceColorAt(player.pos.x, y, player.pos.z, true);
      effects.liftOff(player.pos.x, y + 0.02, player.pos.z, 0.30, col);
      effects.scuff(player.pos.x, y, player.pos.z, Math.sin(player.facing), Math.cos(player.facing), 0.42, col);
      if (player.trickName) {
        trickText3D.trigger(player.trickName, tricks.mult, 0, player);
      }
    }
    if (ev.indexOf("trickland") !== -1 || ev.indexOf("boardland") !== -1) {
      // ...and the CATCH, or the bomb's arrival. Both are the wheels finding the road again, so both
      // take the landing's own mark at the WHEEL line with a puff of the surface's colour, thrown
      // along whatever the rider is still travelling. The bomb arrives harder (it is the one landing
      // in the game that keeps its speed, `P.BBOMB_LAND_KEEP`) and it is the event's own name that
      // says which of the two this is.
      const y = player.pos.y - P.HY;
      const col = surfaceColorAt(player.pos.x, y, player.pos.z, true);
      const bomb = ev.indexOf("boardland") !== -1;
      effects.landDust(player.pos.x, y, player.pos.z, bomb ? 0.85 : 0.5, col, player.vel.x, player.vel.z);
      effects.puff(player.pos.x, y + 0.10, player.pos.z, bomb ? 2.4 : 1.4, col, 0.24);
      rig.shake = Math.max(rig.shake, bomb ? 0.34 : 0.16);
      // ...AND THE DECK'S OWN TAG (session 201): which of the six things M1 can throw the wheels just
      // came back down from (see `hud.setTrick`). The rider's own name for the move is the one piece
      // of the trick system that was never said out loud — the landing was a thud and a puff whether
      // it was an OLLIE or a BODY VARIAL — so it is named here, on the frame the catch is. The BOMB
      // says nothing: it is not one of the table's tricks (it is the deck taken to the road under a
      // prone body, see `bbomb`), so there is nothing to name and `trickName` still holds whatever
      // came before it.
      if (!bomb && player.trickName) {
        hud.setTrick(player.trickName);
        trickT = TRICK_HOLD;
        const pts = tricks.land(player.trickName);
        trickText3D.land(player.trickName, tricks.mult, pts, player);
        if (player.trickName === "MUTE" || player.trickName === "BACKFLIP" || player.trickName === "STRAIGHT AIR") effects.trickStars(player.pos.x, player.pos.y + 1.0, player.pos.z, 1);
      } else if (bomb) {
        tricks.lastName = "BOMB";
        trickText3D.land("BOMB", tricks.mult, 150, player);
      }
    }
    if (ev.indexOf("spinloop") !== -1) {
      if (player.trickName) {
        const pts = tricks.land(player.trickName);
        trickText3D.land(player.trickName, tricks.mult, pts, player);
      }
    }
    if (ev.indexOf("boardbail") !== -1) {
      // THE BAIL: the deck shoots out from under him and keeps going — so the mark is a STREAK of the
      // deck's own skid leaving the scene, thrown along the board's line rather than the body's, with
      // the rider's own dust where he was left standing.
      const y = player.pos.y - P.HY;
      const col = surfaceColorAt(player.pos.x, y, player.pos.z, true);
      const bx = Math.sin(player.facing);
      const bz = Math.cos(player.facing);
      effects.scuff(player.pos.x, y, player.pos.z, bx, bz, 0.9, col);
      effects.puff(player.pos.x, y + 0.12, player.pos.z, 1.8, col, 0.28);
      rig.shake = Math.max(rig.shake, 0.22);
      tricks.fullReset();
      trickText3D.bail();
    }
    if (ev.indexOf("bslide") !== -1) {
      // The powerslide OPENS: the wheels break loose and the first shower goes off the deck's edge.
      // The continuous spray below is what carries the move; this is its first, biggest burst.
      trickText3D.trigger("POWERSLIDE", tricks.mult, 0, player);
      const y = player.pos.y - P.HY;
      const col = surfaceColorAt(player.pos.x, y, player.pos.z, true);
      _boardSpray.set(-Math.sin(player.facing), -0.22, -Math.cos(player.facing)).normalize();
      effects.sparkCone(player.pos.x, y + 0.05, player.pos.z, _boardSpray, 16, 5.2, 0.55, [1, 0.86, 0.5], 0.5);
      effects.puff(player.pos.x, y + 0.10, player.pos.z, 2.0, col, 0.26);
      boardSlideFxT = 0.05;
    }
    if (ev.indexOf("bomb") !== -1) {
      // The bomb's own opening: the deck thrown UP as the body folds over it — a lift-off under the
      // wheels and the dust that comes with a hard push-off.
      const y = player.pos.y - P.HY;
      const col = surfaceColorAt(player.pos.x, y, player.pos.z, true);
      effects.liftOff(player.pos.x, y + 0.02, player.pos.z, 0.42, col);
      effects.puff(player.pos.x, y + 0.14, player.pos.z, 1.8, col, 0.26);
      rig.shake = Math.max(rig.shake, 0.14);
    }
    if (ev.indexOf("bombair") !== -1) {
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.puff(player.pos.x, player.pos.y, player.pos.z, 1.8, col, 0.26);
      rig.shake = Math.max(rig.shake, 0.10);
    }
    if (player.state === "bslide") {
      // ...and the POWERSLIDE'S OWN SPRAY, fed every ~50 ms for as long as the deck is sideways (a
      // rate, like the vault's whoosh, for the same reason: a slide is a state, not an event). The
      // wheels are being dragged ACROSS the road, so the sparks are thrown BACK along the travel and
      // down into the surface they are grinding, and the amount of them is the speed it is costing
      // him (`player.bslideAngle` is how far the deck is off its line, so a bigger angle is a bigger
      // shower — the mechanic and the picture are the same number).
      boardSlideFxT -= dt;
      if (boardSlideFxT <= 0) {
        boardSlideFxT = 0.05 + Math.random() * 0.03;
        const k = Math.min(1, Math.abs(player.bslideAngle) / P.BSLIDE_ANG);
        const y = player.pos.y - P.HY;
        _boardSpray.set(-Math.sin(player.facing), -0.20 - 0.2 * k, -Math.cos(player.facing)).normalize();
        effects.sparkCone(player.pos.x, y + 0.04, player.pos.z, _boardSpray,
          Math.max(1, Math.round(3 + 7 * k)), 3.2 + 3.4 * k, 0.25 + 0.4 * k, [1, 0.86, 0.5], 0.45);
        // ...and the ear's half of the same number (`boardGrind` is deliberately the same level
        // ramp as the spray above, so the two cannot disagree about how hard the slide is biting).
        if (sfx.boardGrind) sfx.boardGrind(k);
      }
    }
    // ---- the FLYING KNEE (skill 1's new verb — see "SKILL 1 — THE FLYING KNEE") ----
    if (ev.indexOf("knee") !== -1 && player.kneePhase === 0) {
      // The RUN-UP's own read: the deck kicked out from under him as he goes from a standstill into
      // the burst (the user's *"fast run up about like 20 speed"*). It is a push-off (see `scuff`) in
      // the direction he is about to leave on, which is the same beat the whirl's opening is — the
      // move's START, which from this camera is told off the ground rather than off the body.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.scuff(player.pos.x, player.pos.y - P.HY, player.pos.z, Math.sin(player.facing), Math.cos(player.facing), 0.7, col);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.14, player.pos.z, 1.1, col, 0.20);
      rig.shake = Math.max(rig.shake, 0.12);
    }
    if (ev.indexOf("kneeleap") !== -1) {
      // ...and the LEAP: the dirt left behind where the feet were, thrown out along the line he
      // leaves on — the move is a jump and this is the only frame it is one.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.scuff(player.pos.x, player.pos.y - P.HY, player.pos.z, Math.sin(player.facing), Math.cos(player.facing), 0.6, col);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.12, player.pos.z, 1.1, col, 0.20);
    }
    if (ev.indexOf("kneehit") !== -1 && player.lastKnee) {
      // THE CONTACT — the whole move. The ring is raised AT THE SKULL (not on the player), because
      // the read of a head shot is where the head went: the knee arrives, the head snaps and the
      // body is thrown off its feet. It is the loudest thing the skill does, so it gets the burst,
      // the wide ring and the dust together, and the shake is what carries the weight.
      const k = player.lastKnee;
      const hot = [1, 0.92, 0.68];
      // The knee lands on a BODY, usually in the air, and the deck is nowhere near it — so this is a
      // STRIKE and nothing else: the flash, the air ring and the cone of `impact`, plus the dust of
      // the contact. It used to add a crater ring and a golden burst on the floor, which put the whole
      // move's read on a surface it never touched.
      const ksl = strikeLine(k.x, k.y, k.z);
      effects.impact(k.x, k.y, k.z, ksl[0], 0.24, ksl[2], 0.5 + k.power * 0.3, { color: hot });
      effects.puff(k.x, k.y - 0.1, k.z, 2.0 + k.power * 1.4, [0.96, 0.95, 0.9], 0.3);
      rig.shake = Math.max(rig.shake, 0.5 + k.power * 0.4);
    }
    if (ev.indexOf("kneeland") !== -1 && player.lastKneeLand) {
      // ...and the SKID out of it: the deck biting the landing, thrown forward along the direction
      // he is still travelling, scaled by whether the knee found anything (a whiff slides short).
      const l = player.lastKneeLand;
      const col = surfaceColorAt(l.x, l.y, l.z, true);
      effects.landDust(l.x, l.y + 0.05, l.z, 0.4 + l.power * 0.25, col, player.vel.x, player.vel.z, 1.25);
      effects.puff(l.x, l.y + 0.12, l.z, 1.8 + l.power * 1.4, col, 0.3);
      rig.shake = Math.max(rig.shake, 0.16 + l.power * 0.18);
      // ...and the deck BITES back: a knee thrown at twenty units a second does not stop where the
      // body comes down, so the skid is a real blow on the ground — small, but the same currency
      // as every other (`l.power` is 1 when the knee found a body and 0.5 when it whiffed).
      worldStrike(l.x, l.y, l.z, l.power * 0.5, "ground");
    }
    // ---- THE WALL CLINCH (see "THE WALL CLINCH" in src/README.md) ----
    // Its four beats, and the first three are anchored on the WALL rather than on either body,
    // because the wall is the thing being hit: the smash throws the grit and the ring off the face in
    // the face's own colour (the same read the wall slam makes), each knee is a small hot impact at
    // the gut with a shake that RAMPS with the acceleration, and the throw is the loudest thing the
    // move does. The grip itself only kicks the dust up the face where the pair is standing.
    if (ev.indexOf("wallbeat") !== -1 && player.wallBeatWall) {
      const w = player.wallBeatWall;
      const gx = w.faceX - w.nx * 0.12;
      const gz = w.faceZ - w.nz * 0.12;
      const col = surfaceColorAt(gx, w.deck + P.HY, gz, false);
      effects.puff(gx, w.deck + 0.55, gz, 1.7, col, 0.3);
      effects.wallGrit(gx, w.deck + 0.55, gz, w.nx, 0, w.nz, 0.4, surfaceColorAt(gx, w.deck + 0.55, gz, false));
      rig.shake = Math.max(rig.shake, 0.2);
      // The picture is TAKEN IN for the whole move (see `pull`): the pair is working a face, and a
      // clinch read from the chase camera's full distance is two small figures against a wall. It is
      // pulled in here and again on every beat below, which is what walks the camera in over the
      // hold rather than snapping it in at the start.
      rig.pull(-0.32);
    }
    if (ev.indexOf("wallbsmash") !== -1 && player.lastWallbSmash) {
      // THE SMASH: the skull into the stone, which is the beat the move is named for. The impact is
      // written OFF THE FACE (the same bargain the wall slam makes) and the flash is the whole screen
      // going warm for a couple of frames.
      const s = player.lastWallbSmash;
      const col = surfaceColorAt(s.x - s.nx * 0.16, s.y, s.z - s.nz * 0.16, false);
      effects.wallGrit(s.x, s.y, s.z, s.nx, 0, s.nz, 0.62, col);
      effects.puff(s.x, s.y, s.z, 2.2, col, 0.34);
      effects.impact(s.x, s.y, s.z, s.nx, 0.04, s.nz, 0.6, { color: [1.0, 0.9, 0.74], dust: col });
      screenShock(s.x, s.y, s.z, 0.88);
      rig.shake = Math.max(rig.shake, 0.72);
      rig.pull(-0.5);
      post.flash(0.13, [1.0, 0.94, 0.84], 4.6);
      // ...and THE WALL takes it too: the smash is addressed to the FACE (see the wall strike in
      // destruction.js) rather than to the deck under the pair, so working the clinch on a wall
      // leaves that wall cracked exactly where the skull went into it — and enough clinches put a
      // hole in it. `n` points out of the face, so the blow travelled -n.
      worldStrike(s.x, s.y, s.z, 0.85, "wall", [-s.nx, 0, -s.nz]);
    }
    if (ev.indexOf("wallbknee") !== -1 && player.lastWallbKnee) {
      // ...and EACH KNEE. The read of the flurry is the ACCELERATION, so the power the beat is drawn
      // at comes straight off the blur (`blur` 0 on the first beats, 1 by the last), the shake adds
      // up rather than resetting, and the last few go through the lens as well — which together are
      // the user's "until it becomes a blur" heard as well as seen.
      const k = player.lastWallbKnee;
      const hot = [1, 0.92, 0.68];
      // Two dials, because the flurry's tail is FAST now (the beats DOUBLE — see
      // `P.WALLBEAT.kneeAccel`, and the floor is 0.042 s): `p` is what the beat does to the SHAKE
      // and the shot, and it ramps to 1 on the last knee, while `vis` is what it DRAWS, and it
      // falls with the blur. At 24 strikes a second an individual strike is under three frames of
      // the game's own 60, so a full-size one is not a hit the eye can resolve — it is noise laid
      // over the four other beats still fading around it, and it is what fills the picture with
      // the long pale bars in the capture of a mid-flurry frame: the tail's six beats at full draw
      // held **131 of the FX pool's 176 slots** (measured on the live page, with the quality tier
      // at 0.7). The blur itself is the SMEAR's job (see the block below — small, cheap, fed on a
      // timer), so the tail stands back and lets the smear be what the eye reads while the SHAKE
      // and the shot keep telling it the beats are getting harder.
      const p = 0.35 + k.blur * 0.65;
      const vis = 0.35 + (1 - k.blur) * 0.65;
      // ...drawn as a STRIKE rather than as a puff (`impact`, see effects.js): a knee has a
      // direction, and at ten of them a second the direction is the only thing that can tell the
      // eye which way each one went. A ring on the ground would say "something landed here"; the
      // strike line says "this went INTO him", which is the whole read of a knee.
      const dl = Math.hypot(k.nx, 0.25, k.nz) || 1;
      effects.impact(k.x, k.y, k.z, k.nx / dl, 0.25 / dl, k.nz / dl, 0.30 + vis * 0.42, { color: hot });
      // ...and the last, fastest beats go through the LENS as well as the flash (see `screenShock`):
      // the shake and the shot already ramp with the acceleration, and this is that same ramp
      // arriving at the picture — the tail of the flurry bends the frame on every beat, which is the
      // half of *"until it becomes a blur"* the smear cannot say on its own.
      screenShock(k.x, k.y, k.z, 0.30 + p * 0.46);
      effects.puff(k.x, k.y, k.z, 0.8 + vis * 0.6, [0.96, 0.95, 0.9], 0.20);
      rig.shake = Math.max(rig.shake, 0.20 + p * 0.34);
      // ...and each beat takes the picture in a little further, so the ten knees of the flurry
      // walk the camera onto the belly as the beats shorten — the acceleration felt as the shot
      // closing rather than only as the hits landing (which is the same read `cineAmt` gives the
      // flying knee, on the move's own clock instead of a one-shot sweep).
      rig.pull(-(0.16 + p * 0.20));
      if (k.blur > 0.55) post.flash(0.07, [1.0, 0.9, 0.7], 3.6);
    }
    if (ev.indexOf("wallbhurl") !== -1 && player.lastWallbHurl) {
      // ...and THE THROW: the body sent off the wall. It is the move's punctuation, so it gets the
      // burst, the wide ring and the biggest shake of the four — anything less and the ten hits
      // before it would have no full stop.
      const h = player.lastWallbHurl;
      effects.wallGrit(h.x, h.y, h.z, h.nx, 0, h.nz, 1.15, [1, 0.95, 0.85]);
      effects.puff(h.x, h.y, h.z, 3.0, [0.96, 0.95, 0.9], 0.4);
      screenShock(h.x, h.y, h.z, 1);
      rig.shake = Math.max(rig.shake, 1.15);
      // ...and the picture is thrown OUT with the body: the shove is the biggest thing the move
      // does and the frame has to open to hold the flight, which is the opposite of what the
      // flurry was doing to it a frame earlier — the release is a cut from closing to opening.
      rig.pull(0.72);
      post.flash(0.16, [1.0, 0.9, 0.8], 6.2);
    }
    if (ev.indexOf("climbskip") !== -1 && player.lastClimbSkip) {
      // ---- THE CLIMB SKIP (session 177) ----
      // The release of the wall pull (see the `CLIMB_LOAD_` / `CLIMB_SKIP_` blocks in player.js): the
      // limbs have just been torn off the stone and the body is thrown up the face, so the read is
      // the FACE shedding — a burst of its own grit thrown off the plate in the face's own colour, a
      // lift where the hands were, and a shake that scales with the charge the hold wound up. The
      // pad's own sound is played at the release itself (player.js), because the burst IS a launch.
      const s = player.lastClimbSkip;
      const ch = Math.max(0, Math.min(1, s.charge || 0));
      const col = surfaceColorAt(s.x - s.nx * 0.10, s.y, s.z - s.nz * 0.10, false);
      effects.wallGrit(s.x, s.y, s.z, s.nx, 0, s.nz, 0.50 + ch * 0.90, col);
      effects.puff(s.x, s.y - 0.15, s.z, 1.10 + ch * 1.30, col, 0.30);
      effects.liftOff(s.x, s.y - 0.45, s.z, 0.22 + ch * 0.30,
        [col[0] + 0.25, col[1] + 0.25, col[2] + 0.25]);
      rig.shake = Math.max(rig.shake, 0.14 + ch * 0.26);
      // ...and a full coil is worth arriving at the eye too: the same small wash the launch pad's own
      // throw uses, in the face's colour rather than the pad's white.
      if (ch > 0.45) post.flash(0.04 + ch * 0.06, [col[0] + 0.35, col[1] + 0.35, col[2] + 0.35], 5.0);
    }
    // ---- THE RIGHT-CLICK GRAB (see "THE RIGHT-CLICK GRAB" in player.js) ----
    // Its four beats, in the order they happen: the move opening, the hands closing, whatever the
    // grab turns into, and — on the slam only — the player's own landing out of the flip. The
    // sounds belong to the verb (they are fired with the beats themselves, in player.js), so
    // everything here is world-space and nothing here makes a noise.
    if (ev.indexOf("grab") !== -1) {
      // The opening: the deck kicked out from under him as he drives in on a body. The SLAM is the
      // exception — that one goes UP (its own leap is read at the take), so there is nothing to
      // kick.
      if (player.grabKind !== 2) {
        const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
        effects.scuff(player.pos.x, player.pos.y - P.HY, player.pos.z, Math.sin(player.facing), Math.cos(player.facing), 0.55, col);
        effects.puff(player.pos.x, player.pos.y - P.HY + 0.13, player.pos.z, 1.1, col, 0.20);
        rig.shake = Math.max(rig.shake, 0.10);
      }
    }
    if (ev.indexOf("grabdash") !== -1 && player.lastGrabDash) {
      // THE FLASH DASH: the blur. A line of dust kicked off the launch point down his line, the
      // FOV punch, and a breath of shake — the only VFX the wind-up's payoff gets, because the
      // speed IS the effect.
      const d = player.lastGrabDash;
      player.lastGrabDash = null;
      const col = surfaceColorAt(d.x, d.y, d.z, true);
      for (let i = 0; i < 3; i++) {
        effects.puff(d.x - d.fx * (0.3 + i * 0.45), d.y + 0.05, d.z - d.fz * (0.3 + i * 0.45),
          1.1 - i * 0.2, col, 0.28);
      }
      rig.fovKick = Math.max(rig.fovKick, 1);
      rig.shake = Math.max(rig.shake, 0.15);
    }
    if (ev.indexOf("grabtake") !== -1 && player.lastGrab) {
      // THE LOCK — the throat in one hand. No flash, no ring: the hitstop freeze IS the effect,
      // the grip says the rest. One knock of shake to seat it.
      player.lastGrab = null;
      rig.shake = Math.max(rig.shake, 0.30);
    }
    if (ev.indexOf("grabcrash") !== -1 && player.lastGrabThrow) {
      // THE CRASH LANDING: back-first into the deck. The ring stands under the body, the dust
      // goes up off it, and the shake + hitstop land together — the biggest landing in the
      // grab's kit, because it is the whole point of the move.
      const t = player.lastGrabThrow;
      player.lastGrabThrow = null;
      const col = surfaceColorAt(t.x, t.y, t.z, true);
      // The crash landing is a body thrown into the deck — the heaviest LANDING in the game, so it
      // gets the landing mark at full spread rather than the slam's crater.
      effects.landDust(t.x, t.y + 0.06, t.z, 0.85, col, null, null, 1.6);
      effects.puff(t.x, t.y + 0.15, t.z, 2.6, col, 0.32);
      effects.puff(t.x, t.y + 0.5, t.z, 1.6, col, 0.25);
      rig.shake = Math.max(rig.shake, 0.70);
    }
    if (ev.indexOf("grabmiss") !== -1 && player.lastGrabMiss) {
      // THE EMPTY CLAMP: two hands closing on nothing. It gets the least of every beat on purpose —
      // a thin cold ring where the throat would have been and a breath of dust, and NO shake: there
      // is nothing there to shake the world for, and the read only lands if the game does not
      // pretend otherwise.
      const m = player.lastGrabMiss;
      effects.ward(m.x, m.y, m.z, Math.sin(player.facing), 0.1, Math.cos(player.facing), 0.20, [0.78, 0.83, 0.88]);
      effects.puff(m.x, m.y, m.z, 0.85, [0.80, 0.85, 0.90], 0.20);
    }
    if (ev.indexOf("grabcatch") !== -1 && player.lastGrabCatch) {
      // ...and the CATCH-STEP: the lead foot slapping the deck under the over-balance. This is the
      // one beat of the miss that touches anything, so it is the one that gets weight — a scuff of
      // dust and a small shake.
      const c = player.lastGrabCatch;
      const col = surfaceColorAt(c.x, c.y, c.z, true);
      effects.puff(c.x, c.y + 0.10, c.z, 1.5, col, 0.26);
      effects.landDust(c.x, c.y + 0.03, c.z, 0.24, col);
      rig.shake = Math.max(rig.shake, 0.12);
    }
    if (ev.indexOf("grabset") !== -1 && player.lastGrabSet) {
      // THE SET-UP: it is on its feet. A soft, cool pop at its feet — this is the one beat of the
      // three that is not an impact, so it gets a light touch and no shake at all. The STARS that
      // follow it are fed every frame by the ring emitter below.
      const s = player.lastGrabSet;
      // The one beat of the three that is NOT an impact: the body is put back on its feet, so it is a
      // lift — the deck LETS GO of it rather than taking it — and it wears the cool colour of the
      // ring of stars that follows (see `dizzyStars`).
      effects.liftOff(s.x, s.y - 1.0 + 0.06, s.z, 0.30, [0.86, 1.0, 1.2]);
      effects.puff(s.x, s.y - 1.0 + 0.14, s.z, 1.3, [0.88, 1.0, 1.18], 0.22);
    }
    if (ev.indexOf("grabslam") !== -1 && player.lastGrabSlam) {
      // THE SLAM — the body driven into the deck, and the loudest thing the button does: the crater,
      // the ring, the dust and a burst all at the BODY (a slam belongs to the body that was driven
      // into the ground, exactly like the whirl's own).
      const t = player.lastGrabSlam;
      const col = surfaceColorAt(t.x, t.y, t.z, true);
      effects.slamCrater(t.x, t.y + 0.05, t.z, 0.60 + t.power * 0.55, col);
      effects.puff(t.x, t.y + 0.12, t.z, 2.6 + t.power * 2.2, col, 0.35);
      rig.shake = Math.max(rig.shake, 0.5 + t.power * 0.5);
      // ...and the DECK: the grab slam drives a body into the ground, so it is a ground strike —
      // the same crater the slam leaves, bought with a move that is not the slam.
      worldStrike(t.x, t.y, t.z, Math.min(1, t.power), "ground");
    }
    if (ev.indexOf("grabland") !== -1) {
      // ...and his OWN feet back on the deck out of the flip.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.landDust(player.pos.x, player.pos.y - P.HY + 0.05, player.pos.z, 0.45, col, player.vel.x, player.vel.z);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.12, player.pos.z, 1.9, col, 0.3);
      rig.shake = Math.max(rig.shake, 0.18);
    }
    if (ev.indexOf("scissor") !== -1) {      // Skill 2 opening: the guard coming up. A flash at the hands (the same read the parry's
      // window used to have — the shape is a block, and what says "a window is OPEN" is this).
      const fx = Math.sin(player.facing);
      const fz = Math.cos(player.facing);
      effects.ward(player.pos.x + fx * 0.5, player.pos.y + 0.2, player.pos.z + fz * 0.5, fx, 0.1, fz, 0.3, [0.85, 0.94, 1]);
      effects.puff(player.pos.x + fx * 0.45, player.pos.y + 0.28, player.pos.z + fz * 0.45, 1.2, [0.86, 0.94, 1], 0.22);
      sfx.ui();
    }
    if (ev.indexOf("block") !== -1 && player.lastBlock) {
      // ...and the CATCH: the fist is turned away at the hands, so the spark is there rather than
      // on the body, and it is the loudest thing in an exchange the player did not walk into.
      const pp = player.lastBlock;
      // A fist turned away at the hands: the ward (the surface between the two bodies) and the strike
      // itself, there rather than on the body. Nothing touches the deck.
      effects.ward(pp.x, pp.y, pp.z, Math.sin(player.facing), 0.1, Math.cos(player.facing), 0.55, [1, 0.95, 0.78]);
      effects.impact(pp.x, pp.y, pp.z, Math.sin(player.facing), 0.1, Math.cos(player.facing), 0.55, { color: [1.0, 0.96, 0.8] });
      effects.puff(pp.x, pp.y, pp.z, 1.8, [0.98, 0.96, 0.88], 0.3);
      rig.shake = Math.max(rig.shake, 0.5);
      sfx.clash();
    }
    if (ev.indexOf("guardup") !== -1) {
      // THE BLOCK (M1 + M2 together — see `startBlock`): the chord closing and the guard coming up.
      // A tight ring at the hands, because the shape is the read and this is what says it happened.
      const fx = Math.sin(player.facing);
      const fz = Math.cos(player.facing);
      effects.ward(player.pos.x + fx * 0.4, player.pos.y + 0.3, player.pos.z + fz * 0.4, fx, 0.1, fz, 0.3, [0.9, 0.96, 1.05]);
      sfx.ui();
    }
    if (ev.indexOf("guardcharge") !== -1) {
      // ...and the guard BREAKING into the charge: the deck kicked out from under the drive.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.12, player.pos.z, 1.8, col, 0.28);
      sfx.dash();
    }
    if (ev.indexOf("guardshove") !== -1 && player.lastShove) {
      // ...and the charge running into somebody: they go off the line SIDEWAYS, so the burst is at
      // the body that was thrown rather than at the hands that threw it.
      const sh = player.lastShove;
      const shsl = strikeLine(sh.x, sh.y, sh.z);
      effects.impact(sh.x, sh.y, sh.z, shsl[0], 0.1, shsl[2], 0.6, { color: sh.reeling ? [1, 0.92, 0.72] : [0.96, 0.96, 0.92] });
      effects.puff(sh.x, sh.y - 0.2, sh.z, 1.8, [0.94, 0.92, 0.88], 0.26);
      rig.shake = Math.max(rig.shake, 0.26);
      sfx.hit(1, false);
    }
    // ---- THE RUNNING LUNGE (see "THE RUNNING LUNGE" in player.js) ----
    // Its four beats, in the order they happen. The sound belongs to the verb (the dash is fired in
    // player.js, the squeeze at the take), so everything here is world-space.
    if (ev.indexOf("lunge") !== -1) {
      // The POUNCE: the deck kicked out from under him as he throws himself off it, wide and low
      // because the whole move is a throw and the launch is the only part of it that touches the
      // ground until the roll does.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.scuff(player.pos.x, player.pos.y - P.HY, player.pos.z, Math.sin(player.facing), Math.cos(player.facing), 0.9, col);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.14, player.pos.z, 1.4, col, 0.24);
      rig.shake = Math.max(rig.shake, 0.14);
    }
    if (ev.indexOf("lungtake") !== -1 && player.lastLunge) {
      // THE TACKLE — the whole point of the button: the spark is raised AT THE BODY, because the
      // read is that the two of them met on the landing. It is the loudest thing the move does
      // (there is only one more beat left and it is the let-go), so it gets the burst, a wide ring
      // and the dust together.
      const l = player.lastLunge;
      // The tackle: the two of them met on the landing, so it is a STRIKE and the deck underneath it
      // takes a landing mark at the same moment — the one beat in the game that is both at once.
      const lsl = strikeLine(l.x, l.y - 0.9, l.z);
      effects.impact(l.x, l.y - 0.9, l.z, lsl[0], 0.08, lsl[2], 0.7, { color: [1.0, 0.95, 0.82] });
      effects.landDust(l.x, l.y - 0.9, l.z, 0.55, [1.0, 0.94, 0.8], lsl[0], lsl[2], 1.3);
      effects.puff(l.x, l.y - 0.8, l.z, 2.2, [0.96, 0.94, 0.88], 0.3);
      rig.shake = Math.max(rig.shake, 0.42);
    }
    if (ev.indexOf("freeroll") !== -1) {
      // THE LANDING ROLL (session 194 — see `startFreeRoll`): a free fall thrown straight into the
      // roll instead of catching itself. The impact is already in the world (the landing fires an
      // ordinary `land` — the ring, the dust and the thud are all its), so this is only the ROLL's
      // own contact: a scuff down the line he is about to go over on and the deck's own dust kicked
      // up in front of it, which is what reads as a body taking the ground on its shoulder rather
      // than on its heels.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      const fx = Math.sin(player.facing);
      const fz = Math.cos(player.facing);
      effects.scuff(player.pos.x, player.pos.y - P.HY, player.pos.z, fx, fz, 1.0, col);
      effects.puff(player.pos.x + fx * 0.5, player.pos.y - P.HY + 0.12, player.pos.z + fz * 0.5, 1.7, col, 0.26);
      rig.shake = Math.max(rig.shake, 0.18);
    }
    if (ev.indexOf("lungmiss") !== -1) {
      // ...and the MISS: the paws come down on nothing and he rolls straight out of it. A thin cold
      // ring where the body would have been and the deck's own dust under the roll — and NO shake:
      // there is nothing there to shake the world for (the empty clamp's own bargain).
      const fx = Math.sin(player.facing);
      const fz = Math.cos(player.facing);
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.ward(player.pos.x + fx * 0.8, player.pos.y - P.HY + 0.10, player.pos.z + fz * 0.8, fx, 0.1, fz, 0.26, [0.80, 0.86, 0.92]);
      effects.puff(player.pos.x + fx * 0.7, player.pos.y - P.HY + 0.16, player.pos.z + fz * 0.7, 1.6, col, 0.28);
    }
    if (ev.indexOf("lungjump") !== -1) {
      // THE SPREAD LEAP-OFF: he springs off the deck with the body under him, so the deck is what
      // takes it — a push-off (see `scuff`) with the dust thrown out along the line he is still
      // travelling, which is longer than a jump's because he leaves with the roll's own speed.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.scuff(player.pos.x, player.pos.y - P.HY, player.pos.z, Math.sin(player.facing), Math.cos(player.facing), 0.8, col);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.14, player.pos.z, 1.4, col, 0.24);
      rig.shake = Math.max(rig.shake, 0.2);
    }
    if (ev.indexOf("lungdrop") !== -1 && player.lastLunge) {
      // ...and the LET-GO: the body is off his hands. Where it goes is the body's business from
      // here (a `flight` ragdoll off the leap-off, a `fold` off the roll running out), so the only
      // thing this says is where it was put down.
      const l = player.lastLunge;
      effects.landDust(l.x, l.y - 0.95, l.z, 0.34, [0.92, 0.9, 0.86], null, null, 1.2);
      effects.puff(l.x, l.y - 0.85, l.z, 1.8, [0.94, 0.92, 0.88], 0.26);
      rig.shake = Math.max(rig.shake, 0.14);
    }
    if (ev.indexOf("scissorleap") !== -1) {
      // The leap: the dirt under the feet, left behind where he was (the sound is the jump's own).
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.scuff(player.pos.x, player.pos.y - P.HY, player.pos.z, Math.sin(player.facing), Math.cos(player.facing), 0.6, col);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.12, player.pos.z, 1.1, col, 0.20);
    }
    if (ev.indexOf("scissormiss") !== -1) {
      // THE WHIFF (session 143, the user's *"add a miss animtion for 2"* — re-aimed in session 152).
      // The legs snap shut on NOTHING, so there is still no impact to draw: no flash, no shake, no
      // hitstop on the world. What there is now is a POINT. The ring used to be laid at a fixed
      // offset from the player (1.15 up, 0.55 ahead of him), and since the miss is thrown UP AND
      // FORWARD out of a body that is already a metre off the deck, that put it somewhere near his
      // chest — nowhere the scissors ever went. The player now records where they actually closed
      // (the midpoint of the two drawn ankles on the shut's own frame — see `updateScissor`), so the
      // cold white ring and its puff land ON the pair of legs that shut, at the height the grip was
      // thrown at. Two legs closing on an empty ring is the whole read, and it only reads if the
      // ring is between them.
      const m = player.lastScissorMiss;
      const lx = m ? m.x : player.pos.x + Math.sin(player.facing) * 0.55;
      const ly = m ? m.y : player.pos.y - P.HY + 1.15;
      const lz = m ? m.z : player.pos.z + Math.cos(player.facing) * 0.55;
      const dx = m ? m.fx : Math.sin(player.facing);
      const dz = m ? m.fz : Math.cos(player.facing);
      effects.ward(lx, ly, lz, dx, 0.14, dz, 0.42, [0.86, 0.92, 1.04]);
      effects.puff(lx, ly, lz, 1.0, [0.92, 0.95, 1.0], 0.20);
    }
    if (ev.indexOf("scissorhit") !== -1 && player.lastScissor) {
      // The clamp: the legs shut on the neck, and the ring is thrown WIDE and FLAT because the
      // throw is a turn rather than a punch — a counter wears the brighter colour.
      const sc = player.lastScissor;
      const hot = sc.counter ? [1, 0.88, 0.62] : [0.92, 0.96, 1];
      // The clamp: the legs shut on the neck and throw the body over a SHOULDER, so the strike line
      // is the player's own forward (the direction the body is flung out of) and the whole read is
      // lateral — the bar, the ring and the cone all lie across it. A counter wears the brighter colour.
      const sl = strikeLine(sc.x, sc.y, sc.z);
      effects.impact(sc.x, sc.y, sc.z, sl[0], 0.12, sl[2], 0.7 + sc.power * 0.25, { color: hot });
      effects.ward(sc.x, sc.y, sc.z, sl[0], 0.12, sl[2], 0.6, hot);
      effects.puff(sc.x, sc.y - 0.2, sc.z, 2.0 + sc.power * 1.2, [0.95, 0.94, 0.92], 0.32);
      rig.shake = Math.max(rig.shake, 0.45 + sc.power * 0.3);
      rig.punch(-0.6);
      post.flash(0.16, hot[0] > 1 ? [1.0, 0.92, 0.68] : [0.92, 0.97, 1.1], 4.6);
      sfx.hit(2, true);
    }
    if (ev.indexOf("capo") !== -1) {
      // Skill 3 opening: the CHARGE. The move starts by sinking into the coil and driving forward,
      // so what the deck takes on the first frame is his weight LEAVING it — a push-off, in the
      // direction he is going (see `scuff`), rather than the hand-plant the kip-up used to open with
      // and not the crater a `shockwave` used to put under it.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.scuff(player.pos.x, player.pos.y - P.HY, player.pos.z, Math.sin(player.facing), Math.cos(player.facing), 0.30, col);
      sfx.step(true);
    }
    if (ev.indexOf("capohit") !== -1 && player.lastCapo) {
      // The whip: the leg goes round, so the ring is thrown wide and low at the body it caught.
      const c = player.lastCapo;
      const sl = strikeLine(c.x, c.y, c.z);
      effects.impact(c.x, c.y, c.z, sl[0], 0.16, sl[2], 0.72, { color: [1.0, 0.92, 0.74] });
      effects.landDust(c.x, c.y - 0.4, c.z, 0.5, [1, 0.95, 0.82], sl[0], sl[2], 1.3);
      effects.puff(c.x, c.y - 0.5, c.z, 2.4, [0.95, 0.93, 0.86], 0.34);
      rig.shake = Math.max(rig.shake, 0.42);
      rig.punch(-0.58);
      rig.pull(-0.3);
      post.flash(0.16, [1.0, 0.94, 0.76], 4.4);
      sfx.slideHit(1, false);
    }
    if (ev.indexOf("capojump") !== -1) {
      // ...and the LAUNCH itself (the same frame the kick lands): the deck lets go of him, so the
      // dirt is a burst rather than a ring.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.1, player.pos.z, 1.6, col, 0.26);
      effects.liftOff(player.pos.x, player.pos.y - P.HY + 0.05, player.pos.z, 0.55, [0.95, 0.98, 1]);
      rig.shake = Math.max(rig.shake, 0.16);
    }
    if (ev.indexOf("dash") !== -1) {
      // ...and the Q dash (see `startDash`): a step is a CONTACT, so the grit comes off the deck
      // where the trailing foot pushed and it wears the surface's own colour, like every other
      // contact in the game. Deliberately small — this is a step, not a landing — and there is no
      // ring: a ring at the feet would read as the slam it is not.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.10, player.pos.z, 1.3, col, 0.22);
      rig.shake = Math.max(rig.shake, 0.08);
    }
    if (ev.indexOf("dashland") !== -1) {
      // The BACKDASH's hero landing (see `poseBackdash`): the knee and the fist arrive together, so
      // it has to read as a real landing — a tight ring, a burst of grit in the surface's own colour
      // and a solid kick of shake. The slide out of it is the same shape skimming back, so the grit
      // off `dash` (the step's own puff) already covers the scrape.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.landDust(player.pos.x, player.pos.y - P.HY + 0.06, player.pos.z, 0.36, col, player.vel.x, player.vel.z, 1.25);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.12, player.pos.z, 2.2, col, 0.30);
      rig.shake = Math.max(rig.shake, 0.34);
    }
    if (ev.indexOf("boxland") !== -1) {
      // The BOXCUTTER's own landing (see `poseBoxcutter`): the feet arrive on their own, with
      // nothing on the deck but the soles of a trick already thrown — so it is the deck's grit and
      // a real kick of shake and NOT the backstep's hero landing above. No ring: a ring at the feet
      // would read as a slam, and the slam is a different move.
      const col = surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.10, player.pos.z, 1.9, col, 0.28);
      effects.scuff(player.pos.x, player.pos.y - P.HY, player.pos.z, player.vel.x, player.vel.z, 0.40, col);
      rig.shake = Math.max(rig.shake, 0.20);
    }
    if (ev.indexOf("over") !== -1 && player.lastOver) {
      // ...and the ultimate firing: the biggest ring in the game, at the feet, in the dial's own
      // cyan (it is the one effect in the game that wears the HUD's colour rather than the world's).
      const o = player.lastOver;
      // It is the biggest thing on the deck and it is a LIFT — the whole move is built to get him off
      // the ground — so it is the widest ring in the game AND a full-strength liftOff, in the dial's
      // own cyan (the one effect in the game that wears the HUD's colour rather than the world's).
      effects.landDust(o.x, o.y + 0.06, o.z, 1.15, [0.55, 0.95, 1.1], null, null, 2.2);
      effects.liftOff(o.x, o.y + 0.08, o.z, 1.15, [0.42, 0.95, 1.05]);
      effects.puff(o.x, o.y + 0.2, o.z, 5.4, [0.6, 0.95, 1.05], 0.55);
      rig.shake = Math.max(rig.shake, 1.0);
      sfx.blast(1);
    }
    if (ev.indexOf("overoff") !== -1) {
      effects.landDust(player.pos.x, player.pos.y - P.HY + 0.08, player.pos.z, 0.4, [0.5, 0.8, 0.95], null, null, 1.6);
      rig.shake = Math.max(rig.shake, 0.18);
    }
    if (ev.indexOf("hurt") !== -1) {
      // Taking one. The shove and the sound already exist (the `enemyHit` block above); this is the
      // read that says it COST something — a flash off the body, in the red the pills are.
      effects.ward(player.pos.x, player.pos.y, player.pos.z, Math.sin(player.facing), 0.2, Math.cos(player.facing), 0.5, [1, 0.42, 0.36]);
      rig.shake = Math.max(rig.shake, 0.4);
    }
    if (ev.indexOf("down") !== -1) {
      // Out of health (see `player.down`): the body is put back at the spawn by `respawn`, so the
      // only thing left to say is that it happened.
      effects.landDust(player.pos.x, player.pos.y - P.HY, player.pos.z, 1.0, [1, 0.5, 0.42], null, null, 2.0);
      effects.puff(player.pos.x, player.pos.y, player.pos.z, 4.2, [1, 0.6, 0.5], 0.5);
      rig.shake = Math.max(rig.shake, 1.2);
      sfx.blast(0.6);
    }
    if (ev.indexOf("wallkick") !== -1) {
      // The kick owns the turn: the whole point of the move is that the view comes round with
      // it, so the rig is turned here rather than anywhere in the player — and onto the KICK's
      // own line (`kickDir`, straight off the face), which is a different turn depending on how
      // you met the wall. A dive at a wall exits opposite where you were looking, so that is the
      // familiar half turn; a kick off a wall you were RIDING exits sideways, and a hardcoded
      // `Math.PI` would leave the view 90° off the line the boot sent you on — the dive swings
      // its aim onto the camera's forward, so the kick's own direction would then be dragged out
      // from under it. It lands in one frame (see CameraRig.kick); the body comes round after.
      const kickYaw = Math.atan2(-player.kickDirX, -player.kickDirZ);
      rig.kick(Math.atan2(Math.sin(kickYaw - rig.yaw), Math.cos(kickYaw - rig.yaw)));
      dustAtWall(2.6, 0.5);
      effects.puff(player.pos.x, player.pos.y - P.HY + 0.1, player.pos.z, 2.4, surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true), 0.4);
      // ...and THE BOOT lands on the wall as well as on the air (see `lastWallKick`): a face you
      // keep kicking is a face that cracks. It is addressed to the WALL, at boot height and on the
      // face itself, and it is the same vandalism the clinch's own tally is counting — a wall you
      // have kicked five times is a wall you have already chipped.
      if (player.lastWallKick) {
        const k = player.lastWallKick;
        worldStrike(k.x, k.y, k.z, Math.min(0.5, 0.18 + k.speed * 0.015), "wall", [-k.nx, 0, -k.nz]);
      }
    }
    if (ev.indexOf("wallgrab") !== -1 || ev.indexOf("wallstick") !== -1) {
      dustAtWall(1.5, 0.34);
    }
    if (ev.indexOf("ledgegrab") !== -1) {
      // The catch throws its grit off the LIP, not off the feet: the hands are what just landed,
      // and they landed `player.ledgeWall.topY` up the face.
      const w = player.ledgeWall;
      if (w) {
        // Grit off the LIP, in the lip's own colour — the hands are what just landed.
        const lx = player.pos.x - w.nx * (P.HX + 0.06);
        const lz = player.pos.z - w.nz * (P.HZ + 0.06);
        effects.puff(lx, w.topY + 0.06, lz, 1.4, surfaceColorAt(lx, w.topY + 0.06, lz, false), 0.3);
      }
    }
    if (ev.indexOf("wallscrape") !== -1) {
      // dust kicked off the wall face wherever the cube's feet are skimming it
      dustAtWall(1.2 + Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 20) * 1.1, 0.24);
    }
    if (ev.indexOf("squeezeout") !== -1) {
      // The gap let go and the slide was handed its shove (see `updateSqueeze`): the grit comes off
      // the deck where the body was pinched, and the world gives it a nudge so the release is felt
      // as well as heard. Kept small — it is a shove, not an impact.
      effects.puff(player.pos.x, player.pos.y - P.HY, player.pos.z, 1.6, surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true), 0.26);
      rig.shake = Math.max(rig.shake, 0.16);
    }
    if (ev.indexOf("mantleend") !== -1) {
      effects.puff(player.pos.x, player.pos.y - P.HY, player.pos.z, 2.2, surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true), 0.34);
      if (player.landImpact <= 0.05) rig.shake = Math.max(rig.shake, 0.16);
    }
    if (ev.indexOf("launch") !== -1) {
      // Fired off the plate, not off the feet: the ring and the grit belong on the pad the body
      // just left, and the whole point of the shot is that it is violent.
      effects.liftOff(player.pos.x, player.pos.y - P.HY, player.pos.z, 1.0, [0.4, 0.95, 1.15]);
      effects.puff(player.pos.x, player.pos.y - P.HY, player.pos.z, 3.6, [0.55, 0.95, 1.05], 0.5);
      rig.shake = Math.max(rig.shake, 0.55);
    }
    if (ev.indexOf("launchland") !== -1) {
      // Arriving on the roof is a real landing: it shakes, it throws dust, and it leaves its mark
      // on the slab, wide and heavy. The slab is a block, so the dust that comes off it
      // is the slab's colour (see destruction.js) — landing on the monolith's dark roof no longer
      // throws meadow.
      const hit = destruction.impact(player.pos.x, player.pos.y - P.HY, player.pos.z, 0.95);
      effects.landDust(player.pos.x, player.pos.y - P.HY, player.pos.z, 0.95, hit.dust || biomeDust(), player.vel.x, player.vel.z, 1.8);
      effects.puff(player.pos.x, player.pos.y - P.HY, player.pos.z, 4.2, hit.dust || [0.9, 0.92, 1.0], 0.45);
      rig.shake = Math.max(rig.shake, 1.0);
    }
    // ---- THE POLE (see `poleTake` / `poleStrike` / `poleThrow` / `poleBreak` in player.js) ----
    // The staff is the one weapon in the game that is a WORLD OBJECT, so every one of its events is
    // anchored on the SHAFT rather than on the body: what a strike hits is wherever the stick was,
    // which is why `poleStrikeContact` publishes its own `lastPole` (the shaft's middle and its tip)
    // and `poleBreak` its own cut point. Nothing here has to guess where anything happened.
    if (ev.indexOf("poletake") !== -1 && player.poleHeld) {
      // THE TAKE — the brief's *"i grab the pole normally"*, and there is no more to it than this:
      // the haul out of the deck is a grip, a step and a blend (see `updatePoleCarry` and the haul
      // in `updateVisual`), so the one thing the world has to say about it is the grit. The butt is
      // clearing the deck it was planted in, so the puff comes off the GROUND at the prop's own
      // spot — read off the prop rather than off the rig, because at this frame the shaft is still
      // standing exactly where it was planted.
      const p = player.poleHeld;
      const col = surfaceColorAt(p.x, p.groundY, p.z, true);
      effects.puff(p.x, p.groundY + 0.12, p.z, 1.5, col, 0.24);
      sfx.staffTake();
    }
    if (ev.indexOf("polewhip") !== -1) {
      // THE WHIP STARTING (see `updatePoleThrow`): the coil lets go a tenth of a second before
      // the fist opens, so it gets the lighter, rising whoosh — the release keeps the fat one.
      sfx.swing(1);
    }
    if (ev.indexOf("polerelease") !== -1) {
      // THE THROW LETTING GO (see `poleThrowRelease`): the whole read of a throw is the moment the
      // hand opens, so it gets the fattest whoosh in the set and a small tear of air where the
      // shaft left the palm (`poleGripW` is the point the release itself used, so the puff is on
      // the line the staff is about to travel down).
      const g = player.poleGripW;
      effects.puff(g.x, g.y, g.z, 1.5, [0.96, 0.93, 0.84], 0.24);
      sfx.swing(3);
    }
    if (ev.indexOf("polelaunch") !== -1) {
      // THE LAUNCH (the vault's strike — see `poleVaultLaunch`). It is the same beat as a double jump
      // in the body's own voice (`poleLaunch` plays it), so what the world adds is the one thing
      // the jump sound cannot say: the deck the staff was driven into. The tip is going through
      // it on the line it came down, and `lastPoleBreak` is exactly that point.
      const b = player.lastPoleBreak;
      if (b) {
        const floor = world.topBelow ? world.topBelow(b.x, b.z, b.y, 4) : world.terrainHeight(b.x, b.z);
        effects.landDust(b.x, floor + 0.05, b.z, 0.6, biomeDust(), null, null, 1.2);
        effects.puff(b.x, floor + 0.14, b.z, 1.8, biomeDust(), 0.3);
      }
    }
    if (ev.indexOf("polehit") !== -1 && player.lastPole) {
      // A staff strike landing. The flash and the grit belong at the TIP (the furthest end of the
      // shaft is where the staff actually reaches), and the ring is drawn at the shaft's MIDDLE,
      // low and flat, because the thing that just hit the world is a two-metre line rather than a
      // fist — so it leaves a line's worth of a mark rather than a point's.
      const h = player.lastPole;
      // The staff is the one verb whose strike point is two metres away on the end of a stick, so the
      // strike is drawn AT THE TIP (see `impact`) and the deck's own mark at the shaft's MIDDLE — a
      // line's worth of a mark rather than a point's.
      effects.impact(h.tipX, h.tipY, h.tipZ, h.x - player.pos.x, h.y - player.pos.y, h.z - player.pos.z, 0.55 + h.power * 0.35, { color: [1, 0.92, 0.62] });
      effects.puff(h.tipX, h.tipY, h.tipZ, 1.7 + h.power * 2.0, [0.96, 0.93, 0.84], 0.32);
      effects.landDust(h.x, Math.max(h.y, player.pos.y - P.HY + 0.05), h.z, 0.2 + h.power * 0.36, [1, 0.9, 0.66]);
      rig.shake = Math.max(rig.shake, 0.2 + h.power * 0.5);
      sfx.poleHit(h.power);
    }
    if ((ev.indexOf("polehit") !== -1 || ev.indexOf("polewhiff") !== -1) && player.lastPole) {
      // ...and THE TIP reaches the WORLD as well as the bodies. The staff is the one verb whose
      // strike point does not know what it is about to meet — it is two metres away on the end of a
      // swinging stick — so it is the one call that reads its own surface off its line ("auto", see
      // `worldStrike`). A strike swung through empty air beside a kerb does nothing at all, which is
      // exactly right: the address has to FIND a face, and a blow that finds none has hit nothing.
      // The heavier beats of the flurry bite harder (`index` runs the route), and the last beat is
      // already its own ground break below.
      const p = player.lastPole;
      worldStrike(p.tipX, p.tipY, p.tipZ, Math.min(0.55, 0.13 + p.index * 0.09), "auto",
        [p.tipX - player.pos.x, p.tipY - (player.pos.y + P.HY * 0.55), p.tipZ - player.pos.z]);
    }
    if (ev.indexOf("poleshatter") !== -1 && player.lastPoleBreak) {
      // ...and the staff going. The heaviest beat of the flurry, so it is the one impact in the game
      // that is BOTH a strike and a ground break: the cut point gets the flash and the splinters,
      // and the deck under it takes a real `destruction.impact` — a break leaves its own crack in the
      // ground, exactly the way the slam does, because that is what it is.
      // The wood comes off in the staff's own colour rather than the biome's: it is a prop breaking,
      // not the ground.
      const b = player.lastPoleBreak;
      const wood = [0.78, 0.64, 0.42];
      const floor = world.topBelow ? world.topBelow(b.x, b.z, b.y, 4) : world.terrainHeight(b.x, b.z);
      const hit = destruction.impact(b.x, floor, b.z, 0.5);
      effects.landDust(b.x, floor + 0.05, b.z, 0.72, hit.dust || biomeDust(), null, null, 1.4);
      effects.puff(b.x, floor + 0.14, b.z, 2.6, hit.dust || biomeDust(), 0.34);
      effects.puff(b.x, b.y, b.z, 2.4, wood, 0.4);
      // ...and the staff itself comes apart in its own wood (see `debrisCloud`), not as a shock.
      effects.debrisCloud(b.x, b.y, b.z, 0.7, wood);
      effects.puff(b.x + b.dx * 0.9, b.y + 0.3, b.z + b.dz * 0.9, 1.6, wood, 0.3);
      rig.shake = Math.max(rig.shake, 1.15);
      sfx.shatter();
    }
  } else {
    rig.yaw += dt * 0.14;
    rig.pitch = 0.2 + Math.sin(performance.now() * 0.0004) * 0.06;
  }

  const spd = Math.hypot(player.vel.x, player.vel.z);
  // ---- the slide's spray and the dive's wind ----------------------------------------------
  // The two moves whose speed is shown by VFX rather than by a pose cycle (see `poseSlide` /
  // `poseDive`). Both run EVERY FRAME from here (the rate limiting lives in effects.js) because
  // both feed a continuous trail as well as their particles: the slide burns a skid into the
  // deck, the dive drags a tube of disturbed air, and a trail has to be fed where the body is,
  // not where it was a twentieth of a second ago.
  //
  // `running`: a pause freezes the simulation but not the render, and a dive frozen mid-air with
  // its wind still streaming would read as the game having lost its place.
  // ---- THE SWING MESH (see `Effects.staffSwing`) ------------------------------------------
  // Fed from the SHAFT, every frame the STRIKE is running: the strip is the band the stick's two
  // ends are actually covering, and `power` is the tip's own speed normalised against the fastest
  // the flurry ever throws it — so the mesh is only there when the staff is genuinely moving, and
  // it brightens through the three beats rather than sitting at one value for the whole 0.8 s.
  //
  // The gate is `poleatk` and not the CARRY, because a carried staff is exactly the thing the mesh
  // must NOT draw: the flurry is one whole revolution of the rig with the shaft rolling on its own
  // axis (see `poleHoldStrike`), which is the fastest the wood is ever moved in the game, while a
  // man running with a staff on his shoulder is moving it at walking pace. `_poleTipP` is reset on
  // every frame the gate is shut, so the first frame of a flurry reads its own speed from zero
  // instead of from wherever the stick happened to be.
  if (running && player.state === "poleatk") {
    const A = player.poleShaftA;
    const B = player.poleShaftB;
    if (!_poleTipP) {
      _poleTipP = new THREE.Vector3();
      _poleTipV = 0;
    }
    const v = Math.hypot(B.x - _poleTipP.x, B.y - _poleTipP.y, B.z - _poleTipP.z) / Math.max(1e-4, dt);
    _poleTipV += (v - _poleTipV) * Math.min(1, dt * 14);
    _poleTipP.set(B.x, B.y, B.z);
    const p = (_poleTipV - 7) / 70;
    if (p > 0.02) {
      effects.staffSwing(A.x, A.y, A.z, B.x, B.y, B.z, Math.min(1, p));
      effects.poleActive = true;
    }
  } else if (_poleTipP) {
    _poleTipP = null;
    _poleTipV = 0;
  }

  if (running && player.state === "slide" && spd > 3) {
    const p = Math.min(1, spd / SLIDE_SPRAY_FULL);
    // The skid and the spray come off the DECK, so they are drawn in the deck's colour — the
    // surface the body is grinding (see `surfaceColorAt`), not the biome's fog dust.
    effects.slideWake(dt, player.pos.x, player.pos.y - P.HY, player.pos.z, player.vel.x / spd, player.vel.z / spd, p, surfaceColorAt(player.pos.x, player.pos.y - P.HY, player.pos.z, true));
  }
  // ...AND THE CLIMB SKIP'S OWN TRAIL (session 177): for as long as a skip is firing, the face keeps
  // shedding where the limbs were torn off it — drawn in the WALL's own colour (`surfaceColorAt`'s
  // `floor = false` read) because the whole move is about that face, and fed on a timer so a
  // half-second flight is a dozen small puffs instead of sixty. The release's own burst is the
  // `climbskip` drain further down (see the event block); this is the streak behind it.
  climbWakeT -= dt;
  if (running && player.climbFireT > 0 && player.wall && climbWakeT <= 0) {
    climbWakeT = 0.045;
    const w = player.wall;
    const gx = player.pos.x - w.nx * 0.26;
    const gz = player.pos.z - w.nz * 0.26;
    const col = surfaceColorAt(gx, player.pos.y, gz, false);
    effects.puff(gx, player.pos.y - P.HY + 0.6, gz, 0.55 + 0.5 * player.climbCharge, col, 0.22);
  }
  // ...AND THE CLIMB'S OWN GRIT (session 181 — the user's *\"add vfx for climbing\"*; CUT BACK in
  // session 199 — the same user's *\"the vfx for the climb it too much\"*). The climb used to be the
  // one move in the game that moved a body across a surface in total silence AND total stillness:
  // the skip had a trail (above) and the grab threw a puff (the `wallgrab` event), but everything
  // between them — the whole of the actual climbing — drew nothing at all. That is what the effect
  // is for, and it is written in the face's own colour (`surfaceColorAt(..., false)` — the stone he
  // is on, not the biome's fog dust).
  //
  // WHAT SESSION 199 TOOK OUT, because "too much" was the right call: a SECOND, wider puff on every
  // beat, a chalk ring on the plate under every other HAND contact (`wallGrit`), and a thin trickle
  // of dust falling down the face every 0.085 s. At a momentum climb the beat sounds four times a
  // cycle, i.e. every ~0.11 s, so the wall was wearing roughly two puffs, half a ring and twelve
  // trickle-puffs a second — a pale fog that hid the very animation it was meant to point at. What
  // is left is ONE small, faint pop per HAND contact (feet knock almost nothing loose, and the hand
  // is the beat the eye and the ear are already on: see the `at >= 2` test below), and nothing
  // between the beats.
  //
  // The BEAT is the clip's own, not a timer: `player.climbBeat` is the quarter-cycle contact count
  // `solveWallPose` already reads off the phase for the tick sound (`P.CLIMB_BEATS` — two hands and
  // two feet a cycle), so the grit comes off the stone on the exact frame the animation re-grips,
  // and at whatever tempo the body is actually climbing. The contact it is thrown FROM is then read
  // off the rig rather than assumed — the nearest of the four extremities to the plate is the one
  // that just planted (`divePartPoints` is exactly those four points, already in the world) — which
  // is what makes the two hands and the two feet take turns on their own instead of the effect
  // picking a limb and being wrong half the time.
  //
  // It stands down for the same three things the tick does (a hang, the load, the flight), so the
  // parked body is as still as the pose is and the skip's own burst is not doubled by grit that
  // would be fired from a limb already off the stone.
  if (running && player.climbing && player.attachMode === "climb" && player.wall) {
    const w = player.wall;
    const working = player.climbRest < 0.5 && player.climbLoad < 0.02 && player.climbFireT <= 0;
    const beat = player.climbBeat;
    if (beat !== climbVfxBeat) {
      // The first frame of a climb only ARMS the beat — the grab's own puff is the `wallgrab` event's.
      const armed = climbVfxBeat >= 0;
      climbVfxBeat = beat;
      if (armed && working) {
        const pts = divePartPoints();
        if (pts) {
          let at = -1;
          let near = Infinity;
          for (let i = 0; i < pts.length; i++) {
            const d = pts[i].x * w.nx + pts[i].z * w.nz;
            if (d < near) {
              near = d;
              at = i;
            }
          }
          // ...and ONLY A HAND's contact throws anything (session 199 — `TRAIL_PARTS` puts the two
          // hands last, so the index is the test). A foot re-setting on a wall knocks almost nothing
          // loose, and the beat sounds four times a cycle: at a momentum climb the old effect put two
          // puffs and a chalk ring into the air every ~0.11 s, which is the *"too much"* the user
          // called it. A hand is also the beat the eye is already on, because it is the beat the tick
          // sounds on.
          if (at >= 2) {
            const q = pts[at];
            const col = surfaceColorAt(q.x - w.nx * 0.06, q.y, q.z - w.nz * 0.06, false);
            // ...and the FACE'S OWN COLOUR is lifted before it is drawn, the same bargain `wallGrit`
            // makes with its ring and its spray: a wall's colour is often nearly black (this one is),
            // and grit drawn in the raw sample is grit nobody can see. Half the sample plus a flat
            // pale floor keeps the stone's hue while guaranteeing the puff reads against it.
            const g = [col[0] * 0.5 + 0.46, col[1] * 0.5 + 0.45, col[2] * 0.5 + 0.42];
            // ONE small pop, right on the grip. It used to be two — a second, wider one just off the
            // hand — and with the ring and the trickle on top of it the climb wore a fog of pale dust
            // that hid the animation the effect exists to point at. Small and faint is the whole of
            // the note: this is a contact, not an event.
            effects.puff(q.x + w.nx * 0.04, q.y, q.z + w.nz * 0.04, 0.34, g, 0.18);
          }
        }
      }
    }
  } else {
    climbVfxBeat = -1;
  }
  // ...and THE WALL CLINCH's flurry, fed through the accelerating tail: a small hot smear jittering
  // over the gut, more of it the further into the blur the beats are (see `player.wallBeatBlur`).
  // The last three or four knees are the ones the user asked to read as a blur rather than as hits,
  // and this is what buys it — the impacts alone get faster, but a trail is what makes the eye stop
  // being able to separate them.
  //
  // It is fed on a TIMER rather than every frame (see `wallSmearT`), and the smear is drawn small
  // and faint: the first cut spawned a full-size puff a frame and the pair disappeared behind a
  // pale fog for the whole of the tail, which is the opposite of what a "blur" is for. The rate
  // scales with the blur, so the trail thickens as the beats shorten — which is the acceleration
  // drawn as density rather than as speed.
  //
  // Since the beats DOUBLE (session 115 — the tail is six beats at the 0.042 s floor, 24 Hz) this
  // trail is the flurry's primary read rather than its garnish: an individual knee at the floor is
  // under three frames of screen time, so the beats are drawn small on purpose (see the `vis` dial
  // in the `wallbknee` block) and the eye is given the smear instead. The rate is tied to the
  // floor's own order of magnitude — 0.042 down to 0.022 s — so by the last beats there are about
  // two smears per knee, which is what turns discrete strikes into one continuous arc.
  wallSmearT -= dt;
  if (running && player.state === "wallbeat" && player.wallBeatPhase === 3 && player.wallBeatBlur > 0.25 && wallSmearT <= 0) {
    const hb = player.wallBeatHead;
    const wb = player.wallBeatWall;
    if (hb && wb) {
      wallSmearT = 0.042 - 0.02 * player.wallBeatBlur;
      const j = (Math.random() - 0.5) * 0.30;
      effects.puff(
        hb.x + wb.nx * 0.30 + wb.nz * j,
        hb.y - 0.30 + (Math.random() - 0.5) * 0.24,
        hb.z + wb.nz * 0.30 - wb.nx * j,
        0.52 + player.wallBeatBlur * 0.34, [1.0, 0.94, 0.82], 0.11
      );
    }
  }
  // ...and THE MOVE CAMERA for it (see `setMovePull` in camera.js): the shot is taken IN for the whole
  // clinch and thrown OUT on the release. That is the MOVE's framing rather than its impacts' — the
  // per-beat `pull` above is a hammer, and ten of them cannot hold a shot — and it is what makes a
  // clinch that happens at arm's length from the chase camera read at all. The take eases it in while
  // the pair is being placed, the flurry sits on it and deepens a touch with the blur, and the throw
  // opens the frame up so the flight away has room.
  if (running && player.state === "wallbeat") {
    const ph = player.wallBeatPhase;
    const pu = player.wallBeatPu;
    const want = ph === 0
      ? -3.0 * pu
      : ph === 4
        ? -3.4 + 4.4 * pu
        : ph === 5
          ? 1.0 * (1 - pu)
          : -3.2 - 0.5 * player.wallBeatBlur;
    rig.setMovePull(want);
    // ...and its SWING (see `setMoveOrbit` in camera.js), which is the half of the framing that
    // matters most: the clinch happens BETWEEN the player and the wall he is holding the body
    // against, so from the chase camera's own line the player's back is the whole picture and the
    // move is invisible. The shot turns onto the pair's FLANK for the move's length — both bodies
    // side by side down the wall, the skull going into the stone, the knee coming up into the gut
    // and finally the throw, all in profile — and turns back as the move lets go. Eased in on the
    // take with the pull, held flat through the beats, and unwound over the recover so the camera is
    // square again before the player has control back.
    const ramp = ph === 0 ? Math.min(1, pu * 1.25) : ph === 5 ? 1 - pu : 1;
    rig.setMoveOrbit(WB_ORBIT * ramp);
    // ...and the rest of the frame (see `setMoveAnchor` / `setMoveRise` in camera.js): the shot is
    // centred a little PAST the player, on the body being worked against the stone, and the eye is
    // lifted off that line so the picture looks slightly down on the pair. Without both of those the
    // flank turn frames the player's shoulder with the victim somewhere behind it — the aim is what
    // puts the two of them in the same shot.
    const wbw = player.wallBeatWall;
    const nx = wbw ? wbw.nx : 0;
    const nz = wbw ? wbw.nz : 0;
    rig.setMoveAnchor(-nx * WB_AIM * ramp, 0, -nz * WB_AIM * ramp);
    rig.setMoveRise(WB_RISE * ramp);
  } else {
    rig.setMovePull(0);
    rig.setMoveOrbit(0);
    rig.setMoveAnchor(0, 0, 0);
    rig.setMoveRise(0);
  }
  // ...and THE CLASH's own framing (see `setMoveOrbit`). Two bodies shoving face to face is the one
  // fight in the game that happens entirely ALONG the line from the player to somebody else, and from
  // the chase camera's own line the player's back is the whole picture — the contact, the sparks and
  // the whole of the clash's VFX all sit behind his own shoulders. The shot swings onto the pair's
  // FLANK for the lock, is walked a little PAST the player onto the contact and pushed IN, so the two
  // of them fill the frame while it lasts; it comes back square on its own on the frame the lock
  // breaks, because the wall clinch's own `else` above zeroes the whole move frame whenever the
  // player's state is not that move — and a clash is not a wallbeat, so nothing here has to unwind
  // it. Ramped in fast (a clash starts on a press and has to be framed by the time the sparks are).
  if (running && player.state === "clash" && player.clash) {
    const c = player.clash;
    // Fast — a tenth of a second — so the shot is ON the flank by the time the meeting's star is
    // still burning (the burst's own durations were widened to match; see `clashMeet`).
    const ramp = Math.min(1, c.t * 10);
    rig.setMoveOrbit(CLASH_ORBIT * ramp);
    rig.setMovePull(CLASH_PULL * ramp);
    rig.setMoveAnchor(c.ux * CLASH_AIM * ramp, 0, c.uz * CLASH_AIM * ramp);
    rig.setMoveRise(CLASH_RISE * ramp);
  }
  // ...and the grit the squeeze scrapes off the walls it is threading. The slide's own VFX is off
  // the DECK; a gap has two more surfaces, and being pinched between them is the one thing about a
  // slide that is not visible from behind the body.
  // ---- THE M1 CLASH's own grind (see `updateClash` in player/combat.js) ----
  // The lock is the one beat in the fight that lasts SECONDS, and after its opening burst it used to
  // draw nothing at all: the two of them stood in a silent stalemate with a bar up in the corner, and
  // a mash looked exactly like standing still. This is that gap filled — a continuous grind at the
  // contact, and a burst on every PRESS (the player's and the body's alike), so the shoving match is
  // something you can SEE being won.
  if (running && player.clash) {
    const c = player.clash;
    // A NEW lock re-arms the tallies: a fresh clash must not open with a phantom shove carried over
    // from the last one's counter (both `spam` and `ePush` start from zero on the object).
    if (c !== clashRef) {
      clashRef = c;
      clashSpamPrev = c.spam;
      clashEPrev = Math.round(c.ePush / P.CLASH_PRESS);
    }
    clashContact(_clashPt);
    const cw = Math.min(1, Math.max(c.push, c.ePush) / P.CLASH_WIN);
    effects.clashGrind(dt, _clashPt.x, _clashPt.y, _clashPt.z, c.ux, c.uz, cw, c.push - c.ePush);
    // The player's shove: it travels from him into the body, so its sparks come off the contact
    // toward the enemy. `c.spam` is the tally of his own presses (see `updateClash`), which is the
    // one read that cannot miss one.
    if (c.spam !== clashSpamPrev) {
      clashSpamPrev = c.spam;
      effects.clashPress(_clashPt.x, _clashPt.y, _clashPt.z, c.ux, c.uz, 0.55 + 0.45 * cw, 1);
      rig.shake = Math.max(rig.shake, 0.16 + 0.14 * cw);
      rig.rollKick((Math.random() - 0.5) * 0.03);
      // ...and the LENS takes each shove as the blink of a punch (a fast decay, so every press is its
      // own flash and never a held wash): the shoving match is a rhythm, and the screen is what makes
      // the rhythm land in the hands rather than only in the picture.
      post.flash(0.05 + 0.05 * cw, [1.0, 0.94, 0.72], 9);
    }
    // ...and the body's, which is its own rate rather than a keypress, so it is counted off the
    // meter it fills.
    const ePress = Math.round(c.ePush / P.CLASH_PRESS);
    if (ePress !== clashEPrev) {
      clashEPrev = ePress;
      effects.clashPress(_clashPt.x, _clashPt.y, _clashPt.z, c.ux, c.uz, 0.5 + 0.45 * cw, -1);
      rig.shake = Math.max(rig.shake, 0.12 + 0.12 * cw);
      post.flash(0.04 + 0.04 * cw, [0.80, 0.90, 1.10], 9);
    }
  } else {
    clashRef = null;
  }
  if (running) squeezeDust(dt);
  // The overdrive's own trail (see `player.overdrive`): sparks thrown off the body for the whole
  // window, on a timer rather than every frame — it is the only thing that says the ultimate is
  // still running while you are standing still, since the ring on the dial is up in the corner.
  if (running && player.overT > 0) {
    overTrailT -= dt;
    if (overTrailT <= 0) {
      overTrailT = 0.09;
      const a = Math.random() * Math.PI * 2;
      const rr = P.HY * (0.5 + Math.random() * 0.7);
      effects.heatPuff(player.pos.x + Math.cos(a) * rr, player.pos.y + (Math.random() * 2 - 0.6) * P.HY, player.pos.z + Math.sin(a) * rr, 0.5, [0.55, 0.95, 1.15]);
    }
  } else {
    overTrailT = 0;
  }
  const vlen = Math.hypot(player.vel.x, player.vel.y, player.vel.z);
  if (running && vlen > 2 && (player.state === "dive" || player.state === "launch" || player.skyfall)) {
    // The launch's flight is long and ballistic, so it gets the dive's own wind — aimed up the
    // launch line, which is the one thing that makes a body going straight up read as *moving* —
    // and it is drawn off the SAME limb points the dive uses (see `divePartPoints`). The pad's
    // flight used to keep the single body-centred wake, which left the fastest move in the game
    // as the one with no trails on it at all.
    // A skyfall rides the same wind, aimed down the fall line: it is the LONGEST of the three
    // (a fall off a building lasts for seconds), so it is the one that most needs the air to read
    // as movement rather than as a body standing still in the sky.
    const vmax = player.state === "dive" ? P.DIVE_MAX : player.plunge ? P.PLUNGE_V : player.skyfall ? P.SKYFALL_V : 70;
    effects.diveWake(dt, player.pos.x, player.pos.y, player.pos.z, player.vel.x / vlen, player.vel.y / vlen, player.vel.z / vlen, Math.min(1, vlen / vmax), null, divePartPoints());
  }
  // ...and the GROUND SLAM's, which is the same wake in FIRE (see `SLAM_FIRE`). It is fed from the
  // same five limb points, so the trail comes off the fists and the shoes rather than off the body's
  // spine — and the fists are the whole point of the shape.
  if (running && player.state === "slam" && vlen > 6) {
    const p = Math.min(1, vlen / P.SLAM_MAX_V);
    effects.diveWake(dt, player.pos.x, player.pos.y, player.pos.z, player.vel.x / vlen, player.vel.y / vlen, player.vel.z / vlen, p, SLAM_FIRE, divePartPoints());
    // ...and the embers: the wake is where the body HAS been, this is the body BURNING (see
    // `effects.slamWake`). It is fed from the body's own centre rather than from the limb points,
    // because the flames belong to the whole of him — and it is fed every frame like the wake is,
    // with the rate limiting inside the effect.
    effects.slamWake(dt, player.pos.x, player.pos.y, player.pos.z, p);
  }
  // ...and the WHIRL's own energy (the user's *"blue energy effects around the fists/arms"*, and
  // *"blue energy effects are strongest during the spin and slam"*): fed off the two HANDS, so the
  // aura sits on the arm doing the holding rather than on the body, at the intensity the move's own
  // phase asks for (`player.whirlEnergy`). It runs for the WHOLE move including the whiff — a miss
  // still throws the energy out, it just never gets to the slam — and it is fed every frame like
  // the other wakes, with the rate limiting inside the effect.
  if (running && player.state === "whirl") {
    const pow = player.whirlEnergy();
    if (pow > 0.02) {
      const wpts = divePartPoints();
      if (wpts && wpts.length >= 5) {
        effects.whirlAura(dt, wpts[3].x, wpts[3].y, wpts[3].z, pow);
        effects.whirlAura(dt, wpts[4].x, wpts[4].y, wpts[4].z, pow);
      }
    }
  }
  // ...and the RING OF STARS over a DAZED body's head (the user's *"when he stands on his feet he
  // does a cartoony dizzy animtion and a ring of starts spin over his head"* — see
  // `effects.dizzyStars` and `Enemy.dizzy`). It is fed from the body's own HEAD bone every frame it
  // is reeling, ramping in as the reel starts and out before the state ends, so the stars arrive
  // with the wobble and leave with it rather than blinking off.
  if (enemies.spawned) {
    for (const e of enemies.list) {
      if (!e.built || e.state !== "dizzy") continue;
      const dur = Math.max(0.2, e.hurtDur || E.DIZZY_T);
      const p = Math.min(1, e.hurtT / 0.25) * Math.min(1, Math.max(0, (dur - e.hurtT) / 0.6));
      if (p <= 0.01) continue;
      const hp = e.headPoint(_dizzyV);
      effects.dizzyStars(dt, hp.x, hp.y + 0.24, hp.z, p);
    }
  }
  world.update(player.pos.x, player.pos.z, running ? 6 : 2);
  // ...and the hills' grass, which streams its tiles off the same body position and costs nothing
  // at all in the other two worlds (it is switched off there — see `applyWorldTraits`).
  grass.update(dt, player.pos.x, player.pos.y - P.HY, player.pos.z);
  destruction.update(dt);
  drainDestruction();
  effects.update(dt, camera);
  // The camera is bolted to the body, so its spring runs on the body's clock too: it tracks a man
  // who is moving at full speed, and a follow that smoothed itself on the slowed step would fall
  // behind him for the length of every combo.
  rig.follow(pdt, spd);
  // ...and the pocket editor's cinematic swirl rides on top of the chase camera.
  gear.applyCamera(camera, dt);
  showcaseCamera(dt);
  sky.position.copy(camera.position);

  const groundY = world.topBelow(player.pos.x, player.pos.z, player.pos.y - P.HY + 0.08, 70);
  const h = Math.max(0, player.pos.y - P.HY - groundY);
  shadow.visible = h < 22;
  shadow.position.set(player.pos.x, groundY + 0.02, player.pos.z);
  // The contact shadow is the body's footprint, so it scales with the character. The fade
  // numbers above are about how high you are off the ground — world units, not body units.
  const s = Math.max(0.45, 2.1 - h * 0.085) * P.CHAR_SCALE;
  shadow.scale.set(s, 1, s);
  shadow.material.uniforms.uOpacity.value = 0.5 * Math.max(0.05, 1 - h / 18);

  // ...and THE CHARGE METER (session 177 — see climbar.js): the wall pull's charge, drawn in the
  // world beside the body. Its colour is the FACE'S own — and it is read straight off the collider he
  // is ON (`player.wall.c.c`, the very value `buildBoxGeometry` paints that box's vertices with — see
  // `pickWall`), rather than probed with `surfaceColorAt`. The probe was the first cut and it read the
  // biome's MEADOW GREEN: `gap` is the stand-off of the body's SURFACE from the plate, so the sample
  // taken at `gap + 0.14` still lands in the air outside the stone (measured: pos sits 0.76 from the
  // face while `gap` reads 0.194, and the probe only found the wall once it was pushed 0.50 out, past
  // the body's own radius). Reading the collider needs no distance to guess right, costs nothing, and
  // is exactly "the colour of the thing he is climb-jumping from".
  if (player.climbing && player.attachMode === "climb" && player.wall) {
    const w = player.wall;
    const face = w.c && w.c.c;
    if (face) {
      climbMeter.update(player, camera, face);
    } else {
      // A collider with no painted colour at all: fall back to the probe, pushed far enough out to
      // clear the body's own radius (the same 0.50 the measurement above needed).
      const back = Math.max(0, w.gap || 0) + 0.50;
      climbMeter.update(player, camera,
        surfaceColorAt(player.pos.x - w.nx * back, player.pos.y, player.pos.z - w.nz * back, false));
    }
  } else {
    climbMeter.update(player, camera, null);
  }
  // ...and THE SHOT's, on the same bar and the same side of him (session 198). Its own weight is the
  // whole visibility rule (`player.ballShow` — the wind-up and the swing after it, see `publishCarry`
  // in inventory.js), and the charge it reads is FROZEN by the release, so what the player watches
  // through the strike is what the shot was worth rather than a bar draining.
  shotMeter.update(player, camera, BALL_METER_RGB,
    { show: player.ballShow, charge: player.ballCharge, lift: BALL_METER_LIFT });

  const b = currentBiome();
  skySys.update(dt, b);
  skySys.apply(sky, shared);
  shared.uFogMix.value = Math.max(settings.fog > 0 ? 1 : 0, skySys.haze);

  hud.setSpeed(spd);
  hud.setGrip(player.grip / P.GRIP_MAX);
  // ...and the STAFF's durability (see `HUD.setPole`): the gauge exists only while the wood is in his
  // hands, so `null` — the "no staff" case — is what stands it down the frame a throw or a break or a
  // respawn takes it out of them, and a run without a staff never shows it at all.
  hud.setPole(player.holdingPole() ? player.poleHp : null, P.POLE_HP);
  hud.setPos(player.pos.x, player.pos.z);
  hud.setBiome(biomeLabel(b));
  hud.setDist(spawnDist.v);
  hud.setBest(player.bestSpeed);
  hud.setChain(player.chain);
  hud.setJumps(player.jumpsLeft, player.grounded);
  // THE M1 CLASH's race bar: the two meters are live on `player.clash` and the bar stands down the
  // frame the lock ends (see `setClash`).
  hud.setClash(player.clash ? player.clash.push : null, player.clash ? player.clash.ePush : null);
  // ...and the dial: health, the ultimate, the three skill cooldowns and the style rank, in one
  // readout (see `setDial` in hud.js and abilities.js).
  hud.setDial(abilities.hud());
  hud.setMouseFree(input.mouseFree && running);
  hud.setSky(skySys.label(), skySys.clockText(), skySys.mood);
  hud.setStateText(stateText());
  // ...and the world prompt's own words, re-cut for the pads that carry the keys it names (touch
  // only — see `touchPromptText`). It has to be written HERE rather than at the bind, because
  // `gear.update` (above, with the rest of the world) rebuilds the prompt from scratch every frame
  // it is up, so this is the pass that gets the last word.
  if (touchUIOn() && interactPromptEl && !interactPromptEl.classList.contains("hidden")) {
    const want = touchPromptText(interactPromptEl.textContent);
    if (want !== interactPromptEl.textContent) interactPromptEl.textContent = want;
  }
  // (the action HINT BAR used to be written here — `hud.setHint(hintText())`. Removed at the user's
  // request; the strings are still on `GAME.hintText`. See "The hint bar was REMOVED" in README.md.)
  // The HUD's accent, taken from the world the player is standing in. After the chunk streamer
  // has run for this frame, so the blocks around the player are the ones being sampled.
  adaptUI.update(dt, world, skySys, player.pos.x, player.pos.y, player.pos.z);
  // Sub-second station labels (the last word of the frame): the camera has finished moving, so the
  // projected positions are the ones this frame renders with. They stand down for the menus and for
  // the pocket editor, which has the whole screen and its own labels.
  signs.enabled = running && !optionsOpen && !gear.editorOpen;
  signs.update();
  // The melee counter stands down on its own clock (see the hit block above).
  if (comboT > 0) {
    comboT -= dt;
    if (comboT <= 0) {
      comboCount = 0;
      hud.setCombo(0, "");
    }
  }
  // ...and so does the deck's tag (see the `trickland` block above).
  if (trickT > 0) {
    trickT -= dt;
    if (trickT <= 0) hud.setTrick("");
  }
  const riding = !!player.board;
  if (tricksRiding && !riding) {
    tricks.fullReset();
    trickText3D.bail();
  }
  tricksRiding = riding;
  if (riding && player.grounded && Math.hypot(player.vel.x, player.vel.z) < STILL_V) {
    tricks.stillT = (tricks.stillT || 0) + dt;
    if (tricks.stillT > STILL_T) tricks.fullReset();
  } else {
    tricks.stillT = 0;
  }
  tricks.tick(dt, player, camera);
  const chainFrac = tricks.chainT > 0 ? tricks.chainT / CHAIN_T : 0;
  const multColor = tricks.mult > 1 && tricks.lastName && TRICK_COLORS[tricks.lastName] ? TRICK_COLORS[tricks.lastName].c1 : null;
  hud.setBoardScore(tricks.shown, riding, tricks.mult, chainFrac, multColor);
  trickText3D.update(dt, player, camera);
}

// ---------------------------------------------------------------------------
// THE SCREEN (see the post pass in ps1.js)
//
// There is no screen-effects layer any more: the post pass draws the frame as the scene rendered
// it, through the dither/quantise (see "How the PS1 look is produced"). The vignette, the radial
// blur, the radial colour split and the impact flash were REMOVED at the user's request. The
// camera shake (`rig.shake`) and every world-space impact FX are untouched — only the picture-
// wide effects went.

function stateText() {
  if (player.kickT > 0) return "WALL KICK";
  // THE WALL CLINCH says which beat it is on, because the move is a performance the player is meant
  // to watch rather than one they are steering (see "THE WALL CLINCH" in src/README.md).
  if (player.state === "wallbeat") {
    return player.wallBeatPhase === 0 ? "WALL CLINCH"
      : player.wallBeatPhase === 1 ? "WALL CLINCH — SMASH"
      : player.wallBeatPhase === 2 ? "WALL CLINCH — HOLD"
      : player.wallBeatPhase === 3 ? "WALL CLINCH — KNEE"
      : player.wallBeatPhase === 4 ? "WALL CLINCH — THROW" : "WALL CLINCH";
  }
  // The three skills' own moves say their name while they run (they are the only states in the game
  // that are answered by another PRESS mid-move — the whirl's cancel and the scissor's counter —
  // so the readout is how the player knows which one they are in).
  if (player.state === "knee") return "FLYING KNEE";
  // ...and the staff's three moves say which one they are, because they are aimed by hand rather
  // than steered (see the `POLE_*` block): a player mid-flurry wants to know whether the next press
  // of M1 is another beat or whether the wood has run out. The CARRY says nothing at all — it is not
  // a state, and the staff is drawn in his hands for the readout's job to be done for it.
  if (player.state === "poleatk") return player.poleWillBreak ? "THE STAFF — LAST OF IT" : "THE STAFF";
  if (player.state === "polethr") return "THE THROW";
  if (player.state === "polevlt") return "THE VAULT — FRONT FLIP INTO THE DECK";
  if (player.state === "grab") {
    if (player.grabMiss) return "GRAB — MISS";
    return player.grabKind === 1 ? "GRAB — THE SET-UP"
      : player.grabKind === 2 ? "GRAB — THE SLAM" : "GRAB — THE HEAVE";
  }
  if (player.state === "whirl") return "WHIRL";
  if (player.state === "lunge") {
    // The four beats say which one they are, and the last two say WHO is in it: the clinch roll is
    // the only beat of the move that has somebody in its arms, and the difference between it and
    // the miss roll is the whole point of the button.
    // ...and a FREE FALL's landing wears the miss roll too (session 194 — see `startFreeRoll`), so
    // the flag is what says which of the two the body is in before the phase does.
    if (player.freeRoll) return "LANDING ROLL";
    if (player.lungePhase === 0) return "LUNGE";
    if (player.lungePhase === 1) return "LUNGE — MISS";
    if (player.lungePhase === 2) return "LUNGE — THE TACKLE";
    return "LUNGE — SPREAD";
  }
  if (player.state === "block") {
    if (player.guardCharging) return "BLOCK — CHARGING";
    return player.guardLatch ? "BLOCK — LATCHED" : "BLOCK";
  }
  if (player.state === "scissor") return player.scissorMiss ? "HEAD SCISSOR — MISS" : "HEAD SCISSOR";
  if (player.state === "capo") return "LAUNCH";
  if (player.state === "ledge") return "LEDGE GRAB";
  if (player.state === "vault") return "VAULT";
  if (player.state === "mantle") return "MANTLE";
  if (player.wallRunning) return "WALL RUN";
  if (player.climbing) return "WALL CLIMB";
  if (player.state === "slam") return "GROUND SLAM";
  // The chain's finisher has two other shapes and each says its own name (see "The DOWN SLAM" and
  // "THE UPPERCUT" in player.js): the 4th M1 with the feet up is the flip-into-a-stomp, and the 4th
  // M1 with SPACE held on the deck is the leg sweep into a right knee.
  if (player.state === "attack" && player.attackUpper) return "UPPERCUT";
  if (player.state === "attack" && player.attackSlam) return "DOWN SLAM";
  if (player.state === "smash") return "HAMMER";
  if (player.state === "dash") {
    return player.dashKind === 1 ? "SIDE DASH" : player.dashKind === 2 ? "BACK DASH" : "DASH";
  }
  if (player.state === "dive") return "DIVE";
  // ...and its held cousin, which is the same dive aimed down the fall line (see the `plunge`
  // block in player.js): it says its own name because it is the one thing a free fall can DO, and
  // the read-out is where a player learns what their M1 became up there.
  if (player.plunge) return "PLUNGE";
  // A skyfall says WHICH shape it is wearing rather than just "falling": the shape was picked for
  // this fall out of the six cruises (see `pickFallKind`) — or is the M1 plunge, which is the seventh
  // and is never rolled — and the name is the only place that is ever said.
  if (player.skyfall) {
    const ud = player.charMesh && player.charMesh.userData;
    const shape = ud && ud.fallKindName ? ud.fallKindName(player.fallKind) : "";
    // ...and the two commit moves are the fall's now (see "The skyfall" in README.md): the hint names
    // them, because a free fall refusing everything but them is the sort of thing a player only learns
    // about by being told.
    const acts = " · F dive · X slam · hold M1 plunge";
    return (shape ? "SKYFALL — " + shape : "SKYFALL") + acts;
  }
  if (player.state === "slide") return "SLIDE";
  // The AIR COMBO says its own name rather than "AIRBORNE", because while it is open the world is
  // running slow and M1 is chaining off the deck (see "The dive launch") — the two things a player
  // needs to know about the state they are in, and neither of them is "you are in the air".
  if (player.airComboOpen) return "AIR COMBO";
  // THE DECK'S THREE MODES say their names (session 201 — see `player/board.js`), and they straddle
  // the air line rather than sitting on one side of it. THE BOMB is checked FIRST, above the air,
  // because a bomb is FLOWN: it opens on a leap and the road ends it (see `startBBomb`), so it is
  // airborne for the whole of its short life and below the `!grounded` line it would never be read at
  // all (measured: 14 frames, 0.23 s, and every one of them `grounded === false`). The other two are
  // grounded states and belong with the rest of the deck's read, under it.
  if (player.state === "bbomb") return "THE BOMB";
  if (!player.grounded) return player.wallSliding ? "WALL SLIDE" : "AIRBORNE";
  // ...and the two modes the deck wears with its wheels down: the ride and the powerslide. Neither is
  // anything the on-foot readout can say — a rider at 10 m/s was reading "SPRINT", which is what he
  // was doing BEFORE he got on, and a powerslide read the same.
  if (player.state === "bslide") return "POWERSLIDE";
  if (player.board) return "RIDE";
  const sp = Math.hypot(player.vel.x, player.vel.z);
  if (player.crouching) return "CROUCH";
  if (sp > P.SPRINT * 0.85) return "SPRINT";
  if (sp > 4) return "RUN";
  if (sp > 0.6) return "WALK";
  return "IDLE";
}

const KICK_HINT = "M1 (left click) — boot off the wall";

// How far a point is off the staff's line — `player.js`'s `shaftGap` again, in this file, so
// `GAME.pole()` can report it without that becoming an export. The hand hangs off its OWN bone now
// (`handL`/`handR` — see `WRIST_Y` / `poseWristTo` in streetwear.js), and the form SOLVES that bone
// onto the shaft, so the honest measurement is the palm's own point in the WRIST's frame
// (`handLocalW`); the older arm-frame pair is still the fallback for a rig built before the bone
// existed.
const _handW = new THREE.Vector3();
// The swing mesh's own bookkeeping (see the per-frame feed below `update`): the tip's last world
// point and its own smoothed speed, which is the power the mesh is drawn at.
let _poleTipP = null;
let _poleTipV = 0;
function poleHandGaps() {
  const ud = player.charMesh && player.charMesh.userData;
  if (!ud || !ud.bones || !ud.handLocal) return null;
  const A = player.poleShaftA;
  const B = player.poleShaftB;
  const out = {};
  for (const side of ["R", "L"]) {
    const w = ud.handLocalW ? ud.bones["hand" + side] : null;
    const bone = w || ud.bones["armLower" + side];
    if (!bone) continue;
    bone.localToWorld(_handW.copy(w ? ud.handLocalW[side] : ud.handLocal[side]));
    const ax = B.x - A.x, ay = B.y - A.y, az = B.z - A.z;
    const wx = _handW.x - A.x, wy = _handW.y - A.y, wz = _handW.z - A.z;
    const ll = ax * ax + ay * ay + az * az;
    let s = ll > 1e-8 ? (wx * ax + wy * ay + wz * az) / ll : 0;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    out[side] = +Math.hypot(wx - ax * s, wy - ay * s, wz - az * s).toFixed(3);
  }
  return out;
}
// The one-line read of whatever the player is doing — "wall run — SPACE leap off…", "DOWN SLAM —
// one flip…". It was the ACTION HINT BAR's text (a strip across the bottom of the screen, written
// every frame by `hud.setHint`), and the bar was REMOVED at the user's request: it appeared on
// almost every action and the player had long since learned the moves. The function is kept whole
// because it is the only written record of what each state's read is, it costs nothing now that
// nothing calls it, and it is still exposed as `GAME.hintText()` for debugging — putting the bar
// back is a div and a rule in index.html, a `setHint` in hud.js, and one call per frame where the
// old one was (see "The hint bar was REMOVED" in src/README.md).
function hintText() {
  if (!running) return "";
  if (player.state === "wallbeat") {
    return player.wallBeatPhase < 3
      ? "wall clinch — the skull into the wall, then the knees"
      : player.wallBeatPhase === 3
        ? "wall clinch — kneeing the gut, faster every beat"
        : "wall clinch — let go, and he takes the wall's worth of distance";
  }
  if (player.state === "launch") return "LAUNCH PAD — riding it up to the roof";
  if (player.state === "ledge") return "ledge grab — the hands caught the lip; hanging, then pulling up";
  if (player.state === "vault") return "vault — a jump-over or a front flip, and both are done by the wall";
  if (player.state === "mantle") return "mantling up — you came over the ledge";
  if (player.wallRunning) {
    // The kick's speed gate (`KICK_MIN_SPEED`, 18) is asked here rather than assumed: a run that
    // kept a slow entry speed is a run you cannot boot off, and the line must not say otherwise.
    const kick = player.kickCd <= 0 && player.kickCandidate ? " · M1 (left click) kick off" : "";
    return "wall run — SPACE leap off · A/D steer" + kick;
  }
  if (player.climbing) {
    return player.grip > 0.45
      ? "climbing — W/S up and down · A/D across · JUMP to leap off · run the stamina out and you slip"
      : "climbing — the STAMINA is nearly gone: you are about to slip off";
  }
  if (player.state === "smash") return "HAMMER — six of them, and no two the same · he rides the bounce into every one";
  // THE STAFF. There is no form to narrate any more (the brief threw the kata out whole), so the
  // read is the WEAPON rather than a beat table: which of the four things it can do is running, and
  // — the number a player actually plays around — HOW MUCH OF IT IS LEFT. That last one is the one
  // worth a line: a staff has `POLE_HP` strikes in it and the flurry that spends the last of them
  // SNAPS ON ITS OWN LAST CHOP (see `poleStrike` / `POLE_ATK_BREAK`), so the hit that breaks it is
  // a hit the player chose to throw.
  if (player.state === "poleatk") {
    if (player.poleWillBreak) return "STAFF — the last of the wood, and this flurry spends it";
    return "STAFF — the flurry is thrown forward; the wood has " + player.poleHp + " of " + P.POLE_HP + " strikes left";
  }
  if (player.state === "polethr") return "STAFF — the throw: it leaves the hand and it breaks where it lands";
  if (player.state === "polevlt") return "THE VAULT — a front flip with the staff driven into the deck; the strike throws him";
  if (player.holdingPole()) return "carrying the staff — M1 the flurry · M2 hurls it (and breaks it) · no wall slide · the double jump vaults off it";
  if (player.state === "knee") {
    if (player.kneePhase === 0) return "FLYING KNEE — the run-up: he is sprinting them down";
    if (player.kneeHit) return "FLYING KNEE — the knee went through his head";
    return "FLYING KNEE — the leap: solved onto the head, the knee is the contact";
  }
  if (player.state === "whirl") {
    if (!player.whirlTarget) return "WHIRL — nothing in the hand; the spin is his own";
    return player.whirlPhase().phase === 6
      ? "WHIRL — he has him by the throat and is dragging his head across the deck · M1 / any skill cancels and drops him"
      : "WHIRL — he has him by the throat: the spin runs out into the slam · M1 / any skill cancels and drops him";
  }
  if (player.state === "grab") {
    if (player.grabMiss) {
      return player.grabMissCatch
        ? "GRAB — MISS: he grabbed at nothing and the lead foot caught the over-balance"
        : "GRAB — MISS: both hands out, and there is nobody there";
    }
    if (player.grabKind === 1) {
      return player.grabReleased
        ? "GRAB — the set-up: he is on his feet, and the stars are going round"
        : "GRAB — the set-up: both hands under his shoulders, hauling him up off the deck";
    }
    if (player.grabKind === 2) {
      return player.grabReleased
        ? "GRAB — the slam: driven into the deck out of a front flip"
        : "GRAB — the slam: he has the leg out of the air and is going over";
    }
    return player.grabReleased
      ? "GRAB — the heave: thrown away"
      : "GRAB — the heave: both hands on the chest, and the body is coming off its feet";
  }
  if (player.state === "scissor") {
    if (player.blockT > 0) {
      return "HEAD SCISSOR — the guard is OPEN: a fist that lands in it is blocked and countered";
    }
    if (player.scissorMiss) {
      if (player.scissorMissPhase === 1) {
        return "HEAD SCISSOR — MISSED: nothing took the weight, and he is on his back with the wind out of him";
      }
      if (player.scissorMissPhase === 2) {
        return "HEAD SCISSOR — MISSED: up off the deck, and the move is over";
      }
      return player.scissorT > P.SCISSOR_GUARD_T + P.SCISSOR_LEAP_T
        ? "HEAD SCISSOR — MISSED: the legs snap shut on nothing, and he goes over into a front flip"
        : "HEAD SCISSOR — nothing in reach";
    }
    return "HEAD SCISSOR — the legs are on the neck";
  }
  if (player.state === "capo") {
    const cp = player.capoPhase();
    if (cp === 0) return "LAUNCH — CHARGING: he is coiling on the spot · the coil is the whole move";
    if (cp === 1) return "LAUNCH — the kick, and a hit takes him into the sky";
    if (cp === 3) return "LAUNCH — him on his feet, the body's face on them · M1 starts the air combo";
    return "LAUNCH — the hop comes down";
  }
  if (player.state === "lunge") {
    // One line per beat, and every one of them is the READ of that beat rather than a label: what
    // the button did, in the order the brief asks for it.
    // ...and the landing roll has no button behind it at all (session 194): it is a free fall's own
    // arrival, so it says so.
    if (player.freeRoll) return "LANDING ROLL — he came down out of the fall and went straight over into a roll · the thud is the deck taking the whole of the fall";
    if (player.lungePhase === 0) return "LUNGE — he threw himself at them; the paws are still off the deck";
    if (player.lungePhase === 1) return "LUNGE — MISS: nothing there, so he rolls out of it and comes up a third slower";
    if (player.lungePhase === 2) return "LUNGE — THE TACKLE: he has him and the two of them are going over · JUMP to spread and let go";
    return "LUNGE — the spread leap-off, and the body is his problem now";
  }
  if (player.state === "block") {
    const latch = player.guardLatch
      ? " · TOGGLED: it stays up without your hands — JUMP or press M1/M2 to let it go"
      : " · press both buttons twice to toggle it up hands-free";
    return player.guardCharging
      ? "BLOCK — the charge: one arm over the eyes and running the line down · it cannot corner, and it shoves aside whatever is on it" + latch
      : "BLOCK — the guard is up: it WALKS, and a fist that lands on it is turned away · hold forward to break into the charge" + latch;
  }
  if (player.state === "slam") return "SLAM — JUMP on impact to bounce out";
  if (player.state === "attack" && player.attackUpper) {
    return "UPPERCUT — a leg sweep for nothing, then the right knee up, and he goes with it";
  }
  if (player.state === "attack" && player.attackSlam) {
    return "DOWN SLAM — one flip, and the leg goes through whatever is under him";
  }
  if (player.wallSliding) {
    // ...and the same read here: a slide is a SLOW body by construction (the face has already
    // taken the speed the kick asks for), so the kick clause only shows when the gate is actually
    // open — the coyote window a fast arrival buys, or a slide still carrying along the face.
    const kick = player.kickCd <= 0 && player.kickCandidate ? " · M1 kick off" : "";
    return player.grip > 0.05
      ? "wall slide — push INTO the face to CLIMB it · tap SPACE to wall-jump" + kick
      : "wall slide — SPACE wall-jump · stamina empty" + kick;
  }
  if (player.chain >= 2 && !player.grounded) return "CHAIN x" + player.chain + " — jump the instant you land";
  if (player.state === "dash") {
    return player.dashKind === 0
      ? "DASH — the BOXCUTTER: a twisting backflip with a hook kick thrown out of it, and it stops its travel on whoever it lands on"
      : player.dashKind === 1
        ? "SIDE DASH — a step that keeps his eyes on the fight"
        : "BACK DASH — a twisting backflip into a sliding hero landing; steer it while it runs";
  }
  // The kick keeps the dive state, so this has to be tested before it. The flip variant also
  // outlives `kickT` (it spins on its own longer clock), so it counts here too — and the line
  // names the shape that actually landed, read off the rig's own table.
  if (player.kickT > 0 || player.kickSpinT > 0) {
    const ud = player.charMesh && player.charMesh.userData;
    const shape = ud && ud.kickVariantName ? ud.kickVariantName(player.kickVariant) : "";
    if (shape === "flip") return "kicked — and an entirely unnecessary backflip";
    if (shape === "plant") return "kicked — sole planted, shoved off the face";
    if (shape === "rising") return "kicked — boot driven up the wall";
    return "kicked — the boot lands and the view sweeps onto the new line";
  }
  if (player.state === "dive") {
    if (player.kickCd <= 0 && player.kickCandidate) return KICK_HINT;
    // ...and the dive's own read (see `diveContact`): what it arrives on decides between THREE
    // things — a launch, a plain body-check, and a body-check you could have avoided. The diamond
    // is the clock, `diveCandidate` is whether there is a body ALREADY UP on the dive's line (the
    // launch only takes an airborne body), and the third line is the one that teaches the rule.
    // ...and the kick clause rides the same gate as every other line here (`KICK_MIN_SPEED`): a
    // dive under it has no wall to offer, so saying "M1 kicks off a wall" would be a lie.
    const kick = player.kickCd <= 0 && player.kickCandidate ? " · M1 kicks off a wall" : "";
    if (player.airCd > 0) {
      return "diving — the diamond is still filling, so arriving on a body is only a body-check" + kick;
    }
    if (player.diveCandidate) {
      return "diving — that body is UP: land on him and he goes higher into an AIR COMBO" + kick;
    }
    return "diving — an air combo takes a body ALREADY IN THE AIR; on a standing body it is only a body-check" + kick;
  }
  // The air combo itself (see "The dive launch"): the one state in the game where the world runs
  // slow on purpose, so the hint has to name it — a player who does not know why everything went
  // slow will think something broke. It also says where the combo came from, because the two doors
  // into it (the capoeira's launch and the dive) are the two things a player is trying to learn.
  if (player.airComboOpen) {
    return player.airCd > 0
      ? "AIR COMBO (off the dive) — the whole world is running slow; M1 chains in the air"
      : "AIR COMBO (off the launch) — the whole world is running slow; M1 chains in the air";
  }
  // The fall is the one airborne move with nothing to press, so its hint is the way OUT of it —
  // and the way out is now the ONE thing the fall can answer: M1, held, which puts it into its
  // downward dive (see the `plunge` block in player.js). The slam and the dive that used to be
  // named here are both refused by a free fall now (the user's *"i cant grab or do skills or do
  // anything other than moving"*), so a hint that offered them would be a hint that lied.
  if (player.skyfall) {
    return player.plunge
      ? "plunge — hold M1 to stay in the dive, release to spread back out · it braces for the deck on its own"
      : "skyfall — hold M1 to plunge straight down · it braces for the deck on its own";
  }
  // THE DECK's own reads (session 201 — see `stateText`'s note, and `player/board.js`). Written as one
  // block because the board's keys are entirely its own: M1 is the next FLIP in the cycle rather than
  // the melee chain, SPACE is the OLLIE rather than the jump, M2 is a MANUAL rather than the grab, and
  // SHIFT and F are a powerslide and a bomb rather than the on-foot slide and dive. The BOMB is named
  // ABOVE the air line because a bomb is FLOWN for the whole of its short life (measured 0.23 s, and
  // `grounded === false` on every one of those frames) — below it, the one line that names the move
  // could never be reached at all.
  if (player.state === "bbomb") {
    return "THE BOMB — the deck is thrown at the road under a prone body · M1 flips out of it · SHIFT scrubs · it keeps most of its speed when the wheels find the road";
  }
  if (player.board) {
    if (player.state === "bslide") return "POWERSLIDE — hold SHIFT to scrub the wheels sideways · let go or slow down and the ride comes back";
    if (!player.grounded) return "on the deck, in the air — land SQUARE or the board leaves without you · M1 throws the next flip";
    if (player.boardManual > 0.3) return "MANUAL — hold M2 to keep the nose up · the tail is what you are balancing on";
    const bsp = Math.hypot(player.vel.x, player.vel.z);
    if (bsp > 0.6) return "riding — M1 the flips · SPACE the ollie · SHIFT powerslide · F bomb · M2 manual · E step off";
    return "on the deck — W to push off, or SPACE for a standing ollie · M2 manual · E step off";
  }
  if (!player.grounded) {
    // The kick is not the dive's private move, so the same prompt shows mid-jump.
    // It reads the same cached reach the move itself uses (a wall, or one a blink behind you),
    // so the prompt can never promise a kick the press would refuse.
    if (player.kickCd <= 0 && player.kickCandidate) return KICK_HINT;
    // ...and the chain's own second door: after the SWEEP, leaving the ground keeps the finisher's
    // place for a beat (see `P.COMBAT_AIR_FINISH`), and that window is the one moment M1 up here is
    // the DOWN SLAM rather than a wall kick. Named because nothing else could teach it — the press
    // looks exactly like every other airborne M1.
    if (player.airFinisherT > 0) return "M1 — the chain is still open: one flip, then the leg goes through him";
    if (player.wall) return "wall — push INTO it to CLIMB it · tap SPACE on it to wall-jump";
    // The dive launch is worth naming from OUT here too: an airborne body on your line is the one
    // window in the game that is open for a moment and then gone, and the read is already on the
    // player (see `diveCandidate`), so the prompt costs nothing.
    if (player.diveCandidate) {
      return "he is UP — F to dive-tackle him into an AIR COMBO" +
        (player.kickCd <= 0 && player.kickCandidate ? "  ·  M1 (left click) kicks off a wall" : "");
    }
    return player.jumpsLeft > 0 ? "SPACE double jump  ·  SHIFT or X ground slam" : "SHIFT or X ground slam  ·  F dive";
  }
  const sp = Math.hypot(player.vel.x, player.vel.z);
  // The pad introduces itself before you are on it: the move is the one thing in the game with
  // no input at all, so there is nothing else that could tell you it is there.
  if (player.grounded && player.launchCd <= 0 && world.nearPad(player.pos.x, player.pos.z, 7)) {
    return "JUMP PAD — step on the lit plate to ride it up to the roof";
  }
  if (player.crouching) {
    return touchUIOn()
      ? "crouched — release SLIDE to stand · move to crouch-walk (slow, precise)"
      : "crouched — SHIFT to stand · move to crouch-walk (slow, precise)";
  }
  // The squeeze introduces itself the one moment it is happening, because it is the only thing the
  // slide does that cannot be seen from behind the body: a slide threads a gap the body could not
  // have walked through, and the gap pays for it in speed.
  if (player.state === "slide" && player.squeeze > 0.2) {
    return "squeezing through — the gap feeds the slide, so momentum is building";
  }
  if (player.grounded && sp > 4) {
    return touchUIOn()
      ? "hold SLIDE to slide  ·  jump  ·  jump at a wall beside you to wall-run"
      : "hold SHIFT slide  ·  jump  ·  jump at a wall beside you to wall-run";
  }
  if (player.grounded && sp < 0.6) {
    return touchUIOn()
      ? "hold SLIDE to crouch · stick to move · jump at a wall beside you to wall-run"
      : "hold SHIFT to crouch · WASD to move · jump at a wall beside you to wall-run";
  }
  return "";
}

const last = { t: performance.now() };
// THE AIR COMBO'S BULLET TIME (see "The air combo's BULLET TIME" in README.md). While an air combo
// is open and the body is actually up in it, the WORLD around the player runs slow: `slowmo` ramps
// between 1 and `P.AIR_SLOWMO`, and it is the step the world is integrated on. It is deliberately
// the SAME trick as the hitstop a few lines down — one smaller number, and no clock in the world has
// to know it is happening — which is why it composes with the hitstop instead of overwriting it.
//
// IT IS NOT THE BODY'S NUMBER any more. It used to scale the frame's ONE step, which meant the
// player was slowed with everybody else — and the user's correction says exactly why that was
// wrong: *"make when im in air combo my speed is normal only slow the stuff around me and my fall
// speed but my attacks speed are the same"*. A combo whose own M1 chain comes out at 42 % speed is
// a combo that feels like it is stuck in mud, which is the opposite of what bullet time is for. So
// the player is integrated on his own unbuffered step and the world keeps the slow, and the only
// part of HIS motion that still answers to it is the one he asked for: his FALL (see
// `player.fallScale` and `airComboGravity`), which is what buys the hang and the extra real
// seconds in the air. `P.AIR_SLOWMO_FADE` is the shift at either end, so the slow-in lands with the
// tackle rather than as a step, and the slow-out is already gone by the time the body is back on
// its feet.
let slowmo = 1;
// ...and the share of the raw frame the BODY got (`pstep / dt`), which is 1 except during the
// bullet time (when it is `1` for him and `slowmo` for the world) and during a hitstop (when the
// whole fight takes the same 0.07 together). Kept only so `GAME.slowmo()` can prove the split.
let bodyScale = 1;
function loop(now) {
  requestAnimationFrame(loop);
  if (protoActive) { last.t = now; return; }
  checkViewport();
    // ...and the dial's own slow re-measure, which has to be asked for from HERE rather than from
    // `setDial` (see the note in hud.js): at the top of the frame nothing has been written yet, so a
    // `clientWidth` read answers out of the layout the browser already has instead of forcing a new one.
    hud.tickDial();
  // ...and THE SIGNS' WARM-UP, which only ever runs while the game is NOT — see `warmStep` in yard.js:
  // the training grounds' nameplates measure themselves (a forced layout, so all fourteen go in one
  // frame — 12.5 ms once, against 44.2 ms spread over four) behind the title screen, so the first
  // frame after PLAY does not have to. `frame` is what normally drives them, and `frame` does not run
  // until PLAY, so this is the one place they can be warmed: the title screen still renders the world
  // (the loop runs) but never enters the simulation.
  if (!running) signs.warmStep();
  const dtMs = now - last.t;
  last.t = now;
  const dt = Math.min(0.033, Math.max(0.001, dtMs / 1000));
  // HITSTOP. A landed strike holds the whole world still for a few frames (`player.hitstop`,
  // set on contact): the step everything below integrates is squashed toward zero for as long as
  // it lasts. It costs nothing — no branch in any update, just a smaller number — and it is what
  // makes a punch that lands read as heavier than one that misses.
  let step = dt;
  // ...and `pstep` is the BODY's own step, which is a different number now (see the bullet-time
  // note below). Everything that is the world's — enemies, props, FX, the debris, the world's own
  // streamer — is integrated on `step`; the player's own state machine, his pose clock, his
  // attacks and his horizontal motion are integrated on `pstep`. They start equal, and only the
  // bullet time ever pulls them apart. The hitstop is the exception and squashes BOTH: a landed
  // strike is a beat the fight takes together, and a world frozen around a body that keeps
  // swinging is not a freeze at all.
  let pstep = dt;
  if (player.hitstop > 0) {
    player.hitstop = Math.max(0, player.hitstop - dt);
    step = dt * 0.07;
    pstep = dt * 0.07;
  }
  // ...and the bullet time rides on top of it (a tackle that opens the combo is both at once: the
  // beat of the impact INSIDE the slow), so the two multiply rather than one overwriting the other.
  // `manual` is in the gate on purpose: manual mode drives the simulation through `GAME.step`, which
  // stops the loop before any of this, so a manual step must be a CLEAN, unslowed frame — every
  // harness in this project measures absolute positions and would silently read every air-combo
  // number 0.42x low otherwise.
  const slowTarget = running && !manual && player.airComboOpen ? P.AIR_SLOWMO : 1;
  if (slowmo !== slowTarget) {
    slowmo += (slowTarget - slowmo) * Math.min(1, dt / P.AIR_SLOWMO_FADE);
    if (Math.abs(slowmo - slowTarget) < 0.002) slowmo = slowTarget;
  }
  // THE SLOW TIME IS THE WORLD'S, NOT THE BODY'S. The user's own words: *"make when im in air combo
  // my speed is normal only slow the stuff around me and my fall speed but my attacks speed are the
  // same"*. So the bullets stop for everyone but him — the world takes the whole `slowmo` on `step`,
  // and the player keeps his own clock on `pstep`, which is why his M1 chain and his air attacks
  // come out at exactly the speed they always do instead of dragging. The ONE piece of his own
  // motion the slow still owns is his FALL, and that is handed over rather than applied here:
  // `player.fallScale` is read by `airComboGravity`, which is the single place the juggle's descent
  // is defined, so the hang he gets out of an air combo is untouched by this change while his
  // attacks stop being slowed with the rest of the world.
  player.fallScale = slowmo;
  step *= slowmo;
  bodyScale = pstep / dt;

  fpsAcc += dtMs;
  fpsCount++;
  fpsAcc_timer += dtMs;
  if (fpsAcc_timer > 400) {
    fps = 1000 / (fpsAcc / fpsCount);
    fpsAcc = 0;
    fpsCount = 0;
    fpsAcc_timer = 0;
    hud.setFps(fps);
    if (running && !settings.doxSaver && quality < QUALITY.length - 1) {
      if (fps < 42) {
        slowTime += 0.4;
        if (slowTime > 2.5) {
          setQuality(quality + 1);
          slowTime = 0;
        }
      } else {
        slowTime = Math.max(0, slowTime - 0.2);
      }
    }
  }
  let inp = input.frame();
  if (inputOverride) inp = Object.assign({}, inp, inputOverride);
  if (manual) return;
  frame(step, inp, pstep);
  pres.render(scene, camera, post);
  // ...and THE HERO LAYER, right after the main picture and off the same camera: the body alone,
  // drawn over the options overlay's dim while the wardrobe is in view (see `renderHero`).
  renderHero(showcase);
  input.postFrame();
  frameCount++;
}

// THE SKILL ICONS BAKE THEMSELVES IN THE EDITOR (session 186; moved to BOOT in session 201 — see
// icons.js). The shipped PNGs are what a SAVED generator uses, and that is deliberate: the published
// game pays nothing for this. An UNSAVED one retunes poses as it is worked on, which is exactly when
// those PNGs go stale — so the editor bakes them off the live rig and swaps them onto the HUD.
// `window.__noAutoIcons = true` stands it down (a `page_refresh` preamble, or the console).
//
// ...AND IT RUNS BEFORE THE TITLE SCREEN IS EVER DISMISSED, WHICH IS THE WHOLE POINT OF THE MOVE.
// The bake is not a render: it drives the SIM (manual mode, `g.step`, a fresh body per icon) and it
// stages both bodies and the LENS to frame each shot — `bakeOne` writes `player.camYaw` and `rig.yaw`
// and pulls the player onto the dummy's own line. Session 186 ran it a beat after the user's first
// PLAY, so all of that landed ON a live session, and the user reported the wreckage as three separate
// bugs. MEASURED on the live page they were one: the body was put back on its SPAWN (`respawn()` per
// icon — *"suddenly my character goes to the spawn point"*); the mouse was left DEAD, because
// `setManual(false)` never restores `input.mouseLook`, so the camera could not be turned again
// (*"my camera freezes at the same angle"*); and the field was rebuilt with `enemies.list.length = 0`,
// which drops the ARRAY but leaves the last dummy's GROUP in the scene — a second body standing in
// the camp for the life of the page (*"there 2 dummies at the start of the map"*, and a fresh one
// appearing the moment the bake ran). So it runs while the title card is still up
// (`setManual(true, {keepOverlay:true})` is what keeps it there) and with `hasStarted` pre-set, which
// is what stops `bakeSkillIcons` from calling `start()` and handing the page over to a game nobody
// asked for. The title state is put back when it is done, and a PLAY pressed while it bakes is held
// and taken the moment it finishes.
let autoIconsDone = false;
let autoIconsBaking = false;
let autoIconsPlay = false;      // PLAY pressed mid-bake (see `start`)

// The title card, in one place: the boot shows it, and a bake that was interrupted by a PLAY needs it
// back. (The bake itself cannot dismiss it — see `keepOverlay`.)
function showTitleOverlay() {
  if (touchUIOn()) {
    hud.showOverlay("ADAPT", "tap to start — use the stick to move, drag the right side to look", "TAP TO PLAY");
  } else {
    hud.showOverlay("ADAPT", "infinite low-poly parkour", "CLICK TO PLAY");
  }
}

function autoBakeIconsForEditor() {
  if (autoIconsDone) return;
  autoIconsDone = true;
  // "Editor preview" is the `#edit` hash the platform puts on the embedded page while it is being
  // worked on, or the unsaved flag (whichever is set); a visitor to the published page has neither,
  // so only they skip the bake and keep the shipped PNGs.
  const editing = window.generatorIsUnsaved === true || window.location.hash === "#edit";
  if (!editing || window.__noAutoIcons) return;
  setTimeout(runEditorIconBake, 600);
}

async function runEditorIconBake() {
  const g = window.GAME;
  if (!g || !g.player || !g.rig) return;
  // Everything the bake moves, so the title screen can be handed back untouched.
  const keep = {
    pos: player.pos.clone(),
    vel: player.vel.clone(),
    facing: player.facing,
    camYaw: player.camYaw,
    yaw: rig.yaw,
    pitch: rig.pitch,
    dist: rig.dist,
    wantDist: rig.wantDist,
  };
  const wasRunning = running;
  const wasStarted = hasStarted;
  autoIconsBaking = true;
  try {
    // The sim has to be RUNNING for the bake to animate anything (`frame` gates the whole body on
    // `running`), but it must not be a SESSION — hence `hasStarted` (see the note above).
    running = true;
    hasStarted = true;
    await autoBakeIcons(g, { keepOverlay: true });
  } catch (e) {
    console.warn("[icons] self-bake failed; keeping the shipped icons", e);
  } finally {
    // HAND THE FIELD BACK PROPERLY. Clearing `list` alone is what left a second dummy standing in
    // the camp: the array is not the scene, and only removing the GROUPS takes the bodies with it.
    for (const e of enemies.list) if (e.group && e.group.parent) e.group.parent.remove(e.group);
    enemies.list.length = 0;
    enemies.buildQueue.length = 0;
    enemies.spawned = false;      // so `beginPlay` lays the opening fight out itself
    // ...the body and the lens, exactly as they were...
    player.pos.copy(keep.pos);
    player.vel.copy(keep.vel);
    player.facing = keep.facing;
    player.camYaw = keep.camYaw;
    player.state = "air";
    player.stateTime = 0;
    player.grounded = false;
    rig.yaw = keep.yaw;
    rig.pitch = keep.pitch;
    rig.dist = keep.dist;
    rig.wantDist = keep.wantDist;
    // ...and a few frames to SETTLE, because the rig is still wearing the last shot: with the sim
    // stopped again nothing below would ever put the body back on the deck, and the title screen
    // would be standing there in a flying knee.
    for (let i = 0; i < 26; i++) g.step(1 / 60, {});
    running = wasRunning;
    hasStarted = wasStarted;
    autoIconsBaking = false;
    if (autoIconsPlay) { autoIconsPlay = false; start(); }
  }
}

function beginPlay() {
  running = true;
  input.mouseLook = true;
  hud.hideOverlay();
  // Put the other side of the fight down around wherever the player starts. Only once: a pause
  // and a resume is not a new session.
  if (!enemies.spawned) {
    // ...and the fight opens on a FIXED line. The dummy is placed down the CAMERA's own forward
    // (see `Enemies.spawn`, which puts its own side-offset on the body), and the ARENA's wall
    // behind it (see `ARENA` in world.js) is an axis-aligned solid that cannot be turned to face
    // an arbitrary angle — so the angle is taken out of the camera instead: negating the spawn's
    // own side-offset stands the body dead ahead on the -Z axis, square across the wall. The
    // menu's slow orbit means the camera is somewhere else entirely by the time PLAY is pressed;
    // the overlay is hidden on the line above, so the correction is never seen as a turn.
    rig.yaw = -E.SPAWN_SPREAD;
    player.camYaw = rig.yaw;
    player.facing = rig.yaw + Math.PI;
    enemies.spawn(player);
  }
  if (!touchUIOn() && !input.mouseFree) input.requestLock();
  // The skill icons' own bake is NOT scheduled from here any more: it runs at BOOT, behind the title
  // card (see `autoBakeIconsForEditor`) — a bake started on PLAY is a bake that hijacks the session.
}

function start() {
  // A bake may still be running (see `runEditorIconBake`): it drives the sim itself, so a PLAY taken
  // now would be swallowed by its staging — the very hijack the icon notes above are about. Hold it,
  // and take it the moment the bake is done.
  if (autoIconsBaking) { autoIconsPlay = true; return; }
  sfx.init();
  hasStarted = true;
  beginPlay();
}

function pause() {
  running = false;
  input.mouseLook = false;
  input.mouseFree = false;
  hud.setMouseFree(false);
  hud.showOverlay("PAUSED", "press O or use OPTIONS (top right) for settings", "RESUME");
}

function toggleMouseFree() {
  input.setMouseFree(!input.mouseFree);
  hud.setMouseFree(input.mouseFree && running);
  if (sfx.ready) sfx.ui();
}

input.onLockChange = (locked) => {
  if (!running) return;
  if (!locked && input.wasLocked && !touchUIOn() && !input.mouseFree) pause();
};

hud.startBtn.addEventListener("click", () => {
  start();
});

// SHIFT LOCK's own key (see `setShiftLock`): ALT is only the toggle when it is pressed ALONE. The
// press is ARMED here and spent on the key's own release, and any other key arriving while ALT is
// down (the ALT+1..6 retro render toggles just below) disarms it — without that, every ALT+digit
// would flip the lock as well.
let altArmed = false;

window.addEventListener("keydown", (e) => {
  if (protoActive) {
    if (e.code === "Escape" || e.code === "KeyO") exitProto();
    return;
  }
  if (e.code === "AltLeft" || e.code === "AltRight") altArmed = true;
  else if (altArmed) altArmed = false;
  if (e.code === "KeyO" || e.code === "Slash") {
    // ...and with the update log open, O is a SWAP rather than a close: a player reaching for the
    // options card should not have to shut one panel to open the other (`openOptions` closes the log
    // as it takes over).
    toggleOptions();
    return;
  }
  if (e.code === "Escape") {
    // ESC means "get me out", so whatever is up is what it shuts — the log first if the log is the
    // thing on screen.
    if (logOpen) closeLog();
    else if (optionsOpen) closeOptions();
    else openOptions();
    return;
  }
  if (optionsOpen || logOpen) return;
  // Respawn is on "]" rather than R: R sits right next to the keys a WASD hand rests on, and a
  // stray press mid-run is a lost run (see the help panel's own key list).
  if (e.code === "BracketRight") {
    player.respawn();
    spawnDist.v = 0;
    if (sfx.ready) sfx.ui();
  }
  if (e.code === "KeyV") toggleFirstPerson();
  if (e.code === "KeyH") hud.toggleHelp();
  if (e.code === "KeyT") {
    toggleMouseFree();
    return;
  }
  if (e.code === "KeyN") {
    cycleCharacter();
    return;
  }
  if (e.code === "KeyB") {
    chooseOutfit(nextOutfit());
    return;
  }
  // ...and the world switch, on the letter the options row prints beside it (`WORLD GEN`). It is
  // the same press the row's own click makes: `setWorld` tears the field down and streams the next
  // generator in, and it sends the body back to the camp because that is the one place all three
  // worlds guarantee is open ground.
  if (e.code === "KeyK") {
    setWorld(nextWorld());
    return;
  }
  // The four skills/ultimate keys are read as INPUT (see input.js `action`): 1, 2, 3 and R. The
  // retro render toggles that used to live on the bare digits moved to ALT+1..6, because the three
  // red pills on the dial ARE skills 1, 2 and 3 (the user's own concept) and the digits have to
  // mean what the HUD says they mean.
  if (!e.altKey) {
    updateSettingsPanel();
    return;
  }
  if (e.code === "Digit1") toggleLowRes();
  if (e.code === "Digit2") toggleWobble();
  if (e.code === "Digit3") toggleDither();
  if (e.code === "Digit4") toggleAffine();
  if (e.code === "Digit5") toggleFog();
  if (e.code === "Digit7") toggleOutline();
  if (e.code === "Digit6") {
    setQuality((quality + 1) % QUALITY.length);
  }
  updateSettingsPanel();
});

window.addEventListener("keyup", (e) => {
  if (e.code !== "AltLeft" && e.code !== "AltRight") return;
  // ...and the toggle lands HERE rather than on the press, so a plain ALT is the only thing that
  // gets here with the flag still armed (see `altArmed`).
  if (!altArmed) return;
  altArmed = false;
  toggleShiftLock();
});

function updateSettingsPanel() {
  hud.showSettings([
    { key: "ALT+1", name: "LOW-RES RENDER", on: settings.lowRes },
    { key: "ALT+2", name: "VERTEX WOBBLE", on: settings.wobble > 0 },
    { key: "ALT+3", name: "DITHER + 15BIT", on: settings.dither > 0 },
    { key: "ALT+4", name: "AFFINE WARP", on: settings.affine > 0 },
    { key: "ALT+5", name: "FOG", on: settings.fog > 0 },
    { key: "ALT+7", name: "PLAYER OUTLINE", on: settings.outline > 0 },
    { key: "ALT+6", name: "QUALITY " + (quality + 1) + "/" + QUALITY.length, on: true },
  ]);
}

function resize() {
  const r = pres.resize();
  camera.aspect = r.displayWidth / r.displayHeight;
  camera.updateProjectionMatrix();
  rig.baseFov = computeFov(camera.aspect);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
}
let viewW = window.innerWidth;
let viewH = window.innerHeight;
// Fullscreen / orientation changes don't always deliver a resize event to this frame (and when
// they do it can arrive before layout settles), which would leave the render buffer at the old
// aspect and stretch the canvas. Polling two integers per frame is free and always wins.
function checkViewport() {
  if (window.innerWidth !== viewW || window.innerHeight !== viewH) resize();
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", resize);

// ---- CLICK-ONLY BUTTONS -------------------------------------------------------------------------
// A focused button is a trap in a game whose jump is SPACE: the browser's own activation behaviour
// fires a `click` on it, so the moment the FULLSCREEN button has keyboard focus a jump toggles
// fullscreen again — which is how the game "sometimes" left fullscreen on its own. TAB-then-ENTER
// gets there too, without a mouse ever touching the button. `clickOnly` below closes both doors.
//
// It is for the buttons that belong to the GAME (the HUD pair and the touch pads): they are meant to
// be pressed by a finger or a mouse and by nothing else — TAB is kept off them with `tabindex="-1"`,
// the key guard eats the SPACE/ENTER the browser would turn into a press, and the blur stops a mouse
// click from leaving focus behind to catch the next jump.
function clickOnly(btn) {
  if (!btn) return;
  btn.setAttribute("tabindex", "-1");
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar" || e.code === "Space") e.preventDefault();
  });
  // SPACE activates a button on KEYUP, so the keydown guard alone is not enough.
  btn.addEventListener("keyup", (e) => {
    if (e.key === " " || e.key === "Spacebar" || e.code === "Space") e.preventDefault();
  });
  btn.addEventListener("click", () => btn.blur());
}

hud.optBtn.addEventListener("click", () => toggleOptions());
const handleFsPress = (e) => {
  if (e) {
    if (e.type === "touchend") e.preventDefault();
    e.stopPropagation();
  }
  toggleFullscreen();
};
hud.fsBtn.addEventListener("click", handleFsPress);
hud.fsBtn.addEventListener("touchend", handleFsPress, { passive: false });
clickOnly(hud.optBtn);
clickOnly(hud.fsBtn);
// ...and the thumb pads, which have the same problem and no keyboard at all to need them.
for (const b of document.querySelectorAll("#touch button")) clickOnly(b);
hud.optClose.addEventListener("click", () => closeOptions());
hud.optRespawn.addEventListener("click", () => {
  player.respawn();
  spawnDist.v = 0;
  hud.setOptSub("RESPAWNED");
});
hud.optReset.addEventListener("click", () => resetDefaults());

// THE UPDATE LOG's two buttons (see `UPDATES` above and `#updateLog` in index.html). The list is
// rendered ONCE, the first time the panel is opened — `setLog` only hands the items to the HUD, and
// `hud.showLog` builds the list (see the long note on `renderLog` in hud.js: 988 DOM nodes and 122 tag
// hosts were being built and tagged at boot for a card nobody had asked for). The entries are
// authored, not generated, so once it is built it is never rebuilt — and a re-render on open is
// exactly how a scroll position gets thrown away for no reason.
hud.logBtn.addEventListener("click", () => toggleLog());
clickOnly(hud.logBtn);
hud.logClose.addEventListener("click", () => closeLog());
clickOnly(hud.logClose);
hud.setLog(UPDATES);

hud.optionsScroll.addEventListener("click", (e) => {
  const row = e.target.closest("[data-act]");
  if (row) applyOption(row.dataset.act, row.dataset);
});

document.addEventListener("fullscreenchange", syncFullscreen);
document.addEventListener("webkitfullscreenchange", syncFullscreen);
document.addEventListener("mozfullscreenchange", syncFullscreen);
document.addEventListener("MSFullscreenChange", syncFullscreen);
document.addEventListener("fullscreenchange", resize);
document.addEventListener("webkitfullscreenchange", resize);
document.addEventListener("mozfullscreenchange", resize);
document.addEventListener("MSFullscreenChange", resize);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isPseudoFullscreen) {
    isPseudoFullscreen = false;
    const gameEl = document.getElementById("game");
    if (gameEl) gameEl.classList.remove("pseudo-fullscreen");
    document.documentElement.classList.remove("pseudo-fullscreen-root");
    document.body.classList.remove("pseudo-fullscreen-root");
    syncFullscreen();
    resize();
  }
});

let wheelSaveT = 0;
window.addEventListener(
  "wheel",
  (e) => {
    if (optionsOpen || !running) return;
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
    if (!rig.zoomBy(Math.max(-240, Math.min(240, d)))) return;
    clearTimeout(wheelSaveT);
    wheelSaveT = setTimeout(saveOptions, 400);
  },
  { passive: true }
);

canvas.addEventListener("click", () => {
  if (running && input.mouseFree) toggleMouseFree();
});

// The help card can scroll on short windows — don't let that wheel spin reach the camera zoom.
hud.help.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });

function resetDefaults() {
  settings.lowRes = DEFAULTS.lowRes;
  settings.wobble = DEFAULTS.wobble;
  settings.dither = DEFAULTS.dither;
  settings.affine = DEFAULTS.affine;
  settings.fog = DEFAULTS.fog;
  setOutlineEnabled(DEFAULTS.outline > 0);
  rig.firstPerson = DEFAULTS.fp;
  settings.firstPerson = DEFAULTS.fp;
  settings.noCamFlip = DEFAULTS.noCamFlip;
  input.sensitivity = DEFAULTS.sens;
  input.touchSensitivity = DEFAULTS.sens * 1.75;
  input.invertY = DEFAULTS.invertY;
  P.SPRINT = DEFAULTS.sprint;
  P.RUN_MIN = DEFAULTS.runMin;
  P.BUILD_TIME = DEFAULTS.build;
  P.WALL_SLIDE = DEFAULTS.wallSlide;
  rig.baseDist = DEFAULTS.camDist;
  rig.lockDist = null;
  skySys.dayLength = DEFAULTS.dayLength * 60;
  setTextSize(DEFAULTS.textSize);
  settings.volume = DEFAULTS.volume;
  sfx.setVolume(settings.volume);
  settings.touchUI = DEFAULTS.touchUI;
  applyTouchUI();
  settings.showPs1Menu = DEFAULTS.showPs1Menu;
  applyPs1MenuVisibility();
  settings.showControlsGuide = DEFAULTS.showControlsGuide;
  applyControlsGuideVisibility();
  settings.doxSaver = DEFAULTS.doxSaver;
  setQuality(quality);
  // ...and the world generator. RESET DEFAULTS has to be able to get you back out of the maze, so
  // a change here goes through the same teardown a press of the option does.
  if (settings.world !== DEFAULTS.world) {
    settings.world = DEFAULTS.world;
    rebuildWorld();
  }
  resetWardrobe();
  player.loadCharacter(DEFAULTS.charMode);
  repaintWardrobe(player.charMesh);
  post.uniforms.uDither.value = settings.dither;
  syncMaterialSettings();
  pres.resize();
  saveOptions();
  refreshOptions();
  updateSettingsPanel();
  hud.setOptSub("DEFAULTS RESTORED");
}

loadOptions();
// ...and the per-world traits (the grass and the hills' pinned sky) have to be settled BEFORE the
// first chunk is streamed, or a session saved in the hills would boot its sky away from the seam.
applyWorldTraits();
setQuality(isTouch ? 1 : 0);
syncMaterialSettings();
post.uniforms.uDither.value = settings.dither;
syncFullscreen();
resize();
world.primeChunks(player.pos.x, player.pos.z, 30, PRIME_MS);
player.camYaw = rig.yaw;
updateSettingsPanel();
player.loadCharacter(player.charMode).then(() => {
  updateSettingsPanel();
  refreshOptions();
});

showTitleOverlay();

window.GAME = {
  player,
  world,
  grass,
  destruction,
  enemies,
  poles,
  P,
  E,
  abilities,
  rig,
  gear,
  hud,
  adaptUI,
  input,
  sfx,
  effects,
  settings,
  shared,
  THREE,
  renderer,
  scene,
  camera,
  pres,
  post,
  sky,
  skySys,
  setTime(hours) {
    skySys.setTime(hours);
  },
  setDayLength(minutes) {
    skySys.dayLength = Math.max(0, minutes) * 60;
  },
  setMood(name, timer) {
    return skySys.setMood(name, timer);
  },
  nextMood() {
    return skySys.nextMood();
  },
  skyState() {
    return skySys.state();
  },
  get running() {
    return running;
  },
  MAZE,
  HILLS,
  PARK,
  setWorld,
  rebuildWorld,
  // THE SKILL ICONS (see icons.js): `await GAME.bakeIcons()` hands back one data-URL PNG per skill,
  // baked off the live rig at each move's own contact frame. Editor-only; nothing calls it in play.
  bakeIcons: (o) => bakeSkillIcons(GAME, o),
  start,
  pause,
  setQuality,
  openOptions,
  closeOptions,
  toggleOptions,
  openLog,
  closeLog,
  toggleLog,
  enterProto,
  exitProto,
  updates: UPDATES,
  toggleFullscreen,
  toggleMouseFree,
  setMouseFree(v) {
    input.setMouseFree(v);
    hud.setMouseFree(input.mouseFree && running);
  },
  applyOption,
  applySlider,
  optionItems,
  refreshOptions,
  saveOptions,
  resetDefaults,
  wardrobe: {
    state: wardrobeState,
    overrides: wardrobeOverrides,
    outfits: outfitList,
    current: currentOutfit,
    setOutfit,
    reset() {
      resetWardrobe();
      return repaintWardrobe(player.charMesh);
    },
    repaint: () => repaintWardrobe(player.charMesh),
    paint(family, hex) {
      setWardrobeColor(family, hex);
      return repaintWardrobe(player.charMesh);
    },
  },
  get optionsOpen() {
    return optionsOpen;
  },
  get logOpen() {
    return logOpen;
  },
  get protoActive() {
    return protoActive;
  },
  get hasStarted() {
    return hasStarted;
  },
  // THE CHARGE METER (session 177 — see climbar.js). Exposed for the same reason `slowmo` is: it is a
  // world object a step-by-step harness cannot see any other way, so its own state has to be readable.
  climbMeter,
  // ...and the ball shot's own charge bar (session 198), for the same reason.
  shotMeter,
  respawn() {
    player.respawn();
    spawnDist.v = 0;
  },
  setOverride(o) {
    inputOverride = Object.assign({}, inputOverride || {}, o);
  },
  clearOverride() {
    inputOverride = null;
  },
  step(dt, o) {
    const inp = input.frame();
    const merged = Object.assign({}, inp, inputOverride || {}, o || {});
    frame(Math.min(0.033, dt), merged);
    pres.render(scene, camera, post);
    input.postFrame();
    stepCount++;
    return stateText();
  },
  counters: () => ({ loopFrames: frameCount, steps: stepCount }),
  // The FX budget's own read-out (see `Effects.fxScale`): how many strikes and sparks have been
  // thrown, how many particles are live right now, and the share of every authored count that the
  // quality tier is currently allowing. This is what the frame-budget work is measured with.
  fx: () => ({
    strikes: effects.strikes,
    sparks: effects.sparks,
    live: effects.pool.reduce((n, it) => n + (it.alive ? 1 : 0), 0),
    scale: effects.fxScale,
    pool: effects.pool.length,
  }),
  lastEvents: () => player.events.slice(),
  // The air combo's bullet time (see the `slowmo` block in the loop): the multiplier the WORLD's
  // step is currently being scaled by, the target it is ramping to, and the body's own two numbers
  // — `body` (the step the player is actually integrated on, which is 1 of the world's by design; see
  // the bullet-time note) and `fall` (the share of that slow his own descent still answers to,
  // `player.fallScale`). Exposed for the same reason `fall()` is: the effect is invisible to a
  // step-by-step harness (manual mode stops the loop before it ever uses `step`), so the values have
  // to be readable to be verified.
  slowmo: () => ({
    now: +slowmo.toFixed(3),
    target: running && !manual && player.airComboOpen ? P.AIR_SLOWMO : 1,
    body: +bodyScale.toFixed(3),
    fall: +player.fallScale.toFixed(3),
  }),
  // ...and the dive launch's own read-out, the same way `fall()` is the skyfall's.
  dive: () => ({
    state: player.state,
    cd: +player.airCd.toFixed(2),
    combo: +player.airComboT.toFixed(2),
    open: player.airComboOpen,
    hits: player.diveHits.size,
    arrive: player.diveArrive,
    last: player.lastDiveHit ? { up: player.lastDiveHit.up, power: +player.lastDiveHit.power.toFixed(2) } : null,
  }),
  // The skyfall's own read-out and its override, for the tuning harness: `fall()` is what the
  // fall is doing right now (shape, name, plunge, brace, height to the deck), and `setFall(name)`
  // pins the next fall to a given shape — the seven are swept one at a time that way (see the pose
  // recipes in src/README.md).
  fall: () => ({
    on: player.skyfall,
    kind: player.fallKind,
    // ...and the PLUNGE's own two (see the `plunge` block in player.js): whether M1 has the fall
    // held into its downward dive, how long that has been on, and how much of its lean the rig is
    // carrying — the cross-fade `plungePose` is 0 for a cruise shape and 1 for the dive.
    plunge: player.plunge,
    plungeT: +player.plungeT.toFixed(2),
    plungePose: +player.plungePose.toFixed(3),
    name: player.charMesh && player.charMesh.userData.fallKindName ? player.charMesh.userData.fallKindName(player.plunge ? "plunge" : player.fallKind) : "",
    brace: +player.fallBrace.toFixed(3),
    drop: +player.fallDrop.toFixed(2),
    t: +player.skyfallT.toFixed(2),
  }),
  setFall(name) {
    player.fallKindOverride = name || null;
    return player.fallKindOverride;
  },
  fallKinds: () => (player.charMesh && player.charMesh.userData.fallKinds) || [],
  // The staff's own read-out, the same way `dive()` and `fall()` are: whether he is HOLDING one and
  // how much of it is left (`hp`), which of the three moves is running and how far through it, where
  // the shaft's two ends are in world space, and the two numbers every claim in README.md's "THE
  // STAFF" is measured with — the gap from each HAND to the shaft's line. A staff standing in front
  // of him is `near` (which is what the right button tests before anything else), and `live` is the
  // supply (there is one pole, see pole.js).
  // The running vault's own read-out (see `vaultTarget` / `startVault` in player.js): whether one is
  // on, how far through the crossing, what it is going over, and the speed it is carrying — the
  // numbers README.md's vault section is measured with.
  vault: () => ({
    on: player.state === "vault",
    t: +(player.vaultT / (player.vaultDur || 1)).toFixed(3),
    top: +player.vaultTop.toFixed(2),
    side: player.vaultSide,
    kind: player.vaultKind,
    flip: +player.vaultFlip.toFixed(2),
    roll: +player.vaultRoll.toFixed(2),
    speed: +player.vaultSpeed.toFixed(2),
    bonus: +player.vaultBonus.toFixed(3),
    cd: +player.vaultCd.toFixed(2),
    from: player.vaultFrom ? [+player.vaultFrom.x.toFixed(2), +player.vaultFrom.y.toFixed(2), +player.vaultFrom.z.toFixed(2)] : null,
    to: player.vaultTo ? [+player.vaultTo.x.toFixed(2), +player.vaultTo.y.toFixed(2), +player.vaultTo.z.toFixed(2)] : null,
  }),
  pole: () => ({
    held: player.holdingPole(),          // is the wood in his hands (not thrown, not gone)
    hp: player.poleHp,                   // ...and how many strikes are left in it (`POLE_HP` 5)
    willBreak: player.poleWillBreak,     // whether the move NOW RUNNING is the one that spends it
    mode: player.poleMode,               // which of the four shapes the pose is drawing
    state: player.state,
    prop: player.poleHeld ? player.poleHeld.state : null,
    site: player.poleHeld ? player.poleHeld.site : null,
    t: +player.poleT.toFixed(3),         // the live shape's own clock (0..1)
    atkT: +player.poleAtkT.toFixed(3),
    beat: player.poleAtkBeat,            // which contact of the flurry has fired
    spin: +player.poleAtkSpin.toFixed(3),
    cd: +player.poleAtkCd.toFixed(2),
    lift: +player.poleLift.toFixed(3),   // the haul out of the deck (1 = it is in his hands)
    fly: !!player.poleFly,               // is the prop away (see `updatePoleFlight`)
    vaultT: +player.poleVaultT.toFixed(3),
    flipT: +player.poleFlipT.toFixed(3),      // 1 at the vault's entry, 0 when the turn is done
    launchT: +player.poleLaunchT.toFixed(3),  // s the speed ceiling still stands down for
    lastBreak: !!player.lastPoleBreak,
    near: !!player.poleNear(),
    live: poles.props().filter((p) => p.state === "planted").length,
    shaft: [player.poleShaftA, player.poleShaftB].map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]),
    hands: poleHandGaps(),
  }),
  setManual(v, o = {}) {
    manual = !!v;
    if (manual) {
      running = true;
      input.mouseLook = false;
      // ...UNLESS THE CALLER IS THE EDITOR'S OWN ICON BAKE, which runs behind the title card and may
      // not dismiss it (`o.keepOverlay` — see `runEditorIconBake`).
      if (!o.keepOverlay) hud.hideOverlay();
    }
  },
  stateText,
  hintText,
  signs,
  stations: () => STATIONS.map((s) => ({ n: s.n, name: s.name, x: s.x, y: s.y, z: s.z, r: s.r })),
  biomeNow() {
    return currentBiome();
  },
};

requestAnimationFrame(loop);

// ...and the editor's one-off icon self-bake, scheduled LAST so everything it touches exists (see
// `autoBakeIconsForEditor`): it runs behind the title card, before the user can press PLAY.
autoBakeIconsForEditor();
