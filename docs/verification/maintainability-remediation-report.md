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
- Unit/API/Worker: 25 files, 104 tests: PASS
- Existing E2E: 8 tests: PASS
- Web/API/Worker production build: PASS
- GitHub Actions: run `30034990609` PASS for commit `69796b4`

Open Phase 2 performance acceptance:

- Mapping/duplicate preview preparation still runs in the API process.
- A 10,000-row non-blocking and bounded-memory verification has not yet been added.
- Phase 2 must not be marked complete, and Phase 3 must not start, until these are addressed.
