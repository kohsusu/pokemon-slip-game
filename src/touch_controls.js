/**
 * touch_controls.js — Virtual joystick + action buttons for tablet/touch play
 *
 * Auto-activates on touch devices; force-show with ?touch=1 in URL.
 * Writes directly into player.keys so the existing keyboard code needs no changes.
 */

const JOY_R    = 65;   // outer ring radius (px)
const THUMB_R  = 26;   // inner thumb radius (px)
const DEAD     = 0.22; // normalised dead-zone (0–1)
const BTN_SIZE = 62;   // action button square size (px)
const BTN_GAP  = 9;    // gap between action buttons (px)

export class TouchControls {
  /**
   * @param {Player} player  — the Player instance (its .keys object is patched)
   * @param {object} [opts]
   * @param {boolean} [opts.isMulti]  — true if running in multiplayer mode
   */
  constructor(player, opts = {}) {
    this._player = player;
    this._opts   = opts;

    // Detection: touch device OR ?touch=1 in URL
    const forced = new URLSearchParams(location.search).has('touch');
    if (!forced && !('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;

    this._joyTouchId  = null;   // active touch identifier for joystick
    this._joyCenter   = null;   // { x, y } of current joystick centre (screen px)
    this._btnTouches  = new Map(); // touchId → key code string

    this._joyOuter  = null;
    this._joyThumb  = null;
    this._sprintBtn = null;

    this._build();
    this._bindEvents();
    this._startRaf();
  }

  // ── Build DOM ─────────────────────────────────────────────────────────────

  _build() {
    // Root overlay — pointer-events:none so only children intercept touches
    const root = document.createElement('div');
    root.id = 'touch-controls';
    root.style.cssText = `
      position:fixed;inset:0;z-index:40;
      pointer-events:none;user-select:none;-webkit-user-select:none;
      touch-action:none;
    `;

    this._buildJoystick(root);
    this._buildActionButtons(root);

    document.body.appendChild(root);
    this._root = root;

    // Hide keyboard controls hint — redundant on touch
    const hint = document.getElementById('controls-hint');
    if (hint) hint.style.display = 'none';
  }

  _buildJoystick(root) {
    // Outer ring — sits just inside the save/music buttons (left:10-50, bottom:10-100)
    // Centre at approximately left:130px, bottom:130px
    const outer = document.createElement('div');
    outer.style.cssText = `
      position:absolute;
      left:${JOY_R}px;            /* left edge = centre - r */
      bottom:${JOY_R}px;          /* bottom edge = centre - r */
      width:${JOY_R * 2}px;
      height:${JOY_R * 2}px;
      border-radius:50%;
      background:rgba(255,255,255,0.07);
      border:2.5px solid rgba(255,255,255,0.28);
      box-sizing:border-box;
      pointer-events:auto;
      touch-action:none;
    `;

    // Inner thumb
    const thumb = document.createElement('div');
    thumb.style.cssText = `
      position:absolute;
      width:${THUMB_R * 2}px;
      height:${THUMB_R * 2}px;
      border-radius:50%;
      background:rgba(255,255,255,0.42);
      border:2px solid rgba(255,255,255,0.7);
      top:50%;left:50%;
      transform:translate(-50%,-50%);
      transition:transform 0.04s;
      pointer-events:none;
    `;
    outer.appendChild(thumb);

    // Directional arrow hints inside ring
    const arrows = [['↑',0,-1],['↓',0,1],['←',-1,0],['→',1,0]];
    arrows.forEach(([ch, dx, dy]) => {
      const a = document.createElement('div');
      const aR = JOY_R - 14;
      a.style.cssText = `
        position:absolute;
        left:${JOY_R + dx * aR - 7}px;
        top:${JOY_R + dy * aR - 9}px;
        font-size:12px;color:rgba(255,255,255,0.3);
        pointer-events:none;line-height:1;
      `;
      a.textContent = ch;
      outer.appendChild(a);
    });

    root.appendChild(outer);
    this._joyOuter = outer;
    this._joyThumb = thumb;
  }

  _buildActionButtons(root) {
    // 2×2 grid anchored to bottom-right
    // Layout (bottom→top, right→left):
    //   Row 0: E (bottom-right), Sprint (bottom-left of pair)
    //   Row 1: B (top-right),    F (top-left of pair)
    const col0R = 20;                          // rightmost column: right offset
    const col1R = col0R + BTN_SIZE + BTN_GAP;  // second column
    const row0B = 30;                          // bottom row: bottom offset
    const row1B = row0B + BTN_SIZE + BTN_GAP;  // top row

    const defs = [
      { label: 'E', sub: '抓/放', key: 'KeyE',  color: '#27ae60', r: col0R, b: row0B },
      { label: '⚡', sub: '衝刺', key: 'Space',  color: '#2980b9', r: col1R, b: row0B, isSprint: true },
      { label: 'B', sub: '商店', key: 'KeyB',   color: '#8e44ad', r: col0R, b: row1B },
      { label: 'F', sub: '賣出', key: 'KeyF',   color: '#e67e22', r: col1R, b: row1B },
    ];

    defs.forEach(({ label, sub, key, color, r, b, isSprint }) => {
      const btn = document.createElement('div');
      btn.dataset.key = key;
      btn.style.cssText = `
        position:absolute;
        right:${r}px;bottom:${b}px;
        width:${BTN_SIZE}px;height:${BTN_SIZE}px;
        border-radius:14px;
        background:${color}bb;
        border:2px solid ${color};
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-size:${label.length > 1 ? 20 : 22}px;font-weight:bold;color:#fff;
        pointer-events:auto;touch-action:none;
        box-shadow:0 3px 10px rgba(0,0,0,0.4);
        gap:2px;
        transition:transform 0.06s,opacity 0.06s;
      `;
      btn.innerHTML = `${label}<span style="font-size:10px;opacity:0.8;font-weight:normal;">${sub}</span>`;
      root.appendChild(btn);
      if (isSprint) this._sprintBtn = btn;
    });
  }

  // ── Events ────────────────────────────────────────────────────────────────

  _bindEvents() {
    // ── Joystick ────────────────────────────────────────────────────────────
    this._joyOuter.addEventListener('touchstart', e => {
      e.preventDefault();
      if (this._joyTouchId !== null) return;
      const t = e.changedTouches[0];
      this._joyTouchId = t.identifier;
      // Centre = middle of the outer ring element
      const rect = this._joyOuter.getBoundingClientRect();
      this._joyCenter = {
        x: rect.left + rect.width  / 2,
        y: rect.top  + rect.height / 2,
      };
      this._joyOuter.style.borderColor = 'rgba(255,255,255,0.7)';
      this._joyOuter.style.background  = 'rgba(255,255,255,0.13)';
      this._moveJoy(t.clientX, t.clientY);
    }, { passive: false });

    // touchmove on window to catch drags outside the ring
    window.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyTouchId) {
          e.preventDefault();
          this._moveJoy(t.clientX, t.clientY);
          break;
        }
      }
    }, { passive: false });

    window.addEventListener('touchend',    e => { this._endJoy(e); });
    window.addEventListener('touchcancel', e => { this._endJoy(e); });

    // ── Action buttons ───────────────────────────────────────────────────────
    const buttons = this._root.querySelectorAll('[data-key]');
    buttons.forEach(btn => {
      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          const key = btn.dataset.key;
          this._btnTouches.set(t.identifier, { key, btn });
          this._player.keys[key] = true;
          btn.style.transform = 'scale(0.91)';
          btn.style.opacity   = '0.72';
        }
      }, { passive: false });

      const endBtn = e => {
        for (const t of e.changedTouches) {
          const entry = this._btnTouches.get(t.identifier);
          if (entry) {
            this._player.keys[entry.key] = false;
            entry.btn.style.transform = '';
            entry.btn.style.opacity   = '';
            this._btnTouches.delete(t.identifier);
          }
        }
      };
      btn.addEventListener('touchend',    endBtn);
      btn.addEventListener('touchcancel', endBtn);
    });
  }

  _moveJoy(cx, cy) {
    if (!this._joyCenter) return;

    let dx = cx - this._joyCenter.x;
    let dy = cy - this._joyCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxR  = JOY_R - THUMB_R;

    // Clamp thumb travel to ring
    if (dist > maxR) { dx = dx / dist * maxR; dy = dy / dist * maxR; }

    // Reposition thumb
    this._joyThumb.style.transform =
      `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    // Normalised direction (–1 … +1)
    const nx = dx / maxR;
    const ny = dy / maxR;

    const keys = this._player.keys;
    // Screen +Y = down → game +Z → KeyS
    keys['KeyW'] = ny < -DEAD;
    keys['KeyS'] = ny >  DEAD;
    keys['KeyA'] = nx < -DEAD;
    keys['KeyD'] = nx >  DEAD;
  }

  _endJoy(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this._joyTouchId) {
        this._joyTouchId = null;
        this._joyCenter  = null;
        // Reset thumb to centre
        this._joyThumb.style.transform = 'translate(-50%,-50%)';
        this._joyOuter.style.borderColor = '';
        this._joyOuter.style.background  = '';
        // Release all movement keys
        ['KeyW','KeyS','KeyA','KeyD'].forEach(k => { this._player.keys[k] = false; });
        break;
      }
    }
  }

  // ── RAF: keep sprint button visually in sync ───────────────────────────────
  _startRaf() {
    const tick = () => {
      if (this._sprintBtn) {
        const on = this._player.isSprinting;
        this._sprintBtn.style.background = on
          ? '#f39c12cc'
          : '#2980b9bb';
        this._sprintBtn.style.boxShadow  = on
          ? '0 0 14px #f39c12, 0 3px 10px rgba(0,0,0,0.4)'
          : '0 3px 10px rgba(0,0,0,0.4)';
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
