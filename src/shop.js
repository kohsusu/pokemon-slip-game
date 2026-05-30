import * as THREE from 'three';
import {
  SPEED_UPGRADE_COSTS,  MAX_SPEED_LEVEL,
  MAGNET_UPGRADE_COSTS, MAX_MAGNET_LEVEL,
} from './constants.js?v=21';
// v=22 — carry upgrade removed; gift box open UI added

const SHOP_X = 0;    // centred between the two front bases (x=±26)
const SHOP_Z = 14;   // behind the road-start platform, beyond front bases
const SHOP_NEAR_SQ = 36;   // 6² — isNearShop threshold, no sqrt needed

// ── Shared statue geometry + materials (2 types) ──────────────────────────
const _statueGeo  = new THREE.BoxGeometry(0.5, 1.2, 0.5);
const _statueMats = {
  speed:  new THREE.MeshLambertMaterial({ color: 0x42A5F5 }),
  magnet: new THREE.MeshLambertMaterial({ color: 0xAB47BC }),
};

export class Shop {
  constructor(scene, economy, player, audio = null) {
    this.scene   = scene;
    this.economy = economy;
    this.player  = player;
    this._audio  = audio;
    this._net    = null;   // set via setNetwork() in multi mode
    this.statues = { speed: [], magnet: [] };
    this.uiVisible = false;

    this._buildShop();
    this._buildUI();
  }

  /** Call once in multi mode to enable lottery purchase. */
  setNetwork(net) { this._net = net; }

  _buildShop() {
    const shopGeo = new THREE.BoxGeometry(6, 4, 5);
    const shopMat = new THREE.MeshLambertMaterial({ color: 0xF9A825 });
    const shop = new THREE.Mesh(shopGeo, shopMat);
    shop.position.set(SHOP_X, 2, SHOP_Z);
    shop.castShadow = true;
    this.scene.add(shop);

    const roofGeo = new THREE.ConeGeometry(4.5, 2, 4);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xE53935 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(SHOP_X, 5, SHOP_Z);
    roof.rotation.y = Math.PI / 4;
    this.scene.add(roof);

    const signGeo = new THREE.BoxGeometry(4, 1, 0.1);
    const signMat = new THREE.MeshLambertMaterial({ color: 0x1565C0 });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(SHOP_X, 3.5, SHOP_Z - 2.5);
    this.scene.add(sign);
  }

