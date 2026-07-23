# AGENTS.md

## Scope

This repository implements the AI telemarketing system described in `docs/requirements/product.md`. Work stage by stage; do not implement later stages early.

## Commands

- Install: `pnpm install`
- Infrastructure: `pnpm infra:up`
- Develop all apps: `pnpm dev`
- Verify: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e`

## Rules

- Keep TypeScript strict and do not introduce `any`.
- Validate environment variables and API inputs with Zod.
- Never commit secrets or real customer/phone data.
- Never call a voice vendor directly; use `VoiceProvider`.
- Default all development and tests to mocks. Never initiate a real call from automated tests.
- Keep business data organization-scoped when those models are introduced.
- Store timestamps in UTC and display them in Asia/Tokyo.
- Add Prisma migrations for schema changes; do not weaken existing tests.
- Record unresolved specification decisions in `docs/decisions`.
