import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from './crypto';

const prisma = new PrismaClient();

/* ── Temporary draft (in-memory — volatile by design) ───────────────────── */

const drafts = new Map<string, string>();

export function setTemporaryDraft(youthId: string, text: string): void {
  drafts.set(youthId, text);
}

export function getTemporaryDraft(youthId: string): string | null {
  return drafts.get(youthId) ?? null;
}

export function flushJournalDraft(youthId: string): void {
  drafts.delete(youthId);
}

/* ── Permanent entries (encrypted, stored in Supabase PostgreSQL) ────────── */

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

export async function listEntries(ownerId: string) {
  const entries = await prisma.journalEntry.findMany({
    where: { ownerId },
    orderBy: { sealedAt: 'desc' },
  });
  return entries.map((e) => ({
    id: e.entryRef ?? e.id,
    preview: e.preview ?? '',
    body: decrypt(e.bodyEnc as Buffer),
    committedAt: new Date(e.sealedAt).getTime(),
  }));
}

export async function readPermanentEntry(id: string): Promise<string | null> {
  const entry = await prisma.journalEntry.findUnique({ where: { id } });
  return entry ? decrypt(entry.bodyEnc as Buffer) : null;
}
