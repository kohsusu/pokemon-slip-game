/**
 * dragonite.js — Hand-crafted Three.js geometric Dragonite model
 * Returns a THREE.Group scaled to ~2.6 world units tall, feet at y=0.
 * No external assets required — pure geometry + Lambert materials.
 */
import * as THREE from 'three';

// ── Colour palette ─────────────────────────────────────────────────────────────
const C_BODY   = 0xE8831A;   // orange
const C_BELLY  = 0xF5D76E;   // warm yellow
const C_WING   = 0xC8631A;   // darker orange-brown
const C_EYE    = 0x111111;   // black
const C_PUPIL  = 0xFFFFFF;   // white highlight
const C_HORN   = 0xC8A030;   // yellow-brown antenna
const C_CLAW   = 0xCDAD60;   // cream claws

// ── Shared materials ───────────────────────────────────────────────────────────
const _mat = {
  body:  new THREE.MeshLambertMaterial({ color: C_BODY }),
  belly: new THREE.MeshLambertMaterial({ color: C_BELLY }),
  wing:  new THREE.MeshLambertMaterial({ color: C_WING,  side: THREE.DoubleSide }),
  eye:   new THREE.MeshLambertMaterial({ color: C_EYE }),
  pupil: new THREE.MeshLambertMaterial({ color: C_PUPIL }),
  horn:  new THREE.MeshLambertMaterial({ color: C_HORN }),
  claw:  new THREE.MeshLambertMaterial({ color: C_CLAW }),
};

// ── Helper: add a mesh to a group with position/scale/rotation ────────────────
function _mesh(geo, mat, group, px=0, py=0, pz=0, sx=1, sy=1, sz=1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(px, py, pz);
  m.scale.set(sx, sy, sz);
  m.castShadow    = true;
  m.receiveShadow = false;
  group.add(m);
  return m;
}

// ── Wing shape — flat quadrilateral via custom BufferGeometry ──────────────────
function _makeWingGeo(side) {
  // Dragonite has small, rounded wings
  const s = side === 'L' ? -1 : 1;
  const pts = [
    // Base (attached to body)
    new THREE.Vector3(s * 0.05, 0,     0),
    new THREE.Vector3(s * 0.05, 0.55,  0),
    // Tips
    new THREE.Vector3(s * 1.05, 0.72,  0.05),
    new THREE.Vector3(s * 1.10, 0.10,  0.05),
  ];
  const geo = new THREE.BufferGeometry();
  // Two triangles: 0-1-2 and 0-2-3
  const verts = [
    pts[0].x, pts[0].y, pts[0].z,
    pts[1].x, pts[1].y, pts[1].z,
    pts[2].x, pts[2].y, pts[2].z,
    pts[0].x, pts[0].y, pts[0].z,
    pts[2].x, pts[2].y, pts[2].z,
    pts[3].x, pts[3].y, pts[3].z,
  ];
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.computeVertexNormals();
  return geo;
}

