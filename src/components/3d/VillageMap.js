/**
 * VillageMap.js — the worker's living 3D village square
 *
 * Synced with the youth side: each case renders the SHARED <YouthHouseMesh>
 * from that youth's `youthHouseConfig`, so the archetype / roof / color / glow
 * the youth chose appears verbatim on the worker map.
 *
 * Environment life (all procedural):
 *   - WindGrass  : stylized blades swaying via a GPU wind vertex shader
 *   - Trees/Shrubs: low-poly, gently swaying foliage (useFrame)
 *   - Path       : cobblestone strips + scattered stones connecting homes
 *   - Lampposts  : warm emissive lanterns with shadow-casting point lights
 *
 * Camera: clamped spherical rig (1-finger orbit, pinch zoom, 2-finger pan).
 * Labels: each house's world position is projected to 2D each frame and shown
 * as RN glass tags (drei <Html> can't run on RN), tappable → YouthCaseDetail.
 */

import React, { useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as THREE from 'three';
import YouthHouseMesh from '../../screens/youth/YouthHouseMesh';
import { palette, radius as rad } from '../../theme/theme';

// ---- camera bounds ----
const R_MIN = 6;
const R_MAX = 24;
const POLAR_MIN = 0.3;
const POLAR_MAX = 1.25;
const PAN_MAX = 7;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const LABEL_W = 158;
const LABEL_H = 56;
const HOUSE_SCALE = 0.8;

function layout(count) {
  const cols = Math.ceil(count / 2);
  return Array.from({ length: count }, (_, i) => {
    const row = i % 2;
    const col = Math.floor(i / 2);
    const x = (col - (cols - 1) / 2) * 3.6;
    const z = row === 0 ? -2.3 : 2.3;
    const rotationY = row === 0 ? 0 : Math.PI;
    return { x, z, rotationY };
  });
}

/* --------------------------- foliage --------------------------------------- */

// GPU wind-displacement grass: blades share one ShaderMaterial; the top of each
// blade (uv.y -> 1) sways, phase-shifted by world position.
function WindGrass({ count = 60, area = 22 }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#7BB36A') } },
        side: THREE.DoubleSide,
        vertexShader: `
          uniform float uTime;
          varying float vV;
          void main() {
            vV = uv.y;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            float sway = sin(uTime * 1.6 + wp.x * 1.5 + wp.z * 1.5) * 0.18 * uv.y;
            vec3 p = position;
            p.x += sway;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 uColor;
          varying float vV;
          void main() { gl_FragColor = vec4(uColor * (0.55 + 0.45 * vV), 1.0); }`,
      }),
    []
  );

  const blades = useMemo(
    () =>
      Array.from({ length: count }).map(() => {
        const h = 0.4 + Math.random() * 0.35;
        return { pos: [(Math.random() - 0.5) * area, h / 2, (Math.random() - 0.5) * area], rot: Math.random() * Math.PI, h };
      }),
    [count, area]
  );

  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
  });

  return blades.map((b, i) => (
    <mesh key={i} position={b.pos} rotation={[0, b.rot, 0]} material={mat}>
      <planeGeometry args={[0.14, b.h]} />
    </mesh>
  ));
}

function Tree({ position, tint = '#6FBF73', delay = 0 }) {
  const grp = useRef();
  useFrame(({ clock }) => {
    if (grp.current) grp.current.rotation.z = Math.sin(clock.elapsedTime * 1.1 + delay) * 0.045;
  });
  return (
    <group ref={grp} position={position}>
      <mesh castShadow position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 0.9, 8]} />
        <meshStandardMaterial color={'#8A6A4B'} roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 1.15, 0]}>
        <icosahedronGeometry args={[0.55, 0]} />
        <meshStandardMaterial color={tint} roughness={1} flatShading />
      </mesh>
      <mesh castShadow position={[0.18, 1.55, 0.1]}>
        <icosahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial color={tint} roughness={1} flatShading />
      </mesh>
    </group>
  );
}

