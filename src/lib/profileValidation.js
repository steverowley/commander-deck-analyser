/**
 * Pure username validation — no Supabase import.
 *
 * Split out of profile.js so unit tests can exercise the rules without
 * importing the Supabase client (which calls createClient() at module
 * load and throws on Node < 22 without native WebSocket — that hits the
 * CI runner). Same precedent as podsAgg.js vs pods.js.
 */

export const USERNAME_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9_-]{1,23}$/;

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
