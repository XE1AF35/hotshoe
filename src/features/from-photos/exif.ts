/**
 * Just the EXIF tags From photos needs, read straight from a JPEG's bytes. Anything that isn't
 * valid JPEG EXIF, such as a HEIC file or a truncated download, reads as no tags at all.
 */
export interface ExifTags {
  /** `2026:10:14 10:35:12`, the camera's local clock. */
  readonly dateTimeOriginal?: string;
  /** `+07:00` */
  readonly offsetTimeOriginal?: string;
  /** Digits of a fraction of a second: `25` is a quarter of a second. */
  readonly subSecTimeOriginal?: string;
  readonly gpsLatitudeRef?: string;
  readonly gpsLatitude?: readonly number[];
  readonly gpsLongitudeRef?: string;
  readonly gpsLongitude?: readonly number[];
  /** 1 means below sea level. */
  readonly gpsAltitudeRef?: number;
  readonly gpsAltitude?: number;
  /** Hours, minutes, and seconds in UTC. */
  readonly gpsTimeStamp?: readonly number[];
  /** `2026:10:14` */
  readonly gpsDateStamp?: string;
  readonly gpsHPositioningError?: number;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const exifIfdPointer = 0x8769;
const gpsIfdPointer = 0x8825;

const exifTagNames: Record<number, keyof ExifTags> = {
  36867: 'dateTimeOriginal',
  36881: 'offsetTimeOriginal',
  37521: 'subSecTimeOriginal',
};

const gpsTagNames: Record<number, keyof ExifTags> = {
  1: 'gpsLatitudeRef',
  2: 'gpsLatitude',
  3: 'gpsLongitudeRef',
  4: 'gpsLongitude',
  5: 'gpsAltitudeRef',
  6: 'gpsAltitude',
  7: 'gpsTimeStamp',
  29: 'gpsDateStamp',
  31: 'gpsHPositioningError',
};

/** Tags whose single number is wanted rather than a list. */
const singleValues = new Set<keyof ExifTags>([
  'gpsAltitudeRef',
  'gpsAltitude',
  'gpsHPositioningError',
]);

export function readExif(bytes: ArrayBuffer): ExifTags {
  try {
    const tiff = findTiff(new DataView(bytes));
    return tiff ? readTiff(tiff) : {};
  } catch {
    // A read past the end of a truncated file, or offsets that point nowhere.
    return {};
  }
}

/** The TIFF block inside the JPEG's EXIF segment, or null when there isn't one. */
function findTiff(view: DataView): DataView | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let at = 2;
  while (at + 4 <= view.byteLength) {
    if (view.getUint8(at) !== 0xff) return null;
    const marker = view.getUint8(at + 1);
    // Padding before a marker.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Start of scan or end of image: no metadata after this.
    if (marker === 0xda || marker === 0xd9) return null;
    const length = view.getUint16(at + 2);
    if (marker === 0xe1 && length >= 8 && isExifHeader(view, at + 4)) {
      const start = at + 10;
      return new DataView(view.buffer, view.byteOffset + start, length - 8);
    }
    at += 2 + length;
  }
  return null;
}

function isExifHeader(view: DataView, at: number): boolean {
  // `Exif` followed by two zero bytes.
  return view.getUint32(at) === 0x45786966 && view.getUint16(at + 4) === 0;
}

function readTiff(tiff: DataView): ExifTags {
  const order = tiff.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return {};
  const little = order === 0x4949;
  if (tiff.getUint16(2, little) !== 42) return {};

  const tags: Mutable<ExifTags> = {};
  const ifd0 = readIfd(tiff, tiff.getUint32(4, little), little);
  const exifAt = ifd0.get(exifIfdPointer);
  const gpsAt = ifd0.get(gpsIfdPointer);
  if (exifAt) collect(tags, readIfd(tiff, numberAt(exifAt), little), exifTagNames);
  if (gpsAt) collect(tags, readIfd(tiff, numberAt(gpsAt), little), gpsTagNames);
  return tags;
}

type Value = string | number[];

function numberAt(value: Value): number {
  if (typeof value === 'string' || value[0] === undefined) throw new RangeError('Not a pointer');
  return value[0];
}

function collect(
  tags: Mutable<ExifTags>,
  ifd: Map<number, Value>,
  names: Record<number, keyof ExifTags>,
) {
  for (const [tag, value] of ifd) {
    const name = names[tag];
    if (!name) continue;
    const wanted = singleValues.has(name) && typeof value !== 'string' ? value[0] : value;
    Object.assign(tags, { [name]: wanted });
  }
}

/** One directory of tags, with each value as text or a list of numbers. */
function readIfd(tiff: DataView, at: number, little: boolean): Map<number, Value> {
  const values = new Map<number, Value>();
  const count = tiff.getUint16(at, little);
  for (let index = 0; index < count; index += 1) {
    const entry = at + 2 + index * 12;
    const tag = tiff.getUint16(entry, little);
    const type = tiff.getUint16(entry + 2, little);
    const length = tiff.getUint32(entry + 4, little);
    const size = typeSizes[type];
    if (size === undefined) continue;
    // Values of four bytes or fewer sit in the entry itself; longer ones are elsewhere.
    const valueAt = size * length <= 4 ? entry + 8 : tiff.getUint32(entry + 8, little);
    values.set(tag, readValue(tiff, valueAt, type, length, little));
  }
  return values;
}

const typeSizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function readValue(
  tiff: DataView,
  at: number,
  type: number,
  count: number,
  little: boolean,
): Value {
  if (type === 2) {
    let text = '';
    for (let i = 0; i < count; i += 1) {
      const code = tiff.getUint8(at + i);
      if (code === 0) break;
      text += String.fromCharCode(code);
    }
    return text;
  }
  const numbers: number[] = [];
  for (let i = 0; i < count; i += 1) {
    switch (type) {
      case 3:
        numbers.push(tiff.getUint16(at + i * 2, little));
        break;
      case 4:
        numbers.push(tiff.getUint32(at + i * 4, little));
        break;
      case 9:
        numbers.push(tiff.getInt32(at + i * 4, little));
        break;
      case 5:
        numbers.push(tiff.getUint32(at + i * 8, little) / tiff.getUint32(at + i * 8 + 4, little));
        break;
      case 10:
        numbers.push(tiff.getInt32(at + i * 8, little) / tiff.getInt32(at + i * 8 + 4, little));
        break;
      default:
        numbers.push(tiff.getUint8(at + i));
    }
  }
  return numbers;
}
