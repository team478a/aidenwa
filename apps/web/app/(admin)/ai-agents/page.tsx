'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';
type Item = {
  id: string;
  name: string;
  status: string;
  versions: Array<{ id: string; versionNumber: number; status: string }>;
};
export default function Page() {
  const [items, setItems] = useState<Item[]>([]);
  const load = () => api<{ aiAgents: Item[] }>('/ai-agents').then((r) => setItems(r.aiAgents));
  useEffect(() => {
    void load();
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await api('/ai-agents', {
      method: 'POST',
      body: JSON.stringify({ name: new FormData(e.currentTarget).get('name') }),
    });
    await load();
  }
  async function version(x: Item) {
    const r = await api<{ aiAgentVersion: { id: string } }>(`/ai-agents/${x.id}/versions`, {
      method: 'POST',
      body: JSON.stringify({
        displayName: x.name,
        aiDisclosure: 'AI担当者による模擬応対です',
        fallbackMessage: '確認できません',
        closingMessage: 'ありがとうございました',
      }),
    });
    await api(`/ai-agent-versions/${r.aiAgentVersion.id}/publish`, { method: 'POST' });
    await load();
  }
  return (
    <main className="content">
      <h1>AI担当者</h1>
      <p className="notice">模擬通話専用・録音なし・外部発信なし</p>
      <section className="panel">
        <form onSubmit={(e) => void create(e)}>
          <input name="name" placeholder="AI担当者名" required />
          <button>作成</button>
        </form>
      </section>
      {items.map((x) => (
        <section className="panel" key={x.id}>
          <h2>{x.name}</h2>
          <p>{x.versions.map((v) => `v${v.versionNumber}:${v.status}`).join('、') || '版なし'}</p>
          <button onClick={() => void version(x)}>安全設定で版を公開</button>
        </section>
      ))}
    </main>
  );
}
