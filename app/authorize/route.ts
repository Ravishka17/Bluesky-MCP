/**
 * OAuth 2.1 authorization endpoint
 *
 * GET  /authorize?response_type=code&client_id=...&redirect_uri=...
 *                &code_challenge=...&code_challenge_method=S256&state=...
 *      -> shows a sign-in page (Bluesky handle + app password)
 *
 * POST /authorize
 *      -> verifies the credentials against Bluesky, then redirects back to the
 *         client with a short-lived, encrypted authorization code.
 */

import { BlueskyClient } from '@/bluesky-client';
import {
  createAuthCode,
  escapeHtml,
  isOAuthConfigured,
  isRedirectUriAllowed,
  isValidCodeChallenge,
  readClientId
} from '@/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
}

type Validation =
  | { ok: true; params: AuthorizeParams }
  | {
      ok: false;
      fatal: boolean;
      error: string;
      description: string;
      redirectUri?: string;
      state?: string | null;
    };

const HTML_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"
};

// ── Validation ───────────────────────────────────────────────────────────────

function validateAuthorizeRequest(get: (key: string) => string | null): Validation {
  const clientId = get('client_id') ?? '';
  const redirectUri = get('redirect_uri') ?? '';
  const state = get('state');

  // Fatal errors: never redirect to an unverified redirect_uri.
  if (!clientId || clientId.length > 2000) {
    return { ok: false, fatal: true, error: 'invalid_request', description: 'Missing or invalid client_id.' };
  }
  if (!redirectUri || !isRedirectUriAllowed(clientId, redirectUri)) {
    return {
      ok: false,
      fatal: true,
      error: 'invalid_request',
      description: 'The redirect_uri is missing or is not allowed for this client.'
    };
  }

  // Non-fatal errors: report back to the (verified) redirect_uri.
  if (get('response_type') !== 'code') {
    return {
      ok: false,
      fatal: false,
      error: 'unsupported_response_type',
      description: 'Only response_type=code is supported.',
      redirectUri,
      state
    };
  }

  const codeChallenge = get('code_challenge') ?? '';
  if (!isValidCodeChallenge(codeChallenge)) {
    return {
      ok: false,
      fatal: false,
      error: 'invalid_request',
      description: 'A valid PKCE code_challenge is required.',
      redirectUri,
      state
    };
  }
  if (get('code_challenge_method') !== 'S256') {
    return {
      ok: false,
      fatal: false,
      error: 'invalid_request',
      description: 'Only code_challenge_method=S256 is supported.',
      redirectUri,
      state
    };
  }

  return { ok: true, params: { clientId, redirectUri, codeChallenge, state } };
}

