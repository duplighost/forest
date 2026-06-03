import * as THREE from 'three';
import { warpedFbm2, fbm2, noise2D } from './Noise.js';
import { WORLD, COLORS } from '../config.js';
import { groundSeason, snowAt } from './Biome.js';

// ---------------------------------------------------------------------------
// The height field. ONE source of truth, sampled by both the terrain mesh and
// the player controller, so the squirrel always stands exactly on the ground.
// ---------------------------------------------------------------------------
export function terrainHeight(x, z) {
  // Broad warped hills.
  let h = warpedFbm2(x * 0.0052, z * 0.0052, 5); // ~[-1,1]
  // Bias upward and shape: round the hilltops, broaden the valleys.
  h = Math.sign(h) * Math.pow(Math.abs(h), 1.25);
  let height = h * 19.0 + 2.5;

  // Medium rolling detail.
  height += fbm2(x * 0.021 + 11.3, z * 0.021 - 4.7, 3) * 3.4;
  // Fine bumps.
  height += fbm2(x * 0.085, z * 0.085, 2) * 0.9;

  // Carve broad river valleys where a separate low-freq channel is near zero.
  const channel = Math.abs(noise2D(x * 0.0032 + 30.0, z * 0.0032 - 12.0));
  const river = THREE.MathUtils.smoothstep(channel, 0.0, 0.14); // 0 in channel
  height = THREE.MathUtils.lerp(WORLD.waterLevel - 3.0, height, river);

  return height;
}

const _e = 0.6;
export function terrainNormal(x, z, target = new THREE.Vector3()) {
  const hL = terrainHeight(x - _e, z);
  const hR = terrainHeight(x + _e, z);
  const hD = terrainHeight(x, z - _e);
  const hU = terrainHeight(x, z + _e);
  target.set(hL - hR, 2.0 * _e, hD - hU).normalize();
  return target;
}

// Approximate slope in [0,1] (0 = flat, 1 = vertical).
export function terrainSlope(x, z) {
  const hL = terrainHeight(x - _e, z);
  const hR = terrainHeight(x + _e, z);
  const hD = terrainHeight(x, z - _e);
  const hU = terrainHeight(x, z + _e);
  const dx = (hR - hL) / (2 * _e);
  const dz = (hU - hD) / (2 * _e);
  return Math.min(1, Math.sqrt(dx * dx + dz * dz));
}

// ---------------------------------------------------------------------------
// Vertex colouring — painterly biome blend by height, slope and a little noise.
// ---------------------------------------------------------------------------
const _c = new THREE.Color();
const cGrass = new THREE.Color(COLORS.grass);
const cLush = new THREE.Color(COLORS.grassLush);
const cDry = new THREE.Color(COLORS.grassDry);
const cDirt = new THREE.Color(COLORS.dirt);
const cRock = new THREE.Color(COLORS.rock);
const cSand = new THREE.Color(COLORS.sand);
const cSnow = new THREE.Color(0xeef3f8);

export function groundColor(x, z, height, slope, target = _c) {
  // base ground colour comes from the local season (spring/summer/autumn/winter)
  groundSeason(x, z, target);
  const tint = noise2D(x * 0.035, z * 0.035) * 0.5 + 0.5;
  target.multiplyScalar(0.9 + tint * 0.18);

  const snow = snowAt(x, z) * (1.0 - THREE.MathUtils.smoothstep(slope, 0.5, 0.95));

  // dirt/rock on steeper slopes
  const rocky = THREE.MathUtils.smoothstep(slope, 0.45, 0.9);
  target.lerp(cDirt, THREE.MathUtils.smoothstep(slope, 0.3, 0.6) * 0.7 * (1 - snow));
  target.lerp(cRock, rocky * (1 - snow * 0.8));

  // sandy shoreline near the water line (no sand under snow)
  const shore = 1.0 - THREE.MathUtils.smoothstep(Math.abs(height - WORLD.waterLevel), 0.0, 1.6);
  target.lerp(cSand, shore * 0.82 * (1 - snow));

  // winter snow blanket on flatter ground
  target.lerp(cSnow, snow * 0.94);

  // gentle per-vertex value variation so large fields aren't flat
  const v = 0.93 + noise2D(x * 0.5, z * 0.5) * 0.07;
  target.multiplyScalar(v);
  return target;
}

// ---------------------------------------------------------------------------
// Build a terrain mesh for one chunk.
// ---------------------------------------------------------------------------
let _terrainMat = null;
function terrainMaterial() {
  if (!_terrainMat) {
    _terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.97, metalness: 0.0,
    });
  }
  return _terrainMat;
}

export function buildTerrainChunk(cx, cz) {
  const size = WORLD.chunkSize;
  const res = WORLD.terrainRes;
  const originX = cx * size;
  const originZ = cz * size;

  const geo = new THREE.PlaneGeometry(size, size, res, res);
  geo.rotateX(-Math.PI / 2); // XZ plane, +y up

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const wx = originX + lx;
    const wz = originZ + lz;
    const h = terrainHeight(wx, wz);
    pos.setY(i, h);
    const slope = terrainSlope(wx, wz);
    groundColor(wx, wz, h, slope, _c);
    colors[i * 3] = _c.r;
    colors[i * 3 + 1] = _c.g;
    colors[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, terrainMaterial());
  mesh.position.set(originX, 0, originZ);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
