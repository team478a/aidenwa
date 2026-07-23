# Database

Migration `20260724010000_phase1_transactional_outbox` adds the durable `outbox_events` bridge between PostgreSQL business transactions and BullMQ. Existing migrations and business rows are unchanged.

PostgreSQL 16 is the initial database. Prisma migrations live in `packages/database/prisma/migrations`.

Stage 1 adds `organizations`, `teams`, `users`, `sessions`, and append-only `audit_logs`. Tenant-owned rows carry `organization_id`; user email uniqueness is scoped to an organization. Session tokens and CSRF tokens are stored only as hashes.
