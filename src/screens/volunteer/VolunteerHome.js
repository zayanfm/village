/**
 * VolunteerHome.js — The worker's living 3D Village
 *
 * DATA SOURCE
 * -----------
 * Primary: Firestore `youth_profiles` collection via subscribeYouthProfiles.
 * Each doc is one youth; the village map renders their houseConfig in real-time.
 * New profiles created via NewYouthForm appear instantly via onSnapshot.
 *
 * Village starts empty — youths are added via the "＋ Add New Youth" FAB.
 *
 * ACTIONS
 * -------
 * • Tap a house / label  → YouthCaseDetail (Path A: import interactions)
 * • "＋ Add New Youth"    → NewYouthForm    (Path B: onboard a new youth)
 */

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import VillageMap from '../../components/3d/VillageMap';
import FarmHud from '../../components/farm/FarmHud';
import ShopSheet from '../../components/farm/ShopSheet';
import { defaultYouthHouseConfig } from '../youth/youthTheme'; // still needed for houseConfig merging
import { subscribeYouthProfiles } from '../../api/firestoreService';
import {
  CROPS,
  FERTILIZE_BOOST_MS,
  formatRemaining,
  normalizeFarm,
  tapKind,
  plantTile,
  fertilizeTile,
  harvestTile,
  ANIMALS,
  animalTapKind,
  feedAnimal,
  collectAnimal,
  farmWallet,
  canPlantTile,
  SEED_PRICE,
  ANIMAL_PRICE,
  ANIMAL_MAX,
  DECOR,
  buyAnimalFarm,
  buyDecorFarm,
} from '../../game/farmModel';
import { saveTile, saveAnimal, bumpEarn, bumpCoins, saveDecor } from '../../api/farmService';
import { gradients, palette, spacing, typography } from '../../theme/theme';

/* ─── No seed data — village starts empty until real youths are added ── */

/** Map a youth_profiles Firestore doc → VillageMap case shape. */
function profileToCase(doc) {
  return {
    id: doc.firestoreId,
    firestoreId: doc.firestoreId,
    youthName: doc.name ?? 'Unknown',
    caseId: doc.caseId ?? `#${doc.firestoreId?.slice(0, 5)}`,
    timestamp: doc.lastSessionAt?.toDate
      ? doc.lastSessionAt.toDate().toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
      : 'New member',
    youthHouseConfig: doc.houseConfig
      ? { ...defaultYouthHouseConfig, ...doc.houseConfig }
      : defaultYouthHouseConfig,
    // ← shared co-op 4×4 farm (rides the same doc). Always a dense, 16-tile farm;
    //   normalizeFarm also migrates a legacy single `garden` into tiles[0].
    farm: normalizeFarm(doc.farm ?? doc.garden ?? null),
  };
}

