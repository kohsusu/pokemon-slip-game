import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createScene }     from './scene.js?v=16';
import { Road }            from './road.js?v=17';
import { Player }          from './player.js?v=19';
import { TsunamiMechanic } from './tsunamiMechanic.js?v=16';
import { PokemonManager, preloadPokemonModels } from './pokemon.js?v=23';
import { PlayerBase }      from './base.js?v=18';
import { Economy }         from './economy.js?v=16';
import { Shop }            from './shop.js?v=17';
import { AudioManager }    from './audio.js?v=16';
import { TouchControls }   from './touch_controls.js?v=16';
import {
  ZONE_LENGTH, ZONES_PER_TIER, TIER_UNLOCK_COST, TIER_NAMES,
  TIER_CSS_COLORS, ROAD_WIDTH, SPRITE_BASE,
} from './constants.js?v=17';

// ── Victory ────────────────────────────────────────────────────────────────
const VICTORY_THRESHOLD = 10_000_000_000_000; // 10000B
let   _gameOver         = false;

const _RAIN_IDS = [
  25, 133, 1, 4, 7, 6, 9, 3,
  149, 131, 143, 130, 150, 151,
  249, 250, 384, 493, 145, 146, 144, 718, 791, 792,
];

function _fmtMoney(n) {
  if (n >= 1e12) return `${(n / 1e9).toFixed(0)}B`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.floor(n));
}

function _injectRainCSS() {
  if (document.getElementById('_rain-css')) return;
  const s = document.createElement('style');
  s.id = '_rain-css';
  s.textContent = `
    @keyframes _pkfall {
      from { top: -130px; opacity: 1; }
      to   { top: 110vh;  opacity: 0.85; }
    }
  `;
  document.head.appendChild(s);
}

function _spawnRainPokemon() {
  const id   = _RAIN_IDS[Math.floor(Math.random() * _RAIN_IDS.length)];
  const size = 52 + Math.floor(Math.random() * 72);
  const dur  = (2.5 + Math.random() * 3.5).toFixed(2);
  const rot  = ((Math.random() - 0.5) * 70).toFixed(1);
  const img  = document.createElement('img');
  img.src = `${SPRITE_BASE}${id}.png`;
  img.style.cssText =
    `position:fixed;left:${(Math.random() * 98).toFixed(1)}vw;` +
    `width:${size}px;height:${size}px;object-fit:contain;` +
    `z-index:201;pointer-events:none;` +
    `animation:_pkfall ${dur}s linear forwards;` +
    `transform:rotate(${rot}deg);` +
    `filter:drop-shadow(0 4px 12px rgba(0,0,0,0.55));`;
  document.body.appendChild(img);
  setTimeout(() => img.remove(), (+dur + 0.6) * 1000);
}

function startVictoryCelebration(totalMoney) {
  if (_gameOver) return;
  _gameOver = true;
  _injectRainCSS();

  const ov = document.createElement('div');
  ov.id = '_victory-overlay';
  ov.style.cssText =
    'position:fixed;inset:0;z-index:500;' +
    'background:rgba(0,0,30,0.80);' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'font-family:Arial,sans-serif;color:#fff;pointer-events:none;';
  ov.innerHTML = `
    <div style="font-size:80px;margin-bottom:8px;">🎉</div>
    <div style="font-size:42px;font-weight:bold;letter-spacing:2px;
                text-shadow:0 0 40px #FFD700,0 0 80px #FF8C00;margin-bottom:12px;">
      目標達成！おめでとう！
    </div>
    <div style="font-size:24px;color:#FFD700;margin-bottom:6px;">
      💰 最終金額：$${_fmtMoney(totalMoney)}
    </div>
    <div style="font-size:14px;color:#aef;opacity:0.85;">
      🌟 累積突破 1,000B！恭喜！
    </div>
  `;
  document.body.appendChild(ov);

  let elapsed = 0;
  const iv = setInterval(() => {
    elapsed += 0.2;
    const n = 1 + (Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      setTimeout(_spawnRainPokemon, Math.random() * 180);
    }
    if (elapsed >= 30) clearInterval(iv);
  }, 200);
}

// ── Init ──────────────────────────────────────────────────────────────────
const container = document.getElementById('canvas-container');
const { scene, camera, renderer } = createScene(container);

