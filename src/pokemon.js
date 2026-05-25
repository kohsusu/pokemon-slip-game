import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { GLTFLoader }  from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';
import {
  POKEMON_LEVELS, POKEMON_POOL, ZONE_MIN_LEVEL, ZONE_MAX_LEVEL,
  RARITY_COLORS, RARITY_CSS, SPRITE_BASE, ZONE_LENGTH, ROAD_WIDTH,
  NUM_ZONES, ZONES_PER_TIER, POKEMON_REFRESH_INTERVAL,
} from './constants.js?v=17';

// ── 3D model config ────────────────────────────────────────────────────────────
const MODEL_BASE   = 'https://cdn.jsdelivr.net/gh/Pokemon-3D-api/assets@main/models/opt/regular/';
const TARGET_HEIGHT = 1.6;   // world units — models auto-scaled to this height

// ── GLTF loader (shared, Draco compressed) ─────────────────────────────────────
const _dracoLoader = new DRACOLoader();
_dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const _gltfLoader = new GLTFLoader();
_gltfLoader.setDRACOLoader(_dracoLoader);

// ── GLTF cache: pokeId → { scene, animations } ────────────────────────────────
//   Raw GLTF stored once; each Pokémon instance clones the scene via SkeletonUtils.
const _gltfCache = new Map();

function _loadGltf(pokeId, onSuccess, onFail) {
  if (_gltfCache.has(pokeId)) {
    const cached = _gltfCache.get(pokeId);
    onSuccess({
      scene:      SkeletonUtils.clone(cached.scene),
      animations: cached.animations,
    });
    return;
  }
  _gltfLoader.load(
    `${MODEL_BASE}${pokeId}.glb`,
    gltf => {
      _gltfCache.set(pokeId, { scene: gltf.scene, animations: gltf.animations });
      onSuccess({
        scene:      SkeletonUtils.clone(gltf.scene),
        animations: gltf.animations,
      });
    },
    undefined,
    () => onFail?.(),
  );
}

/** Scale model to TARGET_HEIGHT and lift so its feet sit at y=0. */
function _autoFitModel(model, targetH = TARGET_HEIGHT) {
  const box  = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0) model.scale.setScalar(targetH / size.y);
  // Re-compute after scaling, then ground the model
  const box2 = new THREE.Box3().setFromObject(model);
  model.position.y -= box2.min.y;
}

// ── 2-D texture cache (for player hold-indicators in player.js) ────────────────
const _texLoader2d  = new THREE.TextureLoader();
const _textureCache = new Map();

function loadTexture(id) {
  if (_textureCache.has(id)) return Promise.resolve(_textureCache.get(id));
  return new Promise(resolve => {
    _texLoader2d.load(
      `${SPRITE_BASE}${id}.png`,
      tex => { _textureCache.set(id, tex); resolve(tex); },
      undefined,
      () => {
        // Fallback circle canvas
        const cvs = document.createElement('canvas');
        cvs.width = cvs.height = 128;
        const ctx = cvs.getContext('2d');
        ctx.fillStyle = '#aaa';
        ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', 64, 64);
        const fallback = new THREE.CanvasTexture(cvs);
        _textureCache.set(id, fallback);
        resolve(fallback);
      },
    );
  });
}

// ── Canvas helpers ─────────────────────────────────────────────────────────────
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function _isLight(hex) {
  const c = hex.replace('#', '');
  return (parseInt(c.slice(0,2),16)*299 + parseInt(c.slice(2,4),16)*587
        + parseInt(c.slice(4,6),16)*114) / 1000 > 160;
}

function makeLabel(text, rarityKey) {
  const cvs = document.createElement('canvas');
  cvs.width = 320; cvs.height = 72;
  const ctx = cvs.getContext('2d');
  const bg  = RARITY_CSS[rarityKey] ?? '#888';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  _roundRect(ctx, 2, 2, 316, 68, 16); ctx.fill();
  ctx.fillStyle = bg;
  _roundRect(ctx, 5, 5, 310, 62, 13); ctx.fill();
  ctx.fillStyle = _isLight(bg) ? '#111' : '#fff';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 160, 36);
  const tex    = new THREE.CanvasTexture(cvs);
  const mat    = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(3.2, 0.72, 1);
  return sprite;
}

