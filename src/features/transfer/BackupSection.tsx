import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Sheet } from '../../app/Sheet.tsx';
import { holdUpdates } from '../../app/updates.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { StorageFullError } from '../../db/errors.ts';
import { formatBytes, formatCount, formatDeviceTime } from '../../lib/format.ts';
import { saveFile } from '../../lib/share.ts';
import type { CreatedBackup, ReadBackup, RestoreMode, RestorePreview } from './backup.ts';
import { describePending, recordBackup, useBackupStatus } from './backupStatus.ts';

const loadBackup = () => import('./backup.ts');

type MakeState =
  | { readonly step: 'idle' }
  | { readonly step: 'making' }
  | { readonly step: 'ready'; readonly backup: CreatedBackup }
  | { readonly step: 'saved' };

export function BackupSection() {
  const db = useDb();
  const status = useBackupStatus();
  const pendingText = status ? describePending(status) : null;
  const includeId = useId();
  const [includePhotos, setIncludePhotos] = useState(true);
  const [make, setMake] = useState<MakeState>({ step: 'idle' });
  const [error, setError] = useState<string | null>(null);

  async function makeBackup() {
    setError(null);
    setMake({ step: 'making' });
    const release = holdUpdates();
    try {
      const { createBackup } = await loadBackup();
      setMake({ step: 'ready', backup: await createBackup(db, { includePhotos }) });
    } catch {
      setMake({ step: 'idle' });
      setError("Couldn't make the backup. Try again.");
    } finally {
      release();
    }
  }

  // A second tap shares the file: iOS only opens the share sheet straight from a tap, and making
  // a large backup can take longer than it allows.
  async function save(backup: CreatedBackup) {
    setError(null);
    const release = holdUpdates();
    try {
      const result = await saveFile(backup.file);
      if (result === 'cancelled') return;
      await recordBackup(db, backup);
      setMake({ step: 'saved' });
    } catch {
      setError("Couldn't share the backup. Try again.");
    } finally {
      release();
    }
  }

  return (
    <section aria-labelledby="backup-heading" className="space-y-3">
      <h2 id="backup-heading" className="font-semibold text-lg">
        Backup
      </h2>
      <p className="text-muted text-sm">
        Hotshoe keeps everything on this iPhone only, and deleting the app deletes it all. Save a
        backup somewhere safe, such as iCloud Drive, now and then.
      </p>
      {status && (
        <p className="text-sm">
          {status.lastBackupAt === null
            ? 'No backup yet.'
            : `Last backup: ${formatDeviceTime(status.lastBackupAt)}.`}
          {pendingText !== null && ` ${pendingText}`}
        </p>
      )}

      <div className="space-y-3 rounded-2xl bg-raised p-4 ring-1 ring-line">
        <label htmlFor={includeId} className="flex min-h-11 items-start gap-3">
          <input
            id={includeId}
            type="checkbox"
            checked={includePhotos}
            disabled={make.step === 'making'}
            onChange={(event) => {
              setIncludePhotos(event.target.checked);
              setMake({ step: 'idle' });
            }}
            className="mt-0.5 size-5 shrink-0 accent-accent-ink"
          />
          <span>
            Include photos
            <span className="block text-muted text-sm">
              Photos taken in Hotshoe aren't in your Photos app, so this is their only copy.
            </span>
          </span>
        </label>

        {make.step === 'ready' ? (
          <div className="space-y-2">
            <p className="text-sm">
              Backup ready: {make.backup.entries} {make.backup.entries === 1 ? 'entry' : 'entries'}
              {make.backup.photos > 0 &&
                `, ${make.backup.photos} ${make.backup.photos === 1 ? 'photo' : 'photos'}`}
              , {formatBytes(make.backup.file.size)}.
            </p>
            <button
              type="button"
              onClick={() => void save(make.backup)}
              className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent"
            >
              Save or share backup
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void makeBackup()}
            disabled={make.step === 'making'}
            className="min-h-12 w-full rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-60"
          >
            {make.step === 'making' ? 'Making backup…' : 'Make backup'}
          </button>
        )}
        <p role="status" className="text-sm">
          {make.step === 'saved' ? 'Backup saved.' : ''}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}

      <RestoreControl />
    </section>
  );
}

type RestoreState =
  | { readonly step: 'idle' }
  | { readonly step: 'reading' }
  | { readonly step: 'preview'; readonly backup: ReadBackup; readonly preview: RestorePreview }
  | { readonly step: 'restoring' }
  | { readonly step: 'done'; readonly message: string };

