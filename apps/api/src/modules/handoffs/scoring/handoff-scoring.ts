import type { handoffFinalizeSchema } from '@sales-ai/validation';

type HandoffInput = ReturnType<typeof handoffFinalizeSchema.parse>;

export function calculateLeadScore(input: HandoffInput) {
  if (input.optOut || input.recommendedNextAction === 'block_opt_out')
    return { score: null, reasons: ['opt_out_blocked'], version: 1 };
  let score = 20;
  const reasons: string[] = ['base'];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };
  if (input.callbackRequested) add(25, 'callback_requested');
  if (input.interestLevel === 'hot') add(25, 'interest_hot');
  else if (input.interestLevel === 'warm') add(15, 'interest_warm');
  else if (input.interestLevel === 'none') add(-30, 'interest_none');
  if (input.decisionRole === 'decision_maker') add(15, 'decision_maker');
  if (input.timelineCode === 'immediate') add(15, 'timeline_immediate');
  if (input.confidenceBand === 'low') reasons.push('manual_review_required');
  return { score: Math.max(0, Math.min(100, score)), reasons, version: 1 };
}
