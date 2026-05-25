import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { createScene }     from './scene.js?v=16';
import { Road }            from './road.js?v=17';
import { Player }          from './player.js?v=18';
import { TsunamiMechanic } from './tsunamiMechanic.js?v=16';
import { PokemonManager }  from './pokemon.js?v=18';
import { PlayerBase, getBasePos, getBaseWarpPos } from './base.js?v=18';
import { Economy }         from './economy.js?v=17';
import { Shop }            from './shop.js?v=17';
import { AudioManager }    from './audio.js?v=16';
import { NetworkManager }  from './network.js?v=16';
import { RemotePlayer }    from './remote_player.js?v=19';
import { TouchControls }   from './touch_controls.js?v=16';
import {
  ZONE_LENGTH, ZONES_PER_TIER, TIER_UNLOCK_COST, TIER_NAMES,
  TIER_CSS_COLORS, ROAD_WIDTH, RARITY_CSS, BASE_SEATS_PER_FLOOR, SPRITE_BASE,
} from './constants.js?v=17';

const _texLoader = new THREE.TextureLoader();

// ── Victory ────────────────────────────────────────────────────────────────────
const VICTORY_THRESHOLD = 10_000_000_000_000;  // 10000B
let   _gameOver         = false;

// Pokémon IDs used for the rain celebration
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

const remotePlayers    = new Map();   // id → RemotePlayer
const _remoteBaseObjs  = new Map();  // playerId → THREE.Mesh[] (base-seat spheres)
const _createdRemoteBases = new Set(); // playerIds for which we've built a base structure

// ── Scene ──────────────────────────────────────────────────────────────────────
const container = document.getElementById('canvas-container');
const { scene, camera, renderer } = createScene(container);

const audio   = new AudioManager();
const road    = new Road(scene);
const player  = new Player(scene);
new TouchControls(player, { isMulti: true });
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

// ── Tier gates ─────────────────────────────────────────────────────────────────
const tierGates = [];

