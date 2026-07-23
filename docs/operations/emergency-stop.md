# Emergency Stop Procedure

1. A system or organization administrator records a reason and activates the narrowest applicable stop: system, organization, campaign, product, or provider.
2. New queued/reserved dispatch is marked skipped and Worker rechecks active stops before calling even the mock provider.
3. Confirm the readiness page reports the active stop and inspect sanitized audit events.
4. Investigate scope, opt-out impact, provider state, usage counters and queued jobs.
5. Only a system administrator may release a stop. A release reason is mandatory.
6. Confirm the stop is inactive before resuming a campaign. Releasing a stop never enables a real provider.

If control behavior is uncertain, keep the stop active. Stage 4A has no real-provider activation path.
