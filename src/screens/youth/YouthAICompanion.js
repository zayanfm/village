import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { useYouthSession } from '../../context/YouthSessionContext';

/* ── User Avatar (Three.js) ─────────────────────────────────────────────── */

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
      <mesh castShadow position={[0, 0.05, 0]}>
        <capsuleGeometry args={[0.42, 0.5, 10, 24]} />
        <meshStandardMaterial color={pastel.lavenderDeep} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.42, 32, 32]} />
        <meshStandardMaterial color={pastel.cream} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <sphereGeometry args={[0.44, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color={pastel.ink} roughness={0.8} />
      </mesh>
      {[-0.15, 0.15].map((x) => (
        <mesh key={x} position={[x, 0.78, 0.38]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial color={pastel.ink} roughness={0.4} />
        </mesh>
      ))}
      {[-0.24, 0.24].map((x) => (
        <mesh key={x} position={[x, 0.66, 0.34]}>
          <circleGeometry args={[0.07, 18]} />
          <meshStandardMaterial color={pastel.blush} roughness={1} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 0.5, 0.1, 0]}>
          <sphereGeometry args={[0.16, 18, 18]} />
          <meshStandardMaterial color={pastel.lavenderDeep} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Message bubble ─────────────────────────────────────────────────────── */

const Bubble = React.memo(({ item }) => {
  const isMe = item.role === 'user';
  return (
    <MotiView
      from={{ opacity: 0, translateY: 6 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 220 }}
      style={[styles.bubbleRow, isMe ? styles.rowMe : styles.rowBot]}
    >
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleBot]}>
        <Text style={[styles.bubbleText, isMe && { color: pastel.ink }]}>{item.content}</Text>
      </View>
    </MotiView>
  );
});

/* ── Typing indicator ───────────────────────────────────────────────────── */

function TypingIndicator() {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 6 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 200 }}
      style={[styles.bubbleRow, styles.rowBot]}
    >
      <View style={[styles.bubble, styles.bubbleBot]}>
        <Text style={[styles.bubbleText, { color: pastel.sub, fontStyle: 'italic' }]}>
          Sprout is thinking…
        </Text>
      </View>
    </MotiView>
  );
}

/* ── Main screen ────────────────────────────────────────────────────────── */

const GREETING = {
  id: 'm0',
  role: 'assistant',
  content: "hey 🌱 I'm Sprout. how are you feeling today?",
};

export default function YouthAICompanion({ navigation }) {
  const { firestoreId } = useYouthSession();
  // messages uses the Groq format: { id, role: 'user'|'assistant', content }
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef();
  const isFocused = useIsFocused();

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { id: `u-${Date.now()}`, role: 'user', content: text };
    const nextMessages = [...messages, userMsg];

    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setTimeout(scrollToBottom, 60);

    // Strip local `id` field before sending — backend only needs role + content
    const apiMessages = nextMessages.map(({ role, content }) => ({ role, content }));

    try {
      const reply = await sendMessage(apiMessages, firestoreId);
      const botMsg = { id: `b-${Date.now()}`, role: 'assistant', content: reply };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error('[Sprout] send error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'sorry, lost connection for a sec. try again?',
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 80);
    }
  }, [input, loading, messages, scrollToBottom]);

  const renderItem = useCallback(({ item }) => <Bubble item={item} />, []);
  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <View style={styles.root}>
      {/* ── 3D Stage ── */}
      <View style={styles.stage}>
        <LinearGradient colors={[pastel.sky, pastel.lavender]} style={StyleSheet.absoluteFill} />
        {isFocused && (
          <Canvas
            shadows
            camera={{ position: [0, 0.4, 4.0], fov: 42 }}
            onCreated={({ gl }) => gl.setClearColor('#000000', 0)}
          >
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

      {/* ── Chat panel ── */}
      <KeyboardAvoidingView
        style={styles.chatWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <View style={styles.chatGlass}>
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.thread}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={scrollToBottom}
            onLayout={scrollToBottom}
            removeClippedSubviews={false}
          />

          {loading && <TypingIndicator />}

          <SafeAreaView edges={['bottom']}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="say something…"
                placeholderTextColor={pastel.sub}
                onSubmitEditing={send}
                returnKeyType="send"
                blurOnSubmit={false}
                editable={!loading}
                multiline
                maxLength={500}
              />
              <Pressable
                onPress={send}
                style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
                disabled={loading}
              >
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
  header: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  back: { alignSelf: 'flex-start' },
  backText: { color: pastel.ink, fontWeight: '800', fontSize: 15 },
  name: { color: pastel.ink, fontWeight: '900', fontSize: 26, marginTop: 6 },
  status: { color: pastel.mintDeep, fontWeight: '700', fontSize: 12.5, marginTop: 2 },

  chatWrap: { flex: 1.4, justifyContent: 'flex-end' },
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

  thread: { padding: 16, paddingBottom: 4 },
  bubbleRow: { marginBottom: 10, maxWidth: '82%' },
  rowMe: { alignSelf: 'flex-end' },
  rowBot: { alignSelf: 'flex-start' },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: rad.lg },
  bubbleBot: { backgroundColor: pastel.lavender, borderBottomLeftRadius: 4 },
  bubbleMe: { backgroundColor: pastel.mint, borderBottomRightRadius: 4 },
  bubbleText: { color: pastel.ink, fontSize: 14.5, lineHeight: 21, fontWeight: '500' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: pastel.cream,
    borderRadius: rad.lg,
    paddingHorizontal: 18,
    paddingVertical: 12,
    color: pastel.ink,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: pastel.mintDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendText: { color: pastel.white, fontSize: 22, fontWeight: '900' },
});
