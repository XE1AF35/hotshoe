import { lazy, Suspense, useMemo } from 'react';
import type { EntryId } from '../../db/schema.ts';
import { formatCount, formatDay } from '../../lib/format.ts';
import { MapErrorBoundary, MapGate, useMapLoad } from '../map/mapLoading.tsx';
import { entryPoints } from '../map/points.ts';
import type { DayGroup } from './grouping.ts';

// The same chunk as the Map tab's map, fetched only once a map is loaded.
const MapView = lazy(() => import('../map/MapView.tsx'));

/**
 * A map of one Day's entries from every trip, half the visible screen tall. One finger scrolls
 * the page over it, so the list never gets stuck. Taken down completely when it closes.
 */
export function DayMap({
  id,
  day,
  onOpenEntry,
}: {
  readonly id: string;
  readonly day: DayGroup;
  readonly onOpenEntry: (id: EntryId) => void;
}) {
  const { showMap, load } = useMapLoad();
  const points = useMemo(
    () =>
      entryPoints(
        day.trips.flatMap((group) => group.entries),
        'all',
      ),
    [day],
  );
  const shown = formatCount(points.collection.features.length, 'entry', 'entries');

  return (
    <section
      id={id}
      aria-label={`Map of ${formatDay(day.day)}`}
      className="relative h-[50dvh] overflow-hidden rounded-3xl bg-raised shadow-sm ring-1 ring-line"
    >
      {showMap ? (
        <>
          <p role="status" className="sr-only">
            {shown} on the map
          </p>
          <MapErrorBoundary>
            <Suspense
              fallback={
                <p className="absolute inset-0 flex items-center justify-center text-muted">
                  Loading map…
                </p>
              }
            >
              <MapView
                points={points}
                fitKey={day.day}
                selectedId={null}
                focus={null}
                onSelect={(entryId) => {
                  if (entryId !== null) onOpenEntry(entryId);
                }}
                cooperativeGestures
              />
            </Suspense>
          </MapErrorBoundary>
        </>
      ) : (
        <MapGate heading={`${shown} to show`} centred onLoad={load} />
      )}
    </section>
  );
}
