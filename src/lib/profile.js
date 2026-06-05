/**
 * Profile helpers — reads / writes the `profiles` row keyed on
 * `user_id`. The row stores the public-facing `username` used in
 * the gallery's "shared by @<username>" credit line.
 *
 * Returns nulls when cloud sync isn't configured so call sites can
 * skip gracefully in local-only mode.
 */

import { supabase } from './supabase.js';
// Username validation lives in a Supabase-free module so it can be unit
// tested without loading the client (createClient throws on Node < 22 in
// CI). Re-exported here to keep profile.js's public API unchanged.
import { validateUsername } from './profileValidation.js';

export { validateUsername };

/**
 * Read the current user's profile row. Returns null on failure or
 * when the user has no row yet.
 *
 * `supporter`, `supporter_since`, `supporter_total_cents` are written
 * exclusively by the PayPal webhook edge function — a database trigger
 * blocks any client-side update. `pref_retailer` is owner-writable.
 */
export async function loadProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, created_at, supporter, supporter_since, supporter_total_cents, pref_retailer')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('Vault: loadProfile failed', error);
    return null;
  }
  return data;
}

/**
 * Upsert the current user's username. Returns { ok, error } — `error`
 * is a user-facing string (e.g. "Username is already taken.").
 */
export async function saveUsername(userId, username) {
  if (!supabase) return { ok: false, error: 'Cloud sync is not configured.' };
  if (!userId) return { ok: false, error: 'Not signed in.' };
  const validation = validateUsername(username);
  if (validation) return { ok: false, error: validation };

  const { error } = await supabase
    .from('profiles')
    .upsert(
      { user_id: userId, username: username.trim() },
      { onConflict: 'user_id' }
    );
  if (error) {
    if (error.code === '23505' || /duplicate/i.test(error.message)) {
      return { ok: false, error: 'That username is already taken.' };
    }
    return { ok: false, error: error.message || 'Failed to save username.' };
  }
  return { ok: true, error: null };
}
