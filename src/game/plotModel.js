/**
 * plotModel.js — Pure game logic for the co-op "Shared Plot" farming feature.
 *
 * No React. No Firebase. No IO. Just deterministic math over a plain `garden`
 * map so BOTH devices (worker + youth) compute identical growth from wall-clock
 * timestamps with zero network round-trips.
 *
 * A `garden` lives at youth_profiles/{firestoreId}.garden — see gardenService.js
 * for the Firebase boundary and PlotContext.js for the live wiring. This file is
 * the ONLY place demo-speed constants are set.
 *
 * Contract: `role` is always the literal 'worker' or 'youth'. The UI calls a
 * `can*` guard, then the matching reducer (plant/water/fertilize/harvest), which
 * returns a NEW garden map (never mutates), then persists it via the service.
 */

/* ── Tunable constants ─────────────────────────────────────────── */

/** Crop catalog. `emoji[stage]` is the sprite for growthStage 0..4. */
export const CROPS = {
  tomato: {
    label: 'Tomato',
    growMs: 120000,
    emoji: ['🟤', '🌱', '🌿', '🍃', '🍅'],
    color: '#E5604D',
  },
  sunflower: {
    label: 'Sunflower',
    growMs: 150000,
    emoji: ['🟤', '🌱', '🌿', '🌼', '🌻'],
    color: '#F4B740',
  },
  pumpkin: {
    label: 'Pumpkin',
    growMs: 180000,
    emoji: ['🟤', '🌱', '🌿', '🍂', '🎃'],
    color: '#E08A2E',
  },
};

/** Each watering shaves this much real time off the remaining grow duration. */
export const BOOST_MS = 15000;

/**
 * Each fertilize shaves this much real time off — the worker's signature
 * accelerant, deliberately ~3× a watering so a fertilize visibly lurches the
 * crop forward a stage. This is the "worker fertilizes → it speeds up" beat.
 */
export const FERTILIZE_BOOST_MS = 45000;

/** Per-side water cooldown (demo-fast). KEPT for back-compat; water is no longer in the tap ladder. */
export const WATER_COOLDOWN_MS = 20000;

/**
 * Per-tile fertilize cooldown (the SOLO-flow speed-up tap). Short on purpose so a
 * tap on a growing crop almost always fertilizes; only a rapid re-tap within this
 * window is gated — and the UI surfaces a 'growing…' nudge instead of a dead tap.
 * Either role may fertilize; we attribute lastActor for flavor but do NOT gate on it.
 */
export const FERTILIZE_COOLDOWN_MS = 5000;

/** Coins it costs to plant each crop's seed. Shown in the crop picker; deducted on plant. */
export const SEED_PRICE = { tomato: 8, sunflower: 10, pumpkin: 14 };

/** Coins earned when a crop is harvested (slower crops pay more). */
export const CROP_REWARD = { tomato: 12, sunflower: 16, pumpkin: 22 };

/** Number of growth stages: 0=mound, 1=sprout, 2=leafy, 3=budding, 4=ripe. */
export const STAGES = 5;

/* ── Helpers (module-private) ──────────────────────────────────── */

function nowOr(now) {
  return typeof now === 'number' ? now : Date.now();
}

function cropDef(crop) {
  return (crop && CROPS[crop]) || null;
}

/** Pretty crop name for status copy, e.g. 'sunflower'. */
function cropWord(garden) {
  const def = cropDef(garden && garden.crop);
  return def ? def.label.toLowerCase() : 'plant';
}

function rand(role) {
  // Defensive: only 'worker' / 'youth' are valid; anything else is treated as
  // a distinct actor so guards stay safe rather than throwing.
  return role === 'worker' ? 'worker' : role === 'youth' ? 'youth' : role || null;
}

/* ── Factory ───────────────────────────────────────────────────── */

/** @returns {object} a fresh, empty garden map. */
export function defaultGarden() {
  return {
    crop: null,
    plantedAt: null,
    plantedBy: null,
    growMs: 0,
    waterBoosts: 0,
    fertBoosts: 0,
    wateredAt: null,
    wateredBy: null,
    fertilizedAt: null,
    fertilizedBy: null,
    lastActor: null,
    lastActorAt: null,
    harvested: false,
    harvestCount: 0,
  };
}

/* ── Growth math ───────────────────────────────────────────────── */

/**
 * Effective total grow time after water boosts (never below one stage's worth
 * so a crop can't be force-skipped to instant-ripe by spamming water).
 */
function effectiveGrowMs(garden) {
  if (!garden || !garden.crop) return 0;
  const base = garden.growMs || (cropDef(garden.crop) ? cropDef(garden.crop).growMs : 0);
  const boosted =
    base -
    (garden.waterBoosts || 0) * BOOST_MS -
    (garden.fertBoosts || 0) * FERTILIZE_BOOST_MS;
  const floor = base / STAGES; // can't ripen faster than one stage's nominal time
  return Math.max(floor, boosted);
}

