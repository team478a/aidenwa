import { createHash } from 'node:crypto';
import type { PrismaClient } from '@sales-ai/database';
import {
  FakeRealtimeProvider,
  buildRealtimePrompt,
  validateToolArguments,
  type FakeFixture,
  type NormalizedRealtimeEvent,
} from '@sales-ai/realtime';
import { maskPhone } from '@sales-ai/voice-provider';
import { autoAssignFollowup } from './stage4c-services.js';
import { finalizeSalesHandoff } from './stage4d-services.js';

export async function runFakeRealtimeSimulation(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    userId: string;
    campaignId: string;
    companyId: string;
    phoneNumberId: string;
    executionId?: string;
    fixture: FakeFixture;
  },
) {
  const [campaign, company, phone] = await Promise.all([
    prisma.campaign.findFirst({
      where: { id: input.campaignId, organizationId: input.organizationId },
    }),
    prisma.company.findFirst({
      where: { id: input.companyId, organizationId: input.organizationId },
    }),
    prisma.phoneNumber.findFirst({
      where: {
        id: input.phoneNumberId,
        companyId: input.companyId,
        organizationId: input.organizationId,
        isDeleted: false,
      },
    }),
  ]);
  if (!campaign || !company || !phone) throw new Error('REALTIME_SCOPE_INVALID');
  const [product, agent] = await Promise.all([
    prisma.productVersion.findFirst({
      where: { id: campaign.productVersionId, organizationId: input.organizationId },
    }),
    prisma.aiAgentVersion.findFirst({
      where: { id: campaign.aiAgentVersionId, organizationId: input.organizationId },
    }),
  ]);
  if (!product || !agent) throw new Error('REALTIME_CONFIG_INVALID');
  const prompt = buildRealtimePrompt({
    organizationId: input.organizationId,
    companyName: company.name,
    aiDisclosure: agent.aiDisclosure,
    productSummary: product.summary,
    prohibitedClaims: product.prohibitedClaims as string[],
  });
  const session = await prisma.realtimeCallSession.create({
    data: {
      organizationId: input.organizationId,
      campaignId: campaign.id,
      executionId: input.executionId ?? null,
      provider: 'fake_realtime',
      providerSessionFingerprint: fingerprint(`${input.fixture}:${crypto.randomUUID()}`),
      status: 'connecting',
    },
  });
  const provider = new FakeRealtimeProvider(input.fixture);
  const events: NormalizedRealtimeEvent[] = [];
  try {
    const connection = await provider.connect({
      sessionId: session.id,
      instructions: prompt,
      maxSeconds: 120,
    });
    connection.onEvent((event) => events.push(event));
    await connection.appendCallerAudio(Buffer.from([0xff, 0x7f]), 1);
    await new Promise<void>((resolve) => setImmediate(resolve));
    let resultCode = 'no_answer_or_unclear';
    let failureCode: string | null = null;
    let lastSequence = -1;
    for (const event of events.sort((a, b) => a.sequence - b.sequence)) {
      if (event.sequence <= lastSequence) continue;
      lastSequence = event.sequence;
      await persistEvent(prisma, input.organizationId, session.id, event);
      if (event.type === 'caller.speech_started') {
        await connection.cancelAssistantResponse('caller_barge_in');
        await persistSyntheticEvent(
          prisma,
          input.organizationId,
          session.id,
          event.sequence + 1,
          'assistant.audio_cleared',
          {
            reason: 'caller_barge_in',
          },
        );
      }
      if (event.type === 'session.error') failureCode = event.code;
      if (event.type !== 'tool.call_requested') continue;
      if (event.name === 'finalize_sales_handoff') {
        await finalizeSalesHandoff(
          prisma,
          {
            ...(event.arguments as Record<string, unknown>),
            realtimeSessionId: session.id,
            companyId: company.id,
            contactId: phone.contactId,
            source: 'ai_realtime',
            optOut: false,
            evidenceEventFingerprints: [fingerprint(`${session.id}:${event.sequence}`)],
          },
          365,
          input.userId,
        );
        continue;
      }
      const args = validateToolArguments(event.name, event.arguments);
      if (event.name === 'mark_opt_out') {
        resultCode = 'opt_out';
        await prisma.$transaction([
          prisma.optOut.create({
            data: {
              organizationId: input.organizationId,
              companyId: company.id,
              phoneNumberId: phone.id,
              normalizedPhoneSnapshot: phone.normalizedNumber,
              scope: 'phone',
              channel: 'phone',
              reasonCode: 'customer_request',
              evidenceText: 'realtime_tool:mark_opt_out',
              registeredBy: input.userId,
            },
          }),
          prisma.realCallExecution.updateMany({
            where: {
              organizationId: input.organizationId,
              phoneNumberId: phone.id,
              state: 'reserved',
            },
            data: { state: 'canceled', endedAt: new Date() },
          }),
          prisma.humanFollowupTask.updateMany({
            where: {
              organizationId: input.organizationId,
              phoneNumberId: phone.id,
              status: { notIn: ['completed', 'cancelled'] },
            },
            data: { status: 'cancelled', outcomeCode: 'opt_out', completedAt: new Date() },
          }),
        ]);
      } else if (event.name === 'request_human_callback') {
        resultCode = 'human_requested';
        const followup = await prisma.humanFollowupTask.upsert({
          where: {
            realtimeSessionId_channel: { realtimeSessionId: session.id, channel: 'zoom_phone' },
          },
          create: {
            organizationId: input.organizationId,
            campaignId: campaign.id,
            executionId: input.executionId ?? null,
            realtimeSessionId: session.id,
            phoneNumberId: phone.id,
            companyId: company.id,
            contactId: phone.contactId,
            source: 'ai_realtime',
            reasonCode: 'human_requested',
            requestedTimeWindowCode: args.timeWindow ?? 'business_hours',
            noteCode: args.noteCode ?? 'human_requested',
            maskedDestination: maskPhone(phone.normalizedNumber),
            priority: 'high',
            dueAt: new Date(Date.now() + 60 * 60_000),
          },
          update: {},
        });
        await autoAssignFollowup(prisma, {
          organizationId: input.organizationId,
          taskId: followup.id,
          campaignId: campaign.id,
        });
      } else if (event.name === 'mark_qualified') {
        resultCode = 'qualified';
        await prisma.company.update({
          where: { id: company.id },
          data: { salesStatus: 'qualified' },
        });
      } else if (event.name === 'lookup_published_faq') {
        resultCode = 'qualified';
        await connection.sendToolResult(event.callId, {
          found: true,
          source: 'published_same_org_only',
        });
      }
    }
    await connection.close('fake_simulation_complete');
    const endedAt = new Date();
    return prisma.realtimeCallSession.update({
      where: { id: session.id },
      data: {
        status:
          failureCode === 'provider_unknown'
            ? 'provider_unknown'
            : failureCode
              ? 'failed'
              : 'completed',
        resultCode,
        failureCode,
        lastInboundSequence: Math.max(lastSequence, 1),
        inputAudioBytes: 2,
        startedAt: session.createdAt,
        endedAt,
        durationSeconds: Math.max(
          0,
          Math.ceil((endedAt.getTime() - session.createdAt.getTime()) / 1000),
        ),
      },
    });
  } catch (cause) {
    return prisma.realtimeCallSession.update({
      where: { id: session.id },
      data: {
        status: 'failed',
        failureCode: cause instanceof Error ? cause.message : 'unknown',
        endedAt: new Date(),
      },
    });
  }
}

