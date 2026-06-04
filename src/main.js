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
import { PondLife } from './world/PondLife.js';
import { Streaks } from './world/Streaks.js';
import { Wisp } from './world/Wisp.js';
import { Aurora } from './world/Aurora.js';
import { ShootingStars } from './world/ShootingStars.js';
import { GroundFog } from './world/GroundFog.js';
import { Hollow } from './world/Hollow.js';
import { snowAt, flowerAt } from './world/Biome.js';
import { terrainHeight, terrainSlope } from './world/Terrain.js';
import { seasonIndex, leafSeason, seasonAt } from './world/Biome.js';
import { hash2 } from './world/Noise.js';
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
const aurora = new Aurora(engine.scene);
const shootingStars = new ShootingStars(engine.scene, LOW ? 2 : 3);
const groundFog = new GroundFog(engine.scene);
const weather = new Weather(engine.scene, { drops: LOW ? 1400 : 2600 });
const world = new World(engine.scene);
const water = new Water(engine.scene, sky.sunDir);
const particles = new Particles(engine.scene, LOW ? 90 : 150);
const critters = new Critters(engine.scene, LOW ? 7 : 14);
const wildlife = new Wildlife(engine.scene, LOW ? { flocks: 1, deer: 3 } : { flocks: 2, deer: 5 });
const fireflies = new Fireflies(engine.scene, LOW ? 80 : 130);
const footprints = new Footprints(engine.scene);
const fx = new FX(engine.scene);
const pondlife = new PondLife(engine.scene, fx);
const streaks = new Streaks(engine.scene, LOW ? 50 : 90);
const wisp = new Wisp(engine.scene);
const hollow = new Hollow(engine.scene);
const _vdir = new THREE.Vector3();
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

