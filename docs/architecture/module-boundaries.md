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

Phone Numbers:

- `phone-number.routes.ts`: existing Phone Number URL registration.
- `phone-number.controller.ts`: Company/Contact scope, HTTP response and masked audit boundary.
- `phone-number.service.ts`: normalization, Primary transaction and mutation behavior.
- `phone-number.repository.ts`: organization-scoped Phone and Contact reads.
- `phone-number.policy.ts`: FAX/callable and safe audit-projection rules.

Tags:

- `tag.routes.ts`: Tag CRUD and Company Tag assignment URL registration.
- `tag.controller.ts`: admin/manager authorization, scoped responses and audit.
- `tag.service.ts`: Tag mutations and idempotent Company assignments.
- `tag.repository.ts`: organization-scoped Tag and assignment reads.
- `tag.policy.ts`: explicit Tag mutation roles.

Sales Lists:

- `sales-list.routes.ts`: existing list, preview and membership URL registration.
- `sales-list.controller.ts`: scoped HTTP, bulk-limit and audit boundary.
- `sales-list.service.ts`: list mutations and idempotent membership changes.
- `sales-list.repository.ts`: organization-scoped list/company reads.
- `sales-list.policy.ts`: mutation roles and sales-owned preview scope.

OptOuts:

- `opt-out.routes.ts`: list, create, check and release URL registration.
- `opt-out.controller.ts`: Company ownership, scope validation and safe audit boundary.
- `opt-out.service.ts`: snapshot persistence, Company status update and reasoned release.
- `opt-out.repository.ts`: organization-scoped OptOut, Phone and Contact reads.
- `opt-out.policy.ts`: sales list scope, admin-only release and snapshot-free audit projection.

`stage2-routes.ts` is a 71-line registration/composition boundary. Stage 2 modularization is
complete; Import remains an independent module.

### Stage 3 settings and campaigns

Products:

- `product.routes.ts`: existing Product and Product Version URL registration.
- `product.controller.ts`: authentication, CSRF, validation, response and audit boundary.
- `product.service.ts`: Product mutation, version creation and draft-only publishing.
- `product.repository.ts`: organization-scoped Product reads and version numbering.
- `product.policy.ts`: explicit Product mutation roles.

AI Agents:

- `ai-agent.routes.ts`: existing AI Agent and version URL registration.
- `ai-agent.controller.ts`: authentication, CSRF, validation, response and audit boundary.
- `ai-agent.service.ts`: Agent mutation, version creation and draft-only publishing.
- `ai-agent.repository.ts`: organization-scoped Agent reads and version numbering.
- `ai-agent.policy.ts`: explicit AI Agent mutation roles.

The Stage 3 split is in progress. Scenarios, Knowledge, Campaigns, Campaign Targets and Call Jobs
remain in `stage3-routes.ts`.

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

### Stage 3 settings and campaigns

- `modules/products`, `modules/ai-agents`, `modules/scenarios` and `modules/knowledge`: versioned
  settings resources with scoped repositories and immutable publish transitions.
- `modules/campaigns`: campaign lifecycle and organization-scoped management.
- `modules/campaign-targets`: preview/materialization plus FAX, callable and opt-out eligibility.
- `modules/call-jobs`: Mock Call queueing, scoped reads, cancellation and manual Mock outcomes.
- `stage3-routes.ts`: registration/composition only.
- `stage3-services.ts`: compatibility exports only; business logic lives in domain modules.

These modules preserve Mock-only execution. They do not construct a production Voice Provider or
initiate an external call.

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

### Production Safety

- `approval`: draft/edit/submit and system-admin decision transitions.
- `policy`: organization Production Call limits and sanitized audit projection.
- `emergency-stop`: scoped activation, atomic queued-job stopping, Outbox and reasoned release.
- `allowlist`: consented/expiring test destinations with masked API and audit output.
- `provider-configuration`: system-admin-only configuration forced to production-disabled.
- `gate-decision`: Gate evaluation, reason-code persistence and bounded Usage views.
- `readiness`: fail-closed readiness aggregation.
- `mock-webhook`: HMAC/time-window validation, deduplication, sanitization and bounded retry queue.

`stage4-routes.ts` is registration/composition only. No module enables an external Provider or real
telephone call.

### Realtime and Media Streams

- `realtime-session`: organization-scoped reads and bounded operator termination.
- `realtime-simulation`: Fake Provider execution and persisted normalized events.
- `media-stream`: fail-closed activation, TwiML, preValidation, WebSocket orchestration,
  persistence, audit and Transport adapter boundaries.
- `token`: Twilio signature and short-lived Session Token verification.
- `protocol`: bounded raw-data conversion and sanitized failure codes.

The former `stage4b2-services.ts` and `stage4b2-media.ts` paths are compatibility exports only.
Media Stream Routes contain registration only. No raw audio or raw Provider message persistence
was introduced.

### Worker bootstrap

- `create-prisma.ts`: database client construction.
- `create-redis.ts`: Redis and Queue construction.
- `register-workers.ts`: explicit Job Registry, Worker listeners and unknown-Job monitoring.
- `register-schedulers.ts`: idempotent maintenance scheduler registration.
- `graceful-shutdown.ts`: signal handling and ordered resource cleanup.
- `main.ts`: validated environment composition.

`apps/worker/src/index.ts` is a two-line entry point. Phase 8 modularization is complete.
