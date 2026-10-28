/**
 * Builds JPEG bytes carrying exactly the EXIF tags a test asks for, so no real photo, with a real
 * location in it, is ever committed.
 */
export interface ExifFields {
  /** `2026:10:14 10:35:12` */
  readonly dateTimeOriginal?: string;
  /** `+07:00` */
  readonly offsetTimeOriginal?: string;
  /** `123`, meaning .123 of a second. */
  readonly subSecTimeOriginal?: string;
  readonly gps?: GpsFields;
}

export interface GpsFields {
  readonly latitude?: Dms;
  readonly latitudeRef?: 'N' | 'S';
  readonly longitude?: Dms;
  readonly longitudeRef?: 'E' | 'W';
  readonly altitude?: number;
  /** 0 above sea level, 1 below. */
  readonly altitudeRef?: 0 | 1;
  readonly hPositioningError?: number;
  /** `2026:10:14` */
  readonly dateStamp?: string;
  /** Hours, minutes, and seconds in UTC. */
  readonly timeStamp?: Dms;
}

/** Degrees, minutes, seconds; or hours, minutes, seconds. */
export type Dms = readonly [number, number, number];

export interface ExifOptions {
  /** Intel byte order (`II`) instead of Motorola (`MM`). */
  readonly littleEndian?: boolean;
}

/** A minimal JPEG, start and end markers only, with the EXIF segment between them. */
export function jpegWithExif(
  fields: ExifFields,
  options: ExifOptions = {},
): Uint8Array<ArrayBuffer> {
  return addExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), fields, options);
}

/** Puts an EXIF segment straight after a JPEG's start marker. */
export function addExif(
  jpeg: Uint8Array,
  fields: ExifFields,
  options: ExifOptions = {},
): Uint8Array<ArrayBuffer> {
  const tiff = buildTiff(fields, options.littleEndian ?? false);
  const segmentLength = 2 + 6 + tiff.length;
  const out = new Uint8Array(jpeg.length + 2 + segmentLength);
  out.set(jpeg.subarray(0, 2), 0);
  out.set([0xff, 0xe1, segmentLength >> 8, segmentLength & 0xff], 2);
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6);
  out.set(tiff, 12);
  out.set(jpeg.subarray(2), 12 + tiff.length);
  return out;
}

const ascii = 2;
const byte = 1;
const long = 4;
const rational = 5;

interface Tag {
  readonly tag: number;
  readonly type: number;
  /** A string for ASCII; otherwise numbers, with rationals given as plain numbers. */
  readonly value: string | readonly number[];
}

function buildTiff(fields: ExifFields, littleEndian: boolean): Uint8Array<ArrayBuffer> {
  const exif: Tag[] = [];
  if (fields.dateTimeOriginal !== undefined) {
    exif.push({ tag: 0x9003, type: ascii, value: fields.dateTimeOriginal });
  }
  if (fields.offsetTimeOriginal !== undefined) {
    exif.push({ tag: 0x9011, type: ascii, value: fields.offsetTimeOriginal });
  }
  if (fields.subSecTimeOriginal !== undefined) {
    exif.push({ tag: 0x9291, type: ascii, value: fields.subSecTimeOriginal });
  }

  const gps: Tag[] = [];
  const g = fields.gps;
  if (g?.latitudeRef) gps.push({ tag: 1, type: ascii, value: g.latitudeRef });
  if (g?.latitude) gps.push({ tag: 2, type: rational, value: g.latitude });
  if (g?.longitudeRef) gps.push({ tag: 3, type: ascii, value: g.longitudeRef });
  if (g?.longitude) gps.push({ tag: 4, type: rational, value: g.longitude });
  if (g?.altitudeRef !== undefined) gps.push({ tag: 5, type: byte, value: [g.altitudeRef] });
  if (g?.altitude !== undefined) gps.push({ tag: 6, type: rational, value: [g.altitude] });
  if (g?.timeStamp) gps.push({ tag: 7, type: rational, value: g.timeStamp });
  if (g?.dateStamp) gps.push({ tag: 0x1d, type: ascii, value: g.dateStamp });
  if (g?.hPositioningError !== undefined) {
    gps.push({ tag: 0x1f, type: rational, value: [g.hPositioningError] });
  }

  const ifdSize = (count: number) => 2 + count * 12 + 4;
  const ifd0Count = (exif.length > 0 ? 1 : 0) + (gps.length > 0 ? 1 : 0);
  const exifAt = 8 + ifdSize(ifd0Count);
  const gpsAt = exifAt + (exif.length > 0 ? ifdSize(exif.length) : 0);
  let dataAt = gpsAt + (gps.length > 0 ? ifdSize(gps.length) : 0);

  const ifd0: Tag[] = [];
  if (exif.length > 0) ifd0.push({ tag: 0x8769, type: long, value: [exifAt] });
  if (gps.length > 0) ifd0.push({ tag: 0x8825, type: long, value: [gpsAt] });

  const buffer = new ArrayBuffer(dataAt + 1024);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes.set(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);

  function writeIfd(at: number, tags: readonly Tag[]) {
    view.setUint16(at, tags.length, littleEndian);
    tags.forEach((tag, index) => {
      const entry = at + 2 + index * 12;
      const data = encode(tag);
      view.setUint16(entry, tag.tag, littleEndian);
      view.setUint16(entry + 2, tag.type, littleEndian);
      view.setUint32(entry + 4, data.count, littleEndian);
      if (data.bytes.length <= 4) {
        bytes.set(data.bytes, entry + 8);
      } else {
        view.setUint32(entry + 8, dataAt, littleEndian);
        bytes.set(data.bytes, dataAt);
        dataAt += data.bytes.length + (data.bytes.length % 2);
      }
    });
    view.setUint32(at + 2 + tags.length * 12, 0, littleEndian);
  }

  function encode(tag: Tag): { count: number; bytes: Uint8Array } {
    if (typeof tag.value === 'string') {
      const text = new TextEncoder().encode(`${tag.value}\0`);
      return { count: text.length, bytes: text };
    }
    const values = tag.value;
    if (tag.type === byte) return { count: values.length, bytes: new Uint8Array(values) };
    if (tag.type === long) {
      const out = new DataView(new ArrayBuffer(values.length * 4));
      values.forEach((value, i) => {
        out.setUint32(i * 4, value, littleEndian);
      });
      return { count: values.length, bytes: new Uint8Array(out.buffer) };
    }
    // Rationals to four decimal places.
    const out = new DataView(new ArrayBuffer(values.length * 8));
    values.forEach((value, i) => {
      out.setUint32(i * 8, Math.round(value * 10_000), littleEndian);
      out.setUint32(i * 8 + 4, 10_000, littleEndian);
    });
    return { count: values.length, bytes: new Uint8Array(out.buffer) };
  }

  writeIfd(8, ifd0);
  if (exif.length > 0) writeIfd(exifAt, exif);
  if (gps.length > 0) writeIfd(gpsAt, gps);
  return bytes.slice(0, dataAt);
}
