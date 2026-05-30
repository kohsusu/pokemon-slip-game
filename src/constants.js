// Game constants — v21
// Changes: TIER_COUNT 3→4 (頂階, 5000B unlock), NUM_ZONES 9→12,
//          lv 100 removed, zone-special '閃光' Pokémon added,
//          Pokémon pools expanded (lv 1-12: 8 per level),
//          lv 13-99 HIGH_POOLS expanded to 8 per group, '區域之王' rarity added.

export const ROAD_WIDTH = 20;
export const ROAD_SEGMENT_LENGTH = 30;
export const NUM_ZONES = 12;
export const ZONE_LENGTH = ROAD_SEGMENT_LENGTH * 4; // 120 per zone

// ── Tier system ───────────────────────────────────────────────────────────
export const ZONES_PER_TIER    = 3;
export const TIER_COUNT        = 4;
export const TIER_UNLOCK_COST  = [0, 5_000_000, 5_000_000_000, 5_000_000_000_000]; // 5M / 5B / 5000B
export const TIER_NAMES        = ['低階', '中階', '高階', '頂階'];
export const TIER_COLORS_HEX   = [0x4CAF50, 0xFF8F00, 0xE53935, 0x9C27B0];
export const TIER_CSS_COLORS   = ['#4CAF50', '#FF8F00', '#E53935', '#9C27B0'];

// ── Tsunami wave settings ─────────────────────────────────────────────────
export const WAVE_CYCLE  = 45;
export const WAVE_WARN   = 8;
export const WAVE_ACTIVE_END_Z = -10;
export const WAVE_TYPES  = [
  { label: '快速', color: 0xFF8F00, cssColor: '#FF8F00', speed: 53, textColor: '#fff' },
  { label: '巨浪', color: 0x1565C0, cssColor: '#1976D2', speed: 53, textColor: '#fff' },
];

// ── Player movement ───────────────────────────────────────────────────────
export const PLAYER_BASE_SPEED  = 6;
export const PLAYER_SPRINT_MULT = 1.6;

// ── Speed upgrade costs ───────────────────────────────────────────────────
export const SPEED_UPGRADE_COSTS = [
  50_000, 200_000, 800_000, 3_000_000, 10_000_000,
  40_000_000, 150_000_000, 600_000_000,
  2_000_000_000, 8_000_000_000,
];
export const MAX_SPEED_LEVEL = 10;

// ── Magnet (pickup range) upgrade ─────────────────────────────────────────
export const MAGNET_UPGRADE_COSTS = [
  50_000, 200_000, 800_000, 3_000_000, 10_000_000,
  40_000_000, 150_000_000, 600_000_000,
  2_000_000_000, 8_000_000_000,
];
export const MAX_MAGNET_LEVEL    = 10;
export const MAGNET_BASE_RANGE   = 2.8;
export const MAGNET_RANGE_PER_LV = 0.7;

// ── Carry capacity (fixed; no longer upgradeable) ────────────────────────
export const CARRY_CAPACITY = 3;

// ── Misc timers ───────────────────────────────────────────────────────────
export const POKEMON_REFRESH_INTERVAL = 5 * 60;
export const AUTO_SAVE_INTERVAL       = 6 * 60;

// ── Pokémon level income table (lv 1-12 explicit) ────────────────────────
//   Lv 13-99 appended programmatically by _addHighTierData() below.
export const POKEMON_LEVELS = [
  { lv: 1,  rarity: '可愛', minIncome: 200,               maxIncome: 2_000 },
  { lv: 2,  rarity: '1星',  minIncome: 1_000,             maxIncome: 10_000 },
  { lv: 3,  rarity: '2星',  minIncome: 4_000,             maxIncome: 40_000 },
  { lv: 4,  rarity: '3星',  minIncome: 200_000,           maxIncome: 2_000_000 },
  { lv: 5,  rarity: '4星',  minIncome: 1_000_000,         maxIncome: 10_000_000 },
  { lv: 6,  rarity: '5星',  minIncome: 4_000_000,         maxIncome: 40_000_000 },
  { lv: 7,  rarity: '稀少', minIncome: 20_000_000,        maxIncome: 200_000_000 },
  { lv: 8,  rarity: '稀少', minIncome: 100_000_000,       maxIncome: 1_000_000_000 },
  { lv: 9,  rarity: '神話', minIncome: 400_000_000,       maxIncome: 4_000_000_000 },
  { lv: 10, rarity: '傳奇', minIncome: 2_000_000_000,     maxIncome: 20_000_000_000 },
  { lv: 11, rarity: '天耀', minIncome: 10_000_000_000,    maxIncome: 100_000_000_000 },
  { lv: 12, rarity: '神聖', minIncome: 40_000_000_000,    maxIncome: 400_000_000_000 },
];

