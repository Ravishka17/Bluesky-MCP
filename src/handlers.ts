/**
 * MCP Tool Handlers - Implementation of all Bluesky MCP tools
 */

import { BlueskyClient } from './bluesky-client.js';
import {
  sanitizeString,
  sanitizeCursor,
  sanitizeLimit,
  validateAtUri,
  validatePostText,
  MAX_LIMIT,
  DEFAULT_LIMIT
} from './sanitize.js';
import { formatError } from './utils.js';
import type {
  CreatePostInput,
  GetTimelineInput,
  GetAuthorFeedInput,
  GetThreadInput,
  GetProfileInput,
  SearchActorsInput,
  SearchPostsInput,
  GetFeedInput,
  ToolResult
} from './types.js';

/**
 * Handle create_post tool
 */
export async function handleCreatePost(
  client: BlueskyClient,
  params: CreatePostInput
): Promise<ToolResult> {
  try {
    // Validate and sanitize input
    const validation = validatePostText(params.text);
    if (!validation.valid || !validation.text) {
      return { success: false, error: validation.error };
    }

    const result = await client.createPost(validation.text, {
      langs: params.langs?.filter((l): l is string => typeof l === 'string'),
      reply: params.reply
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle get_timeline tool
 */
export async function handleGetTimeline(
  client: BlueskyClient,
  params: GetTimelineInput
): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) {
      return { success: false, error: 'Authentication required. Provide Bluesky credentials.' };
    }

    const result = await client.getTimeline({
      cursor: sanitizeCursor(params.cursor),
      limit: sanitizeLimit(params.limit, DEFAULT_LIMIT)
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle get_feed tool
 */
export async function handleGetFeed(
  client: BlueskyClient,
  params: GetFeedInput
): Promise<ToolResult> {
  try {
    // Validate feed URI
    if (!params.feed || !params.feed.startsWith('at://')) {
      return { success: false, error: 'Invalid feed URI format' };
    }

    const result = await client.getFeed({
      feed: params.feed,
      cursor: sanitizeCursor(params.cursor),
      limit: sanitizeLimit(params.limit, DEFAULT_LIMIT)
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle get_author_feed tool
 */
export async function handleGetAuthorFeed(
  client: BlueskyClient,
  params: GetAuthorFeedInput
): Promise<ToolResult> {
  try {
    if (!params.actor) {
      return { success: false, error: 'Actor parameter is required' };
    }

    const result = await client.getAuthorFeed({
      actor: sanitizeString(params.actor),
      filter: params.filter,
      cursor: sanitizeCursor(params.cursor),
      limit: sanitizeLimit(params.limit, DEFAULT_LIMIT)
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle get_thread tool
 */
export async function handleGetThread(
  _client: BlueskyClient,
  params: GetThreadInput
): Promise<ToolResult> {
  try {
    // Validate URI
    const uriValidation = validateAtUri(params.uri);
    if (!uriValidation.valid || !uriValidation.uri) {
      return { success: false, error: uriValidation.error };
    }

    // We need a fresh client for public operations
    const publicClient = new BlueskyClient();
    const result = await publicClient.getPostThread({
      uri: uriValidation.uri,
      depth: Math.min(Math.max(0, params.depth ?? 6), 1000),
      parentHeight: Math.min(Math.max(0, params.parentHeight ?? 80), 1000)
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle get_profile tool
 */
export async function handleGetProfile(
  _client: BlueskyClient,
  params: GetProfileInput
): Promise<ToolResult> {
  try {
    if (!params.actor) {
      return { success: false, error: 'Actor parameter is required' };
    }

    const publicClient = new BlueskyClient();
    const result = await publicClient.getProfile(sanitizeString(params.actor));

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle get_profiles tool
 */
export async function handleGetProfiles(
  _client: BlueskyClient,
  params: { actors: string[] }
): Promise<ToolResult> {
  try {
    if (!params.actors || !Array.isArray(params.actors) || params.actors.length === 0) {
      return { success: false, error: 'Actors array is required' };
    }

    if (params.actors.length > 25) {
      return { success: false, error: 'Maximum 25 actors per request' };
    }

    const sanitizedActors = params.actors
      .filter((a): a is string => typeof a === 'string')
      .map(a => sanitizeString(a))
      .filter(a => a.length > 0);

    if (sanitizedActors.length === 0) {
      return { success: false, error: 'No valid actors provided' };
    }

    const publicClient = new BlueskyClient();
    const result = await publicClient.getProfiles(sanitizedActors);

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle search_actors tool
 */
export async function handleSearchActors(
  _client: BlueskyClient,
  params: SearchActorsInput
): Promise<ToolResult> {
  try {
    if (!params.term) {
      return { success: false, error: 'Search term is required' };
    }

    const publicClient = new BlueskyClient();
    const result = await publicClient.searchActors({
      term: sanitizeString(params.term),
      limit: sanitizeLimit(params.limit, 10)
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle search_actors_typeahead tool
 */
export async function handleSearchActorsTypeahead(
  _client: BlueskyClient,
  params: SearchActorsInput
): Promise<ToolResult> {
  try {
    if (!params.term) {
      return { success: false, error: 'Search term is required' };
    }

    const publicClient = new BlueskyClient();
    const result = await publicClient.searchActorsTypeahead({
      term: sanitizeString(params.term),
      limit: sanitizeLimit(params.limit, 10)
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle search_posts tool (AI Search Engine)
 */
export async function handleSearchPosts(
  _client: BlueskyClient,
  params: SearchPostsInput
): Promise<ToolResult> {
  try {
    if (!params.query) {
      return { success: false, error: 'Search query is required' };
    }

    const publicClient = new BlueskyClient();
    const result = await publicClient.searchPosts({
      q: sanitizeString(params.query),
      cursor: sanitizeCursor(params.cursor),
      limit: sanitizeLimit(params.limit, DEFAULT_LIMIT),
      sort: params.sort
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle get_posts tool
 */
export async function handleGetPosts(
  _client: BlueskyClient,
  params: { uris: string[] }
): Promise<ToolResult> {
  try {
    if (!params.uris || !Array.isArray(params.uris) || params.uris.length === 0) {
      return { success: false, error: 'URIs array is required' };
    }

    if (params.uris.length > 25) {
      return { success: false, error: 'Maximum 25 URIs per request' };
    }

    const validUris: string[] = [];
    for (const uri of params.uris) {
      const validation = validateAtUri(uri);
      if (validation.valid && validation.uri) {
        validUris.push(validation.uri);
      }
    }

    if (validUris.length === 0) {
      return { success: false, error: 'No valid URIs provided' };
    }

    const publicClient = new BlueskyClient();
    const result = await publicClient.getPosts(validUris);

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle get_likes tool
 */
export async function handleGetLikes(
  _client: BlueskyClient,
  params: { uri: string; cursor?: string; limit?: number }
): Promise<ToolResult> {
  try {
    const validation = validateAtUri(params.uri);
    if (!validation.valid || !validation.uri) {
      return { success: false, error: validation.error };
    }

    const publicClient = new BlueskyClient();
    const result = await publicClient.getLikes(
      validation.uri,
      sanitizeCursor(params.cursor),
      sanitizeLimit(params.limit, 50)
    );

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle get_reposted_by tool
 */
export async function handleGetRepostedBy(
  _client: BlueskyClient,
  params: { uri: string; cursor?: string; limit?: number }
): Promise<ToolResult> {
  try {
    const validation = validateAtUri(params.uri);
    if (!validation.valid || !validation.uri) {
      return { success: false, error: validation.error };
    }

    const publicClient = new BlueskyClient();
    const result = await publicClient.getRepostedBy(
      validation.uri,
      sanitizeCursor(params.cursor),
      sanitizeLimit(params.limit, 50)
    );

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle test_connectivity tool
 */
export async function handleTestConnectivity(
  client: BlueskyClient
): Promise<ToolResult> {
  try {
    const result = await client.testConnectivity();

    if (!result.connected) {
      return {
        success: true,
        data: {
          connected: false,
          authenticated: client.isLoggedIn(),
          error: result.error
        }
      };
    }

    const sessionInfo = client.getSessionInfo();

    return {
      success: true,
      data: {
        connected: true,
        authenticated: sessionInfo.authenticated,
        did: sessionInfo.did,
        handle: sessionInfo.handle,
        serviceUrl: 'https://bsky.social'
      }
    };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Handle get_suggestions tool
 */
export async function handleGetSuggestions(
  client: BlueskyClient,
  params: { limit?: number }
): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) {
      return { success: false, error: 'Authentication required' };
    }

    const result = await client.getSuggestions(sanitizeLimit(params.limit, 10));

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

/**
 * Map of tool name to handler function
 */
export const toolHandlers: Record<string, Function> = {
  create_post: handleCreatePost,
  get_timeline: handleGetTimeline,
  get_feed: handleGetFeed,
  get_author_feed: handleGetAuthorFeed,
  get_thread: handleGetThread,
  get_profile: handleGetProfile,
  get_profiles: handleGetProfiles,
  search_actors: handleSearchActors,
  search_actors_typeahead: handleSearchActorsTypeahead,
  search_posts: handleSearchPosts,
  get_posts: handleGetPosts,
  get_likes: handleGetLikes,
  get_reposted_by: handleGetRepostedBy,
  test_connectivity: handleTestConnectivity,
  get_suggestions: handleGetSuggestions
};

/**
 * Check if a tool name is valid
 */
export function isValidTool(toolName: string): boolean {
  return toolName in toolHandlers;
}