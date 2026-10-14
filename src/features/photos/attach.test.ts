import { afterEach, describe, expect, it, vi } from 'vitest';
import { addEntry } from '../../db/entries.ts';
import { StorageFullError } from '../../db/errors.ts';
import * as photosRepo from '../../db/photos.ts';
import { listPhotos } from '../../db/photos.ts';
import { PhotoReadError, processPhoto } from '../../lib/image.ts';
import { createTestDb, jpegBlob, newEntryInput } from '../../test/db.ts';
import { attachPhotos, attachProblemMessage } from './attach.ts';

vi.mock('../../lib/image.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/image.ts')>()),
  processPhoto: vi.fn(),
}));

const processed = (takenAt: number) => ({
  image: jpegBlob(300),
  thumb: jpegBlob(30),
  width: 1600,
  height: 1200,
  takenAt,
});

function file(name: string): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' });
}

afterEach(() => {
  vi.mocked(processPhoto).mockReset();
});

describe('attachPhotos', () => {
  it('processes and stores each photo for the entry', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput());
    vi.mocked(processPhoto)
      .mockResolvedValueOnce(processed(1000))
      .mockResolvedValueOnce(processed(2000));

    const result = await attachPhotos(db, entry.id, [file('a'), file('b')], 'high', 'library');

    expect(result).toEqual({ added: 2, problem: null });
    expect(vi.mocked(processPhoto).mock.calls.map((call) => call[1])).toEqual(['high', 'high']);
    const photos = await listPhotos(db, entry.id);
    expect(photos.map((photo) => [photo.takenAt, photo.source])).toEqual([
      [1000, 'library'],
      [2000, 'library'],
    ]);
  });

  it('skips unreadable photos and keeps the rest', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput());
    vi.mocked(processPhoto)
      .mockRejectedValueOnce(new PhotoReadError('bad'))
      .mockResolvedValueOnce(processed(2000));

    const result = await attachPhotos(db, entry.id, [file('a'), file('b')], 'standard', 'camera');

    expect(result).toEqual({ added: 1, problem: 'unreadable' });
    expect(attachProblemMessage(result.problem)).toContain("couldn't be read");
  });

  it('stops at the first storage-full error', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput());
    vi.mocked(processPhoto).mockResolvedValue(processed(1000));
    const add = vi.spyOn(photosRepo, 'addPhoto').mockRejectedValue(new StorageFullError());

    const result = await attachPhotos(db, entry.id, [file('a'), file('b')], 'standard', 'camera');

    expect(result).toEqual({ added: 0, problem: 'storage-full' });
    expect(add).toHaveBeenCalledTimes(1);
    expect(attachProblemMessage(result.problem)).toContain('The location is saved');
  });
});
