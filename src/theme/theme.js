/**
 * theme.js
 * Central design tokens for the UniGarden prototype.
 *
 * Visual language: organic, living, "flowy". Deep forest + teal gradients,
 * soft glassmorphic surfaces, glowing botanical accents. Strictly natural /
 * botanical metaphors only.
 */

export const palette = {
  // Deep environment tones (background depth layers)
  forestNight: '#06140F',
  forestDeep: '#0B2027',
  forestMoss: '#12302A',
  pineShadow: '#0E3B33',

  // Teals & greens (primary brand)
  teal: '#2C7A7B',
  tealBright: '#38B2AC',
  mint: '#6EE7B7',
  mintSoft: '#A7F3D0',

  // Botanical flower accents
  amber: '#F6AD55',
  amberGlow: '#FBD38D',
  violet: '#B794F4',
  violetGlow: '#D6BCFA',
  iridescent: '#5EEAD4',

  // Neutrals / text
  white: '#FFFFFF',
  cloud: '#E6FFFA',
  fog: 'rgba(230, 255, 250, 0.65)',
  ink: '#04110D',

  // Risk matrix gradient stops (low -> high)
  riskLow: '#48BB78',
  riskMid: '#F6E05E',
  riskHighMid: '#F6AD55',
  riskHigh: '#F56565',
};

// Reusable glassmorphism surface tokens
export const glass = {
  fill: 'rgba(255, 255, 255, 0.10)',
  fillStrong: 'rgba(255, 255, 255, 0.16)',
  border: 'rgba(255, 255, 255, 0.22)',
  highlight: 'rgba(255, 255, 255, 0.35)',
  shadow: 'rgba(0, 0, 0, 0.45)',
};

export const gradients = {
  // Organic green/teal environment wash
  environment: ['#06140F', '#0B2027', '#12302A', '#0E3B33'],
  // Glowing leaf / center action
  leaf: ['#6EE7B7', '#38B2AC', '#2C7A7B'],
  // Card overlay sheen
  glassSheen: ['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.04)'],
  amberFlower: ['#FBD38D', '#F6AD55', '#DD6B20'],
  violetFlower: ['#D6BCFA', '#B794F4', '#805AD5'],
  tealFlower: ['#A7F3D0', '#5EEAD4', '#2C7A7B'],
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 26,
  xl: 34,
  pill: 999,
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 36,
};

export const typography = {
  display: { fontSize: 30, fontWeight: '800', letterSpacing: 0.3, color: palette.white },
  title: { fontSize: 22, fontWeight: '700', color: palette.white },
  heading: { fontSize: 18, fontWeight: '700', color: palette.cloud },
  body: { fontSize: 15, fontWeight: '500', color: palette.cloud },
  caption: { fontSize: 12.5, fontWeight: '600', color: palette.fog, letterSpacing: 0.4 },
};

export default { palette, glass, gradients, radius, spacing, typography };
