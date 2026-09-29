// ---------------------------------------------------------------------------
// Part 33 of the `player.js` split: THE FALL'S LIVE MODES.
//
// Moved here from `update`:
//   - `tickSkyfall(dt, grounded, speed2D, hasWish, wx, wz)` — the SKYFALL flag: the drop-to-deck read
//     (`World.topBelow`), the landing brace timed off the time-to-impact, the one-time shape pick, and
//     the standing-down of the whole thing on any other state or on landing.
//   - `tickPlunge(dt, grounded, inp, hasWish, wx, wz)` — THE PLUNGE (held M1 in a skyfall), the dive/slam
//     handover out of the fall, and the dropping of the wall-kick buffer.
//
// Deps: `P`, `approach` (./math.js), `pickFallKind` (./fall.js) and `FALL_BRACE_FADE` (./pose.js).
// The pure fall MATH is still `player/fall.js`; this file is the fall's live bookkeeping. `installSkyfall`
// attaches both methods.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { approach } from "./math.js";
import { pickFallKind } from "./fall.js";
import { FALL_BRACE_FADE, FALL_POSE_FADE } from "./pose.js";

const skyfallMethods = {
  // ---- THE SKYFALL -----------------------------------------------------------------------
  // Past `SKYFALL_DELAY` of airtime, descending, with more than `SKYFALL_MIN_DROP` of clear
  // air under the feet, a fall stops being a jump and becomes a SKYFALL: the body wears one of
  // the six FALL shapes (streetwear.js), picked here by situation (`pickFallKind`) and blended
  // into the landing brace as the deck comes up.
  //
  // The query is the same one the blob shadow makes (`World.topBelow`), so it costs a chunk
  // lookup a frame, and it answers the question the feature actually needs — "how far is it
  // to the deck BELOW me", not "how long have I been in the air" — which is why a fall down
  // the side of a building is a skyfall the whole way down while a hop between two roofs the
  // same height never becomes one. Attaching to a wall keeps the flag (you can skate down a
  // face and carry on into the same shape) but stands the pose down (the wall pose owns the
  // body), and landing or any other state ends it outright.
  tickSkyfall(dt, grounded, speed2D, hasWish, wx, wz) {
    if (this.state !== "air" || grounded) {
      // ...AND WHETHER THE DECK WAS REACHED OUT OF A FALL (session 194 — see `startFreeRoll`): the
      // landing is the one frame the free fall's shape is spent, and the roll-out that replaces the
      // landing brace has to know it was a FALL that arrived. This is that read, taken here (this
      // tick runs BEFORE `tickLanding`) so the flag is already set the frame the feet find the deck.
      this.landedSkyfall = this.skyfall;
      this.skyfall = false;
      this.skyfallT = 0;
      this.fallBrace = 0;
    } else {
      this.landedSkyfall = false;
      const feet = this.pos.y - P.HY;
      this.fallDrop = Math.max(0, feet - this.world.topBelow(this.pos.x, this.pos.z, feet - 0.15, P.SKYFALL_PROBE));
      if (this.skyfall) {
        this.skyfallT += dt;
        // The brace is timed off the TIME TO IMPACT rather than off the height, because that is
        // the number the body can feel: a fast fall braces late and hard, a slow one drifts the
        // last half-second down into the same shape. Easing both ways means a fall that crosses
        // a gap (the deck suddenly a long way down again) takes the brace back off.
        const tImpact = this.fallDrop / Math.max(3.5, -this.vel.y);
        const want = Math.max(0, Math.min(1, (P.SKYFALL_BRACE_T - tImpact) / P.SKYFALL_BRACE_FADE));
        this.fallBrace = approach(this.fallBrace, want, dt / FALL_BRACE_FADE);
      } else if (!this.attached && this.stateTime >= P.SKYFALL_DELAY && this.vel.y < -2 && this.fallDrop >= P.SKYFALL_MIN_DROP) {
        this.skyfall = true;
        this.skyfallT = 0;
        this.fallBrace = 0;
        // The shape is picked ONCE, at the top, from the situation (see `pickFallKind`): what the
        // fall is worth, whether it is being steered or braked, and what the last fall wore.
        this.fallKind = this.fallKindOverride || pickFallKind(
          {
            drop: this.fallDrop,
            spd: speed2D,
            steer: hasWish,
            brake: hasWish && wx * this.vel.x + wz * this.vel.z < -1.5,
          },
          this.fallPrev
        );
        this.fallPrev = this.fallKind;
        this.events.push("skyfall");
      }
    }
  },

  // ---- THE PLUNGE (M1 held in a skyfall — see `P.PLUNGE_*` and `FALL_KINDS.plunge`) --------
  // The user's *"make me if i hold m1 i do dive animtion not a dive forward a dive down i dive
  // down"*. A free fall is the one place in the game where a button has NOTHING to answer to:
  // there is no chain to feed (its gate stands down), no wall to boot (the climb and the kick are
  // both locked out), no guard to raise, no ground to plant a staff in — so M1 is free to be the
  // one thing the fall can actually do, and a body with nothing under it can only dive DOWN. It
  // is a MODE of the skyfall and not a state of its own, on purpose: the fall's own bookkeeping
  // (its shape, its drop-to-deck read, its landing brace, its handover to the deck) carries on
  // unchanged around it, its seventh shape eases in and out on the same limb channels every
  // other shape uses, and letting go above the skyfall's terminal eases back up onto the fall
  // rather than snapping to it. HELD, not pressed: the button IS the dive, so the dive ends the
  // frame it comes up — which is what makes it something you can steer out of at any height.
  tickPlunge(dt, grounded, inp, hasWish, wx, wz) {
    if (this.skyfall && !this.attached && !grounded && inp.kickHeld && !this.plunge) {
      this.plunge = true;
      this.plungeT = 0;
      this.events.push("plunge");
      if (this.sfx) this.sfx.dive();
    }
    if (this.plunge && (!this.skyfall || grounded || !inp.kickHeld)) this.plunge = false;
    if (this.plunge) this.plungeT += dt;
    // ...and THE TWO COMMIT MOVES ARE THE FALL'S NOW (session 138): F is the dive and X is the slam
    // here exactly as they are in any other air — the user's *"make me able to dive and slam in free
    // fall"*. Before this, the held plunge was the ONE thing a body falling off a building could
    // spend the fall on; now the same pair the air offers is offered all the way down. The chain,
    // the skills, the staff and the grab are still refused up here (see `canSkill` and the skyfall
    // gates), and the WALL KICK is still dropped: it answers to a face, and the climb and the kick
    // are locked out for the whole of a fall. The skyfall is stood down on the way in so the fall's
    // own pose and bookkeeping hand the body over cleanly to the dive/slam's own physics.
    if (this.skyfall && !grounded) {
      if (this.diveBuffer > 0 && this.diveCd <= 0) {
        this.skyfall = false;
        this.skyfallT = 0;
        this.fallBrace = 0;
        this.plunge = false;
        this.startDive();
      } else if (this.slamBuffer > 0 && this.slamCd <= 0) {
        this.skyfall = false;
        this.skyfallT = 0;
        this.fallBrace = 0;
        this.plunge = false;
        this.startSlam(hasWish, wx, wz);
      }
    }
    // Anything left over from the fall is DROPPED rather than buffered, so a press that arrived too
    // late cannot fire the frame the feet find the deck (the fall ends with a landing, and the
    // landing is not theirs to take).
    if (this.skyfall) this.kickBuffer = 0;
  },

  // THE SKYFALL'S OWN POSE LAYER (lifted out of `updateVisual`): one of the FALL shapes, held while
  // the fall lasts and blended into the landing brace over its last half second. While M1 has the
  // fall held the shape IS the plunge (`FALL_KINDS.plunge`) — changed on the KIND rather than
  // cross-faded, on `skyfallT`, and driven by the TOTAL speed (a plunge has almost no horizontal).
  solveFallPose(dt, ud, speed) {
    this.fallPose = approach(this.fallPose, this.skyfall && !this.attached ? 1 : 0, dt / FALL_POSE_FADE);
    if (ud && ud.poseFall && this.fallPose > 0.002) {
      ud.poseFall(
        this.fallPose,
        this.plunge ? "plunge" : this.fallKind,
        this.fallBrace,
        this.skyfallT,
        Math.min(1, Math.max(speed, -this.vel.y) / 18)
      );
    }
  },
};

export function installSkyfall(Player) {
  Object.assign(Player.prototype, skyfallMethods);
}
