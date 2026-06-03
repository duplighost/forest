import * as THREE from 'three';
import { terrainHeight, terrainSlope } from './Terrain.js';
import { snowAt } from './Biome.js';
import { WORLD } from '../config.js';

// ---------------------------------------------------------------------------
// Birds — a few loose flocks that wheel across the sky, flapping.
// ---------------------------------------------------------------------------
class Flock {
  constructor(scene, count) {
    this.group = new THREE.Group();
    this.birds = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0x2b2f3a, fog: true, side: THREE.DoubleSide });
    // a bird = a small body + two wing triangles in a shared little group
    const wingGeo = (() => {
      const g = new THREE.BufferGeometry();
      // two triangles meeting at the body (a shallow V)
      const v = new Float32Array([
        0, 0, 0, -0.9, 0.05, -0.35, -0.9, 0.05, 0.35,
        0, 0, 0, 0.9, 0.05, 0.35, 0.9, 0.05, -0.35,
      ]);
      g.setAttribute('position', new THREE.BufferAttribute(v, 3));
      g.computeVertexNormals();
      return g;
    })();
    for (let i = 0; i < count; i++) {
      const b = new THREE.Group();
      const left = new THREE.Mesh(wingGeo, mat);
      b.add(left);
      b.userData = {
        off: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 16),
        ph: Math.random() * 6, flap: 8 + Math.random() * 4,
        wing: left,
      };
      const s = 0.7 + Math.random() * 0.7;
      b.scale.setScalar(s);
      this.group.add(b);
      this.birds.push(b);
    }
    scene.add(this.group);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.reset(new THREE.Vector3());
  }

  reset(center) {
    const a = Math.random() * Math.PI * 2;
    this.pos.set(center.x + Math.cos(a) * 260, 70 + Math.random() * 60, center.z + Math.sin(a) * 260);
    const dir = Math.random() * Math.PI * 2;
    this.vel.set(Math.cos(dir), (Math.random() - 0.5) * 0.05, Math.sin(dir)).multiplyScalar(7 + Math.random() * 5);
    this._turn = (Math.random() - 0.5) * 0.2;
  }

  update(dt, center, t) {
    // gentle wheeling
    const ang = Math.atan2(this.vel.z, this.vel.x) + this._turn * dt;
    const sp = this.vel.length();
    this.vel.x = Math.cos(ang) * sp; this.vel.z = Math.sin(ang) * sp;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.distanceTo(center) > 340) this.reset(center);

    const heading = Math.atan2(this.vel.x, this.vel.z);
    for (const b of this.birds) {
      const u = b.userData;
      b.position.copy(this.pos).add(u.off);
      b.rotation.y = heading;
      const flap = Math.sin(t * u.flap + u.ph);
      u.wing.rotation.x = flap * 0.6;
      u.wing.rotation.z = 0;
      b.position.y += Math.sin(t * 2 + u.ph) * 0.3;
    }
  }
}

// ---------------------------------------------------------------------------
// Deer — graze and wander on the ground near the player; bound away if startled.
// ---------------------------------------------------------------------------
const deerCoat = new THREE.MeshStandardMaterial({ color: 0x9c6b43, roughness: 0.9 });
const deerBelly = new THREE.MeshStandardMaterial({ color: 0xd9c4a6, roughness: 0.9 });
const antlerMat = new THREE.MeshStandardMaterial({ color: 0x8a7250, roughness: 0.8 });

function ell(mat, rx, ry, rz, seg = 10) {
  const g = new THREE.SphereGeometry(1, seg, seg); g.scale(rx, ry, rz);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}

