# Architecture

The pnpm workspace separates the Next.js administration UI from the always-on Fastify API and BullMQ worker. PostgreSQL is accessed through Prisma; Redis backs jobs and ephemeral worker health. Voice vendors must remain behind `VoiceProvider`.

The browser reaches the API through a same-origin Next.js rewrite. Fastify owns authentication and authorization. PostgreSQL stores revocable sessions and Redis provides login throttling; no authentication token is placed in localStorage.
