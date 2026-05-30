#!/usr/bin/env python3
"""
多人遊戲伺服器 — 小心地滑！救出寶可夢
HTTP  port 7778 : 靜態檔案
WS    port 7780 : 玩家位置 / 表情 / 聊天 / 寶可夢同步
"""
import asyncio
import json
import math
import os
import random
import sys
import threading
from collections import defaultdict
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
    # (rarity, minIncome, maxIncome)  — lv 1-12 explicit
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
# ── Auto-generate lv 13-100 (mirrors constants.js _addHighTierData) ────────────
_HIGH_RARITIES = [
    (13, 20, '超傳說'),
    (21, 40, '神域'),
    (41, 60, '創世'),
    (61, 80, '永恆'),
    (81, 99, '無限'),
]
_max_inc = 400_000_000_000  # lv 12 maxIncome
for _lv in range(13, 100):  # lv 13-99; lv 100 removed
    _max_inc = round(_max_inc * 1.5)
    _min_inc = round(_max_inc / 4)
    _rar = next(r for f, t, r in _HIGH_RARITIES if f <= _lv <= t)
    _LEVELS.append((_rar, _min_inc, _max_inc))
del _max_inc, _min_inc, _lv, _rar
_POOL = {
    1:  [(172,'皮丘'),(175,'波波'),(173,'小仙子'),(174,'胖丁寶寶'),
         (298,'瑪力露'),(440,'幸福蛋'),(446,'小卡比獸'),(238,'溜冰小子')],
    2:  [(25,'皮卡丘'),(133,'伊布'),(39,'胖丁'),(52,'喵喵'),
         (54,'可達鴨'),(35,'比比'),(79,'呆呆獸'),(447,'波路路')],
    3:  [(1,'妙蛙種子'),(4,'小火龍'),(7,'傑尼龜'),(37,'六尾'),
         (58,'卡蒂狗'),(147,'迷你龍'),(38,'九尾'),(77,'小火馬')],
    4:  [(6,'噴火龍'),(9,'水箭龜'),(3,'妙蛙花'),(59,'風速狗'),
         (26,'雷丘'),(134,'水伊布'),(135,'雷伊布'),(196,'太陽伊布')],
    5:  [(149,'快龍'),(131,'拉普拉斯'),(143,'卡比獸'),(130,'暴鯉龍'),
         (136,'火伊布'),(197,'月亮伊布'),(448,'盧卡利歐'),(470,'葉伊布')],
    6:  [(94,'耿鬼'),(68,'怪力'),(65,'胡地'),(123,'飛天螳螂'),
         (248,'班基拉斯'),(373,'暴飛龍'),(445,'烈咬陸鯊'),(376,'超甲狂蟹')],
    7:  [(132,'百變怪'),(137,'多邦尼'),(106,'飛腿郎'),(107,'快拳郎'),
         (141,'化石鎧甲'),(142,'化石翼龍'),(243,'雷公'),(244,'炎帝')],
    8:  [(125,'電擊獸'),(126,'鴨嘴火獸'),(127,'大鍬形蟲'),(128,'肯泰羅'),
         (245,'水君'),(462,'磁怪'),(472,'格鬥蠍'),(229,'黑炎帝')],
    9:  [(151,'夢幻'),(251,'時拉比'),(385,'基拉祈'),(490,'瑪納霏'),
         (380,'拉帝亞斯'),(381,'拉帝歐斯'),(382,'蓋歐卡'),(383,'固拉多')],
    10: [(150,'超夢'),(144,'急凍鳥'),(145,'閃電鳥'),(146,'火焰鳥'),
         (249,'洛奇亞'),(250,'鳳王'),(384,'烈空坐'),(643,'萊希拉姆')],
    11: [(483,'帝牙盧卡'),(484,'帕路奇亞'),(487,'騎拉帝納'),(644,'捷克羅姆'),
         (716,'哲爾尼亞斯'),(717,'伊維爾塔爾'),(888,'蒼響'),(889,'藏瑪然特')],
    12: [(493,'阿爾宙斯'),(718,'基格爾德'),(791,'索爾迦雷歐'),(792,'露奈雅拉'),
         (800,'奈克羅茲瑪'),(890,'無極汰那'),(898,'雷冠王'),(645,'土地雲')],
}
# ── lv 13-100 pools (mirrors constants.js HIGH_POOLS) ─────────────────────────
_HIGH_POOLS = {
    13: [(483,'帝牙盧卡'),(484,'帕路奇亞'),(487,'騎拉帝納'),(480,'由克希'),
         (481,'艾姆利多'),(488,'剋拉索拉'),(491,'達克萊伊'),(492,'謝米')],
    21: [(643,'萊希拉姆'),(646,'酋雷姆'),(716,'哲爾尼亞斯'),(717,'伊維爾塔爾'),
         (800,'奈克羅茲瑪'),(641,'龍捲雲'),(642,'雷電雲'),(645,'土地雲')],
    41: [(888,'蒼響'),(889,'藏瑪然特'),(890,'無極汰那'),(894,'故勒頓'),
         (895,'未來頓'),(896,'幻雪帕'),(897,'幻霧帕'),(802,'瑪夏多')],
    61: [(898,'雷冠王'),(785,'卡璞・鳴鳴'),(786,'卡璞・蝶蝶'),(787,'卡璞・哞哞'),
         (788,'卡璞・哩哩'),(483,'帝牙盧卡'),(484,'帕路奇亞'),(487,'騎拉帝納')],
    81: [(150,'超夢'),(249,'洛奇亞'),(250,'鳳王'),(384,'烈空坐'),
         (493,'阿爾宙斯'),(800,'奈克羅茲瑪'),(888,'蒼響'),(890,'無極汰那')],
}
_pool_keys = [13, 21, 41, 61, 81]
for _ki, _key in enumerate(_pool_keys):
    _next_key = _pool_keys[_ki + 1] if _ki + 1 < len(_pool_keys) else 100
    _pool_group = _HIGH_POOLS[_key]
    for _lv2 in range(_key, _next_key):
        _POOL[_lv2] = _pool_group
