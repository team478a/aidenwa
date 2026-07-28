# ADR 0006: Manager scope is organization-wide

- Status: Accepted
- Date: 2026-07-28

## Decision

`manager` is an organization-wide operational role. Tenant isolation always applies, but Team
membership or `Team.managerUserId` does not narrow the manager's access to business data.

A manager may:

- list organization users and change the Team assignment of `sales` users;
- read and edit organization companies, including owner assignment;
- operate organization campaign targets and results;
- operate organization appointments and follow-up work within each endpoint's existing lifecycle
  rules.

A manager may not:

- create users, change user names or roles, or update non-`sales` users;
- suspend or activate users;
- create or edit Teams, including their responsible manager;
- update organization settings;
- cross the authenticated organization boundary;
- perform actions separately reserved for `admin` or `system_admin`, such as releasing opt-outs or
  production approval decisions.

## Rationale

The Stage 2 specification explicitly allows managers to register and edit organization companies,
assign owners, import CSV, and manage tags/lists. The Stage 3 specification likewise allows
organization-wide campaign and result operations. Restricting managers to Teams they are
responsible for would silently remove existing capabilities and require coordinated product,
query, UI, migration, and operational changes.

`Team.managerUserId` remains responsibility and assignment metadata. It is not an authorization
boundary.

## Enforcement

All business access continues to derive `organizationId` from the authenticated session. API role
checks enforce the action limits above. Tests prove organization-wide sales-Team assignment and
deny Team administration, organization settings, non-sales changes, and cross-organization Team
assignment.
