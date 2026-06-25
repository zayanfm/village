/**
 * farmService.js — Firebase boundary for the co-op "Shared Farm" 4×4 grid layer.
 *
 * SCHEMA
 * ──────
 * youth_profiles/{firestoreId}.farm   ← a single map field on the existing youth doc
 *   {
 *     v: 1,
 *     tiles: { "0": <garden>, "3": <garden>, … },   // sparse MAP keyed by string index
 *     harvestCount: <number>,                        // farm-wide lifetime streak
 *   }
 *
 * Each `<garden>` is a plotModel garden map verbatim (crop, plantedAt, plantedBy,
 * growMs, waterBoosts, fertBoosts, wateredAt/By, fertilizedAt/By, lastActor/At,
 * harvested, harvestCount).
 *
 * The farm rides the youth's existing root profile doc so the worker village's
 * already-live `subscribeYouthProfiles` snapshot sees crop growth for free, while
 * the youth side adds one thin single-doc listener (`subscribeFarm`).
 *
 * THE LOAD-BEARING CO-OP DETAIL
 * ─────────────────────────────
 * `tiles` is a MAP (not an array) ON THE WIRE precisely so a single tile can be
 * written with a field-path merge: setDoc({ farm: { tiles: { [i]: tile } } }, { merge:true }).
 * Firestore deep-merges nested maps, so a worker writing tile 3 and a youth writing
 * tile 7 in the same beat coexist without clobbering. Firestore CANNOT index-path-merge
 * an array, which is why the wire shape is a map and farmModel.normalizeFarm() is the
 * only place that bridges map ↔ dense array.
 *
 * This module is the ONLY place that touches Firestore for the farm. It computes
 * NO game logic — callers run the pure reducers in src/game/farmModel.js and hand us
 * the resulting tile (or whole farm) to persist. Every write guards on `isConfigured()`
 * and a truthy `firestoreId`, returning false/null instead of throwing — mirroring the
 * offline/no-config tolerance of gardenService / subscribeYouthProfiles.
 */

import { doc, onSnapshot, setDoc, increment } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { isConfigured, withTimeout } from './firestoreService';
import { normalizeFarm } from '../game/farmModel';

const YOUTH_PROFILES = 'youth_profiles';

/**
 * Persist a SINGLE tile via a field-path merge — the co-op write path.
 *
 * setDoc({ farm: { tiles: { [index]: tile } } }, { merge:true }) deep-merges so this
 * write touches ONLY farm.tiles.{index} and leaves every other tile (and harvestCount)
 * untouched on the server. This is what makes two simultaneous taps on different tiles
 * non-clobbering. Used by every per-tile action.
 *
 * @param {string} firestoreId  — youth_profiles doc ID
 * @param {number} index        — grid index 0..15
 * @param {object} tile         — a single garden map from a farmModel reducer
 * @returns {Promise<boolean>}  true on success, false on no-op / failure
 */
export async function saveTile(firestoreId, index, tile) {
  if (!isConfigured() || !firestoreId || tile == null || index == null) return false;
  try {
    await withTimeout(
      setDoc(
        doc(db, YOUTH_PROFILES, firestoreId),
        { farm: { tiles: { [String(index)]: tile } } },
        { merge: true }
      ),
      5000
    );
    return true;
  } catch (err) {
    console.error('[farmService] saveTile failed:', err.message);
    return false;
  }
}

/**
 * Persist a SINGLE animal via a field-path merge — the co-op write path for pens,
 * byte-parallel to saveTile.
 *
 * setDoc({ farm: { animals: { [index]: animal } } }, { merge:true }) deep-merges so
 * this write touches ONLY farm.animals.{index} and leaves every tile, every other
 * animal, and harvestCount untouched on the server. This is what lets a worker feed
 * pig 0 and a youth collect egg 1 in the same beat without clobbering. The scalar
 * harvestCount streak is owned by the optimistic context state, not this leaf write.
 *
 * @param {string} firestoreId  — youth_profiles doc ID
 * @param {number} index        — pen slot 0..ANIMAL_COUNT-1
 * @param {object} animal       — a single animal map from a farmModel reducer
 * @returns {Promise<boolean>}  true on success, false on no-op / failure
 */
export async function saveAnimal(firestoreId, index, animal) {
  if (!isConfigured() || !firestoreId || animal == null || index == null) return false;
  try {
    await withTimeout(
      setDoc(
        doc(db, YOUTH_PROFILES, firestoreId),
        { farm: { animals: { [String(index)]: animal } } },
        { merge: true }
      ),
      5000
    );
    return true;
  } catch (err) {
    console.error('[farmService] saveAnimal failed:', err.message);
    return false;
  }
}

/**
 * Persist a coin/tally EARN as race-safe Firestore increments — the co-op economy
 * write path. coins / counts.{crops,eggs,truffles} live on DISJOINT subtrees from
 * the tile/animal leaf writes, so an earn never clobbers a partner's concurrent
 * tile edit (and two simultaneous earns sum correctly via increment()).
 *
 * IMPORTANT: only the increment hits the server — the optimistic local add must NOT
 * also be written as a setDoc, or the value would double-count. The next snapshot's
 * authoritative value reconciles. Negative deltas (spends) are allowed.
 *
 * @param {string} firestoreId
 * @param {{coins?:number, crops?:number, eggs?:number, truffles?:number}} deltas
 * @returns {Promise<boolean>}
 */
