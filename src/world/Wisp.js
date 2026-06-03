import * as THREE from 'three';
import { terrainHeight } from './Terrain.js';
import { WORLD } from '../config.js';

// Soft radial sprite used for the wisp's core and halo.
function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// A glowing forest spirit that drifts ahead of the player, leading them on.
// It darts playfully away when you catch up and slows to wait when you fall
// behind. Not a collectible — just a companion to chase through the trees.
export class Wisp {
  constructor(scene) {
    this.scene = scene;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.col = new THREE.Color();
    this.hue = 0.45;          // slowly drifts → dreamy shifting pastel
    this._placed = false;
    this._dartCool = 0;
    this._dir = Math.random() * 6.28;
    this.freeze = false;      // debug: hold position for screenshots

    const tex = haloTexture();
    const sprite = (scale) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: 0xffffff, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false,
      }));
      s.scale.setScalar(scale); s.frustumCulled = false;
      return s;
    };
    this.halo = sprite(2.4);
    this.core = sprite(0.9);
    this.light = new THREE.PointLight(0xffffff, 0, 18, 2);

    this.group = new THREE.Group();
    this.group.add(this.halo, this.core, this.light);
    scene.add(this.group);

    // comet trail — a ring buffer of fading additive points
    this.trailN = 28;
    this.trailPos = new Float32Array(this.trailN * 3);
    this.trailAge = new Float32Array(this.trailN);   // 1 = freshest, fades to 0
    for (let i = 0; i < this.trailN; i++) this.trailPos[i * 3 + 1] = -9999;
    const tgeo = new THREE.BufferGeometry();
    tgeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    tgeo.setAttribute('aAge', new THREE.BufferAttribute(this.trailAge, 1));
    this.trailGeo = tgeo;
    this.trailMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uColor: { value: new THREE.Color(0xffffff) } },
      vertexShader: /* glsl */ `
        attribute float aAge; varying float vA;
        void main(){ vA = aAge;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (1.0 + 7.0 * aAge) * (60.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        varying float vA; uniform vec3 uColor;
        void main(){ if (vA <= 0.01) discard;
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(uColor, a * vA * vA * 0.5); }`,
    });
    this.trail = new THREE.Points(tgeo, this.trailMat);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 3;
    scene.add(this.trail);
    this._trailHead = 0;
    this._trailT = 0;
  }

  _hoverY(x, z) {
    return Math.max(terrainHeight(x, z), WORLD.waterLevel) + 3.2;
  }

  // Pick a fresh waypoint ahead of the player, gently wandering in heading.
  _newTarget(player, far) {
    this._dir += (Math.random() - 0.5) * 1.5;
    const dist = far ? 15 + Math.random() * 11 : 9 + Math.random() * 8;
    const x = player.x + Math.cos(this._dir) * dist;
    const z = player.z + Math.sin(this._dir) * dist;
    this.target.set(x, this._hoverY(x, z) + (Math.random() - 0.5) * 2.0, z);
  }

  // Place the wisp at a fixed point and stop it moving (debug/screenshots).
  park(x, y, z) { this.pos.set(x, y, z); this.freeze = true; this._placed = true; }

  update(dt, t, player, dayAmount) {
    if (!this._placed) {
      this._dir = Math.random() * 6.28;
      const x = player.x + Math.cos(this._dir) * 12, z = player.z + Math.sin(this._dir) * 12;
      this.pos.set(x, this._hoverY(x, z), z);
      this._newTarget(player, true);
      this._placed = true;
    }

    const distToPlayer = this.pos.distanceTo(player);
    let darted = false;

    if (!this.freeze) {
      if (distToPlayer > 130) { this._placed = false; }   // abandoned → respawn near
      this._dartCool -= dt;

      // caught up → dart away playfully; reached waypoint → wander on
      if (distToPlayer < 6.5 && this._dartCool <= 0) {
        this._newTarget(player, true); this._dartCool = 1.0; darted = true;
      } else if (this.pos.distanceTo(this.target) < 2.5) {
        this._newTarget(player, distToPlayer < 26);
      }

      // seek the waypoint, but slow to a hover if the player is far behind
      const far = distToPlayer > 32;
      const maxSpeed = far ? 2.0 : (darted ? 17 : 7.5);
      const toT = this.target.clone().sub(this.pos);
      const d = toT.length(); if (d > 0.001) toT.multiplyScalar(1 / d);
      this.vel.addScaledVector(toT, (far ? 6 : 18) * dt);
      this.vel.x += Math.sin(t * 1.7 + 1.0) * dt * 1.2;   // organic drift
      this.vel.z += Math.cos(t * 1.3 + 2.0) * dt * 1.2;
      const sp = this.vel.length();
      if (sp > maxSpeed) this.vel.multiplyScalar(maxSpeed / sp);
      this.pos.addScaledVector(this.vel, dt);

      const hy = this._hoverY(this.pos.x, this.pos.z) + Math.sin(t * 1.8) * 0.35;
      this.pos.y += (hy - this.pos.y) * (1 - Math.exp(-3 * dt));
    }

    this.group.position.copy(this.pos);

    // --- glow / colour ---
    this.hue = (this.hue + dt * 0.03) % 1;          // slow dreamy hue drift
    this.col.setHSL(this.hue, 0.55, 0.72);
    const near = THREE.MathUtils.clamp(1 - (distToPlayer - 5) / 22, 0, 1);
    const pulse = 0.85 + Math.sin(t * 4) * 0.15;
    const glow = (0.5 + near * 0.5) * pulse;
    this.core.material.color.copy(this.col).multiplyScalar(1.35);
    this.halo.material.color.copy(this.col);
    this.core.material.opacity = glow;
    this.halo.material.opacity = 0.6 * glow;
    this.core.scale.setScalar(0.8 + near * 0.5);
    this.halo.scale.setScalar((2.0 + near * 1.4) * (0.95 + Math.sin(t * 3) * 0.05));
    const night = THREE.MathUtils.clamp(1 - dayAmount * 1.1, 0, 1);
    this.light.color.copy(this.col);
    this.light.intensity = (0.6 + near * 1.4) * (0.4 + night * 1.5) * pulse;

    // --- comet trail ---
    this.trailMat.uniforms.uColor.value.copy(this.col).multiplyScalar(1.15);
    for (let i = 0; i < this.trailN; i++)
      if (this.trailAge[i] > 0) this.trailAge[i] = Math.max(0, this.trailAge[i] - dt * 1.6);
    this._trailT -= dt;
    if (this._trailT <= 0) {
      this._trailT = 0.03;
      const h = this._trailHead; this._trailHead = (this._trailHead + 1) % this.trailN;
      this.trailPos[h * 3] = this.pos.x; this.trailPos[h * 3 + 1] = this.pos.y; this.trailPos[h * 3 + 2] = this.pos.z;
      this.trailAge[h] = 1;
      this.trailGeo.attributes.position.needsUpdate = true;
    }
    this.trailGeo.attributes.aAge.needsUpdate = true;

    return { near, darted, dist: distToPlayer };
  }
}
