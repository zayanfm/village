/**
 * VolunteerHome.js — The worker's living 3D Village
 *
 * Each youth case renders the SHARED <YouthHouseMesh> from that youth's
 * `youthHouseConfig`, so the worker sees the exact archetype / color / roof the
 * youth chose (e.g. Jordan picked a Modern Mansion in Soft Lavender below).
 * Persistent camera-facing glass labels identify each case; tapping a house or
 * label opens YouthCaseDetail with that youth's config (for the room mirror).
 *
 * The <Canvas> is gated on screen focus so switching tabs frees the GL context
 * cleanly (no canvas lifecycle warnings).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { MotiView } from 'moti';
import VillageMap from '../../components/3d/VillageMap';
import { defaultYouthHouseConfig } from '../youth/youthTheme';
import { palette, spacing, typography } from '../../theme/theme';

// Mock "sync" of each youth's customizer choices. In production this arrives
// from shared state/backend; here each case carries a youthHouseConfig so the
// village renders their exact home.
const cfg = (partial) => ({ ...defaultYouthHouseConfig, ...partial });

const CASES = [
  { id: 'H-008', youthName: 'Hana M.', caseId: '#H-008', timestamp: '2 hours ago',
    youthHouseConfig: cfg({ houseStyle: 'village', colorTheme: 'Pastel Mint', roofStyle: 'Terracotta Tiles', windowColor: '#FFE3A3', windowIntensity: 0.7 }) },
  { id: 'J-014', youthName: 'Jordan T.', caseId: '#J-014', timestamp: 'Yesterday',
    youthHouseConfig: cfg({ houseStyle: 'mansion', colorTheme: 'Soft Lavender', roofStyle: 'Slate', windowColor: '#D9CCF5', windowIntensity: 0.9 }) },
  { id: 'A-021', youthName: 'Amira S.', caseId: '#A-021', timestamp: '3 days ago',
    youthHouseConfig: cfg({ houseStyle: 'futuristic', colorTheme: 'Amber Wood', roofStyle: 'Solar Metal', windowColor: '#65F0E0', windowIntensity: 1.1 }) },
  { id: 'K-009', youthName: 'Kai L.', caseId: '#K-009', timestamp: 'Last week',
    youthHouseConfig: cfg({ houseStyle: 'village', colorTheme: 'Soft Lavender', roofStyle: 'Thatch', windowColor: '#FFE3A3', windowIntensity: 0.5 }) },
  { id: 'N-031', youthName: 'Noor R.', caseId: '#N-031', timestamp: '2 weeks ago',
    youthHouseConfig: cfg({ houseStyle: 'mansion', colorTheme: 'Pastel Mint', roofStyle: 'Terracotta Tiles', windowColor: '#B8F2E6', windowIntensity: 0.8 }) },
];

export default function VolunteerHome({ navigation }) {
  const isFocused = useIsFocused();

  const openCaseFile = (c) =>
    navigation.navigate('YouthCaseDetail', {
      caseId: c.caseId,
      youthName: c.youthName,
      caseKey: c.id,
      youthHouseConfig: c.youthHouseConfig,
    });

  return (
    <View style={styles.root}>
      {isFocused && <VillageMap cases={CASES} onSelect={openCaseFile} />}

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
  root: { flex: 1, backgroundColor: '#243042' },
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
  subtitle: { ...typography.body, color: palette.fog, marginTop: 8, lineHeight: 21, maxWidth: '92%' },
});
