# Previous-release rollback rehearsal

This rehearsal verifies that a reviewed previous commit can start against a restored copy of the
current database without reversing migrations. It must use Mock/Fake providers and an isolated
database.

## Safety boundaries

- Use a detached temporary worktree at `.rollback-rehearsal`.
- Use only `sales_ai_rollback_rehearsal`; never point the previous release at the normal database.
- Set `VOICE_PROVIDER=mock` and every external integration flag to `false`.
- Install from the committed lockfile and prefer `pnpm install --offline --frozen-lockfile`.
- Do not run a down migration or delete current migration records.
- Remove the worktree, temporary dump and isolated database after collecting non-sensitive
  evidence.

## Verification sequence

1. Confirm the selected previous commit is reviewed and is an ancestor of the candidate.
2. Create the detached temporary worktree for that exact commit.
3. Dump the current rehearsal database and restore it into `sales_ai_rollback_rehearsal`.
4. Run `pnpm db:generate` and `pnpm db:migrate` from the old worktree. The expected result is no
   pending migration and no attempt to reverse the schema.
5. Run E2E from the old worktree to start Web, API and Worker and verify their health endpoints.
6. Run the old release production build.
7. Remove all temporary resources and verify the isolated database count is zero.

## 2026-08-01 evidence

- Candidate: `f7261cc`.
- Previous release candidate: `dadf6b3`.
- Restored migration count: 17; previous release reported no pending migrations.
- Previous-release Web/API/Worker startup and E2E: 8/8 PASS.
- Previous-release production build: PASS.
- Temporary worktree, dump and isolated database remaining: 0.
- External Provider/API calls and real telephone calls: 0.

The Next.js build emitted the already-classified ESLint-plugin warning and an expected
multiple-lockfile warning caused by the temporary nested worktree. Neither affected startup,
health checks, E2E or build output.
