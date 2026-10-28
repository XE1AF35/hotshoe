import { describe, expect, it } from 'vitest';
import { formatLoggedClock } from '../../lib/format.ts';
import { offsetOnlyZone } from '../../lib/time.ts';
import { type ExifFields, jpegWithExif } from '../../test/exif.ts';
import { newEntryFromDraft, readPhotoDraft, typedTime } from './draft.ts';

function photo(
  fields: ExifFields,
  { littleEndian = false, lastModified = Date.parse('2026-10-20T00:00:00Z') } = {},
): File {
  return new File([jpegWithExif(fields, { littleEndian })], 'IMG_0001.JPG', {
    type: 'image/jpeg',
    lastModified,
  });
}

/** Zero is how a file with no date comes through. */
const noFileDate = 0;

const shot: ExifFields = {
  dateTimeOriginal: '2026:10:14 10:35:12',
  offsetTimeOriginal: '+07:00',
};

/** -36.848461, 174.763336 in degrees, minutes, and seconds. */
const auckland = {
  latitudeRef: 'S',
  latitude: [36, 50, 54.4596],
  longitudeRef: 'E',
  longitude: [174, 45, 48.0096],
  altitudeRef: 0,
  altitude: 12.5,
  hPositioningError: 8,
  dateStamp: '2026:10:14',
  timeStamp: [3, 35, 13.5],
} as const;

