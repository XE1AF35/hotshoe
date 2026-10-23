import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DbProvider } from '../db/DbProvider.tsx';
import type { HotshoeDb } from '../db/database.ts';
import { listEntries } from '../db/entries.ts';
import { listPhotos } from '../db/photos.ts';
import { createTestDb } from '../test/db.ts';
import { installFakeGeolocation } from '../test/geolocation.ts';
import { App } from './App.tsx';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  }),
}));

vi.mock('../lib/image.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/image.ts')>()),
  processPhoto: vi.fn(async (file: File) => ({
    image: new Blob(['image'], { type: 'image/jpeg' }),
    thumb: new Blob(['thumb'], { type: 'image/jpeg' }),
    width: 1600,
    height: 1200,
    takenAt: file.lastModified,
  })),
}));

afterEach(() => {
  window.location.hash = '';
});

function renderApp(db: HotshoeDb = createTestDb()) {
  return render(
    <DbProvider db={db}>
      <App />
    </DbProvider>,
  );
}

function goTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('App', () => {
  it('opens on the Log tab', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Log' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Log' }).getAttribute('aria-current')).toBe('page');
  });

  it('follows the hash to another tab', async () => {
    renderApp();
    goTo('#/map');
    expect(await screen.findByRole('heading', { level: 1, name: 'Map' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Map' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Log' }).getAttribute('aria-current')).toBeNull();
  });

  it('asks to be opened from the Home Screen when running in a browser tab', () => {
    renderApp();
    expect(screen.getByRole('complementary', { name: 'Install Hotshoe' })).toBeDefined();
  });

  it('keeps a waiting photo while another tab is open, then adds it to the next entry', async () => {
    const db = createTestDb();
    const gps = installFakeGeolocation();
    const { container } = renderApp(db);

    fireEvent.click(await screen.findByRole('button', { name: 'Log with photo' }));
    await waitFor(() => expect(gps.watchers.size).toBe(1));
    const cameraInput = container.querySelector('input[capture]');
    if (!cameraInput) throw new Error('camera input missing');
    const file = new File(['jpeg'], 'shot.jpg', { type: 'image/jpeg' });
    fireEvent.change(cameraInput, { target: { files: [file] } });
    act(() => gps.fail(1));
    expect(await screen.findByText(/Your photo is waiting/)).toBeDefined();

    goTo('#/entries');
    expect(await screen.findByRole('heading', { level: 1, name: 'Entries' })).toBeDefined();
    goTo('#/log');
    expect(await screen.findByText(/Your photo is waiting/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Log location' }));
    await waitFor(() => expect(gps.watchers.size).toBe(1));
    act(() => gps.emit(5));

    await waitFor(async () => {
      const [entry] = await listEntries(db);
      expect(await listPhotos(db, entry?.id ?? ('' as never))).toHaveLength(1);
    });
  });
});