export async function buildPersistedRealtimePrompt(
  prisma: PrismaClient,
  input: { organizationId: string; campaignId: string; companyId: string },
) {
  const [campaign, company] = await Promise.all([
    prisma.campaign.findFirst({
      where: { id: input.campaignId, organizationId: input.organizationId },
    }),
    prisma.company.findFirst({
      where: { id: input.companyId, organizationId: input.organizationId },
    }),
  ]);
  if (!campaign || !company) throw new Error('REALTIME_SCOPE_INVALID');
  const [product, agent] = await Promise.all([
    prisma.productVersion.findFirst({
      where: {
        id: campaign.productVersionId,
        organizationId: input.organizationId,
        status: 'published',
      },
    }),
    prisma.aiAgentVersion.findFirst({
      where: {
        id: campaign.aiAgentVersionId,
        organizationId: input.organizationId,
        status: 'published',
      },
    }),
  ]);
  if (!product || !agent) throw new Error('REALTIME_CONFIG_INVALID');
  return buildRealtimePrompt({
    organizationId: input.organizationId,
    companyName: company.name,
    aiDisclosure: agent.aiDisclosure,
    productSummary: product.summary,
    prohibitedClaims: product.prohibitedClaims as string[],
  });
}

async function persistEvent(
  prisma: PrismaClient,
  organizationId: string,
  sessionId: string,
  event: NormalizedRealtimeEvent,
) {
  const metadata: Record<string, string | number> =
    event.type === 'usage.updated'
      ? { inputTokens: event.inputTokens, outputTokens: event.outputTokens }
      : event.type === 'session.error'
        ? { code: event.code }
        : event.type === 'tool.call_requested'
          ? { tool: event.name }
          : {};
  await persistSyntheticEvent(
    prisma,
    organizationId,
    sessionId,
    event.sequence,
    event.type,
    metadata,
  );
}
async function persistSyntheticEvent(
  prisma: PrismaClient,
  organizationId: string,
  sessionId: string,
  sequence: number,
  type: string,
  metadata: Record<string, string | number>,
) {
  await prisma.realtimeCallEvent.upsert({
    where: {
      sessionId_providerEventFingerprint: {
        sessionId,
        providerEventFingerprint: fingerprint(`${type}:${sequence}:${JSON.stringify(metadata)}`),
      },
    },
    create: {
      organizationId,
      sessionId,
      providerEventFingerprint: fingerprint(`${type}:${sequence}:${JSON.stringify(metadata)}`),
      type,
      monotonicSequence: sequence,
      sanitizedMetadata: metadata,
      occurredAt: new Date(),
    },
    update: {},
  });
}
function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