class Deer {
  constructor() {
    this.group = new THREE.Group();
    const body = ell(deerCoat, 0.55, 0.45, 0.95); body.position.y = 1.15; this.group.add(body);
    const belly = ell(deerBelly, 0.42, 0.32, 0.7); belly.position.set(0, 1.0, 0.05); this.group.add(belly);
    // neck + head
    this.neck = new THREE.Group(); this.neck.position.set(0, 1.4, 0.8); this.group.add(this.neck);
    const neckM = ell(deerCoat, 0.22, 0.38, 0.22); neckM.position.y = 0.2; this.neck.add(neckM);
    const head = ell(deerCoat, 0.22, 0.22, 0.42); head.position.set(0, 0.45, 0.18); this.neck.add(head);
    for (const sx of [-1, 1]) {
      const ear = ell(deerCoat, 0.07, 0.16, 0.05); ear.position.set(sx * 0.16, 0.6, 0.1); this.neck.add(ear);
      // little antlers
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.5, 5), antlerMat);
      a.position.set(sx * 0.12, 0.78, 0.12); a.rotation.z = sx * 0.4; this.neck.add(a);
      const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.28, 5), antlerMat);
      a2.position.set(sx * 0.26, 1.0, 0.12); a2.rotation.z = sx * 0.8; this.neck.add(a2);
    }
    // legs
    this.legs = [];
    const legGeo = new THREE.CylinderGeometry(0.07, 0.05, 1.1, 6);
    for (const [x, z] of [[-0.32, 0.6], [0.32, 0.6], [-0.34, -0.55], [0.34, -0.55]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, 1.05, z);
      const l = new THREE.Mesh(legGeo, deerCoat); l.position.y = -0.55; l.castShadow = true;
      pivot.add(l); this.group.add(pivot); this.legs.push(pivot);
    }
    const tail = ell(deerBelly, 0.1, 0.16, 0.1); tail.position.set(0, 1.3, -0.92); this.group.add(tail);

    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0; this.phase = Math.random() * 6;
    this.graze = 1; this._retime = 0; this.placed = false;
  }

  _wander(center) {
    const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 40;
    const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
    this.target.set(x, terrainHeight(x, z), z);
    this._retime = 3 + Math.random() * 5;
  }

  update(dt, center, t) {
    if (!this.placed || this.pos.distanceToSquared(center) > 120 * 120) {
      // (re)place on suitable ground near the player but not too close
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2, r = 22 + Math.random() * 40;
        const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
        if (terrainHeight(x, z) > WORLD.waterLevel + 0.6 && terrainSlope(x, z) < 0.5) {
          this.pos.set(x, terrainHeight(x, z), z); this.placed = true; break;
        }
      }
      this._wander(center);
    }
    this._retime -= dt;

    const distToPlayer = this.pos.distanceTo(center);
    const startled = distToPlayer < 16;
    if (startled) {
      // bound directly away
      this.heading = Math.atan2(this.pos.x - center.x, this.pos.z - center.z);
      this.speed += (9 - this.speed) * (1 - Math.exp(-4 * dt));
      this.graze += (0 - this.graze) * (1 - Math.exp(-8 * dt));
    } else {
      if (this._retime <= 0) this._wander(center);
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2) {
        const desired = Math.atan2(dx, dz);
        let diff = desired - this.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.heading += diff * (1 - Math.exp(-3 * dt));
        this.speed += (2.2 - this.speed) * (1 - Math.exp(-2 * dt));
        this.graze += (0 - this.graze) * (1 - Math.exp(-3 * dt));
      } else {
        this.speed += (0 - this.speed) * (1 - Math.exp(-3 * dt));
        this.graze += (1 - this.graze) * (1 - Math.exp(-2 * dt));
      }
    }

    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.pos.addScaledVector(fwd, this.speed * dt);
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    // gait
    this.phase += dt * (2 + this.speed * 1.5);
    const sw = Math.min(1, this.speed / 4);
    for (let i = 0; i < 4; i++) {
      this.legs[i].rotation.x = Math.sin(this.phase + (i % 2) * Math.PI + (i < 2 ? 0 : Math.PI)) * 0.5 * sw;
    }
    // head down to graze, up when moving/startled
    this.neck.rotation.x = THREE.MathUtils.lerp(0.1, 1.1, this.graze) + Math.sin(t * 2 + this.phase) * 0.04;
    this.group.position.y += Math.abs(Math.sin(this.phase)) * 0.04 * sw;
  }
}

export class Wildlife {
  constructor(scene, opts = {}) {
    this.flocks = [];
    const nf = opts.flocks ?? 2;
    for (let i = 0; i < nf; i++) this.flocks.push(new Flock(scene, 9 + (Math.random() * 5 | 0)));
    this.deer = [];
    const nd = opts.deer ?? 5;
    for (let i = 0; i < nd; i++) { const d = new Deer(); scene.add(d.group); this.deer.push(d); }
  }
  update(dt, center, t) {
    for (const f of this.flocks) f.update(dt, center, t);
    for (const d of this.deer) d.update(dt, center, t);
  }
}
