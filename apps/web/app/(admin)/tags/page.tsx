'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';
type T = { id: string; name: string; color: string; _count: { companyTags: number } };
export default function Tags() {
  const [tags, setTags] = useState<T[]>([]);
  const load = () => api<{ tags: T[] }>('/tags').then((r) => setTags(r.tags));
  useEffect(() => {
    void load();
  }, []);
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget,
      d = new FormData(f);
    await api('/tags', {
      method: 'POST',
      body: JSON.stringify({ name: d.get('name'), color: d.get('color') }),
    });
    f.reset();
    await load();
  }
  return (
    <main className="content">
      <div className="page-heading">
        <h1>タグ管理</h1>
      </div>
      <section className="panel">
        <form className="inline-form" onSubmit={(e) => void add(e)}>
          <input name="name" placeholder="タグ名" required />
          <input name="color" type="color" defaultValue="#64748b" />
          <button>作成</button>
        </form>
      </section>
      <section className="cards">
        {tags.map((t) => (
          <article className="panel" key={t.id}>
            <span className="tag" style={{ background: t.color }}>
              {t.name}
            </span>
            <p>{t._count.companyTags}社で使用</p>
          </article>
        ))}
      </section>
    </main>
  );
}
