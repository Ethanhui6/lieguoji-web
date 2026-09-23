import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

export type Appearance = { version: 1; theme: 'light' | 'dark' | 'system'; reduceTransparency: boolean; largeText: boolean };
const KEY = 'lieguoji-appearance-v1';
const defaults: Appearance = { version: 1, theme: 'light', reduceTransparency: false, largeText: false };
function decode(raw: string | null): Appearance | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (Object.keys(item).length !== 4 || item.version !== 1 || !['light', 'dark', 'system'].includes(String(item.theme)) || typeof item.theme !== 'string' || typeof item.reduceTransparency !== 'boolean' || typeof item.largeText !== 'boolean') return null;
    return item as Appearance;
  } catch { return null; }
}
function load(): Appearance {
  try { return decode(localStorage.getItem(KEY)) ?? defaults; }
  catch { return defaults; }
}
type AppearanceContextValue = { preferences: Appearance; feedback: string; update: (changes: Partial<Omit<Appearance, 'version'>>) => void };
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(load);
  const [feedback, setFeedback] = useState('');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(query.matches);
    change(); query.addEventListener('change', change);
    const storage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.key !== KEY) return;
      const value = event.newValue === null ? defaults : decode(event.newValue);
      if (value) { setPreferences(value); setFeedback(''); }
    };
    window.addEventListener('storage', storage);
    return () => { query.removeEventListener('change', change); window.removeEventListener('storage', storage); };
  }, []);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = preferences.theme === 'system' ? systemDark ? 'dark' : 'light' : preferences.theme;
    root.dataset.transparency = preferences.reduceTransparency ? 'reduced' : 'normal';
    root.dataset.textSize = preferences.largeText ? 'large' : 'standard';
  }, [preferences, systemDark]);
  const update = useCallback((changes: Partial<Omit<Appearance, 'version'>>) => {
    const next = { ...preferences, ...changes };
    setPreferences(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); setFeedback(''); }
    catch { setFeedback('本次外观已应用，浏览器未允许保存设置；刷新后可能恢复默认。'); }
  }, [preferences]);
  const value = useMemo(() => ({ preferences, feedback, update }), [preferences, feedback, update]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('外观设置需要 AppearanceProvider。');
  return context;
}
