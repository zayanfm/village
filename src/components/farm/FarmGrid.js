/**
 * FarmGrid.js — the youth's pure 2D FarmVille 4×4 grid surface.
 *
 * Replaces the single-plot `GardenPlot` with a 4×4 = 16 independent tilled tiles.
 * Like GardenPlot it owns ZERO Firebase and ZERO game logic: it renders entirely
 * from PLAIN PROPS computed upstream (FarmContext → farmModel.tileView), and reports
 * intent back through callbacks. No `<Canvas>`, no context, no IO.
 *
 * Each tile paints soil + the crop glyph at its current `tile.stage`, a per-tile
 * countdown timer (`tile.remainingLabel`, m:ss) while growing, a ripe glow at
 * stage 4, and a "+" prompt when empty. A tap on a tile calls `onTileTap(index)`
 * (the parent runs the shared contextual ladder: empty→pick, ripe→harvest,
 * partner-acted→fertilize, else water). When the parent decides a tile needs a
 * crop choice it sets `pickerIndex` and we render an inline crop tray; choosing a
 * crop calls `onPick(index, cropKey)`.
 *
 * Rendering is 2D moti / Pressable only (matches the GardenPlot idiom): the crop
 * glyph is re-keyed on `stage` so it scale-pops when a tile advances a stage, and
 * the ripe tile pulses a soft glow.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { palette, radius, spacing } from '../../theme/theme';
import { CROPS, STAGES, formatRemaining, SEED_PRICE } from '../../game/farmModel';

// Crops offered in the inline picker tray, in display order.
const PLANTABLE = Object.keys(CROPS); // ['tomato','sunflower','pumpkin']

/* --------------------------- small UI atoms --------------------------------- */

/**
 * FarmTile — one square tilled plot.
 *
 * @param {object}   tile     a farmModel.tileView object for this index
 * @param {boolean}  picking  true when this tile's inline crop picker is open
 * @param {boolean}  canPick  whether planting is allowed (gates picker chips)
 * @param {number}   coins    shared wallet balance (gates per-crop seed chips)
 * @param {number}   nudge    a monotonically-changing token; when it changes the
 *                            tile does a 1-shot translateX wobble (the 'growing'
 *                            never-dead tap feedback). 0/undefined = no wobble.
 * @param {fn}       onPress  () => onTileTap(index)
 * @param {fn}       onPick   (cropKey) => onPick(index, cropKey)
 */
