import * as THREE from 'three';
import {
  WAVE_CYCLE, WAVE_WARN, WAVE_TYPES, WAVE_ACTIVE_END_Z,
  ROAD_WIDTH, NUM_ZONES, ZONE_LENGTH,
} from './constants.js?v=21';

const ROAD_TOTAL   = NUM_ZONES * ZONE_LENGTH;
const WAVE_SPAWN_Z = -(ROAD_TOTAL - 5);   // far end of road (negative z)

// ── Shared geometry/material pools (created once per page load) ───────────────
const _sprayGeo  = new THREE.BoxGeometry(0.4, 0.4, 0.4);
const _sprayMat  = new THREE.MeshLambertMaterial({ color: 0xaee3f8, transparent: true, opacity: 0.7 });
const _coronaGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const _coronaMat = new THREE.MeshLambertMaterial({ color: 0x44eeff, transparent: true, opacity: 0.9 });

export class TsunamiMechanic {
  constructor(scene, road, audio = null) {
    this.scene   = scene;
    this.road    = road;
    this._audio  = audio;
    this._base   = null;   // set via setBase() for safe-zone check

    this.timer        = WAVE_CYCLE;
    this.active       = false;
    this.waveZ        = WAVE_SPAWN_Z;
    this.currentType  = null;
    this.warningShown = false;
    this._networkControlled  = false;  // true = server drives wave timing
    this._netWarnTO          = null;
    this._localWarnTO        = null;   // single-player: delay spawn after warning
    this._lastGroundColorHex = null;   // dirty flag — only call setGroundColor on change

    this._buildWaveMesh();
    this._buildUI();
  }

  /** Link the player's own base so the wave won't warp them when at base. */
  setBase(base) { this._base = base; }

  /**
   * Switch to server-controlled mode: local countdown is disabled;
   * wave events arrive via triggerNetworkWave*() from the network.
   */
  setNetworkControlled(v) { this._networkControlled = !!v; }

  // ── Network-sync API (called by main_multi.js) ────────────────────────────

  /** Server broadcasted 'wave_alert' — show warning, auto-spawn after WAVE_WARN s. */
  triggerNetworkWaveAlert(waveTypeName) {
    if (this.active || this.warningShown) return;
    clearTimeout(this._netWarnTO);
    const idx = WAVE_TYPES.findIndex(t => t.label === waveTypeName);
    this.currentType  = WAVE_TYPES[Math.max(0, idx)];
    this.warningShown = true;
    this._showWarning();
    // Auto-spawn after the same WAVE_WARN delay so UX matches local mode
    this._netWarnTO = setTimeout(() => {
      if (!this.active) this._spawnWave();
    }, WAVE_WARN * 1000);
  }

  /** Server broadcasted 'wave_start' — ensure wave is running now. */
  triggerNetworkWaveStart(waveTypeName) {
    if (this.active) return;
    clearTimeout(this._netWarnTO);
    const idx = WAVE_TYPES.findIndex(t => t.label === waveTypeName);
    this.currentType  = WAVE_TYPES[Math.max(0, idx)];
    this._spawnWave();
  }

  /** Server broadcasted 'wave_end' — force-end the wave if still active. */
  triggerNetworkWaveEnd() {
    clearTimeout(this._netWarnTO);
    if (this.active) this._endWave();
  }