function Shrub({ position, tint }) {
  return (
    <group position={position}>
      {[[0, 0.2, 0, 0.32], [0.28, 0.16, 0.05, 0.24], [-0.24, 0.15, -0.05, 0.22]].map((b, i) => (
        <mesh key={i} castShadow position={[b[0], b[1], b[2]]}>
          <icosahedronGeometry args={[b[3], 0]} />
          <meshStandardMaterial color={tint} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Lamppost({ position, shadow = false }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.06, 0.09, 1.4, 10]} />
        <meshStandardMaterial color={'#3A3A40'} metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[0.28, 0.32, 0.28]} />
        <meshStandardMaterial color={'#FFF3C9'} emissive={'#FFC24D'} emissiveIntensity={1.4} />
      </mesh>
      <pointLight
        position={[0, 1.5, 0]}
        intensity={14}
        distance={8}
        decay={2}
        color={'#FFC24D'}
        castShadow={shadow}
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
      />
    </group>
  );
}

function Ground() {
  // scattered cobblestones along the central path
  const stones = useMemo(
    () =>
      Array.from({ length: 22 }).map((_, i) => ({
        x: (Math.random() - 0.5) * 1.3,
        z: (i - 11) * 1.0 + (Math.random() - 0.5) * 0.4,
        s: 0.18 + Math.random() * 0.12,
        r: Math.random() * Math.PI,
      })),
    []
  );
  return (
    <group>
      {/* grass field */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#5C8A44" roughness={1} />
      </mesh>
      {/* cobblestone path (cross) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <planeGeometry args={[60, 1.9]} />
        <meshStandardMaterial color="#8E8474" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.011, 0]} receiveShadow>
        <planeGeometry args={[1.9, 60]} />
        <meshStandardMaterial color="#978C7A" roughness={0.95} />
      </mesh>
      {stones.map((s, i) => (
        <mesh key={i} position={[s.x, 0.04, s.z]} rotation={[0, s.r, 0]} receiveShadow castShadow>
          <boxGeometry args={[s.s, 0.06, s.s]} />
          <meshStandardMaterial color="#B7AC97" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------- house node ------------------------------------ */

function springScale(t) {
  if (t <= 0) return 0;
  return Math.min(1 - Math.exp(-7 * t) * Math.cos(9 * t), 1);
}

function HouseNode({ config, position, rotationY, index, onSelect }) {
  const grp = useRef();
  const start = useRef(null);
  useFrame(({ clock }) => {
    if (!grp.current) return;
    if (start.current === null) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current - index * 0.08;
    grp.current.scale.setScalar(Math.max(0.0001, springScale(t) * HOUSE_SCALE));
  });
  const handle = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    onSelect();
  };
  return (
    <group ref={grp} position={position} rotation={[0, rotationY, 0]} onClick={handle}>
      <YouthHouseMesh config={config} />
    </group>
  );
}

/* --------------------------- camera + labels ------------------------------- */

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
      tmp.set(positions[i].x, 1.6, positions[i].z).project(camera);
      arr.push({ x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, visible: tmp.z < 1 });
    }
    projected.value = arr;
  });

  return null;
}

function Scene({ cases, positions, control, projected, onSelect }) {
  return (
    <>
      <hemisphereLight args={['#cfe6ff', '#3a5a2a', 0.55]} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[6, 12, 5]}
        intensity={1.35}
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
      <WindGrass />
      <Tree position={[-5, 0, -4]} tint="#6FBF73" delay={0} />
      <Tree position={[5.2, 0, -3.2]} tint="#7FC97E" delay={1.2} />
      <Tree position={[-4.4, 0, 4.6]} tint="#68B36C" delay={2.1} />
      <Shrub position={[3.4, 0, 4.2]} tint="#9AD1A0" />
      <Shrub position={[-2.6, 0, -4.8]} tint="#B7E2BC" />
      <Lamppost position={[-1.6, 0, 0]} shadow />
      <Lamppost position={[1.6, 0, 0]} shadow />
      <Lamppost position={[0, 0, -4.5]} />

      {cases.map((c, i) => (
        <HouseNode
          key={c.id}
          index={i}
          config={c.youthHouseConfig}
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
    if (!p || !p.visible) return { opacity: 0, transform: [{ translateX: -9999 }, { translateY: -9999 }] };
    return { opacity: 1, transform: [{ translateX: p.x - LABEL_W / 2 }, { translateY: p.y - LABEL_H - 8 }] };
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
  const control = useRef({ target: { x: 0, z: 0 }, radius: 14, azimuth: 0, polar: 0.7, base: null, pinch: null });

  const responder = useMemo(() => {
    const shouldDrive = (e, g) => (e.nativeEvent.touches && e.nativeEvent.touches.length >= 2) || Math.hypot(g.dx, g.dy) > 6;
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
          if (!c.pinch) c.pinch = { dist, mx, my, radius: c.radius, tx: c.target.x, tz: c.target.z, az: c.azimuth };
          else {
            c.radius = clamp(c.pinch.radius * (c.pinch.dist / Math.max(dist, 1)), R_MIN, R_MAX);
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
      onPanResponderRelease: () => (control.current.pinch = null),
      onPanResponderTerminate: () => (control.current.pinch = null),
    });
  }, []);

  return (
    <View style={styles.fill} {...responder.panHandlers}>
      <Canvas
        shadows
        camera={{ position: [0, 9, 14], fov: 42, near: 0.1, far: 120 }}
        gl={{ antialias: true }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor('#243042', 1);
          scene.fog = new THREE.Fog('#243042', 24, 50);
        }}
      >
        <Scene cases={cases} positions={positions} control={control} projected={projected} onSelect={onSelect} />
      </Canvas>

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {cases.map((c, i) => (
          <Label key={c.id} index={i} data={c} projected={projected} onSelect={() => onSelect(c)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#243042' },
  labelWrap: { position: 'absolute', top: 0, left: 0, width: LABEL_W, alignItems: 'center' },
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
