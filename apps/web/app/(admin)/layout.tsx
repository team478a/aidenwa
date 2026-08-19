'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api, roleLabels, type CurrentUser, type Role } from '../../lib/api';

type MenuLink = { href: string; label: string; roles: readonly Role[] };
type MenuGroup = { label: string; links: readonly MenuLink[] };
const allRoles: readonly Role[] = ['system_admin', 'admin', 'manager', 'operator', 'sales'];
const menuGroups: readonly MenuGroup[] = [
  { label: 'ホーム', links: [{ href: '/dashboard', label: 'ダッシュボード', roles: allRoles }] },
  {
    label: 'AI電話を始める',
    links: [
      { href: '/imports', label: 'CSVインポート', roles: ['admin', 'manager'] },
      { href: '/sales-lists', label: '営業リスト', roles: ['admin', 'manager'] },
    ],
  },
  {
    label: 'AI電話設定',
    links: [
      { href: '/products', label: '商材', roles: ['admin', 'manager'] },
      { href: '/ai-agents', label: 'AI担当者', roles: ['admin', 'manager'] },
      { href: '/scenarios', label: 'シナリオ', roles: ['admin', 'manager'] },
      { href: '/knowledge', label: 'FAQ・ナレッジ', roles: ['admin', 'manager'] },
    ],
  },
  {
    label: 'キャンペーン',
    links: [
      { href: '/campaigns', label: 'キャンペーン', roles: ['admin', 'manager'] },
      { href: '/call-jobs', label: '架電', roles: ['admin', 'manager'] },
      { href: '/conversation-quality', label: 'AI会話品質', roles: ['admin', 'manager'] },
    ],
  },
  {
    label: '対応・引継ぎ',
    links: [
      { href: '/sales-handoffs', label: '電話対応・営業引継ぎ', roles: allRoles },
      { href: '/opt-outs', label: '営業禁止', roles: ['admin', 'manager', 'sales'] },
    ],
  },
  {
    label: '商談',
    links: [{ href: '/appointments', label: '商談予定', roles: ['admin', 'manager', 'sales'] }],
  },
  {
    label: 'リスト',
    links: [
      { href: '/companies', label: '企業', roles: ['admin', 'manager', 'sales'] },
      { href: '/tags', label: 'タグ', roles: ['admin', 'manager'] },
    ],
  },
  {
    label: '組織管理',
    links: [
      { href: '/users', label: 'ユーザー', roles: ['admin'] },
      { href: '/teams', label: 'チーム', roles: ['admin'] },
      { href: '/organization', label: '組織設定', roles: ['admin'] },
      { href: '/audit-logs', label: '監査ログ', roles: ['admin'] },
      { href: '/integrations', label: '外部システム連携', roles: ['admin'] },
    ],
  },
  {
    label: 'システム設定',
    links: [
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
      { href: '/appointment-settings', label: '予約設定', roles: ['admin', 'manager'] },
    ],
  },
];
const links = menuGroups.flatMap((group) => group.links);
const matchesRoute = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api<{ user: CurrentUser }>('/auth/me')
      .then((result) => {
        const route = links.find((item) => matchesRoute(pathname, item.href));
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
      <aside>
        <div>
          <p className="eyebrow">SALES AI OS</p>
          <strong>Operations</strong>
        </div>
        <nav>
          {menuGroups.map((group) => {
            const visible = group.links.filter((item) => item.roles.includes(user.role));
            if (visible.length === 0) return null;
            return (
              <div className="nav-group" key={group.label}>
                <small>{group.label}</small>
                {visible.map((item) => (
                  <Link
                    className={matchesRoute(pathname, item.href) ? 'active' : ''}
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <span>{user.name}</span>
          <small>
            {user.email} · {roleLabels[user.role]}
          </small>
          <button className="secondary" onClick={() => void logout()}>
            ログアウト
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <span>AI・DX無料診断</span>
          <span className="pill">Stage 1</span>
        </header>
        {children}
      </div>
    </div>
  );
}
