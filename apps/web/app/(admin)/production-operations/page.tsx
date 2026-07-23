'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type CurrentUser } from '../../../lib/api';
type Usage = { periodType: string; periodStart: string; callCount: number };
type Budget = { periodType: string; periodStart: string; amountMinor: number; currency: string };
type Rejection = { id: string; provider: string; reasonCodes: string[]; evaluatedAt: string };
export default function ProductionOperationsPage() {
  const [usage, setUsage] = useState<Usage[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const [u, m] = await Promise.all([
      api<{ usage: Usage[]; budgets: Budget[]; rejections: Rejection[] }>('/production-usage'),
      api<{ user: CurrentUser }>('/auth/me'),
    ]);
    setUsage(u.usage);
    setBudgets(u.budgets);
    setRejections(u.rejections);
    setUser(m.user);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function provider(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = f.get('provider');
    await api('/provider-configurations', {
      method: 'PUT',
      body: JSON.stringify({
        provider: typeof name === 'string' ? name : 'mock',
        allowed: true,
        secretReferenceKey: null,
      }),
    });
    setMsg('Provider名を許可しました。productionEnabledは引き続きfalseです');
    await load();
  }
  return (
    <main>
      <div className="page-heading">
        <div>
          <p className="eyebrow">STAGE 4A</p>
          <h1>発信上限・料金・拒否監視</h1>
          <p>Mock利用量とGate拒否理由だけを表示します。</p>
        </div>
        <span className="pill">PRODUCTION DISABLED</span>
      </div>
      {msg && <p className="notice">{msg}</p>}
      {user?.role === 'system_admin' && (
        <section className="card">
          <h2>Provider許可設定</h2>
          <form onSubmit={(e) => void provider(e)}>
            <label>
              Provider名
              <input name="provider" defaultValue="mock" required />
            </label>
            <button type="submit">Mock/Stub Provider名を許可</button>
          </form>
          <p>実Provider有効化操作は存在しません。</p>
        </section>
      )}
      <div className="two-column">
        <section className="card">
          <h2>発信利用量</h2>
          {usage.length ? (
            usage.map((x, i) => (
              <p key={`${x.periodType}-${x.periodStart}-${i}`}>
                {x.periodType}: {x.callCount}件（{x.periodStart}）
              </p>
            ))
          ) : (
            <p>利用なし</p>
          )}
        </section>
        <section className="card">
          <h2>Mock費用</h2>
          {budgets.length ? (
            budgets.map((x, i) => (
              <p key={`${x.periodType}-${x.periodStart}-${i}`}>
                {x.periodType}: {x.amountMinor} {x.currency}最小単位
              </p>
            ))
          ) : (
            <p>費用なし</p>
          )}
        </section>
      </div>
      <section className="card">
        <h2>停止・拒否された処理</h2>
        {rejections.length ? (
          rejections.map((x) => (
            <article className="list-card" key={x.id}>
              <strong>{x.provider}</strong>
              <p>{x.reasonCodes.join(', ')}</p>
              <small>{x.evaluatedAt}</small>
            </article>
          ))
        ) : (
          <p>拒否記録なし</p>
        )}
      </section>
    </main>
  );
}
