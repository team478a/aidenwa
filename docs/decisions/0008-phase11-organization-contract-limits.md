# Decision 0008: Phase 11 organization contract limits

## Status

Accepted for Phase 11 PR 2.

## Context

Phase 11 requires system administrators to display and change a client contract plan and usage
limits, but it does not define plan identifiers or numeric defaults. Existing production call
policies are operational safety controls and must not be weakened or replaced by commercial
contract data.

## Decision

- Contract plans use the stable internal values `trial`, `standard` and `enterprise`.
- Existing and newly created organizations default to `trial`.
- Contract limits are stored separately as `monthlyCallLimit` (default 1,000, minimum 0) and
  `concurrentCallLimit` (default 1, minimum 1).
- These values are upper-level SaaS contract data. Existing ProductionCallPolicy, Call Profile,
  Integration Client and Safety Gate limits remain independently enforced. A contract update
  never enables a Provider or bypasses the stricter operational limit.
- Organization suspension, rather than deletion, is the lifecycle operation and immediately
  invalidates all organization sessions.

## Consequences

PR 3 can calculate contract remaining usage without reading Provider configuration. Future call
orchestration work may apply the minimum of contract and operational limits, but must do so in the
shared Call Engine rather than in a Web screen or a second execution path.
