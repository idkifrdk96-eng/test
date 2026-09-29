// HOW OFTEN THE DIAL RE-MEASURES ITSELF, in frames — see `HUD.dialSize`. 30 is 0.5 s at the game's
// own pace: the one case a `ResizeObserver` cannot cover (an observer that is throttled or missing,
// which is a real thing on this platform — the preview harness has been seen to stop delivering
// observer callbacks entirely) still gets its size read back within half a second, and half a second
// of a dial drawn at the wrong size is a cosmetic wobble while a `clientWidth` read every frame was a
// forced layout every frame (**28-32 ms** of the 51-68 ms frames measured at boot; see `setDial`).
const DIAL_RECHECK = 30;

const BOARD_HYPE = ["NICE","COOL","FRESH","SHARP","AWESOME","GNARLY","SPECTACULAR","GLORIOUS","LEGENDARY","COSMIC","ETERNAL","BLESSED","HALAL"];
const HYPE_PRE = ["ULTRA ","MEGA ","HYPER ","NEON ","APEX "];
import { hypeLevel } from "./trickscore.js";

export class HUD {
  constructor() {
    const g = (id) => document.getElementById(id);
    this.state = g("stateLabel");
    this.speedBar = g("speedBar");
    this.speedLabel = g("speedLabel");
    this.gripBar = g("gripBar");
    this.poleBox = g("poleBox");
    this.poleBar = g("poleBar");
    this.poleLabel = g("poleLabel");
    this.fpsLabel = g("fpsLabel");
    this.posLabel = g("posLabel");
    this.biomeLabel = g("biomeLabel");
    this.distLabel = g("distLabel");
    this.chainEl = g("chainEl");
    this.comboEl = g("comboEl");
    this.trickEl = g("trickEl");
    this.jumpsEl = g("jumpsEl");
    this.mouseFreeEl = g("mouseFreeEl");
    this.clashBox = g("clashBox");
    this.clashYou = g("clashYou");
    this.clashHim = g("clashHim");
    this.clashLabel = g("clashLabel");
    this.bestLabel = g("bestLabel");
    this.skyLabel = g("skyLabel");
    this.clockLabel = g("clockLabel");
    this.cross = g("cross");
    this.lockEl = g("lockEl");
    this.help = g("help");
    this.settingsList = g("settingsList");
    this.settingsPanel = g("settings");
    this.overlay = g("overlay");
    this.overlayTitle = g("overlayTitle");
    this.overlaySub = g("overlaySub");
    this.startBtn = g("startBtn");
    this.touchUI = g("touch");
    // The whole page's root, kept for the one thing a panel has to say about the screen it is drawn
    // over rather than about itself: which of the HUD's halves belong to it (see `showOptions`).
    this.game = g("game");
    // ...and the phone's own copies of four of those meters (see `setTouchDial`): the three skill
    // buttons and the ultimate, which wear the dial's numbers as a cooldown veil.
    this.touchMeters = {
      skill: [g("btnWhirl"), g("btnScissor"), g("btnCapo")],
      ult: g("btnUlt"),
    };
    this.optionsPanel = g("options");
    this.optionsScroll = g("optScroll");
    this.optBtn = g("optBtn");
    this.fsBtn = g("fsBtn");
    this.optClose = g("optClose");
    this.optRespawn = g("optRespawn");
    this.optReset = g("optReset");
    this.optSub = g("optSub");
    // THE UPDATE LOG (see "the update log" in index.html / `UPDATES` in main.js): one more card
    // hung off the top-right row, with the list itself dropped in by `renderLog`.
    this.logPanel = g("updateLog");
    this.logScroll = g("logScroll");
    this.logBtn = g("logBtn");
    this.logClose = g("logClose");
    // The dial (see `setDial`): its canvas, a cached 2D context, and the rank letters beside it.
    this.dial = g("dial");
    this.dialCtx = null;
    // THE BOARD'S OWN SCORE (the skate scoreboard): a number hung right under the wheel that climbs
    // with landed tricks and pays out in rank-like colour tiers (see `setBoardScore`). Built here
    // rather than in the markup so the shell's front-cut rebuild can never take it — the HUD is
    // constructed after `bootUI`, so this survives both a healthy boot and a rebuilt one.
    this.dialBox = g("dialBox");
    this.boardScoreEl = g("boardScore") || document.createElement("div");
    this.boardScoreEl.id = "boardScore";
    this.boardScoreEl.className = "boardScore boardDim";
    this.boardScoreEl.innerHTML = '<span class="bsTop"><span class="bsLabel">SCORE</span><span class="bsMult">×1</span></span><span class="bsNum">0</span><div class="bsTierBar"><div class="bsTierFill"></div></div><div class="bsChainBar"><div class="bsChainFill"></div></div><span class="bsWord">NICE</span>';
    this.bsMult = this.boardScoreEl.querySelector(".bsMult");
    this.bsNum = this.boardScoreEl.querySelector(".bsNum");
    this.bsWord = this.boardScoreEl.querySelector(".bsWord");
    this.bsTierFill = this.boardScoreEl.querySelector(".bsTierFill");
    this._lastTierPct = -1;
    this._lastBoardLvl = 0;
    this.bsChainBar = this.boardScoreEl.querySelector(".bsChainBar");
    this.bsChainFill = this.boardScoreEl.querySelector(".bsChainFill");
    if (!this.boardScoreEl.parentNode && this.dialBox && this.dialBox.parentNode) {
      this.dialBox.parentNode.insertBefore(this.boardScoreEl, this.dialBox.nextSibling);
    }
    // ...and the dial's own CSS size, which is CACHED rather than read (see `dialSize`): `_dialCss`
    // is the last measurement, `0` means "measure again", and `_dialTick` counts the frames since the
    // last read so the slow fallback poll can fire. The observer below is the fast half — every real
    // resize (a viewport change, an orientation flip, the phone breakpoint, the text-size option
    // moving `--dial`) invalidates the cache the moment layout settles, at no per-frame cost.
    this._dialCss = 0;
    this._dialTick = 0;
    this._lastSpeed = "";
    this._lastPos = "";
    this._lastDist = "";
    this._lastBest = "";
    this.rankEl = g("rankEl");
    // ...and the AIR COMBO's diamond in the corner of the same box (see "The dive launch"): the
    // box, the fill rect `setDial` moves, and the last values drawn, so a class is only touched on
    // a change rather than every frame.
    this.airBox = g("airBox");
    this.airFill = g("airFill");
    this._airFrac = -1;
    this._airReady = null;
    this._airOpen = null;
    this._airFlash = false;
    this._lastState = "";
    this._lastHint = "";
    this._lastChain = -1;
    this._lastCombo = -1;
    this._lastComboLabel = "";
    this._clashOn = false;
    this._clashYou = -1;
    this._clashHim = -1;
    this._mouseFree = false;
    this._shiftLock = false;
    // ...and the dial's size observer (see `_dialCss` / `dialSize`). It only ever sets the cache to
    // "stale"; the actual read happens in `dialSize`, on the next frame, off the layout the browser
    // was going to do anyway.
    if (this.dial && typeof ResizeObserver === "function") {
      try {
        new ResizeObserver(() => { this._dialCss = 0; }).observe(this.dial);
      } catch (e) { /* an observer that cannot be made is what the fallback poll is for */ }
    }
  }

