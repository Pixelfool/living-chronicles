import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Every proxied path keeps the app same-origin from the browser's point
 * of view during development, exactly mirroring how the backend already
 * serves public/index.html same-origin to avoid needing CORS at all
 * (src/main.ts). No backend changes are needed for this client to work.
 */
const BACKEND = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': BACKEND,
      '/characters': BACKEND,
      '/world': BACKEND,
      '/combat': BACKEND,
      '/inventory': BACKEND,
      '/social': BACKEND,
      '/guilds': BACKEND,
      '/economy': BACKEND,
      '/crafting': BACKEND,
      '/quests': BACKEND,
      '/health': BACKEND,
      '/socket.io': { target: BACKEND, ws: true },
    },
  },
});
