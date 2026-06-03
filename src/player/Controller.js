import * as THREE from 'three';
import { PLAYER, WORLD } from '../config.js';
import { terrainHeight, terrainNormal } from '../world/Terrain.js';

const up = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

// Closest point on segment ab to p; returns param t in [0,1] (writes into out).
function closestOnSeg(p, a, b, out) {
  _a.subVectors(b, a);
  const len2 = _a.lengthSq() || 1e-6;
  let t = _b.subVectors(p, a).dot(_a) / len2;
  t = THREE.MathUtils.clamp(t, 0, 1);
  out.copy(a).addScaledVector(_a, t);
  return t;
}

export class Controller {
  constructor(world) {
    this.world = world;
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3();
    this.state = 'ground';
    this.facing = 0;            // yaw
    this.pitch = 0;             // model pitch (glide/slope)
    this.roll = 0;             // banking
    this.turnRate = 0;
    this.grounded = true;
    this._coyote = 0;
    this._jumpBuf = 0;
    this._grabCooldown = 0;
    this.climbTree = null;
    this.climbSeg = null;
    this.surfaceNormal = new THREE.Vector3(0, 1, 0);
    this._tq = new THREE.Quaternion();
    this.speed = 0;

    // place on the ground
    this.position.y = terrainHeight(0, 0);
  }

  // World move direction from camera-relative stick.
  _moveDir(input, cam, out) {
    out.set(0, 0, 0);
    out.addScaledVector(cam.forward, input.move.y);
    out.addScaledVector(cam.right, input.move.x);
    return out;
  }

