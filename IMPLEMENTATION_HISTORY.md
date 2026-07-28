# Implementation History

## 2026-07-19 — Stage 4B-1 code implementation (tests deferred)

- Corrected README stage status before beginning Stage 4B-1.
- Added Twilio SDK 6.0.2, limited-test authorization and real-call execution models/migration.
- Implemented fail-closed Twilio Provider, fixed Japanese TwiML/DTMF, signed callbacks, monotonic status handling, manual single-call reservation and Worker dispatch.
- Added release-commit, environment, DB provider, Stage 4A Gate, allowlist, five-call, duration, budget and safety-feature checks.
- Connected emergency stops to queued/ringing cancellation and in-progress termination requests.
- Added fail-closed authorization transitions, activation-time Stage 4A approval/provider/emergency-stop checks, configurable estimated cost and an organization-scoped rollback endpoint.
- Added a limited-test management UI and Stage 4B-1 API/rollback documentation.
- Tests and Fake Twilio Server implementation were explicitly deferred. No Twilio credentials were configured and no external or real call was made.

## 2026-07-19 — Stage 4B-1 Fake Twilio verification

- Added a network-free `FakeTwilioServer` transport and exact Twilio Calls request assertions.
- Added signed TwiML/status/DTMF API tests covering invalid signatures, no-input retry, callback deduplication, out-of-order terminal states, cost settlement, sanitized persistence and DTMF 9 allowlist shutdown.
- Added Worker emergency-stop tests for queued/ringing cancellation and in-progress termination without redialing.
- Added same-destination, concurrency, hourly/daily and reserved-budget checks plus 80/90/100 percent budget threshold handling.
- Added Stage 4B-1 E2E fail-closed UI coverage and operational guidance for secrets, number verification, manual testing, incidents and costs.
- Ran local CI-equivalent verification without Twilio credentials, outbound Provider traffic or real telephone calls.

## 2026-07-19 — Stage 4B-1 local safety hardening

- Added system-admin-only, reason-required resolution for `provider_unknown`; confirmed absence closes the execution without scheduling any redial, while incident resolution remains held for review.
- Propagated system/organization/campaign/product/provider emergency-stop scope to the Twilio Worker and added Provider status confirmation.
- Added rollback `requested` to `completed/failed` settlement and exposed rollback state in the limited-test UI.
- Serialized manual reservations with a PostgreSQL organization advisory lock and Serializable transaction.
- Added normalized webhook content fingerprints and automatic authorization expiry, reserved-job cancellation, Provider disablement and sanitized audit evidence.
- Added Fake tests for unknown resolution, campaign-scoped cancellation, rollback confirmation and authorization expiry.

## 2026-07-19 — Stage 4B-1 local operations

- Added source-number ownership approval using only a keyed HMAC fingerprint, last four digits, evidence reference and expiry; no full originating number is persisted or returned.
- Required an active, verified and unexpired source-number approval at activation and immediately before Worker dispatch.
- Added organization-scoped production incidents with system-admin reason-required resolution.
- Created incidents for invalid webhook signatures, Provider-unknown outcomes, emergency cancellation failures, cost settlement failures and currency mismatches.
- Added bounded Fake Provider cost reconciliation with separate pending/retry/settled/failed states and conservative reservation retention.
- Added source-number and incident operations to the Stage 4B-1 UI and API documentation.

## 2026-07-19 — Stage 4A production call readiness

