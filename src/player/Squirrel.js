import * as THREE from 'three';
import { COLORS } from '../config.js';

const fur = new THREE.MeshStandardMaterial({ color: COLORS.squirrel, roughness: 0.85, metalness: 0 });
const furDark = new THREE.MeshStandardMaterial({ color: 0x6f4a2e, roughness: 0.85 });
const belly = new THREE.MeshStandardMaterial({ color: COLORS.squirrelBelly, roughness: 0.8 });
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x140f0c, roughness: 0.18, metalness: 0.1 });
const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
const noseMat = new THREE.MeshStandardMaterial({ color: 0xc98a8a, roughness: 0.5 });
const pataMat = new THREE.MeshStandardMaterial({
  color: 0xceb089, roughness: 0.72, metalness: 0,
  side: THREE.DoubleSide, transparent: true, opacity: 0.97,
});

function ellipsoid(mat, rx, ry, rz, seg = 16) {
  const g = new THREE.SphereGeometry(1, seg, seg);
  g.scale(rx, ry, rz);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

// Build the adorable model. Everything is parented so limbs/tail/patagium can
// be posed between running, climbing, swimming and the iconic glide.
export class Squirrel {
  constructor() {
    this.group = new THREE.Group();

    // Body shell that bobs & banks.
    this.bodyG = new THREE.Group();
    this.group.add(this.bodyG);

    const body = ellipsoid(fur, 0.34, 0.30, 0.5);
    body.position.y = 0.34;
    this.bodyG.add(body);
    const bellyM = ellipsoid(belly, 0.27, 0.22, 0.42);
    bellyM.position.set(0, 0.27, 0.06);
    this.bodyG.add(bellyM);

    // Head — big and round, with enormous eyes.
    this.headG = new THREE.Group();
    this.headG.position.set(0, 0.46, 0.42);
    this.bodyG.add(this.headG);
    const head = ellipsoid(fur, 0.30, 0.28, 0.27);
    this.headG.add(head);
    const cheeks = ellipsoid(belly, 0.24, 0.18, 0.18);
    cheeks.position.set(0, -0.05, 0.14);
    this.headG.add(cheeks);

    // Eyes (huge, glossy black) + catchlights.
    for (const sx of [-1, 1]) {
      const eye = ellipsoid(eyeMat, 0.115, 0.13, 0.115, 18);
      eye.position.set(sx * 0.16, 0.04, 0.2);
      this.headG.add(eye);
      const hi = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), shine);
      hi.position.set(sx * 0.13, 0.09, 0.31);
      this.headG.add(hi);
      const hi2 = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), shine);
      hi2.position.set(sx * 0.19, 0.0, 0.3);
      this.headG.add(hi2);
      // ears — small, round, set high
      const ear = ellipsoid(furDark, 0.09, 0.11, 0.05, 12);
      ear.position.set(sx * 0.2, 0.27, 0.0);
      ear.rotation.z = sx * -0.2;
      this.headG.add(ear);
      const earIn = ellipsoid(noseMat, 0.05, 0.07, 0.03, 10);
      earIn.position.set(sx * 0.2, 0.27, 0.03);
      this.headG.add(earIn);
    }
    // nose
    const nose = ellipsoid(noseMat, 0.05, 0.045, 0.05, 10);
    nose.position.set(0, -0.04, 0.28);
    this.headG.add(nose);

    // Legs (pivot groups so they can swing / spread).
    this.legs = {};
    const legGeo = new THREE.CapsuleGeometry(0.07, 0.16, 4, 8);
    const footGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const makeLeg = (name, x, z, front) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.28, z);
      const limb = new THREE.Mesh(legGeo, fur);
      limb.position.y = -0.12;
      limb.castShadow = true;
      const foot = new THREE.Mesh(footGeo, furDark);
      foot.position.y = -0.24;
      foot.scale.set(1.1, 0.6, 1.3);
      pivot.add(limb); pivot.add(foot);
      pivot.userData = { x, z, front };
      this.bodyG.add(pivot);
      this.legs[name] = pivot;
    };
    makeLeg('fl', -0.26, 0.28, true);
    makeLeg('fr', 0.26, 0.28, true);
    makeLeg('bl', -0.28, -0.22, false);
    makeLeg('br', 0.28, -0.22, false);

    // Patagium — the gliding membranes. One per side, hidden when tucked.
    this.pata = {};
    for (const sx of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.34);
      shape.quadraticCurveTo(sx * 0.9, 0.40, sx * 1.08, 0.02);
      shape.quadraticCurveTo(sx * 0.82, -0.46, 0, -0.40);
      shape.lineTo(0, 0.34);
      const g = new THREE.ShapeGeometry(shape, 12);
      const m = new THREE.Mesh(g, pataMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.3, 0.06);
      m.castShadow = true;
      this.bodyG.add(m);
      this.pata[sx < 0 ? 'l' : 'r'] = m;
    }

    // Tail — flat & fluffy, several overlapping tapering segments.
    this.tailG = new THREE.Group();
    this.tailG.position.set(0, 0.34, -0.46);
    this.bodyG.add(this.tailG);
    this.tailSegs = [];
    let parent = this.tailG;
    for (let i = 0; i < 7; i++) {
      const seg = new THREE.Group();
      seg.position.z = i === 0 ? 0 : -0.125;
      const w = 0.30 + (i < 3 ? i * 0.02 : (6 - i) * 0.02); // bushy middle
      const h = 0.17 - i * 0.012;
      const mesh = ellipsoid(i < 6 ? fur : furDark, w, h, 0.19, 12);
      mesh.position.z = -0.08;
      seg.add(mesh);
      parent.add(seg);
      this.tailSegs.push(seg);
      parent = seg;
    }

    // Animation state.
    this.glide = 0; this.climb = 0; this.swim = 0; this.runW = 0;
    this.phase = 0; this.idle = 0; this._blink = 0;
    this._setLegBase();
  }

  _setLegBase() {
    // Tucked running pose memorized for blending.
    this.legs.fl.rotation.set(0, 0, 0.15);
    this.legs.fr.rotation.set(0, 0, -0.15);
    this.legs.bl.rotation.set(0, 0, 0.1);
    this.legs.br.rotation.set(0, 0, -0.1);
  }

  // info: { state, speed, turn, vy }
  update(dt, info) {
    const t = (this._t = (this._t || 0) + dt);
    const gT = info.state === 'glide' || info.state === 'air' ? 1 : 0;
    const cT = info.state === 'climb' ? 1 : 0;
    const sT = info.state === 'swim' ? 1 : 0;
    const k = (a, b, r) => a + (b - a) * (1 - Math.exp(-r * dt));
    this.glide = k(this.glide, gT, 12);
    this.climb = k(this.climb, cT, 10);
    this.swim = k(this.swim, sT, 8);
    const moving = THREE.MathUtils.clamp(info.speed / 8, 0, 1);
    this.runW = k(this.runW, moving * (1 - this.glide) * (1 - this.swim), 8);

    // Locomotion phase scales with speed.
    this.phase += dt * (4 + info.speed * 0.7);
    const ph = this.phase;

    // --- Patagium spread ---
    const spread = this.glide;
    this.pata.l.scale.setScalar(0.02 + spread * 0.99);
    this.pata.r.scale.setScalar(0.02 + spread * 0.99);
    this.pata.l.material.opacity = 0.15 + spread * 0.82;

    // --- Legs: blend run-cycle <-> spread glide pose <-> paddle ---
    const swing = 0.9 * this.runW;
    const legPose = (pivot, phaseOff, side, frontSign) => {
      const run = Math.sin(ph * 2 + phaseOff) * swing;
      // glide: arms reach forward/out, legs back/out to tension the membrane
      const gx = pivot.userData.front ? -0.9 : 0.5;
      const gz = side * 0.9;
      const sw = Math.sin(ph * 3 + phaseOff) * 0.7 * this.swim; // paddle
      pivot.rotation.x = THREE.MathUtils.lerp(run + sw, gx, this.glide);
      pivot.rotation.z = THREE.MathUtils.lerp(pivot.userData.x < 0 ? 0.15 : -0.15, gz, this.glide);
    };
    legPose(this.legs.fl, 0, -1, 1);
    legPose(this.legs.fr, Math.PI, 1, 1);
    legPose(this.legs.bl, Math.PI, -1, -1);
    legPose(this.legs.br, 0, 1, -1);

    // --- Body bob, bank, flatten-for-glide ---
    const bob = Math.sin(ph * 2) * 0.05 * this.runW;
    this.bodyG.position.y = bob + this.swim * Math.sin(t * 2) * 0.04;
    this.bodyG.rotation.z = THREE.MathUtils.lerp(this.bodyG.rotation.z, -(info.turn || 0) * 0.5, 0.1);
    const flat = this.glide;
    this.bodyG.scale.set(1 + flat * 0.28, 1 - flat * 0.22, 1 + flat * 0.18);

    // --- Head: peek up while gliding, bob while running ---
    this.headG.rotation.x = THREE.MathUtils.lerp(
      -0.05 + Math.sin(ph * 2) * 0.06 * this.runW, -0.4, this.glide
    );

    // --- Tail: gentle upward arc at rest, lifts when running, streams flat
    // while gliding, sweeps side to side while swimming ---
    const sway = Math.sin(ph * 2 + 1) * (0.10 + 0.28 * this.swim);
    const lift = (0.085 + 0.11 * this.runW) * (1 - this.glide) + this.glide * (-0.015);
    for (let i = 0; i < this.tailSegs.length; i++) {
      const seg = this.tailSegs[i];
      const f = i / this.tailSegs.length;
      // arc up near the base, ease off toward the tip so it trails, not curls
      seg.rotation.x = lift * (1.0 - f * 0.6) + Math.sin(t * 2.6 - i * 0.7) * 0.05 * (0.4 + this.runW);
      seg.rotation.y = sway * (0.4 + f) * (this.runW + this.swim + 0.3) + Math.sin(t * 1.7 - i) * 0.03;
    }

    // --- Blink occasionally for life ---
    this._blink -= dt;
    if (this._blink < 0) this._blink = 1.6 + Math.random() * 3.0;

    // --- Idle breathing when still ---
    const stillness = 1 - this.runW - this.glide - this.swim;
    if (stillness > 0.2) {
      const br = 1 + Math.sin(t * 2.4) * 0.025 * stillness;
      this.bodyG.scale.y *= br;
    }
  }
}
