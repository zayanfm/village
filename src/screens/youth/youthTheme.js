/**
 * youthTheme.js
 *
 * Youth-portal design tokens (Bondee-style: soft pastels, clay surfaces) plus
 * the expanded `youthHouseConfig` schema. Kept separate from core theme.js so
 * the worker/volunteer side stays untouched.
 *
 * WORKER PARITY: `youthHouseConfig` is the template object that pipes into the
 * worker's village map later. `toWorkerHouseConfig()` documents the mapping
 * onto the volunteer-side house schema without importing it (keeps portals
 * isolated).
 */

export const pastel = {
  mint: '#B8F2E6',
  mintDeep: '#7FD1C1',
  lavender: '#D9CCF5',
  lavenderDeep: '#B6A4E8',
  amber: '#F6D6A8',
  amberDeep: '#C98A4B',
  cream: '#FFF6EC',
  blush: '#F7C9D9',
  sky: '#CDEDF6',
  clay: '#EAD9C7',
  clayDeep: '#D8BfA3',
  cork: '#C89B6A',
  corkDark: '#A67A4D',
  ink: '#4A3F55',
  sub: '#8A7F95',
  white: '#FFFFFF',
  glow: '#FFE3A3',
  neon: '#65F0E0',
};

// Three distinct architectural archetypes.
export const HOUSE_STYLES = [
  { key: 'village', label: 'Village House' },
  { key: 'mansion', label: 'Modern Mansion' },
  { key: 'futuristic', label: 'Futuristic Studio' },
];

// Wall / body palettes.
export const COLOR_THEMES = {
  'Pastel Mint': { wall: '#B8F2E6', roof: '#7FD1C1', accent: '#5FBCAA' },
  'Soft Lavender': { wall: '#D9CCF5', roof: '#B6A4E8', accent: '#9B86DA' },
  'Amber Wood': { wall: '#F6D6A8', roof: '#C98A4B', accent: '#A96E33' },
};
export const COLOR_THEME_NAMES = Object.keys(COLOR_THEMES);

// Roof material presets — color + PBR feel stands in for a baked texture.
export const ROOF_STYLES = {
  Thatch: { color: '#C9A24B', roughness: 1.0, metalness: 0.0 },
  'Terracotta Tiles': { color: '#C8502E', roughness: 0.8, metalness: 0.0 },
  Slate: { color: '#4A5560', roughness: 0.55, metalness: 0.12 },
  'Solar Metal': { color: '#2B3A55', roughness: 0.22, metalness: 0.85 },
};
export const ROOF_STYLE_NAMES = Object.keys(ROOF_STYLES);

// Window emissive color picker options.
export const WINDOW_COLORS = ['#FFE3A3', '#B8F2E6', '#D9CCF5', '#CDEDF6', '#F7C9D9', '#FFFFFF'];

// Toggleable peripheral plot props.
export const GARDEN_PROPS = [
  { key: 'flowers', label: '🌸 Flowers' },
  { key: 'lamps', label: '🏮 Lamps' },
  { key: 'pond', label: '💧 Pond' },
];

// The local configuration state object the customizer binds to.
export const defaultYouthHouseConfig = {
  houseStyle: 'village',
  colorTheme: 'Pastel Mint',
  roofStyle: 'Terracotta Tiles',
  windowColor: '#FFE3A3',
  windowIntensity: 0.6, // 0..1.5 emissive
  props: { flowers: true, lamps: false, pond: false },
};

/** Map youthHouseConfig -> the volunteer-side house schema shape (future use). */
export function toWorkerHouseConfig(cfg) {
  const theme = COLOR_THEMES[cfg.colorTheme] ?? COLOR_THEMES['Pastel Mint'];
  const roof = ROOF_STYLES[cfg.roofStyle] ?? ROOF_STYLES['Terracotta Tiles'];
  return {
    houseType: cfg.houseStyle === 'mansion' ? 'townhouse' : cfg.houseStyle === 'futuristic' ? 'cabin' : 'cottage',
    roofColor: roof.color,
    wallColor: theme.wall,
    windowEmission: cfg.windowColor,
    windowIntensity: cfg.windowIntensity,
  };
}

export const youthRadius = { sm: 14, md: 20, lg: 28, xl: 36, pill: 999 };
