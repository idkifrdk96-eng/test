/* ------------------------------------------------------------------------------------------------
   ADAPT — THE TAG TEXT (src/tagtext.js)

   The user's brief: *"i want every game like text look like a logo"* — the JET SET RADIO wordmark
   they sent, where the letters are not a row of separate boxes but a tagged cluster: each one cocked
   at its own angle, riding at its own height, some sitting lower than the baseline, and each one
   leaning into the letter beside it so the strokes OVERLAP.

   A browser will never do that for Latin text. "Arabic-style joining" is a real, automatic thing, but
   only for scripts that ship a joining algorithm (Arabic, Syriac, Mongolian) — for the Latin alphabet
   the engine lays every glyph in its own advance box and nothing is ever allowed to touch. The font
   carries no kerning and one whole cell of side bearing precisely so letters never collide (see
   "THE FONT" in README.md). So the logo look has to be BUILT, per letter, on top of the face:

   this module walks the tagged UI elements and replaces each run of text with one inline-block span
   per character — every span wearing its own rotate / translateY / scale, and (when the chain is on)
   its own negative margin so it laps over the letter before it, with its own z-index so neighbours
   weave over and under each other instead of stacking in a line.

   THE CHAIN AND THE FAN ARE OFF NOW. Both were asked for by this user and both were taken back by
   the same user — *"remove the font like italic effect and make them sorted not all over eachother"*
   — so `CHAIN`, `FAN_MAX`, `LINE` and `SPACE_EAT` all read 0 and what remains of the logo look is the
   HAND-SETTING plus the TRACKING: each letter on its own cock, height and size (`MAX_ANG` / `MAX_DY` /
   `MAX_SC`), no two letters touching and nothing leaning, and the face's own over-generous air spent
   (`TRACK` — *"can you lower the spacing between the fonts"*, see below). Turn either of the two dead
   ones back on by putting its number back — the machinery is untouched and goes quiet together rather
   than needing to be unwired.

   Everything below about the overlap and the lean is kept as the RECORD of what was there and why it
   was measured the way it was; read it as history unless you are switching one of them back on.

   Three rules keep it from turning into mush:

   1. Only NAMES wear it. A tag is a wordmark — a handful of words, read at a glance. Run a sentence
      of prose through the same overlap and it stops being a sentence: every word's letters lap over
      each other and the eye cannot pick the word apart (the update log, tagged, was the proof).
      `MAX_CHARS` is the line; anything longer stays in the crisp face.

   2. EVERY letter keeps a hard ink keyline (the `.logo` recipe, sized off the font), so two letters
      may overlap and both still read — the reference logotype's own trick.

   3. The jitter is DETERMINISTIC — a hash of the host's text and the letter's index, never
      Math.random — because most of these elements are rewritten every time they change (`setBiome`,
      `setStateText`, `renderLog`), and a random draw would make the whole interface twitch every time
      a word was re-set. Same word, same tag, forever.

   The brief's second half is where the overlap stops being a nudge: *"make the character overlay each
   other but half each other like a chain effect: half of the letter is above and the other half is
   under"*. A chain is not "some letters on top of others" — in a chain every link is over the one
   before it and under the one after it, which is precisely one half of a letter above and the other
   half below. Two numbers decide it, and both are COUNTED rather than drawn:

   - `--z` counts UP with the letter, so the letter on the RIGHT is the one in front. Letter `i`
     therefore lies over `i-1` with its left side and under `i+1` with its right. (The old alternating
     1/2 z-index put whole letters above *both* of their neighbours at once — that reads as a stack,
     not a chain.)
   - `--k` is measured PER PAIR off the face's own metrics (see `metrics()`): `CHAIN` of the narrower
     glyph's ink, plus whatever air the two glyphs would have had anyway. It cannot be one fixed
     number — `I` advances 4 cells and `M` 9 — so a single bite either swallows the `I` or never
     touches the `M`. And it is `CHAIN` 0.40 rather than the brief's literal 0.50 because that is a
     measurement too: at 0.50 the `D` of `ADAPT` loses its bowl and reads as a `C`, at 0.40 every
     capital of the face still reads through its keyline.

   A word also has to FALL for the chain to read. The letter in front cuts a straight VERTICAL edge out
   of the one behind it, and a vertical cut through a glyph is what turns it into a different glyph —
   so a run now descends as it goes (`LINE`, three times what it was), which tilts every covered edge
   into a diagonal and leaves the shape of the missing piece on show. Measured on `ADAPT` at 60px: a
   flat word at this bite is a smear, a falling one is a staircase.

   The same message also carries the lean — *"make the font have italic effect based on the position of
   the letter: if it's on the right italic aiming right, if it's on the left italic to the left, and if
   it's in the middle no italic effect"* — which is `--it`: a per-letter SHEAR (`skewX`) fanned across
   the RUN, letters at the two ends leaning outwards and the middle leaning not at all (`FAN_DEAD`,
   0.30 of each half, is the dead zone). It is a shear applied to the letters IN THE TAG, and
   deliberately not a change to the face: the face is upright because the *previous* brief asked for
   exactly that (see "THE FONT"), and this one is the opposite of it. The fan is spread over the whole
   run rather than restarting inside each word, so `TAP TO PLAY` leans out at its first `T` and its
   last `Y` — not at the six ends of its three words.

   It is applied by a MutationObserver rather than by hand at each render site: one observer on
   `#game` catches the HUD labels, the options card, the log, the pocket editor and the yard signs
   alike — including everything those systems build with innerHTML long after load. Nothing else in
   the game has to know this exists.

   What deliberately does NOT wear it is decided by two lines rather than a list of exceptions: the
   per-frame NUMBER readouts are simply never named in `SEL` (speed / FPS / position / clock — they are
   rewritten every frame and rebuilding spans at 60 Hz would be both jitter and garbage), and anything
   longer than `MAX_CHARS` falls through to the crisp face wherever it lives — so the log's sentences,
   the help card's paragraphs, the `#invHint` legend line and the overlay's keys block all keep their
   readable grid while the names around them are tagged. Numbers want to be scanned and paragraphs want
   to be read; the tag belongs on the names.
   ------------------------------------------------------------------------------------------------ */

