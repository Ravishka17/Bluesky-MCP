import { NextRequest, NextResponse } from 'next/server';
import { Server } from '@modelcontextprotocol/sdk/sdk.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamable-http.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types/js/types.js';

// Bluesky credentials from environment
const BLUESKY_IDENTIFIER = process.env.BLUESKY_IDENTIFIER || '';
const BLUESKY_APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD || '';

// Lazy-load Bluesky client
let blueskyClient: any = null;
async function getBlueskyClient() {
  if (!blueskyClient) {
    const { BskyAgent } = await import('@atproto/api');
    blueskyClient = new BskyAgent({ service: 'https://bsky.social' });
    await blueskyClient.login({
      identifier: BLUESKY_IDENTIFIER,
      password: BLUESKY_APP_PASSWORD,
    });
  }
  return blueskyClient;
}

// MCP tool definitions
const tools = {
  search_posts: {
    description: 'Search for Bluesky posts by keyword',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results', default: 10 },
      },
      required: ['query'],
    },
  },
  get_timeline: {
    description: 'Get your Bluesky timeline',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results', default: 20 },
      },
    },
  },
  create_post: {
    description: 'Create a new Bluesky post',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Post text' },
      },
      required: ['text'],
    },
  },
  like_post: {
    description: 'Like a Bluesky post',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI' },
        cid: { type: 'string', description: 'Post CID' },
      },
      required: ['uri', 'cid'],
    },
  },
  repost_post: {
    description: 'Repost a Bluesky post',
    inputSchema: {
      type: 'object',
      properties: {
        uri: { type: 'string', description: 'Post URI' },
        cid: { type: 'string', description: 'Post CID' },
      },
      required: ['uri', 'cid'],
    },
  },
};

// MCP server instance
const mcpServer = new Server(
  { name: 'bluesky-mcp', version: '1.0.0' },
  { capabilities: { tools } }
);

// Tool handlers
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  async search_posts({ query, limit = 10 }: { query: string; limit?: number }) {
    const client = await getBlueskyClient();
    const response = await client.searchPosts({ q: query, limit });
    return response.data.posts.map((post: any) => ({
      uri: post.uri, cid: post.cid, author: post.author.handle,
      text: post.record.text, timestamp: post.indexedAt,
      likes: post.likeCount ?? 0, reposts: post.repostCount ?? 0, replies: post.replyCount ?? 0,
    }));
  },
  async get_timeline({ limit = 20 }: { limit?: number }) {
    const client = await getBlueskyClient();
    const response = await client.getTimeline({ limit });
    return response.data.feed.map((item: any) => {
      const post = item.post;
      return {
        uri: post.uri, cid: post.cid, author: post.author.handle,
        text: post.record.text, timestamp: post.indexedAt,
        likes: post.likeCount ?? 0, reposts: post.repostCount ?? 0,
      };
    });
  },
  async create_post({ text }: { text: string }) {
    const client = await getBlueskyClient();
    const response = await client.createPost({ text });
    return { uri: response.uri, cid: response.cid };
  },
  async like_post({ uri, cid }: { uri: string; cid: string }) {
    const client = await getBlueskyClient();
    await client.like(uri, cid);
    return { success: true };
  },
  async repost_post({ uri, cid }: { uri: string; cid: string }) {
    const client = await getBlueskyClient();
    await client.repost(uri, cid);
    return { success: true };
  },
};

// Register tool handler
mcpServer.setRequestHandler({ method: 'tools/list' }, async () => ({
  tools: Object.entries(tools).map(([name, def]) => ({ name, ...def }))
}));

mcpServer.setRequestHandler({ method: 'tools/call' }, async (request: any) => {
  const handler = toolHandlers[request.params.name];
  if (!handler) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Unknown tool' }) }] };
  try {
    const result = await handler(request.params.arguments ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err: any) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] };
  }
});

export async function POST(request: NextRequest) {
  try {
    const transport = new StreamableHTTPClientTransport('http://localhost/api/mcp');
    await transport.start();
    const response = await transport.handleRequest(request as any, null as any);
    return response;
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'MCP endpoint active', version: '1.0.0' });
}