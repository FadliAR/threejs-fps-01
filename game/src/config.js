// Harbour Line — shared tuning: weapons, economy, rounds, palette.
// One place for every number the sim, bots and HUD all read.
export const TICK = 1 / 60;

export const PALETTE = {
  sky: 0x1a2230, fog: 0x232c3a, ground: 0x2b2f33, groundLine: 0xc8a24a,
  wall: 0x3a4148, wallTop: 0x4a525b, containerRust: 0x9a4a26, containerTeal: 0x2e6b6b,
  containerAmber: 0xb07a1e, crate: 0x6b5433, barrel: 0x7a2e22, crane: 0xd98a1f,
  lamp: 0xffc46b, ally: 0x4f8fd0, enemy: 0xd05a2e, bomb: 0xff3b30, ink: 0xe9e6df,
};

export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', short: 'P9', price: 0, slot: 1,
    damage: 26, headMul: 3, rpm: 320, mag: 12, reserve: Infinity,
    reload: 1.1, spread: 0.011, moveSpread: 0.02, recoil: 0.011, auto: false,
    range: 45, tracer: 0xffe9a8, sound: 'pistol',
  },
  kx9: {
    id: 'kx9', name: 'KX-9 "Wasp" SMG', short: 'KX-9', price: 1500, slot: 2,
    damage: 21, headMul: 3, rpm: 780, mag: 32, reserve: 96,
    reload: 1.7, spread: 0.02, moveSpread: 0.034, recoil: 0.009, auto: true,
    range: 38, tracer: 0xffd27a, sound: 'smg',
  },
  vk7: {
    id: 'vk7', name: 'VK-7 "Vulture" Rifle', short: 'VK-7', price: 2700, slot: 3,
    damage: 34, headMul: 4, rpm: 600, mag: 30, reserve: 90,
    reload: 2.1, spread: 0.004, moveSpread: 0.026, recoil: 0.021, auto: true,
    range: 70, tracer: 0xffe9a8, sound: 'rifle',
  },
  s1: {
    id: 's1', name: 'S-1 Frag Grenade', short: 'S-1', price: 300, slot: 4,
    damage: 0, headMul: 1, rpm: 60, mag: 1, reserve: 1,
    reload: 0.8, spread: 0, moveSpread: 0, recoil: 0, auto: false,
    range: 0, tracer: 0, sound: 'throw', grenade: true,
  },
};

export const ECONOMY = {
  startMoney: 800, winRound: 3250, loseRound: 1900, kill: 300,
  plantBonus: 300, defuseBonus: 300, maxMoney: 16000,
};

export const ROUND = {
  buySeconds: 14, roundSeconds: 100, bombSeconds: 35,
  plantSeconds: 3.2, defuseSeconds: 5, maxRounds: 12, winRounds: 7,
};

export const PLAYER = {
  radius: 0.38, eyeStand: 1.62, eyeCrouch: 1.08, height: 1.75,
  walkSpeed: 4.4, crouchSpeed: 2.1, accel: 42, friction: 11,
  jumpSpeed: 5.2, gravity: 14, hp: 100,
};

export const BOT = {
  hp: 100, walkSpeed: 3.4, runSpeed: 4.0, radius: 0.38, height: 1.75,
  sightRange: 42, sightHalfAngle: 0.62, hearRange: 26,
  burstMin: 3, burstMax: 6, burstPause: 0.7, aimError: 0.05,
};

// Team colours, names and callsigns. All original: no commercial map,
// character or weapon names anywhere in this game.
export const TEAMS = {
  harbour: { label: 'HARBOUR', colour: PALETTE.ally, spawn: 'def' },
  jackal: { label: 'JACKAL', colour: PALETTE.enemy, spawn: 'atk' },
};

export const BOT_NAMES = {
  harbour: ['MARA', 'DOCK', 'SABLE', 'REEF'],
  jackal: ['VEX', 'GRIT', 'ASH', 'LOOM', 'PIKE'],
};

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
// Deterministic 32-bit hash -> [0,1): used for stable per-bot jitter.
export function hash01(n) {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
