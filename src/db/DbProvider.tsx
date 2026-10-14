import { createContext, type ReactNode, useContext } from 'react';
import type { HotshoeDb } from './database.ts';

const DbContext = createContext<HotshoeDb | null>(null);

/** Provides the database to the app, so tests can hand in a fresh one. */
export function DbProvider({
  db,
  children,
}: {
  readonly db: HotshoeDb;
  readonly children: ReactNode;
}) {
  return <DbContext value={db}>{children}</DbContext>;
}

export function useDb(): HotshoeDb {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb must be used inside a DbProvider');
  return db;
}
