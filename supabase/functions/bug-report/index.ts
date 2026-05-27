// Supabase Edge Function that files Vault bug reports as GitHub issues
// on the user's behalf, so reporters don't need a GitHub account.
//
// Deployed at: <SUPABASE_URL>/functions/v1/bug-report
//
// Required Supabase secret:
//   GITHUB_TOKEN — fine-grained PAT with Issues: Read and write on
//                  steverowley/commander-deck-analyser.
//
// All error paths return HTTP 200 with `{ ok: false, error: "..." }`
// so the supabase-js client doesn't bury the reason inside a generic
// FunctionsHttpError. Only the success path returns the issue number
// + URL. Honeypot hits return `{ ok: true, skipped: true }` so bots
// don't retry but no issue is filed.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MAX_TITLE = 200;
const MAX_BODY = 50_000;
const MAX_EMAIL = 254;

const GITHUB_OWNER = "steverowley";
const GITHUB_REPO = "commander-deck-analyser";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method not allowed" }, 405);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid json" }, 400);
  }

  // Honeypot — bots fill hidden inputs, humans don't. Fake-success so
  // the bot doesn't retry, but never reach GitHub.
  if (typeof payload.website === "string" && payload.website.trim() !== "") {
    return jsonResponse({ ok: true, skipped: true });
  }

  const title = String(payload.title ?? "").trim().slice(0, MAX_TITLE);
  const body = String(payload.body ?? "").trim().slice(0, MAX_BODY);
  const email = String(payload.email ?? "").trim().slice(0, MAX_EMAIL);

  if (!title || !body) {
    return jsonResponse({ ok: false, error: "title and body required" }, 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ ok: false, error: "invalid email" }, 400);
  }

  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (!githubToken) {
    console.error("GITHUB_TOKEN not configured");
    return jsonResponse({ ok: false, error: "GITHUB_TOKEN secret not set in Supabase" }, 200);
  }

  const issueBody = email
    ? `${body}\n\n---\n*Reporter contact: ${email}*`
    : body;

  let ghRes: Response;
  try {
    ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "vault-bug-report-fn",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          body: issueBody,
          labels: ["bug", "from-app"],
        }),
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fetch threw", msg);
    return jsonResponse({ ok: false, error: `network: ${msg}` }, 200);
  }

  if (!ghRes.ok) {
    const text = await ghRes.text();
    console.error("GitHub API error", ghRes.status, text);
    // Best-effort: parse GitHub's JSON error so we can surface the
    // 'Bad credentials' / 'Resource not accessible by personal access
    // token' message back to the client.
    let ghMessage = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.message === "string") {
        ghMessage = parsed.message;
      }
    } catch {
      // not JSON, keep snippet
    }
    return jsonResponse({
      ok: false,
      error: `GitHub ${ghRes.status}: ${ghMessage}`,
      github_status: ghRes.status,
    }, 200);
  }

  const issue = await ghRes.json();
  return jsonResponse({ ok: true, number: issue.number, url: issue.html_url });
});
