import {
  SPEED_UPGRADE_COSTS, GRIP_UPGRADE_COSTS,
  MAX_SPEED_LEVEL, MAX_GRIP_LEVEL,
  AUTO_SAVE_INTERVAL,
  TIER_UNLOCK_COST, TIER_NAMES, TIER_COUNT,
  ZONES_PER_TIER,
} from './constants.js?v=18';

const SAVE_KEY = 'pokemon_slip_save_v3';

export class Economy {
  constructor() {
    this.money       = 0;
    this.speedLevel  = 0;
    this.gripLevel   = 0;
    this._playerName = '';
    this._saveTimer     = 0;
    this._displayTimer  = 0;   // throttle HUD DOM writes to ~10 fps
    this.disableAutoSave = false;
    this.unlockedTiers = [true, false, false]; // [low, mid, high]

    this._moneyEl = document.getElementById('money-display');
    this._speedEl = document.getElementById('speed-lv');
    this._gripEl  = document.getElementById('grip-lv');
    this._holdEl  = document.getElementById('holding-display');
    this._zoneEl  = document.getElementById('zone-display');
    // Shadow DOM values — only write when content changes
    this._lastZoneText  = '';
    this._lastHoldText  = '';
    this._lastSpeedText = '';
    this._lastGripText  = '';

    this.load();
  }

  // ── Static helpers ────────────────────────────────────────────────────────
  static hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch(e) { return false; }
  }

  static peekSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  // ── Player name ───────────────────────────────────────────────────────────
  get playerName() { return this._playerName; }
  set playerName(v) { this._playerName = v ?? ''; }

  // ── Reset (new game) ──────────────────────────────────────────────────────
  reset() {
    this.money         = 0;
    this.speedLevel    = 0;
    this.gripLevel     = 0;
    this._playerName   = '';
    this.unlockedTiers = [true, false, false];
    try { localStorage.removeItem(SAVE_KEY); } catch(e) {}
  }

  // ── Tier unlock check (call every frame) ──────────────────────────────────
  // Returns tier index that was just unlocked, or -1 if none
  checkTierUnlocks() {
    for (let t = 1; t < TIER_COUNT; t++) {
      if (!this.unlockedTiers[t] && this.money >= TIER_UNLOCK_COST[t]) {
        this.unlockedTiers[t] = true;
        this.money -= TIER_UNLOCK_COST[t];   // 付費解鎖
        return t;
      }
    }
    return -1;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  update(dt, seatedPokemon) {
    seatedPokemon.forEach(p => { this.money += p.income * dt; });

    if (!this.disableAutoSave) {
      this._saveTimer += dt;
      if (this._saveTimer >= AUTO_SAVE_INTERVAL) {
        this._saveTimer = 0;
        this.save(seatedPokemon);
      }
    }

    // Throttle DOM write to ~10 fps — avoids layout reflow every frame
    this._displayTimer += dt;
    if (this._displayTimer >= 0.1) {
      this._displayTimer = 0;
      this._moneyEl.textContent = `💰 $${this._fmt(Math.floor(this.money))}`;
    }
  }

  updateZoneDisplay(zoneIdx) {
    let text;
    if (zoneIdx < 0) {
      text = '區間：基地';
    } else {
      const tier   = Math.floor(zoneIdx / ZONES_PER_TIER);
      const inTier = (zoneIdx % ZONES_PER_TIER) + 1;
      const locked = !this.unlockedTiers[tier];
      text = `區間：${locked ? `${TIER_NAMES[tier]} ⛔` : `${TIER_NAMES[tier]} Z${inTier}`}`;
    }
    if (text !== this._lastZoneText) {
      this._zoneEl.textContent = text;
      this._lastZoneText = text;
    }
  }

  updateHoldingDisplay(heldArr) {
    // Held Pokémon info
    const holdText = (!heldArr || heldArr.length === 0)
      ? '手持：無'
      : `手持：Lv.${heldArr[0].lv} ${heldArr[0].rarity} ($${this._fmt(heldArr[0].income)}/s)`;
    if (holdText !== this._lastHoldText) {
      this._holdEl.textContent = holdText;
      this._lastHoldText = holdText;
    }
    // Speed / grip levels — rarely change; only write on change
    const sl = String(this.speedLevel);
    const gl = String(this.gripLevel);
    if (sl !== this._lastSpeedText) { this._speedEl.textContent = sl; this._lastSpeedText = sl; }
    if (gl !== this._lastGripText)  { this._gripEl.textContent  = gl; this._lastGripText  = gl; }
  }

  canAfford(amount) { return this.money >= amount; }
  spend(amount)     { if (!this.canAfford(amount)) return false; this.money -= amount; return true; }
  earn(amount)      { this.money += amount; }

  // ── Upgrades ──────────────────────────────────────────────────────────────
  upgradeSpeed() {
    if (this.speedLevel >= MAX_SPEED_LEVEL) return false;
    const cost = SPEED_UPGRADE_COSTS[this.speedLevel];
    if (!this.spend(cost)) return false;
    this.speedLevel++;
    return true;
  }

  upgradeGrip() {
    if (this.gripLevel >= MAX_GRIP_LEVEL) return false;
    const cost = GRIP_UPGRADE_COSTS[this.gripLevel];
    if (!this.spend(cost)) return false;
    this.gripLevel++;
    return true;
  }

  sellPokemon(pokemon, base) {
    const value = pokemon.income * 100;
    base.removePokemon(pokemon);
    this.earn(value);
    return value;
  }

  // ── Formatting ────────────────────────────────────────────────────────────
  _fmt(n) {
    if (n >= 1_000_000_000_000) return (n/1_000_000_000_000).toFixed(2)+'T';
    if (n >= 1_000_000_000)     return (n/1_000_000_000).toFixed(2)+'B';
    if (n >= 1_000_000)         return (n/1_000_000).toFixed(2)+'M';
    if (n >= 1_000)             return (n/1_000).toFixed(1)+'K';
    return n.toString();
  }

  // ── Save / Load ───────────────────────────────────────────────────────────
  save(seatedPokemon) {
    const data = {
      money:         Math.floor(this.money),
      speedLevel:    this.speedLevel,
      gripLevel:     this.gripLevel,
      playerName:    this._playerName,
      unlockedTiers: this.unlockedTiers,
      seated: seatedPokemon.map(p => ({
        lv: p.lv, income: p.income, color: p.color, rarity: p.rarity
      })),
    };
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch(e) {}
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      this.money         = d.money         ?? 0;
      this.speedLevel    = d.speedLevel    ?? 0;
      this.gripLevel     = d.gripLevel     ?? 0;
      this._playerName   = d.playerName    ?? '';
      this.unlockedTiers = d.unlockedTiers ?? [true, false, false];
    } catch(e) {}
  }
}
