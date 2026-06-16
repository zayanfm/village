/**
 * houseService.js — client for house-service (:4002).
 * Youth house design / interior.
 */

import { baseUrl } from './config';
import { http } from './httpClient';

/** @param {string} youthId */
export function getHouse(youthId) {
  return http.get(`${baseUrl('house')}/youth/${youthId}/house`);
}

/**
 * @param {string} youthId
 * @param {object} design
 */
export function saveHouse(youthId, design) {
  return http.put(`${baseUrl('house')}/youth/${youthId}/house`, design);
}

export default { getHouse, saveHouse };