function RestoreControl() {
  const db = useDb();
  const input = useRef<HTMLInputElement>(null);
  const releaseHold = useRef<(() => void) | null>(null);
  const [state, setState] = useState<RestoreState>({ step: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const release = useCallback(() => {
    releaseHold.current?.();
    releaseHold.current = null;
  }, []);

  useEffect(() => {
    const element = input.current;
    element?.addEventListener('cancel', release);
    return () => {
      element?.removeEventListener('cancel', release);
      release();
    };
  }, [release]);

  function choose() {
    setError(null);
    release();
    releaseHold.current = holdUpdates();
    input.current?.click();
  }

  async function read(file: File) {
    setState({ step: 'reading' });
    try {
      const { readBackup, previewRestore } = await loadBackup();
      const backup = readBackup(new Uint8Array(await file.arrayBuffer()));
      setState({ step: 'preview', backup, preview: await previewRestore(db, backup) });
    } catch (caught) {
      setState({ step: 'idle' });
      setError(
        caught instanceof Error && caught.name === 'BackupError'
          ? caught.message
          : "That file couldn't be read.",
      );
    } finally {
      release();
    }
  }

  async function restore(backup: ReadBackup, mode: RestoreMode) {
    setState({ step: 'restoring' });
    const hold = holdUpdates();
    try {
      const { restoreBackup } = await loadBackup();
      const result = await restoreBackup(db, backup, mode);
      setState({
        step: 'done',
        message:
          result.entries === 0 && result.photos === 0
            ? 'Everything in the backup is already on this iPhone.'
            : `Restored ${formatCount(result.entries, 'entry', 'entries')} and ${formatCount(result.photos, 'photo', 'photos')}.`,
      });
    } catch (caught) {
      setState({ step: 'idle' });
      setError(
        caught instanceof StorageFullError
          ? 'This iPhone is out of space, so nothing was restored.'
          : "Couldn't restore the backup. Nothing was changed.",
      );
    } finally {
      hold();
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={choose}
        disabled={state.step === 'reading' || state.step === 'restoring'}
        className="min-h-12 w-full rounded-xl border border-line bg-raised font-medium disabled:opacity-60"
      >
        {state.step === 'reading' ? 'Reading backup…' : 'Restore from a backup'}
      </button>
      <input
        ref={input}
        type="file"
        accept=".zip,.json,application/zip,application/json"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void read(file);
          else release();
        }}
      />
      <p role="status" className="text-sm">
        {state.step === 'done' ? state.message : state.step === 'restoring' ? 'Restoring…' : ''}
      </p>
      {error && (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      )}

      <Sheet
        open={state.step === 'preview'}
        onClose={() => setState({ step: 'idle' })}
        title="Restore backup"
      >
        {state.step === 'preview' && (
          <RestoreForm
            preview={state.preview}
            onRestore={(mode) => void restore(state.backup, mode)}
            onCancel={() => setState({ step: 'idle' })}
          />
        )}
      </Sheet>
    </div>
  );
}

function RestoreForm({
  preview,
  onRestore,
  onCancel,
}: {
  readonly preview: RestorePreview;
  readonly onRestore: (mode: RestoreMode) => void;
  readonly onCancel: () => void;
}) {
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-4">
      <p>
        This backup has {formatCount(preview.entries, 'entry', 'entries')},{' '}
        {formatCount(preview.trips, 'trip', 'trips')}, and{' '}
        {formatCount(preview.photos, 'photo', 'photos')}.
        {preview.alreadyPresent > 0 &&
          ` ${formatCount(preview.alreadyPresent, 'entry is', 'entries are')} already on this iPhone.`}
      </p>
      <fieldset className="space-y-1">
        <legend className="mb-1 font-medium text-sm">How to restore</legend>
        {(
          [
            [
              'merge',
              'Add to what’s here',
              'Keeps everything on this iPhone. Where an entry is in both, the more recently edited copy wins.',
            ],
            [
              'replace',
              'Replace everything',
              'Deletes the entries, trips, and photos on this iPhone, then restores the backup.',
            ],
          ] as const
        ).map(([value, title, detail]) => (
          <label
            key={value}
            className="flex min-h-12 items-start gap-3 rounded-xl px-3 py-2 has-checked:bg-surface"
          >
            <input
              type="radio"
              name="restore-mode"
              checked={mode === value}
              onChange={() => {
                setMode(value);
                setConfirming(false);
              }}
              className="mt-0.5 size-5 shrink-0 accent-accent-ink"
            />
            <span>
              {title}
              <span className="block text-muted text-sm">{detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {confirming ? (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-sm">Delete everything on this iPhone and restore the backup?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-12 rounded-xl border border-line font-medium"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => onRestore('replace')}
              className="min-h-12 rounded-xl border border-line font-semibold text-danger-ink"
            >
              Replace
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 rounded-xl border border-line font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => (mode === 'replace' ? setConfirming(true) : onRestore('merge'))}
            className="min-h-12 rounded-xl bg-accent font-semibold text-on-accent"
          >
            Restore
          </button>
        </div>
      )}
    </div>
  );
}