  // ── 3-D Wave ──────────────────────────────────────────────────────────────
  _buildWaveMesh() {
    const w = ROAD_WIDTH + 8;

    // Taller wave wall (18 units vs old 14)
    this.waveMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, 18, 1.5),
      new THREE.MeshLambertMaterial({ color: 0x29B6F6, transparent: true, opacity: 0.85 }),
    );
    this.waveMesh.visible = false;
    this.scene.add(this.waveMesh);

    // Thicker foam crest
    this.foamMesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, 2.5, 3.0),
      new THREE.MeshLambertMaterial({ color: 0xeefaff, transparent: true, opacity: 0.92 }),
    );
    this.foamMesh.visible = false;
    this.scene.add(this.foamMesh);

    // 24 spray particles (was 12)
    this.sprays = [];
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Mesh(_sprayGeo, _sprayMat);
      s.visible = false;
      this.scene.add(s);
      this.sprays.push({
        mesh: s,
        ox: (Math.random() - 0.5) * w,
        vy: 2 + Math.random() * 5,
        t:  Math.random() * Math.PI * 2,
      });
    }

    // 6 corona sparks — glowing cubes that bob at the wave crest
    this.coronas = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(_coronaGeo, _coronaMat);
      c.visible = false;
      this.scene.add(c);
      this.coronas.push({
        mesh:  c,
        ox:    (i / 5 - 0.5) * w * 0.88,
        phase: i * (Math.PI * 2 / 6),
      });
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  _buildUI() {
    this._bar   = document.getElementById('slip-timer-bar');
    this._label = document.getElementById('slip-label');
    this._alert = document.getElementById('slip-alert');

    // Wave warning banner
    const banner = document.createElement('div');
    banner.id = 'wave-banner';
    banner.style.cssText = `
      position:fixed;top:90px;left:50%;transform:translateX(-50%);
      font-size:26px;font-weight:bold;color:#fff;
      text-shadow:0 0 14px #0af,0 0 28px #08f;
      display:none;z-index:25;pointer-events:none;text-align:center;
      background:rgba(0,30,80,0.78);padding:10px 28px;border-radius:14px;
      border:2px solid #29B6F6;white-space:nowrap;
    `;
    document.body.appendChild(banner);
    this._banner = banner;

    // (demon face removed — was blocking the gameplay view)
  }

  // ── Main update ───────────────────────────────────────────────────────────
  update(dt, player, onWarp) {
    if (this.active) {
      this._updateWave(dt, player, onWarp);
    } else {
      this._updateCountdown(dt);
    }
    this._animateSprays(dt);
  }

  _updateCountdown(dt) {
    // In network-controlled mode the server manages timing — just show safe status
    if (this._networkControlled) {
      this._bar.style.width      = '100%';
      this._bar.style.background = '#2ecc71';
      this._label.textContent    = '地面狀態：安全 ✅';
      return;
    }

    this.timer -= dt;
    const remaining = Math.max(0, this.timer);

    const pct = remaining / WAVE_CYCLE;
    this._bar.style.width      = (pct * 100) + '%';
    this._bar.style.background = '#2ecc71';
    this._label.textContent    = `地面狀態：安全 ✅（${Math.ceil(remaining)}s）`;

    if (remaining <= WAVE_WARN && !this.warningShown) {
      this.warningShown = true;
      this.currentType  = WAVE_TYPES[Math.floor(Math.random() * WAVE_TYPES.length)];
      this._showWarning();
      // Spawn AFTER the warning period so the player has time to flee
      clearTimeout(this._localWarnTO);
      this._localWarnTO = setTimeout(() => {
        if (!this.active) this._spawnWave();
      }, WAVE_WARN * 1000);
    }
  }

  _showWarning() {
    this._audio?.playWaveWarning();
    const t = this.currentType;
    this._banner.style.borderColor = t.cssColor;
    this._banner.innerHTML =
      `🌊 海嘯警報！<br>` +
      `<span style="color:${t.cssColor};font-size:22px">${t.label} 海嘯來了！</span><br>` +
      `<span style="font-size:16px">快跑！或躲進凹槽！</span>`;
    this._banner.style.display = 'block';
    setTimeout(() => { this._banner.style.display = 'none'; }, 4000);
  }

  _spawnWave() {
    this.active   = true;
    this.waveZ    = WAVE_SPAWN_Z;
    this.warningShown = false;

    const t = this.currentType;
    this.waveMesh.material.color.setHex(t.color);
    this.waveMesh.position.set(0, 6, WAVE_SPAWN_Z);   // center y=6, height 18 → bottom -3, top +15
    this.waveMesh.visible = true;
    this.foamMesh.position.set(0, 15.2, WAVE_SPAWN_Z); // sits on top of taller wave
    this.foamMesh.visible = true;
    this.sprays.forEach(s  => { s.mesh.visible  = true; });
    this.coronas.forEach(c => { c.mesh.visible  = true; });

    this._alert.style.display = 'block';
    this._alert.textContent   = '🌊 海嘯來了！';

    // Switch to tense music
    this._audio?.startTenseMusic?.();
  }

  _updateWave(dt, player, onWarp) {
    const speed = this.currentType?.speed ?? 53;
    this.waveZ += speed * dt;

    this.waveMesh.position.z = this.waveZ;
    this.foamMesh.position.z = this.waveZ;

    // Progress bar
    const travelled = this.waveZ - WAVE_SPAWN_Z;
    const total     = WAVE_ACTIVE_END_Z - WAVE_SPAWN_Z;
    const pct = Math.max(0, 1 - travelled / total);
    this._bar.style.width      = (pct * 100) + '%';
    this._bar.style.background = this.currentType?.cssColor ?? '#29B6F6';
    this._label.textContent    = `🌊 ${this.currentType?.label} 海嘯進行中！`;

    // Dirty-flag: avoid GPU material re-upload every frame when color is unchanged
    if (this._lastGroundColorHex !== 0x1565C0) {
      this._lastGroundColorHex = 0x1565C0;
      this.road.setGroundColor(0x1565C0);
    }

    // Collision: only in Pokémon zones, exempt from base area
    const pz       = player.position.z;
    const inBase   = this._base ? this._base.isNearBase(player.position) : false;
    const inRest   = this.road.isInRestZone(player.position.x, pz);
    const onRoad   = pz < 1;    // past starting platform

    if (onRoad && !inBase && !inRest && !player.isWarped && this.waveZ >= pz - 1.5) {
      onWarp();
    }

    // Wave exits the Pokémon zone — end it
    if (this.waveZ > WAVE_ACTIVE_END_Z) {
      this._endWave();
    }
  }

  _endWave() {
    this.active   = false;
    this.timer    = WAVE_CYCLE;
    this.waveMesh.visible = false;
    this.foamMesh.visible = false;
    this.sprays.forEach(s  => { s.mesh.visible  = false; });
    this.coronas.forEach(c => { c.mesh.visible  = false; });
    this._alert.style.display = 'none';

    if (this._lastGroundColorHex !== 0x4CAF50) {
      this._lastGroundColorHex = 0x4CAF50;
      this.road.setGroundColor(0x4CAF50);
    }
    this._bar.style.background = '#2ecc71';
    this._bar.style.width = '100%';

    this._audio?.playWaveEnd?.();
    this._audio?.stopTenseMusic?.();   // restore normal BGM

    this._banner.innerHTML = '✅ 海嘯結束！安全了！';
    this._banner.style.borderColor = '#2ecc71';
    this._banner.style.display = 'block';
    setTimeout(() => { this._banner.style.display = 'none'; }, 2500);
  }

  _animateSprays(dt) {
    if (!this.active) return;
    const t = performance.now() / 1000;

    // Spray particles — higher range to match taller wave crest (~y 15)
    this.sprays.forEach((s, i) => {
      s.mesh.position.set(
        s.ox,
        15 + Math.sin(t * 3 + s.t) * 3.5,
        this.waveZ + Math.cos(t * 2 + s.t) * 1.4,
      );
      s.mesh.rotation.x = t + i;
      s.mesh.rotation.z = t * 0.7 + i;
    });

    // Corona sparks — bright cubes bobbing along the crest
    this.coronas.forEach((c, i) => {
      const angle = t * 2.2 + c.phase;
      c.mesh.position.set(
        c.ox + Math.sin(angle * 0.7) * 1.0,
        16.0 + Math.sin(angle) * 2.2,
        this.waveZ + Math.cos(angle * 0.6) * 1.6,
      );
      c.mesh.rotation.y = angle * 1.8;
      c.mesh.rotation.x = angle * 0.9;
    });
  }

  isWaveActive() { return this.active; }
  getWaveZ()     { return this.waveZ; }
}
