import type { CoordFormat, CoordStyle, DecimalMark } from '../lib/coords.ts';
import type { HotshoeDb } from './database.ts';
import { withStorageErrors } from './errors.ts';
import type { TripId } from './schema.ts';

export type PhotoQuality = 'standard' | 'high';
export type PersistResult = 'granted' | 'denied' | 'unsupported';

export interface Settings {
  activeTripId: TripId | null;
  lastBackupAt: number | null;
  /** Kept apart from lastBackupAt, since a backup can leave the photos out. */
  lastPhotoBackupAt: number | null;
  coordFormat: CoordFormat;
  decimalMark: DecimalMark;
  accuracyTargetM: number;
  fixTimeoutS: number;
  photoQuality: PhotoQuality;
  backupReminderDays: number;
  backupReminderEntries: number;
  persistResult: PersistResult | null;
  /**
   * Whether the Map tab loads the map straight away. Off by default: the map comes from
   * OpenFreeMap, which then sees the area on screen, so loading it is a choice each time.
   */
  mapLoadsAutomatically: boolean;
}

export type SettingKey = keyof Settings;

export const defaultSettings: Readonly<Settings> = {
  activeTripId: null,
  lastBackupAt: null,
  lastPhotoBackupAt: null,
  coordFormat: 'decimal',
  decimalMark: 'point',
  accuracyTargetM: 20,
  fixTimeoutS: 45,
  photoQuality: 'standard',
  backupReminderDays: 7,
  backupReminderEntries: 25,
  persistResult: null,
  mapLoadsAutomatically: false,
};

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;
const isTimestampOrNull = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value));

const guards: { [K in SettingKey]: (value: unknown) => value is Settings[K] } = {
  activeTripId: (value): value is TripId | null => value === null || typeof value === 'string',
  lastBackupAt: isTimestampOrNull,
  lastPhotoBackupAt: isTimestampOrNull,
  coordFormat: (value): value is CoordFormat => value === 'decimal' || value === 'dms',
  decimalMark: (value): value is DecimalMark => value === 'point' || value === 'comma',
  accuracyTargetM: isPositiveNumber,
  fixTimeoutS: isPositiveNumber,
  photoQuality: (value): value is PhotoQuality => value === 'standard' || value === 'high',
  backupReminderDays: isPositiveNumber,
  backupReminderEntries: isPositiveNumber,
  persistResult: (value): value is PersistResult | null =>
    value === null || value === 'granted' || value === 'denied' || value === 'unsupported',
  mapLoadsAutomatically: (value): value is boolean => typeof value === 'boolean',
};

/** How coordinates are shown and copied. */
export function coordStyleOf(settings: Pick<Settings, 'coordFormat' | 'decimalMark'>): CoordStyle {
  return { format: settings.coordFormat, decimalMark: settings.decimalMark };
}

/** Reads a setting, falling back to the default when it is missing or not a valid value. */
export async function getSetting<K extends SettingKey>(
  db: HotshoeDb,
  key: K,
): Promise<Settings[K]> {
  const row = await db.meta.get(key);
  const guard = guards[key];
  return row !== undefined && guard(row.value) ? row.value : defaultSettings[key];
}

export async function getSettings(db: HotshoeDb): Promise<Settings> {
  const rows = await db.meta.toArray();
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const settings = { ...defaultSettings };
  for (const key of Object.keys(guards) as SettingKey[]) {
    const value = stored.get(key);
    if (guards[key](value)) {
      Object.assign(settings, { [key]: value });
    }
  }
  return settings;
}

export async function setSetting<K extends SettingKey>(
  db: HotshoeDb,
  key: K,
  value: Settings[K],
): Promise<void> {
  if (!guards[key](value)) {
    throw new TypeError(`Invalid value for setting "${key}".`);
  }
  await withStorageErrors(() => db.meta.put({ key, value }));
}
