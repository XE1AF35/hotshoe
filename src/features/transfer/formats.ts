/**
 * CSV, GeoJSON, and GPX exports, as pure functions of the entries so each format can be checked
 * against a golden file. Every format uses the time the button was tapped (`loggedAt`), lists
 * entries oldest first, and rounds coordinates to six decimal places.
 */

import type { CameraClock, Entry, PhotoId, TripId } from '../../db/schema.ts';
import { formatDegrees } from '../../lib/coords.ts';
import { formatLocalIso, formatUtcIso, formatUtcOffset, localDayKey } from '../../lib/time.ts';
import { toCameraTime } from '../trips/cameraClock.ts';

/** The formats in the order they are offered, GPX first as it is what Hotshoe is for. */
export const exportFormats = [
  {
    value: 'gpx',
    title: 'GPX',
    detail: 'For geotagging in Lightroom, darktable, or digiKam.',
    extension: 'gpx',
    mimeType: 'application/gpx+xml',
  },
  {
    value: 'csv',
    title: 'CSV',
    detail: 'For spreadsheets.',
    extension: 'csv',
    mimeType: 'text/csv',
  },
  {
    value: 'geojson',
    title: 'GeoJSON',
    detail: 'For maps and GIS apps.',
    extension: 'geojson',
    mimeType: 'application/geo+json',
  },
] as const;

export type ExportFormat = (typeof exportFormats)[number]['value'];

export function formatDetails(format: ExportFormat): (typeof exportFormats)[number] {
  const details = exportFormats.find(({ value }) => value === format);
  if (!details) throw new Error(`Unknown export format: ${format}`);
  return details;
}

/** An entry with the details exports need from other tables. */
export interface ExportRow {
  readonly entry: Entry;
  /** null when the entry has no trip. Names can repeat, so tracks are told apart by id. */
  readonly trip: { readonly id: TripId; readonly name: string } | null;
  readonly photoIds: readonly PhotoId[];
}

export interface ExportOptions {
  /** GPX only: match times to this camera clock, so drift and a wrong time zone don't matter. */
  readonly cameraClock?: CameraClock | null;
  /**
   * With a camera clock: the time zone the person sets in their photo software, in minutes from
   * UTC. The software reads the camera's times as being in this zone.
   */
  readonly softwareUtcOffsetMin?: number;
}

export function formatExport(
  format: ExportFormat,
  rows: readonly ExportRow[],
  now: number,
  { cameraClock = null, softwareUtcOffsetMin = 0 }: ExportOptions = {},
): string {
  const sorted = [...rows].sort((a, b) => a.entry.loggedAt - b.entry.loggedAt);
  switch (format) {
    case 'csv':
      return toCsv(sorted);
    case 'geojson':
      return toGeoJson(sorted);
    case 'gpx':
      return toGpx(sorted, now, cameraClock, softwareUtcOffsetMin);
  }
}

/** The names photos have inside a backup zip, so an export row can be matched to its photos. */
function photoFileNames(row: ExportRow): string[] {
  return row.photoIds.map((id) => `${id}.jpg`);
}

/** Metres to one decimal place; finer than that is noise. */
function metres(value: number): number {
  return Math.round(value * 10) / 10;
}

// CSV (RFC 4180, UTF-8)

const csvColumns = [
  'id',
  'logged_at_utc',
  'logged_at_local',
  'time_zone',
  'latitude',
  'longitude',
  'accuracy_m',
  'altitude_m',
  'label',
  'frame',
  'trip',
  'photos',
] as const;

function toCsv(rows: readonly ExportRow[]): string {
  const lines = [csvColumns.join(',')];
  for (const row of rows) {
    const { entry } = row;
    lines.push(
      [
        entry.id,
        formatUtcIso(entry.loggedAt),
        formatLocalIso(entry.loggedAt, entry.utcOffsetMin),
        entry.timeZone,
        formatDegrees(entry.lat),
        formatDegrees(entry.lon),
        String(metres(entry.accuracyM)),
        entry.altitudeM === null ? '' : String(metres(entry.altitudeM)),
        textCell(entry.label),
        textCell(entry.frame),
        textCell(row.trip?.name ?? null),
        photoFileNames(row).join(' '),
      ]
        .map(csvField)
        .join(','),
    );
  }
  // The byte order mark tells Excel the file is UTF-8, so names like Ōtaki come through intact.
  return `﻿${lines.join('\r\n')}\r\n`;
}

/**
 * Text someone typed. A leading `=`, `+`, `-`, `@`, tab, or carriage return would make a
 * spreadsheet treat the cell as a formula, so it gets a `'` in front (OWASP CSV injection).
 */
