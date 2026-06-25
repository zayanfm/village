/**
 * ShopSheet.js — the co-op farm shop (pure RN bottom-sheet overlay).
 *
 * Opened from the FarmHud's 🛒 button. Lets the shared wallet SPEND coins on three
 * small things, mirroring VolunteerHome's `pickerSheet` moti/glass idiom exactly:
 *   1. SEEDS       — informational price list (SEED_PRICE). Buying a seed actually
 *                    happens in the field's crop picker (cost deducted on plant);
 *                    this section just shows what each costs.
 *   2. +1 ANIMAL   — buy a 🐔 chicken or 🐖 pig that APPENDS to this farm's pen.
 *                    Disabled when unaffordable OR the pen is full (ANIMAL_MAX).
 *   3. DECORATIONS — one-off cosmetics (DECOR). Disabled when already owned OR
 *                    unaffordable.
 *
 * Like FarmGrid / AnimalRow / FarmHud it owns ZERO Firebase and ZERO game logic.
 * It renders entirely from PLAIN PROPS and reports intent through `onBuyAnimal(kind)`
 * / `onBuyDecor(id)` / `onClose()` callbacks — the parent (a screen) runs the
 * guarded buy on FarmContext. No `<Canvas>`, no context, no IO, no per-frame work.
 * Affordability/cap checks here are presentational (disable + dim); the real guard
 * lives in the model layer the callbacks reach.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { palette, radius, spacing, typography } from '../../theme/theme';
import { CROPS, SEED_PRICE, ANIMAL_PRICE, ANIMAL_MAX, DECOR } from '../../game/farmModel';

// Animals offered, in display order, with their glyphs.
const ANIMAL_OFFER = [
  { kind: 'chicken', emoji: '🐔', label: 'Chicken' },
  { kind: 'pig', emoji: '🐖', label: 'Pig' },
];

/* --------------------------- small atoms ------------------------------------ */

/** Section header label. */
function SectionTitle({ children }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

/**
 * BuyRow — a single purchasable line (animal or decor).
 *
 * @param {string}  emoji     item glyph
 * @param {string}  label     item name
 * @param {number}  price     coin cost
 * @param {boolean} disabled  greys out + blocks the tap
 * @param {string}  note      optional right-side status text ('Pen full' / 'Owned')
 * @param {fn}      onPress   () => callback
 */
function BuyRow({ emoji, label, price, disabled, note, onPress }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.buyRow,
        disabled && styles.buyRowDisabled,
        pressed && !disabled && styles.buyRowPressed,
      ]}
    >
      <Text style={styles.buyEmoji}>{emoji}</Text>
      <Text style={styles.buyLabel}>{label}</Text>
      <View style={styles.buyRight}>
        {note ? (
          <Text style={styles.buyNote}>{note}</Text>
        ) : (
          <View style={styles.priceChip}>
            <Text style={styles.priceText}>🪙 {price}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/* --------------------------- main component --------------------------------- */

/**
 * ShopSheet — the spend-coins shop overlay.
 *
 * @param {boolean}  visible       mount + animate the sheet in when true
 * @param {number}   coins         current shared wallet balance (gates affordability)
 * @param {number}   animalsCount  current pen size (gates ANIMAL_MAX cap)
 * @param {string[]} decorOwned    owned decor ids (gates "Owned")
 * @param {fn}       onClose       () => void — backdrop / done tap
 * @param {fn}       onBuyAnimal   (kind) => void — append a chicken/pig
 * @param {fn}       onBuyDecor    (decorId) => void — buy a cosmetic
 */
export default function ShopSheet({
  visible = false,
  coins = 0,
  animalsCount = 0,
  decorOwned = [],
  onClose,
  onBuyAnimal,
  onBuyDecor,
}) {
  if (!visible) return null;

  const penFull = animalsCount >= ANIMAL_MAX;
  const owned = Array.isArray(decorOwned) ? decorOwned : [];

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <MotiView
        from={{ opacity: 0, translateY: 28 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'spring', damping: 18, stiffness: 200 }}
        style={styles.sheet}
      >
        {/* header */}
        <View style={styles.header}>
          <Text style={styles.title}>🛒 Farm Shop</Text>
          <View style={styles.walletPill}>
            <Text style={styles.walletText}>🪙 {coins}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 1 ── Seeds (informational) */}
          <SectionTitle>Seeds — plant from the field</SectionTitle>
          <View style={styles.seedRow}>
            {Object.entries(CROPS).map(([key, def]) => (
              <View key={key} style={styles.seedChip}>
                <Text style={styles.seedEmoji}>{def.emoji[4]}</Text>
                <Text style={styles.seedLabel}>{def.label}</Text>
                <View style={styles.priceChipSm}>
                  <Text style={styles.priceText}>🪙 {SEED_PRICE[key]}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* 2 ── Animals */}
          <SectionTitle>+1 Animal</SectionTitle>
          {ANIMAL_OFFER.map(({ kind, emoji, label }) => {
            const price = ANIMAL_PRICE[kind];
            const unaffordable = coins < price;
            return (
              <BuyRow
                key={kind}
                emoji={emoji}
                label={label}
                price={price}
                disabled={penFull || unaffordable}
                note={penFull ? 'Pen full' : undefined}
                onPress={() => onBuyAnimal && onBuyAnimal(kind)}
              />
            );
          })}

          {/* 3 ── Decorations */}
          <SectionTitle>Decorations</SectionTitle>
          {Object.entries(DECOR).map(([id, def]) => {
            const isOwned = owned.includes(id);
            const unaffordable = coins < def.price;
            return (
              <BuyRow
                key={id}
                emoji={def.emoji}
                label={def.label}
                price={def.price}
                disabled={isOwned || unaffordable}
                note={isOwned ? 'Owned' : undefined}
                onPress={() => onBuyDecor && onBuyDecor(id)}
              />
            );
          })}
        </ScrollView>

        {/* done */}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.doneBtn, pressed && styles.doneBtnPressed]}
        >
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </MotiView>
    </View>
  );
}

