import * as THREE from "./three.js";

const TAU = Math.PI * 2;

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}
function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function mix(a, b, t) {
  return a + (b - a) * t;
}
function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function scale3(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function add3(a, b, s) {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}
function lum(c) {
  return c[0] * 0.32 + c[1] * 0.5 + c[2] * 0.18;
}
function desat(c, t) {
  const g = lum(c);
  return [mix(c[0], g, t), mix(c[1], g, t), mix(c[2], g, t)];
}

// Shift a colour's hue/saturation toward `src` without changing its brightness much.
function hueTint(base, src, amt) {
  const ls = Math.max(0.0001, lum(src));
  return [
    clamp01(base[0] * (1 + amt * (src[0] / ls - 1))),
    clamp01(base[1] * (1 + amt * (src[1] / ls - 1))),
    clamp01(base[2] * (1 + amt * (src[2] / ls - 1))),
  ];
}

const NIGHT = {
  top: [0.010, 0.016, 0.052],
  horizon: [0.042, 0.058, 0.128],
  ground: [0.014, 0.018, 0.036],
  fog: [0.052, 0.068, 0.135],
  light: [0.140, 0.162, 0.260],
  ambient: [0.108, 0.128, 0.196],
};
const GOLDEN_PM = {
  top: [0.062, 0.096, 0.330],
  horizon: [1.000, 0.470, 0.180],
  ground: [0.155, 0.105, 0.115],
  fog: [0.560, 0.360, 0.300],
  light: [0.660, 0.350, 0.185],
  ambient: [0.290, 0.230, 0.290],
};
const GOLDEN_AM = {
  top: [0.098, 0.172, 0.448],
  horizon: [1.000, 0.640, 0.450],
  ground: [0.130, 0.120, 0.160],
  fog: [0.620, 0.540, 0.545],
  light: [0.620, 0.430, 0.310],
  ambient: [0.300, 0.290, 0.360],
};
const DAY = {
  top: [0.255, 0.475, 0.905],
  horizon: [0.600, 0.780, 0.902],
  ground: [0.300, 0.320, 0.340],
  fog: [0.720, 0.830, 0.915],
  light: [0.520, 0.500, 0.455],
  ambient: [0.400, 0.440, 0.520],
};

const COLORS = ["top", "horizon", "ground", "fog", "light", "ambient"];

const MOODS = {
  CLEAR: { day: true, night: true, weight: 3.0 },
  SUNNY: { day: true, night: false, weight: 3.6 },
  BLAZING: { day: true, night: false, weight: 1.3 },
  OVERCAST: { day: true, night: true, weight: 1.7 },
  STORM: { day: true, night: false, weight: 0.9 },
  MOONLIT: { day: false, night: true, weight: 3.0 },
  AURORA: { day: false, night: true, weight: 4.0 },
};
const MOOD_ORDER = ["CLEAR", "SUNNY", "BLAZING", "OVERCAST", "STORM", "MOONLIT", "AURORA"];

// BLAZING — bleached desert noon: taupe lid, pale-gold horizon, a sun that bleeds
// across half the sky, and enough suspended haze to swallow the horizon.
const BLAZE_TOP = [0.575, 0.525, 0.462];
const BLAZE_HORIZON = [0.905, 0.835, 0.705];
const BLAZE_FOG = [0.925, 0.862, 0.742];
const BLAZE_GROUND = [0.560, 0.470, 0.360];
const BLAZE_AMBIENT = [0.500, 0.430, 0.310];

const AURORA_A = [0.22, 1.00, 0.45];
const AURORA_B = [0.20, 0.72, 0.98];
const AURORA_C = [0.72, 0.36, 0.98];
const AURORA_D = [1.00, 0.46, 0.74];

export class SkySystem {
  constructor() {
    this.time = 0.33;
    this.dayLength = 240;
    this.t = 0;
    this.mood = "CLEAR";
    this.moodTimer = 60;
    this.moodFade = 3.2;
    this.auroraLevel = 0;
    this.blaze = 0;
    this.haze = 0;
    // A PINNED SKY (see "THE HILLS"): when this is set, the clock, the mood and the cloud cover
    // stop being the weather's business and become the world's — the hills map is a fixed picture
    // of a bright afternoon, and a day/night cycle over it would just be that picture going away.
    // `{ time, mood, cloud, cover }`; null means the ordinary rolling sky.
    this.fixed = null;
    this.mw = {};
    for (const k in MOODS) this.mw[k] = k === "CLEAR" ? 1 : 0;

    this.rising = true;
    this.nightness = 0;
    this.darkness = 0;
    this.sunDir = [0, 1, 0];
    this.moonDir = [0, -1, 0];

    this.sky = {
      top: NIGHT.top.slice(),
      horizon: NIGHT.horizon.slice(),
      ground: NIGHT.ground.slice(),
      fog: NIGHT.fog.slice(),
      light: NIGHT.light.slice(),
      ambient: NIGHT.ambient.slice(),
      skyLight: [1, 1, 1],
      groundLight: [1, 1, 1],
      fogNear: 48,
      fogFar: 120,
    };
    this.cur = {
      top: NIGHT.top.slice(),
      horizon: NIGHT.horizon.slice(),
      ground: NIGHT.ground.slice(),
      fog: NIGHT.fog.slice(),
      light: NIGHT.light.slice(),
      ambient: NIGHT.ambient.slice(),
      skyLight: [1, 1, 1],
      groundLight: [1, 1, 1],
      fogNear: 48,
      fogFar: 120,
    };
    this.uni = {
      sunDir: [0, 1, 0],
      moonDir: [0, -1, 0],
      sunColor: [1, 1, 1],
      moonColor: [0.72, 0.78, 0.96],
      skyGlowColor: [1, 1, 1],
      cloudLight: [1, 1, 1],
      cloudShadow: [0.2, 0.2, 0.25],
      sunSize: 0.032,
      sunDisc: 1,
      sunGlow: 0.4,
      shafts: 0,
      skyGlow: 0.4,
      moonSize: 0.03,
      moonDisc: 0,
      moonGlow: 0,
      stars: 0,
      milky: 0,
      aurora: 0,
      auroraA: AURORA_A.slice(),
      auroraB: AURORA_B.slice(),
      auroraC: AURORA_C.slice(),
      cloud: 0.4,
      cloudCover: 0.6,
      glare: 0,
    };
  }

  isNight() {
    return this.nightness > 0.5;
  }

  setTime(hours) {
    this.time = ((hours / 24) % 1 + 1) % 1;
  }

  advance(hours) {
    this.time = (this.time + hours / 24 + 1) % 1;
  }

  setMood(name, timer) {
    if (!MOODS[name]) return false;
    this.mood = name;
    this.moodTimer = timer !== undefined ? timer : 44 + Math.random() * 56;
    return true;
  }

  moodOptions() {
    return MOOD_ORDER.slice();
  }

  nextMood() {
    const night = this.isNight();
    let idx = MOOD_ORDER.indexOf(this.mood);
    for (let i = 1; i <= MOOD_ORDER.length; i++) {
      const cand = MOOD_ORDER[(idx + i) % MOOD_ORDER.length];
      const m = MOODS[cand];
      if (night ? m.night : m.day) {
        this.setMood(cand);
        return cand;
      }
    }
    return this.mood;
  }

  rollMood() {
    const night = this.isNight();
    const pool = [];
    let total = 0;
    for (const name in MOODS) {
      const m = MOODS[name];
      if (!(night ? m.night : m.day)) continue;
      pool.push(name);
      total += m.weight;
    }
    let r = Math.random() * total;
    let pick = pool[0];
    for (const n of pool) {
      r -= MOODS[n].weight;
      if (r <= 0) {
        pick = n;
        break;
      }
    }
    if (pick === this.mood && pool.length > 1) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    this.setMood(pick);
  }

  clockText() {
    const mins = Math.floor(this.time * 1440) % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(mins % 60).padStart(2, "0");
    return hh + ":" + mm;
  }

  phase() {
    const e = this.sunDir[1];
    if (e > 0.62) return "NOON";
    if (e > 0.22) return this.rising ? "MORNING" : "AFTERNOON";
    if (e > 0.02) return this.rising ? "SUNRISE" : "SUNSET";
    if (e > -0.14) return this.rising ? "DAWN" : "DUSK";
    if (this.time < 0.06 || this.time > 0.94) return "MIDNIGHT";
    return "NIGHT";
  }

  label() {
    return this.phase() + " \u00b7 " + this.mood;
  }

  _palette() {
    const a = this.time * TAU - Math.PI / 2;
    const cx = Math.cos(a);
    const sy = Math.sin(a);
    const len = Math.hypot(cx, sy * 0.92, sy * 0.42) || 1;
    const sun = [cx / len, (sy * 0.92) / len, (sy * 0.42) / len];
    const ml = Math.hypot(sun[0], sun[1] * 0.94, sun[2]) || 1;
    const moon = [-sun[0] / ml, (-sun[1] * 0.94) / ml, -sun[2] / ml];
    this.sunDir = sun;
    this.moonDir = moon;
    this.rising = cx > 0;

    const e = sun[1];
    this.nightness = 1 - smoothstep(-0.16, 0.06, e);
    this.darkness = smoothstep(-0.04, -0.30, e);

    const wN = 1 - smoothstep(-0.24, -0.03, e);
    const wG = Math.exp(-Math.pow(e / 0.24, 2)) * smoothstep(-0.30, -0.06, e);
    const wD = smoothstep(0.05, 0.40, e);
    const sum = wN + wG + wD || 1;
    const pN = wN / sum;
    const pG = wG / sum;
    const pD = wD / sum;
    const sunMix = pD / Math.max(0.0001, pD + pG);
    return { pN, pG, pD, sunMix, goldMix: this.rising ? 0 : 1, e };
  }

  update(dt, biome) {
    if (this.dayLength > 0) this.time = (this.time + dt / this.dayLength + 1) % 1;
    this.t += dt;

    // A pinned sky holds its clock and its mood (and never rolls a new one — a mood timer longer
    // than any session is the quiet way to say "this one is chosen").
    if (this.fixed) {
      this.time = this.fixed.time;
      if (this.mood !== this.fixed.mood) this.setMood(this.fixed.mood, 1e12);
    }

    const pal = this._palette();

    const gate = MOODS[this.mood];
    const gateOk = this.isNight() ? gate.night : gate.day;
    this.moodTimer -= dt;
    if (!gateOk || this.moodTimer <= 0) this.rollMood();

    const fade = Math.min(1, dt / this.moodFade);
    for (const k in this.mw) this.mw[k] += ((k === this.mood ? 1 : 0) - this.mw[k]) * fade;

    const night = this.nightness;
    const dark = this.darkness;
    const sunny = clamp01(this.mw.SUNNY);
    const overcast = clamp01(this.mw.OVERCAST);
    const storm = clamp01(this.mw.STORM);
    const blaze = clamp01(this.mw.BLAZING) * smoothstep(-0.02, 0.16, this.sunDir[1]);
    this.blaze = blaze;
    this.haze = 0.55 * blaze;
    const moonlit = clamp01(this.mw.MOONLIT) * dark;
    const aTarget = clamp01(this.mw.AURORA) * (0.05 + 0.95 * dark) * (1 - 0.75 * overcast - 0.9 * storm);
    this.auroraLevel += (aTarget - this.auroraLevel) * Math.min(1, dt / 7.5);

    const s = this.sky;
    for (const key of COLORS) {
      const gold = mix3(GOLDEN_AM[key], GOLDEN_PM[key], pal.goldMix);
      let c = scale3(NIGHT[key], pal.pN);
      c = add3(c, gold, pal.pG);
      c = add3(c, DAY[key], pal.pD);
      s[key] = c;
    }

    if (biome) {
      s.top = hueTint(s.top, biome.sky, 0.30);
      s.horizon = hueTint(s.horizon, biome.horizon, 0.38);
      s.ground = hueTint(s.ground, biome.ground || biome.sky, 0.25);
      s.fog = hueTint(s.fog, biome.fog, 0.42);
    }

    if (blaze > 0.001) {
      s.top = mix3(s.top, BLAZE_TOP, 0.96 * blaze);
      s.horizon = mix3(s.horizon, BLAZE_HORIZON, 0.97 * blaze);
      s.ground = mix3(s.ground, BLAZE_GROUND, 0.80 * blaze);
      s.fog = mix3(s.fog, BLAZE_FOG, 0.96 * blaze);
    }

    const dull = clamp01(overcast * 0.95 + storm * 0.85);
    for (const key of ["top", "horizon", "ground", "fog"]) {
      const g = lum(s[key]);
      s[key] = mix3(s[key], [g, g, g], dull * 0.97);
      s[key] = scale3(s[key], 1 - 0.10 * overcast - 0.34 * storm);
    }
    s.top = mix3(s.top, [0.02, 0.05, 0.06], this.auroraLevel * 0.22);
    s.horizon = mix3(s.horizon, [0.05, 0.10, 0.09], this.auroraLevel * 0.28);

    const sunI = smoothstep(-0.06, 0.10, this.sunDir[1]);
    const moonI = smoothstep(-0.06, 0.10, this.moonDir[1]) * 0.55;
    const sunLit = mix3(mix3(GOLDEN_AM.light, GOLDEN_PM.light, pal.goldMix), DAY.light, pal.sunMix);
    s.light = add3(scale3(sunLit, sunI), NIGHT.light, moonI);
    const lightBoost = (1 + 0.30 * sunny) * (1 - 0.42 * overcast) * (1 - 0.66 * storm) * (1 + 0.55 * blaze);
    const ambBoost = (1 + 0.10 * sunny) * (1 + 0.60 * overcast) * (1 - 0.12 * storm);
    s.light = scale3(s.light, lightBoost);
    s.ambient = scale3(s.ambient, ambBoost);
    if (blaze > 0.001) {
      s.ambient = mix3(scale3(s.ambient, 1 + 0.30 * blaze), BLAZE_AMBIENT, 0.75 * blaze);
    }
    s.top = scale3(s.top, 1 + 0.10 * sunny - 0.06 * storm);

    for (const key of ["top", "horizon", "ground", "fog"]) {
      s[key] = [clamp01(s[key][0]), clamp01(s[key][1]), clamp01(s[key][2])];
    }

    const skyTintDay = [0.85, 0.9, 1.0];
    s.skyLight = mix3(scale3(s.ambient, 1.7), skyTintDay, 0.25);
    if (blaze > 0.001) s.skyLight = mix3(s.skyLight, [0.95, 0.88, 0.72], 0.62 * blaze);
    s.groundLight = scale3(mix3(s.fog, s.light, 0.4), 1.9);

    const fogScale = 1 + 0.20 * sunny - 0.26 * overcast - 0.46 * storm;
    s.fogNear = (biome ? biome.fogNear : 48) * (1 - 0.08 * overcast - 0.16 * storm);
    s.fogFar = (biome ? biome.fogFar : 120) * fogScale;
    if (blaze > 0.001) {
      s.fogNear *= 1 + 0.10 * blaze;
      s.fogFar = Math.max(s.fogNear * 1.25, s.fogFar * (1 - 0.34 * blaze));
    }

    const U = this.uni;
    U.sunDir = this.sunDir;
    U.moonDir = this.moonDir;
    const warm = 1 - smoothstep(0.18, 0.62, this.sunDir[1]);
    const weatherDim = (1 + 0.14 * sunny) * (1 - 0.32 * overcast - 0.58 * storm);
    U.sunColor = scale3(mix3([1.0, 0.97, 0.92], [1.0, 0.48, 0.19], warm), weatherDim);
    U.skyGlowColor = scale3(mix3([1.0, 0.96, 0.9], [1.0, 0.6, 0.28], 1 - pal.pD), weatherDim);
    if (blaze > 0.001) {
      U.sunColor = scale3(mix3(U.sunColor, [1.0, 0.985, 0.93], blaze), 1 + 0.25 * blaze);
      U.skyGlowColor = scale3(mix3(U.skyGlowColor, [1.0, 0.95, 0.80], blaze), 1 + 0.25 * blaze);
    }
    const sunUp = smoothstep(-0.05, 0.04, this.sunDir[1]);
    const moonUp = smoothstep(-0.05, 0.04, this.moonDir[1]);
    const clear = (1 - 0.55 * overcast - 0.82 * storm) * (1 - 0.35 * this.auroraLevel);
    U.sunSize = 0.034 + 0.020 * sunny + 0.030 * blaze;
    U.sunDisc = sunUp * clear;
    U.sunGlow = (0.50 + 0.55 * sunny + 0.55 * (1 - pal.pD) + 2.10 * blaze) * sunUp * clear;
    U.shafts = (0.28 * sunny + 0.55 * (1 - pal.pD)) * sunUp * clear;
    U.skyGlow = (0.34 + 1.25 * (1 - pal.pD) + 0.70 * blaze) * clear;
    U.glare = 0.55 * blaze;
    U.moonSize = 0.038;
    U.moonDisc = moonUp * (0.70 + 0.30 * moonlit) * clear;
    U.moonGlow = moonUp * (0.30 + 0.35 * moonlit) * clear;
    U.moonColor = mix3([0.74, 0.79, 0.96], [0.95, 0.92, 0.86], 0.15 * (1 - dark));

    U.stars = dark * (0.58 + 0.40 * moonlit + 0.16 * this.auroraLevel) * (1 - 0.85 * overcast - 0.95 * storm);
    U.milky = dark * 0.30 * (1 - overcast) * (1 - storm);
    U.aurora = clamp01(this.auroraLevel);
    U.auroraA = AURORA_A;
    U.auroraB = AURORA_B;
    U.auroraC = mix3(AURORA_C, AURORA_D, clamp01((this.time * 3.1) % 1));

    U.cloud = clamp(0.68 + 0.50 * overcast + 0.90 * storm - 0.30 * sunny - 0.55 * blaze, 0, 1.6);
    U.cloudCover = 0.62 - 0.34 * overcast - 0.50 * storm + 0.14 * sunny + 0.42 * blaze;
    U.cloudLight = add3(scale3(s.light, 1.8), s.ambient, 0.7).map((v) => clamp(v, 0, 1.5));
    U.cloudLight = scale3(U.cloudLight, 1 - 0.16 * overcast - 0.10 * storm);
    U.cloudShadow = add3(scale3(s.ambient, 0.55), [0.02, 0.02, 0.03], moonlit + 0.35 * dark);
    U.cloudShadow = mix3(U.cloudShadow, U.cloudLight, 0.72 * overcast + 0.3 * storm);
    U.cloudContrast = 1 - 0.78 * overcast - 0.15 * storm;
    // ...and a pinned sky sets its own cover: the hills' clouds are the wallpaper's — big, white and
    // clearly there, rather than the "whatever today's weather rolled" the simulation would give.
    if (this.fixed) {
      if (this.fixed.cloud != null) U.cloud = Math.max(U.cloud, this.fixed.cloud);
      if (this.fixed.cover != null) U.cloudCover = Math.min(U.cloudCover, this.fixed.cover);
    }

    const k = 1 - Math.exp(-dt * 2.6);
    const c = this.cur;
    for (const key of ["top", "horizon", "ground", "fog", "light", "ambient", "skyLight", "groundLight"]) {
      c[key] = mix3(c[key], s[key], k);
    }
    c.fogNear = mix(c.fogNear, s.fogNear, k);
    c.fogFar = mix(c.fogFar, s.fogFar, k);
  }

  apply(mesh, shared) {
    const u = mesh.material.uniforms;
    const c = this.cur;
    u.uTop.value.setRGB(c.top[0], c.top[1], c.top[2]);
    u.uHorizon.value.setRGB(c.horizon[0], c.horizon[1], c.horizon[2]);
    u.uGround.value.setRGB(c.ground[0], c.ground[1], c.ground[2]);

    const U = this.uni;
    u.uSunDir.value.set(U.sunDir[0], U.sunDir[1], U.sunDir[2]);
    u.uMoonDir.value.set(U.moonDir[0], U.moonDir[1], U.moonDir[2]);
    u.uSunColor.value.setRGB(U.sunColor[0], U.sunColor[1], U.sunColor[2]);
    u.uMoonColor.value.setRGB(U.moonColor[0], U.moonColor[1], U.moonColor[2]);
    u.uSkyGlowColor.value.setRGB(U.skyGlowColor[0], U.skyGlowColor[1], U.skyGlowColor[2]);
    u.uCloudLight.value.setRGB(U.cloudLight[0], U.cloudLight[1], U.cloudLight[2]);
    u.uCloudShadow.value.setRGB(U.cloudShadow[0], U.cloudShadow[1], U.cloudShadow[2]);
    u.uAuroraA.value.setRGB(U.auroraA[0], U.auroraA[1], U.auroraA[2]);
    u.uAuroraB.value.setRGB(U.auroraB[0], U.auroraB[1], U.auroraB[2]);
    u.uAuroraC.value.setRGB(U.auroraC[0], U.auroraC[1], U.auroraC[2]);
    u.uSunSize.value = U.sunSize;
    u.uSunDisc.value = U.sunDisc;
    u.uSunGlow.value = U.sunGlow;
    u.uShafts.value = U.shafts;
    u.uSkyGlow.value = U.skyGlow;
    u.uMoonSize.value = U.moonSize;
    u.uMoonDisc.value = U.moonDisc;
    u.uMoonGlow.value = U.moonGlow;
    u.uStars.value = U.stars;
    u.uMilky.value = U.milky;
    u.uAurora.value = U.aurora;
    u.uCloud.value = U.cloud;
    u.uCloudCover.value = U.cloudCover;
    u.uCloudContrast.value = U.cloudContrast;
    u.uGlare.value = U.glare;
    u.uTime.value = this.t;

    shared.uFogColor.value.setRGB(c.fog[0], c.fog[1], c.fog[2]);
    shared.uFogNear.value = c.fogNear;
    shared.uFogFar.value = c.fogFar;

    const dir = this.sunDir[1] >= this.moonDir[1] ? this.sunDir : this.moonDir;
    shared.uLightDir.value.set(dir[0], dir[1], dir[2]);
    shared.uLightColor.value.setRGB(c.light[0], c.light[1], c.light[2]);
    shared.uAmbient.value.setRGB(c.ambient[0], c.ambient[1], c.ambient[2]);
    shared.uSkyLight.value.setRGB(c.skyLight[0], c.skyLight[1], c.skyLight[2]);
    shared.uGroundLight.value.setRGB(c.groundLight[0], c.groundLight[1], c.groundLight[2]);
    shared.uHemi.value = 0.10;
  }

  state() {
    return {
      time: Math.round(this.time * 1440) / 1440,
      clock: this.clockText(),
      phase: this.phase(),
      mood: this.mood,
      night: Math.round(this.nightness * 1000) / 1000,
      sunY: Math.round(this.sunDir[1] * 1000) / 1000,
      aurora: Math.round(this.auroraLevel * 1000) / 1000,
      stars: Math.round(this.uni.stars * 1000) / 1000,
      cloud: Math.round(this.uni.cloud * 1000) / 1000,
      glare: Math.round(this.uni.glare * 1000) / 1000,
      haze: Math.round(this.haze * 1000) / 1000,
      skyTop: this.cur.top.map((v) => Math.round(v * 1000) / 1000),
      horizon: this.cur.horizon.map((v) => Math.round(v * 1000) / 1000),
      lightColor: this.cur.light.map((v) => Math.round(v * 1000) / 1000),
    };
  }
}
