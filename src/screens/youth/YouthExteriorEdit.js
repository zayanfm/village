/**
 * YouthExteriorEdit.js — Interactive Studio (Three.js-driven)
 *
 * Direct touch manipulation of three distinct procedural house archetypes:
 *   - drag (1 finger)  -> spin the house 360°  (azimuth, unbounded)
 *   - pinch (2 finger) -> zoom in/out          (radius, clamped)
 *   - 2-finger drag    -> pan                   (target, clamped)
 * Touch picking uses R3F's event system (THREE.Raycaster under the hood);
 * camera math is a clamped spherical rig.
 *
 * Expanded floating dock: house style · roof style/texture · color theme ·
 * garden props · window light (intensity + emissive color). Everything binds to
 * `youthHouseConfig` — the same template destined for the worker map.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, PanResponder } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Canvas, useFrame } from '@react-three/fiber';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as THREE from 'three';
import YouthHouseMesh from './YouthHouseMesh';
import { useYouthSession } from '../../context/YouthSessionContext';
import { syncHouseConfig } from '../../api/firestoreService';
import {
  COLOR_THEMES,
  COLOR_THEME_NAMES,
  GARDEN_PROPS,
  HOUSE_STYLES,
  ROOF_STYLES,
  ROOF_STYLE_NAMES,
  WINDOW_COLORS,
  defaultYouthHouseConfig,
  pastel,
  youthRadius as rad,
} from './youthTheme';

// ---- camera bounds ----
const R_MIN = 3.4;
const R_MAX = 9;
const POLAR_MIN = 0.25;
const POLAR_MAX = 1.3;
const PAN_MAX = 2;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Collapsible dock heights (the bar stays tucked away by default).
const DOCK_COLLAPSED = 70;
const DOCK_EXPANDED = 340;
const DOCK_BG = 'rgba(255,255,255,0.94)';

/* House archetypes now live in the shared ./YouthHouseMesh — the worker village
   imports the same component so it renders the youth's exact chosen design. */

/* --------------------------- garden props ----------------------------------- */

function GardenProps({ props, winColor, winI }) {
  return (
    <group>
      {props.flowers &&
        [[-1.3, 0, 0.6], [1.25, 0, 0.9], [-0.9, 0, -1.2]].map((pos, i) => (
          <group key={`f${i}`} position={pos}>
            <mesh position={[0, 0.12, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.24, 6]} />
              <meshStandardMaterial color={'#4F7B3A'} />
            </mesh>
            <mesh position={[0, 0.28, 0]}>
              <sphereGeometry args={[0.08, 12, 12]} />
              <meshStandardMaterial color={i % 2 ? pastel.blush : pastel.lavenderDeep} roughness={1} />
            </mesh>
          </group>
        ))}
      {props.lamps &&
        [[1.4, 0, -0.6], [-1.4, 0, 0.0]].map((pos, i) => (
          <group key={`l${i}`} position={pos}>
            <mesh castShadow position={[0, 0.3, 0]}>
              <cylinderGeometry args={[0.06, 0.08, 0.6, 8]} />
              <meshStandardMaterial color={'#8A8276'} roughness={1} />
            </mesh>
            <mesh position={[0, 0.66, 0]}>
              <sphereGeometry args={[0.12, 16, 16]} />
              <meshStandardMaterial color={'#FFF6D8'} emissive={winColor} emissiveIntensity={Math.max(winI, 0.7)} />
            </mesh>
            <pointLight position={[0, 0.66, 0]} intensity={6} distance={3} decay={2} color={winColor} />
          </group>
        ))}
      {props.pond && (
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[1.15, 0.02, 0.9]}>
          <circleGeometry args={[0.5, 32]} />
          <meshStandardMaterial color={'#7EC8E3'} metalness={0.4} roughness={0.15} transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}

/* --------------------------- plot + camera ---------------------------------- */

function Plot({ config }) {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.05, 0]}>
        <cylinderGeometry args={[2.0, 2.1, 0.18, 48]} />
        <meshStandardMaterial color={pastel.clay} roughness={0.9} />
      </mesh>
      <mesh receiveShadow position={[0, 0.045, 0]}>
        <cylinderGeometry args={[1.9, 1.9, 0.04, 48]} />
        <meshStandardMaterial color={pastel.mint} roughness={1} />
      </mesh>
      <group position={[0, 0.07, 0]}>
        <YouthHouseMesh config={config} />
        <GardenProps props={config.props} winColor={config.windowColor} winI={config.windowIntensity} />
      </group>
    </group>
  );
}

