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
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                  isCurrent ? 'font-semibold text-accent-ink' : 'text-muted'
                }`}
              >
                <Icon className="size-6" />
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
