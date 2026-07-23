# Stage 1 API

All routes are under `/api/v1`. Authenticated mutations require the session cookie and `X-CSRF-Token`.

- Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/session`, `POST /auth/change-password`
- Users: `GET/POST /users`, `GET/PATCH /users/:id`, `POST /users/:id/suspend`, `POST /users/:id/activate`
- Teams: `GET/POST /teams`, `PATCH /teams/:id`
- Organization: `GET/PATCH /organization`
- Audit: `GET /audit-logs`

All tenant-owned queries derive `organizationId` from the authenticated session. The API never accepts it as mutable client input.
