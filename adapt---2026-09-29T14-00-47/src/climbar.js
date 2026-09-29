// ---------------------------------------------------------------------------
// THE CHARGE METER — a charge, drawn IN THE WORLD beside the body. TWO of them read off it now:
// the wall pull's (above) and the ball shot's (session 198 — see `shootBegin` in inventory.js).
// They are the same KIND of number — a hold filling a band, spent on release — and the user asked
// for the wall's to be in the world rather than on the HUD, so the ball's wears the same bar rather
// than a second widget somewhere else. The only difference is where the caller gets the two numbers
// from, which is what the optional `over` argument is for (see `update`).
// ---------------------------------------------------------------------------
// THE WALL PULL'S CHARGE, in detail:
//
//
// The user (session 177): *"make a meter next to the player in game not the ui a vertical meter
// shows how much the charge is charged and make the meter the same color as the thing hes climb
// jumping from"*.
//
// So it is not a HUD element: it is a small standing bar that rides beside the character, billboarded
// at the camera, and it is filled from the bottom by `player.climbCharge` — the same number the skip
// is spent on (see the `CLIMB_LOAD_` block in player.js). Its COLOUR is the face's own: `main.js`
// reads it off the collider the body is hanging on (`player.wall.c.c` — the very array that box's
// vertices are painted with, see `pickWall`) and hands it in every frame, so a skip off pale stone
// reads pale and one off a painted slab reads painted — the meter is about the wall you are on, not
// about the player. (It was a `surfaceColorAt` probe at first; that read the biome's ground green,
// because the body stands its own radius off the plate and the probe landed in the air outside it.)
//
// It appears with the pull (`player.climbLoad` is exactly "the stance is live": it fades in on the
// load and out over the fire's own tail), so it is on screen for the hold and the flight and gone the
// rest of the time, and the whole thing wears the PS1 materials (`createMaterial`) so it belongs to
// the world it is drawn in. It is deliberately small — a readout beside a body, not a billboard.
//
// One thing to keep in mind if it is ever moved: the fill is a unit box anchored at its own bottom
// and scaled in `y`, which is why `scale.y` is the charge and not a position.
import * as THREE from "./three.js";
import { createMaterial } from "./ps1.js";

const BAR_W = 0.17;      // the fill's width (world units)
const BAR_H = 1.02;      // the whole bar's height
const FRAME_W = 0.25;    // ...and the dark frame it stands in
const FRAME_H = BAR_H + 0.12;
const STANDOFF = 0.92;   // how far to the side of the body it stands
const LIFT = 0.04;       // ...and a whisker up, so it is centred on the chest

export class ClimbMeter {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.group.renderOrder = 6;

    // THE FRAME: the ink. A box rather than a plane so it casts its own dark edge in the PS1 light.
    const frameGeo = new THREE.BoxGeometry(FRAME_W, FRAME_H, 0.045);
    setWhite(frameGeo);
    this.frameMat = createMaterial({
      color: 0x000000, emissive: 0x141a26, transparent: true, opacity: 1,
      depthWrite: false, side: THREE.FrontSide,
    });
    this.frame = new THREE.Mesh(frameGeo, this.frameMat);
    this.frame.renderOrder = 6;
    this.group.add(this.frame);

    // THE FILL: a unit box grown from its own bottom (`translate`) so `scale.y` IS the charge. Its
    // colour is written per frame from the wall (see the class note).
    const fillGeo = new THREE.BoxGeometry(BAR_W, 1, 0.04);
    fillGeo.translate(0, 0.5, 0);
    setWhite(fillGeo);
    this.fillMat = createMaterial({
      color: 0x000000, emissive: 0xffffff, transparent: true, opacity: 1,
      depthWrite: false, side: THREE.FrontSide,
    });
    this.fill = new THREE.Mesh(fillGeo, this.fillMat);
    this.fill.position.set(0, -BAR_H / 2 + 0.03, 0.022);
    this.fill.renderOrder = 7;
    this.group.add(this.fill);

    // ...and the FILL's own bright head, a short cap that rides the top of the charge so the level is
    // readable even when the wall's colour is nearly the frame's.
    const capGeo = new THREE.BoxGeometry(BAR_W + 0.06, 0.055, 0.05);
    setWhite(capGeo);
    this.capMat = createMaterial({
      color: 0x000000, emissive: 0xffffff, transparent: true, opacity: 1,
      depthWrite: false, side: THREE.FrontSide,
    });
    this.cap = new THREE.Mesh(capGeo, this.capMat);
    this.cap.renderOrder = 8;
    this.group.add(this.cap);

    scene.add(this.group);

