import type { DayKey, TimeContext } from './time.ts';

/** `±8 m`, `±120 m`, or `±1.4 km`. */
export function formatAccuracy(metres: number): string {
  if (metres >= 1000) return `±${(metres / 1000).toFixed(1)} km`;
  return `±${Math.round(metres)} m`;
}

const fullTime: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
};
const clockTime: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-NZ', { ...options, timeZone });
    formatters.set(key, cached);
  }
  return cached;
}

function formatInZone(
  epochMs: number,
  context: TimeContext,
  options: Intl.DateTimeFormatOptions,
): string {
  try {
    return formatter(context.timeZone, options).format(epochMs);
  } catch {
    // Unknown zone: show the recorded offset's local time, marked with that offset.
    const shifted = epochMs + context.utcOffsetMin * 60_000;
    const sign = context.utcOffsetMin < 0 ? '-' : '+';
    const hours = Math.floor(Math.abs(context.utcOffsetMin) / 60);
    const minutes = Math.abs(context.utcOffsetMin) % 60;
    const offset = `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
    return `${formatter('UTC', options).format(shifted)} (${offset})`;
  }
}

/** The local date and time an entry was logged, in the zone where it was logged. */
export function formatLoggedTime(epochMs: number, context: TimeContext): string {
  return formatInZone(epochMs, context, fullTime);
}

/** Just the local clock time an entry was logged, for lists already grouped by day. */
export function formatLoggedClock(epochMs: number, context: TimeContext): string {
  return formatInZone(epochMs, context, clockTime);
}

/** `Wednesday, 14 October 2026` */
export function formatDay(day: DayKey): string {
  return formatter('UTC', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(Date.parse(`${day}T00:00:00Z`));
}

/** A moment in this device's own time zone, such as when the last backup was made. */
export function formatDeviceTime(epochMs: number): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return formatter(timeZone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(epochMs);
}

/** `850 KB` or `12.4 MB`, in the decimal units the Files app uses. */
export function formatBytes(bytes: number): string {
  if (bytes < 1e6) return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

/** `1 entry` or `3 entries`. */
export function formatCount(value: number, one: string, many: string): string {
  return `${value} ${value === 1 ? one : many}`;
}
