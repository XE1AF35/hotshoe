import { useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from 'react';
import { useHoldUpdates } from '../../app/updates.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { addEntry } from '../../db/entries.ts';
import { StorageFullError } from '../../db/errors.ts';
import { getSetting, type Settings, setSetting } from '../../db/settings.ts';
import { requestPersistence } from '../../lib/storage.ts';
import { captureTimeContext } from '../../lib/time.ts';
import {
  type CaptureState,
  captureReducer,
  fixFromPosition,
  initialCaptureState,
} from './capture.ts';

export interface CaptureOptions {
  readonly settings: Pick<Settings, 'accuracyTargetM' | 'fixTimeoutS'>;
  /** Injected for tests. */
  readonly geolocation?: Geolocation | undefined;
  readonly now?: () => number;
}

export interface Capture {
  readonly state: CaptureState;
  readonly start: () => void;
  readonly accept: () => void;
  readonly cancel: () => void;
}

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

const isVisible = () => document.visibilityState === 'visible';

export function useCapture({
  settings,
  geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation,
  now = Date.now,
}: CaptureOptions): Capture {
  const db = useDb();
  const [state, dispatch] = useReducer(captureReducer, initialCaptureState);
  useHoldUpdates(state.status === 'locating' || state.status === 'saving');
  const visible = useSyncExternalStore(subscribeVisibility, isVisible);
  const { accuracyTargetM, fixTimeoutS } = settings;

  const start = useCallback(() => {
    dispatch({ type: 'start', at: now(), supported: geolocation !== undefined });
  }, [geolocation, now]);
  const accept = useCallback(() => dispatch({ type: 'accept' }), []);
  const cancel = useCallback(() => dispatch({ type: 'cancel' }), []);

  // Watch the position while locating. iOS suspends hidden apps, so the watch stops when the app
  // is hidden and starts afresh, with a fresh time limit, when it comes back.
  const locating = state.status === 'locating';
  useEffect(() => {
    if (!locating || !visible || !geolocation) return;
    const watchId = geolocation.watchPosition(
      (position) =>
        dispatch({ type: 'position', fix: fixFromPosition(position), targetM: accuracyTargetM }),
      (error) => dispatch({ type: 'positionError', code: error.code }),
      { enableHighAccuracy: true, maximumAge: 0 },
    );
    const timer = window.setTimeout(() => dispatch({ type: 'timeout' }), fixTimeoutS * 1000);
    return () => {
      geolocation.clearWatch(watchId);
      window.clearTimeout(timer);
    };
  }, [locating, visible, geolocation, accuracyTargetM, fixTimeoutS]);

  // Save once per capture, even if React runs the effect twice in development.
  const savedFor = useRef<number | null>(null);
  useEffect(() => {
    if (state.status !== 'saving' || savedFor.current === state.loggedAt) return;
    savedFor.current = state.loggedAt;
    const { loggedAt, fix } = state;

    void (async () => {
      const input = { ...fix, ...captureTimeContext(new Date(loggedAt)), loggedAt };
      try {
        // Joins the active trip as it is now, even if another tab changed it since the tap.
        const entry = await addEntry(db, input);
        dispatch({ type: 'saved', entryId: entry.id });
        await askForPersistenceOnce(db);
      } catch (error) {
        dispatch({
          type: 'saveFailed',
          reason: error instanceof StorageFullError ? 'storage-full' : 'save-error',
        });
      }
    })();
  }, [state, db]);

  return { state, start, accept, cancel };
}

/** After the first save, ask iOS to keep the data. Asked once, and the answer is kept for display. */
async function askForPersistenceOnce(db: Parameters<typeof getSetting>[0]): Promise<void> {
  if ((await getSetting(db, 'persistResult')) === 'granted') return;
  await setSetting(db, 'persistResult', await requestPersistence());
}
