/**
 * SpriteFlipbook.js — DELIVERABLE 1: the Higgsfield motion-asset loader pattern.
 *
 * Plays a Higgsfield-generated motion loop on a 3D plane by treating a single
 * sprite-sheet PNG atlas as a flipbook: one GPU texture, UV `offset` stepped per
 * frame to reveal one cell. One draw call, no video decoder — the RN/`expo-gl`
 * safe equivalent of `THREE.VideoTexture` (which needs the DOM and cannot run
 * here). See src/assets/journal/README.md "Why sprite sheets".
 *
 * GRACEFUL DEGRADATION
 * --------------------
 * Until real assets exist (`asset.source === null`) OR the loader deps aren't
 * installed (`LIVE === false`), `useFlipbookTexture` returns null and the
 * component renders its `fallback` node instead. That's why the bookshelf runs
 * today with zero assets and zero new dependencies.
 *
 * GOING LIVE (one block, all at the top):
 *   1. `npx expo install expo-asset expo-three`
 *   2. uncomment the two imports below
 *   3. set `LIVE = true`
 *   4. set the asset's `source: require('./<sheet>.png')` in journalAssets.js
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── GO-LIVE IMPORTS (commented so Metro bundles cleanly without the deps) ──
// import { Asset } from 'expo-asset';
// import { loadAsync } from 'expo-three';

const LIVE = false; // ← flip to true once the imports above are uncommented

/**
 * Resolve a Higgsfield sprite-sheet atlas into a configured THREE.Texture, or
 * null when stubbed / not yet wired. Configures the texture so a single cell
 * fills the plane and wrapping doesn't bleed neighbouring frames.
 *
 * @param {{ source:any, columns:number, rows:number }} asset entry from JOURNAL_MOTION
 * @returns {THREE.Texture|null}
 */
export function useFlipbookTexture(asset) {
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    if (!LIVE || !asset || !asset.source) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // --- live path (expo-asset + expo-three handle the expo-gl upload) ---
        // const resolved = Asset.fromModule(asset.source);
        // await resolved.downloadAsync();
        // const tex = await loadAsync(resolved.localUri || resolved.uri);
        const tex = null; // placeholder until the two lines above are live
        if (cancelled || !tex) return;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.magFilter = THREE.NearestFilter; // crisp cell edges, no inter-frame blend
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.repeat.set(1 / asset.columns, 1 / asset.rows);
        tex.flipY = true;
        setTexture(tex);
      } catch (e) {
        if (__DEV__) console.warn('[SpriteFlipbook] failed to load atlas:', e);
        setTexture(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset]);

  // Dispose GPU memory when the texture is replaced/unmounted.
  useEffect(() => () => texture && texture.dispose(), [texture]);

  return texture;
}

/** Map a flat frame index -> UV offset for a (columns x rows) atlas (row 0 = top). */
function frameOffset(index, columns, rows) {
  const col = index % columns;
  const row = Math.floor(index / columns);
  return [col / columns, 1 - (row + 1) / rows];
}

/**
 * <SpriteFlipbook> — renders one frame of a Higgsfield motion loop on a plane.
 *
 * Two timing modes:
 *   mode="loop"     free-running ambient effect, advanced by the clock at `fps`
 *   mode="progress" one-shot, frame = floor(progress * frameCount); the
 *                   BookAnimationController drives `progress` 0->1 so the smoke /
 *                   lock sequence stays in lockstep with the camera + opacity.
 *
 * Props:
 *   asset       entry from JOURNAL_MOTION (source/columns/rows/frameCount/fps)
 *   getProgress ()=>number, read live each frame (mode="progress"). Prefer this
 *               over `progress` in r3f: useFrame mutations don't re-render, so a
 *               plain `progress` prop would freeze at mount.
 *   progress    static 0..1 fallback if getProgress is omitted (mode="progress")
 *   play        gate playback (default true)
 *   billboard   face the active camera each frame (good for smoke/particles)
 *   fallback    node rendered when no texture is available (procedural effect)
 *   ...group    position / scale / rotation forwarded to the wrapper group
 */
export default function SpriteFlipbook({
  asset,
  mode = 'loop',
  getProgress = null,
  progress = 0,
  play = true,
  size = [1, 1],
  billboard = false,
  fallback = null,
  ...group
}) {
  const texture = useFlipbookTexture(asset);
  const matRef = useRef();
  const meshRef = useRef();
  const frameCount = asset?.frameCount ?? 1;
  const fps = asset?.fps ?? 24;

  // Reusable material so we can mutate map.offset without re-creating it.
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, // glow/embers read better additively
      }),
    []
  );

  useEffect(() => {
    material.map = texture || null;
    material.needsUpdate = true;
  }, [texture, material]);

  useFrame(({ clock, camera }) => {
    if (texture && asset) {
      let frame;
      if (mode === 'progress') {
        const p = getProgress ? getProgress() : progress;
        frame = Math.min(frameCount - 1, Math.max(0, Math.floor(p * frameCount)));
      } else {
        frame = play ? Math.floor(clock.elapsedTime * fps) % frameCount : 0;
      }
      const [ox, oy] = frameOffset(frame, asset.columns, asset.rows);
      texture.offset.set(ox, oy);
    }
    if (billboard && meshRef.current) meshRef.current.quaternion.copy(camera.quaternion);
  });

  // No texture (stub / not live) -> hand off to the procedural fallback.
  if (!texture) return fallback;

  return (
    <group {...group}>
      <mesh ref={meshRef}>
        <planeGeometry args={size} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  );
}