  setStateText(t) {
    if (t === this._lastState) return;
    this._lastState = t;
    this.state.textContent = t;
    // Keep the `tag` base class: the state class alone used to replace it, which threw away the
    // tag's box (border, padding, the accent bar) the moment the first state was set.
    this.state.className = "tag s-" + t.toLowerCase().replace(/\s/g, "");
    this.state.classList.add("pop");
    setTimeout(() => this.state.classList.remove("pop"), 90);
  }

  // THE SPEED READOUT IS WRITTEN ON A CHANGE, AND ONLY ON A CHANGE.
  //
  // That is not a micro-optimisation, it is the single biggest cost in the HUD's own frame. `#speedLabel`
  // wears the TAG TEXT (`#speedLabel` is not in tagtext.js's `SEL`, but `.gaugeTop span` is — the same
  // element), and a write to a tagged host is an expensive event: the mutation observer sees the text
  // node move, the host's hand-set letter spans are thrown away, and `processHost` rebuilds them — and
  // the rebuild has to read `getComputedStyle` off the host to know its font size, its shadow and its
  // bite, which **forces a layout**. Measured on the live page before this guard existed, with the game
  // simply standing still: **`#speedLabel` and `#interactPrompt` were re-tagged on EVERY frame** (82
  // rebuilds in 82 frames, 164 `getComputedStyle` reads), and the frames carrying the forced layout
  // (LoAF: 28-32 ms of it inside this game's own callback) ran **51-68 ms** against a 16 ms budget.
  //
  // The bar is still written every frame — it is a continuous meter and a *style* write that nothing
  // reads back in the same frame just joins the frame's own style pass — but the NUMBER only moves in
  // tenths, so the string is what the guard compares. Holding a steady speed now costs zero DOM work
  // per second, and at the title screen (where nothing moves at all) it cost zero from the first frame.
  setSpeed(v) {
    this.speedBar.style.width = Math.min(100, (v / 28) * 100) + "%";
    const s = v.toFixed(1) + " m/s";
    if (s !== this._lastSpeed) {
      this._lastSpeed = s;
      this.speedLabel.textContent = s;
    }
    this.speedBar.classList.toggle("hot", v > 11);
  }

  setGrip(v) {
    this.gripBar.style.width = Math.min(100, v * 100) + "%";
    this.gripBar.classList.toggle("low", v < 0.35);
  }

  // THE STAFF's durability (see `#poleBox` in index.html and the `POLE_HP` block in player.js).
  //
  // `hp` is the live count of strikes the wood has left, or `null` when nothing is in his hands — and
  // the ONE thing this method has to get right is that distinction, because the gauge has to be GONE
  // when there is no staff and the difference between "one strike left" and "no staff" is the whole
  // point of the readout. `null` (or a missing element) hides the box and clears the cache; a number
  // shows it, writes the bar as a fraction of `P.POLE_HP`, and writes the count as `n / max`.
  //
  // The label is written ONLY on a change, for the reason `#speedLabel` is (see the long note on
  // `setSpeed`): `.gaugeTop span` is in tagtext.js's `SEL`, so every write is a re-tag with its own
  // forced layout, and a count that moves once per strike does not need to be written sixty times a
  // second to be true. The bar's width is a style write nothing reads back, so it can go every frame.
  setPole(hp, max) {
    const box = this.poleBox;
    if (!box) return;
    if (hp === null || hp === undefined) {
      if (this._poleOn !== false) {
        this._poleOn = false;
        box.classList.add("hidden");
        this._poleLabel = "";
      }
      return;
    }
    if (this._poleOn !== true) {
      this._poleOn = true;
      box.classList.remove("hidden");
    }
    const m = max || 5;
    const f = Math.max(0, Math.min(1, hp / m));
    this.poleBar.style.width = (f * 100).toFixed(1) + "%";
    this.poleBar.classList.toggle("low", hp <= 1);
    const s = hp + " / " + m;
    if (s !== this._poleLabel) {
      this._poleLabel = s;
      this.poleLabel.textContent = s;
    }
  }

  setFps(v) {
    this.fpsLabel.textContent = v.toFixed(0) + " FPS";
    this.fpsLabel.classList.toggle("bad", v < 40);
  }

  // The three position readouts below are NOT tagged (none of `#posLabel`, `#distLabel` or `#bestLabel`
  // is in tagtext.js's `SEL`), so a repeat write here never rebuilt any spans — but it was still a text
  // node replaced, a style invalidated on that element and a mutation record delivered to the observer
  // every frame, for a number that changes at most once per metre. Same guard, same reason.
  setPos(x, z) {
    const s = (x | 0) + " , " + (z | 0);
    if (s !== this._lastPos) {
      this._lastPos = s;
      this.posLabel.textContent = s;
    }
  }

  setBiome(name) {
    if (this.biomeLabel.textContent !== name) this.biomeLabel.textContent = name;
  }

  setSky(label, clock, mood) {
    if (this._lastSky !== label) {
      this._lastSky = label;
      this.skyLabel.textContent = label;
      this.skyLabel.dataset.mood = mood;
    }
    if (this._lastClock !== clock) {
      this._lastClock = clock;
      this.clockLabel.textContent = clock;
    }
  }

  setDist(d) {
    const s = (d | 0) + " m from spawn";
    if (s !== this._lastDist) {
      this._lastDist = s;
      this.distLabel.textContent = s;
    }
  }

