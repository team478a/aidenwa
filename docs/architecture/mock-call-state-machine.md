# Mock call state machine

Phase 3 keeps CallJob and CampaignTarget transitions consistent in one database transaction.

| Reason                     | CallJob   | CampaignTarget | Eligibility |
| -------------------------- | --------- | -------------- | ----------- |
| emergency stop             | `skipped` | `pending`      | unchanged   |
| campaign not running       | `skipped` | `pending`      | unchanged   |
| outside window / limits    | `skipped` | `pending`      | unchanged   |
| retry not due              | `skipped` | `retry_wait`   | unchanged   |
| FAX / missing / invalid    | `skipped` | `excluded`     | `excluded`  |
| opt-out                    | `skipped` | `excluded`     | `excluded`  |
| temporary provider failure | `failed`  | `retry_wait`   | unchanged   |

The mapping is implemented as a pure function in `apps/worker/src/mock-call-state.ts`. Provider
dispatch remains the deterministic Mock provider; no real call is enabled.

Successful completion writes the CallJob, attempt, event, target, company, phone, audit entry and
Usage Ledger in one transaction. Usage counters are derived data and can be rebuilt from the
append-only ledger.