// ── Main builder ───────────────────────────────────────────────────────────────
export function buildDragonite() {
  const root = new THREE.Group();

  // ── Legs (two short pillars) ─────────────────────────────────────────────────
  const legGeo = new THREE.CylinderGeometry(0.17, 0.20, 0.42, 10);
  _mesh(legGeo, _mat.body, root, -0.28, 0.21, 0);
  _mesh(legGeo, _mat.body, root,  0.28, 0.21, 0);

  // Feet / claws
  const footGeo = new THREE.SphereGeometry(0.18, 8, 6);
  _mesh(footGeo, _mat.belly, root, -0.28, 0.04,  0.10, 1.2, 0.55, 1.3);
  _mesh(footGeo, _mat.belly, root,  0.28, 0.04,  0.10, 1.2, 0.55, 1.3);

  // ── Tail ─────────────────────────────────────────────────────────────────────
  const tailBase = new THREE.CylinderGeometry(0.20, 0.06, 0.75, 8);
  const tailM = _mesh(tailBase, _mat.body, root, 0, 0.65, -0.50);
  tailM.rotation.x = Math.PI / 5;

  // Tail tip (rounded)
  const tipGeo = new THREE.SphereGeometry(0.14, 8, 6);
  const tipM = _mesh(tipGeo, _mat.belly, root, 0, 0.72, -0.88);
  tipM.scale.set(1, 0.7, 1);

  // ── Body ─────────────────────────────────────────────────────────────────────
  // Core torso — egg-shaped (sphere scaled)
  const bodyGeo = new THREE.SphereGeometry(0.60, 14, 12);
  _mesh(bodyGeo, _mat.body, root, 0, 1.10, 0, 1.0, 1.22, 0.95);

  // Yellow belly patch
  const bellyGeo = new THREE.SphereGeometry(0.46, 12, 10);
  _mesh(bellyGeo, _mat.belly, root, 0, 1.08, 0.38, 1.0, 1.0, 0.55);

  // ── Arms ─────────────────────────────────────────────────────────────────────
  const armGeo = new THREE.CylinderGeometry(0.12, 0.10, 0.42, 8);
  const armL = _mesh(armGeo, _mat.body, root, -0.62, 1.22, 0.05);
  armL.rotation.z =  Math.PI / 4;
  const armR = _mesh(armGeo, _mat.body, root,  0.62, 1.22, 0.05);
  armR.rotation.z = -Math.PI / 4;

  // Small clawed hands
  const handGeo = new THREE.SphereGeometry(0.13, 8, 6);
  _mesh(handGeo, _mat.claw, root, -0.82, 0.98, 0.10);
  _mesh(handGeo, _mat.claw, root,  0.82, 0.98, 0.10);

  // ── Wings ─────────────────────────────────────────────────────────────────────
  const wingGeoL = _makeWingGeo('L');
  const wingGeoR = _makeWingGeo('R');
  const wL = new THREE.Mesh(wingGeoL, _mat.wing);
  const wR = new THREE.Mesh(wingGeoR, _mat.wing);
  wL.position.set(-0.58, 1.35, -0.08);
  wR.position.set( 0.58, 1.35, -0.08);
  wL.castShadow = true;
  wR.castShadow = true;
  root.add(wL);
  root.add(wR);

  // ── Neck ─────────────────────────────────────────────────────────────────────
  const neckGeo = new THREE.CylinderGeometry(0.28, 0.35, 0.32, 10);
  _mesh(neckGeo, _mat.body, root, 0, 1.82, 0.05);

  // ── Head ─────────────────────────────────────────────────────────────────────
  const headGeo = new THREE.SphereGeometry(0.42, 14, 12);
  _mesh(headGeo, _mat.body, root, 0, 2.20, 0.05);

  // Cheek pouches (two small bumps)
  const cheekGeo = new THREE.SphereGeometry(0.14, 8, 6);
  _mesh(cheekGeo, _mat.belly, root, -0.30, 2.15, 0.32, 1, 0.75, 0.65);
  _mesh(cheekGeo, _mat.belly, root,  0.30, 2.15, 0.32, 1, 0.75, 0.65);

  // ── Eyes ─────────────────────────────────────────────────────────────────────
  const eyeGeo   = new THREE.SphereGeometry(0.10, 8, 6);
  const pupilGeo = new THREE.SphereGeometry(0.05, 6, 4);
  [-0.20, 0.20].forEach(ex => {
    _mesh(eyeGeo,   _mat.eye,   root, ex, 2.26, 0.37);
    _mesh(pupilGeo, _mat.pupil, root, ex, 2.28, 0.45);
  });

  // ── Antennae / horns ──────────────────────────────────────────────────────────
  const hornGeo = new THREE.CylinderGeometry(0.03, 0.06, 0.26, 6);
  const hL = _mesh(hornGeo, _mat.horn, root, -0.18, 2.57, 0.03);
  const hR = _mesh(hornGeo, _mat.horn, root,  0.18, 2.57, 0.03);
  hL.rotation.z =  0.22;
  hR.rotation.z = -0.22;

  // Horn tip balls
  const hornTipGeo = new THREE.SphereGeometry(0.05, 6, 4);
  _mesh(hornTipGeo, _mat.horn, root, -0.22, 2.76, 0.04);
  _mesh(hornTipGeo, _mat.horn, root,  0.22, 2.76, 0.04);

  // ── Scale to TARGET_HEIGHT (2.6) — already designed to fit, just verify ──────
  // Total height ≈ 2.81 (tip of horn). Scale down slightly.
  const targetH  = 2.6;
  const box = new THREE.Box3().setFromObject(root);
  const curH = box.max.y - box.min.y;
  if (curH > 0) root.scale.setScalar(targetH / curH);

  // Ground the model (shift so feet touch y=0)
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;

  return root;
}
