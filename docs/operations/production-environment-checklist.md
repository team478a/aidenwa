# Production environment checklist — Gate A Mock-only (Railway)

`TBD` or an unchecked required item means No-Go. Record evidence without secrets, cookies,
customer data, telephone numbers or CSV contents.

## Decisions and ownership

- [ ] Railway Pro project and Singapore region approved; monthly budget/usage alert approved.
- [ ] Synthetic/test data only is approved; Privacy confirms real personal/customer data is absent.
- [ ] Release, Operations, Database, Security and Privacy owners named.
- [ ] Emergency Stop and Rollback operators named with substitutes.
- [ ] On-call Primary/Secondary named with tested contact routes.

## Services and network

- [ ] `web`, `api`, `worker`, `Postgres` and `Redis` services exist in one project.
- [ ] Only Web has a public Railway HTTPS domain.
- [ ] API, Worker, PostgreSQL and Redis remain private; API is reachable as
      `api.railway.internal:3001` only.
- [ ] Web `/login`, API `/health` and Worker heartbeat checks pass.
- [ ] Provider egress is unused; all external flags are false and Provider credentials are absent.

## Data and secrets

- [ ] PostgreSQL automated backup/restore capability and retention are approved and tested.
- [ ] Redis persistence/failure behavior and queue recovery procedure are approved.
- [ ] Required application secrets are independent random Railway variables.
- [ ] No production `.env`, Provider credential or secret value exists in Git/build arguments.
- [ ] Production startup fails safely when a required secret is absent or unsafe.
- [ ] CSV temporary artifacts are removed after success, failure and retention expiry.

## Logging and monitoring

- [ ] Web/API/Worker logs are available with approved retention and access.
- [ ] Redaction evidence excludes passwords, cookies, sessions, CSRF, Provider secrets and CSV data.
- [ ] HTTP 5xx/latency, database, Redis, Queue, Outbox and Worker-health alerts exist.
- [ ] Alert route reaches Primary and Secondary; one P1 test is recorded.
- [ ] Railway deployment/audit records are retained for the approved period.

## Deployment

- [ ] Candidate commit and successful CI run are fixed in release evidence.
- [ ] `pnpm audit --prod --audit-level high` and `pnpm release:check` pass.
- [ ] Web/API/Worker deployments use the same `RELEASE_COMMIT`.
- [ ] Backup succeeds before API `preDeployCommand` runs `prisma migrate deploy`.
- [ ] Production deployment does not execute seed.
- [ ] Health checks and restart policies are enabled and tested.
- [ ] Previous deployment starts against the restored forward schema.

## Safety and operator evidence

- [ ] `VOICE_PROVIDER=mock`; eight external integration flags are false.
- [ ] Twilio/OpenAI/Zoom/calendar credentials are absent.
- [ ] External Provider/API call count is 0; real telephone call count is 0.
- [ ] Backup/restore, rollback and Emergency Stop rehearsals pass.
- [ ] Admin completes company → CSV → scenario → campaign → Mock call → follow-up → appointment.

## Current decision

`NO-GO_FOR_MOCK_ONLY_PRODUCTION_DEPLOYMENT`: Railway code/configuration is prepared, but the
project, HTTPS domain, backups, monitoring, alerts, owners and end-to-end operator evidence have not
yet been provisioned or approved. `NO-GO_FOR_EXTERNAL_PROVIDER_ACTIVATION` remains unconditional.
