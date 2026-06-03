import * as THREE from 'three';
import { WORLD } from '../config.js';
import { buildTerrainChunk } from './Terrain.js';
import { Forest } from './Forest.js';
import { Scatter } from './Scatter.js';

// Streams the endless forest in chunks around a moving focus point.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map(); // key "cx,cz" -> { group, trees }
    this.forest = new Forest();
    this.scatter = new Scatter();
    this._curKey = null;
    this._queue = [];        // pending chunk builds, nearest-first
    this.maxBuildsPerFrame = 2;
    // Flat list of nearby climbable trees, refreshed when chunks change.
    this.activeTrees = [];
  }

  _key(cx, cz) { return cx + ',' + cz; }

  update(focus) {
    const size = WORLD.chunkSize;
    const ccx = Math.round(focus.x / size);
    const ccz = Math.round(focus.z / size);
    const key = this._key(ccx, ccz);

    if (key !== this._curKey) {
      this._curKey = key;
      const r = WORLD.viewChunks;
      const need = new Set();
      const wanted = [];
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz > (r + 0.5) * (r + 0.5)) continue;
          const cx = ccx + dx, cz = ccz + dz;
          need.add(this._key(cx, cz));
          if (!this.chunks.has(this._key(cx, cz))) wanted.push([dx * dx + dz * dz, cx, cz]);
        }
      }
      // Queue missing chunks nearest-first; drop stale queued entries.
      wanted.sort((a, b) => a[0] - b[0]);
      this._queue = wanted;
      // Unload chunks that drifted out of range.
      for (const [k, chunk] of this.chunks) {
        if (!need.has(k)) {
          this.scene.remove(chunk.group);
          disposeGroup(chunk.group);
          this.chunks.delete(k);
        }
      }
    }

    // Stream a few chunks per frame so crossing a boundary never hitches.
    let budget = this.maxBuildsPerFrame;
    let built = false;
    while (budget-- > 0 && this._queue.length) {
      const [, cx, cz] = this._queue.shift();
      const k = this._key(cx, cz);
      if (!this.chunks.has(k)) { this._build(cx, cz, k); built = true; }
    }
    if (built) this._refreshActiveTrees();
  }

  // Build the whole active set right now (used once at spawn under the veil).
  buildAllPending() {
    while (this._queue.length) {
      const [, cx, cz] = this._queue.shift();
      const k = this._key(cx, cz);
      if (!this.chunks.has(k)) this._build(cx, cz, k);
    }
    this._refreshActiveTrees();
  }

  _build(cx, cz, k) {
    const group = new THREE.Group();
    group.add(buildTerrainChunk(cx, cz));
    const trees = this.forest.populate(cx, cz, group);
    this.scatter.populate(cx, cz, group);
    this.scene.add(group);
    this.chunks.set(k, { group, trees, cx, cz });
  }

  _refreshActiveTrees() {
    this.activeTrees.length = 0;
    for (const chunk of this.chunks.values()) {
      for (const t of chunk.trees) this.activeTrees.push(t);
    }
  }

  // Wind / ambient animation hook.
  update_anim(t) {
    this.forest.updateWind(t);
  }
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh) {
      o.geometry?.dispose?.();
      // shared materials are cached in factories; don't dispose here
    }
  });
}
