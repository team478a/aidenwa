'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api, type CurrentUser, type Role } from '../../lib/api';

const links: ReadonlyArray<{ href: string; label: string; roles: readonly Role[] }> = [
  {
    href: '/production-readiness',
    label: '実電話準備・安全管理',
    roles: ['system_admin', 'admin', 'manager'],
  },
  { href: '/production-approvals', label: '実電話承認管理', roles: ['system_admin', 'admin'] },
  {
    href: '/production-operations',
    label: '発信上限・拒否監視',
    roles: ['system_admin', 'admin', 'manager'],
  },
  {
    href: '/twilio-limited-test',
    label: 'Twilio限定テスト',
    roles: ['system_admin', 'admin', 'manager'],
  },
  {
    href: '/realtime-conversations',
    label: 'AIリアルタイム会話',
    roles: ['system_admin', 'admin', 'manager'],
  },
  {
    href: '/sales-handoffs',
    label: 'AI営業引継ぎ',
    roles: ['system_admin', 'admin', 'manager', 'sales'],
  },
  { href: '/conversation-quality', label: 'AI会話品質', roles: ['admin', 'manager'] },
  { href: '/appointments', label: '商談予定', roles: ['admin', 'manager', 'sales'] },
  { href: '/appointment-settings', label: '予約設定', roles: ['admin', 'manager'] },
  {
    href: '/dashboard',
    label: 'ダッシュボード',
    roles: ['system_admin', 'admin', 'manager', 'sales'],
  },
  { href: '/companies', label: '企業', roles: ['admin', 'manager', 'sales'] },
  { href: '/imports', label: 'CSVインポート', roles: ['admin', 'manager'] },
  { href: '/sales-lists', label: '営業リスト', roles: ['admin', 'manager'] },
  { href: '/tags', label: 'タグ', roles: ['admin', 'manager'] },
  { href: '/opt-outs', label: '営業禁止', roles: ['admin', 'manager', 'sales'] },
  { href: '/products', label: '商材', roles: ['admin', 'manager', 'sales'] },
  { href: '/ai-agents', label: 'AI担当者', roles: ['admin', 'manager', 'sales'] },
  { href: '/scenarios', label: 'シナリオ', roles: ['admin', 'manager', 'sales'] },
  { href: '/knowledge', label: 'FAQ・ナレッジ', roles: ['admin', 'manager', 'sales'] },
  { href: '/campaigns', label: 'キャンペーン', roles: ['admin', 'manager', 'sales'] },
  { href: '/call-jobs', label: '模擬通話', roles: ['admin', 'manager', 'sales'] },
  { href: '/users', label: 'ユーザー', roles: ['admin', 'manager'] },
  { href: '/teams', label: 'チーム', roles: ['admin', 'manager'] },
  { href: '/organization', label: '組織設定', roles: ['admin'] },
  { href: '/audit-logs', label: '監査ログ', roles: ['admin'] },
  { href: '/integrations', label: '外部連携', roles: ['admin'] },
];

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api<{ user: CurrentUser }>('/auth/me')
      .then((result) => {
        const route = links.find((item) => item.href === pathname);
        if (route && !route.roles.includes(result.user.role)) router.replace('/dashboard');
        else setUser(result.user);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setReady(true));
  }, [pathname, router]);
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }
  if (!ready) return <main className="loading">セッションを確認中…</main>;
  if (!user) return null;
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">SALES AI OS</p>
          <strong>Operations</strong>
        </div>
        <nav aria-label="管理メニュー" className="sidebar-nav">
          {links
            .filter((item) => item.roles.includes(user.role))
            .map((item) => (
              <Link
                className={pathname === item.href ? 'active' : ''}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
        </nav>
        <div className="sidebar-foot">
          <span>{user.name}</span>
          <small>
            {user.email} · {user.role}
          </small>
          <button className="secondary" onClick={() => void logout()}>
            ログアウト
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <span>AI・DX無料診断</span>
          <span className="pill">Stage 1</span>
        </header>
        {children}
      </div>
    </div>
  );
}
