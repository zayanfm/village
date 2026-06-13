/**
 * OrbCompanion.js
 *
 * The AI companion — a sleek, glowing, floating celestial orb. This is the ONE
 * canonical AI mesh, used both as the room's interaction zone and on the
 * companion screen. It has NO relationship to any seat/chair/sofa mesh.
 *
 * Construction (procedural, three.js): a pulsing emissive core, a glossy
 * translucent shell, an animated emissive faceplate (two blinking eyes), an
 * orbiting neon ring, and two orbiting satellites. Animated entirely off the
 * three.js clock via useFrame:
 *   - organic vertical hover
 *   - slow self-rotation
 *   - emissive pulse on the core + faceplate
 *   - ring spin + satellite orbit
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { pastel } from './youthTheme';

export default function OrbCompanion({ position = [0, 0, 0], scale = 1, faceColor = pastel.neon, onPress }) {
  const rig = useRef();
  const coreMat = useRef();
  const faceMat = useRef();
  const leftEye = useRef();
  const rightEye = useRef();
  const ring = useRef();
  const sat1 = useRef();
  const sat2 = useRef();
  const baseY = position[1];

  const shellMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#DFFcff',
        transparent: true,
        opacity: 0.32,
        metalness: 0.7,
        roughness: 0.12,
      }),
    []
  );

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (rig.current) {
      rig.current.position.y = baseY + Math.sin(t * 1.2) * 0.14; // organic hover
      rig.current.rotation.y += delta * 0.3;
    }
    if (coreMat.current) coreMat.current.emissiveIntensity = 1.0 + Math.sin(t * 2.6) * 0.5;
    if (faceMat.current) faceMat.current.emissiveIntensity = 0.9 + Math.sin(t * 2.6 + 1) * 0.4;
    // gentle blink
    const blink = Math.max(0.2, Math.abs(Math.sin(t * 1.1)));
    if (leftEye.current) leftEye.current.scale.y = blink;
    if (rightEye.current) rightEye.current.scale.y = blink;
    if (ring.current) {
      ring.current.rotation.z += delta * 0.8;
      ring.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.5) * 0.25;
    }
    if (sat1.current) sat1.current.position.set(Math.cos(t * 1.5) * 0.95, Math.sin(t * 1.5) * 0.25, Math.sin(t * 1.5) * 0.95);
    if (sat2.current) sat2.current.position.set(Math.cos(t * 1.5 + Math.PI) * 0.95, Math.sin(t * 1.5 + Math.PI) * 0.25, Math.sin(t * 1.5 + Math.PI) * 0.95);
  });

  return (
    <group ref={rig} position={position} scale={scale} onClick={onPress}>
      {/* glowing core */}
      <mesh>
        <sphereGeometry args={[0.42, 40, 40]} />
        <meshStandardMaterial ref={coreMat} color={faceColor} emissive={faceColor} emissiveIntensity={1.2} roughness={0.3} />
      </mesh>
      {/* glossy translucent shell */}
      <mesh castShadow>
        <sphereGeometry args={[0.6, 40, 40]} />
        <primitive object={shellMat} attach="material" />
      </mesh>
      {/* faceplate */}
      <group position={[0, 0.04, 0.5]}>
        <mesh>
          <boxGeometry args={[0.5, 0.28, 0.04]} />
          <meshStandardMaterial color={'#0B1020'} roughness={0.25} metalness={0.5} />
        </mesh>
        <mesh ref={leftEye} position={[-0.11, 0, 0.03]}>
          <boxGeometry args={[0.07, 0.14, 0.02]} />
          <meshStandardMaterial ref={faceMat} color={faceColor} emissive={faceColor} emissiveIntensity={1.0} />
        </mesh>
        <mesh ref={rightEye} position={[0.11, 0, 0.03]}>
          <boxGeometry args={[0.07, 0.14, 0.02]} />
          <meshStandardMaterial color={faceColor} emissive={faceColor} emissiveIntensity={1.0} />
        </mesh>
      </group>
      {/* orbiting neon ring */}
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.78, 0.022, 12, 48]} />
        <meshStandardMaterial color={faceColor} emissive={faceColor} emissiveIntensity={1.1} />
      </mesh>
      {/* orbiting satellites */}
      <mesh ref={sat1}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial color={'#FFFFFF'} emissive={faceColor} emissiveIntensity={0.8} />
      </mesh>
      <mesh ref={sat2}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color={'#FFFFFF'} emissive={faceColor} emissiveIntensity={0.8} />
      </mesh>
      {/* casts its own soft light */}
      <pointLight position={[0, 0, 0.6]} intensity={6} distance={4} decay={2} color={faceColor} />
    </group>
  );
}
