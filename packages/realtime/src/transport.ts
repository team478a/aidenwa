export type SocketMessage = string | Buffer;

export interface RealtimeSocket {
  readonly bufferedAmount: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'open', handler: () => void): void;
  on(event: 'message', handler: (data: SocketMessage) => void): void;
  on(event: 'close', handler: (code: number, reason: Buffer) => void): void;
  on(event: 'error', handler: (cause: Error) => void): void;
}

export type SocketFactory = (
  url: string,
  headers: Readonly<Record<string, string>>,
) => RealtimeSocket;

export function parseSocketJson(data: SocketMessage, maxBytes: number): Record<string, unknown> {
  const text = typeof data === 'string' ? data : data.toString('utf8');
  if (Buffer.byteLength(text) > maxBytes) throw new Error('REALTIME_EVENT_TOO_LARGE');
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('INVALID_SOCKET_EVENT');
  return parsed as Record<string, unknown>;
}

export function strictBase64(value: unknown, maxBytes: number) {
  if (
    typeof value !== 'string' ||
    !value.length ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    throw new Error('INVALID_MEDIA_PAYLOAD');
  const audio = Buffer.from(value, 'base64');
  if (audio.length > maxBytes) throw new Error('AUDIO_BUFFER_OVERFLOW');
  return audio;
}
