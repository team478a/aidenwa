# CSV import recovery

## Scope

This runbook covers Phase 2 row-level recovery. It does not enable any external provider.

## Row states

- `pending`: eligible for processing
- `processing`: claimed by a Worker
- `success`: company data and the row audit were committed
- `skipped`: duplicate/review/skip policy prevented a write
- `failed`: the row transaction rolled back; inspect `lastErrorCode`

`action` remains the requested duplicate policy. It is not overwritten when processing fails.

## Retry

An administrator or manager can call:

```text
POST /api/v1/imports/companies/{importJobId}/retry-failed
```

The endpoint:

1. verifies the organization and import state;
2. resets only `failed` rows to `pending`;
3. leaves every `success` and `skipped` row unchanged;
4. creates a new transactional Outbox event;
5. returns `202` without processing rows in the API process.

The Worker rechecks duplicates inside each row transaction. Repeated execution therefore does not
trust a stale preview.

## Investigation

Inspect counts by `processing_status`, then inspect only sanitized error code/message fields. Raw CSV
data must not be copied into logs or incident descriptions.

If a Worker stops while a row is `processing`, first verify that no import Worker is active. Reset
only that import's stranded rows to `failed`; then use the retry endpoint. Do not reset `success`
rows.

## Cancellation

The Worker checks `ImportJob.status` before every batch and row. A cancelled job is not processed
further. Cleanup continues to use the configured import retention policy.
