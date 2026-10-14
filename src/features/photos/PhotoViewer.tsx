import { useState } from 'react';
import { ShareIcon } from '../../app/icons.tsx';
import { Sheet } from '../../app/Sheet.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { deletePhoto } from '../../db/photos.ts';
import type { Photo } from '../../db/schema.ts';
import { useObjectUrl } from '../../lib/useObjectUrl.ts';

/** Shows one photo large, with Share (for example to save it to Photos) and Remove. */
export function PhotoViewer({
  photo,
  onClose,
}: {
  readonly photo: Photo | null;
  readonly onClose: () => void;
}) {
  return (
    <Sheet open={photo !== null} onClose={onClose} title="Photo">
      {photo && <PhotoView key={photo.id} photo={photo} onClose={onClose} />}
    </Sheet>
  );
}

function PhotoView({ photo, onClose }: { readonly photo: Photo; readonly onClose: () => void }) {
  const db = useDb();
  const url = useObjectUrl(photo.image);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [canShare] = useState(canShareJpeg);

  return (
    <div className="space-y-4">
      {url && (
        <img
          src={url}
          alt="Reference shot for this entry"
          width={photo.width}
          height={photo.height}
          className="h-auto max-h-[60dvh] w-full rounded-xl object-contain"
        />
      )}
      <div className="grid gap-2">
        {canShare && (
          <button
            type="button"
            onClick={() => {
              const file = new File([photo.image], `hotshoe-${photo.id}.jpg`, {
                type: 'image/jpeg',
              });
              // Dismissing the share sheet rejects the promise, which needs no message.
              navigator.share({ files: [file] }).catch(() => {});
            }}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line font-medium"
          >
            <ShareIcon className="size-5" />
            Share or save to Photos
          </button>
        )}
        {confirmingRemove ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              className="min-h-12 rounded-xl border border-line font-medium"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => {
                void deletePhoto(db, photo.id);
                onClose();
              }}
              className="min-h-12 rounded-xl border border-line font-semibold text-danger-ink"
            >
              Remove photo
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            className="min-h-12 rounded-xl font-medium text-danger-ink"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

/** Whether this device can share a JPEG file, checked once with an empty one. */
function canShareJpeg(): boolean {
  if (typeof navigator.canShare !== 'function') return false;
  const probe = new File([], 'probe.jpg', { type: 'image/jpeg' });
  return navigator.canShare({ files: [probe] });
}
