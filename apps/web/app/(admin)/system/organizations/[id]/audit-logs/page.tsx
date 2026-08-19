'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../../../../lib/api';

type Log = {
  id: string;
  occurredAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  user: { name: string } | null;
  afterData: unknown;
};

export default function SystemOrganizationAuditLogsPage() {
  const { id } = useParams<{ id: string }>();
  const [logs, setLogs] = useState<Log[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    void api<{ auditLogs: Log[] }>(`/system/organizations/${id}/audit-logs`)
      .then((result) => setLogs(result.auditLogs))
      .catch((error: Error) => setMessage(error.message));
  }, [id]);
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CLIENT AUDIT</p>
          <h1>クライアント監査ログ</h1>
        </div>
      </div>
      {message && <p className="error">{message}</p>}
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>日時</th>
              <th>操作者</th>
              <th>操作</th>
              <th>対象</th>
              <th>詳細</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>
                  {new Date(log.occurredAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                </td>
                <td>{log.user?.name ?? 'システム'}</td>
                <td>{log.action}</td>
                <td>
                  {log.entityType}
                  <small>{log.entityId}</small>
                </td>
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
