import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HotshoeDb } from '../../db/database.ts';
import { addEntry, listEntries } from '../../db/entries.ts';
import { addTrip } from '../../db/trips.ts';
import { createTestDb, newEntryInput } from '../../test/db.ts';
import { renderWithDb } from '../../test/render.tsx';
import { EntriesScreen } from './EntriesScreen.tsx';

function renderEntries(db: HotshoeDb) {
  return renderWithDb(db, <EntriesScreen />);
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

  it("counts every trip's entries under each day, named by its date alone", async () => {
    const db = createTestDb();
    const trip = await addTrip(db, 'Coromandel');
    // 14 October 2026 in Auckland: one entry in a trip and one without.
    await addEntry(
      db,
      newEntryInput({ loggedAt: Date.parse('2026-10-14T01:00:00Z'), tripId: trip.id }),
    );
    await addEntry(db, newEntryInput({ loggedAt: Date.parse('2026-10-14T02:00:00Z') }));
    // 15 October locally.
    await addEntry(db, newEntryInput({ loggedAt: Date.parse('2026-10-14T12:00:00Z') }));
    renderEntries(db);

    const later = await screen.findByRole('region', { name: 'Thursday, 15 October 2026' });
    expect(within(later).getByRole('heading', { level: 2 }).textContent).toContain('1 entry');
    const earlier = screen.getByRole('region', { name: 'Wednesday, 14 October 2026' });
    expect(within(earlier).getByRole('heading', { level: 2 }).textContent).toContain('2 entries');
  });

  it('keeps accuracy out of the rows', async () => {
    const db = createTestDb();
    await addEntry(db, newEntryInput({ label: 'Wharf', accuracyM: 8, frame: '12' }));
    await addEntry(db, newEntryInput({ label: 'Cafe', origin: 'photo', accuracyM: null }));
    await addEntry(db, newEntryInput({ label: 'Beach', origin: 'placed', accuracyM: null }));
    renderEntries(db);

    const row = async (label: string) => screen.findByRole('button', { name: new RegExp(label) });
    const wharf = await row('Wharf');
    expect(within(wharf).queryByText('±8 m')).toBeNull();
    expect(within(wharf).getByText('Frame 12')).toBeDefined();
    expect(within(await row('Cafe')).queryByText('Accuracy unknown')).toBeNull();
    expect(within(await row('Beach')).queryByText('Placed by hand')).toBeNull();
  });

  it('shows accuracy, unknown accuracy, and placing by hand in the sheet', async () => {
    const db = createTestDb();
    await addEntry(db, newEntryInput({ label: 'Wharf', accuracyM: 8 }));
    await addEntry(db, newEntryInput({ label: 'Cafe', origin: 'photo', accuracyM: null }));
    await addEntry(db, newEntryInput({ label: 'Beach', origin: 'placed', accuracyM: null }));
    renderEntries(db);

    fireEvent.click(await screen.findByRole('button', { name: /Wharf/ }));
    let sheet = await screen.findByRole('dialog', { name: 'Entry' });
    expect(within(sheet).getByText(/±8 m/)).toBeDefined();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));

    fireEvent.click(await screen.findByRole('button', { name: /Cafe/ }));
    sheet = await screen.findByRole('dialog', { name: 'Entry' });
    expect(within(sheet).getByText(/Accuracy unknown/)).toBeDefined();
    expect(within(sheet).queryByText(/±/)).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));

    fireEvent.click(await screen.findByRole('button', { name: /Beach/ }));
    sheet = await screen.findByRole('dialog', { name: 'Entry' });
    expect(within(sheet).getByText(/Placed by hand/)).toBeDefined();
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

  it('moves an entry under its new day when its time changes, keeping the fix time', async () => {
    const db = createTestDb();
    // 14:00:30 on 14 October 2026 in Auckland.
    const entry = await addEntry(
      db,
      newEntryInput({ loggedAt: Date.parse('2026-10-14T01:00:30Z'), label: 'Wharf' }),
    );
    renderEntries(db);

    fireEvent.click(await screen.findByRole('button', { name: /Wharf/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Entry' });
    const field = within(sheet).getByLabelText('Date and time') as HTMLInputElement;
    expect(field.value).toBe('2026-10-14T14:00');
    fireEvent.change(field, { target: { value: '2026-10-16T09:15' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    const moved = await screen.findByRole('region', { name: 'Friday, 16 October 2026' });
    expect(within(moved).getByText('Wharf')).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Wednesday, 14 October 2026' })).toBeNull();
    const [stored] = await listEntries(db);
    expect(stored).toMatchObject({
      loggedAt: Date.parse('2026-10-15T20:15:00Z'),
      fixAt: entry.fixAt,
      timeZone: 'Pacific/Auckland',
      utcOffsetMin: 780,
    });
    expect(stored?.updatedAt).toBeGreaterThan(entry.updatedAt);
  });

  it('keeps the seconds when saving without touching the time', async () => {
    const db = createTestDb();
    const loggedAt = Date.parse('2026-10-14T01:00:30.250Z');
    await addEntry(db, newEntryInput({ loggedAt, label: 'Wharf' }));
    renderEntries(db);

    fireEvent.click(await screen.findByRole('button', { name: /Wharf/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Entry' });
    fireEvent.change(within(sheet).getByLabelText('Label'), { target: { value: 'Old wharf' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Old wharf')).toBeDefined();
    expect((await listEntries(db))[0]?.loggedAt).toBe(loggedAt);
  });

  it('saves nothing when the time is empty', async () => {
    const db = createTestDb();
    const entry = await addEntry(db, newEntryInput({ label: 'Wharf' }));
    renderEntries(db);

    fireEvent.click(await screen.findByRole('button', { name: /Wharf/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Entry' });
    fireEvent.change(within(sheet).getByLabelText('Label'), { target: { value: 'Old wharf' } });
    fireEvent.change(within(sheet).getByLabelText('Date and time'), { target: { value: '' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

    expect((await within(sheet).findByRole('alert')).textContent).toBe('Enter a date and time.');
    expect(await db.entries.get(entry.id)).toEqual(entry);
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
