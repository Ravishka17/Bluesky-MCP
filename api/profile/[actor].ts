/**
 * REST API Endpoints for Bluesky Operations
 * Provides REST API for non-MCP clients and web access
 */

import type { NextRequest, NextResponse } from 'next/server';
import { BlueskyClient } from '../../src/bluesky-client.js';
import {
  sanitizeString,
  sanitizeCursor,
  sanitizeLimit,
  validatePostText,
  sanitizeUri,
  DEFAULT_LIMIT
} from '../../src/sanitize.js';
import { formatError, parseLanguages } from '../../src/utils.js';

/**
 * Helper to get authenticated client from request headers
 */
async function getAuthenticatedClient(request: NextRequest): Promise<{ client: BlueskyClient; authenticated: boolean }> {
  const client = new BlueskyClient();

  const identifier = request.headers.get('x-bluesky-identifier');
  const password = request.headers.get('x-bluesky-password');

  if (identifier && password) {
    try {
      await client.authenticate({
        identifier: sanitizeString(identifier),
        password: password
      });
      return { client, authenticated: true };
    } catch {
      return { client, authenticated: false };
    }
  }

  return { client, authenticated: false };
}

/**
 * GET /api/profile/[actor]
 * Get a user's profile
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ actor: string }> }): Promise<NextResponse> {
  try {
    const { actor } = await params;
    const client = new BlueskyClient();

    const profile = await client.getProfile(sanitizeString(actor));

    return NextResponse.json({
      success: true,
      data: profile
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: formatError(error)
      },
      { status: 500 }
    );
  }
}