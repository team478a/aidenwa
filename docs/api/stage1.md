# Stage 1 API

All routes are under `/api/v1`. Authenticated mutations require the session cookie and `X-CSRF-Token`.

- Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/session`, `POST /auth/change-password`
- Users: `GET/POST /users`, `GET/PATCH /users/:id`, `POST /users/:id/suspend`, `POST /users/:id/activate`
- Teams: `GET/POST /teams`, `PATCH /teams/:id`
- Organization: `GET/PATCH /organization`
- Audit: `GET /audit-logs`

All tenant-owned queries derive `organizationId` from the authenticated session. The API never accepts it as mutable client input.

`manager` is organization-scoped, not Team-scoped. It may list organization users and change only
the Team assignment of `sales` users. Team creation/editing, non-sales user changes, user lifecycle
changes, and organization settings remain admin-only. See
`docs/decisions/0006-manager-organization-scope.md`.
