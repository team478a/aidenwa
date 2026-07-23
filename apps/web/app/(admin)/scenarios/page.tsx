'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';
type V = { id: string; versionNumber: number; status: string; validationStatus: string };
type Item = { id: string; name: string; versions: V[] };
export default function Page() {
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState('');
  const load = () => api<{ scenarios: Item[] }>('/scenarios').then((r) => setItems(r.scenarios));
  useEffect(() => {
    void load();
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await api('/scenarios', {
      method: 'POST',
      body: JSON.stringify({
        name: new FormData(e.currentTarget).get('name'),
        purpose: '模擬営業',
      }),
    });
    await load();
  }
  async function build(id: string) {
    const r = await api<{ scenarioVersion: { id: string } }>(`/scenarios/${id}/versions`, {
      method: 'POST',
    });
    await api(`/scenario-versions/${r.scenarioVersion.id}/graph`, {
      method: 'PUT',
      body: JSON.stringify({
        nodes: [
          { nodeKey: 'start', nodeType: 'start', title: '開始' },
          {
            nodeKey: 'listen',
            nodeType: 'listen',
            title: '要件確認',
            messageTemplate: '{{company.name}}様へご案内します',
          },
          { nodeKey: 'end', nodeType: 'end', title: '終了' },
        ],
        edges: [
          { fromNodeKey: 'start', toNodeKey: 'listen', conditionType: 'default' },
          { fromNodeKey: 'listen', toNodeKey: 'end', conditionType: 'default' },
        ],
      }),
    });
    await api(`/scenario-versions/${r.scenarioVersion.id}/validate`, { method: 'POST' });
    await api(`/scenario-versions/${r.scenarioVersion.id}/publish`, { method: 'POST' });
    const sim = await api<{ path: string[] }>(
      `/scenario-versions/${r.scenarioVersion.id}/simulate`,
      { method: 'POST', body: JSON.stringify({ intents: ['default', 'default'] }) },
    );
    setMsg(`模擬遷移: ${sim.path.join(' → ')}`);
    await load();
  }
  return (
    <main className="content">
      <h1>シナリオ</h1>
      <p className="notice">ルールベースの決定的simulation。外部LLM不使用。</p>
      {msg && <p>{msg}</p>}
      <section className="panel">
        <form onSubmit={(e) => void create(e)}>
          <input name="name" placeholder="シナリオ名" required />
          <button>作成</button>
        </form>
      </section>
      {items.map((x) => (
        <section className="panel" key={x.id}>
          <h2>{x.name}</h2>
          <p>
            {x.versions
              .map((v) => `v${v.versionNumber}:${v.status}/${v.validationStatus}`)
              .join('、') || '版なし'}
          </p>
          <button onClick={() => void build(x.id)}>標準フローを検証・公開・simulate</button>
        </section>
      ))}
    </main>
  );
}
