export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = Object.create(null);
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.sensitivity = 0.0024;
    this.touchSensitivity = 0.0042;
    this.invertY = false;
    this.moveXTouch = 0;
    this.moveZTouch = 0;
    this.touchActive = false;
    this.touch = { jump: false, jumpPressed: false, climb: false, slide: false, slidePressed: false, dive: false, divePressed: false, slam: false, slamPressed: false, dash: false, dashPressed: false, kick: false, kickPressed: false, grab: false, grabPressed: false, block: false, use: false, usePressed: false, tab: false, tabPressed: false };
    this.kickQueued = false;
    this.kickHeld = false;
    // THE RIGHT-CLICK GRAB (see "THE RIGHT-CLICK GRAB" in player.js). M2 is a rising edge like the
    // kick, claimed only while the pointer is locked and the game is actually playing.
    this.grabQueued = false;
    this.grabHeld = false;
    this.mouseFree = false;
    this.enabled = false;
    this.locked = false;
    this.wasLocked = false;
    this.mouseLook = false;
    this.consumed = Object.create(null);
    this.onLockChange = null;
    this.firstInteraction = false;

    this._onKeyDown = (e) => {
      if (e.code === "Tab") e.preventDefault();
      if (e.repeat) {
        return;
      }
      this.keys[e.code] = true;
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      this.firstInteraction = true;
    };
    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };
    this._onMouseMove = (e) => {
      if (!this.mouseLook || this.mouseFree) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    };
    // Left mouse (M1) is the wall kick. It is only claimed while the pointer is locked
    // and you are actually playing, so a click on the HUD/overlay (where the cursor is
    // free to point at things) is never stolen by the game.
    //
    // RIGHT mouse (M2) is THE GRAB (see "THE RIGHT-CLICK GRAB" in player.js) — the same bargain and
    // the same rising-edge rule, one button over. The browser's own context menu is swallowed while
    // the pointer is locked (`_onContext`), because half a grab followed by a menu is not a grab.
    this._onMouseDown = (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      this.firstInteraction = true;
      if (!this.mouseLook || this.mouseFree) return;
      // Rising edge only: a repeated mousedown for a press we are already holding must
      // not read as a second kick.
      if (e.button === 2) {
        if (this.grabHeld) return;
        this.grabHeld = true;
        this.grabQueued = true;
        return;
      }
      if (this.kickHeld) return;
      this.kickHeld = true;
      this.kickQueued = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.kickHeld = false;
      if (e.button === 2) this.grabHeld = false;
    };
    this._onContext = (e) => {
      // While the game has the pointer, the right button is a move and not a menu.
      if (this.mouseLook && !this.mouseFree) e.preventDefault();
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.wasLocked = true;
      if (this.onLockChange) this.onLockChange(this.locked);
    };
    this._onBlur = () => {
      this.keys = Object.create(null);
      this.kickHeld = false;
      this.grabHeld = false;
    };

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mousedown", this._onMouseDown);
    document.addEventListener("mouseup", this._onMouseUp);
    document.addEventListener("contextmenu", this._onContext);
    document.addEventListener("pointerlockchange", this._onLockChange);
  }

  requestLock() {
    this.firstInteraction = true;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch(() => {
          try {
            const p2 = this.canvas.requestPointerLock();
            if (p2 && p2.catch) p2.catch(() => {});
          } catch (e) {}
        });
      }
    } catch (e) {}
  }

  setMouseFree(v) {
    const want = !!v;
    if (want === this.mouseFree) return;
    this.mouseFree = want;
    this.mouseDX = 0;
    this.mouseDY = 0;
    if (want) {
      if (document.exitPointerLock) document.exitPointerLock();
    } else {
      this.requestLock();
    }
  }

  bindTouch(root) {
    const stick = root.querySelector("#stick");
    const knob = root.querySelector("#stickKnob");
    const zone = root.querySelector("#movePad");
    const pad = root.querySelector("#lookPad");
    const btn = (id, name) => {
      const el = root.querySelector(id);
      if (!el) return;
      const down = (e) => {
        e.preventDefault();
        el.classList.add("on");
        this.setTouch(name, true);
      };
      const up = (e) => {
        e.preventDefault();
        el.classList.remove("on");
        this.setTouch(name, false);
      };
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("pointerleave", up);
    };
    btn("#btnJump", "jump");
    btn("#btnClimb", "climb");
    btn("#btnSlide", "slide");
    btn("#btnDash", "dash");
    btn("#btnDive", "dive");
    btn("#btnSlam", "slam");
    btn("#btnKick", "kick");
    btn("#btnWhirl", "whirl");
    btn("#btnScissor", "scissor");
    btn("#btnCapo", "capo");
    btn("#btnGrab", "grab");
    btn("#btnBlock", "block");
    btn("#btnUlt", "ult");
    btn("#btnUse", "use");
    btn("#btnBag", "tab");

    // ---- THE STICK -------------------------------------------------------------------------
    // The user's *"make the phone ui 100x better an easier to use"*, and this is the half of it
    // that is not the button block: the WHOLE lower-left corner is the pad now. Before, the stick
    // was a 132-pixel square you had to FIND with your thumb before anything happened — a touch two
    // pixels outside it did nothing at all, and there were no landmarks on it to aim at. So the
    // zone is the touch target and the ring TELEPORTS to wherever the thumb lands (`placeStick`):
    // the drag always starts dead under the finger, and the stick's own size only decides how far
    // the knob travels. Releasing snaps the ring back to its resting corner, so it is still there
    // to be found next time.
    let stickId = null;
    let cx = 0;
    let cy = 0;
    let radius = 62;
    const updateStick = (x, y) => {
      let dx = x - cx;
      let dy = y - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      knob.style.transform = "translate(" + dx + "px," + dy + "px)";
      this.moveXTouch = dx / radius;
      this.moveZTouch = -dy / radius;
    };
    // Puts the ring's CENTRE on (x, y) and returns where it actually landed. The clamp is the
    // VIEWPORT, not the zone: the zone only decides where a touch may START, and holding the ring
    // inside it would have squeezed the whole thing into the ~40 pixels the zone has over the ring
    // — so a thumb landing at the zone's right edge would have found the ring clamped far to its
    // left and the stick already hard over. Against the viewport the ring simply follows the thumb
    // anywhere on screen, which is what it is supposed to do. The landing point — not the raw touch
    // — is the drag's ORIGIN, because the two differ at the very edges of the screen.
    const placeStick = (x, y) => {
      const zr = zone.getBoundingClientRect();
      const half = stick.offsetWidth / 2;
      const sx = Math.min(Math.max(x, half + 4), innerWidth - half - 4);
      const sy = Math.min(Math.max(y, half + 4), innerHeight - half - 4);
      stick.style.left = sx - half - zr.left + "px";
      stick.style.top = sy - half - zr.top + "px";
      stick.style.bottom = "auto";
      radius = stick.offsetWidth * 0.42;
      return [sx, sy];
    };
    if (zone && stick && knob) {
      zone.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.touchActive = true;
        stickId = e.pointerId;
        zone.setPointerCapture(e.pointerId);
        const at = placeStick(e.clientX, e.clientY);
        cx = at[0];
        cy = at[1];
        updateStick(e.clientX, e.clientY);
      });
      zone.addEventListener("pointermove", (e) => {
        if (e.pointerId !== stickId) return;
        updateStick(e.clientX, e.clientY);
      });
      const end = (e) => {
        if (e.pointerId !== stickId) return;
        stickId = null;
        this.moveXTouch = 0;
        this.moveZTouch = 0;
        knob.style.transform = "translate(0px,0px)";
        stick.style.left = "";
        stick.style.top = "";
        stick.style.bottom = "";
      };
      zone.addEventListener("pointerup", end);
      zone.addEventListener("pointercancel", end);
    }
    if (pad) {
      let lookId = null;
      let lx = 0;
      let ly = 0;
      pad.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        lookId = e.pointerId;
        lx = e.clientX;
        ly = e.clientY;
        pad.setPointerCapture(e.pointerId);
      });
      pad.addEventListener("pointermove", (e) => {
        if (e.pointerId !== lookId) return;
        const k = this.touchSensitivity / this.sensitivity;
        this.mouseDX += (e.clientX - lx) * k;
        this.mouseDY += (e.clientY - ly) * k;
        lx = e.clientX;
        ly = e.clientY;
      });
      const endLook = (e) => {
        if (e.pointerId !== lookId) return;
        lookId = null;
      };
      pad.addEventListener("pointerup", endLook);
      pad.addEventListener("pointercancel", endLook);
    }
  }

  setTouch(name, down) {
    const t = this.touch;
    if (down) {
      if (name === "jump" && !t.jump) t.jumpPressed = true;
      if (name === "climb" && !t.climb) t.climbPressed = true;
      if (name === "slide" && !t.slide) t.slidePressed = true;
      if (name === "dive" && !t.dive) t.divePressed = true;
      if (name === "slam" && !t.slam) t.slamPressed = true;
      if (name === "dash" && !t.dash) t.dashPressed = true;
      if (name === "kick" && !t.kick) t.kickPressed = true;
      if (name === "grab" && !t.grab) t.grabPressed = true;
      if (name === "use" && !t.use) t.usePressed = true;
      if (name === "tab" && !t.tab) t.tabPressed = true;
      if (name === "whirl" && !t.whirl) t.skill1Pressed = true;
      if (name === "scissor" && !t.scissor) t.skill2Pressed = true;
      if (name === "capo" && !t.capo) t.skill3Pressed = true;
      if (name === "ult" && !t.ult) t.ultPressed = true;
    }
    t[name] = down;
  }

  action(name) {
    const t = this.touch;
    switch (name) {
      case "jumpPressed": return !!this.pressed("Space") || t.jumpPressed;
      case "jumpHeld": return !!this.keys["Space"] || t.jump;
      // The climb's own hold: SPACE, or the touch pad's CLIMB button (a thumb cannot hold the jump
      // pad and still jump, so the pad needs a button of its own). It is both the way IN and the
      // move's own sustain (see the attach block in `player.js`) — and since session 148 only a
      // hold that BEGAN in the air takes a face, which is what the press edge below stamps (the
      // user's *"only be done if press space once then hold space again"*).
      case "climbHeld": return !!this.keys["Space"] || t.climb;
      // ...and its own PRESS edge. The climb now needs a hold that BEGAN in the air (session 148:
      // *"only be done if press space once then hold space again"*), and for the touch pad the
      // "press" is the pad being first touched rather than SPACE going down — `player.js` reads
      // this to stamp `climbHoldAir` (see it there).
      case "climbPressed": return !!this.pressed("Space") || t.climbPressed;
      case "slidePressed": return !!this.pressed("ShiftLeft") || !!this.pressed("ShiftRight") || t.slidePressed;
      case "slideHeld": return !!this.keys["ShiftLeft"] || !!this.keys["ShiftRight"] || t.slide;
      case "divePressed": return !!this.pressed("KeyF") || t.divePressed;
      case "diveHeld": return !!this.keys["KeyF"] || t.dive;
      case "slamPressed": return !!this.pressed("KeyX") || t.slamPressed;
      case "slamHeld": return !!this.keys["KeyX"] || t.slam;
      case "dashPressed": return !!this.pressed("KeyQ") || t.dashPressed;
      case "kickPressed": return this.kickQueued || t.kickPressed;
      case "kickHeld": return this.kickHeld || t.kick;
      // THE BLOCK: M1 and M2 TOGETHER (see `startBlock` in player.js). It is a HELD-only action —
      // there is no press edge, because the chord is made of two buttons that each already have a
      // press of their own and the guard's whole way in is the two of them being down at once. On a
      // touch screen a thumb cannot hold the HIT and GRAB pads and still steer, so the pad gives it
      // its own button instead (`#btnBlock`), which is the one place the two inputs differ.
      case "blockHeld":
        return (this.kickHeld || t.kick) && (this.grabHeld || t.grab) || !!t.block;
      // ...and the GRAB, one button over (see "THE RIGHT-CLICK GRAB" in player.js).
      case "grabPressed": return this.grabQueued || t.grabPressed;
      // ...and the same button HELD, which is what the board's MANUAL is read from (session 200): on
      // a deck the right button is the manual rather than the grab (see `tickRideState` in
      // player/board.js), and a manual is a hold rather than a press.
      case "grabHeld": return !!this.grabHeld || !!t.grab;
      // THE GEAR (see "THE BAG + POCKETS" in inventory.js). E checks what's inside / picks
      // things up; TAB is the pockets — TAP for the 1-second quick menu, HOLD for the full
      // pocket editor. TAB is read raw (held/pressed) because the hold-vs-tap split needs
      // the release edge, which a consumed rising edge cannot give.
      case "interactPressed": return !!this.pressed("KeyE") || !!t.usePressed;
      case "tabPressed": return !!this.pressed("Tab") || !!t.tabPressed;
      case "tabHeld": return !!this.keys["Tab"] || !!t.tab;
      // The dial's own four keys (see "The HUD dial"): the three skills and the ultimate. 1/2/3 are
      // the skills because the three red pills ARE skills 1, 2 and 3 — the retro render toggles that
      // used to live on those keys moved to ALT+1..6 (see main.js), which is the one place in the
      // game's controls that had to give way to make the user's concept work.
      case "skill1Pressed": return !!this.pressed("Digit1") || t.skill1Pressed;
      case "skill2Pressed": return !!this.pressed("Digit2") || t.skill2Pressed;
      case "skill3Pressed": return !!this.pressed("Digit3") || t.skill3Pressed;
      case "ultPressed": return !!this.pressed("KeyR") || t.ultPressed;
      default: return false;
    }
  }

  pressed(code) {
    return !!this.keys[code] && !this.consumed[code];
  }

  frame() {
    // NOTE: `consumed` is deliberately NOT cleared here. postFrame() mirrors the held keys
    // into it, so a "pressed" action is a true rising edge — clearing it here would make
    // every held key report a press on every single frame (auto-repeating jump/dive/etc).
    const mx = this.keys["KeyD"] || this.keys["ArrowRight"] ? 1 : 0;
    const nx = this.keys["KeyA"] || this.keys["ArrowLeft"] ? 1 : 0;
    const mz = this.keys["KeyW"] || this.keys["ArrowUp"] ? 1 : 0;
    const nz = this.keys["KeyS"] || this.keys["ArrowDown"] ? 1 : 0;
    let axisX = mx - nx;
    let axisZ = mz - nz;
    if (axisX === 0 && axisZ === 0 && (this.moveXTouch || this.moveZTouch)) {
      axisX = Math.max(-1, Math.min(1, this.moveXTouch * 1.35));
      axisZ = Math.max(-1, Math.min(1, this.moveZTouch * 1.35));
    } else if (axisX === 0 && axisZ === 0) {
      axisX = this.moveXTouch;
      axisZ = this.moveZTouch;
    }
    return {
      moveX: axisX,
      moveZ: axisZ,
      jumpPressed: this.action("jumpPressed"),
      jumpHeld: this.action("jumpHeld"),
      climbHeld: this.action("climbHeld"),
      climbPressed: this.action("climbPressed"),
      slidePressed: this.action("slidePressed"),
      slideHeld: this.action("slideHeld"),
      divePressed: this.action("divePressed"),
      diveHeld: this.action("diveHeld"),
      slamPressed: this.action("slamPressed"),
      slamHeld: this.action("slamHeld"),
      dashPressed: this.action("dashPressed"),
      kickPressed: this.action("kickPressed"),
      kickHeld: this.action("kickHeld"),
      grabPressed: this.action("grabPressed"),
      grabHeld: this.action("grabHeld"),
      blockHeld: this.action("blockHeld"),
      interactPressed: this.action("interactPressed"),
      tabPressed: this.action("tabPressed"),
      tabHeld: this.action("tabHeld"),
      skill1Pressed: this.action("skill1Pressed"),
      skill2Pressed: this.action("skill2Pressed"),
      skill3Pressed: this.action("skill3Pressed"),
      ultPressed: this.action("ultPressed"),
      lookDX: this.mouseDX,
      lookDY: this.invertY ? -this.mouseDY : this.mouseDY,
    };
  }

  postFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.touch.jumpPressed = false;
    this.touch.slidePressed = false;
    this.touch.divePressed = false;
    this.touch.slamPressed = false;
    this.touch.dashPressed = false;
    this.touch.kickPressed = false;
    this.touch.grabPressed = false;
    this.touch.usePressed = false;
    this.touch.tabPressed = false;
    this.touch.skill1Pressed = false;
    this.touch.skill2Pressed = false;
    this.touch.skill3Pressed = false;
    this.touch.ultPressed = false;
    this.touch.climbPressed = false;
    this.kickQueued = false;
    this.grabQueued = false;
    this.consumed = Object.create(null);
    for (const k in this.keys) this.consumed[k] = this.keys[k];
  }
}
