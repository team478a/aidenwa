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

This layering now covers Import and all Stage 2 sales-data domains: Companies, Contacts, Phone
Numbers, Tags, Sales Lists and OptOuts. `stage2-routes.ts` only composes these modules. Shared
typed DomainError mapping remains a later common-core slice; existing public error adapters are
retained for compatibility.
