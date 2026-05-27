# vault-bug-report worker

Cloudflare Worker that lets Vault users file bug reports as GitHub issues
without needing a GitHub account of their own. The Worker holds a
fine-grained PAT and posts to the GitHub Issues API on the user's behalf.

## One-time setup

### 1. Create a fine-grained PAT

On GitHub → Settings → Developer settings → Personal access tokens →
Fine-grained tokens → **Generate new token**.

- **Resource owner:** `steverowley`
- **Repository access:** Only select repositories → `commander-deck-analyser`
- **Repository permissions:** **Issues: Read and write** (nothing else)
- **Expiration:** 1 year (max). Set a calendar reminder to rotate.

Copy the token — you only see it once.

### 2. Deploy the worker

```sh
cd worker
npm install
npx wrangler login                      # one-time browser auth
npx wrangler secret put GITHUB_TOKEN    # paste the PAT when prompted
npm run deploy
```

The deploy output prints the Worker URL, e.g.
`https://vault-bug-report.<your-account>.workers.dev`.

### 3. Wire it into Vault

Set `VITE_BUG_REPORT_URL` to the Worker URL when building the SPA. In the
GitHub Actions deploy workflow this means adding a repo secret
`VITE_BUG_REPORT_URL` and passing it through to the `vite build` step
(see `.github/workflows/deploy.yml`).

For local dev, drop the URL in `.env.local`:

```
VITE_BUG_REPORT_URL=https://vault-bug-report.<your-account>.workers.dev
```

If `VITE_BUG_REPORT_URL` is unset, the bug-report modal falls back to its
original behaviour — opening a prefilled GitHub new-issue page in a new tab.

### 4. (Optional) Lock down CORS

Once you know the production origin, edit `wrangler.toml` and set
`ALLOWED_ORIGIN = "https://steverowley.github.io"` then redeploy.

## Local dev

```sh
npm run dev
```

Wrangler serves the Worker on `http://localhost:8787`. Drop secrets for
local dev in `worker/.dev.vars` (gitignored):

```
GITHUB_TOKEN=ghp_xxx
```

## API

`POST /` (any path) with JSON body:

```json
{
  "title": "Roll button hangs at bracket 5",
  "body": "## What went wrong\n\n...",
  "email": "optional@reporter.com",
  "website": ""
}
```

- `title` — required, ≤200 chars.
- `body` — required, ≤50_000 chars. Treated as the issue body verbatim
  (markdown). The client is expected to assemble the structured body
  including app version, user-agent, and URL.
- `email` — optional contact for the reporter. Appended to the issue
  body as a footer if provided.
- `website` — honeypot. Bots fill hidden inputs; humans don't. If
  non-empty, the Worker returns a fake success without touching GitHub.

Response on success:

```json
{ "ok": true, "number": 42, "url": "https://github.com/.../issues/42" }
```