- Added the `system_admin` role without allowing organization administrators to grant or modify it.
- Added the Stage 4A migration and models for approval, policy, emergency stop, provider configuration, limited-test allowlist, sanitized webhook events, usage/budget counters and gate decisions.
- Implemented approval transitions, Production Call Gate reason codes, scoped emergency stops, mock usage/cost accounting, readiness and management APIs.
- Extended `VoiceProvider` and added `ProductionVoiceProviderStub`, which has no network client and rejects every production operation.
- Added signed Mock Webhook timestamp/replay/deduplication handling and removed sensitive payload fields before persistence and audit.
- Added Worker emergency-stop re-evaluation before mock dispatch and deterministic usage counters after mock completion.
- Added the Stage 4A readiness/safety UI without any real-provider activation control.
- Added Unit/API/Worker and E2E coverage for time windows, role denial, webhook safety, provider fail-closed behavior, Worker stop and system-admin recovery.
- Added API, readiness, emergency-stop and rollback documentation; written approval remains pending.
- No external provider, real telephone call, recording, transcription, external LLM, SMS, calendar or paid API was connected or used.
- Added dedicated approval-management and production-operations pages for approval transitions, provider status, usage/budget counters and Gate rejections.
- Added BullMQ webhook failure retry with exponential backoff and idempotent Worker redelivery handling.
- Extended the Stage 3/4A E2E flow to prove incomplete approval rejection, complete submission, `system_admin` approval, policy/allowlist/provider setup and an allowed Production Call Gate decision.
- Reverified 41 Unit/API/Worker tests, all 5 E2E tests, all five migrations on an empty temporary database, and Web/API/Worker production builds.

## 2026-07-18 — Stage 4 gate preparation

- Added `docs/decisions/0003-stage-4-production-call-approval.md` as the pending written-approval record for legal, privacy, security, operational, billing, emergency-stop, and limited-call decisions.
- Documented that Stage 4 provider implementation needs a separate implementation instruction and that real-provider activation remains prohibited until explicit approval.
- No external provider, real telephone number, recording, transcription, external LLM, or paid API was connected or used.

## 2026-07-18 — Stage 3

- Added Stage 3 models and migration `20260718125908_stage_3_mock_campaigns` for versioned products, AI agents, scenarios, manual knowledge, campaigns, targets, call jobs, attempts and events.
- Implemented immutable published versions, deterministic graph validation/simulation and published-valid knowledge search.
- Implemented target materialization with reasoned FAX, invalid, non-callable, missing-number and opt-out exclusions plus pre-dispatch rechecks.
- Added explicit campaign validation, approval, start, pause, resume and cancel transitions.
- Replaced the prior generic voice mock with an idempotent masked-number-only `MockVoiceProvider`; no external provider or network call was added.
- Added BullMQ mock-call processing, attempt/event idempotency, stuck reservation recovery, schedule/limit checks and qualified/opt-out/invalid-number outcome application.
- Added Stage 3 API/UI, role and organization boundaries, summarized audit records, service/API/Worker tests and a full mock campaign E2E.
- Verified 34 Unit/API/Worker tests, 4 E2E tests, an empty-database four-migration deploy, and Web/API/Worker production builds; CI now includes the production build.
- No real call, recording, external LLM, voice vendor, calendar, or paid API was used.

## 2026-07-18 — Stage 2 completion audit

- Added explicit duplicate-reason coverage for corporate number, normalized phone and domain matches, organization scoping and non-merge behavior.
- Added contact-scoped opt-out matching and regression coverage for contact/channel isolation.
- Extracted expired-import cleanup into a testable Worker service and changed it to delete expired jobs left in `processing` after abnormal termination; cascading rows are verified deleted while unexpired jobs remain.
- Extended audit sanitization and tests to exclude CSV raw/normalized rows and file-content fields in addition to password, Cookie, session and CSRF secrets.
- Expanded Stage 2 E2E to cover the complete requested admin workflow, duplicate reason, opt-out check/release, import retry protection and audit logs.
- Stabilized the existing Stage 1 E2E logout action for CI viewport behavior.
- Verified 27 unit/API tests, 3 E2E tests, all migrations from an empty database, Prisma generation, static checks and Web/API/Worker production builds.

## 2026-07-18 — Stage 2

- Added tenant-scoped company, contact, phone, tag, sales-list, opt-out and import models plus migration `20260718102444_stage_2_sales_data`.
- Added normalized search fields, duplicate candidate detection, FAX call blocking and ownership-aware role enforcement.
- Added UTF-8/CP932 CSV upload, mapping, preview, row validation, duplicate policies and an idempotent BullMQ import worker with retention cleanup.
- Added opt-out checks and administrator-only release with reason and audit trail.
- Added Stage 2 management pages and regression/E2E coverage.
- Did not implement Stage 3+, place telephone calls, or connect to paid/external APIs.

