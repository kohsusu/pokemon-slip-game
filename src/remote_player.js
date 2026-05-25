import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { SPRITE_BASE } from './constants.js?v=17';
// v=19

// ── Module-level shared geometries (created once, reused by every RemotePlayer) ──
//   Avoids allocating identical BufferGeometry objects per player.
const _GEO = {
  body:    new THREE.BoxGeometry(0.65, 1.05, 0.48),
  head:    new THREE.SphereGeometry(0.31, 10, 8),
  leg:     new THREE.BoxGeometry(0.27, 0.58, 0.27),
  pole:    new THREE.CylinderGeometry(0.06, 0.06, 5, 6),
  diamond: new THREE.OctahedronGeometry(0.4),
};

// ── Module-level Pokémon artwork texture cache ────────────────────────────────
//   Prevents the same pokeId image being fetched once per carrying player.
const _artTexCache = new Map();   // pokeId → THREE.Texture
const _rpTexLoader = new THREE.TextureLoader();

function _loadArtTex(pokeId, onLoad) {
  if (_artTexCache.has(pokeId)) { onLoad(_artTexCache.get(pokeId)); return; }
  _rpTexLoader.load(
    `${SPRITE_BASE}${pokeId}.png`,
    tex => { _artTexCache.set(pokeId, tex); onLoad(tex); },
    undefined,
    () => onLoad(null),
  );
}

const LERP_SPEED = 12;

// ── Canvas helpers ────────────────────────────────────────────────────────────

function _roundRect(ctx, x, y, w, h, r) {
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

function makeNameSprite(name, colorCss) {
  const canvas = document.createElement('canvas');
  canvas.width  = 256;
  canvas.height = 56;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  _roundRect(ctx, 2, 2, 252, 52, 12); ctx.fill();
  ctx.fillStyle = colorCss;
  _roundRect(ctx, 5, 5, 246, 46, 10); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 14), 128, 28);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.8, 0.62, 1);
  return sprite;
}

// ── RemotePlayer ──────────────────────────────────────────────────────────────

export class RemotePlayer {
  constructor(scene, info) {
    this.scene = scene;
    this.id    = info.id;
    this.name  = info.name  ?? `玩家${info.id + 1}`;
    this.color = info.color ?? '#ffffff';

    this._tx  = info.x     ?? 0;
    this._tz  = info.z     ?? 0;
    this.money = info.money ?? 0;

    this._nameSprite  = null;
    this._emojiSprite = null;   // reused — canvas redrawn in place
    this._emojiTO     = null;
    this._heldSpheres = [];

    this._build();
    this.group.position.set(this._tx, 0, this._tz);
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  _build() {
    const hex    = parseInt(this.color.replace('#', ''), 16);
    const legHex = Math.max(0, hex - 0x303030);

    this.group = new THREE.Group();

    // Body — shared geometry, per-player material
    const body = new THREE.Mesh(_GEO.body, new THREE.MeshLambertMaterial({ color: hex }));
    body.position.y = 0.73;
    body.castShadow = true;
    this.group.add(body);

    // Head — shared geometry, shared neutral material (skin tone, same for all)
    const head = new THREE.Mesh(_GEO.head, new THREE.MeshLambertMaterial({ color: 0xFFCC80 }));
    head.position.y = 1.56;
    head.castShadow = true;
    this.group.add(head);

    // Legs — shared geometry, per-player material (shared instance for both legs)
    const legMat = new THREE.MeshLambertMaterial({ color: legHex });
    [-0.19, 0.19].forEach(ox => {
      const leg = new THREE.Mesh(_GEO.leg, legMat);
      leg.position.set(ox, 0.29, 0);
      leg.castShadow = true;
      this.group.add(leg);
    });

    // Beacon pole — shared geometry, per-player material
    const pole = new THREE.Mesh(_GEO.pole, new THREE.MeshLambertMaterial({ color: hex }));
    pole.position.y = 4.2;
    this.group.add(pole);

    // Diamond top — shared geometry, per-player material with emissive glow
    const diamond = new THREE.Mesh(
      _GEO.diamond,
      new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.55 }),
    );
    diamond.position.y = 7.0;
    this._diamond = diamond;
    this.group.add(diamond);

    // Name badge sprite
    this._nameSprite = makeNameSprite(this.name, this.color);
    this._nameSprite.position.set(0, 2.8, 0);
    this.group.add(this._nameSprite);

    // Emoji sprite — built once; canvas redrawn in showEmoji() instead of rebuilding
    this._emojiSprite = this._makeEmojiSprite();
    this._emojiSprite.position.set(0, 3.9, 0);
    this._emojiSprite.visible = false;
    this.group.add(this._emojiSprite);

