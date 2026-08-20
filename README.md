# Patient Heart-Rate Service

A NestJS + PostgreSQL backend for patient heart-rate data. It reports high heart-rate
events, calculates analytics per patient over a time range, and counts how often each
patient's data is requested.

## Quick start

```bash
cp .env.example .env
docker compose up --build     # migrates, seeds and serves
```

Then open **http://localhost:3000/docs** for Swagger.

```bash
curl http://localhost:3000/api/v1/heart-rate/high-events
```

### Running locally without Docker

Postgres still runs in a container; everything else runs on the host.

```bash
docker compose up -d postgres
npm install
npm run db:setup:dev     # migrations, then seed
npm run start:dev        # watch mode on http://localhost:3000
npm test                 # unit tests
npm run test:e2e         # end-to-end tests
```

## Endpoints

Base path `/api/v1`. All examples assume `B=http://localhost:3000/api/v1`. Full interactive
docs at [/docs](http://localhost:3000/docs).

### Shared query parameters

| Parameter | Type | Range / default | Applies to |
|---|---|---|---|
| `page` | integer | 1 or more, default `1` | any list endpoint |
| `limit` | integer | 1 to 100, default `20` | any list endpoint |
| `from` | ISO-8601 | optional, inclusive | high events, analytics |
| `to` | ISO-8601 | optional, inclusive, must be at or after `from` | high events, analytics |
| `threshold` | integer | 1 to 299, default `HIGH_HEART_RATE_THRESHOLD` (100) | high events |

`from` and `to` accept `Z` or an offset (`+03:00`); both are normalised to UTC. When both are
given they may not span more than `MAX_RANGE_DAYS` (30). Any unknown query parameter is a
`400`, not silently ignored.

---

### `GET /patients`

Lists patients, ordered by id.

| Query | Notes |
|---|---|
| `page`, `limit` | pagination |

```bash
curl "$B/patients"
curl "$B/patients?page=2&limit=50"
```

### `GET /patients/:id`

A single patient. `404` if the id is unknown. **Counted** against this patient's request
total.

```bash
curl "$B/patients/1"
```

### `GET /heart-rate/high-events`

Readings strictly above the threshold, across all patients, newest first. A reading exactly
at the threshold is not an event.

| Query | Notes |
|---|---|
| `from`, `to` | narrow the time window |
| `threshold` | override the default 100 bpm |
| `page`, `limit` | pagination |

```bash
curl "$B/heart-rate/high-events"
curl "$B/heart-rate/high-events?from=2024-03-01T00:00:00Z&to=2024-03-02T00:00:00Z"
curl "$B/heart-rate/high-events?threshold=120&limit=5"
```

### `GET /patients/:id/heart-rate/high-events`

The same, restricted to one patient. `404` if the patient does not exist, rather than an
empty list. **Counted.**

```bash
curl "$B/patients/1/heart-rate/high-events?from=2024-03-01T00:00:00Z"
```

### `GET /patients/:id/heart-rate/analytics`

Count, average, min and max heart rate for one patient over a time range, aggregated in SQL.
`404` if the patient does not exist. If the patient exists but has no readings in the window,
returns `200` with `count: 0` and `null` statistics, never a division by zero. **Counted.**

| Query | Notes |
|---|---|
| `from`, `to` | both optional; omitted means open-ended on that side |

```bash
curl "$B/patients/1/heart-rate/analytics"
curl "$B/patients/1/heart-rate/analytics?from=2024-03-01T00:00:00Z&to=2024-03-01T23:59:59Z"
```

### `GET /patients/:id/request-stats`

How many times this patient's data has been read. `0` for a patient never requested, `404`
for one that does not exist. Reading this does **not** increment the counter.

```bash
curl "$B/patients/1/request-stats"
```

### `GET /request-stats`

All counters, most requested first, with `patientId` breaking ties.

| Query | Notes |
|---|---|
| `page`, `limit` | pagination |

```bash
curl "$B/request-stats?limit=10"
```

### `GET /health/live` and `GET /health/ready`

`live` reports that the process is up. `ready` also pings the database and returns `503` when
it is unreachable, so an orchestrator can stop routing traffic.

```bash
curl "$B/health/live"
curl "$B/health/ready"
```

---

### Response shape

Every success is wrapped:

```json
{ "data": { "...": "endpoint payload" },
  "meta": { "requestId": "42", "timestamp": "2024-03-01T10:30:00.000Z" } }
```

List endpoints put the page inside `data`:

```json
{ "data": { "items": [], "total": 128, "page": 1, "limit": 20 }, "meta": {} }
```

Every error uses one shape, with a stable machine-readable `code`:

```json
{ "statusCode": 404, "code": "NOT_FOUND", "message": "Patient 999 not found",
  "requestId": "42", "timestamp": "2024-03-01T10:30:00.000Z", "path": "/api/v1/patients/999" }
```

| Status | `code` | Cause |
|---|---|---|
| 400 | `VALIDATION_FAILED` | bad date, reversed range, range over the cap, out-of-range `threshold`/`page`/`limit`, unknown parameter |
| 404 | `NOT_FOUND` | unknown patient, or unknown route |
| 429 | `RATE_LIMIT_EXCEEDED` | throttle limit hit |
| 503 | `SERVICE_UNAVAILABLE` | database unreachable |
| 500 | `INTERNAL_ERROR` | anything else, with no driver detail leaked |

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_NAME` | none | PostgreSQL connection |
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

To try the API against a larger dataset, generate one:

```bash
SCALE_PATIENTS=200 SCALE_READINGS=500 npm run seed:scale   # 100k readings
```

The rows are deterministic and their ids are prefixed `scale-`, so
`DELETE FROM patients WHERE id LIKE 'scale-%'` removes them again.

## Architecture

```
src/
  config/           env schema, validated with Joi at startup
  database/         DataSource, migrations, seed
  common/           error filter, response envelope, shared query DTOs, validators
  patients/         entity, service, controller, DTOs
  heart-rate/       readings, high events, analytics
  request-tracking/ counters, service, tracking interceptor
  health/           liveness and readiness probes
```

**Layers.** Controllers only validate and delegate. Services hold the business logic.
TypeORM owns data access. Cross-cutting concerns are interceptors and filters, never service
code. One module per feature, so a feature is one directory.

**Why no custom repository classes.** TypeORM's `Repository<T>` already is the repository
pattern: a typed, mockable abstraction over the table that the service receives through
`@InjectRepository`. Wrapping it in a hand-written class would add a layer that only forwards
calls. TypeORM 0.3 also deprecated `@EntityRepository` and `getCustomRepository()` in favour
of `Repository.extend()`, so the custom-class idiom is no longer the recommended one. Unit
tests mock the repository directly and stay fast.

**Why request tracking is an interceptor.** Counting reads is a cross-cutting concern, so no
business service knows it exists. Handlers opt in declaratively with `@TrackPatientRequest()`
and `TrackPatientInterceptor` reads that metadata through `Reflector`, rather than matching on
URL strings that break when a route is renamed. Three details matter: it increments inside
`tap({ next })` so failed requests are not counted; the write is a single atomic
`INSERT ... ON CONFLICT DO UPDATE ... count + 1` so concurrent reads cannot lose increments;
and it is not awaited, so a slow counter can never delay a clinical read.

**Validation and errors.** A global `ValidationPipe` with `whitelist`,
`forbidNonWhitelisted` and `transform` runs on every route, so unknown fields are rejected
rather than ignored. A global exception filter gives every error one JSON shape and maps
Postgres error codes to sensible statuses; stack traces and driver messages never reach the
client. Endpoints return dedicated response DTOs, never raw entities.

## Trade-offs and future improvements

Measured at 500000 patients and 10 million readings: analytics 3 ms, high events 240 ms.
Roughly in the order I would do them:

1. **Move counters off the request path** with `Redis INCR` and a periodic flush, or a
   RabbitMQ event consumed by an aggregator. Today every tracked read writes to Postgres.
2. **Keyset pagination** for high events. `OFFSET` walks the rows it skips, which is the
   measured next bottleneck on deep pages.
3. **Cache analytics over closed historical windows** in Redis. A window that ended in the
   past cannot change; windows reaching up to now must stay uncached.
4. **TimescaleDB, or monthly partitioning**, with continuous aggregates for hourly and daily
   rollups, so a year of analytics does not scan raw rows.
5. **Real authentication and an audit log.** The API is currently unauthenticated. Production
   needs JWT or OIDC with role-based access control, plus an immutable record of who read
   which patient, which is a regulatory requirement and separate from these usage counters.
6. **mTLS for device ingest.** Readings come from infusion pumps, not browsers. Each device
   should present a client certificate, with per-device identity, rotation and revocation,
   terminated at the ingress.
7. **A write API** with batching, backpressure and idempotency keys. The `UNIQUE
   (patient_id, timestamp)` constraint is already the right foundation.
8. **Per-patient thresholds.** One global 100 bpm value is clinically wrong: a sleeping infant
   and an adult on a treadmill are not comparable.
9. **OpenTelemetry tracing** alongside the existing structured logs and health probes.

Rate limiting, Helmet, a CORS allowlist, config validation at boot and a non-root container
are already in place.

## Further reading

**[DESIGN.md](DESIGN.md)** covers the data model and indexes, the full edge-case table with
the behaviour of each case, and the measurements behind the numbers above.
