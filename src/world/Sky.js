import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// ---------------------------------------------------------------------------
// Time-of-day driven sky, sun/moon and lighting. time ∈ [0,1): 0 = midnight,
// 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. Everything (shadows, god-rays,
// water, foliage glow) follows `sunDir`, so they all change through the day.
// ---------------------------------------------------------------------------

// Palette keyframes by sun elevation (degrees). Interpolated each frame.
const STOPS = [
  { e: -16, sunI: 0.0,  sunC: 0x3a4a78, hemiI: 0.40, hSky: 0x44588c, hGnd: 0x222a3c, fog: 0x222e54, star: 1.0,  skyMul: 0.05 },
  { e: -5,  sunI: 0.4,  sunC: 0xff7a44, hemiI: 0.46, hSky: 0x5a6a94, hGnd: 0x2e2730, fog: 0x5a4258, star: 0.5,  skyMul: 0.30 },
  { e: 4,   sunI: 2.3,  sunC: 0xffac60, hemiI: 0.58, hSky: 0x9ab2d6, hGnd: 0x4a4630, fog: 0xe6c4a2, star: 0.0,  skyMul: 0.82 },
  { e: 18,  sunI: 3.0,  sunC: 0xffe2ac, hemiI: 0.70, hSky: 0xbcd8ec, hGnd: 0x4a5a33, fog: 0xb9c8a6, star: 0.0,  skyMul: 0.92 },
  { e: 40,  sunI: 3.1,  sunC: 0xffeece, hemiI: 0.78, hSky: 0xb4d2ee, hGnd: 0x55603a, fog: 0xb0c2a4, star: 0.0,  skyMul: 1.0 },
];

const _cA = new THREE.Color(), _cB = new THREE.Color();
function lerpStops(elev) {
  let a = STOPS[0], b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (elev >= STOPS[i].e && elev <= STOPS[i + 1].e) { a = STOPS[i]; b = STOPS[i + 1]; break; }
  }
  if (elev < STOPS[0].e) { a = b = STOPS[0]; }
  if (elev > STOPS[STOPS.length - 1].e) { a = b = STOPS[STOPS.length - 1]; }
  const t = a === b ? 0 : (elev - a.e) / (b.e - a.e);
  const num = (k) => a[k] + (b[k] - a[k]) * t;
  return {
    sunI: num('sunI'), hemiI: num('hemiI'), star: num('star'), skyMul: num('skyMul'),
    sunC: _cA.set(a.sunC).lerp(_cB.set(b.sunC), t).clone(),
    hSky: new THREE.Color(a.hSky).lerp(new THREE.Color(b.hSky), t),
    hGnd: new THREE.Color(a.hGnd).lerp(new THREE.Color(b.hGnd), t),
    fog: new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), t),
  };
}

