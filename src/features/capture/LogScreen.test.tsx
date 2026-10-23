import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HotshoeDb } from '../../db/database.ts';
import { addEntry, listEntries } from '../../db/entries.ts';
import { addPhoto } from '../../db/photos.ts';
import { setSetting } from '../../db/settings.ts';
import { addTrip, setActiveTrip } from '../../db/trips.ts';
import { createTestDb, jpegBlob, newEntryInput } from '../../test/db.ts';
import { installFakeGeolocation } from '../../test/geolocation.ts';
import { renderWithDb } from '../../test/render.tsx';
import { LogScreen } from './LogScreen.tsx';

function renderLogScreen(db: HotshoeDb) {
  return renderWithDb(db, <LogScreen />);
}

async function tapLog() {
  fireEvent.click(await screen.findByRole('button', { name: 'Log location' }));
}

afterEach(() => {
  Reflect.deleteProperty(window.navigator, 'clipboard');
  Reflect.deleteProperty(document, 'visibilityState');
});

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('LogScreen', () => {
  it('explains itself when nothing has been logged yet', async () => {
    renderLogScreen(createTestDb());
    expect(await screen.findByText(/Tap the button each time you take a photo/)).toBeDefined();
  });

  it('waits for an accurate fix, then saves it to the active trip', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    await setActiveTrip(db, trip.id);
    const gps = installFakeGeolocation();
    renderLogScreen(db);

    await tapLog();
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Finding your location',
    );
    await waitFor(() => expect(gps.watchers.size).toBe(1));

    act(() => gps.emit(300));
    expect(await screen.findByText(/±300 m so far, aiming for ±20 m/)).toBeDefined();

    act(() => gps.emit(9));
    expect(await screen.findByRole('heading', { name: 'Logged' })).toBeDefined();
    expect(screen.getByText('-36.848461')).toBeDefined();
    expect(screen.getByText('174.763336')).toBeDefined();
    expect(gps.watchers.size).toBe(0);

    const [entry] = await listEntries(db);
    expect(entry).toMatchObject({ accuracyM: 9, tripId: trip.id, altitudeM: 12 });
  });

  it('saves the best fix so far on "Use this fix" and marks it weak', async () => {
    const db = createTestDb();
    const gps = installFakeGeolocation();
    renderLogScreen(db);

    await tapLog();
    const useFix = await screen.findByRole('button', { name: 'Use this fix' });
    expect(useFix).toHaveProperty('disabled', true);

    await waitFor(() => expect(gps.watchers.size).toBe(1));
    act(() => gps.emit(65));
    await waitFor(() => expect(useFix).toHaveProperty('disabled', false));
    fireEvent.click(useFix);

    expect(await screen.findByText(/weak fix/)).toBeDefined();
    expect((await listEntries(db))[0]?.accuracyM).toBe(65);
  });

  it('explains how to allow location when permission is refused', async () => {
    const gps = installFakeGeolocation();
    renderLogScreen(createTestDb());

    await tapLog();
    await waitFor(() => expect(gps.watchers.size).toBe(1));
    act(() => gps.fail(1));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('needs permission to use your location');
    expect(alert.textContent).toContain('While Using the App');
    expect(screen.getByRole('button', { name: 'Log location' })).toBeDefined();
  });

  it('gives up at the time limit when no fix arrives', async () => {
    const db = createTestDb();
    await setSetting(db, 'fixTimeoutS', 0.05);
    installFakeGeolocation();
    renderLogScreen(db);

    await tapLog();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('took too long'),
    );
    expect(await listEntries(db)).toEqual([]);
  });

  it('cancels without saving', async () => {
    const db = createTestDb();
    const gps = installFakeGeolocation();
    renderLogScreen(db);

    await tapLog();
    await waitFor(() => expect(gps.watchers.size).toBe(1));
    act(() => gps.emit(300));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('button', { name: 'Log location' })).toBeDefined();
    expect(gps.watchers.size).toBe(0);
    expect(await listEntries(db)).toEqual([]);
  });

  it('copies the coordinates and saves quick fields to the entry', async () => {
    const db = createTestDb();
    const gps = installFakeGeolocation();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderLogScreen(db);

    await tapLog();
    await waitFor(() => expect(gps.watchers.size).toBe(1));
    act(() => gps.emit(5));

    fireEvent.click(await screen.findByRole('button', { name: 'Copy coordinates' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeDefined();
    expect(writeText).toHaveBeenCalledWith('-36.848461, 174.763336');

    const frame = screen.getByLabelText('Frame');
    fireEvent.change(frame, { target: { value: ' 12A ' } });
    fireEvent.blur(frame);
    await waitFor(async () => expect((await listEntries(db))[0]?.frame).toBe('12A'));
  });

  it('copies with a decimal comma, and copies latitude or longitude alone', async () => {
    const db = createTestDb();
    await setSetting(db, 'decimalMark', 'comma');
    const gps = installFakeGeolocation();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    renderLogScreen(db);

    await tapLog();
    await waitFor(() => expect(gps.watchers.size).toBe(1));
    act(() => gps.emit(5));

    fireEvent.click(await screen.findByRole('button', { name: 'Copy coordinates' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('-36,848461; 174,763336'));

    fireEvent.click(screen.getByRole('button', { name: /^Copy latitude/ }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('-36,848461'));
    fireEvent.click(screen.getByRole('button', { name: /^Copy longitude/ }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith('174,763336'));
  });

  it('flags a fix too coarse to be useful', async () => {
    const db = createTestDb();
    const gps = installFakeGeolocation();
    renderLogScreen(db);

    await tapLog();
    await waitFor(() => expect(gps.watchers.size).toBe(1));
    act(() => gps.emit(3200));
    fireEvent.click(await screen.findByRole('button', { name: 'Use this fix' }));

    expect(await screen.findByText(/Check that Precise Location is on/)).toBeDefined();
  });

  it('stops watching while the app is hidden and starts again when it returns', async () => {
    const db = createTestDb();
    const gps = installFakeGeolocation();
    renderLogScreen(db);

    await tapLog();
    await waitFor(() => expect(gps.watchers.size).toBe(1));
    act(() => setVisibility('hidden'));
    expect(gps.watchers.size).toBe(0);

    act(() => setVisibility('visible'));
    await waitFor(() => expect(gps.watchers.size).toBe(1));
    act(() => gps.emit(8));
    expect(await screen.findByRole('heading', { name: 'Logged' })).toBeDefined();
  });

  it('reminds about a photo the last backup left out', async () => {
    const db = createTestDb();
    const day = 86_400_000;
    const now = Date.now();
    const entry = await addEntry(db, newEntryInput(), now - 10 * day);
    await setSetting(db, 'lastPhotoBackupAt', now - 9 * day);
    await addPhoto(
      db,
      {
        entryId: entry.id,
        takenAt: now - 8 * day,
        source: 'camera',
        image: jpegBlob(400),
        thumb: jpegBlob(40),
        width: 1600,
        height: 1200,
      },
      now - 8 * day,
    );
    // A backup without photos since then.
    await setSetting(db, 'lastBackupAt', now - day);
    renderLogScreen(db);

    const reminder = await screen.findByRole('complementary', { name: 'Backup reminder' });
    expect(reminder.textContent).toContain('1 photo isn’t backed up yet.');
  });
});
