import type { Entry } from '../../db/schema.ts';
import type { LatLon } from '../../lib/coords.ts';
import { type DayKey, localDayKey } from '../../lib/time.ts';
import { isWeakFix, looksImprecise } from '../capture/capture.ts';

/** What a trip summary needs from each entry. */
export type SummaryEntry = Pick<
  Entry,
  'loggedAt' | 'timeZone' | 'utcOffsetMin' | 'lat' | 'lon' | 'accuracyM'
>;

export interface TripSummary {
  readonly entries: number;
  readonly photos: number;
  /** The earliest and latest local days, each in the zone its entry was logged in. */
  readonly days: {
    readonly first: DayKey;
    readonly last: DayKey;
    /** Calendar days from the first to the last, both included. */
    readonly span: number;
    readonly withEntries: number;
  } | null;
  /**
   * Metres in straight lines between entries, in the order they were logged. Null with fewer than
   * two fixes to measure between.
   */
  readonly distanceM: number | null;
  /** Fixes left out of the distance, as they were kilometres wide (Precise Location off). */
  readonly impreciseFixes: number;
  /** Fixes less accurate than the accuracy target. */
  readonly weakFixes: number;
}

const dayMs = 86_400_000;

/** Mean radius of the Earth, in metres. */
const earthRadiusM = 6_371_008.8;

export function summariseTrip(
  entries: readonly SummaryEntry[],
  photos: number,
  accuracyTargetM: number,
): TripSummary {
  const inOrder = [...entries].sort((a, b) => a.loggedAt - b.loggedAt);
  const measurable = inOrder.filter((entry) => !looksImprecise(entry.accuracyM));

  let distanceM: number | null = null;
  for (let index = 1; index < measurable.length; index++) {
    const from = measurable[index - 1];
    const to = measurable[index];
    if (from && to) distanceM = (distanceM ?? 0) + greatCircleM(from, to);
  }

  return {
    entries: entries.length,
    photos,
    days: daySpan(inOrder),
    distanceM,
    impreciseFixes: inOrder.length - measurable.length,
    weakFixes: entries.filter((entry) => isWeakFix(entry.accuracyM, accuracyTargetM)).length,
  };
}

function daySpan(entries: readonly SummaryEntry[]): TripSummary['days'] {
  // Days are compared as keys, not by time: after flying east, a later entry can fall on an
  // earlier local day.
  const days = [...new Set(entries.map((entry) => localDayKey(entry.loggedAt, entry)))].sort();
  const first = days[0];
  const last = days.at(-1);
  if (first === undefined || last === undefined) return null;
  return {
    first,
    last,
    span: Math.round((dayStart(last) - dayStart(first)) / dayMs) + 1,
    withEntries: days.length,
  };
}

function dayStart(day: DayKey): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** The haversine distance between two points, in metres. */
export function greatCircleM(a: LatLon, b: LatLon): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** `About 650 m`, `About 4.2 km`, or `About 1,234 km`. */
export function formatDistance(metres: number): string {
  if (metres < 10) return 'Under 10 m';
  if (metres < 1000) return `About ${Math.round(metres / 10) * 10} m`;
  if (metres < 10_000) return `About ${(metres / 1000).toFixed(1)} km`;
  return `About ${Math.round(metres / 1000).toLocaleString('en-NZ')} km`;
}

const shortDay = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const shortDayWithYear = new Intl.DateTimeFormat('en-NZ', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** `Sat, 3 Oct to Fri, 9 Oct 2026`, with the year on both ends only when they differ. */
export function formatDayRange(first: DayKey, last: DayKey): string {
  const end = shortDayWithYear.format(dayStart(last));
  if (first === last) return end;
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const start = (sameYear ? shortDay : shortDayWithYear).format(dayStart(first));
  return `${start} to ${end}`;
}
