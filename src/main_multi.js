import * as THREE from 'three';
import { createScene }     from './scene.js?v=18';
import { Road }            from './road.js?v=19';
import { Player }          from './player.js?v=24';
import { TsunamiMechanic } from './tsunamiMechanic.js?v=21';
import { PokemonManager, preloadPokemonModels, loadTexture } from './pokemon.js?v=32';
import { PlayerBase, getBasePos, getBaseWarpPos } from './base.js?v=20';
import { Economy }         from './economy.js?v=23';
import { Shop }            from './shop.js?v=21';
import { AudioManager }    from './audio.js?v=16';
import { NetworkManager }  from './network.js?v=19';
import { RemotePlayer }    from './remote_player.js?v=26';
import { TouchControls }   from './touch_controls.js?v=17';
import {
  ZONE_LENGTH, ZONES_PER_TIER, TIER_UNLOCK_COST, TIER_NAMES,
  TIER_CSS_COLORS, ROAD_WIDTH, RARITY_CSS, BASE_SEATS_PER_FLOOR, SPRITE_BASE,
  NUM_ZONES, CARRY_CAPACITY,
} from './constants.js?v=21';
// v=61 — layout optimization: elements repositioned below HUD

// NOTE: texture loading goes through loadTexture() (imported from pokemon.js)
// so all Pokémon artwork shares one cache across the whole game.

// ── Startup heartbeat (removed once game boots) ────────────────────────────────
(function() {
  var d = document.createElement('div');
  d.id = '_boot-status';
  d.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);' +
    'background:rgba(0,100,0,0.85);color:#0f0;font-family:monospace;font-size:13px;' +
    'padding:6px 16px;border-radius:8px;z-index:9998;pointer-events:none;';
  d.textContent = '✅ JS 模組已載入，正在初始化場景…';
  document.body.appendChild(d);
})();

// ── Victory ────────────────────────────────────────────────────────────────────
const VICTORY_THRESHOLD = 1_000_000_000_000_000;  // 1000T
let   _gameOver         = false;

// Pokémon IDs used for the rain celebration
const _RAIN_IDS = [
  25, 133, 1, 4, 7, 6, 9, 3,
  149, 131, 143, 130, 150, 151,
  249, 250, 384, 493, 145, 146, 144, 718, 791, 792,
];

function _fmtMoney(n) {
  if (n >= 1e27) return `${(n/1e27).toFixed(1)}Oc`;
  if (n >= 1e24) return `${(n/1e24).toFixed(1)}Sp`;
  if (n >= 1e21) return `${(n/1e21).toFixed(1)}Sx`;
  if (n >= 1e18) return `${(n/1e18).toFixed(1)}Qi`;
  if (n >= 1e15) return `${(n/1e15).toFixed(1)}Qa`;
  if (n >= 1e12) return `${(n/1e12).toFixed(1)}T`;
  if (n >= 1e9)  return `${(n/1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3)  return `${(n/1e3).toFixed(0)}K`;
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

/**
 * @param {number} totalMoney
 * @param {Array<{name,color,money}>} scores
 */
function startVictoryCelebration(totalMoney, scores) {
  if (_gameOver) return;
  _gameOver = true;
  _injectRainCSS();

  // ── Victory overlay ─────────────────────────────────────────────────────────
  const ov = document.createElement('div');
  ov.id = '_victory-overlay';
  ov.style.cssText =
    'position:fixed;inset:0;z-index:500;' +
    'background:rgba(0,0,30,0.80);' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'font-family:Arial,sans-serif;color:#fff;pointer-events:none;';

  // Build score rows
  let scoreHtml = '';
  if (scores && scores.length) {
    const sorted = [...scores].sort((a, b) => b.money - a.money);
    scoreHtml = sorted.map((s, i) =>
      `<div style="color:${s.color};font-size:15px;line-height:2;">` +
      `${['🥇','🥈','🥉','🏅'][i] ?? '🏅'} ${s.name}：$${_fmtMoney(s.money)}` +
      `</div>`
    ).join('');
  }

  ov.innerHTML = `
    <div style="font-size:80px;margin-bottom:8px;">🎉</div>
    <div style="font-size:42px;font-weight:bold;letter-spacing:2px;
                text-shadow:0 0 40px #FFD700,0 0 80px #FF8C00;margin-bottom:12px;">
      全員勝利！目標達成！
    </div>
    <div style="font-size:24px;color:#FFD700;margin-bottom:6px;">
      💰 總金額：$${_fmtMoney(totalMoney)}
    </div>
    <div style="font-size:14px;color:#aef;margin-bottom:20px;opacity:0.85;">
      🌟 所有人合計突破 10,000B！
    </div>
    <div style="text-align:center;line-height:2;">${scoreHtml}</div>
  `;
  document.body.appendChild(ov);

  // ── Pokémon rain for 30 seconds ─────────────────────────────────────────────
  let elapsed = 0;
  const iv = setInterval(() => {
    elapsed += 0.2;
    const n = 1 + (Math.random() < 0.4 ? 1 : 0);   // 1 or 2 per tick
    for (let i = 0; i < n; i++) {
      setTimeout(_spawnRainPokemon, Math.random() * 180);
    }
    if (elapsed >= 30) clearInterval(iv);
  }, 200);
}

// ── Network URL ────────────────────────────────────────────────────────────────
const params  = new URLSearchParams(location.search);
// 若從區網 IP 開啟頁面（非 localhost），自動以該 IP 作為 WS 主機
const wsHost  = params.get('host') || location.hostname || 'localhost';
const WS_URL  = `ws://${wsHost}:7780`;
const net     = new NetworkManager(WS_URL);

const remotePlayers       = new Map();   // id → RemotePlayer
const _remoteBasePools    = new Map();   // playerId → Array<{bgSprite,artSprite,bgMat,artMat,lastPokeId,lastCssColor}>
const _createdRemoteBases = new Set();   // playerIds for which we've built a base structure

// ── C5: rare-event beacon ──────────────────────────────────────────────────────
let _rareBeacon = null;   // { group, diamond, labelMat, netId }

// ── Gift box system ────────────────────────────────────────────────────────────
const _giftObjects = new Map();   // giftId → { group, rotY, bobT }
let   _giftIndicatorEl = null;

function _addGiftBox({ giftId, x, z }) {
  if (_giftObjects.has(giftId)) return;
  const group = new THREE.Group();

  // Gold box body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.MeshLambertMaterial({ color: 0xFFD700, emissive: 0xDD9900, emissiveIntensity: 0.45 }),
  );
  body.castShadow = true;
  group.add(body);

  // Red ribbon — vertical strip
  const ribbonV = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 1.26, 0.18),
    new THREE.MeshLambertMaterial({ color: 0xFF2222 }),
  );
  group.add(ribbonV);

  // Red ribbon — horizontal strip
  const ribbonH = new THREE.Mesh(
    new THREE.BoxGeometry(1.26, 0.18, 0.18),
    new THREE.MeshLambertMaterial({ color: 0xFF2222 }),
  );
  group.add(ribbonH);

  group.position.set(x, 0.9, z);
  scene.add(group);
  _giftObjects.set(giftId, {
    group,
    rotY: Math.random() * Math.PI * 2,
    bobT: Math.random() * Math.PI * 2,
  });
}

function _removeGiftBox(giftId) {
  const obj = _giftObjects.get(giftId);
  if (!obj) return;
  scene.remove(obj.group);
  obj.group.traverse(child => {
    if (child.isMesh) { child.geometry.dispose(); child.material.dispose(); }
  });
  _giftObjects.delete(giftId);
}

function _updateGiftIndicator() {
  if (!_giftIndicatorEl) _giftIndicatorEl = document.getElementById('gift-indicator');
  if (!_giftIndicatorEl) return;
  if (player.heldGift != null) {
    _giftIndicatorEl.textContent = '持有 🎁';
    _giftIndicatorEl.style.color = '#FFD700';
  } else {
    _giftIndicatorEl.textContent = '無';
    _giftIndicatorEl.style.color = '#aaa';
  }
}

// ── C7: quick-chat phrase table ────────────────────────────────────────────────
const QUICK_PHRASES = [
  { key: 'run',  text: '🏃 快跑！' },
  { key: 'here', text: '📍 這邊！' },
  { key: 'come', text: '👋 我來了' },
  { key: 'rare', text: '✨ 稀有！快來！' },
  { key: 'help', text: '🆘 幫幫我！' },
  { key: 'meet', text: '🗺️ Zone 集合！' },
];
// key → display text (O(1) lookup when relaying from server)
const _QC_MAP = Object.fromEntries(QUICK_PHRASES.map(p => [p.key, p.text]));

// ── Scene ──────────────────────────────────────────────────────────────────────
const container = document.getElementById('canvas-container');
const { scene, camera, renderer, sun } = createScene(container);

const audio   = new AudioManager();
const road    = new Road(scene);
const player  = new Player(scene);
const controls = new TouchControls(player, { isMulti: true });
const tsunami = new TsunamiMechanic(scene, road, audio);
const pokeMgr = new PokemonManager(scene);
pokeMgr.enableNetworkMode();   // server controls all Pokémon

const economy = new Economy();
const shop    = new Shop(scene, economy, player, audio);

// base is created AFTER we know our player slot (post-connection)
let base = null;

const warpFlash = document.getElementById('warp-flash');
let lastTime    = performance.now();
let playerName  = '訓練師';
let gameStarted = false;
let _panelTimer = 0;

// ── Wave countdown state (G2) ──────────────────────────────────────────────────
let _nextWaveIn = 0;    // seconds between last wave_end and next wave_alert (from server)
let _nextWaveT0 = 0;    // performance.now() at the moment we received wave_end

// ── Golden hour state (G3) ─────────────────────────────────────────────────────
let _goldenHour     = false;
let _goldenHourEnds = 0;   // performance.now() timestamp when golden hour expires
let _ghBadge = null, _ghCountdown = null, _ghWrap = null;

// ── Remote player income rates (F4) ───────────────────────────────────────────
const _remoteIncomeRates = new Map();   // playerId → income/s (updated via base_update)

// ── Lottery state ──────────────────────────────────────────────────────────────
let _prizePoolTotal  = 0;   // last known prize pool value from server
let _prizeAccumTimer = 0;   // batches passive-income 30% contributions
window._prizePoolTotal = 0; // exposed so shop.js showUI() can read it

