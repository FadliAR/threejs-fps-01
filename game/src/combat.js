// Harbour Line — combat: hitscan shooting with headshot multipliers,
// tracers, and the frag grenade. One raycaster and a pooled tracer set:
// nothing is allocated per shot.
import * as THREE from 'three';
import { WEAPONS, clamp } from './config.js';

const _ray = new THREE.Raycaster();
const _hit = new THREE.Vector3();
const _from = new THREE.Vector3();
const _dir = new THREE.Vector3();
const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });

export function makeTracers(scene, n = 14) {
  const pool = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
    m.visible = false; scene.add(m);
    pool.push({ mesh: m, life: 0 });
  }
  return pool;
}

export function spawnTracer(pool, from, to) {
  let slot = pool.find(t => t.life <= 0) || pool[0];
  const m = slot.mesh;
  const len = from.distanceTo(to);
  m.position.copy(from).lerp(to, 0.5);
  m.lookAt(to);
  m.scale.set(1, 1, Math.max(0.1, len));
  m.visible = true;
  slot.life = 0.07;
}

export function updateTracers(pool, dt) {
  for (const t of pool) {
    if (t.life > 0) {
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) t.mesh.visible = false;
    }
  }
}

// Fire one hitscan round. `from`/`dir` are the shooter's eye and aim.
// Returns the actor hit, if any.
export function hitscanShot(sim, shooter, from, dir, weaponId) {
  const w = WEAPONS[weaponId];
  _from.copy(from);
  _dir.copy(dir).normalize();
  _ray.set(_from, _dir);
  _ray.far = w.range;
  // Walls first, then every living actor's head and torso.
  const wallHits = _ray.intersectObjects(sim.occluders, false);
  const wallDist = wallHits.length ? wallHits[0].distance : Infinity;
  let best = null, bestDist = wallDist, bestHead = false;
  for (const a of sim.actors) {
    if (a === shooter || !a.alive) continue;
    const meshes = a.kind === 'bot' ? [a.head, a.torso] : null;
    if (!meshes) continue;
    const hits = _ray.intersectObjects(meshes, false);
    if (hits.length && hits[0].distance < bestDist) {
      best = a; bestDist = hits[0].distance; bestHead = hits[0].object === a.head;
    }
  }
  const end = _hit.copy(_from).addScaledVector(_dir, Math.min(bestDist, w.range));
  spawnTracer(sim.tracers, _from, end);
  sim.sfx.shot(w.sound, shooter.kind === 'player' ? 0 : _from.distanceTo(sim.camera.position));
  sim.noise = { x: _from.x, z: _from.z, at: sim.time, team: shooter.team };
  if (!best) return null;
  const falloff = bestDist > 25 ? 0.75 : 1;
  const dmg = w.damage * (bestHead ? w.headMul : 1) * falloff;
  sim.lastShotHead = bestHead;
  sim.damageActor(best, dmg, shooter, bestHead);
  return best;
}

// Player-only: the ray from the camera with the weapon's spread applied.
export function playerShoot(sim, player) {
  const w = WEAPONS[player.weapon];
  const moving = Math.hypot(player.vel.x, player.vel.z);
  const spread = (w.spread + player.spreadBloom + (moving > 0.5 ? w.moveSpread : 0)) * (player.ads ? 0.45 : 1);
  _dir.set(
    (Math.random() - 0.5) * 2 * spread,
    (Math.random() - 0.5) * 2 * spread,
    -1,
  ).normalize().applyEuler(new THREE.Euler(player.pitch + player.recoil * 0.35, player.yaw, 0, 'YXZ'));
  _from.set(player.pos.x, player.pos.y + (player.crouch ? 1.08 : 1.62), player.pos.z);
  const hit = hitscanShot(sim, player, _from, _dir, player.weapon);
  player.recoil = Math.min(0.06, player.recoil + w.recoil);
  player.spreadBloom = Math.min(0.05, player.spreadBloom + w.recoil * 0.35);
  player.lastShot = sim.time;
  if (hit) sim.sfx[sim.lastShotHead ? 'headshot' : 'hit']();
  return hit;
}

