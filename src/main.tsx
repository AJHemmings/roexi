import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import './styles.css';
import App from './App';
import { inTauri, appDataPath } from './bridge';

if (!inTauri) {
  const { startMockFeed } = await import('./dev/mockFeed');
  startMockFeed();
}

let buffer = '';
async function logErr(kind: string, msg: string) {
  if (!inTauri || buffer.length > 8000) return;
  buffer += `[${kind}] ${msg}\n\n`;
  try { await invoke('write_text_file', { path: await appDataPath('error.log'), contents: buffer }); } catch { /* ignore */ }
}
window.addEventListener('error', (e) => logErr('error', (e.error && e.error.stack) || e.message || String(e)));
window.addEventListener('unhandledrejection', (e) => logErr('reject', String((e.reason && e.reason.stack) || e.reason)));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