## 2026-07-18 — Stage 1

- Added organization, team, user, session and audit-log models and migration `20260718010000_stage_1_identity`.
- Added environment-driven, idempotent development seed.
- Selected scrypt password hashing and opaque, database-backed HttpOnly cookie sessions.
- Added CSRF validation, origin checking, Redis login throttling, session rotation and revocation.
- Added API-side role authorization, tenant-scoped queries and secret-sanitized audit records.
- Added the Stage 1 management UI and Playwright admin workflow.
- Retained Stage 0 health checks and mock-only voice provider; no telephone or paid API was used.
- Added explicit regression coverage for manager team-operation denial, cross-organization team assignment denial, and removal of password, Cookie, session, and CSRF fields from audit before/after data.

Verification results are recorded in `IMPLEMENTATION_STATUS.md` after the final run.

## 2026-07-19 — Stage 4B-2 Fake realtime foundation

- Added realtime session/event and human follow-up task models with the Stage 4B-2 migration.
- Added validated, disabled-by-default OpenAI Realtime, Twilio Media Streams and Zoom Phone environment controls without storing an API key.
- Added a deterministic Fake realtime provider, normalized Twilio media events, size and monotonic-sequence guards, WSS-only gated Stream TwiML, barge-in cancellation and strict tool arguments.
- Added organization-scoped Fake simulation, sanitized event persistence, opt-out/qualified result handling and masked Zoom Phone follow-up task APIs.
- Added the mobile-friendly realtime conversation and human follow-up status page.
- Added five focused realtime boundary tests and verified Prisma, lint, typecheck and production build without any external provider call.

## 2026-07-19 — Stage 4B-2 realtime connection completion code

- Added a disabled-by-default Twilio Media Streams WebSocket endpoint with signature, feature-flag, production Gate, organization, execution, concurrency and single-use session checks.
- Added short-lived signed Custom Parameter tokens and separated WSS-only realtime TwiML from the Stage 4B-1 fixed DTMF flow.
- Completed the OpenAI Realtime WebSocket protocol adapter with PCMU session configuration, normalized events, response cancellation, assistant truncation, tool results, timeouts and sanitized failures.
- Added a bounded PCMU bridge implementing media/mark/clear playback tracking, barge-in, old-generation rejection, stream/track/sequence validation and transient audio zeroing.
- Added stale realtime session recovery, bounded event cleanup and expanded audit sanitization and mutation audit records.
- Added Fake Transport tests; no feature flag was enabled and no OpenAI, Twilio, Zoom Phone or real telephone connection was made.
- Verified Prisma format/validate/generate, lint, typecheck, 14 realtime tests, 12 Stage 4B-1 API/Worker regressions, and Web/API/Worker production builds.
- Left all E2E, the full unit suite, empty-database migration replay, GitHub CI and every real-provider test explicitly unexecuted for the later audit.

## 2026-07-20 — Stage 4C Zoom Phone sales follow-up

- Added migration `20260720010000_stage_4c_zoom_followup` extending follow-up tasks with controlled workflow, timing, outcome, next-action, Zoom fingerprint and optimistic-lock fields.
- Added idempotent follow-up attempts, assignment rules, in-app notifications and sanitized Zoom event records.
- Implemented manual and locked Fake auto-assignment, accept/start/snooze/reopen/attempt/complete flows, opt-out and call-safety rechecks, and KPI aggregation.
- Added `HumanCallingProvider` with deterministic Fake, disabled and external Zoom adapters; the external adapter uses memory-only Server-to-Server OAuth tokens, official-host allowlisting, bounded 429 retry and normalized Call History data.
- Added timestamped Zoom webhook verification, replay-window rejection, deduplication, URL validation and sanitized metadata persistence without raw payload retention.
- Reworked the mobile follow-up page with prioritized tabs, masked destinations, large one-handed actions and management KPI visibility.
- Corrected stale Stage 4B-2 status statements and retained all external Feature Flags as false.
- Verified Prisma format/validate/generate, lint, typecheck, 10 provider tests, 27 selected tests and Web/API/Worker production builds without external network calls.
- Could not apply the migration or run DB-backed Stage 4C API/Worker tests because Docker Desktop was not running; full Unit/E2E/empty-DB/CI and all real-provider tests remain unexecuted.

