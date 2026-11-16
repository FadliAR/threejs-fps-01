// Harbour Line — the simulation: one state store, one fixed-step update.
// Rounds (buy -> live -> end), the bomb, the economy, kills and scoring
// all live here; rendering only reads this state.
import * as THREE from 'three';
import { ROUND, ECONOMY, WEAPONS, BOT, clamp } from './config.js';
import { createPlayer, createBot, setBotRoute, updatePlayer, updateBot } from './actors.js';
import { makeTracers, updateTracers, updateGrenades, updateEffects, playerShoot, throwGrenade } from './combat.js';

export function createSim(scene, camera, mapData, sfx) {
  const sim = {
    scene, camera, sfx,
    colliders: mapData.colliders,
    occluders: mapData.occluders,
    time: 0, round: 1, phase: 'menu', phaseT: 0,
    score: { harbour: 0, jackal: 0 },
    roundTime: ROUND.roundSeconds,
    bomb: { state: 'none', site: null, pos: new THREE.Vector3(), timer: 0, carrier: null },
    actors: [], tracers: makeTracers(scene), grenades: [], effects: [],
    noise: null, feed: [], banner: null, matchOver: false, hurtFlash: 0,
    lastShotHead: false,
    player: null, camera,
    onPlantProgress: null,
  };
  // Combat calls damage through the sim object, so the function lives on it.
  sim.damageActor = (target, dmg, shooter, isHead) => damageActor(sim, target, dmg, shooter, isHead);
  sim.onPlantProgress = (bot, dt) => plantProgress(sim, bot, dt);
  return sim;
}

export function siteOf(sim, pos) {
  for (const key of ['A', 'B']) {
    const s = sim.map.sites[key];
    if (!s) continue;
    const dx = pos.x - s.center[0], dz = pos.z - s.center[1];
    if (dx * dx + dz * dz < s.radius * s.radius) return key;
  }
  return null;
}

function addFeed(sim, text) {
  sim.feed.unshift({ text, at: sim.time });
  if (sim.feed.length > 6) sim.feed.pop();
}

function spawnTeams(sim) {
  // Clear old bots' meshes.
  for (const a of sim.actors) if (a.kind === 'bot') sim.scene.remove(a.group);
  sim.actors = [];
  const map = sim.map;
  const player = createPlayer([0, -4]);
  player.yaw = Math.PI;
  sim.player = player;
  sim.actors.push(player);
  const harbourSpawns = map.spawns.def.slice(0, 3);
  const namesH = ['MARA', 'DOCK', 'SABLE'];
  harbourSpawns.forEach(([x, z], i) => {
    const b = createBot(sim.scene, 'harbour', namesH[i], [x, z], 'vk7', i);
    setBotRoute(b, [], 'hold');
    b.holdPoint = new THREE.Vector3(x, 0, z);
    b.holdUntil = sim.time + 999;
    sim.actors.push(b);
  });
  // Harbour holds: two watch the sites, one watches mid.
  const holds = [map.holds.A[0], map.holds.B[0], map.holds.mid[0]];
  sim.actors.filter(a => a.kind === 'bot' && a.team === 'harbour').forEach((b, i) => {
    b.holdPoint = new THREE.Vector3(holds[i][0], 0, holds[i][1]);
    b.pos.set(holds[i][0], 0, holds[i][1]);
    b.group.position.copy(b.pos);
  });
  const namesJ = ['VEX', 'GRIT', 'ASH', 'LOOM', 'PIKE'];
  map.spawns.atk.forEach(([x, z], i) => {
    const b = createBot(sim.scene, 'jackal', namesJ[i], [x, z], i === 0 ? 'vk7' : 'kx9', 10 + i);
    const route = i < 3 ? map.routes.A : map.routes.B;
    setBotRoute(b, route);
    if (i === 0) { b.carrier = true; sim.bomb.carrier = b; }
    sim.actors.push(b);
  });
  sim.bomb.state = 'carried';
}

export function startMatch(sim, mapData) {
  sim.map = mapData;
  sim.score = { harbour: 0, jackal: 0 };
  sim.round = 1;
  sim.matchOver = false;
  startRound(sim);
}

export function startRound(sim) {
  spawnTeams(sim);
  sim.phase = 'buy';
  sim.phaseT = 0;
  sim.roundTime = ROUND.roundSeconds;
  sim.bomb = { state: 'carried', site: null, pos: new THREE.Vector3(), timer: ROUND.bombSeconds, carrier: sim.actors.find(a => a.carrier) || null };
  sim.banner = `ROUND ${sim.round} — BUY PHASE`;
  sim.sfx.buy();
}

