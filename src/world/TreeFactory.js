import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, noise3D } from './Noise.js';
import { COLORS } from '../config.js';

// Shared uniforms — every tree sways from the same global clock and glows with
// the same sun (uSunView is the sun direction in view space, set each frame).
export const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0.22 },
  uGust: { value: 0 },          // global gust swell (0 = calm)
  uSunView: { value: new THREE.Vector3(0, 0, 1) },
  uGlowColor: { value: new THREE.Color(0xffe1a0) },
  uGlowAmt: { value: 1.35 },
};

// One material for all bark+foliage. Vertex colors carry bark/leaf variation,
// the `aWind` attribute (0 at the trunk base → 1 at leaf tips) drives sway.
export function makeFoliageMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.uniforms.uGust = windUniforms.uGust;
    shader.uniforms.uSunView = windUniforms.uSunView;
    shader.uniforms.uGlowColor = windUniforms.uGlowColor;
    shader.uniforms.uGlowAmt = windUniforms.uGlowAmt;
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\nuniform float uGust;\nattribute float aWind;\nvarying float vWind;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vWind = aWind;
        float _w = uWind * (1.0 + uGust * 2.5);
        vec4 _wp = modelMatrix * vec4(transformed, 1.0);
        float _ph = _wp.x * 0.14 + _wp.z * 0.17 + uTime * (1.5 + uGust * 2.0);
        float _sway = sin(_ph) + 0.5 * sin(_ph * 2.3 + 1.1);
        transformed.x += _sway * aWind * _w;
        transformed.z += cos(_ph * 0.85 + 0.6) * aWind * _w * 0.7;
        transformed.y -= abs(_sway) * aWind * _w * 0.15;
        `
      );
    // Fake subsurface scattering: leaves glow warm when backlit by the sun.
    shader.fragmentShader =
      'uniform vec3 uSunView;\nuniform vec3 uGlowColor;\nuniform float uGlowAmt;\nvarying float vWind;\n' +
      shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        /* glsl */ `
        {
          vec3 _Lv = normalize(uSunView);
          vec3 _Vv = normalize(vViewPosition);
          float _trans = pow(max(dot(-_Vv, _Lv), 0.0), 3.0);
          float _wrap = max(0.0, dot(normal, _Lv) * 0.5 + 0.5);
          totalEmissiveRadiance += uGlowColor * (_trans * 0.9 + _wrap * 0.12) * uGlowAmt * diffuseColor.rgb * vWind;
        }
        #include <opaque_fragment>`
      );
  };
  return mat;
}

// Cylinder/cone segment between two points with end radii, written into arrays.
const _yAxis = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _mat = new THREE.Matrix4();

function segmentGeometry(a, b, rA, rB, radialSegs, color, windA, windB) {
  const len = a.distanceTo(b);
  let geo = new THREE.CylinderGeometry(rB, rA, len, radialSegs, 1, false);
  // Cylinder is centered on origin along +Y; move base to origin then orient.
  geo.translate(0, len / 2, 0);
  _dir.subVectors(b, a).normalize();
  _quat.setFromUnitVectors(_yAxis, _dir);
  _mat.makeRotationFromQuaternion(_quat);
  _mat.setPosition(a.x, a.y, a.z);
  geo.applyMatrix4(_mat);
  // Normalize to non-indexed so all tree parts merge cleanly.
  const ni = geo.toNonIndexed();
  geo.dispose();
  geo = ni;

  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const wind = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    // interpolate wind weight along the segment by local height fraction
    const y = geo.attributes.position.getY(i);
    const f = THREE.MathUtils.clamp((y - a.y) / Math.max(0.001, b.y - a.y), 0, 1);
    wind[i] = THREE.MathUtils.lerp(windA, windB, f);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aWind', new THREE.BufferAttribute(wind, 1));
  return geo;
}

