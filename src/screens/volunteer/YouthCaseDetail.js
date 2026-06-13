/**
 * YouthCaseDetail.js — Case main page & import journey
 *
 * - Historic view: a chronological list of past *anonymized* case summaries
 *   pulled from retained (sanitized) history in the volatile context.
 * - Action interface: an "Import New Chat" button that opens an organic ripple
 *   modal to choose an ingestion source (Telegram / WhatsApp). Selecting a
 *   source simulates ingestion, fills the volatile buffer, and routes straight
 *   to CaseManagementForm.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { useVolatileTranscript } from '../../context/VolatileTranscriptContext';
import { importChatFromSource } from '../../api/ingestionService';
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

function SourceButton({ label, glyph, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.sourceWrap}>
      <LinearGradient colors={gradients.leaf} style={styles.sourceBtn}>
        <Text style={styles.sourceGlyph}>{glyph}</Text>
        <Text style={styles.sourceLabel}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export default function YouthCaseDetail({ route, navigation }) {
  const { caseId = '#H-008', youthName = 'Hana M.', caseKey = 'H-008' } = route.params ?? {};
  const { caseHistories, ingestTranscript } = useVolatileTranscript();
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingSource, setLoadingSource] = useState(null);

  const histories = caseHistories[caseKey] ?? [];

  const handleImport = async (source) => {
    setLoadingSource(source);
    // Simulated ingestion -> volatile buffer only.
    const payload = await importChatFromSource(source, { youthName, caseId });
    ingestTranscript(source, payload);
    setLoadingSource(null);
    setModalOpen(false);
    // Route immediately into the editable AI template.
    navigation.navigate('CaseManagementForm', { caseKey, caseId, youthName });
  };

  return (
    <GardenBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back}>
            <Text style={styles.backText}>‹ Garden</Text>
          </Pressable>

          <Text style={styles.kicker}>CASE {caseId}</Text>
          <Text style={styles.title}>{youthName}</Text>
          <Text style={styles.subtitle}>Anonymized session history</Text>

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
              <Text style={styles.importText}>+  Import New Chat</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      {/* Organic ripple modal for choosing an ingestion source */}
      <Modal transparent visible={modalOpen} animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !loadingSource && setModalOpen(false)}>
          {/* expanding ripple rings */}
          <MotiView
            from={{ opacity: 0.4, scale: 0.2 }}
            animate={{ opacity: 0, scale: 2.4 }}
            transition={{ type: 'timing', duration: 1600, loop: true }}
            style={styles.ripple}
          />
          <MotiView
            from={{ opacity: 0, translateY: 24, scale: 0.95 }}
            animate={{ opacity: 1, translateY: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 16, stiffness: 180 }}
          >
            <GlassCard radiusSize={radius.xl} style={styles.modalCard}>
              <Text style={styles.modalTitle}>Choose ingestion source</Text>
              <Text style={styles.modalSub}>
                The transcript is held in volatile memory only.
              </Text>

              {loadingSource ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color={palette.mint} />
                  <Text style={styles.loadingText}>Ingesting from {loadingSource}…</Text>
                </View>
              ) : (
                <View style={styles.sourceRow}>
                  <SourceButton label="Telegram" glyph="✈" onPress={() => handleImport('Telegram')} />
                  <SourceButton label="WhatsApp" glyph="✆" onPress={() => handleImport('WhatsApp')} />
                </View>
              )}
            </GlassCard>
          </MotiView>
        </Pressable>
      </Modal>
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

  historyCard: { marginBottom: 12 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  historyTime: { color: palette.fog, fontSize: 12.5, fontWeight: '700' },
  severityPill: {
    backgroundColor: 'rgba(110,231,183,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(110,231,183,0.4)',
  },
  severityText: { color: palette.mint, fontSize: 11, fontWeight: '800' },
  historySummary: { color: palette.cloud, fontSize: 14.5, lineHeight: 20 },

  empty: { marginBottom: 12 },
  emptyText: { color: palette.fog, fontSize: 14, lineHeight: 20 },

  importWrap: { marginTop: spacing.lg },
  importBtn: {
    height: 58,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: palette.tealBright,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 14,
    elevation: 10,
  },
  importText: { color: palette.ink, fontSize: 17, fontWeight: '900', letterSpacing: 0.3 },

  // modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,17,13,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  ripple: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: palette.tealBright,
  },
  modalCard: { width: 320 },
  modalTitle: { ...typography.title, marginBottom: 6 },
  modalSub: { color: palette.fog, fontSize: 13, marginBottom: spacing.lg },
  sourceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sourceWrap: { width: '47%' },
  sourceBtn: {
    height: 92,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  sourceGlyph: { fontSize: 26, color: palette.ink, marginBottom: 6 },
  sourceLabel: { color: palette.ink, fontSize: 15, fontWeight: '900' },
  loadingBox: { alignItems: 'center', paddingVertical: spacing.lg },
  loadingText: { color: palette.cloud, marginTop: 12, fontSize: 14, fontWeight: '600' },
});
