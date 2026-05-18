import { NextRequest, NextResponse } from 'next/server';
import { createMCPServer } from '@/mcp-server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

/**
 * MCP endpoint for Next.js App Router.
 * Handles both POST (requests) and GET (SSE).
 */

export async function POST(req: NextRequest) {
  try {
    // Create a fresh server instance per request to avoid "Already connected" errors
    // in serverless environments where the container might be reused.
    const server = createMCPServer();
    
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

export async function GET(req: NextRequest) {
  try {
    const server = createMCPServer();
    
    // For SSE, we need a session ID generator
    const transport = new WebStandardStreamableHTTPServerTransport();
    
    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (error) {
    console.error('MCP GET error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
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
