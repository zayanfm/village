/**
 * PeerForum.js — Worker Pinboard Monitor (read-only)
 *
 * Repurposed from a separate worker board into a MONITORING view of the youth
 * Pinboard: it loads the exact same feed as YouthPinboardForum (board
 * 'youth_pinboard') so volunteers can watch what youth are posting. Read-only
 * for now — no composing notes, and tapping a note opens its replies in a
 * view-only sheet (no replying).
 *
 * Shares the youth corkboard aesthetic + tokens so the two portals stay visually
 * aligned. SHOW_COMMENTS preserves the app-wide reply-line toggle.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { listPosts, BOARDS } from '../../api/engagementService';
import CommentSheet from '../../components/CommentSheet';
import { pastel, youthRadius as rad } from '../youth/youthTheme';

// Monitor the YOUTH pinboard — same feed the youth see.
const BOARD = BOARDS.YOUTH;

// 🔧 DEV CONFIG — set false to hide the comment line on every note app-wide.
const SHOW_COMMENTS = true;

const NOTE_TINTS = ['#FFF6D8', '#D9F2E6', '#F7D9E3', '#E2DBF7', '#FCE6C8'];

// Normalize a backend post ({ id, body, comments, createdAt }) for display.
const normalize = (p) => ({ id: p.id, body: p.body, comments: p.comments ?? 0, createdAt: p.createdAt });
const newestFirst = (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0);

function Note({ post, index, onPress }) {
  const tilt = ((index % 3) - 1) * 2.5;
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
        {SHOW_COMMENTS && <Text style={styles.comments}>💬 {post.comments} replies</Text>}
      </Pressable>
    </MotiView>
  );
}

export default function PeerForum() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activePost, setActivePost] = useState(null); // note whose thread is open

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPosts(BOARD);
      setPosts((data?.posts ?? []).map(normalize).sort(newestFirst));
    } catch (err) {
      setError(
        err?.status === 0
          ? "Couldn't reach the pinboard — check your connection."
          : 'Failed to load notes. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.kicker}>YOUTH PINBOARD · MONITOR</Text>
          <Text style={styles.title}>The Pinboard</Text>
          <Text style={styles.subtitle}>Viewing the youth community board 👁 (read-only)</Text>
        </View>

        <ScrollView contentContainerStyle={styles.board} showsVerticalScrollIndicator={false}>
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
              <Text style={styles.stateText}>No notes on the youth pinboard yet.</Text>
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
        readOnly
      />
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
