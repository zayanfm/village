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

const VolatileTranscriptContext = createContext(null);

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

  // ---- SAFE / RETAINED STATE (sanitized summaries only) ----
  const [caseHistories, setCaseHistories] = useState(SEED_HISTORIES);
  const [journalEntries, setJournalEntries] = useState([]); // permanent (committed) journal entries

  /**
   * Simulate ingesting a raw transcript from a source (Telegram / WhatsApp)
   * and generating an unedited AI draft. Everything written here is volatile.
   */
  const ingestTranscript = useCallback((source, payload) => {
    const lines = payload?.lines ?? [];
    setTranscriptBuffer({ source, receivedAt: Date.now(), payload });
    setRawTextLines(lines);

    // Simulated "AI generated" first-pass draft seeded from the raw payload.
    setEditableDraft({
      youthName: payload?.youthName ?? 'Unknown Youth',
      caseId: payload?.caseId ?? '#H-000',
      membershipStatus: payload?.membershipStatus ?? 'Active Member',
      sessionDate: new Date().toISOString().slice(0, 10),
      issues: {
        'School Stress': true,
        'Peer Conflict': false,
        'Family Tension': false,
        'Low Mood': true,
        'Sleep Disruption': false,
      },
      interventionPlan:
        'Draft (AI generated): Youth described pressure around upcoming exams. ' +
        'Suggested grounding exercises and a follow-up check-in. Review and edit before export.',
      riskRating: 0.4, // 0 (low) -> 1 (high)
      sourceLabel: source,
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
