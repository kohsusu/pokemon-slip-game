import * as THREE from 'three';
import { GLTFLoader }     from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader }    from 'three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { buildDragonite } from './dragonite.js?v=2';
import {
  POKEMON_LEVELS, POKEMON_POOL, ZONE_MIN_LEVEL, ZONE_MAX_LEVEL,
  RARITY_COLORS, RARITY_CSS, SPRITE_BASE, ZONE_LENGTH, ROAD_WIDTH,
  NUM_ZONES, ZONES_PER_TIER, POKEMON_REFRESH_INTERVAL,
} from './constants.js?v=17';

// ── Pokémon ID → custom geometry builder (overrides GLTF for these IDs) ────────
const _CUSTOM_BUILDERS = new Map([
  [149, buildDragonite],   // 快龍 Dragonite
]);

// ── 3D model config ────────────────────────────────────────────────────────────
const MODEL_BASE    = 'https://cdn.jsdelivr.net/gh/Pokemon-3D-api/assets@main/models/opt/regular/';
const TARGET_HEIGHT = 2.6;    // world units — models auto-scaled to this height
const GLTF_TIMEOUT_MS = 6000; // safety fallback (normally preloaded before spawn)

// ── GLTF loader (shared, Draco compressed) ─────────────────────────────────────
const _dracoLoader = new DRACOLoader();
_dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
const _gltfLoader = new GLTFLoader();
_gltfLoader.setDRACOLoader(_dracoLoader);

// ── GLTF cache + pending queue ────────────────────────────────────────────────
//   _gltfCache:   pokeId → { scene, animations }  (null = confirmed failed)
//   _gltfPending: pokeId → [{onSuccess, onFail}]  (callbacks waiting for in-flight load)
const _gltfCache   = new Map();
const _gltfPending = new Map();

function _loadGltf(pokeId, onSuccess, onFail) {
  // ① Serve from cache — deferred via microtask so callers can set pokemonRef.group first
  if (_gltfCache.has(pokeId)) {
    const cached = _gltfCache.get(pokeId);
    if (cached === null) {
      Promise.resolve().then(() => onFail?.());
      return;
    }
    const payload = { scene: SkeletonUtils.clone(cached.scene), animations: cached.animations };
    Promise.resolve().then(() => onSuccess(payload));
    return;
  }
  // ② Already in flight — queue this callback
  if (_gltfPending.has(pokeId)) {
    _gltfPending.get(pokeId).push({ onSuccess, onFail });
    return;
  }
  // ③ Start a new download
  _gltfPending.set(pokeId, [{ onSuccess, onFail }]);
  _gltfLoader.load(
    `${MODEL_BASE}${pokeId}.glb`,
    gltf => {
      _gltfCache.set(pokeId, { scene: gltf.scene, animations: gltf.animations });
      const queue = _gltfPending.get(pokeId) ?? [];
      _gltfPending.delete(pokeId);
      queue.forEach(cb => cb.onSuccess({
        scene:      SkeletonUtils.clone(gltf.scene),
        animations: gltf.animations,
      }));
    },
    undefined,
    () => {
      _gltfCache.set(pokeId, null);  // mark as failed so we never retry
      const queue = _gltfPending.get(pokeId) ?? [];
      _gltfPending.delete(pokeId);
      queue.forEach(cb => cb.onFail?.());
    },
  );
}

// ── All unique Pokémon IDs in the game pool ────────────────────────────────────
const _ALL_POKE_IDS = [...new Set(Object.values(POKEMON_POOL).flat().map(p => p.id))];

/**
 * Preload all Pokémon GLTF models into _gltfCache before gameplay begins.
 * Downloads in concurrent batches of BATCH_SIZE.
 * @param {function(loaded:number, total:number):void} onProgress
 * @returns {Promise<void>}
 */
export function preloadPokemonModels(onProgress) {
  const toLoad    = _ALL_POKE_IDS.filter(id => !_CUSTOM_BUILDERS.has(id));
  const total     = toLoad.length;
  let   loaded    = 0;
  const BATCH     = 8;   // concurrent downloads per wave

  return (async () => {
    for (let i = 0; i < toLoad.length; i += BATCH) {
      await Promise.allSettled(
        toLoad.slice(i, i + BATCH).map(id =>
          new Promise(resolve => {
            _loadGltf(id,
              () => { loaded++; onProgress?.(loaded, total); resolve(); },
              () => { loaded++; onProgress?.(loaded, total); resolve(); },
            );
          }),
        ),
      );
    }
  })();
}

