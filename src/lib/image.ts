import type { PhotoQuality } from '../db/settings.ts';

export const longEdgeFor: Record<PhotoQuality, number> = { standard: 1600, high: 2560 };
export const thumbLongEdge = 320;
const jpegQuality = 0.82;

export interface ProcessedPhoto {
  readonly image: Blob;
  readonly thumb: Blob;
  readonly width: number;
  readonly height: number;
  /** Epoch ms UTC, from the file. For camera captures this is when the shot was taken. */
  readonly takenAt: number;
}

export class PhotoReadError extends Error {
  override readonly name = 'PhotoReadError';
}

/** Scales a size so its long edge fits `longEdge`, never enlarging it. */
export function fitWithin(
  width: number,
  height: number,
  longEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Makes the stored copy and thumbnail of a photo.
 *
 * The file is decoded by an image element, which applies EXIF rotation and can read HEIC on iOS.
 * It is then drawn straight onto small canvases: iOS fails on canvases over about 16.7 megapixels,
 * so a 48 MP photo is never drawn at full size. Re-encoding from pixels also drops the original
 * file's metadata.
 */
export async function processPhoto(
  file: Blob & { lastModified?: number },
  quality: PhotoQuality,
): Promise<ProcessedPhoto> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new PhotoReadError("Couldn't read that photo.");
    }
    const { naturalWidth, naturalHeight } = img;
    if (naturalWidth === 0 || naturalHeight === 0) {
      throw new PhotoReadError("Couldn't read that photo.");
    }

    const size = fitWithin(naturalWidth, naturalHeight, longEdgeFor[quality]);
    const thumbSize = fitWithin(naturalWidth, naturalHeight, thumbLongEdge);
    const image = await drawJpeg(img, size.width, size.height);
    const thumb = await drawJpeg(img, thumbSize.width, thumbSize.height);

    return {
      image,
      thumb,
      width: size.width,
      height: size.height,
      takenAt: file.lastModified ?? Date.now(),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function drawJpeg(img: HTMLImageElement, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new PhotoReadError("This device couldn't process the photo.");
    context.imageSmoothingQuality = 'high';
    context.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', jpegQuality),
    );
    if (!blob) throw new PhotoReadError("This device couldn't process the photo.");
    return blob;
  } finally {
    // Safari is slow to free canvas memory, so shrink the canvas as soon as it's done with.
    canvas.width = 0;
    canvas.height = 0;
  }
}
