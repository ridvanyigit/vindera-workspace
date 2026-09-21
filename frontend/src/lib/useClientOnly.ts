import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * True in the browser after hydration, false on the server and during the first
 * client render, so a value that only exists in the browser cannot cause a
 * hydration mismatch (and needs no setState-in-effect).
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** `window.location.origin`, or an empty string on the server and during hydration. */
export function useOrigin(): string {
  return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '');
}
