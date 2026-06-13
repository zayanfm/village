/**
 * VolunteerHome.js — The explorable 3D Village
 *
 * A fully navigable react-three-fiber neighbourhood. Each youth case is a
 * procedural 3D tiny house with a persistent, camera-facing glassmorphic label
 * (Youth Name, Case ID, Relative Timestamp) floating above it — so the worker
 * identifies every case at a glance, no tapping required.
 *
 * Tapping a house OR its label navigates directly to YouthCaseDetail. The
 * navigation params and downstream state/PDPA contract are unchanged.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import VillageMap from '../../components/3d/VillageMap';
import { resolveHouseConfig } from '../../components/3d/houseSchema';
import { palette, spacing, typography } from '../../theme/theme';

/**
 * Active cases. Metadata (youthName/caseId/timestamp) is unchanged; each case's
 * `config` is resolved through the house schema, so the future youth-facing app
 * can pipe profile edits straight into these fields to restyle the home here.
 */
const CASES = [
  { id: 'H-008', youthName: 'Hana M.', caseId: '#H-008', timestamp: '2 hours ago',
    config: resolveHouseConfig({ houseType: 'cottage', roofColor: '#38B2AC', wallColor: '#F2EAD8', hasUpdate: true, windowIntensity: 0.2 }) },
  { id: 'J-014', youthName: 'Jordan T.', caseId: '#J-014', timestamp: 'Yesterday',
    config: resolveHouseConfig({ houseType: 'townhouse', roofColor: '#805AD5', wallColor: '#EFE7F7', heightScale: 1.3 }) },
  { id: 'A-021', youthName: 'Amira S.', caseId: '#A-021', timestamp: '3 days ago',
    config: resolveHouseConfig({ houseType: 'cabin', roofColor: '#DD6B20', wallColor: '#F6ECD9' }) },
  { id: 'K-009', youthName: 'Kai L.', caseId: '#K-009', timestamp: 'Last week',
    config: resolveHouseConfig({ houseType: 'cottage', roofColor: '#2C7A7B', wallColor: '#EAF3EC' }) },
  { id: 'N-031', youthName: 'Noor R.', caseId: '#N-031', timestamp: '2 weeks ago',
    config: resolveHouseConfig({ houseType: 'townhouse', roofColor: '#B794F4', wallColor: '#F3EEFA', hasUpdate: true, windowIntensity: 0.2 }) },
];

export default function VolunteerHome({ navigation }) {
  const openCaseFile = (c) =>
    navigation.navigate('YouthCaseDetail', {
      caseId: c.caseId,
      youthName: c.youthName,
      caseKey: c.id,
    });

  return (
    <View style={styles.root}>
      <VillageMap cases={CASES} onSelect={openCaseFile} />

      {/* Header overlay (taps pass through to the village / labels) */}
      <SafeAreaView style={styles.headerSafe} edges={['top']} pointerEvents="box-none">
        <MotiView
          from={{ opacity: 0, translateY: 14 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 600 }}
          pointerEvents="none"
        >
          <Text style={styles.kicker}>YOUR VILLAGE</Text>
          <Text style={styles.title}>Your neighbourhood</Text>
          <Text style={styles.subtitle}>
            Drag to look around · pinch to zoom · two fingers to roam. Tap any home to open its file.
          </Text>
        </MotiView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.forestNight },
  headerSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  kicker: { ...typography.caption, color: palette.mint, marginBottom: 6 },
  title: { ...typography.display },
  subtitle: {
    ...typography.body,
    color: palette.fog,
    marginTop: 8,
    lineHeight: 21,
    maxWidth: '92%',
  },
});
