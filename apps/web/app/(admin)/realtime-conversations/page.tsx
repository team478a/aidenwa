'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';

type Task = {
  id: string;
  status: string;
  reasonCode: string;
  priority: string;
  dueAt: string | null;
  requestedTimeWindowCode: string;
  maskedDestination: string;
  assigneeUserId: string | null;
  version: number;
  snoozedUntil: string | null;
};
type Dashboard = {
  total: number;
  unassigned: number;
  overdue: number;
  attempted: number;
  connected: number;
  connectionRate: number | null;
  appointments: number;
  appointmentRate: number | null;
  averageFirstAttemptMs: number | null;
};
type Tab = 'today' | 'urgent' | 'overdue' | 'later';

export default function FollowupPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [tab, setTab] = useState<Tab>('today');
  const [message, setMessage] = useState('');
  async function refresh() {
    const result = await api<{ tasks: Task[] }>('/human-followup-tasks');
    setTasks(result.tasks);
    void api<Dashboard>('/human-followup-dashboard')
      .then(setDashboard)
      .catch(() => setDashboard(null));
  }
  useEffect(
    () =>
      void refresh().catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : '読込に失敗しました'),
      ),
    [],
  );
  const visible = useMemo(
    () =>
      tasks.filter((task) => {
        const due = task.dueAt ? new Date(task.dueAt) : null;
        const now = new Date();
        if (tab === 'urgent') return task.priority === 'urgent';
        if (tab === 'overdue')
          return Boolean(due && due < now && !['completed', 'cancelled'].includes(task.status));
        if (tab === 'later')
          return (
            task.status === 'snoozed' || Boolean(due && due.toDateString() !== now.toDateString())
          );
        return !['completed', 'cancelled', 'snoozed'].includes(task.status);
      }),
    [tasks, tab],
  );
  async function action(task: Task, suffix: string, body: Record<string, unknown>) {
    setMessage('');
    try {
      await api(`/human-followup-tasks/${task.id}/${suffix}`, {
        method: 'POST',
        body: JSON.stringify({ version: task.version, ...body }),
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '処理に失敗しました');
    }
  }
  return (
    <main className="content">
      <h1>Zoom Phone 営業フォローアップ</h1>
      <p className="notice">
        外部Zoom接続・自動発信は無効です。番号はマスク表示し、Zoom
        Phoneアプリから手動で対応してください。
      </p>
      {message && <p role="status">{message}</p>}
      {dashboard && (
        <section className="panel">
          <h2>直近30日</h2>
          <p>
            全件 {dashboard.total} / 未割当 {dashboard.unassigned} / 期限超過 {dashboard.overdue} /
            接続 {dashboard.connected} / 商談 {dashboard.appointments}
          </p>
          <p>
            接続率{' '}
            {dashboard.connectionRate === null
              ? '—'
              : `${Math.round(dashboard.connectionRate * 100)}%`}
            {' / '}商談化率{' '}
            {dashboard.appointmentRate === null
              ? '—'
              : `${Math.round(dashboard.appointmentRate * 100)}%`}
          </p>
        </section>
      )}
      <nav className="actions" aria-label="タスク絞り込み">
        {(['today', 'urgent', 'overdue', 'later'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={tab === value ? 'primary' : ''}
          >
            {{ today: '今日対応', urgent: '緊急', overdue: '期限超過', later: '後日対応' }[value]}
          </button>
        ))}
      </nav>
      <section className="card-grid">
        {visible.map((task) => (
          <article className="panel" key={task.id}>
            <h2>
              {task.priority === 'urgent' ? '緊急 ' : ''}
              {task.reasonCode}
            </h2>
            <p>宛先: {task.maskedDestination}</p>
            <p>希望時間: {task.requestedTimeWindowCode}</p>
            <p>状態: {task.status}</p>
            <p>期限: {task.dueAt ? new Date(task.dueAt).toLocaleString('ja-JP') : '指定なし'}</p>
            <div className="actions">
              {task.status === 'assigned' && (
                <button onClick={() => void action(task, 'accept', {})}>受諾</button>
              )}
              {!['completed', 'cancelled'].includes(task.status) && (
                <button onClick={() => void action(task, 'start', {})}>対応開始</button>
              )}
              <button
                onClick={() =>
                  void action(task, 'record-attempt', {
                    result: 'no_answer',
                    idempotencyKey: `manual-${task.id}-${task.version}`,
                  })
                }
              >
                手動発信・不在を記録
              </button>
              <button
                onClick={() =>
                  void action(task, 'snooze', {
                    until: new Date(Date.now() + 86_400_000).toISOString(),
                    reasonCode: 'customer_request',
                  })
                }
              >
                明日までスヌーズ
              </button>
              <button
                className="primary"
                onClick={() =>
                  void action(task, 'complete', {
                    outcomeCode: 'appointment_booked',
                    nextActionCode: 'appointment',
                  })
                }
              >
                商談化で完了
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
