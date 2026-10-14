import type { TimeContext } from './time.ts';

/** `±8 m`, `±120 m`, or `±1.4 km`. */
export function formatAccuracy(metres: number): string {
  if (metres >= 1000) return `±${(metres / 1000).toFixed(1)} km`;
  return `±${Math.round(metres)} m`;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = timeFormatters.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-NZ', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
    timeFormatters.set(timeZone, cached);
  }
  return cached;
}

/** The local time an entry was logged, in the zone where it was logged. */
export function formatLoggedTime(epochMs: number, context: TimeContext): string {
  try {
    return formatter(context.timeZone).format(epochMs);
  } catch {
    // Unknown zone: show the recorded offset's local time, marked with that offset.
    const shifted = epochMs + context.utcOffsetMin * 60_000;
    const sign = context.utcOffsetMin < 0 ? '-' : '+';
    const hours = Math.floor(Math.abs(context.utcOffsetMin) / 60);
    const minutes = Math.abs(context.utcOffsetMin) % 60;
    const offset = `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
    return `${formatter('UTC').format(shifted)} (${offset})`;
  }
}
