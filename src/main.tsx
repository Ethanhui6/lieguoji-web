import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { reportBoot } from './fms/boot-report';
import './fms/ios-shell.css';
import './fms/ios-polish.css';
reportBoot('module');
const keyboardInset = () => {
  if (!document.documentElement.classList.contains('ios-shell')) return;
  const viewport = window.visualViewport;
  if (!viewport) return;
  const apply = () => {
    const overlap = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
    document.documentElement.style.setProperty('--keyboard-inset', `${overlap}px`);
  };
  viewport.addEventListener('resize', apply);
  viewport.addEventListener('scroll', apply);
  apply();
};
keyboardInset();
// Only the map owns pinch gestures. Native panel scrolling and control clicks
// must not be cancelled/replayed by a document-wide touchend handler.
// touch-action:none handles Pointer Events; Safari also emits gesture events.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, e => {
  if (e.target instanceof Element && e.target.closest('.fms-map,.c47-map')) e.preventDefault();
}, { passive: false });
// iOS Safari ignores user-scalable=no: a second pinch finger anywhere would zoom the page.
// One-finger moves (panel scrolling) are never touched.
document.addEventListener('touchmove', e => { if (e.touches.length > 1 && e.cancelable) e.preventDefault(); }, { passive: false });
// Double-tap zoom: only a real double TAP is cancelled — both touches short, still and close
// together. Cancelling it also drops that tap's click, so a control gets one click back.
// A finger that moved (a scroll or fling) is never cancelled, so sheets keep native scrolling.
let tapStart: { x: number; y: number; t: number } | null = null, lastTap: { x: number; y: number; t: number } | null = null;
document.addEventListener('touchstart', e => {
  const t = e.touches[0]; tapStart = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY, t: performance.now() } : null;
}, { passive: true, capture: true });
document.addEventListener('touchend', e => {
  const t = e.changedTouches[0], start = tapStart; tapStart = null;
  if (!t || !start || e.touches.length) { lastTap = null; return; }
  const now = performance.now(), still = Math.hypot(t.clientX - start.x, t.clientY - start.y) < 10 && now - start.t < 350;
  if (!still) { lastTap = null; return; }
  const tap = { x: t.clientX, y: t.clientY, t: now };
  if (lastTap && now - lastTap.t < 400 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 40 && e.cancelable) {
    e.preventDefault(); lastTap = null;
    const control = (e.target as HTMLElement | null)?.closest<HTMLElement>('button,a,summary,label,[role=button],select,input');
    if (control && !(control as HTMLButtonElement).disabled) control.click();
    return;
  }
  lastTap = tap;
}, { passive: false, capture: true });
// Some in-app browsers still end up zoomed; reapplying the viewport resets the scale to 1.
const viewport = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
window.visualViewport?.addEventListener('resize', () => {
  if (!viewport || (window.visualViewport?.scale ?? 1) <= 1.01) return;
  const content = viewport.content; viewport.content = content + ', minimum-scale=1';
  requestAnimationFrame(() => { viewport.content = content; });
});
// Long press shows no copy / save menu (text inputs keep theirs).
document.addEventListener('contextmenu', e => { const t = e.target as HTMLElement | null; if (!t?.closest('input,textarea,[contenteditable]')) e.preventDefault(); });
// Original background music (RandomMusicPlayer) and the web's control sounds; loaded apart from the entry.
void import('./fms/audio/audio47').then(m => m.installGameAudio47());
const Entry = lazy(() => import('./fms/FmsApp'));
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<p role="status">正在打开地图…</p>}><Entry /></Suspense></StrictMode>);