const audio   = new AudioManager();
const road    = new Road(scene);
const player  = new Player(scene);
new TouchControls(player);                       // virtual joystick + buttons (touch devices)
const tsunami = new TsunamiMechanic(scene, road, audio);
const pokeMgr = new PokemonManager(scene);
const base    = new PlayerBase(scene);
const economy = new Economy();      // auto-loads from localStorage
const shop    = new Shop(scene, economy, player, audio);

const warpFlash = document.getElementById('warp-flash');
let lastTime = performance.now();

// ── Tier gates (visual barriers at tier boundaries) ────────────────────────
const tierGates = []; // index 0 = gate before mid, index 1 = gate before high

function buildTierGates() {
  [1, 2].forEach((tier, i) => {
    const gateZ  = -(tier * ZONES_PER_TIER * ZONE_LENGTH); // -360 and -720
    const color  = TIER_CSS_COLORS[tier];
    const group  = new THREE.Group();

    // Cross-road barrier posts
    for (let px = -ROAD_WIDTH / 2 - 1; px <= ROAD_WIDTH / 2 + 1; px += 2) {
      const postGeo = new THREE.BoxGeometry(0.4, 5, 0.4);
      const postMat = new THREE.MeshLambertMaterial({ color: tier === 1 ? 0xFF8F00 : 0xE53935 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, 2.5, gateZ);
      group.add(post);
    }
    // Horizontal beam
    const beamGeo = new THREE.BoxGeometry(ROAD_WIDTH + 4, 0.4, 0.4);
    const beamMat = new THREE.MeshLambertMaterial({ color: tier === 1 ? 0xFF8F00 : 0xE53935 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 5, gateZ);
    group.add(beam);

    // HTML label floating above gate
    const label = document.createElement('div');
    label.id = `tier-gate-label-${tier}`;
    label.style.cssText = `
      position:fixed;z-index:5;pointer-events:none;
      background:${color};color:#fff;font-weight:bold;
      font-size:13px;padding:4px 14px;border-radius:20px;
      box-shadow:0 2px 8px rgba(0,0,0,0.5);white-space:nowrap;
      display:none;
    `;
    label.textContent = `🔒 ${TIER_NAMES[tier]}區 — 解鎖需 $${_fmtShort(TIER_UNLOCK_COST[tier])}`;
    document.body.appendChild(label);

    scene.add(group);
    tierGates.push({ group, label, tier, gateZ, visible: true });
  });
}

function _fmtShort(n) {
  if (n >= 1e12) return (n/1e12).toFixed(0)+'T';
  if (n >= 1e9)  return (n/1e9).toFixed(0)+'B';
  if (n >= 1e6)  return (n/1e6).toFixed(0)+'M';
  if (n >= 1e3)  return (n/1e3).toFixed(0)+'K';
  return String(n);
}

function hideTierGate(tierIdx) {
  // tierIdx 1 → gates[0], tierIdx 2 → gates[1]
  const gate = tierGates[tierIdx - 1];
  if (!gate || !gate.visible) return;
  gate.group.visible = false;
  gate.label.style.display = 'none';
  gate.visible = false;
}

function updateGateLabelPositions() {
  tierGates.forEach(gate => {
    if (!gate.visible) return;
    // Project 3D position to screen
    const pos3D = new THREE.Vector3(0, 5.5, gate.gateZ);
    pos3D.project(camera);
    const x = (pos3D.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-pos3D.y * 0.5 + 0.5) * window.innerHeight;
    if (pos3D.z < 1 && y > 0 && y < window.innerHeight) {
      gate.label.style.display = 'block';
      gate.label.style.left = `${x}px`;
      gate.label.style.top  = `${y}px`;
      gate.label.style.transform = 'translate(-50%, -50%)';
    } else {
      gate.label.style.display = 'none';
    }
  });
}

// ── Camera follow ─────────────────────────────────────────────────────────
const CAM_OFFSET = new THREE.Vector3(0, 12, 16);

function updateCamera() {
  const t = player.position;
  camera.position.lerp(
    new THREE.Vector3(t.x + CAM_OFFSET.x, CAM_OFFSET.y, t.z + CAM_OFFSET.z),
    0.08
  );
  camera.lookAt(t.x, 1, t.z);
}

// ── Warp flash ─────────────────────────────────────────────────────────────
function triggerWarpFlash() {
  warpFlash.style.opacity = '0.85';
  setTimeout(() => { warpFlash.style.opacity = '0'; }, 350);
}

// ── Interaction ────────────────────────────────────────────────────────────
let ePrev = false, fPrev = false, bPrev = false, tPrev = false;

function handleInteraction() {
  const eNow = !!player.keysRef['KeyE'];
  const fNow = !!player.keysRef['KeyF'];
  const bNow = !!player.keysRef['KeyB'];

  // ── E: pickup / deposit ──────────────────────────────────────────────────
  if (eNow && !ePrev) {
    if (player.heldPokemon.length > 0 && base.isNearBase(player.position)) {
      const held = [...player.heldPokemon];
      player.dropAll();
      let placed = 0;
      held.forEach(p => {
        const seat = base.placePokemon(p);
        if (!seat) {
          pokeMgr.dropAt(p, player.position.x + (Math.random()-0.5)*2, player.position.z);
          showMsg(`基地座位已滿！${p.name} 掉落在地！`);
        } else { placed++; }
      });
      if (placed > 0) { audio.playDeposit(); showMsg(`放入基地 ${placed} 隻寶可夢！`); }

    } else if (player.heldPokemon.length > 0) {
      const p = player.dropOne();
      pokeMgr.dropAt(p, player.position.x, player.position.z);
      audio.playDrop();
      showMsg('放下寶可夢');

    } else {
      let picked = 0;
      while (player.canPickup()) {
        const nearby = pokeMgr.getNearby(player.position);
        if (!nearby) break;
        pokeMgr.markCarried(nearby, true);
        player.pickup(nearby);
        picked++;
      }
      if (picked > 0) { audio.playPickup(); showMsg(`抓到 ${picked} 隻寶可夢！`); }
    }
  }
  ePrev = eNow;

  // ── F: sell one held pokémon (anywhere) ──────────────────────────────────
  if (fNow && !fPrev) {
    if (player.heldPokemon.length > 0) {
      const p   = player.dropOne();
      pokeMgr.remove(p);
      const val = p.income * 100;
      economy.earn(val);
      audio.playSell();
      showMsg(`賣出 ${p.name}！獲得 $${economy._fmt(val)}`);
    }
  }
  fPrev = fNow;

  // ── B: shop ──────────────────────────────────────────────────────────────
  if (bNow && !bPrev) {
    if (shop.isNearShop(player.position)) {
      shop.uiVisible ? shop.hideUI() : shop.showUI();
    }
  }
  bPrev = bNow;

  // ── T: debug — trigger wave ───────────────────────────────────────────────
  const tNow = !!player.keysRef['KeyT'];
  if (tNow && !tPrev) { tsunami.timer = 1; }
  tPrev = tNow;
}

// ── Toast (top-right) ──────────────────────────────────────────────────────
let msgTO;
function showMsg(text) {
  let el = document.getElementById('msg-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'msg-toast';
    el.style.cssText = `
      position:fixed;top:80px;right:14px;
      background:rgba(0,0,0,0.78);color:#fff;padding:8px 18px;
      border-radius:12px;font-size:14px;z-index:50;pointer-events:none;
      transition:opacity 0.3s;max-width:240px;text-align:right;
    `;
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(msgTO);
  msgTO = setTimeout(() => { el.style.opacity = '0'; }, 2800);
}

// ── Wave indicator ────────────────────────────────────────────────────────
function updateWaveIndicator() {
  let el = document.getElementById('wave-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wave-indicator';
    el.style.cssText = `
      position:fixed;top:56px;left:50%;transform:translateX(-50%);
      font-size:20px;font-weight:bold;color:#fff;z-index:15;pointer-events:none;
      display:none;text-shadow:0 0 10px #00f;white-space:nowrap;
    `;
    document.body.appendChild(el);
  }
  if (tsunami.isWaveActive()) {
    const dist = player.position.z - tsunami.getWaveZ();
    if (dist > 0 && dist < 60) {
      el.style.display = 'block';
      el.textContent = `🌊 海嘯距離：${dist.toFixed(0)}m — 快跑！`;
    } else { el.style.display = 'none'; }
  } else { el.style.display = 'none'; }
}

// ── Sprint indicator ──────────────────────────────────────────────────────
let _sprintEl = null;
function updateSprintIndicator() {
  if (!_sprintEl) {
    _sprintEl = document.createElement('div');
    _sprintEl.style.cssText = `
      position:fixed;top:84px;left:50%;transform:translateX(-50%);
      font-size:14px;font-weight:bold;color:#FFD700;z-index:15;pointer-events:none;
      text-shadow:0 0 8px #000;letter-spacing:1px;white-space:nowrap;
    `;
    document.body.appendChild(_sprintEl);
  }
  _sprintEl.textContent = player.isSprinting ? '⚡ 衝刺中' : '';
}

// ── Tier unlock panel (shows next tier requirement) ───────────────────────
function updateTierUnlockPanel() {
  let el = document.getElementById('tier-unlock-panel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tier-unlock-panel';
    el.style.cssText = `
      position:fixed;top:52px;right:14px;
      background:rgba(0,0,0,0.6);color:#fff;font-size:12px;
      padding:5px 12px;border-radius:8px;z-index:14;pointer-events:none;
      line-height:1.7;max-width:200px;text-align:right;
    `;
    document.body.appendChild(el);
  }
  const lines = [];
  for (let t = 1; t < 3; t++) {
    if (!economy.unlockedTiers[t]) {
      lines.push(`🔒 ${TIER_NAMES[t]}：$${_fmtShort(TIER_UNLOCK_COST[t])}`);
    }
  }
  el.textContent = lines.join(' | ');
  el.style.display = lines.length ? 'block' : 'none';
}

// ── Main loop ──────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.1);
  lastTime  = now;

  player.update(dt);

  // ── Tier zone barrier: prevent entering locked tiers ─────────────────────
  for (let _t = 1; _t < 3; _t++) {
    if (!economy.unlockedTiers[_t]) {
      const _bz = -(_t * ZONES_PER_TIER * ZONE_LENGTH);
      if (player.position.z < _bz) player.mesh.position.z = _bz;
    }
  }

  handleInteraction();

  tsunami.update(dt, player, () => {
    if (_gameOver) return;
    const dropPos = player.position.clone();
    const dropped = player.warpToBase();
    dropped.forEach((p, i) => {
      pokeMgr.dropAt(p, dropPos.x + (i - dropped.length/2) * 1.2, dropPos.z);
    });

    // ── 罰款：損失 1/4 的錢 ──────────────────────────────────────────────────
    const penalty = Math.floor(economy.money / 4);
    if (penalty > 0) economy.money = Math.max(0, economy.money - penalty);
    const penaltyStr = penalty > 0 ? `　💸 損失 $${economy._fmt(penalty)}！` : '';

    audio.playWarp();
    if (dropped.length > 0)
      showMsg(`⚠️ 海嘯捲走了！${dropped.length} 隻寶可夢掉落！${penaltyStr}`);
    else
      showMsg(`⚠️ 被海嘯捲走！傳回基地！${penaltyStr}`);
    triggerWarpFlash();
  });

  pokeMgr.update(dt, player);
  base.update(dt);
  economy.update(dt, base.getSeatedPokemon());
  economy.updateHoldingDisplay(player.heldPokemon);
  economy.updateZoneDisplay(road.getZoneIndex(player.position.z));

  // ── Tier unlock check ────────────────────────────────────────────────────
  const newTier = economy.checkTierUnlocks();
  if (newTier >= 0) {
    pokeMgr.unlockTier(newTier);
    hideTierGate(newTier);
    audio.playUpgrade?.();
    showMsg(`🎉 ${TIER_NAMES[newTier]} 區域已解鎖！快去探索！`);
  }

  // ── 勝利條件（單人：自己的錢 ≥ 1000B）────────────────────────────────────
  if (!_gameOver && economy.money >= VICTORY_THRESHOLD) {
    startVictoryCelebration(economy.money);
  }

  updateWaveIndicator();
  updateSprintIndicator();
  updateTierUnlockPanel();
  updateGateLabelPositions();
  updateCamera();
  renderer.render(scene, camera);
}

// ── Buttons (bottom-left) ─────────────────────────────────────────────────
const saveBtn = document.createElement('button');
saveBtn.textContent = '💾';
saveBtn.title = '儲存進度';
saveBtn.style.cssText = `
  position:fixed;bottom:60px;left:10px;
  background:rgba(0,0,0,0.55);color:#fff;border:2px solid rgba(255,255,255,0.3);
  border-radius:50%;width:40px;height:40px;font-size:18px;line-height:1;
  cursor:pointer;z-index:30;
`;
saveBtn.onclick = () => {
  economy.save(base.getSeatedPokemon());
  showMsg('✅ 已儲存！');
  saveBtn.textContent = '✅';
  setTimeout(() => { saveBtn.textContent = '💾'; }, 1200);
};
document.body.appendChild(saveBtn);

const musicBtn = document.createElement('button');
musicBtn.textContent = '🎵';
musicBtn.title = '音樂開/關';
musicBtn.style.cssText = `
  position:fixed;bottom:10px;left:10px;
  background:rgba(0,0,0,0.55);color:#fff;border:2px solid rgba(255,255,255,0.3);
  border-radius:50%;width:40px;height:40px;font-size:18px;line-height:1;
  cursor:pointer;z-index:30;
`;
musicBtn.onclick = () => {
  const on = audio.toggleMusic();
  musicBtn.textContent = on ? '🎵' : '🔇';
  musicBtn.style.opacity = on ? '1' : '0.45';
};
document.body.appendChild(musicBtn);

// ── Controls hint ──────────────────────────────────────────────────────────
document.getElementById('controls-hint').innerHTML = `
  WASD / 方向鍵 移動<br>
  空白鍵 切換衝刺（再按恢復）<br>
  <b>E</b> 抓取 / 存入基地<br>
  <b>F</b> 賣出一隻（在基地旁）<br>
  <b>B</b> 商店（在商店旁）
`;

// ── Start screen ──────────────────────────────────────────────────────────
function showStartScreen() {
  return new Promise(resolve => {
    const saveData = Economy.peekSave();
    const hasSave  = !!saveData;

    const fmt = n => {
      if (n >= 1e9) return (n/1e9).toFixed(1)+'B';
      if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
      if (n >= 1e3) return (n/1e3).toFixed(0)+'K';
      return String(n);
    };

    const saveInfoHtml = hasSave ? `
      <div style="
        background:rgba(68,170,255,0.12);border:1px solid rgba(68,170,255,0.3);
        border-radius:10px;padding:10px 18px;margin-bottom:18px;
        font-size:13px;color:#aef;text-align:center;line-height:1.9;">
        💾 存檔資訊<br>
        <span style="color:#fff;font-weight:bold;">$${fmt(saveData.money||0)}</span>
        ｜ 速度Lv.<b>${saveData.speedLevel||0}</b>
        ｜ 抓地Lv.<b>${saveData.gripLevel||0}</b>
        ${saveData.playerName ? `<br>上次玩家：<b>${saveData.playerName}</b>` : ''}
      </div>
    ` : '';

    const btnHtml = hasSave ? `
      <div style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;">
        <button id="ss-load" style="
          padding:12px 26px;font-size:16px;border:none;border-radius:10px;
          background:linear-gradient(135deg,#1565C0,#0D47A1);color:#fff;
          cursor:pointer;font-weight:bold;box-shadow:0 4px 14px rgba(21,101,192,0.5);">
          📂 載入存檔</button>
        <button id="ss-new" style="
          padding:12px 26px;font-size:16px;border:none;border-radius:10px;
          background:linear-gradient(135deg,#b71c1c,#880000);color:#fff;
          cursor:pointer;font-weight:bold;box-shadow:0 4px 14px rgba(183,28,28,0.5);">
          🆕 重新開始</button>
      </div>
    ` : `
      <div style="display:flex;justify-content:center;">
        <button id="ss-start" style="
          padding:14px 44px;font-size:18px;border:none;border-radius:12px;
          background:linear-gradient(135deg,#00897B,#004D40);color:#fff;
          cursor:pointer;font-weight:bold;
          box-shadow:0 4px 18px rgba(0,137,123,0.55);">
          🎮 開始遊戲</button>
      </div>
    `;

    const overlay = document.createElement('div');
    overlay.id = 'start-screen';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:200;
      background:linear-gradient(160deg,#050e1f 0%,#0d2240 55%,#051428 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:Arial,sans-serif;color:#fff;
    `;
    overlay.innerHTML = `
      <div style="font-size:30px;font-weight:bold;margin-bottom:4px;
           text-shadow:0 0 24px #4af,0 0 48px #08f;letter-spacing:1px;">
        🌊 小心地滑！救出寶可夢
      </div>
      <div style="font-size:13px;color:#5af;margin-bottom:30px;letter-spacing:2px;">
        Watch Out! Save the Pokémon
      </div>
      <input id="ss-name" type="text" maxlength="12"
        placeholder="輸入你的名字…"
        value="${saveData?.playerName ?? ''}"
        style="font-size:20px;padding:10px 20px;border-radius:10px;
               border:2px solid #4af;background:rgba(255,255,255,0.08);
               color:#fff;outline:none;text-align:center;width:250px;
               margin-bottom:20px;box-shadow:0 0 16px rgba(68,170,255,0.35);
               caret-color:#4af;"/>
      ${saveInfoHtml}
      ${btnHtml}
      <div style="margin-top:26px;font-size:12px;color:#456;line-height:2;">
        WASD 移動 ｜ 空白鍵 衝刺 ｜ E 抓／放寶可夢 ｜ F 賣出 ｜ B 商店
      </div>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => {
      const inp = document.getElementById('ss-name');
      if (inp) { inp.focus(); inp.select(); }
    }, 60);

    function doStart(loadSave) {
      const name = (document.getElementById('ss-name')?.value ?? '').trim() || '訓練師';
      overlay.style.transition = 'opacity 0.4s';
      overlay.style.opacity    = '0';
      setTimeout(() => overlay.remove(), 420);
      resolve({ name, loadSave });
    }

    if (hasSave) {
      document.getElementById('ss-load').onclick = () => doStart(true);
      document.getElementById('ss-new').onclick  = () => {
        if (confirm('確定要重新開始嗎？目前存檔將被清除！')) doStart(false);
      };
    } else {
      document.getElementById('ss-start').onclick = () => doStart(false);
    }
    document.getElementById('ss-name')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { if (hasSave) doStart(true); else doStart(false); }
    });
  });
}

