import { BlueskyClient } from './bluesky-client';
import {
  sanitizeString,
  sanitizeCursor,
  sanitizeLimit,
  validateAtUri,
  validatePostText,
  DEFAULT_LIMIT
} from './sanitize';
import { formatError } from './utils';
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
} from './types';

// Use authenticated client if available, otherwise fall back to public API
function getPublicClient(client: BlueskyClient): BlueskyClient {
  return client.isLoggedIn() ? client : new BlueskyClient('https://public.api.bsky.app');
}

export async function handleCreatePost(client: BlueskyClient, params: CreatePostInput): Promise<ToolResult> {
  try {
    const validation = validatePostText(params.text);
    if (!validation.valid || !validation.text) return { success: false, error: validation.error };
    const result = await client.createPost(validation.text, {
      langs: params.langs?.filter((l): l is string => typeof l === 'string'),
      reply: params.reply
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetTimeline(client: BlueskyClient, params: GetTimelineInput): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required. Provide Bluesky credentials.' };
    const result = await client.getTimeline({
      cursor: sanitizeCursor(params.cursor),
      limit: sanitizeLimit(params.limit, DEFAULT_LIMIT)
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetFeed(client: BlueskyClient, params: GetFeedInput): Promise<ToolResult> {
  try {
    if (!params.feed || !params.feed.startsWith('at://')) return { success: false, error: 'Invalid feed URI format' };
    const result = await getPublicClient(client).getFeed({
      feed: params.feed,
      cursor: sanitizeCursor(params.cursor),
      limit: sanitizeLimit(params.limit, DEFAULT_LIMIT)
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetAuthorFeed(client: BlueskyClient, params: GetAuthorFeedInput): Promise<ToolResult> {
  try {
    if (!params.actor) return { success: false, error: 'Actor parameter is required' };
    const result = await getPublicClient(client).getAuthorFeed({
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

export async function handleGetThread(client: BlueskyClient, params: GetThreadInput): Promise<ToolResult> {
  try {
    const uriValidation = validateAtUri(params.uri);
    if (!uriValidation.valid || !uriValidation.uri) return { success: false, error: uriValidation.error };
    const result = await getPublicClient(client).getPostThread({
      uri: uriValidation.uri,
      depth: Math.min(Math.max(0, params.depth ?? 6), 1000),
      parentHeight: Math.min(Math.max(0, params.parentHeight ?? 80), 1000)
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetProfile(client: BlueskyClient, params: GetProfileInput): Promise<ToolResult> {
  try {
    if (!params.actor) return { success: false, error: 'Actor parameter is required' };
    const result = await getPublicClient(client).getProfile(sanitizeString(params.actor));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetProfiles(client: BlueskyClient, params: { actors: string[] }): Promise<ToolResult> {
  try {
    if (!params.actors || !Array.isArray(params.actors) || params.actors.length === 0)
      return { success: false, error: 'Actors array is required' };
    if (params.actors.length > 25) return { success: false, error: 'Maximum 25 actors per request' };
    const sanitizedActors = params.actors
      .filter((a): a is string => typeof a === 'string')
      .map(a => sanitizeString(a))
      .filter(a => a.length > 0);
    if (sanitizedActors.length === 0) return { success: false, error: 'No valid actors provided' };
    const result = await getPublicClient(client).getProfiles(sanitizedActors);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleSearchActors(client: BlueskyClient, params: SearchActorsInput): Promise<ToolResult> {
  try {
    if (!params.term) return { success: false, error: 'Search term is required' };
    const result = await getPublicClient(client).searchActors({
      term: sanitizeString(params.term),
      limit: sanitizeLimit(params.limit, 10)
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleSearchActorsTypeahead(client: BlueskyClient, params: SearchActorsInput): Promise<ToolResult> {
  try {
    if (!params.term) return { success: false, error: 'Search term is required' };
    const result = await getPublicClient(client).searchActorsTypeahead({
      term: sanitizeString(params.term),
      limit: sanitizeLimit(params.limit, 10)
    });
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleSearchPosts(client: BlueskyClient, params: SearchPostsInput): Promise<ToolResult> {
  try {
    if (!params.query) return { success: false, error: 'Search query is required' };
    const result = await getPublicClient(client).searchPosts({
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

export async function handleGetPosts(client: BlueskyClient, params: { uris: string[] }): Promise<ToolResult> {
  try {
    if (!params.uris || !Array.isArray(params.uris) || params.uris.length === 0)
      return { success: false, error: 'URIs array is required' };
    if (params.uris.length > 25) return { success: false, error: 'Maximum 25 URIs per request' };
    const validUris: string[] = [];
    for (const uri of params.uris) {
      const validation = validateAtUri(uri);
      if (validation.valid && validation.uri) validUris.push(validation.uri);
    }
    if (validUris.length === 0) return { success: false, error: 'No valid URIs provided' };
    const result = await getPublicClient(client).getPosts(validUris);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetLikes(client: BlueskyClient, params: { uri: string; cursor?: string; limit?: number }): Promise<ToolResult> {
  try {
    const validation = validateAtUri(params.uri);
    if (!validation.valid || !validation.uri) return { success: false, error: validation.error };
    const result = await getPublicClient(client).getLikes(
      validation.uri,
      sanitizeCursor(params.cursor),
      sanitizeLimit(params.limit, 50)
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetRepostedBy(client: BlueskyClient, params: { uri: string; cursor?: string; limit?: number }): Promise<ToolResult> {
  try {
    const validation = validateAtUri(params.uri);
    if (!validation.valid || !validation.uri) return { success: false, error: validation.error };
    const result = await getPublicClient(client).getRepostedBy(
      validation.uri,
      sanitizeCursor(params.cursor),
      sanitizeLimit(params.limit, 50)
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleLikePost(client: BlueskyClient, params: { uri: string; cid: string }): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.like(params.uri, params.cid);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleRepostPost(client: BlueskyClient, params: { uri: string; cid: string }): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.repost(params.uri, params.cid);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleTestConnectivity(client: BlueskyClient): Promise<ToolResult> {
  try {
    const result = await client.testConnectivity();
    if (!result.connected) {
      return { success: true, data: { connected: false, authenticated: client.isLoggedIn(), error: result.error } };
    }
    const sessionInfo = client.getSessionInfo();
    return { success: true, data: { connected: true, authenticated: sessionInfo.authenticated, did: sessionInfo.did, handle: sessionInfo.handle, serviceUrl: 'https://bsky.social' } };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetSuggestions(client: BlueskyClient, params: { limit?: number }): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.getSuggestions(sanitizeLimit(params.limit, 10));
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

export async function handleGetPreferences(client: BlueskyClient): Promise<ToolResult> {
  try {
    if (!client.isLoggedIn()) return { success: false, error: 'Authentication required' };
    const result = await client.getPreferences();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: formatError(error) };
  }
}

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
  like_post: handleLikePost,
  repost_post: handleRepostPost,
  test_connectivity: handleTestConnectivity,
  get_suggestions: handleGetSuggestions,
  get_preferences: handleGetPreferences
};

export function isValidTool(toolName: string): boolean {
  return toolName in toolHandlers;
}
