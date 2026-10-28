import type { NewEntry } from '../../db/entries.ts';
import type { TripId } from '../../db/schema.ts';
import { isValidLatLon, type LatLon } from '../../lib/coords.ts';
import { contextForOffset, type TimeContext } from '../../lib/time.ts';
import { type ExifTags, readExif } from './exif.ts';

/** What a photo's metadata says about the Entry it could become, before anything is saved. */
export interface PhotoDraft {
  readonly file: File;
  readonly time: DraftTime;
  /** Null when the photo has no usable GPS position. */
  readonly location: DraftLocation | null;
}

export interface DraftLocation extends LatLon {
  /** From the GPS error figure; null when the photo has none. */
  readonly accuracyM: number | null;
  /** Metres above sea level, negative below it. */
  readonly altitudeM: number | null;
  /** Epoch ms UTC of the GPS reading, when the photo records it. */
  readonly gpsAt: number | null;
}

export type DraftTime =
  | {
      /** The shot time with its UTC offset. */
      readonly source: 'exact';
      /** Epoch ms UTC. */
      readonly at: number;
      readonly context: TimeContext;
    }
  | { readonly source: 'missing' };

/** EXIF sits at the start of a JPEG, so a 48 MP photo never needs reading whole. */
const headBytes = 256 * 1024;

/**
 * Reads a photo's time and location from its metadata. `deviceZone` is the iPhone's current
 * zone, used for the time context when its offset matches the photo's.
 */
export async function readPhotoDraft(file: File, deviceZone: string): Promise<PhotoDraft> {
  const tags = readExif(await readHead(file));
  return { file, time: readTime(tags, deviceZone), location: readLocation(tags) };
}

/** Whether a draft has the time and location an Entry needs. */
export function isComplete(draft: PhotoDraft): boolean {
  return draft.time.source !== 'missing' && draft.location !== null;
}

/**
 * The Entry a draft becomes, or null while it is missing its time or location. The Fix is timed
 * by the photo's GPS clock when it has one, otherwise at the shot.
 */
export function newEntryFromDraft(draft: PhotoDraft, tripId: TripId | null): NewEntry | null {
  const { time, location } = draft;
  if (time.source === 'missing' || location === null) return null;
  return {
    loggedAt: time.at,
    fixAt: location.gpsAt ?? time.at,
    ...time.context,
    lat: location.lat,
    lon: location.lon,
    accuracyM: location.accuracyM,
    altitudeM: location.altitudeM,
    altitudeAccuracyM: null,
    origin: 'photo',
    tripId,
  };
}

/** The start of the file, or nothing when it can't be read, such as a photo since deleted. */
async function readHead(file: File): Promise<ArrayBuffer> {
  try {
    return await file.slice(0, headBytes).arrayBuffer();
  } catch {
    return new ArrayBuffer(0);
  }
}

function readTime(tags: ExifTags, deviceZone: string): DraftTime {
  const local = parseExifDateTime(tags.dateTimeOriginal);
  const offsetMin = parseOffset(tags.offsetTimeOriginal);
  if (local === null || offsetMin === null) return { source: 'missing' };

  const at = local + subSecondMs(tags.subSecTimeOriginal) - offsetMin * 60_000;
  return { source: 'exact', at, context: contextForOffset(at, offsetMin, deviceZone) };
}

function readLocation(tags: ExifTags): DraftLocation | null {
  const lat = degrees(tags.gpsLatitude, tags.gpsLatitudeRef === 'S');
  const lon = degrees(tags.gpsLongitude, tags.gpsLongitudeRef === 'W');
  if (lat === null || lon === null || !isValidLatLon({ lat, lon })) return null;

  const error = tags.gpsHPositioningError;
  const altitude = tags.gpsAltitude;
  return {
    lat,
    lon,
    accuracyM: error !== undefined && Number.isFinite(error) && error >= 0 ? error : null,
    altitudeM:
      altitude !== undefined && Number.isFinite(altitude)
        ? tags.gpsAltitudeRef === 1
          ? -altitude
          : altitude
        : null,
    gpsAt: gpsTime(tags.gpsDateStamp, tags.gpsTimeStamp),
  };
}

/** Degrees, minutes, and seconds as signed decimal degrees. */
function degrees(dms: readonly number[] | undefined, negative: boolean): number | null {
  const [d, m = 0, s = 0] = dms ?? [];
  if (d === undefined) return null;
  const value = d + m / 60 + s / 3600;
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** The GPS date and UTC time together, or null when either is missing. */
function gpsTime(date: string | undefined, time: readonly number[] | undefined): number | null {
  const day = parseExifDateTime(`${date ?? ''} 00:00:00`);
  const [hours, minutes, seconds] = time ?? [];
  if (day === null || hours === undefined || minutes === undefined || seconds === undefined) {
    return null;
  }
  const at = day + Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
  return Number.isFinite(at) ? at : null;
}

/** `2026:10:14 10:35:12` as if it were UTC, or null when blank or malformed. */
function parseExifDateTime(text: string | undefined): number | null {
  const match = text?.trim().match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const at = Date.UTC(year, month - 1, day, hour, minute, second);
  return Number.isNaN(at) || month < 1 || month > 12 || day < 1 ? null : at;
}

/** `+07:00` as minutes ahead of UTC, or null. */
function parseOffset(text: string | undefined): number | null {
  const match = text?.trim().match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/** `25` is a quarter of a second. */
function subSecondMs(text: string | undefined): number {
  const digits = text?.trim();
  if (!digits || !/^\d+$/.test(digits)) return 0;
  return Math.round(Number(`0.${digits}`) * 1000);
}
