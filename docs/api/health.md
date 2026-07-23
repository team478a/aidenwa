# Health API

- `GET /health`: API process liveness; returns 200.
- `GET /health/worker`: reads the worker heartbeat from Redis; returns 200 while fresh and 503 when missing.
- Web `GET /api/health`: Next.js process liveness; returns 200.
