/**
 * FarmContext.js — single source of truth for the co-op "Shared Farm" 4×4 grid.
 *
 * One farm (16 tiles) lives as a `farm` map field on youth_profiles/{firestoreId}.
 * Both the youth screen and the worker screen drive the SAME farm through
 * `useFarm(firestoreId, role)`. Replaces PlotContext/usePlot 1:1; the grid is the
 * single-plot system scaled to 16 independent tiles that share one Firestore doc.
 *
 * RESPONSIBILITIES
 * ────────────────
 *  • Owns the ~1s `now` tick so passive wall-clock growth (and per-tile countdowns)
 *    visibly climb while a farm screen is mounted (interval started lazily, ref-counted).
 *  • Subscribes to the youth doc (one thin listener per active firestoreId via farmService).
 *  • Optimistic local writes: a farmModel reducer runs first, local state updates the
 *    whole dense farm immediately, then ONLY the single returned tile is persisted
 *    (best-effort) via saveTile — a per-tile field-path merge that does NOT clobber a
 *    partner's concurrent edit on another tile.
 *  • Snapshot reconciliation overwrites the whole dense farm via normalizeFarm; because
 *    inbound writes are per-tile merges, a remote worker write to tile 3 won't revert an
 *    optimistic youth fertilize on tile 7 (the merged doc already contains both).
 *  • Local-sandbox fallback: when Firebase is unconfigured OR firestoreId is null
 *    (guest / unlinked youth), the farm is seeded from defaultFarm() and every action
 *    mutates local state only — the demo still grows, nothing throws.
 *
 * The provider is mounted app-wide (inside YouthSessionProvider in App.js) so both the
 * youth tree and the worker tree can call useFarm. Farms are keyed by firestoreId so a
 * worker viewing several youth farms, and the youth viewing their own, stay independent.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  defaultFarm,
  normalizeFarm,
  tileView,
  farmSummary,
  tapKind,
  canPlantTile,
  canWaterTile,
  canFertilizeTile,
  canHarvestTile,
  plantTile,
  waterTile,
  fertilizeTile,
  harvestTile,
  TILE_COUNT,
  animalView,
  canFeedAnimal,
  canCollectAnimal,
  animalTapKind,
  feedAnimal,
  collectAnimal,
  farmWallet,
  buyAnimalFarm,
  buyDecorFarm,
  SEED_PRICE,
  ANIMAL_PRICE,
  DECOR,
} from '../game/farmModel';
import {
  saveTile,
  saveAnimal,
  saveDecor,
  subscribeFarm,
  bumpEarn,
  bumpCoins,
} from '../api/farmService';

const TICK_MS = 1000;
const LOCAL_KEY = '__local__'; // sandbox bucket key when there is no firestoreId

const FarmContext = createContext(null);

export function FarmProvider({ children }) {
  // Per-farm state, keyed by firestoreId (or LOCAL_KEY for the sandbox).
  // Shape: { [key]: { farm, synced } }  — farm is always a dense, 16-tile farm.
  const [farms, setFarms] = useState({});

  // Ticking clock shared by all mounted farm screens. Re-renders ~every second so
  // growth math + per-tile countdowns advance on screen even with zero network traffic.
  const [now, setNow] = useState(() => Date.now());

  // Reference-counted active farms → we only keep the tick + listeners alive while
  // at least one screen is consuming a farm.
  const activeCountRef = useRef(0);
  const tickRef = useRef(null);

  // firestoreId → { unsub, refs } so multiple consumers of the same farm share one
  // Firestore listener.
  const subsRef = useRef({});

  // ── 1s tick, only while something is mounted ──────────────────────
  const startTick = useCallback(() => {
    activeCountRef.current += 1;
    if (activeCountRef.current === 1) {
      tickRef.current = setInterval(() => setNow(Date.now()), TICK_MS);
    }
  }, []);

  const stopTick = useCallback(() => {
    activeCountRef.current = Math.max(0, activeCountRef.current - 1);
    if (activeCountRef.current === 0 && tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // Cleanup any stray interval / listeners if the provider itself unmounts.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      Object.values(subsRef.current).forEach((s) => {
        try { s.unsub && s.unsub(); } catch {}
      });
      subsRef.current = {};
    };
  }, []);

  // ── Seed a farm bucket if it does not exist yet ───────────────────
  const ensureFarm = useCallback((key) => {
    setFarms((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: { farm: defaultFarm(), synced: false } };
    });
  }, []);

  // ── Apply a full farm update for a key (used by snapshot reconciliation) ──
  const applyFarm = useCallback((key, farm, synced) => {
    setFarms((prev) => ({
      ...prev,
      [key]: {
        farm: normalizeFarm(farm),
        synced: synced != null ? synced : (prev[key]?.synced ?? false),
      },
    }));
  }, []);

  // ── Apply a single optimistic tile patch (used by per-tile writes) ──
  // We patch one tile (and harvestCount) in place so the rest of the dense farm —
  // including other tiles a partner may have just changed — is preserved locally.
  const applyTile = useCallback((key, index, tile, harvestCount, synced, coins, counts) => {
    setFarms((prev) => {
      const cur = prev[key]?.farm ? normalizeFarm(prev[key].farm) : defaultFarm();
      const tiles = cur.tiles.slice();
      tiles[index] = tile;
      const nextFarm = {
        ...cur,
        tiles,
        harvestCount: harvestCount != null ? harvestCount : cur.harvestCount,
        coins: coins != null ? coins : cur.coins,
        counts: counts != null ? counts : cur.counts,
      };
      return {
        ...prev,
        [key]: {
          farm: nextFarm,
          synced: synced != null ? synced : (prev[key]?.synced ?? false),
        },
      };
    });
  }, []);

  // ── Apply a single optimistic animal patch (used by per-animal writes) ──
  // Mirrors applyTile: patch one pen (and harvestCount) in the dense farm so the
  // rest of the farm — tiles a partner just changed, other pens — is preserved.
  const applyAnimal = useCallback((key, index, animal, harvestCount, synced, coins, counts) => {
    setFarms((prev) => {
      const cur = prev[key]?.farm ? normalizeFarm(prev[key].farm) : defaultFarm();
      const animals = cur.animals.slice();
      animals[index] = animal;
      const nextFarm = {
        ...cur,
        animals,
        harvestCount: harvestCount != null ? harvestCount : cur.harvestCount,
        coins: coins != null ? coins : cur.coins,
        counts: counts != null ? counts : cur.counts,
      };
      return {
        ...prev,
        [key]: {
          farm: nextFarm,
          synced: synced != null ? synced : (prev[key]?.synced ?? false),
        },
      };
    });
  }, []);

  // ── Apply a full-farm optimistic patch for shop purchases (decor) ──
  // Merges the supplied farm (already-mutated coins/decor) over the current dense farm.
  const applyShop = useCallback((key, farm, synced) => {
    setFarms((prev) => {
      const cur = prev[key]?.farm ? normalizeFarm(prev[key].farm) : defaultFarm();
      const nextFarm = normalizeFarm({ ...cur, ...farm });
      return {
        ...prev,
        [key]: {
          farm: nextFarm,
          synced: synced != null ? synced : (prev[key]?.synced ?? false),
        },
      };
    });
  }, []);

  // ── Subscribe (ref-counted) to one youth doc's farm ───────────────
  const acquireSub = useCallback((firestoreId) => {
    if (!firestoreId) return; // sandbox: nothing to subscribe to
    const existing = subsRef.current[firestoreId];
    if (existing) {
      existing.refs += 1;
      return;
    }
    const entry = { refs: 1, unsub: () => {} };
    subsRef.current[firestoreId] = entry;

    entry.unsub = subscribeFarm(
      firestoreId,
      (farm) => {
        // farmService already normalizes → dense, always-16 farm.
        applyFarm(firestoreId, farm, true);
      },
      (err) => {
        // On listener error fall back to a local-but-still-playable farm.
        console.warn('[FarmContext] subscribeFarm error:', err?.message || err);
        applyFarm(firestoreId, defaultFarm(), false);
      },
    );

    // subscribeFarm returns ()=>{} when unconfigured → treat as a local sandbox.
    if (entry.unsub === undefined || entry.unsub === null) {
      entry.unsub = () => {};
    }
  }, [applyFarm]);

  const releaseSub = useCallback((firestoreId) => {
    if (!firestoreId) return;
    const entry = subsRef.current[firestoreId];
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs <= 0) {
      try { entry.unsub && entry.unsub(); } catch {}
      delete subsRef.current[firestoreId];
    }
  }, []);

  // ── Commit a reducer result: optimistic tile patch first, then persist one tile ──
  const commitTile = useCallback((key, firestoreId, result) => {
    if (!result) return;
    const { farm, tile, index, earn, spend } = result;
    const synced = Boolean(firestoreId);
    // Optimistic: fold the leaf tile + the already-mutated coins/counts from the reducer.
    applyTile(key, index, tile, farm?.harvestCount, synced, farm?.coins, farm?.counts);
    if (firestoreId) {
      // best-effort; saveTile is guarded and returns false (never throws) on failure.
      saveTile(firestoreId, index, tile).catch((err) =>
        console.warn('[FarmContext] saveTile failed:', err?.message || err),
      );
      // Earns/spends ride a SEPARATE race-safe increment() write (never a setDoc of the
      // optimistic value) — the next snapshot reconciles the authoritative balance.
      if (earn) {
        bumpEarn(firestoreId, earn).catch((err) =>
          console.warn('[FarmContext] bumpEarn failed:', err?.message || err),
        );
      }
      if (spend) {
        bumpCoins(firestoreId, -spend).catch((err) =>
          console.warn('[FarmContext] bumpCoins failed:', err?.message || err),
        );
      }
    }
  }, [applyTile]);

  // ── Commit an animal reducer result: optimistic pen patch, then persist one pen ──
  // Byte-parallel to commitTile. collectAnimal carries a bumped farm.harvestCount;
  // feedAnimal carries it unchanged. We persist ONLY the single animal leaf via the
  // field-path merge so a partner's concurrent tile/pen edit is never clobbered.
  const commitAnimal = useCallback((key, firestoreId, result) => {
    if (!result) return;
    const { farm, animal, index, earn } = result;
    const synced = Boolean(firestoreId);
    applyAnimal(key, index, animal, farm?.harvestCount, synced, farm?.coins, farm?.counts);
    if (firestoreId) {
      // best-effort; saveAnimal is guarded and returns false (never throws) on failure.
      saveAnimal(firestoreId, index, animal).catch((err) =>
        console.warn('[FarmContext] saveAnimal failed:', err?.message || err),
      );
      // collect → earn rides a separate race-safe increment() write.
      if (earn) {
        bumpEarn(firestoreId, earn).catch((err) =>
          console.warn('[FarmContext] bumpEarn failed:', err?.message || err),
        );
      }
    }
  }, [applyAnimal]);

  // ── Buy an animal: optimistic append + persist the new leaf + spend the coins ──
  const buyAnimalCommit = useCallback((key, firestoreId, result) => {
    if (!result || !result.ok) return false;
    const { farm, animal, index, spend } = result;
    const synced = Boolean(firestoreId);
    applyAnimal(key, index, animal, farm?.harvestCount, synced, farm?.coins, farm?.counts);
    if (firestoreId) {
      saveAnimal(firestoreId, index, animal).catch((err) =>
        console.warn('[FarmContext] saveAnimal (buy) failed:', err?.message || err),
      );
      if (spend) {
        bumpCoins(firestoreId, -spend).catch((err) =>
          console.warn('[FarmContext] bumpCoins (buyAnimal) failed:', err?.message || err),
        );
      }
    }
    return true;
  }, [applyAnimal]);

  // ── Buy decor: optimistic decor patch + persist the decor array + spend the coins ──
  const buyDecorCommit = useCallback((key, firestoreId, result) => {
    if (!result || !result.ok) return false;
    const { farm, spend } = result;
    const synced = Boolean(firestoreId);
    applyShop(key, farm, synced);
    if (firestoreId) {
      saveDecor(firestoreId, farm.decor).catch((err) =>
        console.warn('[FarmContext] saveDecor failed:', err?.message || err),
      );
      if (spend) {
        bumpCoins(firestoreId, -spend).catch((err) =>
          console.warn('[FarmContext] bumpCoins (buyDecor) failed:', err?.message || err),
        );
      }
    }
    return true;
  }, [applyShop]);

  const value = useMemo(() => ({
    farms,
    now,
    ensureFarm,
    startTick,
    stopTick,
    acquireSub,
    releaseSub,
    commitTile,
    commitAnimal,
    buyAnimalCommit,
    buyDecorCommit,
  }), [farms, now, ensureFarm, startTick, stopTick, acquireSub, releaseSub, commitTile, commitAnimal, buyAnimalCommit, buyDecorCommit]);

  return (
    <FarmContext.Provider value={value}>
      {children}
    </FarmContext.Provider>
  );
}

/**
 * useFarm — consume one shared 4×4 farm, role-aware.
 *
 * @param {string|null} firestoreId  the youth doc id (null/undefined → local sandbox)
 * @param {'worker'|'youth'} role
 * @returns {{
 *   farm:object, now:number, synced:boolean, harvestCount:number,
 *   summary:object, tiles:object[],
 *   coins:number, counts:{crops:number,eggs:number,truffles:number}, decor:string[],
 *   doPlant:(i:number, crop:string)=>void,
 *   doWater:(i:number)=>void,
 *   doFertilize:(i:number)=>void,
 *   doHarvest:(i:number)=>void,
 *   tapTile:(i:number)=>(string|null),
 *   animals:object[],
 *   doFeed:(i:number)=>void,
 *   doCollect:(i:number)=>void,
 *   tapAnimal:(i:number)=>('feed'|'collect'|null),
 *   buySeedPlant:(i:number, crop:string)=>boolean,
 *   buyAnimal:(kind:'chicken'|'pig')=>boolean,
 *   buyDecor:(decorId:string)=>boolean,
 * }}
 */
