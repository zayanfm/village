/**
 * CommentSheet.js — reusable comment-thread modal for the forum boards.
 *
 * Shared by YouthPinboardForum and PeerForum. Opens for a single post, lazily
 * fetches its comments (GET /forum/posts/:id/comments), and lets the user add a
 * reply (POST …/comments). Replies stay anonymous, matching the boards.
 *
 * Props:
 *   visible          boolean
 *   post             { id, body } | null  — the note being viewed
 *   onClose          () => void
 *   onCommentAdded   (postId) => void     — lets the parent bump its count
 *   readOnly         boolean              — monitoring mode: view replies, no compose
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { listComments, createComment } from '../api/engagementService';
import { pastel, youthRadius as rad } from '../screens/youth/youthTheme';

export default function CommentSheet({ visible, post, onClose, onCommentAdded, readOnly = false }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  const postId = post?.id;

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listComments(postId);
      setComments(data?.comments ?? []);
    } catch (err) {
      setError(
        err?.status === 0
          ? "Couldn't reach the thread — check your connection."
          : 'Failed to load replies. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [postId]);

  // (Re)load whenever the sheet opens for a post; reset transient state on close.
  useEffect(() => {
    if (visible && postId) {
      load();
    } else if (!visible) {
      setComments([]);
      setDraft('');
      setSendError(null);
      setError(null);
    }
  }, [visible, postId, load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const created = await createComment(postId, { body });
      setComments((prev) => [...prev, created]);
      setDraft('');
      onCommentAdded?.(postId);
    } catch (err) {
      setSendError(
        err?.status === 0
          ? "Couldn't send — check your connection and try again."
          : 'Reply failed. Your text was kept — please try again.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheet}
        >
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <Text style={styles.heading}>Replies</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Done</Text>
            </Pressable>
          </View>

          {post?.body ? <Text style={styles.original}>{post.body}</Text> : null}

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {loading && (
              <View style={styles.stateBox}>
                <ActivityIndicator color={pastel.mintDeep} />
                <Text style={styles.stateText}>Loading replies…</Text>
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

            {!loading && !error && comments.length === 0 && (
              <View style={styles.stateBox}>
                <Text style={styles.stateText}>No replies yet — be the first 🌱</Text>
              </View>
            )}

            {!loading &&
              !error &&
              comments.map((c) => (
                <View key={c.id} style={styles.comment}>
                  <Text style={styles.commentAuthor}>Anonymous</Text>
                  <Text style={styles.commentBody}>{c.body}</Text>
                </View>
              ))}
          </ScrollView>

          {readOnly ? (
            <Text style={styles.monitorNote}>👁 Monitoring view — replies are read-only.</Text>
          ) : (
            <>
              {sendError ? <Text style={styles.sendError}>{sendError}</Text> : null}
              <View style={styles.composeRow}>
                <TextInput
                  style={styles.input}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Add an anonymous reply…"
                  placeholderTextColor={pastel.sub}
                  multiline
                  editable={!sending}
                />
                <Pressable
                  onPress={send}
                  disabled={sending || !draft.trim()}
                  style={[styles.sendBtn, (sending || !draft.trim()) && styles.sendBtnDisabled]}
                >
                  <Text style={styles.sendText}>{sending ? '…' : 'Send'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: pastel.cream,
    borderTopLeftRadius: rad.xl,
    borderTopRightRadius: rad.xl,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    maxHeight: '78%',
  },
  grabber: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: pastel.clayDeep,
    marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: pastel.ink, fontWeight: '900', fontSize: 20 },
  close: { color: pastel.mintDeep, fontWeight: '900', fontSize: 15 },
  original: {
    color: pastel.ink,
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: pastel.clay,
    padding: 12,
    borderRadius: rad.sm,
    marginTop: 10,
  },

  list: { marginTop: 12 },
  listContent: { paddingBottom: 8 },
  comment: {
    backgroundColor: pastel.white,
    borderRadius: rad.sm,
    padding: 12,
    marginBottom: 10,
  },
  commentAuthor: { color: pastel.mintDeep, fontWeight: '800', fontSize: 11, marginBottom: 4 },
  commentBody: { color: pastel.ink, fontSize: 14, lineHeight: 19, fontWeight: '600' },

  stateBox: { alignItems: 'center', paddingVertical: 26, gap: 12 },
  stateText: { color: pastel.sub, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  retryBtn: {
    backgroundColor: pastel.mintDeep,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: rad.pill,
  },
  retryText: { color: pastel.white, fontWeight: '900', fontSize: 13 },

  sendError: { color: '#B8403A', fontSize: 12.5, fontWeight: '700', marginTop: 8 },
  monitorNote: {
    color: pastel.sub,
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
  },
  composeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 10 },
  input: {
    flex: 1,
    color: pastel.ink,
    fontSize: 15,
    minHeight: 44,
    maxHeight: 110,
    backgroundColor: pastel.white,
    borderRadius: rad.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  sendBtn: {
    backgroundColor: pastel.mintDeep,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: rad.pill,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: { color: pastel.white, fontWeight: '900', fontSize: 14 },
});
