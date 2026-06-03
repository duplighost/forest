import * as THREE from 'three';
import { terrainHeight } from './Terrain.js';
import { WORLD } from '../config.js';

// Fish that swim in the nearest pond and occasionally leap with a splash and
// an expanding ripple ring on the surface.
const fishBody = new THREE.MeshStandardMaterial({ color: 0x9fb6c4, roughness: 0.5, metalness: 0.2 });
const fishBelly = new THREE.MeshStandardMaterial({ color: 0xe7d8a8, roughness: 0.5 });

function makeFish() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), fishBody);
  body.scale.set(0.12, 0.16, 0.34); body.castShadow = true;
  g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), fishBelly);
  belly.scale.set(0.09, 0.08, 0.26); belly.position.y = -0.05;
  g.add(belly);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 4), fishBody);
  tail.rotation.x = -Math.PI / 2; tail.position.z = -0.34; tail.scale.set(1, 0.4, 1);
  g.add(tail);
  g._tail = tail;
  return g;
}

export class PondLife {
  constructor(scene, fx, count = 6) {
    this.scene = scene; this.fx = fx;
    this.fish = [];
    for (let i = 0; i < count; i++) {
      const f = makeFish();
      f.userData = {
        ang: Math.random() * 6.28, rad: 2 + Math.random() * 5, speed: 0.5 + Math.random() * 0.5,
        depth: 0.4 + Math.random() * 1.2, jump: 0, jumpT: 4 + Math.random() * 8, phase: Math.random() * 6,
      };
      f.visible = false;
      scene.add(f); this.fish.push(f);
    }
    this.pond = null; this._scan = 0;

    // expanding ripple-ring pool
    const N = 28;
    const ring = new THREE.PlaneGeometry(1, 1); ring.rotateX(-Math.PI / 2);
    const age = new Float32Array(N);
    ring.setAttribute('aAge', new THREE.InstancedBufferAttribute(age, 1));
    this.ringAge = age; this.ringHead = 0; this.ringN = N;
    this.ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0xffffff) } },
      vertexShader: `attribute float aAge; varying float vA; varying vec2 vU;
        void main(){ vA = aAge; vU = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vA; varying vec2 vU; uniform vec3 uColor;
        void main(){ if (vA <= 0.0 || vA >= 1.0) discard;
          float r = length(vU - 0.5) * 2.0;
          float ring = smoothstep(vA - 0.12, vA, r) * smoothstep(vA + 0.04, vA, r);
          gl_FragColor = vec4(uColor, ring * (1.0 - vA) * 0.5); }`,
    });
    this.rings = new THREE.InstancedMesh(ring, this.ringMat, N);
    this.rings.frustumCulled = false;
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const m0 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) this.rings.setMatrixAt(i, m0);
    scene.add(this.rings);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
  }

  _ring(x, y, z, size) {
    const i = this.ringHead; this.ringHead = (this.ringHead + 1) % this.ringN;
    this._m.compose(new THREE.Vector3(x, y, z), this._q, new THREE.Vector3(size, 1, size));
    this.rings.setMatrixAt(i, this._m);
    this.ringAge[i] = 0.001;
    this.rings.instanceMatrix.needsUpdate = true;
  }

  _findPond(center) {
    let best = null, bestd = 1e9;
    for (let r = 6; r < 70; r += 6) {
      for (let a = 0; a < 6.28; a += 0.5) {
        const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
        const h = terrainHeight(x, z);
        if (h < WORLD.waterLevel - 1.2) {
          const d = r;
          if (d < bestd) { bestd = d; best = new THREE.Vector3(x, WORLD.waterLevel, z); }
        }
      }
      if (best) break;
    }
    return best;
  }

  update(dt, t, center) {
    // rings expand/fade
    let ringChanged = false;
    for (let i = 0; i < this.ringN; i++) {
      if (this.ringAge[i] > 0 && this.ringAge[i] < 1) { this.ringAge[i] += dt * 0.6; ringChanged = true; }
    }
    if (ringChanged) this.rings.geometry.attributes.aAge.needsUpdate = true;

    this._scan -= dt;
    if (this._scan <= 0 || !this.pond || this.pond.distanceTo(center) > 75) {
      this._scan = 2;
      const p = this._findPond(center);
      if (p) this.pond = p;
      else { this.pond = null; for (const f of this.fish) f.visible = false; }
    }
    if (!this.pond) return;

    for (const f of this.fish) {
      const u = f.userData;
      f.visible = true;
      u.ang += u.speed * dt * (0.4 + 0.6);
      const cx = this.pond.x + Math.cos(u.ang * 0.3) * 2;
      const cz = this.pond.z + Math.sin(u.ang * 0.23) * 2;
      const x = cx + Math.cos(u.ang) * u.rad;
      const z = cz + Math.sin(u.ang) * u.rad;

      // jump cycle
      u.jumpT -= dt;
      if (u.jumpT <= 0 && u.jump <= 0) { u.jump = 1; u.jumpT = 7 + Math.random() * 12; }
      let y = WORLD.waterLevel - u.depth;
      if (u.jump > 0) {
        u.jump -= dt * 1.3;
        const arc = Math.sin(Math.max(0, u.jump) * Math.PI); // 0..1..0
        y = WORLD.waterLevel + arc * 1.6 - 0.1;
        if (u.jump < 0.06) { this.fx.splash({ x, y: WORLD.waterLevel, z }); this._ring(x, WORLD.waterLevel + 0.05, z, 2.2); }
        if (u.jump > 0.94) { this._ring(x, WORLD.waterLevel + 0.05, z, 1.6); }
      }
      f.position.set(x, y, z);
      const heading = u.ang + Math.PI / 2;
      f.rotation.y = heading;
      f.rotation.x = u.jump > 0 ? (0.5 - (1 - u.jump)) * 1.2 : Math.sin(t * 3 + u.phase) * 0.1;
      f._tail.rotation.y = Math.sin(t * 12 + u.phase) * 0.5;
    }
  }
}
