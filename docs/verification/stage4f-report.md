# Stage 4F Integration Stabilization Report

- Verification date: 2026-07-23 (Asia/Tokyo)
- Result: `LOCAL_STABILIZATION_COMPLETE_CI_PENDING`
- Scope: Stage 0 through Stage 4E integration only
- External provider calls / real telephone calls: 0
- GitHub Actions: not executed because no push or remote-CI authorization was given

## Checkpoint results

| Checkpoint             | Result                      | Evidence                                                                                                                                                                                  |
| ---------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Static verification | PASS                        | frozen install, Prisma format/validate/generate, lint, format, typecheck, Web/API/Worker build                                                                                            |
| 2. Empty database      | PASS                        | all 11 migrations and seed applied to an isolated database; `btree_gist`, `appointments_no_overlap`, 11 migration rows and zero Prisma drift verified; temporary database deleted         |
| 3. Unit/API/Worker     | PASS                        | 23 files, 97 tests                                                                                                                                                                        |
| 4. E2E                 | PASS                        | 8 tests, including Stage 4C–4E integration and 390×844 mobile checks                                                                                                                      |
| 5. Security/data       | PASS                        | 790 audit rows inspected by key-only query: 0 forbidden-key rows; 0 expired import jobs; external flags explicitly false                                                                  |
| 6. Failure/recovery/UI | PASS                        | concurrent appointment hold, optimistic locking, opt-out, emergency stop, timeout/provider failure and retry/idempotency coverage; mobile operational screens have no horizontal overflow |
| 7. CI                  | LOCAL PASS / REMOTE PENDING | workflow hardened with explicit false flags and Prisma checks; GitHub Actions not run                                                                                                     |

## Acceptance evidence

| Area                                                                  | Test or verification                                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Suspended sessions, login throttling, role and organization isolation | `Stage 1 authentication and authorization`                                                                     |
| FAX exclusion, ownership, duplicates, opt-out and CSV retention       | `Stage 2 sales data`, `expired import cleanup`, Stage 2 E2E                                                    |
| Mock campaigns and pre-dispatch safety recheck                        | `Stage 3 API boundaries`, Stage 3 E2E, `mock-call.test.ts`                                                     |
| Production gate, emergency stop and real-call denial                  | `Stage 4A API safety boundaries`, Stage 4A/4B E2E                                                              |
| Realtime protocol limits and Fake-only behavior                       | `packages/realtime` tests, Stage 4B API/Worker tests                                                           |
| Follow-up and handoff                                                 | `Stage 4D structured sales handoff`, `Stage 4C-4E creates a safe follow-up, handoff, and internal appointment` |
| Appointment conflict, hold, confirmation and opt-out                  | `Stage 4E internal appointment ledger`, `Stage 4E appointment worker`, Stage 4C–4E E2E                         |
| Smartphone usability                                                  | `Stage 4C-4E operational screens remain usable on a smartphone viewport`                                       |

## Corrections made

- Replaced unsafe string boolean coercion. The literal environment value `"false"` now remains false for every external integration flag.
- Added explicit Prisma mappings for PostgreSQL-truncated index names and `zoom_phone_events.normalized_result`; empty-DB schema drift is now zero.
- Made import-cleanup verification independent of unrelated expired rows already present in a development database.
- Added retry-idempotency coverage for appointment hold expiry.
- Added Stage 4C–4E integration and mobile E2E coverage.
- Increased Playwright assertion timeout from 5 to 15 seconds to absorb development-server compilation without weakening assertions.
- Hardened CI with explicit mock/false integration flags and Prisma format/validate steps.

## Security and external-action audit

- `.env.example` and CI use `VOICE_PROVIDER=mock`; every production, realtime, Twilio Media Streams, Zoom Phone, handoff and calendar flag is false.
- Audit `before_data`/`after_data` contained no password, password hash, Cookie, CSRF, session token, API key, auth token or CSV raw/normalized key in 790 inspected rows.
- Secret-pattern matches were limited to provider validation code and Fake/test fixtures; no credential was copied into this report.
- Application tests used Fake/Mock/Disabled providers. No real call, provider login, calendar event, invitation, recording, transcription or paid API request was made.

## Warnings and remaining items

- Next.js reports that its ESLint plugin is not detected by the shared flat ESLint configuration. Repository ESLint itself passes with zero findings and the production build succeeds; this is classified as a non-blocking configuration warning.

Resolution (2026-08-01): the matching Next.js plugin and Core Web Vitals rules now run in the
required repository lint gate. Duplicate build-time linting is disabled, and production builds no
longer emit this warning.

- Prisma reports that a newer major version is available. No major dependency upgrade was attempted during stabilization.
- GitHub Actions, deployment, production migration and external-provider verification remain pending and require separate authorization and credentials.
- Existing repository files have no commit/`HEAD`; no commit, push or pull request was created.

## Gate to the next release action

Remote CI must run successfully against the exact reviewed commit. Production or provider activation additionally requires the existing written approval, release-commit binding, credentials, allowlists, emergency-stop readiness and bounded test authorization. Until then all external flags remain false.
