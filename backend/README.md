# UniGarden Backend

Cloud-native, **Database-per-Service** backend for the UniGarden platform. Six
independent Node.js + TypeScript services, each owning its own datastore. No
service touches another service's database — all cross-service access is via API.

```
backend/
├── .env.example                # copy to .env and fill in secrets
├── docker-compose.yml          # all DBs + all 6 application services
├── services/
│   ├── ai-service/             # MongoDB     (chat history, AI summaries)
│   ├── user-service/           # PostgreSQL  (auth, profiles, case assignments)
│   ├── house-service/          # MongoDB     (house designs, interiors)
│   ├── journaling-service/     # PostgreSQL  (entries) + Redis (volatile drafts)
│   ├── engagement-service/     # MongoDB     (forum posts + comments)
│   └── calendar-service/       # PostgreSQL  (worker schedules + event blocks)
└── k8s/
    ├── 00-namespace.yaml
    ├── 01-secrets.yaml         # fill in real values before applying
    ├── 02-databases.yaml       # StatefulSets for all databases
    ├── 03-ai-service.yaml
    ├── 03-user-service.yaml
    ├── 03-house-service.yaml
    ├── 03-journaling-service.yaml
    ├── 03-engagement-service.yaml
    └── 03-calendar-service.yaml
```

| Service     | Port | Engine      | DB / namespace  |
|-------------|------|-------------|-----------------|
| ai          | 4006 | MongoDB     | `ai_db`         |
| user        | 4001 | PostgreSQL  | `userdb`        |
| house       | 4002 | MongoDB     | `house_db`      |
| journaling  | 4003 | PostgreSQL  | `journaldb`     |
| engagement  | 4004 | MongoDB     | `engagement_db` |
| calendar    | 4005 | PostgreSQL  | `calendardb`    |

---

## Option A — Docker Compose (local dev)

The fastest way to get everything running locally.

### 1. Configure secrets

```bash
cd backend
cp .env.example .env
# Edit .env — set GROQ_API_KEY, POSTGRES_PASSWORD, MONGO_PASSWORD
```

### 2. Start everything

```bash
docker compose up -d
docker compose ps          # all containers should show (healthy)
docker compose logs -f ai-service   # tail a specific service
```

This starts all 7 databases and all 6 application services. Prisma services
(`user`, `calendar`, `journaling`) automatically run `prisma migrate deploy` on
first boot so the schema is always in sync.

**Data persistence:** named volumes survive `docker compose down`.
To wipe all data: `docker compose down -v`

**Journal-cache** is intentionally non-persistent (`--save "" --appendonly no`) —
volatile journal drafts never touch disk by design.

### 3. Verify

```bash
curl http://localhost:4006/health   # ai-service
curl http://localhost:4001/health   # user-service
# ports 4002–4005 follow the same pattern
```

---

## Option B — Kubernetes (staging / production)

### Prerequisites

- A running Kubernetes cluster (Docker Desktop, minikube, EKS, GKE, etc.)
- `kubectl` configured to point at it
- Images built and pushed to a registry (see below)

### 1. Build and push images

Run from `backend/services/<service>/` for each service:

```bash
docker build -t unigarden/ai-service:latest .
docker push unigarden/ai-service:latest
# repeat for: user-service, house-service, journaling-service,
#             engagement-service, calendar-service
```

Update the `image:` field in each `k8s/03-*.yaml` to match your registry path
(e.g. `gcr.io/my-project/ai-service:latest`).

### 2. Fill in secrets

Edit [`k8s/01-secrets.yaml`](k8s/01-secrets.yaml) with real credentials before
applying — never commit real values.

### 3. Apply manifests

```bash
cd backend/k8s

kubectl apply -f 00-namespace.yaml
kubectl apply -f 01-secrets.yaml
kubectl apply -f 02-databases.yaml

# Wait for databases to become ready before applying services
kubectl rollout status statefulset/postgres-user -n unigarden

kubectl apply -f 03-ai-service.yaml
kubectl apply -f 03-user-service.yaml
kubectl apply -f 03-house-service.yaml
kubectl apply -f 03-journaling-service.yaml
kubectl apply -f 03-engagement-service.yaml
kubectl apply -f 03-calendar-service.yaml

# Or apply everything at once (databases must be ready first)
kubectl apply -f .
```

### 4. Verify pods

```bash
kubectl get pods -n unigarden
kubectl logs -n unigarden deployment/ai-service
```

### Exposing services externally

By default all application services are `ClusterIP` (internal only). To expose
them to your mobile app, either:

- Change `type: ClusterIP` → `type: LoadBalancer` in the relevant service YAML
- Or add an Ingress controller (nginx-ingress / Traefik) and configure routing rules

---

## Running services locally (without Docker)

### 1. Start the databases only

```bash
docker compose up -d user-db journal-db calendar-db journal-cache house-db engagement-db ai-db
```

### 2. Install dependencies

```bash
cd services/<service>
npm install
# Prisma services (user, calendar, journaling) only:
npm run prisma:generate
npm run prisma:migrate
```

### 3. Run a service

```bash
cd services/ai-service
npm run dev          # ts-node, hot-ish reload
curl http://localhost:4006/health
```

### 4. Run connection tests

Each service ships a `test:db` script that does a full read/write round-trip:

```bash
cd services/user-service        && npm run test:db
cd services/journaling-service  && npm run test:db   # tests Postgres + Redis
cd services/calendar-service    && npm run test:db
cd services/house-service       && npm run test:db
cd services/engagement-service  && npm run test:db
```

---

## Environment variables

| Variable          | Used by                        | Description                          |
|-------------------|--------------------------------|--------------------------------------|
| `GROQ_API_KEY`    | ai-service                     | Groq API key for LLM calls           |
| `POSTGRES_USER`   | compose / k8s secrets          | Shared Postgres username             |
| `POSTGRES_PASSWORD` | compose / k8s secrets        | Shared Postgres password             |
| `MONGO_USER`      | compose / k8s secrets          | Shared MongoDB username              |
| `MONGO_PASSWORD`  | compose / k8s secrets          | Shared MongoDB password              |
| `DATABASE_URL`    | user, calendar, journaling     | Full Prisma connection string        |
| `MONGO_URI`       | ai, house, engagement          | Full MongoDB connection string       |
| `REDIS_URL`       | journaling-service             | Redis connection URL                 |
| `PORT`            | all services                   | HTTP port (defaults per service)     |

`src/loadEnv.ts` (imported first in every service) runs `dotenv` + `dotenv-expand`
so `${VAR}` references in connection strings are resolved at runtime.

All `.env` files are git-ignored. In production, inject secrets from your secrets
manager (AWS Secrets Manager, GCP Secret Manager, K8s Secrets, etc.).

---

## Access control

RBAC is carried in JWT claims minted by **user-service** (`persona`, `roles`,
`scopes`, `rel`). Enforcement is layered:

1. API gateway — coarse scope check
2. Service guard — route-level (`x-worker-role` header for worker-only endpoints)
3. Database — Postgres Row-Level Security / injected Mongo ownership filters

Workers never get raw read access on `journal_entries` — only sanitized summaries
— mirroring the app's volatile-vs-retained PDPA model.
