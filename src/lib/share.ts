export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Hands a file to the share sheet, where iOS offers Save to Files, AirDrop, and so on. Where
 * files can't be shared, it downloads instead. Must be called from a tap.
 */
export async function saveFile(file: File): Promise<SaveResult> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  // The download reads the URL after this returns, so release it a little later.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
