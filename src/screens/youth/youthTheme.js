/**
 * youthTheme.js
 *
 * Youth-portal design tokens (Bondee-style: soft pastels, clay surfaces) plus
 * the `youthHouseConfig` schema. Kept separate from the core `theme.js` so the
 * worker/volunteer side stays untouched.
 *
 * WORKER PARITY: `youthHouseConfig` is the exact template object that will pipe
 * into the worker's village map later. `toWorkerHouseConfig()` documents the
 * 1:1 mapping onto the volunteer-side house schema fields (houseType/roofColor/
 * wallColor/windowIntensity) without importing it (keeps the portals isolated).
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
};

export const HOUSE_STYLES = [
  { key: 'cottage', label: 'Cottage' },
  { key: 'aframe', label: 'Modern A-Frame' },
  { key: 'cyberglass', label: 'Cyber-Glass Box' },
];

export const COLOR_THEMES = {
  'Pastel Mint': { wall: '#B8F2E6', roof: '#7FD1C1', accent: '#5FBCAA' },
  'Soft Lavender': { wall: '#D9CCF5', roof: '#B6A4E8', accent: '#9B86DA' },
  'Amber Wood': { wall: '#F6D6A8', roof: '#C98A4B', accent: '#A96E33' },
};
export const COLOR_THEME_NAMES = Object.keys(COLOR_THEMES);

// The local configuration state object the customizer binds to.
export const defaultYouthHouseConfig = {
  houseStyle: 'cottage',
  colorTheme: 'Pastel Mint',
  windowIntensity: 0.5, // 0..1.5 emissive
};

/** Map youthHouseConfig -> the volunteer-side house schema shape (future use). */
export function toWorkerHouseConfig(cfg) {
  const theme = COLOR_THEMES[cfg.colorTheme] ?? COLOR_THEMES['Pastel Mint'];
  return {
    houseType: cfg.houseStyle === 'aframe' ? 'townhouse' : cfg.houseStyle === 'cyberglass' ? 'cabin' : 'cottage',
    roofColor: theme.roof,
    wallColor: theme.wall,
    windowEmission: pastel.glow,
    windowIntensity: cfg.windowIntensity,
  };
}

export const youthRadius = { sm: 14, md: 20, lg: 28, xl: 36, pill: 999 };
