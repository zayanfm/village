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
import { MotiView } from 'moti';
import * as THREE from 'three';
import YouthHouseMesh from '../../screens/youth/YouthHouseMesh';
import FarmField, { tileWorldPos } from './FarmField';
import AnimalPen, { animalWorldPos } from './AnimalPen';
import { TILE_COUNT, tileView, animalView, DECOR } from '../../game/farmModel';
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
    const x = (col - (cols - 1) / 2) * 4.8;
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

/* --------------------------- bought decorations ---------------------------- */

// Cosmetic decor the shop sells; owned ids live in farm.decor[]. Static low-poly
// meshes placed just BEYOND the field origin (toward the path), plain props only,
// zero per-frame cost. Each known id maps to one cheap mesh cluster.
//   flowerPatch → 3 small colored blossoms on green stalks
//   extraTree   → reuse the village low-poly <Tree> at an offset
function Decor({ decor = [], origin = [0, 0, 0], rotationY = 0 }) {
  if (!decor || decor.length === 0) return null;
  // Place decor in front of the field origin, fanned along local x so two items
  // don't overlap. local→world via the field's own rotation.
  const place = (lx, lz) => {
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    return [origin[0] + lx * cos + lz * sin, origin[1], origin[2] - lx * sin + lz * cos];
  };
  return (
    <group>
      {decor.map((id, k) => {
        const slotX = -0.9 + k * 0.9; // fan successive items along the field edge
        const p = place(slotX, -1.15); // tuck toward the path, in front of tile 0
        if (id === 'extraTree') {
          return <Tree key={id} position={p} tint="#7FC97E" delay={k * 0.7} />;
        }
        if (id === 'flowerPatch') {
          const blooms = ['#F25F8A', '#FFD45E', '#B98CFF'];
          return (
            <group key={id} position={p} rotation={[0, rotationY, 0]}>
              {blooms.map((col, j) => {
                const bx = (j - 1) * 0.18;
                const bz = (j % 2) * 0.12 - 0.06;
                return (
                  <group key={j} position={[bx, 0, bz]}>
                    <mesh castShadow position={[0, 0.12, 0]}>
                      <cylinderGeometry args={[0.015, 0.02, 0.24, 5]} />
                      <meshStandardMaterial color="#5FA34A" roughness={1} />
                    </mesh>
                    <mesh castShadow position={[0, 0.26, 0]}>
                      <icosahedronGeometry args={[0.07, 0]} />
                      <meshStandardMaterial color={col} roughness={0.8} flatShading emissive={col} emissiveIntensity={0.18} />
                    </mesh>
                  </group>
                );
              })}
            </group>
          );
        }
        return null;
      })}
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

export function springScale(t) {
  if (t <= 0) return 0;
  return Math.min(1 - Math.exp(-7 * t) * Math.cos(9 * t), 1);
}

/* --------------------------- farm-field placement -------------------------- */

// A 4×4 farm field beside each house. `plotPos` is the grid ORIGIN (anchor of
// tile 0); FarmField + tileWorldPos lay the 16 tiles out from here. Offset from
// the house so the field never overlaps the mesh; mirrored on the z side that
// faces the path so it tucks between house and path.
const TILE_LABEL_W = 60;
const TILE_LABEL_H = 38;

function plotPos(p) {
  return { x: p.x + 1.9, y: 0, z: p.z + (p.rotationY ? -1.3 : 1.3) };
}

// The animal pen sits just BEYOND the far edge of the 4×4 field (the field runs
// outward on +x from its origin), on the same z side that faces the path so the
// pen tucks between the field and the village edge. animalWorldPos lays the 3
// pens out from this anchor — the SAME geometry source the projection uses.
const PEN_ORIGIN_DX = 3.7;
function penPos(p) {
  return { x: p.x + PEN_ORIGIN_DX, y: 0, z: p.z + (p.rotationY ? -1.3 : 1.3) };
}

function HouseNode({ config, position, rotationY, index, onSelect, plantMode }) {
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
  // In plant mode the house is inert — only plots are interactive.
  return (
    <group ref={grp} position={position} rotation={[0, rotationY, 0]} onClick={plantMode ? undefined : handle}>
      <YouthHouseMesh config={config} />
    </group>
  );
}

/* --------------------------- camera + labels ------------------------------- */

function CameraAndLabels({ control, positions, fields, projected }) {
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
    const houses = [];
    // tiles: one length-16 array of screen points per case (16×N projections).
    // Cheap float math; the heavy RN nodes are culled by `visible` downstream.
    const tiles = [];
    // pens: one variable-length array of screen points per case (d.animalCount,
    // 3..6), projected from the SAME count-aware animalWorldPos geometry the 3D
    // AnimalPen uses, so the markers track a bought animal in lockstep.
    const pens = [];
    for (let i = 0; i < positions.length; i++) {
      tmp.set(positions[i].x, 1.6, positions[i].z).project(camera);
      houses.push({ x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, visible: tmp.z < 1 });

      const f = fields[i];
      const row = [];
      for (let t = 0; t < TILE_COUNT; t++) {
        const wp = tileWorldPos(f.origin, f.rotationY, t);
        tmp.set(wp[0], wp[1] + 0.35, wp[2]).project(camera);
        row.push({ x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, visible: tmp.z < 1 });
      }
      tiles.push(row);

      const penRow = [];
      // DYNAMIC pen size — project exactly d.animalCount slots, laid out by the
      // SAME animalWorldPos the 3D pen uses (now count-aware for the 2-row layout).
      const pn = f.animalCount || 0;
      for (let a = 0; a < pn; a++) {
        const wp = animalWorldPos(f.penOrigin, f.rotationY, a, pn);
        tmp.set(wp[0], wp[1] + 0.55, wp[2]).project(camera);
        penRow.push({ x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, visible: tmp.z < 1 });
      }
      pens.push(penRow);
    }
    projected.value = { houses, tiles, pens };
  });

  return null;
}

