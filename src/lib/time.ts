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

/**
 * The zone of a time known only by its UTC offset, such as a photo shot in another zone. It is no
 * zone Intl knows, so display and day grouping fall back to the offset. Offset strings such as
 * `+07:00` would not do, as Intl accepts them as zones.
 */
export const offsetOnlyZone = 'offset-only';

/**
 * The context for a time recorded with an offset: `timeZone` itself when its offset at that
 * instant is the same, otherwise offset only.
 */
export function contextForOffset(
  epochMs: number,
  utcOffsetMin: number,
  timeZone: string,
): TimeContext {
  return {
    timeZone: zoneOffsetMin(epochMs, timeZone) === utcOffsetMin ? timeZone : offsetOnlyZone,
    utcOffsetMin,
  };
}

/** Minutes ahead of UTC in a zone at an instant, or null for a zone Intl doesn't know. */
export function zoneOffsetMin(epochMs: number, timeZone: string): number | null {
  let name: string | undefined;
  try {
    name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(epochMs)
      .find((part) => part.type === 'timeZoneName')?.value;
  } catch {
    return null;
  }
  // `GMT+05:30`, or plain `GMT` at UTC.
  const match = name?.match(/^GMT(?:([+-])(\d{2}):(\d{2}))?$/);
  if (!match) return null;
  if (!match[1]) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
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

/** `UTC+13:00`, `UTC-03:30`, or `UTC` for an offset in minutes. */
export function formatUtcOffset(offsetMin: number): string {
  if (offsetMin === 0) return 'UTC';
  const sign = offsetMin < 0 ? '-' : '+';
  const hours = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
  const minutes = String(Math.abs(offsetMin) % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
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
