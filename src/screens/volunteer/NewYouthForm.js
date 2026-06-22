/**
 * NewYouthForm.js — Path B: Onboard a brand-new youth into the village.
 *
 * Worker fills in: Name, Case ID, Age, Membership Status, Initial Risk Level.
 * On submit → createYouthProfile() writes a new youth_profiles doc to Firestore,
 * auto-assigns a random houseConfig and the next available gridIndex, and the
 * village map picks it up via onSnapshot within seconds.
 */

import React, { useEffect, useState } from 'react';
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
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import GardenBackground from '../../components/GardenBackground';
import GlassCard from '../../components/GlassCard';
import { createYouthProfile, updateYouthProfile } from '../../api/firestoreService';
import { gradients, palette, radius, spacing, typography } from '../../theme/theme';

/* ─── Reusable risk slider (same as CaseManagementForm) ─────────── */

const RISK_STOPS = [palette.riskLow, palette.riskMid, palette.riskHighMid, palette.riskHigh];

function riskLabel(v) {
  if (v < 0.25) return 'Low';
  if (v < 0.5) return 'Moderate';
  if (v < 0.75) return 'Elevated';
  return 'High';
}

function RiskSlider({ value, onChange }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(value);
  useEffect(() => { progress.value = withTiming(value, { duration: 120 }); }, [value]);

  const thumbStyle = useAnimatedStyle(() => {
    const x = progress.value * Math.max(trackWidth - 28, 0);
    const bg = interpolateColor(progress.value, [0, 0.33, 0.66, 1], RISK_STOPS);
    return { transform: [{ translateX: x }], backgroundColor: bg };
  });
  const fillStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(progress.value, [0, 0.33, 0.66, 1], RISK_STOPS);
    return { width: `${progress.value * 100}%`, backgroundColor: bg };
  });
  const setFromX = (x) => {
    if (trackWidth <= 0) return;
    onChange(Number(Math.min(Math.max(x / trackWidth, 0), 1).toFixed(2)));
  };

  return (
    <View>
      <View style={styles.riskRow}>
        <Text style={styles.riskLabel}>{riskLabel(value)}</Text>
        <Text style={styles.riskPct}>{Math.round(value * 100)}%</Text>
      </View>
      <View
        style={styles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => setFromX(e.nativeEvent.locationX)}
        onResponderMove={(e) => setFromX(e.nativeEvent.locationX)}
      >
        <Animated.View style={[styles.trackFill, fillStyle]} />
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </View>
    </View>
  );
}

/* ─── Membership status segmented control ────────────────────────── */

const STATUSES = ['Active Member', 'Pending', 'Inactive'];