// ---- grenades ------------------------------------------------------------
export function throwGrenade(sim, thrower) {
  const g = {
    pos: new THREE.Vector3(thrower.pos.x, thrower.pos.y + 1.4, thrower.pos.z),
    vel: new THREE.Vector3(),
    fuse: 1.6, mesh: null, light: null, team: thrower.team, thrower,
  };
  const dir = new THREE.Vector3();
  if (thrower.kind === 'player') {
    dir.set(0, 0, -1).applyEuler(new THREE.Euler(thrower.pitch, thrower.yaw, 0, 'YXZ'));
  } else {
    dir.copy(thrower.target ? thrower.target.pos : new THREE.Vector3()).sub(thrower.pos).normalize();
    dir.y = 0.35; dir.normalize();
  }
  g.vel.copy(dir).multiplyScalar(16); g.vel.y += 4.5;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0x2e4a22 }));
  mesh.position.copy(g.pos); sim.scene.add(mesh); g.mesh = mesh;
  sim.grenades.push(g);
  sim.sfx.throwPin();
}

const _e = new THREE.Vector3();
export function updateGrenades(sim, dt) {
  for (let i = sim.grenades.length - 1; i >= 0; i--) {
    const g = sim.grenades[i];
    g.vel.y -= 14 * dt;
    g.pos.addScaledVector(g.vel, dt);
    // Cheap bounce: clamp to the yard and reflect on collider tops/sides.
    if (g.pos.y < 0.09) { g.pos.y = 0.09; g.vel.y = Math.abs(g.vel.y) * 0.35; g.vel.x *= 0.7; g.vel.z *= 0.7; }
    if (g.pos.x < -31.4 || g.pos.x > 31.4) g.vel.x *= -0.4;
    if (g.pos.z < -21.4 || g.pos.z > 21.4) g.vel.z *= -0.4;
    for (const c of sim.colliders) {
      if (g.pos.x > c.minX && g.pos.x < c.maxX && g.pos.z > c.minZ && g.pos.z < c.maxZ &&
          g.pos.y < c.maxY && g.pos.y > c.minY - 0.1) {
        g.pos.y = c.maxY + 0.1; g.vel.y = Math.abs(g.vel.y) * 0.4; g.vel.x *= 0.6; g.vel.z *= 0.6;
      }
    }
    g.mesh.position.copy(g.pos);
    g.fuse -= dt;
    if (g.fuse <= 0) {
      explode(sim, g);
      sim.scene.remove(g.mesh);
      sim.grenades.splice(i, 1);
    }
  }
}

function explode(sim, g) {
  sim.sfx.explosion(g.pos.distanceTo(sim.camera.position));
  // Visual: a fast-expanding orange sphere + a light that dies in 0.25 s.
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 }));
  flash.position.copy(g.pos); sim.scene.add(flash);
  const light = new THREE.PointLight(0xff9a3c, 60, 18, 1.6);
  light.position.copy(g.pos); sim.scene.add(light);
  sim.effects.push({ mesh: flash, light, life: 0.28, max: 0.28, grow: 6 });
  for (const a of sim.actors) {
    if (!a.alive) continue;
    const d = a.pos.distanceTo(g.pos);
    if (d > 6) continue;
    // Walls block the blast: trace from the blast to the actor's chest.
    _e.copy(a.pos); _e.y += 1.2; _e.sub(g.pos);
    const dist = _e.length();
    _ray.set(g.pos, _e.normalize());
    _ray.far = dist;
    if (_ray.intersectObjects(sim.occluders, false).length > 0) continue;
    const dmg = Math.round(95 * (1 - d / 6) + 15);
    if (a !== g.thrower) sim.damageActor(a, dmg, g.thrower, false);
  }
  sim.noise = { x: g.pos.x, z: g.pos.z, at: sim.time, team: g.team };
}

export function updateEffects(sim, dt) {
  for (let i = sim.effects.length - 1; i >= 0; i--) {
    const e = sim.effects[i];
    e.life -= dt;
    const f = Math.max(0, e.life / e.max);
    e.mesh.scale.setScalar(1 + (1 - f) * e.grow);
    e.mesh.material.opacity = f * 0.9;
    e.light.intensity = f * 60;
    if (e.life <= 0) {
      sim.scene.remove(e.mesh); sim.scene.remove(e.light);
      e.mesh.material.dispose(); e.mesh.geometry.dispose();
      sim.effects.splice(i, 1);
    }
  }
}
