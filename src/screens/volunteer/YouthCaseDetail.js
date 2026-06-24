/**
 * YouthCaseDetail.js — Case main page & Path A import journey.
 *
 * Receives `firestoreId` from VolunteerHome and carries it through to
 * CaseManagementForm so the export knows to append a session to an existing
 * youth_profiles doc rather than create a new root document.
 *
 * The "Importing interactions for: [name]" context banner is shown inside the
 * ImportConfigModal header so the worker always knows whose data they are
 * processing.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import GardenBackground from '../../components/GardenBackground';
import GlassCard from '../../components/GlassCard';
import MiniRoomPreview from '../youth/MiniRoomPreview';
import ImportConfigModal from './ImportConfigModal';
import { useVolatileTranscript } from '../../context/VolatileTranscriptContext';
import { importChatFromSource } from '../../api/ingestionService';
import { fetchYouthProfile } from '../../api/firestoreService';
import { getSummary, generateSummary, summarizeImport } from '../../api/summaryService';
import { gradients, palette, radius, spacing, typography } from '../../theme/theme';

function HistoryRow({ entry, index }) {
  return (
    <MotiView
      from={{ opacity: 0, translateX: -12 }}
      animate={{ opacity: 1, translateX: 0 }}
      transition={{ type: 'timing', duration: 420, delay: index * 90 }}
    >
      <GlassCard style={styles.historyCard} radiusSize={radius.md}>
        <View style={styles.historyHeader}>
          <Text style={styles.historyTime}>{entry.timestamp}</Text>
          <View style={styles.severityPill}>
            <Text style={styles.severityText}>{entry.severity}</Text>
          </View>
        </View>
        <Text style={styles.historySummary}>{entry.summary}</Text>
      </GlassCard>
    </MotiView>
  );
}

const RISK_CONFIG = {
  low:    { color: '#48BB78', bg: 'rgba(72,187,120,0.12)',  border: 'rgba(72,187,120,0.35)',  label: 'LOW RISK',    icon: '●' },
  medium: { color: '#F6AD55', bg: 'rgba(246,173,85,0.12)',  border: 'rgba(246,173,85,0.35)',  label: 'MEDIUM RISK', icon: '◆' },
  high:   { color: '#F56565', bg: 'rgba(245,101,101,0.12)', border: 'rgba(245,101,101,0.35)', label: 'HIGH RISK',   icon: '▲' },
};

function RiskBadge({ level }) {
  const cfg = RISK_CONFIG[level] ?? RISK_CONFIG.low;
  return (
    <View style={[styles.riskBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Text style={[styles.riskIcon, { color: cfg.color }]}>{cfg.icon}</Text>
      <Text style={[styles.riskLabel, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function EmotionalTimeline({ trajectory }) {
  if (!trajectory?.length) return null;
  return (
    <View style={styles.timelineWrap}>
      {trajectory.map((event, i) => (
        <View key={i} style={styles.timelineRow}>
          <View style={styles.timelineDotCol}>
            <View style={styles.timelineDot} />
            {i < trajectory.length - 1 && <View style={styles.timelineLine} />}
          </View>
          <View style={styles.timelineContent}>
            <Text style={styles.timelineTs}>{event.timestamp}</Text>
            <Text style={styles.timelineState}>{event.emotionalState}</Text>
            {event.confidenceScore != null && (
              <View style={styles.confidenceBarBg}>
                <View style={[styles.confidenceBarFill, { width: `${Math.round(event.confidenceScore * 100)}%` }]} />
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function SummarySection({ firestoreId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(true);

  const normalise = (raw) => {
    if (!raw) return null;
    // Support both new schema fields and old fallback field names
    return {
      ...raw,
      summary:             raw.summary             || raw.sessionOverview    || '',
      emotionalTrajectory: raw.emotionalTrajectory?.length
        ? raw.emotionalTrajectory
        : (raw.timeline ?? []).map(t => ({
            timestamp:      t.timestamp,
            emotionalState: t.event,
            confidenceScore: 0.5,
          })),
      themes:      raw.themes      || raw.keyThemes              || [],
      actionItems: raw.actionItems || raw.followUpConsiderations || [],
      riskLevel:   raw.riskLevel   || 'low',
      riskReason:  raw.riskReason  || (raw.recurringConcerns?.[0] ?? ''),
    };
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await generateSummary(firestoreId);
      setSummary(normalise(data?.summary ?? data));
      setExpanded(true);
    } catch (e) {
      setError('Could not generate briefing. Make sure the youth has had conversations with Sprout.');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (!firestoreId) return;
    setLoading(true);
    getSummary(firestoreId)
      .then(data => { setSummary(normalise(data?.summary ?? data)); setError(null); })
      .catch(() => setError(null))
      .finally(() => setLoading(false));
  }, [firestoreId]);

  if (!firestoreId) return null;

  return (
    <View style={{ marginTop: spacing.lg }}>
      <Pressable onPress={() => setExpanded(v => !v)} style={styles.summaryHeader}>
        <View>
          <Text style={styles.sectionLabel}>AI CASE BRIEFING</Text>
          <Text style={styles.summarySubtitle}>PDPA-compliant · PII redacted</Text>
        </View>
        <Text style={styles.summaryToggle}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>

      {expanded && (
        <MotiView
          from={{ opacity: 0, translateY: -6 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 300 }}
        >
          {loading ? (
            <GlassCard style={styles.summaryCard} radiusSize={radius.md}>
              <ActivityIndicator color={palette.mint} />
              <Text style={styles.summaryLoadingText}>Loading briefing…</Text>
            </GlassCard>

          ) : summary ? (
            <GlassCard style={styles.summaryCard} radiusSize={radius.md}>
              <View style={styles.summaryMetaRow}>
                <Text style={styles.summaryMeta}>
                  {new Date(summary.generatedAt).toLocaleString('en-SG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                  {' · '}{summary.messageCount} messages
                </Text>
                <RiskBadge level={summary.riskLevel ?? 'low'} />
              </View>

              {summary.riskReason ? (
                <View style={[styles.riskReasonBox, { borderColor: (RISK_CONFIG[summary.riskLevel] ?? RISK_CONFIG.low).border }]}>
                  <Text style={styles.riskReasonText}>{summary.riskReason}</Text>
                </View>
              ) : null}

              {summary.summary ? (
                <>
                  <Text style={styles.summaryFieldLabel}>SESSION OVERVIEW</Text>
                  <Text style={styles.summaryFieldText}>{summary.summary}</Text>
                </>
              ) : null}

              {summary.emotionalTrajectory?.length > 0 && (
                <>
                  <Text style={styles.summaryFieldLabel}>EMOTIONAL TRAJECTORY</Text>
                  <EmotionalTimeline trajectory={summary.emotionalTrajectory} />
                </>
              )}

              {summary.themes?.length > 0 && (
                <>
                  <Text style={styles.summaryFieldLabel}>KEY THEMES</Text>
                  <View style={styles.themeRow}>
                    {summary.themes.map((t, i) => (
                      <View key={i} style={styles.themePill}>
                        <Text style={styles.themePillText}>{t}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {summary.actionItems?.length > 0 && (
                <>
                  <Text style={styles.summaryFieldLabel}>FOLLOW-UP ACTIONS</Text>
                  {summary.actionItems.map((a, i) => (
                    <View key={i} style={styles.actionRow}>
                      <Text style={styles.actionIcon}>→</Text>
                      <Text style={styles.actionText}>{a}</Text>
                    </View>
                  ))}
                </>
              )}

              <Pressable onPress={handleGenerate} disabled={generating} style={styles.regenBtn}>
                {generating
                  ? <ActivityIndicator color={palette.mint} size="small" />
                  : <Text style={styles.regenBtnText}>↻  Refresh Briefing</Text>
                }
              </Pressable>
            </GlassCard>

          ) : (
            <GlassCard style={styles.summaryCard} radiusSize={radius.md}>
              <Text style={styles.summaryEmptyText}>
                No briefing generated yet. The AI will analyse Sprout conversation patterns and produce a PDPA-compliant case summary.
              </Text>
              {error && <Text style={styles.summaryError}>{error}</Text>}
              <Pressable onPress={handleGenerate} disabled={generating} style={styles.generateBtn}>
                {generating
                  ? <ActivityIndicator color={palette.ink} size="small" />
                  : <LinearGradient
                      colors={gradients.leaf}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.generateBtnInner}
                    >
                      <Text style={styles.generateBtnText}>✦  Generate Case Briefing</Text>
                    </LinearGradient>
                }
              </Pressable>
            </GlassCard>
          )}
        </MotiView>
      )}
    </View>
  );
}

export default function YouthCaseDetail({ route, navigation }) {
  const {
    caseId = '#H-008',
    youthName = 'Hana M.',
    caseKey = 'H-008',
    firestoreId = null,   // ← null for seed cases; real ID for Firestore profiles
    youthHouseConfig,
  } = route.params ?? {};

  const { caseHistories, ingestTranscript, updateDraft } = useVolatileTranscript();
  const [modalOpen, setModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const openEditForm = useCallback(async () => {
    setEditLoading(true);
    // Fetch full profile to pre-populate the edit form (phone, age, status, etc.)
    const profile = firestoreId ? await fetchYouthProfile(firestoreId) : null;
    setEditLoading(false);
    navigation.navigate('NewYouthForm', {
      editMode: true,
      firestoreId,
      currentData: profile ?? { name: youthName, caseId },
    });
  }, [firestoreId, youthName, caseId, navigation]);

  const histories = caseHistories[caseKey] ?? [];

  const handleConfirm = async (cfg) => {
    setGenerating(true);

    let payload;
    if (cfg.rawLines?.length) {
      payload = {
        source: cfg.platform,
        youthName,
        caseId,
        membershipStatus: 'Active Member',
        lines: cfg.rawLines,
      };
    } else {
      payload = await importChatFromSource(cfg.platform, { youthName, caseId });
    }

    ingestTranscript(cfg.platform, payload, cfg);

    // Generate AI summary and override the default draft assessment
    let importSummary = null;
    try {
      const lines = (payload.lines ?? []).slice(0, 120);
      importSummary = await summarizeImport(lines);
      // Override the default draft text with the real AI analysis
      if (importSummary?.overview) {
        updateDraft({ interventionPlan: importSummary.overview });
      }
    } catch (e) {
      console.warn('[Import] summarizeImport failed:', e?.message ?? e);
    }

    setGenerating(false);
    setModalOpen(false);

    navigation.navigate('CaseManagementForm', { caseKey, caseId, youthName, firestoreId, importSummary });
  };

  return (
    <GardenBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back}>
            <Text style={styles.backText}>‹ Village</Text>
          </Pressable>

          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>CASE {caseId}</Text>
              <Text style={styles.title}>{youthName}</Text>
            </View>
            {firestoreId && (
              <Pressable onPress={openEditForm} disabled={editLoading} style={styles.editBtn}>
                {editLoading
                  ? <ActivityIndicator color={palette.mint} size="small" />
                  : <Text style={styles.editBtnText}>✎ Edit</Text>
                }
              </Pressable>
            )}
          </View>

          {/* Path A context pill — confirms whose file is open */}
          <View style={styles.contextPill}>
            <View style={styles.contextDot} />
            <Text style={styles.contextText}>
              {firestoreId ? 'Live profile · interactions will be appended' : 'Local profile (offline mode)'}
            </Text>
          </View>

          <Text style={styles.sectionLabel}>THEIR SPACE</Text>
          <MiniRoomPreview youthHouseConfig={youthHouseConfig} height={230} />

          <SummarySection firestoreId={firestoreId} />

          <Text style={[styles.subtitle, { marginTop: spacing.lg }]}>Anonymized session history</Text>

          {histories.length === 0 ? (
            <GlassCard style={styles.empty} radiusSize={radius.md}>
              <Text style={styles.emptyText}>
                No prior summaries yet. Import a chat to begin a care file.
              </Text>
            </GlassCard>
          ) : (
            histories.map((entry, i) => <HistoryRow key={entry.id} entry={entry} index={i} />)
          )}

          <Pressable onPress={() => setModalOpen(true)} style={styles.importWrap}>
            <LinearGradient
              colors={gradients.leaf}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.importBtn}
            >
              <Text style={styles.importText}>↑  Import New Interactions</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <ImportConfigModal
        visible={modalOpen}
        onClose={() => !generating && setModalOpen(false)}
        onConfirm={handleConfirm}
        generating={generating}
        youthName={youthName}          // ← passed to modal for "Importing for:" banner
      />
    </GardenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 140 },
  back: { marginBottom: spacing.md },
  backText: { color: palette.mint, fontSize: 16, fontWeight: '700' },
  kicker: { ...typography.caption, color: palette.mint },
  title: { ...typography.display, marginTop: 4 },
  subtitle: { ...typography.body, color: palette.fog, marginTop: 6, marginBottom: spacing.lg },
  sectionLabel: { ...typography.caption, color: palette.mint, marginTop: spacing.md, marginBottom: 8 },

  contextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: spacing.md,
    backgroundColor: 'rgba(110,231,183,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(110,231,183,0.25)',
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  contextDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: palette.mint, marginRight: 7,
  },
  contextText: { color: palette.mint, fontSize: 11.5, fontWeight: '700' },

  historyCard: { marginBottom: 12 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  historyTime: { color: palette.fog, fontSize: 12.5, fontWeight: '700' },
  severityPill: {
    backgroundColor: 'rgba(110,231,183,0.18)', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(110,231,183,0.4)',
  },
  severityText: { color: palette.mint, fontSize: 11, fontWeight: '800' },
  historySummary: { color: palette.cloud, fontSize: 14.5, lineHeight: 20 },

  empty: { marginBottom: 12 },
  emptyText: { color: palette.fog, fontSize: 14, lineHeight: 20 },

  summaryHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  summarySubtitle: { color: palette.fog, fontSize: 10.5, fontWeight: '600', marginTop: 2, letterSpacing: 0.3 },
  summaryToggle: { color: palette.mint, fontSize: 12, fontWeight: '700' },
  summaryCard: { marginBottom: 12 },
  summaryLoadingText: { color: palette.fog, fontSize: 13, marginTop: 8, textAlign: 'center' },
  summaryMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  summaryMeta: { color: palette.fog, fontSize: 11, fontStyle: 'italic', flex: 1 },
  summaryFieldLabel: { color: palette.mint, fontSize: 11, fontWeight: '800', marginTop: 14, marginBottom: 6, letterSpacing: 0.8 },
  summaryFieldText: { color: palette.cloud, fontSize: 14, lineHeight: 22 },

  // Risk badge
  riskBadge: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, gap: 5,
  },
  riskIcon: { fontSize: 10, fontWeight: '900' },
  riskLabel: { fontSize: 10.5, fontWeight: '900', letterSpacing: 0.5 },
  riskReasonBox: {
    borderWidth: 1, borderRadius: radius.md, padding: 10, marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  riskReasonText: { color: palette.fog, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },

  // Emotional timeline
  timelineWrap: { gap: 0 },
  timelineRow: { flexDirection: 'row', minHeight: 52 },
  timelineDotCol: { width: 20, alignItems: 'center', paddingTop: 4 },
  timelineDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: palette.mint, marginBottom: 2,
  },
  timelineLine: { flex: 1, width: 1.5, backgroundColor: 'rgba(110,231,183,0.25)' },
  timelineContent: { flex: 1, paddingLeft: 10, paddingBottom: 14 },
  timelineTs: { color: palette.fog, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  timelineState: { color: palette.cloud, fontSize: 13.5, lineHeight: 19 },
  confidenceBarBg: {
    height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 5, overflow: 'hidden',
  },
  confidenceBarFill: { height: 3, borderRadius: 2, backgroundColor: palette.mint },

  // Themes
  themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  themePill: {
    backgroundColor: 'rgba(110,231,183,0.12)', borderWidth: 1, borderColor: 'rgba(110,231,183,0.35)',
    borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4,
  },
  themePillText: { color: palette.mint, fontSize: 12, fontWeight: '700' },

  // Action items
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  actionIcon: { color: palette.tealBright, fontSize: 14, fontWeight: '800', marginTop: 1 },
  actionText: { color: palette.cloud, fontSize: 13.5, lineHeight: 20, flex: 1 },

  summaryEmptyText: { color: palette.fog, fontSize: 14, lineHeight: 21, marginBottom: 14 },
  summaryError: { color: '#F56565', fontSize: 13, marginBottom: 10 },
  generateBtn: { marginTop: 4 },
  generateBtnInner: {
    height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
  },
  generateBtnText: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  regenBtn: {
    marginTop: 14, alignSelf: 'flex-end', backgroundColor: 'rgba(110,231,183,0.12)',
    borderWidth: 1, borderColor: 'rgba(110,231,183,0.35)', borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  regenBtnText: { color: palette.mint, fontSize: 13, fontWeight: '800' },

  // Review banner
  reviewBanner: {
    backgroundColor: 'rgba(110,231,183,0.10)', borderWidth: 1, borderColor: 'rgba(110,231,183,0.30)',
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14,
  },
  reviewBannerText: { color: palette.mint, fontSize: 12.5, fontWeight: '700' },

  // Saved banner
  savedBanner: {
    backgroundColor: 'rgba(72,187,120,0.12)', borderWidth: 1, borderColor: 'rgba(72,187,120,0.35)',
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12,
  },
  savedBannerText: { color: '#48BB78', fontSize: 12.5, fontWeight: '800' },

  // Risk selector
  riskSelectorRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  riskSelectorBtn: {
    flex: 1, borderWidth: 1.5, borderRadius: radius.md,
    paddingVertical: 8, alignItems: 'center', justifyContent: 'center',
  },
  riskSelectorText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

  // Edit inputs
  editInput: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    color: palette.cloud, fontSize: 14, lineHeight: 21, marginBottom: 8,
  },
  editActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  removeBtn: { padding: 8 },
  removeBtnText: { color: '#F56565', fontSize: 14, fontWeight: '800' },
  addActionBtn: { alignSelf: 'flex-start', marginBottom: 12 },
  addActionText: { color: palette.tealBright, fontSize: 13, fontWeight: '700' },

  // Review buttons
  reviewBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: {
    flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.md, paddingVertical: 12, alignItems: 'center',
  },
  cancelBtnText: { color: palette.fog, fontSize: 14, fontWeight: '700' },
  confirmBtn: {
    flex: 2, backgroundColor: palette.mint,
    borderRadius: radius.md, paddingVertical: 12, alignItems: 'center',
  },
  confirmBtnText: { color: palette.ink, fontSize: 14, fontWeight: '900' },
  editExistingBtn: {
    borderWidth: 1.5, borderColor: 'rgba(110,231,183,0.35)', borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'rgba(110,231,183,0.10)',
  },
  editExistingBtnText: { color: palette.mint, fontSize: 13, fontWeight: '800' },

  importWrap: { marginTop: spacing.lg },
  importBtn: {
    height: 62, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: palette.tealBright, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8, shadowRadius: 14, elevation: 10,
  },
  importText: { color: palette.ink, fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },

  titleRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  editBtn: {
    marginTop: 10,
    backgroundColor: 'rgba(110,231,183,0.14)',
    borderWidth: 1.5, borderColor: 'rgba(110,231,183,0.4)',
    borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  editBtnText: { color: palette.mint, fontSize: 13, fontWeight: '800' },
});