  setBest(v) {
    const s = "BEST " + v.toFixed(1) + " m/s";
    if (s !== this._lastBest) {
      this._lastBest = s;
      this.bestLabel.textContent = s;
    }
  }

  setChain(n) {
    if (n === this._lastChain) return;
    this._lastChain = n;
    if (n >= 2) {
      this.chainEl.textContent = "CHAIN x" + n;
      this.chainEl.classList.remove("hidden");
    } else {
      this.chainEl.classList.add("hidden");
    }
  }

  // The melee chain's own counter (player.js `attackContact`): which move just landed and how
  // many of them are in a row, held up for a beat after each hit. Deliberately a separate
  // element from the bhop `setChain` above — a parkour chain and a fist chain are not the same
  // stat, and sharing one slot would have them overwrite each other mid-combo.
  setCombo(n, label) {
    if (n === this._lastCombo && label === this._lastComboLabel) return;
    this._lastCombo = n;
    this._lastComboLabel = label;
    if (n > 0) {
      this.comboEl.textContent = label + (n > 1 ? "  x" + n : "");
      this.comboEl.className = "combo n" + Math.min(4, n);
    } else {
      this.comboEl.className = "combo hidden";
    }
  }

  // THE TRICK THAT JUST LANDED (session 201 — the skateboard's own readout, and the same shape as
  // `setCombo` above). The board's M1 throws six named things (see `BOARD_TRICKS` in streetwear.js)
  // and the same key lands them all, so until this the only difference between a KICKFLIP and a
  // SHUVIT was a half-second of deck spin the player is not looking at — the one piece of the ride
  // that had rules but no voice. This holds the name up for a beat after the wheels come back down
  // (the hold clock is `TRICK_HOLD` in main.js, which owns the timer the way `comboT` owns the
  // melee's), and `label` empty is the same call the melee counter uses to stand down. Styled in the
  // deck's mint rather than the fist's red, so a glance never confuses the two counters.
  setTrick(label) {
    if (label === this._lastTrick) return;
    this._lastTrick = label;
    if (label) {
      this.trickEl.textContent = label;
      this.trickEl.classList.remove("hidden");
    } else {
      this.trickEl.classList.add("hidden");
    }
  }

  // THE BOARD'S OWN SCORE (the skate scoreboard). A plain number under the wheel, paying out
  // in the combat ranks' own language: seven colour tiers it climbs left-to-right as the total
  // grows, the text running the current tier's colour into the next one's. Bailing wipes it (see
  // `bailBoard`), so the number is also the run's nerve.
  setBoardScore(n, riding, mult, chainFrac = 0, multColor = null) {
    const v = Math.max(0, Math.floor(n || 0));
    const m = Math.max(1, Math.floor(mult || 1));
    const lvl = hypeLevel(v);
    const rep = Math.floor(lvl / BOARD_HYPE.length);
    // Clean hype title: no confusing duplicate "×2" appended to the word
    const word = (rep > 0 ? HYPE_PRE[(rep - 1) % HYPE_PRE.length] : "") + BOARD_HYPE[lvl % BOARD_HYPE.length];
    const t = lvl % 7;
    const on = !!riding;
    const el = this.boardScoreEl;
    if (!el) return;

    if (v !== this._lastBoardScore && v > (this._lastBoardScore || 0)) {
      el.classList.remove("pop");
      // Trigger pop animation on score increase
      void el.offsetWidth;
      el.classList.add("pop");
    }

    if (v !== this._lastBoardScore && this.bsNum) {
      this.bsNum.textContent = v;
      this._lastBoardScore = v;
    }

    if (word !== this._lastBoardWord && this.bsWord) {
      this._lastBoardWord = word;
      this.bsWord.textContent = word;
      const L = word.length;
      this.bsWord.style.fontSize = L > 12 ? "calc(var(--fs) * 0.62)" : L > 8 ? "calc(var(--fs) * 0.8)" : "";
      this.bsWord.style.letterSpacing = L > 8 ? "0.03em" : "";
    }

    if (this.bsMult) {
      const mt = m > 1 ? "×" + m + " COMBO" : "×1";
      if (this.bsMult.textContent !== mt) this.bsMult.textContent = mt;
      this.bsMult.classList.toggle("hot", m > 1);
      const mc = m > 1 ? (multColor || "#ffd75a") : "";
      if (this._lastMultColor !== mc) {
        this._lastMultColor = mc;
        this.bsMult.style.color = mc;
      }
    }

    if (this.bsChainBar && this.bsChainFill) {
      if (m > 1 && chainFrac > 0) {
        this.bsChainBar.classList.add("active");
        this.bsChainFill.style.width = Math.min(100, Math.max(0, chainFrac * 100)) + "%";
      } else {
        this.bsChainBar.classList.remove("active");
      }
    }

    this._lastBoardOn = on;
    this._lastBoardMult = m;
    const leveled = lvl > (this._lastBoardLvl || 0);
    this._lastBoardLvl = lvl;
    if (lvl === 0) this._boardTierUp = false;
    if (this.bsTierFill) {
      const lo = lvl <= 0 ? 0 : 400 * Math.pow(lvl, 1 / 0.72);
      const hi = 400 * Math.pow(lvl + 1, 1 / 0.72);
      const pct = hi > lo ? Math.round(Math.min(100, Math.max(0, (v - lo) / (hi - lo) * 100))) : 100;
      if (pct !== this._lastTierPct) {
        this._lastTierPct = pct;
        this.bsTierFill.style.width = pct + "%";
      }
    }
    this._lastBoardTier = t;
    el.className = "boardScore s" + t + (on ? " boardOn" : " boardDim") + (this._boardTierUp ? " tierUp" : "");
    if (leveled) {
      el.classList.remove("tierUp");
      void el.offsetWidth;
      el.classList.add("tierUp");
      this._boardTierUp = true;
    }
  }

