import * as THREE from 'three';
import { ROAD_WIDTH, NUM_ZONES, ZONE_LENGTH, ZONES_PER_TIER, TIER_COLORS_HEX } from './constants.js?v=21';

export const GROUND_COLOR_SAFE   = 0x4CAF50;
export const GROUND_COLOR_YELLOW = 0xFFC107;
export const GROUND_COLOR_RED    = 0xF44336;

export class Road {
  constructor(scene) {
    this.scene     = scene;
    this.restZones = [];   // bounding boxes for safe-zone check
    this._buildRoad();
  }

  _buildRoad() {
    const total  = NUM_ZONES * ZONE_LENGTH;   // 1080
    const matrix = new THREE.Matrix4();

    // ── Main road surface (1 draw call) ────────────────────────────────────
    this.roadMat  = new THREE.MeshLambertMaterial({ color: GROUND_COLOR_SAFE });
    const roadMesh = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_WIDTH, 0.4, total),
      this.roadMat,
    );
    roadMesh.position.set(0, -0.2, -(total / 2));
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);

    // ── Side walls: InstancedMesh per tier (1 draw call × 3 tiers) ────────
    //   Each tier has ZONES_PER_TIER zones × 2 sides = 6 instances.
    //   Shorten by 0.1 so adjacent zone-wall end-faces don't share the same
    //   plane — that coplanarity caused z-fighting (flickering) at boundaries.
    const wallGeo = new THREE.BoxGeometry(0.5, 1.5, ZONE_LENGTH - 0.1);

    TIER_COLORS_HEX.forEach((color, tier) => {
      const count   = ZONES_PER_TIER * 2;   // 6
      const wallMsh = new THREE.InstancedMesh(
        wallGeo,
        new THREE.MeshLambertMaterial({ color }),
        count,
      );
      wallMsh.castShadow = true;

      let idx = 0;
      for (let zi = 0; zi < ZONES_PER_TIER; zi++) {
        const z    = tier * ZONES_PER_TIER + zi;
        const zMid = -((z + 0.5) * ZONE_LENGTH);
        matrix.makeTranslation(-ROAD_WIDTH / 2 - 0.3, 0.6, zMid);
        wallMsh.setMatrixAt(idx++, matrix);
        matrix.makeTranslation( ROAD_WIDTH / 2 + 0.3, 0.6, zMid);
        wallMsh.setMatrixAt(idx++, matrix);
      }
      wallMsh.instanceMatrix.needsUpdate = true;
      this.scene.add(wallMsh);
    });

    // ── Rest grooves: 1 InstancedMesh (NUM_ZONES instances) ───────────────
    const grooveGeo = new THREE.BoxGeometry(ROAD_WIDTH, 0.4, 4);
    const grooveMsh = new THREE.InstancedMesh(
      grooveGeo,
      new THREE.MeshLambertMaterial({ color: 0x795548 }),
      NUM_ZONES,
    );
    grooveMsh.receiveShadow = true;

    // ── Rest signs: 1 InstancedMesh (NUM_ZONES instances) ─────────────────
    const signGeo = new THREE.BoxGeometry(2, 0.8, 0.1);
    const signMsh = new THREE.InstancedMesh(
      signGeo,
      new THREE.MeshLambertMaterial({ color: 0xFFF176 }),
      NUM_ZONES,
    );

    for (let z = 0; z < NUM_ZONES; z++) {
      const grooveZ = -((z + 1) * ZONE_LENGTH) + 2;
      matrix.makeTranslation(0, -0.4, grooveZ);
      grooveMsh.setMatrixAt(z, matrix);
      matrix.makeTranslation(0, 1.5, grooveZ);
      signMsh.setMatrixAt(z, matrix);

      this.restZones.push({
        minX: -ROAD_WIDTH / 2,
        maxX:  ROAD_WIDTH / 2,
        minZ: grooveZ - 2,
        maxZ: grooveZ + 2,
      });
    }
    grooveMsh.instanceMatrix.needsUpdate = true;
    signMsh.instanceMatrix.needsUpdate   = true;
    this.scene.add(grooveMsh);
    this.scene.add(signMsh);

    // ── Starting platform (road-width centre + two side bridges to bases) ───
    //   Bases: x=±26, inner edge x=±16 (BASE_W+2=20, half=10, 26-10=16).
    //   Three pieces: centre (road-width), left bridge, right bridge.
    //   Keep each piece within the camera horizontal FOV so they don't bleed
    //   into the top corners of the screen.
    const startMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });

    // Centre strip — same width as road, covers z ≈ -9 to +23
    const startMesh = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_WIDTH, 0.4, 32),
      startMat,
    );
    startMesh.position.set(0, -0.2, 7);   // covers z ≈ -9 to +23
    startMesh.receiveShadow = true;
    this.scene.add(startMesh);

    // Side bridges: fill gap between road edge (x=±10) and base inner edge (x=±16)
    // Width = 6, centre at x=±13, same z as centre strip
    const bridgeGeo = new THREE.BoxGeometry(6, 0.4, 32);
    [-13, 13].forEach(bx => {
      const bridge = new THREE.Mesh(bridgeGeo, startMat);
      bridge.position.set(bx, -0.2, 7);
      bridge.receiveShadow = true;
      this.scene.add(bridge);
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────
  setGroundColor(hex) { this.roadMat.color.setHex(hex); }

  isInRestZone(x, z) {
    // Fast path: player can only be in one zone at a time — skip the other 8 AABB checks
    if (z >= 0) return false;
    const idx = Math.min(Math.floor(-z / ZONE_LENGTH), this.restZones.length - 1);
    const rz  = this.restZones[idx];
    if (!rz) return false;
    return x >= rz.minX && x <= rz.maxX && z >= rz.minZ && z <= rz.maxZ;
  }

  getZoneIndex(z) {
    if (z > 0) return -1;
    return Math.min(Math.floor(-z / ZONE_LENGTH), NUM_ZONES - 1);
  }

  getTotalLength() { return NUM_ZONES * ZONE_LENGTH; }
}
