import { describe, expect, it } from 'vitest';
import type { Entry, EntryId, PhotoId, TripId } from '../../db/schema.ts';
import { type ExportRow, formatExport } from './formats.ts';

const now = Date.parse('2026-10-14T03:12:45Z');

function entry(overrides: Partial<Entry> & Pick<Entry, 'id' | 'loggedAt'>): Entry {
  return {
    fixAt: overrides.loggedAt + 2000,
    timeZone: 'Pacific/Auckland',
    utcOffsetMin: 780,
    lat: -36.848461,
    lon: 174.763336,
    accuracyM: 8,
    altitudeM: 12.46,
    altitudeAccuracyM: 4,
    label: null,
    frame: null,
    tripId: null,
    origin: 'logged',
    createdAt: overrides.loggedAt,
    updatedAt: overrides.loggedAt,
    ...overrides,
  };
}

const waiheke = 'trip-waiheke' as TripId;

/**
 * Two days on Waiheke (the second crossing midnight in New Zealand but not in UTC), one entry
 * with no trip, one entry of each origin, and text chosen to trip up each format.
 */
const rows: ExportRow[] = [
  {
    // Listed first but logged last, to show exports sort by time.
    entry: entry({
      id: 'e3' as EntryId,
      loggedAt: Date.parse('2026-10-14T11:30:00Z'),
      lat: -36.8,
      lon: 175.1,
      accuracyM: null,
      altitudeM: null,
      origin: 'placed',
      label: 'Onetangi, "golden hour"\nsecond line',
      tripId: waiheke,
    }),
    trip: { id: waiheke, name: 'Waiheke & <Rakino>' },
    photoIds: [],
  },
  {
    entry: entry({
      id: 'e1' as EntryId,
      loggedAt: Date.parse('2026-10-14T01:00:00Z'),
      label: 'Ōtaki wharf',
      frame: '12A',
      tripId: waiheke,
    }),
    trip: { id: waiheke, name: 'Waiheke & <Rakino>' },
    photoIds: ['p1' as PhotoId, 'p2' as PhotoId],
  },
  {
    entry: entry({
      id: 'e2' as EntryId,
      loggedAt: Date.parse('2026-10-14T02:00:00Z'),
      accuracyM: 64.25,
      origin: 'photo',
      label: '=HYPERLINK("http://example.com")',
      frame: '-3',
    }),
    trip: null,
    photoIds: [],
  },
];

describe('formatExport', () => {
  it('writes CSV that matches the golden file', async () => {
    await expect(formatExport('csv', rows, now)).toMatchFileSnapshot('./golden/sample.csv');
  });

  it('writes GeoJSON that matches the golden file', async () => {
    await expect(formatExport('geojson', rows, now)).toMatchFileSnapshot('./golden/sample.geojson');
  });

  it('writes GPX that matches the golden file', async () => {
    await expect(formatExport('gpx', rows, now)).toMatchFileSnapshot('./golden/sample.gpx');
  });

  it('puts longitude before latitude in GeoJSON', () => {
    const json = JSON.parse(formatExport('geojson', rows, now));
    expect(json.features[0].geometry.coordinates).toEqual([174.763336, -36.848461]);
  });

  it('stops typed text being read as a spreadsheet formula, but leaves coordinates alone', () => {
    const csv = formatExport('csv', rows, now);
    expect(csv).toContain(`"'=HYPERLINK(""http://example.com"")"`);
    expect(csv).toContain(",'-3,");
    expect(csv).toContain(',-36.848461,174.763336,');
  });

  it('starts a GPX segment for each local day within a trip', () => {
    const gpx = formatExport('gpx', rows, now);
    const waihekeTrack = gpx.slice(gpx.indexOf('<name>Waiheke'), gpx.indexOf('<name>No trip'));
    // 1 am and 11:30 am UTC are 2 pm on the 14th and 12:30 am on the 15th in Auckland.
    expect(waihekeTrack.match(/<trkseg>/g)).toHaveLength(2);
  });

  it('escapes text in GPX and drops characters XML cannot hold', () => {
    const [, otaki] = rows as [ExportRow, ExportRow];
    const gpx = formatExport(
      'gpx',
      [{ ...otaki, entry: { ...otaki.entry, label: 'a\u0001b <c>' } }],
      now,
    );
    expect(gpx).toContain('<name>ab &lt;c&gt; (frame 12A)</name>');
    expect(gpx).toContain('<name>Waiheke &amp; &lt;Rakino&gt;</name>');
  });

  it("matches GPX times to a camera's clock for the time zone set in photo software", () => {
    // The camera is on Auckland time (UTC+13) and runs 2 min 4 s fast.
    const cameraClock = { offsetS: 46_800 + 124, phoneUtcOffsetMin: 780, measuredAt: 0 };

    // Set to UTC+13 in the software: true UTC plus the drift. 01:00:00 becomes 01:02:04.
    const local = formatExport('gpx', rows, now, { cameraClock, softwareUtcOffsetMin: 780 });
    expect(local).toContain('<time>2026-10-14T01:02:04Z</time>');
    expect(local).toContain('set the time zone to UTC+13:00 when geotagging');

    // Set to UTC: the camera's own reading, 14:02:04.
    const utc = formatExport('gpx', rows, now, { cameraClock, softwareUtcOffsetMin: 0 });
    expect(utc).toContain('<time>2026-10-14T14:02:04Z</time>');
    expect(utc).toContain('set the time zone to UTC when geotagging');
    expect(formatExport('csv', rows, now, { cameraClock: null })).toBe(
      formatExport('csv', rows, now),
    );
  });

  it('writes empty but valid files when there is nothing to export', () => {
    expect(formatExport('csv', [], now)).toBe(
      '﻿id,logged_at_utc,logged_at_local,time_zone,latitude,longitude,origin,accuracy_m,altitude_m,label,frame,trip,photos\r\n',
    );
    expect(JSON.parse(formatExport('geojson', [], now)).features).toEqual([]);
    expect(formatExport('gpx', [], now)).not.toContain('<trk>');
  });
});
