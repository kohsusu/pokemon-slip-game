import * as THREE from 'three';
import {
  PLAYER_BASE_SPEED, PLAYER_SPRINT_MULT, ROAD_WIDTH, NUM_ZONES, ZONE_LENGTH,
  CARRY_CAPACITY, MAGNET_BASE_RANGE, MAGNET_RANGE_PER_LV,
} from './constants.js?v=21';
// v=25 — grip removed; magnet + carry upgrades; load penalty

export class Player {
  constructor(scene) {
    this.scene        = scene;
    this.speedLevel   = 0;
    this.magnetLevel  = 0;   // set from economy after upgrade
    this.isWarped     = false;
    this.heldGift     = null;  // giftId when carrying a gift box, null otherwise
    this._sprinting   = false;
    this._spacePrev   = false;

    this._buildMesh();
    this._setupInput();

    this.heldPokemon = [];
  }

  carryCapacity()    { return CARRY_CAPACITY; }
  pickupGift(giftId) { this.heldGift = giftId; }
  useGift()          { const id = this.heldGift; this.heldGift = null; return id; }
  getPickupRangeSq() {
    const r = MAGNET_BASE_RANGE + this.magnetLevel * MAGNET_RANGE_PER_LV;
    return r * r;
  }

  // ── LEGO minifigure model ───────────────────────────────────────────────────
  _buildMesh() {
    const group = new THREE.Group();

    // Shared material helper
    const _m = hex => new THREE.MeshLambertMaterial({ color: hex });

    // Colour palette
    const SKIN  = 0xFFCC80;
    const TEAM  = 0x1565C0;   // default; overridden by setTeamColor()
    const DARK  = 0x0D47A1;   // legs & hip
    const BLACK = 0x111111;   // eyes + smile

    // Collect materials that need team-colour tinting
    this._teamColorMats = [];

    // ── Legs (pivots at hip joint — legs hang below) ──────────────────────────
    //   Leg box: 0.32 × 0.62 × 0.30.  Pivot at y = 0.62 (hip height).
    //   Mesh centered at y = −0.31 so the top of the leg sits at the pivot.
    const legGeo = new THREE.BoxGeometry(0.32, 0.62, 0.30);
    [[-0.21, '_leftLegPivot'], [0.21, '_rightLegPivot']].forEach(([px, key]) => {
      const pivot   = new THREE.Group();
      pivot.position.set(px, 0.62, 0);
      const legMesh = new THREE.Mesh(legGeo, _m(DARK));
      legMesh.position.y = -0.31;
      legMesh.castShadow = true;
      pivot.add(legMesh);
      group.add(pivot);
      this[key] = pivot;   // _leftLegPivot / _rightLegPivot
    });

    // ── Hip block ─────────────────────────────────────────────────────────────
    const hip = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.20, 0.42), _m(DARK));
    hip.position.y = 0.72;
    hip.castShadow = true;
    group.add(hip);

    // ── Torso ─────────────────────────────────────────────────────────────────
    //   Occupies y 0.82 → 1.54.  Sprint lean applied to this mesh.
    const torsoMat = _m(TEAM);
    this._teamColorMats.push(torsoMat);
    this._torso = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.72, 0.44), torsoMat);
    this._torso.position.y = 1.18;
    this._torso.castShadow = true;
    group.add(this._torso);

    // ── Neck stub ─────────────────────────────────────────────────────────────
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 8), _m(SKIN));
    neck.position.y = 1.61;
    group.add(neck);

    // ── Head (LEGO cylinder) ──────────────────────────────────────────────────
    //   Base at y 1.68, top at y 2.16.  Centre at 1.92.
    const HEAD_CY = 1.92;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.48, 12), _m(SKIN));
    head.position.y = HEAD_CY;
    head.castShadow = true;
    group.add(head);

    // Head stud (LEGO knob on top)
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.12, 8), _m(SKIN));
    stud.position.y = HEAD_CY + 0.30;   // top of head + half stud ≈ 2.22
    group.add(stud);

    // Eyes — two small dark boxes at the front face of the head cylinder (z ≈ 0.30)
    const eyeGeo = new THREE.BoxGeometry(0.09, 0.10, 0.06);
    const eyeMat = _m(BLACK);
    [-0.11, 0.11].forEach(ex => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(ex, HEAD_CY + 0.04, 0.30);
      group.add(eye);
    });

    // Smile — thin box below the eyes
    const smile = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), _m(BLACK));
    smile.position.set(0, HEAD_CY - 0.12, 0.30);
    group.add(smile);

    // ── Arms (pivots at shoulder joint — arms + hands hang below) ────────────
    //   Shoulder at y = 1.48, ±0.46 to clear the torso sides.
    const armGeo  = new THREE.BoxGeometry(0.22, 0.50, 0.22);
    const handGeo = new THREE.SphereGeometry(0.14, 6, 4);
    [[-0.46, '_leftArmPivot'], [0.46, '_rightArmPivot']].forEach(([ax, key]) => {
      const aMat  = _m(TEAM);
      this._teamColorMats.push(aMat);
      const pivot = new THREE.Group();
      pivot.position.set(ax, 1.48, 0);
      const arm = new THREE.Mesh(armGeo, aMat);
      arm.position.y = -0.25;
      arm.castShadow = true;
      pivot.add(arm);
      const hand = new THREE.Mesh(handGeo, _m(SKIN));
      hand.position.y = -0.53;
      pivot.add(hand);
      group.add(pivot);
      this[key] = pivot;   // _leftArmPivot / _rightArmPivot
    });

    // ── Walk animation state ──────────────────────────────────────────────────
    this._walkPhase = 0;
    this._walkBlend = 0;   // 0 = still, 1 = full-stride; smoothly transitions

    // ── Scene registration ────────────────────────────────────────────────────
    group.position.set(0, 0, 5);
    this.scene.add(group);
    this.mesh = group;

    // ── Held-Pokémon sprites (above head, fanned horizontally) ───────────────
    //   Cap > 1: spread at ±0.75 steps so sprites never overlap.
    this.holdIndicators = [];
    const _cap = this.carryCapacity();
    for (let i = 0; i < _cap; i++) {
      const iMat = new THREE.SpriteMaterial({ transparent: true, opacity: 0 });
      const sp   = new THREE.Sprite(iMat);
      sp.scale.set(1.4, 1.4, 1);
      const xOff = _cap > 1 ? (i - (_cap - 1) / 2) * 0.75 : 0;
      sp.position.set(xOff, 2.85, 0);
      group.add(sp);
      this.holdIndicators.push(sp);
    }
  }

  /**
   * Apply team colour to torso + both arms.
   * Replaces the old mesh.children[index] approach — safe across model rebuilds.
   */
  setTeamColor(cssHex) {
    const hex = parseInt(cssHex.replace('#', ''), 16);
    this._teamColorMats.forEach(m => m.color.setHex(hex));
  }

  _setupInput() {
    this.keys = {};
    window.addEventListener('keydown', e => { this.keys[e.code] = true; });
    window.addEventListener('keyup',   e => { this.keys[e.code] = false; });
  }

  get position()    { return this.mesh.position; }
  get keysRef()     { return this.keys; }
  get isSprinting() { return this._sprinting; }

  getSpeed() {
    // Carry load penalty: each held Pokémon costs 9% speed (max −27% at full 3)
    const load  = this.heldPokemon.length;
    const loadF = load >= 3 ? 0.73 : load >= 2 ? 0.82 : load >= 1 ? 0.91 : 1.0;
    if (this._sprinting) return (PLAYER_BASE_SPEED * PLAYER_SPRINT_MULT + this.speedLevel * 5) * loadF;
    return PLAYER_BASE_SPEED * loadF;
  }

  update(dt) {
    if (this.isWarped) return;

    // ── Input & movement ──────────────────────────────────────────────────────
    const spaceNow = !!this.keys['Space'];
    if (spaceNow && !this._spacePrev) this._sprinting = !this._sprinting;
    this._spacePrev = spaceNow;

    const speed = this.getSpeed();
    let dx = 0, dz = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp'])    dz -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'])  dz += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'])  dx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += 1;

    const isMoving = dx !== 0 || dz !== 0;
    if (isMoving) {
      const len = Math.sqrt(dx * dx + dz * dz);
      this.mesh.position.x += (dx / len) * speed * dt;
      this.mesh.position.z += (dz / len) * speed * dt;
      this.mesh.rotation.y  = Math.atan2(dx, dz);
    }

    const maxX = this.mesh.position.z > -20 ? 30 : ROAD_WIDTH / 2 - 0.5;
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -maxX, maxX);
    this.mesh.position.z = THREE.MathUtils.clamp(this.mesh.position.z, -(NUM_ZONES * ZONE_LENGTH), 20);
    this.mesh.position.y = 0;

    // ── Walk animation ────────────────────────────────────────────────────────
    //   _walkBlend ramps 0 → 1 on move start and 1 → 0 on stop (dt*10 ≈ 100ms ramp).
    const targetBlend = isMoving ? 1 : 0;
    this._walkBlend += (targetBlend - this._walkBlend) * Math.min(1, dt * 10);

    if (isMoving) {
      // Advance phase; sprint runs faster
      this._walkPhase += dt * (this._sprinting ? 11 : 7);
    } else {
      // Ease phase back to the nearest leg-neutral position (sin = 0 at nπ)
      const nearest = Math.round(this._walkPhase / Math.PI) * Math.PI;
      this._walkPhase += (nearest - this._walkPhase) * Math.min(1, dt * 8);
    }

    const swing = Math.sin(this._walkPhase) * 0.55 * this._walkBlend;
    this._leftLegPivot.rotation.x  =  swing;
    this._rightLegPivot.rotation.x = -swing;
    this._leftArmPivot.rotation.x  = -swing * 0.62;   // arms swing opposite to legs
    this._rightArmPivot.rotation.x =  swing * 0.62;

    // Sprint forward lean (torso tilts slightly in local +z direction)
    const leanTarget = (this._sprinting && isMoving) ? 0.16 : 0;
    this._torso.rotation.x += (leanTarget - this._torso.rotation.x) * Math.min(1, dt * 8);

    // Bob ALL held-Pokémon sprites in sync
    if (this.heldPokemon.length > 0) {
      const bob = Math.sin(performance.now() / 1000 * 2) * 0.12;
      this.holdIndicators.forEach((sp, i) => {
        if (this.heldPokemon[i]) sp.position.y = 2.85 + bob;
      });
    }
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
