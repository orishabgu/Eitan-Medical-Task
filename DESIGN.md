# Design notes

The reasoning behind the code: why things are built this way, what the trade-offs are, and
what I would do next.

## Architecture

One module per concern, kept flat. There are no custom repository classes (TypeORM's
`Repository` already is one), no abstract base classes, no barrel files, and no interfaces
with a single implementation.

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

Controllers validate input and delegate. Services hold the logic and use TypeORM directly.
Cross-cutting concerns (logging, response shape, error shape, request tracking) stay
out of the business services. Each module is self-contained enough to be moved into its own
service if the system were ever split up.

**Module dependencies have no cycles.** `RequestTrackingModule` owns the counter and the
interceptor and depends on nothing. `PatientsModule` and `HeartRateModule` use it. The
`/patients/:id/request-stats` route sits in `PatientsController` rather than in the tracking
module because it needs the patient existence check, and putting it the other way round
would have created a cycle between the two modules.

## Data model

```
patients(id, name, age, gender, created_at)
heart_rate_readings(id, patient_id references patients, timestamp, heart_rate)
patient_request_counters(patient_id references patients, request_count, last_requested)
```

Migrations are the only source of truth for the schema, and `synchronize` is never enabled.
The seed is a separate script that uses `ON CONFLICT DO NOTHING`, so mock data stays out of
the schema history and the script can be run again safely.

**Indexes**

- `idx_hrr_patient_time (patient_id, timestamp DESC)` covers the analytics range scan.
- `idx_hrr_high (timestamp DESC, patient_id) WHERE heart_rate > 100` is a partial index.
  Only high readings are indexed, so the high-events query reads a small part of the table
  and the index stays small.

  The trade-off: a partial index only helps when the query predicate matches its `WHERE`
  clause, which means the default threshold. A custom `?threshold=` falls back to the
  composite index. I chose this because the default is the common case, and the override is
  mainly there for exploring the data.

**Constraints hold the invariants the application should not be trusted with on its own.**
`CHECK (heart_rate > 0 AND heart_rate < 300)` rejects impossible readings, and
`UNIQUE (patient_id, timestamp)` means a device that resends a reading cannot create a
duplicate.

## Decisions and trade-offs

**Aggregate in SQL, not in Node.** Analytics runs one `COUNT/AVG/MIN/MAX` query: a single
round trip, constant memory, and no rows sent to the application. The alternative, calling
`find()` and then `reduce()`, uses memory proportional to the number of rows and would not
hold up with real data volumes. Postgres returns `AVG` as a numeric string to keep
precision, so the service parses and rounds it rather than letting a string reach the API.

**Tracking belongs in an interceptor, not in the services.** It is a cross-cutting concern,
so no business service knows about it. Handlers opt in with `@TrackPatientRequest()` and the
interceptor reads that metadata through `Reflector`. Matching on URLs instead would break
quietly as soon as someone renames a route.

Three details matter here:

- **It only counts successful responses.** The increment runs in `tap({ next })`, so a 404
  or a validation error does not raise the count.
- **It is atomic.** `INSERT ... ON CONFLICT DO UPDATE SET request_count = request_count + 1`
  is a single statement. Reading and then writing would lose increments when requests
  overlap. The e2e suite sends 25 requests at once and checks the counter ends at exactly 25.
  This is the one place that uses a parameterized SQL statement instead of the query builder,
  because TypeORM's `orUpdate()` can only assign `EXCLUDED` values and cannot express
  `count + 1`.
- **It cannot break a read.** The increment is not awaited, and a failure is logged and
  ignored. Usage tracking should never slow down or fail a clinical request. The cost is that
  the counter is a few milliseconds behind, so the e2e test polls for the value instead of
  reading it immediately.

Reading a counter does not increment it. The `request-stats` routes are not tracked.

The counter list is paginated and indexed on `(request_count DESC, patient_id)`. There is one
row per requested patient, so an unbounded list would grow with the patient population, and
the ordering would sort the whole table on every call.

