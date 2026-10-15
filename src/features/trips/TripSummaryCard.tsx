import type { ReactNode } from 'react';
import type { TripId } from '../../db/schema.ts';
import { formatAccuracy } from '../../lib/format.ts';
import { formatDayRange, formatDistance } from './summary.ts';
import { useTripSummary } from './useTripSummary.ts';

/** What a trip holds, worked out from its entries as they are now. */
export function TripSummaryCard({
  tripId,
  accuracyTargetM,
}: {
  readonly tripId: TripId;
  readonly accuracyTargetM: number;
}) {
  const summary = useTripSummary(tripId, accuracyTargetM);
  if (summary === undefined) return null;

  return (
    <section aria-labelledby="trip-summary-heading" className="space-y-2">
      <h3 id="trip-summary-heading" className="font-medium text-sm">
        Summary
      </h3>
      {summary.days === null ? (
        <p className="text-muted text-sm">No entries yet.</p>
      ) : (
        <dl className="divide-y divide-line rounded-2xl bg-raised px-4 ring-1 ring-line">
          <Row term="Entries">{summary.entries}</Row>
          <Row term="Photos">{summary.photos}</Row>
          <Row term="Dates">{formatDayRange(summary.days.first, summary.days.last)}</Row>
          <Row term="Days">
            {summary.days.span === summary.days.withEntries
              ? summary.days.span
              : `${summary.days.span}, with entries on ${summary.days.withEntries}`}
          </Row>
          {summary.distanceM !== null && (
            <Row term="Distance">
              {formatDistance(summary.distanceM)}
              <span className="block text-muted text-sm">
                In straight lines between entries, not the route taken.
                {summary.impreciseFixes > 0 &&
                  ` Leaves out ${fixCount(summary.impreciseFixes)} kilometres wide.`}
              </span>
            </Row>
          )}
          {summary.weakFixes > 0 && (
            <Row term="Weak fixes">
              {summary.weakFixes}, less accurate than {formatAccuracy(accuracyTargetM)}
            </Row>
          )}
        </dl>
      )}
    </section>
  );
}

function Row({ term, children }: { readonly term: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 py-2.5">
      <dt className="min-w-24 text-muted">{term}</dt>
      <dd className="min-w-0 flex-1 basis-40 font-medium">{children}</dd>
    </div>
  );
}

function fixCount(count: number): string {
  return count === 1 ? '1 fix' : `${count} fixes`;
}
