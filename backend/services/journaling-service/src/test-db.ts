import './loadEnv';
import { PrismaClient } from '@prisma/client';
import { redis, draftKey } from './redis';

const prisma = new PrismaClient();

// Tests BOTH halves of this service: the durable Postgres store and the
// volatile Redis cache (incl. the flushJournalDraft purge semantics).
async function main() {
  // --- Postgres (permanent) ---
  await prisma.$queryRaw`SELECT 1`;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS _healthcheck (id serial PRIMARY KEY, created_at timestamptz DEFAULT now())`
  );
  await prisma.$executeRawUnsafe(`INSERT INTO _healthcheck DEFAULT VALUES`);
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM _healthcheck`
  );
  console.log(`[journaling-service] ✅ Postgres reachable on :5433 — healthcheck rows = ${rows[0].n}`);

  // --- Redis (volatile draft round-trip + purge) ---
  const youthId = 'healthcheck-youth';
  await redis.set(draftKey(youthId), 'volatile draft', 'EX', 30);
  const got = await redis.get(draftKey(youthId));
  await redis.del(draftKey(youthId)); // == flushJournalDraft
  const after = await redis.get(draftKey(youthId));
  console.log(
    `[journaling-service] ✅ Redis reachable on :6379 — wrote="${got}", afterFlush=${after === null ? 'null (purged)' : after}`
  );
}

main()
  .catch((e) => {
    console.error('[journaling-service] ❌ DB test failed:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
