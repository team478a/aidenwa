# Stage 3 mock campaign API

Stage 3 adds organization-scoped products, AI-agent versions, validated scenario graphs, published manual knowledge, campaign target snapshots, and deterministic mock-call jobs under `/api/v1`.

Only `MockVoiceProvider` exists. It accepts a masked destination, has no network client, stores no recording/transcript, and fixture selection is rejected when `NODE_ENV=production`.

Campaign flow is `draft → ready → approved ready → running ↔ paused`, with explicit cancel. Target preview/materialization records FAX, invalid, non-callable, missing-number, and opt-out exclusions. Worker dispatch repeats eligibility checks immediately before the mock provider boundary.

Published product, agent, scenario, and knowledge versions are immutable. Scenario simulation and FAQ search are deterministic and use no LLM, embedding, crawler, or vector database.

Scenario validation rejects duplicate node keys, duplicate edges/default branches/priorities,
missing references, unreachable nodes, outgoing edges from `end`, missing node-type configuration,
paths without an end, depth over 50, and cycles without a valid `config.maxCycles` limit from 1 to 10. A bounded cycle must retain an exit path to `end`; simulation enforces the visit limit and
falls through to the next eligible branch.
