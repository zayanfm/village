# UniGarden Backend

Cloud-native, **Database-per-Service** backend for the UniGarden platform. Five
independent Node.js + TypeScript services, each owning its own datastore. No
service touches another service's database — all cross-service access is via API.

```
backend/
├── docker-compose.yml          # all 5 DBs + the volatile Redis cache
└── services/
    ├── user-service/           # PostgreSQL  (auth, profiles, case assignments)
    ├── house-service/          # MongoDB     (house_designs, interiors)
    ├── journaling-service/     # PostgreSQL  (encrypted entries) + Redis (volatile drafts)
    ├── engagement-service/     # MongoDB     (forum posts + comments)
    └── calendar-service/       # PostgreSQL  (worker schedules + event blocks)
```

| Service     | Engine     | Host port | DB / namespace  |
|-------------|------------|-----------|-----------------|
| user        | postgres:16| 5435      | `userdb`        |
| journaling  | postgres:16| 5433      | `journaldb`     |
| calendar    | postgres:16| 5434      | `calendardb`    |
| journaling  | redis:7    | 6379      | volatile cache  |
| house       | mongo:7    | 27017     | `house_db`      |
| engagement  | mongo:7    | 27018     | `engagement_db` |

---

## 1. Start the infrastructure

From `backend/`:

```bash
docker compose up -d
docker compose ps          # all should be (healthy)
```

This launches the three Postgres instances, the two MongoDB instances, and the
volatile Redis cache. Local data persists in named volumes across restarts —
**except** `journal-cache`, which is configured with `--save "" --appendonly no`
so it never writes to disk (the Temporary-journal volatility guarantee).

Tear down (keep data): `docker compose down`
Tear down (wipe data): `docker compose down -v`

## 2. Install + generate clients

Each service is self-contained. For every service:

```bash
cd services/<service>
npm install
# Postgres services only — generate the Prisma client:
npm run prisma:generate
# (optional) create the real tables from the schema:
npm run prisma:migrate
```

## 3. Run the connection tests

Each service ships a `test:db` script that connects to its assigned port, does a
read/write round-trip, and logs success:

```bash
cd services/user-service        && npm run test:db
cd services/journaling-service  && npm run test:db   # tests BOTH Postgres + Redis
cd services/calendar-service    && npm run test:db
cd services/house-service       && npm run test:db
cd services/engagement-service  && npm run test:db
```

Expected output (example):

```
[user-service] ✅ Postgres reachable on :5432 — healthcheck rows = 1
```

## 4. Run a service (optional)

Each service exposes a minimal Express health endpoint:

```bash
cd services/<service> && npm run dev
curl http://localhost:4001/health     # user-service (4001..4005)
```

---

## Access control (where it lives)

RBAC is carried in JWT claims minted by **user-service** (`persona`, `roles`,
`scopes`, `rel`). Enforcement is layered: API gateway (coarse scope check) →
service guard (route-level) → database (Postgres Row-Level Security / injected
Mongo ownership filters). Workers never get raw read on `journal_entries` — only
sanitized summaries — mirroring the app's volatile-vs-retained PDPA model.

## Env files & credentials (portable)

Credentials come from **discrete environment variables**, never hardcoded into a
connection string. Each service `.env` declares `POSTGRES_USER/PASSWORD/HOST/PORT/DB`
(or `MONGO_*`) and composes the URL via `${VAR}` interpolation, e.g.:

```ini
POSTGRES_USER=test
POSTGRES_PASSWORD=iluvhasini
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public"
```

`src/loadEnv.ts` (imported first by every entry point) runs `dotenv` + `dotenv-expand`
to resolve those `${VAR}` refs at runtime — so changing creds is a one-line edit
and the same files work on any machine.

- **Container creds** come from `backend/.env` (compose variable substitution):
  `POSTGRES_USER/PASSWORD`, `MONGO_USER/PASSWORD`. Copy `backend/.env.example`.
- All `.env` files are git-ignored; values shown are non-secret local defaults.
  In real environments, inject these vars (and `ENCRYPTION_KEY`) from your secrets
  manager.
- Mongo runs with auth enabled (`authSource=admin`); Postgres user-db is published
  on **5435** to avoid a native PostgreSQL install on 5432.
