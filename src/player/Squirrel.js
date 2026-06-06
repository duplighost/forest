import * as THREE from 'three';

// Soft, plush Japanese dwarf flying squirrel (momonga): a chibi build with a big
// round head, huge glossy sparkle eyes, rosy blush cheeks and a tiny smile, a
// soft patagium cape, and ONE fluffy flattened plume tail. Cuteness over realism.
const fur = new THREE.MeshStandardMaterial({ color: 0xd6c1a4, roughness: 0.95, metalness: 0 }); // warm soft fawn
const furTip = new THREE.MeshStandardMaterial({ color: 0xb89a78, roughness: 0.95 });            // warm tail accent
const belly = new THREE.MeshStandardMaterial({ color: 0xf6efdf, roughness: 0.9 });              // bright cream face/belly
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x161016, roughness: 0.06, metalness: 0.25 }); // glossy sparkle
const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
const noseMat = new THREE.MeshStandardMaterial({ color: 0xff8fa6, roughness: 0.45 });            // candy-pink nose
const innerPink = new THREE.MeshStandardMaterial({ color: 0xffb3c6, roughness: 0.55 });          // bright ear pink
const blushMat = new THREE.MeshStandardMaterial({
  color: 0xff8fa0, roughness: 0.7, transparent: true, opacity: 0.8,
  emissive: 0x6a1224, emissiveIntensity: 0.28,                                                   // rosy glow cheeks
});
const mouthMat = new THREE.MeshStandardMaterial({ color: 0x5e3338, roughness: 0.5 });
const pataMat = new THREE.MeshStandardMaterial({
  color: 0xeadcc4, roughness: 0.85, metalness: 0,
  side: THREE.DoubleSide, transparent: true, opacity: 0.95,
});

// Shared by every fur shell so one update sways the whole coat. uSwayAmt rises
// with motion: a faint idle shimmer at rest, a windswept ripple while running
// and gliding (tips trail back).
const furUniforms = { uTime: { value: 0 }, uSwayAmt: { value: 0 } };

function ellipsoid(mat, rx, ry, rz, seg = 16) {
  const g = new THREE.SphereGeometry(1, seg, seg);
  g.scale(rx, ry, rz);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

// --- Shell fur ------------------------------------------------------------
// One fur shell: the same geometry pushed out along its normals by `frac`, with
// a procedural strand cutout so each "strand" only survives up to its random
// height — stacked shells read as soft, tufted fluff that tapers to the tips.
const _furV = 'uniform float uOff;\nuniform float uFrac;\nuniform float uTime;\nuniform float uSwayAmt;\nvarying vec3 vFP;\n';
const _furF =
  'uniform float uFrac;\nuniform float uDensity;\nvarying vec3 vFP;\n' +
  'float h31(vec3 p){return fract(sin(dot(p,vec3(41.3,289.1,123.7)))*43758.5453);}\n';
function furShell(geo, baseMat, frac, furLen, density) {
  const m = baseMat.clone();
  m.alphaTest = 0.5;
  m.transparent = false;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOff = { value: frac * furLen };
    sh.uniforms.uFrac = { value: frac };
    sh.uniforms.uDensity = { value: density };
    sh.uniforms.uTime = furUniforms.uTime;        // shared → one update sways every shell
    sh.uniforms.uSwayAmt = furUniforms.uSwayAmt;
    sh.vertexShader = _furV + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vFP = position;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        '  transformed += normalize(objectNormal) * uOff;\n' +
        '  { float tip = uFrac;\n' +                                  // outer shells (tips) move most
        '    float w = uTime * (2.0 + uSwayAmt * 3.0);\n' +
        '    vec3 rip = vec3(sin(w + position.y*7.0 + position.z*5.0),\n' +
        '                    sin(w*0.8 + position.x*6.0) * 0.4,\n' +
        '                    cos(w*1.1 + position.x*6.0 + position.y*4.0));\n' +
        '    transformed += rip * ((0.008 + 0.030 * uSwayAmt) * tip);\n' +  // idle shimmer → motion ripple
        '    transformed.z -= uSwayAmt * tip * 0.035; }');                  // tips trail backward when moving
    sh.fragmentShader = _furF + sh.fragmentShader.replace(
      '#include <alphatest_fragment>',
      '  { vec3 cell = floor(vFP * uDensity); float strand = h31(cell);\n' +
      '    diffuseColor.a *= step(uFrac, strand);\n' +                    // cut strands shorter than this shell
      '    diffuseColor.rgb *= 0.82 + 0.18 * (uFrac / max(strand, 0.001)); }\n' + // a touch darker at the roots
      '#include <alphatest_fragment>'
    );
  };
  m.needsUpdate = true;
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = false;
  return mesh;
}

