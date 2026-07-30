# Module boundaries

Phase 8 moves one stable domain at a time out of Stage-oriented files. Public API paths, payloads,
database models and safety gates remain unchanged.

## Current modules

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
- `appointment.controller.ts`: the existing 15 HTTP handlers and stable response contracts.
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

The former Stage 4E and Worker `appointment.ts` paths are compatibility exports only. Further
grouping of the Appointment controller into settings and operations controllers remains a
size-reduction task; Route and Slot Finder extraction are complete.

Mock Call, Production Call and Worker bootstrap remain later Phase 8 slices.
