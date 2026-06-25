/**
 * farmModel.js — Pure game logic for the co-op "Shared Farm" 4×4 grid.
 *
 * No React. No Firebase. No IO. A `farm` is a thin container around 16 plotModel
 * gardens (a 4×4 row-major grid). EVERY per-tile rule — growth, guards, reducers —
 * delegates verbatim to src/game/plotModel.js; this file owns ONLY the grid shape,
 * the wire-map ↔ dense-array boundary, and the shared contextual tap ladder used
 * identically by the worker's 3D village field and the youth's 2D screen.
 *
 * STORAGE BOUNDARY (the load-bearing co-op detail)
 * ────────────────────────────────────────────────
 * On the wire (Firestore) `tiles` is a sparse MAP keyed by string index
 * ({ "0": garden, "3": garden, … }) so a per-tile field-path merge
 * (setDoc({ farm: { tiles: { [i]: tile } } }, { merge:true })) lets a worker
 * planting tile 3 and a youth fertilizing tile 7 in the same beat coexist
 * without clobbering — Firestore cannot index-path-merge an array.
 *
 * In the app `tiles` is a DENSE 16-element JS array (tiles[i] = a plotModel
 * garden, i = row*4 + col). normalizeFarm() is the ONLY boundary that bridges
 * the two shapes (wire map → dense array), and it is also the legacy-migration
 * and null-tolerance entry point.
 *
 * Contract: `role` is always the literal 'worker' | 'youth'. Reducers return
 * { farm, tile, index } so the caller can persist exactly ONE tile.
 */

import * as plot from './plotModel';
import {
  CROPS,
  STAGES,
  BOOST_MS,
  FERTILIZE_BOOST_MS,
  WATER_COOLDOWN_MS,
  FERTILIZE_COOLDOWN_MS,
  SEED_PRICE,
  CROP_REWARD,
  defaultGarden,
  remainingMs,
  formatRemaining,
} from './plotModel';
import * as animal from './animalModel';
import {
  ANIMALS,
  ANIMAL_ROSTER,
  ANIMAL_COUNT,
  ANIMAL_PRICE,
  ANIMAL_MAX,
  PRODUCE_REWARD,
  defaultAnimal,
} from './animalModel';

/* ── Grid shape & re-exports ───────────────────────────────────── */

/** Grid dimensions. Row-major, i = row*cols + col. */
export const GRID = { rows: 4, cols: 4, size: 16 };

/** Total tiles per farm. */
export const TILE_COUNT = 16;

/** Starting coins on a fresh farm — enough for ~2-3 first plants. */
export const STARTING_COINS = 30;

/**
 * Cosmetic decorations the shop can sell. Owned ids live in farm.decor[]. Cheap,
 * one-off, purely visual — they appear beside the field when bought.
 */
export const DECOR = {
  flowerPatch: { label: 'Flower patch', price: 25, emoji: '🌷' },
  extraTree: { label: 'Shade tree', price: 35, emoji: '🌳' },
};

// Convenience re-exports so UI layers import everything from farmModel.
export {
  CROPS,
  STAGES,
  BOOST_MS,
  FERTILIZE_BOOST_MS,
  WATER_COOLDOWN_MS,
  FERTILIZE_COOLDOWN_MS,
  SEED_PRICE,
  CROP_REWARD,
  remainingMs,
  formatRemaining,
} from './plotModel';

// Animal catalog re-exports — UI imports the animal model through farmModel too.
export {
  ANIMALS,
  ANIMAL_ROSTER,
  ANIMAL_COUNT,
  ANIMAL_PRICE,
  ANIMAL_MAX,
  PRODUCE_REWARD,
} from './animalModel';

/* ── Factory ───────────────────────────────────────────────────── */

/**
 * @returns {object} a fresh farm: 16 empty gardens + 3 hungry pens, no harvests
 * yet. Animals ride alongside tiles so legacy/null branches inherit them for free.
 */
