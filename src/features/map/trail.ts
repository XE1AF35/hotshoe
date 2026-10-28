import type { Feature, LineString } from 'geojson';
import type { Entry } from '../../db/schema.ts';

export type Trail = Feature<LineString, Record<string, never>>;

/**
 * A line joining the entries a map is showing, in the order they were logged. Entries logged at
 * the same moment go by when they were made, then by id, so the line never changes on its own.
 */
export function trailLine(entries: readonly Entry[]): Trail | null {
  if (entries.length < 2) return null;
  const ordered = [...entries].sort(
    (a, b) =>
      a.loggedAt - b.loggedAt ||
      a.createdAt - b.createdAt ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return {
    type: 'Feature',
    // Longitude first, as GeoJSON requires.
    geometry: { type: 'LineString', coordinates: ordered.map((entry) => [entry.lon, entry.lat]) },
    properties: {},
  };
}
