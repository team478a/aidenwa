'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, roleLabels, type Role } from '../../../../../lib/api';

type Organization = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  status: 'active' | 'suspended';
  plan: 'trial' | 'standard' | 'enterprise';
  monthlyCallLimit: number;
  concurrentCallLimit: number;
  monthlyCallCount: number;
  monthlyEstimatedCostMinor: number;
  lastUsedAt: string | null;
  emergencyStop: { reason: string; activatedAt: string } | null;
  users: {
    id: string;
    name: string;
    email: string;
    role: Role;
    status: string;
    lastLoginAt: string | null;
  }[];
  _count: { users: number; teams: number; companies: number };
};

export default function SystemOrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [message, setMessage] = useState('');

  async function load() {
    const result = await api<{ organization: Organization }>(`/system/organizations/${id}`);
    setOrganization(result.organization);
  }
  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [id]);

  async function changeStatus(action: 'suspend' | 'activate') {
    if (
      action === 'suspend' &&
      !window.confirm('この企業を停止し、既存セッションをすべて無効にしますか？')
    )
      return;
    try {
      await api(`/system/organizations/${id}/${action}`, { method: 'POST' });
      setMessage(
        action === 'suspend' ? 'クライアントを停止しました' : 'クライアントを再開しました',
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '更新できませんでした');
    }
  }

  async function saveLimits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api(`/system/organizations/${id}/limits`, {
        method: 'PATCH',
        body: JSON.stringify({
          plan: data.get('plan'),
          monthlyCallLimit: Number(data.get('monthlyCallLimit')),
          concurrentCallLimit: Number(data.get('concurrentCallLimit')),
        }),
      });
      setMessage('契約プランと利用上限を保存しました');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした');
    }
  }

  if (!organization) return <main className="loading">{message || '読み込み中…'}</main>;
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CLIENT DETAIL</p>
          <h1>{organization.name}</h1>
          <p className="muted">
            {organization.slug} / {organization.id}
          </p>
        </div>
        <Link className="button-link secondary" href="/system/organizations">
          一覧へ戻る
        </Link>
      </div>
      {message && <p>{message}</p>}
      <div className="cards">
        <section className="panel">
          <h2>利用状況</h2>
          <p>当月架電: {organization.monthlyCallCount.toLocaleString()}件</p>
          <p>当月推定原価: {organization.monthlyEstimatedCostMinor.toLocaleString()}円</p>
          <p>
            最終利用:{' '}
            {organization.lastUsedAt
              ? new Date(organization.lastUsedAt).toLocaleString('ja-JP', {
                  timeZone: 'Asia/Tokyo',
                })
              : '—'}
          </p>
        </section>
        <section className="panel">
          <h2>登録状況</h2>
          <p>ユーザー: {organization._count.users}名</p>
          <p>チーム: {organization._count.teams}件</p>
          <p>企業データ: {organization._count.companies}件</p>
        </section>
        <section className="panel">
          <h2>安全状態</h2>
          <p>組織状態: {organization.status === 'active' ? '利用中' : '停止中'}</p>
          <p>
            緊急停止:{' '}
            {organization.emergencyStop ? `有効（${organization.emergencyStop.reason}）` : 'なし'}
          </p>
          <button
            className={organization.status === 'active' ? 'danger' : ''}
            onClick={() =>
              void changeStatus(organization.status === 'active' ? 'suspend' : 'activate')
            }
          >
            {organization.status === 'active' ? 'クライアントを停止' : 'クライアントを再開'}
          </button>
        </section>
      </div>
      <section className="panel narrow">
        <h2>契約プラン・利用上限</h2>
        <form onSubmit={(event) => void saveLimits(event)}>
          <label>
            契約プラン
            <select name="plan" defaultValue={organization.plan}>
              <option value="trial">トライアル</option>
              <option value="standard">スタンダード</option>
              <option value="enterprise">エンタープライズ</option>
            </select>
          </label>
          <label>
            月間架電上限
            <input
              name="monthlyCallLimit"
              type="number"
              min="0"
              defaultValue={organization.monthlyCallLimit}
              required
            />
          </label>
          <label>
            同時架電上限
            <input
              name="concurrentCallLimit"
              type="number"
              min="1"
              defaultValue={organization.concurrentCallLimit}
              required
            />
          </label>
          <button>保存</button>
        </form>
      </section>
      <section className="panel table-wrap">
        <h2>ユーザー</h2>
        <table>
          <thead>
            <tr>
              <th>氏名</th>
              <th>メール</th>
              <th>役割</th>
              <th>状態</th>
              <th>最終ログイン</th>
            </tr>
          </thead>
          <tbody>
            {organization.users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{roleLabels[user.role]}</td>
                <td>{user.status}</td>
                <td>
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p>
        <Link href={`/system/organizations/${id}/audit-logs`}>この企業の監査ログを確認</Link>
      </p>
    </main>
  );
}
