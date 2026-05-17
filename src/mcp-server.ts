/**
 * MCP Server - Main MCP server implementation with Streamable HTTP transport
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { BlueskyClient } from './bluesky-client.js';
import { toolHandlers, isValidTool } from './handlers.js';
import { toolDefinitions } from './toolDefinitions.js';
import { sanitizeString, sanitizeCursor, sanitizeLimit, DEFAULT_LIMIT } from './sanitize.js';
import { formatError, createSuccessResponse, createErrorResponse } from './utils.js';
import type { BlueskyCredentials } from './types.js';

// Server version
const SERVER_VERSION = '1.0.0';

/**
 * Create MCP server with Bluesky integration
 */
export function createMCPServer(): Server {
  const server = new Server(
    {
      name: 'bluesky-mcp',
      version: SERVER_VERSION
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      }
    }
  );

  // Store for per-request authentication state
  // In serverless, each request may have different credentials

  /**
   * List all available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolDefinitions.map(def => ({
        name: def.name,
        description: def.description,
        inputSchema: def.inputSchema
      }))
    };
  });

  /**
   * List available resources (profiles, posts, etc.)
   */
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'bluesky://authenticated-user/profile',
          name: 'Current User Profile',
          description: 'The profile of the currently authenticated Bluesky user',
          mimeType: 'application/json'
        },
        {
          uri: 'bluesky://timeline',
          name: 'User Timeline',
          description: 'The authenticated user\'s home timeline',
          mimeType: 'application/json'
        }
      ]
    };
  });

  /**
   * List available prompts
   */
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: 'bluesky_usage_guide',
          description: 'Comprehensive guide to using Bluesky MCP tools for various tasks',
          arguments: [
            {
              name: 'task',
              description: 'Task type: search, post, profile, feed, thread',
              required: true
            }
          ]
        },
        {
          name: 'search_posts_template',
          description: 'Template for searching posts with various filters',
          arguments: [
            {
              name: 'topic',
              description: 'Topic or keyword to search for',
              required: true
            }
          ]
        },
        {
          name: 'compose_post',
          description: 'Template for composing a well-formatted Bluesky post',
          arguments: [
            {
              name: 'content',
              description: 'The main content of the post',
              required: true
            }
          ]
        }
      ]
    };
  });

  /**
   * Handle tool calls
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!isValidTool(name)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(createErrorResponse(`Unknown tool: ${name}`, 'UNKNOWN_TOOL'))
          }
        ],
        isError: true
      };
    }

    try {
      // Extract credentials from environment or headers
      // In production, these would come from secure headers
      const credentials: BlueskyCredentials | undefined = getCredentialsFromRequest(request as { headers?: Record<string, string | string[] | undefined> });

      // Create a client instance
      const client = new BlueskyClient();

      // Authenticate if credentials provided
      if (credentials) {
        await client.authenticate(credentials);
      }

      // Get the handler and execute
      const handler = toolHandlers[name];
      const result = await handler(client, args || {});

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(createErrorResponse(result.error || 'Unknown error', 'TOOL_ERROR'))
            }
          ],
          isError: true
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(createSuccessResponse(result.data))
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(createErrorResponse(formatError(error), 'EXECUTION_ERROR'))
          }
        ],
        isError: true
      };
    }
  });

  /**
   * Handle prompt requests
   */
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'bluesky_usage_guide':
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: getUsageGuidePrompt(args?.task as string)
              }
            }
          ]
        };

      case 'search_posts_template':
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: getSearchPostsPrompt(args?.topic as string)
              }
            }
          ]
        };

      case 'compose_post':
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: getComposePostPrompt(args?.content as string)
              }
            }
          ]
        };

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  return server;
}

/**
 * Extract credentials from request headers or environment
 * In production, credentials should come from secure external sources
 */
function getCredentialsFromRequest(request: { headers?: Record<string, string | string[] | undefined> }): BlueskyCredentials | undefined {
  // Check request headers first (for HTTP transport)
  if (request.headers) {
    const identifier = request.headers['x-bluesky-identifier'];
    const password = request.headers['x-bluesky-password'];

    if (identifier && password &&
        typeof identifier === 'string' &&
        typeof password === 'string') {
      return {
        identifier: sanitizeString(identifier),
        password: password // Don't sanitize password
      };
    }
  }

  // Fallback to environment variables (for local development only)
  const envIdentifier = process.env.BLUESKY_IDENTIFIER;
  const envPassword = process.env.BLUESKY_APP_PASSWORD;

  if (envIdentifier && envPassword) {
    return {
      identifier: envIdentifier,
      password: envPassword
    };
  }

  return undefined;
}

