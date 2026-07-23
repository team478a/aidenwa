import { createHash } from 'node:crypto';
import { parseSocketJson, type RealtimeSocket, type SocketFactory } from './transport.js';

export * from './transport.js';
export * from './bridge.js';
export * from './token.js';

export type NormalizedRealtimeEvent =
  | { type: 'session.started'; sequence: number }
  | { type: 'caller.speech_started'; sequence: number }
  | { type: 'caller.speech_stopped'; sequence: number }
  | { type: 'caller.transcript_final'; sequence: number; text: string }
  | { type: 'assistant.audio_delta'; sequence: number; generationId: string; audio: Buffer }
  | { type: 'assistant.item_started'; sequence: number; itemId: string }
  | { type: 'assistant.transcript_final'; sequence: number; text: string }
  | { type: 'assistant.response_done'; sequence: number; generationId: string }
  | {
      type: 'tool.call_requested';
      sequence: number;
      callId: string;
      name: AllowedTool;
      arguments: unknown;
    }
  | { type: 'usage.updated'; sequence: number; inputTokens: number; outputTokens: number }
  | { type: 'session.error'; sequence: number; code: string }
  | { type: 'session.closed'; sequence: number; reason: string };

export type AllowedTool =
  | 'lookup_published_faq'
  | 'mark_opt_out'
  | 'request_human_callback'
  | 'mark_qualified'
  | 'finalize_sales_handoff'
  | 'find_appointment_slots'
  | 'hold_appointment_slot'
  | 'confirm_appointment'
  | 'cancel_appointment_hold'
  | 'end_conversation';

export const SALES_HANDOFF_TOOL = {
  type: 'function',
  name: 'finalize_sales_handoff',
  description: 'Finalize a bounded, structured sales handoff without transcript or contact data.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: [
      'interestLevel',
      'interestCodes',
      'painPointCodes',
      'objectionCodes',
      'decisionRole',
      'timelineCode',
      'budgetSignal',
      'callbackRequested',
      'humanQuestionCodes',
      'recommendedNextAction',
      'confidenceBand',
    ],
    properties: {
      interestLevel: { type: 'string', enum: ['hot', 'warm', 'cool', 'none', 'unknown'] },
      interestCodes: { type: 'array', maxItems: 12, items: { type: 'string' } },
      painPointCodes: { type: 'array', maxItems: 12, items: { type: 'string' } },
      objectionCodes: { type: 'array', maxItems: 12, items: { type: 'string' } },
      decisionRole: {
        type: 'string',
        enum: ['decision_maker', 'influencer', 'user', 'gatekeeper', 'unknown'],
      },
      timelineCode: {
        type: 'string',
        enum: ['immediate', 'within_1_month', 'within_3_months', 'later', 'unknown'],
      },
      budgetSignal: {
        type: 'string',
        enum: ['available', 'under_review', 'constrained', 'not_discussed', 'unknown'],
      },
      callbackRequested: { type: 'boolean' },
      callbackWindowCode: { type: ['string', 'null'] },
      humanQuestionCodes: { type: 'array', maxItems: 12, items: { type: 'string' } },
      recommendedNextAction: {
        type: 'string',
        enum: [
          'urgent_callback',
          'normal_callback',
          'send_information',
          'schedule_meeting',
          'nurture',
          'close_no_interest',
          'block_opt_out',
          'manual_review',
        ],
      },
      confidenceBand: { type: 'string', enum: ['high', 'medium', 'low'] },
      customerNeedSummary: { type: ['string', 'null'], maxLength: 200 },
      objectionSummary: { type: ['string', 'null'], maxLength: 200 },
      nextConversationHint: { type: ['string', 'null'], maxLength: 200 },
      unansweredQuestionSummary: { type: ['string', 'null'], maxLength: 200 },
    },
  },
} as const;