export function defaultFarm() {
  return {
    v: 1,
    tiles: Array.from({ length: TILE_COUNT }, () => defaultGarden()),
    animals: ANIMAL_ROSTER.map((kind) => defaultAnimal(kind)),
    harvestCount: 0,
    coins: STARTING_COINS,
    counts: { crops: 0, eggs: 0, truffles: 0 },
    decor: [],
  };
}

/* ── Wire ↔ app normalization (the ONLY map↔array boundary) ────── */

/** True for a legacy single-plot garden map (pre-grid demo data). */
function isLegacyGarden(raw) {
  return Boolean(
    raw &&
      typeof raw === 'object' &&
      !raw.tiles &&
      ('crop' in raw || 'plantedAt' in raw)
  );
}

/**
 * normalizeFarm — coerce any inbound shape into a dense, always-16 farm.
 *
 * Handles three inputs:
 *   • v1 farm with a `tiles` MAP (wire) or ARRAY (already app-side) → dense 16.
 *   • legacy single `garden` map → defaultFarm() with that garden in tiles[0]
 *     (zero demo-data loss on migration).
 *   • null/undefined/garbage → defaultFarm().
 *
 * This is the single entry called by farmService.subscribeFarm,
 * VolunteerHome.profileToCase, and defensively inside every reducer below.
 *
 * @param {object|null} raw
 * @returns {object} dense farm
 */
export function normalizeFarm(raw) {
  if (!raw || typeof raw !== 'object') return defaultFarm();

  if (isLegacyGarden(raw)) {
    const farm = defaultFarm();
    farm.tiles[0] = { ...defaultGarden(), ...raw };
    return farm;
  }

  const src = raw.tiles;
  const tiles = Array.from({ length: TILE_COUNT }, (_, i) => {
    const t = Array.isArray(src) ? src[i] : src ? src[String(i)] : null;
    return t && typeof t === 'object' ? { ...defaultGarden(), ...t } : defaultGarden();
  });

  // Animals dense-bridge — DYNAMIC length (3..ANIMAL_MAX). The pinning rule flips
  // from "always roster" to "TRUST the stored kind when valid" so a bought pig at
  // index 3 survives normalize; falls back to the roster slot, then 'chicken'.
  const srcA = raw.animals;
  const storedLen = Array.isArray(srcA)
    ? srcA.length
    : srcA
    ? Object.keys(srcA).length
    : 0;
  const n = Math.min(ANIMAL_MAX, Math.max(ANIMAL_ROSTER.length, storedLen)); // 3..6
  const animals = Array.from({ length: n }, (_, i) => {
    const a = Array.isArray(srcA) ? srcA[i] : srcA ? srcA[String(i)] : null;
    const fallbackKind = ANIMAL_ROSTER[i] || 'chicken';
    const kind = a && ANIMALS[a.kind] ? a.kind : fallbackKind; // trust valid stored kind
    return a && typeof a === 'object'
      ? { ...defaultAnimal(kind), ...a, kind }
      : defaultAnimal(kind);
  });

  return {
    v: 1,
    tiles,
    animals,
    harvestCount: typeof raw.harvestCount === 'number' ? raw.harvestCount : 0,
    coins: typeof raw.coins === 'number' ? raw.coins : STARTING_COINS,
    counts: {
      crops: (raw.counts && raw.counts.crops) || 0,
      eggs: (raw.counts && raw.counts.eggs) || 0,
      truffles: (raw.counts && raw.counts.truffles) || 0,
    },
    decor: Array.isArray(raw.decor) ? raw.decor.filter((d) => DECOR[d]) : [],
  };
}

/* ── Tile accessor ─────────────────────────────────────────────── */

/**
 * tileAt — the garden at grid index i. Always returns a garden (defaultGarden()
 * for out-of-range), never throws.
 * @param {object} farm
 * @param {number} i
 * @returns {object} garden
 */