// ── Tier gates ─────────────────────────────────────────────────────────────────
const tierGates = [];

function buildTierGates() {
  // Shared geometries (both gates use the same shape, only colour + z differ)
  const _postGeo = new THREE.BoxGeometry(0.4, 5, 0.4);
  const _beamGeo = new THREE.BoxGeometry(ROAD_WIDTH + 4, 0.4, 0.4);
  const _pxList  = [];
  for (let px = -ROAD_WIDTH / 2 - 1; px <= ROAD_WIDTH / 2 + 1; px += 2) _pxList.push(px);
  const _posM = new THREE.Matrix4();

  // Gate hex colours matching TIER_COLORS_HEX in constants.js
  const _GATE_HEX = [0, 0xFF8F00, 0xE53935, 0x9C27B0];
  [1, 2, 3].forEach((tier) => {
    const gateZ = -(tier * ZONES_PER_TIER * ZONE_LENGTH);
    const hex   = _GATE_HEX[tier];
    const group = new THREE.Group();

    // Posts as InstancedMesh: 7 posts → 1 draw call (was 7 individual meshes)
    const postMesh = new THREE.InstancedMesh(
      _postGeo,
      new THREE.MeshLambertMaterial({ color: hex }),
      _pxList.length,
    );
    _pxList.forEach((px, idx) => {
      _posM.makeTranslation(px, 2.5, gateZ);
      postMesh.setMatrixAt(idx, _posM);
    });
    postMesh.instanceMatrix.needsUpdate = true;
    group.add(postMesh);

    // Horizontal beam — single mesh
    const beam = new THREE.Mesh(
      _beamGeo,
      new THREE.MeshLambertMaterial({ color: hex }),
    );
    beam.position.set(0, 5, gateZ);
    group.add(beam);

    const label = document.createElement('div');
    label.id = `tier-gate-label-${tier}`;
    label.style.cssText = `
      position:fixed;z-index:5;pointer-events:none;
      background:${TIER_CSS_COLORS[tier]};color:#fff;font-weight:bold;
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
  if (n >= 1e27) return (n / 1e27).toFixed(1) + 'Oc';
  if (n >= 1e24) return (n / 1e24).toFixed(1) + 'Sp';
  if (n >= 1e21) return (n / 1e21).toFixed(1) + 'Sx';
  if (n >= 1e18) return (n / 1e18).toFixed(1) + 'Qi';
  if (n >= 1e15) return (n / 1e15).toFixed(1) + 'Qa';
  if (n >= 1e12) return (n / 1e12).toFixed(0) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(0)  + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(1)  + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(0)  + 'K';
  return String(Math.floor(n));
}

function hideTierGate(tierIdx) {
  const gate = tierGates[tierIdx - 1];
  if (!gate || !gate.visible) return;
  gate.group.visible = false;
  gate.label.style.display = 'none';
  gate.visible = false;
}

function updateGateLabelPositions() {
  tierGates.forEach(gate => {
    if (!gate.visible) return;
    _gatePos3D.set(0, 5.5, gate.gateZ);
    _gatePos3D.project(camera);
    const x = (_gatePos3D.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_gatePos3D.y * 0.5 + 0.5) * window.innerHeight;
    if (_gatePos3D.z < 1 && y > 0 && y < window.innerHeight) {
      gate.label.style.display  = 'block';
      gate.label.style.left     = `${x}px`;
      gate.label.style.top      = `${y}px`;
      gate.label.style.transform = 'translate(-50%, -50%)';
    } else {
      gate.label.style.display = 'none';
    }
  });
}

// ── Camera follow ──────────────────────────────────────────────────────────────
const CAM_OFFSET  = new THREE.Vector3(0, 12, 16);
const _camTarget    = new THREE.Vector3();   // reused every frame — no GC
const _gatePos3D    = new THREE.Vector3();   // reused for gate label projection
const _selfEmojiPos = new THREE.Vector3();   // reused for self-emoji head projection

function updateCamera(dt) {
  const t = player.position;
  // Frame-rate-independent lerp: same feel as 0.08/frame at 60 fps at any refresh rate
  const α = 1 - Math.pow(0.92, dt * 60);
  _camTarget.set(t.x + CAM_OFFSET.x, CAM_OFFSET.y, t.z + CAM_OFFSET.z);
  camera.position.lerp(_camTarget, α);
  // Derive lookAt from smoothed camera position — eliminates position/angle mismatch jitter
  camera.lookAt(
    camera.position.x - CAM_OFFSET.x,
    1,
    camera.position.z - CAM_OFFSET.z,
  );
  // Shadow camera follows player along z so all 9 zones get proper shadows
  sun.position.set(t.x + 30, 80, t.z + 20);
  sun.target.position.set(t.x, 0, t.z);
  sun.target.updateMatrixWorld();
}

// ── Warp flash ─────────────────────────────────────────────────────────────────
function triggerWarpFlash() {
  warpFlash.style.opacity = '0.85';
  setTimeout(() => { warpFlash.style.opacity = '0'; }, 350);
}

// ── C5: rare-event beacon helpers ─────────────────────────────────────────────

function _clearRareBeacon() {
  if (!_rareBeacon) return;
  scene.remove(_rareBeacon.group);
  _rareBeacon.labelMat?.map?.dispose();
  _rareBeacon.labelMat?.dispose();
  _rareBeacon = null;
}

/** Build a canvas label sprite for the beacon (shows pokemon name in gold). */
function _makeBeaconLabel(name) {
  const cvs = document.createElement('canvas');
  cvs.width = 280; cvs.height = 58;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.beginPath();
  ctx.roundRect?.(2, 2, 276, 54, 13) ?? ctx.rect(2, 2, 276, 54);
  ctx.fill();
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`🌟 ${name}`, 140, 29);
  const tex    = new THREE.CanvasTexture(cvs);
  const mat    = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.5, 0.72, 1);
  return { sprite, mat };
}

/** Create a glowing gold beacon pillar at (x, z) linked to netId. */
function _createRareBeacon(x, z, name, netId) {
  _clearRareBeacon();

  const group = new THREE.Group();

  // Vertical glow beam
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 30, 8),
    new THREE.MeshLambertMaterial({
      color: 0xFFD700, emissive: 0xFFD700, emissiveIntensity: 1.0,
      transparent: true, opacity: 0.38,
    }),
  );
  beam.position.y = 15;
  group.add(beam);

  // Spinning gold diamond at top
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshLambertMaterial({ color: 0xFFD700, emissive: 0xFFD700, emissiveIntensity: 0.9 }),
  );
  diamond.position.y = 31;
  group.add(diamond);

  // Name label sprite
  const { sprite: labelSprite, mat: labelMat } = _makeBeaconLabel(name);
  labelSprite.position.y = 34;
  group.add(labelSprite);

  group.position.set(x, 0, z);
  scene.add(group);
  _rareBeacon = { group, diamond, labelMat, netId };
}

/** Show a full-width banner sliding in from the top for the rare event. */
function showRareEventBanner(name, pokeId, zone) {
  document.getElementById('_rare-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = '_rare-banner';
  banner.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:200;pointer-events:none;
    background:linear-gradient(135deg,#0d0d1a 0%,#1a1050 50%,#0a0a2a 100%);
    border-bottom:3px solid #FFD700;
    padding:14px 24px 14px 20px;
    display:flex;align-items:center;gap:18px;
    animation:_bannerIn 0.45s cubic-bezier(0.23,1,0.32,1);
  `;

  const img = document.createElement('img');
  img.src = `${SPRITE_BASE}${pokeId}.png`;
  img.style.cssText = `
    width:58px;height:58px;object-fit:contain;image-rendering:pixelated;
    filter:drop-shadow(0 0 14px #FFD700) drop-shadow(0 0 6px #fff);
    animation:_rarePulse 0.9s ease-in-out infinite alternate;
  `;

  const txt = document.createElement('div');
  txt.innerHTML = `
    <div style="color:#FFD700;font-size:19px;font-weight:bold;
                text-shadow:0 0 14px #FFD700,0 0 4px #fff;letter-spacing:1px;">
      🌟 傳說寶可夢降臨！
    </div>
    <div style="color:#fff;font-size:13px;margin-top:5px;opacity:0.9;">
      <b>${name}</b> 出現在 Zone ${zone + 1}！快去搶！
    </div>
  `;

  banner.append(img, txt);
  document.body.appendChild(banner);

  // Auto-dismiss after 8 seconds
  setTimeout(() => {
    banner.style.transition = 'opacity 0.55s, transform 0.55s';
    banner.style.opacity    = '0';
    banner.style.transform  = 'translateY(-100%)';
    setTimeout(() => banner.remove(), 580);
  }, 8000);
}

// ── Remote base display ────────────────────────────────────────────────────────

// Base geometry constants (must match base.js)
const _BASE_W    = 18;
const _BASE_D    = 12;
const _BASE_COLS = 4;
const _FLOOR_Y   = 0.5;

/**
 * Render Pokémon artwork sprites on the exact seat positions of another player's
 * base. Seat layout mirrors PlayerBase._buildBase().
 * Called when 'base_update' arrives or from the welcome handler.
 */
/**
 * Remote-base sprite pool constants — must match PlayerBase._buildBase() layout.
 * Slots are pre-created once per player; each update only redraws changed slots.
 */
const _POOL_SIZE = BASE_SEATS_PER_FLOOR;  // 16 seats max

function _getOrCreatePool(playerId) {
  if (_remoteBasePools.has(playerId)) return _remoteBasePools.get(playerId);

  const bPos      = getBasePos(playerId);
  const totalRows = Math.ceil(_POOL_SIZE / _BASE_COLS);
  const pool      = [];

  for (let i = 0; i < _POOL_SIZE; i++) {
    const col   = i % _BASE_COLS;
    const row   = Math.floor(i / _BASE_COLS);
    const seatX = bPos.x - _BASE_W / 2 + 2 + col * (_BASE_W - 4) / (_BASE_COLS - 1);
    const seatZ = bPos.z - _BASE_D / 2 + 2 + row * (_BASE_D - 4) / (totalRows - 1);
    const posY  = _FLOOR_Y + 1.05;

    // Background circle sprite
    const bgCvs = document.createElement('canvas');
    bgCvs.width = bgCvs.height = 64;
    const bgMat    = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(bgCvs), transparent: true, depthTest: false,
    });
    const bgSprite = new THREE.Sprite(bgMat);
    bgSprite.scale.set(1.2, 1.2, 1);
    bgSprite.position.set(seatX, posY, seatZ);
    bgSprite.visible = false;
    scene.add(bgSprite);

    // Artwork sprite
    const artMat    = new THREE.SpriteMaterial({ transparent: true, depthTest: false, opacity: 0 });
    const artSprite = new THREE.Sprite(artMat);
    artSprite.scale.set(1.1, 1.1, 1);
    artSprite.position.set(seatX, posY, seatZ);
    artSprite.visible = false;
    scene.add(artSprite);

    pool.push({ bgSprite, artSprite, bgMat, artMat, bgCvs, lastPokeId: null, lastCssColor: null });
  }

  _remoteBasePools.set(playerId, pool);
  return pool;
}

