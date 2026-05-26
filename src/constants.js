// Game constants

export const ROAD_WIDTH = 10;
export const ROAD_SEGMENT_LENGTH = 30;
export const NUM_ZONES = 9;
export const ZONE_LENGTH = ROAD_SEGMENT_LENGTH * 4; // 120 per zone

// ── Tier system ───────────────────────────────────────────────────────────
export const ZONES_PER_TIER    = 3;
export const TIER_COUNT        = 3;
export const TIER_UNLOCK_COST  = [0, 5_000_000, 5_000_000_000]; // 5M / 5B (付費解鎖)
export const TIER_NAMES        = ['低階', '中階', '高階'];
export const TIER_COLORS_HEX   = [0x4CAF50, 0xFF8F00, 0xE53935];
export const TIER_CSS_COLORS   = ['#4CAF50', '#FF8F00', '#E53935'];

// ── Tsunami wave settings ─────────────────────────────────────────────────
export const WAVE_CYCLE  = 45;   // seconds between waves
export const WAVE_WARN   = 8;    // seconds of warning before wave spawns
// Wave active end: stop BEFORE the base area (Pokémon zones only)
// distance ≈ 1065 units ÷ speed 53 ≈ 20 s active duration
export const WAVE_ACTIVE_END_Z = -10;
export const WAVE_TYPES  = [
  { label: '快速', color: 0xFF8F00, cssColor: '#FF8F00', speed: 53, textColor: '#fff' },
  { label: '巨浪', color: 0x1565C0, cssColor: '#1976D2', speed: 53, textColor: '#fff' },
];

// ── Player movement ───────────────────────────────────────────────────────
export const PLAYER_BASE_SPEED  = 6;
export const PLAYER_SPRINT_MULT = 1.6;

// ── Speed / Grip upgrade costs (10 levels; ≈×4 per level) ────────────────
// Index = current level → cost to reach (level+1)
export const SPEED_UPGRADE_COSTS = [
  50_000, 200_000, 800_000, 3_000_000, 10_000_000,       // Lv 1-5
  40_000_000, 150_000_000, 600_000_000,                   // Lv 6-8
  2_000_000_000, 8_000_000_000,                           // Lv 9-10
];
export const GRIP_UPGRADE_COSTS  = [
  50_000, 200_000, 800_000, 3_000_000, 10_000_000,
  40_000_000, 150_000_000, 600_000_000,
  2_000_000_000, 8_000_000_000,
];
export const MAX_SPEED_LEVEL = 10;
export const MAX_GRIP_LEVEL  = 10;

// ── Carry (fixed at 1, no upgrade) ───────────────────────────────────────
export const CARRY_CAPACITY = 1;

// ── Misc timers ───────────────────────────────────────────────────────────
export const POKEMON_REFRESH_INTERVAL = 5 * 60;
export const AUTO_SAVE_INTERVAL       = 6 * 60;

// ── Pokémon level income — v17 ×2 boost across all tiers ─────────────────
//   Low tier  (lv 1-3): full base ~60K-640K/s
//   Mid tier  (lv 4-6): full base ~10M-640M/s
//   High tier (lv7-12): ~320M to ~6.4T /s — prestige grind
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

// ── Zone Pokémon level range (min / max inclusive) ────────────────────────
// Low tier zones 0-2: lv 1-3
// Mid tier zones 3-5: lv 4-6
// High tier zones 6-8: lv 7-12
export const ZONE_MIN_LEVEL = [1, 1, 1,  4, 4, 4,  7,  7,  7];
export const ZONE_MAX_LEVEL = [2, 3, 3,  5, 5, 6,  8, 10, 12];

// ── Rarity accent colors ──────────────────────────────────────────────────
export const RARITY_COLORS = {
  '可愛': 0xFFB3BA,
  '1星':  0xFFD700,
  '2星':  0xFF8C00,
  '3星':  0x00BFFF,
  '4星':  0x9B59B6,
  '5星':  0xFF1493,
  '稀少': 0x2ECC71,
  '神話': 0xFF6B35,
  '傳奇': 0xF39C12,
  '天耀': 0xBDC3E7,
  '神聖': 0xFFFFFF,
};

export const RARITY_CSS = {
  '可愛': '#ffb3ba',
  '1星':  '#ffd700',
  '2星':  '#ff8c00',
  '3星':  '#00bfff',
  '4星':  '#9b59b6',
  '5星':  '#ff1493',
  '稀少': '#2ecc71',
  '神話': '#ff6b35',
  '傳奇': '#f39c12',
  '天耀': '#bdc3e7',
  '神聖': '#ffffff',
};

// ── PokeAPI artwork base ──────────────────────────────────────────────────
export const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/';

// ── Pokémon pool per level ────────────────────────────────────────────────
export const POKEMON_POOL = {
  1:  [
    { id: 172, name: '皮丘' }, { id: 175, name: '波波' },
    { id: 173, name: '小仙子' }, { id: 174, name: '胖丁寶寶' },
    { id: 298, name: '瑪力露' },
  ],
  2:  [
    { id: 25,  name: '皮卡丘' }, { id: 133, name: '伊布' },
    { id: 39,  name: '胖丁' },   { id: 52,  name: '喵喵' },
    { id: 54,  name: '可達鴨' },
  ],
  3:  [
    { id: 1,   name: '妙蛙種子' }, { id: 4,  name: '小火龍' },
    { id: 7,   name: '傑尼龜' },   { id: 37, name: '六尾' },
    { id: 58,  name: '卡蒂狗' },
  ],
  4:  [
    { id: 6,   name: '噴火龍' }, { id: 9,   name: '水箭龜' },
    { id: 3,   name: '妙蛙花' }, { id: 59,  name: '風速狗' },
    { id: 26,  name: '雷丘' },
  ],
  5:  [
    { id: 149, name: '快龍' },   { id: 131, name: '拉普拉斯' },
    { id: 143, name: '卡比獸' }, { id: 130, name: '暴鯉龍' },
  ],
  6:  [
    { id: 94,  name: '耿鬼' },  { id: 68, name: '怪力' },
    { id: 65,  name: '胡地' },  { id: 123, name: '飛天螳螂' },
  ],
  7:  [
    { id: 132, name: '百變怪' }, { id: 137, name: '多邦尼' },
    { id: 106, name: '飛腿郎' }, { id: 107, name: '快拳郎' },
  ],
  8:  [
    { id: 125, name: '電擊獸' }, { id: 126, name: '鴨嘴火獸' },
    { id: 127, name: '大鍬形蟲' }, { id: 128, name: '肯泰羅' },
  ],
  9:  [
    { id: 151, name: '夢幻' },   { id: 251, name: '時拉比' },
    { id: 385, name: '基拉祈' }, { id: 490, name: '瑪納霏' },
  ],
  10: [
    { id: 150, name: '超夢' }, { id: 144, name: '急凍鳥' },
    { id: 145, name: '閃電鳥' }, { id: 146, name: '火焰鳥' },
  ],
  11: [
    { id: 249, name: '洛奇亞' }, { id: 250, name: '鳳王' },
    { id: 384, name: '烈空坐' }, { id: 644, name: '雷電雲' },
  ],
  12: [
    { id: 493, name: '阿爾宙斯' }, { id: 718, name: '基格爾德' },
    { id: 791, name: '索爾迦雷歐' }, { id: 792, name: '露奈雅拉' },
  ],
};

// ── Base layout ───────────────────────────────────────────────────────────
export const BASE_SEATS_PER_FLOOR = 16;