export const APPOINTMENT_TOOLS = [
  {
    type: 'function',
    name: 'find_appointment_slots',
    description: 'Find up to three real server-calculated slots.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['requestedDateRangeCode', 'preferredTimeBand', 'confirmedTimezone'],
      properties: {
        requestedDateRangeCode: {
          type: 'string',
          enum: ['next_7_days', 'next_14_days', 'next_30_days'],
        },
        preferredTimeBand: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'any'] },
        confirmedTimezone: { type: 'string', maxLength: 100 },
      },
    },
  },
  {
    type: 'function',
    name: 'hold_appointment_slot',
    description: 'Hold one opaque slot token.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['slotToken', 'idempotencyKey'],
      properties: {
        slotToken: { type: 'string', minLength: 20, maxLength: 4096 },
        idempotencyKey: { type: 'string', minLength: 8, maxLength: 100 },
      },
    },
  },
  {
    type: 'function',
    name: 'confirm_appointment',
    description: 'Confirm only after explicit customer confirmation.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['holdToken', 'customerConfirmed', 'confirmationCode'],
      properties: {
        holdToken: { type: 'string', minLength: 20, maxLength: 4096 },
        customerConfirmed: { type: 'boolean', const: true },
        confirmationCode: { type: 'string', enum: ['explicit_yes'] },
      },
    },
  },
  {
    type: 'function',
    name: 'cancel_appointment_hold',
    description: 'Cancel an unconfirmed hold.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['holdToken', 'reasonCode'],
      properties: {
        holdToken: { type: 'string', minLength: 20, maxLength: 4096 },
        reasonCode: {
          type: 'string',
          enum: ['customer_declined', 'customer_changed_time', 'conversation_ended'],
        },
      },
    },
  },
] as const;

export interface RealtimeConnection {
  appendCallerAudio(audio: Buffer, sequence: number): Promise<void>;
  cancelAssistantResponse(reason: string): Promise<void>;
  truncateAssistantAudio(itemId: string, audioEndMs: number): Promise<void>;
  startAssistantResponse(): Promise<void>;
  sendToolResult(callId: string, result: unknown): Promise<void>;
  close(reason: string): Promise<void>;
  onEvent(handler: (event: NormalizedRealtimeEvent) => void): void;
}
export interface RealtimeVoiceProvider {
  connect(input: {
    sessionId: string;
    instructions: string;
    maxSeconds: number;
  }): Promise<RealtimeConnection>;
  health(): Promise<{ healthy: boolean; provider: string }>;
}

export type FakeFixture =
  | 'qualified'
  | 'barge_in'
  | 'faq'
  | 'human_requested'
  | 'opt_out'
  | 'silence'
  | 'connection_failed'
  | 'disconnect'
  | 'provider_unknown';

export class FakeRealtimeProvider implements RealtimeVoiceProvider {
  constructor(private readonly fixture: FakeFixture = 'qualified') {}
  connect(input: {
    sessionId: string;
    instructions: string;
    maxSeconds: number;
  }): Promise<RealtimeConnection> {
    if (this.fixture === 'connection_failed')
      return Promise.reject(new Error('fake_realtime_connection_failed'));
    return Promise.resolve(new FakeRealtimeConnection(input.sessionId, this.fixture));
  }
  health() {
    return Promise.resolve({ healthy: true, provider: 'fake_realtime' });
  }
}

