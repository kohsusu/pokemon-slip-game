import * as THREE from 'three';
import { loadTexture } from './pokemon.js?v=31';   // shared texture cache — no duplicate fetches
// v=26 — shared skin/black material singletons (P1 optimisation)

// ── Module-level shared geometries (created once, reused by every RemotePlayer) ──
const _GEO = {
  legBlock: new THREE.BoxGeometry(0.32, 0.62, 0.30),
  hip:      new THREE.BoxGeometry(0.74, 0.20, 0.42),
  torso:    new THREE.BoxGeometry(0.74, 0.72, 0.44),
  neck:     new THREE.CylinderGeometry(0.17, 0.17, 0.14, 8),
  headCyl:  new THREE.CylinderGeometry(0.34, 0.34, 0.48, 12),
  stud:     new THREE.CylinderGeometry(0.10, 0.10, 0.12, 8),
  eye:      new THREE.BoxGeometry(0.09, 0.10, 0.06),
  smile:    new THREE.BoxGeometry(0.22, 0.05, 0.05),
  arm:      new THREE.BoxGeometry(0.22, 0.50, 0.22),
  hand:     new THREE.SphereGeometry(0.14, 6, 4),
  pole:     new THREE.CylinderGeometry(0.06, 0.06, 5, 6),
  diamond:  new THREE.OctahedronGeometry(0.4),
};

const LERP_SPEED = 12;
const SKIN_HEX   = 0xFFCC80;
const BLACK_HEX  = 0x111111;