const INK = "#07090c";

const SEL = [
  "#overlayTitle", "#overlaySub", "#startBtn",
  ".hbtn", ".obtn", ".optX", ".chip", ".tbtn", ".invBtn",
  ".optTitle", ".optSec", "#optSub", ".helpTitle", ".panelTitle", "#invTitle", ".logHead", ".logTag",
  "#stateLabel", "#chainEl", "#comboEl", "#jumpsEl", "#mouseFreeEl", "#lockEl",
  "#biomeLabel", "#skyLabel", "#interactPrompt", "#invHint",
  ".biome", ".sky", ".gaugeTop span", ".setRow .key", ".setRow .nm",
  ".okey", ".onm", ".swName", ".helpGrid .k", ".qname", ".qfoot b",
  ".invCName", ".invHp", ".invEmpty", ".invName", ".ysName", ".ysHint", ".yardTag",
].join(",");

const SKIP = "script, style, canvas, svg, textarea, input, select, [data-notag]";

// The longest run of text that is still a NAME rather than a sentence. "MOUSE FREE — T TO LOCK" (23)
// is a name; the same line's explanation in the help card is not, and neither is a log entry.
const MAX_CHARS = 40;

const MAX_ANG = 6.5;
const MAX_DY = 0.06;
const MAX_SC = 0.075;
// The descent across a word. It was 0.10 when the chain was a nudge and a flat baseline was right;
// the CHAIN needed 0.30, because what the letter in front takes off the one behind is a vertical
// slice, and a vertical cut through a glyph reads as a different glyph. With the chain off there is
// nothing doing the cutting, so the word is level again — which is what "sorted" asked for.
const LINE = 0;

// Measured off the built face (60px: most capitals advance 42px with 6px of right bearing and their
// ink starting 1px left of the pen), so two glyphs laid side by side leave `BEARING` em of clear air
// between their ink. `--k` has to cancel that FIRST and only then bite into the glyph — which is why
// the overlap is not sized off the font-size: a cell is 0.1em at every size, so half a cell of bite
// reads the same in a 10px label as in a 60px wordmark.
//
// These three are now only the FALLBACK, used for the first pass if the face has not loaded yet (see
// `metrics()`); once the real metrics are in, `CHAIN` below decides the bite for every pair.
const BEARING = 0.083;
const OVER = 0.035;
const OVER_V = 0.04;

