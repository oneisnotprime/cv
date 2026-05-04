// Mulberry32 — fast 32-bit seeded PRNG

export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Classic Perlin noise (2D) - no external deps

const perm = new Uint8Array(512);
let permSeed = -1;

function buildPerm(seed: number) {
  if (permSeed === seed) return;
  permSeed = seed;
  const rng = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(t: number, a: number, b: number) { return a + t * (b - a); }
function grad(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

export function perlin2(x: number, y: number, seed = 42): number {
  buildPerm(seed);
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  const u = fade(x);
  const v = fade(y);
  const a = perm[X] + Y;
  const b = perm[X + 1] + Y;
  return lerp(v,
    lerp(u, grad(perm[a], x, y), grad(perm[b], x - 1, y)),
    lerp(u, grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1))
  );
}

export function fbm(x: number, y: number, octaves = 4, seed = 42): number {
  let val = 0, amp = 1, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    val += perlin2(x * freq, y * freq, seed + i) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return val / max;
}
