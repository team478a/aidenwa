'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';
type Detail = {
  id: string;
  name: string;
  corporateNumber: string | null;
  industryName: string | null;
  prefecture: string | null;
  city: string | null;
  address: string | null;
  salesStatus: string;
  contacts: Array<{ id: string; name: string; department: string | null; email: string | null }>;
  phoneNumbers: Array<{
    id: string;
    rawNumber: string;
    type: string;
    isCallable: boolean;
    isPrimary: boolean;
  }>;
  companyTags: Array<{ tag: { id: string; name: string } }>;
  listCompanies: Array<{ salesList: { id: string; name: string } }>;
  optOuts: Array<{
    id: string;
    scope: string;
    channel: string;
    status: string;
    reasonCode: string;
  }>;
};
export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<Detail | null>(null);
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);
  const [lists, setLists] = useState<Array<{ id: string; name: string }>>([]);
  const [msg, setMsg] = useState('');
  const load = () => api<{ company: Detail }>(`/companies/${id}`).then((r) => setC(r.company));
  useEffect(() => {
    void Promise.all([
      load(),
      api<{ tags: Array<{ id: string; name: string }> }>('/tags')
        .then((r) => setTags(r.tags))
        .catch(() => undefined),
      api<{ salesLists: Array<{ id: string; name: string }> }>('/sales-lists')
        .then((r) => setLists(r.salesLists))
        .catch(() => undefined),
    ]);
  }, [id]);
  async function post(path: string, data: Record<string, unknown>) {
    try {
      await api(path, { method: 'POST', body: JSON.stringify(data) });
      setMsg('保存しました');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '保存できませんでした');
    }
  }
  if (!c) return <main className="loading">読み込み中…</main>;
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPANY</p>
          <h1>{c.name}</h1>
          <p>
            {c.corporateNumber ?? '法人番号未登録'} · {c.salesStatus}
          </p>
        </div>
      </div>
      {msg && <p>{msg}</p>}
      <section className="panel">
        <h2>基本情報</h2>
        <p>
          {c.industryName ?? '業種未設定'} / {c.prefecture}
          {c.city}
          {c.address}
        </p>
      </section>
      <div className="cards">
        <section className="panel">
          <h2>担当者</h2>
          {c.contacts.map((x) => (
            <p key={x.id}>
              {x.name} {x.department} <small>{x.email}</small>
            </p>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void post(`/companies/${id}/contacts`, {
                name: d.get('name'),
                department: d.get('department') || null,
                email: d.get('email') || null,
              });
            }}
          >
            <input name="name" placeholder="担当者名" required />
            <input name="department" placeholder="部署" />
            <input name="email" type="email" placeholder="メール" />
            <button>追加</button>
          </form>
        </section>
        <section className="panel">
          <h2>電話番号</h2>
          {c.phoneNumbers.map((x) => (
            <p key={x.id}>
              {x.rawNumber} <span className="tag">{x.type}</span>{' '}
              {x.isCallable ? '架電可' : '架電不可'}
            </p>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void post(`/companies/${id}/phone-numbers`, {
                rawNumber: d.get('rawNumber'),
                type: d.get('type'),
                isPrimary: true,
                isCallable: true,
              });
            }}
          >
            <input name="rawNumber" placeholder="電話番号" required />
            <select name="type">
              <option value="representative">代表</option>
              <option value="mobile">携帯</option>
              <option value="fax">FAX</option>
            </select>
            <button>追加</button>
          </form>
        </section>
      </div>
      <div className="cards">
        <section className="panel">
          <h2>タグ・所属リスト</h2>
          <p>{c.companyTags.map((x) => x.tag.name).join('、') || 'タグなし'}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void post(`/companies/${id}/tags`, {
                tagId: new FormData(e.currentTarget).get('tagId'),
              });
            }}
          >
            <select name="tagId">
              {tags.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button>タグ付与</button>
          </form>
          <p>{c.listCompanies.map((x) => x.salesList.name).join('、') || 'リスト未所属'}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const selected = new FormData(e.currentTarget).get('listId');
              if (typeof selected !== 'string') return;
              const listId = selected;
              void post(`/sales-lists/${listId}/companies`, { companyIds: [id] });
            }}
          >
            <select name="listId">
              {lists.map((l) => (
                <option value={l.id} key={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <button>固定リストへ追加</button>
          </form>
        </section>
        <section className="panel">
          <h2>営業禁止</h2>
          {c.optOuts.map((o) => (
            <p key={o.id}>
              {o.scope}/{o.channel} {o.reasonCode} ({o.status})
            </p>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void post('/opt-outs', {
                companyId: id,
                scope: 'company',
                channel: 'all',
                reasonCode: d.get('reasonCode'),
                evidenceText: d.get('evidenceText'),
              });
            }}
          >
            <select name="reasonCode">
              <option value="customer_request">顧客要請</option>
              <option value="internal_block">社内停止</option>
            </select>
            <input name="evidenceText" placeholder="根拠" required />
            <button>営業禁止を登録</button>
          </form>
        </section>
      </div>
    </main>
  );
}
