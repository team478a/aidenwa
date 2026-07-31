import { describe, expect, it, vi } from 'vitest';
import { createServerSocketTransport } from './media-stream.transport.js';

describe('media stream transport adapter', () => {
  it('forwards socket operations', () => {
    const socket = { bufferedAmount: 12, send: vi.fn(), close: vi.fn() };
    const transport = createServerSocketTransport(socket as never);
    expect(transport.bufferedAmount).toBe(12);
    transport.send('event');
    transport.close(1000, 'done');
    expect(socket.send).toHaveBeenCalledWith('event');
    expect(socket.close).toHaveBeenCalledWith(1000, 'done');
  });
});
