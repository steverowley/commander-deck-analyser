# `paypal-webhook` — operator setup

Edge function that flips `profiles.supporter = true` when a tip lands. Deployed
to the Vault Supabase project; live until secrets are configured the function
will reject every webhook with `400 signature verification failed` (PayPal's
verify endpoint can't authenticate without `PAYPAL_CLIENT_ID` /
`PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID`). Tips still flow through the
PayPal.Me fallback path; only the auto-badge attribution is dormant.

## One-time setup

### 1. PayPal Business app

PayPal Developer Dashboard → **Apps & Credentials** → **Create App**
(REST API, Merchant account type).

- Copy `Client ID` → goes to `PAYPAL_CLIENT_ID` Supabase secret.
- Copy `Secret` (the long one, *not* the username) → `PAYPAL_CLIENT_SECRET`.
- Toggle **Sandbox** vs **Live** at the top of the page — create both, you'll
  use sandbox for testing and live for production.

### 2. Hosted Donate button

PayPal merchant dashboard → **Pay & Get Paid → All Tools → PayPal Buttons →
Donate**.

- Choose preset amounts ($3 / $5 / $10) + "let donor enter amount".
- Save. Copy the **hosted button ID** (a string like `ABCDEF1234567`).
- Set `VITE_PAYPAL_BUTTON_ID` in the GitHub Actions build env (Settings →
  Secrets and variables → Actions → New repository secret).
- Set `VITE_PAYPAL_ENV` to `sandbox` initially, then `live`.

When unset, the TipModal falls back to PayPal.Me (set `VITE_PAYPAL_ME_URL` for
that path).

### 3. Webhook subscription

PayPal Developer Dashboard → your app → **Webhooks** → **Add Webhook**.

- URL: the function URL from `supabase functions list` (or Supabase Studio →
  Edge Functions → paypal-webhook → "Function URL"). Looks like
  `https://<project-ref>.supabase.co/functions/v1/paypal-webhook`.
- Subscribe to: **Payment sale completed** (`PAYMENT.SALE.COMPLETED`).
  Don't subscribe to anything else — the function ignores other event types
  but PayPal still retries them, which wastes function invocations.
- Save. Copy the **Webhook ID** → `PAYPAL_WEBHOOK_ID`.

### 4. Supabase secrets

```bash
supabase secrets set \
  PAYPAL_CLIENT_ID=… \
  PAYPAL_CLIENT_SECRET=… \
  PAYPAL_WEBHOOK_ID=… \
  PAYPAL_ENV=sandbox
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by
Supabase — you do not need to set them.

### 5. Sandbox test

PayPal Developer Dashboard → **Sandbox Accounts** → create a personal +
business sandbox account if you don't have them. Sandbox accounts have fake
balances you can tip with.

1. Build the app with `VITE_PAYPAL_ENV=sandbox` and the sandbox button ID.
2. Sign into Vault, open the Tip jar modal, click Donate.
3. Pay with the sandbox personal account.
4. Check `supabase functions logs paypal-webhook` — should see
   `verify-webhook-signature → SUCCESS` and one row in `paypal_events`.
5. Check `profiles` for your user → `supporter = true`,
   `supporter_total_cents` incremented, `supporter_since` set.
6. Resend the same event from the PayPal dashboard → confirm function
   returns `200 duplicate event` quickly AND `supporter_total_cents` does
   NOT double-count.

### 6. Flip to live

1. Re-do step 2 with the **live** button (it has a different ID).
2. Re-do step 3 against the **live** Developer Dashboard (different webhook
   ID).
3. `supabase secrets set PAYPAL_ENV=live PAYPAL_CLIENT_ID=<live-id> PAYPAL_CLIENT_SECRET=<live-secret> PAYPAL_WEBHOOK_ID=<live-webhook-id>`.
4. Rebuild + deploy the site so `VITE_PAYPAL_BUTTON_ID` picks up the live
   button ID.
5. Tip yourself $3 to verify end-to-end. Hit "I want this charge reversed"
   in your PayPal account afterwards if you'd rather not pay the fee on
   your own test.

## How it works (quick)

1. **Signature verify** — call PayPal's `/v1/notifications/verify-webhook-signature`
   with the incoming headers + parsed event. Uses a cached OAuth access token
   (client-credentials grant, ~9h TTL).
2. **Idempotency** — `INSERT INTO paypal_events (event_id)`. Conflict =
   already processed → return 200 without touching profiles.
3. **Attribute** — `resource.custom` is the Supabase user_id (set by the
   Donate button via `custom = userId`). Anonymous tips (no `custom`) are
   recorded but don't flip any badge.
4. **Flip** — read-modify-write on `profiles`: `supporter = true`,
   `supporter_total_cents += amount`, `supporter_since = coalesce(since, now())`.
   Service-role write — the trigger added in v0.15.0 bypasses for service_role.

## Debugging

- **Every webhook returns 400** — check `supabase functions logs paypal-webhook`
  for `verify-webhook-signature non-OK`. Almost always a stale or wrong
  `PAYPAL_WEBHOOK_ID` (the webhook gets a new ID if you delete + recreate it).
- **Webhook succeeds but badge doesn't flip** — check the function log for
  `no attribution` (anonymous tip — sign in first), `user gone` (account
  deleted between tip + webhook), or a DB error.
- **CSP blocks Donate SDK in the browser** — confirm
  `https://www.paypalobjects.com` is in `script-src` and `img-src`, and
  `https://www.paypal.com` (+ `sandbox.paypal.com`) in `connect-src` and
  `frame-src`. The CSP lives in `vite.config.js`.

## Redeploy

```bash
supabase functions deploy paypal-webhook --no-verify-jwt
```

`--no-verify-jwt` is essential: PayPal can't send a Supabase JWT, the
function handles its own auth via signature verification.
