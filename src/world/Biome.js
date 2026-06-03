import * as THREE from 'three';
import { fbm2 } from './Noise.js';

// Seasonal biomes. A large-scale field maps the world into regions themed as
// the four seasons; you travel between them. Each season has its own ground,
// grass and foliage palette (and snow, for winter).
const SEASONS = [
  { // spring — fresh green, blossoms
    ground: 0x82b24e, grass: 0x93c655, snow: 0, flower: 1.0,
    leaves: [0xeaa6c4, 0xe9b9cf, 0x9ace5a, 0xb6dd76, 0x8ac94f, 0xeaa6c4],
  },
  { // summer — deep lush green
    ground: 0x5d9a3c, grass: 0x5fa047, snow: 0, flower: 0.45,
    leaves: [0x4f8f3a, 0x6fae3e, 0x589638, 0x3f7d2f, 0x7cb84a],
  },
  { // autumn — gold, orange, rust
    ground: 0x9c8047, grass: 0xb39a54, snow: 0, flower: 0.2,
    leaves: [0xd98a3e, 0xc8552f, 0xe0a93c, 0xb35e2c, 0xd99a3e, 0xa8742f],
  },
  { // winter — snow & frost
    ground: 0xedf2f7, grass: 0xdde9f0, snow: 1.0, flower: 0.0,
    leaves: [0xe8eff5, 0xdae6ef, 0xccdeea, 0xf2f6fa, 0xd6e4ee],
  },
];

const BF = 0.0012; // biome frequency — regions ~800m across
const _a = new THREE.Color(), _b = new THREE.Color();

// Continuous season at (x,z): which two seasons and how to blend them.
function info(x, z) {
  let s = fbm2(x * BF + 40.0, z * BF - 17.0, 3) * 0.5 + 0.5; // 0..1
  s = THREE.MathUtils.clamp(s, 0, 1) * 3;                     // 0..3
  const i = Math.min(Math.floor(s), 2);
  const f = THREE.MathUtils.smoothstep(s - i, 0.4, 0.6);       // mostly pure, sharp edges
  return { a: SEASONS[i], b: SEASONS[i + 1], t: f };
}

export function groundSeason(x, z, target) {
  const { a, b, t } = info(x, z);
  return target.copy(_a.set(a.ground)).lerp(_b.set(b.ground), t);
}
export function grassSeason(x, z, target) {
  const { a, b, t } = info(x, z);
  return target.copy(_a.set(a.grass)).lerp(_b.set(b.grass), t);
}
export function snowAt(x, z) {
  const { a, b, t } = info(x, z);
  return a.snow * (1 - t) + b.snow * t;
}
export function flowerAt(x, z) {
  const { a, b, t } = info(x, z);
  return a.flower * (1 - t) + b.flower * t;
}
// Pick a leaf colour for a tree at (x,z). rng() → [0,1).
export function leafSeason(x, z, rng) {
  const { a, b, t } = info(x, z);
  const pal = rng() < t ? b.leaves : a.leaves;
  return pal[(rng() * pal.length) | 0];
}
// 0..3 season index (for debug / spawn search).
export function seasonIndex(x, z) {
  let s = fbm2(x * BF + 40.0, z * BF - 17.0, 3) * 0.5 + 0.5;
  return Math.round(THREE.MathUtils.clamp(s, 0, 1) * 3);
}
// Continuous season position 0..3 (smooth) — for crossfading ambient music.
export function seasonAt(x, z) {
  let s = fbm2(x * BF + 40.0, z * BF - 17.0, 3) * 0.5 + 0.5;
  return THREE.MathUtils.clamp(s, 0, 1) * 3;
}
