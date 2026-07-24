'use client';
import { useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';
type Job = {
  id: string;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  importedRows: number;
  skippedRows: number;
};
export default function Imports() {
  const [job, setJob] = useState<Job | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<
    Array<{
      rowNumber: number;
      normalizedData: Record<string, string>;
      duplicateCandidates: unknown[];
    }>
  >([]);
  const [msg, setMsg] = useState('');
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget,
      d = new FormData(f);
    const res = await fetch('/backend/imports/companies/upload', {
      method: 'POST',
      headers: {
        'x-csrf-token': decodeURIComponent(
          document.cookie
            .split('; ')
            .find((x) => x.startsWith('sales_ai_csrf='))
            ?.split('=')[1] ?? '',
        ),
      },
      body: d,
    });
    if (!res.ok) {
      setMsg('アップロードに失敗しました');
      return;
    }
    const body = (await res.json()) as { importJob: Job; headers: string[] };
    setJob(body.importJob);
    setHeaders(body.headers);
  }
  async function mapping() {
    if (!job) return;
    const common: Record<string, string> = {};
    for (const field of [
      'name',
      'corporateNumber',
      'phone',
      'phoneType',
      'websiteUrl',
      'contactName',
      'email',
      'prefecture',
      'city',
      'address',
    ]) {
      const found = headers.find((h) => h === field || h.includes(field));
      if (found) common[field] = found;
    }
    const queued = await api<{ importJob: Job }>(`/imports/companies/${job.id}/mapping`, {
      method: 'POST',
      body: JSON.stringify({ mapping: common, duplicatePolicy: 'create' }),
    });
    setJob(queued.importJob);
    setMsg('プレビューをWorkerで準備しています');
    const timer = setInterval(
      () =>
        void api<{ importJob: Job }>(`/imports/companies/${job.id}/status`).then(async (result) => {
          setJob(result.importJob);
          if (result.importJob.status === 'preview_ready') {
            clearInterval(timer);
            const preview = await api<{ importJob: Job; rows: typeof rows }>(
              `/imports/companies/${job.id}/preview`,
            );
            setJob(preview.importJob);
            setRows(preview.rows);
            setMsg('');
          } else if (['failed', 'cancelled'].includes(result.importJob.status)) {
            clearInterval(timer);
            setMsg('プレビュー準備に失敗または中止しました');
          }
        }),
      500,
    );
  }
  async function execute() {
    if (!job) return;
    await api(`/imports/companies/${job.id}/execute`, { method: 'POST' });
    setMsg('Workerへ登録しました');
    const timer = setInterval(
      () =>
        void api<{ importJob: Job }>(`/imports/companies/${job.id}/status`).then((r) => {
          setJob(r.importJob);
          if (r.importJob.status.startsWith('completed') || r.importJob.status === 'failed')
            clearInterval(timer);
        }),
      1000,
    );
  }
  return (
    <main className="content">
      <div className="page-heading">
        <h1>CSVインポート</h1>
      </div>
      <section className="panel">
        <form onSubmit={(e) => void upload(e)}>
          <input type="file" name="file" accept=".csv,text/csv" required />
          <select name="encoding">
            <option value="utf8">UTF-8</option>
            <option value="cp932">Shift_JIS / CP932</option>
          </select>
          <button>アップロード</button>
        </form>
      </section>
      {job && (
        <section className="panel">
          <p>
            状態: <strong>{job.status}</strong> / {job.totalRows}行 / 取込{job.importedRows} /
            エラー{job.errorRows}
          </p>
          {job.status === 'mapping_required' && (
            <button onClick={() => void mapping()}>標準列をマッピングしてプレビュー</button>
          )}
          {job.status === 'preview_ready' && (
            <button onClick={() => void execute()}>非同期実行</button>
          )}
          {msg && <p>{msg}</p>}
          <div className="table-wrap">
            <table>
              <tbody>
                {rows.slice(0, 10).map((r) => (
                  <tr key={r.rowNumber}>
                    <td>{r.rowNumber}</td>
                    <td>{r.normalizedData.name}</td>
                    <td>{r.duplicateCandidates.length ? '重複候補あり' : '新規候補'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
