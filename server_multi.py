#!/usr/bin/env python3
"""
多人遊戲伺服器 — 小心地滑！救出寶可夢
HTTP  port 7778 : 靜態檔案
WS    port 7780 : 玩家位置 / 表情 / 聊天 / 寶可夢同步
"""
import asyncio
import json
import os
import random
import sys
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler

try:
    import websockets
except ImportError:
    print("ERROR: 請先安裝 websockets 套件: pip install websockets")
    sys.exit(1)

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# ── Config ────────────────────────────────────────────────────────────────────
HTTP_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 7778
WS_PORT   = 7780
SERVE_DIR = (sys.argv[2] if len(sys.argv) > 2
             else os.path.dirname(os.path.abspath(__file__)))

COLORS      = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12']
COLOR_NAMES = ['紅隊',    '藍隊',    '綠隊',    '橙隊']
MAX_PLAYERS = 4

# ── 玩家狀態 ──────────────────────────────────────────────────────────────────
players: dict = {}   # websocket → info dict


def _used_slots():
    return {info['id'] for info in players.values()}


def _next_slot():
    for i in range(MAX_PLAYERS):
        if i not in _used_slots():
            return i
    return None


async def _broadcast(obj: dict, exclude=None) -> None:
    if not players:
        return
    data = json.dumps(obj, ensure_ascii=False)
    coros = [ws.send(data) for ws in list(players) if ws is not exclude]
    if coros:
        await asyncio.gather(*coros, return_exceptions=True)


# ── 寶可夢資料表（與 constants.js 同步）────────────────────────────────────────
_LEVELS = [
    # (rarity, minIncome, maxIncome)  — v17 ×2 boost
    ('可愛', 200,            2_000),
    ('1星',  1_000,          10_000),
    ('2星',  4_000,          40_000),
    ('3星',  200_000,        2_000_000),
    ('4星',  1_000_000,      10_000_000),
    ('5星',  4_000_000,      40_000_000),
    ('稀少', 20_000_000,     200_000_000),
    ('稀少', 100_000_000,    1_000_000_000),
    ('神話', 400_000_000,    4_000_000_000),
    ('傳奇', 2_000_000_000,  20_000_000_000),
    ('天耀', 10_000_000_000, 100_000_000_000),
    ('神聖', 40_000_000_000, 400_000_000_000),
]
_POOL = {
    1:  [(172,'皮丘'),(175,'波波'),(173,'小仙子'),(174,'胖丁寶寶'),(298,'瑪力露')],
    2:  [(25,'皮卡丘'),(133,'伊布'),(39,'胖丁'),(52,'喵喵'),(54,'可達鴨')],
    3:  [(1,'妙蛙種子'),(4,'小火龍'),(7,'傑尼龜'),(37,'六尾'),(58,'卡蒂狗')],
    4:  [(6,'噴火龍'),(9,'水箭龜'),(3,'妙蛙花'),(59,'風速狗'),(26,'雷丘')],
    5:  [(149,'快龍'),(131,'拉普拉斯'),(143,'卡比獸'),(130,'暴鯉龍')],
    6:  [(94,'耿鬼'),(68,'怪力'),(65,'胡地'),(123,'飛天螳螂')],
    7:  [(132,'百變怪'),(137,'多邦尼'),(106,'飛腿郎'),(107,'快拳郎')],
    8:  [(125,'電擊獸'),(126,'鴨嘴火獸'),(127,'大鍬形蟲'),(128,'肯泰羅')],
    9:  [(151,'夢幻'),(251,'時拉比'),(385,'基拉祈'),(490,'瑪納霏')],
    10: [(150,'超夢'),(144,'急凍鳥'),(145,'閃電鳥'),(146,'火焰鳥')],
    11: [(249,'洛奇亞'),(250,'鳳王'),(384,'烈空坐'),(644,'雷電雲')],
    12: [(493,'阿爾宙斯'),(718,'基格爾德'),(791,'索爾迦雷歐'),(792,'露奈雅拉')],
}
_RARITY_CSS = {
    '可愛':'#ffb3ba','1星':'#ffd700','2星':'#ff8c00',
    '3星':'#00bfff','4星':'#9b59b6','5星':'#ff1493',
    '稀少':'#2ecc71','神話':'#ff6b35','傳奇':'#f39c12',
    '天耀':'#bdc3e7','神聖':'#ffffff',
}
_ZONE_MIN = [1,1,1,4,4,4,7,7,7]
_ZONE_MAX = [2,3,3,5,5,6,8,10,12]
_ZONE_LEN  = 120
_ROAD_W    = 10
_NUM_ZONES = 9
_PER_ZONE  = 3   # 每個區域最多幾隻

