/**
 * engagementService.js — client for engagement-service (:4004).
 * Forum posts + threaded comments, backed by MongoDB.
 *
 * `board` separates the two anonymous boards:
 *   'youth_pinboard'  — youth Pinboard
 *   'worker_forum'    — worker/volunteer forum
 */

import { baseUrl } from './config';
import { http } from './httpClient';

export const BOARDS = { YOUTH: 'youth_pinboard', WORKER: 'worker_forum' };

/** @param {string} board @returns {Promise<{ posts: Array<object> }>} */
export function listPosts(board = BOARDS.YOUTH) {
  return http.get(`${baseUrl('engagement')}/forum/posts?board=${encodeURIComponent(board)}`);
}

/** @param {{ body:string, author?:string }} post @param {string} board */
export function createPost(post, board = BOARDS.YOUTH) {
  return http.post(`${baseUrl('engagement')}/forum/posts`, { ...post, board });
}

/** @param {string} postId @returns {Promise<{ comments: Array<object> }>} */
export function listComments(postId) {
  return http.get(`${baseUrl('engagement')}/forum/posts/${postId}/comments`);
}

/** @param {string} postId @param {{ body:string, author?:string }} comment */
export function createComment(postId, comment) {
  return http.post(`${baseUrl('engagement')}/forum/posts/${postId}/comments`, comment);
}

export default { listPosts, createPost, listComments, createComment, BOARDS };
