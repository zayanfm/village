/**
 * VillageMap.js
 *
 * Full-screen, freely explorable react-three-fiber village.
 *
 * NAVIGATION (mobile touch, bounded)
 * ----------------------------------
 * A spherical camera rig (target + radius + azimuth + polar) is driven by a
 * multitouch PanResponder:
 *   - 1 finger drag  -> orbit (azimuth + polar)
 *   - 2 finger pinch -> zoom  (radius)
 *   - 2 finger drag  -> pan   (move the look-at target across the ground)
 * Every axis is clamped, so the camera can never fall below the ground or fly
 * off into the void:
 *   radius [R_MIN..R_MAX], polar [POLAR_MIN..POLAR_MAX], target [-PAN_MAX..PAN_MAX].
 *
 * PERSISTENT LABELS (drei <Html>/<Text> don't run on RN)
 * ------------------------------------------------------
 * Each house's world position is projected to 2D screen space every frame and
 * written to a Reanimated shared value; real RN glassmorphic tags read it and
 * follow the houses on the UI thread. They always "face" the camera because
 * they live in the 2D overlay. Tapping a tag (or its house) navigates directly
 * to YouthCaseDetail.
 */

import React, { useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as THREE from 'three';
import TinyHouseNode from './TinyHouseNode';
import { palette, radius as rad } from '../../theme/theme';

// ---- camera bounds ----
const R_MIN = 6;
const R_MAX = 24;
const POLAR_MIN = 0.3; // near top-down
const POLAR_MAX = 1.25; // low, but always above ground
const PAN_MAX = 7;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const LABEL_W = 158;
const LABEL_H = 56;

// Two rows flanking a central path; houses face the path.
function layout(count) {
  const cols = Math.ceil(count / 2);
  return Array.from({ length: count }, (_, i) => {
    const row = i % 2;
    const col = Math.floor(i / 2);
    const x = (col - (cols - 1) / 2) * 2.6;
    const z = row === 0 ? -1.8 : 1.8;
    const rotationY = row === 0 ? 0 : Math.PI;
    return { x, z, rotationY };
  });
}

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#4F7B3A" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <planeGeometry args={[60, 1.7]} />
        <meshStandardMaterial color="#7C7468" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]} receiveShadow>
        <planeGeometry args={[1.7, 60]} />
        <meshStandardMaterial color="#857C70" roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Applies the camera rig + projects house positions to the labels SV each frame. */
function CameraAndLabels({ control, positions, projected }) {
  const { size } = useThree();
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    const c = control.current;
    const sp = Math.sin(c.polar);
    const cp = Math.cos(c.polar);
    const px = c.target.x + c.radius * sp * Math.sin(c.azimuth);
    const py = c.radius * cp;
    const pz = c.target.z + c.radius * sp * Math.cos(c.azimuth);

    camera.position.lerp(tmp.set(px, py, pz), 0.2);
    camera.lookAt(c.target.x, 0.6, c.target.z);
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    const w = size.width;
    const h = size.height;
    const arr = [];
    for (let i = 0; i < positions.length; i++) {
      tmp.set(positions[i].x, 1.7, positions[i].z).project(camera);
      arr.push({
        x: (tmp.x * 0.5 + 0.5) * w,
        y: (-tmp.y * 0.5 + 0.5) * h,
        visible: tmp.z < 1,
      });
    }
    projected.value = arr;
  });

  return null;
}

