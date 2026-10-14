/**
 * Camera clock matching. Photograph Hotshoe's clock with the camera, then enter the time on that
 * clock and the camera's own time for the same photo. The difference covers both a drifting
 * clock and a camera set to another time zone, and lets GPX exports use the camera's time.
 */

import type { CameraClock } from '../../db/schema.ts';

const dayS = 86_400;
/** Further apart than this, a date was probably typed wrongly. */
const maxOffsetS = 30 * dayS;

/** A date and time as shown on a clock, with no time zone. */
export interface WallTime {
  /** `YYYY-MM-DD`, as a date input gives it. */
  readonly date: string;
  /** `14:03:27`, `14.03.27`, `140327`, or `2:03:27 pm`. Seconds may be left off. */
  readonly time: string;
}

/** Turns a wall-clock time, written as if it were UTC, into a moment on this device. */
export type DeviceZone = (wallMs: number) => { instantMs: number; utcOffsetMin: number };

/** This device's own time zone, daylight saving included. */
export const deviceZone: DeviceZone = (wallMs) => {
  const wall = new Date(wallMs);
  const local = new Date(
    wall.getUTCFullYear(),
    wall.getUTCMonth(),
    wall.getUTCDate(),
    wall.getUTCHours(),
    wall.getUTCMinutes(),
    wall.getUTCSeconds(),
  );
  const offset = local.getTimezoneOffset();
  return { instantMs: local.getTime(), utcOffsetMin: offset === 0 ? 0 : -offset };
};

export type Measurement =
  | { readonly ok: true; readonly clock: CameraClock }
  | { readonly ok: false; readonly problem: string };

export function measureCameraClock(
  hotshoe: WallTime,
  camera: WallTime,
  now: number,
  zone: DeviceZone = deviceZone,
): Measurement {
  const shown = wallTimeMs(hotshoe);
  if (shown === null) return { ok: false, problem: "Enter the date and time on Hotshoe's clock." };
  const cameraWall = wallTimeMs(camera);
  if (cameraWall === null) return { ok: false, problem: "Enter the camera's date and time." };

  const { instantMs, utcOffsetMin } = zone(shown);
  const offsetS = Math.round((cameraWall - instantMs) / 1000);
  if (Math.abs(offsetS) > maxOffsetS) {
    return { ok: false, problem: 'Those are more than 30 days apart. Check the dates.' };
  }
  return { ok: true, clock: { offsetS, phoneUtcOffsetMin: utcOffsetMin, measuredAt: now } };
}

/** "Your camera's clock is 2 min 4 s ahead of this iPhone." */
export function describeCameraClock(clock: CameraClock): string {
  const driftS = clock.offsetS - clock.phoneUtcOffsetMin * 60;
  if (driftS === 0) return "Your camera's clock matches this iPhone to the second.";
  const sentence = `Your camera's clock is ${formatDuration(Math.abs(driftS))} ${
    driftS > 0 ? 'ahead of' : 'behind'
  } this iPhone.`;
  // Half an hour or more apart is more likely a time zone setting than drift.
  return Math.abs(driftS) >= 1800
    ? `${sentence} It may be set to a different time zone, which is fine.`
    : sentence;
}

/** What the camera's clock read at a moment, written as if it were UTC, for GPX times. */
export function toCameraTime(epochMs: number, clock: CameraClock): number {
  return epochMs + clock.offsetS * 1000;
}

/** Every UTC offset in use somewhere, in minutes, for choosing a photo software time zone. */
export const utcOffsetChoices: readonly number[] = [
  -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60, 0, 60, 120,
  180, 210, 240, 270, 300, 330, 345, 360, 390, 420, 480, 525, 540, 570, 600, 630, 660, 720, 765,
  780, 825, 840,
];

/** `2 h 3 min 4 s`, leaving out parts that are zero. */
export function formatDuration(totalS: number): string {
  const days = Math.floor(totalS / dayS);
  const hours = Math.floor((totalS % dayS) / 3600);
  const minutes = Math.floor((totalS % 3600) / 60);
  const seconds = totalS % 60;
  const parts = [
    days > 0 && `${days} ${days === 1 ? 'day' : 'days'}`,
    hours > 0 && `${hours} h`,
    minutes > 0 && `${minutes} min`,
    seconds > 0 && `${seconds} s`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '0 s';
}

/** The wall time as milliseconds, read as if it were UTC, or null if it isn't a real time. */
function wallTimeMs({ date, time }: WallTime): number | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const seconds = parseClockTime(time);
  if (!day || seconds === null) return null;
  const [year, month, dayOfMonth] = [Number(day[1]), Number(day[2]), Number(day[3])];
  const ms = Date.UTC(year, month - 1, dayOfMonth) + seconds * 1000;
  // Date.UTC rolls 31 February over into March; a real date comes back unchanged.
  const check = new Date(ms);
  return check.getUTCMonth() === month - 1 && check.getUTCDate() === dayOfMonth ? ms : null;
}

/** Seconds since midnight, or null. Accepts the ways a time is likely to be typed. */
export function parseClockTime(text: string): number | null {
  const cleaned = text.trim().toLowerCase();
  const meridiem = /\s*([ap])\.?m\.?$/.exec(cleaned);
  const digits = (meridiem ? cleaned.slice(0, meridiem.index) : cleaned).trim();

  let parts: number[];
  if (/^\d{4}(\d{2})?$/.test(digits)) {
    parts = digits.match(/\d{2}/g)?.map(Number) ?? [];
  } else if (/^\d{1,2}([:.\s]\d{2}){1,2}$/.test(digits)) {
    parts = digits.split(/[:.\s]/).map(Number);
  } else {
    return null;
  }
  let [hours = 0, minutes = 0, seconds = 0] = parts;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem[1] === 'p' ? 12 : 0);
  }
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}
