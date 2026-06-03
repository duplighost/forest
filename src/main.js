import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { SkySystem } from './world/Sky.js';
import { World } from './world/World.js';
import { Water } from './world/Water.js';
import { Particles } from './world/Particles.js';
import { terrainHeight, terrainSlope } from './world/Terrain.js';
import { FollowCamera } from './player/FollowCamera.js';
import { Squirrel } from './player/Squirrel.js';
import { Controller } from './player/Controller.js';
import { WORLD } from './config.js';

const engine = new Engine(document.getElementById('app'));
const input = new Input(engine.renderer.domElement);

// Pick a starting quality profile. Phones get a lighter world so movement
// stays buttery; the runtime adapter can dial it down further if needed.
const LOW = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints || 0) > 1;
if (LOW) {
  WORLD.viewChunks = 4;
  engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
}

const sky = new SkySystem(engine.scene);
if (LOW) sky.sun.shadow.mapSize.set(1024, 1024);
const world = new World(engine.scene);
const water = new Water(engine.scene, sky.sunDir);
const particles = new Particles(engine.scene, LOW ? 170 : 320);
const camera = new FollowCamera(engine.camera, input);
const squirrel = new Squirrel();
engine.scene.add(squirrel.group);

// Find a pleasant dry spawn near the origin.
function findSpawn() {
  for (let r = 0; r < 240; r += 6) {
    for (let a = 0; a < 6.28; a += 0.7) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h > WORLD.waterLevel + 1.5 && terrainSlope(x, z) < 0.4) return new THREE.Vector3(x, h, z);
    }
  }
  return new THREE.Vector3(0, terrainHeight(0, 0), 0);
}
const spawn = findSpawn();
const player = new Controller(world);
player.position.copy(spawn);
world.update(player.position);
world.buildAllPending(); // full first load happens under the veil

// --- wordless onboarding -------------------------------------------------
const veil = document.getElementById('veil');
const hint = document.getElementById('hint');
let started = false, interacted = false;
function start() {
  if (started) return;
  started = true;
  veil.classList.add('hidden');
  setTimeout(() => { if (!interacted) hint.classList.add('show'); }, 1400);
}
function interact() {
  interacted = true;
  hint.classList.add('gone');
}
for (const ev of ['keydown', 'pointerdown', 'touchstart', 'wheel']) {
  window.addEventListener(ev, interact, { once: true });
}

// --- screenshot pose hooks ----------------------------------------------
const cmd = (location.hash || '').replace('#', '');
function applyCmd() {
  if (cmd === 'glide' || cmd === 'air') {
    player.position.y += 22; player.state = 'air';
    player.velocity.set(0, 1, 15); player.pitch = -0.12;
    camera.distance = 4.2; camera.pitch = 0.06;
  } else if (cmd === 'swim') {
    // drop the player into the nearest water body
    let found = null;
    for (let r = 0; r < 400 && !found; r += 8)
      for (let a = 0; a < 6.28; a += 0.5) {
        const x = spawn.x + Math.cos(a) * r, z = spawn.z + Math.sin(a) * r;
        if (terrainHeight(x, z) < WORLD.waterLevel - 0.5) { found = new THREE.Vector3(x, WORLD.waterLevel, z); break; }
      }
    if (found) { player.position.copy(found); player.state = 'swim'; world.update(player.position); world.buildAllPending(); }
  } else if (cmd === 'vista' || cmd === 'high') {
    camera.distance = 11; camera.pitch = 0.15;
  } else if (cmd === 'face') {
    camera.yaw = Math.PI; camera.pitch = 0.05; camera.distance = 3.0;
  } else if (cmd === 'climb') {
    let tree = null, best = Infinity;
    for (const tr of world.activeTrees) {
      const d = (tr.x - spawn.x) ** 2 + (tr.z - spawn.z) ** 2;
      if (d < best) { best = d; tree = tr; }
    }
    if (tree) {
      player.position.set(tree.x, tree.baseY + tree.height * 0.45, tree.z + tree.trunkRadius + 0.4);
      player.state = 'climb'; player.climbTree = tree;
      camera.distance = 4.4; camera.yaw = Math.PI; camera.pitch = 0.1;
    }
  }
}
applyCmd();

