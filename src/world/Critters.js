import * as THREE from 'three';
import { terrainHeight } from './Terrain.js';
import { flowerAt } from './Biome.js';
import { WORLD } from '../config.js';

// Butterflies that wander and rest on flowers near the player, flapping and
// banking — and burst up to scatter when you run through them. Pure charm.
function wingShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.05, 0.18, 0.22, 0.22, 0.26, 0.08);
  s.bezierCurveTo(0.30, -0.04, 0.20, -0.20, 0.10, -0.22);
  s.bezierCurveTo(0.04, -0.22, 0.0, -0.12, 0, 0);
  return new THREE.ShapeGeometry(s, 8);
}

export class Critters {
  constructor(scene, count = 7) {
    this.scene = scene;
    this.list = [];
    this.scatters = 0;   // debug: how many times a butterfly has been startled
    const wg = wingShape();
    const colors = [0xe8893a, 0xf2f2f2, 0x9bb8e6, 0xf2c94c, 0xd97fb0, 0xef7d54];
    const bodyGeo = new THREE.CapsuleGeometry(0.025, 0.12, 3, 6);
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const col = colors[i % colors.length];
      const wingMat = new THREE.MeshStandardMaterial({
        color: col, roughness: 0.6, side: THREE.DoubleSide,
        emissive: new THREE.Color(col).multiplyScalar(0.12),
      });
      const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.7 }));
      body.rotation.x = Math.PI / 2;
      g.add(body);
      const wl = new THREE.Group(), wr = new THREE.Group();
      const ml = new THREE.Mesh(wg, wingMat); ml.castShadow = false;
      const mr = new THREE.Mesh(wg, wingMat);
      mr.scale.x = -1;
      wl.add(ml); wr.add(mr);
      g.add(wl); g.add(wr);
      const scale = 0.8 + Math.random() * 0.7;
      g.scale.setScalar(scale);
      this.scene.add(g);
      this.list.push({
        g, wl, wr,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        target: new THREE.Vector3(),
        phase: Math.random() * 10,
        flap: 22 + Math.random() * 10,
        retarget: 0,
        flee: 0,
        placed: false,
      });
    }
  }

  _newTarget(b, center) {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 16;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const ground = Math.max(terrainHeight(x, z), WORLD.waterLevel);
    // drift down to rest on a flower / blade — likelier where flowers bloom, so
    // you find little gatherings of them to run through and scatter.
    const fl = flowerAt(x, z);
    b.landing = ground > WORLD.waterLevel + 0.3 && Math.random() < 0.32 + fl * 0.5;
    const y = b.landing ? ground + 0.16 : ground + 1.0 + Math.random() * 3.6;
    b.target.set(x, y, z);
    b.retarget = 2 + Math.random() * 3;
  }

  update(dt, center, speed = 0) {
    for (const b of this.list) {
      b.phase += dt;
      if (!b.placed || b.pos.distanceToSquared(center) > 60 * 60) {
        b.pos.copy(center).add(new THREE.Vector3((Math.random() - 0.5) * 20, 3 + Math.random() * 4, (Math.random() - 0.5) * 20));
        this._newTarget(b, center);
        b.placed = true; b.rest = 0; b.flee = 0;
      }

      // --- startle: run near one and it bursts up and away, scattering ---
      const dx = b.pos.x - center.x, dz = b.pos.z - center.z;
      const horiz = Math.hypot(dx, dz);
      if (b.flee <= 0 && speed > 3 && horiz < 3.3 && Math.abs(b.pos.y - center.y) < 2.6) {
        b.flee = 0.9 + Math.random() * 0.5; this.scatters++;
        b.rest = 0; b.landing = false;
        const inv = 1 / (horiz || 1);
        b.vel.set(dx * inv, 0, dz * inv).multiplyScalar(6 + Math.random() * 5);
        b.vel.y += 3 + Math.random() * 3;                 // burst upward
        const a = Math.atan2(dz, dx) + (Math.random() - 0.5) * 1.2;
        const r = 9 + Math.random() * 8;
        const tx = center.x + Math.cos(a) * r, tz = center.z + Math.sin(a) * r;
        b.target.set(tx, Math.max(terrainHeight(tx, tz), WORLD.waterLevel) + 2.5 + Math.random() * 3, tz);
        b.retarget = 2 + Math.random() * 2;
      }

      // resting on a flower / blade: perch still, wings opening & closing slowly
      if (b.rest > 0) {
        b.rest -= dt;
        b.g.position.copy(b.pos);
        const fold = 1.35 + Math.sin(b.phase * 2.5) * 0.5; // wings clap together
        b.wl.rotation.z = fold; b.wr.rotation.z = -fold;
        if (b.rest <= 0) { this._newTarget(b, center); b.landing = false; }
        continue;
      }

      const fleeing = b.flee > 0;
      if (fleeing) b.flee -= dt;
      b.retarget -= dt;
      const reached = b.pos.distanceToSquared(b.target) < 1.0;
      if (reached && b.landing && !fleeing) { b.rest = 2.5 + Math.random() * 4; continue; }
      if (!fleeing && (b.retarget <= 0 || reached)) this._newTarget(b, center);

      // steer toward target with a fluttery, bobbing path (faster when fleeing)
      const dir = b.target.clone().sub(b.pos);
      const dist = dir.length() || 1;
      dir.multiplyScalar(1 / dist);
      b.vel.addScaledVector(dir, (fleeing ? 10 : 6) * dt);
      b.vel.y += Math.sin(b.phase * 6) * 0.6 * dt; // bob
      b.vel.multiplyScalar(fleeing ? 0.96 : 0.92);
      const maxSp = fleeing ? 11 : 4;
      const sp = b.vel.length();
      if (sp > maxSp) b.vel.multiplyScalar(maxSp / sp);
      b.pos.addScaledVector(b.vel, dt);

      b.g.position.copy(b.pos);
      const yaw = Math.atan2(b.vel.x, b.vel.z);
      b.g.rotation.set(b.landing ? 0.3 : 0, yaw, Math.sin(b.phase * 3) * (fleeing ? 0.35 : 0.15));
      const f = Math.sin(b.phase * b.flap * (fleeing ? 1.7 : 1.0)) * 0.9 + 0.5;
      b.wl.rotation.z = f;
      b.wr.rotation.z = -f;
    }
  }
}
