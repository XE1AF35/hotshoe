import { type ReactNode, useEffect, useId, useRef } from 'react';
import { CloseIcon } from './icons.tsx';

/**
 * A bottom sheet built on the native modal dialog, which traps focus, closes on Escape, and hides
 * the rest of the page from screen readers while open.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboards close the dialog with Escape (native) or the Close button; the click only handles taps on the backdrop.
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // A tap on the backdrop lands on the dialog element itself, outside its content.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 mx-auto max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-raised p-0 text-ink shadow-xl backdrop:bg-black/50"
    >
      {open && (
        <div className="space-y-4 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-semibold text-xl">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex size-11 items-center justify-center rounded-full text-muted"
            >
              <CloseIcon className="size-6" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
