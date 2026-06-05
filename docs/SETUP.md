# Vault — operator setup guide

Step-by-step instructions for switching on the integrations that ship with the
app. The **code for all of these is already merged**; each one stays inert
until you add its key, so nothing here is urgent and nothing can break by being
left undone.

Ordered easiest-and-most-valuable first. Parts 1–5 are **free**. Part 6 is
monetization, for when you're ready.

- **Repo:** https://github.com/steverowley/commander-deck-analyser
- **Live site:** https://steverowley.github.io/commander-deck-analyser/
- **Supabase project:** `jpukcgqumytxjwflxrtd` (region eu-west-1)

---

## Two things you'll reuse (read once)

### Adding a GitHub "Variable" vs "Secret"
Both live at **repo → Settings → Secrets and variables → Actions**, on different tabs:

- **Variables** (public-ish values: analytics / captcha / Sentry keys):
  https://github.com/steverowley/commander-deck-analyser/settings/variables/actions
  → **New repository variable**
- **Secrets** (true secrets: your database password):
  https://github.com/steverowley/commander-deck-analyser/settings/secrets/actions
  → **New repository secret**

### "Redeploy"
After adding any `VITE_*` **variable**, rebuild the site so it picks up the new value:

1. Go to **Actions → Deploy to GitHub Pages**:
   https://github.com/steverowley/commander-deck-analyser/actions/workflows/deploy.yml
2. Click **Run workflow** (dropdown, right side) → branch **main** → **Run workflow**.
3. ~1 minute later the site is live with the new value.

You can add several variables first and redeploy **once** at the end.
(The database-backup secret does **not** need a redeploy.)

---

## 1. Uptime alerts (~2 min, free)
*So you're told the moment the site goes down — the gap that let it sit broken before.*

1. Sign up free at https://uptimerobot.com/
2. **+ New monitor** → type **HTTP(s)**.
3. Name: `Vault`. URL: `https://steverowley.github.io/commander-deck-analyser/`
4. Interval: 5 minutes. Tick your email under **Alert contacts** → **Create monitor**.

No code, no redeploy.

---

## 2. Visitor analytics (~5 min, free) — PR #169
*Cloudflare Web Analytics: privacy-first, cookieless, no cookie banner needed.*

1. https://dash.cloudflare.com/ → **Analytics & Logs → Web Analytics** (or
   https://www.cloudflare.com/web-analytics/ → Get started).
2. **Add a site** → hostname `steverowley.github.io`.
3. It shows a JS snippet containing a token, e.g.
   `data-cf-beacon='{"token": "abc123..."}'` — copy **just the token**.
4. GitHub **Variables** tab → **New repository variable**:
   - Name: `VITE_CF_ANALYTICS_TOKEN`
   - Value: *(the token)*
5. **Redeploy**. Visit the site, then check the Web Analytics dashboard — views
   appear within a couple of minutes.

---

## 3. Error tracking (~5 min, free) — PR #173
*Sentry: get emailed when something breaks in production.*

1. Sign up free at https://sentry.io/signup/
2. New project → platform **React**.
3. Copy the **DSN** (a URL like `https://abc@o123.ingest.sentry.io/456`). Later
   it's under **Settings → Projects → [project] → Client Keys (DSN)**.
4. GitHub **Variables** tab → **New repository variable**:
   - Name: `VITE_SENTRY_DSN`
   - Value: *(the DSN)*
5. **Redeploy**.

---

## 4. Nightly database backups (~5 min, free) — PR #170
*Protects real user data — the Supabase free tier has no point-in-time recovery.*
*(More detail in [BACKUP.md](BACKUP.md).)*

1. Open the Supabase project:
   https://supabase.com/dashboard/project/jpukcgqumytxjwflxrtd
2. **Connect** (top bar) → **Session pooler** tab.
   - ⚠️ **Session pooler**, NOT "Direct connection" — GitHub's servers can't
     reach the direct (IPv6-only) one.
3. Copy the connection string:
   `postgresql://postgres.jpukcgqumytxjwflxrtd:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`
4. Replace `[YOUR-PASSWORD]` with your DB password. (Forgot it? Settings →
   Database → **Reset database password**.)
5. GitHub **Secrets** tab → **New repository secret**:
   - Name: `SUPABASE_DB_URL`
   - Value: *(the full string, with the password filled in)*