const _bv = new THREE.Vector3();
const _btop = new THREE.Color();
const _bbot = new THREE.Color();
const _btmp = new THREE.Color();
function blobGeometry(center, radius, detail, color, wind, squash = 1) {
  // Higher subdivision + smooth low-frequency noise (not per-vertex spikes) gives
  // soft, rounded, organic foliage instead of a faceted polygonal clump.
  const geo = new THREE.IcosahedronGeometry(radius, Math.max(2, detail));
  const p = geo.attributes.position;
  const sx = center.x * 0.6 + 11.3, sy = center.y * 0.6 - 4.1, sz = center.z * 0.6 + 7.7;
  for (let i = 0; i < p.count; i++) {
    _bv.set(p.getX(i), p.getY(i), p.getZ(i));
    const ix = _bv.x / radius, iy = _bv.y / radius, iz = _bv.z / radius; // unit dir
    // two octaves of smooth noise → gentle billowing lobes, no spikes
    const lump = 1
      + noise3D(ix * 1.7 + sx, iy * 1.7 + sy, iz * 1.7 + sz) * 0.17
      + noise3D(ix * 3.6 - sx, iy * 3.6 + sz, iz * 3.6 - sy) * 0.07;
    p.setXYZ(i, _bv.x * lump, _bv.y * lump * squash, _bv.z * lump);
  }
  geo.translate(center.x, center.y, center.z);
  geo.computeVertexNormals();

  // Vertical gradient: brighter toward the top (sunlit), deeper toward the base.
  const n = p.count;
  const col = new Float32Array(n * 3);
  const w = new Float32Array(n);
  _btop.copy(color).multiplyScalar(1.16);
  _bbot.copy(color).multiplyScalar(0.66);
  for (let i = 0; i < n; i++) {
    const ly = THREE.MathUtils.clamp((p.getY(i) - center.y) / radius * 0.6 + 0.5, 0, 1);
    _btmp.copy(_bbot).lerp(_btop, ly);
    const j = 0.96 + ((i * 2654435761) % 100) / 100 * 0.08;
    col[i * 3] = _btmp.r * j; col[i * 3 + 1] = _btmp.g * j; col[i * 3 + 2] = _btmp.b * j;
    w[i] = wind;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aWind', new THREE.BufferAttribute(w, 1));
  return geo;
}

const barkA = new THREE.Color(COLORS.trunk);
const barkB = new THREE.Color(COLORS.trunkLight);
const leaves = [COLORS.leafA, COLORS.leafB, COLORS.leafC].map((c) => new THREE.Color(c));
const autumn = new THREE.Color(COLORS.leafAutumn);
const blossomPink = new THREE.Color(0xf3b6cd);
const blossomWhite = new THREE.Color(0xfae6ee);

// Pick a canopy tint: mostly greens, with occasional autumn gold and — fitting
// for a Japanese forest — bursts of cherry-blossom pink and white.
function pickLeafTint(rng) {
  const r = rng();
  if (r < 0.09) return blossomPink.clone();
  if (r < 0.15) return blossomWhite.clone();
  if (r < 0.27) return autumn.clone();
  return leaves[(rng() * leaves.length) | 0].clone();
}

// Build ONE tree template in local space (base at origin, growing +Y).
// Returns merged geometry + a climbable skeleton.
export function makeTreeTemplate(seed) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[(rng() * arr.length) | 0];

  // Species archetypes give the forest visual variety.
  const species = rng();
  let trunkH, trunkR, canopyStyle, leafTint;
  if (species < 0.34) {            // broad, round canopy
    trunkH = 9 + rng() * 6; trunkR = 0.5 + rng() * 0.35; canopyStyle = 'round';
  } else if (species < 0.62) {     // tall, layered
    trunkH = 14 + rng() * 9; trunkR = 0.45 + rng() * 0.3; canopyStyle = 'tall';
  } else if (species < 0.82) {     // conifer-ish, stacked cones
    trunkH = 13 + rng() * 8; trunkR = 0.4 + rng() * 0.25; canopyStyle = 'cone';
  } else {                          // slender, sparse
    trunkH = 10 + rng() * 6; trunkR = 0.3 + rng() * 0.2; canopyStyle = 'slim';
  }
  leafTint = pickLeafTint(rng);

  const barkColor = barkA.clone().lerp(barkB, rng() * 0.6);
  const parts = [];
  const branches = []; // climbable segments (local space)

  // Trunk: a couple of stacked tapered segments with a gentle lean.
  const lean = (rng() - 0.5) * 1.6;
  const leanDir = rng() * Math.PI * 2;
  const top = new THREE.Vector3(
    Math.cos(leanDir) * lean, trunkH, Math.sin(leanDir) * lean
  );
  const mid = new THREE.Vector3(top.x * 0.45, trunkH * 0.5, top.z * 0.45);
  const base = new THREE.Vector3(0, 0, 0);
  parts.push(segmentGeometry(base, mid, trunkR, trunkR * 0.7, 8, barkColor, 0.0, 0.06));
  parts.push(segmentGeometry(mid, top, trunkR * 0.7, trunkR * 0.42, 7, barkColor, 0.06, 0.16));

  // Main branches — these are what the squirrel runs along.
  const branchCount = canopyStyle === 'slim' ? 3 : 4 + ((rng() * 3) | 0);
  const startH = trunkH * (canopyStyle === 'tall' ? 0.55 : 0.42);
  for (let i = 0; i < branchCount; i++) {
    const t = i / branchCount;
    const along = THREE.MathUtils.lerp(startH, trunkH * 0.92, t + rng() * 0.1);
    const f = along / trunkH;
    const a = new THREE.Vector3(top.x * f, along, top.z * f);
    const ang = rng() * Math.PI * 2;
    const up = 0.5 + rng() * 0.7; // upward tilt
    const reach = (canopyStyle === 'round' ? 3.4 : 2.4) + rng() * 2.0;
    const b = new THREE.Vector3(
      a.x + Math.cos(ang) * reach,
      a.y + up * reach * 0.5,
      a.z + Math.sin(ang) * reach
    );
    const br = Math.max(0.12, trunkR * (0.5 - t * 0.2));
    parts.push(segmentGeometry(a, b, br, br * 0.5, 6, barkColor, 0.18, 0.5));
    branches.push({ a: a.clone(), b: b.clone(), r: br });

    // a little twig + a leaf cluster at the branch end
    const leafC = leafTint.clone().multiplyScalar(0.85 + rng() * 0.3);
    if (canopyStyle === 'round' || canopyStyle === 'tall' || canopyStyle === 'slim') {
      parts.push(blobGeometry(b, 2.0 + rng() * 1.2, 2, leafC, 0.7));
      // a second smaller lobe partway along the branch, draping it in leaves
      const mid = a.clone().lerp(b, 0.62);
      parts.push(blobGeometry(mid, 1.3 + rng() * 0.7, 2, leafC.clone().multiplyScalar(0.92), 0.55));
    }
  }

  // Crown foliage — clusters of soft overlapping lobes for a full, lush canopy.
  const crownColor = leafTint.clone();
  if (canopyStyle === 'round') {
    const R = 2.7 + rng() * 0.9;
    parts.push(blobGeometry(top, R * 1.2, 2, crownColor, 0.55, 0.95));
    for (let i = 0; i < 4; i++) {
      const off = new THREE.Vector3((rng() - 0.5) * 3.0, (rng() - 0.45) * 1.8, (rng() - 0.5) * 3.0);
      parts.push(blobGeometry(top.clone().add(off), R * (0.62 + rng() * 0.34), 2, crownColor.clone().multiplyScalar(0.86 + rng() * 0.22), 0.6, 0.92));
    }
  } else if (canopyStyle === 'tall') {
    for (let i = 0; i < 4; i++) {
      const c = top.clone().add(new THREE.Vector3((rng() - 0.5) * 3.0, -i * 1.9, (rng() - 0.5) * 3.0));
      parts.push(blobGeometry(c, 3.0 - i * 0.45, 2, crownColor.clone().multiplyScalar(1 - i * 0.05), 0.6, 0.88));
    }
  } else if (canopyStyle === 'cone') {
    const layers = 4 + ((rng() * 2) | 0);
    for (let i = 0; i < layers; i++) {
      const frac = i / layers;
      const y = THREE.MathUtils.lerp(trunkH * 0.45, trunkH + 1.5, frac);
      const r = THREE.MathUtils.lerp(3.2, 0.5, frac) + rng() * 0.3;
      const c = new THREE.Vector3(top.x * (y / trunkH), y, top.z * (y / trunkH));
      const coneGeo = blobGeometry(c, r, 1, crownColor.clone().multiplyScalar(0.9 + frac * 0.15), 0.5, 0.55);
      parts.push(coneGeo);
    }
  } else { // slim
    const R = 2.0 + rng() * 0.7;
    parts.push(blobGeometry(top, R, 2, crownColor, 0.65));
    parts.push(blobGeometry(top.clone().add(new THREE.Vector3((rng() - 0.5) * 2, -1.4, (rng() - 0.5) * 2)), R * 0.7, 2, crownColor.clone().multiplyScalar(0.88), 0.6));
  }

  const geometry = BufferGeometryUtils.mergeGeometries(parts, false);
  geometry.computeBoundingSphere();
  for (const g of parts) g.dispose();

  return {
    geometry,
    skeleton: { trunkHeight: trunkH, trunkRadius: trunkR, top: top.clone(), branches },
    radius: geometry.boundingSphere.radius,
  };
}
