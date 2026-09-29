import * as THREE from "./three.js";
import { createMaterial } from "./ps1.js";
// ...and the player's own constants, for the ONE thing in here that has to know how tall he is: the
// boot's reach (see `inFootReach`). `player.js` imports nothing from this file, so there is no loop.
import { P } from "./player.js";
// ...and the rate-limited step, for the charge meter's own fade (see `publishCarry`). A leaf module,
// the same one every blended weight in the player uses.
import { approach } from "./player/math.js";

// ================================================================================================
// THE BAG + POCKETS  (`src/inventory.js`)
// ------------------------------------------------------------------------------------------------
// The game's whole "stuff" layer. Four pieces, one system:
//
//   1. THE WORLD BAG — one duffel standing at the spawn. It is a real prop: gravity, ground
//      collision, a body that kicks it, a throw, and damage that runs INTO its contents.
//   2. THE POCKETS — the player's three (LEFT / RIGHT / BACK), each a 1 x 2 tetris holder. You
//      only have those three until you are wearing a bag (future pants will change the count).
//   3. THE EDITOR (HOLD TAB, or E on the bag) — no backdrop and no dialog: the camera swings round
//      to the holder being edited (a station per holder, so changing holder shifts the view), the
//      head follows the mouse, and the holder's board is drawn ON the patch of the body it lives on
//      (the board tracks the live hip bone every frame). Every OTHER holder is a floating name with a
//      chunky arrow head on its shoulder pointing at the part; drag an item onto a name and it moves
//      to that holder, drag it off the boards entirely and it falls into the world.
//   4. THE QUICK MENU (TAP TAB) — no cinema. Two pocket boards fade in low on the screen, one a
//      couple of inches off each side of centre so they sit beside the controls rather than
//      under them, and 1 / 2 take that pocket. One second with no press and it is gone.
//
// THE FALL PHYSICS. Holders are not static grids. A placement has an integer cell (`gx`,`gy`),
// a fractional offset into the cell below (`off`), a vertical speed in cells/second (`vy`) and a
// landing squash (`sq`). An unsupported item accelerates down at `GRID_FALL`, steps a cell at a
// time when it has fallen a whole one, and a hard landing squashes it flat for a moment and gives
// it a small hop. So a key dropped into a pocket topples to the bottom and settles there, and
// pulling the thing underneath it out lets it drop again — the grid behaves like a box of parts,
// not like a spreadsheet.
//
// THE HOLDERS WEAR THEIR OWN COLOURS. A pocket's board is denim (stitched, riveted); the bag's is
// grey nylon with a reflective band along the zip. The grid, the frame and the label arrows all take the
// holder's palette, so what you are looking at always reads as the thing it is.
// ================================================================================================

let nextItemId = 1;

// ---- the grid's own gravity, in cells ------------------------------------------------------
const GRID_FALL = 30; // cells / s^2
const FALL_MAX = 24; // terminal speed, cells / s
const HARD_LAND = 5.5; // a landing faster than this squashes and hops
const BOUNCE_KEEP = 0.15; // share of a hard landing that comes back up as a hop
const SQUASH_T = 5.5; // how fast a landing's squash unwinds
const ENTER_T = 3.2; // how fast a freshly-placed item drops into its slot
// ...and how far a press on a tile may travel and still be a CLICK rather than a drag (see the
// press/click split in `onItemDown` / `onDragMove` / `onDragUp`). A hand holding a button still
// jitters a pixel or two, so the two verbs are told apart by whether the pointer has MOVED.
const DRAG_SLOP = 5; // px
// ...and HOW MUCH WIDER THAN ITS PICTURE a tile's target is (see the `.invPad` note in `itemEl`).
// A 1 x 1 item is one cell — 30 px on a desk, 26 on a phone — so every tile gets a few pixels of
// slack on all four sides, and a label's little board gets a shade more because its cells are 13.
const PAD_HIT = 4; // px
const PAD_HIT_TAG = 5; // px

// ---- the world props' physics --------------------------------------------------------------
const GRAV = 26;
// ...and THE PROPS' OWN WALLS. A loose prop used to have a FLOOR and nothing else: it fell, it
// landed, and everything between it and the ground — every block, kerb, terrace, spire and the
// whole of the landmark tower — was air to it. Kicked at a building it came out the far side.
//
// A prop is now a box of its own `radius` and it is resolved against the world's live colliders,
// the same way the body is (`moveAxis` in player.js): one axis at a time, pushed back out along
// the axis it was travelling, with what went into the face coming back off it. Because the
// colliders come off the same piece list the destructible world is built from, a prop's walls are
// the walls that are THERE — smash a hole in one and the prop goes through the hole.
const PROP_STEP = 0.18;      // world units of travel per substep — nothing may tunnel through a kerb
const PROP_STEP_MAX = 16;    // ...and the most substeps one frame may take
const PROP_REST = 0.34;      // what a prop keeps of the speed it went into a face with
const PROP_WALL_SCRUB = 0.90;// ...and of the slide along that face (a scrape, not a brake)
const PROP_EDGE = 0.0001;    // the hair of clearance a resolve leaves, so it cannot stick
// The speed at which a duffel hitting a WALL starts to hurt it. Raised well above the deck's own
// 7 (`damageBag` pays ~40 a knock, and a sprint-kick into a building is a 13 u/s throw — at the
// deck's threshold three of them would end the bag). Only a genuine slam into a face bruises it.
const BAG_WALL_HARD = 20;
// ---- THE PROPS' OWN ANGLES (see "ANGLE PHYSICS" in `stepSpin`) --------------------------------
// A prop's turn used to be ONE number about the vertical: a drop wore `mesh.rotation.y += spin*dt`
// and the duffel a `yaw`, so a key kicked across the street slid like a coin on a table and a
// thrown bag span like a compass needle. Both now carry a real angular velocity — a world-space
// vector, integrated into a quaternion — and what makes it turn is the surface they are ON:
//
//   * NO-SLIP ROLLING. A prop on the deck rolls about the axis across its own travel at the rate
//     its surface demands (`omega = (up x v) / r`), which is why a bag tumbles end over end when it
//     is kicked and a key rolls on its own curve, and why the tumble dies with the speed instead of
//     with a separate timer: the two are the same number.
//   * THE AIR DOES NOT SPIN IT. Airborne, the spin only bleeds (`PROP_ANG_AIR`); whatever tumbling
//     a thrown prop does, the THROW did (see `spinFrom`).
//   * A FACE STOPS A SPIN. The deck holds a prop on its side, so the yaw bleeds hard there
//     (`PROP_ANG_GROUND`) — what is left when it comes to rest is a prop lying on a FACE, not a
//     prop frozen mid-turn (see `settleSpin` and `PROP_REST_AXES`).
const PROP_ANG_AIR = 0.12;     // /s a free prop's tumble bleeds off
const PROP_ANG_GROUND = 5.0;   // /s the yaw bleeds off while the deck is holding it
const PROP_ROLL_GRIP = 9.0;    // how fast a grounded prop is dragged onto its no-slip rate
const PROP_ROLL = 0.72;        // ...and what share of the true (perfectly gripping) rate it takes
const PROP_ANG_MAX = 44;       // rad/s ceiling: enough that nothing the GAME authors is clipped (the
                               // slam leaves the duffel turning at `SLAM_SPIN`, 38, and it has to
                               // stay the blur it was tuned to be), and enough to stop a blend or a
                               // bounce running away into a spin the picture cannot show.
const PROP_SETTLE_V = 1.15;    // u/s under which a grounded prop starts lying itself down
const PROP_SETTLE_W = 3.2;     // rad/s ...and under which it is slow enough to bother
const PROP_SETTLE_RATE = 4.2;  // how fast the last of the tumble is laid onto the face
// Which of a prop's OWN axes it can come to rest on, as unit vectors in its own space. Every one
// of a bag's six faces is a stable rest (it can be left on its base, its end or its side), but a
// key's only stable rest is FLAT — left to the nearest-axis rule alone it would settle standing on
// the bow's rim, which is not a thing a key does.
//
// A SPHERE is the third case and it needs neither: there is no face to be squared up onto, so the
// ball's def carries `settle: false` and the last of its tumble is simply bled away (see `stepSpin`).
const PROP_REST_AXES = {
  bag: [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]],
  keys: [[0, 0, 1], [0, 0, -1]],
  // ...and THE SKATEBOARD rests on its WHEELS and on nothing else: its own down vector is the only
  // face it has (see the note on the board's def in `ITEM_DEFS`). So a board knocked over lays
  // itself back down flat instead of freezing nose-down on a tip.
  board: [[0, -1, 0]],
};
// The radius a prop TURNS on, which is not the radius it collides on: the duffel's collider is a
// hairline 0.06 (it is a soft bag and the body has to be able to walk into it) but a duffel is half
// a unit across, and rolling it on the collider's radius would spin it nineteen times a second.
// ...and the BOARD is the odd one out on purpose: its own rolling radius would be a wheel's 0.045,
// and a kicked board would then be a strobe (0.045 at 10 u/s is 222 rad/s against a 44 ceiling). It
// is given the deck's own half-length instead, which is what a skateboard actually does when it is
// not riding: it flips end over end, not round a wheel.
const PROP_ROLL_R = { keys: 0.17, bag: 0.77, ball: 0.28, board: 0.34 };
const BAG_HOME = { x: 5.9, z: 3.6 }; // "at the spawn" — the player wakes at (5, 5)
const BAG_W = 5;
const BAG_H = 4;

// ---- THE BALL (session 178) -------------------------------------------------------------------
// A soccer ball, lying at the spawn a couple of metres off the duffel. It is a PROP in the ordinary
// sense — it is a `drop`, so the boot, the wall collision, the ground roll, the pickup and the
// prompt are all machinery that already exists — and what makes it read as a BALL rather than as a
// bag of parts is four numbers of its own:
//
//   * it is ROUND, which is not a decoration: a prop's support height and its settle-to-a-face are
//     both read off the BOX it is drawn as (`propSupport`, `settleSpin`), and a sphere read off its
//     own bounding box rests half-sunk in the deck and then visibly rotates its pattern to square
//     when it stops. `round` and `settle: false` on its def are what turn both of those off.
//   * it BOUNCES and it KEEPS ROLLING (`bounce` / `drag` / `spinDrag`), because a ball that stops
//     like a duffel is not a ball.
//   * it is allowed to TURN faster before the strobe ceiling clips it (`angMax`): a box's cap is 44
//     rad/s, and a 0.14-radius ball rolling at a kicked 10 u/s wants 51.
//
// SESSION 179 made it BIGGER (the user's *"make all the balls bigger"*): 0.14 → **0.24** world
// units of radius, i.e. a 0.48-unit ball against a 1.9-unit body — a ball you can see the panels
// on and put a whole boot through, rather than a marble at the feet. SESSION 180 pushed it again
// (the user's *"make the soccer a little more bigger"*): **0.28**, a 0.56-unit ball, which is a
// shade over a quarter of the body's own height and reads unmistakably as a ball at the chase
// camera's distance. Everything else follows the radius for free, which is the point of the shape
// being a NUMBER and not a mesh: the rest height is `radius` (`propSupport`), the roll rate is
// `radius` (`stepSpin`), the turn it is allowed before the ceiling clips it is read off the radius,
// and the scuff is drawn at `BALL_R * …`. The one read-out that changes with it is the spin a kick
// wants: 0.28 at a struck 14 u/s wants 50 rad/s where 0.24 wanted 51, and `angMax` 70 is still
// clear air rather than a ceiling (see the shoot's own launch in `shootLaunch`).
const BALL_R = PROP_ROLL_R.ball;      // world units — the ball's radius, and so the radius it TURNS on
const BALL_HOME = { x: 3.4, z: 6.3 }; // where it lies at the start (the player wakes at (5, 5))
const BALL_W = 2;                     // ...and the footprint it takes on a board, in cells
const BALL_H = 2;

// ---- THE SKATEBOARD (session 200) --------------------------------------------------------------
// The user: *"add skateboard and make me able to get on it and do flips with it and stuff ... make
// the slide mech and dive and all the stuff unqiue for it not the same make able to get on it by
// pressing E"*.
//
// It is an ordinary PROP in every way the game cares about — a `drop`, so gravity, the wall, the
// ground, the damage, the pickup and the prompt are machinery that already exists — with three
// things of its own:
//
//   * IT IS TAKEN WITH `M2` AND RIDDEN WITH `E` (`takeM2`, exactly the ball's bargain in reverse).
//     `E` is the brief's own word for getting on it, so `E` may not also be "pick it up": the hand
//     takes a board with the right button and the feet take it with `E` (see `interact` /
//     `mountBoard`), and the prompt names both.
//   * IT RESTS ON ITS WHEELS AND ON NOTHING ELSE. `PROP_REST_AXES.board` is the deck's own down
//     vector alone, so a board left on its side lays itself flat rather than freezing nose-down, and
//     its support height is the box the mesh is drawn with (wheel underside to deck top).
//   * ITS DECK IS THE RIG'S OWN DECK once you are on it: mounting PARENTS the mesh to the tilt group
//     (see `mountBoard`), so the board, the shoes and the tilt of the ground are one thing and no
//     per-frame solve has to keep them together. Nothing else in the game does that with a prop —
//     the dropped ones are all world objects — which is why the mount and the dismount are the two
//     places that touch the parenting at all.
const BOARD_R = 0.50;                  // the radius the body collides with it on (its deck is long,
                                       // but a board is a thing you brush past, not a wall — kept well
                                       // under half the deck's length; widened from 0.34 in session 201
                                       // when the user's *"make the skate board bigger"* drew the deck
                                       // 1.5x, so the collider scaled with it)
const BOARD_HOME = { x: 7.2, z: 6.9 }; // where it lies at the spawn: past the ball, clear of the bag
const BOARD_W = 1;                     // ...and its footprint in a pocket board, in cells: 1 x 3,
const BOARD_H = 3;                     // i.e. it does NOT fit a pocket (1 x 2) and DOES fit the duffel
const BOARD_TAKE_R = 2.0;              // u: how close M2 has to be to take it into the hands


// ---- THE BOOT ---------------------------------------------------------------------------------
// What a running body does to a loose prop. `KICK_CD` is the gap between two punts — without it the
// contact test fired every FRAME the body was inside the prop, which is not a kick, it is a grind
// (see the note at the call site in `update`) — and `KICK_DEFAULT` is the punt an ordinary prop gets,
// the tumbling one a duffel or a key has always been hit with. A prop may name its own (`kick` in its
// def: the ball is struck flatter and harder, because a ball is not knocked over, it is passed).
const KICK_CD = 0.24;   // s between two kicks of the SAME prop
const KICK_DEFAULT = { v: 5, gain: 0.30, up: 3 };

// ---- THE BAG ON THE BACK --------------------------------------------------------------------
// A worn duffel is not a prop that is dragged along behind the capsule — it is a CHILD OF THE BODY.
// It is parented to the rig's own torso hinge, so the run's lean, the chain's trunk twist, a flip,
// a dive and a wall climb all carry it for free: the bag is welded on, and nothing has to remember
// to move it. That is why the offset below is in the RIG's units (world units divided by
// `charMesh.scale`, about 1.35) and the mesh is counter-scaled by the same number — the rig is
// built small and scaled into the world, so a prop parented inside it has to be told to stay the
// size it was authored at.
//
// `z` is measured off the torso's own BACK PLANE: the chest shell reaches z -0.129 in rig units, so
// the bag's base is set a shade INSIDE that (-0.26 + its own half-depth) rather than on it — a
// backpack is pressed against the back, not hovering beside it.
//
// `yaw` is the FACING fix. The bag's decorated face (the top zip, the front pocket, the piping) is
// its own +z, and +z on the rig is the way the CHARACTER looks — so worn at yaw 0 the bag wore its
// pockets into his spine. Half a turn puts the plain back panel against him and the pockets
// out where a passer-by sees them.
const BAG_WEAR = {
  bone: "torso",
  y: -0.04,
  z: -0.31,
  yaw: Math.PI,
};
const BAG_ITEM_W = 3;
const BAG_ITEM_H = 2;

// ---- THE DUFFEL IN BOTH HANDS (THE TOTE) ------------------------------------------------------
// The bag's third home. It used to have two: on the deck as a prop, and on the back as `BAG_WEAR`.
// Now it has three, and the middle one is the handful — E AND the right button together, thrown at
// the same moment, takes the duffel up into BOTH ARMS (see `takeInHands`). While it is up there it
// is again a CHILD OF THE RIG (the same torso hinge, counter-scaled the same way), so the run's
// lean, a slide, a vault and a jump all carry it for free; the pose only has to bring the arms
// around it (`poseTote` in streetwear.js).
//
// `yaw` is 0 here and PI on the back, and that difference is the whole read: the bag's decorated
// face (the top zip, the front pocket, the piping) is its own `+z`, and `+z` on the rig is the way
// the character looks — so carried it wears the pockets FORWARD, out to the world, while worn it
// has to be half a turn round (see `BAG_WEAR`).
//
// `y` and `z` below are the NO-RIG fallback only: with the rig live the duffel is pinned to the
// hands and these two are never read (`totePoint` takes over). They are simply the chest-front
// station the hands are known to hold, so a bag carried before the rig exists still sits between
// the forearms rather than at the feet.
//
// ...and WHERE IN THE ARMS it sits. This is MEASURED, not guessed: the duffel is pinned to the
// midpoint of the two HAND bones (see `totePoint`), offset by the vector below — which is exactly
// the gap between that midpoint and the bag's base for the cradle pose `poseTote` paints, read off
// the running rig (hands at torso-local y −0.049, z 0.293 → base at y −0.145, z 0.269).
//
// Pinning it to the hands rather than to the chest is what makes the THROWS read: the shape drives
// the arms overhead and down again, and a bag welded to the torso would sit still at the sternum
// while the hands left it behind. Hung off the hands, it goes up with them, comes down with them,
// and only leaves when the shape's own release key says so. `BAG_TOTE` is the no-rig fallback.
const BAG_TOTE = { bone: "torso", y: -0.040, z: 0.31, yaw: 0 };
const BAG_HAND = { x: 0.0, y: -0.096, z: -0.022 };
// ...and the bag's own tilt through the two throws, in radians of the torso's frame (positive tips
// its decorated face DOWN). Keyed on the same clock the `poseTote` shapes are, so the two agree.
const THROW_RELEASE = 0.48; // where in the M1 shape the bag leaves the hands (the hurl)
const SLAM_RELEASE = 0.56;  // ...and where in the M2 shape (the drive into the deck)
const TOTE_THROW_PITCH = [[0, 0], [0.30, -0.26], [0.48, 0.42], [1, 0]];
const TOTE_SLAM_PITCH = [[0, 0], [0.36, -0.42], [0.56, 0.86], [1, 0]];

function bagKf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b[0]) {
      const s = (t - a[0]) / Math.max(1e-4, b[0] - a[0]);
      const e = s <= 0 ? 0 : s >= 1 ? 1 : s * s * (3 - 2 * s);
      return a[1] + (b[1] - a[1]) * e;
    }
  }
  return keys[keys.length - 1][1];
}
const TOTE_REACH = 2.6;   // world units: how close the duffel has to be to be taken in both hands
const TOTE_CHORD = 0.22;  // s: E and the right button inside this of each other read as ONE press
const THROW_T = 0.55;     // s: the M1 throw's own shape (see `TOTE_THROW` in streetwear.js)
const SLAM_T = 0.70;      // s: the M2 slam's (see `TOTE_SLAM`)
const THROW_V = 9.0;      // u/s the plain throw leaves the hands at, along the facing
const THROW_UP = 4.0;     // ...and the loft it leaves with
const SLAM_V = 2.6;       // u/s of forward drive on the slam — it is thrown at the DECK, not away
const SLAM_DOWN = -11.0;  // ...and the drive that puts it there

// ---- THE HANDS (session 179) ------------------------------------------------------------------
// A fourth home, and the one the user asked for by name: *"if i try to pick up with my hands i pick
// it in my hands normally"*. Until now a picked-up thing went straight into a pocket or the bag —
// E was a teleport, and the only thing that was ever visibly HELD was the duffel (the tote, above).
// Now `E` — or a double-click on a board in the editor — takes it into the HANDS first, and a
// double-click on a container puts it away. `this.hands` is that slot, and there is exactly one of
// it: a body has two hands but this game gives them one handful, which is what keeps the rule
// readable ("if your hands are full, put that down first").
//
// IT IS WORN, NOT SIMULATED. The carried mesh is a CHILD OF THE TORSO (see `syncCarry`), pinned at
// `CARRY_OFF` — the exact same bargain the bag makes on the back (`BAG_WEAR`) and in the arms
// (`BAG_TOTE`), and for the exact same reason: the run's lean, a slide, a vault and a wall climb all
// carry it for free, and not one of them has to remember it is there. The alternative — a second
// pose layer that holds the arm up under it — was rejected on purpose: this is the ONE layer that
// has to survive a fight, and a held ball whose position is decided by the arm's own animation
// swings through the deck the moment he throws a punch. Pinned to the trunk it simply travels with
// him, which is also what your hand does when it is resting on a ball.
//
// `CARRY_OFF` is the offset from the CARRIED HAND to the item's own centre, in the rig's units, and
// it is MEASURED, not guessed: `poseCarry` puts the character's right palm at about (-0.44, -0.12,
// 0.17) in the torso's frame, and the offset below is the gap from there to where a ball of
// `BALL_R` / `charMesh.scale` (0.178) radius actually belongs — out, down and a little forward, so
// the palm lands on the ball's upper-inner shoulder the way a hand rests on a ball held at the hip.
const CARRY_OFF = { x: -0.09, y: -0.07, z: 0.03 };
const CARRY_DROP_FWD = 0.95;  // u ahead of him the item is set down by E

// ---- THE BALL'S OWN ACTIONS (session 180; the throw re-authored in 183, the slam added in 189,
// the shoot re-authored in 198) ------------------------------------------------------------------
// The numbers that make the user's three moves land. The SHAPE is `poseBallAction` in streetwear.js
// — all THREE are authored beats now (see the block at the head of streetwear.js's ball actions):
// the THROW and the SLAM are six-column angle tables, and the SHOOT keys the striking foot's own
// PLACE over a run-like IK solve. Everything here is the BALL's own side of them. Every one of the launch numbers is spent on the frame
// the shape's own release key passes (`THROW_RELEASE` / `SLAM_RELEASE` for those two, and the
// shoot's own `SHOOT.release` — which lives in streetwear.js's table, because the shape is what
// knows where the boot is when the ball goes), never on the press — a wind-up that lets the ball go
// on the button is a glitch, not a throw.
//
//   THE SHOOT (`shootBegin` / `releaseShoot`, M1 with the ball at his feet)  the ball is put where
//     the boot is coming through and launched along the facing. It is a STRUCK ball and not a pass,
//     and since session 198 it is CHARGEABLE: holding M1 winds the shape up and fills the power, and
//     letting go spends it (`SHOOT_V_MIN`..`SHOOT_V_MAX`, `SHOOT_UP_MIN`..`SHOOT_UP_MAX` — the user's
//     *"make shooting the ball chargeable"*). A tap is a pass and a full charge carries the ball the
//     whole way across a yard; every one of them rolls without slipping, which is what the ball's own
//     `angMax` 92 is sized for.
//   THE THROW (`throwHands`, M1 with the ball in his hands)  an overhand throw, and the ball leaves
//     the HAND it was drawn in (`releaseHandThrow`), off the wind-up.
//   THE SLAM (`slamHands`, M2 with the ball in his hands — session 189)  the ball goes up over the
//     head and is driven into the deck a step ahead (`releaseHandSlam`), where it comes off LIVE on
//     the same terms the duffel does out of both arms: the slam's own drive (`SLAM_V` / `SLAM_DOWN`),
//     the whole of `SLAM_SPIN` about its SIDE axis and nothing about the vertical (session 187), the
//     deck's one-shot leap (`SLAM_LEAP`), and then the hot behaviour itself (`liveStep`) — it homes
//     once it has been struck and it is done after its one hit (session 188).
// ...and THE SHOOT'S OWN NUMBERS, which are a CHARGE BAND since session 198 (see `shootBegin` /
// `releaseShoot` / `poseShoot`). Used to be one speed — 15.5 u/s at 3.2 of loft whatever you did
// with the button. The hold sets it now, from a tap's pass to a full charge's screamer, and the
// SHAPE is what knows where the boot has to be when it goes: `SHOOT_AHEAD` and the ball's own
// radius are the RELEASE target in streetwear.js's `SHOOT` table (see its block).
const SHOOT_AHEAD = 0.62;       // u in front of him the ball is put, where the boot comes through —
                                // `SHOOT_SIDE`'s ankle targets exactly this point at the release beat
const SHOOT_V_MIN = 9.0;        // u/s a TAPPED ball leaves the boot at: a firm pass
const SHOOT_V_MAX = 24.0;       // ...and what a FULL charge puts through it. 24 u/s on a 0.28 radius
                                // is 86 rad/s of roll, and that is what raised the ball's own `angMax`
                                // to 92 (see its def): a struck ball rolls without slipping, so a
                                // ceiling under that skids it instead of rolling it.
const SHOOT_UP_MIN = 2.2;       // the loft a tap takes
const SHOOT_UP_MAX = 4.8;       // ...against a full charge's
const SHOOT_POW_MIN = 0.12;     // the share of the band a tap is ALREADY worth (see `powerOf`)
const SHOOT_CHARGE_T = 0.75;    // s of HOLD for the charge to be full
const SHOOT_WINDUP = 0.24;      // s for the shape's wind-up to reach its COCK beat on its own
const SHOOT_SWING_MIN = 0.20;   // s the strike half takes when it was let go off a tap
const SHOOT_SWING_MAX = 0.34;   // ...and when it was let go off a full charge
const SHOOT_UNWIND_RATE = 2.6;  // /s the phase walks home when a wind-up is CANCELLED
const SHOOT_METER_FADE = 0.10;  // s the in-world charge meter (see `main.js` / climbar.js) takes
                                // to come on and to go off — quick, like every other readout of a
                                // live move in this game, and slower off the release than on.
const BALL_STRIKE_R = 2.2;      // u: how far from him a locked ball may be when the boot comes
                                // through and still be struck. Wider than the assist's own 1.55 —
                                // a swing reaches further than a first touch — and it is the
                                // difference between a WHIFF and a shot that drags a ball in.
// ...and HOW MUCH OF THE LOWER HALF THE STRIKE OWNS, which is a SPEED (session 198 — see `legWeight`
// / `ballLower` / `poseShoot`'s `lower`). The shape's coil is a PLANT: one boot nailed to the deck
// and the other drawn back off it. That is the whole point of it standing still, and it is a lie the
// moment the body is moving — the man would go on down the street with both feet sliding under him,
// because a charge is up to a second of standing on the ball. So past `SHOOT_LEG_RUN` the hips and
// both legs are handed back to the RUN and the shape keeps only what it can honestly read from a
// moving body (the trunk, the head and the arms), and the handover is asymmetric because the two
// ends want different things: GIVE is the plant dissolving into a stride (a fifth of a second — a
// step, not a cut) and TAKE is the strike claiming its legs on the beat the button comes up (three or
// four frames — the whip is faster than that, and a leg that has not arrived cannot kick).
const SHOOT_LEG_STILL = 1.6;    // u/s below which a charge is standing, and keeps the WHOLE shape
const SHOOT_LEG_RUN = 4.5;      // ...and above which the legs are the run's
const SHOOT_LEG_GIVE = 0.20;    // s the lower half takes to hand away to the run
const SHOOT_LEG_TAKE = 0.06;    // ...and to take back for the strike
// The shape's two beats before a rig exists (see `shootShape`): the same numbers as streetwear.js's
// `SHOOT`, and only ever spent on the opening frames of a load. If either moves there, move it here.
const NO_SHOOT = { cock: 0.44, release: 0.56 };
const THROW_DURATION = 0.66;    // s the throw's own shape plays over — a shade snappier than the
                                // shape's own 0.72 so the release lands 0.40 s after the press
const BALL_THROW_V = 11.5;      // u/s a thrown ball leaves the hand at
const BALL_THROW_UP = 4.6;      // ...and its loft
const SLAM_DURATION = 0.62;     // s the ball's SLAM shape plays over — the shape's own 0.66 pulled
                                // in by two frames' worth, the same trade `THROW_DURATION` makes, so
                                // the ball leaves the hand 0.35 s after the press (see `SLAM_RELEASE`)
const BALL_POSE_FADE = 0.08;    // s the action layer takes to come on — and to fade back off

// ---- THE CONTROL (session 180) -----------------------------------------------------------------
// *"make it actully smart not just a ball like make it easier to control with the player"*. What
// that means mechanically: while the player is ON the ball and the ball is not already flying, the
// ball is STEERED — its velocity is driven toward his own plus a pull toward a point
// `BALL_TOUCH_AHEAD` in front of him. Nothing is teleported and nothing is parented: it is a ball
// rolling where a man is pushing it, which is what a first touch is.
//
// The gates are the whole of the feel:
//   * `BALL_TOUCH_R` — outside this the ball is just a prop again. It is a boot-and-shin radius and
//     not a magnet: 1.55 u at a 10.9 u/s sprint is about a seventh of a second of travel.
//   * `BALL_TOUCH_MAXV` — a ball already moving faster than this is GOING somewhere (even a TAPPED
//     shot leaves at 9) and the assist lets it go. That one number is what keeps the shoot from
//     being caught by the control on the very next frame.
//   * ...and while a wind-up is LIVE the ball is held TIGHTER (`BALL_TOUCH_AHEAD_CHARGE` 0.50, see
//     the assist): a charge takes a second, and a ball that walks out of `BALL_TOUCH_R` while you
//     hold it would take the shot with it.
//   * `BALL_TOUCH_GROUND` — only a ball near the deck is dribbled; a lofted one is in flight.
const BALL_TOUCH_R = 1.55;      // u: how close he has to be for the ball to be under control
// ...and HOW CLOSE HE HAS TO BE TO TAKE IT IN HAND WITH THE RIGHT BUTTON (session 189 — see
// `takeM2` on the ball's def). It is the E radius and the control radius' own middle: the ball is
// taken at a stride's reach rather than off the toe, and it is deliberately NOT `BALL_TOUCH_R` (a
// pick-up is not a touch — the boot and the hand are different distances) and not the 2.6 `E` uses
// on a key, because the ball is the one prop whose button is the OTHER mouse button and a press that
// reaches further than the last one did would read as a magnet.
const BALL_TAKE_R = 2.0;        // u: how close the ball has to be to M2 for it to come up into the hand
const BALL_TOUCH_AHEAD = 0.72;  // u in front of him the ball is kept while he runs
// ...and where it is kept while he WOUNDS A SHOT UP (session 198). A charge is a second spent
// standing on the ball, and the assist's own 0.72 lets a sprinting ball walk out past
// `BALL_TOUCH_R` over that second — which cancels the shot (see `tickShoot`). Half a stride
// shorter keeps it where the boot is going to be, and it is only ever asked for while
// `ballCharging`.
const BALL_TOUCH_AHEAD_CHARGE = 0.50;
const BALL_TOUCH_GAIN_CHARGE = 28.0;  // /s the pull toward it while a wind-up is live
const BALL_TOUCH_GAIN = 21.0;    // /s the pull toward that point
const BALL_TOUCH_MATCH = 36.0;   // /s the ball's own velocity is brought onto the wanted one
const BALL_TOUCH_LEAD = 6.8;    // u/s faster than the man the ball may be dragged
const BALL_TOUCH_MAXV = 11.0;   // u/s: faster than this and it is going somewhere — let it go
const BALL_TOUCH_GROUND = 0.72; // u above the deck the ball may be and still count as at his feet

// ...and THE DOUBLE-CLICK's own window (see `onStageDown`). Two presses on the SAME container
// inside this many milliseconds are one gesture; anything slower is two ordinary clicks, which is
// what keeps click-to-select and click-a-board-to-place working exactly as they always have.
const DBL_MS = 340;
// ...and how far apart two presses may be and still be ONE gesture, in pixels. This is not
// politeness: the FIRST press of a double-click does its own job, and for a label that job is
// "bring this holder up" — which re-renders the stage, so the element the second press lands on is
// a DIFFERENT element in a different place. Anchoring the gesture on the CLICK POINT rather than on
// the element is what lets a double-click on a pocket's name mean what it means.
const DBL_SLOP = 14;
const DENY_T = 620;           // ms the refuse shake + red light stay on a container that said no

// ---- THE HOT BAG ------------------------------------------------------------------------------
// The bag the M2 slam puts on the deck is not a prop that has landed; it is LIVE. It comes off the
// deck, it stays off it, and it spins — and every move the PLAYER lands on it FEEDS it: the damage
// it takes is paid straight into its speed (the user's *"the more damage i do to the bag the faster
// it goes and hits the nears enemy"*), so a running punt nudges it and a flying knee launches it.
// It hurts whatever it runs into on the way, and it cools off on its own.
//
// ...OR ON ITS OWN HIT (session 188 — the user's *"make it once it hit the enemy once it gets back
// to its orginal physics"*). The bag's career used to run the other way round: landing a hit on a
// body was the BEGINNING of it, and the bag came off the body still live, still homing, still fed by
// the player's moves, until `HOT_T` ran out. It is ONE hit now — the contact drops `bag.hot` to zero
// on the spot, which is the one flag the whole live bag is read off, so the homing, the trail and
// the `grip` override all end with it and the bag it leaves behind is an ordinary duffel again (see
// `hotBag` job 3). `HOT_T` remains the ceiling for a bag that never finds anybody.
//
// TWO RULES THE FIRST VERSION OF THIS GOT WRONG, both from the user (session 92):
//   * it is not a HOMING weapon until it has been STRUCK. A live bag with nothing done to it just
//     leaps and rattles around where it was slammed; the draw-at-the-nearest-body only switches on
//     once the player has landed a move on it (see `bag.armed`). A body that runs into it is not the
//     other way in any more — that contact is the bag's one hit, and the bag is done (session 188).
//   * it does not CHANGE COLOUR. The warm pull and the emissive on the mesh are gone; a live bag is
//     read off the trail and the spin, not off the paint.
const HOT_T = 10.0;       // s: how long a slammed bag stays live. It was 7 while the bag drew itself
                          // at a body from the first frame; now that it has to be STRUCK it spends
                          // its first seconds in the air off the slam's own leap, so the window the
                          // player has to chase it down and hit it is the whole point of the number.
                          // Since session 188 it is a CEILING rather than the usual way a live bag
                          // ends: the bag's own hit on a body puts it out on the spot (see `hotBag`
                          // job 3), and this is what a bag that never finds anybody runs down to.
const HOT_BOUNCE = 0.70;  // what it keeps off a landing (a normal prop keeps 0.35 — see `stepProp`)
const HOT_DRAG = 1.1;     // ground drag while live (a normal prop's is 6): it ROLLS rather than stops
const HOT_SPIN = 0.7;     // /s the live bag's spin bleeds off on contact — it has to STAY a blur.
                          // Session 187: it is ALSO the whole of the deck's grip on the live bag's
                          // TUMBLE (`grip` in `stepSpin`). The deck plane has always spent this
                          // number on `ang.y` (see `stepProp`'s ground branch); now that the slam's
                          // turn is on the SIDE axis (`SLAM_SPIN`), the deck has to spend this same
                          // number on `ang.x`/`ang.z` too, or its ordinary 9/s no-slip drag would
                          // have the whole blur off the bag inside the first landing it makes.
