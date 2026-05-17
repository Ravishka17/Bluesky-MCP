import type { NextRequest } from 'next/server';
import { MCPServer } from '../src/mcp-server';
import { loadMCPConfiguration } from '../src/mcp-server-helper';
import { createInvalidMethodResponse, createErrorResponse } from '../src/utils';

export const dynamic = 'force-dynamic';

// Store the server instance globally
let serverInstance: MCPServer | null = null;

function getServer(): MCPServer {
  if (!serverInstance) {
    const config = loadMCPConfiguration();
    serverInstance = new MCPServer(config);
  }
  return serverInstance;
}

// MCP endpoint handler
export async function GET(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.MCP_API_TOKEN;
  
  if (!expectedToken) {
    return createErrorResponse('MCP_API_TOKEN is not configured on the server', 503);
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return createErrorResponse('Missing or invalid Authorization header', 401);
  }
  
  const token = authHeader.slice(7);
  if (token !== expectedToken) {
    return createErrorResponse('Invalid API token', 403);
  }

  try {
    const server = getServer();
    return server.handleSSE(request);
  } catch (error) {
    console.error('SSE handler error:', error);
    return createErrorResponse('SSE connection failed', 500);
  }
}

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('Authorization');
  const expectedToken = process.env.MCP_API_TOKEN;
  
  if (!expectedToken) {
    return createErrorResponse('MCP_API_TOKEN is not configured on the server', 503);
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return createErrorResponse('Missing or invalid Authorization header', 401);
  }
  
  const token = authHeader.slice(7);
  if (token !== expectedToken) {
    return createErrorResponse('Invalid API token', 403);
  }

  try {
    const server = getServer();
    const body = await request.json();
    return server.handlePOST(body);
  } catch (error) {
    console.error('MCP POST handler error:', error);
    return createErrorResponse('Invalid request body', 400);
  }
}
