import * as THREE from 'three';
import { snowAt } from './Biome.js';

// Weather: a drifting procedural cloud layer plus precipitation (rain, or snow
// over winter biomes), cycling through clear → cloudy → rain over time. Exposes
// `cloudiness` so the sky can dim/grey for overcast, and `wetness` for audio.
export class Weather {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.cloudiness = 0.2;
    this.wetness = 0;
    this._cloudTarget = 0.2;
    this._wetTarget = 0;
    this._timer = 6;
    this.snowing = 0;            // 0 rain … 1 snow
    this.changeEvery = opts.changeEvery ?? [22, 48];

    this._buildClouds();
    this._buildPrecip(opts.drops ?? 2400);
  }

  _buildClouds() {
    const geo = new THREE.PlaneGeometry(1400, 1400, 1, 1);
    geo.rotateX(Math.PI / 2); // horizontal, facing down
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms: {
        uTime: { value: 0 }, uCover: { value: 0.2 }, uOpacity: { value: 0.0 },
        uTint: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float uTime, uCover, uOpacity; uniform vec3 uTint;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.04; a*=0.5; } return v; }
        void main(){
          vec2 uv = vUv*7.0 + vec2(uTime*0.012, uTime*0.007);
          float n = fbm(uv);
          float c = smoothstep(0.62 - uCover*0.42, 0.86 - uCover*0.22, n);
          vec2 d = abs(vUv-0.5)*2.0;
          float edge = 1.0 - smoothstep(0.55, 0.98, max(d.x,d.y)); // hide the plane border
          gl_FragColor = vec4(uTint, c * uOpacity * edge);
        }`,
    });
    this.clouds = new THREE.Mesh(geo, this.cloudMat);
    this.clouds.position.y = 165;
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -1;
    this.scene.add(this.clouds);
  }

  _buildPrecip(n) {
    this.box = new THREE.Vector3(64, 42, 64);
    this.n = n;
    const pos = new Float32Array(n * 3);
    this.vy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.box.x;
      pos[i * 3 + 1] = (Math.random() - 0.5) * this.box.y; // centred on the camera
      pos[i * 3 + 2] = (Math.random() - 0.5) * this.box.z;
      this.vy[i] = 0.8 + Math.random() * 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.precipGeo = geo;
    this.precipMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.NormalBlending,
      uniforms: {
        uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xafc6e0) },
        uSnow: { value: 0 }, uSize: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform float uSnow, uSize; varying float vS;
        void main(){ vS = uSnow; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = uSize * (mix(7.0, 5.0, uSnow)) * (40.0 / max(1.0,-mv.z));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform vec3 uColor; varying float vS;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          // rain = vertical streak, snow = soft round flake
          float rain = smoothstep(0.5, 0.0, abs(p.x)*6.0) * smoothstep(0.5, 0.1, abs(p.y));
          float snow = smoothstep(0.5, 0.0, length(p));
          float a = mix(rain, snow, vS) * uOpacity;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this.precip = new THREE.Points(geo, this.precipMat);
    this.precip.frustumCulled = false;
    this.precip.renderOrder = 4;
    this.scene.add(this.precip);
  }

  // Pick a new weather state occasionally.
  _retarget() {
    const r = Math.random();
    if (r < 0.4) { this._cloudTarget = 0.1 + Math.random() * 0.2; this._wetTarget = 0; }     // clear-ish
    else if (r < 0.72) { this._cloudTarget = 0.45 + Math.random() * 0.3; this._wetTarget = 0; } // cloudy
    else { this._cloudTarget = 0.7 + Math.random() * 0.3; this._wetTarget = 0.6 + Math.random() * 0.4; } // rain
    this._timer = this.changeEvery[0] + Math.random() * (this.changeEvery[1] - this.changeEvery[0]);
  }

  update(dt, camPos, skyTint) {
    this._timer -= dt;
    if (this._timer <= 0) this._retarget();

    const k = 1 - Math.exp(-0.3 * dt);
    this.cloudiness += (this._cloudTarget - this.cloudiness) * k;
    this.wetness += (this._wetTarget - this.wetness) * k;

    // snow vs rain depends on the biome under the player
    const wantSnow = snowAt(camPos.x, camPos.z) > 0.5 ? 1 : 0;
    this.snowing += (wantSnow - this.snowing) * (1 - Math.exp(-1.5 * dt));

    // clouds
    this.cloudMat.uniforms.uTime.value += dt;
    this.cloudMat.uniforms.uCover.value = this.cloudiness;
    this.cloudMat.uniforms.uOpacity.value = THREE.MathUtils.clamp(this.cloudiness * 0.95, 0, 0.9);
    if (skyTint) this.cloudMat.uniforms.uTint.value.copy(skyTint);
    this.clouds.position.set(camPos.x, 165, camPos.z);

    // precipitation — particles live in the object's local box, which follows
    // the camera, so they fall and wrap locally.
    const arr = this.precipGeo.attributes.position.array;
    const bx = this.box.x, by = this.box.y, bz = this.box.z;
    const fall = THREE.MathUtils.lerp(34, 5, this.snowing) * dt;
    const drift = THREE.MathUtils.lerp(1.5, 5, this.snowing) * dt;
    const t = this.cloudMat.uniforms.uTime.value;
    if (this.wetness > 0.02) {
      for (let i = 0; i < this.n; i++) {
        let x = arr[i * 3], y = arr[i * 3 + 1] - fall * this.vy[i], z = arr[i * 3 + 2];
        if (this.snowing > 0.02) { x += Math.sin(t * 1.5 + i) * drift; z += Math.cos(t * 1.2 + i * 1.3) * drift; }
        else x += drift * 0.4;
        if (y < -by / 2) { y += by; x = (Math.random() - 0.5) * bx; z = (Math.random() - 0.5) * bz; }
        if (x > bx / 2) x -= bx; else if (x < -bx / 2) x += bx;
        if (z > bz / 2) z -= bz; else if (z < -bz / 2) z += bz;
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      this.precipGeo.attributes.position.needsUpdate = true;
    }
    this.precip.position.copy(camPos);
    this.precipMat.uniforms.uOpacity.value = this.wetness;
    this.precipMat.uniforms.uSnow.value = this.snowing;
    this.precipMat.uniforms.uColor.value.set(this.snowing > 0.5 ? 0xffffff : 0xb6cae0);
  }
}