const HOT_SEEK = 13.0;    // u/s^2 — how hard it is drawn at the nearest body (once armed)
const HOT_MAX = 40;       // u/s: the ceiling on all of it
const HOT_NEAR = 1.6;     // u: inside this of a body it stops steering (otherwise it orbits it)
const HOT_TOUCH = 1.25;   // u: how close the PLAYER has to be for one of his moves to land on it
const HOT_ENEMY = 1.05;   // u: ...and how close it has to be to a body to hit it
const HOT_CD = 0.20;      // s between two of the player's own contacts registering
const HOT_DMG_V = 0.24;   // u/s of drive added per point of damage the bag takes from a move
const HOT_HIT_V = 0.55;   // ...plus this much of the player's own speed, so a run-in carries
const HOT_STOP = 0.55;    // what it keeps of its speed when it comes off a body
// ...and the SLAM's own two beats: it goes into the deck TURNING, and the deck throws it straight
// back up (the user's *"it spins super fast then jump super high in the air after the slam"*).
// `SLAM_LEAP` is a velocity, so the height it buys is `v^2 / 2*GRAV` — 24 is eleven units, about
// six times the character.
//
// THE AXIS IS THE SIDE'S. SESSION 187 is the user's *"make it when i slam a bag it spins only in
// side axis"*: `SLAM_SPIN` used to be handed to `bag.spin`, which is the deck plane's `ang.y` —
// the duffel went in like a spinning top, and the no-slip roll the drive gives it (see `spinFrom`)
// was a second, much smaller turn showing on top of it (`the two are different axes and both
// show`). The whole of the rate is on the SIDE axis now — `up x forward`, the axis across the
// drive, which is the axis the deck's own roll already grips and so the axis a rolling duffel is
// read on — and the vertical component is not merely small, it is zero. Same 38 rad/s, same blur,
// aimed where the user asked for it.
const SLAM_SPIN = 38;     // rad/s the slam leaves it turning, about its SIDE axis (old value: 11)
const SLAM_LEAP = 24;     // u/s the first deck contact throws it up at

// WHAT A MOVE IS WORTH TO THE BAG, off the state the body is actually in. This is the one place
// that decides "how hard did he just hit it", and it is deliberately coarse: the bag is a punt, not
// a body, so it wants a read, not a hitbox. Every offensive state is above the running contact, and
// the heaviest are the ones that cost the player the most (a hammer, a slam, a knee).
function movePowerOf(pl) {
  switch (pl.state) {
    case "smash": return 34;
    case "knee": return 34;
    case "scissor": return 30;
    case "capo": return 26;
    case "dive": return 26;
    case "pole": return 22;
    case "lunge": return 22;
    case "attack": return 16;
    case "slide": return 16;
    case "dash": return 12;
    case "slam": return 20;
    default: return 6; // ...and running into it is the smallest thing that counts as a move
  }
}

// The states above are "a move is out"; the run-in is the floor. Anything else (standing, a walk,
// a hang, a held block) leaves the bag alone, so a body merely STANDING next to a live bag does not
// machine-gun it.
const MOVE_STATES = {
  smash: 1, knee: 1, scissor: 1, capo: 1, dive: 1, pole: 1, lunge: 1,
  attack: 1, slide: 1, dash: 1, slam: 1,
};

function rectCells(w, h) {
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push([x, y]);
  return out;
}

// The game's three items. `cells` is the tetris footprint, `radius` the prop's world radius, and the
// OPTIONAL keys are the ones that only a prop with a nature of its own needs (see the ball):
// `damageScale` multiplies every knock it takes, `round`/`settle` are its shape (see `propSupport` /
// `stepSpin`), `bounce`/`drag`/`spinDrag` are how its surface behaves (`stepProp`), `angMax` is how
// fast it may turn and `kick` is what a boot does to it (`update`).
export const ITEM_DEFS = {
  keys: {
    name: "KEYS",
    short: "K",
    cells: [[0, 0]],
    color: "#e0b040",
    ink: "#3a2a06",
    maxHp: 40,
    radius: 0.11,
  },
  bag: {
    name: "BACKPACK",
    short: "BAG",
    cells: rectCells(BAG_ITEM_W, BAG_ITEM_H),
    color: "#8f969e",
    ink: "#12161b",
    maxHp: 100,
    radius: 0.24,
  },
  // THE SOCCER BALL (session 178). Two things about it are the user's own words and everything else
  // is in service of them.
  ball: {
    name: "SOCCER BALL",
    short: "BALL",
    // TWO BY TWO. A ball is round, and the square a round thing cannot be narrower than is its own
    // width — one cell is a marble, and two is what an item that big costs a board. It therefore
    // does NOT fit a pocket (1 x 2) and DOES fit the duffel (5 x 4), which is exactly what was asked
    // for: *"i can pick it up and put it in my bag"*.
    cells: rectCells(BALL_W, BALL_H),
    color: "#f2efe4",
    ink: "#171b22",
    maxHp: 100,
    radius: BALL_R,
    // KICKING IT COSTS IT ALMOST NOTHING — the user: *"make kicking it around doesnt lower its
    // durability and stuff but it lowers it by like 0.0001 or something for realistic reasons"*. So
    // every point of damage that arrives at this item is scaled by a hundred-thousandth, and the
    // scale lives on ONE door (`damageItem`) so a new damage source cannot forget it: a full-speed
    // boot (the 6 + 0.25·speed the loose-prop path pays, about 8-15) costs a ten-thousandth, a slam
    // into a building costs two or three of them, and the duffel's contents taking half of its own
    // knocks is nothing at all. A ball is not immortal, it is just a ball — a few hundred thousand
    // kicks would see it out.
    damageScale: 0.00001,
    // ...and it is ROUND: no corners to ride (its support is its radius, not its box) and no face to
    // be put down onto when it stops (see `propSupport` / `PROP_REST_AXES`).
    round: true,
    settle: false,
    // A BALL'S SURFACE: it keeps half its landing as a bounce (a box keeps a third), it rolls a long
    // way (a box's ground drag is 6, its 1.7), and it does not lose its roll the moment it touches
    // down (a box bleeds spin at 5, it at 2.2).
    bounce: 0.52,
    drag: 1.7,
    spinDrag: 2.2,
    // ...92 since session 198: a full-charge shot leaves the boot at 24 u/s, and 24 u/s on a 0.28
    // radius is 86 rad/s of no-slip roll. 70 would have clipped that into a SKID — a ball sliding
    // instead of rolling is exactly what the ceiling is for — and there is still clear air over it.
    angMax: 92,
    // ...and WHAT A BOOT DOES TO IT. SESSION 180: the boot no longer PUNTS the ball — running into
    // a ball is the FIRST HALF OF A DRIBBLE, not a clearance (see `BALL_TOUCH_*` and the control
    // assist in `update`). 6.5 + 0.42·speed at 1.1 of loft was a pass sent away from its owner;
    // 2.3 + 0.14·speed at 0.45 keeps the ball SLOWER THAN THE MAN RUNNING AT IT, so the next touch
    // arrives on its own and the ball stays his. The hard, aimed strike is M1's (`shootBall` /
    // `shootLaunch`), which is a different thing entirely.
    kick: { v: 2.3, gain: 0.14, up: 0.45 },
    // ...and it is CONTROLLED. This flag is what makes the ball "actully smart" (the user's words):
    // the boot's own touch above is soft, and the assist in `update` keeps the ball in front of the
    // feet while he runs instead of letting it squirt away from every contact. See `BALL_TOUCH_*`.
    control: true,
    // ...AND THE BALL IS TAKEN WITH THE RIGHT BUTTON, NOT WITH `E` (session 189 — the user's *"make me
    // grab the ball from m2 instead of E ... and make me when i press E on it it does nothing"*). This
    // flag is the whole of it: `interact` (E) skips a prop that carries it, `updatePrompt` names M2
    // where it would have said "[E] TAKE", and the empty-handed branch of `preFrame` takes it up into
    // the hand on the right button inside `BALL_TAKE_R` — the ONE door, `takeToHands`, exactly as E
    // used to. Keys and everything else are untouched: E still picks them up.
    takeM2: true,
  },
  // THE SKATEBOARD (session 200 — see the note over `BOARD_R`). The one prop whose `E` is RIDE
  // rather than TAKE: it is taken into the hands with the right button (`takeM2`, exactly as the ball
  // is) and stepped onto with `E` (see `interact` / `mountBoard`), which is the brief's own word for
  // it. Everything else about it is a prop's ordinary business.
  board: {
    name: "SKATEBOARD",
    short: "BOARD",
    // 1 x 3: a board is long and thin, so it does NOT fit a pocket (1 x 2) and DOES fit the duffel
    // (5 x 4) — the ball's own slot logic, one shape over.
    cells: rectCells(BOARD_W, BOARD_H),
    color: "#2f343b",
    ink: "#e7edf2",
    maxHp: 120,
    radius: BOARD_R,
    // A board does not bounce much and it does not roll far on its own — what it does is TUMBLE, and
    // the ceiling on that is generous enough for a kick (see `PROP_ROLL_R.board` for why it does not
    // turn on its wheels).
    bounce: 0.26,
    drag: 3.6,
    spinDrag: 3.0,
    angMax: 34,
    // ...and a boot sends it off flat and skidding rather than lofting it like a bag: a board is
    // kicked along the ground, which is the one way to move one.
    kick: { v: 4.4, gain: 0.26, up: 0.9 },
    // ...and it is TAKEN WITH THE RIGHT BUTTON, like the ball (see `takeM2`): `E` has to be free to
    // be RIDE, so the hand's door is `M2` and the prompt names both.
    takeM2: true,
  },
};

// ---- THE ITEMS' OWN Y ANGLE --------------------------------------------------------------------
// An item does not stand square to its pocket; it leans. The angle is rolled ONCE, when the item is
// MADE, and lives on the item for the rest of its life — so the same key always wears the same
// turn (a re-render, a drag to another holder, or the quick menu drawing it again can never change
// it) and two of the same thing never look like copies of each other. `positionItems` spends it as
// a perspective `rotateY` on the item's own tile (the lens is on the board — see `.invGrid` in
// index.html), which is what turns a pocket from a spreadsheet of flat squares into a box of parts
// that somebody tipped in.
//
// A wider item leans LESS: a 1 x 1 key can afford the full lean and still read as itself, but a
// 3 x 2 duffel turned by the same amount would swing clean out of its well and stop looking like
// something resting in a pocket. The divisor is the item's own girth minus one, so the tile that
// has more to lose is the one that is held straighter.
const ITEM_YAW_MAX = 0.62; // radians — the widest a lone 1 x 1 item leans off square (about 35°)

function rollItemYaw(w, h) {
  const fit = Math.max(1, Math.max(w, h) - 1);
  return ((Math.random() * 2 - 1) * ITEM_YAW_MAX) / fit;
}

export function makeItem(kind) {
  const d = ITEM_DEFS[kind];
  const cells = d.cells.map((c) => [c[0], c[1]]);
  let w = 1;
  let h = 1;
  for (const c of cells) {
    w = Math.max(w, c[0] + 1);
    h = Math.max(h, c[1] + 1);
  }
  return {
    id: nextItemId++,
    kind,
    name: d.name,
    short: d.short,
    cells,
    w,
    h,
    color: d.color,
    ink: d.ink,
    radius: d.radius,
    hp: d.maxHp,
    maxHp: d.maxHp,
    yaw: rollItemYaw(w, h),
    broken: false,
  };
}

export function damageItem(it, amt) {
  if (!it || it.broken) return false;
  // ...AND AN ITEM MAY BE TOUGH BY NATURE. The ball's def scales every knock down to a
  // ten-thousandth (see its own note); the scale is applied HERE, at the one door every point of item
  // damage comes through — the boot, a wall, a landing, and the half-share the duffel's contents take
  // when the duffel itself is hit (`damageBag`) — so no caller can forget it and no new one can miss
  // it.
  const def = ITEM_DEFS[it.kind];
  if (def && def.damageScale != null) amt *= def.damageScale;
  it.hp -= amt;
  if (it.hp <= 0) {
    it.hp = 0;
    it.broken = true;
    return true;
  }
  return false;
}

// ---- the item silhouettes (the "icons" the editor shows) ------------------------------------
function glyphFor(kind) {
  if (kind === "bag") {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linejoin="round"><path d="M2.6 10.4h18.8v7.8H2.6z"/>' +
      '<path d="M2.6 13.6h18.8"/>' +
      '<path d="M8.6 10.4V8.3a3.4 3.4 0 0 1 6.8 0v2.1"/>' +
      '<path d="M4.2 20.6 19.4 7.8"/></svg>'
    );
  }
  // ...and THE BOARD, seen from the side: a kicked deck over two wheels. The kicks are the whole
  // silhouette — a flat line with two circles under it is a rolling pin.
  if (kind === "board") {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M1.9 8.6 4.6 11.4h14.8L22.1 8.6"/>' +
      '<path d="M7.3 11.4v1.9M16.7 11.4v1.9"/>' +
      '<circle cx="7.3" cy="15.6" r="2.1"/><circle cx="16.7" cy="15.6" r="2.1"/></svg>'
    );
  }
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="square"><circle cx="7.4" cy="7.4" r="4.1"/>' +
    '<path d="M10.4 10.4 20.6 20.6"/><path d="M15.4 15.4 13 17.8"/>' +
    '<path d="M18 18 15.6 20.4"/></svg>'
  );
}

// ---- the holders' palettes ------------------------------------------------------------------
// A pocket is denim; the back pocket is the same denim a shade down (it is the one on the seat,
// and it reads as the back of the pair without needing a label to say so). The bag is grey nylon
// with a reflective band. These feed the CSS custom properties, so the DOM *is* the holder.
const POCKET_THEME = {
  key: "pocket",
  fabric: "#2b3c5c",
  fabric2: "#1d2942",
  edge: "#7396d0",
  stitch: "#a6c4f4",
  ink: "#0a0f18",
  tag: "#dce9ff",
};
const BACK_THEME = {
  key: "pocket",
  fabric: "#243149",
  fabric2: "#172033",
  edge: "#6383b6",
  stitch: "#8fabd8",
  ink: "#0a0f18",
  tag: "#dce9ff",
};
const BAG_THEME = {
  key: "bag",
  fabric: "#4a5057",
  fabric2: "#363c43",
  edge: "#aab2bb",
  stitch: "#d5dbe2",
  ink: "#12161b",
  tag: "#e6ecf2",
};

// ---- containers ----------------------------------------------------------------------------
class Container {
  constructor(o) {
    this.key = o.key;
    this.name = o.name;
    this.short = o.short;
    this.kind = o.kind; // "pocket" | "bag"
    this.w = o.w;
    this.h = o.h;
    this.theme = o.theme;
    this.anchor = o.anchor; // where the stub sits in the editor
    this.items = []; // placements: {item, gx, gy, off, vy, sq, enter, held}
  }
}

function fitsAt(c, item, gx, gy, self) {
  for (const cell of item.cells) {
    const x = gx + cell[0];
    const y = gy + cell[1];
    if (x < 0 || y < 0 || x >= c.w || y >= c.h) return false;
    for (const q of c.items) {
      if (q === self) continue;
      for (const qc of q.item.cells) {
        if (q.gx + qc[0] === x && q.gy + qc[1] === y) return false;
      }
    }
  }
  return true;
}

function firstFit(c, item) {
  // Bottom rows first: an item is placed where it can already rest, so the fall physics has
  // nothing to correct on the common path and the placement never looks like it teleported.
  for (let y = c.h - item.h; y >= 0; y--) {
    for (let x = 0; x <= c.w - item.w; x++) {
      if (fitsAt(c, item, x, y, null)) return { x, y };
    }
  }
  return null;
}

function place(c, item, gx, gy, opts) {
  const p = {
    item,
    gx,
    gy,
    off: 0,
    vy: 0,
    sq: 0,
    enter: opts && opts.enter ? 1 : 0,
    held: false,
  };
  c.items.push(p);
  return p;
}

// The whole of the grid's motion: acceleration, one-cell steps, the landing, the squash and the
// little hop a hard landing earns. Runs every frame for every holder (they are tiny).
function stepFall(c, dt) {
  const list = [...c.items].sort((a, b) => b.gy - a.gy);
  for (const p of list) {
    if (p.held) continue;
    if (p.enter > 0) {
      p.enter = Math.max(0, p.enter - dt * ENTER_T);
      if (p.enter === 0 && p.sq <= 0) p.sq = 0.16;
    }
    const supported = !fitsAt(c, p.item, p.gx, p.gy + 1, p);
    // Settled: it is on something, it is not part-way through the cell below, and it is not
    // rising. A landing faster than HARD_LAND squashes and hops; a gentle one just sits.
    if (supported && p.off >= 0 && p.vy >= 0) {
      if (p.vy > HARD_LAND) {
        p.sq = Math.min(1, p.vy / 14);
        p.vy *= -BOUNCE_KEEP;
      } else {
        if (p.vy > 0.4) p.sq = Math.min(1, p.vy / 14);
        p.vy = 0;
        p.off = 0;
      }
    }
    // ...and everything else is IN THE AIR: gravity, then whole cells of travel, one at a time.
    if (!supported || p.vy < 0 || p.off > 0 || p.vy > 0) {
      p.vy = Math.min(FALL_MAX, p.vy + GRID_FALL * dt);
      p.off += p.vy * dt;
      let guard = 0;
      while (p.off >= 1 && fitsAt(c, p.item, p.gx, p.gy + 1, p) && guard++ < 6) {
        p.gy++;
        p.off -= 1;
      }
      if (p.off > 0 && !fitsAt(c, p.item, p.gx, p.gy + 1, p)) p.off = 0;
      if (p.off <= 0 && p.vy >= 0) {
        if (p.vy > 2) p.sq = Math.min(1, p.vy / 14);
        p.off = 0;
        p.vy = 0;
      }
    }
    if (p.sq > 0) p.sq = Math.max(0, p.sq - dt * SQUASH_T);
  }
}

// ---- the props' meshes ----------------------------------------------------------------------
function paintWhite(geo) {
  const n = geo.attributes.position.count;
  geo.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return geo;
}

// ------------------------------------------------------------------------------------------------
// THE PROPS' DAMAGE READ (the user's *"make the broken items look broken and damaged"*)
//
// An item in this game has health, and until now only the DUFFEL wore any of it: a bag bruised as
// it was beaten, and everything else looked factory-new right up to the frame it greyed out. The
// trouble with a single `broken` flag is that the only two states it can say are "perfect" and
// "ruined", so nothing warns you that the thing in your hands is about to go, and the break itself
// has no build-up to pay off. So the damage is written on TWO channels now, and BOTH of them read
// the item's own `hp` rather than the flag:
//
//   * THE PAINT (`applyPropDamage`'s tint loop) — the prop BRUISES as it takes hits (a dark, muddy
//     pull on its own colours: the duffel's old damage ramp, generalised to every prop) and then
//     greys out when it finally goes. A half-worn key is a DULL key, which is the warning.
//   * THE SHAPE (`userData.dmg`) — each prop is authored with its own damage geometry, built UP
//     FRONT like the pole's two halves, so nothing is ever constructed mid-fight:
//       `chips`  appear at their own damage threshold — a tear through the nylon, a scuff
//                through the plate — and STAY on once the thing is broken;
//       `snaps`  are the come-apart: parts that JUMP to a second pose the frame the prop breaks
//                (the key's blade hangs off its bow, the duffel's shoulder strap snaps off), and are
//                put back if the item is not broken, so the look stays a pure function of the state.
//
// The whole thing is idempotent and frame-safe — it is simply called every frame for every dropped
// prop — and it allocates nothing: the scratch colour is hoisted, each part remembers the
// transform it was authored with, and the reads are a handful of colour lerps per prop.
const PROP_HURT = new THREE.Color(0x2c2016); // the bruise every prop's paint darkens toward
const PROP_DEAD = new THREE.Color(0x3d4249); // ...and the grey a BROKEN one ends on
const _propC = new THREE.Color();

// How far gone an item is, 0 (fresh) to 1 (dead), off its own health pair. One definition, so the
// paint and the shape can never disagree about how beaten up a thing is.
function propDamageK(item) {
  const max = item.maxHp || 1;
  return Math.max(0, Math.min(1, 1 - item.hp / max));
}

// A part that is INVISIBLE until the prop is far enough gone. `deadOnly` is for the marks that are
// about the BREAK itself (the fracture line, the tear) rather than about wearing out. The reveal is
// a visibility flip and not an opacity fade: these are hard-edged PS1 props, and a half-faded crack
// reads as a texture bug rather than as damage.
function chipPart(mesh, at, deadOnly) {
  mesh.visible = false;
  mesh.frustumCulled = false;
  paintWhite(mesh.geometry);
  return { obj: mesh, at, deadOnly: !!deadOnly };
}

// ...and a part that JUMPS when the prop finally breaks. It remembers where it was authored (`p0`/
// `r0`) so `applyPropDamage` can put it back.
function snapPart(obj, px, py, pz, rx, ry, rz) {
  return {
    obj,
    pos: new THREE.Vector3(px, py, pz),
    rot: [rx, ry, rz],
    p0: obj.position.clone(),
    r0: obj.rotation.clone(),
  };
}

// THE ONE WRITER of a prop's damage look. `k` is 0 (perfect) to 1 (dead), `dead` is the item's own
// `broken` flag — the two are separate because an item can be at 0 hp for a frame before the break
// is recorded, and because the break is what owns the `snaps`.
function applyPropDamage(mesh, k, dead) {
  const skin = mesh.userData.skin;
  const base = mesh.userData.skinBase;
  if (skin && base) {
    // The bruise comes on FAST (a third of the health already reads as a change) and tops out well
    // short of black, so a nearly-dead prop is still the colour it started as — just a beaten one.
    const bruise = Math.min(1, k * 1.3) * 0.62;
    for (const key in skin) {
      if (!skin[key].uniforms || !skin[key].uniforms.uColor || !base[key]) continue;
      _propC.copy(base[key]).lerp(PROP_HURT, bruise);
      // ...and a BROKEN one goes further: darker, and pulled off its own hue toward grey. It is NOT
      // taken to black, though — `6fps`-era hardware may have loved its black, but a black prop reads
      // as a hole rather than as a wreck, and the damage marks drawn ON it (see the `raw` material)
      // need something lighter than themselves to sit on.
      if (dead) _propC.multiplyScalar(0.66).lerp(PROP_DEAD, 0.48);
      skin[key].uniforms.uColor.value.copy(_propC);
    }
  }
  const dmg = mesh.userData.dmg;
  if (!dmg) return;
  if (dmg.chips) {
    for (const p of dmg.chips) p.obj.visible = p.deadOnly ? !!dead : dead || k >= p.at;
  }
  if (dmg.snaps) {
    for (const p of dmg.snaps) {
      if (dead) {
        p.obj.position.copy(p.pos);
        p.obj.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
      } else {
        p.obj.position.copy(p.p0);
        p.obj.rotation.copy(p.r0);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------
// THE ROUNDED LOW-POLY SOLID (`octPts` / `loftOct`) — the shape language the props are built from.
//
// The duffel used to be a pile of `BoxGeometry`: a box body, a box pocket, a box band, box studs. It
// read as Minecraft, and it read that way for a reason — at this resolution a prop is almost
// entirely its SILHOUETTE, and the silhouette of a box is a box, however nicely it is shaded. PS1
// props are the opposite trade: a handful of triangles, but with every corner knocked off, because
// the hardware could not afford the round thing and the artists got very good at faking it. That is
// what these two functions are.
//
// `octPts` is the CROSS-SECTION: a rectangle with all four corners cut off at 45°, so the section has
// eight points instead of four and every edge of the solid carries a diagonal in it.
function octPts(a, b, c, ox, oz) {
  const x = ox || 0;
  const z = oz || 0;
  return [
    [x + a, z + b - c],
    [x + a - c, z + b],
    [x - a + c, z + b],
    [x - a, z + b - c],
    [x - a, z - b + c],
    [x - a + c, z - b],
    [x + a - c, z - b],
    [x + a, z - b + c],
  ];
}

// ...and `loftOct` stacks those sections up a Y and skins them. Each station is
// `[y, halfX, halfZ, cornerCut, centreX, centreZ]`, and the stations do NOT have to agree: give the
// middle a bigger section than the ends and the solid BULGES (which is what a bag does and what a
// box can never do), and pull the cut in at the ends and it closes to a rounded lip. Both caps are
// built, so a loft is always a closed solid.
//
// It is deliberately NON-INDEXED with flat normals — one facet per triangle — because that is what
// the cel bands in the shader want to catch. A smooth-shaded loft at this size is a cylinder with a
// blur on it; faceted, every one of those flat patches picks a band and holds it, which is the whole
// low-poly read. The winding is not the one you would guess: see the note inside.
function loftOct(stations) {
  const pos = [];
  const pts = [];
  for (const s of stations) pts.push(octPts(s[1], s[2], s[3], s[4], s[5]));
  for (let k = 0; k < stations.length - 1; k++) {
    const yl = stations[k][0];
    const yu = stations[k + 1][0];
    const L = pts[k];
    const U = pts[k + 1];
    for (let j = 0; j < 8; j++) {
      const n = (j + 1) & 7;
      // (lower_j, upper_j, lower_n) then (lower_n, upper_j, upper_n). The obvious order — the one
      // that runs the quad the way the outline was authored — points every normal INTO the solid, so
      // the bag renders inside-out and lit from behind. This is the one that faces out.
      pos.push(L[j][0], yl, L[j][1], U[j][0], yu, U[j][1], L[n][0], yl, L[n][1]);
      pos.push(L[n][0], yl, L[n][1], U[j][0], yu, U[j][1], U[n][0], yu, U[n][1]);
    }
  }
  const s0 = stations[0];
  const p0 = pts[0];
  for (let j = 0; j < 8; j++) {
    const n = (j + 1) & 7;
    pos.push(s0[4] || 0, s0[0], s0[5] || 0, p0[j][0], s0[0], p0[j][1], p0[n][0], s0[0], p0[n][1]);
  }
  const se = stations[stations.length - 1];
  const pe = pts[pts.length - 1];
  for (let j = 0; j < 8; j++) {
    const n = (j + 1) & 7;
    pos.push(se[4] || 0, se[0], se[5] || 0, pe[n][0], se[0], pe[n][1], pe[j][0], se[0], pe[j][1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.computeVertexNormals();
  return geo;
}

// THE DUFFEL — REBUILT AS A MODERN BAG, AND GREY (session 184: the user's *"make a better bag model
// that looks like modern bags and make it grey not brown"*).
//
// The bag it replaces was a brown leather holdall: a rolled leather lid, a belt round the middle, a
// buckle strap down the front, two studs and a pair of leather hoops. Every one of those is a 1970s
// grip bag, and the COLOUR was the giveaway — leather-brown reads as OLD whatever you do to the
// silhouette. This one is the bag you would actually buy now:
//
//   * A NYLON BODY IN TWO GREYS. A mid-grey shell over a darker, reinforced base and darker end
//     panels, with the compartments a shade darker again. That is the whole colour story of a modern
//     duffel: one grey, and a darker grey everywhere it touches the ground or takes a knock.
//   * A LONG TOP ZIP running the crest of the top from end to end, with a light zip tape, a bright
//     metal slider and two cord pulls in the character's own mint. This is the detail that says
//     MODERN loudest — and it is the exact thing the rolled leather lid was not.
//   * WEBBING, NOT LEATHER. Flat woven grab handles (a strap arches over the top; it is not a hoop),
//     a padded grip wrapped round the pair of them, and a wide shoulder strap with its own sliding
//     pad, slung along the top and dropping onto the ends past a metal clip.
//   * REFLECTIVE PIPING down both shoulders, a flat zip pocket with a rubberised patch on the front,
//     and a zipped shoe pocket on one end — the three places a modern bag puts its second
//     compartment, its finish and its logo.
//
// TWO THINGS ABOUT THE HULL ARE DELIBERATELY UNCHANGED, both of them measured rather than chosen:
//
//   * THE SILHOUETTE. A bag is wider than it is tall and it BULGES, and a section that grows and
//     shrinks along an axis is a thing a box can never be. The old leather body's stations are
//     reused to the millimetre, so every number the rest of the game already knows about this prop
//     (its box, its rest height, where the arms close round it) still holds.
//   * THE MIDDLE BAND'S CONSTANT SECTION. The wear decals (see the end of `bagMesh`) are flat marks
//     parked a hair proud of those faces; a face that moved under them would leave a crack floating
//     off the nylon.
function bagMesh() {
  const g = new THREE.Group();
  const shell = createMaterial({ color: 0x848c94, minLight: 0.46, cel: 1, celBands: 3, emissive: 0.10 });
  const shellMid = createMaterial({ color: 0x6f767f, minLight: 0.40, cel: 1, celBands: 3, emissive: 0.08 });
  const shellLo = createMaterial({ color: 0x4c5259, minLight: 0.32, cel: 1, celBands: 3, emissive: 0.06 });
  const webbing = createMaterial({ color: 0x22252b, minLight: 0.24, cel: 1, celBands: 2 });
  const zip = createMaterial({ color: 0x14171b, minLight: 0.14, cel: 1, celBands: 1 });
  const metal = createMaterial({ color: 0xcfd5dc, minLight: 0.62, cel: 1, celBands: 2, emissive: 0.38 });
  const accent = createMaterial({ color: 0xe8641e, minLight: 0.52, cel: 1, celBands: 2, emissive: 0.30 });
  const tag = createMaterial({ color: 0xc22a22, minLight: 0.42, cel: 1, celBands: 2, emissive: 0.22 });
  const logo = createMaterial({ color: 0xd7dde3, minLight: 0.66, cel: 1, celBands: 2, emissive: 0.40 });
  const body = new THREE.Mesh(loftOct([
    [0.045, 0.148, 0.112, 0.040],
    [0.120, 0.158, 0.120, 0.045],
    [0.230, 0.156, 0.118, 0.044],
    [0.330, 0.148, 0.112, 0.041],
    [0.395, 0.132, 0.100, 0.035],
    [0.425, 0.100, 0.076, 0.026],
  ]), shell);
  const base = new THREE.Mesh(loftOct([
    [0.000, 0.130, 0.098, 0.032],
    [0.020, 0.146, 0.110, 0.038],
    [0.048, 0.152, 0.115, 0.041],
  ]), shellLo);
  const backPad = new THREE.Mesh(loftOct([
    [0.070, 0.100, 0.016, 0.006, 0, -0.100],
    [0.200, 0.104, 0.017, 0.006, 0, -0.102],
    [0.360, 0.100, 0.016, 0.006, 0, -0.098],
  ]), shellLo);
  const strapGeo = (sx) => loftOct([
    [0.075, 0.034, 0.020, 0.007, sx, -0.124],
    [0.190, 0.040, 0.026, 0.009, sx, -0.146],
    [0.300, 0.039, 0.025, 0.009, sx, -0.144],
    [0.380, 0.030, 0.019, 0.006, sx, -0.122],
  ]);
  const strapL = new THREE.Mesh(strapGeo(-0.072), webbing);
  const strapR = new THREE.Mesh(strapGeo(0.072), webbing);
  const buckleGeo = () => loftOct([
    [-0.020, 0.020, 0.024, 0.008],
    [0.020, 0.020, 0.024, 0.008],
  ]);
  const buckleL = new THREE.Mesh(buckleGeo(), metal);
  buckleL.rotation.z = Math.PI / 2;
  buckleL.position.set(-0.072, 0.150, -0.152);
  const buckleR = new THREE.Mesh(buckleGeo(), metal);
  buckleR.rotation.z = Math.PI / 2;
  buckleR.position.set(0.072, 0.150, -0.152);
  const tagM = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.032, 0.006), tag);
  tagM.position.set(0.072, 0.300, -0.172);
  const pocket = new THREE.Mesh(loftOct([
    [0.050, 0.108, 0.020, 0.007, 0, 0.104],
    [0.100, 0.120, 0.027, 0.009, 0, 0.108],
    [0.190, 0.118, 0.027, 0.009, 0, 0.106],
    [0.228, 0.100, 0.019, 0.006, 0, 0.100],
  ]), shellMid);
  const pocketZip = new THREE.Mesh(new THREE.BoxGeometry(0.196, 0.014, 0.012), zip);
  pocketZip.position.set(0, 0.205, 0.126);
  const sliderP = new THREE.Mesh(loftOct([
    [-0.014, 0.011, 0.009, 0.003],
    [0.014, 0.011, 0.009, 0.003],
  ]), metal);
  sliderP.rotation.z = Math.PI / 2;
  sliderP.position.set(0.060, 0.199, 0.132);
  const pullP = new THREE.Mesh(loftOct([
    [-0.026, 0.006, 0.006, 0.002],
    [0.026, 0.006, 0.006, 0.002],
  ]), zip);
  pullP.position.set(0.068, 0.172, 0.136);
  pullP.rotation.z = 0.25;
  const zipL = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.210, 0.010), zip);
  zipL.position.set(-0.088, 0.230, 0.117);
  zipL.rotation.x = -0.06;
  const zipR = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.210, 0.010), zip);
  zipR.position.set(0.088, 0.230, 0.117);
  zipR.rotation.x = -0.06;
  const sliderM = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.032, 0.016), metal);
  sliderM.position.set(0.088, 0.170, 0.118);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.046, 0.008), logo);
  badge.position.set(0, 0.332, 0.110);
  badge.rotation.z = Math.PI / 4;
  badge.rotation.x = -0.06;
  const handleL = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 4, 8), shellMid);
  handleL.position.set(-0.052, 0.428, 0);
  const handleR = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 4, 8), shellMid);
  handleR.position.set(0.052, 0.428, 0);
  const topLoop = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.009, 4, 8), accent);
  topLoop.rotation.y = Math.PI / 2;
  topLoop.position.set(0, 0.442, 0);
  const sideGeo = (sx) => loftOct([
    [0.050, 0.016, 0.070, 0.006, sx, 0],
    [0.100, 0.022, 0.084, 0.008, sx < 0 ? sx - 0.004 : sx + 0.004, 0],
    [0.165, 0.019, 0.078, 0.007, sx, 0],
  ]);
  const sideL = new THREE.Mesh(sideGeo(-0.150), webbing);
  const sideR = new THREE.Mesh(sideGeo(0.150), webbing);
  for (const m of [body, base, backPad, strapL, strapR, buckleL, buckleR, tagM, pocket,
    pocketZip, sliderP, pullP, zipL, zipR, sliderM, badge, handleL, handleR, topLoop, sideL, sideR]) {
    m.frustumCulled = false;
    paintWhite(m.geometry);
    g.add(m);
  }
  const crack = createMaterial({ color: 0x1b2026, minLight: 0.12, cel: 1, celBands: 1 });
  const raw = createMaterial({ color: 0xc6ccd4, minLight: 0.66, cel: 1, celBands: 2, emissive: 0.14 });
  const wearF = new THREE.Mesh(new THREE.BoxGeometry(0.200, 0.018, 0.012), crack);
  wearF.position.set(0, 0.150, 0.136);
  wearF.rotation.z = 0.42;
  const wearS = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.180, 0.100), crack);
  wearS.position.set(-0.176, 0.115, 0);
  wearS.rotation.x = 0.36;
  const wearB = new THREE.Mesh(new THREE.BoxGeometry(0.160, 0.016, 0.012), crack);
  wearB.position.set(0.050, 0.250, -0.128);
  wearB.rotation.z = -0.24;
  const tear = new THREE.Mesh(new THREE.BoxGeometry(0.130, 0.100, 0.014), raw);
  tear.position.set(0.030, 0.280, 0.112);
  tear.rotation.z = 0.55;
  const tear2 = new THREE.Mesh(new THREE.BoxGeometry(0.070, 0.070, 0.014), raw);
  tear2.position.set(-0.030, 0.090, 0.122);
  tear2.rotation.z = -0.7;
  for (const m of [wearF, wearS, wearB, tear, tear2]) g.add(m);
  g.userData.dmg = {
    chips: [
      chipPart(wearF, 0.30),
      chipPart(wearS, 0.45),
      chipPart(wearB, 0.62),
      chipPart(tear, 0, true),
      chipPart(tear2, 0, true),
    ],
    snaps: [
      snapPart(strapR, 0.170, 0.060, -0.220, 0, 0, 0.55),
      snapPart(sliderP, 0.150, 0.260, 0.190, 0, 0, 1.35),
      snapPart(pullP, 0.160, 0.110, 0.220, 0, 0, 1.10),
      snapPart(handleR, 0.130, 0.510, 0.110, 0, 0, -0.95),
      snapPart(buckleR, 0.150, 0.090, -0.200, 0, 0, 1.15),
      snapPart(tagM, -0.020, 0.200, -0.220, 0, 0, -1.15),
    ],
  };
  g.userData.skin = { shell, shellMid, shellLo, webbing, zip, metal, accent, tag, logo };
  g.userData.skinBase = {
    shell: new THREE.Color(0x848c94),
    shellMid: new THREE.Color(0x6f767f),
    shellLo: new THREE.Color(0x4c5259),
    webbing: new THREE.Color(0x22252b),
    zip: new THREE.Color(0x14171b),
    metal: new THREE.Color(0xcfd5dc),
    accent: new THREE.Color(0xe8641e),
    tag: new THREE.Color(0xc22a22),
    logo: new THREE.Color(0xd7dde3),
  };
  g.scale.setScalar(1.67);
  return g;
}
function keysMesh() {
  const g = new THREE.Group();
  const gold = createMaterial({ color: 0xe8b73a, minLight: 0.4, cel: 1, celBands: 3, emissive: 0.25 });
  const crack = createMaterial({ color: 0x140f06, minLight: 0.08, cel: 1, celBands: 1 });
  // ...and the BRIGHT one, for the break itself (see the note in `bagMesh`): a snapped key shows bare
  // sheared metal at the fracture, which is lighter than the key's own darkening body, and it is what
  // makes the separation read as a break rather than as two pieces that happen to be apart.
  const raw = createMaterial({ color: 0xe6dcb8, minLight: 0.7, cel: 1, celBands: 2, emissive: 0.30 });
  // THE KEY IS BUILT IN TWO PIECES — the BOW (the ring) and the BLADE (the shaft and its teeth) —
  // because a broken key IS those two, and building them as separate groups is what lets the break
  // be a rigid SEPARATION (the blade swings off the ring and hangs) rather than a squash or a
  // texture swap. The bow keeps the grip; the blade is the half that snaps away.
  const bow = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 5, 10), gold);
  bow.position.y = 0.16;
  bow.add(ring);
  const blade = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.02), gold);
  shaft.position.y = 0.05;
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.02), gold);
  t1.position.set(0.035, 0.02, 0);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.02), gold);
  t2.position.set(0.035, 0.07, 0);
  blade.add(shaft, t1, t2);
  // The wear is a nick chewed out of the shaft just under the bow — where a key actually bends, and
  // where the break will be, so the damage the player can see is the damage that happens.
  const nick = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.016, 0.026), raw);
  nick.position.set(0.004, 0.115, 0);
  nick.rotation.z = -0.34;
  blade.add(nick);
  // ...and a scuff across the ring, so the bow has its own damage read for when the blade is gone.
  const scuff = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.045), crack);
  scuff.position.set(0.05, 0.02, 0);
  scuff.rotation.z = 0.6;
  bow.add(scuff);
  for (const m of [ring, shaft, t1, t2, nick, scuff]) {
    m.frustumCulled = false;
    paintWhite(m.geometry);
  }
  bow.frustumCulled = false;
  blade.frustumCulled = false;
  g.add(bow, blade);
  g.userData.dmg = {
    chips: [chipPart(scuff, 0.45), chipPart(nick, 0, true)],
    // The snap: the blade drops down and swings out of the bow's line, hanging off the grip.
    snaps: [snapPart(blade, 0.055, -0.055, 0.012, 0, 0, 0.95)],
  };
  g.userData.skin = { gold };
  g.userData.skinBase = { gold: new THREE.Color(0xe8b73a) };
  return g;
}

