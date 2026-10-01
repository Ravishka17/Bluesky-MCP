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
  SearchPostsResult,
  SearchAccountsInput,
  ProcessedImage
} from './types';
import { formatError } from './utils';

const CHAT_PROXY_DID = 'did:web:api.bsky.chat';
const CHAT_PROXY_TYPE = 'bsky_chat';

export class BlueskyClient {
  private agent: BskyAgent;
  private session: AuthenticatedSession | null = null;
  private readonly serviceUrl: string;
  private isAuthenticated = false;
  private readonly APPVIEW_URL = 'https://api.bsky.app';

  constructor(serviceUrl = 'https://bsky.social') {
    this.serviceUrl = serviceUrl;
    this.agent = new BskyAgent({ service: serviceUrl });
  }

  // ── Session ────────────────────────────────────────────────────────────────

  async authenticate(credentials: BlueskyCredentials): Promise<AuthenticatedSession> {
    try {
      await this.agent.login({
        identifier: credentials.identifier,
        password: credentials.password
      });

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

  isLoggedIn(): boolean {
    return this.isAuthenticated && this.session !== null;
  }

  getSessionInfo(): { did?: string; handle?: string; authenticated: boolean } {
    return {
      did: this.session?.did,
      handle: this.session?.handle,
      authenticated: this.isAuthenticated
    };
  }

  private requireAuth(): AuthenticatedSession {
    if (!this.isLoggedIn() || !this.session) {
      throw new Error('Not authenticated');
    }
    return this.session;
  }

  /**
   * Adds a clear hint when an endpoint failed because it needs PDS-admin rights.
   */
  private adminError(label: string, error: unknown): Error {
    const message = formatError(error);
    const looksLikePermission = /auth|admin|forbidden|lexicon|not implemented|unauthorized/i.test(message);
    const hint = looksLikePermission
      ? ' (this endpoint needs PDS admin privileges and is not available for a normal bsky.social account)'
      : '';
    return new Error(`${label}: ${message}${hint}`);
  }

  // ── Low-level helpers ──────────────────────────────────────────────────────

  /**
   * Direct request to the Bluesky AppView (api.bsky.app).
   * Used for lexicons that the PDS does not proxy (bookmarks, drafts, age assurance).
   */
  private async appviewRequest<T>(
    nsid: string,
    params?: Record<string, string | number | undefined | null>,
    body?: Record<string, unknown>
  ): Promise<T> {
    const session = this.requireAuth();

    const url = new URL(`${this.APPVIEW_URL}/xrpc/${nsid}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.toString(), {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessJwt}`
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      let message = `AppView request failed: ${response.status} ${response.statusText}`;
      try {
        const errorData = (await response.json()) as { message?: string; error?: string };
        if (errorData?.message) message = errorData.message;
        else if (errorData?.error) message = errorData.error;
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message);
    }

    const text = await response.text();
    if (text.trim().length === 0) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  /**
   * Chat (DM) calls must go through the user's PDS with an atproto-proxy header.
   * Sending them to api.bsky.app returns "Method Not Implemented".
   */
  private chat() {
    this.requireAuth();
    return this.agent.withProxy(CHAT_PROXY_TYPE, CHAT_PROXY_DID).api.chat.bsky;
  }

  /**
   * Upload every image and build an app.bsky.embed.images embed.
   */
  private async buildImageEmbed(images: ProcessedImage[]): Promise<Record<string, unknown>> {
    const uploaded = await Promise.all(
      images.map(async (img) => {
        const blob = await this.uploadImage(img.data, img.mimeType);
        const imageObj: Record<string, unknown> = { image: blob, alt: img.alt };
        if (img.aspectRatio) imageObj.aspectRatio = img.aspectRatio;
        return imageObj;
      })
    );
    return { $type: 'app.bsky.embed.images', images: uploaded };
  }

  // ── Blobs ──────────────────────────────────────────────────────────────────

  async uploadImage(data: Uint8Array, mimeType: string): Promise<unknown> {
    this.requireAuth();
    const res = await this.agent.uploadBlob(data, { encoding: mimeType });
    return res.data.blob;
  }

  async uploadBlob(data: Uint8Array, mimeType: string): Promise<unknown> {
    return this.uploadImage(data, mimeType);
  }

  // ── Posts ──────────────────────────────────────────────────────────────────

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
      images?: ProcessedImage[];
    } = {}
  ): Promise<CreatePostResult> {
    this.requireAuth();

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

      if (options.images && options.images.length > 0) {
        (postRecord as Record<string, unknown>).embed = await this.buildImageEmbed(options.images);
      }

      const result = await this.agent.post(postRecord);
      return { uri: result.uri, cid: result.cid };
    } catch (error) {
      throw new Error(`Failed to create post: ${formatError(error)}`);
    }
  }

