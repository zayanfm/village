/**
 * AnimalRow.js — the youth's pure 2D co-op barnyard (pig + chickens).
 *
 * Sibling of <FarmGrid>: the feed → produce → collect loop for the farm animals,
 * kept in its own file so the crop grid stays untouched. Like FarmGrid it owns
 * ZERO Firebase and ZERO game logic — it renders entirely from PLAIN PROPS
 * (FarmContext → farmModel.animalView) and reports a single tap intent back
 * through `onTap(index)`. No `<Canvas>`, no context, no IO.
 *
 * Each AnimalCard paints the animal glyph + state cues, reusing FarmGrid's exact
 * visual language (timerChip, ripeGlow halo, soil ridge, spring glyph-pop):
 *   • hungry    → amber "Feed 🌾" prompt (tappable → onTap(index))
 *   • producing → m:ss countdown chip + thin progress bar (NOT tappable)
 *   • ready     → glowing "Collect 🥚/🍄" prompt + ripe-glow halo (tappable)
 * A `🥚×N` / `🍄×N` footer shows this pen's lifetime produce.
 *
 * The parent (YouthGardenPlot) wires `onTap={(i) => f.tapAnimal(i)}` — tapAnimal
 * runs the shared feed-or-collect ladder by current state, so there is no
 * separate feed/collect branch here. Producing animals are non-interactive.
 *
 * Rendering is 2D moti / Pressable only: the glyph is re-keyed on the
 * hungry|producing|ready state string so it scale-pops on each transition, and
 * the ready pen pulses a soft glow.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { palette, radius, spacing } from '../../theme/theme';

/* --------------------------- one pen ---------------------------------------- */

/**
 * AnimalCard — one pen in the barnyard (a pig or a chicken).
 *
 * @param {object} animal  a farmModel.animalView object for this index
 * @param {fn}     onPress () => onTap(index)
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
  // Only hungry (feed) and ready (collect) pens are interactive; producing is a wait.
  const tappable = hungry || ready;
  // moti state string re-keys the glyph-pop on each transition.
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
 * AnimalRow — the youth's barnyard row of feedable animals.
 *
 * The animal list is now DYNAMIC (3 starter pens, growable to a cap of 6 via the
 * shop's "+1 animal"). To stay readable as the pen grows we chunk the cards into
 * rows of up to 3 — a single flex row of 6 would squeeze each card too thin. The
 * `.map` stays index-keyed so a bought pig at index 3 renders the moment it lands
 * in `f.animals`; empty animals render nothing (back-compat / offline-safe).
 *
 * @param {object[]} animals  farmModel.animalView objects (pig + chickens); when
 *                            empty the row renders nothing (back-compat / offline-safe)
 * @param {number}   now      shared 1s tick (re-renders countdowns; not read directly)
 * @param {fn}       onTap    (index) => void — parent runs the feed/collect ladder
 */
const PER_ROW = 3;

export default function AnimalRow({ animals = [], now = Date.now(), onTap }) {
  if (!Array.isArray(animals) || animals.length === 0) return null;

  // Chunk into rows of up to PER_ROW so the barnyard stays tidy at 4–6 pens.
  const rows = [];
  for (let i = 0; i < animals.length; i += PER_ROW) {
    rows.push(animals.slice(i, i + PER_ROW));
  }
  // Pad the final row with invisible spacers so cards keep a consistent width
  // (a lone 4th animal shouldn't balloon to full width).
  const lastFill = rows.length ? PER_ROW - rows[rows.length - 1].length : 0;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 260 }}
      style={styles.barn}
    >
      <Text style={styles.barnLabel}>Barnyard</Text>
      {rows.map((row, r) => {
        const isLast = r === rows.length - 1;
        return (
          <View
            key={`animal-row-${r}`}
            style={[styles.animalRow, r > 0 && styles.animalRowGap]}
          >
            {row.map((animal) => (
              <AnimalCard
                key={`animal-${animal.index}`}
                animal={animal}
                onPress={() => onTap && onTap(animal.index)}
              />
            ))}
            {isLast &&
              lastFill > 0 &&
              Array.from({ length: lastFill }).map((_, k) => (
                <View key={`spacer-${k}`} style={styles.animalCell} />
              ))}
          </View>
        );
      })}
    </MotiView>
  );
}

/* --------------------------------- styles ----------------------------------- */
/* Mirrors FarmGrid's animal styles verbatim so the barnyard shares the crop
   grid's visual language (timerChip, ripeGlow, soil). */

const styles = StyleSheet.create({
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
  animalRowGap: { marginTop: spacing.sm },
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
  tilePressed: { backgroundColor: 'rgba(255,255,255,0.14)' },

  ripeGlow: {
    position: 'absolute',
    width: '70%',
    aspectRatio: 1,
    borderRadius: 999,
    opacity: 0.4,
  },

  animalGlyphWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  animalGlyph: { fontSize: 40, textAlign: 'center' },

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
});
