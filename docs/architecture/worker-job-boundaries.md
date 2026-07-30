# Worker job boundaries

Worker queue adapters live below `apps/worker/src/jobs/<domain>`.

For Imports, `processImportJob` recognizes only `company-import-mapping` and `company-import`.
Each adapter validates the stable Outbox payload before invoking the existing engine. Mapping,
processing, retry and recovery have separate entry-point files, while atomic row transactions and
bounded 200-row processing stay in `import-engine.ts`.

This slice does not change Worker bootstrap, concurrency, retry policy, scheduler registration or
graceful shutdown. A later Phase 8 slice will introduce the complete handler registry and
observable unknown-job behavior.

Appointment maintenance delegates to three explicit jobs: atomic hold expiration, deduplicated
upcoming notification and bounded event cleanup. The existing `maintenance:appointment` scheduler
name, hourly cadence and public `maintainAppointments` compatibility entry point remain unchanged.
