import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DbProvider } from '../../db/DbProvider.tsx';
import type { HotshoeDb } from '../../db/database.ts';
import { addEntry, listEntries } from '../../db/entries.ts';
import { addPhoto } from '../../db/photos.ts';
import { getSetting } from '../../db/settings.ts';
import { activeTrip, addTrip, listTrips, setActiveTrip } from '../../db/trips.ts';
import { createTestDb, jpegBlob, newEntryInput } from '../../test/db.ts';
import { MoreScreen } from '../settings/MoreScreen.tsx';
import { ActiveTripPicker } from './ActiveTripPicker.tsx';

function renderWithDb(db: HotshoeDb, ui: React.ReactNode) {
  return render(<DbProvider db={db}>{ui}</DbProvider>);
}

describe('ActiveTripPicker', () => {
  it('chooses the trip for new entries', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    renderWithDb(db, <ActiveTripPicker />);

    fireEvent.click(await screen.findByRole('button', { name: /Trip: None/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Trip for new entries' });
    fireEvent.click(await within(sheet).findByLabelText('Coromandel'));

    await waitFor(async () => expect(await activeTrip(db)).toEqual(trip));
  });

  it('creates a trip and makes it active in one step', async () => {
    const db = createTestDb();
    renderWithDb(db, <ActiveTripPicker />);

    fireEvent.click(await screen.findByRole('button', { name: /Trip: None/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Trip for new entries' });
    fireEvent.change(within(sheet).getByLabelText('New trip'), {
      target: { value: 'Easter 2027' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add' }));

    await waitFor(async () => {
      const [trip] = await listTrips(db);
      expect(trip?.name).toBe('Easter 2027');
      expect((await activeTrip(db))?.id).toBe(trip?.id);
    });
  });

  it('rejects a blank trip name', async () => {
    const db = createTestDb();
    renderWithDb(db, <ActiveTripPicker />);

    fireEvent.click(await screen.findByRole('button', { name: /Trip: None/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Trip for new entries' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add' }));

    expect(await within(sheet).findByText('Trip name cannot be blank.')).toBeDefined();
    expect(await listTrips(db)).toEqual([]);
  });
});

describe('Trips on the More screen', () => {
  it('lists trips with their entry counts and the active one', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    await setActiveTrip(db, trip.id);
    await addEntry(db, newEntryInput({ tripId: trip.id }));
    await addEntry(db, newEntryInput({ tripId: trip.id }));
    renderWithDb(db, <MoreScreen />);

    expect(
      await screen.findByRole('button', { name: /Coromandel.*Active · 2 entries/ }),
    ).toBeDefined();
  });

  it('renames and archives a trip', async () => {
    const db = createTestDb();
    await addTrip(db, 'Coromandle');
    renderWithDb(db, <MoreScreen />);

    fireEvent.click(await screen.findByRole('button', { name: /Coromandle/ }));
    let sheet = await screen.findByRole('dialog', { name: 'Trip' });
    fireEvent.change(within(sheet).getByLabelText('Name'), { target: { value: 'Coromandel' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await listTrips(db))[0]?.name).toBe('Coromandel'));

    fireEvent.click(await screen.findByRole('button', { name: /^Coromandel/ }));
    sheet = await screen.findByRole('dialog', { name: 'Trip' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Archive' }));
    expect(await screen.findByRole('button', { name: /Archived/ })).toBeDefined();
  });

  it('deletes a trip after confirming and keeps its entries', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    await addEntry(db, newEntryInput({ tripId: trip.id }));
    renderWithDb(db, <MoreScreen />);

    fireEvent.click(await screen.findByRole('button', { name: /Coromandel/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Trip' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete trip' }));
    expect(within(sheet).getByText(/Its 1 entry will be kept/)).toBeDefined();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));

    await waitFor(async () => expect(await listTrips(db)).toEqual([]));
    expect((await listEntries(db))[0]?.tripId).toBeNull();
  });

  it("summarises a trip's entries, photos, days, distance, and weak fixes", async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    const other = await addTrip(db, 'Waiheke');
    const first = await addEntry(
      db,
      newEntryInput({ tripId: trip.id, loggedAt: Date.parse('2026-10-03T01:00:00Z') }),
    );
    await addEntry(
      db,
      newEntryInput({
        tripId: trip.id,
        loggedAt: Date.parse('2026-10-09T01:00:00Z'),
        lat: -36.758461,
        accuracyM: 35,
      }),
    );
    await addEntry(db, newEntryInput({ tripId: other.id }));
    await addPhoto(db, {
      entryId: first.id,
      takenAt: first.loggedAt,
      source: 'camera',
      image: jpegBlob(2000),
      thumb: jpegBlob(200),
      width: 1600,
      height: 1200,
    });
    renderWithDb(db, <MoreScreen />);

    fireEvent.click(await screen.findByRole('button', { name: /^Coromandel/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Trip' });
    const summary = await within(sheet).findByRole('region', { name: 'Summary' });
    const text = (await within(summary).findByText('Entries')).closest('dl')?.textContent;
    expect(text).toContain('Entries2');
    expect(text).toContain('Photos1');
    expect(text).toContain('DatesSat, 3 Oct to Fri, 9 Oct 2026');
    expect(text).toContain('Days7, with entries on 2');
    // 0.09 degrees of latitude.
    expect(text).toContain('DistanceAbout 10 km');
    expect(text).toContain('Weak fixes1, less accurate than ±20 m');
  });

  it('says when a trip has no entries yet', async () => {
    const db = createTestDb();
    await addTrip(db, 'Coromandel');
    renderWithDb(db, <MoreScreen />);

    fireEvent.click(await screen.findByRole('button', { name: /^Coromandel/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Trip' });
    expect(await within(sheet).findByText('No entries yet.')).toBeDefined();
  });

  it('changes the coordinate format', async () => {
    const db = createTestDb();
    renderWithDb(db, <MoreScreen />);

    fireEvent.click(await screen.findByLabelText(/Degrees, minutes, seconds/));
    await waitFor(async () => expect(await getSetting(db, 'coordFormat')).toBe('dms'));
  });
});
