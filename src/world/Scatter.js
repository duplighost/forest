import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2, fbm2, noise2D } from './Noise.js';
import { terrainHeight, terrainSlope } from './Terrain.js';
import { WORLD, COLORS } from './../config.js';
import { windUniforms, makeFoliageMaterial } from './TreeFactory.js';
import { grassSeason, snowAt, flowerAt, leafSeason } from './Biome.js';

// ---- shared materials ----------------------------------------------------
const grassWind = { uTime: windUniforms.uTime, uWind: { value: 0.10 } };

function makeGrassMaterial() {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0,
    side: THREE.DoubleSide, alphaTest: 0.0,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = grassWind.uTime;
    sh.uniforms.uWind = grassWind.uWind;
    sh.uniforms.uGust = windUniforms.uGust;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\nuniform float uGust;\nattribute float aTip;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        float gw = uWind * (1.0 + uGust * 3.0);
        vec3 ipos = instanceMatrix[3].xyz;
        float ph = ipos.x * 0.2 + ipos.z * 0.22 + uTime * (1.9 + uGust * 2.5);
        float s = (sin(ph) + 0.4 * sin(ph * 2.3 + 1.0)) * gw;
        transformed.x += s * aTip;
        transformed.z += cos(ph * 0.9 + 0.5) * gw * aTip * 0.6;
      `);
  };
  return m;
}

// ---- geometry builders ---------------------------------------------------
function addAttrs(geo, color, tip) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const aTip = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    c.copy(color);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    aTip[i] = typeof tip === 'function' ? tip(geo.attributes.position.getY(i)) : tip;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aWind', new THREE.BufferAttribute(aTip.slice(), 1));
  geo.setAttribute('aTip', new THREE.BufferAttribute(aTip, 1));
  return geo;
}

function bladeTuft() {
  const blades = [];
  // Greyscale gradient (dark root → bright tip); the actual hue comes from the
  // per-instance season colour, so grass matches its biome.
  for (let i = 0; i < 5; i++) {
    const h = 0.42 + Math.random() * 0.26;
    const w = 0.06;
    const g = new THREE.PlaneGeometry(w, h, 1, 2);
    g.translate(0, h / 2, 0);
    g.rotateY((i / 4) * Math.PI + Math.random() * 0.5);
    g.rotateX((Math.random() - 0.5) * 0.3);
    g.translate((Math.random() - 0.5) * 0.08, 0, (Math.random() - 0.5) * 0.08);
    const ng = g.toNonIndexed();
    g.dispose();
    const n = ng.attributes.position.count;
    const col = new Float32Array(n * 3);
    const aTip = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      const y = ng.attributes.position.getY(j);
      const f = THREE.MathUtils.clamp(y / h, 0, 1);
      const v = 0.55 + f * 0.5;
      col[j * 3] = v; col[j * 3 + 1] = v; col[j * 3 + 2] = v;
      aTip[j] = f * f;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ng.setAttribute('aTip', new THREE.BufferAttribute(aTip, 1));
    blades.push(ng);
  }
  const merged = BufferGeometryUtils.mergeGeometries(blades, false);
  blades.forEach((b) => b.dispose());
  merged.computeVertexNormals();
  return merged;
}

function mushroom(rng) {
  const parts = [];
  const capColor = rng() < 0.5 ? new THREE.Color(0xd2553f) : new THREE.Color(0xe0a23c);
  const stem = new THREE.CylinderGeometry(0.05, 0.07, 0.28, 6);
  stem.translate(0, 0.14, 0);
  parts.push(addAttrs(stem, new THREE.Color(0xf0e6d0), 0));
  const cap = new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  cap.scale(1, 0.7, 1); cap.translate(0, 0.28, 0);
  parts.push(addAttrs(cap, capColor, 0));
  const g = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
}

function flower(rng) {
  const parts = [];
  const cols = [0xf2f2f2, 0xffd95e, 0xe98fb8, 0x8fa9e9];
  const petal = new THREE.Color(cols[(rng() * cols.length) | 0]);
  const stem = new THREE.CylinderGeometry(0.012, 0.018, 0.34, 4);
  stem.translate(0, 0.17, 0);
  parts.push(addAttrs(stem, new THREE.Color(0x5d8a3a), (y) => THREE.MathUtils.clamp(y / 0.34, 0, 1)));
  for (let i = 0; i < 5; i++) {
    const p = new THREE.SphereGeometry(0.06, 6, 5);
    p.scale(1, 0.4, 1.5);
    const a = (i / 5) * Math.PI * 2;
    p.translate(Math.cos(a) * 0.08, 0.36, Math.sin(a) * 0.08);
    parts.push(addAttrs(p, petal, 0.8));
  }
  const center = new THREE.SphereGeometry(0.045, 6, 5);
  center.translate(0, 0.37, 0);
  parts.push(addAttrs(center, new THREE.Color(0xf4c542), 0.8));
  const g = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
}

function rock(rng) {
  const g = new THREE.IcosahedronGeometry(0.3 + rng() * 0.4, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) * (0.7 + rng() * 0.5), p.getY(i) * (0.5 + rng() * 0.3), p.getZ(i) * (0.7 + rng() * 0.5));
  }
  g.computeVertexNormals();
  g.translate(0, 0.1, 0);
  const c = new THREE.Color(COLORS.rock).multiplyScalar(0.8 + rng() * 0.3);
  return addAttrs(g, c, 0);
}

function shrub(rng, x = 0, z = 0) {
  const parts = [];
  const c = new THREE.Color(leafSeason(x, z, rng));
  for (let i = 0; i < 3; i++) {
    const b = new THREE.IcosahedronGeometry(0.3 + rng() * 0.25, 1);
    b.translate((rng() - 0.5) * 0.4, 0.25 + rng() * 0.2, (rng() - 0.5) * 0.4);
    parts.push(addAttrs(b, c.clone().multiplyScalar(0.85 + rng() * 0.3), 0.5));
  }
  const g = BufferGeometryUtils.mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
}

export class Scatter {
  constructor() {
    this.grassGeo = bladeTuft();
    this.grassMat = makeGrassMaterial();
    this.detailMat = makeFoliageMaterial();
  }

  populate(cx, cz, group) {
    const size = WORLD.chunkSize;
    const ox = cx * size, oz = cz * size;

    // ---- grass (instanced, tinted to the local season) ----
    const cell = 2.6;
    const n = Math.floor(size / cell);
    const mats = [];
    const gcolors = [];
    const dummy = new THREE.Object3D();
    const gc = new THREE.Color();
    for (let gz = 0; gz < n; gz++) {
      for (let gx = 0; gx < n; gx++) {
        const hx = cx * n + gx, hz = cz * n + gz;
        const r = hash2(hx, hz, 11);
        const lush = fbm2((ox + gx * cell) * 0.02, (oz + gz * cell) * 0.02, 2) * 0.5 + 0.5;
        const wx = ox + gx * cell + (hash2(hx, hz, 12) - 0.5) * cell;
        const wz = oz + gz * cell + (hash2(hx, hz, 13) - 0.5) * cell;
        const snow = snowAt(wx, wz);
        if (r > (0.45 + lush * 0.5) * (1 - snow * 0.6)) continue; // sparser under snow
        const h = terrainHeight(wx, wz);
        if (h < WORLD.waterLevel + 0.3) continue;
        if (terrainSlope(wx, wz) > 0.7) continue;
        dummy.position.set(wx, h, wz);
        dummy.rotation.y = hash2(hx, hz, 14) * Math.PI * 2;
        const s = 0.7 + hash2(hx, hz, 15) * 0.9;
        dummy.scale.set(s, s * (0.8 + lush * 0.5), s);
        dummy.updateMatrix();
        mats.push(dummy.matrix.clone());
        grassSeason(wx, wz, gc).multiplyScalar(0.82 + noise2D(wx * 0.05, wz * 0.05) * 0.3);
        gcolors.push(gc.clone());
      }
    }
    if (mats.length) {
      const inst = new THREE.InstancedMesh(this.grassGeo, this.grassMat, mats.length);
      inst.castShadow = false;
      inst.receiveShadow = true;
      for (let i = 0; i < mats.length; i++) { inst.setMatrixAt(i, mats[i]); inst.setColorAt(i, gcolors[i]); }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.frustumCulled = true;
      inst.boundingSphere = new THREE.Sphere(new THREE.Vector3(ox + size / 2, 0, oz + size / 2), size);
      group.add(inst);
    }

    // ---- details (merged) ----
    const det = [];
    const dcell = 11;
    const dn = Math.floor(size / dcell);
    for (let gz = 0; gz < dn; gz++) {
      for (let gx = 0; gx < dn; gx++) {
        const hx = cx * dn + gx, hz = cz * dn + gz;
        const r = hash2(hx, hz, 21);
        if (r > 0.7) continue;
        const wx = ox + gx * dcell + (hash2(hx, hz, 22) - 0.5) * dcell;
        const wz = oz + gz * dcell + (hash2(hx, hz, 23) - 0.5) * dcell;
        const h = terrainHeight(wx, wz);
        if (h < WORLD.waterLevel + 0.2) continue;
        const slope = terrainSlope(wx, wz);
        const pick = hash2(hx, hz, 24);
        const snow = snowAt(wx, wz);
        const flowers = flowerAt(wx, wz);
        let g;
        if (slope > 0.5) g = rock(mulberryFrom(hx, hz, 1));
        else if (snow > 0.5) {                                  // winter: rocks & frosted shrubs
          g = pick < 0.55 ? rock(mulberryFrom(hx, hz, 1)) : shrub(mulberryFrom(hx, hz, 4), wx, wz);
        } else if (pick < 0.32 * flowers) g = flower(mulberryFrom(hx, hz, 3));
        else if (pick < 0.5) g = mushroom(mulberryFrom(hx, hz, 2));
        else if (pick < 0.78) g = shrub(mulberryFrom(hx, hz, 4), wx, wz);
        else g = rock(mulberryFrom(hx, hz, 5));
        const s = 0.7 + hash2(hx, hz, 25) * 0.8;
        const m = new THREE.Matrix4();
        m.makeRotationY(hash2(hx, hz, 26) * Math.PI * 2);
        m.scale(new THREE.Vector3(s, s, s));
        m.setPosition(wx, h, wz);
        g.applyMatrix4(m);
        det.push(g);
      }
    }
    if (det.length) {
      const merged = BufferGeometryUtils.mergeGeometries(det, false);
      det.forEach((d) => d.dispose());
      const mesh = new THREE.Mesh(merged, this.detailMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}

// A tiny seeded rng from cell coords so each detail's noise is stable.
function mulberryFrom(ix, iy, salt) {
  let a = (ix * 73856093 ^ iy * 19349663 ^ salt * 83492791) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
