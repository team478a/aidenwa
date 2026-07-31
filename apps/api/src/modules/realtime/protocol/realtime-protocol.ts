import type { RawData } from 'ws';

export function sanitizeRealtimeCode(value: string) {
  return /^[A-Z0-9_]+$/i.test(value) ? value.toLowerCase() : 'internal_error';
}

export function realtimeRawDataText(data: RawData) {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return Buffer.from(data).toString('utf8');
}
