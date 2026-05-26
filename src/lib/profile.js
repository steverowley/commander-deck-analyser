/**
 * Profile helpers — reads / writes the `profiles` row keyed on
 * `user_id`. The row stores the public-facing `username` used in
 * the gallery's "shared by @<username>" credit line.
 *
 * Returns nulls when cloud sync isn't configured so call sites can
 * skip gracefully in local-only mode.
 */

import { supabase } from './supabase.js';

const USERNAME_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9_-]{1,23}$/;

export function validateUsername(username) {
  if (!username) return 'Username is required.';
  const trimmed = username.trim();
  if (trimmed.length < 2) return 'Username must be at least 2 characters.';
  if (trimmed.length > 24) return 'Username must be 24 characters or fewer.';
  if (!USERNAME_PATTERN.test(trimmed)) {
    return 'Use letters, digits, underscore and hyphen only. Start with a letter, digit, or underscore.';
  }
  return null;
}

/**
 * Read the current user's profile row. Returns null on failure or
 * when the user has no row yet.
 */
export async function loadProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, created_at')
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
