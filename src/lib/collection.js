/**
 * Collection storage — what cards a user owns.
 *
 * Backed by Supabase `public.collection` when signed in, or by
 * localStorage under VAULT_LS when local-only. Same API in both modes.
 *
 * Collection shape (in memory):
 *   { 'sol ring': { name: 'Sol Ring', quantity: 2, added_at: 1700000000 }, ... }
 * Keys are lowercased canonical Scryfall names. `name` keeps the
 * original casing for display.
 */

import { supabase } from './supabase.js';
import { lc } from './utils.js';

const LS_KEY = 'vault:collection-v1';

async function isSignedIn() {
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

async function currentUserId() {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

/**
 * Load the user's full collection as a map keyed by lowercased name.
 */
export async function loadCollection() {
  if (await isSignedIn()) {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('collection')
      .select('card_name, quantity, added_at')
      .eq('user_id', userId)
      .order('added_at', { ascending: false });
    if (error) {
      console.warn('Supabase loadCollection failed', error);
      return {};
    }
    const out = {};
    for (const row of data || []) {
      out[lc(row.card_name)] = {
        name: row.card_name,
        quantity: row.quantity,
        added_at: new Date(row.added_at).getTime(),
      };
    }
    return out;
  }
  // localStorage fallback
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocal(collection) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(collection));
  } catch (e) {
    console.warn('Vault: collection localStorage save failed', e);
  }
}

/**
 * Add `qty` copies of a card. Returns the updated entry.
 */
export async function addToCollection(cardName, qty = 1) {
  if (!cardName || qty <= 0) return null;
  if (await isSignedIn()) {
    const userId = await currentUserId();
    // Read current quantity (if any) then upsert. PostgREST doesn't
    // support "increment" so a read-modify-write is needed.
    const { data: existing } = await supabase
      .from('collection')
      .select('quantity')
      .eq('user_id', userId)
      .eq('card_name', cardName)
      .maybeSingle();
    const nextQty = (existing?.quantity || 0) + qty;
    const { error } = await supabase
      .from('collection')
      .upsert(
        { user_id: userId, card_name: cardName, quantity: nextQty, added_at: new Date().toISOString() },
        { onConflict: 'user_id,card_name' }
      );
    if (error) {
      console.warn('Supabase addToCollection failed', error);
      return null;
    }
    return { name: cardName, quantity: nextQty };
  }
  const cur = await loadCollection();
  const key = lc(cardName);
  const existing = cur[key];
  const next = { name: cardName, quantity: (existing?.quantity || 0) + qty, added_at: Date.now() };
  cur[key] = next;
  saveLocal(cur);
  return next;
}

/**
 * Set the count for a card directly. qty 0 deletes the row.
 */
export async function setCardQuantity(cardName, qty) {
  if (!cardName) return;
  if (await isSignedIn()) {
    const userId = await currentUserId();
    if (qty <= 0) {
      const { error } = await supabase
        .from('collection')
        .delete()
        .eq('user_id', userId)
        .eq('card_name', cardName);
      if (error) console.warn('Supabase setCardQuantity delete failed', error);
      return;
    }
    const { error } = await supabase
      .from('collection')
      .upsert(
        { user_id: userId, card_name: cardName, quantity: qty },
        { onConflict: 'user_id,card_name' }
      );
    if (error) console.warn('Supabase setCardQuantity failed', error);
    return;
  }
  const cur = await loadCollection();
  const key = lc(cardName);
  if (qty <= 0) delete cur[key];
  else cur[key] = { name: cardName, quantity: qty, added_at: cur[key]?.added_at || Date.now() };
  saveLocal(cur);
}

/**
 * Remove a card entirely.
 */
export async function removeFromCollection(cardName) {
  return setCardQuantity(cardName, 0);
}

/**
 * Bulk-add many cards in one go.
 */
export async function bulkAddToCollection(entries) {
  // entries: [{ name, quantity }]
  for (const e of entries) {
    if (e?.name) await addToCollection(e.name, e.quantity || 1);
  }
}

/**
 * Wipe the collection.
 */
export async function clearCollection() {
  if (await isSignedIn()) {
    const userId = await currentUserId();
    const { error } = await supabase
      .from('collection')
      .delete()
      .eq('user_id', userId);
    if (error) console.warn('Supabase clearCollection failed', error);
    return;
  }
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

/**
 * Returns the total unique card names in the collection.
 */
export function uniqueCount(collection) {
  return Object.keys(collection || {}).length;
}

/**
 * Returns the total card count (sum of quantities).
 */
export function totalCount(collection) {
  return Object.values(collection || {}).reduce((s, c) => s + (c.quantity || 0), 0);
}

/**
 * True if the given card name (case-insensitive) is in the collection.
 */
export function ownedCount(collection, cardName) {
  if (!cardName) return 0;
  return collection?.[lc(cardName)]?.quantity || 0;
}
