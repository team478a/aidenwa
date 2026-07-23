import { describe, expect, it } from 'vitest';
import twilio from 'twilio';
import {
  FakeTwilioServer,
  MockVoiceProvider,
  ProductionVoiceProviderStub,
  TwilioVoiceProvider,
  buildStage4B1Twiml,
  maskPhone,
} from './index';

describe('MockVoiceProvider', () => {
  it('is deterministic and idempotent without accepting raw phone numbers', async () => {
    const provider = new MockVoiceProvider();
    const first = await provider.createCall({
      idempotencyKey: 'same',
      maskedDestination: '******5678',
      fixture: 'qualified',
    });
    const second = await provider.createCall({
      idempotencyKey: 'same',
      maskedDestination: '******5678',
      fixture: 'opt_out',
    });
    expect(second).toEqual(first);
    expect(provider.calls).toHaveLength(1);
    await expect(
      provider.createCall({ idempotencyKey: 'raw', maskedDestination: '09012345678' }),
    ).rejects.toThrow('masked_destination_required');
  });
  it('masks phone numbers', () => expect(maskPhone('090-1234-5678')).toBe('*******5678'));
});

describe('ProductionVoiceProviderStub', () => {
  it('rejects every production call without a network implementation', async () => {
    const stub = new ProductionVoiceProviderStub();
    await expect(
      stub.createCall({ idempotencyKey: 'x', maskedDestination: '****1234' }),
    ).rejects.toThrow('production_provider_disabled');
    await expect(stub.getCall('x')).rejects.toThrow('production_provider_disabled');
    await expect(stub.cancelCall('x')).rejects.toThrow('production_provider_disabled');
    await expect(stub.verifyWebhook(new Headers(), Buffer.from('{}'))).resolves.toBe(false);
  });
});

describe('TwilioVoiceProvider Stage 4B-1 boundary', () => {
  const config = {
    accountSid: 'AC00000000000000000000000000000000',
    apiKeySid: 'SK00000000000000000000000000000000',
    apiKeySecret: 'fake-secret',
    authToken: 'fake-auth-token',
    estimatedCostMinorPerMinute: 25,
    currency: 'JPY',
  };

  it('creates the exact bounded request through the network-free Fake Twilio Server', async () => {
    const fake = new FakeTwilioServer();
    const provider = new TwilioVoiceProvider(config, fake);
    const result = await provider.createProductionCall({
      idempotencyKey: 'execution-1',
      destinationE164: '+815000000001',
      fromE164: '+815000000099',
      twimlUrl: 'https://voice.example.test/api/v1/twilio/twiml/execution-1',
      statusCallbackUrl: 'https://voice.example.test/api/v1/twilio/status/execution-1',
      timeoutSeconds: 20,
      timeLimitSeconds: 120,
      record: false,
    });
    expect(result.providerCallId).toMatch(/^CA[0-9a-f]{32}$/u);
    expect(fake.createRequests).toEqual([
      expect.objectContaining({
        to: '+815000000001',
        from: '+815000000099',
        timeLimit: 120,
        record: false,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      }),
    ]);
  });

  it('fails closed for unsafe duration, recording and unsupported transfer', async () => {
    const provider = new TwilioVoiceProvider(config, new FakeTwilioServer());
    await expect(
      provider.createProductionCall({
        idempotencyKey: 'unsafe',
        destinationE164: '+815000000001',
        fromE164: '+815000000099',
        twimlUrl: 'https://voice.example.test/twiml',
        statusCallbackUrl: 'https://voice.example.test/status',
        timeoutSeconds: 20,
        timeLimitSeconds: 121 as 120,
        record: false,
      }),
    ).rejects.toThrow('STAGE_4B1_SAFETY_CONSTRAINT');
    expect(() => provider.requestHumanTransfer()).toThrow('NOT_SUPPORTED_IN_STAGE_4B1');
  });

  it('validates signed callbacks, estimates integer cost and cancels/ends fake calls', async () => {
    const fake = new FakeTwilioServer();
    const provider = new TwilioVoiceProvider(config, fake);
    const call = await provider.createProductionCall({
      idempotencyKey: 'controls',
      destinationE164: '+815000000001',
      fromE164: '+815000000099',
      twimlUrl: 'https://voice.example.test/twiml',
      statusCallbackUrl: 'https://voice.example.test/status',
      timeoutSeconds: 20,
      timeLimitSeconds: 120,
      record: false,
    });
    const url = 'https://voice.example.test/status';
    const params = { CallSid: call.providerCallId, CallStatus: 'completed' };
    const signature = twilio.getExpectedTwilioSignature(config.authToken, url, params);
    expect(provider.validateWebhook(signature, url, params)).toBe(true);
    expect(provider.validateWebhook('invalid', url, params)).toBe(false);
    await expect(provider.getEstimatedCost(120)).resolves.toEqual({
      amountMinor: 50,
      currency: 'JPY',
    });
    await provider.cancelProductionCall(call.providerCallId);
    await provider.endProductionCall(call.providerCallId);
    expect(fake.updates.map((x) => x.status)).toEqual(['canceled', 'completed']);
  });

  it('generates fixed safe TwiML and a distinct retry prompt', () => {
    const initial = buildStage4B1Twiml('https://voice.example.test/dtmf?retry=0', 'Polly.Mizuki');
    const retry = buildStage4B1Twiml(
      'https://voice.example.test/dtmf?retry=1',
      'Polly.Mizuki',
      true,
    );
    for (const xml of [initial, retry]) {
      expect(xml).toContain('<Gather');
      expect(xml).toContain('input="dtmf"');
      expect(xml).toContain('numDigits="1"');
      expect(xml).not.toMatch(/<(Record|Dial|Connect|Stream)\b/u);
    }
    expect(initial).toContain('録音していません');
    expect(retry).toContain('入力を確認できませんでした');
  });
});
