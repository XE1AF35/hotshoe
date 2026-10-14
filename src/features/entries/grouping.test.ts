import { describe, expect, it } from 'vitest';
import type { Entry, EntryId, Trip, TripId } from '../../db/schema.ts';
import { groupByDayAndTrip } from './grouping.ts';

const nz = { timeZone: 'Pacific/Auckland', utcOffsetMin: 780 };
const london = { timeZone: 'Europe/London', utcOffsetMin: 60 };

function trip(id: string, name: string): Trip {
  return {
    id: id as TripId,
    name,
    createdAt: 0,
    updatedAt: 0,
    archivedAt: null,
    cameraClock: null,
  };
}

function entry(
  label: string,
  loggedAtIso: string,
  tripId: string | null = null,
  zone: { timeZone: string; utcOffsetMin: number } = nz,
): Entry {
  const loggedAt = Date.parse(loggedAtIso);
  return {
    id: label as EntryId,
    loggedAt,
    fixAt: loggedAt,
    ...zone,
    lat: 0,
    lon: 0,
    accuracyM: 5,
    altitudeM: null,
    altitudeAccuracyM: null,
    label,
    frame: null,
    tripId: tripId as TripId | null,
    source: 'gps',
    createdAt: loggedAt,
    updatedAt: loggedAt,
  };
}

function summarise(groups: ReturnType<typeof groupByDayAndTrip>) {
  return groups.map((day) => ({
    day: day.day,
    trips: day.trips.map((group) => ({
      trip: group.trip?.name ?? null,
      entries: group.entries.map((item) => item.label),
    })),
  }));
}

describe('groupByDayAndTrip', () => {
  const coromandel = trip('t1', 'Coromandel');
  const trips = new Map([[coromandel.id, coromandel]]);

  it('groups by local day and trip, newest first throughout', () => {
    const entries = [
      entry('a', '2026-10-13T22:00:00Z', 't1'), // 11:00 on 14 Oct NZDT
      entry('b', '2026-10-14T02:00:00Z'), // 15:00 on 14 Oct
      entry('c', '2026-10-14T04:00:00Z', 't1'), // 17:00 on 14 Oct
      entry('d', '2026-10-14T12:00:00Z', 't1'), // 01:00 on 15 Oct
    ];

    expect(summarise(groupByDayAndTrip(entries, trips))).toEqual([
      { day: '2026-10-15', trips: [{ trip: 'Coromandel', entries: ['d'] }] },
      {
        day: '2026-10-14',
        trips: [
          { trip: 'Coromandel', entries: ['c', 'a'] },
          { trip: null, entries: ['b'] },
        ],
      },
    ]);
  });

  it('uses the day where each entry was logged when travelling', () => {
    // Both are 23:30 local time on 14 October, in different zones.
    const entries = [
      entry('auckland', '2026-10-14T10:30:00Z', null, nz),
      entry('london', '2026-10-14T22:30:00Z', null, london),
    ];
    expect(summarise(groupByDayAndTrip(entries, trips))).toEqual([
      { day: '2026-10-14', trips: [{ trip: null, entries: ['london', 'auckland'] }] },
    ]);
  });

  it('treats a missing trip as no trip', () => {
    const entries = [entry('orphan', '2026-10-14T01:00:00Z', 'deleted')];
    expect(groupByDayAndTrip(entries, trips)[0]?.trips[0]?.trip).toBeNull();
  });

  it('returns nothing for no entries', () => {
    expect(groupByDayAndTrip([], trips)).toEqual([]);
  });
});