export function tileAt(farm, i) {
  if (!farm || !Array.isArray(farm.tiles)) return defaultGarden();
  const t = farm.tiles[i];
  return t || defaultGarden();
}

/* ── Per-tile derived (delegate to plotModel) ──────────────────── */

/** growthStage 0..4 for tile i. (UI treats an empty tile as -1 via tileView.) */
export function tileStage(farm, i, now) {
  return plot.growthStage(tileAt(farm, i), now);
}

/** growthProgress 0..1 for tile i. */
export function tileProgress(farm, i, now) {
  return plot.growthProgress(tileAt(farm, i), now);
}

/** isRipe for tile i. */
export function tileRipe(farm, i, now) {
  return plot.isRipe(tileAt(farm, i), now);
}

/** Milliseconds remaining until tile i ripens (0 if empty/ripe). */
export function tileRemainingMs(farm, i, now) {
  return plot.remainingMs(tileAt(farm, i), now);
}

/** 'm:ss' countdown label for tile i. */
export function tileRemainingLabel(farm, i, now) {
  return plot.formatRemaining(plot.remainingMs(tileAt(farm, i), now));
}

/* ── Per-tile guards (delegate to plotModel) ───────────────────── */

/** canPlant on tile i. */
export function canPlantTile(farm, i) {
  return plot.canPlant(tileAt(farm, i));
}

/** canWater on tile i for role. */
export function canWaterTile(farm, i, role, now) {
  return plot.canWater(tileAt(farm, i), role, now);
}

/** canFertilize on tile i for role (no turn-gate; short per-tile cooldown). */
export function canFertilizeTile(farm, i, role, now) {
  return plot.canFertilize(tileAt(farm, i), role, now);
}

/** canHarvest on tile i. */
export function canHarvestTile(farm, i, now) {
  return plot.canHarvest(tileAt(farm, i), now);
}

/* ── Per-tile reducers (pure: return { farm, tile, index }) ────── */

/** Replace tile i with `tile`, returning a NEW dense farm (never mutates). */
function withTile(farm, i, tile, harvestDelta) {
  const tiles = farm.tiles.slice();
  tiles[i] = tile;
  const harvestCount = (farm.harvestCount || 0) + (harvestDelta || 0);
  return { farm: { ...farm, tiles, harvestCount }, tile, index: i };
}

/**
 * withAnimal — replace animal i, returning a NEW dense farm plus the single animal
 * to persist. Mirrors withTile exactly: slices `animals`, splices i, applies the
 * same farm-wide harvestCount delta (collectAnimal passes 1, feedAnimal passes 0).
 */
function withAnimal(farm, i, animalMap, harvestDelta) {
  const animals = (Array.isArray(farm.animals) ? farm.animals : []).slice();
  animals[i] = animalMap;
  const harvestCount = (farm.harvestCount || 0) + (harvestDelta || 0);
  return { farm: { ...farm, animals, harvestCount }, animal: animalMap, index: i };
}

/**
 * plantTile — start `crop` on tile i. Deducts the seed price from the shared
 * wallet (folded into the returned farm) and returns `.spend` so the caller can
 * fire a race-safe coin decrement. Affordability is guarded by the UI/context
 * BEFORE calling. No deduction if the plant was a no-op (tile not empty / bad crop).
 *
 * @returns {{farm:object, tile:object, index:number, spend:number}}
 */
export function plantTile(farm, i, crop, role, now) {
  const f = normalizeFarm(farm);
  const before = tileAt(f, i);
  const tile = plot.plant(before, crop, role, now);
  const planted = tile.crop && tile.plantedAt && !before.crop; // actually planted?
  const spend = planted ? SEED_PRICE[crop] || 0 : 0;
  const res = withTile(f, i, tile, 0);
  if (spend) res.farm = { ...res.farm, coins: (res.farm.coins || 0) - spend };
  res.spend = spend;
  return res;
}

