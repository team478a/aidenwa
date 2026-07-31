# Mock-only release rehearsal

This rehearsal proves deployability without enabling a provider, paid API, external calendar or
real telephone call. Run it against the exact candidate commit in an isolated environment.

## Preconditions

- Use an empty PostgreSQL database and isolated Redis instance.
- Set `VOICE_PROVIDER=mock`.
- Keep every external integration flag listed by `pnpm release:check` set to `false`.
- Leave all Twilio, OpenAI, Zoom and calendar credentials absent.
- Set a non-placeholder `RELEASE_COMMIT` equal to the reviewed commit.
- Prepare a database backup/restore target and name the rollback operator.

## Rehearsal

1. Run `pnpm install --frozen-lockfile`.
2. Run `pnpm audit --prod --audit-level high`; any high or critical finding is a No-Go.
3. Run `pnpm release:check`.
4. Run Prisma generate, format check and validate.
5. Apply all migrations to the empty database and run the seed.
6. Run lint, format check, typecheck and all unit/API/Worker tests.
7. Run Playwright E2E and confirm at least 8/8 pass.
8. Build Web, API and Worker with `API_INTERNAL_URL` pointing to the isolated API.
9. Start services, confirm Web/API/Worker health and exercise only Mock/Fake workflows.
10. Confirm audit records contain no forbidden keys and no external Provider event was created.
11. Stop the candidate, restore the backup into a separate validation database, and start the
    previous release against it. Do not reverse or rewrite migrations.

For the isolated database migration/backup/restore portion on the local Docker stack, set the
development `DATABASE_URL` and seed passwords, then run `pnpm rehearsal:database`. The command
refuses non-local database hosts, uses only the fixed `sales_ai_rehearsal_source` and
`sales_ai_rehearsal_restore` databases, compares completed migration counts after restore and
removes both databases and its temporary dump when finished.

## Evidence

Record the commit, operator, timestamps, command results, migration count, E2E count, build result,
restore result and external-call count in the release decision. Never paste credentials, raw phone
numbers, cookies, session tokens or CSV contents into the evidence.
