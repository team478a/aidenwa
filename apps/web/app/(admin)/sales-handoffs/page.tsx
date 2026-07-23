'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';

type Card = {
  id: string;
  interestLevel: string;
  interestCodes: string[];
  painPointCodes: string[];
  objectionCodes: string[];
  decisionRole: string;
  timelineCode: string;
  budgetSignal: string;
  recommendedNextAction: string;
  confidenceBand: string;
  leadScore: number | null;
  scoreReasonCodes: string[];
  customerNeedSummary: string | null;
  objectionSummary: string | null;
  nextConversationHint: string | null;
  unansweredQuestionSummary: string | null;
};

export default function SalesHandoffsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    void api<{ cards: Card[] }>('/sales-handoff-cards')
      .then((r) => setCards(r.cards))
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message : '読込に失敗しました'));
  }, []);
  async function feedback(card: Card, verdict: 'correct' | 'incorrect') {
    await api(`/sales-handoff-cards/${card.id}/feedback`, {
      method: 'POST',
      body: JSON.stringify({
        verdict,
        reasonCode: verdict === 'correct' ? 'confirmed' : 'sales_reported_error',
      }),
    });
    setMessage('評価を追記しました。元のAI評価は変更されません。');
  }
  return (
    <main className="content">
      <h1>AI営業引継ぎカード</h1>
      <p className="notice">
        録音・会話全文・連絡先は保存、表示していません。AI評価は推測を含むため、確信度と理由を確認してください。
      </p>
      {message && <p role="status">{message}</p>}
      <section className="card-grid">
        {cards.map((card) => (
          <article className="panel" key={card.id}>
            <h2>
              温度感: {card.interestLevel === 'unknown' ? '会話では未確認' : card.interestLevel}
            </h2>
            <p>
              優先スコア: {card.leadScore ?? '営業禁止'} / 確信度: {card.confidenceBand}
            </p>
            {card.confidenceBand === 'low' && (
              <p className="notice">確信度が低いため、人による確認が必要です。</p>
            )}
            <p>
              関心: {card.interestCodes.length ? card.interestCodes.join('、') : '会話では未確認'}
            </p>
            <p>
              課題: {card.painPointCodes.length ? card.painPointCodes.join('、') : '会話では未確認'}
            </p>
            <p>
              懸念: {card.objectionCodes.length ? card.objectionCodes.join('、') : '会話では未確認'}
            </p>
            <p>
              意思決定上の役割:{' '}
              {card.decisionRole === 'unknown' ? '会話では未確認' : card.decisionRole}
            </p>
            <p>
              時期: {card.timelineCode === 'unknown' ? '会話では未確認' : card.timelineCode} / 予算:{' '}
              {card.budgetSignal}
            </p>
            <p>関心・課題の要点: {card.customerNeedSummary ?? '保存可能な要点はありません'}</p>
            <p>懸念点: {card.objectionSummary ?? '会話では未確認'}</p>
            <p>未回答質問: {card.unansweredQuestionSummary ?? '会話では未確認'}</p>
            <p>次に確認する内容: {card.nextConversationHint ?? card.recommendedNextAction}</p>
            <p>スコア理由: {card.scoreReasonCodes.join('、')}</p>
            <div className="actions">
              <button onClick={() => void feedback(card, 'correct')}>内容は正しい</button>
              <button onClick={() => void feedback(card, 'incorrect')}>誤りを報告</button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
