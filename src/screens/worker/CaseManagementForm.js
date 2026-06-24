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

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { summarizeImport } from '../../api/summaryService';
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
  const trackPageX = useRef(0);
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

  const setFromPageX = (pageX) => {
    if (trackWidth <= 0) return;
    const raw = (pageX - trackPageX.current) / trackWidth;
    const clamped = Number(Math.min(Math.max(raw, 0), 1).toFixed(2));
    progress.value = clamped;
    onChange(clamped);
  };

  return (
    <View>
      <View style={styles.riskHeaderRow}>
        <Text style={styles.riskLabel}>{riskLabel(value)}</Text>
        <Text style={styles.riskPct}>{Math.round(value * 100)}%</Text>
      </View>
      <View
        style={styles.track}
        onLayout={(e) => {
          setTrackWidth(e.nativeEvent.layout.width);
        }}
        ref={(ref) => {
          if (ref) ref.measure((_x, _y, _w, _h, px) => { trackPageX.current = px; });
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => setFromPageX(e.nativeEvent.pageX)}
        onResponderMove={(e) => setFromPageX(e.nativeEvent.pageX)}
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

const RISK_COLOR = { low: '#48BB78', medium: '#F6AD55', high: '#F56565' };

function AISummaryPreview({ summary, onUseOverview, onToggleConcern, includedConcerns, onToggleAction, includedActions }) {
  if (!summary) return null;
  return (
    <GlassCard style={{ marginBottom: 16 }} radiusSize={radius.lg}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: palette.mint, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>AI CHAT SUMMARY</Text>
          <Text style={{ color: palette.fog, fontSize: 10.5, marginTop: 2 }}>Review and select what to include</Text>
        </View>
        <View style={{
          backgroundColor: `${RISK_COLOR[summary.riskLevel] ?? RISK_COLOR.low}22`,
          borderColor: `${RISK_COLOR[summary.riskLevel] ?? RISK_COLOR.low}55`,
          borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
        }}>
          <Text style={{ color: RISK_COLOR[summary.riskLevel] ?? RISK_COLOR.low, fontSize: 10.5, fontWeight: '800' }}>
            {(summary.riskLevel ?? 'low').toUpperCase()} RISK
          </Text>
        </View>
      </View>

      {/* Overview */}
      {summary.overview ? (
        <>
          <Text style={{ color: palette.fog, fontSize: 11, fontWeight: '700', marginBottom: 5, letterSpacing: 0.4 }}>OVERVIEW</Text>
          <Text style={{ color: palette.cloud, fontSize: 13.5, lineHeight: 20, marginBottom: 10 }}>{summary.overview}</Text>
          <Pressable onPress={onUseOverview} style={{
            alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(110,231,183,0.4)',
            borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 14,
            backgroundColor: 'rgba(110,231,183,0.08)',
          }}>
            <Text style={{ color: palette.mint, fontSize: 12, fontWeight: '700' }}>↓ Use as Assessment</Text>
          </Pressable>
        </>
      ) : null}

      {/* Themes */}
      {summary.themes?.length > 0 && (
        <>
          <Text style={{ color: palette.fog, fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.4 }}>THEMES</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {summary.themes.map((t, i) => (
              <View key={i} style={{
                backgroundColor: 'rgba(110,231,183,0.10)', borderWidth: 1,
                borderColor: 'rgba(110,231,183,0.3)', borderRadius: 20,
                paddingHorizontal: 10, paddingVertical: 4,
              }}>
                <Text style={{ color: palette.mint, fontSize: 11.5, fontWeight: '700' }}>{t}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Concerns — toggleable */}
      {summary.concerns?.length > 0 && (
        <>
          <Text style={{ color: palette.fog, fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.4 }}>CONCERNS (tap to include)</Text>
          {summary.concerns.map((c, i) => {
            const on = includedConcerns.includes(i);
            return (
              <Pressable key={i} onPress={() => onToggleConcern(i)} style={{
                flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 10,
              }}>
                <View style={{
                  width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
                  borderColor: on ? palette.mint : 'rgba(255,255,255,0.2)',
                  backgroundColor: on ? 'rgba(110,231,183,0.2)' : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {on && <Text style={{ color: palette.mint, fontSize: 12, fontWeight: '900' }}>✓</Text>}
                </View>
                <Text style={{ color: on ? palette.cloud : palette.fog, fontSize: 13.5, flex: 1 }}>{c}</Text>
              </Pressable>
            );
          })}
        </>
      )}

      {/* Action items — toggleable */}
      {summary.actionItems?.length > 0 && (
        <>
          <Text style={{ color: palette.fog, fontSize: 11, fontWeight: '700', marginTop: 8, marginBottom: 6, letterSpacing: 0.4 }}>FOLLOW-UP ACTIONS (tap to include)</Text>
          {summary.actionItems.map((a, i) => {
            const on = includedActions.includes(i);
            return (
              <Pressable key={i} onPress={() => onToggleAction(i)} style={{
                flexDirection: 'row', alignItems: 'center', marginBottom: 7, gap: 10,
              }}>
                <View style={{
                  width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
                  borderColor: on ? palette.tealBright : 'rgba(255,255,255,0.2)',
                  backgroundColor: on ? 'rgba(56,178,172,0.2)' : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {on && <Text style={{ color: palette.tealBright, fontSize: 12, fontWeight: '900' }}>✓</Text>}
                </View>
                <Text style={{ color: on ? palette.cloud : palette.fog, fontSize: 13.5, flex: 1 }}>→ {a}</Text>
              </Pressable>
            );
          })}
        </>
      )}
    </GlassCard>
  );
}

export default function CaseManagementForm({ route, navigation }) {
  const { caseKey = 'H-008', firestoreId = null } = route.params ?? {};
  const { editableDraft, updateDraft, commitSanitizedSummary, flushState, rawTextLines } = useVolatileTranscript();
  const [wiping, setWiping] = useState(false);
  const [importSummary, setImportSummary] = useState(null);

  // AI summary inclusion state
  const [includedConcerns, setIncludedConcerns] = useState([]);
  const [includedActions, setIncludedActions] = useState([]);

  // On mount — summarise the imported chat and pre-fill assessment
  useEffect(() => {
    if (!rawTextLines?.length) return;
    summarizeImport(rawTextLines.slice(0, 120))
      .then(result => {
        if (!result) return;
        setImportSummary(result);
        if (result.overview) {
          updateDraft({ interventionPlan: result.overview });
        }
      })
      .catch(() => {}); // non-fatal — form still works without AI summary
  }, []);

  const toggleConcern = (i) => setIncludedConcerns(prev =>
    prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  const toggleAction = (i) => setIncludedActions(prev =>
    prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);

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

  const buildSanitizedSummary = () => {
    const aiConcerns = (importSummary?.concerns ?? [])
      .filter((_, i) => includedConcerns.includes(i));
    const aiActions = (importSummary?.actionItems ?? [])
      .filter((_, i) => includedActions.includes(i));
    const focusAreas = [...activeIssues, ...aiConcerns];

    let summaryText = `Session logged via ${editableDraft.sourceLabel}. `;
    summaryText += focusAreas.length
      ? `Focus areas: ${focusAreas.join(', ')}. `
      : 'General check-in. ';
    if (editableDraft.interventionPlan?.trim()) {
      summaryText += `Assessment: ${editableDraft.interventionPlan.trim()}. `;
    }
    if (aiActions.length) {
      summaryText += `Follow-up: ${aiActions.join('; ')}.`;
    }

    return {
      id: `sum-${Date.now()}`,
      summary: summaryText,
      timestamp: 'Just now',
      severity: riskLabel(editableDraft.riskRating),
      aiConcerns,
      aiActions,
    };
  };

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

            {/* ── 3. Assessment (AI summary of imported chat, editable) ── */}
            <GlassCard style={styles.block} radiusSize={radius.lg}>
              <SectionHeading title="Assessment" />
              {importSummary?.overview ? (
                <View style={styles.assessmentHintRow}>
                  <Text style={styles.assessmentHint}>✦ AI generated · tap to edit</Text>
                </View>
              ) : null}
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

  /* Assessment AI hint */
  assessmentHintRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  assessmentHint: { color: palette.mint, fontSize: 11, fontWeight: '700', letterSpacing: 0.3, opacity: 0.8 },

  /* AI Summary section */
  summaryLabel: { color: palette.mint, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 12, marginBottom: 5 },
  summaryText: { color: palette.cloud, fontSize: 14, lineHeight: 21, marginBottom: 4 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  pill: { backgroundColor: 'rgba(110,231,183,0.12)', borderWidth: 1, borderColor: 'rgba(110,231,183,0.35)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { color: palette.mint, fontSize: 12, fontWeight: '700' },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 5 },
  bulletDot: { color: palette.mint, fontSize: 14, fontWeight: '800', marginTop: 1 },
  bulletText: { color: palette.cloud, fontSize: 13.5, lineHeight: 20, flex: 1 },
  summaryRiskRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  riskPill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  riskPillText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },

  /* Guard / wipe */
  guard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  guardText: { color: palette.cloud, fontSize: 16, textAlign: 'center', lineHeight: 23 },
  guardBtn: { marginTop: spacing.lg },
  guardBtnText: { color: palette.mint, fontSize: 16, fontWeight: '800' },
  wipe: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
});
