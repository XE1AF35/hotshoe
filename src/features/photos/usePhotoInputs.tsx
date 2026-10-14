import { type ReactNode, useRef } from 'react';
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

  function handle(source: Photo['source']) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = [...(event.target.files ?? [])];
      // Clear the input so choosing the same file again still fires a change.
      event.target.value = '';
      if (files.length > 0) onFiles(files, source);
    };
  }

  return {
    openCamera: () => camera.current?.click(),
    openLibrary: () => library.current?.click(),
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
