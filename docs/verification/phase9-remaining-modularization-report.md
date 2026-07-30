# Phase 9 remaining modularization verification

## Baseline

- Base commit: `c123eab`.
- Phase 8 final GitHub Actions run: `30534884941` PASS.
- Unit/API/Worker/Web configuration: 188 tests PASS.
- E2E: 8/8 PASS.
- Web/API/Worker production build: PASS.
- Database schema changes: none.
- External Provider/API/real telephone calls: 0.
- External feature flags: disabled.

## Current step

- Phase 9 Step 1: Mock Call main-process formal relocation — COMPLETE.
- Implementation commit: `6a7f492`.
- GitHub Actions: run `30545217383` PASS.
- Verification:
  - Prisma generate / format / validate: PASS.
  - All migrations from the CI database and seed: PASS.
  - lint / format / typecheck: PASS.
  - Unit/API/Worker/Web configuration: 36 files, 190 tests PASS.
  - E2E: 8/8 PASS.
  - Web/API/Worker production build: PASS.
- Compatibility:
  - Existing `mock-call.ts` imports remain valid through compatibility exports.
  - Organization scope, emergency-stop, campaign, schedule, FAX, opt-out, idempotency,
    transaction and Usage Ledger behavior are unchanged.
  - Database schema and migrations are unchanged.
- Safety:
  - Default and injected execution contract remains Mock-only.
  - A boundary test prohibits Twilio/production Provider references from Mock Call execution.
  - External Provider/API/real telephone calls: 0.
- Stage 2 sales-data domain modularization: IN PROGRESS.
  - Companies implementation commit: `d7ffa55`.
  - Companies CI run: `30546678256` PASS.
  - Contacts implementation commit: `468449e`.
  - Contacts CI run: `30554930335` PASS.
  - Unit/API/Worker/Web configuration: 38 files, 193 tests PASS.
  - E2E: 8/8 PASS.
  - `stage2-routes.ts`: 857 to 589 lines.
  - Manager organization scope and sales owner scope have focused Policy coverage.
  - API paths, request/response contracts, database schema and Import module were unchanged.
  - Remaining domains: Phone Numbers, Tags, Sales Lists and OptOuts.
- Next target: Phone Numbers domain modularization.
