export type BusyRange = { startAt: Date; endAt: Date };
export type ProviderHealth = { healthy: boolean; provider: string; external: boolean };
export interface CalendarProvider {
  health(): Promise<ProviderHealth>;
  listBusyRanges(input: { userId: string; from: Date; to: Date }): Promise<BusyRange[]>;
  createEvent(input: {
    appointmentId: string;
    startAt: Date;
    endAt: Date;
  }): Promise<{ fingerprint: string }>;
  updateEvent(input: {
    fingerprint: string;
    startAt: Date;
    endAt: Date;
  }): Promise<{ fingerprint: string }>;
  cancelEvent(input: { fingerprint: string }): Promise<void>;
}
export class InternalCalendarProvider implements CalendarProvider {
  health() {
    return Promise.resolve({ healthy: true, provider: 'internal', external: false });
  }
  listBusyRanges() {
    return Promise.resolve([]);
  }
  createEvent(input: { appointmentId: string }) {
    return Promise.resolve({ fingerprint: `internal:${input.appointmentId}` });
  }
  updateEvent(input: { fingerprint: string }) {
    return Promise.resolve({ fingerprint: input.fingerprint });
  }
  cancelEvent() {
    return Promise.resolve();
  }
}
export class FakeCalendarProvider extends InternalCalendarProvider {
  override health() {
    return Promise.resolve({ healthy: true, provider: 'fake', external: false });
  }
}
export class DisabledCalendarProvider implements CalendarProvider {
  health() {
    return Promise.resolve({ healthy: false, provider: 'disabled', external: false });
  }
  listBusyRanges(): Promise<BusyRange[]> {
    return Promise.reject(new Error('CALENDAR_INTEGRATION_DISABLED'));
  }
  createEvent(): Promise<{ fingerprint: string }> {
    return Promise.reject(new Error('CALENDAR_INTEGRATION_DISABLED'));
  }
  updateEvent(): Promise<{ fingerprint: string }> {
    return Promise.reject(new Error('CALENDAR_INTEGRATION_DISABLED'));
  }
  cancelEvent(): Promise<void> {
    return Promise.reject(new Error('CALENDAR_INTEGRATION_DISABLED'));
  }
}
