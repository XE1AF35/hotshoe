import { useState } from 'react';
import { CameraIcon } from '../../app/icons.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { usePhotos, useSettings } from '../../db/hooks.ts';
import type { EntryId, Photo, PhotoId } from '../../db/schema.ts';
import { useObjectUrl } from '../../lib/useObjectUrl.ts';
import { attachPhotos, attachProblemMessage } from './attach.ts';
import { PhotoViewer } from './PhotoViewer.tsx';
import { usePhotoInputs } from './usePhotoInputs.tsx';

/** An entry's photo thumbnails, with buttons to add more from the camera or the library. */
export function PhotoStrip({ entryId }: { readonly entryId: EntryId }) {
  const db = useDb();
  const photos = usePhotos(entryId);
  const settings = useSettings();
  const [openId, setOpenId] = useState<PhotoId | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { openCamera, openLibrary, inputs } = usePhotoInputs(async (files, source) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await attachPhotos(
        db,
        entryId,
        files,
        settings?.photoQuality ?? 'standard',
        source,
      );
      setMessage(attachProblemMessage(result.problem));
    } catch {
      setMessage("Couldn't add the photo. Try again.");
    } finally {
      setBusy(false);
    }
  });

  const open = photos?.find((photo) => photo.id === openId) ?? null;

  return (
    <div className="space-y-2">
      {photos !== undefined && photos.length > 0 && (
        <ul aria-label="Photos" className="flex flex-wrap gap-2">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <Thumbnail
                photo={photo}
                label={`View photo ${index + 1} of ${photos.length}`}
                onOpen={() => setOpenId(photo.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={openCamera}
          disabled={busy}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line font-medium disabled:opacity-50"
        >
          <CameraIcon className="size-5" />
          Take photo
        </button>
        <button
          type="button"
          onClick={openLibrary}
          disabled={busy}
          className="min-h-12 rounded-xl border border-line font-medium disabled:opacity-50"
        >
          Add from library
        </button>
      </div>
      <p role="status" className="text-sm">
        {busy ? 'Adding photo…' : (message ?? '')}
      </p>
      {inputs}
      <PhotoViewer photo={open} onClose={() => setOpenId(null)} />
    </div>
  );
}

function Thumbnail({
  photo,
  label,
  onOpen,
}: {
  readonly photo: Photo;
  readonly label: string;
  readonly onOpen: () => void;
}) {
  const url = useObjectUrl(photo.thumb);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="block size-20 overflow-hidden rounded-lg bg-surface ring-1 ring-line"
    >
      {url && <img src={url} alt="" className="size-full object-cover" />}
    </button>
  );
}
