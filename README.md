# Patient Heart-Rate Service

A NestJS + PostgreSQL backend for patient heart-rate telemetry: high heart-rate events,
per-patient analytics over a time range, and tracking of how often each patient's data is
requested.

## Quick start

```bash
cp .env.example .env
docker compose up --build     # migrates, seeds and serves
```

Then open **http://localhost:3000/docs** for Swagger. Every endpoint needs the
`x-api-key` header (`local-dev-key` by default); health checks do not.

```bash
curl -H 'x-api-key: local-dev-key' http://localhost:3000/api/v1/heart-rate/high-events
```

<details>
<summary>Running without Docker</summary>

```bash
docker compose up -d postgres
npm ci
npm run db:setup:dev     # migrations, then seed
npm run start:dev
```
</details>

## Endpoints

Base path `/api/v1`.

| Method | Path | Description |
|---|---|---|
| GET | `/patients` | List patients (`page`, `limit`) |
| GET | `/patients/:id` | One patient |
| GET | `/heart-rate/high-events` | Readings above the threshold, across all patients |
| GET | `/patients/:id/heart-rate/high-events` | The same, for one patient |
| GET | `/patients/:id/heart-rate/analytics` | Average, min and max over a range |
| GET | `/patients/:id/request-stats` | How often this patient has been requested |
| GET | `/request-stats` | All counters, most requested first |
| GET | `/health/live`, `/health/ready` | Probes (no API key) |

Query parameters: `from` / `to` (ISO-8601, inclusive, optional), `threshold` (1–299,
defaults to `HIGH_HEART_RATE_THRESHOLD`), `page` (≥1), `limit` (1–100).

```bash
K='x-api-key: local-dev-key'
B=http://localhost:3000/api/v1

curl -H "$K" "$B/heart-rate/high-events?from=2024-03-01T00:00:00Z"
curl -H "$K" "$B/patients/1/heart-rate/analytics?from=2024-03-01T00:00:00Z&to=2024-03-01T23:59:59Z"
curl -H "$K" "$B/patients/1/request-stats"
```

Responses are wrapped as `{ "data": …, "meta": { "requestId", "timestamp" } }`; errors as
`{ "statusCode", "code", "message", "requestId", "timestamp", "path" }`.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_NAME` | — | PostgreSQL connection |
| `API_KEY` | — | Required in `x-api-key` |
| `HIGH_HEART_RATE_THRESHOLD` | `100` | A reading strictly above this is an event |
| `CORS_ORIGINS` | `*` | Comma-separated allowlist |
| `RATE_LIMIT_TTL_MS` / `RATE_LIMIT_REQUESTS` | `60000` / `120` | Throttling window |

Invalid or missing configuration fails at boot rather than at first request.

## Tests

```bash
npm test          # unit
npm run test:e2e  # end-to-end, needs Postgres running (uses its own eitan_medical_test DB)
npm run lint
```

## Design notes

See **[DESIGN.md](DESIGN.md)** for the architecture, the decisions and their trade-offs,
the edge-case contract, and suggested improvements.
