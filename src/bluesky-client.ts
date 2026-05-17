/**
 * Bluesky API Client with Secure Credential Management
 * Credentials are injected externally via headers - never stored in env
 */

import { BskyAgent, AppBskyFeedPost } from '@atproto/api';
import type {
  BlueskyCredentials,
  AuthenticatedSession,
  TimelineOptions,
  AuthorFeedOptions,
  FeedOptions,
  ThreadOptions,
  SearchActorsOptions,
  ProfileView,
  ActorSearchResult,
  FeedViewPost,
  ThreadViewPost,
  PostView,
  CreatePostResult,
  SearchPostsOptions,
  SearchPostsResult
} from './types.js';
import { formatError } from './utils.js';

export class BlueskyClient {
  private agent: BskyAgent;
  private session: AuthenticatedSession | null = null;
  private readonly serviceUrl: string;
  private isAuthenticated = false;

  constructor(serviceUrl = 'https://bsky.social') {
    this.serviceUrl = serviceUrl;
    this.agent = new BskyAgent({ service: serviceUrl });
  }

  /**
   * Authenticate with Bluesky using externally provided credentials
   * Credentials are NEVER stored - only held in memory for the session
   */
  async authenticate(credentials: BlueskyCredentials): Promise<AuthenticatedSession> {
    try {
      await this.agent.login({
        identifier: credentials.identifier,
        password: credentials.password
      });

      // Get session details
      const sessionData = this.agent.session;

      if (!sessionData) {
        throw new Error('Failed to establish session');
      }

      this.session = {
        accessJwt: sessionData.accessJwt,
        refreshJwt: sessionData.refreshJwt,
        did: sessionData.did,
        handle: sessionData.handle
      };

      this.isAuthenticated = true;
      return this.session;
    } catch (error) {
      this.isAuthenticated = false;
      throw new Error(`Authentication failed: ${formatError(error)}`);
    }
  }

  /**
   * Check if client is authenticated
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated && this.session !== null;
  }

  /**
   * Get current session info (without sensitive tokens)
   */
  getSessionInfo(): { did?: string; handle?: string; authenticated: boolean } {
    return {
      did: this.session?.did,
      handle: this.session?.handle,
      authenticated: this.isAuthenticated
    };
  }

  /**
   * Create a new post
   */
  async createPost(
    text: string,
    options: {
      langs?: string[];
      reply?: {
        rootUri: string;
        rootCid: string;
        parentUri: string;
        parentCid: string;
      };
    } = {}
  ): Promise<CreatePostResult> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const postRecord: AppBskyFeedPost.Record = {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: new Date().toISOString()
      };

      if (options.langs && options.langs.length > 0) {
        postRecord.langs = options.langs;
      }

      if (options.reply) {
        postRecord.reply = {
          root: { uri: options.reply.rootUri, cid: options.reply.rootCid },
          parent: { uri: options.reply.parentUri, cid: options.reply.parentCid }
        };
      }

      const result = await this.agent.post(postRecord);

