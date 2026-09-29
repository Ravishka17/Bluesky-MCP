/**
 * RFC 8414 - OAuth 2.0 Authorization Server Metadata
 * GET /.well-known/oauth-authorization-server
 */

import { CORS_HEADERS, buildAuthorizationServerMetadata, getBaseUrl, jsonResponse } from '@/oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return jsonResponse(buildAuthorizationServerMetadata(getBaseUrl(req)), 200, {
    'Cache-Control': 'public, max-age=300'
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
