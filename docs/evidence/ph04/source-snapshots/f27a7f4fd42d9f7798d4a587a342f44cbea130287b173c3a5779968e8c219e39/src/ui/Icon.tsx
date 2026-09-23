import type { ReactNode } from 'react';

const drawings: Record<string, ReactNode> = {
  map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" /><path d="M9 3v15M15 6v15" /></>,
  brush: <><path d="m8 14 9-11 4 4-11 9M8 14l2 2c1 4-3 5-7 5 2-2 0-6 5-7Z" /></>,
  flag: <><path d="M5 21V3M5 4c6-4 8 4 14 0v10c-6 4-8-4-14 0" /></>,
  city: <><path d="M3 21V10h7V4h10v17ZM3 21h18M6 13v1m0 3v1m7-11v1m4-1v1m-4 3v1m4-1v1m-4 3v1m4-1v1" /></>,
  world: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c6 5 6 13 0 18-6-5-6-13 0-18Z" /></>,
  army: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="m8 13 3 3 5-7" /></>,
  book: <><path d="M12 5C8 2 5 3 3 4v15c3-1 6-1 9 2 3-3 6-3 9-2V4c-2-1-5-2-9 1ZM12 5v16M6 8h3m-3 4h3m6-4h3m-3 4h3" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />,
  system: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  'chevron-up': <path d="m5 15 7-7 7 7" />,
  'chevron-down': <path d="m5 9 7 7 7-7" />,
  settings: <><path d="M4 6h16M4 12h16M4 18h16" /><path d="M8 4v4m8 2v4m-7 2v4" /></>,
  save: <><path d="M5 3h12l4 4v14H3V3ZM7 3v6h10V3M7 21v-8h10v8" /></>,
};
export type IconName = 'map' | 'brush' | 'flag' | 'city' | 'world' | 'army' | 'book' | 'sun' | 'moon' | 'system' | 'close' | 'chevron-left' | 'chevron-up' | 'chevron-down' | 'settings' | 'save';
export function Icon({ name, size = 22, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={`ui-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{drawings[name]}</svg>;
}