_world_pk  : dict = {}   # netId → pokemon_dict  (在地上的)
_carried_pk: dict = {}   # netId → pokemon_dict  (被撿走的)
_pk_seq    : int  = 0

_game_ended: bool = False          # 勝利條件觸發後只廣播一次
VICTORY_THRESHOLD = 1_000_000_000_000  # 1000B


def _gen_pokemon(zone_idx: int) -> dict:
    global _pk_seq
    lv  = random.randint(_ZONE_MIN[zone_idx], _ZONE_MAX[zone_idx])
    rar, mn, mx = _LEVELS[lv - 1]
    poke_id, name = random.choice(_POOL[lv])
    income  = int(mn + random.random() * (mx - mn))
    z_far   = -((zone_idx + 1) * _ZONE_LEN)
    z_near  = -(zone_idx * _ZONE_LEN)
    x = round(random.uniform(-_ROAD_W/2 + 1, _ROAD_W/2 - 1), 2)
    z = round(random.uniform(z_far + 4, z_near - 4), 2)
    netId = _pk_seq; _pk_seq += 1
    return {
        'netId': netId, 'x': x, 'z': z, 'zone': zone_idx,
        'lv': lv, 'rarity': rar, 'pokeId': poke_id,
        'name': name, 'income': income,
        'cssColor': _RARITY_CSS.get(rar, '#aaa'),
    }


def _count_zone(zone_idx: int) -> int:
    z_far  = -((zone_idx + 1) * _ZONE_LEN)
    z_near = -(zone_idx * _ZONE_LEN)
    return sum(1 for p in _world_pk.values()
               if z_far <= p['z'] <= z_near)


# ── 寶可夢補充循環（只做週期補充；初始填充在 main() 同步完成）────────────────
async def pokemon_spawn_loop() -> None:
    while True:
        await asyncio.sleep(30)   # 每 30 秒補充一次
        for zone in range(_NUM_ZONES):
            while _count_zone(zone) < _PER_ZONE:
                p = _gen_pokemon(zone)
                _world_pk[p['netId']] = p
                await _broadcast({'type': 'pokemon_spawn', **p})
                print(f'[POKE ] 補充 zone={zone} {p["name"]}')


# ── 海嘯同步循環 ──────────────────────────────────────────────────────────────
WAVE_SAFE_MIN  = 30   # 海嘯間隔最短 30 秒
WAVE_SAFE_MAX  = 90   # 海嘯間隔最長 90 秒
WAVE_WARN_SECS = 8
WAVE_DUR_SECS  = 22
WAVE_TYPES_SRV = ['快速', '巨浪']


async def wave_loop() -> None:
    first_wait = random.uniform(WAVE_SAFE_MIN, WAVE_SAFE_MAX)
    print(f'[WAVE ] 首波將於 {first_wait:.0f} 秒後發生')
    await asyncio.sleep(first_wait)
    while True:
        wtype = random.choice(WAVE_TYPES_SRV)
        await _broadcast({'type': 'wave_alert', 'waveType': wtype})
        print(f'[WAVE ] 警告：{wtype} 海嘯')
        await asyncio.sleep(WAVE_WARN_SECS)
        await _broadcast({'type': 'wave_start', 'waveType': wtype})
        print(f'[WAVE ] 開始')
        await asyncio.sleep(WAVE_DUR_SECS)
        await _broadcast({'type': 'wave_end'})
        next_wait = random.uniform(WAVE_SAFE_MIN, WAVE_SAFE_MAX)
        print(f'[WAVE ] 結束，下一波 {next_wait:.0f} 秒後')
        await asyncio.sleep(next_wait)


