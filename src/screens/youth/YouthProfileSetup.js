/**
 * YouthProfileSetup.js — Open onboarding entry screen for the youth app.
 *
 * Every user fills in their Name and Phone Number and taps
 * "Save Profile & Enter Hub". The app navigates immediately — there is no
 * blocking gate. A background Firestore query fires in parallel:
 *
 * SCENARIO A — PHONE MATCHES A WORKER-CREATED PROFILE
 *   YouthSessionContext resolves isLinkedToWorker → true, maps the session to
 *   the matched firestoreId, and loads the youth's saved houseConfig.
 *   YouthExteriorEdit detects the updated firestoreId and re-seeds the house.
 *   All future customisation writes go directly to the worker's shared doc.
 *
 * SCENARIO B — NO MATCH FOUND
 *   isLinkedToWorker stays false. The youth gets a local sandbox house.
 *   Their customisations are local-only and do not appear on the village map.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { useYouthSession } from '../../context/YouthSessionContext';
import { pastel, youthRadius as rad } from './youthTheme';

function isPlausiblePhone(digits) {
  return digits.length === 8 || (digits.length === 10 && digits.startsWith('65'));
}

export default function YouthProfileSetup({ navigation }) {
  const { setupProfile } = useYouthSession();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const digits = phone.replace(/\D/g, '');
  const canSave = name.trim().length > 0 && isPlausiblePhone(digits) && !saving;

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    // Kick off the background Firestore lookup — do NOT await it.
    // Navigation happens immediately; the session context resolves async.
    setupProfile(name.trim(), digits);
    navigation.replace('YouthExteriorEdit');
  };

  return (
    <View style={styles.root}>
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
          <ScrollView
            contentContainerStyle={styles.center}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Hero ── */}
            <MotiView
              from={{ opacity: 0, translateY: -20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'spring', damping: 18, stiffness: 160 }}
              style={styles.hero}
            >
              <Text style={styles.logo}>🌱</Text>
              <Text style={styles.appName}>UniGarden</Text>
              <Text style={styles.tagline}>Your safe space. Your home.</Text>
            </MotiView>

            {/* ── Profile card ── */}
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'spring', damping: 18, stiffness: 160, delay: 120 }}
              style={styles.card}
            >
              <Text style={styles.cardTitle}>Set up your profile</Text>
              <Text style={styles.cardSub}>
                Tell us a little about yourself so we can personalise your space.
              </Text>

              {/* Name */}
              <Text style={styles.fieldLabel}>Your name</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Hana"
                placeholderTextColor={pastel.sub}
                autoCapitalize="words"
                returnKeyType="next"
              />

              {/* Phone */}
              <Text style={styles.fieldLabel}>Phone number</Text>
              <View style={styles.phoneRow}>
                <View style={styles.prefix}>
                  <Text style={styles.prefixText}>+65</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="9123 4567"
                  placeholderTextColor={pastel.sub}
                  keyboardType="phone-pad"
                  maxLength={12}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>
              <Text style={styles.phoneHint}>
                Used to link your space to your youth worker's village map, if registered.
              </Text>

              {/* Save button */}
              <Pressable
                onPress={handleSave}
                disabled={!canSave}
                style={[styles.saveWrap, !canSave && styles.saveDisabled]}
              >
                <LinearGradient
                  colors={[pastel.mint, pastel.mintDeep]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.saveBtn}
                >
                  {saving ? (
                    <View style={styles.saveLoading}>
                      <ActivityIndicator color={pastel.ink} size="small" />
                      <Text style={[styles.saveText, { marginLeft: 10 }]}>Setting up…</Text>
                    </View>
                  ) : (
                    <Text style={styles.saveText}>Save Profile & Enter Hub →</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </MotiView>

            {/* ── Privacy note ── */}
            <MotiView
              from={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ type: 'timing', duration: 600, delay: 400 }}
            >
              <Text style={styles.privacyNote}>
                🔒 Your phone number is used only to link your space. It is never shared or stored outside your worker's care file.
              </Text>
            </MotiView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  center: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 32,
  },

  hero: { alignItems: 'center', marginBottom: 28 },
  logo: { fontSize: 52, textAlign: 'center' },
  appName: {
    color: pastel.ink, fontSize: 32, fontWeight: '900',
    textAlign: 'center', marginTop: 8, letterSpacing: 0.3,
  },
  tagline: {
    color: pastel.sub, fontSize: 14.5, textAlign: 'center',
    fontWeight: '600', marginTop: 6,
  },

  card: {
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderRadius: rad.xl,
    padding: 24,
    shadowColor: '#7a6b5a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 10,
    marginBottom: 20,
  },
  cardTitle: { color: pastel.ink, fontSize: 19, fontWeight: '900', marginBottom: 6 },
  cardSub: {
    color: pastel.sub, fontSize: 13.5, lineHeight: 19,
    marginBottom: 22, fontWeight: '600',
  },

  fieldLabel: {
    color: pastel.sub, fontSize: 12, fontWeight: '800',
    letterSpacing: 0.4, marginBottom: 8,
  },
  textInput: {
    backgroundColor: pastel.cream,
    borderRadius: rad.md,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    fontWeight: '700',
    color: pastel.ink,
    marginBottom: 18,
  },

  phoneRow: {
    flexDirection: 'row',
    backgroundColor: pastel.cream,
    borderRadius: rad.md,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.1)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  prefix: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRightWidth: 1,
    borderRightColor: 'rgba(0,0,0,0.08)',
    justifyContent: 'center',
  },
  prefixText: { color: pastel.ink, fontSize: 16, fontWeight: '700' },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 17,
    fontWeight: '700',
    color: pastel.ink,
    letterSpacing: 1,
  },
  phoneHint: {
    color: pastel.sub, fontSize: 12, lineHeight: 16,
    fontWeight: '600', marginBottom: 22,
  },

  saveWrap: { marginTop: 4 },
  saveDisabled: { opacity: 0.45 },
  saveBtn: {
    borderRadius: rad.pill,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLoading: { flexDirection: 'row', alignItems: 'center' },
  saveText: { color: pastel.ink, fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },

  privacyNote: {
    color: pastel.sub, fontSize: 12, textAlign: 'center',
    lineHeight: 18, fontWeight: '600', paddingHorizontal: 8,
  },
});
