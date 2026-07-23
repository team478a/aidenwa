import { createHash } from 'node:crypto';
import twilio from 'twilio';

export type MockFixture =
  'answered' | 'no_answer' | 'busy' | 'qualified' | 'opt_out' | 'invalid_number' | 'fax_detected';
export type CreateCallInput = {
  idempotencyKey: string;
  maskedDestination: string;
  fixture?: MockFixture;
};
export type CreateCallResult = { providerCallId: string; status: 'queued'; fixture: MockFixture };
export type ProviderCallState = {
  providerCallId: string;
  status: 'queued' | 'completed' | 'cancelled';
  fixture: MockFixture;
};
export type NormalizedCallEvent = {
  providerEventId: string;
  providerCallId: string;
  sequence: number;
  type: string;
  fixture: MockFixture;
};
export type ProviderCostEstimate = { amountMinor: number; currency: string };
export type ProductionCallInput = {
  idempotencyKey: string;
  destinationE164: string;
  fromE164: string;
  twimlUrl: string;
  statusCallbackUrl: string;
  timeoutSeconds: number;
  timeLimitSeconds: 120;
  record: false;
};
export type ProductionCallResult = { providerCallId: string; status: string };
export type ProductionProviderState = {
  providerCallId: string;
  status: string;
  priceMinor?: number;
  currency?: string;
};
export interface ProductionVoiceProvider {
  createProductionCall(input: ProductionCallInput): Promise<ProductionCallResult>;
  cancelProductionCall(providerCallId: string): Promise<void>;
  endProductionCall(providerCallId: string): Promise<void>;
  getProductionCallStatus(providerCallId: string): Promise<ProductionProviderState>;
  validateWebhook(signature: string, url: string, params: Record<string, string>): boolean;
  getEstimatedCost(maxSeconds: number): Promise<ProviderCostEstimate>;
  getProviderHealth(): Promise<{ healthy: boolean; provider: 'twilio' }>;
}

export type TwilioProviderConfig = {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  authToken: string;
  region?: string;
  edge?: string;
  estimatedCostMinorPerMinute: number;
  currency: string;
};
type TwilioCallLike = {
  sid: string;
  status: string;
  price?: string | null;
  priceUnit?: string | null;
};
type TwilioCreatePayload = {
  to: string;
  from: string;
  url: string;
  statusCallback: string;
  statusCallbackMethod: 'POST';
  statusCallbackEvent: Array<'initiated' | 'ringing' | 'answered' | 'completed'>;
  timeout: number;
  timeLimit: 120;
  record: false;
};
export interface TwilioTransport {
  create(input: TwilioCreatePayload): Promise<TwilioCallLike>;
  fetch(sid: string): Promise<TwilioCallLike>;
  update(sid: string, input: { status: 'canceled' | 'completed' }): Promise<void>;
}

/** In-memory Twilio boundary used by automated tests. It never opens a network connection. */
export class FakeTwilioServer implements TwilioTransport {
  readonly createRequests: TwilioCreatePayload[] = [];
  readonly updates: Array<{ sid: string; status: 'canceled' | 'completed' }> = [];
  readonly calls = new Map<string, TwilioCallLike>();
  failNextCreate = false;

  create(input: TwilioCreatePayload): Promise<TwilioCallLike> {
    this.createRequests.push(structuredClone(input));
    if (this.failNextCreate) {
      this.failNextCreate = false;
      return Promise.reject(new Error('fake_twilio_timeout_after_submit'));
    }
    const sid = `CA${createHash('sha256')
      .update(`${this.createRequests.length}:${JSON.stringify(input)}`)
      .digest('hex')
      .slice(0, 32)}`;
    const call = this.calls.get(sid) ?? { sid, status: 'queued' };
    this.calls.set(sid, call);
    return Promise.resolve(structuredClone(call));
  }

  fetch(sid: string): Promise<TwilioCallLike> {
    const call = this.calls.get(sid);
    if (!call) return Promise.reject(new Error('fake_twilio_call_not_found'));
    return Promise.resolve(structuredClone(call));
  }