// ── Zone level ranges (12 zones: 4 tiers × 3 zones each) ─────────────────
//   Tier 0 (低階)  zones 0-2  : lv  1-3   (unlock: free)
//   Tier 1 (中階)  zones 3-5  : lv  4-6   (unlock: 5M)
//   Tier 2 (高階)  zones 6-8  : lv  7-20  (unlock: 5B)
//   Tier 3 (頂階)  zones 9-11 : lv 18-30  (unlock: 5000B)
export const ZONE_MIN_LEVEL = [1,1,1,  4,4,4,  7,7,7,   18,21,24];
export const ZONE_MAX_LEVEL = [2,3,3,  5,5,6,  10,15,20, 24,27,30];

// ── Rarity accent colors ──────────────────────────────────────────────────
export const RARITY_COLORS = {
  '可愛': 0xFFB3BA, '1星':  0xFFD700, '2星':  0xFF8C00,
  '3星':  0x00BFFF, '4星':  0x9B59B6, '5星':  0xFF1493,
  '稀少': 0x2ECC71, '神話': 0xFF6B35, '傳奇': 0xF39C12,
  '天耀': 0xBDC3E7, '神聖': 0xFFFFFF,
  '超傳說': 0x00E5FF, '神域':  0xFF6E40, '創世':  0xE040FB,
  '永恆':   0x40C4FF, '無限':  0xFF4081,
  '區域之王': 0xFFD700,  // Zone-special Pokémon — shining gold
};

export const RARITY_CSS = {
  '可愛': '#ffb3ba', '1星':  '#ffd700', '2星':  '#ff8c00',
  '3星':  '#00bfff', '4星':  '#9b59b6', '5星':  '#ff1493',
  '稀少': '#2ecc71', '神話': '#ff6b35', '傳奇': '#f39c12',
  '天耀': '#bdc3e7', '神聖': '#ffffff',
  '超傳說': '#00e5ff', '神域':  '#ff6e40', '創世':  '#e040fb',
  '永恆':   '#40c4ff', '無限':  '#ff4081',
  '區域之王': '#ffd700',  // Zone-special Pokémon — shining gold
};

// ── PokeAPI artwork base ──────────────────────────────────────────────────
export const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';

