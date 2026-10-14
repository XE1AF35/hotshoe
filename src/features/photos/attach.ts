import type { HotshoeDb } from '../../db/database.ts';
import { StorageFullError } from '../../db/errors.ts';
import { addPhoto } from '../../db/photos.ts';
import type { EntryId, Photo } from '../../db/schema.ts';
import type { PhotoQuality } from '../../db/settings.ts';
import { PhotoReadError, processPhoto } from '../../lib/image.ts';

export interface AttachResult {
  readonly added: number;
  /** Why some photos were not kept, if any were not. */
  readonly problem: 'unreadable' | 'storage-full' | null;
}

/**
 * Processes and stores photos for an entry, one at a time to keep memory low on the phone.
 * Stops at the first storage-full error, since later photos would fail the same way.
 */
export async function attachPhotos(
  db: HotshoeDb,
  entryId: EntryId,
  files: readonly File[],
  quality: PhotoQuality,
  source: Photo['source'],
): Promise<AttachResult> {
  let added = 0;
  let problem: AttachResult['problem'] = null;

  for (const file of files) {
    try {
      const processed = await processPhoto(file, quality);
      await addPhoto(db, { ...processed, entryId, source });
      added += 1;
    } catch (error) {
      if (error instanceof StorageFullError) return { added, problem: 'storage-full' };
      if (error instanceof PhotoReadError) {
        problem = 'unreadable';
        continue;
      }
      throw error;
    }
  }
  return { added, problem };
}

export function attachProblemMessage(problem: AttachResult['problem']): string | null {
  switch (problem) {
    case 'unreadable':
      return "One photo couldn't be read, so it wasn't kept.";
    case 'storage-full':
      return 'Your iPhone is out of space, so the photo wasn’t kept. The location is saved.';
    default:
      return null;
  }
}
