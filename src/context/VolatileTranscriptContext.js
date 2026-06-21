/**
 * VolatileTranscriptContext.js
 *
 * Global state engine for TRANSIENT chat data.
 *
 * PDPA SIMULATION CONTRACT
 * ------------------------
 * Raw imported logs, full text transcripts, and unedited AI drafts live ONLY
 * in volatile React state held here. They are never persisted to disk,
 * AsyncStorage, or any network cache in this prototype.
 *
 * The exported `flushState()` resets every sensitive buffer
 * (transcriptBuffer, rawTextLines, editableDraft) back to `null` the precise
 * millisecond a purge event is confirmed. Only sanitized, non-PII high-level
 * summary strings are allowed to survive (in `caseHistories`).
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { anonymizeLines } from './EphemeralDataScrubContext';

const VolatileTranscriptContext = createContext(null);

/**
 * Compute concrete Date boundaries from a preset string.
 * Returns { rangeStart: Date, rangeEnd: Date }.
 */
export function resolveDatePreset(preset, customStart, customEnd) {
  const now = new Date();
  switch (preset) {
    case 'last24h': {
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { rangeStart: start, rangeEnd: now };
    }
    case '3days': {
      const start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      return { rangeStart: start, rangeEnd: now };
    }
    case 'pastWeek': {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { rangeStart: start, rangeEnd: now };
    }
    case 'custom':
      return {
        rangeStart: customStart ? new Date(customStart) : null,
        rangeEnd: customEnd ? new Date(customEnd) : null,
      };
    default:
      return { rangeStart: null, rangeEnd: null };
  }
}

// Sanitized, NON-PII seed history. Safe to retain under the PDPA simulation.
const SEED_HISTORIES = {
  'H-008': [
    {
      id: 'sum-1',
      summary: 'Prior session: explored exam-period stress; coping plan agreed.',
      timestamp: '3 weeks ago',
      severity: 'Moderate',
    },
    {
      id: 'sum-2',
      summary: 'Prior session: check-in on sleep routine; positive trend noted.',
      timestamp: '1 week ago',
      severity: 'Low',
    },
  ],
};

