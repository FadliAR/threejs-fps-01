// Harbour Line — "Pier 9" dockyard. An original map: two bomb sites
// (A Crane Yard east, B Warehouse west), a mid lane, container cover and
// sightlines that reward holding an angle. Builds the meshes, the AABB
// colliders the sim moves against, the waypoint routes bots walk, and the
// spawn points. All geometry is styled boxes/cylinders in one palette.
import * as THREE from 'three';
import { PALETTE } from './config.js';

const MAT = {};
// Meshes that block line of sight and bullets; filled by buildMap.
const occluders = [];
function mat(name, color, opts = {}) {
  if (!MAT[name]) MAT[name] = new THREE.MeshLambertMaterial({ color, ...opts });
  return MAT[name];
}

// An axis-aligned blocker. yMax above head height blocks sight lines too.
function box(scene, colliders, x, y, z, w, h, d, material, solid = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  occluders.push(m);
  if (solid) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + h });
  return m;
}

function lampPost(scene, x, z, lights) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), mat('pole', 0x2a2e33));
  pole.position.set(x, 2.7, z); pole.castShadow = true; scene.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.34),
    new THREE.MeshLambertMaterial({ color: 0x3a3a2e, emissive: PALETTE.lamp, emissiveIntensity: 1.4 }));
  head.position.set(x, 5.45, z); scene.add(head);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: PALETTE.lamp, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  cone.position.set(x, 3.9, z); scene.add(cone);
  const p = new THREE.PointLight(PALETTE.lamp, 22, 17, 1.8);
  p.position.set(x, 5.3, z); scene.add(p); lights.push(p);
}

