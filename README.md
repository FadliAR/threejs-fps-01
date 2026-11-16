# Harbour Line — threejs-fps-01 entry

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/FadliAR/threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/FadliAR/threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

Entry for make.fun's [threejs-fps-01 bounty](https://make.fun/bounty/threejs-fps-01):
"Make the best three.js tactical FPS" ($1,000 in USDC).

**Harbour Line** is an original round-based tactical FPS set on Pier 9, a
dusk dockyard. You hold the harbour with three teammates against five
Jackal bots who push site A (Crane Yard) or site B (Warehouse) and plant
the bomb. Win 7 rounds to take the match.

- First-person view with pointer-lock mouse look, WASD movement with
  acceleration, crouch, jump and map collision
- Three weapons (P9 sidearm, KX-9 SMG, VK-7 rifle) plus the S-1 frag
  grenade, with headshot multipliers, recoil and spread that punish
  firing on the move, and aim-down-sights
- Round economy: earn money for wins, kills and defuses; spend it in the
  buy menu between rounds (B)
- Bomb plant/defuse objective with a 35-second fuse; bots follow waypoint
  routes, hold angles, react to sight and sound, and strafe in a fight
- Fixed-step (60 Hz) simulation kept apart from rendering, one state
  store, one-job modules, pooled tracers, zero network requests — all
  sounds are synthesized with WebAudio

Run: `node serve.ts`, then open http://localhost:8080.
Hand in: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`
