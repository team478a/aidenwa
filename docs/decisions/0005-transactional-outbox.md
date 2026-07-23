# 0005 Transactional Outbox for BullMQ delivery

## Decision

Persist `company-import`, `mock-call`, `twilio-call`, and `twilio-emergency-stop` delivery requests in `outbox_events` in the same PostgreSQL transaction as their business-state change.

The Worker is the only publisher for these events. It claims due rows, validates the payload, uses a deterministic BullMQ `jobId`, and marks a row published only after `Queue.add()` succeeds.

## Rationale

PostgreSQL and Redis cannot share one transaction. A durable database outbox removes the failure window where the database says `queued`, `reserved`, or `requested` but no BullMQ job exists.

At-least-once publication is intentional. A crash after `Queue.add()` but before the published update can repeat publication, while the stable BullMQ `jobId` prevents duplicate jobs.

## Safety boundaries

- Outbox payloads contain internal UUIDs and controlled scope codes only.
- Raw telephone numbers, credentials, cookies, CSRF values, provider tokens, and webhook payloads are prohibited.
- Provider execution remains protected by the existing production gate and disabled feature flags.
- `provider-webhook` remains on its existing path because webhook atomic retry is Phase 6 scope.

## Recovery

The Worker repairs legacy gaps for queued imports, queued mock call jobs, reserved real-call executions, requested rollbacks, and queued campaign targets without a call job. See `docs/operations/outbox-recovery.md`.
