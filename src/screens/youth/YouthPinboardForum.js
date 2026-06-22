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

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { listPosts, createPost, BOARDS } from '../../api/engagementService';
import CommentSheet from '../../components/CommentSheet';
import { pastel, youthRadius as rad } from './youthTheme';

const BOARD = BOARDS.YOUTH;

// Shown when the engagement service is unreachable (backend not running).
const SEED_POSTS = [
  { id: 's1', body: 'anyone else finding it hard to focus lately? exams are really getting to me 😮‍💨', comments: 3, createdAt: Date.now() - 3600000 },
  { id: 's2', body: 'does anyone have tips for talking to parents when you feel overwhelmed? mine dont really get it', comments: 5, createdAt: Date.now() - 7200000 },
  { id: 's3', body: 'feeling really disconnected from my class lately, like nobody notices im struggling', comments: 2, createdAt: Date.now() - 86400000 },
  { id: 's4', body: 'had a genuinely good week for once, just wanted to share that 🌱', comments: 8, createdAt: Date.now() - 172800000 },
  { id: 's5', body: 'not sleeping well at all. wake up at 3am and just lie there overthinking everything', comments: 4, createdAt: Date.now() - 259200000 },
  { id: 's6', body: 'anyone else feel like they have to pretend to be okay all the time? its exhausting', comments: 6, createdAt: Date.now() - 345600000 },
];

// 🔧 DEV CONFIG — mirror of PeerForum.js. Set false to hide comment lines.
const SHOW_COMMENTS = true;

const NOTE_TINTS = ['#FFF6D8', '#D9F2E6', '#F7D9E3', '#E2DBF7', '#FCE6C8'];

// Normalize a backend post ({ id, author, body, createdAt }) for display.
// The stub has no comment count yet, so default it to 0.
const normalize = (p) => ({ id: p.id, body: p.body, comments: p.comments ?? 0, createdAt: p.createdAt });
const newestFirst = (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0);

function Note({ post, index, onPress }) {
  const tilt = ((index % 3) - 1) * 2.5; // -2.5 / 0 / +2.5 deg
  const tint = NOTE_TINTS[index % NOTE_TINTS.length];
  return (
    <MotiView
      from={{ opacity: 0, scale: 0.9, rotate: `${tilt}deg` }}
      animate={{ opacity: 1, scale: 1, rotate: `${tilt}deg` }}
      transition={{ type: 'spring', damping: 14, stiffness: 160, delay: index * 80 }}
      style={styles.noteSlot}
    >
      <Pressable style={[styles.note, { backgroundColor: tint }]} onPress={onPress}>
        <View style={styles.pin} />
        <Text style={styles.anon}>Anonymous</Text>
        <Text style={styles.noteBody}>{post.body}</Text>
        {SHOW_COMMENTS && (
          <Text style={styles.comments}>💬 {post.comments} replies</Text>
        )}
      </Pressable>
    </MotiView>
  );
}

export default function YouthPinboardForum({ navigation }) {
  const [posts, setPosts] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState(null);
  const [activePost, setActivePost] = useState(null); // note whose thread is open

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPosts(BOARD);
      const fetched = (data?.posts ?? []).map(normalize).sort(newestFirst);
      setPosts(fetched.length > 0 ? fetched : SEED_POSTS);
    } catch (err) {
      setPosts(SEED_POSTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pin = async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      const created = await createPost({ body }, BOARD);
      setPosts((prev) => [normalize(created), ...prev]);
      setDraft('');
    } catch (err) {
      // Keep the draft so the user doesn't lose their note.
      setPostError(
        err?.status === 0
          ? "Couldn't pin — check your connection and try again."
          : 'Pinning failed. Your note was kept — please try again.'
      );
    } finally {
      setPosting(false);
    }
  };

  // Reflect a newly added reply in the note's count without a full refetch.
  const bumpCount = (postId) =>
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comments: p.comments + 1 } : p)));

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
              editable={!posting}
            />
            {postError && <Text style={styles.postError}>{postError}</Text>}
            <Pressable
              onPress={pin}
              disabled={posting}
              style={[styles.pinBtn, posting && styles.pinBtnDisabled]}
            >
              <Text style={styles.pinBtnText}>{posting ? 'Pinning…' : 'Pin it'}</Text>
            </Pressable>
          </View>

          {loading && (
            <View style={styles.stateBox}>
              <ActivityIndicator color={pastel.mintDeep} />
              <Text style={styles.stateText}>Loading notes…</Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>{error}</Text>
              <Pressable onPress={load} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {!loading && !error && posts.length === 0 && (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>No notes yet — pin the first one 🌱</Text>
            </View>
          )}

          {!loading && !error && (
            <View style={styles.grid}>
              {posts.map((p, i) => (
                <Note key={p.id} post={p} index={i} onPress={() => setActivePost(p)} />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <CommentSheet
        visible={!!activePost}
        post={activePost}
        onClose={() => setActivePost(null)}
        onCommentAdded={bumpCount}
      />
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
  pinBtnDisabled: { opacity: 0.5 },
  postError: { color: '#B8403A', fontSize: 12.5, fontWeight: '700', marginTop: 8 },

  stateBox: { width: '100%', alignItems: 'center', paddingVertical: 28, gap: 12 },
  stateText: { color: '#5C4427', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  retryBtn: {
    backgroundColor: pastel.mintDeep,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: rad.pill,
  },
  retryText: { color: pastel.white, fontWeight: '900', fontSize: 13 },
});
