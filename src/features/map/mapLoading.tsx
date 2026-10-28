import { Component, type ReactNode, useId, useState } from 'react';
import { MapIcon } from '../../app/icons.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import type { HotshoeDb } from '../../db/database.ts';
import { useSettings } from '../../db/SettingsProvider.tsx';
import { setSetting } from '../../db/settings.ts';

/**
 * Once the map has been loaded anywhere it stays loaded until Hotshoe is closed, so moving
 * between tabs or placing another photo doesn't ask again. Kept per database, which lives
 * exactly as long as the visit.
 */
const loadedThisVisit = new WeakSet<HotshoeDb>();

/** Whether the map may load yet, and how to let it when the person asks. */
export function useMapLoad(): {
  readonly showMap: boolean;
  readonly load: (always: boolean) => void;
} {
  const db = useDb();
  const settings = useSettings();
  const [loadRequested, setLoadRequested] = useState(() => loadedThisVisit.has(db));
  return {
    showMap: loadRequested || settings.mapLoadsAutomatically,
    load(always) {
      loadedThisVisit.add(db);
      setLoadRequested(true);
      if (always) void setSetting(db, 'mapLoadsAutomatically', true);
    },
  };
}

/**
 * Asks before loading the map, because loading it shows OpenFreeMap the area on screen. The
 * map's code isn't even fetched until then.
 */
export function MapGate({
  heading,
  centred,
  onLoad,
}: {
  readonly heading: string;
  /** Centred when there is room; at the top when something fills the bottom. */
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
      <p className="font-semibold">{heading}</p>
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

/** If the map's code can't load, say so here rather than losing the whole app. */
export class MapErrorBoundary extends Component<
  { readonly children: ReactNode },
  { failed: boolean }
> {
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