// Singleton materials for parts whose colour NEVER changes per-player.
// Shared across ALL RemotePlayer instances → fewer unique GPU materials.
const _SKIN_MAT  = new THREE.MeshLambertMaterial({ color: SKIN_HEX });
const _BLACK_MAT = new THREE.MeshLambertMaterial({ color: BLACK_HEX });

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

    this._sprinting    = false;
    this._walkPhase    = 0;
    this._walkBlend    = 0;

    this._nameSprite  = null;
    this._emojiSprite = null;
    this._emojiTO     = null;
    this._chatSprite  = null;
    this._chatTO      = null;
    this._heldSpheres = [];
    this._lastHeldKey = '';

    this._build();
    this.group.position.set(this._tx, 0, this._tz);
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  _build() {
    const hex    = parseInt(this.color.replace('#', ''), 16);
    // Derive a darker shade for legs & hip
    const darkHex = Math.max(0, hex - 0x303030);

    this.group = new THREE.Group();
    const _m = (c, emissive = 0, ei = 0) =>
      new THREE.MeshLambertMaterial({ color: c, emissive, emissiveIntensity: ei });

    // ── Leg pivots ──────────────────────────────────────────────────────────
    [[-0.21, '_leftLegPivot'], [0.21, '_rightLegPivot']].forEach(([px, key]) => {
      const pivot   = new THREE.Group();
      pivot.position.set(px, 0.62, 0);
      const legMesh = new THREE.Mesh(_GEO.legBlock, _m(darkHex));
      legMesh.position.y = -0.31;
      legMesh.castShadow = true;
      pivot.add(legMesh);
      this.group.add(pivot);
      this[key] = pivot;
    });

    // ── Hip block ───────────────────────────────────────────────────────────
    const hipMesh = new THREE.Mesh(_GEO.hip, _m(darkHex));
    hipMesh.position.y = 0.72;
    hipMesh.castShadow = true;
    this.group.add(hipMesh);

    // ── Torso ───────────────────────────────────────────────────────────────
    const torso = new THREE.Mesh(_GEO.torso, _m(hex));
    torso.position.y = 1.18;
    torso.castShadow = true;
    this.group.add(torso);

    // ── Neck ────────────────────────────────────────────────────────────────
    const neck = new THREE.Mesh(_GEO.neck, _SKIN_MAT);
    neck.position.y = 1.61;
    this.group.add(neck);

    // ── Head (LEGO cylinder) ────────────────────────────────────────────────
    const HEAD_CY = 1.92;
    const head = new THREE.Mesh(_GEO.headCyl, _SKIN_MAT);
    head.position.y = HEAD_CY;
    head.castShadow = true;
    this.group.add(head);

    // Head stud
    const stud = new THREE.Mesh(_GEO.stud, _SKIN_MAT);
    stud.position.y = HEAD_CY + 0.30;
    this.group.add(stud);

    // Eyes (shared _BLACK_MAT — both eyes use the same material)
    [-0.11, 0.11].forEach(ex => {
      const eye = new THREE.Mesh(_GEO.eye, _BLACK_MAT);
      eye.position.set(ex, HEAD_CY + 0.04, 0.30);
      this.group.add(eye);
    });

    // Smile
    const smile = new THREE.Mesh(_GEO.smile, _BLACK_MAT);
    smile.position.set(0, HEAD_CY - 0.12, 0.30);
    this.group.add(smile);

    // ── Arm pivots ──────────────────────────────────────────────────────────
    [[-0.46, '_leftArmPivot'], [0.46, '_rightArmPivot']].forEach(([ax, key]) => {
      const pivot = new THREE.Group();
      pivot.position.set(ax, 1.48, 0);
      const arm = new THREE.Mesh(_GEO.arm, _m(hex));
      arm.position.y = -0.25;
      arm.castShadow = true;
      pivot.add(arm);
      const hand = new THREE.Mesh(_GEO.hand, _SKIN_MAT);
      hand.position.y = -0.53;
      pivot.add(hand);
      this.group.add(pivot);
      this[key] = pivot;
    });

    // ── Beacon pole (player identification at distance) ─────────────────────
    const pole = new THREE.Mesh(_GEO.pole, _m(hex));
    pole.position.y = 4.2;
    this.group.add(pole);

    // Spinning diamond top with emissive glow
    const diamond = new THREE.Mesh(
      _GEO.diamond,
      _m(hex, hex, 0.55),
    );
    diamond.position.y = 7.0;
    this._diamond = diamond;
    this.group.add(diamond);

    // ── Name badge sprite ───────────────────────────────────────────────────
    this._nameSprite = makeNameSprite(this.name, this.color);
    this._nameSprite.position.set(0, 3.2, 0);
    this.group.add(this._nameSprite);

    // ── Emoji sprite (lazy canvas, redrawn in showEmoji) ───────────────────
    this._emojiSprite = this._makeEmojiSprite();
    this._emojiSprite.position.set(0, 4.3, 0);
    this._emojiSprite.visible = false;
    this.group.add(this._emojiSprite);

    this.scene.add(this.group);
  }

  _makeEmojiSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const tex    = new THREE.CanvasTexture(canvas);
    const mat    = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.5, 1.5, 1);
    return sprite;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  updateFromServer(data) {
    if (data.x         !== undefined) this._tx        = data.x;
    if (data.z         !== undefined) this._tz        = data.z;
    if (data.money     !== undefined) this.money      = data.money;
    if (data.sprinting !== undefined) this._sprinting = data.sprinting;

    if (data.name !== undefined && data.name !== this.name) {
      this.name = data.name;
      this.group.remove(this._nameSprite);
      this._nameSprite.material.map.dispose();
      this._nameSprite.material.dispose();
      this._nameSprite = makeNameSprite(this.name, this.color);
      this._nameSprite.position.set(0, 3.2, 0);
      this.group.add(this._nameSprite);
    }

    if (data.carriedPokemon !== undefined) {
      this._updateHeldDisplay(data.carriedPokemon);
    }
  }

  /** Show Pokémon artwork sprites above head. Uses shared texture cache. */
  _updateHeldDisplay(list) {
    const key = (list && list.length)
      ? list.map(pk => `${pk.pokeId}:${pk.cssColor}`).join('|')
      : '';
    if (key === this._lastHeldKey) return;
    this._lastHeldKey = key;

    this._heldSpheres.forEach(s => {
      this.group.remove(s);
      if (!s._sharedTex) s.material?.map?.dispose();
      s.material?.dispose();
    });
    this._heldSpheres = [];

    if (!list || list.length === 0) return;

    list.forEach((pk, i) => {
      const css  = pk.cssColor ?? '#aaaaaa';
      const posY = 3.6 + i * 1.4;

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

      if (pk.pokeId) {
        const artMat    = new THREE.SpriteMaterial({ transparent: true, depthTest: false, opacity: 0 });
        const artSprite = new THREE.Sprite(artMat);
        artSprite._sharedTex = true;
        artSprite.scale.set(1.2, 1.2, 1);
        artSprite.position.set(0, posY, 0);
        this.group.add(artSprite);
        this._heldSpheres.push(artSprite);

        loadTexture(pk.pokeId).then(tex => {
          if (!tex) return;
          artMat.map     = tex;
          artMat.opacity = 1;
          artMat.needsUpdate = true;
        });
      }
    });
  }

  /** Redraw the existing emoji canvas in place — no Sprite/Texture churn. */
  showEmoji(emoji) {
    clearTimeout(this._emojiTO);
    const tex = this._emojiSprite.material.map;
    const cvs = tex.image;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, 96, 96);
    ctx.font = '64px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 48, 52);
    tex.needsUpdate = true;
    this._emojiSprite.visible = true;
    this._emojiTO = setTimeout(() => { this._emojiSprite.visible = false; }, 3000);
  }

  /** Show a quick-chat text bubble above the player's head (created lazily). */
  showQuickChat(text) {
    clearTimeout(this._chatTO);

    if (!this._chatSprite) {
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 72;
      const tex    = new THREE.CanvasTexture(canvas);
      const mat    = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(3.6, 1.0, 1);
      sprite.position.set(0, 5.2, 0);
      this.group.add(sprite);
      this._chatSprite = sprite;
    }

    const tex = this._chatSprite.material.map;
    const cvs = tex.image;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, 256, 72);
    ctx.fillStyle = 'rgba(0,0,0,0.80)';
    _roundRect(ctx, 2, 2, 252, 68, 14); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    _roundRect(ctx, 5, 5, 246, 62, 12); ctx.fill();
    ctx.fillStyle   = '#ffffff';
    ctx.font        = 'bold 24px Arial';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 12), 128, 36);
    tex.needsUpdate = true;

    this._chatSprite.visible = true;
    this._chatTO = setTimeout(() => {
      if (this._chatSprite) this._chatSprite.visible = false;
    }, 5000);
  }

  update(dt) {
    // ── Position lerp ───────────────────────────────────────────────────────
    const k     = Math.min(1, LERP_SPEED * dt);
    const prevX = this.group.position.x;
    const prevZ = this.group.position.z;
    this.group.position.x += (this._tx - prevX) * k;
    this.group.position.z += (this._tz - prevZ) * k;

    // ── Walk animation ──────────────────────────────────────────────────────
    //   Detect movement by how far we still need to lerp toward target
    const dist2    = (this._tx - this.group.position.x) ** 2
                   + (this._tz - this.group.position.z) ** 2;
    const isMoving = dist2 > 4e-4;   // threshold ≈ 0.02 units remaining

    const targetBlend = isMoving ? 1 : 0;
    this._walkBlend += (targetBlend - this._walkBlend) * Math.min(1, dt * 10);

    if (isMoving) {
      this._walkPhase += dt * (this._sprinting ? 11 : 7);
    } else {
      const nearest = Math.round(this._walkPhase / Math.PI) * Math.PI;
      this._walkPhase += (nearest - this._walkPhase) * Math.min(1, dt * 8);
    }

    const swing = Math.sin(this._walkPhase) * 0.55 * this._walkBlend;
    this._leftLegPivot.rotation.x  =  swing;
    this._rightLegPivot.rotation.x = -swing;
    this._leftArmPivot.rotation.x  = -swing * 0.62;
    this._rightArmPivot.rotation.x =  swing * 0.62;

    // Spin beacon diamond
    if (this._diamond) this._diamond.rotation.y += dt * 1.5;
  }

  remove() {
    clearTimeout(this._emojiTO);
    clearTimeout(this._chatTO);
    this.scene.remove(this.group);
    this._nameSprite?.material?.map?.dispose();
    this._nameSprite?.material?.dispose();
    this._emojiSprite?.material?.map?.dispose();
    this._emojiSprite?.material?.dispose();
    this._chatSprite?.material?.map?.dispose();
    this._chatSprite?.material?.dispose();
    this._heldSpheres.forEach(s => {
      if (!s._sharedTex) s.material?.map?.dispose();
      s.material?.dispose();
    });
  }
}
