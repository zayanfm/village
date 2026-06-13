/**
 * CustomBottomBar.js
 *
 * A floating glassmorphism bottom tab bar driving 5 portals, strictly L->R:
 *   1. Profile   2. Forum   3. Home (center, elevated glowing leaf)
 *   4. Calendar  5. Future Feature
 *
 * Designed as a `tabBar` render prop for @react-navigation/bottom-tabs, so it
 * receives { state, descriptors, navigation }. The center tab is rendered as a
 * raised, glowing circular action button housing a minimalist 3D leaf icon.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { glass, gradients, palette, radius } from '../theme/theme';

// Glyphs kept lightweight + on-brand (botanical / minimal).
const ICONS = {
  Profile: '◑',
  Forum: '❀',
  Calendar: '◳',
  Future: '✦',
};

/** Minimalist layered "3D" leaf rendered from gradients (no external asset). */
function LeafIcon() {
  return (
    <View style={styles.leafBox}>
      <LinearGradient
        colors={gradients.leaf}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.leafBody}
      />
      {/* central vein for the crisp 3D read */}
      <View style={styles.leafVein} />
    </View>
  );
}

function SideTab({ label, glyph, focused, onPress }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      style={styles.sideTab}
      onPress={onPress}
      onPressIn={() => (scale.value = withSpring(0.85, { damping: 15, stiffness: 220 }))}
      onPressOut={() => (scale.value = withSpring(1, { damping: 12, stiffness: 180 }))}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
    >
      <Animated.Text
        style={[styles.glyph, aStyle, { color: focused ? palette.mint : palette.fog }]}
      >
        {glyph}
      </Animated.Text>
      <Text style={[styles.tabLabel, focused && { color: palette.mint }]}>{label}</Text>
    </Pressable>
  );
}

function CenterTab({ focused, onPress }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={styles.centerSlot} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        onPressIn={() => (scale.value = withSpring(0.9, { damping: 15, stiffness: 240 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 11, stiffness: 170 }))}
        accessibilityRole="button"
        accessibilityLabel="Open the village home"
      >
        {/* slow glowing pulse halo */}
        <MotiView
          from={{ opacity: 0.35, scale: 1 }}
          animate={{ opacity: 0.7, scale: 1.18 }}
          transition={{ type: 'timing', duration: 1800, loop: true, repeatReverse: true }}
          style={styles.glowHalo}
        />
        <Animated.View style={[styles.centerButton, aStyle]}>
          <LinearGradient
            colors={gradients.leaf}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.centerFill}
          >
            <LeafIcon />
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
}

export default function CustomBottomBar({ state, navigation }) {
  const insets = useSafeAreaInsets();

  const go = (routeName, routeKey, isFocused) => {
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  const isFocused = (name) => state.routes[state.index]?.name === name;
  const routeByName = (name) => state.routes.find((r) => r.name === name);

  const tab = (name) => {
    const r = routeByName(name);
    return { key: r?.key, focused: isFocused(name) };
  };

  const profile = tab('Profile');
  const forum = tab('Forum');
  const home = tab('Home');
  const calendar = tab('Calendar');
  const future = tab('Future');

  return (
    <View style={[styles.dock, { paddingBottom: insets.bottom || 12 }]} pointerEvents="box-none">
      <View style={styles.barShadow}>
        <BlurView intensity={40} tint="dark" style={styles.bar}>
          <View style={styles.barFill} />
          <View style={styles.barBorder} />

          <SideTab
            label="Profile"
            glyph={ICONS.Profile}
            focused={profile.focused}
            onPress={() => go('Profile', profile.key, profile.focused)}
          />
          <SideTab
            label="Forum"
            glyph={ICONS.Forum}
            focused={forum.focused}
            onPress={() => go('Forum', forum.key, forum.focused)}
          />

          {/* spacer reserves room for the elevated center button */}
          <View style={styles.centerSpacer} />

          <SideTab
            label="Calendar"
            glyph={ICONS.Calendar}
            focused={calendar.focused}
            onPress={() => go('Calendar', calendar.key, calendar.focused)}
          />
          <SideTab
            label="Future"
            glyph={ICONS.Future}
            focused={future.focused}
            onPress={() => go('Future', future.key, future.focused)}
          />
        </BlurView>
      </View>

      <CenterTab focused={home.focused} onPress={() => go('Home', home.key, home.focused)} />
    </View>
  );
}

const BAR_HEIGHT = 70;

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  barShadow: {
    width: '100%',
    shadowColor: glass.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
    borderRadius: radius.xl,
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: 14,
  },
  barFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.fillStrong,
  },
  barBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: glass.border,
  },
  sideTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSpacer: {
    width: 72,
  },
  glyph: {
    fontSize: 20,
    marginBottom: 3,
  },
  tabLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: palette.fog,
    letterSpacing: 0.3,
  },
  // center elevated button — span the full dock width and center within it so
  // the button lands on the exact horizontal midpoint of the screen.
  centerSlot: {
    position: 'absolute',
    top: -26,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowHalo: {
    position: 'absolute',
    width: 84,
    height: 84,
    // 84 halo centered behind the 66 button: (66 - 84) / 2 = -9
    top: -9,
    left: -9,
    borderRadius: 42,
    backgroundColor: palette.mint,
  },
  centerButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    shadowColor: palette.tealBright,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.9,
    shadowRadius: 16,
    elevation: 14,
  },
  centerFill: {
    flex: 1,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: glass.highlight,
  },
  // leaf icon
  leafBox: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leafBody: {
    width: 26,
    height: 26,
    borderTopLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 4,
    transform: [{ rotate: '45deg' }],
  },
  leafVein: {
    position: 'absolute',
    width: 2,
    height: 22,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.65)',
    transform: [{ rotate: '45deg' }],
  },
});
