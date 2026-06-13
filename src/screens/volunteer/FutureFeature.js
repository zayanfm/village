/**
 * FutureFeature.js — Clean, animated placeholder for future capabilities.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import GardenBackground from '../../components/GardenBackground';
import GlassCard from '../../components/GlassCard';
import { gradients, palette, radius, spacing, typography } from '../../theme/theme';

const SEEDS = ['Group sessions', 'Insights & trends', 'Resource library', 'Mentor matching'];

export default function FutureFeature() {
  return (
    <GardenBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          {/* gently pulsing seed-of-growth emblem */}
          <MotiView
            from={{ scale: 0.9, opacity: 0.7 }}
            animate={{ scale: 1.08, opacity: 1 }}
            transition={{ type: 'timing', duration: 2200, loop: true, repeatReverse: true }}
          >
            <LinearGradient colors={gradients.leaf} style={styles.emblem}>
              <Text style={styles.emblemGlyph}>✦</Text>
            </LinearGradient>
          </MotiView>

          <Text style={styles.title}>Still growing</Text>
          <Text style={styles.subtitle}>
            New capabilities are taking root here. Here's what's sprouting next:
          </Text>

          <GlassCard style={styles.list} radiusSize={radius.lg}>
            {SEEDS.map((seed, i) => (
              <MotiView
                key={seed}
                from={{ opacity: 0, translateY: 8 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 400, delay: i * 120 }}
                style={styles.seedRow}
              >
                <View style={styles.seedDot} />
                <Text style={styles.seedText}>{seed}</Text>
              </MotiView>
            ))}
          </GlassCard>
        </View>
      </SafeAreaView>
    </GardenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emblem: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: palette.tealBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 26,
    elevation: 12,
  },
  emblemGlyph: { fontSize: 46, color: palette.ink },
  title: { ...typography.display, marginTop: spacing.xl },
  subtitle: { ...typography.body, color: palette.fog, textAlign: 'center', marginTop: 10, lineHeight: 21 },
  list: { width: '100%', marginTop: spacing.xl },
  seedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  seedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.mint, marginRight: 14 },
  seedText: { color: palette.cloud, fontSize: 15.5, fontWeight: '600' },
});
