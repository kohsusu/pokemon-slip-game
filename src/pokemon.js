import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  POKEMON_LEVELS, POKEMON_POOL, ZONE_MIN_LEVEL, ZONE_MAX_LEVEL,
  RARITY_COLORS, RARITY_CSS, SPRITE_BASE, ZONE_LENGTH, ROAD_WIDTH,
  NUM_ZONES, ZONES_PER_TIER, POKEMON_REFRESH_INTERVAL
} from './constants.js?v=17';

const POKEMON_PER_ZONE = 3;
const INTERACT_DIST    = 2.8;
const SPRITE_SIZE      = 2.2;   // world units for pokemon sprite
const loader           = new THREE.TextureLoader();

// Simple texture cache so same pokémon ID doesn't re-download
const textureCache = new Map();

function loadTexture(id) {
  if (textureCache.has(id)) return Promise.resolve(textureCache.get(id));
  return new Promise(resolve => {
    loader.load(
      `${SPRITE_BASE}${id}.png`,
      tex => { textureCache.set(id, tex); resolve(tex); },
      undefined,
      () => {
        // Fallback: solid colored circle canvas
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#aaa';
        ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 64, 64);
        const fallback = new THREE.CanvasTexture(canvas);
        textureCache.set(id, fallback);
        resolve(fallback);
      }
    );
  });
}

function makeLabel(text, rarityKey) {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 72;
  const ctx = canvas.getContext('2d');

  // Background pill
  const bg = RARITY_CSS[rarityKey] ?? '#888';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 2, 2, 316, 68, 16);
  ctx.fill();
  ctx.fillStyle = bg;
  roundRect(ctx, 5, 5, 310, 62, 13);
  ctx.fill();

  // Text
  ctx.fillStyle = isLight(bg) ? '#111' : '#fff';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 160, 36);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.2, 0.72, 1);
  return sprite;
}

function makeShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
  grad.addColorStop(0,   'rgba(0,0,0,0.35)');
  grad.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.ellipse(64, 64, 60, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.5, 1.0, 1);
  sprite.position.set(0, 0.05, 0);
  return sprite;
}

