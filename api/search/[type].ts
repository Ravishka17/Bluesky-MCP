/**
 * Search Endpoint - Search actors (users) on Bluesky
 */

import type { NextRequest, NextResponse } from 'next/server';
import { BlueskyClient } from '../../src/bluesky-client.js';
import { sanitizeString, sanitizeLimit } from '../../src/sanitize.js';
import { formatError } from '../../src/utils.js';

export const runtime = 'edge';

/**
 * GET /api/search/[type]
 * Search actors or posts
 * Types: actors, posts, typeahead
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
): Promise<NextResponse> {
  try {
    const { type } = await params;
    const url = new URL(request.url);
    const term = url.searchParams.get('q') || url.searchParams.get('term') || url.searchParams.get('query');
    const limit = sanitizeLimit(url.searchParams.get('limit'), 10);

    if (!term) {
      return NextResponse.json(
        {
          success: false,
          error: 'Search term is required (q, term, or query parameter)'
        },
        { status: 400 }
      );
    }

    const client = new BlueskyClient();

    switch (type) {
      case 'actors':
        const actorsResult = await client.searchActors({
          term: sanitizeString(term),
          limit
        });
        return NextResponse.json({
          success: true,
          data: actorsResult.actors
        });

      case 'typeahead':
        const typeaheadResult = await client.searchActorsTypeahead({
          term: sanitizeString(term),
          limit
        });
        return NextResponse.json({
          success: true,
          data: typeaheadResult.actors
        });

      case 'posts':
        const sort = url.searchParams.get('sort') as 'latest' | 'top' | undefined;
        const lang = url.searchParams.get('lang');
        const author = url.searchParams.get('author');
        const mentions = url.searchParams.get('mentions');

        const postsResult = await client.searchPosts({
          q: sanitizeString(term),
          limit,
          sort,
          lang: lang ? sanitizeString(lang) : undefined,
          author: author ? sanitizeString(author) : undefined,
          mentions: mentions ? sanitizeString(mentions) : undefined
        });
        return NextResponse.json({
          success: true,
          data: postsResult.posts,
          cursor: postsResult.cursor
        });

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown search type: ${type}. Use: actors, posts, or typeahead`
          },
          { status: 400 }
        );
    }
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