  // =========================================================================
  // THE DIAL (the user's concept HUD).
  //
  // One circular gauge in the top-left corner, drawn on its own canvas: a GREEN core for health, a
  // ring of three RED pills for the skills, a CYAN ring for the ultimate, and the GOLD rank letters
  // in the DOM beside it (text is the one thing a canvas is worse at than CSS, and the rank is
  // meant to read as text). Everything the four meters ARE lives in abilities.js; this is only the
  // drawing, and it is written the way the concept is: hard flat fills, a black rim on every layer,
  // and no anti-aliased softness anywhere the palette can avoid it.
  //
  // The geometry is all fractions of the radius so the dial can be any size (it is 148 CSS px on a
  // desktop and 118 on a phone — see the `#dial` rule in index.html), and every angle starts at 12
  // o'clock and runs CLOCKWISE, which is the direction a depleting bar is read in.
  // =========================================================================
  // The dial's own CSS width in px, READ ONCE AND KEPT — see the long note in `setDial` for why this
  // is a function at all rather than the one line it replaced. `0` means "measure again": the observer
  // in the constructor sets it on every real resize, and `DIAL_RECHECK` frames is the slow fallback —
  // which is advanced by `tickDial`, called once a frame from the TOP of the game loop, because WHEN
  // the fallback read happens is half of what makes it cheap (see `tickDial`).
  tickDial() {
    this._dialTick = (this._dialTick || 0) + 1;
  }

  dialSize() {
    const cv = this.dial;
    if (!cv) return 148;
    if (this._dialCss > 0 && this._dialTick < DIAL_RECHECK) return this._dialCss;
    this._dialTick = 0;
    this._dialCss = Math.max(48, Math.round(cv.clientWidth || 148));
    return this._dialCss;
  }

