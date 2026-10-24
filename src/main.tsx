import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
// The game handles pinch and pan itself. Stop the browser's own page zoom and
// pinch gestures (iOS Safari would otherwise zoom out to the tab overview).
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
// iOS Safari ignores user-scalable=no for double tap: a second tap within 450 ms is not a zoom.
// Cancelling it also cancels that tap's click, so a quick second tap on a control is replayed.
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = performance.now();
  if (now - lastTouchEnd < 450 && e.cancelable && e.touches.length === 0) {
    e.preventDefault();
    const control = (e.target as HTMLElement | null)?.closest<HTMLElement>('button,a,summary,label,[role=button]');
    if (control && !(control as HTMLButtonElement).disabled) control.click();
  }
  lastTouchEnd = now;
}, { passive: false });
// If the page still ends up zoomed (some in-app browsers), reapplying the viewport resets it to 1.
const viewport = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
window.visualViewport?.addEventListener('resize', () => {
  if (!viewport || (window.visualViewport?.scale ?? 1) <= 1.01) return;
  const content = viewport.content;
  viewport.content = content + ', minimum-scale=1';
  requestAnimationFrame(() => { viewport.content = content; });
});
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
// Long press shows no copy / save menu (text inputs keep theirs).
document.addEventListener('contextmenu', e => { const t = e.target as HTMLElement | null; if (!t?.closest('input,textarea,[contenteditable]')) e.preventDefault(); });
const Entry = lazy(() => import('./fms/FmsApp'));
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<p role="status">正在打开地图…</p>}><Entry /></Suspense></StrictMode>);
