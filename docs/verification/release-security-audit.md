# Release security audit

- Audit date: 2026-07-31 (Asia/Tokyo)
- Scope: repository security controls and Mock-only release readiness
- External Provider/API calls and real telephone calls: 0

## Findings and remediation

- Authentication uses opaque, hashed, revocable server-side sessions.
- Suspended users and organizations invalidate existing sessions at the next request.
- Session cookies are HttpOnly, SameSite Strict and Secure in production; mutations require the
  stored CSRF hash and matching Origin.
- Organization and owner boundaries have focused API tests; managers cannot administer another
  team and sales users cannot operate another owner's scoped data.
- Audit sanitization removes password, Cookie, session, CSRF, CSV, signature, API/auth token,
  provider identifiers, audio and raw-message fields recursively.
- Audit key normalization was hardened so camelCase, snake_case and hyphenated secret names are
  treated identically.
- Git-tracked files contain no detected OpenAI, AWS, private-key, Twilio or Zoom credential value.
- Dependency audit initially found 9 high findings in Next.js and Fastify/Next transitive
  dependencies. Next.js was updated to 15.5.21 and patched transitive versions were locked.
- Post-remediation `pnpm audit --prod --audit-level high`: no known vulnerabilities.

## Remaining production blockers

- Production infrastructure, HTTPS, backup/restore evidence, centralized monitoring and on-call
  ownership are external operational actions and are not proven by this repository.
- Privacy, consent, data-retention and telephone-sales legal approval require accountable human
  review.
- Therefore the current production decision remains No-Go; Mock-only rehearsal is permitted.
