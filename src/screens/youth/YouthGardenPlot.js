/**
 * YouthGardenPlot.js — The youth side of the co-op Shared Farm.
 *
 * A cozy, off-peak "FarmVille-lite" farm the youth tends TOGETHER with their
 * social worker. Each youth owns a 4x4 grid of 16 independent tilled tiles,
 * stored as the `farm` map on youth_profiles/{firestoreId}. Both people plant /
 * water / fertilize the SAME tiles across two devices; growth is passive
 * wall-clock time, so every tile keeps climbing even when nobody is online.
 *
 * This screen is intentionally THIN:
 *   - identity comes from <YouthSessionContext> (firestoreId + userName)
 *   - all farm state + actions come from useFarm(firestoreId, 'youth')
 *   - all crop visuals + per-tile action wiring live in <FarmGrid>
 *   - the co-op barnyard (1 pig + 2 chickens you FEED → COLLECT egg/truffle)
 *     lives in the sibling <AnimalRow>, fed the same useFarm data: the
 *     `animals` views + a single `tapAnimal(i)` that runs feed-or-collect by
 *     state. Animals ride the SAME shared `farm` doc + 1s `now` tick + offline
 *     sandbox as the crops, so they stay co-op and never crash unconfigured.
 *
 * No <Canvas> here (2D moti only) — so it bundles cleanly in Expo Go and never
 * spins up a new WebGL context. When Firebase is unconfigured or the youth is
 * not yet linked to a worker, useFarm transparently falls back to a local
 * sandbox seeded from defaultFarm(), so the farm is always playable and NEVER
 * crashes (mirrors the offline-tolerant guards used app-wide).
 *
 * Entry: reached from the cozy room via the "Our Garden 🌱" HUD button on
 * YouthRoomHome. No route params required.
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import FarmGrid from '../../components/farm/FarmGrid';
import AnimalRow from '../../components/farm/AnimalRow';
import FarmHud from '../../components/farm/FarmHud';
import ShopSheet from '../../components/farm/ShopSheet';
import { useFarm } from '../../context/FarmContext';
import { useYouthSession } from '../../context/YouthSessionContext';
import { DECOR } from '../../game/farmModel';
import { pastel, youthRadius as rad } from './youthTheme';

export default function YouthGardenPlot({ navigation }) {
  const { firestoreId, userName } = useYouthSession();

  // The youth is always the 'youth' role. firestoreId may be null (guest /
  // unconfigured) — useFarm handles that by serving a local sandbox farm.
  const f = useFarm(firestoreId, 'youth');

  // Persistent co-op economy off the SAME shared farm doc. Read defensively so
  // the screen never crashes if a field is briefly absent (offline / migrating).
  const coins = f.coins ?? 0;
  const counts = f.counts ?? { crops: 0, eggs: 0, truffles: 0 };
  const decor = f.decor ?? [];

  // Which tile the crop picker is open for (null = closed). Empty-tile taps
  // surface as kind 'pick' from tapTile; we don't mutate there — we open the
  // picker so the youth chooses a crop, then buy-and-plant on that tile.
  const [picker, setPicker] = useState(null);

  // Shop sheet (spend coins on seeds-info / +1 animal / decor).
  const [shopOpen, setShopOpen] = useState(false);

  // 'growing' never-dead feedback: when a tap lands on a still-cooling crop the
  // ladder returns 'growing' (no mutation) — we wobble that tile instead of a
  // silent no-op. `token` bumps every time so re-taps on the SAME tile re-fire.
  const [nudge, setNudge] = useState({ index: -1, token: 0 });

  // Contextual per-tile tap. tapTile runs the shared ladder and performs
  // fertilize / harvest inline; 'pick' opens the picker, 'growing' wobbles.
  const handleTileTap = (i) => {
    const kind = f.tapTile(i);
    if (kind === 'pick') {
      setPicker(i);
    } else if (kind === 'growing') {
      // Cooling down — give a tiny shake so the tap never feels dead.
      setNudge((n) => ({ index: i, token: n.token + 1 }));
    }
  };

  const handlePick = (i, crop) => {
    // Seeds cost coins now — buySeedPlant guards affordability + plant; the
    // picker chips already disable unaffordable crops, this is the spend path.
    (f.buySeedPlant || f.doPlant)(i, crop);
    setPicker(null);
  };

  // Shop spend handlers (guarded upstream in the context; no-op if unaffordable).
  const handleBuyAnimal = (kind) => f.buyAnimal && f.buyAnimal(kind);
  const handleBuyDecor = (id) => f.buyDecor && f.buyDecor(id);

  // Status copy is written from the OTHER person's perspective, so on the youth
  // device we want the worker's actions to read naturally. FarmGrid uses
  // `youthName`; here that's effectively "your" farm, so we pass a friendly
  // label the grid can weave in.
  const youthName = userName || 'you';

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation?.goBack?.()}
            hitSlop={12}
            style={styles.back}
          >
            <Text style={styles.backText}>‹ Back home</Text>
          </Pressable>

          <MotiView
            from={{ opacity: 0, translateY: -8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 360 }}
          >
            <Text style={styles.title}>Our Garden 🌱</Text>
            <Text style={styles.subtitle}>
              A little farm you and your worker grow together — tap a square to
              plant, tend, or harvest. No rush, it keeps growing on its own.
            </Text>
          </MotiView>

          {/* Persistent co-op economy HUD — shared wallet + lifetime tallies off
              the SAME farm doc, so it stays in lockstep with the worker's village.
              The 🛒 button opens the shop sheet to spend coins. */}
          <View style={styles.hudWrap}>
            <FarmHud
              coins={coins}
              counts={counts}
              onShop={() => setShopOpen(true)}
            />
          </View>

          {/* Owned decorations — a tiny cosmetic strip under the HUD. */}
          {decor.length > 0 && (
            <View style={styles.decorStrip}>
              {decor.map((id) => (
                <Text key={id} style={styles.decorGlyph}>
                  {DECOR?.[id]?.emoji || '✨'}
                </Text>
              ))}
            </View>
          )}
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <MotiView
          from={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 16, stiffness: 140 }}
        >
          <FarmGrid
            tiles={f.tiles}
            role="youth"
            youthName={youthName}
            now={f.now}
            synced={f.synced}
            harvestCount={f.harvestCount}
            pickerIndex={picker ?? -1}
            coins={coins}
            nudgeIndex={nudge.index}
            nudgeToken={nudge.token}
            onTileTap={handleTileTap}
            onPick={handlePick}
          />

          {/* Co-op barnyard — pig + chickens fed off the SAME shared farm data.
              tapAnimal(i) runs the feed→collect loop by current state; no extra
              local handler needed (mirrors how tapTile drives the crop ladder). */}
          <AnimalRow
            animals={f.animals}
            now={f.now}
            onTap={(i) => f.tapAnimal(i)}
          />
        </MotiView>

        {!f.synced && (
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 500, delay: 200 }}
            style={styles.sandboxHint}
          >
            <Text style={styles.sandboxText}>
              🌿 Practice plot — growing just on this device for now. Once you're
              linked to your worker, you'll tend it together.
            </Text>
          </MotiView>
        )}
      </ScrollView>

      {/* Shop sheet — spend the shared coins on seeds (info), +1 animal, or decor.
          All buys are guarded upstream in useFarm (balance / pen-cap / dup), so
          unaffordable options come back disabled and a tap is a safe no-op. */}
      <ShopSheet
        visible={shopOpen}
        coins={coins}
        animalsCount={f.animals?.length ?? 0}
        decorOwned={decor}
        onClose={() => setShopOpen(false)}
        onBuyAnimal={handleBuyAnimal}
        onBuyDecor={handleBuyDecor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#2A2436' },
  safe: { backgroundColor: '#2A2436' },
  header: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  back: { alignSelf: 'flex-start', marginBottom: 6 },
  backText: { color: pastel.amber, fontWeight: '800', fontSize: 15 },
  title: { color: pastel.white, fontWeight: '900', fontSize: 26 },

  hudWrap: { marginTop: 14, alignItems: 'center' },
  decorStrip: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  decorGlyph: { fontSize: 20 },

  subtitle: {
    color: pastel.sub,
    fontWeight: '600',
    fontSize: 13.5,
    marginTop: 6,
    lineHeight: 19,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },

  sandboxHint: {
    marginTop: 18,
    padding: 14,
    borderRadius: rad.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sandboxText: {
    color: pastel.cream,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 19,
  },
});
