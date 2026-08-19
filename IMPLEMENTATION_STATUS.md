# Implementation Status

- Current stage: Phase 11 PR 1 — 単体SaaS調査・権限基盤
- Release state: Phase 1–9 verified; Railway Mock-only deployment configuration prepared;
  environment provisioning remains No-Go; external providers disabled
- Updated: 2026-08-19
- Latest verification:
  - Unit/API/Worker/Web configuration: 237 tests PASS locally
  - E2E: 8/8 PASS
  - Production build: Web/API/Worker PASS
  - GitHub Actions: run `30695971040` PASS
  - Latest implementation commit: `60ad15a`
  - Dependency Audit: PASS; no known high/critical production vulnerability
  - Release Gate: PASS
  - Backup / Restore Rehearsal: PASS
  - Previous Release Rollback Rehearsal: PASS
  - Next.js ESLint warning: resolved
  - External Provider/API/real telephone calls: 0
  - Railway preparation verification: release gate, lint, typecheck, 237 unit/API/Worker tests,
    Railway-context production build and Web/API/Worker Docker image builds PASS

## Phase 11 PR 1 — 調査・権限基盤

- 状態: COMPLETE / DRAFT PR #13 REVIEW PENDING
- 基準: `origin/master`の`d5a1f88`。open PR #12は未取込。
- 現状分析: `docs/phase11/current-state-analysis.md`
- 権限定義: `docs/phase11/role-permission-matrix.md`
- DB/API/Webへ`operator`（電話担当者）を追加。既存ロールの自動変更なし。
- operatorのFollowup/Handoffは同一Organizationかつ本人割当に限定。
- adminによるoperator作成を許可し、system_admin作成、operatorのユーザー管理・キャンペーン遷移を拒否。
- Webメニューを業務目的別に整理し、5ロールの日本語表示を追加。
- migration: 空DBへ全22件PASS。`UserRole`追加は`IF NOT EXISTS`で既存DBへ安全に追加。
- Prisma format/validate/generate: PASS。
- lint: PASS。今回変更ファイルのformat: PASS。Windowsローカルの全体formatは基準masterの既存改行差分494件を検出するため、GitHub CIで最終判定する。
- typecheck: 全12 workspace PASS。
- Unit/API/Worker: 76 files / 265 tests PASS。Phase 11認可テスト12/12 PASS。
- Dependency audit: `deepmerge-ts`を8.0.0へ固定し、High/Critical 0件（Moderate 1件）。
- E2E、production build: PASS。
- GitHub Actions: run `32221620990` PASS（install、dependency audit、release gate、Prisma、全migration、seed、lint、format、typecheck、265 tests、E2E、build）。
- 実電話、Twilio/OpenAI/Zoom/Calendar等の外部Provider通信: 0件。
- Production関連Feature Flag: すべてfalseのまま。
- PR 2へ進める条件: PR #13のレビュー・masterへのマージ完了。全組織管理API、専用system画面、初期クライアント管理者はPR 2で実装する。

## Phase 10 — Release Readiness

- Railway Mock-only runtime: Web/API/Worker/PostgreSQL/Redis Online; public Web login smoke PASS.
- Initial administrator bootstrap: implemented as `pnpm db:bootstrap-admin`; requires explicit
  confirmation and ephemeral inputs, refuses non-empty identity databases, and records a
  secret-free audit event. Railway execution remains pending.
- Operator test procedure: `docs/testing/railway-mock-only-operator-test.md`.
- Sales-user test procedure: `docs/testing/sales-user-mock-smoke-test.md`.

- Status: IN PROGRESS; only Work A and Work B are started by the Phase 10 instruction.
- Work A progress documents: COMPLETE for the `60ad15a` / CI `30695971040` baseline.
- Work B Mock-only Environment Design: RAILWAY CONFIGURATION PREPARED, not provisioned.
  - Selected platform/region: Railway Singapore for low-cost synthetic-data validation.
  - Services: Web (public HTTPS), private API/Worker, Railway PostgreSQL and Redis.
  - Dockerfiles and service configuration: `deploy/railway/`.
  - API pre-deploy runs `prisma migrate deploy`; production seed is prohibited.
  - Release gate checks the Railway template keeps all eight external flags false, uses Mock
    VoiceProvider and omits Provider credentials.
  - Operator guide: `docs/operations/railway-mock-only-deployment.md`.
  - Local verification: all three Railway Docker images build successfully with Node 22 and
    OpenSSL; no external Provider credential was supplied.
  - Rollback: previous deployment, no down migration, Queue/Outbox/Audit/Emergency Stop preserved.
- Gate A Mock-only production: NO-GO until the Railway project, HTTPS, backups, logs, monitoring,
  alert test, named owners and full operator-flow evidence exist.
- Gate B external Provider activation: NO-GO and out of scope.
- External Provider/API calls and real telephone calls during Phase 10: 0.

## Maintainability remediation Phase 9

- Step 6 — Followup / Zoom Phone modularization: COMPLETE
  - Workflow state, eligibility, assignment, attempt, KPI and Fake Zoom sync are independent.
  - `stage4b2-routes.ts` is registration/composition only.
  - CI run `30611316524`: 230 tests, E2E 8/8, production builds and all checks PASS.
- Step 7 — Handoff modularization: COMPLETE
  - Finalization, pure scoring, append-only feedback, settings and quality are independent.
  - `stage4d-routes.ts` is registration/composition only.
  - CI run `30611765950`: all checks PASS.
- Step 8 — Worker Maintenance modularization: implementation COMPLETE
  - `maintenance.ts` is a 9-line compatibility boundary.
  - Registry, failure reporting and all 12 stable maintenance jobs are independent.
  - Local verification: 237 tests, E2E 8/8 and all production builds PASS.
  - CI run `30612122483`: Prisma checks, migrations, seed, lint, format, typecheck, 237 tests,
    E2E 8/8 and production builds PASS.
- Database schema/migrations: unchanged.
- External Provider/API/real telephone calls: 0.

- Step 1 — Mock Call main-process formal relocation: COMPLETE
- Step 2 — Stage 2 sales-data modularization: COMPLETE
  - Companies: COMPLETE
  - Contacts: COMPLETE
  - Phone Numbers: COMPLETE
  - Tags: COMPLETE
  - Sales Lists: COMPLETE
  - OptOuts: COMPLETE
- `processMockCall` is implemented in
  `apps/worker/src/modules/mock-calls/mock-call.service.ts`.
- `apps/worker/src/mock-call.ts` is a compatibility-export boundary only.
- Mock execution remains hard-wired to `MockVoiceProvider`; production Provider references are
  prohibited by `mock-call-boundary.test.ts`.
- Organization scope, emergency stops, limits, FAX/invalid-number rejection, opt-out,
  idempotency, atomic outcome persistence and Usage Ledger rebuild behavior are unchanged.
- Database schema and migrations: unchanged.
- CI run `30545217383`: Prisma generate/format/validate, all migrations, seed, lint, format,
  typecheck, 190 unit/API tests, E2E 8/8 and production build PASS.
- External Provider/API/real telephone calls: 0.
- Companies routes now use dedicated Route, Controller, Service, Repository and Policy layers.
- `stage2-routes.ts` was reduced from 857 to 71 lines and is now a registration/composition
  boundary.
- Phone audit projections now retain only a masked number and non-sensitive state fields.
- Sales Lists preserve admin/manager mutations, sales-owned preview scope, bulk limits and
  idempotent membership updates.
- OptOuts preserve Company/Phone/Contact/Channel matching and admin-only reasoned release.
- OptOut audits exclude phone and email snapshots.
- CI run `30590755086`: 199 unit/API tests, E2E 8/8 and all verification steps PASS.
- Phase 9 Step 2 is complete; Step 3 is now in progress.

### Phase 9 Step 3 — Stage 3 settings/campaign modularization (historical checkpoint)

