// ---------------------------------------------------------------------------
// Part 16 of the `player.js` split: THE MACACO — the slide's own M1.
//
// Moved here from player.js:
//   - `canMacaco` — is there a ragdolled body up there to throw?
//   - `startMacaco` — plants the hand and opens the move.
//   - `updateMacaco` — the move's own clock and its one contact.
//
// Deps: `P` (and `approach` from ./math.js), and the body's own fields/methods
// (`slideHitTarget`, `setState`, `facing`, ...). No module-scope scratch.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { approach } from "./math.js";

const macacoMethods = {
  // -------------------------------------------------------------------------
  // THE MACACO — the slide's own M1 (streetwear.js's `poseMacaco`).
  //
  // A slide arrives at a body already moving, so its M1 is not another swing: press it in the
  // moment after the slide has taken a body and the body is still a RAGDOLL OFF THE DECK, and the
  // player plants a hand and whips over it, flinging that body upward. The two conditions are the
  // user's own ("flings the enemy upward if hes ragdolled and not touching the ground") and they
  // are also what makes it a move rather than a button: the only way to have a ragdolled body in
  // the air is to have just taken it there, so the macaco is always the slide's own follow-up.
  //
  // The window (`MACACO_WINDOW`) is kept by `slideContact` on every take, and the body it was on
  // with it — a press that lands later, or on a body that has come back down, is not a macaco and
  // the slide simply carries on.
  // -------------------------------------------------------------------------
  canMacaco() {
    const e = this.slideHitTarget;
    if (!e || !e.built || !e.ragdoll || e.grounded) return false;
    const dx = e.pos.x - this.pos.x;
    const dz = e.pos.z - this.pos.z;
    return Math.hypot(dx, dz) <= P.MACACO_REACH;
  },

  startMacaco(e) {
    this.setState("macaco");
    this.macacoT = 0;
    this.macacoTarget = e;
    this.macacoHitDone = false;
    // It is thrown AT the body it is taking: a macaco is a throw on something already in the air,
    // and that body is behind or beside the slide rather than in front of it.
    const dx = e.pos.x - this.pos.x;
    const dz = e.pos.z - this.pos.z;
    if (Math.hypot(dx, dz) > 0.2) this.facing = Math.atan2(dx, dz);
    this.attackTarget = e;
    // The slide is over — this is its exit — and it does not get to slide again on the way out.
    this.slideCd = 0.35;
    this.attackCd = P.COMBAT_CD;
    this.combo = 0;
    this.comboGrace = 0;
    // It keeps most of the slide's momentum to start with (the body is already travelling when it
    // plants the hand) and then bleeds it at `MACACO_BRAKE` — a skid of a body length or so.
    this.vel.x *= 1 - P.MACACO_UP_PULL;
    this.vel.z *= 1 - P.MACACO_UP_PULL;
    // NO squash on the entry — same reason the slide and the ledge catch have none: `squash` is the
    // rig's own vertical scale, and it scales about the body's ORIGIN (mid-body), so the stretch a
    // throw wants on the plant drives the feet a hand's width through the deck at exactly the two
    // moments the feet are a solved CONTACT on it (see `poseMacaco`'s planted ends). It cost 0.06 u
    // of sole through the pavement at the entry and again at the inversion before it came out.
    if (this.sfx && this.sfx.macaco) this.sfx.macaco();
    this.events.push("macaco");
  },

  // The macaco's own clock: the body comes over the planted hand (the turn and the lift are the
  // rig's, in `updateVisual`), and the legs come through the body the slide took at `MACACO_CONTACT`.
  updateMacaco(dt) {
    this.macacoT += dt;
    this.macacoPose = approach(this.macacoPose, this.state === "macaco" ? 1 : 0, dt / 0.06);
    const u = Math.min(1, this.macacoT / P.MACACO_T);
    if (!this.macacoHitDone && u >= P.MACACO_CONTACT) {
      this.macacoHitDone = true;
      const e = this.macacoTarget;
      // ...and it is only a throw if the body is STILL up there: a body that came down during the
      // move is left alone (the pose still plays out, which is a whiff with a landing).
      if (e && e.built && e.ragdoll && !e.grounded) {
        const dx = e.pos.x - this.pos.x;
        const dz = e.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1e-3;
        // Mostly straight UP: the legs come through from underneath, so the shove is small and the
        // lift does the work (see `MACACO_LIFT`).
        let ux = (dx / d) * 0.35 + Math.sin(this.facing) * 0.65;
        let uz = (dz / d) * 0.35 + Math.cos(this.facing) * 0.65;
        const n = Math.hypot(ux, uz) || 1;
        ux /= n;
        uz /= n;
        const landed = e.hit("flight", ux, uz, P.MACACO_KNOCK, P.MACACO_STUN, {
          dmg: P.MACACO_DMG,
          ragdoll: true,
          force: true,
          lift: P.MACACO_LIFT,
        });
        if (landed) {
          this.lastMacacoHit = { x: e.pos.x, y: e.pos.y + P.HY * 0.9, z: e.pos.z, power: 1 };
          this.events.push("macacohit");
          this.hitstop = Math.max(this.hitstop, P.CLASH_STOP);
        }
      }
    }
    if (this.macacoT >= P.MACACO_T) {
      this.setState(this.grounded ? "ground" : "air");
      this.macacoTarget = null;
    }
  },

  // ---- the macaco (the slide's own M1) ----
  // A press while sliding is the macaco, and only while the slide's last take is still fresh AND
  // the body it took is still a ragdoll in the air (see `canMacaco`). Checked here, between the
  // slide's own exits and everything else, because it IS the slide's exit: nothing else in the
  // game reads a press while sliding, so this is the only press the state has.
  tickMacacoEntry(inp) {
    if (this.state === "slide" && inp.kickPressed && this.slideHitT > 0 && this.canMacaco()) {
      this.startMacaco(this.slideHitTarget);
    }
  },

  // THE MACACO'S OWN SHAPE (lifted out of `updateVisual`), which the slide's M1 turns into. A single
  // absolute pose on the move's own clock (`macacoT` over `MACACO_T`).
  solveMacacoPose(ud) {
    if (ud && ud.poseMacaco && this.state === "macaco") {
      ud.poseMacaco(Math.min(1, this.macacoT / P.MACACO_T));
    }
  },
};

export function installMacaco(Player) {
  Object.assign(Player.prototype, macacoMethods);
}