// ================================================================================================
// THE SOCCER BALL'S OWN SHAPE (session 178)
//
// An icosahedron of `detail` 2, with the TWELVE PENTAGONS painted onto the shell's own vertices
// rather than built as panels floating over it — a panel proud of a sphere is a panel that lifts off
// it at the rim, and a soccer ball is nothing but the pattern.
//
// The rule that finds the pentagons is the polyhedron's own geometry: an icosahedron's twelve
// vertices are the centres of the twelve pentagons of the truncated icosahedron it becomes, and every
// edge midpoint is a corner of one of them. So a facet belongs to a pentagon exactly when all THREE
// of its corners are within `BALL_PANEL` of the SAME icosahedron vertex direction — the midpoint
// angles are 31.7 deg and the face centres are 37.4 deg, so the threshold sits at 34.4 and both
// sides of it are a couple of degrees clear. At `detail` 2 that carves each face into one white
// diamond (a hexagon, shared by its neighbours) and three black quadrant triangles, and the five
// quadrants around each vertex tile into a clean pentagon — the real pattern, off one dot product
// per corner, with nothing to align by hand and nothing that can drift.
const BALL_PANEL = 0.8244; // cos(34.4deg) — see the note above
const BALL_INK = [0.11, 0.12, 0.145]; // the panels, as a multiplier on the shell's own white
const BALL_PENTAGONS = (() => {
  const p = (1 + Math.sqrt(5)) / 2;
  const out = [];
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      out.push([0, s1, s2 * p], [s1, s2 * p, 0], [s2 * p, 0, s1]);
    }
  }
  return out.map((v) => new THREE.Vector3(v[0], v[1], v[2]).normalize());
})();
const _ballV = new THREE.Vector3();

function paintBallPanels(geo) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3).fill(1);
  for (let t = 0; t + 2 < n; t += 3) {
    let dark = false;
    for (const v of BALL_PENTAGONS) {
      let all = true;
      for (let k = 0; k < 3; k++) {
        _ballV.fromBufferAttribute(pos, t + k).normalize();
        if (_ballV.dot(v) < BALL_PANEL) {
          all = false;
          break;
        }
      }
      if (all) {
        dark = true;
        break;
      }
    }
    if (!dark) continue;
    for (let k = 0; k < 3; k++) {
      col[(t + k) * 3] = BALL_INK[0];
      col[(t + k) * 3 + 1] = BALL_INK[1];
      col[(t + k) * 3 + 2] = BALL_INK[2];
    }
  }
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
}

function ballMesh() {
  const g = new THREE.Group();
  const SHELL = 0xe9e7de;
  const shellMat = createMaterial({ color: SHELL, minLight: 0.34, cel: 1, celBands: 3, emissive: 0.10 });
  const crack = createMaterial({ color: 0x1b1f26, minLight: 0.10, cel: 1, celBands: 1 });
  // THE SHELL. 320 facets, painted per triangle (see `paintBallPanels`) — the PS1 football, which is
  // a sphere you can actually see turning.
  const geo = new THREE.IcosahedronGeometry(BALL_R, 2);
  paintBallPanels(geo);
  const shell = new THREE.Mesh(geo, shellMat);
  shell.frustumCulled = false;
  g.add(shell);
  // ...and a SCUFF, half-sunk in the shell on one flank: the ball's own damage read, hidden until the
  // ball is genuinely worn (`applyPropDamage`'s chip rule — the panels' own paint does the rest).
  const scuff = new THREE.Mesh(new THREE.BoxGeometry(BALL_R * 0.62, BALL_R * 0.16, BALL_R * 0.34), crack);
  scuff.position.set(BALL_R * 0.60, BALL_R * 0.58, BALL_R * 0.42);
  scuff.rotation.set(0.5, 0.7, 0.3);
  scuff.frustumCulled = false;
  g.add(scuff);
  g.userData.dmg = { chips: [chipPart(scuff, 0.38)] };
  g.userData.skin = { shell: shellMat };
  g.userData.skinBase = { shell: new THREE.Color(SHELL) };
  return g;
}

// ================================================================================================
// THE SKATEBOARD'S OWN SHAPE (session 200)
//
// A board is the one prop whose LOCAL ORIGIN IS A PLANE THE GAME ACTUALLY USES: the deck's top face
// is where the feet stand, so the mesh is authored with its origin ON that face (y = 0), the wheels
// hanging below it and the nose out along +z. That is what makes the whole riding mode cheap — the
// mount parents the mesh into the rig at exactly `-HY` (the body's own deck plane) and the wheels
// then reach the ground by themselves once the rig is lifted by the box's own height (see
// `mountBoard` and the `BOARD_LIFT` note in player/config.js).
//
// ...and because the origin IS the deck's top, the mesh's own bounding box is what tells the game how
// tall a board is: `-(box.min.y)` is the height from the grip to the road — 0.13 world units here,
// which is a real board over a real body (800 mm x 200 mm x 110 mm against a 1.8 m man). Nothing
// hard-codes it, so a taller wheel moves the body up with it.
//
// The shape is the five things a board is made of:
//   * THE DECK: a flat slab with a KICKED NOSE AND TAIL (0.40 rad measured off the slab's own end,
//     which is a real pop — the tail is what the ollie comes off).
//   * GRIP TAPE: a near-black sheet a hair proud of the deck's top face.
//   * A STRIPE UNDERNEATH in the character's own mint — the graphic, and the only colour on it.
//   * TWO TRUCKS: a baseplate, a hanger and an axle (the axle is a cylinder because it is one).
//   * FOUR WHEELS, chunky and cream, which is what a board of this era would have had.
//
// THE ONE NUMBER IN HERE THAT IS NOT A DIMENSION (session 201 — the user's *"make the skate board
// bigger"*) is how big the finished thing is DRAWN. Everything above is authored at a real board's own
// proportions — 800 x 200 mm over a 1.8 m body — and then scaled by this alone (see the note over the
// `g.scale` line below), so making it bigger can never pull the deck out of proportion with its own
// wheels. It is read back out of the world by nobody: the ride's height is TAKEN off this mesh's box
// (see `BOARD_LIFT` in player/config.js), so the two follow each other and cannot drift.
const BOARD_SIZE = 1.8;
function boardMesh() {
  const g = new THREE.Group();
  const deckMat = createMaterial({ color: 0x2f343b, minLight: 0.36, cel: 1, celBands: 3 });
  const gripMat = createMaterial({ color: 0x14171b, minLight: 0.18, cel: 1, celBands: 2 });
  const accent = createMaterial({ color: 0x63e0b4, minLight: 0.42, cel: 1, celBands: 3, emissive: 0.14 });
  const truckMat = createMaterial({ color: 0x9aa3ad, minLight: 0.52, cel: 1, celBands: 3, emissive: 0.08 });
  const wheelMat = createMaterial({ color: 0xe4dcc0, minLight: 0.4, cel: 1, celBands: 3 });
  const box = (w, h, d, mat, x, y, z, rx) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    m.frustumCulled = false;
    paintWhite(m.geometry);
    g.add(m);
    return m;
  };
  // ...the deck, and the two kicks off its ends
  box(0.26, 0.024, 0.66, deckMat, 0, -0.012, 0);
  box(0.24, 0.022, 0.20, deckMat, 0, 0.028, 0.418, -0.40);
  box(0.24, 0.022, 0.20, deckMat, 0, 0.028, -0.418, 0.40);
  box(0.226, 0.006, 0.64, gripMat, 0, 0.003, 0);
  box(0.06, 0.006, 0.64, accent, 0, -0.026, 0);
  // ...the trucks, at the two places a board has them
  for (const e of [-1, 1]) {
    box(0.10, 0.018, 0.055, truckMat, 0, -0.033, e * 0.24);
    box(0.16, 0.024, 0.045, truckMat, 0, -0.050, e * 0.24);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.21, 6), truckMat);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, -0.085, e * 0.24);
    axle.frustumCulled = false;
    paintWhite(axle.geometry);
    g.add(axle);
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.044, 8), wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(s * 0.112, -0.085, e * 0.24);
      w.frustumCulled = false;
      paintWhite(w.geometry);
      g.add(w);
    }
  }
  // ...AND HOW BIG THE WHOLE THING IS DRAWN (session 201 — the user's *"make the skate board bigger"*).
  // Every dimension above is authored at a board's own proportions and then drawn through this ONE
  // number, so the deck, the kicks, the trucks and the wheels scale together and nothing can drift out
  // of proportion. It scales about the mesh's own ORIGIN, which is the deck's top face — the plane the
  // feet stand on — so the stance solved against that plane (`BOARD.hipY` and the two ankle stations in
  // streetwear.js) is untouched, and the wheels simply hang `BOARD_SIZE` times further below it. The ride's
  // height is then the same number re-taken off this mesh's own box: the wheels hang to -0.130 unscaled, so
  // at 1.5 they hang to -0.195 and `P.BOARD_LIFT` is 0.195 (see its note in player/config.js), with
  // `BOARD_ROAD` being that height re-expressed in the rig's own units.
  g.scale.setScalar(BOARD_SIZE);
  return g;
}

function propMeshFor(kind) {
  const g = kind === "bag" ? bagMesh() : kind === "ball" ? ballMesh() : kind === "board" ? boardMesh() : keysMesh();
  g.userData.kind = kind;
  g.userData.baseScale = g.scale.x || 1;
  g.userData.box = propBoxOf(g);
  return g;
}

// THE BOX A PROP IS, measured off the mesh it is drawn with: the centre and the half-extents of its
// own bounding box, in its own local frame. It is what the prop RESTS on (see `propSupport`), and
// it has to be the MESH's own box rather than the collision radius, because the two are nothing
// alike: a duffel's collider is a hairline 0.06 — the body has to be able to walk into a soft bag —
// while the duffel itself is 0.62 tall and 0.55 across. Rested on the collider it would stand in the
// deck, and laid on its side (which the angle physics allows, see `PROP_REST_AXES`) it would be
// buried to the handle. Measured off the mesh, a bag lying on its face rides exactly on that face.
const _propBox3 = new THREE.Box3();
// ...and the two the skateboard's mount/dismount need: where the mesh is in the world when it leaves
// the rig, and which way it is facing when it does (see `dismountBoard`).
const _rideV = new THREE.Vector3();
const _rideQ = new THREE.Quaternion();
function propBoxOf(mesh) {
  _propBox3.setFromObject(mesh);
  const b = _propBox3;
  return {
    cx: (b.min.x + b.max.x) * 0.5,
    cy: (b.min.y + b.max.y) * 0.5,
    cz: (b.min.z + b.max.z) * 0.5,
    hx: (b.max.x - b.min.x) * 0.5,
    hy: (b.max.y - b.min.y) * 0.5,
    hz: (b.max.z - b.min.z) * 0.5,
  };
}

// The support a prop has standing as it was authored: what its origin has to be above the deck for
// the prop to stand on its own base (`hy - cy`, which is the base's own height below the origin).
function boxUpright(b) {
  return b.hy - b.cy;
}


// ------------------------------------------------------------------------------------------------
// WHERE THE HOLDERS ARE, AND WHERE THE EDITOR'S CAMERA STANDS.
//
// The editor is a CLOSE, LOW, BEHIND-THE-WAIST look: the holder you are working on fills the frame
// at the size it has on the body, the horizon sits near eye level, and — because there is no dim
// behind the editor any more (see `#inv` in index.html) — the world he is standing in is what you
// are looking past him at. `dyaw` is off the body's facing (0 is in FRONT of him, `Math.PI` directly
// behind), so the four stations are the four sides of the waist, and the swing between them IS the
// camera shift: every holder gets its own stand.
//
// THE STATIONS ARE MEASURED OFF THE BODY, NEVER OFF THE WORLD. `cam` is how high the camera stands
// over the hip as a share of `bodyDatum()` — the hip's own height above his feet, about 1.35 world
// units — and `look` is the aim's offset from the hip in world units. Nothing here is the hip's live
// world height, and that was the whole bug: `applyCamera` used to read `hy + v.height` (an ABSOLUTE
// world y) and put it through the 0.55 that was written for a body measurement, so opening the
// editor upstairs multiplied the TOWER's height by a half and walked the camera off into the sky.
// Hung on the body instead, the same tower frames him exactly as the same street does.
//
// (The rig is built in its own units and scaled into the world on the way in — `charMesh.scale` is
// about 1.35 here, which is why the standing hip lands near world y 1.35 above his feet.)
const CAM_UP = 0.85;      // the camera's stand over the hip, as a share of bodyDatum()
const BODY_DATUM = 1.35;  // ...the fallback datum when the rig is not in the scene (see bodyDatum)
const BAG_CAM_UP = 0.94;  // the same stand for a duffel ON THE DECK, world units above its own base
const VIEWS = {
  back:  { dyaw: Math.PI - 0.30, dist: 1.45, cam: 0.85, look: { x: 0.0, y: -0.05, z: -0.06 } },
  left:  { dyaw: Math.PI - 0.82, dist: 1.45, cam: 0.85, look: { x: 0.10, y: -0.04, z: -0.02 } },
  right: { dyaw: Math.PI + 0.82, dist: 1.45, cam: 0.85, look: { x: -0.10, y: -0.04, z: -0.02 } },
  bag:   { dyaw: Math.PI - 0.18, dist: 1.55, cam: 0.70, look: { x: 0.0, y: -0.34, z: -0.16 } },
};

// And where each holder LIVES on him: HIP-RELATIVE offsets in the rig's own units and axes, with +x
// the character's LEFT (see `LK` in streetwear.js — the rig's own bone names are swapped relative to
// the body), +z the way he faces. They are hung off the live hip bone every frame, so a pocket rides
// the pelvis the way the pocket rides the hips. `name` is the body-space DIRECTION the holder's name
// is pushed out along — which is what lets the ring of labels turn with the body and the camera
// instead of needing four fixed screen slots, and is why the arrow head can always be aimed back in
// at the part it names. (The bag is not on this table: it is a real prop with a place of its own —
// `bag.pos` — worn or on the deck.)
const BODY = {
  left:  { at: [0.118, 0.012, 0.088], name: [0.95, 0.55, 0.30] },
  right: { at: [-0.118, 0.012, 0.088], name: [-0.95, 0.55, 0.30] },
  back:  { at: [0.0, -0.050, -0.148], name: [0.26, 0.95, -0.44] },
};

const UP = new THREE.Vector3(0, 1, 0);
// Scratch for the editor's own projection maths (`bodyPoint` / `toScreen` / `layout`) — the layout
// runs every frame the editor is open, so it allocates nothing.
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _s1 = { x: 0, y: 0 };
const _s2 = { x: 0, y: 0 };
const _ring = [];
const _hip = new THREE.Vector3();
const _bodyV = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _hq = new THREE.Quaternion();
const _hs = new THREE.Vector3();
const _hr = new THREE.Vector3();
const _hu = new THREE.Vector3();
const _hf = new THREE.Vector3();
// ...and the tote's own (see `totePoint`): the two hands and the bag's own point in the torso.
const _bagA = new THREE.Vector3();
// ...and the hand's own world point, for the throw's release (`releaseHandThrow`).
const _handW = new THREE.Vector3();
const _bagB = new THREE.Vector3();
const _bagP = new THREE.Vector3();
// ...and the props' own angles (see `stepSpin` / `settleSpin`): a quaternion to integrate with, one
// to hold a target, an axis, and the world direction a rest axis is currently pointing in. Reused
// per prop per frame, so a street full of tumbling keys allocates nothing.
const _propQ = new THREE.Quaternion();
const _propQ2 = new THREE.Quaternion();
const _propAxis = new THREE.Vector3();
const _propUp = new THREE.Vector3();
const SVG_NS = "http://www.w3.org/2000/svg";

export class GearSystem {
  constructor(o) {
    this.scene = o.scene;
    this.world = o.world;
    this.player = o.player;
    this.input = o.input;
    this.rig = o.rig;
    this.sfx = o.sfx;
    this.effects = o.effects;

    // ---- the third pocket: LEFT / RIGHT / BACK, all 1 x 2 -------------------------------
    this.pockets = [
      new Container({ key: "left", name: "LEFT POCKET", short: "L", kind: "pocket", w: 1, h: 2, theme: POCKET_THEME, anchor: "left" }),
      new Container({ key: "right", name: "RIGHT POCKET", short: "R", kind: "pocket", w: 1, h: 2, theme: POCKET_THEME, anchor: "right" }),
      new Container({ key: "back", name: "BACK POCKET", short: "B", kind: "pocket", w: 1, h: 2, theme: BACK_THEME, anchor: "back" }),
    ];

    // ---- the world bag ------------------------------------------------------------------
    const gy = this.world ? this.world.terrainHeight(BAG_HOME.x, BAG_HOME.z) : 0;
    const mesh = propMeshFor("bag");
    const box = new Container({ key: "bag", name: "BACKPACK", short: "BAG", kind: "bag", w: BAG_W, h: BAG_H, theme: BAG_THEME, anchor: "bag" });
    this.bag = {
      item: makeItem("bag"),
      pos: new THREE.Vector3(BAG_HOME.x, gy + 0.5, BAG_HOME.z),
      vel: new THREE.Vector3(),
      yaw: 0.6,
      // THE PROPS' OWN ANGLES (see `stepSpin`): a world-space angular velocity, and the orientation
      // it is integrated into. `spin` remains the Y part of it, because every gameplay read of the
      // bag's turn is about the DECK'S plane — the slam arms one, the sprint kick sets one, the
      // live bag is read off its blur — and that is exactly what `ang.y` is. So the two hundred
      // lines of bag behaviour that predate this need no idea that the prop has a third dimension.
      ang: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      get spin() {
        return this.ang.y;
      },
      set spin(v) {
        this.ang.y = v;
      },
      roll: PROP_ROLL_R.bag,
      rest: "bag",
      // ...and the box it RESTS on (see `propSupport`): measured off the mesh, and its standing
      // support seeded so the first frame is right.
      supBox: mesh.userData.box,
      sup: boxUpright(mesh.userData.box),
      worn: false,
      tote: false,
      hot: 0,
      hotCd: 0,
      armed: false, // a live bag that has been STRUCK — see "THE HOT BAG" (no homing before this)
      leap: false,  // ...and a slam that has not spent its one big jump off the deck yet
      hp: ITEM_DEFS.bag.maxHp,
      maxHp: ITEM_DEFS.bag.maxHp,
      radius: 0.10,
      broken: false,
      kickCd: 0,
      impactCd: 0,
      holdT: 0,
      // ...and THE LIVE STATE, which the duffel shares with any loose prop that gets slammed (session
      // 189 — see `liveStep`): the hot clock is `hot`, the flags beside it are `armed`/`leap`/`hotCd`,
      // the trail's throttle is `hotFxT`, and the two doors the behaviour is told through are called —
      // what a point of damage does to it, and whether it is finished. The duffel's are its own health.
      hotFxT: 0,
      hurt: (dmg) => this.damageBag(dmg),
      isBroken: () => this.bag.broken,
      mesh,
      box,
    };
    // A fresh duffel: no bruise, nothing broken (see the damage block above `bagMesh`).
    applyPropDamage(mesh, 0, false);
    // ...wearing the deck turn it was authored with (`yaw`), so a fresh bag stands square to the
    // same line it always has — the angle physics takes over from the moment anything moves it.
    this.bag.quat.setFromAxisAngle(_propAxis.set(0, 1, 0), this.bag.yaw);
    this.scene.add(mesh);
    this.drops = [];
    // THE HANDS (session 179 — see "THE HANDS" at the head of the file): the one thing being
    // carried, or null. `{ item, mesh }`.
    this.hands = null;

    // ---- THE BALL (session 178) --------------------------------------------------------------
    // A soccer ball lying at the spawn, a couple of metres off the duffel so the two `E` prompts do
    // not stand on each other's toes (see `interact`). It is an ordinary loose prop — the same object
    // a key becomes when it falls out of a pocket — that simply starts the game PLACED rather than
    // thrown, so the boot, the wall, the ground roll, the pickup and the prompt all already know it.
    this.dropAt(makeItem("ball"), BALL_HOME.x, BALL_HOME.z);

    // ---- THE SKATEBOARD (session 200) ---------------------------------------------------------
    // Lying at the spawn like the ball, and for the same reason: the riding mode is reachable from
    // the first second of the game rather than out of a holder. `this.ride` is the DROP being ridden
    // (or null), and the body's own half of the mode is `player.board` — the two are written and
    // cleared together (see `mountBoard` / `dismountBoard`).
    this.boardDrop = this.dropAt(makeItem("board"), BOARD_HOME.x, BOARD_HOME.z);
    this.ride = null;
    this.boardLift = 0;

    // ---- the editor's own state ----------------------------------------------------------
    this.editorOpen = false;
    this.bagOpen = false;
    // ---- THE TOTE + THE HOT BAG (see the two blocks at the head of the file) -----------------
    // `eTap`/`grabTap` are the two halves of the carry chord — each is a short window written when
    // its own press arrives, and the bag comes up only when both are open at once, which is what
    // makes "E and right click at the same time" work whichever one landed first.
    this.eTap = 0;
    this.grabTap = 0;
    this.toteKind = "hold";  // "hold" | "throw" | "slam"
    this.toteT = 0;          // the shape's own clock, in seconds
    this.toteDur = 0;        // ...and how long it runs for
    this.toteTime = 0;       // the cradle's running clock (what the breath rides)
    this.carryTime = 0;      // ...and the carry's own (see `publishCarry`)
    this.releaseAt = 0;      // s into the shape that the bag actually leaves the hands
    this.pendingThrow = null; // "throw" | "slam" while a shape is winding up (see `throwFromHands`)
    // ---- THE BALL'S OWN ACTIONS (session 180 — see the block at the head of the file) ---------
    // The pose layer's own clock, one shape at a time: `ballKind` is "throw" or "shoot" while a
    // shape is playing (null the moment it is done), `ballT`/`ballDur` its clock in seconds, and
    // `ballPhase` what `poseBallAction` reads (0..1, clamped at 1 for the last beat so the layer can
    // fade out on the follow-through). `ballRelease` is the second inside the shape that the ball
    // actually leaves (the beat — see `SHOOT` / `THROW_RELEASE`), and `ballShot` is the
    // loose ball a shoot is aimed at (`null` for a throw, which leaves the HANDS).
    this.ballKind = null;
    this.ballT = 0;
    this.ballDur = 0;
    this.ballPhase = 0;
    this.ballRelease = Infinity;
    this.ballShot = null;
    // ...and THE SHOOT'S OWN CHARGE (session 198 — see `shootBegin` / `tickShoot`). The shoot is the
    // one shape that can be HELD, so its clock is not `ballT`/`ballDur` at all: `ballPhase` is driven
    // by hand (the wind-up runs to the shape's COCK beat and WAITS there), `ballCharging` is whether
    // the button is still down and the wind-up still live, `ballUnwinding` whether it was CANCELLED
    // and the phase is walking home, and `ballWindT` is how many seconds it has been held — which is
    // the charge itself. `ballStriking` is the half after the release, `ballStrikeRate` the phase's
    // rate through it (set BY the release, and the whole of how long the swing takes), and
    // `ballFired` the release's own one-shot latch.
    this.ballCharging = false;
    this.ballStriking = false;
    this.ballUnwinding = false;
    this.ballWindT = 0;
    this.ballStrikeRate = 0;
    this.ballFired = false;
    this.ballCharge = 0;   // 0..1 — the LIVE charge (what the meter reads), frozen by the release
    this.ballPower = 0;    // 0..1 — what the hold was actually worth, once it is away (see `powerOf`)
    this.ballShow = 0;     // 0..1 — the meter's own fade in and out (see `publishCarry`)
    this.ballLower = 1;    // 0..1 — how much of the HIPS AND LEGS the shoot's shape owns (see
                           // `legWeight` / `SHOOT_LEG_*`): 0 at a run, so the coil is a coil and not
                           // a pair of sliding feet
    // (the live props' own trail throttles live on the props — see `hotFxT` on the duffel and in
    // `makeDrop` — because two of them can be hot at once. Session 189.)
    this.quickOpen = false;
    this.quickT = 0;
    this.focusKey = "left";
    this.tabDownT = 0;
    this.tabTapArmed = false;
    this.tabWasHeld = false;
    this.tabClosedEditor = false;
    this.cine = 0;
    this.swirl = 0;
    this.roll = 0;
    this.mouse = { x: 0, y: 0 };
    this.drag = null;
    // ...and the two halves of a PRESS (see `onItemDown`): `press` is a press that has not
    // travelled yet — a drag that has not begun, or a click — and `sel` is the item a click
    // SELECTED. It is how a thing is moved with two clicks instead of one drag.
    this.press = null;
    this.sel = null;
    this.hoverTarget = null;
    this._lastFocus = null;
    // ...and the DOUBLE-CLICK's own memory (see `onStageDown`): the container the last press landed
    // on, and when. Two presses on the same one inside `DBL_MS` are ONE gesture — the stash.
    this._dblKey = null;
    this._dblT = 0;
    this._dblX = 0;
    this._dblY = 0;
    // ...and the refusal's own frame (see `deny`): `{ key, t, dur }` while one is running.
    this.denyState = null;
    this._tagW = 0;
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._look = new THREE.Vector3();
    // The editor hangs its board on the body, so it needs the lens that is on screen this frame and
    // the size it is drawing into — both of them written by the frame (`applyCamera` / `layout`).
    this.camera = null;
    this.vw = 0;
    this.vh = 0;

    // ---- the DOM -------------------------------------------------------------------------
    this.promptEl = document.getElementById("interactPrompt");
    this.gameEl = document.getElementById("game");
    this.invEl = document.getElementById("inv");
    this.stageEl = document.getElementById("invStage");
    this.invTitle = document.getElementById("invTitle");
    this.invHint = document.getElementById("invHint");
    this.quickEl = document.getElementById("quickInv");
    // The hint line's own text, read ONCE here rather than restated in JS: `updateHint` swaps in
    // the line for a live selection and puts this back afterwards, so the two can never disagree
    // about what the mode does.
    this.hintBase = this.invHint ? this.invHint.textContent : "";
    // A press that reaches the STAGE landed on nothing at all — so it puts down whatever was
    // selected. (The boards and the labels all stop their own presses before they get here; a press
    // on a board's empty well is a placement, and one on a label is a move.)
    if (this.stageEl) {
      this.stageEl.addEventListener("pointerdown", () => {
        if (this.sel) {
          this.sel = null;
          this.render();
        }
      });
      // ...AND THE DOUBLE-CLICK, caught on the way DOWN (see `onStageDown`). It has to be a CAPTURE
      // listener, because every tile and every board stops its own press from propagating — which is
      // what keeps a press on a tile from also being read as a press on the board behind it — and a
      // gesture that has to be seen everywhere cannot live in the bubble phase.
      this.stageEl.addEventListener("pointerdown", (e) => this.onStageDown(e), true);
    }

    window.addEventListener("mousemove", (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    });
    window.addEventListener("pointermove", (e) => this.onDragMove(e));
    window.addEventListener("pointerup", (e) => this.onDragUp(e));

    // The player starts holding the only item in the game.
    this.storeInPockets(makeItem("keys"));
    this.renderQuick();
  }

  // ---- holders ---------------------------------------------------------------------------
  // Can the thing in the player's hands go into the DUFFEL from here? On his back, in his arms, open
  // in the editor, or on the deck within reach — the same 3.2 `toggleWear` shoulders it from — and
  // not when it has come apart, because a broken duffel is not a container (`breakBag` throws what it
  // was holding onto the floor).
  bagReachable() {
    const bag = this.bag;
    if (!bag || bag.broken) return false;
    if (bag.worn || bag.tote || this.bagOpen) return true;
    const p = this.player.pos;
    return Math.hypot(bag.pos.x - p.x, bag.pos.z - p.z) < 3.2;
  }

  storeInPockets(item) {
    for (const p of this.pockets) {
      const f = firstFit(p, item);
      if (f) {
        place(p, item, f.x, f.y, { enter: true });
        return p;
      }
    }
    // ...AND THEN THE DUFFEL (session 178). A bulky item — the ball, at 2 x 2 — has no pocket that can
    // take it (they are 1 x 2), and the user's own words were *"i can pick it up and put it in my
    // bag"*: so the bag is asked too, but only while it is actually WITH him (see `bagReachable`), so
    // a ball can never be posted into a duffel left on the other side of the map.
    if (this.bagReachable()) {
      const b = this.bag.box;
      const f = firstFit(b, item);
      if (f) {
        place(b, item, f.x, f.y, { enter: true });
        return b;
      }
    }
    return null;
  }

  containerByKey(key) {
    if (key === "bag") return this.bag.box;
    return this.pockets.find((p) => p.key === key) || null;
  }

  isWorn() {
    return this.bag.worn;
  }

  visibleCards() {
    const out = [...this.pockets];
    if (this.bag.worn || this.bagOpen) out.push(this.bag.box);
    return out;
  }

