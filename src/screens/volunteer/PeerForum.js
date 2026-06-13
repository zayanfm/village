/**
 * PeerForum.js — Anonymous peer community (prototype)
 *
 * A lightweight feed where users view and publish cards. Every entry is forced
 * to display as "Anonymous" — no author identity is ever rendered. Includes a
 * structured comments section.
 *
 * DEVELOPER TOGGLE
 * ----------------
 * Flip SHOW_COMMENTS to false to disable the entire comment section app-wide
 * (intended for the future youth-app deployment where comments may be off).
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import GardenBackground from '../../components/GardenBackground';
import GlassCard from '../../components/GlassCard';
import { palette, radius, spacing, typography } from '../../theme/theme';

// 🔧 DEV CONFIG — set to false to remove the comments section entirely.
const SHOW_COMMENTS = true;

const SEED_POSTS = [
  {
    id: 'p1',
    body: 'Finals week is rough. Anyone else just taking it one hour at a time? 🌱',
    timestamp: '5m ago',
    comments: [
      { id: 'c1', body: 'Same here. Tiny breaks help me a lot.' },
      { id: 'c2', body: 'One hour at a time is totally valid 💚' },
    ],
  },
  {
    id: 'p2',
    body: 'Made up with a friend after a long argument today. Small wins count.',
    timestamp: '1h ago',
    comments: [{ id: 'c3', body: 'Love this for you.' }],
  },
];

function CommentSection({ comments }) {
  if (!SHOW_COMMENTS) return null; // developer-disabled
  return (
    <View style={styles.commentBlock}>
      <Text style={styles.commentHeader}>Comments</Text>
      {comments.length === 0 ? (
        <Text style={styles.noComments}>No replies yet.</Text>
      ) : (
        comments.map((c) => (
          <View key={c.id} style={styles.commentRow}>
            <Text style={styles.anonTag}>Anonymous</Text>
            <Text style={styles.commentBody}>{c.body}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function PostCard({ post, index }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 420, delay: index * 100 }}
    >
      <GlassCard style={styles.post} radiusSize={radius.lg}>
        <View style={styles.postHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarGlyph}>❀</Text>
          </View>
          <View>
            <Text style={styles.anonName}>Anonymous</Text>
            <Text style={styles.postTime}>{post.timestamp}</Text>
          </View>
        </View>
        <Text style={styles.postBody}>{post.body}</Text>
        <CommentSection comments={post.comments} />
      </GlassCard>
    </MotiView>
  );
}

export default function PeerForum() {
  const [posts, setPosts] = useState(SEED_POSTS);
  const [draft, setDraft] = useState('');

  const publish = () => {
    const text = draft.trim();
    if (!text) return;
    setPosts((prev) => [
      { id: `p-${Date.now()}`, body: text, timestamp: 'Just now', comments: [] },
      ...prev,
    ]);
    setDraft('');
  };

  return (
    <GardenBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.kicker}>PEER COMMUNITY</Text>
          <Text style={styles.title}>The Greenhouse</Text>
          <Text style={styles.subtitle}>Share anonymously. Be kind. 🌿</Text>

          <GlassCard style={styles.composer} radiusSize={radius.lg}>
            <TextInput
              style={styles.composerInput}
              value={draft}
              onChangeText={setDraft}
              placeholder="Plant a thought… (posted anonymously)"
              placeholderTextColor={palette.fog}
              multiline
            />
            <Pressable onPress={publish} style={styles.publishBtn}>
              <Text style={styles.publishText}>Publish</Text>
            </Pressable>
          </GlassCard>

          {posts.map((post, i) => (
            <PostCard key={post.id} post={post} index={i} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </GardenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 140 },
  kicker: { ...typography.caption, color: palette.mint },
  title: { ...typography.display, marginTop: 4 },
  subtitle: { ...typography.body, color: palette.fog, marginTop: 6, marginBottom: spacing.lg },

  composer: { marginBottom: spacing.lg },
  composerInput: {
    color: palette.white,
    fontSize: 15,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  publishBtn: {
    alignSelf: 'flex-end',
    marginTop: 12,
    backgroundColor: palette.mint,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  publishText: { color: palette.ink, fontWeight: '900', fontSize: 14 },

  post: { marginBottom: spacing.md },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(110,231,183,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarGlyph: { color: palette.mint, fontSize: 18 },
  anonName: { color: palette.white, fontWeight: '800', fontSize: 14.5 },
  postTime: { color: palette.fog, fontSize: 12, marginTop: 1 },
  postBody: { color: palette.cloud, fontSize: 15.5, lineHeight: 22 },

  commentBlock: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingTop: 12,
  },
  commentHeader: { color: palette.fog, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 10 },
  noComments: { color: palette.fog, fontSize: 13, fontStyle: 'italic' },
  commentRow: { marginBottom: 10 },
  anonTag: { color: palette.mint, fontSize: 11.5, fontWeight: '800', marginBottom: 2 },
  commentBody: { color: palette.cloud, fontSize: 14, lineHeight: 19 },
});
