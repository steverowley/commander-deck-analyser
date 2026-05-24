import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

export default defineConfig({
  // Project page served from https://<user>.github.io/commander-deck-analyser/.
  // Override at build time with `VITE_BASE=/` (e.g. for a custom domain).
  base: process.env.VITE_BASE ?? '/commander-deck-analyser/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: { port: 5173, open: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
});
