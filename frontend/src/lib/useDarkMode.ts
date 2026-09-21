import { useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'vindera-theme';
const CHANGE_EVENT = 'vindera-theme-change';

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

// Keeps the choice for this visit when localStorage is unavailable.
let sessionChoice: boolean | null = null;

function readDark(): boolean {
  if (sessionChoice !== null) return sessionChoice;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'dark';
  } catch {
    // Storage blocked (private window): fall back to the system preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// The server always renders the light theme; the client switches after hydration.
// Reading localStorage in a useState initialiser instead would make the first
// client render differ from the server HTML and fail hydration.
export function useDarkMode() {
  const dark = useSyncExternalStore(subscribe, readDark, () => false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const toggle = () => {
    sessionChoice = !dark;
    try {
      localStorage.setItem(STORAGE_KEY, sessionChoice ? 'dark' : 'light');
    } catch {
      // Not persisted; sessionChoice still applies for this visit.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return { dark, toggle };
}
