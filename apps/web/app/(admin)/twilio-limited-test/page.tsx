'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type CurrentUser } from '../../../lib/api';
type Auth = {
  id: string;
  status: string;
  releaseCommit: string;
  startsAt: string;
  endsAt: string;
  maxCalls: number;
  rollbackStatus: string;
};
type Call = {
  id: string;
  state: string;
  providerCallId: string | null;
  dtmfResult: string | null;
  estimatedCostMinor: number;
  finalCostMinor: number | null;
  currency: string;
  emergencyCancelStatus: string | null;
};
type Allowed = { id: string; maskedPhone: string; ownerName: string; active: boolean };
type SourceApproval = {
  id: string;
  maskedNumber: string;
  verificationStatus: string;
  active: boolean;
  expiresAt: string;
};
type Incident = { id: string; category: string; severity: string; status: string; summary: string };
type Summary = {
  todayCount: number;
  activeCount: number;
  estimatedCostMinor: number;
  finalCostMinor: number;
  currency: string;
  emergencyStopActive: boolean;
  lastGateRejectionReasons: string[];
  twilioConnectionState?: 'connected' | 'disabled' | 'not_configured';
};
export default function TwilioLimitedTestPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [auths, setAuths] = useState<Auth[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [allow, setAllow] = useState<Allowed[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sources, setSources] = useState<SourceApproval[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const m = await api<{ user: CurrentUser }>('/auth/me');
    const [a, c, l, incidentData] = await Promise.all([
      api<{ authorizations: Auth[] }>('/production-test-authorizations'),
      api<{ executions: Call[]; summary: Summary }>('/real-calls'),
      api<{ allowlist: Allowed[] }>('/test-call-allowlist'),
      api<{ incidents: Incident[] }>('/production-incidents'),
    ]);
    setUser(m.user);
    setAuths(a.authorizations);
    setCalls(c.executions);
    setSummary(c.summary);
    setAllow(l.allowlist);
    setIncidents(incidentData.incidents);
    if (m.user.role === 'system_admin') {
      const sourceData = await api<{ approvals: SourceApproval[] }>('/source-number-approvals');
      setSources(sourceData.approvals);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const commit = value(f, 'commit');
    const ids = f
      .getAll('allowlist')
      .filter((x): x is string => typeof x === 'string')
      .slice(0, 5);
    await api('/production-test-authorizations', {
      method: 'POST',
      body: JSON.stringify({
        releaseCommit: commit,
        writtenApprovalCommit: commit,
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(),
        maxCalls: 5,
        maxDestinations: 5,
        maxCallSeconds: 120,
        approvedAllowlistIds: ids,
        sourceNumberApprovalId: value(f, 'sourceNumberApprovalId'),
        budgetLimitMinor: Number(value(f, 'budget')),
        currency: 'JPY',
        recordingEnabled: false,
        transcriptionEnabled: false,
        mediaStreamsEnabled: false,
        humanTransferEnabled: false,
      }),
    });
    setMsg('限定テストdraftを作成しました。実電話はまだ無効です');
    await load();
  }
  async function action(id: string, name: string) {
    const reason = window.prompt('理由を入力してください') ?? '';
    await api(`/production-test-authorizations/${id}/${name}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    setMsg(`${name}を記録しました`);
    await load();
  }
  async function call(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api('/real-calls/manual', {
      method: 'POST',
      body: JSON.stringify({
        authorizationId: value(f, 'authorizationId'),
        campaignId: value(f, 'campaignId'),
        companyId: value(f, 'companyId'),
        phoneNumberId: value(f, 'phoneNumberId'),
        allowlistId: value(f, 'allowlistId'),
      }),
    });
    setMsg('単発ジョブを予約しました。自動連続発信は行いません');
    await load();
  }
  async function resolveUnknown(id: string, resolution: 'confirmed_not_created' | 'incident') {
    const reason = window.prompt('確認内容と根拠を10文字以上で入力してください') ?? '';
    await api(`/real-calls/${id}/resolve-provider-unknown`, {
      method: 'POST',
      body: JSON.stringify({ resolution, reason }),
    });
    setMsg('Provider不明状態の確認結果を記録しました。自動再発信は行いません');
    await load();
  }
  async function createSource(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api('/source-number-approvals', {
      method: 'POST',
      body: JSON.stringify({
        sourceNumberE164: value(f, 'sourceNumberE164'),
        ownershipEvidenceRef: value(f, 'ownershipEvidenceRef'),
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      }),
    });
    setMsg('発信元番号をfingerprintと末尾4桁だけで登録しました');
    await load();
  }
  async function reasonAction(path: string) {
    const reason = window.prompt('理由を10文字以上で入力してください') ?? '';
    await api(path, { method: 'POST', body: JSON.stringify({ reason }) });
    await load();
  }
  return (
    <main className="twilio-test-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">STAGE 4B-1</p>
          <h1>Twilio同意済み番号限定テスト</h1>
          <p>固定TwiML＋DTMFのみ。録音、文字起こし、自由会話AI、Zoom Phoneは未接続です。</p>
        </div>
        <span className="pill">DEFAULT DISABLED</span>
      </div>
      {msg && <p className="notice">{msg}</p>}
      <section className="card twilio-status-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CONNECTION &amp; SAFETY</p>
            <h2>接続状態</h2>
          </div>
          <span className="pill">資格情報は非表示</span>
        </div>
        <p className="section-lead">
          production環境、環境・DB Gate、release commit一致、書面承認のすべてが必要です。
        </p>
        <div className="connection-grid">
          <div className="connection-item">
            <span>Zoom Phone</span>
            <strong>未接続</strong>
            <small>Stage 4B-2以降</small>
          </div>
          <div className="connection-item">
            <span>Twilio</span>
            <strong>
              {user?.role === 'system_admin'
                ? (summary?.twilioConnectionState ?? 'not_configured')
                : '管理者のみ表示'}
            </strong>
            <small>外部接続は既定で無効</small>
          </div>
        </div>
        <div className="stats-grid">
          <div className="stat">
            <span>本日の実電話予約</span>
            <strong>{summary?.todayCount ?? 0} / 5</strong>
          </div>
          <div className="stat">
            <span>現在の通話数</span>
            <strong>{summary?.activeCount ?? 0} / 1</strong>
          </div>
          <div className="stat">
            <span>推定料金</span>
            <strong>
              {summary?.estimatedCostMinor ?? 0} {summary?.currency ?? 'JPY'}
            </strong>
          </div>
          <div className="stat">
            <span>確定料金</span>
            <strong>
              {summary?.finalCostMinor ?? 0} {summary?.currency ?? 'JPY'}
            </strong>
          </div>
        </div>
        <div className="safety-grid">
          <div>
            <span>緊急停止</span>
            <strong>{summary?.emergencyStopActive ? '有効' : 'なし'}</strong>
          </div>
          <div>
            <span>最新Gate拒否理由</span>
            <strong>
              {summary?.lastGateRejectionReasons.length
                ? summary.lastGateRejectionReasons.join(', ')
                : 'なし'}
            </strong>
          </div>
        </div>
      </section>
      {user?.role === 'system_admin' && (
        <section className="card">
          <h2>発信元番号承認</h2>
          <p>実番号は保存・表示されません。HMAC fingerprintと末尾4桁だけを保持します。</p>
          <form onSubmit={(e) => void createSource(e)}>
            <label>
              発信元番号（E.164・登録時だけ使用）
              <input name="sourceNumberE164" required pattern="\+[1-9][0-9]{7,14}" />
            </label>
            <label>
              所有確認証跡の参照ID
              <input name="ownershipEvidenceRef" required minLength={5} />
            </label>
            <button type="submit">安全な参照として登録</button>
          </form>
          {sources.map((source) => (
            <article className="list-card" key={source.id}>
              <strong>{source.maskedNumber}</strong>
              <p>
                {source.verificationStatus} / 期限 {source.expiresAt}
              </p>
              <div className="actions">
                {!source.active && source.verificationStatus !== 'revoked' && (
                  <button
                    onClick={() =>
                      void reasonAction(`/source-number-approvals/${source.id}/verify`)
                    }
                  >
                    確認済みにする
                  </button>
                )}
                {source.verificationStatus !== 'revoked' && (
                  <button
                    className="danger"
                    onClick={() =>
                      void reasonAction(`/source-number-approvals/${source.id}/revoke`)
                    }
                  >
                    取消
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
      {user?.role === 'system_admin' && (
        <section className="card">
          <h2>一時限定テスト承認</h2>
          <form onSubmit={(e) => void create(e)}>
            <label>
              対象release commit
              <input name="commit" required pattern="[a-f0-9]{7,64}" />
            </label>
            <label>
              予算上限（JPY最小単位）
              <input name="budget" type="number" min="1" required />
            </label>
            <label>
              確認済み発信元番号
              <select name="sourceNumberApprovalId" required>
                <option value="">選択してください</option>
                {sources
                  .filter((source) => source.active)
                  .map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.maskedNumber}
                    </option>
                  ))}
              </select>
            </label>
            <fieldset>
              <legend>同意済み番号（最大5件）</legend>
              {allow
                .filter((x) => x.active)
                .map((x) => (
                  <label key={x.id}>
                    <input type="checkbox" name="allowlist" value={x.id} />
                    {x.maskedPhone} {x.ownerName}
                  </label>
                ))}
            </fieldset>
            <button type="submit">限定テストdraftを作成</button>
          </form>
          {auths.map((x) => (
            <article className="list-card" key={x.id}>
              <strong>{x.status}</strong>
              <p>
                {x.releaseCommit} / 最大{x.maxCalls}件 / {x.startsAt}〜{x.endsAt}
              </p>
              <p>rollback: {x.rollbackStatus}</p>
              <div className="actions">
                {x.status === 'draft' && (
                  <button onClick={() => void action(x.id, 'approve')}>承認</button>
                )}
                {x.status === 'approved' && (
                  <button onClick={() => void action(x.id, 'activate')}>
                    開始条件を再確認して有効化
                  </button>
                )}
                {x.status === 'active' && (
                  <>
                    <button className="danger" onClick={() => void action(x.id, 'suspend')}>
                      停止
                    </button>
                    <button className="danger" onClick={() => void action(x.id, 'rollback')}>
                      Twilioを無効化してロールバック
                    </button>
                  </>
                )}
                {x.status === 'suspended' && (
                  <button className="danger" onClick={() => void action(x.id, 'rollback')}>
                    未完了通話を停止してロールバック
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}
      {user?.role === 'system_admin' && (
        <section className="card">
          <h2>1件ずつ手動発信</h2>
          <form onSubmit={(e) => void call(e)}>
            <label>
              限定承認ID
              <input name="authorizationId" required />
            </label>
            <label>
              Campaign ID
              <input name="campaignId" required />
            </label>
            <label>
              Company ID
              <input name="companyId" required />
            </label>
            <label>
              Phone Number ID
              <input name="phoneNumberId" required />
            </label>
            <label>
              Allowlist ID
              <input name="allowlistId" required />
            </label>
            <label>
              <input type="checkbox" required />
              対象番号、同意、期限、commit、5件上限、録音無効を確認しました
            </label>
            <button type="submit">この1件だけ予約</button>
          </form>
        </section>
      )}
      <section className="card">
        <h2>実電話結果</h2>
        {calls.length ? (
          calls.map((x) => (
            <article className="list-card" key={x.id}>
              <strong>{x.state}</strong>
              <p>
                Call SID: {x.providerCallId ?? '未取得'} / DTMF: {x.dtmfResult ?? '未入力'}
              </p>
              <p>
                推定 {x.estimatedCostMinor} / 確定 {x.finalCostMinor ?? '未確定'} {x.currency}
                、緊急停止: {x.emergencyCancelStatus ?? 'なし'}
              </p>
              {user?.role === 'system_admin' && x.state === 'provider_unknown' && (
                <div className="actions">
                  <button onClick={() => void resolveUnknown(x.id, 'confirmed_not_created')}>
                    Provider上に通話なしとして終了
                  </button>
                  <button className="danger" onClick={() => void resolveUnknown(x.id, 'incident')}>
                    incidentとして保留
                  </button>
                </div>
              )}
            </article>
          ))
        ) : (
          <p>実電話履歴なし</p>
        )}
      </section>
      <section className="card">
        <h2>Production incidents</h2>
        {incidents.length ? (
          incidents.map((incident) => (
            <article className="list-card" key={incident.id}>
              <strong>
                {incident.severity}: {incident.category}
              </strong>
              <p>
                {incident.summary} / {incident.status}
              </p>
              {user?.role === 'system_admin' && incident.status !== 'resolved' && (
                <button
                  onClick={() => void reasonAction(`/production-incidents/${incident.id}/resolve`)}
                >
                  理由付きで解決
                </button>
              )}
            </article>
          ))
        ) : (
          <p>未解決incidentなし</p>
        )}
      </section>
    </main>
  );
}
function value(form: FormData, key: string) {
  const x = form.get(key);
  return typeof x === 'string' ? x : '';
}
