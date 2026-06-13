/**
 * FlowerNode.js
 *
 * A single youth case represented as a living "premium flower" card.
 *
 * - The bloom is a layered arrangement of gradient petals (a soft, organic
 *   stand-in for a photoreal flower visualization) that breathes via a slow
 *   looping scale animation (Moti) so it feels alive and "flowy".
 * - The whole card is a glassmorphic frame holding the mandatory metadata:
 *   Youth Name, Case ID, and a relative timestamp.
 * - Tapping runs a spring-scale press effect, then routes to YouthCaseDetail.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import GlassCard from './GlassCard';
import { gradients, palette, radius } from '../theme/theme';

const BLOOMS = {
  teal: gradients.tealFlower,
  violet: gradients.violetFlower,
  amber: gradients.amberFlower,
};

const PETAL_COUNT = 8;

function Bloom({ variant = 'teal' }) {
  const colors = BLOOMS[variant] ?? BLOOMS.teal;
  return (
    <View style={styles.bloomBox}>
      {/* soft glow halo behind the bloom */}
      <View style={[styles.halo, { shadowColor: colors[1] }]} />
      {Array.from({ length: PETAL_COUNT }).map((_, i) => (
        <LinearGradient
          key={i}
          colors={colors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.petal,
            { transform: [{ rotate: `${(360 / PETAL_COUNT) * i}deg` }, { translateY: -14 }] },
          ]}
        />
      ))}
      {/* luminous center */}
      <LinearGradient
        colors={[palette.white, colors[0]]}
        style={styles.bloomCore}
        start={{ x: 0.3, y: 0.2 }}
        end={{ x: 0.8, y: 1 }}
      />
    </View>
  );
}

export default function FlowerNode({ flower, onPress, index = 0 }) {
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.94, { damping: 16, stiffness: 220 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 180 });
  };

  return (
    <Animated.View style={[styles.wrap, pressStyle]}>
      <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress}>
        {/* gentle, perpetual breathing loop so the bloom feels alive */}
        <MotiView
          from={{ scale: 0.96 }}
          animate={{ scale: 1.04 }}
          transition={{
            type: 'timing',
            duration: 2600 + index * 220,
            loop: true,
            repeatReverse: true,
          }}
        >
          <GlassCard radiusSize={radius.xl}>
            <Bloom variant={flower.variant} />
            <Text style={styles.name}>{flower.youthName}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.caseId}>{flower.caseId}</Text>
              <View style={styles.dot} />
              <Text style={styles.timestamp}>{flower.timestamp}</Text>
            </View>
          </GlassCard>
        </MotiView>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '47%',
    marginBottom: 18,
  },
  bloomBox: {
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  halo: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 24,
    elevation: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  petal: {
    position: 'absolute',
    width: 22,
    height: 38,
    borderRadius: 16,
    opacity: 0.92,
  },
  bloomCore: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  name: {
    color: palette.white,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  caseId: {
    color: palette.mint,
    fontSize: 12.5,
    fontWeight: '700',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.fog,
    marginHorizontal: 7,
  },
  timestamp: {
    color: palette.fog,
    fontSize: 12,
    fontWeight: '600',
  },
});