export function buyWeapon(sim, id) {
  const p = sim.player;
  const w = WEAPONS[id];
  if (!w || sim.phase !== 'buy') return false;
  if (id === 's1') {
    if (p.grenades >= 2 || p.money < w.price) { sim.sfx.denied(); return false; }
    p.money -= w.price; p.grenades += 1; sim.sfx.buy(); return true;
  }
  if (p.money < w.price) { sim.sfx.denied(); return false; }
  if (p.weapon === id) { // top up ammo instead of re-buying
    if (p.reserve === w.reserve) return false;
    p.money -= Math.round(w.price * 0.25);
    p.reserve = w.reserve; sim.sfx.buy(); return true;
  }
  p.money -= w.price;
  p.ammo[p.weapon] = { mag: p.mag, reserve: p.reserve };
  p.weapon = id; p.mag = w.mag; p.reserve = w.reserve;
  if (!p.owned.includes(id)) p.owned.push(id);
  p.ammo[id] = { mag: p.mag, reserve: p.reserve };
  sim.sfx.buy();
  return true;
}

export function damageActor(sim, target, dmg, shooter, isHead) {
  if (!target.alive) return;
  target.hp -= dmg;
  if (target.kind === 'player') {
    sim.sfx.hurt();
    sim.hurtFlash = 1;
    sim.banner = 'YOU WERE ELIMINATED — YOUR TEAM FIGHTS ON';
    if (shooter && shooter.kind === 'bot') addFeed(sim, `${shooter.name} hit you${isHead ? ' — HEADSHOT' : ''}`);
  }
  if (target.hp > 0) return;
  target.hp = 0; target.alive = false;
  if (target.kind === 'bot') {
    target.group.rotation.x = -Math.PI / 2; // fall flat
    target.group.position.y = 0.25;
    target.barBg.visible = false; target.barFg.visible = false;
  }
  const killer = shooter ? shooter.name : 'WORLD';
  addFeed(sim, `${killer} eliminated ${target.name}${isHead ? ' (headshot)' : ''}`);
  if (shooter === sim.player) {
    sim.player.kills++;
    sim.player.money = Math.min(16000, sim.player.money + ECONOMY.kill);
  }
  if (target.kind === 'player') sim.player.deaths++;
  if (target.carrier) {
    // The bomb drops where the carrier fell; a teammate bot picks it up.
    sim.bomb.state = 'dropped';
    sim.bomb.pos.copy(target.pos);
    sim.bomb.carrier = null;
    const mate = sim.actors.find(a => a.kind === 'bot' && a.team === 'jackal' && a.alive);
    if (mate) { mate.carrier = true; sim.bomb.carrier = mate; sim.bomb.state = 'carried'; }
  }
  checkRoundEnd(sim);
}

function checkRoundEnd(sim) {
  if (sim.phase !== 'live' && sim.phase !== 'buy') return;
  const harbourAlive = sim.actors.some(a => a.alive && a.team === 'harbour');
  const jackalAlive = sim.actors.some(a => a.alive && a.team === 'jackal');
  if (!harbourAlive) endRound(sim, 'jackal', 'Harbour team eliminated');
  else if (!jackalAlive) endRound(sim, 'harbour', 'Jackal team eliminated');
}

function endRound(sim, winner, reason) {
  if (sim.phase === 'end') return;
  sim.phase = 'end'; sim.phaseT = 0;
  sim.score[winner]++;
  const p = sim.player;
  p.money = Math.min(16000, p.money + (winner === 'harbour' ? ECONOMY.winRound : ECONOMY.loseRound));
  sim.banner = winner === 'harbour' ? `ROUND WON — ${reason}` : `ROUND LOST — ${reason}`;
  if (winner === 'harbour') sim.sfx.roundWin(); else sim.sfx.roundLose();
  addFeed(sim, sim.banner);
  if (sim.score.harbour >= ROUND.winRounds || sim.score.jackal >= ROUND.winRounds || sim.round >= ROUND.maxRounds) {
    sim.matchOver = true;
  }
}

function plantProgress(sim, bot, dt) {
  if (sim.bomb.state !== 'carried' || sim.bomb.carrier !== bot) return;
  const site = siteOf(sim, bot.pos);
  if (!site) { bot.mode = 'route'; return; }
  // Only plant when no defender is close and visible.
  const near = sim.actors.some(a => a.alive && a.team === 'harbour' &&
    Math.hypot(a.pos.x - bot.pos.x, a.pos.z - bot.pos.z) < 14);
  if (near) { bot.planting = 0; return; }
  if (bot.planting >= ROUND.plantSeconds) {
    sim.bomb.state = 'planted';
    sim.bomb.site = site;
    sim.bomb.pos.copy(bot.pos);
    sim.bomb.timer = ROUND.bombSeconds;
    bot.mode = 'hold'; bot.holdUntil = sim.time + 999;
    bot.holdPoint = bot.pos.clone();
    sim.banner = `BOMB PLANTED AT SITE ${site} — DEFUSE IT`;
    sim.sfx.plant();
    addFeed(sim, `Bomb planted at site ${site}`);
    if (sim.onBombPlanted) sim.onBombPlanted(site);
  }
}

