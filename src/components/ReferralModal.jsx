import React, { useState } from 'react';
import { X, Gift, ExternalLink, Copy, Check } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { cardmarketReferralUrl, cardmarketReferrerUsername } from '../lib/affiliate.js';

/**
 * Cardmarket refer-a-friend pop-up for UK/EU players. Cardmarket can only
 * attribute referrals at signup (no per-URL affiliate), so the ask is:
 * if you're new to Cardmarket, enter a friend's username when you join.
 *
 * Auto-prompt only (engagement-gated in App.jsx). Coordinated with the
 * Tip Jar so only one fires per session — see referralPrompt.js. The
 * footer mirrors the Tip Jar: "Maybe later" defers ~30 days, "Close →"
 * dismisses for good.
 */
export function ReferralModal({ onClose, onRemindLater = null, autoPrompted = false }) {
  const [copied, setCopied] = useState(false);
  const cmUser = cardmarketReferrerUsername();

  // Nothing to refer without a configured username — render nothing so a
  // misconfigured build can't show an empty prompt.
  if (!cmUser) return null;

  const copyCmUser = async () => {
    try {
      await navigator.clipboard.writeText(cmUser);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore — copy is a convenience, not required
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(var(--bg-rgb),0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-md max-h-[90vh] flex flex-col border" style={{ background: BG, borderColor: CREAM_FAINT }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
            <Gift className="w-3.5 h-3.5" style={{ color: ACCENT }} /> Buying in the UK / EU?
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }} className="hover:opacity-100 transition" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {autoPrompted && (
            <p className="font-serif text-xs italic leading-snug" style={{ color: CREAM_DIM }}>
              Spotted you're shopping in pounds/euros — you can close this, it won't pop up again unless you ask.
            </p>
          )}

          <p className="font-serif text-sm leading-snug" style={{ color: CREAM }}>
            Cardmarket is the main singles marketplace in the UK and Europe, and Vault's buy links already point there for you.
          </p>

          <div className="border-t pt-4 space-y-2" style={{ borderColor: CREAM_FAINT }}>
            <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
              New to Cardmarket? A free way to help.
            </div>
            <p className="font-serif text-xs leading-snug" style={{ color: CREAM }}>
              Cardmarket pays Vault a tiny referral fee when someone signs up with a friend's username — at no cost to you. If you don't have an account yet, use{' '}
              <button
                onClick={copyCmUser}
                className="inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.5 border hover:opacity-100 align-baseline"
                style={{ borderColor: CREAM_FAINT, color: CREAM }}
                title="Copy username"
              >
                {cmUser}
                {copied ? <Check className="w-3 h-3" style={{ color: ACCENT }} /> : <Copy className="w-3 h-3" />}
              </button>
              {' '}at signup.
            </p>
            <a
              href={cardmarketReferralUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100"
              style={{ color: CREAM_DIM }}
            >
              Open Cardmarket signup <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex justify-between items-center gap-3" style={{ borderColor: CREAM_FAINT }}>
          {onRemindLater ? (
            <button
              onClick={onRemindLater}
              className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100"
              style={{ color: CREAM_DIM }}
            >
              Maybe later
            </button>
          ) : <span />}
          <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100" style={{ color: CREAM }}>
            Close →
          </button>
        </div>
      </div>
    </div>
  );
}
