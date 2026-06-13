/**
 * YouthHouseMesh.js
 *
 * The SINGLE shared source of truth for a house's 3D geometry, driven entirely
 * by a `youthHouseConfig` object. Used by:
 *   - the youth customizer (YouthExteriorEdit) — what the youth shapes
 *   - the worker village (VillageMap) — so the worker sees the EXACT archetype,
 *     roof, color theme and window glow the youth chose.
 *
 * Archetypes: 'village' | 'mansion' | 'futuristic'. Pure primitives + the
 * config — no external mesh files.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { COLOR_THEMES, ROOF_STYLES } from './youthTheme';

function useRoofMaterial(roofStyle) {
  return useMemo(() => {
    const p = ROOF_STYLES[roofStyle] ?? ROOF_STYLES['Terracotta Tiles'];
    return new THREE.MeshStandardMaterial({ color: p.color, roughness: p.roughness, metalness: p.metalness });
  }, [roofStyle]);
}

function Window({ position, size = [0.26, 0.26, 0.04], color, intensity }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={'#FFF8E6'} emissive={color} emissiveIntensity={intensity} roughness={0.3} />
    </mesh>
  );
}

function VillageHouse({ theme, roofMat, winColor, winI }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[1.4, 1.0, 1.4]} />
        <meshStandardMaterial color={theme.wall} roughness={0.95} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 0.36, 1.2, 0]} rotation={[0, 0, s * 0.7]} material={roofMat}>
          <boxGeometry args={[0.1, 1.05, 1.5]} />
        </mesh>
      ))}
      <mesh castShadow position={[0.45, 1.45, -0.3]}>
        <boxGeometry args={[0.22, 0.5, 0.22]} />
        <meshStandardMaterial color={'#8A8276'} roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 0.95, 0.95]} material={roofMat}>
        <boxGeometry args={[1.2, 0.08, 0.55]} />
      </mesh>
      {[-0.5, 0.5].map((x) => (
        <mesh key={x} castShadow position={[x, 0.45, 1.15]}>
          <cylinderGeometry args={[0.05, 0.05, 0.95, 10]} />
          <meshStandardMaterial color={theme.accent} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 0.32, 0.71]}>
        <boxGeometry args={[0.3, 0.56, 0.04]} />
        <meshStandardMaterial color={theme.accent} roughness={0.7} />
      </mesh>
      <Window position={[0.42, 0.62, 0.71]} color={winColor} intensity={winI} />
      <Window position={[-0.42, 0.62, 0.71]} color={winColor} intensity={winI} />
    </group>
  );
}

function ModernMansion({ theme, roofMat, winColor, winI }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[1.9, 0.8, 1.3]} />
        <meshStandardMaterial color={'#E9E7E2'} roughness={0.7} />
      </mesh>
      <mesh castShadow receiveShadow position={[-0.35, 1.15, 0.1]}>
        <boxGeometry args={[1.1, 0.7, 1.1]} />
        <meshStandardMaterial color={theme.wall} roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 0.82, 0]} material={roofMat}>
        <boxGeometry args={[1.95, 0.06, 1.35]} />
      </mesh>
      <mesh castShadow position={[-0.35, 1.52, 0.1]} material={roofMat}>
        <boxGeometry args={[1.15, 0.06, 1.15]} />
      </mesh>
      <mesh position={[0.5, 0.45, 0.66]}>
        <boxGeometry args={[0.7, 0.62, 0.03]} />
        <meshStandardMaterial color={'#Bfeaff'} emissive={winColor} emissiveIntensity={winI} transparent opacity={0.7} metalness={0.4} roughness={0.1} />
      </mesh>
      <mesh position={[-0.35, 1.15, 0.66]}>
        <boxGeometry args={[0.85, 0.5, 0.03]} />
        <meshStandardMaterial color={'#Bfeaff'} emissive={winColor} emissiveIntensity={winI} transparent opacity={0.7} metalness={0.4} roughness={0.1} />
      </mesh>
    </group>
  );
}

function FuturisticStudio({ theme, roofMat, winColor, winI }) {
  const trimMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: winColor, emissive: winColor, emissiveIntensity: Math.max(winI, 0.6) }),
    [winColor, winI]
  );
  return (
    <group>
      <mesh receiveShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[1.0, 1.15, 0.16, 40]} />
        <meshStandardMaterial color={'#2A3346'} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[0, 0.85, 0]} material={roofMat}>
        <sphereGeometry args={[0.9, 40, 32, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.92, 0.92, 0.5, 40, 1, true]} />
        <meshStandardMaterial color={theme.wall} metalness={0.9} roughness={0.15} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.32, 0]} material={trimMat}>
        <torusGeometry args={[0.93, 0.025, 12, 48]} />
      </mesh>
      <mesh position={[0, 0.8, 0]} rotation={[Math.PI / 2, 0, 0]} material={trimMat}>
        <torusGeometry args={[0.78, 0.02, 12, 48]} />
      </mesh>
      <mesh position={[0, 0.55, 0.9]}>
        <boxGeometry args={[0.5, 0.3, 0.04]} />
        <meshStandardMaterial color={'#0B1020'} emissive={winColor} emissiveIntensity={Math.max(winI, 0.5)} />
      </mesh>
    </group>
  );
}

export default function YouthHouseMesh({ config }) {
  const theme = COLOR_THEMES[config.colorTheme] ?? COLOR_THEMES['Pastel Mint'];
  const roofMat = useRoofMaterial(config.roofStyle);
  const p = { theme, roofMat, winColor: config.windowColor, winI: config.windowIntensity };
  if (config.houseStyle === 'mansion') return <ModernMansion {...p} />;
  if (config.houseStyle === 'futuristic') return <FuturisticStudio {...p} />;
  return <VillageHouse {...p} />;
}
