/**
 * ImportConfigModal.js — Multi-step chat ingestion configuration overlay.
 *
 * Three sequential sections walk the worker through:
 *   1. Platform selector  — WhatsApp (.txt) or Telegram (.json/.txt)
 *   2. File picker        — simulated local-storage access with success state
 *   3. Time-range filter  — preset segments or native date/time pickers
 *
 * SCROLL FIX: The glass sheet is a direct BlurView construction (not GlassCard)
 * so flex can flow properly down to the inner ScrollView. GlassCard's internal
 * BlurView has overflow:hidden and no flex, which clipped content on smaller
 * devices.
 *
 * DATE FIX: Manual TextInput replaced with @react-native-community/datetimepicker
 * (bundled in Expo Go SDK 54). Custom preset shows tap-to-open native pickers.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system/next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, palette, radius, spacing, typography } from '../../theme/theme';
import { resolveDatePreset } from '../../context/VolatileTranscriptContext';
import { extractWhatsAppZip, parseTelegram, parsePastedText } from '../../api/chatFileParser';

const { height: SCREEN_H } = Dimensions.get('window');

/* ─────────────────────────── Constants ─────────────────────────── */

const PLATFORMS = [
  { key: 'WhatsApp', label: 'WhatsApp', hint: 'Export (.zip)', glyph: '✆' },
  { key: 'Telegram', label: 'Telegram', hint: 'Desktop .json or paste', glyph: '✈' },
];

const PRESET_OPTIONS = [
  { key: 'last24h', label: '24 Hours' },
  { key: '3days',   label: '3 Days'   },
  { key: 'pastWeek', label: '1 Week'  },
  { key: 'custom',   label: 'Custom'  },
];

const FAKE_FILE_NAMES = {
  WhatsApp: 'WhatsApp Chat - Hana M. (2026).txt',
  Telegram: 'Telegram Export - Private Chat (2026).json',
};

/* ─────────────────────────── Helpers ─────────────────────────── */

function fmtDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(d) {
  if (!d) return '—';
  return d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function SectionHeader({ step, label }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNum}>{step}</Text>
      </View>
      <Text style={styles.sectionTitle}>{label}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const PDPA_STEPS = [
  'Stripping personal identifiers…',
  'Redacting phone numbers & NRICs…',
  'Replacing sender names with [USER_X] tokens…',
  'Filtering transcript to selected time range…',
  'Generating anonymized AI summary…',
];

function PDPAStepList() {
  return (
    <View style={styles.pdpaSteps}>
      {PDPA_STEPS.map((step, i) => (
        <MotiView
          key={step}
          from={{ opacity: 0, translateX: -8 }}
          animate={{ opacity: 1, translateX: 0 }}
          transition={{ type: 'timing', duration: 280, delay: i * 140 }}
          style={styles.pdpaStepRow}
        >
          <View style={styles.pdpaDot} />
          <Text style={styles.pdpaStepText}>{step}</Text>
        </MotiView>
      ))}
    </View>
  );
}

/* ─────────────────────────── Native date-time picker rows ─────────────────────────── */

/**
 * A tappable row that opens the native DateTimePicker.
 * On Android the picker is a dialog; on iOS it renders inline when open.
 */
function DatePickerRow({ label, value, onChange }) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  const onDateChange = (_, selected) => {
    setShowDate(Platform.OS === 'ios'); // stay open on iOS, close on Android
    if (selected) {
      // Preserve existing time component
      const merged = new Date(selected);
      merged.setHours(value.getHours(), value.getMinutes(), 0, 0);
      onChange(merged);
      if (Platform.OS !== 'ios') setShowTime(true); // chain to time picker on Android
    }
  };

  const onTimeChange = (_, selected) => {
    setShowTime(false);
    if (selected) {
      const merged = new Date(value);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      onChange(merged);
    }
  };

  return (
    <View style={styles.dateRow}>
      <Text style={styles.dateRowLabel}>{label}</Text>
      <View style={styles.dateRowPickers}>
        <Pressable onPress={() => setShowDate(true)} style={styles.dateChip}>
          <Text style={styles.dateChipText}>{fmtDate(value)}</Text>
        </Pressable>
        <Pressable onPress={() => setShowTime(true)} style={styles.dateChip}>
          <Text style={styles.dateChipText}>{fmtTime(value)}</Text>
        </Pressable>
      </View>

      {showDate && (
        <DateTimePicker
          value={value}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
          maximumDate={new Date()}
          themeVariant="dark"
        />
      )}
      {showTime && (
        <DateTimePicker
          value={value}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onTimeChange}
          themeVariant="dark"
        />
      )}
    </View>
  );
}