class FakeRealtimeConnection implements RealtimeConnection {
  private handler: ((event: NormalizedRealtimeEvent) => void) | undefined;
  private emitted = false;
  readonly cancellations: string[] = [];
  constructor(
    private readonly sessionId: string,
    private readonly fixture: FakeFixture,
  ) {}
  onEvent(handler: (event: NormalizedRealtimeEvent) => void) {
    this.handler = handler;
    queueMicrotask(() => handler({ type: 'session.started', sequence: 0 }));
  }
  appendCallerAudio(audio: Buffer, sequence: number): Promise<void> {
    if (!audio.length) return Promise.reject(new Error('empty_audio'));
    if (!this.emitted) {
      this.emitted = true;
      queueMicrotask(() => this.emitFixture(sequence + 1));
    }
    return Promise.resolve();
  }
  cancelAssistantResponse(reason: string) {
    this.cancellations.push(reason);
    return Promise.resolve();
  }
  truncateAssistantAudio(itemId: string, audioEndMs: number) {
    void itemId;
    void audioEndMs;
    return Promise.resolve();
  }
  startAssistantResponse() {
    return Promise.resolve();
  }
  sendToolResult(callId: string, result: unknown) {
    void callId;
    void result;
    return Promise.resolve();
  }
  close(reason: string) {
    this.handler?.({ type: 'session.closed', sequence: Number.MAX_SAFE_INTEGER, reason });
    return Promise.resolve();
  }
  private emitFixture(sequence: number) {
    const emit = (event: NormalizedRealtimeEvent) => this.handler?.(event);
    const callId = `call-${fingerprint(this.sessionId).slice(0, 12)}`;
    if (this.fixture === 'barge_in') emit({ type: 'caller.speech_started', sequence });
    if (this.fixture === 'disconnect')
      return emit({ type: 'session.error', sequence, code: 'disconnected' });
    if (this.fixture === 'provider_unknown')
      return emit({ type: 'session.error', sequence, code: 'provider_unknown' });
    if (this.fixture === 'silence')
      return emit({ type: 'session.closed', sequence, reason: 'idle_timeout' });
    const tools: Partial<Record<FakeFixture, AllowedTool>> = {
      qualified: 'mark_qualified',
      faq: 'lookup_published_faq',
      human_requested: 'request_human_callback',
      opt_out: 'mark_opt_out',
    };
    const name = tools[this.fixture];
    if (name)
      emit({
        type: 'tool.call_requested',
        sequence,
        callId,
        name,
        arguments:
          name === 'request_human_callback'
            ? { timeWindow: 'business_hours', noteCode: 'human_requested' }
            : name === 'lookup_published_faq'
              ? { queryCode: 'pricing' }
              : { reasonCode: name },
      });
  }
}

