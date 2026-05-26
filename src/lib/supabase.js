/**
 * Supabase client + auth state.
 *
 * Singleton client initialised from build-time Vite env vars:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * Both have public defaults baked into vite.config.js so the deployed
 * Pages build works without secrets — these are publishable keys
 * (sb_publishable_*), not service-role secrets. Override in a local
 * .env.local for development against your own Supabase project.
 *
 * Exports:
 *   supabase           — the live client (or null if not configured)
 *   useAuthState()     — React hook returning { user, session, loading }
 *   isCloudEnabled()   — true when both env vars are present
 *   signInWithEmail(email, redirectTo)
 *   signInWithGoogle(redirectTo)
 *   signOut()
 */

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = URL && KEY
  ? createClient(URL, KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Use the URL path as redirect after magic-link verification.
        flowType: 'pkce',
      },
    })
  : null;

/**
 * Pull any OAuth callback params out of the URL and surface errors.
 * Returns the captured error string (if any) so the UI can show it.
 *
 * Called once on app boot — Supabase parses the `?code=...&state=...`
 * itself on init, but leaves the URL alone (which means a refresh
 * re-triggers the exchange and gets "flow_state_already_used"). We
 * scrub the params after a tick so the next reload starts fresh.
 *
 * Also surfaces `?error=...&error_description=...` so users see a
 * concrete message when an OAuth flow fails instead of nothing.
 */
export function consumeOAuthParams() {
  if (typeof window === 'undefined') return null;
  const { search, hash } = window.location;
  const hasAuthParams =
    /[?&](code|state|error|error_code|error_description|access_token|refresh_token)=/.test(search) ||
    /[#&](access_token|error|error_code)=/.test(hash);
  if (!hasAuthParams) return null;

  // Grab any error before we clear the URL.
  const params = new URLSearchParams(search.replace(/^\?/, '') + '&' + hash.replace(/^#/, ''));
  const error = params.get('error_description') || params.get('error') || null;

  // Defer the cleanup so Supabase has its chance to parse first. Without
  // this, the SDK reads an empty URL and never picks up the session.
  setTimeout(() => {
    try {
      const url = new window.URL(window.location.href);
      url.search = '';
      url.hash = '';
      window.history.replaceState({}, '', url.toString());
    } catch {}
  }, 1500);

  return error;
}

export function isCloudEnabled() {
  return !!supabase;
}

/**
 * React hook that subscribes to auth state. Returns { user, session, loading }
 * where loading is true until the initial session check resolves.
 */
export function useAuthState() {
  const [state, setState] = useState({ user: null, session: null, loading: !!supabase });

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState({ session: data.session, user: data.session?.user || null, loading: false });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setState({ session, user: session?.user || null, loading: false });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

export async function signInWithEmail(email, redirectTo) {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo || window.location.href },
  });
  if (error) throw error;
}

export async function signInWithGoogle(redirectTo) {
  if (!supabase) throw new Error('Cloud sync is not configured.');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectTo || window.location.href },
  });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
