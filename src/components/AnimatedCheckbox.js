/**
 * AnimatedCheckbox.js
 *
 * Custom spring-driven checkbox used by the Identified Issues checklist.
 * The fill scales + fades on toggle using Reanimated worklets for a 60fps
 * organic pop. No platform checkbox is used so styling stays fully on-brand.
 */

import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { palette, radius } from '../theme/theme';

export default function AnimatedCheckbox({ label, checked, onToggle }) {
  const progress = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(checked ? 1 : 0, { damping: 14, stiffness: 180 });
  }, [checked, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.4 + progress.value * 0.6 }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    borderColor: progress.value > 0.5 ? palette.mint : 'rgba(255,255,255,0.35)',
  }));

  return (
    <Pressable
      onPress={onToggle}
      style={styles.row}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.ring, ringStyle]}>
        <Animated.View style={[styles.fill, fillStyle]}>
          <Text style={styles.tick}>✓</Text>
        </Animated.View>
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
  },
  ring: {
    width: 26,
    height: 26,
    borderRadius: radius.sm - 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  fill: {
    width: 22,
    height: 22,
    borderRadius: radius.sm - 6,
    backgroundColor: palette.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  label: {
    marginLeft: 12,
    color: palette.cloud,
    fontSize: 15,
    fontWeight: '600',
  },
});
