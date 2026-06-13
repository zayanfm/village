/**
 * YouthRoomHome.js — Cozy Room & Explicit Labels
 *
 * Isometric clay room with warm overhead light. Two interaction zones carry
 * PERSISTENT, camera-facing labels (drei <Html> needs the DOM, so labels are
 * RN tags projected from 3D anchors every frame — they always face the camera):
 *   - "Community Pinboard"  -> YouthPinboardForum
 *   - "AI Companion"        -> YouthAICompanion   (the floating OrbCompanion)
 * Tapping the label OR its 3D asset runs a camera focal zoom, then routes.
 *
 * WEBGL LIFECYCLE (freeze fix): the <Canvas> is gated on screen focus. Leaving
 * the screen unmounts it — R3F cancels its frame loop and disposes the renderer
 * / GL context — and returning remounts a fresh context with new listeners.
 * On focus we also reset the camera/focus control + navigation guard, so the
 * camera is never stuck mid-zoom and taps stay live.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as THREE from 'three';
import OrbCompanion from './OrbCompanion';
import { COLOR_THEMES, defaultYouthHouseConfig, pastel, youthRadius as rad } from './youthTheme';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const LABEL_W = 170;

const FOCUS_TARGETS = {
  pin: { anchor: [1.4, 2.55, -2.88], route: 'YouthPinboardForum' },
  ai: { anchor: [-1.4, 1.6, -1.4], route: 'YouthAICompanion' },
};

function Room({ accent }) {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color={pastel.clay} roughness={0.95} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0.4]}>
        <circleGeometry args={[1.6, 40]} />
        <meshStandardMaterial color={accent} roughness={1} />
      </mesh>
      <mesh receiveShadow position={[0, 1.5, -3]}>
        <boxGeometry args={[6, 3, 0.2]} />
        <meshStandardMaterial color={pastel.cream} roughness={1} />
      </mesh>
      <mesh receiveShadow position={[-3, 1.5, 0]}>
        <boxGeometry args={[0.2, 3, 6]} />
        <meshStandardMaterial color={pastel.clayDeep} roughness={1} />
      </mesh>
    </group>
  );
}

// Decorative floor pouf beneath the orb (purely cosmetic — NOT the AI zone).
function Pouf() {
  return (
    <mesh castShadow receiveShadow position={[-1.4, 0.18, -1.4]}>
      <cylinderGeometry args={[0.5, 0.55, 0.34, 28]} />
      <meshStandardMaterial color={pastel.blush} roughness={1} />
    </mesh>
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

function Scene({ accent, control, projected, onArrive }) {
  const root = useRef();
  const anchorPin = useRef();
  const anchorAI = useRef();
  const { size } = useThree();
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const isoDir = useMemo(() => new THREE.Vector3(7, 7, 7).normalize(), []);

  useFrame(({ camera }) => {
    const c = control.current;

    if (c.requestFocus && !c.focusing) {
      c.focusing = true;
      c.fired = false;
      c.activeFocus = c.requestFocus;
      c.requestFocus = null;
    }

    if (!c.focusing && root.current) {
      root.current.rotation.y += (c.azimuth - root.current.rotation.y) * 0.12;
    }
    if (root.current) root.current.updateMatrixWorld(true);

    if (c.focusing) {
      const target = FOCUS_TARGETS[c.activeFocus];
      camTarget.set(target.anchor[0], target.anchor[1], target.anchor[2]);
      const desired = tmp.copy(isoDir).multiplyScalar(6).add(camTarget);
      camera.position.lerp(desired, 0.12);
      camera.zoom += (150 - camera.zoom) * 0.12;
      camera.lookAt(camTarget);
      camera.updateProjectionMatrix();
      if (!c.fired && camera.zoom > 138) {
        c.fired = true;
        onArrive(target.route);
      }
    }

    const out = [];
    [anchorPin, anchorAI].forEach((ref) => {
      if (ref.current) {
        ref.current.getWorldPosition(tmp).project(camera);
        out.push({ x: (tmp.x * 0.5 + 0.5) * size.width, y: (-tmp.y * 0.5 + 0.5) * size.height, visible: tmp.z < 1 });
      } else {
        out.push({ x: 0, y: 0, visible: false });
      }
    });
    projected.value = out;
  });

  const focus = (which) => (control.current.requestFocus = which);

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[0, 4, 1]} intensity={28} distance={14} decay={2} color={'#FFE6C0'} castShadow />
      <hemisphereLight args={['#fff3e2', '#caa', 0.4]} />
      <group ref={root}>
        <Room accent={accent} />
        <Pouf />
        {/* AI companion is the floating orb (NOT a seat) */}
        <OrbCompanion position={[-1.4, 0.95, -1.4]} scale={0.8} onPress={() => focus('ai')} />
        <Pinboard onPress={() => focus('pin')} />
        <Door onPress={() => onArrive('YouthExteriorEdit')} />
        <Plant />
        <group ref={anchorPin} position={FOCUS_TARGETS.pin.anchor} />
        <group ref={anchorAI} position={FOCUS_TARGETS.ai.anchor} />
      </group>
    </>
  );
}

