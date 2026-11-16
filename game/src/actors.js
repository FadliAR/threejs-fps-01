// Harbour Line — actors: the player controller and the bots.
// Movement uses acceleration + friction with per-axis AABB collision;
// bots walk waypoint routes, hold angles, engage on line of sight and
// react to gunfire noise. No allocations in the hot update paths:
// scratch vectors live at module scope.
import * as THREE from 'three';
import { PLAYER, BOT, clamp, hash01 } from './config.js';
import { hitscanShot } from './combat.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ray = new THREE.Raycaster();

// ---- collision -----------------------------------------------------------
export function collideCircle(pos, radius, colliders, height = 1.75) {
  // Axis-separated resolve against AABBs that overlap the actor's height band.
  for (const c of colliders) {
    if (c.maxY < 0.05 || c.minY > height) continue;
    if (pos.x + radius > c.minX && pos.x - radius < c.maxX &&
        pos.z + radius > c.minZ && pos.z - radius < c.maxZ) {
      const pushL = pos.x + radius - c.minX, pushR = c.maxX - (pos.x - radius);
      const pushB = pos.z + radius - c.minZ, pushF = c.maxZ - (pos.z - radius);
      const m = Math.min(pushL, pushR, pushB, pushF);
      if (m === pushL) pos.x = c.minX - radius;
      else if (m === pushR) pos.x = c.maxX + radius;
      else if (m === pushB) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
}

export function moveActor(pos, vel, dt, colliders, radius, height) {
  pos.x += vel.x * dt;
  collideCircle(pos, radius, colliders, height);
  pos.z += vel.z * dt;
  collideCircle(pos, radius, colliders, height);
  pos.x = clamp(pos.x, -31.4, 31.4);
  pos.z = clamp(pos.z, -21.4, 21.4);
}

// ---- player --------------------------------------------------------------
export function createPlayer(spawn) {
  return {
    kind: 'player', team: 'harbour', name: 'YOU', hp: PLAYER.hp, alive: true,
    pos: new THREE.Vector3(spawn[0], 0, spawn[1]),
    vel: new THREE.Vector3(), yaw: Math.PI, pitch: 0,
    crouch: false, onGround: true, vy: 0,
    weapon: 'p9', mag: 12, reserve: Infinity, grenades: 0,
    owned: ['p9'], ammo: {}, // per-weapon saved mag/reserve when switching
    money: 800, kills: 0, deaths: 0,
    recoil: 0, spreadBloom: 0, lastShot: -9, reloadUntil: 0, ads: false,
    stepPhase: 0, planting: 0, defusing: 0,
  };
}

export function updatePlayer(p, input, dt, colliders, sfx) {
  if (!p.alive) return;
  const speed = p.crouch ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
  const wish = _v.set(0, 0, 0);
  if (input.forward) wish.z -= 1;
  if (input.back) wish.z += 1;
  if (input.left) wish.x -= 1;
  if (input.right) wish.x += 1;
  if (wish.lengthSq() > 0) {
    wish.normalize();
    // Rotate wish from camera space to world space: R_y(yaw) applied to
    // (x, z) is (x*cos + z*sin, -x*sin + z*cos).
    const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    _v2.set(wish.x * c + wish.z * s, 0, -wish.x * s + wish.z * c);
    p.vel.x += _v2.x * PLAYER.accel * dt;
    p.vel.z += _v2.z * PLAYER.accel * dt;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp > speed) { p.vel.x *= speed / sp; p.vel.z *= speed / sp; }
    p.stepPhase += sp * dt * 1.6;
    if (p.stepPhase > Math.PI * 2) { p.stepPhase -= Math.PI * 2; if (p.onGround) sfx.step(false); }
  } else {
    const f = Math.max(0, 1 - PLAYER.friction * dt);
    p.vel.x *= f; p.vel.z *= f;
  }
  moveActor(p.pos, p.vel, dt, colliders, PLAYER.radius, PLAYER.height);
  // Gravity + jump.
  if (input.jump && p.onGround) { p.vy = PLAYER.jumpSpeed; p.onGround = false; }
  p.vy -= PLAYER.gravity * dt;
  p.pos.y += p.vy * dt;
  if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.onGround = true; }
  // Recoil and spread decay.
  p.recoil = Math.max(0, p.recoil - dt * 0.09);
  p.spreadBloom = Math.max(0, p.spreadBloom - dt * 0.045);
}

