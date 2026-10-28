import type { Entry } from '../../db/schema.ts';
import type { CoordStyle } from '../../lib/coords.ts';
import { formatLoggedTime } from '../../lib/format.ts';
import { PhotoStrip } from '../photos/PhotoStrip.tsx';
import { AccuracyPill } from './AccuracyPill.tsx';
import { CoordLines } from './CoordLines.tsx';
import { CopyCoordsButton } from './CopyCoordsButton.tsx';
import { isWeakFix, looksImprecise } from './capture.ts';
import { QuickFields } from './QuickFields.tsx';

export function EntryCard({
  entry,
  coordStyle,
  accuracyTargetM,
  heading,
}: {
  readonly entry: Entry;
  readonly coordStyle: CoordStyle;
  readonly accuracyTargetM: number;
  readonly heading: string;
}) {
  const weak = isWeakFix(entry.accuracyM, accuracyTargetM);

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
        <CoordLines coords={entry} style={coordStyle} className="font-semibold text-2xl" />
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted text-sm">
          <AccuracyPill entry={entry} targetM={accuracyTargetM} />
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
      <CopyCoordsButton coords={entry} style={coordStyle} />
      <QuickFields entry={entry} />
      <PhotoStrip entryId={entry.id} />
    </section>
  );
}
