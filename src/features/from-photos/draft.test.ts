import { describe, expect, it } from 'vitest';
import { formatLoggedClock } from '../../lib/format.ts';
import { offsetOnlyZone } from '../../lib/time.ts';
import { type ExifFields, jpegWithExif } from '../../test/exif.ts';
import { newEntryFromDraft, readPhotoDraft } from './draft.ts';

function photo(fields: ExifFields, littleEndian = false): File {
  return new File([jpegWithExif(fields, { littleEndian })], 'IMG_0001.JPG', {
    type: 'image/jpeg',
    lastModified: Date.parse('2026-10-20T00:00:00Z'),
  });
}

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
    const draft = await readPhotoDraft(photo({ ...shot, gps: auckland }, littleEndian), 'UTC');

    expect(draft.location).toEqual({
      lat: expect.closeTo(-36.848461, 6),
      lon: expect.closeTo(174.763336, 6),
      accuracyM: 8,
      altitudeM: 12.5,
      gpsAt: Date.parse('2026-10-14T03:35:13.500Z'),
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
    });
  });

  it.each([
    ['HEIC', new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])],
    ['not a photo', new TextEncoder().encode('hello')],
    ['empty', new Uint8Array()],
    ['truncated', jpegWithExif({ ...shot, gps: auckland }).slice(0, 60)],
    ['a JPEG without EXIF', new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
  ])('finds nothing in a file that is %s', async (_, bytes) => {
    const draft = await readPhotoDraft(new File([bytes], 'x'), 'UTC');

    expect(draft.time).toEqual({ source: 'missing' });
    expect(draft.location).toBeNull();
  });

  it('finds nothing in a file that fails to read', async () => {
    const unreadable = new File(['x'], 'IMG_0001.JPG');
    Object.defineProperty(unreadable, 'slice', {
      value: () => ({ arrayBuffer: () => Promise.reject(new Error('gone')) }),
    });

    const draft = await readPhotoDraft(unreadable, 'UTC');

    expect(draft.time).toEqual({ source: 'missing' });
    expect(draft.location).toBeNull();
  });

  it('finds no location when the GPS has no coordinates', async () => {
    const draft = await readPhotoDraft(photo({ ...shot, gps: { altitude: 12 } }), 'UTC');
    expect(draft.location).toBeNull();
  });
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
    const noLocation = await readPhotoDraft(photo(shot), 'UTC');
    const noTime = await readPhotoDraft(photo({ gps: auckland }), 'UTC');

    expect(newEntryFromDraft(noLocation, null)).toBeNull();
    expect(newEntryFromDraft(noTime, null)).toBeNull();
  });
});