del _ki, _key, _next_key, _pool_group, _lv2, _pool_keys
_RARITY_CSS = {
    '可愛':'#ffb3ba','1星':'#ffd700','2星':'#ff8c00',
    '3星':'#00bfff','4星':'#9b59b6','5星':'#ff1493',
    '稀少':'#2ecc71','神話':'#ff6b35','傳奇':'#f39c12',
    '天耀':'#bdc3e7','神聖':'#ffffff',
    # lv 13-100 rarities
    '超傳說':'#00e5ff',
    '神域':  '#ff6e40',
    '創世':  '#e040fb',
    '永恆':  '#40c4ff',
    '無限':  '#ff4081',
    '區域之王': '#ffd700',  # Zone-special Pokémon — gold
}
_ZONE_MIN = [1,1,1, 4,4,4, 7,7,7,  18,21,24]
_ZONE_MAX = [2,3,3, 5,5,6, 10,15,20, 24,27,30]
_ZONE_LEN  = 120
_ROAD_W    = 20
_NUM_ZONES = 12
_PER_ZONE  = 5   # 每個區域最多幾隻

# ── Zone-special Pokémon (閃光, 115% of zone max income) ───────────────────
_ZONE_SPECIAL_DEFS = [
    (25,  '閃光・皮卡丘'),    # zone  0
    (6,   '閃光・噴火龍'),    # zone  1
    (9,   '閃光・水箭龜'),    # zone  2
    (149, '閃光・快龍'),      # zone  3
    (248, '閃光・班基拉斯'),  # zone  4
    (150, '閃光・超夢'),      # zone  5
    (382, '閃光・蓋歐卡'),    # zone  6
    (383, '閃光・固拉多'),    # zone  7
    (384, '閃光・烈空坐'),    # zone  8
    (493, '閃光・阿爾宙斯'),  # zone  9
    (888, '閃光・蒼響'),      # zone 10
    (890, '閃光・無極汰那'),  # zone 11
]
# Pre-compute special income = 115 % of each zone's max-level maxIncome
_ZONE_SPECIAL_INCOME = [
    int(_LEVELS[_ZONE_MAX[z] - 1][2] * 1.15)
    for z in range(len(_ZONE_MAX))
]