/**
 * Get usage guide prompt content
 */
function getUsageGuidePrompt(task?: string): string {
  const taskLower = (task || '').toLowerCase();

  if (taskLower.includes('search')) {
    return `Bluesky Search Guide for AI Agents:
Use search_posts to find posts by keyword. You can filter by:
- Language (lang parameter)
- Author (author parameter)
- Sort order (latest or top)
- Mentions (mentions parameter)

Example: Search for posts about "artificial intelligence":
1. Call search_posts with query="artificial intelligence"
2. Review results for relevant posts
3. Use get_thread to explore discussions
4. Use get_profile to learn about authors

Available search tools:
- search_posts: Full-text post search
- search_actors: Find users by name/handle
- search_actors_typeahead: Quick autocomplete`;
  }

  if (taskLower.includes('post')) {
    return `Bluesky Posting Guide for AI Agents:
Use create_post to publish content. Remember:
- Maximum 300 characters per post
- Use langs parameter to specify languages
- Use reply parameter to reply to existing posts

Example: Create a post about AI news:
1. Prepare your text (under 300 chars)
2. Call create_post with text parameter
3. Receive URI and CID confirming publication

For longer content, consider:
- Threading multiple posts together
- Using links to external content`;
  }

  if (taskLower.includes('profile')) {
    return `Bluesky Profile Guide for AI Agents:
Use get_profile to fetch user information:
- Display name and bio
- Follower/following counts
- Avatar and banner images
- Account creation date

For batch operations:
- get_profiles: Fetch multiple profiles at once
- get_author_feed: See a user's posts

Example: Get profile for user.bsky.social:
1. Call get_profile with actor="user.bsky.social"
2. Review profile data for relevant information`;
  }

  if (taskLower.includes('feed')) {
    return `Bluesky Feed Guide for AI Agents:
Access different types of feeds:
- get_timeline: Authenticated user's home feed
- get_feed: Custom feed generators (at:// URIs)
- get_author_feed: Posts by a specific user

Filter options for author feeds:
- posts_with_replies (default)
- posts_no_replies
- posts_with_media
- posts_and_author_threads`;
  }

  if (taskLower.includes('thread')) {
    return `Bluesky Thread Guide for AI Agents:
Use get_thread to explore conversations:
- Shows post with replies and ancestors
- Control depth with depth parameter
- Control parent height with parentHeight

Thread structure:
- root: Original post
- parent: Parent posts (above)
- replies: Child posts (below)

Handle blocked/not-found posts gracefully:
- ThreadViewPost: Valid post
- NotFoundPost: Deleted or unavailable
- BlockedPost: Blocked by user`;
  }

  return `Bluesky MCP Usage Guide:
This server provides tools for interacting with Bluesky.

Available Tool Categories:
1. Post Operations: create_post, get_posts, get_likes, get_reposted_by
2. Feed Operations: get_timeline, get_feed, get_author_feed
3. Search Operations: search_posts, search_actors, search_actors_typeahead
4. Profile Operations: get_profile, get_profiles, get_suggestions
5. Thread Operations: get_thread

Authentication:
- For write operations, provide Bluesky credentials
- Read operations work without authentication
- Credentials are never stored permanently`;
}

/**
 * Get search posts prompt template
 */
function getSearchPostsPrompt(topic?: string): string {
  return `Search Posts on Bluesky

Topic to search: ${topic || '[Enter topic]'}

Steps:
1. Use search_posts tool with the topic
2. Analyze results for relevance
3. For important posts, use get_thread to see full context
4. Use get_profile to learn about post authors

Search Tips:
- Use specific keywords for better results
- Filter by language with lang parameter
- Sort by "top" for most liked posts
- Sort by "latest" for newest posts

Example tool call:
{
  "name": "search_posts",
  "arguments": {
    "query": "${topic || 'your search query'}",
    "limit": 20,
    "sort": "latest"
  }
}`;
}

/**
 * Get compose post prompt template
 */
function getComposePostPrompt(content?: string): string {
  return `Compose a Bluesky Post

Content: ${content || '[Enter your post content]'}

Guidelines:
- Maximum 300 characters
- Be clear and concise
- Consider adding relevant hashtags
- Tag users with @handle (they'll be auto-detected)

Example tool call:
{
  "name": "create_post",
  "arguments": {
    "text": "${content || 'Your post text here'}",
    "langs": ["en"]
  }
}

Remember: Bluesky is a public platform. Post responsibly.`;
}

/**
 * Get server instance for use in Express routes
 */
// Helper re-export removed - not needed for current implementation