  setDial(d) {
    const cv = this.dial;
    if (!cv) return;
    // THE SIZE IS CACHED, AND THAT IS THE WHOLE POINT OF PUTTING IT IN A METHOD.
    //
    // `cv.clientWidth` looks like a property read and is actually a FORCED SYNCHRONOUS LAYOUT: the
    // browser cannot answer it without flushing any style and layout that is pending, and this line was
    // asking it every single frame — from the worst possible place. `setDial` runs at the END of the
    // HUD block in `frame()`, after `setSpeed` / `setGrip` / `setPos` / `setBiome` have already written
    // their text and their bar widths, so every frame began by dirtying the HUD and then demanding the
    // layout be settled again to read one integer that only ever changes when the WINDOW does.
    //
    // Measured on the live page, with the game standing still: 76 `clientWidth` reads in 76 frames
    // (1.00 per frame, straight into `setDial`), and the LoAF records of the frames that carried it ran
    // 51-68 ms with **28-32 ms of forced style-and-layout inside this game's own rAF callback**.
    // Measured again after the cache: 1.00 reads per frame became **0.03** (the fallback poll, one frame
    // in 30) and the forced-layout share of an ordinary frame fell to nothing that registers.
    //
    // It is re-measured on a CHANGE rather than on a frame: the `ResizeObserver` in the constructor
    // marks the cache stale the moment the canvas's box actually moves (a resize, an orientation flip,
    // the 760 px breakpoint, the text-size option moving `--dial`), and `DIAL_RECHECK` frames is the
    // fallback poll for an observer that never fires at all.
    //
    // THE FALLBACK POLL READS FROM THE TOP OF THE FRAME, NOT FROM HERE. Even one read a second is one
    // read too many from INSIDE this method: `setDial` is the last thing the HUD block does, so by the
    // time it runs `setSpeed` / `setGrip` / `setPos` / `setSky` have already written their styles and
    // the page is dirty — a `clientWidth` read here does not answer from the layout that exists, it
    // FORCES the pending one. Measured on the frame the PLAY press lands on (the frame where the most
    // style is invalidated at once): 41 ms of frame work, LoAF crediting **21 ms of it to forced
    // style-and-layout**, and a patched `clientWidth` naming exactly two callers in the whole second —
    // this poll, and this poll. `hud.tickDial()` is called from the top of `loop`, beside
    // `checkViewport()`, where nothing has been written yet in this frame and the browser's own layout
    // from the last one is still valid: the read answers from it and forces nothing.
    const css = this.dialSize();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    if (cv.width !== px || cv.height !== px) {
      cv.width = px;
      cv.height = px;
    }
    const g = this.dialCtx || (this.dialCtx = cv.getContext("2d"));
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    g.scale(dpr, dpr);

    const c = css / 2;
    const R = c - 2.5;
    const TAU = Math.PI * 2;
    const top = -Math.PI / 2;
    const q = (v) => Math.max(0, Math.min(1, v));   // every input is clamped: a NaN here draws nothing
    const black = "#07090c";

    // A ring segment with the concept's rim: the same arc stroked once in black and once in colour.
    // The rim is CHUNKY on purpose — the whole reference is flat fills with heavy black wherever two
    // fills meet — so the black pass is the colour's own width plus 4.4 px (≈ 2.2 px of rim either
    // side), not a hairline.
    //
    // THE BANDS ARE THE USER'S DRAWING, MEASURED (session 161).
    //
    // The user re-sent the concept — *"the ui on the top left look excatly like the image i sent"*,
    // the same 83x41 crop of the gauge's own top-left that session 142 read as having "nothing new to
    // say about the dial" — and this time it was read off the pixels instead of off the notes. A radial
    // profile of the crop (averaged over the quadrant it shows, one ring of pixels at a time) gives:
    // the GREEN core out to **0.63 of the outer radius**, a black seam, the RED band at **0.73-0.85**,
    // a wide black seam, and the CYAN ring at **0.95-0.98** — with only ~2 px of ink outside that, so
    // the ring sits ON the dial's edge. The old bands were 0.545 / 0.605 (gold) / 0.6725-0.8275 /
    // 0.89-0.97: a smaller green core, FOUR bands where the drawing has three, and the outer ring
    // floating a 0.05 R inside the rim. So the drawing did have something new to say, and this is it —
    // the three bands sit where the drawing puts them, and the gold RANK ARC is gone from the canvas
    // entirely, because the drawing has no gold ring at all: its gold is the LETTERS, which is also how
    // the original brief read it — *"Style rank is the yellow or gold or the SSS text"*. What is left
    // of that meter fills the letters from the bottom (see `--rank-p` below).
    //
    // AND THE DIAL IS ONE BLACK PLATE UNDERNEATH THEM. Every boundary between two fills in the drawing
    // is black, and the old code got that by spacing the bands so their rims just touched — a layout
    // that springs a hole the moment a band moves (and the three-band version above has a seam twice
    // as wide as the rims can cover). So the whole disc is filled in ink ONCE and the bands are painted
    // onto it: every seam is black by construction, whatever the bands do.
    const seg = (r, w, a0, a1, col, cap) => {
      if (Math.abs(a1 - a0) < 0.001) return;
      g.lineCap = cap || "butt";
      g.beginPath(); g.arc(c, c, r, a0, a1);
      g.lineWidth = w + 4.4; g.strokeStyle = black; g.stroke();
      g.beginPath(); g.arc(c, c, r, a0, a1);
      g.lineWidth = w; g.strokeStyle = col; g.stroke();
    };

    // ---- 0. the plate (the drawing's ink, under every layer) ----
    // One black disc to the outer rim's own edge, so the seams between the bands are ink no matter
    // where the bands sit — and so the ~2 px of edge the drawing has outside the cyan ring is there.
    g.beginPath();
    g.arc(c, c, R + 2.2, 0, TAU);
    g.fillStyle = black;
    g.fill();

    // ---- 1. the health core (the GREEN pie) ----
    // Drawn first so everything else rims on top of it. The depleted part is not empty: it is the
    // dark core, so the dial keeps its silhouette at 1 hp — which is also what the reference does.
    // 0.63 R is the drawing's own green: the core is what the gauge is mostly MADE of out there.
    const coreR = R * 0.63;
    g.beginPath(); g.arc(c, c, coreR, 0, TAU);
    g.fillStyle = "#0b1510"; g.fill();
    g.lineWidth = 3.6; g.strokeStyle = black; g.stroke();
    const hp = q(d.hp);
    if (hp > 0.001) {
      g.beginPath();
      g.moveTo(c, c);
      g.arc(c, c, coreR, top, top + TAU * hp);
      g.closePath();
      g.fillStyle = d.hurt > 0.02 ? "#e8f0a0" : "#39c447";   // a hit washes the core out for a beat
      g.fill();
      g.lineWidth = 3.4; g.strokeStyle = black; g.stroke();
    }
    // ...and the concept's own radial dividers, drawn over the whole core, so a half-drained disc
    // still reads as a segmented gauge rather than as a smaller disc. SIXTEEN of them, not five: read
    // off the drawing the same way the bands were, a luminance walk round a ring inside the green
    // finds the darker runs at ~22, 45, 66 and 88 degrees — one line every 22.5 degrees, four to a
    // quadrant (session 161; the old five were a misreading of the same crop). They are thin: the
    // drawing's own measure under two pixels at its size, and sixteen of anything has to stay thin to
    // leave the disc green, so the width is a fraction of R like everything else on this canvas.
    g.strokeStyle = "rgba(6, 10, 8, 0.9)";
    g.lineWidth = R * 0.028;
    const spokes = 16;
    for (let i = 0; i < spokes; i++) {
      const a = top + (TAU * i) / spokes;
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(c + Math.cos(a) * coreR, c + Math.sin(a) * coreR);
      g.stroke();
    }

    // ---- 2. the three skill pills (the RED ring) ----
    // Three equal segments, a gap between them, and each one fills from its own start as its
    // cooldown runs down — so a pill that is short is a skill that is not back yet.
    //
    // The gap is a FRACTION OF THE PILL'S OWN SLOT, not an arc length: the three slots and their two
    // gaps have to add up to exactly the whole ring or the last pill runs into the first. (Writing it
    // as `R * something` is what collapsed all three into one long band — the number was being read
    // as an ANGLE, and 0.3 radians per pixel of radius is most of a circle.)
    const slot = TAU / 3;
    const gap = slot * 0.22;
    const span = slot - gap;
    // 0.785 R at 0.135 R thick is the drawing's red band (0.73-0.85 R) with the numerals' own needs
    // taken out of it: the drawing's band is a little thinner again, but a pill that cannot hold its
    // numeral is a legend nobody reads, so the width keeps the ~1.3 glyph-to-pill ratio it always had.
    const pr = R * 0.785;
    const pw = R * 0.135;
    for (let i = 0; i < 3; i++) {
      const a0 = top + slot * i + gap * 0.5;
      const s = d.skills[i] || { frac: 1, ready: true, fail: 0 };
      // The empty track is a DARK RED rather than a near-black: a pill that is fully recharging has to
      // still read as a pill, and at this size anything darker turns the gap between two pills into
      // one long hole (the whole ring then reads as two segments instead of three).
      seg(pr, pw, a0, a0 + span, "#4d1712", "round");          // the empty track
      if (s.frac > 0.002) {
        seg(pr, pw, a0, a0 + span * q(s.frac), s.ready ? "#ef3b2c" : "#a3241a", "round");
      }
      // A pressed-while-cold pill flashes white, and a READY one gets a thin bright leading edge:
      // the two things a player needs from a cooldown at a glance are "can I use it" and "I just
      // tried and I cannot".
      if (s.fail > 0.02) seg(pr, pw, a0, a0 + span * q(s.frac), "#ffe0a0", "round");
      // The skill's own number, on the inner edge of its pill, in the dial's own ink: the ring is
      // three pills because there are three keys, and this is what says which is which.
      // It sits ON the pill's centreline rather than on its inner edge — a numeral pushed inward
      // would spill over the rank arc underneath — and it is drawn at the largest size the pill's
      // own thickness can hold, with a dark outline, because a label nobody can read at a glance is
      // just noise on the gauge.
      const mid = a0 + span * 0.5;
      g.save();
      g.translate(c + Math.cos(mid) * pr, c + Math.sin(mid) * pr);
      g.rotate(mid + Math.PI / 2);
      // ...on the game's OWN pixel face, not the interface's (see "THE FONT" in src/README.md): this is
      // the one piece of text in the game small enough that a display face loses it — at the 14 px the
      // pill's thickness allows, the street face's 2 and 3 close their counters into mush, while a
      // glyph built on a whole-pixel grid is still a whole-pixel 2 and 3. It is a legend for the three
      // pills, and a legend nobody can read is noise.
      g.font = Math.round(R * 0.19) + "px AdaptChunk, ui-monospace, Menlo, Consolas, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = R * 0.055;
      g.strokeStyle = "rgba(12, 5, 4, 0.8)";
      g.strokeText(String(i + 1), 0, 0);
      // Dim on purpose: the pills are the read and the numeral is the legend, so a skill that is not
      // back yet is written at half strength rather than in the same cream a ready one gets.
      g.fillStyle = s.ready ? "rgba(255, 236, 222, 0.92)" : "rgba(255, 236, 222, 0.45)";
      g.fillText(String(i + 1), 0, 0);
      g.restore();
    }

    // ---- 3. the ultimate (the CYAN ring) ----
    // 0.95 R at 0.06 R thick: the drawing puts the ring ON the dial's edge, with only the dial's own
    // ~2 px of ink outside it, and it is thinner there than this used to be.
    const ur = R * 0.95;
    const uw = R * 0.06;
    // The track runs the whole way round so the dial keeps a rim even at zero charge — and it is a DIM
    // CYAN now rather than the near-black teal it was, because the drawing's ring is cyan at whatever
    // charge: a dark track made the whole outer band disappear into the dial's ink at 0, which is the
    // single biggest way the old gauge did not look like the picture.
    seg(ur, uw, top, top + TAU, "#2b7d8e", "butt");            // the track all the way round
    if (d.over > 0) {
      // OVERDRIVE: the ring becomes the WINDOW — it drains anti-clockwise as the 8 s run out, so
      // the meter that was filled over a whole fight is visibly being spent.
      seg(ur, uw, top, top + TAU * q(d.over), "#9df4ff", "butt");
    } else if (d.ult > 0.001) {
      const pulse = d.ready ? 0.72 + 0.28 * Math.sin(performance.now() * 0.006) : 1;
      seg(ur, uw, top, top + TAU * q(d.ult), "#41d7e5", "butt");
      if (d.ready) {
        // ...and a full one is brighter than a full one that is merely charged, which is the whole
        // difference between "keep going" and "press R".
        g.globalAlpha = 0.35 + 0.35 * pulse;
        seg(ur, uw, top, top + TAU, "#eafcff", "butt");
        g.globalAlpha = 1;
      }
    }
    // The ring's own feedback, drawn STRAIGHT ON the cyan rather than as another ring beside it: a
    // plain stroke, with no black pass — `seg`'s rim on a ring out at this radius would eat the outer
    // half of the very meter it is celebrating. WHITE is "it just came up"; red-orange is R pressed
    // with nothing charged, which is the ultimate's answer to the skill pills' own cold-press flash.
    if (Math.abs(d.readyPulse) > 0.02) {
      g.globalAlpha = q(Math.abs(d.readyPulse)) * 0.85;
      g.beginPath(); g.arc(c, c, ur, top, top + TAU);
      g.lineWidth = uw * 0.55;
      g.strokeStyle = d.readyPulse > 0 ? "#ffffff" : "#ff6a4a";
      g.stroke();
      g.globalAlpha = 1;
    }

    // ---- 4. the rank (the GOLD text) ----
    // THERE IS NO GOLD BAND ON THE GAUGE ANY MORE. The drawing has none — its gold is the letters and
    // nothing else — and a fourth band is exactly what was crowding the three the drawing does have
    // out of their positions (see the plate note above). The meter that the arc used to be is not gone,
    // it MOVED: the letters fill from the BOTTOM with it, which is the purple diamond's own language
    // for "how much of this is back", so a rank letter is solid gold at the top of its band and dimmer
    // the further there is left to climb. `--rank-p` is the only thing written here, and it is written
    // in 2% steps and only when it moves: this is a style write on a text node's host, and the HUD has
    // a whole section in README about what writing one of those every frame costs.
    const rk = this.rankEl;
    if (rk) {
      if (rk.textContent !== d.rank) {
        rk.textContent = d.rank;
        rk.dataset.n = String(d.rankIndex);
        rk.classList.remove("pop");
        void rk.offsetWidth;      // restart the animation
        rk.classList.add("pop");
      }
      // The dim overlay is the SAME glyph — `#rankEl::before` reads `data-r` — so it has to be kept in
      // step with the text. Written only when it differs, like every other HUD write here.
      if (rk.dataset.r !== d.rank) rk.dataset.r = d.rank;
      rk.classList.toggle("loss", d.rankPulse < -0.02);
      rk.classList.toggle("sss", d.rankIndex >= 6);
      // A rank at the top has nothing left to climb, so it is full.
      const rp = d.rankIndex >= 6 ? 1 : q(d.rankProgress);
      const step = Math.round(rp * 50) / 50;
      if (this._rankP !== step) {
        this._rankP = step;
        rk.style.setProperty("--rank-p", step.toFixed(2));
      }
    }

    // ---- 5. the AIR COMBO's diamond (see "The dive launch" in README.md) ----
    // The one readout that is not on this canvas, because it lives in the corner of the dial's BOX
    // rather than inside its circle. It draws the dive launch's own cooldown (`player.airCd`), and
    // it reads exactly like the pills: the body of the shape fills from the BOTTOM as the clock
    // runs down, so an empty diamond is a move that has just been spent and a full one is a move
    // that is back. The fill is one rect under the diamond's own clip, so "how much is back" is one
    // y and one height — no path maths, and it cannot spill outside the shape.
    const ab = this.airBox;
    if (ab && this.airFill) {
      const a = d.air || { frac: 1, ready: true, flash: 0, open: false };
      const f = q(a.frac);
      // A cooldown of zero draws a FULL diamond, and `frac` is written from the player's clock, so
      // a rounding error at the top would leave a sliver of this move permanently missing: snap it.
      const ff = a.ready ? 1 : f;
      if (this._airFrac !== ff) {
        this._airFrac = ff;
        const h = 34.8 * ff;
        this.airFill.setAttribute("y", (37.4 - h).toFixed(2));
        this.airFill.setAttribute("height", h.toFixed(2));
      }
      if (this._airReady !== a.ready) {
        this._airReady = a.ready;
        ab.classList.toggle("airReady", a.ready);
      }
      if (this._airOpen !== a.open) {
        this._airOpen = a.open;
        ab.classList.toggle("airOpen", a.open);
      }
      // The flash is a one-shot: the class is left on for as long as the pulse lasts and then taken
      // off, which is what re-arms it for the next launch (an animation only replays on a re-add).
      const flashing = a.flash > 0.02;
      if (flashing !== this._airFlash) {
        this._airFlash = flashing;
        ab.classList.toggle("airFlash", flashing);
      }
    }

    // ...and the phone's four buttons, off the same object (see `setTouchDial`).
    this.setTouchDial(d);
  }

