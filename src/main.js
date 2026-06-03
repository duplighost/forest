import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { Ambience } from './core/Audio.js';
import { SkySystem } from './world/Sky.js';
import { World } from './world/World.js';
import { Water } from './world/Water.js';
import { Particles } from './world/Particles.js';
import { Critters } from './world/Critters.js';
import { FX } from './world/FX.js';
import { Backdrop } from './world/Backdrop.js';
import { Weather } from './world/Weather.js';
import { Wildlife } from './world/Wildlife.js';
import { Fireflies } from './world/Fireflies.js';
import { Footprints } from './world/Footprints.js';
import { snowAt } from './world/Biome.js';
import { terrainHeight, terrainSlope } from './world/Terrain.js';
import { seasonIndex, leafSeason } from './world/Biome.js';
import { FollowCamera } from './player/FollowCamera.js';
import { Squirrel } from './player/Squirrel.js';
import { Controller } from './player/Controller.js';
import { windUniforms } from './world/TreeFactory.js';
import { WORLD, CAMERA } from './config.js';

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
const backdrop = new Backdrop(engine.scene);
const weather = new Weather(engine.scene, { drops: LOW ? 1400 : 2600 });
const world = new World(engine.scene);
const water = new Water(engine.scene, sky.sunDir);
const particles = new Particles(engine.scene, LOW ? 170 : 320);
const critters = new Critters(engine.scene, LOW ? 4 : 7);
const wildlife = new Wildlife(engine.scene, LOW ? { flocks: 1, deer: 3 } : { flocks: 2, deer: 5 });
const fireflies = new Fireflies(engine.scene, LOW ? 80 : 130);
const footprints = new Footprints(engine.scene);
const fx = new FX(engine.scene);
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
const ambience = new Ambience();
function interact() {
  interacted = true;
  hint.classList.add('gone');
  ambience.start();
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
    camera.distance = 5.0; camera.pitch = 0.55;
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
  } else if (cmd === 'horizon') {
    player.position.y += 26; player.state = 'air'; player.velocity.set(0, 0, 10);
    camera.yaw = Math.atan2(-sky.sunDir.x, -sky.sunDir.z); // look away from sun
    camera.pitch = 0.08; camera.distance = 9;
  } else if (cmd === 'sun') {
    camera.yaw = Math.atan2(sky.sunDir.x, sky.sunDir.z);
    camera.pitch = 0.0; camera.distance = 7;
  } else if (['dawn', 'noon', 'dusk', 'night'].includes(cmd)) {
    sky.setTime({ dawn: 0.275, noon: 0.5, dusk: 0.71, night: 0.0 }[cmd]);
    sky.dayLength = 1e9;
    player.position.y += 30; player.state = 'air'; player.velocity.set(0, 0, 4);
    camera.yaw = 2.3; camera.pitch = 0.05; camera.distance = 10;
  } else if (['spring', 'summer', 'autumn', 'winter'].includes(cmd)) {
    const target = { spring: 0, summer: 1, autumn: 2, winter: 3 }[cmd];
    let found = null;
    for (let r = 0; r < 3500 && !found; r += 36)
      for (let a = 0; a < 6.28; a += 0.25) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (seasonIndex(x, z) === target && terrainHeight(x, z) > WORLD.waterLevel + 1) { found = new THREE.Vector3(x, terrainHeight(x, z), z); break; }
      }
    if (found) {
      player.position.copy(found); world.update(found); world.buildAllPending();
      player.position.y += 26; player.state = 'air'; player.velocity.set(0, 0, 4);
      camera.yaw = 2.1; camera.pitch = 0.16; camera.distance = 10;
      sky.setTime(0.32); sky.dayLength = 1e9;
    }
  } else if (['rain', 'storm', 'cloudy', 'snow'].includes(cmd)) {
    if (cmd === 'snow') { // place in a winter biome
      let found = null;
      for (let r = 0; r < 3500 && !found; r += 36)
        for (let a = 0; a < 6.28; a += 0.25) {
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          if (seasonIndex(x, z) === 3 && terrainHeight(x, z) > WORLD.waterLevel + 1) { found = new THREE.Vector3(x, terrainHeight(x, z), z); break; }
        }
      if (found) { player.position.copy(found); world.update(found); world.buildAllPending(); }
      weather.snowing = 1;
    }
    weather._cloudTarget = weather.cloudiness = cmd === 'cloudy' ? 0.72 : 0.95;
    weather._wetTarget = weather.wetness = cmd === 'cloudy' ? 0 : (cmd === 'storm' ? 1.0 : 0.8);
    weather._timer = 1e9;
    player.position.y += 22; player.state = 'air'; player.velocity.set(0, 0, 5);
    camera.yaw = 2.1; camera.pitch = 0.12; camera.distance = 10;
    sky.setTime(0.4); sky.dayLength = 1e9;
  } else if (cmd === 'ripples') {
    let found = null;
    for (let r = 0; r < 400 && !found; r += 8)
      for (let a = 0; a < 6.28; a += 0.5) {
        const x = spawn.x + Math.cos(a) * r, z = spawn.z + Math.sin(a) * r;
        if (terrainHeight(x, z) < WORLD.waterLevel - 0.8) { found = new THREE.Vector3(x, WORLD.waterLevel, z); break; }
      }
    if (found) { player.position.copy(found); player.state = 'swim'; world.update(found); world.buildAllPending(); }
    weather._cloudTarget = weather.cloudiness = 0.95; weather._wetTarget = weather.wetness = 1.0; weather.snowing = 0; weather._timer = 1e9;
    camera.distance = 6.5; camera.pitch = 0.6; sky.setTime(0.4); sky.dayLength = 1e9;
  } else if (cmd === 'tracks') {
    let found = null;
    for (let r = 0; r < 3500 && !found; r += 36)
      for (let a = 0; a < 6.28; a += 0.25) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (seasonIndex(x, z) === 3 && terrainHeight(x, z) > WORLD.waterLevel + 1 && terrainSlope(x, z) < 0.35) { found = new THREE.Vector3(x, terrainHeight(x, z), z); break; }
      }
    if (found) { player.position.copy(found); player.state = 'ground'; world.update(found); world.buildAllPending(); }
    camera.distance = 8; camera.pitch = 0.62; camera.yaw = 0; sky.setTime(0.45); sky.dayLength = 1e9;
  } else if (cmd === 'fireflies') {
    sky.setTime(0.95); sky.dayLength = 1e9; camera.distance = 7; camera.pitch = 0.04;
  } else if (cmd === 'deer') {
    camera.distance = 28; camera.pitch = 0.5; camera.yaw = 0.4;
    sky.setTime(0.46); sky.dayLength = 1e9;
  } else if (cmd === 'face') {
    camera.yaw = Math.PI; camera.pitch = 0.05; camera.distance = 3.0;
    sky.setTime(0.5); sky.dayLength = 1e9; // high sun, not behind the squirrel
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

let auto = cmd === 'auto' || cmd === 'run' || cmd === 'tracks';

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

// Project the sun to screen space to drive the light-shaft pass; fade it out
// as you look away from the sun.
const _sunWorld = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
function updateGodRays() {
  _sunWorld.copy(engine.camera.position).addScaledVector(sky.sunDir, 1000);
  _sunWorld.project(engine.camera);
  engine.camera.getWorldDirection(_camFwd);
  const facing = _camFwd.dot(sky.sunDir);
  const onScreen = _sunWorld.z < 1 && Math.abs(_sunWorld.x) < 1.6 && Math.abs(_sunWorld.y) < 1.6;
  const inten = onScreen ? THREE.MathUtils.smoothstep(facing, 0.3, 0.85) * 0.5 * (1 - weather.cloudiness * 0.85) : 0;
  const u = engine.godrays.uniforms;
  u.uSun.value.set(_sunWorld.x * 0.5 + 0.5, _sunWorld.y * 0.5 + 0.5);
  u.uIntensity.value += (inten - u.uIntensity.value) * 0.08;
}

let tPrev = null;
let _trailT = 0;
let _leafT = 0;
let deerFramed = false;
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
  const prevState = player.state;
  const anim = player.update(dt, input, camera);
  // Movement juice: react to state changes with little particle bursts.
  if (player.state !== prevState) {
    if (player.state === 'swim') fx.splash(player.position);
    else if (player.state === 'ground' && (prevState === 'air' || prevState === 'swim')) fx.dust(player.position);
    else if (player.state === 'climb') fx.leaves(player.position);
  }
  player.applyTransform(squirrel.group, dt);
  squirrel.update(dt, anim);
  camera.follow(dt, player);
  footprints.update(dt, player, snowAt(player.position.x, player.position.z) > 0.5);
  // kick up dust when sprinting along the ground
  _trailT -= dt;
  if (player.state === 'ground' && player.speed > 13 && _trailT <= 0) {
    fx.footDust(player.position); _trailT = 0.06;
  }
  fx.update(dt);

  world.update(player.position);
  world.update_anim(t);
  water.update(t, engine.camera.position);
  particles.update(t, engine.camera.position);
  // Wind gusts: an irregular swell that bends grass & trees and carries leaves.
  const gust = Math.max(0, Math.sin(t * 0.23) * 0.5 + Math.sin(t * 0.11 + 1.3) * 0.34 + Math.sin(t * 0.063) * 0.3);
  windUniforms.uGust.value = gust * 0.85;
  _leafT -= dt;
  if (gust > 0.55 && _leafT <= 0 && player.state !== 'swim') {
    _leafT = 0.12;
    const wx = -7 * gust, wz = 3 * gust;
    const col = leafSeason(player.position.x, player.position.z, Math.random);
    fx.windLeaf(player.position.x + (Math.random() - 0.5) * 24, player.position.y + 5 + Math.random() * 8,
      player.position.z + (Math.random() - 0.5) * 24, col, wx, wz);
  }

  critters.update(dt, player.position);
  wildlife.update(dt, player.position, t);
  fireflies.update(dt, t, player.position, sky.dayAmount);
  if (cmd === 'deer' && !deerFramed) {
    const d = wildlife.deer[0];
    d.pos.set(player.position.x, terrainHeight(player.position.x, player.position.z + 18), player.position.z + 18);
    d.placed = true; d.heading = Math.PI; d.graze = 1;
    camera.yaw = 0; camera.distance = 5.5; camera.pitch = 0.14; // look +z (sun behind)
    deerFramed = true;
  }
  backdrop.update(engine.camera.position);
  weather.update(dt, engine.camera.position, sky.cloudTint);
  sky.update(dt, player.position, engine.camera.position, weather.cloudiness);
  // keep the water reflection and foliage glow in sync with the moving sun
  water.uniforms.uSunDir.value.copy(sky.sunDir);
  water.uniforms.uRain.value = weather.wetness * (1 - weather.snowing);
  windUniforms.uSunView.value.copy(sky.sunDir).transformDirection(engine.camera.matrixWorldInverse);
  windUniforms.uGlowAmt.value = 1.35 * sky.dayAmount * (1 - weather.cloudiness * 0.7);
  updateGodRays();
  ambience.update(dt, player.state, player.speed, weather.wetness);

  // Speed rush: widen the FOV a touch as you pick up glide speed.
  const targetFov = CAMERA.fov + THREE.MathUtils.clamp((player.speed - 12) / 18, 0, 1) * 11;
  if (Math.abs(engine.camera.fov - targetFov) > 0.01) {
    engine.camera.fov += (targetFov - engine.camera.fov) * (1 - Math.exp(-3 * dt));
    engine.camera.updateProjectionMatrix();
  }

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
      time: +sky.time.toFixed(3),
      sunElev: +(sky.sunElev ?? 0).toFixed(1),
      dayAmount: +(sky.dayAmount ?? 0).toFixed(2),
      glide: +squirrel.glide.toFixed(2),
      pos: player.position.toArray().map((v) => +v.toFixed(1)),
      speed: +player.speed.toFixed(2),
      chunks: world.chunks.size,
      trees: world.activeTrees.length,
      calls: engine.renderer.info.render.calls,
    };
  },
};