function makeAura(rarityColor) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const r = (rarityColor >> 16) & 0xFF;
  const g = (rarityColor >> 8)  & 0xFF;
  const b =  rarityColor        & 0xFF;
  const grad = ctx.createRadialGradient(128, 128, 30, 128, 128, 120);
  grad.addColorStop(0,   `rgba(${r},${g},${b},0.5)`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},0.15)`);
  grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.5, 4.5, 1);
  sprite.position.set(0, 1.2, 0);
  return sprite;
}

// ── Utility ────────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function isLight(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0,2),16);
  const g = parseInt(c.slice(2,4),16);
  const b = parseInt(c.slice(4,6),16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

// ── Shared sprite builder used by both local and network mode ───────────────
function _buildPokemonGroup(scene, x, z, lv, rarityColor, pokeId, pokeName, rarityKey) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  group.add(makeShadow());
  group.add(makeAura(rarityColor));

  // Placeholder sprite shown immediately
  const placeholderCanvas = document.createElement('canvas');
  placeholderCanvas.width = placeholderCanvas.height = 128;
  const pctx = placeholderCanvas.getContext('2d');
  pctx.fillStyle = '#ccc';
  pctx.beginPath(); pctx.arc(64, 64, 60, 0, Math.PI * 2); pctx.fill();
  const placeholderTex = new THREE.CanvasTexture(placeholderCanvas);
  const spriteMat = new THREE.SpriteMaterial({ map: placeholderTex, transparent: true });
  const pokeSprite = new THREE.Sprite(spriteMat);
  pokeSprite.scale.set(SPRITE_SIZE, SPRITE_SIZE, 1);
  pokeSprite.position.set(0, SPRITE_SIZE / 2 + 0.1, 0);
  group.add(pokeSprite);

  const label = makeLabel(`Lv.${lv} ${pokeName}`, rarityKey);
  label.position.set(0, SPRITE_SIZE + 0.85, 0);
  group.add(label);

  scene.add(group);
  return { group, pokeSprite, spriteMat };
}

// ── PokemonManager ─────────────────────────────────────────────────────────
export class PokemonManager {
  constructor(scene) {
    this.scene = scene;
    this.pokemon = [];
    this.refreshTimers = new Array(NUM_ZONES).fill(0);
    this._unlockedTiers = [true, false, false];
    this._networkMode = false;
    this._byNetId = new Map();

    // Only spawn tier-0 zones initially (skipped in network mode)
    for (let z = 0; z < ZONES_PER_TIER; z++) this._spawnZone(z);
  }

  // ── Network mode ───────────────────────────────────────────────────────────

  /**
   * Switch to server-authoritative mode.
   * Clears all locally spawned Pokémon; all future Pokémon come via
   * addNetworkPokemon() / removeByNetId() called by main_multi.js.
   */
  enableNetworkMode() {
    this._networkMode = true;
    // Purge any locally spawned Pokémon
    this.pokemon.forEach(p => this.scene.remove(p.group));
    this.pokemon = [];
    this._byNetId = new Map();
    // Prevent refresh timers from firing
    this.refreshTimers = new Array(NUM_ZONES).fill(999999);
  }

  /**
   * Add a Pokémon received from the server.
   * data: { netId, zone, x, z, lv, rarity, pokeId, name, income, cssColor }
   */
  addNetworkPokemon(data) {
    // Deduplicate: don't add if already present
    if (this._byNetId.has(data.netId)) return this._byNetId.get(data.netId);

    const rarityColor = parseInt((data.cssColor ?? '#aaaaaa').replace('#', ''), 16);
    const { group, pokeSprite, spriteMat } =
      _buildPokemonGroup(this.scene, data.x, data.z, data.lv, rarityColor, data.pokeId, data.name, data.rarity);

    const pokemon = {
      group, pokeSprite,
      lv:     data.lv,
      income: data.income,
      rarity: data.rarity,
      color:  rarityColor,
      id:     data.pokeId,
      name:   data.name,
      zone:   data.zone ?? 0,
      netId:  data.netId,
      carried: false,
    };
    this.pokemon.push(pokemon);
    this._byNetId.set(data.netId, pokemon);

    // Async: swap placeholder for real artwork
    loadTexture(data.pokeId).then(tex => {
      if (!pokemon.carried) {
        spriteMat.map = tex;
        spriteMat.needsUpdate = true;
      }
      pokemon._tex = tex;
    });

    return pokemon;
  }

  /** Remove a network Pokémon by its server-assigned netId. */
  removeByNetId(netId) {
    const p = this._byNetId.get(netId);
    if (!p) return;
    this.scene.remove(p.group);
    this.pokemon = this.pokemon.filter(pp => pp !== p);
    this._byNetId.delete(netId);
  }

  /** Look up a network Pokémon by netId. */
  getByNetId(netId) { return this._byNetId.get(netId) ?? null; }

  // ── Tier unlocks (no-ops in network mode) ──────────────────────────────────

  unlockTier(tierIdx) {
    if (this._networkMode) return;
    if (this._unlockedTiers[tierIdx]) return;
    this._unlockedTiers[tierIdx] = true;
    const start = tierIdx * ZONES_PER_TIER;
    for (let z = start; z < start + ZONES_PER_TIER; z++) this._spawnZone(z);
  }

  setInitialTiers(tiers) {
    if (this._networkMode) return;
    for (let t = 1; t < tiers.length; t++) {
      if (tiers[t] && !this._unlockedTiers[t]) {
        this._unlockedTiers[t] = true;
        const start = t * ZONES_PER_TIER;
        for (let z = start; z < start + ZONES_PER_TIER; z++) this._spawnZone(z);
      }
    }
  }

  // ── Local spawn helpers ────────────────────────────────────────────────────

  _clearZone(zoneIdx) {
    this.pokemon = this.pokemon.filter(p => {
      if (p.zone === zoneIdx && !p.seated && !p.carried) {
        this.scene.remove(p.group);
        return false;
      }
      return true;
    });
  }

  _spawnZone(zoneIdx) {
    const minLv = ZONE_MIN_LEVEL[zoneIdx];
    const maxLv = ZONE_MAX_LEVEL[zoneIdx];
    for (let i = 0; i < POKEMON_PER_ZONE; i++) {
      const lv = minLv + Math.floor(Math.random() * (maxLv - minLv + 1));
      this._spawnOne(zoneIdx, lv);
    }
  }

  _spawnOne(zoneIdx, lv) {
    const lvData  = POKEMON_LEVELS[lv - 1];
    const pool    = POKEMON_POOL[lv];
    const picked  = pool[Math.floor(Math.random() * pool.length)];
    const income  = Math.floor(
      lvData.minIncome + Math.random() * (lvData.maxIncome - lvData.minIncome + 1)
    );

    const zEnd   = -((zoneIdx + 1) * ZONE_LENGTH);
    const spawnZ = zEnd + 4 + Math.random() * (ZONE_LENGTH - 6);
    const spawnX = (Math.random() - 0.5) * (ROAD_WIDTH - 2.5);

    const rarityColor = RARITY_COLORS[lvData.rarity] ?? 0xAAAAAA;
    const { group, pokeSprite, spriteMat } =
      _buildPokemonGroup(this.scene, spawnX, spawnZ, lv, rarityColor, picked.id, picked.name, lvData.rarity);

    const pokemon = {
      group, pokeSprite,
      lv, income, rarity: lvData.rarity,
      color: rarityColor,
      id: picked.id, name: picked.name,
      zone: zoneIdx,
      netId: null,   // null in local (single-player) mode
      carried: false,
    };
    this.pokemon.push(pokemon);

    loadTexture(picked.id).then(tex => {
      if (!pokemon.carried) {
        spriteMat.map = tex;
        spriteMat.needsUpdate = true;
      }
      pokemon._tex = tex;
    });

    return pokemon;
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  update(dt, player) {
    // Refresh timers only in local mode
    if (!this._networkMode) {
      for (let z = 0; z < NUM_ZONES; z++) {
        const tier = Math.floor(z / ZONES_PER_TIER);
        if (!this._unlockedTiers[tier]) continue;
        this.refreshTimers[z] += dt;
        if (this.refreshTimers[z] >= POKEMON_REFRESH_INTERVAL) {
          this.refreshTimers[z] = 0;
          this._clearZone(z);
          this._spawnZone(z);
        }
      }
    }

    const t = performance.now() / 1000;
    this.pokemon.forEach((p, i) => {
      if (!p.carried) {
        p.group.position.y = Math.sin(t * 1.8 + i * 1.3) * 0.12;
        if (p.group.children[1]) p.group.children[1].material.rotation = t * 0.4 + i;
      }
    });
  }

  // ── Interaction helpers ────────────────────────────────────────────────────

  getNearby(playerPos) {
    let best = null, bestDist = INTERACT_DIST;
    this.pokemon.forEach(p => {
      if (p.carried) return;
      const dx = p.group.position.x - playerPos.x;
      const dz = p.group.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) { bestDist = dist; best = p; }
    });
    return best;
  }

  markCarried(pokemon, carried) {
    pokemon.carried = carried;
    pokemon.group.visible = !carried;
  }

  dropAt(pokemon, x, z) {
    pokemon.carried = false;
    pokemon.group.position.set(x, 0, z);
    pokemon.group.visible = true;
    if (pokemon._tex) {
      pokemon.pokeSprite.material.map = pokemon._tex;
      pokemon.pokeSprite.material.needsUpdate = true;
    }
  }

  remove(pokemon) {
    this.scene.remove(pokemon.group);
    this.pokemon = this.pokemon.filter(p => p !== pokemon);
    if (pokemon.netId != null) this._byNetId.delete(pokemon.netId);
  }
}
