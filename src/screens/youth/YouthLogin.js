/**
 * YouthLogin.js — Youth portal entry screen.
 *
 * The youth enters their phone number. A Firestore query checks whether a
 * worker has already registered them in youth_profiles.
 *
 * SCENARIO A — MATCHED YOUTH
 *   Phone found → loginAsYouth(id, profile) → navigate to YouthExteriorEdit
 *   with their saved houseConfig. Their customisation changes write back to
 *   the same Firestore doc, updating the worker's village map in real-time.
 *
 * SCENARIO B — GUEST / SANDBOX
 *   Phone not found → loginAsGuest() → navigate to YouthExteriorEdit with the
 *   default house config. Changes are local-only and never reach the village.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { lookupYouthByPhone } from '../../api/firestoreService';
import { useYouthSession } from '../../context/YouthSessionContext';
import { pastel, youthRadius as rad } from './youthTheme';

/* ─── Helpers ────────────────────────────────────────────────────── */

/** Strip everything except digits and leading +. */
function normalisePhone(raw) {
  return raw.replace(/[^\d]/g, '');
}

function isPlausible(digits) {
  // Accept 8-digit SG numbers or with +65 prefix (10 digits: 65 + 8).
  return digits.length === 8 || (digits.length === 10 && digits.startsWith('65'));
}

export default function YouthLogin({ navigation }) {
  const { loginAsYouth, loginAsGuest } = useYouthSession();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const digits = normalisePhone(phone);
  const canSubmit = isPlausible(digits) && !loading;

  const handleVerify = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const result = await lookupYouthByPhone(digits);

    if (result) {
      // Scenario A — matched youth
      loginAsYouth(result.firestoreId, result);
      navigation.replace('YouthExteriorEdit');
    } else {
      // Scenario B — no record found; offer guest mode
      setError(null);
      setLoading(false);
      // Show the "enter as guest" nudge rather than an error
      setError('__GUEST_PROMPT__');
    }
    setLoading(false);
  };

  const enterAsGuest = () => {
    loginAsGuest();
    navigation.replace('YouthExteriorEdit');
  };

  return (
    <View style={styles.root}>
      {/* Pastel gradient background matching youth portal palette */}
      <LinearGradient
        colors={['#E8F8F5', '#D6EEF8', '#EDE6F8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <View style={styles.center}>
            {/* Logo / title */}
            <MotiView
              from={{ opacity: 0, translateY: -20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'spring', damping: 18, stiffness: 160 }}
            >
              <Text style={styles.logo}>🌱</Text>
              <Text style={styles.appName}>UniGarden</Text>
              <Text style={styles.tagline}>Your safe space. Your home.</Text>
            </MotiView>

            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'spring', damping: 18, stiffness: 160, delay: 120 }}
              style={styles.card}
            >
              <Text style={styles.cardTitle}>Enter your phone number</Text>
              <Text style={styles.cardSub}>
                We'll check if your youth worker has set up your space.
              </Text>

              <View style={styles.inputRow}>
                <View style={styles.prefix}>
                  <Text style={styles.prefixText}>+65</Text>
                </View>
                <TextInput
                  style={styles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="e.g. 9123 4567"
                  placeholderTextColor={pastel.sub}
                  keyboardType="phone-pad"
                  maxLength={12}
                  autoFocus
                />
              </View>

              {/* Error / guest prompt */}
              {error === '__GUEST_PROMPT__' && (
                <MotiView
                  from={{ opacity: 0, translateY: -6 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: 'timing', duration: 260 }}
                  style={styles.promptBox}
                >
                  <Text style={styles.promptText}>
                    No registered profile found for this number.
                  </Text>
                  <Pressable onPress={enterAsGuest} style={styles.guestBtn}>
                    <Text style={styles.guestBtnText}>Continue as Guest →</Text>
                  </Pressable>
                </MotiView>
              )}
              {error && error !== '__GUEST_PROMPT__' && (
                <Text style={styles.errorText}>{error}</Text>
              )}

              {/* Verify button */}
              <Pressable
                onPress={handleVerify}
                disabled={!canSubmit}
                style={[styles.verifyWrap, !canSubmit && styles.verifyDisabled]}
              >
                <LinearGradient
                  colors={[pastel.mint, pastel.mintDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.verifyBtn}
                >
                  {loading ? (
                    <View style={styles.verifyLoading}>
                      <ActivityIndicator color={pastel.ink} size="small" />
                      <Text style={[styles.verifyText, { marginLeft: 10 }]}>Checking…</Text>
                    </View>
                  ) : (
                    <Text style={styles.verifyText}>Verify & Enter Hub →</Text>
                  )}
                </LinearGradient>
              </Pressable>

              <Pressable onPress={enterAsGuest} hitSlop={10} style={styles.skipWrap}>
                <Text style={styles.skipText}>Just exploring? Enter as guest</Text>
              </Pressable>
            </MotiView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },

  logo: { fontSize: 52, textAlign: 'center' },
  appName: {
    color: pastel.ink, fontSize: 32, fontWeight: '900',
    textAlign: 'center', marginTop: 8, letterSpacing: 0.3,
  },
  tagline: {
    color: pastel.sub, fontSize: 14.5, textAlign: 'center',
    fontWeight: '600', marginTop: 6, marginBottom: 32,
  },

  card: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: rad.xl,
    padding: 24,
    shadowColor: '#7a6b5a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 10,
  },
  cardTitle: { color: pastel.ink, fontSize: 18, fontWeight: '900', marginBottom: 6 },
  cardSub: { color: pastel.sub, fontSize: 13.5, lineHeight: 19, marginBottom: 20, fontWeight: '600' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: pastel.cream,
    borderRadius: rad.md,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.1)',
    marginBottom: 16,
    overflow: 'hidden',
  },
  prefix: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.08)',
  },
  prefixText: { color: pastel.ink, fontSize: 16, fontWeight: '700' },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
    fontWeight: '700',
    color: pastel.ink,
    letterSpacing: 1,
  },

  promptBox: {
    backgroundColor: 'rgba(251,211,141,0.3)',
    borderRadius: rad.md,
    borderWidth: 1,
    borderColor: 'rgba(251,176,64,0.4)',
    padding: 14,
    marginBottom: 14,
  },
  promptText: { color: pastel.amberDeep, fontSize: 13.5, fontWeight: '700', marginBottom: 10 },
  guestBtn: {
    backgroundColor: pastel.amber,
    borderRadius: rad.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  guestBtnText: { color: pastel.ink, fontWeight: '900', fontSize: 13 },
  errorText: { color: '#E05252', fontSize: 13, fontWeight: '700', marginBottom: 12 },

  verifyWrap: { marginTop: 4 },
  verifyDisabled: { opacity: 0.5 },
  verifyBtn: {
    borderRadius: rad.pill,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyLoading: { flexDirection: 'row', alignItems: 'center' },
  verifyText: { color: pastel.ink, fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },

  skipWrap: { marginTop: 18, alignItems: 'center' },
  skipText: { color: pastel.sub, fontSize: 13, fontWeight: '700' },
});
