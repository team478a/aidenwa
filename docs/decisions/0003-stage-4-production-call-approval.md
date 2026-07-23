# Stage 4 Production Call Approval

- Status: Pending approval
- Owner: TBD
- Approver: TBD
- Approval date: TBD
- Review expiry: TBD

## Purpose

This record is the release gate for any connection to a real voice provider or any call to a real telephone number. Completing technical implementation alone does not satisfy this gate. Every item below must have an accountable owner, supporting evidence, and explicit approval.

Until this record is approved, the system must remain mock-only. Automated tests must never place real calls.

## Approval scope

- Target countries/regions: TBD
- Calling organization and legal entity: TBD
- Business purpose: TBD
- Target audience and lawful source of contact data: TBD
- Approved campaign period: TBD
- Permitted local calling hours and holiday rules: TBD
- Maximum test calls: TBD
- Maximum daily calls and cost: TBD
- Approved source and destination numbers: TBD
- Voice provider and service region: TBD

## Required decisions and evidence

| Gate                                    | Decision/evidence                                                                              | Owner | Status  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | ----- | ------- |
| Applicable law and provider terms       | Legal review covering each target country/region and provider terms                            | TBD   | Pending |
| AI disclosure                           | Exact disclosure wording and when it is played                                                 | TBD   | Pending |
| Recording and transcription             | Consent method, notice text, permitted purpose, access, retention, deletion                    | TBD   | Pending |
| Do-not-call and opt-out                 | Responsible operator, suppression sources, immediate-stop behavior, appeal/release procedure   | TBD   | Pending |
| Number ownership                        | Evidence that each originating number is owned or authorized and caller ID is not misleading   | TBD   | Pending |
| Personal data and cross-border transfer | Data map, subprocessors, regions, transfer basis, retention and deletion                       | TBD   | Pending |
| Human handoff                           | Conditions, staffed hours, failure behavior, and emergency contacts                            | TBD   | Pending |
| Emergency stop                          | Named operator, kill-switch procedure, verification drill and recovery authorization           | TBD   | Pending |
| Limits and billing                      | Per-campaign/day concurrency, retry and cost limits with alerts                                | TBD   | Pending |
| Limited production test                 | Named recipients who consented, test window, rollback criteria and success criteria            | TBD   | Pending |
| Security review                         | Secret storage, webhook authentication, replay protection, log redaction and incident response | TBD   | Pending |
| CI evidence                             | Successful GitHub Actions run for the exact release commit                                     | TBD   | Pending |

## Mandatory technical controls before approval

- The mock provider remains the default in every environment.
- Production activation requires an explicit environment allowlist and cannot be enabled by fixture or request input.
- Real destinations are restricted to an approved allowlist during the limited test.
- A global kill switch and campaign-level stop prevent new dispatch immediately.
- Provider webhooks are authenticated, replay-protected, idempotent, organization-scoped, and audit-logged.
- Logs and audit records redact telephone numbers, credentials, cookies, sessions, webhook secrets, recordings, and transcript-sensitive data.
- Retry, concurrency, daily-call, time-window, opt-out, FAX, invalid-number, and ownership checks run immediately before dispatch.
- Recording and transcript retention jobs are tested, including abnormal termination and deletion failures.
- Production tests are isolated from ordinary automated test commands.

## Stage 4A technical evidence

- Stage 4A technical readiness and local completion audit: completed on 2026-07-19
- Mock-only provider and fail-closed production stub: implemented and tested
- Production Call Gate, organization/system emergency stop, call/budget counters and limited-test allowlist: implemented
- Mock webhook signature, timestamp, replay/deduplication and sanitized persistence: implemented and tested
- Readiness UI: implemented without a real-call activation control
- Local CI-equivalent verification: completed; see `IMPLEMENTATION_STATUS.md`
- GitHub Actions for the release commit: not run (no push or pull request)
- Written approval: still pending

The explicit authorization below remains `NOT APPROVED`. Stage 4A technical completion does not permit Stage 4B, real-provider connectivity, recording, transcription, or real-number calling.

## Explicit authorization

The approver must replace the following statement only after every gate is complete:

> NOT APPROVED — real provider connections and calls to real telephone numbers are prohibited.

Approved statement format:

> I authorize the limited production-call scope described in this record. I have reviewed the cited legal, privacy, security, operational, and cost evidence. Approval applies only to the named provider, numbers, countries, period, and limits. Any scope change requires a new approval.

- Approver name/signature: TBD
- Role and authority: TBD
- Approved release commit: TBD
- Approval timestamp (JST): TBD

## Stage 4B-1 technical evidence

- Fake Twilio transport/server: implemented without outbound network access
- Fixed TwiML, one no-input retry, DTMF 1/2/9 and signed callbacks: locally tested
- Out-of-order and duplicate callbacks, terminal-state monotonicity and sanitized persistence: locally tested
- Single-destination retry prevention, one concurrent call, five/hour, five/day, 120-second and budget controls: implemented
- Emergency cancellation/termination and rollback: tested against Fake Twilio
- Local unit/API/Worker/E2E and production build: passed; see `IMPLEMENTATION_STATUS.md`
- GitHub Actions for the release commit: not run
- Written approval and real Twilio/number verification: pending
- Real calls placed: 0

This evidence does not change the `NOT APPROVED` statement.

## Implementation start rule

Stage 4 provider implementation may begin only after a separate Stage 4 implementation instruction defines the provider, architecture, acceptance tests, and rollback behavior. Real-provider activation and limited calling additionally require this record to be approved. Stage 3 mock behavior must remain available and must not be weakened.