describe('readPhotoDraft', () => {
  it('reads the shot time with its offset and sub-seconds', async () => {
    const file = photo({
      dateTimeOriginal: '2026:10:14 10:35:12',
      offsetTimeOriginal: '+07:00',
      subSecTimeOriginal: '25',
    });

    const draft = await readPhotoDraft(file, 'Asia/Ho_Chi_Minh');

    expect(draft.time).toEqual({
      source: 'exact',
      at: Date.parse('2026-10-14T03:35:12.250Z'),
      context: { timeZone: 'Asia/Ho_Chi_Minh', utcOffsetMin: 420 },
    });
  });

  // New Zealand daylight time began at 2026-09-26T14:00Z, 2 am NZST becoming 3 am NZDT.
  it.each([
    ['the zone matches', '2026:10:14 10:35:12', '+07:00', 'Asia/Ho_Chi_Minh', 'Asia/Ho_Chi_Minh'],
    ['the zone differs', '2026:10:14 10:35:12', '+07:00', 'Pacific/Auckland', offsetOnlyZone],
    ['a half-hour zone matches', '2026:10:14 10:35:12', '+05:30', 'Asia/Kolkata', 'Asia/Kolkata'],
    [
      'a half-hour offset differs',
      '2026:10:14 10:35:12',
      '+05:30',
      'Asia/Kathmandu',
      offsetOnlyZone,
    ],
    [
      'a western zone matches',
      '2026:10:14 10:35:12',
      '-03:00',
      'America/Sao_Paulo',
      'America/Sao_Paulo',
    ],
    [
      'standard time just before DST',
      '2026:09:27 01:30:00',
      '+12:00',
      'Pacific/Auckland',
      'Pacific/Auckland',
    ],
    [
      'daylight time just after DST',
      '2026:09:27 03:30:00',
      '+13:00',
      'Pacific/Auckland',
      'Pacific/Auckland',
    ],
    [
      'standard time after DST began',
      '2026:09:27 03:30:00',
      '+12:00',
      'Pacific/Auckland',
      offsetOnlyZone,
    ],
  ])('uses the named zone only when %s', async (_, shot, offset, deviceZone, timeZone) => {
    const draft = await readPhotoDraft(
      photo({ dateTimeOriginal: shot, offsetTimeOriginal: offset }),
      deviceZone,
    );

    expect(draft.time).toMatchObject({ context: { timeZone } });
  });

  it('shows an offset-only time with its offset', async () => {
    const draft = await readPhotoDraft(
      photo({ dateTimeOriginal: '2026:10:14 10:35:12', offsetTimeOriginal: '+07:00' }),
      'Pacific/Auckland',
    );
    if (draft.time.source !== 'exact') throw new Error('expected a time');

    expect(formatLoggedClock(draft.time.at, draft.time.context)).toBe('10:35 am (UTC+07:00)');
  });

  it.each([
    ['big-endian', false],
    ['little-endian', true],
  ])('reads the GPS location, error, and altitude from a %s file', async (_, littleEndian) => {
    const draft = await readPhotoDraft(photo({ ...shot, gps: auckland }, { littleEndian }), 'UTC');

    expect(draft.location).toEqual({
      lat: expect.closeTo(-36.848461, 6),
      lon: expect.closeTo(174.763336, 6),
      accuracyM: 8,
      altitudeM: 12.5,
      gpsAt: Date.parse('2026-10-14T03:35:13.500Z'),
      origin: 'photo',
    });
  });

  it('reads north and west, below sea level, with no error figure or GPS time', async () => {
    const draft = await readPhotoDraft(
      photo({
        ...shot,
        gps: {
          latitudeRef: 'N',
          latitude: [31, 30, 0],
          longitudeRef: 'W',
          longitude: [35, 30, 0],
          altitudeRef: 1,
          altitude: 430.5,
        },
      }),
      'UTC',
    );

    expect(draft.location).toEqual({
      lat: 31.5,
      lon: -35.5,
      accuracyM: null,
      altitudeM: -430.5,
      gpsAt: null,
      origin: 'photo',
    });
  });

  it.each([
    ['HEIC', new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])],
    ['not a photo', new TextEncoder().encode('hello')],
    ['empty', new Uint8Array()],
    ['truncated', jpegWithExif({ ...shot, gps: auckland }).slice(0, 60)],
    ['a JPEG without EXIF', new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
  ])('finds nothing in a file that is %s', async (_, bytes) => {
    const draft = await readPhotoDraft(new File([bytes], 'x', { lastModified: noFileDate }), 'UTC');

    expect(draft.time).toEqual({ source: 'missing' });
    expect(draft.location).toBeNull();
  });

  it('finds nothing in a file that fails to read', async () => {
    const unreadable = new File(['x'], 'IMG_0001.JPG', { lastModified: noFileDate });
    Object.defineProperty(unreadable, 'slice', {
      value: () => ({ arrayBuffer: () => Promise.reject(new Error('gone')) }),
    });

    const draft = await readPhotoDraft(unreadable, 'UTC');

    expect(draft.time).toEqual({ source: 'missing' });
    expect(draft.location).toBeNull();
  });

  describe('without an offset', () => {
    const noOffset = { dateTimeOriginal: '2026:10:14 10:35:12', subSecTimeOriginal: '25' };
    const gpsClock = { dateStamp: '2026:10:14', timeStamp: [3, 35, 13] } as const;

    it('uses the GPS time, with the offset the shot time shows', async () => {
      const draft = await readPhotoDraft(photo({ ...noOffset, gps: gpsClock }), 'Pacific/Auckland');

      expect(draft.time).toEqual({
        source: 'gps',
        at: Date.parse('2026-10-14T03:35:13Z'),
        context: { timeZone: offsetOnlyZone, utcOffsetMin: 420 },
      });
    });

    it('names the iPhone zone for a GPS time when the offsets match', async () => {
      const draft = await readPhotoDraft(photo({ ...noOffset, gps: gpsClock }), 'Asia/Bangkok');

      expect(draft.time).toMatchObject({
        source: 'gps',
        context: { timeZone: 'Asia/Bangkok', utcOffsetMin: 420 },
      });
    });

    it('uses the GPS time in the iPhone zone when there is no shot time', async () => {
      const draft = await readPhotoDraft(photo({ gps: gpsClock }), 'Pacific/Auckland');

      expect(draft.time).toEqual({
        source: 'gps',
        at: Date.parse('2026-10-14T03:35:13Z'),
        context: { timeZone: 'Pacific/Auckland', utcOffsetMin: 780 },
      });
    });

    it('reads a shot time with no GPS time in the iPhone zone', async () => {
      const draft = await readPhotoDraft(photo(noOffset), 'Pacific/Auckland');

      expect(draft.time).toEqual({
        source: 'zone-assumed',
        at: Date.parse('2026-10-13T21:35:12.250Z'),
        context: { timeZone: 'Pacific/Auckland', utcOffsetMin: 780 },
      });
    });

    // New Zealand daylight time began at 2 am on 27 September 2026 and ended at 3 am on 5 April.
    // New York's began at 2 am on 8 March and ends at 2 am on 1 November.
    it.each([
      [
        'just before daylight time',
        'Pacific/Auckland',
        '2026:09:27 01:30:00',
        '2026-09-26T13:30:00Z',
        720,
      ],
      [
        'skipped as daylight time began',
        'Pacific/Auckland',
        '2026:09:27 02:30:00',
        '2026-09-26T14:30:00Z',
        780,
      ],
      [
        'just after daylight time began',
        'Pacific/Auckland',
        '2026:09:27 03:30:00',
        '2026-09-26T14:30:00Z',
        780,
      ],
      [
        'shown twice as daylight time ended',
        'Pacific/Auckland',
        '2026:04:05 02:30:00',
        '2026-04-04T13:30:00Z',
        780,
      ],
      [
        'skipped behind UTC',
        'America/New_York',
        '2026:03:08 02:30:00',
        '2026-03-08T07:30:00Z',
        -240,
      ],
      [
        'just after daylight time began behind UTC',
        'America/New_York',
        '2026:03:08 03:30:00',
        '2026-03-08T07:30:00Z',
        -240,
      ],
      [
        'shown twice behind UTC',
        'America/New_York',
        '2026:11:01 01:30:00',
        '2026-11-01T05:30:00Z',
        -240,
      ],
    ])('assumes the zone for a time %s', async (_, zone, dateTimeOriginal, at, utcOffsetMin) => {
      const draft = await readPhotoDraft(photo({ dateTimeOriginal }), zone);

      expect(draft.time).toEqual({
        source: 'zone-assumed',
        at: Date.parse(at),
        context: { timeZone: zone, utcOffsetMin },
      });
    });
  });

  it('uses the file date in the iPhone zone when there is no shot or GPS time', async () => {
    const lastModified = Date.parse('2026-10-13T21:35:12Z');
    const draft = await readPhotoDraft(photo({}, { lastModified }), 'Pacific/Auckland');

    expect(draft.time).toEqual({
      source: 'file-date',
      at: lastModified,
      context: { timeZone: 'Pacific/Auckland', utcOffsetMin: 780 },
    });
  });

  it('finds no time when the file has no date either', async () => {
    const draft = await readPhotoDraft(photo({}, { lastModified: noFileDate }), 'UTC');
    expect(draft.time).toEqual({ source: 'missing' });
  });

  it('finds no location when the GPS has no coordinates', async () => {
    const draft = await readPhotoDraft(photo({ ...shot, gps: { altitude: 12 } }), 'UTC');
    expect(draft.location).toBeNull();
  });
});

