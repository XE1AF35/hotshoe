import { useEffect } from 'react';

/** A short message at the top of the screen, with an optional action such as Undo. */
export function Toast({
  message,
  action,
  onDismiss,
  durationMs = 8000,
}: {
  readonly message: string;
  readonly action?: { readonly label: string; readonly onClick: () => void } | undefined;
  readonly onDismiss: () => void;
  readonly durationMs?: number;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-30 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-ink px-4 py-2 text-sm text-surface shadow-lg"
    >
      <p className="flex-1">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="min-h-11 rounded-lg px-3 font-semibold text-accent"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