function _disposePool(playerId) {
  const pool = _remoteBasePools.get(playerId);
  if (!pool) return;
  pool.forEach(slot => {
    scene.remove(slot.bgSprite);
    scene.remove(slot.artSprite);
    slot.bgMat.map?.dispose();
    slot.bgMat.dispose();
    slot.artMat.map?.dispose();
    slot.artMat.dispose();
  });
  _remoteBasePools.delete(playerId);
}

function updateRemoteBaseDisplay(playerId, seats) {
  const pool    = _getOrCreatePool(playerId);
  const seatArr = seats || [];

  pool.forEach((slot, i) => {
    const seat = seatArr[i];

    if (!seat) {
      // Hide unused slot
      slot.bgSprite.visible  = false;
      slot.artSprite.visible = false;
      slot.lastPokeId    = null;
      slot.lastCssColor  = null;
      return;
    }

    const cssColor = seat.cssColor ?? '#aaaaaa';
    const pokeId   = seat.pokeId ?? null;

    // Redraw background circle only if colour changed
    if (cssColor !== slot.lastCssColor) {
      slot.lastCssColor = cssColor;
      const ctx = slot.bgCvs.getContext('2d');
      ctx.clearRect(0, 0, 64, 64);
      ctx.fillStyle = cssColor;
      ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
      slot.bgMat.map.needsUpdate = true;
    }
    slot.bgSprite.visible = true;

    // Reload artwork only if pokeId changed
    if (pokeId !== slot.lastPokeId) {
      slot.lastPokeId = pokeId;
      slot.artMat.opacity = 0;
      slot.artSprite.visible = false;
      if (pokeId) {
        loadTexture(pokeId).then(tex => {
          if (!tex || slot.lastPokeId !== pokeId) return;  // stale
          slot.artMat.map     = tex;
          slot.artMat.opacity = 1;
          slot.artMat.needsUpdate = true;
          slot.artSprite.visible  = true;
        });
      }
    } else if (pokeId) {
      slot.artSprite.visible = slot.artMat.opacity > 0;
    }
  });
}

/**
 * Build the 3-D base structure for a remote player (once per player ID).
 * Called from the welcome handler and from player_join.
 */
function ensureRemoteBase(info) {
  if (info.id === net.playerId) return;          // skip own base
  if (_createdRemoteBases.has(info.id)) return;  // already built
  _createdRemoteBases.add(info.id);
  const bPos = getBasePos(info.id);
  const bHex = parseInt(info.color.replace('#', ''), 16);
  new PlayerBase(scene, { x: bPos.x, z: bPos.z, colorHex: bHex });
}

/**
 * Send our current base seat state to the server so other players can see it.
 */
function _broadcastBaseState() {
  if (!base || !net.connected) return;
  const seats = base.getSeatedPokemon().map(p => ({
    rarity:   p.rarity,
    cssColor: RARITY_CSS[p.rarity] ?? '#aaaaaa',
    name:     p.name,
    lv:       p.lv,
    income:   p.income,
    pokeId:   p.id,   // needed by remote clients to load artwork
  }));
  net.sendBaseUpdate(seats);
}

// ── Interaction ────────────────────────────────────────────────────────────────
let ePrev = false, fPrev = false, bPrev = false, tPrev = false, gPrev = false;

function handleInteraction() {
  if (!base) return;
  const eNow = !!player.keysRef['KeyE'];
  const fNow = !!player.keysRef['KeyF'];
  const bNow = !!player.keysRef['KeyB'];

  // ── E: pickup / deposit / drop ─────────────────────────────────────────────
  if (eNow && !ePrev) {
    if (player.heldPokemon.length > 0 && base.isNearBase(player.position)) {
      // DEPOSIT to base
      const held = [...player.heldPokemon];
      player.dropAll();
      let placed = 0;
      held.forEach(p => {
        const seat = base.placePokemon(p);
        if (!seat) {
          // No seat available — drop back on ground
          const dx = player.position.x + (Math.random() - 0.5) * 2;
          const dz = player.position.z;
          pokeMgr.dropAt(p, dx, dz);
          if (p.netId != null) {
            net.sendPokemonDrop(p.netId,
              Math.round(dx * 100) / 100, Math.round(dz * 100) / 100);
          }
          showMsg(`基地座位已滿！${p.name} 掉落在地！`);
        } else {
          pokeMgr.markSeated(p);
          placed++;
          if (p.netId != null) net.sendPokemonDeposit(p.netId);
        }
      });
      if (placed > 0) {
        audio.playDeposit();
        // F5: Full-carry bonus — depositing a full hand earns an instant +1s income burst
        if (held.length >= CARRY_CAPACITY && placed === held.length) {
          const bonus = Math.floor(held.reduce((s, p) => s + p.income, 0));
          economy.earn(bonus);
          showMsg(`🤲 全手加成！放入 ${placed} 隻 ＋$${economy._fmt(bonus)} 獎勵！`);
        } else {
          showMsg(`放入基地 ${placed} 隻寶可夢！`);
        }
        _broadcastBaseState();
      }

    } else if (player.heldPokemon.length > 0) {
      // DROP one on ground
      const p  = player.dropOne();
      const dx = player.position.x;
      const dz = player.position.z;
      pokeMgr.dropAt(p, dx, dz);
      if (p.netId != null) net.sendPokemonDrop(p.netId, dx, dz);
      audio.playDrop();
      showMsg('放下寶可夢');

    } else {
      // PICKUP nearby Pokémon from ground (range scales with magnet level)
      let picked = 0;
      while (player.canPickup()) {
        const nearby = pokeMgr.getNearby(player.position, player.getPickupRangeSq());
        if (!nearby) break;
        pokeMgr.markCarried(nearby, true);
        player.pickup(nearby);
        if (nearby.netId != null) net.sendPokemonPickup(nearby.netId);
        // If this was the rare beacon pokemon, remove the pillar locally
        if (_rareBeacon?.netId === nearby.netId) _clearRareBeacon();
        picked++;
      }
      if (picked > 0) { audio.playPickup(); showMsg(`抓到 ${picked} 隻寶可夢！`); }
    }
  }
  ePrev = eNow;

  // ── F: sell held Pokémon (must be near shop) ──────────────────────────────
  if (fNow && !fPrev) {
    if (!shop.isNearShop(player.position)) {
      if (player.heldPokemon.length > 0) showMsg('💰 賣出請靠近商店！');
    } else if (player.heldPokemon.length > 0) {
      const p   = player.dropOne();
      if (p.netId != null) net.sendPokemonSell(p.netId);
      pokeMgr.remove(p);
      const val    = p.income * 100;
      const netVal = Math.floor(val * 0.7);   // 70% to player
      const contrib = val - netVal;            // 30% to prize pool
      economy.earn(netVal);
      if (contrib > 0 && net.connected) net.sendPrizeContrib(contrib);
      audio.playSell();
      showMsg(`賣出 ${p.name}！+$${economy._fmt(netVal)} (30%→🏆獎金池)`);
    }
  }
  fPrev = fNow;

  // ── B: shop ────────────────────────────────────────────────────────────────
  if (bNow && !bPrev) {
    if (shop.isNearShop(player.position)) {
      shop.uiVisible ? shop.hideUI() : shop.showUI();
    }
  }
  bPrev = bNow;

  // ── G: open gift at shop ───────────────────────────────────────────────────
  const gNow = !!player.keysRef['KeyG'];
  if (gNow && !gPrev) {
    if (player.heldGift != null) {
      if (shop.isNearShop(player.position)) {
        shop._doOpenGift();
      } else {
        showMsg('🎁 靠近商店才能打開禮包！');
      }
    } else {
      showMsg('🎁 目前無禮包，在野外走近禮包即可撿起！');
    }
  }
  gPrev = gNow;

  // ── Auto-pickup nearby gift boxes ─────────────────────────────────────────
  if (player.heldGift == null && _giftObjects.size > 0) {
    const GIFT_RANGE_SQ = 6.25;   // 2.5 unit radius
    for (const [giftId, obj] of _giftObjects) {
      const dx = player.position.x - obj.group.position.x;
      const dz = player.position.z - obj.group.position.z;
      if (dx * dx + dz * dz < GIFT_RANGE_SQ) {
        player.pickupGift(giftId);
        _removeGiftBox(giftId);
        net.sendGiftPickup(giftId);
        audio.playPickup?.();
        showMsg('🎁 撿到禮包！到商店打開，或按 [G] 鍵！');
        addChatEntry('', `🎁 ${playerName} 撿到一個禮包！`, net.playerColor);
        _updateGiftIndicator();
        if (shop.uiVisible) shop.refreshGiftUI(true);
        break;   // only one at a time
      }
    }
  }

  // T: debug wave
  const tNow = !!player.keysRef['KeyT'];
  if (tNow && !tPrev) { tsunami.timer = 1; }
  tPrev = tNow;
}

