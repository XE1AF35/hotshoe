import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DbProvider } from '../../db/DbProvider.tsx';
import type { HotshoeDb } from '../../db/database.ts';
import { addEntry, listEntries } from '../../db/entries.ts';
import { getSetting, setSetting } from '../../db/settings.ts';
import { addTrip, listTrips } from '../../db/trips.ts';
import { createTestDb, newEntryInput } from '../../test/db.ts';
import { MoreScreen } from '../settings/MoreScreen.tsx';
import { ActiveTripPicker } from './ActiveTripPicker.tsx';

function renderWithDb(db: HotshoeDb, ui: React.ReactNode) {
  return render(<DbProvider db={db}>{ui}</DbProvider>);
}

describe('ActiveTripPicker', () => {
  it('chooses the trip for new entries', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    renderWithDb(db, <ActiveTripPicker activeTripId={null} />);

    fireEvent.click(screen.getByRole('button', { name: /Trip: None/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Trip for new entries' });
    fireEvent.click(await within(sheet).findByLabelText('Coromandel'));

    await waitFor(async () => expect(await getSetting(db, 'activeTripId')).toBe(trip.id));
  });

  it('creates a trip and makes it active in one step', async () => {
    const db = createTestDb();
    renderWithDb(db, <ActiveTripPicker activeTripId={null} />);

    fireEvent.click(screen.getByRole('button', { name: /Trip: None/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Trip for new entries' });
    fireEvent.change(within(sheet).getByLabelText('New trip'), {
      target: { value: 'Easter 2027' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add' }));

    await waitFor(async () => {
      const [trip] = await listTrips(db);
      expect(trip?.name).toBe('Easter 2027');
      expect(await getSetting(db, 'activeTripId')).toBe(trip?.id);
    });
  });

  it('rejects a blank trip name', async () => {
    const db = createTestDb();
    renderWithDb(db, <ActiveTripPicker activeTripId={null} />);

    fireEvent.click(screen.getByRole('button', { name: /Trip: None/ }));
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
    await setSetting(db, 'activeTripId', trip.id);
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

  it('changes the coordinate format', async () => {
    const db = createTestDb();
    renderWithDb(db, <MoreScreen />);

    fireEvent.click(await screen.findByLabelText(/Degrees, minutes, seconds/));
    await waitFor(async () => expect(await getSetting(db, 'coordFormat')).toBe('dms'));
  });
});
