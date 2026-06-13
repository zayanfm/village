/**
 * Profile.js — Standard, minimal volunteer/worker profile metrics view.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import GardenBackground from '../../components/GardenBackground';
import GlassCard from '../../components/GlassCard';
import { gradients, palette, radius, spacing, typography } from '../../theme/theme';

const METRICS = [
  { label: 'Active cases', value: '5' },
  { label: 'Sessions logged', value: '38' },
  { label: 'Blooms tended', value: '12' },
  { label: 'Months active', value: '7' },
];

function MetricCard({ metric, index }) {
  return (
    <MotiView
      from={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 15, stiffness: 160, delay: index * 80 }}
      style={styles.metricWrap}
    >
      <GlassCard radiusSize={radius.lg}>
        <Text style={styles.metricValue}>{metric.value}</Text>
        <Text style={styles.metricLabel}>{metric.label}</Text>
      </GlassCard>
    </MotiView>
  );
}

export default function Profile() {
  return (
    <GardenBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <LinearGradient colors={gradients.leaf} style={styles.bigAvatar}>
              <Text style={styles.bigAvatarGlyph}>🌿</Text>
            </LinearGradient>
            <Text style={styles.name}>Alex Tan</Text>
            <Text style={styles.role}>Volunteer · Social Work</Text>
          </View>

          <View style={styles.grid}>
            {METRICS.map((m, i) => (
              <MetricCard key={m.label} metric={m} index={i} />
            ))}
          </View>

          <GlassCard style={styles.about} radiusSize={radius.lg}>
            <Text style={styles.aboutTitle}>About</Text>
            <Text style={styles.aboutText}>
              Supporting youth through one-to-one mentoring. All session data is
              handled under the PDPA simulation — raw transcripts never persist.
            </Text>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    </GardenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 140 },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  bigAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  bigAvatarGlyph: { fontSize: 40 },
  name: { ...typography.display, marginTop: 16 },
  role: { ...typography.body, color: palette.mint, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  metricWrap: { width: '47%', marginBottom: 16 },
  metricValue: { color: palette.white, fontSize: 30, fontWeight: '900' },
  metricLabel: { color: palette.fog, fontSize: 13, fontWeight: '600', marginTop: 4 },
  about: { marginTop: spacing.sm },
  aboutTitle: { ...typography.heading, marginBottom: 8 },
  aboutText: { color: palette.cloud, fontSize: 14.5, lineHeight: 21 },
});