// --- idle breathing vignette + wordless photo mode ----------------------
const idleEl = document.getElementById('idle');
const photoEl = document.getElementById('photo');
const shutterEl = document.getElementById('shutter');
const flashEl = document.getElementById('flash');
const cozyEl = document.getElementById('cozy');
let idleT = 0, photoMode = false, captureNext = false;
let restAmt = 0;   // 0..1 how curled-up-and-resting in a hollow the player is
function setPhoto(on) {
  photoMode = on;
  photoEl.classList.toggle('show', on);
  shutterEl.classList.toggle('show', on);
  if (on) { hint.classList.add('gone'); idleEl.classList.remove('show'); }
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') setPhoto(!photoMode);
  else if (e.code === 'Enter' && photoMode) captureNext = true;
});
shutterEl.addEventListener('click', () => { captureNext = true; });
// three-finger tap toggles photo mode on touch
window.addEventListener('touchstart', (e) => { if (e.touches.length >= 3) setPhoto(!photoMode); });

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
  } else if (cmd === 'giant') {
    let found = null;
    for (let r = 0; r < 14 && !found; r++)
      for (let cx2 = -r; cx2 <= r && !found; cx2++)
        for (let cz2 = -r; cz2 <= r && !found; cz2++) {
          if (Math.max(Math.abs(cx2), Math.abs(cz2)) !== r) continue;
          if (hash2(cx2, cz2, 80) >= 0.12) continue;
          const wx = cx2 * 64 + (0.25 + hash2(cx2, cz2, 81) * 0.5) * 64;
          const wz = cz2 * 64 + (0.25 + hash2(cx2, cz2, 82) * 0.5) * 64;
          const h = terrainHeight(wx, wz);
          if (h > WORLD.waterLevel + 1 && terrainSlope(wx, wz) < 0.42) found = new THREE.Vector3(wx, h, wz);
        }
    if (found) {
      player.position.set(found.x + 16, terrainHeight(found.x + 16, found.z + 11), found.z + 11);
      world.update(player.position); world.buildAllPending();
      camera.yaw = Math.atan2(found.x - player.position.x, found.z - player.position.z);
      camera.pitch = -0.12; camera.distance = 9; sky.setTime(0.34); sky.dayLength = 1e9;
      engine.bloom.enabled = false; engine.godrays.enabled = false; engine.grade.enabled = false;
      engine.scene.fog.near = 9000; engine.scene.fog.far = 9001; particles.points.visible = false;
    }
  } else if (cmd === 'thumb') {
    // clean, pretty card thumbnail: no fog haze, keep bloom/grade, golden light
    engine.scene.fog.near = 6000; engine.scene.fog.far = 6001;
    sky.setTime(0.33); sky.dayLength = 1e9;
    camera.yaw = 2.35; camera.pitch = 0.16; camera.distance = 4.6;
    player.facing = 0.6;
  } else if (cmd === 'model') {
    // clean model inspection: no fog, no post wash, no atmosphere particles
    engine.bloom.enabled = false; engine.godrays.enabled = false; engine.grade.enabled = false;
    engine.scene.fog.near = 9000; engine.scene.fog.far = 9001;
    particles.points.visible = false; fireflies.points.visible = false;
    sky.setTime(0.42); sky.dayLength = 1e9;
    camera.yaw = Math.PI; camera.pitch = 0.05; camera.distance = 2.7;
    player.facing = 0;
  } else if (cmd === 'pose') {
    // standing, gameplay-distance 3/4, camera angled down so ground (not bright
    // sky) is behind the squirrel
    sky.setTime(0.5); sky.dayLength = 1e9;
    camera.yaw = 0.6; camera.pitch = 0.32; camera.distance = 5.5;
    player.facing = 0;
  } else if (cmd === 'face') {
    sky.setTime(0.5); sky.dayLength = 1e9;
    camera.yaw = Math.PI; camera.pitch = 0.28; camera.distance = 4.0;
    player.facing = 0;
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
  } else if (cmd === 'wisp') {
    // park the spirit just ahead, warm low light so the glow + trail read
    sky.setTime(0.66); sky.dayLength = 1e9;
    const wz = spawn.z + 7;
    wisp.park(spawn.x, terrainHeight(spawn.x, wz) + 2.1, wz);
    camera.yaw = 0; camera.pitch = 0.05; camera.distance = 5.4;
    player.facing = 0;
  } else if (cmd === 'pond') {
    // stand on the bank of the nearest pond, looking across the water
    let found = null, fc = null;
    for (let r = 8; r < 360 && !found; r += 8)
      for (let a = 0; a < 6.28; a += 0.35) {
        const x = spawn.x + Math.cos(a) * r, z = spawn.z + Math.sin(a) * r;
        if (terrainHeight(x, z) < WORLD.waterLevel - 1.4) { found = new THREE.Vector3(x, WORLD.waterLevel, z); break; }
      }
    if (found) {
      // back off onto dry land toward the origin and look at the water
      const dir = new THREE.Vector3(spawn.x - found.x, 0, spawn.z - found.z).normalize();
      for (let s = 4; s < 26; s += 1.5) {
        const px = found.x + dir.x * s, pz = found.z + dir.z * s;
        if (terrainHeight(px, pz) > WORLD.waterLevel + 0.6) { fc = new THREE.Vector3(px, terrainHeight(px, pz), pz); break; }
      }
      const p = fc || found;
      player.position.copy(p); world.update(p); world.buildAllPending();
      pondlife.update(0.016, 0, p); pondlife.update(0.016, 0, p);
      camera.yaw = Math.atan2(found.x - p.x, found.z - p.z);
      camera.pitch = 0.34; camera.distance = 6.5; sky.setTime(0.4); sky.dayLength = 1e9;
    }
  } else if (cmd === 'aurora') {
    // stand in a winter region at midnight and look up at the night sky
    let found = null;
    for (let r = 0; r < 3500 && !found; r += 36)
      for (let a = 0; a < 6.28; a += 0.25) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (seasonIndex(x, z) === 3 && terrainHeight(x, z) > WORLD.waterLevel + 1.5 && terrainSlope(x, z) < 0.35) {
          found = new THREE.Vector3(x, terrainHeight(x, z), z); break;
        }
      }
    if (found) {
      player.position.copy(found); world.update(found); world.buildAllPending();
      camera.yaw = 0.7; camera.pitch = -0.55; camera.distance = 8;  // low cam, look up
      sky.setTime(0.0); sky.dayLength = 1e9;
    }
  } else if (cmd === 'fog') {
    // dawn mist pooling in a low valley by the water
    let found = null;
    for (let r = 8; r < 380 && !found; r += 8)
      for (let a = 0; a < 6.28; a += 0.35) {
        const x = spawn.x + Math.cos(a) * r, z = spawn.z + Math.sin(a) * r;
        if (terrainHeight(x, z) < WORLD.waterLevel - 1.0) { found = new THREE.Vector3(x, WORLD.waterLevel, z); break; }
      }
    if (found) {
      const dir = new THREE.Vector3(spawn.x - found.x, 0, spawn.z - found.z).normalize();
      let p = found, bestH = -1e9;
      for (let s = 10; s < 40; s += 2) {       // a ridge vantage above the valley
        const px = found.x + dir.x * s, pz = found.z + dir.z * s;
        const h = terrainHeight(px, pz);
        if (h > WORLD.waterLevel + 0.4 && h > bestH) { bestH = h; p = new THREE.Vector3(px, h, pz); }
      }
      player.position.copy(p); world.update(p); world.buildAllPending();
      camera.yaw = Math.atan2(found.x - p.x, found.z - p.z);
      camera.pitch = 0.3; camera.distance = 8; sky.setTime(0.235); sky.dayLength = 1e9;
    }
  } else if (cmd === 'hollow') {
    // find the nearest giant (replaying its placement test) and curl up there
    let g = null, best = 1e9; const size = WORLD.chunkSize;
    for (let cz = -6; cz <= 6; cz++) for (let cx = -6; cx <= 6; cx++) {
      if (hash2(cx, cz, 80) >= 0.12) continue;
      const wx = cx * size + (0.25 + hash2(cx, cz, 81) * 0.5) * size;
      const wz = cz * size + (0.25 + hash2(cx, cz, 82) * 0.5) * size;
      const h = terrainHeight(wx, wz);
      if (h > WORLD.waterLevel + 1 && terrainSlope(wx, wz) < 0.42) {
        const d = wx * wx + wz * wz;
        if (d < best) { best = d; g = new THREE.Vector3(wx, h, wz); }
      }
    }
    if (g) {
      const ang = Math.atan2(-g.x, -g.z);   // origin-ward side of the trunk
      player.position.set(g.x + Math.sin(ang) * 1.6, g.y, g.z + Math.cos(ang) * 1.6);
      world.update(player.position); world.buildAllPending();
      camera.yaw = Math.atan2(g.x - player.position.x, g.z - player.position.z);
      camera.pitch = 0.1; camera.distance = 4.4; sky.setTime(0.72); sky.dayLength = 1e9;
      restAmt = 1;
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
let _flowerT = 0;
let _dandeT = 0;
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
    if (player.state === 'swim') { fx.splash(player.position); camera.addShake(0.3); }
    else if (player.state === 'ground' && (prevState === 'air' || prevState === 'swim')) fx.dust(player.position);
    else if (player.state === 'climb') { fx.leaves(player.position); camera.addShake(0.22); }
  }
  // landing thump scaled to impact, + a faint rumble while gliding fast
  if (anim.land > 0) camera.addShake(0.25 + anim.land * 0.55);
  if (player.state === 'air' && player.speed > 21) camera.addShake(dt * (player.speed - 21) / 9 * 0.5);
  player.applyTransform(squirrel.group, dt);
  // Cosy hollow: curl up to rest at the base of a giant tree when you hold still.
  let giant = null, gd = 1e9;
  for (const tr of world.activeTrees) {
    if (!tr.giant) continue;
    const d = Math.hypot(tr.x - player.position.x, tr.z - player.position.z);
    if (d < gd) { gd = d; giant = tr; }
  }
  let hollowProx = 0, atHollow = false;
  if (giant) {
    hollowProx = THREE.MathUtils.clamp(1 - (gd - giant.trunkRadius) / 3.5, 0, 1);
    atHollow = gd < giant.trunkRadius + 2.4 && player.state === 'ground' &&
      Math.abs(player.position.y - giant.baseY) < 2.6;
  }
  const stillEnough = player.speed < 1.3 && input.move.lengthSq() < 0.01 && !input.action;
  const wantRest = atHollow && stillEnough && started;
  restAmt += ((wantRest ? 1 : 0) - restAmt) * (1 - Math.exp(-(wantRest ? 1.3 : 3.0) * dt));
  anim.rest = restAmt;
  squirrel.update(dt, anim);
  camera.follow(dt, player);
  footprints.update(dt, player, snowAt(player.position.x, player.position.z) > 0.5);
  // kick up dust when sprinting along the ground
  _trailT -= dt;
  if (player.state === 'ground' && player.speed > 13 && _trailT <= 0) {
    fx.footDust(player.position); _trailT = 0.06;
  }
  // running through flowers kicks up petals and a soft tinkle
  _flowerT -= dt;
  if (player.state === 'ground' && player.speed > 4 && _flowerT <= 0 &&
      flowerAt(player.position.x, player.position.z) > 0.5) {
    _flowerT = 0.15;
    fx.petals(player.position);
    if (Math.random() < 0.55) ambience.flowerChime();
  }
  fx.update(dt);
  _vdir.copy(player.velocity); if (_vdir.lengthSq() > 0.01) _vdir.normalize();
  streaks.update(dt, engine.camera.position, _vdir, player.speed, player.state === 'air');

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
  // brushing through grass on dry ground puffs dandelion seeds into the wind
  _dandeT -= dt;
  if (player.state === 'ground' && player.speed > 5 && _dandeT <= 0 &&
      snowAt(player.position.x, player.position.z) < 0.4 &&
      terrainHeight(player.position.x, player.position.z) > WORLD.waterLevel + 0.5 &&
      Math.random() < 0.5) {
    _dandeT = 0.5 + Math.random() * 0.6;
    fx.dandelion(player.position.x, player.position.y + 0.3, player.position.z, -6 * gust - 1, 3 * gust);
    if (Math.random() < 0.5) ambience.puff();
  }

  critters.update(dt, player.position, player.speed);
  wildlife.update(dt, player.position, t);
  pondlife.update(dt, t, player.position);
  fireflies.update(dt, t, player.position, sky.dayAmount);
  // glowing wisp to chase — leads you on, darts away when you catch up
  const wInfo = wisp.update(dt, t, player.position, sky.dayAmount);
  if (wInfo.darted) fx.sparkle(wisp.pos, wisp.col.getHex());
  const season = seasonAt(player.position.x, player.position.z);
  // glowing flora lights up at night
  world.scatter.glowMat.emissiveIntensity = THREE.MathUtils.clamp(1 - sky.dayAmount * 1.3, 0, 1) * 2.4;
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
  // aurora: gentle ribbons that fade in on a clear winter night
  const winter = THREE.MathUtils.smoothstep(snowAt(player.position.x, player.position.z), 0.25, 0.8);
  const nightAmt = THREE.MathUtils.clamp(1 - sky.dayAmount * 1.4, 0, 1);
  aurora.update(engine.camera.position, t, winter * nightAmt * (1 - weather.cloudiness * 0.7));
  // shooting stars streak across clear nights
  shootingStars.update(dt, engine.camera.position, nightAmt, 1 - weather.cloudiness);
  // ground mist pools in the valleys when the sun is low (dawn / dusk / night)
  const lowSun = 1 - THREE.MathUtils.smoothstep(sky.sunElev ?? 0, -4, 12);
  groundFog.update(engine.camera.position, t, lowSun * (1 - weather.wetness * 0.5));
  // keep the water reflection and foliage glow in sync with the moving sun
  water.uniforms.uSunDir.value.copy(sky.sunDir);
  water.uniforms.uRain.value = weather.wetness * (1 - weather.snowing);
  windUniforms.uSunView.value.copy(sky.sunDir).transformDirection(engine.camera.matrixWorldInverse);
  windUniforms.uGlowAmt.value = 1.35 * sky.dayAmount * (1 - weather.cloudiness * 0.7);
  updateGodRays();
  ambience.update(dt, player.state, player.speed, weather.wetness, season);
  ambience.glide(dt, player.state === 'air', player.speed);
  ambience.wisp(dt, wInfo.near);
  if (wInfo.darted) ambience.wispDart();
  // cosy hollow: nook glow, warm music swell, vignette, drifting sleep motes
  hollow.update(dt, giant && hollowProx > 0.02 ? giant : null, player.position, hollowProx, restAmt);
  ambience.setCozy(restAmt);
  cozyEl.style.opacity = (restAmt * 0.92).toFixed(3);
  if (restAmt > 0.55 && Math.random() < dt * 2.2)
    fx.sparkle({ x: player.position.x + (Math.random() - 0.5), y: player.position.y + 0.7, z: player.position.z + (Math.random() - 0.5) }, 0xffd9a0);

  // Speed rush: widen the FOV a touch as you pick up glide speed.
  const targetFov = CAMERA.fov + THREE.MathUtils.clamp((player.speed - 10) / 18, 0, 1) * 15;
  if (Math.abs(engine.camera.fov - targetFov) > 0.01) {
    engine.camera.fov += (targetFov - engine.camera.fov) * (1 - Math.exp(-3 * dt));
    engine.camera.updateProjectionMatrix();
  }

  engine.render();

  // photo-mode capture (render is fresh in this tick)
  if (captureNext) {
    captureNext = false;
    try {
      const a = document.createElement('a');
      a.href = engine.renderer.domElement.toDataURL('image/png');
      a.download = 'glide-' + Date.now() + '.png';
      a.click();
      flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
    } catch (e) { /* ignore */ }
  }

  // idle breathing vignette (not while moving or in photo mode)
  if (!cmd) {
    const activeNow = player.speed > 0.6 || input.move.lengthSq() > 0.01 || input.action || photoMode || !started || restAmt > 0.05;
    if (activeNow) { idleT = 0; if (!photoMode) idleEl.classList.remove('show'); }
    else { idleT += dt; if (idleT > 5) idleEl.classList.add('show'); }
  }

  if (!started && now > 150) start();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__GAME = {
  engine, world, sky, player, camera, squirrel, input, critters, wisp, aurora, shootingStars, groundFog, hollow,
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