  // ---- THE PHONE'S OWN METERS (see "THE PHONE" in index.html) -----------------------------------
  // The dial is one canvas in a corner. On a phone the same four meters are ALSO four squares under
  // the right thumb — and until now those squares said nothing whatsoever about them: a skill that
  // was ready and a skill that was spent looked identical, so a press the game refused did not
  // happen as far as the player could tell. This writes the dial's own numbers onto the buttons:
  // `--cd` (1 fully cold, 0 ready) sizes the veil the CSS draws, and a `ready` class lights the
  // frame. Both are only written on a CHANGE, the same way the air diamond above is.
  //
  // The ultimate is the odd one out: its `frac` is a CHARGE climbing up from empty rather than a
  // cooldown running down, so its veil is `1 - ult` and the button fills toward READY exactly as
  // the cyan ring does. (The guard is held, not fired, so it has no meter at all.)
  setTouchDial(d) {
    // ...and it stands down entirely when the touch layer is not on screen (a desktop, or the pocket
    // editor, which hides it): the writes are cheap but they are still four elements' worth of style
    // invalidation every frame of a cooldown, and there is nothing on the other end of them.
    if (!this.touchMeters || !this.touchUI || this.touchUI.hidden) return;
    const clamp = (v) => Math.max(0, Math.min(1, v || 0));
    const paint = (el, cd, ready) => {
      if (!el) return;
      if (el._cd !== cd) {
        el._cd = cd;
        el.style.setProperty("--cd", cd.toFixed(3));
      }
      if (el._ready !== ready) {
        el._ready = ready;
        el.classList.toggle("ready", ready);
      }
    };
    for (let i = 0; i < 3; i++) {
      const s = d.skills && d.skills[i];
      if (!s) continue;
      paint(this.touchMeters.skill[i], s.ready ? 0 : 1 - clamp(s.frac), s.ready);
    }
    paint(this.touchMeters.ult, d.ready ? 0 : 1 - clamp(d.ult), d.ready);
  }

