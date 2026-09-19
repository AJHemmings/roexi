import { useSyncExternalStore } from 'react';

export type ThemeId = '' | 'slate' | 'crimson' | 'meadow';

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: '', label: 'Eminence' },
  { id: 'slate', label: 'Slate' },
  { id: 'crimson', label: 'Crimson' },
  { id: 'meadow', label: 'Meadow' },
];

const KEY = 'roexi-theme';

function read(): ThemeId {
  try {
    const v = localStorage.getItem(KEY) as ThemeId | null;
    if (v === 'slate' || v === 'crimson' || v === 'meadow') return v;
  } catch { /* ignore */ }
  return '';
}

let theme = read();
function apply() {
  if (typeof document === 'undefined') return;
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
apply();

const listeners = new Set<() => void>();
export function setTheme(v: ThemeId) {
  theme = v;
  apply();
  try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
export function useTheme(): [ThemeId, (v: ThemeId) => void] {
  const t = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => theme, () => theme);
  return [t, setTheme];
}
