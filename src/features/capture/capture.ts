import type { Entry, EntryId } from '../../db/schema.ts';
import { formatAccuracy } from '../../lib/format.ts';

/** One reading from the Geolocation API, reduced to what an entry stores. */
export interface Fix {
  readonly lat: number;
  readonly lon: number;
  readonly accuracyM: number;
  readonly altitudeM: number | null;
  readonly altitudeAccuracyM: number | null;
  /** Epoch ms UTC of the reading. */
  readonly fixAt: number;
}

export type FailReason =
  | 'unsupported'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'storage-full'
  | 'save-error';

type CaptureStep =
  | { readonly status: 'idle' }
  | {
      readonly status: 'locating';
      /** When the button was tapped: the entry's time, closest to the shutter. */
      readonly loggedAt: number;
      readonly best: Fix | null;
      /** A non-permission error seen while waiting; only reported if no fix ever arrives. */
      readonly lastError: 'unavailable' | 'timeout' | null;
    }
  | { readonly status: 'saving'; readonly loggedAt: number; readonly fix: Fix }
  | {
      readonly status: 'saved';
      readonly entryId: EntryId;
      /**
       * Photos handed over to this entry and not yet being attached, including any that arrive
       * after it saved.
       */
      readonly photos: readonly File[];
    }
  | { readonly status: 'failed'; readonly reason: FailReason };

/**
 * Photos from "Log with photo" wait for the next successful save. Camera photos taken in Hotshoe
 * exist nowhere else, so cancelling or a failed fix keeps them waiting.
 */
export type CaptureState = CaptureStep & { readonly waiting: readonly File[] };

export type CaptureEvent =
  | { readonly type: 'start'; readonly at: number; readonly supported: boolean }
  | { readonly type: 'position'; readonly fix: Fix; readonly targetM: number }
  | { readonly type: 'positionError'; readonly code: number }
  | { readonly type: 'accept' }
  | { readonly type: 'timeout' }
  | { readonly type: 'cancel' }
  | { readonly type: 'saved'; readonly entryId: EntryId }
  | { readonly type: 'saveFailed'; readonly reason: 'storage-full' | 'save-error' }
  | { readonly type: 'photosTaken'; readonly files: readonly File[] }
  | { readonly type: 'photosAttaching'; readonly files: readonly File[] };

type StepEvent = Exclude<CaptureEvent, { type: 'saved' | 'photosTaken' | 'photosAttaching' }>;

/** GeolocationPositionError codes, which are fixed by the specification. */
const permissionDenied = 1;
const positionUnavailable = 2;

export const initialCaptureState: CaptureState = { status: 'idle', waiting: [] };

/** Whether a Log is under way: finding a fix or saving it. */
export function isBusy(state: CaptureStep): boolean {
  return state.status === 'locating' || state.status === 'saving';
}

/**
 * The capture flow as a pure function, so every path can be tested without a device.
 *
 * Waiting photos ride along unchanged until the entry saves, when they are handed over to it.
 */
export function captureReducer(state: CaptureState, event: CaptureEvent): CaptureState {
  switch (event.type) {
    case 'saved':
      return state.status === 'saving'
        ? { status: 'saved', entryId: event.entryId, photos: state.waiting, waiting: [] }
        : state;

    case 'photosTaken':
      // The camera can close after a quick fix has already saved: those photos are that entry's.
      return state.status === 'saved'
        ? { ...state, photos: [...state.photos, ...event.files] }
        : { ...state, waiting: [...state.waiting, ...event.files] };

    case 'photosAttaching':
      return state.status === 'saved'
        ? { ...state, photos: state.photos.filter((file) => !event.files.includes(file)) }
        : state;

    default: {
      const next = stepReducer(state, event);
      return next === state ? state : { ...next, waiting: state.waiting };
    }
  }
}

/**
 * Fixes improve over a few seconds, so the best one so far is kept. The entry is saved as soon as
 * a fix is accurate enough, when the person accepts the best fix so far, or at the time limit if
 * any fix has arrived. Errors other than a refused permission are often brief on iOS, so they only
 * count if the time limit passes with no fix at all.
 */
function stepReducer(state: CaptureStep, event: StepEvent): CaptureStep {
  switch (event.type) {
    case 'start':
      if (isBusy(state)) return state;
      return event.supported
        ? { status: 'locating', loggedAt: event.at, best: null, lastError: null }
        : { status: 'failed', reason: 'unsupported' };

    case 'position': {
      if (state.status !== 'locating') return state;
      const best =
        state.best === null || event.fix.accuracyM <= state.best.accuracyM ? event.fix : state.best;
      return best.accuracyM <= event.targetM
        ? { status: 'saving', loggedAt: state.loggedAt, fix: best }
        : { ...state, best };
    }

    case 'positionError':
      if (state.status !== 'locating') return state;
      if (event.code === permissionDenied) return { status: 'failed', reason: 'denied' };
      return {
        ...state,
        lastError: event.code === positionUnavailable ? 'unavailable' : 'timeout',
      };

    case 'accept':
      if (state.status !== 'locating' || state.best === null) return state;
      return { status: 'saving', loggedAt: state.loggedAt, fix: state.best };

    case 'timeout':
      if (state.status !== 'locating') return state;
      return state.best === null
        ? { status: 'failed', reason: state.lastError ?? 'timeout' }
        : { status: 'saving', loggedAt: state.loggedAt, fix: state.best };

    case 'cancel':
      return state.status === 'locating' ? { status: 'idle' } : state;

    case 'saveFailed':
      return state.status === 'saving' ? { status: 'failed', reason: event.reason } : state;
  }
}

export function fixFromPosition(position: GeolocationPosition): Fix {
  const { coords } = position;
  return {
    lat: coords.latitude,
    lon: coords.longitude,
    accuracyM: coords.accuracy,
    altitudeM: coords.altitude,
    altitudeAccuracyM: coords.altitudeAccuracy,
    fixAt: position.timestamp,
  };
}

/** Precise Location turned off gives fixes kilometres wide. Unknown accuracy never looks it. */
export function looksImprecise(accuracyM: number | null): boolean {
  return accuracyM !== null && accuracyM > 1000;
}

/** Less accurate than the target. Unknown accuracy is never weak. */
export function isWeakFix(accuracyM: number | null, targetM: number): boolean {
  return accuracyM !== null && accuracyM > targetM;
}

/** `±8 m`, or words when there is no number: `Placed by hand` or `Accuracy unknown`. */
export function describeAccuracy(entry: Pick<Entry, 'accuracyM' | 'origin'>): string {
  if (entry.origin === 'placed') return 'Placed by hand';
  if (entry.accuracyM === null) return 'Accuracy unknown';
  return formatAccuracy(entry.accuracyM);
}

/**
 * How close a fix is to the accuracy target, from 0 to 1, for the dial on the Log screen. It is
 * the target divided by the accuracy, so ±40 m against a 20 m target shows halfway.
 */
export function fixProgress(accuracyM: number, targetM: number): number {
  if (accuracyM <= targetM) return 1;
  return Math.max(0, Math.min(1, targetM / accuracyM));
}
