import { useEffect, useId, useState } from 'react';
import { Sheet } from '../../app/Sheet.tsx';
import { useDb } from '../../db/DbProvider.tsx';
import { useActiveTrip, useTrips } from '../../db/hooks.ts';
import { useSettings } from '../../db/SettingsProvider.tsx';
import type { TripId } from '../../db/schema.ts';
import { coordStyleOf } from '../../db/settings.ts';
import { type CoordStyle, formatCoords } from '../../lib/coords.ts';
import { formatCount, formatLoggedTime } from '../../lib/format.ts';
import { useObjectUrl } from '../../lib/useObjectUrl.ts';
import { describeAccuracy } from '../capture/capture.ts';
import { TripSelect } from '../trips/TripSelect.tsx';
import { isComplete, type PhotoDraft, readPhotoDraft } from './draft.ts';
import { type SaveResult, saveDrafts } from './save.ts';

interface Row {
  /** Its place in the picked files, which stays the same as rows are reordered. */
  readonly key: number;
  readonly draft: PhotoDraft;
  readonly ticked: boolean;
}

/**
 * Shows what each picked photo's metadata says before anything is saved, and saves the ticked
 * ones as Entries on confirm. The batch lives only here, so closing the sheet drops it.
 */
export function FromPhotosSheet({
  files,
  onDone,
}: {
  readonly files: readonly File[];
  /** Called with what was saved, or null when cancelled. */
  readonly onDone: (result: SaveResult | null) => void;
}) {
  const db = useDb();
  const settings = useSettings();
  const trips = useTrips();
  const activeTrip = useActiveTrip();
  const tripSelectId = useId();
  const [rows, setRows] = useState<readonly Row[] | null>(null);
  const [chosenTrip, setChosenTrip] = useState<TripId | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void Promise.all(files.map((file) => readPhotoDraft(file, deviceZone))).then((drafts) => {
      if (current) {
        setRows(inShotOrder(drafts.map((draft, key) => ({ key, draft, ticked: true }))));
      }
    });
    return () => {
      current = false;
    };
  }, [files]);

  const tripId = chosenTrip === undefined ? (activeTrip?.id ?? null) : chosenTrip;
  const ticked = rows?.filter((row) => row.ticked) ?? [];
  const incomplete = ticked.some(({ draft }) => !isComplete(draft));
  const canConfirm = ticked.length > 0 && !incomplete && !saving;

  function toggle(key: number) {
    setRows(
      (current) =>
        current?.map((row) => (row.key === key ? { ...row, ticked: !row.ticked } : row)) ?? null,
    );
  }

  async function confirm() {
    setSaving(true);
    const drafts = ticked.map((row) => row.draft);
    onDone(await saveDrafts(db, drafts, tripId, settings.photoQuality));
  }

  function cancel() {
    if (!saving) onDone(null);
  }

  return (
    <Sheet open onClose={cancel} title="From photos">
      {rows === null || trips === undefined || activeTrip === undefined ? (
        <p role="status">Reading photos…</p>
      ) : (
        <>
          <ul aria-label="Photos" className="space-y-2">
            {rows.map((row) => (
              <li key={row.key}>
                <DraftRow
                  draft={row.draft}
                  ticked={row.ticked}
                  disabled={saving}
                  coordStyle={coordStyleOf(settings)}
                  onToggle={() => toggle(row.key)}
                />
              </li>
            ))}
          </ul>

          <div className="space-y-1">
            <label htmlFor={tripSelectId} className="font-medium text-sm">
              Trip
            </label>
            <TripSelect id={tripSelectId} trips={trips} value={tripId} onChange={setChosenTrip} />
          </div>

          {incomplete && (
            <p className="text-accent-ink text-sm">
              Untick the photos with no time or location to add the rest.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="min-h-12 rounded-xl border border-line font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={!canConfirm}
              className="min-h-12 rounded-xl bg-accent px-3 font-semibold text-on-accent disabled:opacity-50"
            >
              {saving ? 'Adding…' : `Add ${formatCount(ticked.length, 'entry', 'entries')}`}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/**
 * One photo. The whole row labels its tick, so VoiceOver reads the photo, time, location, and
 * flags together.
 */
function DraftRow({
  draft,
  ticked,
  disabled,
  coordStyle,
  onToggle,
}: {
  readonly draft: PhotoDraft;
  readonly ticked: boolean;
  readonly disabled: boolean;
  readonly coordStyle: CoordStyle;
  readonly onToggle: () => void;
}) {
  const thumb = useObjectUrl(draft.file);
  const { time, location } = draft;

  return (
    <label className="flex min-h-12 items-start gap-3 rounded-xl p-2 has-checked:bg-surface">
      <input
        type="checkbox"
        checked={ticked}
        disabled={disabled}
        onChange={onToggle}
        className="mt-1 size-5 shrink-0 accent-accent-ink"
      />
      <span className="size-16 shrink-0 overflow-hidden rounded-lg bg-surface ring-1 ring-line">
        {thumb && (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5 text-sm">
        <span className="break-all font-medium">{draft.file.name}</span>
        {time.source === 'missing' ? (
          <Flag>No time</Flag>
        ) : (
          <span>{formatLoggedTime(time.at, time.context)}</span>
        )}
        {location === null ? (
          <Flag>No location</Flag>
        ) : (
          <span className="text-muted">
            <span className="font-mono tabular-nums">{formatCoords(location, coordStyle)}</span>{' '}
            {describeAccuracy({ accuracyM: location.accuracyM, origin: 'photo' })}
          </span>
        )}
      </span>
    </label>
  );
}

function Flag({ children }: { readonly children: string }) {
  return (
    <span className="w-fit rounded-full bg-warning px-2 py-0.5 font-medium text-on-warning">
      {children}
    </span>
  );
}

/** Oldest shot first; photos with no time keep their picked order, after the rest. */
function inShotOrder(rows: readonly Row[]): Row[] {
  const at = ({ draft }: Row) =>
    draft.time.source === 'missing' ? Number.POSITIVE_INFINITY : draft.time.at;
  return [...rows].sort((a, b) => (at(a) === at(b) ? 0 : at(a) < at(b) ? -1 : 1));
}