  // ---- the frame -------------------------------------------------------------------------
  preFrame(dt, inp) {
    // TAB owns the frame: TAP is the quick menu, HOLD is the editor, and the editor STAYS open
    // when TAB is released — the next TAB press (or E) closes it.
    if (inp.tabPressed) {
      if (this.editorOpen) {
        this.closeEditor();
        this.tabClosedEditor = true;
      } else {
        this.tabDownT = 0;
        this.tabTapArmed = true;
        this.tabClosedEditor = false;
      }
    }
    const tabHeld = !!inp.tabHeld;
    if (tabHeld && this.tabTapArmed && !this.editorOpen) {
      this.tabDownT += dt;
      if (this.tabDownT >= 0.32) {
        this.openEditor(null);
        this.tabTapArmed = false;
      }
    }
    if (!tabHeld && this.tabWasHeld) {
      if (!this.editorOpen && !this.tabClosedEditor && this.tabTapArmed && this.tabDownT < 0.32) this.openQuick();
      this.tabTapArmed = false;
    }
    this.tabWasHeld = tabHeld;

    if (this.quickOpen) {
      this.quickT -= dt;
      if (inp.skill1Pressed) {
        inp.skill1Pressed = false;
        this.takeQuick(0);
      } else if (inp.skill2Pressed) {
        inp.skill2Pressed = false;
        this.takeQuick(1);
      }
      if (this.quickT <= 0) this.closeQuick();
    }

    if (this.editorOpen) {
      if (inp.interactPressed) {
        inp.interactPressed = false;
        this.closeEditor();
      }
      if (this.input.pressed("KeyG")) this.toggleWear();
      // The pockets own the whole frame while they are open: no movement, no skills, no look.
      inp.moveX = 0;
      inp.moveZ = 0;
      inp.jumpPressed = false;
      inp.slidePressed = false;
      inp.divePressed = false;
      inp.slamPressed = false;
      inp.dashPressed = false;
      inp.kickPressed = false;
      inp.grabPressed = false;
      inp.blockHeld = false;
      inp.skill1Pressed = false;
      inp.skill2Pressed = false;
      inp.skill3Pressed = false;
      inp.ultPressed = false;
      inp.lookDX = 0;
      inp.lookDY = 0;
    } else {
      // -----------------------------------------------------------------------------------------
      // THE TOTE — E AND THE RIGHT BUTTON, TOGETHER (see the block at the head of the file).
      // Each press opens a short window when it arrives, and the duffel only comes up into both
      // arms when BOTH windows are open on the same frame — so the chord works whichever of the two
      // landed first, and either one on its own still does exactly what it always did (E opens the
      // bag's board, the right button is the grab). E's own action is therefore HELD for the length
      // of the window and fired at the end of it, when no right click came.
      // -----------------------------------------------------------------------------------------
      if (this.bag.tote) {
        // WHILE IT IS IN HIS ARMS the bag owns the two mouse buttons and the skills: M1 is the
        // plain forward throw, M2 the slam that leaves it live (see `throwFromHands`), and the three
        // skills are refused because both arms are full. E sets it gently back on the deck.
        if (inp.interactPressed) {
          inp.interactPressed = false;
          this.putDownBag();
        }
        if (inp.kickPressed) {
          inp.kickPressed = false;
          this.throwFromHands("throw");
        }
        if (inp.grabPressed) {
          inp.grabPressed = false;
          this.throwFromHands("slam");
        }
        inp.skill1Pressed = false;
        inp.skill2Pressed = false;
        inp.skill3Pressed = false;
        inp.ultPressed = false;
        this.eTap = 0;
        this.grabTap = 0;
      } else if (this.hands) {
        // A HAND IS FULL (session 179 — see "THE HANDS"). E is the way back to empty-handed — it
        // sets the thing down — UNLESS the duffel is within reach, where E is still the bag that
        // opens. That exception is the whole flow the user described: pick the ball up, walk to the
        // bag, press E, double-click the bag's board. M1 throws what you are holding — and since
        // session 183 that is an authored overhand throw (see `throwHands` and the `THROW` table in
        // streetwear.js), the ball leaving the hand on the shape's own release BEAT. The skills stand
        // down for the same reason they do with the duffel in both arms: one handful, and the hand
        // that would throw the move is holding a ball.
        if (inp.interactPressed) {
          inp.interactPressed = false;
          const p = this.player.pos;
          const bagD = Math.hypot(this.bag.pos.x - p.x, this.bag.pos.z - p.z);
          if (!this.bag.worn && !this.bag.broken && bagD < 2.8) {
            this.bagOpen = true;
            this.openEditor("bag");
          } else if (this.hands.item.kind === "board") {
            // ...AND A BOARD IN THE HANDS IS STEPPED ON, not set down (session 200): the same press
            // makes the same drop and then mounts it, because "get on it by pressing E" is exactly
            // what a player holding a board and pressing E is asking for. It is the one prop this
            // happens to — everything else E sets down as it always has.
            const dr = this.putDownHands();
            if (dr) this.mountBoard(dr);
          } else {
            this.putDownHands();
          }
        }
        if (inp.kickPressed) {
          inp.kickPressed = false;
          this.throwHands();
        }
        // ...and M2 IS THE SLAM (session 189 — the user's *"make me able to slam it and it spins
        // like how we did for the bag"*, see `slamHands`): the ball is taken up over the head and
        // driven into the deck a step ahead, where it comes off LIVE exactly as the duffel does out
        // of both arms. The press is only the hand's when the thing IN the hand asks for the right
        // button (`takeM2` — the ball); a key in the hand leaves M2 to the grab verb, which is what
        // it has always done.
        if (inp.grabPressed) {
          const hdef = ITEM_DEFS[this.hands.item.kind] || {};
          if (hdef.takeM2) {
            inp.grabPressed = false;
            this.slamHands();
          }
        }
        // ...and G still works out in the world if he is standing on the duffel — shouldering the bag
        // with a hand full is exactly how the user gets the ball to a board it can go on. (The chord
        // that lifts the duffel into BOTH arms is refused while a hand is full — see `canTote`.)
        if (this.input.pressed("KeyG") && !this.bag.worn) {
          const p = this.player.pos;
          if (Math.hypot(this.bag.pos.x - p.x, this.bag.pos.z - p.z) < 1.6) this.toggleWear();
        }
        inp.skill1Pressed = false;
        inp.skill2Pressed = false;
        inp.skill3Pressed = false;
        inp.ultPressed = false;
        this.eTap = 0;
        this.grabTap = 0;
      } else if (this.ride) {
        // ---- RIDING THE BOARD (session 200) ---------------------------------------------------
        // While the feet are on a deck the gear has exactly ONE thing to say: `E` steps off (the
        // brief's own key, the same one that stepped on). Everything else on the right hand and the
        // left belongs to the BOARD — M1 is the trick, M2 is the manual, SPACE is the ollie, SHIFT
        // is the powerslide and F is the bomb — and all five are read by the body's own ride tick
        // (see player/board.js), which claims them there. So this branch touches nothing but `E`:
        // no chord, no pickup, no grab, no shoot, and the skills stand down (there is nothing in the
        // hands to throw and nothing under the feet to throw it from).
        if (inp.interactPressed) {
          inp.interactPressed = false;
          this.dismountBoard();
        }
        inp.skill1Pressed = false;
        inp.skill2Pressed = false;
        inp.skill3Pressed = false;
        inp.ultPressed = false;
        this.eTap = 0;
        this.grabTap = 0;
      } else {
        // M1 WITH THE BALL AT HIS FEET IS A SHOOT (session 180 — the user's *"if i m1 while im
        // controlling the ball make me do a shoot"*). It is claimed HERE, before the body ever sees
        // the press (`gear.preFrame` runs before `player.update` — see `main.js`), so a shot
        // REPLACES the melee chain for that frame instead of firing alongside a punch. The ball has
        // to be genuinely under control for it to fire (see `ballUnderControl`), so a ball lying
        // across the street still leaves M1 as the chain — and only the ball's own def asks for this
        // (`control` — see `ITEM_DEFS`), so a duffel at the feet is still just a duffel.
        if (inp.kickPressed && !this.ballKind && this.ballUnderControl()) {
          inp.kickPressed = false;
          this.shootBegin(this.ballUnderControl());
        }
        if (inp.interactPressed) {
          inp.interactPressed = false;
          this.eTap = TOTE_CHORD;
        }
        if (inp.grabPressed) {
          // ...THE CHORD FIRST (E and the right button together is the lift into both arms), then
          // THE BALL — the one prop whose own button is this one (session 189, see `takeM2` and
          // `takeBallM2`), claimed here before the grab verb is ever offered the press. Anything
          // else: the window opens as it always has and the right button is the grab.
          if (this.eTap > 0 && this.canTote()) this.grabTap = TOTE_CHORD;
          else if (this.takeBallM2()) inp.grabPressed = false;
          else this.grabTap = TOTE_CHORD;
        }
        if (this.eTap > 0 && this.grabTap > 0 && this.canTote()) {
          this.eTap = 0;
          this.grabTap = 0;
          inp.grabPressed = false; // the gear takes it: this is a lift, not a grab
          this.takeInHands();
        } else if (this.eTap > 0) {
          this.eTap -= dt;
          if (this.eTap <= 0) this.interact();
        }
        if (this.grabTap > 0) this.grabTap -= dt;
        // ...and G works out in the world too, if you are standing on the bag — the editor is not
        // the only way to shoulder it. From the ARMS it is the same move: out of the hands and onto
        // the back.
        if (this.input.pressed("KeyG") && !this.bag.worn) {
          const p = this.player.pos;
          if (this.bag.tote || Math.hypot(this.bag.pos.x - p.x, this.bag.pos.z - p.z) < 1.6) this.toggleWear();
        }
      }
    }

    // ---- the TOTE's own clocks (see `takeInHands` / `throwFromHands`) ------------------------
    // Last in the frame, so a chord taken a line above starts its shape on t = 0 and not on the
    // first dt. The cradle's clock runs whenever it likes (the breath rides it), and a throw's keeps
    // running after the bag has LEFT the hands: the follow-through outlives the throw by a beat, and
    // it is the same shape easing back onto the cradle at the end of that beat.
    this.toteTime += dt;
    this.carryTime += dt;
    // ---- ...and THE BALL ACTION's own clock (session 180 — see `throwHands` / `tickShoot`) --------
    // The same bargain the tote's clock keeps: the shape runs on its own seconds, the RELEASE is a
    // key INSIDE it and not the press (so the ball leaves on the frame the arm has come over or the
    // boot has come through — `THROW_RELEASE`, published by the shape), and the phase
    // `poseBallAction` reads is clamped at 1 on the last beat so the layer can fade out ON the
    // follow-through instead of snapping back to the wind-up. `ballRelease = Infinity` is the latch
    // that makes the release a ONE-SHOT: whatever happens after it (a hand already emptied, a ball
    // already gone) can never fire it twice.
    //
    // THE SHOOT IS THE ODD ONE (session 198): it is the only shape a player can HOLD, so it keeps its
    // own clock (`tickShoot`, below) — the wind-up runs to the shape's COCK beat and then STANDS
    // there while the power fills, which is not something `ballT`/`ballDur` can say. The throw and
    // the slam are unchanged and still run out of the block below.
    if (this.ballKind === "shoot") {
      this.tickShoot(dt, inp);
    } else if (this.ballKind) {
      this.ballT += dt;
      this.ballPhase = Math.min(1, this.ballT / Math.max(1e-3, this.ballDur));
      if (this.ballT >= this.ballRelease) {
        const kind = this.ballKind;
        this.ballRelease = Infinity;
        if (kind === "throw") this.releaseHandThrow();
        else if (kind === "slam") this.releaseHandSlam();
      }
      if (this.ballT >= this.ballDur) {
        this.ballKind = null;
        this.ballPhase = 1;
        this.ballShot = null;
      }
    }
    if (this.toteKind !== "hold") {
      this.toteT += dt;
      // ...and the SHAPE lets go of the bag on its own key, not on the press (see `throwFromHands`).
      if (this.pendingThrow && this.toteT >= this.releaseAt) {
        const kind = this.pendingThrow;
        this.pendingThrow = null;
        this.releaseBag(kind);
      }
      if (this.toteT >= this.toteDur) {
        this.toteKind = "hold";
        this.toteT = 0;
        this.toteDur = 0;
        this.pendingThrow = null;
      }
    }
    this.publishTote();
    this.publishCarry(dt);
  }

