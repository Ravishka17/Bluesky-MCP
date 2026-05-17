/**
 * Post Creation Endpoint
 */

import type { NextRequest, NextResponse } from 'next/server';
import { BlueskyClient } from '../../src/bluesky-client.js';
import { validatePostText, sanitizeString } from '../../src/sanitize.js';
import { formatError, parseLanguages } from '../../src/utils.js';

export const runtime = 'edge';

/**
 * POST /api/post
 * Create a new Bluesky post
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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
    const body = await request.json();
    const client = new BlueskyClient();

    // Authenticate
    await client.authenticate({
      identifier,
      password
    });

    // Validate and sanitize post text
    const validation = validatePostText(body.text);
    if (!validation.valid || !validation.text) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error
        },
        { status: 400 }
      );
    }

    // Parse languages
    const langs = parseLanguages(body.langs);

    // Create post
    const result = await client.createPost(validation.text, { langs });

    return NextResponse.json({
      success: true,
      data: {
        uri: result.uri,
        cid: result.cid,
        url: `https://bsky.app/profile/${result.uri.split('/')[2]}/post/${result.uri.split('/')[4]}`
      }
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

/**
 * GET /api/post/search
 * Search posts by keyword (REST alternative to MCP)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || url.searchParams.get('query');
    const limit = sanitizeLimit(url.searchParams.get('limit'), 20);
    const cursor = sanitizeCursor(url.searchParams.get('cursor'));
    const sort = url.searchParams.get('sort') as 'latest' | 'top' | undefined;
    const lang = url.searchParams.get('lang');

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: 'Query parameter "q" or "query" is required'
        },
        { status: 400 }
      );
    }

    const client = new BlueskyClient();
    const result = await client.searchPosts({
      q: sanitizeString(query),
      limit,
      cursor,
      sort,
      lang: lang ? sanitizeString(lang) : undefined
    });

    return NextResponse.json({
      success: true,
      data: result.posts,
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