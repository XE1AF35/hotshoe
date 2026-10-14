import type { Entry } from '../../db/schema.ts';
import type { CoordFormat } from '../../lib/coords.ts';
import { formatCoords } from '../../lib/coords.ts';
import { formatAccuracy, formatLoggedTime } from '../../lib/format.ts';
import { PhotoStrip } from '../photos/PhotoStrip.tsx';
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

  return (
    <section
      aria-labelledby="entry-card-heading"
      className="space-y-4 rounded-2xl bg-raised p-4 shadow-sm ring-1 ring-line"
    >
      <div className="space-y-1">
        <h2 id="entry-card-heading" className="font-medium text-muted text-sm">
          {heading}
        </h2>
        <p className="font-mono text-lg tabular-nums">{formatCoords(entry, coordFormat)}</p>
        <p className="text-muted text-sm">
          {formatLoggedTime(entry.loggedAt, entry)} · {formatAccuracy(entry.accuracyM)}
          {weak && <span className="font-medium text-accent-ink"> · weak fix</span>}
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
