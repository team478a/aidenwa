'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';
type Option = { id: string; name?: string; displayName?: string; status: string };
type Campaign = { id: string; name: string; status: string };
export default function Page() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [products, setProducts] = useState<Array<{ versions: Option[] }>>([]);
  const [agents, setAgents] = useState<Array<{ versions: Option[] }>>([]);
  const [scenarios, setScenarios] = useState<Array<{ versions: Option[] }>>([]);
  const [lists, setLists] = useState<Option[]>([]);
  const [msg, setMsg] = useState('');
  const load = async () => {
    const [c, p, a, s, l] = await Promise.all([
      api<{ campaigns: Campaign[] }>('/campaigns'),
      api<{ products: Array<{ versions: Option[] }> }>('/products'),
      api<{ aiAgents: Array<{ versions: Option[] }> }>('/ai-agents'),
      api<{ scenarios: Array<{ versions: Option[] }> }>('/scenarios'),
      api<{ salesLists: Option[] }>('/sales-lists'),
    ]);
    setCampaigns(c.campaigns);
    setProducts(p.products);
    setAgents(a.aiAgents);
    setScenarios(s.scenarios);
    setLists(l.salesLists);
  };
  useEffect(() => {
    void load();
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    await api('/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: d.get('name'),
        productVersionId: d.get('product'),
        aiAgentVersionId: d.get('agent'),
        scenarioVersionId: d.get('scenario'),
        salesListId: d.get('list'),
      }),
    });
    await load();
  }
  async function action(id: string, name: string) {
    const r = await api<Record<string, unknown>>(`/campaigns/${id}/${name}`, {
      method: 'POST',
      ...(name === 'mock-calls/run-next' ? { body: JSON.stringify({ fixture: 'qualified' }) } : {}),
    });
    setMsg(`${name}: ${JSON.stringify(r)}`);
    await load();
  }
  const pv = products.flatMap((x) => x.versions).filter((x) => x.status === 'published'),
    av = agents.flatMap((x) => x.versions).filter((x) => x.status === 'published'),
    sv = scenarios.flatMap((x) => x.versions).filter((x) => x.status === 'published');
  return (
    <main className="content">
      <h1>キャンペーン</h1>
      <p className="notice">模擬通話・外部発信なし</p>
      {msg && <pre>{msg}</pre>}
      <section className="panel">
        <form onSubmit={(e) => void create(e)}>
          <input name="name" placeholder="キャンペーン名" required />
          <select name="product">
            {pv.map((x) => (
              <option value={x.id} key={x.id}>
                {x.id}
              </option>
            ))}
          </select>
          <select name="agent">
            {av.map((x) => (
              <option value={x.id} key={x.id}>
                {x.id}
              </option>
            ))}
          </select>
          <select name="scenario">
            {sv.map((x) => (
              <option value={x.id} key={x.id}>
                {x.id}
              </option>
            ))}
          </select>
          <select name="list">
            {lists.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <button>作成</button>
        </form>
      </section>
      {campaigns.map((x) => (
        <section className="panel" key={x.id}>
          <h2>{x.name}</h2>
          <p>{x.status}</p>
          <button onClick={() => void action(x.id, 'targets/preview')}>対象プレビュー</button>
          <button onClick={() => void action(x.id, 'targets/materialize')}>対象確定</button>
          <button onClick={() => void action(x.id, 'validate')}>検証</button>
          <button onClick={() => void action(x.id, 'approve')}>承認</button>
          <button onClick={() => void action(x.id, 'start')}>開始</button>
          <button onClick={() => void action(x.id, 'mock-calls/run-next')}>Mock qualified</button>
          <button onClick={() => void action(x.id, 'pause')}>一時停止</button>
        </section>
      ))}
    </main>
  );
}
