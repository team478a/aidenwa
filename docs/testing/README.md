# Testing

Vitest covers unit tests. Playwright smoke tests start all three applications and confirm Web, API, and Redis-backed Worker health. Tests must use mock voice providers and must never place real calls.

Stage 1 API integration tests require the local PostgreSQL and Redis services. Playwright seeds development-only users, exercises the complete admin flow, and confirms that logout protects management routes.