**Behaviour I had to decide, and why**

- **The threshold is exclusive.** Tachycardia means a heart rate above 100 bpm, so a reading
  of exactly 100 is not an event. The value comes from configuration, not from a literal in
  the code.
- **Ranges include both ends**, and both bounds are optional. A range where `from` equals
  `to` is valid and matches readings at that exact time.
- **An empty range returns 200 with null values, not 404.** "No readings in this window" is
  a real answer about a patient who exists. A missing patient is the 404. Using the same
  status for both would hide which one is actually missing.
- **Future timestamps are accepted.** Device clocks drift, and rejecting them would throw
  away real data. They just return nothing.
- **Asking for a page past the end returns 200** with an empty list and the correct total.

**Limiting how much one request can pull.** Three limits work together: `limit` is capped at
100 rows a page, the throttler caps requests per client, and a closed time range may not span
more than `MAX_RANGE_DAYS` (30 by default). The range check is a validator that reads the
limit from configuration through Nest's container, so the number is not baked into a
decorator.

The cap applies only when both bounds are given, because only then is there a span to
measure. An open-ended range is still allowed, and is bounded by something else: high events
are paginated, and analytics is a single-patient aggregate that runs on the
`(patient_id, timestamp)` index. So the cap catches the accidental multi-year query rather
than making the API strictly bounded. Making a bounded window mandatory on analytics is the
next step if this ever serves untrusted callers.

**Errors and responses are shaped in one place.** A response interceptor and a catch-all
exception filter give every endpoint the same success shape and the same error shape. The
filter maps Postgres error codes to sensible HTTP statuses and turns everything else into a
generic 500, so driver messages and stack traces never reach the client.

**Endpoints return response DTOs, never entities.** `PatientResponseDto` lists its fields
explicitly, so a column added to the table cannot leak through the API by accident. A unit
test asserts exactly that.

## Checking it holds up at volume

`npm run seed:scale` generates patients and readings from a deterministic pseudo-random
sequence, inserted in batches of 5000 rows. Batching is required rather than tidy: Postgres
allows 65535 parameters per statement, and a reading costs three, so one insert caps out
around 21000 rows.

Because the generator is deterministic, `test/scale.e2e-spec.ts` computes the expected
count, average, min and max in JavaScript from the same rows it loaded, then checks the API
returns the same numbers. That compares the SQL aggregation against an independent pass over
the data instead of against figures copied in by hand. The same spec pages through a result
set larger than one page and checks there are no gaps, repeats or reordering, using a dataset
where every patient shares the same timestamps so the `id` tiebreak actually matters.

Measured on 500000 patients and 10 million readings (2.8 GB), loaded at about 27000 rows a
second:

| Endpoint | Time |
|---|---|
| analytics for one patient over a month | 3 ms |
| patient by id | 3 ms |
| patients list, first page | 18 ms |
| patients list, page 10000 | 28 ms |
| high events, first page (4.86M matching) | 240 ms |
| high events, page 5000 | 450 ms |

**The count was the bottleneck, not the page fetch.** High events first measured at 2.0
seconds. Counting the matching rows took 494 ms of that while fetching the page took 97 ms,
because the query joined `patients` to get each name and the count inherited that join,
hash-joining all 500000 patients only to produce a number. The join cannot change the count,
since `patient_id` is a NOT NULL foreign key, so the count now runs on the filter alone and
the join is added only for the page. That took the endpoint from 2.0 s to 240 ms.

What remains is inherent to offset pagination: `OFFSET 100000` still walks the rows it skips,
which is why page 5000 costs roughly twice page 1. Keyset pagination is the fix, and it is
listed below.

## Handled edge cases

Each row below has a test.

