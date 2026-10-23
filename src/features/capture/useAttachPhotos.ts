import { type Dispatch, useEffect, useState } from 'react';
import { useDb } from '../../db/DbProvider.tsx';
import { useSettings } from '../../db/SettingsProvider.tsx';
import type { EntryId } from '../../db/schema.ts';
import { attachPhotos, attachProblemMessage } from '../photos/attach.ts';
import type { CaptureEvent, CaptureState } from './capture.ts';

/**
 * Attaches the photos handed over to a saved entry, and says how it went. The message belongs to
 * that entry, so it goes once the next Log starts.
 */
export function useAttachPhotos(
  state: CaptureState,
  dispatch: Dispatch<CaptureEvent>,
): string | null {
  const db = useDb();
  const { photoQuality } = useSettings();
  const [message, setMessage] = useState<{ entryId: EntryId; text: string | null } | null>(null);

  useEffect(() => {
    if (state.status !== 'saved' || state.photos.length === 0) return;
    const { entryId, photos: files } = state;
    dispatch({ type: 'photosAttaching', files });
    setMessage({ entryId, text: 'Adding photo…' });
    attachPhotos(db, entryId, files, photoQuality, 'camera')
      .then((result) => setMessage({ entryId, text: attachProblemMessage(result.problem) }))
      .catch(() => setMessage({ entryId, text: "Couldn't add the photo." }));
  }, [state, dispatch, db, photoQuality]);

  return state.status === 'saved' && message?.entryId === state.entryId ? message.text : null;
}