/** waterTile — water tile i (shaves BOOST_MS, passes the turn). */
export function waterTile(farm, i, role, now) {
  const f = normalizeFarm(farm);
  const tile = plot.water(tileAt(f, i), role, now);
  return withTile(f, i, tile, 0);
}

/** fertilizeTile — fertilize tile i (shaves FERTILIZE_BOOST_MS, passes the turn). */
export function fertilizeTile(farm, i, role, now) {
  const f = normalizeFarm(farm);
  const tile = plot.fertilize(tileAt(f, i), role, now);
  return withTile(f, i, tile, 0);
}

/**
 * harvestTile — collect a ripe tile i. Bumps the farm-wide harvestCount streak
 * iff the tile was actually harvestable, and EARNS coins + a crops tally. The
 * crop is read BEFORE plot.harvest wipes the tile. The earn is folded into the
 * returned farm (optimistic) AND surfaced as `.earn` so the caller can fire a
 * race-safe Firestore increment. No earn on a no-op.
 *
 * @returns {{farm:object, tile:object, index:number, earn:?{coins:number,crops:number}}}
 */
export function harvestTile(farm, i, role, now) {
  const f = normalizeFarm(farm);
  const before = tileAt(f, i);
  const ripe = plot.canHarvest(before, now);
  const crop = before.crop; // read before harvest wipes it
  const tile = plot.harvest(before, role, now);
  const res = withTile(f, i, tile, ripe ? 1 : 0);
  if (ripe) {
    const earn = { coins: CROP_REWARD[crop] || 0, crops: 1 };
    res.farm = {
      ...res.farm,
      coins: (res.farm.coins || 0) + earn.coins,
      counts: {
        ...res.farm.counts,
        crops: ((res.farm.counts && res.farm.counts.crops) || 0) + earn.crops,
      },
    };
    res.earn = earn;
  } else {
    res.earn = null;
  }
  return res;
}

/* ── Shared contextual tap ladder (worker + youth, identical) ──── */

/**
 * tapKind — what a single tap on tile i should DO, in FarmVille priority order:
 *   empty plot                → 'pick'      (caller opens the crop picker)
 *   ripe crop                 → 'harvest'
 *   growing & off cooldown    → 'fertilize' (the solo speed-up tap, EITHER role)
 *   growing & on cooldown     → 'growing'   (NEVER a dead tap — caller pops feedback)
 *   nothing available         → null
 *
 * 'water' has left the ladder (the waterTile reducer stays exported for back-compat).
 * The 'growing' sentinel is the load-bearing "it must never feel dead" fix: a tap on
 * a cooling crop returns 'growing' so the caller fires a '🌱 growing…' pop / shake
 * instead of a silent no-op.
 *
 * @returns {('pick'|'harvest'|'fertilize'|'growing'|null)}
 */
export function tapKind(farm, i, role, now) {
  const f = normalizeFarm(farm);
  if (canPlantTile(f, i)) return 'pick';
  if (canHarvestTile(f, i, now)) return 'harvest';
  if (canFertilizeTile(f, i, role, now)) return 'fertilize';
  const g = tileAt(f, i);
  if (g.crop && !plot.isRipe(g, now)) return 'growing'; // cooling down → feedback, not null
  return null;
}

/* ── Animal accessor + grid wrappers (delegate to animalModel) ─── */

/**
 * animalAt — the animal at pen slot i. Always returns an animal (kind pinned from
 * the fixed roster for out-of-range), never throws.
 * @param {object} farm
 * @param {number} i
 * @returns {object} animal
 */
export function animalAt(farm, i) {
  if (!farm || !Array.isArray(farm.animals)) {
    return defaultAnimal(ANIMAL_ROSTER[i] || 'chicken');
  }
  const a = farm.animals[i];
  if (a) return a;
  // Fallback kind: stored slot's kind if present, else roster, else chicken.
  const kind = (farm.animals[i] && farm.animals[i].kind) || ANIMAL_ROSTER[i] || 'chicken';
  return defaultAnimal(kind);
}

