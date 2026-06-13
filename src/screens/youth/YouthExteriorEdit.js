/**
 * YouthExteriorEdit.js — The 3D House Exterior Customizer
 *
 * Full-screen R3F view of a single customizable tiny house on a slowly rotating
 * turntable plot. A floating bottom menu (style buttons, color-theme buttons,
 * window-light slider) drives a local `youthHouseConfig` object in real time.
 *
 * Higgsfield note: the house is procedural R3F (runtime). Higgsfield can bake
 * clay/pastel PBR textures at design time to drop onto these materials later.
 *
 * "Apply Changes" springs a camera zoom-out, then navigates inside the house
 * (YouthRoomHome), carrying youthHouseConfig forward — the same template object
 * destined for the worker's map view.
 */

import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Canvas, useFrame } from '@react-three/fiber';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import * as THREE from 'three';
import {
  COLOR_THEMES,
  COLOR_THEME_NAMES,
  HOUSE_STYLES,
  defaultYouthHouseConfig,
  pastel,
  youthRadius as rad,
} from './youthTheme';

/* --------------------------- 3D: the customizable house --------------------- */

function Windows({ intensity, positions }) {
  return positions.map((p, i) => (
    <mesh key={i} position={p}>
      <boxGeometry args={[0.26, 0.26, 0.04]} />
      <meshStandardMaterial color="#FFF6D8" emissive={pastel.glow} emissiveIntensity={intensity} roughness={0.35} />
    </mesh>
  ));
}

function CottageMesh({ theme, intensity }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[1.4, 1.0, 1.4]} />
        <meshStandardMaterial color={theme.wall} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 1.3, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.15, 0.7, 4]} />
        <meshStandardMaterial color={theme.roof} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.35, 0.71]}>
        <boxGeometry args={[0.32, 0.6, 0.04]} />
        <meshStandardMaterial color={theme.accent} roughness={0.6} />
      </mesh>
      <Windows intensity={intensity} positions={[[0.42, 0.62, 0.71], [-0.42, 0.62, 0.71]]} />
    </group>
  );
}

function AFrameMesh({ theme, intensity }) {
  return (
    <group>
      <mesh receiveShadow position={[0, 0.06, 0]}>
        <boxGeometry args={[1.7, 0.12, 1.7]} />
        <meshStandardMaterial color={theme.accent} roughness={0.9} />
      </mesh>
      {/* two slanted roof slabs forming the A */}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 0.42, 0.95, 0]} rotation={[0, 0, s * 0.62]}>
          <boxGeometry args={[0.12, 2.0, 1.7]} />
          <meshStandardMaterial color={theme.roof} roughness={0.7} />
        </mesh>
      ))}
      {/* front gable infill */}
      <mesh position={[0, 0.85, -0.84]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[1.1, 1.1, 0.06]} />
        <meshStandardMaterial color={theme.wall} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.45, 0.85]}>
        <boxGeometry args={[0.34, 0.7, 0.04]} />
        <meshStandardMaterial color={theme.accent} roughness={0.6} />
      </mesh>
      <Windows intensity={intensity} positions={[[0, 1.05, 0.86]]} />
    </group>
  );
}

function CyberGlassMesh({ theme, intensity }) {
  return (
    <group>
      <mesh receiveShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[1.5, 0.1, 1.5]} />
        <meshStandardMaterial color={theme.accent} metalness={0.3} roughness={0.4} />
      </mesh>
      {/* glowing core (the "window lighting") */}
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[0.7, 1.1, 0.7]} />
        <meshStandardMaterial color={pastel.glow} emissive={pastel.glow} emissiveIntensity={intensity} />
      </mesh>
      {/* translucent glass shell */}
      <mesh castShadow position={[0, 0.8, 0]}>
        <boxGeometry args={[1.3, 1.5, 1.3]} />
        <meshStandardMaterial
          color={theme.wall}
          transparent
          opacity={0.42}
          metalness={0.6}
          roughness={0.1}
        />
      </mesh>
      {/* frame edges */}
      <lineSegments position={[0, 0.8, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(1.3, 1.5, 1.3)]} />
        <lineBasicMaterial color={theme.roof} />
      </lineSegments>
    </group>
  );
}

function YouthHouse({ config }) {
  const theme = COLOR_THEMES[config.colorTheme] ?? COLOR_THEMES['Pastel Mint'];
  const i = config.windowIntensity;
  if (config.houseStyle === 'aframe') return <AFrameMesh theme={theme} intensity={i} />;
  if (config.houseStyle === 'cyberglass') return <CyberGlassMesh theme={theme} intensity={i} />;
  return <CottageMesh theme={theme} intensity={i} />;
}

function Turntable({ config }) {
  const spin = useRef();
  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.y += delta * 0.35;
  });
  return (
    <group ref={spin}>
      {/* plot */}
      <mesh receiveShadow position={[0, -0.05, 0]}>
        <cylinderGeometry args={[1.7, 1.8, 0.18, 48]} />
        <meshStandardMaterial color={pastel.clay} roughness={0.9} />
      </mesh>
      <mesh receiveShadow position={[0, 0.045, 0]}>
        <cylinderGeometry args={[1.55, 1.55, 0.04, 48]} />
        <meshStandardMaterial color={pastel.mint} roughness={1} />
      </mesh>
      <group position={[0, 0.07, 0]}>
        <YouthHouse config={config} />
      </group>
    </group>
  );
}