// ── Toast ──────────────────────────────────────────────────────────────────────
let _msgTO;
function showMsg(text) {
  let el = document.getElementById('msg-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'msg-toast';
    el.style.cssText = `
      position:fixed;top:118px;right:14px;
      background:rgba(0,0,0,0.78);color:#fff;padding:8px 18px;
      border-radius:12px;font-size:16px;z-index:50;pointer-events:none;
      transition:opacity 0.3s;max-width:240px;text-align:right;
    `;
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(_msgTO);
  _msgTO = setTimeout(() => { el.style.opacity = '0'; }, 2800);
}

// ── Wave indicator ─────────────────────────────────────────────────────────────
function updateWaveIndicator() {
  let el = document.getElementById('wave-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wave-indicator';
    el.style.cssText = `
      position:fixed;top:192px;left:10px;
      font-size:22px;font-weight:bold;color:#fff;z-index:15;pointer-events:none;
      display:none;text-shadow:0 0 10px #00f;white-space:nowrap;
    `;
    document.body.appendChild(el);
  }
  if (tsunami.isWaveActive()) {
    const dist = player.position.z - tsunami.getWaveZ();
    if (dist > 0 && dist < 80) {
      el.style.display = 'block';
      el.textContent   = `🌊 海嘯距離：${dist.toFixed(0)}m — 快跑！`;
    } else { el.style.display = 'none'; }
  } else { el.style.display = 'none'; }
}

// ── Wave countdown (G2) ────────────────────────────────────────────────────────
//   Shows "下波海嘯：Xs" when wave is not active and server sent nextWaveIn.
let _waveCdEl = null;

function updateWaveCountdown() {
  if (!_waveCdEl) {
    _waveCdEl = document.createElement('div');
    _waveCdEl.style.cssText = `
      position:fixed;top:165px;left:10px;
      font-size:14px;color:#adf;background:rgba(0,0,0,0.50);
      padding:2px 10px;border-radius:7px;z-index:11;pointer-events:none;
      white-space:nowrap;display:none;
    `;
    document.body.appendChild(_waveCdEl);
  }
  if (!gameStarted || _nextWaveIn <= 0 || tsunami.isWaveActive()) {
    _waveCdEl.style.display = 'none';
    return;
  }
  const remaining = Math.max(0, _nextWaveIn - (performance.now() - _nextWaveT0) / 1000);
  if (remaining <= 0) {
    _nextWaveIn = 0;
    _waveCdEl.style.display = 'none';
    return;
  }
  _waveCdEl.style.display = 'block';
  _waveCdEl.textContent = `下波海嘯：${Math.ceil(remaining)}s`;
}

// ── Sprint indicator ───────────────────────────────────────────────────────────
let _sprintEl    = null;
let _lastSprintKey = '';   // diff key — only write DOM when state changes

function updateSprintIndicator() {
  if (!_sprintEl) {
    _sprintEl = document.createElement('div');
    _sprintEl.style.cssText = `
      position:fixed;top:220px;left:10px;
      font-size:15px;font-weight:bold;color:#FFD700;z-index:15;pointer-events:none;
      text-shadow:0 0 8px #000;letter-spacing:1px;white-space:nowrap;
    `;
    document.body.appendChild(_sprintEl);
  }
  const s    = player.isSprinting;
  const load = player.heldPokemon.length;
  const key  = `${+s}${load}`;
  if (key === _lastSprintKey) return;
  _lastSprintKey = key;
  const parts = [];
  if (s)         parts.push('⚡ 衝刺中');
  if (load >= 3) parts.push('🐢 超重 −27%');
  else if (load >= 2) parts.push('🐢 −18%');
  else if (load >= 1) parts.push('🐢 −9%');
  _sprintEl.textContent = parts.join('  ');
}

// ── Tier unlock panel ──────────────────────────────────────────────────────────
let _lastTierKey = '';   // cache — tiers unlock at most 2× per game

function updateTierUnlockPanel() {
  // Tiers change at most twice per game — skip all work if state unchanged
  const key = economy.unlockedTiers.join('');   // e.g. "1000" / "1100" / "1110" / "1111"
  if (key === _lastTierKey) return;
  _lastTierKey = key;

  let el = document.getElementById('tier-unlock-panel');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tier-unlock-panel';
    el.style.cssText = `
      position:fixed;top:118px;right:14px;
      background:rgba(0,0,0,0.6);color:#fff;font-size:14px;
      padding:5px 12px;border-radius:8px;z-index:14;pointer-events:none;
      line-height:1.7;max-width:200px;text-align:right;
    `;
    document.body.appendChild(el);
  }
  const lines = [];
  for (let t = 1; t < 4; t++) {
    if (!economy.unlockedTiers[t]) {
      lines.push(`🔒 ${TIER_NAMES[t]}：$${_fmtShort(TIER_UNLOCK_COST[t])}`);
    }
  }
  el.textContent = lines.join(' | ');
  el.style.display = lines.length ? 'block' : 'none';
}

// ── F1: Team progress bar ──────────────────────────────────────────────────────
let _victoryBarFill = null, _victoryBarLabel = null;
function updateVictoryBar() {
  if (!_victoryBarFill) {
    _victoryBarFill  = document.getElementById('victory-bar-fill');
    _victoryBarLabel = document.getElementById('victory-bar-label');
  }
  if (!gameStarted || !_victoryBarFill) return;
  let total = economy.money;
  remotePlayers.forEach(rp => { total += rp.money || 0; });
  const pct = Math.min(100, (total / VICTORY_THRESHOLD) * 100);
  _victoryBarFill.style.width = pct.toFixed(2) + '%';
  _victoryBarLabel.textContent =
    `🎯 全隊目標：$${_fmtMoney(total)} / $${_fmtMoney(VICTORY_THRESHOLD)}  （${pct.toFixed(1)}%）`;
}

// ── G3: Golden hour display ─────────────────────────────────────────────────────
function updateGoldenHour() {
  if (!_ghBadge) {
    _ghBadge     = document.getElementById('golden-hour-badge');
    _ghCountdown = document.getElementById('gh-countdown');
    _ghWrap      = document.getElementById('golden-hour-wrap');
  }
  if (!_goldenHour) return;
  const remaining = Math.max(0, (_goldenHourEnds - performance.now()) / 1000);
  if (remaining <= 0) {
    _goldenHour = false;
    _ghWrap?.classList.remove('active');
    if (_ghBadge) _ghBadge.style.display = 'none';
    return;
  }
  if (_ghCountdown) _ghCountdown.textContent = Math.ceil(remaining);
}

// ── Prize pool HUD update ──────────────────────────────────────────────────────
let _prizePoolEl = null;
function _updatePrizePoolDisplay() {
  if (!_prizePoolEl) _prizePoolEl = document.getElementById('prize-pool-display');
  if (_prizePoolEl) {
    _prizePoolEl.textContent = `🏆 $${_fmtShort(_prizePoolTotal)}`;
  }
}

