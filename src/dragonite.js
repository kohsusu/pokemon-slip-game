/**
 * dragonite.js v2 — Refined hand-crafted Three.js Dragonite
 * Significant improvements over v1:
 *   - Chubby, rounded proportions matching official design
 *   - Segmented belly (4 overlapping plates)
 *   - Wings with bone fingers + membrane (custom BufferGeometry)
 *   - Multi-segment curved tail with lighter tip
 *   - 4-layer eyes (sclera dome → amber iris → dark pupil → white shine)
 *   - Curved antennae via CatmullRomCurve3 + TubeGeometry
 *   - 3-toed feet with individual claw tips
 *   - Emissive eye highlights
 */
import * as THREE from 'three';

// ── Colour palette ─────────────────────────────────────────────────────────────
const C = {
  orange:   0xE8831A,
  darkO:    0xBF6010,
  midO:     0xD47015,
  yellow:   0xF5CE5A,
  yellow2:  0xE0B030,
  wingMem:  0xC86012,
  wingBone: 0x8B3A08,
  scleraC:  0xFFF8DC,
  irisC:    0x884400,
  pupilC:   0x180800,
  shineC:   0xFFFFFF,
  horn:     0xD4A828,
  claw:     0xEEDD88,
  tailTip:  0xF0C060,
};

// ── Shared materials ───────────────────────────────────────────────────────────
const M = {
  orange:  new THREE.MeshLambertMaterial({ color: C.orange }),
  darkO:   new THREE.MeshLambertMaterial({ color: C.darkO }),
  midO:    new THREE.MeshLambertMaterial({ color: C.midO }),
  yellow:  new THREE.MeshLambertMaterial({ color: C.yellow }),
  yellow2: new THREE.MeshLambertMaterial({ color: C.yellow2 }),
  wingMem: new THREE.MeshLambertMaterial({ color: C.wingMem, side: THREE.DoubleSide }),
  wingBone:new THREE.MeshLambertMaterial({ color: C.wingBone }),
  sclera:  new THREE.MeshLambertMaterial({ color: C.scleraC }),
  iris:    new THREE.MeshLambertMaterial({ color: C.irisC }),
  pupil:   new THREE.MeshLambertMaterial({ color: C.pupilC }),
  shine:   new THREE.MeshLambertMaterial({ color: C.shineC, emissive: 0xFFFFFF, emissiveIntensity: 0.8 }),
  horn:    new THREE.MeshLambertMaterial({ color: C.horn }),
  claw:    new THREE.MeshLambertMaterial({ color: C.claw }),
  tailTip: new THREE.MeshLambertMaterial({ color: C.tailTip }),
};

// ── Helper: add mesh ───────────────────────────────────────────────────────────
function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  if (sx !== 1 || sy !== 1 || sz !== 1) m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// ── Wing membrane — custom quad triangulated shape ────────────────────────────
function _wingMembrane(side) {
  // Control points (in local wing space, side=1 for right, -1 for left)
  const s = side;
  const pts = [
    [0,       0,      0   ],  // 0: body attachment
    [s*0.15,  0.55,  -0.05],  // 1: upper base
    [s*0.72,  0.72,  -0.04],  // 2: upper finger tip
    [s*0.90,  0.28,  -0.02],  // 3: lower finger tip
    [s*0.55, -0.10,   0   ],  // 4: trailing edge
  ];
  const idx = [
    0,1,2, 0,2,3, 0,3,4,  // front face
    2,1,0, 3,2,0, 4,3,0,  // back face (DoubleSide, but explicit normals)
  ];
  const verts = [];
  idx.forEach(i => verts.push(...pts[i]));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.computeVertexNormals();
  return geo;
}

