# Design notes

Thought process, trade-offs and what I would do next. The brief valued clean architecture
and senior-level reasoning over feature count, so this document carries the reasoning that
the code deliberately does not.

## Architecture

One module per concern, flat. Nothing exists as a layer unless it earns its place — there
are no custom repository classes (TypeORM's `Repository` already is one), no abstract base
classes, no barrel files, no interfaces with a single implementation.

```
src/
  config/           env schema, validated with Joi at boot
  database/         DataSource, migrations, seed
  common/           guard, filters, response envelope, shared query DTOs
  patients/         entity, service, controller
  heart-rate/       readings, high events, analytics
  request-tracking/ counters, service, tracking interceptor
  health/           liveness and readiness probes
```

Controllers validate and delegate. Services hold the logic and talk to TypeORM directly.
Cross-cutting concerns — auth, logging, response shape, error shape, request tracking —
live outside the business services entirely. Each module is self-contained enough to be
lifted into its own service if the system were split.

**Module dependencies are acyclic.** `RequestTrackingModule` owns the counter and the
interceptor and depends on nothing; `PatientsModule` and `HeartRateModule` consume it. The
`/patients/:id/request-stats` route lives in `PatientsController` rather than in the
tracking module, because it needs the patient-existence check — putting it the other way
round would have created a cycle between the two modules.

## Data model

```sql
patients(id, name, age, gender, created_at)
heart_rate_readings(id, patient_id → patients, timestamp, heart_rate)
patient_request_counters(patient_id → patients, request_count, last_requested)
```

Migrations are the single source of truth for schema; `synchronize` is never enabled.
The seed is a separate idempotent script (`ON CONFLICT DO NOTHING`) so mock data never
enters the schema history and can be re-run safely.

**Indexes.**

- `idx_hrr_patient_time (patient_id, timestamp DESC)` serves the analytics range scan.
- `idx_hrr_high (timestamp DESC, patient_id) WHERE heart_rate > 100` is a partial index:
  only high readings are indexed, so the common query touches a fraction of the table and
  the index stays small.

  *The trade-off:* a partial index is only usable when the query predicate matches its
  `WHERE` clause, i.e. at the default threshold. A custom `?threshold=` falls back to the
  composite index. I took that deliberately — the default path is the hot one, and the
  override exists mainly for exploration.

**Constraints carry invariants that the application must not be trusted to hold alone:**
`CHECK (heart_rate > 0 AND heart_rate < 300)` rejects impossible telemetry, and
`UNIQUE (patient_id, timestamp)` makes ingest idempotent — a device replaying a reading
cannot create a duplicate.

## Decisions and trade-offs

**Aggregate in SQL, not in Node.** Analytics runs a single `COUNT/AVG/MIN/MAX` query:
one round trip, constant memory, no rows shipped to the application. The obvious
alternative — `find()` then `reduce()` — is O(rows) in memory and would not survive real
telemetry volume. Postgres returns `AVG` as a *numeric string* to preserve precision, so
the service parses and rounds it explicitly rather than letting a string leak into the API.

**Tracking belongs in an interceptor, not in the services.** The requirement is a
cross-cutting concern, so no business service knows it exists. The interceptor is opt-in
and declarative — handlers carry `@TrackPatientRequest()` and the interceptor reads that
metadata via `Reflector`, rather than pattern-matching on URLs, which would silently break
the moment a route is renamed.

Three details matter more than the mechanism:

- *It counts successes only.* The increment sits in `tap({ next })`, so a 404 or a
  validation failure never inflates a counter.
- *It is atomic.* `INSERT … ON CONFLICT DO UPDATE SET request_count = request_count + 1`
  is one statement. A read-modify-write would lose increments under concurrency; the e2e
  suite fires 25 simultaneous reads and asserts the counter lands on exactly 25. This is
  the one place using a parameterized statement rather than the query builder — TypeORM's
  `orUpdate()` can only assign `EXCLUDED` values and cannot express `count + 1`.
- *It cannot break a read.* The increment is not awaited and its failure is logged and
  swallowed. Usage telemetry must never delay or fail a clinical request. The cost is that
  the counter is eventually consistent by a few milliseconds, which the e2e test
  accommodates by polling rather than by slowing every request down.

Reading a counter deliberately does not increment it — `request-stats` is untracked.

**Semantics I had to choose, and why.**

- **`> 100`, strictly.** Tachycardia is a heart rate *above* 100 bpm, so a reading of
  exactly 100 is not an event. The threshold comes from configuration, never a literal.
- **Ranges are inclusive on both ends**, and both bounds are optional. `from === to` is
  valid and matches readings at exactly that instant.
- **An empty range returns `200` with nulls, not `404`.** "No readings in this window" is
  a valid answer about a patient who exists. A *missing patient* is the 404. Conflating
  the two would make the API lie about which thing is absent.
- **Future timestamps are accepted.** Device clocks drift; rejecting them would discard
  real data. They simply return nothing.
- **Page past the end returns `200` with an empty list** and the true total, not a 404.

**Errors and responses are shaped once, globally.** A response envelope interceptor and a
catch-all exception filter guarantee one success shape and one error shape. The filter maps
Postgres SQLSTATEs to sensible HTTP codes and collapses everything else to a generic 500 —
driver messages and stack traces never reach the client.

## Edge-case contract

Every row below has a test.

| Area | Case | Behaviour |
|---|---|---|
| Patient | Unknown id | `404`, checked before any query work |
| | Blank or whitespace id | `400` |
| | Id longer than 64 chars | `400`, bounded before it reaches the DB |
| | Exists but has no readings | `200` with nulls, never `404` |
| Range | Not ISO-8601 | `400`, naming the field |
| | `from > to` | `400` from a cross-field validator |
| | `from === to` | Valid, inclusive |
| | One bound only / neither | Open-ended on the missing side |
| | Offset (`+03:00`) vs `Z` | Normalized to UTC, identical results |
| | Future timestamps | Accepted, returns empty |
| Threshold | Omitted | Configured default |
| | Non-numeric, or outside 1–299 | `400`, mirroring the DB check constraint |
| | Reading exactly at threshold | Excluded; one above is included |
| Pagination | `page < 1`, `limit` outside 1–100, non-integer | `400` |
| | Past the last page | `200`, empty items, true total |
| Analytics | Empty window | `count: 0`, stats `null` |
| | One reading | average = min = max |
| | `AVG` as a numeric string | Parsed, rounded to one decimal |
| Tracking | No counter row yet | `200` with `0`, not `404` |
| | Handler threw | Not counted |
| | N concurrent reads | Exactly N |
| | Counter write fails | Logged, response unaffected |
| | Reading the counter | Does not increment it |
| Transport | Unknown query parameter | `400` |
| | Unknown route | `404` in the same envelope |
| | Missing or invalid API key | `401`; health is exempt |
| | Database unreachable | `503`, no driver details leaked |

## Security

This is patient data, so the defaults lean strict: every input validated with a whitelist
that rejects unknown parameters; every query parameterized through the query builder, with
zero string interpolation; Helmet, a CORS allowlist and rate limiting; a non-root user in a
multi-stage image; secrets only via environment, validated at boot.

**Only patient *ids* are ever logged — never names or ages.** API keys and authorization
headers are redacted from logs.

The API-key guard is a deliberate placeholder that shows where auth belongs, not a real
answer. Production needs JWT/OIDC with RBAC (a clinician should not see every patient),
TLS termination, encryption at rest, and an immutable audit log of who read which record —
which is a regulatory requirement here, not a nice-to-have, and is distinct from the usage
counters this service keeps.

## Suggested improvements

Roughly in the order I would do them.

1. **Move counters off the transactional path.** `Redis INCR` with a periodic flush, or an
   event onto RabbitMQ for a consumer to aggregate. Today every tracked read is a write to
   Postgres, which is the first thing to hurt under load.
2. **Keyset pagination** for high events. `OFFSET` degrades linearly, and this is exactly
   the table that grows without bound.
3. **Partition `heart_rate_readings` by month**, or move it to TimescaleDB with continuous
   aggregates for pre-computed hourly and daily rollups. Analytics over a year of telemetry
   should not scan raw rows. This is the natural next step once volume justifies it.
4. **Real authentication and an audit log** — see above.
5. **An ingest API** with batching, backpressure and idempotency keys. The service
   currently only reads; the unique constraint is already the right foundation.
6. **Per-patient alerting thresholds.** One global 100 bpm constant is clinically wrong —
   a resting infant and a 45-year-old on a treadmill are not comparable. The threshold
   should be a property of the patient, or of the care plan.
7. **OpenTelemetry traces** alongside the existing structured logs and health probes.
8. **Testcontainers** for e2e, so the suite provisions its own database rather than
   depending on one being up.