    // Scratch for the billboard's own right vector, so `update` allocates nothing.
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._col = new THREE.Color();
  }

  // Hide it outright (a respawn, a world swap, leaving the game).
  hide() {
    this.group.visible = false;
  }

  // `color` is the surface colour to paint it ([r,g,b], read by the caller — see the class note) or
  // null when there is nothing to read (the ground's colour is then used by the caller's own read, so
  // this only ever falls back to a neutral white).
  //
  // `over` is the OTHER readout's own state — the ball shot's charge (session 198), which is not a
  // climb at all and has no `climbLoad`/`climbCharge` to read. It is `{ show, charge, lift }` and,
  // when it is given, it is the WHOLE of what the meter is drawn from: the climb's own fields are not
  // consulted at all. `lift` is where the bar stands relative to `player.pos.y` — the climb hangs with
  // its position at chest height, a body on the deck has it at its FEET, and the ball's bar wants a
  // metre of lift to sit where the climb's does beside him.
  update(player, camera, color, over) {
    // THE PULL'S OWN WEIGHT is the whole visibility rule: `climbLoad` is the stance (see
    // `CLIMB_LOAD_POSE` / `CLIMB_FIRE_OUT`), so the meter rides in with the coil and back out with the
    // fire. A body that is not on a climb face has it at zero, so nothing here needs a second test.
    const show = over ? over.show : (player.climbing && player.attachMode === "climb" ? player.climbLoad : 0);
    if (show <= 0.004) {
      if (this.group.visible) this.group.visible = false;
      return;
    }
    this.group.visible = true;

    const charge = over ? Math.max(0, Math.min(1, over.charge || 0))
      : Math.max(0, Math.min(1, player.climbCharge || 0));
    const lift = over && over.lift !== undefined ? over.lift : LIFT;

    // WHERE: to the side of the body, on the camera's own right, so it is beside him on screen
    // whichever way the face happens to run. A full billboard (the camera's quaternion is copied
    // later, below), because a meter edge-on is not a meter.
    camera.getWorldDirection(this._fwd);
    this._right.set(-this._fwd.z, 0, this._fwd.x);
    if (this._right.lengthSq() < 1e-6) this._right.set(1, 0, 0);
    this._right.normalize();
    this.group.position.set(
      player.pos.x + this._right.x * STANDOFF,
      player.pos.y + lift,
      player.pos.z + this._right.z * STANDOFF
    );
    this.group.quaternion.copy(camera.quaternion);

    // THE FILL. The bar's own inner height, so a full charge stops just inside the frame.
    const inner = BAR_H - 0.10;
    const grow = Math.max(0.0001, charge);
    this.fill.scale.y = inner * grow;
    this.cap.position.set(0, -BAR_H / 2 + 0.03 + inner * charge, 0.026);

    // THE COLOUR: the face's own, made as bright as that hue can be and then lit further by the
    // charge — the bar GLOWS as the coil winds up, which is the one thing the meter is for. Three
    // rules, each of them learned the hard way:
    //   * the hue is kept by SCALING the colour up to its own brightest channel, never by adding
    //     white to it (a first cut's `+0.12` on the cap turned every wall's colour pure WHITE, which
    //     throws away the only thing the meter is saying);
    //   * the result is CLAMPED to 1 — these are raw emissive values and the post pass quantises them,
    //     so anything over full comes out white regardless of the maths behind it; and
    //   * it is given a MILD SATURATION LIFT first (push each channel away from the colour's own
    //     luma), because the faces in this world are muted slate tones and a muted slate brightened
    //     evenly just reads as grey. The lift is what makes the wall's blue still look blue at full
    //     brightness — measured on the arena slab ([0.20, 0.225, 0.275]): without it the bar read as a
    //     neutral pale grey, with it as the same pale blue the stone is.
    const r = color ? color[0] : 0.85;
    const g = color ? color[1] : 0.88;
    const b = color ? color[2] : 0.92;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const SAT = 1.35;
    const sr = Math.max(0, lum + (r - lum) * SAT);
    const sg = Math.max(0, lum + (g - lum) * SAT);
    const sb = Math.max(0, lum + (b - lum) * SAT);
    const lit = 0.60 + 0.40 * charge;
    const m = Math.max(sr, sg, sb, 0.06);
    const k = lit / m;
    this.fillMat.uniforms.uEmissive.value.setRGB(
      Math.min(1, sr * k), Math.min(1, sg * k), Math.min(1, sb * k)
    );
    // ...and the cap is the same hue taken to the very top of its range (its brightest channel at
    // exactly 1, no more), so it is the LEVEL MARKER: it floats above a part-filled bar and merges
    // into the fill's head at full charge, always in the wall's own colour rather than in white.
    const kc = 1 / m;
    this.capMat.uniforms.uEmissive.value.setRGB(
      Math.min(1, sr * kc), Math.min(1, sg * kc), Math.min(1, sb * kc)
    );
    // The frame is the same hue sunk into the ink, so the meter is bounded by its own wall's colour.
    this.frameMat.uniforms.uEmissive.value.setRGB(sr * 0.55 + 0.015, sg * 0.55 + 0.015, sb * 0.55 + 0.015);

    // THE FADE — the stance's own weight, and the whole bar takes it (the frame is the faintest, so
    // the ink does not outlive the fill).
    this.fillMat.uniforms.uOpacity.value = Math.min(1, show * 1.15);
    this.capMat.uniforms.uOpacity.value = Math.min(1, show * 1.15);
    this.frameMat.uniforms.uOpacity.value = Math.min(0.9, show * 0.9);
  }
}

// Every geometry in this file is drawn by `createMaterial`, whose vertex shader reads an `aColor`
// attribute (see ps1.js) — a geometry without one is drawn BLACK. These shapes are pure material
// colour, so the attribute is a plain white on every vertex.
function setWhite(geo) {
  const n = geo.attributes.position.count;
  geo.setAttribute("aColor", new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
}
