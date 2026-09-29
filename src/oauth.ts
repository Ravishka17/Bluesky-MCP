/**
 * Stateless OAuth 2.1 helpers for the Bluesky MCP Server
 *
 * Design goals:
 *  - The server stores NOTHING: no database, and no Bluesky credentials in
 *    environment variables or on disk.
 *  - Authorization codes, access tokens, refresh tokens and dynamically
 *    registered client IDs are "sealed" blobs (AES-256-GCM). The Bluesky
 *    handle + app password travel inside the sealed token, which is held by
 *    the MCP client (e.g. Claude) - exactly like the header-based methods.
 *  - The only server-side secret is OAUTH_SECRET, an ENCRYPTION KEY (not a
 *    credential). Rotating it invalidates every token that was ever issued.
 *
 * Flow:
 *  1. Client calls POST /mcp without a token -> 401 + WWW-Authenticate header
 *  2. Client reads /.well-known/oauth-protected-resource[/mcp]
 *  3. Client reads /.well-known/oauth-authorization-server
 *  4. Client registers itself at POST /register (dynamic client registration)
 *  5. Client sends the user to GET /authorize (PKCE, S256)
 *  6. User enters handle + app password -> redirect back with ?code=...
 *  7. Client calls POST /token with the code + code_verifier
 *  8. Client calls POST /mcp with "Authorization: Bearer bmcp_at_..."
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual
} from 'crypto';

// ── Constants ────────────────────────────────────────────────────────────────

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days (sliding)
export const AUTH_CODE_TTL_SECONDS = 5 * 60; // 5 minutes
const CLIENT_ID_TTL_SECONDS = 60 * 60 * 24 * 365 * 10; // 10 years

export const ACCESS_TOKEN_PREFIX = 'bmcp_at_';
export const REFRESH_TOKEN_PREFIX = 'bmcp_rt_';
const AUTH_CODE_PREFIX = 'bmcp_ac_';
const CLIENT_ID_PREFIX = 'bmcp_ci_';

/** Redirect URIs that are always accepted for manually typed (unregistered) client IDs. */
const DEFAULT_ALLOWED_REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback'
];

/** CORS headers shared by every OAuth and MCP response. */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': [
    'Content-Type',
    'Authorization',
    'Accept',
    'x-bluesky-identifier',
    'x-bluesky-password',
    'x-bluesky-credentials',
    'mcp-session-id',
    'mcp-protocol-version',
    'last-event-id'
  ].join(', '),
  'Access-Control-Expose-Headers': 'mcp-session-id, WWW-Authenticate',
  'Access-Control-Max-Age': '86400'
};

// ── Types ────────────────────────────────────────────────────────────────────

type SealedType = 'code' | 'access' | 'refresh' | 'client';

interface Envelope {
  t: SealedType;
  exp: number;
}

export interface BlueskyLogin {
  identifier: string;
  password: string;
}

export interface AuthCodeData extends BlueskyLogin {
  codeChallenge: string;
  redirectUri: string;
  clientId: string;
}

export interface RefreshTokenData extends BlueskyLogin {
  clientId: string;
}

export interface ClientData {
  redirectUris: string[];
  name?: string;
}

export interface IssuedTokens {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
}

// ── Sealing (AES-256-GCM) ────────────────────────────────────────────────────

/**
 * True when OAUTH_SECRET is present and long enough to be used as a key.
 */
export function isOAuthConfigured(): boolean {
  const secret = process.env.OAUTH_SECRET;
  return typeof secret === 'string' && secret.length >= 32;
}

function getKey(): Buffer {
  const secret = process.env.OAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('OAUTH_SECRET is not configured (use a random string of at least 32 characters)');
  }
  return createHash('sha256').update(secret).digest();
}

