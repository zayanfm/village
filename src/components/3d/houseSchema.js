/**
 * houseSchema.js
 *
 * The single source of truth for a tiny house's appearance. Every structural /
 * cosmetic property a house can have is declared here as a schema field with a
 * default and a description.
 *
 * FUTURE-PROOFING
 * ---------------
 * When the youth-facing app is built, a youth's profile edits map 1:1 onto
 * these fields and pipe straight into <TinyHouseNode config={...} /> — changing
 * how their home looks on the volunteer's viewer with no other code changes.
 *
 * Nothing here references external mesh files: the house is generated entirely
 * from primitives + these parameters (procedural, code-driven).
 */

export const HOUSE_TYPES = ['cottage', 'townhouse', 'cabin'];

// field -> { default, type, description, [min,max] for numerics }
export const HouseConfigSchema = {
  houseType: { default: 'cottage', type: 'enum', options: HOUSE_TYPES, description: 'Silhouette / proportions' },
  roofColor: { default: '#38B2AC', type: 'color', description: 'Roof material color' },
  wallColor: { default: '#F2EAD8', type: 'color', description: 'Wall / body color' },
  trimColor: { default: '#3B2A1A', type: 'color', description: 'Door & trim color' },
  heightScale: { default: 1.0, type: 'number', min: 0.6, max: 1.8, description: 'Vertical scale of the walls' },
  windowEmission: { default: '#FFD27A', type: 'color', description: 'Window light color' },
  windowIntensity: { default: 0.15, type: 'number', min: 0, max: 1.5, description: 'Base window glow' },
  hasUpdate: { default: false, type: 'boolean', description: 'Pulse the window when a case update lands' },
};

// Per-type base geometry. heightScale is applied on top of these at render time.
export const HOUSE_TYPE_GEOMETRY = {
  cottage: { w: 1.0, h: 0.7, d: 1.0, roofH: 0.55, roofSeg: 4, chimney: false },
  townhouse: { w: 0.85, h: 1.2, d: 0.85, roofH: 0.4, roofSeg: 4, chimney: false },
  cabin: { w: 1.15, h: 0.6, d: 0.95, roofH: 0.5, roofSeg: 4, chimney: true },
};

/** Merge a partial profile (e.g. from a youth edit) over schema defaults. */
export function resolveHouseConfig(partial = {}) {
  const out = {};
  for (const key of Object.keys(HouseConfigSchema)) {
    out[key] = partial[key] !== undefined ? partial[key] : HouseConfigSchema[key].default;
  }
  return out;
}

export function geometryFor(houseType) {
  return HOUSE_TYPE_GEOMETRY[houseType] ?? HOUSE_TYPE_GEOMETRY.cottage;
}
