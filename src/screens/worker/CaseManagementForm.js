/**
 * CaseManagementForm.js — Editable AI case note template
 *
 * Structure blends the formal "Youth Worker Case Note" document layout
 * (title, prepared-by, info table, section headings) with the app's
 * glassmorphic dark theme, animated checkboxes, and risk slider.
 *
 * Sections:
 *   0. Ingestion range badge (PDPA metadata strip)
 *   1. Case note header  — title, Prepared By, info table (Name/Age/Date/Location)
 *   2. Presenting Concerns — animated checkbox checklist
 *   3. Initial Assessment  — freeform AI-seeded paragraph
 *   4. Risk / Severity     — color-graded interactive slider
 *   5. Action buttons      — Export & Purge / Just Purge
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
import { appendInteractionSession, exportCaseSummaryToFirestore } from '../../api/firestoreService';
import { palette, radius, spacing, typography } from '../../theme/theme';

/* ─── Risk slider ─────────────────────────────────────────────── */

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

  useEffect(() => { progress.value = withTiming(value, { duration: 120 }); }, [value, progress]);

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
      <View style={styles.riskHeaderRow}>
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

/* ─── Ingestion range badge ───────────────────────────────────── */

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function IngestionRangeBadge({ rangeStart, rangeEnd, rangePreset, fileName }) {
  if (!rangeStart && !rangeEnd) return null;
  const label = { last24h:'Last 24 Hours', '3days':'3 Days', pastWeek:'Past Week', custom:'Custom Range' }[rangePreset] ?? 'Selected Range';
  return (
    <MotiView from={{ opacity:0, translateY:-6 }} animate={{ opacity:1, translateY:0 }} transition={{ type:'timing', duration:380 }} style={styles.badge}>
      <View style={styles.badgeDotRow}>
        <View style={styles.badgeDot} />
        <Text style={styles.badgeLabel}>Processing range · {label}</Text>
      </View>
      <Text style={styles.badgeRange}>{fmtDt(rangeStart)}  →  {fmtDt(rangeEnd)}</Text>
      {fileName ? <Text style={styles.badgeFile} numberOfLines={1}>📄 {fileName}</Text> : null}
    </MotiView>
  );
}

/* ─── Document section heading (mirrors the paper doc style) ─── */

function SectionHeading({ title }) {
  return (
    <View style={styles.sectionHeadingWrap}>
      <View style={styles.sectionHeadingBar} />
      <Text style={styles.sectionHeadingText}>{title}</Text>
    </View>
  );
}

/* ─── Info table row (Name / Age / Date of Contact / Location) ── */

function TableRow({ label, children, last }) {
  return (
    <View style={[styles.tableRow, !last && styles.tableRowBorder]}>
      <Text style={styles.tableLabel}>{label}</Text>
      <View style={styles.tableValue}>{children}</View>
    </View>
  );
}

/* ─── Screen ──────────────────────────────────────────────────── */

const QUICK_DATES = ['Today', 'Yesterday'];

