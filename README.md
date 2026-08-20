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

Base path `/api/v1`.

| Method | Path | Description |
|---|---|---|
| GET | `/patients` | List patients (`page`, `limit`) |
| GET | `/patients/:id` | One patient |
| GET | `/heart-rate/high-events` | Readings above the threshold, across all patients |
| GET | `/patients/:id/heart-rate/high-events` | The same, for one patient |
| GET | `/patients/:id/heart-rate/analytics` | Average, min and max over a range |
| GET | `/patients/:id/request-stats` | How often this patient has been requested |
| GET | `/request-stats` | Counters, most requested first (`page`, `limit`) |
| GET | `/health/live`, `/health/ready` | Liveness and readiness probes |

Query parameters: `from` and `to` (ISO-8601, inclusive, both optional, at most
`MAX_RANGE_DAYS` apart), `threshold` (1 to 299, defaults to `HIGH_HEART_RATE_THRESHOLD`),
`page` (1 or more), `limit` (1 to 100).

```bash
B=http://localhost:3000/api/v1

curl "$B/heart-rate/high-events?from=2024-03-01T00:00:00Z"
curl "$B/patients/1/heart-rate/analytics?from=2024-03-01T00:00:00Z&to=2024-03-01T23:59:59Z"
curl "$B/patients/1/request-stats"
```

Successful responses are wrapped as `{ "data": ..., "meta": { "requestId", "timestamp" } }`.
Errors use `{ "statusCode", "code", "message", "requestId", "timestamp", "path" }`.

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
