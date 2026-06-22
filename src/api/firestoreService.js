/**
 * firestoreService.js — Firestore read/write helpers for the worker portal.
 *
 * SCHEMA
 * ──────
 * youth_profiles/{firestoreId}          ← one root doc per youth (Path B)
 *   name, caseId, age, membershipStatus, initialRiskLevel, houseConfig,
 *   gridIndex, createdAt, lastSessionAt
 *
 *   sessions/{autoId}                   ← subcollection (Path A appends here)
 *     severity, sourceLabel, activeIssues, rangeStart, rangeEnd,
 *     scrubStats, exportedAt
 *
 * PATH A — "Import New Interactions" from YouthCaseDetail
 *   appendInteractionSession(firestoreId, sessionData)
 *   → addDoc to youth_profiles/{id}/sessions
 *   → youth's house stays fixed; only their timeline grows
 *
 * PATH B — "Add New Youth to Village" from VolunteerHome
 *   createYouthProfile(profileData)
 *   → addDoc to youth_profiles
 *   → spawns a new house node on the village map via onSnapshot
 */

import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

const YOUTH_PROFILES = 'youth_profiles';

function isConfigured() {
  const ok = Boolean(process.env.EXPO_PUBLIC_FB_PROJECT_ID);
  if (!ok) console.warn('[firestoreService] Firebase not configured — skipping write.');
  return ok;
}

function withTimeout(promise, ms = 5000) {
  const t = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Firestore timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, t]);
}

/* ── PATH A: append a session to an existing youth profile ─────── */

/**
 * @param {string} firestoreId  — doc ID of the youth in youth_profiles
 * @param {object} sessionData  — anonymized session payload
 * @returns {Promise<string|null>}  new session doc ID or null on failure
 */
export async function appendInteractionSession(firestoreId, sessionData) {
  if (!isConfigured()) return null;
  try {
    const sessionsRef = collection(db, YOUTH_PROFILES, firestoreId, 'sessions');
    const ref = await withTimeout(
      addDoc(sessionsRef, { ...sessionData, exportedAt: serverTimestamp() })
    );
    // Bump the lastSessionAt timestamp on the root profile doc so the village
    // label always shows when this youth was last engaged.
    await updateDoc(doc(db, YOUTH_PROFILES, firestoreId), {
      lastSessionAt: serverTimestamp(),
    }).catch(() => {}); // non-fatal
    console.log(`[firestoreService] Session appended to ${firestoreId}: ${ref.id}`);
    return ref.id;
  } catch (err) {
    console.error('[firestoreService] appendInteractionSession failed:', err.message);
    return null;
  }
}

/* ── PATH B: create a brand-new youth profile ───────────────────── */

/**
 * Available archetypes for random house assignment.
 * A worker can later customise this from the youth's own room editor.
 */