/**
 * growthProgress — fraction grown, 0..1.
 * @param {object} garden
 * @param {number} [now]
 * @returns {number}
 */
export function growthProgress(garden, now) {
  if (!garden || !garden.crop || !garden.plantedAt) return 0;
  const total = effectiveGrowMs(garden);
  if (total <= 0) return 1;
  const elapsed = nowOr(now) - garden.plantedAt;
  if (elapsed <= 0) return 0;
  return Math.min(1, elapsed / total);
}

/**
 * growthStage — integer 0..4.
 * @param {object} garden
 * @param {number} [now]
 * @returns {number}
 */
export function growthStage(garden, now) {
  if (!garden || !garden.crop || !garden.plantedAt) return 0;
  const p = growthProgress(garden, now);
  // Map [0,1] across STAGES buckets, clamped to the final stage index.
  const stage = Math.floor(p * STAGES);
  return Math.min(STAGES - 1, Math.max(0, stage));
}

/**
 * isRipe — true once the crop has reached the final stage.
 * @returns {boolean}
 */
export function isRipe(garden, now) {
  if (!garden || !garden.crop) return false;
  return growthStage(garden, now) === STAGES - 1;
}

/**
 * remainingMs — real milliseconds left until this crop ripens.
 *
 * Reuses the same private effectiveGrowMs() the growth math runs on, so every
 * water/fertilize boost (which shrinks effectiveGrowMs) flows into the countdown
 * for free — a fertilize visibly lurches the timer forward. Returns 0 for an
 * empty plot or an already-ripe crop.
 *
 * @param {object} garden
 * @param {number} [now]
 * @returns {number} ms remaining, clamped at 0
 */
export function remainingMs(garden, now) {
  if (!garden || !garden.crop || !garden.plantedAt) return 0;
  if (isRipe(garden, now)) return 0;
  const total = effectiveGrowMs(garden);
  return Math.max(0, total - (nowOr(now) - garden.plantedAt));
}

/**
 * formatRemaining — render a millisecond duration as a 'm:ss' countdown chip.
 * Ceils to the next whole second so a fresh plant reads its full time, never 0.
 *
 * @param {number} ms
 * @returns {string} e.g. '2:00'
 */
