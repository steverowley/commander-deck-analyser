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

// Returns the user id, or null if not signed in. Cloud-path callers
// MUST guard on null after this: passing it straight into
// .eq('user_id', userId) issues a query against user_id = null,
// which silently returns an empty set for reads and is rejected by
// RLS for writes — both look indistinguishable from "nothing in
// your vault" to the user.
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
    if (!userId) return {};
    const { data, error } = await supabase
      .from('collection')
      .select('card_name, quantity, added_at, meta')
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
        meta: row.meta || {},
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
    if (!userId) return null;
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
 * Returns true when the write landed, false on a cloud failure —
 * callers surface that (toast) instead of silently dropping the edit.
 */
export async function setCardQuantity(cardName, qty) {
  if (!cardName) return false;
  if (await isSignedIn()) {
    const userId = await currentUserId();
    if (!userId) return false;
    if (qty <= 0) {
      const { error } = await supabase
        .from('collection')
        .delete()
        .eq('user_id', userId)
        .eq('card_name', cardName);
      if (error) {
        console.warn('Supabase setCardQuantity delete failed', error);
        return false;
      }
      return true;
    }
    const { error } = await supabase
      .from('collection')
      .upsert(
        { user_id: userId, card_name: cardName, quantity: qty },
        { onConflict: 'user_id,card_name' }
      );
    if (error) {
      console.warn('Supabase setCardQuantity failed', error);
      return false;
    }
    return true;
  }
  const cur = await loadCollection();
  const key = lc(cardName);
  if (qty <= 0) delete cur[key];
  else cur[key] = { name: cardName, quantity: qty, added_at: cur[key]?.added_at || Date.now() };
  saveLocal(cur);
  return true;
}

/**
 * Remove a card entirely.
 */
export async function removeFromCollection(cardName) {
  return setCardQuantity(cardName, 0);
}

/**
 * Bulk-add many cards in one go. Quantities accumulate onto any
 * existing entry — matches addToCollection's per-card semantic, not
 * bulkImportVault's snapshot-replace one.
 *
 * Cloud path issues one read + one upsert covering all rows instead
 * of an addToCollection round-trip per card (was N×2 round-trips
 * for N cards on the bulk-paste flow).
 */
export async function bulkAddToCollection(entries) {
  const rows = (entries || []).filter((e) => e?.name);
  if (rows.length === 0) return true;
  if (await isSignedIn()) {
    const userId = await currentUserId();
    if (!userId) return false;
    // Collapse duplicate names within the batch so the upsert payload
    // has unique primary keys (user_id, card_name).
    const wanted = new Map();
    for (const e of rows) {
      const key = lc(e.name);
      const add = Math.max(1, (e.quantity | 0) || 1);
      const prev = wanted.get(key);
      if (prev) prev.quantity += add;
      else wanted.set(key, { name: e.name, quantity: add });
    }
    const names = Array.from(wanted.values()).map((v) => v.name);
    const { data: existing, error: readErr } = await supabase
      .from('collection')
      .select('card_name, quantity, meta')
      .eq('user_id', userId)
      .in('card_name', names);
    if (readErr) {
      console.warn('Supabase bulkAddToCollection read failed', readErr);
      return false;
    }
    const existingByKey = new Map();
    for (const row of existing || []) existingByKey.set(lc(row.card_name), row);
    const nowIso = new Date().toISOString();
    const payload = Array.from(wanted.entries()).map(([key, v]) => {
      const prev = existingByKey.get(key);
      return {
        user_id: userId,
        card_name: v.name,
        quantity: (prev?.quantity || 0) + v.quantity,
        added_at: nowIso,
        ...(prev?.meta ? { meta: prev.meta } : {}),
      };
    });
    const { error } = await supabase
      .from('collection')
      .upsert(payload, { onConflict: 'user_id,card_name' });
    if (error) {
      console.warn('Supabase bulkAddToCollection upsert failed', error);
      return false;
    }
    return true;
  }
  // Local fallback — read-modify-write the whole collection once.
  const cur = await loadCollection();
  for (const e of rows) {
    const key = lc(e.name);
    const add = Math.max(1, (e.quantity | 0) || 1);
    const prev = cur[key];
    cur[key] = {
      name: e.name,
      quantity: (prev?.quantity || 0) + add,
      added_at: Date.now(),
      meta: prev?.meta || {},
    };
  }
  saveLocal(cur);
  return true;
}

/**
 * Bulk-import a parsed Moxfield CSV (or any [{name, count, foil}] array).
 * Replaces quantities (doesn't accumulate) because CSV imports represent
 * the user's CURRENT inventory snapshot, not an addition.
 *
 * Batched in chunks of 100 to avoid 1k+ row payload limits. Reports
 * progress via the callback (done, total). Returns counts.
 */
