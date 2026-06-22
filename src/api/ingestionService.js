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

const FAKE_LATENCY_MS = 180;

// Realistic mock transcripts containing SG-format PII so the anonymization
// pipeline has real data to exercise. All names, numbers, and IDs below are
// entirely fabricated and do not correspond to real individuals.
const MOCK_TRANSCRIPTS = {
  // Telegram export format: "Name [timestamp]:"
  Telegram: [
    'Hana Binte Malik [14 Jun 2026 at 09:02]: hey not feeling great about exams',
    'Volunteer Ravi [14 Jun 2026 at 09:04]: that sounds really heavy, want to talk it through?',
    'Hana Binte Malik [14 Jun 2026 at 09:06]: yeah i keep staying up late and cant focus',
    'Volunteer Ravi [14 Jun 2026 at 09:07]: have you spoken to your school counsellor? you can reach me on 91234567 too',
    'Hana Binte Malik [14 Jun 2026 at 09:09]: no not yet, my nric is S9812345Z if they need it for referral',
    'Hana Binte Malik [14 Jun 2026 at 09:11]: also my mum works near Blk 412 Clementi Ave 1, maybe i can meet her after',
    'Volunteer Ravi [14 Jun 2026 at 09:13]: sounds good, ill note that down. lets schedule a follow-up this week',
  ],
  // WhatsApp export format: "DD/MM/YYYY, HH:MM - Name: message"
  WhatsApp: [
    '14/06/2026, 10:15 - Hana M.: had another argument with a classmate today',
    '14/06/2026, 10:17 - Sarah Lim: i hear you, that mustve been stressful',
    '14/06/2026, 10:18 - Hana M.: kind of, just feel a bit alone about it',
    '14/06/2026, 10:20 - Sarah Lim: you can always call me on 87654321 if it gets bad',
    '14/06/2026, 10:22 - Hana M.: thanks. my fin number is F8234567J btw for the referral form',
    '14/06/2026, 10:24 - Hana M.: i usually hang around Jurong East MRT after school if u need to find me',
    '14/06/2026, 10:26 - Sarah Lim: noted, Hana M. lets check in again on friday',
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
