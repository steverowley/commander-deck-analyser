/**
 * Deck persistence backed by localStorage.
 *
 * Async signatures are preserved so swapping in a real backend later
 * (Supabase, Firebase, custom Node) won't require touching call sites.
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
