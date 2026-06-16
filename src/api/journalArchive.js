/**
 * journalArchive.js — client-side archive of PERMANENT journal entries.
 *
 * PDPA boundary (important):
 *   - This stores ONLY permanent (sealed) entries — the ones the youth chose to
 *     keep. It is the durable, on-device archive backing the Archive view.
 *   - The TEMPORARY journal MUST NEVER be written here. Its text lives only in
 *     volatile React state and is flushed on submit (see
 *     VolatileTranscriptContext.flushJournalDraft). Nothing in this module is
 *     ever called from the temporary path.
 *
 * Storage: AsyncStorage (local to the device). The backend journaling-service
 * remains the encrypted system of record; this mirror makes past entries
 * viewable offline without a round-trip.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ARCHIVE_KEY = 'unigarden:journal:archive:v1';

/**
 * Read all archived permanent entries, newest first.
 * @returns {Promise<Array<{ id:string, preview:string, body?:string, committedAt:number }>>}
 */
export async function loadArchive() {
  try {
    const raw = await AsyncStorage.getItem(ARCHIVE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) => (b.committedAt ?? 0) - (a.committedAt ?? 0));
  } catch {
    return [];
  }
}

/**
 * Append a permanent entry to the archive. Idempotent on `id`.
 * @param {{ id:string, preview:string, body?:string, committedAt:number }} entry
 * @returns {Promise<void>}
 */
export async function appendArchiveEntry(entry) {
  const raw = await AsyncStorage.getItem(ARCHIVE_KEY);
  const list = raw ? JSON.parse(raw) : [];
  const existing = Array.isArray(list) ? list : [];
  if (existing.some((e) => e.id === entry.id)) return; // dedupe
  existing.push(entry);
  await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(existing));
}

export default { loadArchive, appendArchiveEntry };