/* ── Per-animal guards (delegate to animalModel) ───────────────── */

/** canFeed on animal i. */
export function canFeedAnimal(farm, i) {
  return animal.canFeed(animalAt(farm, i));
}

/** canCollect on animal i. */
export function canCollectAnimal(farm, i, now) {
  return animal.canCollect(animalAt(farm, i), now);
}

/* ── Shared contextual animal-tap ladder (worker + youth) ──────── */

/**
 * animalTapKind — what a single tap on pen i should DO:
 *   ready to collect → 'collect'
 *   hungry           → 'feed'
 *   producing        → null
 *
 * @returns {('collect'|'feed'|null)}
 */
export function animalTapKind(farm, i, role, now) {
  const f = normalizeFarm(farm);
  if (canCollectAnimal(f, i, now)) return 'collect';
  if (canFeedAnimal(f, i)) return 'feed';
  return null;
}

/* ── Per-animal reducers (pure: return { farm, animal, index }) ── */

/**
 * feedAnimal — feed pen i, starting its produce timer. Returns the new farm plus
 * the single animal the caller should persist via saveAnimal. No harvestCount bump.
 */
export function feedAnimal(farm, i, role, now) {
  const f = normalizeFarm(farm);
  const a = animal.feed(animalAt(f, i), role, now);
  return withAnimal(f, i, a, 0);
}

/**
 * collectAnimal — gather ready pen i. Bumps the farm-wide harvestCount streak iff
 * the animal was actually collectable (so eggs/truffles feed the same "grown
 * together" co-op number as crops), resets the pen to hungry, and EARNS coins +
 * the matching produce tally (eggs|truffles). The earn folds into the returned
 * farm (optimistic) and is surfaced as `.earn` for a race-safe Firestore increment.
 *
 * @returns {{farm:object, animal:object, index:number, earn:?{coins:number,eggs?:number,truffles?:number}}}
 */
export function collectAnimal(farm, i, role, now) {
  const f = normalizeFarm(farm);
  const before = animalAt(f, i);
  const ready = animal.canCollect(before, now);
  const a = animal.collect(before, role, now);
  const res = withAnimal(f, i, a, ready ? 1 : 0);
  if (ready) {
    const produce = (ANIMALS[before.kind] || ANIMALS.chicken).produce; // 'egg' | 'truffle'
    const counter = produce === 'egg' ? 'eggs' : 'truffles';
    const earn = { coins: PRODUCE_REWARD[produce] || 0, [counter]: 1 };
    res.farm = {
      ...res.farm,
      coins: (res.farm.coins || 0) + earn.coins,
      counts: {
        ...res.farm.counts,
        [counter]: ((res.farm.counts && res.farm.counts[counter]) || 0) + 1,
      },
    };
    res.earn = earn;
  } else {
    res.earn = null;
  }
  return res;
}

/* ── Animal-level summary / HUD ─────────────────────────────────── */

/**
 * animalSummary — counts across all pens for the footer HUD.
 * @returns {{hungry:number,growing:number,ready:number,collected:number}}
 */
export function animalSummary(farm, now) {
  const f = normalizeFarm(farm);
  let hungry = 0;
  let growing = 0;
  let ready = 0;
  let collected = 0;
  for (let i = 0; i < f.animals.length; i++) {
    const a = animalAt(f, i);
    collected += a.collectCount || 0;
    if (!animal.isFed(a)) hungry++;
    else if (animal.isReady(a, now)) ready++;
    else growing++;
  }
  return { hungry, growing, ready, collected };
}

/* ── Shop / wallet (pure: guard balance, fold spend, return deltas) ── */

/**
 * farmWallet — normalized wallet + tallies for the HUD bar.
 * @returns {{coins:number, crops:number, eggs:number, truffles:number}}
 */
