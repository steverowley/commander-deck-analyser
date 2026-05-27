/**
 * Profile modal — view/edit username + see basic account info.
 *
 * Two display modes:
 * - When `onboarding` is true, the modal is locked into the username
 *   step and there's no Cancel button. Used right after first sign-in
 *   when the user hasn't picked a username yet.
 * - Otherwise it's a regular profile editor accessible from the nav.
 */

import React, { useEffect, useState } from 'react';
import { X, Loader2, Check, User } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { loadProfile, saveUsername, validateUsername } from '../lib/profile.js';
import { SettingsBody } from './Modals.jsx';

export function ProfileModal({ user, onClose, onboarding = false, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [createdAt, setCreatedAt] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!user?.id) {
      setLoading(false);
      return;
    }
    loadProfile(user.id).then((p) => {
      if (!alive) return;
      setUsername(p?.username || '');
      setCreatedAt(p?.created_at || null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user?.id]);

  const validationError = username && validateUsername(username);

  const save = async () => {
    setError(null);
    setBusy(true);
    setSaved(false);
    try {
      const { ok, error: err } = await saveUsername(user.id, username);
      if (!ok) {
        setError(err);
        return;
      }
      setSaved(true);
      onSaved?.(username.trim());
      // Auto-close after a beat so the user sees the green tick.
      setTimeout(() => onClose?.(), 700);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(var(--bg-rgb),0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col border"
        style={{ background: BG, borderColor: CREAM_FAINT }}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: CREAM_FAINT }}>
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5" style={{ color: CREAM_DIM }} />
            <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold" style={{ color: CREAM }}>
              {onboarding ? 'Choose a username' : 'Profile'}
            </div>
          </div>
          {!onboarding && (
            <button onClick={onClose} style={{ color: CREAM_DIM }} disabled={busy}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {onboarding && (
            <p className="font-serif text-sm italic" style={{ color: CREAM_DIM }}>
              Pick a username — it shows up on any decks you share to the public gallery. You can change it later.
            </p>
          )}

          {loading ? (
            <div className="flex items-center gap-2 font-mono text-xs" style={{ color: CREAM_DIM }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading profile...
            </div>
          ) : (
            <>
              <div>
                <div className="font-serif text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: CREAM_DIM }}>
                  Username
                </div>
                <div
                  className="flex items-center gap-3 border px-4 py-2.5"
                  style={{ borderColor: CREAM_FAINT, background: 'rgba(var(--ink-rgb),0.02)' }}
                >
                  <span className="font-mono text-sm" style={{ color: CREAM_DIM }}>@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !validationError && !busy) save(); }}
                    placeholder="your-handle"
                    maxLength={24}
                    autoFocus
                    disabled={busy}
                    className="flex-1 bg-transparent focus:outline-none font-mono text-sm"
                    style={{ color: CREAM }}
                  />
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: CREAM_DIM }} />}
                  {saved && <Check className="w-3.5 h-3.5" style={{ color: '#a3c98a' }} />}
                </div>
                {validationError && username.length > 0 && (
                  <div className="font-mono text-[10px] mt-1.5" style={{ color: ACCENT }}>{validationError}</div>
                )}
                <div className="font-serif text-xs italic mt-2" style={{ color: CREAM_DIM }}>
                  2–24 chars. Letters, digits, underscore and hyphen.
                </div>
              </div>

              {!onboarding && (
                <div className="border-t pt-3 grid grid-cols-2 gap-3" style={{ borderColor: CREAM_FAINT }}>
                  <div>
                    <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
                      Email
                    </div>
                    <div className="font-mono text-xs mt-1 truncate" style={{ color: CREAM }} title={user?.email}>
                      {user?.email || '—'}
                    </div>
                  </div>
                  {createdAt && (
                    <div>
                      <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
                        Member since
                      </div>
                      <div className="font-mono text-xs mt-1" style={{ color: CREAM }}>
                        {new Date(createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="px-4 py-3 border" style={{ borderColor: ACCENT, background: 'rgba(var(--accent-rgb),0.06)' }}>
              <div className="font-mono text-xs" style={{ color: CREAM }}>{error}</div>
            </div>
          )}
        </div>

        {!onboarding && (
          <div className="border-t" style={{ borderColor: CREAM_FAINT }}>
            <div
              className="px-5 pt-4 font-serif text-[10px] tracking-[0.3em] uppercase"
              style={{ color: CREAM_DIM }}
            >
              Preferences
            </div>
            <SettingsBody />
          </div>
        )}

        <div className="px-5 py-3 border-t flex items-center justify-end gap-4 shrink-0" style={{ borderColor: CREAM_FAINT }}>
          {!onboarding && (
            <button
              onClick={onClose}
              disabled={busy}
              className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100 disabled:opacity-30"
              style={{ color: CREAM_DIM }}
            >
              Close
            </button>
          )}
          <button
            onClick={save}
            disabled={busy || !!validationError || !username.trim()}
            className="font-serif text-[10px] tracking-[0.3em] uppercase border px-4 py-2 disabled:opacity-30"
            style={{ borderColor: CREAM, color: CREAM, background: 'rgba(var(--ink-rgb),0.06)' }}
          >
            {busy ? 'Saving...' : onboarding ? 'Save →' : 'Save settings →'}
          </button>
        </div>
      </div>
    </div>
  );
}
