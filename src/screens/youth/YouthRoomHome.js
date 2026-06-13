/**
 * YouthRoomHome.js — The Isometric Room Hub (Bondee style)
 *
 * A cozy, clay-textured open-front room rendered with an orthographic camera for
 * a clean isometric look and warm overhead lighting. Three stylized props are
 * navigation portals (tap the 3D object OR its matching overlay pill):
 *   - Sofa/Beanbag -> YouthAICompanion
 *   - Wall Pinboard -> YouthPinboardForum
 *   - Front Door    -> YouthExteriorEdit
 *
 * A gentle one-finger drag nudges the room's azimuth (clamped) for a tactile
 * feel without losing the iso framing.
 */

import React, { useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Canvas, useFrame } from '@react-three/fiber';
import { MotiView } from 'moti';
import { COLOR_THEMES, defaultYouthHouseConfig, pastel, youthRadius as rad } from './youthTheme';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function Room({ accent }) {
  return (
    <group>
      {/* floor */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color={pastel.clay} roughness={0.95} />
      </mesh>
      {/* rug */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0.4]}>
        <circleGeometry args={[1.6, 40]} />
        <meshStandardMaterial color={accent} roughness={1} />
      </mesh>
      {/* back wall */}
      <mesh receiveShadow position={[0, 1.5, -3]}>
        <boxGeometry args={[6, 3, 0.2]} />
        <meshStandardMaterial color={pastel.cream} roughness={1} />
      </mesh>
      {/* left wall */}
      <mesh receiveShadow position={[-3, 1.5, 0]}>
        <boxGeometry args={[0.2, 3, 6]} />
        <meshStandardMaterial color={pastel.clayDeep} roughness={1} />
      </mesh>
    </group>
  );
}

function Sofa({ onPress }) {
  return (
    <group position={[-1.4, 0, -1.4]} onClick={onPress}>
      <mesh castShadow position={[0, 0.35, 0]}>
        <boxGeometry args={[1.4, 0.5, 0.9]} />
        <meshStandardMaterial color={pastel.lavender} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.7, -0.35]}>
        <boxGeometry args={[1.4, 0.6, 0.25]} />
        <meshStandardMaterial color={pastel.lavenderDeep} roughness={0.9} />
      </mesh>
      {/* round beanbag cushion */}
      <mesh castShadow position={[0.85, 0.3, 0.5]}>
        <sphereGeometry args={[0.35, 24, 24]} />
        <meshStandardMaterial color={pastel.blush} roughness={1} />
      </mesh>
    </group>
  );
}

