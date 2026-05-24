/**
 * network.js — WebSocket client wrapper for player sync
 * Handles: connect, position broadcast, emoji, chat, set_name
 */
export class NetworkManager {
  constructor(wsUrl) {
    this._url  = wsUrl;
    this._ws   = null;
    this._cbs  = {};           // event type → [handler fn]
    this.playerId        = null;
    this.playerColor     = '#ffffff';
    this.playerColorName = '';
    this.connected       = false;
  }

  /**
   * Open WebSocket and wait for 'welcome' message.
   * @returns {Promise<Object>} resolves with the full welcome message
   */
  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(this._url);
      } catch {
        reject(new Error('CONN_ERR'));
        return;
      }
      this._ws = ws;

      ws.addEventListener('open', () => {
        this.connected = true;
      });

      ws.addEventListener('message', ev => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }

        if (msg.type === 'welcome') {
          this.playerId        = msg.player.id;
          this.playerColor     = msg.player.color;
          this.playerColorName = msg.player.colorName;
          resolve(msg);
        } else if (msg.type === 'full') {
          reject(new Error('FULL'));
        }

        (this._cbs[msg.type] || []).forEach(fn => fn(msg));
      });

      ws.addEventListener('close', () => {
        this.connected = false;
        (this._cbs['disconnect'] || []).forEach(fn => fn());
      });

      ws.addEventListener('error', () => {
        reject(new Error('CONN_ERR'));
      });
    });
  }

  /**
   * Register an event handler.
   * Events: player_join, player_leave, player_position,
   *         player_emoji, player_chat, player_name, disconnect
   * @returns {this} for chaining
   */
  on(event, fn) {
    (this._cbs[event] = this._cbs[event] || []).push(fn);
    return this;
  }

  _send(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    }
  }

  /** Broadcast own position + score to server (server relays to others). */
  sendPosition(x, z, rotY, sprinting, holding, money = 0) {
    this._send({
      type: 'position',
      x, z, rotY,
      sprinting: !!sprinting,
      holding:   holding | 0,
      money:     Math.floor(money),
    });
  }

  sendEmoji(emoji)     { this._send({ type: 'emoji',    emoji }); }
  sendChat(text, name) { this._send({ type: 'chat',     text, name }); }
  setName(name)        { this._send({ type: 'set_name', name }); }
}
