// ---------------------------------------------------------------------------
// THE COMMITTED MOVES' CONTACTS (part 8 of the player.js split).
//
// What the three committed moves do when they arrive on a body: THE SLIDE'S
// HIT (the swept line and its wake), THE DIVE LAUNCH (the up-rule and the
// tackle), and THE FRONT LUNGE / BOXCUTTER (the dash's hitbox, its rushed pose
// clock and the kick's landing) — seven methods, verbatim, in a table
// `installContacts` copies onto `Player.prototype`.
//
// A LEAF with respect to player.js: it imports `P` (player/config.js) and nothing
// else — no scratch, no three.js, no math helpers.
// ---------------------------------------------------------------------------
import { P } from "./config.js";
import { SMASH_PLUNGE_V } from "./pose.js";

const contactMethods = {

  // -------------------------------------------------------------------------
  // THE SLIDE'S HIT — the body's mass, the other way.
  //
  // The melee chain strikes at a point in front of a body that has planted itself; a slide does
  // the opposite — it keeps every unit of its speed and goes THROUGH the space, so what the move
  // owns is the LINE the body travelled this frame rather than the spot it ended on. That is the
  // whole reason this is a sweep and not a query: a slide covers most of a body length in one
  // frame, so a point test would step straight over anything between two frames and land the hit
  // only when the body happened to stop next to someone. It is the same argument that makes
  // `moveAndCollide` step its own motion, applied to the other body instead of the wall.
  //
  // Everything caught is flipped off its feet into the air (a `flight` with the ragdoll's tumble
  // on it, so it also turns over on the way up), and the SPEED is the dial for how high it goes:
  // `SLIDE_HIT_SPEED`..`SLIDE_HIT_FULL_SPEED` maps to `SLIDE_HIT_LIFT`..`SLIDE_HIT_LIFT_MAX`, so
  // the faster the slide the further up the body is thrown (the user's "the faster im sliding the
  // higher they go") — and the shove along the slide's line, which is what carries it, ramps with
  // the same number. Below `SLIDE_HIT_SPEED` the body is barely moving, so nothing happens.
  //
  // A slide takes the same body TWICE (`P.SLIDE_HIT_MAX`), and no more — the user's "make the
  // slide hit a ragdoll twice per enemy". The first take is a fresh body and is the hit that
  // throws it; the second is the RAGDOLL being caught again, and it is what the wake below is for.
  // The count is kept per slide in `this.slideHits` and zeroed on every `startSlide`, so the sweep
  // can never re-launch the same body frame after frame while the segment still overlaps it.
  //
  // The two takes are `SLIDE_HIT_RECATCH` seconds apart, and that gap is the whole reason the
  // second one is visible: by then the first throw's lift has been eaten by gravity and the body
  // is on its way back down, so the second take's pop genuinely lifts it AGAIN rather than being
  // the same launch re-applied a frame later. The second take has to get past `hit`'s own guard
  // against ragdolls (see enemies.js) — the body is a ragdoll by then — which is what
  // `force: true` is for, and only for the second take.
  // -------------------------------------------------------------------------
  slideContact(px, pz, dt) {
    if (!this.enemies || !this.enemies.spawned) return;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp < P.SLIDE_HIT_SPEED) return;
    // Age the re-catch clocks of the bodies this slide has already taken.
    for (const rec of this.slideHits.values()) if (rec.cd > 0) rec.cd = Math.max(0, rec.cd - dt);
    // The tucked width, not the standing one: the box the slide actually collides with is the box
    // that catches the body (see `updateBox`), so a squeeze through a gap is also a narrower hit.
    const reach = this.hx + P.HX + P.SLIDE_HIT_PAD;
    // The segment this frame's move covered — from where the body was when `update` began to
    // where the world left it. If the move was too small to have a direction (a slide braking
    // into a wall), fall back to the facing, which is where a slide of any speed is pointed.
    const segX = this.pos.x - px;
    const segZ = this.pos.z - pz;
    const segLen = Math.hypot(segX, segZ);
    const ux = segLen > 1e-4 ? segX / segLen : Math.sin(this.facing);
    const uz = segLen > 1e-4 ? segZ / segLen : Math.cos(this.facing);
    const t = Math.max(0, Math.min(1, (sp - P.SLIDE_HIT_SPEED) / (P.SLIDE_HIT_FULL_SPEED - P.SLIDE_HIT_SPEED)));
    const lift = P.SLIDE_HIT_LIFT + (P.SLIDE_HIT_LIFT_MAX - P.SLIDE_HIT_LIFT) * t;
    const knock = P.SLIDE_HIT_KNOCK + (P.SLIDE_HIT_KNOCK_MAX - P.SLIDE_HIT_KNOCK) * t;
    const y = this.pos.y - P.HY;
    let any = false;
    // One take, wherever it came from — the sweep below, or the wake after it. It is the hit, the
    // count that caps the body at two, and the FX anchor the `slidehit` event is read from, in one
    // place. `again` is what says a body this slide has ALREADY taken is being taken a second time,
    // which is both the `force` that gets past `hit`'s ragdoll guard and the reason it is the last
    // take that body gets.
    const take = (e, again) => {
      if (!e.hit("flight", ux, uz, knock, P.SLIDE_HIT_STUN, {
        dmg: P.SLIDE_HIT_DMG,
        ragdoll: true,
        force: again,
        lift,
      })) return false;
      const rec = this.slideHits.get(e);
      if (rec) {
        rec.n++;
        rec.cd = P.SLIDE_HIT_RECATCH;
      } else {
        this.slideHits.set(e, { n: 1, cd: P.SLIDE_HIT_RECATCH });
      }
      any = true;
      this.lastSlideHit = {
        x: e.pos.x,
        y: e.pos.y + P.HY * 0.95,
        z: e.pos.z,
        power: 0.4 + 0.6 * t,
        speed: sp,
        ramp: t,
      };
      // ...and the macaco's window opens with it (see `startMacaco`): for this long after a take,
      // a press of M1 turns the slide into the throw, provided the body it just took is still a
      // ragdoll in the air. Refreshed on every take, so the second one re-opens it.
      this.slideHitT = P.MACACO_WINDOW;
      this.slideHitTarget = e;
      this.events.push("slidehit");
      return true;
    };
    for (const e of this.enemies.list) {
      if (!e.built) continue;
      // Already taken `SLIDE_HIT_MAX` times by THIS slide, or taken once and still inside the
      // re-catch gap: leave it alone until the clock runs out (see the block above).
      const rec = this.slideHits.get(e);
      if (rec && (rec.n >= P.SLIDE_HIT_MAX || rec.cd > 0)) continue;
      // Same floor: a body on a roof above the deck the slide is grinding is not in its way.
      if (Math.abs(e.pos.y - y) > P.HY * 1.5) continue;
      // The body's distance from the segment: project it onto the line and measure the
      // perpendicular. Clamped, so the two endpoints are capped circles rather than a line
      // running on forever, which is what makes a body the body stopped just short of still count.
      const ex = e.pos.x - px;
      const ez = e.pos.z - pz;
      const proj = segLen > 1e-4 ? Math.max(0, Math.min(segLen, ex * ux + ez * uz)) : 0;
      const cx = px + ux * proj;
      const cz = pz + uz * proj;
      if (Math.hypot(e.pos.x - cx, e.pos.z - cz) > reach) continue;
      take(e, !!rec);
    }
    // ---- THE WAKE: the second take, for a body the sweep has outrun --------------------------
    // A body this slide has already thrown once is taken AGAIN the moment its re-catch clock runs
    // out — and it does NOT have to still be in front of the slide to be taken, because of what
    // the first take did: the shove is along the slide's own line, and a slide is faster than its
    // own shove, so the slide travels straight past the body it just threw. That is why the
    // contact-based sweep alone could never give the user the second ragdoll — measured, a 24 u/s
    // slide is 4.2 u past the body when a 0.26 s clock runs out, and simply stops touching it.
    //
    // What makes this honest rather than a free second hit is the condition: the body must still
    // be WEARING the ragdoll this slide gave it (`e.ragdoll`) and still be off the deck, so the
    // wake can only ever re-take a body this slide is still holding in the air — its own throw,
    // nothing else — and `SLIDE_HIT_MAX` stops it at two. A body still inside the sweep never
    // reaches here: the pass above has already taken it and reset its clock.
    for (const [e, rec] of this.slideHits) {
      if (rec.n >= P.SLIDE_HIT_MAX || rec.cd > 0) continue;
      if (!e.built || !e.ragdoll || e.grounded) continue;
      take(e, true);
    }
    // The two frames the world holds still. A whiff costs nothing (there is no swing to sell), so
    // this is a `max` rather than an assignment: it must never zero a chain's hitstop, and the
    // chain must never shorten this one if the two ever land on the same frame.
    if (any) this.hitstop = Math.max(this.hitstop, P.SLIDE_HIT_STOP);
  },

  // -------------------------------------------------------------------------
  // THE DIVE LAUNCH — the user's "if i dive into an enemy i take him into air combo".
  //
  // The dive is the second move in the game that arrives on a body as a BODY rather than as a
  // swing (see `slideContact`), and it is measured the same way: the segment this frame's own move
  // covered — from where `update` began to where the world actually let the body travel, so a dive
  // turned by a face cannot catch something it would only have reached on the line it wished it
  // had taken — thickened by the player's half-width and `DIVE_HIT_PAD`, against every built body.
  // What differs is the arrival: a slide takes the legs and throws the body down the line, a dive
  // TACKLES — the body is caught and ridden up, the diver's own run is spent on it, and the window
  // the capoeira's launch opens (`airComboT`) opens with it. That is what makes a dive the second
  // way into an air combo, and it is the one the user asked for.
  //
  // It is ONE LAUNCH PER DIVE (`diveHits`, and only the first body of a dive is launched — the rest
  // of a crowd inside the same arc gets the check, so one dive can never multiply the pop and the
  // window by however many bodies it crosses), and it is gated by its own cooldown (`airCd`, drawn
  // as the purple diamond beside the dial). A dive thrown while that is filling still LANDS: it is
  // a body-check — a shove and a stagger, no launch and no window — so the move is never silently
  // swallowed, it just is not the one you get.
  //
  // AND THE BODY HAS TO ALREADY BE UP (the user's "to do the dive into air combo the enemy must be
  // in the air"). The tackle TAKES a body out of the air, it does not lift one off the deck, so the
  // launch is gated on the enemy being AIRBORNE. A dive that arrives on a body still standing is
  // the body-check and nothing else. That is what keeps the air combo an air combo: the dive is a
  // second door into a juggle you have already opened (the capoeira's launch, the chain's own
  // throw, the whirl's release), not a way to start one from neutral on a body on the deck.
  //
  // The vertical test is a pair of BOXES rather than a pair of feet (the slide's rule, taken a step
  // further): the diver is a body laid out horizontally that can arrive anywhere up its own height,
  // so what has to overlap is the enemy's own span — its feet to its head, and its `pos.y` IS its
  // feet — and the diver's own box. `DIVE_HIT_BAND` is the grace under that box, and it is not a
  // nicety: the dive holds its height, so this is what lets a tackle thrown out of a jump land at
  // all (the note on the constant has the measurement). A dive over a roof still never reaches down
  // to the deck below, because the grace is under the DIVER's box, not around the enemy.
  // -------------------------------------------------------------------------
  // Which bodies a dive would actually LAUNCH (see `diveContact` and the `diveCandidate` read):
  // built, not a ragdoll (a ragdoll refuses hits outright, and `Enemies.inFront` skips them), and
  // UP — the one rule the whole move turns on, since the tackle takes a body out of the air rather
  // than lifting one off the deck. `P.DIVE_UP_V` is the forgiveness on that rule: `grounded` is
  // the enemy's own read of the deck and it is true for the frame or two a juggled body spends
  // clipping the pavement at the bottom of its arc — which is exactly when a late tackle arrives —
  // so a body that is RISING still counts as up. Read in both places so the prompt can never
  // promise a launch the contact would refuse.
  diveUp(e) {
    return !!e && !!e.built && !e.ragdoll && (!e.grounded || e.vel.y > P.DIVE_UP_V);
  },

  diveContact(px, pz, dt) {
    // The arrival is read on ONE frame (the frame the dive touched down, or the frame it handed
    // over to a slide — see the dive's own exit), so the flag is spent here whatever happens.
    this.diveArrive = false;
    if (!this.enemies || !this.enemies.spawned) return;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp < P.DIVE_HIT_SPEED) return;
    const reach = this.hx + P.HX + P.DIVE_HIT_PAD;
    const segX = this.pos.x - px;
    const segZ = this.pos.z - pz;
    const segLen = Math.hypot(segX, segZ);
    const ux = segLen > 1e-4 ? segX / segLen : Math.sin(this.facing);
    const uz = segLen > 1e-4 ? segZ / segLen : Math.cos(this.facing);
    const t = Math.max(0, Math.min(1, (sp - P.DIVE_HIT_SPEED) / (P.DIVE_HIT_FULL_SPEED - P.DIVE_HIT_SPEED)));
    const lift = P.DIVE_HIT_LIFT + (P.DIVE_HIT_LIFT_MAX - P.DIVE_HIT_LIFT) * t;
    const knock = P.DIVE_HIT_KNOCK + (P.DIVE_HIT_KNOCK_MAX - P.DIVE_HIT_KNOCK) * t;
    const cy = this.pos.y;
    // The two BOXES, not two points: the diver is a cube of half-height `P.HY` centred on `cy`, the
    // body is its own span from its feet to its head, and `DIVE_HIT_BAND` is the grace under the
    // diver's box (see the note on it — the dive holds its height, so this is the number that
    // decides whether the move lands at all).
    const roof = 3 * P.HY + P.DIVE_HIT_BAND;
    const floor = -P.HY - P.DIVE_HIT_BAND_DOWN;
    let any = false;
    let launched = false;
    for (const e of this.enemies.list) {
      if (!e.built || e.ragdoll) continue;
      if (this.diveHits.has(e)) continue;
      if (cy > e.pos.y + roof || cy < e.pos.y + floor) continue;
      const ex = e.pos.x - px;
      const ez = e.pos.z - pz;
      const proj = segLen > 1e-4 ? Math.max(0, Math.min(segLen, ex * ux + ez * uz)) : 0;
      const cx = px + ux * proj;
      const cz = pz + uz * proj;
      if (Math.hypot(e.pos.x - cx, e.pos.z - cz) > reach) continue;
      // The launch is a FLIP, not a ragdoll (see the note on `DIVE_HIT_*`): the body has to stay
      // hittable in the air or the window this opens has nothing to land on. The check is a plain
      // `fold` — a shove and a stagger, the shape any standing body takes from a knee.
      //
      // `!e.grounded` is the airborne gate (see the note above): the launch only takes a body that
      // is ALREADY up — and `diveUp` is that rule with its `DIVE_UP_V` forgiveness (a body still
      // rising counts whether or not its feet have touched). Everything else — cooldown filling,
      // or a body that really is standing on the deck — gets the body-check instead, and the dive
      // carries on through it.
      const canLaunch = !launched && this.airCd <= 0 && this.diveUp(e);
      const landed = canLaunch
        ? e.hit("flight", ux, uz, knock, P.DIVE_HIT_STUN, { dmg: P.DIVE_HIT_DMG, lift, flip: true })
        : e.hit("fold", ux, uz, knock * 0.42, P.DIVE_HIT_STUN * 0.55, { dmg: Math.round(P.DIVE_HIT_DMG * 0.6) });
      if (!landed) continue;
      this.diveHits.add(e);
      any = true;
      this.lastDiveHit = {
        x: e.pos.x,
        y: e.pos.y + P.HY * 1.15,
        z: e.pos.z,
        power: 0.45 + 0.55 * t,
        up: canLaunch,
        e,
      };
      if (!canLaunch) continue;
      launched = true;
      // THE LAUNCH. The window the capoeira opens is opened the same way here, and the diver's own
      // arrival is solved to match it: the dive's run is SPENT on the body it caught (a dive that
      // carried on at 28 while the body went up at 9 would leave its own juggle behind it), the
      // body comes UP under the one it just threw, and the chain is reset to the knee so the air
      // combo starts where the capoeira's does. Exiting the dive is the last piece: the move is
      // spent, and `air` is where the window is meant to be used from.
      this.airComboT = P.CAPO_AIR_T;
      this.airComboIdle = P.AIR_IDLE;
      this.airCd = P.AIR_CD;
      this.grounded = false;
      this.prevGrounded = false;
      this.vel.y = Math.max(this.vel.y, P.DIVE_HIT_POP + (P.DIVE_HIT_POP_MAX - P.DIVE_HIT_POP) * t);
      this.vel.x *= P.DIVE_HIT_KEEP;
      this.vel.z *= P.DIVE_HIT_KEEP;
      this.diveSpeed = 0;
      this.combo = 0;
      this.comboGrace = 0;
      this.squash = -0.45;
      if (this.state === "dive") this.setState("air");
      if (this.sfx && this.sfx.diveLaunch) this.sfx.diveLaunch(t);
    }
    // The beat the world holds still on the tackle, as a `max` for the same reason the slide's is:
    // a dive is not allowed to shorten a chain's hitstop, and a chain is not allowed to shorten
    // this one. (Nothing else in the frame can be doing it — a dive is not a state an attack is
    // in — but the rule is the rule, and it costs one call.)
    if (any) {
      this.hitstop = Math.max(this.hitstop, P.DIVE_HIT_STOP);
      this.events.push("divehit");
      if (launched) this.events.push("divelaunch");
    }
  },

  // -------------------------------------------------------------------------
  // THE FRONT LUNGE — the long dash's own hitbox.
  //
  // The user's brief: *"the front dash a long dash ... if it touches a non ragdolled enemy at any
  // time while the front dash is being done it stuns them for 0.25 seconds; if the dummy is
  // airborne and ragdolled and it collides with the front dash hitbox it forces the dummy to do a
  // pushback"*. And the pushback's own setup is the M1 before it — *"its done if the player m1s an
  // enemy then front dashing at them"* — so the two outcomes are one rule about what the body it
  // runs into is DOING:
  //
  //   * a body that is STANDING (idle, walking, in the lock) is simply bowled over: a `fold`,
  //     `QDASH_STUN` (0.25 s on the clock), a small shove, and no damage at all. A stagger, not a
  //     hit — it is a way IN, not a way to win.
  //   * a body that is ALREADY REELING — folded by the M1 that came before it, held by the
  //     clinch, thrown off its feet, or a ragdoll in the air — is PUSHED BACK (see `hit`'s
  //     `pushback` branch): the flip-up-out-of-it reaction. That is why the rule is "is it
  //     reeling" rather than the narrower "is it a ragdoll": the chain's own knee leaves a body
  //     in `fold`, not in a ragdoll, and the M1-then-lunge the user described has to work.
  //
  // A body already on the DECK takes neither — a lunge that ran over a body lying on the floor
  // would be picking a fight with the pavement — so it is skipped, and skipped without being
  // added to `dashHits`, so it can still be caught on a later frame if it gets up into the way.
  //
  // ...and THE LUNGE STOPS ON WHATEVER IT FINDS: a hit ends the step where it landed and keeps
  // only `DASH_STOP_KEEP` of the travel, which is the user's *"when u hit the enemy u stop the
  // dash"* — the step is a way IN, not a way to run through somebody.
  //
  // SINCE THE FRONT STEP BECAME A BOXCUTTER (`poseBoxcutter`) IT STOPS ON THE *BLADE* INSTEAD. The
  // user's *"make it ass soon as it touches an enemy it plays the kick part or speeds up to the kick
  // part"*: a step that touches a body before `BOXCUT.kick` does not deliver anything where it
  // touched — the reaction is HELD (`dashPendingHits`), the step's own pose clock is rushed onto the
  // kick's beat (`dashRushAt`/`dashRushK`), and `dashKickLands` applies all of it (reaction,
  // hitstop, the stop) on the frame the leg is actually out. A touch at or past the kick delivers
  // immediately, exactly as the lunge always did. The step is still not ended by a hit: the descent
  // and the rise are the move's follow-through, and cutting them off is what the old
  // end-the-state-here did.
  //
  // Measured exactly like the slide and the dive: the SEGMENT the frame's own move covered,
  // thickened by the body's half-width, against every built body, with the same height band. One
  // take per body per step (`dashHits`), so a half-second lunge cannot stagger the same body
  // twice on its way through.
  // -------------------------------------------------------------------------
  dashContact(px, pz) {
    if (!this.enemies || !this.enemies.spawned) return;
    const segX = this.pos.x - px;
    const segZ = this.pos.z - pz;
    const segLen = Math.hypot(segX, segZ);
    const ux = segLen > 1e-4 ? segX / segLen : Math.sin(this.facing);
    const uz = segLen > 1e-4 ? segZ / segLen : Math.cos(this.facing);
    const reach = this.hx + P.HX + P.DASH_HIT_PAD;
    const y = this.pos.y - P.HY;
    const K = this.boxcutterBeats();
    const held = [];             // a body caught before the kick — the reaction waits for it
    let any = false;
    let pushed = false;
    for (const e of this.enemies.list) {
      if (!e.built) continue;
      if (this.dashHits.has(e)) continue;
      if (Math.abs(e.pos.y - y) > P.HY * 1.5) continue;
      const ex = e.pos.x - px;
      const ez = e.pos.z - pz;
      const proj = segLen > 1e-4 ? Math.max(0, Math.min(segLen, ex * ux + ez * uz)) : 0;
      const cx = px + ux * proj;
      const cz = pz + uz * proj;
      if (Math.hypot(e.pos.x - cx, e.pos.z - cz) > reach) continue;
      // On the deck: nothing. (See the note above — and NOT taken, so it stays catchable.)
      if (e.state === "down" || e.state === "getup" || (e.ragdoll && e.grounded)) continue;
      const reeling = e.ragdoll || !e.grounded ||
        e.state === "fold" || e.state === "clinch" || e.state === "flight" ||
        e.state === "trip" || e.state === "wallslam" || e.state === "pushback";
      // ...and the step has not thrown the kick yet: hold the reaction and get there fast. Taken
      // NOW (`dashHits`) so the same body cannot be caught twice on the way in.
      if (this.dashPoseT < K.kick) {
        this.dashHits.add(e);
        held.push({ e, ux, uz, reeling });
        continue;
      }
      // A pushback into a body that is already a ragdoll has to get past `hit`'s own guard (a
      // ragdoll cannot normally be hit at all), which is the one place `force` is for — the
      // lunge is the move that is SUPPOSED to catch a body the finisher threw.
      const landed = reeling
        ? e.hit("pushback", ux, uz, P.DASH_PUSH_KNOCK, P.DASH_PUSH_STUN, { force: true })
        : e.hit("fold", ux, uz, P.QDASH_KNOCK, P.QDASH_STUN, { dmg: 0 });
      if (!landed) continue;
      this.dashHits.add(e);
      any = true;
      if (reeling) pushed = true;
      this.dashHitTarget = e;
      this.lastDashHit = {
        x: e.pos.x,
        y: e.pos.y + P.HY * 0.85,
        z: e.pos.z,
        push: reeling,
        e,
      };
    }
    if (held.length) {
      // THE RUSH. The gap left on the clock is covered in `DASH_RUSH_T` seconds rather than in its
      // own time, capped at `DASH_RUSH_MAX`. Nothing of the hit is in the world yet — no reaction,
      // no hitstop, no FX — because none of it has happened yet.
      this.dashPendingHits = held;
      const gapS = Math.max(0.01, K.kick - this.dashPoseT) * Math.max(1e-3, this.qdashTime());
      this.dashRushK = Math.max(1, Math.min(P.DASH_RUSH_MAX, gapS / P.DASH_RUSH_T));
      this.dashRushAt = K.kick;
    }
    if (any) {
      // The same bargain the slide's and the dive's hitstops make: a `max`, so the lunge can
      // never shorten a chain's own beat and a chain can never shorten this one.
      this.hitstop = Math.max(this.hitstop, P.QDASH_STOP);
      this.events.push("dashhit");
      if (pushed) this.events.push("dashpush");
      // ...and THE LUNGE STOPS ON WHAT IT HIT — the user's *"when u hit the enemy u stop the
      // dash"*. The body is planted where it connected rather than carried through the body it
      // just staggered, so the step ENDS here and all but `DASH_STOP_KEEP` of its travel goes with
      // it. The `landT`/`landPose` absorb is untouched (this is a step, not a fall), and the
      // hitstop above is what holds the frame so the stop reads as a stop.
      this.vel.x *= P.DASH_STOP_KEEP;
      this.vel.z *= P.DASH_STOP_KEEP;
      this.setState(this.grounded ? "ground" : "air");
    }
  },

  // The rig's `BOXCUT` beat table, read off the same place the shape is (`streetwear.js` publishes
  // it as `userData.boxcutterBeats`), so the beat the CONTACT logic compresses onto is by
  // construction the beat the blade is actually out on. The fallback is only for the corner where
  // the rig is not built yet.
  boxcutterBeats() {
    const bt = this.charMesh && this.charMesh.userData;
    return (bt && bt.boxcutterBeats) || { coil: 0.09, launch: 0.19, kick: 0.50, kickEnd: 0.60, unwind: 0.72, plant: 0.80, absorb: 0.89, settle: 0.97 };
  },

  // ---- the step's own POSE CLOCK (see `dashPoseT`) ----------------------------------------------
  //
  // The fraction of the step already drawn. It is the state's own clock (`dt / qdashTime`) except
  // while a RUSH is armed, when it is multiplied by `dashRushK` — which is the whole mechanism
  // behind *"as soon as it touches an enemy it plays the kick part"*: the shape cannot teleport the
  // leg onto the enemy, so the CLOCK is compressed and the leg gets there in a few frames instead.
  //
  // It is ticked in `update`'s `dash` case rather than in `updateVisual` so that the simulation
  // (which is where the contact test lives), the turn and the shape all read ONE number in the same
  // frame. With no rush armed it is exactly `stateTime / qdashTime()`, which is what the backstep's
  // turn and landing beats were always authored against — so the backstep is untouched by it.
  tickDashPose(dt) {
    let rate = dt / Math.max(1e-3, this.qdashTime());
    if (this.dashRushAt > this.dashPoseT) rate *= this.dashRushK;
    this.dashPoseT = Math.min(1, this.dashPoseT + rate);
    if (this.dashRushAt >= 0 && this.dashPoseT >= this.dashRushAt) {
      this.dashRushAt = -1;
      this.dashRushK = 1;
      this.dashKickLands();
    } else if (this.dashPendingHits && this.dashPoseT >= this.boxcutterBeats().kick) {
      // ...or the clock simply walked past the kick with a body still waiting on it (a rush armed
      // too late to beat the clock, which the cap can produce on a very early touch).
      this.dashRushAt = -1;
      this.dashRushK = 1;
      this.dashKickLands();
    }
  },

  // THE KICK ARRIVES: everything the contact held is applied here, on the beat the leg is out.
  dashKickLands() {
    const held = this.dashPendingHits;
    this.dashPendingHits = null;
    this.dashKickLanded = true;
    if (!held || !held.length) return;
    let pushed = false;
    let anchor = null;
    for (const q of held) {
      const e = q.e;
      if (!e || !e.built) continue;
      const landed = q.reeling
        ? e.hit("pushback", q.ux, q.uz, P.DASH_PUSH_KNOCK, P.DASH_PUSH_STUN, { force: true })
        : e.hit("fold", q.ux, q.uz, P.QDASH_KNOCK, P.QDASH_STUN, { dmg: 0 });
      if (!landed) continue;
      if (q.reeling) pushed = true;
      this.dashHitTarget = e;
      anchor = { x: e.pos.x, y: e.pos.y + P.HY * 0.85, z: e.pos.z, push: q.reeling, e };
    }
    if (!anchor) return;
    this.lastDashHit = anchor;
    this.hitstop = Math.max(this.hitstop, P.QDASH_STOP);
    this.events.push("dashhit");
    if (pushed) this.events.push("dashpush");
    // ...and THE KICK STOPS THE STEP: all but `DASH_STOP_KEEP` of the travel goes with it. The
    // STATE is left alone — the descent and the rise still play, which is the follow-through the
    // old end-the-state-here threw away.
    this.vel.x *= P.DASH_STOP_KEEP;
    this.vel.z *= P.DASH_STOP_KEEP;
  },

  // ---- the dive's own target read ----
  // `diveCandidate` is the body a dive would LAUNCH this frame: built, not ragdolled, ALREADY
  // AIRBORNE (the gate in `diveContact` — the tackle takes a body out of the air, it does not
  // lift one off the deck), inside the tackle's horizontal reach, inside the same vertical band
  // of boxes the contact tests, and ahead of the dive's own facing (which is the camera axis, so
  // the read and the move are looking down the same line). The hint uses it to name which of the
  // two arrivals is coming, and it is deliberately a read of the SAME numbers the contact lands
  // on rather than a second set — the prompt can never promise a launch the sweep would refuse.
  // The airborne rule itself lives in `diveUp`, so the read cannot drift from the contact.
  readDiveTarget(grounded) {
    this.diveCandidate = null;
    if (!grounded && this.airCd <= 0 && this.enemies && this.enemies.spawned) {
      const fx = Math.sin(this.facing);
      const fz = Math.cos(this.facing);
      const reach = this.hx + P.HX + P.DIVE_HIT_PAD;
      const roof = 3 * P.HY + P.DIVE_HIT_BAND;
      const floor = -P.HY - P.DIVE_HIT_BAND_DOWN;
      for (const e of this.enemies.list) {
        if (!this.diveUp(e)) continue;
        if (this.pos.y > e.pos.y + roof || this.pos.y < e.pos.y + floor) continue;
        const dx = e.pos.x - this.pos.x;
        const dz = e.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > reach) continue;
        if (d > 0.35 && (dx * fx + dz * fz) / d < 0) continue;
        this.diveCandidate = e;
        break;
      }
    }
  },
  // THE FRAME'S CONTACTS (lifted from the middle of `update`): the smash's own deck check (the flurry
  // with nothing left to hit hands the body to the air) and then the four committed moves' contact
  // passes — the dive's tackle, the slide's sweep, the front lunge's run and the charge's — each read
  // against the line the world ACTUALLY let the body travel this frame, which is why the caller hands
  // in the pre-move `preX`/`preZ`.
  tickContacts(dt, preX, preZ) {
    // ---- the flurry's deck, and what happens when it goes (see the `smash` case) ----
    // The hammer's whole job is to beat the ground it is standing on into a hole, so it cannot
    // assume that ground is still there. The `smash` case now falls with it, and this is the second
    // half of the fix: a flurry with nothing left to hit does not hang over the hole hammering the
    // air — it hands the body to the AIR, exactly the way a ground slam does when it runs out of
    // airtime (`slam` -> "air", above) and the way any planted state does when its floor goes
    // (`ground && !grounded`, above).
    //
    // Read AFTER the move, so `this.grounded` is the world's own answer for this frame rather than
    // last frame's, and gated on a real FALL's worth of speed rather than on `!grounded` alone: the
    // planted body gives up a hair of height every frame (`g·dt²` into the floor, ~9 mm at 60 fps)
    // and a high framerate can spread that settle over two or three frames at a time, so "did not
    // find a floor this frame" is routinely true of a body that is standing perfectly still on one.
    // A deck that has actually GONE puts a body past `SMASH_PLUNGE_V` within two or three frames,
    // and a step the flurry simply followed down to is under it, so the move survives a step and
    // dies on a plunge — which is the shape of the thing the user reported.
    if (this.state === "smash" && !this.grounded && this.vel.y < -SMASH_PLUNGE_V) {
      this.setState("air");
    }
    // ...and a slide spends its motion on whatever it crossed (see `slideContact`). Tested after
    // the move rather than in the state case above so the line it is measured against is the line
    // the world actually let the body travel — a slide turned or stopped by a face must not flip a
    // body it would have reached on the line it *wished* it had taken. The DIVE's own arrival is
    // read first and the same way (`diveContact`), because a landed tackle takes the body up and
    // out of the dive: it is tested HERE, ahead of the slide, so the frame a dive hands over to a
    // slide at a body belongs to the tackle and not to the sweep.
    if (this.state === "dive" || this.diveArrive) this.diveContact(preX, preZ, dt);
    if (this.state === "slide") this.slideContact(preX, preZ, dt);
    // ...and the FRONT LUNGE spends its own line the same way, on whatever it runs into (see
    // `dashContact`). It is tested LAST of the three because it is the one that can hand a body
    // to its neighbours: a lunge is a run, and a body it staggers is a body a slide or a dive
    // arriving on the same frame should still be free to take.
    if (this.state === "dash" && this.dashKind === 0) this.dashContact(preX, preZ);
    // ...and THE CHARGE spends its line on whatever it runs into — the same swept segment, measured
    // after the move so it is the line the world actually let the body travel (see `blockContact`).
    if (this.state === "block" && this.guardCharging) this.blockContact(preX, preZ);
  },
};

export function installContacts(Player) {
  Object.assign(Player.prototype, contactMethods);
}
