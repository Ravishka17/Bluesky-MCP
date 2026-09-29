import { NextRequest, NextResponse } from 'next/server';
import { createMCPServer } from '@/mcp-server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  CORS_HEADERS,
  credentialsFromAccessToken,
  isSealedAccessToken,
  unauthorizedResponse
} from '@/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Add CORS headers to any Response (including streamed ones).
 * The body is passed through untouched so SSE streaming keeps working.
 */
function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
}

/**
 * When true, requests without any credentials are allowed through so public
 * (no-auth) tools keep working. Default is false because OAuth clients such as
 * Claude need a 401 response to discover the OAuth flow.
 */
function allowAnonymous(): boolean {
  return process.env.ALLOW_ANONYMOUS_MCP === 'true';
}

/**
 * Parse credentials from a "identifier:password" combined string.
 * Splits on the FIRST colon only, so passwords containing colons are safe.
 */
function parseCombined(value: string): { identifier: string; password: string } | null {
  const colonIndex = value.indexOf(':');
  if (colonIndex === -1) return null;
  const identifier = value.substring(0, colonIndex).trim();
  const password = value.substring(colonIndex + 1).trim();
  if (!identifier || !password) return null;
  return { identifier, password };
}

/**
 * Extract Bluesky credentials from the request using one of four methods:
 *
 * Method 1 - Two separate headers (HuggingChat, curl):
 *   X-BLUESKY-IDENTIFIER: handle.bsky.social
 *   X-BLUESKY-PASSWORD: your-app-password
 *
 * Method 2 - Single combined header (Vibe, custom clients):
 *   X-BLUESKY-CREDENTIALS: handle.bsky.social:your-app-password
 *
 * Method 3 - Authorization Bearer with combined credentials (MCP Playground):
 *   Authorization: Bearer handle.bsky.social:your-app-password
 *
 * Method 4 - OAuth 2.1 access token issued by /token (Claude custom connector):
 *   Authorization: Bearer bmcp_at_...
 *   If the token is invalid or expired, invalidToken is set so the caller can
 *   answer with 401 and trigger a refresh / re-authorization.
 */
function extractCredentials(req: NextRequest): {
  identifier?: string;
  password?: string;
  invalidToken?: boolean;
} {
  // Method 1: two explicit headers (highest priority)
  const identifier = req.headers.get('x-bluesky-identifier') ?? undefined;
  const password = req.headers.get('x-bluesky-password') ?? undefined;
  if (identifier && password) {
    return { identifier, password };
  }

  // Method 2: single combined header
  const combined = req.headers.get('x-bluesky-credentials');
  if (combined) {
    const parsed = parseCombined(combined);
    if (parsed) return parsed;
  }

  // Methods 3 + 4: Authorization: Bearer ...
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();

    // Method 4: OAuth access token
    if (isSealedAccessToken(token)) {
      const login = credentialsFromAccessToken(token);
      if (login) return login;
      return { invalidToken: true };
    }

    // Method 3: legacy handle:password
    const parsed = parseCombined(token);
    if (parsed) return parsed;
  }

  return {};
}

export async function POST(req: NextRequest) {
  try {
    const { identifier, password, invalidToken } = extractCredentials(req);

    if (invalidToken) {
      return unauthorizedResponse(req, 'invalid_token', 'The access token is invalid or has expired');
    }

    if ((!identifier || !password) && !allowAnonymous()) {
      return unauthorizedResponse(req);
    }

    const server = createMCPServer({ identifier, password });
    const transport = new WebStandardStreamableHTTPServerTransport();

    await server.connect(transport);
    return withCors(await transport.handleRequest(req));
  } catch (error) {
    console.error('MCP POST error:', error);
    return withCors(
      NextResponse.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error)
          },
          id: null
        },
        { status: 500 }
      )
    );
  }
}

export async function GET() {
  return withCors(
    NextResponse.json({
      status: 'MCP endpoint active',
      version: '1.0.0',
      transport: 'WebStandardStreamableHTTPServerTransport (POST only)',
      auth: {
        methods: [
          'OAuth 2.1 (Claude custom connector): discovery at /.well-known/oauth-authorization-server',
          'Two headers: X-BLUESKY-IDENTIFIER + X-BLUESKY-PASSWORD',
          'Single header: X-BLUESKY-CREDENTIALS: handle:password',
          'Bearer token: Authorization: Bearer handle:password'
        ]
      }
    })
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}