/* ─────────────────────────── Main component ─────────────────────────── */

export default function ImportConfigModal({ visible, onClose, onConfirm, generating, youthName }) {
  const [platform, setPlatform] = useState('WhatsApp');
  const [filePicked, setFilePicked] = useState(false);
  const [pickingFile, setPickingFile] = useState(false);
  const [pickedFileName, setPickedFileName] = useState(null);
  const [pickedLines, setPickedLines] = useState(null);
  const [pickError, setPickError] = useState(null);
  // Telegram mobile: worker pastes raw messages instead of uploading a file
  const [telegramPasteMode, setTelegramPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [preset, setPreset] = useState('pastWeek');

  // Custom range state — default to "last 7 days → now"
  const [customStart, setCustomStart] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
  const [customEnd, setCustomEnd] = useState(new Date());

  const canGenerate = filePicked && platform;
  const isCustom = preset === 'custom';

  const resetFileState = () => {
    setFilePicked(false);
    setPickedFileName(null);
    setPickedLines(null);
    setPickError(null);
    setPastedText('');
  };

  const handlePickFile = async () => {
    if (filePicked) { resetFileState(); return; }

    setPickingFile(true);
    setPickError(null);
    try {
      if (platform === 'WhatsApp') {
        // WhatsApp exports a .zip — pick it and extract _chat.txt inside
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/zip', 'application/x-zip-compressed', '*/*'],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.length) return;

        const asset = result.assets[0];
        const { lines, fileName } = await extractWhatsAppZip(asset.uri);
        setPickedFileName(asset.name + ' → ' + fileName);
        setPickedLines(lines);
        setFilePicked(true);

      } else {
        // Telegram Desktop: pick .json export file
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/json', '*/*'],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.length) return;

        const asset = result.assets[0];
        const rawText = await new File(asset.uri).text();
        const lines = parseTelegram(rawText);
        setPickedFileName(asset.name);
        setPickedLines(lines);
        setFilePicked(true);
      }
    } catch (err) {
      setPickError(err.message ?? 'Could not read file.');
    } finally {
      setPickingFile(false);
    }
  };

  // Confirm pasted Telegram text
  const handleConfirmPaste = () => {
    if (!pastedText.trim()) return;
    const lines = parsePastedText(pastedText);
    if (lines.length === 0) {
      setPickError('No text found. Paste some messages and try again.');
      return;
    }
    setPickedFileName('Pasted Telegram messages');
    setPickedLines(lines);
    setFilePicked(true);
    setPickError(null);
  };

  const handlePlatformChange = (key) => {
    setPlatform(key);
    setTelegramPasteMode(false);
    resetFileState();
  };

  const handleGenerate = () => {
    const { rangeStart, rangeEnd } = resolveDatePreset(
      preset,
      isCustom ? customStart.toISOString() : null,
      isCustom ? customEnd.toISOString() : null
    );
    onConfirm({
      platform,
      fileName: pickedFileName,
      rawLines: pickedLines,         // real parsed lines from the actual file
      rangePreset: preset,
      rangeStart: rangeStart?.toISOString() ?? null,
      rangeEnd: rangeEnd?.toISOString() ?? null,
    });
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => !generating && onClose()}
    >
      {/* Full-screen overlay — slides up from bottom */}
      <View style={styles.overlay}>

        {/* Tap backdrop area above the sheet to dismiss */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => !generating && onClose()} />

        {/* ── Bottom sheet — explicit dimensions, reliable on every device ── */}
        <View style={styles.sheet}>

          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Fixed header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Import New Interactions</Text>
            {youthName ? (
              <View style={styles.forWhomBadge}>
                <Text style={styles.forWhomText}>Importing interactions for: </Text>
                <Text style={styles.forWhomName}>{youthName}</Text>
              </View>
            ) : null}
            <Text style={styles.sheetSub}>
              All data stays in volatile memory. Configure below before generating.
            </Text>
          </View>

          {/* Scrollable body — explicit maxHeight so it scrolls reliably */}
          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {/* Section 1: Platform */}
            <SectionHeader step="1" label="Choose source platform" />
            <View style={styles.platformRow}>
              {PLATFORMS.map((p) => {
                const active = platform === p.key;
                return (
                  <Pressable
                    key={p.key}
                    style={[styles.platformCard, active && styles.platformCardActive]}
                    onPress={() => handlePlatformChange(p.key)}
                  >
                    {active ? (
                      <LinearGradient colors={gradients.leaf} style={styles.platformInner}>
                        <Text style={[styles.platformGlyph, { color: palette.ink }]}>{p.glyph}</Text>
                        <Text style={[styles.platformLabel, { color: palette.ink }]}>{p.label}</Text>
                        <Text style={[styles.platformHint, { color: 'rgba(4,17,13,0.65)' }]}>{p.hint}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={styles.platformInner}>
                        <Text style={styles.platformGlyph}>{p.glyph}</Text>
                        <Text style={styles.platformLabel}>{p.label}</Text>
                        <Text style={styles.platformHint}>{p.hint}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <Divider />

            {/* Section 2: Load chat data */}
            <SectionHeader step="2" label={platform === 'WhatsApp' ? 'Choose WhatsApp export (.zip)' : 'Load Telegram messages'} />

            {/* Telegram: toggle between file pick and paste */}
            {platform === 'Telegram' && !filePicked && (
              <View style={styles.telegramToggleRow}>
                <Pressable
                  style={[styles.toggleBtn, !telegramPasteMode && styles.toggleBtnActive]}
                  onPress={() => { setTelegramPasteMode(false); resetFileState(); }}
                >
                  <Text style={[styles.toggleBtnText, !telegramPasteMode && styles.toggleBtnTextActive]}>
                    📁  Desktop .json file
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, telegramPasteMode && styles.toggleBtnActive]}
                  onPress={() => { setTelegramPasteMode(true); resetFileState(); }}
                >
                  <Text style={[styles.toggleBtnText, telegramPasteMode && styles.toggleBtnTextActive]}>
                    📋  Paste messages
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Telegram paste mode */}
            {platform === 'Telegram' && telegramPasteMode && !filePicked ? (
              <View style={styles.pasteBlock}>
                <Text style={styles.pasteHint}>
                  On Telegram mobile: open the chat, long-press a message → Select more → copy them, then paste below.
                </Text>
                <TextInput
                  style={styles.pasteInput}
                  value={pastedText}
                  onChangeText={setPastedText}
                  placeholder="Paste messages here…"
                  placeholderTextColor={palette.fog}
                  multiline
                  textAlignVertical="top"
                />
                {pickError && <Text style={styles.pasteError}>{pickError}</Text>}
                <Pressable
                  style={[styles.pasteConfirmBtn, !pastedText.trim() && { opacity: 0.4 }]}
                  onPress={handleConfirmPaste}
                  disabled={!pastedText.trim()}
                >
                  <Text style={styles.pasteConfirmText}>Confirm Paste</Text>
                </Pressable>
              </View>
            ) : (
              /* File picker button — WhatsApp zip OR Telegram json */
              <Pressable onPress={handlePickFile}>
                <View style={[styles.filePicker, filePicked && styles.filePickerSuccess, pickError && styles.filePickerError]}>
                  {pickingFile ? (
                    <>
                      <ActivityIndicator color={palette.mint} style={{ marginRight: 12 }} />
                      <Text style={styles.filePickerLabel}>Reading file…</Text>
                    </>
                  ) : filePicked ? (
                    <>
                      <Text style={styles.filePickerIcon}>✓</Text>
                      <View style={styles.fileNameBlock}>
                        <Text style={styles.filePickerSuccessLabel}>
                          {pickedLines?.length ?? 0} messages loaded
                        </Text>
                        <Text style={styles.fileName} numberOfLines={1}>{pickedFileName}</Text>
                      </View>
                      <Text style={styles.fileChangeHint}>tap to change</Text>
                    </>
                  ) : pickError ? (
                    <>
                      <Text style={styles.filePickerIcon}>⚠</Text>
                      <View style={styles.fileNameBlock}>
                        <Text style={styles.filePickerErrorLabel}>Could not read file</Text>
                        <Text style={styles.filePickerErrorText} numberOfLines={2}>{pickError}</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={styles.filePickerIcon}>📂</Text>
                      <View style={styles.fileNameBlock}>
                        <Text style={styles.filePickerLabel}>
                          {platform === 'WhatsApp' ? 'Choose WhatsApp .zip' : 'Choose Telegram .json'}
                        </Text>
                        <Text style={styles.filePickerSub}>
                          {platform === 'WhatsApp'
                            ? 'WhatsApp → chat → ⋮ → More → Export Chat'
                            : 'Telegram Desktop → Settings → Advanced → Export data'}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </Pressable>
            )}

            <Divider />

            {/* Section 3: Time-range filter */}
            <SectionHeader step="3" label="Filter by time range" />
            <View style={styles.presetGrid}>
              {PRESET_OPTIONS.map((opt) => {
                const active = preset === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                    onPress={() => setPreset(opt.key)}
                  >
                    <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {isCustom && (
              <View style={styles.customBlock}>
                <DatePickerRow label="From" value={customStart} onChange={setCustomStart} />
                <DatePickerRow label="To"   value={customEnd}   onChange={setCustomEnd}   />
              </View>
            )}

            {/* Generate button */}
            <Pressable
              onPress={handleGenerate}
              disabled={!canGenerate || generating}
              style={[styles.generateWrap, (!canGenerate || generating) && { opacity: 0.55 }]}
            >
              <LinearGradient
                colors={canGenerate ? gradients.leaf : ['rgba(110,231,183,0.22)', 'rgba(56,178,172,0.22)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.generateBtn}
              >
                {generating ? (
                  <View style={styles.generateLoading}>
                    <ActivityIndicator color={palette.ink} size="small" />
                    <Text style={[styles.generateText, { color: palette.ink, marginLeft: 10 }]}>
                      Generating AI Case Summary…
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.generateText, { color: canGenerate ? palette.ink : palette.fog }]}>
                    ✦  Generate AI Case Summary
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            {/* PDPA status — shown while generating */}
            {generating && (
              <View style={styles.pdpaPanel}>
                <View style={styles.pdpaTitleRow}>
                  <Text style={styles.pdpaLockIcon}>🔒</Text>
                  <Text style={styles.pdpaTitle}>Client-side PDPA Filter Active</Text>
                </View>
                <PDPAStepList />
              </View>
            )}

            {!filePicked && !generating && (
              <Text style={styles.hintText}>Select a file above to enable generation.</Text>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ─────────────────────────── Styles ─────────────────────────── */

const styles = StyleSheet.create({
  /* Full-screen overlay sitting behind the sheet */
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(4,17,13,0.72)',
  },

  /* Bottom sheet — explicit pixel height so ScrollView knows its bounds */
  sheet: {
    backgroundColor: '#0C1F18',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.12)',
    maxHeight: SCREEN_H * 0.88,
    paddingBottom: 8,
  },

  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },

  sheetHeader: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  sheetTitle: { ...typography.title, marginBottom: 6 },
  sheetSub: { color: palette.fog, fontSize: 13, lineHeight: 18 },

  /* ScrollView with explicit maxHeight — the key fix */
  scrollBody: { maxHeight: SCREEN_H * 0.65 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4 },

  /* Section headers */
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  stepBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(110,231,183,0.22)',
    borderWidth: 1.5, borderColor: 'rgba(110,231,183,0.5)',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  stepNum: { color: palette.mint, fontSize: 12, fontWeight: '800' },
  sectionTitle: { color: palette.cloud, fontSize: 14.5, fontWeight: '700' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: spacing.md },

  /* Platform selector */
  platformRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  platformCard: {
    flex: 1, borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  platformCardActive: { borderColor: 'rgba(110,231,183,0.6)' },
  platformInner: { paddingVertical: 18, alignItems: 'center' },
  platformGlyph: { fontSize: 24, color: palette.cloud, marginBottom: 6 },
  platformLabel: { fontSize: 15, fontWeight: '900', color: palette.cloud },
  platformHint: { fontSize: 10.5, color: palette.fog, marginTop: 3, fontWeight: '600' },

  /* File picker */
  filePicker: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.md, borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed',
    paddingVertical: 16, paddingHorizontal: 16, minHeight: 68,
  },
  filePickerSuccess: {
    borderColor: 'rgba(110,231,183,0.5)',
    backgroundColor: 'rgba(110,231,183,0.08)', borderStyle: 'solid',
  },
  filePickerIcon: { fontSize: 22, marginRight: 12 },
  filePickerLabel: { color: palette.cloud, fontSize: 15, fontWeight: '700' },
  filePickerSub: { color: palette.fog, fontSize: 12, marginTop: 2 },
  filePickerSuccessLabel: { color: palette.mint, fontSize: 12.5, fontWeight: '800', marginBottom: 2 },
  fileNameBlock: { flex: 1 },
  fileName: { color: palette.cloud, fontSize: 13, fontWeight: '600' },
  fileChangeHint: { color: palette.fog, fontSize: 11, fontWeight: '600', marginLeft: 8 },
  filePickerError: {
    borderColor: 'rgba(245,101,101,0.5)',
    backgroundColor: 'rgba(245,101,101,0.08)',
    borderStyle: 'solid',
  },
  filePickerErrorLabel: { color: palette.riskHigh, fontSize: 12.5, fontWeight: '800', marginBottom: 2 },
  filePickerErrorText: { color: palette.fog, fontSize: 12, lineHeight: 16 },

  /* Telegram toggle */
  telegramToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  toggleBtn: {
    flex: 1, paddingVertical: 9, paddingHorizontal: 10,
    borderRadius: radius.md, borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  toggleBtnActive: {
    borderColor: 'rgba(110,231,183,0.55)',
    backgroundColor: 'rgba(110,231,183,0.12)',
  },
  toggleBtnText: { color: palette.fog, fontSize: 12.5, fontWeight: '700' },
  toggleBtnTextActive: { color: palette.mint },

  /* Telegram paste block */
  pasteBlock: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.md, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)', padding: 14,
  },
  pasteHint: { color: palette.fog, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  pasteInput: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.sm, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    padding: 12, color: palette.white,
    fontSize: 13, minHeight: 100, lineHeight: 19,
  },
  pasteError: { color: palette.riskHigh, fontSize: 12, marginTop: 8, fontWeight: '600' },
  pasteConfirmBtn: {
    marginTop: 10, backgroundColor: 'rgba(110,231,183,0.18)',
    borderRadius: radius.md, borderWidth: 1.5,
    borderColor: 'rgba(110,231,183,0.4)',
    paddingVertical: 10, alignItems: 'center',
  },
  pasteConfirmText: { color: palette.mint, fontWeight: '800', fontSize: 14 },

  /* Preset chips */
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  presetChip: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.14)',
  },
  presetChipActive: {
    backgroundColor: 'rgba(110,231,183,0.18)', borderColor: 'rgba(110,231,183,0.55)',
  },
  presetLabel: { color: palette.fog, fontSize: 13, fontWeight: '700' },
  presetLabelActive: { color: palette.mint },

  /* Custom date/time pickers */
  customBlock: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.md, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 14, marginBottom: 14, gap: 10,
  },
  dateRow: {},
  dateRowLabel: { color: palette.fog, fontSize: 11.5, fontWeight: '700', marginBottom: 8, letterSpacing: 0.3 },
  dateRowPickers: { flexDirection: 'row', gap: 8 },
  dateChip: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.sm, borderWidth: 1,
    borderColor: 'rgba(110,231,183,0.3)',
    alignItems: 'center',
  },
  dateChipText: { color: palette.cloud, fontSize: 13.5, fontWeight: '700' },

  /* Generate button */
  generateWrap: { marginTop: 6 },
  generateBtn: {
    borderRadius: radius.lg, paddingVertical: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: palette.tealBright,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.7, shadowRadius: 14, elevation: 10,
  },
  generateText: { fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  generateLoading: { flexDirection: 'row', alignItems: 'center' },

  /* PDPA panel */
  pdpaPanel: {
    marginTop: 12, backgroundColor: 'rgba(56,178,172,0.08)',
    borderWidth: 1, borderColor: 'rgba(56,178,172,0.3)',
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12,
  },
  pdpaTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pdpaLockIcon: { fontSize: 14, marginRight: 7 },
  pdpaTitle: { color: palette.tealBright, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.2, flexShrink: 1 },
  pdpaSteps: { gap: 6 },
  pdpaStepRow: { flexDirection: 'row', alignItems: 'center' },
  pdpaDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.mint, marginRight: 8, opacity: 0.7 },
  pdpaStepText: { color: palette.fog, fontSize: 12, fontWeight: '600', flexShrink: 1 },

  hintText: { color: palette.fog, fontSize: 12, textAlign: 'center', marginTop: 10, fontWeight: '600' },

  forWhomBadge: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' },
  forWhomText: { color: palette.fog, fontSize: 12.5, fontWeight: '600' },
  forWhomName: { color: palette.mint, fontSize: 12.5, fontWeight: '900' },
});