_world_pk    : dict = {}          # netId → pokemon_dict  (在地上的)
_carried_pk  : dict = {}          # netId → pokemon_dict  (被撿走的)
_pk_seq      : int  = 0
_zone_counts : list = [0] * _NUM_ZONES   # O(1) lookup instead of O(N) scan

# ── Gift boxes ─────────────────────────────────────────────────────────────────
_gift_boxes : dict = {}   # giftId → {giftId, x, z, zone}
_gift_seq   : int  = 0

_prize_milestone: int = 0  # floor(log10(prize_pool)) when last milestone fired
# Per-slot carry set — maintained at all pickup/drop/deposit/sell/disconnect sites.
# O(k) lookup in position handler (k ≤ carry capacity, usually ≤ 3) instead of
# scanning all of _carried_pk (O(N) over every pokemon held by any player).
_slot_carries: dict = defaultdict(set)   # slot → set of netId

_game_ended: bool = False          # 勝利條件觸發後只廣播一次
VICTORY_THRESHOLD = 1_000_000_000_000_000  # 1000T

_prize_pool: float = 0.0           # 彩票獎金池（所有玩家共享）


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


def _gen_pokemon_at_lv(zone_idx: int, lv: int) -> dict:
    """Like _gen_pokemon but with an explicit level (for rare events)."""
    global _pk_seq
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


def _gen_zone_special(zone_idx: int) -> dict:
    """Spawn a 閃光 zone-boss with income = 115 % of zone max-level maxIncome."""
    global _pk_seq
    poke_id, name = _ZONE_SPECIAL_DEFS[zone_idx]
    income  = _ZONE_SPECIAL_INCOME[zone_idx]
    z_far   = -((zone_idx + 1) * _ZONE_LEN)
    z_near  = -(zone_idx * _ZONE_LEN)
    x = round(random.uniform(-_ROAD_W/2 + 1, _ROAD_W/2 - 1), 2)
    z = round(random.uniform(z_far + 4, z_near - 4), 2)
    netId = _pk_seq; _pk_seq += 1
    return {
        'netId': netId, 'x': x, 'z': z, 'zone': zone_idx,
        'lv': _ZONE_MAX[zone_idx],
        'rarity': '區域之王', 'pokeId': poke_id,
        'name': name, 'income': income,
        'cssColor': '#ffd700',
    }


def _gen_gift_box(zone_idx: int) -> dict:
    """Spawn a gift box in zone_idx; returns the dict broadcast to clients."""
    global _gift_seq
    z_far  = -((zone_idx + 1) * _ZONE_LEN)
    z_near = -(zone_idx * _ZONE_LEN)
    x = round(random.uniform(-_ROAD_W/2 + 2, _ROAD_W/2 - 2), 2)
    z = round(random.uniform(z_far + 6, z_near - 6), 2)
    gid = _gift_seq; _gift_seq += 1
    return {'giftId': gid, 'x': x, 'z': z, 'zone': zone_idx}


def _calc_gift_reward(player_money: int, player_tickets: set, speed_level: int) -> dict:
    """
    Choose a random gift reward.
      50% — money: 25-40 % of current money (min $50_000)
      30% — free speed upgrade (or fallback money if maxed)
      20% — free lottery ticket
    """
    roll = random.random()

    if roll < 0.50:
        pct    = random.uniform(0.25, 0.40)
        amount = max(50_000, int(player_money * pct))
        return {'rewardType': 'money', 'amount': amount}

    elif roll < 0.80:
        # Speed upgrade — check if client reported max (10 levels)
        if speed_level >= 10:
            # Fallback: 30% of current money (no carry info needed)
            fallback = max(50_000, int(player_money * 0.30))
            return {'rewardType': 'speed_upgrade', 'alreadyMax': True,
                    'fallbackAmount': fallback}
        return {'rewardType': 'speed_upgrade', 'alreadyMax': False, 'fallbackAmount': 0}

    else:
        # Lottery ticket — pick a number not yet owned
        available = list(set(range(1, 89)) - player_tickets)
        if available:
            return {'rewardType': 'lottery_ticket', 'number': random.choice(available)}
        # Fallback to money if all 88 numbers owned (very unlikely)
        amount = max(50_000, int(player_money * 0.30))
        return {'rewardType': 'money', 'amount': amount}


