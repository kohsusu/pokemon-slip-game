import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { ROAD_WIDTH, NUM_ZONES, ZONE_LENGTH, ZONES_PER_TIER, TIER_COLORS_HEX } from './constants.js?v=14';

export const GROUND_COLOR_SAFE   = 0x4CAF50;
export const GROUND_COLOR_YELLOW = 0xFFC107;
export const GROUND_COLOR_RED    = 0xF44336;

export class Road {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];   // { mesh, zone, isRest }
    this.restZones = [];  // bounding boxes of rest grooves
    this._buildRoad();
  }

  _buildRoad() {
    const totalLength = NUM_ZONES * ZONE_LENGTH;

    // Main road surface
    const roadGeo = new THREE.BoxGeometry(ROAD_WIDTH, 0.4, totalLength);
    this.roadMat = new THREE.MeshLambertMaterial({ color: GROUND_COLOR_SAFE });
    this.roadMesh = new THREE.Mesh(roadGeo, this.roadMat);
    // Road runs along -Z (player walks in -Z direction = "up the hill")
    this.roadMesh.position.set(0, -0.2, -(totalLength / 2));
    this.roadMesh.receiveShadow = true;
    this.scene.add(this.roadMesh);

    // Zone dividers + labels
    for (let z = 0; z < NUM_ZONES; z++) {
      const zStart = -(z * ZONE_LENGTH);
      const zEnd   = -((z + 1) * ZONE_LENGTH);
      const zMid   = (zStart + zEnd) / 2;

      // Side walls per zone (visual boundary)
      this._addWall(zStart, zEnd, -ROAD_WIDTH / 2 - 0.3, z);
      this._addWall(zStart, zEnd,  ROAD_WIDTH / 2 + 0.3, z);

      // Rest groove at the end of each zone
      const grooveZ = zEnd + 2;
      this._addRestGroove(grooveZ, z);
    }

    // Starting platform (base area at Z = 0)
    const startGeo = new THREE.BoxGeometry(30, 0.4, 20);
    const startMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
    const startMesh = new THREE.Mesh(startGeo, startMat);
    startMesh.position.set(0, -0.2, 10);
    startMesh.receiveShadow = true;
    this.scene.add(startMesh);
  }

  _addWall(zStart, zEnd, x, zoneIdx) {
    const len  = Math.abs(zEnd - zStart);
    const geo  = new THREE.BoxGeometry(0.5, 1.5, len);
    const tier = Math.floor(zoneIdx / ZONES_PER_TIER);
    const mat  = new THREE.MeshLambertMaterial({ color: TIER_COLORS_HEX[tier] });
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set(x, 0.6, (zStart + zEnd) / 2);
    wall.castShadow = true;
    this.scene.add(wall);
  }

  _addRestGroove(centerZ, zoneIdx) {
    // A sunken groove (凹槽) — darker colored, slightly lower
    const geo = new THREE.BoxGeometry(ROAD_WIDTH, 0.4, 4);
    const mat = new THREE.MeshLambertMaterial({ color: 0x795548 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, -0.4, centerZ);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // Sign above groove
    const signGeo = new THREE.BoxGeometry(2, 0.8, 0.1);
    const signMat = new THREE.MeshLambertMaterial({ color: 0xFFF176 });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 1.5, centerZ);
    this.scene.add(sign);

    // Record bounding box for safe zone check
    this.restZones.push({
      minX: -ROAD_WIDTH / 2,
      maxX:  ROAD_WIDTH / 2,
      minZ: centerZ - 2,
      maxZ: centerZ + 2,
    });
  }

  setGroundColor(hex) {
    this.roadMat.color.setHex(hex);
  }

  isInRestZone(x, z) {
    return this.restZones.some(rz =>
      x >= rz.minX && x <= rz.maxX &&
      z >= rz.minZ && z <= rz.maxZ
    );
  }

  getZoneIndex(z) {
    if (z > 0) return -1; // on starting platform
    const idx = Math.floor(-z / ZONE_LENGTH);
    return Math.min(idx, NUM_ZONES - 1);
  }

  getTotalLength() {
    return NUM_ZONES * ZONE_LENGTH;
  }
}
