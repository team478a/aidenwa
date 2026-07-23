'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  team: { name: string } | null;
};
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const load = () =>
    api<{ users: User[] }>('/users')
      .then((result) => setUsers(result.users))
      .catch((cause: Error) => setError(cause.message));
  useEffect(() => {
    void load();
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          password: data.get('password'),
          role: data.get('role'),
        }),
      });
      form.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '作成できませんでした');
    }
  }
  async function toggle(user: User) {
    try {
      await api(`/users/${user.id}/${user.status === 'suspended' ? 'activate' : 'suspend'}`, {
        method: 'POST',
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '変更できませんでした');
    }
  }
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESS</p>
          <h1>ユーザー</h1>
        </div>
      </div>
      <section className="panel">
        <h2>新規ユーザー</h2>
        <form className="inline-form" onSubmit={(event) => void create(event)}>
          <input name="name" placeholder="氏名" required />
          <input name="email" type="email" placeholder="メール" required />
          <input
            name="password"
            type="password"
            placeholder="初期パスワード（12文字以上）"
            minLength={12}
            required
          />
          <select name="role" defaultValue="sales">
            <option value="sales">sales</option>
            <option value="manager">manager</option>
            <option value="admin">admin</option>
          </select>
          <button>作成</button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>氏名</th>
              <th>メール</th>
              <th>権限</th>
              <th>チーム</th>
              <th>状態</th>
              <th>最終ログイン</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <span className="tag">{user.role}</span>
                </td>
                <td>{user.team?.name ?? '未所属'}</td>
                <td>{user.status}</td>
                <td>
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ja-JP') : '—'}
                </td>
                <td>
                  <button className="secondary small" onClick={() => void toggle(user)}>
                    {user.status === 'suspended' ? '再開' : '停止'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
