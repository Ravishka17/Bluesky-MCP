/**
 * OAuth 2.1 token endpoint
 *
 * POST /token
 *   grant_type=authorization_code&code=...&code_verifier=...&redirect_uri=...&client_id=...
 *   grant_type=refresh_token&refresh_token=...
 *
 * Accepts application/x-www-form-urlencoded (standard) and application/json.
 * Clients are treated as public clients protected by PKCE, so any client
 * secret that is sent is ignored.
 */

import {
  CORS_HEADERS,
  isOAuthConfigured,
  issueTokens,
  jsonResponse,
  oauthError,
  readAuthCode,
  readRefreshToken,
  verifyPkce
} from '@/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readParams(req: Request): Promise<URLSearchParams> {
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await req.json()) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string' || typeof value === 'number') {
        params.set(key, String(value));
      }
    }
    return params;
  }

  return new URLSearchParams(await req.text());
}

/**
 * client_secret_basic: "Authorization: Basic base64(client_id:client_secret)"
 */
function readBasicClientId(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    const id = separator === -1 ? decoded : decoded.slice(0, separator);
    return decodeURIComponent(id) || null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!isOAuthConfigured()) {
    return oauthError('server_error', 'OAUTH_SECRET is not configured on the server.', 500);
  }

  let params: URLSearchParams;
  try {
    params = await readParams(req);
  } catch {
    return oauthError('invalid_request', 'Could not parse the request body.');
  }

  const grantType = params.get('grant_type');
  const requestClientId = params.get('client_id') ?? readBasicClientId(req);

  // ── authorization_code ────────────────────────────────────────────────────
  if (grantType === 'authorization_code') {
    const code = params.get('code');
    const verifier = params.get('code_verifier');
    const redirectUri = params.get('redirect_uri');

    if (!code || !verifier || !redirectUri) {
      return oauthError('invalid_request', 'code, code_verifier and redirect_uri are required.');
    }

    const data = readAuthCode(code);
    if (!data) {
      return oauthError('invalid_grant', 'The authorization code is invalid or has expired.');
    }
    if (data.redirectUri !== redirectUri) {
      return oauthError('invalid_grant', 'redirect_uri does not match the authorization request.');
    }
    if (requestClientId && data.clientId !== requestClientId) {
      return oauthError('invalid_grant', 'client_id does not match the authorization request.');
    }
    if (!verifyPkce(verifier, data.codeChallenge)) {
      return oauthError('invalid_grant', 'PKCE verification failed.');
    }

    return jsonResponse(issueTokens({ identifier: data.identifier, password: data.password }, data.clientId));
  }

  // ── refresh_token ─────────────────────────────────────────────────────────
  if (grantType === 'refresh_token') {
    const refreshToken = params.get('refresh_token');
    if (!refreshToken) {
      return oauthError('invalid_request', 'refresh_token is required.');
    }

    const data = readRefreshToken(refreshToken);
    if (!data) {
      return oauthError('invalid_grant', 'The refresh token is invalid or has expired.');
    }
    if (requestClientId && data.clientId !== requestClientId) {
      return oauthError('invalid_grant', 'client_id does not match the refresh token.');
    }

    // Rotate: hand out a new refresh token every time (sliding 90-day window).
    return jsonResponse(issueTokens({ identifier: data.identifier, password: data.password }, data.clientId));
  }

  return oauthError('unsupported_grant_type', 'Supported grant types: authorization_code, refresh_token.');
}

export async function GET() {
  return oauthError('invalid_request', 'Use POST to request tokens.', 405);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