// ── Curved antenna via CatmullRomCurve3 ──────────────────────────────────────
function _antennaGeo(side) {
  const s = side;  // +1 right, -1 left
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(s * 0.14,  0,    0     ),
    new THREE.Vector3(s * 0.22,  0.18, 0.02  ),
    new THREE.Vector3(s * 0.26,  0.38, 0.04  ),
    new THREE.Vector3(s * 0.22,  0.55, 0.02  ),
    new THREE.Vector3(s * 0.14,  0.64, -0.01 ),
  ]);
  return new THREE.TubeGeometry(curve, 10, 0.038, 7, false);
}

// ── Curved tail via CatmullRomCurve3 ─────────────────────────────────────────
function _tailSegGeo(r1, r2, pts) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  // Taper by hand with a CylinderGeometry approach doesn't work with curves,
  // so use TubeGeometry with varying radius approximation (use r1 for simplicity)
  return new THREE.TubeGeometry(curve, 8, (r1 + r2) / 2, 8, false);
}

// ── BUILD FUNCTIONS ───────────────────────────────────────────────────────────

function _feet(root) {
  const footGeo = new THREE.SphereGeometry(0.20, 10, 8);
  const toeGeo  = new THREE.SphereGeometry(0.085, 7, 5);
  const clawGeo = new THREE.ConeGeometry(0.042, 0.13, 6);

  [-0.33, 0.33].forEach(sx => {
    // Foot pad
    add(root, footGeo, M.orange,  sx, 0.13,  0.05,  0,0,0,  1.25, 0.58, 1.45);
    // Three toes
    [[-0.13, 0, 0.20], [0, 0, 0.24], [0.13, 0, 0.20]].forEach(([tx, ty, tz]) => {
      const fx = sx + tx * Math.sign(sx);
      add(root, toeGeo, M.orange, fx, 0.07, tz);
      add(root, clawGeo, M.claw,  fx, 0.01, tz + 0.08,  -Math.PI/2, 0, 0,  1, 1, 1.2);
    });
  });
}

function _legs(root) {
  const legGeo = new THREE.CylinderGeometry(0.215, 0.245, 0.50, 12);
  // Slight outward bow
  add(root, legGeo, M.orange, -0.33, 0.49, 0.0,  0, 0,  0.06);
  add(root, legGeo, M.orange,  0.33, 0.49, 0.0,  0, 0, -0.06);
  // Knee bulge
  const kneeGeo = new THREE.SphereGeometry(0.19, 10, 8);
  add(root, kneeGeo, M.orange, -0.335, 0.62, 0.04,  0,0,0, 1,1,0.8);
  add(root, kneeGeo, M.orange,  0.335, 0.62, 0.04,  0,0,0, 1,1,0.8);
}

function _tail(root) {
  // 5-segment curved tail sweeping behind and slightly curling
  const tData = [
    { pts: [[0,0.92,-0.48],[0,0.82,-0.62],[0,0.72,-0.76]], r: 0.195 },
    { pts: [[0,0.72,-0.76],[0,0.60,-0.88],[0,0.48,-0.96]], r: 0.155 },
    { pts: [[0,0.48,-0.96],[0,0.38,-1.02],[0,0.30,-1.04]], r: 0.118 },
    { pts: [[0,0.30,-1.04],[0,0.26,-1.02],[0,0.28,-0.96]], r: 0.085 },
  ];
  tData.forEach(({ pts, r }) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    const geo   = new THREE.TubeGeometry(curve, 6, r, 9, false);
    add(root, geo, M.orange);
  });
  // Rounded tail tip (slightly lighter)
  add(root, new THREE.SphereGeometry(0.115, 10, 8), M.tailTip, 0, 0.30, -0.95);
}

function _body(root) {
  // Core torso — distinctly chubby egg shape
  const bodyGeo = new THREE.SphereGeometry(0.72, 18, 16);
  add(root, bodyGeo, M.orange, 0, 1.22, 0.02,  0,0,0,  1.0, 1.28, 0.93);

  // Back / darker shading plane (simulate ambient shadow on back)
  const backGeo = new THREE.SphereGeometry(0.66, 14, 12);
  add(root, backGeo, M.darkO, 0, 1.22, -0.22,  0,0,0,  0.95, 1.20, 0.55);
}