export default function CaseManagementForm({ route, navigation }) {
  const { caseKey = 'H-008', firestoreId = null } = route.params ?? {};
  const { editableDraft, updateDraft, commitSanitizedSummary, flushState } = useVolatileTranscript();
  const [wiping, setWiping] = useState(false);

  const issues = editableDraft?.issues ?? {};
  const activeIssues = useMemo(() => Object.keys(issues).filter((k) => issues[k]), [issues]);

  if (!editableDraft) {
    return (
      <GardenBackground>
        <SafeAreaView style={styles.safe}>
          <View style={styles.guard}>
            <Text style={styles.guardText}>No active draft in memory. The volatile buffer was purged.</Text>
            <Pressable onPress={() => navigation.goBack()} style={styles.guardBtn}>
              <Text style={styles.guardBtnText}>‹ Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </GardenBackground>
    );
  }

  const toggleIssue = (key) => updateDraft({ issues: { ...issues, [key]: !issues[key] } });

  const buildSanitizedSummary = () => ({
    id: `sum-${Date.now()}`,
    summary: `Session logged via ${editableDraft.sourceLabel}. Focus areas: ${activeIssues.length ? activeIssues.join(', ') : 'general check-in'}. Plan recorded.`,
    timestamp: 'Just now',
    severity: riskLabel(editableDraft.riskRating),
  });

  const runWipeThen = (fn) => {
    setWiping(true);
    setTimeout(() => {
      fn();
      navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    }, 520);
  };

  const handleExportAndPurge = async () => {
    const summary = buildSanitizedSummary();
    commitSanitizedSummary(caseKey, summary);
    // PATH A — firestoreId exists: append session to existing youth profile doc.
    // Legacy fallback — no firestoreId: write to flat youth_cases collection.
    const sessionPayload = {
      caseKey,
      caseId: editableDraft.caseId,
      severity: summary.severity,
      sourceLabel: editableDraft.sourceLabel,
      activeIssues,
      rangeStart: editableDraft.rangeStart ?? null,
      rangeEnd: editableDraft.rangeEnd ?? null,
      scrubStats: editableDraft.scrubStats ?? null,
    };
    if (firestoreId) {
      appendInteractionSession(firestoreId, sessionPayload);
    } else {
      exportCaseSummaryToFirestore(sessionPayload);
    }
    await exportToSecureRecords(editableDraft);
    runWipeThen(flushState);
  };

  const handleJustPurge = () => runWipeThen(flushState);

  return (
    <GardenBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <Text style={styles.kicker}>CASE NOTE</Text>

            {/* PDPA ingestion range strip */}
            <IngestionRangeBadge
              rangeStart={editableDraft.rangeStart}
              rangeEnd={editableDraft.rangeEnd}
              rangePreset={editableDraft.rangePreset}
              fileName={editableDraft.fileName}
            />

            {/* ── 1. Case note header ── */}
            <GlassCard style={styles.block} radiusSize={radius.lg}>
              {/* Document-style title */}
              <Text style={styles.docTitle}>Youth Worker Case Note</Text>
              <View style={styles.preparedByRow}>
                <Text style={styles.preparedByLabel}>Prepared by </Text>
                <TextInput
                  style={styles.preparedByInput}
                  value={editableDraft.workerName}
                  onChangeText={(t) => updateDraft({ workerName: t })}
                  placeholder="Your name"
                  placeholderTextColor={palette.fog}
                />
              </View>

              {/* Divider */}
              <View style={styles.tableDivider} />

              {/* Info table */}
              <TableRow label="Name">
                <Text style={styles.tableValueText}>{editableDraft.youthName}</Text>
                <View style={styles.membershipPill}>
                  <Text style={styles.membershipText}>{editableDraft.membershipStatus}</Text>
                </View>
              </TableRow>

              <TableRow label="Age">
                <TextInput
                  style={styles.tableInput}
                  value={editableDraft.age}
                  onChangeText={(t) => updateDraft({ age: t })}
                  placeholder="e.g. 17"
                  placeholderTextColor={palette.fog}
                  keyboardType="number-pad"
                />
              </TableRow>

              <TableRow label="Date of Contact">
                {editableDraft.rangeStart && editableDraft.rangeEnd ? (
                  <View>
                    <Text style={styles.tableValueText}>
                      {fmtDt(editableDraft.rangeStart)}
                    </Text>
                    <Text style={styles.tableRangeSep}>→</Text>
                    <Text style={styles.tableValueText}>
                      {fmtDt(editableDraft.rangeEnd)}
                    </Text>
                    <Text style={styles.tableRangeNote}>Chat import range</Text>
                  </View>
                ) : (
                  <TextInput
                    style={styles.tableInput}
                    value={editableDraft.sessionDate}
                    onChangeText={(t) => updateDraft({ sessionDate: t })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={palette.fog}
                  />
                )}
              </TableRow>

              <TableRow label="Location" last>
                <TextInput
                  style={styles.tableInput}
                  value={editableDraft.location}
                  onChangeText={(t) => updateDraft({ location: t })}
                  placeholder="e.g. Crescent Community Centre"
                  placeholderTextColor={palette.fog}
                />
              </TableRow>

              <Text style={styles.sourceNote}>Imported from {editableDraft.sourceLabel}</Text>
            </GlassCard>

            {/* ── 2. Presenting Concerns ── */}
            <GlassCard style={styles.block} radiusSize={radius.lg}>
              <SectionHeading title="Presenting Concerns" />
              {Object.keys(issues).map((key) => (
                <AnimatedCheckbox
                  key={key}
                  label={key}
                  checked={!!issues[key]}
                  onToggle={() => toggleIssue(key)}
                />
              ))}
            </GlassCard>

            {/* ── 3. Initial Assessment ── */}
            <GlassCard style={styles.block} radiusSize={radius.lg}>
              <SectionHeading title="Assessment" />
              <TextInput
                style={styles.textArea}
                value={editableDraft.interventionPlan}
                onChangeText={(t) => updateDraft({ interventionPlan: t })}
                multiline
                textAlignVertical="top"
                placeholder="Describe the worker's assessment and agreed plan…"
                placeholderTextColor={palette.fog}
              />
            </GlassCard>

            {/* ── 4. Risk / Severity Rating ── */}
            <GlassCard style={styles.block} radiusSize={radius.lg}>
              <SectionHeading title="Risk / Severity Rating" />
              <RiskSlider value={editableDraft.riskRating} onChange={(v) => updateDraft({ riskRating: v })} />
            </GlassCard>

            {/* ── 5. Action buttons ── */}
            <Pressable onPress={handleExportAndPurge} style={styles.actionWrap}>
              <LinearGradient
                colors={[palette.mint, palette.tealBright, palette.teal]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
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

      {wiping && (
        <MotiView
          from={{ translateX: -500 }} animate={{ translateX: 0 }}
          transition={{ type: 'timing', duration: 480 }}
          style={styles.wipe} pointerEvents="none"
        >
          <LinearGradient colors={[palette.tealBright, palette.forestDeep]} style={StyleSheet.absoluteFill} />
        </MotiView>
      )}
    </GardenBackground>
  );
}

/* ─── Styles ──────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 60 },
  kicker: { ...typography.caption, color: palette.mint, marginBottom: spacing.sm },
  block: { marginBottom: spacing.md },

  /* Ingestion badge */
  badge: {
    backgroundColor: 'rgba(110,231,183,0.08)',
    borderWidth: 1, borderColor: 'rgba(110,231,183,0.28)',
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: spacing.md,
  },
  badgeDotRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  badgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.mint, marginRight: 8 },
  badgeLabel: { color: palette.mint, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  badgeRange: { color: palette.cloud, fontSize: 13.5, fontWeight: '600', lineHeight: 19 },
  badgeFile: { color: palette.fog, fontSize: 11.5, fontWeight: '600', marginTop: 5 },

  /* Document title */
  docTitle: {
    fontSize: 20, fontWeight: '800', color: palette.white,
    textAlign: 'center', letterSpacing: 0.3, marginBottom: 10,
  },
  preparedByRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  preparedByLabel: { color: palette.fog, fontSize: 13, fontWeight: '600' },
  preparedByInput: {
    color: palette.mint, fontSize: 13, fontWeight: '800',
    borderBottomWidth: 1, borderBottomColor: 'rgba(110,231,183,0.4)',
    paddingVertical: 2, paddingHorizontal: 4, minWidth: 120,
  },

  /* Table divider */
  tableDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 2 },

  /* Table rows */
  tableRow: { flexDirection: 'row', paddingVertical: 12, alignItems: 'flex-start' },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  tableLabel: {
    width: 110, color: palette.fog, fontSize: 12.5, fontWeight: '700',
    paddingTop: 3, letterSpacing: 0.2,
  },
  tableValue: { flex: 1 },
  tableValueText: { color: palette.white, fontSize: 14.5, fontWeight: '700' },
  tableInput: {
    color: palette.white, fontSize: 14.5, fontWeight: '600',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 2, paddingHorizontal: 0,
  },
  tableRangeSep: { color: palette.fog, fontSize: 11, marginVertical: 2 },
  tableRangeNote: { color: palette.mint, fontSize: 11, fontWeight: '700', marginTop: 4 },

  membershipPill: {
    alignSelf: 'flex-start', marginTop: 6,
    backgroundColor: 'rgba(110,231,183,0.18)',
    borderColor: 'rgba(110,231,183,0.4)', borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill,
  },
  membershipText: { color: palette.mint, fontWeight: '800', fontSize: 11.5 },

  chipRow: { flexDirection: 'row', marginTop: 8 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12, paddingVertical: 5, marginRight: 8,
  },
  chipText: { color: palette.cloud, fontWeight: '700', fontSize: 12 },

  sourceNote: { color: palette.fog, fontSize: 11.5, marginTop: 12, textAlign: 'center' },

  /* Section heading — left accent bar + bold title */
  sectionHeadingWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  sectionHeadingBar: {
    width: 3, height: 18, borderRadius: 2,
    backgroundColor: palette.mint, marginRight: 10,
  },
  sectionHeadingText: { fontSize: 15, fontWeight: '800', color: palette.cloud, letterSpacing: 0.2 },

  /* Text area */
  textArea: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.md, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: 14, color: palette.white,
    fontSize: 14.5, minHeight: 130, lineHeight: 22,
  },

  /* Risk slider */
  riskHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  riskLabel: { color: palette.white, fontSize: 16, fontWeight: '800' },
  riskPct: { color: palette.fog, fontSize: 15, fontWeight: '700' },
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

  /* Action buttons */
  actionWrap: { marginTop: spacing.sm },
  exportBtn: {
    borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: palette.tealBright, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7, shadowRadius: 14, elevation: 10,
  },
  exportText: { color: palette.ink, fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },
  actionSub: { color: 'rgba(4,17,13,0.7)', fontSize: 12, marginTop: 4, fontWeight: '600' },
  purgeWrap: { marginTop: spacing.md, marginBottom: spacing.xl },
  purgeBtn: {
    borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center',
    backgroundColor: 'rgba(245,101,101,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(245,101,101,0.5)',
  },
  purgeText: { color: palette.riskHigh, fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },

  /* Guard / wipe */
  guard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  guardText: { color: palette.cloud, fontSize: 16, textAlign: 'center', lineHeight: 23 },
  guardBtn: { marginTop: spacing.lg },
  guardBtnText: { color: palette.mint, fontSize: 16, fontWeight: '800' },
  wipe: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
});
