'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../../lib/api';

type Organization = {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  plan: 'trial' | 'standard' | 'enterprise';
  monthlyCallLimit: number;
  concurrentCallLimit: number;
  monthlyCallCount: number;
  monthlyEstimatedCostMinor: number;
  lastUsedAt: string | null;
  createdAt: string;
  emergencyStop: { reason: string } | null;
  _count: { users: number };
};

const planLabels = {
  trial: 'トライアル',
  standard: 'スタンダード',
  enterprise: 'エンタープライズ',
};

export default function SystemOrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    const result = await api<{ organizations: Organization[] }>('/system/organizations');
    setOrganizations(result.organizations);
  }

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const form = event.currentTarget;
    const data = new FormData(form);
    setCreating(true);
    try {
      await api('/system/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          slug: data.get('slug'),
          timezone: 'Asia/Tokyo',
          plan: data.get('plan'),
          monthlyCallLimit: Number(data.get('monthlyCallLimit')),
          concurrentCallLimit: Number(data.get('concurrentCallLimit')),
          administrator: {
            name: data.get('administratorName'),
            email: data.get('administratorEmail'),
            temporaryPassword: data.get('temporaryPassword'),
          },
        }),
      });
      form.reset();
      setMessage('クライアント企業を登録しました。一時パスワードは再表示されません。');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登録できませんでした');
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SYSTEM ADMIN</p>
          <h1>クライアント企業</h1>
          <p className="muted">契約状態、利用状況、安全停止を組織単位で管理します。</p>
        </div>
      </div>

      <section className="panel">
        <h2>クライアント企業を登録</h2>
        <form className="organization-create-form" onSubmit={(event) => void create(event)}>
          <label>
            企業名
            <input name="name" required maxLength={200} />
          </label>
          <label>
            ログイン用slug
            <input name="slug" required pattern="[a-z0-9-]+" maxLength={100} />
          </label>
          <label>
            契約プラン
            <select name="plan" defaultValue="trial">
              <option value="trial">トライアル</option>
              <option value="standard">スタンダード</option>
              <option value="enterprise">エンタープライズ</option>
            </select>
          </label>
          <label>
            月間架電上限
            <input name="monthlyCallLimit" type="number" min="0" defaultValue="1000" required />
          </label>
          <label>
            同時架電上限
            <input name="concurrentCallLimit" type="number" min="1" defaultValue="1" required />
          </label>
          <label>
            初期管理者名
            <input name="administratorName" required maxLength={100} />
          </label>
          <label>
            初期管理者メール
            <input name="administratorEmail" type="email" required />
          </label>
          <label>
            一時パスワード
            <input
              name="temporaryPassword"
              type="password"
              minLength={16}
              maxLength={200}
              autoComplete="new-password"
              required
            />
          </label>
          <button disabled={creating}>{creating ? '登録中…' : '登録する'}</button>
        </form>
        {message && <p>{message}</p>}
      </section>

      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>企業</th>
              <th>状態</th>
              <th>プラン</th>
              <th>ユーザー</th>
              <th>当月架電</th>
              <th>推定原価</th>
              <th>最終利用</th>
              <th>緊急停止</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((organization) => (
              <tr key={organization.id}>
                <td>
                  {organization.name}
                  <small>
                    {organization.slug} / {organization.id}
                  </small>
                </td>
                <td>{organization.status === 'active' ? '利用中' : '停止中'}</td>
                <td>{planLabels[organization.plan]}</td>
                <td>{organization._count.users}</td>
                <td>
                  {organization.monthlyCallCount.toLocaleString()} /{' '}
                  {organization.monthlyCallLimit.toLocaleString()}
                </td>
                <td>{organization.monthlyEstimatedCostMinor.toLocaleString()}円</td>
                <td>
                  {organization.lastUsedAt
                    ? new Date(organization.lastUsedAt).toLocaleString('ja-JP', {
                        timeZone: 'Asia/Tokyo',
                      })
                    : '—'}
                </td>
                <td>{organization.emergencyStop ? '有効' : 'なし'}</td>
                <td>
                  <Link
                    className="button-link small"
                    href={`/system/organizations/${organization.id}`}
                  >
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