function _belly(root) {
  // Large front belly base
  const bellyGeo = new THREE.SphereGeometry(0.60, 14, 12);
  add(root, bellyGeo, M.yellow, 0, 1.18, 0.55,  0,0,0,  1.0, 1.08, 0.42);

  // Segmented belly plates — 4 overlapping ellipses create ridgeline
  const segGeo = new THREE.SphereGeometry(0.44, 12, 10);
  const segs = [
    { y: 0.78, z: 0.54, sy: 0.28, sz: 0.42 },
    { y: 1.02, z: 0.57, sy: 0.30, sz: 0.44 },
    { y: 1.28, z: 0.57, sy: 0.30, sz: 0.44 },
    { y: 1.52, z: 0.55, sy: 0.28, sz: 0.42 },
  ];
  segs.forEach(({ y, z, sy, sz }, i) => {
    add(root, segGeo, i % 2 === 0 ? M.yellow : M.yellow2,  0, y, z,  0,0,0, 1.0, sy, sz);
  });

  // Chin chin patch (extends belly toward jaw)
  const chinGeo = new THREE.SphereGeometry(0.30, 10, 8);
  add(root, chinGeo, M.yellow, 0, 1.80, 0.46,  0,0,0, 1.0, 0.65, 0.5);
}

function _wings(root) {
  // Each wing: two tapered bone fingers + membrane
  [-1, 1].forEach(side => {
    const wg = new THREE.Group();
    wg.position.set(side * 0.68, 1.48, -0.05);
    wg.rotation.set(-0.12, side * 0.20, side * 0.28);

    // Upper bone finger
    const upperCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0,       0,     0),
      new THREE.Vector3(side*0.35, 0.38, 0),
      new THREE.Vector3(side*0.60, 0.62, 0),
    ]);
    wg.add(Object.assign(
      new THREE.Mesh(new THREE.TubeGeometry(upperCurve, 6, 0.045, 7), M.wingBone),
      { castShadow: true }
    ));

    // Lower bone finger
    const lowerCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0,       0,     0),
      new THREE.Vector3(side*0.45, 0.20, 0),
      new THREE.Vector3(side*0.72, 0.22, 0),
    ]);
    wg.add(Object.assign(
      new THREE.Mesh(new THREE.TubeGeometry(lowerCurve, 6, 0.038, 7), M.wingBone),
      { castShadow: true }
    ));

    // Finger tips (round)
    [
      [side * 0.62, 0.64, 0],
      [side * 0.74, 0.22, 0],
    ].forEach(([x, y, z]) => {
      add(wg, new THREE.SphereGeometry(0.055, 7, 5), M.wingBone, x, y, z);
    });

    // Wing membrane
    const memGeo = _wingMembrane(side);
    const mem = new THREE.Mesh(memGeo, M.wingMem);
    mem.castShadow = true;
    wg.add(mem);

    root.add(wg);
  });
}

function _arms(root) {
  // Short, stubby arms angling out and slightly forward
  const armCurve = (side) => new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 0.66, 1.28, 0.10),
    new THREE.Vector3(side * 0.82, 1.12, 0.16),
    new THREE.Vector3(side * 0.88, 0.96, 0.18),
  ]);
  [-1, 1].forEach(side => {
    const geo = new THREE.TubeGeometry(armCurve(side), 6, 0.115, 9);
    add(root, geo, M.orange);

    // Hand ball
    add(root, new THREE.SphereGeometry(0.14, 9, 7), M.orange,
        side * 0.90, 0.92, 0.20);

    // 3 small finger claws
    [[-0.07, 0, 0.10], [0, 0, 0.13], [0.07, 0, 0.10]].forEach(([dx, dy, dz]) => {
      const fx = side * 0.90 + dx * side;
      add(root, new THREE.ConeGeometry(0.032, 0.10, 5), M.claw,
          fx, 0.87, 0.24 + dz,  -Math.PI/2, 0, 0);
    });
  });
}