- Status: COMPLETE
- Products: COMPLETE
- AI Agents: COMPLETE
- Scenarios / Knowledge / Campaigns / Campaign Targets / Call Jobs: COMPLETE
- Products and AI Agents use dedicated Route, Controller, Service, Repository and Policy layers.
- Published Product Versions remain immutable and version numbering remains unchanged.
- AI Agent organization scope, admin/manager mutation roles, CSRF checks, version numbering,
  draft-only publishing, audit events and response contracts remain unchanged.
- `stage3-routes.ts` reduced from 993 to 837 lines.
- CI run `30597838915`: 201 tests, E2E 8/8 and all verification steps PASS.
- External LLM/Provider/API calls and real telephone calls: 0.

## Maintainability remediation Phase 1 (historical checkpoint)

- PostgreSQL transactional outbox added for company import, mock calls, Twilio limited calls, emergency stops and authorization rollback
- API business state and outbox intent now commit atomically; existing response formats are unchanged
- Worker publisher uses Zod payload validation, deterministic BullMQ job IDs, bounded batches, exponential backoff, terminal failure and stale-lock recovery
- Startup/hourly maintenance repairs queued imports/calls, reserved executions, requested rollbacks and orphan queued campaign targets
- Migration: `20260724010000_phase1_transactional_outbox`
- Focused Outbox DB tests: transaction rollback, Queue failure/redelivery, duplicate-safe job ID, Worker restart and legacy-gap repair
- Empty DB: all 12 migrations, seed and zero Prisma drift PASS
- lint / format / typecheck: PASS
- Unit/API/Worker: 24 files, 101 tests PASS
- E2E: existing 8 tests PASS
- Production build: Web/API/Worker PASS
- GitHub Actions: run `30030010473` PASS for commit `d5371a2`
- External connections and real telephone calls: 0
- At this Phase 1 checkpoint, Phase 2 and later had not started.
- Detailed report: `docs/verification/maintainability-remediation-report.md`

## Stage 4F completion audit (historical checkpoint)

- Checkpoints 1–6: PASS
- Checkpoint 7 was locally PASS; GitHub Actions was still pending at this historical checkpoint.
- Prisma: format / validate / generate PASS
- Empty DB: all 11 migrations + seed PASS; extension, exclusion constraint and zero schema drift confirmed; temporary DB deleted
- lint / format / typecheck: PASS
- Unit/API/Worker: 23 files, 97 tests PASS
- E2E: 8 tests PASS, including Stage 4C–4E integration and 390×844 mobile views
- Production build: Web/API/Worker PASS
- Audit data: 790 rows inspected, forbidden secret/CSV keys 0
- External provider and telephone calls: 0
- Detailed evidence: `docs/verification/stage4f-report.md`
- Remaining at this historical checkpoint included GitHub Actions, deployment, production
  migration and all real-provider tests. GitHub Actions has since passed; deployment and
  real-provider work remain disabled/unexecuted.

## Stage 4A implemented

- `system_admin`と既存の組織`admin`を分離し、組織管理APIからの権限昇格を拒否
- 組織別の実電話承認状態、必須項目、申請・承認・却下・停止・再開・期限管理
- 承認、商材/キャンペーン、地域/時間、上限、再架電、opt-out、電話/FAX、緊急停止、Provider、限定番号を評価するProduction Call Gate
- system/organization/campaign/product/provider単位の緊急停止、管理者限定の理由付き解除、Worker直前再確認
- 日/時間/同時数/時間/予算/限定テスト上限と整数最小通貨単位のMock費用カウンター
- 同意確認済み番号の期限付きallowlistと画面・監査でのマスキング
- Provider共通操作の拡張と、ネットワーク実装を持たず全操作を拒否する`ProductionVoiceProviderStub`
- HMAC Mock Webhookの時刻検証、event ID重複排除、順不同保存、未知eventのサニタイズ保存
- readiness、承認、制限、停止、許可番号、Provider、利用量、拒否理由のAPIと管理画面
- API/Workerの拒否理由と安全操作をサニタイズ済み監査ログへ記録

## Stage 4B-1 code implemented (not activated)

> 以下のMedia Streams未実装という境界はStage 4B-1完了時点の記録です。Stage 4B-2後半で接続コードを追加しましたが、外部接続は無効です。

## Stage 4B-2後半 code implemented (not activated)

- `@fastify/websocket`によるTwilio Media Streams専用endpointと、公式署名・Feature Flag・Stage 4A/4B-1 Gate・組織・execution・同時数の再検証
- query stringを使わないWSS URL、署名付き60秒session token、単回状態遷移、Custom Parametersの機密情報制限
- OpenAI Realtime WebSocket adapter、`audio/pcmu`設定、caller audio、response、cancel、tool result、assistant item truncation、usage/event正規化境界
- PCMU無変換双方向bridge、stream/track/sequence/base64検証、media→mark、mark再生位置、clear、barge-in、古いgeneration破棄
- message rate、pending audio、Twilio/OpenAI buffered amount、connect/idle/max-duration、組織・全体同時数の上限
- stale sessionの`provider_unknown`回収、イベントbatch削除、冪等close、自動再発信なし
- セッション開始・終了・強制終了、フォローアップ割当・完了・取消のサニタイズ監査。音声、raw message、SID、signature、tokenは監査対象外
- 外部接続条件は既定ですべてfalse。実OpenAI/Twilio/Zoom Phone通信と実電話は未実施

## Stage 4C code implemented (not activated)

- `human_followup_tasks`をsource/reason/priority/due/各初回時刻/snooze/attempt/outcome/next action/Zoom fingerprint/versionで拡張
- company/contact/phoneを使う未完了タスク重複防止の検索index、試行idempotency、楽観ロックを追加
- manager/adminの手動割当、salesの受諾・開始・スヌーズ・試行・管理コード付き完了、Workerによるスヌーズ復帰
- none/round-robin/team/campaign固定の自動割当ルールとtransaction/advisory lock
- opt-out・FAX/無効番号・営業可能時間・緊急停止・担当者一致を手動折り返し前に再確認。システム自動発信なし
- アプリ内通知、期限超過・対応速度・接続率・商談化率KPI（母数0はnull）
- `HumanCallingProvider`、Fake/Disabled/Zoom実装、Server-to-Server OAuth memory cache、Call History正規化、429 bounded retry
- Zoom Webhook timestamp/signature/replay-window/deduplication、URL validation、sanitized eventのみ保存
- スマートフォン向け今日/緊急/期限超過/後日タブ、大きい操作ボタン、マスク番号表示
- 旧Call Logs APIではなくCall History系を採用。録音、文字起こし、留守番電話、自動発信、有人転送は未実装

- Twilio Node SDK `6.0.2`をlockfile固定し、Provider固有処理を`TwilioVoiceProvider`へ隔離
- `record=false`、`timeLimit=120`、4種status callback、固定TwiMLと1桁DTMFをコード化
- release/written-approval commit、期間、最大5番号/5件、予算、安全機能falseを固定する一時限定テスト承認モデル
- 単発手動予約API、Worker直前のStage 4A/4B-1 Gate再評価、API不明時の`provider_unknown`保留と自動再発信禁止
- Twilio署名検証、form-urlencoded callback、Call SID相関、追記型event、重複排除、単調state更新
- DTMF 1/2/9/無入力/その他の技術結果分離と、9によるallowlist無効化
- 推定/確定料金の分離、予算予約、Call SIDマスキング、緊急停止キャンセルWorker
- 限定承認・1件手動確認・結果/料金/DTMF/rollback状態の管理画面
- 承認状態遷移、Stage 4A承認、Provider設定、緊急停止、期間を有効化時に再確認し、組織単位rollback APIでTwilioを即時無効化
- Twilio料金見積単価を環境設定化（コード内の固定料金表には依存しない）
- `provider_unknown`の理由付き管理者解決（自動再発信なし）、scope別緊急停止、Fake Provider状態確認によるrollback完了/失敗管理
- PostgreSQL advisory lock＋Serializable transactionによる限定予約競合防止、正規化Webhook fingerprint、期限切れ承認の自動無効化
- 発信元番号のHMAC fingerprint/末尾4桁だけを保存する所有確認管理、限定承認との紐付け、Worker直前一致確認
- Provider不明・署名不正・停止失敗・料金失敗/通貨不一致の組織別incident管理と理由付き解決
- Fake Providerによる確定料金の最大3回再照会、予約額維持、確定/失敗状態管理
- Stage 4B-1完了時点では録音、文字起こし、Media Streams、自由会話AI、SMS、カレンダー、Zoom Phone、有人転送は未実装・無効でした。Media StreamsとRealtime接続コードはStage 4B-2で追加済みですが外部接続は未実施です。

