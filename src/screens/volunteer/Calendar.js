/**
 * Calendar.js — Animated calendar dashboard
 *
 * Lets volunteers log and track scheduled case meetings. A simple month grid
 * with animated day cells plus an upcoming-meetings list. Selecting a day
 * springs it into focus.
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import GardenBackground from '../../components/GardenBackground';
import GlassCard from '../../components/GlassCard';
import { palette, radius, spacing, typography } from '../../theme/theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// Days carrying a scheduled meeting (the dotted ones).
const SCHEDULED = new Set([4, 12, 18, 25]);

const MEETINGS = [
  { id: 'm1', day: 12, youth: 'Hana M.', time: '4:00 PM', mode: 'In person' },
  { id: 'm2', day: 18, youth: 'Jordan T.', time: '5:30 PM', mode: 'Video call' },
  { id: 'm3', day: 25, youth: 'Amira S.', time: '3:15 PM', mode: 'In person' },
];

function DayCell({ day, selected, scheduled, onPress }) {
  return (
    <Pressable style={styles.cell} onPress={onPress}>
      <MotiView
        animate={{ scale: selected ? 1.12 : 1 }}
        transition={{ type: 'spring', damping: 13, stiffness: 200 }}
        style={[
          styles.cellInner,
          selected && styles.cellSelected,
        ]}
      >
        <Text style={[styles.cellText, selected && styles.cellTextSelected]}>{day}</Text>
        {scheduled && <View style={[styles.dot, selected && styles.dotSelected]} />}
      </MotiView>
    </Pressable>
  );
}

export default function Calendar() {
  const [selected, setSelected] = useState(12);
  const daysInMonth = 30;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <GardenBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.kicker}>SCHEDULE</Text>
          <Text style={styles.title}>June 2026</Text>
          <Text style={styles.subtitle}>Track your scheduled case meetings</Text>

          <GlassCard style={styles.calCard} radiusSize={radius.lg}>
            <View style={styles.weekRow}>
              {WEEKDAYS.map((d, i) => (
                <Text key={i} style={styles.weekday}>{d}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {days.map((day) => (
                <DayCell
                  key={day}
                  day={day}
                  selected={selected === day}
                  scheduled={SCHEDULED.has(day)}
                  onPress={() => setSelected(day)}
                />
              ))}
            </View>
          </GlassCard>

          <Text style={styles.sectionTitle}>Upcoming meetings</Text>
          {MEETINGS.map((m, i) => (
            <MotiView
              key={m.id}
              from={{ opacity: 0, translateX: -10 }}
              animate={{ opacity: 1, translateX: 0 }}
              transition={{ type: 'timing', duration: 380, delay: i * 100 }}
            >
              <GlassCard style={styles.meeting} radiusSize={radius.md}>
                <View style={styles.meetDateBox}>
                  <Text style={styles.meetDay}>{m.day}</Text>
                  <Text style={styles.meetMon}>JUN</Text>
                </View>
                <View style={styles.meetInfo}>
                  <Text style={styles.meetYouth}>{m.youth}</Text>
                  <Text style={styles.meetMeta}>{m.time} · {m.mode}</Text>
                </View>
              </GlassCard>
            </MotiView>
          ))}
        </ScrollView>
      </SafeAreaView>
    </GardenBackground>
  );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 140 },
  kicker: { ...typography.caption, color: palette.mint },
  title: { ...typography.display, marginTop: 4 },
  subtitle: { ...typography.body, color: palette.fog, marginTop: 6, marginBottom: spacing.lg },

  calCard: { marginBottom: spacing.lg },
  weekRow: { flexDirection: 'row', marginBottom: 10 },
  weekday: { width: CELL, textAlign: 'center', color: palette.fog, fontWeight: '800', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 3 },
  cellInner: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: {
    backgroundColor: palette.mint,
  },
  cellText: { color: palette.cloud, fontSize: 14, fontWeight: '600' },
  cellTextSelected: { color: palette.ink, fontWeight: '900' },
  dot: {
    position: 'absolute',
    bottom: 6,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.mint,
  },
  dotSelected: { backgroundColor: palette.ink },

  sectionTitle: { ...typography.heading, marginBottom: 12 },
  meeting: { marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  meetDateBox: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: 'rgba(110,231,183,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  meetDay: { color: palette.mint, fontSize: 20, fontWeight: '900' },
  meetMon: { color: palette.mint, fontSize: 10, fontWeight: '700' },
  meetInfo: { flex: 1 },
  meetYouth: { color: palette.white, fontSize: 16, fontWeight: '800' },
  meetMeta: { color: palette.fog, fontSize: 13, marginTop: 3 },
});
