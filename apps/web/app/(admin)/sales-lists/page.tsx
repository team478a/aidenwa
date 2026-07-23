'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';
type L = {
  id: string;
  name: string;
  listType: string;
  status: string;
  updatedAt: string;
  creator: { name: string };
  _count: { companies: number };
};
export default function Lists() {
  const [lists, setLists] = useState<L[]>([]);
  const load = () => api<{ salesLists: L[] }>('/sales-lists').then((r) => setLists(r.salesLists));
  useEffect(() => {
    void load();
  }, []);
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget,
      d = new FormData(f);
    await api('/sales-lists', {
      method: 'POST',
      body: JSON.stringify({
        name: d.get('name'),
        listType: d.get('listType'),
        filterConditions: d.get('listType') === 'dynamic' ? { salesStatus: 'uncontacted' } : {},
      }),
    });
    f.reset();
    await load();
  }
  return (
    <main className="content">
      <div className="page-heading">
        <h1>営業リスト</h1>
      </div>
      <section className="panel">
        <form className="inline-form" onSubmit={(e) => void add(e)}>
          <input name="name" placeholder="リスト名" required />
          <select name="listType">
            <option value="static">固定</option>
            <option value="dynamic">動的</option>
          </select>
          <button>作成</button>
        </form>
      </section>
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>名前</th>
              <th>種別</th>
              <th>企業数</th>
              <th>状態</th>
              <th>作成者</th>
            </tr>
          </thead>
          <tbody>
            {lists.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td>{l.listType}</td>
                <td>{l._count.companies}</td>
                <td>{l.status}</td>
                <td>{l.creator.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
