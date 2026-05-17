import type { NextRequest } from 'next/server';
import { MCPServer } from '../src/mcp-server';
import { loadMCPConfiguration } from '../src/mcp-server-helper';

export const dynamic = 'force-dynamic';

// Store the server instance globally
let serverInstance: MCPServer | null = null;

function getServer(): MCPServer {
  if (!serverInstance) {
    const configResult = loadMCPConfiguration();
    
    // If configuration failed, throw and let error handling deal with it
    if ('error' in configResult) {
      throw new Error(configResult.error);
    }
    
    serverInstance = new MCPServer(configResult);
  }
  return serverInstance;
}

export async function GET(request: NextRequest) {
  try {
    const server = getServer();
    return server.handleSSE(request);
  } catch (error) {
    console.error('SSE handler error:', error);
    return new Response('Service unavailable: Bluesky credentials not configured. Please ensure BSKY_IDENTIFIER and BSKY_PASSWORD are set.', { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const server = getServer();
    const body = await request.json();
    return server.handlePOST(body);
  } catch (error) {
    console.error('MCP POST handler error:', error);
    return new Response(JSON.stringify({ error: 'Invalid request or Bluesky credentials not configured' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
