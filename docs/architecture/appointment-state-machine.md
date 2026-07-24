# Appointment state machine

Appointment state changes are decided by the pure state machine in
`apps/api/src/appointment-state.ts` and persisted by the Stage 4E service.

```text
held
  -> confirmed
  -> cancelled
  -> expired

confirmed
  -> completed
  -> no_show
  -> cancelled
  -> reschedule_requested

reschedule_requested
  -> confirmed (after a newly verified slot is applied)
  -> cancelled

terminal: cancelled, completed, no_show, expired
```

Completion and no-show are rejected before `startAt`. A confirmed or reschedule-requested
appointment cannot be cancelled after the policy's cancellation deadline. Held appointments may
still be released or expired.

The appointment update, version increment, AppointmentEvent, deduplicated notification, and any
applicable handoff/follow-up update commit in one database transaction. Concurrent requests use the
appointment version and exact current status; only one request can win.

Slot tokens are signed but are not trusted solely because their signature is valid. The decoded JSON
is strictly validated with Zod, including UUIDs, ISO timestamps, IANA timezone, expiry, and
`start < end`. Holding or rescheduling rechecks organization ownership, policy validity,
minimum notice, maximum advance, duration, and the AvailabilityRule effective period.

Database foreign keys protect direct references. Service-layer organization checks remain mandatory
because a simple foreign key cannot prove that two referenced rows belong to the same organization.
