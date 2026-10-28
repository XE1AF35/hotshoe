import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotshoeDb } from '../../db/database.ts';
import { addEntry, listEntries } from '../../db/entries.ts';
import { StorageFullError } from '../../db/errors.ts';
import * as photosRepo from '../../db/photos.ts';
import { listPhotos } from '../../db/photos.ts';
import type { Entry } from '../../db/schema.ts';
import { getSettings, setSetting } from '../../db/settings.ts';
import { addTrip, setActiveTrip } from '../../db/trips.ts';
import { offsetOnlyZone } from '../../lib/time.ts';
import { createTestDb, newEntryInput, newPhotoInput } from '../../test/db.ts';
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

// MapLibre needs WebGL, which jsdom-style environments lack. This stands in for the pin map: it
// says where it opened and drops a pin on a tap. The real map is covered in map.spec.ts.
vi.mock('../map/PinMap.tsx', () => ({
  default: ({
    center,
    onPin,
  }: {
    readonly center: { readonly lat: number; readonly lon: number } | null;
    readonly onPin: (pin: { lat: number; lon: number }) => void;
  }) => (
    <div>
      <p>Opened at {center ? `${center.lat}, ${center.lon}` : 'the whole world'}</p>
      <button type="button" onClick={() => onPin({ lat: -36.8406, lon: 174.7664 })}>
        Drop pin at the ferry terminal
      </button>
    </div>
  ),
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
  renderWithDb(db, <LogScreen />);
  // The file input that the tap opens, as the photo library would.
  let opened: HTMLInputElement | null = null;
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement,
  ) {
    opened = this;
  });
  fireEvent.click(await screen.findByRole('button', { name: 'From photos' }));
  click.mockRestore();
  if (!opened) throw new Error('From photos opened no input');
  fireEvent.change(opened, { target: { files } });
  return screen.findByRole('dialog', { name: 'From photos' });
}

/** Shot in Auckland on 14 October 2026, with no location. */
function shotAt(time: string): ExifFields {
  return { dateTimeOriginal: `2026:10:14 ${time}`, offsetTimeOriginal: '+13:00' };
}

async function openPinSheet(sheet: HTMLElement, name: string) {
  fireEvent.click(await within(sheet).findByRole('button', { name: `Place on map for ${name}` }));
  return screen.findByRole('dialog', { name: 'Place on map' });
}