  // ---- E ---------------------------------------------------------------------------------
  interact() {
    // ...and while the feet are ON a board, E is the way OFF it (session 200 — the same key that got
    // him on it). It is claimed a step earlier than this in `preFrame`'s riding branch, so this is
    // the belt-and-braces door for any other caller.
    if (this.ride) {
      this.dismountBoard();
      return;
    }
    // ...and while the duffel is in his arms, E is the gentlest way out of them (see `putDownBag`):
    // it is set down in front of him rather than thrown.
    if (this.bag.tote) {
      this.putDownBag();
      return;
    }
    // ...AND A LOOSE BOARD IS STEPPED ONTO (session 200 — the brief's *"make able to get on it by
    // pressing E"*). It is asked FIRST, ahead of every other thing E can mean, because a board is the
    // one prop this verb belongs to: the hand takes a board with the RIGHT button (`takeM2`, exactly
    // as the ball is), which is what leaves E free to be RIDE. Everything below is the ordinary
    // prop-and-duffel question, untouched.
    const board = this.boardInReach();
    if (board) {
      this.mountBoard(board);
      return;
    }
    const p = this.player.pos;
    const bagD = Math.hypot(this.bag.pos.x - p.x, this.bag.pos.z - p.z);
    // WHICHEVER IS NEARER WINS (session 178, for the ball). The duffel used to have first refusal on
    // `E` from anywhere inside 2.8 units, which was fine while a pocket's contents were the only other
    // thing E could mean — and wrong the moment a ball is lying at the spawn two metres from the bag,
    // because then E means "pick the ball up" when you are ON the ball and "open the bag" when you are
    // on the bag. The two are told apart by distance now, and the bag keeps the tie.
    //
    // SESSION 189 took the ball back OUT of this question: the ball is taken with the RIGHT BUTTON
    // (see `takeM2` and `takeBallM2`), so a ball is not a candidate for `E` at all — which is exactly
    // the user's *"make me when i press E on it it does nothing"*. E on a ball is a NO-OP: no pickup,
    // no sound, nothing. Everything else E ever meant (a key, the duffel's board) is untouched.
    let best = null;
    let bestD = 2.6;
    for (const d of this.drops) {
      if ((ITEM_DEFS[d.item.kind] || {}).takeM2) continue;
      const dd = Math.hypot(d.pos.x - p.x, d.pos.z - p.z);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    const bagHere = !this.bag.worn && bagD < 2.8;
    if (bagHere && (!best || bagD <= bestD)) {
      this.bagOpen = true;
      this.openEditor("bag");
      return;
    }
    if (best) this.pickup(best);
  }

  pickup(d) {
    // THE HANDS COME FIRST (session 179 — see "THE HANDS"). Picking a thing up off the deck is
    // picking it UP: it goes into the hand that picked it up, and it is only when that hand is
    // already full that the pockets (and then the bag) are asked. Before this, `E` was a teleport
    // into a pocket — the user's *"if i try to pick up with my hands i pick it in my hands
    // normally"*. `takeToHands` reuses the dropped prop's own mesh, so what lands in his hand is
    // the thing that was lying there, bruise and all.
    if (!this.hands) {
      this.takeToHands(d.item, null, d);
      return;
    }
    const c = this.storeInPockets(d.item);
    if (!c) {
      if (this.sfx && this.sfx.whiff) this.sfx.whiff();
      return;
    }
    this.scene.remove(d.mesh);
    this.drops.splice(this.drops.indexOf(d), 1);
    if (this.sfx && this.sfx.squeeze) this.sfx.squeeze();
    if (this.editorOpen) this.render();
  }

  // M2, EMPTY-HANDED, IN REACH OF A BALL: take it up into the hand (session 189 — the user's *"make
  // me grab the ball from m2 instead of E"*, see `takeM2` on the ball's def). The ONE prop that asks
  // for the right button instead of `E`; keys and everything else are untouched. The door it goes
  // through is the same one E used (`takeToHands`), so the mesh that lands in his hand is the ball
  // that was lying there. Answers whether it took anything, so the caller knows whether the press is
  // still the grab's (or the duffel's chord — the caller asks about the chord first).
  takeBallM2() {
    if (this.hands) return false;
    // ...and not out from under a live shoot (session 198): the shape owns the ball for the length
    // of the swing (it is `ballShot`, and the release reads it), so a hand closing on it mid-wind-up
    // would leave the boot swinging at the prop it had just picked up.
    if (this.ballKind) return false;
    const pl = this.player;
    for (const dr of this.drops) {
      const def = ITEM_DEFS[dr.item.kind];
      if (!def || !def.takeM2 || dr.item.broken) continue;
      if (Math.hypot(dr.pos.x - pl.pos.x, dr.pos.z - pl.pos.z) > BALL_TAKE_R) continue;
      return this.takeToHands(dr.item, null, dr);
    }
    return false;
  }

  // ==========================================================================================
  // THE SKATEBOARD, PART TWO: THE MOUNT AND THE DISMOUNT (session 200)
  // ==========================================================================================
  //
  // The brief's own words for getting on it are *"make able to get on it by pressing E"*, so `E` on a
  // loose board is the MOUNT and the hand takes a board with `M2` (the ball's own bargain, one verb
  // over — see `takeM2`). The three things these two methods do, and nothing else in the file ever
  // touches:
  //
  //   * PARENT THE MESH INTO THE RIG (`player.tiltG`, at exactly `-HY` — the body's own deck plane).
  //     From that frame on the board IS the rig's deck: the facing, the ground's lean and the body's
  //     own height all move it for free, and the only thing left for the riding code to write is the
  //     board's own turn (the carve's tilt and the trick's spin — see `solveRidePose` in
  //     player/board.js). No per-frame solve keeps them together, because they are one object.
  //   * HAND THE BODY ITS HEIGHT (`-(box.min.y)` — the deck's top face to the wheel line, measured off
  //     the mesh the board is drawn with). The rig is then RAISED by it while riding (see
  //     `BOARD_LIFT` in player/config.js), which is what puts the wheels on the road and the shoes on
  //     the deck.
  //   * GIVE THE DROP BACK when the feet come off, at the world place and the world angle it had on
  //     the frame it left, carrying the speed it was going. A dismount at speed is a board rolling
  //     away on its own, which is the honest read of stepping off one.
  //
  // `this.ride` is the DROP and `player.board` is the body's half; both are written here and cleared
  // here, and the drop is taken OUT of `this.drops` for the whole of a ride (so the world's prop
  // physics, the boot, the wall and the pickup cannot touch it — a ridden board is not a loose prop,
  // it is the floor).
  mountBoard(dr) {
    if (this.ride || !dr || dr.item.broken) return false;
    const pl = this.player;
    const i = this.drops.indexOf(dr);
    if (i >= 0) this.drops.splice(i, 1);
    const mesh = dr.mesh;
    const box = mesh.userData.box || propBoxOf(mesh);
    const deck = Math.max(0, -(box.cy - box.hy));
    mesh.position.set(0, -P.HY, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.updateMatrix();
    pl.tiltG.add(mesh);
    dr.vel.set(0, 0, 0);
    dr.ang.set(0, 0, 0);
    dr.ridden = true;
    this.ride = dr;
    // ...and the body's own half (see `startRide` in player/board.js): the lift, the mesh it may
    // turn, and the drop that tells it what it is on.
    pl.board = dr;
    pl.boardRig = mesh;
    pl.boardDeck = deck;
    pl.startRide();
    return true;
  }

  // STEP OFF. `walk` is the share of the board's speed the BODY keeps (see `BOARD_DISMOUNT_V`); the
  // board keeps what it had, so a dismount at speed is a board rolling on and a body walking away.
  dismountBoard(walk = 1) {
    const dr = this.ride;
    if (!dr) return false;
    const pl = this.player;
    const mesh = dr.mesh;
    mesh.updateWorldMatrix(true, false);
    mesh.getWorldPosition(_rideV);
    mesh.getWorldQuaternion(_rideQ);
    this.scene.add(mesh);
    mesh.position.copy(_rideV);
    mesh.quaternion.copy(_rideQ);
    dr.pos.copy(_rideV);
    dr.quat.copy(_rideQ);
    // ...and its own velocity off the body's, so a rolling dismount hands the board the line the two
    // of them were travelling on — the body keeps `walk` of it (the player's own half does that).
    dr.vel.set(pl.vel.x, 0, pl.vel.z);
    dr.ang.set(0, 0, 0);
    dr.ridden = false;
    dr.impactCd = 0.2;
    this.ride = null;
    this.drops.push(dr);
    pl.board = null;
    pl.boardRig = null;
    pl.endRide();
    return true;
  }

  // The loose board `E` would step onto, or null. Nearest wins, and it has to be near enough and not
  // be a wreck (see `interact`).
  boardInReach() {
    if (this.ride) return null;
    const p = this.player.pos;
    let best = null;
    let bestD = P.BOARD_MOUNT_R;
    for (const d of this.drops) {
      if (d.item.kind !== "board" || d.item.broken) continue;
      const dd = Math.hypot(d.pos.x - p.x, d.pos.z - p.z);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    return best;
  }


  // TAKE IT UP: the ONE door into the carried slot. Three callers come through here — the world's
  // `pickup` (a prop off the deck, already drawn as `drop`), a double-click on a tile in the editor
  // (the item out of a holder, `from`), and the quick menu's "take". The mesh is REUSED off the
  // drop when there is one (the prop you were looking at is the prop in your hand, wearing the same
  // bruise) and built fresh otherwise.
  takeToHands(item, from, drop) {
    if (!item || this.hands) return false;
    let mesh;
    if (drop) {
      mesh = drop.mesh;
      const i = this.drops.indexOf(drop);
      if (i >= 0) this.drops.splice(i, 1);
    } else {
      mesh = propMeshFor(item.kind);
      applyPropDamage(mesh, propDamageK(item), item.broken);
    }
    let place0 = null;
    if (from) {
      const p = from.items.find((q) => q.item === item);
      if (p) {
        place0 = p;
        from.items.splice(from.items.indexOf(p), 1);
      }
    }
    // A press or a drag still holding the placement we just pulled out of its holder would be
    // pointing at a thing that is no longer in a board (`onDragUp` would then splice index -1) —
    // so the gesture is dropped with it.
    if (place0) this.forgetPlace(place0);
    mesh.rotation.set(0, 0, 0);
    // ...and HOW FAR OFF THE HAND IT HANGS. `CARRY_OFF` is the direction and the proportions; the
    // LENGTH is the item's own support height, because "in the hand" means the hand is on the
    // thing — a 0.24-radius ball wants the palm a hand's width out on its shoulder, and a key wants
    // to sit in the palm. `0.7` of the support puts the hand just inside the item's surface for a
    // round thing and right on it for a flat one.
    const def = ITEM_DEFS[item.kind] || {};
    // The item's own support height, in world units. It comes off the box the mesh was BUILT with
    // (`propMeshFor` stashes it on `userData.box` while the mesh is still at the origin) rather than
    // off `propBoxOf` here: a drop's mesh is already standing somewhere in the world with its own
    // rotation, and `Box3.setFromObject` answers in WORLD space, so measuring it now would read the
    // prop's position as part of its shape. The stashed box is the local one by construction.
    const box = mesh.userData.box || propBoxOf(mesh);
    const sup = def.round ? item.radius : boxUpright(box);
    const scale = (this.player.charMesh && this.player.charMesh.scale.x) || 1;
    const len = (sup / scale) * 0.7;
    const n = Math.hypot(CARRY_OFF.x, CARRY_OFF.y, CARRY_OFF.z) || 1;
    const off = { x: (CARRY_OFF.x / n) * len, y: (CARRY_OFF.y / n) * len, z: (CARRY_OFF.z / n) * len };
    this.hands = { item, mesh, off };
    if (this.sfx && this.sfx.squeeze) this.sfx.squeeze();
    if (this.editorOpen) this.render();
    return true;
  }

  // ...and OUT of it, with no prop on the deck: the one thing every other path needs.
  clearHands() {
    const h = this.hands;
    if (!h) return null;
    this.hands = null;
    if (h.mesh) h.mesh.removeFromParent();
    return h.item;
  }

  // E, with a hand full: set it down on the deck in front of you. The gentle placement the duffel
  // gets (`putDownBag`) rather than a throw — and it lands as an ordinary prop, so the boot, the
  // roll and the pickup all already know it. It RETURNS the drop it made (session 200 — the board
  // needs it: `E` with a BOARD in your hands sets it down and steps straight onto it, which is one
  // press and one drop, see the `hands` branch of `preFrame`).
  putDownHands() {
    const h = this.hands;
    if (!h) return null;
    const p = this.player.pos;
    const fx = Math.sin(this.player.facing);
    const fz = Math.cos(this.player.facing);
    const item = h.item;
    h.mesh.removeFromParent();
    this.hands = null;
    const dr = this.dropAt(item, p.x + fx * CARRY_DROP_FWD, p.z + fz * CARRY_DROP_FWD);
    if (this.sfx && this.sfx.squeezeOut) this.sfx.squeezeOut();
    if (this.editorOpen) this.render();
    return dr || null;
  }

  // M1, with a hand full: THE THROW (the user's *"add a better ball throw animation"*, session 183 —
  // the shape itself is the `THROW` table in streetwear.js, authored as beats). It used to be the
  // same forward punt a pocket's contents get, which was fine while a prop in one hand was all E ever
  // put there, and then the keeper's own drop kick (session 180); a drop kick is a PUNT, so the ball
  // used to leave the hand while the arm was still at the hip. Now it is an overhand throw and the
  // ball leaves the HAND on the shape's own release BEAT rather than on the press. So this only ARMS
  // the shape; `releaseHandThrow` (fired by the clock in `preFrame`) is what actually lets go of it.
  //
  // A thing that is not a ball is thrown the same way, and that is on purpose: there is one shape for
  // "this leaves my hand", and nothing here tests for a ball — the same trade `putDownHands` makes
  // with the duffel's own placement.
  throwHands() {
    const h = this.hands;
    if (!h || this.ballKind) return false;
    this.ballKind = "throw";
    this.ballT = 0;
    this.ballDur = THROW_DURATION;
    this.ballPhase = 0;
    this.ballShot = null;
    this.ballRelease = THROW_DURATION * this.ballReleaseOf("throw");
    if (this.sfx && this.sfx.swing) this.sfx.swing(0);
    return true;
  }

  // M2, WITH THE BALL IN HIS HAND: THE SLAM (session 189 — the user's *"make me able to slam it and
  // it spins like how we did for the bag"*). It is `throwHands`' own shape-arming one shape over —
  // the ball is not touched here either, and `releaseHandSlam` (fired by the same clock in `preFrame`)
  // is what drives it into the deck. Only the ball asks for this button (see `takeM2`).
  slamHands() {
    const h = this.hands;
    if (!h || this.ballKind) return false;
    this.ballKind = "slam";
    this.ballT = 0;
    this.ballDur = SLAM_DURATION;
    this.ballPhase = 0;
    this.ballShot = null;
    this.ballRelease = SLAM_DURATION * this.ballReleaseOf("slam");
    if (this.sfx && this.sfx.swing) this.sfx.swing(1);
    return true;
  }

  // ...and THE LET-GO, on the shape's own release beat. The ball leaves the HAND — the same bone the
  // gear pinned it to (`syncCarry`) — read in the world on this frame, so it departs from exactly
  // where the arm was drawn rather than from a formula that agrees with it; and it leaves along the
  // body's own facing, because a throw is aimed by the body and the body is the thing facing.
  releaseHandThrow() {
    const h = this.hands;
    if (!h) return false;
    const pl = this.player;
    const item = h.item;
    const mesh = h.mesh;
    const bones = pl.charMesh && pl.charMesh.userData && pl.charMesh.userData.bones;
    if (bones && bones.handL) bones.handL.getWorldPosition(_handW);
    else {
      const fx0 = Math.sin(pl.facing), fz0 = Math.cos(pl.facing);
      _handW.set(pl.pos.x + fx0 * 0.5, pl.pos.y + 1.0, pl.pos.z + fz0 * 0.5);
    }
    this.hands = null;
    mesh.removeFromParent();
    // ...and it goes back OUT at 1: `syncCarry` counter-scaled it into the rig, and a prop on the
    // deck has to be drawn at the size it was built.
    mesh.scale.setScalar(mesh.userData.baseScale || 1);
    const fx = Math.sin(pl.facing), fz = Math.cos(pl.facing);
    const dr = this.makeDrop(item, _handW.x, _handW.y, _handW.z, fx * BALL_THROW_V, BALL_THROW_UP, fz * BALL_THROW_V, 0, mesh);
    this.spinFrom(dr, 0.55);
    if (this.sfx && this.sfx.squeezeOut) this.sfx.squeezeOut();
    if (this.editorOpen) this.render();
    return true;
  }

  // ...and THE BALL'S OWN SLAM RELEASE (session 189 — see `slamHands`): the same kind of moment as
  // the throw's, spending the SAME bag of numbers the DUFFEL's slam spends (see `releaseBag`'s
  // "slam" branch). That is deliberate: it is one slam, made of one set of constants, thrown by two
  // different piles of geometry — the ball's own surface (see its def) is the only thing that
  // differs, so a slammed ball skips and rolls where a slammed duffel tumbles and flops.
  releaseHandSlam() {
    const h = this.hands;
    if (!h) return false;
    const pl = this.player;
    const item = h.item;
    const mesh = h.mesh;
    const bones = pl.charMesh && pl.charMesh.userData && pl.charMesh.userData.bones;
    if (bones && bones.handL) bones.handL.getWorldPosition(_handW);
    else {
      const fx0 = Math.sin(pl.facing), fz0 = Math.cos(pl.facing);
      _handW.set(pl.pos.x + fx0 * 0.5, pl.pos.y + 1.0, pl.pos.z + fz0 * 0.5);
    }
    this.hands = null;
    mesh.removeFromParent();
    // ...back OUT at 1: `syncCarry` counter-scaled it into the rig (see `releaseHandThrow`).
    mesh.scale.setScalar(mesh.userData.baseScale || 1);
    const fx = Math.sin(pl.facing), fz = Math.cos(pl.facing);
    // OUT OF THE HAND AND AT THE DECK: it leaves where the arm was drawn (the shape's own release
    // beat puts it low and forward — see `BALL_SLAM`) and takes the SLAM's drive, not a throw's.
    const dr = this.makeDrop(item, _handW.x, _handW.y + 0.06, _handW.z, fx * SLAM_V, SLAM_DOWN, fz * SLAM_V, 0, mesh);
    // ...TURNING ABOUT ITS SIDE AXIS, with nothing at all about the vertical (session 187 — see
    // `SLAM_SPIN`): `ang` is SET rather than added to, so the whole of the rate is on `up x forward`
    // and a ball leaves the hand ROLLING forward rather than spinning on the spot like a top.
    dr.ang.set(fz * SLAM_SPIN, 0, -fx * SLAM_SPIN);
    // ...plus the no-slip roll the drive itself would give it (see `spinFrom` — the same axis, so
    // the two read as one turn).
    this.spinFrom(dr, 0.5);
    // ...AND IT COMES OFF THE DECK LIVE (see "THE HOT BAG" / `liveStep`): the one-shot leap the first
    // deck contact spends, the hot window, and NOT armed — nothing it does until it is struck is
    // drawn anywhere, which is the user's own rule for the bag (*"it doesnt home attack to the enemy
    // until i hit it or the enemy hits [it]"*).
    dr.leap = true;
    dr.armed = false;
    dr.hot = HOT_T;
    dr.hotCd = 0;
    const g = this.groundAt(dr.pos.x, dr.pos.z, dr.pos.y);
    if (this.effects) {
      this.effects.puff(dr.pos.x, g + 0.1, dr.pos.z, 1.8, [0.85, 0.72, 0.5], 0.32);
      this.effects.heatPuff(dr.pos.x, dr.pos.y, dr.pos.z, 0.9, [1, 0.82, 0.45]);
    }
    if (this.sfx && this.sfx.squeezeOut) this.sfx.squeezeOut();
    if (this.sfx && this.sfx.land) this.sfx.land(0.8);
    if (this.rig) this.rig.shake = Math.max(this.rig.shake, 0.35);
    if (this.editorOpen) this.render();
    return true;
  }

  // =============================================================================================
  // THE SHOOT (session 180 — see the block at the head of the file). M1 with the ball at his feet.
  // =============================================================================================

  // The shape's own RELEASE beats, read off the rig (`poseCfg.BALL`, written by streetwear.js
  // straight from the shapes — `THROW_RELEASE` and `BALL_SLAM_RELEASE` are beats of the two authored
  // tables). The two fallbacks are the same numbers and are only ever spent on the opening frames of
  // a load, before a rig exists; the point of reading the rig is that there is ONE copy of them, the
  // shape's.
  ballReleaseOf(kind) {
    const ud = this.player && this.player.charMesh && this.player.charMesh.userData;
    const B = ud && ud.poseCfg && ud.poseCfg.BALL;
    if (B) return kind === "throw" ? B.THROW_RELEASE : B.SLAM_RELEASE;
    return kind === "throw" ? 0.60 : 0.56;
  }

  // ...and THE SHOOT's own two (session 198), out of the same place. `cock` is the beat the wind-up
  // is fully wound TO — where a held charge sits — and `release` where the boot is through the ball.
  // They are the SHAPE's numbers (streetwear.js's `SHOOT` object), which is what lets a table
  // retuned against a real contact measurement move the gear's own release with it.
  shootShape() {
    const ud = this.player && this.player.charMesh && this.player.charMesh.userData;
    const S = ud && ud.poseCfg && ud.poseCfg.BALL && ud.poseCfg.BALL.SHOOT;
    return S || NO_SHOOT;
  }

  // IS THE BALL HIS? The one question both the shoot and the control assist ask (see
  // `BALL_TOUCH_*`). It answers with the drop when he is ON it — inside `BALL_TOUCH_R`, near the
  // deck, and not already flying — and with null otherwise, so a ball hurtling away from a shot or
  // lying across the street is nobody's. A ball in the HANDS is not this: that is `this.hands`, and
  // its move is the throw.
  ballUnderControl() {
    const pl = this.player;
    if (!pl) return null;
    for (const dr of this.drops) {
      const def = ITEM_DEFS[dr.item.kind];
      if (!def || !def.control || dr.item.broken) continue;
      if (Math.hypot(dr.pos.x - pl.pos.x, dr.pos.z - pl.pos.z) > BALL_TOUCH_R) continue;
      if (Math.hypot(dr.vel.x, dr.vel.z) > BALL_TOUCH_MAXV) continue;
      const deck = this.groundAt(dr.pos.x, dr.pos.z, 2.5) + dr.item.radius;
      if (dr.pos.y > deck + BALL_TOUCH_GROUND) continue;
      return dr;
    }
    return null;
  }

  // ...and IS THE BALL HE LOCKED ONTO STILL THERE TO BE STRUCK? The release's own gate, and a
  // different question from the one above: the assist's radius is a first touch's (a boot-and-shin
  // reach) and a swing carries further than that, so the ask is not "is it under control" but "is
  // it still a loose ball inside a swing of him". Still in `this.drops` is the whole of the first
  // half — taking it into the hands (`takeToHands`), shattering it and a respawn all splice it out.
  ballInSwing(dr) {
    if (!dr || dr.item.broken) return false;
    if (!this.drops.includes(dr)) return false;
    const pl = this.player;
    return Math.hypot(dr.pos.x - pl.pos.x, dr.pos.z - pl.pos.z) <= BALL_STRIKE_R;
  }

  // HOW MUCH OF THE LOWER HALF THE SHAPE OWNS, for the speed the body is at RIGHT NOW — 1 standing,
  // 0 at a run, a ramp across `SHOOT_LEG_STILL`..`SHOOT_LEG_RUN` between them (see `ballLower` and
  // `poseShoot`'s `lower`). It is asked twice: once by `shootBegin` for the frame the wind-up starts
  // on (so a charge begun at a sprint never wears the plant for even one frame) and once a frame by
  // `tickShoot` while the wind-up is live.
  legWeight() {
    const pl = this.player;
    const spd = pl ? Math.hypot(pl.vel.x, pl.vel.z) : 0;
    const k = (spd - SHOOT_LEG_STILL) / (SHOOT_LEG_RUN - SHOOT_LEG_STILL);
    return 1 - (k < 0 ? 0 : k > 1 ? 1 : k);
  }

  // M1 WITH THE BALL AT HIS FEET: THE WIND-UP (session 198 — the user's *"make shooting the ball
  // chargeable"*). The press used to fire the strike outright (session 180); now it only WOUNDS IT
  // UP. The shape goes to its COCK beat and WAITS there (see `tickShoot`), the power fills while it
  // does, and THE STRIKE IS THE BUTTON COMING UP — so the ball leaves on the release, which is what
  // puts a tapped pass and a full-charge screamer on one button with no mode and no menu.
  shootBegin(dr) {
    if (!dr || this.ballKind) return false;
    this.ballKind = "shoot";
    this.ballT = 0;
    this.ballDur = 0;        // the shoot's clock is hand-driven — see `tickShoot`
    this.ballPhase = 0;
    this.ballShot = dr;
    this.ballRelease = Infinity;
    this.ballWindT = 0;
    this.ballCharge = 0;
    this.ballPower = 0;
    this.ballFired = false;
    this.ballCharging = true;
    this.ballStriking = false;
    this.ballUnwinding = false;
    this.ballLower = this.legWeight();
    if (this.sfx && this.sfx.swing) this.sfx.swing(1);
    return true;
  }

  // ...and THE SHOOT'S OWN CLOCK (see the call in `preFrame`). Three phases, and `ballPhase` is the
  // shape's own position in 0..1 through all of them:
  //   WIND-UP  the phase runs to the shape's COCK beat over `SHOOT_WINDUP` — its own seconds, so the
  //            wind-up reads the same however tight the tap — and `ballCharge` fills on
  //            `SHOOT_CHARGE_T` while it waits. The button coming up IS the release.
  //   CANCEL   the ball has got away from him: the phase walks home at `SHOOT_UNWIND_RATE` and the
  //            shape is done when it gets there. Nothing is struck, and because the table's first row
  //            and its last are the same pose, the layer's own fade-out has nothing to cover.
  //   STRIKE   the phase runs on to 1 at `ballStrikeRate` — set BY the release, so the swing is
  //            always `SHOOT_SWING_*` long from the moment the button came up, whatever phase it had
  //            reached — and the ball goes on the shape's own RELEASE beat.
  tickShoot(dt, inp) {
    this.ballT += dt;   // the shape's running seconds: what the charge's own tremble reads
    const S = this.shootShape();
    // THE LOWER HALF'S OWN WEIGHT (see `legWeight` / `SHOOT_LEG_*` / `poseShoot`): a wind-up taken at
    // a run hands the hips and both legs back to the run, and the strike takes them back. Asymmetric
    // on purpose — the plant dissolves into a stride, and the whip cannot wait for its leg.
    const want = this.ballCharging ? this.legWeight() : 1;
    this.ballLower = approach(this.ballLower, want, dt / (want > this.ballLower ? SHOOT_LEG_TAKE : SHOOT_LEG_GIVE));
    if (this.ballUnwinding) {
      this.ballPhase = Math.max(0, this.ballPhase - dt * SHOOT_UNWIND_RATE);
      if (this.ballPhase <= 0.0001) {
        this.ballPhase = 0;
        this.ballKind = null;
        this.ballUnwinding = false;
        this.ballShot = null;
      }
      return;
    }
    if (this.ballCharging) {
      this.ballWindT += dt;
      const w = Math.min(1, this.ballWindT / SHOOT_WINDUP);
      this.ballPhase = S.cock * w * w * (3 - 2 * w);
      this.ballCharge = Math.min(1, this.ballWindT / SHOOT_CHARGE_T);
      if (!inp || !inp.kickHeld) this.releaseShoot(S);
      else if (!this.ballUnderControl()) {
        // ...AND A BALL THAT HAS GOT AWAY TAKES THE SHOT WITH IT. The assist holds it closer while
        // a wind-up is live (see `BALL_TOUCH_AHEAD_CHARGE`), so this only fires when he has
        // genuinely left it: a slide, a jump onto something, a body shoving him off it.
        this.ballCharging = false;
        this.ballUnwinding = true;
        this.ballShot = null;
        this.ballCharge = 0;
      }
      return;
    }
    this.ballPhase += dt * this.ballStrikeRate;
    if (!this.ballFired && this.ballPhase >= S.release) {
      this.ballFired = true;
      if (this.ballShot) this.shootLaunch(this.ballShot, this.ballPower);
    }
    if (this.ballPhase >= 1) {
      this.ballPhase = 1;
      this.ballKind = null;
      this.ballStriking = false;
      this.ballShot = null;
    }
  }

  // THE BUTTON COMING UP: it freezes the power, decides how long the swing takes, and checks the
  // ball is still there to be hit. The last of those is the honest one — a swing at a ball that has
  // rolled away is a WHIFF, and it plays out as one (the shape goes through with nothing under it)
  // rather than dragging a ball in from across the street to meet the boot.
  releaseShoot(S) {
    this.ballCharging = false;
    this.ballStriking = true;
    this.ballFired = false;
    this.ballPower = this.powerOf(this.ballCharge);
    const swingT = SHOOT_SWING_MAX - (SHOOT_SWING_MAX - SHOOT_SWING_MIN) * this.ballPower;
    this.ballStrikeRate = (1 - this.ballPhase) / Math.max(1e-3, swingT);
    if (this.ballShot && !this.ballInSwing(this.ballShot)) this.ballShot = null;
  }

  // WHAT THE HOLD WAS WORTH, 0..1. A tap is not worth NOTHING — it is a pass, and a pass is a real
  // ball — so the band starts at `SHOOT_POW_MIN` and the curve over the hold is the same smoothstep
  // everything else here uses, which makes the last of the charge the expensive part: a 0.1 s tap
  // lands at 0.16 of the band, a 0.4 s hold at 0.60, a full one at 1.
  powerOf(charge) {
    const c = charge > 1 ? 1 : charge < 0 ? 0 : (charge || 0);
    return SHOOT_POW_MIN + (1 - SHOOT_POW_MIN) * c * c * (3 - 2 * c);
  }

  // ...and the strike itself. The ball is PUT where the boot is coming through — a struck ball is
  // struck off the boot's own line, and the control has been keeping it near enough that the put is
  // a nudge and not a teleport — and then sent along the facing at the power's own speed and loft.
  // It leaves the control on that frame: even a tapped shot is over `BALL_TOUCH_MAXV`, so the assist
  // lets go of it immediately, which is the whole reason a shot is not caught again.
  shootLaunch(dr, power) {
    const pl = this.player;
    const p = power > 1 ? 1 : power < 0 ? 0 : (power || 0);
    const v = SHOOT_V_MIN + (SHOOT_V_MAX - SHOOT_V_MIN) * p;
    const up = SHOOT_UP_MIN + (SHOOT_UP_MAX - SHOOT_UP_MIN) * p;
    const fx = Math.sin(pl.facing), fz = Math.cos(pl.facing);
    const tx = pl.pos.x + fx * SHOOT_AHEAD;
    const tz = pl.pos.z + fz * SHOOT_AHEAD;
    const g = this.groundAt(tx, tz, 2.5);
    dr.pos.set(tx, g + dr.item.radius, tz);
    dr.vel.set(fx * v, up, fz * v);
    dr.kickCd = KICK_CD;
    this.spinFrom(dr, 0.95);
    // ...and THE STRIKE'S OWN DUST: a booted ball takes a scuff of the deck away with it, thicker the
    // harder it was struck, and at the top of the band it shoves the camera — the same channel the
    // slam's release spends (see `releaseHandSlam`). A tap is a puff and nothing else; a full charge
    // is worth feeling, which is half of what a charge is FOR.
    if (this.effects) this.effects.puff(tx, g + 0.09, tz, 1.4 + 1.5 * p, [0.87, 0.85, 0.79], 0.28 + 0.26 * p);
    if (this.rig && p > 0.5) this.rig.shake = Math.max(this.rig.shake, (p - 0.5) * 0.8);
    if (this.sfx && this.sfx.ballKick) this.sfx.ballKick(0.55 + 0.45 * p);
    if (damageItem(dr.item, 6 + v * 0.25)) this.shatterDrop(dr);
    if (this.editorOpen) this.render();
  }

  // WHERE THE CARRIED MESH SITS: a child of the TORSO, pinned to the CARRIED HAND — the same
  // bargain the duffel makes in the arms (`totePoint`), one hand over. The trunk is the bone for
  // the reasons in the block at the head of the file (it rides every lean, slide and climb without
  // anything remembering it) and the HAND is the point because the carry pose (`poseCarry`) already
  // puts that hand exactly where the thing it carries belongs — so the two agree by construction,
  // through the pose's own fade and through whatever the legs are doing underneath. Runs every frame
  // (the body can be swapped under it with N), and re-parents and counter-scales the moment it is
  // not on the bone it thinks it is, exactly as `syncWear` does for the bag.
  syncCarry() {
    const h = this.hands;
    if (!h) return;
    const mesh = h.mesh;
    const pl = this.player;
    const cm = pl.charMesh;
    const bones = cm && cm.userData && cm.userData.bones;
    const bone = bones && bones.torso;
    if (!bone || !bones.handL) {
      // No rig yet (the opening frames of a load, or an imported body): carry it at the capsule's
      // own hip, the way the body will once it arrives.
      const fx = Math.sin(pl.facing);
      const fz = Math.cos(pl.facing);
      const lx = CARRY_OFF.x;
      const lz = CARRY_OFF.z;
      mesh.position.set(
        pl.pos.x + lx * fz - lz * fx,
        pl.pos.y + CARRY_OFF.y * (cm ? cm.scale.x : 1),
        pl.pos.z - lx * fx - lz * fz
      );
      mesh.rotation.set(0, pl.facing, 0);
      return;
    }
    if (mesh.parent !== bone) {
      mesh.scale.setScalar((mesh.userData.baseScale || 1) / (cm.scale.x || 1));
      bone.add(mesh);
    }
    bones.handL.getWorldPosition(_bagA);
    bone.worldToLocal(_bagA);
    const off = h.off || CARRY_OFF;
    mesh.position.set(_bagA.x + off.x, _bagA.y + off.y, _bagA.z + off.z);
    mesh.rotation.set(0, 0, 0);
  }

  // ---- the editor ------------------------------------------------------------------------
  openEditor(focus) {
    this.editorOpen = true;
    this.closeQuick();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (focus) this.focusKey = focus;
    if (!this.visibleCards().some((c) => c.key === this.focusKey)) this.focusKey = "left";
    this.input.setMouseFree(true);
    // The swirl starts from wherever the camera already is and takes the shortest way round to
    // the holder's side of the body.
    this.swirl = this.player.facing + Math.PI;
    this.roll = 0;
    this._lastFocus = null;
    // The stage has to be ON SCREEN before the first `render`: `measureTags` reads real rectangles
    // to know how wide a name is and how big the board is, and a `display: none` parent measures
    // every one of them as nothing.
    this.invEl.classList.remove("hidden");
    this.render();
    // The touch overlay goes away for the duration: the editor owns the whole frame (movement,
    // look and every skill is zeroed in `preFrame`), so the thumb pads would only sit under the
    // boards — and the drag is a pointer drag, not a paddle, so nothing is lost with them gone.
    if (this.gameEl) this.gameEl.classList.add("invOpen");
    if (this.sfx && this.sfx.ui) this.sfx.ui();
  }

  closeEditor() {
    this.editorOpen = false;
    this.bagOpen = false;
    // A drag or a selection does not survive the editor: the ghost belongs to a stage that is about
    // to be emptied, and the tile it left behind was hidden by the drag, so both are put back here
    // rather than left for a next opening to find.
    if (this.press) this.press.place.held = false;
    if (this.drag) {
      this.drag.place.held = false;
      if (this.drag.ghost) this.drag.ghost.remove();
      this.armTargets(false);
    }
    this.press = null;
    this.drag = null;
    this.sel = null;
    this.hoverTarget = null;
    // ...and a refusal has no business outliving the mode it was drawn in.
    this.clearDeny();
    this.invEl.classList.add("hidden");
    this.stageEl.innerHTML = "";
    if (this.gameEl) this.gameEl.classList.remove("invOpen");
    this.input.setMouseFree(false);
    this.updateHint();
  }

  // ---- the quick menu --------------------------------------------------------------------
  openQuick() {
    this.quickOpen = true;
    this.quickT = 1.0;
    this.renderQuick();
    this.quickEl.classList.remove("hidden");
    if (this.sfx && this.sfx.ui) this.sfx.ui();
  }

  closeQuick() {
    this.quickOpen = false;
    this.quickEl.classList.add("hidden");
  }

  // "Take" is the quick menu's whole verb: the item comes OUT of the pocket — and now (session 179)
  // into your HANDS, which is the slot this menu was always apologising for not having (the old note
  // here read *"since the game has no carried-item slot yet, out of your hands and onto the deck in
  // front of you"*). Only a full pair of hands falls back to dropping it on the deck as before.
  // Press 1 for the LEFT pocket, 2 for the RIGHT.
  takeQuick(i) {
    const c = this.pockets[i];
    if (!c) return;
    const p = c.items[0];
    if (!p) {
      if (this.sfx && this.sfx.whiff) this.sfx.whiff();
      return;
    }
    if (this.hands) {
      c.items.splice(0, 1);
      this.spawnDrop(p.item, 4.5, 2.5);
      if (this.sfx && this.sfx.squeezeOut) this.sfx.squeezeOut();
    } else {
      this.takeToHands(p.item, c);
    }
    this.renderQuick();
    this.closeQuick();
  }

  renderQuick() {
    for (let i = 0; i < 2; i++) {
      const el = document.getElementById("qcard" + i);
      if (!el) continue;
      const c = this.pockets[i];
      el.dataset.card = c.key;
      const grid = el.querySelector(".qgrid");
      grid.dataset.card = c.key;
      grid.style.gridTemplateColumns = "repeat(" + c.w + ", var(--cell))";
      grid.innerHTML = "";
      for (let n = 0; n < c.w * c.h; n++) {
        const cell = document.createElement("div");
        cell.className = "invCell";
        grid.appendChild(cell);
      }
      for (const p of c.items) grid.appendChild(this.itemEl(p, c, "quick"));
      // ...and the chip's own label: the quick menu's whole point is "what is in this pocket",
      // so it names the top item (the one a press would take) rather than repeating the holder.
      const nm = el.querySelector(".qname");
      if (nm) nm.textContent = c.items.length ? c.items[0].item.name : "EMPTY";
    }
    this.positionItems();
  }

  // ---- the bag as a thing you can wear, throw and break -----------------------------------

  // The hinge a worn bag hangs from, or null while the real rig has not arrived (the opening
  // frames wear the box that stands in for it). Read fresh every frame rather than cached: the
  // player can swap characters under it (`N`), and the new rig is a different tree.
  bagBone() {
    const cm = this.player && this.player.charMesh;
    const bones = cm && cm.userData && cm.userData.bones;
    return (bones && bones[BAG_WEAR.bone]) || null;
  }

  // WEAR IT / TAKE IT OFF, in one place. Every path that flips `worn` — the G prompt, a throw, the
  // bag breaking — is answered here on the next frame instead of each of them having to remember to
  // re-parent a mesh, and a character swap is answered the same way (the bone it is hanging from
  // stops being the one in the scene, so it is moved to the new one).
  syncWear() {
    const bag = this.bag;
    const mesh = bag.mesh;
    // THE BAG'S THIRD HOME. `tote` and `worn` are the same machinery with a different offset, so
    // they share this one function: both parent the mesh to the rig's torso hinge, both counter-
    // scale it, and both have to answer a swap between them (the bag is going from the hands to the
    // back or the other way round, and the bone it is already on is the bone it is going to). The
    // `mesh.userData.at` stamp is what tells the two apart on that swap — without it, the
    // `parent === bone` early-out below would leave a bag that had just been shouldered still
    // sitting in front of the chest.
    const holding = bag.tote;
    if (bag.worn || holding) {
      const cfg = holding ? BAG_TOTE : BAG_WEAR;
      const at = holding ? "tote" : "worn";
      const bone = this.bagBone();
      if (!bone) return;                       // no rig yet: `update` follows the capsule instead
      if (mesh.parent === bone && mesh.userData.at === at) {
        // Already on the rig: while it is being CARRIED, re-pin it to the arms every frame (the
        // shape may be driving them overhead, or running, or sliding — the bag goes where they go).
        if (holding) {
          this.totePoint(bone, _bagP);
          mesh.position.copy(_bagP);
          mesh.rotation.set(this.totePitch(), cfg.yaw, 0);
        }
        return;
      }
      const cm = this.player.charMesh;
      mesh.scale.setScalar((mesh.userData.baseScale || 1) / (cm.scale.x || 1));
      if (holding) this.totePoint(bone, _bagP);
      else _bagP.set(0, cfg.y, cfg.z);
      mesh.position.copy(_bagP);
      mesh.rotation.set(0, cfg.yaw, 0);
      bone.add(mesh);
      mesh.userData.at = at;
      return;
    }
    if (mesh.parent === this.scene) return;
    // OFF: leave the body wearing the ORIENTATION it had where it was, so putting it down or
    // throwing it does not snap it a quarter turn, and put it where the prop system thinks the bag
    // is. That orientation is the FULL quaternion now (see `stepSpin`) rather than a yaw — a bag
    // shouldered at a lean leaves the back at that same lean — and the physics owns it from here.
    const q = new THREE.Quaternion();
    mesh.getWorldQuaternion(q);
    this.scene.add(mesh);
    mesh.scale.setScalar(mesh.userData.baseScale || 1);
    mesh.position.copy(bag.pos);
    bag.quat.copy(q);
    _propAxis.set(0, 0, 1).applyQuaternion(bag.quat);
    bag.yaw = Math.atan2(_propAxis.x, _propAxis.z);
    mesh.quaternion.copy(bag.quat);
    mesh.userData.at = "";
  }

  toggleWear() {
    this.bag.tote = false;
    if (this.bag.worn) {
      this.bag.worn = false;
      const p = this.player.pos;
      const fx = Math.sin(this.player.facing);
      const fz = Math.cos(this.player.facing);
      this.bag.pos.set(p.x - fx * 0.7, p.y + 0.6, p.z - fz * 0.7);
      this.bag.vel.set(-fx * 2, 1.5, -fz * 2);
      // ...and it leaves the back TUMBLING (see `spinFrom`): a duffel taken off the shoulder and
      // dropped is spinning before it hits anything.
      this.spinFrom(this.bag, 0.45);
      if (this.sfx && this.sfx.squeezeOut) this.sfx.squeezeOut();
    } else {
      const p = this.player.pos;
      const d = Math.hypot(this.bag.pos.x - p.x, this.bag.pos.z - p.z);
      if (d > 3.2 || this.bag.broken) {
        if (this.sfx && this.sfx.whiff) this.sfx.whiff();
        return;
      }
      this.bag.worn = true;
      this.bag.vel.set(0, 0, 0);
      this.bag.ang.set(0, 0, 0);
      this.bag.spin = 0;
      this.bag.hot = 0;
      this.bag.armed = false;
      this.bag.leap = false;
      if (this.sfx && this.sfx.squeeze) this.sfx.squeeze();
    }
    this.tintBag();
    if (this.editorOpen) this.render();
  }

  // =========================================================================
  // THE TOTE — THE DUFFEL IN BOTH HANDS (see the block at the head of the file).
  //
  // Three verbs, and they are the two mouse buttons and E:
  //   E + M2  together   take it up into both arms (whichever of the two was pressed first)
  //   M1                 the plain forward throw — a prop thrown away, with a throw animation
  //   M2                 the SLAM: driven into the deck just ahead, where it comes off LIVE
  //   E                  set it gently down at your feet
  // =========================================================================

  // Can the duffel come up into the arms from where it is? Off the back: always. On the deck: only
  // from within reach, and only if it is not too far above or below (a bag on a roof is not a bag
  // at your feet). A broken bag is nobody's.
  canTote() {
    const bag = this.bag;
    if (!bag || bag.broken || bag.tote) return false;
    // ...and a pair of hands that is already carrying something cannot take the duffel as well (see
    // "THE HANDS"): one handful, and the duffel is a two-handful lift.
    if (this.hands) return false;
    if (bag.worn) return true;
    const p = this.player.pos;
    const d = Math.hypot(bag.pos.x - p.x, bag.pos.z - p.z);
    return d < TOTE_REACH && Math.abs(bag.pos.y - (p.y - 0.6)) < 2.2;
  }

  takeInHands() {
    const bag = this.bag;
    if (!bag || bag.broken) return false;
    bag.worn = false;
    bag.tote = true;
    bag.hot = 0;
    bag.armed = false;
    bag.leap = false;
    bag.vel.set(0, 0, 0);
    bag.ang.set(0, 0, 0);
    bag.spin = 0;
    // The bag's own board has no business being open under a bag you are holding.
    if (this.bagOpen) this.closeEditor();
    // ...and the arms come out of whatever the run was doing: the layer fades in over `TOTE_POSE_FADE`.
    this.toteKind = "hold";
    this.toteT = 0;
    this.toteDur = 0;
    this.pendingThrow = null;
    if (this.sfx && this.sfx.squeeze) this.sfx.squeeze();
    return true;
  }

  // E, while it is up there: set it down in front of him. The gentlest of the three ways out of the
  // arms, and the one that leaves the bag where it is (a plain prop on the deck, not live).
  putDownBag() {
    const bag = this.bag;
    if (!bag || !bag.tote) return;
    const p = this.player.pos;
    const fx = Math.sin(this.player.facing);
    const fz = Math.cos(this.player.facing);
    const x = p.x + fx * 0.85;
    const z = p.z + fz * 0.85;
    const g = this.groundAt(x, z, p.y);
    bag.tote = false;
    bag.hot = 0;
    bag.armed = false;
    bag.leap = false;
    bag.vel.set(0, 0, 0);
    bag.ang.set(0, 0, 0);
    bag.spin = 0;
    bag.pos.set(x, g + 0.06, z);
    bag.yaw = this.player.facing;
    this.toteKind = "hold";
    this.toteT = 0;
    this.toteDur = 0;
    this.pendingThrow = null;
    if (this.sfx && this.sfx.squeezeOut) this.sfx.squeezeOut();
    this.tintBag();
    if (this.editorOpen) this.render();
    return true;
  }

  // THE TWO THROWS. `kind` is "throw" (M1 — a plain forward throw: it goes up and away and lands
  // as an ordinary prop) or "slam" (M2 — it is driven straight DOWN into the deck just ahead of
  // him, and comes off it LIVE — see "THE HOT BAG" in the constants at the head of the file).
  //
  // It only STARTS the shape. The bag leaves the hands at the shape's own release key (`THROW_
  // RELEASE` / `SLAM_RELEASE`, read by the clock in `preFrame`), not on the frame of the press —
  // the wind-up is a wind-up, and a bag that flew out of a pair of arms that had not thrown it yet
  // is exactly the kind of pop the whole pose stack exists to prevent.
  throwFromHands(kind) {
    const bag = this.bag;
    if (!bag || !bag.tote) return false;
    // ...and one throw at a time: a press during the wind-up must not restart the shape.
    if (this.toteKind !== "hold") return false;
    this.toteKind = kind === "slam" ? "slam" : "throw";
    this.toteT = 0;
    this.toteDur = kind === "slam" ? SLAM_T : THROW_T;
    this.releaseAt = (kind === "slam" ? SLAM_RELEASE : THROW_RELEASE) * this.toteDur;
    this.pendingThrow = kind === "slam" ? "slam" : "throw";
    return true;
  }

  // ...and the frame the shape lets go of it. Everything here used to happen on the press.
  releaseBag(kind) {
    const bag = this.bag;
    if (!bag || !bag.tote) return false;
    const pl = this.player;
    const p = pl.pos;
    const fx = Math.sin(pl.facing);
    const fz = Math.cos(pl.facing);
    const x = p.x + fx * 0.7;
    const z = p.z + fz * 0.7;
    const g = this.groundAt(x, z, p.y);
    bag.tote = false;
    bag.hotCd = 0;
    if (kind === "slam") {
      // THROWN AT THE DECK, not away: it leaves the hands a little short of arm's length and a
      // little above his own knees, and everything after that is the big downward drive.
      bag.pos.set(p.x + fx * 1.05, Math.max(g + 0.65, p.y - 0.25), p.z + fz * 1.05);
      bag.vel.set(fx * SLAM_V, SLAM_DOWN, fz * SLAM_V);
      // ...TURNING ABOUT ITS SIDE AXIS on the way in (`up x forward`, the axis across the drive —
      // session 187, see `SLAM_SPIN`), and with its one LEAP still in hand: the deck throws it back
      // up the moment it lands (see `stepProp`). It is NOT armed — nothing it does until it is
      // struck is drawn anywhere, it just rattles around where it was slammed. `ang` is SET rather
      // than added to, so there is no vertical component at all: the slam's whole turn is the side
      // axis's, which is exactly what the user asked for.
      bag.ang.set(fz * SLAM_SPIN, 0, -fx * SLAM_SPIN);
      bag.leap = true;
      bag.armed = false;
      bag.hot = HOT_T;
      bag.yaw = pl.facing;
      // ...and the DRIVE's own roll goes on top of that (see `spinFrom`): the same axis, at the
      // rate the no-slip condition gives the 2.6 u/s it is thrown in at, so the two read as ONE
      // turn rather than as the two axes they used to show on.
      this.spinFrom(bag, 0.5);
      if (this.effects) {
        this.effects.puff(bag.pos.x, g + 0.1, bag.pos.z, 1.8, [0.85, 0.72, 0.5], 0.32);
        // ...and it goes up in a spray of its own heat (see `heatPuff`), not as a shock on the floor.
        this.effects.heatPuff(bag.pos.x, bag.pos.y, bag.pos.z, 0.9, [1, 0.82, 0.45]);
      }
      if (this.sfx && this.sfx.squeezeOut) this.sfx.squeezeOut();
      if (this.sfx && this.sfx.land) this.sfx.land(0.8);
      if (this.rig) this.rig.shake = Math.max(this.rig.shake, 0.35);
    } else {
      // A PLAIN THROW: up and out along the facing, on the ordinary prop arc.
      bag.pos.set(p.x + fx * 0.7, p.y + 0.35, p.z + fz * 0.7);
      bag.vel.set(fx * THROW_V, THROW_UP, fz * THROW_V);
      bag.spin = 7;
      bag.hot = 0;
      bag.yaw = pl.facing;
      // ...and the throw's own TUMBLE, off the same arc the velocity is (see `spinFrom`).
      this.spinFrom(bag, 0.6);
      if (this.sfx && this.sfx.squeezeOut) this.sfx.squeezeOut();
    }
    this.tintBag();
    if (this.editorOpen) this.render();
    return true;
  }

  // WHERE THE DUFFEL SITS IN THE ARMS, in the rig's own units, measured off the two HAND bones —
  // see `BAG_HAND`. `bone` is the torso hinge the bag is parented to, so the answer comes back in
  // that frame and can be written straight onto `mesh.position`.
  totePoint(bone, out) {
    const cm = this.player && this.player.charMesh;
    const bones = cm && cm.userData && cm.userData.bones;
    if (!bone || !bones || !bones.handL || !bones.handR) {
      return out.set(0, BAG_TOTE.y, BAG_TOTE.z);
    }
    bones.handL.getWorldPosition(_bagA);
    bones.handR.getWorldPosition(_bagB);
    _bagA.add(_bagB).multiplyScalar(0.5);
    bone.worldToLocal(_bagA);
    return out.set(_bagA.x + BAG_HAND.x, _bagA.y + BAG_HAND.y, _bagA.z + BAG_HAND.z);
  }

  // ...and its TILT: flat in the cradle, and keyed through the two throws (see the pitch tables at
  // the head of the file). The clock is normalised here rather than in `poseTote`, because the bag
  // and the arms have to agree about where in the shape they are.
  totePitch() {
    if (this.toteKind === "throw") {
      return bagKf(Math.min(1, this.toteT / Math.max(1e-3, this.toteDur)), TOTE_THROW_PITCH);
    }
    if (this.toteKind === "slam") {
      return bagKf(Math.min(1, this.toteT / Math.max(1e-3, this.toteDur)), TOTE_SLAM_PITCH);
    }
    return 0;
  }

  // The player's own copy of the tote's state, for its pose layer. Written in `preFrame` (before
  // the body updates), so the arms are already going where the bag is on the frame it arrives.
  publishTote() {
    const pl = this.player;
    if (!pl) return;
    const holding = this.bag.tote;
    const animating = this.toteKind !== "hold";
    pl.toting = holding || animating;
    pl.toteKind = holding && !animating ? "hold" : this.toteKind;
    pl.toteT = holding && !animating ? this.toteTime : Math.min(1, this.toteT / Math.max(1e-3, this.toteDur));
  }

  // ...and the same for THE HANDS (session 179): the one thing the carried arm's pose layer reads.
  // Written here with the tote's own publish, so both layers are decided on the same frame the gear
  // spent its input — the arms are already moving on the frame the item arrives in them.
  publishCarry(dt) {
    const pl = this.player;
    if (!pl) return;
    pl.carrying = !!this.hands;
    pl.carryT = this.carryTime;
    // ...and THE BALL ACTION's own two (session 180 — see `poseBallAction`): the shape and the phase
    // of it. Written with the carry's own publish, on the same frame the body takes its pose, so a
    // shape taken this frame is already on the rig when `updateVisual` runs a few lines later.
    pl.ballKind = this.ballKind;
    pl.ballPhase = this.ballPhase;
    // ...and THE CHARGE (session 198 — see `shootBegin`): how full the wind-up is, and the meter's
    // own fade. `ballShow` is written here rather than read off `ballCharging` by the meter because
    // the meter has to stay up for a beat AFTER the button comes up — the swing is what the charge
    // was FOR, and a bar that vanished on the release would take the readout away exactly as it is
    // being spent. It is frozen with the power on the release, so what the bar reads through the
    // swing is what the shot was worth.
    pl.ballCharge = this.ballCharge;
    this.ballShow = approach(this.ballShow, (this.ballCharging || this.ballStriking) ? 1 : 0,
      dt / SHOOT_METER_FADE);
    pl.ballShow = this.ballShow;
  }

  // The nearest body that can be hit, or null. The gear has no manager of its own; the player holds
  // the one the fight is run off (`Enemies`), and this is the read of it the live bag steers by.
  nearestEnemy(pos) {
    const mgr = this.player && this.player.enemies;
    if (!mgr || !mgr.spawned || !mgr.list) return null;
    let best = null;
    let bd = Infinity;
    for (const e of mgr.list) {
      if (!e.built || e.ragdoll) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // ---- A LIVE PROP, one frame -----------------------------------------------------------------
  // THE ONE BODY OF "HOT" BEHAVIOUR. It was `hotBag`'s alone until session 189, when the user asked
  // to be able to SLAM THE BALL the way the duffel is slammed (*"make me able to slam it and it spins
  // like how we did for the bag"*) — so "live" is a state a PROP can be in, not a thing the duffel
  // owns, and this reads it off `L`, the live record. Both carriers hand it the same fields:
  // `pos`/`vel`/`ang`/`quat`/`roll` (the physics the stepper drives), `hot` (the clock AND the one
  // flag the whole state is read off), `armed` (struck, so it has a target), `leap` (the slammed
  // one-shot still in hand), `hotCd` (the gap between two of the player's own contacts), `hotFxT`
  // (the spark trail's throttle), and the two things that differ between a duffel and a loose prop:
  // `hurt(dmg)` (its own health's door) and `isBroken()`. It is called only while `L.hot > 0`.
  //
  // Three jobs, in order:
  //   1. it is DRAWN at the nearest body (it is a weapon now, not scenery) — but ONLY once it has
  //      been STRUCK, by a move of the player's (`L.armed`). Until then it has no target at all: it
  //      just spins and leaps where it was slammed, which is the user's *"it doesnt home attack to
  //      the enemy until i hit it or the enemy hits [it]"*;
  //   2. the PLAYER's own moves FEED it — the damage a move does is paid straight into its speed,
  //      which is the user's *"the more damage i do to the bag the faster it goes"*;
  //   3. it HURTS whatever it runs into, and comes off it — and that contact is the END of it: the
  //      hot flag is dropped on its own hit, so the thing it leaves behind is an ordinary prop again
  //      (session 188 — see "THE HOT BAG" at the head of the file).
  liveStep(dt, L) {
    const b = L;
    const pl = this.player;
    if (b.hotCd > 0) b.hotCd -= dt;
    const target = this.nearestEnemy(b.pos);
    // ---- 1: drawn at the nearest body, once it has been hit ----
    if (target && b.armed) {
      let dx = target.pos.x - b.pos.x;
      let dz = target.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > HOT_NEAR) {
        dx /= d;
        dz /= d;
        b.vel.x += dx * HOT_SEEK * dt;
        b.vel.z += dz * HOT_SEEK * dt;
      }
    }
    let sp = Math.hypot(b.vel.x, b.vel.z);
    if (sp > HOT_MAX) {
      const k = HOT_MAX / sp;
      b.vel.x *= k;
      b.vel.z *= k;
      sp = HOT_MAX;
    }
    // ---- 2: the player's moves feed it ----
    const p = pl.pos;
    const pd = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
    const pdy = Math.abs(b.pos.y - (p.y - 0.6));
    const psp = Math.hypot(pl.vel.x, pl.vel.z);
    if (b.hotCd <= 0 && pd < HOT_TOUCH && pdy < 1.7 && (MOVE_STATES[pl.state] || psp > 7)) {
      b.hotCd = HOT_CD;
      // A move has landed on it: from here it has a target (see `bag.armed`).
      b.armed = true;
      const dmg = movePowerOf(pl);
      L.hurt(dmg);
      let nx = b.pos.x - p.x;
      let nz = b.pos.z - p.z;
      const nd = Math.hypot(nx, nz) || 1;
      nx /= nd;
      nz /= nd;
      const add = HOT_DMG_V * dmg + HOT_HIT_V * psp;
      b.vel.x += nx * add;
      b.vel.z += nz * add;
      b.vel.y = Math.max(b.vel.y, 1.8 + Math.min(4.5, dmg * 0.09));
      // ...and the blur it keeps is put on its SIDE AXIS rather than the deck plane's (session 187
      // — see `sideSpin`): `nx`/`nz` is the line the move threw it along, so the axis is the one it
      // is now tumbling over, and one already turning faster than this keeps whatever it had.
      this.sideSpin(b, nx, nz, 9);
      // ...and the move that fed it is thrown into its TUMBLE as well (see `spinFrom`).
      this.spinFrom(b, 0.35);
      if (this.effects) this.effects.heatPuff(b.pos.x, b.pos.y + 0.2, b.pos.z, 0.8, [1, 0.84, 0.44]);
      if (this.sfx && this.sfx.hit) this.sfx.hit(0);
      if (this.rig) this.rig.shake = Math.max(this.rig.shake, 0.26);
      if (L.isBroken()) {
        b.hot = 0;
        return;
      }
    }
    // ---- 3: it hurts what it runs into ----
    if (target) {
      const d2 = Math.hypot(target.pos.x - b.pos.x, target.pos.z - b.pos.z);
      const dy2 = Math.abs(target.pos.y - b.pos.y);
      if (d2 < HOT_ENEMY && dy2 < 2.2) {
        const kx = (target.pos.x - b.pos.x) / (d2 || 1);
        const kz = (target.pos.z - b.pos.z) / (d2 || 1);
        const s = Math.hypot(b.vel.x, b.vel.z);
        const knock = Math.min(24, 6 + s * 0.6);
        const dmg = Math.min(46, 7 + s * 1.0);
        // ...and a body it runs into is ITS OWN hit — the user's *"until i hit it or the enemy hits
        // [it]"* (and the only contact a NON-homing bag can make, since nothing is drawing it
        // anywhere yet).
        target.hit("fold", kx, kz, knock, 1.0, { dmg });
        // ...AND THAT CONTACT IS THE END OF THE LIVE BAG (session 188 — the user's *"make it once it
        // hit the enemy once it gets back to its orginal physics"*). It used to come off the body
        // still live — still homing, still fed by the player's moves, still a blur — until `HOT_T`
        // ran out, so its own hit started its career instead of finishing it. `hot` is dropped to
        // zero HERE, and that one flag is the whole live bag: the homing (`armed`) and the spark
        // trail are read off it, and so is the `grip` override, because the prop object the stepper
        // is handed is rebuilt without it next frame — so the deck's ordinary 9/s no-slip grip takes
        // the tumble back and the bounce / drag / spinDrag it lands on are an ordinary prop's
        // (0.35 / 6 / 5). The rest of the cleanup is the cooldown branch in `update` (which clears
        // `armed`, `leap` and the tint), so this only has to drop the flag; `armed` is deliberately
        // NOT set, because there is nothing left for it to draw the bag at.
        b.hot = 0;
        // ...and it comes OFF the body, with a shove, so the bag's one hit reads as an impact rather
        // than as the bag stopping dead on him.
        const back = Math.max(4, s * HOT_STOP);
        b.vel.x = -kx * back;
        b.vel.z = -kz * back;
        b.vel.y = Math.max(b.vel.y, 5.0);
        // ...and it leaves turning over the REBOUND's own line, on the side axis like everything
        // else a live bag does (session 187 — see `sideSpin`: the sign this used to read off the
        // cross product is the sign the axis gives it anyway, and a bag already turning faster than
        // 12 keeps what it had instead of being cut back to it).
        this.sideSpin(b, -kx, -kz, 12);
        // ...coming off the body turning over (see `spinFrom`): the rebound's own line.
        this.spinFrom(b, 0.45);
        if (this.effects) {
          this.effects.heatPuff(b.pos.x, b.pos.y + 0.25, b.pos.z, 0.9, [1, 0.78, 0.4]);
          this.effects.puff(b.pos.x, b.pos.y + 0.25, b.pos.z, 1.6, [0.9, 0.75, 0.55], 0.28);
        }
        if (this.sfx && this.sfx.hit) this.sfx.hit(1);
        if (this.rig) this.rig.shake = Math.max(this.rig.shake, 0.42);
      }
    }
    // ---- ...and a spark trail, so a live prop reads as live from across the street ----
    // The throttle lives on the RECORD (`hotFxT`) rather than on the gear: two props can be live at
    // once (a slammed duffel and a slammed ball) and neither may spend the other's.
    b.hotFxT -= dt;
    if (b.hotFxT <= 0 && sp > 6) {
      b.hotFxT = 0.07;
      if (this.effects) this.effects.puff(b.pos.x, b.pos.y + 0.10, b.pos.z, 0.55, [1, 0.82, 0.42], 0.22);
    }
  }

  // ...and the DUFFEL's own call: one line, because the behaviour above belongs to the PROP.
  hotBag(dt) {
    this.liveStep(dt, this.bag);
  }

  damageBag(amt) {
    if (this.bag.broken) return;
    this.bag.hp -= amt;
    // Everything inside takes half of what the bag takes: the padding helps, it does not save.
    for (const p of this.bag.box.items) damageItem(p.item, amt * 0.5);
    if (this.bag.hp <= 0) {
      this.bag.hp = 0;
      this.bag.broken = true;
      this.breakBag();
    }
    this.tintBag();
    if (this.editorOpen) this.render();
  }

  tintBag() {
    // The duffel hands its health to the ONE damage writer (see the block above `bagMesh`): the
    // bruise ramp it used to own by hand is `applyPropDamage`'s paint loop now, so the bag and the
    // dropped props are bruised by the same code. The ONLY thing the paint says is how beaten up it
    // is. A LIVE bag used to burn — a warm pull on the colour plus an emissive term — and the user
    // asked for that back off (*"dont make it change color"*): a live bag is read off its spin and
    // its trail, not off the paint, so the colour here is purely the damage ramp and nothing else
    // touches it.
    applyPropDamage(this.bag.mesh, propDamageK(this.bag), this.bag.broken);
  }

  breakBag() {
    this.bag.worn = false;
    this.bag.tote = false;
    this.bag.hot = 0;
    this.bag.armed = false;
    this.bag.leap = false;
    this.bag.item.broken = true;
    // The bag comes apart and its contents are thrown clear.
    for (const p of this.bag.box.items) {
      const a = Math.random() * Math.PI * 2;
      this.spawnDrop(p.item, 0, 0);
      const d = this.drops[this.drops.length - 1];
      if (!d) continue;
      d.pos.set(this.bag.pos.x, this.bag.pos.y + 0.4, this.bag.pos.z);
      d.vel.set(Math.sin(a) * 3, 3.5, Math.cos(a) * 3);
      // ...and every one of them thrown spinning (see `spinFrom`): the bag coming apart sprays its
      // contents the way a burst does, not the way a shelf empties.
      this.spinFrom(d, 0.6);
    }
    this.bag.box.items.length = 0;
    if (this.effects) {
      // ...and the bag itself comes apart into a cloud of its own colour (see `debrisCloud`) rather
      // than into a shock on the floor.
      this.effects.debrisCloud(this.bag.pos.x, this.bag.pos.y + 0.3, this.bag.pos.z, 0.75, [0.8, 0.6, 0.35]);
      this.effects.puff(this.bag.pos.x, this.bag.pos.y + 0.4, this.bag.pos.z, 2.4, [0.6, 0.5, 0.38], 0.4);
    }
    if (this.sfx && this.sfx.shatter) this.sfx.shatter();
    if (this.rig) this.rig.shake = Math.max(this.rig.shake, 0.5);
    this.tintBag();
  }

  // ---- children of the world --------------------------------------------------------------
  groundAt(x, z, y) {
    if (!this.world) return 0;
    return this.world.topBelow(x, z, y + 0.5, 4);
  }

  // IS A PROP IN REACH OF THE BOOT? The horizontal half of that question belongs to the caller (the
  // contact is a distance); this is the vertical half, and it is measured over the BODY'S OWN SPAN
  // rather than around its centre — because the centre is at the CHEST and a prop lying on the deck
  // sits at the FEET.
  //
  // It used to be `|prop.y - body.y| < 1.5`, and that window is the wrong place for the same
  // question: a duffel standing on the ground misses it by a hair (its centre is 0.5, the body's is
  // 2.0) and a ball sitting on the deck misses it by 0.4 — i.e. the boot could only ever connect with
  // something already bouncing, which is not what a kick is. Session 178 found it because a ball you
  // cannot kick with your feet is not a ball. From just under the soles to head height.
  inFootReach(pl, y) {
    const feet = pl.pos.y - P.HY;
    return y > feet - 0.5 && y < feet + P.HY * 1.1;
  }

  // THE DROP ITSELF — the one constructor for a loose prop (session 178). `spawnDrop` throws one off
  // a pocket and `dropAt` places one already standing on the deck; both are this with a different
  // velocity, so the boot, the wall, the ground, the damage look and the pickup all have exactly one
  // kind of thing to know about. `spin0` is the deck spin it is born with (a thrown prop is given
  // some, a placed one none) — and what the prop IS comes off its def: `round`/`settle` are its shape
  // (see `propSupport` / `stepSpin`) and `angMax` is how fast it may turn. `reuseMesh` (session 180)
  // hands it a mesh that already exists — the one a CARRIED ball was drawn with (see
  // `releaseHandThrow`) — instead of building a fresh one, so the thing that leaves the hand is the
  // thing that was in it.
  makeDrop(item, x, y, z, vx, vy, vz, spin0, reuseMesh) {
    const def = ITEM_DEFS[item.kind] || {};
    const mesh = reuseMesh || propMeshFor(item.kind);
    // It arrives on the deck wearing its own damage: a prop beaten up in a pocket is a beaten-up
    // prop the moment it lands, so nothing in the world ever looks fresher than it is.
    applyPropDamage(mesh, propDamageK(item), item.broken);
    // It leaves the pocket wearing the same turn it stood at in there, so the prop on the deck is
    // the thing you were just looking at rather than a fresh one (the throw's own spin takes over
    // from here).
    mesh.rotation.set(0, item.yaw || 0, 0);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const dr = {
      item,
      pos: mesh.position,
      vel: new THREE.Vector3(vx, vy, vz),
      // ...and its own radius, so everything that asks a prop how big it is has ONE answer to read
      // (the bag has carried its own from the start, for the same reason — see `propSupport`).
      radius: item.radius,
      // THE PROP'S OWN ANGLES (see `stepSpin`): the deck spin it is born with, the tumble the throw
      // is about to earn it (`spinFrom`, just below), the orientation they are integrated into, the
      // radius it TURNS on and which of its own axes it may rest on (see `PROP_REST_AXES`).
      ang: new THREE.Vector3(0, spin0, 0),
      quat: new THREE.Quaternion().setFromAxisAngle(_propAxis.set(0, 1, 0), item.yaw || 0),
      roll: PROP_ROLL_R[item.kind] || 0.2,
      rest: PROP_REST_AXES[item.kind] ? item.kind : "bag",
      round: !!def.round,
      settle: def.settle !== false,
      angMax: def.angMax || 0,
      // ...and the box it RESTS on (see `propSupport`), off its own mesh — or, for a ROUND prop, the
      // radius it rests on instead, seeded here so its first frame is already right.
      supBox: mesh.userData.box,
      sup: def.round ? item.radius : boxUpright(mesh.userData.box),
      impactCd: 0,
      kickCd: 0,
      // ...and THE LIVE STATE every prop carries (session 189 — see `liveStep`): zero is an ordinary
      // prop, and a slammed one is set to `HOT_T` the moment it leaves the hand (see
      // `releaseHandSlam`). These are the duffel's own fields, on a drop, which is the whole point of
      // the state being the PROP's now. The two doors: a point of damage goes through `damageItem` —
      // which for a ball is scaled to nothing by its own def, so being a weapon does not grind it
      // away — and "finished" is the ITEM's own broken flag, on which the prop is shattered.
      hot: 0,
      armed: false,
      leap: false,
      hotCd: 0,
      hotFxT: 0,
      hurt: (dmg) => { if (damageItem(dr.item, dmg)) this.shatterDrop(dr); },
      isBroken: () => dr.item.broken,
      mesh,
    };
    this.drops.push(dr);
    return dr;
  }

  spawnDrop(item, fwd, up) {
    const p = this.player.pos;
    const fx = Math.sin(this.player.facing);
    const fz = Math.cos(this.player.facing);
    const dr = this.makeDrop(
      item,
      p.x + fx * 0.7,
      p.y + 0.4,
      p.z + fz * 0.7,
      fx * fwd,
      up,
      fz * fwd,
      (Math.random() - 0.5) * 6
    );
    // ...and the throw TUMBLES it (see `spinFrom`): the prop's own throw line is the roll axis, so it
    // turns over the way it is now travelling rather than like a coin.
    this.spinFrom(dr, 0.55);
    return dr;
  }

  // ...and the same thing, PLACED rather than thrown (session 178): a prop that starts the game
  // lying where it is instead of flying out of a pocket. Its height is the deck under it plus the
  // support it rests on, which is what puts a ball exactly on the ground and not a radius under it.
  dropAt(item, x, z) {
    const def = ITEM_DEFS[item.kind] || {};
    const y = this.groundAt(x, z, 2.5) + (def.round ? item.radius : 0.3);
    return this.makeDrop(item, x, y, z, 0, 0, 0, 0);
  }

  // The frame a loose prop finally gives out. The bag has had `breakBag` for this from the start —
  // a come-apart, a spray of its contents and a sound — and the props now get the same ANNOUNCEMENT
  // scaled down to their size, because the break has to be something the player notices rather than
  // a colour that quietly changed while they were looking somewhere else. What actually changes on
  // the prop is `applyPropDamage`'s business (chips on, snaps jumped, paint greyed); this is only
  // the news, and the colour of the news is the prop's own (gold flies off a broken key, leather
  // off a duffel).
  shatterDrop(dr) {
    // ...and the colour of the news is the prop's own: gold off a broken key, white off the ball's
    // shell, leather off a duffel.
    const c = dr.item.kind === "keys" ? [1.0, 0.84, 0.44]
      : dr.item.kind === "ball" ? [0.94, 0.93, 0.89]
      : [0.86, 0.68, 0.44];
    if (this.effects) {
      this.effects.debrisCloud(dr.pos.x, dr.pos.y + 0.12, dr.pos.z, 0.35, c);
      this.effects.puff(dr.pos.x, dr.pos.y + 0.12, dr.pos.z, 1.3, [0.72, 0.66, 0.55], 0.26);
    }
    if (this.sfx && this.sfx.shatter) this.sfx.shatter();
    if (this.rig) this.rig.shake = Math.max(this.rig.shake, 0.2);
  }

  // `bounce` is what the prop keeps off a landing and `drag` the ground friction — both optional,
  // and both there for the LIVE bag (see `HOT_BOUNCE` / `HOT_DRAG`): a slammed bag has to come OFF
  // the deck and keep rolling, where an ordinary dropped prop settles and stops. `spinDrag` is the
  // third, for the same reason (`HOT_SPIN` keeps a live bag a blur) — and `o.leap` is a ONE-SHOT:
  // an upward velocity the next deck contact SPENDS in place of a bounce, which is the slam's jump.
  // `wallHard` is the fourth: the speed at which hitting a WALL starts to hurt (see `propAxis`),
  // defaulting to the deck's own `hard` — the duffel raises it, because a bag that pings off a
  // building should not bruise itself the way a bag thrown into the pavement does.
  stepProp(dt, o, radius, hard, bounce, drag, spinDrag, wallHard) {
    const rest = bounce == null ? 0.35 : bounce;
    const grd = drag == null ? 6 : drag;
    const sdr = spinDrag == null ? 5 : spinDrag;
    const wh = wallHard == null ? hard : wallHard;
    o.vel.y -= GRAV * dt;
    // ...and the motion is SUBSTEPPED (see `PROP_STEP`): a kicked prop crosses most of a kerb in a
    // single frame, and one move-and-test would carry it clean through the corner of a block. The
    // ground response is spent on the substep it happens on — a landing is a moment, not a rate —
    // and the two drags are scaled to the substep so the frame's total is the same either way.
    const mx = o.vel.x * dt;
    const my = o.vel.y * dt;
    const mz = o.vel.z * dt;
    const n = Math.min(
      PROP_STEP_MAX,
      Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(my), Math.abs(mz)) / PROP_STEP))
    );
    const sx = mx / n;
    const sy = my / n;
    const sz = mz / n;
    const sdt = dt / n;
    let land = 0;
    for (let i = 0; i < n; i++) {
      this.queryProps(o, radius);
      this.propAxis(o, "x", sx, radius, rest, wh);
      this.propAxis(o, "z", sz, radius, rest, wh);
      o.pos.y += sy;
      const g = this.groundAt(o.pos.x, o.pos.z, o.pos.y);
      // ...and HOW TALL it is this instant (see `propSupport`), eased so a fast tumble rides its
      // corners instead of popping off them.
      o.sup += (this.propSupport(o) - o.sup) * Math.min(1, 18 * sdt);
      let onDeck = false;
      if (o.pos.y - o.sup <= g) {
        onDeck = true;
        o.pos.y = g + o.sup;
        const impact = -o.vel.y;
        if (impact > land) land = impact;
        if (o.leap > 0) {
          // THE SLAM'S JUMP, spent on the first thing it lands on: straight back up at the whole
          // `leap` (no bounce fraction — the deck is not absorbing this one, it is throwing), and it
          // keeps every bit of the spin it came in with.
          o.vel.y = o.leap;
          o.leap = 0;
        } else if (Math.abs(o.vel.y) > 1.2) o.vel.y = -o.vel.y * rest;
        else o.vel.y = 0;
        const fr = Math.max(0, 1 - grd * sdt);
        o.vel.x *= fr;
        o.vel.z *= fr;
        o.spin *= Math.max(0, 1 - sdr * sdt);
      } else {
        const ad = Math.max(0, 1 - 0.1 * sdt);
        o.vel.x *= ad;
        o.vel.z *= ad;
      }
      // ...and THE PROP'S OWN TURN, on the same substep (see `stepSpin`): what the deck did to the
      // speed this instant is what drives the tumble this instant, which is why a landing turns a
      // slide into a roll and a skid into a spin without anything having to notice either.
      this.stepSpin(o, sdt, onDeck);
    }
    if (land > hard) {
      o.hit(land);
      if (this.effects) this.effects.puff(o.pos.x, o.pos.y - radius + 0.1, o.pos.z, 1.4, [0.7, 0.68, 0.6], 0.3);
      if (this.sfx && this.sfx.land) this.sfx.land(Math.min(1, land / 18));
    }
  }

  // The world's own boxes near a prop, into the gear's scratch buffer. Queried at the top of every
  // substep of `stepProp` and padded by one substep of travel, so the box a prop is ABOUT to be
  // inside is always in the list it gets resolved against.
  queryProps(o, radius) {
    const q = this.pq || (this.pq = []);
    q.length = 0;
    const w = this.world;
    if (!w || !w.queryXZ) return q;
    const r = radius + PROP_STEP + 0.12;
    w.queryXZ(o.pos.x - r, o.pos.z - r, o.pos.x + r, o.pos.z + r, q);
    return q;
  }

  // One axis of a prop's motion, resolved against the world (the same rule the player's `moveAxis`
  // uses, one shape over): the prop is a box of its own `radius`, and a box it ends up inside
  // pushes it back out along the axis it was travelling. What it went in with comes back out at
  // `rest`, so a kicked prop RICOCHETS off a wall and a slammed duffel pings off a building rather
  // than either of them sticking to one — and the face scrubs a little of the slide off too, more
  // the harder it was hit, so nothing skates along a wall for free.
  //
  // A prop thrown into a face hard enough takes the hit ITSELF (`o.hit`, the same callback the
  // deck's landings use), so a key booted at a wall arrives on the ground as beaten up as it should
  // be. The floor is deliberately NOT resolved here: the height of a prop belongs to `groundAt`
  // (which knows about the decks, the terraces and the ground that has been beaten down), and two
  // owners for one axis is how a landing ends up applied twice.
  propAxis(o, axis, d, radius, rest, wallHard) {
    if (d === 0) return;
    o.pos[axis] += d;
    const cols = this.pq;
    if (!cols) return;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (o.pos.y + radius <= c.minY || o.pos.y - radius >= c.maxY) continue;
      if (o.pos.x + radius <= c.minX || o.pos.x - radius >= c.maxX) continue;
      if (o.pos.z + radius <= c.minZ || o.pos.z - radius >= c.maxZ) continue;
      const v = o.vel[axis];
      if (axis === "x") o.pos.x = d > 0 ? c.minX - radius - PROP_EDGE : c.maxX + radius + PROP_EDGE;
      else o.pos.z = d > 0 ? c.minZ - radius - PROP_EDGE : c.maxZ + radius + PROP_EDGE;
      const speed = Math.abs(v);
      if (speed > 1.2) {
        o.vel[axis] = -v * rest;
        const scrub = 1 - (1 - PROP_WALL_SCRUB) * Math.min(1, speed / 8);
        if (axis === "x") o.vel.z *= scrub;
        else o.vel.x *= scrub;
        o.spin *= 0.94;
        // ...and the FACE LEAVES ITS OWN TUMBLE: a prop that has just been turned off a wall is
        // rolling the way it now travels, so the bounce is given the no-slip rate of the NEW line
        // (see `stepSpin`) rather than a made-up spin — the same rule the deck uses, off the same
        // number. `PROP_ROLL` again, because a scrape off a face grips less than a deck does.
        if (o.ang) {
          const sv = Math.hypot(o.vel.x, o.vel.z);
          if (sv > 0.5) {
            const k = Math.min(1, speed / 9) * (sv / o.roll) * PROP_ROLL;
            o.ang.x += (o.vel.z / sv) * k;
            o.ang.z += (-o.vel.x / sv) * k;
            const w = Math.hypot(o.ang.x, o.ang.y, o.ang.z);
            if (w > PROP_ANG_MAX) {
              const kk = PROP_ANG_MAX / w;
              o.ang.x *= kk;
              o.ang.y *= kk;
              o.ang.z *= kk;
            }
          }
        }
        if (speed > wallHard && o.hit) o.hit(speed);
      } else {
        o.vel[axis] = 0;
      }
    }
  }

