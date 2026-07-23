# Outbox recovery

## Normal operation

The Worker checks due outbox rows every five seconds.

1. `pending` rows whose `available_at` has passed are claimed as `publishing`.
2. Payloads are validated with Zod.
3. The event is added to `sales-ai-jobs` with a deterministic BullMQ `jobId`.
4. Success changes the row to `published`.
5. Failure returns it to `pending` with exponential backoff.
6. The eighth failure changes it to `failed`.

A `publishing` lock older than five minutes is considered abandoned and is reclaimed after Worker restart.

## Automatic legacy-gap repair

At Worker startup and during hourly maintenance:

- queued `ImportJob` → create missing `company-import` outbox
- queued `CallJob` → create missing `mock-call` outbox
- reserved `RealCallExecution` → create missing `twilio-call` outbox
- requested authorization rollback → create missing `twilio-emergency-stop` outbox
- queued `CampaignTarget` without a `CallJob` → reset to `pending`

All inserts are upserts on `(event_type, aggregate_id)`.

## Operator checks

```sql
SELECT status, event_type, COUNT(*)
FROM outbox_events
GROUP BY status, event_type
ORDER BY status, event_type;
```

Failed rows must be investigated by `last_error_code`; it contains an error class only, never the original message or secrets. Do not manually change a row to `published`.

Before retrying a `failed` row, confirm that:

- Redis and the Worker are healthy;
- external provider flags remain false unless a separately approved production procedure is active;
- the aggregate is still in a dispatchable state;
- no raw telephone number or credential has been added to the payload.

Then reset only the reviewed row:

```sql
UPDATE outbox_events
SET status = 'pending',
    attempt_count = 0,
    available_at = CURRENT_TIMESTAMP,
    locked_at = NULL,
    last_error_code = NULL
WHERE id = '<reviewed-outbox-uuid>'
  AND status = 'failed';
```

## Rollback

Stopping the Worker stops publication without losing pending rows. Do not delete the outbox table during rollback. Existing consumers are idempotent and deterministic job IDs prevent duplicate BullMQ jobs.
