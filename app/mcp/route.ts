import { NextRequest, NextResponse } from 'next/server';
import { createMCPServer } from '@/mcp-server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

export async function POST(req: NextRequest) {
  try {
    const identifier = req.headers.get('x-bluesky-identifier') ?? undefined;
    const password = req.headers.get('x-bluesky-password') ?? undefined;

    const server = createMCPServer({ identifier, password });
    const transport = new WebStandardStreamableHTTPServerTransport();

    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (error) {
    console.error('MCP POST error:', error);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : String(error)
        },
        id: null
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'MCP endpoint active',
    version: '1.0.0',
    transport: 'WebStandardStreamableHTTPServerTransport (POST only)'
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-bluesky-identifier, x-bluesky-password, mcp-session-id',
      'Access-Control-Max-Age': '86400',
    },
  });
}
