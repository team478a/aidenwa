# Architecture

## Transactional queue delivery

API business transactions persist queue intent to PostgreSQL `outbox_events`. The Worker validates and publishes those events to BullMQ with deterministic job IDs. Redis availability therefore no longer controls whether a queued/reserved business transition can commit, and pending delivery resumes after Redis or Worker recovery.

See `docs/decisions/0005-transactional-outbox.md` and `docs/operations/outbox-recovery.md`.

The pnpm workspace separates the Next.js administration UI from the always-on Fastify API and BullMQ worker. PostgreSQL is accessed through Prisma; Redis backs jobs and ephemeral worker health. Voice vendors must remain behind `VoiceProvider`.

The browser reaches the API through a same-origin Next.js rewrite. Fastify owns authentication and authorization. PostgreSQL stores revocable sessions and Redis provides login throttling; no authentication token is placed in localStorage.

## Phase 8 modularization

Stage-oriented files are being split incrementally into domain modules without changing public
contracts. Imports are the first domain boundary. See `module-boundaries.md`, `api-layering.md`,
`worker-job-boundaries.md`, and the Phase 8 verification report.

Typed domain failures now cross the HTTP boundary through a shared Fastify mapper. Unknown
infrastructure errors retain internal logging but receive only the stable generic public response;
domain diagnostic details are never serialized to clients.

Appointment routing, policy, scoped reads, state transitions, Slot Token handling and Worker
maintenance now live under explicit Appointment domain boundaries. Legacy Stage import paths remain
compatibility-only exports.