      return {
        uri: result.uri,
        cid: result.cid
      };
    } catch (error) {
      throw new Error(`Failed to create post: ${formatError(error)}`);
    }
  }

  /**
   * Get user's timeline (home feed)
   */
  async getTimeline(options: TimelineOptions = {}): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.agent.getTimeline({
        cursor: options.cursor,
        limit: options.limit
      });

      return {
        feed: response.data.feed as unknown as FeedViewPost[],
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to get timeline: ${formatError(error)}`);
    }
  }

  /**
   * Get feed from a feed generator
   */
  async getFeed(options: FeedOptions): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
    try {
      const response = await this.agent.app.bsky.feed.getFeed({
        feed: options.feed,
        cursor: options.cursor,
        limit: options.limit
      });

      return {
        feed: response.data.feed as unknown as FeedViewPost[],
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to get feed: ${formatError(error)}`);
    }
  }

  /**
   * Get posts by a specific author
   */
  async getAuthorFeed(options: AuthorFeedOptions): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
    try {
      const response = await this.agent.getAuthorFeed({
        actor: options.actor,
        filter: options.filter,
        cursor: options.cursor,
        limit: options.limit
      });

      return {
        feed: response.data.feed as unknown as FeedViewPost[],
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to get author feed: ${formatError(error)}`);
    }
  }

  /**
   * Get a post thread
   */
  async getPostThread(options: ThreadOptions): Promise<{ thread: ThreadViewPost }> {
    try {
      const response = await this.agent.getPostThread({
        uri: options.uri,
        depth: options.depth,
        parentHeight: options.parentHeight
      });

      return {
        thread: response.data.thread as unknown as ThreadViewPost
      };
    } catch (error) {
      throw new Error(`Failed to get thread: ${formatError(error)}`);
    }
  }

  /**
   * Get a user's profile
   */
  async getProfile(actor: string): Promise<ProfileView> {
    try {
      const response = await this.agent.getProfile({ actor });
      return response.data as ProfileView;
    } catch (error) {
      throw new Error(`Failed to get profile: ${formatError(error)}`);
    }
  }

  /**
   * Get multiple profiles
   */
  async getProfiles(actors: string[]): Promise<{ profiles: ProfileView[] }> {
    try {
      const response = await this.agent.getProfiles({ actors });
      return { profiles: response.data.profiles as ProfileView[] };
    } catch (error) {
      throw new Error(`Failed to get profiles: ${formatError(error)}`);
    }
  }

  /**
   * Search for actors (users) - for AI search engine functionality
   */
  async searchActors(options: SearchActorsOptions): Promise<{ actors: ActorSearchResult[] }> {
    try {
      // Use public API for search (no auth required)
      const response = await this.agent.app.bsky.actor.searchActors({
        term: options.term,
        limit: options.limit
      });

      return {
        actors: response.data.actors as ActorSearchResult[]
      };
    } catch (error) {
      throw new Error(`Failed to search actors: ${formatError(error)}`);
    }
  }

  /**
   * Search for actors with typeahead (for autocomplete)
   */
  async searchActorsTypeahead(options: SearchActorsOptions): Promise<{ actors: ActorSearchResult[] }> {
    try {
      const response = await this.agent.app.bsky.actor.searchActorsTypeahead({
        term: options.term,
        limit: options.limit
      });

      return {
        actors: response.data.actors as ActorSearchResult[]
      };
    } catch (error) {
      throw new Error(`Failed to search actors: ${formatError(error)}`);
    }
  }

  /**
   * Search posts by keyword - core AI search engine functionality
   */
  async searchPosts(options: SearchPostsOptions): Promise<SearchPostsResult> {
    try {
      const response = await this.agent.app.bsky.feed.searchPosts({
        q: options.q,
        cursor: options.cursor,
        limit: options.limit,
        sort: options.sort,
        mentions: options.mentions,
        author: options.author,
        lang: options.lang
      });

      return {
        posts: response.data.posts as unknown as PostView[],
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to search posts: ${formatError(error)}`);
    }
  }

  /**
   * Get specific posts by URI
   */
  async getPosts(uris: string[]): Promise<{ posts: PostView[] }> {
    try {
      const response = await this.agent.getPosts({ uris });
      return { posts: response.data.posts as unknown as PostView[] };
    } catch (error) {
      throw new Error(`Failed to get posts: ${formatError(error)}`);
    }
  }

  /**
   * Get likes for a post
   */
  async getLikes(uri: string, cursor?: string, limit = 50): Promise<{ likes: unknown[]; cursor?: string }> {
    try {
      const response = await this.agent.app.bsky.feed.getLikes({ uri, cursor, limit });
      return {
        likes: response.data.likes,
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to get likes: ${formatError(error)}`);
    }
  }

  /**
   * Get reposted by for a post
   */
  async getRepostedBy(uri: string, cursor?: string, limit = 50): Promise<{ repostedBy: ProfileView[]; cursor?: string }> {
    try {
      const response = await this.agent.app.bsky.feed.getRepostedBy({ uri, cursor, limit });
      return {
        repostedBy: response.data.repostedBy as ProfileView[],
        cursor: response.data.cursor
      };
    } catch (error) {
      throw new Error(`Failed to get reposted by: ${formatError(error)}`);
    }
  }

  /**
   * Test connectivity to Bluesky
   */
  async testConnectivity(): Promise<{ connected: boolean; error?: string }> {
    try {
      // Just check if we can reach the server
      const response = await this.agent.com.atproto.server.describeServer({});
      return {
        connected: true
      };
    } catch (error) {
      return {
        connected: false,
        error: formatError(error)
      };
    }
  }

  /**
   * Get suggested users to follow
   */
  async getSuggestions(limit = 10): Promise<{ actors: ActorSearchResult[] }> {
    if (!this.isLoggedIn()) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await this.agent.getSuggestions({ limit });
      return {
        actors: response.data.actors as ActorSearchResult[]
      };
    } catch (error) {
      throw new Error(`Failed to get suggestions: ${formatError(error)}`);
    }
  }

  /**
   * Logout and clear session
   */
  logout(): void {
    this.agent = new BskyAgent({ service: this.serviceUrl });
    this.session = null;
    this.isAuthenticated = false;
  }
}

/**
 * Factory function to create a new Bluesky client instance
 */
export function createBlueskyClient(serviceUrl?: string): BlueskyClient {
  return new BlueskyClient(serviceUrl);
}