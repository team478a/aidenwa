/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it, vi } from 'vitest';
import { OpenAIRealtimeProvider, type RealtimeSocket } from './index.js';

class FakeSocket implements RealtimeSocket {
  bufferedAmount = 0;
  sent: string[] = [];
  handlers = new Map<string, Array<(...args: never[]) => void>>();
  send(value: string) {
    this.sent.push(value);
  }
  close = vi.fn();
  on(event: 'open' | 'message' | 'close' | 'error', handler: (...args: never[]) => void) {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }
  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...(args as never[]));
  }
}

describe('OpenAI realtime transport adapter', () => {
  it('does not construct a socket while disabled', async () => {
    const factory = vi.fn();
    await expect(
      new OpenAIRealtimeProvider(
        { enabled: false, apiKey: 'sk-valid_key_123456789', model: 'gpt-realtime-mini' },
        factory,
      ).connect({ sessionId: 's', instructions: 'safe', maxSeconds: 120 }),
    ).rejects.toThrow('REALTIME_AI_DISABLED');
    expect(factory).not.toHaveBeenCalled();
  });

  it('configures PCMU and maps audio without exposing provider events', async () => {
    const socket = new FakeSocket();
    const provider = new OpenAIRealtimeProvider(
      { enabled: true, apiKey: 'sk-valid_key_123456789', model: 'gpt-realtime-mini' },
      () => socket,
    );
    const pending = provider.connect({ sessionId: 's', instructions: 'safe', maxSeconds: 120 });
    socket.emit('open');
    const connection = await pending;
    const listener = vi.fn();
    connection.onEvent(listener);
    socket.emit(
      'message',
      JSON.stringify({ type: 'response.created', response: { id: 'generation-1' } }),
    );
    socket.emit(
      'message',
      JSON.stringify({
        type: 'response.output_audio.delta',
        delta: Buffer.from([1]).toString('base64'),
      }),
    );
    expect(JSON.parse(socket.sent[0] ?? '{}').session.audio.input.format.type).toBe('audio/pcmu');
    expect(listener.mock.calls[0]?.[0]).toMatchObject({
      type: 'assistant.audio_delta',
      generationId: 'generation-1',
    });
  });
});
