import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DbProvider } from '../../db/DbProvider.tsx';
import type { HotshoeDb } from '../../db/database.ts';
import { addEntry, listEntries } from '../../db/entries.ts';
import { addTrip } from '../../db/trips.ts';
import { createTestDb, newEntryInput } from '../../test/db.ts';
import { EntriesScreen } from './EntriesScreen.tsx';

function renderEntries(db: HotshoeDb) {
  return render(
    <DbProvider db={db}>
      <EntriesScreen />
    </DbProvider>,
  );
}

describe('EntriesScreen', () => {
  it('says when there is nothing yet', async () => {
    renderEntries(createTestDb());
    expect(await screen.findByText(/Nothing logged yet/)).toBeDefined();
  });

  it('groups entries by local day, then trip', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    // 14 October 2026 in Auckland (NZDT, UTC+13).
    await addEntry(
      db,
      newEntryInput({
        loggedAt: Date.parse('2026-10-14T01:00:00Z'),
        label: 'Wharf',
        tripId: trip.id,
      }),
    );
    await addEntry(
      db,
      newEntryInput({ loggedAt: Date.parse('2026-10-14T02:00:00Z'), label: 'Cafe' }),
    );
    // 15 October locally, though still 14 October in UTC.
    await addEntry(
      db,
      newEntryInput({
        loggedAt: Date.parse('2026-10-14T12:00:00Z'),
        label: 'Night sky',
        frame: '7',
      }),
    );
    renderEntries(db);

    const later = await screen.findByRole('region', { name: 'Thursday, 15 October 2026' });
    expect(within(later).getByText('Night sky')).toBeDefined();
    expect(within(later).getByText(/Frame 7/)).toBeDefined();

    const earlier = screen.getByRole('region', { name: 'Wednesday, 14 October 2026' });
    expect(within(earlier).getByText('Coromandel')).toBeDefined();
    expect(within(earlier).getByText('No trip')).toBeDefined();
    expect(within(earlier).getByText('Wharf')).toBeDefined();
  });

  it('edits an entry in the sheet', async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Northland');
    await addEntry(db, newEntryInput({ label: 'Wharf' }));
    renderEntries(db);

    fireEvent.click(await screen.findByRole('button', { name: /Wharf/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Entry' });
    fireEvent.change(within(sheet).getByLabelText('Label'), { target: { value: 'Old wharf' } });
    fireEvent.change(within(sheet).getByLabelText('Frame'), { target: { value: '24' } });
    fireEvent.change(within(sheet).getByLabelText('Trip'), { target: { value: trip.id } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    await waitFor(async () =>
      expect((await listEntries(db))[0]).toMatchObject({
        label: 'Old wharf',
        frame: '24',
        tripId: trip.id,
      }),
    );
    expect(await screen.findByText('Old wharf')).toBeDefined();
  });

  it('deletes after confirming, and undo brings the entry back', async () => {
    const db = createTestDb();
    await addEntry(db, newEntryInput({ label: 'Wharf' }));
    renderEntries(db);

    fireEvent.click(await screen.findByRole('button', { name: /Wharf/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Entry' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete entry' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Entry deleted.')).toBeDefined();
    await waitFor(async () => expect(await listEntries(db)).toHaveLength(0));

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(async () => expect(await listEntries(db)).toHaveLength(1));
    expect(await screen.findByText('Wharf')).toBeDefined();
  });

  it('keeps the entry when the delete is not confirmed', async () => {
    const db = createTestDb();
    await addEntry(db, newEntryInput({ label: 'Wharf' }));
    renderEntries(db);

    fireEvent.click(await screen.findByRole('button', { name: /Wharf/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Entry' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete entry' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Keep' }));

    expect(within(sheet).getByRole('button', { name: 'Delete entry' })).toBeDefined();
    expect(await listEntries(db)).toHaveLength(1);
  });
});
