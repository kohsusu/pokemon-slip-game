import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { PLAYER_BASE_SPEED, PLAYER_SPRINT_MULT, ROAD_WIDTH, NUM_ZONES, ZONE_LENGTH, CARRY_CAPACITY } from './constants.js?v=17';

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.speedLevel   = 0;
    this.gripLevel    = 0;
    this.isWarped     = false;
    this._sprinting   = false;
    this._spacePrev   = false;

    this._buildMesh();
    this._setupInput();

    this.heldPokemon  = [];   // array — up to carryCapacity()
  }

  carryCapacity() { return CARRY_CAPACITY; }   // fixed at 1

  _buildMesh() {
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.7, 1.0, 0.5);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1565C0 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.32, 8, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xFFCC80 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.55;
    head.castShadow = true;
    group.add(head);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.28, 0.6, 0.28);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x0D47A1 });
    [-0.2, 0.2].forEach(x => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, 0.3, 0);
      leg.castShadow = true;
      group.add(leg);
    });

    group.position.set(0, 0, 5);
    this.scene.add(group);
    this.mesh = group;

    // Up to 6 hold-indicators floating above head (one per carry slot)
    this.holdIndicators = [];
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.SpriteMaterial({ transparent: true, opacity: 0 });
      const sp  = new THREE.Sprite(mat);
      sp.scale.set(1.1, 1.1, 1);
      // Arrange in a small arc above head
      const angle = (i / 5) * Math.PI - Math.PI / 2;
      sp.position.set(Math.cos(angle) * 0.8, 2.4 + i * 0.2, 0);
      group.add(sp);
      this.holdIndicators.push(sp);
    }
  }

  _setupInput() {
    this.keys = {};
    window.addEventListener('keydown', e => { this.keys[e.code] = true; });
    window.addEventListener('keyup',   e => { this.keys[e.code] = false; });
  }

  get position() { return this.mesh.position; }

  // expose keys for interaction handler in main
  get keysRef() { return this.keys; }

  get isSprinting() { return this._sprinting; }

  getSpeed() {
    // Walk: fixed base speed (no upgrade bonus)
    // Sprint: base * multiplier + upgrade bonus
    if (this._sprinting) {
      return PLAYER_BASE_SPEED * PLAYER_SPRINT_MULT + this.speedLevel * 2.5;
    }
    return PLAYER_BASE_SPEED;
  }

  update(dt) {
    if (this.isWarped) return;

    // Toggle sprint on Space press (not hold)
    const spaceNow = !!this.keys['Space'];
    if (spaceNow && !this._spacePrev) this._sprinting = !this._sprinting;
    this._spacePrev = spaceNow;

    const speed = this.getSpeed();
    let dx = 0, dz = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp'])    dz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  dz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  dx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;

    if (dx !== 0 || dz !== 0) {
      const len = Math.sqrt(dx * dx + dz * dz);
      dx /= len; dz /= len;
      this.mesh.position.x += dx * speed * dt;
      this.mesh.position.z += dz * speed * dt;
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }

    // Near base/shop (z > -8): allow wide X movement; on road: clamp to road width
    const maxX = this.mesh.position.z > -8 ? 24 : ROAD_WIDTH / 2 - 0.5;
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -maxX, maxX);
    const minZ = -(NUM_ZONES * ZONE_LENGTH);
    this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, minZ, 15);
    this.mesh.position.y = 0;

    // Bob held pokemon sprites
    const t = performance.now() / 1000;
    this.holdIndicators.forEach((sp, i) => {
      sp.position.y = 2.3 + Math.sin(t * 2 + i) * 0.08;
    });
  }

  // ── Carry methods ─────────────────────────────────────────────────────────
  canPickup() { return this.heldPokemon.length < this.carryCapacity(); }

  pickup(pokemon) {
    if (!this.canPickup()) return false;
    this.heldPokemon.push(pokemon);
    this._refreshIndicators();
    return true;
  }

  dropAll() {
    const dropped = [...this.heldPokemon];
    this.heldPokemon = [];
    this._refreshIndicators();
    return dropped;
  }

  dropOne() {
    const p = this.heldPokemon.pop();
    this._refreshIndicators();
    return p;
  }

  _refreshIndicators() {
    this.holdIndicators.forEach((sp, i) => {
      const p = this.heldPokemon[i];
      if (p) {
        if (p._tex) { sp.material.map = p._tex; sp.material.needsUpdate = true; }
        sp.material.opacity = 1;
      } else {
        sp.material.opacity = 0;
      }
    });
  }

  /** Override warp destination (used by multiplayer per-player base). */
  setWarpPosition(x, z) { this._warpPos = { x, z }; }

  warpToBase() {
    this.isWarped = true;
    const dropped = this.dropAll();
    const wp = this._warpPos ?? { x: 0, z: 5 };
    setTimeout(() => {
      this.mesh.position.set(wp.x, 0, wp.z);
      this.isWarped = false;
    }, 400);
    return dropped;
  }

  // Legacy compat
  get holdingPokemon() { return this.heldPokemon[0] ?? null; }
}
