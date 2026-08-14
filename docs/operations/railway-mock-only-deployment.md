# Railway Gate A Mock-only deployment

This is the low-cost deployment path for Phase 10 operator validation. It is intentionally limited
to synthetic/test data. It does not authorize external Providers, real customer data or telephone
calls. Railway's nearest available region is Singapore; Privacy must approve any later use of real
business or personal data.

## Services

Create one Railway project in the Singapore region with these exact service names:

| Service    | Source/config path           | Public network            |
| ---------- | ---------------------------- | ------------------------- |
| `web`      | `deploy/railway/web.toml`    | Generate one HTTPS domain |
| `api`      | `deploy/railway/api.toml`    | Private only              |
| `worker`   | `deploy/railway/worker.toml` | Private only              |
| `Postgres` | Railway PostgreSQL           | Private only              |
| `Redis`    | Railway Redis                | Private only              |

The Web rewrite uses `http://api.railway.internal:3001`, so the API service name and port are an
invariant. Do not generate public domains for API, Worker, PostgreSQL or Redis. Persistent CSV
temporary storage is not required: imports are disposable and the existing cleanup job removes
normal and failed-job artifacts. A container restart also discards its ephemeral copy.

## Variables

Use `deploy/railway/mock-only.env.example` as the name/value checklist. Set shared variables on the
three application services, except `API_INTERNAL_URL`, which is needed only by Web, and
`API_HOST`/`API_PORT`, which are needed only by API. Use Railway references for `DATABASE_URL` and
`REDIS_URL`. Generate independent random secrets of at least 32 characters in Railway.

Set `WEB_ORIGIN` to the generated Web HTTPS origin and `RELEASE_COMMIT` to the exact deployed Git
commit. Do not add Twilio, OpenAI, Zoom or calendar credentials. The eight integration flags must
remain `false`, and `VOICE_PROVIDER` must remain `mock`.

Seed is prohibited in this environment. Create the initial administrator through an approved,
one-time procedure after deployment; never place its password in Git or build arguments.

## Deployment order and evidence

1. Confirm CI, dependency audit and `pnpm release:check` pass for the candidate commit.
2. Provision PostgreSQL and Redis and enable the available automated backup policy.
3. Deploy `api`. Its start command runs `prisma migrate deploy` before starting the HTTP process and
   must finish successfully. This fail-closed guard is required even when Railway config-as-code is
   not attached to the service.
4. Deploy `worker`, then confirm `GET /health/worker` through an authenticated operational path or
   Railway logs reports a fresh worker heartbeat.
5. Deploy `web`, generate its HTTPS domain and confirm `/login` responds over HTTPS.
6. Run the Mock-only operator flow: login, company creation, CSV preview/import, scenario,
   campaign, Mock call, follow-up and appointment.
7. Capture redacted deployment IDs, commit, migration result, health results and operator-flow
   result. Never capture environment values, cookies, customer data or CSV contents.

## Immediate rollback

Pause Web traffic or roll Web/API/Worker back to the previous deployment of the same commit set.
Do not run a down migration. Preserve PostgreSQL, Redis, Queue, Outbox, Audit and Emergency Stop
state. If migration compatibility is uncertain, keep the release No-Go and restore into an isolated
database before selecting the previous application deployment.

## Go boundary

Repository configuration alone does not make Gate A Go. A named Release/Operations owner must
verify HTTPS, backups, logs, alerts, health checks and the complete Mock flow. Gate B remains No-Go
even after Gate A succeeds.