  update(sid: string, input: { status: 'canceled' | 'completed' }): Promise<void> {
    const call = this.calls.get(sid);
    if (!call) return Promise.reject(new Error('fake_twilio_call_not_found'));
    this.calls.set(sid, { ...call, status: input.status });
    this.updates.push({ sid, status: input.status });
    return Promise.resolve();
  }

  setStatus(sid: string, status: string, price?: string, priceUnit?: string): void {
    if (!this.calls.has(sid)) throw new Error('fake_twilio_call_not_found');
    this.calls.set(sid, {
      sid,
      status,
      ...(price !== undefined ? { price } : {}),
      ...(priceUnit !== undefined ? { priceUnit } : {}),
    });
  }
}

export class TwilioVoiceProvider implements ProductionVoiceProvider {
  constructor(
    private readonly config: TwilioProviderConfig,
    private readonly transport: TwilioTransport = realTwilioTransport(config),
  ) {}
  async createProductionCall(input: ProductionCallInput) {
    if (input.record !== false || input.timeLimitSeconds !== 120)
      throw new Error('STAGE_4B1_SAFETY_CONSTRAINT');
    const call = await this.transport.create({
      to: input.destinationE164,
      from: input.fromE164,
      url: input.twimlUrl,
      statusCallback: input.statusCallbackUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      timeout: input.timeoutSeconds,
      timeLimit: 120,
      record: false,
    });
    return { providerCallId: call.sid, status: call.status };
  }
  cancelProductionCall(id: string) {
    return this.transport.update(id, { status: 'canceled' });
  }
  endProductionCall(id: string) {
    return this.transport.update(id, { status: 'completed' });
  }
  async getProductionCallStatus(id: string) {
    const x = await this.transport.fetch(id);
    const price = x.price ? Math.ceil(Math.abs(Number(x.price)) * 100) : undefined;
    return {
      providerCallId: x.sid,
      status: x.status,
      ...(price !== undefined ? { priceMinor: price } : {}),
      ...(x.priceUnit ? { currency: x.priceUnit.toUpperCase() } : {}),
    };
  }
  validateWebhook(signature: string, url: string, params: Record<string, string>) {
    return twilio.validateRequest(this.config.authToken, signature, url, params);
  }
  getEstimatedCost(maxSeconds: number) {
    return Promise.resolve({
      amountMinor: Math.ceil(maxSeconds / 60) * this.config.estimatedCostMinorPerMinute,
      currency: this.config.currency,
    });
  }
  async getProviderHealth() {
    try {
      await this.transport.fetch('health-check-disabled');
      return { healthy: true as const, provider: 'twilio' as const };
    } catch {
      return { healthy: false as const, provider: 'twilio' as const };
    }
  }
  requestHumanTransfer(): never {
    throw new Error('NOT_SUPPORTED_IN_STAGE_4B1');
  }
}

function realTwilioTransport(config: TwilioProviderConfig): TwilioTransport {
  const client = twilio(config.apiKeySid, config.apiKeySecret, {
    accountSid: config.accountSid,
    ...(config.region ? { region: config.region } : {}),
    ...(config.edge ? { edge: config.edge } : {}),
  });
  return {
    create: (input) => client.calls.create(input),
    fetch: (sid) => client.calls(sid).fetch(),
    update: async (sid, input) => {
      await client.calls(sid).update(input);
    },
  };
}

export function buildStage4B1Twiml(actionUrl: string, voice: string, retry = false): string {
  const response = new twilio.twiml.VoiceResponse();
  const gather = response.gather({
    input: ['dtmf'],
    numDigits: 1,
    timeout: 6,
    action: actionUrl,
    method: 'POST',
    actionOnEmptyResult: true,
  });
  gather.say(
    { language: 'ja-JP', voice: voice as 'Polly.Mizuki' },
    retry
      ? '入力を確認できませんでした。音声が聞こえる場合は1を、聞き取りにくい場合は2を、終了する場合は9を押してください。'
      : 'こちらはAIテレアポシステムの接続テストです。事前にご同意いただいたテスト番号へお電話しています。通話は録音していません。音声が聞こえている場合は1を、聞き取りにくい場合は2を、テストを終了する場合は9を押してください。',
  );
  response.hangup();
  return response.toString();
}

