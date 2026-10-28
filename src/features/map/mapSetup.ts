// Loaded only with a map: MapLibre is far larger than the rest of the app.
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AttributionControl,
  type LngLatBoundsLike,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { currentTheme, onThemeChange } from '../../lib/theme.ts';
import { mapStyleUrl } from './mapConfig.ts';

// MapLibre looks for its worker beside its own file, which bundling moves. This points it at the
// copy Vite emits, served from this origin so the Content Security Policy allows it.
setWorkerUrl(workerUrl);

export type MapStart =
  | { readonly center: [number, number]; readonly zoom: number }
  | { readonly bounds: LngLatBoundsLike; readonly fitBoundsOptions: object };

/** The whole world, for a map with nothing to show yet. */
export const wholeWorld: MapStart = { center: [0, 20], zoom: 1 };

/**
 * Makes a map in the app's style, with zoom buttons and the OpenStreetMap credit, following
 * light and dark mode. Reports a problem when the map can't be shown, and null once it can.
 * Returns how to take it down, or null when this device can't make a map at all.
 */
export function createMap(
  element: HTMLElement,
  start: MapStart,
  onProblem: (problem: string | null) => void,
): { readonly map: MapLibreMap; readonly remove: () => void } | null {
  let map: MapLibreMap;
  try {
    map = new MapLibreMap({
      container: element,
      style: mapStyleUrl(currentTheme() === 'dark'),
      ...start,
      attributionControl: false,
      maxZoom: 18,
    });
  } catch {
    onProblem("The map can't be shown on this device.");
    return null;
  }
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  // Top left, so a card at the bottom never covers the OpenStreetMap credit. It starts open and
  // folds into a button once the map is moved.
  map.addControl(new AttributionControl({ compact: true }), 'top-left');

  let styleLoaded = false;
  // Runs on the first load and after every style change.
  map.on('style.load', () => {
    styleLoaded = true;
    onProblem(null);
  });
  map.on('error', () => {
    // Missing tiles are expected offline; only a style that never loaded leaves a blank map.
    if (!styleLoaded) {
      onProblem(
        "The map couldn't load. It needs an internet connection to show an area for the first time.",
      );
    }
  });

  const stopFollowingTheme = onThemeChange((theme) =>
    map.setStyle(mapStyleUrl(theme === 'dark'), { diff: false }),
  );

  return {
    map,
    remove() {
      stopFollowingTheme();
      map.remove();
    },
  };
}

/** The app's colour tokens, read from the stylesheet so the map matches light and dark mode. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}