Stage 4B-1のFake Twilio自動検証を追加済み。実Twilio API通信と実電話発信は未実施。

## Implemented

- Stage 0〜2基盤と完了監査を維持
- 組織別の商材、AI担当者、シナリオ、手入力FAQ/ナレッジとdraft/published/archived版管理
- 公開版不変、単調増加version、同一組織参照検証
- start/end、到達不能、遷移先、未定義テンプレート変数を検出するシナリオ検証
- fixture/intentによる外部LLMなしの決定的simulationとopt-out優先分岐
- publishedかつ有効期間内だけを返しentry IDを残すDB検索
- 営業リストの対象スナップショット、FAX/無効/架電不可/番号なし/営業禁止の理由付き除外
- draft→ready→承認→running→paused/resume/cancelの明示的状態遷移
- 対象確定時とWorker直前の営業禁止・電話適格性再判定
- IANA timezoneの時間帯（日跨ぎ対応）、試行、retry、日次、同時実行上限チェック
- MockVoiceProviderによるqualified/opt_out/no_answer/busy/invalid_number/fax_detected結果
- idempotency key、一意制約、attempt/event upsert、BullMQ再配送、stuck reservation回収
- qualifiedの企業状態/次回対応反映、opt-outの同一transaction登録と後続停止、無効/FAX検出時の番号停止
- 商材、AI担当者、シナリオ、FAQ、キャンペーン、模擬ジョブ管理UIと監査ログ

## Safety boundary

- Stage 4B-2のFake realtime会話、イベント正規化、割込み、結果反映、有人フォローアップ管理を実装しました。
- `REALTIME_AI_ENABLED=false`、`TWILIO_MEDIA_STREAMS_ENABLED=false`、`ZOOM_PHONE_INTEGRATION_ENABLED=false`が既定で、APIキー値はコード・DB・ログへ保存しません。
- OpenAI Realtime adapterとTwilio Media Streams endpointは接続コード実装済みです。Feature Flagは無効で、実Realtime・Twilio Media Streams・Zoom Phone通信は未実施です。

- Stage 4B-1のTwilio Providerコードは存在しますが、既定値は`VOICE_PROVIDER=mock`、`PRODUCTION_CALLS_ENABLED=false`で、承認・環境・DB Gateが揃わない限り利用できません。
- Provider入力は末尾4桁以外を伏せた番号だけを受け付け、実番号を拒否する自動テストがあります。
- 今回の実装・静的確認では外部ネットワーク、電話事業者、外部LLM、録音、文字起こし、カレンダー、有料APIへ接続していません。
- Mock fixture指定はproductionで拒否します。

## Verification

### Stage 4B-2（2026-07-19、Fake限定の途中検証）

- Prisma format / validate / generate: PASS
- lint: PASS
- TypeScript typecheck: PASS（最終修正後に再実行）
- Stage 4B-2 unit: 5/5 PASS（media正規化、payload上限、sequence replay拒否、WSS/flag、barge-in、tool制限、OpenAI fail-closed）
- Production build: PASS（Web/API/Worker、`/realtime-conversations`を含む）
- 全Unit/API/Worker・E2E・空DB migration: 今回は未実行（ユーザー指示によりテストは後工程）。Stage 4B-2完了判定前に必要
- 外部OpenAI/Twilio/Zoom Phone通信・実電話発信: 未実施

### Stage 4B-2後半（2026-07-19、Fake Transport短時間検証）

- Prisma format / validate / generate: PASS
- 既存Stage 4B-2 migration整合: PASS（後半はschema変更なしのため追加migrationなし）
- lint / typecheck: PASS
- Realtime対象Unit: 14/14 PASS（4 files）
- 検証内容: flag false時socket生成0、PCMU設定、双方向音声、media/mark/clear、barge-in/cancel/truncate、旧generation破棄、payload/sequence/stream/rate/backpressure、冪等close
- Stage 4B-1主要API/Worker回帰: 12/12 PASS
- 対象テスト合計: 26/26 PASS（6 files）
- Production build: PASS（Web/API/Worker）
- 全Unit、全E2E、空DB全migration、実CI: 後工程。PASS扱いにしない
- 実OpenAI、実Twilio、実Zoom Phone、実電話: 未実施

### Stage 4C（2026-07-20、Fake/静的短時間検証）

> 以下の「DB適用未実行」はStage 4C単独実装時点の履歴です。Stage 4D開始時に同migrationを開発DBへ適用し、対象DB回帰を実行済みです。

- Prisma format / validate / generate: PASS
- migration `20260720010000_stage_4c_zoom_followup`: 作成・schema整合PASS、DB適用はDocker Desktop停止のため未実行
- lint / TypeScript typecheck: PASS
- Fake Zoom/Provider Unit: 10/10 PASS
- DB不要の主要回帰を含む対象テスト: 27/27 PASS（7 files）
- Feature Flag false時のZoom transport生成0、結果正規化、ambiguous fixture、Webhook署名/期限、OAuth失敗、429 bounded retry: PASS
- Web/API/Worker production build: PASS
- Stage 4C DB統合/API/Workerテスト、全Unit、全E2E、空DB全migration、実CI: 未実行。PASS扱いにしない
- 実Zoom/OpenAI/Twilio、実電話、Marketplace App、Webhook登録: 未実施

## Stage 4D code implemented (not activated)

- Stage 4C migration `20260720010000_stage_4c_zoom_followup`を開発DBへ適用し、Prisma validate/generateをPASS
- migration `20260720030000_stage_4d_sales_handoff`を追加・開発DB適用PASS
- 構造化handoffカード、追記型feedback、version付き設定、保持期限を追加。録音・全文・raw event・連絡先は保存しない
- 厳格なRealtime `finalize_sales_handoff` function schema、Zod検証、配列上限・重複排除、200文字制限、禁止情報拒否を追加
- lead scoreをサーバー側rule version 1で算出し、理由コードを保存。opt-outはscoreを無効化して最優先
- finalizeをsession/versionで冪等化し、follow-upを既存のunique制約で重複防止。FAX-onlyではタスクを作らない
- low confidenceは`manual_review`のdraftへ正規化。営業担当者の訂正は元カードを上書きしない
- 組織境界・role・sales担当範囲・CSRFを適用したカード、feedback、品質、設定、Fake simulation APIを追加
- スマートフォン向け引継ぎカード画面と、期限超過カード・feedbackを削除するWorker cleanupを追加
- Stage 4C DB回帰でadvisory lockのvoid復元不具合を検出し、`queryRaw`から`executeRaw`へ修正
- Stage 4D DB対象テスト: 7/7 PASS（tool拒否、score、冪等、禁止情報、組織境界、FAX、opt-out、low confidenceを包含）
- Stage 4B/Realtime/HumanCalling主要回帰を含む選択テスト: 32/32 PASS（5 files）
- Prisma format / validate / generate、Stage 4C・4D migration適用、lint、typecheck: PASS
- Web/API/Worker production build: PASS（当時のNext.js ESLint plugin未検出警告は
  2026-08-01に解消済み）
- `VOICE_PROVIDER=mock`および全外部Feature Flag falseを維持。外部通信・実電話: 0回
- format check: PASS（既存4ファイルの書式差分も整形）。全Unit、全E2E、空DB全migration、GitHub CIは未実行でPASS扱いにしない

## Stage 4E code implemented (external calendar not activated)

