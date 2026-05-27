import React, { useState } from 'react';
import { X, Heart, ExternalLink, Copy, Check } from 'lucide-react';
import { CREAM, CREAM_DIM, CREAM_FAINT, BG, ACCENT } from '../theme.js';
import { paypalMeUrl, hasTipJar, TIP_PRESETS } from '../lib/billing.js';
import { cardmarketReferralUrl, cardmarketReferrerUsername } from '../lib/affiliate.js';

/**
 * Tip jar — opens from the footer link. Renders PayPal.Me preset buttons
 * (and a custom-amount input) so a tipper opens PayPal in a new tab and
 * completes the payment there. The supporter badge is flipped manually
 * for now; the next slice replaces this with the PayPal Donate SDK +
 * webhook auto-attribution.
 *
 * Also surfaces the Cardmarket EU referral CTA, since signup is the only
 * point Cardmarket can attribute referrals (no per-URL affiliate).
 */
export function TipModal({ onClose, justTipped = false }) {
  const [custom, setCustom] = useState('');
  const [copied, setCopied] = useState(false);
  const cmUser = cardmarketReferrerUsername();
  const tipsEnabled = hasTipJar();

  const openTip = (amount) => {
    const url = paypalMeUrl(amount);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const copyCmUser = async () => {
    if (!cmUser) return;
    try {
      await navigator.clipboard.writeText(cmUser);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore — copy is a convenience, not required
    }
  };

  const customNum = Number(custom);
  const customValid = Number.isFinite(customNum) && customNum > 0;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(13,22,20,0.92)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-md max-h-[90vh] flex flex-col border" style={{ background: BG, borderColor: CREAM_FAINT }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: CREAM_FAINT }}>
          <div className="font-serif text-sm tracking-[0.3em] uppercase font-bold flex items-center gap-2" style={{ color: CREAM }}>
            <Heart className="w-3.5 h-3.5" style={{ color: ACCENT }} /> Tip jar
          </div>
          <button onClick={onClose} style={{ color: CREAM_DIM }} className="hover:opacity-100 transition" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {justTipped && (
            <div
              className="border px-4 py-3 font-serif text-xs italic"
              style={{ borderColor: ACCENT, color: CREAM, background: 'rgba(196,74,63,0.06)' }}
            >
              Thanks — that means a lot. Your supporter badge will appear within 24h (we add them manually for now).
            </div>
          )}

          <p className="font-serif text-sm leading-snug" style={{ color: CREAM }}>
            Vault is free and ad-free. If it's saved you time, a small tip keeps it that way — every few dollars covers another month of hosting.
          </p>

          {tipsEnabled ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {TIP_PRESETS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => openTip(amt)}
                    className="font-serif text-sm tracking-[0.2em] uppercase border py-3 hover:opacity-100 transition"
                    style={{ borderColor: CREAM_FAINT, color: CREAM, opacity: 0.85 }}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
              <div className="flex border" style={{ borderColor: CREAM_FAINT }}>
                <span className="px-3 py-2 font-mono text-xs flex items-center" style={{ color: CREAM_DIM, borderRight: `1px solid ${CREAM_FAINT}` }}>$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="1"
                  placeholder="Other amount"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  className="flex-1 px-3 py-2 font-mono text-xs bg-transparent outline-none"
                  style={{ color: CREAM }}
                />
                <button
                  onClick={() => customValid && openTip(customNum)}
                  disabled={!customValid}
                  className="px-3 py-2 font-serif text-[10px] tracking-[0.3em] uppercase flex items-center gap-1.5 disabled:opacity-30"
                  style={{ color: CREAM, borderLeft: `1px solid ${CREAM_FAINT}` }}
                >
                  Send <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              <p className="font-serif text-[11px] italic leading-snug" style={{ color: CREAM_DIM }}>
                Opens PayPal in a new tab. Supporter badge appears within 24h — we add them manually until the auto-flip lands.
              </p>
            </div>
          ) : (
            <p className="font-serif text-xs italic" style={{ color: CREAM_DIM }}>
              Tipping isn't configured for this build. Sorry about that — try the deployed site at vault-mtg.com.
            </p>
          )}

          {cmUser && (
            <div className="border-t pt-4 space-y-2" style={{ borderColor: CREAM_FAINT }}>
              <div className="font-serif text-[10px] tracking-[0.3em] uppercase" style={{ color: CREAM_DIM }}>
                EU player? Other way to help.
              </div>
              <p className="font-serif text-xs leading-snug" style={{ color: CREAM }}>
                Cardmarket pays a tiny referral fee when someone signs up with a friend's username — no cost to you. If you're new to Cardmarket, use{' '}
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
          )}
        </div>

        <div className="px-5 py-4 border-t flex justify-end" style={{ borderColor: CREAM_FAINT }}>
          <button onClick={onClose} className="font-serif text-[10px] tracking-[0.3em] uppercase hover:opacity-100" style={{ color: CREAM }}>
            Close →
          </button>
        </div>
      </div>
    </div>
  );
}