// ── Pokémon pool per level (lv 1-12 explicit, 8 per level) ───────────────
//   Lv 13-99 pools appended by _addHighTierData() below.
export const POKEMON_POOL = {
  1: [
    { id: 172, name: '皮丘' },     { id: 175, name: '波波' },
    { id: 173, name: '小仙子' },   { id: 174, name: '胖丁寶寶' },
    { id: 298, name: '瑪力露' },   { id: 440, name: '幸福蛋' },
    { id: 446, name: '小卡比獸' }, { id: 238, name: '溜冰小子' },
  ],
  2: [
    { id: 25,  name: '皮卡丘' },  { id: 133, name: '伊布' },
    { id: 39,  name: '胖丁' },    { id: 52,  name: '喵喵' },
    { id: 54,  name: '可達鴨' },  { id: 35,  name: '比比' },
    { id: 79,  name: '呆呆獸' },  { id: 447, name: '波路路' },
  ],
  3: [
    { id: 1,   name: '妙蛙種子' }, { id: 4,   name: '小火龍' },
    { id: 7,   name: '傑尼龜' },   { id: 37,  name: '六尾' },
    { id: 58,  name: '卡蒂狗' },   { id: 147, name: '迷你龍' },
    { id: 38,  name: '九尾' },     { id: 77,  name: '小火馬' },
  ],
  4: [
    { id: 6,   name: '噴火龍' },   { id: 9,   name: '水箭龜' },
    { id: 3,   name: '妙蛙花' },   { id: 59,  name: '風速狗' },
    { id: 26,  name: '雷丘' },     { id: 134, name: '水伊布' },
    { id: 135, name: '雷伊布' },   { id: 196, name: '太陽伊布' },
  ],
  5: [
    { id: 149, name: '快龍' },     { id: 131, name: '拉普拉斯' },
    { id: 143, name: '卡比獸' },   { id: 130, name: '暴鯉龍' },
    { id: 136, name: '火伊布' },   { id: 197, name: '月亮伊布' },
    { id: 448, name: '盧卡利歐' }, { id: 470, name: '葉伊布' },
  ],
  6: [
    { id: 94,  name: '耿鬼' },     { id: 68,  name: '怪力' },
    { id: 65,  name: '胡地' },     { id: 123, name: '飛天螳螂' },
    { id: 248, name: '班基拉斯' }, { id: 373, name: '暴飛龍' },
    { id: 445, name: '烈咬陸鯊' }, { id: 376, name: '超甲狂蟹' },
  ],
  7: [
    { id: 132, name: '百變怪' },   { id: 137, name: '多邦尼' },
    { id: 106, name: '飛腿郎' },   { id: 107, name: '快拳郎' },
    { id: 141, name: '化石鎧甲' }, { id: 142, name: '化石翼龍' },
    { id: 243, name: '雷公' },     { id: 244, name: '炎帝' },
  ],
  8: [
    { id: 125, name: '電擊獸' },   { id: 126, name: '鴨嘴火獸' },
    { id: 127, name: '大鍬形蟲' }, { id: 128, name: '肯泰羅' },
    { id: 245, name: '水君' },     { id: 462, name: '磁怪' },
    { id: 472, name: '格鬥蠍' },   { id: 229, name: '黑炎帝' },
  ],
  9: [
    { id: 151, name: '夢幻' },     { id: 251, name: '時拉比' },
    { id: 385, name: '基拉祈' },   { id: 490, name: '瑪納霏' },
    { id: 380, name: '拉帝亞斯' }, { id: 381, name: '拉帝歐斯' },
    { id: 382, name: '蓋歐卡' },   { id: 383, name: '固拉多' },
  ],
  10: [
    { id: 150, name: '超夢' },     { id: 144, name: '急凍鳥' },
    { id: 145, name: '閃電鳥' },   { id: 146, name: '火焰鳥' },
    { id: 249, name: '洛奇亞' },   { id: 250, name: '鳳王' },
    { id: 384, name: '烈空坐' },   { id: 643, name: '萊希拉姆' },
  ],
  11: [
    { id: 483, name: '帝牙盧卡' }, { id: 484, name: '帕路奇亞' },
    { id: 487, name: '騎拉帝納' }, { id: 644, name: '捷克羅姆' },
    { id: 716, name: '哲爾尼亞斯' }, { id: 717, name: '伊維爾塔爾' },
    { id: 888, name: '蒼響' },     { id: 889, name: '藏瑪然特' },
  ],
  12: [
    { id: 493, name: '阿爾宙斯' }, { id: 718, name: '基格爾德' },
    { id: 791, name: '索爾迦雷歐' }, { id: 792, name: '露奈雅拉' },
    { id: 800, name: '奈克羅茲瑪' }, { id: 890, name: '無極汰那' },
    { id: 898, name: '雷冠王' },   { id: 645, name: '土地雲' },
  ],
};

// ── Zone special Pokémon (閃光 — one per zone, income = zone max ×1.15) ───
//   Populated by _addHighTierData() below after income table is complete.
export const ZONE_SPECIAL_POKEMON = [];

// ── Base layout ───────────────────────────────────────────────────────────
export const BASE_SEATS_PER_FLOOR = 16;

