'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';
type Item = {
  id: string;
  name: string;
  code: string;
  status: string;
  versions: Array<{ id: string; versionNumber: number; status: string }>;
};
export default function Page() {
  const [items, setItems] = useState<Item[]>([]);
  const load = () => api<{ products: Item[] }>('/products').then((r) => setItems(r.products));
  useEffect(() => {
    void load();
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await api('/products', {
      method: 'POST',
      body: JSON.stringify({ name: d.get('name'), code: d.get('code') }),
    });
    await load();
  }
  async function version(id: string) {
    const r = await api<{ productVersion: { id: string } }>(`/products/${id}/versions`, {
      method: 'POST',
      body: JSON.stringify({
        summary: 'Stage 3商材',
        targetCustomer: '対象企業',
        valuePropositions: ['安全な模擬提案'],
        requiredDisclosures: ['AIによる模擬通話'],
      }),
    });
    await api(`/product-versions/${r.productVersion.id}/publish`, { method: 'POST' });
    await load();
  }
  return (
    <main className="content">
      <div className="page-heading">
        <h1>商材</h1>
      </div>
      <p className="notice">Stage 3設定。外部発信はありません。</p>
      <section className="panel">
        <form onSubmit={(e) => void create(e)}>
          <input name="name" placeholder="商材名" required />
          <input name="code" placeholder="商材コード" required />
          <button>作成</button>
        </form>
      </section>
      <section className="cards">
        {items.map((x) => (
          <article className="panel" key={x.id}>
            <h2>{x.name}</h2>
            <p>
              {x.code} / {x.status}
            </p>
            <p>{x.versions.map((v) => `v${v.versionNumber}:${v.status}`).join('、') || '版なし'}</p>
            <button onClick={() => void version(x.id)}>新規版を作成・公開</button>
          </article>
        ))}
      </section>
    </main>
  );
}
