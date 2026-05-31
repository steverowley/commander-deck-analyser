// Global Vitest setup.
//
// Node < 22 has no global `WebSocket`. The Supabase client constructs its
// Realtime client eagerly inside `createClient()`, and @supabase/realtime-js
// throws at import time when no WebSocket global is present:
//
//   Error: Node.js 20 detected without native WebSocket support.
//
// That means *any* test whose import graph reaches `src/lib/supabase.js`
// (e.g. buylist.test.js → collection.js → supabase.js) crashes on the
// Node 20 CI runner while passing on a Node 22 dev machine. Tests never open
// a realtime connection, so a no-op stub is enough to satisfy the
// environment check. On Node 22 the native WebSocket is left untouched.
//
// Mirrors the existing "patch a global for the test env" approach used by
// `fake-indexeddb/auto` in idbcache.test.js.
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocketStub {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  };
}