export class SkySystem {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.time = opts.startTime ?? 0.32;     // start mid-morning
    this.dayLength = opts.dayLength ?? 210;  // seconds for a full cycle
    this.peakElevation = 34;                 // keep the sun warm & low-ish

    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4.0;
    u.rayleigh.value = 2.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.84;
    // Patch the shader with a brightness multiplier so we can dim it to night
    // (the atmospheric model misbehaves with the sun far below the horizon).
    const m = this.sky.material;
    m.fragmentShader = 'uniform float uNightDim;\n' + m.fragmentShader.replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      'gl_FragColor = vec4( retColor * uNightDim, 1.0 );'
    );
    m.uniforms.uNightDim = { value: 1.0 };
    m.needsUpdate = true;
    scene.add(this.sky);

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, 1, 0);

    this.sun = new THREE.DirectionalLight(0xfff1cf, 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    const s = 60;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.radius = 3.0;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbcd8ec, 0x4a5a33, 0.7);
    scene.add(this.hemi);
    this.fill = new THREE.DirectionalLight(0xa9c4ff, 0.25);
    scene.add(this.fill);

    this._buildStars();
    this._buildMoon();

    this._shadowDist = 70;
  }

  setTime(t) { this.time = ((t % 1) + 1) % 1; }

  _buildStars() {
    const N = 1500, R = 820;
    const pos = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = Math.random(), v = Math.random() * 0.86; // cover most of the dome
      const theta = u * Math.PI * 2;
      const phi = Math.acos(1 - v);   // 0..~80° from zenith downward
      pos[i * 3] = R * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = R * Math.cos(phi);
      pos[i * 3 + 2] = R * Math.sin(phi) * Math.sin(theta);
      siz[i] = 2 + Math.random() * 3.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute float aSize; uniform float uOpacity; varying float vO;
        void main(){ vO=uOpacity; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=aSize*(1.0+0.4*sin(position.x*12.3+position.z));
        gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vO; void main(){ vec2 d=gl_PointCoord-0.5;
        float a=smoothstep(0.5,0.0,length(d)); gl_FragColor=vec4(vec3(1.0,0.98,0.9), a*vO); }`,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1;
    this.scene.add(this.stars);
  }

  _buildMoon() {
    this.moon = new THREE.Group();
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(18, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xf2f0e0, fog: false })
    );
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(30, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xbcd0ff, transparent: true, opacity: 0.25, fog: false, blending: THREE.AdditiveBlending, side: THREE.BackSide })
    );
    this.moon.add(moon, glow);
    this.moonMat = moon.material;
    this.moonGlow = glow.material;
    this.moon.renderOrder = -1;
    this.scene.add(this.moon);
  }

  update(dt, playerPos, cameraPos) {
    this.time = (this.time + dt / this.dayLength) % 1;
    const TAU = Math.PI * 2;

    // Sun + moon elevation/azimuth.
    const sunElev = this.peakElevation * Math.sin((this.time - 0.25) * TAU);
    this.sunElev = sunElev;
    const sunAzi = 90 + this.time * 300;
    this._dir(sunElev, sunAzi, this.sunDir);
    const moonElev = this.peakElevation * 0.8 * Math.sin((this.time + 0.25) * TAU);
    this._dir(moonElev, sunAzi + 180, this.moonDir);

    // How "daytime" it is (0 at night → 1 in full day); used to fade the
    // foliage back-light glow so leaves don't glow in the dark.
    this.dayAmount = THREE.MathUtils.clamp((sunElev + 2) / 14, 0, 1);

    const p = lerpStops(sunElev);

    // Sky shader: follow camera, point the sun, dim at night.
    this.sky.position.copy(cameraPos);
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    this.sky.material.uniforms.rayleigh.value = 1.6 + p.skyMul * 1.4;
    this.sky.material.uniforms.mieCoefficient.value = 0.003 + (1 - p.skyMul) * 0.004;
    this.sky.material.uniforms.uNightDim.value = Math.max(0.04, p.skyMul);

    // Sun (key) light.
    this.sun.color.copy(p.sunC);
    this.sun.intensity = p.sunI;
    this.sun.position.copy(playerPos).addScaledVector(this.sunDir, this._shadowDist);
    this.sun.target.position.copy(playerPos);
    this.sun.target.updateMatrixWorld();
    this.sun.castShadow = p.sunI > 0.4;

    // Ambient + fill.
    this.hemi.color.copy(p.hSky);
    this.hemi.groundColor.copy(p.hGnd);
    this.hemi.intensity = p.hemiI;
    this.fill.color.copy(p.hSky);
    this.fill.intensity = 0.12 + p.skyMul * 0.18;
    this.fill.position.copy(playerPos).addScaledVector(this.moonDir, 40);

    // Fog + background follow the sky.
    if (this.scene.fog) this.scene.fog.color.copy(p.fog);
    if (this.scene.background) this.scene.background.copy(p.fog);

    // Stars fade in; moon rises.
    this.starMat.uniforms.uOpacity.value = p.star;
    this.stars.position.copy(cameraPos);
    this.stars.rotation.y += dt * 0.006;
    this.moon.position.copy(cameraPos).addScaledVector(this.moonDir, 700);
    const moonVis = THREE.MathUtils.clamp((moonElev + 4) / 12, 0, 1);
    this.moonMat.opacity = moonVis; this.moonMat.transparent = true;
    this.moonGlow.opacity = moonVis * 0.25;
    this.moon.visible = moonVis > 0.01;
  }

  _dir(elevDeg, aziDeg, target) {
    const phi = THREE.MathUtils.degToRad(90 - elevDeg);
    const theta = THREE.MathUtils.degToRad(aziDeg);
    target.setFromSphericalCoords(1, phi, theta);
    return target;
  }
}