export function farmWallet(farm) {
  const f = normalizeFarm(farm);
  return {
    coins: f.coins || 0,
    crops: f.counts.crops || 0,
    eggs: f.counts.eggs || 0,
    truffles: f.counts.truffles || 0,
  };
}

/** animalCount — the live (dynamic) pen size, 3..ANIMAL_MAX. */
export function animalCount(farm) {
  return normalizeFarm(farm).animals.length;
}

/**
 * buyAnimalFarm — append a bought chicken/pig at the next pen index, deducting its
 * price from the shared wallet. Guards the cap (ANIMAL_MAX), affordability, and a
 * valid kind. The new animal persists via the existing per-index field-path merge
 * (saveAnimal). Returns the new index + `.spend` for a race-safe coin decrement.
 *
 * @returns {{farm:object, animal?:object, index?:number, spend?:number, ok:boolean}}
 */
export function buyAnimalFarm(farm, kind) {
  const f = normalizeFarm(farm);
  const price = ANIMAL_PRICE[kind];
  if (!ANIMALS[kind] || price == null) return { farm: f, ok: false };
  if (f.animals.length >= ANIMAL_MAX) return { farm: f, ok: false };
  if ((f.coins || 0) < price) return { farm: f, ok: false };
  const index = f.animals.length;
  const a = defaultAnimal(kind);
  const animals = f.animals.slice();
  animals[index] = a;
  return {
    farm: { ...f, animals, coins: (f.coins || 0) - price },
    animal: a,
    index,
    spend: price,
    ok: true,
  };
}

/**
 * buyDecorFarm — buy a cosmetic decoration, appending its id to farm.decor[] and
 * deducting its price. Guards a known id, no-duplicate, and affordability. Returns
 * the id + `.spend` for a race-safe coin decrement.
 *
 * @returns {{farm:object, decorId?:string, spend?:number, ok:boolean}}
 */
export function buyDecorFarm(farm, decorId) {
  const f = normalizeFarm(farm);
  const def = DECOR[decorId];
  if (!def) return { farm: f, ok: false };
  if (f.decor.includes(decorId)) return { farm: f, ok: false };
  if ((f.coins || 0) < def.price) return { farm: f, ok: false };
  return {
    farm: { ...f, decor: [...f.decor, decorId], coins: (f.coins || 0) - def.price },
    decorId,
    spend: def.price,
    ok: true,
  };
}

/* ── Shared animal-view (single shape RN→Canvas AND 2D consume) ── */

/**
 * animalView — the one plain-object projection of a pen that BOTH the 3D village
 * pen overlay and the 2D youth animal row render from. Plain props only (R3F
 * context can't cross the Canvas boundary), so this is computed in RN scope.
 *
 * @returns {{
 *   index:number, kind:('pig'|'chicken'), emoji:string, produceEmoji:string,
 *   color:string, hungry:boolean, fed:boolean, ready:boolean,
 *   progress:number, remainingMs:number, remainingLabel:string,
 *   collectCount:number, tapKind:('collect'|'feed'|null),
 *   can:{feed:boolean,collect:boolean}, boostKey:number
 * }}
 */
export function animalView(farm, i, role, now) {
  const f = normalizeFarm(farm);
  const a = animalAt(f, i);
  const def = ANIMALS[a.kind] || ANIMALS.chicken;
  const fed = animal.isFed(a);
  const ready = animal.isReady(a, now);
  const rem = animal.animalRemainingMs(a, now);

  const can = {
    feed: animal.canFeed(a),
    collect: animal.canCollect(a, now),
  };

  return {
    index: i,
    kind: a.kind,
    emoji: def.emoji,
    produceEmoji: def.produceEmoji,
    color: def.color,
    hungry: !fed,
    fed,
    ready,
    progress: animal.produceProgress(a, now),
    remainingMs: rem,
    remainingLabel: formatRemaining(rem),
    collectCount: a.collectCount || 0,
    tapKind: animalTapKind(f, i, role, now),
    can,
    // Drives the 3D feed-flash, mirror of a tile's boostKey (lastActorAt).
    boostKey: a.lastActorAt || 0,
  };
}

