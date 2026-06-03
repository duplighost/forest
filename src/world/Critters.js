import * as THREE from 'three';
import { terrainHeight } from './Terrain.js';
import { WORLD } from '../config.js';

// A few butterflies that wander near the player, flapping and banking. Pure
// charm — they keep the forest feeling alive.
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
        placed: false,
      });
    }
  }

  _newTarget(b, center) {
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 16;
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const y = Math.max(terrainHeight(x, z), WORLD.waterLevel) + 1.2 + Math.random() * 4;
    b.target.set(x, y, z);
    b.retarget = 2 + Math.random() * 3;
  }

  update(dt, center) {
    for (const b of this.list) {
      if (!b.placed || b.pos.distanceToSquared(center) > 60 * 60) {
        b.pos.copy(center).add(new THREE.Vector3((Math.random() - 0.5) * 20, 3 + Math.random() * 4, (Math.random() - 0.5) * 20));
        this._newTarget(b, center);
        b.placed = true;
      }
      b.retarget -= dt;
      if (b.retarget <= 0 || b.pos.distanceToSquared(b.target) < 1.2) this._newTarget(b, center);

      // steer toward target with a fluttery, bobbing path
      const dir = b.target.clone().sub(b.pos);
      const dist = dir.length() || 1;
      dir.multiplyScalar(1 / dist);
      b.vel.addScaledVector(dir, 6 * dt);
      b.vel.y += Math.sin(b.phase * 6) * 0.6 * dt; // bob
      b.vel.multiplyScalar(0.92);
      const sp = b.vel.length();
      if (sp > 4) b.vel.multiplyScalar(4 / sp);
      b.pos.addScaledVector(b.vel, dt);
      b.phase += dt;

      b.g.position.copy(b.pos);
      // face travel, bank a touch
      const yaw = Math.atan2(b.vel.x, b.vel.z);
      b.g.rotation.set(0, yaw, Math.sin(b.phase * 3) * 0.15);
      // flap
      const f = Math.sin(b.phase * b.flap) * 0.9 + 0.5;
      b.wl.rotation.z = f;
      b.wr.rotation.z = -f;
    }
  }
}
