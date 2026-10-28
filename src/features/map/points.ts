import type { FeatureCollection, Point } from 'geojson';
import type { Entry, EntryId, TripId } from '../../db/schema.ts';
import { type Trail, trailLine } from './trail.ts';

/** Every entry, or one trip's. */
export type TripFilter = 'all' | TripId;

/** What the map draws for an entry. Only the id travels with the point; the card looks up the rest. */
export interface PointProperties {
  readonly id: EntryId;
}

export interface Points {
  readonly collection: FeatureCollection<Point, PointProperties>;
  /** West, south, east, north, or null when there is nothing to show. */
  readonly bounds: readonly [number, number, number, number] | null;
  /** The shown entries joined in time order, or null with fewer than two. */
  readonly trail: Trail | null;
}

export function entryPoints(entries: readonly Entry[], filter: TripFilter): Points {
  const shown = filter === 'all' ? entries : entries.filter((entry) => entry.tripId === filter);
  let bounds: [number, number, number, number] | null = null;
  for (const { lon, lat } of shown) {
    bounds = bounds
      ? [
          Math.min(bounds[0], lon),
          Math.min(bounds[1], lat),
          Math.max(bounds[2], lon),
          Math.max(bounds[3], lat),
        ]
      : [lon, lat, lon, lat];
  }
  return {
    collection: {
      type: 'FeatureCollection',
      features: shown.map((entry) => ({
        type: 'Feature',
        // Longitude first, as GeoJSON requires.
        geometry: { type: 'Point', coordinates: [entry.lon, entry.lat] },
        properties: { id: entry.id },
      })),
    },
    bounds,
    trail: trailLine(shown),
  };
}