const HOUSE_STYLES   = ['village', 'mansion', 'futuristic'];
const COLOR_THEMES   = ['Pastel Mint', 'Soft Lavender', 'Amber Wood', 'Arctic Blue', 'Rose Bloom'];
const ROOF_STYLES    = ['Terracotta Tiles', 'Slate', 'Solar Metal', 'Thatch'];
const WINDOW_COLORS  = ['#FFE3A3', '#B8F2E6', '#D9CCF5', '#CDEDF6', '#F7C9D9'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function generateHouseConfig() {
  return {
    houseStyle:       pick(HOUSE_STYLES),
    colorTheme:       pick(COLOR_THEMES),
    roofStyle:        pick(ROOF_STYLES),
    windowColor:      pick(WINDOW_COLORS),
    windowIntensity:  parseFloat((0.5 + Math.random() * 0.8).toFixed(2)),
    props: { flowers: Math.random() > 0.5, lamps: Math.random() > 0.7, pond: false },
  };
}

/**
 * Create a new youth profile and spawn their house on the village map.
 *
 * @param {{
 *   name: string,
 *   caseId: string,
 *   age: string,
 *   membershipStatus: string,
 *   initialRiskLevel: number,
 *   gridIndex: number,
 * }} profileData
 * @returns {Promise<string|null>}  new profile doc ID or null on failure
 */
export async function createYouthProfile(profileData) {
  if (!isConfigured()) return null;
  try {
    const ref = await withTimeout(
      addDoc(collection(db, YOUTH_PROFILES), {
        ...profileData,
        houseConfig: generateHouseConfig(),
        createdAt: serverTimestamp(),
        lastSessionAt: serverTimestamp(),
      })
    );
    console.log(`[firestoreService] Youth profile created: ${ref.id}`);
    return ref.id;
  } catch (err) {
    console.error('[firestoreService] createYouthProfile failed:', err.message);
    return null;
  }
}

/* ── Village map subscription ───────────────────────────────────── */

/**
 * Real-time listener on youth_profiles ordered by creation date.
 * VolunteerHome uses this to keep the village grid in sync.
 *
 * @param {(profiles: object[]) => void} onData
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeYouthProfiles(onData, onError) {
  if (!isConfigured()) return () => {};
  try {
    const q = query(collection(db, YOUTH_PROFILES), orderBy('createdAt', 'asc'));
    return onSnapshot(
      q,
      (snap) => onData(snap.docs.map((d) => ({ firestoreId: d.id, ...d.data() }))),
      (err) => {
        console.error('[firestoreService] subscribeYouthProfiles error:', err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.error('[firestoreService] subscribeYouthProfiles setup failed:', err);
    return () => {};
  }
}

/* ── Youth identity lookup ──────────────────────────────────────── */

/**
 * Query youth_profiles for a document whose phoneNumber matches.
 * Returns { firestoreId, ...profileData } on match, or null if not found.
 *
 * @param {string} phoneNumber  normalised digits only (e.g. "91234567")
 * @returns {Promise<object|null>}
 */
export async function lookupYouthByPhone(phoneNumber) {
  if (!isConfigured()) return null;
  try {
    const q = query(
      collection(db, YOUTH_PROFILES),
      where('phoneNumber', '==', phoneNumber.replace(/\D/g, ''))
    );
    const snap = await withTimeout(getDocs(q), 6000);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { firestoreId: d.id, ...d.data() };
  } catch (err) {
    console.error('[firestoreService] lookupYouthByPhone failed:', err.message);
    return null;
  }
}

/**
 * Fetch a single youth profile by its Firestore document ID.
 * Used by YouthCaseDetail to populate the Edit Details form.
 *
 * @param {string} firestoreId
 * @returns {Promise<object|null>}
 */
export async function fetchYouthProfile(firestoreId) {
  if (!isConfigured() || !firestoreId) return null;
  try {
    const snap = await withTimeout(getDoc(doc(db, YOUTH_PROFILES, firestoreId)), 5000);
    if (!snap.exists()) return null;
    return { firestoreId: snap.id, ...snap.data() };
  } catch (err) {
    console.error('[firestoreService] fetchYouthProfile failed:', err.message);
    return null;
  }
}

/**
 * Update an existing youth profile document (worker edits name / age / phone / status).
 *
 * @param {string} firestoreId
 * @param {object} updates  partial fields to merge
 * @returns {Promise<boolean>}
 */
export async function updateYouthProfile(firestoreId, updates) {
  if (!isConfigured() || !firestoreId) return false;
  try {
    await withTimeout(
      updateDoc(doc(db, YOUTH_PROFILES, firestoreId), {
        ...updates,
        updatedAt: serverTimestamp(),
      }),
      5000
    );
    console.log(`[firestoreService] Profile updated: ${firestoreId}`);
    return true;
  } catch (err) {
    console.error('[firestoreService] updateYouthProfile failed:', err.message);
    return false;
  }
}

/**
 * Write an updated houseConfig to a youth's profile document.
 * Called by YouthExteriorEdit after the youth applies customisation changes.
 *
 * @param {string} firestoreId
 * @param {object} houseConfig
 * @returns {Promise<boolean>}
 */
export async function syncHouseConfig(firestoreId, houseConfig) {
  if (!isConfigured() || !firestoreId) return false;
  try {
    await withTimeout(
      updateDoc(doc(db, YOUTH_PROFILES, firestoreId), {
        houseConfig,
        updatedAt: serverTimestamp(),
      }),
      5000
    );
    console.log(`[firestoreService] houseConfig synced for ${firestoreId}`);
    return true;
  } catch (err) {
    console.error('[firestoreService] syncHouseConfig failed:', err.message);
    return false;
  }
}

/* ── Legacy export (kept for backward compat) ───────────────────── */
export async function exportCaseSummaryToFirestore(payload) {
  const { firestoreId, ...sessionData } = payload;
  if (firestoreId) return appendInteractionSession(firestoreId, sessionData);
  // No profile ID — write to flat legacy collection so data is never lost.
  if (!isConfigured()) return null;
  try {
    const ref = await withTimeout(
      addDoc(collection(db, 'youth_cases'), { ...sessionData, exportedAt: serverTimestamp() })
    );
    return ref.id;
  } catch (err) {
    console.error('[firestoreService] legacy export failed:', err.message);
    return null;
  }
}
