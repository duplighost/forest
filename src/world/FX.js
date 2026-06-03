import * as THREE from 'three';

// Transient particle bursts (splash / dust / leaves) for movement juice.
function softSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 48, 48);
  return new THREE.CanvasTexture(c);
}

export class FX {
  constructor(scene, max = 260) {
    this.max = max;
    this.head = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grav = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo = geo;

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: softSprite() } },
      transparent: true, depthWrite: false, vertexColors: true,
      vertexShader: /* glsl */ `
        attribute float aLife; attribute float aSize;
        varying float vLife; varying vec3 vCol;
        void main(){
          vLife = aLife; vCol = color;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * (0.3 + aLife) * (260.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; varying float vLife; varying vec3 vCol;
        void main(){
          if (vLife <= 0.0) discard;
          float a = texture2D(uTex, gl_PointCoord).a;
          gl_FragColor = vec4(vCol, a * clamp(vLife,0.0,1.0));
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  _emit(x, y, z, vx, vy, vz, color, size, life, grav) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this._c.set(color);
    this.col[i * 3] = this._c.r; this.col[i * 3 + 1] = this._c.g; this.col[i * 3 + 2] = this._c.b;
    this.size[i] = size; this.life[i] = 1; this.maxLife[i] = life; this.grav[i] = grav;
  }

  splash(p) {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
      this._emit(p.x, p.y + 0.1, p.z, Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s,
        Math.random() < 0.5 ? 0xcdeefb : 0xffffff, 0.5 + Math.random() * 0.6, 0.6 + Math.random() * 0.4, 12);
    }
  }
  dust(p) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * 2.2;
      this._emit(p.x, p.y + 0.05, p.z, Math.cos(a) * s, 0.4 + Math.random() * 1.2, Math.sin(a) * s,
        0xcdbd97, 0.7 + Math.random() * 0.8, 0.5 + Math.random() * 0.3, 1.5);
    }
  }
  // a single leaf/petal carried on the wind
  windLeaf(x, y, z, color, wx, wz) {
    this._emit(x, y, z,
      wx + (Math.random() - 0.5) * 2.5, -0.4 + Math.random() * 0.6, wz + (Math.random() - 0.5) * 2.5,
      color, 0.45 + Math.random() * 0.45, 3 + Math.random() * 2.5, 1.1);
  }
  // colourful petals kicked up when running through flowers
  petals(p) {
    const cols = [0xf6bcd6, 0xffe26b, 0xfbf3ff, 0x9bb8e6, 0xef8fb0, 0xc2e588, 0xffc24d];
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.6;
      this._emit(p.x + (Math.random() - 0.5) * 0.7, p.y + 0.15, p.z + (Math.random() - 0.5) * 0.7,
        Math.cos(a) * s, 1.3 + Math.random() * 2.0, Math.sin(a) * s,
        cols[(Math.random() * cols.length) | 0], 0.4 + Math.random() * 0.45, 0.9 + Math.random() * 0.7, 2.4);
    }
  }
  footDust(p) {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.3 + Math.random() * 0.9;
      this._emit(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.06, p.z + (Math.random() - 0.5) * 0.3,
        Math.cos(a) * s, 0.3 + Math.random() * 0.7, Math.sin(a) * s,
        0xd9cca8, 0.45 + Math.random() * 0.45, 0.4 + Math.random() * 0.25, 1.8);
    }
  }
  leaves(p) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2;
      this._emit(p.x, p.y + 1 + Math.random(), p.z, Math.cos(a) * s, 1 + Math.random() * 2, Math.sin(a) * s,
        Math.random() < 0.3 ? 0xd99a3e : 0x86c24f, 0.5 + Math.random() * 0.5, 0.8 + Math.random() * 0.5, 3.5);
    }
  }

  update(dt) {
    const { pos, vel, life, maxLife, grav } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt / maxLife[i];
      if (life[i] <= 0) { pos[i * 3 + 1] = -9999; continue; }
      vel[i * 3 + 1] -= grav[i] * dt;
      // gentle air drag
      const d = Math.exp(-1.5 * dt);
      vel[i * 3] *= d; vel[i * 3 + 2] *= d;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aLife.needsUpdate = true;
  }
}
