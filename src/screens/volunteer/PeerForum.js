/**
 * PeerForum.js — Worker peer forum, synced to the youth Pinboard aesthetic
 *
 * Overhauled from rigid cards into the same tactile corkboard used on the youth
 * side: anonymous worker discussion posts render as pinned sticky notes /
 * polaroids, gently tilted. Imports the youth pastel/cork tokens so the two
 * portals share one visual language.
 *
 * Preserves the original layout toggle: SHOW_COMMENTS hides the reply line on
 * every note when disabled.
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { pastel, youthRadius as rad } from '../youth/youthTheme';

// 🔧 DEV CONFIG — set false to hide the comment line on every note app-wide.
const SHOW_COMMENTS = true;

const NOTE_TINTS = ['#FFF6D8', '#D9F2E6', '#F7D9E3', '#E2DBF7', '#FCE6C8'];
const SEED = [
  { id: 'p1', body: 'Reminder: log the safeguarding check-in before EOD 🙏', comments: 3 },
  { id: 'p2', body: 'Any tips for a youth who keeps cancelling sessions?', comments: 7 },
  { id: 'p3', body: 'Win: matched two youths to the new mentoring cohort 🎉', comments: 4 },
  { id: 'p4', body: 'Peer support drop-in moved to Thursdays this month.', comments: 1 },
];

function Note({ post, index }) {
  const tilt = ((index % 3) - 1) * 2.5;
  const tint = NOTE_TINTS[index % NOTE_TINTS.length];
  return (
    <MotiView
      from={{ opacity: 0, scale: 0.9, rotate: `${tilt}deg` }}
      animate={{ opacity: 1, scale: 1, rotate: `${tilt}deg` }}
      transition={{ type: 'spring', damping: 14, stiffness: 160, delay: index * 80 }}
      style={styles.noteSlot}
    >
      <View style={[styles.note, { backgroundColor: tint }]}>
        <View style={styles.pin} />
        <Text style={styles.anon}>Anonymous</Text>
        <Text style={styles.noteBody}>{post.body}</Text>
        {SHOW_COMMENTS && <Text style={styles.comments}>💬 {post.comments} replies</Text>}
      </View>
    </MotiView>
  );
}

export default function PeerForum() {
  const [posts, setPosts] = useState(SEED);
  const [draft, setDraft] = useState('');

  const pin = () => {
    const body = draft.trim();
    if (!body) return;
    setPosts((prev) => [{ id: `p-${Date.now()}`, body, comments: 0 }, ...prev]);
    setDraft('');
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.kicker}>WORKER COMMUNITY</Text>
          <Text style={styles.title}>The Pinboard</Text>
          <Text style={styles.subtitle}>Anonymous notes between volunteers 🌱</Text>
        </View>

        <ScrollView contentContainerStyle={styles.board} showsVerticalScrollIndicator={false}>
          <View style={[styles.note, styles.compose]}>
            <View style={styles.pin} />
            <TextInput
              style={styles.composeInput}
              value={draft}
              onChangeText={setDraft}
              placeholder="Pin an anonymous note…"
              placeholderTextColor={pastel.sub}
              multiline
            />
            <Pressable onPress={pin} style={styles.pinBtn}>
              <Text style={styles.pinBtnText}>Pin it</Text>
            </Pressable>
          </View>

          <View style={styles.grid}>
            {posts.map((p, i) => (
              <Note key={p.id} post={p} index={i} />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: pastel.cork },
  safe: { flex: 1 },
  header: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 6 },
  kicker: { color: '#5C4427', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  title: { color: '#3E2C18', fontWeight: '900', fontSize: 28, marginTop: 4 },
  subtitle: { color: '#5C4427', fontWeight: '600', fontSize: 13.5, marginTop: 4 },

  board: { padding: 16, paddingBottom: 140 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },

  noteSlot: { width: '48%', marginBottom: 16 },
  note: {
    borderRadius: rad.sm,
    padding: 14,
    paddingTop: 22,
    minHeight: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
  pin: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E0564E',
    borderWidth: 2,
    borderColor: '#B8403A',
  },
  anon: { color: pastel.mintDeep, fontWeight: '800', fontSize: 11, marginBottom: 6 },
  noteBody: { color: pastel.ink, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  comments: { color: pastel.sub, fontSize: 11.5, fontWeight: '700', marginTop: 10 },

  compose: { width: '100%', backgroundColor: pastel.white, marginBottom: 18 },
  composeInput: { color: pastel.ink, fontSize: 15, minHeight: 48, textAlignVertical: 'top' },
  pinBtn: { alignSelf: 'flex-end', marginTop: 10, backgroundColor: pastel.mintDeep, paddingHorizontal: 20, paddingVertical: 8, borderRadius: rad.pill },
  pinBtnText: { color: pastel.white, fontWeight: '900', fontSize: 13 },
});
