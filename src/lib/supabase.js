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
