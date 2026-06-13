/**
 * YouthAICompanion.js — AI Companion Screen
 *
 * Split view:
 *   - Top: a cute procedural 3D companion (head/body/eyes/cheeks) with a slow
 *     idle bob + breathe loop. (Higgsfield can bake a higher-fidelity character
 *     skin at design time; the runtime character is procedural R3F.)
 *   - Bottom: a rounded glassmorphic chat window with a mock thread and a custom
 *     input box. Replies are canned + ephemeral (local state only) — a sandbox
 *     for conversation micro-interactions, not a real model.
 */

import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Canvas, useFrame } from '@react-three/fiber';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { pastel, youthRadius as rad } from './youthTheme';

function Companion() {
  const body = useRef();
  useFrame(({ clock }) => {
    if (!body.current) return;
    const t = clock.elapsedTime;
    body.current.position.y = Math.sin(t * 1.6) * 0.06; // gentle bob
    const breathe = 1 + Math.sin(t * 2.2) * 0.03; // breathing
    body.current.scale.set(breathe, 1 / breathe, breathe);
  });
  return (
    <group ref={body}>
      {/* body */}
      <mesh castShadow position={[0, -0.5, 0]}>
        <capsuleGeometry args={[0.55, 0.5, 8, 24]} />
        <meshStandardMaterial color={pastel.mint} roughness={0.85} />
      </mesh>
      {/* head */}
      <mesh castShadow position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.62, 32, 32]} />
        <meshStandardMaterial color={pastel.mint} roughness={0.85} />
      </mesh>
      {/* eyes */}
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.55, 0.55]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial color={pastel.ink} roughness={0.4} />
        </mesh>
      ))}
      {/* cheeks */}
      {[-0.34, 0.34].map((x) => (
        <mesh key={x} position={[x, 0.4, 0.5]}>
          <circleGeometry args={[0.1, 20]} />
          <meshStandardMaterial color={pastel.blush} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

const SEED_THREAD = [
  { id: 'm1', from: 'bot', text: 'Hey! I’m Sprout 🌱 How are you feeling today?' },
  { id: 'm2', from: 'me', text: 'A little stressed about exams tbh' },
  { id: 'm3', from: 'bot', text: 'That’s really valid. Want to try a 2-minute breathing reset together?' },
];

const CANNED = [
  'I hear you 💚 tell me more whenever you’re ready.',
  'That sounds tough. What helped a little last time?',
  'You’re doing better than you think. One small step?',
  'Thanks for sharing that with me 🌱',
];

export default function YouthAICompanion({ navigation }) {
  const [thread, setThread] = useState(SEED_THREAD);
  const [draft, setDraft] = useState('');
  const scroller = useRef();
  const replyIndex = useRef(0);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const mine = { id: `me-${Date.now()}`, from: 'me', text };
    setThread((prev) => [...prev, mine]);
    setDraft('');
    setTimeout(() => {
      const reply = CANNED[replyIndex.current % CANNED.length];
      replyIndex.current += 1;
      setThread((prev) => [...prev, { id: `bot-${Date.now()}`, from: 'bot', text: reply }]);
      scroller.current?.scrollToEnd({ animated: true });
    }, 700);
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <View style={styles.root}>
      {/* Top half: companion */}
      <View style={styles.stage}>
        <LinearGradient colors={[pastel.sky, pastel.lavender]} style={StyleSheet.absoluteFill} />
        <Canvas shadows camera={{ position: [0, 0.3, 3.4], fov: 42 }} onCreated={({ gl }) => gl.setClearColor('#000000', 0)}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[2, 4, 3]} intensity={1.2} castShadow />
          <Companion />
        </Canvas>

        <SafeAreaView style={styles.header} edges={['top']} pointerEvents="box-none">
          <Pressable onPress={() => navigation?.goBack()} hitSlop={12} style={styles.back}>
            <Text style={styles.backText}>‹ Room</Text>
          </Pressable>
          <Text style={styles.name}>Sprout</Text>
          <Text style={styles.status}>● your companion</Text>
        </SafeAreaView>
      </View>

      {/* Bottom half: glass chat window */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.chatWrap}
      >
        <View style={styles.chatGlass}>
          <ScrollView
            ref={scroller}
            contentContainerStyle={styles.thread}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
          >
            {thread.map((m) => (
              <MotiView
                key={m.id}
                from={{ opacity: 0, translateY: 8 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 260 }}
                style={[styles.bubbleRow, m.from === 'me' ? styles.rowMe : styles.rowBot]}
              >
                <View style={[styles.bubble, m.from === 'me' ? styles.bubbleMe : styles.bubbleBot]}>
                  <Text style={[styles.bubbleText, m.from === 'me' && { color: pastel.ink }]}>{m.text}</Text>
                </View>
              </MotiView>
            ))}
          </ScrollView>

          <SafeAreaView edges={['bottom']}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Say something…"
                placeholderTextColor={pastel.sub}
                onSubmitEditing={send}
                returnKeyType="send"
              />
              <Pressable onPress={send} style={styles.sendBtn}>
                <Text style={styles.sendText}>↑</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: pastel.lavender },
  stage: { flex: 1 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 12 },
  back: { alignSelf: 'flex-start' },
  backText: { color: pastel.ink, fontWeight: '800', fontSize: 15 },
  name: { color: pastel.ink, fontWeight: '900', fontSize: 26, marginTop: 6 },
  status: { color: pastel.mintDeep, fontWeight: '700', fontSize: 12.5, marginTop: 2 },

  chatWrap: { flex: 1, justifyContent: 'flex-end' },
  chatGlass: {
    flex: 1,
    borderTopLeftRadius: rad.xl,
    borderTopRightRadius: rad.xl,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#7a6b5a',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    overflow: 'hidden',
  },
  thread: { padding: 16, paddingBottom: 8 },
  bubbleRow: { marginBottom: 10, maxWidth: '82%' },
  rowMe: { alignSelf: 'flex-end' },
  rowBot: { alignSelf: 'flex-start' },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: rad.lg },
  bubbleBot: { backgroundColor: pastel.lavender, borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: pastel.mint, borderBottomRightRadius: 4 },
  bubbleText: { color: pastel.ink, fontSize: 14.5, lineHeight: 20, fontWeight: '500' },

  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
  input: {
    flex: 1,
    backgroundColor: pastel.cream,
    borderRadius: rad.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: pastel.ink,
    fontSize: 15,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: pastel.mintDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: pastel.white, fontSize: 22, fontWeight: '900' },
});
