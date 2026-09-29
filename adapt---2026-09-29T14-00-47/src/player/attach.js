// ---------------------------------------------------------------------------
// Part 34 of the `player.js` split: THE WALL ATTACHMENT (the Genshin model).
//
// Moved here from `update`: the one block that decides whether the body is ON a face this frame — the
// climb's self-sustaining grab (from the air and from the deck), the wall RUN (which gets first refusal on
// a wall beside you rather than ahead), the wall SLIDE, and the wall JUMP's lockout. It reads the host's
// `inp`, `grounded`, `wx`, `wz` and `hasWish` and writes the body's own attachment state; everything it
// declares is scoped inside it.
//
// Deps: `P` only (the body's fields and methods do the rest) — a near-leaf.
// ---------------------------------------------------------------------------
import { P } from "./config.js";

const attachMethods = {
  // ---- wall attachment (THE GENSHIN MODEL — see the `CLIMB_*` block in `P`) ----
  // A wall is taken by MEANING IT — but "meaning it" is now the STICK rather than a key: pushing
  // into a face is the grab, from the air and (session 137) from the deck. Once the body is ON the
  // face the grab SUSTAINS ITSELF — the climb's own press keeps the capsule flush, so a body that
  // stops steering hangs where it is instead of dropping the moment an input stops arriving (that
  // is the whole of what makes it read as a climb rather than as a grab). The ways OFF are
  // deliberate: climb down to the deck, JUMP off the face (the wall jump), or run the stamina out
  // (see the `climb` branch, which lets go hard). A wall RUN still never asks anything and still
  // gets first refusal on a wall that is beside you and not ahead; a FREE FALL still attaches to
  // nothing (the user's *"i cant grab ... or do anything other than moving"*); and a wall jump
  // still locks contact out briefly (`wallLock`), so the launch actually leaves the wall.
  tickWallAttach(inp, grounded, wx, wz, hasWish) {
    this.prevAttached = this.attached;
    const prevMode = this.attachMode;
    this.attached = false;
    this.attachMode = null;
    this.wall = null;
    // A DECK HAS NO GRIP ON A FACE (session 200): the wall run, the wall slide and the climb are all
    // solved onto the BODY's own limbs — a hand flat on the plate, a sole flat in the face — and a
    // body whose feet are on a board has neither hand nor foot free to spend on one. A ride that
    // reaches a wall rolls on into it, which is what a board does.
    if (this.board) return;
    const wallOk =
      !grounded &&
      !this.skyfall &&
      this.wallLock <= 0 &&
      this.state !== "dive" &&
      this.state !== "slam" &&
      this.state !== "dash" &&
      this.state !== "mantle" &&
      this.state !== "vault" &&
      this.state !== "ledge" &&
      this.state !== "wallbeat" &&
      this.state !== "launch";
    // ...and THE GRAB FROM THE DECK (session 137). Standing at a face and pushing into it takes it,
    // exactly as walking into a wall does in Genshin: no jump, no key, no run-up. The wall has to
    // actually NEED climbing (`tall`, see `CLIMB_GRAB_MIN_TOP`) or the deck is not a door onto it at
    // all — a kerb is a step, a crate is a vault, a chest-high lip is a mantle — and the jump wins
    // the frame it is pressed (`jumpBuffer <= 0`), so SPACE at a wall is still a jump and not a grab.
    // ...AND A STAFF IN HIS HANDS CLOSES THE WALL (the brief's third line, verbatim: *"if i cant
    // wall slide while holding the pole"*). What it closes is the GRIP: the climb (and the grab off
    // the deck that opens it), because both are a body hanging its weight off a face with BOTH
    // hands, and one of his is on a two-metre stick. What it leaves alone is everything that is a
    // LEAP or a STEP rather than a hold — the wall RUN still never asks anything, and the WALL JUMP
    // is still SPACE at a face — so a man carrying a staff can still work a wall, he just cannot
    // hang on it or slide down it.
    const noGrip = !this.holdingPole();
    const deckGrab =
      grounded &&
      noGrip &&
      this.state === "ground" &&
      !this.crouching &&
      this.jumpBuffer <= 0 &&
      this.wallLock <= 0 &&
      this.grip > 0;
    if (wallOk || deckGrab) {
      const hsW = Math.hypot(this.vel.x, this.vel.z);
      const moving = hsW > 1.0;
      const dirX = moving ? this.vel.x / hsW : hasWish ? wx : 0;
      const dirZ = moving ? this.vel.z / hsW : hasWish ? wz : 0;
      const w = this.pickWall(dirX, dirZ);
      this.wall = w;
      if (w) {
        const vn = this.vel.x * w.nx + this.vel.z * w.nz;
        const wishN = hasWish ? wx * w.nx + wz * w.nz : 0;
        const pressingIn = wishN < -0.25;
        // SESSION 141 — THE CLIMB IS A HELD KEY AGAIN. The user: *"dont make me wall climb when i
        // touch a wall make it only when space is held"*. Session 137's Genshin grab read the STICK
        // (`pressingIn`), so simply walking into a wall started a climb with no key at all. The
        // intent is now the key alone — SPACE, or the phone's CLIMB pad (`inp.climbHeld` is both) —
        // and it is the key that HOLDS the move too: let go and the body comes off the face, hold it
        // and stop steering and he HANGS (the climb branch reads its own flush sustain, so the hang
        // never needed the stick). The gap/press reading of session 137 survives only as a reading
        // of the face for the wallStick/slide/look-down logic, not as a way IN.
        //
        // ...which is where session 148 leaves it, with one more turn of the screw: the KEY is the
        // way in, but only a key pressed OFF THE GROUND (see `climbHoldAir`, and `canGrab` below).
        const grabIntent = inp.climbHeld;
        const climbing = prevMode === "climb";
        // ...AND IT TAKES A HOLD THAT BEGAN IN THE AIR (session 148 — see `climbHoldAir` where it
        // is stamped). A hold carried up off the deck is a JUMP, not a climb, however long it stays
        // down: the user's *"only be done if press space once then hold space again"*.
        const canGrab = inp.climbHeld && this.climbHoldAir && noGrip;
        const pushingOut = !climbing && wishN > P.WALL_ARROW;
        if (pushingOut) this.wallStick = 0;
        else if (pressingIn || vn < -0.7 || (this.wallStick > 0 && vn < 0.2)) this.wallStick = P.WALL_STICK;
        // A deck grab is only ever a CLIMB, and only of a face that is tall enough to need one (see
        // `CLIMB_GRAB_MIN_TOP`): a short face is the step/vault/mantle ladder's business.
        const tall = w.topY - (this.pos.y - P.HY) >= P.CLIMB_GRAB_MIN_TOP;
        const climbReady = canGrab && this.grip > 0 && !this.prevWallRun && (!deckGrab || tall);
        // ---- the AUTO LEDGE GRAB ----
        // It is checked first, so a wall whose top is in the hands' window is caught before the
        // slide or the climb can take it — nothing is pressed, because this is the one wall move
        // that happens TO you. The window is `ledgeTarget`'s, a wall RUN is excluded (that move is
        // the one that never asks anything, and it should not be stolen from you by a ledge halfway
        // along), and the face is found by `ledgeFind` — over EVERY sensed wall, not just the one
        // `pickWall` named for the line of travel.
        //
        // THE INTENT (session 159). It used to be the slide's own (`wallStick`: you are moving or
        // steering into the face) or the grab key. That is now the FLOOR rather than the whole gate,
        // and it is read off THE LEDGE'S OWN FACE rather than off `pickWall`'s: `wallStick` is about
        // the ONE wall the line of travel named, so a ledge met on the diagonal — where the travel
        // line's wall is some other face, or no face at all — was refused even with the lip in the
        // hands' window. `lvn`/`lwish` are the same two readings the slide uses (moving into the
        // face, steering into it) but taken against the face `ledgeFind` actually chose, and the
        // AIR keeps the widest gate of all: a lip the body is simply not moving away from is caught
        // too (see `LEDGE_CONE`). All three are the user's *"to ledge grab u dont have to be angle
        // perfect"* — a diagonal or glancing approach takes a ledge the same way a square one does.
        // What still will NOT fire is running along a face (nothing toward it), because that is a
        // brush, not an arrival.
        const lt = this.ledgeCd <= 0 && prevMode !== "run" ? this.ledgeFind(dirX, dirZ) : null;
        const lvn = lt ? this.vel.x * lt.w.nx + this.vel.z * lt.w.nz : 0;
        const lwish = lt && hasWish ? wx * lt.w.nx + wz * lt.w.nz : 0;
        const pressFacing = !!lt && (lvn < -0.7 || lwish < -0.25);
        const ledgeWant = lt && (grabIntent || this.wallStick > 0 || pressFacing || (wallOk && lt.toward > P.LEDGE_CONE));
        if (ledgeWant) {
          this.startLedge(lt.w, lt.t);
        } else if (climbReady) {
          this.wallNx = w.nx;
          this.wallNz = w.nz;
          this.wallCoyote = P.WALL_COYOTE;
          const t = this.mantleTarget(w);
          if (t) this.startMantle(t);
          else {
            this.attached = true;
            this.attachMode = "climb";
            this.climbing = true;
            if (deckGrab) {
              // The grab off the deck has to actually take the feet off the ground: leaving
              // `grounded` true would be undone by the very next frame's ground/air flip, and the
              // little lift is what makes the take read as a body climbing onto the face.
              this.grounded = false;
              this.prevGrounded = false;
              this.vel.y = Math.max(this.vel.y, P.CLIMB_GRAB_LIFT);
              this.setState("air");
            }
          }
        } else if (wallOk && noGrip && !this.prevWallRun && !climbing && this.wallStick > 0 && this.vel.y < P.WALL_SLIDE + 1.6) {
          this.wallNx = w.nx;
          this.wallNz = w.nz;
          this.wallCoyote = P.WALL_COYOTE;
          this.attached = true;
          this.attachMode = "slide";
          this.wallSliding = true;
          // ---- THE CATCH IS TAKEN WHOLE (session 144) ----
          // The user: *"when i wall slide or wall jump in a wall it looks bad like my arms is not
          // there its in the wall fix that make me a bit further from the wall to show the arm"*.
          // The stand-off was the first half of that (see `P.WALL_SLIDE_HUG`, re-tuned 0.52 -> 0.26
          // this session so the brace palm lands ON the plate instead of 0.25 u inside it); this is
          // the second half, and it is about the ENTRY rather than the hold.
          //
          // A slide's contacts are SOLVED onto the face — the anchor sole and the brace palm are
          // both placed on the plate by `poseWall`'s `slide` branch — and the branch is authored for
          // the wall BESIDE the body (its whole `mirror` is written for `sideSign < 0`). Neither can
          // be blended in from the pose the body was wearing an instant earlier, and until now both
          // were: the pose faded in over `WALL_POSE_FADE` (0.18 s) and the facing came round onto the
          // wall's tangent at the branch below's rate 12, so over the first ~10 frames the rig was
          // still half the AIRBORNE pose with the body still half head-on — and an airborne arm
          // thrown from the shoulder reaches clean THROUGH the face on its way to a brace that is
          // authored to land on it. Measured on the live rig at a run-up catch (a 3.7 u/s run at this
          // tower's stone, a jump, then holding into it): the wall-side hand's deepest vertex ran
          // 0.35 u PAST the plate on the first frame and 0.32 / 0.28 / 0.18 over the next three, i.e.
          // the palm sat inside the stone for about 0.15 s — which is the *"arm is not there"* the
          // user was seeing — and, because it is the airborne arm's own swing that carries it in, it
          // depended on the stride phase at the catch: 0.27 to 0.35 across four attach times on the
          // same face.
          //
          // So the catch now takes the whole pose on the frame the wall is taken (`wallPose = 1` —
          // the same way the ground SCISSOR takes its follow whole, and the same way the wall JUMP
          // squares the body in one frame: a set of contacts is not a thing to ease into), and it
          // squares the body onto the wall's tangent in the SAME frame, because the brace's `mirror`
          // assumes the wall is already beside it. Measured with the pose taken whole but the turn
          // left to the branch below's own rate: the palm still ran 0.27 deep on the catch frame (the
          // arm reaching ACROSS a body that is not yet side-on to the face) and 0.20 / 0.12 / 0.06
          // after it. Squared in the same frame instead, over the same four attach phases: the worst
          // the wall-side hand ever gets is 0.000, and the whole body's worst is 0.021 — the anchor
          // sole, which is the contact's own planned press. The facing branch below still HOLDS the
          // tangent at its own rate for the rest of the slide, so a slide already in progress is
          // unchanged.
          const slideTx = -w.nz;
          const slideTz = w.nx;
          const slideSgn = Math.sin(this.facing) * slideTx + Math.cos(this.facing) * slideTz >= 0 ? 1 : -1;
          this.facing = Math.atan2(slideTx * slideSgn, slideTz * slideSgn);
          this.wallPose = 1;
        }
      }
      // ---- wall run ----
      // Checked *after* the slide/climb so that pressing INTO a wall still means the slide; this one
      // only fires when the wall is beside you (and never from the deck).
      if (wallOk && !this.attached && this.state !== "ledge") this.tryWallRun();
    } else if (this.walls.length) {
      this.wall = this.pickWall(wx, wz);
    }
    if (this.climbing || this.wallRunning) this.jumpsLeft = P.AIR_JUMPS;
    if (this.attached && !this.prevAttached) {
      this.events.push(this.attachMode === "climb" ? "wallgrab" : "wallstick");
      if (this.sfx) this.sfx.wallGrab();
    }
  },
};

export function installAttach(Player) {
  Object.assign(Player.prototype, attachMethods);
}
