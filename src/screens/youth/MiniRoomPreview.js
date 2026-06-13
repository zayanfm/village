/**
 * MiniRoomPreview.js
 *
 * A compact, READ-ONLY mirror of a youth's isometric Bondee room, embedded in
 * the worker's YouthCaseDetail so they get an instant contextual glimpse of the
 * youth's customized space: the corkboard, the floating OrbCompanion bot, and
 * the explicit "Community Pinboard" / "AI Companion" labels.
 *
 * Fixed iso camera (no interaction). The <Canvas> is focus-gated to avoid GL
 * lifecycle warnings when the worker pushes deeper screens.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Canvas } from '@react-three/fiber';
import OrbCompanion from './OrbCompanion';
import { COLOR_THEMES, defaultYouthHouseConfig, pastel, youthRadius as rad } from './youthTheme';

function MiniRoom({ accent }) {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color={pastel.clay} roughness={0.95} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0.4]}>
        <circleGeometry args={[1.6, 36]} />
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
      {/* corkboard */}
      <group position={[1.4, 1.7, -2.88]}>
        <mesh>
          <boxGeometry args={[1.5, 1.1, 0.08]} />
          <meshStandardMaterial color={pastel.cork} roughness={1} />
        </mesh>
        {[[-0.4, 0.2], [0.35, -0.1], [0.1, 0.3]].map((p, i) => (
          <mesh key={i} position={[p[0], p[1], 0.06]} rotation={[0, 0, (i - 1) * 0.12]}>
            <boxGeometry args={[0.42, 0.42, 0.02]} />
            <meshStandardMaterial color={pastel.white} roughness={0.8} />
          </mesh>
        ))}
      </group>
      {/* pouf under the orb */}
      <mesh receiveShadow position={[-1.4, 0.18, -1.4]}>
        <cylinderGeometry args={[0.5, 0.55, 0.34, 24]} />
        <meshStandardMaterial color={pastel.blush} roughness={1} />
      </mesh>
      {/* AI companion orb */}
      <OrbCompanion position={[-1.4, 0.95, -1.4]} scale={0.7} />
      {/* plant */}
      <group position={[2.0, 0, 1.4]}>
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.22, 0.28, 0.5, 16]} />
          <meshStandardMaterial color={pastel.amber} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.7, 0]}>
          <sphereGeometry args={[0.4, 18, 18]} />
          <meshStandardMaterial color={pastel.mintDeep} roughness={1} />
        </mesh>
      </group>
    </group>
  );
}

export default function MiniRoomPreview({ youthHouseConfig = defaultYouthHouseConfig, height = 230 }) {
  const isFocused = useIsFocused();
  const accent = (COLOR_THEMES[youthHouseConfig.colorTheme] ?? COLOR_THEMES['Pastel Mint']).accent;

  return (
    <View style={[styles.wrap, { height }]}>
      {isFocused && (
        <Canvas shadows orthographic camera={{ position: [7, 7, 7], zoom: 46, near: -50, far: 100 }} onCreated={({ gl }) => gl.setClearColor('#2A2436', 1)}>
          <ambientLight intensity={0.6} />
          <pointLight position={[0, 4, 1]} intensity={26} distance={14} decay={2} color={'#FFE6C0'} castShadow />
          <hemisphereLight args={['#fff3e2', '#ccaa99', 0.4]} />
          <MiniRoom accent={accent} />
        </Canvas>
      )}

      {/* explicit, read-only labels (fixed iso camera, so static placement) */}
      <View style={[styles.tag, styles.tagPin]} pointerEvents="none">
        <Text style={styles.tagText}>Community Pinboard</Text>
      </View>
      <View style={[styles.tag, styles.tagAI]} pointerEvents="none">
        <Text style={styles.tagText}>AI Companion</Text>
      </View>

      <View style={styles.readOnly} pointerEvents="none">
        <Text style={styles.readOnlyText}>READ-ONLY MIRROR</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: rad.lg,
    overflow: 'hidden',
    backgroundColor: '#2A2436',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  tag: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: rad.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  tagPin: { top: '24%', right: '12%' },
  tagAI: { bottom: '20%', left: '10%' },
  tagText: { color: pastel.ink, fontWeight: '900', fontSize: 11 },
  readOnly: {
    position: 'absolute',
    top: 10,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: rad.sm,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  readOnlyText: { color: 'rgba(255,255,255,0.85)', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 },
});
