import { groundColorAt, groundDebrisColorAt } from "./world.js";

// ---------------------------------------------------------------------------
// ADAPT's interface.
//
// The HUD takes its accent colour from what is actually around the player — the
// live blocks within a few metres, the colour of the ground underfoot, and the
// sky/fog of the moment — instead of from the biome's name. Walk up to a rust-red
// wall and the whole interface warms up with it; stand in a grey city and it drains
// cool; dusk drags it along as the fog turns.
//
// The HUE and SATURATION come from the world. The LIGHTNESS does not: a UI that
// literally wore the sampled colour would go black at night and muddy on grey
// concrete, so the sample is converted to HSL, its hue is kept (with a floor on
// saturation so it never reads as plain grey), and its lightness is pinned inside
// the band the HUD is legible in. Everything eases toward the new value over about
// half a second, so running past a building does not strobe the interface.
//
// Output is four CSS custom properties on <html> (`--ac`, `--ac-bright`,
// `--ac-dim`, `--ac-deep`) plus a complementary `--ac-alt`; index.html's stylesheet
// is the only consumer. Nothing here is game logic — it can be deleted without
// touching the game.
// ---------------------------------------------------------------------------

// Weights in the blend. Blocks dominate because they are what you are actually looking at
// when you squeeze between them; the ground is always present so it gets a solid weight;
// the sky/fog keeps open ground from sampling as pure grey; the sun/moon colour is a light
// touch of "time of day" on top of all of it.
const BLOCK_W = 1.7;
const GROUND_W = 1.05;
const SKY_W = 0.8;
const LIGHT_W = 0.4;
const SAMPLE_R = 13;
// Ground is sampled as a small rosette around the player rather than at one point, so the
// accent reflects the patch you are standing in rather than the pixel under your heel.
const GROUND_RING = 3.2;
// How fast the accent chases the world. ~0.4 s to get most of the way there.
const EASE = 2.6;
// The lightness band the HUD is readable in, and how hard the sampled saturation is pushed.
const SAT_GAIN = 1.7;
const SAT_ADD = 0.24;
const SAT_MIN = 0.36;
const SAT_MAX = 0.88;
const LIGHT_MAIN = 0.6;
const LIGHT_BRIGHT = 0.78;
const LIGHT_DIM = 0.29;
const LIGHT_DEEP = 0.15;
const LIGHT_ALT = 0.66;
const ALT_HUE = 0.44;      // the grip bar rides this far around the wheel from the accent
// How often the CSS variables are rebuilt (ms). The sample itself is cheap, but writing
// custom properties invalidates style for the whole tree, so it is throttled to roughly
// screen-refresh/5 and only written when a value actually changes.
const DOM_PERIOD = 80;

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// HSL -> "rgb(r,g,b)" in 0-255, in the same sRGB-ish space the HUD's own colours are in.
function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1;
  s = clamp01(s);
  l = clamp01(l);
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255);
  };
  return "rgb(" + f(0) + "," + f(8) + "," + f(4) + ")";
}

// RGB (0-1) -> {h, s} in HSL terms. Luminance is discarded: the caller pins it.
function hueSat(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) * 0.5;
  if (d < 1e-5) return { h: 0, s: 0 };
  const s = l > 0.5 ? d / Math.max(1e-5, 2 - max - min) : d / Math.max(1e-5, max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s };
}

export class AdaptUI {
  constructor(hud) {
    this.hud = hud;
    this.root = document.documentElement;
    this.mix = [0.5, 0.5, 0.5];   // weighted average of everything sampled
    this.blocks = [0, 0, 0];      // scratch for world.sampleAround
    this.hue = 0.09;              // eased
    this.sat = 0.55;
    this._domT = DOM_PERIOD;
    this._css = ["", "", "", "", ""];
    this.samples = 0;             // total block weight in the last sample (debug)
  }