function Scene({ cases, positions, control, projected, onSelect, fieldData, plantMode }) {
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
          plantMode={plantMode}
        />
      ))}

      {cases.map((c, i) => {
        const d = fieldData[i];
        return (
          <FarmField
            key={c.id + ':field'}
            origin={d.origin}
            rotationY={d.rotationY}
            tiles={d.tiles}
            pulseIndex={d.pulseIndex}
            pulseKey={d.pulseKey}
            highlight={plantMode}
          />
        );
      })}

      {/* Bought cosmetic decorations beside each field (static, no per-frame cost) */}
      {cases.map((c, i) => {
        const d = fieldData[i];
        return (
          <Decor
            key={c.id + ':decor'}
            decor={d.decor}
            origin={d.origin}
            rotationY={d.rotationY}
          />
        );
      })}

      {cases.map((c, i) => {
        const d = fieldData[i];
        return (
          <AnimalPen
            key={c.id + ':pen'}
            origin={d.penOrigin}
            rotationY={d.rotationY}
            animals={d.animals}
            count={d.animalCount}
            pulseIndex={d.animalPulseIndex}
            pulseKey={d.animalPulseKey}
          />
        );
      })}

      <CameraAndLabels
        control={control}
        positions={positions}
        fields={fieldData}
        projected={projected}
      />
    </>
  );
}

