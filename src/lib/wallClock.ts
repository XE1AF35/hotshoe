import { instantInZone, type TimeContext, zoneOffsetMin } from './time.ts';

/** An Entry's logged time with the time context worked out for it. */
export interface LoggedTime extends TimeContext {
  readonly loggedAt: number;
}

/**
 * A date and time field's value, such as `2026-10-14T10:35` or `2026-10-14T10:35:12`, as if it
 * were UTC. Null while blank, incomplete, or a day that doesn't exist.
 */
export function parseWallClock(text: string): number | null {
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match
    .slice(1)
    .map((part) => Number(part ?? 0)) as [number, number, number, number, number, number];
  if (hour > 23 || minute > 59 || second > 59) return null;
  const wall = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Date.UTC rolls a 31 February over into March, and reads years before 100 as 19xx.
  wall.setUTCFullYear(year);
  if (wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day) return null;
  return wall.getTime();
}

/**
 * The value to start a date and time field at: the instant's local time in the entry's own zone,
 * to the minute, the same time the list shows. An offset-only or unknown zone uses its offset.
 */
export function wallClockValue(epochMs: number, context: TimeContext): string {
  const offsetMin = zoneOffsetMin(epochMs, context.timeZone) ?? context.utcOffsetMin;
  return new Date(epochMs + offsetMin * 60_000).toISOString().slice(0, 16);
}

/**
 * The instant a date and time field names in the entry's own zone, with its context. The zone
 * stays the same: a named zone gets its offset at the new instant, while an offset-only or
 * unknown zone keeps its offset. A time the clocks skipped moves forward by the jump, and one they
 * showed twice is the earlier. Null for a value that is no time.
 */
export function loggedTimeFromWallClock(text: string, context: TimeContext): LoggedTime | null {
  const wallMs = parseWallClock(text);
  if (wallMs === null) return null;
  const inZone = instantInZone(wallMs, context.timeZone);
  if (inZone === null) {
    return { ...context, loggedAt: wallMs - context.utcOffsetMin * 60_000 };
  }
  return {
    ...context,
    loggedAt: inZone,
    utcOffsetMin: zoneOffsetMin(inZone, context.timeZone) ?? context.utcOffsetMin,
  };
}
