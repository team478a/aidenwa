# Maintainability remediation report

## Phase 1 — Transactional Outbox

- Scope: Phase 1 only
- Base commit: `afc13304ff74b61b77473403615fc97ebec31ea0`
- External provider calls / real calls: 0

### Implemented

- Added migration `20260724010000_phase1_transactional_outbox`.
- Added durable pending/publishing/published/failed delivery state, attempt count, availability, lock, publication time, and sanitized error code.
- Moved company import, mock call, Twilio limited call, emergency stop, and authorization rollback scheduling into their business database transactions.
- Added a Worker publisher with bounded batches, deterministic job IDs, exponential backoff, eight-attempt terminal failure, and stale-lock recovery.
- Added startup/hourly repair for legacy queued/reserved/requested gaps.
- Preserved all existing API response shapes.

### Idempotency keys

| Event                   | Aggregate                         | BullMQ jobId                 |
| ----------------------- | --------------------------------- | ---------------------------- |
| `company-import`        | ImportJob ID                      | `company-import-{id}`        |
| `mock-call`             | CallJob ID                        | `mock-call-{id}`             |
| `twilio-call`           | RealCallExecution ID              | `twilio-call-{id}`           |
| `twilio-emergency-stop` | EmergencyStop or Authorization ID | `twilio-emergency-stop-{id}` |

### Verification

Focused coverage includes transaction rollback, Queue failure and redelivery, stable job IDs, Worker-restart lock recovery, and repair of all specified legacy gap categories.

- Prisma format / validate / generate: PASS
- Empty database: 12 migrations + seed: PASS
- Prisma drift: none
- lint / format / typecheck: PASS
- Unit/API/Worker: 24 files, 101 tests: PASS
- E2E: 8 tests: PASS
- Web/API/Worker production build: PASS
- GitHub Actions: run `30030010473` PASS for implementation commit `d5371a2`

### Remaining phases

CSV row atomicity, call/target state machines, usage ledger, production environment fail-fast, appointment state machine, webhook retry, scheduled maintenance migration, and incremental module splitting remain explicitly out of scope for Phase 1.

## Phase 2 — Atomic and retryable CSV rows

- Scope: Phase 2 only; Phase 3 and later remain unimplemented.
- Added `ImportRow.processingStatus`, `attemptCount`, `lastErrorCode`, and
  `lastErrorMessage` independently from the input `action`.
- Processing is paged in bounded 200-row batches and checks cancellation before every batch and row.
- Duplicate candidates are rechecked in the row transaction.
- Company, phone, contact, successful ImportRow result, and row audit are committed atomically.
- A row failure rolls back its business writes, records a sanitized failure, and allows later rows
  to continue.
- `POST /api/v1/imports/companies/{id}/retry-failed` resets only failed rows and emits a fresh
  transactional Outbox event. Successful rows remain terminal and are not recreated.
- Existing CSV formula neutralization remains applied during upload and mapping.
- External provider calls / real calls: 0.

Focused tests:

- `rolls back the company when a later row operation fails`
- `retries only failed rows and never recreates successful rows`
- `continues after one invalid row and distinguishes failed and successful results`

Verification:

- Prisma format / validate / generate: PASS
- Empty database: all 13 migrations + seed: PASS
- Prisma drift: none
- lint / format / typecheck: PASS
- Unit/API/Worker: 25 files, 106 tests: PASS
- Existing E2E: 8 tests: PASS
- Web/API/Worker production build: PASS
- GitHub Actions: run `30034990609` PASS for commit `69796b4`

Phase 2 performance acceptance:

- Mapping/duplicate preview preparation runs in the Worker in bounded 200-row pages.
- Duplicate lookup is batched once per page rather than queried once per row.
- A 10,000-row API test verifies a `202` response without updating any ImportRow and exactly one
  pending Outbox event.
- Upload size and row count remain bounded by `CSV_MAX_BYTES` and `CSV_MAX_ROWS`; persisted row
  processing does not retain the complete import in Worker memory.

Final Phase 2 verification:

