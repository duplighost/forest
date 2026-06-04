import * as THREE from 'three';
import { WORLD } from '../config.js';

// Low-lying mist that pools in the valleys, strongest when the sun is low (dawn,
// dusk, night) and gone by midday. It's a big flat sheet at a fixed low height
// that follows the camera; because terrain occludes it (depth test, no depth
// write), it only shows where the ground dips below the sheet — i.e. in hollows
// and along the water — so it naturally gathers in low ground. World-space noise
// keeps the wisps put as you move.
const VERT = /* glsl */ `
  varying vec2 vUv; varying vec3 vW;
  void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */ `
  varying vec2 vUv; varying vec3 vW;
  uniform float uTime, uAmt; uniform vec3 uColor;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1,0)), c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
  void main(){
    if (uAmt <= 0.002) discard;
    vec2 p = vW.xz * 0.02;
    float n = vnoise(p + vec2(uTime * 0.010, uTime * 0.013)) * 0.6
            + vnoise(p * 2.3 - vec2(uTime * 0.019, 0.0)) * 0.4;
    float edge = smoothstep(1.0, 0.35, length(vUv - 0.5) * 2.0);  // hide the sheet's rim
    float a = smoothstep(0.30, 0.78, n) * edge * uAmt;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(uColor, a * 0.7);
  }
`;

export class GroundFog {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(620, 620, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uColor: { value: new THREE.Color(0xdfeaf2) } },
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.position.y = WORLD.waterLevel + 7;     // valleys below this fill with mist
    scene.add(this.mesh);
    this.amt = 0;
  }

  update(camPos, t, amt) {
    this.amt += (amt - this.amt) * 0.05;       // smooth fades
    this.mesh.position.x = camPos.x;
    this.mesh.position.z = camPos.z;
    this.mesh.visible = this.amt > 0.004;
    if (!this.mesh.visible) return;
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uAmt.value = this.amt;
  }
}
