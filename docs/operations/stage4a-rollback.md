# Stage 4A Rollback

Application rollback must preserve the database migration and safety records. Do not drop approval, emergency-stop, allowlist, webhook, usage, budget, or gate-decision tables during an incident.

1. Activate a system-wide emergency stop.
2. Stop API and Worker deployment rollout.
3. Redeploy the last verified application build while keeping `MockVoiceProvider` as the only enabled implementation.
4. Keep all provider configuration `productionEnabled=false` and remove no audit evidence.
5. Run Prisma validate, migration status, unit/API/Worker tests and the Stage 4A E2E test.
6. A system administrator records the incident and explicit recovery reason before releasing the stop.

Stage 4B rollback and provider-specific cancellation are intentionally out of scope.
