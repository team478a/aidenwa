# Stage 4A API

All management endpoints require an authenticated session, CSRF protection for mutations, role authorization, organization scoping, Zod validation, and sanitized audit records.

## Readiness and approval

- `GET /api/v1/production-readiness`
- `GET|POST /api/v1/production-approvals`
- `PATCH /api/v1/production-approvals/:id`
- `POST /api/v1/production-approvals/:id/submit`
- `POST /api/v1/production-approvals/:id/approve|reject|suspend|resume`

Only `system_admin` may decide, suspend, resume, or release global safety controls. `admin` remains an organization administrator. `manager` has read-only readiness access and `sales` has no Stage 4A configuration access.

## Safety controls

- `GET|PUT /api/v1/production-policy`
- `GET|POST /api/v1/emergency-stops`
- `POST /api/v1/emergency-stops/:id/release`
- `GET|POST /api/v1/test-call-allowlist`
- `POST /api/v1/test-call-allowlist/:id/disable`
- `PUT /api/v1/provider-configurations`
- `POST /api/v1/production-gate/evaluate`
- `GET /api/v1/production-usage`

Provider configuration always persists `productionEnabled=false`. There is no activation endpoint.

## Mock webhook

`POST /api/v1/provider-webhooks/mock` accepts only HMAC-SHA256 signed mock events. The signature is calculated over `<x-mock-timestamp>.<JSON body>` using `MOCK_WEBHOOK_SECRET`. Timestamps outside five minutes are rejected. `(provider,eventId)` is unique, making retries idempotent. Unknown events are retained as sanitized normalized metadata; raw payload, telephone number, transcript, recording URL, cookie, authorization, and secret fields are not retained. Processing failures are queued in BullMQ with three exponential-backoff attempts. Worker redelivery is idempotent; `mock.fail_once` proves first-attempt failure and retry recovery without external communication.

## Production Call Gate reason codes

The gate returns `allowed=false` and one or more stable reason codes, including approval, expiry, product/campaign/region, time window, call and budget limits, retry interval, opt-out, phone/FAX, emergency stop, provider and limited-test allowlist failures. Each API rejection is persisted and audited without raw phone data.