# ── WebSocket handler ─────────────────────────────────────────────────────────
async def handler(ws) -> None:
    slot = _next_slot()
    if slot is None:
        try:
            await ws.send(json.dumps({'type': 'full'}))
        except Exception:
            pass
        return

    info = {
        'id':        slot,
        'name':      f'玩家{slot + 1}',
        'color':     COLORS[slot],
        'colorName': COLOR_NAMES[slot],
        'x': 0.0, 'z': 0.0, 'rotY': 0.0,
        'sprinting': False, 'holding': 0, 'money': 0,
        'baseSeats': [],   # 基地上的寶可夢狀態
    }
    players[ws] = info

    # 歡迎訊息：含目前世界所有寶可夢
    others = [v for k, v in players.items() if k is not ws]
    await ws.send(json.dumps({
        'type': 'welcome',
        'player': info,
        'others': others,
        'worldPokemons': list(_world_pk.values()),
    }, ensure_ascii=False))

    await _broadcast({'type': 'player_join', 'player': info}, exclude=ws)
    print(f'[JOIN]  id={slot}  online={len(players)}')

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                continue

            mtype = msg.get('type', '')

            # ── 位置 ──────────────────────────────────────────────────────────
            if mtype == 'position':
                global _game_ended
                info.update({
                    'x':         float(msg.get('x', 0)),
                    'z':         float(msg.get('z', 0)),
                    'rotY':      float(msg.get('rotY', 0)),
                    'sprinting': bool(msg.get('sprinting', False)),
                    'holding':   int(msg.get('holding', 0)),
                    'money':     int(msg.get('money', 0)),
                })
                # Include what this player is currently carrying (for remote sprite display)
                carried_list = [
                    {
                        'cssColor': p.get('cssColor', '#aaa'),
                        'rarity':   p.get('rarity', ''),
                        'pokeId':   p.get('pokeId', 0),
                    }
                    for p in _carried_pk.values()
                    if p.get('carrier') == slot
                ]
                await _broadcast({
                    'type': 'player_position', 'id': slot,
                    'x': info['x'], 'z': info['z'], 'rotY': info['rotY'],
                    'sprinting': info['sprinting'],
                    'holding': info['holding'], 'money': info['money'],
                    'carriedPokemon': carried_list,
                }, exclude=ws)

                # ── 勝利條件：所有玩家金錢總和 ≥ 1000B ─────────────────────────
                if not _game_ended:
                    total = sum(p['money'] for p in players.values())
                    if total >= VICTORY_THRESHOLD:
                        _game_ended = True
                        scores = [
                            {'id': p['id'], 'name': p['name'],
                             'color': p['color'], 'money': p['money']}
                            for p in players.values()
                        ]
                        await _broadcast({
                            'type': 'game_end',
                            'totalMoney': total,
                            'scores': scores,
                        })
                        print(f'[GAME ] 遊戲結束！總金額 = {total:,}')

            # ── 寶可夢：撿起 ──────────────────────────────────────────────────
            elif mtype == 'pokemon_pickup':
                netId = int(msg.get('netId', -1))
                p = _world_pk.pop(netId, None)
                if p:
                    p['carrier'] = slot
                    _carried_pk[netId] = p
                    await _broadcast(
                        {'type': 'pokemon_remove', 'netId': netId},
                        exclude=ws,
                    )

            # ── 寶可夢：丟下 ──────────────────────────────────────────────────
            elif mtype == 'pokemon_drop':
                netId = int(msg.get('netId', -1))
                x = round(float(msg.get('x', 0)), 2)
                z = round(float(msg.get('z', 0)), 2)
                p = _carried_pk.pop(netId, None)
                if p:
                    p['x'] = x; p['z'] = z
                    p.pop('carrier', None)
                    _world_pk[netId] = p
                    await _broadcast({'type': 'pokemon_spawn', **p}, exclude=ws)

            # ── 寶可夢：存入基地 ──────────────────────────────────────────────
            elif mtype == 'pokemon_deposit':
                netId = int(msg.get('netId', -1))
                p = _carried_pk.pop(netId, None)
                # 不回到世界，由 base_update 廣播視覺狀態
                # 立刻在同一區域補充一隻新寶可夢
                if p is not None:
                    zone = p.get('zone', 0)
                    new_p = _gen_pokemon(zone)
                    _world_pk[new_p['netId']] = new_p
                    await _broadcast({'type': 'pokemon_spawn', **new_p})

            # ── 寶可夢：賣出 ─────────────────────────────────────────────────
            elif mtype == 'pokemon_sell':
                netId = int(msg.get('netId', -1))
                _world_pk.pop(netId, None)
                p = _carried_pk.pop(netId, None)
                # 立刻在同一區域補充一隻新寶可夢
                if p is not None:
                    zone = p.get('zone', 0)
                    new_p = _gen_pokemon(zone)
                    _world_pk[new_p['netId']] = new_p
                    await _broadcast({'type': 'pokemon_spawn', **new_p})

            # ── 基地狀態更新 ──────────────────────────────────────────────────
            elif mtype == 'base_update':
                seats = msg.get('seats', [])
                info['baseSeats'] = seats
                await _broadcast({
                    'type': 'base_update',
                    'playerId': slot,
                    'seats': seats,
                }, exclude=ws)

            # ── 表情符號 ──────────────────────────────────────────────────────
            elif mtype == 'emoji':
                emoji = str(msg.get('emoji', '👍'))[:8]
                await _broadcast(
                    {'type': 'player_emoji', 'id': slot, 'emoji': emoji},
                    exclude=ws,
                )

            # ── 聊天 ─────────────────────────────────────────────────────────
            elif mtype == 'chat':
                text = str(msg.get('text', ''))[:60]
                name = str(msg.get('name', info['name']))[:12].strip() or info['name']
                info['name'] = name
                await _broadcast({
                    'type': 'player_chat', 'id': slot,
                    'name': name, 'color': info['color'], 'text': text,
                })

            # ── 改名 ─────────────────────────────────────────────────────────
            elif mtype == 'set_name':
                name = str(msg.get('name', '')).strip()[:12]
                if name:
                    info['name'] = name
                    await _broadcast(
                        {'type': 'player_name', 'id': slot, 'name': name},
                        exclude=ws,
                    )

    except websockets.ConnectionClosed:
        pass
    except Exception as e:
        print(f'[ERR] id={slot}: {e}')
    finally:
        # 把該玩家持有的寶可夢還給世界（丟到路上）
        for netId, p in list(_carried_pk.items()):
            if p.get('carrier') == slot:
                p['x'] = round(random.uniform(-3, 3), 2)
                p['z'] = round(random.uniform(-30, -5), 2)
                p.pop('carrier', None)
                _world_pk[netId] = p
                del _carried_pk[netId]
                await _broadcast({'type': 'pokemon_spawn', **p})

        players.pop(ws, None)
        await _broadcast({'type': 'player_leave', 'id': slot})
        print(f'[LEAVE] id={slot}  online={len(players)}')


