import { isValidLatLon, type LatLon } from './coords.ts';

export type ParsedCoords =
  | { readonly ok: true; readonly coords: LatLon }
  | { readonly ok: false; readonly problem: string };

const decimalPattern = /^[+-]?\d+(?:\.\d+)?$/;
const dmsPattern = /^(\d+)°(\d+)['′](\d+(?:\.\d+)?)["″]([NSEW])$/;

/**
 * Coordinates pasted by hand, latitude first, in any form formatCoords copies: decimal or
 * degrees-minutes-seconds, with a decimal point or comma. Also takes a space between the two.
 */
export function parseCoords(text: string): ParsedCoords {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, problem: 'Paste coordinates, such as -36.848461, 174.763336.' };
  }
  const parts = splitPair(trimmed);
  const lat = parts && parseOne(parts[0], 'N', 'S');
  const lon = parts && parseOne(parts[1], 'E', 'W');
  if (lat == null || lon == null) {
    return {
      ok: false,
      problem: "Hotshoe can't read those coordinates. Paste them like -36.848461, 174.763336.",
    };
  }
  const coords = { lat, lon };
  if (!isValidLatLon(coords)) {
    return {
      ok: false,
      problem: 'Latitude must be between -90 and 90, and longitude between -180 and 180.',
    };
  }
  return { ok: true, coords };
}

/** A semicolon goes with a decimal comma; otherwise a comma, then a space, splits the pair. */
function splitPair(text: string): readonly [string, string] | null {
  let parts = text.split(';');
  if (parts.length === 1) parts = text.split(',');
  if (parts.length !== 2 && !text.includes(';')) parts = text.split(/\s+/);
  return parts.length === 2 ? (parts as [string, string]) : null;
}

/** Signed degrees from `-36.848461` or `36°50'54.5"S`, or null when unreadable. */
function parseOne(part: string, positive: string, negative: string): number | null {
  const text = part.replace(/\s+/g, '').replace(',', '.').toUpperCase();
  if (decimalPattern.test(text)) return Number(text);
  const match = text.match(dmsPattern);
  if (!match) return null;
  const [, d, m, s, hemisphere] = match as unknown as [string, string, string, string, string];
  const minutes = Number(m);
  const seconds = Number(s);
  if (minutes >= 60 || seconds >= 60) return null;
  if (hemisphere !== positive && hemisphere !== negative) return null;
  const value = Number(d) + minutes / 60 + seconds / 3600;
  return hemisphere === negative ? -value : value;
}
