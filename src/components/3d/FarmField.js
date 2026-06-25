/**
 * FarmField.js — one youth's 4×4 (16-tile) tilled farm grid, beside their house.
 *
 * PURE @react-three/fiber: lives INSIDE the <Canvas>. Receives everything as
 * PLAIN PROPS computed in VillageMap's RN scope. It does NOT use React Context,
 * Firebase, useFarm, or the farmModel/plotModel reducers — Context does not cross
 * the Canvas boundary, so all meaning arrives via props (an array of 16 plain
 * `tileView` objects from farmModel.tileView()).
 *
 * Render strategy (the perf core — 16 tiles × N youths):
 *   - SOIL: ONE <instancedMesh args={[geom, mat, 16]}> per youth. Square tilled
 *     pads. Per-instance matrices are written ONCE (useLayoutEffect) from
 *     tileWorldPos; per-instance tilled tint written ONCE via setColorAt. Plant
 *     mode flips the whole field's emissive tint cheaply (no re-instancing).
 *   - CROPS: only planted tiles (tile.stage >= 0 / !empty) get a crop nub mesh.
 *     Empty tiles render NO crop mesh. Each nub carries CropPlot's idiom — a
 *     springScale scale-pop on stage change, an emissive flash on tend (boostKey),
 *     and a gentle bob when ripe — via a single cheap per-nub useFrame.
 *   - highlight ring: one ring per tile only in plant mode (the "tap me" invite).
 *
 * NO onClick: all tapping happens in the RN projected-overlay layer (TileMarker),
 * exactly like <Label>/the old PlotMarker. This keeps the raycaster / camera
 * gestures byte-identical and adds zero new tap ambiguity at 16×N.
 *
 * tileWorldPos(origin, rotationY, index) is the SINGLE source of per-tile
 * geometry — used here for the instanced matrices AND imported by VillageMap to
 * project each tile to 2D so the soil mesh and the RN overlay stay pixel-aligned.
 *
 * Crash-proof: a missing/empty tile renders bare soil; defaults cover null props.
 */