  update(dt, input, cam) {
    this._coyote -= dt; this._jumpBuf -= dt; this._grabCooldown -= dt;
    if (input.consumeActionEdge()) this._jumpBuf = PLAYER.jumpBuffer;

    switch (this.state) {
      case 'ground': this._ground(dt, input, cam); break;
      case 'air': this._air(dt, input, cam); break;
      case 'climb': this._climb(dt, input, cam); break;
      case 'swim': this._swim(dt, input, cam); break;
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    return this._animInfo();
  }

  // ---------------------------------------------------------------- GROUND
  _ground(dt, input, cam) {
    const groundY = terrainHeight(this.position.x, this.position.z);
    const moveDir = this._moveDir(input, cam, _c);
    const has = moveDir.lengthSq() > 0.0001;
    if (has) moveDir.normalize();

    const top = input.sprint ? PLAYER.sprintSpeed : PLAYER.runSpeed;
    // downhill momentum
    const n = terrainNormal(this.position.x, this.position.z, _normal);
    const slopeDot = has ? moveDir.dot(_a.set(n.x, 0, n.z)) : 0;
    const targetSpeed = top * (1 + slopeDot * PLAYER.slopeBoost);

    const vel = this.velocity;
    if (has) {
      _d.copy(moveDir).multiplyScalar(targetSpeed);
      const r = 1 - Math.exp(-PLAYER.accel / top * dt * 6);
      vel.x += (_d.x - vel.x) * r;
      vel.z += (_d.z - vel.z) * r;
      // face travel direction
      const desired = Math.atan2(vel.x, vel.z);
      this._slewFacing(desired, PLAYER.turnResponse, dt);
    } else {
      const r = Math.exp(-PLAYER.decel / Math.max(2, top) * dt * 6);
      vel.x *= r; vel.z *= r;
    }

    // integrate horizontal
    this.position.x += vel.x * dt;
    this.position.z += vel.z * dt;

    // auto-climb: running at a trunk scales it without stopping
    if (this.speed > 3 && this._tryGrabTree(true)) return;

    // water?
    const gh = terrainHeight(this.position.x, this.position.z);
    if (gh < WORLD.waterLevel && this.position.y <= WORLD.waterLevel + 0.2) {
      this.state = 'swim'; return;
    }

    // vertical: stick to ground, with coyote + jump
    const standY = gh;
    if (this.position.y <= standY + 0.05) {
      this.position.y = standY;
      vel.y = 0;
      this.grounded = true;
      this._coyote = PLAYER.coyoteTime;
      // slope-align pitch/roll target stored in surfaceNormal
      this.surfaceNormal.copy(terrainNormal(this.position.x, this.position.z, _normal));
    } else {
      vel.y -= PLAYER.gravity * dt;
      this.position.y += vel.y * dt;
      this.grounded = false;
      if (this.position.y < standY) { this.position.y = standY; vel.y = 0; }
    }

    // jump (buffered + coyote)
    if (this._jumpBuf > 0 && this._coyote > 0) {
      vel.y = PLAYER.jumpSpeed;
      this.position.y += 0.02;
      this._jumpBuf = 0; this._coyote = 0;
      this.grounded = false;
      this.state = 'air';
      return;
    }

    // ran off a ledge
    if (!this.grounded && this._coyote <= 0 && vel.y < -1) this.state = 'air';
    this.surfaceNormal.lerp(up, 0); // keep
  }

  // ------------------------------------------------------------------- AIR / GLIDE
  _air(dt, input, cam) {
    const vel = this.velocity;

    // Steer like a forgiving glider: stick X = turn, stick Y = pitch.
    // Release everything → gentle forward glide, slow descent.
    const turnIn = input.move.x;
    const pitchIn = input.move.y;
    this.facing -= turnIn * PLAYER.glideTurn * dt;
    // bank into turns for flavor
    this.roll = THREE.MathUtils.lerp(this.roll, -turnIn * 0.5, 1 - Math.exp(-6 * dt));
    // pitch: forward dives, back flares; auto-level toward a slight nose-down
    const targetPitch = pitchIn > 0 ? -0.5 * pitchIn : 0.5 * -pitchIn;
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch * 0.6, 1 - Math.exp(-3 * dt));

    const fwd = _a.set(Math.sin(this.facing), Math.sin(this.pitch), Math.cos(this.facing));
    fwd.normalize();

    // constant gentle forward pull + dive acceleration
    const dive = Math.max(0, -this.pitch);
    const push = PLAYER.glideForward + dive * PLAYER.glidePitchDive;
    vel.addScaledVector(fwd, push * dt);

    // gravity, partly converted to lift by horizontal speed
    const horiz = Math.hypot(vel.x, vel.z);
    const lift = Math.min(PLAYER.glideGravity, horiz * PLAYER.glideLift);
    vel.y -= (PLAYER.glideGravity - lift) * dt;

    // drag toward facing so turns feel like banking, keep momentum
    const sp = vel.length();
    if (sp > 0.001) {
      _b.copy(fwd).multiplyScalar(sp);
      vel.lerp(_b, 1 - Math.exp(-PLAYER.glideDrag * 6 * dt));
    }
    if (sp > PLAYER.glideMaxSpeed) vel.multiplyScalar(PLAYER.glideMaxSpeed / sp);

    this.position.addScaledVector(vel, dt);

    // grab a tree we glide into → climb (don't crash)
    if (this._tryGrabTree(false)) return;

    // water landing
    const gh = terrainHeight(this.position.x, this.position.z);
    if (gh < WORLD.waterLevel && this.position.y <= WORLD.waterLevel) {
      this.state = 'swim'; this.roll = 0; return;
    }
    // ground landing
    if (this.position.y <= gh) {
      this.position.y = gh;
      vel.y = 0;
      this.roll = 0; this.pitch = 0;
      this.state = 'ground';
      this._coyote = PLAYER.coyoteTime;
      return;
    }
  }

  // ------------------------------------------------------------------- CLIMB
  _enterClimb(tree, seg, fromGround) {
    this.state = 'climb';
    this.climbTree = tree;
    this.climbSeg = seg;
    // keep some upward momentum so grabbing feels like a fluid scramble
    const boost = Math.min(this.speed, PLAYER.runSpeed);
    this.velocity.set(0, Math.max(this.velocity.y, fromGround ? boost * 0.6 : boost * 0.4), 0);
  }

