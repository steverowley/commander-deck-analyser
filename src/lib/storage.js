/**
 * Deck persistence — storage adapter.
 *
 * Public contract (everything else in the app calls these only):
 *
 *   loadDecks()       → Promise<Deck[]>    // ordered by updated desc
 *   saveDeck(deck)    → Promise<boolean>   // create or update; mutates `updated`
 *   deleteDeck(id)    → Promise<void>
 *
 * Current backend: browser localStorage (single device).
 * Swap path: replace this file with a Supabase / Firebase / Node adapter
 * exposing the same three async functions and the rest of the app needs
 * no changes. Auth would live behind these functions, not above them.
 *
 * Deck shape (see src/App.jsx handleCreate):
 *   { id, name, cards: [...], commander, created, updated }
 */

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

export async function loadDecks() {
  const all = loadAll();
  return Object.values(all).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export async function saveDeck(deck) {
  const all = loadAll();
  deck.updated = Date.now();
  all[deck.id] = deck;
  saveAll(all);
  return true;
}

export async function deleteDeck(id) {
  const all = loadAll();
  delete all[id];
  saveAll(all);
}
