# Stage 4B-1 Twilio Limited-Test Operations

## Status and provider roles

Twilio Programmable Voice is used only for the consented-number AI connectivity test. Zoom Phone remains unconnected and is reserved for future human callbacks/handoff. Media Streams, free-form AI, recording, transcription, SMS, calendar integration and human transfer are not supported in Stage 4B-1.

Technical implementation and Fake Twilio verification do not authorize a real call. Written approval and a successful GitHub Actions run for the exact release commit remain mandatory.

## Secret configuration

Store `TWILIO_ACCOUNT_SID`, API Key SID/secret, Auth Token and the originating number in the production secret manager. Never store their values in Git, database records, screenshots, UI, logs or audit payloads. The Auth Token is used for webhook signature validation; REST calls use the API Key where possible. `.env.example` contains only blank placeholders and safe disabled defaults.

`SOURCE_NUMBER_FINGERPRINT_KEY` is also a production secret. Registration converts the originating E.164 number immediately to a keyed HMAC fingerprint and last four digits. Activation and dispatch compare that fingerprint with the secret-managed `TWILIO_FROM_NUMBER`; the full number is never stored in application tables.

The originating number must be owned by the organization or verified in Twilio. Record the verification evidence in the written approval record; do not copy the full number into that document.

## Webhook setup and verification

Configure public HTTPS TwiML and status callback base URLs exactly as Twilio calls them. Reverse proxies must preserve the original path and query string. Every form-urlencoded request is checked with `X-Twilio-Signature`; test environments generate a valid fake signature and never bypass validation. Invalid requests receive 403 and create only a sanitized audit event.

## Manual limited test

1. Confirm GitHub Actions succeeded for the release commit.
2. Complete the written approval, responsible operators, five consent records, test window and budget.
3. Confirm system emergency-stop and rollback owners are available.
4. Create a bounded authorization for exactly five maximum calls, up to five allowlist records and 120 seconds.
5. A system administrator approves and activates it. All environment, DB, Stage 4A Gate and emergency-stop checks rerun.
6. Select one consented destination and manually confirm the single-call form.
7. Review callbacks, DTMF, duration and cost before deciding whether to place the next call.

Never use an automated sequence. The same destination cannot be called twice in one authorization.

## Cost verification

The configurable per-minute estimate reserves budget before dispatch. Final cost is stored separately when supplied by the Provider. Unknown final cost retains the conservative reservation. Crossing 80%, 90% or 100% creates an audit event; 100% suspends the authorization and disables Twilio production. Before each next call, compare the Twilio console charge with the masked internal execution and record any discrepancy as an incident.

## Emergency stop and incident response

Activate the smallest applicable Stage 4A stop; use the system stop if scope is uncertain. New calls are rejected, queued/ringing calls are canceled and in-progress calls are ended. Cancellation failures remain visible as failed status and must be checked against Provider status. Do not release a stop merely because the API accepted the request.

For invalid signatures, missing callbacks, `provider_unknown`, unexpected cost, unauthorized destination, recording, wrong caller ID or cancellation failure:

1. Activate system emergency stop and set `PRODUCTION_CALLS_ENABLED=false`.
2. Disable the DB Provider configuration.
3. Preserve sanitized correlation, event and audit records.
4. Verify Provider state without redialing.
5. Rotate/revoke credentials if compromise is possible.
6. Record owner, timeline, affected call count, cost, cause and corrective action.
7. Require new written approval before resuming.

`provider_unknown` never triggers an automatic retry. A system administrator records either `confirmed_not_created` with supporting reason, which closes the execution as failed, or `incident`, which keeps it held for investigation. The resolution audit explicitly records that no redial was scheduled.

Emergency-stop jobs retain their system, organization, campaign, product or provider scope. Rollback remains `requested` until the Worker checks Fake/Provider status; unconfirmed or failed cancellation settles rollback as `failed` for operator review.

See `stage4b1-rollback.md` for the full rollback order.
