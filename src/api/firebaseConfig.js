/**
 * firebaseConfig.js — Firebase JS SDK initializer (shared singleton).
 *
 * HOW TO CONFIGURE
 * ----------------
 * 1. Go to https://console.firebase.google.com → your project → Project Settings
 *    → Your apps → Add app (Web) → copy the firebaseConfig object.
 * 2. Set each value as an EXPO_PUBLIC_ environment variable in your .env file:
 *
 *      EXPO_PUBLIC_FB_API_KEY=AIza...
 *      EXPO_PUBLIC_FB_AUTH_DOMAIN=your-project.firebaseapp.com
 *      EXPO_PUBLIC_FB_PROJECT_ID=your-project-id
 *      EXPO_PUBLIC_FB_STORAGE_BUCKET=your-project.appspot.com
 *      EXPO_PUBLIC_FB_MESSAGING_SENDER_ID=123456789
 *      EXPO_PUBLIC_FB_APP_ID=1:123456789:web:abc123
 *
 * 3. Restart the Metro bundler — Expo reads EXPO_PUBLIC_ vars at bundle time.
 *
 * FIRESTORE RULES (minimum for prototype)
 * ----------------------------------------
 * In Firebase Console → Firestore → Rules:
 *
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /youth_cases/{doc} {
 *         allow read, write: if true; // ← tighten before production
 *       }
 *     }
 *   }
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FB_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FB_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FB_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FB_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FB_APP_ID,
};

// Guard: only initialize once (Metro hot-reload safe).
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app);
export default app;
