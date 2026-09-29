// ---------------------------------------------------------------------------
// THE RUNNING VAULT (parts 9 and 24 of the player.js split).
//
// The four methods of the vault: which way over (`vaultPickKind`), the read that
// finds the low box on the run line (`vaultTarget` / `vaultSlab`), and the
// crossing itself (`startVault`), in a table `installVault` copies onto
// `Player.prototype`. The per-frame cross-fade and the whole-rig turn stay in
// `player.js`'s `updateVisual`.
//
// Part 24 added `vaultLift` (below) with its `VAULT_RISE`/`VAULT_DROP` profile:
// it was left in player.js in part 9 because BOTH `update` and `updateVisual`
// call it, and it is imported back from here now.
//
// A LEAF with respect to player.js: it imports `P` (player/config.js) and
// `approach` (player/math.js), and it carries `VAULT_KIND`/`VAULT_TURN_APEX` with
// it — neither is read anywhere outside the vault (the `updateVisual` line that
// names `VAULT_KIND` is a comment), so there is no export back.
//
// SESSION 197 — TWO STYLES, AND A PACE. The vault wears two ways over now (`VAULT_KIND`: the plain
// sweep the user calls the *"jump over"*, and the front flip), its crossing is timed off the speed
// the body arrived with (`VAULT_PACE`, in `P`) instead of by a duration of its own, and the whole
// shape is SPENT BEFORE THE WALL IS BEHIND HIM — the revolution and the tuck are both done by
// `VAULT_SQUARE` (streetwear.js), so the last third of the crossing is an arrival rather than the
// tail of a flip. The ask, verbatim: *"make the vault has only front flip animation and jump over
// animation and make it get done before the wall not when i direnctly touch the wall and make it
// fluent and it doesnt have to be super fast and snapy make it match the palyer speed but faster"*.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { TAU, approach } from "./math.js";
import { VAULT_POSE_FADE, VAULT_POSE_FADE_OUT } from "./pose.js";

// WHICH WAY OVER (keep in sync with `VAULT_KIND` in streetwear.js, which owns the poses and the
// rig-turn curves): TWO styles, and no others (session 197 — see the header). The kind is picked off
// the run in `startVault` and it is the same number on both sides of the seam.
//
//   SPEED  the hand-plant sweep — the running jump OVER the box (the user's *"jump over animation"*)
//   FRONT  the kong — both hands down, the knees through the chest, a whole forward revolution
//
// The other three (a side flip, a handstand and a cartwheel) are GONE — the user's *"make the vault
// has only front flip animation and jump over animation"*. They were deleted outright (the poses,
// their `vaultTurn` branches and their `VAULT_TURN_APEX` entries) rather than left unreachable,
// because a style that can never be picked is a style nobody can see break.
export const VAULT_KIND = { SPEED: 0, FRONT: 1 };
// ...and how much EXTRA height a flipping vault wants over a plain sweep: a flip turns the whole
// body about its middle, so the head and the feet swing a body's half-length below the hips at
// the worst of it, and the plain `VAULT_CLEAR` is not enough room for them over the box top.
const VAULT_TURN_APEX = { 1: 0.30 };

