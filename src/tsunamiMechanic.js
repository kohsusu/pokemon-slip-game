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

    // ── 蒼龍惡鬼 demon-face CSS ────────────────────────────────────────────
    if (!document.getElementById('_tsunami-face-css')) {
      const s = document.createElement('style');
      s.id = '_tsunami-face-css';
      s.textContent = `
        #tsunami-face {
          position:fixed; left:50%; top:18%;
          transform:translate(-50%,-50%);
          width:320px; height:280px;
          z-index:16; pointer-events:none;
          display:none;
        }
        #tsunami-face.tf-visible {
          display:block;
          animation:tfFadeIn 1.4s ease forwards;
        }
        @keyframes tfFadeIn {
          from { opacity:0; transform:translate(-50%,-50%) scale(0.6); }
          to   { opacity:1; transform:translate(-50%,-50%) scale(1); }
        }
        .tf-aura {
          position:absolute; inset:-70px;
          background:radial-gradient(ellipse, rgba(0,210,255,0.44) 0%, rgba(0,100,200,0.18) 42%, transparent 70%);
          border-radius:50%;
          animation:tfAura 0.9s ease-in-out infinite alternate;
        }
        @keyframes tfAura {
          from { transform:scale(0.87); opacity:0.68; }
          to   { transform:scale(1.10); opacity:1; }
        }
        .tf-brow-l, .tf-brow-r {
          position:absolute; top:14px;
          width:82px; height:12px;
          background:rgba(0,210,255,0.88);
          border-radius:6px;
          box-shadow:0 0 10px #0ff, 0 0 22px #0af;
        }
        .tf-brow-l { left:6px;  transform:rotate(22deg); }
        .tf-brow-r { right:6px; transform:rotate(-22deg); }
        .tf-eye-l, .tf-eye-r {
          position:absolute; top:34px;
          width:84px; height:62px;
          background:radial-gradient(ellipse, #fff 0%, #00ffff 30%, #0088cc 62%, transparent 100%);
          border-radius:50%;
          box-shadow:0 0 26px #0ff, 0 0 55px #0af, 0 0 90px #0088ff;
          animation:tfEye 0.44s ease-in-out infinite alternate;
          overflow:hidden;
        }
        @keyframes tfEye {
          from { transform:scaleY(1); }
          to   { transform:scaleY(0.80); }
        }
        .tf-eye-l { left:8px; }
        .tf-eye-r { right:8px; }
        .tf-pupil {
          position:absolute; left:50%; top:50%;
          transform:translate(-50%,-50%);
          width:30px; height:42px;
          background:#000a14; border-radius:40%;
        }
        .tf-nose {
          position:absolute; left:50%; top:48%;
          transform:translate(-50%,-50%);
          width:0; height:0;
          border-left:16px solid transparent;
          border-right:16px solid transparent;
          border-top:28px solid rgba(0,165,220,0.65);
          filter:drop-shadow(0 0 6px #0af);
        }
        .tf-mouth {
          position:absolute; bottom:8px; left:5%; right:5%;
          height:84px;
          background:radial-gradient(ellipse at 50% 0%, #002244 0%, #000811 65%);
          border-radius:0 0 55% 55%;
          border-top:3px solid rgba(0,210,255,0.78);
          box-shadow:0 0 20px rgba(0,210,255,0.55) inset;
          overflow:hidden;
        }
        .tf-fangs { display:flex; justify-content:center; gap:5px; padding-top:2px; }
        .tf-fang {
          background:rgba(200,245,255,0.93);
          clip-path:polygon(15% 0%, 85% 0%, 65% 100%, 35% 100%);
          box-shadow:0 0 6px #0af;
        }
        .tf-big    { width:28px; height:38px; }
        .tf-sml    { width:20px; height:26px; }
        .tf-ctr    { height:46px !important; }
        .tf-drip {
          position:absolute; bottom:0;
          background:rgba(0,210,255,0.52); border-radius:0 0 50% 50%;
          animation:tfDrip var(--dd,1.8s) ease-in var(--dl,0s) infinite;
        }
        @keyframes tfDrip {
          0%   { height:0; opacity:0.9; }
          70%  { height:30px; }
          100% { height:30px; opacity:0; transform:translateY(8px); }
        }

        /* ── Screen edge glow ── */
        #tsunami-edge-glow {
          position:fixed; inset:0; pointer-events:none; z-index:21;
          display:none;
          animation:tfEdge 0.7s ease-in-out infinite alternate;
        }
        @keyframes tfEdge {
          from { box-shadow:inset 0 0 70px rgba(0,150,255,0.22); }
          to   { box-shadow:inset 0 0 155px rgba(0,220,255,0.62),
                            inset 0 0 260px rgba(0,100,200,0.20); }
        }
      `;
      document.head.appendChild(s);
    }

    // Demon face element
    const face = document.createElement('div');
    face.id = 'tsunami-face';
    face.innerHTML = `
      <div class="tf-aura"></div>
      <div class="tf-brow-l"></div>
      <div class="tf-brow-r"></div>
      <div class="tf-eye-l"><div class="tf-pupil"></div></div>
      <div class="tf-eye-r"><div class="tf-pupil"></div></div>
      <div class="tf-nose"></div>
      <div class="tf-mouth">
        <div class="tf-fangs">
          <div class="tf-fang tf-sml"></div>
          <div class="tf-fang tf-big"></div>
          <div class="tf-fang tf-sml"></div>
          <div class="tf-fang tf-big tf-ctr"></div>
          <div class="tf-fang tf-sml"></div>
          <div class="tf-fang tf-big"></div>
          <div class="tf-fang tf-sml"></div>
        </div>
        <div class="tf-drip" style="width:6px;left:14%;--dd:1.6s;--dl:0s"></div>
        <div class="tf-drip" style="width:8px;left:33%;--dd:1.9s;--dl:0.45s"></div>
        <div class="tf-drip" style="width:5px;left:56%;--dd:1.4s;--dl:0.2s"></div>
        <div class="tf-drip" style="width:7px;left:75%;--dd:2.1s;--dl:0.75s"></div>
      </div>
    `;
    document.body.appendChild(face);
    this._face = face;

    // Screen edge glow overlay
    const edgeGlow = document.createElement('div');
    edgeGlow.id = 'tsunami-edge-glow';
    document.body.appendChild(edgeGlow);
    this._edgeGlow = edgeGlow;
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

    // Show demon face + screen glow
    this._face.classList.add('tf-visible');
    this._edgeGlow.style.display = 'block';

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

    // Hide demon face + screen glow
    this._face.classList.remove('tf-visible');
    this._edgeGlow.style.display = 'none';
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
