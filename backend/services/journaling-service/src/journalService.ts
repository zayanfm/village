import { PrismaClient } from '@prisma/client';
import { redis, draftKey } from './redis';
import { encrypt, decrypt } from './crypto';

const prisma = new PrismaClient();
const DRAFT_TTL_SECONDS = 900; // 15 min safety expiry on volatile drafts

/* ─────────────────────────── TEMPORARY (volatile) ─────────────────────────
 * Lives ONLY in the Redis cache. No code path copies it to Postgres. */

export async function setTemporaryDraft(youthId: string, text: string): Promise<void> {
  await redis.set(draftKey(youthId), text, 'EX', DRAFT_TTL_SECONDS);
}

export async function getTemporaryDraft(youthId: string): Promise<string | null> {
  return redis.get(draftKey(youthId));
}

/**
 * flushJournalDraft — purge the volatile draft from Redis the instant "Submit"
 * fires (or on cancel/timeout). This is the backend twin of the frontend
 * VolatileTranscriptContext.flushJournalDraft(): after it returns, no trace of
 * the temporary entry remains anywhere.
 */
export async function flushJournalDraft(youthId: string): Promise<void> {
  await redis.del(draftKey(youthId));
}

/* ─────────────────────────── PERMANENT (durable) ──────────────────────────
 * Encrypted-at-rest in Postgres. The ONLY function that persists journal text. */

export async function savePermanentEntry(ownerId: string, body: string) {
  const entry = await prisma.journalEntry.create({
    data: {
      ownerId,
      bodyEnc: encrypt(body),
      preview: body.slice(0, 48),
      entryRef: `JRN-${Math.floor(Math.random() * 90000 + 10000)}`,
    },
  });
  return { id: entry.id, entryRef: entry.entryRef, sealedAt: entry.sealedAt };
}

export async function readPermanentEntry(id: string): Promise<string | null> {
  const entry = await prisma.journalEntry.findUnique({ where: { id } });
  return entry ? decrypt(entry.bodyEnc as Buffer) : null;
}

export { prisma };
