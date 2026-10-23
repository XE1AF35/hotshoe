export interface LatLon {
  readonly lat: number;
  readonly lon: number;
}

export type CoordFormat = 'decimal' | 'dms';

/**
 * The decimal mark for coordinates shown and copied. Apps that follow a comma-decimal region
 * setting, such as digiKam's coordinate fields in much of Europe, want `-36,848461`. Exported
 * files always use a point, as their formats require.
 */
export type DecimalMark = 'point' | 'comma';

/** How coordinates are shown and copied, from the person's settings. */
export interface CoordStyle {
  readonly format: CoordFormat;
  readonly decimalMark: DecimalMark;
}

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

/** One coordinate to six decimal places, as exports write it: `-36.848461`. */
export function formatDegrees(value: number): string {
  return fixedWithoutNegativeZero(value, decimalPlaces);
}

/**
 * Latitude then longitude as one line, ready to paste. With a decimal comma the two are split by
 * a semicolon, so the commas inside each number can't be misread: `-36,848461; 174,763336`.
 */
export function formatCoords(coords: LatLon, style: CoordStyle): string {
  return formatCoordParts(coords, style).join(style.decimalMark === 'comma' ? '; ' : ', ');
}

/** Latitude and longitude apart, in the same form as formatCoords, for showing on two lines. */
export function formatCoordParts(
  { lat, lon }: LatLon,
  style: CoordStyle,
): readonly [lat: string, lon: string] {
  const parts: [string, string] =
    style.format === 'dms'
      ? [dmsPart(lat, 'N', 'S'), dmsPart(lon, 'E', 'W')]
      : [
          fixedWithoutNegativeZero(lat, decimalPlaces),
          fixedWithoutNegativeZero(lon, decimalPlaces),
        ];
  return style.decimalMark === 'comma'
    ? [parts[0].replace('.', ','), parts[1].replace('.', ',')]
    : parts;
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
