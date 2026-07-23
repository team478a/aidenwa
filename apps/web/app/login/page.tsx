'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch('/backend/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'ログインできませんでした');
      }
      router.replace('/dashboard');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ログインできませんでした');
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">SALES AI OS</p>
        <h1>管理画面にログイン</h1>
        <p className="muted">自社営業チーム向けの安全な運用コンソール</p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            メールアドレス
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            パスワード
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading}>
            {loading ? '確認中…' : 'ログイン'}
          </button>
        </form>
      </section>
    </main>
  );
}