  _climb(dt, input, cam) {
    const tree = this.climbTree;
    if (!tree) { this.state = 'air'; return; }

    // Find the closest point on the current tree across all its segments.
    let best = null, bestD = Infinity;
    for (const seg of tree.segments) {
      const t = closestOnSeg(this.position, seg.a, seg.b, _c);
      const d = _c.distanceToSquared(this.position);
      if (d < bestD) { bestD = d; best = { seg, t, point: _c.clone() }; }
    }
    if (!best || bestD > 9) { this._leap(0.3); return; } // drifted off the trunk

    const seg = best.seg;
    this.climbSeg = seg;
    _axis.subVectors(seg.b, seg.a).normalize();
    // surface normal: from axis to player, with axis component removed
    _normal.subVectors(this.position, best.point);
    _normal.addScaledVector(_axis, -_normal.dot(_axis));
    if (_normal.lengthSq() < 1e-5) _normal.set(0, 0, 1); else _normal.normalize();
    this.surfaceNormal.copy(_normal);
    _tan.crossVectors(_normal, _axis).normalize(); // around the trunk

    // Inputs: up/down the axis + around the surface. Camera-relative feel:
    // push the stick "up" to go up the tree regardless of facing.
    const upAmt = input.move.y;
    const aroundAmt = input.move.x;
    const climbSp = seg.kind === 'branch' ? PLAYER.branchRunSpeed : PLAYER.climbSpeed;

    const vel = this.velocity;
    _d.set(0, 0, 0)
      .addScaledVector(_axis, upAmt * climbSp)
      .addScaledVector(_tan, aroundAmt * climbSp * 0.8);
    const r = 1 - Math.exp(-PLAYER.climbAccel * 0.15 * dt * 6);
    vel.lerp(_d, r);
    this.position.addScaledVector(vel, dt);

    // hug the surface
    let bt = null, btD = Infinity;
    for (const s of tree.segments) {
      const t = closestOnSeg(this.position, s.a, s.b, _c);
      const d = _c.distanceToSquared(this.position);
      if (d < btD) { btD = d; bt = { s, t, point: _c.clone() }; }
    }
    _normal.subVectors(this.position, bt.point);
    _axis.subVectors(bt.s.b, bt.s.a).normalize();
    _normal.addScaledVector(_axis, -_normal.dot(_axis));
    if (_normal.lengthSq() < 1e-5) _normal.set(0, 0, 1); else _normal.normalize();
    const target = _b.copy(bt.point).addScaledVector(_normal, bt.s.r + PLAYER.radius * 0.6);
    this.position.lerp(target, 1 - Math.exp(-PLAYER.climbSnap * 6 * dt));
    this.surfaceNormal.copy(_normal);

    // face along climbing velocity projected on surface
    const climbVel = _c.copy(vel);
    if (climbVel.lengthSq() > 0.5) {
      this.facing = Math.atan2(climbVel.x, climbVel.z);
    }

    // crest the top of a trunk → launch into a glide
    const seg2 = bt.s;
    if (seg2.kind === 'trunk' && bt.t > 0.97 && upAmt > 0.1) { this._leap(1.0, true); return; }
    // run off the end of a branch → leap
    if (seg2.kind === 'branch' && bt.t > 0.98 && upAmt > 0.1) { this._leap(0.8, true); return; }
    // slide off the bottom → back on the ground
    if (bt.t < 0.02 && upAmt < 0) {
      this.state = 'ground'; this.velocity.multiplyScalar(0.3); return;
    }

    // jump off the tree
    if (this._jumpBuf > 0) { this._jumpBuf = 0; this._leap(1.0); return; }
  }

  _leap(power, crest = false) {
    const vel = this.velocity;
    // launch away from the surface + up + keep climb momentum forward
    _a.copy(this.surfaceNormal).multiplyScalar(PLAYER.leapForward * power);
    const fwd = _b.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    vel.addScaledVector(fwd, PLAYER.leapForward * power * (crest ? 0.9 : 0.5));
    vel.x += _a.x; vel.z += _a.z;
    vel.y = Math.max(vel.y, PLAYER.jumpSpeed * (crest ? 0.7 : 1.0));
    this.position.addScaledVector(this.surfaceNormal, 0.2);
    this.climbTree = null; this.climbSeg = null;
    this.pitch = -0.1;
    this._grabCooldown = 0.6; // don't instantly re-grab the tree we just left
    this.state = 'air';
  }

