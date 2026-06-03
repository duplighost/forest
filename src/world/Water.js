import * as THREE from 'three';
import { COLORS, WORLD } from '../config.js';

// An "infinite" stylized water surface that follows the camera and is only
// visible where the terrain dips below the water level (ponds, rivers).
export class Water {
  constructor(scene, sunDir) {
    const geo = new THREE.PlaneGeometry(WORLD.fogFar * 2.4, WORLD.fogFar * 2.4, 80, 80);
    geo.rotateX(-Math.PI / 2);

    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone() },
      uDeep: { value: new THREE.Color(COLORS.waterDeep) },
      uShallow: { value: new THREE.Color(COLORS.water) },
      uSkyHorizon: { value: new THREE.Color(COLORS.skyHorizon) },
      uSkyTop: { value: new THREE.Color(COLORS.skyTop) },
      uSun: { value: new THREE.Color(COLORS.sun) },
      uFogColor: { value: new THREE.Color(COLORS.fog) },
      uFogNear: { value: WORLD.fogNear },
      uFogFar: { value: WORLD.fogFar },
      uRain: { value: 0 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormal;
        // small gerstner-ish ripples from world position so waves don't swim
        float wave(vec2 p, vec2 dir, float freq, float speed, float t){
          return sin(dot(p, dir) * freq + t * speed);
        }
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec2 p = wp.xz;
          float t = uTime;
          float h = 0.0;
          h += wave(p, normalize(vec2(1.0,0.3)), 0.20, 1.1, t) * 0.18;
          h += wave(p, normalize(vec2(-0.4,1.0)), 0.33, 1.6, t) * 0.10;
          h += wave(p, normalize(vec2(0.7,-0.8)), 0.7, 2.2, t) * 0.04;
          wp.y += h;
          // approximate normal from wave gradient
          float e = 0.5;
          float hx = wave(p+vec2(e,0.0), normalize(vec2(1.0,0.3)),0.20,1.1,t)*0.18;
          float hz = wave(p+vec2(0.0,e), normalize(vec2(-0.4,1.0)),0.33,1.6,t)*0.10;
          vNormal = normalize(vec3(h-hx, e, h-hz));
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uSunDir, uDeep, uShallow, uSkyHorizon, uSkyTop, uSun, uFogColor;
        uniform float uTime, uFogNear, uFogFar, uRain;
        varying vec3 vWorld;
        varying vec3 vNormal;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        // expanding rain rings in each grid cell near the fragment
        float ripples(vec2 p, float t){
          float sum = 0.0;
          vec2 ip = floor(p);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 cell = ip + vec2(float(i), float(j));
            float s = hash(cell);
            vec2 c = cell + vec2(hash(cell+3.1), hash(cell+7.7));
            float ph = t * 1.6 + s * 12.0;
            float age = fract(ph);
            float rad = age * 0.55;
            float d = length(p - c);
            sum += smoothstep(0.05, 0.0, abs(d - rad)) * (1.0 - age) * step(0.5, hash(cell + floor(ph)));
          }
          return sum;
        }
        void main(){
          vec3 N = normalize(vNormal);
          if (uRain > 0.01) {
            float e = 0.12;
            float r0 = ripples(vWorld.xz * 1.3, uTime);
            float rx = ripples(vWorld.xz * 1.3 + vec2(e, 0.0), uTime);
            float rz = ripples(vWorld.xz * 1.3 + vec2(0.0, e), uTime);
            N = normalize(N + vec3(r0 - rx, 0.0, r0 - rz) * uRain * 2.2);
          }
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
          // sky reflection approximation
          vec3 R = reflect(-V, N);
          vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(R.y*1.2, 0.0, 1.0));
          // base water gradient by view angle
          vec3 base = mix(uDeep, uShallow, clamp(dot(N,V)*0.8+0.2,0.0,1.0));
          vec3 col = mix(base, sky, clamp(fres*1.3, 0.0, 0.9));
          // sun glitter
          float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 80.0);
          col += uSun * spec * 1.6;
          // sparkle ripples
          float spk = pow(max(0.0, sin(vWorld.x*3.0 + uTime*2.0)*sin(vWorld.z*3.0 - uTime*1.7)), 16.0);
          col += uSun * spk * 0.25 * fres;
          float alpha = mix(0.72, 0.97, fres);
          // distance fog to blend with the scene
          float d = length(cameraPosition - vWorld);
          float fog = smoothstep(uFogNear, uFogFar, d);
          col = mix(col, uFogColor, fog);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = WORLD.waterLevel;
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(t, camPos) {
    this.uniforms.uTime.value = t;
    // follow the camera, snapped to a grid to avoid wave shimmer
    this.mesh.position.x = Math.round(camPos.x);
    this.mesh.position.z = Math.round(camPos.z);
  }
}