- Stage 4Dの管理者向け会話品質・引継ぎ設定画面を補完
- migration `20260720050000_stage_4e_appointments`を追加し、開発DB適用PASS。初回の`tstzrange`不変性エラーはDDL rollback確認後、UTC保存のPrisma型に合う`tsrange`へ修正して再適用
- appointment policy version、勤務時間、例外日、内部予約台帳、追記型event、Stage 4C/4D appointment参照を追加
- 署名付き短命slot token、最大3候補、IANA timezone、minimum notice、advance limit、勤務時間、例外、既存予約、前後bufferを考慮する決定的slot計算を追加
- PostgreSQL `btree_gist` exclusion constraintにより、held/confirmedのbuffer込み同時予約をDBで拒否
- 冪等hold、明示確認必須confirm、楽観lock、cancel/complete/no-show/reschedule、期限切れhold Workerを追加
- opt-outとsystem/organization/campaign緊急停止をholdより優先。confirmed時だけhandoff/follow-upへ関連付け
- `CalendarProvider`、Internal/Fake/Disabled実装を追加。Google/Microsoft/Zoom HTTP adapterは未実装
- Realtime用find/hold/confirm/cancelの厳格なfunction schemaを追加。外部Feature Flagはfalse
- organization scope、sales担当範囲、CSRF、role、監査、KPI（母数0はnull）のAPIを追加。system_adminを通常予約roleから除外
- スマートフォン向け商談予定画面、管理者向けpolicy/KPI画面、Stage 4D会話品質画面を追加
- Stage 4E/4D/Realtime/HumanCalling対象テスト: 29/29 PASS（5 files）。DST、同時hold競合、冪等性、明示確認、楽観lock、opt-out、Worker no-op、外部Provider無効を包含
- Prisma format/validate/generate、migration status、typecheck、format check、API/Worker/Web production build: PASS
- lint初回はStage 4Dの未使用import 2件を検出して修正し、最終再実行PASS
- `CALENDAR_INTEGRATION_ENABLED=false`、`AI_APPOINTMENT_BOOKING_ENABLED=false`。実Google/Microsoft/Zoom/OpenAI/Twilio/実電話通信: 0回
- 全Unit、全E2E、空DB全migration、GitHub Actions実CI、実Provider、実招待送信は未実行・未実装でPASS扱いにしない

### Stage 4B-1（2026-07-19、Fake/Mockローカル検証）

- Prisma format / validate / generate: PASS
- 空DB migration（Stage 0〜4B-1、全7 migration）: PASS（一時DB削除済み）
- lint / format check / TypeScript typecheck: PASS
- Unit/API/Worker: 57/57 PASS（15 files、Fake Twilio 19件を含む）
- E2E: 6/6 PASS（Stage 4B-1 fail-closed画面・未承認発信拒否を含む）
- Production build: PASS
- Fake Twilio: request、record=false、120秒、callback、署名、TwiML、DTMF、順不同・重複、料金、緊急停止をPASS
- GitHub Actions: 未実行（push/PRなし）
- Twilio API通信・実電話発信: 未実施

### Stage 4A完了時の既存結果（Stage 4B-1変更前）

- Prisma format / validate / generate: PASS
- Existing DB migration: Stage 4A migration適用 PASS
- Empty DB migration: Stage 0〜4Aの5 migration PASS（`sales_ai_stage4a_final_verify`削除済み）
- lint / format check / typecheck: PASS
- Unit/API/Worker: 41/41 PASS（13 files）
- Stage 3 E2E: PASS（公開設定、無効シナリオ拒否、FAQ公開検索、FAX/opt-out除外、対象確定、承認、Mock qualified/opt-out、pause、監査）
- Stage 4A E2E: PASS（readiness、上限、allowlist、緊急停止、system_admin解除、実電話無効表示）
- 全E2E: 5/5 PASS（health、Stage 1、Stage 2、Stage 3、Stage 4A）
- Production build: Web/API/Worker PASS
- CI相当: frozen install、Prisma format/validate/generate、全migration、seed（4 roles）、lint、format check、typecheck、Unit/API/Worker、全E2E、production buildの各チェックPASS

## Limits and environment

- `STAGE3_JSON_MAX_BYTES=200000`, `SCENARIO_MAX_NODES=200`
- `KNOWLEDGE_ENTRY_MAX_CHARS=10000`, `MOCK_RUN_BATCH_LIMIT=10`
- `MOCK_WORKER_CONCURRENCY=2`, `STUCK_RESERVATION_MINUTES=15`
- `CALL_EVENT_RETENTION_DAYS=90`
- Stage 0〜2の`DATABASE_URL`, `REDIS_URL`, CSV/Session設定も継続

## Maintainability remediation Phase 2

- Status: complete.
- ImportRow now separates requested `action` from `pending/processing/success/skipped/failed`
  processing results.
- Each row rechecks duplicates and atomically commits company, phone, contact, result and audit.
- Worker processing uses bounded 200-row pages, continues after row failure and stops on
  cancellation.
- Failed-row retry preserves successful rows and creates a fresh Outbox delivery.
- CSV formula neutralization and organization scope remain enforced.
- Focused DB tests: 3/3 PASS.
- Prisma format/validate/generate, all 13 migrations on an empty DB, seed and zero schema drift:
  PASS.
- lint/format/typecheck: PASS.
- Unit/API/Worker: 25 files, 106 tests PASS.
- Existing E2E: 8/8 PASS.
- Web/API/Worker production build: PASS.
- Mapping/duplicate preview preparation is delivered through Outbox and processed by the Worker in
  200-row pages with one batched duplicate lookup per page.
- The 10,000-row API test returns `202`, leaves all rows untouched and creates one pending mapping
  event.
- GitHub Actions: run `30063711663` PASS for final Phase 2 commit `2080a39`.

## Maintainability remediation Phase 3

- Status: complete.
- CallJob/CampaignTarget stop transitions use a pure state machine and atomic updates.
- Emergency and campaign stops no longer leave CampaignTarget in `queued`.
- FAX, missing/invalid phone and opt-out result in permanent target exclusion.
- Temporary provider failure results in CallJob `failed` and target `retry_wait`.
- Migration `20260724030000_phase3_usage_ledger` adds unique execution accounting.
- Usage counters can be rebuilt from the ledger and completed-job redelivery performs recovery
  without repeating a call outcome.
- Focused state/accounting tests and all 115 Unit/API/Worker tests: PASS.
- Prisma format/validate/generate, all 14 migrations on an empty DB, seed and zero schema drift:
  PASS.
- lint/format/typecheck, all 8 E2E and Web/API/Worker production build: PASS.
- GitHub Actions: run `30068669227` PASS for Phase 3 commit `ac2398c`.
- External Provider/API/real telephone calls: 0.

## Maintainability remediation Phase 4

- Status: complete.
- API and Worker now share production fail-fast validation from `@sales-ai/validation/env`.
- Production rejects missing core endpoints/secrets, local or `.example.local` endpoints, repository
  placeholder secrets, `replace-with-...`, `uncommitted` and an API loopback bind address.
- Twilio, OpenAI Realtime and Zoom values become required only when their corresponding feature is
  enabled.
- Validation errors identify variable names without including rejected secret values.
- Worker no longer has an independent development `DATABASE_URL` fallback.
- Development/test local defaults remain available.
- Environment validation: 18 focused tests PASS.
- Unit/API/Worker: 26 files, 130 tests PASS with local workers limited to two. An initial
  unrestricted run had one existing API health timeout under host contention; isolated and bounded
  reruns passed.
- Prisma format/validate/generate, all 14 migrations on an empty DB, E2E seed and zero schema drift:
  PASS.
- lint/format/typecheck, all 8 E2E and Web/API/Worker production build: PASS.
- GitHub Actions: run `30084030037` PASS for Phase 4 commit `f14d7fe`.
- External Provider/API/real telephone calls: 0.

## Maintainability remediation Phase 5

- Status: complete.
- Appointment transitions use an explicit state machine with terminal-state protection.
- Completion/no-show before `startAt` and cancellation after the policy deadline are rejected.
- Rescheduling now passes through `confirmed -> reschedule_requested -> confirmed`.
- Appointment update/version, AppointmentEvent, notification, and applicable handoff/follow-up
  updates commit in one transaction; a forced Event failure test proves rollback.