let auto = cmd === 'auto' || cmd === 'run';

// Scripted self-test: run at a tree, scale it, leap, glide. Logs a timeline so
// the movement chain can be verified headlessly.
let testT = 0, testTree = null, lastState = null;
function runTest(dt) {
  testT += dt;
  const p = player;
  if (testT < 0.3) { input.move.set(0, 0); }
  else if (testT < 0.4 && !testTree) {
    let best = Infinity;
    for (const tr of world.activeTrees) {
      const d = (tr.x - p.position.x) ** 2 + (tr.z - p.position.z) ** 2;
      if (d < best && d > 4) { best = d; testTree = tr; }
    }
    if (testTree) camera.yaw = Math.atan2(testTree.x - p.position.x, testTree.z - p.position.z);
  } else if (testT < 2.4) { input.move.set(0, 1); }       // run at tree → auto-climb
  else if (testT < 3.6) { input.move.set(0, 1); }          // climb up
  else if (testT < 3.7) { input._setAction(true); }        // leap
  else if (testT < 3.8) { input._setAction(false); input.move.set(0, 0.2); }
  else { input.move.set(0.15, 0.4); }                       // glide & gently steer
  if (p.state !== lastState) {
    console.warn(`T+${testT.toFixed(2)} ${lastState} -> ${p.state} pos=${p.position.toArray().map(v=>v.toFixed(1))} spd=${p.speed.toFixed(1)}`);
    lastState = p.state;
  }
  if (testT - (runTest._s || 0) > 0.5) {
    runTest._s = testT;
    console.warn(`  · T+${testT.toFixed(1)} [${p.state}] y=${p.position.y.toFixed(1)} spd=${p.speed.toFixed(1)} vy=${p.velocity.y.toFixed(1)}`);
  }
}

// Runtime quality adapter: if the framerate sags, step down gracefully.
// Disabled during scripted screenshot poses so captures stay full-quality.
let _fa = 0, _ff = 0, _qstep = 0;
function adapt(dt) {
  _fa += dt; _ff++;
  if (_fa < 2) return;
  const fps = _ff / _fa; _fa = 0; _ff = 0;
  if (fps < 40 && _qstep < 3) {
    _qstep++;
    if (_qstep === 1) engine.renderer.setPixelRatio(1);
    else if (_qstep === 2) { engine.bloom.strength = 0.28; WORLD.viewChunks = Math.max(3, WORLD.viewChunks - 1); }
    else if (_qstep === 3) { sky.sun.shadow.mapSize.set(1024, 1024); sky.sun.shadow.map?.dispose?.(); sky.sun.shadow.map = null; }
  }
}

let tPrev = null;
function frame(now) {
  if (tPrev === null) tPrev = now;
  let dt = (now - tPrev) / 1000;
  tPrev = now;
  dt = Math.min(0.05, Math.max(0, dt)); // guard against bad first-frame deltas
  const t = now / 1000;
  if (!cmd) adapt(dt);

  if (auto) { input.move.set(0, 1); } // drive forward for run screenshots
  if (cmd === 'test') runTest(dt);

  camera.updateLook(dt);
  const anim = player.update(dt, input, camera);
  player.applyTransform(squirrel.group, dt);
  squirrel.update(dt, anim);
  camera.follow(dt, player);

  world.update(player.position);
  world.update_anim(t);
  water.update(t, engine.camera.position);
  particles.update(t, engine.camera.position);
  sky.update(player.position, engine.camera.position);

  engine.render();
  if (!started && now > 150) start();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__GAME = {
  engine, world, sky, player, camera, squirrel, input,
  debugInfo() {
    return {
      ready: true,
      state: player.state,
      pos: player.position.toArray().map((v) => +v.toFixed(1)),
      speed: +player.speed.toFixed(2),
      chunks: world.chunks.size,
      trees: world.activeTrees.length,
      calls: engine.renderer.info.render.calls,
    };
  },
};
