import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useDetail } from '../../app/router.ts';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { useEntries, useTrips } from '../../db/hooks.ts';
import { useSettings } from '../../db/SettingsProvider.tsx';
import type { EntryId } from '../../db/schema.ts';
import { coordStyleOf } from '../../db/settings.ts';
import { MapEntryCard } from './MapEntryCard.tsx';
import type { MapFocus } from './MapView.tsx';
import { MapErrorBoundary, MapGate, useMapLoad } from './mapLoading.tsx';
import { entryPoints, type TripFilter } from './points.ts';

const MapView = lazy(() => import('./MapView.tsx'));

export function MapScreen() {
  const entries = useEntries();
  const trips = useTrips();
  const settings = useSettings();
  const detail = useDetail();
  const filterId = useId();
  const [filter, setFilter] = useState<TripFilter>('all');
  const [selectedId, setSelectedId] = useState<EntryId | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const { showMap, load } = useMapLoad();

  const points = useMemo(() => entryPoints(entries ?? [], filter), [entries, filter]);
  const selected = entries?.find((entry) => entry.id === selectedId) ?? null;

  // "Show on map" from an entry opens #/map/<entry id>: select it and fly there.
  // Each link is handled once, so later edits to the entry don't move the map back to it.
  const handledDetail = useRef<string | null>(null);
  useEffect(() => {
    if (detail === null) {
      handledDetail.current = null;
      return;
    }
    const entry = entries?.find((candidate) => candidate.id === detail);
    if (!entry || handledDetail.current === detail) return;
    handledDetail.current = detail;
    setFilter('all');
    setSelectedId(entry.id);
    setFocus((previous) => ({ key: (previous?.key ?? 0) + 1, lon: entry.lon, lat: entry.lat }));
  }, [detail, entries]);

  // A trip that has been deleted can't be filtered on.
  useEffect(() => {
    if (filter !== 'all' && trips !== undefined && !trips.some((trip) => trip.id === filter)) {
      setFilter('all');
    }
  }, [filter, trips]);

  return (
    <section aria-labelledby="screen-title" className="flex flex-1 flex-col gap-4">
      <ScreenHeader title="Map">
        {trips !== undefined && trips.length > 0 && (
          <div className="min-w-0">
            <label htmlFor={filterId} className="sr-only">
              Trip to show
            </label>
            <select
              id={filterId}
              value={filter}
              onChange={(event) => {
                setSelectedId(null);
                setFilter(event.target.value as TripFilter);
              }}
              className="min-h-11 max-w-full truncate rounded-full border border-line bg-raised px-4 text-sm"
            >
              <option value="all">All trips</option>
              {trips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </ScreenHeader>

      {entries !== undefined && entries.length === 0 ? (
        <p className="text-muted">Nothing logged yet. Entries you log appear here on a map.</p>
      ) : (
        <div className="relative min-h-80 flex-1 overflow-hidden rounded-3xl bg-raised shadow-sm ring-1 ring-line">
          {settings !== undefined && entries !== undefined && !showMap && (
            <MapGate
              heading={`${entryCount(points.collection.features.length)} to show`}
              centred={selected === null}
              onLoad={load}
            />
          )}
          {showMap && entries !== undefined && (
            <>
              <p role="status" className="sr-only">
                {entryCount(points.collection.features.length)} on the map
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
                    fitKey={filter}
                    selectedId={selectedId}
                    focus={focus}
                    onSelect={setSelectedId}
                  />
                </Suspense>
              </MapErrorBoundary>
            </>
          )}
          {selected && (
            <MapEntryCard
              entry={selected}
              coordStyle={coordStyleOf(settings)}
              accuracyTargetM={settings.accuracyTargetM}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
    </section>
  );
}

function entryCount(shown: number): string {
  return `${shown} ${shown === 1 ? 'entry' : 'entries'}`;
}