function CameraRig({ control, onZoomedOut }) {
  const done = useRef(false);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const c = control.current;
    const sp = Math.sin(c.polar);
    const px = c.target.x + c.radius * sp * Math.sin(c.azimuth);
    const py = c.radius * Math.cos(c.polar);
    const pz = c.target.z + c.radius * sp * Math.cos(c.azimuth);
    camera.position.lerp(tmp.set(px, py, pz), 0.18);
    camera.lookAt(c.target.x, 0.7, c.target.z);

    if (c.applying && !done.current && Math.abs(c.radius - c.applyTarget) < 0.4 && camera.position.length() > c.applyTarget - 1) {
      done.current = true;
      onZoomedOut && onZoomedOut();
    }
  });
  return null;
}

/* --------------------------- UI pieces -------------------------------------- */

function PastelSlider({ value, onChange }) {
  const [w, setW] = useState(0);
  const progress = useSharedValue(value);
  progress.value = withSpring(value, { damping: 18, stiffness: 200 });
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * Math.max(w - 26, 0) }] }));
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const setFromX = (x) => w > 0 && onChange(clamp(x / w, 0, 1));
  return (
    <View
      style={styles.track}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => setFromX(e.nativeEvent.locationX)}
      onResponderMove={(e) => setFromX(e.nativeEvent.locationX)}
    >
      <Animated.View style={[styles.trackFill, fill]} />
      <Animated.View style={[styles.thumb, thumb]} />
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/* --------------------------- Screen ----------------------------------------- */

