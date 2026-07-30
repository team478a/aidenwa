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
  - Phone Numbers implementation commit: `1266ceb`.
  - Phone Numbers CI run: `30587455268` PASS.
  - Tags implementation commit: `3b540ba`.
  - Tags CI run: `30588837534` PASS.
  - Sales Lists and OptOuts implementation commit: `1b00440`.
  - Import Role compatibility correction: `e239188`.
  - Final Stage 2 CI run: `30590755086` PASS.
  - Unit/API/Worker/Web configuration: 42 files, 199 tests PASS.
  - E2E: 8/8 PASS.
  - `stage2-routes.ts`: 857 to 71 lines; registration/composition only.
  - Manager organization scope and sales owner scope have focused Policy coverage.
  - API paths, request/response contracts, database schema and Import module were unchanged.
  - Phone audits contain masked numbers only; full raw/normalized numbers are excluded.
  - Sales Lists preserve bulk limits, scoped preview and idempotent membership.
  - OptOuts preserve Company/Phone/Contact/Channel scope and admin-only reasoned release.
  - OptOut audit projections exclude raw phone/email snapshots.
  - Remaining Stage 2 domains: none.
- Stage 2 sales-data modularization: COMPLETE.
- Next target: Stage 3 settings/campaign domain modularization; not started.