- Slot token JSON is strictly Zod-validated for UUIDs, timestamps, IANA timezone, expiry and time
  order.
- Policy/rule validity periods, notice, advance, duration and hold TTL are applied during slot
  generation and rechecked during hold/reschedule.
- Cross-organization campaign, company, contact, assignee, realtime session, handoff card and
  follow-up task references are rejected by the service.
- Migrations `20260724050000_phase5_appointment_integrity` and
  `20260724051000_phase5_appointment_period_checks` add state/period constraints, overlap handling,
  Appointment relations and foreign keys.
- Appointment-focused tests: 28 PASS. Unit/API/Worker: 27 files, 150 tests PASS.
- Prisma format/validate/generate, all 16 migrations on an empty DB, E2E seed and zero schema drift:
  PASS.
- lint/format/typecheck, all 8 E2E (including invalid transition HTTP 409) and Web/API/Worker
  production build: PASS.
- GitHub Actions: run `30089496742` PASS for Phase 5 commit `4a9714a`.
- At this Phase 5 checkpoint, Phase 6–8 were not part of the completed scope.
- External Provider/API/real telephone calls: 0.

## Maintainability remediation Phase 6

- Status: complete.
- Twilio webhook handling now verifies the signature before Zod validation and never creates a
  ProviderWebhookEvent for invalid signatures or invalid callback values.
- Valid callbacks are stored as `received` together with a transactional `provider-webhook`
  Outbox event; BullMQ delivers them with three attempts and exponential backoff.
- Call SID association, monotonic sequence handling, call state/cost updates, budget audit logs,
  budget suspension and the final `processed` transition commit in one database transaction.
- A processing failure rolls back all call/cost/audit changes, records a sanitized failure code and
  leaves the event `retrying`; exhaustion changes it to `failed` and opens one deduplicated,
  sanitized incident.
- Migration `20260728010000_phase6_webhook_reliability` adds processing attempt metadata,
  `last_webhook_sequence` and incident deduplication.
- Acceptance tests:
  - `rejects an invalid signature and stores only a sanitized audit record`: PASS.
  - `rejects an invalid price without permanently saving the callback`: PASS.
  - `deduplicates callbacks and never rewinds a terminal state`: PASS.
  - `rolls back a failed call update and succeeds on BullMQ redelivery`: PASS.
  - `opens only one sanitized incident when retry attempts are exhausted`: PASS.
- Prisma format/validate/generate and migration deploy: PASS.
- lint / format check / typecheck: PASS.
- Unit/API/Worker: 27 files, 153 tests PASS.
- E2E: 8/8 PASS.
- Web/API/Worker production build: PASS.
- GitHub Actions: run `30343446120` PASS for Phase 6 commit `7df092e`.
- Phase 6 completion did not include later phases. External Provider/API/real telephone calls: 0.

## Maintainability remediation Phase 7

- Status: complete.
- Removed all Worker maintenance `setInterval` execution and registered 12 stable BullMQ Job
  Schedulers for health, import cleanup, stuck reservation recovery, call-event cleanup, realtime
  cleanup, snoozed follow-up reopening, handoff cleanup, appointment maintenance, Twilio
  authorization expiry, Twilio cost reconciliation, Outbox publishing and usage-counter rebuild.
- Every scheduler has three attempts, exponential backoff, an explicit execution timeout, retained
  completed/failed history and stable scheduler identity.
- Redis locks prevent concurrent execution of the same task; repeated Worker startup safely
  upserts rather than duplicates schedulers.
- Exhausted jobs write sanitized structured operational errors and one deduplicated production
  incident when PostgreSQL is available. Incident-write failure is also safely logged without an
  unhandled rejection.
- `SIGINT`/`SIGTERM` now use guarded graceful shutdown: active Worker, Queue, health key, Prisma and
  Redis close in order, with a nonzero exit code on failure.
- Focused tests:
  - `upserts every required task with retry, backoff and retained history`: PASS.
  - `creates stable Job Schedulers in Redis and can recreate them after reconnect`: PASS.
  - `retains retry failures and creates one sanitized incident only at exhaustion`: PASS.
- lint / format check / typecheck: PASS.
- Unit/API/Worker: 28 files, 156 tests PASS.
- E2E: 8/8 PASS.
- Web/API/Worker production build: PASS.
- Operations guide: `docs/runbooks/worker-maintenance.md`.
- GitHub Actions: run `30347090048` PASS for Phase 7 commit `79ec2be`.
- At this Phase 7 checkpoint, Phase 8 had not yet changed. External Provider/API/real telephone
  calls: 0.

## Maintainability remediation Phase 8 / additional fix 5.1

- Status: first incremental module split complete; Phase 8 remains incremental by instruction.
- Extracted callable-time business policy into the pure shared `callable-window` module.
- Production Gate, Mock call execution and human follow-up now use the same implementation.
- Overnight windows belong to their starting weekday: Monday 22:00–02:00 correctly includes
  Tuesday 01:00 for Monday, not Tuesday.
- Invalid time strings, invalid dates and invalid timezones fail closed.
- Focused callable-window/Production Gate/Mock tests: 11 PASS.
- lint / format check / typecheck: PASS.
- Unit/API/Worker: 29 files, 159 tests PASS.
- E2E: 8/8 PASS.
- Web/API/Worker production build: PASS.
- GitHub Actions: run `30348610326` PASS for commit `408ec82`.
- At this 5.1 checkpoint, additional fixes 5.2–5.4 had not started. External
  Provider/API/real telephone calls: 0.

## Maintainability remediation Phase 8 — Import module

- Status: implementation and verification complete.
- Removed all eight Import endpoints and their read helper from `stage2-routes.ts`.
- Added dedicated Import route, controller, service, repository, policy, schemas, types and
  transactional Outbox modules without changing API URLs, payloads, responses or error codes.
- Moved the Worker Import engine under `jobs/imports`, added mapping/processing/retry/recovery job
  boundaries and queue-payload validation, and retained the old path as a compatibility export.
- Database schema and migrations: unchanged.
- Focused Import API/Worker/boundary tests: 17 PASS, including 10,000-row asynchronous mapping,
  atomic rollback, failed-row-only retry and cleanup.
- Prisma generate / format / validate: PASS.
- lint / format check / typecheck: PASS.
- Unit/API/Worker/Web config: 32 files, 174 tests PASS.
- E2E: 8/8 PASS.
- Web/API/Worker production build: PASS.
- External Provider/API/real telephone calls: 0.
- Implementation commits: API `9f085ae`; Worker `aa75fad`.
- Documentation commit: `2e0d7c1`; GitHub Actions run `30412329357` PASS.
- Next Phase 8 slice: common typed error mapping; Appointment and later modules are not changed.

## Additional fix 5.2 — Next.js API destination

- Status: implementation and local verification complete.
- Replaced the fixed Next.js rewrite destination with the validated `API_INTERNAL_URL`.
- Only `NODE_ENV=development` may omit the variable and use
  `http://127.0.0.1:3001`; test and production fail fast when it is absent.
- HTTP(S) is required. Credentials, query strings and fragments are rejected, and trailing
  slashes are normalized before `/api/v1/:path*` is appended.
- `.env.example` and GitHub Actions now declare the internal API URL explicitly.
- Focused `resolveApiInternalUrl` tests: 8 PASS.
- lint / format check / typecheck: PASS.
- Unit/API/Worker/Web config: 30 files, 167 tests PASS.
- E2E: 8/8 PASS.
- Web/API/Worker production build: PASS.
- GitHub Actions: run `30350328162` PASS for implementation commit `d57079c`.
- At this 5.2 checkpoint, additional fixes 5.3–5.4 had not started. External
  Provider/API/real telephone calls: 0.

## Additional fix 5.3 — Manager authorization scope

- Status: implementation and local verification complete.
- Accepted organization-wide manager scope in ADR
  `docs/decisions/0006-manager-organization-scope.md`, consistent with the Stage 2 and Stage 3
  specifications.