function Scene({ cases, positions, control, projected, onSelect }) {
  return (
    <>
      <hemisphereLight args={['#cfeaff', '#3a5a2a', 0.55]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[6, 12, 5]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={48}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />

      <Ground />
      {cases.map((c, i) => (
        <TinyHouseNode
          key={c.id}
          index={i}
          config={c.config}
          position={[positions[i].x, 0, positions[i].z]}
          rotationY={positions[i].rotationY}
          onSelect={() => onSelect(c)}
        />
      ))}

      <CameraAndLabels control={control} positions={positions} projected={projected} />
    </>
  );
}

function Label({ index, data, projected, onSelect }) {
  const style = useAnimatedStyle(() => {
    const arr = projected.value;
    const p = arr && arr[index];
    if (!p || !p.visible) {
      return { opacity: 0, transform: [{ translateX: -9999 }, { translateY: -9999 }] };
    }
    return {
      opacity: 1,
      transform: [{ translateX: p.x - LABEL_W / 2 }, { translateY: p.y - LABEL_H - 8 }],
    };
  });

  return (
    <Animated.View style={[styles.labelWrap, style]} pointerEvents="box-none">
      <Pressable onPress={onSelect} style={styles.labelGlass}>
        <Text numberOfLines={1} style={styles.labelName}>{data.youthName}</Text>
        <View style={styles.labelMeta}>
          <Text style={styles.labelId}>{data.caseId}</Text>
          <View style={styles.labelDot} />
          <Text numberOfLines={1} style={styles.labelTime}>{data.timestamp}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function VillageMap({ cases, onSelect }) {
  const positions = useMemo(() => layout(cases.length), [cases.length]);
  const projected = useSharedValue([]);

  // Spherical camera control, mutated by the PanResponder, read in useFrame.
  const control = useRef({
    target: { x: 0, z: 0 },
    radius: 14,
    azimuth: 0,
    polar: 0.7,
    base: null,
    pinch: null,
  });

  const responder = useMemo(() => {
    const shouldDrive = (e, g) =>
      (e.nativeEvent.touches && e.nativeEvent.touches.length >= 2) || Math.hypot(g.dx, g.dy) > 6;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
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
          if (!c.pinch) {
            c.pinch = { dist, mx, my, radius: c.radius, tx: c.target.x, tz: c.target.z, az: c.azimuth };
          } else {
            // zoom
            c.radius = clamp(c.pinch.radius * (c.pinch.dist / Math.max(dist, 1)), R_MIN, R_MAX);
            // pan the look-at target along the camera-facing ground plane
            const dmx = (mx - c.pinch.mx) * 0.012;
            const dmy = (my - c.pinch.my) * 0.012;
            const s = Math.sin(c.pinch.az);
            const co = Math.cos(c.pinch.az);
            c.target.x = clamp(c.pinch.tx - (dmx * co - dmy * s), -PAN_MAX, PAN_MAX);
            c.target.z = clamp(c.pinch.tz - (dmx * s + dmy * co), -PAN_MAX, PAN_MAX);
          }
        } else {
          c.pinch = null;
          c.azimuth = c.base.azimuth - g.dx * 0.005;
          c.polar = clamp(c.base.polar - g.dy * 0.005, POLAR_MIN, POLAR_MAX);
        }
      },
      onPanResponderRelease: () => {
        control.current.pinch = null;
      },
      onPanResponderTerminate: () => {
        control.current.pinch = null;
      },
    });
  }, []);

  return (
    <View style={styles.fill} {...responder.panHandlers}>
      <Canvas
        shadows
        camera={{ position: [0, 9, 14], fov: 42, near: 0.1, far: 120 }}
        gl={{ antialias: true }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor('#06140F', 1);
          scene.fog = new THREE.Fog('#06140F', 22, 46);
        }}
      >
        <Scene
          cases={cases}
          positions={positions}
          control={control}
          projected={projected}
          onSelect={onSelect}
        />
      </Canvas>

      {/* Persistent camera-facing labels, projected from 3D each frame */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {cases.map((c, i) => (
          <Label key={c.id} index={i} data={c} projected={projected} onSelect={() => onSelect(c)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#06140F' },

  labelWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: LABEL_W,
    alignItems: 'center',
  },
  labelGlass: {
    minWidth: LABEL_W,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: rad.md,
    backgroundColor: 'rgba(12,32,27,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  labelName: { color: palette.white, fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  labelMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  labelId: { color: palette.mint, fontSize: 11.5, fontWeight: '700' },
  labelDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: palette.fog, marginHorizontal: 6 },
  labelTime: { color: palette.fog, fontSize: 11, fontWeight: '600' },
});
