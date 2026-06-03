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
        uniform float uTime, uFogNear, uFogFar;
        varying vec3 vWorld;
        varying vec3 vNormal;
        void main(){
          vec3 N = normalize(vNormal);
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
