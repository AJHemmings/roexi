import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import { inTauri } from './bridge';
import { logErr } from './errorLog';
import { startGameCommands } from './roe/gameCommands';

if (!inTauri) {
  const { startMockFeed } = await import('./dev/mockFeed');
  startMockFeed();
}
startGameCommands();

window.addEventListener('error', (e) => logErr('error', (e.error && e.error.stack) || e.message || String(e)));
window.addEventListener('unhandledrejection', (e) => logErr('reject', String((e.reason && e.reason.stack) || e.reason)));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
