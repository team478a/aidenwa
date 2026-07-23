# 0002: Stage 1 authentication

- Status: accepted
- Session: opaque 256-bit random token in an HttpOnly, SameSite=Strict cookie; only its SHA-256 digest is stored in PostgreSQL.
- Passwords: Node.js scrypt with a unique 128-bit salt and constant-time verification.
- CSRF: a separate random token is checked by hash against the session and must be sent in `X-CSRF-Token`; browser origins are also checked.
- Login throttling: Redis counter per organization slug, normalized email, and IP; five attempts per 15 minutes.
- Tenant selection: login accepts an optional organization slug and otherwise uses `DEFAULT_ORGANIZATION_SLUG` for the one-organization MVP.

The session is rotated on every login. Logout, password change, and user suspension delete server-side sessions. Production cookies use `Secure`.