  // HOW TALL A PROP IS RIGHT NOW. A prop does not rest on its centre: it rests on the lowest corner
  // of the box it is drawn as, and which corner that is changes every time it turns. So the height
  // the deck holds it at is the box's own support along world-down, taken in the prop's own frame:
  // the box's centre projected on the local up, less the box's extent along each of its own axes
  // (`hx|ux| + hy|uy| + hz|uz|` — the corner reach). Standing as authored that comes to `hy - cy`,
  // which is exactly the height of its base below its origin; laid on its side it comes to the
  // half-depth, so a bag on its face rides *on* that face and a key ends up on its own flat back
  // rather than buried to the ring.
  //
  // It is eased into (`o.sup`, at the call site) rather than snapped: a prop tumbling at speed has
  // its support sweeping between its smallest and largest half-extent several times a second, and
  // taking the exact value each frame would have it rattling up and down off its own corners.
  propSupport(o) {
    // A ROUND prop has no corners to ride (the ball — see its def): its support is its own radius,
    // wherever the pattern happens to be turned to, so nothing here reads the box at all. Read off
    // the box instead, a sphere of radius `r` rests with its centre `0.53r` up — because that is the
    // height of the icosahedron's own AABB — and the ball is then sunk a third of the way into the
    // deck and bobs as its facets turn.
    if (o.round) return o.radius || 0.1;
    const b = o.supBox;
    if (!b) return o.radius || 0.1;
    _propQ2.copy(o.quat).invert();
    _propUp.set(0, 1, 0).applyQuaternion(_propQ2);
    return (
      b.hx * Math.abs(_propUp.x) + b.hy * Math.abs(_propUp.y) + b.hz * Math.abs(_propUp.z) -
      (b.cx * _propUp.x + b.cy * _propUp.y + b.cz * _propUp.z)
    );
  }

  // ---- ANGLE PHYSICS --------------------------------------------------------------------------
  // One substep of a prop's own turn. Three things happen, and they are the whole of it:
  //
  //   1. THE DECK DRIVES THE ROLL. A prop whose base is on the ground and whose centre is moving
  //      cannot slide without turning: its contact is stuck to the surface, so the body turns at
  //      exactly the rate its own size demands, about the axis ACROSS its travel — the no-slip
  //      condition, `omega = (up x v) / r`. That is where a kicked bag's end-over-end tumble comes
  //      from, where a rolling key's curve comes from, and why the two die together as friction
  //      spends the speed: they are one number. `PROP_ROLL` takes a share rather than all of it
  //      (a duffel is soft and lands on a corner and flops rather than rolling like a wheel), and
  //      the blend is what turns a LANDING into a tumble — whatever the deck stops, the roll takes.
  //   2. THE AIR ONLY BLEEDS IT. Nothing here torques a prop in mid-air; the throw did, at the
  //      moment it was thrown (`spinFrom`), so what a prop keeps between bounces is what it left
  //      with, decaying slowly.
  //   3. THE DECK HOLDS THE YAW. The one component the rolling contact does NOT own is the turn in
  //      the ground plane — a coin spinning on a table — and a face stops that faster than it stops
  //      a slide, so it bleeds at `PROP_ANG_GROUND` instead.
  //
  // Then the orientation is integrated (in WORLD axes, because `ang` is a world-space vector) and,
  // once the prop has genuinely stopped, laid onto a face by `settleSpin`.
  stepSpin(o, dt, onDeck) {
    const ang = o.ang;
    if (!ang) return;
    const r = o.roll || 0.25;
    // HOW HARD THE DECK GRIPS THIS PROP'S TUMBLE, in /s. It is the no-slip drag below and, with it,
    // the damp that owns the x/z axes once the prop is too slow to roll. An ordinary prop takes the
    // two constants (9 and 5 — they are the same numbers the deck plane's `ang.y` has always been
    // spent at); a LIVE BAG names its own (`grip`, HOT_SPIN) and is dragged by neither, because its
    // turn is AUTHORED — the slam arms it and the player's moves feed it — and the ordinary 9/s
    // would have the whole blur off it inside the first landing the slam makes.
    const grip = o.grip == null ? PROP_ROLL_GRIP : o.grip;
    const gdamp = o.grip == null ? PROP_ANG_GROUND : o.grip;
    const vx = o.vel.x;
    const vz = o.vel.z;
    const s = Math.hypot(vx, vz);
    if (onDeck) {
      if (s > 0.3) {
        const want = (s / r) * PROP_ROLL;
        const k = Math.min(1, dt * grip);
        ang.x += ((vz / s) * want - ang.x) * k;
        ang.z += ((-vx / s) * want - ang.z) * k;
      } else {
        const d = Math.max(0, 1 - gdamp * dt);
        ang.x *= d;
        ang.z *= d;
      }
      // NOTE: the ground-plane turn (`ang.y`) is deliberately NOT damped here. It already has an
      // owner — `stepProp`'s ground branch spends the prop's own `spinDrag` on it, which is the
      // number the bag's behaviour was tuned with (`HOT_SPIN`, 0.7, is what keeps a slammed duffel
      // a BLUR for the whole ten seconds it lives). Damping it here as well would have quietly cut
      // the live bag's spin five times shorter than it was ever meant to last.
    } else {
      const d = Math.max(0, 1 - PROP_ANG_AIR * dt);
      ang.x *= d;
      ang.y *= d;
      ang.z *= d;
    }
    // A ceiling, because a small prop rolling on its own radius wants to turn twenty times a second
    // and the picture runs at 224p: past `PROP_ANG_MAX` it is not a tumble any more, it is a strobe.
    // A rounder, smaller prop may be given its own ceiling (`angMax` — the ball sits at 70, because a
    // 0.14-radius sphere rolling at a kicked 10 u/s wants 51 and a duffel's 44 would clip it into a
    // skid).
    const AM = o.angMax > 0 ? o.angMax : PROP_ANG_MAX;
    let w = Math.hypot(ang.x, ang.y, ang.z);
    if (w > AM) {
      const k = AM / w;
      ang.x *= k;
      ang.y *= k;
      ang.z *= k;
      w = AM;
    }
    if (w > 1e-4) {
      _propQ.setFromAxisAngle(_propAxis.set(ang.x / w, ang.y / w, ang.z / w), w * dt);
      o.quat.premultiply(_propQ);
      o.quat.normalize();
    }
    // ...and THE REST (see `PROP_REST_AXES`): a prop nothing is pushing any more is PUT DOWN on a face
    // rather than left frozen mid-turn — whichever of its own rest axes is pointing most up right
    // now, so a tumbling bag is left on its side as often as on its base and a key always ends flat.
    // A ROUND prop is exempt (`settle: false`): a sphere has no face to be squared up onto, and
    // slerping it to an axis would visibly jump its pattern whenever it slowed down — the last of its
    // turn is simply bled away.
    if (onDeck && s < PROP_SETTLE_V && w < PROP_SETTLE_W) {
      if (o.settle !== false) this.settleSpin(o, dt);
      const d = Math.max(0, 1 - 8 * dt);
      ang.x *= d;
      ang.y *= d;
      ang.z *= d;
    }
  }

  // Lay a stopped prop down on the face it is nearest to. The correction is the SHORTEST rotation
  // that brings the chosen own-axis exactly onto up (`setFromUnitVectors`), composed onto the
  // current orientation in world space — so whatever turn the prop already has is kept and only the
  // last few degrees of lean come out. Slerping that in at `PROP_SETTLE_RATE` is what makes the prop
  // come to rest rather than being snapped square.
  settleSpin(o, dt) {
    const axes = PROP_REST_AXES[o.rest] || PROP_REST.bag;
    let bestI = 0;
    let bestUp = -2;
    for (let i = 0; i < axes.length; i++) {
      const a = axes[i];
      _propUp.set(a[0], a[1], a[2]).applyQuaternion(o.quat);
      if (_propUp.y > bestUp) {
        bestUp = _propUp.y;
        bestI = i;
      }
    }
    const a = axes[bestI];
    _propUp.set(a[0], a[1], a[2]).applyQuaternion(o.quat);
    _propQ.setFromUnitVectors(_propUp, _propAxis.set(0, 1, 0));
    _propQ2.copy(_propQ).multiply(o.quat);
    o.quat.slerp(_propQ2, Math.min(1, dt * PROP_SETTLE_RATE));
  }

  // Give a thrown prop the tumble the throw deserves. Nothing in the air spins a prop (see
  // `stepSpin`), so the angular momentum a throw leaves with it is authored HERE, at the moment the
  // throw happens — and it is the same no-slip rate the ground would demand of it, `(up x v) / r`,
  // taken at `factor` of it and added on top of whatever deck spin the prop already had. Which is
  // why a hard throw tumbles and a nudge barely turns: both are read off one number.
  spinFrom(o, factor = 0.5) {
    if (!o.ang) return;
    const r = o.roll || 0.25;
    const vx = o.vel.x;
    const vz = o.vel.z;
    const s = Math.hypot(vx, vz);
    if (s < 0.4) return;
    const want = (s / r) * factor;
    o.ang.x += (vz / s) * want;
    o.ang.z += (-vx / s) * want;
    const AM = o.angMax > 0 ? o.angMax : PROP_ANG_MAX;
    const w = Math.hypot(o.ang.x, o.ang.y, o.ang.z);
    if (w > AM) {
      const k = AM / w;
      o.ang.x *= k;
      o.ang.y *= k;
      o.ang.z *= k;
    }
  }

  // PUT A PROP'S TURN ON ITS SIDE AXIS. `ax`/`az` is the line the prop is travelling (or being
  // thrown) along, and the axis that line wants is `up x it` — the SIDE axis, the one the deck's own
  // roll grips (`stepSpin`), which is why a prop's tumble and its travel can never disagree. `min`
  // is the rate the caller wants the prop to carry AT LEAST (a live bag's blur); whatever it is
  // already turning about that axis beyond `min` is kept, and its SIGN is kept with it, so a bag
  // that is already turning over is never snapped the other way by the move that lands on it.
  //
  // SESSION 187: this is where a live bag's spin goes now. The two beats that re-arm it — a move of
  // the player's landing on it, and a body it runs into — both used to write `bag.spin`, which is
  // the deck plane's `ang.y`, and that is the flywheel the user asked to be rid of (*"make it when
  // i slam a bag it spins only in side axis"*).
  sideSpin(o, ax, az, min = 0) {
    if (!o.ang) return;
    const m = Math.hypot(ax, az);
    if (m < 1e-4) return;
    const ux = az / m;
    const uz = -ax / m;
    const cur = o.ang.x * ux + o.ang.z * uz;
    const want = (cur < 0 ? -1 : 1) * Math.max(Math.abs(cur), min);
    o.ang.x += (want - cur) * ux;
    o.ang.z += (want - cur) * uz;
  }

