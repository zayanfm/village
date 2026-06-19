/**
 * journalArchive.js — client-side archive of PERMANENT journal entries.
 *
 * Storage strategy (two layers):
 *   1. AsyncStorage — local cache, works offline, written immediately on seal
 *   2. Backend GET /entries — authoritative source, fetched on archive open
 *
 * On load: tries backend first, merges with local, saves merged result back.
 * On write: saves to AsyncStorage immediately so the archive is never empty
 *           even if the backend is unreachable.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { listRemoteEntries } from './journalService';

const ARCHIVE_KEY = 'unigarden:journal:archive:v1';

/** Read local archive from AsyncStorage. */
async function readLocal() {
  try {
    const raw = await AsyncStorage.getItem(ARCHIVE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Write merged list back to AsyncStorage. */
async function writeLocal(list) {
  try {
    await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(list));
  } catch {}
}

/** Merge two entry arrays by id, remote wins on conflict. */
function merge(local, remote) {
  const map = new Map();
  for (const e of local) map.set(e.id, e);
  for (const e of remote) map.set(e.id, e); // remote overwrites local
  return [...map.values()].sort((a, b) => (b.committedAt ?? 0) - (a.committedAt ?? 0));
}

/**
 * Load all permanent entries — tries backend first, falls back to local.
 * @returns {Promise<Array<{ id, preview, body?, committedAt }>>}
 */
export async function loadArchive() {
  const local = await readLocal();

  try {
    const remote = await listRemoteEntries();
    if (remote.length > 0) {
      const merged = merge(local, remote);
      await writeLocal(merged); // keep local in sync
      return merged;
    }
  } catch {
    // Backend unreachable — fall through to local
  }

  return [...local].sort((a, b) => (b.committedAt ?? 0) - (a.committedAt ?? 0));
}

/**
 * Save an entry to local AsyncStorage immediately (before or after network).
 * Idempotent on id.
 * @param {{ id, preview, body?, committedAt }} entry
 */
export async function appendArchiveEntry(entry) {
  const existing = await readLocal();
  if (existing.some((e) => e.id === entry.id)) {
    // Update in place if already exists
    const updated = existing.map((e) => (e.id === entry.id ? { ...e, ...entry } : e));
    await writeLocal(updated);
  } else {
    existing.push(entry);
    await writeLocal(existing);
  }
}

/**
 * Replace a temp local entry (by oldId) with the server-confirmed entry.
 * Used after backend sync to swap the local-only id with the real server id.
 */
export async function replaceArchiveEntry(oldId, newEntry) {
  const existing = await readLocal();
  const filtered = existing.filter((e) => e.id !== oldId);
  if (!filtered.some((e) => e.id === newEntry.id)) {
    filtered.push(newEntry);
  }
  await writeLocal(filtered);
}

export default { loadArchive, appendArchiveEntry, replaceArchiveEntry };
