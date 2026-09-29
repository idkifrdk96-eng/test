export function hashInt(x, y, seed = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(x, y, seed = 0) {
  return mulberry32(hashInt(x, y, seed));
}

export function randInt(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}

export function randFloat(rng, a, b) {
  return a + rng() * (b - a);
}

export function pick(rng, arr) {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

export function chance(rng, p) {
  return rng() < p;
}

export function pickWeighted(rng, weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = rng() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

export function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = fade(xf);
  const v = fade(yf);
  const n00 = hashInt(xi, yi, seed) / 4294967296;
  const n10 = hashInt(xi + 1, yi, seed) / 4294967296;
  const n01 = hashInt(xi, yi + 1, seed) / 4294967296;
  const n11 = hashInt(xi + 1, yi + 1, seed) / 4294967296;
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

export function fbm2(x, y, seed = 0, octaves = 3) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
