/**
 * Calendar.js — Animated calendar dashboard
 *
 * Lets volunteers log and track scheduled case meetings. A simple month grid
 * with animated day cells plus an upcoming-meetings list. Selecting a day
 * springs it into focus.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotiView } from 'moti';
import GardenBackground from '../../components/GardenBackground';
import GlassCard from '../../components/GlassCard';
import { listEvents, createEvent } from '../../api/calendarService';
import { palette, radius, spacing, typography } from '../../theme/theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_INDEX = 5; // June (0-based) — matches the displayed "June 2026"
const YEAR = 2026;

// Parse a "HH:MM" string → [hours, minutes], or null if malformed.
function parseTime(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((str ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return [h, min];
}

/**
 * Map a backend event ({ id, title, start (ISO), durationMin }) to the meeting
 * card shape this screen renders. `start` drives both the day number (grid dot)
 * and the formatted time label.
 */
function toMeeting(evt) {
  const when = new Date(evt.start);
  const valid = !Number.isNaN(when.getTime());
  return {
    id: evt.id,
    day: valid ? when.getDate() : null,
    title: evt.title ?? 'Scheduled meeting',
    time: valid
      ? when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : '',
    durationMin: evt.durationMin,
  };
}

function DayCell({ day, selected, scheduled, onPress }) {
  return (
    <Pressable style={styles.cell} onPress={onPress}>
      <MotiView
        animate={{ scale: selected ? 1.12 : 1 }}
        transition={{ type: 'spring', damping: 13, stiffness: 200 }}
        style={[
          styles.cellInner,
          selected && styles.cellSelected,
        ]}
      >
        <Text style={[styles.cellText, selected && styles.cellTextSelected]}>{day}</Text>
        {scheduled && <View style={[styles.dot, selected && styles.dotSelected]} />}
      </MotiView>
    </Pressable>
  );
}

