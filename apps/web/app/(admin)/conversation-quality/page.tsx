'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Quality = {
  total: number;
  lowConfidence: number;
  humanReviewRate: number;
  feedbackCount: number;
  incorrectRate: number;
};
type Setting = {
  id: string;
  version: number;
  status: string;
  schemaVersion: number;
  scoreRuleVersion: number;
};

export default function ConversationQualityPage() {
  const [quality, setQuality] = useState<Quality | null>(null);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [message, setMessage] = useState('');
  async function refresh() {
    const [q, s] = await Promise.all([
      api<Quality>('/conversation-quality'),
      api<{ settings: Setting[] }>('/handoff-settings'),
    ]);
    setQuality(q);
    setSettings(s.settings);
  }
  useEffect(() => {
    void refresh().catch((e: unknown) =>
      setMessage(e instanceof Error ? e.message : '読込に失敗しました'),
    );
  }, []);
  async function createDraft() {
    await api('/handoff-settings', {
      method: 'POST',
      body: JSON.stringify({ allowedCodes: {}, scoreRules: {} }),
    });
    await refresh();
    setMessage('設定draftを作成しました。');
  }
  async function transition(id: string, action: 'validate' | 'publish') {
    await api(`/handoff-settings/${id}/${action}`, { method: 'POST' });
    await refresh();
  }
  return (
    <main className="content">
      <h1>AI会話品質・引継ぎ設定</h1>
      <p className="notice">
        録音や会話全文は保存せず、構造化コードと営業担当者feedbackだけを集計します。
      </p>
      {message && <p role="status">{message}</p>}
      {quality && (
        <section className="panel">
          <h2>品質指標</h2>
          <p>
            カード {quality.total}件 / low confidence {quality.lowConfidence}件 / feedback{' '}
            {quality.feedbackCount}件
          </p>
          <p>
            人手確認率 {Math.round(quality.humanReviewRate * 100)}% / 誤判定率{' '}
            {Math.round(quality.incorrectRate * 100)}%
          </p>
        </section>
      )}
      <section className="panel">
        <h2>引継ぎ設定version</h2>
        <button onClick={() => void createDraft()}>新しいdraft</button>
        {settings.map((s) => (
          <article key={s.id}>
            <p>
              v{s.version} / {s.status} / schema {s.schemaVersion} / score rule {s.scoreRuleVersion}
            </p>
            {s.status === 'draft' && (
              <button onClick={() => void transition(s.id, 'validate')}>検証</button>
            )}
            {s.status === 'validated' && (
              <button className="primary" onClick={() => void transition(s.id, 'publish')}>
                公開
              </button>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