- Team membership and `Team.managerUserId` are assignment/responsibility metadata, not an
  authorization boundary. Authenticated organization scope remains mandatory for all data.
- Managers may list organization users and change only `sales` Team assignments; they cannot
  administer Teams, change non-sales users, manage user lifecycle, update organization settings,
  or reference another organization's Team.
- Focused authorization test
  `gives managers organization-wide sales assignment without Team administration rights`: PASS.
- lint / format check / typecheck: PASS.
- Unit/API/Worker/Web config: 30 files, 167 tests PASS.
- E2E: 8/8 PASS.
- Web/API/Worker production build: PASS.
- GitHub Actions: run `30352605396` PASS for implementation commit `feab23e`.
- At this 5.3 checkpoint, additional fix 5.4 had not started. External Provider/API/real telephone
  calls: 0.

## Additional fix 5.4 — Scenario structural validation

- Status: implementation and local verification complete.
- Scenario validation now reports duplicate node keys, edges, default branches and per-node
  priorities; missing references; unreachable nodes; outgoing `end` edges; and node-type-specific
  configuration omissions.
- Every reachable node must retain a route to `end`; depth is limited to 50.
- Cycles require an integer `config.maxCycles` from 1 through 10 and must retain an exit path.
  Simulation enforces the configured visit limit and uses the next eligible exit branch.
- Focused scenario validation/API tests: 7 PASS.
- lint / format check / typecheck: PASS.
- Unit/API/Worker/Web config: 30 files, 171 tests PASS.
- E2E: 8/8 PASS.
- Web/API/Worker production build: PASS.
- GitHub Actions: run `30407749636` PASS for implementation commit `64acbb5`.
- Additional fixes 5.1–5.4 are complete. External Provider/API/real telephone calls: 0.

## Temporary implementation / known issues

- Stage 4B-2は接続コードとFake Transport検証まで完了しています。外部設定、書面承認、実Provider疎通、総合監査は未完了です。
- Zoom PhoneはProvider/OAuth/Webhook/履歴照合コードまで実装済みですが、外部Feature Flagは無効で実アカウント接続は未実施です。
- Stage 4B-2の全API/E2E、保持期限cleanup、監査ログmutation網羅は完了監査で追加確認が必要です。

- FAQ検索はPostgreSQLの決定的な部分一致で、embedding/RAGはStage 3対象外です。
- シナリオUIはフォームで標準graphを作る簡易版で、ドラッグ式エディタではありません。
- Mock実行は1件ずつで、実通話相当の予測ダイヤラーではありません。
- call eventは`CALL_EVENT_RETENTION_DAYS`より古いものをWorkerの定期cleanupで削除します。
- 上記の未確認記録は各Stage単独実装時点の履歴です。最新GitHub Actions run
  `30407749636`はPASSしています。

## Stage 4 gate

実電話を有効にする前に、対象国法令、発信時間、AI開示、録音/同意、営業禁止責任者、番号本人確認、Provider選定、緊急停止、発信上限、越境移転、有人転送、限定テストの書面承認を決定し、GitHub Actions実CIを成功させる必要があります。これらが未決定のまま外部Providerを追加・有効化しません。

- 承認記録テンプレート: `docs/decisions/0003-stage-4-production-call-approval.md`
- 現在の承認状態: Pending approval（実Provider接続・実番号発信は禁止）
- Stage 4A実装指示書: 確認・実装済み
- Stage 4A technical readiness: completed locally（実電話は無効）
- GitHub Actions: run `30407749636` PASS（実Provider接続の承認を意味しない）
- Stage 4B開始条件: 対象法令、Provider、AI開示、録音/文字起こし同意、発信条件、責任者、限定対象、受入・rollback、書面承認を確定すること

## Phase 8 — Mock Call module boundary

- Status: complete.
- Split dispatch, stop-state persistence, execution policy, Usage Ledger counter rebuild and
  reservation recovery into `modules/mock-calls` and `jobs/mock-calls`.
- Worker dispatch and maintenance now enter through dedicated Job boundaries.
- CallJob/CampaignTarget atomic stop updates, Usage Ledger uniqueness, completed-job redelivery
  recovery and Mock Provider-only dispatch are unchanged.
- Database schema and migrations: unchanged.
- Local Worker typecheck, focused lint/format and 7 pure state-machine tests: PASS.
- GitHub Actions run `30524992174`: full pipeline PASS, including 186 tests, E2E 8/8 and
  production builds.
- Implementation commit: `76c16b1`.
- External Provider/API calls and real telephone calls: 0.
- Next Phase 8 slice: Production Call / Twilio service split.

## Phase 8 — Production Call / Twilio modularization

- Status: complete.
- Worker dispatch, rollback/authorization expiry, cost reconciliation, Provider creation and
  persistence boundaries now live under `modules/production-calls`; dedicated Worker Job adapters
  are registered.
- API Production Gate blockers, DTMF/state mapping, budget thresholds and Provider construction
  are independently testable module boundaries.
- Existing production fail-closed checks, maximum-five-call limit, destination reuse prevention,
  budget reservation, emergency rollback and injected Fake Provider tests remain unchanged.
- Worker implementation commit `a7fb9c5`; GitHub Actions run `30526940705` PASS.
- API policy implementation commit `c3132e9`; GitHub Actions run `30527407882` PASS.
- Database schema and migrations: unchanged. External Provider calls and real telephone calls: 0.
- API manual reservation Service and Twilio Webhook/incident Services are now extracted.
- Reservation commit `e1aa0d2`; GitHub Actions run `30528418820` PASS.
- Webhook/incident commit `84631c1`; GitHub Actions run `30528857700` PASS.
- `stage4b-routes.ts` reduced from 933 lines before this split to 558 lines.
- Source-number/incident Controller commit `935b37c`; GitHub Actions run `30529663612` PASS.
- Authorization/real-call Controller commit `5eea9b7`; GitHub Actions run `30530063878` PASS.
- `stage4b-routes.ts` is now a 75-line registration/composition boundary.
- Production Call/Twilio modularization has no remaining implementation items.
- At this checkpoint, the next slice was Worker bootstrap/registry; it is completed below.

## Phase 8 — Worker bootstrap and Job Registry

- Status: complete.
- Split Prisma creation, Redis/Queue creation, Worker/handler registration, scheduler
  registration, graceful shutdown and main composition under `apps/worker/src/bootstrap`.
- `index.ts` is now a two-line entry point.
- Replaced conditional Job dispatch with an explicit Job Name Registry covering imports, Mock
  Call, Production Call, emergency stop, Provider Webhook and all maintenance jobs.
- Unknown jobs emit only a sanitized Job name; payload data is never logged.
- Scheduler names, upsert semantics, retries, retained history and reconnect recovery are
  unchanged.
- Graceful shutdown still closes Worker, removes the health key, closes Queue/Prisma and
  disconnects Redis while retaining the first failure.
- Focused Registry tests: 2 PASS.
- Implementation commit `641d3de`; GitHub Actions run `30534578152` PASS with 188 tests, E2E 8/8
  and all production builds.
- Database schema and migrations: unchanged. External Provider/API/real telephone calls: 0.
- Phase 8 implementation work: complete.

## Phase 9 Step 3 — Stage 3 settings and campaign modularization

- Status: COMPLETE.
- Products, AI Agents, Scenarios, Knowledge, Campaigns, Campaign Targets and Call Jobs are split
  into Route, Controller, Service, Repository and Policy-oriented domain boundaries.
- `stage3-routes.ts` was reduced from 993 lines to a 27-line registration/composition boundary.
- Scenario validation/simulation and Campaign Target eligibility now live in their owning domain
  modules; `stage3-services.ts` contains compatibility exports only.
- Organization scope, sales-owner scope, immutable published versions, FAX/opt-out eligibility,
  mock-call idempotency, CSRF, audit actions and API response contracts are preserved.