## 2026-07-20 — Stage 4D AI conversation evaluation and sales handoff

- Started Docker Desktop, applied the pending Stage 4C migration to the development database, and applied new migration `20260720030000_stage_4d_sales_handoff`.
- Added organization-scoped sales handoff cards, append-only feedback, versioned handoff settings, retention metadata and cleanup.
- Added the strict `finalize_sales_handoff` Realtime function schema, server-side Zod validation, sensitive-summary rejection, deterministic score rules and reason codes.
- Added idempotent card finalization, opt-out-first cancellation, FAX exclusion, low-confidence manual review and Stage 4C follow-up creation without external actions.
- Added card/feedback/manual-review/quality/settings/Fake simulation APIs and a mobile sales handoff page.
- Fixed the Stage 4C PostgreSQL advisory lock call from `$queryRaw` to `$executeRaw` after the first DB regression exposed a void-column deserialization failure.
- Added seven Stage 4D DB tests and verified 32 selected Stage 4B–4D tests, lint, typecheck and Web/API/Worker builds.
- Kept `AI_HANDOFF_ENABLED` and all existing external provider flags false; no OpenAI, Twilio, Zoom Phone or real telephone connection was used.
- Formatted four pre-existing files detected by repository-wide Prettier check; the final format check passed.
- Did not run the full Unit/E2E suite, empty-database migration replay or GitHub CI.

## 2026-07-20 — Stage 4E internal appointment and calendar foundation

- Completed the missing Stage 4D administrator conversation-quality and handoff-setting screen.
- Added migration `20260720050000_stage_4e_appointments` with policy, availability, exception, appointment and append-only event tables plus Stage 4C/4D appointment references.
- Added a PostgreSQL exclusion constraint for buffer-aware held/confirmed overlap prevention; corrected the new migration from `tstzrange` to `tsrange` after the first transactional apply was rolled back by PostgreSQL.
- Added signed short-lived slot tokens, deterministic timezone-aware availability search, idempotent holds, explicit-confirmation booking, optimistic transitions, rescheduling and opt-out/emergency-stop rejection.
- Added Internal, Fake and fail-closed Disabled calendar providers without any Google, Microsoft or Zoom HTTP adapter.
- Added appointment policy, availability, slot, hold, transition, dashboard and detail APIs with organization/role/CSRF boundaries; ordinary appointment access excludes system administrators.
- Added hold-expiry/upcoming-notification/event-retention Worker maintenance and mobile appointment/policy screens.
- Added strict Realtime appointment function schemas while keeping both calendar and AI booking feature flags false.
- Added Stage 4E DB and Worker tests and verified 29 selected Stage 4D/4E regressions, Prisma, typecheck, formatting and Web/API/Worker builds without external communication.
- Left full Unit/E2E, empty-database migration replay, GitHub Actions, real calendar synchronization and invitation delivery for the integration-stabilization stage.

## 2026-07-23 — Stage 4F integration stabilization

- Replayed all 11 migrations and the development seed on an isolated empty database, verified `btree_gist`, the appointment exclusion constraint, the existing database upgrade state and zero Prisma schema drift, then deleted the temporary database.
- Added explicit Prisma mappings for PostgreSQL-truncated index names and `zoom_phone_events.normalized_result`.
- Corrected environment boolean parsing so the string `false` cannot enable production calls, realtime AI, Twilio Media Streams, Zoom Phone, AI handoff or calendar features; added regression coverage.
- Made the expired-import cleanup test independent of unrelated development data and added appointment-expiry retry-idempotency coverage.
- Added Stage 4C–4E E2E coverage for Fake handoff, follow-up, internal appointment booking and four smartphone operational screens.
- Hardened the GitHub Actions workflow with explicit mock/false integration flags and Prisma format/validate checks.
- Verified Prisma format/validate/generate, lint, formatting, typecheck, 97 Unit/API/Worker tests, 8 E2E tests and all production builds.
- Inspected 790 audit rows by forbidden-key query with zero matches and confirmed zero expired import jobs; no real telephone or external provider action occurred.
- Recorded the local release state as `LOCAL_STABILIZATION_COMPLETE_CI_PENDING`; GitHub Actions, deployment and real-provider verification were not run.

