# Database

PostgreSQL 16 is the initial database. Prisma migrations live in `packages/database/prisma/migrations`.

Stage 1 adds `organizations`, `teams`, `users`, `sessions`, and append-only `audit_logs`. Tenant-owned rows carry `organization_id`; user email uniqueness is scoped to an organization. Session tokens and CSRF tokens are stored only as hashes.
