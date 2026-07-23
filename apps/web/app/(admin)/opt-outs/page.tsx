'use client';
import { useEffect, useState } from 'react';
import { api, type CurrentUser } from '../../../lib/api';
type O = {
  id: string;
  scope: string;
  channel: string;
  reasonCode: string;
  evidenceText: string | null;
  status: string;
  registeredAt: string;
  company: { name: string } | null;
  registrar: { name: string };
  releaseReason: string | null;
};
export default function OptOuts() {
  const [items, setItems] = useState<O[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const load = () => api<{ optOuts: O[] }>('/opt-outs').then((r) => setItems(r.optOuts));
  useEffect(() => {
    void load();
    void api<{ user: CurrentUser }>('/auth/me').then((r) => setUser(r.user));
  }, []);
  async function release(id: string) {
    const reason = prompt('解除理由を入力してください');
    if (!reason) return;
    await api(`/opt-outs/${id}/release`, {
      method: 'POST',
      body: JSON.stringify({ releaseReason: reason }),
    });
    await load();
  }
  return (
    <main className="content">
      <div className="page-heading">
        <h1>営業禁止</h1>
      </div>
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>企業</th>
              <th>範囲</th>
              <th>チャネル</th>
              <th>理由</th>
              <th>根拠</th>
              <th>登録者</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id}>
                <td>{o.company?.name ?? 'snapshot'}</td>
                <td>{o.scope}</td>
                <td>{o.channel}</td>
                <td>{o.reasonCode}</td>
                <td>{o.evidenceText}</td>
                <td>{o.registrar.name}</td>
                <td>{o.status}</td>
                <td>
                  {user?.role === 'admin' && o.status === 'active' && (
                    <button className="secondary small" onClick={() => void release(o.id)}>
                      解除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
