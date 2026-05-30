import {
  SPEED_UPGRADE_COSTS, MAX_SPEED_LEVEL,
  MAGNET_UPGRADE_COSTS, MAX_MAGNET_LEVEL,
  AUTO_SAVE_INTERVAL,
  TIER_UNLOCK_COST, TIER_NAMES, TIER_COUNT,
  ZONES_PER_TIER,
} from './constants.js?v=21';

const SAVE_KEY = 'pokemon_slip_save_v3';

export class Economy {
  constructor() {
    this.money        = 0;
    this.speedLevel   = 0;
    this.magnetLevel  = 0;
    this._playerName  = '';
    this._saveTimer     = 0;
    this._displayTimer  = 0;   // throttle HUD DOM writes to ~10 fps
    this.disableAutoSave   = false;
    this.unlockedTiers     = [true, false, false, false]; // [low, mid, high, top]
    this._allTiersUnlocked = false;  // early-exit flag for checkTierUnlocks
    // ── Lottery ──────────────────────────────────────────────────────────────
    this.enableLotteryTax = false;   // set true in multi mode
    this._prizeAccum      = 0;       // 30%-of-income accumulator, drained periodically
    this.lotteryTickets   = [];      // ticket numbers held (1-88, lifetime)
    this.ticketsThisDraw  = 0;       // how many tickets bought this draw period

    this._moneyEl  = document.getElementById('money-display');
    this._speedEl  = document.getElementById('speed-lv');
    this._magnetEl = document.getElementById('magnet-lv');
    this._holdEl   = document.getElementById('holding-display');
    this._zoneEl   = document.getElementById('zone-display');
    // Shadow DOM values — only write when content changes
    this._lastZoneText   = '';
    this._lastHoldText   = '';
    this._lastSpeedText  = '';
    this._lastMagnetText = '';

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
    this.money             = 0;
    this.speedLevel        = 0;
    this.magnetLevel       = 0;
    this._playerName       = '';
    this.unlockedTiers     = [true, false, false, false];
    this._allTiersUnlocked = false;
    this._prizeAccum       = 0;
    this.lotteryTickets    = [];
    this.ticketsThisDraw   = 0;
    try { localStorage.removeItem(SAVE_KEY); } catch(e) {}
  }

  // ── Tier unlock check (call every frame) ──────────────────────────────────
  // Returns tier index that was just unlocked, or -1 if none
  checkTierUnlocks() {
    if (this._allTiersUnlocked) return -1;   // early exit after all tiers open
    for (let t = 1; t < TIER_COUNT; t++) {
      if (!this.unlockedTiers[t] && this.money >= TIER_UNLOCK_COST[t]) {
        this.unlockedTiers[t] = true;
        this.money -= TIER_UNLOCK_COST[t];   // 付費解鎖
        if (this.unlockedTiers.every(Boolean)) this._allTiersUnlocked = true;
        return t;
      }
    }
    return -1;
  }

  // ── Drain accumulated prize contribution (call periodically, multi only) ─
  drainPrizeAccum() {
    const v = Math.floor(this._prizeAccum);
    this._prizeAccum = 0;
    return v;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  update(dt, seatedPokemon, incomeMultiplier = 1) {
    if (this.enableLotteryTax) {
      seatedPokemon.forEach(p => {
        const earned = p.income * dt * incomeMultiplier;
        this.money       += earned * 0.7;
        this._prizeAccum += earned * 0.3;
      });
    } else {
      seatedPokemon.forEach(p => { this.money += p.income * dt * incomeMultiplier; });
    }

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
    // Speed / magnet levels — rarely change; only write on change
    const sl = String(this.speedLevel);
    const ml = String(this.magnetLevel);
    if (sl !== this._lastSpeedText)  { if (this._speedEl)  this._speedEl.textContent  = sl; this._lastSpeedText  = sl; }
    if (ml !== this._lastMagnetText) { if (this._magnetEl) this._magnetEl.textContent = ml; this._lastMagnetText = ml; }
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

  upgradeMagnet() {
    if (this.magnetLevel >= MAX_MAGNET_LEVEL) return false;
    const cost = MAGNET_UPGRADE_COSTS[this.magnetLevel];
    if (!this.spend(cost)) return false;
    this.magnetLevel++;
    return true;
  }

  /** Free speed upgrade awarded by a gift box (no cost). */
  giftSpeedUpgrade() {
    if (this.speedLevel >= MAX_SPEED_LEVEL) return false;
    this.speedLevel++;
    return true;
  }

  sellPokemon(pokemon, base) {
    const value = pokemon.income * 100;
    base.removePokemon(pokemon);
    this.earn(value);
    return value;
  }

  // ── Formatting (extended to lv-100 income scale) ─────────────────────────
  _fmt(n) {
    if (n >= 1e27) return (n/1e27).toFixed(2)+'Oc';  // octillion
    if (n >= 1e24) return (n/1e24).toFixed(2)+'Sp';  // septillion
    if (n >= 1e21) return (n/1e21).toFixed(2)+'Sx';  // sextillion
    if (n >= 1e18) return (n/1e18).toFixed(2)+'Qi';  // quintillion
    if (n >= 1e15) return (n/1e15).toFixed(2)+'Qa';  // quadrillion
    if (n >= 1e12) return (n/1e12).toFixed(2)+'T';   // trillion
    if (n >= 1e9)  return (n/1e9).toFixed(2)+'B';
    if (n >= 1e6)  return (n/1e6).toFixed(2)+'M';
    if (n >= 1e3)  return (n/1e3).toFixed(1)+'K';
    return n.toString();
  }

  // ── Save / Load ───────────────────────────────────────────────────────────
  save(seatedPokemon) {
    const data = {
      money:          Math.floor(this.money),
      speedLevel:     this.speedLevel,
      magnetLevel:    this.magnetLevel,
      playerName:     this._playerName,
      unlockedTiers:  this.unlockedTiers,
      lotteryTickets: this.lotteryTickets,
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
      this.money          = d.money          ?? 0;
      this.speedLevel     = d.speedLevel     ?? 0;
      this.magnetLevel    = d.magnetLevel    ?? 0;
      this._playerName    = d.playerName     ?? '';
      this.unlockedTiers  = d.unlockedTiers  ?? [true, false, false];
      this.lotteryTickets = d.lotteryTickets ?? [];
      this._allTiersUnlocked = this.unlockedTiers.every(Boolean);
    } catch(e) {}
  }
}
