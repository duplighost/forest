import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, fbm2 } from './Noise.js';
import { terrainHeight, terrainSlope } from './Terrain.js';
import { WORLD } from '../config.js';
import { makeTreeTemplate, makeFoliageMaterial, windUniforms } from './TreeFactory.js';
import { leafSeason } from './Biome.js';

const TEMPLATES = 9;
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _leaf = new THREE.Color();

export class Forest {
  constructor() {
    this.material = makeFoliageMaterial();
    this.templates = [];
    for (let i = 0; i < TEMPLATES; i++) {
      this.templates.push(makeTreeTemplate(0xA17 + i * 131));
    }
  }

  // Place trees for chunk (cx,cz): adds a merged mesh to `group`, returns an
  // array of climbable tree records in world space.
  populate(cx, cz, group) {
    const size = WORLD.chunkSize;
    const ox = cx * size, oz = cz * size;
    const cell = 8; // candidate grid spacing in meters
    const n = Math.floor(size / cell);

    const geos = [];
    const trees = [];

    for (let gz = 0; gz < n; gz++) {
      for (let gx = 0; gx < n; gx++) {
        const hx = cx * n + gx, hz = cz * n + gz;
        const r1 = hash2(hx, hz, 1);
        // Local forest density — open clearings and denser groves. Squaring the
        // density biases toward real clearings so the forest breathes.
        const density = fbm2((ox + gx * cell) * 0.0055, (oz + gz * cell) * 0.0055, 3) * 0.5 + 0.5;
        const accept = 0.04 + density * density * 0.42;
        if (r1 > accept) continue;

        const jx = (hash2(hx, hz, 2) - 0.5) * cell * 0.9;
        const jz = (hash2(hx, hz, 3) - 0.5) * cell * 0.9;
        const wx = ox + gx * cell + cell * 0.5 + jx;
        const wz = oz + gz * cell + cell * 0.5 + jz;

        const h = terrainHeight(wx, wz);
        if (h < WORLD.waterLevel + 0.4) continue;          // not in water
        if (terrainSlope(wx, wz) > 0.62) continue;          // not on cliffs

        const ti = (hash2(hx, hz, 4) * TEMPLATES) | 0;
        const scale = 0.7 + hash2(hx, hz, 5) * 0.8;
        const rot = hash2(hx, hz, 6) * Math.PI * 2;
        this._addTree(geos, trees, hx, hz, wx, wz, h, scale, rot, ti);
      }
    }

    // Rare giant landmark tree — a towering, climbable elder, randomly placed.
    if (hash2(cx, cz, 80) < 0.12) {
      const wx = ox + (0.25 + hash2(cx, cz, 81) * 0.5) * size;
      const wz = oz + (0.25 + hash2(cx, cz, 82) * 0.5) * size;
      const h = terrainHeight(wx, wz);
      if (h > WORLD.waterLevel + 1 && terrainSlope(wx, wz) < 0.42) {
        const ti = (hash2(cx, cz, 83) * TEMPLATES) | 0;
        const scale = 2.6 + hash2(cx, cz, 84) * 1.3;
        this._addTree(geos, trees, cx * 131 + 7, cz * 131 + 9, wx, wz, h, scale, hash2(cx, cz, 85) * 6.28, ti);
        trees[trees.length - 1].giant = true;   // a cosy hollow lives at its base
      }
    }

    if (geos.length) {
      const merged = BufferGeometryUtils.mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      const mesh = new THREE.Mesh(merged, this.material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    return trees;
  }

  // Place one tree (used for both the scattered forest and the rare giant).
  _addTree(geos, trees, hx, hz, wx, wz, h, scale, rot, ti) {
    const tpl = this.templates[ti];
    _m.makeRotationY(rot);
    _m.scale(_v.set(scale, scale, scale));
    _m.setPosition(wx, h - 0.3, wz);
    const g = tpl.geometry.clone();
    g.applyMatrix4(_m);
    let salt = 70;
    const rng = () => hash2(hx, hz, salt++);
    _leaf.set(leafSeason(wx, wz, rng));
    const col = g.getAttribute('color');
    const wind = g.getAttribute('aWind');
    for (let vi = 0; vi < col.count; vi++) {
      if (wind.getX(vi) > 0.28) {
        const j = 0.84 + (((vi * 2654435761) >>> 0) % 1000) / 1000 * 0.32;
        col.setXYZ(vi, _leaf.r * j, _leaf.g * j, _leaf.b * j);
      }
    }
    geos.push(g);
    trees.push(this._record(tpl, _m.clone(), wx, wz, h, scale));
  }

  _record(tpl, matrix, wx, wz, baseY, scale) {
    const sk = tpl.skeleton;
    const segments = [];
    // Trunk segment base→top (transformed).
    const base = new THREE.Vector3(0, 0.3, 0).applyMatrix4(matrix); // local base offset
    const top = sk.top.clone().applyMatrix4(matrix);
    segments.push({ a: base, b: top, r: sk.trunkRadius * scale, kind: 'trunk' });
    let maxR = 0;
    for (const br of sk.branches) {
      const a = br.a.clone().applyMatrix4(matrix);
      const b = br.b.clone().applyMatrix4(matrix);
      segments.push({ a, b, r: br.r * scale, kind: 'branch' });
      maxR = Math.max(maxR, a.distanceTo(_v.set(wx, a.y, wz)), b.distanceTo(_v.set(wx, b.y, wz)));
    }
    return {
      x: wx, z: wz, baseY,
      topY: top.y,
      trunkRadius: sk.trunkRadius * scale,
      height: sk.trunkHeight * scale,
      reach: Math.max(maxR, sk.trunkRadius * scale) + 1.5,
      segments,
    };
  }

  updateWind(t) {
    windUniforms.uTime.value = t;
  }
}