// THE CHAIN — how much of the narrower of two neighbouring glyphs the one in front ends up HIDING,
// counting the air they would have had anyway and the keyline that does some of the hiding (both are
// taken back out in `chainOf`).
//
// IT IS OFF NOW. The brief that asked for it was this user's own — *"make the character overlay each
// other but half each other like a chain effect: half of the letter is above and the other half is
// under"* — and the same user later reversed it: *"make them sorted not all over eachother"*. A 0 here
// leaves every letter at the face's own advance, spaced the way the face was drawn to be spaced, and
// nothing else has to be changed for it: `letter` only writes `--k` when there is a chain to write,
// and `chainAt` is this number, so the whole mechanism goes quiet together. It also switches off the
// space's own eat (see `SPACE_EAT`), which only existed to keep a word gap proportional to the closed
// up letters beside it.
//
// The measured value is kept in the note, because it is what a chain COSTS and someone will want it
// again: 0.40 rather than the brief's literal "half" is where a `GROUNDS` set at 40px stops reading —
// at 0.44 its `U` loses the bowl (the right stroke goes, so it reads `L`), at 0.50 its `O` reads `C`,
// and at 0.36 every letter survives, the round ones included. See "THE TAG TEXT" in README.md.
const CHAIN = 0;

// ... and the bite gives way a little at the small end, where the pixel grid is the limit rather than
// the eye: a 12px glyph is 7.6px of ink drawn with 1px strokes and wearing a 1px outline, so the same
// fraction costs it more. Measured the same way: 0.40 of a 12px `OPTIONS` turns its `O` into a `C`,
// 0.34 leaves it, and at 10px the clean `MOUSE FREE` was 0.28.
const CHAIN_SMALL = 0.70; // what is left of CHAIN at 10px
const CHAIN_FULL = 36;    // px — at this size and up the bite is the full CHAIN

// A chain closed a word up by ~40%, so an untouched space between two words stopped reading as a word
// gap and started reading as a hole; this much of the space's advance was taken back to keep the gap in
// proportion to the letters beside it. With the chain off (`CHAIN` is 0) it goes back to a whole space,
// because there is nothing to be proportional to any more.
const SPACE_EAT = 0;

// THE TRACKING — the letters pulled in, and it is the FACE's own air being spent rather than a chain.
// The user's *"can you lower the spacing between the fonts"*. Swizer Street is drawn with a very
// generous side bearing: measured on the live page, through the host's own stack at 100px, the clear
// air between two capitals is **0.163–0.214 em** (`AD` 0.195, `RO` 0.189, `OU` 0.163, `SE` 0.214)
// while a SPACE advances 0.248 — so the letters of a tag stand off each other by almost a whole word
// gap's worth and a five-letter word reads as five separate marks. `TRACK` is the fraction of that
// pair's OWN air that is taken back, per pair and measured off the face (`chainOf` with no chain), so
// an `I` and an `M` — whose advances differ by more than a cell — close by their own amounts instead
// of by a fixed crop. At 0.55 the air left is 0.073–0.096 em, which is the same hair the built face
// was drawn with (`BEARING` 0.083), and no two INKS touch at any size.
//
// It ramps at the small end for the same reason the chain did: down there it is a pixel grid. A 10px
// label wears a `max(1, 0.06em)` keyline on every side, so a pair left 0.08 em apart has its two
// keylines meeting in the gap and reads as one mark — `TRACK_SMALL` is what the crop falls to at 10px
// (0.55 → 0.33 of the air, ~0.12 em left, a whole pixel and a bit of daylight), and `TRACK_FULL` px
// is where it is the full number. It is INDEPENDENT of the chain: the chain is a hand-set overlap
// with a z-order, this is the face's bearings being spent, and either may be on alone.
const TRACK = 0.55;
const TRACK_SMALL = 0.6;
const TRACK_FULL = 36;

// ...and the WORD gap goes with it, because tightening only the letters makes the wording read as
// though it has been pulled apart: the gap between two words is not the space alone but the space
// PLUS the trailing bearing of the letter before it and the leading one of the letter after —
// measured 0.44 em, i.e. 2.4 letters' worth as it stands and 5.3 if the space were left whole. This
// is the fraction of a space's own advance taken back with them, so words stay three to four letter
// gaps apart, which is what a word gap is for.
const TRACK_SPACE = 0.35;

// THE FAN — the italic half of the brief, and it is OFF as well (same reversal, same message: see
// `CHAIN`). `FAN_MAX` is the lean at the very end of a display-size run, positive = the top of the
// letter leans to the RIGHT (which is what "italic" means; the CSS negates it because `skewX` with the
// y axis pointing down leans the other way). `FAN_DEAD` is the fraction of each half of the run that
// is a dead zone at zero lean — "if it's in the middle no italic".
const FAN_MAX = 0;
const FAN_DEAD = 0.3;