function FarmTile({ tile, picking, canPick, coins = 0, nudge = 0, onPress, onPick }) {
  const { empty, ripe, stage, crop, color, emoji, remainingLabel, yourTurn } = tile;
  const accent = color || palette.mint;
  // Empty tiles show a faint "+", planted tiles show the stage glyph.
  const glyph = empty ? '+' : emoji || (crop ? CROPS[crop].emoji[STAGES - 1] : '·');

  return (
    <View style={styles.cell}>
      {/* wobble wrapper — re-keyed on `nudge` so a tap on a still-cooling crop
          gives a tiny shake instead of a silent no-op (the 'growing' feedback). */}
      <MotiView
        key={`nudge-${tile.index}-${nudge}`}
        from={nudge ? { translateX: -5 } : undefined}
        animate={{ translateX: 0 }}
        transition={{ type: 'spring', damping: 4, stiffness: 600, mass: 0.4 }}
      >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.tile,
          empty && styles.tileEmpty,
          yourTurn && styles.tileTurn,
          picking && styles.tilePicking,
          pressed && styles.tilePressed,
        ]}
      >
        {/* ripe glow halo */}
        {ripe && (
          <MotiView
            pointerEvents="none"
            from={{ opacity: 0.3, scale: 0.85 }}
            animate={{ opacity: [0.3, 0.7], scale: [0.9, 1.15] }}
            transition={{ type: 'timing', duration: 1300, loop: true, repeatReverse: true }}
            style={[styles.ripeGlow, { backgroundColor: accent }]}
          />
        )}

        {/* crop glyph — re-keyed on stage so it scale-pops each growth stage */}
        <MotiView
          key={`tile-${tile.index}-${crop || 'empty'}-${stage}`}
          from={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 12, stiffness: 200 }}
          style={styles.tileGlyphWrap}
        >
          <Text style={[styles.tileGlyph, empty && styles.tileGlyphEmpty]}>{glyph}</Text>
        </MotiView>

        {/* countdown timer chip — only while a crop is growing (not empty, not ripe) */}
        {!empty && !ripe && (
          <View style={styles.timerChip}>
            <Text style={styles.timerText}>{remainingLabel}</Text>
          </View>
        )}

        {/* ripe badge */}
        {ripe && (
          <View style={[styles.ripeBadge, { borderColor: accent }]}>
            <Text style={styles.ripeText}>RIPE</Text>
          </View>
        )}

        {/* soil ridge */}
        <View style={styles.soil} />
      </Pressable>
      </MotiView>

      {/* inline crop picker for this tile (FarmVille "choose a seed" beat).
          Each seed now costs coins: the chip shows 🪙<price> and disables when
          the shared wallet can't afford it (also gated by canPick). */}
      {picking && (
        <MotiView
          from={{ opacity: 0, translateY: -4, scale: 0.96 }}
          animate={{ opacity: 1, translateY: 0, scale: 1 }}
          transition={{ type: 'timing', duration: 160 }}
          style={styles.picker}
        >
          {PLANTABLE.map((key) => {
            const def = CROPS[key];
            const price = SEED_PRICE?.[key] ?? 0;
            const affordable = coins >= price;
            const enabled = canPick && affordable;
            return (
              <Pressable
                key={key}
                onPress={enabled ? () => onPick(key) : undefined}
                disabled={!enabled}
                style={({ pressed }) => [
                  styles.seedChip,
                  { borderColor: def.color },
                  !enabled && styles.seedChipDisabled,
                  pressed && enabled && styles.tilePressed,
                ]}
              >
                <Text style={styles.seedGlyph}>{def.emoji[STAGES - 1]}</Text>
                <Text style={styles.seedLabel}>{def.label}</Text>
                <Text style={styles.seedTime}>{formatRemaining(def.growMs)}</Text>
                <Text
                  style={[
                    styles.seedPrice,
                    !affordable && styles.seedPriceShort,
                  ]}
                >
                  🪙{price}
                </Text>
              </Pressable>
            );
          })}
        </MotiView>
      )}
    </View>
  );
}

/**
 * AnimalCard — one pen in the animal row (pig or chicken).
 *
 * Mirrors the FarmTile visual language but for the feed→produce→collect loop.
 * Renders entirely from a farmModel.animalView object. A tap calls onPress,
 * which the parent routes through the animal contextual ladder (hungry→feed,
 * ready→collect, producing→no-op).
 *
 * @param {object} animal  a farmModel.animalView object for this index
 * @param {fn}     onPress () => onAnimalTap(index)
 */
function AnimalCard({ animal, onPress }) {
  const {
    emoji,
    produceEmoji,
    color,
    hungry,
    ready,
    progress,
    remainingLabel,
    collectCount,
  } = animal;
  const accent = color || palette.mint;
  // hungry → idle glyph; producing/ready → the animal still, with state cues.
  const tappable = hungry || ready;
  // moti state string re-keys the stage-pop on each transition.
  const state = hungry ? 'hungry' : ready ? 'ready' : 'producing';

  return (
    <View style={styles.animalCell}>
      <Pressable
        onPress={tappable ? onPress : undefined}
        disabled={!tappable}
        style={({ pressed }) => [
          styles.animalCard,
          hungry && styles.animalHungry,
          ready && styles.animalReady,
          ready && { borderColor: accent },
          pressed && tappable && styles.tilePressed,
        ]}
      >
        {/* ready glow halo — reuses the ripe-tile glow idiom */}
        {ready && (
          <MotiView
            pointerEvents="none"
            from={{ opacity: 0.3, scale: 0.85 }}
            animate={{ opacity: [0.3, 0.7], scale: [0.9, 1.15] }}
            transition={{ type: 'timing', duration: 1300, loop: true, repeatReverse: true }}
            style={[styles.ripeGlow, { backgroundColor: accent }]}
          />
        )}

        {/* animal glyph — re-keyed on state so it scale-pops each transition */}
        <MotiView
          key={`animal-${animal.index}-${state}`}
          from={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 12, stiffness: 200 }}
          style={styles.animalGlyphWrap}
        >
          <Text style={styles.animalGlyph}>{emoji}</Text>
        </MotiView>

        {/* produce timer chip + progress bar while producing */}
        {state === 'producing' && (
          <>
            <View style={styles.timerChip}>
              <Text style={styles.timerText}>{remainingLabel}</Text>
            </View>
            <View style={styles.animalBarTrack}>
              <View
                style={[
                  styles.animalBarFill,
                  { width: `${Math.round((progress || 0) * 100)}%`, backgroundColor: accent },
                ]}
              />
            </View>
          </>
        )}

        {/* action label */}
        <View style={styles.animalAction}>
          {hungry && <Text style={styles.animalFeed}>Feed 🌾</Text>}
          {ready && (
            <Text style={[styles.animalCollect, { color: accent }]}>
              Collect {produceEmoji}
            </Text>
          )}
        </View>

        {/* lifetime produce footer */}
        {collectCount > 0 && (
          <View style={styles.animalCount}>
            <Text style={styles.animalCountText}>
              {produceEmoji}×{collectCount}
            </Text>
          </View>
        )}

        {/* soil ridge — shared with tiles */}
        <View style={styles.soil} />
      </Pressable>
    </View>
  );
}

