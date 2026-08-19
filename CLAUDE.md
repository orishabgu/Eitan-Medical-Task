# CLAUDE.md

Guidance for agents working in this repository.

## What this is

A NestJS + PostgreSQL service for patient heart-rate telemetry: high heart-rate events,
per-patient analytics over a time range, and per-patient request counters. Read
[README.md](README.md) to run it, [DESIGN.md](DESIGN.md) for the decisions behind the code.

## Commands

```bash
docker compose up --build   # migrate, seed and serve
npm run start:dev           # watch mode, needs postgres up
npm test                    # unit
npm run test:e2e            # e2e, needs postgres, uses its own eitan_medical_test database
npm run lint                # eslint, type-aware
npm run typecheck           # tsc --noEmit
npm run seed:scale          # generated dataset, SCALE_PATIENTS and SCALE_READINGS
```

Run `npm run lint && npm run typecheck && npm test` before considering a change done. The e2e
suite needs a running Postgres, so run it when the change touches routing, validation or SQL.

## Conventions this codebase follows

- **Controllers stay thin.** Validate, delegate, return. Logic lives in services, which use
  TypeORM directly. There are no custom repository classes: `Repository<T>` is already one.
- **Cross-cutting concerns never live in a business service.** Response shape, error shape,
  logging and request tracking are interceptors and filters.
- **Migrations are the only source of truth for the schema.** `synchronize` is never enabled.
  Seed data lives in a separate script, not in a migration.
- **Every query is parameterized** through the query builder. The one raw statement, the
  counter upsert in `request-tracking.service.ts`, is parameterized and documented in place.
- **Every list endpoint is paginated and bounded.** No endpoint may return an unbounded row
  count. Closed time ranges are capped by `MAX_RANGE_DAYS`.
- **Comments explain why, not what.** Most code should need none. Existing comments mark
  non-obvious decisions: the strict `>` threshold, the atomic upsert, the partial index.
- **Plain ASCII** in source and docs. No em-dashes, arrows or smart quotes.

## Testing

Unit tests mock the repository. E2E runs the real app against a real Postgres, with the
schema and seed created in `test/global-setup.ts`. `test/create-app.ts` shares the bootstrap
with `src/app-setup.ts`, so tests cannot drift from the real validation and routing config.

Add a test for each behaviour in the edge-case table in DESIGN.md. Do not add a second test
that re-requests the same endpoint to assert one more field; extend the existing assertion.

## Things that have bitten this codebase

- **A count that inherited a join.** `getCount()` on a query with `innerJoin` hash-joined
  500000 patients to produce a number, costing 494 ms. Count on the filter alone and add the
  join only for the page.
- **Unbounded list endpoints.** The counter list returned every row before it was paginated.
- **Batched inserts are not optional.** Postgres allows 65535 parameters per statement, so a
  three-column insert caps out near 21000 rows.
- **`localhost` in a container healthcheck** resolves to `::1` while the server binds IPv4.
  Use `127.0.0.1`.

## Skills

[skills/nestjs-best-practices/SKILL.md](skills/nestjs-best-practices/SKILL.md) holds the
general NestJS rules this codebase follows.
