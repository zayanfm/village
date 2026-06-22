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
import { defaultYouthHouseConfig } from '../youth/youthTheme'; // still needed for houseConfig merging
import { subscribeYouthProfiles } from '../../api/firestoreService';
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
  };
}

export default function VolunteerHome({ navigation }) {
  const isFocused = useIsFocused();
  const [cases, setCases] = useState([]);
  const [firestoreReady, setFirestoreReady] = useState(false);

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

  return (
    <View style={styles.root}>
      {isFocused && <VillageMap cases={cases} onSelect={openCaseFile} />}

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
            Drag · pinch to zoom · two fingers to roam. Tap any home to open its file.
          </Text>
        </MotiView>
      </SafeAreaView>

      {/* ── Empty state: shown before any youths are added ── */}
      {cases.length === 0 && (
        <View style={styles.emptyState} pointerEvents="none">
          <Text style={styles.emptyIcon}>🌱</Text>
          <Text style={styles.emptyTitle}>Your village is empty</Text>
          <Text style={styles.emptySub}>Tap "Add New Youth" below to place the first house on the map.</Text>
        </View>
      )}

      {/* ── FAB: Add New Youth (Path B trigger) ── */}
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
});