  // THE M1 CLASH's race bar (see `startClash` in player.js and "The M1 CLASH" in README.md). The
  // two meters are the raw `clash.push` / `clash.ePush` (the first to `P.CLASH_WIN` takes the lock),
  // so the player's fill grows from the left and the enemy's from the right and they meet in the
  // middle. The label is the honest read of the gap, because the whole mechanic is "who spams
  // faster" and the bar alone does not say which way it is going.
  setClash(you, him) {
    const on = you !== null && you !== undefined && him !== null && him !== undefined;
    if (on === this._clashOn && (!on || (you === this._clashYou && him === this._clashHim))) return;
    this._clashOn = on;
    this._clashYou = you;
    this._clashHim = him;
    if (!on) {
      this.clashBox.classList.add("hidden");
      return;
    }
    this.clashBox.classList.remove("hidden");
    this.clashYou.style.width = (Math.min(1, you) * 50).toFixed(1) + "%";
    this.clashHim.style.width = (Math.min(1, him) * 50).toFixed(1) + "%";
    this.clashLabel.textContent = you > him ? "MASH! MASH!" : you < him ? "PUSHED BACK" : "EVEN";
  }

  setJumps(left, grounded) {
    if (this._lastJumps === left && this._lastGrounded === grounded) return;
    this._lastJumps = left;
    this._lastGrounded = grounded;
    const max = 1;
    if (grounded || left <= 0) {
      this.jumpsEl.classList.add("hidden");
      return;
    }
    let dots = "";
    for (let i = 0; i < max; i++) dots += i < left ? "\u25cf" : "\u25cb";
    this.jumpsEl.textContent = "AIR JUMP " + dots;
    this.jumpsEl.classList.remove("hidden");
  }

  setMouseFree(on) {
    if (on === this._mouseFree) return;
    this._mouseFree = !!on;
    if (this.mouseFreeEl) this.mouseFreeEl.classList.toggle("hidden", !on);
  }

  // The action HINT BAR used to be drawn here (`setHint` wrote `hintText()` into a strip across
  // the bottom of the screen). It was REMOVED at the user's request — the bar showed up on almost
  // every action, and the player who asked for it gone had learned the moves long before. The
  // strings themselves are still in `hintText()` (main.js) and still on `GAME.hintText`, so putting
  // it back is this method, `this.hint = g("hint")` in the constructor, the div and its CSS in
  // index.html, and the one call in main.js. See "The hint bar was REMOVED" in src/README.md.

  // SHIFT LOCK (ALT — see `P.LOCK_*` in player.js). The only thing the HUD owns of it is the
  // reticle: the plain centre dot becomes the four-armed `+` of a locked aim (and grows a little),
  // which is the user's own *"my cross hair turns into a +"*. The arms are CSS, so the change is a
  // transition rather than a swap — the dot stays exactly where it was and the arms unfold off it.
  setShiftLock(on) {
    const want = !!on;
    if (want === this._shiftLock) return;
    this._shiftLock = want;
    if (this.cross) this.cross.classList.toggle("lock", want);
    if (this.lockEl) this.lockEl.classList.toggle("hidden", !want);
  }

  toggleHelp() {
    this.help.classList.toggle("hidden");
  }

  showHelp(show) {
    this.help.classList.toggle("hidden", !show);
  }

  showSettings(list) {
    let html = "";
    for (const item of list) {
      html +=
        '<div class="setRow"><span class="key">' +
        item.key +
        '</span><span class="nm">' +
        item.name +
        '</span><span class="val ' +
        (item.on ? "on" : "off") +
        '">' +
        (item.on ? "ON" : "OFF") +
        "</span></div>";
    }
    this.settingsList.innerHTML = html;
  }