export async function bulkImportVault(rows, onProgress) {
  if (!rows?.length) return { added: 0, failed: 0, error: null };
  if (await isSignedIn()) {
    const userId = await currentUserId();
    if (!userId) return { added: 0, failed: rows.length, error: 'session expired' };
    let added = 0;
    let failed = 0;
    let firstError = null;
    // Dedupe rows by card_name — if the CSV has the same card twice
    // (rare but legal in Moxfield exports), the upsert payload would
    // contain duplicate primary keys and the whole chunk gets
    // rejected. Last-write-wins per name within a single import.
    const dedup = new Map();
    for (const r of rows) {
      if (r?.name) dedup.set(lc(r.name), r);
    }
    const clean = Array.from(dedup.values());
    const CHUNK = 100;
    for (let i = 0; i < clean.length; i += CHUNK) {
      const slice = clean.slice(i, i + CHUNK);
      const payload = slice.map((r) => ({
        user_id: userId,
        card_name: r.name,
        quantity: Math.max(1, r.count | 0),
        meta: r.foil ? { foil: r.foil } : null,
      }));
      const { error } = await supabase
        .from('collection')
        .upsert(payload, { onConflict: 'user_id,card_name' });
      if (error) {
        console.warn('Supabase bulkImportVault chunk failed', error, 'sample row:', payload[0]);
        if (!firstError) firstError = error.message || String(error);
        failed += slice.length;
      } else {
        added += slice.length;
      }
      onProgress?.({ done: Math.min(i + CHUNK, clean.length), total: clean.length });
    }
    return { added, failed, error: firstError };
  }
  // Local fallback. Mirror the cloud path's quantity clamp so a
  // corrupted CSV (count 0, negative, NaN) can't store nonsense
  // quantities in localStorage that downstream stats / autoseed
  // would then treat as real ownership.
  const cur = await loadCollection();
  for (const r of rows) {
    cur[lc(r.name)] = {
      name: r.name,
      quantity: Math.max(1, r.count | 0),
      added_at: Date.now(),
      meta: r.foil ? { foil: r.foil } : {},
    };
  }
  saveLocal(cur);
  onProgress?.({ done: rows.length, total: rows.length });
  return { added: rows.length, failed: 0, error: null };
}

/**
 * Wipe the collection.
 */
export async function clearCollection() {
  if (await isSignedIn()) {
    const userId = await currentUserId();
    if (!userId) return;
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

/**
 * Replace the meta jsonb on a card entry (printing_id, foil style etc.).
 * Pass null to clear. Returns the new meta object.
 */
export async function setCardMeta(cardName, meta) {
  if (!cardName) return null;
  const next = meta || null;
  if (await isSignedIn()) {
    const userId = await currentUserId();
    if (!userId) return next;
    const { error } = await supabase
      .from('collection')
      .update({ meta: next })
      .eq('user_id', userId)
      .eq('card_name', cardName);
    if (error) console.warn('Supabase setCardMeta failed', error);
    return next;
  }
  const cur = await loadCollection();
  const key = lc(cardName);
  if (cur[key]) {
    cur[key] = { ...cur[key], meta: next || {} };
    saveLocal(cur);
  }
  return next;
}

/* ─── First-sign-in migration ─────────────────────────────────────────── */

/**
 * One-shot read of the LOCAL collection regardless of auth state — the
 * post-sign-in migration needs to see what localStorage holds even
 * though loadCollection() would route to the cloud. Mirrors
 * storage.js#readLocalDecks.
 */
export function readLocalCollectionEntries() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? Object.values(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/**
 * Wipe the local collection after a confirmed cloud migration so the
 * user doesn't end up with a stale shadow copy.
 */
export function clearLocalCollection() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

/**
 * Pure merge for the migration upsert: local entries vs the cloud rows
 * that already exist for the same names. Quantities take max(local,
 * cloud) — NOT sum — so a retried migration can never double-count.
 * Meta keeps the cloud's value when it has one (the account's explicit
 * printing/foil picks win), falling back to the local meta.
 */
export function mergeVaultQuantities(localEntries, cloudRows) {
  const cloudByKey = new Map();
  for (const row of cloudRows || []) cloudByKey.set(lc(row.card_name), row);
  const out = [];
  for (const entry of localEntries || []) {
    if (!entry?.name) continue;
    const cloud = cloudByKey.get(lc(entry.name));
    const localQty = Math.max(1, entry.quantity | 0);
    const meta = (cloud?.meta && Object.keys(cloud.meta).length > 0)
      ? cloud.meta
      : (entry.meta && Object.keys(entry.meta).length > 0 ? entry.meta : null);
    out.push({
      card_name: cloud?.card_name || entry.name,
      quantity: Math.max(localQty, cloud?.quantity || 0),
      meta,
    });
  }
  return out;
}

/**
 * Upload the local (signed-out) collection into the signed-in user's
 * cloud Vault. Merge semantics via mergeVaultQuantities. Throws on any
 * failed chunk so the caller does NOT clear local data or set the
 * migrated flag — a retry next session is safe because of the max()
 * merge. On full success the local copy is cleared here.
 *
 * Returns { uploaded } — the number of card names written.
 */
export async function migrateLocalCollection() {
  const local = readLocalCollectionEntries();
  if (local.length === 0) return { uploaded: 0 };
  const userId = await currentUserId();
  if (!userId) throw new Error('not signed in');

  const CHUNK = 100;
  let uploaded = 0;
  for (let i = 0; i < local.length; i += CHUNK) {
    const slice = local.slice(i, i + CHUNK);
    const names = slice.map((e) => e.name);
    const { data: existing, error: readErr } = await supabase
      .from('collection')
      .select('card_name, quantity, meta')
      .eq('user_id', userId)
      .in('card_name', names);
    if (readErr) throw new Error(readErr.message || String(readErr));
    const payload = mergeVaultQuantities(slice, existing || []).map((row) => ({
      user_id: userId,
      ...row,
    }));
    const { error } = await supabase
      .from('collection')
      .upsert(payload, { onConflict: 'user_id,card_name' });
    if (error) throw new Error(error.message || String(error));
    uploaded += payload.length;
  }
  clearLocalCollection();
  return { uploaded };
}