export default function YouthExteriorEdit({ navigation }) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { firestoreId, houseConfig: savedConfig, isGuest, updateLocalHouseConfig } = useYouthSession();

  const { isLinkedToWorker, linkResolved, userName } = useYouthSession();

  // Seed with default initially; re-seed when background lookup resolves
  // and delivers a saved houseConfig from the worker's Firestore profile.
  const [cfg, setCfg] = useState(defaultYouthHouseConfig);

  useEffect(() => {
    if (linkResolved && savedConfig) {
      setCfg({ ...defaultYouthHouseConfig, ...savedConfig });
    }
  }, [linkResolved, firestoreId]);
  const control = useRef({ target: { x: 0, z: 0 }, radius: 5, azimuth: 0, polar: 0.7, base: null, pinch: null, applying: false, applyTarget: 11 });
  const navigatedRef = useRef(false);

  // ---- collapsible dock ----
  const dockH = useSharedValue(DOCK_COLLAPSED);
  const expandedRef = useRef(false);
  const dragBase = useRef(DOCK_COLLAPSED);
  const dockStyle = useAnimatedStyle(() => ({ height: dockH.value }));
  const setExpanded = (exp) => {
    expandedRef.current = exp;
    dockH.value = withTiming(exp ? DOCK_EXPANDED : DOCK_COLLAPSED, { duration: 300 });
  };
  const toggleDock = () => setExpanded(!expandedRef.current);
  const handleResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
        onPanResponderGrant: () => (dragBase.current = dockH.value),
        onPanResponderMove: (_e, g) => (dockH.value = clamp(dragBase.current - g.dy, DOCK_COLLAPSED, DOCK_EXPANDED)),
        onPanResponderRelease: () => setExpanded(dockH.value > (DOCK_COLLAPSED + DOCK_EXPANDED) / 2),
        onPanResponderTerminate: () => setExpanded(dockH.value > (DOCK_COLLAPSED + DOCK_EXPANDED) / 2),
      }),
    []
  );

  const patch = (p) => setCfg((prev) => ({ ...prev, ...p }));
  const toggleProp = (key) => setCfg((prev) => ({ ...prev, props: { ...prev.props, [key]: !prev.props[key] } }));

  const responder = useMemo(() => {
    const shouldDrive = (e, g) => (e.nativeEvent.touches && e.nativeEvent.touches.length >= 2) || Math.hypot(g.dx, g.dy) > 5;
    return PanResponder.create({
      onMoveShouldSetPanResponder: shouldDrive,
      onMoveShouldSetPanResponderCapture: shouldDrive,
      onPanResponderGrant: () => {
        const c = control.current;
        c.base = { azimuth: c.azimuth, polar: c.polar };
        c.pinch = null;
      },
      onPanResponderMove: (e, g) => {
        const c = control.current;
        const touches = e.nativeEvent.touches || [];
        if (touches.length >= 2) {
          const a = touches[0];
          const b = touches[1];
          const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
          const mx = (a.pageX + b.pageX) / 2;
          const my = (a.pageY + b.pageY) / 2;
          if (!c.pinch) c.pinch = { dist, mx, my, radius: c.radius, tx: c.target.x, tz: c.target.z, az: c.azimuth };
          else {
            c.radius = clamp(c.pinch.radius * (c.pinch.dist / Math.max(dist, 1)), R_MIN, R_MAX);
            const dmx = (mx - c.pinch.mx) * 0.01;
            const dmy = (my - c.pinch.my) * 0.01;
            const s = Math.sin(c.pinch.az);
            const co = Math.cos(c.pinch.az);
            c.target.x = clamp(c.pinch.tx - (dmx * co - dmy * s), -PAN_MAX, PAN_MAX);
            c.target.z = clamp(c.pinch.tz - (dmx * s + dmy * co), -PAN_MAX, PAN_MAX);
          }
        } else {
          c.pinch = null;
          c.azimuth = c.base.azimuth - g.dx * 0.006;
          c.polar = clamp(c.base.polar - g.dy * 0.005, POLAR_MIN, POLAR_MAX);
        }
      },
      onPanResponderRelease: () => (control.current.pinch = null),
      onPanResponderTerminate: () => (control.current.pinch = null),
    });
  }, []);

  // Reset camera + nav state on (re)focus so the dolly never sticks zoomed-out
  // and "Apply" works again after returning from the room.
  useFocusEffect(
    useCallback(() => {
      const c = control.current;
      c.applying = false;
      c.radius = 5;
      c.target = { x: 0, z: 0 };
      c.azimuth = 0;
      c.polar = 0.7;
      navigatedRef.current = false;
      return () => {};
    }, [])
  );

  const applyChanges = () => {
    control.current.applying = true;
    control.current.radius = control.current.applyTarget; // dolly out

    // Sync the new houseConfig to Firestore so the worker's village map
    // updates in real-time. Fire-and-forget — never blocks the UI.
    if (firestoreId && !isGuest) {
      syncHouseConfig(firestoreId, cfg);
      updateLocalHouseConfig(cfg); // update the session cache immediately
    }
  };
  const goInside = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    navigation?.navigate('YouthRoomHome', { youthHouseConfig: cfg });
  };

  return (
    <View style={styles.root}>
      {/* Canvas wrapper is flex:1: when the dock height changes, this resizes
          and R3F re-derives the camera aspect ratio so the house stays framed. */}
      <View style={styles.canvasWrap} {...responder.panHandlers}>
        {isFocused && (
          <Canvas shadows camera={{ position: [3, 2.6, 5], fov: 42 }} onCreated={({ gl }) => gl.setClearColor(pastel.sky, 1)}>
            <ambientLight intensity={0.7} />
            <hemisphereLight args={['#ffffff', '#e8d6c2', 0.6]} />
            <directionalLight position={[4, 8, 4]} intensity={1.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
            <Plot config={cfg} />
            <CameraRig control={control} onZoomedOut={goInside} />
          </Canvas>
        )}

        <SafeAreaView style={styles.header} edges={['top']} pointerEvents="box-none">
          <Text style={styles.kicker}>MY HOME · drag · pinch · pan</Text>
          <Text style={styles.title}>{userName ? `${userName}'s home` : 'Make it yours'}</Text>
          {/* Link status badge — shown once the background lookup has resolved */}
          {linkResolved && (
            <View style={[styles.linkBadge, isLinkedToWorker ? styles.linkBadgeLinked : styles.linkBadgeSandbox]}>
              <Text style={styles.linkBadgeText}>
                {isLinkedToWorker ? '🔗 Linked to your care team' : '📦 Sandbox — exploring freely'}
              </Text>
            </View>
          )}
        </SafeAreaView>
      </View>

      {/* Collapsible dock — short by default, drag the handle or tap to expand */}
      <Animated.View style={[styles.dock, dockStyle]}>
        <View style={styles.handleZone} {...handleResponder.panHandlers}>
          <Pressable onPress={toggleDock} hitSlop={14} style={styles.grabberTap}>
            <View style={styles.grabber} />
          </Pressable>
          <Text style={styles.dockTitle}>Customize</Text>
          <Pressable onPress={applyChanges} style={styles.applyMini}>
            <LinearGradient colors={[pastel.mint, pastel.mintDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.applyMiniInner}>
              <Text style={styles.applyMiniText}>Apply →</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuContent} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <Text style={styles.menuLabel}>House style</Text>
            <View style={styles.row}>
              {HOUSE_STYLES.map((s) => (
                <Chip key={s.key} label={s.label} active={cfg.houseStyle === s.key} onPress={() => patch({ houseStyle: s.key })} />
              ))}
            </View>

            <Text style={styles.menuLabel}>Roof style</Text>
            <View style={styles.row}>
              {ROOF_STYLE_NAMES.map((name) => (
                <Chip key={name} label={name} active={cfg.roofStyle === name} onPress={() => patch({ roofStyle: name })} />
              ))}
            </View>

            <Text style={styles.menuLabel}>Color theme</Text>
            <View style={styles.row}>
              {COLOR_THEME_NAMES.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => patch({ colorTheme: name })}
                  style={[styles.swatch, { backgroundColor: COLOR_THEMES[name].wall }, cfg.colorTheme === name && styles.swatchActive]}
                >
                  <View style={[styles.swatchRoof, { backgroundColor: COLOR_THEMES[name].roof }]} />
                </Pressable>
              ))}
            </View>

            <Text style={styles.menuLabel}>Garden props</Text>
            <View style={styles.row}>
              {GARDEN_PROPS.map((p) => (
                <Chip key={p.key} label={p.label} active={cfg.props[p.key]} onPress={() => toggleProp(p.key)} />
              ))}
            </View>

            <View style={styles.sliderRow}>
              <Text style={styles.menuLabel}>Window light</Text>
              <Text style={styles.sliderVal}>{Math.round(cfg.windowIntensity * 100)}%</Text>
            </View>
            <PastelSlider value={cfg.windowIntensity / 1.5} onChange={(v) => patch({ windowIntensity: Number((v * 1.5).toFixed(2)) })} />

            <Text style={styles.menuLabel}>Window color</Text>
            <View style={styles.row}>
              {WINDOW_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => patch({ windowColor: c })}
                  style={[styles.colorDot, { backgroundColor: c }, cfg.windowColor === c && styles.colorDotActive]}
                />
              ))}
            </View>
        </ScrollView>
      </Animated.View>
      {/* safe-area floor below the dock */}
      <View style={{ height: insets.bottom, backgroundColor: DOCK_BG }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: pastel.sky },
  canvasWrap: { flex: 1 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 16 },
  kicker: { color: pastel.mintDeep, fontWeight: '800', fontSize: 12, letterSpacing: 0.6 },
  title: { color: pastel.ink, fontWeight: '900', fontSize: 28, marginTop: 2 },
  linkBadge: {
    alignSelf: 'flex-start', marginTop: 8,
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1,
  },
  linkBadgeLinked: {
    backgroundColor: 'rgba(110,231,183,0.22)',
    borderColor: 'rgba(72,187,120,0.55)',
  },
  linkBadgeSandbox: {
    backgroundColor: 'rgba(251,211,141,0.28)',
    borderColor: 'rgba(214,158,46,0.45)',
  },
  linkBadgeText: { fontSize: 11.5, fontWeight: '800', color: pastel.ink },

  dock: {
    backgroundColor: DOCK_BG,
    borderTopLeftRadius: rad.xl,
    borderTopRightRadius: rad.xl,
    overflow: 'hidden',
    shadowColor: '#7a6b5a',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 14,
  },
  handleZone: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  grabberTap: { paddingVertical: 8, paddingRight: 12 },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(74,63,85,0.25)' },
  dockTitle: { flex: 1, color: pastel.ink, fontWeight: '900', fontSize: 15 },
  applyMini: { borderRadius: rad.pill, overflow: 'hidden' },
  applyMiniInner: { paddingHorizontal: 18, paddingVertical: 9 },
  applyMiniText: { color: pastel.ink, fontWeight: '900', fontSize: 13.5 },
  menuScroll: { flex: 1 },
  menuContent: { paddingHorizontal: 16, paddingBottom: 16 },
  menuLabel: { color: pastel.sub, fontWeight: '800', fontSize: 12, letterSpacing: 0.4, marginBottom: 8, marginTop: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },

  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: rad.pill, backgroundColor: pastel.cream, borderWidth: 1.5, borderColor: 'transparent' },
  chipActive: { borderColor: pastel.mintDeep, backgroundColor: pastel.mint },
  chipText: { color: pastel.sub, fontWeight: '700', fontSize: 12.5 },
  chipTextActive: { color: pastel.ink },

  swatch: { width: 50, height: 50, borderRadius: rad.md, alignItems: 'center', paddingTop: 6, borderWidth: 3, borderColor: 'transparent', overflow: 'hidden' },
  swatchActive: { borderColor: pastel.ink },
  swatchRoof: { width: '80%', height: 13, borderRadius: 6 },

  colorDot: { width: 38, height: 38, borderRadius: 19, borderWidth: 3, borderColor: 'rgba(0,0,0,0.08)' },
  colorDotActive: { borderColor: pastel.ink },

  sliderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sliderVal: { color: pastel.ink, fontWeight: '800', fontSize: 12 },
  track: { height: 24, borderRadius: 12, backgroundColor: pastel.cream, justifyContent: 'center', marginTop: 4, marginBottom: 6, overflow: 'hidden' },
  trackFill: { position: 'absolute', left: 0, height: 24, backgroundColor: pastel.amber },
  thumb: { width: 22, height: 22, marginLeft: 1, borderRadius: 11, backgroundColor: pastel.white, borderWidth: 2, borderColor: pastel.amberDeep },
});