- Database schema and migrations: unchanged.
- Final implementation commits: Call Jobs `a474b60`; service relocation `137d643`.
- GitHub Actions run `30601052065`: PASS.
  - Prisma generate / format / validate: PASS.
  - All migrations and seed against the CI database: PASS.
  - lint / format / typecheck: PASS.
  - Unit/API/Worker/Web configuration: 49 files, 206 tests PASS.
  - E2E: 8/8 PASS.
  - Web/API/Worker production build: PASS.
- External LLM/Provider/API calls and real telephone calls: 0.
- Next Phase 9 step: Step 4 production-safety modularization. Not started.

## Phase 9 Step 4 — Production Safety modularization

- Status: COMPLETE.
- Production Approval, Production Call Policy, Emergency Stop, Provider Configuration, Test
  Allowlist, Production Gate Decision/Usage, Readiness and Mock Webhook now have dedicated module
  boundaries under `modules/production-safety`.
- `stage4-routes.ts` was reduced from 704 lines to a 24-line registration/composition boundary.
- system_admin/organization-admin separation, emergency-stop transaction and scope, Provider
  fail-closed behavior, allowlist consent/expiry, Gate reason codes, limits and sanitized webhook
  audit behavior are preserved.
- Implementation commits: `209730b`, `abfefc3`, `1518a0f`, `3bf1910`, `beeeaca`, `570f870`,
  `98bdb34`, `98582b0`.
- Database schema and migrations: unchanged. External Provider/API and real telephone calls: 0.
- Final CI run `30603452487`: PASS.
  - Prisma generate / format / validate, all migrations and seed: PASS.
  - lint / format / typecheck: PASS.
  - Unit/API/Worker/Web configuration: 57 files, 217 tests PASS.
  - E2E: 8/8 PASS.
  - Web/API/Worker production build: PASS.
- Next Phase 9 step after final PASS: Step 5 Realtime / Media Streams modularization.

## Phase 9 Step 5 — Realtime / Media Streams modularization

- Status: COMPLETE.
- Realtime Session, Fake Simulation, Media Stream, Token and Protocol now live under
  `modules/realtime`.
- `stage4b2-services.ts` and `stage4b2-media.ts` are compatibility-export boundaries only.
- Media Stream Route is a 12-line registration boundary; WebSocket Controller is 195 lines.
- Feature flags remain fail-closed. Size/rate/duration/pending-audio limits, barge-in generation
  control, Production Gate recheck, short-lived tokens and Twilio signature checks are preserved.
- Raw audio, raw Provider messages, SID, signatures and tokens are not persisted by the new
  boundaries.
- Focused Realtime/API boundary tests: 14 files, 24 tests PASS.
- GitHub Actions run `30610188739`: PASS.
  - Prisma checks, all migrations and seed: PASS.
  - lint / format / typecheck: PASS.
  - Unit/API/Worker/Web configuration: 67 files, 227 tests PASS.
  - E2E: 8/8 PASS.
  - All production builds: PASS.
- Database schema/migrations unchanged; real OpenAI/Twilio calls and real telephone calls: 0.
- `stage4b2-routes.ts` still contains Followup/Zoom routes assigned to Step 6.

## Release security audit and mock-only rehearsal gate

- Status: local verification COMPLETE; production deployment remains **NO-GO**.
- Production dependency advisories were remediated by upgrading Next.js to `15.5.21` and
  overriding affected transitive `fast-uri`, `find-my-way`, `postcss` and `sharp` versions.
  `pnpm audit --prod --audit-level high`: PASS, no known vulnerabilities.
- Audit-field redaction now normalizes key spelling before matching, covering variants such as
  `api_key` and `auth-token`; the Stage 1 audit test verifies password, Cookie, session, CSRF,
  API-token and raw-message values are absent.
- `pnpm release:check` verifies CI and `.env.example` use `VoiceProvider=mock`, keep eight
  external/production feature flags disabled and leave ten external credentials blank.
- CI now runs both the production dependency audit and the release safety gate.
- Local verification:
  - Prisma generate and all 17 existing migrations: PASS.
  - lint / format / typecheck: PASS.
  - Unit/API/Worker tests: 70 files, 237 tests PASS.
  - E2E: 8/8 PASS.
  - Web/API/Worker production build: PASS.
  - External Provider/API calls and real telephone calls: 0.
- GitHub Actions run `30629304033`: PASS.
  - Production dependency audit and release safety gate: PASS.
  - Prisma format/validate/generate, empty CI database migrations and seed: PASS.
  - lint / format / typecheck, 237 tests, E2E 8/8 and all production builds: PASS.
- Mock-only rehearsal instructions: `docs/operations/release-rehearsal.md`.
- Go/No-Go decision and remaining operational prerequisites:
  `docs/operations/release-go-no-go.md`.
- Technical CI condition for the next approved work item: satisfied. Production deployment still
  requires the written operational approvals and provider activation prerequisites listed in the
  Go/No-Go document.

## Isolated database backup/restore rehearsal

- Status: COMPLETE locally.
- Added `pnpm rehearsal:database`, which refuses non-local PostgreSQL hosts and operates only on
  fixed disposable rehearsal database names.
- Verified an empty database migration through all 17 migrations, development seed, custom-format
  backup, restore into a second database and completed-migration count equality.
- Result: source migrations 17, restored migrations 17, external calls 0.
- Temporary dump and both rehearsal databases are removed in the cleanup path.
- Remaining release work requiring external action: environment-specific monitoring/backup
  ownership, operational/legal approvals and separately approved Provider activation.

## Previous-release startup and rollback rehearsal

- Status: COMPLETE locally.
- Candidate `f7261cc` was checked against previous release candidate `dadf6b3` in a detached,
  temporary worktree.
- The current rehearsal database was dumped and restored into the isolated
  `sales_ai_rollback_rehearsal` database; the old release found all 17 migrations applied and no
  pending migration.
- Old-release Web/API/Worker startup and health-backed E2E: 8/8 PASS.
- Old-release production build: PASS.
- Cleanup verified: temporary worktree, dump and isolated database remaining 0.
- External Provider/API calls and real telephone calls: 0.
- Operational owners, environment monitoring/backups, tabletop exercise and legal approvals
  remain external No-Go conditions.

## CI runtime and Next.js lint warning remediation

- Status: COMPLETE.
- Added `@next/eslint-plugin-next` 15.5.21 to the repository-root flat ESLint configuration,
  including Core Web Vitals rules; App Router does not run the Pages-only link rule.
- Next.js build-time lint duplication is disabled because the explicit repository-wide `pnpm
lint` remains a required CI gate before build.
- GitHub Actions were upgraded from Node.js 20-based checkout/setup actions to
  `actions/checkout@v6`, `pnpm/action-setup@v6` and `actions/setup-node@v6`; application tests
  remain pinned to Node.js 22.
- Local lint, format, typecheck and production build: PASS; the previous Next.js plugin warning is
  absent.

## Stage 4A completion audit

- 専用UI: 承認作成/申請/判断/停止/再開、Provider設定、利用量/Mock費用、Gate拒否一覧、readinessを実装・build確認済み。
- 完全E2E: 必須項目不足拒否→完全draft→申請→`system_admin`承認→上限/allowlist/Mock Provider設定→Production Call Gate通過をPASS。
- Webhook再試行: `mock.fail_once`をBullMQへ最大3回投入し、初回失敗→再配送成功→重複実行無害化をWorkerテストでPASS。
- ローカルStage 4A完了条件: PASS。
- GitHub Actions実CI: run `30407749636` PASS。実Provider接続・実電話の承認状態とは分離して
  記録する。

## Headless AI Call Engine — Phase API-1

- Status: COMPLETE LOCALLY.
- Added organization-scoped Integration Clients, one-time API key issuance with hash-only storage,
  scopes, sandbox/production separation and Call Profiles.
- Added `GET /api/external/v1/call-profiles` and idempotent `POST /api/external/v1/calls` under the
  separately authenticated `/api/external/v1` boundary.
- Single-call requests enforce active client/profile, environment, scope, strict input/context
  limits, phone validation, OptOut, call window, daily/concurrent limits and Emergency Stop.
