/**
 * AnimalPen.js — one youth's small fenced pen of feedable animals, beside their
 * 4×4 farm field. The 3D half of the co-op "Farm Animals" feed/collect loop.
 *
 * PURE @react-three/fiber: lives INSIDE the <Canvas>. Receives EVERYTHING as
 * PLAIN PROPS computed in VillageMap's RN scope (an array of `animalView` objects
 * from farmModel.animalView()). It does NOT touch React Context, Firebase, useFarm,
 * or the farmModel/animalModel reducers — Context does not cross the Canvas
 * boundary, so all meaning arrives via props. Mirrors FarmField.js exactly.
 *
 * Render strategy (the perf core — KEEP IT CHEAP, ~10 low-poly meshes / youth):
 *   - One <group> positioned + rotated like the field; a thin instanced fence rail
 *     drawn ONCE (useLayoutEffect), plus a flat ground pad.
 *   - One AnimalBody mesh per animal (pig = sphere-ish body; chicken = body + a
 *     small pecking head). Low-poly flatShaded — pig icosa body, chicken cone-ish.
 *   - A SINGLE shared useFrame per pen writes to refs only (no React state, no
 *     re-render): pig body bob `sin(t*1.5)*0.03`; chicken head peck
 *     `max(0, sin(t*3 + k*2)) * 0.5` (phase-shifted by slot index so they peck
 *     out of sync); ready produce-nub bob `sin(t*2)*0.04` + raised emissive;
 *     feed-flash emissive for ~0.7s keyed off each animal's `boostKey`
 *     (copy of CropNub's flash). Hungry → an emissive amber feed-ring.
 *
 * NO onClick: all tapping happens in the RN projected-overlay layer (AnimalMarker
 * in VillageMap), exactly like FarmField's TileMarker — keeps the raycaster /
 * camera gestures byte-identical and adds zero tap ambiguity.
 *
 * animalWorldPos(origin, rotationY, index) is the SINGLE source of per-animal
 * geometry — used here for the animal group positions AND imported by VillageMap
 * to project each animal to 2D so the mesh and the RN overlay stay pixel-aligned.
 *
 * Crash-proof: a missing/empty animal renders nothing; defaults cover null props.
 */