// ── Auto-generate high-tier data (lv 13-99) ──────────────────────────────
//   Income scaling: each level = prev × 1.5 (from lv-12 base of 400B max).
//   lv 20 max ≈ 10T  |  lv 27 max ≈ 175T  |  lv 30 max ≈ 591T
;(function _addHighTierData() {
  const HIGH_RARITIES = [
    [13, 20, '超傳說'],
    [21, 40, '神域'],
    [41, 60, '創世'],
    [61, 80, '永恆'],
    [81, 99, '無限'],
  ];

  // ── Level income table ────────────────────────────────────────────────
  let maxInc = 400_000_000_000; // lv 12 maxIncome = 400B
  for (let lv = 13; lv <= 99; lv++) {
    maxInc = Math.round(maxInc * 1.5);
    const minInc = Math.round(maxInc / 4);
    const [,, rar] = HIGH_RARITIES.find(([f, t]) => lv >= f && lv <= t);
    POKEMON_LEVELS.push({ lv, rarity: rar, minIncome: minInc, maxIncome: maxInc });
  }

  // ── Pokémon pool groups (8 per group) ────────────────────────────────
  const HIGH_POOLS = {
    // lv 13-20: Sinnoh creation + lake trio + mythicals
    13: [
      { id: 483, name: '帝牙盧卡' }, { id: 484, name: '帕路奇亞' },
      { id: 487, name: '騎拉帝納' }, { id: 480, name: '由克希' },
      { id: 481, name: '艾姆利多' }, { id: 488, name: '剋拉索拉' },
      { id: 491, name: '達克萊伊' }, { id: 492, name: '謝米' },
    ],
    // lv 21-40: Unova + Kalos + Forces of Nature
    21: [
      { id: 643, name: '萊希拉姆' },   { id: 646, name: '酋雷姆' },
      { id: 716, name: '哲爾尼亞斯' }, { id: 717, name: '伊維爾塔爾' },
      { id: 800, name: '奈克羅茲瑪' }, { id: 641, name: '龍捲雲' },
      { id: 642, name: '雷電雲' },     { id: 645, name: '土地雲' },
    ],
    // lv 41-60: Galar core + Glastrier/Spectrier + Marshadow
    41: [
      { id: 888, name: '蒼響' },       { id: 889, name: '藏瑪然特' },
      { id: 890, name: '無極汰那' },   { id: 894, name: '故勒頓' },
      { id: 895, name: '未來頓' },     { id: 896, name: '幻雪帕' },
      { id: 897, name: '幻霧帕' },     { id: 802, name: '瑪夏多' },
    ],
    // lv 61-80: Calyrex + Tapu guardians + Forces of Nature
    61: [
      { id: 898, name: '雷冠王' },     { id: 785, name: '卡璞・鳴鳴' },
      { id: 786, name: '卡璞・蝶蝶' }, { id: 787, name: '卡璞・哞哞' },
      { id: 788, name: '卡璞・哩哩' }, { id: 483, name: '帝牙盧卡' },
      { id: 484, name: '帕路奇亞' },   { id: 487, name: '騎拉帝納' },
    ],
    // lv 81-99: All-time top legends — max tier before zone-special
    81: [
      { id: 150, name: '超夢' },       { id: 249, name: '洛奇亞' },
      { id: 250, name: '鳳王' },       { id: 384, name: '烈空坐' },
      { id: 493, name: '阿爾宙斯' },   { id: 800, name: '奈克羅茲瑪' },
      { id: 888, name: '蒼響' },       { id: 890, name: '無極汰那' },
    ],
  };

  const poolKeys = [13, 21, 41, 61, 81];
  poolKeys.forEach((key, ki) => {
    const nextKey = poolKeys[ki + 1] ?? 100;
    const pool    = HIGH_POOLS[key];
    for (let lv = key; lv < nextKey; lv++) POKEMON_POOL[lv] = pool;
  });

  // ── Zone special Pokémon ─────────────────────────────────────────────
  //   One '閃光' Pokémon per zone. Income = 115% of that zone's max-level
  //   maxIncome. These replace the old lv-100 rare events.
  const ZONE_BOSS_DEFS = [
    { zone:  0, pokeId:  25, name: '閃光・皮卡丘'    },
    { zone:  1, pokeId:   6, name: '閃光・噴火龍'    },
    { zone:  2, pokeId:   9, name: '閃光・水箭龜'    },
    { zone:  3, pokeId: 149, name: '閃光・快龍'      },
    { zone:  4, pokeId: 248, name: '閃光・班基拉斯'  },
    { zone:  5, pokeId: 150, name: '閃光・超夢'      },
    { zone:  6, pokeId: 382, name: '閃光・蓋歐卡'    },
    { zone:  7, pokeId: 383, name: '閃光・固拉多'    },
    { zone:  8, pokeId: 384, name: '閃光・烈空坐'    },
    { zone:  9, pokeId: 493, name: '閃光・阿爾宙斯'  },
    { zone: 10, pokeId: 888, name: '閃光・蒼響'      },
    { zone: 11, pokeId: 890, name: '閃光・無極汰那'  },
  ];
  ZONE_BOSS_DEFS.forEach(({ zone, pokeId, name }) => {
    const maxLv     = ZONE_MAX_LEVEL[zone];
    const maxIncome = POKEMON_LEVELS[maxLv - 1].maxIncome;
    const income    = Math.round(maxIncome * 1.15);
    ZONE_SPECIAL_POKEMON.push({
      zone, pokeId, name, income,
      rarity:   '區域之王',
      cssColor: RARITY_CSS['區域之王'],
    });
  });
})();