const vaultMethods = {

  // ------------------------------------------------------------------
  // THE RUNNING VAULT (see `P`'s `VAULT_*` block)
  //
  // Read straight off the colliders rather than off `senseWalls`: a wall for the WALL moves is a
  // tall face whose middle overlaps the body, and this is the opposite — a LOW box the body is
  // about to cross, whose top sits in the vault's band and whose depth is short enough to clear.
  //
  // The catch is the RUN ITSELF: the line the body is travelling down is cast through each
  // obstacle (`vaultSlab`), and a vault is offered wherever that line crosses a low box. It used to
  // be cast per AXIS — the near face had to be an X face or a Z face and the body had to be running
  // into it square — which meant a vault only ever read from the two cardinal directions and a
  // diagonal run at a corner simply stopped at it. A ray has no such favourite: the body crosses
  // wherever it is going, through a face, a corner or a long side, and the pose, the plant and the
  // facing all follow the run.
  //
  // WHICH WAY OVER (see `VAULT_KIND`). An even coin between the two, and never the same style twice
  // running, so a run of rails reads as a repertoire rather than as one move on loop. The coin was
  // weighted 3:2 toward the sweep when there were five styles; with two there is nothing to favour,
  // because the user named BOTH of them.
  vaultPickKind() {
    let kind = Math.random() < 0.5 ? VAULT_KIND.SPEED : VAULT_KIND.FRONT;
    if (kind === this.vaultLastKind) kind = VAULT_KIND.SPEED + VAULT_KIND.FRONT - kind;
    this.vaultLastKind = kind;
    return kind;
  },

  // Returns { x, y, z, dx, dz, px, pz, topY, side, gap, chord } — where the body comes down, the
  // direction it is crossing on, the point the hand plants (the near edge of the obstacle, at any
  // angle), how high its top is, and which shoulder the plant goes over — or null when there is
  // nothing here worth vaulting.
  vaultTarget() {
    const feet = this.pos.y - P.HY;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp < P.VAULT_MIN_SPEED) return null;
    const dx = this.vel.x / sp;
    const dz = this.vel.z / sp;
    const cols = this.colliders;
    let best = null;
    let bestGap = Infinity;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const rise = c.maxY - feet;
      if (rise < P.VAULT_MIN_TOP || rise > P.VAULT_MAX_TOP) continue;
      const cx = (c.minX + c.maxX) * 0.5;
      const cz = (c.minZ + c.maxZ) * 0.5;
      // The run vs the obstacle INFLATED by the capsule's own half-extents, so it is the BODY that
      // clears the box and not just the point at its centre. `t0` is the signed distance along the
      // run to the near side (negative once the body already straddles it) — the catch's own gap,
      // in the same sense `senseWalls` means it.
      const wide = this.vaultSlab(c.minX - this.hx, c.maxX + this.hx, c.minZ - this.hz, c.maxZ + this.hz, dx, dz);
      if (!wide) continue;
      const gap = wide.t0;
      if (gap > P.VAULT_PAD || gap < -P.VAULT_OVERLAP) continue;
      // ...and the RAW obstacle: how much of the run actually crosses it. That is the distance a
      // vault has to cover, so it is what the depth test is run on — a line that only glances along
      // a long box spends far too much of itself inside it to be a vault, whatever the angle.
      const raw = this.vaultSlab(c.minX, c.maxX, c.minZ, c.maxZ, dx, dz);
      if (!raw) continue;
      const chord = raw.t1 - raw.t0;
      if (chord > P.VAULT_MAX_DEPTH) continue;
      // Where the body comes down: to the far inflated side, plus a landing pad, measured from HERE
      // along the run. (For a square approach this is exactly the old `gap + depth + 2·half`.)
      const travel = wide.t1 + P.VAULT_LAND;
      const lx = this.pos.x + dx * travel;
      const lz = this.pos.z + dz * travel;
      // WHERE THE HAND GOES DOWN: where the run first meets the obstacle, on its top — the near
      // edge, at any angle. (For a square approach this is the face the old code named.)
      const plantT = Math.max(0, raw.t0);
      const px = this.pos.x + dx * plantT;
      const pz = this.pos.z + dz * plantT;
      // Where the body comes down. Level, normally — but the far side may be a step UP (a vault
      // ONTO something), in which case a landing at the height it started from would put it inside
      // the surface. So two candidates are tried: the level landing, then the obstacle's own top
      // (a platform the vault's height already reaches). Anything taller than the band is a wall,
      // and is refused.
      const topY = Math.max(c.maxY, 0);
      let ly = -1;
      const cands = [this.pos.y, topY + P.HY];
      for (let k = 0; k < cands.length; k++) {
        const cand = cands[k];
        if (cand > this.pos.y + P.VAULT_MAX_TOP + 0.001) continue;
        if (this.spaceFree(lx, cand, lz)) { ly = cand; break; }
      }
      if (ly < 0) continue;
      // ...and the apex has to be clear too, or the vault would turn the body through the box.
      const riseTo = Math.max(topY, ly - P.HY);
      if (!this.spaceFree((this.pos.x + lx) * 0.5, riseTo + P.HY + P.VAULT_CLEAR, (this.pos.z + lz) * 0.5)) continue;
      // Which shoulder the plant goes over: the box sits on the side the body is NOT straddling, so
      // the free hand is the one further from it — the plant reads as crossing the near corner.
      const side = Math.abs(this.pos.x - cx) >= Math.abs(this.pos.z - cz) ? (this.pos.z > cz ? 1 : -1) : (this.pos.x > cx ? 1 : -1);
      const g = Math.max(0, gap);
      if (g >= bestGap) continue;
      bestGap = g;
      best = { x: lx, y: ly, z: lz, dx, dz, px, pz, topY, side, gap: g, chord };
    }
    return best;
  },

  // Ray vs an axis-aligned box in the horizontal plane: the two distances along the run where the
  // line enters and leaves it. Null when the line misses entirely. Written as the plain slab test
  // so a run down ANY direction crosses through a face, a corner or a side with no special case —
  // which is the whole point of the vault reopening off the run rather than off an axis.
  vaultSlab(minX, maxX, minZ, maxZ, dx, dz) {
    let t0 = -Infinity;
    let t1 = Infinity;
    if (Math.abs(dx) < 1e-6) {
      if (this.pos.x < minX || this.pos.x > maxX) return null;
    } else {
      let a = (minX - this.pos.x) / dx;
      let b = (maxX - this.pos.x) / dx;
      if (a > b) { const s = a; a = b; b = s; }
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
    }
    if (Math.abs(dz) < 1e-6) {
      if (this.pos.z < minZ || this.pos.z > maxZ) return null;
    } else {
      let a = (minZ - this.pos.z) / dz;
      let b = (maxZ - this.pos.z) / dz;
      if (a > b) { const s = a; a = b; b = s; }
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
    }
    if (t0 > t1) return null;
    return { t0, t1 };
  },

  startVault(t) {
    this.setState("vault");
    this.vaultFrom = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    this.vaultTo = { x: t.x, y: t.y, z: t.z };
    this.vaultTop = t.topY;
    this.vaultNx = t.nx;
    this.vaultNz = t.nz;
    this.vaultSide = t.side;
    this.vaultT = 0;
    // THE RUN THE VAULT IS MADE FROM. The crossing covers `d` units in `d / (speed · VAULT_PACE)`
    // seconds: the pace is the speed the body ARRIVED with, times `VAULT_PACE` — the user's *"make it
    // match the palyer speed but faster"*. A jog gets a jog's vault and a sprint gets a sprint's, and
    // neither is a fixed number of frames; the two clamps are a net (see `P.VAULT_MIN_DUR`), not the
    // shape of the move. It used to be `d / max(7, speed)` under a 0.30 s ceiling, and that CEILING is
    // what the user was feeling: it turned every slow vault into a fast one (a 6.2 u/s run crossed at
    // 9.8 u/s), which is the *"super fast and snapy"* this is free of. The landing still comes off at
    // `VAULT_EXIT` of the arrival — a vault costs almost nothing, which is the whole point: it is a
    // parkour move, not a stumble.
    const d = Math.hypot(this.vaultTo.x - this.vaultFrom.x, this.vaultTo.z - this.vaultFrom.z);
    this.vaultSpeed = Math.hypot(this.vel.x, this.vel.z);
    const pace = Math.max(P.VAULT_MIN_SPEED, this.vaultSpeed * P.VAULT_PACE);
    this.vaultDur = Math.max(P.VAULT_MIN_DUR, Math.min(P.VAULT_MAX_DUR, d / pace));
    this.vaultCd = P.VAULT_CD;
    // WHICH WAY OVER (see `VAULT_KIND`): picked off the run, so the crossing reads as a response
    // to how the body ARRIVED rather than as one animation on a loop, and the flipping styles get
    // the extra headroom they need to turn in.
    this.vaultKind = this.vaultPickKind();
    this.vaultApex = VAULT_TURN_APEX[this.vaultKind] || 0;
    this.attached = false;
    this.attachMode = null;
    this.wallSliding = false;
    this.climbing = false;
    this.wallRunning = false;
    this.wallStick = 0;
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.prevGrounded = false;
    this.jumpsLeft = P.AIR_JUMPS;
    this.fallPeakY = this.pos.y;
    // Facing follows the run, which is the line the vault crosses on — read off the catch's own
    // direction (`t.dx`/`t.dz`) rather than the from→to chord, so the body faces down the line it
    // is actually travelling even when that line crosses the box at an angle.
    const fx = t.dx !== undefined ? t.dx : this.vaultTo.x - this.vaultFrom.x;
    const fz = t.dz !== undefined ? t.dz : this.vaultTo.z - this.vaultFrom.z;
    this.facing = Math.atan2(fx, fz);
    // ...and WHERE THE HAND GOES DOWN. The plant is a contact, so it cannot be guessed at from the
    // pose: it is the top of the box, a body's half-width in from the face the vault is crossing —
    // `t.gap` is the gap the catch fired at and `this.hx` the capsule's own half-width, which is
    // exactly the distance from the body's centre to that face. The FX hang off this point (see the
    // `vault` block in main.js), which is what lets the puff of dust land ON the rail rather than in
    // the air beside it.
    if (t.px !== undefined) {
      // ...at any angle: the catch hands back the point where the run first meets the obstacle.
      this.vaultPlantAt = { x: t.px, y: (t.topY || 0) + 0.05, z: t.pz };
    } else {
      const gp = Math.max(0, t.gap || 0) + this.hx;
      this.vaultPlantAt = {
        x: this.vaultFrom.x + Math.sin(this.facing) * gp,
        y: (t.topY || 0) + 0.05,
        z: this.vaultFrom.z + Math.cos(this.facing) * gp,
      };
    }
    // A WHISPER of weight on the hand, and nothing more. The plant used to squash 0.26 AND stop the
    // whole world for `VAULT_STOP` 0.055 s (the hitstop block in main.js) — a STRIKE's vocabulary,
    // not a parkour move's, and the user's *"the vault has like impact heavy impact gng dont make it
    // like that make it smooth and fluent"*. The hand still goes down and the body still folds over
    // it — that is the POSE's job and none of it is touched — but the crossing now carries its
    // weight through its own arc alone, with no freeze and no snap.
    this.squash = 0.10;
    if (this.sfx) this.sfx.mantle();
    this.events.push("vault");
  },

  // ---- THE RUNNING VAULT (see `vaultTarget` / `startVault`) ----
  // A LOW box taken at a run, checked here — off the deck, off the way, with the run in hand —
  // and not asked for with a key, because a vault is a thing that happens to you. It is tested
  // AFTER the wall moves so a wall's own business (slide, climb, ledge) keeps first refusal, and
  // it is gated on `jumpBuffer <= 0` so a jump pressed at the box is a jump over it rather than
  // being eaten by the vault. `VAULT_PAD` lets it fire a running frame before the face, so the
  // move opens on the speed it was made from instead of the stopped frame a collision leaves.
  tickVaultEntry(grounded, speed2D) {
    if (grounded && this.state === "ground" && this.jumpBuffer <= 0 && this.vaultCd <= 0 && speed2D >= P.VAULT_MIN_SPEED) {
      const vt = this.vaultTarget();
      if (vt) this.startVault(vt);
    }
  },

  // THE RUNNING VAULT (see `startVault`). A scripted arc across a low box: the body travels
  // the run's own line from `vaultFrom` to `vaultTo` on a smoothstep, lifted over the top by
  // a sine whose apex sits on the middle of the crossing — so the plant and the swing-through
  // happen where the box actually is. It does not collide (see `update`), because arriving —
  // and only arriving — is the promise: a capsule that clipped the box would stop dead on it.
  tickVaultState(dt) {
        this.vaultT += dt;
        const k = Math.min(1, this.vaultT / this.vaultDur);
        const e = k * k * (3 - 2 * k);
        const f = this.vaultFrom;
        const t = this.vaultTo;
        this.pos.x = f.x + (t.x - f.x) * e;
        this.pos.z = f.z + (t.z - f.z) * e;
        const apexY = this.vaultTop + P.HY + P.VAULT_CLEAR + (this.vaultApex || 0);
        const h = Math.max(0, apexY - (f.y + t.y) * 0.5);
        this.pos.y = f.y + (t.y - f.y) * e + h * vaultLift(k);
        this.vel.set(0, 0, 0);
        this.grounded = false;
        if (k >= 1) {
          this.pos.set(t.x, t.y, t.z);
          // The landing comes off the run with almost all of it (see `VAULT_EXIT`): a vault you
          // could not chain out of would be a stumble dressed as a parkour move. ...and a FAST
          // crossing comes off with MORE than it went in with (see `VAULT_EXIT_BONUS`): the vault
          // pays a dividend for speed, so a well-set-up run over a rail is a way of keeping momentum
          // rather than a way of spending it. Below `VAULT_EXIT_REF` it is the flat share and
          // nothing else, so a slow vault is still just a vault.
          const fast = Math.max(0, Math.min(1, (this.vaultSpeed - P.VAULT_EXIT_REF) / (P.VAULT_EXIT_FULL - P.VAULT_EXIT_REF)));
          const spd = this.vaultSpeed * (P.VAULT_EXIT + P.VAULT_EXIT_BONUS * fast);
          this.vaultBonus = fast;
          this.vel.x = Math.sin(this.facing) * spd;
          this.vel.z = Math.cos(this.facing) * spd;
          // ...and a WHISKER of sink, so the ground's own test actually sees the body arrive. The
          // floor marks a body grounded by `pos.y - HY < floor` — strictly below it (see `moveAxis`)
          // — and a body PLACED exactly on the surface with no vertical velocity sinks by nothing.
          // So `moveAndCollide`, which runs later in the same frame and starts by clearing
          // `grounded`, took it straight back off the deck the crossing had just put it on: the
          // state flipped to `air`, the body fell a couple of centimetres, and it LANDED again a
          // frame or two later wearing the GENERIC landing's absorb — and, off a box tall enough
          // that the vault's own apex is over `DROP_IMPACT_MIN` above the far deck, the generic
          // thud, squash and dust read off a drop the body never took. That was the whole of the
          // user's *"the vault has like impact heavy impact"*: a parkour move that ended in a hop it
          // never made. Twenty millimetres is under three frames of fall and is gone on landing.
          this.vel.y = -0.02;
          this.throttle = 1;
          this.grounded = true;
          this.prevGrounded = true;
          this.setState("ground");
          this.jumpsLeft = P.AIR_JUMPS;
          // ...and it FLOWS out of itself. A small squash and NO landing absorb (`landPose` 0), so
          // the shape the crossing ended in hands straight over to the run instead of the body
          // dropping into a crouch and standing back up — a vault is a stride, not a fall. The plain
          // landing thud is gone with it: `vaultend` (below) already plays the vault's OWN exit
          // sound, and the two together were reading as a slam on the far side of every rail.
          this.squash = 0.10;
          this.landTimer = 0;
          this.landT = 0;      // ...`landPose` is driven off `landT`, so both have to be cleared for
          this.landPose = 0;   // "no absorb" to be true even if a landing was still on the clock
          this.vaultCd = P.VAULT_CD;
          this.mantleExit = null;
          this.events.push("vaultend");
        }
        return;
  },

  // THE RUNNING VAULT'S OWN POSE LAYER (lifted out of `updateVisual`). It rides the crossing's own
  // clock, so the plant and the swing-through land where the box is (`vaultSide` is which shoulder
  // the plant goes over) — and it drives the crossing's own WHOLE-RIG TURN as well: a flipping style
  // is a rig rotation first and a pose second, driven off the same clock (`vaultK`), squared up here
  // after the vault so an interrupted one can never leave the body parked at half a revolution.
  solveVaultPose(dt, ud, pitch) {
    // ...and the crossing's own WHOLE-RIG TURN (see `vaultTurn` / `VAULT_KIND`): a flipping
    // style is a rig rotation first and a pose second. Driven off the same clock the pose is
    // (`k`), so the turn and the shape cannot disagree, and it is a WHOLE turn by `VAULT_SQUARE`
    // — the beat the user means by *"make it get done before the wall"*: the revolution is spent
    // while the body is still at the TOP of the crossing (the vertical only starts to drop at 0.74
    // of the clock), so the flip is square before the wall's far side and the whole descent is an
    // arrival rather than the tail of a turn. Squared up here after the vault so an interrupted
    // one can never leave the body parked at half a revolution.
    const vaultK = Math.min(1, this.vaultT / (this.vaultDur || 1));
    if (this.state === "vault") {
      const turn = ud && ud.vaultTurn ? ud.vaultTurn(this.vaultKind, vaultK, this.vaultSide) : null;
      if (turn) { this.vaultFlip = turn.flip; this.vaultRoll = turn.roll; }
    } else if (this.vaultFlip || this.vaultRoll) {
      const ff = Math.round(this.vaultFlip / TAU) * TAU;
      const fr = Math.round(this.vaultRoll / TAU) * TAU;
      this.vaultFlip += (ff - this.vaultFlip) * Math.min(1, dt * 10);
      this.vaultRoll += (fr - this.vaultRoll) * Math.min(1, dt * 10);
      if (Math.abs(ff - this.vaultFlip) < 0.02) this.vaultFlip = 0;
      if (Math.abs(fr - this.vaultRoll) < 0.02) this.vaultRoll = 0;
    }
    // In fast, out slow: the plant has to BE the first frame, but the far side is a run, and a shape
    // that vanished in 60 ms there would pop on exactly the beat the user asked to flow.
    const vFade = this.state === "vault" ? VAULT_POSE_FADE : VAULT_POSE_FADE_OUT;
    this.vaultPose = approach(this.vaultPose, this.state === "vault" ? 1 : 0, dt / vFade);
    if (ud && ud.poseVault && this.vaultPose > 0.002) {
      // ...and the pose is handed the rig's OWN pitch (the body lean PLUS the vault's turn) — the
      // seam's fifth argument, which neither of the two styles left reads (the handstand that had to
      // counter-rotate its palms is gone). It stays because the seam's shape is part of how a vault
      // style is written, and a shape that has to hold a contact through a turn needs it.
      ud.poseVault(this.vaultPose, vaultK, this.vaultSide, this.vaultKind, pitch + this.vaultFlip);
    }
  },
};

export function installVault(Player) {
  Object.assign(Player.prototype, vaultMethods);
}

// ---------------------------------------------------------------------------
// Part 24 of the split: `vaultLift` and the vertical profile it is built on.
// It was left behind when the vault's methods moved (part 9) because BOTH `update`
// and `updateVisual` call it; it is owned here now and imported back by player.js.
// ---------------------------------------------------------------------------
// THE VAULT'S VERTICAL PROFILE (see the `vault` case in `update`). A tent, not a sine: the body
// RISES onto the crossing, HOLDS at full height over the box, then DROPS off the far side. A sine
// is still low at the two moments the body's box overlaps the obstacle's — the near and far top
// corners — and it clips them by 15-30cm; the plateau between these two ramps clears the whole box.
const VAULT_RISE = 0.26;  // the share of the crossing the rise takes
const VAULT_DROP = 0.26;  // ...and the share the drop takes (the rest is the hold over the box)

export function vaultLift(k) {
  const up = Math.min(1, k / VAULT_RISE);
  const dn = Math.min(1, (1 - k) / VAULT_DROP);
  const a = up * up * (3 - 2 * up);
  const b = dn * dn * (3 - 2 * dn);
  return Math.min(a, b);
}
