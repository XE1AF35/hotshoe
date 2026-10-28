import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotshoeDb } from '../../db/database.ts';
import { listEntries } from '../../db/entries.ts';
import { StorageFullError } from '../../db/errors.ts';
import * as photosRepo from '../../db/photos.ts';
import { listPhotos } from '../../db/photos.ts';
import type { Entry } from '../../db/schema.ts';
import { setSetting } from '../../db/settings.ts';
import { addTrip, setActiveTrip } from '../../db/trips.ts';
import { offsetOnlyZone } from '../../lib/time.ts';
import { createTestDb } from '../../test/db.ts';
import { type ExifFields, jpegWithExif } from '../../test/exif.ts';
import { renderWithDb } from '../../test/render.tsx';
import { LogScreen } from '../capture/LogScreen.tsx';

// jsdom-style environments can't decode images; the metadata reader is not mocked.
vi.mock('../../lib/image.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/image.ts')>()),
  processPhoto: vi.fn(async (file: File) => ({
    image: new Blob(['image'], { type: 'image/jpeg' }),
    thumb: new Blob(['thumb'], { type: 'image/jpeg' }),
    width: 1600,
    height: 1200,
    takenAt: file.lastModified,
  })),
}));

beforeEach(() => {
  vi.stubEnv('TZ', 'Pacific/Auckland');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const gps = {
  latitudeRef: 'S',
  latitude: [36, 50, 54.4596],
  longitudeRef: 'E',
  longitude: [174, 45, 48.0096],
  altitude: 12,
  hPositioningError: 8,
} as const;

/** Shot at 10:35 in Auckland, in daylight time. */
const harbour: ExifFields = {
  dateTimeOriginal: '2026:10:14 10:35:12',
  offsetTimeOriginal: '+13:00',
  gps,
};

/** Shot in Hanoi a day earlier. */
const hanoi: ExifFields = {
  dateTimeOriginal: '2026:10:13 09:00:00',
  offsetTimeOriginal: '+07:00',
  gps: { ...gps, latitudeRef: 'N', latitude: [21, 1, 42], longitude: [105, 51, 0] },
};

function photoFile(
  name: string,
  fields: ExifFields,
  lastModified = Date.parse('2026-10-20T00:00:00Z'),
): File {
  const file = new File([jpegWithExif(fields)], name, { type: 'image/jpeg' });
  // Set afterwards, as happy-dom turns a zero date into now.
  Object.defineProperty(file, 'lastModified', { value: lastModified });
  return file;
}

/** Zero is how a file with no date comes through. */
const noFileDate = 0;

async function pick(db: HotshoeDb, files: File[]) {
  const { container } = renderWithDb(db, <LogScreen />);
  fireEvent.click(await screen.findByRole('button', { name: 'From photos' }));
  const input = container.querySelector('input[multiple]');
  if (!input) throw new Error('library input missing');
  fireEvent.change(input, { target: { files } });
  return screen.findByRole('dialog', { name: 'From photos' });
}

/** The file names of the rows, top to bottom. */
function rowNames(sheet: HTMLElement): string[] {
  return within(sheet)
    .getAllByRole('checkbox')
    .map((box) => (box.closest('label')?.textContent ?? '').slice(0, 12));
}

function fail(message: string): never {
  throw new Error(message);
}

async function entriesWithPhotos(db: HotshoeDb) {
  const entries = await listEntries(db);
  return Promise.all(
    entries.map(async (entry: Entry) => ({ entry, photos: await listPhotos(db, entry.id) })),
  );
}

describe('From photos', () => {
  it('reviews the picked photos in shot-time order and adds an entry for each', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Vietnam');
    await setActiveTrip(db, trip.id);

    const sheet = await pick(db, [
      photoFile('IMG_0002.JPG', harbour),
      photoFile('IMG_0001.JPG', hanoi),
    ]);

    await within(sheet).findAllByRole('checkbox');
    expect(rowNames(sheet)).toEqual(['IMG_0001.JPG', 'IMG_0002.JPG']);
    expect(
      within(sheet).getByRole('checkbox', { name: /IMG_0001.*9:00:00 am \(UTC\+07:00\)/ }),
    ).toHaveProperty('checked', true);
    expect(within(sheet).getByLabelText('Trip')).toHaveProperty('value', trip.id);

    fireEvent.click(within(sheet).getByRole('button', { name: 'Add 2 entries' }));

    const status = await screen.findByText('Added 2 entries.');
    expect(screen.getByRole('link', { name: 'See them in Entries' })).toHaveProperty(
      'hash',
      '#/entries',
    );
    expect(status).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();

    const saved = await entriesWithPhotos(db);
    expect(saved.map(({ entry }) => entry)).toEqual([
      expect.objectContaining({
        origin: 'photo',
        loggedAt: Date.parse('2026-10-13T21:35:12Z'),
        timeZone: 'Pacific/Auckland',
        utcOffsetMin: 780,
        accuracyM: 8,
        altitudeM: 12,
        tripId: trip.id,
      }),
      expect.objectContaining({
        origin: 'photo',
        loggedAt: Date.parse('2026-10-13T02:00:00Z'),
        timeZone: offsetOnlyZone,
        utcOffsetMin: 420,
        lat: expect.closeTo(21.028333, 6),
        tripId: trip.id,
      }),
    ]);
    expect(saved.map(({ photos }) => photos)).toEqual([
      [
        expect.objectContaining({
          source: 'library',
          takenAt: Date.parse('2026-10-13T21:35:12Z'),
        }),
      ],
      [expect.objectContaining({ source: 'library', takenAt: Date.parse('2026-10-13T02:00:00Z') })],
    ]);
  });

  it('flags a photo missing its location, and adds the rest once it is unticked', async () => {
    const db = createTestDb();
    // Picked in a different order from the shots, so the rows are reordered.
    const sheet = await pick(db, [
      photoFile('IMG_0003.HEIC', {}, noFileDate),
      photoFile('IMG_0002.JPG', {
        dateTimeOriginal: '2026:10:14 10:40:00',
        offsetTimeOriginal: '+13:00',
      }),
      photoFile('IMG_0001.JPG', harbour),
    ]);

    const noLocation = await within(sheet).findByRole('checkbox', {
      name: /IMG_0002.*No location/,
    });
    const nothing = within(sheet).getByRole('checkbox', { name: /IMG_0003.*No time.*No location/ });
    const confirm = within(sheet).getByRole('button', { name: 'Add 3 entries' });
    expect(confirm).toHaveProperty('disabled', true);

    fireEvent.click(noLocation);
    fireEvent.click(nothing);
    expect(within(sheet).getByRole('checkbox', { name: /IMG_0001/ })).toHaveProperty(
      'checked',
      true,
    );
    const addOne = within(sheet).getByRole('button', { name: 'Add 1 entry' });
    expect(addOne).toHaveProperty('disabled', false);
    fireEvent.click(addOne);

    expect(await screen.findByText('Added 1 entry.')).toBeDefined();
    expect(await listEntries(db)).toHaveLength(1);
  });

  it('falls back to the GPS time, the iPhone zone, then the file date, flagging guesses', async () => {
    const db = createTestDb();
    const sheet = await pick(db, [
      photoFile('IMG_0001.JPG', {
        dateTimeOriginal: '2026:10:14 10:35:12',
        gps: { ...gps, dateStamp: '2026:10:14', timeStamp: [3, 35, 12] },
      }),
      photoFile('IMG_0002.JPG', { dateTimeOriginal: '2026:10:14 10:40:00', gps }),
      photoFile('IMG_0003.JPG', { gps }, Date.parse('2026-10-13T21:45:00Z')),
    ]);

    await within(sheet).findByRole('checkbox', { name: /IMG_0001.*10:35:12 am \(UTC\+07:00\)/ });
    expect(
      within(sheet).queryByRole('checkbox', { name: /IMG_0001.*(assumed|file date)/ }),
    ).toBeNull();
    within(sheet).getByRole('checkbox', { name: /IMG_0002.*10:40:00 am.*Time zone assumed/ });
    within(sheet).getByRole('checkbox', { name: /IMG_0003.*10:45:00 am.*Time from the file date/ });
    expect(rowNames(sheet)).toEqual(['IMG_0002.JPG', 'IMG_0003.JPG', 'IMG_0001.JPG']);

    fireEvent.click(within(sheet).getByRole('button', { name: 'Add 3 entries' }));

    await screen.findByText('Added 3 entries.');
    expect(await listEntries(db)).toEqual([
      expect.objectContaining({
        loggedAt: Date.parse('2026-10-14T03:35:12Z'),
        timeZone: offsetOnlyZone,
        utcOffsetMin: 420,
      }),
      expect.objectContaining({
        loggedAt: Date.parse('2026-10-13T21:45:00Z'),
        timeZone: 'Pacific/Auckland',
        utcOffsetMin: 780,
      }),
      expect.objectContaining({
        loggedAt: Date.parse('2026-10-13T21:40:00Z'),
        timeZone: 'Pacific/Auckland',
        utcOffsetMin: 780,
      }),
    ]);
  });

  it('takes a typed time for a photo with none, and keeps the rows in time order', async () => {
    const db = createTestDb();
    const sheet = await pick(db, [
      photoFile('IMG_0001.JPG', harbour),
      photoFile('IMG_0002.JPG', { gps }, noFileDate),
    ]);

    const untimed = await within(sheet).findByRole('checkbox', { name: /IMG_0002.*No time/ });
    expect(untimed).toHaveProperty('checked', true);
    const confirm = within(sheet).getByRole('button', { name: 'Add 2 entries' });
    expect(confirm).toHaveProperty('disabled', true);

    fireEvent.change(within(sheet).getByLabelText('Date and time for IMG_0002.JPG'), {
      target: { value: '2026-10-14T09:15' },
    });

    expect(rowNames(sheet)).toEqual(['IMG_0002.JPG', 'IMG_0001.JPG']);
    within(sheet).getByRole('checkbox', { name: /IMG_0002.*9:15:00 am/ });
    expect(within(sheet).queryByRole('checkbox', { name: /No time/ })).toBeNull();
    expect(confirm).toHaveProperty('disabled', false);
    fireEvent.click(confirm);

    await screen.findByText('Added 2 entries.');
    expect((await listEntries(db)).map((entry) => entry.loggedAt)).toEqual([
      Date.parse('2026-10-13T21:35:12Z'),
      Date.parse('2026-10-13T20:15:00Z'),
    ]);
  });

  it('places a photo with no location from pasted coordinates', async () => {
    const db = createTestDb();
    const sheet = await pick(db, [
      photoFile('IMG_0001.JPG', {
        dateTimeOriginal: '2026:10:14 10:40:00',
        offsetTimeOriginal: '+13:00',
      }),
    ]);

    await within(sheet).findByRole('checkbox', { name: /IMG_0001.*No location/ });
    const confirm = within(sheet).getByRole('button', { name: 'Add 1 entry' });
    expect(confirm).toHaveProperty('disabled', true);
    expect(
      within(sheet).queryByRole('button', { name: /Same place as the previous photo/ }),
    ).toBeNull();

    const field = within(sheet).getByLabelText('Coordinates for IMG_0001.JPG');
    fireEvent.change(field, { target: { value: 'Auckland' } });
    expect(within(sheet).getByText(/can't read those coordinates/)).toBeDefined();
    expect(confirm).toHaveProperty('disabled', true);

    fireEvent.change(field, { target: { value: `36°50'54,5"S; 174°45'48,0"E` } });
    expect(within(sheet).queryByText(/can't read/)).toBeNull();
    within(sheet).getByRole('checkbox', { name: /IMG_0001.*Placed by hand/ });
    expect(within(sheet).queryByRole('checkbox', { name: /No location/ })).toBeNull();
    fireEvent.click(confirm);

    await screen.findByText('Added 1 entry.');
    expect(await listEntries(db)).toEqual([
      expect.objectContaining({
        origin: 'placed',
        lat: expect.closeTo(-36.848472, 6),
        lon: expect.closeTo(174.763333, 6),
        accuracyM: null,
        altitudeM: null,
        fixAt: Date.parse('2026-10-13T21:40:00Z'),
      }),
    ]);
  });

  it('places a run of photos at the same place as the previous one with a location', async () => {
    const db = createTestDb();
    // Shown to a tenth of a second of arc, coarser than the location copied.
    await setSetting(db, 'coordFormat', 'dms');
    const at = (time: string): ExifFields => ({
      dateTimeOriginal: `2026:10:14 ${time}`,
      offsetTimeOriginal: '+13:00',
    });
    const sheet = await pick(db, [
      photoFile('IMG_0003.JPG', at('10:50:00')),
      photoFile('IMG_0000.JPG', at('10:00:00')),
      photoFile('IMG_0002.JPG', at('10:45:00')),
      photoFile('IMG_0001.JPG', harbour),
    ]);

    await within(sheet).findAllByRole('checkbox');
    expect(rowNames(sheet)).toEqual([
      'IMG_0000.JPG',
      'IMG_0001.JPG',
      'IMG_0002.JPG',
      'IMG_0003.JPG',
    ]);
    const sameAs = (name: string) =>
      within(sheet).queryByRole('button', { name: `Same place as the previous photo for ${name}` });
    // Nothing earlier has a location.
    expect(sameAs('IMG_0000.JPG')).toBeNull();
    expect(sameAs('IMG_0001.JPG')).toBeNull();

    fireEvent.click(sameAs('IMG_0003.JPG') ?? fail('IMG_0003.JPG has no Same place'));
    fireEvent.click(sameAs('IMG_0002.JPG') ?? fail('IMG_0002.JPG has no Same place'));
    await within(sheet).findByRole('checkbox', { name: /IMG_0003.*Placed by hand/ });
    within(sheet).getByRole('checkbox', { name: /IMG_0002.*Placed by hand/ });

    fireEvent.click(within(sheet).getByRole('checkbox', { name: /IMG_0000/ }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add 3 entries' }));

    await screen.findByText('Added 3 entries.');
    const [last, middle, first] = await listEntries(db);
    expect(first).toMatchObject({ origin: 'photo', accuracyM: 8 });
    for (const placed of [middle, last]) {
      expect(placed).toMatchObject({
        origin: 'placed',
        lat: first?.lat,
        lon: first?.lon,
        accuracyM: null,
        altitudeM: null,
      });
    }
  });

  it('adds to no trip when that is chosen', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    await setActiveTrip(db, trip.id);
    const sheet = await pick(db, [photoFile('IMG_0001.JPG', harbour)]);

    fireEvent.change(await within(sheet).findByLabelText('Trip'), { target: { value: '' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add 1 entry' }));

    await screen.findByText('Added 1 entry.');
    expect((await listEntries(db))[0]?.tripId).toBeNull();
  });

  it('saves nothing on Cancel', async () => {
    const db = createTestDb();
    const sheet = await pick(db, [photoFile('IMG_0001.JPG', harbour)]);

    await within(sheet).findByRole('checkbox');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await listEntries(db)).toEqual([]);
    expect(screen.queryByText(/Added/)).toBeNull();
  });

  it('stops when the iPhone runs out of space and says how many were added', async () => {
    const db = createTestDb();
    const realAdd = photosRepo.addPhoto;
    vi.spyOn(photosRepo, 'addPhoto')
      .mockImplementationOnce(realAdd)
      .mockRejectedValue(new StorageFullError());
    const sheet = await pick(db, [
      photoFile('IMG_0001.JPG', hanoi),
      photoFile('IMG_0002.JPG', harbour),
      photoFile('IMG_0003.JPG', { ...harbour, dateTimeOriginal: '2026:10:14 11:00:00' }),
    ]);

    fireEvent.click(await within(sheet).findByRole('button', { name: 'Add 3 entries' }));

    expect(
      await screen.findByText(
        'Your iPhone is out of space, so Hotshoe stopped. Added 2 entries, 1 without its photo.',
      ),
    ).toBeDefined();
    expect(await listEntries(db)).toHaveLength(2);
  });
});
