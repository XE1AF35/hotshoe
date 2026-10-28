// Loaded only when a photo is placed on the map: MapLibre is far larger than the rest of the app.
import { type Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import type { LatLon } from '../../lib/coords.ts';
import { createMap, token, wholeWorld } from './mapSetup.ts';

/** Close enough to see the street, as for an entry shown on the map. */
const placeZoom = 15;

/**
 * A map to drop one pin on: a tap drops it or moves it there, and it can be dragged. Opens on
 * the pin when there is one, otherwise on the centre given, otherwise on the whole world.
 */
export default function PinMap({
  center,
  pin,
  onPin,
}: {
  readonly center: LatLon | null;
  readonly pin: LatLon | null;
  readonly onPin: (pin: LatLon) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Read by the map's handlers, so the map is made only once.
  const latest = useRef({ center, pin, onPin });
  latest.current = { center, pin, onPin };

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    const start = latest.current.pin ?? latest.current.center;
    const made = createMap(
      element,
      start ? { center: [start.lon, start.lat], zoom: placeZoom } : wholeWorld,
      setProblem,
    );
    if (!made) return;
    const { map } = made;
    mapRef.current = map;
    map.on('click', ({ lngLat }) => latest.current.onPin({ lat: lngLat.lat, lon: lngLat.lng }));

    return () => {
      made.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pin) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([pin.lon, pin.lat]);
      return;
    }
    const marker = new Marker({ draggable: true, color: token('accent') });
    marker.getElement().setAttribute('aria-label', 'Pin');
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLngLat();
      latest.current.onPin({ lat, lon: lng });
    });
    marker.setLngLat([pin.lon, pin.lat]).addTo(map);
    markerRef.current = marker;
  }, [pin]);

  return (
    <>
      {/* MapLibre makes its container position: relative, so it sits inside the filling box. */}
      <div className="absolute inset-0">
        <div ref={container} className="size-full" />
      </div>
      {problem && (
        <p
          role="alert"
          className="absolute inset-x-3 top-3 rounded-2xl bg-warning p-3 text-on-warning text-sm"
        >
          {problem}
        </p>
      )}
    </>
  );
}
