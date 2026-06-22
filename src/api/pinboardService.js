/**
 * pinboardService.js — Firestore-backed pinboard posts & comments.
 *
 * Replaces the engagement-service (MongoDB on :4004) for the youth pinboard
 * so the app works without a local backend server.
 *
 * Collections:
 *   pinboard_posts/{autoId}                    { board, body, commentCount, createdAt }
 *   pinboard_posts/{postId}/comments/{autoId}  { body, createdAt }
 */

import {
  collection,
  addDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
  updateDoc,
  doc,
  increment,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

const POSTS = 'pinboard_posts';

function toPost(id, data) {
  return {
    id,
    board: data.board,
    body: data.body,
    comments: data.commentCount ?? 0,
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
  };
}

function toComment(id, data) {
  return {
    id,
    body: data.body,
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
  };
}

export async function listPosts(board = 'youth_pinboard') {
  const q = query(
    collection(db, POSTS),
    where('board', '==', board),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return { posts: snap.docs.map((d) => toPost(d.id, d.data())) };
}

export async function createPost({ body, author }, board = 'youth_pinboard') {
  const ref = await addDoc(collection(db, POSTS), {
    board,
    body,
    author: author ?? 'anon',
    commentCount: 0,
    createdAt: serverTimestamp(),
  });
  return toPost(ref.id, { board, body, commentCount: 0, createdAt: { toMillis: () => Date.now() } });
}

export async function listComments(postId) {
  const q = query(
    collection(db, POSTS, postId, 'comments'),
    orderBy('createdAt', 'asc')
  );
  const snap = await getDocs(q);
  return { comments: snap.docs.map((d) => toComment(d.id, d.data())) };
}

export async function createComment(postId, { body, author }) {
  const ref = await addDoc(collection(db, POSTS, postId, 'comments'), {
    body,
    author: author ?? 'anon',
    createdAt: serverTimestamp(),
  });
  // Keep denormalised count in sync.
  await updateDoc(doc(db, POSTS, postId), { commentCount: increment(1) }).catch(() => {});
  return toComment(ref.id, { body, createdAt: { toMillis: () => Date.now() } });
}
