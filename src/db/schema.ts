import type { LatLon } from '../lib/coords.ts';
import type { TimeContext } from '../lib/time.ts';

export type EntryId = string & { readonly __brand: 'EntryId' };
export type TripId = string & { readonly __brand: 'TripId' };
export type PhotoId = string & { readonly __brand: 'PhotoId' };

export interface Entry extends LatLon, TimeContext {
  readonly id: EntryId;
  /** Epoch ms UTC when the button was tapped: the closest thing to the shutter time. */
  readonly loggedAt: number;
  /** Epoch ms UTC of the GPS fix itself, which can arrive seconds after the tap. */
  readonly fixAt: number;
  /** Null when unknown, as for a photo with no GPS error figure or an entry placed by hand. */
  readonly accuracyM: number | null;
  readonly altitudeM: number | null;
  readonly altitudeAccuracyM: number | null;
  readonly label: string | null;
  /** Free text, because frame numbers and file names are not plain integers ("12A", "DSC_0412"). */
  readonly frame: string | null;
  readonly tripId: TripId | null;
  readonly origin: Origin;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Where an entry's location came from: a fix at the tap, the photo's own GPS, or set by hand. It
 * says nothing about the time.
 */
export const origins = ['logged', 'photo', 'placed'] as const;
export type Origin = (typeof origins)[number];

export interface Trip {
  readonly id: TripId;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archivedAt: number | null;
  /** How the trip's camera clock differs from real time, once measured. */
  readonly cameraClock: CameraClock | null;
}

/**
 * A camera clock, measured by photographing Hotshoe's clock. Cameras keep local time with no time
 * zone, and their clocks drift, so one offset covers both.
 */
export interface CameraClock {
  /**
   * Seconds to add to a moment in UTC to get what the camera's clock read then, written as if
   * that reading were UTC.
   */
  readonly offsetS: number;
  /** This iPhone's offset from UTC when the clock was measured, to describe the difference. */
  readonly phoneUtcOffsetMin: number;
  readonly measuredAt: number;
}

export interface Photo {
  readonly id: PhotoId;
  readonly entryId: EntryId;
  /** Epoch ms UTC, from File.lastModified. */
  readonly takenAt: number;
  readonly source: 'camera' | 'library';
  /** JPEG, scaled so the long edge fits the chosen quality. */
  readonly image: Blob;
  /** JPEG, 320 px long edge. */
  readonly thumb: Blob;
  readonly width: number;
  readonly height: number;
  /** image + thumb, kept so the storage readout does not need to read blobs. */
  readonly bytes: number;
  readonly createdAt: number;
}

/**
 * A photo as kept in IndexedDB, with its JPEGs as raw bytes. WebKit can't store Blobs in private
 * browsing sessions, but it can store ArrayBuffers everywhere.
 */
export interface StoredPhoto extends Omit<Photo, 'image' | 'thumb'> {
  readonly image: ArrayBuffer;
  readonly thumb: ArrayBuffer;
}

export const limits = {
  labelLength: 200,
  frameLength: 40,
  tripNameLength: 80,
} as const;

export function newEntryId(): EntryId {
  return crypto.randomUUID() as EntryId;
}

export function newTripId(): TripId {
  return crypto.randomUUID() as TripId;
}

export function newPhotoId(): PhotoId {
  return crypto.randomUUID() as PhotoId;
}
