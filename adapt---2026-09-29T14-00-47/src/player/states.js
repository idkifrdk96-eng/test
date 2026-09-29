// ---------------------------------------------------------------------------
// THE LOCOMOTION STATES (part 36 of the player.js split).
//
// The big bodies of `update`'s state machine that are pure locomotion: how the body
// drives itself while it is `ground` (the throttle, the steering grip, the wish
// acceleration and the overspeed brake, then the deck's pull and its gate), and what
// a `slide` does to the line it is carrying (the hold, the carve, the squeeze's pay,
// the drain tail, the slope pull). Both were carved out of the `switch (this.state)`
// in `update` — the switch now calls `tickGroundState` / `tickSlideState` at the exact
// spot each body ran, with the host frame's locals (`dt`, `inp`, `hasWish`, `wx`, `wz`)
// handed over as arguments, so the simulation is exactly what it was.
//
// THE BODIES ARE VERBATIM, at their original indentation — they read only `P`, the three
// motion helpers (`accelerate` / `applyFriction` / `bleedSpeed`, from player/physics.js)
// and `wrapPi` (player/math.js), plus the player's own methods (`moveTarget`, `lockMoveMul`,
// `deckGrip`, `slopePull`, `slopeGate`), all of which live in tables installed on the
// prototype beside this one.
//
// Not a leaf: it imports player/physics.js and player/math.js, both of whom are leaves
// with respect to player.js, so no cycle is formed.
// ---------------------------------------------------------------------------
import { P, RUN_STRIDE } from "./config.js";
import { wrapPi, swingTowards, approach } from "./math.js";
import { DASH_POSE_FADE, SLIDE_POSE_FADE, CROUCH_POSE_FADE } from "./pose.js";
import { accelerate, applyFriction, bleedSpeed } from "./physics.js";