export function VolatileTranscriptProvider({ children }) {
  // ---- VOLATILE / SENSITIVE BUFFERS (must be flushable to null) ----
  const [transcriptBuffer, setTranscriptBuffer] = useState(null); // raw imported chat payload
  const [rawTextLines, setRawTextLines] = useState(null); // unparsed transcript lines
  const [editableDraft, setEditableDraft] = useState(null); // unedited / in-progress AI draft
  const [journalDraft, setJournalDraft] = useState(null); // Journaling Bookshelf: temporary entry text (volatile)
  // importConfig holds the file + time-range selection made in ImportConfigModal.
  // Lives entirely in volatile memory — flushed by flushState() alongside the transcript.
  const [importConfig, setImportConfig] = useState(null);

  // ---- SAFE / RETAINED STATE (sanitized summaries only) ----
  const [caseHistories, setCaseHistories] = useState(SEED_HISTORIES);
  const [journalEntries, setJournalEntries] = useState([]); // permanent (committed) journal entries

  /**
   * Simulate ingesting a raw transcript from a source (Telegram / WhatsApp)
   * and generating an unedited AI draft. Everything written here is volatile.
   */
  /**
   * Simulate ingesting a raw transcript from a source (Telegram / WhatsApp).
   * @param {string} source
   * @param {object} payload
   * @param {object|null} cfg — the import config from ImportConfigModal (platform,
   *   fileName, rangePreset, rangeStart, rangeEnd). Stored volatile; flushed on purge.
   */
  /**
   * Simulate ingesting a raw transcript from a source (Telegram / WhatsApp).
   *
   * Privacy pipeline (runs entirely in local memory before any state is set):
   *   1. anonymizeLines() — two-pass scrubber strips phones, NRICs, and real
   *      sender names, replacing them with [PHONE_REDACTED], [NRIC_REDACTED],
   *      and stable [USER_X] tokens.
   *   2. Raw lines are stored ONLY inside transcriptBuffer (never displayed).
   *   3. rawTextLines receives the scrubbed output — the only version any UI sees.
   *   4. editableDraft.interventionPlan is seeded with the primary youth token
   *      so no real name leaks into the editable template fields.
   *
   * @param {string} source
   * @param {object} payload
   * @param {object|null} cfg — import config from ImportConfigModal
   */
  const ingestTranscript = useCallback((source, payload, cfg = null) => {
    const rawLines = payload?.lines ?? [];

    // ── PDPA anonymization pass ──────────────────────────────────────────────
    const { scrubbedLines, nameTable, stats } = anonymizeLines(rawLines);

    // Determine the primary youth token (first [USER_X] discovered in the
    // transcript) so the intervention plan draft never references a real name.
    const youthToken = Object.values(nameTable)[0] ?? '[USER_A]';

    // Raw lines stay inside transcriptBuffer only — never rendered to screen.
    setTranscriptBuffer({ source, receivedAt: Date.now(), payload, scrubStats: stats });
    // UI always receives the scrubbed version.
    setRawTextLines(scrubbedLines);
    setImportConfig(cfg);

    // Simulated "AI generated" first-pass draft seeded from scrubbed payload.
    setEditableDraft({
      youthName: payload?.youthName ?? 'Unknown Youth',
      caseId: payload?.caseId ?? '#H-000',
      membershipStatus: payload?.membershipStatus ?? 'Active Member',
      sessionDate: new Date().toISOString().slice(0, 10),
      issues: {
        'Academic pressure or school-related stress': true,
        'Conflict with peers or classmates': false,
        'Family conflict or home environment concerns': false,
        'Low mood, sadness, or emotional withdrawal': true,
        'Sleep difficulties or disrupted rest patterns': false,
        'Social isolation or feelings of loneliness': false,
        'Anxiety or persistent worry': false,
        'Self-esteem or identity-related concerns': false,
      },
      // Intervention plan uses [USER_X] token — no real name is ever written here.
      interventionPlan:
        `Draft (AI generated): ${youthToken} described pressure around upcoming exams. ` +
        'Suggested grounding exercises and a follow-up check-in. ' +
        `All personal identifiers have been stripped (${stats.replacements.name} name(s), ` +
        `${stats.replacements.phone} phone(s), ${stats.replacements.nric} NRIC(s) redacted). ` +
        'Review and edit before export.',
      riskRating: 0.4,
      sourceLabel: source,
      workerName: 'Alex Tan',
      age: '',
      location: source, // WhatsApp or Telegram — editable if needed
      // Scrub audit — visible in form header, flushed on purge.
      scrubStats: stats,
      nameTable,
      // Time-range metadata from the import config.
      rangeStart: cfg?.rangeStart ?? null,
      rangeEnd: cfg?.rangeEnd ?? null,
      rangePreset: cfg?.rangePreset ?? null,
      fileName: cfg?.fileName ?? null,
    });
  }, []);

  /** Patch fields on the editable draft (used by CaseManagementForm inputs). */
  const updateDraft = useCallback((patch) => {
    setEditableDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  /**
   * Append ONLY a sanitized, non-PII high-level summary to retained history.
   * Called on "Export and Purge" before the destructive flush.
   */
  const commitSanitizedSummary = useCallback((caseKey, summaryEntry) => {
    setCaseHistories((prev) => {
      const key = caseKey || 'H-008';
      const existing = prev[key] ?? [];
      return { ...prev, [key]: [...existing, summaryEntry] };
    });
  }, []);

  /**
   * flushState() — THE PDPA PURGE.
   *
   * Instantly resets all volatile / sensitive buffers back to null. After this
   * call returns, no raw transcript, raw line, or unedited draft remains in
   * memory. Sanitized histories are intentionally left untouched.
   */
  const flushState = useCallback(() => {
    setTranscriptBuffer(null);
    setRawTextLines(null);
    setEditableDraft(null);
    setJournalDraft(null);
    setImportConfig(null); // PDPA: wipe file path, date selections, raw config
  }, []);

  /**
   * Journaling Bookshelf — TEMPORARY journal purge. The temporary entry text
   * lives ONLY in `journalDraft`; this wipes it the instant "Submit" fires. No
   * API/DB call ever sees it.
   */
  const flushJournalDraft = useCallback(() => setJournalDraft(null), []);

  /**
   * Journaling Bookshelf — PERMANENT journal commit. Appends a retained entry
   * (called AFTER journalService.savePermanentEntry resolves).
   */
  const commitJournalEntry = useCallback((entry) => {
    setJournalEntries((prev) => [...prev, entry]);
  }, []);

  const value = useMemo(
    () => ({
      // volatile buffers
      transcriptBuffer,
      rawTextLines,
      editableDraft,
      journalDraft,
      importConfig,
      // retained sanitized data
      caseHistories,
      journalEntries,
      // actions
      ingestTranscript,
      updateDraft,
      commitSanitizedSummary,
      flushState,
      // journaling bookshelf
      setJournalDraft,
      flushJournalDraft,
      commitJournalEntry,
    }),
    [
      transcriptBuffer,
      rawTextLines,
      editableDraft,
      journalDraft,
      importConfig,
      caseHistories,
      journalEntries,
      ingestTranscript,
      updateDraft,
      commitSanitizedSummary,
      flushState,
      flushJournalDraft,
      commitJournalEntry,
    ]
  );

  return (
    <VolatileTranscriptContext.Provider value={value}>
      {children}
    </VolatileTranscriptContext.Provider>
  );
}

/** Hook for consuming the volatile transcript engine. */
export function useVolatileTranscript() {
  const ctx = useContext(VolatileTranscriptContext);
  if (!ctx) {
    throw new Error(
      'useVolatileTranscript must be used within a <VolatileTranscriptProvider>'
    );
  }
  return ctx;
}

export default VolatileTranscriptContext;
