import { describe, expect, it, vi } from 'vitest';
import {
  buildTwilioMediaStreamTwiml,
  FakeRealtimeProvider,
  normalizeTwilioStreamEvent,
  OpenAIRealtimeProvider,
  TwilioMediaStreamGuard,
  validateToolArguments,
} from './index.js';

describe('Stage 4B-2 realtime boundary', () => {
  it('normalizes μ-law media without retaining its encoded source', () => {
    const event = normalizeTwilioStreamEvent(
      {
        event: 'media',
        sequenceNumber: '1',
        streamSid: 'MZ-test',
        media: { track: 'inbound', payload: Buffer.from([1, 2]).toString('base64') },
      },
      1024,
    );
    expect(event).toMatchObject({ type: 'media', sequence: 1 });
    if (event.type === 'media') expect([...event.audio]).toEqual([1, 2]);
  });

  it('rejects oversized and replayed stream events', () => {
    expect(() => normalizeTwilioStreamEvent({ padding: 'x'.repeat(2000) }, 1024)).toThrow(
      'REALTIME_EVENT_TOO_LARGE',
    );
    const guard = new TwilioMediaStreamGuard(1024);
    guard.accept({ event: 'connected', sequenceNumber: '2' });
    expect(() => guard.accept({ event: 'stop', sequenceNumber: '2' })).toThrow(
      'NON_MONOTONIC_STREAM_SEQUENCE',
    );
  });

  it('keeps media streams behind an explicit flag and WSS', () => {
    expect(() =>
      buildTwilioMediaStreamTwiml({
        enabled: false,
        websocketUrl: 'wss://example.test/media',
        sessionToken: 'x',
      }),
    ).toThrow('TWILIO_MEDIA_STREAMS_DISABLED');
    expect(() =>
      buildTwilioMediaStreamTwiml({
        enabled: true,
        websocketUrl: 'ws://example.test/media',
        sessionToken: 'x',
      }),
    ).toThrow('MEDIA_STREAM_WSS_REQUIRED');
    expect(
      buildTwilioMediaStreamTwiml({
        enabled: true,
        websocketUrl: 'wss://example.test/media',
        sessionToken: 'safe',
      }),
    ).toContain('<Connect><Stream');
  });

  it('emits deterministic barge-in and supports response cancellation', async () => {
    const connection = await new FakeRealtimeProvider('barge_in').connect({
      sessionId: 'session',
      instructions: 'safe',
      maxSeconds: 120,
    });
    const listener = vi.fn();
    connection.onEvent(listener);
    await connection.appendCallerAudio(Buffer.from([1]), 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).toHaveBeenCalledWith({ type: 'caller.speech_started', sequence: 2 });
    await expect(connection.cancelAssistantResponse('barge_in')).resolves.toBeUndefined();
  });

  it('rejects unknown tool fields and fails closed without external connection', async () => {
    expect(() =>
      validateToolArguments('mark_opt_out', { reasonCode: 'requested', phone: '+81' }),
    ).toThrow('INVALID_TOOL_ARGUMENTS');
    await expect(
      new OpenAIRealtimeProvider({ enabled: false, model: 'gpt-realtime-mini' }).connect({
        sessionId: 'test',
        instructions: 'test',
        maxSeconds: 120,
      }),
    ).rejects.toThrow('REALTIME_AI_DISABLED');
  });
});
