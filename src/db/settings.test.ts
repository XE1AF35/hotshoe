import { describe, expect, it } from 'vitest';
import { createTestDb } from '../test/db.ts';
import { defaultSettings, getSetting, getSettings, setSetting } from './settings.ts';

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    const db = createTestDb();
    expect(await getSettings(db)).toEqual(defaultSettings);
    expect(await getSetting(db, 'accuracyTargetM')).toBe(20);
  });

  it('stores and reads back values', async () => {
    const db = createTestDb();
    await setSetting(db, 'coordFormat', 'dms');
    await setSetting(db, 'lastBackupAt', 1234);

    expect(await getSetting(db, 'coordFormat')).toBe('dms');
    expect(await getSettings(db)).toEqual({
      ...defaultSettings,
      coordFormat: 'dms',
      lastBackupAt: 1234,
    });
  });

  it('ignores invalid stored values and falls back to the default', async () => {
    const db = createTestDb();
    await db.meta.put({ key: 'photoQuality', value: 'enormous' });
    await db.meta.put({ key: 'fixTimeoutS', value: -5 });
    await db.meta.put({ key: 'unknownKey', value: 'ignored' });

    expect(await getSetting(db, 'photoQuality')).toBe('standard');
    expect(await getSettings(db)).toEqual(defaultSettings);
  });

  it('refuses to store an invalid value', async () => {
    const db = createTestDb();
    // Simulates a value that slipped past the type checker, such as one from an import.
    const bad = 0 as unknown as number;
    await expect(setSetting(db, 'accuracyTargetM', bad)).rejects.toThrow('accuracyTargetM');
  });
});