  // One frame. `world.update` has already run, so the chunks around the player exist.
  update(dt, world, sky, px, py, pz) {
    let r = 0;
    let g = 0;
    let b = 0;
    let w = 0;

    if (world) {
      const bw = world.sampleAround(px, py + 1, pz, SAMPLE_R, this.blocks);
      this.samples = bw;
      if (bw > 0) {
        // A cap on the block weight, so standing inside a whole city block does not drown
        // out the ground and sky entirely.
        const bw2 = BLOCK_W * Math.min(bw, 3.4);
        r += this.blocks[0] * bw2;
        g += this.blocks[1] * bw2;
        b += this.blocks[2] * bw2;
        w += bw2;
      }
    }

    // The ground: the point under the player plus a ring around it. A crater counts as ground
    // too — the exposed earth is what you are looking at down there, so the UI takes its tone
    // when you climb into one you have beaten into the deck yourself.
    if (world) {
      const damage = world.damage;
      let gr = 0;
      let gg = 0;
      let gb = 0;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const ox = i === 0 ? px : px + Math.cos(a) * GROUND_RING;
        const oz = i === 0 ? pz : pz + Math.sin(a) * GROUND_RING;
        const c = damage && damage.craterNear(ox, oz, 1.5) ? groundDebrisColorAt(ox, oz) : groundColorAt(ox, oz);
        gr += c[0];
        gg += c[1];
        gb += c[2];
      }
      r += (gr / 5) * GROUND_W;
      g += (gg / 5) * GROUND_W;
      b += (gb / 5) * GROUND_W;
      w += GROUND_W;
    }

    if (sky && sky.cur) {
      const f = sky.cur.fog;
      const hz = sky.cur.horizon;
      // Fog for the "distance" read, horizon for the tone the sky is throwing down here.
      r += (f[0] * 0.6 + hz[0] * 0.4) * SKY_W;
      g += (f[1] * 0.6 + hz[1] * 0.4) * SKY_W;
      b += (f[2] * 0.6 + hz[2] * 0.4) * SKY_W;
      w += SKY_W;
      const li = sky.cur.light;
      r += li[0] * LIGHT_W;
      g += li[1] * LIGHT_W;
      b += li[2] * LIGHT_W;
      w += LIGHT_W;
    }

    if (w > 0) {
      this.mix[0] = r / w;
      this.mix[1] = g / w;
      this.mix[2] = b / w;
    }

    const hs = hueSat(this.mix[0], this.mix[1], this.mix[2]);
    // A grey world (concrete, fresh snow) has almost no hue to give, so the saturation floor
    // is what keeps the UI from going monochrome; a saturated world is pushed further.
    const satTarget = Math.min(SAT_MAX, Math.max(SAT_MIN, hs.s * SAT_GAIN + SAT_ADD));
    const k = 1 - Math.exp(-dt * EASE);
    // Hue is circular — ease the short way round the wheel.
    let dh = hs.h - this.hue;
    if (dh > 0.5) dh -= 1;
    if (dh < -0.5) dh += 1;
    this.hue = ((this.hue + dh * k) % 1 + 1) % 1;
    this.sat += (satTarget - this.sat) * k;

    this._domT += dt * 1000;
    if (this._domT < DOM_PERIOD) return;
    this._domT = 0;
    this.write();
  }

  write() {
    const h = this.hue;
    const s = this.sat;
    const next = [
      hsl(h, s, LIGHT_MAIN),
      hsl(h, s * 0.94, LIGHT_BRIGHT),
      hsl(h, s * 0.78, LIGHT_DIM),
      hsl(h, s * 0.62, LIGHT_DEEP),
      hsl(h + ALT_HUE, s * 0.75, LIGHT_ALT),
    ];
    const names = ["--ac", "--ac-bright", "--ac-dim", "--ac-deep", "--ac-alt"];
    for (let i = 0; i < 5; i++) {
      if (this._css[i] === next[i]) continue;
      this._css[i] = next[i];
      this.root.style.setProperty(names[i], next[i]);
    }
  }

  // Debug: what the UI is currently coloured by.
  state() {
    return {
      mix: this.mix.map((v) => Math.round(v * 1000) / 1000),
      hue: Math.round(this.hue * 360),
      sat: Math.round(this.sat * 100),
      blockWeight: Math.round(this.samples * 100) / 100,
      css: this._css.slice(),
    };
  }
}
