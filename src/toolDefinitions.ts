/**
 * MCP Tool Definitions - JSON Schema definitions for AI agent consumption
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const toolDefinitions: ToolDefinition[] = [

  // ── Posts ──────────────────────────────────────────────────────────────────

  {
    name: 'create_post',
    description: 'Create a new post on Bluesky (max 300 chars). Optionally set language codes or reply to an existing post. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Post text content (max 300 characters)', maxLength: 300 },
        langs: { type: 'array', items: { type: 'string' }, description: 'Language codes, e.g. ["en"]', maxItems: 5 },
        reply: {
          type: 'object',
          description: 'Reply configuration',
          properties: {
            rootUri: { type: 'string', description: 'Root post URI (at://...)' },
            rootCid: { type: 'string', description: 'Root post CID' },
            parentUri: { type: 'string', description: 'Parent post URI (at://...)' },
            parentCid: { type: 'string', description: 'Parent post CID' }
          },
          required: ['rootUri', 'rootCid', 'parentUri', 'parentCid']
        }
      },
      required: ['text']
    }
  },
  {
    name: 'get_posts',
    description: 'Fetch specific posts by their AT Protocol URIs (up to 25 at once). Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uris: { type: 'array', items: { type: 'string' }, description: 'Array of post URIs (at://...)', maxItems: 25 }
      },
      required: ['uris']
    }
  },
  {
    name: 'get_likes',
    description: 'Get the list of users who liked a specific post. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI (at://...)', pattern: '^at://' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of results (1-100, default 50)', minimum: 1, maximum: 100, default: 50 }
      },
      required: ['uri']
    }
  },
  {
    name: 'get_reposted_by',
    description: 'Get the list of users who reposted a specific post. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI (at://...)', pattern: '^at://' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of results (1-100, default 50)', minimum: 1, maximum: 100, default: 50 }
      },
      required: ['uri']
    }
  },
  {
    name: 'like_post',
    description: 'Like a post on Bluesky. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI (at://...)' },
        cid: { type: 'string', description: 'Post CID (content identifier)' }
      },
      required: ['uri', 'cid']
    }
  },
  {
    name: 'repost_post',
    description: 'Repost a post on Bluesky. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI (at://...)' },
        cid: { type: 'string', description: 'Post CID (content identifier)' }
      },
      required: ['uri', 'cid']
    }
  },
  {
    name: 'delete_post',
    description: 'Delete a post on Bluesky by its AT Protocol URI or record key (rkey). Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI (at://did/app.bsky.feed.post/rkey)', pattern: '^at://' },
        rkey: { type: 'string', description: 'Record key of the post (alternative to uri)' }
      }
    }
  },

  // ── Feeds ──────────────────────────────────────────────────────────────────

  {
    name: 'get_timeline',
    description: "Get the authenticated user's home timeline (posts from followed accounts). Requires authentication.",
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Pagination cursor from previous response' },
        limit: { type: 'number', description: 'Number of posts to return (1-100, default 20)', minimum: 1, maximum: 100, default: 20 }
      }
    }
  },
  {
    name: 'get_feed',
    description: 'Get posts from a custom feed generator using its at:// URI. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        feed: { type: 'string', description: 'Feed generator URI (at://did/...)', pattern: '^at://' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of posts (1-100, default 20)', minimum: 1, maximum: 100, default: 20 }
      },
      required: ['feed']
    }
  },
  {
    name: 'get_author_feed',
    description: "Get posts from a specific user's profile feed. Can filter by type. Works with or without authentication.",
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'string', description: "Actor's DID or handle (e.g. handle.bsky.social)" },
        filter: {
          type: 'string',
          enum: ['posts_with_replies', 'posts_no_replies', 'posts_with_media', 'posts_and_author_threads'],
          description: 'Filter type for posts',
          default: 'posts_with_replies'
        },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of posts (1-100, default 20)', minimum: 1, maximum: 100, default: 20 }
      },
      required: ['actor']
    }
  },
  {
    name: 'get_thread',
    description: 'Get a full post thread including replies and parent posts. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI (at://did/app.bsky.feed.post/...)', pattern: '^at://' },
        depth: { type: 'number', description: 'Reply depth to fetch (0-1000, default 6)', minimum: 0, maximum: 1000, default: 6 },
        parentHeight: { type: 'number', description: 'Parent posts to include (0-1000, default 80)', minimum: 0, maximum: 1000, default: 80 }
      },
      required: ['uri']
    }
  },

  // ── Profiles ───────────────────────────────────────────────────────────────

  {
    name: 'get_profile',
    description: 'Get detailed profile for a single user (bio, follower counts, avatar, etc.). Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: { type: 'string', description: "Actor's DID or handle" }
      },
      required: ['actor']
    }
  },
  {
    name: 'get_profiles',
    description: 'Get detailed profiles for multiple users at once (batch, up to 25). Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        actors: { type: 'array', items: { type: 'string' }, description: 'Array of DIDs or handles', maxItems: 25 }
      },
      required: ['actors']
    }
  },
  {
    name: 'get_suggestions',
    description: 'Get suggested users to follow based on your activity. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of suggestions (1-100, default 10)', minimum: 1, maximum: 100, default: 10 }
      }
    }
  },

  // ── Search ─────────────────────────────────────────────────────────────────

  {
    name: 'search_actors',
    description: 'Search for Bluesky users by name or handle. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'Search query (name, handle, or keyword)', maxLength: 100 },
        limit: { type: 'number', description: 'Number of results (1-100, default 10)', minimum: 1, maximum: 100, default: 10 }
      },
      required: ['term']
    }
  },
  {
    name: 'search_actors_typeahead',
    description: 'Quick autocomplete search for Bluesky users as you type. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'Search prefix (min 1 character)', maxLength: 100 },
        limit: { type: 'number', description: 'Number of suggestions (1-100, default 10)', minimum: 1, maximum: 100, default: 10 }
      },
      required: ['term']
    }
  },
  {
    name: 'search_posts',
    description: 'Search posts by keyword, hashtag, author, language, or mention. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (keywords, hashtags, etc.)', maxLength: 500 },
        limit: { type: 'number', description: 'Number of results (1-100, default 20)', minimum: 1, maximum: 100, default: 20 },
        cursor: { type: 'string', description: 'Pagination cursor' },
        sort: { type: 'string', enum: ['latest', 'top'], description: 'Sort by latest or top engagement', default: 'latest' },
        mentions: { type: 'string', description: 'Filter posts mentioning this actor (handle or DID)' },
        author: { type: 'string', description: 'Filter posts by this author (handle or DID)' },
        lang: { type: 'string', description: 'Filter by language code (e.g. "en", "ja", "es")' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_accounts',
    description: 'Search accounts via the admin endpoint (requires admin privileges on the PDS). Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Filter by email address', format: 'email' },
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of results (1-100, default 20)', minimum: 1, maximum: 100, default: 20 }
      }
    }
  },

  // ── Account / Preferences ──────────────────────────────────────────────────

  {
    name: 'get_preferences',
    description: 'Get private account preferences (content filters, feed settings, saved feeds, moderation). Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // ── Bookmarks ──────────────────────────────────────────────────────────────

  {
    name: 'create_bookmark',
    description: 'Save a post as a private bookmark on your account. Only app.bsky.feed.post records are supported. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI to bookmark (at://...)', pattern: '^at://' }
      },
      required: ['uri']
    }
  },
  {
    name: 'delete_bookmark',
    description: 'Remove a saved bookmark by its ID. Get bookmark IDs from get_bookmarks. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Bookmark ID to delete (returned by create_bookmark or get_bookmarks)' }
      },
      required: ['id']
    }
  },
  {
    name: 'get_bookmarks',
    description: 'List all private bookmarks on your account with pagination. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of bookmarks to return (1-100, default 50)', minimum: 1, maximum: 100, default: 50 }
      }
    }
  },

  // ── Drafts ─────────────────────────────────────────────────────────────────

  {
    name: 'create_draft',
    description: 'Create a draft post. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Draft text content (max 300 characters)', maxLength: 300 },
        langs: { type: 'array', items: { type: 'string' }, description: 'Language codes, e.g. ["en"]', maxItems: 5 }
      },
      required: ['text']
    }
  },
  {
    name: 'delete_draft',
    description: 'Delete a draft by its ID. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Draft ID to delete' }
      },
      required: ['id']
    }
  },
  {
    name: 'get_drafts',
    description: 'List all drafts with pagination. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        cursor: { type: 'string', description: 'Pagination cursor' },
        limit: { type: 'number', description: 'Number of drafts to return (1-100, default 50)', minimum: 1, maximum: 100, default: 50 }
      }
    }
  },

  // ── Age Assurance ──────────────────────────────────────────────────────────

  {
    name: 'begin_age_assurance',
    description: 'Initiate the Age Assurance flow for the authenticated account. Used for age verification on Bluesky. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_age_assurance_config',
    description: 'Get the Age Assurance configuration for the current account (provider info, requirements, etc.). Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_age_assurance_state',
    description: 'Get the current Age Assurance state/status for the authenticated account (verified, pending, etc.). Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // ── Utility ────────────────────────────────────────────────────────────────

  {
    name: 'test_connectivity',
    description: 'Test the connection to Bluesky and check if authentication is working correctly.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }

];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find(t => t.name === name);
}

export function getAllToolNames(): string[] {
  return toolDefinitions.map(t => t.name);
}