function seal(type: SealedType, prefix: string, data: object, ttlSeconds: number): string {
  const envelope: Envelope = {
    t: type,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const plaintext = JSON.stringify({ ...data, ...envelope });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return prefix + Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

function unseal<T extends object>(
  token: unknown,
  type: SealedType,
  prefix: string
): (T & Envelope) | null {
  if (typeof token !== 'string' || !token.startsWith(prefix)) return null;

  try {
    const raw = Buffer.from(token.slice(prefix.length), 'base64url');
    if (raw.length < 12 + 16 + 1) return null;

    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);

    const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

    const payload = JSON.parse(plaintext) as T & Envelope;
    if (payload.t !== type) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Authorization codes ──────────────────────────────────────────────────────

export function createAuthCode(data: AuthCodeData): string {
  return seal('code', AUTH_CODE_PREFIX, { ...data }, AUTH_CODE_TTL_SECONDS);
}

export function readAuthCode(code: string): AuthCodeData | null {
  const payload = unseal<AuthCodeData>(code, 'code', AUTH_CODE_PREFIX);
  if (!payload) return null;
  return {
    identifier: payload.identifier,
    password: payload.password,
    codeChallenge: payload.codeChallenge,
    redirectUri: payload.redirectUri,
    clientId: payload.clientId
  };
}

// ── Access + refresh tokens ──────────────────────────────────────────────────

/**
 * Issue a fresh access + refresh token pair for a Bluesky login.
 */
export function issueTokens(login: BlueskyLogin, clientId: string): IssuedTokens {
  return {
    access_token: seal(
      'access',
      ACCESS_TOKEN_PREFIX,
      { identifier: login.identifier, password: login.password },
      ACCESS_TOKEN_TTL_SECONDS
    ),
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: seal(
      'refresh',
      REFRESH_TOKEN_PREFIX,
      { identifier: login.identifier, password: login.password, clientId },
      REFRESH_TOKEN_TTL_SECONDS
    )
  };
}

/**
 * True when a bearer token looks like one of OUR access tokens (as opposed to
 * the legacy "handle:app-password" format).
 */
export function isSealedAccessToken(token: string): boolean {
  return token.startsWith(ACCESS_TOKEN_PREFIX);
}

/**
 * Decrypt an access token into Bluesky credentials. Returns null when the
 * token is invalid, tampered with, or expired.
 */
export function credentialsFromAccessToken(token: string): BlueskyLogin | null {
  const payload = unseal<BlueskyLogin>(token, 'access', ACCESS_TOKEN_PREFIX);
  if (!payload) return null;
  return { identifier: payload.identifier, password: payload.password };
}

export function readRefreshToken(token: string): RefreshTokenData | null {
  const payload = unseal<RefreshTokenData>(token, 'refresh', REFRESH_TOKEN_PREFIX);
  if (!payload) return null;
  return {
    identifier: payload.identifier,
    password: payload.password,
    clientId: payload.clientId
  };
}

// ── Dynamic client registration ──────────────────────────────────────────────

/**
 * Create a stateless client_id that carries the registered redirect URIs.
 */
export function createClientId(redirectUris: string[], name?: string): string {
  return seal('client', CLIENT_ID_PREFIX, { redirectUris, name }, CLIENT_ID_TTL_SECONDS);
}

/**
 * Read a client_id created by createClientId(). Returns null for any other
 * client_id (for example one that was typed in by hand).
 */
export function readClientId(clientId: string): ClientData | null {
  const payload = unseal<ClientData>(clientId, 'client', CLIENT_ID_PREFIX);
  if (!payload || !Array.isArray(payload.redirectUris)) return null;
  return { redirectUris: payload.redirectUris, name: payload.name };
}

// ── Redirect URI + PKCE validation ───────────────────────────────────────────

export function isLoopbackUrl(url: URL): boolean {
  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  );
}

/**
 * A redirect URI may be registered only if it is https:// or a loopback
 * http:// URL (used by CLI tools such as Claude Code), with no fragment.
 */
export function isRegistrableRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.hash) return false;
    return url.protocol === 'https:' || isLoopbackUrl(url);
  } catch {
    return false;
  }
}

/**
 * Decide whether a redirect_uri may receive an authorization code.
 *  - Dynamically registered client: must match one of its registered URIs.
 *  - Any other client_id: must be a known Claude callback, an entry from
 *    OAUTH_ALLOWED_REDIRECT_URIS, or a loopback URL.
 */
export function isRedirectUriAllowed(clientId: string, redirectUri: string): boolean {
  if (!isRegistrableRedirectUri(redirectUri)) return false;

  const registered = readClientId(clientId);
  if (registered) {
    return registered.redirectUris.includes(redirectUri);
  }

  const extra = (process.env.OAUTH_ALLOWED_REDIRECT_URIS || '')
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);

  if (DEFAULT_ALLOWED_REDIRECT_URIS.includes(redirectUri) || extra.includes(redirectUri)) {
    return true;
  }

  return isLoopbackUrl(new URL(redirectUri));
}

/**
 * An S256 code challenge is a base64url-encoded SHA-256 hash (43 characters).
 */
export function isValidCodeChallenge(challenge: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(challenge);
}

/**
 * Verify a PKCE code_verifier against the stored S256 code_challenge.
 */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

// ── URLs + metadata ──────────────────────────────────────────────────────────

/**
 * Work out the public base URL of this deployment (no trailing slash).
 * Set PUBLIC_BASE_URL to force a value.
 */
export function getBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '')
    .split(',')[0]
    .trim();

  if (host) {
    const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    const proto = (req.headers.get('x-forwarded-proto') ?? (isLocal ? 'http' : 'https'))
      .split(',')[0]
      .trim();
    return `${proto}://${host}`;
  }

  return new URL(req.url).origin;
}

/**
 * RFC 8414 - OAuth 2.0 Authorization Server Metadata.
 */
export function buildAuthorizationServerMetadata(base: string): Record<string, unknown> {
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic']
  };
}

/**
 * RFC 9728 - OAuth 2.0 Protected Resource Metadata.
 */
export function buildProtectedResourceMetadata(base: string): Record<string, unknown> {
  return {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ['header'],
    resource_name: 'Bluesky MCP Server'
  };
}

// ── Response helpers ─────────────────────────────────────────────────────────

/**
 * JSON response with CORS and no-store caching (required for token endpoints).
 */
export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}

/**
 * RFC 6749 error response.
 */
export function oauthError(error: string, description: string, status = 400): Response {
  return jsonResponse({ error, error_description: description }, status);
}

/**
 * 401 response that tells MCP clients where to start the OAuth flow.
 */
export function unauthorizedResponse(req: Request, error?: string, description?: string): Response {
  const base = getBaseUrl(req);
  let challenge = `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`;
  if (error) challenge += `, error="${error}"`;
  if (description) challenge += `, error_description="${description.replace(/"/g, '')}"`;

  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32001, message: description ?? 'Authentication required' },
      id: null
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': challenge,
        'Cache-Control': 'no-store',
        ...CORS_HEADERS
      }
    }
  );
}

/**
 * Escape a string for safe use inside HTML text or attribute values.
 */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, char => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