- Production external calls fail closed even with `calls:production`; sandbox dispatch uses only
  Transactional Outbox, BullMQ and `MockVoiceProvider`. Raw phone numbers and API keys are not
  persisted.
- Worker repeats mutable Emergency Stop, OptOut and call-window checks immediately before Mock
  dispatch.
- Tests: `integration-security.test.ts` 7/7 PASS (key hashing/prefixes, timezone timestamp,
  forbidden fields, context limits and request fingerprints).
- Prisma format/generate: PASS. Prisma validate: PASS with a non-secret placeholder
  `DATABASE_URL`. API/Worker/Database typecheck: PASS. Changed-file lint: PASS.
- Dedicated empty PostgreSQL database: all 18 migrations through Phase API-1 PASS. Phase API-1/2
  API integration tests prove idempotent acceptance, one Outbox event and no raw phone persistence.
- Deferred: webhook/HMAC/retry, batch/rate limiting/external reference and Admin UI. FAX detection
  from a phone string and the external Production Gate adapter remain documented decisions.
- External Provider/API calls and real telephone calls: 0.

## Headless AI Call Engine — Phase API-2

- Status: COMPLETE LOCALLY.
- Added organization-scoped `GET /api/external/v1/calls/{call_id}` and
  `GET /api/external/v1/calls/{call_id}/result` with separate read scopes.
- Added idempotent `POST .../cancel` for accepted/validating/scheduled/queued calls and
  `POST .../stop` for calling/in-progress calls.
- Added persistent operation-scoped idempotency response records. Same key/request replays the
  same response; key reuse for another request or operation returns `IDEMPOTENCY_CONFLICT`.
- Production stop with unknown Provider state fails safe to `provider_unknown` and creates no
  redial Outbox event. Worker terminal update is conditional, so a concurrent stop cannot be
  overwritten by a late Mock completion.
- Dedicated database: all 19 migrations PASS. New integration/security tests: 13/13 PASS.
- Repository verification: lint PASS, changed-file format PASS, typecheck PASS, 73 files / 253
  tests PASS, production build PASS and Playwright E2E 8/8 PASS. The repository-wide format check
  still reports 10 pre-existing files outside this change; they were not rewritten for this
  feature.
- The full suite must use one Worker because existing login-rate-limit tests intentionally share
  database state; parallel execution causes test-only interference.
- External Provider/API calls and real telephone calls: 0.

## Headless AI Call Engine — Phase API-3

- Status: COMPLETE LOCALLY.
- Added one-time Webhook Secret issuance with hash-only persistence and deterministic server-side
  secret recovery; the secret is never stored in plaintext.
- Added immutable external Webhook events, one Delivery record per event and transactional Outbox
  publication for accepted, started, completed, qualified, cancelled, stopped and
  provider-unknown Call transitions.
- Added `X-Aidenwa-Event-Id`, timestamp and HMAC-SHA256 signatures over the exact raw body, with a
  five-minute replay verification window.
- Added delivery states, idempotent successful redelivery, retry delays, five-attempt exhaustion
  and deduplicated sanitized Incident creation.
- Dedicated database: all 20 migrations PASS. Focused Phase API-3 tests: 3/3 PASS; combined
  integration/security set: 9/9 PASS.
- Repository verification: lint PASS, typecheck PASS, 75 files / 256 tests PASS and production
  build PASS. Phase API-2 Playwright E2E remains 8/8 PASS; Phase API-3 adds no browser UI.
- External Provider/API calls and real telephone calls: 0.

## Headless AI Call Engine — Phase API-4

- Status: COMPLETE LOCALLY.
- Added batch Call creation/read APIs with a maximum of 500 targets, duplicate target rejection,
  organization/Profile isolation, OptOut filtering, Emergency Stop/call-window checks and final
  daily/concurrent capacity limits.
- Added persistent per-minute Integration Client rate-limit buckets for read, write, single Call
  and Batch categories.
- Added organization-scoped External References and batch-to-call relationships without copying
  the external customer master.
- Added admin list APIs for Integration Clients, Call Profiles and Webhook Delivery history, plus
  manual Webhook retry.
- Added the admin `外部連携` screen for Sandbox Client issuance, one-time credential display,
  active Sandbox Call Profile assignment, Client/Profile monitoring and failed Webhook retry.
  Production activation is not exposed.
- Dedicated empty PostgreSQL database: all 21 migrations through Phase API-4 PASS. Prisma format,
  validate and generate: PASS.
- Repository verification: lint PASS, typecheck PASS, 75 files / 258 unit/API/Worker tests PASS,
  production build PASS and Mock-only Playwright E2E 8/8 PASS.
- Remaining v1 admin operations: Client configuration editing, API key reissue and Call Profile
  authoring UI are not yet exposed in the browser. Existing admin creation APIs remain available.
- External Provider/API calls and real telephone calls: 0.

## Headless API admin operations

- Status: COMPLETE ON MASTER; Railway deployment verified.
- Admins can update organization-scoped Client Profile assignments, per-minute rate limit, daily
  limit and concurrent limit, and can suspend/resume a Client.
- API Key rotation invalidates the previous Key immediately and displays the replacement once.
  Audit data contains only the Key prefix, never plaintext or the stored hash.
- Admin UI can create active Sandbox Call Profiles from published internal Version IDs. Production
  activation remains unavailable.
- Added `docs/api/headless-sandbox-quickstart.md` for external Sandbox consumers.
- Verification: lint PASS, typecheck PASS, 75 files / 260 tests PASS, production build PASS.
- External Provider/API calls and real telephone calls: 0.

## Headless API public routing

- Status: COMPLETE ON MASTER; Railway public routing verified.
- Added a dedicated `/backend/external/*` Web rewrite to the API `/api/external/*` boundary.
- Kept existing admin `/backend/*` requests routed to `/api/v1/*`.
- Regression verification: lint PASS, typecheck PASS, focused rewrite tests 10/10 PASS and
  production build PASS.
- Railway runtime verification: API startup applied all pending Prisma migrations before serving;
  Web, API, Worker, PostgreSQL and Redis are Online. Corrected Web `API_INTERNAL_URL` to the actual
  API private DNS `sales-aiapi.railway.internal`.
- Public unauthenticated smoke: `/backend/external/v1/call-profiles` returns 401
  `UNAUTHENTICATED` with a request ID, and `/backend/auth/me` returns 401 `UNAUTHENTICATED`.
- External Provider/API calls and real telephone calls: 0.

## Phase 11 PR 2 — システム管理者・クライアント管理

- Status: COMPLETE / DRAFT PR #14 REVIEW PENDING.
- `system_admin`専用のクライアント企業一覧・詳細・登録・停止・再開・利用上限更新・監査ログAPI/UIを追加した。
- Organizationへ契約プラン、月間架電上限、同時架電上限を追加し、既存データへ安全なdefaultを設定した。
- クライアント作成と同一transactionで初期`admin`を1名作成する。一時パスワードはhashのみ保存し、APIレスポンス・監査ログへ再表示しない。
- 初期管理者は最初にパスワード変更が必須で、変更前は認証関連以外のAPIを利用できない。変更時に既存セッションを無効化する。
- 組織停止時は全既存セッションを即時削除する。物理削除APIは追加していない。
- クライアント管理者自身による組織停止・再開を廃止し、`system_admin`専用操作へ分離した。
- 専用空DBで23件の全migrationを適用: PASS。Prisma format/validate/generate: PASS。
- lint: PASS。変更ファイルformat: PASS。全workspace typecheck: PASS。
- Unit/API/Worker: 77 files / 269 tests PASS。Mock-only E2E: 8/8 PASS。production build: PASS。
- リポジトリ全体のWindowsローカルformat checkは既存CRLF差分を検出するため、変更ファイルのみ確認した。
- GitHub Actions run `32310493219`: dependency audit、release gate、Prisma checks、全migration、seed、lint、全体format、typecheck、269 tests、E2E、production buildのすべてPASS。
- 実電話発信: 0件。外部Provider通信: 0件。Production関連Feature Flag: すべて無効。
- PR 3以降（ロール別ダッシュボード等）には着手していない。
