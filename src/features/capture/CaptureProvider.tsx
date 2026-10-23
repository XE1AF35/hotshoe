import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useHoldUpdates } from '../../app/updates.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { addEntry } from '../../db/entries.ts';
import { StorageFullError } from '../../db/errors.ts';
import { useSettings } from '../../db/SettingsProvider.tsx';
import { getSetting, setSetting } from '../../db/settings.ts';
import { requestPersistence } from '../../lib/storage.ts';
import { captureTimeContext } from '../../lib/time.ts';
import { attachPhotos, attachProblemMessage } from '../photos/attach.ts';
import {
  type CaptureState,
  captureReducer,
  fixFromPosition,
  initialCaptureState,
} from './capture.ts';

export interface Capture {
  /** Includes the photos waiting for the next successful save. */
  readonly state: CaptureState;
  /** How adding the photos to the saved entry went, if there were any. */
  readonly photoMessage: string | null;
  readonly start: () => void;
  readonly accept: () => void;
  readonly cancel: () => void;
  readonly addPhotos: (files: File[]) => void;
}

const CaptureContext = createContext<Capture | null>(null);

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

const isVisible = () => document.visibilityState === 'visible';

/**
 * Runs the capture flow above the tabs, so a Log in progress and the photos waiting for it
 * survive switching tabs. It must sit inside a SettingsProvider.
 */
export function CaptureProvider({
  geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation,
  now = Date.now,
  children,
}: {
  /** Injected for tests. */
  readonly geolocation?: Geolocation | undefined;
  readonly now?: () => number;
  readonly children: ReactNode;
}) {
  const db = useDb();
  const { accuracyTargetM, fixTimeoutS, photoQuality } = useSettings();
  const [state, dispatch] = useReducer(captureReducer, initialCaptureState);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  useHoldUpdates(
    state.status === 'locating' || state.status === 'saving' || state.waiting.length > 0,
  );
  const visible = useSyncExternalStore(subscribeVisibility, isVisible);

  const start = useCallback(() => {
    setPhotoMessage(null);
    dispatch({ type: 'start', at: now(), supported: geolocation !== undefined });
  }, [geolocation, now]);
  const accept = useCallback(() => dispatch({ type: 'accept' }), []);
  const cancel = useCallback(() => dispatch({ type: 'cancel' }), []);
  const addPhotos = useCallback((files: File[]) => dispatch({ type: 'photosTaken', files }), []);

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

  // Attach each photo handed over to the saved entry once, including any that arrive later.
  const attached = useRef(new WeakSet<File>());
  useEffect(() => {
    if (state.status !== 'saved') return;
    const files = state.photos.filter((file) => !attached.current.has(file));
    if (files.length === 0) return;
    for (const file of files) attached.current.add(file);
    setPhotoMessage('Adding photo…');
    attachPhotos(db, state.entryId, files, photoQuality, 'camera')
      .then((result) => setPhotoMessage(attachProblemMessage(result.problem)))
      .catch(() => setPhotoMessage("Couldn't add the photo."));
  }, [state, db, photoQuality]);

  const capture = useMemo(
    () => ({ state, photoMessage, start, accept, cancel, addPhotos }),
    [state, photoMessage, start, accept, cancel, addPhotos],
  );
  return <CaptureContext value={capture}>{children}</CaptureContext>;
}

export function useCapture(): Capture {
  const capture = useContext(CaptureContext);
  if (!capture) throw new Error('useCapture must be used inside a CaptureProvider');
  return capture;
}

/** After the first save, ask iOS to keep the data. Asked once, and the answer is kept for display. */
async function askForPersistenceOnce(db: Parameters<typeof getSetting>[0]): Promise<void> {
  if ((await getSetting(db, 'persistResult')) === 'granted') return;
  await setSetting(db, 'persistResult', await requestPersistence());
}