- lint / format / typecheck: PASS
- Unit/API/Worker: 25 files, 106 tests: PASS
- E2E: 8 tests: PASS
- Web/API/Worker production build: PASS
- GitHub Actions: run `30063711663` PASS for final Phase 2 commit `2080a39`
- External provider calls / real calls: 0

## Phase 3 — Mock call state and usage consistency

- Scope: Phase 3 only; Phase 4 and later remain unimplemented.
- Added a pure state transition function for emergency stop, campaign stop, scheduling limits,
  FAX/invalid/opt-out exclusion and temporary provider failure.
- CallJob and CampaignTarget stop states now commit in one transaction.
- Emergency/campaign stops return queued targets to `pending`; permanent exclusions move targets to
  `excluded`; temporary failures move targets to `retry_wait`.
- Added migration `20260724030000_phase3_usage_ledger`.
- Mock call outcome and its unique Usage Ledger row commit in the same transaction.
- Counter projections rebuild from the organization-scoped ledger. Completed-job redelivery retries
  rebuilding without provider dispatch or outcome duplication.
- Focused tests cover seven state mappings, emergency/campaign stop consistency, provider failure,
  unique ledger accounting and counter reconstruction.
- Unit/API/Worker: 26 files, 115 tests: PASS locally.
- Prisma format/validate/generate: PASS.
- Empty database: all 14 migrations + seed; Prisma drift: none.
- lint/format/typecheck, 8 E2E tests and Web/API/Worker production build: PASS.
- GitHub Actions: run `30068669227` PASS for Phase 3 commit `ac2398c`.
- External provider calls / real calls: 0.

## Phase 4 — Production environment fail-fast

- Scope: Phase 4 only; Phase 5 and later remain unimplemented.
- API and Worker use the same production refinement in `@sales-ai/validation/env`.
- Core database, Redis, web origin and application secrets fail startup validation when missing or
  unsafe.
- Localhost, loopback, `.example.local`, known development values, `replace-with-...` and
  `uncommitted` are rejected in production.
- Twilio, OpenAI Realtime and Zoom requirements are conditional on their feature switches.
- Worker uses the parsed shared `DATABASE_URL` and has no separate fallback.
- Focused environment validation: 18 tests PASS, including secret non-disclosure.
- Unit/API/Worker: 26 files, 130 tests PASS with two local workers. An unrestricted run produced one
  resource-contention API health timeout; isolated and bounded reruns passed.
- Prisma format/validate/generate: PASS.
- Empty database: all 14 migrations + E2E seed; Prisma drift: none.
- lint/format/serial typecheck, 8 E2E tests and Web/API/Worker production build: PASS.
- GitHub Actions: run `30084030037` PASS for Phase 4 commit `f14d7fe`.
- Existing non-blocking Next.js ESLint plugin detection warning remains unchanged.
- External provider calls / real calls: 0.

## Phase 5 — Appointment state and consistency

- Scope: Phase 5 only; Phase 6 and later remain unimplemented.
- Added the documented `held`, `confirmed`, `reschedule_requested` and terminal transition graph.
- Invalid terminal transitions, completion/no-show before start, and late cancellation fail closed.
- Appointment state/version, AppointmentEvent, deduplicated notification and applicable linked
  record updates use one transaction.
- A forced AppointmentEvent failure rolls the appointment update back; concurrent confirmation
  creates one state change and one Event.
- Slot tokens receive strict Zod structural validation before use.
- Policy and AvailabilityRule validity periods, minimum notice, maximum advance, duration,
  cancellation deadline and hold TTL are enforced.
- Appointment creation revalidates every referenced row against the organization.
- Two Phase 5 migrations add foreign keys/Prisma relations, allowed-state and validity-period
  checks, and retain overlap protection during reschedule requests.
- Appointment-focused tests: 28 PASS.
- Unit/API/Worker: 27 files, 150 tests PASS.
- Prisma format/validate/generate: PASS.
- Empty database: all 16 migrations + E2E seed; Prisma drift: none.
- lint/format/serial typecheck, 8 E2E tests and Web/API/Worker production build: PASS.
- GitHub Actions: pending until push.
- Existing non-blocking Next.js ESLint plugin detection warning remains unchanged.
- External provider/calendar calls / real calls: 0.
