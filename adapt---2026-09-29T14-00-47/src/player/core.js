// ---------------------------------------------------------------------------
// Part 22 of the `player.js` split: THE SMALL CORE METHODS.
//
// A batch of the book-keeping methods that were still inline in `player.js`, moved
// together because each is small and self-contained:
//   - `loadCharacter` / `hasCharacter` — building the rig and asking for it.
//   - `airComboGravity` — the juggle's own (asymmetric) gravity.
//   - `tickAirComboHand` — from part 86: the player's deck handed to every juggled
//     body as its floor, written and cleared each frame.
//   - `setState` — the one choke point every state change goes through (it is what
//     releases a whirl/capo/wallbeat/scissor hold when something else takes the body).
//   - `moveTarget` / `lockMoveMul` — the speed the legs pull FOR, and SHIFT LOCK's
//     strafe penalty.
//
// The `get airComboOpen` accessor deliberately STAYS on the class in `player.js`
// (a getter cannot ride an `Object.assign` table — assign would copy its VALUE once).
//
// Deps: `P` from ./config.js, `buildPlayerCharacter` from ../charmodel.js and
// `disposeTree` from ../geom.js. Nothing else.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { buildPlayerCharacter } from "../charmodel.js";
import { disposeTree } from "../geom.js";

const coreMethods = {
  async loadCharacter(mode = this.charMode) {
    this.charMode = mode;
    const token = ++this.charLoad;
    let group = null;
    try {
      group = await buildPlayerCharacter(mode, { height: P.HY * P.BODY_RATIO, footY: -P.HY });
    } catch (e) {
      group = null;
    }
    if (token !== this.charLoad) {
      if (group) disposeTree(group);
      return false;
    }
    if (!group) return false;
    if (this.charMesh) {
      this.charCtn.remove(this.charMesh);
      disposeTree(this.charMesh);
    }
    this.charMesh = group;
    this.charCtn.add(group);
    this.mesh.visible = false;
    return true;
  },

  hasCharacter() {
    return !!this.charMesh;
  },

  // THE AIR COMBO'S OWN GRAVITY — the one place the juggle's float is defined (the air state, the
  // attack state and the capoeira's own kick phase all call it, so they cannot disagree about how
  // high the string hangs). It is ASYMMETRIC on purpose (see `P.AIR_COMBO_G`): the RISE is a plain
  // gravity, so the launch pops like a launch, and only the FALL is held — a fraction of gravity
  // followed by a TERMINAL VELOCITY. A symmetric float weak enough to buy the same hang time would
  // turn the pop into a balloon and carry the whole thing off the top of the screen.
  airComboGravity(dt) {
    if (!this.airComboOpen || this.vel.y > 0) {
      this.vel.y -= P.GRAVITY * dt;
      return;
    }
    // THE FALL IS THE ONE THING THE BULLET TIME OWNS ABOUT HIM (see `this.fallScale`). The slow time
    // is the world's — his attacks come out at the speed they always do — but the user asked for his
    // DESCENT to hang along with it (*"slow ... my fall speed"*), so the float's fall is integrated
    // on the scaled step while everything above it in his own update is not. The rise is deliberately
    // NOT scaled: the pop is the pop, and it is what puts him up where the juggle happens.
    const fd = dt * this.fallScale;
    this.vel.y -= P.GRAVITY * P.AIR_COMBO_G * fd;
    // The terminal is applied the way the skyfall's is (gravity is cancelled as the cap is eased
    // in), because a plain clamp would have gravity fighting the cap frame for frame.
    if (this.vel.y < -P.AIR_COMBO_FALL) {
      const over = -P.AIR_COMBO_FALL - this.vel.y;
      this.vel.y = -P.AIR_COMBO_FALL + Math.min(0, over) * Math.max(0, 1 - fd * 6);
    }
  },

  setState(s) {
    if (this.state === s) return;
    // The one choke point every state change goes through, which is why the whirl's own release
    // lives here: if something OUTSIDE the move takes the body over mid-whirl — the launch pad's
    // flight, a ledge grab, a wall run — the move's clock stops with the state and `updateWhirl`
    // never runs again, so the neck it was holding would stay held for the whole of the carry's
    // stun. `releaseWhirl` is idempotent, so `endWhirl`'s own call is harmless.
    if (s !== "whirl" && this.whirlTarget) this.releaseWhirl();
    // ...and the body the LAUNCH is carrying, for the same reason: anything that takes the body over
    // mid-carry (the launch pad, a ledge, a death) has to put it down rather than hold it with a
    // `capoCarry` no one is writing any more. Also idempotent.
    if (s !== "capo" && this.capoCarryTarget) this.releaseCapoCarry();
    // (THE POLE is deliberately NOT released here any more. The staff is a CARRY, not a move: it
    // rides the rig across the run, the jump and every other state exactly the way the tote's duffel
    // does, so a state change is not a reason to put it down. The old `if (s !== "pole")
    // releasePole()` existed because the form owned the prop; the only thing left in the game that
    // puts a staff BACK rather than breaking it is a respawn (the throw and the launch both go
    // through `poleBreak`).)
    // ...and THE WALL CLINCH's pin, for exactly the same reason: anything that takes the body over
    // mid-hold — a knock, a death, the launch pad, a respawn — has to let the skull go, or a body
    // would be left pressed into a wall with nobody holding it. Idempotent.
    if (s !== "wallbeat" && this.wallBeatTarget) this.releaseWallBeat();
    // ...and THE HEAD SCISSOR's grip, for exactly the same reason again: the victim is held OFF
    // its feet by the pin (see `scissorGrip`), so anything that takes the body over mid-swing — a
    // knock, a death, the launch pad, a respawn — has to put it down. Idempotent.
    if (s !== "scissor" && this.scissorTarget) this.releaseScissor();
    // ...and the guard's own LATCH, for the same reason: the toggle is a property of the STANCE,
    // so anything that takes the body out of it (a jump, a knock, a skill) ends the toggle with
    // it. A block that is being HELD is untouched — the latch is only ever true while the buttons
    // are up, and the hold keeps the guard up on its own.
    if (s !== "block") this.guardLatch = false;
    this.state = s;
    this.stateTime = 0;
  },

  moveTarget() {
    const base = P.RUN_MIN + (P.SPRINT - P.RUN_MIN) * this.throttle;
    // Overdrive (the ultimate, see `overdrive`): the run's own target is the one place the speed
    // the body builds toward comes from, so this is where a speed boost belongs — it raises the
    // speed the legs are pulling FOR without touching `MAX_SPEED`, which stays the hard ceiling
    // every other speed gain already answers to.
    const over = this.overT > 0 ? 1 + P.OVER_SPEED : 1;
    // ...and THE POLE'S WEIGHT (`POLE_CARRY_MUL`, the brief's *"it has its weight it can slow me
    // down a bit"*). It is one multiplier on the one number every ground speed in the game reads, so
    // the run, the build-up, the braked turn and the slope-climb carry all pay it together and
    // nothing has to know the staff exists — the legs simply pull for a little less. 0.86 of a
    // 10.9 `SPRINT` is **9.38 u/s**, i.e. carrying the staff costs 1.5 u/s off a full sprint.
    const carry = this.holdingPole() ? P.POLE_CARRY_MUL : 1;
    // Crouched, the build-up still runs (so standing back up resumes where you were) but the
    // cap is the crouch walk.
    return this.crouching ? Math.min(base * carry, P.CROUCH_SPEED) : base * over * carry;
  },

  // SHIFT LOCK's own half of the walk: with the lock on, the body is pinned on the camera's line,
  // so the only thing A/D/S can do is move it OFF that line — and they are what cost speed (see
  // `P.LOCK_STRAFE_MUL`). The multiplier is read off the FORWARD SHARE of the raw input rather than
  // off the keys, so W is untouched, W+A splits the difference, and a dead-side step or a backpedal
  // pays the full share. With the lock off this is 1 and nothing else in the game ever sees it.
  lockMoveMul(inp) {
    if (!this.shiftLock || !inp) return 1;
    const wl = Math.hypot(inp.moveX, inp.moveZ);
    if (wl < 0.02) return 1;
    // `moveZ` is +1 dead ahead (W), 0 straight sideways (A/D) and -1 dead astern (S).
    const fwd = Math.max(0, inp.moveZ / wl);
    return P.LOCK_STRAFE_MUL + (1 - P.LOCK_STRAFE_MUL) * fwd;
  },


  // ---- the AIR COMBO's hand on the body (see `P.AIR_COMBO_G`) ----
  // The player's own deck handed to every juggled body as its floor, written and CLEARED every frame.
  tickAirComboHand() {
    // The juggle only works if the body comes UP with the player instead of falling away from him,
    // so for as long as the window is open — and only while the body is off the deck and still
    // jugglable — the player's own altitude is handed to `enemies.js` as the body's floor: the
    // user's *"make the air combo make the enemy Y the same as the player but in a smooth motion"*.
    // Written EVERY frame and CLEARED every frame (like `carryOrbit`), so the moment the window
    // shuts the body drops out of the sky on its own again. A LIMP body rides it too: the LAUNCH's
    // kick ragdolls what it catches, so the body the launch was thrown for is a ragdoll — and if it
    // were left out here the juggle would have nothing to hold up (see `attackContact`).
    if (this.enemies && this.enemies.spawned) {
      const open = this.airComboOpen;
      const deck = this.pos.y - P.HY;
      for (const e of this.enemies.list) {
        if (!e.built) continue;
        e.comboY = open && !e.grounded ? deck : null;
      }
    }
  },
};

export function installCore(Player) {
  Object.assign(Player.prototype, coreMethods);
}
