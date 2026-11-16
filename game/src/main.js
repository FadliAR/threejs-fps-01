// Harbour Line — boot and render loop. The simulation runs at a fixed
// 60 Hz step, decoupled from rendering; this file only owns the renderer,
// input, the camera, the viewmodel and the bomb prop.
import * as THREE from 'three';
import { TICK, WEAPONS, ROUND, clamp } from './config.js';
import { buildMap } from './map.js';
import { createSim, startMatch, stepSim, buyWeapon } from './sim.js';
import { buildViewmodel } from './actors.js';
import { Sfx } from './audio.js';
import { Hud } from './hud.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 1);
let rngState = (seed * 2654435761) >>> 0;
function rng() { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; }

// ---- renderer / scene ------------------------------------------------------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202a38);
scene.fog = new THREE.Fog(0x2a3542, 30, 95);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hemi = new THREE.HemisphereLight(0x8fa3bf, 0x2a2620, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 1.9);
sun.position.set(-28, 34, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
sun.shadow.camera.far = 120;
scene.add(sun);

const mapData = buildMap(scene);
const sfx = new Sfx();
const sim = createSim(scene, camera, mapData, sfx);
sim.map = mapData;
const hud = new Hud(document, (id) => buyWeapon(sim, id));
const viewmodel = buildViewmodel(camera);

// Bomb prop: a small case with a blinking light, shown when planted/dropped.
const bombGroup = new THREE.Group();
const bombCase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.3),
  new THREE.MeshLambertMaterial({ color: 0x22262b }));
bombCase.castShadow = true; bombGroup.add(bombCase);
const bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
bombLight.position.set(0, 0.16, 0); bombGroup.add(bombLight);
bombGroup.visible = false; bombGroup.scale.setScalar(1.5); scene.add(bombGroup);

// ---- input -----------------------------------------------------------------
const input = {
  forward: false, back: false, left: false, right: false,
  jump: false, crouch: false, fire: false, fireEdge: false,
  reload: false, grenade: false, grenadeEdge: false, defuse: false, ads: false,
};
const keys = {};
let locked = false;
let started = false;

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  syncKeys();
  if (e.code === 'KeyR') input.reload = true;
  if (e.code === 'KeyG') input.grenadeEdge = true;
  if (e.code === 'KeyB') hud.buyWanted = !hud.buyWanted;
  if (e.code.startsWith('Digit')) {
    const id = ['p9', 'kx9', 'vk7', 's1'][Number(e.code.slice(5)) - 1];
    if (id) switchWeapon(id);
  }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; syncKeys(); if (e.code === 'KeyR') input.reload = false; });