// ── Rendering ────────────────────────────────────────────────────────────────

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.25rem; background: #0a0a0a; color: #fff; font-family: system-ui, -apple-system, sans-serif; }
.card { width: 100%; max-width: 26rem; background: #1a1a1a; border-radius: 16px; padding: 1.5rem; }
h1 { font-size: 1.35rem; margin: 0 0 0.5rem; }
p { color: #a0a0a0; line-height: 1.5; margin: 0.5rem 0; }
label { display: block; margin: 1rem 0 0.35rem; font-size: 0.9rem; }
input[type=text], input[type=password] { width: 100%; padding: 0.8rem; border-radius: 10px; border: 1px solid #333; background: #0a0a0a; color: #fff; font-size: 1rem; }
button { width: 100%; margin-top: 1rem; padding: 0.85rem; border: 0; border-radius: 10px; font-size: 1rem; cursor: pointer; }
.primary { background: #1185fe; color: #fff; }
.secondary { background: transparent; color: #a0a0a0; margin-top: 0.4rem; }
.error { background: #3a1515; color: #ffb4b4; padding: 0.7rem 0.8rem; border-radius: 10px; margin-top: 1rem; font-size: 0.9rem; }
a { color: #4ea1ff; }
code { color: #4ade80; word-break: break-all; }
</style>
</head>
<body><main class="card">${body}</main></body>
</html>`;
}

function renderError(message: string, status = 400): Response {
  const html = pageShell(
    'Authorization error',
    `<h1>Authorization error</h1><p>${escapeHtml(message)}</p>`
  );
  return new Response(html, { status, headers: HTML_HEADERS });
}

function renderForm(params: AuthorizeParams, options: { error?: string; identifier?: string; status?: number } = {}): Response {
  const redirectHost = new URL(params.redirectUri).host;
  const clientName = readClientId(params.clientId)?.name;

  const appLabel = clientName
    ? `<strong>${escapeHtml(clientName)}</strong> (<code>${escapeHtml(redirectHost)}</code>)`
    : `<code>${escapeHtml(redirectHost)}</code>`;

  const errorBlock = options.error ? `<div class="error">${escapeHtml(options.error)}</div>` : '';

  const body = `
<h1>Sign in to Bluesky</h1>
<p>${appLabel} is asking to use your Bluesky account through this MCP server.</p>
<p>Use an <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener noreferrer">app password</a>, never your main password.</p>
${errorBlock}
<form method="post" action="/authorize">
  <input type="hidden" name="response_type" value="code">
  <input type="hidden" name="code_challenge_method" value="S256">
  <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}">
  <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}">
  <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}">
  <input type="hidden" name="state" value="${escapeHtml(params.state ?? '')}">

  <label for="identifier">Bluesky handle</label>
  <input id="identifier" type="text" name="identifier" placeholder="yourname.bsky.social" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required value="${escapeHtml(options.identifier ?? '')}">

  <label for="app_password">App password</label>
  <input id="app_password" type="password" name="app_password" placeholder="xxxx-xxxx-xxxx-xxxx" autocomplete="off" required>

  <button class="primary" type="submit" name="action" value="approve">Authorize</button>
  <button class="secondary" type="submit" name="action" value="deny" formnovalidate>Cancel</button>
</form>`;

  return new Response(pageShell('Sign in to Bluesky', body), {
    status: options.status ?? 200,
    headers: HTML_HEADERS
  });
}

function redirectTo(url: URL): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: url.toString(), 'Cache-Control': 'no-store' }
  });
}

function redirectWithError(redirectUri: string, error: string, description: string, state?: string | null): Response {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return redirectTo(url);
}

function handleInvalid(validation: Extract<Validation, { ok: false }>): Response {
  if (validation.fatal || !validation.redirectUri) {
    return renderError(validation.description);
  }
  return redirectWithError(validation.redirectUri, validation.error, validation.description, validation.state);
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!isOAuthConfigured()) {
    return renderError('This server is not configured for OAuth yet (OAUTH_SECRET is missing).', 500);
  }

  const search = new URL(req.url).searchParams;
  const validation = validateAuthorizeRequest(key => search.get(key));
  if (!validation.ok) return handleInvalid(validation);

  return renderForm(validation.params);
}

export async function POST(req: Request) {
  if (!isOAuthConfigured()) {
    return renderError('This server is not configured for OAuth yet (OAUTH_SECRET is missing).', 500);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return renderError('Invalid form submission.');
  }

  const get = (key: string): string | null => {
    const value = form.get(key);
    return typeof value === 'string' ? value : null;
  };

  const validation = validateAuthorizeRequest(get);
  if (!validation.ok) return handleInvalid(validation);
  const { params } = validation;

  if (get('action') === 'deny') {
    return redirectWithError(params.redirectUri, 'access_denied', 'The user denied the request.', params.state);
  }

  const identifier = (get('identifier') ?? '').trim().replace(/^@/, '').slice(0, 320);
  const password = (get('app_password') ?? '').trim().slice(0, 200);

  if (!identifier || !password) {
    return renderForm(params, {
      error: 'Please enter both your handle and an app password.',
      identifier,
      status: 400
    });
  }

  // Verify the credentials against Bluesky before issuing a code.
  try {
    const client = new BlueskyClient();
    await client.authenticate({ identifier, password });
  } catch {
    return renderForm(params, {
      error: 'Sign-in failed. Check your handle and app password, then try again.',
      identifier,
      status: 401
    });
  }

  const code = createAuthCode({
    identifier,
    password,
    codeChallenge: params.codeChallenge,
    redirectUri: params.redirectUri,
    clientId: params.clientId
  });

  const target = new URL(params.redirectUri);
  target.searchParams.set('code', code);
  if (params.state) target.searchParams.set('state', params.state);
  return redirectTo(target);
}
