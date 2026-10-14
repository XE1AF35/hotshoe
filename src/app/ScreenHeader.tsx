import type { ReactNode } from 'react';

/**
 * The large title at the top of each tab, with room for a control on the right. With large text
 * the control wraps below the title rather than running off the screen.
 */
export function ScreenHeader({
  title,
  children,
}: {
  readonly title: string;
  readonly children?: ReactNode;
}) {
  return (
    <header className="flex min-h-11 flex-wrap items-center justify-between gap-3">
      <h1 id="screen-title" className="min-w-0 break-words font-bold text-3xl tracking-tight">
        {title}
      </h1>
      {children}
    </header>
  );
}
