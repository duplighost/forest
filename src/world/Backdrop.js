import * as THREE from 'three';
import { noise2D } from './Noise.js';

// Layered distant mountain silhouettes ringing the world for scale and depth.
// They ignore fog (so they read as atmospheric perspective) and are occluded by
// the near forest, so they only peek above the horizon. They follow the camera.
function makeRidge(radius, base, amp, seed, topCol, botCol, jag) {
  const segs = 200;
  const pos = [];
  const col = [];
  const t = new THREE.Color(topCol), b = new THREE.Color(botCol);
  const heights = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    let h = 0, f = 1, w = 0.6;
    for (let o = 0; o < 4; o++) {
      h += w * Math.abs(noise2D(nx * jag * f + seed, nz * jag * f - seed));
      w *= 0.5; f *= 2.1;
    }
    heights.push(base + amp * (0.25 + h));
  }
  const bottom = base - 120;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
    const h0 = heights[i], h1 = heights[i + 1];
    // two triangles forming the skirt quad
    pos.push(x0, bottom, z0, x1, bottom, z1, x1, h1, z1);
    pos.push(x0, bottom, z0, x1, h1, z1, x0, h0, z0);
    col.push(b.r, b.g, b.b, b.r, b.g, b.b, t.r, t.g, t.b);
    col.push(b.r, b.g, b.b, t.r, t.g, t.b, t.r, t.g, t.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

export class Backdrop {
  constructor(scene) {
    this.group = new THREE.Group();
    // far, light, hazy range
    this.group.add(makeRidge(560, 26, 200, 11.3, 0xaab6d2, 0xccd4e6, 2.2));
    // nearer, slightly darker/bluer range — rises just past the terrain edge so
    // it hides where the streamed chunks end.
    this.group.add(makeRidge(385, 16, 150, 47.9, 0x8496bc, 0xaeb9d4, 3.1));
    scene.add(this.group);
  }
  update(camPos) {
    this.group.position.set(camPos.x, 0, camPos.z);
  }
}