// THE FACE'S OWN NUMBERS. The bite cannot be a fixed number (a cell is not a cell: `I` advances 4 of
// them and `M` 9), so the module reads the face ONCE and keeps it: for every character, its advance
// and its two ink extents (`actualBoundingBoxLeft/Right` — for `A` at 100px that is 1.7 and 61.7, so
// `L` is how far the ink reaches LEFT of the pen and `R` how far right). Normalised to `em` on the way
// in, so one table serves a 10px HUD label and a 60px wordmark alike. Measured with the host's own
// font STACK, so a character the face does not carry is measured at the fallback's metrics — which is
// what the browser will lay that character out with too.
//
// It is only built once `document.fonts` reports the face LOADED: `measureText` cheerfully answers with
// the fallback's numbers while a webfont is still loading, and a table of fallback metrics would be
// wrong for the life of the page. Until it lands, the bite falls back to the fixed one above and
// `init()` re-tags every host the moment the face is in.
let MET = null;
const MET_PX = 100;
const MET_STACK = '"SwizerStreet", "AdaptChunk", ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace';

function record(ch) {
  const m = MET.g.measureText(ch);
  MET.at[ch] = {
    adv: m.width / MET_PX,
    L: m.actualBoundingBoxLeft / MET_PX,
    R: m.actualBoundingBoxRight / MET_PX,
  };
  return MET.at[ch];
}

function metrics() {
  if (MET) return MET;
  if (!document.fonts || document.fonts.status !== "loaded") return null;
  const g = document.createElement("canvas").getContext("2d");
  g.font = MET_PX + "px " + MET_STACK;
  MET = { g, at: {} };
  for (let c = 32; c < 127; c++) record(String.fromCharCode(c));
  return MET;
}

// The face's numbers for one character — measured on demand for anything outside ASCII (the arrows,
// the em dashes, whatever the log headings wear).
function face(ch) {
  const m = metrics();
  if (!m) return null;
  return m.at[ch] || record(ch);
}

// How far the next letter has to come back so that the two INKS overlap by `chain` of the narrower
// one: the gap between them would be `adv(a) - R(a) - L(b)`, so the margin is that much less the bite.
// `key` is the keyline's width in em and comes off the bite, because the outline covers just as much of
// the letter behind as the ink does.
function chainOf(a, b, chain, key) {
  const A = face(a);
  const B = face(b);
  if (!A || !B) return null;
  const ink = Math.min(A.L + A.R, B.L + B.R);
  return B.L + A.R - A.adv - Math.max(0, chain * ink - key);
}

// The keyline is `max(1px, 0.06em)` wide, so in em it is 0.06 down to ~17px and grows below that (0.1em
// at 10px). The bite has to count it, so it is passed to `chainOf` in the same units.
function chainAt(fs) {
  return CHAIN * Math.min(1, CHAIN_SMALL + ((1 - CHAIN_SMALL) * (fs - 10)) / (CHAIN_FULL - 10));
}

// ...and the tracking's own size ramp (see `TRACK`): the crop of the pair's air at this font size.
function trackAt(fs) {
  return TRACK * Math.min(1, TRACK_SMALL + ((1 - TRACK_SMALL) * (fs - 10)) / (TRACK_FULL - 10));
}

