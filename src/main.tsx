import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './RootApp';
import { AppearanceProvider } from './ui/appearance';
import './styles.css';
createRoot(document.getElementById('root')!).render(<StrictMode><AppearanceProvider><App /></AppearanceProvider></StrictMode>);
