import { NextRequest, NextResponse } from 'next/server';
import { createMCPServer } from '@/mcp-server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

/**
 * MCP endpoint for Next.js App Router.
 * Handles POST requests for MCP tools/resources/prompts.
 */

export async function POST(req: NextRequest) {
  try {
    // Create a fresh server instance per request to avoid "Already connected" errors
    // in serverless environments where the container might be reused.
    const server = createMCPServer();
    
    // Use the web-standard transport suitable for Next.js Edge/Serverless functions
    const transport = new WebStandardStreamableHTTPServerTransport();
    
    await server.connect(transport);
    
    // Handle the request
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

/**
 * GET handler for status check.
 * Vercel Serverless Functions have limited support for long-lived SSE connections.
 */
export async function GET() {
  return NextResponse.json({ 
    status: 'MCP endpoint active', 
    version: '1.0.0',
    transport: 'WebStandardStreamableHTTPServerTransport (POST only)'
  });
}

/**
 * OPTIONS handler for CORS preflight requests.
 */
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