export async function bumpEarn(firestoreId, { coins = 0, crops = 0, eggs = 0, truffles = 0 } = {}) {
  if (!isConfigured() || !firestoreId) return false;
  if (!coins && !crops && !eggs && !truffles) return false;
  try {
    const patch = { farm: {} };
    if (coins) patch.farm.coins = increment(coins);
    if (crops || eggs || truffles) {
      patch.farm.counts = {};
      if (crops) patch.farm.counts.crops = increment(crops);
      if (eggs) patch.farm.counts.eggs = increment(eggs);
      if (truffles) patch.farm.counts.truffles = increment(truffles);
    }
    await withTimeout(
      setDoc(doc(db, YOUTH_PROFILES, firestoreId), patch, { merge: true }),
      5000
    );
    return true;
  } catch (err) {
    console.error('[farmService] bumpEarn failed:', err.message);
    return false;
  }
}

/**
 * bumpCoins — race-safe coin delta only (negative for a shop spend). Thin wrapper
 * over bumpEarn so purchases deduct without clobbering a partner's coin earn.
 *
 * @param {string} firestoreId
 * @param {number} delta
 * @returns {Promise<boolean>}
 */
export async function bumpCoins(firestoreId, delta) {
  return bumpEarn(firestoreId, { coins: delta });
}

/**
 * saveDecor — persist the owned-decoration id list (a small array; field-path merge
 * replaces it wholesale, which is fine — decor is owner-set, not co-op-contended).
 *
 * @param {string} firestoreId
 * @param {string[]} decorArray
 * @returns {Promise<boolean>}
 */
export async function saveDecor(firestoreId, decorArray) {
  if (!isConfigured() || !firestoreId || !Array.isArray(decorArray)) return false;
  try {
    await withTimeout(
      setDoc(
        doc(db, YOUTH_PROFILES, firestoreId),
        { farm: { decor: decorArray } },
        { merge: true }
      ),
      5000
    );
    return true;
  } catch (err) {
    console.error('[farmService] saveDecor failed:', err.message);
    return false;
  }
}

/**
 * Persist the entire farm as a wire MAP — used only for first-create / migration
 * write-back (e.g. promoting a legacy single-garden doc to the 4×4 grid). Per-tile
 * actions should use saveTile so they don't clobber a partner's concurrent edit.
 *
 * Converts the (possibly dense-array) farm into the wire map shape before writing,
 * and uses setDoc(..., { merge:true }) so a doc that has never carried a `farm` field
 * still succeeds.
 *
 * @param {string} firestoreId
 * @param {object} farm  — dense or wire farm; normalized then map-ified here
 * @returns {Promise<boolean>}
 */
export async function saveFarm(firestoreId, farm) {
  if (!isConfigured() || !firestoreId || !farm) return false;
  try {
    const f = normalizeFarm(farm);
    const tilesMap = {};
    for (let i = 0; i < f.tiles.length; i++) {
      tilesMap[String(i)] = f.tiles[i];
    }
    const animalsMap = {};
    const animalsArr = Array.isArray(f.animals) ? f.animals : [];
    for (let i = 0; i < animalsArr.length; i++) {
      animalsMap[String(i)] = animalsArr[i];
    }
    const wire = {
      v: f.v || 1,
      tiles: tilesMap,
      animals: animalsMap,
      harvestCount: f.harvestCount || 0,
      coins: f.coins || 0,
      counts: {
        crops: (f.counts && f.counts.crops) || 0,
        eggs: (f.counts && f.counts.eggs) || 0,
        truffles: (f.counts && f.counts.truffles) || 0,
      },
      decor: Array.isArray(f.decor) ? f.decor : [],
    };
    await withTimeout(
      setDoc(doc(db, YOUTH_PROFILES, firestoreId), { farm: wire }, { merge: true }),
      5000
    );
    return true;
  } catch (err) {
    console.error('[farmService] saveFarm failed:', err.message);
    return false;
  }
}

/**
 * Real-time listener on a single youth's farm field.
 *
 * The youth device uses this to see crops a worker planted/tended (and vice versa)
 * without either party being online at the same beat. Emits a DENSE, always-16 farm
 * (via normalizeFarm) so the consumer never has to deal with the wire map, missing
 * fields, or legacy single-garden data. Falls back to the legacy `garden` field when
 * `farm` is absent so demo data migrates with zero loss on first read.
 *
 * @param {string} firestoreId
 * @param {(farm: object) => void} onData   — always receives a normalized dense farm
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe — a no-op when unconfigured / missing id
 */
export function subscribeFarm(firestoreId, onData, onError) {
  if (!isConfigured() || !firestoreId) return () => {};
  try {
    return onSnapshot(
      doc(db, YOUTH_PROFILES, firestoreId),
      (snap) => {
        if (!snap.exists()) {
          onData(normalizeFarm(null));
          return;
        }
        const data = snap.data() || {};
        // Prefer the new `farm` field; fall back to legacy `garden` so pre-migration
        // demo data still appears (normalizeFarm drops it into tiles[0]).
        const raw = data.farm != null ? data.farm : data.garden;
        onData(normalizeFarm(raw));
      },
      (err) => {
        console.error('[farmService] subscribeFarm error:', err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.error('[farmService] subscribeFarm setup failed:', err);
    return () => {};
  }
}