export function useFarm(firestoreId, role) {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarm must be used inside <FarmProvider>');

  const {
    farms, now, ensureFarm, startTick, stopTick, acquireSub, releaseSub,
    commitTile, commitAnimal, buyAnimalCommit, buyDecorCommit,
  } = ctx;

  const key = firestoreId || LOCAL_KEY;

  // Make sure a bucket exists for first render.
  useEffect(() => {
    ensureFarm(key);
  }, [key, ensureFarm]);

  // Drive the shared tick while this consumer is mounted.
  useEffect(() => {
    startTick();
    return () => stopTick();
  }, [startTick, stopTick]);

  // Subscribe to the youth doc while mounted (no-op for sandbox).
  useEffect(() => {
    acquireSub(firestoreId);
    return () => releaseSub(firestoreId);
  }, [firestoreId, acquireSub, releaseSub]);

  const bucket = farms[key];
  const farm = bucket?.farm || defaultFarm();
  const synced = Boolean(firestoreId) && Boolean(bucket?.synced);
  const harvestCount = farm.harvestCount || 0;

  // ── Derived wallet (coins + lifetime tallies) for the HUD ──
  const wallet = useMemo(() => farmWallet(farm), [farm]);
  const coins = wallet.coins;
  const counts = useMemo(
    () => ({ crops: wallet.crops, eggs: wallet.eggs, truffles: wallet.truffles }),
    [wallet.crops, wallet.eggs, wallet.truffles],
  );
  const decor = useMemo(() => (Array.isArray(farm.decor) ? farm.decor : []), [farm.decor]);

  // ── Derived: 16 tileView objects + summary, memoized by (farm, now, role) ──
  const tiles = useMemo(() => {
    const out = new Array(TILE_COUNT);
    for (let i = 0; i < TILE_COUNT; i++) out[i] = tileView(farm, i, role, now);
    return out;
  }, [farm, role, now]);

  const summary = useMemo(() => farmSummary(farm, now), [farm, now]);

  // ── Derived: DYNAMIC-length animalView objects (3..6), memoized by (farm, now, role) ──
  const animalLen = Array.isArray(farm.animals) ? farm.animals.length : 0;
  const animals = useMemo(() => {
    const n = Array.isArray(farm.animals) ? farm.animals.length : 0;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = animalView(farm, i, role, now);
    return out;
  }, [farm, role, now, animalLen]);

  // ── Actions: guard → reducer → optimistic per-tile commit ─────────
  // Plant now costs seed coins; guard tile-empty AND affordability before spending.
  const doPlant = useCallback((i, crop) => {
    if (!canPlantTile(farm, i)) return false;
    const price = SEED_PRICE[crop] || 0;
    if ((farm.coins || 0) < price) return false;
    commitTile(key, firestoreId, plantTile(farm, i, crop, role, Date.now()));
    return true;
  }, [farm, role, key, firestoreId, commitTile]);

  // buySeedPlant is the UI-facing alias for the guarded, coin-spending plant.
  const buySeedPlant = doPlant;

  const doWater = useCallback((i) => {
    const ts = Date.now();
    if (!canWaterTile(farm, i, role, ts)) return;
    commitTile(key, firestoreId, waterTile(farm, i, role, ts));
  }, [farm, role, key, firestoreId, commitTile]);

  const doFertilize = useCallback((i) => {
    if (!canFertilizeTile(farm, i, role)) return;
    commitTile(key, firestoreId, fertilizeTile(farm, i, role, Date.now()));
  }, [farm, role, key, firestoreId, commitTile]);

  const doHarvest = useCallback((i) => {
    const ts = Date.now();
    if (!canHarvestTile(farm, i, ts)) return;
    commitTile(key, firestoreId, harvestTile(farm, i, role, ts));
  }, [farm, role, key, firestoreId, commitTile]);

  // ── The SHARED contextual ladder (used identically by worker + youth) ──
  // Runs the action for water/fertilize/harvest inline and returns the kind.
  // 'pick' is returned so the caller can open the crop picker for that tile.
  const tapTile = useCallback((i) => {
    const ts = Date.now();
    const kind = tapKind(farm, i, role, ts);
    switch (kind) {
      case 'harvest':
        commitTile(key, firestoreId, harvestTile(farm, i, role, ts));
        break;
      case 'fertilize':
        commitTile(key, firestoreId, fertilizeTile(farm, i, role, ts));
        break;
      case 'growing':
        // Crop is mid-cooldown — NO commit. The caller reads 'growing' and surfaces
        // a "🌱 growing…" pop + shake instead of a silent dead tap.
        break;
      case 'pick':
      default:
        break; // caller opens the picker on 'pick'
    }
    return kind;
  }, [farm, role, key, firestoreId, commitTile]);

  // ── Animal actions: guard → reducer → optimistic per-pen commit ───
  const doFeed = useCallback((i) => {
    if (!canFeedAnimal(farm, i)) return;
    commitAnimal(key, firestoreId, feedAnimal(farm, i, role, Date.now()));
  }, [farm, role, key, firestoreId, commitAnimal]);

  const doCollect = useCallback((i) => {
    const ts = Date.now();
    if (!canCollectAnimal(farm, i, ts)) return;
    commitAnimal(key, firestoreId, collectAnimal(farm, i, role, ts));
  }, [farm, role, key, firestoreId, commitAnimal]);

  // ── Animal contextual ladder (used identically by worker + youth) ──
  // Runs feed-or-collect by state inline and returns the kind.
  const tapAnimal = useCallback((i) => {
    const ts = Date.now();
    const kind = animalTapKind(farm, i, role, ts);
    switch (kind) {
      case 'collect':
        commitAnimal(key, firestoreId, collectAnimal(farm, i, role, ts));
        break;
      case 'feed':
        commitAnimal(key, firestoreId, feedAnimal(farm, i, role, ts));
        break;
      default:
        break;
    }
    return kind;
  }, [farm, role, key, firestoreId, commitAnimal]);

  // ── Shop actions: guard balance → reducer → optimistic commit → persist ──
  const buyAnimal = useCallback((kind) => {
    if (!ANIMAL_PRICE[kind]) return false;
    const result = buyAnimalFarm(farm, kind);
    return buyAnimalCommit(key, firestoreId, result);
  }, [farm, key, firestoreId, buyAnimalCommit]);

  const buyDecor = useCallback((decorId) => {
    if (!DECOR[decorId]) return false;
    const result = buyDecorFarm(farm, decorId);
    return buyDecorCommit(key, firestoreId, result);
  }, [farm, key, firestoreId, buyDecorCommit]);

  return {
    farm,
    now,
    synced,
    harvestCount,
    summary,
    tiles,
    coins,
    counts,
    decor,
    doPlant,
    doWater,
    doFertilize,
    doHarvest,
    tapTile,
    animals,
    doFeed,
    doCollect,
    tapAnimal,
    buySeedPlant,
    buyAnimal,
    buyDecor,
  };
}

export default FarmContext;