import React, { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { springScale } from './VillageMap';

const SOIL_COLOR = '#6B4A2E';
const SOIL_COLOR_ALT = '#5E4128';   // checkerboard tilled tint
const SOIL_HIGHLIGHT = '#8A6A3E';   // plant-mode soil tint (whole field)

const GRID_N = 4;                   // 4×4
const TILE = 1.0;                   // tile pitch (world units, pre-rotation)
const PAD = 0.92;                   // pad footprint within a tile cell
const SOIL_H = 0.12;                // pad thickness
const SOIL_Y = 0.06;                // pad center height

// Shared scratch objects (module-level: reused across all instance writes).
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/**
 * tileWorldPos — world-space center of tile `index` (0..15, row-major i=row*4+col)
 * for a field anchored at `origin` and rotated `rotationY` about Y. The grid is
 * centered on origin, so the 4×4 spans roughly origin ± 1.5 tiles each axis.
 *
 * SINGLE SOURCE OF TRUTH: used for the instanced soil matrices here AND for
 * VillageMap's per-tile 2D projection — keep them reading this exact function.
 *
 * @param {[number,number,number]} origin  grid anchor [x,y,z]
 * @param {number} rotationY               Y rotation (radians)
 * @param {number} index                   tile index 0..15
 * @returns {[number,number,number]} world position [x,y,z]
 */
export function tileWorldPos(origin = [0, 0, 0], rotationY = 0, index = 0) {
  const row = Math.floor(index / GRID_N);
  const col = index % GRID_N;
  // center the grid: offsets run -1.5..+1.5 (×TILE) for a 4-wide grid
  const lx = (col - (GRID_N - 1) / 2) * TILE;
  const lz = (row - (GRID_N - 1) / 2) * TILE;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  // rotate local (lx,lz) about Y, then translate by origin
  const x = origin[0] + lx * cos + lz * sin;
  const z = origin[2] - lx * sin + lz * cos;
  return [x, origin[1] + SOIL_Y, z];
}

/* ── Per-tile crop nub (planted tiles only) ─────────────────────── */

// Per-stage soil-mound / stem greens (distinct from the fruit color so the
// silhouette reads even before the fruit appears).
const SOIL_MOUND = '#6B4A2E';   // stage 0 dirt
const SPROUT_GREEN = '#9BD17A';  // stage 1 pale shoot
const LEAF_GREEN = '#6FBF73';    // stage 2-4 foliage
const STEM_GREEN = '#5AA15E';    // stage 4 stalk

// Lift the whole staged silhouette so each plant sits on the soil at the
// right height (taller plants get a higher anchor). Indexed by stage 0..4.
const STAGE_LIFT = [0.04, 0.10, 0.12, 0.16, 0.20];

/**
 * StageMesh — the geometry for ONE growth stage. Five visually distinct
 * silhouettes, all low-poly flatShaded:
 *   0 seed/mound  — squat dirt cylinder (a tilled mound, barely there)
 *   1 sprout      — a single thin upright cone (first green shoot)
 *   2 leafy       — a flattened bush (icosa scaled wide & short)
 *   3 budding     — leafy bush + a small bud in the crop color on top
 *   4 ripe        — green stalk + a prominent fruit/flower in the crop color
 *
 * `fruitRef` is attached to the ripe fruit's material so the parent useFrame
 * can drive the emissive tend-flash on it (stages 3-4 carry the crop color).
 */
function StageMesh({ stage, color, fruitRef }) {
  if (stage <= 0) {
    // 0 — seed / dirt mound: a low tapered cylinder, hardly poking up.
    return (
      <mesh castShadow position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.20, 0.24, 0.06, 8]} />
        <meshStandardMaterial color={SOIL_MOUND} flatShading roughness={1} />
      </mesh>
    );
  }
  if (stage === 1) {
    // 1 — sprout: a slim upright cone, the first green shoot.
    return (
      <mesh castShadow position={[0, 0.09, 0]}>
        <coneGeometry args={[0.05, 0.18, 5]} />
        <meshStandardMaterial
          color={SPROUT_GREEN}
          flatShading
          roughness={0.85}
          emissive={SPROUT_GREEN}
          emissiveIntensity={0.12}
        />
      </mesh>
    );
  }
  if (stage === 2) {
    // 2 — leafy: a low wide bush (icosa squashed flat).
    return (
      <mesh castShadow position={[0, 0.11, 0]} scale={[1, 0.7, 1]}>
        <icosahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial
          color={LEAF_GREEN}
          flatShading
          roughness={0.85}
          emissive={LEAF_GREEN}
          emissiveIntensity={0.1}
        />
      </mesh>
    );
  }
  if (stage === 3) {
    // 3 — budding: taller leafy bush + a small crop-color bud on top.
    return (
      <group>
        <mesh castShadow position={[0, 0.13, 0]} scale={[1, 0.85, 1]}>
          <icosahedronGeometry args={[0.17, 0]} />
          <meshStandardMaterial
            color={LEAF_GREEN}
            flatShading
            roughness={0.85}
            emissive={LEAF_GREEN}
            emissiveIntensity={0.1}
          />
        </mesh>
        <mesh castShadow position={[0, 0.30, 0]}>
          <icosahedronGeometry args={[0.07, 0]} />
          <meshStandardMaterial
            color={color}
            flatShading
            roughness={0.7}
            emissive={color}
            emissiveIntensity={0.25}
          />
        </mesh>
      </group>
    );
  }
  // 4 — ripe: a green stalk topped by a prominent fruit/flower in crop color.
  // The fruit material carries fruitRef for the tend-flash + base ripe glow.
  return (
    <group>
      <mesh castShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 0.24, 6]} />
        <meshStandardMaterial color={STEM_GREEN} flatShading roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.32, 0]}>
        <icosahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial
          ref={fruitRef}
          color={color}
          flatShading
          roughness={0.6}
          emissive={color}
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

