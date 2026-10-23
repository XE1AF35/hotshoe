import { type ReactNode, useEffect, useState } from 'react';
import { CameraIcon, CheckIcon, CloseIcon, PinIcon } from '../../app/icons.tsx';
import { ScreenHeader } from '../../app/ScreenHeader.tsx';
import { useHoldUpdates } from '../../app/updates.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { useLatestEntry, useSettings } from '../../db/hooks.ts';
import type { Entry } from '../../db/schema.ts';
import { coordStyleOf, type Settings } from '../../db/settings.ts';
import { formatAccuracy } from '../../lib/format.ts';
import { attachPhotos, attachProblemMessage } from '../photos/attach.ts';
import { usePhotoInputs } from '../photos/usePhotoInputs.tsx';
import { BackupReminder } from '../transfer/BackupReminder.tsx';
import { ActiveTripPicker } from '../trips/ActiveTripPicker.tsx';
import { CaptureProblem } from './CaptureProblem.tsx';
import { type CaptureState, fixProgress } from './capture.ts';
import { EntryCard } from './EntryCard.tsx';
import { useCapture } from './useCapture.ts';

export function LogScreen() {
  const settings = useSettings();
  const latest = useLatestEntry();

  return (
    <section aria-labelledby="screen-title" className="flex flex-1 flex-col gap-6">
      <ScreenHeader title="Log">
        <ActiveTripPicker />
      </ScreenHeader>
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
  const db = useDb();
  const capture = useCapture({ settings });
  const { state } = capture;
  const justSaved = state.status === 'saved' && latest?.id === state.entryId;

  // Photos from "Log with photo" wait here until their entry is saved. If the fix fails they keep
  // waiting for the next successful log, since camera photos taken here are not in Photos.
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const camera = usePhotoInputs((files) => setPendingPhotos((waiting) => [...waiting, ...files]));
  useHoldUpdates(pendingPhotos.length > 0);

  const savedEntryId = state.status === 'saved' ? state.entryId : null;
  useEffect(() => {
    if (savedEntryId === null || pendingPhotos.length === 0) return;
    const files = pendingPhotos;
    setPendingPhotos([]);
    setPhotoMessage('Adding photo…');
    attachPhotos(db, savedEntryId, files, settings.photoQuality, 'camera')
      .then((result) => setPhotoMessage(attachProblemMessage(result.problem)))
      .catch(() => setPhotoMessage("Couldn't add the photo."));
  }, [savedEntryId, pendingPhotos, db, settings.photoQuality]);

  function startWithPhoto() {
    setPhotoMessage(null);
    capture.start();
    camera.openCamera();
  }

  return (
    <>
      <BackupReminder />
      {state.status === 'failed' && <CaptureProblem reason={state.reason} />}
      {pendingPhotos.length > 0 && state.status !== 'locating' && state.status !== 'saving' && (
        <p role="status" className="rounded-2xl bg-warning p-4 text-on-warning text-sm">
          Your photo is waiting. Tap Log location and it will be added to that entry.
        </p>
      )}
      {photoMessage && (
        <p role="status" className="text-sm">
          {photoMessage}
        </p>
      )}

      {latest ? (
        <EntryCard
          entry={latest}
          coordStyle={coordStyleOf(settings)}
          accuracyTargetM={settings.accuracyTargetM}
          heading={justSaved ? 'Logged' : 'Last logged'}
        />
      ) : (
        <p className="text-muted">
          Tap the button each time you take a photo. Hotshoe records where you are, ready to copy
          into a photo site or export for your photo software later.
        </p>
      )}

      {/* The controls sit at the bottom, within reach of a thumb. */}
      <div className="mt-auto">
        <CaptureControls
          state={state}
          targetM={settings.accuracyTargetM}
          onStart={capture.start}
          onStartWithPhoto={startWithPhoto}
          onAccept={capture.accept}
          onCancel={capture.cancel}
        />
      </div>
      {camera.inputs}
    </>
  );
}

function CaptureControls({
  state,
  targetM,
  onStart,
  onStartWithPhoto,
  onAccept,
  onCancel,
}: {
  readonly state: CaptureState;
  readonly targetM: number;
  readonly onStart: () => void;
  readonly onStartWithPhoto: () => void;
  readonly onAccept: () => void;
  readonly onCancel: () => void;
}) {
  const busy = state.status === 'locating' || state.status === 'saving';

  return (
    <div className="space-y-4">
      {/* The accuracy changes several times a second, so screen readers hear only the stage. */}
      <p aria-hidden="true" className="min-h-6 text-center text-muted text-sm">
        {statusText(state, targetM)}
      </p>
      <p role="status" className="sr-only">
        {spokenStatus(state)}
      </p>

      {/*
       * Laid out like a camera: the shutter in the middle, smaller controls either side. The
       * circles keep their size while the labels grow with the text size setting and wrap.
       */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
        {busy ? (
          <>
            <SideButton onClick={onCancel} disabled={state.status === 'saving'} label="Cancel">
              <CloseIcon className="size-6" />
            </SideButton>
            <AccuracyDial state={state} targetM={targetM} />
            <SideButton
              onClick={onAccept}
              disabled={state.status !== 'locating' || state.best === null}
              label="Use this fix"
              emphasis
            >
              <CheckIcon className="size-6" />
            </SideButton>
          </>
        ) : (
          <>
            <SideButton onClick={onStartWithPhoto} label="Log with photo">
              <CameraIcon className="size-6" />
            </SideButton>
            <button
              type="button"
              onClick={onStart}
              className="group flex min-w-0 flex-col items-center gap-2 text-center font-semibold"
            >
              <span className="flex size-[96px] items-center justify-center rounded-full border-4 border-accent p-1">
                <span className="flex size-full items-center justify-center rounded-full bg-accent text-on-accent shadow-md group-active:scale-90 motion-safe:transition-transform">
                  <PinIcon className="size-9" />
                </span>
              </span>
              Log location
            </button>
            <span />
          </>
        )}
      </div>
    </div>
  );
}

/** A round button with its label underneath, beside the shutter. */
function SideButton({
  onClick,
  disabled = false,
  label,
  emphasis = false,
  children,
}: {
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly label: string;
  readonly emphasis?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex min-w-0 flex-col items-center gap-2 pt-4 text-center font-medium text-sm disabled:opacity-50"
    >
      <span
        className={`flex size-[64px] shrink-0 items-center justify-center rounded-full group-active:scale-90 motion-safe:transition-transform ${
          emphasis ? 'bg-accent text-on-accent' : 'border border-line bg-raised'
        }`}
      >
        {children}
      </span>
      {label}
    </button>
  );
}

/**
 * A ring that fills as the fix closes in on the accuracy target, like a lens finding focus. It is
 * decorative: the status line says the same in words.
 */
function AccuracyDial({
  state,
  targetM,
}: {
  readonly state: Extract<CaptureState, { status: 'locating' | 'saving' }>;
  readonly targetM: number;
}) {
  const accuracyM = state.status === 'saving' ? state.fix.accuracyM : state.best?.accuracyM;
  const progress = accuracyM === undefined ? 0 : fixProgress(accuracyM, targetM);
  const reached = progress >= 1;

  return (
    <div aria-hidden="true" className="flex flex-col items-center gap-2 font-semibold">
      <div className="relative size-[96px]">
        <svg
          viewBox="0 0 96 96"
          aria-hidden="true"
          focusable="false"
          className="-rotate-90 size-full"
        >
          <circle
            cx="48"
            cy="48"
            r="44"
            fill="none"
            strokeWidth="6"
            className={`stroke-line ${accuracyM === undefined ? 'motion-safe:animate-pulse' : ''}`}
          />
          <circle
            cx="48"
            cy="48"
            r="44"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1 - progress}
            className={`${reached ? 'stroke-good' : 'stroke-accent'} motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm tabular-nums">
          {accuracyM === undefined ? '…' : formatAccuracy(accuracyM)}
        </span>
      </div>
      {state.status === 'saving' ? 'Saving' : 'Locating'}
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
