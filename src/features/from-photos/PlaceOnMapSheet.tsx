import { lazy, Suspense, useState } from 'react';
import { Sheet } from '../../app/Sheet.tsx';
import { type CoordStyle, formatCoords, type LatLon } from '../../lib/coords.ts';
import { MapErrorBoundary, MapGate, useMapLoad } from '../map/mapLoading.tsx';

const PinMap = lazy(() => import('../map/PinMap.tsx'));

/**
 * Drops a pin where one photo was taken. Nothing changes until Place here, so closing the sheet
 * leaves the photo as it was.
 */
export function PlaceOnMapSheet({
  fileName,
  center,
  initialPin,
  coordStyle,
  onPlace,
  onClose,
}: {
  readonly fileName: string;
  /** Where the map opens when there is no pin yet; the whole world when null. */
  readonly center: LatLon | null;
  readonly initialPin: LatLon | null;
  readonly coordStyle: CoordStyle;
  readonly onPlace: (pin: LatLon) => void;
  readonly onClose: () => void;
}) {
  const { showMap, load } = useMapLoad();
  const [pin, setPin] = useState(initialPin);

  return (
    <Sheet open onClose={onClose} title="Place on map">
      <p className="text-muted text-sm">
        Tap the map where you took <span className="break-all">{fileName}</span>. Drag the pin to
        move it.
      </p>
      <div className="relative h-[55dvh] min-h-80 overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
        {showMap ? (
          <MapErrorBoundary>
            <Suspense
              fallback={
                <p className="absolute inset-0 flex items-center justify-center text-muted">
                  Loading map…
                </p>
              }
            >
              <PinMap center={center} pin={pin} onPin={setPin} />
            </Suspense>
          </MapErrorBoundary>
        ) : (
          <MapGate heading="Load the map to drop a pin" centred onLoad={load} />
        )}
      </div>
      <p role="status" className="text-sm">
        {pin ? `Pin at ${formatCoords(pin, coordStyle)}` : 'No pin yet'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 rounded-xl border border-line font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => pin && onPlace(pin)}
          disabled={pin === null}
          className="min-h-12 rounded-xl bg-accent px-3 font-semibold text-on-accent disabled:opacity-50"
        >
          Place here
        </button>
      </div>
    </Sheet>
  );
}
