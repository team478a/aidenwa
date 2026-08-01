# Production data flow (Mock-only Gate A)

## User request

1. The browser reaches the WAF/ALB over HTTPS.
2. Web serves the UI and forwards same-origin `/backend/*` traffic to the private API.
3. API authenticates the revocable server-side session, validates CSRF and applies organization,
   role and ownership policies.
4. API stores business state and immutable Audit/Outbox intent in PostgreSQL.
5. Raw credentials, Cookies, tokens, full phone numbers, raw CSV and Provider messages are not
   emitted to logs or audit payloads.

## Background processing

1. Worker reads Outbox rows from PostgreSQL and publishes deterministic jobs to Valkey/BullMQ.
2. Worker consumes jobs and writes idempotent outcomes to PostgreSQL.
3. Mock call execution resolves only `MockVoiceProvider`; no external network client is reachable.
4. Worker heartbeat is written to Valkey and exposed through API `/health/worker`.

## Imports and evidence

- Approved import objects use a dedicated encrypted S3 prefix, short retention and least-privilege
  task access. Raw import data is never copied to CloudWatch or release evidence.
- Backup and release evidence use separate encrypted, versioned prefixes with retention and access
  policies owned by the Database/Security owners.
- Database timestamps remain UTC; UI displays Asia/Tokyo.

## Observability

- ALB/WAF, Web, API and Worker emit sanitized logs to separate CloudWatch Log Groups.
- A generated Correlation ID is propagated from edge/API through job metadata; it must contain no
  customer data.
- Metrics and alarms reference stable event names and aggregate counts, never payload bodies.

## Prohibited Gate A flows

There is no audio, recording, transcript, SMS, real call, Twilio REST/webhook, OpenAI Realtime,
Zoom Phone or calendar flow. Provider credentials are absent and every related feature flag is
false. Any observed external Provider request is P1 and an automatic No-Go.