  // ---- the frame's world half -------------------------------------------------------------
  update(dt) {
    const pl = this.player;
    const psp = Math.hypot(pl.vel.x, pl.vel.z);
    if (this.bag.kickCd > 0) this.bag.kickCd -= dt;
    if (this.bag.impactCd > 0) this.bag.impactCd -= dt;

    this.syncWear();
    // ...and the same for the thing in his hands (session 179 — see "THE HANDS"): a child of the
    // torso at a fixed offset, re-parented and counter-scaled on demand.
    this.syncCarry();
    if (this.bag.worn) {
      if (this.bag.mesh.parent === this.scene) {
        // No rig yet — the fallback box is the body for the opening frames of a load. Follow the
        // capsule the way a prop would: behind him, at mid-back height, pockets facing out.
        const fx = Math.sin(pl.facing);
        const fz = Math.cos(pl.facing);
        this.bag.pos.set(pl.pos.x - fx * 0.5, pl.pos.y + 0.25, pl.pos.z - fz * 0.5);
        this.bag.mesh.position.copy(this.bag.pos);
        this.bag.mesh.rotation.set(0, pl.facing + BAG_WEAR.yaw, 0);
      } else {
        // ON THE BACK: the rig is carrying it, so there is nothing to place — only the bag's WORLD
        // position to read back, because the throw, the running kick and the prompt all ask where
        // the bag is and not one of them knows about bones.
        this.bag.mesh.getWorldPosition(this.bag.pos);
      }
    } else if (this.bag.tote) {
      // IN BOTH ARMS (see `takeInHands`). With a rig on screen the bag is a CHILD of it
      // (`syncWear`), and there is nothing to place — only its WORLD position to read back, because
      // the throw, the prompt and the pose all ask where the bag is and not one of them knows about
      // bones.
      if (this.bag.mesh.parent === this.scene) {
        // No rig yet — the opening frames of a load, or the imported model: carry it in front of
        // the capsule, pockets out, the way the body will once it arrives.
        const fx = Math.sin(pl.facing);
        const fz = Math.cos(pl.facing);
        this.bag.pos.set(pl.pos.x + fx * 0.35, pl.pos.y + 0.15, pl.pos.z + fz * 0.35);
        this.bag.mesh.position.copy(this.bag.pos);
        this.bag.mesh.rotation.set(0, pl.facing + BAG_TOTE.yaw, 0);
      } else {
        this.bag.mesh.getWorldPosition(this.bag.pos);
      }
    } else {
      const b = this.bag;
      if (b.broken) b.hot = 0;
      const hot = b.hot > 0;
      this.stepProp(
        dt,
        {
          pos: b.pos,
          vel: b.vel,
          // ...and the bag's own ANGLES (see `stepSpin`): the world-space angular velocity the
          // steppers drive, the orientation they integrate it into, and what it turns and rests on.
          ang: b.ang,
          quat: b.quat,
          roll: b.roll,
          // ...and HOW HARD THE DECK GRIPS THAT TURN (see `stepSpin`): a live bag's is `HOT_SPIN`
          // where an ordinary prop's is 9, because its turn is authored (the slam arms it, the
          // player's moves feed it) and the deck's own no-slip drag would have the blur off it
          // inside the first landing it makes. The moment it cools, `hot` is false and the prop
          // object is rebuilt without this field, so it rolls and settles like any other prop.
          grip: hot ? HOT_SPIN : null,
          rest: b.rest,
          // ...and the box it rests on, whose eased support height is the property the stepper
          // actually writes (see `propSupport`) — so it has to reach the bag and not a copy of it.
          supBox: b.supBox,
          get sup() {
            return b.sup;
          },
          set sup(v) {
            b.sup = v;
          },
          get spin() {
            return b.spin;
          },
          set spin(v) {
            b.spin = v;
          },
          // The one-shot the slam leaves behind (see `stepProp`): the bag owns the flag and the
          // stepper spends it, so the jump is a property of the bag and not of its physics call.
          get leap() {
            return b.leap ? SLAM_LEAP : 0;
          },
          set leap(v) {
            b.leap = v > 0;
          },
          hit: (impact) => {
            // A LIVE bag is a WEAPON, not cargo: its own landings never hurt it. It has to survive
            // both the slam and the eleven-unit jump that slam buys it, and at 24 u/s the second
            // landing would otherwise break it outright (the `damageBag` curve pays ~40 a knock).
            // The puff and the sound still fire — they come off the same `impact > hard` test in
            // `stepProp`, and a live bag hitting a roof should still read as an impact.
            if (hot) return;
            if (impact > 7 && b.impactCd <= 0) {
              b.impactCd = 0.3;
              this.damageBag(Math.min(40, (impact - 7) * 9));
            }
          },
        },
        this.bag.radius,
        7,
        hot ? HOT_BOUNCE : 0.35,
        hot ? HOT_DRAG : 6,
        hot ? HOT_SPIN : 5,
        BAG_WALL_HARD
      );
      // ...and THE LIVE BAG, after its own physics (see `throwFromHands("slam")` / `hotBag`).
      if (hot) {
        b.hot -= dt;
        this.hotBag(dt);
        if (b.hot <= 0) {
          b.hot = 0;
          b.armed = false;
          b.leap = false;
          this.tintBag();
        }
      }
      b.mesh.position.copy(b.pos);
      // THE ORIENTATION IS THE PHYSICS' (see `stepSpin`): the mesh wears the quaternion the angles
      // were integrated into, and the bag's own heading is read back off it for the two places that
      // still speak in yaw (the editor's station and the wear offsets).
      b.mesh.quaternion.copy(b.quat);
      // ...and a broken bag is SLUMPED on top of that: the shape it is drawn with has given up, so
      // it leans over wherever it is lying.
      if (b.broken) {
        b.mesh.rotateX(-0.5);
        b.mesh.rotateZ(0.4);
      }
      _propAxis.set(0, 0, 1).applyQuaternion(b.quat);
      b.yaw = Math.atan2(_propAxis.x, _propAxis.z);
      const dx = b.pos.x - pl.pos.x;
      const dz = b.pos.z - pl.pos.z;
      const d = Math.hypot(dx, dz);
      // ...and the vertical half of the contact is the BODY's own span rather than a window around its
      // centre (see `inFootReach`): a duffel standing on the deck is at the FEET.
      if (!hot && d < 0.9 && this.inFootReach(pl, b.pos.y)) {
        if ((psp > 8 || pl.state === "slide" || pl.state === "dive" || pl.state === "lunge") && b.kickCd <= 0) {
          b.kickCd = 0.4;
          const nx = d > 1e-3 ? dx / d : Math.sin(pl.facing);
          const nz = d > 1e-3 ? dz / d : Math.cos(pl.facing);
          const power = 6 + psp * 0.35;
          b.vel.set(nx * power, 3.5, nz * power);
          b.spin = 6;
          // A boot into a loose prop TUMBLES it (see `spinFrom`) — the kick's own line is the roll
          // axis, so it turns over the way it is now travelling rather than like a coin.
          this.spinFrom(b, 0.5);
          this.damageBag(10 + psp * 0.4);
          if (this.effects) this.effects.heatPuff(b.pos.x, b.pos.y + 0.3, b.pos.z, 0.8, [1, 0.86, 0.5]);
          if (this.rig) this.rig.shake = Math.max(this.rig.shake, 0.35);
          if (this.sfx && this.sfx.hit) this.sfx.hit(0);
        } else if (d < 0.7 && d > 1e-4) {
          b.pos.x = pl.pos.x + (dx / d) * 0.7;
          b.pos.z = pl.pos.z + (dz / d) * 0.7;
        }
      }
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const dr = this.drops[i];
      if (dr.impactCd > 0) dr.impactCd -= dt;
      if (dr.kickCd > 0) dr.kickCd -= dt;
      // ...and WHAT THIS PROP IS (the ball — see its def): a round one rides its radius instead of its
      // box, a bouncy one gives more back off a landing, and a rolling one keeps its speed.
      const DD = ITEM_DEFS[dr.item.kind] || {};
      // ...and WHETHER IT IS LIVE (session 189 — see `liveStep`): a prop that has been SLAMMED is a
      // weapon for its own window, exactly as the duffel is out of both arms. The three numbers the
      // stepper is handed and the `grip` override all come off this one flag, so the moment it cools
      // (or its one hit lands, session 188) the prop is an ordinary one again — there is no state to
      // unwind and nothing to tell apart.
      const hot = dr.hot > 0;
      this.stepProp(
        dt,
        {
          pos: dr.pos,
          vel: dr.vel,
          // ...and the prop's own angles (see `stepSpin`), exactly as the bag's.
          ang: dr.ang,
          quat: dr.quat,
          roll: dr.roll,
          // ...and HOW HARD THE DECK GRIPS THAT TURN (see `stepSpin`): a live prop's is `HOT_SPIN`,
          // where an ordinary prop's is 9 — without it the deck's own no-slip drag would have the
          // slam's blur off a ball inside the first landing it makes. A cold prop gets `null` and the
          // stepper's own defaults, which is what it had before any of this existed.
          grip: hot ? HOT_SPIN : null,
          rest: dr.rest,
          round: dr.round,
          settle: dr.settle,
          angMax: dr.angMax,
          // The one-shot the slam leaves behind (see `stepProp`): the PROP owns the flag and the
          // stepper spends it, so the jump is a property of the prop and not of its physics call.
          get leap() {
            return dr.leap ? SLAM_LEAP : 0;
          },
          set leap(v) {
            dr.leap = v > 0;
          },
          // ...and the radius it rests on when it is ROUND (see `propSupport`): the stepper takes the
          // radius as its own argument, but the support solver reads it off the prop.
          radius: dr.radius,
          supBox: dr.supBox,
          get sup() {
            return dr.sup;
          },
          set sup(v) {
            dr.sup = v;
          },
          get spin() {
            return dr.spin;
          },
          set spin(v) {
            dr.spin = v;
          },
          hit: (impact) => {
            // ...and a LIVE prop's own landings never hurt it (the duffel's rule since the hot bag
            // existed): it has to survive both its slam and the eleven-unit jump that slam buys it,
            // and at 24 u/s the second landing would read as a knock. The puff and the sound still
            // fire — they come off `stepProp`'s own `impact > hard` test, not off this.
            if (hot) return;
            if (impact > 8 && dr.impactCd <= 0) {
              dr.impactCd = 0.3;
              if (damageItem(dr.item, Math.min(30, (impact - 8) * 5))) this.shatterDrop(dr);
              if (this.editorOpen) this.render();
            }
          },
        },
        dr.item.radius,
        8,
        // ...and how its SURFACE answers (the ball bounces and rolls — see its def). Left undefined
        // for a box, which is `stepProp`'s own defaults — and REPLACED by the live prop's own three
        // while it is hot (see "THE HOT BAG" at the head of the file: a slammed thing has to come off
        // the deck and keep going, where an ordinary prop settles and stops).
        hot ? HOT_BOUNCE : DD.bounce,
        hot ? HOT_DRAG : DD.drag,
        hot ? HOT_SPIN : DD.spinDrag
      );
      // ...and THE LIVE PROP, after its own physics (session 189 — see `liveStep`): the clock, the
      // homing once it has been struck, the player's moves feeding it, its ONE hit, and the spark
      // trail. The cleanup is the same shape the duffel's is — the flags come off with the clock, and
      // the three numbers above are the stepper's again next frame because `hot` is.
      if (hot) {
        dr.hot -= dt;
        this.liveStep(dt, dr);
        if (dr.hot <= 0) {
          dr.hot = 0;
          dr.armed = false;
          dr.leap = false;
        }
      }
      // THE DAMAGE LOOK, every frame and off the item's own health (see the block above
      // `bagMesh`): a prop that has just been kicked across the street wears the bruise on the
      // frame it lands rather than waiting for the next time it is dropped.
      applyPropDamage(dr.mesh, propDamageK(dr.item), dr.item.broken);
      // The prop wears the orientation the angles were integrated into (see `stepSpin`) — the old
      // `rotation.y += spin*dt` was the one-axis version of exactly this.
      dr.mesh.quaternion.copy(dr.quat);
      const dx = dr.pos.x - pl.pos.x;
      const dz = dr.pos.z - pl.pos.z;
      const d = Math.hypot(dx, dz);
      // ...(and NOT while it is live: the boot is for ordinary props — a slammed prop is a WEAPON and
      // the player's own moves FEED it rather than punt it, which is `liveStep` job 2 and the same
      // rule the duffel has had since the hot bag was written).
      if (!hot && d < 0.9 && this.inFootReach(pl, dr.pos.y) && psp > 8 && dr.kickCd <= 0 && this.bag.kickCd <= 0) {
        // A KICK IS ONE PUNT, NOT A PER-FRAME GRIND (session 178). This branch used to fire on every
        // frame the body was inside a loose prop at speed: for a key that was ten points of damage a
        // frame — it shattered in four frames, before the boot had even visually connected — and for
        // the BALL it meant a fresh punt every 16 ms, so it was juggled off the shin rather than
        // struck. `KICK_CD` is what makes the boot a discrete event, and what lets a ball be
        // DRIBBLED one touch at a time, which is the whole of what kicking one around is.
        dr.kickCd = KICK_CD;
        const kick = DD.kick || KICK_DEFAULT;
        const nx = d > 1e-3 ? dx / d : Math.sin(pl.facing);
        const nz = d > 1e-3 ? dz / d : Math.cos(pl.facing);
        const v = kick.v + psp * kick.gain;
        dr.vel.set(nx * v, kick.up, nz * v);
        this.spinFrom(dr, 0.5);
        if (damageItem(dr.item, 6 + psp * 0.25)) this.shatterDrop(dr);
      }
      // ...AND THE CONTROL (session 180 — see `BALL_TOUCH_*`). A ball that is HIS is steered to stay
      // in front of him rather than being knocked away by him: the velocity it is given is the
      // player's own, plus a pull toward a point `BALL_TOUCH_AHEAD` in front of his face. Nothing is
      // parented and nothing is teleported — it is a ball rolling where a man is pushing it, so a
      // kerb, a wall, a body and a bounce all still move it like a ball.
      //
      // It runs AFTER the boot's own touch, on the same frame and off the same `d`, so the two agree
      // about where the ball is; the touch is a knock and this is the dribble that follows it. The
      // one thing that keeps the two apart is `BALL_TOUCH_MAXV`: a ball already going somewhere
      // faster than this is left alone, which is what lets a shoot (15.5 u/s) leave.
      //
      // A LIVE ball is not dribbled (session 189): its line belongs to `liveStep` while it is hot, and
      // an assist that dragged a slammed ball back toward the player's toes would fight the homing.
      if (DD.control && !dr.item.broken && !hot) {
        const sp = Math.hypot(dr.vel.x, dr.vel.z);
        const deck = this.groundAt(dr.pos.x, dr.pos.z, 2.5) + dr.item.radius;
        // ...and a ball he is WINDING A SHOT UP on is held closer than a dribbled one (session 198 —
        // see `BALL_TOUCH_AHEAD_CHARGE`): a charge is a second of standing on it, and the dribble's
        // own half-metre lets a sprinting ball walk out of reach over that second, which cancels the
        // shot. Everything else about the solve is unchanged, one point nearer.
        const winding = this.ballCharging;
        if (d < BALL_TOUCH_R && sp < BALL_TOUCH_MAXV && dr.pos.y <= deck + BALL_TOUCH_GROUND) {
          const fx = Math.sin(pl.facing), fz = Math.cos(pl.facing);
          const ahead = winding ? BALL_TOUCH_AHEAD_CHARGE : BALL_TOUCH_AHEAD;
          const pull = winding ? BALL_TOUCH_GAIN_CHARGE : BALL_TOUCH_GAIN;
          const tx = pl.pos.x + fx * ahead;
          const tz = pl.pos.z + fz * ahead;
          const pvx = pl.vel.x, pvz = pl.vel.z;
          let wvx = pvx + (tx - dr.pos.x) * pull;
          let wvz = pvz + (tz - dr.pos.z) * pull;
          const wv = Math.hypot(wvx, wvz);
          const cap = Math.hypot(pvx, pvz) + BALL_TOUCH_LEAD;
          if (wv > cap && wv > 1e-6) { wvx *= cap / wv; wvz *= cap / wv; }
          const k = Math.min(1, BALL_TOUCH_MATCH * dt);
          dr.vel.x += (wvx - dr.vel.x) * k;
          dr.vel.z += (wvz - dr.vel.z) * k;
        }
      }
    }

    // ...and the holders' own gravity, which never stops: an item that has room under it falls.
    for (const c of [...this.pockets, this.bag.box]) stepFall(c, dt);

    if (this.editorOpen) {
      this.cine = Math.min(1, this.cine + dt / 0.75);
      this.positionItems();
      // ...and the board and the labels are re-hung on him every frame: the camera is swinging and
      // he is breathing, so a position computed once at `render` would slide off the pocket.
      this.layout();
      // ...and the one thing in the editor that is on a CLOCK (see `deny`): a container that has
      // just refused something is still shaking, and `layout` does not know about it.
      this.denyFrame(dt);
    } else {
      this.cine = Math.max(0, this.cine - dt / 0.35);
    }
    if (this.quickOpen) this.positionItems();
    this.updatePrompt();
  }

  updatePrompt() {
    if (this.editorOpen || this.quickOpen || !this.promptEl) {
      if (this.promptEl) this.promptEl.classList.add("hidden");
      return;
    }
    const p = this.player.pos;
    const bagD = Math.hypot(this.bag.pos.x - p.x, this.bag.pos.z - p.z);
    let text = null;
    if (this.ride) {
      // RIDING (session 200): the whole vocabulary of the board, in the order a player wants to find
      // it. The two buttons that are NOT here are the ones the board does not own (the chain and the
      // grab are both refused while riding), and the two keys the line names are the two the brief
      // asked for by name (the slide and the dive, in their board forms).
      text = "[E] STEP OFF \u00b7 [M1] TRICK \u00b7 [M2] MANUAL \u00b7 [SPACE] OLLIE \u00b7 [SHIFT] POWERSLIDE \u00b7 [F] BOMB";
    } else if (this.bag.tote) {
      // ...and in his arms, the two mouse buttons are the two throws (see `throwFromHands`).
      text = this.bag.broken ? "[E] PUT DOWN" : "[M1] THROW · [M2] SLAM · [E] PUT DOWN";
    } else if (this.hands) {
      // A FULL HAND (session 179 — see "THE HANDS"). The line has to agree with `preFrame`'s own
      // rule, so it asks the same question: E here is the bag's board when the duffel is in reach
      // and "set it down" when it is not.
      //
      // ...and since session 189 it also names M2 for the one thing a hand can hold that owns the
      // RIGHT button (the ball — see `takeM2`): M1 throws it, M2 SLAMS it into the deck, and E is
      // still the way back to empty-handed.
      const nearBag = !this.bag.worn && !this.bag.broken && bagD < 2.8;
      const slam = (ITEM_DEFS[this.hands.item.kind] || {}).takeM2 ? " \u00b7 [M2] SLAM" : "";
      const hand = "[M1] THROW" + slam;
      text = nearBag ? "[E] CHECK BAG \u00b7 " + hand : "[E] PUT DOWN \u00b7 " + hand;
    } else {
      // ...and the prompt follows `interact`'s own rule (session 178): whichever of the two — a loose
      // prop at your feet, or the duffel — is NEARER is the one E means, so the line agrees with the
      // press. (Before the ball there was only ever one of them to say.)
      //
      // SESSION 189 asks E's question of the props E can actually mean: a prop that asks for the RIGHT
      // button (`takeM2` — the ball) is skipped here and named on its own clause below, at
      // `BALL_TAKE_R`, so the line the player reads is the line the press will do — "[M2] PICK UP" on
      // a ball, "[E] TAKE ..." on anything else, and no "[E] TAKE SOCCER BALL" anywhere any more.
      let bestD = 2.6;
      let m2D = Infinity;
      let eTxt = null;
      for (const d of this.drops) {
        const dd = Math.hypot(d.pos.x - p.x, d.pos.z - p.z);
        if ((ITEM_DEFS[d.item.kind] || {}).takeM2) {
          if (dd < m2D) m2D = dd;
          continue;
        }
        if (dd < bestD) {
          bestD = dd;
          // ...and the prompt says so when what is lying there is ruined — a pocket has room for a
          // broken key, but nobody should have to pick one up to find that out.
          eTxt = "[E] TAKE " + d.item.name + (d.item.broken ? " (BROKEN)" : "");
        }
      }
      if (!this.bag.worn && bagD < TOTE_REACH && (!eTxt || bagD <= bestD)) {
        // E on its own still opens the duffel's board; E AND the right button TOGETHER take it up in
        // both hands (see `takeInHands`) — so both are named here.
        eTxt = this.bag.broken ? "[E] BAG — BROKEN" : "[E] CHECK BAG · [E + M2] CARRY";
      }
      // ...AND THE BOARD IS ITS OWN CLAUSE, AHEAD OF E'S OWN (session 200): `interact` asks for one
      // before it asks anything else, so the line has to say so first, or a player standing on a board
      // reads "[E] CHECK BAG" and steps onto it instead. `boardInReach` is the caller, so the reach is
      // the press's own number rather than a second copy of it.
      const board = this.boardInReach();
      // ...and the two clauses are joined rather than one replacing the other: the two buttons and
      // their meanings are different buttons on the same frame, so a board at his feet, a prop and the
      // duffel's board in reach all have to be able to stand.
      const parts = [];
      if (board) parts.push("[E] RIDE \u00b7 [M2] PICK UP");
      else if (eTxt) parts.push(eTxt);
      if (!board && m2D < BALL_TAKE_R) parts.push("[M2] PICK UP");
      text = parts.length ? parts.join(" \u00b7 ") : null;
    }
    // ...and THE SHOOT (session 180): with the ball at his feet the left button is the strike, so the
    // line has to say so. It APPENDS rather than replaces, because E and M1 mean different things on
    // the same frame — the ball can be at his feet while the duffel's board is the E in reach — so
    // both halves of the line have to be able to stand together.
    if (!this.hands && !this.bag.tote && this.ballUnderControl()) {
      // ...and since session 198 the line says HOW: the button is a HOLD now (a tap is a pass and a
      // full charge is a screamer — see `shootBegin`), so the prompt has to ask for the hold or a
      // player who taps it will never find the rest of the band.
      text = text ? text + " \u00b7 [M1] SHOOT (HOLD TO CHARGE)" : "[M1] SHOOT (HOLD TO CHARGE)";
    }
    if (text) {
      // ...and the SAME STRING is not written again. `#interactPrompt` is a tagged host (it is in
      // tagtext.js's `SEL`), and this method runs every frame the prompt could be up — so a write here
      // is not a text update, it is the mutation observer seeing the host's text node move, throwing
      // away its hand-set letter spans and rebuilding them, `getComputedStyle` included. Measured on
      // the live page: the prompt was re-tagged on **every frame** (82 rebuilds in 82 game frames,
      // 164 `getComputedStyle` reads), and each of those frames carried a forced layout — LoAF put
      // **28-32 ms** of forced style-and-layout inside the game's own callback, on frames that ran
      // 51-68 ms. The prompt only ever says one of a handful of things, so the guard is the whole cost
      // of standing next to the duffel bag: nothing at all.
      if (this._promptText !== text) {
        this._promptText = text;
        this.promptEl.textContent = text;
      }
      this.promptEl.classList.remove("hidden");
    } else this.promptEl.classList.add("hidden");
  }

  // ---- the head --------------------------------------------------------------------------
  // The editor has the mouse, so the body uses it: the head tracks the cursor (and the chest
  // follows a little, which is what actually sells "he is looking down at his pockets").
  //
  // THE SIGN — and it is a SIGN, not a taste. `mouse.x` is +1 at the RIGHT edge of the screen, and
  // a positive turn about a bone's own +y carries its +z (the way it looks) toward its +x — which
  // is the character's LEFT, because the rig faces +z with +y up and a right-handed frame puts his
  // left on +x (see `LK` in streetwear.js, and the `_hr/_hu/_hf` basis `bodyPoint` reads off the
  // hip). So the yaw is NEGATED: cursor right, head right. Both of them shipped the other way
  // round, which is exactly why the head looked at whatever was BEHIND what the cursor was on —
  // the user's *"the player looks the inverse of the cursor when im inventory mode ... make him
  // look at the cursor"*. The PITCH needs no such care and never did: a positive x rotation tips
  // the head's forward toward −y, i.e. down, and the cursor being low on the screen is the cursor
  // being down. (Which is also why it is `Math.max(0, …)` on the y: a cursor above the middle is
  // not an invitation to look at the sky, it is just the neutral, where the pockets are.)
  postPlayer() {
    if (!this.editorOpen) return;
    const ud = this.player.charMesh && this.player.charMesh.userData;
    const bones = ud && ud.bones;
    if (!bones || !bones.head) return;
    bones.head.rotation.y -= this.mouse.x * 0.85;
    bones.head.rotation.x += Math.max(0, this.mouse.y) * 0.55 + 0.16;
    if (bones.torso) {
      bones.torso.rotation.y -= Math.max(-1, Math.min(1, this.mouse.x * 0.55));
      bones.torso.rotation.x += Math.max(0, this.mouse.y) * 0.14;
    }
  }

  // ---- the camera --------------------------------------------------------------------------
  // The character's hip, in the world: the datum the whole editor is measured off (the pockets are
  // on the pelvis, and the stations are heights above it).
  hipPoint(out) {
    const ch = this.player.charMesh;
    const ud = ch && ch.userData;
    const hip = ud && ud.bones && ud.bones.hips;
    if (hip) return hip.getWorldPosition(out);
    return out.set(this.player.pos.x, this.player.pos.y + 0.45, this.player.pos.z);
  }

  viewFor(key) {
    const pl = this.player;
    const p = pl.pos;
    if (key === "bag" && !this.bag.worn) {
      const b = this.bag.pos;
      // A bag on the deck is framed on its own: the camera drops to the duffel's own height and the
      // aim is pushed off his centre, so the bag and the board hung on it both sit clear of the body
      // standing behind it. The stand is measured off the DUFFEL'S OWN base (`b.y`) rather than off
      // the world floor, so a bag left on a tower deck frames just like one left in the street.
      return {
        cx: b.x,
        cz: b.z,
        yaw: this.bag.yaw + 0.45,
        dist: 1.55,
        cy: b.y + BAG_CAM_UP,
        lateral: 0.5,
        lx: b.x,
        ly: b.y + 0.34,
        lz: b.z,
      };
    }
    const v = VIEWS[key] || VIEWS.left;
    const f = pl.facing;
    const hy = this.hipPoint(_hip).y;
    const rx = Math.cos(f);
    const rz = -Math.sin(f);
    const fx = Math.sin(f);
    const fz = Math.cos(f);
    return {
      cx: p.x,
      cz: p.z,
      yaw: f + v.dyaw,
      dist: v.dist,
      cy: hy + (v.cam || CAM_UP) * this.bodyDatum(),
      lx: p.x + rx * v.look.x + fx * v.look.z,
      ly: hy + v.look.y,
      lz: p.z + rz * v.look.x + fz * v.look.z,
    };
  }

  // How high the hip stands on THIS body, in world units: the datum every station above is measured
  // from (see the note above `VIEWS`). Taken off the rig — the hip bone's own height over his feet —
  // and NOT off the hip's live world y, which is what used to hoist the editor's camera whenever the
  // editor was opened upstairs. Falls back to the standing hip's documented height for the
  // placeholder body (the model was refused and there is no rig to measure).
  bodyDatum() {
    const ch = this.player.charMesh;
    const ud = ch && ch.userData;
    const hip = ud && ud.bones && ud.bones.hips;
    if (ch && hip) {
      hip.getWorldPosition(_hp);
      ch.getWorldPosition(_bodyV);
      const d = _hp.y - _bodyV.y;
      if (d > 0.001) return d;
    }
    return BODY_DATUM;
  }

