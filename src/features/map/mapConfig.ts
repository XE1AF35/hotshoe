/**
 * The one place that names the map provider, so moving off OpenFreeMap is a change here (plus the
 * host in the Content Security Policy and the service worker's tile cache in vite.config.ts).
 *
 * OpenFreeMap needs no key or account and sets no cookies. Its styles carry the OpenStreetMap
 * attribution that MapLibre shows on the map.
 */
export const mapTileHost = 'https://tiles.openfreemap.org';

export function mapStyleUrl(dark: boolean): string {
  return `${mapTileHost}/styles/${dark ? 'dark' : 'liberty'}`;
}