# ── 禮包生成循環（每 3-5 分鐘在隨機區域投放 1 個禮包，最多 2 個同時存在）──────────
async def gift_spawn_loop() -> None:
    await asyncio.sleep(90)   # 給玩家 1.5 分鐘進場後再開始
    while not _game_ended:
        if not players or _game_ended:
            await asyncio.sleep(30)
            continue
        if len(_gift_boxes) < 2:
            # Choose a random zone that at least some players could reach
            zone = random.randint(0, _NUM_ZONES - 1)
            g = _gen_gift_box(zone)
            _gift_boxes[g['giftId']] = g
            await _broadcast({'type': 'gift_spawn', **g})
            print(f'[GIFT ] 🎁 禮包降臨 zone={zone}  giftId={g["giftId"]}  '
                  f'pos=({g["x"]}, {g["z"]})')
        wait = random.uniform(180, 300)   # 3-5 分鐘
        await asyncio.sleep(wait)


async def _check_prize_milestone() -> None:
    """Broadcast a milestone notification when the prize pool crosses a new order of magnitude."""
    global _prize_milestone
    if _prize_pool < 1000:
        return
    new_mag = int(math.log10(_prize_pool))
    if new_mag > _prize_milestone:
        _prize_milestone = new_mag
        milestone_val = int(10 ** new_mag)
        await _broadcast({
            'type':      'prize_pool_milestone',
            'pool':      int(_prize_pool),
            'milestone': milestone_val,
        })
        print(f'[LOTTO] 💰 獎金池里程碑！突破 ${milestone_val:,}')


def _count_zone(zone_idx: int) -> int:
    """O(1) — maintained by _zone_counts; no scan over _world_pk."""
    return _zone_counts[zone_idx]


# ── 寶可夢補充循環（只做週期補充；初始填充在 main() 同步完成）────────────────
async def pokemon_spawn_loop() -> None:
    while True:
        await asyncio.sleep(30)   # 每 30 秒補充一次
        for zone in range(_NUM_ZONES):
            while _count_zone(zone) < _PER_ZONE:
                p = _gen_pokemon(zone)
                _world_pk[p['netId']] = p
                _zone_counts[zone] += 1
                await _broadcast({'type': 'pokemon_spawn', **p})
                print(f'[POKE ] 補充 zone={zone} {p["name"]}')


# ── 閃光寶可夢全域事件（每 2 分鐘在隨機區域投放 2 隻該區閃光特殊寶可夢）──────────
async def rare_spawn_loop() -> None:
    await asyncio.sleep(120)   # 給玩家 2 分鐘準備再觸發首次事件
    while not _game_ended:
        if not players or _game_ended:
            await asyncio.sleep(30)
            continue
        # Spawn 2 zone-specific '閃光' Pokémon in random zones
        chosen_zones = random.sample(range(_NUM_ZONES), min(2, _NUM_ZONES))
        for zone in chosen_zones:
            p = _gen_zone_special(zone)
            _world_pk[p['netId']] = p
            _zone_counts[zone] += 1
            # 先廣播正常 spawn 讓客戶端建立 3D 模型，再廣播 rare_event 觸發橫幅+燈柱
            await _broadcast({'type': 'pokemon_spawn', **p})
            await _broadcast({
                'type':   'rare_event',
                'netId':  p['netId'],
                'x':      p['x'],
                'z':      p['z'],
                'name':   p['name'],
                'pokeId': p['pokeId'],
                'income': p['income'],
                'zone':   zone,
            })
            print(f'[RARE ] ★ {p["name"]} (閃光) 降臨 zone={zone}  income=${p["income"]:,}  netId={p["netId"]}')
        await asyncio.sleep(120)   # 下一次事件間隔 2 分鐘


# ── 黃金時刻循環（每 4 分鐘觸發一次，持續 45 秒，全隊收入 ×2.5）──────────────
async def golden_hour_loop() -> None:
    await asyncio.sleep(180)   # 首次觸發前給玩家 3 分鐘暖身
    while not _game_ended:
        if not players or _game_ended:
            await asyncio.sleep(30)
            continue
        await _broadcast({'type': 'golden_hour_start', 'duration': 45})
        print('[GOLD ] ⭐ 黃金時刻開始！×2.5 收入，持續 45 秒')
        await asyncio.sleep(45)
        if not _game_ended:
            await _broadcast({'type': 'golden_hour_end'})
            print('[GOLD ] 黃金時刻結束')
        await asyncio.sleep(195)   # 下一次黃金時刻間隔 ~3.25 分鐘