function buildTierGates() {
  [1, 2].forEach((tier) => {
    const gateZ = -(tier * ZONES_PER_TIER * ZONE_LENGTH);
    const color = TIER_CSS_COLORS[tier];
    const group = new THREE.Group();

    for (let px = -ROAD_WIDTH / 2 - 1; px <= ROAD_WIDTH / 2 + 1; px += 2) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 5, 0.4),
        new THREE.MeshLambertMaterial({ color: tier === 1 ? 0xFF8F00 : 0xE53935 }),
      );
      post.position.set(px, 2.5, gateZ);
      group.add(post);
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(ROAD_WIDTH + 4, 0.4, 0.4),
      new THREE.MeshLambertMaterial({ color: tier === 1 ? 0xFF8F00 : 0xE53935 }),
    );
    beam.position.set(0, 5, gateZ);
    group.add(beam);

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
    const pos3D = new THREE.Vector3(0, 5.5, gate.gateZ);
    pos3D.project(camera);
    const x = (pos3D.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-pos3D.y * 0.5 + 0.5) * window.innerHeight;
    if (pos3D.z < 1 && y > 0 && y < window.innerHeight) {
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
const CAM_OFFSET = new THREE.Vector3(0, 12, 16);

function updateCamera() {
  const t = player.position;
  camera.position.lerp(
    new THREE.Vector3(t.x + CAM_OFFSET.x, CAM_OFFSET.y, t.z + CAM_OFFSET.z),
    0.08,
  );
  camera.lookAt(t.x, 1, t.z);
}

// ── Warp flash ─────────────────────────────────────────────────────────────────
function triggerWarpFlash() {
  warpFlash.style.opacity = '0.85';
  setTimeout(() => { warpFlash.style.opacity = '0'; }, 350);
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
function updateRemoteBaseDisplay(playerId, seats) {
  // Dispose previous objects for this player
  const old = _remoteBaseObjs.get(playerId);
  if (old) {
    old.forEach(obj => {
      scene.remove(obj);
      obj.material?.map?.dispose();
      obj.material?.dispose();
    });
  }

  const bPos     = getBasePos(playerId);
  const newObjs  = [];
  const totalRows = Math.ceil(BASE_SEATS_PER_FLOOR / _BASE_COLS);

  (seats || []).forEach((seat, i) => {
    // Mirror the exact seat position formula in PlayerBase._buildBase()
    const col   = i % _BASE_COLS;
    const row   = Math.floor(i / _BASE_COLS);
    const seatX = bPos.x - _BASE_W / 2 + 2 + col * (_BASE_W - 4) / (_BASE_COLS - 1);
    const seatZ = bPos.z - _BASE_D / 2 + 2 + row * (_BASE_D - 4) / (totalRows - 1);
    const posY  = _FLOOR_Y + 1.05;   // slightly above seat surface

    // ── Rarity-coloured backing circle (shows immediately) ──────────────────
    const bgCvs = document.createElement('canvas');
    bgCvs.width = bgCvs.height = 64;
    const ctx = bgCvs.getContext('2d');
    ctx.fillStyle = seat.cssColor ?? '#aaaaaa';
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    const bgMat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(bgCvs),
      transparent: true, depthTest: false,
    });
    const bgSprite = new THREE.Sprite(bgMat);
    bgSprite.scale.set(1.2, 1.2, 1);
    bgSprite.position.set(seatX, posY, seatZ);
    scene.add(bgSprite);
    newObjs.push(bgSprite);

    // ── Actual Pokémon artwork (loaded async, overlaid on circle) ───────────
    if (seat.pokeId) {
      const artMat = new THREE.SpriteMaterial({
        transparent: true, depthTest: false, opacity: 0,
      });
      const artSprite = new THREE.Sprite(artMat);
      artSprite.scale.set(1.1, 1.1, 1);
      artSprite.position.set(seatX, posY, seatZ);
      scene.add(artSprite);
      newObjs.push(artSprite);

      _texLoader.load(
        `${SPRITE_BASE}${seat.pokeId}.png`,
        tex => {
          artMat.map     = tex;
          artMat.opacity = 1;
          artMat.needsUpdate = true;
        },
        undefined,
        () => { /* artwork failed — backing circle already visible */ },
      );
    }
  });

  _remoteBaseObjs.set(playerId, newObjs);
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
  net._send({ type: 'base_update', seats });
}

