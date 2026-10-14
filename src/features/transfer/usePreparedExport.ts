import { useEffect, useState } from 'react';
import { holdUpdates } from '../../app/updates.ts';
import { useDb } from '../../db/DbProvider.tsx';
import { saveFile } from '../../lib/share.ts';
import type { CreatedExport, ExportScope } from './exportFile.ts';
import type { ExportFormat } from './formats.ts';

const loadExporter = () => import('./exportFile.ts');

/**
 * An export file made ahead of the tap that shares it: iOS only opens the share sheet straight
 * from a tap, so there is no time to read the database in between. The file is remade when the
 * format, the scope, or `changes` (the entries, say) change.
 */
export function usePreparedExport(
  format: ExportFormat,
  scope: ExportScope,
  changes: unknown,
  /** Minutes from UTC set in the photo software, to match a camera clock, or null for UTC. */
  softwareUtcOffsetMin: number | null = null,
) {
  const db = useDb();
  const [ready, setReady] = useState<CreatedExport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A picked set is a new array on every render, so it is compared by its ids.
  const scopeKey = typeof scope === 'object' ? scope.entryIds.join(',') : scope;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scopeKey stands in for scope.
  useEffect(() => {
    if (changes === undefined) return;
    let current = true;
    setReady(null);
    setError(null);
    setMessage(null);
    loadExporter()
      .then(({ createExport }) =>
        createExport(db, {
          format,
          scope,
          cameraTime: softwareUtcOffsetMin === null ? null : { softwareUtcOffsetMin },
        }),
      )
      .then((created) => {
        if (current) setReady(created);
      })
      .catch(() => {
        if (current) setError("Couldn't prepare the export. Try again.");
      });
    return () => {
      current = false;
    };
  }, [db, format, scopeKey, changes, softwareUtcOffsetMin]);

  async function share() {
    if (!ready) return;
    setError(null);
    setMessage(null);
    const release = holdUpdates();
    try {
      const result = await saveFile(ready.file);
      if (result !== 'cancelled') setMessage(`Exported ${ready.file.name}.`);
    } catch {
      setError("Couldn't share the export. Try again.");
    } finally {
      release();
    }
  }

  return { ready, message, error, share };
}
