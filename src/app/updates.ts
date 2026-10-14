import { useEffect } from 'react';

/**
 * New versions install by reloading the app, which would lose work in progress. Anything that
 * must not be interrupted (a fix being found, a photo picker that is open, a photo waiting for
 * its entry) holds updates until it is done.
 */
let holds = 0;

/** Holds updates until the returned function is called. Calling it twice is harmless. */
export function holdUpdates(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
  };
}

/** Holds updates while `active` is true. */
export function useHoldUpdates(active: boolean): void {
  useEffect(() => (active ? holdUpdates() : undefined), [active]);
}

/**
 * Whether reloading now could lose something: a hold, an open sheet, or a field being typed in.
 * Fields save on blur, and iOS may not blur them before the app is hidden.
 */
export function updatesHeld(doc: Document = document): boolean {
  if (holds > 0) return true;
  if (doc.querySelector('dialog[open]')) return true;
  const focused = doc.activeElement;
  return (
    focused instanceof HTMLTextAreaElement ||
    (focused instanceof HTMLInputElement && typedInputs.has(focused.type))
  );
}

const typedInputs = new Set(['text', 'search', 'number', 'email', 'tel', 'url']);