function makeAura(rarityColor) {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 256;
  const ctx = cvs.getContext('2d');
  const r = (rarityColor >> 16) & 0xFF;
  const g = (rarityColor >>  8) & 0xFF;
  const b =  rarityColor        & 0xFF;
  const grad = ctx.createRadialGradient(128, 128, 30, 128, 128, 120);
  grad.addColorStop(0,   `rgba(${r},${g},${b},0.5)`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},0.15)`);
  grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
  const tex    = new THREE.CanvasTexture(cvs);
  const mat    = new THREE.SpriteMaterial({
    map: tex, depthTest: false, transparent: true,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.5, 4.5, 1);
  sprite.position.set(0, 1.2, 0);
  return sprite;
}

// ── Pokémon group builder ──────────────────────────────────────────────────────
/**
 * Creates a THREE.Group containing:
 *   - Rarity aura sprite (shows immediately)
 *   - Coloured sphere placeholder (removed once GLTF loads)
 *   - Name/level label sprite
 *   - Pokémon 3D model + AnimationMixer (loaded async)
 *   - Fallback 2-D sprite if GLB is unavailable
 *
 * Returns { group } — mixer and model refs are written to the pokemon object
 * by the caller once the async load resolves.
 */
function _buildPokemonGroup(scene, pokemonRef, x, z, lv, rarityColor, pokeId, pokeName, rarityKey) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // Aura (always visible)
  const aura = makeAura(rarityColor);
  group._aura = aura;
  group.add(aura);

  // Placeholder sphere — rarity colour, shown until GLTF loads
  const placeholder = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 14, 10),
    new THREE.MeshLambertMaterial({ color: rarityColor }),
  );
  placeholder.position.y = 0.55;
  placeholder.castShadow = true;
  group._placeholder = placeholder;
  group.add(placeholder);

  // Label sprite
  const label = makeLabel(`Lv.${lv} ${pokeName}`, rarityKey);
  label.position.set(0, 2.5, 0);
  group._label = label;
  group.add(label);

  scene.add(group);

  // ── Async 3D model load ──────────────────────────────────────────────────
  _loadGltf(pokeId,
    ({ scene: model, animations }) => {
      if (!pokemonRef.group) return; // already removed from scene

      _autoFitModel(model);
      model.traverse(child => {
        if (child.isMesh) {
          child.castShadow    = true;
          child.receiveShadow = true;
        }
      });

      // Remove placeholder, add real model
      group.remove(placeholder);
      placeholder.geometry.dispose();
      placeholder.material.dispose();
      group.add(model);
      group._model = model;

      // Raise label above model
      label.position.y = TARGET_HEIGHT + 1.1;

      // Set up AnimationMixer — prefer an 'idle' clip
      if (animations.length > 0) {
        const idleClip = animations.find(a => /idle/i.test(a.name)) ?? animations[0];
        const mixer    = new THREE.AnimationMixer(model);
        mixer.clipAction(idleClip).play();
        pokemonRef._mixer = mixer;   // write back to caller's object
      }
    },
    () => {
      // GLB unavailable — fall back to 2-D artwork sprite
      loadTexture(pokeId).then(tex => {
        if (!pokemonRef.group) return;
        group.remove(placeholder);
        placeholder.geometry.dispose();
        placeholder.material.dispose();
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite    = new THREE.Sprite(spriteMat);
        sprite.scale.set(2.2, 2.2, 1);
        sprite.position.set(0, 1.2, 0);
        group.add(sprite);
        label.position.y = 2.8;
        pokemonRef._fallbackSprite = sprite;
      });
    },
  );

  return { group };
}

// ── Constants ──────────────────────────────────────────────────────────────────
const POKEMON_PER_ZONE = 3;
const INTERACT_DIST    = 2.8;

// ── PokemonManager ─────────────────────────────────────────────────────────────
export class PokemonManager {
  constructor(scene) {
    this.scene = scene;
    this.pokemon = [];
    this.refreshTimers = new Array(NUM_ZONES).fill(0);
    this._unlockedTiers = [true, false, false];
    this._networkMode   = false;
    this._byNetId       = new Map();

    for (let z = 0; z < ZONES_PER_TIER; z++) this._spawnZone(z);
  }

  // ── Network mode ─────────────────────────────────────────────────────────

  enableNetworkMode() {
    this._networkMode = true;
    this.pokemon.forEach(p => this.scene.remove(p.group));
    this.pokemon = [];
    this._byNetId = new Map();
    this.refreshTimers = new Array(NUM_ZONES).fill(999999);
  }

  addNetworkPokemon(data) {
    if (this._byNetId.has(data.netId)) return this._byNetId.get(data.netId);

    const rarityColor = parseInt((data.cssColor ?? '#aaaaaa').replace('#', ''), 16);

    const pokemon = {
      group:   null,   // filled below
      lv:      data.lv,
      income:  data.income,
      rarity:  data.rarity,
      color:   rarityColor,
      id:      data.pokeId,
      name:    data.name,
      zone:    data.zone ?? 0,
      netId:   data.netId,
      carried: false,
      seated:  false,
      _mixer:  null,   // filled by _buildPokemonGroup when GLTF resolves
      _tex:    null,   // 2-D texture for player hold-indicator
    };

    const { group } = _buildPokemonGroup(
      this.scene, pokemon,
      data.x, data.z, data.lv, rarityColor, data.pokeId, data.name, data.rarity,
    );
    pokemon.group = group;

    this.pokemon.push(pokemon);
    this._byNetId.set(data.netId, pokemon);

    // Always load 2-D texture for the player's hold-indicator
    loadTexture(data.pokeId).then(tex => { pokemon._tex = tex; });

    return pokemon;
  }

  removeByNetId(netId) {
    const p = this._byNetId.get(netId);
    if (!p) return;
    this._disposeAndRemove(p);
    this.pokemon = this.pokemon.filter(pp => pp !== p);
    this._byNetId.delete(netId);
  }

  getByNetId(netId) { return this._byNetId.get(netId) ?? null; }

  // ── Tier unlocks ──────────────────────────────────────────────────────────

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

  // ── Local spawn helpers ───────────────────────────────────────────────────

  _clearZone(zoneIdx) {
    this.pokemon = this.pokemon.filter(p => {
      if (p.zone === zoneIdx && !p.seated && !p.carried) {
        this._disposeAndRemove(p);
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
      lvData.minIncome + Math.random() * (lvData.maxIncome - lvData.minIncome + 1),
    );
    const zEnd    = -((zoneIdx + 1) * ZONE_LENGTH);
    const spawnZ  = zEnd + 4 + Math.random() * (ZONE_LENGTH - 6);
    const spawnX  = (Math.random() - 0.5) * (ROAD_WIDTH - 2.5);
    const rarityColor = RARITY_COLORS[lvData.rarity] ?? 0xAAAAAA;

    const pokemon = {
      group:   null,
      lv, income, rarity: lvData.rarity,
      color:   rarityColor,
      id:      picked.id,
      name:    picked.name,
      zone:    zoneIdx,
      netId:   null,
      carried: false,
      seated:  false,
      _mixer:  null,
      _tex:    null,
    };

    const { group } = _buildPokemonGroup(
      this.scene, pokemon,
      spawnX, spawnZ, lv, rarityColor, picked.id, picked.name, lvData.rarity,
    );
    pokemon.group = group;
    this.pokemon.push(pokemon);

    loadTexture(picked.id).then(tex => { pokemon._tex = tex; });
    return pokemon;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(dt) {
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
      if (p.carried) return;

      // Advance 3-D animation mixer
      p._mixer?.update(dt);

      // Gentle hover (only for free-standing pokemon, not seated ones)
      if (!p.seated) {
        p.group.position.y = Math.sin(t * 1.8 + i * 1.3) * 0.08;
        // Spin aura
        if (p.group._aura) p.group._aura.material.rotation = t * 0.4 + i;
      }
    });
  }

  // ── Interaction helpers ───────────────────────────────────────────────────

  getNearby(playerPos) {
    let best = null, bestDist = INTERACT_DIST;
    this.pokemon.forEach(p => {
      if (p.carried) return;
      const dx = p.group.position.x - playerPos.x;
      const dz = p.group.position.z - playerPos.z;
      const d  = Math.sqrt(dx * dx + dz * dz);
      if (d < bestDist) { bestDist = d; best = p; }
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
  }

  remove(pokemon) {
    this._disposeAndRemove(pokemon);
    this.pokemon = this.pokemon.filter(p => p !== pokemon);
    if (pokemon.netId != null) this._byNetId.delete(pokemon.netId);
  }

  // ── Internal disposal ─────────────────────────────────────────────────────

  _disposeAndRemove(pokemon) {
    // Stop animation
    pokemon._mixer?.stopAllAction();
    pokemon._mixer = null;

    // Remove group from scene
    this.scene.remove(pokemon.group);

    // Mark as removed so async callbacks bail out
    const g = pokemon.group;
    pokemon.group = null;

    // Dispose label + aura canvas textures (per-pokemon)
    g._label?.material?.map?.dispose();
    g._label?.material?.dispose();
    g._aura?.material?.map?.dispose();
    g._aura?.material?.dispose();
    // Placeholder sphere (may have been removed already if model loaded)
    g._placeholder?.geometry?.dispose();
    g._placeholder?.material?.dispose();
    // Fallback sprite (if 3D model was unavailable)
    g._fallbackSprite?.material?.map?.dispose();
    g._fallbackSprite?.material?.dispose();
    // NOTE: GLTF model geometries/materials are shared via cache — do NOT dispose them
  }
}
