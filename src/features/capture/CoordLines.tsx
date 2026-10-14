import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from '../../app/icons.tsx';
import { copyText } from '../../lib/clipboard.ts';
import { type CoordStyle, formatCoordParts, type LatLon } from '../../lib/coords.ts';

type Part = 'latitude' | 'longitude';

/**
 * Latitude and longitude on a line each. Tapping one copies just that number, for apps with a
 * separate field for each, such as digiKam.
 */
export function CoordLines({
  coords,
  style,
  className,
}: {
  readonly coords: LatLon;
  readonly style: CoordStyle;
  /** Text size and weight for the numbers. */
  readonly className: string;
}) {
  const [lat, lon] = formatCoordParts(coords, style);
  const [copied, setCopied] = useState<Part | null>(null);

  useEffect(() => {
    if (copied === null) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(part: Part, text: string) {
    if (await copyText(text)) setCopied(part);
  }

  return (
    <div className={`font-mono tabular-nums ${className}`}>
      <CoordLine part="latitude" text={lat} copied={copied === 'latitude'} onCopy={copy} />
      {/* Keeps the pair readable as one line when selected or read as a whole. */}
      <span className="sr-only">{style.decimalMark === 'comma' ? '; ' : ', '}</span>
      <CoordLine part="longitude" text={lon} copied={copied === 'longitude'} onCopy={copy} />
      <p role="status" className="sr-only">
        {copied === null ? '' : `Copied ${copied}`}
      </p>
    </div>
  );
}

function CoordLine({
  part,
  text,
  copied,
  onCopy,
}: {
  readonly part: Part;
  readonly text: string;
  readonly copied: boolean;
  readonly onCopy: (part: Part, text: string) => Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={() => void onCopy(part, text)}
      className="-mx-1 flex min-h-11 items-center gap-2 rounded-lg px-1 text-left active:bg-surface"
    >
      <span className="sr-only">Copy {part} </span>
      {text}
      {copied ? (
        <CheckIcon className="size-4 shrink-0 text-good-ink" />
      ) : (
        <CopyIcon className="size-4 shrink-0 text-muted" />
      )}
    </button>
  );
}
