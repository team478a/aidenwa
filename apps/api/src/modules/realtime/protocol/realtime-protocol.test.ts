import { describe, expect, it } from 'vitest';
import { realtimeRawDataText, sanitizeRealtimeCode } from './realtime-protocol.js';

describe('realtime protocol utilities', () => {
  it('sanitizes codes and converts buffers', () => {
    expect(sanitizeRealtimeCode('IDLE_TIMEOUT')).toBe('idle_timeout');
    expect(sanitizeRealtimeCode('unsafe: secret')).toBe('internal_error');
    expect(realtimeRawDataText(Buffer.from('event'))).toBe('event');
  });
});
