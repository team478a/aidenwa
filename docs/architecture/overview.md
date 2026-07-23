# Architecture

## Transactional queue delivery

API business transactions persist queue intent to PostgreSQL `outbox_events`. The Worker validates and publishes those events to BullMQ with deterministic job IDs. Redis availability therefore no longer controls whether a queued/reserved business transition can commit, and pending delivery resumes after Redis or Worker recovery.

See `docs/decisions/0005-transactional-outbox.md` and `docs/operations/outbox-recovery.md`.

The pnpm workspace separates the Next.js administration UI from the always-on Fastify API and BullMQ worker. PostgreSQL is accessed through Prisma; Redis backs jobs and ephemeral worker health. Voice vendors must remain behind `VoiceProvider`.

The browser reaches the API through a same-origin Next.js rewrite. Fastify owns authentication and authorization. PostgreSQL stores revocable sessions and Redis provides login throttling; no authentication token is placed in localStorage.
