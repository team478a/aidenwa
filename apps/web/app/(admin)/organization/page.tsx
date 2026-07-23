'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';
type Organization = { name: string; slug: string; timezone: string; status: string };
export default function OrganizationPage() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    api<{ organization: Organization }>('/organization')
      .then((r) => setOrganization(r.organization))
      .catch((e: Error) => setMessage(e.message));
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ organization: Organization }>('/organization', {
        method: 'PATCH',
        body: JSON.stringify({
          name: data.get('name'),
          slug: data.get('slug'),
          timezone: data.get('timezone'),
        }),
      });
      setOrganization(result.organization);
      setMessage('保存しました');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存できませんでした');
    }
  }
  if (!organization) return <main className="loading">読み込み中…</main>;
  return (
    <main className="content narrow">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TENANT</p>
          <h1>組織設定</h1>
        </div>
      </div>
      <section className="panel">
        <form onSubmit={(event) => void save(event)}>
          <label>
            組織名
            <input name="name" defaultValue={organization.name} required />
          </label>
          <label>
            slug
            <input name="slug" defaultValue={organization.slug} required />
          </label>
          <label>
            タイムゾーン
            <input name="timezone" defaultValue={organization.timezone} required />
          </label>
          <label>
            状態
            <input value={organization.status} disabled />
          </label>
          <button>保存</button>
          {message && <p>{message}</p>}
        </form>
      </section>
    </main>
  );
}