  async deletePost(uriOrRkey: string): Promise<void> {
    const session = this.requireAuth();

    let rkey: string;
    if (uriOrRkey.startsWith('at://')) {
      const match = uriOrRkey.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/);
      if (!match || !match[3]) {
        throw new Error('Invalid AT Protocol URI: missing rkey');
      }
      rkey = match[3];
    } else {
      rkey = uriOrRkey;
    }

    try {
      await this.agent.com.atproto.repo.deleteRecord({
        repo: session.did,
        collection: 'app.bsky.feed.post',
        rkey
      });
    } catch (error) {
      throw new Error(`Failed to delete post: ${formatError(error)}`);
    }
  }

  async getPosts(uris: string[]): Promise<{ posts: PostView[] }> {
    try {
      const response = await this.agent.getPosts({ uris });
      return { posts: response.data.posts as unknown as PostView[] };
    } catch (error) {
      throw new Error(`Failed to get posts: ${formatError(error)}`);
    }
  }

  async getLikes(uri: string, cursor?: string, limit = 50): Promise<{ likes: unknown[]; cursor?: string }> {
    try {
      const response = await this.agent.app.bsky.feed.getLikes({ uri, cursor, limit });
      return { likes: response.data.likes, cursor: response.data.cursor };
    } catch (error) {
      throw new Error(`Failed to get likes: ${formatError(error)}`);
    }
  }

  async getRepostedBy(uri: string, cursor?: string, limit = 50): Promise<{ repostedBy: ProfileView[]; cursor?: string }> {
    try {
      const response = await this.agent.app.bsky.feed.getRepostedBy({ uri, cursor, limit });
      return { repostedBy: response.data.repostedBy as ProfileView[], cursor: response.data.cursor };
    } catch (error) {
      throw new Error(`Failed to get reposted by: ${formatError(error)}`);
    }
  }

  async like(uri: string, cid: string): Promise<{ uri: string }> {
    this.requireAuth();
    try {
      const result = await this.agent.like(uri, cid);
      return { uri: result.uri };
    } catch (error) {
      throw new Error(`Failed to like post: ${formatError(error)}`);
    }
  }

  async repost(uri: string, cid: string): Promise<{ uri: string }> {
    this.requireAuth();
    try {
      const result = await this.agent.repost(uri, cid);
      return { uri: result.uri };
    } catch (error) {
      throw new Error(`Failed to repost: ${formatError(error)}`);
    }
  }

  /** uri must be the like RECORD uri returned by like(). */
  async deleteLike(uri: string): Promise<void> {
    this.requireAuth();
    try {
      await this.agent.deleteLike(uri);
    } catch (error) {
      throw new Error(`Failed to unlike post: ${formatError(error)}`);
    }
  }

  /** uri must be the repost RECORD uri returned by repost(). */
  async deleteRepost(uri: string): Promise<void> {
    this.requireAuth();
    try {
      await this.agent.deleteRepost(uri);
    } catch (error) {
      throw new Error(`Failed to un-repost post: ${formatError(error)}`);
    }
  }

  // ── Feeds ──────────────────────────────────────────────────────────────────

  async getTimeline(options: TimelineOptions = {}): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
    this.requireAuth();
    try {
      const response = await this.agent.getTimeline({ cursor: options.cursor, limit: options.limit });
      return { feed: response.data.feed as unknown as FeedViewPost[], cursor: response.data.cursor };
    } catch (error) {
      throw new Error(`Failed to get timeline: ${formatError(error)}`);
    }
  }

  async getFeed(options: FeedOptions): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
    try {
      const response = await this.agent.app.bsky.feed.getFeed({
        feed: options.feed,
        cursor: options.cursor,
        limit: options.limit
      });
      return { feed: response.data.feed as unknown as FeedViewPost[], cursor: response.data.cursor };
    } catch (error) {
      throw new Error(`Failed to get feed: ${formatError(error)}`);
    }
  }

  async getAuthorFeed(options: AuthorFeedOptions): Promise<{ feed: FeedViewPost[]; cursor?: string }> {
    try {
      const response = await this.agent.getAuthorFeed({
        actor: options.actor,
        filter: options.filter,
        cursor: options.cursor,
        limit: options.limit
      });
      return { feed: response.data.feed as unknown as FeedViewPost[], cursor: response.data.cursor };
    } catch (error) {
      throw new Error(`Failed to get author feed: ${formatError(error)}`);
    }
  }

  async getPostThread(options: ThreadOptions): Promise<{ thread: ThreadViewPost }> {
    try {
      const response = await this.agent.getPostThread({
        uri: options.uri,
        depth: options.depth,
        parentHeight: options.parentHeight
      });
      return { thread: response.data.thread as unknown as ThreadViewPost };
    } catch (error) {
      throw new Error(`Failed to get thread: ${formatError(error)}`);
    }
  }

  // ── Profiles & search ──────────────────────────────────────────────────────

  async getProfile(actor: string): Promise<ProfileView> {
    try {
      const response = await this.agent.getProfile({ actor });
      return response.data as ProfileView;
    } catch (error) {
      throw new Error(`Failed to get profile: ${formatError(error)}`);
    }
  }

  async getProfiles(actors: string[]): Promise<{ profiles: ProfileView[] }> {
    try {
      const response = await this.agent.getProfiles({ actors });
      return { profiles: response.data.profiles as ProfileView[] };
    } catch (error) {
      throw new Error(`Failed to get profiles: ${formatError(error)}`);
    }
  }

  async searchActors(options: SearchActorsOptions): Promise<{ actors: ActorSearchResult[] }> {
    try {
      const response = await this.agent.app.bsky.actor.searchActors({
        term: options.term,
        limit: options.limit
      });
      return { actors: response.data.actors as ActorSearchResult[] };
    } catch (error) {
      throw new Error(`Failed to search actors: ${formatError(error)}`);
    }
  }

  async searchActorsTypeahead(options: SearchActorsOptions): Promise<{ actors: ActorSearchResult[] }> {
    try {
      const response = await this.agent.app.bsky.actor.searchActorsTypeahead({
        term: options.term,
        limit: options.limit
      });
      return { actors: response.data.actors as ActorSearchResult[] };
    } catch (error) {
      throw new Error(`Failed to search actors: ${formatError(error)}`);
    }
  }

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
      return { posts: response.data.posts as unknown as PostView[], cursor: response.data.cursor };
    } catch (error) {
      throw new Error(`Failed to search posts: ${formatError(error)}`);
    }
  }

  async getSuggestions(limit = 10): Promise<{ actors: ActorSearchResult[] }> {
    this.requireAuth();
    try {
      const response = await this.agent.getSuggestions({ limit });
      return { actors: response.data.actors as ActorSearchResult[] };
    } catch (error) {
      throw new Error(`Failed to get suggestions: ${formatError(error)}`);
    }
  }

  async getPreferences(): Promise<{ preferences: unknown[] }> {
    this.requireAuth();
    try {
      const response = await this.agent.app.bsky.actor.getPreferences({});
      return { preferences: response.data.preferences };
    } catch (error) {
      throw new Error(`Failed to get preferences: ${formatError(error)}`);
    }
  }

  async testConnectivity(): Promise<{ connected: boolean; error?: string }> {
    try {
      await this.agent.com.atproto.server.describeServer({});
      return { connected: true };
    } catch (error) {
      return { connected: false, error: formatError(error) };
    }
  }

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  async createBookmark(uri: string, cid: string): Promise<{ id: string } | undefined> {
    try {
      return await this.appviewRequest<{ id: string }>('app.bsky.bookmark.createBookmark', undefined, { uri, cid });
    } catch (error) {
      throw new Error(`Failed to create bookmark: ${formatError(error)}`);
    }
  }

  async deleteBookmark(uri: string): Promise<void> {
    try {
      await this.appviewRequest<void>('app.bsky.bookmark.deleteBookmark', undefined, { uri });
    } catch (error) {
      throw new Error(`Failed to delete bookmark: ${formatError(error)}`);
    }
  }

  async getBookmarks(cursor?: string, limit = 50): Promise<{ bookmarks: unknown[]; cursor?: string }> {
    try {
      const result = await this.appviewRequest<{ bookmarks: unknown[]; cursor?: string }>(
        'app.bsky.bookmark.getBookmarks',
        { cursor, limit }
      );
      return result ?? { bookmarks: [] };
    } catch (error) {
      throw new Error(`Failed to get bookmarks: ${formatError(error)}`);
    }
  }

  // ── Age assurance ──────────────────────────────────────────────────────────

  async beginAgeAssurance(): Promise<unknown> {
    try {
      return await this.appviewRequest<unknown>('app.bsky.ageassurance.begin', undefined, {});
    } catch (error) {
      throw new Error(`Failed to begin age assurance: ${formatError(error)}`);
    }
  }

  async getAgeAssuranceConfig(): Promise<unknown> {
    try {
      return await this.appviewRequest<unknown>('app.bsky.ageassurance.getConfig');
    } catch (error) {
      throw new Error(`Failed to get age assurance config: ${formatError(error)}`);
    }
  }

  /** countryCode is REQUIRED by app.bsky.ageassurance.getState. */
  async getAgeAssuranceState(countryCode: string, regionCode?: string): Promise<unknown> {
    try {
      return await this.appviewRequest<unknown>('app.bsky.ageassurance.getState', {
        countryCode,
        regionCode
      });
    } catch (error) {
      throw new Error(`Failed to get age assurance state: ${formatError(error)}`);
    }
  }

  // ── Drafts (AppView) ───────────────────────────────────────────────────────

  private async buildDraftPost(text: string, images?: ProcessedImage[]): Promise<Record<string, unknown>> {
    const draftPost: Record<string, unknown> = { text };
    if (images && images.length > 0) {
      draftPost.embed = await this.buildImageEmbed(images);
    }
    return draftPost;
  }

  async createDraft(text: string, langs?: string[], images?: ProcessedImage[]): Promise<{ id: string }> {
    this.requireAuth();
    try {
      const draft: Record<string, unknown> = { posts: [await this.buildDraftPost(text, images)] };
      if (langs && langs.length > 0) draft.langs = langs;

      const result = await this.appviewRequest<{ id: string }>('app.bsky.draft.createDraft', undefined, { draft });
      if (!result) throw new Error('Empty response from createDraft');
      return result;
    } catch (error) {
      throw new Error(`Failed to create draft: ${formatError(error)}`);
    }
  }

  async updateDraft(id: string, text: string, langs?: string[], images?: ProcessedImage[]): Promise<void> {
    this.requireAuth();
    try {
      const draftWithId = {
        id,
        draft: {
          posts: [await this.buildDraftPost(text, images)],
          ...(langs && langs.length > 0 ? { langs } : {})
        }
      };
      await this.appviewRequest<void>('app.bsky.draft.updateDraft', undefined, { draft: draftWithId });
    } catch (error) {
      throw new Error(`Failed to update draft: ${formatError(error)}`);
    }
  }

  async deleteDraft(id: string): Promise<void> {
    try {
      await this.appviewRequest<void>('app.bsky.draft.deleteDraft', undefined, { id });
    } catch (error) {
      throw new Error(`Failed to delete draft: ${formatError(error)}`);
    }
  }

  async getDrafts(cursor?: string, limit = 50): Promise<{ drafts: unknown[]; cursor?: string }> {
    try {
      const result = await this.appviewRequest<{ drafts: unknown[]; cursor?: string }>(
        'app.bsky.draft.getDrafts',
        { cursor, limit }
      );
      return result ?? { drafts: [] };
    } catch (error) {
      throw new Error(`Failed to get drafts: ${formatError(error)}`);
    }
  }

  // ── Chat (DMs, via PDS proxy) ──────────────────────────────────────────────

  async listConvos(cursor?: string, limit = 50): Promise<unknown> {
    try {
      const res = await this.chat().convo.listConvos({ cursor, limit });
      return res.data;
    } catch (error) {
      throw new Error(`Failed to list conversations: ${formatError(error)}`);
    }
  }

  /** Gets (or creates) the conversation with the given member DIDs. */
  async getConvoForMembers(members: string[]): Promise<unknown> {
    try {
      const res = await this.chat().convo.getConvoForMembers({ members });
      return res.data;
    } catch (error) {
      throw new Error(`Failed to get conversation: ${formatError(error)}`);
    }
  }

  async addReaction(convoId: string, messageId: string, value: string): Promise<unknown> {
    try {
      const res = await this.chat().convo.addReaction({ convoId, messageId, value });
      return res.data;
    } catch (error) {
      throw new Error(`Failed to add reaction: ${formatError(error)}`);
    }
  }

  async removeReaction(convoId: string, messageId: string, value: string): Promise<unknown> {
    try {
      const res = await this.chat().convo.removeReaction({ convoId, messageId, value });
      return res.data;
    } catch (error) {
      throw new Error(`Failed to remove reaction: ${formatError(error)}`);
    }
  }

  async getMessages(convoId: string, cursor?: string, limit = 50): Promise<{ messages: unknown[]; cursor?: string }> {
    try {
      const res = await this.chat().convo.getMessages({ convoId, cursor, limit });
      return { messages: res.data.messages, cursor: res.data.cursor };
    } catch (error) {
      throw new Error(`Failed to get messages: ${formatError(error)}`);
    }
  }

  async sendMessage(convoId: string, message: { text: string }): Promise<unknown> {
    try {
      const res = await this.chat().convo.sendMessage({ convoId, message });
      return res.data;
    } catch (error) {
      throw new Error(`Failed to send message: ${formatError(error)}`);
    }
  }

  async sendMessageBatch(items: Array<{ convoId: string; message: { text: string } }>): Promise<unknown> {
    try {
      const res = await this.chat().convo.sendMessageBatch({ items });
      return res.data;
    } catch (error) {
      throw new Error(`Failed to send message batch: ${formatError(error)}`);
    }
  }

  /** Moderation endpoint: only works for accounts with chat moderation rights. */
  async getMessageContext(messageId: string): Promise<unknown> {
    try {
      const res = await this.chat().moderation.getMessageContext({ messageId });
      return res.data;
    } catch (error) {
      throw this.adminError('Failed to get message context', error);
    }
  }

  // ── Server / account management (typed methods, no raw xrpc.get) ───────────

  async updateEmail(email: string, token?: string): Promise<void> {
    this.requireAuth();
    try {
      await this.agent.com.atproto.server.updateEmail({ email, ...(token ? { token } : {}) });
    } catch (error) {
      throw new Error(`Failed to update email: ${formatError(error)}`);
    }
  }

  async confirmEmail(email: string, token: string): Promise<void> {
    this.requireAuth();
    try {
      await this.agent.com.atproto.server.confirmEmail({ email, token });
    } catch (error) {
      throw new Error(`Failed to confirm email: ${formatError(error)}`);
    }
  }

  /** Admin only: com.atproto.admin.sendEmail (senderDid is required by the lexicon). */
  async adminSendEmail(
    recipientDid: string,
    content: string,
    subject?: string,
    senderDid?: string,
    comment?: string
  ): Promise<unknown> {
    const session = this.requireAuth();
    try {
      const res = await this.agent.com.atproto.admin.sendEmail({
        recipientDid,
        content,
        senderDid: senderDid ?? session.did,
        ...(subject ? { subject } : {}),
        ...(comment ? { comment } : {})
      });
      return res.data;
    } catch (error) {
      throw this.adminError('Failed to send admin email', error);
    }
  }

  async createAccount(
    email: string,
    handle: string,
    password: string,
    inviteCode?: string,
    verificationCode?: string,
    verificationPhone?: string,
    plcOp?: Record<string, unknown>
  ): Promise<{ did: string; handle: string; accessJwt: string; refreshJwt: string }> {
    try {
      const res = await this.agent.com.atproto.server.createAccount({
        email,
        handle,
        password,
        ...(inviteCode ? { inviteCode } : {}),
        ...(verificationCode ? { verificationCode } : {}),
        ...(verificationPhone ? { verificationPhone } : {}),
        ...(plcOp ? { plcOp } : {})
      });
      return res.data;
    } catch (error) {
      throw new Error(`Failed to create account: ${formatError(error)}`);
    }
  }

  async createAppPassword(name: string): Promise<unknown> {
    this.requireAuth();
    try {
      const res = await this.agent.com.atproto.server.createAppPassword({ name });
      return res.data;
    } catch (error) {
      throw new Error(`Failed to create app password: ${formatError(error)}`);
    }
  }

  /** Admin only on most servers. useCount is required by the lexicon. */
  async createInviteCode(forAccount?: string, useCount = 1): Promise<{ code: string }> {
    this.requireAuth();
    try {
      const res = await this.agent.com.atproto.server.createInviteCode({
        useCount,
        ...(forAccount ? { forAccount } : {})
      });
      return res.data;
    } catch (error) {
      throw this.adminError('Failed to create invite code', error);
    }
  }

  /** Admin only on most servers. */
  async createInviteCodes(
    codeCount = 1,
    useCount = 1,
    forAccounts?: string[]
  ): Promise<{ codes: { account: string; codes: string[] }[] }> {
    this.requireAuth();
    try {
      const res = await this.agent.com.atproto.server.createInviteCodes({
        codeCount,
        useCount,
        ...(forAccounts && forAccounts.length > 0 ? { forAccounts } : {})
      });
      return res.data;
    } catch (error) {
      throw this.adminError('Failed to create invite codes', error);
    }
  }

  async createSession(
    identifier: string,
    password: string,
    authFactorToken?: string
  ): Promise<{ did: string; handle: string; email?: string; accessJwt: string; refreshJwt: string }> {
    try {
      // Use a throwaway agent so this never replaces the active session.
      const temp = new BskyAgent({ service: this.serviceUrl });
      const res = await temp.com.atproto.server.createSession({
        identifier,
        password,
        ...(authFactorToken ? { authFactorToken } : {})
      });
      return res.data;
    } catch (error) {
      throw new Error(`Failed to create session: ${formatError(error)}`);
    }
  }

  async deactivateAccount(deleteAfter?: string): Promise<void> {
    this.requireAuth();
    try {
      await this.agent.com.atproto.server.deactivateAccount({ ...(deleteAfter ? { deleteAfter } : {}) });
    } catch (error) {
      throw new Error(`Failed to deactivate account: ${formatError(error)}`);
    }
  }

  /** Step 1 of account deletion: emails a deletion token to the account email. */
  async requestAccountDelete(): Promise<void> {
    this.requireAuth();
    try {
      await this.agent.com.atproto.server.requestAccountDelete();
    } catch (error) {
      throw new Error(`Failed to request account deletion: ${formatError(error)}`);
    }
  }

  /** Step 2: did + password + emailed token are all required by the lexicon. */
  async deleteAccount(password: string, token: string): Promise<void> {
    const session = this.requireAuth();
    try {
      await this.agent.com.atproto.server.deleteAccount({ did: session.did, password, token });
      this.logout();
    } catch (error) {
      throw new Error(`Failed to delete account: ${formatError(error)}`);
    }
  }

  /**
   * deleteSession must be authenticated with the REFRESH token and send no body.
   */
  async deleteSession(): Promise<void> {
    const session = this.requireAuth();
    try {
      const response = await fetch(`${this.serviceUrl}/xrpc/com.atproto.server.deleteSession`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.refreshJwt}` }
      });
      if (!response.ok) {
        let message = `Delete session failed: ${response.status} ${response.statusText}`;
        try {
          const errorData = (await response.json()) as { message?: string; error?: string };
          if (errorData?.message) message = errorData.message;
          else if (errorData?.error) message = errorData.error;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
      }
      this.logout();
    } catch (error) {
      throw new Error(`Failed to delete session: ${formatError(error)}`);
    }
  }

  async describeServer(): Promise<unknown> {
    try {
      const res = await this.agent.com.atproto.server.describeServer();
      return res.data;
    } catch (error) {
      throw new Error(`Failed to describe server: ${formatError(error)}`);
    }
  }

  async getAccountInviteCodes(includeUsed?: boolean, createAvailable?: boolean): Promise<unknown> {
    this.requireAuth();
    try {
      const res = await this.agent.com.atproto.server.getAccountInviteCodes({
        ...(includeUsed !== undefined ? { includeUsed } : {}),
        ...(createAvailable !== undefined ? { createAvailable } : {})
      });
      return res.data;
    } catch (error) {
      throw new Error(`Failed to get account invite codes: ${formatError(error)}`);
    }
  }

  async getServiceAuth(aud: string, lxm?: string, exp?: number): Promise<{ token: string }> {
    this.requireAuth();
    try {
      const res = await this.agent.com.atproto.server.getServiceAuth({
        aud,
        ...(lxm ? { lxm } : {}),
        ...(exp !== undefined ? { exp } : {})
      });
      return res.data;
    } catch (error) {
      throw new Error(`Failed to get service auth: ${formatError(error)}`);
    }
  }

  async getSession(): Promise<{ did: string; handle: string; email?: string }> {
    this.requireAuth();
    try {
      const res = await this.agent.com.atproto.server.getSession();
      return res.data;
    } catch (error) {
      throw new Error(`Failed to get session: ${formatError(error)}`);
    }
  }

  async listAppPasswords(): Promise<unknown> {
    this.requireAuth();
    try {
      const res = await this.agent.com.atproto.server.listAppPasswords();
      return res.data;
    } catch (error) {
      throw new Error(`Failed to list app passwords: ${formatError(error)}`);
    }
  }

  /** Admin only: com.atproto.admin.searchAccounts. */
  async searchAccounts(options: SearchAccountsInput): Promise<{ accounts: unknown[]; cursor?: string }> {
    this.requireAuth();
    try {
      const res = await this.agent.com.atproto.admin.searchAccounts({
        email: options.email,
        cursor: options.cursor,
        limit: options.limit
      });
      return { accounts: res.data.accounts ?? [], cursor: res.data.cursor };
    } catch (error) {
      throw this.adminError('Failed to search accounts', error);
    }
  }

  async refreshSession(): Promise<{ accessJwt: string; refreshJwt: string; handle: string; did: string }> {
    const session = this.requireAuth();

    try {
      const response = await fetch(`${this.serviceUrl}/xrpc/com.atproto.server.refreshSession`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.refreshJwt}` }
      });

      if (!response.ok) {
        let message = `Refresh session failed: ${response.status} ${response.statusText}`;
        try {
          const errorData = (await response.json()) as { message?: string; error?: string };
          if (errorData?.message) message = errorData.message;
          else if (errorData?.error) message = errorData.error;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(message);
      }

      const data = (await response.json()) as { accessJwt: string; refreshJwt: string; handle: string; did: string };
      this.session = {
        accessJwt: data.accessJwt,
        refreshJwt: data.refreshJwt,
        did: data.did,
        handle: data.handle
      };
      return data;
    } catch (error) {
      throw new Error(`Failed to refresh session: ${formatError(error)}`);
    }
  }

  logout(): void {
    this.agent = new BskyAgent({ service: this.serviceUrl });
    this.session = null;
    this.isAuthenticated = false;
  }
}

export function createBlueskyClient(serviceUrl?: string): BlueskyClient {
  return new BlueskyClient(serviceUrl);
}
