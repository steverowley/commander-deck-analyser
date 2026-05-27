// Phase 2c — PayPal Donate webhook handler.
//
// PayPal POSTs here on PAYMENT.SALE.COMPLETED. We:
//   1. Verify the signature against PayPal's verify-webhook-signature endpoint
//      (needs an OAuth access token from the app's client_id/secret).
//   2. Look up resource.custom — set by the Donate button to the tipper's
//      Supabase user_id.
//   3. Insert the event_id into public.paypal_events to gate idempotency:
//      duplicate redeliveries hit the primary-key conflict and short-circuit
//      without double-incrementing the supporter_total_cents counter.
//   4. Bump profiles.supporter / supporter_total_cents / supporter_since for
//      that user. The BEFORE INSERT/UPDATE trigger on profiles allows the
//      service_role to write these columns; clients are blocked.
//
// Anonymous tips (no custom field, or unrecognised user_id) are recorded in
// paypal_events for accounting but do not flip any badge.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type PayPalHeaders = {
  auth_algo: string;
  cert_url: string;
  transmission_id: string;
  transmission_sig: string;
  transmission_time: string;
};

const PAYPAL_ENV = (Deno.env.get('PAYPAL_ENV') || 'sandbox').toLowerCase();
const PAYPAL_API_BASE = PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';
const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID') || '';
const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_CLIENT_SECRET') || '';
const PAYPAL_WEBHOOK_ID = Deno.env.get('PAYPAL_WEBHOOK_ID') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// PayPal OAuth tokens are valid for ~9h. Cache in-memory to avoid an extra
// round-trip on every webhook.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getPayPalAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const credentials = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal token request failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 0) * 1000,
  };
  return cachedToken.token;
}

async function verifyWebhookSignature(
  headers: PayPalHeaders,
  rawEvent: unknown,
): Promise<boolean> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...headers,
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: rawEvent,
    }),
  });
  if (!res.ok) {
    console.warn('verify-webhook-signature non-OK', res.status, await res.text());
    return false;
  }
  const data = await res.json();
  return data.verification_status === 'SUCCESS';
}

function readPayPalHeaders(req: Request): PayPalHeaders | null {
  const h = req.headers;
  const auth_algo = h.get('paypal-auth-algo');
  const cert_url = h.get('paypal-cert-url');
  const transmission_id = h.get('paypal-transmission-id');
  const transmission_sig = h.get('paypal-transmission-sig');
  const transmission_time = h.get('paypal-transmission-time');
  if (!auth_algo || !cert_url || !transmission_id || !transmission_sig || !transmission_time) {
    return null;
  }
  return { auth_algo, cert_url, transmission_id, transmission_sig, transmission_time };
}

function parseAmountToCents(amountTotal: unknown): number {
  if (typeof amountTotal !== 'string' && typeof amountTotal !== 'number') return 0;
  const parsed = Number.parseFloat(String(amountTotal));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  // Read once; we need the raw text (PayPal hashes the body for signature
  // verification) AND the parsed object for both verify + business logic.
  const rawBody = await req.text();
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  const headers = readPayPalHeaders(req);
  if (!headers) {
    return new Response('missing PayPal headers', { status: 400 });
  }

  const verified = await verifyWebhookSignature(headers, event);
  if (!verified) {
    return new Response('signature verification failed', { status: 400 });
  }

  const eventId = event?.id;
  const eventType = event?.event_type;
  if (!eventId) {
    return new Response('missing event id', { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Idempotency: insert the event_id; conflict means we've already
  // processed it (PayPal redelivers freely). Return 200 so PayPal stops
  // retrying without double-counting.
  const { error: idempErr } = await supabase
    .from('paypal_events')
    .insert({ event_id: eventId });
  if (idempErr) {
    if (idempErr.code === '23505' || /duplicate/i.test(idempErr.message)) {
      return new Response('duplicate event', { status: 200 });
    }
    console.error('idempotency insert failed', idempErr);
    return new Response('db error', { status: 500 });
  }

  // We only act on completed sales. Other event types (refunds, disputes,
  // etc.) are recorded in paypal_events (above) but not used to flip a
  // badge. Return 200 so PayPal stops retrying.
  if (eventType !== 'PAYMENT.SALE.COMPLETED') {
    return new Response('event ignored', { status: 200 });
  }

  const resource = event?.resource ?? {};
  const userId = typeof resource.custom === 'string' && resource.custom.length > 0
    ? resource.custom
    : null;
  const cents = parseAmountToCents(resource?.amount?.total);

  if (!userId || cents <= 0) {
    // Anonymous tip or malformed amount — we keep the event row for
    // accounting but don't flip any badge.
    return new Response('no attribution', { status: 200 });
  }

  // Read-modify-write for the cents counter (no RPC available, and the
  // trigger blocks setting an absolute total via the JS upsert path).
  const { data: row, error: readErr } = await supabase
    .from('profiles')
    .select('supporter_total_cents, supporter_since')
    .eq('user_id', userId)
    .maybeSingle();
  if (readErr) {
    console.error('profile read failed', readErr);
    return new Response('db error', { status: 500 });
  }
  if (!row) {
    // User deleted their account after tipping. Recorded in paypal_events
    // for accounting; nothing to flip.
    return new Response('user gone', { status: 200 });
  }

  const newTotal = (row.supporter_total_cents ?? 0) + cents;
  const since = row.supporter_since ?? new Date().toISOString();

  const { error: updErr } = await supabase
    .from('profiles')
    .update({
      supporter: true,
      supporter_total_cents: newTotal,
      supporter_since: since,
    })
    .eq('user_id', userId);
  if (updErr) {
    console.error('profile update failed', updErr);
    return new Response('db error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});
