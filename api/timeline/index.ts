/**
 * Timeline Endpoint - Get user's home timeline
 */

import type { NextRequest, NextResponse } from 'next/server';
import { BlueskyClient } from '../../src/bluesky-client.js';
import { sanitizeCursor, sanitizeLimit, DEFAULT_LIMIT } from '../../src/sanitize.js';
import { formatError } from '../../src/utils.js';

export const runtime = 'edge';

/**
 * GET /api/timeline
 * Get authenticated user's timeline
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const client = new BlueskyClient();

  // Get credentials
  const identifier = request.headers.get('x-bluesky-identifier');
  const password = request.headers.get('x-bluesky-password');

  if (!identifier || !password) {
    return NextResponse.json(
      {
        success: false,
        error: 'Authentication required. Provide X-BLUESKY-IDENTIFIER and X-BLUESKY-PASSWORD headers.'
      },
      { status: 401 }
    );
  }

  try {
    // Authenticate
    await client.authenticate({
      identifier,
      password
    });

    // Get query params
    const url = new URL(request.url);
    const cursor = sanitizeCursor(url.searchParams.get('cursor'));
    const limit = sanitizeLimit(url.searchParams.get('limit'), DEFAULT_LIMIT);

    // Get timeline
    const result = await client.getTimeline({ cursor, limit });

    return NextResponse.json({
      success: true,
      data: result.feed,
      cursor: result.cursor
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