import React, { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { springScale } from './VillageMap';

/* ── Pen geometry constants ────────────────────────────────────── */

const PEN_MAX = 6;           // hard cap on animals per pen (mirrors ANIMAL_MAX)
const PEN_COLS = 3;          // animals per row; pens grow into a 2nd row past 3
const SLOT = 0.95;           // spacing between animal slots (pre-rotation)
const ROW_GAP = 0.66;        // local-z offset between the two rows
const GROUND_Y = 0.02;        // pen floor height
const ANIMAL_Y = 0.18;        // animal body resting height

/** clamp a requested animal count into [1, PEN_MAX]; defaults to 3. */
function penCount(n) {
  const v = Number.isFinite(n) ? Math.floor(n) : 3;
  return Math.max(1, Math.min(PEN_MAX, v || 3));
}
/** number of populated rows for `count` animals (1 row for ≤3, else 2). */
function penRows(count) {
  return Math.max(1, Math.ceil(count / PEN_COLS));
}
/**
 * Local-space slot center for animal `index` given the pen's total `count`.
 * Rows fill left→right, top→bottom. Each row is centered on the SMALLER of
 * (count-in-this-row, PEN_COLS) so a lone 4th animal sits centered, not skewed.
 * Returns [lx, 0, lz] before the pen's own position/rotation is applied.
 */
function localSlot(index, count) {
  const rows = penRows(count);
  const row = Math.floor(index / PEN_COLS);
  const col = index % PEN_COLS;
  const inThisRow = Math.min(PEN_COLS, count - row * PEN_COLS);
  const lx = (col - (inThisRow - 1) / 2) * SLOT;
  // center the rows around local z=0
  const lz = (row - (rows - 1) / 2) * ROW_GAP;
  return [lx, 0, lz];
}

const FENCE_COLOR = '#A9784B';
const GROUND_COLOR = '#7FA653';
const RING_HUNGRY = '#FFC24D'; // amber "feed me" ring

// Shared scratch objects (module-level: reused across all instance writes).
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/**
 * animalWorldPos — world-space center of animal `index` for a pen of `count`
 * animals anchored at `origin` and rotated `rotationY` about Y. Slots fill a
 * row of up to 3 (PEN_COLS), then a 2nd row for counts 4..6; each row is
 * centered on local origin so the pen reads tidy at any size.
 *
 * SINGLE SOURCE OF TRUTH: used for the animal group positions here AND for
 * VillageMap's per-animal 2D projection — VillageMap MUST pass the SAME `count`
 * so the mesh and the RN overlay stay pixel-aligned.
 *
 * @param {[number,number,number]} origin  pen anchor [x,y,z]
 * @param {number} rotationY               Y rotation (radians)
 * @param {number} index                   animal index (0..count-1)
 * @param {number} [count=3]               total animals in the pen (1..6)
 * @returns {[number,number,number]} world position [x,y,z]
 */
export function animalWorldPos(origin = [0, 0, 0], rotationY = 0, index = 0, count = 3) {
  const [lx, , lz] = localSlot(index, penCount(count));
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const x = origin[0] + lx * cos + lz * sin;
  const z = origin[2] - lx * sin + lz * cos;
  return [x, origin[1] + ANIMAL_Y, z];
}

/* ── Per-animal body (pig or chicken) + state visuals ──────────── */

/**
 * One animal. ALL animation is driven by the parent pen's single useFrame via
 * refs handed down — this component holds zero per-frame logic of its own beyond
 * exposing refs. (We keep the JSX here but the loop lives in AnimalPen.)
 */
function AnimalBody({ animal, bodyRef, headRef, ringRef, nubRef, bodyMatRef, nubMatRef }) {
  const isPig = animal.kind === 'pig';
  const color = animal.color || (isPig ? '#E59BB0' : '#E8C76A');
  const produceColor = isPig ? '#C98A5E' : '#FFF4D6'; // truffle / egg tint

  return (
    <group>
      {/* BODY */}
      <mesh ref={bodyRef} castShadow position={[0, 0, 0]}>
        {isPig ? (
          <icosahedronGeometry args={[0.2, 0]} />
        ) : (
          <coneGeometry args={[0.16, 0.3, 6]} />
        )}
        <meshStandardMaterial
          ref={bodyMatRef}
          color={color}
          flatShading
          roughness={0.85}
          emissive={color}
          emissiveIntensity={0.12}
        />
      </mesh>

      {/* HEAD (chicken pecks; pig gets a small snout that just rides the body) */}
      <mesh
        ref={headRef}
        castShadow
        position={isPig ? [0.16, 0.04, 0] : [0, 0.18, 0.12]}
      >
        {isPig ? (
          <icosahedronGeometry args={[0.09, 0]} />
        ) : (
          <icosahedronGeometry args={[0.08, 0]} />
        )}
        <meshStandardMaterial color={color} flatShading roughness={0.85} />
      </mesh>

      {/* HUNGRY feed-ring (amber) — flat ring on the ground under the animal */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -ANIMAL_Y + 0.04, 0]}>
        <ringGeometry args={[0.26, 0.34, 22]} />
        <meshBasicMaterial color={RING_HUNGRY} transparent opacity={0.8} />
      </mesh>

      {/* READY produce-nub (egg / truffle) bobbing above the animal */}
      <mesh ref={nubRef} castShadow position={[0, 0.34, 0]}>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial
          ref={nubMatRef}
          color={produceColor}
          flatShading
          roughness={0.7}
          emissive={produceColor}
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

/* ── AnimalPen (one youth's pen of up to 3 animals) ────────────── */

/**
 * @param {object} props
 * @param {[number,number,number]} props.origin   pen anchor (= penPos(positions[i]))
 * @param {number} props.rotationY                Y rotation of the whole pen
 * @param {Array}  props.animals                  farmModel.animalView objects (1..6);
 *                                                 length drives the dynamic pen size
 *                                                 (kind/hungry/ready/progress/boostKey...)
 * @param {number} props.pulseIndex               animal index just fed/collected, or -1
 * @param {number} props.pulseKey                 remount key for emissive feed-flash
 */
export default function AnimalPen({
  origin = [0, 0, 0],
  rotationY = 0,
  animals = [],
  pulseIndex = -1,
  pulseKey = 0,
}) {
  const fence = useRef();

  // DYNAMIC pen size: derived from how many animals arrived as props, clamped to
  // [1, PEN_MAX]. Every layout memo + the useFrame loop key off this so a bought
  // animal re-derives the slots/fence/ground/refs exactly once (cheap).
  const PEN_N = penCount(animals.length);
  const rows = penRows(PEN_N);
  // widest row (3 once we spill into row 2) drives ground + fence width
  const widest = Math.min(PEN_COLS, PEN_N);

  // Local animal slot centers (pen centered on the group's own origin; the group
  // itself is positioned + rotated, so slots use LOCAL coords here).
  const localSlots = useMemo(() => {
    const out = [];
    for (let i = 0; i < PEN_N; i++) out.push(localSlot(i, PEN_N));
    return out;
  }, [PEN_N]);

  // Four fence posts framing the pen, drawn ONCE as an instanced mesh. Width +
  // depth grow with the row/column count so the rails always frame the animals.
  const fencePosts = useMemo(() => {
    const halfX = (widest * SLOT) / 2 + 0.1;
    const halfZ = 0.5 + (rows - 1) * (ROW_GAP / 2);
    return [
      [-halfX, 0.18, -halfZ],
      [halfX, 0.18, -halfZ],
      [-halfX, 0.18, halfZ],
      [halfX, 0.18, halfZ],
    ];
  }, [widest, rows]);

  useLayoutEffect(() => {
    const inst = fence.current;
    if (!inst) return;
    _q.identity();
    for (let i = 0; i < fencePosts.length; i++) {
      const [x, y, z] = fencePosts[i];
      _v.set(x, y, z);
      _m.compose(_v, _q, _v.clone().set(1, 1, 1));
      inst.setMatrixAt(i, _m);
    }
    inst.instanceMatrix.needsUpdate = true;
  }, [fencePosts]);

  // Per-animal refs (allocated once, length PEN_N) so the single shared useFrame
  // can drive every animal without per-mesh loops or React state.
  const refs = useMemo(
    () =>
      Array.from({ length: PEN_N }, () => ({
        move: React.createRef(),  // the per-animal group we wander / hop
        body: React.createRef(),
        head: React.createRef(),
        ring: React.createRef(),
        nub: React.createRef(),
        bodyMat: React.createRef(),
        nubMat: React.createRef(),
        anim: {},                 // wander/hop/nuzzle/flash state (lazy-init in useFrame)
      })),
    [PEN_N]
  );

  // ONE shared useFrame per pen. Reads the latest `animals`/`pulse*` via closure
  // each frame (cheap: ≤3 iterations, ref writes only, no allocation). Drives:
  // gentle WANDER within each slot's box, chicken EGG-HOP on lay, pig TROUGH-
  // NUZZLE on feed, plus idle bob/peck, hungry-ring, ready-nub, and feed-flash.
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const dt = Math.min(delta || 0.016, 0.05); // clamp big stalls so steps stay sane
    for (let i = 0; i < PEN_N; i++) {
      const a = animals[i];
      const r = refs[i];
      if (!a || !r) continue;
      const isPig = a.kind === 'pig';
      const w = r.anim;
      const mv = r.move.current;

      // Lazy-init wander/anim state from the slot's resting transform.
      if (mv && !w.init) {
        w.init = true;
        w.hx = mv.position.x; w.hz = mv.position.z;   // home (slot center)
        w.cx = w.hx; w.cz = w.hz;                      // current
        w.tx = w.hx; w.tz = w.hz;                      // target
        w.pause = Math.random() * 1.5;
        w.heading = mv.rotation.y || 0;
        w.lastFed = !!a.fed;
        w.lastReady = !!a.ready;
        w.lastBoost = (a.boostKey || 0);
        w.hop = null; w.nuzzle = null; w.flash = null;
      }

      // State-change detectors: chicken hops when it lays (→ready), pig nuzzles
      // the trough when freshly fed (→fed).
      if (a.ready && !w.lastReady && !isPig) w.hop = t;
      if (a.fed && !w.lastFed && isPig) w.nuzzle = t;
      w.lastReady = !!a.ready;
      w.lastFed = !!a.fed;

      const nuzzling = isPig && w.nuzzle != null;

      // ── WANDER: ease toward a target inside the slot's box, pause, repeat ──
      if (mv) {
        if (w.pause > 0 || nuzzling) {
          w.pause = Math.max(0, w.pause - dt); // hold still (or stay put to nuzzle)
        } else {
          const dx = w.tx - w.cx, dz = w.tz - w.cz;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.02) {
            const RX = isPig ? 0.16 : 0.26;   // chickens roam a touch wider
            const RZ = 0.28;
            w.tx = w.hx + (Math.random() * 2 - 1) * RX;
            w.tz = w.hz + (Math.random() * 2 - 1) * RZ;
            w.pause = 0.5 + Math.random() * (isPig ? 2.2 : 1.4);
          } else {
            const speed = isPig ? 0.16 : 0.3; // units/sec; chickens scurry faster
            const step = Math.min(speed * dt, dist);
            w.cx += (dx / dist) * step;
            w.cz += (dz / dist) * step;
            let dh = Math.atan2(dx, dz) - w.heading; // face travel direction
            while (dh > Math.PI) dh -= Math.PI * 2;
            while (dh < -Math.PI) dh += Math.PI * 2;
            w.heading += dh * Math.min(1, dt * 6);
          }
        }

        // EGG-HOP one-shot: a quick up-and-down with a little stretch.
        let hopY = 0, squash = 1;
        if (w.hop != null) {
          const e = t - w.hop;
          const DUR = 0.5;
          if (e < DUR) {
            const p = e / DUR;
            hopY = Math.sin(p * Math.PI) * 0.16;
            squash = 1 + Math.sin(p * Math.PI) * 0.18;
          } else w.hop = null;
        }

        mv.position.x = w.cx;
        mv.position.z = w.cz;
        mv.position.y = ANIMAL_Y + hopY;
        mv.rotation.y = w.heading;
        mv.scale.set(1, squash, 1);
      }

      // NUZZLE dip (pig): a couple of decaying head-down dips toward the trough.
      let nz = 0;
      if (w.nuzzle != null) {
        const e = t - w.nuzzle;
        const DUR = 1.1;
        if (e < DUR) nz = Math.max(0, Math.sin(e * Math.PI * 3)) * (1 - e / DUR);
        else w.nuzzle = null;
      }

      // BODY bob (idle aliveness) + pig nuzzle forward-dip.
      if (r.body.current) {
        r.body.current.position.y = Math.sin(t * 1.5 + i) * 0.03 - nz * 0.05;
        r.body.current.rotation.x = isPig ? nz * 0.5 : 0;
      }
      // HEAD: chicken pecks (phase-shifted); pig head dips during a nuzzle.
      if (r.head.current && !isPig) {
        const peck = Math.max(0, Math.sin(t * 3 + i * 2)) * 0.5;
        r.head.current.rotation.x = peck;
        r.head.current.position.y = 0.18 - peck * 0.12;
      } else if (r.head.current && isPig) {
        r.head.current.position.y = 0.04 - nz * 0.06;
      }

      // HUNGRY feed-ring: visible only when hungry; gentle pulse.
      if (r.ring.current) {
        const show = !!a.hungry;
        r.ring.current.visible = show;
        if (show && r.ring.current.material) {
          r.ring.current.material.opacity = 0.55 + Math.sin(t * 3) * 0.25;
        }
      }

      // READY produce-nub: visible only when ready; bob.
      if (r.nub.current) {
        const show = !!a.ready;
        r.nub.current.visible = show;
        if (show) {
          r.nub.current.position.y = 0.34 + Math.sin(t * 2 + i) * 0.04;
        }
      }

      // FEED-FLASH: fold the field-level pulse into this animal's boostKey so the
      // matching animal flashes on feed/collect even if the view boostKey lags.
      const boostKey = (a.boostKey || 0) + (pulseIndex === i ? pulseKey : 0);
      if (w.lastBoost !== boostKey) {
        w.flash = t;
        w.lastBoost = boostKey;
      }
      if (r.bodyMat.current) {
        let flash = 0;
        if (w.flash != null) {
          const f = 1 - (t - w.flash) / 0.7;
          if (f > 0) flash = f;
          else w.flash = null;
        }
        r.bodyMat.current.emissiveIntensity = 0.12 + flash * 1.4;
      }
    }
  });

  return (
    <group position={origin} rotation={[0, rotationY, 0]}>
      {/* GROUND pad — width follows the widest row, depth follows the row count */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} receiveShadow>
        <planeGeometry args={[widest * SLOT + 0.3, 1.1 + (rows - 1) * ROW_GAP]} />
        <meshStandardMaterial color={GROUND_COLOR} roughness={1} flatShading />
      </mesh>

      {/* FENCE posts — one instanced mesh of 4 */}
      <instancedMesh ref={fence} args={[undefined, undefined, 4]} castShadow>
        <boxGeometry args={[0.08, 0.36, 0.08]} />
        <meshStandardMaterial color={FENCE_COLOR} roughness={0.9} flatShading />
      </instancedMesh>

      {/* TROUGH — a little wooden feeder at the pen's front edge (the pig nuzzles here).
          Tracks the front row so it stays at the pen's near edge as rows grow. */}
      <mesh position={[0, 0.07, 0.42 + (rows - 1) * (ROW_GAP / 2)]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.12, 0.18]} />
        <meshStandardMaterial color="#8A6A4B" roughness={1} flatShading />
      </mesh>

      {/* ANIMALS — one body per slot; the group wanders + hops via r.move */}
      {animals.slice(0, PEN_N).map((animal, i) => {
        if (!animal) return null;
        const [x, , z] = localSlots[i] || [0, 0, 0];
        const r = refs[i];
        return (
          <group key={i} ref={r.move} position={[x, ANIMAL_Y, z]}>
            <AnimalBody
              animal={animal}
              bodyRef={r.body}
              headRef={r.head}
              ringRef={r.ring}
              nubRef={r.nub}
              bodyMatRef={r.bodyMat}
              nubMatRef={r.nubMat}
            />
          </group>
        );
      })}
    </group>
  );
}
