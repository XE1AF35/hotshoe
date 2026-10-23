import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, type ReactNode, useContext } from 'react';
import { useDb } from './DbProvider.tsx';
import { getSettings, type Settings } from './settings.ts';

const SettingsContext = createContext<Settings | null>(null);

/**
 * Loads Settings once and keeps them up to date. Its children wait until they load, so nothing
 * below ever sees them missing.
 */
export function SettingsProvider({ children }: { readonly children: ReactNode }) {
  const db = useDb();
  const settings = useLiveQuery(() => getSettings(db), [db]);
  if (settings === undefined) return null;
  return <SettingsContext value={settings}>{children}</SettingsContext>;
}

export function useSettings(): Settings {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error('useSettings must be used inside a SettingsProvider');
  return settings;
}
