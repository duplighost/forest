import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CAMERA, COLORS, WORLD } from '../config.js';

// Final cosmetic grade: gentle vignette + warm lift + a touch of saturation.
// Runs after tone-mapping/sRGB so it works in display space.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.42 },
    uWarm: { value: new THREE.Color(0xffd9a0) },
    uWarmAmt: { value: 0.05 },
    uSat: { value: 1.14 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uVignette, uWarmAmt, uSat;
    uniform vec3 uWarm;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126,0.7152,0.0722));
      // cinematic split-tone: cool shadows, warm highlights
      vec3 cool = vec3(0.74, 0.84, 1.0);
      vec3 warm = vec3(1.0, 0.88, 0.66);
      vec3 tone = mix(cool, warm, smoothstep(0.15, 0.85, l));
      c *= mix(vec3(1.0), tone, 0.10);
      // saturation
      l = dot(c, vec3(0.2126,0.7152,0.0722));
      c = mix(vec3(l), c, uSat);
      // gentle filmic contrast
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.12);
      // vignette
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.9, 0.22, dot(d,d) * 2.0);
      c *= mix(1.0, v, uVignette);
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export class Engine {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.skyHorizon);
    this.scene.fog = new THREE.Fog(COLORS.fog, WORLD.fogNear, WORLD.fogFar);

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      900
    );
    this.camera.position.set(0, 6, 12);

    this._buildComposer();

    this.clock = new THREE.Clock();
    window.addEventListener('resize', () => this.resize());
  }

  _buildComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new UnrealBloomPass(size, 0.42, 0.6, 0.86);
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  render() {
    this.composer.render();
  }
}
