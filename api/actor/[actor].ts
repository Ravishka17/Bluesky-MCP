/**
 * Actor Endpoint - Get actor profile or feed
 */

import type { NextRequest, NextResponse } from 'next/server';
import { BlueskyClient } from '../../src/bluesky-client.js';
import { sanitizeString, sanitizeLimit, sanitizeCursor, DEFAULT_LIMIT } from '../../src/sanitize.js';
import { formatError } from '../../src/utils.js';

export const runtime = 'edge';

/**
 * GET /api/actor/[actor]
 * Get actor profile or their posts
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ actor: string }> }
): Promise<NextResponse> {
  try {
    const { actor } = await params;
    const url = new URL(request.url);
    const view = url.searchParams.get('view') || 'profile';
    const cursor = sanitizeCursor(url.searchParams.get('cursor'));
    const limit = sanitizeLimit(url.searchParams.get('limit'), DEFAULT_LIMIT);
    const filter = url.searchParams.get('filter') as 'posts_with_replies' | 'posts_no_replies' | 'posts_with_media' | 'posts_and_author_threads' | undefined;

    const client = new BlueskyClient();
    const sanitizedActor = sanitizeString(actor);

    switch (view) {
      case 'profile':
        const profile = await client.getProfile(sanitizedActor);
        return NextResponse.json({
          success: true,
          data: profile
        });

      case 'feed':
        const feedResult = await client.getAuthorFeed({
          actor: sanitizedActor,
          filter,
          cursor,
          limit
        });
        return NextResponse.json({
          success: true,
          data: feedResult.feed,
          cursor: feedResult.cursor
        });

      default:
        return NextResponse.json(
          { success: false, error: `Unknown view: ${view}. Use: profile, feed` },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatError(error) },
      { status: 500 }
    );
  }
}