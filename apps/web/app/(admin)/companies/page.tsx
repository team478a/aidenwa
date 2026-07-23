'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';
type Company = {
  id: string;
  name: string;
  industryName: string | null;
  prefecture: string | null;
  city: string | null;
  salesStatus: string;
  owner: { name: string } | null;
  phoneNumbers: Array<{ rawNumber: string }>;
  contacts: Array<{ name: string }>;
  companyTags: Array<{ tag: { name: string; color: string } }>;
  optOuts: unknown[];
};
export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const load = () =>
    api<{ companies: Company[] }>(`/companies?q=${encodeURIComponent(q)}`)
      .then((r) => setCompanies(r.companies))
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget,
      d = new FormData(f);
    try {
      const r = await api<{ company: { id: string } }>('/companies', {
        method: 'POST',
        body: JSON.stringify({
          name: d.get('name'),
          corporateNumber: d.get('corporateNumber') || null,
          prefecture: d.get('prefecture') || null,
          city: d.get('city') || null,
          industryName: d.get('industryName') || null,
        }),
      });
      f.reset();
      location.href = `/companies/${r.company.id}`;
    } catch (c) {
      setError(c instanceof Error ? c.message : '作成できませんでした');
    }
  }
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SALES DATA</p>
          <h1>企業</h1>
        </div>
        <Link className="button-link" href="/imports">
          CSVインポート
        </Link>
      </div>
      <section className="panel">
        <form className="inline-form compact" onSubmit={(e) => void create(e)}>
          <input name="name" placeholder="企業名" required />
          <input name="corporateNumber" placeholder="法人番号（13桁）" />
          <input name="prefecture" placeholder="都道府県" />
          <input name="city" placeholder="市区町村" />
          <input name="industryName" placeholder="業種" />
          <button>新規登録</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
      <section className="panel">
        <form
          className="search-row"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="企業名で検索" />
          <button>検索</button>
        </form>
      </section>
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>企業名</th>
              <th>業種</th>
              <th>所在地</th>
              <th>主電話</th>
              <th>担当者</th>
              <th>状態</th>
              <th>タグ</th>
              <th>営業禁止</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/companies/${c.id}`}>{c.name}</Link>
                </td>
                <td>{c.industryName ?? '—'}</td>
                <td>
                  {c.prefecture}
                  {c.city}
                </td>
                <td>{c.phoneNumbers[0]?.rawNumber ?? '—'}</td>
                <td>{c.contacts[0]?.name ?? c.owner?.name ?? '—'}</td>
                <td>{c.salesStatus}</td>
                <td>
                  {c.companyTags.map((t) => (
                    <span className="tag" key={t.tag.name}>
                      {t.tag.name}
                    </span>
                  ))}
                </td>
                <td>{c.optOuts.length ? '停止中' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