function Pinboard({ onPress }) {
  return (
    <group position={[1.4, 1.7, -2.88]} onClick={onPress}>
      <mesh castShadow>
        <boxGeometry args={[1.5, 1.1, 0.08]} />
        <meshStandardMaterial color={pastel.cork} roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[1.6, 1.2, 0.04]} />
        <meshStandardMaterial color={pastel.corkDark} roughness={1} />
      </mesh>
      {/* a couple of pinned notes */}
      {[[-0.4, 0.2], [0.35, -0.1], [0.1, 0.3]].map((p, i) => (
        <mesh key={i} position={[p[0], p[1], 0.1]} rotation={[0, 0, (i - 1) * 0.12]}>
          <boxGeometry args={[0.42, 0.42, 0.02]} />
          <meshStandardMaterial color={pastel.white} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Door({ onPress }) {
  return (
    <group position={[-2.88, 1.0, 1.2]} rotation={[0, Math.PI / 2, 0]} onClick={onPress}>
      <mesh castShadow>
        <boxGeometry args={[1.0, 2.0, 0.12]} />
        <meshStandardMaterial color={pastel.amberDeep} roughness={0.7} />
      </mesh>
      <mesh position={[0.32, 0, 0.1]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial color={pastel.glow} metalness={0.4} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Plant() {
  const leaves = useRef();
  useFrame(({ clock }) => {
    if (leaves.current) leaves.current.rotation.z = Math.sin(clock.elapsedTime * 1.2) * 0.06;
  });
  return (
    <group position={[2.0, 0, 1.4]}>
      <mesh castShadow position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 0.5, 16]} />
        <meshStandardMaterial color={pastel.amber} roughness={0.9} />
      </mesh>
      <mesh ref={leaves} castShadow position={[0, 0.7, 0]}>
        <sphereGeometry args={[0.4, 20, 20]} />
        <meshStandardMaterial color={pastel.mintDeep} roughness={1} />
      </mesh>
    </group>
  );
}

function Scene({ accent, control, onSofa, onPinboard, onDoor }) {
  const root = useRef();
  useFrame(() => {
    if (root.current) {
      root.current.rotation.y += (control.current.azimuth - root.current.rotation.y) * 0.12;
    }
  });
  return (
    <>
      <ambientLight intensity={0.65} />
      {/* warm cozy overhead light */}
      <pointLight position={[0, 4, 1]} intensity={28} distance={14} decay={2} color={'#FFE6C0'} castShadow />
      <hemisphereLight args={['#fff3e2', '#caa', 0.4]} />
      <group ref={root}>
        <Room accent={accent} />
        <Sofa onPress={onSofa} />
        <Pinboard onPress={onPinboard} />
        <Door onPress={onDoor} />
        <Plant />
      </group>
    </>
  );
}

export default function YouthRoomHome({ navigation, route }) {
  const cfg = route?.params?.youthHouseConfig ?? defaultYouthHouseConfig;
  const accent = (COLOR_THEMES[cfg.colorTheme] ?? COLOR_THEMES['Pastel Mint']).accent;

  const control = useRef({ azimuth: 0, base: 0 });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6,
        onPanResponderGrant: () => {
          control.current.base = control.current.azimuth;
        },
        onPanResponderMove: (_e, g) => {
          control.current.azimuth = clamp(control.current.base + g.dx * 0.004, -0.5, 0.5);
        },
      }),
    []
  );

  const goChat = () => navigation?.navigate('YouthAICompanion');
  const goPinboard = () => navigation?.navigate('YouthPinboardForum');
  const goExit = () => navigation?.navigate('YouthExteriorEdit');

  return (
    <View style={styles.root}>
      <View style={styles.fill} {...responder.panHandlers}>
        <Canvas
          shadows
          orthographic
          camera={{ position: [7, 7, 7], zoom: 78, near: -50, far: 100 }}
          onCreated={({ gl }) => gl.setClearColor('#2A2436', 1)}
        >
          <Scene accent={accent} control={control} onSofa={goChat} onPinboard={goPinboard} onDoor={goExit} />
        </Canvas>
      </View>

      <SafeAreaView style={styles.header} edges={['top']} pointerEvents="box-none">
        <Text style={styles.kicker}>MY ROOM</Text>
        <Text style={styles.title}>Welcome home</Text>
      </SafeAreaView>

      {/* Overlay portal pills — mirror the 3D touchpoints for reliable navigation */}
      <SafeAreaView style={styles.dock} edges={['bottom']} pointerEvents="box-none">
        <MotiView
          from={{ opacity: 0, translateY: 24 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 18, stiffness: 180 }}
          style={styles.pillRow}
        >
          <PortalPill icon="🛋" label="Chat" onPress={goChat} />
          <PortalPill icon="📌" label="Pinboard" onPress={goPinboard} />
          <PortalPill icon="🚪" label="Exit" onPress={goExit} />
        </MotiView>
      </SafeAreaView>
    </View>
  );
}

function PortalPill({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.pill}>
      <Text style={styles.pillIcon}>{icon}</Text>
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#2A2436' },
  fill: { flex: 1 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 16 },
  kicker: { color: pastel.amber, fontWeight: '800', fontSize: 12.5, letterSpacing: 1 },
  title: { color: pastel.white, fontWeight: '900', fontSize: 28, marginTop: 2 },

  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  pillRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, padding: 16 },
  pill: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: rad.lg,
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  pillIcon: { fontSize: 22 },
  pillText: { color: pastel.ink, fontWeight: '800', fontSize: 12.5, marginTop: 3 },
});