/* --------------------------------- styles ----------------------------------- */
/* Mirrors VolunteerHome's pickerOverlay / pickerSheet glass idiom. */

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(6,20,15,0.55)',
    zIndex: 50,
  },
  sheet: {
    margin: spacing.lg,
    marginBottom: 60,
    padding: spacing.lg,
    borderRadius: 24,
    backgroundColor: 'rgba(20,38,32,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    maxHeight: '78%',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { ...typography.title, fontSize: 18 },
  walletPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(246,173,85,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(246,173,85,0.45)',
  },
  walletText: {
    color: palette.amberGlow,
    fontWeight: '900',
    fontSize: 13.5,
    fontVariant: ['tabular-nums'],
  },

  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: spacing.sm },

  sectionTitle: {
    color: palette.fog,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  // seeds — informational chips (reuse crop-picker chip language)
  seedRow: { flexDirection: 'row', gap: spacing.sm },
  seedChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  seedEmoji: { fontSize: 26, marginBottom: 4 },
  seedLabel: { color: palette.cloud, fontSize: 11.5, fontWeight: '800', marginBottom: 5 },

  // purchasable rows (animals + decor)
  buyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    marginBottom: spacing.sm,
  },
  buyRowDisabled: { opacity: 0.4 },
  buyRowPressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  buyEmoji: { fontSize: 24 },
  buyLabel: { flex: 1, color: palette.white, fontSize: 14, fontWeight: '800' },
  buyRight: { alignItems: 'flex-end' },
  buyNote: {
    color: palette.fog,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  priceChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(246,173,85,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(246,173,85,0.4)',
  },
  priceChipSm: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(246,173,85,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(246,173,85,0.4)',
  },
  priceText: {
    color: palette.amberGlow,
    fontWeight: '900',
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
  },

  doneBtn: {
    marginTop: spacing.md,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(110,231,183,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.4)',
  },
  doneBtnPressed: { backgroundColor: 'rgba(110,231,183,0.3)' },
  doneLabel: { color: palette.mintSoft, fontWeight: '900', fontSize: 13.5, letterSpacing: 0.3 },
});
