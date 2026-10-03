import App from './RootApp';
import { AppearanceProvider } from './ui/appearance';
import './styles.css';
export default function LegacyEntry() { return <AppearanceProvider><App /></AppearanceProvider>; }
