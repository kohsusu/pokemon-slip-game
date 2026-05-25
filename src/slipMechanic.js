import {
  SLIP_CYCLE, SLIP_DURATION,
  WARN_YELLOW, WARN_RED
} from './constants.js?v=2';
import { GROUND_COLOR_SAFE, GROUND_COLOR_YELLOW, GROUND_COLOR_RED } from './road.js?v=17';

export class SlipMechanic {
  constructor(road) {
    this.road = road;
    this.elapsed = 0;       // seconds since last slip end
    this.slipping = false;
    this.slipElapsed = 0;
    this.blinkTimer = 0;
    this.blinkState = false;

    this._bar   = document.getElementById('slip-timer-bar');
    this._label = document.getElementById('slip-label');
    this._alert = document.getElementById('slip-alert');
  }

  // Returns true if the player should be warped this frame
  update(dt, player, onWarp) {
    if (this.slipping) {
      this._updateSlipping(dt, player, onWarp);
    } else {
      this._updateCountdown(dt);
    }
  }

  _updateCountdown(dt) {
    this.elapsed += dt;
    const remaining = SLIP_CYCLE - this.elapsed;

    if (remaining <= 0) {
      this._startSlip();
      return;
    }

    // Bar fill: full green → empty
    const pct = remaining / SLIP_CYCLE;
    this._bar.style.width = (pct * 100) + '%';

    if (remaining <= WARN_RED) {
      this.blinkTimer += dt;
      if (this.blinkTimer >= 0.25) {
        this.blinkTimer = 0;
        this.blinkState = !this.blinkState;
      }
      this._bar.style.background = this.blinkState ? '#F44336' : '#FF8A80';
      this.road.setGroundColor(this.blinkState ? GROUND_COLOR_RED : 0xFF6B6B);
      this._label.textContent = `⚠️ 地滑倒數 ${Math.ceil(remaining)} 秒！`;
    } else if (remaining <= WARN_YELLOW) {
      this._bar.style.background = '#FFC107';
      this.road.setGroundColor(GROUND_COLOR_YELLOW);
      this._label.textContent = `⚡ 準備地滑：${Math.ceil(remaining)} 秒`;
    } else {
      this._bar.style.background = '#2ecc71';
      this.road.setGroundColor(GROUND_COLOR_SAFE);
      this._label.textContent = `地面狀態：安全 ✅（${Math.ceil(remaining)}s）`;
    }
  }

  _startSlip() {
    this.slipping = true;
    this.slipElapsed = 0;
    this.road.setGroundColor(GROUND_COLOR_RED);
    this._alert.style.display = 'block';
    this._label.textContent = '🌊 地滑中！快躲進凹槽！';
    this._bar.style.background = '#F44336';
  }

  _updateSlipping(dt, player, onWarp) {
    this.slipElapsed += dt;
    const pct = this.slipElapsed / SLIP_DURATION;
    this._bar.style.width = Math.max(0, (1 - pct) * 100) + '%';

    if (this.slipElapsed >= SLIP_DURATION) {
      this._endSlip();
      return;
    }

    // Check if player should be warped
    const pos = player.position;
    const onRoad = pos.z < 0; // past starting platform
    const inRest = this.road.isInRestZone(pos.x, pos.z);

    if (onRoad && !inRest && !player.isWarped) {
      onWarp();
    }
  }

  _endSlip() {
    this.slipping = false;
    this.elapsed = 0;
    this.blinkTimer = 0;
    this.blinkState = false;
    this._alert.style.display = 'none';
    this.road.setGroundColor(GROUND_COLOR_SAFE);
    this._bar.style.width = '100%';
    this._bar.style.background = '#2ecc71';
  }

  isSlipping() { return this.slipping; }
}
