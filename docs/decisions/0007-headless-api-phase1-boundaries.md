# Headless AI Call Engine Phase API-1 boundaries

Date: 2026-08-13

## Decision

Phase API-1 exposes only sandbox Call Profile discovery and single-call acceptance. A request is
persisted as a minimum-data snapshot and dispatched through the existing transactional outbox and
Worker to `MockVoiceProvider`. The raw destination number is never persisted on the external call
record.

Production Integration Clients and production Call Profiles may be configured for later phases,
but every external production call is denied fail-closed. An API key and the
`calls:production` scope never bypass the existing Production Gate.

The API and Worker both enforce organization scope, active client/profile state, call window,
limits, Emergency Stop and OptOut. The Worker repeats mutable safety checks immediately before
Mock dispatch.

## Unresolved items intentionally deferred

- The current Production Gate evaluates internal campaign, company and phone records. External
  systems remain the customer master, so a reviewed adapter and approval mapping are required
  before Phase API-1's fail-closed production denial can be lifted.
- A plain telephone-number string cannot reliably identify a FAX line before provider execution.
  Phase API-1 rejects syntactically invalid numbers and never performs a real call; provider FAX
  detection and standard `fax` result mapping remain incomplete acceptance evidence.
- Status/result/cancel/stop APIs, webhooks, batches, rate limiting and Admin UI belong to later
  phases in the specified implementation order and are not introduced here.

## Consequences

This phase can be exercised without an external provider or paid API. It does not authorize real
telephone calls and does not claim the complete v1 acceptance criteria.
