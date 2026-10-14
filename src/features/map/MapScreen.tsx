import {
  Component,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MapIcon } from '../../app/icons.tsx';
import { useDetail } from '../../app/router.ts';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { useEntries, useSettings, useTrips } from '../../db/hooks.ts';
import type { EntryId } from '../../db/schema.ts';
import { defaultSettings, setSetting } from '../../db/settings.ts';
import { MapEntryCard } from './MapEntryCard.tsx';
import type { MapFocus } from './MapView.tsx';
import { entryPoints, type TripFilter } from './points.ts';

const MapView = lazy(() => import('./MapView.tsx'));

/**
 * Once the map has been loaded it stays loaded until Hotshoe is closed, so moving between tabs
 * doesn't ask again.
 */
let loadedThisVisit = false;

export function MapScreen() {
  const db = useDb();
  const entries = useEntries();
  const trips = useTrips();
  const settings = useSettings();
  const detail = useDetail();
  const filterId = useId();
  const [filter, setFilter] = useState<TripFilter>('all');
  const [selectedId, setSelectedId] = useState<EntryId | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [loadRequested, setLoadRequested] = useState(loadedThisVisit);
  const showMap = loadRequested || settings?.mapLoadsAutomatically === true;

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
              shown={points.collection.features.length}
              centred={selected === null}
              onLoad={(always) => {
                loadedThisVisit = true;
                setLoadRequested(true);
                if (always) void setSetting(db, 'mapLoadsAutomatically', true);
              }}
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
              coordFormat={settings?.coordFormat ?? defaultSettings.coordFormat}
              accuracyTargetM={settings?.accuracyTargetM ?? defaultSettings.accuracyTargetM}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Asks before loading the map, because loading it shows OpenFreeMap the area on screen. The
 * map's code isn't even fetched until then.
 */
function MapGate({
  shown,
  centred,
  onLoad,
}: {
  readonly shown: number;
  /** Centred when there is room; at the top when an entry card fills the bottom. */
  readonly centred: boolean;
  readonly onLoad: (always: boolean) => void;
}) {
  const alwaysId = useId();
  const [always, setAlways] = useState(false);
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center gap-3 p-6 text-center ${
        centred ? 'justify-center' : 'justify-start'
      }`}
    >
      <MapIcon className="size-10 text-muted" />
      <p className="font-semibold">{entryCount(shown)} to show</p>
      <p className="max-w-xs text-muted text-sm">
        The map comes from OpenFreeMap. Loading it shows OpenFreeMap the area you're looking at and
        your internet address, but never your entries.
      </p>
      <button
        type="button"
        onClick={() => onLoad(always)}
        className="min-h-12 rounded-xl bg-accent px-8 font-semibold text-on-accent"
      >
        Load map
      </button>
      <label htmlFor={alwaysId} className="flex min-h-11 items-center gap-2 text-sm">
        <input
          id={alwaysId}
          type="checkbox"
          checked={always}
          onChange={(event) => setAlways(event.target.checked)}
          className="size-5 accent-accent-ink"
        />
        Always load without asking
      </label>
    </div>
  );
}

function entryCount(shown: number): string {
  return `${shown} ${shown === 1 ? 'entry' : 'entries'}`;
}

/** If the map's code can't load, say so here rather than losing the whole app. */
class MapErrorBoundary extends Component<{ readonly children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p
        role="alert"
        className="absolute inset-x-3 top-3 rounded-2xl bg-warning p-3 text-on-warning text-sm"
      >
        The map couldn't load. Close Hotshoe and open it again to retry.
      </p>
    );
  }
}
