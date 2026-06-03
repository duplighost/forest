import * as THREE from 'three';
import { terrainHeight } from './Terrain.js';
import { WORLD } from '../config.js';

// Fireflies that drift near the ground and blink, fading in at dusk/night.
export class Fireflies {
  constructor(scene, count = 130) {
    this.count = count;
    this.range = 60;
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    this.seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.range;
      pos[i * 3 + 1] = 0.5 + Math.random() * 3.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * this.range;
      phase[i] = Math.random() * 6.28;
      this.seed[i] = Math.random() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aPhase; uniform float uTime, uNight; varying float vB;
        void main(){
          float blink = pow(max(0.0, sin(uTime * 2.2 + aPhase)), 12.0);
          vB = blink * uNight;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (1.2 + 2.4 * blink) * (14.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vB;
        void main(){
          if (vB <= 0.002) discard;
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vec3(0.7, 0.95, 0.42), a * vB * 0.85);
        }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  update(dt, t, center, dayAmount) {
    this.mat.uniforms.uTime.value = t;
    const night = THREE.MathUtils.clamp(1 - dayAmount * 1.4, 0, 1);
    this.mat.uniforms.uNight.value = night;
    if (night <= 0.01) return; // skip the work in daylight
    const arr = this.geo.attributes.position.array;
    const r = this.range;
    const ox = center.x - r / 2, oz = center.z - r / 2;
    for (let i = 0; i < this.count; i++) {
      const s = this.seed[i];
      let x = arr[i * 3], z = arr[i * 3 + 2];
      x += Math.sin(t * 0.5 + s) * 0.012;
      z += Math.cos(t * 0.42 + s * 1.3) * 0.012;
      // wrap within a box that follows the player
      let lx = x - ox, lz = z - oz;
      if (lx < 0) x += r; else if (lx > r) x -= r;
      if (lz < 0) z += r; else if (lz > r) z -= r;
      const ground = terrainHeight(x, z);
      const y = Math.max(ground, WORLD.waterLevel) + 0.6 + (1.6 + Math.sin(t * 0.6 + s) * 1.1);
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
