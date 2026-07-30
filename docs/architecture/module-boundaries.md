# Module boundaries

Phase 8 moves one stable domain at a time out of Stage-oriented files. Public API paths, payloads,
database models and safety gates remain unchanged.

## Current modules

### Sales data

Companies:

- `company.routes.ts`: six existing Company URL registrations.
- `company.controller.ts`: authentication, CSRF, validation, response and audit boundary.
- `company.service.ts`: create, update and soft-delete mutations without Fastify dependencies.
- `company.repository.ts`: organization/owner-scoped reads and list filters.
- `company.policy.ts`: manager/sales visibility and owner-assignment rules.

Contacts:

- `contact.routes.ts`: existing Contact URL registration.
- `contact.controller.ts`: scoped Company access, authentication, CSRF, response and audit.
- `contact.service.ts`: normalized create, update and soft-delete mutations.
- `contact.repository.ts`: organization-scoped Contact reads without Role decisions.
- `contact.policy.ts`: inheritance of Company visibility rules.

The Stage 2 sales-data split is in progress. Phone Numbers, Tags, Sales Lists and OptOuts remain
in `stage2-routes.ts`; Import remains an independent module.

### Imports

API:

- `import.routes.ts`: Fastify route registration and response status.
- `import.controller.ts`: multipart CSV decoding, parsing, bounds and formula neutralization.
- `import.service.ts`: mapping, execution, failed-row retry and cancellation transitions.
- `import.repository.ts`: organization-scoped ImportJob/ImportRow reads.
- `import.policy.ts`: independently testable allowed-state sets.
- `import.outbox.ts`: transactional queue intent.
- `import.schemas.ts` / `import.types.ts`: validation exports and explicit dependencies.

Worker:

- `mapping.job.ts` and `processing.job.ts`: queue payload boundary and job dispatch.
- `retry.job.ts`: failed-row processing entry point.
- `recovery.job.ts`: durable Outbox recovery entry point.
- `import-engine.ts`: existing bounded mapping and atomic row-processing engine.

The former `company-import.ts` path is a compatibility export only. It contains no business logic.

## Dependency direction

Routes depend on controller/service/repository/policy. Services may use repositories and Outbox,
but do not depend on Fastify. Repositories do not decide roles. Worker job adapters validate queue
payloads before calling the Import engine.

### Appointments

API:

- `appointment.routes.ts`: 11-line Fastify registration boundary.
- `appointment.controller.ts`: 14-line composition boundary.
- `appointment-settings.controller.ts`: Policy and Availability HTTP handlers.
- `appointment-operations.controller.ts`: Slot, Hold, transition, reschedule and dashboard handlers.
- `appointment-controller.context.ts`: shared auth, CSRF, audit and scoped Repository dependencies.
- `appointment.policy.ts`: role/assignee and organization-scope construction.
- `appointment.repository.ts`: scoped appointment/event/status reads.
- `appointment.service.ts`: Hold, transition and reschedule transactions.
- `appointment-state.ts`: pure transition graph and time-bound transition assertions.
- `slot-token.ts`: signed Slot Token creation and strict verification.
- `slot-finder.ts`: timezone-aware bounded availability search and signed slot creation.

Worker:

- `expiration.job.ts`: atomic held-to-expired transition, Event and notification.
- `notification.job.ts`: deduplicated upcoming appointment notification.
- `cleanup.job.ts`: bounded old-event retention cleanup.

The former Stage 4E and Worker `appointment.ts` paths are compatibility exports only. Route,
Controller grouping and Slot Finder extraction are complete.

### Mock Calls

Worker module:

- `mock-call.service.ts`: complete Mock execution orchestration and stable dispatch service entry
  point.
- `mock-call.policy.ts`: callable-window, attempt, retry, daily and concurrency limits plus
  deterministic fixture outcomes.
- `mock-call.repository.ts`: atomic stop transitions and stale reservation recovery.
- `mock-call-state.ts`: compatibility boundary for the pure stop-state machine.
- `usage-ledger.service.ts`: ledger-derived call/budget counters and threshold audits.

Worker jobs:

- `dispatch.job.ts`: queue dispatch entry point.
- `recovery.job.ts`: stale reservation recovery entry point.
- `usage-rebuild.job.ts`: scheduled counter reconstruction entry point.

The former `mock-call.ts` is a compatibility-export boundary only. Dispatch remains hard-wired
to `MockVoiceProvider`; no production Provider is reachable through this module.

### Production Calls

Worker:

- `dispatch.service.ts`: final authorization, source-number, rate, destination and Production Gate
  checks followed by provider dispatch.
- `rollback.service.ts`: scoped emergency cancellation and authorization expiry.
- `cost-reconciliation.service.ts`: bounded final-cost lookup and incident creation.
- `provider.ts`: fail-closed readiness and Twilio Provider construction.
- `production-call.repository.ts`: rejected-execution persistence and audit.
- `jobs/production-calls/*`: dispatch, rollback and cost-reconciliation entry points.

API:

- `reservation.service.ts`: organization-scoped eligibility plus serialized limit/budget
  reservation and transactional Outbox intent.
- `twilio-webhook.service.ts`: signature/correlation validation, TwiML/DTMF responses and durable
  Provider Webhook event ingestion.
- `incident.service.ts`: deduplicated sanitized Production Incident creation.
- `production-call.policy.ts` and `provider.ts`: fail-closed activation, pure mappings and Provider
  construction.

Controller boundaries:

- `source-number.controller.ts`: registration, verification and revocation.
- `incident.controller.ts`: scoped incident listing and resolution.
- `authorization.controller.ts`: limited-test lifecycle, activation gates and rollback Outbox.
- `real-call.controller.ts`: provider-unknown resolution, manual reservation and masked queries.
- `controller.types.ts`: explicit HTTP boundary dependencies.

`stage4b-routes.ts` is a 75-line registration/composition boundary. Production Call/Twilio
modularization is complete.

### Worker bootstrap

- `create-prisma.ts`: database client construction.
- `create-redis.ts`: Redis and Queue construction.
- `register-workers.ts`: explicit Job Registry, Worker listeners and unknown-Job monitoring.
- `register-schedulers.ts`: idempotent maintenance scheduler registration.
- `graceful-shutdown.ts`: signal handling and ordered resource cleanup.
- `main.ts`: validated environment composition.

`apps/worker/src/index.ts` is a two-line entry point. Phase 8 modularization is complete.
