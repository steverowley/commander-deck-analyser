import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Project page served from https://<user>.github.io/commander-deck-analyser/.
  // Override at build time with `VITE_BASE=/` (e.g. for a custom domain).
  base: process.env.VITE_BASE ?? '/commander-deck-analyser/',
  plugins: [react()],
  server: { port: 5173, open: true },
});
