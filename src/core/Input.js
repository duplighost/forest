import * as THREE from 'three';

// Unified input: WASD + mouse-look on desktop, two free-placed thumb sticks on
// touch (left = move, right = look). Exposes an analog move vector, a per-frame
// look delta, and edge-triggered buttons.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.move = new THREE.Vector2();      // x = strafe(+right), y = forward(+fwd)
    this.look = new THREE.Vector2();       // consumed each frame (yaw, pitch)
    this.zoom = 0;                          // consumed each frame
    this.sprint = false;
    this.action = false;                    // held (space): jump / glide / dive
    this._actionEdge = false;
    this.keys = new Set();
    this.locked = false;
    this.isTouch = false;

    this._initKeyboard();
    this._initMouse();
    this._initTouch();
  }

  // True once, when action was freshly pressed (jump buffer feel).
  consumeActionEdge() { const e = this._actionEdge; this._actionEdge = false; return e; }
  consumeLook(out) { out.copy(this.look); this.look.set(0, 0); return out; }
  consumeZoom() { const z = this.zoom; this.zoom = 0; return z; }

  _setAction(on) {
    if (on && !this.action) this._actionEdge = true;
    this.action = on;
  }

  _initKeyboard() {
    const code2 = (e) => e.code;
    window.addEventListener('keydown', (e) => {
      this.keys.add(code2(e));
      if (e.code === 'Space') { this._setAction(true); e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = true;
      this._updateKeyMove();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(code2(e));
      if (e.code === 'Space') this._setAction(false);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = false;
      this._updateKeyMove();
    });
  }

  _updateKeyMove() {
    if (this.isTouch && this._moveTouchId !== null) return; // touch owns it
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    this.move.set(x, y);
    if (this.move.lengthSq() > 1) this.move.normalize();
  }

  _initMouse() {
    const c = this.canvas;
    c.addEventListener('click', () => {
      if (!this.locked && !this.isTouch) c.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look.x += e.movementX;
      this.look.y += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      this.zoom += Math.sign(e.deltaY);
    }, { passive: true });
  }

  _initTouch() {
    this._moveTouchId = null;
    this._lookTouchId = null;
    this._moveOrigin = new THREE.Vector2();
    this._lookPrev = new THREE.Vector2();
    const radius = 64;

    const onStart = (e) => {
      this.isTouch = true;
      for (const t of e.changedTouches) {
        const leftHalf = t.clientX < window.innerWidth * 0.5;
        if (leftHalf && this._moveTouchId === null) {
          this._moveTouchId = t.identifier;
          this._moveOrigin.set(t.clientX, t.clientY);
          this.move.set(0, 0);
        } else if (!leftHalf && this._lookTouchId === null) {
          this._lookTouchId = t.identifier;
          this._lookPrev.set(t.clientX, t.clientY);
          // double-tap on the right = action (jump/glide)
          const now = performance.now();
          if (now - (this._lastRightTap || 0) < 280) this._setAction(true);
          this._lastRightTap = now;
        }
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._moveTouchId) {
          let dx = t.clientX - this._moveOrigin.x;
          let dy = t.clientY - this._moveOrigin.y;
          // Re-center the stick if the thumb drifts past the ring.
          const len = Math.hypot(dx, dy);
          if (len > radius * 1.6) {
            this._moveOrigin.x += dx * (1 - (radius * 1.6) / len);
            this._moveOrigin.y += dy * (1 - (radius * 1.6) / len);
            dx = t.clientX - this._moveOrigin.x;
            dy = t.clientY - this._moveOrigin.y;
          }
          this.move.set(
            THREE.MathUtils.clamp(dx / radius, -1, 1),
            THREE.MathUtils.clamp(-dy / radius, -1, 1)
          );
          if (this.move.lengthSq() > 1) this.move.normalize();
        } else if (t.identifier === this._lookTouchId) {
          this.look.x += (t.clientX - this._lookPrev.x) * 2.0;
          this.look.y += (t.clientY - this._lookPrev.y) * 2.0;
          this._lookPrev.set(t.clientX, t.clientY);
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._moveTouchId) { this._moveTouchId = null; this.move.set(0, 0); }
        else if (t.identifier === this._lookTouchId) { this._lookTouchId = null; this._setAction(false); }
      }
    };
    const opts = { passive: false };
    this.canvas.addEventListener('touchstart', onStart, opts);
    this.canvas.addEventListener('touchmove', onMove, opts);
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  }
}
