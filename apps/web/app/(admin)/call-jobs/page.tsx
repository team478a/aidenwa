'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type Job = {
  id: string;
  status: string;
  fixture: string;
  provider: string;
  target: { companyId: string };
  attempts: Array<{ resultCode: string | null; summary: string | null }>;
};
export default function Page() {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    void api<{ callJobs: Job[] }>('/call-jobs').then((r) => setJobs(r.callJobs));
  }, []);
  return (
    <main className="content">
      <h1>模擬通話ジョブ</h1>
      <p className="notice">模擬通話・外部発信なし。電話番号は表示・ログ送信しません。</p>
      <section className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>状態</th>
              <th>fixture</th>
              <th>結果</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{j.id}</td>
                <td>{j.status}</td>
                <td>{j.fixture}</td>
                <td>{j.attempts.map((a) => a.resultCode).join('、')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
