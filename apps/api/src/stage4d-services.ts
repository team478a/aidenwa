import { createHash } from 'node:crypto';
import type { PrismaClient } from '@sales-ai/database';
import { handoffFinalizeSchema } from '@sales-ai/validation';
import { maskPhone } from '@sales-ai/voice-provider';
import { autoAssignFollowup } from './stage4c-services.js';

const forbidden =
  /(?:\b(?:\+?\d[\d\s()-]{8,}\d)\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|authorization|bearer\s+|api[_ -]?key|password|cookie|session|csrf|クレジット|住所|病歴)/iu;
const followupActions = new Set([
  'urgent_callback',
  'normal_callback',
  'send_information',
  'schedule_meeting',
]);

function cleanSummary(value: string | null | undefined): string | null {
  if (!value) return null;
  return forbidden.test(value) ? null : value;
}

export function calculateLeadScore(input: ReturnType<typeof handoffFinalizeSchema.parse>) {
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

export async function finalizeSalesHandoff(
  prisma: PrismaClient,
  raw: unknown,
  retentionDays: number,
  actorUserId: string,
) {
  const parsed = handoffFinalizeSchema.parse(raw);
  const input = parsed.optOut
    ? { ...parsed, recommendedNextAction: 'block_opt_out' as const }
    : parsed.confidenceBand === 'low'
      ? { ...parsed, recommendedNextAction: 'manual_review' as const }
      : parsed;
  const session = await prisma.realtimeCallSession.findFirst({
    where: { id: input.realtimeSessionId },
  });
  if (!session) throw new Error('HANDOFF_SESSION_NOT_FOUND');
  const company = await prisma.company.findFirst({
    where: { id: input.companyId, organizationId: session.organizationId, isDeleted: false },
  });
  if (!company) throw new Error('HANDOFF_SCOPE_INVALID');
  if (input.contactId) {
    const contact = await prisma.companyContact.findFirst({
      where: {
        id: input.contactId,
        companyId: company.id,
        organizationId: session.organizationId,
        isDeleted: false,
      },
    });
    if (!contact) throw new Error('HANDOFF_SCOPE_INVALID');
  }
  const score = calculateLeadScore(input);
  const summaries = {
    customerNeedSummary: cleanSummary(input.customerNeedSummary),
    objectionSummary: cleanSummary(input.objectionSummary),
    nextConversationHint: cleanSummary(input.nextConversationHint),
    unansweredQuestionSummary: cleanSummary(input.unansweredQuestionSummary),
  };
  const phone = await prisma.phoneNumber.findFirst({
    where: {
      organizationId: session.organizationId,
      companyId: company.id,
      isDeleted: false,
      isCallable: true,
      type: { not: 'fax' },
    },
    orderBy: { createdAt: 'asc' },
  });
  const existing = await prisma.salesHandoffCard.findUnique({
    where: { realtimeSessionId_version: { realtimeSessionId: session.id, version: 1 } },
  });
  if (existing) return existing;
  const card = await prisma.$transaction(async (tx) => {
    let followupTaskId: string | null = null;
    if (input.optOut && phone) {
      const optOutExists = await tx.optOut.findFirst({
        where: {
          organizationId: session.organizationId,
          phoneNumberId: phone.id,
          status: 'active',
        },
      });
      if (!optOutExists)
        await tx.optOut.create({
          data: {
            organizationId: session.organizationId,
            companyId: company.id,
            contactId: input.contactId,
            phoneNumberId: phone.id,
            normalizedPhoneSnapshot: phone.normalizedNumber,
            scope: 'phone',
            channel: 'phone',
            reasonCode: 'customer_request',
            evidenceText: 'handoff_tool:opt_out',
            registeredBy: actorUserId,
          },
        });
      await tx.humanFollowupTask.updateMany({
        where: {
          organizationId: session.organizationId,
          phoneNumberId: phone.id,
          status: { notIn: ['completed', 'cancelled'] },
        },
        data: { status: 'cancelled', outcomeCode: 'opt_out', completedAt: new Date() },
      });
    } else if (followupActions.has(input.recommendedNextAction) && phone) {
      const task = await tx.humanFollowupTask.upsert({
        where: {
          realtimeSessionId_channel: { realtimeSessionId: session.id, channel: 'zoom_phone' },
        },
        create: {
          organizationId: session.organizationId,
          campaignId: session.campaignId,
          executionId: session.executionId,
          realtimeSessionId: session.id,
          phoneNumberId: phone.id,
          companyId: company.id,
          contactId: input.contactId,
          source: 'ai_realtime',
          reasonCode: input.callbackRequested ? 'callback_requested' : input.recommendedNextAction,
          requestedTimeWindowCode: input.callbackWindowCode ?? 'business_hours',
          noteCode: input.recommendedNextAction,
          maskedDestination: maskPhone(phone.normalizedNumber),
          priority:
            input.recommendedNextAction === 'urgent_callback'
              ? 'urgent'
              : input.recommendedNextAction === 'normal_callback'
                ? 'high'
                : 'normal',
          dueAt: new Date(
            Date.now() + (input.recommendedNextAction === 'urgent_callback' ? 30 : 240) * 60_000,
          ),
          nextActionCode: input.recommendedNextAction,
        },
        update: {},
      });
      followupTaskId = task.id;
    }
    return tx.salesHandoffCard.create({
      data: {
        organizationId: session.organizationId,
        campaignId: session.campaignId,
        executionId: session.executionId,
        realtimeSessionId: session.id,
        followupTaskId,
        companyId: company.id,
        contactId: input.contactId,
        source: input.source,
        status: input.confidenceBand === 'low' ? 'draft' : 'finalized',
        interestLevel: input.interestLevel,
        interestCodes: input.interestCodes,
        painPointCodes: input.painPointCodes,
        objectionCodes: input.objectionCodes,
        decisionRole: input.decisionRole,
        timelineCode: input.timelineCode,
        budgetSignal: input.budgetSignal,
        callbackRequested: input.callbackRequested,
        callbackWindowCode: input.callbackWindowCode,
        humanQuestionCodes: input.humanQuestionCodes,
        recommendedNextAction: input.recommendedNextAction,
        confidenceBand: input.confidenceBand,
        evidenceEventFingerprints: input.evidenceEventFingerprints,
        ...summaries,
        leadScore: score.score,
        scoreReasonCodes: score.reasons,
        scoreRuleVersion: score.version,
        finalizedAt: input.confidenceBand === 'low' ? null : new Date(),
        expiresAt: new Date(Date.now() + retentionDays * 86_400_000),
      },
    });
  });
  if (card.followupTaskId)
    await autoAssignFollowup(prisma, {
      organizationId: card.organizationId,
      taskId: card.followupTaskId,
      campaignId: card.campaignId,
    });
  return card;
}

export function fakeHandoffFixture(name: string) {
  const base = {
    interestLevel: 'warm',
    interestCodes: ['features'],
    painPointCodes: ['manual_work'],
    objectionCodes: [],
    decisionRole: 'unknown',
    timelineCode: 'unknown',
    budgetSignal: 'not_discussed',
    callbackRequested: false,
    callbackWindowCode: null,
    humanQuestionCodes: [],
    recommendedNextAction: 'nurture',
    confidenceBand: 'medium',
    customerNeedSummary: '業務効率化に関心があります。',
    objectionSummary: null,
    nextConversationHint: '現状の作業量を確認してください。',
    unansweredQuestionSummary: null,
    source: 'fake' as const,
    optOut: false,
    evidenceEventFingerprints: [createHash('sha256').update(name).digest('hex')],
  };
  if (name === 'hot_callback')
    return {
      ...base,
      interestLevel: 'hot',
      callbackRequested: true,
      callbackWindowCode: 'business_hours',
      recommendedNextAction: 'urgent_callback',
      decisionRole: 'decision_maker',
      timelineCode: 'immediate',
    };
  if (name === 'opt_out')
    return { ...base, interestLevel: 'none', recommendedNextAction: 'block_opt_out', optOut: true };
  if (name === 'low_confidence') return { ...base, confidenceBand: 'low' };
  if (name === 'forbidden_summary')
    return { ...base, customerNeedSummary: '連絡先 test@example.com' };
  return base;
}