describe('typedTime', () => {
  it.each([
    ['2026-10-14T10:35', '2026-10-13T21:35:00Z'],
    ['2026-10-14T10:35:12', '2026-10-13T21:35:12Z'],
  ])('reads %s in the iPhone zone', (text, at) => {
    expect(typedTime(text, 'Pacific/Auckland')).toEqual({
      source: 'typed',
      at: Date.parse(at),
      context: { timeZone: 'Pacific/Auckland', utcOffsetMin: 780 },
    });
  });

  it.each([[''], ['2026-10-14'], ['2026-13-01T10:35'], ['2026-02-31T10:35'], ['soon']])(
    'finds no time in %j',
    (text) => {
      expect(typedTime(text, 'Pacific/Auckland')).toEqual({ source: 'missing' });
    },
  );
});

describe('newEntryFromDraft', () => {
  it('makes a From-photo entry timed at the shot, with the Fix at the GPS time', async () => {
    const draft = await readPhotoDraft(photo({ ...shot, gps: auckland }), 'Asia/Ho_Chi_Minh');

    expect(newEntryFromDraft(draft, null)).toEqual({
      loggedAt: Date.parse('2026-10-14T03:35:12Z'),
      fixAt: Date.parse('2026-10-14T03:35:13.500Z'),
      timeZone: 'Asia/Ho_Chi_Minh',
      utcOffsetMin: 420,
      lat: expect.closeTo(-36.848461, 6),
      lon: expect.closeTo(174.763336, 6),
      accuracyM: 8,
      altitudeM: 12.5,
      altitudeAccuracyM: null,
      origin: 'photo',
      tripId: null,
    });
  });

  it('times the Fix at the shot when the photo has no GPS time', async () => {
    const { dateStamp: _, timeStamp: __, ...gps } = auckland;
    const draft = await readPhotoDraft(photo({ ...shot, gps }), 'UTC');

    expect(newEntryFromDraft(draft, null)?.fixAt).toBe(Date.parse('2026-10-14T03:35:12Z'));
  });

  it('makes nothing from a draft missing its time or location', async () => {
    const { dateStamp: _, timeStamp: __, ...gps } = auckland;
    const noLocation = await readPhotoDraft(photo(shot), 'UTC');
    const noTime = await readPhotoDraft(photo({ gps }, { lastModified: noFileDate }), 'UTC');

    expect(newEntryFromDraft(noLocation, null)).toBeNull();
    expect(newEntryFromDraft(noTime, null)).toBeNull();
  });
});