  applyCamera(camera, dt) {
    this.camera = camera;
    const c = Math.max(0, Math.min(1, this.cine));
    if (c <= 0.002) return;
    const ce = c * c * (3 - 2 * c);
    const v = this.viewFor(this.focusKey);
    // Shortest way round to the holder's side of the body.
    if (!Number.isFinite(this.swirl)) this.swirl = v.yaw;
    let d = v.yaw - this.swirl;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.swirl += d * Math.min(1, dt * 3.6);
    const tx = v.cx + Math.sin(this.swirl) * v.dist;
    const tz = v.cz + Math.cos(this.swirl) * v.dist;
    const ty = v.cy;
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) return;
    camera.position.x += (tx - camera.position.x) * ce;
    camera.position.y += (ty - camera.position.y) * ce;
    camera.position.z += (tz - camera.position.z) * ce;
    // ...and the aim: a slerp between wherever the chase camera was pointing and the holder. A
    // `lateral` view slides the aim sideways instead, which is how a subject is parked off-centre
    // (the camera's own right is (cos yaw, 0, -sin yaw)).
    const lo = v.lateral || 0;
    this._look.set(v.lx + Math.cos(this.swirl) * lo, v.ly, v.lz - Math.sin(this.swirl) * lo);
    this._m4.lookAt(camera.position, this._look, UP);
    this._q.setFromRotationMatrix(this._m4);
    camera.quaternion.slerp(this._q, ce);
  }

  // ---- the body the editor is hung on ------------------------------------------------------
  // Body-space → world for `key`; `dir` asks for the holder's NAME direction instead of its spot.
  // The pocket anchors are hung off the LIVE HIP BONE (`bones.hips`) rather than off `player.pos`:
  // the rig is built in its own units and scaled into the world on the way in, so the bone is both
  // the correct origin and the correct orientation — a pocket then rides the pelvis through every
  // breath and lean of the idle. The bag on the deck is not a patch of him at all: it is its own
  // prop, sitting wherever it was thrown, and it reads its place straight off `bag.pos`.
  bodyPoint(key, out, dir) {
    const pl = this.player;
    const onBody = key === "bag" ? this.bag.worn : true;
    if (!onBody) {
      if (dir) return out.set(0.2, 0.9, -0.36).normalize();
      return out.set(this.bag.pos.x, this.bag.pos.y + 0.32, this.bag.pos.z);
    }
    const b = BODY[key] || BODY.back;
    const v = dir ? b.name : b.at;
    const ch = pl.charMesh;
    const ud = ch && ch.userData;
    const hip = ud && ud.bones && ud.bones.hips;
    if (hip) {
      hip.updateWorldMatrix(true, false);
      hip.matrixWorld.decompose(_hp, _hq, _hs);
      _hr.set(1, 0, 0).applyQuaternion(_hq); // the rig's own +x — the character's LEFT (see `LK`)
      _hu.set(0, 1, 0).applyQuaternion(_hq);
      _hf.set(0, 0, 1).applyQuaternion(_hq);
      if (dir) {
        return out
          .set(0, 0, 0)
          .addScaledVector(_hr, v[0])
          .addScaledVector(_hu, v[1])
          .addScaledVector(_hf, v[2])
          .normalize();
      }
      const s = _hs.y;
      return out
        .copy(_hp)
        .addScaledVector(_hr, v[0] * s)
        .addScaledVector(_hu, v[1] * s)
        .addScaledVector(_hf, v[2] * s);
    }
    // No rig in the scene (the model was refused): the body's own axes straight off `facing`.
    const f = pl.facing;
    const rx = Math.cos(f);
    const rz = -Math.sin(f);
    const fx = Math.sin(f);
    const fz = Math.cos(f);
    if (dir) return out.set(rx * v[0] + fx * v[2], v[1], rz * v[0] + fz * v[2]).normalize();
    const p = pl.pos;
    return out.set(p.x + rx * v[0] + fx * v[2], p.y + 0.45 + v[1], p.z + rz * v[0] + fz * v[2]);
  }

  // World → CSS pixels through the lens that is on screen right now. Null when the point is behind
  // it: a point behind a perspective camera projects MIRRORED rather than clamped, and one label
  // flung to the wrong corner is worse than one label that isn't there.
  toScreen(v, out) {
    const cam = this.camera;
    if (!cam) return null;
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    if (_tmp.copy(v).sub(cam.position).dot(_fwd) < 0.15) return null;
    _tmp.copy(v).project(cam);
    out.x = (_tmp.x * 0.5 + 0.5) * this.vw;
    out.y = (-_tmp.y * 0.5 + 0.5) * this.vh;
    return out;
  }

  // ---- the layout: the board ON the body, the names on a ring -------------------------------
  // Runs every frame the editor is open (from `positionItems`). The focused holder's board is
  // pinned to the patch of him it lives on — so the teal box really is on the pocket — and every
  // name is pushed out along its own body-space direction, with its arrow head turned to aim back
  // at the part: the ring turns with the camera instead of being four fixed screen slots. The
  // focused holder keeps its name on the ring too (highlighted), because that label is what points
  // the eye at the board it just opened.
  layout() {
    if (!this.stageEl || !this.camera) return;
    const W = (this.vw = window.innerWidth);
    const H = (this.vh = window.innerHeight);
    this.camera.updateMatrixWorld();
    const ring = Math.max(74, Math.min(172, Math.min(W, H) * 0.3));
    // The ring's spacing and the de-overlap both need to know how big a name is — read HERE rather
    // than at `render`, where the stage is still `display: none` and every rect comes back a zero.
    // Re-read when the window changes width, since the phone rules change the type size.
    // A zero in the cache means the last read happened while the stage was still dark, so it is
    // treated the same as a miss and read again rather than trusted.
    if (!this._tagW || !this._cardSize || !this._cardSize.w || this._tagWvw !== W) this.measureTags(W);
    const card = this.stageEl.querySelector(".invCard");
    this._cardRect = null;
    if (card) {
      const a = this.toScreen(this.bodyPoint(this.focusKey, _a), _s1);
      if (a) {
        card.style.left = a.x + "px";
        card.style.top = a.y + "px";
        const sz = this._cardSize;
        if (sz) this._cardRect = { x: a.x, y: a.y, w: sz.w, h: sz.h };
      }
    }
    _ring.length = 0;
    for (const tag of this.stageEl.querySelectorAll(".invTag")) {
      const key = tag.dataset.card;
      const a = this.toScreen(this.bodyPoint(key, _a), _s1);
      // The push direction is taken a little way along the holder's own name axis, so it is a real
      // direction on screen rather than the sliver between two nearly-identical projected points.
      this.bodyPoint(key, _b, true).multiplyScalar(0.45).add(_a);
      const d = this.toScreen(_b, _s2);
      if (!a || !d) {
        tag.style.visibility = "hidden";
        continue;
      }
      tag.style.visibility = "";
      // The anchor is COPIED: `_s1` is a shared scratch vector, so every name hanging its ring off
      // that one object would be circling whichever body part happened to be projected last.
      _ring.push({ tag, a: { x: a.x, y: a.y }, th: Math.atan2(d.y - a.y, d.x - a.x), x: 0, y: 0 });
    }
    this.placeRing(ring, W, H);
    for (const it of _ring) {
      const a = it.a;
      const tag = it.tag;
      tag.style.left = it.x + "px";
      tag.style.top = it.y + "px";
      const ax = a.x - it.x;
      const ay = a.y - it.y;
      const L = Math.hypot(ax, ay) || 1;
      const ux = ax / L;
      const uy = ay / L;
      // The arrow head rides its own name's shoulder and points along the bearing to the part: it is
      // slid out just far enough to clear the label's own box (the board under the name makes that
      // box taller on the side the arrow leaves by, so the clear distance is measured against the
      // box's support along the bearing rather than against half its height). A head floating alone
      // out by the pocket belongs to no name; one on the name's shoulder names the part it points at.
      const s = this._tagSize && this._tagSize.get(tag);
      const hw = (s ? s.w : 150) * 0.5 + 9;
      const hh = (s ? s.h : 24) * 0.5 + 9;
      const support = Math.min(
        Math.abs(ux) > 1e-3 ? hw / Math.abs(ux) : 1e4,
        Math.abs(uy) > 1e-3 ? hh / Math.abs(uy) : 1e4
      );
      const slide = Math.max(0, Math.min(L - 10, support));
      const arrow = tag.querySelector(".invArrowSlot");
      if (arrow) {
        const ang = (Math.atan2(ay, ax) * 180) / Math.PI;
        arrow.style.transform =
          "translate(" + (ux * slide).toFixed(1) + "px," + (uy * slide).toFixed(1) + "px) rotate(" + ang.toFixed(1) + "deg)";
      }
    }
    _ring.length = 0;
  }

  // The widest name, and each name's own box — cached until the next `render` or a resize.
  measureTags(W) {
    this._tagWvw = W;
    this._tagW = 0;
    this._tagSize = this._tagSize || new Map();
    this._tagSize.clear();
    for (const tag of this.stageEl.querySelectorAll(".invTag")) {
      const r = tag.getBoundingClientRect();
      this._tagSize.set(tag, { w: r.width, h: r.height });
      const nm = tag.querySelector(".invName");
      if (nm) this._tagW = Math.max(this._tagW, nm.getBoundingClientRect().width);
    }
    const card = this.stageEl.querySelector(".invCard");
    if (card) {
      const r = card.getBoundingClientRect();
      this._cardSize = { w: r.width, h: r.height };
    }
  }

  // Where each name sits, in two passes.
  //
  // FIRST ON THE CIRCLE. Two of the four holders are on the near side of him and two on the far, so
  // their name bearings bunch up (the left pocket and the seat both push up-and-left from behind).
  // Sorted round the circle and relaxed apart by the arc a name actually needs, they come out as the
  // ring the concept draws — each name at its own bearing, never on top of another.
  //
  // THEN ON THE SCREEN. The circle cannot see the frame's edge, and a duffel on the deck can push
  // all three pocket names up against the top of it at once; whatever the clamp then shoves together
  // is separated here, along the shallower axis (names are long and thin, so that is nearly always
  // vertical), with the shortfall of a movement the edge blocked handed to the other name. The board
  // is furniture in this pass: it never moves, so a name that lands on it is pushed off it.
  //
  // The arrows keep the true bearing either way: each one is aimed from wherever its name ENDED UP
  // at the part itself.
  placeRing(ring, W, H) {
    if (_ring.length > 1) {
      const sorted = _ring.slice().sort((x, y) => x.th - y.th);
      const n = sorted.length;
      const gap = Math.max(0.62, Math.min(1.6, ((this._tagW || 140) + 14) / ring));
      for (let pass = 0; pass < 40; pass++) {
        let moved = false;
        for (let i = 0; i < n; i++) {
          const a1 = sorted[i];
          const b1 = sorted[(i + 1) % n];
          let g = b1.th - a1.th;
          if (i === n - 1) g += Math.PI * 2;
          if (g < gap) {
            const push = (gap - g) * 0.5;
            a1.th -= push;
            b1.th += push;
            moved = true;
          }
        }
        if (!moved) break;
      }
    }
    const sizes = this._tagSize;
    const sizeOf = (t) => (sizes && sizes.get(t)) || { w: 150, h: 24 };
    // Each name is a long, thin box, so the frame has to hold it by its own HALF-WIDTH rather than
    // by its centre: the clamp margins are that half-size plus a little air (a bag on the deck can
    // put the pockets well off the left edge, and a label clamped by its centre would hang half of
    // itself out of the picture).
    for (const it of _ring) {
      const s = sizeOf(it.tag);
      const hw = s.w * 0.5 + 10;
      const hh = s.h * 0.5 + 8;
      it.loX = Math.min(hw, W * 0.5);
      it.hiX = Math.max(it.loX, W - hw);
      it.loY = Math.min(hh, H * 0.5);
      it.hiY = Math.max(it.loY, H - hh);
      it.x = Math.max(it.loX, Math.min(it.hiX, it.a.x + Math.cos(it.th) * ring));
      it.y = Math.max(it.loY, Math.min(it.hiY, it.a.y + Math.sin(it.th) * ring));
    }
    const split = (A, B, axis, need) => {
      const g = B[axis] - A[axis];
      const u = g >= 0 ? 1 : -1;
      const d = need * 0.5 + 0.5;
      const alo = axis === "y" ? A.loY : A.loX;
      const ahi = axis === "y" ? A.hiY : A.hiX;
      const blo = axis === "y" ? B.loY : B.loX;
      const bhi = axis === "y" ? B.hiY : B.hiX;
      const a0 = A[axis];
      A[axis] = Math.max(alo, Math.min(ahi, a0 - u * d));
      const got = a0 - A[axis];
      const b0 = B[axis];
      B[axis] = Math.max(blo, Math.min(bhi, b0 + (2 * d - got)));
      const resid = 2 * d - got - (B[axis] - b0);
      if (resid > 1e-3) A[axis] = Math.max(alo, Math.min(ahi, A[axis] - resid));
    };
    const card = this._cardRect;
    for (let pass = 0; pass < 12; pass++) {
      let moved = false;
      for (let i = 0; i < _ring.length; i++) {
        for (let j = i + 1; j < _ring.length; j++) {
          const A = _ring[i];
          const B = _ring[j];
          const sa = sizeOf(A.tag);
          const sb = sizeOf(B.tag);
          const dx = B.x - A.x;
          const dy = B.y - A.y;
          const ox = (sa.w + sb.w) * 0.5 + 16 - Math.abs(dx);
          const oy = (sa.h + sb.h) * 0.5 + 8 - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          // A pair that is shoved together by the frame's own edge (a duffel on the deck can stack
          // all three names against one side at once) would come apart and be pushed straight back
          // onto each other by a split move — so whichever of the two the edge refuses to move hands
          // its shortfall to its partner, and the two separate by the full amount either way.
          if (oy <= ox) split(A, B, "y", oy);
          else split(A, B, "x", ox);
        }
      }
      if (card) {
        for (const it of _ring) {
          const s = sizeOf(it.tag);
          const dx = it.x - card.x;
          const dy = it.y - card.y;
          const ox = (s.w + card.w) * 0.5 + 12 - Math.abs(dx);
          const oy = (s.h + card.h) * 0.5 + 12 - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          const tx = card.x + (dx >= 0 ? 1 : -1) * ((s.w + card.w) * 0.5 + 12);
          const ty = card.y + (dy >= 0 ? 1 : -1) * ((s.h + card.h) * 0.5 + 12);
          const pushX = () => { it.x = Math.max(it.loX, Math.min(it.hiX, tx)); };
          const pushY = () => { it.y = Math.max(it.loY, Math.min(it.hiY, ty)); };
          const okX = tx >= it.loX - 0.5 && tx <= it.hiX + 0.5;
          const okY = ty >= it.loY - 0.5 && ty <= it.hiY + 0.5;
          // The board is wide and the frame can be narrow: the shallower axis is the polite one to
          // leave by, but on a phone the frame may not have the room for it, so an axis that can
          // actually clear the board is taken over one that only clamps against the edge.
          if (oy <= ox) {
            if (okY) pushY();
            else if (okX) pushX();
            else pushY();
          } else {
            if (okX) pushX();
            else if (okY) pushY();
            else pushX();
          }
        }
      }
      if (!moved) break;
    }
  }

  // ---- the editor's DOM --------------------------------------------------------------------
  render() {
    if (!this.editorOpen) return;
    // A SELECTION THAT IS NO LONGER IN A HOLDER IS NOT A SELECTION. The selected item can leave
    // the pockets between two renders — a drag out of one, a break, a toss — and the rim would
    // then be drawn on nothing (and the hint line would name a thing that is lying in the street),
    // so the claim is re-checked here, in the one place every re-render goes through.
    if (this.sel && !this.holderOf(this.sel.item)) this.sel = null;
    const cards = this.visibleCards();
    if (!cards.some((c) => c.key === this.focusKey)) this.focusKey = cards[0].key;
    const focus = this.containerByKey(this.focusKey);
    this.invTitle.textContent = focus.name;
    const changed = this._lastFocus !== this.focusKey;
    this._lastFocus = this.focusKey;
    this.stageEl.innerHTML = "";
    this._tagW = 0; // the tags are about to be rebuilt: remeasure them in `layout`
    // The board, and then a name for every OTHER holder. The focused holder wears the board itself,
    // hung on its own patch of him, so giving it a label too would only put type on top of the box
    // the concept draws. Positions are not set here: `layout` pins everything to the body every
    // frame (which is why nothing below writes `style.left`).
    const card = this.cardEl(focus, true);
    if (changed) card.classList.add("invPop");
    this.stageEl.appendChild(card);
    for (const c of cards) {
      if (c === focus) continue;
      this.stageEl.appendChild(this.tagEl(c));
    }
    this.positionItems();
    this.layout();
    this.updateHint();
  }

  themeVars(el, t) {
    el.style.setProperty("--fabric", t.fabric);
    el.style.setProperty("--fabric2", t.fabric2);
    el.style.setProperty("--edge", t.edge);
    el.style.setProperty("--stitch", t.stitch);
    el.style.setProperty("--ink", t.ink);
    el.style.setProperty("--tag", t.tag);
  }

  gridEl(c, mode) {
    const grid = document.createElement("div");
    grid.className = "invGrid";
    grid.dataset.card = c.key;
    grid.style.gridTemplateColumns = "repeat(" + c.w + ", var(--cell))";
    grid.style.gridTemplateRows = "repeat(" + c.h + ", var(--cell))";
    for (let i = 0; i < c.w * c.h; i++) {
      const cell = document.createElement("div");
      cell.className = "invCell";
      grid.appendChild(cell);
    }
    for (const p of c.items) grid.appendChild(this.itemEl(p, c, mode));
    // THE OTHER HALF OF THE CLICK (see `onGridDown`). A press that lands on the board ITSELF — a
    // well, or the board's own frame — is a press on empty space, and with something SELECTED that
    // is a placement: it goes to the cell under the pointer. It does not swallow the press when
    // nothing is selected, so an ordinary press on a label's little board still reaches the label
    // and brings that holder up, exactly as it always did.
    grid.addEventListener("pointerdown", (e) => this.onGridDown(e, c, grid));
    return grid;
  }

  cardEl(c, focus) {
    const card = document.createElement("div");
    card.className = "invCard" + (focus ? " focus" : "") + " invKind-" + c.kind;
    card.dataset.card = c.key;
    this.themeVars(card, c.theme);
    // The board is the only label the focused holder gets, so what it is called has to be said
    // here — and a bag says how much of it is left besides.
    const head = document.createElement("div");
    head.className = "invHead";
    const nm = document.createElement("span");
    nm.className = "invCName";
    nm.textContent = c.name;
    head.appendChild(nm);
    if (c.key === "bag") {
      const hp = document.createElement("span");
      hp.className = "invHp" + (this.bag.broken ? " dead" : "");
      hp.textContent = this.bag.broken ? "BROKEN" : Math.round((this.bag.hp / this.bag.maxHp) * 100) + "%";
      head.appendChild(hp);
    }
    card.appendChild(head);
    const wrap = document.createElement("div");
    wrap.className = "invWrap";
    wrap.appendChild(this.gridEl(c, "board"));
    card.appendChild(wrap);
    if (c.key === "bag") {
      const row = document.createElement("div");
      row.className = "invBtns";
      const wear = document.createElement("button");
      wear.className = "invBtn";
      wear.textContent = this.bag.worn ? "TAKE OFF" : this.bag.tote ? "ONTO BACK" : "WEAR";
      // A broken bag is refused by `toggleWear` anyway, so the button says so rather than looking
      // like it might do something.
      wear.disabled = this.bag.broken;
      wear.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleWear();
      });
      row.appendChild(wear);
      card.appendChild(row);
    } else if (c.items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "invEmpty";
      empty.textContent = "EMPTY";
      card.appendChild(empty);
    }
    return card;
  }

  // `mode` is what the board this tile is drawn on IS, and it is the whole of the tile's manners:
  //
  //   "board"  the holder being edited. It is the only board whose items can be DRAGGED, and its
  //            items carry their own health bar (it is the editor's one info readout).
  //   "tag"    one of the little boards hanging off a label. A press on a tile here brings that
  //            holder UP and takes the item with it (see `onTagItemDown`) — a label is a way to
  //            reach a holder, not a place to work in.
  //   "quick"  a quick-menu chip. Inert: that menu is 1 / 2 and one second long by design, and
  //            `#quickInv` is `pointer-events: none` besides.
  //
  // ...and every tile but a chip's also wears a HIT PAD: a transparent `<i>` laid a few pixels
  // proud of the tile on all four sides. It is invisible, and it is the point — the item kind this
  // game has that reads as "just an icon" is a 1 x 1, which is ONE cell (30 px on the desk, 26 on
  // a phone) and therefore the smallest thing on the board; the pad gives every tile a target a
  // few pixels bigger than its picture without touching the pitch `positionItems` places by. It
  // sits last in the tile, so it is what the pointer lands on and the events bubble straight back
  // to the tile, exactly as if the tile itself were bigger.
  itemEl(p, c, mode) {
    const el = document.createElement("div");
    el.className = "invItem" + (p.item.broken ? " broken" : "");
    if (this.sel && this.sel.item === p.item) el.classList.add("sel");
    el.dataset.id = p.item.id;
    el.dataset.card = c.key;
    el.style.setProperty("--item", p.item.color);
    el.style.color = p.item.ink;
    // ...and how far gone it is, as a number the CSS reads (see `.invItem` in index.html): the tile
    // desaturates and darkens with it and grows its cracks, so the board says at a glance which
    // thing in there is about to go, and the `broken` class is only the last step of the same ramp
    // rather than a state that arrives out of nowhere.
    el.style.setProperty("--dmg", propDamageK(p.item).toFixed(3));
    const glyph = document.createElement("span");
    glyph.className = "invGlyph";
    glyph.innerHTML = p.item.w >= 2 || p.item.h >= 2 ? p.item.short : glyphFor(p.item.kind);
    el.appendChild(glyph);
    if (mode !== "quick") {
      const hp = document.createElement("div");
      hp.className = "hp";
      const bar = document.createElement("i");
      bar.style.width = Math.round((p.item.hp / p.item.maxHp) * 100) + "%";
      bar.style.background = p.item.hp / p.item.maxHp > 0.5 ? "#6fe08a" : p.item.hp / p.item.maxHp > 0.25 ? "#f0c040" : "#f0614a";
      hp.appendChild(bar);
      el.appendChild(hp);
    }
    if (mode === "board") el.addEventListener("pointerdown", (e) => this.onItemDown(e, c.key, p.item));
    else if (mode === "tag") el.addEventListener("pointerdown", (e) => this.onTagItemDown(e, c.key, p.item));
    if (mode !== "quick") {
      const pad = document.createElement("i");
      pad.className = "invPad";
      // The pad lives INSIDE the tile, so it is laid out in the tile's own frame and wears the
      // tile's own lean: a `rotateY(yaw)` takes `cos(yaw)` off everything measured across the
      // tile, and a 1 x 1 leans up to 35°. So the horizontal inset is divided by that cosine —
      // otherwise the pad's slack shrinks by the same factor the tile did and a leaned icon gains
      // two pixels of target instead of four.
      const slack = mode === "tag" ? PAD_HIT_TAG : PAD_HIT;
      const across = Math.round(slack / Math.max(0.5, Math.cos(p.item.yaw || 0)));
      pad.style.top = -slack + "px";
      pad.style.bottom = -slack + "px";
      pad.style.left = -across + "px";
      pad.style.right = -across + "px";
      el.appendChild(pad);
    }
    return el;
  }

  // ---- the name that hangs off a holder -----------------------------------------------------
  // The editor's labels are the concept's own language: flat heavy type with a hard ink rim and a
  // chunky arrow head aimed at the part it names (`layout` does the aiming). Each one is also a DROP
  // TARGET — drag an item at the name and it goes to that holder — and carries its own little board,
  // so you can see what is in there before you aim at it. Only the holders that are NOT focused get
  // a label: the focused one is wearing the board instead.
  tagEl(c) {
    const el = document.createElement("div");
    el.className = "invTag invKind-" + c.kind + " invTarget";
    el.dataset.card = c.key;
    el.dataset.anchor = c.anchor;
    this.themeVars(el, c.theme);
    const nm = document.createElement("span");
    nm.className = "invName";
    nm.textContent = c.name;
    el.appendChild(nm);
    const grid = this.gridEl(c, "tag");
    grid.classList.add("mini");
    el.appendChild(grid);
    const arrow = document.createElement("i");
    arrow.className = "invArrowSlot";
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 26 22");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", "M1.6 1.6 L24.4 11 L1.6 20.4 L7.6 11 Z");
    svg.appendChild(path);
    arrow.appendChild(svg);
    el.appendChild(arrow);
    // A LABEL IS TWO THINGS AT ONCE, depending on whether anything is SELECTED (see `select`):
    // with a selection live, the press is the click half of the drop — the selected item moves to
    // the holder the label names, and that holder comes up so you can see it arrive. Otherwise the
    // label does the one thing a label has always done and brings its holder up.
    el.addEventListener("pointerdown", (e) => {
      if (this.sel && e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        this.moveSelTo(this.containerByKey(c.key), true);
        return;
      }
      this.setFocus(c.key);
    });
    return el;
  }

  setFocus(key) {
    if (this.focusKey === key) return;
    const cards = this.visibleCards();
    if (!cards.some((c) => c.key === key)) return;
    this.focusKey = key;
    if (this.sfx && this.sfx.ui) this.sfx.ui();
    this.render();
  }

  positionItems() {
    const roots = [];
    if (this.editorOpen) roots.push(this.stageEl);
    if (this.quickOpen) roots.push(this.quickEl);
    for (const root of roots) {
      for (const grid of root.querySelectorAll(".invGrid")) {
        const c = this.containerByKey(grid.dataset.card);
        if (!c) continue;
        const cs = getComputedStyle(grid);
        const cell = parseFloat(cs.getPropertyValue("--cell")) || 0;
        const gap = parseFloat(cs.getPropertyValue("--gap")) || 0;
        if (!cell) continue;
        const pitch = cell + gap;
        for (const el of grid.querySelectorAll(".invItem")) {
          const p = c.items.find((q) => String(q.item.id) === el.dataset.id);
          if (!p) continue;
          const y = (p.gy + p.off - p.enter) * pitch;
          el.style.left = p.gx * pitch + "px";
          el.style.top = y + "px";
          el.style.width = p.item.w * pitch - gap + "px";
          el.style.height = p.item.h * pitch - gap + "px";
          el.style.visibility = p.held ? "hidden" : "";
          // The item's OWN Y angle first, then the landing squash on top of it: the lean is part of
          // what the thing is (rolled once in `makeItem`), so a squashed item is a leaned item that
          // is also flat — not an item that has been stood back up.
          let tf = "rotateY(" + (((p.item.yaw || 0) * 180) / Math.PI).toFixed(1) + "deg)";
          if (p.sq > 0.01) tf += " scaleY(" + (1 - p.sq * 0.3).toFixed(3) + ")";
          el.style.transform = tf;
          el.style.opacity = p.enter > 0.01 ? String(Math.max(0.15, 1 - p.enter * 0.6)) : "";
        }
      }
    }
  }

  // ---- the pointer: a press is either a DRAG or a CLICK --------------------------------------
  // THE TWO VERBS, and how they are told apart. Both start with a press on a tile, and the pointer
  // alone decides which one you meant: if it TRAVELS past `DRAG_SLOP` the press is a DRAG (the tile
  // is lifted, a ghost rides the cursor, and the drop rules below decide where it lands); if it
  // never travels it is a CLICK, and a click SELECTS (see `select`).
  //
  // That split is why nothing happens on the press itself. Used to be the tile was hidden and a
  // ghost made the moment the button went down, so a player who was only CLICKING — the obvious
  // first thing to try on a thing you want to pick — watched his key vanish for as long as he held
  // the button and then reappear with nothing to show for it. Now the press is only REMEMBERED,
  // the tile stays under the cursor until the drag is real, and letting go without moving is a
  // first-class verb instead of a no-op.
  onItemDown(e, cardKey, item) {
    if (!this.editorOpen || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const c = this.containerByKey(cardKey);
    const p = c.items.find((q) => q.item === item);
    if (!p) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    this.press = {
      item,
      from: c,
      place: p,
      el,
      sx: e.clientX,
      sy: e.clientY,
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
    };
  }

  // A tap on a LITTLE board (a label's). The label's own press brings that holder up — that is what
  // a label is for — and the tap landed on the item the label is showing, so it does that too and
  // the thing you pointed at is the thing that comes up SELECTED. (Nothing can be dragged from
  // here: a label's board is a window onto a holder, and the one board an item is moved on is the
  // focused one. That is also what used to drop a key into the street — a label's tile was
  // draggable, the press re-rendered the stage under the pointer, and the release then landed on
  // nothing at all, which the drop rules read as "off the boards, toss it".)
  onTagItemDown(e, cardKey, item) {
    if (!this.editorOpen || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.setFocus(cardKey);
    this.select(item);
  }

  // ---- SELECTING, and the two ways a selection is spent ---------------------------------------
  // SELECT: click a tile and it wears a bright rim, and the line at the bottom of the screen names
  // it. Click it again and it lets go. This is the whole reason it exists: a 1 x 1 item is ONE
  // CELL — the smallest thing on any board, and on a phone 26 px of it — and a drag across a screen
  // is a poor way to move a thing you can barely see. Two clicks is not.
  select(item) {
    if (!this.editorOpen) return;
    if (this.sel && this.sel.item === item) this.sel = null;
    else {
      this.sel = { item };
      if (this.sfx && this.sfx.ui) this.sfx.ui();
    }
    this.render();
  }

  // ...which holder an item is in right now. The one read of it, so nothing has to remember: a
  // selection outlives any number of moves, and a move is what changes the answer.
  holderOf(item) {
    for (const c of [...this.pockets, this.bag.box]) if (c.items.some((q) => q.item === item)) return c;
    return null;
  }

  // A placement that has been taken out of its holder (`takeToHands` / `stashInto` / a break) must
  // not be left under a live PRESS or DRAG: both of those hold a `place` and write through it, and
  // a `splice(indexOf(p), 1)` that comes back -1 deletes the LAST item in the holder instead of the
  // one nobody meant to move. This forgets it in the one place it is remembered.
  forgetPlace(place) {
    if (!place) return;
    if (this.press && this.press.place === place) this.press = null;
    if (this.drag && this.drag.place === place) {
      if (this.drag.ghost) this.drag.ghost.remove();
      if (this.hoverTarget) this.hoverTarget.classList.remove("hot");
      this.hoverTarget = null;
      this.armTargets(false);
      this.drag = null;
    }
  }

  // ---- THE DOUBLE-CLICK (session 179) -------------------------------------------------------
  // The user's *"if i double click in my bag or an avable inventory that has the capacility to take
  // the size of the ball then it can if it cant and i double click shake the ui and make it light
  // up with red"*. Two presses on the same container inside `DBL_MS` are one gesture, and which one
  // is decided by what your hands are doing:
  //
  //   * EMPTY-HANDED, and the press landed on a TILE — it comes OUT into your hands (the same lift
  //     `pickup` does off the deck, done from the board);
  //   * otherwise — your hand is full, or the press landed on the board ITSELF — what you are
  //     holding goes INTO that container, if it fits. If it does not, the container SHAKES and
  //     LIGHTS UP RED (`deny`). That is the whole point: a 2 x 2 ball refused by a 1 x 2 pocket has
  //     to feel refused, rather than silently doing nothing.
  //
  // It is caught on the CAPTURE phase of `#invStage` (see the constructor): every tile and every
  // board stops its own press from bubbling, which is what keeps a press on a tile from also being
  // a press on the board behind it, so a gesture that has to be seen everywhere cannot live down
  // there. And it never claims the FIRST press — that one is still an ordinary click, so
  // click-to-select and click-a-board-to-place are untouched.
  onStageDown(e) {
    if (!this.editorOpen || e.button !== 0) return;
    const t = e.target;
    const host = t && t.closest ? t.closest("[data-card]") : null;
    const key = host && host.dataset ? host.dataset.card : null;
    const now = Date.now();
    // Two presses INSIDE `DBL_SLOP` of each other inside `DBL_MS` are one gesture, and the decision
    // is made on the CLICK POINT rather than on the element — see `DBL_SLOP` for why the element
    // the second press lands on cannot be trusted to be the one the first did.
    if (
      this._dblKey && now - this._dblT < DBL_MS &&
      Math.abs(e.clientX - this._dblX) < DBL_SLOP && Math.abs(e.clientY - this._dblY) < DBL_SLOP
    ) {
      const k = this._dblKey;
      this._dblKey = null;
      this._dblT = 0;
      this.onDouble(k, t);
      return;
    }
    this._dblKey = key;
    this._dblT = now;
    this._dblX = e.clientX;
    this._dblY = e.clientY;
  }

  // `key` is the container the FIRST press landed on (the gesture's own subject); `target` is the
  // element the SECOND press landed on, which is only ever consulted for a TILE — and only when
  // that tile is in the same container, so a re-render in between can never make the gesture grab
  // the wrong thing.
  onDouble(key, target) {
    const c = this.containerByKey(key);
    if (!c) return;
    let tileItem = null;
    const host = target && target.closest ? target.closest("[data-card]") : null;
    if (host && host.dataset && host.dataset.card === key) {
      const tile = target.closest(".invItem");
      if (tile) {
        const p = c.items.find((q) => String(q.item.id) === tile.dataset.id);
        tileItem = p ? p.item : null;
      }
    }
    const hand = this.hands ? this.hands.item : null;
    // A tile you are not already holding, double-clicked with an EMPTY hand: it comes OUT.
    if (tileItem && tileItem !== hand && !hand) {
      this.takeToHands(tileItem, c);
      this.updateHint();
      return;
    }
    // Anything else is the STASH — including a tile you double-clicked with a hand already full,
    // which is only the most obvious place to aim.
    this.stashInto(c);
  }

  // Put what is in your hands (or the live selection) into `c` — or refuse loudly. The one door the
  // double-click and the labels' click-to-place both come through.
  stashInto(c) {
    if (!c) return false;
    const item = this.hands ? this.hands.item : (this.sel ? this.sel.item : null);
    if (!item) return false;
    const from = this.holderOf(item);
    if (from === c) return false;
    const f = firstFit(c, item);
    if (!f) {
      this.deny(c.key);
      return false;
    }
    if (from) {
      const p = from.items.find((q) => q.item === item);
      if (p) {
        from.items.splice(from.items.indexOf(p), 1);
        this.forgetPlace(p);
      }
    } else if (this.hands && this.hands.item === item) {
      this.clearHands();
    }
    place(c, item, f.x, f.y, { enter: true });
    this.sel = null;
    if (this.sfx && this.sfx.squeeze) this.sfx.squeeze();
    // ...and the destination comes UP, so the arrival is there to be seen — the same thing a drag
    // onto a label does. (Refusals do not move the view: the board that said no is the one you are
    // looking at, and it is the one that shakes.)
    if (this.visibleCards().some((k) => k.key === c.key)) this.focusKey = c.key;
    this.render();
    return true;
  }

  // THE REFUSAL. The container that said no shakes and lights up red for `DENY_T`, on whichever of
  // its two faces the editor is showing — the board when it is the focused one, its label when it
  // is not — because the refusal has to land on the face you were looking at.
  //
  // The shake is a DAMPED SINE driven here and written onto the element every frame (`applyDeny`),
  // not a CSS keyframe: this environment freezes CSS timelines when the document is not the
  // foreground one (see the note on the rule in index.html), so a keyframed shake can simply never
  // happen. A driven one always does. The RED never needs a clock, so it is a class (`.invDeny`),
  // and the glow rides the driven `filter` because it wants to pulse with the rattle.
  deny(key) {
    if (this.sfx && this.sfx.whiff) this.sfx.whiff();
    this.denyState = { key, t: 0, dur: DENY_T / 1000 };
    this.applyDeny();
  }

  // One frame of it. `t / dur` is the progress, and everything is scaled by the decay so the shake
  // lands rather than stops: three swings and out.
  applyDeny() {
    const d = this.denyState;
    if (!d || !this.stageEl) return;
    const p = Math.min(1, d.t / d.dur);
    const decay = 1 - p;
    const x = Math.sin(p * Math.PI * 7) * 9 * decay;
    const glow = 12 * decay;
    const els = this.stageEl.querySelectorAll('.invCard[data-card="' + d.key + '"], .invTag[data-card="' + d.key + '"]');
    for (const el of els) {
      el.classList.add("invDeny");
      el.style.transform = "translate(-50%, -50%) translateX(" + x.toFixed(2) + "px)";
      el.style.filter = "drop-shadow(0 0 " + glow.toFixed(1) + "px #ff3b30) brightness(" + (1 + decay * 0.5).toFixed(3) + ")";
    }
  }

  denyFrame(dt) {
    const d = this.denyState;
    if (!d) return;
    d.t += dt;
    if (d.t >= d.dur) this.clearDeny();
    else this.applyDeny();
  }

  clearDeny() {
    if (!this.denyState || !this.stageEl) { this.denyState = null; return; }
    for (const el of this.stageEl.querySelectorAll(".invDeny")) {
      el.classList.remove("invDeny");
      el.style.transform = "";
      el.style.filter = "";
    }
    this.denyState = null;
  }

  // WHERE THE SELECTED THING IS. One movement, in one place: out of whatever holder it is in and
  // into `c` at (`gx`,`gy`) — or, with no cell asked for, into the first fit it can have there
  // (which is `firstFit`: bottom rows first, so it comes to rest where it lands).
  moveSel(c, gx, gy) {
    const sel = this.sel;
    if (!sel || !c) return false;
    const from = this.holderOf(sel.item);
    if (!from) {
      this.sel = null;
      this.render();
      return false;
    }
    const p = from.items.find((q) => q.item === sel.item);
    const same = c === from;
    const cell = gx == null ? (firstFit(c, sel.item) || { x: -1, y: -1 }) : { x: gx, y: gy };
    if (cell.x < 0) {
      if (this.sfx && this.sfx.whiff) this.sfx.whiff();
      return false; // no room anywhere: the selection STAYS, so another cell can be tried
    }
    if (same && p.gx === cell.x && p.gy === cell.y) {
      // nothing moved — but the click was spent, so let go of it.
      this.sel = null;
      this.render();
      return true;
    }
    if (!fitsAt(c, sel.item, cell.x, cell.y, same ? p : null)) {
      if (this.sfx && this.sfx.whiff) this.sfx.whiff();
      return false;
    }
    if (!same) from.items.splice(from.items.indexOf(p), 1);
    p.gx = cell.x;
    p.gy = cell.y;
    p.vy = 0;
    p.off = 0;
    if (!same) {
      c.items.push(p);
      if (this.sfx && this.sfx.squeeze) this.sfx.squeeze();
    } else if (this.sfx && this.sfx.ui) {
      this.sfx.ui();
    }
    this.sel = null;
    this.render();
    return true;
  }

  // ...and the same move aimed at a HOLDER rather than at a cell, which is what a click on one of
  // the labels is. `focus` brings the destination up so the arrival is visible.
  moveSelTo(c, focus) {
    if (!this.sel || !c) return;
    const item = this.sel.item;
    if (this.moveSel(c, null, null) && focus && this.visibleCards().some((k) => k.key === c.key)) {
      this.focusKey = c.key;
      this.render();
    } else if (this.sel) {
      // it did not fit: put its holder back up, so the thing that refused it is on screen
      const from = this.holderOf(item);
      if (from && this.visibleCards().some((k) => k.key === from.key)) {
        this.focusKey = from.key;
        this.render();
      }
    }
  }

  // A press on the board ITSELF (a well, or the frame between them) — the click half of the drop.
  // Only claimed when something is selected; otherwise the press is left alone to reach whatever
  // is behind the board.
  onGridDown(e, c, grid) {
    if (!this.editorOpen || e.button !== 0 || !this.sel) return;
    e.preventDefault();
    e.stopPropagation();
    const cs = getComputedStyle(grid);
    const pitch = (parseFloat(cs.getPropertyValue("--cell")) || 0) + (parseFloat(cs.getPropertyValue("--gap")) || 0);
    if (!pitch) return;
    const r = grid.getBoundingClientRect();
    const moved = this.moveSel(c, Math.floor((e.clientX - r.left) / pitch), Math.floor((e.clientY - r.top) / pitch));
    // A label's little board is NOT the board you are working on, so a placement made on one brings
    // that holder up — the same thing its name does — and the arrival is there to be seen.
    if (moved && grid.classList.contains("mini") && this.focusKey !== c.key && this.visibleCards().some((k) => k.key === c.key)) {
      this.focusKey = c.key;
      this.render();
    }
  }

  // The line at the bottom of the screen. It is the HTML's own text (`hintBase`, read once in the
  // constructor, so the markup and the code cannot drift apart) until something is SELECTED, and
  // then it says what is held and what can be done with it — a selection nobody can see is not a
  // selection, and the click-a-board half of the interaction is invisible without being said.
  updateHint() {
    if (!this.invHint) return;
    if (this.sel) {
      this.invHint.textContent =
        "SELECTED: " + this.sel.item.name + " \u00b7 CLICK A BOARD OR A NAME TO PUT IT THERE \u00b7 CLICK IT AGAIN TO LET GO";
    } else if (this.hands) {
      // ...and WHAT IS IN YOUR HANDS, because that is the one thing the editor cannot draw: a
      // carried item is worn on the body, not placed on a board, so without this line the mode would
      // never say what a double-click is about to put away (session 179).
      this.invHint.textContent =
        "IN HANDS: " + this.hands.item.name + " \u00b7 DOUBLE-CLICK A BOARD TO PUT IT THERE \u00b7 DOUBLE-CLICK A TILE TO TAKE IT OUT";
    } else {
      this.invHint.textContent = this.hintBase;
    }
  }

  armTargets(on) {
    for (const el of this.stageEl.querySelectorAll(".invTarget")) el.classList.toggle("armed", on);
  }

  // The press has travelled far enough to be a drag: lift the tile and put the ghost under the
  // cursor. From here on `onDragUp` is a DROP and not a click.
  beginDrag(e) {
    const pr = this.press;
    if (!pr) return;
    this.press = null;
    const p = pr.place;
    // ...and a press whose placement is no longer in the holder it came from — a double-click's
    // stash took it out from under us since (see `forgetPlace`) — is not a press any more.
    if (!pr.from.items.includes(p)) return;
    p.held = true;
    const ghost = pr.el.cloneNode(true);
    ghost.classList.add("drag");
    ghost.classList.remove("sel");
    ghost.style.opacity = "1";
    ghost.style.visibility = "visible";
    // The ghost keeps the item's lean — picked up is not stood up.
    ghost.style.transform = "rotateY(" + (((pr.item.yaw || 0) * 180) / Math.PI).toFixed(1) + "deg)";
    ghost.style.width = pr.el.offsetWidth + "px";
    ghost.style.height = pr.el.offsetHeight + "px";
    ghost.style.left = e.clientX - pr.offX + "px";
    ghost.style.top = e.clientY - pr.offY + "px";
    document.body.appendChild(ghost);
    this.drag = {
      item: pr.item,
      from: pr.from,
      place: p,
      offX: pr.offX,
      offY: pr.offY,
      ghost,
      lastX: e.clientX,
      lastY: e.clientY,
      flingX: 0,
      flingY: 0,
    };
    this.armTargets(true);
    if (this.sfx && this.sfx.ui) this.sfx.ui();
  }

  onDragMove(e) {
    if (this.press) {
      if (Math.hypot(e.clientX - this.press.sx, e.clientY - this.press.sy) > DRAG_SLOP) this.beginDrag(e);
      else return;
    }
    if (!this.drag) return;
    const d = this.drag;
    d.flingX = e.clientX - d.lastX;
    d.flingY = e.clientY - d.lastY;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.ghost.style.left = e.clientX - d.offX + "px";
    d.ghost.style.top = e.clientY - d.offY + "px";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const target = under ? under.closest(".invTarget") : null;
    if (target !== this.hoverTarget) {
      if (this.hoverTarget) this.hoverTarget.classList.remove("hot");
      this.hoverTarget = target;
      if (target) target.classList.add("hot");
    }
  }

  onDragUp(e) {
    if (this.press) {
      // NEVER TRAVELLED: a CLICK. Nothing was lifted and nothing is dropped — the thing under the
      // press is selected, or let go if it was already the selected one.
      const pr = this.press;
      this.press = null;
      this.select(pr.item);
      return;
    }
    if (!this.drag) return;
    const d = this.drag;
    d.place.held = false;
    if (this.hoverTarget) this.hoverTarget.classList.remove("hot");
    this.hoverTarget = null;
    d.ghost.remove();
    this.armTargets(false);
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const target = under ? under.closest(".invTarget") : null;
    const grid = under ? under.closest(".invGrid") : null;
    const from = d.from;
    const p = d.place;
    // ...and the same guard `beginDrag` carries: a drag whose placement has left its holder — a
    // double-click's stash landed while the button was down — has nothing left to move.
    if (!from.items.includes(p)) {
      this.drag = null;
      this.render();
      return;
    }

    if (target && target.dataset.card !== from.key) {
      // AIMED AT ANOTHER HOLDER — the item moves there and drops in from the top.
      const c = this.containerByKey(target.dataset.card);
      from.items.splice(from.items.indexOf(p), 1);
      const f = c ? firstFit(c, d.item) : null;
      if (c && f) {
        place(c, d.item, f.x, f.y, { enter: true });
        if (this.sfx && this.sfx.squeeze) this.sfx.squeeze();
      } else if (c) {
        // No room: it goes back where it came from rather than vanishing.
        place(from, d.item, p.gx, p.gy, { enter: true });
        if (this.sfx && this.sfx.whiff) this.sfx.whiff();
      }
    } else if (grid) {
      const c = this.containerByKey(grid.dataset.card);
      if (!c) return this.finishDrag();
      const cs = getComputedStyle(grid);
      const pitch = (parseFloat(cs.getPropertyValue("--cell")) || 0) + (parseFloat(cs.getPropertyValue("--gap")) || 0);
      const r = grid.getBoundingClientRect();
      const gx = Math.floor((e.clientX - d.offX - r.left) / pitch + 0.5);
      const gy = Math.floor((e.clientY - d.offY - r.top) / pitch + 0.5);
      const same = c === from;
      if (same && gx === p.gx && gy === p.gy) {
        // nothing moved
      } else if (fitsAt(c, d.item, gx, gy, same ? p : null)) {
        if (!same) from.items.splice(from.items.indexOf(p), 1);
        p.gx = gx;
        p.gy = gy;
        p.vy = 0;
        p.off = 0;
        if (!same) c.items.push(p);
        if (this.sfx && this.sfx.ui) this.sfx.ui();
      } else {
        if (this.sfx && this.sfx.whiff) this.sfx.whiff();
      }
    } else {
      // OFF THE BOARDS — it falls out of the pocket and into the world in front of you.
      from.items.splice(from.items.indexOf(p), 1);
      const fling = Math.min(6, Math.hypot(d.flingX, d.flingY) * 0.15);
      this.spawnDrop(d.item, 4.5 + fling, 2.5);
      if (this.sfx && this.sfx.squeezeOut) this.sfx.squeezeOut();
    }
    this.drag = null;
    this.render();
  }

  finishDrag() {
    this.drag = null;
    this.render();
  }
}

export { BAG_HOME };
