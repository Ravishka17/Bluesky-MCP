import { NextRequest, NextResponse } from 'next/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod/v4';

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

const mcpServer = new McpServer({
  name: 'bluesky-mcp',
  version: '1.0.0',
});

mcpServer.registerTool('search_posts', {
  title: 'Search Posts',
  description: 'Search for Bluesky posts by keyword',
  inputSchema: z.object({ query: z.string(), limit: z.number().default(10) }),
}, async ({ query, limit = 10 }: { query: string; limit?: number }) => {
  const client = await getBlueskyClient();
  const resp = await client.searchPosts({ q: query, limit });
  return { content: [{ type: 'text', text: JSON.stringify(resp.data.posts.map((p: any) => ({ uri: p.uri, cid: p.cid, author: p.author.handle, text: p.record.text, timestamp: p.indexedAt, likes: p.likeCount ?? 0, reposts: p.repostCount ?? 0, replies: p.replyCount ?? 0 }))) }] };
});

mcpServer.registerTool('get_timeline', {
  title: 'Get Timeline',
  description: 'Get your Bluesky timeline',
  inputSchema: z.object({ limit: z.number().default(20) }),
}, async ({ limit = 20 }: { limit?: number }) => {
  const client = await getBlueskyClient();
  const resp = await client.getTimeline({ limit });
  return { content: [{ type: 'text', text: JSON.stringify(resp.data.feed.map((item: any) => { const p = item.post; return { uri: p.uri, cid: p.cid, author: p.author.handle, text: p.record.text, timestamp: p.indexedAt, likes: p.likeCount ?? 0, reposts: p.repostCount ?? 0 }; })) }] };
});

mcpServer.registerTool('create_post', {
  title: 'Create Post',
  description: 'Create a new Bluesky post',
  inputSchema: z.object({ text: z.string() }),
}, async ({ text }: { text: string }) => {
  const client = await getBlueskyClient();
  const resp = await client.createPost({ text });
  return { content: [{ type: 'text', text: JSON.stringify({ uri: resp.uri, cid: resp.cid }) }] };
});

mcpServer.registerTool('like_post', {
  title: 'Like Post',
  description: 'Like a Bluesky post',
  inputSchema: z.object({ uri: z.string(), cid: z.string() }),
}, async ({ uri, cid }: { uri: string; cid: string }) => {
  const client = await getBlueskyClient();
  await client.like(uri, cid);
  return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
});

mcpServer.registerTool('repost_post', {
  title: 'Repost',
  description: 'Repost a Bluesky post',
  inputSchema: z.object({ uri: z.string(), cid: z.string() }),
}, async ({ uri, cid }: { uri: string; cid: string }) => {
  const client = await getBlueskyClient();
  await client.repost(uri, cid);
  return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }] };
});

export async function POST(req: NextRequest) {
  try {
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    return await transport.handleRequest(req as Request);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'MCP endpoint active', version: '1.0.0' });
}