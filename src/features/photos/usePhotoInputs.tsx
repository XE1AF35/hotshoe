import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { holdUpdates } from '../../app/updates.ts';
import type { Photo } from '../../db/schema.ts';

export interface PhotoInputs {
  /** Opens the iPhone camera. Must be called from a tap. */
  readonly openCamera: () => void;
  /** Opens the photo library. Must be called from a tap. */
  readonly openLibrary: () => void;
  /** The hidden file inputs; render these somewhere on the page. */
  readonly inputs: ReactNode;
}

/**
 * File inputs for the camera and the photo library. They stay in the layout but visually hidden,
 * because Safari may refuse to open a picker for an input with display: none.
 */
export function usePhotoInputs(
  onFiles: (files: File[], source: Photo['source']) => void,
): PhotoInputs {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  // Opening the camera hides the app, which is when updates install. Hold them until the picker
  // closes, so the photo is not lost to a reload.
  const releaseHold = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    releaseHold.current?.();
    releaseHold.current = null;
  }, []);

  function open(input: HTMLInputElement | null) {
    if (!input) return;
    release();
    releaseHold.current = holdUpdates();
    input.click();
  }

  // React has no cancel prop for file inputs, so listen directly.
  useEffect(() => {
    const inputs = [camera.current, library.current];
    for (const input of inputs) input?.addEventListener('cancel', release);
    return () => {
      for (const input of inputs) input?.removeEventListener('cancel', release);
      release();
    };
  }, [release]);

  function handle(source: Photo['source']) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      release();
      const files = [...(event.target.files ?? [])];
      // Clear the input so choosing the same file again still fires a change.
      event.target.value = '';
      if (files.length > 0) onFiles(files, source);
    };
  }

  return {
    openCamera: () => open(camera.current),
    openLibrary: () => open(library.current),
    inputs: (
      <>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={handle('camera')}
        />
        <input
          ref={library}
          type="file"
          accept="image/*"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={handle('library')}
        />
      </>
    ),
  };
}