// ── Lottery draw banner ────────────────────────────────────────────────────────
function showLotteryBanner(number, winners, prize, rollover) {
  document.getElementById('_lottery-banner')?.remove();

  const iWon = winners.some(w => w.id === net.playerId);
  const winnerNames = winners.map(w => `<span style="color:${w.color};font-weight:bold;">${w.name}</span>`).join('、');

  const banner = document.createElement('div');
  banner.id = '_lottery-banner';
  banner.style.cssText = `
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    z-index:300;pointer-events:none;text-align:center;
    background:rgba(10,8,30,0.95);border:2px solid #FFD700;
    border-radius:20px;padding:28px 40px;
    box-shadow:0 0 60px rgba(255,215,0,0.4);
    animation:_bannerIn 0.45s cubic-bezier(0.23,1,0.32,1);
    min-width:320px;
  `;
  banner.innerHTML = `
    <div style="font-size:16px;color:#aaa;letter-spacing:3px;margin-bottom:8px;">🎲 彩票開獎</div>
    <div style="font-size:68px;font-weight:bold;color:#FFD700;
                text-shadow:0 0 30px #FFD700,0 0 60px #FF8C00;line-height:1;">
      #${number}
    </div>
    ${rollover
      ? `<div style="font-size:15px;color:#aaa;margin-top:10px;">😔 無人中獎 — 獎金滾入下一輪</div>`
      : `<div style="font-size:14px;color:#fff;margin-top:10px;">
           🏆 中獎者：${winnerNames}<br>
           <span style="color:#FFD700;font-size:16px;font-weight:bold;">各獲 $${_fmtMoney(prize)}</span>
         </div>`
    }
    ${iWon ? `<div style="font-size:20px;font-weight:bold;color:#2ecc71;margin-top:10px;
                           text-shadow:0 0 16px #2ecc71;">🎉 恭喜！你中獎了！</div>` : ''}
  `;
  document.body.appendChild(banner);
  setTimeout(() => {
    banner.style.transition = 'opacity 0.6s, transform 0.6s';
    banner.style.opacity    = '0';
    banner.style.transform  = 'translate(-50%,-50%) scale(0.85)';
    setTimeout(() => banner.remove(), 650);
  }, 8000);
}

// ── Self emoji (above own head) ────────────────────────────────────────────────
const EMOJIS = ['👍', '😱', '🎉', '😂', '🔥', '💀', '❤️', '🌊'];

const selfEmojiEl = document.createElement('div');
selfEmojiEl.style.cssText = `
  position:fixed;z-index:7;pointer-events:none;
  font-size:22px;transform:translateX(-50%);display:none;
  white-space:nowrap;
  text-shadow:0 1px 4px rgba(0,0,0,0.7);
`;
document.body.appendChild(selfEmojiEl);
let _selfEmojiTO = null;

function showSelfEmoji(emoji) {
  clearTimeout(_selfEmojiTO);
  selfEmojiEl.style.transition = '';
  selfEmojiEl.style.opacity    = '1';
  selfEmojiEl.textContent      = emoji;
  selfEmojiEl.style.display    = 'block';
  _selfEmojiTO = setTimeout(() => {
    selfEmojiEl.style.transition = 'opacity 0.5s';
    selfEmojiEl.style.opacity    = '0';
    setTimeout(() => { selfEmojiEl.style.display = 'none'; }, 520);
  }, 2800);
}

// ── Chat log ───────────────────────────────────────────────────────────────────
function addChatEntry(name, text, color) {
  const log = document.getElementById('chat-log');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = 'chat-entry';
  if (name) {
    entry.innerHTML = `<span style="color:${color};font-weight:bold;">${name}</span> ${text}`;
  } else {
    entry.innerHTML = `<span style="color:${color};">${text}</span>`;
  }
  log.appendChild(entry);
  while (log.children.length > 6) log.removeChild(log.firstChild);
  setTimeout(() => {
    entry.style.transition = 'opacity 0.5s';
    entry.style.opacity    = '0';
    setTimeout(() => { if (entry.parentNode) entry.remove(); }, 520);
  }, 5000);
}

// ── Players panel — shows all players + their scores ──────────────────────────
function updatePlayersPanel() {
  const el = document.getElementById('players-panel');
  if (!el) return;
  if (!net.connected) {
    el.innerHTML = '<span style="color:#888;font-size:12px;">離線</span>';
    return;
  }
  const myMoney = Math.floor(economy.money);

  // Own income rate: computed from seated Pokémon in real-time (exact, no guessing)
  const myIncomePerSec = base
    ? base.getSeatedPokemon().reduce((s, p) => s + p.income, 0)
    : 0;
  const incomeStr = myIncomePerSec > 0
    ? ` <span style="color:#7fc;font-size:10px;">+${_fmtShort(myIncomePerSec)}/s</span>`
    : '';

  let html = `<span style="color:${net.playerColor};font-weight:bold;">● ${playerName} 你</span>`
           + `<br><small style="color:#aaa;">💰 $${_fmtShort(myMoney)}${incomeStr}</small>`;

  remotePlayers.forEach(rp => {
    const rpRate = _remoteIncomeRates.get(rp.id) ?? 0;
    const rpRateStr = rpRate > 0
      ? ` <span style="color:#7fc;font-size:10px;">+${_fmtShort(rpRate)}/s</span>`
      : '';
    html += `<br><span style="color:${rp.color};">● ${rp.name}</span>`
          + `<br><small style="color:#aaa;">💰 $${_fmtShort(rp.money || 0)}${rpRateStr}</small>`;
  });

  // Team total income/s
  const totalRate = myIncomePerSec + [..._remoteIncomeRates.values()].reduce((s, v) => s + v, 0);
  if (totalRate > 0) {
    html += `<br><span style="color:#ff9;font-size:10px;border-top:1px solid #444;">` +
            `全隊 +${_fmtShort(totalRate)}/s</span>`;
  }
  el.innerHTML = html;
}

// ── Network handlers ───────────────────────────────────────────────────────────
function setupNetworkHandlers() {
  // ── 海嘯同步（server 廣播，所有人同時觸發）────────────────────────────────
  tsunami.setNetworkControlled(true);

  net.on('wave_alert', msg => {
    _nextWaveIn = 0;   // countdown no longer relevant — wave inbound
    tsunami.triggerNetworkWaveAlert(msg.waveType);
  });
  net.on('wave_start', msg => {
    tsunami.triggerNetworkWaveStart(msg.waveType);
  });
  net.on('wave_end', msg => {
    tsunami.triggerNetworkWaveEnd();
    if (msg.nextWaveIn > 0) {
      _nextWaveIn = msg.nextWaveIn;
      _nextWaveT0 = performance.now();
    }
  });

  // ── 寶可夢同步 ────────────────────────────────────────────────────────────
  net.on('pokemon_spawn', msg => {
    try { pokeMgr.addNetworkPokemon(msg); }
    catch (e) { console.error('[NET pokemon_spawn]', e); }
  });

  net.on('pokemon_remove', msg => {
    try {
      pokeMgr.removeByNetId(msg.netId);
      // If the removed pokemon was the rare-event beacon, clear the pillar
      if (_rareBeacon?.netId === msg.netId) _clearRareBeacon();
    } catch (e) { console.error('[NET pokemon_remove]', e); }
  });

  // ── C5: rare-event beacon + banner ────────────────────────────────────────
  net.on('rare_event', msg => {
    try {
      _createRareBeacon(msg.x, msg.z, msg.name, msg.netId);
      showRareEventBanner(msg.name, msg.pokeId, msg.zone);
      audio.playUpgrade?.();   // reuse upgrade sound as a short fanfare
    } catch (e) { console.error('[NET rare_event]', e); }
  });

  // ── G3: Golden hour events ────────────────────────────────────────────────
  net.on('golden_hour_start', msg => {
    _goldenHour     = true;
    _goldenHourEnds = performance.now() + (msg.duration ?? 45) * 1000;
    if (!_ghBadge) {
      _ghBadge     = document.getElementById('golden-hour-badge');
      _ghCountdown = document.getElementById('gh-countdown');
      _ghWrap      = document.getElementById('golden-hour-wrap');
    }
    _ghWrap?.classList.add('active');
    if (_ghBadge) _ghBadge.style.display = 'block';
    audio.playUpgrade?.();
    showMsg('⭐ 黃金時刻！全隊收入 ×2.5，快去存入寶可夢！');
  });
  net.on('golden_hour_end', () => {
    _goldenHour = false;
    _ghWrap?.classList.remove('active');
    if (_ghBadge) _ghBadge.style.display = 'none';
    showMsg('⭐ 黃金時刻結束。');
  });

  // ── 彩票：獎金池更新（任何人貢獻後廣播）─────────────────────────────────
  net.on('prize_pool_update', msg => {
    _prizePoolTotal = msg.pool ?? 0;
    window._prizePoolTotal = _prizePoolTotal;
    _updatePrizePoolDisplay();
    if (shop.uiVisible) {
      shop.updateLotteryUI(_prizePoolTotal, economy.ticketsThisDraw, economy.lotteryTickets);
    }
  });

  // ── 彩票：獎金池里程碑通知 ────────────────────────────────────────────
  net.on('prize_pool_milestone', msg => {
    try {
      showMsg(`💰 獎金池突破 $${_fmtShort(msg.milestone)}！快到商店買彩票！`);
      audio.playUpgrade?.();
    } catch(e) { console.error('[NET prize_pool_milestone]', e); }
  });

  // ── 禮包：出現 ───────────────────────────────────────────────────────────
  net.on('gift_spawn', msg => {
    try {
      _addGiftBox(msg);
      showMsg(`🎁 Zone ${msg.zone + 1} 出現禮包！快去撿！`);
      addChatEntry('', `🎁 禮包降臨 Zone ${msg.zone + 1}！走近即可撿起`, '#FFD700');
      audio.playUpgrade?.();
    } catch(e) { console.error('[NET gift_spawn]', e); }
  });

  // ── 禮包：被其他人撿走（從地圖上移除）────────────────────────────────────
  net.on('gift_taken', msg => {
    try {
      _removeGiftBox(msg.giftId);
    } catch(e) { console.error('[NET gift_taken]', e); }
  });

  // ── 禮包：開啟獎勵回饋 ───────────────────────────────────────────────────
  net.on('gift_reward', msg => {
    try {
      // Reset shop button text in case it was set to "⏳"
      const btn = document.getElementById('btn-open-gift');
      if (btn) btn.textContent = '🎁 打開禮包 [G]';

      if (msg.rewardType === 'money') {
        economy.earn(msg.amount);
        showMsg(`🎁 禮包獎勵：+$${economy._fmt(msg.amount)}！`);
        addChatEntry('', `🎁 ${playerName} 開了禮包，獲得 $${_fmtShort(msg.amount)}！`, net.playerColor);
      } else if (msg.rewardType === 'speed_upgrade') {
        const upgraded = economy.giftSpeedUpgrade();
        player.speedLevel = economy.speedLevel;
        if (upgraded) {
          showMsg(`🎁 禮包獎勵：免費速度升級！Lv.${economy.speedLevel}`);
          addChatEntry('', `🎁 ${playerName} 開了禮包，獲得速度升級！`, net.playerColor);
          audio.playUpgrade?.();
        } else {
          // Speed maxed — server gave fallback money
          economy.earn(msg.fallbackAmount ?? 0);
          showMsg(`🎁 速度已滿！改獲 $${economy._fmt(msg.fallbackAmount ?? 0)}！`);
          addChatEntry('', `🎁 ${playerName} 速度滿級，獲得補償金幣！`, net.playerColor);
        }
      } else if (msg.rewardType === 'lottery_ticket') {
        economy.lotteryTickets.push(msg.number);
        economy.ticketsThisDraw = Math.min(3, economy.ticketsThisDraw + 1);
        _prizePoolTotal = msg.pool ?? _prizePoolTotal;
        window._prizePoolTotal = _prizePoolTotal;
        _updatePrizePoolDisplay();
        showMsg(`🎁 禮包獎勵：免費彩票 #${msg.number}！`);
        addChatEntry('', `🎁 ${playerName} 開了禮包，獲得免費彩票！`, net.playerColor);
        if (shop.uiVisible) {
          shop.updateLotteryUI(_prizePoolTotal, economy.ticketsThisDraw, economy.lotteryTickets);
        }
      }

      // Clear gift state
      player.heldGift = null;
      _updateGiftIndicator();
      if (shop.uiVisible) shop.refreshGiftUI(false);
    } catch(e) { console.error('[NET gift_reward]', e); }
  });

  // ── 彩票：購票成功 ────────────────────────────────────────────────────
  net.on('ticket_bought', msg => {
    economy.lotteryTickets.push(msg.number);
    economy.ticketsThisDraw = msg.ticketsThisDraw ?? (economy.ticketsThisDraw + 1);
    _prizePoolTotal = msg.pool ?? _prizePoolTotal;
    window._prizePoolTotal = _prizePoolTotal;
    // Persist lifetime tickets to localStorage
    try {
      const raw = localStorage.getItem('pokemon_slip_save_v3');
      const d   = raw ? JSON.parse(raw) : {};
      d.lotteryTickets = economy.lotteryTickets;
      localStorage.setItem('pokemon_slip_save_v3', JSON.stringify(d));
    } catch(e) {}
    _updatePrizePoolDisplay();
    shop.updateLotteryUI(_prizePoolTotal, economy.ticketsThisDraw, economy.lotteryTickets);
    showMsg(`🎫 彩票 #${msg.number} 購買成功！本輪 ${economy.ticketsThisDraw}/3 張`);
  });

  // ── 彩票：購票失敗 ────────────────────────────────────────────────────
  net.on('ticket_error', msg => {
    showMsg(`❌ ${msg.msg}`);
  });

  // ── 彩票：開獎 ───────────────────────────────────────────────────────
  net.on('lottery_draw', msg => {
    economy.ticketsThisDraw = 0;   // reset per-draw limit
    _prizePoolTotal = msg.pool ?? 0;
    window._prizePoolTotal = _prizePoolTotal;

    const iWon = (msg.winners || []).some(w => w.id === net.playerId);
    if (iWon && msg.prize > 0) {
      economy.earn(msg.prize);
      audio.playUpgrade?.();
    }

    showLotteryBanner(msg.number, msg.winners || [], msg.prize, msg.rollover);
    _updatePrizePoolDisplay();
    if (shop.uiVisible) {
      shop.updateLotteryUI(_prizePoolTotal, economy.ticketsThisDraw, economy.lotteryTickets);
    }
  });

  // ── F4: 其他玩家基地狀態 + 收益率追蹤 ───────────────────────────────────
  net.on('base_update', msg => {
    if (msg.playerId !== net.playerId) {
      updateRemoteBaseDisplay(msg.playerId, msg.seats || []);
      // Track income/s for this remote player
      const rate = (msg.seats || []).reduce((s, p) => s + (p?.income ?? 0), 0);
      _remoteIncomeRates.set(msg.playerId, rate);
    }
  });

  // ── C7: quick-chat text bubble ────────────────────────────────────────────
  net.on('quick_chat', msg => {
    const text = _QC_MAP[msg.key] ?? msg.key;   // fall back to raw key if unknown
    remotePlayers.get(msg.id)?.showQuickChat(text);
    addChatEntry(msg.name, text, msg.color);
  });

  // ── 玩家加入 / 離開 ───────────────────────────────────────────────────────
  net.on('player_join', msg => {
    const info = msg.player;
    if (remotePlayers.has(info.id)) return;
    const rp = new RemotePlayer(scene, info);
    remotePlayers.set(info.id, rp);
    ensureRemoteBase(info);          // build their base structure
    addChatEntry('', `🎮 ${info.colorName} ${info.name} 加入！`, info.color);
    updatePlayersPanel();
    // Show their existing base Pokémon
    if (info.baseSeats && info.baseSeats.length > 0) {
      updateRemoteBaseDisplay(info.id, info.baseSeats);
    }
  });

  net.on('player_leave', msg => {
    const rp = remotePlayers.get(msg.id);
    if (rp) {
      addChatEntry('', `👋 ${rp.name} 離開了`, rp.color);
      rp.remove();
      remotePlayers.delete(msg.id);
    }
    // Clean up their base sprite pool and income rate
    _disposePool(msg.id);
    _remoteIncomeRates.delete(msg.id);
    updatePlayersPanel();
  });

  net.on('player_position', msg => {
    remotePlayers.get(msg.id)?.updateFromServer(msg);
  });

  net.on('player_emoji', msg => {
    const rp = remotePlayers.get(msg.id);
    if (rp) {
      rp.showEmoji(msg.emoji);
      addChatEntry(rp.name, msg.emoji, rp.color);
    }
  });

  net.on('player_name', msg => {
    remotePlayers.get(msg.id)?.updateFromServer({ name: msg.name });
    updatePlayersPanel();
  });

  net.on('player_chat', msg => {
    if (msg.id !== net.playerId) {
      addChatEntry(msg.name, msg.text, msg.color);
    }
  });

  // ── 勝利 ───────────────────────────────────────────────────────────────────
  net.on('game_end', msg => {
    const scores = (msg.scores || []).map(s => ({
      name:  s.name,
      color: s.color,
      money: s.money,
    }));
    startVictoryCelebration(msg.totalMoney, scores);
  });

  net.on('disconnect', () => {
    remotePlayers.forEach(rp => rp.remove());
    remotePlayers.clear();
    // Dispose all remote base sprite pools
    [..._remoteBasePools.keys()].forEach(id => _disposePool(id));
    addChatEntry('', '⚠️ 與伺服器斷線', '#ff4444');
    updatePlayersPanel();
  });
}

