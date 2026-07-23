'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type Log = {
  id: string;
  occurredAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  user: { name: string } | null;
  afterData: unknown;
};
export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  useEffect(() => {
    void api<{ auditLogs: Log[] }>('/audit-logs').then((r) => setLogs(r.auditLogs));
  }, []);
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPLIANCE</p>
          <h1>監査ログ</h1>
        </div>
      </div>
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>日時</th>
              <th>操作者</th>
              <th>操作</th>
              <th>対象</th>
              <th>IP</th>
              <th>詳細</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{new Date(log.occurredAt).toLocaleString('ja-JP')}</td>
                <td>{log.user?.name ?? '不明'}</td>
                <td>{log.action}</td>
                <td>
                  {log.entityType}
                  <small>{log.entityId}</small>
                </td>
                <td>{log.ipAddress ?? '—'}</td>
                <td>
                  <details>
                    <summary>表示</summary>
                    <pre>{JSON.stringify(log.afterData, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
