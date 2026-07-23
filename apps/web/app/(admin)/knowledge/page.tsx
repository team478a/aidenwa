'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';
type KB = {
  id: string;
  name: string;
  documents: Array<{
    id: string;
    title: string;
    status: string;
    entries: Array<{ id: string; question: string }>;
  }>;
};
export default function Page() {
  const [items, setItems] = useState<KB[]>([]);
  const [result, setResult] = useState('');
  const load = () =>
    api<{ knowledgeBases: KB[] }>('/knowledge-bases').then((r) => setItems(r.knowledgeBases));
  useEffect(() => {
    void load();
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const kb = await api<{ knowledgeBase: { id: string } }>('/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify({ name: d.get('name') }),
    });
    const doc = await api<{ knowledgeDocument: { id: string } }>(
      `/knowledge-bases/${kb.knowledgeBase.id}/documents`,
      { method: 'POST', body: JSON.stringify({ title: 'FAQ v1', sourceType: 'faq' }) },
    );
    await api(`/knowledge-documents/${doc.knowledgeDocument.id}/entries`, {
      method: 'POST',
      body: JSON.stringify({
        question: d.get('question'),
        answer: d.get('answer'),
        keywords: ['料金', '安全'],
      }),
    });
    await api(`/knowledge-documents/${doc.knowledgeDocument.id}/publish`, { method: 'POST' });
    await load();
  }
  async function search(id: string) {
    const r = await api<{ results: Array<{ entryId: string; answer: string }> }>(
      `/knowledge-bases/${id}/search`,
      { method: 'POST', body: JSON.stringify({ query: '料金' }) },
    );
    setResult(r.results.map((x) => `${x.entryId}: ${x.answer}`).join('\n'));
  }
  return (
    <main className="content">
      <h1>FAQ・ナレッジ</h1>
      <p className="notice">手入力・公開済み・有効期間内のみ検索。外部RAGなし。</p>
      <section className="panel">
        <form onSubmit={(e) => void create(e)}>
          <input name="name" placeholder="ナレッジ名" required />
          <input name="question" placeholder="質問" required />
          <input name="answer" placeholder="回答" required />
          <button>FAQを作成・公開</button>
        </form>
      </section>
      {result && <pre className="panel">{result}</pre>}
      {items.map((x) => (
        <section className="panel" key={x.id}>
          <h2>{x.name}</h2>
          <p>{x.documents.map((d) => `${d.title}:${d.status}`).join('、')}</p>
          <button onClick={() => void search(x.id)}>公開FAQを検索</button>
        </section>
      ))}
    </main>
  );
}