export function formatRemaining(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ── Action guards ─────────────────────────────────────────────── */

/** canPlant — true when the plot is empty. */
export function canPlant(garden) {
  return Boolean(garden) && garden.crop == null;
}

/**
 * canWater — needs a growing (not ripe) crop and this side off cooldown.
 * Cooldown is per-side: only blocks if THIS role watered recently.
 */
export function canWater(garden, role, now) {
  if (!garden || !garden.crop) return false;
  if (isRipe(garden, now)) return false;
  const me = rand(role);
  if (garden.wateredBy === me && garden.wateredAt != null) {
    if (nowOr(now) - garden.wateredAt < WATER_COOLDOWN_MS) return false;
  }
  return true;
}

/**
 * canFertilize — the SOLO-flow speed-up guard. NO reciprocity turn-gate: EITHER
 * role may fertilize a growing (planted, not-ripe, not-harvested) crop, blocked
 * only by a short per-tile FERTILIZE_COOLDOWN_MS so a rapid re-tap is paced. The
 * `role` arg is accepted for signature stability (attributed as lastActor in the
 * reducer) but is intentionally NOT used to gate.
 */
export function canFertilize(garden, role, now) {
  if (!garden || !garden.crop) return false;
  if (garden.harvested || isRipe(garden, now)) return false;
  if (
    garden.fertilizedAt != null &&
    nowOr(now) - garden.fertilizedAt < FERTILIZE_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}

/**
 * fertilizeCooldownRemaining — ms left on this tile's fertilize cooldown (0 when
 * off cooldown / empty / ripe). For optional "growing… 0:0x" feedback copy.
 */
export function fertilizeCooldownRemaining(garden, now) {
  if (!garden || !garden.crop || garden.fertilizedAt == null) return 0;
  if (garden.harvested || isRipe(garden, now)) return 0;
  return Math.max(0, FERTILIZE_COOLDOWN_MS - (nowOr(now) - garden.fertilizedAt));
}

/** canHarvest — true once ripe and not yet harvested. (Convenience guard.) */
export function canHarvest(garden, now) {
  if (!garden || !garden.crop) return false;
  if (garden.harvested) return false;
  return isRipe(garden, now);
}

/* ── Reducers (pure: return a NEW garden, never mutate) ────────── */

/**
 * plant — start a crop on an empty plot. Sets lastActor to the planter so the
 * partner's fertilize unlocks immediately ("their turn").
 */
export function plant(garden, crop, role, now) {
  const base = garden || defaultGarden();
  if (!canPlant(base)) return base;
  const def = cropDef(crop);
  if (!def) return base;
  const t = nowOr(now);
  const me = rand(role);
  return {
    ...base,
    crop,
    plantedAt: t,
    plantedBy: me,
    growMs: def.growMs,
    waterBoosts: 0,
    fertBoosts: 0,
    wateredAt: null,
    wateredBy: null,
    fertilizedAt: null,
    fertilizedBy: null,
    lastActor: me,
    lastActorAt: t,
    harvested: false,
  };
}

/**
 * water — add a boost (shaves BOOST_MS), record this side's cooldown, and pass
 * the turn. Idempotently safe: returns garden unchanged if not allowed.
 */
export function water(garden, role, now) {
  const base = garden || defaultGarden();
  if (!canWater(base, role, now)) return base;
  const t = nowOr(now);
  const me = rand(role);
  return {
    ...base,
    waterBoosts: (base.waterBoosts || 0) + 1,
    wateredAt: t,
    wateredBy: me,
    lastActor: me,
    lastActorAt: t,
  };
}

/**
 * fertilize — applies a FERTILIZE_BOOST_MS surge (a big, visible stage lurch —
 * ~3× a watering) and attributes lastActor for flavor. The SOLO-flow "speed it
 * up" tap: valid for EITHER role on any growing crop off the short per-tile
 * cooldown (see canFertilize — no turn-gate).
 */
export function fertilize(garden, role, now) {
  const base = garden || defaultGarden();
  if (!canFertilize(base, role, now)) return base;
  const t = nowOr(now);
  const me = rand(role);
  return {
    ...base,
    fertBoosts: (base.fertBoosts || 0) + 1,
    fertilizedAt: t,
    fertilizedBy: me,
    lastActor: me,
    lastActorAt: t,
  };
}

/**
 * harvest — collect a ripe crop, bump the lifetime streak, and reset the plot
 * to plantable. Preserves harvestCount across the wipe.
 */
export function harvest(garden, role, now) {
  const base = garden || defaultGarden();
  if (!canHarvest(base, now)) return base;
  const fresh = defaultGarden();
  return {
    ...fresh,
    harvestCount: (base.harvestCount || 0) + 1,
    harvested: true,
  };
}

/* ── Reciprocity copy ──────────────────────────────────────────── */

/**
 * tendStatus — a human-readable reciprocity line for the plot header.
 * Frames every state as a cozy back-and-forth volley, e.g.
 *   "Maya watered your sunflower · your turn 🌻"
 *
 * @param {object} garden
 * @param {string} role        'worker' | 'youth'
 * @param {string} youthName   display name used when the youth acted last
 * @param {number} [now]
 * @returns {string}
 */
export function tendStatus(garden, role, youthName, now) {
  const me = rand(role);
  const name = (youthName && String(youthName).trim()) || 'your friend';

  if (!garden || !garden.crop) {
    return me === 'worker'
      ? `${name}'s plot is bare — plant something together 🌱`
      : 'Your plot is bare — plant a seed 🌱';
  }

  const word = cropWord(garden);
  const def = cropDef(garden.crop);
  const tip = def ? def.emoji[STAGES - 1] : '🌱';

  if (canHarvest(garden, now)) {
    return `The ${word} is ripe — harvest it! ${tip}`;
  }

  const last = garden.lastActor;
  // Who is referred to in the third person depends on the viewer.
  const themLabel = me === 'worker' ? name : 'your worker';

  // Build a verb phrase for the most recent tending actions.
  const watered = garden.wateredAt != null;
  const fertilized = garden.fertilizedAt != null;
  let verb = 'tended';
  if (watered && fertilized) verb = 'watered & fertilized';
  else if (fertilized) verb = 'fertilized';
  else if (watered) verb = 'watered';
  else verb = 'planted';

  if (!last) {
    return `A young ${word} is growing ${tip}`;
  }

  if (last === me) {
    // I acted last → I'm waiting on the other side.
    const possessive = me === 'worker' ? `${name}'s` : 'your';
    if (verb === 'planted') {
      return me === 'worker'
        ? `You started a ${word} for ${name} · their turn ${tip}`
        : `You planted a ${word} · their turn ${tip}`;
    }
    return `You ${verb} ${possessive} ${word} · their turn ${tip}`;
  }

  // The other side acted last → it's my turn.
  const subject = me === 'worker' ? name : themLabel;
  const possessive = me === 'worker' ? 'your' : 'your';
  if (verb === 'planted') {
    return `${subject} started a ${word} · your turn ${tip}`;
  }
  return `${subject} ${verb} ${possessive} ${word} · your turn ${tip}`;
}
