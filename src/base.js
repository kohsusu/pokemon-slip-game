import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { BASE_SEATS_PER_FLOOR } from './constants.js?v=17';

const BASE_W  = 18;
const BASE_D  = 12;
const FLOOR_Y = 0.5;

// ── Multiplayer: per-player base positions ────────────────────────────────
// All placed at z > −8 so the player clamping allows x = ±24
const _BASE_POSITIONS = [
  { x:  22, z: -1 },   // 0: red
  { x: -22, z: -1 },   // 1: blue
  { x:  22, z: -6 },   // 2: green
  { x: -22, z: -6 },   // 3: orange
];

/** Return the 3-D position of the base for a given player slot (0-3). */
export function getBasePos(playerId) {
  return _BASE_POSITIONS[playerId % 4] ?? _BASE_POSITIONS[0];
}

/** Return the warp-arrival position (just toward the road from the base). */
export function getBaseWarpPos(playerId) {
  const sx = (playerId % 2 === 0) ? 1 : -1;
  return { x: sx * 10, z: 3 };
}

// ── PlayerBase ────────────────────────────────────────────────────────────
export class PlayerBase {
  /**
   * @param {THREE.Scene} scene
   * @param {{ x?: number, z?: number, colorHex?: number }} opts
   */
  constructor(scene, opts = {}) {
    this.scene   = scene;
    this._bx     = opts.x        ?? 18;
    this._bz     = opts.z        ?? -5;
    this._hex    = opts.colorHex ?? 0x5D4037;
    this.seats   = [];
    this._buildBase();
  }

  _buildBase() {
    const { _bx: bx, _bz: bz, _hex: hex } = this;

    // Foundation slab — team colour
    const foundGeo = new THREE.BoxGeometry(BASE_W + 2, 0.5, BASE_D + 2);
    const found = new THREE.Mesh(foundGeo, new THREE.MeshLambertMaterial({ color: hex }));
    found.position.set(bx, 0.25, bz);
    found.receiveShadow = true;
    this.scene.add(found);

    // Floor slab (light grey)
    const floorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(BASE_W, 0.2, BASE_D),
      new THREE.MeshLambertMaterial({ color: 0xECEFF1 }),
    );
    floorMesh.position.set(bx, FLOOR_Y, bz);
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // Corner pillars — team colour
    const pillarMat = new THREE.MeshLambertMaterial({ color: hex });
    const pillarGeo = new THREE.BoxGeometry(0.5, 3.2, 0.5);
    [[-BASE_W / 2, -BASE_D / 2], [BASE_W / 2, -BASE_D / 2],
     [-BASE_W / 2,  BASE_D / 2], [BASE_W / 2,  BASE_D / 2]].forEach(([px, pz]) => {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(bx + px, FLOOR_Y + 1.6, bz + pz);
      p.castShadow = true;
      this.scene.add(p);
    });

    // Seats: 4 cols × 4 rows = 16
    const COLS = 4;
    const seatMat = new THREE.MeshLambertMaterial({ color: 0x78909C });
    const seatGeo = new THREE.BoxGeometry(0.7, 0.4, 0.7);
    for (let s = 0; s < BASE_SEATS_PER_FLOOR; s++) {
      const col   = s % COLS;
      const row   = Math.floor(s / COLS);
      const seatX = bx - BASE_W / 2 + 2 + col * (BASE_W - 4) / (COLS - 1);
      const seatZ = bz - BASE_D / 2 + 2 + row * (BASE_D - 4) / (Math.ceil(BASE_SEATS_PER_FLOOR / COLS) - 1);
      const seatMesh = new THREE.Mesh(seatGeo, seatMat);
      seatMesh.position.set(seatX, FLOOR_Y + 0.35, seatZ);
      seatMesh.castShadow = true;
      this.scene.add(seatMesh);
      this.seats.push({ seatIdx: s, pokemon: null, mesh: seatMesh });
    }
  }

  update(_dt) {}

  placePokemon(pokemon) {
    const emptySeat = this.seats.find(s => s.pokemon === null);
    if (!emptySeat) return null;
    emptySeat.pokemon = pokemon;
    pokemon.group.visible = true;
    pokemon.group.position.copy(emptySeat.mesh.position);
    pokemon.group.position.y += 0.4;
    pokemon.carried = false;
    pokemon.seated  = true;
    return emptySeat;
  }

  removePokemon(pokemon) {
    const seat = this.seats.find(s => s.pokemon === pokemon);
    if (seat) {
      seat.pokemon   = null;
      pokemon.seated = false;
    }
  }

  getSeatedPokemon() {
    return this.seats.filter(s => s.pokemon !== null).map(s => s.pokemon);
  }

  isNearBase(playerPos) {
    const dx = playerPos.x - this._bx;
    const dz = playerPos.z - this._bz;
    return Math.sqrt(dx * dx + dz * dz) < 12;
  }
}
