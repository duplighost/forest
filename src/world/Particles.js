import * as THREE from 'three';

// Soft drifting motes that catch the golden light — pure atmosphere.
function softSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,230,1)');
  g.addColorStop(0.3, 'rgba(255,244,210,0.7)');
  g.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Particles {
  constructor(scene, count = 320) {
    this.count = count;
    this.range = new THREE.Vector3(70, 34, 70);
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    this.seed = new Float32Array(count);
    // A magical palette: mostly warm gold motes, with soft pink petals and a
    // few pale-green spores drifting through the light.
    const palette = [0xfff0c8, 0xffe6a8, 0xfff0c8, 0xf6c9d8, 0xf6c9d8, 0xd6ecb8];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.range.x;
      pos[i * 3 + 1] = Math.random() * this.range.y;
      pos[i * 3 + 2] = (Math.random() - 0.5) * this.range.z;
      this.seed[i] = Math.random() * 1000;
      c.set(palette[(Math.random() * palette.length) | 0]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo = geo;

    // Custom material: size is CAPPED and motes fade when very close to the
    // camera, so a mote drifting past the lens can never blow out the frame.
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTex: { value: softSprite() } },
      vertexShader: /* glsl */ `
        varying vec3 vCol; varying float vA;
        void main(){
          vCol = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = -mv.z;
          gl_PointSize = clamp(46.0 / max(1.0, dist), 1.0, 6.0);
          // only motes in a near band are visible, so they never accumulate into haze
          vA = smoothstep(3.0, 9.0, dist) * smoothstep(46.0, 24.0, dist);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; varying vec3 vCol; varying float vA;
        void main(){
          if (vA <= 0.001) discard;
          float a = texture2D(uTex, gl_PointCoord).a;
          gl_FragColor = vec4(vCol, a * vA * 0.26);
        }`,
    });
    mat.vertexColors = true;
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
    this._base = new THREE.Vector3();
  }

  update(t, camPos) {
    // Keep the field centered on the camera; drift motes and wrap within the box.
    const arr = this.geo.attributes.position.array;
    const r = this.range;
    const ox = camPos.x - r.x / 2, oz = camPos.z - r.z / 2;
    for (let i = 0; i < this.count; i++) {
      const s = this.seed[i];
      let x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
      y += (0.18 + (s % 1) * 0.12) * 0.016 * 16; // slow rise (frame-ish)
      x += Math.sin(t * 0.4 + s) * 0.01;
      z += Math.cos(t * 0.33 + s * 1.3) * 0.01;
      // wrap relative to camera
      if (y > camPos.y + r.y * 0.6) y = camPos.y - r.y * 0.2;
      const lx = x - ox, lz = z - oz;
      if (lx < 0) x += r.x; else if (lx > r.x) x -= r.x;
      if (lz < 0) z += r.z; else if (lz > r.z) z -= r.z;
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
