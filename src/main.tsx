import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
const Entry = lazy(() => import('./fms/FmsApp'));
createRoot(document.getElementById('root')!).render(<StrictMode><Suspense fallback={<p role="status">正在打开地图…</p>}><Entry /></Suspense></StrictMode>);
