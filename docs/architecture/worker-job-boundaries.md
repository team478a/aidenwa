# Worker job boundaries

Worker queue adapters live below `apps/worker/src/jobs/<domain>`.

For Imports, `processImportJob` recognizes only `company-import-mapping` and `company-import`.
Each adapter validates the stable Outbox payload before invoking the existing engine. Mapping,
processing, retry and recovery have separate entry-point files, while atomic row transactions and
bounded 200-row processing stay in `import-engine.ts`.

The final Phase 8 slice added `bootstrap/register-workers.ts` with an explicit Job Name Registry.
Imports, Mock Call, Production Call, emergency stop, Provider Webhook and every maintenance Job
have named handlers. Unknown names are observable through a sanitized warning containing no Job
payload.

Bootstrap construction is separated into Prisma, Redis/Queue, Worker registration, scheduler
registration, graceful shutdown and main composition. Worker concurrency and retry policy are
unchanged. Scheduler registration still uses stable `upsertJobScheduler` IDs, and graceful
shutdown preserves ordered cleanup and first-failure propagation.

Appointment maintenance delegates to three explicit jobs: atomic hold expiration, deduplicated
upcoming notification and bounded event cleanup. The existing `maintenance:appointment` scheduler
name, hourly cadence and public `maintainAppointments` compatibility entry point remain unchanged.

Phase 9 moved Maintenance orchestration to `jobs/maintenance/registry.ts`, failure handling to
`failure-reporting.ts`, and each of the 12 stable scheduled operations to its own Job file.
`maintenance.ts` is compatibility-only. Scheduler names/frequencies, upsert IDs, Redis locking,
timeouts, retries/backoff, retained history and Incident deduplication are unchanged.