  _buildUI() {
    const ui = document.createElement('div');
    ui.id = 'shop-ui';
    ui.innerHTML = `
      <div style="font-size:18px;font-weight:bold;margin-bottom:14px;color:#FFD700">🏪 升級商店</div>

      <div class="shop-row">
        🏃 速度升級
        <span style="color:#aef"> Lv.<span id="shop-speed-lv">0</span></span>
        <span id="shop-speed-max" style="color:#f88;font-size:11px;display:none"> (已滿級)</span><br>
        <span id="shop-speed-cost" style="font-size:12px;color:#ccc"></span><br>
        <button id="btn-speed-up">升級速度</button>
      </div>

      <div class="shop-row">
        🧲 磁力升級
        <span style="color:#d8b4fe"> Lv.<span id="shop-magnet-lv">0</span></span>
        <span id="shop-magnet-max" style="color:#f88;font-size:11px;display:none"> (已滿級)</span><br>
        <span style="font-size:11px;color:#aaa">拾取範圍 +0.7u / 級，最遠可達 9.8u</span><br>
        <span id="shop-magnet-cost" style="font-size:12px;color:#ccc"></span><br>
        <button id="btn-magnet-up">升級磁力</button>
      </div>

      <div class="shop-row">
        🎁 禮包開啟
        <span id="shop-gift-status" style="font-size:11px;color:#aaa">　尚無禮包</span><br>
        <span style="font-size:11px;color:#aaa">隨機獎勵：金錢（25-40%）/ 速度升級 / 免費彩票</span><br>
        <span style="font-size:11px;color:#aaa">禮包在野外區域隨機出現，走近即可撿起</span><br>
        <button id="btn-open-gift" disabled>🎁 打開禮包 [G]</button>
      </div>

      <div class="shop-row" id="shop-lottery-row">
        🎫 彩票抽獎
        <span style="font-size:11px;color:#aaa"> 每 3 分鐘開獎 ｜ 每輪最多 3 張</span><br>
        <span id="shop-prize-pool" style="font-size:13px;color:#FFD700;">🏆 獎金池：$0</span><br>
        <span id="shop-ticket-list" style="font-size:11px;color:#9cf;">🎟 持有號碼：無</span><br>
        <span id="shop-ticket-limit" style="font-size:11px;color:#ccc;">本輪已買：0 / 3</span><br>
        <span id="shop-ticket-cost" style="font-size:12px;color:#ccc;">費用：10% 目前金幣</span><br>
        <button id="btn-buy-ticket">🎫 購買彩票</button>
      </div>

      <button id="btn-close-shop" style="margin-top:12px;background:#555;width:100%">關閉 [B]</button>
    `;
    ui.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:rgba(10,10,30,0.96);color:#fff;padding:20px 24px;border-radius:16px;
      min-width:280px;max-height:88vh;overflow-y:auto;
      z-index:100;display:none;border:2px solid #FFD700;font-size:14px;
    `;

    const style = document.createElement('style');
    style.textContent = `
      .shop-row { margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid #333; }
      #shop-ui button { margin-top:6px; padding:6px 16px; border:none; border-radius:6px;
        background:#1565C0; color:#fff; cursor:pointer; font-size:13px; }
      #shop-ui button:hover:not(:disabled) { background:#1976D2; }
      #shop-ui button:disabled { background:#444; color:#666; cursor:default; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(ui);
    this._ui = ui;

    document.getElementById('btn-speed-up').onclick  = () => this._doUpgrade('speed');
    document.getElementById('btn-magnet-up').onclick = () => this._doUpgrade('magnet');
    document.getElementById('btn-open-gift').onclick  = () => this._doOpenGift();
    document.getElementById('btn-close-shop').onclick = () => this.hideUI();
    document.getElementById('btn-buy-ticket').onclick = () => this._doBuyTicket();
  }

  _doUpgrade(type) {
    let success = false;
    if (type === 'speed') {
      success = this.economy.upgradeSpeed();
      if (success) this.player.speedLevel = this.economy.speedLevel;
    } else if (type === 'magnet') {
      success = this.economy.upgradeMagnet();
      if (success) this.player.magnetLevel = this.economy.magnetLevel;
    }

    if (!success) {
      const lv    = this.economy[`${type}Level`];
      const maxLv = type === 'speed' ? MAX_SPEED_LEVEL : MAX_MAGNET_LEVEL;
      if (lv >= maxLv) {
        alert('已達最高等級！');
      } else {
        const costs = type === 'speed' ? SPEED_UPGRADE_COSTS : MAGNET_UPGRADE_COSTS;
        alert(`金幣不足！需要 $${costs[lv].toLocaleString()}`);
      }
    } else {
      this._audio?.playUpgrade();
      this._addStatue(type);
      this._refreshUI();
    }
  }

  _doOpenGift() {
    if (!this.player.heldGift) {
      alert('你還沒有禮包！在野外區域撿拾後再來。');
      return;
    }
    if (!this._net) {
      alert('禮包系統僅限多人模式！');
      return;
    }
    const giftId = this.player.useGift();
    this._net.sendGiftOpen(giftId, Math.floor(this.economy.money), this.economy.speedLevel);
    this.refreshGiftUI(false);
    const btn = document.getElementById('btn-open-gift');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 開啟中…'; }
  }

  /** Update gift row in shop UI to reflect whether player holds a gift box. */
  refreshGiftUI(hasGift) {
    const statusEl = document.getElementById('shop-gift-status');
    const btn      = document.getElementById('btn-open-gift');
    if (!statusEl) return;
    if (hasGift) {
      statusEl.textContent = '　🎁 持有禮包！點擊打開！';
      statusEl.style.color = '#FFD700';
    } else {
      statusEl.textContent = '　尚無禮包（在野外走近即可撿起）';
      statusEl.style.color = '#aaa';
    }
    if (btn) {
      btn.disabled    = !hasGift;
      btn.textContent = '🎁 打開禮包 [G]';
    }
  }

  _addStatue(type) {
    const count   = this.statues[type].length;
    const offsets = { speed: -2.2, magnet: 2.2 };
    const statue  = new THREE.Mesh(_statueGeo, _statueMats[type]);
    statue.position.set(SHOP_X + offsets[type], 0.6, SHOP_Z + 3.5 + count * 0.8);
    statue.castShadow = true;
    this.scene.add(statue);
    this.statues[type].push(statue);
  }

  _refreshUI() {
    const sLv = this.economy.speedLevel;
    const mLv = this.economy.magnetLevel;

    document.getElementById('shop-speed-lv').textContent  = sLv;
    document.getElementById('shop-magnet-lv').textContent = mLv;

    // Speed
    const sMax = sLv >= MAX_SPEED_LEVEL;
    document.getElementById('shop-speed-max').style.display  = sMax ? 'inline' : 'none';
    document.getElementById('shop-speed-cost').textContent   = sMax ? '' : `費用：$${SPEED_UPGRADE_COSTS[sLv].toLocaleString()}`;
    document.getElementById('btn-speed-up').disabled         = sMax;

    // Magnet
    const mMax = mLv >= MAX_MAGNET_LEVEL;
    document.getElementById('shop-magnet-max').style.display  = mMax ? 'inline' : 'none';
    document.getElementById('shop-magnet-cost').textContent   = mMax ? '' : `費用：$${MAGNET_UPGRADE_COSTS[mLv].toLocaleString()}`;
    document.getElementById('btn-magnet-up').disabled         = mMax;
  }

  _doBuyTicket() {
    if (!this._net) {
      alert('彩票系統僅限多人模式！');
      return;
    }
    if (this.economy.ticketsThisDraw >= 3) {
      alert('本輪已達購買上限（3 張）！下次開獎後可再購買。');
      return;
    }
    const cost = Math.floor(this.economy.money * 0.1);
    if (cost <= 0) {
      alert('金幣太少，無法購買（需有一定金幣）！');
      return;
    }
    if (!this.economy.spend(cost)) {
      alert('金幣不足！');
      return;
    }
    this._net.sendBuyTicket(cost);
  }

  // ── Call from main_multi.js when prize pool / ticket state changes ────────
  updateLotteryUI(pool, ticketsThisDraw, myTickets) {
    const poolEl  = document.getElementById('shop-prize-pool');
    const listEl  = document.getElementById('shop-ticket-list');
    const limitEl = document.getElementById('shop-ticket-limit');
    const costEl  = document.getElementById('shop-ticket-cost');
    const btn     = document.getElementById('btn-buy-ticket');
    if (!poolEl) return;

    poolEl.textContent  = `🏆 獎金池：$${this._fmtPool(pool)}`;
    listEl.textContent  = myTickets.length > 0
      ? `🎟 持有號碼：${myTickets.slice(-12).join('、')}${myTickets.length > 12 ? '…' : ''}（共 ${myTickets.length} 張）`
      : '🎟 持有號碼：無';
    limitEl.textContent = `本輪已買：${ticketsThisDraw} / 3`;

    const canBuy = !!this._net && ticketsThisDraw < 3;
    const cost   = Math.floor(this.economy.money * 0.1);
    costEl.textContent = canBuy
      ? `費用：$${this._fmtPool(cost)}（目前金幣 10%）`
      : ticketsThisDraw >= 3
        ? '本輪購票已達上限'
        : '多人模式限定';
    if (btn) btn.disabled = !canBuy;
  }

  _fmtPool(n) {
    if (n >= 1e12) return (n/1e12).toFixed(2)+'T';
    if (n >= 1e9)  return (n/1e9).toFixed(2)+'B';
    if (n >= 1e6)  return (n/1e6).toFixed(2)+'M';
    if (n >= 1e3)  return (n/1e3).toFixed(1)+'K';
    return String(Math.floor(n));
  }

  showUI() {
    this._refreshUI();
    this.refreshGiftUI(this.player.heldGift != null);
    // refresh lottery display on open
    this.updateLotteryUI(
      window._prizePoolTotal ?? 0,
      this.economy.ticketsThisDraw,
      this.economy.lotteryTickets,
    );
    this._ui.style.display = 'block';
    this.uiVisible = true;
  }

  hideUI() {
    this._ui.style.display = 'none';
    this.uiVisible = false;
  }

  isNearShop(playerPos) {
    const dx = playerPos.x - SHOP_X;
    const dz = playerPos.z - SHOP_Z;
    return dx * dx + dz * dz < SHOP_NEAR_SQ;
  }
}