const stateMethods = {

  tickGroundState(dt, inp, hasWish, wx, wz) {
        if (hasWish) {
          this.throttle = Math.min(1, this.throttle + dt / P.BUILD_TIME);
        } else {
          this.throttle = Math.max(0, this.throttle - dt / P.BUILD_DECAY);
        }
        // ...and SHIFT LOCK's own half of the walk: with the lock on, a side-step or a backpedal
        // costs `LOCK_STRAFE_MUL` of the speed W gets (see `lockMoveMul`), so the lock's strafe is
        // a step off the crosshair's line rather than a sprint along it.
        const target = this.moveTarget() * this.lockMoveMul(inp);
        if (hasWish) {
          // Steering grip: strip sideways drift relative to the direction you're holding.
          // Full strength whenever you're not steering backwards, tapering to nothing as the
          // wish direction opposes your motion, so a 90-degree change turns almost on the
          // spot while a full turn-around still has to brake through zero.
          const sp0 = Math.hypot(this.vel.x, this.vel.z);
          if (sp0 > 0.05) {
            const align = (this.vel.x * wx + this.vel.z * wz) / sp0;
            const grip = align >= 0 ? P.LATERAL_GRIP : P.LATERAL_GRIP * (1 + align);
            if (grip > 0.001) {
              const vAlong = this.vel.x * wx + this.vel.z * wz;
              const latX = this.vel.x - wx * vAlong;
              const latZ = this.vel.z - wz * vAlong;
              const keep = Math.max(0, 1 - grip * dt);
              this.vel.x = wx * vAlong + latX * keep;
              this.vel.z = wz * vAlong + latZ * keep;
            }
          }
          accelerate(this.vel, wx, wz, target, P.GROUND_ACCEL, dt);
          const sp = Math.hypot(this.vel.x, this.vel.z);
          if (sp > target) {
            const drop = P.RUN_OVERSPEED_FRICTION * (sp - target) * dt;
            const k = Math.max(0, sp - drop) / sp;
            this.vel.x *= k;
            this.vel.z *= k;
          }
        } else {
          // ...and what lets the feet off is the DECK's own grip, not the standing brake: on deck
          // the field can hold, that is `applyFriction` exactly as it always was, and on deck it
          // cannot it is the kinetic grip of a body sliding (see `deckGrip` — the user's *"didnt
          // know the player can stand on wall slopes"*).
          this.deckGrip(dt);
        }
        // THE DECK'S OWN PULL, and the gate that answers it (see "THE SLOPE"): the run is the state
        // the whole mechanic is for — a flank too steep to walk is climbed at a run, and one too
        // steep for the run's own speed is what slides you back down it.
        this.slopePull(dt);
        this.slopeGate();
        this.vel.y -= P.GRAVITY * dt;
  },

  // THE SLIDE'S OWN BODY (the `slide` case of `update`'s switch, moved here whole):
  tickSlideState(dt, hasWish, wx, wz) {
        // A slide HOLDS its speed while it is young: there is no friction at all for the first
        // `SLIDE_HOLD_TIME`, so it is a momentum move rather than a glide that bleeds out.
        // Steering bends the velocity *direction* at SLIDE_TURN rad/s and never touches the
        // magnitude, and the only thing that slows a fresh slide is the player braking — holding
        // a direction that points back along the line.
        const sp2 = Math.hypot(this.vel.x, this.vel.z);
        if (hasWish && sp2 > 0.3) {
          const along = (this.vel.x * wx + this.vel.z * wz) / sp2;
          if (along < -0.12) {
            applyFriction(this.vel, P.SLIDE_BRAKE, dt);
          } else if (along < 0.999) {
            const diff = wrapPi(Math.atan2(wx, wz) - Math.atan2(this.vel.x, this.vel.z));
            // Turning against the slide gets no help at all (`along + 0.35` reaches zero), so
            // the line can be carved but never yanked around.
            const rate = P.SLIDE_TURN * Math.max(0, along + 0.35);
            const turn = Math.max(-rate * dt, Math.min(rate * dt, diff));
            if (turn !== 0) {
              const yaw = Math.atan2(this.vel.x, this.vel.z) + turn;
              this.vel.x = Math.sin(yaw) * sp2;
              this.vel.z = Math.cos(yaw) * sp2;
            }
          }
        }
        // ...and a SQUEEZE PAYS (see `updateSqueeze`): while the body is threading a gap it is fed
        // acceleration along its own line, so a tight place BUILDS momentum. It is added along the
        // velocity rather than by steering, so it cannot bend the carve, and it is capped at
        // MAX_SPEED like every other speed gain in the game.
        if (this.squeeze > 0.001) {
          const sp3 = Math.hypot(this.vel.x, this.vel.z);
          if (sp3 > 0.05 && sp3 < P.MAX_SPEED) {
            const k = Math.min(P.MAX_SPEED, sp3 + P.SLIDE_SQUEEZE_ACCEL * this.squeeze * dt) / sp3;
            this.vel.x *= k;
            this.vel.z *= k;
          }
        }
        // ...and the TAIL: stay down past `SLIDE_HOLD_TIME` and the slide starts SPENDING
        // momentum. It is a CONSTANT DECELERATION (u/s², not a coefficient — see `bleedSpeed` and
        // the `SLIDE_DRAIN_` block in `P`), ramped in over `SLIDE_DRAIN_RAMP` so the onset is not a
        // step and then held flat: the speed falls on a straight line to the crouch, so the slide
        // reads as a body on the ground rather than as a glide that suddenly finds gravel. It is
        // along the velocity, so it cannot bend the carve, and the squeeze above can still out-earn
        // it — a slide through a tight gap is the one place a long slide is worth the price.
        const over = this.stateTime - P.SLIDE_HOLD_TIME;
        if (over > 0) {
          const ramp = Math.min(1, over / P.SLIDE_DRAIN_RAMP);
          bleedSpeed(this.vel, P.SLIDE_DRAIN_DECEL * ramp, dt);
        }
        // ...and the SLIDE takes the deck's own pull too (the user's *"add slope physics and the
        // slide also"*): the ground drops away under a slide down a flank and the slide is given it,
        // so a hill is a place a slide BUILDS speed rather than one that simply holds it — and the
        // same reading means a slide thrown UP a flank loses its run, which is what stops a slide
        // from being a way over terrain the run itself cannot climb. No gate here, on purpose: the
        // gate is what refuses a CLIMB, and a slide is allowed to spend its momentum on one.
        this.slopePull(dt);
        this.vel.y -= P.GRAVITY * dt;
  },
  // THE DASH STATE'S OWN BODY (the `dash` case of `update`'s `switch`, moved here whole): the step's
  // pose clock, then the two placements' bleed-and-curve — the quick step, the boxcutter's landing and
  // the BACKDASH's whole performance (its beats, the camera-only re-aim, the hero landing, the slide
  // out). It is the one state body that needs the camera basis as well as the wish, so it is handed
  // `grounded`, `hasWish`, `wx`, `wz`, `sin` and `cos`.
  tickDashState(dt, grounded, hasWish, wx, wz, sin, cos) {
        // THE STEP'S OWN POSE CLOCK, ticked HERE rather than in `updateVisual` (see `tickDashPose`):
        // the contact test above lives in this file's simulation, so the clock everything reads —
        // the turn, the shape, and whether the kick has been thrown yet — has to be one number
        // advanced once, in one place, and read by all three.
        this.tickDashPose(dt);
        // THE STEP. The two placements bleed off fast — a burst is about where it PUTS you, not
        // how long it carries you — and the wish can still curve them while they last (a dash you
        // cannot curve is a commitment, and the wish is the line it opened on anyway).
        //
        // The BACKDASH is the exception: it is a whole PERFORMANCE, and it now has to carry the
        // body a long way back, put it down in the hero landing and SLIDE it backwards out of it
        // the instant it lands — the user's *"cover a lot more distance ... make it slide
        // backwards"*, with the hold between the two trimmed by the later *"make it as soon as the
        // player does the hero land"*. So its travel is a beat-by-beat profile read off the pose's
        // own table (`BACKDASH`, published on the rig as `backdashBeats`), not one drag — and it is
        // the one step whose LINE the wish can swing while the move runs (see `P.BACK_STEER`).
        const B = this.dashKind === 2 ? this.backdashBeats() : null;
        if (!B) {
          applyFriction(this.vel, P.QDASH_DRAG, dt);
          // ...and THE HEADING IS THE PLAYER'S once the shape is putting itself down (see P's "THE
          // RE-AIM"): past the beat the trick is spent, a held direction SNAPS the burst onto it on
          // the frame it is held rather than curving it at `QDASH_STEER`. The sidestep never leaves
          // the deck, so its whole clock IS the landing and `KB` is null for it; the boxcutter hands
          // over on `unwind` — the beat its flips and its two turns are spent and the legs are
          // already reaching down — so from there the drop is spent wherever the sticks say. Before
          // that beat the wish curves the burst exactly as it always has: a trick being thrown is a
          // commitment.
          const KB = this.dashKind === 0 ? this.boxcutterBeats() : null;
          const reaim = !KB || this.stateTime >= this.qdashTime() * KB.unwind;
          if (hasWish && reaim) {
            const sp = Math.hypot(this.vel.x, this.vel.z);
            if (sp > 1e-3) {
              this.vel.x = wx * sp;
              this.vel.z = wz * sp;
            }
          } else if (hasWish) {
            accelerate(this.vel, wx, wz, 3.0, P.QDASH_STEER, dt);
          }
          // ...and the FRONT step's own landing (session 87). What it fires is a plain landing —
          // the deck's own grit and a thud — and NOT the backstep's hero landing: that one has a
          // knee and a fist in it and draws a ring, and there is nothing on the deck here but the
          // soles of a trick that has already been thrown.
          //
          // It is fired on the frame the BODY touches down (`grounded`) rather than on a beat of the
          // clock, and that frame is measured: with the hop solved off the shape's own air
          // (`(plant − launch) × qdashTime`, i.e. 0.647 s of it) the body's arc comes down at
          // t **0.597** of the clock — on the `kickEnd` beat. The DRAWN feet reach the deck a little
          // after it (t 0.676 measured, the shoe's lowest vertex going 0.717 → 0.017 over five
          // frames) and that gap is the flip's own: the rig is still 101° over at `kickEnd` and only
          // comes square at `unwind`, and the deck solve cannot own a leg under a body that is
          // mid-revolution (the pitch correction it carries divides by `cos(pitch)`). So the last
          // tenth of the descent is the legs reaching down out of the trick onto a deck the body has
          // already arrived on — which is what a landing looks like, and the soles are flat within a
          // degree of level for every frame of it.
          if (KB && !this.boxLanded && grounded &&
              this.stateTime >= this.qdashTime() * KB.launch) {
            this.boxLanded = true;
            this.events.push("boxland");
            this.squash = Math.max(this.squash, 0.22);
            if (this.sfx && this.sfx.land) this.sfx.land(0.5);
          }
        } else {
          // ---- THE LINE TURNS WITH THE CAMERA, AND ONLY WITH THE CAMERA (see `P.BACK_STEER`) ----
          // The backstep is the one step that does NOT travel where it was thrown: it is a whole
          // performance — and a long one — so it can be POINTED while it runs. That pointing has
          // been handed round twice. It started on the stick (session 111 — the wish swung
          // `dashDir`, up to a quarter-second lock before the landing), then session 123 took the
          // stick back out of the hero landing entirely (*"make the hero land for the backdash not
          // get effected when i move left right or back or forward"*), and now the user has explained
          // what they actually wanted: *"make me able to rotate around with the backdash hero land
          // part but only turn around with the camera not with the keyboard u understood me wrong"*.
          // So the LOOK is the steering, and the stick is not
          // involved at all: `dashDir` is swung toward the camera's own BACKWARD — `(sin, cos)`,
          // which is the camera's forward negated, and exactly the direction the body's own back
          // faces while a step owns the aim (see the `dash` branch of the facing chain) — at
          // `BACK_STEER`, for the WHOLE performance, with no lock and no window: the flip's arc, the
          // hero landing's brake and the slide's shove all read the one number, so turning the look
          // mid-slide turns the slide with it. That is the whole of the ask. Released, the line
          // simply stays where the look last left it.
          const tc = this.qdashTime();
          const cs = swingTowards(this.dashDirX, this.dashDirZ, sin, cos, P.BACK_STEER, dt);
          this.dashDirX = cs.x;
          this.dashDirZ = cs.z;
          const t = Math.min(1, this.stateTime / Math.max(1e-3, tc));
          if (t < B.land) {
            // THE FLIGHT. A much lighter drag than a step's, because the whole point of this move
            // now is the distance it covers — and the velocity is swung onto `dashDir` rather than
            // the wish being added to it, so the arc keeps its speed and its shape and only its
            // HEADING answers the hands (a bounded turn, which is why a steered leap never out-runs
            // its own cap; see `swingTowards`). The speed that swing is handed is read AFTER the
            // drag, so the turn re-aims what is actually left rather than putting the bleed back.
            applyFriction(this.vel, P.QDASH_BACK_DRAG, dt);
            const fsp = Math.hypot(this.vel.x, this.vel.z);
            if (fsp > 1e-3) {
              const s = swingTowards(this.vel.x, this.vel.z, this.dashDirX, this.dashDirZ, P.BACK_STEER, dt);
              this.vel.x = s.x * fsp;
              this.vel.z = s.z * fsp;
            }
          } else {
            // THE GROUND. Once the hero landing arrives the body stops ARRIVING and starts
            // SPENDING: the settle brakes it to a crawl, the slide shoves it back, and the rise
            // spends what is left. The shove and the brake are both along `dashDir`, and the
            // direction is FORCED — the phase is a shape rather than a heading, which is what makes
            // the slide go exactly backwards out of the landing however the body is standing — and
            // `dashDir` is still live (above): it keeps turning with the LOOK the whole way through
            // the landing and the slide, so "exactly backwards" means back down the line the camera
            // is holding at that moment, and swinging the look mid-slide swings the slide.
            const gsp = Math.hypot(this.vel.x, this.vel.z);
            const want = t < B.hold ? P.BACK_HOLD_SPEED
              : t < B.slide ? P.BACK_SLIDE_SPEED : 0;
            const rate = t >= B.hold && t < B.slide ? P.BACK_SLIDE_ACCEL : 60;
            const ns = approach(gsp, want, rate * dt);
            if (ns < 1e-3) {
              this.vel.x = 0;
              this.vel.z = 0;
            } else {
              this.vel.x = this.dashDirX * ns;
              this.vel.z = this.dashDirZ * ns;
            }
            // ...and the landing itself, fired exactly once on the beat the pose puts the knee and
            // the fist down (the FX and the thud read off the same table the shape does).
            if (!this.backdashLanded) {
              this.backdashLanded = true;
              this.events.push("dashland");
              this.squash = Math.max(this.squash, 0.30);
              if (this.sfx) this.sfx.slamImpact(0.35);
            }
          }
        }
        this.vel.y -= P.GRAVITY * dt;
  },
  // THE AIR STATE'S OWN BODY (the `air` case of `update`'s `switch`, moved here whole) — the biggest of
  // them: the wall CLIMB (the attach, the burst, the slip and the fire), the WALL RUN and the WALL
  // SLIDE's own readings, the PLUNGE and the SKYFALL's sinks, and the plain fall's air control. It
  // reads the frame's `dt`, `inp`, the wish (`wx`/`wz`) and its flag (`hasWish`) and nothing else from
  // the host, so those five are handed in as arguments.
  tickAirState(dt, inp, hasWish, wx, wz) {
        if (this.attached && this.wall) {
          const w = this.wall;
          // Tangent = the wall face direction that reads as "right" on screen, so A/D shuffle
          // the way you expect. Every axis of the attached velocity is eased toward a target
          // instead of being clamped, which is what makes the grab/release feel smooth.
          const tx = w.nz;
          const tz = -w.nx;
          if (this.attachMode === "climb") {
            const k = Math.min(1, dt * P.CLIMB_ACCEL);
            // THE MOMENTUM (see the `CLIMB_MOM_` block in `P`): the climb EARNS speed for as long as
            // the push is held — that is the ENVELOPE, one smooth ramp the length of the push — and
            // it is spent in PULLS. `climbMomT` is the seconds of continuous push, and the envelope
            // only ever ADDS (the user's *"dont make it go downwards"*), while its trend is monotone
            // up. What rises and falls inside it is the clip's own stroke, below.
            const push = Math.max(0, inp.moveZ);
            if (push > 0.01) this.climbMomT += dt * push;
            else this.climbMomT = Math.max(0, this.climbMomT - dt * P.CLIMB_MOM_FALL);
            const env = push > 0.01
              ? 1 + P.CLIMB_MOM_MAX * (1 - Math.exp(-this.climbMomT / P.CLIMB_MOM_T))
              : 1;
            // THE STROKE (see the `CLIMB_PULL_DEPTH` block in `P`, and `CLIMB_PULL` in streetwear.js). The
            // speed wears the clip's own descent of the planted holds, so the body is hauled up while
            // the arms haul and coasts while the next hand reaches. It is read off THIS frame's phase,
            // so a stroke in the limbs and a surge in the speed are one event — the character pulls
            // the wall and it pulls him up.
            const cu = this.charMesh && this.charMesh.userData;
            const pull = cu && cu.climbPull ? 1 + P.CLIMB_PULL_DEPTH * (cu.climbPull(this.climbPhase) - 1) : 1;
            this.climbPull = pull;
            // ...and THE TWO SPEEDS. `climbUp` / `climbSide` are what the push and the momentum are
            // PULLING FOR: the un-stroked target, which is the phase clock's own input (see the
            // arithmetic in `P` — the clock reads this rather than the stroked speed so that the clip
            // plays at a steady tempo and a planted palm has nothing to slide against). The `up` /
            // `side` written to the body are the stroked ones.
            this.climbUp = push * P.CLIMB_UP * env;
            this.climbSide = inp.moveX * P.CLIMB_SIDE * env;
            // ---- THE PULL (see the `CLIMB_LOAD_` / `CLIMB_SKIP_` blocks in `P`) ------------------
            // The load first: M1 down on the face stops the body on its holds and coils it, and the
            // charge it winds up is what the release is spent on. `climbLoadT` is the seconds it has
            // been held THIS load, the charge saturates off it, and the coil's own depth (`climbSink`)
            // follows the charge but UNWINDS THE MOMENT IT FIRES — the body extending out of its coil
            // and the body travelling are one event, so they share the fire's clock.
            const held = !!inp.kickHeld;
            if (this.climbFireT > 0) {
              this.climbFireT = Math.max(0, this.climbFireT - dt);
              // THE LAUNCH PROFILE. A decaying ramp from `2*dist/T` to zero, ending on nothing — the
              // base climb speed is added under it, so the fire hands back without a step. The first
              // `CLIMB_SKIP_RAMP` of it is eased in, because `vel.y` is being SET here rather than
              // eased toward (the climb's own `CLIMB_ACCEL` would eat most of a half-second move) and
              // a launch with no ramp in it is a step in velocity. The ramp costs the profile part of
              // its own area, so the whole thing is scaled by `CLIMB_SKIP_TRIM` — the reciprocal of
              // the ramped profile's mean — which is what makes `climbFireDist` the distance the fire
              // ACTUALLY covers. (It did not used to be: at `CLIMB_SKIP_RAMP` 0.16 the ramp eats
              // 15.1 % of the area, so every skip ever fired came up **15 % short** of its own number
              // — MEASURED 2.78 world off a 3.30 world full charge, which is how long that hid.)
              const fs = 1 - this.climbFireT / P.CLIMB_SKIP_TIME;
              const ramp = Math.min(1, fs / P.CLIMB_SKIP_RAMP);
              this.climbBurst = 2 * (1 - fs) * ramp * (this.climbFireDist / P.CLIMB_SKIP_TIME) * P.CLIMB_SKIP_TRIM;
            } else {
              this.climbBurst = 0;
              // ...and the limbs UNWIND at `CLIMB_HAUL_UNWIND` rather than snapping home on the frame
              // the fire ends (which is what a straight zero here did): the fire's own travel IS what
              // `rel` is read off, so a body that stops firing still has a body's worth of it to give
              // back, and at a full charge that is 2 rig units of limb sweep. Let out at the speed the
              // burst was travelling, it reads as the limbs settling rather than as a cut.
              this.climbRiseU = Math.max(0, this.climbRiseU - dt * P.CLIMB_HAUL_UNWIND);
              if (held) this.climbLoadT += dt;
              else if (this.climbLoadT > 0) {
                // THE RELEASE. The charge is spent here, once, and the body is given its distance.
                this.climbFireDist = P.CLIMB_SKIP_BASE + P.CLIMB_SKIP_GAIN * this.climbCharge;
                this.climbFireT = P.CLIMB_SKIP_TIME;
                this.climbFireY = this.pos.y;
                this.climbLoadT = 0;
                // ...and the world is told, once: the launch's own burst (session 177 — see the
                // `climbskip` drain in main.js). The point is between the body and the FACE, so the
                // grit reads as coming off the stone he just tore his limbs off, and the charge rides
                // with it so a full coil throws a bigger one.
                this.lastClimbSkip = {
                  x: this.pos.x - w.nx * 0.28,
                  y: this.pos.y - P.HY + 0.55,
                  z: this.pos.z - w.nz * 0.28,
                  nx: w.nx,
                  nz: w.nz,
                  charge: this.climbCharge,
                };
                this.events.push("climbskip");
                if (this.sfx && this.sfx.launch) this.sfx.launch();
              }
            }
            // The charge, and the coil that follows it. A load cannot be started out of a fire (the
            // body is off its holds while it flies) and it needs grip to hold; a load that runs the
            // bar out is a slip, which the climb's own block below does.
            const charging = this.climbFireT <= 0 && held && this.grip > 0;
            this.climbCharge = charging ? 1 - Math.exp(-this.climbLoadT / P.CLIMB_LOAD_CHARGE) : (this.climbFireT > 0 ? this.climbCharge : 0);
            const wantSink = this.climbFireT > 0 ? 0 : (charging ? this.climbCharge : 0);
            this.climbSink = approach(this.climbSink, wantSink, dt / P.CLIMB_LOAD_SINK_T);
            // ...and the STANCE's own weight, on the load's fade in and the fire's fade out. It is
            // `climbFireT` that holds it up through the fire — the overlay is what the skip is DRAWN
            // with, so it may not go out until the burst has.
            const wantLoad = (charging || this.climbFireT > 0) ? 1 : 0;
            this.climbLoad = approach(this.climbLoad, wantLoad, dt / (wantLoad ? P.CLIMB_LOAD_POSE : P.CLIMB_FIRE_OUT));
            // ...and THE FLIGHT'S OWN SHAPE (session 177 — see `CLIMB_FLY_IN`): the launch overlay
            // the hop is drawn with. It follows `climbRel` (the limbs being off the stone, which is
            // the same event), but on the pad's own fade rather than `rel`'s 0.05 s snap, and it hands
            // back to the climb's held pose as the limbs re-grip. It is left at zero the moment the
            // body leaves the face (see the `onClimbFace` block above), so a stale weight can never
            // put a launch shape on a body that is only hanging there.
            const wantFly = this.climbRel;
            this.climbFly = approach(this.climbFly, wantFly, dt / (wantFly > this.climbFly ? P.CLIMB_FLY_IN : P.CLIMB_FLY_OUT));
            // A LOADING BODY DOES NOT CLIMB: the push goes dead for as long as the coil is on, which
            // is what makes the butt drop a HANG on its holds rather than a creep up the face. The
            // phase clock reads `climbUp`, so it stops with it and the clip holds its frame.
            const loading = this.climbLoad > 0.02 && this.climbFireT <= 0;
            if (loading) {
              this.climbUp = 0;
              this.climbSide = 0;
              this.climbPull = 1;
              this.climbMomT = Math.max(0, this.climbMomT - dt * P.CLIMB_MOM_FALL);
            }
            const up = this.climbUp * this.climbPull;
            const side = this.climbSide;
            // ...and a body that has just closed its hands on the stone stops ON it: the climb's own
            // `CLIMB_ACCEL` ease would coast a loading body another `CLIMB_LOAD_BRAKE` times as far up
            // the face while it is supposed to be dropping down it (MEASURED 0.11 world units of rise
            // through the blend-in, against a `sink` of 0.30 rig), so the ease is stiffened for as long
            // as the load is on.
            const kb = loading ? Math.min(1, k * P.CLIMB_LOAD_BRAKE) : k;
            this.vel.x += (-w.nx * P.WALL_HUG + tx * side - this.vel.x) * kb;
            this.vel.z += (-w.nz * P.WALL_HUG + tz * side - this.vel.z) * kb;
            this.vel.y += (up - this.vel.y) * kb;
            // ...and the BURST is set outright on top of that ease — the travel IS the move, and
            // `CLIMB_ACCEL`'s 71 ms of lag would spend a third of it on the ramp (see the profile
            // above). It is added to the base, so the hand-back at the end of the fire is seamless.
            if (this.climbBurst > 0) this.vel.y = up + this.climbBurst;
            // THE STAMINA (see `GRIP_MAX`). Hanging costs the idle rate and a full push up the
            // face costs the whole of it, so the bar is a clock on how long the body can stay up
            // there — and when it reaches the bottom the body does the one thing Genshin's does:
            // it slips off. The slip is deliberately not a wall jump (that is SPACE, and it is a
            // move): it is a let-go, a shove off the face and a fall, with the wall locked out for
            // `CLIMB_SLIP_LOCK` so the re-grab cannot happen on the very next frame.
            // ...AND A LOAD COSTS MORE THAN A HANG. Holding a full coil is the one thing on this wall
            // that is harder than hanging still, so it is charged on top of the idle rate — the price
            // of the charge, and what stops a skip from being free distance (see `CLIMB_LOAD_DRAIN`).
            const effort = P.CLIMB_DRAIN_IDLE + (1 - P.CLIMB_DRAIN_IDLE) * Math.max(0, inp.moveZ)
              + P.CLIMB_LOAD_DRAIN * this.climbCharge * (this.climbFireT > 0 ? 0 : 1);
            this.grip = Math.max(0, this.grip - P.GRIP_DRAIN * effort * dt);
            // (Session 199 deleted the climb's own 0.24 s `climbTick` timer from here — it was
            // doubling the clip's beat read in `solveWallPose`. The tick lives there now, and the
            // `wallScrapeT` field is the SCRAPES' alone: see the note in `wallrun.js`.)
            if (this.grip <= 0) {
              this.attached = false;
              this.attachMode = null;
              this.climbing = false;
              this.wallCoyote = 0;
              this.wallStick = 0;
              this.wallCd = P.CLIMB_SLIP_LOCK;
              this.vel.x = w.nx * P.CLIMB_SLIP_PUSH;
              this.vel.z = w.nz * P.CLIMB_SLIP_PUSH;
              this.vel.y = Math.min(this.vel.y, P.CLIMB_SLIP_FALL);
              this.squash = 0.3;
              if (this.sfx) this.sfx.land(0.3);
              this.events.push("gripslip");
            }
          } else if (this.attachMode === "run") {
            // Wall run: the horizontal velocity is swung onto the wall's tangent — keeping
            // the way along it you were already going — and the fall is replaced by a slow
            // settle, so you stay up as long as you have wall and time left. Steering (A/D)
            // is just another pull on that same tangent, and letting go drops you straight
            // back into a normal fall with every bit of the speed you had.
            const vn = this.vel.x * w.nx + this.vel.z * w.nz;
            const hug = Math.max(-3, Math.min(3, -P.WALLRUN_HUG - vn));
            this.vel.x += w.nx * hug;
            this.vel.z += w.nz * hug;
            const cur = this.vel.x * tx + this.vel.z * tz;
            const along = hasWish ? wx * tx + wz * tz : 0;
            const cap = Math.max(P.SPRINT, this.moveTarget());
            const sgn = Math.abs(along) > 0.08 ? Math.sign(along) : Math.sign(cur) || 1;
            // A wall run HOLDS the speed you brought to it. Contact scrubs the part of your
            // velocity aimed *into* the face (that is what touching a wall does), but the run
            // itself must never clamp you down to the run cap — the cap is a floor here, not a
            // ceiling. Direction is what steering changes; only steering *against* your travel
            // eases you down, and on through zero, so a run can still be turned around.
            const hold = Math.max(Math.abs(cur), cap);
            const want =
              Math.abs(cur) < 0.2 || Math.sign(cur) === sgn ? sgn * hold : approach(cur, sgn * cap, P.WALL_STEER * dt);
            const k = Math.min(1, dt * P.WALLRUN_EASE);
            this.vel.x += (tx * want - this.vel.x) * k;
            this.vel.z += (tz * want - this.vel.z) * k;
            // Vertical momentum is kept too: a run off a jump keeps arcing up under (reduced)
            // gravity instead of being snapped down onto the sink; the sink only ever catches
            // the fall (and holds it at -WALLRUN_DROP, a slow settle, not a lift).
            if (this.vel.y > -P.WALLRUN_DROP) {
              this.vel.y = Math.max(-P.WALLRUN_DROP, this.vel.y - P.GRAVITY * P.WALLRUN_RISE_G * dt);
            } else {
              this.vel.y += (-P.WALLRUN_DROP - this.vel.y) * Math.min(1, dt * P.WALLRUN_SINK);
            }
            this.wallRunT -= dt;
            this.wallScrapeT -= dt;
            if (this.wallScrapeT <= 0) {
              this.wallScrapeT = 0.12;
              this.events.push("wallscrape");
              if (this.sfx) this.sfx.wallScrape(Math.hypot(this.vel.x, this.vel.z));
            }
            if (this.wallRunT <= 0) this.endWallRun(true);
          } else {
            // Wall slide: hug the wall (kill outward drift, press gently into it so collision
            // keeps you flush), ease the fall onto WALL_SLIDE, and steer along the wall.
            const vn = this.vel.x * w.nx + this.vel.z * w.nz;
            const hug = Math.max(-5, Math.min(5, -P.WALL_HUG - vn));
            this.vel.x += w.nx * hug;
            this.vel.z += w.nz * hug;
            this.vel.y += (-P.WALL_SLIDE - this.vel.y) * Math.min(1, dt * P.WALL_SLIDE_EASE);
            const cur = this.vel.x * tx + this.vel.z * tz;
            const along = hasWish ? wx * tx + wz * tz : 0;
            const cap = Math.max(P.SPRINT, this.moveTarget());
            let delta;
            if (Math.abs(cur) > cap && (!hasWish || along * cur >= 0)) {
              // Already carrying more speed than the cap along the wall: let it bleed off
              // gently instead of braking into the wall run.
              const drop = P.OVERSPEED_FRICTION * (Math.abs(cur) - cap) * dt;
              delta = -Math.sign(cur) * Math.min(drop, Math.abs(cur));
            } else {
              const want = Math.max(-cap, Math.min(cap, Math.abs(along) > 0.08 ? along * cap : cur));
              delta = approach(cur, want, P.WALL_STEER * dt) - cur;
            }
            this.vel.x += tx * delta;
            this.vel.z += tz * delta;
            this.wallScrapeT -= dt;
            if (this.wallScrapeT <= 0) {
              this.wallScrapeT = 0.1;
              this.events.push("wallscrape");
              if (this.sfx) this.sfx.wallScrape(Math.hypot(this.vel.x, this.vel.z));
            }
          }
        } else if (this.plunge) {
          // THE PLUNGE (see the block in `update`): the fall's own physics, steeper and faster.
          // Whatever horizontal speed the fall was carrying is SPENT onto the vertical, so the body
          // covers ground like a stone rather than like a bird — and nothing steers it, because the
          // button IS the move. The terminal is held the way the skyfall's is (gravity applied, then
          // the excess bled off), so a plunge entered from the skyfall's 26 eases DOWN onto it and
          // one released above 26 eases back UP onto the fall: the two terminals are one continuum
          // rather than a snap between two states.
          const psp = Math.hypot(this.vel.x, this.vel.z);
          if (psp > 0.01) {
            const drop = Math.min(psp, P.PLUNGE_KILL * dt);
            const k = (psp - drop) / psp;
            this.vel.x *= k;
            this.vel.z *= k;
          }
          this.vel.y -= P.GRAVITY * P.PLUNGE_GRAV * dt;
          if (this.vel.y < -P.PLUNGE_V) {
            const over = -P.PLUNGE_V - this.vel.y;
            this.vel.y = -P.PLUNGE_V + Math.min(0, over) * Math.max(0, 1 - dt * 4);
          }
        } else if (this.skyfall) {
          // A SKYFALL is a real drop, not a hop: heavier gravity and a TERMINAL VELOCITY, so a
          // long fall settles into a fast steady descent instead of accelerating off the map —
          // and the cap eases in from either side, so a fall that entered fast (a dive, a slam)
          // keeps what it had rather than being snapped back to the terminal number. Steering is
          // at a reduced authority: a fall is something happening to you that you lean against.
          if (hasWish) accelerate(this.vel, wx, wz, this.moveTarget(), P.AIR_ACCEL * P.SKYFALL_AIR, dt);
          const sp = Math.hypot(this.vel.x, this.vel.z);
          if (sp > 0.01) {
            const drop = Math.min(sp, P.AIR_DRAG * 0.5 * dt);
            const k = (sp - drop) / sp;
            this.vel.x *= k;
            this.vel.z *= k;
          }
          this.vel.y -= P.GRAVITY * P.SKYFALL_GRAV * dt;
          // ...and the TERMINAL VELOCITY holds. Gravity is applied first and the excess over the
          // terminal is then bled off — a body that has reached it stays there (the two cancel
          // frame for frame), while one that entered faster than it (a dive, a slam) eases down
          // onto it over about half a second instead of being snapped. A straight `if (v < -T) v
          // = -T` is the same thing at this frame rate; an ease applied WITHOUT the gravity term
          // being cancelled is not, and that is what this was first: measured, a "26 u/s" fall
          // settled at 43 u/s, because at 60 fps a 2.5/s ease toward the cap cannot keep up with
          // gravity and the cap is simply never reached.
          if (this.vel.y < -P.SKYFALL_V) {
            const over = -P.SKYFALL_V - this.vel.y;
            this.vel.y = -P.SKYFALL_V + Math.min(0, over) * Math.max(0, 1 - dt * 4);
          }
        } else {
          if (hasWish) accelerate(this.vel, wx, wz, this.moveTarget(), P.AIR_ACCEL, dt);
          const sp = Math.hypot(this.vel.x, this.vel.z);
          if (sp > 0.01) {
            const drop = Math.min(sp, P.AIR_DRAG * dt);
            const k = (sp - drop) / sp;
            this.vel.x *= k;
            this.vel.z *= k;
          }
          // ...and between the moves of an AIR COMBO the same float holds the player up (see
          // `airComboGravity`) — the handover from one move to the next is `air` for a frame or
          // two, and a plain gravity there would drop the string by a third of a metre each time.
          this.airComboGravity(dt);
        }
  },
  // THE STATE MACHINE'S OWN EXITS (lifted from the middle of `update`, where they sat under a
  // `// ---- state exits ----` heading): the four states that end on a condition rather than on a
  // clock — the dive's arrival/airtime, the slide's own held-or-spent gate, the dash's clock and
  // its two performances, and the block's chord/latch/stance. Each one writes the NEXT state, so
  // this runs BEFORE the entries and before the switch. It reads the frame's `dt`, `inp` and the
  // frame's own `grounded` reading, and nothing else.
  tickStateExits(dt, inp, grounded) {
    // ---- state exits ----
    if (this.state === "dive") {
      if (grounded) {
        // ...and a dive that reaches the deck is read for a body it has arrived on ONE more time,
        // on this frame (see `diveContact`): a dive aimed at a standing body touches down on the
        // same frame it reaches them, and the tackle must not be lost to the state handover.
        this.diveArrive = true;
        this.startSlide();
      } else if (this.stateTime >= P.DIVE_TIME || (!inp.diveHeld && this.stateTime > 0.35)) {
        this.setState("air");
      }
    }
    // A slide is held, not timed: it ends when YOU let go of SHIFT, when the feet leave the
    // deck, or when its own tail has bled it to a standstill (`SLIDE_MIN_SPEED`) — never on a
    // clock. That is the user's "make sliding infinite doesnt cancel on its own"; what keeps it
    // from being a free gear is the drain in the slide case below.
    if (this.state === "slide") {
      if (!grounded) {
        this.setState("air");
        this.slideCd = 0.35;
      } else if (
        (!inp.slideHeld && this.stateTime > 0.35) ||
        Math.hypot(this.vel.x, this.vel.z) < P.SLIDE_MIN_SPEED
      ) {
        this.setState("ground");
      }
    }
    if (this.state === "dash") {
      // A step is a PLACEMENT, so losing the ground ends it — except for the two that are
      // PERFORMANCES: the BACKSTEP (a twisting backflip) and, since session 87, the FRONT step (a
      // boxcutter). Both open on a leap and land inside their own clocks (see `startDash` /
      // `poseBackdash` / `poseBoxcutter`), so cancelling them the frame the feet leave would cancel
      // the whole move. They run their clocks; the ground is asked again on the way out, which is
      // exactly what the branch already does.
      const airborne = this.dashKind === 2 || this.dashKind === 0;
      if (this.stateTime >= this.qdashTime() || (!grounded && !airborne)) {
        this.setState(grounded ? "ground" : "air");
      }
    }
    // THE BLOCK lasts exactly as long as the CHORD does (see `block` / `startBlock`) — or, once the
    // chord has been pressed TWICE, until something lets it go (see `guardLatch` below): let either
    // button go and the guard drops, which is what makes it a stance rather than a commitment. It
    // is also a STANDING stance — the feet leaving the deck end it, and the air has its own shapes
    // — so a block-jump is a jump out of a block and not a block in the air.
    if (this.state === "block") {
      this.guardT += dt;
      // The absorb is a BEAT and not a state: the jolt eases back out over `BLOCK_HIT_T`, so the
      // guard settles onto the fist it just caught instead of holding the pressed-in shape. It
      // used to latch (measured: the same 0.22 still on the clock 120 frames later), which left
      // every later frame of the chord riding the full absorb.
      if (this.guardHitT > 0) this.guardHitT = Math.max(0, this.guardHitT - dt);
      // ...and the TOGGLE's own way out: a press of EITHER button lets a carried guard go. It is
      // dropped HERE, ahead of the press dispatch further down, so the same press is then free to
      // be what it says it is — M1 the chain, M2 the grab — rather than being swallowed by the
      // frame the guard came down on. A JUMP needs nothing here: it is the `!grounded` half below,
      // and the jump block fires for any state that is not one of the committed ones.
      if (this.guardLatch && (inp.kickPressed || inp.grabPressed)) this.guardLatch = false;
      if ((!this.guardLatch && !inp.blockHeld) || !grounded) this.setState(grounded ? "ground" : "air");
    }
  },

  // THE Q DASH'S OWN POSE LAYER (lifted out of `updateVisual`). Two things ride here on the same
  // fade: the whole-rig PITCH that goes with the step, and the step's own `poseDash`. The pitch is
  // settled BEFORE the pose, because the pose has to solve the soles against it (see `poseDash`'s
  // `step`), and the final argument is the caller's own `pitch` (the rig's angle chain) plus the
  // spin and the step's pitch — passed in because it is the pose stack's local, not this move's.
  solveDashPose(dt, ud, pitch) {
    // ...and the whole-rig pitch that goes with it: a sidestep and a backstep are upright by design
    // (the body's own bank and lean are in the pose), and so is the FRONT step now that it is a
    // boxcutter: the trick's motion is the pose's own curl and the rig's `spinX` flip, and a
    // whole-rig LEAN on top of that would tip the soles of the two beats that are standing on the
    // deck. It is still on the same fade, so it comes out of and back into a run without a step. It
    // is settled BEFORE the pose, because the pose has to solve the soles against it (see
    // `poseDash`'s `step`).
    const dashPitchT = this.state === "dash" ? (this.dashKind === 0 ? 0 : 0.04) : 0;
    this.dashPitch = approach(this.dashPitch, dashPitchT, dt / DASH_POSE_FADE);
    // THE Q DASH (see `startDash` / `poseDash`). Its own clock is the state's (`stateTime`), which
    // is exactly what a one-shot of its length wants — there is nothing to keep between frames but
    // which of the three it is and which way it goes, and those are settled when it opens. The one
    // exception is the fade-OUT: a step that has already ended keeps its LAST shape while it blends
    // away (`u` 1) instead of snapping back to its opening one, because a step's opening shape is
    // the stance it was thrown out of and re-showing it read as a hitch — the backstep's own coil,
    // deep in the deck, on a body that had already stood back up out of the landing.
    this.dashPose = approach(this.dashPose, this.state === "dash" ? 1 : 0, dt / DASH_POSE_FADE);
    if (ud && ud.poseDash && this.dashPose > 0.002) {
      // ...and the pose is read off the STEP'S OWN clock (`dashPoseT`, see `tickDashPose`): the
      // state's clock normally, compressed onto the kick's beat if this step has touched a body.
      const du = this.state === "dash" ? Math.min(1, this.dashPoseT) : 1;
      ud.poseDash(this.dashPose, du, this.dashKind, this.dashSide, pitch + this.spinX + this.dashPitch);
    }
  },

  // THE SLIDE'S OWN POSE LAYER (lifted out of `updateVisual`). It cross-fades in over the top of
  // whatever the run blend left behind, and back out again when the slide ends — its own curve, so a
  // slide-jump does not snap. It is a still (see `poseSlide`): the travel is shown by the grit the
  // deck throws, not by the limbs (`effects.slideSpray`, emitted from main.js off the same speed).
  solveSlidePose(dt, ud) {
    this.slidePose = approach(this.slidePose, this.state === "slide" ? 1 : 0, dt / SLIDE_POSE_FADE);
    if (ud && ud.poseSlide && this.slidePose > 0.002) {
      ud.poseSlide(this.slidePose);
    }
  },

  // THE CROUCH'S OWN POSE LAYER (lifted out of `updateVisual`). Its own fade, with the crouch WALK's
  // stride — short, because the phase still runs off the real speed but over a much shorter carry
  // distance, so the shuffle keeps up with the body instead of skating.
  solveCrouchPose(dt, ud, speed) {
    this.crouchPose = approach(this.crouchPose, this.crouching ? 1 : 0, dt / CROUCH_POSE_FADE);
    if (this.crouching) {
      // A crouch walk's stride is short: the phase still runs off the real speed, but over a
      // much shorter carry distance, so the shuffle keeps up with the body instead of skating.
      const rate = Math.min(1 / 0.40, speed / (RUN_STRIDE * 0.42));
      this.crouchPhase = (this.crouchPhase + rate * dt) % 1;
    }
    if (ud && ud.poseCrouch && this.crouchPose > 0.002) {
      const walk = Math.min(1, Math.max(0, (speed - 0.25) / 1.1));
      ud.poseCrouch(this.crouchPose, walk, this.crouchPhase, this.idleTime);
    }
  },


  // ---- movement per state ----
  // THE PER-STATE DISPATCH — the whole `switch (this.state)` of `update`, lifted verbatim: one line per state,
  // routing to that state's own tick (see the modules the comments name), with the gravity borrowing for the
  // states that leave the deck.
  tickStateMachine(dt, inp, grounded, hasWish, wx, wz, sin, cos) {
    // ---- movement per state ----
    switch (this.state) {
      case "ground":
        this.tickGroundState(dt, inp, hasWish, wx, wz);
        break;

      // THE BLOCK (M1 + M2 — see `startBlock`, and "THE BLOCK" in README.md). TWO shapes out of one
      // state, and the difference between them is exactly what the brief is about:
      //
      //   - THE GUARD WALKS. The cap is `BLOCK_WALK` and the wish is free in EVERY direction, so a
      //     strafe and a backpedal are both steps taken under the raised hands — the guard is a
      //     stance, and the body keeps its eyes on the camera rather than turning onto its own line
      //     (that is what a run does, and a walk that turned onto its travel would be one).
      //   - THE CHARGE DOES NOT STEER, IT COMMITS. The heading (`guardDirX/Z`) is swung by the wish
      //     at `BLOCK_RUSH_STEER` — under half the slide's own rate — and the velocity is then
      //     accelerated ALONG that heading and stripped of its sideways part, so pushing the stick
      //     left through a charge CARVES it round in a slow arc instead of stepping the body off
      //     the line. That is the brief's *"i go faster but turning left and right is slower"* made
      //     literal: what the hands can do to the line is capped, and what the line is travelled at
      //     is not.
      case "block":
        this.tickBlockState(dt, inp, hasWish, wx, wz);
        break;

      // The chain. It owns the body for the whole of a move, but not the legs: the feet creep at
      // `COMBAT_MOVE` while a direction is held (the user's "when i m1 im able to move but very
      // very slow") and plant when it is not. Steering never wins the AIM — that is the auto-face
      // in `updateAttack`, which keeps the body pointed at whatever it is working on while the
      // feet shuffle round it.
      //
      // ...and the chain CARRIES momentum (the user's "make them dont kill momentum"). A move
      // thrown out of a run comes in holding the line it ran in with (`COMBAT_CARRY`), and that
      // line bleeds off here at `COMBAT_DRIFT` (u/s²) toward the crawl (`COMBAT_MOVE`, with a
      // direction held) or toward a standstill (without one) — so the feet keep travelling through
      // the swing and settle, rather than being CLIPPED to the crawl the instant the knee leaves
      // the deck. Nothing here adds speed: `accelerate` only pushes toward the wish speed along
      // the wish (and never brakes), so the moves still cannot walk themselves.
      case "attack":
        this.tickAttackState(dt, inp, hasWish, wx, wz);
        break;

      // THE M1 CLASH (see `startClash` / `updateClash`). The lock owns both bodies' marks, so
      // there is no steering here and no friction to fight: `updateClash` writes the velocity that
      // holds this body on its side of the pair, and the world's own collision still applies to it.
      case "clash": {
        this.updateClash(dt, inp);
        this.vel.y -= P.GRAVITY * dt;
        break;
      }

      // THE MACACO (see `startMacaco` / `updateMacaco`). It plants a hand, so the slide's momentum
      // is bled off hard rather than carried, and the move owns the body from there.
      case "macaco": {
        this.vel.x = approach(this.vel.x, 0, P.MACACO_BRAKE * dt);
        this.vel.z = approach(this.vel.z, 0, P.MACACO_BRAKE * dt);
        this.vel.y -= P.GRAVITY * dt;
        this.updateMacaco(dt);
        break;
      }

      // THE WHIRL (see `whirl` / `updateWhirl`): the lunge, the whirlwind with a body in the hand,
      // the slam and the launch. It owns the horizontal itself — that is the whole move, a body
      // whirled round the floor — so there is no steering and no friction to fight out here.
      case "whirl": {
        this.updateWhirl(dt, inp);
        this.vel.y -= P.GRAVITY * dt;
        break;
      }

      // THE FLYING KNEE (see `knee` / `updateKnee`): the run-up, the solved leap and the landing.
      // It owns the horizontal too — the run-up IS the burst up to `KNEE_RUN_V` and the leap IS the
      // solved arc — so, like the whirl, there is nothing for the ground state's own steering or
      // friction to do.
      case "knee": {
        this.updateKnee(dt, inp);
        this.vel.y -= P.GRAVITY * dt;
        break;
      }

      // THE RIGHT-CLICK GRAB (see `grab` / `updateGrab`): the chest heave, the shoulder lift and
      // the ankle slam. Each kind owns its own clock and its own share of the horizontal — the
      // heave steps in on a decaying velocity, the lift plants him, and the slam launches him at
      // the body — so, like the knee, there is nothing left for the ground state to steer.
      case "grab": {
        this.updateGrab(dt, inp);
        this.vel.y -= P.GRAVITY * dt;
        break;
      }

      // THE RUNNING LUNGE (see `lunge` / `startLunge` / `updateLunge`): the pounce, the roll it
      // lands in (the miss's or the clinch's) and the spread leap-off. The horizontal belongs to the
      // move from the press to the landing — that is what `LUNGE_MIN` buys — and gravity is the
      // world's, borrowed exactly as the grab borrows it, because the pounce is a real leap and both
      // rolls are on the deck.
      case "lunge": {
        this.updateLunge(dt, inp);
        this.vel.y -= P.GRAVITY * dt;
        break;
      }

      // THE HEAD SCISSOR (see `scissor` / `updateScissor`): the guard, the leap and the clamp. It
      // leaves the deck for the middle of it, so the gravity is borrowed rather than cancelled —
      // the leap is a real jump and it lands like one.
      case "scissor": {
        this.updateScissor(dt, inp);
        this.vel.y -= P.GRAVITY * dt;
        break;
      }

      // THE LAUNCH (see `capoeira` / `updateCapo`): the coil, the rising kick, the carry and the hop
      // back down.
      case "capo": {
        this.updateCapo(dt, inp);
        // ...and the launch phase is already IN the air combo's window (`updateCapo` opens it on
        // the frame it leaves the deck), so the pop is the float's own rise and not a plain drop
        // away from the body it is being thrown after.
        this.airComboGravity(dt);
        break;
      }

      // THE POLE — the three moves the staff has (see the `POLE_*` block, and `poleStrike` /
      // `poleThrow` / `poleVault`). Note what is NOT here: the CARRY. A carried staff is an
      // ATTACHMENT, not a state — it rides whatever state the body is in (see `updatePoleCarry`,
      // ticked above the switch), so a man with a staff on his shoulder can still run, jump, slide
      // and dash, and there is nothing to fall out of.
      //
      // THE STRIKE (M1). Its own clock and its own beats, and its own forward carry: see
      // `updatePoleStrike`, which is where the *"it cannot be stationary"* half of the brief lives.
      case "poleatk": {
        this.updatePoleStrike(dt);
        break;
      }
      // THE THROW (M2). The release is a share of its clock, and after it the prop is a world object
      // on a real ballistic line (see `updatePoleThrow` / `updatePoleFlight`).
      case "polethr": {
        this.updatePoleThrow(dt);
        break;
      }
      // THE VAULT (the double jump, session 185). No gravity, no collision — the flip is holding him
      // — and the launch is the beat the tip meets the deck (see `updatePoleVault`).
      case "polevlt": {
        this.updatePoleVault(dt);
        break;
      }
      case "air":
        this.tickAirState(dt, inp, hasWish, wx, wz);
        break;
      case "ledge":
        this.tickLedgeState(dt);
        break;
      case "launch":
        this.tickLaunchState(dt);
        break;
      case "mantle":
        this.tickMantleState(dt);
        break;
      case "vault":
        this.tickVaultState(dt);
        break;
      // THE RIDE, THE POWERSLIDE AND THE BOMB (session 200 — see player/board.js). Each of the three
      // owns its own horizontal outright: the ride CARVES the line and never accelerates (the push is
      // a cadence of its own), the powerslide scrubs it, and the bomb grows it — so none of them wants
      // the ground state's steering, its friction or its `slopeGate`. All three do take the deck's own
      // pull and gravity, taken inside each tick, because all three are on the deck (or, for the bomb,
      // thrown off it).
      case "ride":
        this.tickRideState(dt, inp, hasWish, wx, wz, grounded);
        break;
      case "bslide":
        this.tickBSlideState(dt, inp, hasWish, wx, wz, grounded);
        break;
      case "bbomb":
        this.tickBBombState(dt, grounded);
        break;
      case "slide":
        this.tickSlideState(dt, hasWish, wx, wz);
        break;
      case "dash":
        this.tickDashState(dt, grounded, hasWish, wx, wz, sin, cos);
        break;
      case "dive":
        this.tickDiveState(dt, sin, cos);
        break;
      case "slam":
        this.tickSlamState(dt, wx, wz, hasWish);
        break;
      case "smash":
        this.tickSmashState(dt);
        break;
      case "wallbeat": {
        // THE WALL CLINCH (see `startWallBeat` / `updateWallBeat`). The move PLACES both bodies —
        // the attacker on his stage, the victim by the skull on the wall — so this is the whole of
        // its physics: no world, no input, just the clock.
        this.updateWallBeat(dt, inp);
        break;
      }
    }
  },
};

export function installStates(Player) {
  Object.assign(Player.prototype, stateMethods);
}
