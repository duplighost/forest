import * as THREE from 'three';

// Faint wind streaks that rush past the camera along your travel direction when
// you glide fast — a sense-of-speed effect that fades in with velocity.
export class Streaks {
  constructor(scene, n = 80) {
    this.n = n;
    const pos = new Float32Array(n * 2 * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = new THREE.LineBasicMaterial({
      color: 0xeaf2ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 4;
    scene.add(this.lines);
    this.off = [];
    for (let i = 0; i < n; i++) this.off.push({ a: Math.random() * 6.28, r: 1.5 + Math.random() * 8, d: Math.random() });
    this._f = new THREE.Vector3();
    this._r = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  update(dt, camPos, dir, speed, active) {
    const amt = active ? THREE.MathUtils.clamp((speed - 17) / 16, 0, 1) : 0;
    this.mat.opacity += (amt * 0.3 - this.mat.opacity) * Math.min(1, dt * 6);
    if (this.mat.opacity < 0.008) { this.lines.visible = false; return; }
    this.lines.visible = true;

    const f = this._f.copy(dir); if (f.lengthSq() < 1e-4) f.set(0, 0, 1); f.normalize();
    const r = this._r.crossVectors(f, this._up); if (r.lengthSq() < 1e-4) r.set(1, 0, 0); r.normalize();
    const u = this._u.crossVectors(r, f).normalize();
    const arr = this.geo.attributes.position.array;
    const len = 2.5 + speed * 0.32;
    const ahead = 8, span = 34;
    for (let i = 0; i < this.n; i++) {
      const o = this.off[i];
      o.d -= dt * (0.5 + speed * 0.05);
      if (o.d < 0) { o.d += 1; o.a = Math.random() * 6.28; o.r = 1.5 + Math.random() * 8; }
      const along = ahead - o.d * span;
      const ox = (r.x * Math.cos(o.a) + u.x * Math.sin(o.a)) * o.r;
      const oy = (r.y * Math.cos(o.a) + u.y * Math.sin(o.a)) * o.r;
      const oz = (r.z * Math.cos(o.a) + u.z * Math.sin(o.a)) * o.r;
      const hx = camPos.x + f.x * along + ox, hy = camPos.y + f.y * along + oy, hz = camPos.z + f.z * along + oz;
      const k = i * 6;
      arr[k] = hx; arr[k + 1] = hy; arr[k + 2] = hz;
      arr[k + 3] = hx - f.x * len; arr[k + 4] = hy - f.y * len; arr[k + 5] = hz - f.z * len;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