/* --------------------------- main component --------------------------------- */

/**
 * FarmGrid — the youth's 4×4 co-op farm surface.
 *
 * @param {object[]} tiles        16 farmModel.tileView objects (index 0..15, row-major)
 * @param {object[]} animals      farmModel.animalView objects (pig + chickens); optional
 * @param {string}   role         'youth' (passed through for parity; logic lives upstream)
 * @param {string}   youthName    display name (for the status line)
 * @param {boolean}  synced       false → show offline-sandbox pill
 * @param {number}   now          shared 1s tick (re-renders timers; not read directly)
 * @param {number}   harvestCount lifetime crops grown together
 * @param {number}   pickerIndex  tile index whose inline picker is open, or -1/null
 * @param {number}   coins        shared wallet (gates per-crop seed chips by price)
 * @param {number}   nudgeIndex   tile index to wobble (the 'growing' never-dead tap)
 * @param {number}   nudgeToken   bumps on each 'growing' tap so re-taps re-fire the
 *                                wobble even on the same tile
 * @param {string}   statusLine   optional HUD line (farmModel.farmStatus)
 * @param {fn}       onTileTap    (index) => void — parent runs the contextual ladder
 * @param {fn}       onPick       (index, cropKey) => void — plant a chosen crop
 * @param {fn}       onAnimalTap  (index) => void — parent runs the feed/collect ladder
 */
