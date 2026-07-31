import type { WebSocket as ServerSocket } from 'ws';
import WebSocket from 'ws';
import type { RealtimeSocket } from '@sales-ai/realtime';

export function createOpenAIRealtimeSocket(
  url: string,
  headers: Readonly<Record<string, string>>,
): RealtimeSocket {
  return new WebSocket(url, { headers });
}

export function createServerSocketTransport(socket: ServerSocket) {
  return {
    get bufferedAmount() {
      return socket.bufferedAmount;
    },
    send: (value: string) => socket.send(value),
    close: (code?: number, reason?: string) => socket.close(code, reason),
  };
}
