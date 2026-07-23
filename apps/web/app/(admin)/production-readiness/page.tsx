'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';

type Check = { key: string; state: string };
type Approval = { id: string; status: string; expiresAt: string | null };
type Stop = { id: string; scope: string; reason: string; active: boolean };
type Readiness = {
  overall: string;
  realCallingEnabled: boolean;
  checks: Check[];
  approval: Approval | null;
  policy: unknown;
  providers: Array<{ provider: string; allowed: boolean; productionEnabled: boolean }>;
  activeStops: Stop[];
  allowlistCount: number;
};

export default function ProductionReadinessPage() {
  const [data, setData] = useState<Readiness | null>(null);
  const [message, setMessage] = useState('');
  const load = useCallback(
    () =>
      api<{ readiness: Readiness }>('/production-readiness')
        .then((r) => setData(r.readiness))
        .catch((e: unknown) => setMessage(e instanceof Error ? e.message : '読込失敗')),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function stop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/emergency-stops', {
      method: 'POST',
      body: JSON.stringify({ scope: 'organization', reason: field(form, 'reason') }),
    });
    setMessage('組織の緊急停止を有効にしました');
    await load();
  }
  async function allow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/test-call-allowlist', {
      method: 'POST',
      body: JSON.stringify({
        phoneNumber: field(form, 'phone'),
        region: field(form, 'region'),
        ownerName: field(form, 'owner'),
        purpose: field(form, 'purpose'),
        consentConfirmed: true,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        notes: 'Stage 4A limited test',
      }),
    });
    setMessage('限定テスト番号を登録しました（表示・監査ではマスク）');
    await load();
  }
  async function policy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api('/production-policy', {
      method: 'PUT',
      body: JSON.stringify({
        timezone: 'Asia/Tokyo',
        dailyCallLimit: 10,
        hourlyCallLimit: 5,
        concurrentCallLimit: 1,
        maxCallDurationSeconds: 600,
        dailyDurationLimitSeconds: 3600,
        monthlyBudgetMinor: 10000,
        dailyBudgetMinor: 1000,
        currency: 'JPY',
        limitedTestCallLimit: 3,
        mockCostPerCallMinor: 10,
      }),
    });
    setMessage('安全側の初期制限を保存しました');
    await load();
  }
  return (
    <main>
      <div className="page-heading">
        <div>
          <p className="eyebrow">STAGE 4A</p>
          <h1>実電話 readiness・安全管理</h1>
          <p>技術準備専用です。実Provider接続、実番号発信、有料APIは常に無効です。</p>
        </div>
        <span className="pill">REAL CALLS DISABLED</span>
      </div>
      {message && <p className="notice">{message}</p>}
      <section className="card">
        <h2>Readinessチェック</h2>
        <p>
          総合状態: <strong>{data?.overall ?? '確認中'}</strong> / 実電話:{' '}
          <strong>{data?.realCallingEnabled ? '有効' : '利用不可'}</strong>
        </p>
        <div className="grid">
          {data?.checks.map((c) => (
            <div className="stat" key={c.key}>
              <span>{label(c.key)}</span>
              <strong>{c.state}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>承認状況</h2>
        <p>
          {data?.approval
            ? `${data.approval.status}（期限 ${data.approval.expiresAt ?? '未設定'}）`
            : '未作成'}
        </p>
        <p>
          承認内容の作成・申請・システム管理者による判断はAPIで状態遷移と監査が強制されます。書面承認はStage
          4Bまで未完了です。
        </p>
      </section>
      <div className="two-column">
        <section className="card">
          <h2>発信制限・料金保護</h2>
          <p>{data?.policy ? '設定済み' : '未設定'}</p>
          <form onSubmit={(e) => void policy(e)}>
            <button type="submit">安全側の初期制限を設定</button>
          </form>
        </section>
        <section className="card">
          <h2>緊急停止</h2>
          <p>有効: {data?.activeStops.length ?? 0}件。APIとWorkerの両方で再確認します。</p>
          <form onSubmit={(e) => void stop(e)}>
            <label>
              停止理由
              <input name="reason" required minLength={3} />
            </label>
            <button className="danger" type="submit">
              組織を緊急停止
            </button>
          </form>
        </section>
      </div>
      <div className="two-column">
        <section className="card">
          <h2>限定テスト許可番号</h2>
          <p>有効件数: {data?.allowlistCount ?? 0}（画面・監査ログではマスク）</p>
          <form onSubmit={(e) => void allow(e)}>
            <label>
              電話番号
              <input name="phone" required />
            </label>
            <label>
              国・地域
              <input name="region" defaultValue="JP" required />
            </label>
            <label>
              所有者・会社
              <input name="owner" required />
            </label>
            <label>
              登録目的
              <input name="purpose" defaultValue="本人同意済み限定テスト" required />
            </label>
            <button type="submit">同意確認済みとして登録</button>
          </form>
        </section>
        <section className="card">
          <h2>Provider設定</h2>
          {data?.providers.length ? (
            data.providers.map((p) => (
              <p key={p.provider}>
                {p.provider}: {p.allowed ? '許可' : '不許可'} / production{' '}
                {p.productionEnabled ? '有効' : '無効'}
              </p>
            ))
          ) : (
            <p>未設定</p>
          )}
          <p>
            <code>ProductionVoiceProviderStub</code>{' '}
            は全操作を安全に拒否します。有効化ボタンはありません。
          </p>
        </section>
      </div>
    </main>
  );
}
function label(key: string) {
  return (
    (
      {
        approval: '実電話承認',
        policy: '発信制限',
        provider: 'Provider許可',
        allowlist: '限定番号',
        emergencyStop: '緊急停止',
        writtenApproval: '書面承認',
        realProvider: '実Provider',
      } as Record<string, string>
    )[key] ?? key
  );
}

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
