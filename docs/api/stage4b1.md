# Stage 4B-1 Twilio Limited Calling API

Stage 4B-1 code is fail-closed and disabled by default. No real call may be placed until the environment, database approval, release commit, written approval and allowlist gates all pass.

## Limited authorization

- `GET|POST /api/v1/production-test-authorizations`
- `POST /api/v1/production-test-authorizations/:id/approve`
- `POST /api/v1/production-test-authorizations/:id/activate`
- `POST /api/v1/production-test-authorizations/:id/suspend`
- `POST /api/v1/production-test-authorizations/:id/cancel`
- `POST /api/v1/production-test-authorizations/:id/rollback`

Only `system_admin` can mutate these records. An authorization fixes the provider, release and written-approval commit, time window, up to five allowlist IDs, exactly five maximum calls, 120-second duration, budget and disabled recording/transcription/Media Streams/human transfer.

Activation is permitted only from `approved`, within its time window, with an unexpired Stage 4A Twilio approval, an allowed Provider configuration and no active emergency stop. Rollback disables Twilio production for the organization, suspends the authorization and queues cancellation/termination of outstanding calls.

## Manual single call

- `POST /api/v1/real-calls/manual`
- `GET /api/v1/real-calls`

The mutation reserves exactly one call. It has no automatic retry and no bulk endpoint. Worker re-evaluates all Stage 4A and Stage 4B-1 gates immediately before invoking the Provider.

## Source-number approval and incidents

- `GET|POST /api/v1/source-number-approvals`
- `POST /api/v1/source-number-approvals/:id/verify`
- `POST /api/v1/source-number-approvals/:id/revoke`
- `GET /api/v1/production-incidents`
- `POST /api/v1/production-incidents/:id/resolve`
- `POST /api/v1/real-calls/:id/resolve-provider-unknown`

The source number is accepted only during system-admin registration and is converted immediately to a keyed HMAC fingerprint and last four digits. The full value is not persisted, returned or audited. Activation and Worker dispatch require a verified, active, unexpired approval whose fingerprint matches the secret-managed `TWILIO_FROM_NUMBER`.

Invalid signatures, Provider-unknown creation, emergency cancellation failures, cost retrieval failures and currency mismatches create sanitized, organization-scoped incidents. Resolution requires a system administrator and a reason.

## Twilio callbacks

- `POST /api/v1/twilio/twiml/:executionId`
- `POST /api/v1/twilio/dtmf/:executionId`
- `POST /api/v1/twilio/status/:executionId`

All endpoints validate `X-Twilio-Signature` against the configured canonical external URL. Form parameters are validated without persisting `From`, `To` or the raw payload. Status events are append-only, deduplicated and applied through a monotonic state transition. DTMF maps only to Stage 4B-1 technical results. Digit `9` disables the allowlist entry transactionally.

## Disabled features

Recording, transcription, Media Streams, free-form AI, SMS, calendar, Zoom Phone and human transfer return or remain `NOT_SUPPORTED_IN_STAGE_4B1` and have no activation UI.
