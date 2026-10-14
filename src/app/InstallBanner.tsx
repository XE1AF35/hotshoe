import { useState } from 'react';
import { isStandalone } from '../lib/display.ts';
import { ShareIcon } from './icons.tsx';

/**
 * iOS keeps a Home Screen app's data apart from Safari's, so entries logged in a Safari tab never
 * appear in the installed app. This banner stays until the app is opened from the Home Screen.
 */
export function InstallBanner() {
  const [standalone] = useState(isStandalone);
  if (standalone) return null;

  return (
    <aside
      aria-label="Install Hotshoe"
      className="bg-warning px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-on-warning text-sm"
    >
      <p className="mx-auto max-w-xl">
        <strong className="font-semibold">Open Hotshoe from your Home Screen.</strong> Entries
        logged in Safari are kept separately and won't show up in the Home Screen app. To install,
        tap <ShareIcon className="inline size-4 align-text-bottom" />
        <span className="sr-only">Share</span>, then{' '}
        <span className="font-semibold">Add to Home Screen</span>.
      </p>
    </aside>
  );
}
