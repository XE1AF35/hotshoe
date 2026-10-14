/** Where on the clock an entry was logged, kept so local times stay correct after travelling. */
export interface TimeContext {
  /** IANA zone, for example `Pacific/Auckland`. */
  readonly timeZone: string;
  /** Minutes ahead of UTC at the moment of logging, for example 780 for NZDT. */
  readonly utcOffsetMin: number;
}

/** A calendar day in `YYYY-MM-DD` form. */
export type DayKey = string & { readonly __brand: 'DayKey' };

export function captureTimeContext(at: Date): TimeContext {
  return {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    // getTimezoneOffset is minutes *behind* UTC, so flip the sign.
    utcOffsetMin: at.getTimezoneOffset() === 0 ? 0 : -at.getTimezoneOffset(),
  };
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = dayFormatters.get(timeZone);
  if (cached) return cached;
  try {
    // en-CA formats dates as YYYY-MM-DD.
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayFormatters.set(timeZone, formatter);
    return formatter;
  } catch {
    // Unknown zone, for example from a backup made on a device with newer time zone data.
    return null;
  }
}

/**
 * The local calendar day an instant fell on where it was logged.
 * Uses the zone's rules when the zone is known, otherwise the offset recorded at the time.
 */
export function localDayKey(epochMs: number, context: TimeContext): DayKey {
  const formatter = dayFormatter(context.timeZone);
  if (formatter) {
    return formatter.format(epochMs) as DayKey;
  }
  const shifted = new Date(epochMs + context.utcOffsetMin * 60_000);
  return shifted.toISOString().slice(0, 10) as DayKey;
}

/**
 * An instant as local time with its UTC offset, as recorded when it was logged:
 * `2026-10-14T16:12:45+13:00`. Whole seconds, like the times photo software reads.
 */
export function formatLocalIso(epochMs: number, utcOffsetMin: number): string {
  const local = new Date(epochMs + utcOffsetMin * 60_000).toISOString().slice(0, 19);
  const sign = utcOffsetMin < 0 ? '-' : '+';
  const hours = String(Math.floor(Math.abs(utcOffsetMin) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(utcOffsetMin) % 60).padStart(2, '0');
  return `${local}${sign}${hours}:${minutes}`;
}

/** An instant in UTC to whole seconds: `2026-10-14T03:12:45Z`. */
export function formatUtcIso(epochMs: number): string {
  return `${new Date(epochMs).toISOString().slice(0, 19)}Z`;
}

/** Today's date on this device for file names: `20261014`. */
export function fileDateStamp(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