// ---- bots ----------------------------------------------------------------
const bodyGeo = new THREE.CylinderGeometry(0.34, 0.4, 1.05, 10);
const headGeo = new THREE.SphereGeometry(0.21, 12, 10);
const legGeo = new THREE.BoxGeometry(0.16, 0.5, 0.18);
const gunGeo = new THREE.BoxGeometry(0.09, 0.14, 0.85);
const barBgGeo = new THREE.BoxGeometry(0.9, 0.09, 0.01);
const barFgGeo = new THREE.BoxGeometry(0.86, 0.06, 0.012);
const botMats = {};

function botMat(team, part) {
  const key = team + part;
  if (botMats[key]) return botMats[key];
  const colour = part === 'torso' ? (team === 'harbour' ? 0x3d6d94 : 0x8a4a28)
    : part === 'head' ? 0xc9a586 : 0x2c2f33;
  return (botMats[key] = new THREE.MeshLambertMaterial({ color: colour }));
}

export function createBot(scene, team, name, spawn, weaponId, index) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(bodyGeo, botMat(team, 'torso'));
  torso.position.y = 1.05; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(headGeo, botMat(team, 'head'));
  head.position.y = 1.72; head.castShadow = true; g.add(head);
  // Visor stripe so teams read at a glance.
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.05),
    new THREE.MeshBasicMaterial({ color: team === 'harbour' ? 0x7fc4ff : 0xffb36b }));
  visor.position.set(0, 1.74, 0.19); g.add(visor);
  for (const sx of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(legGeo, botMat(team, 'legs'));
    leg.position.set(sx, 0.28, 0); g.add(leg);
  }
  const gun = new THREE.Mesh(gunGeo, botMat(team, 'gun'));
  gun.position.set(0.22, 1.25, 0.3); g.add(gun);
  // Floating HP bar, billboarded each frame.
  const barBg = new THREE.Mesh(barBgGeo, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75 }));
  barBg.position.y = 2.08; g.add(barBg);
  const barFg = new THREE.Mesh(barFgGeo, new THREE.MeshBasicMaterial({ color: 0x58d06a }));
  barFg.position.y = 2.08; barFg.position.z = 0.008; g.add(barFg);
  g.position.set(spawn[0], 0, spawn[1]);
  scene.add(g);
  return {
    kind: 'bot', team, name, hp: BOT.hp, alive: true,
    pos: g.position, vel: new THREE.Vector3(), yaw: 0,
    group: g, head, torso, barFg, barBg,
    weapon: weaponId, mag: 30, reserve: 90,
    mode: 'route', route: [], routeIndex: 0, holdUntil: 0, holdPoint: null,
    target: null, lastSeenPos: null, lastSeenAt: -99, losAt: -99,
    burstLeft: 0, burstPause: 0, shootCooldown: 0, thinkAt: hash01(index * 7 + 3) * 0.2,
    carrier: false, planting: 0, seed: index * 13 + 5, strafeDir: 1, strafeAt: 0,
  };
}

export function setBotRoute(bot, route, mode = 'route') {
  bot.route = route.map(([x, z]) => new THREE.Vector3(x, 0, z));
  bot.routeIndex = 0; bot.mode = mode;
}

export function botEye(bot) {
  return _v.set(bot.pos.x, bot.pos.y + 1.55, bot.pos.z);
}

// Line of sight from a to b, against occluder meshes. Reuses one raycaster.
export function hasLos(from, to, occluders) {
  _dir.copy(to).sub(from);
  const dist = _dir.length();
  if (dist < 0.01) return true;
  _dir.multiplyScalar(1 / dist);
  _ray.set(from, _dir);
  _ray.far = dist;
  return _ray.intersectObjects(occluders, false).length === 0;
}

