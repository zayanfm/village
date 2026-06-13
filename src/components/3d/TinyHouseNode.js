/**
 * TinyHouseNode.js
 *
 * One youth case rendered as a fully procedural 3D tiny house. No external
 * meshes — every part is a primitive shaped/scaled/colored from a resolved
 * `config` object (see houseSchema.js), so future youth-side profile edits pipe
 * straight into the look.
 *
 * Micro-animations (in-engine, JS-thread frame loop):
 *   - spawn: springs up into place on load (staggered by `index`)
 *   - window: emissive pulses around config.windowIntensity when hasUpdate
 *   - select: brief lift while selected
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { geometryFor } from './houseSchema';

// Spring pop used for the spawn (0..~1 with a little overshoot). JS-thread only.
function springValue(t) {
  if (t <= 0) return 0;
  return 1 - Math.exp(-7 * t) * Math.cos(9 * t);
}

export default function TinyHouseNode({
  config,
  position = [0, 0, 0],
  rotationY = 0,
  index = 0,
  selected = false,
  onSelect,
}) {
  const group = useRef();
  const windowMat = useRef();
  const spawn = useRef({ start: null });

  const g = geometryFor(config.houseType);
  const wallH = g.h * config.heightScale;
  const delay = index * 0.09;
  const frontZ = g.d / 2 + 0.001;

  const roofMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: config.roofColor, roughness: 0.7, metalness: 0.05 }),
    [config.roofColor]
  );

  useFrame(({ clock }) => {
    if (!group.current) return;
    if (spawn.current.start === null) spawn.current.start = clock.elapsedTime;

    const t = clock.elapsedTime - spawn.current.start - delay;
    const base = Math.min(springValue(t), 1.0);
    group.current.scale.setScalar(Math.max(0.0001, base * (selected ? 1.08 : 1.0)));

    const targetY = position[1] + (selected ? 0.18 : 0);
    group.current.position.y += (targetY - group.current.position.y) * 0.18;

    if (windowMat.current) {
      const baseI = config.windowIntensity;
      const pulse = config.hasUpdate ? baseI + 0.6 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 3)) : baseI;
      windowMat.current.emissiveIntensity = selected ? Math.max(pulse, 0.5) : pulse;
    }
  });

  const handleSelect = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    onSelect && onSelect();
  };

  return (
    <group ref={group} position={position} rotation={[0, rotationY, 0]} onClick={handleSelect}>
      {/* walls */}
      <mesh castShadow receiveShadow position={[0, wallH / 2, 0]}>
        <boxGeometry args={[g.w, wallH, g.d]} />
        <meshStandardMaterial color={config.wallColor} roughness={0.85} />
      </mesh>

      {/* pyramid roof (recolorable) */}
      <mesh
        castShadow
        position={[0, wallH + g.roofH / 2, 0]}
        rotation={[0, Math.PI / 4, 0]}
        material={roofMaterial}
      >
        <coneGeometry args={[g.w * 0.82, g.roofH, g.roofSeg]} />
      </mesh>

      {/* door */}
      <mesh position={[0, 0.2, frontZ]}>
        <boxGeometry args={[0.22, 0.4, 0.02]} />
        <meshStandardMaterial color={config.trimColor} roughness={0.6} />
      </mesh>

      {/* window (glows on update) */}
      <mesh position={[g.w * 0.28, wallH * 0.62, frontZ]}>
        <boxGeometry args={[0.22, 0.22, 0.02]} />
        <meshStandardMaterial
          ref={windowMat}
          color="#FFF6D8"
          emissive={config.windowEmission}
          emissiveIntensity={config.windowIntensity}
          roughness={0.4}
        />
      </mesh>

      {/* cabins get a chimney */}
      {g.chimney && (
        <mesh castShadow position={[g.w * 0.3, wallH + g.roofH * 0.7, -g.d * 0.2]}>
          <boxGeometry args={[0.14, 0.34, 0.14]} />
          <meshStandardMaterial color="#6B5544" roughness={0.9} />
        </mesh>
      )}
    </group>
  );
}
