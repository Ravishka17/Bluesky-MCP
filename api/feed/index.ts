/**
 * Feed Endpoint - Get posts from a feed generator or author
 */

import type { NextRequest, NextResponse } from 'next/server';
import { BlueskyClient } from '../../src/bluesky-client.js';
import { sanitizeString, sanitizeCursor, sanitizeLimit, validateAtUri, DEFAULT_LIMIT } from '../../src/sanitize.js';
import { formatError } from '../../src/utils.js';

export const runtime = 'edge';

/**
 * GET /api/feed
 * Get feed generator posts or author feed
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const feedUri = url.searchParams.get('feed');
    const author = url.searchParams.get('author');
    const cursor = sanitizeCursor(url.searchParams.get('cursor'));
    const limit = sanitizeLimit(url.searchParams.get('limit'), DEFAULT_LIMIT);
    const filter = url.searchParams.get('filter') as 'posts_with_replies' | 'posts_no_replies' | 'posts_with_media' | 'posts_and_author_threads' | undefined;

    const client = new BlueskyClient();

    // Get feed by URI
    if (feedUri) {
      const validation = validateAtUri(feedUri);
      if (!validation.valid || !validation.uri) {
        return NextResponse.json(
          { success: false, error: 'Invalid feed URI' },
          { status: 400 }
        );
      }

      const result = await client.getFeed({
        feed: validation.uri,
        cursor,
        limit
      });

      return NextResponse.json({
        success: true,
        data: result.feed,
        cursor: result.cursor
      });
    }

    // Get author feed
    if (author) {
      const result = await client.getAuthorFeed({
        actor: sanitizeString(author),
        filter,
        cursor,
        limit
      });

      return NextResponse.json({
        success: true,
        data: result.feed,
        cursor: result.cursor
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Either "feed" (feed URI) or "author" (actor handle/DID) parameter is required'
      },
      { status: 400 }
    );
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