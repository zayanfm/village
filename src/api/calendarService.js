/**
 * calendarService.js — client for calendar-service (:4005).
 */

import { baseUrl } from './config';
import { http } from './httpClient';

/** @returns {Promise<{ events: Array<object> }>} */
export function listEvents() {
  return http.get(`${baseUrl('calendar')}/events`);
}

/**
 * Create a calendar event / milestone.
 * @param {{ title:string, start:string, durationMin?:number }} event
 *   `start` is an ISO datetime string.
 * @returns {Promise<object>} the created event
 */
export function createEvent(event) {
  return http.post(`${baseUrl('calendar')}/events`, event);
}

export default { listEvents, createEvent };
