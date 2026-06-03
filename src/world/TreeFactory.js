import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './Noise.js';
import { COLORS } from '../config.js';

// Shared uniforms — every tree sways from the same global clock and glows with
// the same sun (uSunView is the sun direction in view space, set each frame).
export const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0.22 },
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
    shader.uniforms.uSunView = windUniforms.uSunView;
    shader.uniforms.uGlowColor = windUniforms.uGlowColor;
    shader.uniforms.uGlowAmt = windUniforms.uGlowAmt;
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\nattribute float aWind;\nvarying float vWind;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vWind = aWind;
        vec4 _wp = modelMatrix * vec4(transformed, 1.0);
        float _ph = _wp.x * 0.14 + _wp.z * 0.17 + uTime * 1.5;
        float _sway = sin(_ph) + 0.5 * sin(_ph * 2.3 + 1.1);
        transformed.x += _sway * aWind * uWind;
        transformed.z += cos(_ph * 0.85 + 0.6) * aWind * uWind * 0.7;
        transformed.y -= abs(_sway) * aWind * uWind * 0.15;
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

function blobGeometry(center, radius, detail, color, wind, squash = 1) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  // Rough up the surface a touch for an organic, hand-sculpted silhouette.
  const p = geo.attributes.position;
  const rng = mulberry32((center.x * 9301 + center.z * 49297) | 0);
  for (let i = 0; i < p.count; i++) {
    const f = 0.82 + rng() * 0.32;
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * squash, p.getZ(i) * f);
  }
  geo.scale(1, 1, 1);
  geo.translate(center.x, center.y, center.z);
  geo.computeVertexNormals();
  const n = p.count;
  const col = new Float32Array(n * 3);
  const w = new Float32Array(n);
  const cc = color.clone();
  for (let i = 0; i < n; i++) {
    // subtle per-vertex tint variation within the canopy
    const j = 0.9 + ((i * 2654435761) % 100) / 100 * 0.2;
    col[i * 3] = cc.r * j; col[i * 3 + 1] = cc.g * j; col[i * 3 + 2] = cc.b * j;
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
      parts.push(blobGeometry(b, 1.6 + rng() * 1.1, 1, leafC, 0.7));
    }
  }

  // Crown foliage.
  const crownColor = leafTint.clone();
  if (canopyStyle === 'round') {
    parts.push(blobGeometry(top, 3.2 + rng() * 1.2, 1, crownColor, 0.55, 0.9));
    parts.push(blobGeometry(top.clone().add(new THREE.Vector3(1.2, -1.0, 0.5)), 2.4, 1, crownColor.clone().multiplyScalar(0.9), 0.6));
  } else if (canopyStyle === 'tall') {
    for (let i = 0; i < 3; i++) {
      const c = top.clone().add(new THREE.Vector3((rng() - 0.5) * 2.5, -i * 2.2, (rng() - 0.5) * 2.5));
      parts.push(blobGeometry(c, 2.8 - i * 0.4, 1, crownColor.clone().multiplyScalar(1 - i * 0.06), 0.6, 0.85));
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
    parts.push(blobGeometry(top, 2.0 + rng() * 0.8, 1, crownColor, 0.65));
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
