import type { Entry } from '../../db/schema.ts';
import { describeAccuracy, isWeakFix } from './capture.ts';

/**
 * An entry's accuracy, green when it met the target and amber when it fell short. Unknown
 * accuracy, with nothing to judge, is neither.
 */
export function AccuracyPill({
  entry,
  targetM,
}: {
  readonly entry: Pick<Entry, 'accuracyM' | 'origin'>;
  readonly targetM: number;
}) {
  const tone =
    entry.accuracyM === null
      ? { pill: 'bg-surface text-muted ring-1 ring-line', dot: 'bg-muted' }
      : isWeakFix(entry.accuracyM, targetM)
        ? { pill: 'bg-warning text-on-warning', dot: 'bg-accent' }
        : { pill: 'bg-good/15 text-good-ink', dot: 'bg-good' };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-sm tabular-nums ${tone.pill}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${tone.dot}`} />
      {describeAccuracy(entry)}
    </span>
  );
}
