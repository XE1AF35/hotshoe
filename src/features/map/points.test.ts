import { describe, expect, it } from 'vitest';
import type { Entry, EntryId, TripId } from '../../db/schema.ts';
import { entryPoints } from './points.ts';

const waiheke = 'trip-waiheke' as TripId;

function entry(id: string, lat: number, lon: number, tripId: TripId | null): Entry {
  return {
    id: id as EntryId,
    lat,
    lon,
    tripId,
    loggedAt: 0,
    fixAt: 0,
    timeZone: 'Pacific/Auckland',
    utcOffsetMin: 780,
    accuracyM: 5,
    altitudeM: null,
    altitudeAccuracyM: null,
    label: null,
    frame: null,
    source: 'gps',
    createdAt: 0,
    updatedAt: 0,
  };
}

const entries = [
  entry('a', -36.8, 175.0, waiheke),
  entry('b', -36.9, 175.1, waiheke),
  entry('c', -41.3, 174.8, null),
];

describe('entryPoints', () => {
  it('puts every entry on the map, longitude first, and finds the area they cover', () => {
    const { collection, bounds } = entryPoints(entries, 'all');
    expect(collection.features).toHaveLength(3);
    expect(collection.features[0]).toEqual({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [175.0, -36.8] },
      properties: { id: 'a' },
    });
    expect(bounds).toEqual([174.8, -41.3, 175.1, -36.8]);
  });

  it("shows only one trip's entries when filtered", () => {
    const { collection, bounds } = entryPoints(entries, waiheke);
    expect(collection.features.map((feature) => feature.properties.id)).toEqual(['a', 'b']);
    expect(bounds).toEqual([175.0, -36.9, 175.1, -36.8]);
  });

  it('has no area when there is nothing to show', () => {
    expect(entryPoints([], 'all').bounds).toBeNull();
  });
});
