import { describe, expect, it } from 'vitest';
import {
  realtimeSessionTerminateRoles,
  terminableRealtimeStatuses,
} from './realtime-session.policy.js';

describe('realtime session policy', () => {
  it('keeps termination privileged and bounded to active states', () => {
    expect(realtimeSessionTerminateRoles).toEqual(['system_admin', 'admin']);
    expect(terminableRealtimeStatuses).toEqual(['reserved', 'connecting', 'active', 'ending']);
  });
});
