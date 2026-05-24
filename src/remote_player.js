import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { SPRITE_BASE } from './constants.js?v=17';
// v=18

const _rpTexLoader = new THREE.TextureLoader();

const LERP_SPEED = 12;

// ── Canvas helpers (same pattern as pokemon.js) ───────────────────────────────

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

/**
 * Build a THREE.Sprite name badge — works exactly like Pokémon labels.
 * Embedded in the group so no screen-projection is needed.
 */
function makeNameSprite(name, colorCss) {
  const canvas = document.createElement('canvas');
  canvas.width  = 256;
  canvas.height = 56;
  const ctx = canvas.getContext('2d');

  // Shadow pill
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  _roundRect(ctx, 2, 2, 252, 52, 12); ctx.fill();
  // Colour fill
  ctx.fillStyle = colorCss;
  _roundRect(ctx, 5, 5, 246, 46, 10); ctx.fill();
  // Text
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
  /**
   * @param {THREE.Scene} scene
   * @param {{ id, name, color, x, z }} info
   */
  constructor(scene, info) {
    this.scene = scene;
    this.id    = info.id;
    this.name  = info.name  ?? `玩家${info.id + 1}`;
    this.color = info.color ?? '#ffffff';

    this._tx  = info.x     ?? 0;
    this._tz  = info.z     ?? 0;
    this.money = info.money ?? 0;

    this._nameSprite  = null;   // THREE.Sprite — rebuilt when name changes
    this._emojiSprite = null;   // THREE.Sprite — for emoji popup
    this._emojiTO     = null;
    this._heldSpheres = [];     // THREE.Mesh[] — carried Pokémon orbs

    this._build();

    // Snap immediately to initial position
    this.group.position.set(this._tx, 0, this._tz);
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  _build() {
    const hex    = parseInt(this.color.replace('#', ''), 16);
    const legHex = Math.max(0, hex - 0x303030);

    this.group = new THREE.Group();
    this.group.position.set(this._tx, 0, this._tz);

    // ── Character mesh ──────────────────────────────────────────────────────
    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 1.05, 0.48),
      new THREE.MeshLambertMaterial({ color: hex }),
    );
    body.position.y  = 0.73;
    body.castShadow  = true;
    this.group.add(body);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.31, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xFFCC80 }),
    );
    head.position.y = 1.56;
    head.castShadow = true;
    this.group.add(head);

    // Legs
    const legMat = new THREE.MeshLambertMaterial({ color: legHex });
    const legGeo = new THREE.BoxGeometry(0.27, 0.58, 0.27);
    [-0.19, 0.19].forEach(ox => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(ox, 0.29, 0);
      leg.castShadow = true;
      this.group.add(leg);
    });

    // ── Tall beacon (impossible to miss from any camera angle) ──────────────
    // Vertical pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 5, 6),
      new THREE.MeshLambertMaterial({ color: hex }),
    );
    pole.position.y = 4.2;
    this.group.add(pole);

    // Diamond top
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4),
      new THREE.MeshLambertMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.55 }),
    );
    diamond.position.y = 7.0;
    this._diamond = diamond;
    this.group.add(diamond);

    // ── Name badge (THREE.Sprite — always rendered in 3D scene) ────────────
    this._nameSprite = makeNameSprite(this.name, this.color);
    this._nameSprite.position.set(0, 2.8, 0);
    this.group.add(this._nameSprite);

    // ── Emoji sprite (hidden until showEmoji is called) ─────────────────────
    this._emojiSprite = this._makeEmojiSprite('');
    this._emojiSprite.position.set(0, 3.9, 0);
    this._emojiSprite.visible = false;
    this.group.add(this._emojiSprite);

    this.scene.add(this.group);
  }

  _makeEmojiSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.font = '64px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 48, 52);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
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
      // Rebuild name sprite
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
   * Show/refresh Pokémon artwork sprites above this player's head for each
   * Pokémon they are currently carrying.
   * @param {Array<{cssColor:string, pokeId:number}>} list
   */
  _updateHeldDisplay(list) {
    // Dispose & remove old sprites
    this._heldSpheres.forEach(s => {
      this.group.remove(s);
      s.material?.map?.dispose();
      s.material?.dispose();
    });
    this._heldSpheres = [];

    if (!list || list.length === 0) return;

    list.forEach((pk, i) => {
      const css  = pk.cssColor ?? '#aaaaaa';
      const posY = 3.6 + i * 1.4;   // above name badge, one slot per Pokémon

      // ── Rarity-coloured circle backdrop (shows instantly) ─────────────────
      const bgCvs = document.createElement('canvas');
      bgCvs.width = bgCvs.height = 64;
      const ctx = bgCvs.getContext('2d');
      ctx.fillStyle = css;
      ctx.beginPath();
      ctx.arc(32, 32, 30, 0, Math.PI * 2);
      ctx.fill();
      const bgMat = new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(bgCvs),
        transparent: true, depthTest: false,
      });
      const bgSprite = new THREE.Sprite(bgMat);
      bgSprite.scale.set(1.3, 1.3, 1);
      bgSprite.position.set(0, posY, 0);
      this.group.add(bgSprite);
      this._heldSpheres.push(bgSprite);

      // ── Pokémon artwork (loaded async, overlaid on circle) ─────────────────
      if (pk.pokeId) {
        const artMat = new THREE.SpriteMaterial({
          transparent: true, depthTest: false, opacity: 0,
        });
        const artSprite = new THREE.Sprite(artMat);
        artSprite.scale.set(1.2, 1.2, 1);
        artSprite.position.set(0, posY, 0);
        this.group.add(artSprite);
        this._heldSpheres.push(artSprite);

        _rpTexLoader.load(
          `${SPRITE_BASE}${pk.pokeId}.png`,
          tex => {
            artMat.map     = tex;
            artMat.opacity = 1;
            artMat.needsUpdate = true;
          },
          undefined,
          () => { /* network fail — colour circle stays */ },
        );
      }
    });
  }

  showEmoji(emoji) {
    clearTimeout(this._emojiTO);
    // Rebuild emoji sprite with new emoji
    this.group.remove(this._emojiSprite);
    this._emojiSprite.material.map.dispose();
    this._emojiSprite.material.dispose();
    this._emojiSprite = this._makeEmojiSprite(emoji);
    this._emojiSprite.position.set(0, 3.9, 0);
    this._emojiSprite.visible = true;
    this.group.add(this._emojiSprite);

    this._emojiTO = setTimeout(() => {
      this._emojiSprite.visible = false;
    }, 3000);
  }

  update(dt) {
    // Smooth position interpolation
    const k = Math.min(1, LERP_SPEED * dt);
    this.group.position.x += (this._tx - this.group.position.x) * k;
    this.group.position.z += (this._tz - this.group.position.z) * k;

    // Spin diamond beacon
    if (this._diamond) {
      this._diamond.rotation.y += dt * 1.5;
    }
  }

  remove() {
    clearTimeout(this._emojiTO);
    this.scene.remove(this.group);
    // Dispose textures
    this._nameSprite?.material?.map?.dispose();
    this._emojiSprite?.material?.map?.dispose();
  }
}
