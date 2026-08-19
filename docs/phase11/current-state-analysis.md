# Phase 11 PR 1 現状分析

調査日: 2026-08-19（JST）

基準: `origin/master` / `d5a1f88`

対象外: open PR #12（`agent/admin-layout-spacing`）

## 外部状態

- GitHub: open PRは#12のみ。基準コミットの最新CIは成功。#12のCIは失敗中だが本PRへは取り込まない。
- Railway: 公開Webの`/api/health`はHTTP 200。Railway CLIと認証済みブラウザ操作手段がないため、API・Worker・PostgreSQL・Redisの個別状態は未確認とする。
- 実電話: `VOICE_PROVIDER`の既定値は`mock`、`PRODUCTION_CALLS_ENABLED`の既定値は`false`。Realtime、Zoom、Calendar等も既定無効。

## コード・データ

- PrismaにはOrganization、User、Team、Campaign、CallJob、HumanFollowupTask、SalesHandoffCard、Appointment、Headless API関連モデルが存在する。
- 既存ロールは`system_admin`、`admin`、`manager`、`sales`。PR 1で`operator`を追加する。
- 認証はセッション期限、ユーザー状態、組織状態を検査し、無効セッションを削除する。
- 通常APIは認証コンテキストの`organizationId`で絞り込む。Production Safetyの一部だけが、`system_admin`による明示組織指定を既に持つ。
- 管理画面経由のキャンペーンは既存API、Outbox、Worker、VoiceProviderを利用する。WebからProviderを直接呼ばない。
- Followup、Handoff、Appointmentは既存モデルを再利用でき、新しい電話対応モデルは不要。
- ダッシュボードは準備中。ロール別KPIはPR 3の範囲であり、本PRでは実装しない。
- 初期管理者は一度限りのbootstrap処理があり、パスワードをDBへ平文保存しない。

## 仕様差異と採用案

1. `system_admin`の全組織管理: 現行の一般APIは所属組織スコープである。PR 2が組織一覧・詳細・作成を所有するため、PR 1では越境APIを追加せず、既存境界を維持する。PR 2で専用`/system/organizations` APIを明示的に追加する。
2. 電話担当者画面: `/operator/tasks`はPR 4の範囲。本PRでは既存Followup/Handoff APIをoperator対応にし、既存画面への最小メニュー導線だけを提供する。
3. 営業担当者画面: `/sales/leads`再構成はPR 4。本PRではキャンペーン操作を除外し、既存の担当データ制限を維持する。
4. managerの組織管理: 既存ADRどおり組織全体の運用権限は維持するが、ユーザー・チーム管理メニューはadminだけにする。APIの既存限定更新は後方互換のため残す。

## PR 1の変更境界

- operator enum、migration、入力検証
- Followup/Handoffの本人割当・Organization認可
- ロール別の業務グループメニューと日本語役割名
- 認可回帰テスト
- PR 2以降の画面・KPI・セットアップ・単体E2Eは実装しない