// ── Emoji key handler (1–8) ────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (!gameStarted || !net.connected) return;
  const idx = parseInt(e.key) - 1;
  if (!isNaN(idx) && idx >= 0 && idx < EMOJIS.length) {
    const emoji = EMOJIS[idx];
    net.sendEmoji(emoji);
    showSelfEmoji(emoji);
    addChatEntry(playerName, emoji, net.playerColor);
  }
});

document.getElementById('emoji-bar')?.addEventListener('click', e => {
  const btn = e.target.closest('.emoji-btn');
  if (!btn || !gameStarted || !net.connected) return;
  const idx = parseInt(btn.dataset.idx);
  if (isNaN(idx) || idx < 0 || idx >= EMOJIS.length) return;
  const emoji = EMOJIS[idx];
  net.sendEmoji(emoji);
  showSelfEmoji(emoji);
  addChatEntry(playerName, emoji, net.playerColor);
});

// ── C7: Quick-chat panel ────────────────────────────────────────────────────────
//   A toggle button (💬) fixed bottom-right + a small phrase-grid panel.
//   Built once at module load; visible only when game is running.
(function _buildQuickChatUI() {
  // ── Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.title = '快捷語 [V]';
  toggleBtn.style.cssText = `
    position:fixed;bottom:14px;right:16px;z-index:32;
    background:rgba(0,0,0,0.65);color:#fff;
    border:1px solid rgba(255,255,255,0.22);border-radius:9px;
    padding:5px 9px;cursor:pointer;font-size:20px;line-height:1;
    display:flex;flex-direction:column;align-items:center;gap:1px;
    transition:transform 0.1s,border-color 0.15s;
    pointer-events:auto;
  `;
  toggleBtn.innerHTML = '💬<span style="font-size:9px;color:#aaa;line-height:1;">V</span>';
  document.body.appendChild(toggleBtn);

  // ── Phrase panel (hidden by default)
  const panel = document.createElement('div');
  panel.id = 'quick-chat-panel';
  panel.style.cssText = `
    position:fixed;bottom:62px;right:16px;z-index:32;
    display:none;flex-direction:column;gap:5px;
    background:rgba(0,0,0,0.88);
    border:1px solid rgba(255,255,255,0.18);border-radius:12px;
    padding:9px;min-width:148px;
    pointer-events:auto;
  `;
  QUICK_PHRASES.forEach(({ key, text }) => {
    const btn = document.createElement('button');
    btn.dataset.key = key;
    btn.textContent = text;
    btn.style.cssText = `
      background:rgba(255,255,255,0.10);color:#fff;
      border:1px solid rgba(255,255,255,0.22);border-radius:8px;
      padding:6px 12px;cursor:pointer;font-size:13px;
      text-align:left;white-space:nowrap;
      transition:background 0.1s,transform 0.08s;
    `;
    btn.addEventListener('mouseover', () => { btn.style.background = 'rgba(255,255,255,0.25)'; });
    btn.addEventListener('mouseout',  () => { btn.style.background = 'rgba(255,255,255,0.10)'; });
    btn.addEventListener('mousedown', () => { btn.style.transform = 'scale(0.96)'; });
    btn.addEventListener('mouseup',   () => { btn.style.transform = ''; });
    panel.appendChild(btn);
  });
  document.body.appendChild(panel);

  let panelOpen = false;
  function _openPanel()  { panelOpen = true;  panel.style.display = 'flex'; toggleBtn.style.borderColor = '#FFD700'; }
  function _closePanel() { panelOpen = false; panel.style.display = 'none';  toggleBtn.style.borderColor = ''; }
  function _togglePanel() { panelOpen ? _closePanel() : _openPanel(); }

  toggleBtn.addEventListener('click', () => {
    if (!gameStarted || !net.connected) return;
    _togglePanel();
  });

  // Phrase button click → send + show self bubble + close
  panel.addEventListener('click', e => {
    const btn = e.target.closest('[data-key]');
    if (!btn || !gameStarted || !net.connected) return;
    const key  = btn.dataset.key;
    const text = _QC_MAP[key];
    if (!text) return;
    net.sendQuickChat(key);
    showSelfEmoji(text);         // reuses existing above-head bubble mechanism
    addChatEntry(playerName, text, net.playerColor);
    _closePanel();
  });

  // V key toggles panel
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyV' && gameStarted && net.connected) _togglePanel();
    if (e.key  === 'Escape') _closePanel();
  });
})();

// ── Tint local player mesh to team colour ─────────────────────────────────────
function tintPlayerMesh(cssColor) {
  player.setTeamColor(cssColor);
}

// ── Minimap (G3) ──────────────────────────────────────────────────────────────
//   60 × 130 px canvas. Road: x ∈ [−5, 5], z ∈ [0, −1080].
//   Each of the 9 zones = 120 world units = ~14 px tall on map.
//   Refreshes at 5 fps (dirty-timestamp gate) to save CPU.
const _MAP_W = 68, _MAP_H = 145;
const _WORLD_X   = ROAD_WIDTH;              // 10 units
const _WORLD_Z   = NUM_ZONES * ZONE_LENGTH; // 1080 units
let   _mapCanvas = null, _mapCtx = null, _mapLastT = 0;

function _initMinimap() {
  _mapCanvas = document.createElement('canvas');
  _mapCanvas.width  = _MAP_W;
  _mapCanvas.height = _MAP_H;
  _mapCanvas.style.cssText = `
    position:fixed;bottom:188px;left:10px;z-index:10;
    border-radius:7px;border:1px solid rgba(255,255,255,0.22);
    image-rendering:pixelated;cursor:default;
  `;
  _mapCanvas.title = '小地圖';
  document.body.appendChild(_mapCanvas);
  _mapCtx = _mapCanvas.getContext('2d');
}