  // ------------------------------------------------------------------- SWIM
  _swim(dt, input, cam) {
    const vel = this.velocity;
    const moveDir = this._moveDir(input, cam, _c);
    const has = moveDir.lengthSq() > 0.0001;
    if (has) {
      moveDir.normalize();
      _d.copy(moveDir).multiplyScalar(PLAYER.swimSpeed);
      const r = 1 - Math.exp(-PLAYER.swimAccel * 0.2 * dt * 6);
      vel.x += (_d.x - vel.x) * r;
      vel.z += (_d.z - vel.z) * r;
      this._slewFacing(Math.atan2(vel.x, vel.z), 6, dt);
    } else {
      vel.x *= Math.exp(-2 * dt); vel.z *= Math.exp(-2 * dt);
    }

    // buoyancy toward surface; dive when holding action
    const surf = WORLD.waterLevel;
    if (input.action) {
      vel.y -= PLAYER.diveSpeed * dt * 4;
    } else {
      const depth = surf - this.position.y;
      vel.y += (depth * PLAYER.buoyancy - vel.y * 4) * dt;
    }
    vel.y = THREE.MathUtils.clamp(vel.y, -PLAYER.diveSpeed, PLAYER.buoyancy);
    this.position.addScaledVector(vel, dt);
    this.position.y = Math.min(this.position.y, surf + 0.3);

    // climb out onto the shore
    const gh = terrainHeight(this.position.x, this.position.z);
    if (gh > surf - 0.2) {
      this.position.y = gh;
      this.state = 'ground';
      vel.y = 0;
    }
    this.surfaceNormal.copy(up);
  }

  // ------------------------------------------------------------------- helpers
  _slewFacing(target, rate, dt) {
    let d = target - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.turnRate = d * rate;
    this.facing += d * (1 - Math.exp(-rate * dt));
  }

  // Look for a nearby tree to grab. fromGround=true uses the forgiving auto-climb.
  _tryGrabTree(fromGround) {
    if (this._grabCooldown > 0) return false;
    const trees = this.world.activeTrees;
    if (!trees.length) return false;
    const px = this.position.x, pz = this.position.z;
    const vlen = Math.hypot(this.velocity.x, this.velocity.z) || 1;
    const vx = this.velocity.x / vlen, vz = this.velocity.z / vlen;

    let grabbed = null, grabSeg = null, bestScore = Infinity;
    for (const tree of trees) {
      const dx = tree.x - px, dz = tree.z - pz;
      const horiz = Math.hypot(dx, dz);
      if (horiz > tree.reach + PLAYER.autoClimbDist) continue;
      if (this.position.y > tree.topY + 1) continue;
      // heading roughly toward the trunk? (forgiving on the ground, and we must
      // not be flying away from it in the air)
      const toward = (dx / (horiz || 1)) * vx + (dz / (horiz || 1)) * vz;
      const minToward = fromGround ? PLAYER.autoClimbDot : -0.15;
      if (toward < minToward) continue;

      for (const seg of tree.segments) {
        const t = closestOnSeg(this.position, seg.a, seg.b, _c);
        const d = _c.distanceTo(this.position);
        const grabDist = seg.r + PLAYER.radius + (fromGround ? PLAYER.autoClimbDist : 1.6);
        if (d < grabDist && d < bestScore) {
          bestScore = d; grabbed = tree; grabSeg = seg;
        }
      }
    }
    if (grabbed) { this._enterClimb(grabbed, grabSeg, fromGround); return true; }
    return false;
  }

  _animInfo() {
    return {
      state: this.state,
      speed: this.velocity.length(),
      turn: this.turnRate,
      vy: this.velocity.y,
    };
  }

  // Produce the world transform for the squirrel model.
  applyTransform(group, dt) {
    group.position.copy(this.position);
    // Build target orientation by state.
    if (this.state === 'climb') {
      // belly to the surface: up = surfaceNormal, forward along facing tangent
      _b.set(Math.sin(this.facing), 0, Math.cos(this.facing));
      _normal.copy(this.surfaceNormal);
      _tan.crossVectors(_normal, _b);
      if (_tan.lengthSq() < 1e-4) _tan.set(1, 0, 0);
      _tan.normalize();
      _a.crossVectors(_tan, _normal).normalize(); // forward on surface
      _m.makeBasis(_tan, _normal, _a);
      this._tq.setFromRotationMatrix(_m);
    } else {
      let nx = up, pitch = this.pitch, roll = this.roll;
      if (this.state === 'ground') {
        // align gently to slope
        nx = this.surfaceNormal;
      }
      _q.setFromAxisAngle(up, this.facing);
      // pitch around local X, roll around local Z
      const qp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
      const qr = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll);
      this._tq.copy(_q).multiply(qp).multiply(qr);
      if (this.state === 'ground') {
        // blend a little terrain tilt
        const tilt = new THREE.Quaternion().setFromUnitVectors(up, this.surfaceNormal);
        this._tq.premultiply(tilt.slerp(new THREE.Quaternion(), 0.4));
      }
    }
    group.quaternion.slerp(this._tq, 1 - Math.exp(-12 * dt));
  }
}
