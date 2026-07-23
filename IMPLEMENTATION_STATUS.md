# Implementation Status

- Current stage: Maintainability remediation Phase 1 — Transactional Outbox complete
- Release state: Phase 1 local verification and GitHub CI complete; external providers disabled
- Updated: 2026-07-24

## Maintainability remediation Phase 1

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
- Phase 2 and later: not started
- Detailed report: `docs/verification/maintainability-remediation-report.md`

## Stage 4F completion audit

- Checkpoints 1–6: PASS
- Checkpoint 7: local CI-equivalent PASS; GitHub Actions pending because push/remote execution was not authorized
- Prisma: format / validate / generate PASS
- Empty DB: all 11 migrations + seed PASS; extension, exclusion constraint and zero schema drift confirmed; temporary DB deleted
- lint / format / typecheck: PASS
- Unit/API/Worker: 23 files, 97 tests PASS
- E2E: 8 tests PASS, including Stage 4C–4E integration and 390×844 mobile views
- Production build: Web/API/Worker PASS
- Audit data: 790 rows inspected, forbidden secret/CSV keys 0
- External provider and telephone calls: 0
- Detailed evidence: `docs/verification/stage4f-report.md`
- Remaining: GitHub Actions, deployment, production migration and all real-provider tests

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
- Web/API/Worker production build: PASS（WebはNext.js ESLint plugin未検出の警告のみ）
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

## Temporary implementation / known issues

- Stage 4B-2は接続コードとFake Transport検証まで完了しています。外部設定、書面承認、実Provider疎通、総合監査は未完了です。
- Zoom PhoneはProvider/OAuth/Webhook/履歴照合コードまで実装済みですが、外部Feature Flagは無効で実アカウント接続は未実施です。
- Stage 4B-2の全API/E2E、保持期限cleanup、監査ログmutation網羅は完了監査で追加確認が必要です。

- FAQ検索はPostgreSQLの決定的な部分一致で、embedding/RAGはStage 3対象外です。
- シナリオUIはフォームで標準graphを作る簡易版で、ドラッグ式エディタではありません。
- Mock実行は1件ずつで、実通話相当の予測ダイヤラーではありません。
- call eventは`CALL_EVENT_RETENTION_DAYS`より古いものをWorkerの定期cleanupで削除します。
- GitHub Actions実ジョブはpush/PR未実施のため未確認です。

## Stage 4 gate

実電話を有効にする前に、対象国法令、発信時間、AI開示、録音/同意、営業禁止責任者、番号本人確認、Provider選定、緊急停止、発信上限、越境移転、有人転送、限定テストの書面承認を決定し、GitHub Actions実CIを成功させる必要があります。これらが未決定のまま外部Providerを追加・有効化しません。

- 承認記録テンプレート: `docs/decisions/0003-stage-4-production-call-approval.md`
- 現在の承認状態: Pending approval（実Provider接続・実番号発信は禁止）
- Stage 4A実装指示書: 確認・実装済み
- Stage 4A technical readiness: completed locally（実電話は無効）
- GitHub Actions: push/PRを行っていないため未実行。成功扱いにはしない
- Stage 4B開始条件: 対象法令、Provider、AI開示、録音/文字起こし同意、発信条件、責任者、限定対象、受入・rollback、書面承認を確定すること

## Stage 4A completion audit

- 専用UI: 承認作成/申請/判断/停止/再開、Provider設定、利用量/Mock費用、Gate拒否一覧、readinessを実装・build確認済み。
- 完全E2E: 必須項目不足拒否→完全draft→申請→`system_admin`承認→上限/allowlist/Mock Provider設定→Production Call Gate通過をPASS。
- Webhook再試行: `mock.fail_once`をBullMQへ最大3回投入し、初回失敗→再配送成功→重複実行無害化をWorkerテストでPASS。
- ローカルStage 4A完了条件: PASS。
- GitHub Actions実CI: push/PR未実施のため未実行。ローカル完了と分けて記録する。
