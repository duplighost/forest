import * as THREE from 'three';
import { CAMERA } from '../config.js';
import { terrainHeight } from '../world/Terrain.js';

export class FollowCamera {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.yaw = 0;
    this.pitch = 0.32;
    this.distance = CAMERA.distance;

    this.target = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._curLook = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(1, 0, 0);
    this._idleLook = 0;
    this._initialized = false;
    this.trauma = 0;           // camera shake (0..1), decays each frame
    this.fov = CAMERA.fov;
  }

  // Add a shake kick (e.g. on landing); trauma is squared for a punchy falloff.
  addShake(t) { this.trauma = Math.min(1, this.trauma + t); }

  // Basis for camera-relative movement (flat XZ). The camera sits behind the
  // player looking along +forward, so screen-right is -(up × forward).
  updateBasis() {
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  // Phase 1: consume look input → yaw/pitch/zoom + movement basis.
  updateLook(dt) {
    const inp = this.input;
    const look = inp.consumeLook(new THREE.Vector2());
    const sens = inp.isTouch ? CAMERA.touchSensitivity : CAMERA.mouseSensitivity;
    if (look.lengthSq() > 0) {
      this.yaw -= look.x * sens;
      this.pitch += look.y * sens;
      this._idleLook = 0;
    } else {
      this._idleLook += dt;
    }
    this.pitch = THREE.MathUtils.clamp(this.pitch, CAMERA.pitchMin, CAMERA.pitchMax);

    const z = inp.consumeZoom();
    if (z) this.distance = THREE.MathUtils.clamp(this.distance + z * 0.8, CAMERA.minDistance, CAMERA.maxDistance);

    this.updateBasis();
  }

  // Phase 2: drift behind motion, then place & aim the camera.
  follow(dt, player) {
    // Gentle auto-align: when not actively looking and moving quickly, drift the
    // camera behind the direction of travel so "just run forward" feels right.
    const vel = player.velocity;
    const planarSpeed = Math.hypot(vel.x, vel.z);
    if (this._idleLook > 0.5 && planarSpeed > 4 && player.state !== 'climb') {
      const desiredYaw = Math.atan2(vel.x, vel.z);
      let d = desiredYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d)); // wrap to [-pi,pi]
      const rate = CAMERA.autoAlignRate * Math.min(1, planarSpeed / 14);
      this.yaw += d * (1 - Math.exp(-rate * dt));
      this.updateBasis();
    }

    // Target sits a little above the squirrel's root.
    this.target.copy(player.position).y += 1.0;

    // Desired camera position: behind + raised by pitch.
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._desired.set(
      this.target.x - this.forward.x * cp * this.distance,
      this.target.y + sp * this.distance + CAMERA.height * 0.25,
      this.target.z - this.forward.z * cp * this.distance
    );

    if (!this._initialized) {
      this.camera.position.copy(this._desired);
      this._curLook.copy(this.target);
      this._initialized = true;
    }

    // Smooth follow (frame-rate independent).
    const fa = 1 - Math.exp(-CAMERA.followLerp * dt);
    this.camera.position.lerp(this._desired, fa);

    // Pull in if a tree trunk sits between the squirrel and the camera.
    this._avoidTrunks(player);

    // Keep the camera above the ground (and a touch above water).
    const groundY = terrainHeight(this.camera.position.x, this.camera.position.z) + CAMERA.collisionPad;
    if (this.camera.position.y < groundY) this.camera.position.y = groundY;

    // Camera shake — punchy squared falloff, applied as a positional jitter.
    if (this.trauma > 0.001) {
      const s = this.trauma * this.trauma;
      const t = performance.now() * 0.05;
      this.camera.position.x += Math.sin(t * 1.7) * s * 0.5;
      this.camera.position.y += Math.sin(t * 2.3 + 1.7) * s * 0.5;
      this.camera.position.z += Math.sin(t * 1.9 + 3.1) * s * 0.4;
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    }

    const la = 1 - Math.exp(-CAMERA.lookLerp * dt);
    this._curLook.lerp(this.target, la);
    this.camera.lookAt(this._curLook);
  }

  // 2D (XZ) ray from the player toward the camera; if a trunk blocks it, pull
  // the camera in to just before the trunk so we never see through bark.
  _avoidTrunks(player) {
    const trees = player.world?.activeTrees;
    if (!trees || !trees.length) return;
    const ox = this.target.x, oz = this.target.z;
    let dx = this.camera.position.x - ox, dz = this.camera.position.z - oz;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) return;
    dx /= dist; dz /= dist;
    let minT = dist;
    for (const tr of trees) {
      if (tr.topY < this.target.y - 1.5) continue; // too short to block the view
      const cx = tr.x - ox, cz = tr.z - oz;
      const proj = cx * dx + cz * dz;
      if (proj <= 0.4 || proj >= dist) continue;     // trunk not between us
      const perp2 = cx * cx + cz * cz - proj * proj;
      const r = tr.trunkRadius + CAMERA.collisionPad + 0.3;
      if (perp2 < r * r) {
        const enter = proj - Math.sqrt(r * r - perp2);
        if (enter < minT) minT = enter;
      }
    }
    if (minT < dist) {
      const t = Math.max(1.4, minT);
      this.camera.position.x = ox + dx * t;
      this.camera.position.z = oz + dz * t;
      // ease the height toward the target's so we don't dip into the ground
      this.camera.position.y = THREE.MathUtils.lerp(this.target.y + 0.6, this.camera.position.y, t / dist);
    }
  }
}
