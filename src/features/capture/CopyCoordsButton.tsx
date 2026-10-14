import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from '../../app/icons.tsx';
import { copyText } from '../../lib/clipboard.ts';
import { type CoordFormat, formatCoords, type LatLon } from '../../lib/coords.ts';

/** One tap copies the coordinates in the format Flickr's location editor accepts. */
export function CopyCoordsButton({
  coords,
  format,
}: {
  readonly coords: LatLon;
  readonly format: CoordFormat;
}) {
  const text = formatCoords(coords, format);
  const [result, setResult] = useState<'copied' | 'failed' | null>(null);

  useEffect(() => {
    if (result !== 'copied') return;
    const timer = window.setTimeout(() => setResult(null), 2000);
    return () => window.clearTimeout(timer);
  }, [result]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={async () => setResult((await copyText(text)) ? 'copied' : 'failed')}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-raised px-4 font-medium"
      >
        {result === 'copied' ? <CheckIcon className="size-5" /> : <CopyIcon className="size-5" />}
        {result === 'copied' ? 'Copied' : 'Copy for Flickr'}
      </button>
      <p role="status" className="sr-only">
        {result === 'copied' ? `Copied ${text}` : ''}
      </p>
      {result === 'failed' && (
        <div className="space-y-1 text-sm">
          <label htmlFor="coords-to-copy" className="text-muted">
            Copying was blocked. Select the coordinates and copy them yourself:
          </label>
          <input
            id="coords-to-copy"
            readOnly
            value={text}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-base"
          />
        </div>
      )}
    </div>
  );
}
