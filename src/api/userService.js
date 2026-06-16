/**
 * userService.js — client for user-service (:4001).
 * Auth + profile. Backend routes are currently lightweight stubs.
 */

import { baseUrl } from './config';
import { http } from './httpClient';

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token:string, user:object }>}
 */
export function login(email, password) {
  return http.post(`${baseUrl('user')}/auth/login`, { email, password });
}

/** @param {string} id */
export function getUser(id) {
  return http.get(`${baseUrl('user')}/users/${id}`);
}

export default { login, getUser };