// ── Preload screen ─────────────────────────────────────────────────────────
function showPreloadScreen() {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.style.cssText = `
      position:fixed;inset:0;z-index:400;
      background:linear-gradient(160deg,#050e1f 0%,#0d2240 55%,#051428 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:Arial,sans-serif;color:#fff;gap:18px;
    `;
    ov.innerHTML = `
      <div style="font-size:28px;font-weight:bold;
           text-shadow:0 0 24px #4af,0 0 48px #08f;letter-spacing:1px;">
        🐾 小心地滑！救出寶可夢
      </div>
      <div style="font-size:14px;color:#9cf;">預先下載 3D 模型中，請稍候…</div>
      <div style="width:340px;background:#1a2a3a;border-radius:8px;
           height:14px;overflow:hidden;border:1px solid #2a4a6a;">
        <div id="_pl-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#2ecc71,#1abc9c);
             transition:width 0.25s;border-radius:8px;"></div>
      </div>
      <div id="_pl-txt" style="font-size:13px;color:#7af;">0 / 0</div>
    `;
    document.body.appendChild(ov);

    preloadPokemonModels((loaded, total) => {
      document.getElementById('_pl-fill').style.width = (loaded / total * 100) + '%';
      document.getElementById('_pl-txt').textContent = `${loaded} / ${total} 隻完成`;
    }).then(() => {
      ov.style.transition = 'opacity 0.4s';
      ov.style.opacity = '0';
      setTimeout(() => { ov.remove(); resolve(); }, 420);
    });
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────
buildTierGates();

showPreloadScreen().then(() => showStartScreen()).then(({ name, loadSave }) => {
  if (!loadSave) economy.reset();
  economy.playerName = name;

  // Sync player stats
  player.speedLevel = economy.speedLevel;
  player.gripLevel  = economy.gripLevel;

  // Sync already-unlocked tiers to Pokémon manager
  pokeMgr.setInitialTiers(economy.unlockedTiers);

  // Hide gates for already-unlocked tiers
  economy.unlockedTiers.forEach((unlocked, t) => {
    if (t >= 1 && unlocked) hideTierGate(t);
  });

  // Show player name in HUD
  const nameEl = document.getElementById('player-name-display');
  if (nameEl) nameEl.textContent = `👤 ${name}`;

  // Start audio & game
  audio.start();
  lastTime = performance.now();
  animate();
});
