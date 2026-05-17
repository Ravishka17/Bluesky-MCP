import { NextRequest, NextResponse } from 'next/server';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const BLUESKY_IDENTIFIER = process.env.BLUESKY_IDENTIFIER || '';
const BLUESKY_APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD || '';

let blueskyClient: any = null;
async function getBlueskyClient() {
  if (!blueskyClient) {
    const { BskyAgent } = await import('@atproto/api');
    blueskyClient = new BskyAgent({ service: 'https://bsky.social' });
    await blueskyClient.login({ identifier: BLUESKY_IDENTIFIER, password: BLUESKY_APP_PASSWORD });
  }
  return blueskyClient;
}

const tools = {
  search_posts: {
    description: 'Search for Bluesky posts by keyword',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number', default: 10 } },
      required: ['query'],
    },
  },
  get_timeline: {
    description: 'Get your Bluesky timeline',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', default: 20 } },
    },
  },
  create_post: {
    description: 'Create a new Bluesky post',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  like_post: {
    description: 'Like a Bluesky post',
    inputSchema: {
      type: 'object',
      properties: { uri: { type: 'string' }, cid: { type: 'string' } },
      required: ['uri', 'cid'],
    },
  },
  repost_post: {
    description: 'Repost a Bluesky post',
    inputSchema: {
      type: 'object',
      properties: { uri: { type: 'string' }, cid: { type: 'string' } },
      required: ['uri', 'cid'],
    },
  },
};

const mcpServer = new Server({ name: 'bluesky-mcp', version: '1.0.0' }, { capabilities: { tools } });

const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  async search_posts({ query, limit = 10 }: any) {
    const client = await getBlueskyClient();
    const resp = await client.searchPosts({ q: query, limit });
    return resp.data.posts.map((p: any) => ({ uri: p.uri, cid: p.cid, author: p.author.handle, text: p.record.text, timestamp: p.indexedAt, likes: p.likeCount ?? 0, reposts: p.repostCount ?? 0, replies: p.replyCount ?? 0 }));
  },
  async get_timeline({ limit = 20 }: any) {
    const client = await getBlueskyClient();
    const resp = await client.getTimeline({ limit });
    return resp.data.feed.map((item: any) => {
      const p = item.post;
      return { uri: p.uri, cid: p.cid, author: p.author.handle, text: p.record.text, timestamp: p.indexedAt, likes: p.likeCount ?? 0, reposts: p.repostCount ?? 0 };
    });
  },
  async create_post({ text }: any) {
    const client = await getBlueskyClient();
    const resp = await client.createPost({ text });
    return { uri: resp.uri, cid: resp.cid };
  },
  async like_post({ uri, cid }: any) {
    const client = await getBlueskyClient();
    await client.like(uri, cid);
    return { success: true };
  },
  async repost_post({ uri, cid }: any) {
    const client = await getBlueskyClient();
    await client.repost(uri, cid);
    return { success: true };
  },
};

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

export async function POST(req: NextRequest) {
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    await transport.handleRequest(req as any, new NextResponse(), null as any);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'MCP endpoint active', version: '1.0.0' });
}