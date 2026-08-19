'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const currentPassword = data.get('currentPassword');
    const newPassword = data.get('newPassword');
    const confirmation = data.get('confirmation');
    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      typeof confirmation !== 'string'
    ) {
      setMessage('パスワードを入力してください');
      return;
    }
    if (newPassword !== confirmation) {
      setMessage('新しいパスワードが一致しません');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      router.replace('/login');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'パスワードを変更できませんでした');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="content narrow">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SECURITY</p>
          <h1>初期パスワードの変更</h1>
          <p className="muted">
            安全のため、一時パスワードを新しいパスワードへ変更してから利用してください。
          </p>
        </div>
      </div>
      <section className="panel">
        <form onSubmit={(event) => void submit(event)}>
          <label>
            現在の一時パスワード
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            新しいパスワード（12文字以上）
            <input
              name="newPassword"
              type="password"
              minLength={12}
              maxLength={200}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            新しいパスワード（確認）
            <input
              name="confirmation"
              type="password"
              minLength={12}
              maxLength={200}
              autoComplete="new-password"
              required
            />
          </label>
          <button disabled={saving}>{saving ? '変更中…' : 'パスワードを変更'}</button>
          {message && <p className="error">{message}</p>}
        </form>
      </section>
    </main>
  );
}
