export const appointmentStatuses = [
  'held',
  'confirmed',
  'reschedule_requested',
  'cancelled',
  'completed',
  'no_show',
  'expired',
] as const;

export type AppointmentStatus = (typeof appointmentStatuses)[number];
export type AppointmentAction =
  'confirm' | 'cancel' | 'complete' | 'no_show' | 'request_reschedule';

const transitions: Record<
  AppointmentStatus,
  Partial<Record<AppointmentAction, AppointmentStatus>>
> = {
  held: { confirm: 'confirmed', cancel: 'cancelled' },
  confirmed: {
    cancel: 'cancelled',
    complete: 'completed',
    no_show: 'no_show',
    request_reschedule: 'reschedule_requested',
  },
  reschedule_requested: { cancel: 'cancelled' },
  cancelled: {},
  completed: {},
  no_show: {},
  expired: {},
};

export function nextAppointmentStatus(
  current: string,
  action: AppointmentAction,
): AppointmentStatus | null {
  if (!appointmentStatuses.includes(current as AppointmentStatus)) return null;
  return transitions[current as AppointmentStatus][action] ?? null;
}

export function assertAppointmentTransition(input: {
  current: string;
  action: AppointmentAction;
  startAt: Date;
  cancellationDeadlineMinutes: number;
  now: Date;
}) {
  const next = nextAppointmentStatus(input.current, input.action);
  if (!next) throw new Error('APPOINTMENT_TRANSITION_INVALID');
  if ((next === 'completed' || next === 'no_show') && input.now.getTime() < input.startAt.getTime())
    throw new Error('APPOINTMENT_START_NOT_REACHED');
  if (
    next === 'cancelled' &&
    input.current !== 'held' &&
    input.now.getTime() > input.startAt.getTime() - input.cancellationDeadlineMinutes * 60_000
  )
    throw new Error('APPOINTMENT_CANCELLATION_DEADLINE_PASSED');
  return next;
}
