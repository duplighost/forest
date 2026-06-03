import { createNoise2D, createNoise3D } from 'simplex-noise';
import { SEED } from '../config.js';

// Small, fast, seeded PRNG. Deterministic so the endless world is reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer hash → [0,1). Used for stable per-cell randomness (tree placement etc).
export function hash2(ix, iy, salt = 0) {
  let h = (ix * 374761393 + iy * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const rng = mulberry32(SEED);
export const noise2D = createNoise2D(rng);
export const noise3D = createNoise3D(rng);
const warpNoise = createNoise2D(mulberry32(SEED ^ 0x9e3779b9));

// Fractal Brownian motion in 2D.
export function fbm2(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
  let amp = 0.5, freq = 1.0, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2D(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm; // ~[-1,1]
}

// Domain-warped fbm for more organic, less grid-aligned hills.
export function warpedFbm2(x, y, octaves = 5) {
  const wx = warpNoise(x * 0.5, y * 0.5);
  const wy = warpNoise(x * 0.5 + 5.2, y * 0.5 + 1.3);
  return fbm2(x + wx * 0.6, y + wy * 0.6, octaves);
}