/* ── Shared tile-view (single shape RN→Canvas AND 2D consume) ──── */

/**
 * tileView — the one plain-object projection of a tile that BOTH the 3D village
 * overlay and the 2D youth grid render from. Plain props only (R3F context can't
 * cross the Canvas boundary), so this is computed in RN scope and passed down.
 *
 * @returns {{
 *   index:number, garden:object, crop:(string|null),
 *   stage:number, progress:number, ripe:boolean, empty:boolean,
 *   remainingMs:number, remainingLabel:string,
 *   color:(string|null), emoji:string,
 *   can:{plant:boolean,water:boolean,fertilize:boolean,harvest:boolean},
 *   kind:(string|null), yourTurn:boolean
 * }}
 */
export function tileView(farm, i, role, now) {
  const f = normalizeFarm(farm);
  const garden = tileAt(f, i);
  const empty = !garden.crop;
  const def = (garden.crop && CROPS[garden.crop]) || null;
  const ripe = plot.isRipe(garden, now);
  const rawStage = plot.growthStage(garden, now);
  const stage = empty ? -1 : rawStage;
  const rem = plot.remainingMs(garden, now);

  const can = {
    plant: plot.canPlant(garden),
    water: plot.canWater(garden, role, now),
    fertilize: plot.canFertilize(garden, role, now),
    harvest: plot.canHarvest(garden, now),
  };

  return {
    index: i,
    garden,
    crop: garden.crop || null,
    stage,
    progress: plot.growthProgress(garden, now),
    ripe,
    empty,
    remainingMs: rem,
    remainingLabel: plot.formatRemaining(rem),
    color: def ? def.color : null,
    emoji: def ? def.emoji[rawStage] : '',
    can,
    // 'pick' | 'harvest' | 'fertilize' | 'growing' | null
    kind: tapKind(f, i, role, now),
    // "your turn" = you can speed this crop up right now (fertilize off cooldown).
    yourTurn: can.fertilize,
  };
}

/* ── Farm-level summary / HUD ───────────────────────────────────── */

/**
 * farmSummary — counts across the whole grid for the footer HUD.
 * @returns {{planted:number,growing:number,ripe:number,empty:number,harvestCount:number}}
 */
export function farmSummary(farm, now) {
  const f = normalizeFarm(farm);
  let planted = 0;
  let growing = 0;
  let ripe = 0;
  let empty = 0;
  for (let i = 0; i < TILE_COUNT; i++) {
    const g = f.tiles[i];
    if (!g || !g.crop) {
      empty++;
      continue;
    }
    planted++;
    if (plot.isRipe(g, now)) ripe++;
    else growing++;
  }
  return { planted, growing, ripe, empty, harvestCount: f.harvestCount || 0 };
}

/**
 * farmStatus — one-line HUD summary string for either side.
 * Prioritizes the most actionable beat: ripe to harvest > growing > all bare.
 *
 * @param {object} farm
 * @param {string} role       'worker' | 'youth'
 * @param {string} youthName
 * @param {number} [now]
 * @returns {string}
 */
export function farmStatus(farm, role, youthName, now) {
  const f = normalizeFarm(farm);
  const s = farmSummary(f, now);
  const me = role === 'worker' ? 'worker' : 'youth';
  const name = (youthName && String(youthName).trim()) || 'your friend';

  if (s.ripe > 0) {
    return `${s.ripe} ready to harvest 🌾`;
  }
  if (s.planted === 0) {
    return me === 'worker'
      ? `${name}'s field is bare — plant something together 🌱`
      : 'Your field is bare — plant a seed 🌱';
  }
  if (s.growing > 0) {
    return `${s.growing} growing · ${s.empty} plots open 🌿`;
  }
  return `Field full — ${s.harvestCount} grown together 🌻`;
}