/** Scale model to TARGET_HEIGHT and lift so its feet sit at y=0.
 *  Uses a single Box3 traversal — after uniform scaling by s, min.y
 *  transforms to min.y * s, so no second setFromObject is needed. */
function _autoFitModel(model, targetH = TARGET_HEIGHT) {
  const box = new THREE.Box3().setFromObject(model);
  const h   = box.max.y - box.min.y;
  if (h > 0) {
    const s = targetH / h;
    model.scale.setScalar(s);
    model.position.y -= box.min.y * s;   // ground feet at y=0
  }
}

// ── 2-D texture cache (shared — used by pokemon.js AND imported by main_multi.js) ─
const _texLoader2d  = new THREE.TextureLoader();
const _textureCache = new Map();

export function loadTexture(id) {
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

// Cache aura textures by rarity colour — at most 12 unique textures instead of
// one per Pokémon.  Each sprite still has its own material so rotation can differ.
const _auraTexCache = new Map();

function makeAura(rarityColor) {
  // Get or create the shared texture for this rarity colour
  let tex = _auraTexCache.get(rarityColor);
  if (!tex) {
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
    tex = new THREE.CanvasTexture(cvs);
    _auraTexCache.set(rarityColor, tex);
  }
  // Each sprite gets its own material — rotation is animated independently
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
    new THREE.SphereGeometry(0.87, 14, 10),
    new THREE.MeshLambertMaterial({ color: rarityColor }),
  );
  placeholder.position.y = 0.87;
  placeholder.castShadow = true;
  group._placeholder = placeholder;
  group.add(placeholder);

  // Label sprite
  const label = makeLabel(`Lv.${lv} ${pokeName}`, rarityKey);
  label.position.set(0, 3.8, 0);
  group._label = label;
  group.add(label);

  scene.add(group);

  // ── Custom geometry builder (highest priority, instant, no GLTF needed) ──
  if (_CUSTOM_BUILDERS.has(pokeId)) {
    const customModel = _CUSTOM_BUILDERS.get(pokeId)();
    group.remove(placeholder);
    placeholder.geometry.dispose();
    placeholder.material.dispose();
    group.add(customModel);
    group._model = customModel;
    label.position.y = TARGET_HEIGHT + 1.1;
    return { group };
  }

  // ── Shared 2-D fallback helper ────────────────────────────────────────────
  function _useFallbackSprite() {
    if (!pokemonRef.group || !group._placeholder) return; // already resolved
    const ph = group._placeholder;
    group._placeholder = null;           // mark resolved
    group.remove(ph);
    ph.geometry.dispose();
    ph.material.dispose();
    loadTexture(pokeId).then(tex => {
      if (!pokemonRef.group) return;
      const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sprite    = new THREE.Sprite(spriteMat);
      sprite.scale.set(3.4, 3.4, 1);
      sprite.position.set(0, 1.8, 0);
      group.add(sprite);
      label.position.y = 4.2;
      pokemonRef._fallbackSprite = sprite;
    });
  }

  // ── Async 3D model load ──────────────────────────────────────────────────
  // Timeout: if GLTF takes too long, use 2-D sprite immediately
  const _glbTimer = setTimeout(_useFallbackSprite, GLTF_TIMEOUT_MS);

  _loadGltf(pokeId,
    ({ scene: model, animations }) => {
      clearTimeout(_glbTimer);
      // Guard: placeholder gone means fallback already shown (or pokemon disposed)
      if (!pokemonRef.group || !group._placeholder) return;

      try {
        _autoFitModel(model);
        model.traverse(child => {
          if (child.isMesh) {
            child.castShadow    = true;
            child.receiveShadow = true;
          }
        });

        // Model processed OK — NOW swap out placeholder (keep it alive until here so
        // the catch block can still call _useFallbackSprite if _autoFitModel throws)
        const ph = group._placeholder;
        group._placeholder = null;   // mark resolved
        group.remove(ph);
        ph.geometry.dispose();
        ph.material.dispose();

        group.add(model);
        group._model = model;

        // Raise label above model
        label.position.y = TARGET_HEIGHT + 1.1;

        // Set up AnimationMixer — prefer an 'idle' clip
        if (animations.length > 0) {
          const idleClip = animations.find(a => /idle/i.test(a.name)) ?? animations[0];
          const mixer    = new THREE.AnimationMixer(model);
          mixer.clipAction(idleClip).play();
          pokemonRef._mixer = mixer;
        }
      } catch (_e) {
        // Model processing failed — placeholder is still set, so _useFallbackSprite works
        console.warn(`[pokemon] model processing error for #${pokeId}:`, _e);
        _useFallbackSprite();
      }
    },
    () => {
      // GLB unavailable — fall back to 2-D artwork sprite
      clearTimeout(_glbTimer);
      _useFallbackSprite();
    },
  );

  return { group };
}

