// ---------------------------------------------------------------------------
// THE JUMP (part 41 of the player.js split).
//
// The whole of `update`'s `//// ---- jumping ----` block, lifted out and called back from the
// same spot: the GROUND JUMP (with the deck's own rise added back on a slope, and the BHOP
// chain's boost off a fresh landing), the jump OUT OF THE MIDDLE OF A MOVE, the WALL JUMP and
// the DOUBLE JUMP (with its variant picker), the pole launch and the jump-press gate that
// refuses a committed state. It reads the frame's `grounded`, `speed2D`, the wish (`wx`/`wz`)
// and its flag (`hasWish`) — no `dt`, no `inp` — so those four are handed in as arguments.
//
// The body is VERBATIM, at its original indentation, and its comments came with it. Deps: `P`
// (./config.js) and `nextJumpVariant` (./wallrun.js), which is the jump's own sibling of the
// wall kick's variant picker.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { approach } from "./math.js";
import { AIR_POSE_FADE } from "./pose.js";
import { nextJumpVariant } from "./wallrun.js";

const jumpMethods = {

  tickJump(grounded, speed2D, hasWish, wx, wz) {
    // ---- jumping ----
    // A COMMITTED move does not let go of a jump press: the four it always refused (the slam, the
    // hammer, the mantle and the ledge) — and now the three SKILLS with them, the user's *"you cant
    // jump or move around when doing skills you can only turn your camera around"*, and the melee
    // chain's own committed moves with THEM (see the gate below). So the press
    // sits in `jumpBuffer` and, if the move ends inside that window, the jump comes out of the end
    // of it rather than off the deck at the wrong moment. A wall jump only takes over from the
    // double jump when you are genuinely working a wall (sticking to it, climbing it, or within the
    // coyote grace of one) — brushing past a wall no longer eats your double jump.
    // ...AND THE VAULT IS ON THE LIST NOW (`polevlt`, session 185). The old balance could not be:
    // it held for as long as the button was DOWN and fired the launch on the RELEASE, so a gate that
    // ate the press would have left the player hanging on a stick with the release never arriving.
    // The vault is a one-shot on its own clock — the press that opens it is spent, and nothing the
    // player does after it changes its timing — so it belongs here with the rest of the committed
    // moves: a press during the flip sits in `jumpBuffer` and comes out of the END of it (where
    // `jumpsLeft` is already 0, so it is simply dropped) rather than cutting the flip short.
    if (this.jumpBuffer > 0 && this.state !== "slam" && this.state !== "smash" && this.state !== "mantle" && this.state !== "ledge" && this.state !== "vault" &&
      this.state !== "whirl" && this.state !== "scissor" && this.state !== "capo" && this.state !== "knee" && this.state !== "grab" &&
      this.state !== "wallbeat" && this.state !== "polevlt" &&
      // ...AND THE DECK REFUSES A JUMP OUTRIGHT (session 200): SPACE on a board is the OLLIE, which
      // the ride's own tick reads against the wheel that is actually on the deck (see
      // `tickRideState`). A body that is in the air on one cannot jump either — there is nothing to
      // jump OFF — which is what the powerslide and the bomb are doing on the same list.
      this.state !== "ride" && this.state !== "bslide" && this.state !== "bbomb" &&
      // ...and the MELEE CHAIN lets go of a jump on its THIRD move only. The sweep is the chain's own
      // jump-out beat — it is the move that leaves a body hanging (`COMBAT_KIND[2]`), so the jump out
      // of it is the first half of the sweep-jump-slam string and it has to be instant — while the
      // knee, the clinch and the one-two are the chain's committed moves: a press during them sits in
      // `jumpBuffer` and comes out of the END of the move if that is inside the buffer, and is simply
      // dropped if it is not (the user's *"only allow it for the 3rd m1"* — a jump cannot cut the
      // first two, or the finisher, short). `combo` is written by `startAttack` as the move's own
      // PLACE in the string (`i + 1`, wrapping to 0 past the finisher), so `combo >= 3` is exactly
      // "the sweep is the live move" — and it is the same reading the finisher's own window below is
      // opened on, so the one gate cannot drift from the other.
      (this.state !== "attack" || this.combo >= 3)) {
      const onWall = this.wallSliding || this.climbing || this.wallRunning || this.wallCoyote > 0;
      if (grounded || this.coyote > 0) {
        const slideJump = this.state === "slide";
        // ...and a jump thrown out of the MIDDLE of a move is still a jump out of that chain: the
        // sweep is 0.44 s long and a player who jumps the moment the leg comes round is jumping
        // while `combo` still sits on the finisher, with no `comboGrace` yet to show for it (the
        // grace is only written when a move ENDS). Caught before `setState("air")` overwrites it.
        const outOfMove = this.state === "attack";
        // ...and the queue goes with it: a chained move that was already waiting behind this one is
        // dropped by the jump rather than fired on some later frame (the jump broke the chain, so the
        // press that belonged to it is not owed anything).
        if (outOfMove) this.attackNext = false;
        // ...and THE DECK HE IS LEAVING IS A SLOPE (see "THE SLOPE"): a body running up a flank is
        // CARRIED up it by the deck, so a jump has to be measured FROM the deck's own rise — the
        // vertical speed the ground is already giving him. It is not a detail: measured on a
        // 27-degree flank, the same jump rose 0.98 u at 6 u/s and 0.00 u at 24, because the ground
        // rose as fast as the jump left it — which is exactly what spamming jump up a hill does,
        // since the bhop chain builds that speed and then every hop is swallowed (the user's *"try
        // to spam jump while walking up hill it looks weird"*). Adding the rise back puts the SAME
        // jump on the flank as on the flat: the body's rate RELATIVE to the deck is `JUMP_V +
        // bonus` again, so the arc he sees is the arc he always sees, at any speed, on any grade.
        // Downhill `rise` is negative and is not added — a jump off a downslope is not boosted.
        const rise = this.onSlope ? this.vel.x * this.slopeGx + this.vel.z * this.slopeGz : 0;
        this.vel.y = P.JUMP_V + Math.min(speed2D, P.SPRINT) * P.JUMP_SPEED_BONUS + Math.max(0, rise);
        if (slideJump) {
          const k = 1.1;
          this.vel.x *= k;
          this.vel.z *= k;
        }
        if (this.landTimer <= P.BHOP_WINDOW) {
          this.chain++;
          const sp = Math.hypot(this.vel.x, this.vel.z);
          if (sp > 0.3) {
            const k = Math.min(P.BHOP_BOOST, P.MAX_SPEED / sp);
            this.vel.x *= k;
            this.vel.z *= k;
          }
          this.events.push("chain");
        } else {
          this.chain = 0;
        }
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.grounded = false;
        this.airFromJump = true;
        this.setState("air");
        // ...and a jump made with the FINISHER next keeps the chain's place and opens the airborne
        // window (see `P.COMBAT_AIR_FINISH`): the sweep leaves the chain sitting on the finisher,
        // so the jump out of it is the first half of the sweep-jump-slam string. This is the OTHER
        // door into the window — the move can also be broken by leaving the ground MID-move, which
        // the attack block above catches — and it is the common one, because the sweep is short and
        // the jump usually comes while its leg is still coming round (`outOfMove`) or in the grace
        // just after it. Both are the same press as far as the player is concerned.
        if (this.combo >= 3 && (this.comboGrace > 0 || outOfMove)) {
          this.airFinisherT = P.COMBAT_AIR_FINISH;
          this.combo = 3;
          this.comboGrace = P.COMBAT_AIR_FINISH;
        }
        this.squash = -0.65;
        if (this.sfx) this.sfx.jump();
        this.events.push("jump");
        this.jumpVariant = nextJumpVariant(this.jumpVariant);
      } else if (onWall && this.wallCd <= 0 && this.wallJumpNormal()) {
        const n = this.wallJumpNormal();
        const hsBefore = Math.hypot(this.vel.x, this.vel.z);
        const vn = this.vel.x * n.nx + this.vel.z * n.nz;
        let tx = this.vel.x - n.nx * vn;
        let tz = this.vel.z - n.nz * vn;
        // Keep the tangential speed (that is the momentum you came in with) but bend its
        // direction toward the way you are holding, so you can aim a wall jump along a wall.
        const tmag = Math.hypot(tx, tz);
        if (hasWish && tmag > 0.05) {
          const tnx = -n.nz;
          const tnz = n.nx;
          const wt = wx * tnx + wz * tnz;
          if (Math.abs(wt) > 0.12) {
            const s = wt > 0 ? 1 : -1;
            const k = P.WJ_AIM * Math.min(1, Math.abs(wt) * 1.6);
            const dx = tx / tmag + (tnx * s - tx / tmag) * k;
            const dz = tz / tmag + (tnz * s - tz / tmag) * k;
            const l = Math.hypot(dx, dz) || 1;
            tx = (dx / l) * tmag;
            tz = (dz / l) * tmag;
          }
        }
        const push = Math.max(P.WJ_PUSH, Math.max(0, -vn) * 0.9);
        this.vel.x = tx + n.nx * push;
        this.vel.z = tz + n.nz * push;
        this.vel.y = P.WJ_UP + Math.min(2.4, hsBefore * 0.1);
        this.wallCd = 0.26;
        this.wallLock = P.WALL_LOCK;
        this.wallStick = 0;
        this.jumpBuffer = 0;
        this.grip = Math.max(0, this.grip - 0.1);
        this.facing = Math.atan2(n.nx, n.nz);
        // ...AND THE VISUAL PRESS GOES WITH THE WALL, on this very frame. The press (see
        // `P.WALL_SLIDE_HUG` and the `hug` block in `updateVisual`) is not the body's own offset —
        // it is the WALL POSE's, worn only so the pose's solved contacts land on the plate, and a
        // wall jump ends that pose and turns the body square away from the face in the same frame.
        // What the turn does to a trailing limb is the whole reason this line is here: the slide's
        // counterweight leg trails most of a metre behind the hips (it is the brace's balance, and
        // during the slide it trails ALONG the face where nothing is in its way), so a body left
        // pressed in when it comes round sweeps that leg straight through the stone. Measured on the
        // tower's face at 0.26, with the press left to ease out (`hug` closes at 8/s): the trailing
        // foot's deepest vertex went **0.48 u inside** the plate on the launch frame, 0.26 on the
        // next and 0.04 on the one after — three frames of a leg buried in the wall. Released here
        // it is one frame at 0.26 (the same marginal graze a plain jump beside a wall has, whose
        // trailing foot reaches 0.65 behind the hips against the capsule's 0.6), then clear.
        // The press belongs to the wall; the moment the wall is behind him the rig is put back on
        // the capsule, which is the only position the world's own geometry vouches for.
        this.hug = 0;
        this.squash = -0.4;
        if (this.sfx) this.sfx.wallJump();
        this.events.push("walljump");
        this.jumpVariant = nextJumpVariant(this.jumpVariant);
        this.jumpsLeft = P.AIR_JUMPS;
        this.attached = false;
        this.attachMode = null;
        this.wallSliding = false;
        this.climbing = false;
        this.wallRunning = false;
        this.airFromJump = true;
        this.wallCoyote = 0;
      } else if (this.jumpsLeft > 0) {
        // ...AND WITH A STAFF IN HIS HANDS THE SECOND PRESS DOES NOT LEAP — IT VAULTS. Session 184's
        // brief, verbatim: *"make when the player double jump its not holdable anymore the player
        // does a front flip with the stick aiming forward and he stirkes the ground with it wich
        // launches far forward in the air"*. So the double jump is spent on `polevlt`: a front flip
        // with the shaft driven forward and down, and the beat its tip meets the deck is the launch
        // (see `poleVault` / `updatePoleVault` / `poleVaultLaunch`). It REPLACED the Shaolin balance,
        // which used to hang him off the top of the stick — the *"not holdable"* of the brief.
        //
        // The FIRST jump is untouched — a carried staff does not stop a man jumping — and the wall
        // jump above is untouched too, because the brief takes the wall SLIDE away and not the wall
        // itself. The press is consumed here (the buffer is cleared, the air jump spent) whether he
        // vaults or leaps.
        this.jumpsLeft--;
        if (this.poleHeld) {
          this.jumpBuffer = 0;
          this.poleVault();
        } else {
          // ...and THE SECOND LEAP IS MEASURED FROM THE DECK UNDER HIM TOO (see the ground jump
          // above), which it needs more than the first one does: `AIR_JUMP_V` is 9.9 against
          // `JUMP_V`'s 10.7, and the second press arrives a few frames after the take-off, so the deck
          // has had longer to climb into him. Measured on the 27-degree flank, leap at frame 3 and
          // second press at frame 12, as the body's clearance over the deck at 2 / 8 / 16 / 24 u/s:
          // WITHOUT this it peaked at 2.50 / 2.53 / 2.33 / 2.63 and then SANK back to 2.00 / 2.03 /
          // 1.25 / 0.90 — the second press bought nothing, the flip played out on the grass, and that
          // is the whole of what *"try to spam jump while walking up hill it looks weird"* was looking
          // at (the first leap, which session 138 fixed, reads correctly and was never the one at
          // fault). WITH it the clearance keeps climbing after the press — 3.47 / 3.51 / 3.66 / 5.73 —
          // against 4.54 / 4.61 / 4.70 on level deck, the difference being simply that the flank goes
          // on rising under him for the rest of the arc. The reading cannot come off `readSlope`: a
          // body in the air is `onSlope === false` by construction, so the gradient is taken under the
          // body here, and only while the deck is inside `AIR_JUMP_DECK` — near enough that this really
          // is the ground he is leaping from rather than a hillside far below a dive.
          let rise = 0;
          const world = this.world;
          if (world && world.terrainHeight) {
            const floor = world.terrainHeight(this.pos.x, this.pos.z);
            if (this.pos.y - P.HY - floor < P.AIR_JUMP_DECK) {
              const e = P.SLOPE_PROBE;
              const gx = (world.terrainHeight(this.pos.x + e, this.pos.z) - world.terrainHeight(this.pos.x - e, this.pos.z)) / (2 * e);
              const gz = (world.terrainHeight(this.pos.x, this.pos.z + e) - world.terrainHeight(this.pos.x, this.pos.z - e)) / (2 * e);
              rise = Math.max(0, this.vel.x * gx + this.vel.z * gz);
            }
          }
          this.vel.y = P.AIR_JUMP_V + rise;
          if (hasWish) {
            this.vel.x += wx * P.AIR_JUMP_PUSH;
            this.vel.z += wz * P.AIR_JUMP_PUSH;
          }
          this.jumpBuffer = 0;
          this.flipT = P.FLIP_TIME;
          this.squash = -0.6;
          this.airFromJump = true;
          if (this.sfx) this.sfx.doubleJump();
          this.events.push("doublejump");
          this.jumpVariant = nextJumpVariant(this.jumpVariant);
        }
      }
    }
  },

  // THE AIR FAMILY'S OWN POSE LAYER (lifted out of `updateVisual`): the jump/fall shapes, riding the
  // vertical velocity and the variant the jump picked. The dive, slam, roll, vault and wall
  // attachments each own the body while they run, as does the skyfall, so it stands down for them.
  solveAirPose(dt, ud) {
    const airWant = !this.grounded && this.state === "air" && !this.attached && !this.skyfall ? 1 : 0;
    this.airPose = approach(this.airPose, airWant, dt / AIR_POSE_FADE);
    if (ud && ud.poseAir && this.airPose > 0.002) {
      ud.poseAir(this.airPose, Math.max(-1, Math.min(1, this.vel.y / 7)), this.jumpVariant);
    }
  },

  // THE DOUBLE JUMP'S FLIP TUCK (lifted out of `updateVisual`). The flip tucks the same ball the
  // roll does, on an envelope, so it closes in and opens back out instead of popping the tuck on
  // and off mid-spin.
  solveTuckPose(ud) {
    this.flipPose = this.flipT > 0 ? Math.sin(Math.PI * (1 - this.flipT / P.FLIP_TIME)) : 0;
    if (ud && ud.poseTuck && this.flipPose > 0.002) ud.poseTuck(this.flipPose, 0.85);
  },
};

export function installJump(Player) {
  Object.assign(Player.prototype, jumpMethods);
}
