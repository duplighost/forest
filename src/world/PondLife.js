import * as THREE from 'three';
import { terrainHeight } from './Terrain.js';
import { hash2 } from './Noise.js';
import { WORLD } from '../config.js';

// Fish that swim in the nearest pond and occasionally leap with a splash and
// an expanding ripple ring on the surface — plus lily pads on the surface and
// soft shadows that glide beneath it so the fish read as shapes under water.
const fishBody = new THREE.MeshStandardMaterial({ color: 0x9fb6c4, roughness: 0.5, metalness: 0.2 });
const fishBelly = new THREE.MeshStandardMaterial({ color: 0xe7d8a8, roughness: 0.5 });
const padMat = new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
const flowerMat = new THREE.MeshStandardMaterial({ color: 0xfbd2e2, roughness: 0.7, emissive: 0x4a2030, emissiveIntensity: 0.15 });

const PADS = 18;

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

// Soft dark radial disc for the fish shadows.
function softDarkDisc() {
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0.0, 'rgba(0,0,0,0.8)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 48, 48);
  return new THREE.CanvasTexture(c);
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
    this.pond = null; this._scan = 0; this._padPond = null;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();

    // --- expanding ripple-ring pool ---
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

    // --- fish shadows: soft dark discs that follow the fish on the surface ---
    const sgeo = new THREE.CircleGeometry(1, 18);     // in XY plane, faces +Z
    const fade = new Float32Array(count);
    sgeo.setAttribute('aFade', new THREE.InstancedBufferAttribute(fade, 1));
    this.shadowFade = fade;
    this.shadowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTex: { value: softDarkDisc() } },
      vertexShader: `attribute float aFade; varying float vF; varying vec2 vU;
        void main(){ vF = aFade; vU = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D uTex; varying float vF; varying vec2 vU;
        void main(){ if (vF <= 0.002) discard;
          float a = texture2D(uTex, vU).a;
          gl_FragColor = vec4(0.03, 0.05, 0.04, a * vF); }`,
    });
    this.shadows = new THREE.InstancedMesh(sgeo, this.shadowMat, count);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 2;
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) this.shadows.setMatrixAt(i, m0);
    scene.add(this.shadows);

    // --- lily pads (notched discs) + occasional lily flowers ---
    const padShape = new THREE.Shape();
    padShape.absarc(0, 0, 1, 0.42, Math.PI * 2 - 0.42, false);
    padShape.lineTo(0, 0);                              // notch back to centre
    const padGeo = new THREE.ShapeGeometry(padShape, 26);   // in XY plane
    this.pads = new THREE.InstancedMesh(padGeo, padMat, PADS);
    this.pads.receiveShadow = true;
    this.pads.frustumCulled = false;
    this.pads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const flowerGeo = new THREE.ConeGeometry(0.17, 0.24, 6);
    this.flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, PADS);
    this.flowers.frustumCulled = false;
    this.flowers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < PADS; i++) { this.pads.setMatrixAt(i, m0); this.flowers.setMatrixAt(i, m0); }
    scene.add(this.pads, this.flowers);
    this.padData = [];
  }

  _ring(x, y, z, size) {
    const i = this.ringHead; this.ringHead = (this.ringHead + 1) % this.ringN;
    this._m.compose(this._v.set(x, y, z), new THREE.Quaternion(), new THREE.Vector3(size, 1, size));
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

  // Deterministically scatter lily pads across the found pond (same pond →
  // same layout), keeping only the ones that land on actual water.
  _layoutPads() {
    const sx = Math.round(this.pond.x / 4), sz = Math.round(this.pond.z / 4);
    let salt = 0; const rng = () => hash2(sx, sz, salt++);
    this.padData.length = 0;
    const m0 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let k = 0; k < PADS; k++) {
      const ang = rng() * 6.28, rad = rng() * 9.0;
      const x = this.pond.x + Math.cos(ang) * rad;
      const z = this.pond.z + Math.sin(ang) * rad;
      const active = terrainHeight(x, z) < WORLD.waterLevel - 0.3;
      const d = {
        x, z, active,
        scale: 0.55 + rng() * 0.95,
        yaw: rng() * 6.28,
        phase: rng() * 6.28,
        flower: active && rng() < 0.34,
      };
      this.padData.push(d);
      if (!active) { this.pads.setMatrixAt(k, m0); this.flowers.setMatrixAt(k, m0); }
      if (!d.flower) this.flowers.setMatrixAt(k, m0);
    }
    this.pads.instanceMatrix.needsUpdate = true;
    this.flowers.instanceMatrix.needsUpdate = true;
  }

  _hideSurface() {
    const m0 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < PADS; i++) { this.pads.setMatrixAt(i, m0); this.flowers.setMatrixAt(i, m0); }
    for (let i = 0; i < this.fish.length; i++) this.shadows.setMatrixAt(i, m0);
    this.pads.instanceMatrix.needsUpdate = true;
    this.flowers.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
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
    if (!this.pond) { this._hideSurface(); this._padPond = null; return; }

    // (re)scatter lily pads when the active pond changes
    if (!this._padPond || this._padPond.distanceTo(this.pond) > 1) {
      this._padPond = this.pond.clone();
      this._layoutPads();
    }

    // --- lily pads: gentle bob + sway on the surface ---
    const wl = WORLD.waterLevel;
    for (let k = 0; k < PADS; k++) {
      const d = this.padData[k];
      if (!d || !d.active) continue;
      const bob = Math.sin(t * 1.3 + d.phase) * 0.04;
      this._e.set(-Math.PI / 2 + Math.sin(t * 0.9 + d.phase) * 0.05, d.yaw, Math.cos(t * 1.1 + d.phase) * 0.05);
      this._q.setFromEuler(this._e);
      this._m.compose(this._v.set(d.x, wl + 0.06 + bob, d.z), this._q, new THREE.Vector3(d.scale, d.scale, d.scale));
      this.pads.setMatrixAt(k, this._m);
      if (d.flower) {
        this._e.set(0, d.yaw, 0); this._q.setFromEuler(this._e);
        this._m.compose(this._v.set(d.x, wl + 0.16 + bob, d.z), this._q, new THREE.Vector3(d.scale * 0.6, d.scale * 0.7, d.scale * 0.6));
        this.flowers.setMatrixAt(k, this._m);
      }
    }
    this.pads.instanceMatrix.needsUpdate = true;
    this.flowers.instanceMatrix.needsUpdate = true;

    // --- fish + their under-surface shadows ---
    for (let fi = 0; fi < this.fish.length; fi++) {
      const f = this.fish[fi];
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
      let y = wl - u.depth;
      let arc = 0;
      if (u.jump > 0) {
        u.jump -= dt * 1.3;
        arc = Math.sin(Math.max(0, u.jump) * Math.PI); // 0..1..0
        y = wl + arc * 1.6 - 0.1;
        if (u.jump < 0.06) { this.fx.splash({ x, y: wl, z }); this._ring(x, wl + 0.05, z, 2.2); }
        if (u.jump > 0.94) { this._ring(x, wl + 0.05, z, 1.6); }
      }
      f.position.set(x, y, z);
      const heading = u.ang + Math.PI / 2;
      f.rotation.y = heading;
      f.rotation.x = u.jump > 0 ? (0.5 - (1 - u.jump)) * 1.2 : Math.sin(t * 3 + u.phase) * 0.1;
      f._tail.rotation.y = Math.sin(t * 12 + u.phase) * 0.5;

      // shadow on the surface: larger & fainter the deeper the fish, gone mid-leap
      const sScale = 0.55 + u.depth * 0.5;
      this._e.set(-Math.PI / 2, heading, 0); this._q.setFromEuler(this._e);
      this._m.compose(this._v.set(x, wl + 0.03, z), this._q, new THREE.Vector3(sScale, sScale * 1.3, sScale));
      this.shadows.setMatrixAt(fi, this._m);
      this.shadowFade[fi] = THREE.MathUtils.clamp(0.85 - u.depth * 0.32, 0.18, 0.85) * (1 - arc);
    }
    this.shadows.instanceMatrix.needsUpdate = true;
    this.shadows.geometry.attributes.aFade.needsUpdate = true;
  }
}