/** Opens the map for a row and closes it again, saying where it opened. */
async function mapOpenedAt(sheet: HTMLElement, name: string) {
  const pinSheet = await openPinSheet(sheet, name);
  const text = (await within(pinSheet).findByText(/Opened at/)).textContent;
  fireEvent.click(within(pinSheet).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Place on map' })).toBeNull());
  return text;
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

  it('places a photo with no location by dropping a pin, after asking to load the map', async () => {
    const db = createTestDb();
    const sheet = await pick(db, [photoFile('IMG_0001.JPG', shotAt('10:40:00'))]);

    const pinSheet = await openPinSheet(sheet, 'IMG_0001.JPG');
    expect(within(pinSheet).queryByRole('button', { name: /Drop pin/ })).toBeNull();
    const placeHere = within(pinSheet).getByRole('button', { name: 'Place here' });
    expect(placeHere).toHaveProperty('disabled', true);

    fireEvent.click(within(pinSheet).getByRole('button', { name: 'Load map' }));
    fireEvent.click(await within(pinSheet).findByRole('button', { name: /Drop pin/ }));
    fireEvent.click(placeHere);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Place on map' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'From photos' })).toBe(sheet);
    within(sheet).getByRole('checkbox', { name: /IMG_0001.*Placed by hand/ });
    expect(within(sheet).getByLabelText('Coordinates for IMG_0001.JPG')).toHaveProperty(
      'value',
      '-36.840600, 174.766400',
    );
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add 1 entry' }));

    await screen.findByText('Added 1 entry.');
    expect(await listEntries(db)).toEqual([
      expect.objectContaining({
        origin: 'placed',
        lat: -36.8406,
        lon: 174.7664,
        accuracyM: null,
        altitudeM: null,
      }),
    ]);
  });

  it('leaves a photo unplaced when the map is closed without placing it', async () => {
    const db = createTestDb();
    await setSetting(db, 'mapLoadsAutomatically', true);
    const sheet = await pick(db, [photoFile('IMG_0001.JPG', shotAt('10:40:00'))]);

    const pinSheet = await openPinSheet(sheet, 'IMG_0001.JPG');
    // Set to load without asking, so there is no Load map button.
    expect(within(pinSheet).queryByRole('button', { name: 'Load map' })).toBeNull();
    fireEvent.click(await within(pinSheet).findByRole('button', { name: /Drop pin/ }));
    within(pinSheet).getByText('Pin at -36.840600, 174.766400');
    fireEvent.click(within(pinSheet).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Place on map' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'From photos' })).toBe(sheet);
    within(sheet).getByRole('checkbox', { name: /IMG_0001.*No location/ });
    expect(within(sheet).getByRole('button', { name: 'Add 1 entry' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('remembers to load the map without asking when that is ticked', async () => {
    const db = createTestDb();
    const sheet = await pick(db, [photoFile('IMG_0001.JPG', shotAt('10:40:00'))]);

    const pinSheet = await openPinSheet(sheet, 'IMG_0001.JPG');
    fireEvent.click(within(pinSheet).getByLabelText('Always load without asking'));
    fireEvent.click(within(pinSheet).getByRole('button', { name: 'Load map' }));

    await within(pinSheet).findByRole('button', { name: /Drop pin/ });
    await waitFor(async () => expect((await getSettings(db)).mapLoadsAutomatically).toBe(true));
  });

  it('opens the map on the nearest photo with a location, placed ones included', async () => {
    const db = createTestDb();
    await setSetting(db, 'mapLoadsAutomatically', true);
    await addEntry(db, newEntryInput({ lat: -41.2865, lon: 174.7762 }));
    const sheet = await pick(db, [
      photoFile('IMG_0000.JPG', shotAt('10:00:00')),
      photoFile('IMG_0001.JPG', harbour),
      photoFile('IMG_0002.JPG', shotAt('10:45:00')),
      photoFile('IMG_0003.JPG', shotAt('10:50:00')),
    ]);
    await within(sheet).findAllByRole('checkbox');
    const harbourCentre = /^Opened at -36\.8484\d*, 174\.7633/;
    expect(await mapOpenedAt(sheet, 'IMG_0000.JPG')).toMatch(harbourCentre);
    expect(await mapOpenedAt(sheet, 'IMG_0003.JPG')).toMatch(harbourCentre);

    fireEvent.change(within(sheet).getByLabelText('Coordinates for IMG_0002.JPG'), {
      target: { value: '-36.9, 174.8' },
    });
    expect(await mapOpenedAt(sheet, 'IMG_0003.JPG')).toBe('Opened at -36.9, 174.8');
  });

  it('opens the map on the last entry when no photo has a location', async () => {
    const db = createTestDb();
    await setSetting(db, 'mapLoadsAutomatically', true);
    await addEntry(db, newEntryInput({ lat: -41.2865, lon: 174.7762 }));
    const sheet = await pick(db, [photoFile('IMG_0001.JPG', shotAt('11:00:00'))]);
    await within(sheet).findByRole('checkbox');

    expect(await mapOpenedAt(sheet, 'IMG_0001.JPG')).toBe('Opened at -41.2865, 174.7762');
  });

  it('opens the map on the whole world when there is nowhere to start', async () => {
    const db = createTestDb();
    await setSetting(db, 'mapLoadsAutomatically', true);
    const sheet = await pick(db, [photoFile('IMG_0001.JPG', shotAt('11:00:00'))]);
    await within(sheet).findByRole('checkbox');

    expect(await mapOpenedAt(sheet, 'IMG_0001.JPG')).toBe('Opened at the whole world');
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

  it('marks a photo already added through From photos and starts it unticked', async () => {
    const db = createTestDb();
    const first = await pick(db, [photoFile('IMG_0001.JPG', harbour)]);
    fireEvent.click(await within(first).findByRole('button', { name: 'Add 1 entry' }));
    await screen.findByText('Added 1 entry.');

    const sheet = await pick(db, [
      photoFile('IMG_0001.JPG', harbour),
      photoFile('IMG_0002.JPG', hanoi),
    ]);

    const again = await within(sheet).findByRole('checkbox', { name: /IMG_0001.*Already added/ });
    expect(again).toHaveProperty('checked', false);
    expect(within(sheet).getByRole('checkbox', { name: /IMG_0002/ })).toHaveProperty(
      'checked',
      true,
    );
    expect(within(sheet).queryByRole('checkbox', { name: /IMG_0002.*Already added/ })).toBeNull();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Add 1 entry' }));
    await screen.findByText('Added 1 entry.');
    expect(await listEntries(db)).toHaveLength(2);
  });

  it('marks a photo taken within a second of one from Log with photo, and adds it if ticked', async () => {
    const db = createTestDb();
    const logged = await addEntry(db, newEntryInput());
    // Log with photo keeps the camera's file date, written just after the shot and here in the
    // next second.
    await photosRepo.addPhoto(
      db,
      newPhotoInput(logged.id, { takenAt: Date.parse('2026-10-13T21:35:13.100Z') }),
    );

    const sheet = await pick(db, [
      photoFile('IMG_0001.JPG', { ...harbour, subSecTimeOriginal: '90' }),
      // Shot two seconds later, and twice in that second, as a burst does.
      photoFile('IMG_0002.JPG', { ...harbour, dateTimeOriginal: '2026:10:14 10:35:15' }),
      photoFile('IMG_0003.JPG', { ...harbour, dateTimeOriginal: '2026:10:14 10:35:15' }),
    ]);

    const again = await within(sheet).findByRole('checkbox', { name: /IMG_0001.*Already added/ });
    expect(again).toHaveProperty('checked', false);
    expect(within(sheet).queryAllByText('Already added')).toHaveLength(1);
    expect(within(sheet).getByRole('button', { name: 'Add 2 entries' })).toBeDefined();

    fireEvent.click(again);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add 3 entries' }));

    await screen.findByText('Added 3 entries.');
    expect(await listEntries(db)).toHaveLength(4);
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
