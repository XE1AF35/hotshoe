import { describe, expect, it } from 'vitest';
import type { Entry, EntryId, TripId } from '../../db/schema.ts';
import { trailLine } from './trail.ts';

function entry(
  id: string,
  lon: number,
  loggedAt: number,
  { createdAt = 0, tripId = null }: { createdAt?: number; tripId?: TripId | null } = {},
): Entry {
  return {
    id: id as EntryId,
    lat: -36.8,
    lon,
    tripId,
    loggedAt,
    fixAt: loggedAt,
    timeZone: 'Pacific/Auckland',
    utcOffsetMin: 780,
    accuracyM: 5,
    altitudeM: null,
    altitudeAccuracyM: null,
    label: null,
    frame: null,
    origin: 'logged',
    createdAt,
    updatedAt: createdAt,
  };
}

const lons = (entries: readonly Entry[]) =>
  trailLine(entries)?.geometry.coordinates.map(([lon]) => lon);

describe('trailLine', () => {
  it('joins the entries in the order they were logged, longitude first', () => {
    expect(trailLine([entry('b', 175.2, 2000), entry('a', 175.1, 1000)])).toEqual({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [175.1, -36.8],
          [175.2, -36.8],
        ],
      },
      properties: {},
    });
  });

  it('orders entries logged at the same moment by when they were made, then by id', () => {
    expect(
      lons([
        entry('d', 175.4, 1000, { createdAt: 9 }),
        entry('c', 175.3, 1000, { createdAt: 5 }),
        entry('b', 175.2, 1000, { createdAt: 5 }),
        entry('a', 175.1, 500, { createdAt: 9 }),
      ]),
    ).toEqual([175.1, 175.2, 175.3, 175.4]);
  });

  it('has nothing to join with fewer than two entries', () => {
    expect(trailLine([])).toBeNull();
    expect(trailLine([entry('a', 175.1, 1000)])).toBeNull();
  });
});
