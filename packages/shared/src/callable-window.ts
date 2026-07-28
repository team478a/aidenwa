const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function parseMinute(value: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(value);
  if (!match) return undefined;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Treats an overnight window as belonging to the weekday on which it starts.
 * For example, Monday 22:00–02:00 includes Tuesday 01:00 when Monday is enabled.
 */
export function inCallableWindow(
  now: Date,
  weekdays: readonly number[],
  startText: string,
  endText: string,
  timezone: string,
): boolean {
  const start = parseMinute(startText);
  const end = parseMinute(endText);
  if (start === undefined || end === undefined || !Number.isFinite(now.getTime())) return false;
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(now)
        .map((part) => [part.type, part.value]),
    );
  } catch {
    return false;
  }
  const weekday = WEEKDAYS.indexOf(parts.weekday as (typeof WEEKDAYS)[number]);
  const hour = Number(parts.hour);
  const minutePart = Number(parts.minute);
  if (weekday < 0 || !Number.isInteger(hour) || !Number.isInteger(minutePart)) return false;
  const minute = hour * 60 + minutePart;
  if (start <= end) return weekdays.includes(weekday) && minute >= start && minute <= end;
  if (minute >= start) return weekdays.includes(weekday);
  if (minute <= end) return weekdays.includes((weekday + 6) % 7);
  return false;
}
