/**
 * Sign-in modal — magic link by default, Google OAuth as a one-click
 * alternative. No password form (Supabase doesn't need one for either
 * flow).
 */

import React, { useState } from 'react';
import { X, Loader2, Check, Mail } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { signInWithEmail, signInWithGoogle } from '../lib/supabase.js';

export function AuthModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const sendMagicLink = async () => {
    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email.trim());
      setSent(true);
    } catch (e) {
      setError(e.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      // OAuth redirects the browser away — control doesn't return here.
    } catch (e) {
      setError(e.message || 'Google sign-in failed.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-md flex flex-col border" style={{ background: BG, borderColor: CREAM_FAINT }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
            Sign in to Vault
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
            Sync your decks across devices. Share public decks via the gallery. Existing decks in this browser auto-upload on first sign-in.
          </p>

          {sent ? (
            <div className="border p-4" style={{ borderColor: CREAM_FAINT, background: 'rgba(163,201,138,0.06)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Check className="w-4 h-4" style={{ color: '#a3c98a' }} />
                <span className="font-serif text-sm tracking-[0.2em] uppercase font-bold" style={{ color: '#a3c98a' }}>
                  Check your inbox
                </span>
              </div>
              <p className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
                We sent a magic link to <span style={{ color: CREAM }}>{email}</span>. Click it to finish signing in. You can close this window.
              </p>
            </div>
          ) : (
            <>
              <div>
                <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
                  Magic link
                </div>
                <div
                  className="flex items-center gap-3 border px-4 py-2.5"
                  style={{ borderColor: CREAM_FAINT, background: 'rgba(243,231,201,0.02)' }}
                >
                  <Mail className="w-3.5 h-3.5" style={{ color: CREAM_DIM }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendMagicLink(); }}
                    placeholder="you@example.com"
                    autoFocus
                    disabled={busy}
                    className="flex-1 bg-transparent focus:outline-none font-mono text-sm"
                    style={{ color: CREAM }}
                  />
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: CREAM_DIM }} />}
                </div>
                <button
                  onClick={sendMagicLink}
                  disabled={busy || !email.trim()}
                  className="mt-2 w-full font-serif text-[10px] tracking-[0.3em] uppercase border py-2 disabled:opacity-30"
                  style={{ borderColor: CREAM_FAINT, color: CREAM }}
                >
                  {busy ? 'Sending...' : 'Send magic link →'}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }} />
                <span className="font-mono text-[10px] tracking-wider" style={{ color: CREAM_DIM }}>or</span>
                <span className="flex-1 border-t" style={{ borderColor: CREAM_FAINT }} />
              </div>

              <button
                onClick={google}
                disabled={busy}
                className="w-full font-serif text-[10px] tracking-[0.3em] uppercase border py-2.5 flex items-center justify-center gap-2 disabled:opacity-30"
                style={{ borderColor: CREAM_FAINT, color: CREAM }}
              >
                <span style={{ fontSize: '0.9rem' }}>G</span>
                Continue with Google →
              </button>
            </>
          )}

          {error && (
            <div className="px-4 py-3 border" style={{ borderColor: ACCENT, background: 'rgba(196,74,63,0.06)' }}>
              <div className="font-mono text-xs" style={{ color: CREAM }}>{error}</div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t font-serif text-[10px] tracking-[0.3em] uppercase text-center" style={{ borderColor: CREAM_FAINT, color: CREAM_DIM }}>
          No password. Sign-in link expires in 1 hour.
        </div>
      </div>
    </div>
  );
}
