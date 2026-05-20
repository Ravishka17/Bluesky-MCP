import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { BlueskyClient } from './bluesky-client';
import { toolHandlers, isValidTool } from './handlers';
import { toolDefinitions } from './toolDefinitions';
import { formatError, createSuccessResponse, createErrorResponse } from './utils';
import type { BlueskyCredentials } from './types';

const SERVER_VERSION = '1.0.0';

export function createMCPServer(credentials?: { identifier?: string; password?: string }): Server {
  const server = new Server(
    { name: 'bluesky-mcp', version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions.map(def => ({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema
    }))
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
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
        description: "The authenticated user's home timeline",
        mimeType: 'application/json'
      }
    ]
  }));

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'bluesky_usage_guide',
        description: 'Comprehensive guide to using Bluesky MCP tools for various tasks',
        arguments: [{ name: 'task', description: 'Task type: search, post, profile, feed, thread', required: true }]
      },
      {
        name: 'search_posts_template',
        description: 'Template for searching posts with various filters',
        arguments: [{ name: 'topic', description: 'Topic or keyword to search for', required: true }]
      },
      {
        name: 'compose_post',
        description: 'Template for composing a well-formatted Bluesky post',
        arguments: [{ name: 'content', description: 'The main content of the post', required: true }]
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!isValidTool(name)) {
      return {
        content: [{ type: 'text', text: JSON.stringify(createErrorResponse(`Unknown tool: ${name}`, 'UNKNOWN_TOOL')) }],
        isError: true
      };
    }

    try {
      // Build credentials: prefer injected HTTP headers, fall back to env vars
      let blueskyCredentials: BlueskyCredentials | undefined;

      if (credentials?.identifier && credentials?.password) {
        blueskyCredentials = {
          identifier: credentials.identifier,
          password: credentials.password
        };
      } else if (process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD) {
        blueskyCredentials = {
          identifier: process.env.BLUESKY_IDENTIFIER,
          password: process.env.BLUESKY_APP_PASSWORD
        };
      }

      const client = new BlueskyClient();

      if (blueskyCredentials) {
        await client.authenticate(blueskyCredentials);
      }

      const handler = toolHandlers[name];
      const result = await handler(client, args || {});

      if (!result.success) {
        return {
          content: [{ type: 'text', text: JSON.stringify(createErrorResponse(result.error || 'Unknown error', 'TOOL_ERROR')) }],
          isError: true
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(createSuccessResponse(result.data)) }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify(createErrorResponse(formatError(error), 'EXECUTION_ERROR')) }],
        isError: true
      };
    }
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'bluesky_usage_guide':
        return { messages: [{ role: 'user', content: { type: 'text', text: getUsageGuidePrompt(args?.task as string) } }] };
      case 'search_posts_template':
        return { messages: [{ role: 'user', content: { type: 'text', text: getSearchPostsPrompt(args?.topic as string) } }] };
      case 'compose_post':
        return { messages: [{ role: 'user', content: { type: 'text', text: getComposePostPrompt(args?.content as string) } }] };
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  return server;
}

function getUsageGuidePrompt(task?: string): string {
  const t = (task || '').toLowerCase();
  if (t.includes('search')) return `Use search_posts for keyword search, search_actors for users, search_actors_typeahead for autocomplete.`;
  if (t.includes('post')) return `Use create_post with text (max 300 chars). Optionally set langs and reply.`;
  if (t.includes('profile')) return `Use get_profile for a single user, get_profiles for batch lookup.`;
  if (t.includes('feed')) return `Use get_timeline (auth), get_feed (at:// URI), or get_author_feed.`;
  if (t.includes('thread')) return `Use get_thread with a post URI. Control depth and parentHeight.`;
  return `Tools: create_post, get_timeline, get_feed, get_author_feed, get_thread, get_profile, get_profiles, search_posts, search_actors, search_actors_typeahead, get_posts, get_likes, get_reposted_by, like_post, repost_post, get_suggestions, test_connectivity.`;
}

function getSearchPostsPrompt(topic?: string): string {
  return `Search Bluesky for: ${topic || '[topic]'}\nUse search_posts with query="${topic || 'your topic'}", sort="latest" or "top".`;
}

function getComposePostPrompt(content?: string): string {
  return `Compose a Bluesky post (max 300 chars):\n${content || '[content]'}\nUse create_post with text and optionally langs: ["en"].`;
}
