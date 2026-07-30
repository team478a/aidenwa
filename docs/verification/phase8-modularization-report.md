# Phase 8 modularization report

## Progress-document alignment

- Commit: `20d7259`.
- Updated the status header and historical checkpoint wording.
- No API, database or runtime changes.

## Import module

- Base commit: `20d7259`.
- API implementation commit: `9f085ae`.
- Worker implementation commit: `aa75fad`.
- Moved API transport parsing, state policy, service transitions, organization-scoped reads and
  transactional Outbox intent under `apps/api/src/modules/imports`.
- Moved the Worker engine under `apps/worker/src/jobs/imports` and retained a compatibility export.
- Added mapping, processing, retry and recovery job boundaries with queue-payload validation.
- Existing eight Import API URLs and all request/response/error contracts are unchanged.
- Database changes and migrations: none.
- External Provider/API/real telephone calls: 0.

## Shared DomainError and HTTP mapping

- Implementation commit: `08fbd72`.
- Added typed domain errors under `apps/api/src/core/errors`.
- Fastify now maps typed domain errors, validation failures, Prisma unique conflicts and unknown
  failures through one safe response boundary.
- Existing API error codes, statuses and response envelopes remain unchanged.
- Domain diagnostic details are intentionally excluded from public responses, and unknown error
  messages are replaced with the existing generic internal-error response.
- Database changes and migrations: none.
- Focused error-mapping/API-health tests: 11 PASS.
- lint / format check / workspace typechecks: PASS.
- Unit/API/Worker/Web configuration: 33 files, 184 tests PASS.
- E2E: 8/8 PASS.
- Web/API/Worker production build: PASS.
- GitHub Actions: run `30427689724` PASS for documentation commit `cabe43b`, including
  implementation commit `08fbd72`.
- External Provider/API/real telephone calls: 0.

## Appointment module

- API implementation commit: `4f068d5`.
- Worker implementation commit: `84907d0`.
- Moved the Stage 4E API under `modules/appointments` with separate Policy, Repository, pure State
  Machine and Slot Token boundaries.
- Split Worker maintenance into expiration, notification and cleanup jobs.
- Existing Appointment API URLs, payloads, responses and HTTP 409 behavior are unchanged.
- State/Event transactions, optimistic versions, organization scoping and Slot Token checks are
  unchanged.
- Database changes and migrations: none.
- GitHub Actions run `30506818792`: install, Prisma generate/format/validate, migration, seed,
  lint, format, typecheck, 34 files/186 tests, E2E 8/8 and all production builds PASS.
- External calendar/Provider/API/real telephone calls: 0.
- Remaining internal size reduction: extract the Route controller and Slot Finder from the
  compatibility-preserving Appointment module.

### Verification

- Focused Import API/Worker/boundary tests: 17 PASS.
- Prisma generate / format / validate: PASS.
- lint / format check / typecheck: PASS.
- Unit/API/Worker/Web configuration: 32 files, 174 tests PASS.
- E2E: 8/8 PASS.
- Web/API/Worker production build: PASS.
- GitHub Actions: run `30412329357` PASS for documentation commit `2e0d7c1`, including the API
  implementation commit `9f085ae` and Worker implementation commit `aa75fad`.

### Remaining Phase 8 work

- Appointment inner controller/Slot Finder extraction.
- Mock Call and Production Call domain splits.
- Worker bootstrap/registry split.