// ── Constants ──────────────────────────────────────────────────────────────────
const POKEMON_PER_ZONE  = 3;
const INTERACT_DIST     = 2.8;
const INTERACT_DIST_SQ  = INTERACT_DIST * INTERACT_DIST;  // avoid sqrt in getNearby
const DECO_X_OFFSET     = 14;   // units from road centre (road half-width=5)
const DECO_Y            = 10;   // floating height
const DECO_SCALE        = 10;   // 2-D sprite size in world units (~300% of normal 3.4)

// ── PokemonManager ─────────────────────────────────────────────────────────────
export class PokemonManager {
  constructor(scene) {
    this.scene = scene;
    this.pokemon = [];
    this.refreshTimers = new Array(NUM_ZONES).fill(0);
    this._unlockedTiers = [true, false, false];
    this._networkMode   = false;
    this._byNetId       = new Map();
    this._decoratives   = [];   // giant floating icons per zone

    for (let z = 0; z < ZONES_PER_TIER; z++) this._spawnZone(z);
    this._buildAllDecorations();
  }

  // ── Giant decorative Pokémon (one per side per zone, uninteractable) ──────

  _buildAllDecorations() {
    for (let zoneIdx = 0; zoneIdx < NUM_ZONES; zoneIdx++) {
      const maxLv   = ZONE_MAX_LEVEL[zoneIdx];
      const pool    = POKEMON_POOL[maxLv];
      // Pick the most visually impressive Pokémon (last in the pool list)
      const picked  = pool[pool.length - 1];
      const zCenter = -((zoneIdx + 0.5) * ZONE_LENGTH);

      [-DECO_X_OFFSET, DECO_X_OFFSET].forEach((sx, side) => {
        const group = new THREE.Group();
        group.position.set(sx, DECO_Y, zCenter);
        this.scene.add(group);

        // Glowing halo ring behind sprite
        const ringGeo = new THREE.RingGeometry(DECO_SCALE * 0.52, DECO_SCALE * 0.6, 32);
        const rarityColor = RARITY_COLORS[ZONE_MAX_LEVEL[zoneIdx] <= 3 ? '2星'
          : ZONE_MAX_LEVEL[zoneIdx] <= 6 ? '5星' : '神聖'];
        const ringMat = new THREE.MeshBasicMaterial({
          color: rarityColor, side: THREE.DoubleSide,
          transparent: true, opacity: 0.55, depthTest: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

        // 2-D artwork sprite (guaranteed to load)
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ transparent: true, opacity: 0.92, depthTest: false }),
        );
        sprite.scale.set(DECO_SCALE, DECO_SCALE, 1);
        group.add(sprite);
        loadTexture(picked.id).then(tex => {
          sprite.material.map = tex;
          sprite.material.needsUpdate = true;
        });

        this._decoratives.push({
          group, ring, sprite,
          phase: zoneIdx * 0.8 + side * Math.PI, // stagger hover phases
        });
      });
    }
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

    // Animate giant decoratives — slow majestic hover + ring pulse
    this._decoratives.forEach(d => {
      const bob = Math.sin(t * 0.55 + d.phase) * 1.2;
      d.group.position.y = DECO_Y + bob;
      // Slowly face the camera (billboard already handles the sprite)
      d.ring.rotation.z = t * 0.18 + d.phase;
      d.ring.material.opacity = 0.35 + Math.sin(t * 1.1 + d.phase) * 0.2;
    });
  }

  // ── Interaction helpers ───────────────────────────────────────────────────

  getNearby(playerPos) {
    let best = null, bestDist2 = INTERACT_DIST_SQ;   // squared — no sqrt needed
    this.pokemon.forEach(p => {
      if (p.carried) return;
      const dx = p.group.position.x - playerPos.x;
      const dz = p.group.position.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist2) { bestDist2 = d2; best = p; }
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
