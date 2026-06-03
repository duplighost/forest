import * as THREE from 'three';

// Gentle aurora curtains for the winter night sky. A couple of tall, open
// cylinders ring the player far out past the mountains; a shader paints soft
// drifting ribbons of green→violet light that wave and shimmer. The whole
// thing fades in only when it's night AND you're in a snowy (winter) region.
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime, uAmt, uBright, uSpeed, uSeed;
  uniform vec3 uLo, uHi;
  void main(){
    float x = vUv.x;
    float y = vUv.y;
    float t = uTime * uSpeed + uSeed;
    // wavy curtain: the glowing bottom edge undulates across the sky
    float edge = 0.10
      + 0.06 * sin(x * 6.2831 * 3.0 + t * 0.7)
      + 0.03 * sin(x * 6.2831 * 7.0 - t * 0.5);
    float vp = smoothstep(edge, edge + 0.10, y) * (1.0 - smoothstep(0.58, 1.0, y));
    // several broad ribbons drifting around the ring, so a couple are always in
    // view whichever way you look
    float rib =
        0.9 * smoothstep(0.105, 0.0, abs(fract(x       - t * 0.013 + 0.50) - 0.5)) +
        0.8 * smoothstep(0.085, 0.0, abs(fract(x       - t * 0.021 + 0.13) - 0.5)) +
        0.8 * smoothstep(0.075, 0.0, abs(fract(x       + t * 0.017 + 0.81) - 0.5)) +
        0.7 * smoothstep(0.070, 0.0, abs(fract(x * 2.0 - t * 0.011 + 0.30) - 0.5)) +
        0.6 * smoothstep(0.065, 0.0, abs(fract(x * 2.0 + t * 0.009 + 0.66) - 0.5));
    rib = clamp(rib, 0.0, 1.5);
    // fine vertical shimmer striations
    float shim = 0.78 + 0.22 * sin(x * 240.0 + sin(x * 30.0 - t * 0.6) * 3.0 + t);
    vec3 col = mix(uLo, uHi, clamp(y * 1.4, 0.0, 1.0));
    float a = vp * rib * shim * uAmt * uBright;
    if (a <= 0.002) discard;
    gl_FragColor = vec4(col * (0.7 + 0.5 * rib), a);
  }
`;

function curtain(radius, height, yc, lo, hi, speed, seed, bright) {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 128, 1, true);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, fog: false, side: THREE.BackSide,
    uniforms: {
      uTime: { value: 0 }, uAmt: { value: 0 }, uBright: { value: bright }, uSpeed: { value: speed },
      uSeed: { value: seed }, uLo: { value: new THREE.Color(lo) }, uHi: { value: new THREE.Color(hi) },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = yc;
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

export class Aurora {
  constructor(scene) {
    this.group = new THREE.Group();
    // two layers at different radii/colours/drift for depth
    this.layers = [
      curtain(600, 300, 220, 0x49f5a6, 0x8a5cff, 1.0, 0.0, 1.5),   // green → violet
      curtain(560, 320, 240, 0x40e0ff, 0xc060ff, -0.7, 13.0, 0.95), // cyan → magenta
    ];
    for (const l of this.layers) this.group.add(l);
    scene.add(this.group);
    this.amt = 0;
  }

  // amt: 0..1 target visibility (night × winter), set from main each frame.
  update(camPos, t, amt) {
    this.amt += (amt - this.amt) * 0.04;        // smooth fades in/out
    this.group.position.set(camPos.x, 0, camPos.z);
    const on = this.amt > 0.003;
    this.group.visible = on;
    if (!on) return;
    for (const l of this.layers) {
      l.material.uniforms.uTime.value = t;
      l.material.uniforms.uAmt.value = this.amt;
    }
  }
}
