import type { Entry } from '../../db/schema.ts';
import type { CoordFormat } from '../../lib/coords.ts';
import { formatCoordParts } from '../../lib/coords.ts';
import { formatLoggedTime } from '../../lib/format.ts';
import { PhotoStrip } from '../photos/PhotoStrip.tsx';
import { AccuracyPill } from './AccuracyPill.tsx';
import { CopyCoordsButton } from './CopyCoordsButton.tsx';
import { looksImprecise } from './capture.ts';
import { QuickFields } from './QuickFields.tsx';

export function EntryCard({
  entry,
  coordFormat,
  accuracyTargetM,
  heading,
}: {
  readonly entry: Entry;
  readonly coordFormat: CoordFormat;
  readonly accuracyTargetM: number;
  readonly heading: string;
}) {
  const weak = entry.accuracyM > accuracyTargetM;
  const [lat, lon] = formatCoordParts(entry, coordFormat);

  return (
    <section
      aria-labelledby="entry-card-heading"
      className="space-y-4 rounded-3xl bg-raised p-4 shadow-sm ring-1 ring-line"
    >
      <div className="viewfinder space-y-2 rounded-xl px-4 py-3">
        <h2
          id="entry-card-heading"
          className="font-semibold text-muted text-xs uppercase tracking-widest"
        >
          {heading}
        </h2>
        {/* One line each, but the hidden comma keeps the text whole for selecting and for tests. */}
        <p className="font-mono font-semibold text-2xl tabular-nums leading-tight">
          <span className="block">
            {lat}
            <span className="sr-only">, </span>
          </span>
          <span className="block">{lon}</span>
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted text-sm">
          <AccuracyPill accuracyM={entry.accuracyM} targetM={accuracyTargetM} />
          {weak && <span className="font-medium text-accent-ink">weak fix</span>}
          <span>{formatLoggedTime(entry.loggedAt, entry)}</span>
        </p>
        {looksImprecise(entry.accuracyM) && (
          <p className="text-accent-ink text-sm">
            This is only accurate to a few kilometres. Check that Precise Location is on (Settings,
            Privacy &amp; Security, Location Services, Safari Websites).
          </p>
        )}
      </div>
      <CopyCoordsButton coords={entry} format={coordFormat} />
      <QuickFields entry={entry} />
      <PhotoStrip entryId={entry.id} />
    </section>
  );
}
