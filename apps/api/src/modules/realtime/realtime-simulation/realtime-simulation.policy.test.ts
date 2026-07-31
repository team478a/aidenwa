import { describe, expect, it } from 'vitest';
import {
  canExposeRealtimeSimulation,
  realtimeSimulationRoles,
} from './realtime-simulation.policy.js';

describe('realtime simulation policy', () => {
  it('is system-admin only and hidden in production', () => {
    expect(realtimeSimulationRoles).toEqual(['system_admin']);
    expect(canExposeRealtimeSimulation('production')).toBe(false);
    expect(canExposeRealtimeSimulation('test')).toBe(true);
  });
});