function CropNub({ tile, rotationY }) {
  const grp = useRef();        // animated group: springScale pop + ripe bob
  const fruitMat = useRef();   // ripe fruit material: tend-flash + ripe glow
  const stage = tile.stage < 0 ? 0 : tile.stage > 4 ? 4 : tile.stage;
  const ripe = tile.ripe;
  const color = tile.color || '#7CCB6B';
  const boostKey = tile.boostKey || 0;
  const lift = STAGE_LIFT[stage] || 0.12;
  const anim = useRef({ start: null, lastStage: stage, lastBoost: boostKey, flash: null });

  // Same easing idiom as CropPlot: springScale pop on stage change or tend,
  // a 0.7s emissive flash on tend (on the fruit), and a vertical bob when ripe.
  // Now the pop/bob ride the whole staged silhouette via the group ref so a
  // fertilize that lurches a stage gives a satisfying silhouette change.
  useFrame(({ clock }) => {
    const g = grp.current;
    if (!g) return;
    const a = anim.current;
    const now = clock.elapsedTime;
    if (a.lastStage !== stage) {
      a.start = now;
      a.lastStage = stage;
    }
    if (a.lastBoost !== boostKey) {
      a.start = now;
      a.flash = now;
      a.lastBoost = boostKey;
    }
    if (a.start === null) a.start = now;
    const s = Math.max(0.0001, springScale(now - a.start));
    g.scale.setScalar(s);
    g.position.y = lift + (ripe ? Math.sin(now * 2) * 0.04 : 0);

    // Tend flash only has a material to drive at ripe (the fruit). On earlier
    // stages the flash is still felt via the springScale pop above.
    const mat = fruitMat.current;
    if (mat) {
      const base = ripe ? 0.5 : 0.12;
      let flash = 0;
      if (a.flash !== null) {
        const f = 1 - (now - a.flash) / 0.7;
        if (f > 0) flash = f;
        else a.flash = null;
      }
      mat.emissiveIntensity = base + flash * 1.4;
    }
  });

  return (
    <group ref={grp} position={[0, lift, 0]}>
      <StageMesh stage={stage} color={color} fruitRef={fruitMat} />
    </group>
  );
}

/* ── FarmField (one youth's 4×4 grid) ──────────────────────────── */

/**
 * @param {object} props
 * @param {[number,number,number]} props.origin    grid anchor (= plotPos(positions[i]))
 * @param {number} props.rotationY                 Y rotation of the whole field
 * @param {Array}  props.tiles                      length-16 farmModel.tileView objects
 *                                                  (stage/ripe/color/empty/boostKey...)
 * @param {number} props.pulseIndex                 tile index just tended, or -1
 * @param {number} props.pulseKey                   remount key for emissive flash
 * @param {boolean} props.highlight                 plant mode (soil tint + rings)
 */
export default function FarmField({
  origin = [0, 0, 0],
  rotationY = 0,
  tiles = [],
  pulseIndex = -1,
  pulseKey = 0,
  highlight = false,
}) {
  const soil = useRef();

  // Local tile centers (grid centered on the group's own origin; the group
  // itself is positioned + rotated, so instances use LOCAL coords here).
  const localPositions = useMemo(() => {
    const out = [];
    for (let i = 0; i < GRID_N * GRID_N; i++) {
      const row = Math.floor(i / GRID_N);
      const col = i % GRID_N;
      out.push([
        (col - (GRID_N - 1) / 2) * TILE,
        SOIL_Y,
        (row - (GRID_N - 1) / 2) * TILE,
      ]);
    }
    return out;
  }, []);

  // Write the 16 instance matrices + checkerboard tint ONCE (geometry is static).
  useLayoutEffect(() => {
    const inst = soil.current;
    if (!inst) return;
    for (let i = 0; i < localPositions.length; i++) {
      const [x, y, z] = localPositions[i];
      _m.makeTranslation(x, y, z);
      inst.setMatrixAt(i, _m);
      const row = Math.floor(i / GRID_N);
      const col = i % GRID_N;
      _c.set((row + col) % 2 === 0 ? SOIL_COLOR : SOIL_COLOR_ALT);
      inst.setColorAt(i, _c);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }, [localPositions]);

  return (
    <group position={origin} rotation={[0, rotationY, 0]}>
      {/* SOIL — one instanced mesh of 16 square tilled pads */}
      <instancedMesh
        ref={soil}
        args={[undefined, undefined, GRID_N * GRID_N]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[PAD, SOIL_H, PAD]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={1}
          flatShading
          emissive={highlight ? SOIL_HIGHLIGHT : '#000000'}
          emissiveIntensity={highlight ? 0.35 : 0}
        />
      </instancedMesh>

      {/* CROPS + rings — per tile */}
      {tiles.map((tile, i) => {
        if (!tile) return null;
        const [x, , z] = localPositions[i] || [0, 0, 0];
        const planted = !tile.empty && tile.stage >= 0;
        // fold the field-level pulse into this tile's boostKey so the matching
        // tile flashes on tend even if the tileView boostKey didn't change.
        const boostKey = (tile.boostKey || 0) + (pulseIndex === i ? pulseKey : 0);
        return (
          <group key={i} position={[x, 0, z]}>
            {planted && <CropNub tile={{ ...tile, boostKey }} rotationY={rotationY} />}
            {highlight && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.13, 0]}>
                <ringGeometry args={[0.38, 0.46, 20]} />
                <meshBasicMaterial color="#FFD66B" transparent opacity={0.75} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