function Label({ index, data, projected, onSelect, plantMode }) {
  const style = useAnimatedStyle(() => {
    const v = projected.value;
    const arr = v && v.houses;
    const p = arr && arr[index];
    // House labels stay tappable only out of plant mode (houses are inert in it).
    if (!p || !p.visible || plantMode) return { opacity: 0, transform: [{ translateX: -9999 }, { translateY: -9999 }] };
    return { opacity: 1, transform: [{ translateX: p.x - LABEL_W / 2 }, { translateY: p.y - LABEL_H - 8 }] };
  });
  return (
    <Animated.View style={[styles.labelWrap, style]} pointerEvents={plantMode ? 'none' : 'box-none'}>
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

/* --------------------------- tile markers (RN overlay) --------------------- */

// Per-action glow palette for the tend pop. fertilize is the loud gold one.
const PULSE_GLOW = {
  fertilize: { ring: '#FFD66B', bg: 'rgba(120,90,20,0.6)', text: '#FFE9A8' },
  water:     { ring: '#7FD4FF', bg: 'rgba(20,70,100,0.55)', text: '#CBEBFF' },
  harvest:   { ring: '#9CFFB0', bg: 'rgba(20,90,45,0.55)', text: '#CFFFD9' },
  plant:     { ring: '#9CFFB0', bg: 'rgba(20,80,45,0.5)', text: '#DFFFE6' },
  feed:      { ring: '#FFD2A6', bg: 'rgba(110,70,30,0.55)', text: '#FFE6C9' },
  collect:   { ring: '#FFE48A', bg: 'rgba(110,90,20,0.55)', text: '#FFF1B8' },
  // never-dead "still growing" tap feedback (soft green, no commit happened)
  growing:   { ring: '#9CD9A0', bg: 'rgba(30,70,40,0.5)', text: '#D6FFDD' },
  // earn coin pop (gold) + seed-spend pop (warm red)
  coin:      { ring: '#FFD66B', bg: 'rgba(120,90,20,0.45)', text: '#FFF1C2' },
  spend:     { ring: '#FF9C8A', bg: 'rgba(120,40,30,0.45)', text: '#FFE0D8' },
};

// One projected chip per TILE. Mirrors <Label>'s projection mechanism (proven to
// coexist with the PanResponder). Interactive ONLY in plant mode; otherwise a
// dimmed, non-interactive growth/timer indicator so house-tapping is untouched.
//
// Display ladder per tile:
//   ripe     → crop emoji + green glow ("ready")
//   growing  → m:ss countdown chip (only while not ripe)
//   empty    → a faint "+" (plant-mode invite); rendered non-interactive off plant mode
//
// `tile` is a farmModel.tileView. `screen` is this tile's projected point
// (projected.value.tiles[caseIndex][tileIndex]).
function TileMarker({ caseIndex, tileIndex, tile, projected, plantMode, onTap, pulse, caseId }) {
  const style = useAnimatedStyle(() => {
    const v = projected.value;
    const grid = v && v.tiles && v.tiles[caseIndex];
    const p = grid && grid[tileIndex];
    if (!p || !p.visible) {
      return { opacity: 0, transform: [{ translateX: -9999 }, { translateY: -9999 }] };
    }
    return {
      opacity: plantMode ? 1 : 0.85,
      transform: [{ translateX: p.x - TILE_LABEL_W / 2 }, { translateY: p.y - TILE_LABEL_H / 2 }],
    };
  });

  // One-shot feedback for THIS tile. `pulse.key` changes every tend, remounting
  // the keyed MotiViews so the rise-and-fade + glow replay on the right tile.
  const mine =
    pulse && pulse.caseId === caseId && pulse.tileIndex === tileIndex ? pulse : null;
  const glow = mine ? PULSE_GLOW[mine.kind] || PULSE_GLOW.water : null;

  const empty = tile.empty;
  const growing = !empty && !tile.ripe;

  // Off plant mode: only growing/ripe tiles show an indicator; empty tiles stay
  // blank so the field reads clean. In plant mode every tile is tappable.
  if (!plantMode && empty) return null;

  // What the chip shows.
  const chipText = empty ? '+' : tile.ripe ? tile.emoji : tile.remainingLabel;

  return (
    <Animated.View style={[styles.tileWrap, style]} pointerEvents={plantMode ? 'box-none' : 'none'}>
      {/* floating "+45s 🌱" pop — rises and fades on each tend */}
      {mine && (
        <MotiView
          key={`pop-${mine.key}`}
          style={styles.tilePop}
          pointerEvents="none"
          from={{ opacity: 0, translateY: 4, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], translateY: [4, -10, -26, -40], scale: [0.6, 1.08, 1, 0.92] }}
          transition={{ type: 'timing', duration: 1050 }}
        >
          <Text style={[styles.tilePopText, { color: glow.text }]}>{mine.label}</Text>
        </MotiView>
      )}

      {/* the chip itself does a quick scale-punch + colored glow flash. On a
          'growing' (cooldown) tap it instead WOBBLES side-to-side — the
          never-dead "not yet, still growing" feedback (no commit happened). */}
      <MotiView
        key={mine ? `chip-${mine.key}` : 'chip-idle'}
        from={mine ? (mine.kind === 'growing' ? { translateX: 0 } : { scale: 1 }) : undefined}
        animate={
          mine
            ? mine.kind === 'growing'
              ? { translateX: [0, -4, 4, -3, 0] }
              : { scale: [1, 1.42, 1] }
            : { scale: 1 }
        }
        transition={{ type: 'timing', duration: mine && mine.kind === 'growing' ? 360 : 520 }}
        style={
          glow && {
            borderRadius: rad.sm,
            shadowColor: glow.ring,
            shadowOpacity: 0.95,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 0 },
            elevation: 12,
          }
        }
      >
        <Pressable
          onPress={() => onTap(tileIndex)}
          disabled={!plantMode}
          style={[
            styles.tileChip,
            empty && styles.tileChipEmpty,
            tile.ripe && styles.tileChipRipe,
            glow && { borderColor: glow.ring, backgroundColor: glow.bg },
          ]}
        >
          <Text style={[styles.tileChipText, empty && styles.tileChipPlus, tile.ripe && styles.tileChipEmoji]}>
            {chipText}
          </Text>
        </Pressable>
      </MotiView>
    </Animated.View>
  );
}

