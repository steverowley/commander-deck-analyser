/**
 * Lightweight disposable / throwaway email blocklist.
 *
 * A curated set of the most common temp-mail domains — not exhaustive, but it
 * stops the bulk of throwaway signups with no network call. Pure + unit-tested.
 * Real providers (gmail, outlook, proton, …) are never matched. Extend
 * DISPOSABLE_DOMAINS as new services show up in signups.
 */

export const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.net',
  'sharklasers.com', 'grr.la', 'guerrillamailblock.com',
  '10minutemail.com', '10minutemail.net', '20minutemail.com',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailo.com', 'tmpmail.org', 'tmpmail.net',
  'throwawaymail.com', 'throwaway.email', 'getnada.com', 'nada.email',
  'yopmail.com', 'yopmail.net', 'yopmail.fr',
  'maildrop.cc', 'mailnesia.com', 'mailcatch.com', 'dispostable.com',
  'trashmail.com', 'trashmail.de', 'trash-mail.com', 'wegwerfmail.de',
  'fakeinbox.com', 'fake-mail.net', 'mintemail.com', 'mohmal.com',
  'spam4.me', 'spamgourmet.com', 'mytemp.email',
  'emailondeck.com', 'discard.email', 'mailsac.com', 'inboxkitten.com',
  'tempr.email', 'burnermail.io', 'mailpoof.com', 'moakt.com',
]);

const EMAIL_RE = /^[^@\s]+@([^@\s]+)$/;

/** Lowercased domain part of an email, or null if it doesn't parse. */
export function emailDomain(email) {
  const m = String(email || '').trim().toLowerCase().match(EMAIL_RE);
  return m ? m[1] : null;
}

/**
 * Returns a user-facing error string if the email uses a known disposable
 * domain, otherwise null. Does not validate general email format (the input is
 * type=email and Supabase validates) — only the throwaway-domain check.
 */
export function disposableEmailError(email) {
  const domain = emailDomain(email);
  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    return 'Please use a permanent email address — disposable addresses aren’t allowed.';
  }
  return null;
}
