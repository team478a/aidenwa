'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../../../lib/api';

type Client = {
  id: string;
  name: string;
  environment: string;
  status: string;
  apiKeyPrefix: string;
  dailyCallLimit: number;
  concurrentCallLimit: number;
  webhookEndpoint: string | null;
  allowedCallProfiles: string[];
  rateLimitPerMinute: number;
};
type Profile = { id: string; publicId: string; name: string; environment: string; status: string };
type Delivery = {
  id: string;
  status: string;
  attemptCount: number;
  failureCode: string | null;
  webhookEvent: { publicId: string; eventType: string; createdAt: string };
};

export default function IntegrationsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [message, setMessage] = useState('');
  const [issuedSecret, setIssuedSecret] = useState('');
  const load = useCallback(async () => {
    const [clientData, profileData, deliveryData] = await Promise.all([
      api<{ clients: Client[] }>('/integrations/clients'),
      api<{ profiles: Profile[] }>('/integrations/call-profiles'),
      api<{ deliveries: Delivery[] }>('/integrations/webhook-deliveries'),
    ]);
    setClients(clientData.clients);
    setProfiles(profileData.profiles);
    setDeliveries(deliveryData.deliveries);
  }, []);
  useEffect(() => void load(), [load]);
  async function retry(id: string) {
    await api(`/integrations/webhook-deliveries/${id}/retry`, { method: 'POST' });
    setMessage('Webhookを再送キューへ登録しました');
    await load();
  }
  async function setClientStatus(client: Client) {
    const status = client.status === 'active' ? 'suspended' : 'active';
    await api(`/integrations/clients/${client.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    setMessage(status === 'suspended' ? 'Clientを停止しました' : 'Clientを再開しました');
    await load();
  }
  async function rotateApiKey(client: Client) {
    const result = await api<{ apiKey: string }>(
      `/integrations/clients/${client.id}/rotate-api-key`,
      { method: 'POST' },
    );
    setIssuedSecret(`新しいAPI Key: ${result.apiKey}`);
    setMessage('以前のAPI Keyを無効化しました。新しいKeyは今だけ表示されます。');
    await load();
  }
  async function updateClient(event: FormEvent<HTMLFormElement>, client: Client) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api(`/integrations/clients/${client.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        allowedCallProfiles: form
          .getAll('allowedCallProfiles')
          .filter((value): value is string => typeof value === 'string'),
        rateLimitPerMinute: Number(form.get('rateLimitPerMinute')),
        dailyCallLimit: Number(form.get('dailyCallLimit')),
        concurrentCallLimit: Number(form.get('concurrentCallLimit')),
      }),
    });
    setMessage('Client設定を更新しました');
    await load();
  }
  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api('/integrations/call-profiles', {
      method: 'POST',
      body: JSON.stringify({
        publicId: form.get('publicId'),
        name: form.get('name'),
        description: form.get('description'),
        environment: 'sandbox',
        productVersionId: form.get('productVersionId'),
        aiAgentVersionId: form.get('aiAgentVersionId'),
        scenarioVersionId: form.get('scenarioVersionId'),
        timezone: 'Asia/Tokyo',
        callableWeekdays: [1, 2, 3, 4, 5],
        callableStartTime: form.get('callableStartTime'),
        callableEndTime: form.get('callableEndTime'),
        dailyCallLimit: Number(form.get('dailyCallLimit')),
        concurrentCallLimit: Number(form.get('concurrentCallLimit')),
        status: 'active',
      }),
    });
    setMessage('Sandbox Call Profileを作成しました');
    event.currentTarget.reset();
    await load();
  }
  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const webhookValue = form.get('webhookEndpoint');
    const nameValue = form.get('name');
    const webhookEndpoint = typeof webhookValue === 'string' ? webhookValue.trim() : '';
    const allowedCallProfiles = form
      .getAll('allowedCallProfiles')
      .filter((value): value is string => typeof value === 'string');
    const result = await api<{ apiKey: string; webhookSecret?: string }>('/integrations/clients', {
      method: 'POST',
      body: JSON.stringify({
        name: typeof nameValue === 'string' ? nameValue : '',
        environment: 'sandbox',
        allowedScopes: [
          'calls:create',
          'calls:read',
          'calls:cancel',
          'calls:stop',
          'call-batches:create',
          'call-batches:read',
          'call-results:read',
          'call-profiles:read',
        ],
        allowedCallProfiles,
        allowedIps: [],
        dailyCallLimit: Number(form.get('dailyCallLimit')),
        concurrentCallLimit: Number(form.get('concurrentCallLimit')),
        ...(webhookEndpoint ? { webhookEndpoint } : {}),
      }),
    });
    setIssuedSecret(
      `API Key: ${result.apiKey}${result.webhookSecret ? ` / Webhook Secret: ${result.webhookSecret}` : ''}`,
    );
    setMessage('Sandbox Integration Clientを作成しました。認証情報は今だけ表示されます。');
    event.currentTarget.reset();
    await load();
  }
  return (
    <main>
      <div className="page-heading">
        <div>
          <p className="eyebrow">HEADLESS API</p>
          <h1>外部連携</h1>
          <p>Integration Client、Call Profile、Webhook配信を組織内で監視します。</p>
        </div>
        <span className="pill">PRODUCTION GATE REQUIRED</span>
      </div>
      {message && <p className="notice">{message}</p>}
      {issuedSecret && <p className="notice">{issuedSecret}</p>}
      <section className="card">
        <h2>Sandbox Client作成</h2>
        <form onSubmit={(event) => void createClient(event)}>
          <label>
            名称
            <input name="name" required maxLength={200} />
          </label>
          <label>
            利用可能Call Profile（複数選択可）
            <select
              name="allowedCallProfiles"
              multiple
              size={Math.min(Math.max(profiles.length, 2), 6)}
            >
              {profiles
                .filter(
                  (profile) => profile.environment === 'sandbox' && profile.status === 'active',
                )
                .map((profile) => (
                  <option key={profile.id} value={profile.publicId}>
                    {profile.name}（{profile.publicId}）
                  </option>
                ))}
            </select>
          </label>
          <label>
            日次上限
            <input
              name="dailyCallLimit"
              type="number"
              min="1"
              max="100000"
              defaultValue="100"
              required
            />
          </label>
          <label>
            同時実行上限
            <input
              name="concurrentCallLimit"
              type="number"
              min="1"
              max="100"
              defaultValue="1"
              required
            />
          </label>
          <label>
            Webhook URL（任意）
            <input name="webhookEndpoint" type="url" />
          </label>
          <button type="submit">Sandbox Clientを発行</button>
        </form>
        <p>
          API KeyとWebhook Secretは再表示されません。Production発信はこの画面から有効化できません。
        </p>
      </section>
      <section className="card">
        <h2>Sandbox Call Profile作成</h2>
        <p>商材・AI担当者・シナリオの公開済みVersion IDを指定します。</p>
        <form onSubmit={(event) => void createProfile(event)}>
          <label>
            公開ID
            <input
              name="publicId"
              placeholder="cp_new_sales_v1"
              required
              pattern="cp_[a-z0-9_]+_v[0-9]+"
            />
          </label>
          <label>
            名称
            <input name="name" required maxLength={200} />
          </label>
          <label>
            説明
            <input name="description" maxLength={1000} />
          </label>
          <label>
            商材Version ID
            <input name="productVersionId" required />
          </label>
          <label>
            AI担当者Version ID
            <input name="aiAgentVersionId" required />
          </label>
          <label>
            シナリオVersion ID
            <input name="scenarioVersionId" required />
          </label>
          <label>
            開始時刻
            <input name="callableStartTime" type="time" defaultValue="09:00" required />
          </label>
          <label>
            終了時刻
            <input name="callableEndTime" type="time" defaultValue="18:00" required />
          </label>
          <label>
            日次上限
            <input
              name="dailyCallLimit"
              type="number"
              min="1"
              max="100000"
              defaultValue="100"
              required
            />
          </label>
          <label>
            同時実行上限
            <input
              name="concurrentCallLimit"
              type="number"
              min="1"
              max="100"
              defaultValue="1"
              required
            />
          </label>
          <button type="submit">Sandbox Profileを作成</button>
        </form>
      </section>
      <section className="card">
        <h2>Integration Client</h2>
        {clients.map((client) => (
          <article className="list-card" key={client.id}>
            <strong>{client.name}</strong>
            <p>
              {client.environment} / {client.status} / {client.apiKeyPrefix}
            </p>
            <small>
              日次 {client.dailyCallLimit}件・同時 {client.concurrentCallLimit}件・Webhook{' '}
              {client.webhookEndpoint ?? '未設定'}
            </small>
            <p>
              Profile: {client.allowedCallProfiles.join(', ') || '未割当'} / Rate:{' '}
              {client.rateLimitPerMinute}/分
            </p>
            <button type="button" onClick={() => void setClientStatus(client)}>
              {client.status === 'active' ? '停止' : '再開'}
            </button>
            <button type="button" onClick={() => void rotateApiKey(client)}>
              API Key再発行
            </button>
            <form onSubmit={(event) => void updateClient(event, client)}>
              <label>
                利用可能Profile
                <select
                  name="allowedCallProfiles"
                  multiple
                  defaultValue={client.allowedCallProfiles}
                  size={Math.min(Math.max(profiles.length, 2), 6)}
                >
                  {profiles
                    .filter(
                      (profile) =>
                        profile.environment === client.environment && profile.status === 'active',
                    )
                    .map((profile) => (
                      <option key={profile.id} value={profile.publicId}>
                        {profile.name}（{profile.publicId}）
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Rate/分
                <input
                  name="rateLimitPerMinute"
                  type="number"
                  min="1"
                  max="10000"
                  defaultValue={client.rateLimitPerMinute}
                  required
                />
              </label>
              <label>
                日次上限
                <input
                  name="dailyCallLimit"
                  type="number"
                  min="1"
                  max="100000"
                  defaultValue={client.dailyCallLimit}
                  required
                />
              </label>
              <label>
                同時上限
                <input
                  name="concurrentCallLimit"
                  type="number"
                  min="1"
                  max="100"
                  defaultValue={client.concurrentCallLimit}
                  required
                />
              </label>
              <button type="submit">設定を保存</button>
            </form>
          </article>
        ))}
        {!clients.length && <p>Integration Clientはありません。</p>}
      </section>
      <section className="card">
        <h2>Call Profile</h2>
        {profiles.map((profile) => (
          <article className="list-card" key={profile.id}>
            <strong>{profile.name}</strong>
            <p>
              {profile.publicId} / {profile.environment} / {profile.status}
            </p>
          </article>
        ))}
        {!profiles.length && <p>Call Profileはありません。</p>}
      </section>
      <section className="card">
        <h2>Webhook Delivery</h2>
        {deliveries.map((delivery) => (
          <article className="list-card" key={delivery.id}>
            <strong>{delivery.webhookEvent.eventType}</strong>
            <p>
              {delivery.status} / 試行 {delivery.attemptCount}回
            </p>
            <small>{delivery.failureCode ?? delivery.webhookEvent.publicId}</small>
            {['failed', 'retrying'].includes(delivery.status) && (
              <button type="button" onClick={() => void retry(delivery.id)}>
                再送
              </button>
            )}
          </article>
        ))}
        {!deliveries.length && <p>Webhook Delivery履歴はありません。</p>}
      </section>
    </main>
  );
}
