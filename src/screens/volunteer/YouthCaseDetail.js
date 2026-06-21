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

import React, { useState, useCallback } from 'react';
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

export default function YouthCaseDetail({ route, navigation }) {
  const {
    caseId = '#H-008',
    youthName = 'Hana M.',
    caseKey = 'H-008',
    firestoreId = null,   // ← null for seed cases; real ID for Firestore profiles
    youthHouseConfig,
  } = route.params ?? {};

  const { caseHistories, ingestTranscript } = useVolatileTranscript();
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
    setGenerating(false);
    setModalOpen(false);

    // firestoreId is forwarded so CaseManagementForm can execute Path A
    navigation.navigate('CaseManagementForm', { caseKey, caseId, youthName, firestoreId });
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
