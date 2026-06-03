import * as THREE from 'three';
import { terrainHeight, terrainNormal } from './Terrain.js';

// Fading footprints pressed into the snow as the squirrel walks.
export class Footprints {
  constructor(scene, max = 40) {
    this.max = max;
    this.head = 0;
    this.life = 7;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const alpha = new Float32Array(max);
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
    this.alpha = alpha;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      uniforms: { uColor: { value: new THREE.Color(0x66788f) } },
      vertexShader: `attribute float aAlpha; varying float vA; varying vec2 vUv;
        void main(){ vA = aAlpha; vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vA; varying vec2 vUv; uniform vec3 uColor;
        void main(){ if (vA <= 0.002) discard; vec2 d = vUv - 0.5;
        float m = smoothstep(0.5, 0.28, length(d)); gl_FragColor = vec4(uColor, m * vA * 0.62); }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, m);
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
    this._n = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._last = new THREE.Vector3(1e9, 0, 0);
  }

  stamp(x, z, headingYaw, side) {
    const y = terrainHeight(x, z) + 0.03;
    const n = terrainNormal(x, z, this._n);
    this._q.setFromUnitVectors(this._up, n);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(this._up, headingYaw + (Math.random() - 0.5) * 0.3);
    this._q.multiply(yawQ);
    // slight left/right offset for a two-track trail
    const ox = Math.cos(headingYaw) * 0.18 * side, oz = -Math.sin(headingYaw) * 0.18 * side;
    this._s.set(0.42, 1, 0.56);
    this._m.compose(new THREE.Vector3(x + ox, y, z + oz), this._q, this._s);
    const i = this.head; this.head = (this.head + 1) % this.max;
    this.mesh.setMatrixAt(i, this._m);
    this.alpha[i] = 1;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.aAlpha.needsUpdate = true;
  }

  // Call each frame; stamps when the player walks far enough on snow.
  update(dt, player, onSnow) {
    let changed = false;
    for (let i = 0; i < this.max; i++) {
      if (this.alpha[i] > 0) { this.alpha[i] = Math.max(0, this.alpha[i] - dt / this.life); changed = true; }
    }
    if (changed) this.mesh.geometry.attributes.aAlpha.needsUpdate = true;

    if (onSnow && player.state === 'ground') {
      const p = player.position;
      if (this._last.distanceToSquared(p) > 0.55 * 0.55) {
        this._side = -(this._side || 1);
        this.stamp(p.x, p.z, player.facing, this._side);
        this._last.copy(p);
      }
    }
  }
}