function Label({ index, text, projected, onPress }) {
  const style = useAnimatedStyle(() => {
    const p = projected.value && projected.value[index];
    if (!p || !p.visible) return { opacity: 0, transform: [{ translateX: -9999 }, { translateY: -9999 }] };
    return { opacity: 1, transform: [{ translateX: p.x - LABEL_W / 2 }, { translateY: p.y - 22 }] };
  });
  return (
    <Animated.View style={[styles.labelWrap, style]} pointerEvents="box-none">
      <Pressable onPress={onPress} style={styles.labelGlass}>
        <Text style={styles.labelText}>{text}</Text>
        <View style={styles.labelStem} />
      </Pressable>
    </Animated.View>
  );
}

export default function YouthRoomHome({ navigation, route }) {
  const cfg = route?.params?.youthHouseConfig ?? defaultYouthHouseConfig;
  const accent = (COLOR_THEMES[cfg.colorTheme] ?? COLOR_THEMES['Pastel Mint']).accent;
  const isFocused = useIsFocused();

  const control = useRef({ azimuth: 0, base: 0, requestFocus: null, focusing: false, fired: false, activeFocus: null });
  const projected = useSharedValue([{ x: 0, y: 0, visible: false }, { x: 0, y: 0, visible: false }]);
  const navigatedRef = useRef(false);

  // Reset interaction + nav state every time the screen regains focus, so the
  // camera is never stuck zoomed-in and the portals stay tappable.
  useFocusEffect(
    useCallback(() => {
      const c = control.current;
      c.requestFocus = null;
      c.focusing = false;
      c.fired = false;
      c.activeFocus = null;
      navigatedRef.current = false;
      return () => {};
    }, [])
  );

  const arrive = (routeName) => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    navigation?.navigate(routeName);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6,
        onPanResponderGrant: () => (control.current.base = control.current.azimuth),
        onPanResponderMove: (_e, g) => {
          if (!control.current.focusing) control.current.azimuth = clamp(control.current.base + g.dx * 0.004, -0.5, 0.5);
        },
      }),
    []
  );

  return (
    <View style={styles.root}>
      <View style={styles.fill} {...responder.panHandlers}>
        {isFocused && (
          <Canvas shadows orthographic camera={{ position: [7, 7, 7], zoom: 78, near: -50, far: 100 }} onCreated={({ gl }) => gl.setClearColor('#2A2436', 1)}>
            <Scene accent={accent} control={control} projected={projected} onArrive={arrive} />
          </Canvas>
        )}
      </View>

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Label index={0} text="Community Pinboard" projected={projected} onPress={() => (control.current.requestFocus = 'pin')} />
        <Label index={1} text="AI Companion" projected={projected} onPress={() => (control.current.requestFocus = 'ai')} />
      </View>

      <SafeAreaView style={styles.header} edges={['top']} pointerEvents="box-none">
        <Pressable onPress={() => arrive('YouthExteriorEdit')} hitSlop={12} style={styles.exit}>
          <Text style={styles.exitText}>‹ Exit home</Text>
        </Pressable>
        <Text style={styles.title}>Welcome home</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#2A2436' },
  fill: { flex: 1 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 12 },
  exit: { alignSelf: 'flex-start' },
  exitText: { color: pastel.amber, fontWeight: '800', fontSize: 15 },
  title: { color: pastel.white, fontWeight: '900', fontSize: 26, marginTop: 6 },

  labelWrap: { position: 'absolute', top: 0, left: 0, width: LABEL_W, alignItems: 'center' },
  labelGlass: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: rad.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    alignItems: 'center',
  },
  labelText: { color: pastel.ink, fontWeight: '900', fontSize: 13.5 },
  labelStem: { position: 'absolute', bottom: -6, width: 2, height: 8, backgroundColor: 'rgba(255,255,255,0.92)' },
});
