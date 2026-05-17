/**
 * Connectivity Test Endpoint
 * Tests Bluesky API connection and authentication status
 */

import type { NextRequest, NextResponse } from 'next/server';
import { BlueskyClient } from '../../src/bluesky-client.js';
import { sanitizeString, sanitizeCursor, sanitizeLimit, DEFAULT_LIMIT } from '../../src/sanitize.js';
import { formatError } from '../../src/utils.js';

export const runtime = 'edge';

/**
 * GET /api/connectivity
 * Test connection to Bluesky with optional authentication
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const client = new BlueskyClient();

  // Extract credentials from headers
  const identifier = request.headers.get('x-bluesky-identifier');
  const password = request.headers.get('x-bluesky-password');

  try {
    // Test basic connectivity first
    const connectivity = await client.testConnectivity();

    let authStatus = {
      authenticated: false
    };

    // If credentials provided, try to authenticate
    if (identifier && password) {
      try {
        await client.authenticate({
          identifier: sanitizeString(identifier),
          password: password
        });

        const sessionInfo = client.getSessionInfo();
        authStatus = {
          authenticated: sessionInfo.authenticated,
          did: sessionInfo.did,
          handle: sessionInfo.handle
        };
      } catch (authError) {
        return NextResponse.json(
          {
            success: false,
            connected: connectivity.connected,
            error: 'Authentication failed',
            details: formatError(authError)
          },
          { status: 401 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      connected: connectivity.connected,
      serviceUrl: 'https://bsky.social',
      authenticated: authStatus.authenticated,
      ...authStatus
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        connected: false,
        error: formatError(error)
      },
      { status: 500 }
    );
  }
}