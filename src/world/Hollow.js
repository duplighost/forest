import * as THREE from 'three';

// A cosy hollow at the base of the giant tree. As you approach, a dark nook
// with a soft mossy bed fades in; when you curl up to rest there, a warm hearth
// glow swells. It re-homes itself to whichever giant you're nearest, opening
// toward you, so there's effectively one at every elder tree.
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Hollow {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;

    this.nookMat = new THREE.MeshStandardMaterial({ color: 0x140d08, roughness: 1, transparent: true, opacity: 0 });
    const nook = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.nookMat);
    nook.scale.set(0.8, 1.0, 0.5);
    this.group.add(nook);

    this.bedMat = new THREE.MeshStandardMaterial({ color: 0x6f8f4c, roughness: 0.9, emissive: 0x2a3a1a, emissiveIntensity: 0.25, transparent: true, opacity: 0 });
    const bed = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), this.bedMat);
    bed.scale.set(0.6, 0.18, 0.4); bed.position.set(0, -0.5, 0.12);
    this.group.add(bed);

    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(), color: 0xffc879, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.glow.scale.setScalar(2.2); this.glow.position.set(0, 0.05, 0.25);
    this.glow.frustumCulled = false;
    this.group.add(this.glow);

    this.light = new THREE.PointLight(0xffb86a, 0, 9, 2);
    this.light.position.set(0, 0.4, 0.35);
    this.group.add(this.light);

    scene.add(this.group);
    this._struct = 0;   // nook/bed presence (follows proximity)
    this._glow = 0;      // hearth glow (follows max(faint proximity, rest))
  }

  // tree: nearest giant record or null; toward: player pos; prox 0..1; rest 0..1
  update(dt, tree, toward, prox, rest) {
    const structT = tree ? prox : 0;
    const glowT = tree ? Math.max(prox * 0.3, rest) : 0;
    this._struct += (structT - this._struct) * (1 - Math.exp(-4 * dt));
    this._glow += (glowT - this._glow) * (1 - Math.exp(-4 * dt));

    if (this._struct < 0.01 && this._glow < 0.01) { this.group.visible = false; return; }
    this.group.visible = true;

    if (tree) {
      const dx = toward.x - tree.x, dz = toward.z - tree.z;
      const yaw = Math.atan2(dx, dz);
      const r = tree.trunkRadius * 0.9;
      this.group.position.set(tree.x + Math.sin(yaw) * r, tree.baseY + 0.6, tree.z + Math.cos(yaw) * r);
      this.group.rotation.y = yaw;
    }
    const pulse = 0.85 + Math.sin(performance.now() * 0.003) * 0.15;
    this.nookMat.opacity = Math.min(1, this._struct * 1.4);
    this.bedMat.opacity = Math.min(1, this._struct * 1.4);
    this.glow.material.opacity = this._glow * 0.85 * pulse;
    this.glow.scale.setScalar(1.7 + this._glow * 0.9);
    this.light.intensity = this._glow * 2.4 * pulse;
  }
}