## 2026-07-24 — Maintainability remediation Phase 1

- Added migration `20260724010000_phase1_transactional_outbox` and the `outbox_events` durable delivery table without modifying prior migrations.
- Moved company-import, mock-call, Twilio limited-call, emergency-stop and authorization-rollback scheduling into the same PostgreSQL transaction as their business-state changes.
- Replaced timestamp-based rollback job IDs with deterministic aggregate-based BullMQ job IDs.
- Added a Worker Outbox Publisher with Zod payload validation, bounded claims, exponential backoff, eight-attempt failure, stale-lock recovery and restart-safe at-least-once publication.
- Added startup/hourly repair for queued imports, queued mock calls, reserved real-call executions, requested rollbacks and queued campaign targets without a call job.
- Added DB tests for transaction rollback, Queue failure/redelivery, duplicate-safe job IDs, Worker restart and all specified legacy-gap categories.
- Added Outbox architecture decision, recovery runbook and maintainability remediation report.
- Verified all 12 migrations and seed on an empty database with zero Prisma drift, 101 Unit/API/Worker tests, 8 E2E tests, static checks and all production builds.
- GitHub Actions run `30030010473` passed every required CI step for implementation commit `d5371a2`.
- Kept all external integration flags false and made zero real telephone or external Provider calls.

## 2026-07-24 — Maintainability remediation Phase 2

- Added migration `20260724020000_phase2_atomic_import_rows` with explicit row processing state,
  attempts, sanitized error fields and a recovery index.
- Extracted company import execution from the Worker bootstrap into a bounded batch processor.
- Made duplicate recheck, company/phone/contact mutation, ImportRow success and row audit a single
  transaction.
- Added per-row failure isolation and cancellation checks so one failed row does not stop later
  rows.
- Added a failed-row-only retry API that preserves successful rows and schedules a fresh
  transactional Outbox event.
- Added focused DB tests for rollback after company creation, failed-row retry without successful
  row duplication, and mixed success/failure completion.
- Added the import recovery runbook. Phase 3 and later were not changed.
- GitHub Actions run `30034990609` passed all required checks for commit `69796b4`.
- Kept all external integration flags false and made zero real telephone or external Provider calls.
- Moved mapping, formula neutralization and duplicate preview preparation from the API request to a
  `company-import-mapping` Outbox/Worker job.
- Added bounded 200-row mapping pages and one bulk duplicate lookup per page.
- Updated the import UI to poll for `preview_ready` before exposing execution.
- Added a 10,000-row API test proving immediate queueing without row mutation, plus Worker coverage
  for formula injection and reason-bearing duplicate candidates.
- Increased only the Stage 2 end-to-end scenario timeout to cover the added asynchronous boundary;
  all eight E2E scenarios pass.
- Removed a fixed-clock dependency from the Outbox redelivery test, verified it five consecutive
  times, and passed GitHub Actions run `30063711663` on commit `2080a39`.

## 2026-07-24 — Maintainability remediation Phase 3

- Added a pure Mock call stop-state mapping and atomic CallJob/CampaignTarget updates.
- Fixed emergency-stop and campaign-stop paths that previously left queued targets unchanged.
- Added explicit permanent exclusion and temporary provider retry transitions.
- Added migration `20260724030000_phase3_usage_ledger` with unique execution accounting.
- Moved Mock usage recording into the call outcome transaction and made counters rebuildable from
  the ledger.
- Added state-machine, stop consistency, provider failure, duplicate-accounting and counter-rebuild
  tests.
