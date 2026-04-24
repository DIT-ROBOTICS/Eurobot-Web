import { THEME_ACCENT_KEY } from './storageKeys';

/** App brand accent (DIT red — matches long-standing control placeholder) */
export const DEFAULT_THEME_ACCENT = "#E64545";

const DEFAULT_ACCENT = DEFAULT_THEME_ACCENT;

/**
 * Read accent from localStorage; validate non-empty string (hex, hsl, named).
 * Applies --theme-accent, --accent-text, and related tokens on :root.
 */
export function applyThemeFromStorage(): void {
  if (typeof document === 'undefined') return;
  let accent = DEFAULT_ACCENT;
  try {
    const s = localStorage.getItem(THEME_ACCENT_KEY);
    if (s && s.trim()) accent = s.trim();
  } catch {
    /* ignore */
  }
  setThemeAccent(accent);
}

export function setThemeAccent(accent: string): void {
  const a = accent.trim() || DEFAULT_ACCENT;
  const root = document.documentElement;
  root.style.setProperty('--theme-accent', a);
  root.style.setProperty('--accent-text', a);
  root.style.setProperty('--highlight-color', a);
  root.style.setProperty('--progress-bar-color', a);
}

export function getStoredThemeAccent(): string {
  try {
    return localStorage.getItem(THEME_ACCENT_KEY) || DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}
