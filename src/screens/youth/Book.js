/**
 * Book.js — DELIVERABLE 4: the interactive journal mesh.
 *
 * A single procedural book that:
 *   - renders a "permanent" (leather) or "temporary" (holographic) variant,
 *   - raycasts via r3f `onClick` and asks the controller to focus it,
 *   - reads `controller.renderStateFor(id)` every frame to drive its opacity and
 *     to play the right Higgsfield motion loop (lock / vanish) through
 *     <SpriteFlipbook>, falling back to a procedural effect when no asset exists.
 *
 * r3f NOTE: this component never re-renders during an animation. Every per-frame
 * value (opacity, seal/vanish progress) is pulled LIVE from the controller inside
 * a useFrame, never passed as a React prop — props would freeze at mount.
 *
 * STUB SEAM (textures): the cover uses the procedural `fallback` color from
 * JOURNAL_TEXTURES. When you wire real Higgsfield cover art, load it with the
 * same loader as SpriteFlipbook and attach it as `map`/`emissiveMap` where the
 * "LIVE map" comment is below.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import SpriteFlipbook from '../../components/3d/SpriteFlipbook';
import { JOURNAL_TEXTURES, JOURNAL_MOTION } from '../../assets/journal/journalAssets';
import { pastel } from './youthTheme';

const BOOK_SIZE = [0.2, 1.0, 0.7]; // thickness(x) x height(y) x depth(z); spine faces +Z

/* --------------------------- procedural fallbacks --------------------------- */
// Run when the matching Higgsfield sprite sheet is still a stub, so the
// interaction is fully legible with zero assets. They read progress live via
// `getProgress()` and self-hide when it is 0.

