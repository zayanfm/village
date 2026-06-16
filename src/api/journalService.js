/**
 * journalService.js
 *
 * Real persistence boundary for the Journaling Bookshelf, wired to the
 * journaling-service backend (POST /youth/:youthId/entries).
 *
 * CONTRACT (PDPA model — unchanged):
 *   - savePermanentEntry() is the ONLY function that persists anything, and it
 *     is called ONLY from the Permanent journal's submit path.
 *   - The Temporary journal MUST NOT call into this module at all. Its text
 *     lives strictly in volatile state and is flushed on submit (see
 *     VolatileTranscriptContext.flushJournalDraft). The backend's volatile
 *     /draft routes exist but are intentionally never invoked from the client.
 */

import { baseUrl } from './config';
import { http } from './httpClient';

// Demo youth identity. The journaling-service `owner_id` column is a UUID, so
// this MUST be a valid UUID. Replace with the authenticated user's id once
// user-service auth is fully wired.
export const DEMO_YOUTH_ID = '00000000-0000-0000-0000-000000000008';

/**
 * Persist a permanent journal entry (committed, archival).
 *
 * Backend returns { id, entryRef, sealedAt }. We map it to the shape the UI
 * already consumes ({ ok, entryId, committedAt }) so callers are unchanged.
 *
 * @param {{ body:string, createdAt?:number, youthId?:string }} entry
 * @returns {Promise<{ ok:true, entryId:string, committedAt:number }>}
 */
export async function savePermanentEntry(entry) {
  const youthId = entry.youthId ?? DEMO_YOUTH_ID;
  const url = `${baseUrl('journaling')}/youth/${youthId}/entries`;

  const receipt = await http.post(url, { body: entry.body });

  return {
    ok: true,
    entryId: receipt.entryRef ?? receipt.id,
    committedAt: receipt.sealedAt ? new Date(receipt.sealedAt).getTime() : Date.now(),
  };
}

export default { savePermanentEntry };
