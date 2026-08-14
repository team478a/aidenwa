# Headless AI Call Engine Sandbox利用手順

## 前提

- Base URL: `https://sales-aiweb-production.up.railway.app/backend/external/v1`
- SandboxではMockVoiceProviderだけを使用し、実電話・外部課金は発生しない。
- API Key、Webhook Secret、実在顧客情報をGit・チャット・画面キャプチャへ残さない。
- すべての更新APIに一意な`Idempotency-Key`（UUID）を付ける。

## 管理者の準備

1. 管理画面の「外部連携」を開く。
2. 公開済みの商材・AI担当者・シナリオVersion IDからSandbox Call Profileを作成する。
3. Sandbox Clientを作成し、利用するCall Profileを割り当てる。
4. 一度だけ表示される`aid_test_...` API Keyを安全なSecret Managerへ保存する。

## 接続確認

以下の`$API_KEY`は利用側のSecret Managerから読み込む。コマンド履歴へ直接Keyを書かない。

```bash
curl -sS \
  -H "Authorization: Bearer $API_KEY" \
  https://sales-aiweb-production.up.railway.app/backend/external/v1/call-profiles
```

## Mock単発Call

電話番号・会社名は必ず合成テストデータを使用する。

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 11111111-1111-4111-8111-111111111111" \
  -d '{
    "external_call_id":"smoke-call-001",
    "external_customer_id":"smoke-customer-001",
    "call_profile_id":"cp_new_sales_v1",
    "destination":{"phone":"05000000001"},
    "customer":{"company_name":"SMOKE株式会社","contact_name":"テスト担当"},
    "context":{"lead_source":"synthetic-smoke"},
    "execution":{"mode":"immediate"}
  }' \
  https://sales-aiweb-production.up.railway.app/backend/external/v1/calls
```

返却された`call_id`で状態と結果を取得する。

```bash
curl -sS -H "Authorization: Bearer $API_KEY" \
  "https://sales-aiweb-production.up.railway.app/backend/external/v1/calls/$CALL_ID"

curl -sS -H "Authorization: Bearer $API_KEY" \
  "https://sales-aiweb-production.up.railway.app/backend/external/v1/calls/$CALL_ID/result"
```

## Key漏えい時

管理画面でClientを直ちに停止し、「API Key再発行」を実行する。旧Keyは即時無効になる。
新しいKeyは一度しか表示されない。原因と対応時刻はKey本体を含めずIncidentへ記録する。

## Production境界

Sandbox ClientをProductionへ変更する操作はこの画面では提供しない。Production Scopeだけでは
実電話を開始できず、書面承認、Production Gate、Provider Readiness、利用上限が別途必要になる。