// ── Interaction ────────────────────────────────────────────────────────────────
let ePrev = false, fPrev = false, bPrev = false, tPrev = false;

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
            net._send({ type: 'pokemon_drop', netId: p.netId,
              x: Math.round(dx * 100) / 100, z: Math.round(dz * 100) / 100 });
          }
          showMsg(`基地座位已滿！${p.name} 掉落在地！`);
        } else {
          placed++;
          if (p.netId != null) net._send({ type: 'pokemon_deposit', netId: p.netId });
        }
      });
      if (placed > 0) {
        audio.playDeposit();
        showMsg(`放入基地 ${placed} 隻寶可夢！`);
        _broadcastBaseState();
      }

    } else if (player.heldPokemon.length > 0) {
      // DROP one on ground
      const p  = player.dropOne();
      const dx = player.position.x;
      const dz = player.position.z;
      pokeMgr.dropAt(p, dx, dz);
      if (p.netId != null) net._send({ type: 'pokemon_drop', netId: p.netId, x: dx, z: dz });
      audio.playDrop();
      showMsg('放下寶可夢');

    } else {
      // PICKUP nearby Pokémon from ground
      let picked = 0;
      while (player.canPickup()) {
        const nearby = pokeMgr.getNearby(player.position);
        if (!nearby) break;
        pokeMgr.markCarried(nearby, true);
        player.pickup(nearby);
        if (nearby.netId != null) net._send({ type: 'pokemon_pickup', netId: nearby.netId });
        picked++;
      }
      if (picked > 0) { audio.playPickup(); showMsg(`抓到 ${picked} 隻寶可夢！`); }
    }
  }
  ePrev = eNow;

  // ── F: sell held Pokémon (anywhere) ───────────────────────────────────────
  if (fNow && !fPrev) {
    if (player.heldPokemon.length > 0) {
      const p   = player.dropOne();
      if (p.netId != null) net._send({ type: 'pokemon_sell', netId: p.netId });
      pokeMgr.remove(p);
      const val = p.income * 100;
      economy.earn(val);
      audio.playSell();
      showMsg(`賣出 ${p.name}！獲得 $${economy._fmt(val)}`);
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
      position:fixed;top:80px;right:14px;
      background:rgba(0,0,0,0.78);color:#fff;padding:8px 18px;
      border-radius:12px;font-size:14px;z-index:50;pointer-events:none;
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
      position:fixed;top:180px;left:50%;transform:translateX(-50%);
      font-size:20px;font-weight:bold;color:#fff;z-index:15;pointer-events:none;
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

// ── Sprint indicator ───────────────────────────────────────────────────────────
let _sprintEl = null;
function updateSprintIndicator() {
  if (!_sprintEl) {
    _sprintEl = document.createElement('div');
    _sprintEl.style.cssText = `
      position:fixed;top:208px;left:50%;transform:translateX(-50%);
      font-size:14px;font-weight:bold;color:#FFD700;z-index:15;pointer-events:none;
      text-shadow:0 0 8px #000;letter-spacing:1px;white-space:nowrap;
    `;
    document.body.appendChild(_sprintEl);
  }
  _sprintEl.textContent = player.isSprinting ? '⚡ 衝刺中' : '';
}

// ── Tier unlock panel ──────────────────────────────────────────────────────────
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

// ── Self emoji (above own head) ────────────────────────────────────────────────
const EMOJIS = ['👍', '😱', '🎉', '😂', '🔥', '💀', '❤️', '🌊'];

const selfEmojiEl = document.createElement('div');
selfEmojiEl.style.cssText = `
  position:fixed;z-index:7;pointer-events:none;
  font-size:28px;transform:translateX(-50%);display:none;
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
  let html = `<span style="color:${net.playerColor};font-weight:bold;">● ${playerName} 你</span>`
           + `<br><small style="color:#aaa;">💰 $${_fmtShort(myMoney)}</small>`;

  remotePlayers.forEach(rp => {
    html += `<br><span style="color:${rp.color};">● ${rp.name}</span>`
          + `<br><small style="color:#aaa;">💰 $${_fmtShort(rp.money || 0)}</small>`;
  });
  el.innerHTML = html;
}

// ── Network handlers ───────────────────────────────────────────────────────────
function setupNetworkHandlers() {
  // ── 海嘯同步（server 廣播，所有人同時觸發）────────────────────────────────
  tsunami.setNetworkControlled(true);

  net.on('wave_alert', msg => {
    tsunami.triggerNetworkWaveAlert(msg.waveType);
  });
  net.on('wave_start', msg => {
    tsunami.triggerNetworkWaveStart(msg.waveType);
  });
  net.on('wave_end', () => {
    tsunami.triggerNetworkWaveEnd();
  });

  // ── 寶可夢同步 ────────────────────────────────────────────────────────────
  net.on('pokemon_spawn', msg => {
    pokeMgr.addNetworkPokemon(msg);
  });

  net.on('pokemon_remove', msg => {
    pokeMgr.removeByNetId(msg.netId);
  });

  // ── 其他玩家基地狀態 ──────────────────────────────────────────────────────
  net.on('base_update', msg => {
    if (msg.playerId !== net.playerId) {
      updateRemoteBaseDisplay(msg.playerId, msg.seats || []);
    }
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
    // Clean up their base display
    const oldObjs = _remoteBaseObjs.get(msg.id);
    if (oldObjs) {
      oldObjs.forEach(obj => scene.remove(obj));
      _remoteBaseObjs.delete(msg.id);
    }
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
    _remoteBaseObjs.forEach(objs => objs.forEach(obj => scene.remove(obj)));
    _remoteBaseObjs.clear();
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

// ── Tint local player mesh to team colour ─────────────────────────────────────
function tintPlayerMesh(cssColor) {
  const hex = parseInt(cssColor.replace('#', ''), 16);
  [0, 2, 3].forEach(i => {
    const child = player.mesh.children[i];
    if (child?.material) {
      child.material = child.material.clone();
      child.material.color.setHex(hex);
    }
  });
}

// ── Position broadcast timer ───────────────────────────────────────────────────
let _broadcastTimer = 0;
const BROADCAST_INTERVAL = 0.1;

// ── Main animate loop ──────────────────────────────────────────────────────────
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
    if (_gameOver) return;   // 遊戲已結束，不再受海嘯懲罰
    const dropPos = player.position.clone();
    const dropped = player.warpToBase();
    dropped.forEach((p, i) => {
      const dx = dropPos.x + (i - dropped.length / 2) * 1.2;
      const dz = dropPos.z;
      pokeMgr.dropAt(p, dx, dz);
      if (p.netId != null) {
        net._send({ type: 'pokemon_drop', netId: p.netId,
          x: Math.round(dx * 100) / 100, z: Math.round(dz * 100) / 100 });
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

  pokeMgr.update(dt, player);
  if (base) {
    base.update(dt);
    economy.update(dt, base.getSeatedPokemon());
  } else {
    economy.update(dt, []);
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
  updateSprintIndicator();
  updateTierUnlockPanel();
  updateGateLabelPositions();
  updateCamera();

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
      }
    }
  }

  remotePlayers.forEach(rp => rp.update(dt));

  // Self emoji bubble above own head
  if (selfEmojiEl.style.display !== 'none') {
    const ep = new THREE.Vector3(player.position.x, 3.8, player.position.z)
      .project(camera);
    selfEmojiEl.style.left = `${(ep.x * 0.5 + 0.5) * window.innerWidth}px`;
    selfEmojiEl.style.top  = `${(-ep.y * 0.5 + 0.5) * window.innerHeight}px`;
  }

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

document.getElementById('controls-hint').innerHTML = `
  WASD / 方向鍵 移動<br>
  空白鍵 切換衝刺（再按恢復）<br>
  <b>E</b> 抓取 / 存入基地<br>
  <b>F</b> 賣出一隻（隨時可用）<br>
  <b>B</b> 商店（在商店旁）<br>
  <b>1–8</b> 發送表情符號
`;

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

// ── Boot sequence ──────────────────────────────────────────────────────────────
buildTierGates();

showConnectionScreen()
  .then(() => showStartScreen(net.playerColorName))
  .then(({ name }) => {
    playerName = name;

    // 多人模式：永遠全新開始、不寫存檔
    economy.reset();
    economy.playerName    = name;
    economy.disableAutoSave = true;

    player.speedLevel = economy.speedLevel;
    player.gripLevel  = economy.gripLevel;

    // ── 建立玩家專屬基地 ──────────────────────────────────────────────────────
    const bPos = getBasePos(net.playerId);
    const bHex = parseInt(net.playerColor.replace('#', ''), 16);
    base = new PlayerBase(scene, { x: bPos.x, z: bPos.z, colorHex: bHex });

    const bWarp = getBaseWarpPos(net.playerId);
    player.setWarpPosition(bWarp.x, bWarp.z);

    tsunami.setBase(base);

    const nameEl = document.getElementById('player-name-display');
    if (nameEl) nameEl.textContent = `👤 ${name} (${net.playerColorName})`;

    tintPlayerMesh(net.playerColor);
    net.setName(name);
    updatePlayersPanel();

    addChatEntry('', `🎮 你已連線！隊伍：${net.playerColorName}`, net.playerColor);
    if (remotePlayers.size > 0) {
      addChatEntry('', `👥 房間內已有 ${remotePlayers.size} 位玩家`, '#aef');
    }

    gameStarted = true;
    audio.start();
    lastTime = performance.now();
    animate();
  });
