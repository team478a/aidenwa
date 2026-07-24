# Usage counter recovery

## Source of truth

`usage_ledger` is the source of truth. One row is allowed for each `(execution_type, execution_id)`,
so BullMQ redelivery cannot count the same call twice.

`call_usage_counters` and `call_budget_counters` are rebuildable projections.

## Automatic recovery

After a Mock call result commits, the Worker rebuilds the organization's counters. If rebuilding
fails after the result transaction, BullMQ redelivery sees the completed CallJob and retries only
`rebuildUsageCounters()`. It does not call the provider or apply the outcome again.

## Manual recovery

Invoke the internal Worker function `rebuildUsageCounters(prisma, organizationId)` from an
authenticated maintenance context. The operation:

1. loads organization-scoped ledger rows;
2. groups call counts by UTC hour/day;
3. groups amounts by UTC day/month and currency;
4. replaces only that organization's counter projections in one transaction.

Never edit ledger rows to repair a counter. Investigate the originating execution first.
