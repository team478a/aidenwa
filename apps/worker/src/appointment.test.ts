import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@sales-ai/database';
import { maintainAppointments } from './appointment.js';

describe('Stage 4E appointment worker', () => {
  it('keeps an empty batch idempotent and performs no external work', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      appointment: { findMany },
      appointmentEvent: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    } as unknown as PrismaClient;
    await expect(maintainAppointments(prisma, new Date('2026-07-20T00:00:00Z'))).resolves.toEqual({
      expired: 0,
      upcoming: 0,
      deletedEvents: 0,
    });
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('expires a held appointment once and remains idempotent on retry', async () => {
    const held = {
      id: '8c345c09-3fa0-4c08-adf9-0684236ef82c',
      organizationId: 'e279486d-e84e-4ad5-abf5-79001a6d03de',
      assigneeUserId: '67695a50-5ac7-4f61-b99e-64172ea66acf',
    };
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([held])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([held])
      .mockResolvedValueOnce([]);
    const updateMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const create = vi.fn().mockResolvedValue({});
    const upsert = vi.fn().mockResolvedValue({});
    const tx = {
      appointment: { updateMany },
      appointmentEvent: { create },
      followupNotification: { upsert },
    };
    const prisma = {
      appointment: { findMany },
      appointmentEvent: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
      followupNotification: { upsert },
    } as unknown as PrismaClient;
    const now = new Date('2026-07-20T00:00:00Z');

    await maintainAppointments(prisma, now);
    await maintainAppointments(prisma, now);

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