function nearestEnemy(bot, actors) {
  let best = null, bestD = Infinity;
  for (const a of actors) {
    if (!a.alive || a.team === bot.team) continue;
    const d = (a.pos.x - bot.pos.x) ** 2 + (a.pos.z - bot.pos.z) ** 2;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best ? { actor: best, dist: Math.sqrt(bestD) } : null;
}

export function updateBot(bot, dt, sim) {
  if (!bot.alive) return;
  const now = sim.time;
  bot.thinkAt -= dt;
  // Staggered sensing: LOS + target pick every ~0.15 s.
  if (bot.thinkAt <= 0) {
    bot.thinkAt = 0.15 + hash01(bot.seed + Math.floor(now * 6)) * 0.05;
    const found = nearestEnemy(bot, sim.actors);
    bot.target = null;
    if (found && found.dist < BOT.sightRange) {
      const eye = botEye(bot);
      _v2.set(found.actor.pos.x, found.actor.pos.y + (found.actor.kind === 'player' ? 1.3 : 1.2), found.actor.pos.z);
      if (hasLos(eye, _v2, sim.occluders)) {
        // Peripheral vision: close targets always seen, far ones need facing.
        _dir.copy(_v2).sub(eye).normalize();
        const fwd = new THREE.Vector3(Math.sin(bot.yaw), 0, Math.cos(bot.yaw));
        const dot = _dir.x * fwd.x + _dir.z * fwd.z;
        if (found.dist < 9 || dot > Math.cos(BOT.sightHalfAngle)) {
          bot.target = found.actor; bot.lastSeenPos = found.actor.pos.clone();
          bot.lastSeenAt = now; bot.losAt = now;
        }
      }
    }
    // Hearing: a recent loud shot nearby pulls the bot toward it.
    if (!bot.target && sim.noise && sim.noise.at > now - 1.2) {
      const d = Math.hypot(sim.noise.x - bot.pos.x, sim.noise.z - bot.pos.z);
      if (d < BOT.hearRange && sim.noise.team !== bot.team) {
        bot.lastSeenPos = new THREE.Vector3(sim.noise.x, 0, sim.noise.z);
        bot.lastSeenAt = now;
      }
    }
  }

  const speed = bot.mode === 'engage' ? BOT.walkSpeed : BOT.runSpeed;
  let moveTarget = null;
  if (bot.target) {
    bot.mode = 'engage';
    // Strafe while engaging so bots are not static targets.
    if (now > bot.strafeAt) { bot.strafeDir *= -1; bot.strafeAt = now + 0.9 + hash01(bot.seed + 11) * 0.8; }
    const t = bot.target.pos;
    const d = Math.hypot(t.x - bot.pos.x, t.z - bot.pos.z);
    if (d > 16) moveTarget = t; // close the gap
    else if (d < 5) moveTarget = new THREE.Vector3(bot.pos.x * 2 - t.x, 0, bot.pos.z * 2 - t.z); // back off
    else {
      // Strafe sideways around the target.
      const dx = t.x - bot.pos.x, dz = t.z - bot.pos.z, len = Math.hypot(dx, dz) || 1;
      moveTarget = new THREE.Vector3(bot.pos.x + (-dz / len) * bot.strafeDir * 2, 0, bot.pos.z + (dx / len) * bot.strafeDir * 2);
    }
    // Face the target.
    bot.yaw = Math.atan2(t.x - bot.pos.x, t.z - bot.pos.z);
    botShoot(bot, dt, sim);
  } else if (bot.mode === 'plant') {
    // Carrier channels the plant; standing still is the tell.
    bot.planting += dt;
    if (sim.onPlantProgress) sim.onPlantProgress(bot, dt);
  } else if (bot.mode === 'hold' && bot.holdPoint) {
    if (now < bot.holdUntil) {
      // Scan: slow yaw sweep while holding.
      bot.yaw += Math.sin(now * 0.7 + bot.seed) * dt * 0.5;
    } else {
      bot.mode = 'route';
    }
  } else if (bot.mode === 'route' && bot.route.length) {
    const wp = bot.route[bot.routeIndex];
    moveTarget = wp;
    const d = Math.hypot(wp.x - bot.pos.x, wp.z - bot.pos.z);
    if (d < 0.9) {
      bot.routeIndex++;
      if (bot.routeIndex >= bot.route.length) {
        bot.routeIndex = bot.route.length - 1;
        if (bot.carrier && sim.siteOf(bot.pos)) { bot.mode = 'plant'; bot.planting = 0; }
        else { bot.mode = 'hold'; bot.holdUntil = now + 3 + hash01(bot.seed) * 4; }
      }
    }
    if (moveTarget) bot.yaw = Math.atan2(moveTarget.x - bot.pos.x, moveTarget.z - bot.pos.z);
  } else if (bot.lastSeenPos && now - bot.lastSeenAt < 2.5) {
    // Investigate the last heard/seen position.
    moveTarget = bot.lastSeenPos;
    const d = Math.hypot(moveTarget.x - bot.pos.x, moveTarget.z - bot.pos.z);
    if (d < 1.2) bot.lastSeenPos = null;
    else bot.yaw = Math.atan2(moveTarget.x - bot.pos.x, moveTarget.z - bot.pos.z);
  }

  if (moveTarget) {
    const dx = moveTarget.x - bot.pos.x, dz = moveTarget.z - bot.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    bot.vel.x = (dx / len) * speed; bot.vel.z = (dz / len) * speed;
    moveActor(bot.pos, bot.vel, dt, sim.colliders, BOT.radius, BOT.height);
  } else {
    bot.vel.x = 0; bot.vel.z = 0;
  }

  // Sync the mesh: position, facing, walk bob, HP bar.
  bot.group.rotation.y = bot.yaw;
  const moving = Math.hypot(bot.vel.x, bot.vel.z) > 0.1;
  bot.group.position.y = moving ? Math.abs(Math.sin(now * 9 + bot.seed)) * 0.04 : 0;
  const frac = Math.max(0, bot.hp / BOT.hp);
  bot.barFg.scale.x = frac;
  bot.barFg.material.color.setHex(frac > 0.5 ? 0x58d06a : frac > 0.25 ? 0xe8a13a : 0xe04a3a);
  bot.barFg.visible = bot.barBg.visible = bot.hp < BOT.hp;
  bot.barBg.lookAt(sim.camera.position);
  bot.barFg.lookAt(sim.camera.position);
}

function botShoot(bot, dt, sim) {
  if (bot.shootCooldown > 0) { bot.shootCooldown -= dt; return; }
  if (bot.burstLeft <= 0) {
    if (bot.burstPause > 0) { bot.burstPause -= dt; return; }
    bot.burstLeft = BOT.burstMin + Math.floor(hash01(bot.seed + Math.floor(sim.time * 3)) * (BOT.burstMax - BOT.burstMin));
    bot.burstPause = BOT.burstPause * (0.7 + hash01(bot.seed + 21) * 0.6);
  }
  const t = bot.target;
  if (!t || !t.alive) { bot.burstLeft = 0; return; }
  const dist = Math.hypot(t.pos.x - bot.pos.x, t.pos.z - bot.pos.z);
  // Aim error grows with distance and target speed; bots are beatable.
  const targetSpeed = Math.hypot(t.vel.x, t.vel.z);
  const err = BOT.aimError * (0.5 + dist / 30) * (1 + targetSpeed * 0.12);
  _dir.set(t.pos.x - bot.pos.x, (t.pos.y + 1.25) - (bot.pos.y + 1.45), t.pos.z - bot.pos.z).normalize();
  _dir.x += (hash01(bot.seed + bot.burstLeft * 31) - 0.5) * err * 2;
  _dir.y += (hash01(bot.seed + bot.burstLeft * 17) - 0.5) * err * 1.4;
  _dir.z += (hash01(bot.seed + bot.burstLeft * 7) - 0.5) * err * 2;
  _dir.normalize();
  const from = _v.copy(bot.pos); from.y += 1.45;
  hitscanShot(sim, bot, from, _dir, bot.weapon);
  bot.burstLeft--;
  bot.shootCooldown = 60 / 600; // rifle cadence
  if (bot.burstLeft <= 0) bot.burstPause = 0.7;
}

// First-person viewmodel: chunky boxes, no external model.
export function buildViewmodel(camera) {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x1d2126 });
  const mid = new THREE.MeshLambertMaterial({ color: 0x3a4148 });
  const accent = new THREE.MeshLambertMaterial({ color: 0xd98a1f });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.62), dark);
  body.position.set(0, 0, -0.1); g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 8), mid);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.55); g.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.1), mid);
  mag.position.set(0, -0.14, -0.02); mag.rotation.x = 0.25; g.add(mag);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), accent);
  sight.position.set(0, 0.1, -0.28); g.add(sight);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
  grip.position.set(0, -0.12, 0.16); grip.rotation.x = 0.35; g.add(grip);
  // Muzzle flash: a quad that appears for one frame on each shot.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  flash.position.set(0, 0.01, -0.76); g.add(flash);
  g.position.set(0.26, -0.25, -0.55);
  g.scale.setScalar(0.8);
  camera.add(g);
  return { group: g, flash, flashMat };
}