6. Test: **Actions → Nightly DB backup** →
   https://github.com/steverowley/commander-deck-analyser/actions/workflows/backup.yml
   → **Run workflow** → wait for the green check → open the run → download the
   **`vault-db-backup`** artifact to confirm you got a `.sql.gz`.

Then it runs automatically every night (artifacts kept 90 days). No redeploy needed.

---

## 5. Signup abuse protection (~10 min, free) — PR #172
*Cloudflare Turnstile captcha. Do this before any marketing push.*
*(The disposable-email blocklist is already live — no setup.)*

This one has **two keys in two places — set both, or email sign-in breaks.**

1. https://dash.cloudflare.com/ → **Turnstile**
   (docs: https://developers.cloudflare.com/turnstile/) → **Add widget**.
2. Name `Vault`; hostname `steverowley.github.io`; mode **Managed** → **Create**.
3. You get a **Site Key** (public) and a **Secret Key** (private).
4. **Site Key** → GitHub **Variables** tab → **New repository variable**:
   - Name: `VITE_TURNSTILE_SITE_KEY` → Value: *(Site Key)*
5. **Secret Key** → Supabase →
   https://supabase.com/dashboard/project/jpukcgqumytxjwflxrtd →
   **Authentication → Settings → Bot and Abuse Protection** → enable **CAPTCHA**
   → provider **Turnstile** → paste **Secret Key** → **Save**.
6. **Redeploy**, then test by signing in.

> ⚠️ Both or neither. If only one side is set, magic-link sign-in fails. They're
> built to stay off together, so there's no rush — just do both halves at once.

---

## 6. Monetization (when ready — earns money) — issue #99

> **One-time prerequisite:** the front-end PayPal/affiliate values aren't wired
> into the deploy build yet (only analytics/captcha/Sentry are). That's a small
> code change — ask the assistant to "wire up monetization" and it'll open that
> PR. Then the steps below take effect.

### 6a. Affiliate links (easiest — free, no per-sale cost)
Apply to each, then add the code as a GitHub **Variable** and redeploy:

| Program | Apply at | GitHub Variable |
| --- | --- | --- |
| Card Kingdom | https://www.cardkingdom.com/ (affiliate/partner program) | `VITE_CARDKINGDOM_PARTNER` |
| TCGplayer (via Impact) | https://www.tcgplayer.com/ affiliate / https://impact.com/ | `VITE_TCGPLAYER_IMPACT_PREFIX` |
| Cardmarket | Cardmarket account → refer-a-friend | `VITE_CARDMARKET_REFERRER_USERNAME` |

### 6b. PayPal tips + supporter badge (more setup)
1. https://developer.paypal.com/dashboard/ → **Apps & Credentials** → start in
   **Sandbox** → **Create App** (Merchant) → gives a **Client ID** + **Secret**.
2. Create a **Donate button**: https://www.paypal.com/donate/buttons → note the
   **hosted button ID**.
3. App → **Webhooks** → add webhook URL
   `https://jpukcgqumytxjwflxrtd.supabase.co/functions/v1/paypal-webhook` →
   subscribe to **`PAYMENT.SALE.COMPLETED`** → note the **Webhook ID**.
4. Set **server-side** secrets in Supabase (read by the webhook, not the build):
   Edge Functions → Secrets, or CLI:
   `supabase secrets set PAYPAL_CLIENT_ID=… PAYPAL_CLIENT_SECRET=… PAYPAL_WEBHOOK_ID=… PAYPAL_ENV=sandbox`
5. Add **front-end** values as GitHub **Variables**: `VITE_PAYPAL_ME_URL` (your
   https://paypal.me/ link), `VITE_PAYPAL_BUTTON_ID` (from step 2),
   `VITE_PAYPAL_ENV=sandbox`.
6. **Redeploy**, test a sandbox donation end-to-end (confirm a "supporter" badge
   appears), then switch **both** `PAYPAL_ENV` and `VITE_PAYPAL_ENV` to `live`
   and redeploy.
   - ⚠️ Turn on the captcha (Part 5) **before** going live.

---

## Suggested order

- **Today (free, ~20 min):** 1 → 2 → 3 → 4
- **Before marketing:** 5
- **When ready to earn:** 6a (easy), then 6b

Every `VITE_*` value is **public by design** (it ships in the page) — it's safe
in a GitHub Variable. Only `SUPABASE_DB_URL` and the PayPal server secrets are
true secrets; keep those in GitHub Secrets / Supabase, never in the code.
