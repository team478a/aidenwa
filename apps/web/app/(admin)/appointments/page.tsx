'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
type Appointment = {
  id: string;
  status: string;
  startAt: string;
  endAt: string;
  displayTimezone: string;
  meetingTypeCode: string;
  locationType: string;
  version: number;
  companyId: string;
};
export default function AppointmentsPage() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [message, setMessage] = useState('');
  async function refresh() {
    setItems((await api<{ appointments: Appointment[] }>('/appointments')).appointments);
  }
  useEffect(() => {
    void refresh().catch((e: unknown) =>
      setMessage(e instanceof Error ? e.message : '読込に失敗しました'),
    );
  }, []);
  async function action(item: Appointment, name: 'complete' | 'no-show' | 'cancel') {
    await api(`/appointments/${item.id}/${name}`, {
      method: 'POST',
      body: JSON.stringify({
        version: item.version,
        reasonCode: name === 'no-show' ? 'customer_absent' : 'sales_update',
      }),
    });
    await refresh();
  }
  return (
    <main className="content">
      <h1>今日の商談予定</h1>
      <p className="notice">
        内部予約台帳です。外部カレンダーへの登録・招待送信・会議URL作成は行いません。
      </p>
      {message && <p role="status">{message}</p>}
      <section className="card-grid">
        {items.map((item) => (
          <article className="panel" key={item.id}>
            <h2>
              {new Date(item.startAt).toLocaleString('ja-JP', { timeZone: item.displayTimezone })}
            </h2>
            <p>
              {item.meetingTypeCode} / {item.locationType}
            </p>
            <p>
              状態: {item.status} / timezone: {item.displayTimezone}
            </p>
            <p>企業参照: {item.companyId.slice(0, 8)}…</p>
            <div className="actions">
              {item.status === 'confirmed' && (
                <>
                  <button className="primary" onClick={() => void action(item, 'complete')}>
                    完了
                  </button>
                  <button onClick={() => void action(item, 'no-show')}>不在</button>
                </>
              )}{' '}
              {!['completed', 'cancelled', 'expired', 'no_show'].includes(item.status) && (
                <button onClick={() => void action(item, 'cancel')}>取消</button>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
