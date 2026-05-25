/**
 * Deck persistence — storage adapter (auth-aware).
 *
 * Public contract (everything else in the app calls these only):
 *
 *   loadDecks()       → Promise<Deck[]>    // ordered by updated desc
 *   saveDeck(deck)    → Promise<boolean>   // create or update; mutates `updated`
 *   deleteDeck(id)    → Promise<void>
 *
 * Routes between two backends transparently:
 *   - Signed in: Supabase (cloud sync across devices, gallery, public decks)
 *   - Signed out: localStorage (single browser, single device)
 *
 * The current backend is decided per-call by checking the live Supabase
 * session — so a user signing in mid-session immediately starts hitting
 * the cloud without an app reload.
 *
 * Deck shape (see src/App.jsx handleCreate):
 *   { id, name, cards: [...], commander, strictIdentity, notes,
 *     wishlist, is_public, created, updated }
 */

import { supabase } from './supabase.js';
import * as cloud from './storage-supabase.js';

const DECKS_KEY = 'vault:decks-v1';

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(DECKS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveAll(map) {
  try {
    localStorage.setItem(DECKS_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Vault: failed to persist decks', e);
  }
}

/**
 * Synchronously check whether the cloud backend is the active one.
 * supabase.auth.getSession() is async, so we read the cached state
 * Supabase exposes via session storage. Returns false in tests / SSR.
 */
function isCloudActive() {
  if (!supabase) return false;
  // Supabase persists the session in localStorage under a project-prefixed
  // key. Quick check that doesn't trigger async refresh.
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    return keys.some((k) => {
      const raw = localStorage.getItem(k);
      if (!raw) return false;
      try { return !!JSON.parse(raw)?.access_token; } catch { return false; }
    });
  } catch {
    return false;
  }
}

export async function loadDecks() {
  if (isCloudActive()) return cloud.loadDecks();
  const all = loadAll();
  return Object.values(all).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export async function saveDeck(deck) {
  if (isCloudActive()) return cloud.saveDeck(deck);
  const all = loadAll();
  deck.updated = Date.now();
  all[deck.id] = deck;
  saveAll(all);
  return true;
}

export async function deleteDeck(id) {
  if (isCloudActive()) return cloud.deleteDeck(id);
  const all = loadAll();
  delete all[id];
  saveAll(all);
}

/**
 * One-shot read of local-only decks regardless of auth state — used by
 * the post-sign-in migration flow to know what to upload.
 */
export function readLocalDecks() {
  const all = loadAll();
  return Object.values(all).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

/**
 * Wipe local decks after a successful cloud migration so the user
 * doesn't see two copies. Caller is responsible for confirming
 * upload before calling this.
 */
export function clearLocalDecks() {
  try { localStorage.removeItem(DECKS_KEY); } catch {}
}
