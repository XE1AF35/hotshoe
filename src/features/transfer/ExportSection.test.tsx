import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DbProvider } from '../../db/DbProvider.tsx';
import { addEntry } from '../../db/entries.ts';
import { addPhoto } from '../../db/photos.ts';
import { addTrip, renameTrip } from '../../db/trips.ts';
import { saveFile } from '../../lib/share.ts';
import { createTestDb, jpegBlob, newEntryInput } from '../../test/db.ts';
import { ExportSection } from './ExportSection.tsx';

vi.mock('../../lib/share.ts', () => ({ saveFile: vi.fn(async () => 'shared') }));

afterEach(() => {
  vi.mocked(saveFile).mockClear();
});

/** Taps share and reads the file that was ready, which is handed over within the tap. */
async function sharedText(): Promise<string> {
  vi.mocked(saveFile).mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Save or share export' }));
  const file = vi.mocked(saveFile).mock.lastCall?.[0];
  if (!file) throw new Error('nothing shared');
  return file.text();
}

describe('ExportSection', () => {
  it('remakes the ready file when a trip is renamed or a photo is added', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Waiheke');
    const entry = await addEntry(db, newEntryInput({ tripId: trip.id }));
    render(
      <DbProvider db={db}>
        <ExportSection />
      </DbProvider>,
    );
    fireEvent.click(screen.getByRole('radio', { name: /^CSV/ }));
    await waitFor(async () => expect(await sharedText()).toContain(',Waiheke,'));

    await renameTrip(db, trip.id, 'Rakino');
    await waitFor(async () => expect(await sharedText()).toContain(',Rakino,'));

    const photo = await addPhoto(db, {
      entryId: entry.id,
      takenAt: 1000,
      source: 'camera',
      image: jpegBlob(400),
      thumb: jpegBlob(40),
      width: 4,
      height: 3,
    });
    await waitFor(async () => expect(await sharedText()).toContain(`${photo.id}.jpg`));
  });
});
