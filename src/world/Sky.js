import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { COLORS } from '../config.js';

// Sky, sun and lighting as one unit — the sun direction drives both the
// visible glow and the direction of the shadow-casting light.
export class SkySystem {
  constructor(scene) {
    this.scene = scene;

    // Atmospheric scattering dome.
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4.0;
    u.rayleigh.value = 2.9;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.84;
    scene.add(this.sky);

    // Golden hour: sun low on the horizon for long, warm light.
    this.sunDir = new THREE.Vector3();
    const elevation = 16.0; // degrees above horizon
    const azimuth = 138.0;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);

    // Key light (the sun).
    this.sun = new THREE.DirectionalLight(COLORS.sun, 3.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 160;
    const s = 60;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.radius = 3.0;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // Warm sky / cool-green ground ambient.
    this.hemi = new THREE.HemisphereLight(COLORS.ambientSky, COLORS.ambientGround, 0.72);
    scene.add(this.hemi);

    // Faint cool fill from the opposite side to keep shadows readable.
    this.fill = new THREE.DirectionalLight(0xa9c4ff, 0.4);
    this.fill.position.copy(this.sunDir).multiplyScalar(-1).add(new THREE.Vector3(0, 0.5, 0));
    scene.add(this.fill);

    this._shadowDist = 70;
  }

  // Keep the sky centered on the camera and the shadow frustum on the player.
  update(playerPos, cameraPos) {
    this.sky.position.copy(cameraPos);
    this.sun.position.copy(playerPos).addScaledVector(this.sunDir, this._shadowDist);
    this.sun.target.position.copy(playerPos);
    this.sun.target.updateMatrixWorld();
  }
}