export function buildMap(scene) {
  const colliders = [];
  occluders.length = 0;
  const lights = [];

  // Ground: dark asphalt with a painted centre line and site markings.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 44),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const lineMat = mat('line', PALETTE.groundLine);
  for (const [x, z, w, d] of [[0, 0, 0.25, 30], [-16, 0, 0.25, 30], [16, 0, 0.25, 30]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat);
    l.position.set(x, 0.011, z); scene.add(l);
  }

  // Perimeter walls.
  const wall = mat('wall', PALETTE.wall);
  const wallTop = mat('wallTop', PALETTE.wallTop);
  box(scene, colliders, 0, 0, -22, 64, 4.2, 1, wall);
  box(scene, colliders, 0, 0, 22, 64, 4.2, 1, wall);
  box(scene, colliders, -32, 0, 0, 1, 4.2, 44, wall);
  box(scene, colliders, 32, 0, 0, 1, 4.2, 44, wall);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(64, 0.3, 1.2), wallTop);
  trim.position.set(0, 4.3, -22); scene.add(trim);

  // B Warehouse: a shed with a big door on its south face, crates inside the yard.
  box(scene, colliders, -25, 0, -17.5, 11, 5.5, 8, mat('shed', 0x46525e));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.2),
    new THREE.MeshLambertMaterial({ color: 0x2c343c }));
  door.position.set(-25, 2.1, -13.45); scene.add(door);
  const doorStripe = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.5),
    new THREE.MeshBasicMaterial({ color: PALETTE.groundLine }));
  doorStripe.position.set(-25, 0.35, -13.44); scene.add(doorStripe);

  // A Crane Yard: a gantry crane frame with a hanging hook block.
  const crane = mat('crane', PALETTE.crane);
  box(scene, colliders, 24, 0, -19.5, 1.1, 11, 1.1, crane);
  box(scene, colliders, 30, 0, -19.5, 1.1, 11, 1.1, crane);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.1, 1.1), crane);
  beam.position.set(27, 11, -19.5); beam.castShadow = true; scene.add(beam);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.9), mat('hook', 0x2a2e33));
  hook.position.set(27, 7.2, -19.5); hook.castShadow = true; scene.add(hook);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.1, 6), mat('cable', 0x111417));
  cable.position.set(27, 9.4, -19.5); scene.add(cable);

  // Shipping containers: the map's cover. Rows make lanes, corners and sightlines.
  const cont = (x, z, w, d, c, rot = 0) => {
    const m = box(scene, colliders, x, 0, z, w, 2.6, d, mat('cont' + c, c), true);
    m.rotation.y = rot;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.14, d * 0.98),
      mat('rib', 0x000000, { transparent: true, opacity: 0.18 }));
    rib.position.set(x, 2.55, z); rib.rotation.y = rot; scene.add(rib);
    return m;
  };
  cont(-8, -14, 6, 2.6, PALETTE.containerRust);
  cont(-8, -11, 6, 2.6, PALETTE.containerTeal);
  cont(8, -14, 6, 2.6, PALETTE.containerAmber);
  cont(8, -11, 6, 2.6, PALETTE.containerRust);
  cont(-20, 2, 6, 2.6, PALETTE.containerTeal);
  cont(20, 2, 6, 2.6, PALETTE.containerAmber);
  cont(-20, 5, 6, 2.6, PALETTE.containerRust);
  cont(20, 5, 6, 2.6, PALETTE.containerTeal);
  cont(0, -6, 2.6, 6, PALETTE.containerAmber); // mid pillar container
  cont(-12, 12, 6, 2.6, PALETTE.containerRust);
  cont(12, 12, 6, 2.6, PALETTE.containerTeal);
  // Stacked pair near B for a high corner.
  cont(-26, -6, 6, 2.6, PALETTE.containerAmber);
  const stack = box(scene, colliders, -26, 2.6, -6, 6, 2.6, 2.6, mat('contStack', PALETTE.containerRust));
  stack.position.y = 2.6 + 1.3;

  // Crates and barrels: low cover you can crouch behind.
  const crate = mat('crate', PALETTE.crate);
  for (const [x, z, s] of [[-4, -8, 1.2], [-2.6, -8, 1.2], [-3.3, -8, 1.2], [4, -8, 1.2], [5.4, -8, 1.2],
    [-14, -2, 1.2], [14, -2, 1.2], [0, 8, 1.2], [-6, 16, 1.2], [6, 16, 1.2], [24, -10, 1.2], [-24, -12, 1.2]]) {
    box(scene, colliders, x, 0, z, s, s, s, crate);
  }
  const barrel = mat('barrel', PALETTE.barrel);
  for (const [x, z] of [[-10, -16], [-9, -16], [10, -16], [22, -14], [-22, 14], [26, 10]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.05, 12), barrel);
    b.position.set(x, 0.53, z); b.castShadow = true; scene.add(b);
    occluders.push(b);
    colliders.push({ minX: x - 0.42, maxX: x + 0.42, minZ: z - 0.42, maxZ: z + 0.42, minY: 0, maxY: 1.05 });
  }

  // Bomb-site floor markings: painted A / B rings.
  for (const [x, z, label] of [[26, -15, 'A'], [-25, -10, 'B']]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.groundLine, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.02, z); scene.add(ring);
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const g = canvas.getContext('2d');
    g.fillStyle = '#c8a24a'; g.font = 'bold 92px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, 64, 70);
    const tex = new THREE.CanvasTexture(canvas);
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9 }));
    decal.rotation.x = -Math.PI / 2; decal.position.set(x, 0.021, z); scene.add(decal);
  }

  // Floodlight poles: the map's warm sodium pools.
  lampPost(scene, -14, -10, lights);
  lampPost(scene, 14, -10, lights);
  lampPost(scene, -14, 10, lights);
  lampPost(scene, 14, 10, lights);

  return {
    colliders,
    occluders,
    lights,
    spawns: {
      atk: [[-4, 19], [0, 19.5], [4, 19], [-8, 18], [8, 18]],
      def: [[-24, -6], [-16, -12], [16, -12], [24, -6], [0, -16]],
    },
    sites: {
      A: { center: [26, -15], radius: 3.4 },
      B: { center: [-25, -10], radius: 3.4 },
    },
    // Attacker routes: spawn -> mid -> site, with a hold point each.
    routes: {
      A: [[-2, 16], [-2, 6], [-2, -2], [6, -8], [16, -12], [22, -14], [26, -15]],
      B: [[2, 16], [2, 6], [-6, -2], [-14, -6], [-20, -8], [-25, -10]],
      mid: [[0, 16], [0, 8], [0, 0], [0, -8]],
    },
    // Defender hold points: corners that watch a lane or a site.
    holds: {
      A: [[20, -12], [24, -8], [14, -14]],
      B: [[-20, -12], [-24, -6], [-16, -14]],
      mid: [[-4, -4], [4, -4], [0, -12]],
    },
  };
}
