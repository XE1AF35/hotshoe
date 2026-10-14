import { CloseIcon } from '../../app/icons.tsx';
import { usePhotos } from '../../db/hooks.ts';
import type { Entry } from '../../db/schema.ts';
import type { CoordFormat } from '../../lib/coords.ts';
import { formatLoggedTime } from '../../lib/format.ts';
import { useObjectUrl } from '../../lib/useObjectUrl.ts';
import { AccuracyPill } from '../capture/AccuracyPill.tsx';
import { CopyCoordsButton } from '../capture/CopyCoordsButton.tsx';

/** The entry tapped on the map, over the bottom of the map so the point stays in view. */
export function MapEntryCard({
  entry,
  coordFormat,
  accuracyTargetM,
  onClose,
}: {
  readonly entry: Entry;
  readonly coordFormat: CoordFormat;
  readonly accuracyTargetM: number;
  readonly onClose: () => void;
}) {
  const photos = usePhotos(entry.id);
  const thumb = useObjectUrl(photos?.[0]?.thumb);

  return (
    <section
      aria-labelledby="map-entry-heading"
      className="absolute inset-x-3 bottom-3 z-10 space-y-3 rounded-2xl bg-raised p-3 shadow-lg ring-1 ring-line"
    >
      <div className="flex items-start gap-3">
        {thumb && (
          <img
            src={thumb}
            alt=""
            className="size-16 shrink-0 rounded-lg object-cover ring-1 ring-line"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="map-entry-heading" className="truncate font-semibold">
            {entry.label ?? 'Untitled'}
          </h2>
          <p className="text-muted text-sm">{formatLoggedTime(entry.loggedAt, entry)}</p>
          <p className="flex flex-wrap items-center gap-2 text-muted text-sm">
            <AccuracyPill accuracyM={entry.accuracyM} targetM={accuracyTargetM} />
            {entry.frame !== null && <span>Frame {entry.frame}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 flex size-11 shrink-0 items-center justify-center rounded-full text-muted"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>
      <CopyCoordsButton coords={entry} format={coordFormat} />
    </section>
  );
}
