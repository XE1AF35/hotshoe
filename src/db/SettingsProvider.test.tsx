import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../test/db.ts';
import { DbProvider } from './DbProvider.tsx';
import { SettingsProvider, useSettings } from './SettingsProvider.tsx';
import { setSetting } from './settings.ts';

function AccuracyTarget() {
  return <p>Target {useSettings().accuracyTargetM} m</p>;
}

describe('SettingsProvider', () => {
  it('holds its children back until Settings load, then keeps them up to date', async () => {
    const db = createTestDb();
    await setSetting(db, 'accuracyTargetM', 50);
    render(
      <DbProvider db={db}>
        <p>Outside</p>
        <SettingsProvider>
          <AccuracyTarget />
        </SettingsProvider>
      </DbProvider>,
    );

    expect(screen.getByText('Outside')).toBeDefined();
    expect(screen.queryByText(/Target/)).toBeNull();
    expect(await screen.findByText('Target 50 m')).toBeDefined();

    await setSetting(db, 'accuracyTargetM', 10);
    expect(await screen.findByText('Target 10 m')).toBeDefined();
  });
});
