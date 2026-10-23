import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DbProvider } from '../db/DbProvider.tsx';
import type { HotshoeDb } from '../db/database.ts';
import { SettingsProvider } from '../db/SettingsProvider.tsx';

/** Renders a screen or component as the app does, with the database and Settings provided. */
export function renderWithDb(db: HotshoeDb, ui: ReactNode) {
  return render(
    <DbProvider db={db}>
      <SettingsProvider>{ui}</SettingsProvider>
    </DbProvider>,
  );
}
