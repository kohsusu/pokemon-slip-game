import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  SPEED_UPGRADE_COSTS, GRIP_UPGRADE_COSTS,
  MAX_SPEED_LEVEL, MAX_GRIP_LEVEL,
} from './constants.js?v=17';

const SHOP_X = 0;    // centred between the two front bases (x=±26)
const SHOP_Z = 14;   // behind the road-start platform, beyond front bases

export class Shop {
  constructor(scene, economy, player, audio = null) {
    this.scene   = scene;
    this.economy = economy;
    this.player  = player;
    this._audio  = audio;
    this.statues = { speed: [], grip: [] };
    this.uiVisible = false;

    this._buildShop();
    this._buildUI();
  }

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
        🧲 抓地力升級
        <span style="color:#aef"> Lv.<span id="shop-grip-lv">0</span></span>
        <span id="shop-grip-max" style="color:#f88;font-size:11px;display:none"> (已滿級)</span><br>
        <span id="shop-grip-cost" style="font-size:12px;color:#ccc"></span><br>
        <button id="btn-grip-up">升級抓地力</button>
      </div>

      <button id="btn-close-shop" style="margin-top:12px;background:#555;width:100%">關閉 [B]</button>
    `;
    ui.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:rgba(10,10,30,0.96);color:#fff;padding:20px 24px;border-radius:16px;
      min-width:270px;z-index:100;display:none;border:2px solid #FFD700;font-size:14px;
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

    document.getElementById('btn-speed-up').onclick = () => this._doUpgrade('speed');
    document.getElementById('btn-grip-up').onclick  = () => this._doUpgrade('grip');
    document.getElementById('btn-close-shop').onclick = () => this.hideUI();
  }

  _doUpgrade(type) {
    let success = false;
    if (type === 'speed') {
      success = this.economy.upgradeSpeed();
      if (success) this.player.speedLevel = this.economy.speedLevel;
    } else {
      success = this.economy.upgradeGrip();
      if (success) this.player.gripLevel = this.economy.gripLevel;
    }

    if (!success) {
      const lv = type === 'speed' ? this.economy.speedLevel : this.economy.gripLevel;
      const maxLv = type === 'speed' ? MAX_SPEED_LEVEL : MAX_GRIP_LEVEL;
      if (lv >= maxLv) {
        alert('已達最高等級！');
      } else {
        const costs = type === 'speed' ? SPEED_UPGRADE_COSTS : GRIP_UPGRADE_COSTS;
        alert(`金幣不足！需要 $${costs[lv].toLocaleString()}`);
      }
    } else {
      this._audio?.playUpgrade();
      this._addStatue(type);
      this._refreshUI();
    }
  }

  _addStatue(type) {
    const count  = this.statues[type].length;
    const colors = { speed: 0x42A5F5, grip: 0x66BB6A };
    const offsets = { speed: -1.5, grip: 1.5 };
    const geo    = new THREE.BoxGeometry(0.5, 1.2, 0.5);
    const mat    = new THREE.MeshLambertMaterial({ color: colors[type] });
    const statue = new THREE.Mesh(geo, mat);
    statue.position.set(SHOP_X + offsets[type], 0.6, SHOP_Z + 3.5 + count * 0.8);
    statue.castShadow = true;
    this.scene.add(statue);
    this.statues[type].push(statue);
  }

  _refreshUI() {
    const sLv = this.economy.speedLevel;
    const gLv = this.economy.gripLevel;

    document.getElementById('shop-speed-lv').textContent = sLv;
    document.getElementById('shop-grip-lv').textContent  = gLv;

    // Speed
    const sMax = sLv >= MAX_SPEED_LEVEL;
    document.getElementById('shop-speed-max').style.display  = sMax ? 'inline' : 'none';
    document.getElementById('shop-speed-cost').textContent   = sMax ? '' : `費用：$${SPEED_UPGRADE_COSTS[sLv].toLocaleString()}`;
    document.getElementById('btn-speed-up').disabled         = sMax;

    // Grip
    const gMax = gLv >= MAX_GRIP_LEVEL;
    document.getElementById('shop-grip-max').style.display   = gMax ? 'inline' : 'none';
    document.getElementById('shop-grip-cost').textContent    = gMax ? '' : `費用：$${GRIP_UPGRADE_COSTS[gLv].toLocaleString()}`;
    document.getElementById('btn-grip-up').disabled          = gMax;
  }

  showUI() {
    this._refreshUI();
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
    return Math.sqrt(dx * dx + dz * dz) < 6;
  }
}