// ... but the keyline is not always the one drawn here: a host may arrive wearing its own `text-shadow`
// (that is exactly why `processHost` leaves it alone when it finds one), and the world's sign names
// arrive with a **2px** outline where this file would have drawn 1.1px. So the outline is MEASURED off
// the host — the first shadow's offset IS the outline's width, and for a real drop shadow it reads as
// that shadow's drop, which also covers something. `1.2px 0 0 #07090c, …` → 1.2.
function keyEm(fs, shadow) {
  const m = /(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(shadow || "");
  const px = m ? Math.max(Math.abs(parseFloat(m[1])), Math.abs(parseFloat(m[2]))) : 0;
  return (px || Math.max(1, fs * 0.06)) / fs;
}

// The fan: where the letter sits in the RUN, -1 at the very left to +1 at the very right, remapped so
// the middle `FAN_DEAD` of each half leans not at all, times the lean.
function fanOf(g, amt) {
  const v = (g - 0.5) * 2;
  const k = Math.max(0, Math.abs(v) - FAN_DEAD) / (1 - FAN_DEAD);
  return Math.sign(v) * k * FAN_MAX * amt;
}

function rand(seed, i) {
  let h = 2166136261 >>> 0;
  const s = seed + "|" + i;
  for (let c = 0; c < s.length; c++) {
    h ^= s.charCodeAt(c);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// `gi` is the letter's index in the RUN, not in its word, so the jitter is different in every letter of
// a multi-word label; `g` is where it sits in the run (0..1), which is what spreads the fan and the
// descent over the whole run rather than restarting them at every word. `next` is the character that
// will cover this one (null at the end of a word, where there is nothing to be chained to). `chain` is
// the hand-set overlap (0 unless switched back on) and `track` the fraction of the pair's own clear air
// that is spent (see `TRACK`) — the chain's bite wins when both are live, because it is the bigger one.
function letter(ch, next, seed, gi, amt, big, g, chain, key, track) {
  const el = document.createElement("i");
  el.className = "twl";
  const r = rand(seed, gi);

  el.style.setProperty("--r", ((r - 0.5) * 2 * MAX_ANG * amt).toFixed(3) + "deg");
  el.style.setProperty("--y", (((r - 0.5) * 2 * MAX_DY + (g - 0.5) * LINE) * amt).toFixed(4) + "em");
  el.style.setProperty("--s", (1 + (r - 0.5) * 2 * MAX_SC * amt).toFixed(4));
  if (next !== null && (chain > 0 || track > 0)) {
    const raw = chainOf(ch, next, chain, key);
    const fallback = -(BEARING + OVER + rand(seed, gi * 3 + 11) * OVER_V);
    const k = raw === null ? fallback * (chain > 0 ? 1 : track)
      : (chain > 0 ? raw : raw * track);
    el.style.setProperty("--k", k.toFixed(4) + "em");
  }
  // Up, not alternating: the letter to the RIGHT is always the one in front, which is what puts the
  // left half of this letter over its predecessor and its right half under its successor.
  el.style.setProperty("--z", String(gi + 1));
  el.style.setProperty("--it", fanOf(g, amt).toFixed(3) + "deg");
  if (big && gi === 0) el.style.setProperty("--s", (1.12 * (1 + (r - 0.5) * 2 * MAX_SC * amt)).toFixed(4));

  el.textContent = ch;
  return el;
}

// `off` is how many letters of the run come before this word, `total` how many there are in it, so the
// fan and the descent can be spread over the run instead of restarting at every word.
function word(w, seed, amt, big, off, total, chain, key, track) {
  const box = document.createElement("span");
  box.className = "tww";
  box.style.setProperty("--wy", ((rand(seed, 97 + off) - 0.5) * 2 * 0.05 * amt).toFixed(4) + "em");
  box.style.transform = "translateY(var(--wy))";
  for (let i = 0; i < w.length; i++) {
    const gi = off + i;
    const g = total > 1 ? gi / (total - 1) : 0.5;
    box.appendChild(letter(w[i], i < w.length - 1 ? w[i + 1] : null, seed, gi, amt, big, g, chain, key, track));
  }
  return box;
}

function space(ch) {
  const el = document.createElement("i");
  el.className = "tws";
  el.textContent = ch;
  const f = face(" ");
  if (f) el.style.setProperty("--k", (-(SPACE_EAT + TRACK_SPACE) * f.adv * ch.length).toFixed(4) + "em");
  return el;
}

// `off0` / `total0` are the run's position and length when the host is being tagged in pieces; on their
// own (a bare `TagText.tag(...)` call) the run is just this text.
function tagRun(text, amt, big, chain, key, track, off0 = 0, total0 = 0) {
  const frag = document.createDocumentFragment();
  const seed = text;
  let total = total0;
  if (!total) for (const ch of text) if (ch !== " ") total++;
  let off = off0;
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && text[j] !== " ") j++;
    if (j > i) {
      frag.appendChild(word(text.slice(i, j), seed, amt, big, off, total, chain, key, track));
      off += j - i;
    }
    let k = j;
    while (k < text.length && text[k] === " ") k++;
    if (k > j) frag.appendChild(space(text.slice(j, k)));
    i = k;
  }
  return frag;
}

function keyline(fs) {
  const w = Math.max(1, fs * 0.06);
  const parts = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    parts.push(`${(dx * w).toFixed(2)}px ${(dy * w).toFixed(2)}px 0 ${INK}`);
  }
  return parts.join(", ");
}

