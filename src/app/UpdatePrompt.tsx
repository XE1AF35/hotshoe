import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect } from 'react';

/**
 * Registers the service worker and offers new versions without forcing a reload, so an update
 * never interrupts logging. Shown at the top so it never covers the Log button.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // iOS resumes an installed app rather than reloading it, so check for updates on return.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          void registration.update();
        }
      });
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    const timer = window.setTimeout(() => setOfflineReady(false), 4000);
    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-20 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-surface shadow-lg"
    >
      {needRefresh ? (
        <>
          <p className="flex-1">A new version of Hotshoe is ready.</p>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="min-h-11 rounded-lg px-3 font-medium"
          >
            Later
          </button>
          <button
            type="button"
            onClick={() => void updateServiceWorker()}
            className="min-h-11 rounded-lg bg-accent px-3 font-semibold text-on-accent"
          >
            Reload
          </button>
        </>
      ) : (
        <p className="flex-1">Hotshoe is ready to work offline.</p>
      )}
    </div>
  );
}
