# Stage 4B-1 Rollback

This procedure must be rehearsed against a Fake Twilio Server before any real call.

1. Activate the system-wide emergency stop.
2. Set `PRODUCTION_CALLS_ENABLED=false` and redeploy.
3. Set the Twilio provider configuration `productionEnabled=false`.
4. Let the emergency-stop Worker cancel queued/ringing calls and end in-progress limited-test calls.
5. Verify final state by callback or status fetch. Record cancellation failures as incidents.
6. Stop the Worker if provider activity cannot be confirmed.
7. Decide whether to revoke or rotate the Twilio API Key and Auth Token.
8. Redeploy the last Mock-only build.
9. Preserve migrations, call correlation, costs, webhook events and audit evidence.
10. Record cause, affected call count, cost and owner. Never resume without a new system-admin and written approval.

Releasing an emergency stop never automatically redials or re-enables Twilio.
