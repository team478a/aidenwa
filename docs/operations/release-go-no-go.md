# Release Go / No-Go decision

## Current decision

`NO-GO_FOR_MOCK_ONLY_PRODUCTION_DEPLOYMENT`

`NO-GO_FOR_EXTERNAL_PROVIDER_ACTIVATION`

The repository is eligible for a Mock-only release rehearsal. Gate A deployment remains No-Go
until the Railway Mock-only design is approved and provisioned with named owners and environment
evidence.
Gate B external Provider activation is separate, remains prohibited in Phase 10 and is never
implied by Gate A.

## Current evidence baseline

- Candidate baseline: `60ad15a`.
- GitHub Actions: `30695971040` PASS.
- Dependency Audit and `pnpm release:check`: PASS.
- Backup/restore and previous-release rollback rehearsals: PASS.
- Next.js ESLint warning: resolved.
- External Provider/API calls and real telephone calls: 0.
- Selected Gate A topology: Railway Singapore; deployment configuration is prepared but no
  resource has been authorized or provisioned by this decision.

## Technical Go conditions

- Exact candidate commit has a successful GitHub Actions run.
- Prisma format/validate/generate, empty-database migrations and seed pass.
- lint, format, typecheck, all tests, E2E 8/8 or better and production builds pass.
- `pnpm audit --prod --audit-level high` reports no high or critical findings.
- `pnpm release:check` passes with every external flag disabled.
- Secret scan and audit forbidden-key inspection report zero findings.
- Backup restore and previous-release startup are rehearsed successfully.

## Operational Go conditions

- Production HTTPS domains, `WEB_ORIGIN`, database and Redis endpoints are approved.
- Secrets are injected from a secret manager and never stored in Git or deployment logs.
- Database automated backups, restore ownership, retention and recovery targets are documented.
- Centralized logs, health alerts, queue/maintenance alerts and on-call routing are active.
- Emergency Stop and rollback operators have completed a tabletop exercise.
- Data retention, privacy, terms, customer consent and telephone-sales legal review are approved.

Gate A additionally requires every required item in
`docs/operations/production-environment-checklist.md` to have environment-specific evidence. An
unchecked item or `TBD` owner keeps Gate A No-Go.

## Automatic No-Go conditions

- Any external integration flag is true without its separate written approval.
- Any high/critical dependency vulnerability, secret-pattern finding or audit forbidden key.
- Migration drift, failed restore, failed E2E/build, unhealthy Worker or unresolved incident.
- Missing owner for rollback, security response, privacy response or Emergency Stop.

## Separate external activation gate

Twilio, OpenAI Realtime, Zoom Phone and calendar integrations remain disabled. Activating any of
them requires the approval record in `docs/decisions/0003-stage-4-production-call-approval.md`,
bounded cost limits, allowlists, verified webhook endpoints and a separately observed test. No
automated test may call a real telephone number.