export default function Calendar() {
  const [selected, setSelected] = useState(12);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Add-event modal state.
  const [showAdd, setShowAdd] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formTime, setFormTime] = useState('10:00');
  const [formDuration, setFormDuration] = useState('30');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const daysInMonth = 30;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listEvents();
      setMeetings((data?.events ?? []).map(toMeeting));
    } catch (err) {
      setError(
        err?.status === 0
          ? "Couldn't reach the schedule — check your connection."
          : 'Failed to load meetings. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setSubmitError(null);
    setFormTitle('');
    setFormTime('10:00');
    setFormDuration('30');
    setShowAdd(true);
  };

  // Build the ISO start from the selected day + the time field, POST it, then
  // refresh so the new event appears in the list and lights its grid dot.
  const submitEvent = async () => {
    if (submitting) return;
    const title = formTitle.trim();
    const time = parseTime(formTime);
    const durationMin = Number(formDuration);
    if (!title) return setSubmitError('Please enter a title.');
    if (!time) return setSubmitError('Time must be in HH:MM (24-hour) format.');
    if (!(durationMin > 0)) return setSubmitError('Duration must be a positive number of minutes.');

    const start = new Date(YEAR, MONTH_INDEX, selected, time[0], time[1]).toISOString();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createEvent({ title, start, durationMin });
      setShowAdd(false);
      await load(); // re-pull so the list + dots reflect the new event
    } catch (err) {
      setSubmitError(
        err?.status === 0
          ? "Couldn't reach the calendar — check your connection."
          : 'Failed to save the event. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Days that carry a scheduled meeting (the dotted cells), derived from data.
  const scheduledDays = new Set(meetings.map((m) => m.day).filter((d) => d != null));

  return (
    <GardenBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.kicker}>SCHEDULE</Text>
          <Text style={styles.title}>June 2026</Text>
          <Text style={styles.subtitle}>Track your scheduled case meetings</Text>

          <GlassCard style={styles.calCard} radiusSize={radius.lg}>
            <View style={styles.weekRow}>
              {WEEKDAYS.map((d, i) => (
                <Text key={i} style={styles.weekday}>{d}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {days.map((day) => (
                <DayCell
                  key={day}
                  day={day}
                  selected={selected === day}
                  scheduled={scheduledDays.has(day)}
                  onPress={() => setSelected(day)}
                />
              ))}
            </View>
          </GlassCard>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Upcoming meetings</Text>
            <Pressable onPress={openAdd} style={styles.addBtn} hitSlop={8}>
              <Text style={styles.addBtnText}>＋ Add event</Text>
            </Pressable>
          </View>

          {loading && (
            <View style={styles.stateBox}>
              <ActivityIndicator color={palette.mint} />
              <Text style={styles.stateText}>Loading your schedule…</Text>
            </View>
          )}

          {!loading && error && (
            <GlassCard style={styles.stateCard} radiusSize={radius.md}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={load} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </GlassCard>
          )}

          {!loading && !error && meetings.length === 0 && (
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>No upcoming meetings.</Text>
            </View>
          )}

          {!loading && !error &&
            meetings.map((m, i) => (
              <MotiView
                key={m.id}
                from={{ opacity: 0, translateX: -10 }}
                animate={{ opacity: 1, translateX: 0 }}
                transition={{ type: 'timing', duration: 380, delay: i * 100 }}
              >
                <GlassCard style={styles.meeting} radiusSize={radius.md}>
                  <View style={styles.meetDateBox}>
                    <Text style={styles.meetDay}>{m.day ?? '—'}</Text>
                    <Text style={styles.meetMon}>JUN</Text>
                  </View>
                  <View style={styles.meetInfo}>
                    <Text style={styles.meetYouth}>{m.title}</Text>
                    <Text style={styles.meetMeta}>
                      {[m.time, m.durationMin ? `${m.durationMin} min` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </GlassCard>
              </MotiView>
            ))}
        </ScrollView>
      </SafeAreaView>

      {/* Add-event / create-milestone modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.backdropTap} onPress={() => setShowAdd(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <GlassCard style={styles.modalCard} radiusSize={radius.lg}>
              <Text style={styles.modalTitle}>New event</Text>
              <Text style={styles.modalSub}>
                On June {selected}, 2026 — tap a day on the grid to change the date.
              </Text>

              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.field}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="e.g. Check-in: Hana M."
                placeholderTextColor={palette.fog}
                editable={!submitting}
              />

              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Time (HH:MM)</Text>
                  <TextInput
                    style={styles.field}
                    value={formTime}
                    onChangeText={setFormTime}
                    placeholder="10:00"
                    placeholderTextColor={palette.fog}
                    keyboardType="numbers-and-punctuation"
                    editable={!submitting}
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Duration (min)</Text>
                  <TextInput
                    style={styles.field}
                    value={formDuration}
                    onChangeText={setFormDuration}
                    placeholder="30"
                    placeholderTextColor={palette.fog}
                    keyboardType="number-pad"
                    editable={!submitting}
                  />
                </View>
              </View>

              {submitError && <Text style={styles.modalError}>{submitError}</Text>}

              <View style={styles.modalRow}>
                <Pressable onPress={() => setShowAdd(false)} style={styles.cancelBtn} disabled={submitting}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={submitEvent}
                  disabled={submitting}
                  style={[styles.saveBtn, submitting && styles.saveBtnDisabled]}
                >
                  <Text style={styles.saveText}>{submitting ? 'Saving…' : 'Add to calendar'}</Text>
                </Pressable>
              </View>
            </GlassCard>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </GardenBackground>
  );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 140 },
  kicker: { ...typography.caption, color: palette.mint },
  title: { ...typography.display, marginTop: 4 },
  subtitle: { ...typography.body, color: palette.fog, marginTop: 6, marginBottom: spacing.lg },

  calCard: { marginBottom: spacing.lg },
  weekRow: { flexDirection: 'row', marginBottom: 10 },
  weekday: { width: CELL, textAlign: 'center', color: palette.fog, fontWeight: '800', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 3 },
  cellInner: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: {
    backgroundColor: palette.mint,
  },
  cellText: { color: palette.cloud, fontSize: 14, fontWeight: '600' },
  cellTextSelected: { color: palette.ink, fontWeight: '900' },
  dot: {
    position: 'absolute',
    bottom: 6,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.mint,
  },
  dotSelected: { backgroundColor: palette.ink },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { ...typography.heading, marginBottom: 0 },
  addBtn: {
    backgroundColor: palette.mint,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addBtnText: { color: palette.ink, fontWeight: '900', fontSize: 13 },

  // Add-event modal
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  backdropTap: { flex: 1 },
  modalCard: { margin: spacing.lg, padding: spacing.lg, gap: 4 },
  modalTitle: { ...typography.heading },
  modalSub: { ...typography.body, color: palette.fog, marginBottom: 10 },
  fieldLabel: { color: palette.fog, fontWeight: '800', fontSize: 12, marginTop: 10, marginBottom: 6 },
  field: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: palette.white,
    fontSize: 15,
    fontWeight: '600',
  },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldHalf: { flex: 1 },
  modalError: { color: '#FF9B8A', fontSize: 13, fontWeight: '700', marginTop: 12 },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 18 },
  cancelBtn: { paddingHorizontal: 18, paddingVertical: 11 },
  cancelText: { color: palette.fog, fontWeight: '800', fontSize: 14 },
  saveBtn: {
    backgroundColor: palette.mint,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: radius.md,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { color: palette.ink, fontWeight: '900', fontSize: 14 },

  stateBox: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  stateText: { color: palette.fog, fontSize: 14, fontWeight: '600' },
  stateCard: { alignItems: 'center', paddingVertical: 20, gap: 14 },
  errorText: { color: palette.cloud, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  retryBtn: {
    backgroundColor: palette.mint,
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: radius.md,
  },
  retryText: { color: palette.ink, fontWeight: '900', fontSize: 13 },
  meeting: { marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  meetDateBox: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: 'rgba(110,231,183,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  meetDay: { color: palette.mint, fontSize: 20, fontWeight: '900' },
  meetMon: { color: palette.mint, fontSize: 10, fontWeight: '700' },
  meetInfo: { flex: 1 },
  meetYouth: { color: palette.white, fontSize: 16, fontWeight: '800' },
  meetMeta: { color: palette.fog, fontSize: 13, marginTop: 3 },
});