// All 16 tile markers for one case. Tile views are computed in RN scope (model
// math is fine outside the Canvas) and the per-tile tap routes back as
// onTileTap(case, tileIndex).
function FieldMarkers({ caseIndex, data, projected, plantMode, onTileTap, pulse }) {
  return data.tiles.map((tile, t) => (
    <TileMarker
      key={data.id + ':tile:' + t}
      caseIndex={caseIndex}
      tileIndex={t}
      tile={tile}
      caseId={data.id}
      projected={projected}
      plantMode={plantMode}
      onTap={(i) => onTileTap(data.case, i)}
      pulse={pulse}
    />
  ));
}

/* --------------------------- animal markers (RN overlay) ------------------- */

// One projected chip per ANIMAL. Mirrors <TileMarker>'s projection mechanism but
// is ALWAYS interactive (the cozy feed/collect loop is never gated by plant mode),
// riding the same proven `box-none` overlay so the camera PanResponder and
// house-tap stay byte-identical.
//
// Display ladder per animal (an animalView):
//   ready    → produce emoji (🥚/🍄) + gold "collect" glow
//   producing→ m:ss countdown chip (non-glowing)
//   hungry   → animal emoji + amber "feed me" ring
//
// `animal` is a farmModel.animalView. `screen` is this pen's projected point
// (projected.value.pens[caseIndex][animalIndex]).
function AnimalMarker({ caseIndex, animalIndex, animal, projected, onTap, pulse, caseId }) {
  const style = useAnimatedStyle(() => {
    const v = projected.value;
    const grid = v && v.pens && v.pens[caseIndex];
    const p = grid && grid[animalIndex];
    if (!p || !p.visible) {
      return { opacity: 0, transform: [{ translateX: -9999 }, { translateY: -9999 }] };
    }
    return {
      opacity: 1,
      transform: [{ translateX: p.x - TILE_LABEL_W / 2 }, { translateY: p.y - TILE_LABEL_H / 2 }],
    };
  });

  // One-shot feed/collect feedback for THIS animal. The pulse channel is shared
  // with tiles but disambiguated by `target:'animal'`.
  const mine =
    pulse && pulse.target === 'animal' && pulse.caseId === caseId && pulse.tileIndex === animalIndex
      ? pulse
      : null;
  const glow = mine ? PULSE_GLOW[mine.kind] || PULSE_GLOW.feed : null;

  const ready = animal.ready;
  const hungry = animal.hungry;
  // ready → produce; hungry → animal face; producing → countdown.
  const chipText = ready ? animal.produceEmoji : hungry ? animal.emoji : animal.remainingLabel;

  return (
    <Animated.View style={[styles.tileWrap, style]} pointerEvents="box-none">
      {/* floating "Fed! 🐖 / +1 🥚" pop — rises and fades on each tap */}
      {mine && (
        <MotiView
          key={`apop-${mine.key}`}
          style={styles.tilePop}
          pointerEvents="none"
          from={{ opacity: 0, translateY: 4, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], translateY: [4, -10, -26, -40], scale: [0.6, 1.08, 1, 0.92] }}
          transition={{ type: 'timing', duration: 1050 }}
        >
          <Text style={[styles.tilePopText, { color: glow.text }]}>{mine.label}</Text>
        </MotiView>
      )}

      <MotiView
        key={mine ? `achip-${mine.key}` : 'achip-idle'}
        from={mine ? { scale: 1 } : undefined}
        animate={mine ? { scale: [1, 1.42, 1] } : { scale: 1 }}
        transition={{ type: 'timing', duration: 520 }}
        style={
          (glow || ready || hungry) && {
            borderRadius: rad.sm,
            shadowColor: glow ? glow.ring : ready ? '#FFE48A' : '#FFD2A6',
            shadowOpacity: glow ? 0.95 : ready ? 0.85 : 0.5,
            shadowRadius: glow ? 12 : ready ? 10 : 7,
            shadowOffset: { width: 0, height: 0 },
            elevation: glow ? 12 : ready ? 10 : 6,
          }
        }
      >
        <Pressable
          onPress={() => onTap(animalIndex)}
          style={[
            styles.tileChip,
            ready && styles.animalChipReady,
            hungry && !ready && styles.animalChipHungry,
            glow && { borderColor: glow.ring, backgroundColor: glow.bg },
          ]}
        >
          <Text style={[styles.tileChipText, (ready || hungry) && styles.tileChipEmoji]}>
            {chipText}
          </Text>
        </Pressable>
      </MotiView>
    </Animated.View>
  );
}

