/**
 * Thread Endpoint - Get a post thread
 */

import type { NextRequest, NextResponse } from 'next/server';
import { BlueskyClient } from '../../src/bluesky-client.js';
import { sanitizeUri, validateAtUri } from '../../src/sanitize.js';
import { formatError } from '../../src/utils.js';

export const runtime = 'edge';

/**
 * GET /api/thread/[uri]
 * Get a post thread (uri is URL-encoded)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uri: string }> }
): Promise<NextResponse> {
  try {
    const { uri } = await params;
    const url = new URL(request.url);

    // Validate and decode URI
    const decodedUri = decodeURIComponent(uri);
    const validation = validateAtUri(decodedUri);

    if (!validation.valid || !validation.uri) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid AT Protocol URI'
        },
        { status: 400 }
      );
    }

    // Parse optional depth parameters
    const depth = url.searchParams.get('depth');
    const parentHeight = url.searchParams.get('parentHeight');

    const client = new BlueskyClient();
    const result = await client.getPostThread({
      uri: validation.uri,
      depth: depth ? Math.min(Math.max(0, parseInt(depth, 10)), 1000) : undefined,
      parentHeight: parentHeight ? Math.min(Math.max(0, parseInt(parentHeight, 10)), 1000) : undefined
    });

    return NextResponse.json({
      success: true,
      data: result.thread
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