function syncKeys() {
  input.forward = !!keys.KeyW; input.back = !!keys.KeyS;
  input.left = !!keys.KeyA; input.right = !!keys.KeyD;
  input.jump = !!keys.Space; input.crouch = !!(keys.ControlLeft || keys.KeyC);
  input.defuse = !!keys.KeyE;
}
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!started) return;
  if (!locked) { lockPointer(); return; }
  if (e.button === 0) { input.fire = true; input.fireEdge = true; }
  if (e.button === 2) input.ads = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) input.fire = false;
  if (e.button === 2) input.ads = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!locked || !sim.player) return;
  sim.player.yaw -= e.movementX * 0.0022;
  sim.player.pitch = clamp(sim.player.pitch - e.movementY * 0.0022, -1.5, 1.5);
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
});
function lockPointer() {
  try { renderer.domElement.requestPointerLock(); } catch { /* headless: play on */ }
}
function switchWeapon(id) {
  const p = sim.player;
  if (!p || !p.alive || !p.owned.includes(id)) return;
  if (p.weapon === id) return;
  p.ammo[p.weapon] = { mag: p.mag, reserve: p.reserve };
  p.weapon = id;
  const saved = p.ammo[id] || { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  p.mag = saved.mag; p.reserve = saved.reserve;
  p.reloadUntil = 0;
  sfx.reload();
}

// ---- start / restart -------------------------------------------------------
const overlay = document.getElementById('overlay');
document.getElementById('play').addEventListener('click', () => {
  sfx.ensure();
  if (!started || sim.phase === 'over') {
    started = true;
    startMatch(sim, mapData);
    hud.buyWanted = true;
  }
  hud.hideOverlay();
  lockPointer();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- staging hooks for screenshots (real gameplay state, set in place) ----
window.__game = {
  sim,
  stage(name) {
    // Every stage starts from a fresh round so shots are clean and
    // repeatable: full teams, fresh bomb, no leftovers from the last stage.
    startMatch(sim, mapData);
    hud.hideOverlay();
    const p = sim.player;
    if (name === 'fight') {
      sim.phase = 'live'; sim.phaseT = 0; sim.roundTime = 87;
      p.weapon = 'vk7'; p.mag = 24; p.reserve = 90;
      p.pos.set(0, 0, 4); p.yaw = Math.PI + 0.12; p.pitch = 0.01;
      p.money = 3250;
      const foes = sim.actors.filter(a => a.kind === 'bot' && a.team === 'jackal' && a.alive).slice(0, 2);
      foes[0].pos.set(2.5, 0, 13); foes[0].yaw = 0; foes[0].target = p; foes[0].mode = 'engage'; foes[0].burstLeft = 4;
      if (foes[1]) { foes[1].pos.set(-3.5, 0, 15); foes[1].yaw = 0.3; foes[1].target = p; foes[1].mode = 'engage'; }
      const ally = sim.actors.find(a => a.kind === 'bot' && a.team === 'harbour' && a.alive);
      if (ally) { ally.pos.set(-2.5, 0, 1); ally.yaw = Math.PI; }
    } else if (name === 'buy') {
      sim.phase = 'buy'; sim.phaseT = 2; sim.roundTime = ROUND.roundSeconds;
      p.money = 5200; p.pos.set(0, 0, -4); p.yaw = Math.PI; p.pitch = 0;
      hud.buyWanted = true;
    } else if (name === 'site') {
      sim.phase = 'live'; sim.phaseT = 0; sim.roundTime = 41;
      sim.bomb.state = 'planted'; sim.bomb.site = 'A';
      sim.bomb.pos.set(26, 0, -15); sim.bomb.timer = 28;
      sim.banner = 'BOMB PLANTED AT SITE A — DEFUSE IT';
      p.pos.set(19, 0, -9); p.yaw = -0.86; p.pitch = -0.02; // face site A
      p.weapon = 'vk7'; p.mag = 18; p.reserve = 90;
      const foe = sim.actors.find(a => a.kind === 'bot' && a.team === 'jackal' && a.alive);
      if (foe) { foe.pos.set(23, 0, -12); foe.yaw = Math.PI * 0.75; foe.mode = 'hold'; foe.holdUntil = sim.time + 999; }
      // Pull the nearest teammate back so the site reads instead of a shoulder.
      const ally = sim.actors.find(a => a.kind === 'bot' && a.team === 'harbour' && a.alive);
      if (ally) { ally.pos.set(14, 0, -16); ally.yaw = -0.5; ally.mode = 'hold'; ally.holdUntil = sim.time + 999; }
    } else if (name === 'start') {
      sim.phase = 'buy'; sim.phaseT = 0;
      p.pos.set(0, 0, -4); p.yaw = Math.PI; p.pitch = 0;
      hud.buyWanted = true;
    }
    return true;
  },
  // Test helpers: the screenshot script drives these so every shot is a
  // real render of live gameplay (a shot fired, a view turned).
  fireOnce() {
    input.fire = true; input.fireEdge = true;
    setTimeout(() => { input.fire = false; }, 120);
  },
  look(dx, dy) {
    const p = sim.player;
    if (!p) return;
    p.yaw -= dx * 0.0022; p.pitch = clamp(p.pitch - dy * 0.0022, -1.5, 1.5);
  },
  state() {
    return {
      phase: sim.phase, round: sim.round, score: sim.score,
      hp: sim.player ? sim.player.hp : 0, money: sim.player ? sim.player.money : 0,
      alive: sim.actors.filter(a => a.alive).length, bomb: sim.bomb.state,
    };
  },
};
window.__errors = [];
addEventListener('error', (e) => window.__errors.push(String(e.message)));

// ---- main loop: fixed-step sim, decoupled render ---------------------------
let last = performance.now();
let acc = 0;
let frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (started && sim.phase !== 'menu' && sim.phase !== 'over') {
    acc += dt;
    let steps = 0;
    while (acc >= TICK && steps < 5) {
      stepSim(sim, TICK, input);
      acc -= TICK; steps++;
      input.fireEdge = false;
      input.grenadeEdge = false;
      input.reload = false;
    }
    if (steps === 5) acc = 0;
  }
  // Camera follows the player; the viewmodel rides the camera.
  const p = sim.player;
  if (p) {
    const bob = Math.hypot(p.vel.x, p.vel.z) > 0.5 ? Math.sin(p.stepPhase) * 0.02 : 0;
    camera.position.set(p.pos.x, p.pos.y + (p.crouch ? 1.08 : 1.62) + bob, p.pos.z);
    camera.rotation.set(p.pitch + p.recoil * 0.6, p.yaw, 0);
    viewmodel.group.position.z = -0.55 + p.recoil * 1.4;
    viewmodel.group.position.y = -0.25 + (p.ads ? 0.055 : 0) + bob * 0.5;
    viewmodel.group.position.x = 0.26 + (p.ads ? -0.13 : 0);
    if (sim.time - p.lastShot < 0.06) viewmodel.flashMat.opacity = 0.9;
    else viewmodel.flashMat.opacity = 0;
    // Bomb prop follows the sim.
    if (sim.bomb.state === 'planted' || sim.bomb.state === 'dropped') {
      bombGroup.visible = true;
      bombGroup.position.set(sim.bomb.pos.x, 0.12, sim.bomb.pos.z);
      bombLight.material.color.setHex(Math.floor(sim.time * 3) % 2 ? 0xff3b30 : 0x551111);
    } else {
      bombGroup.visible = false;
    }
  }
  hud.update(sim, p || { hp: 100, mag: 0, reserve: 0, weapon: 'p9', grenades: 0, money: 800, vel: { x: 0, z: 0 }, spreadBloom: 0, ads: false, defusing: 0 }, now / 1000);
  if (started && sim.phase === 'over' && overlay.hidden) {
    const won = sim.score.harbour > sim.score.jackal;
    hud.showOverlay(won ? 'HARBOUR HOLDS THE PIER' : 'JACKALS TAKE THE PIER',
      `Final score ${sim.score.harbour} — ${sim.score.jackal}. Your kills: ${p ? p.kills : 0}. Play again from round 1.`,
      'Play again');
  }
  renderer.render(scene, camera);
  if (++frames === 5) window.__ready = true;
}
requestAnimationFrame(frame);