function _neck(root) {
  // Slightly tapered neck
  const neckGeo = new THREE.CylinderGeometry(0.30, 0.38, 0.38, 12);
  add(root, neckGeo, M.orange, 0, 1.95, 0.04);
  // Neck/body blend ring
  const blendGeo = new THREE.SphereGeometry(0.38, 12, 8);
  add(root, blendGeo, M.orange, 0, 1.82, 0.04,  0,0,0, 1,0.55,0.9);
}

function _head(root) {
  // Large, round head
  const headGeo = new THREE.SphereGeometry(0.50, 18, 16);
  add(root, headGeo, M.orange, 0, 2.38, 0.06);

  // Forehead bulge (makes head look bigger and rounder)
  add(root, new THREE.SphereGeometry(0.40, 14, 12), M.orange,
      0, 2.55, 0.02,  0,0,0, 1.0, 0.70, 0.85);

  // Cheek pouches — large and prominent
  const cheekGeo = new THREE.SphereGeometry(0.22, 10, 8);
  [-0.38, 0.38].forEach(cx => {
    add(root, cheekGeo, M.yellow, cx, 2.28, 0.38,  0,0,0, 1, 0.78, 0.60);
  });

  // Snout / muzzle
  add(root, new THREE.SphereGeometry(0.22, 10, 8), M.midO,
      0, 2.22, 0.44,  0,0,0, 1.2, 0.68, 0.55);

  // Nostrils (two tiny dark dots)
  const nostrilGeo = new THREE.SphereGeometry(0.035, 6, 4);
  add(root, nostrilGeo, M.darkO, -0.075, 2.26, 0.63);
  add(root, nostrilGeo, M.darkO,  0.075, 2.26, 0.63);
}

function _eyes(root) {
  // 4-layer eyes: white sclera dome → amber iris → dark pupil → shine spot
  [-0.24, 0.24].forEach(ex => {
    const ey = 2.38, ez = 0.44;

    // Sclera (large white dome)
    add(root, new THREE.SphereGeometry(0.145, 12, 10), M.sclera,
        ex, ey, ez,  0,0,0, 1, 1, 0.55);

    // Iris (amber, slightly raised)
    add(root, new THREE.SphereGeometry(0.110, 10, 8), M.iris,
        ex, ey, ez + 0.02,  0,0,0, 1, 1, 0.50);

    // Pupil (dark, forward)
    add(root, new THREE.SphereGeometry(0.072, 8, 6), M.pupil,
        ex, ey, ez + 0.04,  0,0,0, 1, 1, 0.48);

    // Highlight sparkle (emissive white)
    add(root, new THREE.SphereGeometry(0.032, 6, 5), M.shine,
        ex + 0.045 * Math.sign(ex) * -1, ey + 0.045, ez + 0.06);
  });
}

function _antennae(root) {
  [-1, 1].forEach(side => {
    // Curved antenna tube
    const geo = _antennaGeo(side);
    // Attach to top of head
    const antGrp = new THREE.Group();
    antGrp.position.set(0, 2.58, 0.04);
    const antMesh = new THREE.Mesh(geo, M.horn);
    antMesh.castShadow = true;
    antGrp.add(antMesh);

    // Round tip ball
    add(antGrp, new THREE.SphereGeometry(0.052, 7, 5), M.horn,
        side * 0.14, 0.64, -0.01);

    root.add(antGrp);
  });
}

// ── Main export ────────────────────────────────────────────────────────────────
export function buildDragonite() {
  const root = new THREE.Group();

  _feet(root);
  _legs(root);
  _tail(root);
  _body(root);
  _belly(root);
  _wings(root);
  _arms(root);
  _neck(root);
  _head(root);
  _eyes(root);
  _antennae(root);

  // ── Auto-fit to TARGET_HEIGHT = 2.6, feet at y = 0 ───────────────────────
  const box = new THREE.Box3().setFromObject(root);
  const h   = box.max.y - box.min.y;
  if (h > 0) root.scale.setScalar(2.6 / h);
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;

  return root;
}
