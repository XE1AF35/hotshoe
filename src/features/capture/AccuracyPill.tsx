import { formatAccuracy } from '../../lib/format.ts';

/** An entry's accuracy, green when it met the target and amber when it fell short. */
export function AccuracyPill({
  accuracyM,
  targetM,
}: {
  readonly accuracyM: number;
  readonly targetM: number;
}) {
  const met = accuracyM <= targetM;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-sm tabular-nums ${
        met ? 'bg-good/15 text-good-ink' : 'bg-warning text-on-warning'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${met ? 'bg-good' : 'bg-accent'}`}
      />
      {formatAccuracy(accuracyM)}
    </span>
  );
}