function processHost(host) {
  if (host.matches(SKIP) || host.closest(SKIP)) return;

  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.classList.contains("twl") || p.classList.contains("tws")) return NodeFilter.FILTER_REJECT;
      if (p.closest("[data-notag]")) return NodeFilter.FILTER_REJECT;
      const v = node.nodeValue;
      return v && v.trim().length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  if (!nodes.length) return;
  // A host that carries a SENTENCE keeps the crisp face whole — tagging the short words and leaving
  // the long one would put the keyline (and the zeroed tracking) on the sentence too, which is worse
  // than either. An element is a name or it is prose; this is where that is decided.
  if (nodes.some((node) => node.nodeValue.trim().length > MAX_CHARS)) return;

  const cs = getComputedStyle(host);
  const fs = parseFloat(cs.fontSize) || 10;
  const amt = Math.max(0.55, Math.min(1, fs / 30));
  const big = fs >= 22;
  const chain = chainAt(fs);
  const track = trackAt(fs);
  const shadow = cs.textShadow && cs.textShadow !== "none" ? cs.textShadow : keyline(fs);
  const key = keyEm(fs, shadow);

  host.classList.add("twHost");
  if (cs.textShadow === "none") host.style.textShadow = shadow;

  // The run is counted across the WHOLE host, not per text node: a label built out of pieces (`<b>TAB</b>
  // OPENS`) is one run to the eye, so its fan and its descent have to run from the first letter to the
  // last instead of restarting at every piece. (The jitter's seed is still each node's own text.)
  const runs = nodes.map((node) => node.nodeValue);
  let total = 0;
  for (const text of runs) for (const ch of text) if (ch !== " ") total++;
  let off = 0;
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].parentNode.replaceChild(tagRun(runs[i], amt, big, chain, key, track, off, total), nodes[i]);
    for (const ch of runs[i]) if (ch !== " ") off++;
  }
}

const pending = new Set();
let queued = false;

function queue(el) {
  if (!el) return;
  pending.add(el);
  if (queued) return;
  queued = true;
  requestAnimationFrame(flush);
}

function flush() {
  queued = false;
  const list = [...pending];
  pending.clear();
  for (const el of list) {
    const host = el.matches && el.matches(SEL) ? el : el.closest && el.closest(SEL);
    if (host && host.isConnected) processHost(host);
  }
}

function scan(root) {
  if (root.nodeType === 1) {
    if (root.matches(SEL)) queue(root);
    const inner = root.querySelectorAll(SEL);
    for (const el of inner) queue(el);
  } else if (root.nodeType === 3 && root.parentElement && root.parentElement.matches(SEL)) {
    queue(root.parentElement);
  }
}

// Take a tag back off: every `.tww` / `.tws` becomes the plain text node it replaced. It is lossless
// (that is the entire reason a space is its own `<i class="tws">` holding the real character), and the
// only reason it exists at all is that the FIRST pass can run before the face has loaded — the bite
// then falls back to the fixed one above — so `init()` has to be able to tag every host again once the
// real metrics are in.
function untag(host) {
  for (const el of host.querySelectorAll(".tww, .tws")) {
    el.replaceWith(document.createTextNode(el.textContent));
  }
}

function init() {
  const root = document.getElementById("game") || document.body;
  for (const el of root.querySelectorAll(SEL)) processHost(el);

  // The face is a data URI, so it is usually there before this runs. If it is not, everything above was
  // tagged with the fallback bite, so re-tag the lot the moment the font says it is loaded. (All the
  // untagging happens before any of the re-tagging, so a host nested inside another host comes out
  // exactly as the first pass left it.)
  if (!MET && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (MET) return;
      if (!metrics()) return;
      const hosts = [...root.querySelectorAll(SEL)];
      for (const el of hosts) untag(el);
      for (const el of hosts) processHost(el);
    });
  }

  new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type === "characterData") {
        queue(rec.target.parentElement);
      } else {
        for (const node of rec.addedNodes) scan(node);
        if (rec.target.nodeType === 1 && rec.target.matches(SEL)) queue(rec.target);
      }
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}

const TagText = {
  init,
  tag: (text, fs = 10) => tagRun(text, Math.max(0.55, Math.min(1, fs / 30)), fs >= 22, chainAt(fs), keyEm(fs), trackAt(fs)),
  SEL,
};
window.TagText = TagText;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export default TagText;