// All animal markers (dynamic count) for one case. Views are computed in RN scope
// (model math is fine outside the Canvas) and taps route back as
// onAnimalTap(case, animalIndex).
function PenMarkers({ caseIndex, data, projected, onAnimalTap, pulse }) {
  return data.animals.map((animal, a) => (
    <AnimalMarker
      key={data.id + ':animal:' + a}
      caseIndex={caseIndex}
      animalIndex={a}
      animal={animal}
      caseId={data.id}
      projected={projected}
      onTap={(i) => onAnimalTap(data.case, i)}
      pulse={pulse}
    />
  ));
}

export default function VillageMap({ cases, onSelect, plantMode = false, now = 0, onTileTap, onAnimalTap, pulse = null }) {
  const positions = useMemo(() => layout(cases.length), [cases.length]);
  const projected = useSharedValue({ houses: [], tiles: [] });
  const control = useRef({ target: { x: 0, z: 0 }, radius: 14, azimuth: 0, polar: 0.7, base: null, pinch: null });

  // Per-FIELD render data, computed here in RN scope (model math is fine outside
  // the Canvas) and fed to FarmField as plain props — Context can't cross <Canvas>.
  // Each field carries its grid origin/rotation (so FarmField AND the projection
  // share the SAME tileWorldPos geometry) and its 16 tileViews.
  const fieldData = useMemo(
    () =>
      cases.map((c, i) => {
        const origin = plotPos(positions[i]);
        const pen = penPos(positions[i]);
        const tiles = Array.from({ length: TILE_COUNT }, (_, t) =>
          tileView(c.farm, t, 'worker', now)
        );
        // DYNAMIC pen length — derive from the farm's animals array (3..6) so a
        // bought chicken/pig grows the pen + its projected markers in lockstep.
        const animalCount = Array.isArray(c.farm?.animals) ? c.farm.animals.length : 3;
        const animals = Array.from({ length: animalCount }, (_, a) =>
          animalView(c.farm, a, 'worker', now)
        );
        const decor = Array.isArray(c.farm?.decor) ? c.farm.decor : [];
        // The shared pulse channel is disambiguated by `target`. A tile tend
        // pulses the field; an animal feed/collect pulses the pen — never both.
        const isAnimalPulse = pulse && pulse.target === 'animal' && pulse.caseId === c.id;
        const isTilePulse = pulse && pulse.target !== 'animal' && pulse.caseId === c.id;
        return {
          case: c,
          id: c.id,
          origin: [origin.x, origin.y, origin.z],
          penOrigin: [pen.x, pen.y, pen.z],
          rotationY: positions[i].rotationY,
          tiles,
          animals,
          animalCount,
          decor,
          // when a tile on THIS field was just tended → FarmField flashes that
          // crop nub emissive (pulseIndex = which tile, pulseKey = replay trigger).
          pulseIndex: isTilePulse ? pulse.tileIndex : -1,
          pulseKey: isTilePulse ? pulse.key : 0,
          // when an animal in THIS pen was just fed/collected → AnimalPen flashes
          // that animal emissive (same idiom, separate channel).
          animalPulseIndex: isAnimalPulse ? pulse.tileIndex : -1,
          animalPulseKey: isAnimalPulse ? pulse.key : 0,
        };
      }),
    [cases, positions, now, pulse]
  );

  const handleTileTap = onTileTap || (() => {});
  const handleAnimalTap = onAnimalTap || (() => {});

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
        <Scene
          cases={cases}
          positions={positions}
          control={control}
          projected={projected}
          onSelect={onSelect}
          fieldData={fieldData}
          plantMode={plantMode}
        />
      </Canvas>

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {cases.map((c, i) => (
          <Label
            key={c.id}
            index={i}
            data={c}
            projected={projected}
            onSelect={() => onSelect(c)}
            plantMode={plantMode}
          />
        ))}
        {cases.map((c, i) => (
          <FieldMarkers
            key={c.id + ':markers'}
            caseIndex={i}
            data={fieldData[i]}
            projected={projected}
            plantMode={plantMode}
            onTileTap={handleTileTap}
            pulse={pulse}
          />
        ))}
        {cases.map((c, i) => (
          <PenMarkers
            key={c.id + ':penmarkers'}
            caseIndex={i}
            data={fieldData[i]}
            projected={projected}
            onAnimalTap={handleAnimalTap}
            pulse={pulse}
          />
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
  tileWrap: { position: 'absolute', top: 0, left: 0, width: TILE_LABEL_W, alignItems: 'center', justifyContent: 'center' },
  tileChip: {
    minWidth: TILE_LABEL_H,
    height: TILE_LABEL_H,
    paddingHorizontal: 7,
    borderRadius: rad.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,32,27,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  // Empty tile = faint dashed "+" invite (plant mode only).
  tileChipEmpty: {
    backgroundColor: 'rgba(107,74,46,0.45)',
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.4)',
  },
  // Ripe tile = green "ready" border.
  tileChipRipe: {
    borderColor: 'rgba(156,255,176,0.85)',
    backgroundColor: 'rgba(20,90,45,0.5)',
  },
  tileChipText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
    color: palette.white,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  tileChipPlus: { fontSize: 20, lineHeight: 22, color: 'rgba(255,255,255,0.85)' },
  // Ready animal = gold "collect" border (produce is waiting).
  animalChipReady: {
    borderColor: 'rgba(255,228,138,0.9)',
    backgroundColor: 'rgba(110,90,20,0.5)',
  },
  // Hungry animal = warm amber "feed me" border.
  animalChipHungry: {
    borderColor: 'rgba(255,210,166,0.75)',
    backgroundColor: 'rgba(80,52,28,0.5)',
  },
  tileChipEmoji: { fontSize: 20, lineHeight: 24 },
  tilePop: { position: 'absolute', top: -6, alignSelf: 'center', zIndex: 20 },
  tilePopText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
