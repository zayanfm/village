/**
 * YouthJournalShelf.js — the Journaling Bookshelf screen.
 *
 * Wires the four deliverables into one interactive scene, in the established
 * UniGarden RN/r3f idiom (cf. YouthRoomHome.js):
 *   - <Canvas> gated on screen focus (disposes the GL context on leave),
 *   - a 1-finger orbit rig (PanResponder) for the idle overview,
 *   - a BookAnimationController stepped inside useFrame (camera tween state
 *     machine — the RN equivalent of a GSAP camera timeline),
 *   - r3f `onClick` raycasting on each <Book>,
 *   - RN glass labels projected from 3D anchors every frame (no drei <Html>),
 *   - a volatile RN editor overlay (the "DOM text overlay" over the canvas).
 *
 * DATA / VIEW SEPARATION
 *   View  = three.js (Canvas, Book, controller.update) — never re-renders on tween
 *   Data  = React state + VolatileTranscriptContext — touched only at discrete
 *           transitions (open editor / submit).
 *
 * TWO SUBMIT PATHS
 *   Temporary  -> beginVanish() + flushJournalDraft(); NEVER calls the API.
 *   Permanent  -> beginSeal()   + savePermanentEntry() -> commitJournalEntry().
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Canvas, useFrame } from '@react-three/fiber';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as THREE from 'three';

import Book from './Book';
import BookAnimationController, { JournalState } from './journalAnimationController';
import { JOURNAL_MOTION } from '../../assets/journal/journalAssets';
import { savePermanentEntry } from '../../api/journalService';
import { useVolatileTranscript } from '../../context/VolatileTranscriptContext';
import { pastel, youthRadius as rad } from './youthTheme';

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const LABEL_W = 150;

// Shelf-space layout shared by the meshes, the controller and the labels.
const BOOKS = [
  { id: 'permanent', variant: 'permanent', shelf: [-0.7, 1.0, 0], focusPos: [-0.7, 1.05, 2.4] },
  { id: 'temporary', variant: 'temporary', shelf: [0.7, 1.0, 0], focusPos: [0.7, 1.05, 2.4] },
];
const HOME_POS = [0, 1.8, 5.6];
const HOME_TARGET = [0, 1.0, 0];

/* ------------------------------ the shelf model ----------------------------- */