export interface VoiceProvider {
  createCall(input: CreateCallInput): Promise<CreateCallResult>;
  getCall(providerCallId: string): Promise<ProviderCallState>;
  cancelCall(providerCallId: string): Promise<void>;
  verifyWebhook?(headers: Headers, rawBody: Buffer): Promise<boolean>;
  normalizeEvent?(payload: unknown): Promise<NormalizedCallEvent>;
  endCall?(providerCallId: string): Promise<void>;
  requestHumanTransfer?(providerCallId: string, destination: string): Promise<void>;
  mapError?(cause: unknown): { code: string; retryable: boolean };
  estimateCost?(durationSeconds: number): Promise<ProviderCostEstimate>;
}

/** Stage 4A safety stub. Every operation rejects before any network activity can occur. */
export class ProductionVoiceProviderStub implements VoiceProvider {
  createCall(_input: CreateCallInput): Promise<CreateCallResult> {
    void _input;
    return Promise.reject(this.error());
  }
  getCall(_providerCallId: string): Promise<ProviderCallState> {
    void _providerCallId;
    return Promise.reject(this.error());
  }
  cancelCall(_providerCallId: string): Promise<void> {
    void _providerCallId;
    return Promise.reject(this.error());
  }
  verifyWebhook(_headers: Headers, _rawBody: Buffer): Promise<boolean> {
    void _headers;
    void _rawBody;
    return Promise.resolve(false);
  }
  normalizeEvent(_payload: unknown): Promise<NormalizedCallEvent> {
    void _payload;
    return Promise.reject(this.error());
  }
  endCall(_providerCallId: string): Promise<void> {
    void _providerCallId;
    return Promise.reject(this.error());
  }
  requestHumanTransfer(_providerCallId: string, _destination: string): Promise<void> {
    void _providerCallId;
    void _destination;
    return Promise.reject(this.error());
  }
  mapError(_cause: unknown): { code: string; retryable: boolean } {
    void _cause;
    return { code: 'production_provider_disabled', retryable: false };
  }
  estimateCost(_durationSeconds: number): Promise<ProviderCostEstimate> {
    void _durationSeconds;
    return Promise.reject(this.error());
  }
  private error() {
    return new Error('production_provider_disabled');
  }
}

/** Deterministic, in-memory provider. It has no network client and never receives a raw phone number. */
export class MockVoiceProvider implements VoiceProvider {
  readonly calls = new Map<string, ProviderCallState>();
  createCall(input: CreateCallInput): Promise<CreateCallResult> {
    if (!/^\*+\d{4}$/u.test(input.maskedDestination))
      return Promise.reject(new Error('masked_destination_required'));
    const providerCallId = `mock-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 24)}`;
    const fixture = input.fixture ?? 'qualified';
    if (!this.calls.has(providerCallId))
      this.calls.set(providerCallId, { providerCallId, status: 'queued', fixture });
    return Promise.resolve({
      providerCallId,
      status: 'queued',
      fixture: this.requireCall(providerCallId).fixture,
    });
  }
  getCall(providerCallId: string): Promise<ProviderCallState> {
    return Promise.resolve(this.requireCall(providerCallId));
  }
  cancelCall(providerCallId: string): Promise<void> {
    const call = this.requireCall(providerCallId);
    this.calls.set(providerCallId, { ...call, status: 'cancelled' });
    return Promise.resolve();
  }
  complete(providerCallId: string): ProviderCallState {
    const call = this.requireCall(providerCallId);
    const completed = { ...call, status: 'completed' as const };
    this.calls.set(providerCallId, completed);
    return completed;
  }
  private requireCall(id: string) {
    const call = this.calls.get(id);
    if (!call) throw new Error('unknown_mock_call');
    return call;
  }
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/gu, '');
  return `${'*'.repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

/** Generates signatures for the network-free Fake Twilio Server test harness. */
export function signFakeTwilioWebhook(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  return twilio.getExpectedTwilioSignature(authToken, url, params);
}
