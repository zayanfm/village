/**
 * YouthSessionContext.js — Youth-side identity and link state.
 *
 * STATE MACHINE
 * ─────────────
 * Initial (no profile yet):
 *   userName=null, userPhone=null, isLinkedToWorker=false, firestoreId=null
 *
 * After YouthProfileSetup saves:
 *   setupProfile(name, phone) is called. It:
 *     1. Immediately stores name + phone (user enters the app right away)
 *     2. Fires a BACKGROUND Firestore lookupYouthByPhone query
 *     3. On resolve:
 *        MATCH   → firestoreId set, isLinkedToWorker=true, profile loaded
 *        NO MATCH → firestoreId stays null, isLinkedToWorker=false
 *
 * YouthExteriorEdit watches firestoreId via useEffect. If it transitions from
 * null → a real ID (background lookup resolved), the screen re-seeds the house
 * config from the matched Firestore profile automatically.
 *
 * isLinkedToWorker  true  → 3D customisation writes sync to Firestore
 *                   false → sandbox/local only, no village map writes
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { defaultYouthHouseConfig } from '../screens/youth/youthTheme';
import { lookupYouthByPhone } from '../api/firestoreService';

const YouthSessionContext = createContext(null);

export function YouthSessionProvider({ children }) {
  // ── Local profile (set immediately on setup, no network wait) ──
  const [userName, setUserName]   = useState(null);
  const [userPhone, setUserPhone] = useState(null);

  // ── Firestore link state (resolved async after setup) ──────────
  const [firestoreId, setFirestoreId]           = useState(null);
  const [profile, setProfile]                   = useState(null);
  const [isLinkedToWorker, setIsLinkedToWorker] = useState(false);
  const [linkResolved, setLinkResolved]         = useState(false); // true once lookup finished

  // Prevent double-lookup if setupProfile is called more than once
  const lookupInFlight = useRef(false);

  /**
   * Called by YouthProfileSetup on "Save Profile & Enter Hub".
   * Stores the local profile immediately so navigation can proceed,
   * then fires a background Firestore query to attempt identity linking.
   */
  const setupProfile = useCallback(async (name, phone) => {
    if (lookupInFlight.current) return;
    lookupInFlight.current = true;

    setUserName(name);
    setUserPhone(phone);
    setLinkResolved(false);

    // Background lookup — caller does NOT await this
    try {
      const result = await lookupYouthByPhone(phone);
      if (result) {
        setFirestoreId(result.firestoreId);
        setProfile(result);
        setIsLinkedToWorker(true);
      } else {
        setFirestoreId(null);
        setProfile(null);
        setIsLinkedToWorker(false);
      }
    } catch {
      setIsLinkedToWorker(false);
    } finally {
      setLinkResolved(true);
      lookupInFlight.current = false;
    }
  }, []);

  /** Worker-side compat: directly set a matched session (used by YouthLogin legacy path). */
  const loginAsYouth = useCallback((id, profileData) => {
    setFirestoreId(id);
    setProfile(profileData);
    setIsLinkedToWorker(true);
    setLinkResolved(true);
    if (profileData?.name) setUserName(profileData.name);
  }, []);

  /** Worker-side compat: explicitly enter guest/sandbox mode. */
  const loginAsGuest = useCallback(() => {
    setFirestoreId(null);
    setProfile(null);
    setIsLinkedToWorker(false);
    setLinkResolved(true);
  }, []);

  /** Reset everything (re-enter profile setup). */
  const logout = useCallback(() => {
    setUserName(null);
    setUserPhone(null);
    setFirestoreId(null);
    setProfile(null);
    setIsLinkedToWorker(false);
    setLinkResolved(false);
    lookupInFlight.current = false;
  }, []);

  /**
   * Cache the new houseConfig locally after the youth applies customisation
   * changes, so screens don't need a Firestore round-trip to re-read it.
   */
  const updateLocalHouseConfig = useCallback((newConfig) => {
    setProfile((prev) => prev ? { ...prev, houseConfig: newConfig } : prev);
  }, []);

  /** Resolved houseConfig — merges saved config over the default. */
  const houseConfig = useMemo(() => {
    if (profile?.houseConfig) return { ...defaultYouthHouseConfig, ...profile.houseConfig };
    return defaultYouthHouseConfig;
  }, [profile]);

  /** isGuest kept for backward compat (inverse of isLinkedToWorker). */
  const isGuest = !isLinkedToWorker;

  const value = useMemo(() => ({
    // profile fields
    userName,
    userPhone,
    firestoreId,
    profile,
    houseConfig,
    // link state
    isLinkedToWorker,
    isGuest,
    linkResolved,
    // actions
    setupProfile,
    loginAsYouth,
    loginAsGuest,
    logout,
    updateLocalHouseConfig,
  }), [
    userName, userPhone, firestoreId, profile, houseConfig,
    isLinkedToWorker, isGuest, linkResolved,
    setupProfile, loginAsYouth, loginAsGuest, logout, updateLocalHouseConfig,
  ]);

  return (
    <YouthSessionContext.Provider value={value}>
      {children}
    </YouthSessionContext.Provider>
  );
}

export function useYouthSession() {
  const ctx = useContext(YouthSessionContext);
  if (!ctx) throw new Error('useYouthSession must be used inside <YouthSessionProvider>');
  return ctx;
}

export default YouthSessionContext;