# ── 彩票開獎循環（每 3 分鐘開獎，無人中獎則獎金池累積）──────────────────────────
async def lottery_loop() -> None:
    """每 3 分鐘開獎一次，中獎者平分獎金池；無人中獎則滾入下一輪。"""
    global _prize_pool
    await asyncio.sleep(60)   # 讓玩家先進場再開始計時
    while not _game_ended:
        await asyncio.sleep(180)   # 3 分鐘
        if _game_ended:
            break

        drawn = random.randint(1, 88)
        pool_snap = int(_prize_pool)
        print(f'[LOTTO] ★ 開獎！號碼={drawn}  獎金池=${pool_snap:,}')

        # 找出中獎者
        winners = []
        for p in players.values():
            if drawn in p['tickets']:
                winners.append({'id': p['id'], 'name': p['name'], 'color': p['color']})

        if winners and pool_snap >= 1:
            share = int(_prize_pool / len(winners))
            _prize_pool = 0.0
            rollover = False
            winner_names = '、'.join(w['name'] for w in winners)
            print(f'[LOTTO] 中獎：{winner_names}  各獲 ${share:,}')
        else:
            share = 0
            rollover = True
            print(f'[LOTTO] 無人中獎，獎金池滾入下一輪 ${pool_snap:,}')

        # 重置本輪購票計數
        for p in players.values():
            p['tickets_this_draw'] = 0

        await _broadcast({
            'type':     'lottery_draw',
            'number':   drawn,
            'winners':  winners,
            'prize':    share,
            'pool':     int(_prize_pool),
            'rollover': rollover,
        })


# ── 勝利條件循環（每 5 秒檢查一次，避免在位置廣播中做額外計算）────────────────
async def victory_check_loop() -> None:
    global _game_ended
    while not _game_ended:
        await asyncio.sleep(5)
        if _game_ended or not players:
            continue
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
        next_wait = random.uniform(WAVE_SAFE_MIN, WAVE_SAFE_MAX)
        # Include nextWaveIn so clients can show a countdown
        await _broadcast({'type': 'wave_end', 'nextWaveIn': round(next_wait)})
        print(f'[WAVE ] 結束，下一波 {next_wait:.0f} 秒後')
        await asyncio.sleep(next_wait)


