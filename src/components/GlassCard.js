/**
 * GlassCard.js
 *
 * Reusable glassmorphic surface. Wraps content in a blurred, translucent frame
 * with a soft sheen overlay and a volumetric drop shadow so cards appear to
 * float above the layered garden environment.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { glass, gradients, radius } from '../theme/theme';

export default function GlassCard({ children, style, intensity = 28, radiusSize = radius.lg }) {
  return (
    <View style={[styles.shadowWrap, { borderRadius: radiusSize }, style]}>
      <BlurView intensity={intensity} tint="dark" style={[styles.blur, { borderRadius: radiusSize }]}>
        {/* translucent fill */}
        <View style={[styles.fill, { borderRadius: radiusSize }]} />
        {/* top-edge sheen for the "glass" highlight */}
        <LinearGradient
          colors={gradients.glassSheen}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radiusSize }]}
        />
        <View style={[styles.border, { borderRadius: radiusSize }]} />
        <View style={styles.content}>{children}</View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    // volumetric drop shadow (iOS) + elevation (Android)
    shadowColor: glass.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.5,
    shadowRadius: 22,
    elevation: 12,
  },
  blur: {
    overflow: 'hidden',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.fill,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: glass.border,
  },
  content: {
    padding: 18,
  },
});
