import { holdUpdates } from '../../app/updates.ts';
import type { HotshoeDb } from '../../db/database.ts';
import { addEntry } from '../../db/entries.ts';
import { StorageFullError } from '../../db/errors.ts';
import type { TripId } from '../../db/schema.ts';
import type { PhotoQuality } from '../../db/settings.ts';
import { formatCount } from '../../lib/format.ts';
import { attachPhotos } from '../photos/attach.ts';
import { newEntryFromDraft, type PhotoDraft } from './draft.ts';

export interface SaveResult {
  readonly added: number;
  /** Entries kept without their photo, because it couldn't be read or stored. */
  readonly withoutPhoto: number;
  /** Why the batch stopped early, if it did. */
  readonly stopped: 'storage-full' | 'save-error' | null;
}

/**
 * Adds an Entry for each draft, in the order given, and attaches its photo before moving on, so
 * only one photo is in memory at a time. Drafts still missing their time or location are skipped.
 * Stops at the first storage-full error, since later ones would fail the same way.
 */
export async function saveDrafts(
  db: HotshoeDb,
  drafts: readonly PhotoDraft[],
  tripId: TripId | null,
  quality: PhotoQuality,
): Promise<SaveResult> {
  let added = 0;
  let withoutPhoto = 0;
  const release = holdUpdates();

  try {
    for (const draft of drafts) {
      const input = newEntryFromDraft(draft, tripId);
      if (input === null) continue;
      const entry = await addEntry(db, input);
      added += 1;
      const attached = await attachPhotos(
        db,
        entry.id,
        [draft.file],
        quality,
        'library',
        input.loggedAt,
      );
      if (attached.added === 0) withoutPhoto += 1;
      if (attached.problem === 'storage-full') {
        return { added, withoutPhoto, stopped: 'storage-full' };
      }
    }
    return { added, withoutPhoto, stopped: null };
  } catch (error) {
    return {
      added,
      withoutPhoto,
      stopped: error instanceof StorageFullError ? 'storage-full' : 'save-error',
    };
  } finally {
    release();
  }
}

/** `Added 3 entries.`, with why it stopped early and any photos that weren't kept. */
export function saveMessage({ added, withoutPhoto, stopped }: SaveResult): string {
  const reason =
    stopped === 'storage-full'
      ? 'Your iPhone is out of space, so Hotshoe stopped. '
      : stopped === 'save-error'
        ? 'Something went wrong, so Hotshoe stopped. '
        : '';
  const missing = withoutPhoto > 0 ? `, ${withoutPhoto} without its photo` : '';
  return `${reason}Added ${formatCount(added, 'entry', 'entries')}${missing}.`;
}
