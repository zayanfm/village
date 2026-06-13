/**
 * ingestionService.js
 *
 * Simulated client network service. No real network calls are made — these
 * helpers fabricate an ingestion payload so the prototype can demonstrate the
 * "Import New Chat" journey end-to-end.
 *
 * IMPORTANT: returned payloads are raw/volatile by nature. They are intended
 * to be handed straight into VolatileTranscriptContext.ingestTranscript() and
 * never written to durable storage.
 */

const FAKE_LATENCY_MS = 650;

// Tiny canned transcripts per source so the two paths feel distinct.
const MOCK_TRANSCRIPTS = {
  Telegram: [
    'Youth: hey not feeling great about the exams next week',
    'Volunteer: that sounds really heavy, want to talk it through?',
    'Youth: yeah I keep staying up late and cant focus',
  ],
  WhatsApp: [
    'Youth: had another argument with a classmate today',
    'Volunteer: i hear you, that mustve been stressful',
    'Youth: kind of, just feel a bit alone about it',
  ],
};

/**
 * Simulate pulling a chat export from the chosen source.
 *
 * @param {('Telegram'|'WhatsApp')} source
 * @param {{ youthName?: string, caseId?: string }} [meta]
 * @returns {Promise<{ source: string, youthName: string, caseId: string,
 *   membershipStatus: string, lines: string[] }>}
 */
export function importChatFromSource(source, meta = {}) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        source,
        youthName: meta.youthName ?? 'Hana M.',
        caseId: meta.caseId ?? '#H-008',
        membershipStatus: 'Active Member',
        lines: MOCK_TRANSCRIPTS[source] ?? MOCK_TRANSCRIPTS.Telegram,
      });
    }, FAKE_LATENCY_MS);
  });
}

/**
 * Simulate the secure "export to records" step performed before a destructive
 * purge. Resolves with a sanitized receipt only — never the raw transcript.
 *
 * @param {object} draft sanitized editable draft
 * @returns {Promise<{ ok: true, recordId: string, committedAt: number }>}
 */
export function exportToSecureRecords(draft) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        ok: true,
        recordId: `REC-${Math.floor(Math.random() * 90000 + 10000)}`,
        committedAt: Date.now(),
      });
    }, FAKE_LATENCY_MS);
  });
}

export default { importChatFromSource, exportToSecureRecords };
