import type { ComponentType } from 'react';
import { ListIcon, MapIcon, MoreIcon, PinIcon } from './icons.tsx';
import { type Tab, tabHref } from './router.ts';

const items: ReadonlyArray<{
  tab: Tab;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}> = [
  { tab: 'log', label: 'Log', Icon: PinIcon },
  { tab: 'entries', label: 'Entries', Icon: ListIcon },
  { tab: 'map', label: 'Map', Icon: MapIcon },
  { tab: 'more', label: 'More', Icon: MoreIcon },
];

export function TabBar({ current }: { readonly current: Tab }) {
  return (
    <nav
      aria-label="Main"
      className="border-line border-t bg-raised pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-xl">
        {items.map(({ tab, label, Icon }) => {
          const isCurrent = tab === current;
          return (
            <li key={tab} className="flex-1">
              <a
                href={tabHref(tab)}
                aria-current={isCurrent ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 pt-1.5 text-xs ${
                  isCurrent ? 'font-semibold text-ink' : 'text-muted'
                }`}
              >
                {/* The current tab's icon sits in a pill, as in iOS and Android tab bars. */}
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full motion-safe:transition-colors ${
                    isCurrent ? 'bg-accent text-on-accent' : ''
                  }`}
                >
                  <Icon className="size-5" />
                </span>
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
