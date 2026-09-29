/**
 * RFC 9728 - OAuth 2.0 Protected Resource Metadata (path form for /mcp)
 * GET /.well-known/oauth-protected-resource/mcp
 *
 * This is the URL advertised in the WWW-Authenticate header of 401 responses.
 */

import { CORS_HEADERS, buildProtectedResourceMetadata, getBaseUrl, jsonResponse } from '@/oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return jsonResponse(buildProtectedResourceMetadata(getBaseUrl(req)), 200, {
    'Cache-Control': 'public, max-age=300'
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
