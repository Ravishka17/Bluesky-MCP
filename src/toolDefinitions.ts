/**
 * MCP Tool Definitions - JSON Schema definitions for AI agent consumption
 * These define the interface for all Bluesky operations
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

/**
 * All MCP tools available for Bluesky operations
 */
export const toolDefinitions: ToolDefinition[] = [
  // --- Post Operations ---
  {
    name: 'create_post',
    description: 'Create a new post on Bluesky. Returns the URI and CID of the created post. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text content of the post (max 300 characters)',
          maxLength: 300
        },
        langs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Language codes for the post (e.g., ["en", "es"])',
          maxItems: 5
        },
        reply: {
          type: 'object',
          description: 'Reply configuration (root and parent post URIs/CIDs)',
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

  // --- Feed Operations ---
  {
    name: 'get_timeline',
    description: "Get the authenticated user's home timeline (chronological feed from followed users). Requires authentication.",
    inputSchema: {
      type: 'object',
      properties: {
        cursor: {
          type: 'string',
          description: 'Pagination cursor from previous response'
        },
        limit: {
          type: 'number',
          description: 'Number of posts to return (1-100, default 20)',
          minimum: 1,
          maximum: 100,
          default: 20
        }
      }
    }
  },
  {
    name: 'get_feed',
    description: 'Get posts from a custom feed generator (e.g., trending, lists). Use at:// URI format for the feed.',
    inputSchema: {
      type: 'object',
      properties: {
        feed: {
          type: 'string',
          description: 'Feed generator URI (at://did/...)',
          pattern: '^at://'
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor'
        },
        limit: {
          type: 'number',
          description: 'Number of posts to return (1-100)',
          minimum: 1,
          maximum: 100,
          default: 20
        }
      },
      required: ['feed']
    }
  },
  {
    name: 'get_author_feed',
    description: 'Get posts from a specific user/actor. Can filter by post type (with replies, media only, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        actor: {
          type: 'string',
          description: "The actor's DID or handle (e.g., did:plc:xxx or handle.bsky.social)"
        },
        filter: {
          type: 'string',
          enum: ['posts_with_replies', 'posts_no_replies', 'posts_with_media', 'posts_and_author_threads'],
          description: 'Filter type for posts',
          default: 'posts_with_replies'
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor'
        },
        limit: {
          type: 'number',
          description: 'Number of posts to return (1-100)',
          minimum: 1,
          maximum: 100,
          default: 20
        }
      },
      required: ['actor']
    }
  },

  // --- Thread Operations ---
  {
    name: 'get_thread',
    description: 'Get a post thread (post with replies, parents, and descendants). Essential for understanding conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        uri: {
          type: 'string',
          description: 'The post URI (at://did/app.bsky.feed.post/...)',
          pattern: '^at://'
        },
        depth: {
          type: 'number',
          description: 'How deep into replies to fetch (0-1000, default 6)',
          minimum: 0,
          maximum: 1000,
          default: 6
        },
        parentHeight: {
          type: 'number',
          description: 'How many parent posts to fetch (0-1000, default 80)',
          minimum: 0,
          maximum: 1000,
          default: 80
        }
      },
      required: ['uri']
    }
  },

  // --- Profile Operations ---
  {
    name: 'get_profile',
    description: 'Get detailed profile information for a single user (bio, follower/following counts, avatar, etc.). Public endpoint — works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        actor: {
          type: 'string',
          description: "The actor's DID or handle (e.g., handle.bsky.social or did:plc:xxx)"
        }
      },
      required: ['actor']
    }
  },
  {
    name: 'get_profiles',
    description: 'Get detailed profile views for multiple users at once (batch operation, up to 25 actors). Public endpoint — works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        actors: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of actor DIDs or handles (e.g., ["handle.bsky.social", "did:plc:xxx"])',
          maxItems: 25
        }
      },
      required: ['actors']
    }
  },

  // --- Search Operations ---
  {
    name: 'search_actors',
    description: 'Search for Bluesky users/actors by name or handle. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        term: {
          type: 'string',
          description: 'Search query (name, handle, or keyword)',
          maxLength: 100
        },
        limit: {
          type: 'number',
          description: 'Number of results to return (1-100)',
          minimum: 1,
          maximum: 100,
          default: 10
        }
      },
      required: ['term']
    }
  },
  {
    name: 'search_actors_typeahead',
    description: 'Quick actor search for autocomplete (typeahead). Returns suggestions as you type. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        term: {
          type: 'string',
          description: 'Search prefix (minimum 1 character)',
          maxLength: 100
        },
        limit: {
          type: 'number',
          description: 'Number of suggestions (1-100)',
          minimum: 1,
          maximum: 100,
          default: 10
        }
      },
      required: ['term']
    }
  },
  {
    name: 'search_posts',
    description: 'Search for posts by keyword, hashtag, author, language, or mentions. Works with or without authentication. Returns posts with engagement stats.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (keywords, hashtags, etc.)',
          maxLength: 500
        },
        limit: {
          type: 'number',
          description: 'Number of results (1-100)',
          minimum: 1,
          maximum: 100,
          default: 20
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor'
        },
        sort: {
          type: 'string',
          enum: ['latest', 'top'],
          description: 'Sort by latest or top (most engagement)',
          default: 'latest'
        },
        mentions: {
          type: 'string',
          description: 'Filter posts that mention this actor (handle or DID)'
        },
        author: {
          type: 'string',
          description: 'Filter posts by this author (handle or DID)'
        },
        lang: {
          type: 'string',
          description: 'Filter by language code (e.g., "en", "ja", "es")'
        }
      },
      required: ['query']
    }
  },

  // --- Post Interactions ---
  {
    name: 'get_posts',
    description: 'Get specific posts by their AT Protocol URIs. Use to fetch posts you have references to. Works with or without authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        uris: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of post URIs (at://...)',
          maxItems: 25
        }
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
        uri: {
          type: 'string',
          description: 'Post URI (at://...)',
          pattern: '^at://'
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor'
        },
        limit: {
          type: 'number',
          description: 'Number of results (1-100)',
          minimum: 1,
          maximum: 100,
          default: 50
        }
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
        uri: {
          type: 'string',
          description: 'Post URI (at://...)',
          pattern: '^at://'
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor'
        },
        limit: {
          type: 'number',
          description: 'Number of results (1-100)',
          minimum: 1,
          maximum: 100,
          default: 50
        }
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

  // --- Account Operations ---
  {
    name: 'get_preferences',
    description: 'Get private preferences for the authenticated account. Includes content filters, feed settings, saved feeds, and moderation preferences. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_suggestions',
    description: 'Get suggested users to follow based on your activity. Requires authentication.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of suggestions (1-100)',
          minimum: 1,
          maximum: 100,
          default: 10
        }
      }
    }
  },

  // --- Utility ---
  {
    name: 'test_connectivity',
    description: 'Test the connection to Bluesky and check authentication status. Use to verify credentials are working.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

/**
 * Get tool definition by name
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find(t => t.name === name);
}

/**
 * Get all tool names
 */
export function getAllToolNames(): string[] {
  return toolDefinitions.map(t => t.name);
}