function _updateMinimap() {
  if (!_mapCtx || !gameStarted) return;
  const now = performance.now();
  if (now - _mapLastT < 200) return;   // 5 fps cap
  _mapLastT = now;

  const ctx  = _mapCtx;
  // World → canvas coordinate helpers
  const toX = x => ((x + _WORLD_X / 2) / _WORLD_X) * _MAP_W;
  const toY = z => ((-z) / _WORLD_Z) * _MAP_H;

  // Background
  ctx.fillStyle = 'rgba(10,18,30,0.92)';
  ctx.fillRect(0, 0, _MAP_W, _MAP_H);

  // Road fill
  ctx.fillStyle = 'rgba(60,50,35,0.75)';
  ctx.fillRect(0, 0, _MAP_W, _MAP_H);

  // Zone divider lines
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  for (let z = 1; z < NUM_ZONES; z++) {
    const py = (z * ZONE_LENGTH / _WORLD_Z) * _MAP_H;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(_MAP_W, py); ctx.stroke();
  }

  // Tier gates (faint coloured bars)
  [1, 2].forEach(t => {
    const py = (t * ZONES_PER_TIER * ZONE_LENGTH / _WORLD_Z) * _MAP_H;
    ctx.strokeStyle = t === 1 ? 'rgba(255,143,0,0.5)' : 'rgba(229,57,53,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(_MAP_W, py); ctx.stroke();
  });

  // Pokémon dots (ground only, capped at 80 for perf)
  const fieldSnap = pokeMgr._field;
  const dotLen    = Math.min(fieldSnap.length, 80);
  for (let i = 0; i < dotLen; i++) {
    const p  = fieldSnap[i];
    if (!p.group) continue;
    const px = toX(p.group.position.x);
    const py = toY(p.group.position.z);
    if (py < 0 || py > _MAP_H) continue;
    const hex = p.color ?? 0xAAAAAA;
    const r = (hex >> 16) & 0xFF, g = (hex >> 8) & 0xFF, b = hex & 0xFF;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(px - 1, py - 1, 2, 2);
  }

  // Remote player dots
  remotePlayers.forEach(rp => {
    const px = toX(rp.group.position.x);
    const py = toY(rp.group.position.z);
    if (py < -4 || py > _MAP_H + 4) return;
    ctx.fillStyle = rp.color;
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
  });

  // Rare beacon marker (gold ✦)
  if (_rareBeacon) {
    const px = toX(_rareBeacon.group.position.x);
    const py = toY(_rareBeacon.group.position.z);
    if (py >= 0 && py <= _MAP_H) {
      ctx.fillStyle = '#FFD700';
      ctx.font = '9px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✦', px, py);
    }
  }

  // Gift box markers (🎁 — small red square on minimap)
  _giftObjects.forEach(obj => {
    const px = toX(obj.group.position.x);
    const py = toY(obj.group.position.z);
    if (py < 0 || py > _MAP_H) return;
    ctx.fillStyle = '#FF4444';
    ctx.fillRect(px - 2, py - 2, 4, 4);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(px - 1, py - 2, 2, 1);   // ribbon top
  });

  // Local player — drawn last (always on top), white ring + team dot
  const lpx = toX(player.position.x);
  const lpy = toY(player.position.z);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(lpx, lpy, 4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = net.playerColor || '#ffffff';
  ctx.beginPath(); ctx.arc(lpx, lpy, 3, 0, Math.PI * 2); ctx.fill();

  // Small zone label (current zone number) in top-right
  const curZone = road.getZoneIndex(player.position.z);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '9px Arial';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`Z${curZone + 1}`, _MAP_W - 2, 3);
}

// ── Position broadcast timer ───────────────────────────────────────────────────
let _broadcastTimer = 0;
const BROADCAST_INTERVAL = 0.1;

// ── Main animate loop ──────────────────────────────────────────────────────────
function animate() {
  if (_gameOver) return;   // stop rAF on victory — celebration uses CSS only
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt  = Math.min((now - lastTime) / 1000, 0.1);
  lastTime  = now;

  player.update(dt);

  // ── Tier zone barrier: prevent entering locked tiers ─────────────────────
  for (let _t = 1; _t < 4; _t++) {
    if (!economy.unlockedTiers[_t]) {
      const _bz = -(_t * ZONES_PER_TIER * ZONE_LENGTH);
      if (player.position.z < _bz) player.mesh.position.z = _bz;
    }
  }

  handleInteraction();

  tsunami.update(dt, player, () => {
    if (_gameOver) return;   // 遊戲已結束，不再受海嘯懲罰
    const dropPos = player.position.clone();
    const dropped = player.warpToBase();
    dropped.forEach((p, i) => {
      const dx = dropPos.x + (i - dropped.length / 2) * 1.2;
      const dz = dropPos.z;
      pokeMgr.dropAt(p, dx, dz);
      if (p.netId != null) {
        net.sendPokemonDrop(p.netId,
          Math.round(dx * 100) / 100, Math.round(dz * 100) / 100);
      }
    });

    // ── 罰款：損失 1/4 的錢 ──────────────────────────────────────────────────
    const penalty = Math.floor(economy.money / 4);
    if (penalty > 0) economy.money = Math.max(0, economy.money - penalty);
    const penaltyStr = penalty > 0 ? `　💸 損失 $${economy._fmt(penalty)}！` : '';

    audio.playWarp();
    showMsg(dropped.length > 0
      ? `⚠️ 海嘯捲走了！${dropped.length} 隻寶可夢掉落！${penaltyStr}`
      : `⚠️ 被海嘯捲走！傳回基地！${penaltyStr}`);
    triggerWarpFlash();
  });

  pokeMgr.update(dt);
  const _incMult = _goldenHour ? 2.5 : 1;
  if (base) {
    base.update(dt);
    economy.update(dt, base.getSeatedPokemon(), _incMult);
  } else {
    economy.update(dt, [], _incMult);
  }
  economy.updateHoldingDisplay(player.heldPokemon);
  economy.updateZoneDisplay(road.getZoneIndex(player.position.z));

  // Tier unlocks: per-player economy still works; pokeMgr.unlockTier is a no-op in network mode
  const newTier = economy.checkTierUnlocks();
  if (newTier >= 0) {
    pokeMgr.unlockTier(newTier);   // no-op in network mode
    hideTierGate(newTier);
    audio.playUpgrade?.();
    showMsg(`🎉 ${TIER_NAMES[newTier]} 區域已解鎖！花費 $${_fmtShort(TIER_UNLOCK_COST[newTier])}`);
  }

  updateWaveIndicator();
  updateWaveCountdown();
  updateSprintIndicator();
  updateTierUnlockPanel();
  updateGateLabelPositions();
  updateGoldenHour();
  updateCamera(dt);

  // ── Network position broadcast ─────────────────────────────────────────────
  if (net.connected) {
    _broadcastTimer += dt;
    if (_broadcastTimer >= BROADCAST_INTERVAL) {
      _broadcastTimer = 0;
      net.sendPosition(
        player.position.x,
        player.position.z,
        player.mesh.rotation.y,
        player.isSprinting,
        player.heldPokemon.length,
        Math.floor(economy.money),
      );
      _panelTimer += BROADCAST_INTERVAL;
      if (_panelTimer >= 0.5) {
        _panelTimer = 0;
        updatePlayersPanel();
        updateVictoryBar();
      }
    }
    // ── Drain prize accumulator every 2 s ─────────────────────────────────
    _prizeAccumTimer += dt;
    if (_prizeAccumTimer >= 2) {
      _prizeAccumTimer = 0;
      const contrib = economy.drainPrizeAccum();
      if (contrib > 0) net.sendPrizeContrib(contrib);
    }
  }

  remotePlayers.forEach(rp => rp.update(dt));

  // ── C5: animate rare-event beacon diamond ────────────────────────────────
  if (_rareBeacon) {
    _rareBeacon.diamond.rotation.y += dt * 2.8;
    _rareBeacon.diamond.rotation.x = Math.sin(performance.now() / 700) * 0.35;
  }

  // ── Gift box spin + bob animation ─────────────────────────────────────────
  _giftObjects.forEach(obj => {
    obj.rotY += dt * 1.4;
    obj.bobT += dt * 2.2;
    obj.group.rotation.y  = obj.rotY;
    obj.group.position.y  = 0.9 + Math.sin(obj.bobT) * 0.18;
  });

  // Self emoji bubble above own head
  if (selfEmojiEl.style.display !== 'none') {
    _selfEmojiPos.set(player.position.x, 3.8, player.position.z).project(camera);
    selfEmojiEl.style.left = `${(_selfEmojiPos.x * 0.5 + 0.5) * window.innerWidth}px`;
    selfEmojiEl.style.top  = `${(-_selfEmojiPos.y * 0.5 + 0.5) * window.innerHeight}px`;
  }

  _updateMinimap();
  controls.tick();
  renderer.render(scene, camera);
}

// ── Buttons ────────────────────────────────────────────────────────────────────
const musicBtn = document.createElement('button');
musicBtn.textContent = '🎵';
musicBtn.title       = '音樂開/關';
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


