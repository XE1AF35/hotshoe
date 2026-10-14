import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DbProvider } from '../../db/DbProvider.tsx';
import type { HotshoeDb } from '../../db/database.ts';
import { addEntry, listEntries } from '../../db/entries.ts';
import { listPhotos } from '../../db/photos.ts';
import { processPhoto } from '../../lib/image.ts';
import { createTestDb, newEntryInput } from '../../test/db.ts';
import { installFakeGeolocation } from '../../test/geolocation.ts';
import { LogScreen } from '../capture/LogScreen.tsx';
import { PhotoStrip } from './PhotoStrip.tsx';

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

afterEach(() => {
  vi.mocked(processPhoto).mockClear();
});

function renderWithDb(db: HotshoeDb, ui: React.ReactNode) {
  return render(<DbProvider db={db}>{ui}</DbProvider>);
}

function choosePhoto(input: Element, name = 'shot.jpg') {
  const file = new File(['jpeg'], name, { type: 'image/jpeg', lastModified: 1_700_000_000_000 });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('Log with photo', () => {
  it('logs the location and attaches the camera photo to that entry', async () => {
    const db = createTestDb();
    const gps = installFakeGeolocation();
    const { container } = renderWithDb(db, <LogScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Log with photo' }));
    await waitFor(() => expect(gps.watchers.size).toBe(1));

    // The camera returns before the fix is good enough: the photo waits for the entry.
    const cameraInput = container.querySelector('input[capture]');
    if (!cameraInput) throw new Error('camera input missing');
    choosePhoto(cameraInput);
    act(() => gps.emit(7));

    await waitFor(async () => {
      const [entry] = await listEntries(db);
      expect(entry).toBeDefined();
      expect(await listPhotos(db, entry?.id ?? ('' as never))).toHaveLength(1);
    });
    const [entry] = await listEntries(db);
    const [photo] = await listPhotos(db, entry?.id ?? ('' as never));
    expect(photo).toMatchObject({ source: 'camera', takenAt: 1_700_000_000_000 });
    expect(await screen.findByRole('button', { name: 'View photo 1 of 1' })).toBeDefined();
  });

  it('keeps the photo waiting when the fix fails, and adds it to the next entry', async () => {
    const db = createTestDb();
    const gps = installFakeGeolocation();
    const { container } = renderWithDb(db, <LogScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Log with photo' }));
    await waitFor(() => expect(gps.watchers.size).toBe(1));
    const cameraInput = container.querySelector('input[capture]');
    if (!cameraInput) throw new Error('camera input missing');
    choosePhoto(cameraInput);
    act(() => gps.fail(1));

    expect(await screen.findByText(/Your photo is waiting/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Log location' }));
    await waitFor(() => expect(gps.watchers.size).toBe(1));
    act(() => gps.emit(5));

    await waitFor(async () => {
      const [entry] = await listEntries(db);
      expect(await listPhotos(db, entry?.id ?? ('' as never))).toHaveLength(1);
    });
    expect(screen.queryByText(/Your photo is waiting/)).toBeNull();
  });
});

describe('PhotoStrip', () => {
  it('adds photos from the library and removes one after confirming', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput());
    const { container } = renderWithDb(db, <PhotoStrip entryId={entry.id} />);

    const libraryInput = container.querySelector('input[multiple]');
    if (!libraryInput) throw new Error('library input missing');
    choosePhoto(libraryInput);
    const thumb = await screen.findByRole('button', { name: 'View photo 1 of 1' });
    expect((await listPhotos(db, entry.id))[0]?.source).toBe('library');

    fireEvent.click(thumb);
    const viewer = await screen.findByRole('dialog', { name: 'Photo' });
    fireEvent.click(within(viewer).getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(viewer).getByRole('button', { name: 'Remove photo' }));

    await waitFor(async () => expect(await listPhotos(db, entry.id)).toEqual([]));
  });
});
