'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type Policy = {
  id: string;
  name: string;
  version: number;
  status: string;
  timezone: string;
  durationMinutes: number;
};
export default function AppointmentSettingsPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [dashboard, setDashboard] = useState<Record<string, number | null>>({});
  async function refresh() {
    const [p, d] = await Promise.all([
      api<{ policies: Policy[] }>('/appointment-policies'),
      api<Record<string, number | null>>('/appointment-dashboard'),
    ]);
    setPolicies(p.policies);
    setDashboard(d);
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function create() {
    await api('/appointment-policies', {
      method: 'POST',
      body: JSON.stringify({
        name: '標準商談',
        timezone: 'Asia/Tokyo',
        meetingTypeCode: 'sales_meeting',
        durationMinutes: 30,
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 10,
        minimumNoticeMinutes: 60,
        maximumAdvanceDays: 30,
        holdTtlMinutes: 10,
        cancellationDeadlineMinutes: 60,
        assignmentMode: 'manual',
      }),
    });
    await refresh();
  }
  async function step(p: Policy, a: 'validate' | 'publish') {
    await api(`/appointment-policies/${p.id}/${a}`, { method: 'POST' });
    await refresh();
  }
  return (
    <main className="content">
      <h1>商談予約設定</h1>
      <p className="notice">Calendar ProviderはInternal/Fakeのみです。外部同期は無効です。</p>
      <section className="panel">
        <h2>KPI</h2>
        <p>
          hold {dashboard.held ?? 0} / confirmed {dashboard.confirmed ?? 0} / completed{' '}
          {dashboard.completed ?? 0} / cancelled {dashboard.cancelled ?? 0} / no-show{' '}
          {dashboard.noShow ?? 0}
        </p>
      </section>
      <section className="panel">
        <h2>予約policy</h2>
        <button onClick={() => void create()}>標準policy draftを作成</button>
        {policies.map((p) => (
          <article key={p.id}>
            <p>
              {p.name} v{p.version} / {p.status} / {p.durationMinutes}分 / {p.timezone}
            </p>
            {p.status === 'draft' && <button onClick={() => void step(p, 'validate')}>検証</button>}
            {p.status === 'validated' && (
              <button className="primary" onClick={() => void step(p, 'publish')}>
                公開
              </button>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
