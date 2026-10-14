import type { JSX } from 'react';
import { LogScreen } from '../features/capture/LogScreen.tsx';
import { EntriesScreen } from '../features/entries/EntriesScreen.tsx';
import { MapScreen } from '../features/map/MapScreen.tsx';
import { MoreScreen } from '../features/settings/MoreScreen.tsx';
import { InstallBanner } from './InstallBanner.tsx';
import { type Tab, useTab } from './router.ts';
import { TabBar } from './TabBar.tsx';
import { Updater } from './Updater.tsx';

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
    // Only the content scrolls. The tab bar sits outside the scrolling area, so content and focus
    // never slide underneath it (WCAG 2.4.11 and 2.5.8).
    <div className="flex h-dvh flex-col">
      <InstallBanner />
      <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain">
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
          <Screen />
        </main>
      </div>
      <TabBar current={tab} />
      <Updater />
    </div>
  );
}
