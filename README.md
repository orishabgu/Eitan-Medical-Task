# Patient Heart-Rate Service

A NestJS + PostgreSQL backend for patient heart-rate data. It reports high heart-rate
events, calculates analytics per patient over a time range, and counts how often each
patient's data is requested.

## Quick start

```bash
cp .env.example .env
docker compose up --build     # migrates, seeds and serves
```

Then open **http://localhost:3000/docs** for Swagger. Every endpoint needs the
`x-api-key` header (`local-dev-key` by default). Health checks do not.

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

Query parameters: `from` and `to` (ISO-8601, inclusive, both optional, at most
`MAX_RANGE_DAYS` apart), `threshold` (1 to 299, defaults to `HIGH_HEART_RATE_THRESHOLD`),
`page` (1 or more), `limit` (1 to 100).

```bash
K='x-api-key: local-dev-key'
B=http://localhost:3000/api/v1

curl -H "$K" "$B/heart-rate/high-events?from=2024-03-01T00:00:00Z"
curl -H "$K" "$B/patients/1/heart-rate/analytics?from=2024-03-01T00:00:00Z&to=2024-03-01T23:59:59Z"
curl -H "$K" "$B/patients/1/request-stats"
```

Successful responses are wrapped as `{ "data": ..., "meta": { "requestId", "timestamp" } }`.
Errors use `{ "statusCode", "code", "message", "requestId", "timestamp", "path" }`.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_NAME` | none | PostgreSQL connection |
| `API_KEY` | none | Required in the `x-api-key` header |
| `HIGH_HEART_RATE_THRESHOLD` | `100` | A reading above this value is an event |
| `MAX_RANGE_DAYS` | `30` | Widest closed time range one query may ask for |
| `CORS_ORIGINS` | `*` | Comma-separated allowlist |
| `RATE_LIMIT_TTL_MS` / `RATE_LIMIT_REQUESTS` | `60000` / `120` | Throttling window |

Missing or invalid configuration fails at startup, not on the first request.

## Tests

```bash
npm test          # unit
npm run test:e2e  # end-to-end, needs Postgres running (uses its own eitan_medical_test DB)
npm run lint
```

## Design notes

See **[DESIGN.md](DESIGN.md)** for the architecture, the decisions and their trade-offs,
the list of handled edge cases, and suggested improvements.