/** Camera that idles at a cozy angle and dollies out when `zooming` is set. */
function CameraRig({ control, onZoomedOut }) {
  const done = useRef(false);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const target = control.current.radius;
    const cur = camera.position.length();
    const next = cur + (target - cur) * 0.12;
    tmp.set(0.6, 0.5, 1).normalize().multiplyScalar(next);
    camera.position.copy(tmp);
    camera.lookAt(0, 0.7, 0);
    if (control.current.zooming && !done.current && Math.abs(next - target) < 0.4) {
      done.current = true;
      onZoomedOut && onZoomedOut();
    }
  });
  return null;
}

/* --------------------------- UI: pastel slider ------------------------------ */

function PastelSlider({ value, onChange }) {
  const [w, setW] = useState(0);
  const progress = useSharedValue(value);
  progress.value = withSpring(value, { damping: 18, stiffness: 200 });

  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * Math.max(w - 26, 0) }],
  }));
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const setFromX = (x) => {
    if (w <= 0) return;
    onChange(Math.min(Math.max(x / w, 0), 1));
  };

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
  const [youthHouseConfig, setYouthHouseConfig] = useState(defaultYouthHouseConfig);
  const control = useRef({ radius: 5.2, zooming: false });
  const navigatedRef = useRef(false);

  const patch = (p) => setYouthHouseConfig((prev) => ({ ...prev, ...p }));

  const applyChanges = () => {
    control.current.zooming = true;
    control.current.radius = 11; // dolly out
  };

  const goInside = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    navigation?.navigate('YouthRoomHome', { youthHouseConfig });
  };

  return (
    <View style={styles.root}>
      <Canvas
        shadows
        camera={{ position: [3.1, 2.6, 5.2], fov: 40 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => gl.setClearColor(pastel.sky, 1)}
      >
        <ambientLight intensity={0.7} />
        <hemisphereLight args={['#ffffff', '#e8d6c2', 0.6]} />
        <directionalLight
          position={[4, 8, 4]}
          intensity={1.3}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <Turntable config={youthHouseConfig} />
        <CameraRig control={control} onZoomedOut={goInside} />
      </Canvas>

      <SafeAreaView style={styles.header} edges={['top']} pointerEvents="box-none">
        <Text style={styles.kicker}>MY HOME</Text>
        <Text style={styles.title}>Make it yours</Text>
      </SafeAreaView>

      {/* Floating parameter menu */}
      <SafeAreaView style={styles.menuWrap} edges={['bottom']} pointerEvents="box-none">
        <MotiView
          from={{ opacity: 0, translateY: 30 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 18, stiffness: 180 }}
          style={styles.menu}
        >
          <Text style={styles.menuLabel}>House style</Text>
          <View style={styles.row}>
            {HOUSE_STYLES.map((s) => (
              <Chip
                key={s.key}
                label={s.label}
                active={youthHouseConfig.houseStyle === s.key}
                onPress={() => patch({ houseStyle: s.key })}
              />
            ))}
          </View>

          <Text style={styles.menuLabel}>Color theme</Text>
          <View style={styles.row}>
            {COLOR_THEME_NAMES.map((name) => (
              <Pressable
                key={name}
                onPress={() => patch({ colorTheme: name })}
                style={[
                  styles.swatch,
                  { backgroundColor: COLOR_THEMES[name].wall },
                  youthHouseConfig.colorTheme === name && styles.swatchActive,
                ]}
              >
                <View style={[styles.swatchRoof, { backgroundColor: COLOR_THEMES[name].roof }]} />
              </Pressable>
            ))}
          </View>

          <View style={styles.sliderRow}>
            <Text style={styles.menuLabel}>Window light</Text>
            <Text style={styles.sliderVal}>{Math.round(youthHouseConfig.windowIntensity * 100)}%</Text>
          </View>
          <PastelSlider
            value={youthHouseConfig.windowIntensity / 1.5}
            onChange={(v) => patch({ windowIntensity: Number((v * 1.5).toFixed(2)) })}
          />

          <Pressable onPress={applyChanges} style={styles.applyWrap}>
            <LinearGradient
              colors={[pastel.mint, pastel.mintDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.applyBtn}
            >
              <Text style={styles.applyText}>Apply Changes  →</Text>
            </LinearGradient>
          </Pressable>
        </MotiView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: pastel.sky },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 16 },
  kicker: { color: pastel.mintDeep, fontWeight: '800', fontSize: 12.5, letterSpacing: 1 },
  title: { color: pastel.ink, fontWeight: '900', fontSize: 28, marginTop: 2 },

  menuWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  menu: {
    margin: 14,
    padding: 18,
    borderRadius: rad.xl,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#7a6b5a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  menuLabel: { color: pastel.sub, fontWeight: '800', fontSize: 12, letterSpacing: 0.4, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: rad.pill,
    backgroundColor: pastel.cream,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipActive: { borderColor: pastel.mintDeep, backgroundColor: pastel.mint },
  chipText: { color: pastel.sub, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: pastel.ink },

  swatch: {
    width: 52,
    height: 52,
    borderRadius: rad.md,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  swatchActive: { borderColor: pastel.ink },
  swatchRoof: { width: '80%', height: 14, borderRadius: 6 },

  sliderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderVal: { color: pastel.ink, fontWeight: '800', fontSize: 12 },
  track: {
    height: 26,
    borderRadius: 13,
    backgroundColor: pastel.cream,
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 16,
    overflow: 'hidden',
  },
  trackFill: { position: 'absolute', left: 0, height: 26, backgroundColor: pastel.amber },
  thumb: {
    width: 24,
    height: 24,
    marginLeft: 1,
    borderRadius: 12,
    backgroundColor: pastel.white,
    borderWidth: 2,
    borderColor: pastel.amberDeep,
  },

  applyWrap: { marginTop: 2 },
  applyBtn: {
    height: 52,
    borderRadius: rad.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: { color: pastel.ink, fontWeight: '900', fontSize: 16, letterSpacing: 0.3 },
});
