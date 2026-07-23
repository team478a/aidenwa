# Stage 4F Baseline

- Date: 2026-07-20 (Asia/Tokyo)
- Stage: Stage 4F integration stabilization
- Branch: `master`
- Commit: unavailable; repository has no `HEAD` commit
- Working tree: all project files are currently untracked, so existing files are treated as user-owned baseline
- Database: local Docker PostgreSQL only; production database is out of scope
- Migrations present: 11, Stage 0 through Stage 4E
- CI workflow: `.github/workflows/ci.yml` exists
- GitHub push/PR/Actions: not authorized; real CI remains pending

## Safety flags

All required values are present in `.env.example` and false/mock:

- `VOICE_PROVIDER=mock`
- `PRODUCTION_CALLS_ENABLED=false`
- `REALTIME_AI_ENABLED=false`
- `TWILIO_MEDIA_STREAMS_ENABLED=false`
- `ZOOM_PHONE_INTEGRATION_ENABLED=false`
- `ZOOM_PHONE_OUTBOUND_ENABLED=false`
- `AI_HANDOFF_ENABLED=false`
- `CALENDAR_INTEGRATION_ENABLED=false`
- `AI_APPOINTMENT_BOOKING_ENABLED=false`

No provider credential value was read or recorded. Tests must use reserved/example identifiers and Fake/Mock transports only.

## Known baseline items

- Stage 4C's original section records that its migration was not applied when Docker was stopped. Stage 4D later applied it successfully; both historical facts must remain distinguishable.
- Stage 4E development migration initially failed transactionally when `tstzrange` was used with Prisma's timestamp type. It was rolled back, changed to `tsrange` before first successful application, and then applied successfully.
- Next.js has emitted an ESLint-plugin detection warning during production builds; Stage 4F must classify or correct it.
- Full Unit/API/Worker, full E2E, empty-database replay and GitHub Actions have not yet been completed for the Stage 4E state.
