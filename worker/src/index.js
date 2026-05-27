// Cloudflare Worker that accepts in-app bug reports from Vault and
// files them as GitHub issues on the user's behalf, so reporters
// don't need their own GitHub account.
//
// Required environment (set via `wrangler secret put` and wrangler.toml):
//   GITHUB_TOKEN   — fine-grained PAT with Issues: Read and write on the target repo (secret)
//   GITHUB_OWNER   — repo owner, e.g. "steverowley"
//   GITHUB_REPO    — repo name, e.g. "commander-deck-analyser"
//
// Optional:
//   ALLOWED_ORIGIN — CORS origin allowlist (comma-separated). Defaults to "*".

const MAX_TITLE = 200;
const MAX_BODY = 50_000;
const MAX_EMAIL = 254;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }), request, env);
    }
    if (request.method !== 'POST') {
      return cors(jsonResponse({ error: 'method not allowed' }, 405), request, env);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return cors(jsonResponse({ error: 'invalid json' }, 400), request, env);
    }

    // Honeypot — bots fill hidden fields, humans don't. Return a fake
    // success so the bot doesn't retry, but never reach GitHub.
    if (typeof payload.website === 'string' && payload.website.trim() !== '') {
      return cors(jsonResponse({ ok: true, skipped: true }), request, env);
    }

    const title = String(payload.title || '').trim().slice(0, MAX_TITLE);
    const body = String(payload.body || '').trim().slice(0, MAX_BODY);
    const email = String(payload.email || '').trim().slice(0, MAX_EMAIL);

    if (!title || !body) {
      return cors(jsonResponse({ error: 'title and body required' }, 400), request, env);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return cors(jsonResponse({ error: 'invalid email' }, 400), request, env);
    }

    const issueBody = email
      ? `${body}\n\n---\n*Reporter contact: ${email}*`
      : body;

    const ghRes = await fetch(
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'vault-bug-report-worker',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body: issueBody,
          labels: ['bug', 'from-app'],
        }),
      },
    );

    if (!ghRes.ok) {
      const text = await ghRes.text();
      console.error('GitHub API error', ghRes.status, text);
      return cors(jsonResponse({ error: 'github api error', status: ghRes.status }, 502), request, env);
    }

    const issue = await ghRes.json();
    return cors(
      jsonResponse({ ok: true, number: issue.number, url: issue.html_url }),
      request,
      env,
    );
  },
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cors(res, request, env) {
  const allowed = (env.ALLOWED_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  let allowOrigin = '*';
  if (!allowed.includes('*')) {
    allowOrigin = allowed.includes(origin) ? origin : allowed[0] || '';
  }
  const headers = new Headers(res.headers);
  if (allowOrigin) headers.set('Access-Control-Allow-Origin', allowOrigin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(res.body, { status: res.status, headers });
}
