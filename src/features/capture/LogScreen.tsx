import { useLatestEntry, useSettings } from '../../db/hooks.ts';
import type { Entry } from '../../db/schema.ts';
import type { Settings } from '../../db/settings.ts';
import { formatAccuracy } from '../../lib/format.ts';
import { ActiveTripPicker } from '../trips/ActiveTripPicker.tsx';
import { CaptureProblem } from './CaptureProblem.tsx';
import type { CaptureState } from './capture.ts';
import { EntryCard } from './EntryCard.tsx';
import { useCapture } from './useCapture.ts';

export function LogScreen() {
  const settings = useSettings();
  const latest = useLatestEntry();

  return (
    <section aria-labelledby="screen-title" className="flex flex-1 flex-col gap-6">
      <h1 id="screen-title" className="font-semibold text-2xl">
        Log
      </h1>
      {settings === undefined || latest === undefined ? null : (
        <LogScreenBody settings={settings} latest={latest} />
      )}
    </section>
  );
}

function LogScreenBody({
  settings,
  latest,
}: {
  readonly settings: Settings;
  readonly latest: Entry | null;
}) {
  const capture = useCapture({ settings });
  const { state } = capture;
  const justSaved = state.status === 'saved' && latest?.id === state.entryId;

  return (
    <>
      <ActiveTripPicker activeTripId={settings.activeTripId} />
      {state.status === 'failed' && <CaptureProblem reason={state.reason} />}

      {latest ? (
        <EntryCard
          entry={latest}
          coordFormat={settings.coordFormat}
          accuracyTargetM={settings.accuracyTargetM}
          heading={justSaved ? 'Logged' : 'Last logged'}
        />
      ) : (
        <p className="text-muted">
          Tap the button each time you take a photo. Hotshoe records where you are, ready to copy
          into Flickr or export for your photo software later.
        </p>
      )}

      {/* The controls sit at the bottom, within reach of a thumb. */}
      <div className="mt-auto">
        <CaptureControls
          state={state}
          compact={latest !== null}
          targetM={settings.accuracyTargetM}
          onStart={capture.start}
          onAccept={capture.accept}
          onCancel={capture.cancel}
        />
      </div>
    </>
  );
}

function CaptureControls({
  state,
  compact,
  targetM,
  onStart,
  onAccept,
  onCancel,
}: {
  readonly state: CaptureState;
  /** Shorter once an entry card shares the screen, so both fit without scrolling. */
  readonly compact: boolean;
  readonly targetM: number;
  readonly onStart: () => void;
  readonly onAccept: () => void;
  readonly onCancel: () => void;
}) {
  const busy = state.status === 'locating' || state.status === 'saving';

  return (
    <div className="space-y-3">
      {/* The accuracy changes several times a second, so screen readers hear only the stage. */}
      <p aria-hidden="true" className="min-h-6 text-center text-muted">
        {statusText(state, targetM)}
      </p>
      <p role="status" className="sr-only">
        {spokenStatus(state)}
      </p>

      {busy ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={state.status === 'saving'}
            className="min-h-14 rounded-2xl border border-line bg-raised font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={state.status !== 'locating' || state.best === null}
            className="min-h-14 rounded-2xl bg-accent font-semibold text-on-accent disabled:opacity-50"
          >
            Use this fix
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStart}
          className={`flex ${compact ? 'min-h-32' : 'min-h-40'} w-full items-center justify-center rounded-3xl bg-accent font-semibold text-2xl text-on-accent shadow-md active:scale-[0.98] motion-safe:transition-transform`}
        >
          Log location
        </button>
      )}
    </div>
  );
}

function statusText(state: CaptureState, targetM: number): string {
  switch (state.status) {
    case 'locating':
      return state.best === null
        ? 'Finding your location…'
        : `Finding your location… ${formatAccuracy(state.best.accuracyM)} so far, aiming for ${formatAccuracy(targetM)}`;
    case 'saving':
      return `Saving (${formatAccuracy(state.fix.accuracyM)})…`;
    case 'saved':
      return 'Location logged.';
    default:
      return '';
  }
}

function spokenStatus(state: CaptureState): string {
  switch (state.status) {
    case 'locating':
      return 'Finding your location';
    case 'saving':
      return 'Saving';
    case 'saved':
      return 'Location logged';
    default:
      return '';
  }
}
