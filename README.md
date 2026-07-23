# Sales AI OS

AIテレアポ電話システムの TypeScript モノレポです。Stage 0〜4Eの機能実装とStage 4Fローカル統合安定化まで完了しています。現在のリリース状態は`LOCAL_STABILIZATION_COMPLETE_CI_PENDING`です。実Twilio/Zoom/OpenAI/カレンダー接続・実電話発信は、書面承認、対象commitのGitHub Actions成功、明示的な限定テスト開始条件が揃うまで無効です。

## 必要環境

- Node.js 22+
- pnpm 10.10+
- Docker Desktop / Docker Compose

## セットアップ

```bash
pnpm install
cp .env.example .env
pnpm infra:up
pnpm db:generate
pnpm db:migrate
```

PowerShell では `Copy-Item .env.example .env` を使用してください。

開発seedを使う場合は `.env` の `SEED_ADMIN_PASSWORD`、`SEED_MANAGER_PASSWORD`、`SEED_SALES_PASSWORD` に12文字以上の開発専用パスワードを設定してから `pnpm db:seed` を実行します。

## 起動

```bash
pnpm dev
```

- Web: http://127.0.0.1:3000
- Web health: http://127.0.0.1:3000/api/health
- API health: http://127.0.0.1:3001/health
- Worker health: http://127.0.0.1:3001/health/worker

個別起動には `pnpm dev:web`、`pnpm dev:api`、`pnpm dev:worker` を使います。Worker は Redis に TTL 付き health レコードを書き、API がその状態を公開します。

## 検証

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

E2E の前に PostgreSQL と Redis を `pnpm infra:up` で起動してください。停止は `pnpm infra:down` です。

## 構成

- `apps/web`: Next.jsログイン・管理画面
- `apps/api`: Fastify認証・管理API
- `apps/worker`: BullMQ Worker
- `packages/database`: Prisma / PostgreSQL
- `packages/validation`: Zod による環境変数検証
- `packages/voice-provider`: 共通 interface と外部通信をしない mock
- `packages/shared`, `packages/ui`, `packages/ai`: 今後の共有領域
- `docs`: 要件、設計、API、DB、prompt、test、decision

詳細な実装状況は `IMPLEMENTATION_STATUS.md`、Stage 4F検証結果は `docs/verification/stage4f-report.md`、Stage 4A APIは `docs/api/stage4a.md`、緊急停止手順は `docs/operations/emergency-stop.md`、承認記録は `docs/decisions/0003-stage-4-production-call-approval.md` を参照してください。既定構成はMock/Fake専用で、電話事業者、外部LLM、録音、有料APIを使用しません。