| Area | Case | Behaviour |
|---|---|---|
| Patient | Unknown id | `404`, checked before running any query |
| | Blank or whitespace id | `400` |
| | Id longer than 64 characters | `400`, rejected before it reaches the database |
| | Exists but has no readings | `200` with nulls, never `404` |
| Range | Not ISO-8601 | `400`, naming the field |
| | `from` after `to` | `400` from a cross-field validator |
| | `from` equal to `to` | Valid, inclusive |
| | One bound only, or neither | Open-ended on the missing side |
| | Offset (`+03:00`) vs `Z` | Converted to UTC, same results |
| | Future timestamps | Accepted, returns empty |
| | Closed range wider than `MAX_RANGE_DAYS` | `400` |
| | Closed range of exactly `MAX_RANGE_DAYS` | Valid |
| Threshold | Not given | Uses the configured default |
| | Not a number, or outside 1 to 299 | `400`, matching the database check constraint |
| | Reading exactly at the threshold | Excluded. One above is included |
| Pagination | `page` below 1, `limit` outside 1 to 100, or not an integer | `400` |
| | Past the last page | `200`, empty items, correct total |
| Analytics | Empty window | `count: 0` and null statistics |
| | One reading | average, min and max are all equal |
| | `AVG` returned as a string | Parsed and rounded to one decimal |
| Tracking | No counter row yet | `200` with `0`, not `404` |
| | Handler threw an error | Not counted |
| | N requests at once | Counter ends at exactly N |
| | Counter write fails | Logged, response is unaffected |
| | Reading the counter | Does not increment it |
| Transport | Unknown query parameter | `400` |
| | Unknown route | `404` in the same error shape |
| | Database unreachable | `503`, with no driver details leaked |

## Security

This is patient data, so the defaults are strict: all input is validated against a whitelist
that rejects unknown parameters, all queries are parameterized through the query builder with
no string interpolation, and the service uses Helmet, a CORS allowlist and rate limiting. The
Docker image runs as a non-root user in a multi-stage build, and secrets come only from
environment variables that are validated at startup.

**Only patient ids are logged, never names or ages.** Authorization headers are redacted from
logs.

**There is no authentication.** The API is open, which is fine for reviewing the exercise and
not fine for real patient data. Production needs JWT or OIDC with role-based access control,
since a clinician should not be able to read every patient, plus TLS termination, encryption
at rest, and an audit log of who read which record. That audit log is a regulatory
requirement, and it is a separate thing from the usage counters this service keeps.

## Suggested improvements

Roughly in the order I would do them.

1. **Move the counters off the request path.** Use `Redis INCR` with a periodic flush, or
   publish an event to RabbitMQ and let a consumer aggregate it. Right now every tracked read
   writes to Postgres, which is what will struggle first under load.
2. **Switch to keyset pagination** for high events, now the measured next bottleneck.
   `OFFSET` gets slower the deeper you page,
   and this is the table that keeps growing.
3. **Cache analytics over closed historical windows.** A range that ends in the past cannot
   change, so the result can be cached by patient and window and served from Redis instead of
   being recomputed on every read. Windows that reach up to now must stay uncached.
4. **Partition `heart_rate_readings` by month**, or move it to TimescaleDB and use continuous
   aggregates for hourly and daily rollups. Analytics over a year of data should not have to
   scan raw rows.
5. **Add real authentication and an audit log**, as described above.
6. **Require mTLS for device ingest.** Readings come from infusion pumps rather than
   browsers, so each device should present a client certificate, with per-device identity,
   rotation and revocation handled at the ingress.
7. **Add a write API** with batching, backpressure and idempotency keys. The service only
   reads today, and the unique constraint is already the right foundation for it.
8. **Make the threshold per patient.** A single 100 bpm value is clinically wrong, since a
   sleeping infant and an adult on a treadmill are not comparable. The threshold should belong
   to the patient or to the care plan.
9. **Add OpenTelemetry tracing** next to the existing structured logs and health probes.
10. **Use Testcontainers for the e2e suite**, so it starts its own database instead of relying
   on one already running.
