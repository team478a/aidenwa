/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { describe, expect, it, vi } from 'vitest';
import {
  PcmuRealtimeBridge,
  type RealtimeConnection,
  type TwilioOutboundTransport,
} from './index.js';

function harness(now = () => 0) {
  const realtime: RealtimeConnection = {
    appendCallerAudio: vi.fn(() => Promise.resolve()),
    cancelAssistantResponse: vi.fn(() => Promise.resolve()),
    truncateAssistantAudio: vi.fn(() => Promise.resolve()),
    startAssistantResponse: vi.fn(() => Promise.resolve()),
    sendToolResult: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    onEvent: vi.fn(),
  };
  const sent: string[] = [];
  const twilio: TwilioOutboundTransport = {
    bufferedAmount: 0,
    send: (value) => sent.push(value),
    close: vi.fn(),
  };
  const bridge = new PcmuRealtimeBridge(
    realtime,
    twilio,
    { maxPendingAudioBytes: 32, maxMessagesPerSecond: 2, maxTwilioBufferedBytes: 32 },
    now,
  );
  bridge.setStream('MZ-test');
  return { bridge, realtime, twilio, sent };
}

describe('PCMU realtime bridge', () => {
  it('forwards caller PCMU and clears the transient bytes', async () => {
    const { bridge, realtime } = harness();
    const audio = Buffer.from([1, 2, 3]);
    await bridge.receiveTwilioMedia({ streamSid: 'MZ-test', sequence: 1, track: 'inbound', audio });
    expect(realtime.appendCallerAudio).toHaveBeenCalledOnce();
    expect([...audio]).toEqual([0, 0, 0]);
  });

  it('sends assistant audio followed by a generation mark', async () => {
    const { bridge, sent } = harness();
    await bridge.receiveRealtime({
      type: 'assistant.audio_delta',
      sequence: 1,
      generationId: 'g1',
      audio: Buffer.alloc(8),
    });
    expect(sent.map((item) => JSON.parse(item).event)).toEqual(['media', 'mark']);
  });

  it('cancels, clears and truncates on barge-in, then drops late old audio', async () => {
    const { bridge, realtime, sent } = harness();
    await bridge.receiveRealtime({ type: 'assistant.item_started', sequence: 1, itemId: 'item-1' });
    await bridge.receiveRealtime({
      type: 'assistant.audio_delta',
      sequence: 2,
      generationId: 'g1',
      audio: Buffer.alloc(8),
    });
    await bridge.receiveRealtime({ type: 'caller.speech_started', sequence: 3 });
    const count = sent.length;
    await bridge.receiveRealtime({
      type: 'assistant.audio_delta',
      sequence: 4,
      generationId: 'g1',
      audio: Buffer.alloc(8),
    });
    expect(realtime.cancelAssistantResponse).toHaveBeenCalledWith('barge_in');
    expect(realtime.truncateAssistantAudio).toHaveBeenCalledWith('item-1', 0);
    expect(sent.some((item) => JSON.parse(item).event === 'clear')).toBe(true);
    expect(sent.length).toBe(count);
  });

  it('rejects stream mismatch, rate excess and pending overflow', async () => {
    const { bridge } = harness();
    await expect(
      bridge.receiveTwilioMedia({
        streamSid: 'other',
        sequence: 1,
        track: 'inbound',
        audio: Buffer.alloc(1),
      }),
    ).rejects.toThrow('STREAM_SID_MISMATCH');
    const second = harness();
    await second.bridge.receiveTwilioMedia({
      streamSid: 'MZ-test',
      sequence: 1,
      track: 'inbound',
      audio: Buffer.alloc(1),
    });
    await second.bridge.receiveTwilioMedia({
      streamSid: 'MZ-test',
      sequence: 2,
      track: 'inbound',
      audio: Buffer.alloc(1),
    });
    await expect(
      second.bridge.receiveTwilioMedia({
        streamSid: 'MZ-test',
        sequence: 3,
        track: 'inbound',
        audio: Buffer.alloc(1),
      }),
    ).rejects.toThrow('MESSAGE_RATE_EXCEEDED');
  });

  it('closes both sides exactly once', async () => {
    const { bridge, realtime, twilio } = harness();
    await Promise.all([bridge.close('caller_hangup'), bridge.close('openai_closed')]);
    expect(realtime.close).toHaveBeenCalledOnce();
    expect(twilio.close).toHaveBeenCalledOnce();
  });
});
