---
name: nestjs-best-practices
description: Rules for writing and reviewing NestJS services - module structure, dependency injection, validation, data access, error handling, security and testing. Use when adding or changing NestJS modules, controllers, services, DTOs, interceptors, guards or TypeORM queries.
---

# NestJS best practices

Adapted from [Kadajett/agent-nestjs-skills](https://github.com/Kadajett/agent-nestjs-skills),
checked against the NestJS and TypeORM documentation. Where this file departs from that
source it says so and why.

## Architecture

**Organize by feature, not by technical layer.** `src/users/{controller,service,entity,dto}`,
not `src/controllers/` plus `src/services/`. A feature is then one directory to read, move or
delete.

**Never create a circular dependency between modules.** It is a common cause of a provider
resolving to `undefined` at runtime. Fix it by extracting the shared piece into a third
module, or by making one side emit an event instead of calling the other. `forwardRef()`
exists but treat it as a signal that the boundary is wrong, not as the fix.

**Export the module, import the module.** A provider shared between modules belongs to one
owning module that lists it in `exports`. Declaring the same provider in two modules gives
you two instances and two copies of its state. Use `@Global()` only for configuration and
logging.

**One responsibility per service.** When a service grows unrelated groups of methods, split
it. This is about being able to test and change one thing at a time.

## Dependency injection

**Constructor injection only.** Dependencies belong in the constructor signature, where they
are visible and can be replaced in a test. Do not resolve dependencies at runtime through
`ModuleRef.get()`; that hides the dependency graph.

**Understand provider scopes.** `DEFAULT` (singleton) is right for nearly everything.
`REQUEST` scope bubbles up the whole injection chain: anything depending on a request-scoped
provider becomes request-scoped too, and each is re-instantiated per request. Use
`AsyncLocalStorage` (or `nestjs-cls`) for per-request context instead.

**Use injection tokens for interfaces.** TypeScript interfaces do not exist at runtime, so
`@Inject(PAYMENT_GATEWAY)` with an exported `Symbol` or string constant is what makes an
interface injectable.

**Do not introduce an interface with a single implementation** just to have one. Add the seam
when a second implementation or a test double actually needs it.

## Data access

**`Repository<T>` is already the repository pattern.** Injecting it into a service is
sufficient. This is a deliberate departure from the source document, which rates a custom
repository class as HIGH priority.

Add a custom repository only when several call sites share a non-trivial query. In TypeORM
0.3 the way to do that is `dataSource.getRepository(Entity).extend({ ... })`;
`@EntityRepository`, `AbstractRepository` and `getCustomRepository()` are deprecated.

**Migrations are the only source of truth.** Never ship `synchronize: true`. Keep seed data
out of migrations so schema history stays clean and the seed can be re-run.

**Parameterize every query.** Named parameters in the query builder, never string
concatenation or interpolation of user input.

**Avoid N+1.** Fetch relations in one query with `relations: [...]` or an explicit
`leftJoin`, rather than querying inside a loop.

**Wrap multi-step writes in a transaction** so they either all apply or none do.

**Aggregate in SQL.** `COUNT`, `AVG`, `MIN`, `MAX` belong in the query, not in a `reduce()`
over rows loaded into memory. Postgres returns `AVG` and `BIGINT` as strings to preserve
precision, so parse them before returning.

**Count without work you do not need.** `getCount()` on a query that joins another table
inherits that join. If the join cannot change the number of matching rows, as with a NOT NULL
foreign key, count on the filter alone and add the join only when fetching the page.

**Batch large inserts.** Postgres allows 65535 parameters per statement, so a three-column
insert caps out near 21000 rows.

## API design

**Every list endpoint is paginated and bounded.** A `findAll()` with no limit is a latent
outage: it grows with the table. Cap `limit`, and order by something unique (add the primary
key as a tiebreak) so paging is deterministic.

**Bound expensive query parameters too**, such as the width of a time range, so one request
cannot ask for years of data.

**Offset pagination degrades with depth.** `OFFSET 100000` walks the rows it skips. Move to
keyset pagination when deep pages matter.

**Validate at the boundary with DTOs.** Configure the global `ValidationPipe` with
`whitelist: true`, `forbidNonWhitelisted: true` and `transform: true`. Prefer
`enableImplicitConversion: false` and state each conversion with `@Type()` or `@Transform()`,
so coercion is explicit and reviewable.

**A validator that needs a provider** must be a `ValidatorConstraint` class, with
`useContainer(app.select(AppModule), { fallbackOnErrors: true })` called at bootstrap so
class-validator resolves it through Nest's container.

**Separate input and output types.** Do not return entities directly when they carry fields
the client should not see.

**Version the API** from the start.

## Cross-cutting concerns

**Interceptors** for anything that wraps the handler: response envelopes, timing, logging,
side effects on success. `tap({ next })` runs only on success, so a failed request does not
trigger the side effect.

**Exception filters** for turning errors into responses. Register one globally and let it own
the error shape. Never leak driver messages or stack traces to the client.

**Guards** for authorization decisions. **Pipes** for parsing and validating input.

**Fire-and-forget work must be caught.** An un-awaited promise that rejects can take the
process down. Use `void doWork().catch((error) => logger.error(error))` when the caller
genuinely should not wait, and never let telemetry failures break the request.

**Throw HTTP exceptions from services.** `throw new NotFoundException()` in the service keeps
the controller thin and the behaviour consistent.

## Security

- Validate all input; reject unknown fields rather than ignoring them.
- Helmet, a CORS allowlist, and rate limiting (`@nestjs/throttler`).
- Validate configuration at startup so a missing secret fails the boot, not the first request.
- Secrets from the environment only, never committed.
- Run containers as a non-root user.
- Never log secrets or personal data. Log identifiers, not records.

## Testing

- Unit tests with mocked dependencies for logic.
- E2E with Supertest against the real application and a real database.
- Share the bootstrap between `main.ts` and the tests so the suite exercises the same global
  pipes, prefix and versioning the service actually runs.
- Test the boundaries: exact threshold values, empty ranges, reversed ranges, the page past
  the end, and concurrent writes.
- One behaviour per test, and do not repeat a request just to assert one more field.

## A note on the source

The original document attaches figures to several rules ("3-5x faster onboarding", "40%+
improvement in testability", "reduces coupling by 30-50%"). Those are not sourced and are not
reproduced here. The underlying advice is sound; the numbers are decoration.
