# Stage 4C Zoom Phone follow-up decisions

- Status: Accepted for disabled/Fake implementation
- Date: 2026-07-20

## Decisions

- Use Zoom Call History/Call Elements APIs and current webhooks; do not add the deprecated Call Logs endpoints.
- Initial integration is one company-owned Zoom account using Server-to-Server OAuth. Multi-tenant customer credentials require a later credential-vault stage.
- A follow-up target uses `contactId` when known and `phoneNumberId` when no contact is identified. Neither raw Zoom IDs nor telephone numbers are copied into follow-up event records.
- “Open Zoom Phone” does not contain a phone number URL and does not initiate a call. With flags disabled, users receive manual-app guidance and may record a controlled attempt only after safety checks.
- Call-history matching requires exactly one outbound candidate after organization, assignee, time and destination-fingerprint filtering. Multiple candidates remain ambiguous and create an in-app notification.
- Zoom call connectivity never implies a sales outcome; a user must select a controlled outcome code.

## Deferred

- Zoom Marketplace App, General OAuth, per-customer credentials, Smart Embed, automatic dialing, recording, transcription, voicemail content and live transfer.
- Required production Zoom scopes and license confirmation must be recorded during external activation.