function updateBomb(sim, dt, input) {
  const b = sim.bomb;
  if (b.state === 'planted') {
    b.timer -= dt;
    if (Math.floor(b.timer * 2) !== Math.floor((b.timer + dt) * 2)) sim.sfx.beep(b.timer < 5);
    const p = sim.player;
    if (p.alive && input.defuse && Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) < 2.4) {
      p.defusing += dt;
      if (Math.floor(p.defusing * 4) !== Math.floor((p.defusing - dt) * 4)) sim.sfx.defuseTick();
      if (p.defusing >= ROUND.defuseSeconds) {
        b.state = 'defused';
        p.money = Math.min(16000, p.money + ECONOMY.defuseBonus);
        endRound(sim, 'harbour', 'Bomb defused');
      }
    } else {
      p.defusing = 0;
    }
    if (b.timer <= 0 && b.state === 'planted') {
      b.state = 'exploded';
      sim.sfx.explosion(0);
      endRound(sim, 'jackal', 'Bomb detonated');
    }
  }
}

// One fixed step. `input` is the frame's input snapshot.
export function stepSim(sim, dt, input) {
  sim.time += dt;
  const p = sim.player;
  if (sim.phase === 'menu') return;
  if (sim.phase === 'buy') {
    sim.phaseT += dt;
    if (sim.phaseT >= ROUND.buySeconds) {
      sim.phase = 'live'; sim.phaseT = 0;
      sim.banner = `ROUND ${sim.round} — FIGHT`;
    }
  } else if (sim.phase === 'live') {
    sim.roundTime -= dt;
    if (sim.roundTime <= 0) {
      sim.roundTime = 0;
      endRound(sim, sim.bomb.state === 'planted' ? 'jackal' : 'harbour',
        sim.bomb.state === 'planted' ? 'Time expired with bomb planted' : 'Time expired — site held');
    }
  } else if (sim.phase === 'end') {
    sim.phaseT += dt;
    if (sim.phaseT >= 4) {
      if (sim.matchOver) { sim.phase = 'over'; sim.banner = sim.score.harbour > sim.score.jackal ? 'MATCH WON — HARBOUR HOLDS THE PIER' : 'MATCH LOST — JACKALS TAKE THE PIER'; }
      else { sim.round++; startRound(sim); }
    }
  }

  // Player actions (frozen during buy except buying; frozen when dead/over).
  if (p && p.alive && (sim.phase === 'live' || sim.phase === 'buy')) {
    updatePlayer(p, input, dt, sim.colliders, sim.sfx);
    if (sim.phase === 'live') {
      const w = WEAPONS[p.weapon];
      const now = sim.time;
      const fireHeld = input.fire && (w.auto || input.fireEdge);
      if (fireHeld && now - p.lastShot >= 60 / w.rpm && now >= p.reloadUntil) {
        if (p.mag > 0) {
          p.mag--;
          playerShoot(sim, p);
          if (p.mag === 0) sim.sfx.dryFire();
        } else {
          sim.sfx.dryFire();
          p.lastShot = now;
        }
      }
      if (input.reload && p.mag < w.mag && p.reserve > 0 && now >= p.reloadUntil) {
        p.reloadUntil = now + w.reload;
        sim.sfx.reload();
      }
      if (now >= p.reloadUntil && p.reloadUntil > 0 && p.mag < w.mag) {
        const need = w.mag - p.mag;
        const take = w.reserve === Infinity ? need : Math.min(need, p.reserve);
        p.mag += take;
        if (w.reserve !== Infinity) p.reserve -= take;
        p.reloadUntil = 0;
      }
      if (input.grenadeEdge && p.grenades > 0) {
        p.grenades--;
        throwGrenade(sim, p);
      }
    }
  }

  // Bots act only while the round is live: during buy and round-end they
  // hold their positions, so the buy phase is a real pause, not a firefight.
  if (sim.phase === 'live') {
    for (const a of sim.actors) if (a.kind === 'bot') updateBot(a, dt, sim);
  }
  updateGrenades(sim, dt);
  updateEffects(sim, dt);
  updateTracers(sim.tracers, dt);
  updateBomb(sim, dt, input);
  if (sim.hurtFlash > 0) sim.hurtFlash = Math.max(0, sim.hurtFlash - dt * 2.2);
}
