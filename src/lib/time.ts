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