// A plush, fuzzy ellipsoid: a solid core plus a few fur shells.
function furBall(mat, rx, ry, rz, seg = 16, shells = 5) {
  const g = new THREE.SphereGeometry(1, seg, seg);
  g.scale(rx, ry, rz);
  const grp = new THREE.Group();
  const base = new THREE.Mesh(g, mat); base.castShadow = true;
  grp.add(base);
  const furLen = 0.13 * (rx + ry + rz) / 3;
  const density = 46;
  for (let i = 1; i <= shells; i++) grp.add(furShell(g, mat, i / shells, furLen, density));
  return grp;
}

export class Squirrel {
  constructor() {
    this.group = new THREE.Group();
    this.bodyG = new THREE.Group();           // bobs / banks / squashes
    this.group.add(this.bodyG);

    // --- Body: small plush oval ---
    const body = furBall(fur, 0.30, 0.28, 0.33);
    body.position.set(0, 0.30, -0.02);
    this.bodyG.add(body);
    const bellyM = ellipsoid(belly, 0.25, 0.22, 0.27);
    bellyM.position.set(0, 0.25, 0.07);
    this.bodyG.add(bellyM);

    // --- Head: BIG and round, sitting forward & up (extra chibi) ---
    this.headG = new THREE.Group();
    this.headG.position.set(0, 0.57, 0.25);
    this.bodyG.add(this.headG);
    const head = furBall(fur, 0.41, 0.40, 0.37);
    this.headG.add(head);
    const face = ellipsoid(belly, 0.31, 0.27, 0.23);   // big cream muzzle/face
    face.position.set(0, -0.05, 0.17);
    this.headG.add(face);

    this.eyes = []; this.shines = []; this.ears = [];
    for (const sx of [-1, 1]) {
      // soft cheek fluff
      const cheek = furBall(fur, 0.16, 0.16, 0.15, 12);
      cheek.position.set(sx * 0.30, -0.05, 0.05);
      this.headG.add(cheek);

      // HUGE glossy eye + a big sparkle and a little one
      const eye = ellipsoid(eyeMat, 0.185, 0.215, 0.175, 22);
      eye.position.set(sx * 0.175, 0.05, 0.265);
      this.headG.add(eye); this.eyes.push(eye);
      const hi = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 12), shine);
      hi.position.set(sx * 0.135, 0.14, 0.40);
      this.headG.add(hi); this.shines.push(hi);
      const hi2 = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), shine);
      hi2.position.set(sx * 0.245, -0.02, 0.38);
      this.headG.add(hi2); this.shines.push(hi2);

      // rosy blush cheek — the big cuteness pop
      const blush = ellipsoid(blushMat, 0.105, 0.078, 0.055, 12);
      blush.position.set(sx * 0.235, -0.06, 0.245);
      this.headG.add(blush);

      // round ear (pivot group for twitch) with bright pink inner
      const ear = new THREE.Group();
      ear.position.set(sx * 0.22, 0.31, -0.02); ear.userData.sx = sx;
      this.headG.add(ear); this.ears.push(ear);
      const earOuter = ellipsoid(fur, 0.13, 0.15, 0.07, 12);
      earOuter.position.set(0, 0.11, 0); earOuter.rotation.z = sx * -0.14;
      ear.add(earOuter);
      const earInner = ellipsoid(innerPink, 0.07, 0.088, 0.035, 10);
      earInner.position.set(0, 0.11, 0.04);
      ear.add(earInner);
    }
    // tiny pink nose + a little smile
    const nose = ellipsoid(noseMat, 0.065, 0.057, 0.063, 12);
    nose.position.set(0, -0.04, 0.345);
    this.headG.add(nose);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.017, 8, 18, Math.PI), mouthMat);
    smile.position.set(0, -0.14, 0.32);
    smile.rotation.z = Math.PI;          // flip the half-ring into a ∪ smile
    this.headG.add(smile);

    // --- Tiny paws (pivot groups; kept for run/glide/swim animation) ---
    this.legs = {};
    const legGeo = new THREE.CapsuleGeometry(0.055, 0.1, 4, 8);
    const pawGeo = new THREE.SphereGeometry(0.075, 8, 8);
    const makeLeg = (name, x, z, front) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.22, z);
      const limb = new THREE.Mesh(legGeo, fur); limb.position.y = -0.08; limb.castShadow = true;
      const paw = new THREE.Mesh(pawGeo, furTip); paw.position.y = -0.16; paw.scale.set(1.1, 0.6, 1.3);
      pivot.add(limb, paw);
      pivot.userData = { x, z, front };
      this.bodyG.add(pivot);
      this.legs[name] = pivot;
    };
    makeLeg('fl', -0.21, 0.17, true);
    makeLeg('fr', 0.21, 0.17, true);
    makeLeg('bl', -0.23, -0.16, false);
    makeLeg('br', 0.23, -0.16, false);

    // --- Patagium: a soft cape membrane each side, front leg → back leg.
    // Visible (folded) at rest, spreads wide into a kite while gliding. ---
    this.pata = {};
    for (const sx of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.26);
      shape.quadraticCurveTo(sx * 0.86, 0.32, sx * 1.0, -0.04);
      shape.quadraticCurveTo(sx * 0.78, -0.42, 0, -0.36);
      shape.lineTo(0, 0.26);
      const g = new THREE.ShapeGeometry(shape, 14);
      const m = new THREE.Mesh(g, pataMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.24, 0.02);
      m.castShadow = true;
      this.bodyG.add(m);
      this.pata[sx < 0 ? 'l' : 'r'] = m;
    }

    // --- Tail: ONE fluffy flattened plume — three broad overlapping tufts of
    // different sizes (reads as a single plume, never a caterpillar) ---
    this.tailG = new THREE.Group();
    this.tailG.position.set(0, 0.33, -0.30);
    this.bodyG.add(this.tailG);
    this.tailSegs = [];
    const tufts = [
      { mat: fur, w: 0.34, h: 0.18, d: 0.26, z: 0.0, off: -0.10 },
      { mat: fur, w: 0.40, h: 0.22, d: 0.31, z: -0.19, off: -0.13 },
      { mat: furTip, w: 0.31, h: 0.18, d: 0.27, z: -0.22, off: -0.12 },
    ];
    let parent = this.tailG;
    for (const t of tufts) {
      const seg = new THREE.Group();
      seg.position.z = t.z;
      const mesh = furBall(t.mat, t.w, t.h, t.d, 14);
      mesh.position.z = t.off;
      seg.add(mesh);
      parent.add(seg);
      this.tailSegs.push(seg);
      parent = seg;
    }

    this.glide = 0; this.climb = 0; this.swim = 0; this.runW = 0;
    this.phase = 0; this.idle = 0; this._blink = 0;
    this._sq = 0; this._sqV = 0; // squash/stretch spring
    this._setLegBase();
  }

  _setLegBase() {
    this.legs.fl.rotation.set(0, 0, 0.15);
    this.legs.fr.rotation.set(0, 0, -0.15);
    this.legs.bl.rotation.set(0, 0, 0.1);
    this.legs.br.rotation.set(0, 0, -0.1);
  }

  // info: { state, speed, turn, vy, land, stretch }
  update(dt, info) {
    const t = (this._t = (this._t || 0) + dt);
    const gT = info.state === 'glide' || info.state === 'air' ? 1 : 0;
    const cT = info.state === 'climb' ? 1 : 0;
    const sT = info.state === 'swim' ? 1 : 0;
    const k = (a, b, r) => a + (b - a) * (1 - Math.exp(-r * dt));
    this.glide = k(this.glide, gT, 12);
    this.climb = k(this.climb, cT, 10);

    // fur sway: faint shimmer at rest, windswept ripple while moving/gliding
    const swayT = Math.min(1, THREE.MathUtils.clamp(info.speed / 14, 0, 1) * (gT ? 1.0 : 0.85)
      + Math.abs(info.turn || 0) * 0.25);
    this._fsway = k(this._fsway || 0, swayT, 6);
    furUniforms.uTime.value = t;
    furUniforms.uSwayAmt.value = this._fsway;
    this.swim = k(this.swim, sT, 8);
    const moving = THREE.MathUtils.clamp(info.speed / 8, 0, 1);
    this.runW = k(this.runW, moving * (1 - this.glide) * (1 - this.swim), 8);

    this.phase += dt * (4 + info.speed * 0.7);
    const ph = this.phase;

    // --- Patagium: folded cape at rest, full kite while gliding ---
    const spread = this.glide;
    this.pata.l.scale.setScalar(0.34 + spread * 0.66);
    this.pata.r.scale.setScalar(0.34 + spread * 0.66);
    this.pata.l.material.opacity = 0.55 + spread * 0.42;

    // --- Legs: run-cycle <-> spread glide pose <-> paddle ---
    const swing = 0.9 * this.runW;
    const legPose = (pivot, phaseOff, side) => {
      const run = Math.sin(ph * 2 + phaseOff) * swing;
      const gx = pivot.userData.front ? -0.9 : 0.5;
      const gz = side * 0.9;
      const sw = Math.sin(ph * 3 + phaseOff) * 0.7 * this.swim;
      pivot.rotation.x = THREE.MathUtils.lerp(run + sw, gx, this.glide);
      pivot.rotation.z = THREE.MathUtils.lerp(pivot.userData.x < 0 ? 0.15 : -0.15, gz, this.glide);
    };
    legPose(this.legs.fl, 0, -1);
    legPose(this.legs.fr, Math.PI, 1);
    legPose(this.legs.bl, Math.PI, -1);
    legPose(this.legs.br, 0, 1);

    // --- Squash & stretch spring (juice on jump / land) ---
    if (info.stretch) this._sqV += info.stretch * 13;
    if (info.land) this._sqV -= info.land * 15;
    this._sqV += (-this._sq * 90 - this._sqV * 12) * dt;
    this._sq += this._sqV * dt;
    this._sq = THREE.MathUtils.clamp(this._sq, -0.8, 1.0);

    // --- Body bob, bank, flatten-for-glide ---
    const bob = Math.sin(ph * 2) * 0.05 * this.runW;
    this.bodyG.position.y = bob + this.swim * Math.sin(t * 2) * 0.04;
    this.bodyG.rotation.z = THREE.MathUtils.lerp(this.bodyG.rotation.z, -(info.turn || 0) * 0.5, 0.1);
    const flat = this.glide;
    this.bodyG.scale.set(
      (1 + flat * 0.24) * (1 - this._sq * 0.16),
      (1 - flat * 0.20) * (1 + this._sq * 0.26),
      (1 + flat * 0.16) * (1 - this._sq * 0.16)
    );

    // --- Head: peek up while gliding, bob while running ---
    this.headG.rotation.x = THREE.MathUtils.lerp(
      -0.05 + Math.sin(ph * 2) * 0.06 * this.runW, -0.38, this.glide
    );

    // --- Tail: gentle upward plume at rest, lifts running, streams flat gliding,
    // sweeps while swimming. Three broad tufts → one fluffy tail. ---
    const sway = Math.sin(ph * 2 + 1) * (0.12 + 0.28 * this.swim);
    const lift = (0.10 + 0.13 * this.runW) * (1 - this.glide) + this.glide * (-0.06);
    for (let i = 0; i < this.tailSegs.length; i++) {
      const seg = this.tailSegs[i];
      const f = i / this.tailSegs.length;
      seg.rotation.x = lift * (1.0 - f * 0.4) + Math.sin(t * 2.6 - i * 0.7) * 0.05 * (0.4 + this.runW);
      seg.rotation.y = sway * (0.4 + f) * (this.runW + this.swim + 0.3) + Math.sin(t * 1.7 - i) * 0.03;
    }

    // --- Eyes: blink, with the catchlights winking out ---
    this._blink -= dt;
    if (this._blink < 0) { this._blink = 1.4 + Math.random() * 3.4; this._blinkT = 0.16; }
    this._blinkT = (this._blinkT || 0) - dt;
    const closed = this._blinkT > 0 ? Math.sin((1 - this._blinkT / 0.16) * Math.PI) : 0;
    for (const e of this.eyes) e.scale.y = 1 - closed * 0.92;
    for (const s of this.shines) s.visible = closed < 0.4;

    // --- Idle head glances when still ---
    const still = THREE.MathUtils.clamp(1 - this.runW - this.glide - this.swim, 0, 1);
    this._lookT = (this._lookT || 0) - dt;
    if (this._lookT < 0) { this._lookT = 1.4 + Math.random() * 2.6; this._lookYaw = (Math.random() - 0.5) * 0.7; }
    this.headG.rotation.y = THREE.MathUtils.lerp(this.headG.rotation.y, (this._lookYaw || 0) * still, 1 - Math.exp(-3 * dt));

    // --- Ear twitch ---
    this._earT = (this._earT || 0) - dt;
    if (this._earT < 0) { this._earT = 0.8 + Math.random() * 3.2; this._earKick = 0.5; }
    this._earKick = (this._earKick || 0) * Math.exp(-7 * dt);
    for (const ear of this.ears) ear.rotation.z = Math.sin(t * 32) * this._earKick * 0.28 * ear.userData.sx + Math.sin(t * 1.3 + ear.userData.sx) * 0.03;

    // --- Idle breathing when still ---
    const stillness = 1 - this.runW - this.glide - this.swim;
    if (stillness > 0.2) {
      const br = 1 + Math.sin(t * 2.4) * 0.025 * stillness;
      this.bodyG.scale.y *= br;
    }

    // --- Curl up to rest (in a cosy hollow): tuck, wrap the tail, drift off ---
    const rest = info.rest || 0;
    if (rest > 0.001) {
      this.bodyG.scale.multiplyScalar(1 - 0.10 * rest);
      this.bodyG.scale.y *= (1 - 0.08 * rest) * (1 + Math.sin(t * 1.2) * 0.05 * rest); // slow deep breaths
      this.headG.rotation.x = THREE.MathUtils.lerp(this.headG.rotation.x, 0.55, rest);  // nose tucked down
      this.headG.position.y = THREE.MathUtils.lerp(this.headG.position.y, 0.4, rest);
      for (let i = 0; i < this.tailSegs.length; i++)
        this.tailSegs[i].rotation.x = THREE.MathUtils.lerp(this.tailSegs[i].rotation.x, 0.7 + i * 0.25, rest); // tail wraps up
      for (const e of this.eyes) e.scale.y *= (1 - 0.85 * rest);  // drowsy eyes
      if (rest > 0.5) for (const s of this.shines) s.visible = false;
    }
  }
}
