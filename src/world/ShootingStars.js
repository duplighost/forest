import * as THREE from 'three';

// Occasional meteors that streak across the sky on clear nights. Each is a
// short comet — a fading trail of additive points — that shoots across the
// celestial dome and burns out, then another is scheduled a while later.
export class ShootingStars {
  constructor(scene, max = 3, trail = 12) {
    this.max = max; this.trail = trail; this.n = max * trail;
    this.pos = new Float32Array(this.n * 3);
    this.a = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) this.pos[i * 3 + 1] = -9999;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aA', new THREE.BufferAttribute(this.a, 1));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uNight: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aA; uniform float uNight; varying float vA;
        void main(){ vA = aA * uNight;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (1.0 + 9.0 * aA) * (90.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){ if (vA <= 0.01) discard;
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(0.85, 0.92, 1.0), a * vA); }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 0;
    scene.add(this.points);

    this.stars = [];
    for (let i = 0; i < max; i++) {
      this.stars.push({ active: false, base: i * trail, head: 0, life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
    this._t = 3 + Math.random() * 6;
  }

  _spawn(s) {
    const R = 700;
    const az = Math.random() * 6.28;
    const el = THREE.MathUtils.degToRad(34 + Math.random() * 42);
    s.pos.set(R * Math.cos(el) * Math.cos(az), R * Math.sin(el), R * Math.cos(el) * Math.sin(az));
    const a2 = az + (Math.random() < 0.5 ? 1 : -1) * (1.0 + Math.random());
    s.vel.set(Math.cos(a2), -0.25 - Math.random() * 0.5, Math.sin(a2)).normalize().multiplyScalar(720 + Math.random() * 420);
    s.life = 0.7 + Math.random() * 0.5; s.active = true; s.head = 0;
    for (let k = 0; k < this.trail; k++) { this.a[s.base + k] = 0; this.pos[(s.base + k) * 3 + 1] = -9999; }
  }

  update(dt, camPos, night, clear) {
    this.points.position.copy(camPos);
    this.mat.uniforms.uNight.value = night;
    for (const s of this.stars) {
      if (s.active) {
        s.life -= dt;
        s.pos.addScaledVector(s.vel, dt);
        const idx = s.base + s.head; s.head = (s.head + 1) % this.trail;
        this.pos[idx * 3] = s.pos.x; this.pos[idx * 3 + 1] = s.pos.y; this.pos[idx * 3 + 2] = s.pos.z;
        this.a[idx] = 1;
        if (s.life <= 0) s.active = false;
      }
      for (let k = 0; k < this.trail; k++) {
        const i = s.base + k;
        if (this.a[i] > 0) this.a[i] = Math.max(0, this.a[i] - dt * 3.2);
      }
    }
    this._t -= dt;
    if (night > 0.55 && clear > 0.4 && this._t <= 0) {
      const s = this.stars.find((x) => !x.active);
      if (s) this._spawn(s);
      this._t = 3.5 + Math.random() * 9;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aA.needsUpdate = true;
  }
}
