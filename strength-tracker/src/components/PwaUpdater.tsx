import { useRegisterSW } from 'virtual:pwa-register/react';
import { da } from '../i18n/da';

/**
 * Registers the service worker and offers a reload when a new build is
 * cached. Also confirms once that the app is available offline.
 */
export function PwaUpdater() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 mx-auto max-w-lg px-3 pt-3 safe-top">
      <div className="flex items-center gap-3 rounded-2xl bg-ink-700 px-3 py-2 text-sm shadow-lg ring-1 ring-ink-500">
        <span className="flex-1">
          {needRefresh ? da.settings.updateAvailable : da.settings.offlineReady}
        </span>
        {needRefresh ? (
          <button
            type="button"
            className="btn h-9 min-h-[36px] bg-accent px-3 text-xs text-ink-900"
            onClick={() => void updateServiceWorker(true)}
          >
            {da.settings.reload}
          </button>
        ) : null}
        <button
          type="button"
          aria-label={da.common.close}
          className="btn h-9 min-h-[36px] bg-ink-600 px-3 text-xs"
          onClick={() => {
            setOfflineReady(false);
            setNeedRefresh(false);
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
