# bug-report edge function

Files Vault bug reports as GitHub issues on the user's behalf, so reporters
don't need their own GitHub account.

## Setup (one-time)

1. Create a fine-grained PAT on GitHub → Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → **Generate new token**.

   - Resource owner: `steverowley`
   - Repository access: Only select repositories → `commander-deck-analyser`
   - Repository permissions: **Issues: Read and write** (nothing else)
   - Expiration: 1 year (calendar reminder to rotate)

2. In the Supabase dashboard → Project Settings → **Edge Functions** →
   Manage secrets → add:

   - **Name:** `GITHUB_TOKEN`
   - **Value:** the PAT from step 1.

## Redeploy

This function is deployed via the Supabase MCP from Claude Code. To bump it
from a regular Supabase CLI workflow:

```sh
supabase functions deploy bug-report
```

## API

`POST <SUPABASE_URL>/functions/v1/bug-report` with JSON body:

```json
{
  "title": "Roll button hangs at bracket 5",
  "body": "## What went wrong\n\n...",
  "email": "optional@reporter.com",
  "website": ""
}
```

- `title` — required, ≤200 chars.
- `body` — required, ≤50_000 chars. Markdown.
- `email` — optional, appended to issue body as a footer.
- `website` — honeypot. Non-empty = fake-success without touching GitHub.

Authorisation: the client sends the public Supabase anon key (handled
automatically by `supabase.functions.invoke()` in the JS SDK).

Response on success:

```json
{ "ok": true, "number": 42, "url": "https://github.com/.../issues/42" }
```
