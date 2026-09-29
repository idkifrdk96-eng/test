// The bus every sound in the game ends on, before the compressor and the speakers. What the
// OPTIONS panel's VOLUME row scales (see `setVolume`): 1 is the mix as authored, so a saved
// volume of 0.5 is half of everything, and 0 is a true mute.
const GAIN = 0.42;

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.ready = false;
    // The player's own level (0..1), remembered here rather than only on the node: a volume moved in
    // OPTIONS before the first sound is a level the context does not exist to carry yet, and `init`
    // is where it finally lands (see `setVolume`).
    this.volume = 1;
  }

  // The one writer of the master level (the OPTIONS VOLUME row, `loadOptions` and `resetDefaults`).
  // Safe to call at any time — before `init` it only remembers, after it also moves the live node.
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = GAIN * this.volume;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = GAIN * this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const len = Math.floor(this.ctx.sampleRate * 1.0);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.ready = true;
  }

  tone(opts) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = opts.type || "square";
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.freq2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freq2), t + opts.dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(opts.vol, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + opts.dur + 0.02);
  }

  noise(dur, vol, freq, q) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = freq;
    filt.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  jump() {
    this.tone({ freq: 320, freq2: 620, dur: 0.13, type: "square", vol: 0.14 });
  }

  doubleJump() {
    this.tone({ freq: 480, freq2: 940, dur: 0.15, type: "square", vol: 0.15 });
    this.tone({ freq: 240, freq2: 470, dur: 0.15, type: "triangle", vol: 0.1 });
    this.noise(0.14, 0.07, 2600, 1.0);
  }

  slam() {
    this.tone({ freq: 260, freq2: 70, dur: 0.4, type: "sawtooth", vol: 0.16 });
    this.noise(0.5, 0.14, 500, 0.6);
  }

  slamImpact(power) {
    const p = Math.max(0, Math.min(1, power));
    this.noise(0.5 + p * 0.35, 0.2 + p * 0.25, 130 + p * 90, 0.5);
    this.tone({ freq: 120 - p * 40, freq2: 34, dur: 0.5, type: "sine", vol: 0.24 + p * 0.18 });
    this.tone({ freq: 300, freq2: 60, dur: 0.18, type: "square", vol: 0.12 });
  }

  // Something came apart. A dry rip of grit (the stone tearing), a body of low rubble landing
  // under it, and a scatter of little chips on top — scaled by how big the piece was.
  crumble(power) {
    const p = Math.max(0, Math.min(1, power));
    this.noise(0.36 + p * 0.3, 0.12 + p * 0.14, 900 + p * 500, 0.9);
    this.noise(0.5 + p * 0.4, 0.14 + p * 0.16, 150 + p * 80, 0.5);
    this.tone({ freq: 130 - p * 45, freq2: 38, dur: 0.42, type: "square", vol: 0.1 + p * 0.1 });
    for (let i = 0; i < 3 + Math.round(p * 4); i++) {
      this.noise(0.09, 0.05, 1500 + Math.random() * 2200, 1.6);
    }
  }

  wallJump() {
    this.tone({ freq: 220, freq2: 760, dur: 0.18, type: "sawtooth", vol: 0.16 });
    this.noise(0.12, 0.1, 1800, 1.2);
  }

  // Boot into concrete: a heavy low body thud, a woody crack over the top of it, and a
  // short bright scuff of grit coming off the face. Deliberately the fattest hit in the
  // game — it is the one move that is pure impact.
  wallKick() {
    this.tone({ freq: 168, freq2: 40, dur: 0.44, type: "sine", vol: 0.32 });
    this.tone({ freq: 92, freq2: 28, dur: 0.5, type: "triangle", vol: 0.24 });
    this.noise(0.3, 0.2, 230, 0.55);
    this.tone({ freq: 430, freq2: 86, dur: 0.15, type: "square", vol: 0.11 });
    this.noise(0.09, 0.13, 2700, 1.1);
    // the whip of the full turn, trailing the hit
    this.noise(0.26, 0.06, 820, 0.7);
  }

  land(impact) {
    const v = 0.1 + impact * 0.28;
    this.noise(0.16, v, 220 + impact * 120, 0.8);
    this.tone({ freq: 90 - impact * 20, freq2: 45, dur: 0.16, type: "sine", vol: v });
  }

  // ---- the melee chain (player.js) ----
  // One whoosh per move, one thud per contact, and the four are voiced by WEIGHT: the knee is a
  // mid slap, the clinch's knee is a touch deeper, the sweep is a low scrape, and the punch is
  // the fattest thing in the set — it is the one thrown to end the string.
  swing(i) {
    const f = [520, 470, 380, 430][i] || 480;
    this.noise(0.12 + i * 0.02, 0.05 + i * 0.012, f * 2.2, 0.8);
    this.tone({ freq: f, freq2: f * 0.45, dur: 0.16, type: "triangle", vol: 0.05 });
  }

  whiff() {
    this.noise(0.14, 0.05, 1500, 1.3);
  }

  hit(i, catchHit) {
    const p = [0.26, 0.29, 0.22, 0.4][i] || 0.26;
    this.tone({ freq: [210, 190, 150, 130][i] || 190, freq2: 46, dur: 0.26 + p * 0.3, type: "sine", vol: p });
    this.tone({ freq: 96, freq2: 34, dur: 0.34, type: "triangle", vol: p * 0.8 });
    this.noise(0.16, p * 0.7, 700, 0.6);
    this.noise(0.06, p * 0.45, 2600, 1.1);
    if (i === 3 || catchHit) {
      this.tone({ freq: 300, freq2: 60, dur: 0.24, type: "square", vol: 0.1 });
      this.noise(0.32, 0.15, 300, 0.5);
    }
  }

  enemyHit() {
    this.tone({ freq: 150, freq2: 60, dur: 0.2, type: "square", vol: 0.14 });
    this.noise(0.12, 0.12, 900, 0.8);
  }

  // The M1 clash (see `startClash` in player.js). Two strikes meeting in the air is not a thud and
  // not a whoosh: it is the SOUND OF THE LOCK — a bright clack with no low end under it at all,
  // because nothing connected with anything soft. The low end arrives later, and comes from the
  // shoving match (`clashPush`), not from this.
  clash() {
    this.noise(0.05, 0.16, 3400, 1.4);
    this.noise(0.16, 0.10, 1200, 1.0);
    this.tone({ freq: 620, freq2: 240, dur: 0.14, type: "square", vol: 0.07 });
    this.tone({ freq: 96, freq2: 60, dur: 0.1, type: "sine", vol: 0.1 });
  }

  // ...and one of those, per press of M1, for as long as the lock lasts. It is deliberately tiny —
  // it plays several times a second under a mashing thumb — and it walks UP with the count, so the
  // player can hear the race they are losing without ever looking at a meter.
  clashPush(n) {
    const k = Math.min(1, (n || 1) / 14);
    this.tone({ freq: 120 + k * 90, freq2: 52, dur: 0.09, type: "sine", vol: 0.09 + k * 0.06 });
    this.noise(0.05, 0.05 + k * 0.04, 700 + k * 600, 0.9);
  }

  // The macaco (see `startMacaco` in player.js): a body whipping over a planted hand, which is one
  // sweep of air with the hand's own scrape at the front of it.
  macaco() {
    this.noise(0.4, 0.09, 1800, 0.7);
    this.tone({ freq: 300, freq2: 900, dur: 0.4, type: "sawtooth", vol: 0.05 });
    this.noise(0.09, 0.11, 420, 0.9);
  }

  slide() {
    this.noise(0.5, 0.16, 900, 0.7);
  }

  // The slide's hit (see `slideContact` in player.js). The slide's own sound is a continuous hiss,
  // so its hit has to be a THUD sitting on top of that hiss rather than another scrape, or the two
  // blur into one noise. A body taken off its feet at knee height is a low wet weight plus a snap
  // of cloth, and both are pitched by how fast the slide was going: `ramp` is the contact's own
  // place on the slide's speed ramp (0 = the slowest slide that hits at all, 1 = full speed), so
  // the same move through the same body sounds different at 10 u/s and at 30.
  slideHit(power, ramp) {    const p = Math.max(0, Math.min(1, power));
    const v = Math.max(0, Math.min(1, ramp || 0));
    this.tone({ freq: 200 + v * 90, freq2: 44, dur: 0.3, type: "sine", vol: 0.2 + p * 0.16 });
    this.tone({ freq: 150, freq2: 40, dur: 0.36, type: "triangle", vol: 0.14 + p * 0.1 });
    this.noise(0.14, 0.12 + p * 0.08, 760 + v * 500, 0.7);
    this.noise(0.06, 0.06, 2200, 1.2);
  }

  // The DIVE LAUNCH (see `diveContact` in player.js). A dive arriving on a body is the same kind of
  // event as the slide's hit — a weight meeting a weight — so it is built the same way and pitched
  // by the contact's own place on the dive's speed ramp: a low sine for the mass, a snap of noise
  // for the cloth, and a rising sweep for the body leaving the deck. The sweep is the part that is
  // this move's own: it is the only hit in the game that throws a body UP, so it is the only one
  // with a lift in the sound. `up` false is the body-check (the diamond still filling): the same
  // thud with the sweep left out, so the two are told apart by ear without being told anything.
  diveLaunch(power, up) {
    const p = Math.max(0, Math.min(1, power));
    this.tone({ freq: 190 + p * 70, freq2: 46, dur: 0.26, type: "sine", vol: 0.18 + p * 0.14 });
    this.tone({ freq: 140, freq2: 42, dur: 0.34, type: "triangle", vol: 0.13 + p * 0.09 });
    this.noise(0.12, 0.11 + p * 0.07, 720 + p * 460, 0.7);
    this.noise(0.05, 0.06, 2300, 1.2);
    if (up) {
      this.tone({ freq: 300, freq2: 1180, dur: 0.34, type: "sawtooth", vol: 0.07 });
      this.noise(0.34, 0.08, 1700, 0.8);
    }
  }

  // The drop blast (see `dropBlast` in player.js): a shockwave arriving off the deck rather than a
  // body being struck, so the body of it is a low sine that starts under the floor and the air
  // moving over the top of it. `power` is the drop's own 0..1, so a hop off a ledge is a cough and
  // a plunge off a roof is the loudest thing in the game short of the launch pad.
  blast(power) {
    const p = Math.max(0, Math.min(1, power));
    this.tone({ freq: 78 - p * 26, freq2: 30, dur: 0.5 + p * 0.3, type: "sine", vol: 0.18 + p * 0.2 });
    this.noise(0.42 + p * 0.4, 0.12 + p * 0.18, 240 + p * 180, 0.5);
    this.noise(0.2, 0.07 + p * 0.06, 1100 + p * 700, 0.9);
  }

  // The squeeze (see `updateSqueeze` in player.js): the slide's own scrape is a one-shot at the
  // entry, so the moment the body starts threading a gap it barely fits gets a rising sweep of its
  // own, and the moment the gap lets go a shove of air — the sound of the speed that just arrived.
  squeeze() {
    this.tone({ freq: 240, freq2: 940, dur: 0.46, type: "sawtooth", vol: 0.08 });
    this.noise(0.5, 0.07, 1500, 0.9);
  }

  squeezeOut() {
    this.noise(0.3, 0.13, 1900, 0.6);
    this.tone({ freq: 500, freq2: 1250, dur: 0.26, type: "triangle", vol: 0.13 });
  }

  dash() {
    this.noise(0.34, 0.13, 480, 0.6);
    this.tone({ freq: 190, freq2: 88, dur: 0.24, type: "triangle", vol: 0.12 });
  }

  dive() {
    this.tone({ freq: 700, freq2: 160, dur: 0.22, type: "triangle", vol: 0.16 });
    this.noise(0.3, 0.1, 2400, 0.7);
  }

  // ---- THE CLIMB'S GRIP (session 199 — the user's *"just change the sound sfx for the climb"*) ----
  // A tick is ONE limb closing on the stone, and it is three layers rather than the one thin hiss it
  // used to be: the WEIGHT of the body being caught (a soft, low, slightly-bent knock — the palm
  // taking the load), the GRIT under it (a short band of noise around 0.6-1 k, which is palm-on-
  // stone and not the 1.4-2.2 k whistle of air escaping a hand), and the EDGE of it (a second, much
  // shorter band an octave and a half up) so the tick cuts through a busy mix instead of blurring
  // into it. MEASURED BEFORE: the wall sounded a tick from TWO doors at once — this beat read AND a
  // 0.24 s timer in `tickAirState` — **9.8 ticks/s of the same 0.06 s hiss** (counted on the live
  // page by call site), which is the static the room was hearing. The timer is gone; this is the one
  // door (see the note in `wallrun.js`).
  //
  // ...and THE FOUR CONTACTS ARE NOT THE SAME CONTACT. `beat` is the clip's own contact index (0-3,
  // passed by the beat read in `solveWallPose`), so a hand (even) and a foot (odd) take turns: the
  // palm is the heavier, darker grip, the boot a drier, brighter scuff down on the sole. That is
  // what the beat read was FOR — the tick is the animation re-gripping, and four identical clicks a
  // cycle would be the click track it was written not to be. Random jitter rides on top of both, so
  // no two cycles are the same take. Called with no argument (anywhere else, e.g. a harness) it is a
  // neutral contact.
  climbTick(beat) {
    const b = beat == null ? -1 : ((beat % 4) + 4) % 4;
    const hand = b < 0 ? Math.random() < 0.5 : b % 2 === 0;
    const v = hand ? 1 : 0.78;
    // the weight of the body, landing on the hold
    this.tone({
      freq: (hand ? 128 : 104) + Math.random() * 34,
      freq2: hand ? 84 : 66,
      dur: 0.1,
      type: "triangle",
      vol: 0.055 * v,
    });
    // ...the grit under it...
    this.noise(
      hand ? 0.085 : 0.06,
      (hand ? 0.05 : 0.038) * (0.85 + Math.random() * 0.3),
      (hand ? 640 : 940) + Math.random() * 320,
      1.0
    );
    // ...and the edge, so it reads as a contact and not as a swell.
    this.noise(0.035, 0.026, (hand ? 1750 : 2400) + Math.random() * 600, 1.7);
  }

  wallGrab() {
    this.tone({ freq: 180, freq2: 320, dur: 0.07, type: "square", vol: 0.09 });
    this.noise(0.08, 0.07, 1200, 1.4);
  }

  wallScrape(speed) {
    const v = 0.03 + Math.min(1, speed / 18) * 0.05;
    this.noise(0.11, v, 1700 + Math.random() * 900, 1.1);
  }

  mantle() {
    this.tone({ freq: 300, freq2: 760, dur: 0.2, type: "triangle", vol: 0.13 });
    this.noise(0.24, 0.1, 700, 1.0);
  }

  // ---- THE RUNNING VAULT (see `startVault` in player.js) ----
  // Two halves, because a vault is two events that the ear has to be able to tell apart: a hand
  // SLAPPING the top of a box, and a body landing on the far side of it. The slap is a short, hard,
  // high transient with no low end under it — a palm on a rail, not a fist on a body — and the exit
  // is the ordinary landing thud with the vault's own speed on it. `p` is the run the body arrived
  // with (0..1), so a vault taken slowly is a scuff and one taken at full tilt is a crack.
  vault(p) {
    const v = Math.max(0, Math.min(1, p == null ? 0.6 : p));
    // the palm
    this.noise(0.05 + v * 0.03, 0.10 + v * 0.08, 2400 + v * 1400, 1.5);
    this.tone({ freq: 240 + v * 120, freq2: 90, dur: 0.1, type: "square", vol: 0.08 + v * 0.05 });
    // ...and the air it took with it
    this.noise(0.26 + v * 0.12, 0.07 + v * 0.06, 1500 + v * 900, 0.7);
  }

  vaultLand(p) {
    const v = Math.max(0, Math.min(1, p == null ? 0.6 : p));
    this.noise(0.12 + v * 0.06, 0.1 + v * 0.14, 300 + v * 260, 0.8);
    this.tone({ freq: 120 - v * 30, freq2: 48, dur: 0.14 + v * 0.08, type: "sine", vol: 0.1 + v * 0.1 });
  }

  // The pad. A launch is the biggest single event in the game, so it gets a rising sweep under
  // a burst of air rather than one hit: a short thump for the plate, then the whoosh the body
  // rides up. The fall back down is the ordinary `land`, so nothing here has to cover it.
  launch() {
    this.tone({ freq: 120, freq2: 240, dur: 0.16, type: "square", vol: 0.16 });
    this.tone({ freq: 320, freq2: 1500, dur: 0.72, type: "triangle", vol: 0.15 });
    this.noise(0.85, 0.13, 1600, 0.6);
  }

  step(hard) {
    this.noise(0.07, hard ? 0.1 : 0.06, 700 + Math.random() * 400, 1.4);
  }

  ui() {
    this.tone({ freq: 880, freq2: 1320, dur: 0.09, type: "square", vol: 0.1 });
  }

  // ---- THE POLE (see "THE POLE" in player.js / pole.js / streetwear.js) ----
  // The wooden staff is the one weapon in the game that is not the body, so its three sounds are
  // voiced off the MATERIAL rather than off the strike: every one of them is built around a tight,
  // high-Q band of noise (the hollow ring of a dry shaft) instead of the body's low sines. That is
  // the whole difference between a fist and a stick, and it has to survive being played over the
  // top of the ordinary `hit`/`slamImpact` set — which is why none of these are loud, and all of
  // them sit up in the band the impacts do not use.

  // The take: the shaft is ripped out of the ground it was planted in. A scrape of grit coming off
  // the butt as it clears the deck, with the hollow knock of the shaft itself arriving on top of it
  // — the wood sings once, and then the carry owns the staff (session 143: the take is a plain
  // pickup, so this is the ONLY sound the haul makes; there is nothing else on the clock).
  staffTake() {
    this.noise(0.2, 0.1, 780, 1.1);
    this.tone({ freq: 300, freq2: 130, dur: 0.2, type: "triangle", vol: 0.1 });
    this.noise(0.09, 0.12, 1500 + Math.random() * 600, 3.4);
  }

  // A staff strike landing on a body (see `poleStrikeContact` in player.js): the wood's own ring over
  // the top of the weight. `power` is the beat's own 0..1 (`P.POLE_ATK_HITS`' index), and it is read
  // off the loudness of BOTH halves, so the last beat of the flurry is audibly the heaviest thing the
  // staff does — which is what makes the break that follows read as inevitable.
  poleHit(power) {
    const p = Math.max(0, Math.min(1, power));
    this.noise(0.06, 0.1 + p * 0.09, 1650 + p * 700, 3.2);
    this.tone({ freq: 340 + p * 140, freq2: 120, dur: 0.16, type: "triangle", vol: 0.1 + p * 0.06 });
    this.tone({ freq: 200 + p * 60, freq2: 46, dur: 0.24 + p * 0.16, type: "sine", vol: 0.14 + p * 0.12 });
    this.tone({ freq: 120, freq2: 40, dur: 0.3, type: "triangle", vol: 0.1 + p * 0.08 });
    this.noise(0.12, 0.09 + p * 0.08, 700 + p * 300, 0.7);
  }

  // A BOOT THROUGH A BALL (session 180 — see `shootLaunch` in inventory.js). Not the staff's thwack
  // and not a punch: a struck ball is a FLAT, hollow crack with no ring and almost no tail, because
  // the thing being hit is a shell of leather and air rather than a body. So a bright, very short
  // noise leads, a second one gives it its body, and one low thud underneath carries the weight of
  // the boot — and `power` (0..1) opens the crack up rather than lengthening it.
  ballKick(power) {
    const p = Math.max(0, Math.min(1, power));
    this.noise(0.035, 0.16 + p * 0.12, 2400 + p * 900, 1.1);
    this.noise(0.09, 0.1 + p * 0.08, 900 + p * 400, 0.7);
    this.tone({ freq: 150 + p * 60, freq2: 60, dur: 0.12 + p * 0.06, type: "triangle", vol: 0.1 + p * 0.08 });
  }

  // ...and the staff BREAKING (see `poleBreak` in player.js). A dry crack first — the shaft going is
  // the one event in the game that is a fracture rather than an impact, so the snap is brighter and
  // much shorter than any hit in the set — and then the two halves and the splinters coming down:
  // a scatter of high chips (the wood), a scatter of low knocks (the two pieces bouncing), and one
  // low body under the lot for the chop that put them there.
  shatter() {
    this.noise(0.045, 0.24, 2900, 2.2);
    this.noise(0.09, 0.16, 1250, 3.6);
    this.tone({ freq: 420, freq2: 130, dur: 0.13, type: "triangle", vol: 0.16 });
    this.tone({ freq: 88, freq2: 34, dur: 0.44, type: "sine", vol: 0.22 });
    this.noise(0.34, 0.16, 500, 0.6);
    for (let i = 0; i < 5; i++) this.noise(0.07, 0.06, 1700 + Math.random() * 2600, 3.0);
    for (let i = 0; i < 3; i++) {
      this.noise(0.1, 0.08, 260 + Math.random() * 260, 1.2);
    }
  }

  // ---- THE SKATEBOARD (session 200 — see "THE SKATEBOARD" in src/README.md) ----
  // A board is a MATERIAL the game has not had before: WOOD and URETHANE on stone, and every one of
  // these is voiced off that rather than off the body's low sines. Three things run through all of
  // them, and they are what makes a deck sound like a deck:
  //   * the DECK is wood — a short, dry, mid-band knock with almost no tail (240-500 Hz, one or two
  //     tens of a millisecond of noise on top of it), never a low sine;
  //   * the WHEELS are hard urethane on grit — a thin, high, very short band (2.4-3.6 k) that reads
  //     as rolling rather than as sliding;
  //   * there are FOUR CONTACTS, not one, which is why a landing here is a scatter of small knocks
  //     instead of the single thud `land` makes for two feet.
  // Nothing here is loud: a board is a light object and the whole point of it is that the rider is
  // standing on a thing that is CARRIED by its wheels, so the surfaces speak and the body does not.

  // Stepping on: the deck takes the body's weight through the trucks — the wood's knock, the trucks'
  // own little give, and the wheels settling onto the grit.
  boardMount() {
    this.tone({ freq: 220, freq2: 130, dur: 0.1, type: "triangle", vol: 0.11 });
    this.noise(0.07, 0.09, 900, 1.3);
    this.noise(0.05, 0.06, 2800 + Math.random() * 500, 2.6);
    this.noise(0.16, 0.045, 1600, 0.8);
  }

  // One PUSH: the boot put down on the road beside the deck and dragged back. It is a scuff and not
  // a step (`step` is a foot on the deck; this is a foot on grit, and it has to sit under the rolling
  // of the wheels), so it is a soft, wide band with a little of the boot's own leather in it.
  boardPush() {
    this.noise(0.13, 0.075, 620 + Math.random() * 260, 0.8);
    this.noise(0.06, 0.05, 1900 + Math.random() * 700, 1.4);
  }

  // The POP: the tail snapped down on the deck and the wheels left the ground. The one sound on a
  // board that is genuinely a CRACK — thin, dry and much shorter than any hit in the game, because
  // what is hitting what is wood on wood with nothing soft in between.
  boardPop() {
    this.noise(0.04, 0.2, 2600 + Math.random() * 900, 2.0);
    this.tone({ freq: 420 + Math.random() * 90, freq2: 150, dur: 0.09, type: "square", vol: 0.12 });
    this.noise(0.02, 0.12, 4200, 2.6);
  }

  // ...and the CATCH: four wheels coming back onto the road at once. `power` is 0.4 for a trick's
  // landing and 0.9 for the bomb's arrival (see `tickTrick` / `tickBBombState`), so the heavier one
  // opens the scatter up — the deck landing from higher is more wheels at once, not a bigger thud.
  boardLand(power) {
    const p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
    this.noise(0.07, 0.1 + p * 0.1, 1300 + p * 900, 1.2);
    this.tone({ freq: 150 + p * 60, freq2: 78, dur: 0.09, type: "triangle", vol: 0.09 + p * 0.07 });
    for (let i = 0; i < 3; i++) this.noise(0.035, 0.05 + p * 0.04, 2400 + Math.random() * 1400, 2.4);
  }

  // The POWERSLIDE, opening: the wheels breaking loose. A wide, fast swell of grit with the deck's
  // own low groan under it — a slide is the one board sound that is a TEXTURE rather than a hit, so
  // it starts wide and is handed straight to `boardGrind` below.
  boardSlide() {
    this.noise(0.3, 0.13, 2100, 0.7);
    this.noise(0.22, 0.09, 700, 0.9);
    this.tone({ freq: 190, freq2: 110, dur: 0.24, type: "triangle", vol: 0.1 });
  }

  // ...and the slide itself, fed every frame the deck is sideways off its own line (`k` is how far
  // off, 0..1 — the same number the sparks are sized from, so the ear and the eye are reading one
  // quantity). It is deliberately the same band every time with only the level moving: a rate of
  // slightly-different noises reads as one continuous grind, and a rate of tones would read as a
  // machine.
  boardGrind(k) {
    const v = 0.05 + Math.min(1, k) * 0.075;
    this.noise(0.055, v, 2200 + Math.random() * 900, 0.9);
    this.noise(0.05, v * 0.6, 900 + Math.random() * 400, 1.1);
  }

  // THE BAIL: the deck shoots out from under the rider and tumbles away on its own. That is a
  // SCATTER — the wheels chirping on the road, the deck slapping as it goes over, and a couple of
  // knocks behind it as it rolls off — with the rider's own scuff where he was left standing.
  boardBail() {
    this.noise(0.22, 0.11, 1900 + Math.random() * 800, 0.9);
    this.tone({ freq: 260, freq2: 120, dur: 0.12, type: "square", vol: 0.1 });
    for (let i = 0; i < 4; i++) {
      this.noise(0.05, 0.07, 1200 + Math.random() * 1800, 1.6);
    }
    this.noise(0.4, 0.05, 2600, 0.8);
  }

  // THE BOMB, opening: the deck thrown up and the body folded over it — a hard push-off (see the
  // whirl's `slamImpact` opener, which a bomb shares the shape of) with the board's own rattle
  // arriving on top, and then the fall belongs to `boardLand` at 0.9.
  bomb() {
    this.noise(0.14, 0.16, 800, 0.7);
    this.tone({ freq: 190, freq2: 70, dur: 0.2, type: "triangle", vol: 0.13 });
    this.tone({ freq: 96, freq2: 40, dur: 0.3, type: "sine", vol: 0.14 });
    this.noise(0.3, 0.1, 2000, 0.6);
  }
}
