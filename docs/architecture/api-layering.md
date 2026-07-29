# API layering

The Phase 8 API direction is:

```text
Fastify route -> controller -> service -> repository
                             -> policy
                             -> transactional outbox
```

- Authentication, CSRF and `organizationId` originate from the existing session boundary.
- Controllers own transport parsing and Zod validation.
- Services own state transitions and transaction composition without Fastify types.
- Repositories own Prisma reads/writes without role decisions.
- Policies are pure and unit-testable.
- Existing error codes and response shapes remain the compatibility contract.

The Import module is the first complete application of this layering. Shared typed DomainError
mapping remains the next common-core slice; Import retains the existing error adapter until that
step is introduced separately.
