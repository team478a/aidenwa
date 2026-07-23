# 0001: Stage 0 defaults

- Status: accepted for Stage 0
- Runtime: Node.js 22 and pnpm 10
- Worker health: Redis heartbeat with 15-second TTL, exposed by the API
- Local infrastructure: PostgreSQL 16 and Redis 7 through Docker Compose
- Voice integration: interface plus in-memory mock only

These choices fill version and health-storage details not fixed by the implementation guide without expanding business scope.