function StatusSegment({ value, onChange }) {
  return (
    <View style={styles.segmentRow}>
      {STATUSES.map((s) => {
        const active = value === s;
        return (
          <Pressable
            key={s}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(s)}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{s}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ─── Field wrapper ──────────────────────────────────────────────── */

function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

/* ─── Screen ─────────────────────────────────────────────────────── */

export default function NewYouthForm({ route, navigation }) {
  const {
    nextGridIndex = 0,
    editMode = false,          // true when editing an existing youth
    firestoreId = null,        // populated in edit mode
    currentData = {},          // existing profile fields for pre-population
  } = route.params ?? {};

  const [name, setName] = useState(currentData.name ?? '');
  const [caseId, setCaseId] = useState(currentData.caseId?.replace(/^#/, '') ?? '');
  const [age, setAge] = useState(currentData.age ?? '');
  const [phoneNumber, setPhoneNumber] = useState(currentData.phoneNumber ?? '');
  const [membershipStatus, setMembershipStatus] = useState(currentData.membershipStatus ?? 'Active Member');
  const [riskLevel, setRiskLevel] = useState(currentData.initialRiskLevel ?? 0.2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const canSave = name.trim().length > 0 && caseId.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);

    const normalised = phoneNumber.replace(/\D/g, '');
    const payload = {
      name: name.trim(),
      caseId: caseId.trim().startsWith('#') ? caseId.trim() : `#${caseId.trim()}`,
      age: age.trim(),
      phoneNumber: normalised,
      membershipStatus,
      initialRiskLevel: riskLevel,
    };

    if (editMode && firestoreId) {
      // PATH A edit — update existing profile, preserve house position
      const ok = await updateYouthProfile(firestoreId, payload);
      setSaving(false);
      if (ok) {
        navigation.goBack();
      } else {
        setError('Could not update profile. Check your connection and try again.');
      }
    } else {
      // PATH B create — spawn a new youth profile on the village map
      const id = await createYouthProfile({ ...payload, gridIndex: nextGridIndex });
      setSaving(false);
      if (id) {
        navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
      } else {
        setError('Could not save to the database. Check your Firebase credentials and try again.');
      }
    }
  };

  return (
    <GardenBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back}>
              <Text style={styles.backText}>‹ Village</Text>
            </Pressable>

            <Text style={styles.kicker}>{editMode ? 'EDIT PROFILE · PATH A' : 'NEW YOUTH · PATH B'}</Text>
            <Text style={styles.title}>{editMode ? 'Edit Details' : 'Add to Village'}</Text>
            <Text style={styles.subtitle}>
              {editMode
                ? 'Changes save back to Firestore. The house position is preserved.'
                : 'This creates a new profile and spawns a house on the village map.'}
            </Text>

            <GlassCard style={styles.card} radiusSize={radius.lg}>
              <Text style={styles.cardTitle}>Youth Worker Case Note</Text>
              <Text style={styles.cardSub}>Prepared by Alex Tan</Text>
              <View style={styles.divider} />

              <Field label="Full Name / Display Name *">
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Hana M."
                  placeholderTextColor={palette.fog}
                  autoCapitalize="words"
                />
              </Field>

              <Field label="Case ID *">
                <TextInput
                  style={styles.input}
                  value={caseId}
                  onChangeText={setCaseId}
                  placeholder="e.g. H-008"
                  placeholderTextColor={palette.fog}
                  autoCapitalize="characters"
                />
              </Field>

              <Field label="Age">
                <TextInput
                  style={styles.input}
                  value={age}
                  onChangeText={setAge}
                  placeholder="e.g. 17"
                  placeholderTextColor={palette.fog}
                  keyboardType="number-pad"
                />
              </Field>

              <Field label="Phone Number (SG) *">
                <View style={styles.phoneRow}>
                  <View style={styles.phonePrefix}>
                    <Text style={styles.phonePrefixText}>+65</Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.phoneInput]}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    placeholder="9123 4567"
                    placeholderTextColor={palette.fog}
                    keyboardType="phone-pad"
                    maxLength={12}
                  />
                </View>
                <Text style={styles.phoneHint}>
                  The youth uses this number to log in and link to their profile.
                </Text>
              </Field>

              <Field label="Membership Status">
                <StatusSegment value={membershipStatus} onChange={setMembershipStatus} />
              </Field>

              <Field label="Initial Risk Level">
                <RiskSlider value={riskLevel} onChange={setRiskLevel} />
              </Field>
            </GlassCard>

            {/* House preview note */}
            <GlassCard style={styles.houseNote} radiusSize={radius.md}>
              <Text style={styles.houseNoteIcon}>🏠</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.houseNoteTitle}>A house will be auto-assigned</Text>
                <Text style={styles.houseNoteSub}>
                  The youth can customise their home later from the youth portal.
                </Text>
              </View>
            </GlassCard>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              onPress={handleSave}
              disabled={!canSave || saving}
              style={[styles.saveWrap, (!canSave || saving) && { opacity: 0.55 }]}
            >
              <LinearGradient
                colors={gradients.leaf}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.saveBtn}
              >
                {saving ? (
                  <View style={styles.saveLoading}>
                    <ActivityIndicator color={palette.ink} size="small" />
                    <Text style={[styles.saveText, { marginLeft: 10 }]}>Adding to village…</Text>
                  </View>
                ) : (
                  <Text style={styles.saveText}>{editMode ? '✓  Save Changes' : '＋  Add to Village'}</Text>
                )}
              </LinearGradient>
            </Pressable>

            <Text style={styles.hint}>* Required fields</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </GardenBackground>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 60 },
  back: { marginBottom: spacing.md },
  backText: { color: palette.mint, fontSize: 16, fontWeight: '700' },
  kicker: { ...typography.caption, color: palette.mint },
  title: { ...typography.display, marginTop: 4 },
  subtitle: { ...typography.body, color: palette.fog, marginTop: 6, marginBottom: spacing.lg, lineHeight: 21 },

  card: { marginBottom: spacing.md },
  cardTitle: { fontSize: 19, fontWeight: '800', color: palette.white, textAlign: 'center', marginBottom: 4 },
  cardSub: { color: palette.fog, fontSize: 12.5, textAlign: 'center', marginBottom: 14 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 18 },

  field: { marginBottom: 18 },
  fieldLabel: { color: palette.fog, fontSize: 12, fontWeight: '700', letterSpacing: 0.3, marginBottom: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: palette.white,
    fontSize: 15,
    fontWeight: '600',
  },

  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  segmentActive: {
    borderColor: 'rgba(110,231,183,0.55)',
    backgroundColor: 'rgba(110,231,183,0.14)',
  },
  segmentText: { color: palette.fog, fontSize: 12, fontWeight: '700' },
  segmentTextActive: { color: palette.mint },

  riskRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  riskLabel: { color: palette.white, fontSize: 15, fontWeight: '800' },
  riskPct: { color: palette.fog, fontSize: 14, fontWeight: '700' },
  track: {
    height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
  },
  trackFill: { position: 'absolute', left: 0, height: 28, borderRadius: 14, opacity: 0.55 },
  thumb: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 3, borderColor: palette.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 4, elevation: 4,
  },

  houseNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: spacing.md,
  },
  houseNoteIcon: { fontSize: 24 },
  houseNoteTitle: { color: palette.cloud, fontSize: 13.5, fontWeight: '700', marginBottom: 3 },
  houseNoteSub: { color: palette.fog, fontSize: 12, lineHeight: 17 },

  errorBox: {
    backgroundColor: 'rgba(245,101,101,0.12)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(245,101,101,0.4)',
    padding: 14,
    marginBottom: spacing.md,
  },
  errorText: { color: palette.riskHigh, fontSize: 13.5, fontWeight: '600', lineHeight: 19 },

  saveWrap: { marginTop: spacing.sm },
  saveBtn: {
    borderRadius: radius.lg,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: palette.tealBright,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 10,
  },
  saveLoading: { flexDirection: 'row', alignItems: 'center' },
  saveText: { color: palette.ink, fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },
  hint: { color: palette.fog, fontSize: 12, textAlign: 'center', marginTop: 14 },

  phoneRow: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  phonePrefix: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
  },
  phonePrefixText: { color: palette.mint, fontSize: 15, fontWeight: '800' },
  phoneInput: {
    flex: 1, borderWidth: 0, borderRadius: 0,
    backgroundColor: 'transparent', marginBottom: 0,
  },
  phoneHint: { color: palette.fog, fontSize: 11.5, marginTop: 6, lineHeight: 16 },
});
