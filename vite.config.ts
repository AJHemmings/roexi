import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5194,
    strictPort: true,
    watch: { ignored: ['**/addon/**', '**/src-tauri/**', '**/dist/**', '**/data/**'] },
  },
  // es2022 so the top-level await in src/main.tsx (dev mock feed) survives `vite build`; WebView2 is current Chromium.
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
  test: { environment: 'node', include: ['src/__tests__/**/*.test.ts'] },
});
