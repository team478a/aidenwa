'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type CurrentUser } from '../../../lib/api';

type Product = { id: string; name: string };
type Approval = {
  id: string;
  status: string;
  purpose: string;
  expiresAt: string | null;
  decisionReason: string | null;
};
export default function ProductionApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const [a, p, m] = await Promise.all([
      api<{ approvals: Approval[] }>('/production-approvals'),
      api<{ products: Product[] }>('/products'),
      api<{ user: CurrentUser }>('/auth/me'),
    ]);
    setItems(a.approvals);
    setProducts(p.products);
    setUser(m.user);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const productId = value(f, 'productId');
    const body = {
      targetRegions: [value(f, 'region')],
      productIds: [productId],
      purpose: value(f, 'purpose'),
      aiDisclosure: value(f, 'aiDisclosure'),
      recordingEnabled: false,
      recordingConsentMethod: '録音しない',
      transcriptionEnabled: false,
      personalDataRetentionDays: 30,
      callableWeekdays: [1, 2, 3, 4, 5],
      callableStartTime: '09:00',
      callableEndTime: '18:00',
      dailyCallLimit: 100,
      hourlyCallLimit: 20,
      concurrentCallLimit: 2,
      maxAttemptsPerCompany: 3,
      minRetryIntervalMinutes: 60,
      optOutOwner: value(f, 'optOutOwner'),
      emergencyStopOwner: value(f, 'emergencyOwner'),
      privacyOwner: value(f, 'privacyOwner'),
      plannedProvider: 'mock',
      dataResidency: 'Japan',
      crossBorderConfirmed: true,
      humanTransferMethod: 'Stage 4Aでは利用しない',
      limitedTestCallLimit: 10,
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      approvalBasis: value(f, 'basis'),
      notes: 'Mock-only Stage 4A',
    };
    await api('/production-approvals', { method: 'POST', body: JSON.stringify(body) });
    setMsg('draftを作成しました');
    await load();
  }
  async function action(id: string, name: string) {
    const reason = window.prompt('理由を入力してください') ?? '';
    if (name === 'submit')
      await api(`/production-approvals/${id}/submit`, { method: 'POST', body: '{}' });
    else
      await api(`/production-approvals/${id}/${name}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
    setMsg(`${name}を記録しました`);
    await load();
  }
  return (
    <main>
      <div className="page-heading">
        <div>
          <p className="eyebrow">STAGE 4A</p>
          <h1>実電話承認管理</h1>
          <p>技術承認のみを管理します。書面承認と実電話有効化は行いません。</p>
        </div>
        <span className="pill">MOCK ONLY</span>
      </div>
      {msg && <p className="notice">{msg}</p>}
      <section className="card">
        <h2>承認項目チェックリスト・新規draft</h2>
        <form onSubmit={(e) => void create(e)}>
          <label>
            対象商材
            <select name="productId" required>
              <option value="">選択</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            対象国・地域
            <input name="region" defaultValue="JP" required />
          </label>
          <label>
            発信目的
            <input name="purpose" required minLength={3} />
          </label>
          <label>
            AI開示文
            <input name="aiDisclosure" required minLength={3} />
          </label>
          <label>
            営業禁止管理責任者
            <input name="optOutOwner" required />
          </label>
          <label>
            緊急停止責任者
            <input name="emergencyOwner" required />
          </label>
          <label>
            個人情報管理責任者
            <input name="privacyOwner" required />
          </label>
          <label>
            承認根拠
            <textarea name="basis" required minLength={3} />
          </label>
          <button type="submit">承認draftを作成</button>
        </form>
      </section>
      <section className="card">
        <h2>承認履歴</h2>
        {items.map((x) => (
          <article className="list-card" key={x.id}>
            <strong>{x.status}</strong>
            <p>
              {x.purpose} / 期限 {x.expiresAt ?? '未設定'}
            </p>
            {x.decisionReason && <p>理由: {x.decisionReason}</p>}
            <div className="actions">
              {x.status === 'draft' && (
                <button onClick={() => void action(x.id, 'submit')}>申請</button>
              )}
              {user?.role === 'system_admin' && x.status === 'reviewing' && (
                <>
                  <button onClick={() => void action(x.id, 'approve')}>承認</button>
                  <button className="danger" onClick={() => void action(x.id, 'reject')}>
                    却下
                  </button>
                </>
              )}
              {user?.role === 'system_admin' && x.status === 'approved' && (
                <button className="danger" onClick={() => void action(x.id, 'suspend')}>
                  停止
                </button>
              )}
              {user?.role === 'system_admin' && x.status === 'suspended' && (
                <button onClick={() => void action(x.id, 'resume')}>再開</button>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
function value(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
}