    this.scene.add(this.group);
  }

  /** Create the emoji sprite once. Canvas reference kept via tex.image. */
  _makeEmojiSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    // (intentionally empty — first emoji will be drawn by showEmoji)
    const tex    = new THREE.CanvasTexture(canvas);
    const mat    = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.2, 1.2, 1);
    return sprite;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  updateFromServer(data) {
    if (data.x     !== undefined) this._tx   = data.x;
    if (data.z     !== undefined) this._tz   = data.z;
    if (data.money !== undefined) this.money = data.money;

    if (data.name !== undefined && data.name !== this.name) {
      this.name = data.name;
      this.group.remove(this._nameSprite);
      this._nameSprite.material.map.dispose();
      this._nameSprite.material.dispose();
      this._nameSprite = makeNameSprite(this.name, this.color);
      this._nameSprite.position.set(0, 2.8, 0);
      this.group.add(this._nameSprite);
    }

    if (data.carriedPokemon !== undefined) {
      this._updateHeldDisplay(data.carriedPokemon);
    }
  }

  /**
   * Show Pokémon artwork sprites above this player's head.
   * Uses the shared texture cache so the same artwork isn't fetched twice.
   */
  _updateHeldDisplay(list) {
    // Dispose & remove previous per-pokemon sprites
    // NOTE: we do NOT dispose artwork textures — they live in _artTexCache.
    this._heldSpheres.forEach(s => {
      this.group.remove(s);
      if (!s._sharedTex) {
        // Only dispose the circle background canvases (not cached artwork)
        s.material?.map?.dispose();
      }
      s.material?.dispose();
    });
    this._heldSpheres = [];

    if (!list || list.length === 0) return;

    list.forEach((pk, i) => {
      const css  = pk.cssColor ?? '#aaaaaa';
      const posY = 3.6 + i * 1.4;

      // Rarity-coloured circle backdrop
      const bgCvs = document.createElement('canvas');
      bgCvs.width = bgCvs.height = 64;
      const ctx = bgCvs.getContext('2d');
      ctx.fillStyle = css;
      ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
      const bgMat    = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(bgCvs), transparent: true, depthTest: false,
      });
      const bgSprite = new THREE.Sprite(bgMat);
      bgSprite.scale.set(1.3, 1.3, 1);
      bgSprite.position.set(0, posY, 0);
      this.group.add(bgSprite);
      this._heldSpheres.push(bgSprite);

      // Artwork sprite (async) — use shared texture cache
      if (pk.pokeId) {
        const artMat    = new THREE.SpriteMaterial({ transparent: true, depthTest: false, opacity: 0 });
        const artSprite = new THREE.Sprite(artMat);
        artSprite._sharedTex = true;   // flag: don't dispose this texture on removal
        artSprite.scale.set(1.2, 1.2, 1);
        artSprite.position.set(0, posY, 0);
        this.group.add(artSprite);
        this._heldSpheres.push(artSprite);

        _loadArtTex(pk.pokeId, tex => {
          if (!tex) return;
          artMat.map     = tex;
          artMat.opacity = 1;
          artMat.needsUpdate = true;
        });
      }
    });
  }

  /**
   * Show an emoji above the player's head.
   * Redraws the existing canvas in place — no Sprite/Texture churn.
   */
  showEmoji(emoji) {
    clearTimeout(this._emojiTO);

    const tex = this._emojiSprite.material.map;   // CanvasTexture
    const cvs = tex.image;                        // HTMLCanvasElement
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, 96, 96);
    ctx.font = '64px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 48, 52);
    tex.needsUpdate = true;   // tell Three.js to re-upload to GPU

    this._emojiSprite.visible = true;
    this._emojiTO = setTimeout(() => { this._emojiSprite.visible = false; }, 3000);
  }

  update(dt) {
    const k = Math.min(1, LERP_SPEED * dt);
    this.group.position.x += (this._tx - this.group.position.x) * k;
    this.group.position.z += (this._tz - this.group.position.z) * k;
    if (this._diamond) this._diamond.rotation.y += dt * 1.5;
  }

  remove() {
    clearTimeout(this._emojiTO);
    this.scene.remove(this.group);
    // Dispose per-player canvas textures only (shared geo & artwork textures stay alive)
    this._nameSprite?.material?.map?.dispose();
    this._nameSprite?.material?.dispose();
    this._emojiSprite?.material?.map?.dispose();
    this._emojiSprite?.material?.dispose();
    this._heldSpheres.forEach(s => {
      if (!s._sharedTex) s.material?.map?.dispose();
      s.material?.dispose();
    });
  }
}
