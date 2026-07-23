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
- GitHub Actions: pending until this Phase 1 change is pushed

### Remaining phases

CSV row atomicity, call/target state machines, usage ledger, production environment fail-fast, appointment state machine, webhook retry, scheduled maintenance migration, and incremental module splitting remain explicitly out of scope for Phase 1.