# ── HTTP 靜態伺服器 ────────────────────────────────────────────────────────────
def run_http() -> None:
    os.chdir(SERVE_DIR)

    class Handler(SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Access-Control-Allow-Origin', '*')
            super().end_headers()

        def log_message(self, fmt, *args):
            pass

    server = HTTPServer(('', HTTP_PORT), Handler)
    print(f'[HTTP ] http://localhost:{HTTP_PORT}  (目錄: {SERVE_DIR})')
    server.serve_forever()


# ── 主程式 ────────────────────────────────────────────────────────────────────
async def main() -> None:
    # 在接受連線前同步填滿寶可夢池，確保第一位玩家就能看到寶可夢
    for zone in range(_NUM_ZONES):
        while _count_zone(zone) < _PER_ZONE:
            p = _gen_pokemon(zone)
            _world_pk[p['netId']] = p
    print(f'[POKE ] 初始生成 {len(_world_pk)} 隻寶可夢')

    threading.Thread(target=run_http, daemon=True).start()
    print(f'[WS   ] ws://localhost:{WS_PORT}')
    print('─' * 50)
    print('多人伺服器已啟動，等待玩家連線…（Ctrl-C 停止）')
    print('─' * 50)
    async with websockets.serve(handler, '0.0.0.0', WS_PORT):
        asyncio.create_task(wave_loop())
        asyncio.create_task(pokemon_spawn_loop())
        await asyncio.Future()


if __name__ == '__main__':
    asyncio.run(main())
