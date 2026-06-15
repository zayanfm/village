import './loadEnv';
import { prisma } from './db';

async function main() {
  await prisma.$queryRaw`SELECT 1`;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS _healthcheck (id serial PRIMARY KEY, created_at timestamptz DEFAULT now())`
  );
  await prisma.$executeRawUnsafe(`INSERT INTO _healthcheck DEFAULT VALUES`);
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM _healthcheck`
  );
  console.log(`[calendar-service] ✅ Postgres reachable on :5434 — healthcheck rows = ${rows[0].n}`);
}

main()
  .catch((e) => {
    console.error('[calendar-service] ❌ DB test failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
