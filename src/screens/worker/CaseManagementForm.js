/**
 * CaseManagementForm.js — The editable AI template
 *
 * Consumes the volatile data buffer (editableDraft) and renders a polished,
 * fully editable case file:
 *   - Youth name + membership status header
 *   - Session date picker interface
 *   - Identified-issues checklist (animated custom checkboxes)
 *   - Intervention plan multi-line text area
 *   - Risk/severity rating matrix (interactive color-graded slider)
 *   - Two conditional termination actions:
 *       1. Export and Purge Data  (commit sanitized summary -> destructive flush)
 *       2. Just Purge Data        (instant flush, no save)
 *
 * On either action: trigger a screen-wipe animation, route back to
 * YouthCaseDetail, and (export only) append a non-PII high-level summary.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
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
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import GardenBackground from '../../components/GardenBackground';
import GlassCard from '../../components/GlassCard';
import AnimatedCheckbox from '../../components/AnimatedCheckbox';
import { useVolatileTranscript } from '../../context/VolatileTranscriptContext';
import { exportToSecureRecords } from '../../api/ingestionService';
import { palette, radius, spacing, typography } from '../../theme/theme';

/* ---------------- Interactive color-graded risk slider ---------------- */

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

  useEffect(() => {
    progress.value = withTiming(value, { duration: 120 });
  }, [value, progress]);

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
    const clamped = Math.min(Math.max(x / trackWidth, 0), 1);
    onChange(Number(clamped.toFixed(2)));
  };

  return (
    <View>
      <View style={styles.riskHeaderRow}>
        <Text style={styles.riskLabel}>{riskLabel(value)}</Text>
        <Text style={styles.riskPct}>{Math.round(value * 100)}%</Text>
      </View>
      <View
        style={styles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        // RN responder system gives true drag interaction without extra deps.
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

/* ---------------- Screen ---------------- */

const QUICK_DATES = ['Today', 'Yesterday'];

export default function CaseManagementForm({ route, navigation }) {
  const { caseKey = 'H-008' } = route.params ?? {};
  const { editableDraft, updateDraft, commitSanitizedSummary, flushState } =
    useVolatileTranscript();

  // wipe overlay progress
  const [wiping, setWiping] = useState(false);

  // All hooks must run unconditionally, so derive from the draft defensively.
  const issues = editableDraft?.issues ?? {};

  const activeIssues = useMemo(
    () => Object.keys(issues).filter((k) => issues[k]),
    [issues]
  );

  // Guard: if the draft was already flushed, there is nothing to edit.
  if (!editableDraft) {
    return (
      <GardenBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.guard}>
            <Text style={styles.guardText}>
              No active draft in memory. The volatile buffer was purged.
            </Text>
            <Pressable onPress={() => navigation.goBack()} style={styles.guardBtn}>
              <Text style={styles.guardBtnText}>‹ Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </GardenBackground>
    );
  }

  const toggleIssue = (key) =>
    updateDraft({ issues: { ...issues, [key]: !issues[key] } });

  // Build a sanitized, NON-PII high-level summary for retained history.
  const buildSanitizedSummary = () => ({
    id: `sum-${Date.now()}`,
    summary: `Session logged via ${editableDraft.sourceLabel}. Focus areas: ${
      activeIssues.length ? activeIssues.join(', ') : 'general check-in'
    }. Plan recorded.`,
    timestamp: 'Just now',
    severity: riskLabel(editableDraft.riskRating),
  });

  const runWipeThen = (fn) => {
    setWiping(true);
    // let the wipe sweep across, then flush + navigate
    setTimeout(() => {
      fn();
      navigation.navigate('YouthCaseDetail', { caseKey });
    }, 520);
  };

  const handleExportAndPurge = async () => {
    // 1) commit sanitized summary to retained history (safe data only)
    commitSanitizedSummary(caseKey, buildSanitizedSummary());
    // 2) simulate secure export of the editable template
    await exportToSecureRecords(editableDraft);
    // 3) destructive purge of all volatile buffers, with screen wipe
    runWipeThen(flushState);
  };

  const handleJustPurge = () => {
    // instant flush, no save
    runWipeThen(flushState);
  };

  return (
    <GardenBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.kicker}>EDITABLE CASE FILE</Text>

            {/* Header: youth name + membership status */}
            <GlassCard style={styles.block} radiusSize={radius.lg}>
              <Text style={styles.youthName}>{editableDraft.youthName}</Text>
              <View style={styles.membershipPill}>
                <Text style={styles.membershipText}>{editableDraft.membershipStatus}</Text>
              </View>
              <Text style={styles.sourceNote}>Imported from {editableDraft.sourceLabel}</Text>
            </GlassCard>

            {/* Session date picker interface */}
            <GlassCard style={styles.block} radiusSize={radius.lg}>
              <Text style={styles.sectionTitle}>Session date</Text>
              <TextInput
                style={styles.dateInput}
                value={editableDraft.sessionDate}
                onChangeText={(t) => updateDraft({ sessionDate: t })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={palette.fog}
              />
              <View style={styles.chipRow}>
                {QUICK_DATES.map((label) => (
                  <Pressable
                    key={label}
                    style={styles.chip}
                    onPress={() => {
                      const d = new Date();
                      if (label === 'Yesterday') d.setDate(d.getDate() - 1);
                      updateDraft({ sessionDate: d.toISOString().slice(0, 10) });
                    }}
                  >
                    <Text style={styles.chipText}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </GlassCard>

            {/* Identified issues checklist */}
            <GlassCard style={styles.block} radiusSize={radius.lg}>
              <Text style={styles.sectionTitle}>Identified issues</Text>
              {Object.keys(issues).map((key) => (
                <AnimatedCheckbox
                  key={key}
                  label={key}
                  checked={!!issues[key]}
                  onToggle={() => toggleIssue(key)}
                />
              ))}
            </GlassCard>

            {/* Intervention plan text area */}
            <GlassCard style={styles.block} radiusSize={radius.lg}>
              <Text style={styles.sectionTitle}>Intervention plan</Text>
              <TextInput
                style={styles.textArea}
                value={editableDraft.interventionPlan}
                onChangeText={(t) => updateDraft({ interventionPlan: t })}
                multiline
                textAlignVertical="top"
                placeholder="Describe the agreed plan…"
                placeholderTextColor={palette.fog}
              />
            </GlassCard>

            {/* Risk / severity rating matrix */}
            <GlassCard style={styles.block} radiusSize={radius.lg}>
              <Text style={styles.sectionTitle}>Risk / severity rating</Text>
              <RiskSlider
                value={editableDraft.riskRating}
                onChange={(v) => updateDraft({ riskRating: v })}
              />
            </GlassCard>

            {/* Conditional termination actions */}
            <Pressable onPress={handleExportAndPurge} style={styles.actionWrap}>
              <LinearGradient
                colors={[palette.mint, palette.tealBright, palette.teal]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.exportBtn}
              >
                <Text style={styles.exportText}>Export and Purge Data</Text>
                <Text style={styles.actionSub}>Commit to secure records, then wipe raw memory</Text>
              </LinearGradient>
            </Pressable>

            <Pressable onPress={handleJustPurge} style={[styles.actionWrap, styles.purgeWrap]}>
              <View style={styles.purgeBtn}>
                <Text style={styles.purgeText}>Just Purge Data</Text>
                <Text style={[styles.actionSub, { color: palette.riskHigh }]}>
                  Flush the draft & raw logs now — nothing is saved
                </Text>
              </View>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Screen-wipe overlay on termination */}
      {wiping && (
        <MotiView
          from={{ translateX: -500 }}
          animate={{ translateX: 0 }}
          transition={{ type: 'timing', duration: 480 }}
          style={styles.wipe}
          pointerEvents="none"
        >
          <LinearGradient
            colors={[palette.tealBright, palette.forestDeep]}
            style={StyleSheet.absoluteFill}
          />
        </MotiView>
      )}
    </GardenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 60 },
  kicker: { ...typography.caption, color: palette.mint, marginBottom: spacing.sm },

  block: { marginBottom: spacing.md },
  youthName: { ...typography.display, fontSize: 26 },
  membershipPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: 'rgba(110,231,183,0.18)',
    borderColor: 'rgba(110,231,183,0.4)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  membershipText: { color: palette.mint, fontWeight: '800', fontSize: 12.5 },
  sourceNote: { color: palette.fog, fontSize: 12.5, marginTop: 10 },

  sectionTitle: { ...typography.heading, marginBottom: 12 },

  dateInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: palette.white,
    fontSize: 16,
    fontWeight: '600',
  },
  chipRow: { flexDirection: 'row', marginTop: 12 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginRight: 10,
  },
  chipText: { color: palette.cloud, fontWeight: '700', fontSize: 13 },

  textArea: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: 14,
    color: palette.white,
    fontSize: 15,
    minHeight: 120,
    lineHeight: 21,
  },

  riskHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  riskLabel: { color: palette.white, fontSize: 16, fontWeight: '800' },
  riskPct: { color: palette.fog, fontSize: 15, fontWeight: '700' },
  track: {
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 28,
    borderRadius: 14,
    opacity: 0.55,
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: palette.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },

  actionWrap: { marginTop: spacing.sm },
  exportBtn: {
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: palette.tealBright,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 10,
  },
  exportText: { color: palette.ink, fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },
  actionSub: { color: 'rgba(4,17,13,0.7)', fontSize: 12, marginTop: 4, fontWeight: '600' },

  purgeWrap: { marginTop: spacing.md, marginBottom: spacing.xl },
  purgeBtn: {
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(245,101,101,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(245,101,101,0.5)',
  },
  purgeText: { color: palette.riskHigh, fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },

  // guard / wipe
  guard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  guardText: { color: palette.cloud, fontSize: 16, textAlign: 'center', lineHeight: 23 },
  guardBtn: { marginTop: spacing.lg },
  guardBtnText: { color: palette.mint, fontSize: 16, fontWeight: '800' },
  wipe: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
});
