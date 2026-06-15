/**
 * journalService.js
 *
 * Simulated persistence boundary for the Journaling Bookshelf. Mirrors the
 * existing ingestionService.js style: no real network, just a fabricated
 * receipt so the prototype can demonstrate the journey end-to-end.
 *
 * CONTRACT (PDPA simulation):
 *   - savePermanentEntry() is the ONLY function that "persists" anything, and it
 *     is called ONLY from the Permanent journal's submit path.
 *   - The Temporary journal MUST NOT call into this module at all. Its text
 *     lives strictly in volatile state and is flushed on submit (see
 *     VolatileTranscriptContext.flushJournalDraft).
 */

const FAKE_LATENCY_MS = 600;

/**
 * Persist a permanent journal entry (committed, archival).
 * @param {{ title?:string, body:string, createdAt?:number }} entry
 * @returns {Promise<{ ok:true, entryId:string, committedAt:number }>}
 */
export function savePermanentEntry(entry) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        ok: true,
        entryId: `JRN-${Math.floor(Math.random() * 90000 + 10000)}`,
        committedAt: Date.now(),
      });
    }, FAKE_LATENCY_MS);
  });
}

export default { savePermanentEntry };
