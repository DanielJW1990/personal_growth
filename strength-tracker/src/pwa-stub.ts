/**
 * Stands in for `virtual:pwa-register/react` in the standalone single-file
 * build, which has no service worker to register. See scripts/build-standalone.mjs.
 */
import { useState } from 'react';

export function useRegisterSW() {
  const offlineReady = useState(false);
  const needRefresh = useState(false);
  return {
    offlineReady,
    needRefresh,
    updateServiceWorker: async () => {},
  };
}