// ── Connection screen ──────────────────────────────────────────────────────────
function showConnectionScreen() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:300;
      background:linear-gradient(160deg,#050e1f 0%,#0d2240 55%,#051428 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:Arial,sans-serif;color:#fff;
    `;
    overlay.innerHTML = `
      <div style="font-size:28px;font-weight:bold;margin-bottom:4px;
           text-shadow:0 0 24px #4af,0 0 48px #08f;letter-spacing:1px;">
        🌐 多人連線 — 四人同樂
      </div>
      <div style="font-size:13px;color:#5af;margin-bottom:28px;letter-spacing:2px;">
        Multiplayer Mode • Up to 4 Players
      </div>
      <div style="font-size:13px;color:#aaa;margin-bottom:8px;">
        伺服器 IP 位址（同一台電腦請留 localhost）
      </div>
      <input id="conn-host" type="text" value="${wsHost}"
        placeholder="localhost"
        style="font-size:18px;padding:10px 18px;border-radius:10px;
               border:2px solid #4af;background:rgba(255,255,255,0.08);
               color:#fff;outline:none;text-align:center;width:260px;
               margin-bottom:16px;box-shadow:0 0 14px rgba(68,170,255,0.3);
               caret-color:#4af;" />
      <button id="conn-btn" style="
        padding:12px 40px;font-size:16px;border:none;border-radius:10px;
        background:linear-gradient(135deg,#0066cc,#003399);color:#fff;
        cursor:pointer;font-weight:bold;
        box-shadow:0 4px 16px rgba(0,102,204,0.55);margin-bottom:14px;">
        🔌 連線
      </button>
      <div id="conn-status" style="font-size:14px;color:#aef;min-height:22px;"></div>
      <div style="margin-top:28px;font-size:12px;color:#446;line-height:2;">
        主機請先執行：<code style="color:#7af;">python server_multi.py</code><br>
        LAN 遊玩：在 URL 加上 <code style="color:#7af;">?host=主機IP</code>
      </div>
    `;
    document.body.appendChild(overlay);

    const hostInput = overlay.querySelector('#conn-host');
    const connBtn   = overlay.querySelector('#conn-btn');
    const statusEl  = overlay.querySelector('#conn-status');

    async function doConnect() {
      const host = hostInput.value.trim() || 'localhost';
      net._url = `ws://${host}:7780`;
      connBtn.disabled    = true;
      connBtn.textContent = '連線中…';
      statusEl.style.color = '#aef';
      statusEl.textContent = `正在連線到 ws://${host}:7780 …`;

      try {
        const welcomeMsg = await net.connect();

        const pkCount = (welcomeMsg.worldPokemons || []).length;
        connBtn.textContent  = '已連線 ✓';

        if (pkCount === 0) {
          // Server is old (no worldPokemons) or Pokémon haven't spawned yet
          statusEl.style.color = '#ff9800';
          statusEl.textContent =
            `⚠️ 已連線，但伺服器送來 0 隻寶可夢 → 請重新啟動 server_multi.py！`;
        } else {
          statusEl.style.color = '#2ecc71';
          statusEl.textContent =
            `✅ 已連線！你是 ${welcomeMsg.player.colorName} | 🎯 收到 ${pkCount} 隻寶可夢`;
        }

        // Load all Pokémon currently in the world from the server
        (welcomeMsg.worldPokemons || []).forEach(p => {
          try { pokeMgr.addNetworkPokemon(p); }
          catch (e) { console.error('[MULTI] addNetworkPokemon error:', e, p); }
        });

        // Load existing players, their base structures, and seat states
        welcomeMsg.others.forEach(info => {
          if (!remotePlayers.has(info.id)) {
            remotePlayers.set(info.id, new RemotePlayer(scene, info));
          }
          ensureRemoteBase(info);
          if (info.baseSeats && info.baseSeats.length > 0) {
            updateRemoteBaseDisplay(info.id, info.baseSeats);
          }
        });

        setupNetworkHandlers();

        setTimeout(() => {
          overlay.style.transition = 'opacity 0.35s';
          overlay.style.opacity    = '0';
          setTimeout(() => { overlay.remove(); resolve(); }, 370);
        }, 750);

      } catch (err) {
        connBtn.disabled    = false;
        connBtn.textContent = '🔌 重試';
        statusEl.style.color = '#e74c3c';
        statusEl.textContent = err.message === 'FULL'
          ? '❌ 房間已滿（最多 4 人）'
          : '❌ 連線失敗（伺服器未啟動？）';
      }
    }

    connBtn.onclick = doConnect;
    hostInput.addEventListener('keydown', e => { if (e.key === 'Enter') doConnect(); });
    setTimeout(() => { hostInput.focus(); hostInput.select(); }, 60);
  });
}

// ── Start screen（多人版 — 不讀存檔） ─────────────────────────────────────────
function showStartScreen(defaultName = '') {
  return new Promise(resolve => {
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
      <div style="font-size:13px;color:#5af;margin-bottom:6px;letter-spacing:2px;">
        ✦ 四人連線模式 ✦
      </div>
      <div style="font-size:13px;color:${net.playerColor};font-weight:bold;margin-bottom:22px;">
        你的隊伍：${net.playerColorName}
      </div>
      <input id="ss-name" type="text" maxlength="12"
        placeholder="輸入你的名字…"
        value="${defaultName}"
        style="font-size:20px;padding:10px 20px;border-radius:10px;
               border:2px solid ${net.playerColor};background:rgba(255,255,255,0.08);
               color:#fff;outline:none;text-align:center;width:250px;
               margin-bottom:24px;box-shadow:0 0 16px rgba(68,170,255,0.25);
               caret-color:${net.playerColor};"/>
      <div style="display:flex;justify-content:center;">
        <button id="ss-start" style="
          padding:14px 44px;font-size:18px;border:none;border-radius:12px;
          background:linear-gradient(135deg,#00897B,#004D40);color:#fff;
          cursor:pointer;font-weight:bold;
          box-shadow:0 4px 18px rgba(0,137,123,0.55);">
          🎮 開始遊戲
        </button>
      </div>
      <div style="margin-top:26px;font-size:12px;color:#456;line-height:2;">
        WASD 移動 ｜ 空白鍵 衝刺 ｜ E 抓/放 ｜ F 賣出 ｜ B 商店 ｜ 1–8 表情符號
      </div>
    `;
    document.body.appendChild(overlay);

    setTimeout(() => {
      const inp = document.getElementById('ss-name');
      if (inp) { inp.focus(); inp.select(); }
    }, 60);

    function doStart() {
      const name = (document.getElementById('ss-name')?.value ?? '').trim()
                   || net.playerColorName || '訓練師';
      overlay.style.transition = 'opacity 0.4s';
      overlay.style.opacity    = '0';
      setTimeout(() => overlay.remove(), 420);
      resolve({ name });
    }

    document.getElementById('ss-start').onclick = doStart;
    document.getElementById('ss-name')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doStart();
    });
  });
}

// ── Preload screen ─────────────────────────────────────────────────────────────
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

// ── Boot sequence ──────────────────────────────────────────────────────────────
buildTierGates();
_initMinimap();

// Global error / unhandled-rejection capture — shows a visible red box on screen
window.addEventListener('unhandledrejection', ev => {
  const msg = ev.reason?.message ?? String(ev.reason);
  const existing = document.getElementById('_promise-err-bar');
  if (existing) {
    const n = parseInt(existing.dataset.count ?? '1') + 1;
    existing.dataset.count = n;
    existing.textContent = `⛔ Promise 錯誤 (×${n}): ${msg}`;
    return;
  }
  const errDiv = document.createElement('div');
  errDiv.id = '_promise-err-bar';
  errDiv.dataset.count = '1';
  errDiv.style.cssText =
    'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);' +
    'background:rgba(180,0,0,0.93);color:#fff;padding:12px 20px;border-radius:10px;' +
    'z-index:9999;font-size:13px;font-family:monospace;max-width:90vw;word-break:break-all;';
  errDiv.textContent = `⛔ Promise 錯誤: ${msg}`;
  document.body.appendChild(errDiv);
  setTimeout(() => errDiv.remove(), 15000);
});
window.onerror = (msg, src, line) => {
  const existing = document.getElementById('_js-err-bar');
  if (existing) {
    const n = parseInt(existing.dataset.count ?? '1') + 1;
    existing.dataset.count = n;
    existing.textContent = `⛔ JS 錯誤 (×${n}): ${msg}  (${src?.split('/').pop()}:${line})`;
    return;
  }
  const errDiv = document.createElement('div');
  errDiv.id = '_js-err-bar';
  errDiv.dataset.count = '1';
  errDiv.style.cssText =
    'position:fixed;bottom:10px;left:50%;transform:translateX(-50%);' +
    'background:rgba(180,0,0,0.93);color:#fff;padding:12px 20px;border-radius:10px;' +
    'z-index:9999;font-size:13px;font-family:monospace;max-width:90vw;word-break:break-all;';
  errDiv.textContent = `⛔ JS 錯誤: ${msg}  (${src?.split('/').pop()}:${line})`;
  document.body.appendChild(errDiv);
  setTimeout(() => errDiv.remove(), 15000);
};

showPreloadScreen()
  .then(() => showConnectionScreen())
  .then(() => showStartScreen(net.playerColorName))
  .then(({ name }) => {
    try {
      playerName = name;

      // 多人模式：永遠全新開始、不寫存檔
      // Preserve lottery tickets from localStorage before reset
      const savedTickets = Economy.peekSave()?.lotteryTickets ?? [];
      economy.reset();
      economy.playerName       = name;
      economy.disableAutoSave  = true;
      economy.enableLotteryTax = true;   // 30% of income → prize pool
      economy.lotteryTickets   = savedTickets;

      player.speedLevel  = economy.speedLevel;
      player.magnetLevel = economy.magnetLevel;

      // ── 建立玩家專屬基地 ──────────────────────────────────────────────────────
      const bPos = getBasePos(net.playerId);
      const bHex = parseInt(net.playerColor.replace('#', ''), 16);
      base = new PlayerBase(scene, { x: bPos.x, z: bPos.z, colorHex: bHex });

      const bWarp = getBaseWarpPos(net.playerId);
      player.setWarpPosition(bWarp.x, bWarp.z);

      tsunami.setBase(base);

      const nameEl = document.getElementById('player-name-display');
      if (nameEl) nameEl.textContent = `👤 ${name} (${net.playerColorName})`;

      // ── 彩票初始化 ───────────────────────────────────────────────────────────
      shop.setNetwork(net);
      if (savedTickets.length > 0) {
        net.sendSyncTickets(savedTickets);
      }
      // Initialise prize pool display from welcome message if available
      if (typeof net._welcomePrizePool === 'number') {
        _prizePoolTotal = net._welcomePrizePool;
        window._prizePoolTotal = _prizePoolTotal;
        _updatePrizePoolDisplay();
      }

      tintPlayerMesh(net.playerColor);
      net.setName(name);
      updatePlayersPanel();

      addChatEntry('', `🎮 你已連線！隊伍：${net.playerColorName}`, net.playerColor);
      if (remotePlayers.size > 0) {
        addChatEntry('', `👥 房間內已有 ${remotePlayers.size} 位玩家`, '#aef');
      }

      gameStarted = true;
      document.getElementById('_boot-status')?.remove();
      audio.start();
      lastTime = performance.now();
      animate();
    } catch(err) {
      console.error('[BOOT ERROR]', err);
      const errDiv = document.createElement('div');
      errDiv.style.cssText =
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
        'background:rgba(180,0,0,0.95);color:#fff;padding:20px 28px;border-radius:14px;' +
        'z-index:9999;font-size:14px;font-family:monospace;max-width:85vw;' +
        'word-break:break-all;line-height:1.7;';
      errDiv.innerHTML = `<b>⛔ 遊戲啟動失敗</b><br>${err.message}<br><small>${
        (err.stack ?? '').split('\n').slice(0,4).join('<br>')
      }</small>`;
      document.body.appendChild(errDiv);
    }
  })
  .catch(err => {
    console.error('[CHAIN ERROR]', err);
    const errDiv = document.createElement('div');
    errDiv.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'background:rgba(140,0,120,0.95);color:#fff;padding:20px 28px;border-radius:14px;' +
      'z-index:9999;font-size:14px;font-family:monospace;max-width:85vw;word-break:break-all;';
    errDiv.textContent = `⛔ 流程錯誤: ${err.message ?? err}`;
    document.body.appendChild(errDiv);
  });
