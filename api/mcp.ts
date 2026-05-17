/**
 * MCP Route Handler - Streamable HTTP transport for MCP protocol
 * Supports POST (messages), GET (SSE), and DELETE (session termination)
 */

import type { NextRequest } from 'next/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMCPServer } from '../../src/mcp-server.js';
import { loadMCPConfiguration } from '../../src/mcp-server-helper.js';

// Store for active transports (in production, use Redis or similar)
const activeTransports = new Map<string, StreamableHTTPServerTransport>();

/**
 * POST /api/mcp - Handle JSON-RPC messages
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    // Validate credentials first
    const configResult = loadMCPConfiguration();
    if ('error' in configResult) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: configResult.error
          },
          id: null
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'X-Content-Type-Options': 'nosniff'
          }
        }
      );
    }

    // Create fresh server instance for stateless operation
    const server = createMCPServer(configResult);

    // Create transport for this request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID()
    });

    // Connect server to transport
    await server.connect(transport);

    // Extract session ID from header if present
    const sessionId = request.headers.get('mcp-session-id');

    // Store transport for potential session management
    if (sessionId) {
      activeTransports.set(sessionId, transport);
    }

    // Get request body
    const body = await request.json();

    // Handle the request
    const response = await transport.handleRequest(request, null, body);

    return response;
  } catch (error) {
    console.error('MCP POST error:', error);
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff'
        }
      }
    );
  }
}

/**
 * GET /api/mcp - SSE channel for server-initiated messages
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    // Validate credentials first
    const configResult = loadMCPConfiguration();
    if ('error' in configResult) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: configResult.error
          },
          id: null
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'X-Content-Type-Options': 'nosniff'
          }
        }
      );
    }

    const sessionId = request.headers.get('mcp-session-id');

    // Check for existing session
    if (sessionId) {
      const existingTransport = activeTransports.get(sessionId);
      if (existingTransport) {
        const response = await existingTransport.handleRequest(request, null, null);
        return response;
      }
    }

    // Create new session
    const server = createMCPServer(configResult);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID()
    });

    await server.connect(transport);

    // Store for potential session management
    const newSessionId = transport.sessionId;
    if (newSessionId) {
      activeTransports.set(newSessionId, transport);
    }

    const response = await transport.handleRequest(request, null, null);
    return response;
  } catch (error) {
    console.error('MCP GET error:', error);
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
}

/**
 * DELETE /api/mcp - Session termination
 */
export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const sessionId = request.headers.get('mcp-session-id');

    if (sessionId) {
      const transport = activeTransports.get(sessionId);
      if (transport) {
        await transport.handleRequest(request, null, null);
        activeTransports.delete(sessionId);
      }
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('MCP DELETE error:', error);
    return new Response(null, { status: 204 });
  }
}
