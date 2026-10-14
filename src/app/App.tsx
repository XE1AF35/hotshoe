import type { JSX } from 'react';
import { LogScreen } from '../features/capture/LogScreen.tsx';
import { EntriesScreen } from '../features/entries/EntriesScreen.tsx';
import { MapScreen } from '../features/map/MapScreen.tsx';
import { MoreScreen } from '../features/settings/MoreScreen.tsx';
import { InstallBanner } from './InstallBanner.tsx';
import { type Tab, useTab } from './router.ts';
import { TabBar } from './TabBar.tsx';
import { UpdatePrompt } from './UpdatePrompt.tsx';

const screens: Record<Tab, () => JSX.Element> = {
  log: LogScreen,
  entries: EntriesScreen,
  map: MapScreen,
  more: MoreScreen,
};

export function App() {
  const tab = useTab();
  const Screen = screens[tab];

  return (
    <div className="flex min-h-dvh flex-col">
      <InstallBanner />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
        <Screen />
      </main>
      <TabBar current={tab} />
      <UpdatePrompt />
    </div>
  );
}
