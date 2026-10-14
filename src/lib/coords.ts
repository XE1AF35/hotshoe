export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

export type CoordFormat = 'decimal' | 'dms';

/** Six decimal places is about 0.1 m, finer than any phone GPS fix. */
const decimalPlaces = 6;

/** Tenths of a second of arc is about 3 m. */
const dmsSecondDecimals = 1;

export function isValidLatLon({ lat, lon }: LatLon): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}

/** `-36.848461, 174.763336`: latitude first, the order photo sites and most map apps expect. */
export function formatDecimal({ lat, lon }: LatLon): string {
  return `${fixedWithoutNegativeZero(lat, decimalPlaces)}, ${fixedWithoutNegativeZero(lon, decimalPlaces)}`;
}

/** `36°50'54.5"S, 174°45'48.0"E` */
export function formatDms({ lat, lon }: LatLon): string {
  return `${dmsPart(lat, 'N', 'S')}, ${dmsPart(lon, 'E', 'W')}`;
}

export function formatCoords(coords: LatLon, format: CoordFormat): string {
  return format === 'dms' ? formatDms(coords) : formatDecimal(coords);
}

function fixedWithoutNegativeZero(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}

function dmsPart(value: number, positive: string, negative: string): string {
  // Work in whole tenths of a second so rounding carries cleanly into minutes and degrees.
  const scale = 10 ** dmsSecondDecimals;
  const totalTenths = Math.round(Math.abs(value) * 3600 * scale);
  const degrees = Math.floor(totalTenths / (3600 * scale));
  const minutes = Math.floor((totalTenths % (3600 * scale)) / (60 * scale));
  const seconds = (totalTenths % (60 * scale)) / scale;
  const hemisphere = value < 0 && totalTenths > 0 ? negative : positive;

  const mm = String(minutes).padStart(2, '0');
  const ss = seconds.toFixed(dmsSecondDecimals).padStart(3 + dmsSecondDecimals, '0');
  return `${degrees}°${mm}'${ss}"${hemisphere}`;
}
