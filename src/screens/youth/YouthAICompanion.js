/**
 * YouthAICompanion.js — Upgraded Characters
 *
 * Top viewport: two clay-shaded characters rendered side by side —
 *   - AI Bot: a floating spherical robot with an emissive neon facial display
 *     grid; hovers vertically + gently rotates.
 *   - User Avatar: a charming low-poly Bondee-style figure with smooth meshes;
 *     subtle breathing.
 * Animations are layered and driven by the three.js clock (useFrame).
 *
 * Bottom: the clean glassmorphic chat overlay (unchanged sandbox behavior).
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
import { useIsFocused } from '@react-navigation/native';
import { Canvas, useFrame } from '@react-three/fiber';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import OrbCompanion from './OrbCompanion';
import { pastel, youthRadius as rad } from './youthTheme';
import { sendMessage } from '../../api/chatService';

/* --------------------------- User Avatar ------------------------------------ */

function UserAvatar() {
  const rig = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (rig.current) {
      const breathe = 1 + Math.sin(t * 2.0) * 0.025;
      rig.current.scale.set(breathe, 1 / breathe, breathe);
      rig.current.position.y = -0.35 + Math.sin(t * 1.1) * 0.03;
    }
  });
  return (
    <group ref={rig} position={[-1.05, -0.35, 0]}>
      {/* body */}
      <mesh castShadow position={[0, 0.05, 0]}>
        <capsuleGeometry args={[0.42, 0.5, 10, 24]} />
        <meshStandardMaterial color={pastel.lavenderDeep} roughness={0.9} />
      </mesh>
      {/* head */}
      <mesh castShadow position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.42, 32, 32]} />
        <meshStandardMaterial color={pastel.cream} roughness={0.85} />
      </mesh>
      {/* hair cap */}
      <mesh position={[0, 0.92, 0]}>
        <sphereGeometry args={[0.44, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color={pastel.ink} roughness={0.8} />
      </mesh>
      {/* eyes */}
      {[-0.15, 0.15].map((x) => (
        <mesh key={x} position={[x, 0.78, 0.38]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial color={pastel.ink} roughness={0.4} />
        </mesh>
      ))}
      {/* cheeks */}
      {[-0.24, 0.24].map((x) => (
        <mesh key={x} position={[x, 0.66, 0.34]}>
          <circleGeometry args={[0.07, 18]} />
          <meshStandardMaterial color={pastel.blush} roughness={1} />
        </mesh>
      ))}
      {/* little arms */}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 0.5, 0.1, 0]}>
          <sphereGeometry args={[0.16, 18, 18]} />
          <meshStandardMaterial color={pastel.lavenderDeep} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------- chat ------------------------------------------- */

const GREETING = { id: 'm0', from: 'bot', text: "Hey! I'm Sprout 🌱 How are you feeling today?" };

export default function YouthAICompanion({ navigation }) {
  const [thread, setThread] = useState([GREETING]);
  const [history, setHistory] = useState([]);
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scroller = useRef();
  const isFocused = useIsFocused();

  const scrollToEnd = () => scroller.current?.scrollToEnd({ animated: true });

  const send = async () => {
    const text = draft.trim();
    if (!text || isTyping) return;

    setThread((prev) => [...prev, { id: `me-${Date.now()}`, from: 'me', text }]);
    setDraft('');
    setIsTyping(true);
    setTimeout(scrollToEnd, 50);

    const nextHistory = [...history, { role: 'user', content: text }];

    try {
      const reply = await sendMessage(text, history);
      setHistory([...nextHistory, { role: 'assistant', content: reply }]);
      setThread((prev) => [...prev, { id: `bot-${Date.now()}`, from: 'bot', text: reply }]);
    } catch (err) {
      console.error('[Sprout] chat error:', err);
      setThread((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, from: 'bot', text: 'sorry, I lost the connection for a sec. try again?' },
      ]);
    } finally {
      setIsTyping(false);
      setTimeout(scrollToEnd, 80);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.stage}>
        <LinearGradient colors={[pastel.sky, pastel.lavender]} style={StyleSheet.absoluteFill} />
        {isFocused && (
          <Canvas shadows camera={{ position: [0, 0.4, 4.0], fov: 42 }} onCreated={({ gl }) => gl.setClearColor('#000000', 0)}>
            <ambientLight intensity={0.8} />
            <directionalLight position={[2, 4, 3]} intensity={1.1} castShadow />
            <pointLight position={[-2, 1, 2]} intensity={8} distance={8} color={pastel.neon} />
            <UserAvatar />
            <OrbCompanion position={[1.05, 0.15, 0]} scale={1.05} />
          </Canvas>
        )}

        <SafeAreaView style={styles.header} edges={['top']} pointerEvents="box-none">
          <Pressable onPress={() => navigation?.goBack()} hitSlop={12} style={styles.back}>
            <Text style={styles.backText}>‹ Room</Text>
          </Pressable>
          <Text style={styles.name}>Sprout & You</Text>
          <Text style={styles.status}>● your companion</Text>
        </SafeAreaView>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatWrap}>
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
            {isTyping && (
              <MotiView
                from={{ opacity: 0, translateY: 8 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 200 }}
                style={[styles.bubbleRow, styles.rowBot]}
              >
                <View style={[styles.bubble, styles.bubbleBot]}>
                  <Text style={styles.bubbleText}>• • •</Text>
                </View>
              </MotiView>
            )}
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
              <Pressable onPress={send} style={[styles.sendBtn, isTyping && { opacity: 0.4 }]} disabled={isTyping}>
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
  input: { flex: 1, backgroundColor: pastel.cream, borderRadius: rad.pill, paddingHorizontal: 18, paddingVertical: 12, color: pastel.ink, fontSize: 15 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: pastel.mintDeep, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: pastel.white, fontSize: 22, fontWeight: '900' },
});