function textCell(value: string | null): string {
  if (value === null) return '';
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

// GeoJSON (RFC 7946)

function toGeoJson(rows: readonly ExportRow[]): string {
  const features = rows.map((row) => {
    const { entry } = row;
    return {
      type: 'Feature',
      // RFC 7946 puts longitude first.
      geometry: {
        type: 'Point',
        coordinates: [Number(formatDegrees(entry.lon)), Number(formatDegrees(entry.lat))],
      },
      properties: {
        id: entry.id,
        logged_at_utc: formatUtcIso(entry.loggedAt),
        logged_at_local: formatLocalIso(entry.loggedAt, entry.utcOffsetMin),
        time_zone: entry.timeZone,
        accuracy_m: metres(entry.accuracyM),
        altitude_m: entry.altitudeM === null ? null : metres(entry.altitudeM),
        label: entry.label,
        frame: entry.frame,
        trip: row.trip?.name ?? null,
        photos: photoFileNames(row),
      },
    };
  });
  return `${JSON.stringify({ type: 'FeatureCollection', features }, null, 2)}\n`;
}

// GPX 1.1

/**
 * One track per trip and one segment per local day, so photo software doesn't draw a line, and
 * guess positions, between days. Every point is also a waypoint, for apps that only show those.
 */
function toGpx(
  rows: readonly ExportRow[],
  now: number,
  cameraClock: CameraClock | null,
  softwareUtcOffsetMin: number,
): string {
  // Photo software turns a camera time into UTC by taking off the zone it is told, so a matched
  // time is what the camera read, less that zone.
  const pointTime = (entry: Entry) =>
    formatUtcIso(
      cameraClock
        ? toCameraTime(entry.loggedAt, cameraClock) - softwareUtcOffsetMin * 60_000
        : entry.loggedAt,
    );
  const trips = new Map<TripId | null, ExportRow[]>();
  for (const row of rows) {
    const id = row.trip?.id ?? null;
    const group = trips.get(id);
    if (group) group.push(row);
    else trips.set(id, [row]);
  }

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Hotshoe" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    cameraClock
      ? `  <metadata><desc>Times are matched to the camera's clock: set the time zone to ${formatUtcOffset(softwareUtcOffsetMin)} when geotagging.</desc><time>${formatUtcIso(now)}</time></metadata>`
      : `  <metadata><time>${formatUtcIso(now)}</time></metadata>`,
  ];

  for (const row of rows) {
    const name = waypointName(row.entry);
    lines.push(
      `  <wpt ${gpxPosition(row.entry)}>${gpxPointBody(row.entry, pointTime)}${name === null ? '' : `<name>${xml(name)}</name>`}</wpt>`,
    );
  }

  for (const tripRows of trips.values()) {
    const tripName = tripRows[0]?.trip?.name ?? 'No trip';
    lines.push('  <trk>', `    <name>${xml(tripName)}</name>`);
    let day: string | null = null;
    for (const { entry } of tripRows) {
      const entryDay = localDayKey(entry.loggedAt, entry);
      if (entryDay !== day) {
        if (day !== null) lines.push('    </trkseg>');
        lines.push('    <trkseg>');
        day = entryDay;
      }
      lines.push(`      <trkpt ${gpxPosition(entry)}>${gpxPointBody(entry, pointTime)}</trkpt>`);
    }
    lines.push('    </trkseg>', '  </trk>');
  }

  lines.push('</gpx>');
  return `${lines.join('\n')}\n`;
}

function gpxPosition(entry: Entry): string {
  return `lat="${formatDegrees(entry.lat)}" lon="${formatDegrees(entry.lon)}"`;
}

/** `<ele>` when the altitude is known, then `<time>`, in the order the GPX schema requires. */
function gpxPointBody(entry: Entry, pointTime: (entry: Entry) => string): string {
  const ele = entry.altitudeM === null ? '' : `<ele>${metres(entry.altitudeM)}</ele>`;
  return `${ele}<time>${pointTime(entry)}</time>`;
}

function waypointName(entry: Entry): string | null {
  if (entry.label !== null && entry.frame !== null) return `${entry.label} (frame ${entry.frame})`;
  if (entry.label !== null) return entry.label;
  if (entry.frame !== null) return `Frame ${entry.frame}`;
  return null;
}

function xml(text: string): string {
  return (
    text
      // Control characters other than tab and newlines aren't allowed anywhere in XML 1.0.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
      .replaceAll(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;')
  );
}
