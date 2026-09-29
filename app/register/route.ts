/**
 * RFC 7591 - Dynamic Client Registration
 *
 * POST /register
 *   { "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"], "client_name": "Claude" }
 *
 * Stateless: the returned client_id is an encrypted blob that carries the
 * registered redirect URIs, so nothing has to be stored on the server.
 */

import {
  CORS_HEADERS,
  createClientId,
  isOAuthConfigured,
  isRegistrableRedirectUri,
  jsonResponse,
  oauthError
} from '@/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!isOAuthConfigured()) {
    return oauthError('server_error', 'OAUTH_SECRET is not configured on the server.', 500);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return oauthError('invalid_client_metadata', 'The request body must be JSON.');
  }

  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10) {
    return oauthError('invalid_redirect_uri', 'redirect_uris must be an array with 1 to 10 entries.');
  }

  const redirectUris: string[] = [];
  for (const uri of uris) {
    if (typeof uri !== 'string' || !isRegistrableRedirectUri(uri)) {
      return oauthError(
        'invalid_redirect_uri',
        'Each redirect URI must be https:// (or a loopback http:// URL) and must not contain a fragment.'
      );
    }
    redirectUris.push(uri);
  }

  const clientName =
    typeof body.client_name === 'string' ? body.client_name.trim().slice(0, 100) : undefined;

  const clientId = createClientId(redirectUris, clientName || undefined);

  return jsonResponse(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName || undefined,
      redirect_uris: redirectUris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none'
    },
    201
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