  renderOptions(items) {
    let html = "";
    for (const it of items) {
      if (it.type === "section") {
        html += '<div class="optSec">' + it.name + "</div>";
      } else if (it.type === "note") {
        html += '<div class="optNote">' + it.name + "</div>";
      } else if (it.type === "swatches") {
        // A wardrobe: one colour well per family. The well IS the label — the real
        // `<input type="color">` is transparent and laid over it, so a click anywhere on the
        // swatch opens the platform picker but the row reads as a painted chip.
        html += '<div class="swGrid" id="swGrid">';
        for (const s of it.items) {
          html +=
            '<label class="swCell' +
            (s.off ? " off" : "") +
            '" title="' +
            s.name +
            '"><span class="swName">' +
            s.name +
            '</span><span class="swBox" id="swBox_' +
            s.id +
            '" style="--sw:' +
            s.value +
            '"><input class="swIn" type="color" id="sw_' +
            s.id +
            '" value="' +
            s.value +
            '"></span></label>';
        }
        html += "</div>";
      } else if (it.type === "presets") {
        html += '<div class="chipRow">';
        for (const p of it.presets) {
          let dots = "";
          for (const c of p.chips) dots += '<i style="--c:' + c + '"></i>';
          html +=
            '<button class="chip' +
            (p.on ? " on" : "") +
            '" data-act="outfit" data-outfit="' +
            p.id +
            '" title="' +
            p.name +
            '">' +
            dots +
            "<b>" +
            p.name +
            "</b></button>";
        }
        html += "</div>";
      } else if (it.type === "slider") {
        const step = it.step || 1;
        const disp = it.disp !== undefined ? it.disp : it.value;
        html +=
          '<div class="optRow sliderRow"><span class="okey"> </span><span class="onm">' +
          it.name +
          '</span><span class="oval on" id="optVal_' +
          it.act +
          '">' +
          disp +
          '</span><input class="orange" type="range" id="opt_' +
          it.act +
          '" min="' +
          it.min +
          '" max="' +
          it.max +
          '" step="' +
          step +
          '" value="' +
          it.value +
          '"></div>';
      } else {
        html +=
          '<div class="optRow" data-act="' +
          it.act +
          '"><span class="okey">' +
          (it.key || "&nbsp;") +
          '</span><span class="onm">' +
          it.name +
          '</span><span class="oval ' +
          (it.on ? "on" : "off") +
          '">' +
          (it.value !== undefined ? it.value : it.on ? "ON" : "OFF") +
          "</span></div>";
      }
    }
    this.optionsScroll.innerHTML = html;
  }

  setOptSub(text) {
    if (this.optSub) this.optSub.textContent = text || "";
    this.optSub.classList.toggle("flash", !!text);
    if (text) {
      this._subTimer = setTimeout(() => this.setOptSub(""), 1600);
    }
  }

  // ...and the right-hand READOUTS stand down while the card is up (see "THE RIGHT SIDE STANDS DOWN
  // FOR THE OPTIONS MENU" in index.html). The class is written HERE, by the pair that already shows
  // and hides the card, so it can never drift out of step with the panel it belongs to.
  showOptions() {
    this.optionsPanel.classList.remove("hidden");
    this.optBtn.classList.add("on");
    this.game.classList.add("optsOpen");
  }

  hideOptions() {
    this.optionsPanel.classList.add("hidden");
    this.optBtn.classList.remove("on");
    this.game.classList.remove("optsOpen");
  }

  // The update log's own list (see `UPDATES` in main.js). Rendered ONCE rather than on every open: the
  // entries are authored, not generated, so there is nothing to recompute — and a re-render on open is
  // exactly how a scroll position gets thrown away for no reason.
  //
  // ...and since session 142 it is rendered once on the FIRST OPEN rather than once at BOOT, because a
  // list that nobody has asked for was the single biggest thing the start of the game was doing. The
  // log is 138 entries: measured on the live page it is **988 DOM nodes** — 38 % of everything in
  // `#game`, more than the HUD, the help card and the pocket editor put together — and 122 of the 263
  // hosts the tag text had to walk BEFORE THE FIRST FRAME WAS EVER PAINTED, while the whole card sat
  // behind `display: none` under the `(i)` button. `setLog` therefore only KEEPS the items (they are
  // handed over at boot exactly as before, in `main.js`) and `showLog` builds the list the first time
  // somebody actually opens it. The cost did not disappear; it MOVED — from the start of the game, where
  // the user was staring at a stalled first second, to a click on a panel, where a one-off layout is
  // what the click was going to cost anyway.
  //
  // TWO kinds of entry, and the second one arrived in session 131 (the user's *"put in between every
  // update log a title like the -VFX UPDATE-"*). The ordinary entry is a line: `tag` is the session
  // it came from, `text` is the line, and `now` is true while it is the session actually running.
  // The other is a `head` — a SECTION TITLE, a run of changes given a name — drawn as its own row in
  // the `- LIKE THIS -` shape the user asked for. The titles are what make a list this long usable:
  // without them it is ninety lines in one column and the one you are looking for is in the middle
  // of them; with them it is a dozen named blocks and you scroll to the name.
  setLog(items) {
    this._logItems = items;
    this._logBuilt = false;
  }

  renderLog(items) {
    if (!this.logScroll) return;
    this._logBuilt = true;
    // The entries are AUTHORED (see `UPDATES` in main.js), not user input, and they are written with
    // `**bold**` around the few words that matter — which had been showing as literal asterisks since
    // the list goes in as HTML. One regex turns the two markers into the tag they always meant, and
    // nothing else in the text is interpreted.
    const md = (s) => String(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    let html = '<div class="logHead">NEWEST FIRST</div>';
    for (const it of items) {
      if (it.head) {
        // ...the dashes are added HERE rather than stored in the title, so `UPDATES` only has to say
        // what the section is ABOUT.
        html += '<div class="logTitle">- ' + it.head + " -</div>";
        continue;
      }
      html +=
        '<div class="logRow' +
        (it.now ? " new" : "") +
        '"><span class="logTag">' +
        it.tag +
        '</span><span class="logText">' +
        md(it.text) +
        "</span></div>";
    }
    this.logScroll.innerHTML = html;
  }

  showLog() {
    // ...and the list is BUILT here the first time it is opened (see `setLog` / `renderLog`): the
    // boot only hands the items over.
    if (!this._logBuilt && this._logItems) this.renderLog(this._logItems);
    this.logPanel.classList.remove("hidden");
    this.logBtn.classList.add("on");
    // It opens at the top, where the newest entries are — and it is put there explicitly because
    // the panel keeps its own scroll position between opens otherwise.
    this.logScroll.scrollTop = 0;
  }

  hideLog() {
    this.logPanel.classList.add("hidden");
    this.logBtn.classList.remove("on");
  }

  setFullscreen(on) {
    this.fsBtn.textContent = on ? "EXIT FULL" : "FULLSCREEN";
    this.fsBtn.classList.toggle("on", on);
  }

  showOverlay(title, sub, btnText) {
    this.overlayTitle.textContent = title;
    this.overlaySub.textContent = sub;
    this.startBtn.textContent = btnText;
    this.overlay.hidden = false;
  }

  hideOverlay() {
    this.overlay.hidden = true;
  }
}