export default function FarmGrid({
  tiles = [],
  animals = [],
  role = 'youth',
  youthName = 'your friend',
  synced = false,
  now = Date.now(),
  harvestCount = 0,
  pickerIndex = -1,
  coins = 0,
  nudgeIndex = -1,
  nudgeToken = 0,
  statusLine,
  onTileTap,
  onPick,
  onAnimalTap,
}) {
  // Build 4 rows of 4 from the dense tile list.
  const rows = [];
  for (let r = 0; r < 4; r++) {
    rows.push(tiles.slice(r * 4, r * 4 + 4));
  }

  return (
    <View style={styles.root}>
      {/* status / reciprocity line */}
      <MotiView
        from={{ opacity: 0, translateY: -6 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 240 }}
        style={styles.statusWrap}
      >
        <Text style={styles.statusText}>
          {statusLine || `${youthName}'s field`}
        </Text>
      </MotiView>

      {/* the 4×4 grid */}
      <ScrollView
        contentContainerStyle={styles.gridScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {rows.map((row, r) => (
            <View key={`row-${r}`} style={styles.gridRow}>
              {row.map((tile) => (
                <FarmTile
                  key={`tile-${tile.index}`}
                  tile={tile}
                  picking={pickerIndex === tile.index}
                  canPick={tile.can.plant}
                  coins={coins}
                  nudge={nudgeIndex === tile.index ? nudgeToken : 0}
                  onPress={() => onTileTap && onTileTap(tile.index)}
                  onPick={(cropKey) => onPick && onPick(tile.index, cropKey)}
                />
              ))}
            </View>
          ))}
        </View>

        {/* the barnyard — a small row of feedable animals (pig + chickens) */}
        {animals.length > 0 && (
          <View style={styles.barn}>
            <Text style={styles.barnLabel}>Barnyard</Text>
            <View style={styles.animalRow}>
              {animals.map((animal) => (
                <AnimalCard
                  key={`animal-${animal.index}`}
                  animal={animal}
                  onPress={() => onAnimalTap && onAnimalTap(animal.index)}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* relationship streak — lifetime crops grown together */}
      <View style={styles.footer}>
        <View style={styles.streakPill}>
          <Text style={styles.streakText}>🌱 Grown together: {harvestCount}</Text>
        </View>
        {!synced && (
          <View style={styles.sandboxPill}>
            <Text style={styles.sandboxText}>📦 offline sandbox</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/* --------------------------------- styles ----------------------------------- */

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.md },

  statusWrap: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: spacing.md,
  },
  statusText: {
    color: palette.cloud,
    fontSize: 14.5,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  gridScroll: { paddingBottom: spacing.md },
  grid: { gap: spacing.sm },
  gridRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },

  cell: { flex: 1 },

  tile: {
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: palette.forestMoss,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileEmpty: { backgroundColor: palette.pineShadow },
  tileTurn: { borderColor: 'rgba(94,234,212,0.55)', borderWidth: 1.5 },
  tilePicking: { borderColor: palette.mint, borderWidth: 1.5 },
  tilePressed: { backgroundColor: 'rgba(255,255,255,0.14)' },

  ripeGlow: {
    position: 'absolute',
    width: '70%',
    aspectRatio: 1,
    borderRadius: 999,
    opacity: 0.4,
  },
  tileGlyphWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tileGlyph: { fontSize: 40, textAlign: 'center' },
  tileGlyphEmpty: { fontSize: 30, opacity: 0.3, color: palette.fog, fontWeight: '300' },

  timerChip: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  timerText: {
    color: palette.cloud,
    fontWeight: '800',
    fontSize: 10.5,
    fontVariant: ['tabular-nums'],
  },

  ripeBadge: {
    position: 'absolute',
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  ripeText: { color: palette.mintSoft, fontWeight: '900', fontSize: 10, letterSpacing: 0.5 },

  soil: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 14,
    backgroundColor: palette.pineShadow,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(0,0,0,0.25)',
  },

  // inline per-tile crop picker
  picker: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  seedChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  seedChipDisabled: { opacity: 0.4 },
  seedGlyph: { fontSize: 18 },
  seedLabel: { color: palette.cloud, fontWeight: '700', fontSize: 9.5 },
  seedTime: { color: palette.fog, fontWeight: '700', fontSize: 8.5, fontVariant: ['tabular-nums'] },
  seedPrice: {
    color: palette.amberGlow,
    fontWeight: '900',
    fontSize: 9.5,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  seedPriceShort: { color: palette.fog },

  // barnyard — the feedable animal row beneath the crop grid
  barn: { marginTop: spacing.md },
  barnLabel: {
    color: palette.fog,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  animalRow: { flexDirection: 'row', gap: spacing.sm },
  animalCell: { flex: 1 },
  animalCard: {
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: palette.forestMoss,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  animalHungry: { borderColor: 'rgba(246,173,85,0.5)', borderWidth: 1.5 },
  animalReady: { borderWidth: 1.5 },
  animalGlyphWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  animalGlyph: { fontSize: 40, textAlign: 'center' },

  animalBarTrack: {
    position: 'absolute',
    bottom: 18,
    left: 10,
    right: 10,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    overflow: 'hidden',
  },
  animalBarFill: { height: '100%', borderRadius: 999 },

  animalAction: { position: 'absolute', bottom: 4 },
  animalFeed: { color: palette.amberGlow, fontWeight: '900', fontSize: 11, letterSpacing: 0.3 },
  animalCollect: { fontWeight: '900', fontSize: 11, letterSpacing: 0.3 },

  animalCount: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  animalCountText: {
    color: palette.cloud,
    fontWeight: '800',
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  streakPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(110,231,183,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.4)',
  },
  streakText: { color: palette.mintSoft, fontWeight: '800', fontSize: 12.5 },
  sandboxPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(246,173,85,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(246,173,85,0.45)',
  },
  sandboxText: { color: palette.amberGlow, fontWeight: '800', fontSize: 11.5 },
});
