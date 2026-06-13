/**
 * YouthPinboardForum.js — Tactile Peer Forum (youth profile)
 *
 * The anonymous peer forum reimagined as a corkboard: each post is a polaroid /
 * sticky note pinned with a pushpin, gently tilted for a tactile feel. All
 * entries are strictly Anonymous.
 *
 * Preserves the core forum's layout architecture toggle: SHOW_COMMENTS flips the
 * comment line on each note app-wide (mirrors PeerForum.js).
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { pastel, youthRadius as rad } from './youthTheme';

// 🔧 DEV CONFIG — mirror of PeerForum.js. Set false to hide comment lines.
const SHOW_COMMENTS = true;

const NOTE_TINTS = ['#FFF6D8', '#D9F2E6', '#F7D9E3', '#E2DBF7', '#FCE6C8'];
const SEED = [
  { id: 'p1', body: 'Took a walk instead of doomscrolling today. Small win 🌿', comments: 2 },
  { id: 'p2', body: 'Anyone else nervous about results day? 😬', comments: 5 },
  { id: 'p3', body: 'Made tea for my mum and we just talked for an hour.', comments: 1 },
  { id: 'p4', body: 'Reminder: you’re allowed to rest.', comments: 8 },
];

function Note({ post, index }) {
  const tilt = ((index % 3) - 1) * 2.5; // -2.5 / 0 / +2.5 deg
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
        {SHOW_COMMENTS && (
          <Text style={styles.comments}>💬 {post.comments} replies</Text>
        )}
      </View>
    </MotiView>
  );
}

export default function YouthPinboardForum({ navigation }) {
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
          <Pressable onPress={() => navigation?.goBack()} hitSlop={12}>
            <Text style={styles.back}>‹ Room</Text>
          </Pressable>
          <Text style={styles.title}>The Pinboard</Text>
          <Text style={styles.subtitle}>Anonymous notes from the community 🌱</Text>
        </View>

        <ScrollView contentContainerStyle={styles.board} showsVerticalScrollIndicator={false}>
          {/* compose sticky */}
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
  // corkboard surface
  root: { flex: 1, backgroundColor: pastel.cork },
  safe: { flex: 1 },
  header: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 6 },
  back: { color: '#4A3320', fontWeight: '800', fontSize: 15 },
  title: { color: '#3E2C18', fontWeight: '900', fontSize: 28, marginTop: 6 },
  subtitle: { color: '#5C4427', fontWeight: '600', fontSize: 13.5, marginTop: 4 },

  board: { padding: 16, paddingBottom: 120 },
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
  pinBtn: {
    alignSelf: 'flex-end',
    marginTop: 10,
    backgroundColor: pastel.mintDeep,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: rad.pill,
  },
  pinBtnText: { color: pastel.white, fontWeight: '900', fontSize: 13 },
});
