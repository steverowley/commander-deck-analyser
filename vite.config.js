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

// Content-Security-Policy injected into the production build. Lists every
// origin the app actually hits: Supabase (REST + realtime over wss),
// Scryfall (cards/images/svgs), EDHREC (recs), weserv.nl (image proxy),
// Google Fonts (display fonts loaded from src/index.css). Injected via
// <meta http-equiv> only in the build output so Vite dev-mode HMR (which
// needs inline scripts + eval) keeps working.
const connectSrc = [
  "'self'",
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://api.scryfall.com',
  'https://json.edhrec.com',
  // First-visit region detection (currency + buy-link defaults).
  'https://ipapi.co',
  // PayPal Donate SDK fires XHRs back to paypal.com / paypalobjects.com.
  'https://www.paypal.com',
  'https://www.sandbox.paypal.com',
  'https://www.paypalobjects.com',
].join(' ');

const CSP = [
  "default-src 'self'",
  // paypalobjects.com hosts the Donate SDK script tag.
  "script-src 'self' https://www.paypalobjects.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // paypalobjects.com serves the donate button image (btn_donate_LG.gif).
  "img-src 'self' data: blob: https://images.weserv.nl https://cards.scryfall.io https://img.scryfall.com https://svgs.scryfall.io https://www.paypalobjects.com",
  `connect-src ${connectSrc}`,
  // PayPal opens its checkout popup as a new window; an iframe variant
  // exists too, so allow framing the live + sandbox origins.
  "frame-src https://www.paypal.com https://www.sandbox.paypal.com",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://www.paypal.com https://www.sandbox.paypal.com",
].join('; ');

function cspPlugin() {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  // Project page served from https://<user>.github.io/commander-deck-analyser/.
  // Override at build time with `VITE_BASE=/` (e.g. for a custom domain).
  base: process.env.VITE_BASE ?? '/commander-deck-analyser/',
  plugins: [react(), cspPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.VITE_SUPABASE_URL || SUPABASE_URL_DEFAULT),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_DEFAULT),
  },
  server: { port: 5173, open: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    // Stub the WebSocket global so the Supabase client (constructed eagerly
    // in createClient) doesn't throw on Node < 22 in CI. See vitest.setup.js.
    setupFiles: ['./vitest.setup.js'],
  },
});