export class OpenAIRealtimeProvider implements RealtimeVoiceProvider {
  constructor(
    private readonly config: {
      enabled: boolean;
      apiKey?: string;
      model: string;
      voice?: string;
      connectTimeoutMs?: number;
      maxEventBytes?: number;
    },
    private readonly socketFactory?: SocketFactory,
  ) {}
  async connect(input: {
    sessionId: string;
    instructions: string;
    maxSeconds: number;
  }): Promise<RealtimeConnection> {
    if (!this.config.enabled) return Promise.reject(new Error('REALTIME_AI_DISABLED'));
    if (!isValidApiKey(this.config.apiKey))
      return Promise.reject(new Error('OPENAI_API_KEY_INVALID'));
    if (!this.socketFactory) return Promise.reject(new Error('OPENAI_SOCKET_FACTORY_MISSING'));
    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.config.model)}`;
    const socket = this.socketFactory(url, { Authorization: `Bearer ${this.config.apiKey}` });
    const connection = new OpenAIRealtimeConnection(socket, this.config.maxEventBytes ?? 65_536);
    await connection.open(this.config.connectTimeoutMs ?? 10_000);
    connection.configure({
      instructions: input.instructions,
      ...(this.config.voice ? { voice: this.config.voice } : {}),
    });
    return connection;
  }
  health() {
    return Promise.resolve({
      healthy: this.config.enabled && isValidApiKey(this.config.apiKey),
      provider: 'openai_realtime',
    });
  }
}

class OpenAIRealtimeConnection implements RealtimeConnection {
  private handler: ((event: NormalizedRealtimeEvent) => void) | undefined;
  private sequence = 0;
  private generationId = '';
  private closed = false;
  constructor(
    private readonly socket: RealtimeSocket,
    private readonly maxEventBytes: number,
  ) {}
  open(timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.close(1000, 'connect_timeout');
        reject(new Error('OPENAI_CONNECT_TIMEOUT'));
      }, timeoutMs);
      this.socket.on('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.on('error', () => {
        clearTimeout(timer);
        reject(new Error('OPENAI_UNAVAILABLE'));
      });
      this.socket.on('message', (data) => this.receive(data));
      this.socket.on('close', (code) => {
        if (!this.closed)
          this.emit({
            type: 'session.error',
            sequence: this.next(),
            code: code === 1000 ? 'openai_closed' : 'openai_unavailable',
          });
      });
    });
  }
  configure(input: { instructions: string; voice?: string }) {
    this.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: input.instructions,
        tools: [SALES_HANDOFF_TOOL, ...APPOINTMENT_TOOLS],
        audio: {
          input: {
            format: { type: 'audio/pcmu' },
            turn_detection: { type: 'server_vad', create_response: true, interrupt_response: true },
          },
          output: {
            format: { type: 'audio/pcmu' },
            ...(input.voice ? { voice: input.voice } : {}),
          },
        },
      },
    });
  }
  onEvent(handler: (event: NormalizedRealtimeEvent) => void) {
    this.handler = handler;
  }
  appendCallerAudio(audio: Buffer) {
    this.send({ type: 'input_audio_buffer.append', audio: audio.toString('base64') });
    return Promise.resolve();
  }
  startAssistantResponse() {
    this.send({ type: 'response.create' });
    return Promise.resolve();
  }
  cancelAssistantResponse() {
    this.send({ type: 'response.cancel' });
    return Promise.resolve();
  }
  truncateAssistantAudio(itemId: string, audioEndMs: number) {
    this.send({
      type: 'conversation.item.truncate',
      item_id: itemId,
      content_index: 0,
      audio_end_ms: audioEndMs,
    });
    return Promise.resolve();
  }
  sendToolResult(callId: string, result: unknown) {
    this.send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) },
    });
    return Promise.resolve();
  }
  close(reason: string) {
    if (!this.closed) {
      this.closed = true;
      this.socket.close(1000, sanitizeReason(reason));
    }
    return Promise.resolve();
  }
  private receive(data: string | Buffer) {
    let raw: Record<string, unknown>;
    try {
      raw = parseSocketJson(data, this.maxEventBytes);
    } catch {
      return this.emit({
        type: 'session.error',
        sequence: this.next(),
        code: 'invalid_openai_event',
      });
    }
    const type = typeof raw.type === 'string' ? raw.type : '';
    if (type === 'input_audio_buffer.speech_started')
      return this.emit({ type: 'caller.speech_started', sequence: this.next() });
    if (type === 'input_audio_buffer.speech_stopped')
      return this.emit({ type: 'caller.speech_stopped', sequence: this.next() });
    if (type === 'response.created') {
      this.generationId =
        asString((raw.response as Record<string, unknown> | undefined)?.id) ||
        `generation-${this.next()}`;
      return;
    }
    if (type === 'response.output_item.added') {
      const itemId = asString((raw.item as Record<string, unknown> | undefined)?.id);
      if (itemId)
        return this.emit({ type: 'assistant.item_started', sequence: this.next(), itemId });
    }
    if (type === 'response.output_item.done') {
      const item = raw.item as Record<string, unknown> | undefined;
      const functionName = asString(item?.name);
      if (
        item?.type === 'function_call' &&
        [
          'finalize_sales_handoff',
          'find_appointment_slots',
          'hold_appointment_slot',
          'confirm_appointment',
          'cancel_appointment_hold',
        ].includes(functionName)
      ) {
        let args: unknown = {};
        try {
          args = JSON.parse(asString(item.arguments));
        } catch {
          return this.emit({
            type: 'session.error',
            sequence: this.next(),
            code: 'invalid_tool_arguments',
          });
        }
        return this.emit({
          type: 'tool.call_requested',
          sequence: this.next(),
          callId: asString(item.call_id),
          name: functionName as AllowedTool,
          arguments: args,
        });
      }
    }
    if (type === 'response.output_audio.delta') {
      const audio = strictOpenAIBase64(raw.delta);
      return this.emit({
        type: 'assistant.audio_delta',
        sequence: this.next(),
        generationId: this.generationId,
        audio,
      });
    }
    if (type === 'response.done')
      return this.emit({
        type: 'assistant.response_done',
        sequence: this.next(),
        generationId: this.generationId,
      });
    if (type === 'error')
      return this.emit({
        type: 'session.error',
        sequence: this.next(),
        code: sanitizeOpenAIError(raw.error),
      });
  }
  private send(value: Record<string, unknown>) {
    if (this.closed) throw new Error('REALTIME_CONNECTION_CLOSED');
    if (this.socket.bufferedAmount > this.maxEventBytes * 16)
      throw new Error('OPENAI_BACKPRESSURE');
    this.socket.send(JSON.stringify(value));
  }
  private emit(event: NormalizedRealtimeEvent) {
    this.handler?.(event);
  }
  private next() {
    this.sequence += 1;
    return this.sequence;
  }
}

function strictOpenAIBase64(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    throw new Error('INVALID_OPENAI_AUDIO');
  return Buffer.from(value, 'base64');
}
function isValidApiKey(value: string | undefined) {
  return Boolean(
    value && /^sk-[A-Za-z0-9_-]{16,}$/.test(value) && !/placeholder|changeme/i.test(value),
  );
}
function sanitizeReason(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, '_').slice(0, 100);
}
function sanitizeOpenAIError(value: unknown) {
  const code = asString((value as Record<string, unknown> | undefined)?.code);
  if (code.includes('rate')) return 'openai_rate_limit';
  if (code.includes('auth') || code.includes('key')) return 'openai_authentication_failure';
  return 'openai_error';
}

export type TwilioStreamEvent =
  | { type: 'connected'; sequence: number }
  | {
      type: 'start';
      sequence: number;
      streamSid: string;
      streamFingerprint: string;
      customParameters: Record<string, string>;
    }
  | { type: 'media'; sequence: number; streamSid: string; track: string; audio: Buffer }
  | { type: 'mark'; sequence: number; streamSid: string; name: string }
  | { type: 'dtmf'; sequence: number; streamSid: string; digit: string }
  | { type: 'stop'; sequence: number; streamSid: string };

export function normalizeTwilioStreamEvent(raw: unknown, maxBytes: number): TwilioStreamEvent {
  const bytes = Buffer.byteLength(JSON.stringify(raw));
  if (bytes > maxBytes) throw new Error('REALTIME_EVENT_TOO_LARGE');
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_STREAM_EVENT');
  const value = raw as Record<string, unknown>;
  const event = value.event;
  const sequence = Number(value.sequenceNumber ?? -1);
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('INVALID_STREAM_SEQUENCE');
  if (event === 'connected') return { type: 'connected', sequence };
  const streamSid = asString(value.streamSid);
  if (event === 'start') {
    const start = value.start as Record<string, unknown> | undefined;
    const nestedSid = asString(start?.streamSid);
    const sid = streamSid || nestedSid;
    const format = start?.mediaFormat as Record<string, unknown> | undefined;
    if (
      !sid ||
      format?.encoding !== 'audio/x-mulaw' ||
      format.sampleRate !== 8000 ||
      format.channels !== 1
    )
      throw new Error('INVALID_STREAM_START');
    const rawParameters = start?.customParameters;
    const customParameters: Record<string, string> = {};
    if (rawParameters && typeof rawParameters === 'object' && !Array.isArray(rawParameters))
      for (const [key, item] of Object.entries(rawParameters))
        if (typeof item === 'string') customParameters[key] = item;
    return {
      type: 'start',
      sequence,
      streamSid: sid,
      streamFingerprint: fingerprint(sid),
      customParameters,
    };
  }
  if (event === 'media') {
    const media = value.media as { payload?: unknown; track?: unknown } | undefined;
    const payload = media?.payload;
    if (typeof payload !== 'string') throw new Error('INVALID_MEDIA_PAYLOAD');
    if (!streamSid) throw new Error('STREAM_SID_REQUIRED');
    return {
      type: 'media',
      sequence,
      streamSid,
      track: asString(media?.track),
      audio: strictOpenAIBase64(payload),
    };
  }
  if (event === 'mark')
    return {
      type: 'mark',
      sequence,
      streamSid,
      name: asString((value.mark as { name?: unknown } | undefined)?.name),
    };
  if (event === 'dtmf')
    return {
      type: 'dtmf',
      sequence,
      streamSid,
      digit: asString((value.dtmf as { digit?: unknown } | undefined)?.digit),
    };
  if (event === 'stop') return { type: 'stop', sequence, streamSid };
  throw new Error('UNKNOWN_STREAM_EVENT');
}

export class TwilioMediaStreamGuard {
  private lastSequence = -1;

  constructor(private readonly maxEventBytes: number) {}

  accept(raw: unknown) {
    const event = normalizeTwilioStreamEvent(raw, this.maxEventBytes);
    if (event.sequence <= this.lastSequence) throw new Error('NON_MONOTONIC_STREAM_SEQUENCE');
    this.lastSequence = event.sequence;
    return event;
  }
}

export function buildTwilioMediaStreamTwiml(input: {
  enabled: boolean;
  websocketUrl: string;
  sessionToken: string;
}) {
  if (!input.enabled) throw new Error('TWILIO_MEDIA_STREAMS_DISABLED');
  const url = new URL(input.websocketUrl);
  if (url.protocol !== 'wss:') throw new Error('MEDIA_STREAM_WSS_REQUIRED');
  const escapedUrl = escapeXml(url.toString());
  const escapedToken = escapeXml(input.sessionToken);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${escapedUrl}"><Parameter name="session_token" value="${escapedToken}" /></Stream></Connect></Response>`;
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function asString(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function buildRealtimePrompt(input: {
  organizationId: string;
  companyName: string;
  aiDisclosure: string;
  productSummary: string;
  prohibitedClaims: string[];
}) {
  return [
    input.aiDisclosure,
    `${input.companyName}への接続です。用件を短く説明し、会話可能か確認してください。`,
    `商材概要: ${input.productSummary}`,
    `禁止: ${input.prohibitedClaims.join('、') || '未確認事項の断定'}`,
    '個人情報・決済情報・認証情報を質問しない。拒否されたら直ちに終了する。',
    `organization_scope:${input.organizationId}`,
  ].join('\n');
}

export function validateToolArguments(name: AllowedTool, input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('INVALID_TOOL_ARGUMENTS');
  const value = input as Record<string, unknown>;
  const allowed: Record<AllowedTool, string[]> = {
    lookup_published_faq: ['queryCode'],
    mark_opt_out: ['reasonCode'],
    request_human_callback: ['timeWindow', 'noteCode'],
    mark_qualified: ['reasonCode'],
    finalize_sales_handoff: [],
    find_appointment_slots: ['requestedDateRangeCode', 'preferredTimeBand', 'confirmedTimezone'],
    hold_appointment_slot: ['slotToken', 'idempotencyKey'],
    confirm_appointment: ['holdToken', 'customerConfirmed', 'confirmationCode'],
    cancel_appointment_hold: ['holdToken', 'reasonCode'],
    end_conversation: ['reasonCode'],
  };
  if (Object.keys(value).some((key) => !allowed[name].includes(key)))
    throw new Error('INVALID_TOOL_ARGUMENTS');
  if (Object.values(value).some((item) => typeof item !== 'string' || item.length > 100))
    throw new Error('INVALID_TOOL_ARGUMENTS');
  return value as Record<string, string>;
}

export function resultPriority(code: string) {
  return [
    'opt_out',
    'human_requested',
    'callback_requested',
    'qualified',
    'not_interested',
    'no_answer_or_unclear',
  ].indexOf(code);
}
export function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