- Added Mock state architecture and usage recovery documentation.
- Kept the Mock provider active and made zero real telephone or external Provider calls.
- Committed the Phase 3 implementation as `ac2398c`; GitHub Actions run `30068669227` passed.

## 2026-07-24 — Maintainability remediation Phase 4

- Added shared production fail-fast checks to the existing API and Worker environment schemas.
- Required core production endpoints and secrets while preserving development/test defaults.
- Rejected local endpoints, repository placeholders, short secrets and an uncommitted release
  identifier without exposing their values in validation messages.
- Added conditional Twilio, OpenAI Realtime and Zoom production requirements.
- Removed the Worker's independent development database fallback.
- Added 18 environment validation tests and the production environment operations guide.
- Kept every external integration disabled and made zero real telephone or external Provider calls.
- Committed the Phase 4 implementation as `f14d7fe`; GitHub Actions run `30084030037` passed.

## 2026-07-24 — Maintainability remediation Phase 5

- Added an explicit appointment state machine with start-time and cancellation-deadline guards.
- Added the `reschedule_requested` intermediate state and a request-reschedule API route.
- Moved appointment version/state updates into the same transaction as AppointmentEvent,
  notification and applicable sales handoff/follow-up updates.
- Strictly validated signed slot JSON with Zod and rechecked policy, availability, duration, notice
  and advance constraints during hold/reschedule.
- Added service-level organization checks for every appointment creation reference.
- Added Appointment/AppointmentEvent Prisma relations, foreign keys, state/period checks and
  reschedule overlap protection in two migrations.
- Added state, rollback, concurrency, invalid token, effective period, deadline, cross-tenant and
  HTTP 409 tests.
- Added the appointment state-machine architecture document.
- Kept the internal/Fake calendar path active and made zero external calendar or telephone calls.
- Committed the Phase 5 implementation as `4a9714a`; GitHub Actions run `30089496742` passed.

## 2026-07-28 — Maintainability remediation Phase 6

- Changed Twilio callback intake to verify signatures before Zod validation and to reject invalid
  price/currency values without persisting webhook events.
- Added transactional ProviderWebhookEvent/Outbox receipt with a dedicated BullMQ job, three
  attempts and exponential backoff.
- Added an atomic webhook processor for Call SID association, monotonic sequence/state changes,
  final cost, budget audit/suspension and event completion.
- Added retry metadata, terminal failure handling and a unique sanitized production incident for
  retry exhaustion.
- Added migration `20260728010000_phase6_webhook_reliability`.
- Added regression tests for invalid signatures and prices, duplicate/out-of-order delivery,
  rollback then successful redelivery, and retry-exhaustion incident deduplication.
- Verified Prisma format/validate/generate and migration deploy, static checks, 153
  Unit/API/Worker tests, 8 E2E tests and all production builds.
- Committed the Phase 6 implementation as `7df092e`; GitHub Actions run `30343446120` passed.
- Kept all external integrations disabled and made zero real telephone or external Provider calls.

## 2026-07-28 — Maintainability remediation Phase 7

- Replaced Worker health, Outbox and hourly cleanup `setInterval` callbacks with 12 stable BullMQ
  Job Schedulers.
- Added per-task attempts, exponential backoff, execution timeouts, retained completion/failure
  history and Redis execution locks.
- Added scheduled usage-counter rebuilding from the immutable UsageLedger.
- Added sanitized retry/exhaustion logging and deduplicated production incidents, including a safe
  operational alert fallback when PostgreSQL cannot store an incident.
- Made signal shutdown guarded and ordered across Worker, Queue, health state, Prisma and Redis.
- Added tests for complete scheduler policy coverage, idempotent registration after Redis
  reconnect, retained retry failures and one incident at exhaustion.
- Added the Worker maintenance recovery and failure-inspection runbook.
- Verified static checks, 156 Unit/API/Worker tests, 8 E2E tests and all production builds.
- Committed the Phase 7 implementation as `79ec2be`; GitHub Actions run `30347090048` passed.
- Kept all external integrations disabled and made zero real telephone or external Provider calls.