export default function VolunteerHome({ navigation }) {
  const isFocused = useIsFocused();
  const [cases, setCases] = useState([]);
  const [firestoreReady, setFirestoreReady] = useState(false);

  // ── Shared-plot farming layer ──────────────────────────────────
  const [plantMode, setPlantMode] = useState(false); // gates house-tap vs tile-tend
  const [picker, setPicker] = useState(null);         // { case, tileIndex } when choosing a crop
  const [now, setNow] = useState(() => Date.now());   // 1s tick drives live growth
  const [pulse, setPulse] = useState(null);           // transient { caseId, tileIndex, label, kind, key, target } → pop + glow
  const [shopFor, setShopFor] = useState(null);       // firestoreId of the case whose shop sheet is open
  const [focusId, setFocusId] = useState(null);       // last-touched case → which wallet the HUD/shop bind to

  // Fire a one-shot "pop + glow" on a single tile OR animal. key (the action time)
  // forces the overlay/mesh animation to replay on every tap. `target` ('tile' |
  // 'animal') routes the pulse to the field overlay vs the pen overlay — one
  // channel, no cross-fire. `tileIndex` carries the index for both targets.
  const firePulse = (caseId, tileIndex, label, kind, key, target = 'tile') =>
    setPulse({ caseId, tileIndex, label, kind, key, target });

  useEffect(() => {
    const unsub = subscribeYouthProfiles(
      (docs) => {
        if (docs.length === 0) {
          setCases([]);
        } else {
          setCases(docs.map(profileToCase));
          setFirestoreReady(true);
        }
      },
      () => setCases([])
    );
    return unsub;
  }, []);

  // Live growth tick — focus-gated so the village stops ticking off-screen.
  useEffect(() => {
    if (!isFocused) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isFocused]);

  // Optimistic local patch of ONE tile, then offline-safe per-tile persist
  // (snapshot reconciles). The field-path merge in saveTile means a sibling
  // tile written by the youth in the same beat won't clobber this one.
  //
  // `result` is a farmModel reducer return: { farm, tile, index, earn?, spend? }.
  // We fold the WHOLE returned farm's wallet/tallies (coins/counts) into local
  // state optimistically, but ONLY the single tile leaf is setDoc'd — the wallet
  // moves through the race-safe Firestore increment() (bumpEarn/bumpCoins), so a
  // worker harvest + a youth collect in the same beat both land without clobber.
  const persist = (c, result) => {
    const { tile, index, earn, spend } = result;
    setCases((prev) =>
      prev.map((x) => {
        if (x.firestoreId !== c.firestoreId) return x;
        const farm = normalizeFarm(x.farm);
        const tiles = farm.tiles.slice();
        tiles[index] = tile;
        return {
          ...x,
          farm: {
            ...farm,
            tiles,
            coins: result.farm?.coins != null ? result.farm.coins : farm.coins,
            counts: result.farm?.counts || farm.counts,
          },
        };
      })
    );
    saveTile(c.firestoreId, index, tile);
    if (earn) bumpEarn(c.firestoreId, earn);
    else if (spend) bumpCoins(c.firestoreId, -spend);
  };

  // Contextual tend on a single tile, via the SHARED tapKind ladder (identical
  // to the youth side): empty→pick(→picker) / ripe→harvest / growing→fertilize
  // (the solo speed-up, EITHER role) / growing-on-cooldown→'growing' feedback.
  // 'water' has left the ladder. The 'growing' branch is the never-dead fix: a
  // tap on a cooling crop pops "🌱 growing…" + a tiny shake instead of nothing.
  const handleTileTap = (c, index) => {
    setFocusId(c.firestoreId);
    const farm = normalizeFarm(c.farm);
    const t = Date.now();
    const kind = tapKind(farm, index, 'worker', t);
    if (kind === 'pick') {
      setPicker({ case: c, tileIndex: index });
      return;
    }
    if (kind === 'harvest') {
      const res = harvestTile(farm, index, 'worker', t);
      persist(c, res);
      const reward = res.earn ? `  +${res.earn.coins} 🪙` : '';
      firePulse(c.id, index, `Harvested! 🌟${reward}`, 'harvest', t);
    } else if (kind === 'fertilize') {
      const res = fertilizeTile(farm, index, 'worker', t);
      persist(c, res);
      firePulse(c.id, index, `+${FERTILIZE_BOOST_MS / 1000}s 🌱`, 'fertilize', t);
    } else if (kind === 'growing') {
      // On cooldown — NEVER a dead tap. Pop a "still growing" hint (+ chip shake).
      firePulse(c.id, index, '🌱 growing…', 'growing', t);
    }
    // kind === null → tile is empty-out-of-mode / not actionable; no-op.
  };

  // Plant from the picker. Seeds now COST coins — guard affordability (the chip is
  // also disabled when unaffordable, this is the belt-and-braces server-of-record
  // check) then let plantTile fold the spend; persist() fires the coin decrement.
  const pickCrop = (cropKey) => {
    if (!picker) return;
    const c = picker.case;
    const index = picker.tileIndex;
    const farm = normalizeFarm(c.farm);
    const price = SEED_PRICE[cropKey] || 0;
    if (!canPlantTile(farm, index) || (farm.coins || 0) < price) {
      setPicker(null);
      return;
    }
    const t = Date.now();
    const res = plantTile(farm, index, cropKey, 'worker', t);
    persist(c, res);
    firePulse(c.id, index, res.spend ? `-${res.spend} 🪙` : 'Planted 🌱', 'spend', t);
    setPicker(null);
  };

  // Optimistic local patch of ONE animal, then offline-safe per-animal persist.
  // Mirror of `persist`: the field-path merge in saveAnimal writes only the
  // `farm.animals.{index}` leaf, so a sibling tile/animal touched by the youth in
  // the same beat won't clobber this one. We also carry the farm-wide harvestCount
  // forward (collect bumps it inside collectAnimal) so the co-op streak stays in
  // sync optimistically — the snapshot reconciles either way.
  // `result` is a farmModel animal reducer return: { farm, animal, index, earn? }.
  // Folds the bumped harvestCount AND the wallet/tallies into local state; only the
  // single animal leaf is setDoc'd, the wallet rides the race-safe increment().
  const persistAnimal = (c, result) => {
    const { animal, index, earn } = result;
    setCases((prev) =>
      prev.map((x) => {
        if (x.firestoreId !== c.firestoreId) return x;
        const farm = normalizeFarm(x.farm);
        const animals = farm.animals.slice();
        animals[index] = animal;
        return {
          ...x,
          farm: {
            ...farm,
            animals,
            harvestCount:
              result.farm?.harvestCount != null ? result.farm.harvestCount : farm.harvestCount,
            coins: result.farm?.coins != null ? result.farm.coins : farm.coins,
            counts: result.farm?.counts || farm.counts,
          },
        };
      })
    );
    saveAnimal(c.firestoreId, index, animal);
    if (earn) bumpEarn(c.firestoreId, earn);
  };

  // Contextual feed/collect on a single animal, via the SHARED animalTapKind
  // ladder (identical to the youth side): ready→collect / hungry→feed / else→null.
  // Worker acts as 'worker'. Never gated by plantMode — the cozy loop is always
  // available. collectAnimal bumps the farm-wide harvestCount (the "Grown
  // together 🌻" streak counts eggs/truffles too).
  const handleAnimalTap = (c, index) => {
    setFocusId(c.firestoreId);
    const farm = normalizeFarm(c.farm);
    const t = Date.now();
    const kind = animalTapKind(farm, index, 'worker', t);
    if (kind === 'collect') {
      const res = collectAnimal(farm, index, 'worker', t);
      const def = ANIMALS[res.animal.kind] || ANIMALS.chicken;
      persistAnimal(c, res);
      const reward = res.earn ? `  +${res.earn.coins} 🪙` : '';
      firePulse(c.id, index, `+1 ${def.produceEmoji}${reward}`, 'collect', t, 'animal');
    } else if (kind === 'feed') {
      const res = feedAnimal(farm, index, 'worker', t);
      const def = ANIMALS[res.animal.kind] || ANIMALS.chicken;
      persistAnimal(c, res);
      firePulse(c.id, index, `Fed! ${def.emoji}`, 'feed', t, 'animal');
    }
    // kind === null → animal is mid-cooldown / not actionable; no-op.
  };

  // ── Shop: spend the SHARED wallet ──────────────────────────────────
  // Buy +1 animal → buyAnimalFarm guards cap+balance+kind, appends at the next pen
  // index; we optimistically patch local state (animals + coins), persist the new
  // animal leaf, and decrement coins race-safely. The dynamic-length animals array
  // flows straight to VillageMap's pen + projection (count = animals.length).
  const buyAnimal = (c, kind) => {
    const res = buyAnimalFarm(normalizeFarm(c.farm), kind);
    if (!res.ok) return;
    setCases((prev) =>
      prev.map((x) =>
        x.firestoreId === c.firestoreId ? { ...x, farm: res.farm } : x
      )
    );
    saveAnimal(c.firestoreId, res.index, res.animal);
    bumpCoins(c.firestoreId, -res.spend);
  };

  // Buy a decoration → append the id to farm.decor[], persist the whole array,
  // decrement coins. The decor ids ride to VillageMap so the cosmetic mesh appears
  // beside the field.
  const buyDecor = (c, decorId) => {
    const res = buyDecorFarm(normalizeFarm(c.farm), decorId);
    if (!res.ok) return;
    setCases((prev) =>
      prev.map((x) =>
        x.firestoreId === c.firestoreId ? { ...x, farm: res.farm } : x
      )
    );
    saveDecor(c.firestoreId, res.farm.decor);
    bumpCoins(c.firestoreId, -res.spend);
  };

  const openCaseFile = (c) =>
    navigation.navigate('YouthCaseDetail', {
      caseId: c.caseId,
      youthName: c.youthName,
      caseKey: c.id,
      firestoreId: c.firestoreId,       // ← carried forward for Path A
      youthHouseConfig: c.youthHouseConfig,
    });

  const openNewYouth = () =>
    navigation.navigate('NewYouthForm', {
      nextGridIndex: cases.length,       // assign next open map slot
    });

  // The HUD + shop bind to ONE focused farm's shared wallet. Focus follows the last
  // tile/animal tap; falls back to the first case so the HUD is always meaningful.
  const focusedCase =
    cases.find((c) => c.firestoreId === focusId) || cases[0] || null;
  const wallet = focusedCase ? farmWallet(focusedCase.farm) : null;
  const shopCase =
    cases.find((c) => c.firestoreId === shopFor) || null;
  const shopFarm = shopCase ? normalizeFarm(shopCase.farm) : null;

  // Crop picker affordability: read from the picker's own farm wallet.
  const pickerCoins = picker ? normalizeFarm(picker.case.farm).coins || 0 : 0;

  return (
    <View style={styles.root}>
      {isFocused && (
        <VillageMap
          cases={cases}
          onSelect={openCaseFile}
          pulse={pulse}
          plantMode={plantMode}
          now={now}
          onTileTap={handleTileTap}
          onAnimalTap={handleAnimalTap}
        />
      )}

      {/* ── Top header (non-interactive, sits above canvas) ── */}
      <SafeAreaView style={styles.headerSafe} edges={['top']} pointerEvents="box-none">
        <MotiView
          from={{ opacity: 0, translateY: 14 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 600 }}
          pointerEvents="none"
        >
          <Text style={styles.kicker}>
            YOUR VILLAGE{firestoreReady ? '  ·  LIVE' : ''}
          </Text>
          <Text style={styles.title}>Your neighbourhood</Text>
          <Text style={styles.subtitle}>
            {plantMode
              ? 'Plant mode · tap a tile to tend it. Houses are paused.'
              : 'Drag · pinch to zoom · two fingers to roam. Tap any home to open its file.'}
          </Text>
        </MotiView>

        {/* ── Plant-mode toggle pill (interactive) ── */}
        {cases.length > 0 && (
          <View style={styles.toggleRow} pointerEvents="box-none">
            <Pressable
              onPress={() => {
                setPlantMode((m) => !m);
                setPicker(null);
              }}
              style={[styles.togglePill, plantMode && styles.togglePillOn]}
            >
              <Text style={[styles.toggleText, plantMode && styles.toggleTextOn]}>
                {plantMode ? 'Done' : '🌱 Plant mode'}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── Persistent wallet HUD (shared co-op economy) + Shop entry ──
            Uses the same polished <FarmHud> the youth screen does, so both
            sides read identically. */}
        {wallet && focusedCase && (
          <View style={styles.hudRow} pointerEvents="box-none">
            <FarmHud
              coins={wallet.coins}
              counts={{ crops: wallet.crops, eggs: wallet.eggs, truffles: wallet.truffles }}
              onShop={() => setShopFor(focusedCase.firestoreId)}
              style={styles.hudAlign}
            />
          </View>
        )}
      </SafeAreaView>

      {/* ── Empty state: shown before any youths are added ── */}
      {cases.length === 0 && (
        <View style={styles.emptyState} pointerEvents="none">
          <Text style={styles.emptyIcon}>🌱</Text>
          <Text style={styles.emptyTitle}>Your village is empty</Text>
          <Text style={styles.emptySub}>Tap "Add New Youth" below to place the first house on the map.</Text>
        </View>
      )}

      {/* ── FAB: Add New Youth (Path B trigger) — hidden in plant mode ── */}
      {!plantMode && (
        <SafeAreaView style={styles.fabSafe} edges={['bottom']} pointerEvents="box-none">
          <MotiView
            from={{ opacity: 0, scale: 0.8, translateY: 20 }}
            animate={{ opacity: 1, scale: 1, translateY: 0 }}
            transition={{ type: 'spring', damping: 16, stiffness: 180, delay: 400 }}
          >
            <Pressable onPress={openNewYouth} style={styles.fabWrap}>
              <LinearGradient
                colors={gradients.leaf}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fab}
              >
                <Text style={styles.fabIcon}>＋</Text>
                <Text style={styles.fabLabel}>Add New Youth</Text>
              </LinearGradient>
            </Pressable>
          </MotiView>
        </SafeAreaView>
      )}

      {/* ── Crop-picker sheet (plant on empty plot) ── */}
      {picker && (
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} />
          <MotiView
            from={{ opacity: 0, translateY: 24 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'spring', damping: 18, stiffness: 200 }}
            style={styles.pickerSheet}
          >
            <Text style={styles.pickerTitle}>
              Plant for {picker.case?.youthName ?? 'this youth'}
            </Text>
            <Text style={styles.pickerSub}>
              Choose a seed to grow together.  🪙 {pickerCoins}
            </Text>
            <View style={styles.pickerRow}>
              {Object.entries(CROPS).map(([key, def]) => {
                const price = SEED_PRICE[key] || 0;
                const afford = pickerCoins >= price;
                return (
                  <Pressable
                    key={key}
                    style={[styles.cropChip, !afford && styles.cropChipOff]}
                    disabled={!afford}
                    onPress={() => pickCrop(key)}
                  >
                    <Text style={styles.cropEmoji}>{def.emoji[4]}</Text>
                    <Text style={styles.cropLabel}>{def.label}</Text>
                    <Text style={styles.cropTime}>{formatRemaining(def.growMs)}</Text>
                    <Text style={[styles.cropPrice, !afford && styles.cropPriceOff]}>
                      🪙 {price}
                    </Text>
                    <View style={[styles.cropSwatch, { backgroundColor: def.color }]} />
                  </Pressable>
                );
              })}
            </View>
          </MotiView>
        </View>
      )}

      {/* ── Shop sheet (spend the shared wallet) — the polished <ShopSheet>
          component, same as the youth side. ── */}
      <ShopSheet
        visible={!!shopCase && !!shopFarm}
        coins={shopFarm?.coins ?? 0}
        animalsCount={shopFarm?.animals?.length ?? 0}
        decorOwned={shopFarm?.decor ?? []}
        onClose={() => setShopFor(null)}
        onBuyAnimal={(kind) => shopCase && buyAnimal(shopCase, kind)}
        onBuyDecor={(id) => shopCase && buyDecor(shopCase, id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#243042' },

  headerSafe: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
  },
  kicker: { ...typography.caption, color: palette.mint, marginBottom: 6 },
  title: { ...typography.display },
  subtitle: { ...typography.body, color: palette.fog, marginTop: 8, lineHeight: 21, maxWidth: '92%' },

  fabSafe: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center',
    paddingBottom: 115,   // bar(70) + center button protrusion(~50) + breathing room
  },
  fabWrap: {
    shadowColor: palette.tealBright,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.65,
    shadowRadius: 16,
    elevation: 12,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    gap: 10,
  },
  fabIcon: { color: palette.ink, fontSize: 20, fontWeight: '900' },
  fabLabel: { color: palette.ink, fontSize: 15, fontWeight: '900', letterSpacing: 0.2 },

  emptyState: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { ...typography.title, textAlign: 'center', marginBottom: 10 },
  emptySub: { ...typography.body, color: palette.fog, textAlign: 'center', lineHeight: 22 },

  // ── Plant-mode toggle ──
  toggleRow: { flexDirection: 'row', marginTop: 14 },
  togglePill: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(12,32,27,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  togglePillOn: {
    backgroundColor: 'rgba(124,203,107,0.92)',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  toggleText: { color: palette.white, fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  toggleTextOn: { color: palette.ink },

  // ── Crop picker sheet ──
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(6,20,15,0.55)',
  },
  pickerSheet: {
    margin: spacing.lg,
    marginBottom: 140,
    padding: spacing.lg,
    borderRadius: 24,
    backgroundColor: 'rgba(20,38,32,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  pickerTitle: { ...typography.title, fontSize: 18 },
  pickerSub: { ...typography.body, color: palette.fog, marginTop: 4, marginBottom: 16 },
  pickerRow: { flexDirection: 'row', gap: 12 },
  cropChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  cropChipOff: { opacity: 0.4 },
  cropEmoji: { fontSize: 34, marginBottom: 8 },
  cropLabel: { color: palette.white, fontSize: 13, fontWeight: '800' },
  cropTime: { color: palette.fog, fontSize: 11, fontWeight: '700', marginTop: 3 },
  cropPrice: { color: '#FFE9A8', fontSize: 12, fontWeight: '900', marginTop: 4 },
  cropPriceOff: { color: 'rgba(255,160,140,0.95)' },
  cropSwatch: { width: 22, height: 5, borderRadius: 3, marginTop: 8 },

  // ── Wallet HUD ──
  hudRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  hudAlign: { alignSelf: 'flex-start' },
  hudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(12,32,27,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  hudCoins: { color: '#FFE9A8', fontSize: 14, fontWeight: '900', letterSpacing: 0.2 },
  hudDivider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.22)' },
  hudStat: { color: palette.white, fontSize: 13.5, fontWeight: '800' },
  shopBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(124,203,107,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  shopBtnText: { color: palette.ink, fontSize: 13.5, fontWeight: '900', letterSpacing: 0.2 },

  // ── Shop sheet ──
  shopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  shopBalance: { color: '#FFE9A8', fontSize: 16, fontWeight: '900' },
  shopSection: {
    color: palette.mint,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  shopSeedRow: { flexDirection: 'row', gap: 10 },
  shopSeedChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  shopSeedEmoji: { fontSize: 24, marginBottom: 4 },
  shopSeedPrice: { color: '#FFE9A8', fontSize: 12, fontWeight: '900' },
  shopBuyRow: { flexDirection: 'row', gap: 12 },
  shopBuyChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  shopBuyOff: { opacity: 0.4 },
  shopBuyEmoji: { fontSize: 30, marginBottom: 6 },
  shopBuyLabel: { color: palette.white, fontSize: 13, fontWeight: '800' },
  shopBuyPrice: { color: '#FFE9A8', fontSize: 12.5, fontWeight: '900', marginTop: 4 },
});