function Bookshelf() {
  const wood = useMemo(
    () => new THREE.MeshStandardMaterial({ color: pastel.corkDark, roughness: 0.85 }),
    []
  );
  // a few static "filler" books so the shelf reads as lived-in
  const fillers = useMemo(
    () =>
      [
        [-1.35, '#7FD1C1'],
        [-1.15, '#F7C9D9'],
        [1.15, '#D9CCF5'],
        [1.35, '#F6D6A8'],
      ].map(([x, c]) => ({ x, c, h: 0.8 + Math.random() * 0.18 })),
    []
  );
  return (
    <group>
      {/* back panel */}
      <mesh position={[0, 1.0, -0.4]} receiveShadow material={wood}>
        <boxGeometry args={[3.4, 2.4, 0.1]} />
      </mesh>
      {/* sides */}
      {[-1.7, 1.7].map((x) => (
        <mesh key={x} position={[x, 1.0, 0]} material={wood} castShadow>
          <boxGeometry args={[0.12, 2.4, 0.9]} />
        </mesh>
      ))}
      {/* top + bottom + the shelf the journals sit on */}
      {[2.2, 0.45, 1.6].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} material={wood} castShadow receiveShadow>
          <boxGeometry args={[3.4, 0.12, 0.9]} />
        </mesh>
      ))}
      {/* shelf the two journals rest on */}
      <mesh position={[0, 0.46, 0]} material={wood} receiveShadow>
        <boxGeometry args={[3.4, 0.12, 0.9]} />
      </mesh>
      {/* filler books */}
      {fillers.map((f, i) => (
        <mesh key={i} position={[f.x, 0.52 + f.h / 2, 0]} castShadow>
          <boxGeometry args={[0.16, f.h, 0.66]} />
          <meshStandardMaterial color={f.c} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/* ----------------------- in-canvas controller runner ----------------------- */
// Lives inside <Canvas> so it can use useFrame. Drives the camera (orbit when
// idle, controller tween otherwise) and projects label anchors to screen space.

function SceneRunner({ controller, orbit, projected }) {
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const anchors = useMemo(() => BOOKS.map((b) => new THREE.Vector3(...b.shelf)), []);

  useFrame(({ camera, size }, delta) => {
    if (controller.state === JournalState.IDLE) {
      // overview orbit rig
      const az = orbit.current.azimuth;
      const r = 5.6;
      camera.position.lerp(tmp.set(Math.sin(az) * r, 1.8, Math.cos(az) * r), 0.12);
      camera.lookAt(0, 1.0, 0);
    } else {
      controller.update(camera, delta);
    }

    // project the two book anchors -> 2D for the RN labels
    const out = [];
    for (let i = 0; i < anchors.length; i++) {
      tmp.copy(anchors[i]).project(camera);
      out.push({ x: (tmp.x * 0.5 + 0.5) * size.width, y: (-tmp.y * 0.5 + 0.5) * size.height, visible: tmp.z < 1 });
    }
    projected.value = out;
  });

  return null;
}

function Scene({ controller, orbit, projected, onSelect }) {
  return (
    <>
      <hemisphereLight args={['#fff3e2', '#3a2f44', 0.5]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 6, 5]} intensity={1.2} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[0, 2, 2.5]} intensity={10} distance={9} decay={2} color={pastel.glow} />

      <Bookshelf />
      {BOOKS.map((b) => (
        <Book
          key={b.id}
          id={b.id}
          variant={b.variant}
          position={b.shelf}
          controller={controller}
          onSelect={onSelect}
        />
      ))}

      <SceneRunner controller={controller} orbit={orbit} projected={projected} />
    </>
  );
}

/* --------------------------------- label ----------------------------------- */

function Label({ index, text, sub, projected, onPress, hidden }) {
  const style = useAnimatedStyle(() => {
    const p = projected.value && projected.value[index];
    if (hidden.value || !p || !p.visible) {
      return { opacity: 0, transform: [{ translateX: -9999 }, { translateY: -9999 }] };
    }
    return { opacity: 1, transform: [{ translateX: p.x - LABEL_W / 2 }, { translateY: p.y - 130 }] };
  });
  return (
    <Animated.View style={[styles.labelWrap, style]} pointerEvents="box-none">
      <Pressable onPress={onPress} style={styles.labelGlass}>
        <Text style={styles.labelText}>{text}</Text>
        <Text style={styles.labelSub}>{sub}</Text>
      </Pressable>
    </Animated.View>
  );
}

/* --------------------------------- screen ---------------------------------- */

export default function YouthJournalShelf({ navigation }) {
  const isFocused = useIsFocused();
  const { journalDraft, setJournalDraft, flushJournalDraft, commitJournalEntry } = useVolatileTranscript();

  const [editing, setEditing] = useState(null); // null | { id, variant }
  const [permText, setPermText] = useState(''); // permanent text (non-volatile is fine; it gets saved)
  const [toast, setToast] = useState(null);

  const orbit = useRef({ azimuth: 0, base: 0 });
  const projected = useSharedValue([{ x: 0, y: 0, visible: false }, { x: 0, y: 0, visible: false }]);
  const labelsHidden = useSharedValue(false);

  // One controller instance, wired to React only at discrete transitions.
  const controller = useMemo(
    () =>
      new BookAnimationController({
        onEnterEditing: (book) => {
          labelsHidden.value = true;
          setEditing({ id: book.id, variant: book.variant });
        },
        onIdle: () => {
          labelsHidden.value = false;
        },
        onAnimationComplete: (book) => {
          if (book.variant === 'temporary') setToast('Entry released — nothing was saved.');
        },
      }),
    []
  );

  // Register layout once.
  useMemo(() => {
    BOOKS.forEach((b) => controller.registerBook(b.id, { variant: b.variant, anchor: b.shelf, focusPos: b.focusPos }));
    controller.setHome(HOME_POS, HOME_TARGET);
  }, [controller]);

  // Never leave the camera stuck on re-focus.
  useFocusEffect(
    useCallback(() => {
      controller.reset();
      orbit.current.azimuth = 0;
      labelsHidden.value = false;
      setEditing(null);
      return () => {};
    }, [controller])
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6,
        onPanResponderGrant: () => (orbit.current.base = orbit.current.azimuth),
        onPanResponderMove: (_e, g) => {
          if (controller.state === JournalState.IDLE) {
            orbit.current.azimuth = clamp(orbit.current.base + g.dx * 0.005, -0.9, 0.9);
          }
        },
      }),
    [controller]
  );

  const select = useCallback((id) => controller.focus(id), [controller]);

  // ---- TEMPORARY: vanish + volatile wipe, NEVER an API call ----
  const submitTemporary = () => {
    controller.beginVanish(JOURNAL_MOTION.vanish.durationMs);
    flushJournalDraft(); // volatile text destroyed the instant Submit fires
    setEditing(null);
  };

  // ---- PERMANENT: lock animation + persist via the API ----
  const submitPermanent = async () => {
    const body = permText.trim();
    controller.beginSeal(JOURNAL_MOTION.lock.durationMs);
    setEditing(null);
    if (!body) return;
    const res = await savePermanentEntry({ body, createdAt: Date.now() });
    commitJournalEntry({ id: res.entryId, preview: body.slice(0, 48), committedAt: res.committedAt });
    setPermText('');
    setToast('Entry sealed to your archive.');
  };

  const cancel = () => {
    controller.cancel();
    setEditing(null);
  };

  // Pop if there's history, otherwise route to the Room (handles the case where
  // this screen is the stack's initial route, e.g. when previewed in isolation).
  const goBack = () => {
    if (navigation?.canGoBack()) navigation.goBack();
    else navigation?.navigate('YouthRoomHome');
  };

  const isTemp = editing?.variant === 'temporary';

  return (
    <View style={styles.root}>
      <View style={styles.fill} {...responder.panHandlers}>
        {isFocused && (
          <Canvas
            shadows
            camera={{ position: HOME_POS, fov: 46, near: 0.1, far: 100 }}
            onCreated={({ gl }) => gl.setClearColor('#241B2E', 1)}
          >
            <Scene controller={controller} orbit={orbit} projected={projected} onSelect={select} />
          </Canvas>
        )}
      </View>

      {/* projected RN labels (hidden while editing) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Label index={0} text="Permanent" sub="Sealed & kept" projected={projected} hidden={labelsHidden} onPress={() => select('permanent')} />
        <Label index={1} text="Temporary" sub="Vanishes on send" projected={projected} hidden={labelsHidden} onPress={() => select('temporary')} />
      </View>

      <SafeAreaView style={styles.header} edges={['top']} pointerEvents="box-none">
        <Pressable onPress={goBack} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹ Room</Text>
        </Pressable>
        <Text style={styles.title}>Journaling Shelf</Text>
        <Text style={styles.subtitle}>Tap a journal to write</Text>
      </SafeAreaView>

      {/* volatile editor overlay (the DOM-text-over-canvas equivalent) */}
      {editing && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
          pointerEvents="box-none"
        >
          <View style={[styles.editor, isTemp ? styles.editorTemp : styles.editorPerm]}>
            <Text style={styles.editorKicker}>{isTemp ? '✦ TEMPORARY' : '🔒 PERMANENT'}</Text>
            <Text style={styles.editorTitle}>{isTemp ? 'Write & release' : 'Write to keep'}</Text>
            <Text style={styles.editorNote}>
              {isTemp
                ? 'This lives only in memory. Sending makes it vanish — nothing is stored.'
                : 'This is sealed to your archive when you send.'}
            </Text>
            <TextInput
              style={styles.input}
              value={isTemp ? journalDraft ?? '' : permText}
              onChangeText={isTemp ? setJournalDraft : setPermText}
              placeholder={isTemp ? 'Let it out…' : 'Something to remember…'}
              placeholderTextColor={pastel.sub}
              multiline
              autoFocus
            />
            <View style={styles.editorRow}>
              <Pressable onPress={cancel} style={styles.cancelBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={isTemp ? submitTemporary : submitPermanent}
                style={[styles.submitBtn, isTemp ? styles.submitTemp : styles.submitPerm]}
              >
                <Text style={styles.submitText}>{isTemp ? 'Release ✦' : 'Seal 🔒'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {toast && (
        <Pressable style={styles.toast} onPress={() => setToast(null)}>
          <Text style={styles.toastText}>{toast}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#241B2E' },
  fill: { flex: 1 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 12 },
  back: { alignSelf: 'flex-start' },
  backText: { color: pastel.amber, fontWeight: '800', fontSize: 15 },
  title: { color: pastel.white, fontWeight: '900', fontSize: 26, marginTop: 6 },
  subtitle: { color: pastel.mint, fontWeight: '700', fontSize: 12.5, marginTop: 2 },

  labelWrap: { position: 'absolute', top: 0, left: 0, width: LABEL_W, alignItems: 'center' },
  labelGlass: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: rad.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    alignItems: 'center',
  },
  labelText: { color: pastel.ink, fontWeight: '900', fontSize: 13.5 },
  labelSub: { color: pastel.sub, fontWeight: '700', fontSize: 10.5, marginTop: 1 },

  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', padding: 18 },
  editor: {
    borderRadius: rad.xl,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 22,
    elevation: 16,
  },
  editorTemp: { borderColor: pastel.neon },
  editorPerm: { borderColor: pastel.amberDeep },
  editorKicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, color: pastel.mintDeep },
  editorTitle: { fontSize: 22, fontWeight: '900', color: pastel.ink, marginTop: 2 },
  editorNote: { fontSize: 12.5, color: pastel.sub, marginTop: 6, lineHeight: 18 },
  input: {
    marginTop: 14,
    minHeight: 96,
    maxHeight: 180,
    backgroundColor: pastel.cream,
    borderRadius: rad.lg,
    padding: 14,
    color: pastel.ink,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  editorRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 14 },
  cancelBtn: { paddingHorizontal: 18, paddingVertical: 12 },
  cancelText: { color: pastel.sub, fontWeight: '800', fontSize: 15 },
  submitBtn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: rad.pill },
  submitTemp: { backgroundColor: pastel.mintDeep },
  submitPerm: { backgroundColor: pastel.amberDeep },
  submitText: { color: pastel.white, fontWeight: '900', fontSize: 15 },

  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 40,
    backgroundColor: 'rgba(20,14,26,0.92)',
    borderRadius: rad.lg,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  toastText: { color: pastel.white, fontWeight: '700', fontSize: 13.5 },
});