// Temporary "vanish": embers rising and fading as vanishProgress 0 -> 1.
function SmokePuffsFallback({ getProgress }) {
  const grp = useRef();
  const puffs = useMemo(
    () =>
      Array.from({ length: 7 }).map(() => ({
        x: (Math.random() - 0.5) * 0.5,
        z: (Math.random() - 0.5) * 0.5,
        phase: Math.random(),
        s: 0.06 + Math.random() * 0.06,
      })),
    []
  );
  useFrame(() => {
    if (!grp.current) return;
    const progress = getProgress();
    grp.current.visible = progress > 0;
    if (progress <= 0) return;
    grp.current.children.forEach((m, i) => {
      const p = puffs[i];
      const local = Math.min(1, Math.max(0, progress * 1.4 - p.phase * 0.4));
      m.position.set(p.x, local * 1.3, p.z);
      m.scale.setScalar(Math.max(0.0001, (0.3 + local) * p.s * (1 + local * 2)));
      if (m.material) m.material.opacity = Math.sin(local * Math.PI) * 0.9;
    });
  });
  return (
    <group ref={grp} visible={false}>
      {puffs.map((_, i) => (
        <mesh key={i}>
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color={pastel.neon} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// Permanent "lock": a brass clasp swings shut + a wax seal glows as sealProgress 0 -> 1.
function ClaspSealFallback({ getProgress }) {
  const grp = useRef();
  const clasp = useRef();
  const wax = useRef();
  useFrame(() => {
    const progress = getProgress();
    if (grp.current) grp.current.visible = progress > 0;
    if (progress <= 0) return;
    if (clasp.current) clasp.current.rotation.x = (1 - progress) * 1.1; // swings down to closed
    if (wax.current && wax.current.material) {
      wax.current.material.emissiveIntensity = progress * 1.6;
      wax.current.scale.setScalar(0.0001 + progress);
    }
  });
  return (
    <group ref={grp} visible={false} position={[0, 0, BOOK_SIZE[2] / 2 + 0.02]}>
      {/* clasp arm hinged at the top edge of the spine */}
      <group ref={clasp} position={[0, 0.42, 0]}>
        <mesh position={[0, -0.18, 0]}>
          <boxGeometry args={[0.1, 0.36, 0.05]} />
          <meshStandardMaterial color={'#C9A24B'} metalness={0.9} roughness={0.25} />
        </mesh>
      </group>
      {/* wax seal */}
      <mesh ref={wax} position={[0, -0.1, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.04, 20]} />
        <meshStandardMaterial color={pastel.amberDeep} emissive={pastel.glow} emissiveIntensity={0} />
      </mesh>
    </group>
  );
}

/* --------------------------------- Book ------------------------------------ */

export default function Book({ id, variant, position, rotationY = 0, controller, onSelect }) {
  const isTemporary = variant === 'temporary';
  const tex = isTemporary ? JOURNAL_TEXTURES.holographic : JOURNAL_TEXTURES.leather;

  // Procedural stub material. LIVE map: attach the loaded Higgsfield cover here.
  const coverMat = useMemo(() => {
    const f = tex.fallback;
    return new THREE.MeshStandardMaterial({
      color: f.color,
      roughness: f.roughness ?? 0.5,
      metalness: f.metalness ?? 0,
      emissive: f.emissive ?? '#000000',
      emissiveIntensity: f.emissiveIntensity ?? 0,
      transparent: true, // needed so the temporary book can dissolve
      opacity: 1,
      // map: liveCoverTexture,          // <- LIVE map (still PNG via expo-three)
      // emissiveMap: liveEmissiveTexture,
    });
  }, [tex]);

  // Live closures the motion children read each frame (no React re-render).
  const getVanish = () => controller.renderStateFor(id).vanishProgress;
  const getSeal = () => controller.renderStateFor(id).sealProgress;

  // Drive cover opacity / holographic breathing straight off the controller.
  useFrame(({ clock }) => {
    const rs = controller.renderStateFor(id);
    coverMat.opacity = rs.opacity;
    if (isTemporary) {
      coverMat.emissiveIntensity =
        (tex.fallback.emissiveIntensity ?? 0.9) * (0.75 + Math.sin(clock.elapsedTime * 2) * 0.25);
    }
  });

  const handleClick = (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    onSelect(id);
  };

  return (
    <group position={position} rotation={[0, rotationY, 0]} onClick={handleClick}>
      {/* pages (cream block, slightly inset) */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[BOOK_SIZE[0] * 0.7, BOOK_SIZE[1] * 0.94, BOOK_SIZE[2] * 0.96]} />
        <meshStandardMaterial color={pastel.cream} roughness={0.9} />
      </mesh>

      {/* cover */}
      <mesh castShadow>
        <boxGeometry args={BOOK_SIZE} />
        <primitive object={coverMat} attach="material" />
      </mesh>

      {/* spine title band (emissive accent on the +Z face) */}
      <mesh position={[0, 0.1, BOOK_SIZE[2] / 2 + 0.005]}>
        <planeGeometry args={[BOOK_SIZE[0] * 0.6, 0.16]} />
        <meshStandardMaterial
          color={isTemporary ? pastel.neon : pastel.glow}
          emissive={isTemporary ? pastel.neon : pastel.glow}
          emissiveIntensity={0.7}
        />
      </mesh>

      {/* ---- motion: Higgsfield sprite sheet, else procedural fallback ---- */}
      {isTemporary ? (
        <SpriteFlipbook
          asset={JOURNAL_MOTION.vanish}
          mode="progress"
          getProgress={getVanish}
          billboard
          size={[1.4, 1.6]}
          position={[0, 0.2, BOOK_SIZE[2] / 2 + 0.05]}
          fallback={<SmokePuffsFallback getProgress={getVanish} />}
        />
      ) : (
        <SpriteFlipbook
          asset={JOURNAL_MOTION.lock}
          mode="progress"
          getProgress={getSeal}
          billboard
          size={[1.0, 1.0]}
          position={[0, 0, BOOK_SIZE[2] / 2 + 0.06]}
          fallback={<ClaspSealFallback getProgress={getSeal} />}
        />
      )}
    </group>
  );
}
