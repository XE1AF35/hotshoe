import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { holdUpdates } from '../../app/updates.ts';
import { useDb } from '../../db/DbProvider.tsx';
import type { CameraClock } from '../../db/schema.ts';
import { saveFile } from '../../lib/share.ts';
// Imported up front, not lazily, because the live read has to start as soon as the hook does.
import {
  buildExport,
  type CameraTimeChoice,
  type CreatedExport,
  cameraClockFor,
  type ExportScope,
  readExportSource,
} from './exportFile.ts';
import type { ExportFormat } from './formats.ts';

/**
 * An export file made ahead of the tap that shares it: iOS only opens the share sheet straight
 * from a tap, so there is no time to read the database in between. The rows are read live, so the
 * file is remade whenever anything it holds changes, or the format or camera time choice does.
 */
export function usePreparedExport(
  format: ExportFormat,
  scope: ExportScope,
  cameraTime: CameraTimeChoice = null,
): {
  readonly ready: CreatedExport | null;
  /** The clock the file can be matched to, so the choice is only offered when there is one. */
  readonly cameraClock: CameraClock | null;
  readonly message: string | null;
  readonly error: string | null;
  readonly share: () => Promise<void>;
} {
  const db = useDb();
  // A picked set is a new array on every render, so it is compared by its ids.
  const scopeKey = typeof scope === 'object' ? scope.entryIds.join(',') : scope;
  // Undefined while loading, null when the read failed.
  const source = useLiveQuery(
    () => readExportSource(db, scope).catch(() => null),
    // scopeKey stands in for scope.
    [db, scopeKey],
  );
  // Callers pass a new object each render, so the choice is memoised by its parts.
  const zone = cameraTime?.softwareUtcOffsetMin ?? null;
  const matchCamera = cameraTime !== null;
  // Undefined while loading, null when the read or the build failed.
  const ready = useMemo(() => {
    if (!source) return source;
    try {
      return buildExport(source, {
        format,
        cameraTime: matchCamera ? { softwareUtcOffsetMin: zone } : null,
      });
    } catch {
      return null;
    }
  }, [source, format, matchCamera, zone]);
  // What sharing said, kept with the file it was about so a remade file starts afresh.
  const [outcome, setOutcome] = useState<{
    readonly sharedFile: CreatedExport;
    readonly message: string | null;
    readonly error: string | null;
  } | null>(null);
  const readyOutcome = ready && outcome?.sharedFile === ready ? outcome : null;

  async function share() {
    if (!ready) return;
    setOutcome(null);
    const release = holdUpdates();
    try {
      const result = await saveFile(ready.file);
      setOutcome({
        sharedFile: ready,
        message: result === 'cancelled' ? null : `Exported ${ready.file.name}.`,
        error: null,
      });
    } catch {
      setOutcome({
        sharedFile: ready,
        message: null,
        error: "Couldn't share the export. Try again.",
      });
    } finally {
      release();
    }
  }

  return {
    ready: ready ?? null,
    cameraClock: source ? cameraClockFor(source, format) : null,
    message: readyOutcome?.message ?? null,
    error:
      ready === null ? "Couldn't prepare the export. Try again." : (readyOutcome?.error ?? null),
    share,
  };
}