# ── WebSocket handler ─────────────────────────────────────────────────────────
async def handler(ws) -> None:
    global _prize_pool
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
        'baseSeats': [],    # 基地上的寶可夢狀態
        'tickets':          set(),  # 彩票號碼（1-88，終身累計）
        'tickets_this_draw': 0,     # 本輪已購張數（最多 3）
    }
    players[ws] = info

    # 歡迎訊息：含目前世界所有寶可夢
    others = [v for k, v in players.items() if k is not ws]
    # Serialize player info and others — exclude 'tickets' (set, not JSON-safe)
    def _clean(p):
        c = {k: v for k, v in p.items() if k != 'tickets'}
        c['ticketCount'] = len(p['tickets'])
        return c

    others_clean = [_clean(o) for o in others]
    await ws.send(json.dumps({
        'type': 'welcome',
        'player': _clean(info),
        'others': others_clean,
        'worldPokemons': list(_world_pk.values()),
        'prizePool': int(_prize_pool),
    }, ensure_ascii=False))

    info_clean = {k: v for k, v in info.items() if k != 'tickets'}
    info_clean['ticketCount'] = 0
    await _broadcast({'type': 'player_join', 'player': info_clean}, exclude=ws)
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
                info.update({
                    'x':         float(msg.get('x', 0)),
                    'z':         float(msg.get('z', 0)),
                    'rotY':      float(msg.get('rotY', 0)),
                    'sprinting': bool(msg.get('sprinting', False)),
                    'holding':   int(msg.get('holding', 0)),
                    'money':     int(msg.get('money', 0)),
                })
                # O(k) — look up only the netIds this slot is known to carry
                carried_list = [
                    {
                        'cssColor': _carried_pk[nid].get('cssColor', '#aaa'),
                        'rarity':   _carried_pk[nid].get('rarity', ''),
                        'pokeId':   _carried_pk[nid].get('pokeId', 0),
                    }
                    for nid in list(_slot_carries[slot])
                    if nid in _carried_pk
                ]
                await _broadcast({
                    'type': 'player_position', 'id': slot,
                    'x': info['x'], 'z': info['z'], 'rotY': info['rotY'],
                    'sprinting': info['sprinting'],
                    'holding': info['holding'], 'money': info['money'],
                    'carriedPokemon': carried_list,
                }, exclude=ws)

                # (victory check is handled by victory_check_loop — no per-frame work here)

            # ── 寶可夢：撿起 ──────────────────────────────────────────────────
            elif mtype == 'pokemon_pickup':
                netId = int(msg.get('netId', -1))
                p = _world_pk.pop(netId, None)
                if p:
                    _zone_counts[p['zone']] -= 1
                    p['carrier'] = slot
                    _carried_pk[netId] = p
                    _slot_carries[slot].add(netId)        # ← maintain cache
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
                    _slot_carries[slot].discard(netId)    # ← maintain cache
                    p['x'] = x; p['z'] = z
                    p.pop('carrier', None)
                    _world_pk[netId] = p
                    _zone_counts[p['zone']] += 1
                    await _broadcast({'type': 'pokemon_spawn', **p}, exclude=ws)

            # ── 寶可夢：存入基地 ──────────────────────────────────────────────
            elif mtype == 'pokemon_deposit':
                netId = int(msg.get('netId', -1))
                p = _carried_pk.pop(netId, None)
                _slot_carries[slot].discard(netId)        # ← maintain cache
                # 不回到世界，由 base_update 廣播視覺狀態
                # 立刻在同一區域補充一隻新寶可夢
                if p is not None:
                    zone = p.get('zone', 0)
                    new_p = _gen_pokemon(zone)
                    _world_pk[new_p['netId']] = new_p
                    _zone_counts[zone] += 1
                    await _broadcast({'type': 'pokemon_spawn', **new_p})

            # ── 寶可夢：賣出 ─────────────────────────────────────────────────
            elif mtype == 'pokemon_sell':
                netId = int(msg.get('netId', -1))
                world_p = _world_pk.pop(netId, None)   # usually None (pokemon was carried)
                if world_p: _zone_counts[world_p['zone']] -= 1
                _slot_carries[slot].discard(netId)        # ← maintain cache
                p = _carried_pk.pop(netId, None)
                # 立刻在同一區域補充一隻新寶可夢
                if p is not None:
                    zone = p.get('zone', 0)
                    new_p = _gen_pokemon(zone)
                    _world_pk[new_p['netId']] = new_p
                    _zone_counts[zone] += 1
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

            # ── 快捷語 ───────────────────────────────────────────────────────
            elif mtype == 'quick_chat':
                key = str(msg.get('key', ''))[:24]
                await _broadcast({
                    'type': 'quick_chat', 'id': slot,
                    'name': info['name'], 'color': info['color'], 'key': key,
                }, exclude=ws)

            # ── 改名 ─────────────────────────────────────────────────────────
            elif mtype == 'set_name':
                name = str(msg.get('name', '')).strip()[:12]
                if name:
                    info['name'] = name
                    await _broadcast(
                        {'type': 'player_name', 'id': slot, 'name': name},
                        exclude=ws,
                    )

            # ── 彩票：貢獻獎金池（被動收入 + 賣出各 30%）────────────────────────
            elif mtype == 'prize_contrib':
                amount = float(msg.get('amount', 0))
                if amount > 0:
                    _prize_pool += amount
                    await _broadcast({'type': 'prize_pool_update', 'pool': int(_prize_pool)})
                    await _check_prize_milestone()

            # ── 彩票：購買彩票（費用 = 目前金幣 × 10%）──────────────────────────
            elif mtype == 'buy_ticket':
                if info['tickets_this_draw'] >= 3:
                    await ws.send(json.dumps({'type': 'ticket_error',
                        'reason': 'limit', 'msg': '本輪已達購買上限（3 張）'},
                        ensure_ascii=False))
                else:
                    available = list(set(range(1, 89)) - info['tickets'])
                    if not available:
                        await ws.send(json.dumps({'type': 'ticket_error',
                            'reason': 'full', 'msg': '您已持有全部 88 個號碼！'},
                            ensure_ascii=False))
                    else:
                        number = random.choice(available)
                        info['tickets'].add(number)
                        info['tickets_this_draw'] += 1
                        cost = int(msg.get('cost', 0))
                        if cost > 0:
                            _prize_pool += cost
                        await ws.send(json.dumps({
                            'type': 'ticket_bought',
                            'number': number,
                            'ticketsThisDraw': info['tickets_this_draw'],
                            'pool': int(_prize_pool),
                        }, ensure_ascii=False))
                        await _broadcast({'type': 'prize_pool_update', 'pool': int(_prize_pool)}, exclude=ws)
                        await _check_prize_milestone()
                        print(f'[LOTTO] 玩家{slot+1} 購票 #{number}  本輪{info["tickets_this_draw"]}/3  池=${int(_prize_pool):,}')

            # ── 彩票：同步彩票號碼（重連時帶上已有號碼）──────────────────────────
            elif mtype == 'sync_tickets':
                numbers = msg.get('numbers', [])
                valid = {int(n) for n in numbers
                         if isinstance(n, (int, float)) and 1 <= int(n) <= 88}
                info['tickets'] = valid
                print(f'[LOTTO] 玩家{slot+1} 同步 {len(valid)} 張彩票')

            # ── 禮包：撿起 ────────────────────────────────────────────────────
            elif mtype == 'gift_pickup':
                gid = int(msg.get('giftId', -1))
                if _gift_boxes.pop(gid, None) is not None:
                    # Broadcast to others that this gift is gone from the world
                    await _broadcast({'type': 'gift_taken', 'giftId': gid}, exclude=ws)
                    print(f'[GIFT ] 礼包被撿 id={slot+1}  giftId={gid}')

            # ── 禮包：在商店開啟 ──────────────────────────────────────────────
            elif mtype == 'gift_open':
                gid          = int(msg.get('giftId', -1))
                player_money = int(msg.get('currentMoney', info.get('money', 0)))
                speed_level  = int(msg.get('speedLevel', 0))

                reward = _calc_gift_reward(player_money, info['tickets'], speed_level)
                print(f'[GIFT ] id={slot+1} 開禮包 reward={reward["rewardType"]}')

                # If lottery ticket: register server-side + attach pool snapshot
                if reward['rewardType'] == 'lottery_ticket':
                    info['tickets'].add(reward['number'])
                    reward['pool'] = int(_prize_pool)

                await ws.send(json.dumps({'type': 'gift_reward', **reward},
                                         ensure_ascii=False))

    except websockets.ConnectionClosed:
        pass
    except Exception as e:
        print(f'[ERR] id={slot}: {e}')
    finally:
        # 把該玩家持有的寶可夢還給世界（丟到路上）
        for netId in list(_slot_carries.pop(slot, set())):
            p = _carried_pk.pop(netId, None)
            if p is None:
                continue
            p['x'] = round(random.uniform(-3, 3), 2)
            p['z'] = round(random.uniform(-30, -5), 2)
            p.pop('carrier', None)
            _world_pk[netId] = p
            _zone_counts[p['zone']] += 1
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
        while _zone_counts[zone] < _PER_ZONE:
            p = _gen_pokemon(zone)
            _world_pk[p['netId']] = p
            _zone_counts[zone] += 1
    print(f'[POKE ] 初始生成 {len(_world_pk)} 隻寶可夢')

    threading.Thread(target=run_http, daemon=True).start()
    print(f'[WS   ] ws://localhost:{WS_PORT}')
    print('─' * 50)
    print('多人伺服器已啟動，等待玩家連線…（Ctrl-C 停止）')
    print('─' * 50)
    async with websockets.serve(handler, None, WS_PORT):
        asyncio.create_task(wave_loop())
        asyncio.create_task(pokemon_spawn_loop())
        asyncio.create_task(victory_check_loop())
        asyncio.create_task(rare_spawn_loop())
        asyncio.create_task(golden_hour_loop())
        asyncio.create_task(lottery_loop())
        asyncio.create_task(gift_spawn_loop())
        await asyncio.Future()


if __name__ == '__main__':
    asyncio.run(main())
