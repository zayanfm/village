/**
 * GardenBackground.js
 *
 * The immersive, deeply layered Secret Garden environment used behind every
 * screen. Builds depth from: a deep forest/teal vertical gradient wash, a few
 * softly drifting volumetric light blooms, and faint overgrown-vine arcs — all
 * organic, botanical tones. No vector "tree" structure; this is atmosphere.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { gradients, palette } from '../theme/theme';

function DriftBlob({ color, size, top, left, delay }) {
  return (
    <MotiView
      from={{ opacity: 0.12, translateY: 0 }}
      animate={{ opacity: 0.28, translateY: -18 }}
      transition={{ type: 'timing', duration: 5200, delay, loop: true, repeatReverse: true }}
      style={[
        styles.blob,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, top, left },
      ]}
    />
  );
}

export default function GardenBackground({ children }) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={gradients.environment}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* volumetric light blooms drifting through the depth field */}
      <DriftBlob color={palette.tealBright} size={260} top={-40} left={-60} delay={0} />
      <DriftBlob color={palette.mint} size={200} top={220} left={220} delay={900} />
      <DriftBlob color={palette.teal} size={300} top={520} left={-80} delay={1800} />
      {/* overgrown-vine arc, faint */}
      <View style={styles.vine} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.forestNight, overflow: 'hidden' },
  blob: { position: 'absolute' },
  vine: {
    position: 'absolute',
    top: 120,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    borderWidth: 30,
    borderColor: 'rgba(46, 122, 123, 0.10)',
  },
});
