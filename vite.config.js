import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

// Supabase publishable credentials. Safe to ship to the browser — these
// are the public anon key, not the service role. Override per-environment
// by setting VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY before `npm run
// build` (e.g. in a .env.local or GitHub Actions secret).
const SUPABASE_URL_DEFAULT = 'https://jpukcgqumytxjwflxrtd.supabase.co';
const SUPABASE_ANON_DEFAULT = 'sb_publishable_YyvhYAknrT5aDdzszs1E_Q_M-72jAbR';

export default defineConfig({
  // Project page served from https://<user>.github.io/commander-deck-analyser/.
  // Override at build time with `VITE_BASE=/` (e.g. for a custom domain).
  base: process.env.VITE_BASE ?? '/commander-deck-analyser/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL || SUPABASE_URL_DEFAULT),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_DEFAULT),
  },
  server: { port: 5173, open: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
});
