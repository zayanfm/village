/**
 * FarmHud.js — the shared co-op economy HUD bar (pure RN overlay).
 *
 * One glass pill row that surfaces the farm's persistent progression at a glance:
 *   🪙 coins · 🌾 crops · 🥚 eggs · 🍄 truffles   +   a 🛒 Shop button.
 *
 * Like FarmGrid / AnimalRow it owns ZERO Firebase and ZERO game logic — it renders
 * entirely from PLAIN PROPS computed upstream (FarmContext → farmModel.farmWallet)
 * and reports a single intent (open the shop) back through `onShop()`. No `<Canvas>`,
 * no context, no IO, NO per-frame work — it is a static RN overlay that mounts on
 * BOTH the worker 3D village (VolunteerHome) and the youth 2D screen (YouthGardenPlot).
 *
 * Visual language matches FarmGrid's `streakPill` / glass idiom exactly (rounded
 * glass fill, mint/amber accents). The coins `<Text>` lives inside a MotiView that
 * is RE-KEYED on the coin value so it scale-punches every time the wallet changes
 * (earn or spend) — the same spring-pop trick FarmGrid uses for stage glyphs.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { palette, radius, spacing } from '../../theme/theme';

/* --------------------------- one stat chip ---------------------------------- */

/**
 * Stat — a single emoji + value cell inside the HUD pill.
 *
 * @param {string}  emoji   the stat glyph (🪙 / 🌾 / 🥚 / 🍄)
 * @param {number}  value   the current value
 * @param {boolean} punch   when true, re-key on value to scale-pop on change
 * @param {string}  tint    optional text color (coins use amber)
 */
function Stat({ emoji, value, punch, tint }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <MotiView
        // Re-keying on the value makes the chip scale-punch whenever it changes.
        key={punch ? `stat-${emoji}-${value}` : undefined}
        from={punch ? { scale: 0.55, opacity: 0.4 } : undefined}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 11, stiffness: 220 }}
      >
        <Text style={[styles.statValue, tint && { color: tint }]}>{value}</Text>
      </MotiView>
    </View>
  );
}

/* --------------------------- main component --------------------------------- */

/**
 * FarmHud — the persistent co-op wallet + tallies bar.
 *
 * @param {number}  coins            shared wallet balance (🪙)
 * @param {object}  counts           lifetime tallies { crops, eggs, truffles }
 * @param {fn}      onShop           () => void — opens the ShopSheet
 * @param {boolean} compact          tighter padding/sizing for cramped overlays
 * @param {object}  style            optional extra style on the outer wrap
 */
export default function FarmHud({
  coins = 0,
  counts = {},
  onShop,
  compact = false,
  style,
}) {
  const { crops = 0, eggs = 0, truffles = 0 } = counts || {};

  return (
    <MotiView
      from={{ opacity: 0, translateY: -8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 240 }}
      style={[styles.root, compact && styles.rootCompact, style]}
      pointerEvents="box-none"
    >
      {/* the wallet + tallies pill */}
      <View style={[styles.pill, compact && styles.pillCompact]}>
        <Stat emoji="🪙" value={coins} punch tint={palette.amberGlow} />
        <View style={styles.divider} />
        <Stat emoji="🌾" value={crops} punch />
        <Stat emoji="🥚" value={eggs} punch />
        <Stat emoji="🍄" value={truffles} punch />
      </View>

      {/* shop entry */}
      {onShop && (
        <Pressable
          onPress={onShop}
          hitSlop={8}
          style={({ pressed }) => [
            styles.shopBtn,
            compact && styles.shopBtnCompact,
            pressed && styles.shopBtnPressed,
          ]}
        >
          <Text style={styles.shopEmoji}>🛒</Text>
          {!compact && <Text style={styles.shopLabel}>Shop</Text>}
        </Pressable>
      )}
    </MotiView>
  );
}

/* --------------------------------- styles ----------------------------------- */

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'center',
  },
  rootCompact: { gap: spacing.xs },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(110,231,183,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.4)',
  },
  pillCompact: { paddingHorizontal: spacing.sm, paddingVertical: 6, gap: spacing.xs },

  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statEmoji: { fontSize: 14 },
  statValue: {
    color: palette.cloud,
    fontWeight: '900',
    fontSize: 13.5,
    fontVariant: ['tabular-nums'],
    minWidth: 14,
    textAlign: 'left',
  },

  divider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  shopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(246,173,85,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(246,173,85,0.45)',
  },
  shopBtnCompact: { paddingHorizontal: spacing.sm, paddingVertical: 6 },
  shopBtnPressed: { backgroundColor: 'rgba(246,173,85,0.34)' },
  shopEmoji: { fontSize: 15 },
  shopLabel: { color: palette.amberGlow, fontWeight: '900', fontSize: 12.5, letterSpacing: 0.3 },
});
